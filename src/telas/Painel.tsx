/**
 * O painel responde uma pergunta só: o atendimento está de pé?
 *
 * Por isso o número que abre a tela é a fila — gente esperando resposta. O
 * resto é contexto. Quantas conversas a IA resolveu sozinha importa menos
 * que quantas ficaram paradas.
 */
import { useLoja } from '../estado'
import { Vazio, quando, tituloDaConversa } from '../componentes/Base'
import { IconePainel } from '../componentes/Icones'

export default function Painel({ aoIrPara }: { aoIrPara: (tela: string) => void }) {
  const { indicadores, conversas, cursos, conexoes, ajustes } = useLoja()

  if (!indicadores) {
    return <Vazio simbolo={<IconePainel tamanho={36} />} titulo="Carregando o painel…" />
  }

  const naFila = conversas
    .filter((c) => c.estado === 'aguardando' || c.estado === 'humano')
    .sort((a, b) => a.atualizadaEm.localeCompare(b.atualizadaEm))
    .slice(0, 8)

  const caidas = conexoes.filter((c) => c.estado === 'desconectada')

  const maiorCurso = Math.max(1, ...indicadores.porCurso.map((c) => c.conversas))

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>Painel</h1>
          <p>Como está o atendimento agora. Os números de hoje zeram à meia-noite.</p>
        </div>
      </div>

      {(caidas.length > 0 || (ajustes && !ajustes.iaLigada)) && (
        <div className="cartao" style={{ marginBottom: 16, borderColor: 'rgba(var(--amarelo-rgb),.32)' }}>
          <div className="pilha-sm">
            {caidas.map((c) => (
              <div className="fila" key={c.id}>
                <span className="etiqueta vermelha">número caiu</span>
                <span style={{ fontSize: 13 }}>
                  {c.nome} está desconectado — as conversas dele não chegam nem são respondidas.
                </span>
                <button className="btn pequeno fantasma" onClick={() => aoIrPara('conexoes')}>
                  Abrir conexões
                </button>
              </div>
            ))}
            {ajustes && !ajustes.iaLigada && (
              <div className="fila">
                <span className="etiqueta vermelha">IA pausada</span>
                <span style={{ fontSize: 13 }}>
                  As respostas automáticas estão desligadas para todas as conversas.
                </span>
                <button className="btn pequeno fantasma" onClick={() => aoIrPara('ajustes')}>
                  Religar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grade g5" style={{ marginBottom: 16 }}>
        <div className={`kpi ${indicadores.aguardando ? 'alerta' : 'destaque'}`}>
          <div className="rotulo">Na fila</div>
          <div className="valor">{indicadores.aguardando}</div>
          <div className="rodape">esperando alguém responder</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Com a IA</div>
          <div className="valor">{indicadores.comIA}</div>
          <div className="rodape">no automático agora</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Com a equipe</div>
          <div className="valor">{indicadores.comHumano}</div>
          <div className="rodape">assumidas por gente</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Abertas hoje</div>
          <div className="valor">{indicadores.abertasHoje}</div>
          <div className="rodape">conversas novas</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Resolvidas</div>
          <div className="valor" style={{ color: 'var(--verde)' }}>
            {indicadores.resolvidas}
          </div>
          <div className="rodape">no total</div>
        </div>
      </div>

      <div className="grade g-2-1">
        {/* fila */}
        <div className="cartao">
          <div className="cartao-cabecalho">
            <div className="cartao-titulo">Esperando resposta</div>
            <button className="btn pequeno fantasma" onClick={() => aoIrPara('conversas')}>
              Abrir conversas
            </button>
          </div>

          {naFila.length === 0 ? (
            <div style={{ padding: '26px 0', textAlign: 'center', color: 'var(--txt-3)', fontSize: 13 }}>
              Ninguém esperando. Bom sinal.
            </div>
          ) : (
            <div className="pilha-sm">
              {naFila.map((c) => (
                <div key={c.id} className="fila" style={{ padding: '7px 0', borderBottom: '1px solid var(--borda)' }}>
                  <span
                    className="ponto-estado"
                    style={{ background: c.estado === 'aguardando' ? 'var(--amarelo)' : 'var(--azul)' }}
                  />
                  <div className="crescer recortar">
                    <strong style={{ fontSize: 13.5 }}>
                      {tituloDaConversa(c)}
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--txt-3)' }} className="recortar">
                      {c.ultimaMensagem?.texto || 'sem mensagens'}
                    </div>
                  </div>
                  <span className="esmaecido" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {quando(c.atualizadaEm)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* hoje + cursos */}
        <div className="pilha">
          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Hoje</div>
            </div>
            <div className="pilha-sm" style={{ fontSize: 13 }}>
              <Linha rotulo="Mensagens trocadas" valor={indicadores.mensagensHoje} />
              <Linha rotulo="Respostas da IA" valor={indicadores.respostasIA} cor="var(--acento)" />
              <Linha
                rotulo="Passadas para humano"
                valor={indicadores.transferencias}
                cor={indicadores.transferencias ? 'var(--amarelo)' : undefined}
              />
              <Linha rotulo="Agentes ativos" valor={indicadores.agentesAtivos} />
            </div>
          </div>

          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Custo da IA</div>
            </div>
            <div className="pilha-sm" style={{ fontSize: 13 }}>
              <LinhaCusto rotulo="Hoje" usd={indicadores.custoHojeUSD} />
              <LinhaCusto rotulo="Este mês" usd={indicadores.custoMesUSD} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 6, lineHeight: 1.5 }}>
              Calculado a partir do que cada resposta realmente gastou. Quem cobra é a Anthropic — o valor
              exato (e em reais, pela cotação do dia) está em console.anthropic.com → Billing.
            </div>
          </div>

          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Interesse por curso</div>
            </div>
            {indicadores.porCurso.length === 0 ? (
              <div style={{ color: 'var(--txt-3)', fontSize: 13 }}>Sem cursos cadastrados.</div>
            ) : (
              <div className="pilha-sm">
                {[...indicadores.porCurso]
                  .sort((a, b) => b.conversas - a.conversas)
                  .map((c) => (
                    <div key={c.cursoId} className="pilha-sm" style={{ gap: 4 }}>
                      <div className="fila" style={{ fontSize: 12.5 }}>
                        <span className="crescer recortar">{c.nome}</span>
                        <strong className="num">{c.conversas}</strong>
                      </div>
                      <div className="progresso fino">
                        <i
                          style={{
                            width: `${(c.conversas / maiorCurso) * 100}%`,
                            background: cursos.find((k) => k.id === c.cursoId)?.cor || 'var(--acento)',
                          }}
                        />
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

function Linha({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="fila" style={{ justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--txt-2)' }}>{rotulo}</span>
      <strong className="num" style={cor ? { color: cor } : undefined}>
        {valor}
      </strong>
    </div>
  )
}

/** Dólar, o que a Anthropic cobra de verdade — e um "~R$" só para dar noção, não é o valor da fatura. */
function LinhaCusto({ rotulo, usd }: { rotulo: string; usd: number }) {
  const reais = usd * 5.4
  return (
    <div className="fila" style={{ justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--txt-2)' }}>{rotulo}</span>
      <span style={{ textAlign: 'right' }}>
        <strong className="num">{usd < 0.01 && usd > 0 ? '< US$0,01' : `US$${usd.toFixed(2)}`}</strong>
        <div style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>~R${reais.toFixed(2).replace('.', ',')}</div>
      </span>
    </div>
  )
}
