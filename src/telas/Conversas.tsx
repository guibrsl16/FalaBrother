/**
 * A tela do dia a dia: todas as conversas do WhatsApp de um lado, a conversa
 * aberta no meio, e a ficha de quem está falando do outro.
 *
 * Regra que organiza tudo aqui: quem escreve à mão assume a conversa. A IA
 * para na hora e só volta quando alguém devolver — porque nada é pior num
 * atendimento do que o robô responder por cima do humano.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import {
  Avatar,
  Campo,
  ETAPAS_LEAD,
  SeloEstado,
  Vazio,
  dia,
  hora,
  quando,
  rotuloEstado,
  telefoneBonito,
  tituloDaConversa,
} from '../componentes/Base'
import {
  IconeAgentes,
  IconeBusca,
  IconeConversas,
  IconeCopiar,
  IconeDevolver,
  IconeDocumento,
  IconeEnviar,
  IconeFaisca,
  IconeFechar,
  IconeLixeira,
  IconeMais,
  IconePessoa,
  IconeRelogio,
  IconeResolver,
  IconeTransferir,
} from '../componentes/Icones'
import type { Conversa, EstadoConversa, Mensagem } from '../tipos'

type Filtro = 'tudo' | 'fila' | 'ia' | 'minhas' | 'resolvidas'

const FILTROS: { chave: Filtro; nome: string; icone: typeof IconeConversas }[] = [
  { chave: 'tudo', nome: 'Tudo', icone: IconeConversas },
  { chave: 'fila', nome: 'Na fila', icone: IconeRelogio },
  { chave: 'ia', nome: 'Com a IA', icone: IconeAgentes },
  { chave: 'minhas', nome: 'Comigo', icone: IconePessoa },
  { chave: 'resolvidas', nome: 'Resolvidas', icone: IconeResolver },
]

function combina(conversa: Conversa, filtro: Filtro) {
  if (filtro === 'tudo') return true
  if (filtro === 'fila') return conversa.estado === 'aguardando'
  if (filtro === 'ia') return conversa.estado === 'ia'
  if (filtro === 'minhas') return conversa.estado === 'humano'
  return conversa.estado === 'resolvida'
}

export default function Conversas() {
  const loja = useLoja()
  const { conversas, cursos, conexoes, digitando } = loja

  const [filtro, setFiltro] = useState<Filtro>('tudo')
  const [busca, setBusca] = useState('')
  const [abertaId, setAbertaId] = useState<string | null>(null)

  const ordenadas = useMemo(
    () => [...conversas].sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm)),
    [conversas],
  )

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return ordenadas.filter((c) => {
      if (!combina(c, filtro)) return false
      if (!termo) return true
      const digitos = termo.replace(/\D/g, '')
      return (
        c.nomeContato.toLowerCase().includes(termo) ||
        (c.nomePerfil || '').toLowerCase().includes(termo) ||
        (digitos !== '' && c.telefone.includes(digitos)) ||
        (c.ultimaMensagem?.texto || '').toLowerCase().includes(termo) ||
        (c.lead?.curso || '').toLowerCase().includes(termo)
      )
    })
  }, [ordenadas, filtro, busca])

  const contas = useMemo(() => {
    const conta = (f: Filtro) => ordenadas.filter((c) => combina(c, f)).length
    return {
      tudo: ordenadas.length,
      fila: conta('fila'),
      ia: conta('ia'),
      minhas: conta('minhas'),
      resolvidas: conta('resolvidas'),
    }
  }, [ordenadas])

  const aberta = conversas.find((c) => c.id === abertaId) || null

  // a primeira conversa da lista abre sozinha: ninguém quer ver tela vazia
  useEffect(() => {
    if (!abertaId && visiveis.length) setAbertaId(visiveis[0].id)
  }, [abertaId, visiveis])

  useEffect(() => {
    if (aberta?.naoLidas) {
      api.marcarLida(aberta.id).then(loja.aplicarConversa).catch(() => undefined)
    }
  }, [aberta?.id, aberta?.naoLidas, loja])

  return (
    <div className="atendimento">
      {/* ------------------------- lista ------------------------- */}
      <aside className="lista-conversas">
        <div className="lista-topo">
          <div className="fila">
            <div className="busca crescer">
              <span className="lupa">
                <IconeBusca tamanho={14} />
              </span>
              <input
                placeholder="Buscar nome, telefone ou trecho"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="filtros">
            {FILTROS.map((f) => (
              <button
                key={f.chave}
                className={filtro === f.chave ? 'ativo' : ''}
                onClick={() => setFiltro(f.chave)}
              >
                <f.icone tamanho={16} />
                <span className="num">{contas[f.chave]}</span>
                <span className="rotulo-filtro">{f.nome}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rolagem-conversas">
          {visiveis.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--txt-3)', fontSize: 13 }}>
              {conversas.length === 0
                ? 'Nenhuma conversa ainda. Quando alguém escrever para um número conectado, ela aparece aqui.'
                : 'Nada aqui com esse filtro.'}
            </div>
          )}

          {visiveis.map((c) => {
            const curso = cursos.find((k) => k.id === c.cursoId)
            return (
              <button
                key={c.id}
                className={`conversa-item ${c.id === abertaId ? 'ativa' : ''}`}
                onClick={() => setAbertaId(c.id)}
              >
                <div className="avatar-estado">
                  <Avatar
                    nome={c.nomeContato}
                    cor={curso?.cor}
                    foto={c.conexaoId && c.telefone ? api.urlFotoContato(c.conexaoId, c.telefone) : undefined}
                  />
                  <span
                    className="ponto-estado-avatar"
                    style={{ background: corDoEstado(c.estado) }}
                    title={rotuloEstado(c.estado)}
                  />
                </div>
                <div className="meio">
                  <div className="nome">
                    {tituloDaConversa(c)}
                    {/* sem nome salvo o título é o número; o nome do perfil acompanha, apagado */}
                    {!c.nomeContato && c.nomePerfil && <span className="perfil"> ~{c.nomePerfil}</span>}
                  </div>
                  <div className="previa">
                    {c.ultimaMensagem ? (
                      <>
                        {c.ultimaMensagem.de !== 'cliente' && (
                          <span className="quem">
                            {c.ultimaMensagem.de === 'agente'
                              ? 'IA: '
                              : c.ultimaMensagem.de === 'atendente'
                                ? 'Você: '
                                : ''}
                          </span>
                        )}
                        {c.ultimaMensagem.texto}
                      </>
                    ) : (
                      'sem mensagens'
                    )}
                  </div>
                  <div className="fila quebra" style={{ marginTop: 3, gap: 4 }}>
                    <SeloEstado estado={c.estado} />
                    {curso && (
                      <span className="etiqueta" style={{ color: curso.cor, borderColor: `${curso.cor}55` }}>
                        {curso.nome}
                      </span>
                    )}
                    {/* só mostra o número quando há mais de um: com um só, seria ruído */}
                    {conexoes.length > 1 && c.conexaoId && (
                      <span className="etiqueta" title="Número da escola que recebeu esta conversa">
                        {conexoes.find((x) => x.id === c.conexaoId)?.nome || 'número removido'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="direita">
                  <div className="fila" style={{ gap: 6 }}>
                    {!!c.totalMensagens && <span className="contagem-mensagens">{c.totalMensagens}</span>}
                    <span className="hora">{quando(c.atualizadaEm)}</span>
                  </div>
                  {c.naoLidas > 0 && <span className="bolha-nao-lidas">{c.naoLidas}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ------------------------- conversa ------------------------- */}
      {aberta ? (
        <Conversa
          key={aberta.id}
          conversa={aberta}
          digitando={digitando.has(aberta.id)}
        />
      ) : (
        <div className="conversa" style={{ display: 'grid', placeItems: 'center' }}>
          <Vazio
            solto
            simbolo={<IconeConversas tamanho={40} />}
            titulo="Nenhuma conversa aberta"
            texto={
              conexoes.length === 0
                ? 'Conecte um número de WhatsApp em Conexões. Assim que alguém escrever para ele, a conversa aparece aqui e um agente responde sozinho.'
                : 'Assim que alguém escrever para um número da escola, a conversa aparece aqui e um agente responde sozinho.'
            }
          />
        </div>
      )}

      {/* ------------------------- ficha ------------------------- */}
      {aberta && <Ficha conversa={aberta} />}
    </div>
  )
}

function corDoEstado(estado: EstadoConversa) {
  if (estado === 'aguardando') return 'var(--amarelo)'
  if (estado === 'ia') return 'var(--acento)'
  if (estado === 'humano') return 'var(--azul)'
  return 'var(--verde)'
}

/* ------------------------------------------------------------------ */
/* A conversa aberta                                                   */
/* ------------------------------------------------------------------ */

function Conversa({ conversa, digitando }: { conversa: Conversa; digitando: boolean }) {
  const loja = useLoja()
  const { mensagens, carregando } = loja.usarMensagens(conversa.id)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  const agente = loja.agentes.find((a) => a.id === conversa.agenteId)
  const conexao = conversa.conexaoId ? loja.conexoes.find((c) => c.id === conversa.conexaoId) : null

  // por onde a resposta sairia — e por que talvez não saia
  const avisoDeCanal = conversa.conexaoId
    ? !conexao
      ? 'O número desta conversa foi removido — o que você escrever aqui não será enviado.'
      : conexao.estado !== 'conectada'
        ? `O número "${conexao.nome}" está desconectado — o que você escrever não será enviado. Reconecte em Conexões.`
        : null
    : loja.canal.whatsappConfigurado
      ? null
      : 'Esta conversa não está ligada a um número conectado — o que você escrever não será enviado.'

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length, digitando])

  async function enviar() {
    const limpo = texto.trim()
    if (!limpo || enviando) return
    setEnviando(true)
    try {
      await api.responderComoAtendente(conversa.id, limpo)
      setTexto('')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui enviar.', 'erro')
    } finally {
      setEnviando(false)
    }
  }

  async function comando(acao: () => Promise<Conversa>, aviso: string) {
    try {
      loja.aplicarConversa(await acao())
      loja.avisar(aviso, 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não deu certo.', 'erro')
    }
  }

  return (
    <section className="conversa">
      <header className="conversa-topo">
        <Avatar
          nome={conversa.nomeContato}
          foto={conversa.conexaoId && conversa.telefone ? api.urlFotoContato(conversa.conexaoId, conversa.telefone) : undefined}
        />
        <div className="dados">
          <div className="nome">
            {tituloDaConversa(conversa)}
            {!conversa.nomeContato && conversa.nomePerfil && <span className="perfil"> ~{conversa.nomePerfil}</span>}
          </div>
          <div className="sob">
            <span>{telefoneBonito(conversa.telefone) || 'número oculto pelo WhatsApp'}</span>
            {conexao && (
              <>
                <span>·</span>
                <span title="Número da escola que atende esta conversa">{conexao.nome}</span>
              </>
            )}
            {agente && (
              <>
                <span>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <IconeAgentes tamanho={12} /> {agente.nome}
                </span>
              </>
            )}
          </div>
        </div>

        <SeloEstado estado={conversa.estado} />

        <div className="fila" style={{ gap: 4 }}>
          {conversa.estado !== 'humano' ? (
            <button
              className="btn pequeno"
              onClick={() => comando(() => api.assumir(conversa.id), 'Você assumiu. A IA está pausada nesta conversa.')}
              title="Pausa a IA e passa a conversa para você"
            >
              <IconeTransferir tamanho={14} /> Assumir
            </button>
          ) : (
            <button
              className="btn pequeno"
              onClick={() => comando(() => api.devolver(conversa.id), 'Devolvido para o atendimento automático.')}
              title="A IA volta a responder esta conversa"
            >
              <IconeDevolver tamanho={14} /> Devolver à IA
            </button>
          )}

          <button
            className="btn pequeno fantasma"
            onClick={() => comando(() => api.responderComIA(conversa.id), 'Pedido enviado ao agente.')}
            title="Faz o agente responder agora, sem esperar"
          >
            <IconeFaisca tamanho={14} /> Responder com IA
          </button>

          {conversa.estado !== 'resolvida' ? (
            <button
              className="btn-icone"
              onClick={() => comando(() => api.resolver(conversa.id), 'Conversa marcada como resolvida.')}
              title="Marcar como resolvida"
            >
              <IconeResolver tamanho={16} />
            </button>
          ) : (
            <button
              className="btn pequeno fantasma"
              onClick={() => comando(() => api.reabrir(conversa.id), 'Conversa reaberta.')}
            >
              Reabrir
            </button>
          )}
        </div>
      </header>

      <div className="mensagens">
        {carregando && (
          <div style={{ textAlign: 'center', color: 'var(--txt-3)', fontSize: 12.5, padding: 20 }}>
            carregando o histórico…
          </div>
        )}

        {!carregando && conversa.conexaoId && mensagens.length > 0 && (
          <BotaoBuscarAntigas conversaId={conversa.id} />
        )}

        {mensagens.map((m, i) => (
          <React.Fragment key={m.id}>
            {(i === 0 || dia(mensagens[i - 1].em) !== dia(m.em)) && (
              <div className="separador-dia">{dia(m.em)}</div>
            )}
            <Balao mensagem={m} nomeAgente={loja.agentes.find((a) => a.id === m.agenteId)?.nome} />
          </React.Fragment>
        ))}

        {digitando && (
          <div className="digitando">
            <i />
            <i />
            <i />
            <span style={{ marginLeft: 4 }}>o agente está escrevendo</span>
          </div>
        )}

        <div ref={fim} />
      </div>

      <div className="caixa-envio">
        {conversa.estado !== 'humano' && (
          <div className="aviso-ia">
            <IconeAgentes tamanho={14} />
            Esta conversa está no automático. Se você escrever, assume o atendimento e a IA pausa.
          </div>
        )}
        {avisoDeCanal && (
          <div className="aviso-ia" style={{ borderColor: 'rgba(var(--amarelo-rgb),.3)', background: 'var(--amarelo-fundo)', color: 'var(--amarelo)' }}>
            {avisoDeCanal}
          </div>
        )}
        <div className="linha">
          <textarea
            placeholder="Escreva sua resposta…  (Enter envia, Shift+Enter quebra linha)"
            value={texto}
            rows={1}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar()
              }
            }}
          />
          <button className="enviar" onClick={enviar} disabled={!texto.trim() || enviando} title="Enviar">
            <IconeEnviar tamanho={18} />
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * Pede ao celular mensagens mais antigas DESTA conversa — uma de cada vez,
 * sob clique. A resposta não é na hora: se o celular tiver mais para mandar,
 * elas chegam em instantes pelo tempo real, como qualquer mensagem nova.
 */
function BotaoBuscarAntigas({ conversaId }: { conversaId: string }) {
  const loja = useLoja()
  const [buscando, setBuscando] = useState(false)

  async function buscar() {
    setBuscando(true)
    try {
      await api.buscarMensagensAntigas(conversaId)
      loja.avisar('Pedido enviado. Se o celular tiver mensagens mais antigas, elas aparecem em instantes.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui pedir mais mensagens.', 'erro')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div style={{ textAlign: 'center', padding: '4px 0 14px' }}>
      <button className="btn pequeno fantasma" onClick={buscar} disabled={buscando}>
        {buscando ? 'Buscando…' : 'Buscar mensagens mais antigas'}
      </button>
    </div>
  )
}

function Balao({ mensagem, nomeAgente }: { mensagem: Mensagem; nomeAgente?: string }) {
  if (mensagem.de === 'sistema') {
    const classe =
      mensagem.tipo === 'erro' ? 'erro' : mensagem.tipo === 'transferencia' ? 'transferencia' : ''
    return <div className={`aviso-sistema ${classe}`}>{mensagem.texto}</div>
  }

  const nosso = mensagem.de !== 'cliente'
  const figurinha = mensagem.anexo?.tipo === 'figurinha'

  return (
    <div
      className={`balao ${nosso ? 'nosso' : 'cliente'} ${mensagem.de === 'atendente' ? 'atendente' : ''} ${figurinha ? 'sem-moldura' : ''}`}
    >
      {nosso && !figurinha && (
        <div className="quem">
          {mensagem.de === 'agente' ? (
            <>
              <IconeAgentes tamanho={11} /> {nomeAgente || 'Agente'}
            </>
          ) : (
            <>
              <IconePessoa tamanho={11} /> Você
            </>
          )}
        </div>
      )}
      {mensagem.anexo ? <Anexo mensagem={mensagem} /> : mensagem.texto}
      <div className="rodape-balao">
        {mensagem.uso && (
          <span title="Tokens usados nesta resposta" className="mono">
            {mensagem.uso.entrada + mensagem.uso.saida} tk
          </span>
        )}
        {mensagem.status === 'falhou' && <span className="falha">falhou: {mensagem.erro}</span>}
        {(mensagem.status === 'read' || mensagem.status === 'delivered') && (
          <span className="entregue">{mensagem.status === 'read' ? 'lida' : 'entregue'}</span>
        )}
        <span>{hora(mensagem.em)}</span>
      </div>
    </div>
  )
}

/**
 * A legenda que vale a pena mostrar de novo embaixo da mídia: se a pessoa
 * escreveu algo junto (`[imagem] bom dia`), mostra só "bom dia" — o aviso
 * padrão sem legenda ("[a pessoa mandou uma imagem]") já virou a imagem.
 */
function legendaVisivel(texto: string, tipo: string) {
  const comLegenda = `[${tipo}] `
  return texto.startsWith(comLegenda) ? texto.slice(comLegenda.length) : ''
}

/**
 * Imagem, figurinha, áudio e documento de verdade — baixados do WhatsApp e
 * guardados pelo servidor. Se o arquivo não existir (ainda baixando, ou a
 * tentativa falhou), cai para a descrição em texto sozinho, sem erro visível.
 */
function Anexo({ mensagem }: { mensagem: Mensagem }) {
  const [falhou, setFalhou] = useState(false)
  const anexo = mensagem.anexo
  if (!anexo) return null
  if (falhou) return <>{mensagem.texto}</>

  const url = api.urlMidiaMensagem(mensagem.conversaId, mensagem.id)

  if (anexo.tipo === 'imagem') {
    const legenda = legendaVisivel(mensagem.texto, 'imagem')
    return (
      <>
        <img
          src={url}
          alt=""
          onError={() => setFalhou(true)}
          style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 10, marginBottom: legenda ? 6 : 0 }}
        />
        {legenda}
      </>
    )
  }

  if (anexo.tipo === 'figurinha') {
    return <img src={url} alt="" onError={() => setFalhou(true)} style={{ display: 'block', width: 128, height: 128 }} />
  }

  if (anexo.tipo === 'audio') {
    return <audio controls src={url} onError={() => setFalhou(true)} style={{ display: 'block', width: 240 }} />
  }

  if (anexo.tipo === 'documento') {
    return (
      <a href={url} target="_blank" rel="noreferrer" download={anexo.nomeArquivo} className="fila" style={{ gap: 8 }}>
        <IconeDocumento tamanho={22} />
        <span className="crescer recortar" style={{ textDecoration: 'underline' }}>
          {anexo.nomeArquivo || 'arquivo'}
        </span>
      </a>
    )
  }

  return <>{mensagem.texto}</>
}

/* ------------------------------------------------------------------ */
/* Ficha lateral                                                       */
/* ------------------------------------------------------------------ */

function Ficha({ conversa }: { conversa: Conversa }) {
  const loja = useLoja()
  const curso = loja.cursos.find((c) => c.id === conversa.cursoId)
  const agente = loja.agentes.find((a) => a.id === conversa.agenteId)
  const conexaoDaConversa = conversa.conexaoId ? loja.conexoes.find((c) => c.id === conversa.conexaoId) : null
  const [novaEtiqueta, setNovaEtiqueta] = useState('')
  const [editandoEtiqueta, setEditandoEtiqueta] = useState(false)

  async function mudar(mudancas: Partial<Conversa>) {
    try {
      loja.aplicarConversa(await api.atualizarConversa(conversa.id, mudancas))
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    }
  }

  async function copiarNumero() {
    try {
      await navigator.clipboard.writeText(conversa.telefone)
      loja.avisar('Número copiado.', 'ok')
    } catch {
      loja.avisar('Não consegui copiar — copie direto da tela.', 'erro')
    }
  }

  function adicionarEtiqueta() {
    const limpa = novaEtiqueta.trim()
    setNovaEtiqueta('')
    setEditandoEtiqueta(false)
    if (!limpa || conversa.etiquetas.includes(limpa)) return
    mudar({ etiquetas: [...conversa.etiquetas, limpa] })
  }

  function removerEtiqueta(etiqueta: string) {
    mudar({ etiquetas: conversa.etiquetas.filter((e) => e !== etiqueta) })
  }

  return (
    <aside className="ficha">
      <div className="ficha-perfil">
        <div className="avatar-estado grande">
          <Avatar
            nome={conversa.nomeContato}
            cor={curso?.cor}
            foto={conversa.conexaoId && conversa.telefone ? api.urlFotoContato(conversa.conexaoId, conversa.telefone) : undefined}
          />
          <span className="ponto-estado-avatar" style={{ background: corDoEstado(conversa.estado) }} title={rotuloEstado(conversa.estado)} />
        </div>
        <input
          className="ficha-nome"
          value={conversa.nomeContato}
          onChange={(e) => mudar({ nomeContato: e.target.value })}
          placeholder="Como a pessoa se chama"
        />
        {conversa.telefone && (
          <>
            <div className="ficha-telefone mono">
              {conversa.telefone.startsWith('55') && '🇧🇷 '}
              {telefoneBonito(conversa.telefone)}
            </div>
            <button className="btn pequeno fantasma" onClick={copiarNumero}>
              <IconeCopiar tamanho={13} /> Copiar número
            </button>
          </>
        )}
      </div>

      <div className="bloco">
        {conexaoDaConversa && (
          <div className="par">
            <span>Atendida por</span>
            <strong>{conexaoDaConversa.nome}</strong>
          </div>
        )}
        <div className="par">
          <span>Primeira vez</span>
          <strong>{new Date(conversa.criadaEm).toLocaleDateString('pt-BR')}</strong>
        </div>
      </div>

      <div className="bloco">
        <div className="rotulo">Etiquetas</div>
        <div className="fila quebra" style={{ gap: 6 }}>
          {conversa.etiquetas.map((e) => (
            <span key={e} className="etiqueta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {e}
              <button
                onClick={() => removerEtiqueta(e)}
                title="Remover"
                style={{ display: 'inline-flex', color: 'inherit', opacity: 0.7 }}
              >
                <IconeFechar tamanho={9} />
              </button>
            </span>
          ))}
          {editandoEtiqueta ? (
            <input
              autoFocus
              value={novaEtiqueta}
              onChange={(e) => setNovaEtiqueta(e.target.value)}
              onBlur={adicionarEtiqueta}
              onKeyDown={(e) => e.key === 'Enter' && adicionarEtiqueta()}
              placeholder="nome da etiqueta"
              style={{ width: 110, height: 24, fontSize: 12, padding: '0 8px' }}
            />
          ) : (
            <button
              className="etiqueta"
              onClick={() => setEditandoEtiqueta(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
            >
              <IconeMais tamanho={10} /> Adicionar
            </button>
          )}
        </div>
      </div>

      <div className="bloco">
        <div className="rotulo">Interesse</div>
        <Campo rotulo="Curso">
          <select value={conversa.cursoId || ''} onChange={(e) => mudar({ cursoId: e.target.value || null })}>
            <option value="">— ainda não sei —</option>
            {loja.cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Etapa" dica="Fechar matrícula ou marcar como perdido é sempre uma decisão da equipe, nunca da IA.">
          <select
            value={conversa.lead?.etapa || 'novo'}
            onChange={(e) => mudar({ lead: { ...conversa.lead, etapa: e.target.value } })}
          >
            {ETAPAS_LEAD.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.nome}
              </option>
            ))}
          </select>
        </Campo>
        {conversa.lead?.anotacao && (
          <div style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.5, marginTop: 2 }}>
            {conversa.lead.anotacao}
          </div>
        )}
      </div>

      <div className="bloco">
        <div className="rotulo">Quem responde</div>
        <Campo rotulo="Agente" dica="Trocar aqui vale a partir da próxima mensagem.">
          <select value={conversa.agenteId || ''} onChange={(e) => mudar({ agenteId: e.target.value || null })}>
            <option value="">— escolher sozinho —</option>
            {loja.agentes
              .filter((a) => a.ativo)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
          </select>
        </Campo>
        {agente?.papel && (
          <div style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>{agente.papel}</div>
        )}
      </div>

      {conversa.resumo && (
        <div className="bloco">
          <div className="rotulo">Por que veio para você</div>
          <div style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.55 }}>{conversa.resumo}</div>
        </div>
      )}

      {curso && (
        <div className="bloco">
          <div className="rotulo">Ficha do curso</div>
          {curso.investimento && (
            <div className="par">
              <span>Investimento</span>
              <strong>{curso.investimento}</strong>
            </div>
          )}
          {curso.duracao && (
            <div className="par">
              <span>Duração</span>
              <strong>{curso.duracao}</strong>
            </div>
          )}
          {curso.formato && (
            <div className="par">
              <span>Formato</span>
              <strong>{curso.formato}</strong>
            </div>
          )}
        </div>
      )}

      <div className="bloco">
        <button
          className="btn fantasma perigo"
          onClick={async () => {
            if (!confirm('Apagar esta conversa e todo o histórico dela?')) return
            await api.apagarConversa(conversa.id)
            loja.avisar('Conversa apagada.', 'ok')
          }}
        >
          <IconeLixeira tamanho={14} /> Apagar conversa
        </button>
      </div>
    </aside>
  )
}
