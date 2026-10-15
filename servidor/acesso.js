/**
 * Quem pode entrar: usuários, senhas e sessões.
 *
 * É a porta da frente do atendimento: sem uma sessão válida, a API não
 * responde. O webhook do WhatsApp fica de fora de propósito — quem chama é
 * a Meta, e ela se identifica pela assinatura, não por senha.
 *
 * Decisões que valem saber:
 *  - senha nunca é guardada: guarda-se o scrypt dela com um sal por pessoa;
 *  - a sessão vive num cookie HttpOnly. No disco fica só o hash do token —
 *    quem copiar o arquivo dados/sessoes.json não consegue usar a sessão
 *    de ninguém;
 *  - não existe "esqueci a senha" por e-mail (o sistema não manda e-mail):
 *    quem administra redefine a senha da pessoa em Ajustes → Equipe;
 *  - a primeira conta é criada pela própria tela de entrada, uma vez só,
 *    enquanto não existe ninguém — e já nasce administradora. Não há modo
 *    "sem senha": sem sessão, a API não responde;
 *  - senha certa NÃO abre sessão: abre uma "vez pendente" na memória, e só o
 *    código de 6 dígitos (verificação em duas etapas, ver totp.js) troca
 *    isso por uma sessão de verdade. No primeiro login de cada pessoa a
 *    etapa é o pareamento do celular, por QR Code. Não há como entrar sem;
 *  - quem perde o celular entra com um dos 8 códigos de recuperação. Perdeu
 *    tudo? Quem administra refaz a etapa da pessoa em Ajustes → Equipe — ou,
 *    se for a única conta, o script scripts/redefinir-2fa.js.
 *
 * Este arquivo é dono das coleções "usuarios" e "sessoes" — as únicas que
 * não passam por estado.js, porque não são assunto do atendimento.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import * as banco from './armazenamento.js'
import { PASTA_DADOS } from './config.js'
import { id, agora } from './ids.js'
import {
  gerarCodigosDeRecuperacao,
  gerarSegredo,
  hashDeRecuperacao,
  uriOtpauth,
  verificar,
} from './totp.js'
import { qrComoImagem } from './qr.js'

const PASTA_USUARIOS = path.join(PASTA_DADOS, 'usuarios')

function arquivoFoto(usuarioId) {
  return path.join(PASTA_USUARIOS, `${usuarioId}.jpg`)
}

/** A foto de perfil de alguém. `null` se nunca mandou uma. */
export function obterFoto(usuarioId) {
  try {
    return fs.readFileSync(arquivoFoto(usuarioId))
  } catch {
    return null
  }
}

export function salvarFoto(usuarioId, bytes) {
  fs.mkdirSync(PASTA_USUARIOS, { recursive: true })
  fs.writeFileSync(arquivoFoto(usuarioId), bytes)
}

export function apagarFoto(usuarioId) {
  fs.rmSync(arquivoFoto(usuarioId), { force: true })
}

const COOKIE = 'sessao'
const DIA = 24 * 60 * 60 * 1000
/** Sem "continuar conectado": o cookie morre com o navegador e o servidor esquece em um dia. */
const DURACAO_CURTA = 1 * DIA
/** Com "continuar conectado": trinta dias. */
const DURACAO_LEMBRAR = 30 * DIA
const SENHA_MINIMA = 8

if (banco.obter('usuarios') == null) banco.definir('usuarios', [])
if (banco.obter('sessoes') == null) banco.definir('sessoes', [])

/* ------------------------------------------------------------------ */
/* Senhas                                                              */
/* ------------------------------------------------------------------ */

function gerarHash(senha) {
  const sal = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(senha, sal, 64).toString('hex')
  return `scrypt$${sal}$${hash}`
}

function senhaConfere(senha, guardado) {
  const [, sal, hash] = String(guardado || '').split('$')
  if (!sal || !hash) return false
  const tentativa = crypto.scryptSync(senha, sal, 64)
  const certo = Buffer.from(hash, 'hex')
  return tentativa.length === certo.length && crypto.timingSafeEqual(tentativa, certo)
}

/* ------------------------------------------------------------------ */
/* Usuários                                                            */
/* ------------------------------------------------------------------ */

export function usuarios() {
  return banco.obter('usuarios')
}

/** Já existe alguém cadastrado? Enquanto não, a tela de entrada oferece o primeiro acesso. */
export function configurado() {
  return usuarios().length > 0
}

export function usuario(usuarioId) {
  return usuarios().find((u) => u.id === usuarioId) || null
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function porEmail(email) {
  const alvo = normalizarEmail(email)
  return usuarios().find((u) => u.email === alvo) || null
}

/** O que pode sair para a tela: nunca o hash, nunca o segredo do celular. */
export function publico(u) {
  if (!u) return null
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    criadoEm: u.criadoEm,
    doisPassos: Boolean(u.totp),
    codigosRestantes: (u.recuperacao || []).length,
  }
}

export function validarNovo({ nome, email, senha }) {
  if (!String(nome || '').trim()) return 'Escreva o nome da pessoa.'
  const e = normalizarEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Esse e-mail não parece válido.'
  if (porEmail(e)) return 'Já existe alguém com esse e-mail.'
  if (String(senha || '').length < SENHA_MINIMA) {
    return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`
  }
  return null
}

export function criarUsuario({ nome, email, senha, papel }) {
  const novo = {
    id: id('usr-'),
    nome: String(nome).trim(),
    email: normalizarEmail(email),
    papel: papel === 'admin' ? 'admin' : 'atendente',
    senhaHash: gerarHash(String(senha)),
    criadoEm: agora(),
  }
  const lista = usuarios()
  lista.push(novo)
  banco.definir('usuarios', lista)
  return publico(novo)
}

/**
 * Muda nome, papel ou senha. Devolve uma mensagem de erro quando a mudança
 * deixaria o sistema sem ninguém para administrar.
 */
export function atualizarUsuario(usuarioId, { nome, papel, senha }) {
  const lista = usuarios()
  const alvo = lista.find((u) => u.id === usuarioId)
  if (!alvo) return { erro: 'Pessoa não encontrada.' }

  if (papel !== undefined && papel !== 'admin' && alvo.papel === 'admin') {
    const outrosAdmins = lista.filter((u) => u.papel === 'admin' && u.id !== usuarioId).length
    if (!outrosAdmins) return { erro: 'Precisa sobrar pelo menos uma pessoa administrando.' }
  }
  if (senha !== undefined && String(senha).length < SENHA_MINIMA) {
    return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` }
  }

  if (nome !== undefined && String(nome).trim()) alvo.nome = String(nome).trim()
  if (papel !== undefined) alvo.papel = papel === 'admin' ? 'admin' : 'atendente'
  if (senha !== undefined) {
    alvo.senhaHash = gerarHash(String(senha))
    // senha nova derruba as sessões antigas dessa pessoa — inclusive de quem a conhecia
    banco.definir('sessoes', sessoes().filter((s) => s.usuarioId !== usuarioId))
    esquecerPendentesDe(usuarioId)
  }
  banco.definir('usuarios', lista)
  return { usuario: publico(alvo) }
}

export function apagarUsuario(usuarioId) {
  const lista = usuarios()
  const alvo = lista.find((u) => u.id === usuarioId)
  if (!alvo) return { erro: 'Pessoa não encontrada.' }
  if (alvo.papel === 'admin' && !lista.some((u) => u.papel === 'admin' && u.id !== usuarioId)) {
    return { erro: 'Precisa sobrar pelo menos uma pessoa administrando.' }
  }
  banco.definir('usuarios', lista.filter((u) => u.id !== usuarioId))
  banco.definir('sessoes', sessoes().filter((s) => s.usuarioId !== usuarioId))
  esquecerPendentesDe(usuarioId)
  return { ok: true }
}

/**
 * Apaga o celular pareado e os códigos de recuperação de alguém. No próximo
 * login ela cai de novo no QR Code. É o que quem administra faz quando a
 * pessoa trocou de celular ou perdeu tudo. Derruba as sessões abertas: um
 * celular que sumiu é justamente o caso em que a sessão não é de confiança.
 */
export function redefinirDuasEtapas(usuarioId) {
  const alvo = usuario(usuarioId)
  if (!alvo) return { erro: 'Pessoa não encontrada.' }
  delete alvo.totp
  delete alvo.totpPendente
  delete alvo.recuperacao
  banco.definir('usuarios', usuarios())
  banco.definir('sessoes', sessoes().filter((s) => s.usuarioId !== usuarioId))
  esquecerPendentesDe(usuarioId)
  return { usuario: publico(alvo) }
}

/* ------------------------------------------------------------------ */
/* Sessões                                                             */
/* ------------------------------------------------------------------ */

function sessoes() {
  return banco.obter('sessoes')
}

function hashDoToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function limparVencidas() {
  const t = Date.now()
  const todas = sessoes()
  const vivas = todas.filter((s) => new Date(s.expiraEm).getTime() > t)
  if (vivas.length !== todas.length) banco.definir('sessoes', vivas)
}

function lerCookie(req, nome = COOKIE) {
  const bruto = req.headers.cookie || ''
  for (const parte of bruto.split(';')) {
    const [chave, ...resto] = parte.trim().split('=')
    if (chave === nome) return decodeURIComponent(resto.join('='))
  }
  return ''
}

function opcoesDeCookie(req) {
  const seguro = req.secure || req.get('x-forwarded-proto') === 'https'
  return { httpOnly: true, sameSite: 'lax', secure: seguro, path: '/' }
}

function abrirSessao(req, res, usuarioId, lembrar) {
  const token = crypto.randomBytes(32).toString('hex')
  const duracao = lembrar ? DURACAO_LEMBRAR : DURACAO_CURTA
  const lista = sessoes()
  lista.push({
    hash: hashDoToken(token),
    usuarioId,
    criadaEm: agora(),
    expiraEm: new Date(Date.now() + duracao).toISOString(),
  })
  banco.definir('sessoes', lista)

  const opcoes = opcoesDeCookie(req)
  // sem "lembrar", o cookie é de sessão: some quando o navegador fecha
  if (lembrar) opcoes.maxAge = duracao
  res.cookie(COOKIE, token, opcoes)
}

function fecharSessao(req, res) {
  const token = lerCookie(req)
  if (token) {
    const h = hashDoToken(token)
    banco.definir('sessoes', sessoes().filter((s) => s.hash !== h))
  }
  res.clearCookie(COOKIE, { path: '/' })
  // sair no meio do caminho (na tela do código) também desfaz a vez pendente
  const pendente = lerCookie(req, COOKIE_PENDENTE)
  if (pendente) pendentes.delete(hashDoToken(pendente))
  res.clearCookie(COOKIE_PENDENTE, { path: '/' })
}

/* ------------------------------------------------------------------ */
/* Vez pendente: senha certa, falta o segundo fator                    */
/* ------------------------------------------------------------------ */

const COOKIE_PENDENTE = 'pendente'
const PENDENTE_DURACAO = 10 * 60 * 1000
/** Códigos errados seguidos até a pessoa perder a vez e ter de digitar a senha de novo. */
const MAX_ERROS = 5

/**
 * Hash do token → { usuarioId, lembrar, erros, expiraEm }.
 * Só na memória, de propósito: reiniciar o servidor derruba todo mundo que
 * estava no meio da entrada, e ninguém perde nada com isso.
 */
const pendentes = new Map()

/** O nome que aparece no aplicativo autenticador, ao lado do e-mail. */
function emissor() {
  return banco.obter('ajustes')?.nomeDaCasa || 'Brotherhood Cursos'
}

function limparPendentes() {
  const t = Date.now()
  for (const [hash, p] of pendentes) if (p.expiraEm <= t) pendentes.delete(hash)
}

function esquecerPendentesDe(usuarioId) {
  for (const [hash, p] of pendentes) if (p.usuarioId === usuarioId) pendentes.delete(hash)
}

/** A senha conferiu: abre a vez pendente e manda o cookie dela. */
export function iniciarDuasEtapas(req, res, usuarioId, lembrar) {
  limparPendentes()
  const token = crypto.randomBytes(32).toString('hex')
  pendentes.set(hashDoToken(token), {
    usuarioId,
    lembrar: Boolean(lembrar),
    erros: 0,
    expiraEm: Date.now() + PENDENTE_DURACAO,
  })
  res.cookie(COOKIE_PENDENTE, token, opcoesDeCookie(req))
}

/** Quem está no meio da entrada, ou null. A etapa vem do cadastro, não do cookie. */
function pendenteDe(req) {
  limparPendentes()
  const token = lerCookie(req, COOKIE_PENDENTE)
  if (!token) return null
  const hash = hashDoToken(token)
  const p = pendentes.get(hash)
  if (!p) return null
  const u = usuario(p.usuarioId)
  if (!u) {
    pendentes.delete(hash)
    return null
  }
  // "configurar" enquanto o celular não foi pareado; "codigo" depois disso
  return { hash, p, usuario: u, etapa: u.totp ? 'codigo' : 'configurar' }
}

function encerrarPendente(res, hash) {
  pendentes.delete(hash)
  res.clearCookie(COOKIE_PENDENTE, { path: '/' })
}

/** Conta um código errado. No quinto, a vez acaba. Devolve true se acabou. */
function contarErro(res, pend) {
  pend.p.erros += 1
  if (pend.p.erros < MAX_ERROS) return false
  encerrarPendente(res, pend.hash)
  return true
}

/** A pessoa por trás da requisição, ou null. */
export function sessaoDe(req) {
  const token = lerCookie(req)
  if (!token) return null
  limparVencidas()
  const h = hashDoToken(token)
  const s = sessoes().find((x) => x.hash === h)
  if (!s) return null
  const u = usuario(s.usuarioId)
  return u ? { sessao: s, usuario: u } : null
}

/** Só passa quem tem sessão: sem ela a API responde 401. */
export function exigirSessao(req, res, next) {
  const s = sessaoDe(req)
  if (!s) return res.status(401).json({ erro: 'Sua sessão acabou. Entre de novo.' })
  req.usuario = s.usuario
  next()
}

export function exigirAdmin(req, res, next) {
  if (req.usuario?.papel !== 'admin') {
    return res.status(403).json({ erro: 'Só quem administra o sistema pode fazer isso.' })
  }
  next()
}

/* ------------------------------------------------------------------ */
/* Freio contra tentativa em massa                                     */
/* ------------------------------------------------------------------ */

const tentativas = new Map()

/** Devolve false quando a chave já passou de 20 tentativas em 15 minutos. */
function freio(chave) {
  const t = Date.now()
  const registro = tentativas.get(chave)
  if (registro && registro.ate > t) {
    if (registro.n >= 20) return false
    registro.n += 1
    return true
  }
  tentativas.set(chave, { n: 1, ate: t + 15 * 60 * 1000 })
  return true
}

/* ------------------------------------------------------------------ */
/* Rotas de sessão (as únicas da API que não exigem estar logado)      */
/* ------------------------------------------------------------------ */

export const rotasSessao = express.Router()

const MSG_MUITAS = 'Muitas tentativas seguidas. Espere uns minutos e tente de novo.'
const MSG_RECOMECAR = 'Essa entrada expirou. Digite e-mail e senha de novo.'
const MSG_CODIGO =
  'Código incorreto. Confira se a hora do celular está no automático e use o código que está aparecendo agora.'
const MSG_CODIGO_USADO =
  'Esse código já foi usado para entrar. Espere o aplicativo mostrar o próximo (até 30 segundos) e digite o novo.'
const MSG_FIM_DAS_CHANCES = 'Muitos códigos errados. Digite e-mail e senha de novo.'

/**
 * Por que o código foi recusado. "Já foi usado" é o caso mais comum de código
 * certo recusado: quem sai e entra de novo em menos de um minuto digita o
 * mesmo número, e só o mesmo número seria aceito se o servidor não guardasse
 * o último passo usado.
 */
function motivoDoCodigo(totp, codigo) {
  return verificar(totp.segredo, codigo, 0) !== null ? MSG_CODIGO_USADO : MSG_CODIGO
}

/** O retrato de quem está do outro lado: logado, no meio da entrada ou ninguém. */
function resposta({ usuario: u = null, pendente = null, extra = {} } = {}) {
  return {
    configurado: configurado(),
    usuario: publico(u),
    etapa: pendente ? pendente.etapa : null,
    pendente: pendente ? { nome: pendente.usuario.nome, email: pendente.usuario.email } : null,
    ...extra,
  }
}

rotasSessao.get('/', (req, res) => {
  const s = sessaoDe(req)
  res.json(s ? resposta({ usuario: s.usuario }) : resposta({ pendente: pendenteDe(req) }))
})

/**
 * Cria a primeira conta — administradora — e só funciona enquanto não existe
 * ninguém. Não abre sessão: cai na mesma vez pendente de todo mundo, e o
 * primeiro passo é parear o celular por QR Code.
 *
 * Quem alcançar o endereço do sistema antes de alguém fazer isso consegue
 * criar a conta: por isso o primeiro acesso deve ser feito logo depois de
 * instalar, e antes de expor o sistema fora da rede da escola.
 */
rotasSessao.post('/primeiro-acesso', (req, res) => {
  if (!freio(req.ip)) return res.status(429).json({ erro: MSG_MUITAS })
  if (configurado()) {
    return res.status(403).json({ erro: 'O sistema já tem quem administre. Entre com e-mail e senha.' })
  }
  const corpo = req.body || {}
  const erro = validarNovo(corpo)
  if (erro) return res.status(400).json({ erro })
  const criada = criarUsuario({ ...corpo, papel: 'admin' })
  iniciarDuasEtapas(req, res, criada.id, true)
  res.json(resposta({ pendente: { usuario: criada, etapa: 'configurar' } }))
})

rotasSessao.post('/entrar', (req, res) => {
  if (!freio(req.ip)) return res.status(429).json({ erro: MSG_MUITAS })
  const { email, senha, lembrar } = req.body || {}
  const u = porEmail(email)
  if (!u || !senhaConfere(String(senha || ''), u.senhaHash)) {
    return res.status(401).json({ erro: 'E-mail ou senha não conferem.' })
  }
  // senha certa não basta: a sessão só abre depois do código de 6 dígitos
  iniciarDuasEtapas(req, res, u.id, lembrar)
  res.json(resposta({ pendente: { usuario: u, etapa: u.totp ? 'codigo' : 'configurar' } }))
})

rotasSessao.post('/sair', (req, res) => {
  fecharSessao(req, res)
  res.json({ ok: true })
})

/* ------------------------- pareamento (QR Code) ------------------------- */

/**
 * Gera o segredo e o QR do celular — e devolve SEMPRE o mesmo até o primeiro
 * código ser aceito. O segredo fica guardado no cadastro da pessoa
 * (`totpPendente`), não só na vez de entrada: quem escaneia o QR e fecha a
 * página antes de digitar o código reencontra o mesmo QR no próximo login, e
 * a entrada que já criou no autenticador continua valendo. Se o QR mudasse a
 * cada login, ela ficaria com uma entrada morta e confusa no celular.
 */
rotasSessao.post('/2fa/iniciar', async (req, res, proximo) => {
  try {
    const pend = pendenteDe(req)
    if (!pend) return res.status(401).json({ erro: MSG_RECOMECAR })
    if (pend.etapa !== 'configurar') {
      return res.status(400).json({ erro: 'Esta conta já tem um celular pareado.' })
    }
    if (!pend.usuario.totpPendente) {
      pend.usuario.totpPendente = gerarSegredo()
      banco.definir('usuarios', usuarios())
    }
    const segredo = pend.usuario.totpPendente
    const uri = uriOtpauth({ segredo, email: pend.usuario.email, emissor: emissor() })
    res.json({ qr: await qrComoImagem(uri), segredo })
  } catch (erro) {
    proximo(erro)
  }
})

/** A pessoa digitou o primeiro código: o celular está pareado de verdade. */
rotasSessao.post('/2fa/confirmar', (req, res) => {
  if (!freio(`2fa:${req.ip}`)) return res.status(429).json({ erro: MSG_MUITAS })
  const pend = pendenteDe(req)
  if (!pend || pend.etapa !== 'configurar' || !pend.usuario.totpPendente) {
    return res.status(401).json({ erro: MSG_RECOMECAR })
  }

  const passo = verificar(pend.usuario.totpPendente, req.body?.codigo)
  if (passo === null) {
    const acabou = contarErro(res, pend)
    return res.status(401).json({ erro: acabou ? MSG_FIM_DAS_CHANCES : MSG_CODIGO })
  }

  const u = pend.usuario
  const { codigos, hashes } = gerarCodigosDeRecuperacao()
  u.totp = { segredo: u.totpPendente, ativadoEm: agora(), ultimoPasso: passo }
  delete u.totpPendente
  u.recuperacao = hashes
  banco.definir('usuarios', usuarios())

  const lembrar = pend.p.lembrar
  encerrarPendente(res, pend.hash)
  abrirSessao(req, res, u.id, lembrar)
  // os códigos de recuperação saem em claro esta única vez
  res.json({ sessao: resposta({ usuario: u }), codigos })
})

/* ------------------------- entrada de todo dia ------------------------- */

/** O código do app — ou, para quem perdeu o celular, um código de recuperação. */
rotasSessao.post('/2fa/verificar', (req, res) => {
  if (!freio(`2fa:${req.ip}`)) return res.status(429).json({ erro: MSG_MUITAS })
  const pend = pendenteDe(req)
  if (!pend || pend.etapa !== 'codigo') return res.status(401).json({ erro: MSG_RECOMECAR })

  const u = pend.usuario
  const { codigo, recuperacao } = req.body || {}
  let passou = false
  let usouRecuperacao = false

  if (recuperacao) {
    const lista = u.recuperacao || []
    const i = lista.indexOf(hashDeRecuperacao(recuperacao))
    if (i >= 0) {
      // uso único: o código sai da lista na hora
      lista.splice(i, 1)
      u.recuperacao = lista
      passou = true
      usouRecuperacao = true
    }
  } else {
    const passo = verificar(u.totp.segredo, codigo, u.totp.ultimoPasso)
    if (passo !== null) {
      u.totp.ultimoPasso = passo
      passou = true
    }
  }

  if (!passou) {
    const acabou = contarErro(res, pend)
    const msg = recuperacao
      ? 'Esse código de recuperação não confere ou já foi usado.'
      : motivoDoCodigo(u.totp, codigo)
    return res.status(401).json({ erro: acabou ? MSG_FIM_DAS_CHANCES : msg })
  }

  banco.definir('usuarios', usuarios())
  const lembrar = pend.p.lembrar
  encerrarPendente(res, pend.hash)
  abrirSessao(req, res, u.id, lembrar)
  const extra = usouRecuperacao ? { codigosRestantes: (u.recuperacao || []).length } : {}
  res.json(resposta({ usuario: u, extra }))
})

/** Já logada, a pessoa pede um jogo novo de códigos de recuperação (o antigo morre). */
rotasSessao.post('/2fa/novos-codigos', exigirSessao, (req, res) => {
  if (!freio(`2fa:${req.ip}`)) return res.status(429).json({ erro: MSG_MUITAS })
  const u = req.usuario
  if (!u?.totp) return res.status(400).json({ erro: 'Esta conta ainda não tem o celular pareado.' })

  const passo = verificar(u.totp.segredo, req.body?.codigo, u.totp.ultimoPasso)
  if (passo === null) return res.status(400).json({ erro: motivoDoCodigo(u.totp, req.body?.codigo) })

  const { codigos, hashes } = gerarCodigosDeRecuperacao()
  u.totp.ultimoPasso = passo
  u.recuperacao = hashes
  banco.definir('usuarios', usuarios())
  res.json({ codigos, usuario: publico(u) })
})

/** A própria pessoa trocando a própria senha. */
rotasSessao.put('/senha', exigirSessao, (req, res) => {
  const { atual, nova } = req.body || {}
  if (!senhaConfere(String(atual || ''), req.usuario.senhaHash)) {
    return res.status(400).json({ erro: 'A senha atual não confere.' })
  }
  const resultado = atualizarUsuario(req.usuario.id, { senha: String(nova || '') })
  if (resultado.erro) return res.status(400).json({ erro: resultado.erro })
  // a troca derrubou todas as sessões, inclusive esta: abre uma nova
  abrirSessao(req, res, req.usuario.id, true)
  res.json({ ok: true })
})

/** A própria pessoa trocando o próprio nome. */
rotasSessao.put('/perfil', exigirSessao, (req, res) => {
  const resultado = atualizarUsuario(req.usuario.id, { nome: req.body?.nome })
  if (resultado.erro) return res.status(400).json({ erro: resultado.erro })
  res.json(resultado.usuario)
})

/** A própria foto de perfil. A tela já manda redimensionada; aqui só guarda. */
rotasSessao.put('/foto', exigirSessao, (req, res) => {
  const casa = /^data:image\/(?:png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(String(req.body?.fotoBase64 || ''))
  if (!casa) return res.status(400).json({ erro: 'Imagem inválida.' })
  try {
    salvarFoto(req.usuario.id, Buffer.from(casa[1], 'base64'))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: 'Não consegui salvar a foto.' })
  }
})

rotasSessao.delete('/foto', exigirSessao, (req, res) => {
  apagarFoto(req.usuario.id)
  res.json({ ok: true })
})
