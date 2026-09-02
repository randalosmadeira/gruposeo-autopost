import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { fetchUserKeys } from "../_shared/byok-resolver.ts";

const FUNCTION_NAME = "generate-image";
const OPENAI_IMAGE_MODEL = "gpt-image-2";
const CLAUDE_REVIEW_MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ImageRequest = {
  title: string;
  keywords?: string;
  context?: string;
  content?: string;
  segment?: "legal" | "health" | "fintech" | "ecommerce" | "b2b-saas" | "education" | "general";
  style?: "photorealistic" | "illustration" | "abstract";
  aspectRatio?: "16:9" | "1:1" | "4:3" | "9:16";
  quality?: "low" | "medium" | "high" | "standard";
  articleId?: string;
  userId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function jwtRole(token: string) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")))?.role || "");
  } catch { return ""; }
}

function buildPrompt(body: ImageRequest) {
  const segment = body.segment || "general";
  const style = body.style || "photorealistic";
  const context = [body.context, body.content?.slice(0, 2500), body.keywords].filter(Boolean).join("\n");
  return `Crie uma imagem editorial profissional para o conteúdo: "${body.title}".

CONTEXTO:
${context || "Imagem diretamente relacionada ao título."}

REQUISITOS:
- Segmento: ${segment}.
- Estilo: ${style}.
- Aparência humana e natural quando houver pessoas; anatomia correta e pele realista.
- Composição editorial limpa, mobile-first e adequada a portal de notícias.
- Iluminação profissional e alta nitidez no assunto principal.
- Sem texto, sem logotipos, sem marcas d'água e sem símbolos partidários inventados.
- Não inventar pessoas públicas, documentos, julgamentos ou cenas que aparentem ser registro factual de evento que não ocorreu.
- Se o tema for jurídico, prefira representação conceitual ou ambiente institucional genérico, evitando simular provas ou processos reais.
- A imagem deve comunicar o tema imediatamente sem parecer banco de imagens genérico.`;
}

async function reviewPromptWithClaude(apiKey: string, prompt: string, title: string) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_REVIEW_MODEL,
        max_tokens: 1200,
        messages: [{ role: "user", content: `Revise o prompt de imagem abaixo para aumentar fidelidade editorial, naturalidade e segurança factual. Preserve o assunto "${title}". Não inclua explicações: devolva somente o prompt final.\n\n${prompt}` }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return { prompt, reviewed: false };
    const data = await response.json();
    const reviewed = data?.content?.map((part: { text?: string }) => part.text || "").join("").trim();
    return { prompt: reviewed || prompt, reviewed: Boolean(reviewed) };
  } catch {
    return { prompt, reviewed: false };
  }
}

function imageSize(ratio: ImageRequest["aspectRatio"]) {
  if (ratio === "1:1") return "1024x1024";
  if (ratio === "9:16") return "1024x1536";
  return "1536x1024";
}

async function generateOpenAIImage(apiKey: string, prompt: string, body: ImageRequest) {
  const quality = body.quality === "standard" ? "medium" : (body.quality || "high");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, n: 1, size: imageSize(body.aspectRatio), quality }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  if (!response.ok) {
    let code = "openai_image_error";
    try { code = JSON.parse(text)?.error?.code || code; } catch { /* ignore */ }
    const error = new Error(`OpenAI image HTTP ${response.status}: ${text.slice(0, 500)}`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = code;
    throw error;
  }
  const data = JSON.parse(text);
  const item = data?.data?.[0] || {};
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) return String(item.url);
  throw new Error("GPT-Image-2 não retornou imagem.");
}

Deno.serve(async (req: Request) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const started = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed", request_id: requestId }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "Autorização necessária", request_id: requestId }, 401);
    const token = authHeader.slice(7);
    const role = jwtRole(token);
    const body = await req.json() as ImageRequest;
    if (!body.title?.trim()) return json({ success: false, error: "Título é obrigatório", request_id: requestId }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);

    let userId = "";
    if (role === "service_role") {
      userId = body.userId || "";
      if (!userId) return json({ success: false, error: "userId é obrigatório em background", request_id: requestId }, 400);
    } else {
      const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return json({ success: false, error: "Sessão inválida", request_id: requestId }, 401);
      userId = data.user.id;
      if (body.userId && body.userId !== userId) return json({ success: false, error: "userId incompatível", request_id: requestId }, 403);
    }

    const keys = await fetchUserKeys(userId);
    if (!keys.openai) return json({ success: false, error: "OpenAI não configurada para este usuário", code: "openai_missing", request_id: requestId }, 503);

    const basePrompt = buildPrompt(body);
    const reviewed = keys.anthropic ? await reviewPromptWithClaude(keys.anthropic, basePrompt, body.title) : { prompt: basePrompt, reviewed: false };
    const image = await generateOpenAIImage(keys.openai, reviewed.prompt, body);

    if (body.articleId) {
      const admin = createClient(supabaseUrl, serviceKey);
      await admin.from("articles").update({ featured_image_url: image, updated_at: new Date().toISOString() }).eq("id", body.articleId).eq("user_id", userId);
    }

    log.requestEnd(200, Date.now() - started);
    return json({ success: true, image, alt: `Imagem ilustrativa: ${body.title}`, title: body.title.slice(0, 100), prompt: reviewed.prompt, promptReviewedByClaude: reviewed.reviewed, provider: "openai", model: OPENAI_IMAGE_MODEL, reviewer: reviewed.reviewed ? "anthropic" : null, reviewerModel: reviewed.reviewed ? CLAUDE_REVIEW_MODEL : null, request_id: requestId });
  } catch (error) {
    const err = error as Error & { status?: number; code?: string };
    log.error("generation_error", { error: err.message, code: err.code, status: err.status });
    log.requestEnd(err.status || 500, Date.now() - started);
    const credit = err.code === "credit_balance_exhausted" || err.message.includes("insufficient_quota");
    return json({ success: false, error: credit ? "OpenAI sem saldo disponível para geração de imagem." : err.message, code: credit ? "openai_credit_balance_exhausted" : (err.code || "image_generation_failed"), retryable: !credit, request_id: requestId }, credit ? 402 : (err.status || 500));
  }
});
