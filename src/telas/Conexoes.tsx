/**
 * Conexões: os números de WhatsApp da escola.
 *
 * Cada número se liga ao sistema como se liga o WhatsApp Web: a pessoa lê
 * um QR Code no celular (Configurações → Dispositivos conectados) e o
 * sistema vira um aparelho vinculado àquele número. É a API NÃO oficial —
 * por isso o aviso no alto da tela, e por isso o QR só aparece para quem
 * administra: quem lê o QR consegue vincular o número a outro aparelho.
 *
 * O estado de cada número (e o QR, que o WhatsApp renova a cada poucos
 * segundos) chega em tempo real; esta tela só mostra e pede ações.
 */
import React, { useMemo, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Campo, Interruptor, Modal, Vazio, telefoneBonito } from '../componentes/Base'
import { IconeConexoes, IconeLixeira, IconeMais, IconeWhatsapp } from '../componentes/Icones'
import type { Conexao, EstadoConexao, Sincronizacao } from '../tipos'

const ESTADOS: Record<EstadoConexao, { nome: string; classe: string }> = {
  conectada: { nome: 'Conectada', classe: 'verde' },
  'aguardando-qr': { nome: 'Aguardando leitura', classe: 'amarela' },
  iniciando: { nome: 'Abrindo', classe: 'azul' },
  conectando: { nome: 'Reconectando', classe: 'azul' },
  desconectada: { nome: 'Desconectada', classe: 'vermelha' },
}

const numero = (n: number) => n.toLocaleString('pt-BR')

/**
 * O que dizer da sincronização. Diz a verdade sobre cada caso, inclusive os
 * ruins: o celular decide se manda o histórico, e o sistema não tem como
 * forçar — então "indisponível" aparece como tal, com o que fazer.
 */
function descreverSincronizacao(s: Sincronizacao): { tom: 'ok' | 'andando' | 'aviso'; texto: string } | null {
  const total = `${numero(s.conversas)} ${s.conversas === 1 ? 'conversa' : 'conversas'} e ${numero(s.mensagens)} ${
    s.mensagens === 1 ? 'mensagem' : 'mensagens'
  }`
  switch (s.estado) {
    case 'desligada':
      return null
    case 'aguardando':
      return { tom: 'andando', texto: 'Aguardando o celular enviar as conversas… Mantenha o WhatsApp aberto no celular.' }
    case 'sincronizando':
      return {
        tom: 'andando',
        texto: `Sincronizando… ${total} até agora${s.progresso != null ? ` (${Math.round(s.progresso)}%)` : ''}. Pode continuar usando o sistema.`,
      }
    case 'concluida':
      return { tom: 'ok', texto: `Sincronizado: ${total} trazidas do celular.` }
    case 'indisponivel':
      return {
        tom: 'aviso',
        texto:
          'O celular não enviou as conversas antigas. Isso só é possível quando o número é lido pela primeira vez, e o WhatsApp do celular é quem decide enviar. Para tentar de novo, remova este número e conecte-o outra vez.',
      }
    case 'interrompida':
      return {
        tom: 'aviso',
        texto: `A sincronização foi interrompida porque o sistema reiniciou: ${total} chegaram antes disso. O celular não envia de novo; para refazer, remova o número e conecte-o outra vez.`,
      }
  }
}

export default function Conexoes() {
  const loja = useLoja()
  const { conexoes, conversas, sessao } = loja
  const admin = sessao?.usuario?.papel === 'admin'
  const [criando, setCriando] = useState(false)
  const [renomeando, setRenomeando] = useState<Conexao | null>(null)

  const conversasPorNumero = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const c of conversas) {
      if (c.conexaoId) mapa[c.conexaoId] = (mapa[c.conexaoId] || 0) + 1
    }
    return mapa
  }, [conversas])

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>Conexões</h1>
          <p>
            Os números de WhatsApp da escola. Cada um se conecta lendo um QR Code, como no WhatsApp
            Web, e as conversas dele aparecem em Conversas, respondidas pelos agentes.
          </p>
        </div>
        {admin && (
          <button className="btn primario" onClick={() => setCriando(true)}>
            <IconeMais tamanho={15} /> Conectar número
          </button>
        )}
      </div>

      <div className="nota-conexao">
        <strong>Esta é a conexão pelo WhatsApp Web, não a API oficial.</strong> O WhatsApp pode
        restringir números que enviam muita mensagem ou que parecem automatizados. Use um número
        dedicado ao atendimento, responda a quem escreve primeiro e evite disparos em massa. O
        celular precisa abrir o WhatsApp ao menos a cada 14 dias, senão o WhatsApp desvincula o
        aparelho.
      </div>

      {conexoes.length === 0 ? (
        <Vazio
          simbolo={<IconeConexoes tamanho={36} />}
          titulo="Nenhum número conectado"
          texto={
            admin
              ? 'Conecte o primeiro número lendo um QR Code. Assim que ele ficar verde, as mensagens que chegarem nele aparecem em Conversas.'
              : 'Ainda não há número conectado. Quem administra o sistema conecta o primeiro número aqui.'
          }
          acao={
            admin ? (
              <button className="btn primario" onClick={() => setCriando(true)}>
                Conectar o primeiro número
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grade g2">
          {conexoes.map((c) => (
            <CartaoConexao
              key={c.id}
              conexao={c}
              conversas={conversasPorNumero[c.id] || 0}
              admin={admin}
              aoRenomear={() => setRenomeando(c)}
            />
          ))}
        </div>
      )}

      {!admin && conexoes.length > 0 && (
        <div className="dica" style={{ marginTop: 12 }}>
          Só quem administra o sistema conecta, reconecta ou remove números.
        </div>
      )}

      {criando && <ModalNovaConexao aoFechar={() => setCriando(false)} />}
      {renomeando && <ModalRenomear conexao={renomeando} aoFechar={() => setRenomeando(null)} />}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Um número                                                           */
/* ------------------------------------------------------------------ */

function CartaoConexao({
  conexao,
  conversas,
  admin,
  aoRenomear,
}: {
  conexao: Conexao
  conversas: number
  admin: boolean
  aoRenomear: () => void
}) {
  const loja = useLoja()
  const [ocupado, setOcupado] = useState(false)
  const estado = ESTADOS[conexao.estado]
  const sinc = descreverSincronizacao(conexao.sincronizacao)

  async function agir(acao: () => Promise<void>, falha: string) {
    setOcupado(true)
    try {
      await acao()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : falha, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const reconectar = () =>
    agir(async () => loja.aplicarConexao(await api.iniciarConexao(conexao.id)), 'Não consegui reconectar.')

  const gerarQr = () =>
    agir(async () => loja.aplicarConexao(await api.iniciarConexao(conexao.id, true)), 'Não consegui gerar o QR Code.')

  const remover = () => {
    const aviso = conexao.vinculada
      ? 'O número é desvinculado do WhatsApp. '
      : ''
    if (
      !confirm(
        `Remover "${conexao.nome}"? ${aviso}As conversas continuam no histórico, mas deixam de poder ser respondidas por este número.`,
      )
    ) {
      return
    }
    return agir(async () => {
      await api.removerConexao(conexao.id)
      loja.avisar('Número removido.', 'ok')
      await loja.recarregar()
    }, 'Não consegui remover.')
  }

  return (
    <div className={`cartao conexao${conexao.estado === 'aguardando-qr' && admin ? ' larga' : ''}`}>
      <div className="conexao-topo">
        <div className="conexao-icone">
          <IconeWhatsapp tamanho={20} />
        </div>
        <div className="crescer recortar">
          <div className="conexao-nome recortar">{conexao.nome}</div>
          <div className="conexao-numero">
            {conexao.telefone ? telefoneBonito(conexao.telefone) : 'número ainda não lido'}
          </div>
        </div>
        <span className={`etiqueta ${estado.classe}`}>{estado.nome}</span>
      </div>

      <div className="conexao-corpo">
        {conexao.estado === 'conectada' && (
          <div className="pilha-sm" style={{ fontSize: 12.5 }}>
            {conexao.conectadaEm && (
              <div className="par-linha">
                <span>Conectada desde</span>
                <strong>
                  {new Date(conexao.conectadaEm).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
              </div>
            )}
            <div className="par-linha">
              <span>Conversas por este número</span>
              <strong className="num">{conversas}</strong>
            </div>
            {sinc && (
              <div className={`conexao-sinc ${sinc.tom}`}>
                {sinc.tom === 'andando' && conexao.sincronizacao.progresso != null && (
                  <div className="progresso fino">
                    <i style={{ width: `${Math.max(3, conexao.sincronizacao.progresso)}%` }} />
                  </div>
                )}
                {sinc.texto}
              </div>
            )}
          </div>
        )}

        {(conexao.estado === 'iniciando' || conexao.estado === 'conectando') && (
          <div className="conexao-aviso">{conexao.motivo || 'Abrindo a conexão com o WhatsApp…'}</div>
        )}

        {conexao.estado === 'desconectada' && (
          <div className="conexao-motivo">
            {conexao.motivo || 'Esta conexão está desligada. Reconecte para voltar a atender por este número.'}
          </div>
        )}

        {conexao.estado === 'aguardando-qr' &&
          (admin ? (
            <div className="conexao-qr">
              <div className="pareamento-qr">
                {conexao.qr ? (
                  <img className="qr-whatsapp" src={conexao.qr} alt="QR Code para conectar o número" />
                ) : (
                  <div className="pareamento-carregando">gerando QR Code…</div>
                )}
              </div>
              <ol className="pareamento-passos">
                <li>
                  Abra o <strong>WhatsApp</strong> no celular do número que vai atender.
                </li>
                <li>
                  Vá em <strong>Configurações</strong> (no Android, nos três pontinhos ⋮) →{' '}
                  <strong>Dispositivos conectados</strong>.
                </li>
                <li>
                  Toque em <strong>Conectar um dispositivo</strong> e aponte a câmera para o QR Code.
                </li>
                <li>Aguarde: este cartão fica verde. O código se renova sozinho.</li>
              </ol>
            </div>
          ) : (
            <div className="conexao-aviso">
              Aguardando a leitura do QR Code. Quem administra precisa ler o código no celular do número.
            </div>
          ))}
      </div>

      {admin && (
        <div className="conexao-acoes">
          {conexao.estado === 'desconectada' && conexao.vinculada && (
            <button className="btn pequeno primario" onClick={reconectar} disabled={ocupado}>
              Reconectar
            </button>
          )}
          {conexao.estado === 'desconectada' && (
            <button
              className={`btn pequeno ${conexao.vinculada ? 'fantasma' : 'primario'}`}
              onClick={gerarQr}
              disabled={ocupado}
            >
              {conexao.vinculada ? 'Conectar outro número' : 'Gerar QR Code'}
            </button>
          )}
          <button className="btn pequeno fantasma" onClick={aoRenomear} disabled={ocupado}>
            Renomear
          </button>
          <div className="crescer" />
          <button className="btn pequeno fantasma perigo" onClick={remover} disabled={ocupado}>
            <IconeLixeira tamanho={13} /> Remover
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modais                                                              */
/* ------------------------------------------------------------------ */

function ModalNovaConexao({ aoFechar }: { aoFechar: () => void }) {
  const loja = useLoja()
  const [nome, setNome] = useState('')
  const [sincronizar, setSincronizar] = useState(true)
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!nome.trim() || salvando) return
    setSalvando(true)
    try {
      loja.aplicarConexao(await api.criarConexao(nome, sincronizar))
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui criar.', 'erro')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Conectar número"
      subtitulo="Dê um nome para reconhecer este número. Em seguida aparece o QR Code para ler no celular."
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primario" onClick={criar} disabled={salvando || !nome.trim()}>
            {salvando ? 'Gerando…' : 'Gerar QR Code'}
          </button>
        </>
      }
    >
      <Campo rotulo="Nome do número" dica="Só para a equipe se orientar. Ex.: Atendimento, Secretaria, Matrículas.">
        <input
          id="conexao-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && criar()}
          maxLength={60}
          autoFocus
        />
      </Campo>

      <div className="pilha-sm">
        <Interruptor ligado={sincronizar} aoMudar={setSincronizar}>
          Sincronizar as conversas e os contatos que já existem neste número
        </Interruptor>
        <div className="dica">
          <strong>Ficam visíveis para toda a equipe.</strong> Se for um número pessoal, desligue.
        </div>
      </div>
    </Modal>
  )
}

function ModalRenomear({ conexao, aoFechar }: { conexao: Conexao; aoFechar: () => void }) {
  const loja = useLoja()
  const [nome, setNome] = useState(conexao.nome)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!nome.trim() || salvando) return
    setSalvando(true)
    try {
      loja.aplicarConexao(await api.renomearConexao(conexao.id, nome))
      loja.avisar('Nome salvo.', 'ok')
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Renomear número"
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primario" onClick={salvar} disabled={salvando || !nome.trim()}>
            Salvar
          </button>
        </>
      }
    >
      <Campo rotulo="Nome do número">
        <input
          id="conexao-renomear"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && salvar()}
          maxLength={60}
          autoFocus
        />
      </Campo>
    </Modal>
  )
}
