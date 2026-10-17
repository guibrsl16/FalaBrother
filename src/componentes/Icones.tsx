/**
 * Ícones em SVG traçado. Tudo local, sem biblioteca externa — o programa
 * precisa abrir rápido e continuar de pé se a internet oscilar.
 *
 * O brasão da Brotherhood é o mesmo do sistema financeiro da casa: escudo
 * marinho, livro aberto dourado com a pena e as três estrelas.
 */
import React from 'react'

const MARINHO = '#27336B'
const DOURADO = '#C9A24B'

interface Props extends React.SVGProps<SVGSVGElement> {
  tamanho?: number
}

function Svg({ tamanho = 18, children, ...resto }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  )
}

/** Conversas: dois balões, um atrás do outro. */
export const IconeConversas = (p: Props) => (
  <Svg {...p}>
    <path d="M8.5 15.5H6l-3 2.6V7.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" />
    <path d="M21 12.5v6.6l-2.4-2.1H12a2 2 0 0 1-2-2v-2.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2Z" />
  </Svg>
)

/** Agente de IA: cabeça de circuito — não é robô de desenho animado. */
export const IconeAgentes = (p: Props) => (
  <Svg {...p}>
    <rect x="4.5" y="7.5" width="15" height="12" rx="3" />
    <path d="M12 4.5v3M9.5 12.5h.01M14.5 12.5h.01" />
    <path d="M9.5 16.2c1.6.9 3.4.9 5 0" />
    <path d="M2.5 11.5v3.5M21.5 11.5v3.5" />
    <circle cx="12" cy="3.4" r="1.1" />
  </Svg>
)

/** Cursos: livro aberto — a mesma figura do brasão, em traço. */
export const IconeCursos = (p: Props) => (
  <Svg {...p}>
    <path d="M12 6.8C10.2 5.4 7.7 5 4 5.4v12.2c3.7-.4 6.2 0 8 1.4 1.8-1.4 4.3-1.8 8-1.4V5.4c-3.7-.4-6.2 0-8 1.4Z" />
    <path d="M12 6.8V19" />
  </Svg>
)

export const IconePainel = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="8.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="2" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="2" />
    <rect x="3" y="14.5" width="7.5" height="6.5" rx="2" />
  </Svg>
)

/** Dashboard comercial: a curva subindo — leads que avançam até a matrícula. */
export const IconeDashboard = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 3.5v15a2 2 0 0 0 2 2h15" />
    <path d="M4.5 16 9.5 10l3.7 3L20 5.5" />
    <path d="M14.3 5.5h5.7v5.7" />
  </Svg>
)

/** WhatsApp: o contorno do balão com o fone, em traço único. */
export const IconeWhatsapp = (p: Props) => (
  <Svg {...p}>
    <path d="M20.5 11.7a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.4A8.4 8.4 0 1 1 20.5 11.7Z" />
    <path d="M9.2 9c.2-.5.5-.5.8-.5h.5c.2 0 .4 0 .6.5l.7 1.6c.1.3 0 .5-.1.7l-.4.4c-.2.2-.2.4-.1.6.4.7 1.2 1.5 2 1.9.2.1.5.1.6-.1l.4-.5c.2-.2.4-.2.6-.1l1.5.8c.3.2.4.3.4.5s0 .9-.3 1.2c-.3.4-.9.7-1.4.7-1 0-2.6-.7-3.9-2-1.4-1.4-2.2-3-2.2-4 0-.6.2-1.1.5-1.5Z" />
  </Svg>
)

export const IconeAjustes = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Svg>
)

export const IconeBusca = (p: Props) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.3-4.3" />
  </Svg>
)

export const IconeEnviar = (p: Props) => (
  <Svg {...p}>
    <path d="M4.5 12 20 4.5l-3.4 15.5-4.5-5.4Z" />
    <path d="m12.1 14.6-7.6-2.6" />
  </Svg>
)

export const IconeMais = (p: Props) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconeFechar = (p: Props) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)

export const IconeLixeira = (p: Props) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
  </Svg>
)

/** Transferir para humano: uma pessoa recebendo a seta. */
export const IconeTransferir = (p: Props) => (
  <Svg {...p}>
    <circle cx="16.5" cy="7.5" r="3" />
    <path d="M21.5 20v-1.6a4 4 0 0 0-4-4h-2" />
    <path d="M9 12H2.5M5.5 8.5 2 12l3.5 3.5" />
  </Svg>
)

/** Devolver para a IA: seta voltando para o circuito. */
export const IconeDevolver = (p: Props) => (
  <Svg {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4v4h4" />
    <rect x="9.5" y="10" width="5" height="4.5" rx="1.4" />
  </Svg>
)

export const IconeResolver = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.3 12.2 2.6 2.6 4.8-5.2" />
  </Svg>
)

/** Testar agente: uma faísca. */
export const IconeFaisca = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 11l5.6-2Z" />
    <path d="M18.5 17.5 19 19l1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5Z" />
  </Svg>
)

export const IconePessoa = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20.5v-1a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5v1" />
  </Svg>
)

/** Contatos: a agenda — um cartão com a pessoa dentro. */
export const IconeContatos = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="9.5" cy="10.5" r="2.3" />
    <path d="M5.8 16.3a3.9 3.9 0 0 1 7.4 0" />
    <path d="M15.5 9.5h3M15.5 13h3" />
  </Svg>
)

/** Relógio: quem está esperando resposta. */
export const IconeRelogio = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3.2 2" />
  </Svg>
)

export const IconeVoltar = (p: Props) => (
  <Svg {...p}>
    <path d="M15 5.5 8.5 12l6.5 6.5" />
  </Svg>
)

/** Documento: a folha com o canto dobrado. */
export const IconeDocumento = (p: Props) => (
  <Svg {...p}>
    <path d="M7 3.5h7l4 4v12a1.3 1.3 0 0 1-1.3 1.3H7A1.3 1.3 0 0 1 5.7 19.5V4.8A1.3 1.3 0 0 1 7 3.5Z" />
    <path d="M14 3.5v3.3A1.2 1.2 0 0 0 15.2 8h3.3" />
  </Svg>
)

export const IconeCopiar = (p: Props) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
    <path d="M15 6.5V5.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2V13a2 2 0 0 0 2 2h1" />
  </Svg>
)

export const IconeTema = (p: Props) => (
  <Svg {...p}>
    <path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a6.8 6.8 0 0 0 10.8 10.8Z" />
  </Svg>
)

/** Conexões: dois elos de corrente — números ligados ao sistema. */
export const IconeConexoes = (p: Props) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
)

/** Sair: a porta e a seta para fora. */
export const IconeSair = (p: Props) => (
  <Svg {...p}>
    <path d="M9.5 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3.5" />
    <path d="M15 8.5 18.5 12 15 15.5M18.5 12H9.5" />
  </Svg>
)

/* ---------------------------------------------------------------- */
/* Brasão                                                            */
/* ---------------------------------------------------------------- */

function estrela(cx: number, cy: number, rExterno: number, rInterno: number) {
  const pontos: string[] = []
  for (let i = 0; i < 10; i += 1) {
    const angulo = (Math.PI / 5) * i - Math.PI / 2
    const r = i % 2 === 0 ? rExterno : rInterno
    pontos.push(`${(cx + r * Math.cos(angulo)).toFixed(1)},${(cy + r * Math.sin(angulo)).toFixed(1)}`)
  }
  return pontos.join(' ')
}

/** `semNome` força o brasão sem o texto interno, mesmo em tamanho grande. */
export function Logo({ tamanho = 22, semNome = false }: { tamanho?: number; semNome?: boolean }) {
  const comNome = !semNome && tamanho >= 56
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <path d="M80 4 L146 21 V88 C146 121 118 144 80 157 C42 144 14 121 14 88 V21 Z" fill="#FFFFFF" />
      <path d="M80 12 L139 27 V87 C139 116 114 136 80 148 C46 136 21 116 21 87 V27 Z" fill={MARINHO} />
      <g transform={comNome ? undefined : 'translate(0,14)'}>
        <path
          d="M40 58 C52 50 68 49 80 55 C92 49 108 50 120 58 L120 66 C108 59 92 60 80 66 C68 60 52 59 40 66 Z"
          fill={DOURADO}
        />
        <path d="M44 56 C55 48 70 47 80 53 L80 62 C70 57 55 56 44 62 Z" fill="#FFFFFF" />
        <path d="M116 56 C105 48 90 47 80 53 L80 62 C90 57 105 56 116 62 Z" fill="#FFFFFF" />
        <path d="M84 46 C92 36 106 30 116 30 C112 38 100 46 88 49 Z" fill={DOURADO} />
      </g>
      {comNome && (
        <>
          <text
            x="80"
            y="92"
            textAnchor="middle"
            fontFamily="'Segoe UI', Arial, sans-serif"
            fontSize="13.5"
            fontWeight="800"
            letterSpacing="0.4"
            fill="#FFFFFF"
          >
            BROTHERHOOD
          </text>
          <text
            x="80"
            y="105"
            textAnchor="middle"
            fontFamily="'Segoe UI', Arial, sans-serif"
            fontSize="8.5"
            fontWeight="600"
            letterSpacing="3.4"
            fill={DOURADO}
          >
            CURSOS
          </text>
        </>
      )}
      <polygon points={estrela(62, comNome ? 124 : 118, 8, 3.4)} fill={DOURADO} stroke="#FFFFFF" strokeWidth="1.1" />
      <polygon points={estrela(98, comNome ? 124 : 118, 8, 3.4)} fill={DOURADO} stroke="#FFFFFF" strokeWidth="1.1" />
      <polygon points={estrela(80, comNome ? 121 : 114, 9.5, 4)} fill={DOURADO} stroke="#FFFFFF" strokeWidth="1.2" />
    </svg>
  )
}
