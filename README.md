# Turma 💬 — Chat da comunidade de alunos

App de mensagens estilo iMessage com chamadas de vídeo e **moderação por Inteligência Artificial**, feito para rodar com **custo mensal R$ 0**. Funciona no Android e no iPad como aplicativo instalável (PWA) — sem loja de aplicativos, sem taxas.

> O raciocínio por trás de cada escolha técnica está no [PLANO.md](./PLANO.md).

## O que já está pronto

- ✅ Login com Google ou link mágico por e-mail (Supabase Auth)
- ✅ Comunidade fechada: entrada só por convite (link com validade de 48h + QR Code)
- ✅ Chat em tempo real com visual estilo iMessage: balões, "digitando…", confirmação de leitura, envio de fotos (com compressão automática)
- ✅ Moderação por IA em 3 camadas, **antes** de cada mensagem entrar:
  1. Filtro local instantâneo — bloqueia CPF/telefone (LGPD) e links não permitidos; sinaliza palavrões
  2. API de Moderação da OpenAI (**gratuita**) — ódio, assédio, sexual, violência, em texto **e** imagem
  3. Claude Haiku — analisa contexto (sarcasmo, bullying velado) só nos casos ambíguos
- ✅ Níveis de intervenção: mensagem borrada com aviso ("ver mesmo assim"), bloqueio antes do envio e alerta ao admin quando alguém acumula 3+ sinalizações em 7 dias
- ✅ Botão 🚩 **denunciar** em qualquer mensagem — porque IA não é perfeita, membros podem pedir revisão humana e as denúncias aparecem no painel do admin
- ✅ Chamada de vídeo 1-a-1 (WebRTC ponto-a-ponto, sem servidor de mídia) e em grupo (Jitsi Meet gratuito)
- ✅ Painel do administrador: convites, sinalizações, banir/desbanir
- ✅ Tela de regras com consentimento do responsável, exclusão de conta e dados (LGPD), modo escuro automático
- ✅ O **primeiro usuário** que se cadastrar vira administrador automaticamente

---

## Como colocar no ar (uma única vez, ~30 minutos)

Você vai criar 2 contas gratuitas (Supabase e Vercel). Nenhuma pede cartão de crédito.

### Passo 1 — Criar o banco de dados (Supabase)

1. Acesse [supabase.com](https://supabase.com) → **Start your project** → entre com GitHub.
2. **New project** → escolha um nome (ex.: `turma`) e uma senha de banco (guarde-a) → região `South America (São Paulo)` → **Create**.
3. No menu lateral, abra **SQL Editor** → **New query** → cole TODO o conteúdo do arquivo [`supabase/migrations/001_init.sql`](./supabase/migrations/001_init.sql) → **Run**. Deve aparecer "Success".
4. Em **Authentication → Sign In / Up → Auth Providers**:
   - **Email** já vem ativado (o link mágico usa ele).
   - **Google**: siga o guia do próprio painel para criar as credenciais no Google Cloud (gratuito) e cole o Client ID/Secret. *Se quiser adiar, o login por e-mail já basta para testar.*
5. Em **Authentication → URL Configuration**, depois do Passo 3, adicione a URL do seu app (ex.: `https://turma.vercel.app`) em **Site URL** e **Redirect URLs**.
6. Anote em **Project Settings → API**: a **Project URL** e a chave **anon public** (vai usar no Passo 3).

### Passo 2 — Publicar a função de moderação

A moderação roda numa Edge Function do Supabase. No seu computador (ou peça ao Claude):

```bash
npx supabase login                       # abre o navegador para autorizar
npx supabase link --project-ref SEU_REF  # o "ref" aparece na URL do painel
npx supabase functions deploy send-message
```

Depois configure as chaves de IA (em **Edge Functions → send-message → Secrets**, ou via CLI):

```bash
# Camada 2 — moderação gratuita da OpenAI (crie a chave em platform.openai.com)
npx supabase secrets set OPENAI_API_KEY=sk-...

# Camada 3 (opcional) — Claude para casos ambíguos (console.anthropic.com)
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

> Sem as chaves o app continua funcionando: a camada 1 (filtro local) sempre roda. As camadas 2 e 3 ligam sozinhas quando as chaves existirem.

### Passo 3 — Publicar o app (Vercel)

1. Acesse [vercel.com](https://vercel.com) → entre com GitHub → **Add New → Project** → importe este repositório.
2. Em **Environment Variables**, adicione (valores do Passo 1.6):
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chave anon public
3. **Deploy**. Em ~1 minuto o app estará no ar em `https://SEU-PROJETO.vercel.app`.
4. Volte ao Passo 1.5 e cadastre essa URL no Supabase.

> Alternativa igualmente gratuita: **Cloudflare Pages** — mesmo fluxo (importar o repositório e definir as duas variáveis), comando de build `npm run build`, pasta de saída `dist`.

### Passo 4 — Você é o admin

1. Abra o app e **cadastre-se primeiro**: o primeiro usuário vira administrador.
2. Aceite as regras → toque em **Admin** → **Gerar convite**.
3. Envie o link (ou mostre o QR Code) para cada aluno. O convite vale 48h e só funciona uma vez.

### Instalar como aplicativo

- **iPad**: abra o link no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**.
- **Android**: abra no **Chrome** → aparece o aviso **Instalar app** (ou menu ⋮ → Instalar).

---

## Rodando no seu computador (desenvolvimento)

```bash
cp .env.example .env   # preencha com a URL e a chave anon do Supabase
npm install
npm run dev            # abre em http://localhost:5173
```

## Limites e avisos honestos

- **Plano free do Supabase**: 500 MB de banco, 1 GB de fotos, 50 mil usuários ativos/mês — e o projeto **pausa após 7 dias sem uso** (basta acessar para reativar).
- **Chamada 1-a-1** conecta quando os dois estão com a conversa aberta (é assim que o "toque de chamada" chega). Em redes muito restritivas (alguns 4G corporativos), a conexão direta P2P pode falhar — nesse caso, use a chamada em grupo (Jitsi), que sempre funciona.
- **Notificações** funcionam com o app aberto em segundo plano. Push "de verdade" com o app fechado (Web Push + service worker) é uma evolução futura.
- **Privacidade**: não há criptografia de ponta a ponta — é o que permite a moderação por IA no servidor. Isso está declarado na tela de regras, e os dados ficam criptografados em repouso no Supabase.
- O filtro local de telefone/CPF pode ocasionalmente marcar sequências numéricas parecidas — ajuste as expressões em `supabase/functions/send-message/index.ts` se incomodar.

## Estrutura do projeto

```
src/                      # aplicativo (React + Vite + Tailwind, PWA)
  pages/                  # telas: login, regras, chat, admin…
  components/             # balões, composer, chamadas de vídeo…
supabase/
  migrations/001_init.sql # banco completo: tabelas, segurança (RLS), funções
  functions/send-message/ # Edge Function com o pipeline de moderação por IA
scripts/gen-icons.mjs     # gera os ícones do PWA (npm run icons)
```
