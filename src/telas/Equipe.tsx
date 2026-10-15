/**
 * Quem tem acesso ao sistema.
 *
 * Duas peças, usadas na tela de Ajustes:
 *  - CartaoEquipe: a lista de pessoas, para quem administra. Cadastra,
 *    remove, muda o papel e define senha nova — é o "esqueci a senha" da
 *    casa, já que o sistema não manda e-mail.
 *  - CartaoMinhaConta: a própria pessoa trocando a própria senha e vendo a
 *    verificação em duas etapas dela.
 */
import { useEffect, useRef, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Avatar, Campo, Modal, Opcoes } from '../componentes/Base'
import { IconeLixeira, IconeMais, IconePessoa } from '../componentes/Icones'
import { ModalNovosCodigos } from './DoisPassos'
import type { Papel, Usuario } from '../tipos'

/** Encolhe e corta a imagem no navegador antes de mandar — sem isso, qualquer foto de celular pesaria megabytes. */
function redimensionarImagem(arquivo: File, maxLado: number, qualidade: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'))
    leitor.onload = () => {
      const imagem = new Image()
      imagem.onerror = () => reject(new Error('Esse arquivo não parece uma imagem.'))
      imagem.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(imagem.width, imagem.height))
        const largura = Math.round(imagem.width * escala)
        const altura = Math.round(imagem.height * escala)
        const tela = document.createElement('canvas')
        tela.width = largura
        tela.height = altura
        const ctx = tela.getContext('2d')
        if (!ctx) return reject(new Error('Não consegui preparar a imagem.'))
        ctx.drawImage(imagem, 0, 0, largura, altura)
        resolve(tela.toDataURL('image/jpeg', qualidade))
      }
      imagem.src = String(leitor.result)
    }
    leitor.readAsDataURL(arquivo)
  })
}

const PAPEIS: { valor: Papel; nome: string }[] = [
  { valor: 'atendente', nome: 'Atende' },
  { valor: 'admin', nome: 'Administra' },
]

export function CartaoEquipe() {
  const loja = useLoja()
  const eu = loja.sessao?.usuario
  const [pessoas, setPessoas] = useState<Usuario[] | null>(null)
  const [adicionando, setAdicionando] = useState(false)
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null)

  useEffect(() => {
    api
      .equipe()
      .then(setPessoas)
      .catch((erro) => loja.avisar(erro instanceof Error ? erro.message : 'Não consegui carregar a equipe.', 'erro'))
    // só na abertura do cartão
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function mudarPapel(pessoa: Usuario, papel: Papel) {
    try {
      const salva = await api.salvarPessoa(pessoa.id, { papel })
      setPessoas((atuais) => (atuais || []).map((p) => (p.id === salva.id ? salva : p)))
      loja.avisar(`${salva.nome} agora ${papel === 'admin' ? 'administra' : 'atende'}.`, 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui mudar.', 'erro')
    }
  }

  async function refazerDuasEtapas(pessoa: Usuario) {
    const souEu = pessoa.id === eu?.id
    const aviso = souEu
      ? 'Você vai sair do sistema agora e parear o celular de novo ao entrar.'
      : 'As sessões abertas dela encerram e, no próximo login, ela pareia o celular de novo.'
    if (!confirm(`Refazer a verificação em duas etapas de ${pessoa.nome}? O celular atual é desvinculado e os códigos de recuperação deixam de valer. ${aviso}`)) return
    try {
      const salva = await api.redefinirDuasEtapas(pessoa.id)
      setPessoas((atuais) => (atuais || []).map((x) => (x.id === salva.id ? salva : x)))
      if (souEu) {
        await loja.sair()
      } else {
        loja.avisar(`${salva.nome} vai parear o celular de novo no próximo login.`, 'ok')
      }
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui refazer.', 'erro')
    }
  }

  async function remover(pessoa: Usuario) {
    if (!confirm(`Remover o acesso de ${pessoa.nome}? Ela não consegue mais entrar.`)) return
    try {
      setPessoas(await api.removerPessoa(pessoa.id))
      loja.avisar('Acesso removido.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui remover.', 'erro')
    }
  }

  return (
    <div className="cartao">
      <div className="cartao-cabecalho">
        <div className="cartao-titulo">
          <IconePessoa tamanho={15} /> Equipe
        </div>
        <button className="btn pequeno" onClick={() => setAdicionando(true)}>
          <IconeMais tamanho={13} /> Adicionar pessoa
        </button>
      </div>

      <div className="dica" style={{ marginBottom: 10 }}>
        Quem pode entrar no sistema. Quem <strong>administra</strong> vê esta lista, cadastra, remove e
        define senhas, conecta números e refaz as 2 etapas; quem <strong>atende</strong> usa todo o resto
        normalmente.
      </div>

      {pessoas === null ? (
        <div className="esmaecido" style={{ fontSize: 13 }}>
          carregando…
        </div>
      ) : (
        <div className="equipe">
          {pessoas.map((p) => {
            const souEu = p.id === eu?.id
            return (
              <div key={p.id} className="pessoa">
                <Avatar nome={p.nome} foto={api.urlFotoUsuario(p.id)} pequeno />
                <div className="crescer recortar">
                  <div className="nome recortar">
                    {p.nome}
                    {souEu && <span className="esmaecido"> (você)</span>}
                  </div>
                  <div className="email recortar">{p.email}</div>
                </div>
                <select
                  value={p.papel}
                  disabled={souEu}
                  title={souEu ? 'Seu próprio papel só outra pessoa que administra pode mudar' : 'Papel'}
                  onChange={(e) => mudarPapel(p, e.target.value as Papel)}
                  style={{ width: 128 }}
                >
                  {PAPEIS.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.nome}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-icone perigo"
                  title={souEu ? 'Você não pode remover a si mesmo' : 'Remover acesso'}
                  disabled={souEu}
                  onClick={() => remover(p)}
                >
                  <IconeLixeira tamanho={15} />
                </button>
                <div className="pessoa-acoes">
                  <span
                    className={`etiqueta ${p.doisPassos ? 'verde' : 'amarela'}`}
                    title={
                      p.doisPassos
                        ? `Celular pareado. Códigos de recuperação sobrando: ${p.codigosRestantes}`
                        : 'Ainda não pareou o celular: faz isso no próximo login'
                    }
                  >
                    {p.doisPassos ? '2 etapas ativas' : '2 etapas pendentes'}
                  </span>
                  <button className="btn pequeno fantasma" onClick={() => setSenhaDe(p)}>
                    Nova senha
                  </button>
                  <button
                    className="btn pequeno fantasma"
                    onClick={() => refazerDuasEtapas(p)}
                    disabled={!p.doisPassos}
                    title={
                      p.doisPassos
                        ? 'Desvincula o celular; a pessoa pareia de novo no próximo login'
                        : 'Nada para refazer: o celular ainda não foi pareado'
                    }
                  >
                    Refazer 2 etapas
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adicionando && (
        <ModalPessoa
          aoFechar={() => setAdicionando(false)}
          aoCriar={(nova) => setPessoas((atuais) => [...(atuais || []), nova])}
        />
      )}
      {senhaDe && <ModalSenha pessoa={senhaDe} aoFechar={() => setSenhaDe(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Cadastrar alguém                                                    */
/* ------------------------------------------------------------------ */

function ModalPessoa({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (u: Usuario) => void }) {
  const loja = useLoja()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState<Papel>('atendente')
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    setSalvando(true)
    try {
      const nova = await api.criarPessoa({ nome, email, senha, papel })
      aoCriar(nova)
      loja.avisar(`${nova.nome} já pode entrar. Passe a senha para ela.`, 'ok')
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui cadastrar.', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Adicionar pessoa"
      subtitulo="Ela entra com o e-mail e a senha que você definir aqui — e pode trocar a senha depois. No primeiro login, pareia o celular por QR Code."
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primario" onClick={criar} disabled={salvando || !nome || !email || !senha}>
            {salvando ? 'Cadastrando…' : 'Cadastrar'}
          </button>
        </>
      }
    >
      <Campo rotulo="Nome">
        <input id="pessoa-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
      </Campo>
      <Campo rotulo="E-mail" dica="É com ele que a pessoa entra.">
        <input id="pessoa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo rotulo="Senha inicial" dica="Pelo menos 8 caracteres.">
        <input
          id="pessoa-senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
        />
      </Campo>
      <Campo rotulo="Papel" dica="Quem administra também cadastra pessoas e conecta números.">
        <Opcoes valor={papel} opcoes={PAPEIS} aoMudar={setPapel} />
      </Campo>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Senha nova para alguém                                              */
/* ------------------------------------------------------------------ */

function ModalSenha({ pessoa, aoFechar }: { pessoa: Usuario; aoFechar: () => void }) {
  const loja = useLoja()
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (senha !== repetida) {
      loja.avisar('As duas senhas não são iguais.', 'erro')
      return
    }
    setSalvando(true)
    try {
      await api.salvarPessoa(pessoa.id, { senha })
      loja.avisar(`Senha de ${pessoa.nome} redefinida. As sessões dela foram encerradas.`, 'ok')
      aoFechar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui redefinir.', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={`Nova senha para ${pessoa.nome}`}
      subtitulo="Ela sai de todos os aparelhos onde estava conectada e entra com a senha nova."
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn primario" onClick={salvar} disabled={salvando || !senha}>
            {salvando ? 'Salvando…' : 'Redefinir senha'}
          </button>
        </>
      }
    >
      <Campo rotulo="Senha nova" dica="Pelo menos 8 caracteres.">
        <input
          id="senha-nova"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />
      </Campo>
      <Campo rotulo="Repita a senha">
        <input
          id="senha-repetida"
          type="password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          autoComplete="new-password"
        />
      </Campo>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* A própria senha                                                     */
/* ------------------------------------------------------------------ */

export function CartaoMinhaConta() {
  const loja = useLoja()
  const eu = loja.sessao?.usuario
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetida, setRepetida] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gerandoCodigos, setGerandoCodigos] = useState(false)
  const [nome, setNome] = useState(eu?.nome || '')
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [mexendoFoto, setMexendoFoto] = useState(false)
  const [versaoFoto, setVersaoFoto] = useState(0)
  const arquivoFoto = useRef<HTMLInputElement>(null)

  useEffect(() => setNome(eu?.nome || ''), [eu?.nome])

  async function salvarNome() {
    const limpo = nome.trim()
    if (!limpo || limpo === eu?.nome) return
    setSalvandoNome(true)
    try {
      await api.mudarNome(limpo)
      await loja.recarregarSessao()
      loja.avisar('Nome atualizado.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    } finally {
      setSalvandoNome(false)
    }
  }

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setMexendoFoto(true)
    try {
      const base64 = await redimensionarImagem(arquivo, 256, 0.85)
      await api.salvarFotoDePerfil(base64)
      setVersaoFoto((v) => v + 1)
      loja.avisar('Foto atualizada.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui enviar a foto.', 'erro')
    } finally {
      setMexendoFoto(false)
    }
  }

  async function removerFoto() {
    setMexendoFoto(true)
    try {
      await api.apagarFotoDePerfil()
      setVersaoFoto((v) => v + 1)
      loja.avisar('Foto removida.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui remover.', 'erro')
    } finally {
      setMexendoFoto(false)
    }
  }

  async function trocar() {
    if (nova !== repetida) {
      loja.avisar('As duas senhas novas não são iguais.', 'erro')
      return
    }
    setSalvando(true)
    try {
      await api.mudarSenha(atual, nova)
      setAtual('')
      setNova('')
      setRepetida('')
      loja.avisar('Senha trocada.', 'ok')
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui trocar.', 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cartao">
      <div className="cartao-cabecalho">
        <div className="cartao-titulo">Minha conta</div>
        {eu && <span className="etiqueta dourada">{eu.papel === 'admin' ? 'administra' : 'atende'}</span>}
      </div>
      <div className="pilha">
        {eu && (
          <div className="fila" style={{ gap: 12, alignItems: 'center' }}>
            <div className="avatar-estado grande" style={{ position: 'relative' }}>
              <Avatar nome={eu.nome} foto={`${api.urlFotoUsuario(eu.id)}?v=${versaoFoto}`} />
              <button
                className="btn-icone"
                title="Trocar foto"
                onClick={() => arquivoFoto.current?.click()}
                disabled={mexendoFoto}
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'var(--acento)',
                  color: 'var(--acento-contraste)',
                }}
              >
                <IconeMais tamanho={12} />
              </button>
              <input
                ref={arquivoFoto}
                type="file"
                accept="image/*"
                onChange={escolherFoto}
                style={{ display: 'none' }}
              />
            </div>
            <div className="crescer">
              <div className="fila" style={{ gap: 6 }}>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvarNome()}
                  style={{ fontWeight: 700, flex: 1 }}
                />
                {nome.trim() && nome.trim() !== eu.nome && (
                  <button className="btn pequeno" onClick={salvarNome} disabled={salvandoNome}>
                    {salvandoNome ? 'Salvando…' : 'Salvar'}
                  </button>
                )}
              </div>
              <div className="fila" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <span className="esmaecido" style={{ fontSize: 12 }}>
                  {eu.email}
                </span>
                <button className="btn pequeno fantasma" onClick={removerFoto} disabled={mexendoFoto}>
                  Remover foto
                </button>
              </div>
            </div>
          </div>
        )}
        {eu?.doisPassos && (
          <>
            <div className="divisor" />
            <div className="duas-etapas">
              <div className="crescer">
                <div className="duas-etapas-titulo">
                  Verificação em duas etapas <span className="etiqueta verde">ativa</span>
                </div>
                <div className="dica">
                  {eu.codigosRestantes > 0
                    ? `Códigos de recuperação sobrando: ${eu.codigosRestantes} de 8.`
                    : 'Você não tem mais códigos de recuperação. Gere novos.'}{' '}
                  {eu.papel === 'admin'
                    ? 'Trocou de celular? Na lista da Equipe, use “Refazer 2 etapas” na sua linha.'
                    : 'Trocou de celular? Peça a quem administra para refazer as suas 2 etapas.'}
                </div>
              </div>
              <button className="btn pequeno" onClick={() => setGerandoCodigos(true)}>
                Gerar códigos novos
              </button>
            </div>
          </>
        )}
        <div className="divisor" />
        <Campo rotulo="Senha atual">
          <input
            id="conta-atual"
            type="password"
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            autoComplete="current-password"
          />
        </Campo>
        <div className="grade g2">
          <Campo rotulo="Senha nova" dica="Pelo menos 8 caracteres.">
            <input
              id="conta-nova"
              type="password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              autoComplete="new-password"
            />
          </Campo>
          <Campo rotulo="Repita a nova">
            <input
              id="conta-repetida"
              type="password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              autoComplete="new-password"
            />
          </Campo>
        </div>
        <div className="fila-fim">
          <button className="btn" onClick={trocar} disabled={salvando || !atual || !nova}>
            {salvando ? 'Trocando…' : 'Trocar minha senha'}
          </button>
        </div>
      </div>
      {gerandoCodigos && <ModalNovosCodigos aoFechar={() => setGerandoCodigos(false)} />}
    </div>
  )
}
