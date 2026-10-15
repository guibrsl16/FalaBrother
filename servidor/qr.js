/**
 * Desenha um QR Code como imagem (data URL em PNG).
 *
 * Serve a dois usos: o pareamento do celular na verificação em duas etapas
 * e o QR de conexão do WhatsApp. Sempre escuro sobre branco, nos dois temas:
 * leitor de câmera não lê QR invertido.
 */
import QRCode from 'qrcode'

/**
 * @param {string} texto  o que o QR carrega
 * @param {{ largura?: number, escala?: number, correcao?: 'L'|'M'|'Q'|'H' }} [opcoes]
 *   `largura` fixa o tamanho da imagem; `escala` fixa os pixels de cada
 *   quadradinho (inteiro: bordas nítidas, que a câmera lê melhor). O QR do
 *   WhatsApp é um texto comprido, então usa correção baixa ('L') e escala.
 */
export function qrComoImagem(texto, { largura = 240, escala, correcao = 'M' } = {}) {
  return QRCode.toDataURL(texto, {
    ...(escala ? { scale: escala } : { width: largura }),
    margin: 2,
    errorCorrectionLevel: correcao,
    color: { dark: '#14182a', light: '#ffffff' },
  })
}
