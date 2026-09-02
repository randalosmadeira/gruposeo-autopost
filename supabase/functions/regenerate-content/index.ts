import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RegenerateType = "title" | "excerpt" | "content";
type RegenerateRequest = {
  type?: RegenerateType | "image";
  articleId?: string;
  keyword?: string;
  currentTitle?: string | null;
  currentContent?: string | null;
  currentExcerpt?: string | null;
  language?: string;
  userId?: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const env = (name: string) => String(Deno.env.get(name) || "").trim();

function stripFences(value: string) {
  return value.replace(/^```(?:html|text|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function plainLine(value: string) {
  return stripFences(value)
    .replace(/^\s*["'“”]+|["'“”]+\s*$/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] || "";
}

function truncateNatural(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const candidate = clean.slice(0, max + 1);
  const cut = candidate.lastIndexOf(" ");
  return `${(cut > Math.floor(max * 0.7) ? candidate.slice(0, cut) : candidate.slice(0, max)).trim().replace(/[,:;.!?]+$/, "")}`;
}

function taskFor(type: RegenerateType) {
  if (type === "title") return "title_generation" as const;
  if (type === "excerpt") return "meta_description" as const;
  return "content_editing" as const;
}

function prompts(type: RegenerateType, input: { keyword: string; title: string; content: string; excerpt: string; language: string }) {
  const source = input.content.replace(/\s+/g, " ").slice(0, 14000);
  if (type === "title") {
    return [
      {
        role: "system" as const,
        content: "Você edita títulos SEO. Preserve o assunto e os fatos do texto. Não invente dados, decisões, números, nomes ou promessas. Responda somente com um único título, sem aspas, sem markdown e com no máximo 60 caracteres.",
      },
      {
        role: "user" as const,
        content: `Idioma: ${input.language}\nPalavra-chave principal: ${input.keyword}\nTítulo atual: ${input.title}\nConteúdo de referência: ${source}\n\nReescreva o título para SEO e clareza, mantendo fidelidade ao conteúdo.`,
      },
    ];
  }
  if (type === "excerpt") {
    return [
      {
        role: "system" as const,
        content: "Você cria meta-descrições SEO factualmente fiéis. Não invente fatos, resultados, garantias ou números. Responda somente com a meta-descrição, sem aspas e sem markdown, idealmente entre 140 e 160 caracteres.",
      },
      {
        role: "user" as const,
        content: `Idioma: ${input.language}\nPalavra-chave principal: ${input.keyword}\nTítulo: ${input.title}\nMeta atual: ${input.excerpt}\nConteúdo de referência: ${source}\n\nCrie uma meta-descrição clara, específica e compatível com o conteúdo.`,
      },
    ];
  }
  return [
    {
      role: "system" as const,
      content: "Você é editor de conteúdo. Reescreva somente com base no material fornecido. Preserve fatos, links, citações e sentido jurídico. Não invente fontes, jurisprudência, dados, pessoas ou eventos. Entregue somente HTML sem bloco markdown, mantendo headings, parágrafos, listas e links úteis.",
    },
    {
      role: "user" as const,
      content: `Idioma: ${input.language}\nPalavra-chave principal: ${input.keyword}\nTítulo: ${input.title}\n\nCONTEÚDO ATUAL:\n${input.content}\n\nAprimore clareza, estrutura, legibilidade e SEO sem alterar o conteúdo factual.`,
    },
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({})) as RegenerateRequest;
    if (!body.type) return json({ success: false, error: "type é obrigatório", request_id: requestId }, 400);
    if (body.type === "image") {
      return json({ success: false, error: "Regeneração de imagem deve usar generate-image", code: "use_generate_image", request_id: requestId }, 422);
    }

    const actor = await resolveRequestActor(req, body.userId);
    const userId = actor.userId;
    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let article: Record<string, any> | null = null;
    if (body.articleId) {
      const { data, error } = await admin
        .from("articles")
        .select("id,user_id,project_id,title,keyword,content,excerpt")
        .eq("id", body.articleId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ success: false, error: "Artigo não encontrado", request_id: requestId }, 404);
      article = data;
    }

    const keyword = String(body.keyword || article?.keyword || "").trim();
    const title = String(body.currentTitle ?? article?.title ?? "").trim();
    const content = String(body.currentContent ?? article?.content ?? "").trim();
    const excerpt = String(body.currentExcerpt ?? article?.excerpt ?? "").trim();
    const language = String(body.language || "pt-BR").trim();

    if (!keyword && !title && !content) {
      return json({ success: false, error: "Contexto insuficiente para regeneração", request_id: requestId }, 422);
    }
    if (body.type === "content" && content.length < 50) {
      return json({ success: false, error: "Conteúdo atual insuficiente para edição", request_id: requestId }, 422);
    }

    const orchestrator = await getOrchestratorForUser(userId);
    const call = await orchestrator.callWithMeta(
      taskFor(body.type),
      prompts(body.type, { keyword, title, content, excerpt, language }),
      {
        preferredProvider: "openai",
        prioritizeQuality: true,
        temperature: body.type === "content" ? 0.25 : 0.2,
        maxTokens: body.type === "content" ? 14000 : 700,
      },
    );

    let result = stripFences(call.content);
    if (body.type === "title") result = truncateNatural(plainLine(result), 60);
    if (body.type === "excerpt") result = truncateNatural(plainLine(result), 160);
    if (!result) throw new Error("A IA retornou conteúdo vazio");

    return json({
      success: true,
      result,
      type: body.type,
      provider: call.provider,
      model: call.model,
      articleId: article?.id || body.articleId || null,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    }
    const message = error instanceof Error ? error.message : "Falha ao regenerar conteúdo";
    console.error("[regenerate-content]", requestId, message);
    return json({ success: false, error: message, code: "regeneration_failed", request_id: requestId }, 500);
  }
});
