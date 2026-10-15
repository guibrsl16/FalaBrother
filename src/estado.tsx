/**
 * O estado compartilhado da tela.
 *
 * Uma coisa só é dona da verdade: este arquivo. As telas leem daqui e
 * pedem mudanças por aqui — nenhuma delas guarda cópia própria da lista de
 * conversas. Sem isso, a mensagem que chega pelo tempo real apareceria numa
 * tela e não na outra.
 *
 * Antes de qualquer dado vem a sessão: enquanto não se sabe quem está do
 * outro lado, nada é carregado e nenhuma conexão de tempo real é aberta.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, EVENTO_SESSAO_CAIU, ouvirEventos } from './api'
import type { Agente, Ajustes, Conexao, Conversa, Curso, Indicadores, Mensagem, Sessao } from './tipos'

interface Aviso {
  id: number
  texto: string
  tom: 'ok' | 'erro' | 'neutro'
}

interface Loja {
  carregando: boolean
  erroDeAbertura: string
  conectado: boolean

  /** null enquanto o servidor ainda não disse quem está logado. */
  sessao: Sessao | null
  /** Pergunta de novo ao servidor quem está logado (depois do primeiro cadastro). */
  recarregarSessao: () => Promise<void>
  entrar: (email: string, senha: string, lembrar: boolean) => Promise<void>
  /** Enquanto não existe ninguém: cria a primeira conta (administradora) e leva ao QR de 2 etapas. */
  primeiroAcesso: (nome: string, email: string, senha: string) => Promise<void>
  /** Segunda etapa: o código do app ou um código de recuperação. */
  verificarCodigo: (dados: { codigo?: string; recuperacao?: string }) => Promise<void>
  /** Primeiro login: o primeiro código prova que o celular foi pareado e abre a sessão. */
  confirmarPareamento: (codigo: string) => Promise<void>
  sair: () => Promise<void>

  /**
   * Códigos de recuperação recém-gerados, que a tela mostra uma única vez.
   * Enquanto existirem, o sistema fica coberto por um aviso: se a pessoa
   * seguisse sem guardá-los, o dia em que perdesse o celular seria o dia em
   * que descobriria que não tem como entrar.
   */
  codigosNovos: string[] | null
  mostrarCodigos: (codigos: string[]) => void
  fecharCodigos: () => void

  ajustes: Ajustes | null
  cursos: Curso[]
  agentes: Agente[]
  conversas: Conversa[]
  indicadores: Indicadores | null
  canal: { whatsappConfigurado: boolean; modelo: string }
  /** Os números de WhatsApp ligados por QR Code, sempre atualizados pelo tempo real. */
  conexoes: Conexao[]

  /** Conversas cujo agente está gerando resposta neste momento. */
  digitando: Set<string>

  avisos: Aviso[]
  avisar: (texto: string, tom?: Aviso['tom']) => void

  recarregar: () => Promise<void>
  aplicarConversa: (conversa: Conversa) => void
  aplicarAgentes: (agentes: Agente[]) => void
  aplicarCursos: (cursos: Curso[]) => void
  aplicarAjustes: (ajustes: Ajustes) => void
  /** Põe (ou atualiza) uma conexão na lista na hora, sem esperar o tempo real. */
  aplicarConexao: (conexao: Conexao) => void

  /** Assina as mensagens de uma conversa e devolve a lista já carregada. */
  usarMensagens: (conversaId: string | null) => { mensagens: Mensagem[]; carregando: boolean }
}

const Contexto = createContext<Loja | null>(null)

export function useLoja() {
  const loja = useContext(Contexto)
  if (!loja) throw new Error('useLoja fora do provedor')
  return loja
}

export function ProvedorDaLoja({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [erroDeAbertura, setErro] = useState('')
  const [conectado, setConectado] = useState(false)
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [codigosNovos, setCodigosNovos] = useState<string[] | null>(null)

  const [ajustes, setAjustes] = useState<Ajustes | null>(null)
  const [cursos, setCursos] = useState<Curso[]>([])
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null)
  const [canal, setCanal] = useState({ whatsappConfigurado: false, modelo: '' })
  const [conexoes, setConexoes] = useState<Conexao[]>([])
  const [digitando, setDigitando] = useState<Set<string>>(new Set())
  const [avisos, setAvisos] = useState<Aviso[]>([])

  /** Histórico já carregado, por conversa. Chave nova = busca no servidor. */
  const [historicos, setHistoricos] = useState<Record<string, Mensagem[]>>({})
  const carregandoHistorico = useRef<Set<string>>(new Set())
  /**
   * Mensagens que chegaram pelo tempo real enquanto o histórico daquela
   * conversa ainda estava vindo do servidor. Sem esta fila, elas se perdiam:
   * o evento chegava antes de existir lista para receber, e a resposta da
   * busca — montada antes da mensagem existir — sobrescrevia tudo.
   */
  const mensagensEmEspera = useRef<Record<string, Mensagem[]>>({})

  const avisar = useCallback((texto: string, tom: Aviso['tom'] = 'neutro') => {
    const id = Date.now() + Math.random()
    setAvisos((atuais) => [...atuais, { id, texto, tom }])
    setTimeout(() => setAvisos((atuais) => atuais.filter((a) => a.id !== id)), 4200)
  }, [])

  const recarregar = useCallback(async () => {
    try {
      const dados = await api.estado()
      setAjustes(dados.ajustes)
      setCursos(dados.cursos)
      setAgentes(dados.agentes)
      setConversas(dados.conversas)
      setIndicadores(dados.indicadores)
      setCanal(dados.canal)
      setConexoes(dados.conexoes)
      setErro('')
    } catch (erro) {
      setErro(erro instanceof Error ? erro.message : String(erro))
    } finally {
      setCarregando(false)
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /* Sessão: primeiro descobre quem está logado, só então carrega       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    api
      .sessao()
      .then((s) => {
        setSessao(s)
        // os dados só vêm para quem está logado
        if (s.usuario) recarregar()
        else setCarregando(false)
      })
      .catch((erro) => {
        setErro(erro instanceof Error ? erro.message : String(erro))
        setCarregando(false)
      })
  }, [recarregar])

  // o servidor respondeu 401 em alguma chamada: a sessão acabou
  useEffect(() => {
    const aoCair = () => {
      setSessao((atual) => (atual?.usuario ? { ...atual, usuario: null } : atual))
      avisar('Sua sessão acabou. Entre de novo.', 'erro')
    }
    window.addEventListener(EVENTO_SESSAO_CAIU, aoCair)
    return () => window.removeEventListener(EVENTO_SESSAO_CAIU, aoCair)
  }, [avisar])

  const recarregarSessao = useCallback(async () => {
    setSessao(await api.sessao())
  }, [])

  const limparDados = useCallback(() => {
    setConversas([])
    setHistoricos({})
    setIndicadores(null)
    setConexoes([])
    setDigitando(new Set())
    mensagensEmEspera.current = {}
    carregandoHistorico.current.clear()
  }, [])

  /** Senha certa. Não abre o sistema: leva à etapa do código (ou do QR Code). */
  const entrar = useCallback(async (email: string, senha: string, lembrar: boolean) => {
    setSessao(await api.entrar({ email, senha, lembrar }))
  }, [])

  /** Cria a primeira conta. Como no login, não abre sessão: leva ao pareamento do celular. */
  const primeiroAcesso = useCallback(async (nome: string, email: string, senha: string) => {
    setSessao(await api.primeiroAcesso({ nome, email, senha }))
  }, [])

  const verificarCodigo = useCallback(
    async (dados: { codigo?: string; recuperacao?: string }) => {
      const s = await api.verificarCodigo(dados)
      setSessao(s)
      setCarregando(true)
      await recarregar()
      if (s.codigosRestantes !== undefined) {
        avisar(
          s.codigosRestantes === 0
            ? 'Você usou o último código de recuperação. Gere novos em Ajustes → Minha conta.'
            : `Você entrou com um código de recuperação. Restam ${s.codigosRestantes}.`,
          'neutro',
        )
      }
    },
    [recarregar, avisar],
  )

  const confirmarPareamento = useCallback(
    async (codigo: string) => {
      const r = await api.confirmarPareamento(codigo)
      setCodigosNovos(r.codigos)
      setSessao(r.sessao)
      setCarregando(true)
      await recarregar()
    },
    [recarregar],
  )

  const mostrarCodigos = useCallback((codigos: string[]) => setCodigosNovos(codigos), [])
  const fecharCodigos = useCallback(() => setCodigosNovos(null), [])

  const sair = useCallback(async () => {
    try {
      await api.sair()
    } catch {
      /* mesmo que o servidor não responda, a tela volta para o login */
    }
    limparDados()
    setCodigosNovos(null)
    setSessao({ configurado: true, usuario: null, etapa: null, pendente: null })
  }, [limparDados])

  /* ---------------------------------------------------------------- */
  /* Tema                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (ajustes?.tema) document.documentElement.dataset.tema = ajustes.tema
  }, [ajustes?.tema])

  /* ---------------------------------------------------------------- */
  /* Aplicadores                                                       */
  /* ---------------------------------------------------------------- */

  const aplicarConexao = useCallback((conexao: Conexao) => {
    setConexoes((atuais) =>
      atuais.some((c) => c.id === conexao.id)
        ? atuais.map((c) => (c.id === conexao.id ? { ...c, ...conexao } : c))
        : [...atuais, conexao],
    )
  }, [])

  const aplicarConversa = useCallback((conversa: Conversa) => {
    setConversas((atuais) => {
      const i = atuais.findIndex((c) => c.id === conversa.id)
      if (i < 0) return [...atuais, conversa]
      const copia = [...atuais]
      copia[i] = conversa
      return copia
    })
  }, [])

  /* ---------------------------------------------------------------- */
  /* Tempo real (só com alguém logado)                                 */
  /* ---------------------------------------------------------------- */

  const usuarioId = sessao?.usuario?.id || null
  const podeUsar = Boolean(usuarioId)

  useEffect(() => {
    if (!podeUsar) {
      setConectado(false)
      return
    }
    const fechar = ouvirEventos(
      (tipo, dados) => {
        if (tipo === 'conversa') {
          aplicarConversa(dados as Conversa)
          return
        }
        if (tipo === 'conversa-removida') {
          const { id } = dados as { id: string }
          setConversas((atuais) => atuais.filter((c) => c.id !== id))
          setHistoricos((atuais) => {
            const copia = { ...atuais }
            delete copia[id]
            return copia
          })
          return
        }
        if (tipo === 'mensagem') {
          const mensagem = dados as Mensagem
          if (carregandoHistorico.current.has(mensagem.conversaId)) {
            const fila = mensagensEmEspera.current[mensagem.conversaId] || []
            fila.push(mensagem)
            mensagensEmEspera.current[mensagem.conversaId] = fila
            return
          }
          setHistoricos((atuais) => {
            // só guarda se a conversa já estava aberta em algum momento —
            // senão o histórico seria montado pela metade, sem o começo
            if (!atuais[mensagem.conversaId]) return atuais
            if (atuais[mensagem.conversaId].some((m) => m.id === mensagem.id)) return atuais
            return {
              ...atuais,
              [mensagem.conversaId]: [...atuais[mensagem.conversaId], mensagem],
            }
          })
          return
        }
        if (tipo === 'mensagem-atualizada') {
          const mensagem = dados as Mensagem
          setHistoricos((atuais) => {
            const lista = atuais[mensagem.conversaId]
            if (!lista) return atuais
            return {
              ...atuais,
              [mensagem.conversaId]: lista.map((m) => (m.id === mensagem.id ? mensagem : m)),
            }
          })
          return
        }
        if (tipo === 'agentes') {
          setAgentes(dados as Agente[])
          return
        }
        if (tipo === 'cursos') {
          setCursos(dados as Curso[])
          return
        }
        if (tipo === 'conexao') {
          // o estado vem sem o QR (ele chega à parte, só para quem administra):
          // preserva o QR que já temos enquanto a conexão segue aguardando a leitura
          const nova = dados as Conexao
          setConexoes((atuais) => {
            const anterior = atuais.find((c) => c.id === nova.id)
            const qr = nova.estado === 'aguardando-qr' ? (anterior?.qr ?? null) : null
            const completa = { ...nova, qr }
            return anterior
              ? atuais.map((c) => (c.id === nova.id ? completa : c))
              : [...atuais, completa]
          })
          return
        }
        if (tipo === 'conexao-qr') {
          const { id, qr } = dados as { id: string; qr: string | null }
          setConexoes((atuais) => atuais.map((c) => (c.id === id ? { ...c, qr } : c)))
          return
        }
        if (tipo === 'conversas-sincronizadas') {
          // entraram conversas do histórico do celular, muitas de uma vez: busca a lista inteira
          // e descarta os históricos em memória (o de uma conversa aberta pode ter ganhado mensagens)
          api.conversas().then(setConversas).catch(() => undefined)
          setHistoricos({})
          return
        }
        if (tipo === 'conexao-removida') {
          const { id } = dados as { id: string }
          setConexoes((atuais) => atuais.filter((c) => c.id !== id))
          return
        }
        if (tipo === 'ajustes') {
          setAjustes(dados as Ajustes)
          return
        }
        if (tipo === 'digitando') {
          const { conversaId } = dados as { conversaId: string }
          setDigitando((atuais) => new Set(atuais).add(conversaId))
          return
        }
        if (tipo === 'parou-de-digitar') {
          const { conversaId } = dados as { conversaId: string }
          setDigitando((atuais) => {
            const copia = new Set(atuais)
            copia.delete(conversaId)
            return copia
          })
        }
      },
      (ligado) => setConectado(ligado),
    )
    return fechar
  }, [aplicarConversa, podeUsar, usuarioId])

  /* ---------------------------------------------------------------- */
  /* Indicadores: recalcula quando a conversa muda, mas sem exagero    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (carregando || !podeUsar) return
    const timer = setTimeout(() => {
      api.painel().then(setIndicadores).catch(() => undefined)
    }, 1200)
    return () => clearTimeout(timer)
  }, [conversas, carregando, podeUsar])

  /* ---------------------------------------------------------------- */
  /* Histórico sob demanda                                             */
  /* ---------------------------------------------------------------- */

  const usarMensagens = useCallback(
    (conversaId: string | null) => {
      if (!conversaId) return { mensagens: [] as Mensagem[], carregando: false }
      const lista = historicos[conversaId]
      if (lista) return { mensagens: lista, carregando: false }

      if (!carregandoHistorico.current.has(conversaId)) {
        carregandoHistorico.current.add(conversaId)
        api
          .mensagens(conversaId)
          .then((mensagens) => {
            // junta o que chegou pelo tempo real durante a busca, sem repetir
            const atrasadas = (mensagensEmEspera.current[conversaId] || []).filter(
              (m) => !mensagens.some((x) => x.id === m.id),
            )
            delete mensagensEmEspera.current[conversaId]
            setHistoricos((atuais) => ({ ...atuais, [conversaId]: [...mensagens, ...atrasadas] }))
            // a baixa da bandeira vem depois de juntar tudo, no mesmo passo:
            // assim nenhum evento cai no vão entre uma coisa e outra
            carregandoHistorico.current.delete(conversaId)
          })
          .catch(() => {
            delete mensagensEmEspera.current[conversaId]
            carregandoHistorico.current.delete(conversaId)
            avisar('Não consegui carregar o histórico dessa conversa.', 'erro')
          })
      }
      return { mensagens: [] as Mensagem[], carregando: true }
    },
    [historicos, avisar],
  )

  const valor = useMemo<Loja>(
    () => ({
      carregando,
      erroDeAbertura,
      conectado,
      sessao,
      recarregarSessao,
      entrar,
      primeiroAcesso,
      verificarCodigo,
      confirmarPareamento,
      sair,
      codigosNovos,
      mostrarCodigos,
      fecharCodigos,
      ajustes,
      cursos,
      agentes,
      conversas,
      indicadores,
      canal,
      conexoes,
      digitando,
      avisos,
      avisar,
      recarregar,
      aplicarConversa,
      aplicarAgentes: setAgentes,
      aplicarCursos: setCursos,
      aplicarAjustes: setAjustes,
      aplicarConexao,
      usarMensagens,
    }),
    [
      carregando,
      erroDeAbertura,
      conectado,
      sessao,
      recarregarSessao,
      entrar,
      primeiroAcesso,
      verificarCodigo,
      confirmarPareamento,
      sair,
      codigosNovos,
      mostrarCodigos,
      fecharCodigos,
      ajustes,
      cursos,
      agentes,
      conversas,
      indicadores,
      canal,
      conexoes,
      digitando,
      avisos,
      avisar,
      recarregar,
      aplicarConversa,
      aplicarConexao,
      usarMensagens,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
