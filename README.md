# Chat — Comunidades Fechadas de Alunos

App de mensagens (estilo iMessage) com chamadas de vídeo (estilo FaceTime) e moderação por IA, para comunidades fechadas de alunos, em Android e iPad.

📋 **[Plano de construção completo → PLANO.md](PLANO.md)**

Resumo da abordagem escolhida (custo R$ 0):

- **PWA** em React + Vite (um código para Android e iPad, sem taxas de loja)
- **Supabase Free** (auth, banco Postgres, mensagens em tempo real, storage, edge functions)
- **Moderação em camadas**: wordlist local → OpenAI Moderation API (gratuita) → Gemini (cota grátis) para casos ambíguos
- **Vídeo** via Jitsi Meet embutido (sem servidor de mídia próprio)
- **Hospedagem** no Cloudflare Pages (deploy automático deste repositório)
