import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import type { AICallResult } from "../_shared/ai-orchestrator.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { distributeProjectCtas } from "../_shared/editorial-cta.ts";
import { runAgentPipeline } from "../_shared/agents/agent-pipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WordProfile = "short" | "medium" | "long" | "very-long";
interface ArticleConfig {
  keyword: string;
  batchId?: string;
  title?: string;
  secondaryKeywords?: string;
  wordCount?: WordProfile;
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
  projectId?: string;
  articleId?: string;
  projectConfig?: Record<string, string | undefined>;
  // Optional user-selected prompt template (template-picker UI, wired in a
  // separate parallel workstream). When present and owned by the requesting
  // user, it takes precedence over the hardcoded "editor-seo-geo" template
  // lookup below. Never trusted without the user_id ownership check.
  promptTemplateId?: string;
  // Opt-in backend capability (not wired to any UI yet): runs the 4-agent
  // pipeline (Estrategista -> Redator -> Editor -> Revisor SEO) instead of
  // the single callWithMeta/callDualWithMeta generation call. Defaults to
  // false so existing behavior is untouched.
  usePipeline?: boolean;
}

type Band = { label: string; min: number; max: number; purpose: string };

const REVIEW_MARKER = /\[(?:VERIFICAR|VALIDAR|CONFIRMAR|RECONSULTAR)\b[^\]\r\n]{0,300}\]/i;
const SOURCE_SIGNAL = /^ZICA_NEEDS_PRIMARY_SOURCE\s*:\s*(.+)$/im;
const NUMERIC_ONLY_KEYWORD = /^\s*\d+\s*$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function publicGenerationError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("insufficient_credit")) return "A geração está bloqueada por falta de crédito no provedor de IA.";
  if (code.includes("invalid_key")) return "Uma credencial de IA é inválida. Atualize a chave em Motor de IA & Chaves.";
  if (code.includes("rate_limited")) return "O provedor atingiu o limite temporário. Tente novamente em instantes.";
  return "Não foi possível concluir a geração. Verifique o status dos provedores e tente novamente.";
}

function sse(content: string, provider: string, model: string, promptVersion?: number) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(payload, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-AI-Provider": provider,
      "X-AI-Model": model,
      "X-Prompt-Version": String(promptVersion || 0),
    },
  });
}

function bandFor(value?: WordProfile): Band {
  switch (value) {
    case "short": return { label: "300 a 500 palavras", min: 300, max: 500, purpose: "bloco curto, transacional ou resposta ultraespecífica" };
    case "long": return { label: "1.400 a 2.000 palavras", min: 1400, max: 2000, purpose: "artigo aprofundado, sem preencher espaço artificialmente" };
    case "very-long": return { label: "2.500 a 4.000 palavras", min: 2500, max: 4000, purpose: "conteúdo pilar/cornerstone que realmente exija profundidade" };
    default: return { label: "1.000 a 1.500 palavras", min: 1000, max: 1500, purpose: "artigo padrão ou tópico vertical" };
  }
}

function countWords(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

// Same order of magnitude as the truncation already used by rewrite-news
// (60000) and analyze-url-content (8000) for equivalent free-text inputs —
// generate-article had no limit at all, letting a very long pasted source or
// instruction block blow up the request cost/size unbounded.
const MAX_SOURCES_CONTEXT_CHARS = 8000;
const MAX_CUSTOM_INSTRUCTIONS_CHARS = 4000;

function buildPrompt(config: ArticleConfig, band: Band) {
  const links = (config.internalLinks || []).slice(0, 12).map((item) => `${item.anchor}: ${item.url}`).join("\n");
  const projectContext = Object.entries(config.projectConfig || {}).filter(([, value]) => Boolean(value)).map(([key, value]) => `${key}: ${value}`).join("\n");
  const sourcesContext = (config.sourcesContext || "").slice(0, MAX_SOURCES_CONTEXT_CHARS);
  const customInstructions = (config.customInstructions || config.additionalInfo || "").slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS);

  return `Produza somente conteúdo editorial final publicável, sem explicar o processo interno e sem inserir mensagens de revisão no corpo.

ASSUNTO PRINCIPAL: ${config.keyword}
TÍTULO DE REFERÊNCIA: ${config.title || config.keyword}
IDIOMA: ${config.language || "pt-BR"}
TOM: ${config.tone || "profissional e acessível"}
PONTO DE VISTA: ${config.pointOfView || "natural para a intenção"}
TIPO: ${config.type || "blog"}
PERFIL DE EXTENSÃO: ${band.label}
FINALIDADE DA FAIXA: ${band.purpose}
OBJETIVO: ${config.goal || "informar com precisão"}
INTENÇÃO: ${config.intentType || "informational"}
SEGMENTO: ${config.segment || "general"}
PALAVRAS-CHAVE SECUNDÁRIAS: ${config.secondaryKeywords || ""}

REGRAS GEO/AEO INTERNAS DO ZICA.AI:
1. ${config.includeTable ? "Use tabela comparativa quando houver elementos realmente comparáveis e dados suficientes." : "Tabela é opcional e só deve aparecer se acrescentar clareza."}
2. ${config.includeList === false ? "Não force listas." : "Use listas em passos, requisitos, documentos, critérios, riscos ou sínteses quando melhorarem a leitura."}
3. ${config.includeFaq === false ? "Não inclua FAQ." : `Inclua FAQ somente se houver perguntas úteis e respondíveis pelo conteúdo, com até ${config.faqCount || 5} itens.`}
4. Não escreva comentários técnicos TITLE_SEO, META_DESCRIPTION, JSON, prompts, TODOs ou qualquer metadado interno no corpo. Título SEO e meta description são produzidos por outra etapa do pipeline.
5. Preserve integralmente o assunto, a intenção e o segmento informados. Não troque a pauta por tema adjacente.
6. Se produzir título editorial em metadado ou texto auxiliar, ele deve conter a palavra-chave principal de forma natural e manter seu sentido.
7. Não acrescente ano, número, percentual, quantidade ou estatística que não exista na palavra-chave ou nas fontes fornecidas.
8. Não padronize títulos com “Guia Completo”, “Guia Definitivo” ou fórmulas genéricas semelhantes.

REGRAS FACTUAIS E DE PUBLICAÇÃO:
- Não invente fatos, números, decisões, estudos, citações, pessoas, leis ou fontes.
- É PROIBIDO escrever [VERIFICAR], [VALIDAR], [CONFIRMAR], [RECONSULTAR], “revisão humana”, “consultar fonte antes de publicar” ou equivalentes no conteúdo final.
- Se uma informação acessória não puder ser comprovada pelo contexto disponível, simplesmente omita essa informação.
- Se uma fonte primária ausente for indispensável para sustentar a tese central do artigo, NÃO produza o artigo. Retorne somente: ZICA_NEEDS_PRIMARY_SOURCE: seguido de uma descrição objetiva da fonte que falta.
- Conteúdo jurídico sobre lei, ato normativo, jurisprudência, prazo oficial ou política pública atual exige fonte primária quando a afirmação depender dela.
- Preserve conformidade jurídica, publicitária e editorial aplicável ao conteúdo.
- ${config.includeConclusion === false ? "Não force conclusão." : "Finalize com síntese objetiva e CTA coerente, sem promessa de resultado."}

CONTEXTO DA ORGANIZAÇÃO:
${projectContext || "Não informado."}

LINKS INTERNOS DISPONÍVEIS:
${links || "Nenhum informado."}

FONTES/CONTEXTO FORNECIDO:
${sourcesContext || "Nenhuma fonte adicional fornecida."}

INSTRUÇÕES ADICIONAIS:
${customInstructions || "Nenhuma."}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const body = await req.json().catch(() => ({}));
    const actor = await resolveRequestActor(req, body?.userId);
    const userId = actor.userId;
    const config = (body?.config || body) as ArticleConfig;
    if (!config?.keyword?.trim()) return json({ error: "keyword é obrigatório", request_id: requestId }, 400);
    if (NUMERIC_ONLY_KEYWORD.test(config.keyword) || !/\p{L}/u.test(config.keyword)) {
      return json({ error: "Palavra-chave inválida: índices numéricos não podem gerar conteúdo.", code: "invalid_editorial_keyword", request_id: requestId }, 422);
    }

    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body?.enqueueOnly === true) {
      if (!config.articleId) return json({ error: "articleId é obrigatório para enfileirar", request_id: requestId }, 400);
      const { data: article } = await admin.from("articles").select("id,project_id")
        .eq("id", config.articleId).eq("user_id", userId).maybeSingle();
      if (!article) return json({ error: "Artigo não encontrado ou acesso negado", request_id: requestId }, 403);
      const projectId = config.projectId || article.project_id || null;
      const { error: queueError } = await admin.from("zica_brain_jobs").upsert({
        user_id: userId, project_id: projectId, article_id: article.id,
        batch_id: config.batchId || null,
        job_type: "article_generate", status: "queued", priority: 85, max_attempts: 3,
        idempotency_key: `article-generate:${article.id}:v1`,
        payload: { config: { ...config, projectId, articleId: article.id } },
        next_attempt_at: new Date().toISOString(),
      }, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
      if (queueError) return json({ error: queueError.message, request_id: requestId }, 500);
      await admin.from("articles").update({ status: "generating", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", article.id).eq("user_id", userId);
      return json({ success: true, queued: true, articleId: article.id, request_id: requestId }, 202);
    }
    let preferredProvider: "openai" | "anthropic" | undefined;
    let dualProvider = false;
    let resolvedProject: Record<string, unknown> | null = null;
    let systemPrompt = "Você é o redator editorial principal do Zica.ai. Entregue somente conteúdo publicável ou o sinal ZICA_NEEDS_PRIMARY_SOURCE quando uma fonte primária for indispensável.";
    let promptVersion = 0;
    if (admin) {
      const { data: settings } = await admin.from("user_settings").select("ai_provider").eq("user_id", userId).maybeSingle();
      const provider = String(settings?.ai_provider || "").toLowerCase();
      if (provider === "openai" || provider === "anthropic") preferredProvider = provider;
      dualProvider = provider === "dual";
      if (config.projectId) {
        const { data: project } = await admin.from("projects").select("id,name,description,commercial_info,social_links,editorial_identity,social_instagram,social_linkedin,social_youtube,social_twitter,social_tiktok,social_google_maps,cta_leads,cta_conclusao").eq("id", config.projectId).eq("user_id", userId).maybeSingle();
        if (!project) return json({ error: "Projeto não encontrado ou acesso negado", request_id: requestId }, 403);
        resolvedProject = project as Record<string, unknown>;
        config.projectConfig = {
          ...(config.projectConfig || {}),
          project_name: String(project.name || ""),
          project_description: String(project.description || ""),
          commercial_info: JSON.stringify(project.commercial_info || {}),
          social_links: JSON.stringify(project.social_links || {}),
          editorial_identity: JSON.stringify(project.editorial_identity || {}),
        };
      }
      // Optional explicit template selection (template-picker UI). The admin
      // client uses the service role and bypasses RLS, so ownership MUST be
      // enforced here explicitly: a user must never be able to load another
      // user's prompt template by guessing/passing its id. Any miss (absent
      // field, not found, or found but owned by someone else) falls through
      // silently to the default hardcoded lookup below — a stale template
      // reference in a saved draft should never break generation.
      let customTemplateApplied = false;
      const requestedTemplateId = typeof config.promptTemplateId === "string" ? config.promptTemplateId.trim() : "";
      if (requestedTemplateId) {
        const { data: customTemplate } = await admin.from("prompt_templates").select("prompt,version")
          .eq("id", requestedTemplateId).eq("user_id", userId).maybeSingle();
        if (customTemplate?.prompt?.trim()) {
          systemPrompt = customTemplate.prompt;
          promptVersion = Number(customTemplate.version || 1);
          customTemplateApplied = true;
        }
      }

      if (!customTemplateApplied) {
        const templateQuery = admin.from("prompt_templates").select("prompt,version,project_id")
          .eq("user_id", userId).eq("name", "editor-seo-geo").eq("is_active", true)
          .order("updated_at", { ascending: false }).limit(1);
        const { data: templates } = config.projectId
          ? await templateQuery.or(`project_id.eq.${config.projectId},project_id.is.null`)
          : await templateQuery.is("project_id", null);
        const selectedTemplate = templates?.find((item) => item.project_id === config.projectId && Boolean(item.prompt?.trim()))
          || templates?.find((item) => item.project_id === null && Boolean(item.prompt?.trim()));
        if (selectedTemplate?.prompt) {
          systemPrompt = selectedTemplate.prompt;
          promptVersion = Number(selectedTemplate.version || 1);
        }
      }
    }

    const band = bandFor(config.wordCount);
    const prompt = buildPrompt(config, band);
    const orchestrator = await getOrchestratorForUser(userId);
    const generationMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ] as const;

    let generation: AICallResult;
    if (config.usePipeline) {
      // Opt-in 4-agent path (Estrategista -> Redator -> Editor -> Revisor
      // SEO), backend-only capability for now (no UI wires this in yet).
      // getOrchestratorForUser was already called above for parity/logging,
      // but runAgentPipeline resolves its own BYOK orchestrator internally
      // (same userId) so each of the 4 agent calls is billed and logged to
      // token_usage_logs individually.
      const secondaryKeywords = String(config.secondaryKeywords || "")
        .split(",").map((item) => item.trim()).filter(Boolean);
      const pipelineResult = await runAgentPipeline({
        keyword: config.keyword,
        title: config.title,
        secondaryKeywords,
        sector: config.segment || "general",
        language: config.language || "pt-BR",
        tone: config.tone || "profissional e acessível",
        pointOfView: config.pointOfView || "voce",
        wordCount: config.wordCount || "medium",
        contentType: config.contentType,
        goal: config.goal,
        intentType: config.intentType,
        companyName: config.companyName,
        companyPhone: config.companyPhone,
        companyAddress: config.companyAddress,
        differentials: config.differentials,
        targetAudience: config.targetAudience,
        painPoints: config.painPoints,
        ctaObjective: config.ctaObjective,
        includeFaq: config.includeFaq !== false,
        faqCount: config.faqCount || 5,
        includeTable: Boolean(config.includeTable),
        includeList: config.includeList !== false,
        includeConclusion: config.includeConclusion !== false,
        internalLinks: config.internalLinks,
        preferredProvider,
        userId,
        articleId: config.articleId,
        correlationId: requestId,
      });
      // Synthesize an AICallResult-shaped object so everything downstream
      // (SOURCE_SIGNAL/REVIEW_MARKER checks, word-count expansion,
      // distributeProjectCtas, SSE/JSON response) keeps working unmodified.
      // usage stays zeroed here on purpose: real token usage was already
      // recorded per-agent-call by getOrchestratorForUser's usageSink inside
      // runAgentPipeline, so summing it again here would double-count it.
      generation = {
        content: pipelineResult.content,
        provider: "multi-agent",
        model: pipelineResult.providersUsed.join("+"),
        usage: { inputTokens: 0, outputTokens: 0 },
        providerMode: "pipeline",
        providersUsed: pipelineResult.providersUsed,
      };
    } else {
      generation = dualProvider
        ? await orchestrator.callDualWithMeta("article_generation", [...generationMessages], { maxTokens: 32000, temperature: 0.35, articleId: config.articleId, correlationId: requestId })
        : await orchestrator.callWithMeta("article_generation", [...generationMessages], { preferredProvider, maxTokens: 32000, temperature: 0.35, articleId: config.articleId, correlationId: requestId });
    }

    let content = generation.content.trim();
    const initialSourceSignal = content.match(SOURCE_SIGNAL);
    if (initialSourceSignal || REVIEW_MARKER.test(content)) {
      return json({
        error: "Fonte primária necessária antes da geração/publicação.",
        code: "primary_source_required",
        detail: initialSourceSignal?.[1]?.trim() || "O modelo detectou uma afirmação que exige verificação em fonte primária.",
        retryable: false,
        request_id: requestId,
      }, 409);
    }

    let words = countWords(content);
    if (words < Math.floor(band.min * 0.85) && band.min >= 1000) {
      const expanded = await orchestrator.callWithMeta("content_editing", [
        { role: "system", content: "Aprofunde sem inventar fatos, sem repetir ideias e sem alterar a tese central. Não insira marcadores de revisão, comentários técnicos ou metadados no corpo." },
        { role: "user", content: `Faixa editorial: ${band.label}. O rascunho possui ${words} palavras. Acrescente apenas explicações, critérios, exemplos hipotéticos claramente identificados, listas ou comparações sustentadas pelo próprio contexto. Se uma fonte primária indispensável estiver ausente, retorne somente ZICA_NEEDS_PRIMARY_SOURCE: <fonte necessária>.\n\nRASCUNHO:\n${content}` },
      ], { preferredProvider: generation.provider, maxTokens: 32000, temperature: 0.2 });
      const expandedContent = expanded.content.trim();
      const expandedSourceSignal = expandedContent.match(SOURCE_SIGNAL);
      if (expandedSourceSignal || REVIEW_MARKER.test(expandedContent)) {
        return json({
          error: "Fonte primária necessária antes da geração/publicação.",
          code: "primary_source_required",
          detail: expandedSourceSignal?.[1]?.trim() || "A revisão editorial detectou uma afirmação que exige fonte primária.",
          retryable: false,
          request_id: requestId,
        }, 409);
      }
      if (countWords(expandedContent) > words) {
        content = expandedContent;
        words = countWords(content);
        generation = expanded;
      }
    }

    content = distributeProjectCtas(content, resolvedProject || {});
    words = countWords(content);
    console.log(`[generate-article] request=${requestId} provider=${generation.provider} model=${generation.model} words=${words} band=${band.min}-${band.max}`);
    if (body?.responseFormat === "json") {
      return json({ success: true, content, provider: generation.provider, model: generation.model, providerMode: generation.providerMode || 'single', providersUsed: generation.providersUsed || [generation.provider], words, promptVersion, request_id: requestId });
    }
    return sse(content, generation.provider, generation.model, promptVersion);
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ error: error.message, code: error.code, request_id: requestId }, error.status);
    console.error(`[generate-article] request=${requestId} error=${error instanceof Error ? error.message : "generation_failed"}`);
    return json({ error: publicGenerationError(error), code: "generation_failed", request_id: requestId }, 503);
  }
});
