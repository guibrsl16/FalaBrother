/**
 * Servidor do Brotherhood Cursos (central de atendimento).
 *
 * Faz quatro coisas:
 *  1. mantém as conexões de WhatsApp por QR Code (conexoes.js);
 *  2. recebe o webhook da API oficial da Meta, se estiver em uso;
 *  3. serve a API que a tela consome;
 *  4. em produção, entrega também os arquivos da interface (pasta dist).
 */
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { env, RAIZ } from './config.js'
import * as armazenamento from './armazenamento.js'

// Carrega tudo na memória (arquivo ou banco, conforme DATABASE_URL) antes de
// importar os módulos abaixo: eles leem dados já na primeira linha, assim
// que sobem, e não dá para fazer essa leitura sem esperar quando é um banco
// de verdade do outro lado da rede.
await armazenamento.carregar()

const estado = await import('./estado.js')
const whatsapp = await import('./whatsapp.js')
const atendimento = await import('./atendimento.js')
const acesso = await import('./acesso.js')
const conexoes = await import('./conexoes.js')
const { rotas } = await import('./rotas.js')

const app = express()
app.disable('x-powered-by')

/**
 * Guardamos o corpo bruto da requisição porque a assinatura do webhook é
 * calculada sobre os bytes exatos que a Meta enviou — reserializar o JSON
 * mudaria espaços e ordem, e a conferência falharia sempre.
 */
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buffer) => {
      req.corpoBruto = buffer
    },
  }),
)

/* ------------------------------------------------------------------ */
/* Webhook do WhatsApp                                                 */
/* ------------------------------------------------------------------ */

// A Meta chama esta rota uma vez, ao cadastrar o webhook no painel.
app.get('/webhook', (req, res) => {
  const desafio = whatsapp.verificarWebhook(req.query)
  if (desafio) {
    console.log('[webhook] verificado pela Meta')
    return res.status(200).send(desafio)
  }
  console.warn('[webhook] verificação recusada: token não confere')
  res.sendStatus(403)
})

app.post('/webhook', async (req, res) => {
  if (!whatsapp.assinaturaConfere(req.get('x-hub-signature-256'), req.corpoBruto)) {
    console.warn('[webhook] assinatura inválida — pacote descartado')
    return res.sendStatus(401)
  }

  // Responder 200 na hora é obrigatório: a Meta reenvia o pacote se a
  // resposta demorar, e aí o mesmo cliente seria atendido duas vezes.
  res.sendStatus(200)

  try {
    const { recebidas, status } = whatsapp.extrair(req.body)
    if (status.length) atendimento.atualizarStatus(status)
    if (recebidas.length) await atendimento.receberDoWhatsapp(recebidas)
  } catch (erro) {
    console.error('[webhook] falha ao processar:', erro)
  }
})

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

// Entrar e sair não exigem sessão — é o único pedaço da API aberto.
app.use('/api/sessao', acesso.rotasSessao)

// Todo o resto só responde para quem está logado.
app.use('/api', acesso.exigirSessao, rotas)

app.use('/api', (erro, _req, res, _proximo) => {
  console.error('[api] erro:', erro)
  res.status(500).json({ erro: erro.message || 'Erro no servidor.' })
})

/* ------------------------------------------------------------------ */
/* Interface (só quando existe build)                                  */
/* ------------------------------------------------------------------ */

const PASTA_WEB = path.join(RAIZ, 'dist')
if (fs.existsSync(PASTA_WEB)) {
  app.use(express.static(PASTA_WEB))
  app.get('*', (req, res, proximo) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) return proximo()
    res.sendFile(path.join(PASTA_WEB, 'index.html'))
  })
}

/* ------------------------------------------------------------------ */
/* Conexões: o que chega vai para o atendimento                        */
/* ------------------------------------------------------------------ */

conexoes.ligarOuvintes({
  aoReceber: (recebidas, conexaoId) => atendimento.receberDoWhatsapp(recebidas, { conexaoId }),
  aoResponderPeloCelular: (conexaoId, mensagem) => atendimento.receberDoCelular(conexaoId, mensagem),
  aoMudarStatus: (status) => atendimento.atualizarStatus(status),
  aoSincronizar: (conexaoId, lote) => atendimento.importarHistorico(conexaoId, lote),
  aoDescobrirNomes: (conexaoId, mudancas) => atendimento.aplicarNomes(conexaoId, mudancas),
})

/* ------------------------------------------------------------------ */
/* Subir                                                               */
/* ------------------------------------------------------------------ */

const servidor = app.listen(env.porta, () => {
  const cred = estado.credenciais()
  console.log('')
  console.log('  Brotherhood Cursos — central de atendimento')
  console.log(`  servidor:  http://localhost:${env.porta}`)
  console.log(`  webhook:   http://localhost:${env.porta}/webhook`)
  console.log(`  agentes:   ${estado.agentes().filter((a) => a.ativo).length} ativos`)
  console.log(
    `  acesso:    ${acesso.configurado() ? `${acesso.usuarios().length} pessoa(s) cadastrada(s)` : 'ninguém cadastrado — a tela vai pedir o primeiro acesso'}`,
  )
  console.log(`  IA:        ${cred.anthropicApiKey ? 'chave presente' : 'sem chave — preencha em Ajustes'}`)
  console.log(`  números:   ${conexoes.listar().length} conexão(ões) por QR Code`)
  if (whatsapp.configurado()) {
    console.log('  API Meta:  configurada (webhook ativo)')
    if (!cred.whatsapp.appSecret) {
      console.log('  atenção:   sem App Secret, a assinatura do webhook não é conferida')
    }
  }
  if (!fs.existsSync(PASTA_WEB)) {
    console.log('  interface: rode "npm run web" (ou "npm start" para os dois juntos)')
  }
  console.log('')
  conexoes.retomarTodas().catch((erro) => console.error('[conexões] falha ao religar os números:', erro))
})

async function encerrar() {
  console.log('\n  gravando e saindo…')
  conexoes.encerrarTodas()
  await estado.fechar().catch((erro) => console.error('[servidor] falha ao gravar antes de sair:', erro))
  servidor.close(() => process.exit(0))
}

// prazo máximo para a gravação final — se o banco não responder, sai assim mesmo
process.on('SIGINT', () => {
  encerrar()
  setTimeout(() => process.exit(0), 3000).unref()
})
process.on('SIGTERM', () => {
  encerrar()
  setTimeout(() => process.exit(0), 3000).unref()
})
process.on('uncaughtException', (erro) => {
  console.error('[servidor] erro não tratado:', erro)
  estado.fechar().catch(() => {})
})
// uma conexão de WhatsApp que falha em segundo plano não pode derrubar o atendimento inteiro
process.on('unhandledRejection', (motivo) => {
  console.error('[servidor] promessa rejeitada sem tratamento:', motivo)
})
