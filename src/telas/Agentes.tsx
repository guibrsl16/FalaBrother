/**
 * Os agentes de IA — um para cada tipo de curso.
 *
 * A ideia é simples e vale repetir: um agente é um texto de instruções mais
 * um catálogo. Quem escreve bem o texto tem um bom atendente; quem escreve
 * mal tem um robô. Por isso o editor dá tanto espaço para as instruções e
 * traz um banco de provas ao lado, para testar antes de soltar no WhatsApp.
 */
import React, { useMemo, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Campo, Interruptor, Modal, Opcoes, Vazio } from '../componentes/Base'
import { IconeAgentes, IconeFaisca, IconeLixeira, IconeMais } from '../componentes/Icones'
import type { Agente, Esforco, ResultadoTeste } from '../tipos'

const ESFORCOS: { valor: Esforco; nome: string }[] = [
  { valor: 'low', nome: 'Rápido' },
  { valor: 'medium', nome: 'Médio' },
  { valor: 'high', nome: 'Cuidadoso' },
]

export default function Agentes() {
  const loja = useLoja()
  const { agentes, cursos, conversas, canal } = loja
  const [editando, setEditando] = useState<Agente | null>(null)

  const conversasPorAgente = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const c of conversas) {
      if (c.agenteId) mapa[c.agenteId] = (mapa[c.agenteId] || 0) + 1
    }
    return mapa
  }, [conversas])

  const cursosSemAgente = useMemo(
    () => cursos.filter((c) => !agentes.some((a) => a.cursoId === c.id)),
    [cursos, agentes],
  )

  async function criar(cursoId?: string) {
    const curso = cursos.find((c) => c.id === cursoId)
    try {
      const novo = await api.criarAgente({
        nome: curso ? curso.nome : 'Novo agente',
        papel: curso ? `Especialista em ${curso.nome}` : '',
        cursoId: cursoId || null,
        palavrasChave: curso ? [curso.nome.toLowerCase()] : [],
        instrucoes: curso
          ? `Você é o especialista em ${curso.nome} da Brotherhood Cursos.\n\nQUEM CHEGA ATÉ VOCÊ\n\n\nO QUE PERGUNTAR\n-\n\nO QUE DESTACAR\n-`
          : '',
        regrasEscalonamento:
          'Transfira para um atendente quando a pessoa pedir desconto, quiser fechar a matrícula, reclamar de algo ou falar de dinheiro já pago.',
      })
      setEditando(novo)
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui criar.', 'erro')
    }
  }

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>Agentes</h1>
          <p>
            Cada curso tem o seu especialista, e a Recepção atende primeiro para descobrir do que a
            pessoa precisa. Todos rodam no <strong>{canal.modelo || 'claude-sonnet-5'}</strong>.
          </p>
        </div>
        <div className="fila">
          <button className="btn primario" onClick={() => criar()}>
            <IconeMais tamanho={15} /> Novo agente
          </button>
        </div>
      </div>

      {cursosSemAgente.length > 0 && (
        <div className="cartao" style={{ marginBottom: 18 }}>
          <div className="fila quebra" style={{ gap: 10 }}>
            <div className="crescer">
              <strong style={{ fontSize: 13.5 }}>
                {cursosSemAgente.length === 1
                  ? 'Um curso ainda não tem agente'
                  : `${cursosSemAgente.length} cursos ainda não têm agente`}
              </strong>
              <div style={{ fontSize: 12.5, color: 'var(--txt-3)', marginTop: 3 }}>
                Sem agente próprio, quem perguntar sobre eles cai na Recepção e a conversa fica genérica.
              </div>
            </div>
            {cursosSemAgente.map((c) => (
              <button key={c.id} className="btn pequeno" onClick={() => criar(c.id)}>
                <IconeMais tamanho={13} /> {c.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {agentes.length === 0 ? (
        <Vazio
          simbolo={<IconeAgentes tamanho={36} />}
          titulo="Nenhum agente ainda"
          texto="Crie um agente por curso. Ele responde no WhatsApp usando o catálogo e as instruções que você escrever."
          acao={
            <button className="btn primario" onClick={() => criar()}>
              Criar o primeiro
            </button>
          }
        />
      ) : (
        <div className="grade g3">
          {agentes.map((a) => {
            const curso = cursos.find((c) => c.id === a.cursoId)
            return (
              <button
                key={a.id}
                className={`agente-cartao ${a.ativo ? '' : 'desligado'}`}
                style={{ '--cor-agente': curso?.cor || 'var(--acento)' } as React.CSSProperties}
                onClick={() => setEditando(a)}
              >
                <div className="topo">
                  <div className="crescer">
                    <div className="nome">{a.nome}</div>
                    <div className="papel">{a.papel || (a.triagem ? 'Triagem' : 'Sem função definida')}</div>
                  </div>
                  {a.triagem && <span className="etiqueta dourada">recepção</span>}
                </div>

                <div className="instrucao-previa">
                  {a.instrucoes?.trim() || 'Sem instruções — este agente vai improvisar. Vale escrever.'}
                </div>

                <div className="rodape">
                  <span className={`etiqueta ${a.ativo ? 'verde' : 'vermelha'}`}>
                    {a.ativo ? 'ativo' : 'desligado'}
                  </span>
                  {curso && (
                    <span className="etiqueta" style={{ color: curso.cor, borderColor: `${curso.cor}55` }}>
                      {curso.nome}
                    </span>
                  )}
                  <div className="crescer" />
                  <span style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>
                    {conversasPorAgente[a.id] || 0} conversas
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editando && (
        <EditorDeAgente
          agente={editando}
          aoFechar={() => setEditando(null)}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function EditorDeAgente({ agente, aoFechar }: { agente: Agente; aoFechar: () => void }) {
  const loja = useLoja()
  const [rascunho, setRascunho] = useState<Agente>({ ...agente })
  const [aba, setAba] = useState<'instrucoes' | 'roteamento' | 'faq' | 'teste'>('instrucoes')
  const [salvando, setSalvando] = useState(false)

  function mexer(mudancas: Partial<Agente>) {
    setRascunho((atual) => ({ ...atual, ...mudancas }))
  }

  async function salvar() {
    setSalvando(true)
    try {
      const salvo = await api.salvarAgente(rascunho.id, rascunho)
      loja.aplicarAgentes(loja.agentes.map((a) => (a.id === salvo.id ? salvo : a)))
      loja.avisar('Agente salvo.', 'ok')
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    if (!confirm(`Apagar o agente "${rascunho.nome}"? As conversas dele voltam para a Recepção.`)) return
    try {
      loja.aplicarAgentes(await api.apagarAgente(rascunho.id))
      loja.avisar('Agente apagado.', 'ok')
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui apagar.', 'erro')
    }
  }

  return (
    <Modal
      largo
      titulo={rascunho.nome || 'Agente'}
      subtitulo={`${rascunho.modelo} · ${rascunho.ativo ? 'ativo' : 'desligado'}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn fantasma perigo" onClick={apagar} style={{ marginRight: 'auto' }}>
            <IconeLixeira tamanho={14} /> Apagar
          </button>
          <button className="btn fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar agente'}
          </button>
        </>
      }
    >
      {/* identificação */}
      <div className="grade g2">
        <Campo rotulo="Nome">
          <input value={rascunho.nome} onChange={(e) => mexer({ nome: e.target.value })} />
        </Campo>
        <Campo rotulo="Função" dica="Aparece só para a equipe, não para o cliente.">
          <input
            value={rascunho.papel}
            onChange={(e) => mexer({ papel: e.target.value })}
            placeholder="Especialista em Excel Profissional"
          />
        </Campo>
      </div>

      <div className="grade g2">
        <Campo rotulo="Curso" dica="O agente recebe a ficha completa deste curso.">
          <select value={rascunho.cursoId || ''} onChange={(e) => mexer({ cursoId: e.target.value || null })}>
            <option value="">— nenhum (agente geral) —</option>
            {loja.cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <div className="pilha-sm" style={{ justifyContent: 'center' }}>
          <Interruptor ligado={rascunho.ativo} aoMudar={(v) => mexer({ ativo: v })}>
            Ativo — pode receber conversas
          </Interruptor>
          <Interruptor ligado={rascunho.triagem} aoMudar={(v) => mexer({ triagem: v })}>
            É a Recepção — atende primeiro e roteia
          </Interruptor>
        </div>
      </div>

      <div className="opcoes" style={{ alignSelf: 'flex-start' }}>
        {(
          [
            ['instrucoes', 'Instruções'],
            ['roteamento', 'Roteamento'],
            ['faq', 'Respostas prontas'],
            ['teste', 'Testar'],
          ] as const
        ).map(([chave, nome]) => (
          <button key={chave} className={aba === chave ? 'ativo' : ''} onClick={() => setAba(chave)}>
            {nome}
          </button>
        ))}
      </div>

      {aba === 'instrucoes' && (
        <>
          <Campo
            rotulo="Instruções do agente"
            dica="Quem ele é, quem costuma procurar por ele, o que perguntar e o que destacar. Escreva como se estivesse treinando alguém no primeiro dia."
          >
            <textarea
              className="instrucoes"
              value={rascunho.instrucoes}
              onChange={(e) => mexer({ instrucoes: e.target.value })}
            />
          </Campo>

          <Campo
            rotulo="Quando chamar um humano"
            dica="O agente tem uma ferramenta de transferência. Aqui você diz quando usá-la."
          >
            <textarea
              value={rascunho.regrasEscalonamento}
              onChange={(e) => mexer({ regrasEscalonamento: e.target.value })}
              rows={3}
            />
          </Campo>

          <Campo rotulo="Saudação" dica="Opcional. Serve de exemplo de tom; o agente não repete literalmente.">
            <input
              value={rascunho.saudacao}
              onChange={(e) => mexer({ saudacao: e.target.value })}
              placeholder="Oi! Aqui é a Brotherhood Cursos…"
            />
          </Campo>

          <div className="divisor" />

          <div className="grade g3">
            <Campo rotulo="Modo" dica="Rápido serve para 9 de cada 10 conversas.">
              <Opcoes
                valor={rascunho.esforco}
                opcoes={ESFORCOS}
                aoMudar={(v) => mexer({ esforco: v })}
              />
            </Campo>
            <Campo rotulo="Tamanho da resposta" dica="Limite de tokens. WhatsApp pede mensagem curta.">
              <input
                type="number"
                min={128}
                max={4096}
                step={128}
                value={rascunho.maxTokens}
                onChange={(e) => mexer({ maxTokens: Number(e.target.value) })}
              />
            </Campo>
            <div className="campo" style={{ justifyContent: 'flex-end' }}>
              <Interruptor ligado={rascunho.raciocinio} aoMudar={(v) => mexer({ raciocinio: v })}>
                Pensar antes de responder
              </Interruptor>
              <div className="dica">Mais preciso em caso difícil, mais lento e mais caro.</div>
            </div>
          </div>
        </>
      )}

      {aba === 'roteamento' && (
        <>
          <Campo
            rotulo="Palavras que trazem a conversa para cá"
            dica="Separadas por vírgula. Quando a pessoa escreve uma delas, a conversa vem direto para este agente — sem gastar uma chamada de IA para decidir."
          >
            <textarea
              value={(rascunho.palavrasChave || []).join(', ')}
              onChange={(e) =>
                mexer({
                  palavrasChave: e.target.value
                    .split(',')
                    .map((p) => p.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
              placeholder="excel, planilha, procv, tabela dinâmica"
            />
          </Campo>

          <div className="cartao">
            <div className="cartao-titulo" style={{ marginBottom: 10 }}>
              Como a conversa chega até aqui
            </div>
            <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.75 }}>
              <li>Se a conversa já tem agente, ele continua.</li>
              <li>Se o curso de interesse já foi identificado, vai para o agente daquele curso.</li>
              <li>Se a mensagem tem uma das palavras acima, vem para cá.</li>
              <li>Se nada disso acontecer, a Recepção atende e decide.</li>
            </ol>
          </div>
        </>
      )}

      {aba === 'faq' && <EditorFaq rascunho={rascunho} mexer={mexer} />}

      {aba === 'teste' && <BancoDeProvas agente={rascunho} />}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Respostas prontas                                                   */
/* ------------------------------------------------------------------ */

function EditorFaq({
  rascunho,
  mexer,
}: {
  rascunho: Agente
  mexer: (m: Partial<Agente>) => void
}) {
  const lista = rascunho.perguntasFrequentes || []

  function mudar(i: number, campo: 'pergunta' | 'resposta', valor: string) {
    const copia = lista.map((item, j) => (i === j ? { ...item, [campo]: valor } : item))
    mexer({ perguntasFrequentes: copia })
  }

  return (
    <div className="pilha">
      <div style={{ fontSize: 12.5, color: 'var(--txt-3)', lineHeight: 1.55 }}>
        Perguntas que aparecem toda semana. O agente usa a resposta como está — é o jeito de garantir
        que a informação sai sempre igual, sem variação de redação.
      </div>

      {lista.map((item, i) => (
        <div className="cartao" key={i}>
          <div className="pilha-sm">
            <input
              placeholder="Pergunta — ex.: tem certificado?"
              value={item.pergunta}
              onChange={(e) => mudar(i, 'pergunta', e.target.value)}
            />
            <textarea
              placeholder="Resposta exata que o agente deve dar"
              value={item.resposta}
              onChange={(e) => mudar(i, 'resposta', e.target.value)}
              rows={2}
            />
            <div className="fila-fim">
              <button
                className="btn pequeno fantasma perigo"
                onClick={() => mexer({ perguntasFrequentes: lista.filter((_, j) => j !== i) })}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        className="btn"
        onClick={() => mexer({ perguntasFrequentes: [...lista, { pergunta: '', resposta: '' }] })}
      >
        <IconeMais tamanho={14} /> Adicionar pergunta
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Banco de provas                                                     */
/* ------------------------------------------------------------------ */

function BancoDeProvas({ agente }: { agente: Agente }) {
  const loja = useLoja()
  const [historico, setHistorico] = useState<{ de: string; texto: string }[]>([])
  const [texto, setTexto] = useState('')
  const [rodando, setRodando] = useState(false)
  const [ultimo, setUltimo] = useState<ResultadoTeste | null>(null)

  async function mandar() {
    const limpo = texto.trim()
    if (!limpo || rodando) return
    const novo = [...historico, { de: 'cliente', texto: limpo }]
    setHistorico(novo)
    setTexto('')
    setRodando(true)
    try {
      const resultado = await api.testarAgente(agente.id, novo)
      setUltimo(resultado)
      if (resultado.texto) {
        setHistorico([...novo, { de: 'agente', texto: resultado.texto }])
      }
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'O teste falhou.', 'erro')
      setHistorico(novo)
    } finally {
      setRodando(false)
    }
  }

  return (
    <div className="pilha">
      <div style={{ fontSize: 12.5, color: 'var(--txt-3)', lineHeight: 1.55 }}>
        Conversa de mentira, com o agente <strong>como está salvo</strong> — mudanças que você ainda
        não salvou não valem aqui. Nada é enviado pelo WhatsApp e nada entra no histórico.
      </div>

      <div
        className="mensagens"
        style={{
          maxHeight: 300,
          minHeight: 160,
          border: '1px solid var(--borda)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--preto)',
          padding: 14,
        }}
      >
        {historico.length === 0 && (
          <div style={{ margin: 'auto', color: 'var(--txt-3)', fontSize: 12.5 }}>
            Escreva como se fosse o cliente.
          </div>
        )}
        {historico.map((m, i) => (
          <div key={i} className={`balao ${m.de === 'cliente' ? 'cliente' : 'nosso'}`}>
            {m.texto}
          </div>
        ))}
        {rodando && (
          <div className="digitando">
            <i />
            <i />
            <i />
            <span style={{ marginLeft: 4 }}>pensando</span>
          </div>
        )}
      </div>

      <div className="fila">
        <input
          className="crescer"
          placeholder="Mensagem do cliente…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && mandar()}
        />
        <button className="btn primario" onClick={mandar} disabled={rodando || !texto.trim()}>
          <IconeFaisca tamanho={14} /> Testar
        </button>
        {historico.length > 0 && (
          <button
            className="btn fantasma"
            onClick={() => {
              setHistorico([])
              setUltimo(null)
            }}
          >
            Limpar
          </button>
        )}
      </div>

      {ultimo && (
        <div className="cartao">
          <div className="cartao-titulo" style={{ marginBottom: 10 }}>
            O que o agente fez
          </div>
          <div className="pilha-sm" style={{ fontSize: 12.5 }}>
            {ultimo.transferir && (
              <div className="fila">
                <span className="etiqueta amarela">transferiu</span>
                <span style={{ color: 'var(--txt-2)' }}>{ultimo.transferir.resumo}</span>
              </div>
            )}
            {ultimo.acoes
              .filter((a) => a.tipo === 'interesse')
              .map((a, i) => (
                <div className="fila" key={i}>
                  <span className="etiqueta azul">registrou interesse</span>
                  <span style={{ color: 'var(--txt-2)' }}>
                    {String(a.nome || 'sem nome')} · {String(a.curso || 'sem curso')} ·{' '}
                    {String(a.etapa || '')}
                  </span>
                </div>
              ))}
            {ultimo.acoes
              .filter((a) => a.tipo === 'troca-agente')
              .map((a, i) => (
                <div className="fila" key={i}>
                  <span className="etiqueta roxa">passou adiante</span>
                  <span style={{ color: 'var(--txt-2)' }}>{String(a.motivo || '')}</span>
                </div>
              ))}
            {!ultimo.transferir && ultimo.acoes.length === 0 && (
              <span style={{ color: 'var(--txt-3)' }}>Só respondeu — nenhuma ação disparada.</span>
            )}
            <div className="divisor" />
            <div className="fila esmaecido mono" style={{ fontSize: 11.5 }}>
              entrada {ultimo.uso.entrada} · saída {ultimo.uso.saida}
              {ultimo.uso.cacheLido > 0 && ` · cache ${ultimo.uso.cacheLido}`}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
