import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ArticleConfig {
  keyword: string;
  title?: string;
  secondaryKeywords?: string;
  wordCount?: "short" | "medium" | "long" | "very-long";
  tone?: string;
  pointOfView?: string;
  language?: string;
  type?: "blog" | "sales" | "review" | "comparison";
  contentType?: string;
  segment?: string;
  goal?: string;
  intentType?: string;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  additionalInfo?: string;
  includeFaq?: boolean;
  faqCount?: number;
  includeTable?: boolean;
  includeList?: boolean;
  includeConclusion?: boolean;
  includeMetaDescription?: boolean;
  seoOptimization?: boolean;
  humanizeContent?: boolean;
  realtimeData?: boolean;
  customInstructions?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
  sourcesContext?: string;
  promptTemplateId?: string;
  targetFunction?: string;
  projectId?: string;
  projectConfig?: Record<string, string | undefined>;
}

interface UserAISettings {
  openai_api_key?: string | null;
  gemini_api_key?: string | null;
  anthropic_api_key?: string | null;
  ai_provider?: string | null;
  content_model?: string | null;
  default_ai_model?: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sseResponse(content: string, provider: string) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(payload, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-AI-Provider": provider,
    },
  });
}

function targetWords(value?: ArticleConfig["wordCount"]) {
  switch (value) {
    case "short": return "700 a 1000 palavras";
    case "long": return "2200 a 2800 palavras";
    case "very-long": return "3500 a 4500 palavras";
    default: return "1200 a 1800 palavras";
  }
}

function buildPrompt(config: ArticleConfig) {
  const links = (config.internalLinks || [])
    .slice(0, 12)
    .map((item) => `${item.anchor}: ${item.url}`)
    .join("\n");

  const projectContext = Object.entries(config.projectConfig || {})
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `Você é um redator editorial e SEO sênior. Produza somente o conteúdo final do artigo, sem explicar o processo interno.

ASSUNTO PRINCIPAL: ${config.keyword}
TÍTULO SUGERIDO: ${config.title || "crie um título claro e específico"}
IDIOMA: ${config.language || "pt-BR"}
TOM: ${config.tone || "profissional e acessível"}
PONTO DE VISTA: ${config.pointOfView || "segunda pessoa quando natural"}
TIPO: ${config.type || "blog"}
EXTENSÃO: ${targetWords(config.wordCount)}
OBJETIVO: ${config.goal || "informar com precisão"}
INTENÇÃO: ${config.intentType || "informational"}
SEGMENTO: ${config.segment || "general"}
PALAVRAS-CHAVE SECUNDÁRIAS: ${config.secondaryKeywords || ""}

REGRAS:
- Não invente fatos, números, decisões, estudos, citações ou fontes.
- Quando uma afirmação depender de dado atual e não houver fonte no contexto, use formulação prudente ou sinalize [VERIFICAR].
- Use H1 único, H2 e H3 bem estruturados.
- Parágrafos curtos e linguagem natural.
- Evite repetição artificial da palavra-chave.
- ${config.includeFaq === false ? "Não inclua FAQ." : `Inclua até ${config.faqCount || 5} perguntas frequentes úteis.`}
- ${config.includeTable ? "Inclua tabela somente se acrescentar clareza." : "Tabela não é obrigatória."}
- ${config.includeList === false ? "Listas são opcionais." : "Use listas quando facilitarem a leitura."}
- ${config.includeConclusion === false ? "Não force uma seção de conclusão." : "Finalize com síntese objetiva e CTA coerente."}
- ${config.includeMetaDescription === false ? "Não inclua meta description." : "Inclua no início comentários HTML TITLE_SEO e META_DESCRIPTION."}
- Preserve conformidade jurídica, publicitária e editorial aplicável ao conteúdo.

CONTEXTO DA ORGANIZAÇÃO:
${projectContext || "Não informado."}

LINKS INTERNOS DISPONÍVEIS:
${links || "Nenhum informado."}

FONTES/CONTEXTO FORNECIDO:
${config.sourcesContext || "Nenhuma fonte adicional fornecida."}

INSTRUÇÕES ADICIONAIS:
${config.customInstructions || config.additionalInfo || "Nenhuma."}`;
}

async function tryOpenAI(apiKey: string, model: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.65,
      messages: [
        { role: "system", content: "Responda apenas com o conteúdo final solicitado. Não revele raciocínio interno." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    return null;
  }

  return new Response(response.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-AI-Provider": "openai",
    },
  });
}

async function tryGemini(apiKey: string, model: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 65536 },
      }),
    },
  );

  if (!response.ok) return null;
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
  return text ? sseResponse(text, "gemini") : null;
}

async function tryAnthropic(apiKey: string, model: string, prompt: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
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

  if (!response.ok) return null;
  const data = await response.json();
  const text = data?.content?.map((item: { text?: string }) => item.text || "").join("") || "";
  return text ? sseResponse(text, "anthropic") : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Autorização necessária", request_id: requestId }, 401);
    }

    const token = authHeader.slice(7);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse({ error: "Backend incompleto", request_id: requestId }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Sessão inválida", request_id: requestId }, 401);
    }

    const body = await req.json();
    const config = (body?.config || body) as ArticleConfig;
    if (!config?.keyword?.trim()) {
      return jsonResponse({ error: "keyword é obrigatório", request_id: requestId }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: settings } = await admin
      .from("user_settings")
      .select("openai_api_key, gemini_api_key, anthropic_api_key, ai_provider, content_model, default_ai_model")
      .eq("user_id", authData.user.id)
      .maybeSingle<UserAISettings>();

    const openaiKey = settings?.openai_api_key || Deno.env.get("OPENAI_API_KEY") || "";
    const geminiKey = settings?.gemini_api_key || Deno.env.get("GEMINI_API_KEY") || "";
    const anthropicKey = settings?.anthropic_api_key || Deno.env.get("ANTHROPIC_API_KEY") || "";
    const preferred = (settings?.ai_provider || "").toLowerCase();
    const configuredModel = settings?.content_model || settings?.default_ai_model || "";
    const prompt = buildPrompt(config);

    const providers = preferred
      ? [preferred, "openai", "gemini", "anthropic"]
      : ["openai", "gemini", "anthropic"];

    for (const provider of [...new Set(providers)]) {
      if (provider === "openai" && openaiKey) {
        const model = configuredModel.startsWith("gpt-") ? configuredModel : "gpt-4o-mini";
        const response = await tryOpenAI(openaiKey, model, prompt);
        if (response) return response;
      }
      if (provider === "gemini" && geminiKey) {
        const model = configuredModel.startsWith("gemini-") ? configuredModel : "gemini-2.5-flash";
        const response = await tryGemini(geminiKey, model, prompt);
        if (response) return response;
      }
      if (provider === "anthropic" && anthropicKey) {
        const model = configuredModel.startsWith("claude-") ? configuredModel : "claude-sonnet-4-5-20250929";
        const response = await tryAnthropic(anthropicKey, model, prompt);
        if (response) return response;
      }
    }

    return jsonResponse({ error: "Nenhum provedor de IA disponível ou todos falharam", request_id: requestId }, 503);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Erro interno",
      request_id: requestId,
    }, 500);
  }
});
