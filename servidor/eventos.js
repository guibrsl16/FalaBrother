/**
 * Mural de eventos em tempo real.
 *
 * A tela precisa saber na hora que uma mensagem chegou, sem ficar
 * perguntando ao servidor de dois em dois segundos. Usamos SSE
 * (Server-Sent Events): uma conexão HTTP aberta, do servidor para o
 * navegador. É mais simples que WebSocket, atravessa proxy sem
 * configuração e reconecta sozinho — e aqui o tráfego é de mão única.
 */

/** resposta → { admin }. Quem está ouvindo, e se é quem administra. */
const ouvintes = new Map()

export function inscrever(resposta, { admin = false } = {}) {
  ouvintes.set(resposta, { admin })
  return () => ouvintes.delete(resposta)
}

/**
 * Manda um evento para todo mundo que está ouvindo. Com `soAdmin`, só para
 * quem administra: é o caso do QR de conexão do WhatsApp, que é uma
 * credencial — quem o lê consegue vincular o número a outro aparelho.
 */
export function publicar(tipo, dados, { soAdmin = false } = {}) {
  const pacote = `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`
  for (const [resposta, quem] of ouvintes) {
    if (soAdmin && !quem.admin) continue
    try {
      resposta.write(pacote)
    } catch {
      ouvintes.delete(resposta)
    }
  }
}

export function quantosOuvintes() {
  return ouvintes.size
}

/** Mantém a conexão viva quando ninguém fala há muito tempo. */
setInterval(() => {
  for (const resposta of ouvintes.keys()) {
    try {
      resposta.write(': ping\n\n')
    } catch {
      ouvintes.delete(resposta)
    }
  }
}, 25_000).unref()
