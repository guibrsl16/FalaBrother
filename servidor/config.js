/**
 * Configuração da central de atendimento da Brotherhood Cursos.
 *
 * Lê o arquivo .env na mão (sem biblioteca) para o programa funcionar com
 * um `node servidor/index.js` puro, sem depender de flag do Node nem de
 * pacote extra. Valores do .env são só o ponto de partida: o que a pessoa
 * salvar na tela de Ajustes fica guardado em dados/ajustes.json e vale mais.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function lerEnv() {
  const arquivo = path.join(RAIZ, '.env')
  if (!fs.existsSync(arquivo)) return
  const texto = fs.readFileSync(arquivo, 'utf8')
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim()
    if (!limpa || limpa.startsWith('#')) continue
    const corte = limpa.indexOf('=')
    if (corte < 0) continue
    const chave = limpa.slice(0, corte).trim()
    let valor = limpa.slice(corte + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    // o que já veio do sistema operacional tem prioridade sobre o arquivo
    if (process.env[chave] === undefined) process.env[chave] = valor
  }
}

lerEnv()

/**
 * Onde ficam os dados. Por padrão, a pasta dados/ do projeto; a variável
 * PASTA_DADOS (no .env ou no sistema) leva para outro lugar — útil para
 * manter as conversas fora da pasta do código, ou para testar sem encostar
 * nos dados de verdade.
 */
export const PASTA_DADOS = process.env.PASTA_DADOS
  ? path.resolve(process.env.PASTA_DADOS)
  : path.join(RAIZ, 'dados')

export const env = {
  porta: Number(process.env.PORTA || 8787),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  modeloIA: process.env.MODELO_IA || 'claude-sonnet-5',
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    token: process.env.WHATSAPP_TOKEN || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'brotherat',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    versaoApi: process.env.WHATSAPP_API_VERSION || 'v21.0',
  },
}

/** Modelo dos agentes. O projeto inteiro é escrito em cima do Sonnet 5. */
export const MODELO_PADRAO = 'claude-sonnet-5'

/** Níveis de esforço aceitos pelo Sonnet 5 (output_config.effort). */
export const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * Preço do Sonnet 5 na API da Anthropic, em dólar por milhão de tokens — para
 * estimar o gasto em Ajustes/Painel a partir do uso que cada resposta já
 * grava. Se um dia o projeto trocar de modelo, atualize aqui também.
 */
export const PRECO_SONNET_5_USD_POR_MILHAO = {
  entrada: 2,
  saida: 10,
  cacheEscrito: 2.5, // cache de 5 min: 1,25x o preço de entrada
  cacheLido: 0.2, // 0,1x o preço de entrada
}
