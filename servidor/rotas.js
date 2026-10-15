/**
 * As rotas HTTP que a tela usa.
 *
 * Tudo aqui é fino de propósito: valida a entrada, chama estado.js ou
 * atendimento.js e devolve JSON. Regra de negócio não mora neste arquivo.
 */
import express from 'express'
import * as estado from './estado.js'
import * as atendimento from './atendimento.js'
import * as whatsapp from './whatsapp.js'
import * as acesso from './acesso.js'
import * as conexoes from './conexoes.js'
import { historicoParaApi, rodarAgente, temChave } from './claude.js'
import { inscrever } from './eventos.js'
import { ESFORCOS, MODELO_PADRAO } from './config.js'

/** Tudo aqui já passou por acesso.exigirSessao (ver index.js): req.usuario existe. */
export const rotas = express.Router()

/* ------------------------------------------------------------------ */
/* Abertura                                                            */
/* ------------------------------------------------------------------ */

rotas.get('/estado', (req, res) => {
  res.json({
    ajustes: estado.semSegredos(),
    cursos: estado.cursos(),
    agentes: estado.agentes(),
    conversas: estado.conversas(),
    conexoes: conexoes.listar({ comQr: req.usuario.papel === 'admin' }),
    indicadores: estado.indicadores(),
    canal: {
      whatsappConfigurado: whatsapp.configurado(),
      modelo: MODELO_PADRAO,
    },
  })
})

/* ------------------------------------------------------------------ */
/* Tempo real                                                          */
/* ------------------------------------------------------------------ */

rotas.get('/eventos', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  const cancelar = inscrever(res, { admin: req.usuario.papel === 'admin' })
  req.on('close', cancelar)
})

/* ------------------------------------------------------------------ */
/* Conversas                                                           */
/* ------------------------------------------------------------------ */

rotas.get('/conversas', (req, res) => {
  res.json(estado.conversas())
})

rotas.get('/conversas/:id/mensagens', (req, res) => {
  const conv = estado.conversa(req.params.id)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  res.json(estado.mensagens(req.params.id))
})

/** Os bytes de uma imagem, áudio, documento ou figurinha recebida. 404 se nunca baixou (ou falhou). */
rotas.get('/conversas/:id/mensagens/:mensagemId/midia', async (req, res) => {
  const conv = estado.conversa(req.params.id)
  if (!conv?.conexaoId) return res.status(404).end()
  const mensagem = estado.mensagens(conv.id).find((m) => m.id === req.params.mensagemId)
  if (!mensagem?.waId || !mensagem.anexo?.mimetype) return res.status(404).end()
  try {
    const bytes = await conexoes.obterMidia(conv.conexaoId, mensagem.waId)
    if (!bytes) return res.status(404).end()
    res.set('Cache-Control', 'private, max-age=604800')
    res.type(mensagem.anexo.mimetype)
    if (mensagem.anexo.nomeArquivo) {
      res.set('Content-Disposition', `inline; filename="${mensagem.anexo.nomeArquivo.replace(/"/g, '')}"`)
    }
    res.send(bytes)
  } catch (erro) {
    console.warn('[rotas] não consegui servir uma mídia:', erro.message)
    res.status(404).end()
  }
})

/**
 * Pede ao celular mensagens mais antigas DESTA conversa — por isso sob
 * demanda, uma de cada vez: ao contrário da sincronização inicial, quem
 * decide disparar é a pessoa olhando a conversa, não o sistema sozinho.
 */
rotas.post('/conversas/:id/buscar-antigas', async (req, res) => {
  const conv = estado.conversa(req.params.id)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  if (!conv.conexaoId) {
    return res.status(400).json({ erro: 'Esta conversa não é de um número conectado por QR Code.' })
  }
  const antiga = estado
    .mensagens(conv.id)
    .filter((m) => m.waId && m.de !== 'sistema')
    .sort((a, b) => a.em.localeCompare(b.em))[0]
  if (!antiga) return res.status(400).json({ erro: 'Ainda não há nenhuma mensagem aqui para buscar antes dela.' })
  try {
    await conexoes.buscarMensagensAntigas(conv.conexaoId, {
      jid: conv.jid,
      telefone: conv.telefone,
      waId: antiga.waId,
      fromMe: antiga.de !== 'cliente',
      timestampMs: new Date(antiga.em).getTime(),
    })
    res.json({ ok: true })
  } catch (erro) {
    res.status(400).json({ erro: erro.message })
  }
})

rotas.post('/conversas/:id/lida', (req, res) => {
  const conv = estado.marcarLida(req.params.id)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  res.json(conv)
})

rotas.post('/conversas/:id/mensagens', async (req, res) => {
  const texto = String(req.body?.texto || '').trim()
  if (!texto) return res.status(400).json({ erro: 'Mensagem vazia.' })
  const conv = estado.conversa(req.params.id)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  const mensagem = await atendimento.enviarComoAtendente(req.params.id, texto)
  res.json(mensagem)
})

rotas.patch('/conversas/:id', (req, res) => {
  const permitido = {}
  const corpo = req.body || {}
  for (const campo of ['nomeContato', 'cursoId', 'agenteId', 'etiquetas', 'resumo', 'lead']) {
    if (corpo[campo] !== undefined) permitido[campo] = corpo[campo]
  }
  const conv = estado.atualizarConversa(req.params.id, permitido)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  res.json(conv)
})

rotas.post('/conversas/:id/assumir', (req, res) => {
  const conv = estado.conversa(req.params.id)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  res.json(atendimento.assumir(req.params.id))
})

rotas.post('/conversas/:id/devolver', (req, res) => {
  const conv = estado.conversa(req.params.id)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  res.json(atendimento.devolverParaIA(req.params.id))
})

rotas.post('/conversas/:id/resolver', (req, res) => {
  res.json(atendimento.resolver(req.params.id))
})

rotas.post('/conversas/:id/reabrir', (req, res) => {
  res.json(atendimento.reabrir(req.params.id))
})

rotas.post('/conversas/:id/responder', async (req, res) => {
  const conv = estado.conversa(req.params.id)
  if (!conv) return res.status(404).json({ erro: 'Conversa não encontrada.' })
  try {
    res.json(await atendimento.responderAgora(req.params.id))
  } catch (erro) {
    res.status(500).json({ erro: erro.message })
  }
})

rotas.delete('/conversas/:id', (req, res) => {
  estado.apagarConversa(req.params.id)
  res.json({ ok: true })
})

/* ------------------------------------------------------------------ */
/* Conexões (números de WhatsApp por QR Code)                          */
/* ------------------------------------------------------------------ */

// todo mundo vê o estado; o QR (uma credencial) só vai para quem administra
rotas.get('/conexoes', (req, res) => {
  res.json(conexoes.listar({ comQr: req.usuario.papel === 'admin' }))
})

/** A foto de perfil de um contato. Sem foto (ou sem como buscar agora), 404 — a tela cai para as iniciais. */
rotas.get('/conexoes/:id/foto/:telefone', async (req, res) => {
  try {
    const bytes = await conexoes.obterFotoContato(req.params.id, req.params.telefone)
    if (!bytes) return res.status(404).end()
    res.set('Cache-Control', 'private, max-age=3600')
    res.type('image/jpeg').send(bytes)
  } catch (erro) {
    console.warn('[rotas] não consegui buscar a foto do contato:', erro.message)
    res.status(404).end()
  }
})

rotas.post('/conexoes', acesso.exigirAdmin, async (req, res, proximo) => {
  try {
    // sincronizar (padrão: sim) pede ao celular o histórico na hora da leitura do QR
    const resultado = await conexoes.criar(req.body?.nome, { sincronizar: req.body?.sincronizar !== false })
    if (resultado.erro) return res.status(400).json({ erro: resultado.erro })
    res.json(resultado.conexao)
  } catch (erro) {
    proximo(erro)
  }
})

rotas.put('/conexoes/:id', acesso.exigirAdmin, (req, res) => {
  const resultado = conexoes.renomear(req.params.id, req.body?.nome)
  if (resultado.erro) {
    return res.status(resultado.erro.includes('encontrada') ? 404 : 400).json({ erro: resultado.erro })
  }
  res.json(resultado.conexao)
})

/** Reconectar um número (ou, com { novoQr: true }, gerar outro QR Code para ele). */
rotas.post('/conexoes/:id/iniciar', acesso.exigirAdmin, async (req, res, proximo) => {
  try {
    if (req.body?.novoQr) {
      const resultado = await conexoes.novoQr(req.params.id)
      if (resultado.erro) return res.status(404).json({ erro: resultado.erro })
      return res.json(resultado.conexao)
    }
    const conexao = await conexoes.iniciar(req.params.id)
    if (!conexao) return res.status(404).json({ erro: 'Conexão não encontrada.' })
    res.json(conexao)
  } catch (erro) {
    proximo(erro)
  }
})

rotas.delete('/conexoes/:id', acesso.exigirAdmin, async (req, res, proximo) => {
  try {
    const removida = await conexoes.remover(req.params.id)
    if (!removida) return res.status(404).json({ erro: 'Conexão não encontrada.' })
    res.json({ ok: true })
  } catch (erro) {
    proximo(erro)
  }
})

/* ------------------------------------------------------------------ */
/* Agentes                                                             */
/* ------------------------------------------------------------------ */

rotas.get('/agentes', (req, res) => res.json(estado.agentes()))

rotas.post('/agentes', (req, res) => {
  const dados = limparAgente(req.body || {})
  res.json(estado.salvarAgente(dados))
})

rotas.put('/agentes/:id', (req, res) => {
  const dados = limparAgente({ ...(req.body || {}), id: req.params.id })
  const salvo = estado.salvarAgente(dados)
  if (!salvo) return res.status(404).json({ erro: 'Agente não encontrado.' })
  res.json(salvo)
})

rotas.delete('/agentes/:id', (req, res) => {
  res.json(estado.apagarAgente(req.params.id))
})

function limparAgente(corpo) {
  const dados = { ...corpo }
  if (dados.esforco && !ESFORCOS.includes(dados.esforco)) dados.esforco = 'low'
  if (dados.maxTokens !== undefined) {
    dados.maxTokens = Math.min(4096, Math.max(128, Number(dados.maxTokens) || 1024))
  }
  if (typeof dados.palavrasChave === 'string') {
    dados.palavrasChave = dados.palavrasChave
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  }
  // o modelo é do projeto, não do formulário
  dados.modelo = MODELO_PADRAO
  return dados
}

/**
 * Banco de provas do agente: conversa de teste que não toca o WhatsApp
 * nem grava histórico. Serve para afinar o texto das instruções.
 */
rotas.post('/agentes/:id/testar', async (req, res) => {
  const agente = estado.agente(req.params.id)
  if (!agente) return res.status(404).json({ erro: 'Agente não encontrado.' })
  if (!temChave()) return res.status(400).json({ erro: 'Falta a chave da API da Anthropic.' })

  const historico = Array.isArray(req.body?.historico) ? req.body.historico : []
  const mensagensApi = historicoParaApi(
    historico.map((m) => ({ de: m.de, texto: m.texto, em: new Date().toISOString() })),
    24,
  )
  if (!mensagensApi.length) return res.status(400).json({ erro: 'Escreva alguma coisa primeiro.' })

  try {
    const resultado = await rodarAgente({
      agente,
      mensagensApi,
      contexto: { nomeContato: 'Visitante', lead: {}, etiquetas: [] },
    })
    res.json(resultado)
  } catch (erro) {
    res.status(500).json({ erro: erro.message })
  }
})

/* ------------------------------------------------------------------ */
/* Cursos                                                              */
/* ------------------------------------------------------------------ */

rotas.get('/cursos', (req, res) => res.json(estado.cursos()))

rotas.post('/cursos', (req, res) => res.json(estado.salvarCurso(limparCurso(req.body || {}))))

rotas.put('/cursos/:id', (req, res) => {
  res.json(estado.salvarCurso(limparCurso({ ...(req.body || {}), id: req.params.id })))
})

rotas.delete('/cursos/:id', (req, res) => res.json(estado.apagarCurso(req.params.id)))

function limparCurso(corpo) {
  const dados = { ...corpo }
  if (typeof dados.diferenciais === 'string') {
    dados.diferenciais = dados.diferenciais
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean)
  }
  return dados
}

/* ------------------------------------------------------------------ */
/* Ajustes e canal                                                     */
/* ------------------------------------------------------------------ */

rotas.get('/ajustes', (req, res) => res.json(estado.semSegredos()))

rotas.put('/ajustes', (req, res) => {
  const corpo = { ...(req.body || {}) }

  // campo de segredo vazio significa "não mexe", não "apaga"
  if (corpo.anthropicApiKey === '' || corpo.anthropicApiKey == null) delete corpo.anthropicApiKey
  if (corpo.whatsapp) {
    if (!corpo.whatsapp.token) delete corpo.whatsapp.token
    if (!corpo.whatsapp.appSecret) delete corpo.whatsapp.appSecret
  }

  estado.salvarAjustes(corpo)
  res.json(estado.semSegredos())
})

rotas.post('/canal/testar', async (req, res) => {
  res.json(await whatsapp.testarConexao())
})

rotas.get('/painel', (req, res) => res.json(estado.indicadores()))

/* ------------------------------------------------------------------ */
/* Equipe (só quem administra)                                         */
/* ------------------------------------------------------------------ */

rotas.get('/equipe', acesso.exigirAdmin, (req, res) => {
  res.json(acesso.usuarios().map(acesso.publico))
})

/** A foto de perfil de alguém da equipe. Qualquer pessoa logada pode ver a de um colega. */
rotas.get('/usuarios/:id/foto', (req, res) => {
  const bytes = acesso.obterFoto(req.params.id)
  if (!bytes) return res.status(404).end()
  res.set('Cache-Control', 'private, max-age=3600')
  res.type('image/jpeg')
  res.send(bytes)
})

rotas.post('/equipe', acesso.exigirAdmin, (req, res) => {
  const corpo = req.body || {}
  const erro = acesso.validarNovo(corpo)
  if (erro) return res.status(400).json({ erro })
  res.json(acesso.criarUsuario(corpo))
})

/** Quem administra manda a pessoa parear o celular de novo (trocou de aparelho, perdeu tudo). */
rotas.post('/equipe/:id/redefinir-2fa', acesso.exigirAdmin, (req, res) => {
  const resultado = acesso.redefinirDuasEtapas(req.params.id)
  if (resultado.erro) return res.status(404).json({ erro: resultado.erro })
  res.json(resultado.usuario)
})

rotas.put('/equipe/:id', acesso.exigirAdmin, (req, res) => {
  const corpo = req.body || {}
  const permitido = {}
  for (const campo of ['nome', 'papel', 'senha']) {
    if (corpo[campo] !== undefined) permitido[campo] = corpo[campo]
  }
  const resultado = acesso.atualizarUsuario(req.params.id, permitido)
  if (resultado.erro) return res.status(400).json({ erro: resultado.erro })
  res.json(resultado.usuario)
})

rotas.delete('/equipe/:id', acesso.exigirAdmin, (req, res) => {
  if (req.params.id === req.usuario.id) {
    return res.status(400).json({ erro: 'Você não pode remover a si mesmo. Peça a outra pessoa que administra.' })
  }
  const resultado = acesso.apagarUsuario(req.params.id)
  if (resultado.erro) return res.status(400).json({ erro: resultado.erro })
  res.json(acesso.usuarios().map(acesso.publico))
})
