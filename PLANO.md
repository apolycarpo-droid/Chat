# Plano de Construção — App de Chat para Comunidade de Alunos

**Objetivo:** um app de mensagens (estilo iMessage) com chamadas de vídeo (estilo FaceTime) e moderação por IA, para uma comunidade fechada de alunos, funcionando em Android e iPad.

**Restrições que guiam todas as decisões deste plano:**

1. **Custo zero** (ou o mais próximo possível disso).
2. **Uma pessoa só desenvolvendo, com o Claude** — sem equipe técnica.
3. **Simplicidade acima de tudo** — cada tecnologia a mais é uma coisa a mais para quebrar e manter.

---

## 1. A decisão mais importante: PWA, não app nativo

O plano original (Flutter/React Native) esbarra em dois custos escondidos:

| Item | Custo |
|---|---|
| Conta Apple Developer (obrigatória para publicar no iPad) | US$ 99/ano |
| Conta Google Play | US$ 25 (única vez) |
| Manter dois builds nativos, revisões de loja, certificados | Muito tempo de uma pessoa só |

A alternativa que zera isso: um **PWA (Progressive Web App)** — um site que se instala como aplicativo.

- No iPad: Safari → Compartilhar → "Adicionar à Tela de Início". Abre em tela cheia, com ícone, como um app normal. Notificações push funcionam no iPadOS 16.4+.
- No Android: Chrome oferece "Instalar app" automaticamente.
- **Um único código**, sem lojas, sem taxas, atualização instantânea (basta publicar — todo mundo recebe na hora).
- WebRTC (vídeo) funciona nativamente no navegador dos dois sistemas.

Para uma comunidade fechada de alunos, onde você controla quem entra e pode mandar o link de instalação, a loja de aplicativos não agrega nada — só custo.

> **Se um dia** o app crescer e valer a pena estar nas lojas, o mesmo código web pode ser empacotado (Capacitor) sem reescrever nada.

## 2. Stack final (tudo em camada gratuita)

O princípio: **não construir infraestrutura — alugar de graça.** Nada de gerenciar servidor próprio, Redis, WebSocket na mão ou SFU própria.

| Camada | Tecnologia | Por quê | Custo |
|---|---|---|---|
| Front-end | **React + Vite + Tailwind** (PWA) | Ecossistema onde o Claude é mais produtivo; visual limpo estilo iMessage é fácil de alcançar | R$ 0 |
| Hospedagem do front | **Vercel** ou **Netlify** (plano free) | Deploy automático a cada push no GitHub | R$ 0 |
| Backend + Banco + Tempo real | **Supabase (plano free)** | Resolve de uma vez: PostgreSQL, autenticação, **Realtime (mensagens instantâneas via WebSocket já pronto)**, armazenamento de arquivos e Edge Functions | R$ 0 até 500 MB de banco e 50 mil usuários ativos/mês |
| Login | **Google OAuth + link mágico por e-mail** (via Supabase Auth) | Login Google cobre Android; link por e-mail cobre iPad. *"Entrar com Apple" fica de fora de propósito: exige a conta paga de desenvolvedor Apple* | R$ 0 |
| Vídeo/áudio 1-a-1 | **WebRTC ponto-a-ponto** (sinalização pelo Supabase Realtime, STUN público do Google) | Ligação direta entre os dois aparelhos — servidor não processa mídia | R$ 0 |
| Vídeo em grupo | **Jitsi Meet embutido** (iframe do meet.jit.si) ou **LiveKit Cloud free** | Montar SFU própria (Mediasoup/Janus) exige servidor pago e manutenção. O Jitsi público é gratuito e ilimitado | R$ 0 |
| Moderação de texto e imagem | **API de Moderação da OpenAI** (`omni-moderation-latest`) — **ela é gratuita** — + filtro local de palavras | Detecta ódio, assédio, sexual, violência, automutilação, em PT-BR, texto **e imagem**, sem pagar nada | R$ 0 |
| Moderação "fina" (sarcasmo, bullying velado) | **Claude Haiku via API**, chamado só quando a mensagem for sinalizada como "suspeita" | Camada cara fica reservada aos poucos casos ambíguos | ~centavos/mês nesse volume |

**Custo mensal total estimado do MVP: R$ 0** (mais alguns centavos de API de IA se ativar a camada fina). Único custo real opcional: um domínio próprio (~R$ 40/ano) — dá para começar sem, usando o subdomínio gratuito da Vercel.

### O que foi cortado do plano original, e por quê

- **Flutter/React Native** → PWA (corta as taxas de loja e metade da complexidade).
- **gRPC, Redis, servidor WebSocket próprio** → Supabase Realtime já entrega mensagens instantâneas prontas.
- **Mediasoup/Janus/SFU própria** → Jitsi público (grupo) + WebRTC P2P (1-a-1).
- **Amazon Rekognition / Google Vision** → a moderação da OpenAI já analisa imagens de graça.
- **GPT-4o mini para toda mensagem** → só o endpoint de moderação (gratuito) em toda mensagem; LLM pago apenas nos casos ambíguos.

## 3. Arquitetura da moderação por IA

Fluxo de cada mensagem (tudo roda numa **Edge Function do Supabase** — a mensagem só entra no banco depois de aprovada):

```
Aluno envia mensagem
   │
   ▼
[1] Filtro local (lista de palavras + regex de links/telefone/CPF)  → instantâneo, custo zero
   │  reprovou? → bloqueia antes de enviar (caso LGPD/link malicioso)
   ▼
[2] API de Moderação OpenAI (gratuita, ~200ms)                      → texto e imagens
   │  score alto?  → mensagem entra BORRADA + aviso "Esta mensagem pode violar as regras"
   │  score médio? → vai para [3]
   ▼
[3] Claude Haiku analisa contexto (sarcasmo, bullying velado)       → só ~1-5% das mensagens
   │
   ▼
[4] Registro por usuário: 3 sinalizações em 7 dias → alerta automático no painel do administrador
```

Os três níveis de intervenção do plano original ficam assim:

1. **Aviso prévio:** mensagem tóxica entra borrada; quem quiser vê tocando em "ver mesmo assim". O autor recebe o aviso.
2. **Bloqueio automático:** dados pessoais (telefone, CPF, endereço) e links fora de uma lista de domínios permitidos são barrados **antes** do envio — importante por ser público menor de idade (LGPD).
3. **Alerta ao administrador:** reincidência gera notificação para você (dono da comunidade) silenciar ou banir.

**Transparência obrigatória:** como a moderação exige ler as mensagens no servidor, não há criptografia de ponta a ponta — e isso deve estar escrito de forma clara nos termos de uso e na tela de entrada ("as mensagens são analisadas por IA para segurança da comunidade"). Os dados ficam criptografados em repouso (o Supabase já faz isso por padrão).

## 4. Comunidade fechada

- **Entrada só por convite:** link com token de validade (ex.: 48h) gerado pelo administrador, ou QR Code apontando para esse link. Uma tabela `convites` no banco resolve; QR Code é gerado no próprio front (biblioteca `qrcode`, gratuita).
- **Papéis:** `admin` (você) e `aluno`. Row Level Security do Postgres/Supabase garante que cada um só lê os canais de que participa — a segurança fica no banco, não confiando no app.
- **LGPD com menores:** coletar o mínimo (nome + e-mail), termo de consentimento dos responsáveis no cadastro, botão "excluir minha conta e meus dados".

## 5. Fases de construção (cada fase = um pedido ao Claude)

A regra: **cada fase termina com algo funcionando no ar** que você testa no seu Android e no iPad antes de seguir.

### Fase 0 — Fundação (1 sessão)
Criar o projeto React+Vite, conectar ao Supabase, publicar na Vercel, manifest de PWA (instalável). *Teste: abrir e instalar o "app" vazio nos dois aparelhos.*

### Fase 1 — Login e convites (1–2 sessões)
Login Google + link mágico; tabela de usuários; link/QR de convite com validade; tela de admin mínima. *Teste: convidar uma conta secundária.*

### Fase 2 — Chat em tempo real (2–3 sessões)
Canais/grupos, mensagens com Supabase Realtime, visual estilo iMessage (balões, "digitando…", confirmação de leitura), envio de imagens. *Este é o coração do app.*

### Fase 3 — Moderação por IA (2 sessões)
Edge Function com o pipeline da seção 3: filtro local → OpenAI moderation → borrão/bloqueio → painel de sinalizações para o admin. *Teste: mandar mensagens tóxicas de propósito e ver o borrão/bloqueio.*

### Fase 4 — Chamadas de vídeo (2 sessões)
1-a-1 com WebRTC (sinalização via Supabase Realtime); botão de chamada em grupo abrindo sala Jitsi embutida. *Teste: Android ↔ iPad em redes diferentes (4G vs Wi-Fi).*

### Fase 5 — Acabamento (1–2 sessões)
Notificações push (Web Push), tela de regras/consentimento, modo escuro, exclusão de conta, moderação de imagens.

**Total realista: 3 a 6 semanas** trabalhando algumas horas por dia com o Claude, com o MVP de chat moderado (fases 0–3) pronto em ~2 semanas.

## 6. Como trabalhar com o Claude sem ser programador

- **Uma fase por vez, um problema por vez.** Pedidos pequenos e testáveis ("adicione confirmação de leitura") funcionam muito melhor que "faça o app inteiro".
- **Sempre pelo GitHub:** cada mudança vira um commit; a Vercel publica sozinha. Se algo quebrar, é só voltar ao commit anterior — você nunca perde uma versão que funcionava.
- **Você é o testador:** depois de cada fase, use o app de verdade nos dois aparelhos e traga ao Claude o que viu ("no iPad o teclado cobre o campo de texto"). Erros no console do navegador (F12) colados na conversa aceleram muito o conserto.
- **Peça explicações:** "explique o que esse código faz como se eu não fosse programador" — assim você entende o próprio produto.

## 7. Limites do plano gratuito (quando isso deixa de bastar)

| Recurso free | Limite | Suficiente para |
|---|---|---|
| Supabase banco | 500 MB | Dezenas de milhares de mensagens de texto |
| Supabase storage | 1 GB | Fotos com compressão no envio (fazer sempre) |
| Supabase usuários ativos | 50.000/mês | Qualquer turma/escola |
| Vercel banda | 100 GB/mês | Milhares de acessos |
| Jitsi público | Ilimitado | Chamadas em grupo da comunidade |
| Moderação OpenAI | Gratuita (limite de requisições/min generoso) | Todo o volume de mensagens esperado |

Ponto de atenção: o projeto free do Supabase **pausa após 7 dias sem uso** — basta um acesso para reativar, e com a comunidade ativa isso não acontece. Se um dia estourar os limites, o degrau seguinte é o plano Pro do Supabase (US$ 25/mês) — mas para uma comunidade de alunos de uma escola, o free tende a durar muito tempo.

---

## Resumo executivo

- **PWA em React + Supabase + Jitsi + moderação gratuita da OpenAI = app completo com custo mensal de R$ 0.**
- Corta-se tudo que exige servidor próprio ou taxa de loja; a única troca consciente é não ter criptografia de ponta a ponta (incompatível com moderação por IA no servidor) — compensada com transparência e criptografia em repouso.
- Construção em 6 fases incrementais, cada uma testável no Android e no iPad, todas conduzidas com o Claude a partir deste repositório.

**Próximo passo:** iniciar a Fase 0 — basta pedir: *"Claude, execute a Fase 0 do PLANO.md"*.
