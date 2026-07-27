// ============================================================
// TURMA — Edge Function "send-message"
// Toda mensagem passa por aqui antes de entrar no banco.
// Pipeline de moderação em 3 camadas:
//   1. Filtro local (instantâneo, custo zero): dados pessoais,
//      links fora da lista permitida e palavras proibidas.
//   2. API de Moderação da OpenAI (gratuita): ódio, assédio,
//      sexual, violência, automutilação — em texto E imagem.
//   3. Claude Haiku (opcional, centavos): só para os casos
//      ambíguos que a camada 2 marcou como "suspeitos".
// Resultado: mensagem entra normal, entra BORRADA (flagged),
// ou é BLOQUEADA antes de entrar (com registro para o admin).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Camada 1: filtro local ----------
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE_RE = /(\+55\s?)?\(?\d{2}\)?\s?9\s?\d{4}[-\s]?\d{4}\b/;
const URL_RE = /https?:\/\/[^\s]+/gi;
const ALLOWED_DOMAINS = [
  "youtube.com", "youtu.be", "wikipedia.org",
  "docs.google.com", "drive.google.com", "classroom.google.com",
  "gov.br", "edu.br", "khanacademy.org",
];
// Palavras que a IA nem precisa analisar — sinalização imediata.
const BLOCKLIST = [
  "vagabunda", "viado", "bicha", "macaco", "crioulo", "retardado",
  "vai se matar", "se mata", "corno", "arrombado", "desgraçado",
  "fdp", "filho da puta", "puta que pariu", "vsf", "krl", "caralho",
  "porra", "buceta", "piroca", "cuzão", "otário burro",
];

function localCheck(text: string): { action: "ok" | "block" | "flag"; reason?: string } {
  if (CPF_RE.test(text)) return { action: "block", reason: "Compartilhamento de CPF não é permitido (proteção de dados)" };
  if (PHONE_RE.test(text)) return { action: "block", reason: "Compartilhamento de telefone não é permitido (proteção de dados)" };
  for (const m of text.match(URL_RE) ?? []) {
    let host = "";
    try { host = new URL(m).hostname.toLowerCase(); } catch { /* url malformada */ }
    const allowed = ALLOWED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
    if (!allowed) return { action: "block", reason: "Links externos não são permitidos nesta comunidade" };
  }
  const lower = " " + text.toLowerCase() + " ";
  for (const w of BLOCKLIST) {
    if (lower.includes(" " + w + " ") || lower.includes(w + ",") || lower.includes(w + ".") || lower.includes(w + "!")) {
      return { action: "flag", reason: "Linguagem ofensiva detectada" };
    }
  }
  return { action: "ok" };
}

// ---------- Camada 2: OpenAI Moderation (endpoint gratuito) ----------
async function openaiModeration(text: string, imageUrl?: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null; // sem chave configurada: pula esta camada
  const input: unknown[] = [];
  if (text) input.push({ type: "text", text });
  if (imageUrl) input.push({ type: "image_url", image_url: { url: imageUrl } });
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });
  if (!res.ok) {
    console.error("OpenAI moderation falhou:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.results?.[0] ?? null;
}

const CATEGORY_LABELS: Record<string, string> = {
  harassment: "assédio",
  "harassment/threatening": "ameaça",
  hate: "discurso de ódio",
  "hate/threatening": "discurso de ódio com ameaça",
  sexual: "conteúdo sexual",
  "sexual/minors": "conteúdo sexual envolvendo menores",
  violence: "violência",
  "violence/graphic": "violência gráfica",
  "self-harm": "automutilação",
  "self-harm/intent": "automutilação",
  "self-harm/instructions": "automutilação",
  illicit: "atividade ilícita",
  "illicit/violent": "atividade ilícita violenta",
};

// ---------- Camada 3: Claude Haiku para contexto (sarcasmo, bullying velado) ----------
async function claudeCheck(text: string): Promise<{ violacao: boolean; motivo?: string } | null> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return null;
  try {
    const anthropic = new Anthropic({ apiKey: key });
    // Haiku é o modelo definido no PLANO.md para esta camada: mais barato,
    // suficiente para classificar poucas mensagens ambíguas por dia.
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system:
        "Você modera um chat escolar de alunos no Brasil. Analise se a mensagem contém " +
        "bullying (mesmo velado ou sarcástico), assédio, humilhação ou exclusão de colegas. " +
        "Brincadeiras claramente amistosas entre amigos NÃO são violação. " +
        'Responda APENAS com JSON: {"violacao": true|false, "motivo": "explicação curta em português"}',
      messages: [{ role: "user", content: `Mensagem a analisar: "${text}"` }],
    });
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const json = block.text.match(/\{[\s\S]*\}/);
    return json ? JSON.parse(json[0]) : null;
  } catch (e) {
    console.error("Claude check falhou:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const jsonHeaders = { ...CORS, "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  try {
    const { channel_id, content = "", image_url = null } = await req.json();
    if (!channel_id || (!content.trim() && !image_url)) {
      return reply({ error: "mensagem vazia" }, 400);
    }
    if (content.length > 4000) return reply({ error: "mensagem longa demais" }, 400);

    // Quem está enviando? (valida o token JWT do usuário)
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return reply({ error: "não autenticado" }, 401);

    // Cliente com poderes de servidor (só ele pode inserir mensagens)
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Permissões: perfil aprovado, não banido e membro do canal
    const { data: profile } = await db.from("profiles")
      .select("approved, banned").eq("id", user.id).single();
    if (!profile?.approved || profile.banned) return reply({ error: "sem permissão" }, 403);
    const { data: member } = await db.from("channel_members")
      .select("user_id").eq("channel_id", channel_id).eq("user_id", user.id).maybeSingle();
    if (!member) return reply({ error: "você não participa deste canal" }, 403);

    const registerStrike = async (reason: string, blocked: boolean, messageId: string | null) => {
      await db.from("strikes").insert({
        user_id: user.id,
        message_id: messageId,
        reason,
        blocked,
        excerpt: blocked ? content.slice(0, 200) : null,
      });
    };

    // ---- Camada 1: filtro local ----
    let status: "ok" | "flagged" = "ok";
    let flagReason: string | null = null;
    const local = localCheck(content);
    if (local.action === "block") {
      await registerStrike(local.reason!, true, null);
      return reply({ blocked: true, reason: local.reason });
    }
    if (local.action === "flag") {
      status = "flagged";
      flagReason = local.reason!;
    }

    // ---- Camada 2: OpenAI Moderation (texto + imagem) ----
    if (status === "ok") {
      const mod = await openaiModeration(content, image_url ?? undefined);
      if (mod) {
        const scores: Record<string, number> = mod.category_scores ?? {};
        // conteúdo sexual envolvendo menores: bloqueio imediato, tolerância zero
        if ((scores["sexual/minors"] ?? 0) > 0.2) {
          await registerStrike(CATEGORY_LABELS["sexual/minors"], true, null);
          return reply({ blocked: true, reason: "Conteúdo bloqueado por violação grave das regras" });
        }
        let worst = ""; let worstScore = 0;
        for (const [cat, score] of Object.entries(scores)) {
          if (score > worstScore) { worst = cat; worstScore = score; }
        }
        if (worstScore >= 0.7) {
          status = "flagged";
          flagReason = CATEGORY_LABELS[worst] ?? worst;
        } else if (worstScore >= 0.35 && content.trim()) {
          // ---- Camada 3: caso ambíguo → Claude Haiku analisa o contexto ----
          const verdict = await claudeCheck(content);
          if (verdict?.violacao) {
            status = "flagged";
            flagReason = verdict.motivo ?? "possível bullying ou assédio";
          }
        }
      }
    }

    // ---- Inserir a mensagem (aprovada ou borrada) ----
    const { data: message, error } = await db.from("messages").insert({
      channel_id,
      sender_id: user.id,
      content,
      image_url,
      status,
      flag_reason: flagReason,
    }).select().single();
    if (error) return reply({ error: error.message }, 500);

    if (status === "flagged") {
      await registerStrike(flagReason ?? "violação das regras", false, message.id);
    }

    return reply({ message, flagged: status === "flagged", reason: flagReason });
  } catch (e) {
    console.error(e);
    return reply({ error: "erro interno" }, 500);
  }
});
