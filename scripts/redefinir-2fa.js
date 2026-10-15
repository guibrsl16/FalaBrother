/**
 * Refaz a verificação em duas etapas de uma pessoa, direto nos arquivos.
 *
 * Existe para um caso só: quem administra perdeu o celular E os códigos de
 * recuperação, e não há outra pessoa administrando para refazer a etapa
 * dela em Ajustes → Equipe. Quem tem acesso à pasta do projeto já tem
 * acesso a tudo que há nela, então este atalho não abre nada que já não
 * estivesse aberto.
 *
 * Uso (com o sistema PARADO):
 *   npm run redefinir-2fa -- pessoa@escola.com.br
 *
 * No próximo login a pessoa cai de novo no QR Code.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arquivoUsuarios = path.join(raiz, 'dados', 'usuarios.json')
const arquivoSessoes = path.join(raiz, 'dados', 'sessoes.json')

function sair(mensagem) {
  console.error(`\n  ${mensagem}\n`)
  process.exit(1)
}

function gravar(arquivo, valor) {
  // grava ao lado e renomeia, como o sistema faz: faltou luz no meio, o arquivo antigo continua inteiro
  const temporario = `${arquivo}.tmp`
  fs.writeFileSync(temporario, JSON.stringify(valor, null, 2), 'utf8')
  fs.renameSync(temporario, arquivo)
}

const email = String(process.argv[2] || '').trim().toLowerCase()
if (!email) {
  sair('Diga de quem é o e-mail:  npm run redefinir-2fa -- pessoa@escola.com.br')
}
if (!fs.existsSync(arquivoUsuarios)) {
  sair('Não achei dados/usuarios.json — ainda não há ninguém cadastrado.')
}

// Com o sistema no ar, ele regrava a própria cópia da memória por cima do que
// fizermos aqui. Melhor recusar do que fingir que deu certo.
const porta = Number(process.env.PORTA || 8787)
let rodando = false
try {
  const resposta = await fetch(`http://localhost:${porta}/api/sessao`, { signal: AbortSignal.timeout(1500) })
  rodando = resposta.ok
} catch {
  rodando = false
}
if (rodando) {
  sair(`O sistema está no ar (porta ${porta}). Pare-o com Ctrl+C na janela do "npm start" e rode este comando de novo.`)
}

const usuarios = JSON.parse(fs.readFileSync(arquivoUsuarios, 'utf8'))
const alvo = usuarios.find((u) => u.email === email)
if (!alvo) {
  sair(`Ninguém cadastrado com o e-mail ${email}. Cadastrados: ${usuarios.map((u) => u.email).join(', ') || '(ninguém)'}`)
}

delete alvo.totp
delete alvo.totpPendente
delete alvo.recuperacao
gravar(arquivoUsuarios, usuarios)

// um celular que sumiu é o caso em que as sessões abertas não são de confiança
if (fs.existsSync(arquivoSessoes)) {
  const sessoes = JSON.parse(fs.readFileSync(arquivoSessoes, 'utf8'))
  gravar(
    arquivoSessoes,
    sessoes.filter((s) => s.usuarioId !== alvo.id),
  )
}

console.log(`\n  Pronto. ${alvo.nome} (${alvo.email}) vai parear o celular de novo no próximo login.`)
console.log('  Suba o sistema com "npm start" e entre normalmente.\n')
