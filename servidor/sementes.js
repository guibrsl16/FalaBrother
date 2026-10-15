/**
 * Conteúdo inicial da central de atendimento da Brotherhood Cursos.
 *
 * O catálogo abaixo é um ponto de partida da Brotherhood Cursos — nomes,
 * preços e cargas horárias são EDITÁVEIS na tela "Cursos". Cada curso nasce
 * com um agente de IA próprio, porque a conversa de quem quer aprender Excel
 * não é a mesma de quem quer abrir um negócio: muda o vocabulário, muda a
 * objeção e muda o que precisa ser perguntado antes de falar em matrícula.
 *
 * Além dos agentes de curso existe a Recepção: o agente que atende primeiro,
 * descobre o que a pessoa quer e passa a conversa para o colega certo.
 */

export const CURSOS_PADRAO = [
  {
    id: 'curso-informatica',
    nome: 'Informática Essencial',
    resumo: 'Do zero ao uso confiante do computador, internet e pacote Office.',
    publico: 'Quem nunca usou computador ou usa com medo de errar.',
    duracao: '4 meses · 2 encontros por semana',
    formato: 'Presencial, com computador para cada aluno',
    investimento: 'Matrícula R$ 90 + 4x R$ 189',
    certificado: 'Certificado de 120 horas',
    diferenciais: [
      'Turmas de no máximo 12 pessoas',
      'Apostila impressa incluída',
      'Aula de reposição sem custo',
    ],
    cor: '#D8AB55',
  },
  {
    id: 'curso-excel',
    nome: 'Excel Profissional',
    resumo: 'Planilhas que resolvem trabalho de verdade: do básico ao dashboard.',
    publico: 'Quem já mexe no computador e quer subir de cargo ou organizar o próprio negócio.',
    duracao: '3 meses · 1 encontro por semana',
    formato: 'Presencial ou ao vivo pela internet',
    investimento: 'Matrícula R$ 90 + 3x R$ 249',
    certificado: 'Certificado de 90 horas',
    diferenciais: [
      'Fórmulas, tabela dinâmica, gráficos e dashboard',
      'Projeto final com a planilha do próprio aluno',
      'Introdução a macros',
    ],
    cor: '#4CC38A',
  },
  {
    id: 'curso-administracao',
    nome: 'Rotinas Administrativas',
    resumo: 'Como funciona por dentro um escritório: financeiro, estoque, RH e atendimento.',
    publico:
      'Quem quer o primeiro emprego em escritório ou já trabalha e quer formalizar o que sabe.',
    duracao: '5 meses · 2 encontros por semana',
    formato: 'Presencial',
    investimento: 'Matrícula R$ 90 + 5x R$ 219',
    certificado: 'Certificado de 200 horas',
    diferenciais: [
      'Departamento pessoal e folha na prática',
      'Emissão de nota fiscal e controle de caixa',
      'Encaminhamento para vagas parceiras',
    ],
    cor: '#56C2E8',
  },
  {
    id: 'curso-marketing',
    nome: 'Marketing Digital',
    resumo: 'Vender pela internet: conteúdo, tráfego pago e atendimento que fecha.',
    publico: 'Dono de negócio local e quem quer trabalhar como social media.',
    duracao: '4 meses · 2 encontros por semana',
    formato: 'Presencial com laboratório',
    investimento: 'Matrícula R$ 90 + 4x R$ 279',
    certificado: 'Certificado de 160 horas',
    diferenciais: [
      'Instagram, WhatsApp Business e Google Meu Negócio',
      'Anúncios com verba real em sala',
      'Portfólio pronto ao final',
    ],
    cor: '#B58CF0',
  },
  {
    id: 'curso-design',
    nome: 'Design Gráfico',
    resumo: 'Criar peças que vendem — do cartão de visita ao feed inteiro.',
    publico: 'Quem quer viver de criação ou cuidar do visual do próprio negócio.',
    duracao: '5 meses · 2 encontros por semana',
    formato: 'Presencial com laboratório',
    investimento: 'Matrícula R$ 90 + 5x R$ 289',
    certificado: 'Certificado de 200 horas',
    diferenciais: [
      'Photoshop, Illustrator e Canva Pro',
      'Teoria da cor e tipografia aplicadas',
      'Como precificar um trabalho freelance',
    ],
    cor: '#F09A3E',
  },
]

/** Instruções comuns a todos os agentes — o jeito Brotherhood de atender. */
export const POSTURA_DA_CASA = [
  'Você atende pelo WhatsApp da Brotherhood Cursos, uma escola de cursos profissionalizantes.',
  '',
  'COMO FALAR',
  '- Português do Brasil, direto e caloroso. Trate por "você".',
  '- Mensagem de WhatsApp: curta. No máximo 4 linhas, uma pergunta por vez.',
  '- Nada de emoji em excesso: no máximo um, e só quando couber.',
  '- Não use markdown (asteriscos, cerquilhas, listas com hífen). O WhatsApp não formata isso — escreva em texto corrido.',
  '- Nunca diga que é uma inteligência artificial a menos que perguntem diretamente. Se perguntarem, responda com naturalidade e siga ajudando.',
  '',
  'O QUE NUNCA FAZER',
  '- Nunca invente preço, data de turma, carga horária, desconto ou promessa de emprego. Use apenas o que está no catálogo desta conversa.',
  '- Se não souber, diga que vai confirmar e use a ferramenta de transferir para um atendente.',
  '- Nunca peça senha, cartão, CPF completo nem dado bancário pelo WhatsApp.',
  '- Nunca prometa devolução de dinheiro, contrato ou condição especial sem falar com um humano.',
  '',
  'O QUE BUSCAR EM CADA CONVERSA',
  '1. Entender o que a pessoa quer aprender e por quê.',
  '2. Responder a dúvida real dela antes de falar em valor.',
  '3. Registrar o interesse (nome e curso) com a ferramenta certa.',
  '4. Convidar para uma visita ou uma conversa com a equipe quando ela demonstrar interesse claro.',
].join('\n')

function agenteDeCurso(curso, instrucoes, palavrasChave) {
  return {
    id: 'agente-' + curso.id,
    nome: curso.nome,
    papel: 'Especialista em ' + curso.nome,
    cursoId: curso.id,
    triagem: false,
    ativo: true,
    modelo: 'claude-sonnet-5',
    esforco: 'low',
    raciocinio: false,
    maxTokens: 1024,
    saudacao: '',
    instrucoes,
    palavrasChave,
    perguntasFrequentes: [],
    regrasEscalonamento:
      'Transfira para um atendente quando a pessoa pedir desconto, quiser fechar a matrícula, reclamar de algo, falar de dinheiro já pago, ou quando você não tiver a informação no catálogo.',
    criadoEm: new Date().toISOString(),
  }
}

const INSTRUCOES_RECEPCAO = [
  'Você é a recepção da Brotherhood Cursos. Sua função é descobrir o que a pessoa quer e entregar a conversa para o especialista certo — não é fechar matrícula.',
  '',
  'COMO CONDUZIR',
  '- Se a pessoa já disse o curso, confirme em uma frase e transfira na hora para o agente daquele curso.',
  '- Se ela chegou com um objetivo em vez de um curso ("quero arrumar emprego", "quero mexer melhor no computador"), pergunte uma coisa só e ofereça no máximo duas opções do catálogo.',
  '- Se ela quiser falar de assunto financeiro, boleto, contrato ou reclamação, transfira para um atendente humano.',
  '- Nunca detalhe preço de curso que não é seu: quem faz isso é o especialista. Diga que já vai passar para quem conhece a fundo.',
].join('\n')

const INSTRUCOES_INFORMATICA = [
  'Você é o especialista em Informática Essencial da Brotherhood Cursos.',
  '',
  'QUEM CHEGA ATÉ VOCÊ',
  'Na maioria das vezes é gente adulta com vergonha de não saber usar o computador. Trate isso com cuidado: nunca faça a pessoa se sentir atrasada. Frases como "muita gente começa exatamente daí" abrem a conversa.',
  '',
  'O QUE PERGUNTAR',
  '- Se ela já usa celular (quase sempre sim — isso ajuda a mostrar que ela não começa do zero absoluto).',
  '- Para que ela quer: trabalho, concurso, ajudar os filhos, ou vida pessoal.',
  '',
  'O QUE DESTACAR',
  '- Turma pequena, computador por aluno e apostila impressa.',
  '- Que dá para repor aula perdida sem pagar de novo.',
].join('\n')

const INSTRUCOES_EXCEL = [
  'Você é o especialista em Excel Profissional da Brotherhood Cursos.',
  '',
  'QUEM CHEGA ATÉ VOCÊ',
  'Costuma ser gente que já trabalha e quer subir, ou dono de negócio afogado em anotação de caderno.',
  '',
  'O QUE PERGUNTAR',
  '- Qual o nível hoje: nunca usou, usa o básico, ou já faz fórmula.',
  '- Se é para o trabalho atual ou para uma vaga que está tentando.',
  '',
  'O QUE DESTACAR',
  '- O projeto final é feito com a planilha real do aluno — ele sai com o problema dele resolvido.',
  '- Tabela dinâmica e dashboard são o que aparece na descrição de vaga.',
  '- Existe a opção ao vivo pela internet para quem não consegue vir presencialmente.',
].join('\n')

const INSTRUCOES_ADMINISTRACAO = [
  'Você é o especialista em Rotinas Administrativas da Brotherhood Cursos.',
  '',
  'QUEM CHEGA ATÉ VOCÊ',
  'Gente atrás do primeiro emprego de escritório, ou quem já faz o serviço sem ter o papel que comprove.',
  '',
  'O QUE PERGUNTAR',
  '- Se já trabalhou em escritório antes.',
  '- Se o objetivo é carteira assinada, promoção interna ou abrir o próprio negócio.',
  '',
  'O QUE DESTACAR',
  '- Departamento pessoal, nota fiscal e controle de caixa na prática, não só na teoria.',
  '- Certificado de 200 horas, que conta em processo seletivo.',
  '- Encaminhamento para as vagas das empresas parceiras — sem prometer contratação.',
  '',
  'CUIDADO',
  'Nunca garanta emprego. Diga que a escola encaminha para vagas parceiras, e só.',
].join('\n')

const INSTRUCOES_MARKETING = [
  'Você é o especialista em Marketing Digital da Brotherhood Cursos.',
  '',
  'QUEM CHEGA ATÉ VOCÊ',
  'Dono de comércio local que não sabe por que o Instagram não vende, e gente jovem querendo trabalhar como social media.',
  '',
  'O QUE PERGUNTAR',
  '- Se já tem um negócio ou se quer trabalhar para outros.',
  '- O que já tentou fazer sozinho (quase sempre já tentou impulsionar post).',
  '',
  'O QUE DESTACAR',
  '- Em sala se roda anúncio com verba real, não simulação.',
  '- WhatsApp Business e Google Meu Negócio, que é o que traz cliente de bairro.',
  '- Sai com portfólio, o que resolve o problema de "não tenho experiência".',
].join('\n')

const INSTRUCOES_DESIGN = [
  'Você é o especialista em Design Gráfico da Brotherhood Cursos.',
  '',
  'QUEM CHEGA ATÉ VOCÊ',
  'Gente criativa que quer viver disso, e donos de negócio cansados de pagar por arte.',
  '',
  'O QUE PERGUNTAR',
  '- Se já mexe em alguma ferramenta (mesmo Canva conta).',
  '- Se quer trabalhar como freelancer ou cuidar do visual do próprio negócio.',
  '',
  'O QUE DESTACAR',
  '- Photoshop e Illustrator de verdade, além do Canva Pro.',
  '- Aula sobre precificação: como cobrar por um trabalho sem se vender barato.',
  '- Portfólio montado ao longo do curso.',
].join('\n')

export const AGENTES_PADRAO = [
  {
    id: 'agente-recepcao',
    nome: 'Recepção',
    papel: 'Primeiro atendimento e triagem',
    cursoId: null,
    triagem: true,
    ativo: true,
    modelo: 'claude-sonnet-5',
    esforco: 'low',
    raciocinio: false,
    maxTokens: 1024,
    saudacao:
      'Oi! Aqui é a Brotherhood Cursos. Que bom te ver por aqui. Me conta: o que você está querendo aprender?',
    instrucoes: INSTRUCOES_RECEPCAO,
    palavrasChave: [],
    perguntasFrequentes: [],
    regrasEscalonamento:
      'Transfira para um atendente humano em qualquer assunto de pagamento já feito, contrato, reclamação, ou quando a pessoa pedir explicitamente falar com alguém.',
    criadoEm: new Date().toISOString(),
  },

  agenteDeCurso(CURSOS_PADRAO[0], INSTRUCOES_INFORMATICA, [
    'informática',
    'informatica',
    'computador',
    'básico',
    'basico',
    'digitação',
    'digitacao',
    'word',
    'internet',
    'do zero',
  ]),

  agenteDeCurso(CURSOS_PADRAO[1], INSTRUCOES_EXCEL, [
    'excel',
    'planilha',
    'tabela dinâmica',
    'tabela dinamica',
    'procv',
    'dashboard',
    'macro',
  ]),

  agenteDeCurso(CURSOS_PADRAO[2], INSTRUCOES_ADMINISTRACAO, [
    'administrativo',
    'administração',
    'administracao',
    'escritório',
    'escritorio',
    'departamento pessoal',
    'rh',
    'recepção',
    'recepcao',
    'auxiliar',
  ]),

  agenteDeCurso(CURSOS_PADRAO[3], INSTRUCOES_MARKETING, [
    'marketing',
    'instagram',
    'social media',
    'tráfego',
    'trafego',
    'anúncio',
    'anuncio',
    'redes sociais',
    'vender pela internet',
  ]),

  agenteDeCurso(CURSOS_PADRAO[4], INSTRUCOES_DESIGN, [
    'design',
    'photoshop',
    'illustrator',
    'canva',
    'arte',
    'logotipo',
    'logo',
    'artes gráficas',
    'artes graficas',
    'criação',
    'criacao',
  ]),
]

export const AJUSTES_PADRAO = {
  nomeDaCasa: 'Brotherhood Cursos',
  assinatura: 'Brotherhood Cursos — conteúdo que move cidades.',
  tema: 'claro',
  /** Respostas automáticas ligadas? Desligar deixa tudo para os humanos. */
  iaLigada: true,
  /**
   * Espera antes de responder. Gente digita em rajada: sem esta pausa, o
   * agente responderia três vezes à mesma pergunta partida em pedaços.
   */
  segundosDeEspera: 6,
  /** Quantas mensagens do histórico vão para o modelo a cada resposta. */
  memoriaDeMensagens: 24,
  horario: {
    ligado: false,
    inicio: '08:00',
    fim: '18:00',
    /** 0 = domingo. Padrão: segunda a sábado. */
    dias: [1, 2, 3, 4, 5, 6],
    mensagemForaDoHorario:
      'Oi! Nosso atendimento é de segunda a sexta, das 8h às 18h. Pode deixar sua mensagem que respondemos assim que abrirmos.',
  },
  whatsapp: {
    phoneNumberId: '',
    token: '',
    verifyToken: '',
    appSecret: '',
    versaoApi: 'v21.0',
    numeroExibicao: '',
  },
  anthropicApiKey: '',
}
