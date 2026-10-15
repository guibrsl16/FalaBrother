/**
 * Conversa com o servidor.
 *
 * Uma função só para falar HTTP: assim, o dia em que a API mudar de
 * endereço ou passar a exigir um cabeçalho, muda-se um lugar.
 */
import type {
  Agente,
  Ajustes,
  Conexao,
  Conversa,
  Curso,
  EstadoInicial,
  Indicadores,
  Mensagem,
  Papel,
  Pareamento,
  ResultadoTeste,
  Sessao,
  Usuario,
} from './tipos'

/**
 * Disparado quando o servidor responde 401 fora das rotas de sessão: a
 * sessão acabou (ou alguém trocou a senha). A loja ouve e volta para o login.
 */
export const EVENTO_SESSAO_CAIU = 'sessao-caiu'

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  })
  const texto = await resposta.text()
  const corpo = texto ? JSON.parse(texto) : null
  if (!resposta.ok) {
    if (resposta.status === 401 && !caminho.startsWith('/sessao')) {
      window.dispatchEvent(new Event(EVENTO_SESSAO_CAIU))
    }
    throw new Error(corpo?.erro || `Erro ${resposta.status}`)
  }
  return corpo as T
}

const enviarJson = (metodo: string) => (caminho: string, dados?: unknown) =>
  pedir(caminho, { method: metodo, body: dados === undefined ? undefined : JSON.stringify(dados) })

export const api = {
  /* sessão */
  sessao: () => pedir<Sessao>('/sessao'),
  entrar: (dados: { email: string; senha: string; lembrar: boolean }) =>
    enviarJson('POST')('/sessao/entrar', dados) as Promise<Sessao>,
  /** Só funciona enquanto não existe ninguém: cria a primeira conta (administradora). */
  primeiroAcesso: (dados: { nome: string; email: string; senha: string }) =>
    enviarJson('POST')('/sessao/primeiro-acesso', dados) as Promise<Sessao>,
  /* verificação em duas etapas */
  iniciarPareamento: () => enviarJson('POST')('/sessao/2fa/iniciar') as Promise<Pareamento>,
  confirmarPareamento: (codigo: string) =>
    enviarJson('POST')('/sessao/2fa/confirmar', { codigo }) as Promise<{
      sessao: Sessao
      codigos: string[]
    }>,
  verificarCodigo: (dados: { codigo?: string; recuperacao?: string }) =>
    enviarJson('POST')('/sessao/2fa/verificar', dados) as Promise<Sessao>,
  novosCodigos: (codigo: string) =>
    enviarJson('POST')('/sessao/2fa/novos-codigos', { codigo }) as Promise<{
      codigos: string[]
      usuario: Usuario
    }>,
  sair: () => enviarJson('POST')('/sessao/sair'),
  mudarSenha: (atual: string, nova: string) => enviarJson('PUT')('/sessao/senha', { atual, nova }),
  mudarNome: (nome: string) => enviarJson('PUT')('/sessao/perfil', { nome }) as Promise<Usuario>,
  salvarFotoDePerfil: (fotoBase64: string) => enviarJson('PUT')('/sessao/foto', { fotoBase64 }),
  apagarFotoDePerfil: () => enviarJson('DELETE')('/sessao/foto'),
  /** Para usar direto num `<img src>`. */
  urlFotoUsuario: (usuarioId: string) => `/api/usuarios/${usuarioId}/foto`,

  /* equipe (só quem administra) */
  equipe: () => pedir<Usuario[]>('/equipe'),
  criarPessoa: (dados: { nome: string; email: string; senha: string; papel: Papel }) =>
    enviarJson('POST')('/equipe', dados) as Promise<Usuario>,
  salvarPessoa: (id: string, dados: { nome?: string; papel?: Papel; senha?: string }) =>
    enviarJson('PUT')(`/equipe/${id}`, dados) as Promise<Usuario>,
  removerPessoa: (id: string) => enviarJson('DELETE')(`/equipe/${id}`) as Promise<Usuario[]>,
  redefinirDuasEtapas: (id: string) =>
    enviarJson('POST')(`/equipe/${id}/redefinir-2fa`) as Promise<Usuario>,

  estado: () => pedir<EstadoInicial>('/estado'),
  painel: () => pedir<Indicadores>('/painel'),

  /** Para usar direto num `<img src>` — não é uma chamada, é o endereço da foto. */
  urlFotoContato: (conexaoId: string, telefone: string) =>
    `/api/conexoes/${conexaoId}/foto/${encodeURIComponent(telefone)}`,

  /** Idem, para a imagem/áudio/documento/figurinha de uma mensagem. */
  urlMidiaMensagem: (conversaId: string, mensagemId: string) =>
    `/api/conversas/${conversaId}/mensagens/${mensagemId}/midia`,

  /* conversas */
  conversas: () => pedir<Conversa[]>('/conversas'),
  mensagens: (id: string) => pedir<Mensagem[]>(`/conversas/${id}/mensagens`),
  marcarLida: (id: string) => enviarJson('POST')(`/conversas/${id}/lida`) as Promise<Conversa>,
  responderComoAtendente: (id: string, texto: string) =>
    enviarJson('POST')(`/conversas/${id}/mensagens`, { texto }) as Promise<Mensagem>,
  atualizarConversa: (id: string, mudancas: Partial<Conversa>) =>
    enviarJson('PATCH')(`/conversas/${id}`, mudancas) as Promise<Conversa>,
  buscarMensagensAntigas: (id: string) => enviarJson('POST')(`/conversas/${id}/buscar-antigas`),
  assumir: (id: string) => enviarJson('POST')(`/conversas/${id}/assumir`) as Promise<Conversa>,
  devolver: (id: string) => enviarJson('POST')(`/conversas/${id}/devolver`) as Promise<Conversa>,
  resolver: (id: string) => enviarJson('POST')(`/conversas/${id}/resolver`) as Promise<Conversa>,
  reabrir: (id: string) => enviarJson('POST')(`/conversas/${id}/reabrir`) as Promise<Conversa>,
  responderComIA: (id: string) => enviarJson('POST')(`/conversas/${id}/responder`) as Promise<Conversa>,
  apagarConversa: (id: string) => enviarJson('DELETE')(`/conversas/${id}`),

  /* agentes */
  agentes: () => pedir<Agente[]>('/agentes'),
  criarAgente: (dados: Partial<Agente>) => enviarJson('POST')('/agentes', dados) as Promise<Agente>,
  salvarAgente: (id: string, dados: Partial<Agente>) =>
    enviarJson('PUT')(`/agentes/${id}`, dados) as Promise<Agente>,
  apagarAgente: (id: string) => enviarJson('DELETE')(`/agentes/${id}`) as Promise<Agente[]>,
  testarAgente: (id: string, historico: { de: string; texto: string }[]) =>
    enviarJson('POST')(`/agentes/${id}/testar`, { historico }) as Promise<ResultadoTeste>,

  /* conexões (números de WhatsApp por QR Code) */
  conexoes: () => pedir<Conexao[]>('/conexoes'),
  /** `sincronizar`: importa as conversas e a agenda que o celular enviar na leitura do QR. */
  criarConexao: (nome: string, sincronizar = true) =>
    enviarJson('POST')('/conexoes', { nome, sincronizar }) as Promise<Conexao>,
  renomearConexao: (id: string, nome: string) =>
    enviarJson('PUT')(`/conexoes/${id}`, { nome }) as Promise<Conexao>,
  /** Reconecta; com novoQr, apaga a sessão e gera outro QR Code. */
  iniciarConexao: (id: string, novoQr = false) =>
    enviarJson('POST')(`/conexoes/${id}/iniciar`, { novoQr }) as Promise<Conexao>,
  removerConexao: (id: string) => enviarJson('DELETE')(`/conexoes/${id}`),

  /* cursos */
  cursos: () => pedir<Curso[]>('/cursos'),
  criarCurso: (dados: Partial<Curso>) => enviarJson('POST')('/cursos', dados) as Promise<Curso>,
  salvarCurso: (id: string, dados: Partial<Curso>) =>
    enviarJson('PUT')(`/cursos/${id}`, dados) as Promise<Curso>,
  apagarCurso: (id: string) => enviarJson('DELETE')(`/cursos/${id}`) as Promise<Curso[]>,

  /* ajustes e canal */
  ajustes: () => pedir<Ajustes>('/ajustes'),
  salvarAjustes: (dados: Record<string, unknown>) =>
    enviarJson('PUT')('/ajustes', dados) as Promise<Ajustes>,
  testarCanal: () =>
    enviarJson('POST')('/canal/testar') as Promise<{
      ok: boolean
      mensagem?: string
      numero?: string
      nome?: string
      qualidade?: string
    }>,
}

/* ------------------------------------------------------------------ */
/* Eventos em tempo real                                               */
/* ------------------------------------------------------------------ */

export type OuvinteEvento = (tipo: string, dados: unknown) => void

/**
 * Abre a conexão de eventos. O navegador reconecta sozinho quando a
 * conexão cai, então aqui só é preciso avisar a tela do estado.
 */
export function ouvirEventos(aoEvento: OuvinteEvento, aoMudarConexao: (ligado: boolean) => void) {
  const fonte = new EventSource('/api/eventos')

  const tipos = [
    'conversa',
    'conversa-removida',
    'mensagem',
    'mensagem-atualizada',
    'agentes',
    'cursos',
    'ajustes',
    'conexao',
    'conexao-qr',
    'conexao-removida',
    'conversas-sincronizadas',
    'digitando',
    'parou-de-digitar',
  ]

  for (const tipo of tipos) {
    fonte.addEventListener(tipo, (evento) => {
      try {
        aoEvento(tipo, JSON.parse((evento as MessageEvent).data))
      } catch {
        /* pacote estranho: ignora em vez de derrubar a tela */
      }
    })
  }

  fonte.onopen = () => aoMudarConexao(true)
  fonte.onerror = () => aoMudarConexao(false)

  return () => fonte.close()
}
