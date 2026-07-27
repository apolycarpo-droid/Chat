# Plano de Construção — App de Chat para Comunidades Fechadas de Alunos

**Objetivo:** mensagens estilo iMessage + chamadas de vídeo estilo FaceTime + moderação por IA, para comunidades fechadas de alunos, rodando em Android e iPad, com **custo R$ 0** e desenvolvimento feito inteiramente com o Claude.

---

## 1. A decisão mais importante: PWA em vez de app nativo

O plano original sugeria Flutter/React Native. Para custo zero, a recomendação muda: **comece com um PWA (Progressive Web App)**.

| Critério | App nativo (Flutter) | PWA (Web App) |
|---|---|---|
| Publicar no iPad | US$ 99/ano (Apple Developer) | R$ 0 — abre no Safari, "Adicionar à Tela de Início" |
| Publicar no Android | US$ 25 (Play Store) | R$ 0 — abre no Chrome, instala como app |
| Um código só | Sim | Sim |
| Chamadas WebRTC | Sim | Sim (Safari e Chrome suportam) |
| Notificações push | Sim | Sim no Android; no iPad funciona a partir do iPadOS 16.4 (app adicionado à tela de início) |

O único custo real e inevitável de um app nativo seria a taxa da Apple. O PWA elimina isso. Se um dia o projeto crescer e justificar loja de aplicativos, o backend continua o mesmo e só o front é portado (fase futura).

---

## 2. Stack recomendada (tudo em camada gratuita)

| Camada | Tecnologia | Custo | Por quê |
|---|---|---|---|
| Front-end | **React + Vite (PWA)** com TypeScript | R$ 0 | Um código para Android e iPad; enorme suporte do Claude para gerar código |
| Hospedagem do front | **Cloudflare Pages** (ou Vercel) | R$ 0 | Deploy automático a partir do GitHub, HTTPS incluso |
| Backend completo | **Supabase (plano Free)** | R$ 0 | Postgres + Auth + Realtime (WebSocket) + Storage + Edge Functions em um só serviço |
| Mensagens em tempo real | **Supabase Realtime** | R$ 0 | Substitui servidor WebSocket próprio; entrega instantânea |
| Login | **Supabase Auth** — Google + e-mail com link mágico | R$ 0 | "Entrar com Apple" exige conta Apple Developer (US$ 99/ano) → evitado; alunos usam Google ou e-mail em ambos os aparelhos |
| Chamadas de vídeo | **Jitsi Meet embutido** (`meet.jit.si`) na fase 1; LiveKit Cloud free tier como evolução | R$ 0 | Vídeo em grupo pronto, sem servidor de mídia próprio, sem TURN pago |
| Moderação de texto (camada 1) | Lista de palavras + regex **na Edge Function** | R$ 0 | Bloqueio instantâneo, sem chamada externa |
| Moderação de texto e imagem (camada 2) | **OpenAI Moderation API** (`omni-moderation-latest`) | R$ 0 | A API de moderação da OpenAI é **gratuita** e cobre texto e imagem (ódio, assédio, sexual, violência, automutilação) |
| Análise de contexto (camada 3, opcional) | **Google Gemini — cota gratuita do AI Studio** | R$ 0 | Para casos ambíguos (sarcasmo, bullying velado), dentro da cota diária gratuita |

**Custo mensal total do MVP: R$ 0.** Limites relevantes do Supabase Free: 500 MB de banco, 1 GB de storage, 200 conexões realtime simultâneas — suficiente para uma ou algumas turmas de alunos.

---

## 3. Arquitetura

```
[PWA no Android/iPad]
   │  HTTPS / WebSocket
   ▼
[Supabase]
   ├─ Auth (Google / link mágico)
   ├─ Postgres + RLS  ← regras de acesso por comunidade
   ├─ Realtime        ← entrega das mensagens
   ├─ Storage         ← fotos e arquivos
   └─ Edge Function "enviar-mensagem"
        1. valida sessão e participação na comunidade
        2. camada 1: wordlist/regex (bloqueio imediato de palavras banidas,
           links maliciosos e padrões de dados pessoais — CPF, telefone → LGPD)
        3. camada 2: OpenAI Moderation API (grátis) → pontuação por categoria
        4. decide: ENVIAR | ENVIAR BORRADA (aviso "esta mensagem pode violar
           as regras") | BLOQUEAR | registrar STRIKE do usuário
        5. grava no Postgres → Realtime empurra para os participantes

[Chamadas]  botão "Vídeo" na conversa → sala Jitsi embutida (iframe),
            nome da sala = ID secreto da conversa
```

**Ponto essencial do desenho:** o cliente **nunca grava mensagem direto no banco**. Toda mensagem passa pela Edge Function, que é onde a moderação mora. O RLS (Row Level Security) do Postgres garante que só membros da comunidade leem as mensagens dela.

### Modelo de dados (mínimo)

- `profiles` — id, nome, avatar, strikes
- `communities` — id, nome, dono
- `invites` — código, community_id, expira_em, usos_restantes (gera link + QR Code no cliente)
- `members` — community_id, user_id, papel (admin/aluno)
- `conversations` — community_id, tipo (grupo/direta)
- `messages` — conversation_id, autor, conteúdo, status_moderacao (ok/borrada/bloqueada), categorias_ia
- `moderation_events` — mensagem, categoria, score, ação tomada (alimenta o painel do admin)

---

## 4. Moderação por IA — regras de decisão

| Situação | Ação |
|---|---|
| Palavra banida / link malicioso / dado pessoal (CPF, telefone, endereço) | **Bloqueia antes de enviar** e explica o motivo ao autor |
| Score alto na Moderation API (ódio, assédio, sexual, violência) | **Bloqueia** + registra strike |
| Score médio / ambíguo | **Envia borrada** com aviso "Esta mensagem pode violar as regras. Deseja ver?" |
| Imagem reprovada pela Moderation API (multimodal) | **Bloqueia o upload** |
| 3 strikes em 7 dias | **Alerta automático ao admin** da comunidade (painel + e-mail), com histórico para decidir suspensão/banimento |

Por ser um app de **alunos**, os thresholds devem começar conservadores (bloquear mais) e ser ajustados com o uso. Casos ambíguos podem, na camada 3, ser reavaliados pelo Gemini (cota grátis) com o contexto das últimas mensagens.

**Transparência obrigatória:** a tela de entrada da comunidade deve avisar que as mensagens são analisadas por IA para segurança. Sem criptografia de ponta a ponta (incompatível com moderação no servidor), mas com criptografia em trânsito (HTTPS) e em repouso (padrão do Supabase).

---

## 5. Fases de desenvolvimento (todas com o Claude)

### Fase 1 — Chat funcional (1ª semana de sessões)
1. Criar projeto Supabase (grátis, pelo site) e o projeto React + Vite neste repositório.
2. Login com Google e link mágico por e-mail.
3. Tabelas + RLS; criar comunidade; entrar por link de convite com validade.
4. Conversa em grupo com Realtime: enviar/receber mensagens instantâneas, indicador de "digitando", recibos de leitura simples.
5. Deploy no Cloudflare Pages → já testável no Android e no iPad.

### Fase 2 — Moderação (2ª semana)
6. Edge Function `enviar-mensagem` com as camadas 1 e 2 (wordlist + OpenAI Moderation API).
7. UI de mensagem borrada com "Deseja ver?"; strikes; painel do admin com `moderation_events`.
8. Upload de imagens com moderação antes de publicar.

### Fase 3 — Vídeo (3ª semana)
9. Botão de chamada → Jitsi embutido na conversa (grupo ou 1:1). Zero infraestrutura.
10. Sinalização de "chamada em andamento" via Realtime (banner na conversa).

### Fase 4 — Polimento
11. PWA completo: ícone, instalação na tela de início, notificações push (Android já; iPad via app instalado).
12. Identidade visual minimalista estilo iMessage (bolhas, animações suaves) — usuários de iPad são exigentes com design.
13. Ajuste fino dos thresholds de moderação com dados reais; camada 3 (Gemini) se necessário.

**Evoluções futuras (só se houver demanda):** LiveKit Cloud para chamadas maiores/mais robustas; app Flutter nas lojas; plano pago do Supabase (US$ 25/mês) se a comunidade passar dos limites gratuitos.

---

## 6. O que você precisa criar (contas, tudo grátis)

1. Conta no [Supabase](https://supabase.com) → novo projeto (plano Free).
2. Conta no [Cloudflare Pages](https://pages.cloudflare.com) (ou Vercel) conectada a este repositório GitHub.
3. Chave de API da OpenAI (a Moderation API não é cobrada; a chave é necessária, sem custo de uso para esse endpoint).
4. (Opcional, fase 3 de moderação) Chave gratuita no [Google AI Studio](https://aistudio.google.com).
5. Credencial OAuth do Google (gratuita, no Google Cloud Console) para o "Entrar com Google".

As chaves ficam **somente** em variáveis de ambiente do Supabase (Edge Functions) — nunca no código do front.

---

## 7. Riscos e limites conhecidos

- **Limites do free tier:** 200 conexões realtime simultâneas e 500 MB de banco. Para turmas de escola, sobra; para milhares de usuários, não. Monitorar no painel do Supabase.
- **Notificações no iPad** só funcionam com o PWA adicionado à tela de início (iPadOS 16.4+). Documentar isso no onboarding.
- **Jitsi público (meet.jit.si)** é gratuito e estável, mas as salas são de terceiros; usar nomes de sala longos e aleatórios. Evolução natural: LiveKit Cloud.
- **Menores de idade:** se os alunos forem menores, é preciso consentimento dos responsáveis e política de privacidade clara (LGPD, art. 14). A moderação por IA ajuda, mas não substitui um admin humano responsável.
- **Moderação nunca é perfeita:** manter botão "denunciar mensagem" para revisão humana pelo admin.
