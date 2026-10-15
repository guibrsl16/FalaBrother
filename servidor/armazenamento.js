/**
 * Guarda tudo em arquivos JSON dentro da pasta `dados/`.
 *
 * Por que não um banco: o atendimento precisa subir com um `npm start` em
 * qualquer computador, sem instalar servidor de banco nem compilar módulo
 * nativo. O volume aqui é conversa de WhatsApp de uma escola — cabe.
 *
 * Duas decisões que evitam dor de cabeça mais tarde:
 *  - as mensagens de cada conversa ficam em um arquivo próprio
 *    (dados/conversas/<id>.json). O índice geral guarda só o resumo de cada
 *    conversa, então abrir a lista não carrega o histórico inteiro.
 *  - toda gravação é atômica: escreve em .tmp e renomeia. Se faltar luz no
 *    meio, o arquivo antigo continua íntegro.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PASTA_DADOS } from './config.js'

const PASTA_CONVERSAS = path.join(PASTA_DADOS, 'conversas')

fs.mkdirSync(PASTA_CONVERSAS, { recursive: true })

function caminho(nome) {
  return path.join(PASTA_DADOS, `${nome}.json`)
}

function ler(nome, padrao) {
  const arquivo = caminho(nome)
  if (!fs.existsSync(arquivo)) return padrao
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  } catch (erro) {
    console.error(`[dados] ${nome}.json ilegível, usando o padrão:`, erro.message)
    // não apaga: renomeia para a pessoa poder olhar depois
    try {
      fs.renameSync(arquivo, `${arquivo}.quebrado-${Date.now()}`)
    } catch {
      /* segue o jogo */
    }
    return padrao
  }
}

function gravar(arquivo, valor) {
  const temporario = `${arquivo}.tmp`
  fs.writeFileSync(temporario, JSON.stringify(valor, null, 2), 'utf8')
  fs.renameSync(temporario, arquivo)
}

/* ------------------------------------------------------------------ */
/* Estado em memória — o disco é só a cópia durável                    */
/* ------------------------------------------------------------------ */

/** As coleções simples: um arquivo JSON para cada uma. */
const COLECOES = ['ajustes', 'cursos', 'agentes', 'conversas', 'usuarios', 'sessoes', 'conexoes']

const memoria = Object.fromEntries(COLECOES.map((nome) => [nome, ler(nome, null)]))

const gravacaoPendente = new Set()
let timerGravacao = null

/** Agenda a gravação para daqui a pouco: rajada de mensagens = uma escrita. */
function agendar(nome) {
  gravacaoPendente.add(nome)
  if (timerGravacao) return
  timerGravacao = setTimeout(() => {
    timerGravacao = null
    const pendentes = [...gravacaoPendente]
    gravacaoPendente.clear()
    for (const item of pendentes) {
      try {
        gravar(caminho(item), memoria[item])
      } catch (erro) {
        console.error(`[dados] falha ao gravar ${item}:`, erro.message)
      }
    }
  }, 400)
}

/** Grava agora, sem esperar. Usado ao encerrar o programa. */
export function gravarTudo() {
  if (timerGravacao) {
    clearTimeout(timerGravacao)
    timerGravacao = null
  }
  gravacaoPendente.clear()
  for (const nome of COLECOES) {
    if (memoria[nome] == null) continue
    try {
      gravar(caminho(nome), memoria[nome])
    } catch (erro) {
      console.error(`[dados] falha ao gravar ${nome}:`, erro.message)
    }
  }
}

/* -------------------------- coleções simples ---------------------- */

export function obter(nome) {
  return memoria[nome]
}

export function definir(nome, valor) {
  memoria[nome] = valor
  agendar(nome)
  return valor
}

/** Existe conteúdo salvo? Serve para saber se é a primeira vez que abre. */
export function vazio() {
  return memoria.cursos == null && memoria.agentes == null
}

/* -------------------------- mensagens ----------------------------- */

const cacheMensagens = new Map()

/**
 * Quantas conversas ficam com o histórico na memória. Depois de uma
 * sincronização o sistema pode ter milhares de conversas; só as mais
 * recentes precisam estar à mão — as outras voltam do disco quando alguém abre.
 */
const LIMITE_CACHE_MENSAGENS = 300

function aparar() {
  if (cacheMensagens.size <= LIMITE_CACHE_MENSAGENS) return
  for (const chave of cacheMensagens.keys()) {
    if (cacheMensagens.size <= LIMITE_CACHE_MENSAGENS) break
    // o que ainda não foi gravado fica: apagar da memória seria perder a mensagem
    if (!conversasSujas.has(chave)) cacheMensagens.delete(chave)
  }
}

function arquivoMensagens(conversaId) {
  return path.join(PASTA_CONVERSAS, `${conversaId}.json`)
}

export function mensagensDe(conversaId) {
  if (cacheMensagens.has(conversaId)) return cacheMensagens.get(conversaId)
  const arquivo = arquivoMensagens(conversaId)
  let lista = []
  if (fs.existsSync(arquivo)) {
    try {
      lista = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    } catch (erro) {
      console.error(`[dados] histórico de ${conversaId} ilegível:`, erro.message)
      lista = []
    }
  }
  cacheMensagens.set(conversaId, lista)
  return lista
}

const conversasSujas = new Set()
let timerMensagens = null

export function guardarMensagem(conversaId, mensagem) {
  const lista = mensagensDe(conversaId)
  lista.push(mensagem)
  conversasSujas.add(conversaId)
  if (!timerMensagens) {
    timerMensagens = setTimeout(descarregarMensagens, 400)
  }
  return mensagem
}

/**
 * Guarda várias mensagens de uma vez — o histórico trazido do celular — e
 * mantém a lista em ordem de horário (o histórico chega em partes, e as mais
 * antigas podem vir depois das que já estavam aqui). Fica só com as últimas
 * `limite`: o que passar disso é antigo demais para ajudar o atendimento.
 */
export function guardarVarias(conversaId, novas, limite = 1000) {
  const lista = mensagensDe(conversaId)
  for (const m of novas) lista.push(m)
  // data em ISO: comparar o texto é comparar o horário
  lista.sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0))
  if (lista.length > limite) lista.splice(0, lista.length - limite)
  conversasSujas.add(conversaId)
  if (!timerMensagens) timerMensagens = setTimeout(descarregarMensagens, 400)
  return lista
}

export function atualizarMensagem(conversaId, mensagemId, mudancas) {
  const lista = mensagensDe(conversaId)
  const alvo = lista.find((m) => m.id === mensagemId)
  if (!alvo) return null
  Object.assign(alvo, mudancas)
  conversasSujas.add(conversaId)
  if (!timerMensagens) timerMensagens = setTimeout(descarregarMensagens, 400)
  return alvo
}

function descarregarMensagens() {
  timerMensagens = null
  const pendentes = [...conversasSujas]
  conversasSujas.clear()
  for (const conversaId of pendentes) {
    try {
      gravar(arquivoMensagens(conversaId), cacheMensagens.get(conversaId) || [])
    } catch (erro) {
      console.error(`[dados] falha ao gravar histórico de ${conversaId}:`, erro.message)
    }
  }
  aparar()
}

export function apagarMensagens(conversaId) {
  cacheMensagens.delete(conversaId)
  conversasSujas.delete(conversaId)
  const arquivo = arquivoMensagens(conversaId)
  if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo)
}

/** Grava histórico pendente. Chamado junto com gravarTudo(). */
export function descarregarAgora() {
  if (timerMensagens) {
    clearTimeout(timerMensagens)
    timerMensagens = null
  }
  const pendentes = [...conversasSujas]
  conversasSujas.clear()
  for (const conversaId of pendentes) {
    try {
      gravar(arquivoMensagens(conversaId), cacheMensagens.get(conversaId) || [])
    } catch (erro) {
      console.error(`[dados] falha ao gravar histórico de ${conversaId}:`, erro.message)
    }
  }
}
