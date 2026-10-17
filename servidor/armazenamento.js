/**
 * Guarda os dados do sistema — usuários, conversas, mensagens, cursos,
 * agentes, ajustes.
 *
 * Dois jeitos de guardar, escolhidos pela variável DATABASE_URL:
 *
 *  - Vazia (padrão): arquivos JSON dentro de `dados/`. É o que faz o
 *    atendimento subir com um `npm start` em qualquer computador, sem
 *    instalar servidor de banco. Cada gravação é atômica: escreve em .tmp e
 *    renomeia — se faltar luz no meio, o arquivo antigo continua íntegro.
 *
 *  - Preenchida: um banco Postgres (ex.: Supabase). Os dados não ficam mais
 *    em arquivo nenhum na máquina que roda o sistema — útil para quem não
 *    quer depender do disco da VPS.
 *
 * Em ambos os casos, o resto do sistema não percebe diferença: fala só com
 * as funções exportadas aqui (obter, definir, mensagensDe…), nunca com
 * arquivo ou SQL diretamente. Por dentro, os dois jeitos mantêm tudo numa
 * cópia em memória (`memoria`, `cacheMensagens`) e gravam no destino de
 * forma adiada (rajada de mudanças = uma escrita só, ~400ms depois).
 *
 * O que NÃO passa por aqui, mesmo com banco configurado: as credenciais de
 * cada número de WhatsApp (pasta `dados/conexoes/<id>/`) e o cache de mídia.
 * Isso continua sempre em disco — a biblioteca do WhatsApp (Baileys) exige
 * uma pasta, e não é dado de negócio, é a chave técnica da conexão com o
 * aparelho (ver conexoes.js).
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { PASTA_DADOS, DATABASE_URL } from './config.js'

const USANDO_BANCO = Boolean(DATABASE_URL)

const PASTA_CONVERSAS = path.join(PASTA_DADOS, 'conversas')
if (!USANDO_BANCO) fs.mkdirSync(PASTA_CONVERSAS, { recursive: true })

const pool = USANDO_BANCO ? new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null

const ESQUEMA = `
  create table if not exists colecoes (
    nome text primary key,
    valor jsonb not null,
    atualizado_em timestamptz not null default now()
  );
  create table if not exists mensagens (
    conversa_id text primary key,
    lista jsonb not null default '[]'::jsonb,
    atualizado_em timestamptz not null default now()
  );
`

/* -------------------------- arquivos (modo antigo) ----------------------- */

function caminho(nome) {
  return path.join(PASTA_DADOS, `${nome}.json`)
}

function lerArquivo(nome, padrao) {
  const arquivo = caminho(nome)
  if (!fs.existsSync(arquivo)) return padrao
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  } catch (erro) {
    console.error(`[dados] ${nome}.json ilegível, usando o padrão:`, erro.message)
    // não apaga: renomeia para a pessoa poder olhar depois
    try {
      fs.renameSync(arquivo, `${arquivo}.quebrado-${Date.now()}`)
    } catch {
      /* segue o jogo */
    }
    return padrao
  }
}

function gravarArquivo(arquivo, valor) {
  const temporario = `${arquivo}.tmp`
  fs.writeFileSync(temporario, JSON.stringify(valor, null, 2), 'utf8')
  fs.renameSync(temporario, arquivo)
}

function arquivoMensagens(conversaId) {
  return path.join(PASTA_CONVERSAS, `${conversaId}.json`)
}

/* ------------------------------------------------------------------ */
/* Estado em memória — o disco/banco é só a cópia durável              */
/* ------------------------------------------------------------------ */

/** As coleções simples: um registro para cada uma (arquivo, ou linha da tabela `colecoes`). */
const COLECOES = ['ajustes', 'cursos', 'agentes', 'conversas', 'usuarios', 'sessoes', 'conexoes']

const memoria = {}
const cacheMensagens = new Map()

/**
 * Carrega tudo na memória. Precisa terminar (e ser esperada, com `await`)
 * antes do resto do sistema começar a ler ou gravar qualquer coisa — é por
 * isso que o index.js chama isto antes de importar os módulos que usam
 * `obter`/`definir` assim que sobem.
 */
export async function carregar() {
  if (!USANDO_BANCO) {
    console.log('[dados] modo arquivo — DATABASE_URL vazio, lendo de', PASTA_DADOS)
    for (const nome of COLECOES) memoria[nome] = lerArquivo(nome, null)
    return
  }

  await pool.query(ESQUEMA)

  const { rows } = await pool.query('select nome, valor from colecoes')
  const porNome = new Map(rows.map((r) => [r.nome, r.valor]))
  for (const nome of COLECOES) memoria[nome] = porNome.has(nome) ? porNome.get(nome) : null
  console.log(
    '[dados] modo banco — carregado do Postgres:',
    COLECOES.map((n) => `${n}=${Array.isArray(memoria[n]) ? memoria[n].length : memoria[n] == null ? 'vazio' : 'ok'}`).join(', '),
  )

  const { rows: msgRows } = await pool.query('select conversa_id, lista from mensagens')
  for (const row of msgRows) cacheMensagens.set(row.conversa_id, row.lista)
}

const gravacaoPendente = new Set()
let timerGravacao = null

async function gravarColecao(nome) {
  // cursos e agentes mudam pouco — logar aqui ajuda a rastrear uma gravação
  // inesperada (ex.: memória antiga de antes de um restart sobrescrevendo o
  // que outra pessoa/processo gravou depois).
  if (nome === 'cursos' || nome === 'agentes') {
    const valor = memoria[nome]
    console.log(`[dados] gravando ${nome} (${Array.isArray(valor) ? valor.length : 0} itens)`)
  }
  if (!USANDO_BANCO) {
    gravarArquivo(caminho(nome), memoria[nome])
    return
  }
  await pool.query(
    'insert into colecoes (nome, valor, atualizado_em) values ($1, $2, now()) ' +
      'on conflict (nome) do update set valor = $2, atualizado_em = now()',
    [nome, JSON.stringify(memoria[nome])],
  )
}

/** Agenda a gravação para daqui a pouco: rajada de mudanças = uma escrita. */
function agendar(nome) {
  gravacaoPendente.add(nome)
  if (timerGravacao) return
  timerGravacao = setTimeout(() => {
    timerGravacao = null
    const pendentes = [...gravacaoPendente]
    gravacaoPendente.clear()
    for (const item of pendentes) {
      gravarColecao(item).catch((erro) => console.error(`[dados] falha ao gravar ${item}:`, erro.message))
    }
  }, 400)
}

/** Grava agora, sem esperar o adiamento. Usado ao encerrar o programa. */
export async function gravarTudo() {
  if (timerGravacao) {
    clearTimeout(timerGravacao)
    timerGravacao = null
  }
  gravacaoPendente.clear()
  for (const nome of COLECOES) {
    if (memoria[nome] == null) continue
    try {
      await gravarColecao(nome)
    } catch (erro) {
      console.error(`[dados] falha ao gravar ${nome}:`, erro.message)
    }
  }
}

/* -------------------------- coleções simples ---------------------- */

export function obter(nome) {
  return memoria[nome]
}

export function definir(nome, valor) {
  memoria[nome] = valor
  agendar(nome)
  return valor
}

/** Existe conteúdo salvo? Serve para saber se é a primeira vez que abre. */
export function vazio() {
  return memoria.cursos == null && memoria.agentes == null
}

/* -------------------------- mensagens ----------------------------- */

export function mensagensDe(conversaId) {
  if (cacheMensagens.has(conversaId)) return cacheMensagens.get(conversaId)
  // modo arquivo: nem toda conversa está pré-carregada (só o que já foi pedido)
  let lista = []
  if (!USANDO_BANCO) {
    const arquivo = arquivoMensagens(conversaId)
    if (fs.existsSync(arquivo)) {
      try {
        lista = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
      } catch (erro) {
        console.error(`[dados] histórico de ${conversaId} ilegível:`, erro.message)
        lista = []
      }
    }
  }
  cacheMensagens.set(conversaId, lista)
  return lista
}

const conversasSujas = new Set()
let timerMensagens = null

async function gravarMensagensDe(conversaId) {
  const lista = cacheMensagens.get(conversaId) || []
  if (!USANDO_BANCO) {
    gravarArquivo(arquivoMensagens(conversaId), lista)
    return
  }
  await pool.query(
    'insert into mensagens (conversa_id, lista, atualizado_em) values ($1, $2, now()) ' +
      'on conflict (conversa_id) do update set lista = $2, atualizado_em = now()',
    [conversaId, JSON.stringify(lista)],
  )
}

function agendarMensagens() {
  if (!timerMensagens) timerMensagens = setTimeout(descarregarMensagens, 400)
}

export function guardarMensagem(conversaId, mensagem) {
  const lista = mensagensDe(conversaId)
  lista.push(mensagem)
  conversasSujas.add(conversaId)
  agendarMensagens()
  return mensagem
}

/**
 * Guarda várias mensagens de uma vez — o histórico trazido do celular — e
 * mantém a lista em ordem de horário (o histórico chega em partes, e as mais
 * antigas podem vir depois das que já estavam aqui). Fica só com as últimas
 * `limite`: o que passar disso é antigo demais para ajudar o atendimento.
 */
export function guardarVarias(conversaId, novas, limite = 1000) {
  const lista = mensagensDe(conversaId)
  for (const m of novas) lista.push(m)
  // data em ISO: comparar o texto é comparar o horário
  lista.sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0))
  if (lista.length > limite) lista.splice(0, lista.length - limite)
  conversasSujas.add(conversaId)
  agendarMensagens()
  return lista
}

export function atualizarMensagem(conversaId, mensagemId, mudancas) {
  const lista = mensagensDe(conversaId)
  const alvo = lista.find((m) => m.id === mensagemId)
  if (!alvo) return null
  Object.assign(alvo, mudancas)
  conversasSujas.add(conversaId)
  agendarMensagens()
  return alvo
}

function descarregarMensagens() {
  timerMensagens = null
  const pendentes = [...conversasSujas]
  conversasSujas.clear()
  for (const conversaId of pendentes) {
    gravarMensagensDe(conversaId).catch((erro) =>
      console.error(`[dados] falha ao gravar histórico de ${conversaId}:`, erro.message),
    )
  }
}

export async function apagarMensagens(conversaId) {
  cacheMensagens.delete(conversaId)
  conversasSujas.delete(conversaId)
  if (!USANDO_BANCO) {
    const arquivo = arquivoMensagens(conversaId)
    if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo)
    return
  }
  await pool.query('delete from mensagens where conversa_id = $1', [conversaId])
}

/** Grava histórico pendente. Chamado junto com gravarTudo(). */
export async function descarregarAgora() {
  if (timerMensagens) {
    clearTimeout(timerMensagens)
    timerMensagens = null
  }
  const pendentes = [...conversasSujas]
  conversasSujas.clear()
  for (const conversaId of pendentes) {
    try {
      await gravarMensagensDe(conversaId)
    } catch (erro) {
      console.error(`[dados] falha ao gravar histórico de ${conversaId}:`, erro.message)
    }
  }
}
