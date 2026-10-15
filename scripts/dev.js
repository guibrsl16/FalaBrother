/**
 * Sobe as duas metades do Brotherhood Cursos (central de atendimento) de uma vez:
 *   - o servidor de atendimento (Node, porta 8787)
 *   - a interface (Vite, porta 5173)
 *
 * Ctrl+C derruba as duas. Sem isto, seria preciso abrir dois terminais.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const filhos = []

/**
 * `precisaDeShell` é por processo, não por sistema.
 *
 * No Windows, o npm é um arquivo .cmd e só roda através do shell. Já o
 * node.exe é executável direto — e passá-lo pelo shell quebra, porque o
 * caminho dele tem espaço ("C:\Program Files\nodejs") e o shell corta a
 * linha no primeiro espaço.
 */
function subir(nome, comando, argumentos, precisaDeShell = false) {
  const filho = spawn(comando, argumentos, {
    cwd: raiz,
    stdio: 'inherit',
    shell: precisaDeShell,
    env: { ...process.env, NOME_PROCESSO: nome },
  })
  filho.on('exit', (codigo) => {
    if (codigo !== 0 && codigo !== null) {
      console.error(`\n[${nome}] terminou com código ${codigo}`)
    }
    encerrar()
  })
  filhos.push(filho)
  return filho
}

let encerrando = false
function encerrar() {
  if (encerrando) return
  encerrando = true
  for (const filho of filhos) {
    try {
      filho.kill()
    } catch {
      /* já morreu */
    }
  }
  process.exit(0)
}

process.on('SIGINT', encerrar)
process.on('SIGTERM', encerrar)

console.log('\n  Brotherhood Cursos — subindo atendimento e interface…\n')
subir('servidor', process.execPath, ['servidor/index.js'], false)
subir('interface', npm, ['run', 'web'], process.platform === 'win32')
