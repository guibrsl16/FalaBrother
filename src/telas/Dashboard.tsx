/**
 * Dashboard comercial: o funil de leads, de "chegou agora" até matrícula
 * fechada, e quem ficou pelo caminho. Diferente do Painel (que responde "o
 * atendimento está de pé?"), esta tela responde "o atendimento está vendendo?".
 *
 * Fechar matrícula ou marcar como perdido é sempre uma decisão de alguém da
 * equipe — o agente de IA só registra interesse, nunca fecha nada por conta
 * própria (ver a ferramenta registrar_interesse em servidor/claude.js).
 */
import { useMemo, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import {
  ETAPAS_LEAD,
  Opcoes,
  SeloEtapa,
  quando,
  telefoneBonito,
  tituloDaConversa,
} from '../componentes/Base'
import { IconeFechar, IconeResolver } from '../componentes/Icones'
import type { Conversa } from '../tipos'

export default function Dashboard({ aoIrPara }: { aoIrPara: (tela: string) => void }) {
  const loja = useLoja()
  const { conversas, cursos } = loja
  const [filtro, setFiltro] = useState('todas')

  // Lead = conversa em que já se sabe algo de quem está do outro lado. Um
  // contato que nunca demonstrou interesse (ou que só existe porque veio do
  // histórico do celular) não entra na conta — senão todo número sincronizado
  // vira "lead novo" e o funil mente.
  const leads = useMemo(
    () =>
      conversas.filter(
        (c) => !c.importada && (c.lead?.nome || c.lead?.curso || (c.lead?.etapa && c.lead.etapa !== 'novo')),
      ),
    [conversas],
  )

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const l of leads) {
      const e = l.lead?.etapa || 'novo'
      mapa.set(e, (mapa.get(e) || 0) + 1)
    }
    return mapa
  }, [leads])

  const matriculados = porEtapa.get('matriculado') || 0
  const perdidos = porEtapa.get('perdido') || 0
  const querMatricular = porEtapa.get('quer_matricular') || 0
  const conversao = leads.length ? Math.round((matriculados / leads.length) * 100) : 0

  const porCurso = useMemo(
    () =>
      cursos
        .map((c) => {
          const doCurso = leads.filter((l) => l.cursoId === c.id)
          return {
            cursoId: c.id,
            nome: c.nome,
            cor: c.cor,
            leads: doCurso.length,
            matriculados: doCurso.filter((l) => l.lead?.etapa === 'matriculado').length,
          }
        })
        .filter((c) => c.leads > 0)
        .sort((a, b) => b.leads - a.leads),
    [cursos, leads],
  )
  const maiorCurso = Math.max(1, ...porCurso.map((c) => c.leads))

  const listaFiltrada = useMemo(() => {
    const base = filtro === 'todas' ? leads : leads.filter((l) => (l.lead?.etapa || 'novo') === filtro)
    return [...base].sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
  }, [leads, filtro])

  async function marcar(conversa: Conversa, etapa: string) {
    try {
      loja.aplicarConversa(await api.atualizarConversa(conversa.id, { lead: { ...conversa.lead, etapa } }))
      loja.avisar(etapa === 'matriculado' ? 'Matrícula marcada como fechada.' : 'Lead marcado como perdido.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    }
  }

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>Dashboard</h1>
          <p>O funil comercial: quantos leads chegaram, em que etapa estão e quantas matrículas já fecharam.</p>
        </div>
      </div>

      <div className="grade g5" style={{ marginBottom: 16 }}>
        <div className="kpi destaque">
          <div className="rotulo">Leads no funil</div>
          <div className="valor">{leads.length}</div>
          <div className="rodape">conversas com interesse identificado</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Matrículas fechadas</div>
          <div className="valor" style={{ color: 'var(--verde)' }}>
            {matriculados}
          </div>
          <div className="rodape">marcadas pela equipe</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Taxa de conversão</div>
          <div className="valor">{conversao}%</div>
          <div className="rodape">leads que viraram matrícula</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Quer matricular agora</div>
          <div className="valor" style={{ color: 'var(--acento)' }}>
            {querMatricular}
          </div>
          <div className="rodape">precisam de um empurrão</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Perdidos</div>
          <div className="valor" style={{ color: 'var(--vermelho)' }}>
            {perdidos}
          </div>
          <div className="rodape">não vão fechar</div>
        </div>
      </div>

      <div className="grade g-2-1">
        {/* lista de leads */}
        <div className="cartao">
          <div className="cartao-cabecalho" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="cartao-titulo">Leads</div>
            <Opcoes
              valor={filtro}
              opcoes={[{ valor: 'todas', nome: 'Todas' }, ...ETAPAS_LEAD]}
              aoMudar={setFiltro}
            />
          </div>

          {listaFiltrada.length === 0 ? (
            <div style={{ padding: '26px 0', textAlign: 'center', color: 'var(--txt-3)', fontSize: 13 }}>
              Nenhum lead nessa etapa.
            </div>
          ) : (
            <div className="pilha-sm" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {listaFiltrada.map((l) => {
                const curso = cursos.find((c) => c.id === l.cursoId)
                const fechado = l.lead?.etapa === 'matriculado' || l.lead?.etapa === 'perdido'
                return (
                  <div
                    key={l.id}
                    className="fila"
                    style={{ padding: '8px 0', borderBottom: '1px solid var(--borda)', gap: 10 }}
                  >
                    <div className="crescer recortar">
                      <div className="fila" style={{ gap: 6 }}>
                        <strong style={{ fontSize: 13.5 }} className="recortar">
                          {l.lead?.nome || tituloDaConversa(l)}
                        </strong>
                        <SeloEtapa etapa={l.lead?.etapa} />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--txt-3)' }} className="recortar">
                        {curso?.nome || l.lead?.curso || 'curso ainda não identificado'} ·{' '}
                        {telefoneBonito(l.telefone) || 'número oculto'}
                      </div>
                    </div>
                    <span className="esmaecido" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                      {quando(l.atualizadaEm)}
                    </span>
                    {!fechado && (
                      <div className="fila" style={{ gap: 4 }}>
                        <button
                          className="btn-icone"
                          title="Marcar matrícula fechada"
                          onClick={() => marcar(l, 'matriculado')}
                          style={{ color: 'var(--verde)' }}
                        >
                          <IconeResolver tamanho={16} />
                        </button>
                        <button
                          className="btn-icone"
                          title="Marcar como perdido"
                          onClick={() => marcar(l, 'perdido')}
                          style={{ color: 'var(--vermelho)' }}
                        >
                          <IconeFechar tamanho={14} />
                        </button>
                      </div>
                    )}
                    <button className="btn pequeno fantasma" onClick={() => aoIrPara('conversas')}>
                      Abrir
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* funil + matrículas por curso */}
        <div className="pilha">
          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Funil</div>
            </div>
            <div className="pilha-sm" style={{ fontSize: 13 }}>
              {ETAPAS_LEAD.map((e) => {
                const total = porEtapa.get(e.valor) || 0
                return (
                  <div key={e.valor} className="fila" style={{ justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--txt-2)' }}>{e.nome}</span>
                    <strong className="num">{total}</strong>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Matrículas por curso</div>
            </div>
            {porCurso.length === 0 ? (
              <div style={{ color: 'var(--txt-3)', fontSize: 13 }}>Nenhum lead registrado ainda.</div>
            ) : (
              <div className="pilha-sm">
                {porCurso.map((c) => (
                  <div key={c.cursoId} className="pilha-sm" style={{ gap: 4 }}>
                    <div className="fila" style={{ fontSize: 12.5 }}>
                      <span className="crescer recortar">{c.nome}</span>
                      <strong className="num">
                        {c.matriculados}/{c.leads}
                      </strong>
                    </div>
                    <div className="progresso fino">
                      <i style={{ width: `${(c.leads / maiorCurso) * 100}%`, background: c.cor || 'var(--acento)' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
