import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { adminClient, errorStatus, getRuntimeKeys, resolveUserCaller } from "../_shared/supabase-runtime.ts";

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
  niche?: string;
  articleLength?: "short" | "medium" | "long" | "very-long" | string;
  projectId?: string | null;
  userId?: string;
  language?: string;
  promptTemplate?: string;
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
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

function targetLength(value?: string) {
  if (value === "short") return "700 a 1000 palavras";
  if (value === "long") return "2200 a 2800 palavras";
  if (value === "very-long") return "3500 a 4500 palavras";
  return "1200 a 1800 palavras";
}

function originalityScore(source: string, generated: string) {
  if (!source.trim() || !generated.trim()) return 80;
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length >= 4);
  const sourceSet = new Set(normalize(source));
  const output = normalize(generated);
  if (!output.length) return 0;
  const overlaps = output.filter((token) => sourceSet.has(token)).length;
  return Math.max(0, Math.min(100, Math.round((1 - overlaps / output.length) * 100)));
}

async function resolveTemplate(admin: any, userId: string, projectId?: string | null, explicit?: string) {
  let templateName = explicit || "legal_news_rdm_v1";
  if (!explicit && projectId) {
    const { data: agent } = await admin.from("news_agents").select("prompt_template").eq("project_id", projectId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (agent?.prompt_template) templateName = String(agent.prompt_template);
  }
  const { data: template } = await admin.from("prompt_templates").select("name,prompt,agent_name").eq("user_id", userId).eq("name", templateName).maybeSingle();
  return { templateName, prompt: String(template?.prompt || ""), agentName: String(template?.agent_name || "LEX RDM NEWS") };
}

function generationPrompt(input: RewriteRequest, template: string, projectName: string) {
  const source = (input.sourceContent || "").slice(0, 60000);
  return `${template}\n\n---\nTAREFA OPERACIONAL\nProduza uma matéria original para o projeto: ${projectName}.\nIdioma: ${input.language || "pt-BR"}.\nExtensão: ${targetLength(input.articleLength)}.\nFonte informada: ${input.sourceName || "não informada"}.\nURL: ${input.sourceUrl}.\nNicho: ${input.niche || "jurídico"}.\nÂngulo: ${input.analysisAngle || "informativo, preventivo e tecnicamente preciso"}.\n\nREGRAS DE FONTE\n1. Não invente leis, súmulas, julgados, processos, datas, estatísticas, pessoas ou fatos.\n2. Diferencie notícia, alegação, tese jurídica, orientação geral e opinião.\n3. Quando uma conclusão depender de decisão/lei não presente na fonte, marque needs_primary_source=true.\n4. Use [VERIFICAR] apenas quando a lacuna for indispensável.\n5. Não prometa resultado jurídico.\n6. Para Direito News, voz jornalística independente. Para RDM, fechamento institucional sóbrio e informativo.\n7. Estruture semanticamente para SEO/GEO/AEO sem keyword stuffing.\n8. Gere sugestão de imagem editorial sem simular prova, documento ou fato inexistente.\n\nRetorne SOMENTE JSON válido:\n{\"title\":\"...\",\"meta_description\":\"...\",\"slug\":\"...\",\"excerpt\":\"...\",\"keyword\":\"...\",\"content_html\":\"...\",\"primary_sources\":[],\"secondary_sources\":[],\"legal_authorities\":[],\"verification_flags\":[],\"needs_primary_source\":false,\"internal_link_suggestions\":[],\"image_prompt\":\"...\"}\n\nCONTEÚDO-FONTE:\n${source || "Nenhum corpo de fonte foi fornecido; seja conservador e sinalize necessidade de fonte primária."}`;
}

function reviewPrompt(article: ArticleDraft, source: string, sourceUrl: string) {
  return `Você é o revisor jurídico-editorial final. Revise a matéria contra a fonte fornecida. Detecte invenções, exageros, conclusões jurídicas absolutas, publicidade incompatível e afirmações sem suporte. Exija fonte primária quando necessário. Retorne SOMENTE JSON válido:\n{\"pass\":true,\"needs_primary_source\":false,\"issues\":[],\"corrected_title\":\"\",\"corrected_excerpt\":\"\",\"corrected_content\":\"\",\"corrected_keyword\":\"\",\"notes\":[]}\n\nFONTE URL: ${sourceUrl}\nFONTE:\n${source.slice(0, 50000)}\n\nMATÉRIA:\n${JSON.stringify(article).slice(0, 70000)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const input = await req.json() as RewriteRequest;
    if (!input.sourceUrl?.trim()) return json({ success: false, error: "sourceUrl é obrigatório", request_id: requestId }, 400);

    const runtime = getRuntimeKeys();
    if (!runtime.url || !runtime.secretKey || !runtime.publicKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const caller = await resolveUserCaller(req, runtime, input.userId);
    const userId = caller.userId;
    const admin = adminClient(runtime);

    let projectName = "Conteúdo jurídico";
    if (input.projectId) {
      const { data: project } = await admin.from("projects").select("id,name").eq("id", input.projectId).eq("user_id", userId).maybeSingle();
      if (!project) return json({ success: false, error: "Projeto não encontrado ou acesso negado", request_id: requestId }, 403);
      projectName = String(project.name || projectName);
    }

    let duplicate = admin.from("articles").select("*").eq("user_id", userId).contains("config", { source_url: input.sourceUrl }).order("created_at", { ascending: false }).limit(1);
    duplicate = input.projectId ? duplicate.eq("project_id", input.projectId) : duplicate.is("project_id", null);
    const { data: existing } = await duplicate.maybeSingle();
    if (existing) return json({ success: true, duplicate: true, article: existing, request_id: requestId });

    const template = await resolveTemplate(admin, userId, input.projectId, input.promptTemplate);
    const orchestrator = await getOrchestratorForUser(userId);
    const generation = await orchestrator.callWithMeta("news_rewrite", [
      { role: "system", content: `Você é ${template.agentName}. Entregue somente o JSON solicitado.` },
      { role: "user", content: generationPrompt(input, template.prompt, projectName) },
    ], { preferredProvider: "openai", maxTokens: 20000, temperature: 0.35 });

    let draft = parseJson<ArticleDraft>(generation.content);
    if (!draft?.title || !(draft.content_html || draft.content)) return json({ success: false, error: "IA não retornou matéria estruturada válida", generation_provider: generation.provider, request_id: requestId }, 502);

    let reviewCall = await orchestrator.callWithMeta("legal_review", [
      { role: "system", content: "Faça revisão jurídica-editorial rigorosa e devolva somente JSON." },
      { role: "user", content: reviewPrompt(draft, input.sourceContent || "", input.sourceUrl) },
    ], { preferredProvider: generation.provider === "openai" ? "anthropic" : "openai", maxTokens: 10000, temperature: 0.1 });
    let review = parseJson<Review>(reviewCall.content) || { pass: false, needs_primary_source: true, issues: ["Resposta de revisão inválida"] };

    if (!review.pass && !review.needs_primary_source && review.issues?.length) {
      const correction = await orchestrator.callWithMeta("content_editing", [
        { role: "system", content: "Corrija somente os problemas indicados. Não invente fatos. Retorne o mesmo JSON estrutural da matéria." },
        { role: "user", content: `MATÉRIA:\n${JSON.stringify(draft)}\n\nPROBLEMAS:\n${review.issues.join("\n- ")}` },
      ], { preferredProvider: generation.provider, maxTokens: 18000, temperature: 0.2 });
      const corrected = parseJson<ArticleDraft>(correction.content);
      if (corrected?.title && (corrected.content_html || corrected.content)) draft = corrected;
      reviewCall = await orchestrator.callWithMeta("legal_review", [
        { role: "system", content: "Revisão final. Retorne somente JSON." },
        { role: "user", content: reviewPrompt(draft, input.sourceContent || "", input.sourceUrl) },
      ], { preferredProvider: reviewCall.provider, maxTokens: 8000, temperature: 0.1 });
      review = parseJson<Review>(reviewCall.content) || review;
    }

    const content = String(review.corrected_content || draft.content_html || draft.content || "").trim();
    const title = String(review.corrected_title || draft.title).trim().slice(0, 240);
    const excerpt = String(review.corrected_excerpt || draft.excerpt || draft.meta_description || content.replace(/<[^>]+>/g, " ").slice(0, 260)).trim();
    const keyword = String(review.corrected_keyword || draft.keyword || input.niche || title).trim();
    const hasVerifyMarker = /\[VERIFICAR\]/i.test(content);
    const needsPrimary = Boolean(review.needs_primary_source || draft.needs_primary_source || hasVerifyMarker);
    const reviewPass = Boolean(review.pass && !needsPrimary && content.length >= 200);
    const status = reviewPass ? "ready" : "draft";
    const score = originalityScore(input.sourceContent || "", content);
    const now = new Date().toISOString();

    const payload = {
      user_id: userId,
      project_id: input.projectId || null,
      title,
      content,
      excerpt,
      slug: slugify(String(draft.slug || title)),
      keyword,
      type: "blog",
      status,
      word_count: content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length,
      originality_score: score,
      image_prompt: draft.image_prompt || null,
      traffic_wave_status: status === "ready" ? "draft" : "draft",
      config: {
        source_url: input.sourceUrl,
        source_name: input.sourceName || null,
        analysis_angle: input.analysisAngle || null,
        niche: input.niche || null,
        language: input.language || "pt-BR",
        prompt_template: template.templateName,
        generation_provider: generation.provider,
        generation_model: generation.model,
        review_provider: reviewCall.provider,
        review_model: reviewCall.model,
        review_pass: reviewPass,
        needs_primary_source: needsPrimary,
        review_issues: review.issues || [],
        review_notes: review.notes || [],
        primary_sources: draft.primary_sources || [],
        secondary_sources: draft.secondary_sources || [],
        legal_authorities: draft.legal_authorities || [],
        verification_flags: draft.verification_flags || [],
        internal_link_suggestions: draft.internal_link_suggestions || [],
        auto_generated: true,
        generated_at: now,
        internal_call: caller.internal,
      },
    };

    const { data: article, error } = await admin.from("articles").insert(payload).select().single();
    if (error || !article) return json({ success: false, error: error?.message || "Falha ao salvar artigo", request_id: requestId }, 500);
    return json({
      success: true,
      duplicate: false,
      article,
      review: { pass: reviewPass, needs_primary_source: needsPrimary, issues: review.issues || [] },
      generation: { provider: generation.provider, model: generation.model },
      reviewer: { provider: reviewCall.provider, model: reviewCall.model },
      request_id: requestId,
    });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, errorStatus(error, 500));
  }
});
