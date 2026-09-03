import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { normalizeEditorialHtml } from "../_shared/editorial-html.ts";
import {
  buildEditorialDecisionPrompt,
  fallbackEditorialDecision,
  normalizeEditorialDecision,
  type EditorialAutonomyInput,
  type EditorialDecision,
  type RepostBatchContext,
  wordBandFor,
} from "../_shared/editorial-autonomy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RewriteRequest = {
  sourceUrl: string;
  sourceContent?: string;
  sourceName?: string;
  analysisAngle?: string;
  keyword?: string;
  niche?: string;
  articleLength?: "short" | "medium" | "long" | "very-long" | "extra-long" | "auto" | string;
  projectId?: string | null;
  userId?: string;
  language?: string;
  promptTemplate?: string;
  emotionalTriggerOverride?: string;
  editorialAutonomy?: boolean;
  repostBatchContext?: RepostBatchContext;
  rewriteMode?: "standard" | "madeira_neles" | string;
};

type ArticleDraft = {
  title: string;
  meta_description?: string;
  slug?: string;
  excerpt?: string;
  keyword?: string;
  secondary_keywords?: string[];
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

type ProjectContext = {
  id?: string;
  name: string;
  description: string;
  niche: string;
  tone: string;
  complianceRules: string;
};

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
  try {
    return JSON.parse(cleaned.slice(first, last + 1)) as T;
  } catch {
    return null;
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

function plainText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function originalityScore(source: string, generated: string) {
  if (!source.trim() || !generated.trim()) return 80;
  const normalize = (text: string) => text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);
  const sourceWords = new Set(normalize(source));
  const outputWords = normalize(generated);
  if (!outputWords.length) return 0;
  const overlap = outputWords.filter((word) => sourceWords.has(word)).length / outputWords.length;
  return Math.max(0, Math.min(100, Math.round((1 - overlap) * 100)));
}

function scoreSeo(title: string, excerpt: string, keyword: string, content: string) {
  let score = 55;
  const normalizedTitle = title.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();
  const normalizedContent = plainText(content).toLowerCase();
  if (title.length >= 35 && title.length <= 70) score += 15;
  if (excerpt.length >= 110 && excerpt.length <= 170) score += 15;
  if (normalizedKeyword && normalizedTitle.includes(normalizedKeyword)) score += 8;
  if (normalizedKeyword && normalizedContent.includes(normalizedKeyword)) score += 7;
  return Math.min(100, score);
}

function scoreReadability(metrics: { paragraphCount: number; wordCount: number; h2Count: number; listCount: number }) {
  let score = 72;
  if (metrics.paragraphCount >= Math.max(5, Math.floor(metrics.wordCount / 180))) score += 10;
  if (metrics.h2Count >= 2) score += 10;
  if (metrics.listCount >= 1) score += 5;
  return Math.min(100, score);
}

function scoreQuality(reviewPass: boolean, formatPass: boolean, enoughDepth: boolean, needsPrimary: boolean) {
  let score = 50;
  if (reviewPass) score += 20;
  if (formatPass) score += 15;
  if (enoughDepth) score += 10;
  if (!needsPrimary) score += 5;
  return Math.min(100, score);
}

async function resolveTemplate(admin: any, userId: string, projectId?: string | null, explicit?: string) {
  let templateName = explicit || "legal_news_rdm_v1";
  if (!explicit && projectId) {
    const { data: agent } = await admin
      .from("news_agents")
      .select("prompt_template")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (agent?.prompt_template) templateName = String(agent.prompt_template);
  }
  const { data: template } = await admin
    .from("prompt_templates")
    .select("name,prompt,agent_name")
    .eq("user_id", userId)
    .eq("name", templateName)
    .maybeSingle();
  return {
    templateName,
    prompt: String(template?.prompt || ""),
    agentName: String(template?.agent_name || "LEX RDM NEWS"),
  };
}

async function resolveProject(admin: any, userId: string, projectId?: string | null): Promise<ProjectContext> {
  if (!projectId) {
    return {
      name: "Conteúdo editorial",
      description: "",
      niche: "",
      tone: "profissional",
      complianceRules: "",
    };
  }
  const { data: project } = await admin
    .from("projects")
    .select("id,name,description,nicho,tom_padrao,compliance_rules")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) throw new RequestAuthError("Projeto não encontrado ou acesso negado", 403, "project_forbidden");
  return {
    id: String(project.id),
    name: String(project.name || "Conteúdo editorial"),
    description: String(project.description || ""),
    niche: String(project.nicho || ""),
    tone: String(project.tom_padrao || "profissional"),
    complianceRules: String(project.compliance_rules || ""),
  };
}

async function recentEditorialDecisions(admin: any, userId: string, projectId?: string | null) {
  let query = admin
    .from("articles")
    .select("nicho_detectado,angulo_analise,emotional_trigger,keyword,config,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);
  query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
  const { data } = await query;
  return (data || []).map((row: Record<string, any>) => ({
    niche: row.nicho_detectado || row.config?.editorial_decision?.niche || null,
    analysisAngleId: row.config?.editorial_decision?.analysisAngleId || null,
    analysisAngle: row.angulo_analise || row.config?.editorial_decision?.analysisAngle || null,
    emotionalTrigger: row.emotional_trigger || row.config?.editorial_decision?.emotionalTrigger || null,
    articleLength: row.config?.editorial_decision?.articleLength || null,
    keyword: row.keyword || null,
    sourceName: row.config?.source_name || null,
    createdAt: row.created_at || null,
  }));
}

function editorialInput(
  input: RewriteRequest,
  project: ProjectContext,
  recent: Awaited<ReturnType<typeof recentEditorialDecisions>>,
): EditorialAutonomyInput {
  const batch = input.repostBatchContext || {};
  return {
    title: String(input.sourceContent || "").split(/\r?\n/)[0]?.slice(0, 300),
    sourceUrl: input.sourceUrl,
    sourceName: input.sourceName,
    sourceContent: input.sourceContent,
    projectName: project.name,
    projectDescription: project.description,
    projectNiche: project.niche,
    projectTone: project.tone,
    projectComplianceRules: project.complianceRules,
    keywordHint: input.keyword,
    nicheHint: input.niche,
    analysisAngleHint: input.analysisAngle,
    articleLengthHint: input.articleLength,
    emotionalTriggerHint: input.emotionalTriggerOverride,
    batchContext: {
      ...batch,
      recentDecisions: [...(batch.recentDecisions || []), ...recent].slice(0, 8),
    },
  };
}

async function resolveEditorialDecision(
  orchestrator: Awaited<ReturnType<typeof getOrchestratorForUser>>,
  input: RewriteRequest,
  context: EditorialAutonomyInput,
): Promise<{ decision: EditorialDecision; provider: string | null; model: string | null; warning: string | null }> {
  if (input.editorialAutonomy === false) {
    const manual = normalizeEditorialDecision({
      niche: input.niche,
      analysisAngle: input.analysisAngle,
      articleLength: input.articleLength,
      emotionalTrigger: input.emotionalTriggerOverride,
      keyword: input.keyword,
      tone: context.projectTone,
      confidence: 100,
      reasoningSummary: "Seleção manual do operador aplicada como override editorial.",
    }, context, "manual");
    return { decision: manual, provider: null, model: null, warning: null };
  }

  try {
    const call = await orchestrator.callWithMeta(
      "news_editorial_policy",
      [
        { role: "system", content: "Você governa o rol de repostagens. Responda somente JSON válido e aplique as regras de segurança editorial." },
        { role: "user", content: buildEditorialDecisionPrompt(context) },
      ],
      { preferredProvider: "openai", maxTokens: 2200, temperature: 0.15 },
    );
    const parsed = parseJson<Record<string, unknown>>(call.content);
    if (!parsed) throw new Error("Resposta editorial sem JSON válido");
    return {
      decision: normalizeEditorialDecision(parsed, context, "ai"),
      provider: call.provider,
      model: call.model,
      warning: null,
    };
  } catch (error) {
    const fallback = fallbackEditorialDecision(context);
    return {
      decision: fallback,
      provider: null,
      model: null,
      warning: error instanceof Error ? error.message : "Falha na decisão editorial por IA",
    };
  }
}

function generationPrompt(
  input: RewriteRequest,
  templatePrompt: string,
  project: ProjectContext,
  decision: EditorialDecision,
) {
  const source = String(input.sourceContent || "").slice(0, 60000);
  const band = wordBandFor(decision.articleLength);
  return `${templatePrompt}

TAREFA OPERACIONAL
Produza matéria original para ${project.name}. Idioma ${input.language || "pt-BR"}. Extensão ${band.label}. Fonte ${input.sourceName || "não informada"}. URL ${input.sourceUrl}.

DECISÃO DO AGENTE EDITORIAL, DE CUMPRIMENTO OBRIGATÓRIO
- Nicho: ${decision.niche}
- Ângulo: ${decision.analysisAngle}
- Palavra-chave: ${decision.keyword}
- Tom: ${decision.tone}
- Gatilho emocional: ${decision.emotionalTrigger}, intensidade ${decision.emotionalIntensity}
- Risco: ${decision.riskLevel}
- Diversidade no rol: ${decision.diversityNotes.join(" | ") || "sem observação adicional"}
- Instrução específica: ${decision.promptAddendum}

REGRAS EDITORIAIS OBRIGATÓRIAS
1. Não invente leis, julgados, datas, estatísticas, pessoas ou fatos.
2. Diferencie notícia, alegação, tese, interpretação e opinião.
3. Se conclusão depender de fonte primária ausente, needs_primary_source=true.
4. O título do WordPress será o único H1. content_html não pode conter <h1> nem Markdown com #.
5. content_html deve ser HTML semântico puro, com <p>, <h2>, <h3>, <strong>, listas, blockquote e tabelas somente quando úteis.
6. Nunca devolva Markdown dentro de content_html. Não use **, ##, ### ou cercas de código.
7. Use <strong> de forma editorial para direitos, prazos, riscos, requisitos, exceções e consequências.
8. Abra com resposta direta de 25 a 45 palavras quando houver pergunta ou dúvida objetiva.
9. Não use o gatilho emocional para exagerar fatos ou criar medo artificial.
10. Em temas jurídicos ou médicos, informe limites, necessidade de análise individual e fonte primária quando aplicável.
11. Inclua crédito claro à fonte original e link, sem reproduzir blocos extensos.
12. image_prompt deve descrever composição editorial horizontal 1200x630, sem texto, sem marca d'água e coerente com o gatilho escolhido.
13. Sem repetição para inflar texto, sem placeholders, instruções internas ou JSON dentro do artigo.

Retorne somente JSON válido com title, meta_description, slug, excerpt, keyword, secondary_keywords, content_html, primary_sources, secondary_sources, legal_authorities, verification_flags, needs_primary_source, internal_link_suggestions e image_prompt.

CONTEÚDO-FONTE
${source || "Nenhum corpo de fonte fornecido."}`;
}

function reviewPrompt(article: ArticleDraft, source: string, sourceUrl: string, decision: EditorialDecision) {
  return `Revise a matéria contra a fonte e a decisão editorial. Detecte invenções, exageros, afirmações sem suporte, uso indevido do gatilho emocional, ausência de crédito e estrutura editorial deficiente. Preserve HTML semântico em corrected_content. Nunca use H1 no corpo, Markdown, cercas de código ou JSON. Retorne somente JSON com pass, needs_primary_source, issues, corrected_title, corrected_excerpt, corrected_content, corrected_keyword e notes.
DECISÃO:${JSON.stringify(decision)}
FONTE URL:${sourceUrl}
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

    const actor = await resolveRequestActor(req, input.userId);
    const userId = actor.userId;
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const project = await resolveProject(admin, userId, input.projectId);

    const { data: existing } = await admin
      .from("articles")
      .select("*")
      .eq("user_id", userId)
      .eq("project_id", input.projectId || null)
      .contains("config", { source_url: input.sourceUrl })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const existingDecision = existing.config?.editorial_decision || null;
      const existingCompliance = existing.config?.compliance || {
        originalityScore: Number(existing.originality_score || 0),
        citationCompliance: existing.config?.needs_primary_source !== true,
        seoOptimized: Number(existing.seo_score || 0) >= 80,
        readabilityScore: Number(existing.config?.readability_score || 0),
      };
      return json({
        success: true,
        duplicate: true,
        article: {
          ...existing,
          quality_score: Number(existing.config?.quality_score || 0),
          readability_score: Number(existing.config?.readability_score || 0),
          seo_optimized: Number(existing.seo_score || 0) >= 80,
          niche: existing.nicho_detectado || existingDecision?.niche || "geral",
          reading_time: `${Math.max(1, Math.ceil(Number(existing.word_count || 0) / 220))} min`,
          credits: String(existing.config?.source_name || "Fonte original identificada"),
          tags: [],
          keywords: [existing.keyword].filter(Boolean),
        },
        compliance: existingCompliance,
        editorialDecision: existingDecision,
        request_id: requestId,
      });
    }

    const [template, recent, orchestrator] = await Promise.all([
      resolveTemplate(admin, userId, input.projectId, input.promptTemplate),
      recentEditorialDecisions(admin, userId, input.projectId),
      getOrchestratorForUser(userId),
    ]);

    const decisionContext = editorialInput(input, project, recent);
    const decisionResult = await resolveEditorialDecision(orchestrator, input, decisionContext);
    const decision = decisionResult.decision;
    const band = wordBandFor(decision.articleLength);
    const maxTokens = decision.articleLength === "very-long" ? 30000 : decision.articleLength === "long" ? 26000 : 22000;

    const generation = await orchestrator.callWithMeta(
      "news_rewrite",
      [
        { role: "system", content: `Você é ${template.agentName}. Entregue somente JSON válido. O corpo deve ser HTML semântico sem H1 e sem Markdown.` },
        { role: "user", content: generationPrompt(input, template.prompt, project, decision) },
      ],
      { preferredProvider: "openai", maxTokens, temperature: 0.25 },
    );

    const draft = parseJson<ArticleDraft>(generation.content);
    if (!draft?.title || !(draft.content_html || draft.content)) {
      return json({ success: false, error: "IA não retornou matéria estruturada válida", editorialDecision: decision, request_id: requestId }, 502);
    }

    const reviewCall = await orchestrator.callWithMeta(
      "legal_review",
      [
        { role: "system", content: "Revisão factual, jurídica e editorial rigorosa. JSON apenas. Preserve HTML semântico e elimine Markdown residual." },
        { role: "user", content: reviewPrompt(draft, input.sourceContent || "", input.sourceUrl, decision) },
      ],
      { preferredProvider: generation.provider === "openai" ? "anthropic" : "openai", maxTokens: 12000, temperature: 0.05 },
    );

    const review = parseJson<Review>(reviewCall.content) || {
      pass: false,
      needs_primary_source: true,
      issues: ["Resposta de revisão inválida"],
    };

    const rawContent = String(review.corrected_content || draft.content_html || draft.content || "").trim();
    const audit = normalizeEditorialHtml(rawContent);
    const content = audit.html;
    const title = String(review.corrected_title || draft.title).trim().slice(0, 240);
    const excerpt = String(review.corrected_excerpt || draft.excerpt || draft.meta_description || plainText(content).slice(0, 160)).trim().slice(0, 260);
    const keyword = String(review.corrected_keyword || draft.keyword || decision.keyword || title).trim().slice(0, 180);
    const wordCount = audit.metrics.wordCount;
    const needsPrimary = Boolean(review.needs_primary_source || draft.needs_primary_source || /\[VERIFICAR\]/i.test(content));
    const enoughDepth = wordCount >= band.min;
    const visualStructure = (wordCount < 500 || audit.metrics.h2Count > 0) && (wordCount < 700 || audit.metrics.strongCount > 0);
    const formatPass = audit.pass && visualStructure;
    const requiresHumanReview = decision.requiresHumanReview || needsPrimary;
    const reviewPass = Boolean(review.pass && !requiresHumanReview && enoughDepth && formatPass);
    const reviewIssues = [
      ...(review.issues || []),
      ...audit.issues,
      ...audit.fatalIssues.map((issue) => `HTML editorial: ${issue}`),
      ...(enoughDepth ? [] : [`Conteúdo abaixo do piso definido pelo agente: ${wordCount}/${band.min} palavras.`]),
      ...(visualStructure ? [] : ["Estrutura visual/editorial insuficiente para publicação automática."]),
      ...(decision.requiresHumanReview ? ["O agente editorial classificou a matéria para revisão humana obrigatória."] : []),
    ];

    const originality = originalityScore(input.sourceContent || "", content);
    const seoScore = scoreSeo(title, excerpt, keyword, content);
    const readabilityScore = scoreReadability(audit.metrics);
    const qualityScore = scoreQuality(Boolean(review.pass), formatPass, enoughDepth, needsPrimary);
    const compliance = {
      originalityScore: originality,
      citationCompliance: Boolean(input.sourceName && input.sourceUrl && !needsPrimary),
      seoOptimized: seoScore >= 80,
      readabilityScore,
    };

    const imagePromptBase = String(draft.image_prompt || "Composição editorial jornalística horizontal, assunto principal centralizado, sem texto e sem marca d'água").trim();
    const imagePrompt = `${imagePromptBase}. Gatilho editorial: ${decision.emotionalTrigger}, intensidade ${decision.emotionalIntensity}. Tom: ${decision.tone}. ${decision.promptAddendum}`.slice(0, 3000);
    const now = new Date().toISOString();
    const config = {
      source_url: input.sourceUrl,
      source_name: input.sourceName || null,
      source_type: input.repostBatchContext?.sourceType || "manual",
      schedule_id: input.repostBatchContext?.scheduleId || null,
      agent_id: input.repostBatchContext?.agentId || null,
      queue_position: input.repostBatchContext?.queuePosition || null,
      queue_size: input.repostBatchContext?.queueSize || null,
      geo_word_band: { min: band.min, max: band.max, label: band.label },
      editorial_autonomy: input.editorialAutonomy !== false,
      editorial_decision: decision,
      editorial_decision_provider: decisionResult.provider,
      editorial_decision_model: decisionResult.model,
      editorial_decision_warning: decisionResult.warning,
      editorial_policy_version: "3.0.0",
      prompt_template: template.templateName,
      generation_provider: generation.provider,
      generation_model: generation.model,
      review_provider: reviewCall.provider,
      review_model: reviewCall.model,
      review_pass: reviewPass,
      requires_human_review: requiresHumanReview,
      needs_primary_source: needsPrimary,
      review_issues: reviewIssues,
      primary_sources: draft.primary_sources || [],
      secondary_sources: draft.secondary_sources || [],
      legal_authorities: draft.legal_authorities || [],
      verification_flags: draft.verification_flags || [],
      internal_link_suggestions: draft.internal_link_suggestions || [],
      editorial_html_version: "3.0.0",
      editorial_format_pass: formatPass,
      editorial_quality_issues: audit.issues,
      editorial_fatal_issues: audit.fatalIssues,
      editorial_metrics: audit.metrics,
      quality_score: qualityScore,
      readability_score: readabilityScore,
      compliance,
      auto_generated: true,
      generated_at: now,
    };

    const payload = {
      user_id: userId,
      project_id: input.projectId || null,
      title,
      content,
      excerpt,
      slug: slugify(String(draft.slug || title)),
      keyword,
      secondary_keywords: Array.isArray(draft.secondary_keywords) ? draft.secondary_keywords.slice(0, 20) : [],
      type: "blog",
      status: reviewPass ? "ready" : "draft",
      word_count: wordCount,
      seo_score: seoScore,
      originality_score: originality,
      image_prompt: imagePrompt,
      emotional_trigger: decision.emotionalTrigger,
      emotional_confidence: decision.confidence / 100,
      emotional_intensity: decision.emotionalIntensity,
      nicho_detectado: decision.niche,
      angulo_analise: decision.analysisAngle,
      compliance_aplicado: "Lei 9.610/98, precisão factual, fonte identificada, revisão editorial e política de sensibilidade",
      config,
    };

    const { data: article, error } = await admin.from("articles").insert(payload).select().single();
    if (error || !article) return json({ success: false, error: error?.message || "Falha ao salvar artigo", request_id: requestId }, 500);

    const responseArticle = {
      ...article,
      quality_score: qualityScore,
      readability_score: readabilityScore,
      seo_optimized: seoScore >= 80,
      reading_time: `${Math.max(1, Math.ceil(wordCount / 220))} min`,
      credits: input.sourceName ? `Fonte original: ${input.sourceName}` : "Fonte original identificada",
      niche: decision.niche,
      tags: [],
      keywords: [keyword, ...(draft.secondary_keywords || [])].filter(Boolean),
    };

    return json({
      success: true,
      article: responseArticle,
      compliance,
      review: { pass: reviewPass, needs_primary_source: needsPrimary, issues: reviewIssues },
      editorial: { pass: formatPass, version: "3.0.0", issues: audit.issues, fatal_issues: audit.fatalIssues, metrics: audit.metrics },
      editorialDecision: decision,
      generation: { provider: generation.provider, model: generation.model },
      reviewer: { provider: reviewCall.provider, model: reviewCall.model },
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    }
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
