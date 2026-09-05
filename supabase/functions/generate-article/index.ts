import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WordProfile = "short" | "medium" | "long" | "very-long";
interface ArticleConfig {
  keyword: string;
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
}

type Band = { label: string; min: number; max: number; purpose: string };

const REVIEW_MARKER = /\[(?:VERIFICAR|VALIDAR|CONFIRMAR|RECONSULTAR)\b[^\]\r\n]{0,300}\]/i;
const SOURCE_SIGNAL = /^ZICA_NEEDS_PRIMARY_SOURCE\s*:\s*(.+)$/im;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
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

function buildPrompt(config: ArticleConfig, band: Band) {
  const links = (config.internalLinks || []).slice(0, 12).map((item) => `${item.anchor}: ${item.url}`).join("\n");
  const projectContext = Object.entries(config.projectConfig || {}).filter(([, value]) => Boolean(value)).map(([key, value]) => `${key}: ${value}`).join("\n");

  return `Produza somente conteúdo editorial final publicável, sem explicar o processo interno e sem inserir mensagens de revisão no corpo.

ASSUNTO PRINCIPAL: ${config.keyword}
TÍTULO SUGERIDO: ${config.title || "crie um título claro, específico e fiel ao assunto"}
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
1. Densidade informacional e precisão valem mais que volume bruto.
2. Não repita ideias para atingir contagem de palavras.
3. Abra o primeiro parágrafo com resposta objetiva à intenção principal.
4. O título do WordPress será o único H1. No corpo use somente H2 e H3 semanticamente claros.
5. Quando um H2/H3 representar pergunta ou intenção objetiva, inicie com Answer Capsule de aproximadamente 25 a 45 palavras e depois aprofunde.
6. Inclua dados, percentuais, anos, estatísticas, leis, decisões ou estudos somente quando estiverem sustentados pelas fontes/contexto fornecidos. Nunca invente números ou autoridades.
7. ${config.includeTable ? "Use tabela comparativa quando houver elementos realmente comparáveis e dados suficientes." : "Tabela é opcional e só deve aparecer se acrescentar clareza."}
8. ${config.includeList === false ? "Não force listas." : "Use listas em passos, requisitos, documentos, critérios, riscos ou sínteses quando melhorarem a leitura."}
9. ${config.includeFaq === false ? "Não inclua FAQ." : `Inclua FAQ somente se houver perguntas úteis e respondíveis pelo conteúdo, com até ${config.faqCount || 5} itens.`}
10. Não use keyword stuffing, alegações sem fonte ou texto genérico de preenchimento.
11. Não escreva comentários técnicos TITLE_SEO, META_DESCRIPTION, JSON, prompts, TODOs ou qualquer metadado interno no corpo. Título SEO e meta description são produzidos por outra etapa do pipeline.

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
${config.sourcesContext || "Nenhuma fonte adicional fornecida."}

INSTRUÇÕES ADICIONAIS:
${config.customInstructions || config.additionalInfo || "Nenhuma."}`;
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
    let systemPrompt = "Você é o redator editorial principal do Zica.ai. Entregue somente conteúdo publicável ou o sinal ZICA_NEEDS_PRIMARY_SOURCE quando uma fonte primária for indispensável.";
    let promptVersion = 0;
    if (admin) {
      const { data: settings } = await admin.from("user_settings").select("ai_provider").eq("user_id", userId).maybeSingle();
      const provider = String(settings?.ai_provider || "").toLowerCase();
      if (provider === "openai" || provider === "anthropic") preferredProvider = provider;
      if (config.projectId) {
        const { data: project } = await admin.from("projects").select("id,name,description,commercial_info,social_links,editorial_identity").eq("id", config.projectId).eq("user_id", userId).maybeSingle();
        if (!project) return json({ error: "Projeto não encontrado ou acesso negado", request_id: requestId }, 403);
        config.projectConfig = {
          ...(config.projectConfig || {}),
          project_name: String(project.name || ""),
          project_description: String(project.description || ""),
          commercial_info: JSON.stringify(project.commercial_info || {}),
          social_links: JSON.stringify(project.social_links || {}),
          editorial_identity: JSON.stringify(project.editorial_identity || {}),
        };
      }
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

    const band = bandFor(config.wordCount);
    const prompt = buildPrompt(config, band);
    const orchestrator = await getOrchestratorForUser(userId);
    let generation = await orchestrator.callWithMeta("article_generation", [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ], { preferredProvider, maxTokens: 32000, temperature: 0.35 });

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

    console.log(`[generate-article] request=${requestId} provider=${generation.provider} model=${generation.model} words=${words} band=${band.min}-${band.max}`);
    if (body?.responseFormat === "json") {
      return json({ success: true, content, provider: generation.provider, model: generation.model, words, promptVersion, request_id: requestId });
    }
    return sse(content, generation.provider, generation.model, promptVersion);
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ error: error.message, code: error.code, request_id: requestId }, error.status);
    return json({ error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
