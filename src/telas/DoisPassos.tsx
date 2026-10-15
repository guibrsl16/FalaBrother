/**
 * Verificação em duas etapas: tudo que a pessoa vê depois de acertar a senha.
 *
 *  - EtapaPareamento: primeiro login. Mostra o QR Code para o aplicativo
 *    autenticador do celular e pede o primeiro código;
 *  - EtapaCodigo: todo login seguinte. Pede os 6 números (ou, para quem
 *    perdeu o celular, um código de recuperação);
 *  - ModalCodigos: os códigos de recuperação, mostrados uma única vez, que a
 *    pessoa precisa confirmar que guardou antes de seguir;
 *  - ModalNovosCodigos: gerar um jogo novo (o antigo deixa de valer).
 *
 * As duas etapas de login vivem dentro da tela de entrada: elas não decidem
 * nada sozinhas, só chamam a loja e devolvem os erros para quem as montou.
 */
import React, { useEffect, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Campo, Interruptor, Modal } from '../componentes/Base'
import { IconeCopiar } from '../componentes/Icones'
import type { Pareamento } from '../tipos'

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

/** "123456" → "123 456": mais fácil de conferir contra a tela do celular. */
function agrupar(digitos: string) {
  return digitos.length > 3 ? `${digitos.slice(0, 3)} ${digitos.slice(3)}` : digitos
}

function CampoCodigo({
  id,
  valor,
  aoMudar,
  autoFocus,
}: {
  id: string
  valor: string
  aoMudar: (digitos: string) => void
  autoFocus?: boolean
}) {
  return (
    <input
      id={id}
      className="campo-codigo"
      value={agrupar(valor)}
      onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000 000"
      autoFocus={autoFocus}
      aria-label="Código de 6 números"
    />
  )
}

function copiar(texto: string, avisar: ReturnType<typeof useLoja>['avisar'], ok: string) {
  navigator.clipboard
    .writeText(texto)
    .then(() => avisar(ok, 'ok'))
    .catch(() => avisar('Não consegui copiar. Selecione o texto e copie à mão.', 'erro'))
}

interface PropsEtapa {
  erro: string
  /** Mostra o erro e confere de novo quem está do outro lado (a vez pode ter acabado). */
  falhar: (mensagem: string) => void
  limpar: () => void
}

/* ------------------------------------------------------------------ */
/* Todo dia: o código                                                  */
/* ------------------------------------------------------------------ */

export function EtapaCodigo({ erro, falhar, limpar }: PropsEtapa) {
  const { sessao, verificarCodigo, sair } = useLoja()
  const [codigo, setCodigo] = useState('')
  const [recuperacao, setRecuperacao] = useState('')
  const [modoRecuperacao, setModoRecuperacao] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const pronto = modoRecuperacao ? recuperacao.replace(/[^A-Za-z0-9]/g, '').length >= 10 : codigo.length === 6

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando || !pronto) return
    limpar()
    setEnviando(true)
    try {
      await verificarCodigo(modoRecuperacao ? { recuperacao } : { codigo })
    } catch (falha) {
      falhar(falha instanceof Error ? falha.message : 'Não deu certo. Tente de novo.')
      setCodigo('')
      setRecuperacao('')
      setEnviando(false)
    }
  }

  return (
    <form className="login-cartao" onSubmit={enviar}>
      <h2>Verificação em duas etapas</h2>
      <p className="login-desc">
        {sessao?.pendente ? `${sessao.pendente.nome}, ` : ''}
        {modoRecuperacao
          ? 'digite um dos códigos de recuperação que você guardou. Cada um vale uma única vez.'
          : 'abra o aplicativo autenticador no celular e digite o código de 6 números que aparece para “Brotherhood Cursos”.'}
      </p>

      {modoRecuperacao ? (
        <Campo rotulo="Código de recuperação">
          <input
            id="codigo-recuperacao"
            className="mono"
            value={recuperacao}
            onChange={(e) => setRecuperacao(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            autoComplete="off"
            autoFocus
          />
        </Campo>
      ) : (
        <Campo rotulo="Código do aplicativo">
          <CampoCodigo id="codigo-2fa" valor={codigo} aoMudar={setCodigo} autoFocus />
        </Campo>
      )}

      {erro && <div className="login-erro">{erro}</div>}

      <button type="submit" className="btn primario login-botao" disabled={enviando || !pronto}>
        {enviando ? 'Verificando…' : 'Verificar e entrar'}
      </button>

      <div className="login-linha">
        <button
          type="button"
          className="login-link"
          onClick={() => {
            limpar()
            setModoRecuperacao((v) => !v)
          }}
        >
          {modoRecuperacao ? 'Usar o código do aplicativo' : 'Perdi o celular'}
        </button>
        <button type="button" className="login-link" onClick={sair}>
          Voltar
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Primeiro login: o QR Code                                           */
/* ------------------------------------------------------------------ */

export function EtapaPareamento({ erro, falhar, limpar }: PropsEtapa) {
  const loja = useLoja()
  const { sessao, confirmarPareamento, sair } = loja
  const [pareamento, setPareamento] = useState<Pareamento | null>(null)
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let cancelado = false
    api
      .iniciarPareamento()
      .then((p) => !cancelado && setPareamento(p))
      .catch((falha) => !cancelado && falhar(falha instanceof Error ? falha.message : 'Não consegui gerar o QR Code.'))
    return () => {
      cancelado = true
    }
    // o servidor devolve sempre o mesmo QR para a mesma entrada; basta pedir uma vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando || codigo.length !== 6) return
    limpar()
    setEnviando(true)
    try {
      await confirmarPareamento(codigo)
    } catch (falha) {
      falhar(falha instanceof Error ? falha.message : 'Não deu certo. Tente de novo.')
      setCodigo('')
      setEnviando(false)
    }
  }

  // a chave em blocos de 4 é a forma como os aplicativos costumam mostrar
  const chave = pareamento?.segredo.match(/.{1,4}/g)?.join(' ') ?? ''

  return (
    <form className="login-cartao largo" onSubmit={enviar}>
      <h2>Pareie o seu celular</h2>
      <p className="login-desc">
        {sessao?.pendente ? `${sessao.pendente.nome}, ` : ''}
        para proteger o atendimento, o sistema pede um código do seu celular a cada entrada. Isto se
        faz uma vez só.
      </p>

      <div className="pareamento">
        <div className="pareamento-qr">
          {pareamento ? (
            <img src={pareamento.qr} width={200} height={200} alt="QR Code para parear o celular" />
          ) : (
            <div className="pareamento-carregando">gerando QR Code…</div>
          )}
        </div>

        <ol className="pareamento-passos">
          <li>
            Tenha um aplicativo autenticador no celular: <strong>Google Authenticator</strong>,{' '}
            <strong>Microsoft Authenticator</strong>, <strong>Authy</strong> ou 1Password.
          </li>
          <li>
            No aplicativo, toque em <strong>+</strong> e escolha <strong>Ler código QR</strong>.
          </li>
          <li>Aponte a câmera para o quadrado ao lado.</li>
          <li>Digite abaixo os 6 números que o aplicativo passar a mostrar.</li>
        </ol>
      </div>

      {pareamento && (
        <details className="pareamento-chave">
          <summary>Não consegue ler o QR Code?</summary>
          <div className="dica">
            No aplicativo, escolha <strong>Inserir chave de configuração</strong> e digite esta chave
            (tipo: baseada em tempo):
          </div>
          <div className="fila">
            <code className="chave crescer">{chave}</code>
            <button
              type="button"
              className="btn-icone"
              title="Copiar a chave"
              onClick={() => copiar(pareamento.segredo, loja.avisar, 'Chave copiada.')}
            >
              <IconeCopiar tamanho={15} />
            </button>
          </div>
        </details>
      )}

      <Campo rotulo="Código que o aplicativo está mostrando">
        <CampoCodigo id="codigo-pareamento" valor={codigo} aoMudar={setCodigo} autoFocus />
      </Campo>

      {erro && <div className="login-erro">{erro}</div>}

      <button
        type="submit"
        className="btn primario login-botao"
        disabled={enviando || codigo.length !== 6 || !pareamento}
      >
        {enviando ? 'Conferindo…' : 'Ativar e entrar'}
      </button>

      <div className="login-linha">
        <span className="esmaecido" style={{ fontSize: 11.5 }}>
          Depois você recebe códigos de recuperação.
        </span>
        <button type="button" className="login-link" onClick={sair}>
          Cancelar e sair
        </button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Códigos de recuperação                                              */
/* ------------------------------------------------------------------ */

/**
 * Cobre o sistema até a pessoa confirmar que guardou os códigos. Esc, o X e
 * o clique fora só avisam: é a única tela em que fechar sem ler custa caro.
 */
export function ModalCodigos({ codigos, aoFechar }: { codigos: string[]; aoFechar: () => void }) {
  const loja = useLoja()
  const [guardei, setGuardei] = useState(false)

  function tentarFechar() {
    if (guardei) aoFechar()
    else loja.avisar('Guarde os códigos e marque a caixa para continuar.', 'erro')
  }

  return (
    <Modal
      titulo="Guarde os seus códigos de recuperação"
      subtitulo="Eles aparecem só agora. Sem o celular, são a única forma de entrar sem ajuda de quem administra."
      aoFechar={tentarFechar}
      rodape={
        <>
          <button
            className="btn fantasma"
            onClick={() => copiar(codigos.join('\n'), loja.avisar, 'Códigos copiados.')}
          >
            <IconeCopiar tamanho={14} /> Copiar todos
          </button>
          <button className="btn primario" onClick={tentarFechar} disabled={!guardei}>
            Continuar
          </button>
        </>
      }
    >
      <div className="codigos-grade" role="list">
        {codigos.map((c) => (
          <code key={c} role="listitem">
            {c}
          </code>
        ))}
      </div>
      <div className="dica">
        Cada código vale uma única vez. Anote em papel e guarde em lugar seguro, ou salve no seu
        gerenciador de senhas. Não tire foto e deixe na galeria do celular que pode ser perdido.
      </div>
      <Interruptor ligado={guardei} aoMudar={setGuardei}>
        Guardei os códigos em um lugar seguro
      </Interruptor>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Gerar um jogo novo                                                  */
/* ------------------------------------------------------------------ */

export function ModalNovosCodigos({ aoFechar }: { aoFechar: () => void }) {
  const loja = useLoja()
  const [codigo, setCodigo] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function gerar() {
    setSalvando(true)
    try {
      const r = await api.novosCodigos(codigo)
      loja.mostrarCodigos(r.codigos)
      await loja.recarregarSessao() // atualiza o "restam N" em Minha conta
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui gerar.', 'erro')
      setCodigo('')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Gerar códigos de recuperação novos"
      subtitulo="Os códigos que você tem hoje, usados ou não, deixam de valer."
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primario" onClick={gerar} disabled={salvando || codigo.length !== 6}>
            {salvando ? 'Gerando…' : 'Gerar códigos novos'}
          </button>
        </>
      }
    >
      <Campo rotulo="Para confirmar, o código do aplicativo agora">
        <CampoCodigo id="codigo-novos" valor={codigo} aoMudar={setCodigo} autoFocus />
      </Campo>
    </Modal>
  )
}
