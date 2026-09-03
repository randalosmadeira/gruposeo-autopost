import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { normalizeEditorialHtml } from "../_shared/editorial-html.ts";
import { isSafePublicHttpUrl } from "../_shared/rss-discovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RewriteRequest = {
  sourceUrl: string;
  sourceContent?: string;
  sourceName?: string;
  rssFeedUrl?: string | null;
  analysisAngle?: string;
  niche?: string;
  articleLength?: "short" | "medium" | "long" | "very-long" | "auto" | string;
  projectId?: string | null;
  userId?: string;
  language?: string;
  promptTemplate?: string;
  automationMode?: "manual" | "assisted" | "ai_95" | string;
};

type SourceTriage = {
  relevant: boolean;
  confidence: number;
  niche: string;
  analysis_angle: string;
  article_length: "short" | "medium" | "long" | "very-long";
  focus_keyword: string;
  content_type: string;
  wordpress_category: string;
  tags: string[];
  risk_level: "low" | "medium" | "high";
  requires_primary_source: boolean;
  publish_recommendation: "auto_publish" | "draft" | "reject";
  reason: string;
};

type ArticleDraft = {
  title: string;
  meta_description?: string;
  slug?: string;
  excerpt?: string;
  keyword?: string;
  content_html?: string;
  content?: string;
  primary_sources?: string[];
  secondary_sources?: string[];
  legal_authorities?: string[];
  verification_flags?: string[];
  needs_primary_source?: boolean;
  internal_link_suggestions?: string[];
  image_prompt?: string;
};

type Review = {
  pass: boolean;
  needs_primary_source: boolean;
  issues: string[];
  corrected_title?: string;
  corrected_excerpt?: string;
  corrected_content?: string;
  corrected_keyword?: string;
  notes?: string[];
};

type Band = { label: string; min: number; max: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(cleaned.slice(first, last + 1)) as T; } catch { return null; }
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
}

function bandFor(value?: string): Band {
  if (value === "short") return { label: "500 a 900 palavras", min: 500, max: 900 };
  if (value === "long") return { label: "1.500 a 2.200 palavras", min: 1500, max: 2200 };
  if (value === "very-long") return { label: "2.200 a 3.500 palavras, somente quando o tema justificar conteúdo pilar", min: 2200, max: 3500 };
  return { label: "900 a 1.500 palavras", min: 900, max: 1500 };
}

function originalityScore(source: string, generated: string) {
  if (!source.trim() || !generated.trim()) return 80;
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 4);
  const sourceWords = new Set(normalize(source));
  const outputWords = normalize(generated);
  if (!outputWords.length) return 0;
  const overlap = outputWords.filter((word) => sourceWords.has(word)).length / outputWords.length;
  return Math.max(0, Math.min(100, Math.round((1 - overlap) * 100)));
}

function fallbackTriage(input: RewriteRequest): SourceTriage {
  const explicitLength = ["short", "medium", "long", "very-long"].includes(String(input.articleLength)) ? input.articleLength as SourceTriage["article_length"] : "medium";
  return {
    relevant: true,
    confidence: 70,
    niche: input.niche && input.niche !== "auto" ? input.niche : "jurídico/notícias",
    analysis_angle: input.analysisAngle && input.analysisAngle !== "AUTO_SEMANTIC" ? input.analysisAngle : "explicar o fato, seu contexto, consequências práticas e fontes verificáveis",
    article_length: explicitLength,
    focus_keyword: "",
    content_type: "news_analysis",
    wordpress_category: "Notícias",
    tags: [],
    risk_level: "medium",
    requires_primary_source: false,
    publish_recommendation: "draft",
    reason: "Fallback determinístico porque a classificação estruturada da IA não ficou disponível.",
  };
}

function sanitizeTriage(raw: Partial<SourceTriage> | null, input: RewriteRequest): SourceTriage {
  const fallback = fallbackTriage(input);
  if (!raw) return fallback;
  const lengths = new Set(["short", "medium", "long", "very-long"]);
  const risks = new Set(["low", "medium", "high"]);
  const recommendations = new Set(["auto_publish", "draft", "reject"]);
  return {
    relevant: raw.relevant !== false,
    confidence: Math.max(0, Math.min(100, Number(raw.confidence ?? fallback.confidence) || fallback.confidence)),
    niche: String(raw.niche || fallback.niche).slice(0, 120),
    analysis_angle: String(raw.analysis_angle || fallback.analysis_angle).slice(0, 500),
    article_length: lengths.has(String(raw.article_length)) ? raw.article_length as SourceTriage["article_length"] : fallback.article_length,
    focus_keyword: String(raw.focus_keyword || "").slice(0, 180),
    content_type: String(raw.content_type || fallback.content_type).slice(0, 100),
    wordpress_category: String(raw.wordpress_category || fallback.wordpress_category).slice(0, 120),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag).trim().slice(0, 80)).filter(Boolean).slice(0, 12) : [],
    risk_level: risks.has(String(raw.risk_level)) ? raw.risk_level as SourceTriage["risk_level"] : fallback.risk_level,
    requires_primary_source: Boolean(raw.requires_primary_source),
    publish_recommendation: recommendations.has(String(raw.publish_recommendation)) ? raw.publish_recommendation as SourceTriage["publish_recommendation"] : fallback.publish_recommendation,
    reason: String(raw.reason || fallback.reason).slice(0, 1000),
  };
}

async function loadSource(sourceUrl: string, supplied: string) {
  const initial = String(supplied || "").trim();
  if (initial.length >= 1200 || !isSafePublicHttpUrl(sourceUrl)) return initial;
  try {
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Zica.ai-Repost-Analyzer/3.11", Accept: "text/html,application/xhtml+xml,text/plain;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !isSafePublicHttpUrl(response.url || sourceUrl)) return initial;
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("text/html") && !type.includes("text/plain") && !type.includes("application/xhtml+xml")) return initial;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 1_500_000) return initial;
    const html = (await response.text()).slice(0, 1_500_000);
    const withoutNoise = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
      .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'")
      .replace(/\s+/g, " ").trim();
    return withoutNoise.length > initial.length ? withoutNoise.slice(0, 70000) : initial;
  } catch {
    return initial;
  }
}

async function resolveTemplate(admin: any, userId: string, projectId?: string | null, explicit?: string) {
  let templateName = explicit || "legal_news_rdm_v1";
  let inlinePrompt = "";
  if (!explicit && projectId) {
    const { data: agent } = await admin.from("news_agents").select("prompt_template").eq("project_id", projectId).eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (agent?.prompt_template) {
      const candidate = String(agent.prompt_template);
      if (candidate.length > 180 || candidate.includes(" ")) inlinePrompt = candidate;
      else templateName = candidate;
    }
  }
  if (inlinePrompt) return { templateName: "inline_agent_prompt", prompt: inlinePrompt, agentName: "LEX RDM NEWS" };
  const { data: template } = await admin.from("prompt_templates").select("name,prompt,agent_name").eq("user_id", userId).eq("name", templateName).maybeSingle();
  return { templateName, prompt: String(template?.prompt || ""), agentName: String(template?.agent_name || "LEX RDM NEWS") };
}

function triagePrompt(input: RewriteRequest, source: string, project: Record<string, any>) {
  const links = Array.isArray(project.links_prioritarios) ? project.links_prioritarios.filter((url: unknown) => typeof url === "string").slice(0, 20) : [];
  return `Analise a matéria de origem e defina os filtros editoriais automaticamente. Não escreva o artigo ainda.
Projeto de destino: ${project.name || "Zica.ai"}
Domínio: ${project.domain || ""}
Portal/fonte: ${input.sourceName || "não informado"}
URL de origem: ${input.sourceUrl}
Modo: ${input.automationMode || "ai_95"}
Links internos reais disponíveis: ${JSON.stringify(links)}

Decida: relevância, nicho, melhor ângulo, extensão necessária, palavra-chave foco, tipo de conteúdo, categoria WordPress, tags, risco editorial, necessidade de fonte primária e se pode seguir para publicação automática.
Regras:
- Nunca invente categoria, URL ou dado factual.
- Para jurídico/YMYL, marque requires_primary_source=true quando a tese central depender de lei, decisão, ato oficial ou número que não esteja confirmado.
- publish_recommendation=auto_publish somente quando o tema for adequado, a fonte estiver identificada e o risco for baixo/médio controlado.
- Se o tema não pertencer ao projeto, relevant=false e publish_recommendation=reject.
- article_length deve ser short, medium, long ou very-long; escolha o menor tamanho que cubra a intenção sem texto inflado.
- confidence de 0 a 100.
Retorne SOMENTE JSON com relevant, confidence, niche, analysis_angle, article_length, focus_keyword, content_type, wordpress_category, tags, risk_level, requires_primary_source, publish_recommendation, reason.

CONTEÚDO DE ORIGEM PARA ANÁLISE:
${source.slice(0, 50000)}`;
}

function generationPrompt(input: RewriteRequest, templatePrompt: string, project: Record<string, any>, band: Band, triage: SourceTriage, source: string) {
  const internalLinks = Array.isArray(project.links_prioritarios) ? project.links_prioritarios.filter((url: unknown) => typeof url === "string").slice(0, 12) : [];
  return `${templatePrompt}

TAREFA OPERACIONAL
Produza matéria original para ${project.name || "o projeto"}. Idioma ${input.language || "pt-BR"}. Extensão ${band.label}. Fonte ${input.sourceName || "não informada"}. URL ${input.sourceUrl}.
Classificação automática: nicho=${triage.niche}; ângulo=${triage.analysis_angle}; keyword=${triage.focus_keyword || "definir semanticamente"}; categoria=${triage.wordpress_category}; tags=${triage.tags.join(", ") || "definir semanticamente"}; risco=${triage.risk_level}.
Links internos REAIS disponíveis: ${JSON.stringify(internalLinks)}.

REGRAS EDITORIAIS OBRIGATÓRIAS:
1. Não invente leis, julgados, datas, estatísticas, pessoas ou fatos.
2. Diferencie notícia, alegação, tese e opinião.
3. Se conclusão depender de fonte primária ausente, needs_primary_source=true.
4. O título do WordPress será o único H1. content_html NÃO PODE conter <h1> nem Markdown com #.
5. content_html deve ser HTML semântico puro, com <p>, <h2>, <h3>, <strong>, listas, blockquote e tabelas somente quando úteis.
6. Nunca devolva Markdown dentro de content_html. Não use **, ##, ### ou cercas de código.
7. Use <strong> de forma editorial para direitos, prazos, riscos, requisitos, exceções e consequências, sem transformar parágrafos inteiros em negrito.
8. Primeiro parágrafo direto, de preferência 25 a 45 palavras quando funcionar como Answer Capsule.
9. Parágrafos legíveis, sem blocos excessivamente longos.
10. FAQ apenas se houver perguntas genuínas e resposta sustentada.
11. Sem repetição para inflar texto, sem jargão vazio, sem instruções internas, placeholders ou JSON dentro do artigo.
12. Reescrita deve ser substancial e transformativa. Atribua o veículo e a URL de origem sem copiar extensamente.
13. Use de 2 a 6 links internos SOMENTE entre as URLs reais fornecidas e apenas quando semanticamente pertinentes.
14. image_prompt deve descrever composição editorial horizontal, assunto central dentro de safe area para crop 1200x630, sem texto e sem marca d'água.
Retorne SOMENTE JSON válido com title, meta_description, slug, excerpt, keyword, content_html, primary_sources, secondary_sources, legal_authorities, verification_flags, needs_primary_source, internal_link_suggestions e image_prompt.

CONTEÚDO-FONTE:
${source.slice(0, 60000) || "Nenhum corpo de fonte fornecido."}`;
}

function reviewPrompt(article: ArticleDraft, source: string, url: string, triage: SourceTriage) {
  return `Revise juridicamente e factualmente a matéria contra a fonte e revise também a estrutura editorial. Detecte invenções, exageros, atribuições erradas e afirmações sem suporte. Preserve HTML semântico no corrected_content. Nunca use H1 no corpo, Markdown, cercas de código ou JSON no conteúdo. Exija H2 em matérias longas e destaques <strong> seletivos. Risco de triagem=${triage.risk_level}; fonte primária requerida na triagem=${triage.requires_primary_source}. Retorne SOMENTE JSON com pass, needs_primary_source, issues, corrected_title, corrected_excerpt, corrected_content, corrected_keyword, notes.
FONTE URL:${url}
FONTE:${source.slice(0, 50000)}
MATÉRIA:${JSON.stringify(article).slice(0, 70000)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const input = await req.json().catch(() => ({})) as RewriteRequest;
    if (!input.sourceUrl?.trim()) return json({ success: false, error: "sourceUrl é obrigatório", request_id: requestId }, 400);
    if (!isSafePublicHttpUrl(input.sourceUrl)) return json({ success: false, error: "sourceUrl inválida ou não pública", code: "unsafe_source_url", request_id: requestId }, 400);

    const actor = await resolveRequestActor(req, input.userId);
    const userId = actor.userId;
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let project: Record<string, any> = { name: "Conteúdo jurídico", domain: "", links_prioritarios: [] };
    if (input.projectId) {
      const { data } = await admin.from("projects").select("id,name,domain,wordpress_url,links_prioritarios,rss_feed_url").eq("id", input.projectId).eq("user_id", userId).maybeSingle();
      if (!data) return json({ success: false, error: "Projeto não encontrado ou acesso negado", request_id: requestId }, 403);
      project = data;
    }

    const { data: existing } = await admin.from("articles").select("*").eq("user_id", userId).eq("project_id", input.projectId || null).eq("source_canonical_url", input.sourceUrl).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return json({ success: true, duplicate: true, article: existing, request_id: requestId });

    const source = await loadSource(input.sourceUrl, input.sourceContent || "");
    const template = await resolveTemplate(admin, userId, input.projectId, input.promptTemplate);
    const orchestrator = await getOrchestratorForUser(userId);

    let triage = fallbackTriage(input);
    if ((input.automationMode || "ai_95") !== "manual") {
      const triageCall = await orchestrator.callWithMeta(
        "news_rewrite",
        [
          { role: "system", content: "Você é o agente de triagem editorial do Zica.ai. Classifique a fonte e devolva somente JSON válido. Não redija o artigo nesta etapa." },
          { role: "user", content: triagePrompt(input, source, project) },
        ],
        { preferredProvider: "openai", maxTokens: 3500, temperature: 0.1 },
      );
      triage = sanitizeTriage(parseJson<SourceTriage>(triageCall.content), input);
    }

    if (!triage.relevant || triage.publish_recommendation === "reject") {
      return json({ success: true, skipped: true, reason: "source_rejected_by_ai", triage, request_id: requestId });
    }

    const band = bandFor(triage.article_length);
    const generation = await orchestrator.callWithMeta(
      "news_rewrite",
      [
        { role: "system", content: `Você é ${template.agentName}. Entregue somente JSON válido. O corpo deve ser HTML semântico sem H1 e sem Markdown.` },
        { role: "user", content: generationPrompt(input, template.prompt, project, band, triage, source) },
      ],
      { preferredProvider: "openai", maxTokens: 24000, temperature: 0.25 },
    );

    const draft = parseJson<ArticleDraft>(generation.content);
    if (!draft?.title || !(draft.content_html || draft.content)) return json({ success: false, error: "IA não retornou matéria estruturada válida", request_id: requestId }, 502);

    const reviewCall = await orchestrator.callWithMeta(
      "legal_review",
      [
        { role: "system", content: "Revisão jurídica-editorial rigorosa. JSON apenas. Preserve HTML semântico e elimine Markdown residual." },
        { role: "user", content: reviewPrompt(draft, source, input.sourceUrl, triage) },
      ],
      { preferredProvider: generation.provider === "openai" ? "anthropic" : "openai", maxTokens: 10000, temperature: 0.1 },
    );

    const review = parseJson<Review>(reviewCall.content) || { pass: false, needs_primary_source: true, issues: ["Resposta de revisão inválida"] };
    const rawContent = String(review.corrected_content || draft.content_html || draft.content || "").trim();
    const audit = normalizeEditorialHtml(rawContent);
    const content = audit.html;
    const title = String(review.corrected_title || draft.title).trim().slice(0, 240);
    const excerpt = String(review.corrected_excerpt || draft.excerpt || draft.meta_description || content.replace(/<[^>]+>/g, " ").slice(0, 260)).trim();
    const keyword = String(review.corrected_keyword || draft.keyword || triage.focus_keyword || triage.niche || title).trim();
    const count = audit.metrics.wordCount;
    const needsPrimary = Boolean(review.needs_primary_source || draft.needs_primary_source || triage.requires_primary_source);
    const enoughDepth = count >= band.min;
    const visualStructure = (count < 500 || audit.metrics.h2Count > 0) && (count < 700 || audit.metrics.strongCount > 0);
    const formatPass = audit.pass && visualStructure;
    const reviewPass = Boolean(review.pass && !needsPrimary && enoughDepth && formatPass);
    const reviewIssues = [
      ...(review.issues || []),
      ...audit.issues,
      ...audit.fatalIssues.map((issue) => `HTML editorial: ${issue}`),
      ...(enoughDepth ? [] : [`Conteúdo abaixo do piso GEO do módulo: ${count}/${band.min} palavras.`]),
      ...(visualStructure ? [] : ["Estrutura visual/editorial insuficiente para publicação automática."]),
    ];
    const score = originalityScore(source, content);
    const rssFeedUrl = String(input.rssFeedUrl || project.rss_feed_url || "").trim() || null;
    const canAutoPublish = reviewPass && score >= 95 && triage.publish_recommendation === "auto_publish" && triage.confidence >= 85;

    const payload = {
      user_id: userId,
      project_id: input.projectId || null,
      title,
      content,
      excerpt,
      slug: slugify(String(draft.slug || title)),
      keyword,
      type: "blog",
      status: reviewPass ? "ready" : "draft",
      word_count: count,
      originality_score: score,
      image_prompt: draft.image_prompt || null,
      rss_feed_url: rssFeedUrl,
      source_canonical_url: input.sourceUrl,
      config: {
        type: "rewrite",
        source_url: input.sourceUrl,
        source_name: input.sourceName || null,
        rss_feed_url: rssFeedUrl,
        automation_mode: input.automationMode || "ai_95",
        automation_profile: triage,
        automation_confidence: triage.confidence,
        auto_publish_recommended: canAutoPublish,
        wordpress_categories: triage.wordpress_category ? [triage.wordpress_category] : [],
        wordpress_tags: triage.tags,
        focus_keyword: triage.focus_keyword || keyword,
        geo_word_band: { min: band.min, max: band.max },
        generation_provider: generation.provider,
        generation_model: generation.model,
        review_provider: reviewCall.provider,
        review_model: reviewCall.model,
        review_pass: reviewPass,
        needs_primary_source: needsPrimary,
        review_issues: reviewIssues,
        primary_sources: [...new Set([input.sourceUrl, ...(draft.primary_sources || [])])],
        secondary_sources: draft.secondary_sources || [],
        legal_authorities: draft.legal_authorities || [],
        verification_flags: draft.verification_flags || [],
        internal_link_suggestions: draft.internal_link_suggestions || [],
        editorial_html_version: "2.2.0",
        editorial_format_pass: formatPass,
        editorial_quality_issues: audit.issues,
        editorial_fatal_issues: audit.fatalIssues,
        editorial_metrics: audit.metrics,
        auto_generated: true,
        generated_at: new Date().toISOString(),
      },
    };

    const { data: article, error } = await admin.from("articles").insert(payload).select().single();
    if (error || !article) return json({ success: false, error: error?.message || "Falha ao salvar artigo", request_id: requestId }, 500);

    return json({
      success: true,
      article,
      triage,
      auto_publish_recommended: canAutoPublish,
      review: { pass: reviewPass, needs_primary_source: needsPrimary, issues: reviewIssues },
      editorial: { pass: formatPass, version: "2.2.0", issues: audit.issues, fatal_issues: audit.fatalIssues, metrics: audit.metrics },
      generation: { provider: generation.provider, model: generation.model },
      reviewer: { provider: reviewCall.provider, model: reviewCall.model },
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
