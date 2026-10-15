/**
 * WhatsApp Cloud API (Meta).
 *
 * Duas metades:
 *  - enviar: uma chamada HTTP para a Graph API;
 *  - receber: o webhook que a Meta chama quando alguém escreve para o número.
 *
 * A verificação de assinatura não é enfeite: o endereço do webhook é público,
 * e sem ela qualquer pessoa poderia forjar uma mensagem de cliente e fazer os
 * agentes responderem para um número qualquer.
 */
import crypto from 'node:crypto'
import { credenciais } from './estado.js'

function base() {
  const { whatsapp } = credenciais()
  return `https://graph.facebook.com/${whatsapp.versaoApi}`
}

export function configurado() {
  const { whatsapp } = credenciais()
  return Boolean(whatsapp.phoneNumberId && whatsapp.token)
}

/* ------------------------------------------------------------------ */
/* Enviar                                                              */
/* ------------------------------------------------------------------ */

export async function enviarTexto(telefone, texto) {
  const { whatsapp } = credenciais()
  if (!configurado()) {
    const erro = new Error('WhatsApp não configurado (falta Phone Number ID ou token).')
    erro.codigo = 'sem-configuracao'
    throw erro
  }

  const resposta = await fetch(`${base()}/${whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: telefone,
      type: 'text',
      text: { preview_url: false, body: texto },
    }),
  })

  const corpo = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    const detalhe = corpo?.error?.message || `HTTP ${resposta.status}`
    const erro = new Error(`WhatsApp recusou a mensagem: ${detalhe}`)
    erro.codigo = corpo?.error?.code || resposta.status
    throw erro
  }
  return corpo?.messages?.[0]?.id || null
}

/** Aquele "visto" azul. Falha aqui não pode derrubar o atendimento. */
export async function marcarComoLida(waMessageId) {
  const { whatsapp } = credenciais()
  if (!configurado() || !waMessageId) return
  try {
    await fetch(`${base()}/${whatsapp.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: waMessageId,
      }),
    })
  } catch (erro) {
    console.warn('[whatsapp] não consegui marcar como lida:', erro.message)
  }
}

/** Confere se o número e o token respondem. Usado na tela do canal. */
export async function testarConexao() {
  const { whatsapp } = credenciais()
  if (!configurado()) {
    return { ok: false, mensagem: 'Preencha o Phone Number ID e o token.' }
  }
  try {
    const resposta = await fetch(
      `${base()}/${whatsapp.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${whatsapp.token}` } },
    )
    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
      return { ok: false, mensagem: corpo?.error?.message || `HTTP ${resposta.status}` }
    }
    return {
      ok: true,
      numero: corpo.display_phone_number || '',
      nome: corpo.verified_name || '',
      qualidade: corpo.quality_rating || '',
    }
  } catch (erro) {
    return { ok: false, mensagem: erro.message }
  }
}

/* ------------------------------------------------------------------ */
/* Receber                                                             */
/* ------------------------------------------------------------------ */

/** Resposta do desafio que a Meta faz ao cadastrar o webhook. */
export function verificarWebhook(consulta) {
  const { whatsapp } = credenciais()
  const modo = consulta['hub.mode']
  const token = consulta['hub.verify_token']
  const desafio = consulta['hub.challenge']
  if (modo === 'subscribe' && token && token === whatsapp.verifyToken) {
    return desafio
  }
  return null
}

/**
 * Confere o cabeçalho X-Hub-Signature-256.
 *
 * Sem App Secret cadastrado devolvemos `true` para não travar quem ainda
 * está configurando — mas a tela do canal avisa que a conferência está
 * desligada, porque em produção isso precisa estar ligado.
 */
export function assinaturaConfere(cabecalho, corpoBruto) {
  const { whatsapp } = credenciais()
  if (!whatsapp.appSecret) return true
  if (!cabecalho || !corpoBruto) return false

  const esperado =
    'sha256=' + crypto.createHmac('sha256', whatsapp.appSecret).update(corpoBruto).digest('hex')

  const a = Buffer.from(cabecalho)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Achata o pacote da Meta (entry > changes > value) em uma lista simples.
 *
 * O formato deles é aninhado porque um único POST pode trazer mensagens de
 * vários números da mesma conta. Aqui não interessa essa estrutura.
 */
export function extrair(corpo) {
  const recebidas = []
  const status = []

  for (const entrada of corpo?.entry || []) {
    for (const mudanca of entrada?.changes || []) {
      const valor = mudanca?.value
      if (!valor) continue

      const contatos = new Map()
      for (const contato of valor.contacts || []) {
        contatos.set(contato.wa_id, contato?.profile?.name || '')
      }

      for (const m of valor.messages || []) {
        recebidas.push({
          waId: m.id,
          telefone: m.from,
          nomeContato: contatos.get(m.from) || '',
          em: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          ...conteudo(m),
        })
      }

      for (const s of valor.statuses || []) {
        status.push({ waId: s.id, status: s.status, erro: s.errors?.[0]?.title || null })
      }
    }
  }

  return { recebidas, status }
}

/**
 * Traduz cada tipo de mensagem do WhatsApp para texto.
 *
 * Áudio, imagem e documento chegam como um id de mídia que precisaria ser
 * baixado à parte. Por ora o agente recebe uma descrição do que veio, para
 * poder responder com naturalidade ("recebi seu áudio, pode me escrever?")
 * em vez de ficar mudo.
 */
function conteudo(m) {
  switch (m.type) {
    case 'text':
      return { tipo: 'texto', texto: m.text?.body || '' }
    case 'button':
      return { tipo: 'texto', texto: m.button?.text || '' }
    case 'interactive':
      return {
        tipo: 'texto',
        texto:
          m.interactive?.button_reply?.title ||
          m.interactive?.list_reply?.title ||
          '(resposta de menu)',
      }
    case 'audio':
      return {
        tipo: 'audio',
        texto: '[a pessoa mandou um áudio]',
        anexo: { tipo: 'audio', mediaId: m.audio?.id || null },
      }
    case 'image':
      return {
        tipo: 'imagem',
        texto: m.image?.caption ? `[imagem] ${m.image.caption}` : '[a pessoa mandou uma imagem]',
        anexo: { tipo: 'imagem', mediaId: m.image?.id || null },
      }
    case 'document':
      return {
        tipo: 'documento',
        texto: `[documento: ${m.document?.filename || 'arquivo'}]`,
        anexo: { tipo: 'documento', mediaId: m.document?.id || null },
      }
    case 'video':
      return {
        tipo: 'video',
        texto: '[a pessoa mandou um vídeo]',
        anexo: { tipo: 'video', mediaId: m.video?.id || null },
      }
    case 'location':
      return {
        tipo: 'localizacao',
        texto: '[a pessoa mandou a localização]',
        anexo: { tipo: 'localizacao', lat: m.location?.latitude, lng: m.location?.longitude },
      }
    case 'sticker':
      return { tipo: 'figurinha', texto: '[figurinha]' }
    case 'contacts':
      return { tipo: 'texto', texto: '[a pessoa mandou um contato]' }
    default:
      return { tipo: 'texto', texto: `[mensagem do tipo ${m.type}]` }
  }
}
