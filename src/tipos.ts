/** Os tipos que o servidor e a tela combinam entre si. */

export type EstadoConversa = 'aguardando' | 'ia' | 'humano' | 'resolvida'

export type QuemFalou = 'cliente' | 'agente' | 'atendente' | 'sistema'

export type Esforco = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface Curso {
  id: string
  nome: string
  resumo: string
  publico: string
  duracao: string
  formato: string
  investimento: string
  certificado: string
  diferenciais: string[]
  cor: string
}

export interface PerguntaFrequente {
  pergunta: string
  resposta: string
}

export interface Agente {
  id: string
  nome: string
  papel: string
  cursoId: string | null
  triagem: boolean
  ativo: boolean
  modelo: string
  esforco: Esforco
  raciocinio: boolean
  maxTokens: number
  saudacao: string
  instrucoes: string
  palavrasChave: string[]
  perguntasFrequentes: PerguntaFrequente[]
  regrasEscalonamento: string
  criadoEm: string
}

export interface Lead {
  nome: string
  curso: string
  etapa: string
  anotacao: string
}

export interface Conversa {
  id: string
  /** Vazio quando o WhatsApp só informou um identificador interno, sem o número. */
  telefone: string
  /** Por qual número da escola a conversa acontece (null = API oficial da Meta). */
  conexaoId: string | null
  /** O que a própria pessoa pôs no perfil do WhatsApp. Só informação: o título é o nome salvo ou o número. */
  nomePerfil?: string
  /** Veio do histórico do celular (sincronização), não de uma mensagem de agora. */
  importada?: boolean
  nomeContato: string
  canal: string
  estado: EstadoConversa
  agenteId: string | null
  cursoId: string | null
  etiquetas: string[]
  naoLidas: number
  totalMensagens?: number
  resumo: string
  lead: Lead
  criadaEm: string
  atualizadaEm: string
  ultimaMensagem: { de: QuemFalou; texto: string; em: string } | null
}

export interface Mensagem {
  id: string
  conversaId: string
  de: QuemFalou
  texto: string
  em: string
  waId: string | null
  status: string
  agenteId: string | null
  tipo: string
  anexo: { tipo: string; mimetype?: string; nomeArquivo?: string } | null
  uso: { entrada: number; saida: number; cacheLido: number; cacheEscrito: number } | null
  erro: string | null
}

export interface Segredo {
  preenchido: boolean
  fim: string
}

export interface Ajustes {
  nomeDaCasa: string
  assinatura: string
  tema: 'preto' | 'claro'
  iaLigada: boolean
  segundosDeEspera: number
  memoriaDeMensagens: number
  horario: {
    ligado: boolean
    inicio: string
    fim: string
    dias: number[]
    mensagemForaDoHorario: string
  }
  whatsapp: {
    phoneNumberId: string
    token: Segredo
    verifyToken: string
    appSecret: Segredo
    versaoApi: string
    numeroExibicao: string
  }
  anthropicApiKey: Segredo
}

export interface Indicadores {
  total: number
  abertasHoje: number
  aguardando: number
  comIA: number
  comHumano: number
  resolvidas: number
  respostasIA: number
  transferencias: number
  mensagensHoje: number
  custoHojeUSD: number
  custoMesUSD: number
  porCurso: { cursoId: string; nome: string; cor: string; conversas: number }[]
  agentesAtivos: number
}

export interface EstadoInicial {
  ajustes: Ajustes
  cursos: Curso[]
  agentes: Agente[]
  conversas: Conversa[]
  indicadores: Indicadores
  canal: { whatsappConfigurado: boolean; modelo: string }
  conexoes: Conexao[]
}

/**
 * iniciando = abrindo pela primeira vez · aguardando-qr = esperando a leitura
 * no celular · conectando = voltando depois de uma queda · conectada ·
 * desconectada (o `motivo` diz o que fazer).
 */
export type EstadoConexao = 'iniciando' | 'aguardando-qr' | 'conectando' | 'conectada' | 'desconectada'

/**
 * desligada · aguardando (o celular ainda não mandou) · sincronizando ·
 * concluida · indisponivel (o celular não mandou nada) · interrompida
 * (o sistema reiniciou no meio).
 */
export type EstadoSincronizacao =
  | 'desligada'
  | 'aguardando'
  | 'sincronizando'
  | 'concluida'
  | 'indisponivel'
  | 'interrompida'

export interface Sincronizacao {
  estado: EstadoSincronizacao
  /** Conversas trazidas do celular. */
  conversas: number
  mensagens: number
  /** 0–100 quando o celular informa; null enquanto não se sabe. */
  progresso: number | null
  iniciadaEm: string | null
  concluidaEm: string | null
}

/** Um número de WhatsApp ligado ao sistema por QR Code. */
export interface Conexao {
  id: string
  nome: string
  /** Só números, com o código do país. Vazio até a primeira leitura do QR. */
  telefone: string
  estado: EstadoConexao
  motivo: string
  vinculada: boolean
  conectadaEm: string | null
  criadaEm: string
  /** Importa o histórico que o celular enviar na leitura do QR? */
  sincronizar: boolean
  sincronizacao: Sincronizacao
  /** QR Code como imagem. Só vem para quem administra, e só enquanto aguarda a leitura. */
  qr?: string | null
}

export type Papel = 'admin' | 'atendente'

export interface Usuario {
  id: string
  nome: string
  email: string
  papel: Papel
  criadoEm: string
  /** O celular já foi pareado (verificação em duas etapas ativa). */
  doisPassos: boolean
  /** Quantos códigos de recuperação ainda não foram usados. */
  codigosRestantes: number
}

/** O que o servidor diz sobre quem está do outro lado da tela. */
export interface Sessao {
  /** Já existe alguém cadastrado? */
  configurado: boolean
  usuario: Usuario | null
  /**
   * Senha certa, falta o segundo fator: 'configurar' = ainda não pareou o
   * celular (mostra o QR); 'codigo' = já pareou (pede os 6 números).
   */
  etapa: 'configurar' | 'codigo' | null
  /** Quem está no meio da entrada, para a tela dizer "olá, fulano". */
  pendente: { nome: string; email: string } | null
  /** Só vem ao entrar com código de recuperação: quantos sobraram. */
  codigosRestantes?: number
}

/** O QR do pareamento e o mesmo segredo em texto, para quem não consegue escanear. */
export interface Pareamento {
  qr: string
  segredo: string
}

export interface ResultadoTeste {
  texto: string
  recusa?: string
  transferir: { motivo: string; resumo: string } | null
  acoes: { tipo: string; [k: string]: unknown }[]
  uso: { entrada: number; saida: number; cacheLido: number; cacheEscrito: number }
  agenteId: string
}
