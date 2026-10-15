/**
 * Conexões de WhatsApp por QR Code — a API NÃO OFICIAL (WhatsApp Web).
 *
 * Cada conexão é um número de telefone ligado ao sistema do mesmo jeito que
 * se liga o WhatsApp Web: a pessoa lê um QR Code no celular, em
 * Configurações → Dispositivos conectados, e o sistema passa a ser um
 * "aparelho vinculado" daquele número. Sem Meta Business, sem token, sem
 * webhook. O preço é que não é a API oficial: o WhatsApp pode restringir
 * números que parecem automatizados. A biblioteca é o Baileys.
 *
 * O que este arquivo cuida:
 *  - criar, retomar, reconectar e remover as sessões;
 *  - o QR Code (que o WhatsApp renova a cada ~20 s) e o estado de cada
 *    número, avisados à tela em tempo real;
 *  - receber mensagens e entregá-las ao atendimento (atendimento.js), e
 *    enviar as respostas;
 *  - perceber quando um humano responde pelo próprio celular;
 *  - sincronizar: ao ler o QR de um número novo, o celular manda sozinho as
 *    conversas recentes e a agenda de contatos; isto as entrega ao atendimento
 *    e guarda os nomes. (O histórico COMPLETO não é possível: o WhatsApp
 *    recusa o pedido — ver a fábrica do socket.)
 *
 * Quem decide o que fazer com cada mensagem é o atendimento — este arquivo
 * só fala com o WhatsApp. A ponte é `ligarOuvintes`, chamada no index.js.
 *
 * As credenciais de cada número ficam em dados/conexoes/<id>/ (a chave que
 * prova que este sistema é um aparelho vinculado), junto com os nomes dos
 * contatos (contatos.json). Quem copia essa pasta copia o acesso ao número e
 * a agenda dele: ela não vai para repositório nem para e-mail.
 */
import fs from 'node:fs'
import path from 'node:path'
import pino from 'pino'
import {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  generateMessageID,
  isJidBot,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isLidUser,
  isPnUser,
  jidDecode,
  makeCacheableSignalKeyStore,
  makeWASocket,
  proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import * as banco from './armazenamento.js'
import { PASTA_DADOS } from './config.js'
import { id, agora } from './ids.js'
import { publicar } from './eventos.js'
import { qrComoImagem } from './qr.js'

const PASTA_CONEXOES = path.join(PASTA_DADOS, 'conexoes')

/**
 * Sincronização do histórico. O celular manda tudo de uma vez, em partes,
 * logo depois da leitura do QR — e não existe um sinal único de "acabou".
 * Vale o silêncio: SINC_OCIOSO_MS sem chegar parte nova encerra; e se nem a
 * primeira parte chegar em SINC_ESPERA_MS, o celular não vai enviar.
 */
const SINC_ESPERA_MS = Number(process.env.SINC_ESPERA_MS) || 180_000
const SINC_OCIOSO_MS = Number(process.env.SINC_OCIOSO_MS) || 90_000

if (banco.obter('conexoes') == null) banco.definir('conexoes', [])

/**
 * Estado da conexão: iniciando · aguardando-qr · conectando · conectada ·
 * desconectada (iniciando = abrindo a sessão pela primeira vez; conectando =
 * voltando depois de uma queda ou de um reinício do sistema).
 *
 * Estado da sincronização (cx.sincronizacao.estado):
 *   desligada      — a pessoa escolheu não sincronizar este número;
 *   aguardando     — número recém-lido; esperando o celular mandar o histórico;
 *   sincronizando  — chegando conversas;
 *   concluida      — pararam de chegar partes;
 *   indisponivel   — o celular não mandou nada (depende do WhatsApp dele);
 *   interrompida   — o sistema reiniciou no meio.
 */

function novaSincronizacao(ligada) {
  return {
    estado: ligada ? 'aguardando' : 'desligada',
    conversas: 0,
    mensagens: 0,
    progresso: null,
    iniciadaEm: null,
    concluidaEm: null,
  }
}

/* ------------------------------------------------------------------ */
/* Cadastro (o que sobrevive a reiniciar o sistema)                    */
/* ------------------------------------------------------------------ */

function lista() {
  return banco.obter('conexoes')
}

function achar(conexaoId) {
  return lista().find((c) => c.id === conexaoId) || null
}

function pastaDe(conexaoId) {
  return path.join(PASTA_CONEXOES, conexaoId)
}

function salvarCadastro() {
  banco.definir('conexoes', lista())
}

function nomeValido(nome) {
  const limpo = String(nome || '').trim()
  if (!limpo) return { erro: 'Dê um nome para identificar este número (ex.: Atendimento).' }
  if (limpo.length > 60) return { erro: 'O nome pode ter no máximo 60 caracteres.' }
  return { nome: limpo }
}

/* ------------------------------------------------------------------ */
/* Estado em memória (o que muda a cada segundo)                       */
/* ------------------------------------------------------------------ */

/** conexaoId → { sock, estado, motivo, qr, tentativas, timer, encerrando, abrindo, enviadas } */
const rts = new Map()

function rt(conexaoId) {
  let r = rts.get(conexaoId)
  if (!r) {
    r = {
      sock: null,
      estado: 'desconectada',
      motivo: '',
      qr: null,
      tentativas: 0,
      timer: null,
      encerrando: false,
      abrindo: false,
      /** ids das mensagens que NÓS enviamos: o eco delas não é "humano respondendo pelo celular". */
      enviadas: new Set(),
    }
    rts.set(conexaoId, r)
  }
  return r
}

/**
 * O que a tela pode ver de uma conexão. O QR só sai com `comQr` — e quem
 * pede isso é só quem administra (ver rotas.js): ele é uma credencial.
 */
function publica(cx, { comQr = false } = {}) {
  const r = rts.get(cx.id)
  return {
    id: cx.id,
    nome: cx.nome,
    telefone: cx.telefone || '',
    estado: r?.estado || 'desconectada',
    motivo: r?.motivo || '',
    vinculada: Boolean(cx.vinculada),
    conectadaEm: cx.conectadaEm || null,
    criadaEm: cx.criadaEm,
    /** Importa o histórico que o celular enviar na leitura do QR? */
    sincronizar: cx.sincronizar !== false,
    sincronizacao: cx.sincronizacao || novaSincronizacao(false),
    ...(comQr ? { qr: r?.qr || null } : {}),
  }
}

export function listar({ comQr = false } = {}) {
  return lista().map((cx) => publica(cx, { comQr }))
}

export function conectada(conexaoId) {
  return rts.get(conexaoId)?.estado === 'conectada'
}

export function quantasConectadas() {
  return [...rts.values()].filter((r) => r.estado === 'conectada').length
}

/** Muda o estado e avisa a tela: o estado para todos, o QR só para quem administra. */
function mudar(conexaoId, mudancas) {
  const cx = achar(conexaoId)
  if (!cx) return
  const r = rt(conexaoId)
  const qrAntes = r.qr
  Object.assign(r, mudancas)
  publicar('conexao', publica(cx))
  if (r.qr !== qrAntes) publicar('conexao-qr', { id: conexaoId, qr: r.qr }, { soAdmin: true })
}

/* ------------------------------------------------------------------ */
/* Quem recebe o que chega (o atendimento — ligado no index.js)         */
/* ------------------------------------------------------------------ */

let ouvintes = {
  /** (recebidas[], conexaoId) — mensagens de clientes. */
  aoReceber: async () => {},
  /** (conexaoId, mensagem) — um humano respondeu pelo próprio celular. */
  aoResponderPeloCelular: async () => {},
  /** (status[]) — entregue / lida / falhou, das mensagens que enviamos. */
  aoMudarStatus: () => {},
  /** (conexaoId, lote[]) → { conversas, mensagens } — histórico trazido do celular. */
  aoSincronizar: async () => ({ conversas: 0, mensagens: 0 }),
  /** (conexaoId, mudancas[]) — nomes de contatos que o WhatsApp informou depois. */
  aoDescobrirNomes: () => {},
}

export function ligarOuvintes(novos) {
  ouvintes = { ...ouvintes, ...novos }
}

/* ------------------------------------------------------------------ */
/* Abrir a sessão                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cria o socket do Baileys. Existe separada para os testes poderem trocá-la
 * por um socket de mentira: o resto do arquivo só usa `sock.ev`, `sendMessage`
 * e meia dúzia de métodos.
 */
async function fabricaPadrao(cx) {
  const logger = pino({ level: process.env.LOG_WHATSAPP || 'silent' })
  const { state, saveCreds } = await useMultiFileAuthState(pastaDe(cx.id))
  // a versão do protocolo muda; se a busca falhar, a embutida na biblioteca serve
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.macOS('Desktop'),
    // NÃO liga o pedido de histórico completo (requireFullSync). Testado no
    // WhatsApp real com esta versão da biblioteca: "Desktop + histórico
    // completo" é recusado na hora — conexão encerrada com código 428, sem QR
    // — mesmo preenchendo os limites de sincronização do protocolo. Sem esse
    // pedido o QR vem sempre, e o celular ainda envia sozinho, no pareamento,
    // as conversas recentes e a agenda: é isso que a sincronização importa.
    // Se uma versão futura da biblioteca resolver, basta trocar para
    // `cx.sincronizar !== false` — e testar o QR de novo antes de publicar.
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  })
  sock.ev.on('creds.update', saveCreds)
  return sock
}

let fabrica = fabricaPadrao

/** Só para testes. */
export function trocarFabricaDeSocket(nova) {
  fabrica = nova || fabricaPadrao
}

/** (Re)abre a sessão de uma conexão. Sem efeito se já está aberta ou abrindo. */
export async function iniciar(conexaoId) {
  const cx = achar(conexaoId)
  if (!cx) return null
  const r = rt(conexaoId)
  if (r.sock || r.abrindo) return publica(cx, { comQr: true })

  clearTimeout(r.timer)
  r.abrindo = true
  r.encerrando = false
  mudar(conexaoId, { qr: null, motivo: '', estado: cx.vinculada ? 'conectando' : 'iniciando' })
  try {
    fs.mkdirSync(pastaDe(conexaoId), { recursive: true })
    const sock = await fabrica(cx)
    r.sock = sock
    ligar(cx, sock)
  } catch (erro) {
    console.error(`[conexões] ${cx.nome}: não consegui abrir a sessão:`, erro.message)
    r.sock = null
    if (cx.vinculada) {
      reconectarDepois(cx)
    } else {
      mudar(conexaoId, { estado: 'desconectada', motivo: `Não consegui abrir a conexão: ${erro.message}` })
    }
  } finally {
    r.abrindo = false
  }
  return publica(cx, { comQr: true })
}

/** Fecha o socket sem desvincular o número (reiniciar o sistema, trocar de QR). */
function parar(conexaoId) {
  const r = rts.get(conexaoId)
  if (!r) return
  clearTimeout(r.timer)
  r.encerrando = true
  try {
    r.sock?.end(undefined)
  } catch {
    /* já estava fechado */
  }
  r.sock = null
}

/**
 * @param {string} nome
 * @param {{ sincronizar?: boolean }} [opcoes] sincronizar (padrão: sim) importa as
 *   conversas e a agenda que o celular enviar na leitura do QR.
 */
export async function criar(nome, { sincronizar = true } = {}) {
  const v = nomeValido(nome)
  if (v.erro) return { erro: v.erro }
  const cx = {
    id: id('cx-'),
    nome: v.nome,
    telefone: '',
    vinculada: false,
    criadaEm: agora(),
    conectadaEm: null,
    sincronizar: sincronizar !== false,
    sincronizacao: novaSincronizacao(sincronizar !== false),
  }
  lista().push(cx)
  salvarCadastro()
  publicar('conexao', publica(cx))
  await iniciar(cx.id)
  return { conexao: publica(cx, { comQr: true }) }
}

export function renomear(conexaoId, nome) {
  const cx = achar(conexaoId)
  if (!cx) return { erro: 'Conexão não encontrada.' }
  const v = nomeValido(nome)
  if (v.erro) return { erro: v.erro }
  cx.nome = v.nome
  salvarCadastro()
  publicar('conexao', publica(cx))
  return { conexao: publica(cx) }
}

/**
 * Pede outro QR Code: derruba a sessão atual, apaga as credenciais (uma
 * sessão que nunca foi lida, ou que expirou, não serve para nada) e abre de
 * novo. Numa conexão já vinculada isso troca o número ligado a ela.
 */
export async function novoQr(conexaoId) {
  const cx = achar(conexaoId)
  if (!cx) return { erro: 'Conexão não encontrada.' }
  const r = rt(conexaoId)
  if (cx.vinculada && r.sock) {
    try {
      await comPrazo(r.sock.logout(), 5000) // sai da lista de aparelhos do celular
    } catch {
      /* celular fora do ar: segue, as credenciais serão apagadas de qualquer jeito */
    }
  }
  parar(conexaoId)
  apagarCredenciais(cx)
  return { conexao: await iniciar(conexaoId) }
}

/** Desvincula o número do celular, apaga as credenciais e some com a conexão. */
export async function remover(conexaoId) {
  const cx = achar(conexaoId)
  if (!cx) return false
  const r = rts.get(conexaoId)
  if (r?.sock && cx.vinculada) {
    try {
      await comPrazo(r.sock.logout(), 5000)
    } catch {
      /* mesmo sem conseguir avisar o celular, a conexão sai do sistema */
    }
  }
  parar(conexaoId)
  clearTimeout(r?.timerSinc)
  clearTimeout(r?.timerNomes)
  rts.delete(conexaoId)
  fs.rmSync(pastaDe(conexaoId), { recursive: true, force: true })
  banco.definir('conexoes', lista().filter((c) => c.id !== conexaoId))
  publicar('conexao-removida', { id: conexaoId })
  return true
}

function apagarCredenciais(cx) {
  fs.rmSync(pastaDe(cx.id), { recursive: true, force: true })
  cx.vinculada = false
  cx.conectadaEm = null
  // a agenda de contatos morava na mesma pasta: some junto, e volta na próxima sincronização
  const r = rts.get(cx.id)
  if (r) r.nomes = null
  salvarCadastro()
}

function comPrazo(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo esgotado')), ms)),
  ])
}

/** Ao subir o sistema: religa todo número que já foi lido uma vez. */
export async function retomarTodas() {
  for (const cx of lista()) {
    if (cx.vinculada && fs.existsSync(path.join(pastaDe(cx.id), 'creds.json'))) {
      // reiniciar no meio da sincronização: o celular não manda de novo, então o que faltou fica faltando
      if (['aguardando', 'sincronizando'].includes(cx.sincronizacao?.estado)) {
        cx.sincronizacao = { ...cx.sincronizacao, estado: 'interrompida' }
        salvarCadastro()
      }
      await iniciar(cx.id)
    } else {
      if (cx.vinculada) {
        cx.vinculada = false
        salvarCadastro()
      }
      mudar(cx.id, { estado: 'desconectada', motivo: 'Este número ainda não foi conectado. Gere um QR Code.' })
    }
  }
}

/** Ao encerrar o sistema: fecha as sessões sem desvincular ninguém. */
export function encerrarTodas() {
  for (const conexaoId of rts.keys()) parar(conexaoId)
}

/* ------------------------------------------------------------------ */
/* Eventos do WhatsApp                                                 */
/* ------------------------------------------------------------------ */

function ligar(cx, sock) {
  const r = rt(cx.id)
  // depois de uma reconexão, o socket antigo ainda pode soltar um último evento: ignora
  const vigente = () => r.sock === sock

  sock.ev.on('connection.update', async (u) => {
    if (!vigente()) return
    try {
      await aoMudarConexao(cx, sock, u)
    } catch (erro) {
      console.error(`[conexões] ${cx.nome}: erro no estado da conexão:`, erro)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!vigente()) return
    for (const m of messages || []) {
      try {
        await tratarMensagem(cx, m, type)
      } catch (erro) {
        console.error(`[conexões] ${cx.nome}: erro ao tratar mensagem:`, erro)
      }
    }
  })

  // O histórico chega em partes, e uma parte só pode ser processada depois da
  // anterior (os nomes dos contatos vêm antes das conversas que os usam):
  // por isso entram numa fila, uma de cada vez.
  sock.ev.on('messaging-history.set', (dados) => {
    if (!vigente()) return
    r.filaHistorico = (r.filaHistorico || Promise.resolve())
      .then(() => aoHistorico(cx, sock, dados))
      .catch((erro) => console.error(`[conexões] ${cx.nome}: erro ao sincronizar o histórico:`, erro))
  })

  // a agenda do celular: nomes salvos dos contatos
  const aoContatos = (contatos) => {
    if (!vigente()) return
    const mudancas = []
    for (const c of contatos || []) {
      const m = anotarContato(cx, c)
      if (m) mudancas.push(m)
    }
    if (!mudancas.length) return
    salvarNomes(cx)
    ouvintes.aoDescobrirNomes(cx.id, mudancas)
  }
  sock.ev.on('contacts.upsert', aoContatos)
  sock.ev.on('contacts.update', aoContatos)

  sock.ev.on('messages.update', (atualizacoes) => {
    if (!vigente()) return
    const status = []
    for (const a of atualizacoes || []) {
      if (!a.key?.fromMe || !a.key.id) continue
      const traduzido = traduzirStatus(a.update?.status)
      if (traduzido) status.push({ waId: a.key.id, status: traduzido })
    }
    if (status.length) ouvintes.aoMudarStatus(status)
  })
}

/** 3 = entregue, 4/5 = lida (ouvida), 0 = erro. O resto (pendente, no servidor) não muda nada para a tela. */
function traduzirStatus(codigo) {
  if (codigo === 3) return 'delivered'
  if (codigo === 4 || codigo === 5) return 'read'
  if (codigo === 0) return 'failed'
  return null
}

async function aoMudarConexao(cx, sock, { connection, lastDisconnect, qr }) {
  const r = rt(cx.id)

  if (qr) {
    // o WhatsApp renova o QR a cada ~20 s; a tela recebe cada um assim que nasce
    mudar(cx.id, { qr: await qrComoImagem(qr, { escala: 4, correcao: 'L' }), estado: 'aguardando-qr', motivo: '' })
    return
  }

  if (connection === 'open') {
    // primeira vez que este número abre depois da leitura do QR: é agora que o celular manda o histórico
    const recemPareada = !cx.vinculada
    r.tentativas = 0
    cx.vinculada = true
    cx.conectadaEm = agora()
    cx.telefone = telefoneDe(sock.user?.id) || cx.telefone
    if (recemPareada) esperarHistorico(cx)
    salvarCadastro()
    console.log(`[conexões] ${cx.nome}: conectada${cx.telefone ? ` (+${cx.telefone})` : ''}`)
    mudar(cx.id, { estado: 'conectada', motivo: '', qr: null })
    return
  }

  if (connection === 'close') tratarQueda(cx, sock, lastDisconnect)
}

function telefoneDe(jid) {
  return jidDecode(jid)?.user || ''
}

/** Por que a conexão caiu decide se vale tentar de novo — ou se a pessoa precisa ler outro QR. */
function tratarQueda(cx, sock, lastDisconnect) {
  const r = rt(cx.id)
  if (r.sock === sock) r.sock = null
  if (r.encerrando) return // fomos nós que fechamos

  const codigo = lastDisconnect?.error?.output?.statusCode

  if (codigo === DisconnectReason.restartRequired) {
    // acontece logo depois de ler o QR: o WhatsApp pede para abrir a sessão de novo, já com as credenciais
    iniciar(cx.id)
    return
  }

  if (
    codigo === DisconnectReason.loggedOut ||
    codigo === DisconnectReason.badSession ||
    codigo === DisconnectReason.multideviceMismatch
  ) {
    apagarCredenciais(cx)
    console.log(`[conexões] ${cx.nome}: o WhatsApp encerrou esta conexão (código ${codigo})`)
    mudar(cx.id, {
      estado: 'desconectada',
      qr: null,
      motivo:
        'O celular (ou o WhatsApp) desvinculou este aparelho. Gere um novo QR Code para conectar de novo.',
    })
    return
  }

  if (codigo === DisconnectReason.connectionReplaced) {
    mudar(cx.id, {
      estado: 'desconectada',
      qr: null,
      motivo: 'Este número foi aberto em outro WhatsApp Web e a conexão aqui foi substituída. Reconecte para voltar.',
    })
    return
  }

  if (codigo === DisconnectReason.timedOut && !cx.vinculada) {
    // o QR gira algumas vezes e desiste: ninguém leu
    mudar(cx.id, { estado: 'desconectada', qr: null, motivo: 'O QR Code expirou sem ser lido. Gere um novo.' })
    return
  }

  reconectarDepois(cx)
}

/** Queda de rede, WhatsApp fora do ar etc.: tenta de novo, esperando mais a cada vez (até 1 min). */
function reconectarDepois(cx) {
  const r = rt(cx.id)
  r.tentativas += 1
  const espera = Math.min(60_000, 2000 * 2 ** (r.tentativas - 1))
  console.log(`[conexões] ${cx.nome}: caiu; nova tentativa em ${Math.round(espera / 1000)}s (#${r.tentativas})`)
  mudar(cx.id, { estado: 'conectando', qr: null, motivo: `Reconectando… (tentativa ${r.tentativas})` })
  clearTimeout(r.timer)
  r.timer = setTimeout(() => iniciar(cx.id), espera)
  r.timer.unref?.()
}

/* ------------------------------------------------------------------ */
/* Receber                                                             */
/* ------------------------------------------------------------------ */

/** Só conversa de uma pessoa com a escola: grupos, status, canais e bots ficam de fora. */
function ehConversaIndividual(jid) {
  if (!jid) return false
  if (isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid) || isJidBot(jid)) return false
  return Boolean(isPnUser(jid) || isLidUser(jid))
}

/**
 * Quem é a pessoa do outro lado. O WhatsApp endereça ora pelo número, ora
 * por um identificador interno (LID) — nesse caso o número, quando vem,
 * está em remoteJidAlt. Responde-se pelo número sempre que ele é conhecido.
 */
function identificar(chave) {
  const principal = chave.remoteJid
  const alternativo = chave.remoteJidAlt
  const pn = isPnUser(principal) ? principal : isPnUser(alternativo) ? alternativo : null
  return { jid: pn || principal, telefone: pn ? telefoneDe(pn) : '' }
}

function emMilissegundos(marca) {
  const n = typeof marca === 'object' && marca?.toNumber ? marca.toNumber() : Number(marca)
  return Number.isFinite(n) && n > 0 ? n * 1000 : Date.now()
}

/** Tira os invólucros (mensagem temporária, ver uma vez) até chegar no conteúdo. */
function desembrulhar(mensagem) {
  let atual = mensagem
  for (let i = 0; i < 5; i += 1) {
    const interno =
      atual?.ephemeralMessage?.message ||
      atual?.viewOnceMessage?.message ||
      atual?.viewOnceMessageV2?.message ||
      atual?.viewOnceMessageV2Extension?.message ||
      atual?.documentWithCaptionMessage?.message
    if (!interno) break
    atual = interno
  }
  return atual
}

/**
 * Traduz o conteúdo para texto, no mesmo formato do restante do sistema.
 * Áudio, imagem e documento chegam como descrição ("a pessoa mandou um
 * áudio"): o agente responde com naturalidade, sem ficar mudo. Reação,
 * apagar, editar e afins devolvem null — não são mensagens.
 *
 * `minha`: a mensagem foi enviada por nós (pelo sistema ou pelo celular da
 * escola) — a descrição diz "[imagem enviada]" em vez de "[a pessoa mandou
 * uma imagem]". (Sem "você": a lista de conversas já escreve "Você:" antes.)
 */
export function extrairConteudo(mensagemBruta, { minha = false } = {}) {
  const c = desembrulhar(mensagemBruta)
  if (!c) return null
  /** [a pessoa mandou uma imagem] / [imagem enviada] */
  const rotulo = (recebida, enviada) => (minha ? `[${enviada}]` : `[${recebida}]`)

  if (typeof c.conversation === 'string' && c.conversation) return { tipo: 'texto', texto: c.conversation }
  if (c.extendedTextMessage?.text) return { tipo: 'texto', texto: c.extendedTextMessage.text }

  if (c.imageMessage) {
    const legenda = c.imageMessage.caption
    return {
      tipo: 'imagem',
      texto: legenda ? `[imagem] ${legenda}` : rotulo('a pessoa mandou uma imagem', 'imagem enviada'),
      anexo: { tipo: 'imagem', mimetype: c.imageMessage.mimetype || 'image/jpeg' },
    }
  }
  if (c.videoMessage) {
    const legenda = c.videoMessage.caption
    return {
      tipo: 'video',
      texto: legenda ? `[vídeo] ${legenda}` : rotulo('a pessoa mandou um vídeo', 'vídeo enviado'),
      anexo: { tipo: 'video' },
    }
  }
  if (c.audioMessage) {
    return {
      tipo: 'audio',
      texto: rotulo('a pessoa mandou um áudio', 'áudio enviado'),
      anexo: { tipo: 'audio', mimetype: c.audioMessage.mimetype || 'audio/ogg' },
    }
  }
  if (c.documentMessage) {
    return {
      tipo: 'documento',
      texto: `[documento: ${c.documentMessage.fileName || 'arquivo'}]`,
      anexo: {
        tipo: 'documento',
        mimetype: c.documentMessage.mimetype || 'application/octet-stream',
        nomeArquivo: c.documentMessage.fileName || 'arquivo',
      },
    }
  }
  if (c.stickerMessage) {
    return {
      tipo: 'figurinha',
      texto: '[figurinha]',
      anexo: { tipo: 'figurinha', mimetype: c.stickerMessage.mimetype || 'image/webp' },
    }
  }
  if (c.locationMessage || c.liveLocationMessage) {
    return { tipo: 'localizacao', texto: rotulo('a pessoa mandou a localização', 'localização enviada'), anexo: { tipo: 'localizacao' } }
  }
  if (c.contactMessage || c.contactsArrayMessage) return { tipo: 'texto', texto: rotulo('a pessoa mandou um contato', 'contato enviado') }

  // respostas a botões e listas
  const resposta =
    c.buttonsResponseMessage?.selectedDisplayText ||
    c.templateButtonReplyMessage?.selectedDisplayText ||
    c.listResponseMessage?.title
  if (resposta) return { tipo: 'texto', texto: resposta }

  // reação, mensagem apagada/editada, troca de chaves…: nada para o atendimento
  return null
}

async function tratarMensagem(cx, m, tipoDoLote) {
  const chave = m.key
  if (!chave?.id || !ehConversaIndividual(chave.remoteJid)) return
  const conteudo = extrairConteudo(m.message, { minha: Boolean(chave.fromMe) })
  if (!conteudo) return
  if (TIPOS_MIDIA_BAIXAVEL.has(conteudo.anexo?.tipo)) guardarMidia(rt(cx.id).sock, cx.id, chave, m.message)

  const { jid, telefone } = identificar(chave)
  const salvos = nomeSalvoDe(cx, { jid, telefone })
  const pacote = {
    waId: chave.id,
    jid,
    telefone,
    em: new Date(emMilissegundos(m.messageTimestamp)).toISOString(),
    chave: { remoteJid: chave.remoteJid, id: chave.id, participant: chave.participant },
    // o nome do contato é o que está salvo no celular; sem ele, a tela mostra o número
    nomeContato: salvos.nomeContato,
    // pushName de mensagem NOSSA é o nosso próprio nome, não o do cliente
    nomePerfil: chave.fromMe ? salvos.nomePerfil : m.pushName || salvos.nomePerfil,
    ...conteudo,
  }

  if (chave.fromMe) {
    // eco do que o próprio sistema enviou: já está no histórico
    if (rt(cx.id).enviadas.has(chave.id)) return
    // 'append' é histórico antigo sincronizando, não resposta de agora
    if (tipoDoLote !== 'notify') return
    await ouvintes.aoResponderPeloCelular(cx.id, pacote)
    return
  }

  if (tipoDoLote !== 'notify') return
  await ouvintes.aoReceber([pacote], cx.id)
}

/* ------------------------------------------------------------------ */
/* Nomes dos contatos (a agenda do celular)                            */
/* ------------------------------------------------------------------ */

/**
 * Guarda, por número ou identificador interno, o nome que o contato tem NA
 * AGENDA do celular (`nome`) e o nome que a própria pessoa pôs no perfil do
 * WhatsApp (`perfil`). A tela usa o primeiro como título; quem não está na
 * agenda aparece pelo número, e o nome do perfil só acompanha.
 *
 * Fica em contatos.json, dentro da pasta do número: o Baileys não guarda a
 * agenda sozinho, e sem isso um cliente que escrevesse depois de reiniciar o
 * sistema perderia o nome.
 */
function usuarioDe(jid) {
  return jidDecode(jid)?.user || ''
}

function nomesDe(cx) {
  const r = rt(cx.id)
  if (!r.nomes) {
    try {
      const lido = JSON.parse(fs.readFileSync(path.join(pastaDe(cx.id), 'contatos.json'), 'utf8'))
      r.nomes = { nome: lido.nome || {}, perfil: lido.perfil || {} }
    } catch {
      r.nomes = { nome: {}, perfil: {} }
    }
  }
  return r.nomes
}

function salvarNomes(cx) {
  const r = rt(cx.id)
  if (r.timerNomes) return // já tem uma gravação agendada: rajada de contatos = uma escrita
  r.timerNomes = setTimeout(() => {
    r.timerNomes = null
    try {
      if (!r.nomes || !fs.existsSync(pastaDe(cx.id))) return // a conexão foi removida nesse meio tempo
      const arquivo = path.join(pastaDe(cx.id), 'contatos.json')
      fs.writeFileSync(`${arquivo}.tmp`, JSON.stringify(r.nomes), 'utf8')
      fs.renameSync(`${arquivo}.tmp`, arquivo)
    } catch (erro) {
      console.warn(`[conexões] ${cx.nome}: não consegui gravar a agenda:`, erro.message)
    }
  }, 1500)
  r.timerNomes.unref?.()
}

/** Um nome de agenda de verdade: não vazio, e que não seja só o telefone ("+55 11 98888-7777"). */
function nomeDeAgenda(nome) {
  const limpo = String(nome || '').trim()
  if (!limpo || /^[+\d\s().-]+$/.test(limpo)) return ''
  return limpo
}

/**
 * Registra o que um contato informa. Devolve as chaves e os nomes (para o
 * atendimento aplicar às conversas que já existem), ou null se não trouxe nome.
 */
function anotarContato(cx, c) {
  const chaves = new Set()
  for (const j of [c.id, c.lid, c.phoneNumber]) {
    const u = usuarioDe(j)
    if (u) chaves.add(u)
  }
  if (!chaves.size) return null

  const nome = nomeDeAgenda(c.name)
  const perfil = String(c.notify || c.verifiedName || '').trim()
  if (!nome && !perfil) return null

  const n = nomesDe(cx)
  for (const k of chaves) {
    if (nome) n.nome[k] = nome
    if (perfil) n.perfil[k] = perfil
  }
  return { chaves: [...chaves], nomeContato: nome, nomePerfil: perfil }
}

function nomeSalvoDe(cx, { jid, telefone }) {
  const n = nomesDe(cx)
  const chaves = [telefone, usuarioDe(jid)].filter(Boolean)
  return {
    nomeContato: chaves.map((k) => n.nome[k]).find(Boolean) || '',
    nomePerfil: chaves.map((k) => n.perfil[k]).find(Boolean) || '',
  }
}

/* ------------------------------------------------------------------ */
/* Sincronização do histórico                                          */
/* ------------------------------------------------------------------ */

function mudarSinc(cx, mudancas) {
  cx.sincronizacao = { ...(cx.sincronizacao || novaSincronizacao(true)), ...mudancas }
  salvarCadastro()
  publicar('conexao', publica(cx))
}

function armarTimerSinc(cx, ms) {
  const r = rt(cx.id)
  clearTimeout(r.timerSinc)
  r.timerSinc = setTimeout(() => encerrarSincronizacao(cx), ms)
  r.timerSinc.unref?.()
}

/** Número recém-lido: o celular vai (ou não) mandar o histórico. */
function esperarHistorico(cx) {
  if (cx.sincronizar === false) {
    cx.sincronizacao = novaSincronizacao(false)
    return
  }
  cx.sincronizacao = { ...novaSincronizacao(true), iniciadaEm: agora() }
  armarTimerSinc(cx, SINC_ESPERA_MS)
}

/** Parou de chegar parte nova: se chegou algo, concluiu; se nunca chegou nada, o celular não enviou. */
function encerrarSincronizacao(cx) {
  const estado = cx.sincronizacao?.estado
  if (estado === 'aguardando') {
    console.log(`[conexões] ${cx.nome}: o celular não enviou o histórico`)
    mudarSinc(cx, { estado: 'indisponivel', concluidaEm: agora() })
  } else if (estado === 'sincronizando') {
    const { conversas, mensagens } = cx.sincronizacao
    console.log(`[conexões] ${cx.nome}: sincronização concluída (${conversas} conversas, ${mensagens} mensagens)`)
    mudarSinc(cx, { estado: 'concluida', progresso: 100, concluidaEm: agora() })
  }
}

const cedeAVez = () => new Promise((resolver) => setImmediate(resolver))

/**
 * O número da pessoa de uma conversa que o WhatsApp endereçou por
 * identificador interno (LID). Tenta, nesta ordem: o próprio endereço, o
 * alternativo da mensagem, o mapa que veio com o histórico e, por fim, o que
 * o Baileys já aprendeu.
 */
async function identificarNoHistorico(sock, chave, mapa) {
  const principal = chave.remoteJid
  let pn = isPnUser(principal)
    ? principal
    : isPnUser(chave.remoteJidAlt)
      ? chave.remoteJidAlt
      : mapa.get(usuarioDe(principal)) || null
  if (!pn && isLidUser(principal)) {
    try {
      pn = (await sock.signalRepository?.lidMapping?.getPNForLID(principal)) || null
    } catch {
      /* sem mapeamento: a conversa fica sem número, e a tela diz isso */
    }
  }
  if (pn && !String(pn).includes('@')) pn = `${pn}@s.whatsapp.net`
  return { jid: pn || principal, telefone: pn ? telefoneDe(pn) : '' }
}

/** Uma parte do histórico: contatos, conversas e mensagens. */
async function aoHistorico(cx, sock, dados) {
  // sob demanda = pediram mensagens antigas de UMA conversa (botão "buscar mensagens
  // antigas"); isso vale mesmo com a sincronização automática desligada, e não mexe
  // no andamento da sincronização inicial do número (passo 5, mais abaixo) — são coisas
  // diferentes, e misturar os dois confundiria o cartão da conexão.
  const sobDemanda = dados.syncType === proto.HistorySync.HistorySyncType.ON_DEMAND
  if (cx.sincronizar === false && !sobDemanda) return

  // 1. quem é quem: identificador interno → número
  const paraNumero = new Map()
  for (const m of dados.lidPnMappings || []) {
    if (m.lid && m.pn) paraNumero.set(usuarioDe(m.lid), m.pn)
  }
  for (const chat of dados.chats || []) {
    if (chat.lidJid && chat.pnJid) paraNumero.set(usuarioDe(chat.lidJid), chat.pnJid)
    if (isLidUser(chat.id) && chat.pnJid) paraNumero.set(usuarioDe(chat.id), chat.pnJid)
  }

  // 2. a agenda vem ANTES das conversas: elas já nascem com o nome certo
  for (const c of dados.contacts || []) anotarContato(cx, c)
  salvarNomes(cx)

  // 3. as mensagens, agrupadas por conversa
  const grupos = new Map()
  const mensagens = dados.messages || []
  for (let i = 0; i < mensagens.length; i += 1) {
    // milhares de mensagens de uma vez não podem travar o resto do sistema (nem a conexão)
    if (i % 400 === 399) await cedeAVez()
    const m = mensagens[i]
    const chave = m.key
    if (!chave?.id || !ehConversaIndividual(chave.remoteJid)) continue
    const conteudo = extrairConteudo(m.message, { minha: Boolean(chave.fromMe) })
    if (!conteudo) continue
    if (TIPOS_MIDIA_BAIXAVEL.has(conteudo.anexo?.tipo)) guardarMidia(sock, cx.id, chave, m.message)

    const { jid, telefone } = await identificarNoHistorico(sock, chave, paraNumero)
    let grupo = grupos.get(jid)
    if (!grupo) {
      grupo = { jid, telefone, perfil: '', mensagens: [] }
      grupos.set(jid, grupo)
    }
    if (!chave.fromMe && m.pushName) grupo.perfil = m.pushName
    grupo.mensagens.push({
      waId: chave.id,
      de: chave.fromMe ? 'atendente' : 'cliente',
      texto: conteudo.texto,
      tipo: conteudo.tipo,
      anexo: conteudo.anexo || null,
      em: new Date(emMilissegundos(m.messageTimestamp)).toISOString(),
    })
  }

  // 4. entrega ao atendimento
  const lote = [...grupos.values()].map((g) => {
    const salvos = nomeSalvoDe(cx, g)
    return {
      jid: g.jid,
      telefone: g.telefone,
      nomeContato: salvos.nomeContato,
      nomePerfil: g.perfil || salvos.nomePerfil,
      mensagens: g.mensagens,
    }
  })
  const entrou = lote.length ? await ouvintes.aoSincronizar(cx.id, lote) : { conversas: 0, mensagens: 0 }
  if (sobDemanda) return

  // 5. andamento (qualquer parte reabre a sincronização e adia o "concluída")
  const atual = cx.sincronizacao || novaSincronizacao(true)
  mudarSinc(cx, {
    estado: 'sincronizando',
    conversas: atual.conversas + entrou.conversas,
    mensagens: atual.mensagens + entrou.mensagens,
    progresso: typeof dados.progress === 'number' ? dados.progress : atual.progresso,
    iniciadaEm: atual.iniciadaEm || agora(),
    concluidaEm: null,
  })
  armarTimerSinc(cx, SINC_OCIOSO_MS)
}

/**
 * Pede ao celular mensagens mais antigas de UMA conversa, a partir da mais
 * antiga que já temos. A resposta não vem na hora: chega depois pelo mesmo
 * caminho da sincronização (`aoHistorico`, acima), identificada como
 * ON_DEMAND. Não é possível saber de antemão se o celular tem mais para
 * mandar — ele simplesmente para de enviar quando chega ao fim.
 */
export async function buscarMensagensAntigas(conexaoId, { jid, telefone, waId, fromMe, timestampMs }) {
  const r = rts.get(conexaoId)
  if (!r?.sock || r.estado !== 'conectada') {
    throw new Error('Este número está desconectado. Reconecte em Conexões.')
  }
  const remoteJid = jid || paraJid(telefone)
  await r.sock.fetchMessageHistory(50, { remoteJid, id: waId, fromMe }, Math.floor(timestampMs / 1000))
}

/* ------------------------------------------------------------------ */
/* Mídia (imagem, áudio, documento, figurinha)                         */
/* ------------------------------------------------------------------ */

const LOGGER_MIDIA = pino({ level: 'silent' })

/** Os únicos tipos que a tela sabe mostrar hoje — vídeo e localização continuam só texto. */
const TIPOS_MIDIA_BAIXAVEL = new Set(['imagem', 'audio', 'documento', 'figurinha'])

function pastaMidia(conexaoId) {
  return path.join(pastaDe(conexaoId), 'midia')
}

function arquivoMidia(conexaoId, waId) {
  return path.join(pastaMidia(conexaoId), waId)
}

/** O que `downloadMediaMessage` precisa para baixar (ou pedir reenvio) — guardado à parte dos bytes. */
function arquivoMidiaBruta(conexaoId, waId) {
  return path.join(pastaMidia(conexaoId), `${waId}.bruta.json`)
}

/** `JSON.parse(texto, reviverDeBuffer)` devolve os `Buffer` (mediaKey etc.) que `JSON.stringify` achatou. */
function reviverDeBuffer(_chave, valor) {
  if (valor && typeof valor === 'object' && valor.type === 'Buffer' && Array.isArray(valor.data)) {
    return Buffer.from(valor.data)
  }
  return valor
}

/**
 * Guarda o bruto de uma mensagem com mídia — tudo que precisa para baixar ou
 * pedir reenvio — mesmo que o download de agora dê certo de primeira. Sem
 * isso, uma mídia que falhar fica perdida para sempre: essa informação só
 * existe no evento do Baileys enquanto ele está acontecendo, em memória; sem
 * guardar, não há como tentar de novo mais tarde.
 */
function guardarBruta(conexaoId, chave, mensagemBruta) {
  try {
    fs.mkdirSync(pastaMidia(conexaoId), { recursive: true })
    fs.writeFileSync(arquivoMidiaBruta(conexaoId, chave.id), JSON.stringify({ chave, mensagemBruta }))
  } catch {
    /* sem o bruto guardado, só se perde o "tentar de novo depois" — o download de agora segue normal */
  }
}

function lerBruta(conexaoId, waId) {
  try {
    return JSON.parse(fs.readFileSync(arquivoMidiaBruta(conexaoId, waId), 'utf8'), reviverDeBuffer)
  } catch {
    return null
  }
}

/**
 * O link do WhatsApp para uma mídia vence (é assim em toda mensagem antiga) —
 * quando isso acontece dá para pedir ao PRÓPRIO celular pareado que reenvie,
 * um pedido legítimo do protocolo, nada de rajada para outros números. O
 * Baileys sabe fazer isso sozinho (`ctx.reuploadRequest`), mas só dispara
 * quando o erro tem um `.status` numérico — e o erro que ele mesmo lança
 * (`Boom`) só tem `.output.statusCode`, nunca `.status`. Resultado: o
 * reenvio automático dele nunca roda, e toda mídia vencida falha para
 * sempre. Por isso refazemos essa checagem aqui, à mão.
 */
const LINK_DE_MIDIA_VENCIDO = [404, 410]

/**
 * Baixa e guarda em disco a mídia de uma mensagem, identificada pelo id dela
 * no WhatsApp (waId) — uma vez só; chamadas seguintes acham o arquivo e nem
 * tentam de novo. Nunca lança: imagem, áudio, documento e figurinha têm
 * sempre uma descrição em texto (extrairConteudo), então perder o arquivo não
 * pode travar o atendimento — só a pessoa não vê a mídia em si.
 */
async function guardarMidia(sock, conexaoId, chave, mensagemBruta, jaPediuReenvio = false) {
  const arquivo = arquivoMidia(conexaoId, chave.id)
  if (fs.existsSync(arquivo)) return
  if (!jaPediuReenvio) guardarBruta(conexaoId, chave, mensagemBruta)
  try {
    const bytes = await downloadMediaMessage({ key: chave, message: mensagemBruta }, 'buffer', {}, { logger: LOGGER_MIDIA })
    fs.mkdirSync(pastaMidia(conexaoId), { recursive: true })
    fs.writeFileSync(arquivo, bytes)
    fs.rmSync(arquivoMidiaBruta(conexaoId, chave.id), { force: true })
  } catch (erro) {
    const vencido = LINK_DE_MIDIA_VENCIDO.includes(erro?.output?.statusCode)
    if (vencido && sock && !jaPediuReenvio) {
      try {
        const reenviada = await sock.updateMediaMessage({ key: chave, message: mensagemBruta })
        return guardarMidia(sock, conexaoId, chave, reenviada.message, true)
      } catch (erroDoReenvio) {
        console.warn(`[conexões] o celular não reenviou a mídia (${chave.id}):`, erroDoReenvio.message)
        return
      }
    }
    console.warn(`[conexões] não consegui baixar uma mídia (${chave.id}):`, erro.message)
  }
}

/**
 * Os bytes de uma mídia: se já tem em disco, devolve na hora. Senão — mídia
 * antiga cujo primeiro download falhou, por exemplo — tenta de novo agora,
 * contanto que tenhamos guardado o bruto dela (ver `guardarBruta`).
 */
export async function obterMidia(conexaoId, waId) {
  try {
    return fs.readFileSync(arquivoMidia(conexaoId, waId))
  } catch {
    /* sem cache: tenta baixar agora, se tiver com o quê */
  }
  const bruta = lerBruta(conexaoId, waId)
  if (!bruta) return null
  await guardarMidia(rts.get(conexaoId)?.sock, conexaoId, bruta.chave, bruta.mensagemBruta)
  try {
    return fs.readFileSync(arquivoMidia(conexaoId, waId))
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Foto de perfil                                                       */
/* ------------------------------------------------------------------ */

const FOTO_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000
const SEM_FOTO_VALIDADE_MS = 24 * 60 * 60 * 1000

function pastaFotos(conexaoId) {
  return path.join(pastaDe(conexaoId), 'fotos')
}

function arquivosFoto(conexaoId, telefone) {
  const limpo = String(telefone || '').replace(/\D/g, '')
  const base = path.join(pastaFotos(conexaoId), limpo)
  return { foto: `${base}.jpg`, semFoto: `${base}.sem` }
}

/**
 * A foto de perfil de um contato, lida do WhatsApp e guardada em disco.
 *
 * Buscar de novo a cada vez que a tela abre pareceria automação em rajada —
 * exatamente o tipo de comportamento que arrisca o número (ver o aviso no
 * alto deste arquivo). Por isso o cache: uma foto encontrada vale por 7 dias;
 * um contato sem foto (perfil privado, ou nunca pôs uma) só é tentado de novo
 * depois de 1 dia.
 */
export async function obterFotoContato(conexaoId, telefone) {
  if (!telefone) return null
  const { foto, semFoto } = arquivosFoto(conexaoId, telefone)

  try {
    const info = fs.statSync(foto)
    if (Date.now() - info.mtimeMs < FOTO_VALIDADE_MS) return fs.readFileSync(foto)
  } catch {
    /* ainda sem cache */
  }
  try {
    const info = fs.statSync(semFoto)
    if (Date.now() - info.mtimeMs < SEM_FOTO_VALIDADE_MS) return null
  } catch {
    /* nunca tentou */
  }

  const r = rts.get(conexaoId)
  if (!r?.sock || r.estado !== 'conectada') return null

  try {
    const url = await r.sock.profilePictureUrl(paraJid(telefone), 'image')
    if (!url) throw new Error('sem foto')
    const resposta = await fetch(url)
    if (!resposta.ok) throw new Error('falha ao baixar a foto')
    const bytes = Buffer.from(await resposta.arrayBuffer())
    fs.mkdirSync(pastaFotos(conexaoId), { recursive: true })
    fs.writeFileSync(foto, bytes)
    fs.rmSync(semFoto, { force: true })
    return bytes
  } catch {
    // perfil privado, contato nunca pôs foto, ou erro de rede: tudo cai aqui igual,
    // e não há como distinguir — só evitar bater de novo antes da hora
    try {
      fs.mkdirSync(pastaFotos(conexaoId), { recursive: true })
      fs.writeFileSync(semFoto, '')
    } catch {
      /* não é crítico perder esse cache */
    }
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Enviar                                                              */
/* ------------------------------------------------------------------ */

function paraJid(destino) {
  return String(destino).includes('@') ? String(destino) : `${String(destino).replace(/\D/g, '')}@s.whatsapp.net`
}

/** Manda um texto. Devolve o id da mensagem no WhatsApp. */
export async function enviarTexto(conexaoId, destino, texto) {
  const r = rts.get(conexaoId)
  if (!r?.sock || r.estado !== 'conectada') {
    throw new Error('O número desta conversa está desconectado. Reconecte em Conexões.')
  }
  const messageId = generateMessageID()
  // anotado ANTES de enviar: o eco pode voltar antes de a chamada terminar
  r.enviadas.add(messageId)
  if (r.enviadas.size > 500) r.enviadas.delete(r.enviadas.values().next().value)
  const resultado = await r.sock.sendMessage(paraJid(destino), { text: texto }, { messageId })
  return resultado?.key?.id || messageId
}

/** O visto azul. Falhar aqui não pode atrapalhar o atendimento. */
export async function marcarComoLida(conexaoId, chave) {
  const r = rts.get(conexaoId)
  if (!r?.sock || r.estado !== 'conectada' || !chave) return
  try {
    await r.sock.readMessages([chave])
  } catch (erro) {
    console.warn('[conexões] não consegui marcar como lida:', erro.message)
  }
}

/** "digitando…" no celular do cliente enquanto o agente escreve. Só enfeite: falhar não importa. */
export async function digitando(conexaoId, destino, ligado) {
  const r = rts.get(conexaoId)
  if (!r?.sock || r.estado !== 'conectada') return
  try {
    await r.sock.sendPresenceUpdate(ligado ? 'composing' : 'paused', paraJid(destino))
  } catch {
    /* sem importância */
  }
}
