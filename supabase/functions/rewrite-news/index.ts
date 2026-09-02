import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

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
  if (value === "short") return { label: "300 a 500 palavras", min: 300, max: 500 };
  if (value === "long") return { label: "1.400 a 2.000 palavras", min: 1400, max: 2000 };
  if (value === "very-long") return { label: "2.500 a 4.000 palavras, somente quando o tema justificar conteúdo pilar", min: 2500, max: 4000 };
  return { label: "1.000 a 1.500 palavras", min: 1000, max: 1500 };
}

function wordCount(value: string) {
  return value.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
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

function generationPrompt(input: RewriteRequest, template: string, projectName: string, band: Band) {
  const source = String(input.sourceContent || "").slice(0, 60000);
  return `${template}\n\n---\n\nTAREFA OPERACIONAL\nProduza uma matéria original para o projeto: ${projectName}.\nIdioma: ${input.language || "pt-BR"}.\nExtensão editorial: ${band.label}.\nFonte informada: ${input.sourceName || "não informada"}.\nURL: ${input.sourceUrl}.\nNicho: ${input.niche || "jurídico"}.\nÂngulo: ${input.analysisAngle || "informativo, preventivo e tecnicamente preciso"}.\n\nREGRAS DE FONTE\n1. Não invente leis, súmulas, julgados, processos, datas, estatísticas, pessoas ou fatos.\n2. Diferencie notícia, alegação, tese jurídica, orientação geral e opinião.\n3. Quando uma conclusão depender de decisão/lei não presente na fonte, marque needs_primary_source=true.\n4. Use [VERIFICAR] somente quando a lacuna for indispensável.\n5. Não prometa resultado jurídico.\n6. Não use linguagem mercantilista ou captação apelativa.\n7. Dados, percentuais e anos somente podem aparecer quando existirem nas fontes fornecidas.\n\nREGRAS GEO/AEO\n1. Primeiro parágrafo com resposta/síntese direta.\n2. H1 único, H2/H3 semanticamente claros.\n3. Abaixo de H2/H3 que respondam a uma intenção concreta, abra com Answer Capsule de 25 a 45 palavras.\n4. Use tabela comparativa somente se houver dados/alternativas comparáveis.\n5. FAQ apenas quando houver perguntas úteis e respostas sustentadas.\n6. Não aumente o texto com repetição para atingir contagem de palavras.\n7. Gere sugestão visual sem simular prova, documento ou fato inexistente.\n\nRetorne SOMENTE JSON válido:\n{\"title\":\"...\",\"meta_description\":\"...\",\"slug\":\"...\",\"excerpt\":\"...\",\"keyword\":\"...\",\"content_html\":\"...\",\"primary_sources\":[],\"secondary_sources\":[],\"legal_authorities\":[],\"verification_flags\":[],\"needs_primary_source\":false,\"internal_link_suggestions\":[],\"image_prompt\":\"...\"}\n\nCONTEÚDO-FONTE:\n${source || "Nenhum corpo de fonte foi fornecido; seja conservador e sinalize necessidade de fonte primária."}`;
}

function reviewPrompt(article: ArticleDraft, source: string, sourceUrl: string) {
  return `Você é o revisor jurídico-editorial final. Revise a matéria contra a fonte. Detecte invenções, exageros, conclusões jurídicas absolutas, jurisprudência não comprovada e afirmações sem suporte. Corrija linguagem sem alterar fatos. Exija fonte primária quando necessária. Retorne SOMENTE JSON válido:\n{\"pass\":true,\"needs_primary_source\":false,\"issues\":[],\"corrected_title\":\"\",\"corrected_excerpt\":\"\",\"corrected_content\":\"\",\"corrected_keyword\":\"\",\"notes\":[]}\n\nFONTE URL: ${sourceUrl}\nFONTE:\n${source.slice(0, 50000)}\n\nMATÉRIA:\n${JSON.stringify(article).slice(0, 70000)}`;
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

    let projectName = "Conteúdo jurídico";
    if (input.projectId) {
      const { data: project } = await admin.from("projects").select("id,name").eq("id", input.projectId).eq("user_id", userId).maybeSingle();
      if (!project) return json({ success: false, error: "Projeto não encontrado ou acesso negado", request_id: requestId }, 403);
      projectName = String(project.name || projectName);
    }

    const { data: existing } = await admin.from("articles").select("*").eq("user_id", userId).eq("project_id", input.projectId || null).contains("config", { source_url: input.sourceUrl }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) return json({ success: true, duplicate: true, article: existing, request_id: requestId });

    const template = await resolveTemplate(admin, userId, input.projectId, input.promptTemplate);
    const orchestrator = await getOrchestratorForUser(userId);
    const band = bandFor(input.articleLength);
    const generation = await orchestrator.callWithMeta("news_rewrite", [
      { role: "system", content: `Você é ${template.agentName}. Entregue somente JSON válido.` },
      { role: "user", content: generationPrompt(input, template.prompt, projectName, band) },
    ], { preferredProvider: "openai", maxTokens: 24000, temperature: 0.3 });

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
        { role: "user", content: `MATÉRIA:\n${JSON.stringify(draft)}\n\nPROBLEMAS:\n- ${review.issues.join("\n- ")}` },
      ], { preferredProvider: generation.provider, maxTokens: 22000, temperature: 0.15 });
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
    const count = wordCount(content);
    const hasVerifyMarker = /\[VERIFICAR\]/i.test(content);
    const needsPrimary = Boolean(review.needs_primary_source || draft.needs_primary_source || hasVerifyMarker);
    const enoughDepth = count >= band.min;
    const reviewPass = Boolean(review.pass && !needsPrimary && enoughDepth);
    const status = reviewPass ? "ready" : "draft";

    const reviewIssues = [...(review.issues || []), ...(enoughDepth ? [] : [`Conteúdo abaixo do piso GEO do módulo: ${count}/${band.min} palavras.`])];
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
      word_count: count,
      originality_score: originalityScore(input.sourceContent || "", content),
      image_prompt: draft.image_prompt || null,
      config: {
        source_url: input.sourceUrl,
        source_name: input.sourceName || null,
        analysis_angle: input.analysisAngle || null,
        niche: input.niche || null,
        language: input.language || "pt-BR",
        prompt_template: template.templateName,
        geo_word_band: { min: band.min, max: band.max },
        generation_provider: generation.provider,
        generation_model: generation.model,
        review_provider: reviewCall.provider,
        review_model: reviewCall.model,
        review_pass: reviewPass,
        needs_primary_source: needsPrimary,
        review_issues: reviewIssues,
        review_notes: review.notes || [],
        primary_sources: draft.primary_sources || [],
        secondary_sources: draft.secondary_sources || [],
        legal_authorities: draft.legal_authorities || [],
        verification_flags: draft.verification_flags || [],
        internal_link_suggestions: draft.internal_link_suggestions || [],
        auto_generated: true,
        generated_at: new Date().toISOString(),
      },
    };

    const { data: article, error } = await admin.from("articles").insert(payload).select().single();
    if (error || !article) return json({ success: false, error: error?.message || "Falha ao salvar artigo", request_id: requestId }, 500);
    return json({ success: true, duplicate: false, article, review: { pass: reviewPass, needs_primary_source: needsPrimary, issues: reviewIssues }, generation: { provider: generation.provider, model: generation.model }, reviewer: { provider: reviewCall.provider, model: reviewCall.model }, request_id: requestId });
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
