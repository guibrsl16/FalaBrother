# Prompt do projeto — Brotherhood Cursos · Central de atendimento

**Como usar:** cole este texto inteiro como primeira mensagem de uma conversa nova (Claude Code, Claude no navegador ou outra IA com acesso à pasta). Ele explica onde o projeto está, o que é, tudo o que já foi feito, em que estado o sistema está agora e o que falta. **Última atualização: 08/10/2026 (sessão 2, depois da primeira entrega).**

Você está assumindo a continuação de um projeto que já existe e funciona. Não recomece do zero e não reescreva o que já está pronto. Leia este texto, depois o `README.md` da pasta, e só então proponha ou faça mudanças.

---

## 1. Onde está tudo

| O quê | Onde |
|---|---|
| Pasta do projeto | `C:\Users\guilh\Desktop\brotherat` |
| Sistema operacional | Windows 11 (shell: Git Bash e PowerShell; Python não está instalado — use Node) |
| Node | v20 ou mais novo |
| Controle de versão | Não é repositório git. Não há histórico para desfazer: confira o que vai alterar antes de apagar ou sobrescrever |
| Dados reais do sistema | `C:\Users\guilh\Desktop\brotherat\dados\` (JSON; fora do git de qualquer jeito: está no `.gitignore`) |
| Cópias de segurança | `dados/backups/` — hoje tem uma cópia das 147 conversas apagadas em 08/10 (ver seção 6) |
| Interface (dev) | `http://localhost:5173` (Vite) |
| Servidor, API e webhook | `http://localhost:8787` (Node + Express) |
| Memória das conversas anteriores | `C:\Users\guilh\.claude\projects\C--Users-guilh-Desktop-brotherat\memory\` |

Como subir: na pasta do projeto, `npm start` (sobe servidor + interface juntos) e abra `http://localhost:5173`. Em produção, `npm run producao` monta o build e serve tudo pela porta 8787. O arquivo `.claude/launch.json` define a configuração `brotherhood` (= `npm start`) para o painel de pré-visualização do app Claude.

**No Windows, o `npm start` deste projeto às vezes não solta a porta 5173 sozinho** quando o processo anterior é encerrado à força (`taskkill //PID <pid> //F`). Depois de reiniciar o servidor, confira com `netstat -ano | grep -E ":8787|:5173"` se as duas portas certas estão de pé; se o Vite subiu em 5174 ou outra porta, mate o processo órfão da porta 5173 e suba de novo.

Outros comandos: `npm run verificar` (confere os tipos e monta o build — rode sempre antes de dizer que terminou) · `npm run servidor` · `npm run web` · `npm run redefinir-2fa -- email@da.pessoa` (refaz as 2 etapas de alguém; só com o sistema parado).

Importante: o servidor Node **não recarrega sozinho**. Depois de mexer em qualquer arquivo de `servidor/`, reinicie-o (`node --check servidor/arquivo.js` antes de reiniciar pega erro de sintaxe sem precisar subir o sistema). Já a interface (`src/`) recarrega sozinha no Vite.

---

## 2. O que é o sistema

Central de atendimento da **Brotherhood Cursos** (escola de cursos profissionalizantes, Pernambuco). As conversas do WhatsApp chegam aqui e são respondidas por agentes de IA — um por curso, mais uma Recepção que faz a triagem — usando o **Claude Sonnet 5** (`claude-sonnet-5`, SDK `@anthropic-ai/sdk`). Quando o assunto sai do roteiro (desconto, matrícula, reclamação, pagamento), o agente transfere para uma pessoa da equipe e para de responder. O agente só pode fazer três coisas, e isso está no código, não no texto do prompt: `transferir_para_atendente`, `registrar_interesse`, `passar_para_outro_agente`.

Caminho de uma mensagem: número conectado (Baileys) ou webhook da API oficial → `atendimento.js` registra → espera alguns segundos (agrupa rajadas) → escolhe o agente (já tem agente → curso conhecido → palavra-chave → Recepção, **sempre um agente de IA, nunca pula direto para humano**) → `claude.js` roda o modelo → envia a resposta pelo mesmo número por onde a conversa chegou → aplica o que o agente decidiu. Regra de ouro: quem escreve à mão (pela tela ou pelo próprio celular) assume a conversa e a IA pausa na hora.

Identidade visual: azul-marinho `#27336B` e dourado `#C9A24B`, estilo "Vitral" (painéis de vidro fosco sobre fundo degradê), tipografia Sora hospedada em `public/fontes/`. Dois temas: Vitral claro (padrão) e Vitral escuro. Todo o texto da interface e do código está em português do Brasil.

---

## 3. Mapa do código

Servidor (`servidor/`, JavaScript ESM):

| Arquivo | Papel |
|---|---|
| `index.js` | Express, webhook `/webhook`, monta `/api`, serve `dist/`, liga as conexões ao atendimento |
| `rotas.js` | Todas as rotas `/api/*` (exigem sessão) |
| `acesso.js` | Contas, senhas (scrypt), sessões, papéis, 2ª etapa |
| `totp.js` | Código de 6 dígitos (TOTP) feito à mão |
| `qr.js` | Desenha QR Code (2 etapas e WhatsApp) |
| `conexoes.js` | Números de WhatsApp por QR Code (Baileys): sessões, QR, reconexão, mensagens, **sincronização inicial e sob demanda, download de mídia (foto de perfil e anexos), fila de reenvio de mídia vencida** |
| `atendimento.js` | A costura: recebe, espera, escolhe agente, responde, importa histórico |
| `claude.js` | O motor do agente: prompt em blocos (com cache), ferramentas, loop |
| `estado.js` | Única porta de entrada dos dados (cursos, agentes, conversas, mensagens, indicadores, **custo da IA**) |
| `armazenamento.js` | JSON em `dados/`, gravação atômica, cache de mensagens |
| `eventos.js` | Tempo real (SSE) |
| `whatsapp.js` | API oficial da Meta (opcional) |
| `sementes.js` | Catálogo e agentes **de demonstração** (só usados se `dados/` estiver vazio — não são mais o catálogo real, ver seção 5) |
| `config.js`, `ids.js` | `.env`, `PASTA_DADOS`, ids, **preço do Sonnet 5 por milhão de tokens** |

Interface (`src/`, React 18 + TypeScript + Vite): `App.tsx` (menu e roteamento), `estado.tsx` (loja única `useLoja`), `api.ts`, `tipos.ts`, `componentes/` (`Base.tsx`, `Icones.tsx`), `estilos/global.css`, e as telas em `telas/`: `Login`, `DoisPassos`, `Conexoes`, `Conversas`, `Painel`, **`Dashboard`** (novo nesta sessão), `Agentes`, `Cursos`, `Canal`, `Ajustes`, `Equipe`.

Dados (`dados/`): `ajustes.json`, `cursos.json`, `agentes.json`, `conversas.json` (+ `conversas/<id>.json`), `usuarios.json`, `sessoes.json`, `conexoes.json` (+ `conexoes/<id>/`, agora incluindo `fotos/` e `midia/`), `backups/`.

Menu da interface: WhatsApp → Conexões · Atendimento → Conversas, Painel · **Comercial → Dashboard** · Inteligência → Agentes, Cursos · Canal → API oficial · Ajustes.

---

## 4. Tudo o que foi feito (sessão anterior, resumida)

Nome trocado para Brotherhood Cursos em tudo; visual "Vitral" escolhido entre 10 propostas e refinado em 6 variações; login com senha + verificação em duas etapas (TOTP, QR Code, códigos de recuperação); tela **Conexões** para números de WhatsApp por QR Code (Baileys), com sincronização do histórico ao parear; correções de performance e UX. Detalhes completos no prompt anterior (se precisar, está na memória da sessão ou pergunte ao usuário).

## 5. Tudo o que foi feito nesta sessão (08/10/2026)

Em ordem:

1. **Catálogo real.** O usuário mandou o PDF oficial da escola. Os 5 cursos de demonstração foram substituídos pelos **11 cursos reais** (Reforço Escolar, Inglês Kids, Informática Padrão, Programação de Software, Especialista em IA, Designer Gráfico, Editor de Vídeos Profissional, Pré Enem Completo, Pré ETE e Escola de Aplicação, Pré Escola de Aplicação 6º ano, Isolada de Redação PMPE) e os 12 agentes correspondentes (Recepção + 1 por curso), com instruções de atendimento próprias para cada um. **O PDF não tinha preço nem carga horária de certificado** — esses campos ficaram em branco de propósito (o sistema nunca inventa preço); **o usuário ainda precisa preencher isso em Cursos**.
2. **Dashboard comercial** (tela nova, grupo "Comercial" no menu): funil de leads (novo → curioso → interessado → quer visitar → quer matricular → **matriculado** → **perdido** — as duas últimas etapas são novas, só a equipe marca, nunca a IA), matrículas por curso, lista de leads com ação rápida de marcar matrícula fechada ou perdida. Exigiu estender o modelo de dados (`lead.etapa`) e tornar a etapa editável na Ficha da conversa (antes era só texto fixo).
3. **Fotos de perfil do WhatsApp**: busca sob demanda (nunca em массa — risco de parecer automação), cache em disco por 7 dias (1 dia se não achar foto). Aparecem na lista de conversas e na conversa aberta.
4. **Ver e ouvir mídia recebida** (imagem, áudio, documento, figurinha): antes o sistema só guardava uma descrição em texto e descartava o arquivo. Agora baixa e guarda de verdade. **Bug real encontrado e corrigido**: o link de mídia do WhatsApp vence, e o Baileys sabe pedir reenvio ao celular — mas a checagem dele mesmo (`error.status`) nunca bate com o erro que ele mesmo lança (`Boom`, que só tem `.output.statusCode`), então o reenvio automático da biblioteca **nunca disparava**. Foi reimplementado à mão em `conexoes.js`. Além disso, os dados brutos de cada mídia agora ficam guardados (`*.bruta.json`) até o download dar certo, para que uma mídia que falhou se recupere sozinha a próxima vez que alguém tentar abri-la.
5. **Buscar mensagens mais antigas, por conversa** (sob demanda, um clique por vez): o WhatsApp não permite trazer o histórico completo de uma vez (testado: `syncFullHistory` derruba a conexão, código 428). A alternativa real é `sock.fetchMessageHistory` por conversa — implementado como botão dentro da conversa aberta, deliberadamente manual (clicar nas 147 de uma vez seria o mesmo tipo de rajada arriscada que o projeto já evita em outros lugares).
6. **Cache do histórico da conversa** (otimização de custo): o prompt já cacheava o catálogo e as instruções do agente, mas **nunca cacheava o histórico da conversa em si** — toda resposta pagava de novo o preço cheio por tudo que já tinha sido dito. Corrigido com `cache_control: { type: 'ephemeral' }` no nível do pedido (caching automático, recomendado pela própria documentação da Anthropic para conversas de múltiplos turnos). Testado ao vivo: 2ª mensagem de uma conversa leu ~5.700 tokens do cache em vez de pagar de novo.
7. **Custo real da IA, mostrado no Painel**: cada resposta já grava quanto gastou (entrada, saída, cache lido, cache escrito). Agora o Painel soma isso e mostra o gasto de hoje e do mês, em dólar (o que a Anthropic cobra de fato) e um "~R$" aproximado. Preço do Sonnet 5 em `config.js`.
8. **Lista de conversas redesenhada** (pedido do usuário, com referência visual de outro CRM de WhatsApp): abas de filtro maiores com ícone, número e nome, risco dourado na ativa; pontinho de estado sobreposto no avatar; selo colorido de status na linha de baixo; contador de mensagens da conversa (novo campo `totalMensagens`, incrementado a cada mensagem real — foi feito um preenchimento retroativo nas conversas que já existiam).
9. **Ficha da conversa redesenhada** (mesma referência visual): foto grande centralizada com o pontinho de estado, nome editável sem parecer caixa de formulário, telefone com bandeira 🇧🇷 e botão "Copiar número" de verdade, e **etiquetas** (o campo já existia no modelo de dados e na rota da API, só não tinha tela — agora dá para adicionar e remover).
10. **Limpeza de dados de teste**: a pedido do usuário, as 147 conversas sincronizadas (dados de teste da conexão inicial) foram apagadas, com cópia de segurança antes (`dados/backups/conversas-20261008-114126/`). **Durante essa limpeza, percebi — sem ter sido comigo — que a conexão "Comercial" tinha sido removida de verdade (logout enviado ao WhatsApp, credenciais apagadas)**, provavelmente pelo próprio usuário usando o botão Remover na tela Conexões ao mesmo tempo. Avisado a ele na hora.

---

## 6. Onde o sistema está AGORA

- **Zerado de propósito**: 0 conversas, 0 números conectados por QR Code. Os dados de teste foram apagados a pedido do usuário em 08/10 (cópia de segurança existe, ver seção 1).
- **1 pessoa cadastrada**, com 2 etapas já ativadas (login funciona).
- **Chave da Anthropic preenchida e testada funcionando de verdade** (chamada real feita e confirmada, não só formato). IA ligada, sem restrição de horário.
- **12 agentes ativos** (Recepção + 11 especialistas), com o catálogo real das 11 cursos — exceto preço e carga horária de certificado, que estão em branco.
- Verificado: `npm run verificar` passa (tipos + build) a cada mudança feita nesta sessão.
- **NÃO testado nesta sessão**: troca de mensagem de verdade com o número reconectado (a conexão foi removida antes de testar ao vivo o fluxo completo "lead novo → IA responde" com WhatsApp real — só foi testado por fora, chamando o modelo diretamente).

---

## 7. Decisões e limites que você precisa respeitar

Tudo que já estava no prompt anterior continua valendo (não ligar `syncFullHistory`, risco de a API não oficial restringir o número, segredo do TOTP em claro em `usuarios.json`, `dados/` é sensível, falta HTTPS/proxy reverso para publicar). Além disso, desta sessão:

- **O bug do reenvio de mídia do Baileys** (seção 5, item 4) é uma característica da versão instalada da biblioteca, não do nosso código agora — mas se um dia atualizar o `@whiskeysockets/baileys`, confira se `downloadMediaMessage`'s `ctx.reuploadRequest` passou a funcionar sozinho antes de manter a correção manual.
- **Mídia só funciona daqui para frente.** Qualquer imagem/áudio/documento/figurinha de antes desta sessão não tem como ser recuperada (nunca foi baixada).
- **"Buscar mensagens mais antigas" é por conversa, sob clique.** Nunca automatize isso para todas as conversas de uma vez — é exatamente o tipo de rajada de pedidos que o projeto evita desde o início.
- **O cache do histórico da conversa depende de o prefixo não mudar.** Se um dia alguém reescrever mensagens antigas, inserir timestamp dinâmico no meio do histórico, ou mudar `thinking`/`effort` por conversa, o cache quebra silenciosamente — `cache_read_input_tokens` voltando a zero é o sinal.
- **O cálculo de custo no Painel assume Sonnet 5.** Se o modelo mudar, atualizar `PRECO_SONNET_5_USD_POR_MILHAO` em `config.js`.
- **Etiquetas (`conversa.etiquetas`) e etapas de lead são editadas por gente, não pela IA.** A ferramenta `registrar_interesse` do agente só alcança até `quer_matricular`; `matriculado` e `perdido` só existem na tela.

---

## 8. Convenções (siga-as)

Iguais ao prompt anterior: português do Brasil em tudo, ESM sem ponto e vírgula, aspas simples, 2 espaços, vírgula final; dados só entram e saem por `estado.js`; interface com uma loja só (`useLoja`); cores só por tokens CSS; `npm run verificar` antes de dizer que terminou; reiniciar o servidor manualmente depois de mexer em `servidor/`; comandos de shell grandes vão em arquivo, não na linha de comando.

---

## 9. Como o usuário prefere trabalhar

Confirmado de novo nesta sessão: escreve curto, direto, em português. **Decide muito bem olhando referência visual de verdade** — várias vezes nesta sessão ele mandou print de outro aplicativo (um CRM de WhatsApp) e pediu "deixa parecido com isso". Quando a referência tem elementos que não existem no nosso domínio (ex.: aba "Grupos" quando o sistema nunca mostra grupo, ou "Pago · Facebook" quando não há rastreamento de origem paga), a abordagem que funcionou foi: implementar o que é real e explicar depois, numa frase, o que ficou de fora e por quê — sem preciser perguntar antes.

Para ações arriscadas de verdade (apagar dados em massa, mexer na conexão de WhatsApp real), ele é direto ("pode apagar") — mas vale a pena, mesmo assim, fazer cópia de segurança sem perguntar (é reversível e barato) e avisar depois o que foi feito.

---

## 10. O que está em aberto

Para o usuário fazer:
1. **Reconectar o número** em Conexões (QR novo — a conexão anterior foi removida).
2. **Preencher preço e carga horária de certificado** dos 11 cursos reais (o PDF não trazia isso).
3. Testar de ponta a ponta com WhatsApp real: mandar mensagem de outro celular e confirmar que a Recepção responde sozinha.

Perguntas/decisões ainda sem resposta:
- Gravar e enviar áudio pela tela — ainda não construído (o usuário pediu, decidiu adiar).
- Transcrever áudio recebido — precisa de um serviço de fala-para-texto à parte (a Anthropic não faz isso); o usuário decidiu deixar de fora por enquanto.
- Uma aba de "anexos" dedicada na Ficha da conversa (imagens/áudios/documentos daquela conversa, juntos) — mencionado como possível próximo passo, não pedido ainda.
- Manter ou remover a tela "API oficial" (Meta) — pergunta antiga, ainda sem resposta.

Seu primeiro passo: leia o `README.md`, confira `servidor/conexoes.js` e `servidor/claude.js` para ver o estilo, e pergunte ao usuário o que ele quer fazer agora.
