/** Identificador curto, único o bastante para uso local. */
let contador = 0
export function id(prefixo = '') {
  contador += 1
  return `${prefixo}${Date.now().toString(36)}${contador.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`
}

export function agora() {
  return new Date().toISOString()
}
