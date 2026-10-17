/**
 * Ajustes: chave da IA, comportamento do atendimento automático, horário,
 * aparência, equipe e conta — organizados em abas para não empilhar tudo de
 * uma vez na tela.
 */
import { useEffect, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Campo, Interruptor, Opcoes } from '../componentes/Base'
import { IconeTema } from '../componentes/Icones'
import { CartaoEquipe, CartaoMinhaConta } from './Equipe'
import type { Ajustes as TipoAjustes } from '../tipos'

const DIAS = [
  { valor: 0, nome: 'Dom' },
  { valor: 1, nome: 'Seg' },
  { valor: 2, nome: 'Ter' },
  { valor: 3, nome: 'Qua' },
  { valor: 4, nome: 'Qui' },
  { valor: 5, nome: 'Sex' },
  { valor: 6, nome: 'Sáb' },
]

type Aba = 'ia' | 'horario' | 'aparencia' | 'equipe' | 'conta'

export default function AjustesTela() {
  const loja = useLoja()
  const { ajustes } = loja
  const administra = loja.sessao?.usuario?.papel === 'admin'

  const [aba, setAba] = useState<Aba>('ia')
  const [rascunho, setRascunho] = useState<TipoAjustes | null>(null)
  const [chave, setChave] = useState('')

  useEffect(() => {
    if (ajustes) setRascunho(structuredClone(ajustes))
  }, [ajustes])

  if (!rascunho || !ajustes) return null

  function mexer(mudancas: Partial<TipoAjustes>) {
    setRascunho((atual) => (atual ? { ...atual, ...mudancas } : atual))
  }

  function mexerHorario(mudancas: Partial<TipoAjustes['horario']>) {
    setRascunho((atual) => (atual ? { ...atual, horario: { ...atual.horario, ...mudancas } } : atual))
  }

  async function salvar() {
    if (!rascunho) return
    try {
      const corpo: Record<string, unknown> = {
        nomeDaCasa: rascunho.nomeDaCasa,
        assinatura: rascunho.assinatura,
        tema: rascunho.tema,
        iaLigada: rascunho.iaLigada,
        segundosDeEspera: rascunho.segundosDeEspera,
        memoriaDeMensagens: rascunho.memoriaDeMensagens,
        horario: rascunho.horario,
      }
      if (chave.trim()) corpo.anthropicApiKey = chave.trim()

      const novo = await api.salvarAjustes(corpo)
      loja.aplicarAjustes(novo)
      setChave('')
      loja.avisar('Ajustes salvos.', 'ok')
      loja.recarregar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    }
  }

  const ABAS: { chave: Aba; nome: string }[] = [
    { chave: 'ia', nome: 'Inteligência artificial' },
    { chave: 'horario', nome: 'Horário' },
    { chave: 'aparencia', nome: 'Aparência' },
    ...(administra ? [{ chave: 'equipe' as Aba, nome: 'Equipe' }] : []),
    { chave: 'conta', nome: 'Minha conta' },
  ]

  const temSalvar = aba === 'ia' || aba === 'horario' || aba === 'aparencia'

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>Ajustes</h1>
        </div>
        {temSalvar && (
          <button className="btn primario" onClick={salvar}>
            Salvar
          </button>
        )}
      </div>

      <div className="opcoes" style={{ marginBottom: 16 }}>
        {ABAS.map((a) => (
          <button key={a.chave} className={aba === a.chave ? 'ativo' : ''} onClick={() => setAba(a.chave)}>
            {a.nome}
          </button>
        ))}
      </div>

      {aba === 'ia' && (
        <div className="grade g2">
          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Chave da IA</div>
              <span className={`etiqueta ${ajustes.anthropicApiKey.preenchido ? 'verde' : 'vermelha'}`}>
                {ajustes.anthropicApiKey.preenchido ? 'chave salva' : 'sem chave'}
              </span>
            </div>

            <div className="pilha">
              <Campo
                rotulo="Chave da API da Anthropic"
                dica={
                  ajustes.anthropicApiKey.preenchido
                    ? `Termina em ${ajustes.anthropicApiKey.fim}. Vazio mantém a atual.`
                    : 'console.anthropic.com'
                }
              >
                <input
                  type="password"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  placeholder={ajustes.anthropicApiKey.preenchido ? '••••••••••••' : 'sk-ant-…'}
                />
              </Campo>

              <div className="par" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: 'var(--txt-3)' }}>Modelo dos agentes</span>
                <strong className="mono">{loja.canal.modelo}</strong>
              </div>

              <div className="divisor" />

              <Interruptor ligado={rascunho.iaLigada} aoMudar={(v) => mexer({ iaLigada: v })}>
                Atendimento automático ligado
              </Interruptor>
            </div>
          </div>

          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Comportamento</div>
            </div>

            <div className="pilha">
              <Campo rotulo="Espera antes de responder (segundos)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={rascunho.segundosDeEspera}
                  onChange={(e) => mexer({ segundosDeEspera: Number(e.target.value) })}
                />
              </Campo>

              <Campo rotulo="Memória (mensagens)">
                <input
                  type="number"
                  min={4}
                  max={100}
                  value={rascunho.memoriaDeMensagens}
                  onChange={(e) => mexer({ memoriaDeMensagens: Number(e.target.value) })}
                />
              </Campo>
            </div>
          </div>
        </div>
      )}

      {aba === 'horario' && (
        <div className="cartao" style={{ maxWidth: 520 }}>
          <div className="cartao-cabecalho">
            <div className="cartao-titulo">Horário de atendimento</div>
          </div>

          <div className="pilha">
            <Interruptor ligado={rascunho.horario.ligado} aoMudar={(v) => mexerHorario({ ligado: v })}>
              Respeitar horário
            </Interruptor>

            {rascunho.horario.ligado && (
              <>
                <div className="grade g2">
                  <Campo rotulo="Abre">
                    <input
                      type="time"
                      value={rascunho.horario.inicio}
                      onChange={(e) => mexerHorario({ inicio: e.target.value })}
                    />
                  </Campo>
                  <Campo rotulo="Fecha">
                    <input
                      type="time"
                      value={rascunho.horario.fim}
                      onChange={(e) => mexerHorario({ fim: e.target.value })}
                    />
                  </Campo>
                </div>

                <Campo rotulo="Dias">
                  <div className="fila quebra">
                    {DIAS.map((d) => {
                      const marcado = rascunho.horario.dias.includes(d.valor)
                      return (
                        <button
                          key={d.valor}
                          type="button"
                          className={`btn pequeno ${marcado ? 'primario' : 'fantasma'}`}
                          onClick={() =>
                            mexerHorario({
                              dias: marcado
                                ? rascunho.horario.dias.filter((x) => x !== d.valor)
                                : [...rascunho.horario.dias, d.valor].sort(),
                            })
                          }
                        >
                          {d.nome}
                        </button>
                      )
                    })}
                  </div>
                </Campo>

                <Campo rotulo="Mensagem fora do horário" dica="Enviada uma vez por dia para cada conversa.">
                  <textarea
                    value={rascunho.horario.mensagemForaDoHorario}
                    onChange={(e) => mexerHorario({ mensagemForaDoHorario: e.target.value })}
                    rows={3}
                  />
                </Campo>
              </>
            )}
          </div>
        </div>
      )}

      {aba === 'aparencia' && (
        <div className="cartao" style={{ maxWidth: 520 }}>
          <div className="cartao-cabecalho">
            <div className="cartao-titulo">
              <IconeTema tamanho={15} /> Aparência
            </div>
          </div>

          <div className="pilha">
            <Campo rotulo="Tema">
              <Opcoes
                valor={rascunho.tema}
                opcoes={[
                  { valor: 'preto' as const, nome: 'Vitral escuro' },
                  { valor: 'claro' as const, nome: 'Vitral claro' },
                ]}
                aoMudar={(v) => {
                  mexer({ tema: v })
                  document.documentElement.dataset.tema = v
                }}
              />
            </Campo>

            <Campo rotulo="Nome da casa">
              <input value={rascunho.nomeDaCasa} onChange={(e) => mexer({ nomeDaCasa: e.target.value })} />
            </Campo>

            <Campo rotulo="Assinatura">
              <input value={rascunho.assinatura} onChange={(e) => mexer({ assinatura: e.target.value })} />
            </Campo>
          </div>
        </div>
      )}

      {aba === 'equipe' && administra && <CartaoEquipe />}
      {aba === 'conta' && <CartaoMinhaConta />}
    </>
  )
}
