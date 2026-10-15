/** Peças reaproveitadas em várias telas. */
import React from 'react'
import { IconeFechar, IconePessoa } from './Icones'
import type { EstadoConversa } from '../tipos'

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */

export function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string
  dica?: string
  children: React.ReactNode
}) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      {children}
      {dica && <div className="dica">{dica}</div>}
    </div>
  )
}

export function Interruptor({
  ligado,
  aoMudar,
  children,
}: {
  ligado: boolean
  aoMudar: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="interruptor">
      <input type="checkbox" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
      {children}
    </label>
  )
}

export function Opcoes<T extends string>({
  valor,
  opcoes,
  aoMudar,
}: {
  valor: T
  opcoes: { valor: T; nome: string }[]
  aoMudar: (v: T) => void
}) {
  return (
    <div className="opcoes">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          className={valor === o.valor ? 'ativo' : ''}
          onClick={() => aoMudar(o.valor)}
        >
          {o.nome}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  titulo,
  subtitulo,
  largo,
  aoFechar,
  rodape,
  children,
}: {
  titulo: string
  subtitulo?: string
  largo?: boolean
  aoFechar: () => void
  rodape?: React.ReactNode
  children: React.ReactNode
}) {
  React.useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    <div className="cortina" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={`modal ${largo ? 'largo' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <div>
            <h3>{titulo}</h3>
            {subtitulo && (
              <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 2 }}>{subtitulo}</div>
            )}
          </div>
          <button className="btn-icone" onClick={aoFechar} title="Fechar (Esc)">
            <IconeFechar tamanho={16} />
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Diversos                                                            */
/* ------------------------------------------------------------------ */

export function Vazio({
  simbolo,
  titulo,
  texto,
  acao,
  solto,
}: {
  simbolo?: React.ReactNode
  titulo: string
  texto?: string
  acao?: React.ReactNode
  solto?: boolean
}) {
  return (
    <div className={`vazio ${solto ? 'solto' : ''}`}>
      {simbolo && <div className="simbolo">{simbolo}</div>}
      <h3>{titulo}</h3>
      {texto && <p>{texto}</p>}
      {acao}
    </div>
  )
}

/**
 * O círculo da pessoa: a foto de perfil do WhatsApp quando existe, senão as
 * duas primeiras letras do nome. `foto` é opcional — nem toda conversa tem de
 * onde buscar (API oficial, por exemplo) — e se a imagem falhar (perfil
 * privado, link vencido) cai para as iniciais sozinho, sem piscar erro.
 */
export function Avatar({
  nome,
  cor,
  pequeno,
  foto,
}: {
  nome: string
  cor?: string
  pequeno?: boolean
  foto?: string
}) {
  const [fotoFalhou, setFotoFalhou] = React.useState(false)
  // mudou o endereço da foto (ex.: acabou de trocar) — vale tentar de novo
  React.useEffect(() => setFotoFalhou(false), [foto])
  const iniciais = (nome || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  if (foto && !fotoFalhou) {
    return (
      <div className={`avatar ${pequeno ? 'pequeno' : ''}`}>
        <img
          src={foto}
          alt=""
          onError={() => setFotoFalhou(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
        />
      </div>
    )
  }

  return (
    <div className={`avatar ${pequeno ? 'pequeno' : ''}`} style={cor ? { background: cor } : undefined}>
      {/* sem nome (só o número): a silhueta, como o próprio WhatsApp — "5" de "5511…" não é inicial */}
      {iniciais || <IconePessoa tamanho={pequeno ? 14 : 18} />}
    </div>
  )
}

const ESTADOS: Record<EstadoConversa, { nome: string; classe: string }> = {
  aguardando: { nome: 'Aguardando', classe: 'amarela' },
  ia: { nome: 'Com a IA', classe: 'dourada' },
  humano: { nome: 'Com você', classe: 'azul' },
  resolvida: { nome: 'Resolvida', classe: 'verde' },
}

export function SeloEstado({ estado }: { estado: EstadoConversa }) {
  const e = ESTADOS[estado] || ESTADOS.aguardando
  return <span className={`etiqueta ${e.classe}`}>{e.nome}</span>
}

export function rotuloEstado(estado: EstadoConversa) {
  return (ESTADOS[estado] || ESTADOS.aguardando).nome
}

/**
 * Etapas do funil de interesse de um lead. "matriculado" e "perdido" são as
 * duas únicas que só uma pessoa da equipe marca — o agente de IA nunca fecha
 * matrícula nem desiste de um lead por conta própria (ver claude.js).
 */
const ETAPAS: Record<string, { nome: string; classe: string }> = {
  novo: { nome: 'Chegou agora', classe: 'azul' },
  curioso: { nome: 'Curioso', classe: 'azul' },
  interessado: { nome: 'Interessado', classe: 'amarela' },
  quer_visitar: { nome: 'Quer visitar', classe: 'amarela' },
  quer_matricular: { nome: 'Quer matricular', classe: 'dourada' },
  matriculado: { nome: 'Matriculado', classe: 'verde' },
  perdido: { nome: 'Perdido', classe: 'vermelha' },
}

export const ETAPAS_LEAD = Object.entries(ETAPAS).map(([valor, e]) => ({ valor, nome: e.nome }))

export function rotuloEtapa(etapa?: string) {
  return (ETAPAS[etapa || 'novo'] || ETAPAS.novo).nome
}

export function classeEtapa(etapa?: string) {
  return (ETAPAS[etapa || 'novo'] || ETAPAS.novo).classe
}

export function SeloEtapa({ etapa }: { etapa?: string }) {
  return <span className={`etiqueta ${classeEtapa(etapa)}`}>{rotuloEtapa(etapa)}</span>
}

/* ------------------------------------------------------------------ */
/* Datas e texto                                                       */
/* ------------------------------------------------------------------ */

export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function dia(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)

  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}

/** "agora", "há 5 min", "14:20", "12/09" — o que couber na lista. */
export function quando(iso: string) {
  const d = new Date(iso)
  const minutos = Math.floor((Date.now() - d.getTime()) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `${minutos} min`
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return hora(iso)
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * O título de uma conversa: o nome do contato como está salvo no celular e,
 * se a pessoa não está na agenda, o NÚMERO. (O nome que ela mesma pôs no
 * perfil acompanha, mas não vira título — ver `NomeDaConversa`.)
 */
export function tituloDaConversa(c: { nomeContato: string; telefone: string }) {
  return c.nomeContato || telefoneBonito(c.telefone) || 'Número oculto'
}

/** +55 11 98888-7777 a partir de 5511988887777. */
export function telefoneBonito(bruto: string) {
  const so = String(bruto || '').replace(/\D/g, '')
  if (so.length >= 12) {
    const pais = so.slice(0, so.length - 11)
    const ddd = so.slice(-11, -9)
    const parte1 = so.slice(-9, -4)
    const parte2 = so.slice(-4)
    return `+${pais} ${ddd} ${parte1}-${parte2}`
  }
  if (so.length === 11) return `${so.slice(0, 2)} ${so.slice(2, 7)}-${so.slice(7)}`
  return bruto
}
