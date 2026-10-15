/**
 * A ligação opcional com o WhatsApp oficial (Cloud API da Meta). Os números
 * conectados por QR Code ficam em Conexões; esta tela é só para quem usa a API
 * oficial, com webhook.
 *
 * Esta tela existe para que ninguém precise abrir o arquivo .env no bloco
 * de notas. O passo a passo fica ao lado dos campos porque é aqui que a
 * configuração costuma travar — e travar sem mensagem de erro.
 */
import { useEffect, useState } from 'react'
import { useLoja } from '../estado'
import { api } from '../api'
import { Campo } from '../componentes/Base'
import { IconeCopiar, IconeWhatsapp } from '../componentes/Icones'

export default function Canal() {
  const loja = useLoja()
  const { ajustes } = loja

  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [token, setToken] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [versaoApi, setVersaoApi] = useState('v21.0')
  const [testando, setTestando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    if (!ajustes) return
    setPhoneNumberId(ajustes.whatsapp.phoneNumberId || '')
    setVerifyToken(ajustes.whatsapp.verifyToken || '')
    setVersaoApi(ajustes.whatsapp.versaoApi || 'v21.0')
  }, [ajustes])

  if (!ajustes) return null

  const enderecoWebhook = `${window.location.origin}/webhook`

  async function salvar() {
    try {
      const novo = await api.salvarAjustes({
        whatsapp: { phoneNumberId, token, verifyToken, appSecret, versaoApi },
      })
      loja.aplicarAjustes(novo)
      setToken('')
      setAppSecret('')
      loja.avisar('Canal salvo.', 'ok')
      loja.recarregar()
    } catch (erro) {
      loja.avisar(erro instanceof Error ? erro.message : 'Não consegui salvar.', 'erro')
    }
  }

  async function testar() {
    setTestando(true)
    setResultado(null)
    try {
      const r = await api.testarCanal()
      setResultado({
        ok: r.ok,
        texto: r.ok
          ? `Conectado ao número ${r.numero || '(sem número)'}${r.nome ? ` — ${r.nome}` : ''}${
              r.qualidade ? ` · qualidade ${r.qualidade}` : ''
            }`
          : r.mensagem || 'Não consegui falar com a Meta.',
      })
    } finally {
      setTestando(false)
    }
  }

  function copiar(texto: string) {
    navigator.clipboard
      .writeText(texto)
      .then(() => loja.avisar('Copiado.', 'ok'))
      .catch(() => loja.avisar('Não consegui copiar. Selecione e copie à mão.', 'erro'))
  }

  return (
    <>
      <div className="conteudo-cabecalho">
        <div>
          <h1>API oficial</h1>
          <p>
            A ligação opcional com a API oficial da Meta (WhatsApp Cloud API), para um número
            verificado no Meta Business. Para conectar números lendo um QR Code, use{' '}
            <strong>Conexões</strong>; as duas formas podem conviver.
          </p>
        </div>
        <span className={`etiqueta ${loja.canal.whatsappConfigurado ? 'verde' : 'amarela'}`}>
          {loja.canal.whatsappConfigurado ? 'ligado' : 'desligado'}
        </span>
      </div>

      <div className="grade g-2-1">
        <div className="pilha">
          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">
                <IconeWhatsapp tamanho={15} /> Credenciais
              </div>
              <button className="btn pequeno fantasma" onClick={testar} disabled={testando}>
                {testando ? 'Testando…' : 'Testar conexão'}
              </button>
            </div>

            <div className="pilha">
              <Campo
                rotulo="Phone number ID"
                dica="No painel da Meta: WhatsApp → Configuração da API. É um número comprido, não o telefone."
              >
                <input
                  className="mono"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="123456789012345"
                />
              </Campo>

              <Campo
                rotulo="Token de acesso"
                dica={
                  ajustes.whatsapp.token.preenchido
                    ? `Já existe um token salvo (termina em ${ajustes.whatsapp.token.fim}). Deixe vazio para manter.`
                    : 'Use um token permanente de usuário do sistema — o token de teste expira em 24 horas.'
                }
              >
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={ajustes.whatsapp.token.preenchido ? '••••••••••••' : 'EAAG…'}
                />
              </Campo>

              <Campo
                rotulo="Token de verificação"
                dica="Uma palavra que você inventa. A mesma precisa ser digitada no painel da Meta ao cadastrar o webhook."
              >
                <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
              </Campo>

              <Campo
                rotulo="App Secret"
                dica={
                  ajustes.whatsapp.appSecret.preenchido
                    ? `Salvo (termina em ${ajustes.whatsapp.appSecret.fim}). Deixe vazio para manter.`
                    : 'Sem ele, qualquer um que descobrir o endereço do webhook pode forjar uma mensagem de cliente. Preencha antes de usar para valer.'
                }
              >
                <input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={ajustes.whatsapp.appSecret.preenchido ? '••••••••••••' : ''}
                />
              </Campo>

              <Campo rotulo="Versão da Graph API">
                <input className="mono" value={versaoApi} onChange={(e) => setVersaoApi(e.target.value)} />
              </Campo>

              {resultado && (
                <div
                  className="aviso-ia"
                  style={
                    resultado.ok
                      ? { borderColor: 'var(--borda-verde)', background: 'var(--verde-fundo)', color: 'var(--verde)' }
                      : { borderColor: 'rgba(var(--vermelho-rgb),.34)', background: 'var(--vermelho-fundo)', color: 'var(--vermelho)' }
                  }
                >
                  {resultado.texto}
                </div>
              )}

              <div className="fila-fim">
                <button className="btn primario" onClick={salvar}>
                  Salvar canal
                </button>
              </div>
            </div>
          </div>

          <div className="cartao">
            <div className="cartao-cabecalho">
              <div className="cartao-titulo">Endereço do webhook</div>
            </div>
            <div className="pilha-sm">
              <div style={{ fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.6 }}>
                Cole este endereço no painel da Meta, em <strong>Webhooks → Callback URL</strong>, e
                assine o campo <strong>messages</strong>. A Meta só aceita HTTPS — em teste, use um
                túnel como o ngrok e troque o endereço abaixo pelo que ele gerar.
              </div>
              <div className="fila">
                <input className="mono crescer" readOnly value={enderecoWebhook} />
                <button className="btn-icone" onClick={() => copiar(enderecoWebhook)} title="Copiar">
                  <IconeCopiar tamanho={15} />
                </button>
              </div>
              <div className="fila">
                <input className="mono crescer" readOnly value={verifyToken || '(defina o token acima)'} />
                <button className="btn-icone" onClick={() => copiar(verifyToken)} title="Copiar token de verificação">
                  <IconeCopiar tamanho={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="cartao">
          <div className="cartao-cabecalho">
            <div className="cartao-titulo">Passo a passo</div>
          </div>
          <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--txt-2)', lineHeight: 1.85 }}>
            <li>
              Crie um app do tipo <strong>Business</strong> em developers.facebook.com e adicione o
              produto WhatsApp.
            </li>
            <li>Copie o Phone number ID da tela de configuração da API.</li>
            <li>
              Em Configurações do app → Básico, copie o <strong>App Secret</strong>.
            </li>
            <li>
              Crie um <strong>usuário do sistema</strong> no Business Manager e gere um token
              permanente com as permissões <span className="mono">whatsapp_business_messaging</span> e{' '}
              <span className="mono">whatsapp_business_management</span>.
            </li>
            <li>Preencha os campos ao lado e salve.</li>
            <li>Cadastre o webhook com o endereço e o token de verificação desta tela.</li>
            <li>
              Assine o campo <strong>messages</strong> — sem isso a Meta não avisa quando alguém
              escreve.
            </li>
            <li>Mande uma mensagem para o número da escola e veja aparecer em Conversas.</li>
          </ol>

          <div className="divisor" style={{ margin: '14px 0' }} />

          <div style={{ fontSize: 12.5, color: 'var(--txt-3)', lineHeight: 1.6 }}>
            A janela de atendimento da Meta é de 24 horas: passado esse prazo sem o cliente escrever,
            só é possível responder com um modelo de mensagem aprovado. Por isso a IA responde rápido —
            e por isso vale acompanhar a fila.
          </div>
        </div>
      </div>
    </>
  )
}
