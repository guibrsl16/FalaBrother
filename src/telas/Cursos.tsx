/**
 * O catálogo.
 *
 * Isto aqui não é vitrine: é a fonte de verdade dos agentes. Tudo o que
 * estiver escrito nesta tela pode ser dito no WhatsApp; tudo o que não
 * estiver, o agente é instruído a não inventar. Preço errado aqui vira
 * preço errado na conversa — por isso os campos são poucos e explícitos.
 */
import { useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Campo, Modal, Vazio } from '../componentes/Base'
import { IconeCursos, IconeLixeira, IconeMais } from '../componentes/Icones'
import type { Curso } from '../tipos'

const CORES = ['#D8AB55', '#4CC38A', '#56C2E8', '#B58CF0', '#F09A3E', '#39BFAE', '#6E86D6', '#E77FB4']

export default function Cursos() {
  const loja = useLoja()
  const { cursos, agentes, conversas } = loja
  const [editando, setEditando] = useState<Curso | null>(null)

  async function criar() {
    try {
      const novo = await api.criarCurso({ nome: 'Novo curso', cor: CORES[cursos.length % CORES.length] })
      loja.aplicarCursos([...cursos, novo])
      setEditando(novo)
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui criar.', 'erro')
    }
  }

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>Cursos</h1>
          <p>
            O que está aqui é o que os agentes podem dizer. O que não está, eles avisam que vão
            confirmar com a equipe — em vez de inventar.
          </p>
        </div>
        <button className="btn primario" onClick={criar}>
          <IconeMais tamanho={15} /> Novo curso
        </button>
      </div>

      {cursos.length === 0 ? (
        <Vazio
          simbolo={<IconeCursos tamanho={36} />}
          titulo="Catálogo vazio"
          texto="Cadastre os cursos da escola: é com essa ficha que os agentes respondem preço, duração e formato."
          acao={
            <button className="btn primario" onClick={criar}>
              Cadastrar o primeiro
            </button>
          }
        />
      ) : (
        <div className="tabela-caixa">
          <table>
            <thead>
              <tr>
                <th>Curso</th>
                <th>Investimento</th>
                <th>Duração</th>
                <th>Agente</th>
                <th className="dir">Conversas</th>
              </tr>
            </thead>
            <tbody>
              {cursos.map((c) => {
                const agente = agentes.find((a) => a.cursoId === c.id)
                const quantas = conversas.filter((v) => v.cursoId === c.id).length
                return (
                  <tr key={c.id} onClick={() => setEditando(c)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="fila">
                        <span
                          className="ponto-estado"
                          style={{ background: c.cor, width: 9, height: 9, flexBasis: 9 }}
                        />
                        <div>
                          <strong>{c.nome}</strong>
                          <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>{c.resumo}</div>
                        </div>
                      </div>
                    </td>
                    <td>{c.investimento || <span className="esmaecido">—</span>}</td>
                    <td>{c.duracao || <span className="esmaecido">—</span>}</td>
                    <td>
                      {agente ? (
                        <span className={`etiqueta ${agente.ativo ? 'verde' : 'vermelha'}`}>
                          {agente.ativo ? agente.nome : `${agente.nome} (off)`}
                        </span>
                      ) : (
                        <span className="etiqueta amarela">sem agente</span>
                      )}
                    </td>
                    <td className="dir num">{quantas}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && <EditorDeCurso curso={editando} aoFechar={() => setEditando(null)} />}
    </>
  )
}

function EditorDeCurso({ curso, aoFechar }: { curso: Curso; aoFechar: () => void }) {
  const loja = useLoja()
  const [rascunho, setRascunho] = useState<Curso>({ ...curso })

  function mexer(mudancas: Partial<Curso>) {
    setRascunho((atual) => ({ ...atual, ...mudancas }))
  }

  async function salvar() {
    try {
      const salvo = await api.salvarCurso(rascunho.id, rascunho)
      loja.aplicarCursos(loja.cursos.map((c) => (c.id === salvo.id ? salvo : c)))
      loja.avisar('Curso salvo.', 'ok')
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    }
  }

  async function apagar() {
    if (!confirm(`Apagar "${rascunho.nome}"? O agente ligado a ele é desativado, não apagado.`)) return
    try {
      loja.aplicarCursos(await api.apagarCurso(rascunho.id))
      loja.avisar('Curso apagado.', 'ok')
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui apagar.', 'erro')
    }
  }

  return (
    <Modal
      largo
      titulo={rascunho.nome || 'Curso'}
      subtitulo="Cada campo preenchido é uma coisa a menos que o agente precisa dizer que vai confirmar."
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn fantasma perigo" onClick={apagar} style={{ marginRight: 'auto' }}>
            <IconeLixeira tamanho={14} /> Apagar
          </button>
          <button className="btn fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primario" onClick={salvar}>
            Salvar curso
          </button>
        </>
      }
    >
      <div className="grade g2">
        <Campo rotulo="Nome">
          <input value={rascunho.nome} onChange={(e) => mexer({ nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Cor" dica="Usada nos avatares e nas etiquetas da lista de conversas.">
          <div className="fila quebra">
            {CORES.map((cor) => (
              <button
                key={cor}
                type="button"
                onClick={() => mexer({ cor })}
                title={cor}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: cor,
                  border: rascunho.cor === cor ? '2px solid var(--txt)' : '1px solid var(--borda)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </Campo>
      </div>

      <Campo rotulo="Resumo" dica="Uma frase. É o que o agente usa para apresentar o curso.">
        <input value={rascunho.resumo} onChange={(e) => mexer({ resumo: e.target.value })} />
      </Campo>

      <Campo rotulo="Para quem é" dica="Ajuda a Recepção a reconhecer quem deve vir para cá.">
        <input value={rascunho.publico} onChange={(e) => mexer({ publico: e.target.value })} />
      </Campo>

      <div className="grade g2">
        <Campo rotulo="Duração">
          <input
            value={rascunho.duracao}
            onChange={(e) => mexer({ duracao: e.target.value })}
            placeholder="4 meses · 2 encontros por semana"
          />
        </Campo>
        <Campo rotulo="Formato">
          <input
            value={rascunho.formato}
            onChange={(e) => mexer({ formato: e.target.value })}
            placeholder="Presencial, com computador para cada aluno"
          />
        </Campo>
      </div>

      <div className="grade g2">
        <Campo rotulo="Investimento" dica="Escreva exatamente como pode ser dito no WhatsApp.">
          <input
            value={rascunho.investimento}
            onChange={(e) => mexer({ investimento: e.target.value })}
            placeholder="Matrícula R$ 90 + 4x R$ 189"
          />
        </Campo>
        <Campo rotulo="Certificado">
          <input
            value={rascunho.certificado}
            onChange={(e) => mexer({ certificado: e.target.value })}
            placeholder="Certificado de 120 horas"
          />
        </Campo>
      </div>

      <Campo rotulo="Diferenciais" dica="Um por linha. São os argumentos que o agente usa quando a pessoa hesita.">
        <textarea
          value={(rascunho.diferenciais || []).join('\n')}
          onChange={(e) => mexer({ diferenciais: e.target.value.split('\n').filter((d) => d.trim()) })}
          rows={4}
        />
      </Campo>
    </Modal>
  )
}
