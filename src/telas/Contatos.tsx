/**
 * Diretório de contatos: todo mundo que já escreveu pro WhatsApp da escola,
 * separado em Cliente (já matriculou) e Lead (ainda não). É o mesmo dado do
 * funil do Dashboard (a etapa "matriculado"), só que numa lista simples de
 * consultar e filtrar — sem o funil inteiro por cima.
 */
import { useMemo, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Avatar, ehCliente, SeloTipoContato, quando, telefoneBonito, tituloDaConversa } from '../componentes/Base'
import { IconeBusca } from '../componentes/Icones'
import type { Conversa } from '../tipos'

type Filtro = 'todos' | 'cliente' | 'lead'

const FILTROS: { chave: Filtro; nome: string }[] = [
  { chave: 'todos', nome: 'Todos' },
  { chave: 'cliente', nome: 'Cliente' },
  { chave: 'lead', nome: 'Lead' },
]

function combina(conversa: Conversa, filtro: Filtro) {
  if (filtro === 'todos') return true
  if (filtro === 'cliente') return ehCliente(conversa)
  return !ehCliente(conversa)
}

export default function Contatos({ aoIrPara }: { aoIrPara: (tela: string) => void }) {
  const loja = useLoja()
  const { conversas, cursos } = loja
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')

  const ordenados = useMemo(
    () => [...conversas].sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm)),
    [conversas],
  )

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return ordenados.filter((c) => {
      if (!combina(c, filtro)) return false
      if (!termo) return true
      const digitos = termo.replace(/\D/g, '')
      return (
        c.nomeContato.toLowerCase().includes(termo) ||
        (c.nomePerfil || '').toLowerCase().includes(termo) ||
        (digitos !== '' && c.telefone.includes(digitos))
      )
    })
  }, [ordenados, filtro, busca])

  const contas = useMemo(() => {
    const total = ordenados.length
    const clientes = ordenados.filter(ehCliente).length
    return { todos: total, cliente: clientes, lead: total - clientes }
  }, [ordenados])

  async function alternarTipo(conversa: Conversa) {
    // "cliente" é a etapa matriculado do funil; tirar o selo de cliente volta
    // a pessoa para interessado — não para "novo", que soaria como se a
    // conversa nunca tivesse acontecido.
    const novaEtapa = ehCliente(conversa) ? 'interessado' : 'matriculado'
    try {
      loja.aplicarConversa(
        await api.atualizarConversa(conversa.id, { lead: { ...conversa.lead, etapa: novaEtapa } }),
      )
      loja.avisar(novaEtapa === 'matriculado' ? 'Marcado como cliente.' : 'Marcado como lead.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    }
  }

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>Contatos</h1>
          <p>Todo mundo que já escreveu pro WhatsApp da escola — cliente já matriculado, ou lead ainda em conversa.</p>
        </div>
      </div>

      <div className="cartao">
        <div className="cartao-cabecalho" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="busca crescer" style={{ minWidth: 220 }}>
            <span className="lupa">
              <IconeBusca tamanho={14} />
            </span>
            <input placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="filtros">
            {FILTROS.map((f) => (
              <button key={f.chave} className={filtro === f.chave ? 'ativo' : ''} onClick={() => setFiltro(f.chave)}>
                <span className="num">{contas[f.chave]}</span>
                <span className="rotulo-filtro">{f.nome}</span>
              </button>
            ))}
          </div>
        </div>

        {visiveis.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--txt-3)', fontSize: 13 }}>
            {conversas.length === 0 ? 'Nenhum contato ainda.' : 'Nada aqui com esse filtro.'}
          </div>
        ) : (
          <div className="pilha-sm" style={{ maxHeight: 620, overflowY: 'auto' }}>
            {visiveis.map((c) => {
              const curso = cursos.find((k) => k.id === c.cursoId)
              const cliente = ehCliente(c)
              return (
                <div
                  key={c.id}
                  className="fila"
                  style={{ padding: '9px 2px', borderBottom: '1px solid var(--borda)', gap: 10 }}
                >
                  <Avatar
                    nome={c.nomeContato}
                    cor={curso?.cor}
                    foto={c.conexaoId && c.telefone ? api.urlFotoContato(c.conexaoId, c.telefone) : undefined}
                  />
                  <div className="crescer recortar">
                    <div className="fila" style={{ gap: 6 }}>
                      <strong style={{ fontSize: 13.5 }} className="recortar">
                        {tituloDaConversa(c)}
                      </strong>
                      <SeloTipoContato conversa={c} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--txt-3)' }} className="recortar">
                      {telefoneBonito(c.telefone) || 'número oculto'}
                      {curso ? ` · ${curso.nome}` : ''}
                    </div>
                  </div>
                  <span className="esmaecido" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {quando(c.atualizadaEm)}
                  </span>
                  <button className="btn pequeno fantasma" onClick={() => alternarTipo(c)}>
                    {cliente ? 'Marcar como lead' : 'Marcar como cliente'}
                  </button>
                  <button className="btn pequeno fantasma" onClick={() => aoIrPara('conversas')}>
                    Abrir
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
