/**
 * A costura do atendimento: junta WhatsApp, agentes e histórico.
 *
 * O caminho de uma mensagem que chega:
 *   webhook → registrar → esperar a pessoa terminar de digitar → escolher o
 *   agente → rodar o modelo → enviar a resposta pelo mesmo número por onde
 *   a conversa chegou → aplicar o que o agente decidiu (transferir,
 *   registrar interesse, trocar de especialista).
 *
 * Duas proteções que existem por causa de como gente usa WhatsApp:
 *  - ESPERA: quase ninguém escreve tudo numa mensagem só. Sem uma pausa, o
 *    agente responderia três vezes ao mesmo raciocínio partido em pedaços.
 *  - TRAVA: enquanto uma resposta está sendo gerada, a conversa fica
 *    trancada. Sem isso, duas respostas sairiam ao mesmo tempo, cada uma
 *    sem saber da outra.
 */
import * as estado from './estado.js'
import * as whatsapp from './whatsapp.js'
import * as conexoes from './conexoes.js'
import { agentePorPalavraChave, historicoParaApi, rodarAgente, temChave } from './claude.js'
import { publicar } from './eventos.js'

const timersDeEspera = new Map()
const trancadas = new Set()
const avisoForaDoHorario = new Map()

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

/**
 * Chegou mensagem de cliente. `origem.conexaoId` diz por qual número da
 * escola (conexão por QR); sem ele, veio da API oficial da Meta.
 */
export async function receberDoWhatsapp(recebidas, origem = {}) {
  const conexaoId = origem.conexaoId || null
  for (const bruta of recebidas) {
    const conv = estado.garantirConversa(bruta.telefone, bruta.nomeContato, {
      conexaoId,
      jid: bruta.jid || null,
      nomePerfil: bruta.nomePerfil || '',
    })

    // o WhatsApp reentrega o mesmo pacote depois de uma queda: não vale duas vezes
    if (jaRegistrada(conv.id, bruta.waId)) continue

    estado.registrarMensagem(conv.id, {
      de: 'cliente',
      texto: bruta.texto,
      em: bruta.em,
      waId: bruta.waId,
      tipo: bruta.tipo,
      anexo: bruta.anexo || null,
      status: 'recebida',
    })

    if (conexaoId) conexoes.marcarComoLida(conexaoId, bruta.chave)
    else whatsapp.marcarComoLida(bruta.waId)
    agendarResposta(conv.id)
  }
}

/**
 * Uma pessoa da equipe respondeu pelo PRÓPRIO CELULAR, sem passar pela tela.
 * Vale como assumir a conversa: o agente para na hora, pelo mesmo motivo de
 * sempre — nada é pior que o robô responder por cima de uma pessoa.
 */
export async function receberDoCelular(conexaoId, mensagem) {
  const conv = estado.garantirConversa(mensagem.telefone, '', { conexaoId, jid: mensagem.jid })
  if (jaRegistrada(conv.id, mensagem.waId)) return

  const timer = timersDeEspera.get(conv.id)
  if (timer) {
    clearTimeout(timer)
    timersDeEspera.delete(conv.id)
  }

  estado.registrarMensagem(conv.id, {
    de: 'atendente',
    texto: mensagem.texto,
    em: mensagem.em,
    waId: mensagem.waId,
    tipo: mensagem.tipo,
    status: 'enviada',
  })

  if (conv.estado !== 'humano') {
    estado.registrarMensagem(conv.id, {
      de: 'sistema',
      tipo: 'assumido',
      texto: 'Alguém da equipe respondeu pelo celular. As respostas automáticas estão pausadas.',
    })
    estado.atualizarConversa(conv.id, { estado: 'humano', naoLidas: 0 })
  }
}

/**
 * Recebe um lote de conversas trazido do celular e as coloca no sistema, em
 * silêncio (ver estado.sincronizarConversa). Devolve quantas conversas e
 * mensagens entraram de verdade — o que já existia não conta.
 */
export function importarHistorico(conexaoId, lote) {
  let conversas = 0
  let mensagens = 0
  for (const item of lote) {
    const r = estado.sincronizarConversa({ conexaoId, ...item })
    if (r.nova) conversas += 1
    mensagens += r.mensagens
  }
  if (lote.length) estado.avisarSincronizacao(conexaoId)
  return { conversas, mensagens }
}

/** Nomes de contato que o WhatsApp informou depois da conversa já existir. */
export function aplicarNomes(conexaoId, mudancas) {
  return estado.atualizarNomes(conexaoId, mudancas)
}

function jaRegistrada(conversaId, waId) {
  return Boolean(waId) && estado.mensagens(conversaId).some((m) => m.waId === waId)
}

/**
 * waId → conversa, das mensagens que ENVIAMOS. Cada recibo de entrega ou
 * leitura traz só o id da mensagem; sem este índice, cada recibo varreria o
 * histórico de todas as conversas — e depois de uma sincronização são
 * milhares.
 */
const conversaDaEnviada = new Map()

function lembrarEnviada(waId, conversaId) {
  if (!waId) return
  conversaDaEnviada.set(waId, conversaId)
  if (conversaDaEnviada.size > 3000) conversaDaEnviada.delete(conversaDaEnviada.keys().next().value)
}

export function atualizarStatus(status) {
  const corte = Date.now() - 3 * 24 * 60 * 60 * 1000
  for (const s of status) {
    let conversaId = conversaDaEnviada.get(s.waId)
    let mensagem = conversaId ? estado.mensagens(conversaId).find((m) => m.waId === s.waId) : null

    // não está no índice (o sistema reiniciou depois do envio): procura só nas conversas dos últimos dias
    if (!mensagem) {
      for (const conv of estado.conversas()) {
        if (Date.parse(conv.atualizadaEm) < corte) continue
        mensagem = estado.mensagens(conv.id).find((m) => m.waId === s.waId)
        if (mensagem) {
          conversaId = conv.id
          break
        }
      }
    }
    if (!mensagem) continue
    estado.atualizarMensagem(conversaId, mensagem.id, { status: s.status, erro: s.erro || null })
  }
}

/* ------------------------------------------------------------------ */
/* Espera antes de responder                                           */
/* ------------------------------------------------------------------ */

function agendarResposta(conversaId) {
  const espera = Math.max(0, Number(estado.ajustes().segundosDeEspera) || 0) * 1000

  const anterior = timersDeEspera.get(conversaId)
  if (anterior) clearTimeout(anterior)

  const timer = setTimeout(() => {
    timersDeEspera.delete(conversaId)
    responderConversa(conversaId).catch((erro) => {
      console.error('[atendimento] falha ao responder:', erro)
    })
  }, espera)

  timersDeEspera.set(conversaId, timer)
}

/* ------------------------------------------------------------------ */
/* Horário de atendimento                                              */
/* ------------------------------------------------------------------ */

function dentroDoHorario() {
  const { horario } = estado.ajustes()
  if (!horario?.ligado) return true

  const agora = new Date()
  if (!horario.dias?.includes(agora.getDay())) return false

  const minutos = agora.getHours() * 60 + agora.getMinutes()
  const [hi, mi] = String(horario.inicio || '00:00').split(':').map(Number)
  const [hf, mf] = String(horario.fim || '23:59').split(':').map(Number)
  return minutos >= hi * 60 + mi && minutos <= hf * 60 + mf
}

/* ------------------------------------------------------------------ */
/* Escolha do agente                                                   */
/* ------------------------------------------------------------------ */

function escolherAgente(conv, ultimoTexto) {
  // 1. quem já estava atendendo continua
  if (conv.agenteId) {
    const atual = estado.agente(conv.agenteId)
    if (atual?.ativo) return atual
  }
  // 2. curso já identificado antes
  if (conv.cursoId) {
    const doCurso = estado.agenteDoCurso(conv.cursoId)
    if (doCurso) return doCurso
  }
  // 3. palavra-chave na própria mensagem — de graça, sem chamar o modelo
  const porPalavra = agentePorPalavraChave(ultimoTexto || '')
  if (porPalavra) return porPalavra
  // 4. recepção
  return estado.agenteDeTriagem()
}

/* ------------------------------------------------------------------ */
/* Resposta                                                            */
/* ------------------------------------------------------------------ */

export async function responderConversa(conversaId) {
  if (trancadas.has(conversaId)) return
  const conv = estado.conversa(conversaId)
  if (!conv) return

  const ajustes = estado.ajustes()

  if (!ajustes.iaLigada) return
  if (conv.estado === 'humano') return

  const historico = estado.mensagens(conversaId)
  const ultima = [...historico].reverse().find((m) => m.de === 'cliente')
  if (!ultima) return

  // já respondemos depois dessa mensagem? então não há o que fazer
  const posicaoUltima = historico.lastIndexOf(ultima)
  const respondida = historico
    .slice(posicaoUltima + 1)
    .some((m) => m.de === 'agente' || m.de === 'atendente')
  if (respondida) return

  // sem o número conectado a resposta não sairia: não gasta uma chamada do modelo à toa
  if (conv.conexaoId && !conexoes.conectada(conv.conexaoId)) {
    estado.registrarMensagem(conversaId, {
      de: 'sistema',
      tipo: 'erro',
      texto: 'O número desta conversa está desconectado — nenhum agente respondeu. Reconecte em Conexões.',
    })
    estado.atualizarConversa(conversaId, { estado: 'aguardando' })
    return
  }

  if (!dentroDoHorario()) {
    const hoje = new Date().toISOString().slice(0, 10)
    if (avisoForaDoHorario.get(conversaId) !== hoje) {
      avisoForaDoHorario.set(conversaId, hoje)
      await enviar(conv, ajustes.horario.mensagemForaDoHorario, { de: 'sistema', tipo: 'aviso' })
    }
    estado.atualizarConversa(conversaId, { estado: 'aguardando' })
    return
  }

  if (!temChave()) {
    estado.registrarMensagem(conversaId, {
      de: 'sistema',
      tipo: 'erro',
      texto: 'Sem chave da API da Anthropic — nenhum agente pôde responder. Preencha em Ajustes.',
    })
    estado.atualizarConversa(conversaId, { estado: 'aguardando' })
    return
  }

  const agente = escolherAgente(conv, ultima.texto)
  if (!agente) {
    estado.registrarMensagem(conversaId, {
      de: 'sistema',
      tipo: 'erro',
      texto: 'Nenhum agente ativo para atender. Ative um agente na tela Agentes.',
    })
    return
  }

  trancadas.add(conversaId)
  publicar('digitando', { conversaId, agenteId: agente.id })
  if (conv.conexaoId) conexoes.digitando(conv.conexaoId, conv.jid || conv.telefone, true)

  try {
    const mensagensApi = historicoParaApi(historico, Number(ajustes.memoriaDeMensagens) || 24)
    if (!mensagensApi.length) return

    const resultado = await rodarAgente({
      agente,
      mensagensApi,
      contexto: {
        nomeContato: conv.nomeContato || conv.nomePerfil,
        lead: conv.lead,
        etiquetas: conv.etiquetas,
      },
    })

    await aplicarAcoes(conv, resultado)

    if (resultado.texto) {
      await enviar(conv, resultado.texto, {
        de: 'agente',
        agenteId: resultado.agenteId || agente.id,
        uso: resultado.uso,
      })
    }

    const conversaAgora = estado.conversa(conversaId)
    if (resultado.transferir) {
      estado.atualizarConversa(conversaId, { estado: 'humano', naoLidas: (conversaAgora?.naoLidas || 0) + 1 })
      estado.registrarMensagem(conversaId, {
        de: 'sistema',
        tipo: 'transferencia',
        texto: `Transferido para atendimento humano — ${rotuloMotivo(resultado.transferir.motivo)}. ${resultado.transferir.resumo}`,
      })
      estado.atualizarConversa(conversaId, { resumo: resultado.transferir.resumo })
    } else if (resultado.texto) {
      estado.atualizarConversa(conversaId, {
        estado: 'ia',
        agenteId: resultado.agenteId || agente.id,
      })
    }
  } catch (erro) {
    console.error('[atendimento] erro do agente:', erro)
    estado.registrarMensagem(conversaId, {
      de: 'sistema',
      tipo: 'erro',
      texto: `O agente não conseguiu responder: ${erro.message}`,
    })
    estado.atualizarConversa(conversaId, { estado: 'aguardando' })
  } finally {
    trancadas.delete(conversaId)
    publicar('parou-de-digitar', { conversaId })
    if (conv.conexaoId) conexoes.digitando(conv.conexaoId, conv.jid || conv.telefone, false)
  }
}

function rotuloMotivo(motivo) {
  const mapa = {
    financeiro: 'assunto financeiro',
    matricula: 'quer matricular',
    desconto: 'pediu desconto',
    reclamacao: 'reclamação',
    fora_do_catalogo: 'fora do catálogo',
    pedido_da_pessoa: 'a pessoa pediu',
    outro: 'outro motivo',
  }
  return mapa[motivo] || motivo
}

/** Aplica no cadastro o que o agente decidiu durante a conversa. */
async function aplicarAcoes(conv, resultado) {
  for (const acao of resultado.acoes || []) {
    if (acao.tipo === 'interesse') {
      const mudancas = { lead: {} }
      if (acao.nome) mudancas.lead.nome = acao.nome
      if (acao.curso) mudancas.lead.curso = acao.curso
      if (acao.etapa) mudancas.lead.etapa = acao.etapa
      if (acao.anotacao) mudancas.lead.anotacao = acao.anotacao
      if (acao.cursoId) mudancas.cursoId = acao.cursoId
      if (acao.nome && !conv.nomeContato) mudancas.nomeContato = acao.nome
      estado.atualizarConversa(conv.id, mudancas)
    }

    if (acao.tipo === 'troca-agente') {
      const destino = estado.agente(acao.paraId)
      estado.atualizarConversa(conv.id, {
        agenteId: acao.paraId,
        cursoId: destino?.cursoId || conv.cursoId,
      })
      estado.registrarMensagem(conv.id, {
        de: 'sistema',
        tipo: 'roteamento',
        texto: `Conversa passada para o agente ${destino?.nome || acao.paraId}${acao.motivo ? ` — ${acao.motivo}` : ''}.`,
      })
    }
  }
}

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/* ------------------------------------------------------------------ */

/**
 * Manda pelo mesmo caminho por onde a conversa chegou: o número (conexão por
 * QR) dela ou, se ela veio da API oficial, a API oficial. Sem nenhum dos
 * dois, falha com uma mensagem que diz o que fazer — nunca finge que enviou.
 */
async function transmitir(conv, texto) {
  if (conv.conexaoId) return conexoes.enviarTexto(conv.conexaoId, conv.jid || conv.telefone, texto)
  if (whatsapp.configurado()) return whatsapp.enviarTexto(conv.telefone, texto)
  throw new Error('Esta conversa não está ligada a um número conectado. Conecte o número em Conexões.')
}

/**
 * Registra a mensagem antes de mandar para o WhatsApp.
 *
 * Nessa ordem de propósito: se o WhatsApp recusar, o que foi tentado fica no
 * histórico marcado como falha, em vez de sumir sem deixar rastro.
 */
async function enviar(conv, texto, opcoes) {
  const mensagem = estado.registrarMensagem(conv.id, {
    ...opcoes,
    texto,
    status: 'enviando',
  })

  try {
    const waId = await transmitir(conv, texto)
    lembrarEnviada(waId, conv.id)
    estado.atualizarMensagem(conv.id, mensagem.id, { status: 'enviada', waId })
  } catch (erro) {
    estado.atualizarMensagem(conv.id, mensagem.id, { status: 'falhou', erro: erro.message })
  }
  return mensagem
}

/** Uma pessoa da equipe escreveu pela tela. */
export async function enviarComoAtendente(conversaId, texto) {
  const conv = estado.conversa(conversaId)
  if (!conv) return null
  const mensagem = await enviar(conv, texto, { de: 'atendente' })
  // quem escreve à mão assume a conversa: a IA para de responder
  estado.atualizarConversa(conversaId, { estado: 'humano', naoLidas: 0 })
  return mensagem
}

/* ------------------------------------------------------------------ */
/* Comandos da tela                                                    */
/* ------------------------------------------------------------------ */

export function assumir(conversaId) {
  const timer = timersDeEspera.get(conversaId)
  if (timer) {
    clearTimeout(timer)
    timersDeEspera.delete(conversaId)
  }
  estado.registrarMensagem(conversaId, {
    de: 'sistema',
    tipo: 'assumido',
    texto: 'Um atendente assumiu a conversa. As respostas automáticas estão pausadas.',
  })
  return estado.atualizarConversa(conversaId, { estado: 'humano', naoLidas: 0 })
}

export function devolverParaIA(conversaId) {
  estado.registrarMensagem(conversaId, {
    de: 'sistema',
    tipo: 'devolvido',
    texto: 'Conversa devolvida para o atendimento automático.',
  })
  const conv = estado.atualizarConversa(conversaId, { estado: 'ia' })
  agendarResposta(conversaId)
  return conv
}

export function resolver(conversaId) {
  return estado.atualizarConversa(conversaId, { estado: 'resolvida', naoLidas: 0 })
}

export function reabrir(conversaId) {
  return estado.atualizarConversa(conversaId, { estado: 'aguardando' })
}

/** Pede uma resposta agora, sem esperar. Botão "responder com IA". */
export async function responderAgora(conversaId) {
  const timer = timersDeEspera.get(conversaId)
  if (timer) {
    clearTimeout(timer)
    timersDeEspera.delete(conversaId)
  }
  estado.atualizarConversa(conversaId, { estado: 'ia' })
  await responderConversa(conversaId)
  return estado.conversa(conversaId)
}
