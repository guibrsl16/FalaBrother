/**
 * O código de 6 dígitos da verificação em duas etapas (TOTP, RFC 6238).
 *
 * É o mesmo padrão do Google Authenticator, Microsoft Authenticator, Authy,
 * 1Password e afins: celular e servidor dividem um segredo e, a cada 30
 * segundos, cada um calcula o mesmo número a partir dele e da hora. O
 * segredo viaja uma única vez — dentro do QR Code, no pareamento.
 *
 * Sem biblioteca de TOTP de propósito: são vinte linhas de HMAC, e o que
 * entra no sistema fica à vista. O desenho do QR fica em qr.js.
 */
import crypto from 'node:crypto'

const PERIODO = 30
const DIGITOS = 6
const ALFABETO_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
/** Sem I, O, 0 e 1: o código de recuperação costuma ser copiado de papel. */
const ALFABETO_RECUPERACAO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const QUANTOS_CODIGOS = 8

/* ------------------------------------------------------------------ */
/* Base32 (o formato em que os apps pedem o segredo)                   */
/* ------------------------------------------------------------------ */

function codificarBase32(buf) {
  let valor = 0
  let bits = 0
  let saida = ''
  for (const byte of buf) {
    valor = (valor << 8) | byte
    bits += 8
    while (bits >= 5) {
      saida += ALFABETO_B32[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
    valor &= (1 << bits) - 1 // guarda só as sobras, para não estourar
  }
  if (bits > 0) saida += ALFABETO_B32[(valor << (5 - bits)) & 31]
  return saida
}

function decodificarBase32(texto) {
  let valor = 0
  let bits = 0
  const saida = []
  for (const letra of String(texto).replace(/=+$/, '').toUpperCase()) {
    const i = ALFABETO_B32.indexOf(letra)
    if (i < 0) throw new Error('segredo em base32 inválido')
    valor = (valor << 5) | i
    bits += 5
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255)
      bits -= 8
    }
    valor &= (1 << bits) - 1
  }
  return Buffer.from(saida)
}

/* ------------------------------------------------------------------ */
/* O código                                                            */
/* ------------------------------------------------------------------ */

/** Segredo novo: 160 bits, o tamanho que os apps esperam. */
export function gerarSegredo() {
  return codificarBase32(crypto.randomBytes(20))
}

export function passoAtual(agora = Date.now()) {
  return Math.floor(agora / 1000 / PERIODO)
}

/** O número de 6 dígitos de um passo de 30 segundos. */
export function codigoDoPasso(segredo, passo) {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(passo))
  const h = crypto.createHmac('sha1', decodificarBase32(segredo)).update(contador).digest()
  const i = h[h.length - 1] & 0x0f
  const n = ((h[i] & 0x7f) << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3]
  return String(n % 10 ** DIGITOS).padStart(DIGITOS, '0')
}

function iguais(a, b) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/**
 * Confere o código digitado e devolve o passo em que ele bateu, ou null.
 *
 * Aceita o passo atual e um para cada lado (±30 s), porque relógio de
 * celular nunca é exato. E recusa qualquer passo que já foi usado
 * (`ultimoPasso`): sem isso, um código espiado por cima do ombro valeria de
 * novo durante um minuto.
 */
export function verificar(segredo, codigo, ultimoPasso = 0, agora = Date.now()) {
  const limpo = String(codigo || '').replace(/\D/g, '')
  if (limpo.length !== DIGITOS) return null
  const atual = passoAtual(agora)
  for (const delta of [0, -1, 1]) {
    const passo = atual + delta
    if (passo <= ultimoPasso) continue
    if (iguais(codigoDoPasso(segredo, passo), limpo)) return passo
  }
  return null
}

/* ------------------------------------------------------------------ */
/* QR Code                                                             */
/* ------------------------------------------------------------------ */

/** O endereço otpauth:// que o app lê do QR. */
export function uriOtpauth({ segredo, email, emissor }) {
  const rotulo = encodeURIComponent(`${emissor}:${email}`)
  // encodeURIComponent, não URLSearchParams: o segundo troca espaço por "+",
  // e vários apps mostrariam "Brotherhood+Cursos"
  return (
    `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}` +
    `&algorithm=SHA1&digits=${DIGITOS}&period=${PERIODO}`
  )
}

/* ------------------------------------------------------------------ */
/* Códigos de recuperação                                              */
/* ------------------------------------------------------------------ */

function normalizarRecuperacao(codigo) {
  return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashDeRecuperacao(codigo) {
  return crypto.createHash('sha256').update(normalizarRecuperacao(codigo)).digest('hex')
}

/**
 * Oito códigos de uso único, para quem perder o celular. Voltam em claro
 * uma vez só (para a pessoa guardar); no disco ficam apenas os hashes.
 */
export function gerarCodigosDeRecuperacao() {
  const codigos = []
  for (let n = 0; n < QUANTOS_CODIGOS; n += 1) {
    let c = ''
    for (let i = 0; i < 10; i += 1) c += ALFABETO_RECUPERACAO[crypto.randomInt(ALFABETO_RECUPERACAO.length)]
    codigos.push(`${c.slice(0, 5)}-${c.slice(5)}`)
  }
  return { codigos, hashes: codigos.map(hashDeRecuperacao) }
}
