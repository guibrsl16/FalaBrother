import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLoja } from './estado'
import { api } from './api'
import { Avatar } from './componentes/Base'
import {
  IconeAgentes,
  IconeAjustes,
  IconeConexoes,
  IconeContatos,
  IconeConversas,
  IconeCursos,
  IconeDashboard,
  IconePainel,
  IconeSair,
  IconeWhatsapp,
  Logo,
} from './componentes/Icones'
import Conexoes from './telas/Conexoes'
import Conversas from './telas/Conversas'
import Contatos from './telas/Contatos'
import Agentes from './telas/Agentes'
import CursosTela from './telas/Cursos'
import Painel from './telas/Painel'
import Dashboard from './telas/Dashboard'
import Canal from './telas/Canal'
import AjustesTela from './telas/Ajustes'
import Login from './telas/Login'
import { ModalCodigos } from './telas/DoisPassos'

/**
 * O menu é agrupado pelo que a pessoa está tentando fazer.
 *
 * Em cima, as conexões: sem número conectado não chega conversa nenhuma, então
 * é a primeira coisa a existir — e a primeira a olhar quando algo para de
 * chegar. Depois o atendimento, onde se passa o dia, e logo abaixo os
 * agentes, que são o mesmo assunto visto de outro ângulo: quem responde
 * quando ninguém está olhando. A API oficial e os Ajustes ficam por último:
 * mexe-se neles uma vez e esquece.
 */
const TELAS = [
  {
    chave: 'conexoes',
    nome: 'Conexões',
    grupo: 'WhatsApp',
    icone: IconeConexoes,
    descricao: 'Os números de WhatsApp da escola, conectados por QR Code.',
    cheia: false,
  },
  {
    chave: 'conversas',
    nome: 'Conversas',
    grupo: 'Atendimento',
    icone: IconeConversas,
    descricao: 'Todas as conversas do WhatsApp, com histórico e resposta manual.',
    cheia: true,
  },
  {
    chave: 'painel',
    nome: 'Painel',
    grupo: 'Atendimento',
    icone: IconePainel,
    descricao: 'Como está o atendimento hoje: fila, respostas da IA e transferências.',
    cheia: false,
  },
  {
    chave: 'dashboard',
    nome: 'Dashboard',
    grupo: 'Comercial',
    icone: IconeDashboard,
    descricao: 'Leads, funil de interesse e quantas matrículas já fecharam.',
    cheia: false,
  },
  {
    chave: 'contatos',
    nome: 'Contatos',
    grupo: 'Comercial',
    icone: IconeContatos,
    descricao: 'Todo mundo que já escreveu — separado em Cliente e Lead.',
    cheia: false,
  },
  {
    chave: 'agentes',
    nome: 'Agentes',
    grupo: 'Inteligência',
    icone: IconeAgentes,
    descricao: 'Um agente de IA para cada curso. Instruções, testes e roteamento.',
    cheia: false,
  },
  {
    chave: 'cursos',
    nome: 'Cursos',
    grupo: 'Inteligência',
    icone: IconeCursos,
    descricao: 'O catálogo que os agentes usam para responder — preço, duração e formato.',
    cheia: false,
  },
  {
    chave: 'canal',
    nome: 'API oficial',
    grupo: 'Canal',
    icone: IconeWhatsapp,
    descricao: 'Ligação opcional com a API oficial da Meta: número, token e webhook.',
    cheia: false,
  },
] as const

const GRUPOS = ['WhatsApp', 'Atendimento', 'Comercial', 'Inteligência', 'Canal'] as const

export default function App() {
  const {
    carregando,
    erroDeAbertura,
    conversas,
    conexoes,
    agentes,
    conectado,
    avisos,
    canal,
    ajustes,
    sessao,
    sair,
    codigosNovos,
    fecharCodigos,
  } = useLoja()
  const [tela, setTela] = useState<string>('conversas')

  // Quem entra sem nenhum número conectado cai direto em Conexões: sem número não
  // há atendimento, e é a única coisa que falta fazer. Só na primeira vez que os
  // dados chegam — depois disso a pessoa navega para onde quiser.
  const escolheuTelaInicial = useRef(false)
  useEffect(() => {
    if (carregando || !sessao?.usuario || escolheuTelaInicial.current) return
    escolheuTelaInicial.current = true
    if (conexoes.length === 0 && !canal.whatsappConfigurado) setTela('conexoes')
  }, [carregando, sessao?.usuario, conexoes.length, canal.whatsappConfigurado])

  const atual = TELAS.find((t) => t.chave === tela)

  const contadores = useMemo(() => {
    const naoLidas = conversas.reduce((soma, c) => soma + (c.naoLidas || 0), 0)
    return {
      conversas: naoLidas,
      agentes: agentes.filter((a) => a.ativo).length,
      // o selo da tela de Conexões só aparece quando algum número caiu
      conexoes: conexoes.filter((c) => c.estado === 'desconectada').length,
    }
  }, [conversas, agentes, conexoes])

  const conectadas = conexoes.filter((c) => c.estado === 'conectada').length
  const situacaoDosNumeros =
    conexoes.length === 0
      ? canal.whatsappConfigurado
        ? 'API oficial ligada'
        : 'Nenhum número conectado'
      : conectadas === conexoes.length
        ? conectadas === 1
          ? '1 número conectado'
          : `${conectadas} números conectados`
        : `${conectadas} de ${conexoes.length} conectados`
  const numerosOk = conectadas > 0 || (conexoes.length === 0 && canal.whatsappConfigurado)

  const aguardando = useMemo(
    () => conversas.filter((c) => c.estado === 'aguardando' || c.estado === 'humano').length,
    [conversas],
  )

  const splash = (
    <div className="splash">
      <Logo tamanho={104} />
      <div className="splash-nome">
        BROTHERHOOD CURSOS<span>ATENDIMENTO</span>
      </div>
      <div className="splash-barra">
        <i />
      </div>
    </div>
  )

  // Ordem: primeiro saber quem está logado; sem ninguém, a porta de entrada;
  // só depois os dados do atendimento.
  if (sessao === null && !erroDeAbertura) return splash
  if (sessao && !sessao.usuario) return <Login />
  if (!erroDeAbertura && carregando) return splash

  if (erroDeAbertura) {
    return (
      <div className="splash">
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
          <h1 style={{ color: 'var(--vermelho)' }}>Não consegui falar com o servidor</h1>
          <p style={{ color: 'var(--txt-2)', marginTop: 12, lineHeight: 1.6 }}>{erroDeAbertura}</p>
          <p style={{ color: 'var(--txt-3)', marginTop: 16, fontSize: 12.5, lineHeight: 1.6 }}>
            O atendimento roda em um servidor Node à parte. Rode <code>npm start</code> na pasta do
            projeto para subir os dois de uma vez.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* ------------- barra de título ------------- */}
      <div className="barra-titulo">
        <div className="marca">
          <Logo tamanho={24} />
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
            BROTHERHOOD
            <span className="cursos">CURSOS</span>
          </span>
        </div>
        <div className="separador" />
        <div className="sub">{atual?.nome || 'Ajustes'}</div>

        <div className="crescer" />

        <div className="fila" style={{ gap: 16 }}>
          {ajustes && !ajustes.iaLigada && (
            <span className="etiqueta vermelha" title="Ligue de novo em Ajustes">
              IA pausada
            </span>
          )}
          <div
            className={`indicador-conexao ${conectado ? 'ligado' : 'caiu'}`}
            title={
              conectado
                ? 'Recebendo mensagens em tempo real'
                : 'Sem tempo real — reconectando sozinho'
            }
          >
            <span className="luz" />
            {conectado ? 'ao vivo' : 'reconectando'}
          </div>
        </div>
      </div>

      <div className="corpo">
        {/* ------------- menu lateral ------------- */}
        <nav className="lateral">
          <div className="canal-lateral" title="Conversas que precisam de alguém agora">
            <div className="titulo">Na fila</div>
            <div className="numero" style={{ color: aguardando ? 'var(--acento)' : 'var(--txt)' }}>
              {aguardando}
            </div>
            <div className="rodape">
              <span
                className="ponto-estado"
                style={{ background: numerosOk ? 'var(--verde)' : 'var(--amarelo)' }}
              />
              {situacaoDosNumeros}
            </div>
          </div>

          {GRUPOS.map((grupo) => (
            <React.Fragment key={grupo}>
              <div className="grupo rotulo">{grupo}</div>
              {TELAS.filter((t) => t.grupo === grupo).map((t) => {
                const Icone = t.icone
                const conta = contadores[t.chave as keyof typeof contadores]
                return (
                  <button
                    key={t.chave}
                    className={`item-menu ${tela === t.chave ? 'ativo' : ''}`}
                    onClick={() => setTela(t.chave)}
                    title={t.descricao}
                  >
                    <span className="icone">
                      <Icone tamanho={17} />
                    </span>
                    {t.nome}
                    {conta ? (
                      <span className={`selo ${t.chave === 'conversas' || t.chave === 'conexoes' ? 'urgente' : ''}`}>
                        {conta}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </React.Fragment>
          ))}

          <div className="crescer" />

          <div className="rodape-lateral">
            <button
              className={`item-menu ${tela === 'ajustes' ? 'ativo' : ''}`}
              onClick={() => setTela('ajustes')}
              title="Tema, chave da IA, horário de atendimento, equipe"
              style={{ marginBottom: 8 }}
            >
              <span className="icone">
                <IconeAjustes tamanho={17} />
              </span>
              Ajustes
            </button>
            {sessao?.usuario && (
              <div className="quem-esta" title={sessao.usuario.email}>
                <Avatar nome={sessao.usuario.nome} foto={api.urlFotoUsuario(sessao.usuario.id)} pequeno />
                <div className="crescer recortar">
                  <div className="nome recortar">{sessao.usuario.nome}</div>
                  <div>{sessao.usuario.papel === 'admin' ? 'administra' : 'atende'}</div>
                </div>
                <button className="btn-icone" onClick={sair} title="Sair do sistema">
                  <IconeSair tamanho={15} />
                </button>
              </div>
            )}
            <div className="nome">Brotherhood Cursos</div>
            <div>{canal.modelo || 'claude-sonnet-5'}</div>
          </div>
        </nav>

        {/* ------------- conteúdo ------------- */}
        <main className={`conteudo ${atual?.cheia ? 'cheio' : ''}`}>
          {tela === 'conexoes' && <Conexoes />}
          {tela === 'conversas' && <Conversas />}
          {tela === 'painel' && <Painel aoIrPara={setTela} />}
          {tela === 'dashboard' && <Dashboard aoIrPara={setTela} />}
          {tela === 'contatos' && <Contatos aoIrPara={setTela} />}
          {tela === 'agentes' && <Agentes />}
          {tela === 'cursos' && <CursosTela />}
          {tela === 'canal' && <Canal />}
          {tela === 'ajustes' && <AjustesTela />}
        </main>
      </div>

      {/* códigos de recuperação recém-gerados: cobrem tudo até a pessoa confirmar que guardou */}
      {codigosNovos && <ModalCodigos codigos={codigosNovos} aoFechar={fecharCodigos} />}

      {/* ------------- avisos ------------- */}
      <div className="avisos">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso ${a.tom === 'ok' ? 'ok' : a.tom === 'erro' ? 'erro' : ''}`}>
            <span className="ponto" />
            {a.texto}
          </div>
        ))}
      </div>
    </div>
  )
}
