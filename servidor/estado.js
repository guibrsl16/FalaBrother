/**
 * Regras de domínio da central de atendimento da Brotherhood Cursos: cursos, agentes, conversas e mensagens.
 *
 * Este arquivo é a única porta de entrada para os dados. As rotas HTTP e o
 * motor de IA falam com ele, nunca direto com o armazenamento — assim as
 * regras (quem pode responder, o que conta como não lida, quando a conversa
 * volta para a fila) ficam num lugar só.
 */
import * as banco from './armazenamento.js'
import { env, PRECO_SONNET_5_USD_POR_MILHAO as PRECO } from './config.js'
import { id, agora } from './ids.js'
import { publicar } from './eventos.js'
import { AGENTES_PADRAO, AJUSTES_PADRAO, CURSOS_PADRAO } from './sementes.js'

/* ------------------------------------------------------------------ */
/* Primeira abertura                                                   */
/* ------------------------------------------------------------------ */

if (banco.obter('cursos') == null) banco.definir('cursos', CURSOS_PADRAO)
if (banco.obter('agentes') == null) banco.definir('agentes', AGENTES_PADRAO)
if (banco.obter('conversas') == null) banco.definir('conversas', [])
if (banco.obter('ajustes') == null) {
  banco.definir('ajustes', {
    ...AJUSTES_PADRAO,
    whatsapp: { ...AJUSTES_PADRAO.whatsapp, verifyToken: env.whatsapp.verifyToken },
  })
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

export function ajustes() {
  return banco.obter('ajustes')
}

export function salvarAjustes(mudancas) {
  const atual = ajustes()
  const novo = {
    ...atual,
    ...mudancas,
    horario: { ...atual.horario, ...(mudancas.horario || {}) },
    whatsapp: { ...atual.whatsapp, ...(mudancas.whatsapp || {}) },
  }
  banco.definir('ajustes', novo)
  publicar('ajustes', semSegredos(novo))
  return novo
}

/**
 * O que a tela pode ver. Chave de API e token nunca saem daqui inteiros —
 * a tela mostra só se está preenchido e os últimos caracteres, o bastante
 * para a pessoa reconhecer qual chave está lá.
 */
export function semSegredos(a = ajustes()) {
  const mascara = (valor) => {
    if (!valor) return { preenchido: false, fim: '' }
    return { preenchido: true, fim: String(valor).slice(-4) }
  }
  return {
    ...a,
    anthropicApiKey: mascara(a.anthropicApiKey || env.anthropicApiKey),
    whatsapp: {
      ...a.whatsapp,
      token: mascara(a.whatsapp.token || env.whatsapp.token),
      appSecret: mascara(a.whatsapp.appSecret || env.whatsapp.appSecret),
      phoneNumberId: a.whatsapp.phoneNumberId || env.whatsapp.phoneNumberId,
      verifyToken: a.whatsapp.verifyToken || env.whatsapp.verifyToken,
      versaoApi: a.whatsapp.versaoApi || env.whatsapp.versaoApi,
    },
  }
}

/** Credenciais para uso interno: o que está salvo na tela vence o .env. */
export function credenciais() {
  const a = ajustes()
  return {
    anthropicApiKey: a.anthropicApiKey || env.anthropicApiKey,
    whatsapp: {
      phoneNumberId: a.whatsapp.phoneNumberId || env.whatsapp.phoneNumberId,
      token: a.whatsapp.token || env.whatsapp.token,
      verifyToken: a.whatsapp.verifyToken || env.whatsapp.verifyToken,
      appSecret: a.whatsapp.appSecret || env.whatsapp.appSecret,
      versaoApi: a.whatsapp.versaoApi || env.whatsapp.versaoApi,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Cursos                                                              */
/* ------------------------------------------------------------------ */

export function cursos() {
  return banco.obter('cursos')
}

export function curso(cursoId) {
  return cursos().find((c) => c.id === cursoId) || null
}

export function salvarCurso(dados) {
  const lista = cursos()
  if (dados.id) {
    const i = lista.findIndex((c) => c.id === dados.id)
    if (i >= 0) {
      lista[i] = { ...lista[i], ...dados }
      banco.definir('cursos', lista)
      publicar('cursos', lista)
      return lista[i]
    }
  }
  const novo = {
    id: dados.id || id('curso-'),
    nome: 'Novo curso',
    resumo: '',
    publico: '',
    duracao: '',
    formato: '',
    investimento: '',
    certificado: '',
    diferenciais: [],
    cor: '#D8AB55',
    ...dados,
  }
  lista.push(novo)
  banco.definir('cursos', lista)
  publicar('cursos', lista)
  return novo
}

export function apagarCurso(cursoId) {
  const lista = cursos().filter((c) => c.id !== cursoId)
  banco.definir('cursos', lista)
  // agentes órfãos viram agentes sem curso, não somem: o texto deles tem valor
  const ag = agentes()
  let mexeu = false
  for (const a of ag) {
    if (a.cursoId === cursoId) {
      a.cursoId = null
      a.ativo = false
      mexeu = true
    }
  }
  if (mexeu) banco.definir('agentes', ag)
  publicar('cursos', lista)
  if (mexeu) publicar('agentes', ag)
  return lista
}

/* ------------------------------------------------------------------ */
/* Agentes                                                             */
/* ------------------------------------------------------------------ */

export function agentes() {
  return banco.obter('agentes')
}

export function agente(agenteId) {
  return agentes().find((a) => a.id === agenteId) || null
}

export function agenteDeTriagem() {
  const lista = agentes()
  return lista.find((a) => a.triagem && a.ativo) || lista.find((a) => a.ativo) || null
}

export function agenteDoCurso(cursoId) {
  if (!cursoId) return null
  return agentes().find((a) => a.cursoId === cursoId && a.ativo) || null
}

export function salvarAgente(dados) {
  const lista = agentes()
  if (dados.id) {
    const i = lista.findIndex((a) => a.id === dados.id)
    if (i >= 0) {
      lista[i] = { ...lista[i], ...dados }
      // só um agente pode ser o de triagem
      if (dados.triagem) {
        for (const outro of lista) if (outro.id !== dados.id) outro.triagem = false
      }
      banco.definir('agentes', lista)
      publicar('agentes', lista)
      return lista[i]
    }
  }
  const novo = {
    id: dados.id || id('agente-'),
    nome: 'Novo agente',
    papel: '',
    cursoId: null,
    triagem: false,
    ativo: true,
    modelo: 'claude-sonnet-5',
    esforco: 'low',
    raciocinio: false,
    maxTokens: 1024,
    saudacao: '',
    instrucoes: '',
    palavrasChave: [],
    perguntasFrequentes: [],
    regrasEscalonamento: '',
    criadoEm: agora(),
    ...dados,
  }
  if (novo.triagem) for (const outro of lista) outro.triagem = false
  lista.push(novo)
  banco.definir('agentes', lista)
  publicar('agentes', lista)
  return novo
}

export function apagarAgente(agenteId) {
  const lista = agentes().filter((a) => a.id !== agenteId)
  banco.definir('agentes', lista)
  // conversas que estavam com ele voltam para a triagem na próxima mensagem
  const conv = conversas()
  let mexeu = false
  for (const c of conv) {
    if (c.agenteId === agenteId) {
      c.agenteId = null
      mexeu = true
    }
  }
  if (mexeu) banco.definir('conversas', conv)
  publicar('agentes', lista)
  return lista
}

/* ------------------------------------------------------------------ */
/* Conversas                                                           */
/* ------------------------------------------------------------------ */

export function conversas() {
  return banco.obter('conversas')
}

export function conversa(conversaId) {
  return conversas().find((c) => c.id === conversaId) || null
}

/**
 * A conversa de uma pessoa com UM número da escola. A mesma pessoa
 * escrevendo para dois números são duas conversas: cada uma tem o seu
 * histórico, o seu agente e responde pelo número em que começou.
 *
 * Acha pelo endereço exato do WhatsApp (`jid`) ou, na falta dele, pelo
 * telefone — o WhatsApp às vezes endereça a mesma pessoa de dois jeitos.
 * `conexaoId` nulo é a API oficial (um número só, sem conexão por QR).
 */
export function conversaDe(conexaoId, { telefone, jid }) {
  const alvo = conexaoId || null
  return (
    conversas().find(
      (c) =>
        (c.conexaoId || null) === alvo &&
        ((jid && c.jid === jid) || (telefone && c.telefone === telefone)),
    ) || null
  )
}

/** Cria a conversa se ainda não existir. Chamado quando chega mensagem nova. */
export function garantirConversa(
  telefone,
  nomeContato,
  { conexaoId = null, jid = null, nomePerfil = '' } = {},
) {
  const existente = conversaDe(conexaoId, { telefone, jid })
  if (existente) {
    let mudou = false
    if (nomeContato && !existente.nomeContato) {
      existente.nomeContato = nomeContato
      mudou = true
    }
    if (nomePerfil && existente.nomePerfil !== nomePerfil) {
      existente.nomePerfil = nomePerfil
      mudou = true
    }
    // o número, quando descoberto depois, entra; e o endereço mais novo vale
    if (telefone && !existente.telefone) {
      existente.telefone = telefone
      mudou = true
    }
    if (jid && existente.jid !== jid) {
      existente.jid = jid
      mudou = true
    }
    if (mudou) tocar(existente)
    return existente
  }
  const nova = {
    id: id('conv-'),
    telefone: telefone || '',
    /** por qual número da escola a conversa acontece (null = API oficial) */
    conexaoId: conexaoId || null,
    /** endereço exato do WhatsApp para responder (conexão por QR) */
    jid: jid || null,
    /**
     * O nome do contato COMO ESTÁ SALVO NO CELULAR — ou vazio. É o que a
     * equipe vê como título; sem ele, a tela mostra o número.
     */
    nomeContato: nomeContato || '',
    /** O nome que a própria pessoa escolheu no perfil do WhatsApp (só informação). */
    nomePerfil: nomePerfil || '',
    canal: 'whatsapp',
    /** aguardando · ia · humano · resolvida */
    estado: 'aguardando',
    agenteId: null,
    cursoId: null,
    etiquetas: [],
    naoLidas: 0,
    totalMensagens: 0,
    resumo: '',
    lead: { nome: nomeContato || '', curso: '', etapa: 'novo', anotacao: '' },
    criadaEm: agora(),
    atualizadaEm: agora(),
    ultimaMensagem: null,
  }
  const lista = conversas()
  lista.push(nova)
  banco.definir('conversas', lista)
  publicar('conversa', nova)
  return nova
}

/* ------------------------------------------------------------------ */
/* Sincronização com o celular                                         */
/* ------------------------------------------------------------------ */

function usuarioDoJid(jid) {
  return jid ? String(jid).split('@')[0].split(':')[0] : ''
}

/**
 * Traz para o sistema uma conversa que já existia no celular.
 *
 * Duas decisões importam aqui:
 *  - entra como "resolvida": o agente NUNCA responde a mensagem antiga. Se a
 *    pessoa escrever de novo, a conversa reabre sozinha (ver registrarMensagem)
 *    e o agente responde com o histórico como contexto;
 *  - entra em silêncio: nada de aviso por mensagem, nada de "não lida". Um
 *    celular com milhares de conversas não pode virar milhares de alertas.
 *
 * Se a conversa já existe (a pessoa escreveu enquanto a sincronização
 * rodava), as mensagens se juntam em ordem de horário, sem duplicar, e o
 * estado dela não muda.
 *
 * @returns {{ nova: boolean, mensagens: number }}
 */
export function sincronizarConversa({ conexaoId, telefone, jid, nomeContato, nomePerfil, mensagens: recebidas }) {
  let conv = conversaDe(conexaoId, { telefone, jid })
  const jaTem = new Set(conv ? mensagens(conv.id).map((m) => m.waId).filter(Boolean) : [])

  const novas = []
  for (const m of recebidas) {
    if (m.waId) {
      if (jaTem.has(m.waId)) continue // o mesmo id, de uma sincronização anterior ou do mesmo lote
      jaTem.add(m.waId)
    }
    novas.push(m)
  }
  if (!conv && !novas.length) return { nova: false, mensagens: 0 }

  const criada = !conv
  if (criada) {
    const primeira = novas.reduce((a, m) => (m.em < a ? m.em : a), novas[0].em)
    conv = {
      id: id('conv-'),
      telefone: telefone || '',
      conexaoId: conexaoId || null,
      jid: jid || null,
      nomeContato: nomeContato || '',
      nomePerfil: nomePerfil || '',
      canal: 'whatsapp',
      estado: 'resolvida',
      /** veio do histórico do celular, não de uma mensagem de agora */
      importada: true,
      agenteId: null,
      cursoId: null,
      etiquetas: [],
      naoLidas: 0,
      totalMensagens: 0,
      resumo: '',
      lead: { nome: nomeContato || '', curso: '', etapa: 'novo', anotacao: '' },
      criadaEm: primeira,
      atualizadaEm: primeira,
      ultimaMensagem: null,
    }
    conversas().push(conv)
  } else {
    // o que faltava na conversa que já existia
    if (nomeContato && !conv.nomeContato) conv.nomeContato = nomeContato
    if (nomePerfil && conv.nomePerfil !== nomePerfil) conv.nomePerfil = nomePerfil
    if (telefone && !conv.telefone) conv.telefone = telefone
    if (jid && conv.jid !== jid) conv.jid = jid
  }

  const prontas = novas.map((m) => ({
    id: id('msg-'),
    conversaId: conv.id,
    de: m.de,
    texto: m.texto,
    em: m.em,
    waId: m.waId || null,
    status: m.de === 'cliente' ? 'recebida' : 'enviada',
    agenteId: null,
    tipo: m.tipo || 'texto',
    anexo: m.anexo || null,
    uso: null,
    erro: null,
  }))
  const lista = banco.guardarVarias(conv.id, prontas)
  conv.totalMensagens = (conv.totalMensagens || 0) + prontas.length
  const ultima = lista[lista.length - 1]
  if (ultima) {
    conv.ultimaMensagem = { de: ultima.de, texto: ultima.texto.slice(0, 160), em: ultima.em }
    // a conversa sobe na lista pelo horário da última mensagem; nunca desce por causa do histórico
    if (criada || ultima.em > conv.atualizadaEm) conv.atualizadaEm = ultima.em
  }
  banco.definir('conversas', conversas())
  return { nova: criada, mensagens: prontas.length }
}

/** Avisa a tela que entraram conversas novas: ela busca a lista de uma vez, em vez de uma a uma. */
export function avisarSincronizacao(conexaoId) {
  publicar('conversas-sincronizadas', { conexaoId })
}

/**
 * Nomes que o WhatsApp informou depois: contatos salvos e nomes de perfil.
 * Só preenche o que está vazio — nunca sobrescreve um nome que a equipe
 * digitou. `mudancas`: [{ chaves: [telefone ou id interno], nomeContato, nomePerfil }].
 */
export function atualizarNomes(conexaoId, mudancas) {
  const alvo = conexaoId || null
  const indice = new Map()
  for (const c of conversas()) {
    if ((c.conexaoId || null) !== alvo) continue
    if (c.telefone) indice.set(c.telefone, c)
    const interno = usuarioDoJid(c.jid)
    if (interno) indice.set(interno, c)
  }

  const mexidas = new Set()
  for (const m of mudancas) {
    for (const chave of m.chaves) {
      const c = indice.get(chave)
      if (!c) continue
      if (m.nomeContato && !c.nomeContato) {
        c.nomeContato = m.nomeContato
        mexidas.add(c)
      }
      if (m.nomePerfil && c.nomePerfil !== m.nomePerfil) {
        c.nomePerfil = m.nomePerfil
        mexidas.add(c)
      }
    }
  }
  if (!mexidas.size) return 0

  banco.definir('conversas', conversas())
  // um nome novo não muda o horário da conversa: não passa por tocar()
  if (mexidas.size > 50) publicar('conversas-sincronizadas', { conexaoId })
  else for (const c of mexidas) publicar('conversa', c)
  return mexidas.size
}

function tocar(conv) {
  conv.atualizadaEm = agora()
  banco.definir('conversas', conversas())
  publicar('conversa', conv)
}

export function atualizarConversa(conversaId, mudancas) {
  const conv = conversa(conversaId)
  if (!conv) return null
  Object.assign(conv, mudancas)
  if (mudancas.lead) conv.lead = { ...conv.lead, ...mudancas.lead }
  tocar(conv)
  return conv
}

export function apagarConversa(conversaId) {
  const lista = conversas().filter((c) => c.id !== conversaId)
  banco.definir('conversas', lista)
  banco.apagarMensagens(conversaId)
  publicar('conversa-removida', { id: conversaId })
  return lista
}

/* ------------------------------------------------------------------ */
/* Mensagens                                                           */
/* ------------------------------------------------------------------ */

export function mensagens(conversaId) {
  return banco.mensagensDe(conversaId)
}

/**
 * Registra uma mensagem e atualiza o resumo da conversa.
 *
 * `de` é quem falou:
 *   cliente   — a pessoa do outro lado do WhatsApp
 *   agente    — um agente de IA
 *   atendente — uma pessoa da equipe, pela tela
 *   sistema   — aviso interno (transferência, erro, fora do horário)
 */
export function registrarMensagem(conversaId, dados) {
  const conv = conversa(conversaId)
  if (!conv) return null

  const mensagem = {
    id: id('msg-'),
    conversaId,
    de: dados.de,
    texto: dados.texto || '',
    em: dados.em || agora(),
    waId: dados.waId || null,
    status:
      dados.status ||
      (dados.de === 'cliente' ? 'recebida' : dados.de === 'sistema' ? 'interna' : 'enviando'),
    agenteId: dados.agenteId || null,
    tipo: dados.tipo || 'texto',
    anexo: dados.anexo || null,
    uso: dados.uso || null,
    erro: dados.erro || null,
  }

  banco.guardarMensagem(conversaId, mensagem)

  conv.ultimaMensagem = {
    de: mensagem.de,
    texto: mensagem.texto.slice(0, 160),
    em: mensagem.em,
  }
  conv.atualizadaEm = mensagem.em
  if (mensagem.de !== 'sistema') conv.totalMensagens = (conv.totalMensagens || 0) + 1
  if (mensagem.de === 'cliente') {
    conv.naoLidas = (conv.naoLidas || 0) + 1
    if (conv.estado === 'resolvida') conv.estado = 'aguardando'
  }
  banco.definir('conversas', conversas())

  publicar('mensagem', mensagem)
  publicar('conversa', conv)
  return mensagem
}

export function atualizarMensagem(conversaId, mensagemId, mudancas) {
  const m = banco.atualizarMensagem(conversaId, mensagemId, mudancas)
  if (m) publicar('mensagem-atualizada', m)
  return m
}

/** Marca a conversa como lida (a pessoa abriu na tela). */
export function marcarLida(conversaId) {
  const conv = conversa(conversaId)
  if (!conv || !conv.naoLidas) return conv
  conv.naoLidas = 0
  banco.definir('conversas', conversas())
  publicar('conversa', conv)
  return conv
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

/** O que uma resposta custou de verdade, pelo preço do Sonnet 5 (ver config.js). */
function custoDeUso(uso) {
  if (!uso) return 0
  return (
    ((uso.entrada || 0) * PRECO.entrada +
      (uso.saida || 0) * PRECO.saida +
      (uso.cacheEscrito || 0) * PRECO.cacheEscrito +
      (uso.cacheLido || 0) * PRECO.cacheLido) /
    1_000_000
  )
}

export function indicadores() {
  const lista = conversas()
  const hoje = new Date().toISOString().slice(0, 10)
  const mes = hoje.slice(0, 7)

  let abertasHoje = 0
  let aguardando = 0
  let comIA = 0
  let comHumano = 0
  let resolvidas = 0

  for (const c of lista) {
    if (c.criadaEm.slice(0, 10) === hoje) abertasHoje += 1
    if (c.estado === 'aguardando') aguardando += 1
    else if (c.estado === 'ia') comIA += 1
    else if (c.estado === 'humano') comHumano += 1
    // conversa trazida do histórico do celular não é trabalho resolvido por esta equipe
    else if (c.estado === 'resolvida' && !c.importada) resolvidas += 1
  }

  // respostas da IA e transferências no dia, lendo só as conversas mexidas hoje
  let respostasIA = 0
  let transferencias = 0
  let mensagensHoje = 0
  let custoHojeUSD = 0
  for (const c of lista) {
    if (c.atualizadaEm.slice(0, 10) !== hoje) continue
    for (const m of mensagens(c.id)) {
      if (m.em.slice(0, 10) !== hoje) continue
      mensagensHoje += 1
      if (m.de === 'agente') {
        respostasIA += 1
        custoHojeUSD += custoDeUso(m.uso)
      }
      if (m.de === 'sistema' && m.tipo === 'transferencia') transferencias += 1
    }
  }

  // o gasto do mês inteiro só vale abrir o histórico de quem já mexeu neste mês
  let custoMesUSD = 0
  for (const c of lista) {
    if (c.atualizadaEm.slice(0, 7) !== mes) continue
    for (const m of mensagens(c.id)) {
      if (m.de === 'agente' && m.em.slice(0, 7) === mes) custoMesUSD += custoDeUso(m.uso)
    }
  }

  const porCurso = cursos().map((c) => ({
    cursoId: c.id,
    nome: c.nome,
    cor: c.cor,
    conversas: lista.filter((v) => v.cursoId === c.id).length,
  }))

  return {
    total: lista.length,
    abertasHoje,
    aguardando,
    comIA,
    comHumano,
    resolvidas,
    respostasIA,
    transferencias,
    mensagensHoje,
    custoHojeUSD,
    custoMesUSD,
    porCurso,
    agentesAtivos: agentes().filter((a) => a.ativo).length,
  }
}

/* ------------------------------------------------------------------ */
/* Encerramento limpo                                                  */
/* ------------------------------------------------------------------ */

export function fechar() {
  banco.gravarTudo()
  banco.descarregarAgora()
}
