/**
 * A porta de entrada. Quatro cartões, escolhidos pelo que o servidor diz que
 * falta para a pessoa entrar:
 *  - o primeiro acesso, enquanto não existe ninguém cadastrado: cria a conta
 *    que administra o sistema (não há modo "sem senha");
 *  - e-mail e senha (ninguém no meio da entrada);
 *  - o QR Code, na primeira vez: pareia o celular com o aplicativo autenticador;
 *  - o código de 6 números, em todas as vezes seguintes.
 *
 * Senha certa nunca abre o sistema sozinha: ela só leva ao cartão seguinte.
 * A sessão de verdade nasce quando o código confere.
 *
 * Não existe "esqueci a senha" por e-mail — o sistema não manda e-mail.
 * Quem administra define uma senha nova em Ajustes → Equipe.
 */
import React, { useState } from 'react'
import { useLoja } from '../estado'
import { Campo, Interruptor } from '../componentes/Base'
import { Logo } from '../componentes/Icones'
import { EtapaCodigo, EtapaPareamento } from './DoisPassos'

export default function Login() {
  const { sessao, entrar, primeiroAcesso, recarregarSessao } = useLoja()
  const etapa = sessao?.etapa ?? null
  // ninguém cadastrado ainda: este cartão cria a primeira conta, que administra
  const primeiro = sessao ? !sessao.configurado : false

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [ajuda, setAjuda] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro('')
    if (primeiro && senha !== repetida) {
      setErro('As duas senhas não são iguais.')
      return
    }
    setEnviando(true)
    try {
      if (primeiro) await primeiroAcesso(nome, email, senha)
      else await entrar(email, senha, lembrar)
      // a senha já cumpriu o papel dela; não fica na tela
      setSenha('')
      setRepetida('')
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não deu certo. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  /**
   * Erro numa etapa do código. Depois de cinco erros (ou de dez minutos) o
   * servidor encerra a entrada; perguntar de novo faz a tela voltar sozinha
   * para e-mail e senha, com a mensagem ainda visível.
   */
  function falhar(mensagem: string) {
    setErro(mensagem)
    recarregarSessao().catch(() => undefined)
  }

  return (
    <div className="login">
      <div className="login-marca">
        <Logo tamanho={84} semNome />
        <div className="login-nome">
          BROTHERHOOD<span>CURSOS</span>
        </div>
        <div className="login-sub">Central de atendimento</div>
        <div className="login-frase">Conteúdo que move cidades.</div>
      </div>

      {etapa === 'codigo' && <EtapaCodigo erro={erro} falhar={falhar} limpar={() => setErro('')} />}
      {etapa === 'configurar' && (
        <EtapaPareamento erro={erro} falhar={falhar} limpar={() => setErro('')} />
      )}

      {!etapa && (
        <form className="login-cartao" onSubmit={enviar}>
          <h2>{primeiro ? 'Criar o primeiro acesso' : 'Entrar'}</h2>
          <p className="login-desc">
            {primeiro
              ? 'Ainda não há ninguém cadastrado. Esta conta administra o sistema: conecta os números de WhatsApp e cadastra o resto da equipe. Em seguida você pareia o celular por QR Code.'
              : 'Use o e-mail e a senha da equipe.'}
          </p>

          {primeiro && (
            <Campo rotulo="Seu nome">
              <input
                id="login-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
                autoFocus
              />
            </Campo>
          )}

          <Campo rotulo="E-mail">
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus={!primeiro}
              placeholder="nome@escola.com.br"
            />
          </Campo>

          <Campo rotulo="Senha" dica={primeiro ? 'Pelo menos 8 caracteres.' : undefined}>
            <input
              id="login-senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={primeiro ? 'new-password' : 'current-password'}
            />
          </Campo>

          {primeiro && (
            <Campo rotulo="Repita a senha">
              <input
                id="login-repetida"
                type="password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                autoComplete="new-password"
              />
            </Campo>
          )}

          {!primeiro && (
            <div className="login-linha">
              <Interruptor ligado={lembrar} aoMudar={setLembrar}>
                Continuar conectado
              </Interruptor>
              <button type="button" className="login-link" onClick={() => setAjuda((v) => !v)}>
                Esqueci a senha
              </button>
            </div>
          )}

          {ajuda && (
            <div className="login-nota">
              O sistema não envia e-mail de recuperação. Peça a quem administra para definir uma senha
              nova para você em <strong>Ajustes → Equipe</strong>.
            </div>
          )}

          {erro && <div className="login-erro">{erro}</div>}

          <button
            type="submit"
            className="btn primario login-botao"
            disabled={enviando || !email || !senha || (primeiro && (!nome.trim() || !repetida))}
          >
            {enviando ? 'Aguarde…' : primeiro ? 'Criar meu acesso' : 'Continuar'}
          </button>

          <div className="login-rodape">
            Depois da senha, o sistema pede um código do seu celular.
            <br />
            Acesso restrito à equipe da Brotherhood Cursos.
          </div>
        </form>
      )}
    </div>
  )
}
