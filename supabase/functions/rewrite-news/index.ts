import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Provider = "openai" | "gemini" | "anthropic";

interface RewriteRequest {
  sourceUrl: string;
  sourceContent?: string;
  sourceName?: string;
  analysisAngle?: string;
  niche?: string;
  articleLength?: "short" | "medium" | "long" | "very-long" | string;
  projectId?: string | null;
  userId?: string;
  language?: string;
}

interface UserAISettings {
  openai_api_key?: string | null;
  gemini_api_key?: string | null;
  anthropic_api_key?: string | null;
  ai_provider?: string | null;
  content_model?: string | null;
  default_ai_model?: string | null;
}

interface GeneratedArticle {
  title: string;
  content: string;
  excerpt?: string;
  keyword?: string;
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtRole(token: string): string {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof decoded?.role === "string" ? decoded.role : "";
  } catch {
    return "";
  }
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function targetLength(value?: string) {
  switch (value) {
    case "short": return "700 a 1000 palavras";
    case "long": return "2200 a 2800 palavras";
    case "very-long": return "3500 a 4500 palavras";
    default: return "1200 a 1800 palavras";
  }
}

function buildPrompt(input: RewriteRequest) {
  const source = (input.sourceContent || "").slice(0, 50000);
  return `Reescreva a notícia abaixo como um artigo editorial original em ${input.language || "pt-BR"}.

FONTE: ${input.sourceName || "não informada"}
URL DA FONTE: ${input.sourceUrl}
NICHO: ${input.niche || "geral"}
ÂNGULO EDITORIAL: ${input.analysisAngle || "contextualização útil e objetiva"}
EXTENSÃO: ${targetLength(input.articleLength)}

REGRAS OBRIGATÓRIAS:
- Preserve somente fatos sustentados pelo conteúdo fornecido.
- Não invente números, pessoas, decisões, datas, pesquisas, citações ou consequências.
- Não copie frases extensas da fonte. Reestruture completamente título, sequência, linguagem e explicações.
- Atribua a informação à fonte quando necessário.
- Se o texto-fonte for insuficiente para sustentar uma afirmação, omita-a ou marque [VERIFICAR].
- Não apresente conteúdo copiado como apuração própria.
- Use H1 único, H2/H3 claros, parágrafos curtos e conclusão objetiva.
- O título deve ser informativo, sem clickbait enganoso.
- Gere uma palavra-chave principal curta e coerente.

Retorne SOMENTE JSON válido, sem markdown, nesta estrutura:
{"title":"...","excerpt":"...","keyword":"...","content":"..."}

CONTEÚDO-FONTE:
${source || "Nenhum corpo de texto foi fornecido. Trabalhe apenas com os dados explicitamente disponíveis e sinalize [VERIFICAR] quando necessário."}`;
}

function extractJson(text: string): GeneratedArticle | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    if (!value?.title || !value?.content) return null;
    return {
      title: String(value.title).trim(),
      content: String(value.content).trim(),
      excerpt: value.excerpt ? String(value.excerpt).trim() : undefined,
      keyword: value.keyword ? String(value.keyword).trim() : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeTokens(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function originalityScore(source: string, generated: string) {
  if (!source.trim() || !generated.trim()) return 80;
  const sourceSet = new Set(normalizeTokens(source));
  const output = normalizeTokens(generated);
  if (!output.length) return 0;
  const overlaps = output.filter((token) => sourceSet.has(token)).length;
  const lexicalOverlap = overlaps / output.length;
  return Math.max(0, Math.min(100, Math.round((1 - lexicalOverlap) * 100)));
}

async function callOpenAI(apiKey: string, model: string, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Produza JSON válido e não revele raciocínio interno." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return extractJson(data?.choices?.[0]?.message?.content || "");
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  return extractJson(text);
}

async function callAnthropic(apiKey: string, model: string, prompt: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.content?.map((p: { text?: string }) => p.text || "").join("") || "";
  return extractJson(text);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return response({ success: false, error: "Autorização necessária", request_id: requestId }, 401);
    }

    const token = authHeader.slice(7);
    const role = decodeJwtRole(token);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return response({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    }

    const input = (await req.json()) as RewriteRequest;
    if (!input.sourceUrl?.trim()) {
      return response({ success: false, error: "sourceUrl é obrigatório", request_id: requestId }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    let userId = "";

    if (role === "service_role") {
      userId = input.userId || "";
      if (!userId) {
        return response({ success: false, error: "userId é obrigatório para execução em background", request_id: requestId }, 400);
      }
    } else {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data.user) {
        return response({ success: false, error: "Sessão inválida", request_id: requestId }, 401);
      }
      userId = data.user.id;
      if (input.userId && input.userId !== userId) {
        return response({ success: false, error: "userId incompatível com a sessão", request_id: requestId }, 403);
      }
    }

    if (input.projectId) {
      const { data: project } = await admin
        .from("projects")
        .select("id")
        .eq("id", input.projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!project) {
        return response({ success: false, error: "Projeto não encontrado ou acesso negado", request_id: requestId }, 403);
      }
    }

    const { data: existing } = await admin
      .from("articles")
      .select("*")
      .eq("user_id", userId)
      .contains("config", { source_url: input.sourceUrl })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return response({ success: true, duplicate: true, article: existing, request_id: requestId });
    }

    const { data: settings } = await admin
      .from("user_settings")
      .select("openai_api_key, gemini_api_key, anthropic_api_key, ai_provider, content_model, default_ai_model")
      .eq("user_id", userId)
      .maybeSingle<UserAISettings>();

    const keys = {
      openai: settings?.openai_api_key || Deno.env.get("OPENAI_API_KEY") || "",
      gemini: settings?.gemini_api_key || Deno.env.get("GEMINI_API_KEY") || "",
      anthropic: settings?.anthropic_api_key || Deno.env.get("ANTHROPIC_API_KEY") || "",
    };
    const configuredModel = settings?.content_model || settings?.default_ai_model || "";
    const preferred = (settings?.ai_provider || "").toLowerCase() as Provider | "";
    const order: Provider[] = preferred && ["openai", "gemini", "anthropic"].includes(preferred)
      ? [preferred, ...(["openai", "gemini", "anthropic"] as Provider[]).filter((p) => p !== preferred)]
      : ["openai", "gemini", "anthropic"];

    const prompt = buildPrompt(input);
    let generated: GeneratedArticle | null = null;
    let providerUsed: Provider | null = null;

    for (const provider of order) {
      if (provider === "openai" && keys.openai) {
        generated = await callOpenAI(keys.openai, configuredModel.startsWith("gpt-") ? configuredModel : "gpt-4o-mini", prompt);
      } else if (provider === "gemini" && keys.gemini) {
        generated = await callGemini(keys.gemini, configuredModel.startsWith("gemini-") ? configuredModel : "gemini-2.5-flash", prompt);
      } else if (provider === "anthropic" && keys.anthropic) {
        generated = await callAnthropic(keys.anthropic, configuredModel.startsWith("claude-") ? configuredModel : "claude-sonnet-4-5-20250929", prompt);
      }
      if (generated) {
        providerUsed = provider;
        break;
      }
    }

    if (!generated) {
      return response({ success: false, error: "Nenhum provedor de IA disponível ou todos falharam", request_id: requestId }, 503);
    }

    const score = originalityScore(input.sourceContent || "", generated.content);
    const wordCount = generated.content.trim().split(/\s+/).filter(Boolean).length;
    const title = generated.title.slice(0, 240);
    const slug = slugify(title || generated.keyword || "artigo");
    const excerpt = generated.excerpt || generated.content.replace(/[#*_>`]/g, "").slice(0, 240).trim();
    const keyword = generated.keyword || input.niche || title;

    const articlePayload = {
      user_id: userId,
      project_id: input.projectId || null,
      title,
      content: generated.content,
      excerpt,
      slug,
      keyword,
      type: "blog",
      status: "ready",
      word_count: wordCount,
      originality_score: score,
      config: {
        source_url: input.sourceUrl,
        source_name: input.sourceName || null,
        analysis_angle: input.analysisAngle || null,
        niche: input.niche || null,
        language: input.language || "pt-BR",
        ai_provider: providerUsed,
        auto_generated: true,
        generated_at: new Date().toISOString(),
      },
    };

    const { data: article, error: insertError } = await admin
      .from("articles")
      .insert(articlePayload)
      .select()
      .single();

    if (insertError || !article) {
      return response({ success: false, error: insertError?.message || "Falha ao salvar artigo", request_id: requestId }, 500);
    }

    return response({ success: true, duplicate: false, article, request_id: requestId });
  } catch (error) {
    return response({
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
      request_id: requestId,
    }, 500);
  }
});
