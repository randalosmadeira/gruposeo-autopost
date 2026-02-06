import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "generate-authority-plan-stream";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface AuthorityPlanRequest {
  centralTheme: string;
  satelliteCount: number;
  projectId: string;
  language: string;
  country: string;
  publicationMode: string;
}

interface ArticlePlan {
  title: string;
  keyword: string;
  outline: string[];
  type: "pillar" | "satellite";
}

function createSSEMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function callAI(messages: { role: string; content: string }[]): Promise<string> {
  const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!AI_API_KEY) throw new Error("AI API key is not configured");

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit exceeded");
    if (response.status === 402) throw new Error("Payment required");
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function generateImage(prompt: string): Promise<string | null> {
  const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!AI_API_KEY) return null;

  try {
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  log.requestStart(req.method);

  // ========== AUTHENTICATION (must happen before streaming) ==========
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    log.authFailure("missing_or_invalid_header");
    return new Response(
      JSON.stringify({ error: "Autorização necessária", request_id: requestId }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    log.authFailure(authError?.message || "user_not_found");
    return new Response(
      JSON.stringify({ error: "Usuário não autenticado", request_id: requestId }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  log.authSuccess(user.id);
  // ========== END AUTHENTICATION ==========

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(createSSEMessage(event, data)));
  };

  // Start async processing
  (async () => {
    try {
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const body: AuthorityPlanRequest = await req.json();
      const { centralTheme, satelliteCount, projectId, language, publicationMode } = body;

      log.info("generation_started", { theme: centralTheme, satelliteCount, projectId });

      // Validate project ownership if projectId is provided
      if (projectId) {
        const { data: project, error: projectError } = await supabaseAdmin
          .from("projects")
          .select("id")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single();

        if (projectError || !project) {
          log.warn("project_access_denied", { projectId });
          await sendEvent("error", { message: "Projeto não encontrado ou acesso negado", request_id: requestId });
          await writer.close();
          return;
        }
      }

      const totalSteps = 4 + satelliteCount * 2;
      let currentStep = 0;

      // Create log entry
      const { data: logEntry } = await supabaseAdmin
        .from("generation_logs")
        .insert({
          user_id: user.id,
          generation_type: "authority_plan",
          status: "running",
          total_steps: totalSteps,
          metadata: { centralTheme, satelliteCount, projectId, request_id: requestId },
        })
        .select()
        .single();

      const logId = logEntry?.id;

      const updateProgress = async (step: string, completed: number) => {
        currentStep = completed;
        await sendEvent("progress", { step, current: completed, total: totalSteps, percentage: Math.round((completed / totalSteps) * 100) });
        if (logId) {
          await supabaseAdmin.from("generation_logs").update({ current_step: step, completed_steps: completed }).eq("id", logId);
        }
      };

      // Step 1: Research
      await updateProgress("Pesquisando tema e palavras-chave...", 0);
      const researchPrompt = `Analyze topic "${centralTheme}" in ${language}. Return JSON: { mainKeyword, secondaryKeywords: [], searchIntent, contentGaps: [] }`;
      const research = await callAI([{ role: "user", content: researchPrompt }]);
      await updateProgress("Pesquisa concluída", 1);

      // Step 2: Pillar Plan
      await updateProgress("Planejando artigo pilar...", 1);
      const pillarPrompt = `Create pillar article plan for "${centralTheme}" in ${language}. Return JSON: { title, keyword, outline: [] } (8-12 H2 sections)`;
      const pillarResult = await callAI([{ role: "user", content: pillarPrompt }]);
      let pillarPlan: ArticlePlan;
      try {
        pillarPlan = { ...JSON.parse(pillarResult), type: "pillar" };
      } catch {
        pillarPlan = { title: `Guia Completo: ${centralTheme}`, keyword: centralTheme.toLowerCase(), outline: ["Introdução", "O que é", "Como funciona", "Conclusão"], type: "pillar" };
      }
      await sendEvent("pillar_plan", pillarPlan);
      await updateProgress("Plano do pilar definido", 2);

      // Step 3: Pillar Content
      await updateProgress("Gerando conteúdo do pilar...", 2);
      const pillarContentPrompt = `Write comprehensive article in ${language} as HTML. Title: ${pillarPlan.title}, Keyword: ${pillarPlan.keyword}, Outline: ${pillarPlan.outline.join(", ")}. Return JSON: { content_html, excerpt, slug }`;
      const pillarContentResult = await callAI([{ role: "user", content: pillarContentPrompt }]);
      let pillarContent: { content: string; excerpt: string; slug: string };
      try {
        const parsed = JSON.parse(pillarContentResult);
        pillarContent = { content: parsed.content_html || parsed.content || "", excerpt: parsed.excerpt || "", slug: parsed.slug || pillarPlan.keyword.replace(/\s+/g, "-") };
      } catch {
        pillarContent = { content: `<h2>${pillarPlan.title}</h2><p>Conteúdo gerado...</p>`, excerpt: pillarPlan.title, slug: pillarPlan.keyword.replace(/\s+/g, "-") };
      }
      await updateProgress("Conteúdo do pilar gerado", 3);

      // Step 4: Pillar Image
      await updateProgress("Gerando imagem do pilar...", 3);
      const pillarImage = await generateImage(`Professional blog featured image for "${pillarPlan.title}". Modern, clean, 16:9 aspect ratio.`);
      await updateProgress("Imagem do pilar gerada", 4);

      // Save pillar
      const { data: pillarArticle, error: pillarError } = await supabaseAdmin
        .from("articles")
        .insert({
          user_id: user.id,
          project_id: projectId,
          keyword: pillarPlan.keyword,
          title: pillarPlan.title,
          content: pillarContent.content,
          excerpt: pillarContent.excerpt,
          slug: pillarContent.slug,
          featured_image_url: pillarImage,
          type: "blog",
          status: publicationMode === "publish" ? "ready" : "draft",
          word_count: pillarContent.content.split(/\s+/).length,
          config: { type: "pillar", theme: centralTheme, research },
        })
        .select()
        .single();

      if (pillarError) {
        log.error("pillar_save_error", { error: pillarError.message });
        throw pillarError;
      }
      log.info("pillar_created", { articleId: pillarArticle.id });
      await sendEvent("pillar_created", { id: pillarArticle.id, title: pillarArticle.title, featured_image_url: pillarImage });

      // Generate satellite plans
      await updateProgress("Definindo artigos satélites...", 4);
      const satellitePrompt = `Generate ${satelliteCount} satellite article ideas for pillar "${pillarPlan.title}" in ${language}. Return JSON: { satellites: [{ title, keyword, outline: [] }] }`;
      const satelliteResult = await callAI([{ role: "user", content: satellitePrompt }]);
      let satellitePlans: ArticlePlan[];
      try {
        const parsed = JSON.parse(satelliteResult);
        satellitePlans = (parsed.satellites || []).map((s: ArticlePlan) => ({ ...s, type: "satellite" as const }));
      } catch {
        satellitePlans = Array.from({ length: satelliteCount }, (_, i) => ({
          title: `${centralTheme} - Parte ${i + 1}`,
          keyword: `${centralTheme.toLowerCase()} ${i + 1}`,
          outline: ["Introdução", "Desenvolvimento", "Conclusão"],
          type: "satellite" as const,
        }));
      }
      await sendEvent("satellite_plans", satellitePlans);

      // Generate satellites
      const satellites = [];
      for (let i = 0; i < satellitePlans.length; i++) {
        const plan = satellitePlans[i];
        const stepBase = 4 + i * 2;

        // Content
        await updateProgress(`Gerando satélite ${i + 1}/${satellitePlans.length}: ${plan.title.substring(0, 30)}...`, stepBase);
        const contentPrompt = `Write article in ${language} as HTML. Title: ${plan.title}, link to pillar "${pillarPlan.title}". Return JSON: { content_html, excerpt, slug }`;
        const contentResult = await callAI([{ role: "user", content: contentPrompt }]);
        let content: { content: string; excerpt: string; slug: string };
        try {
          const parsed = JSON.parse(contentResult);
          content = { content: parsed.content_html || parsed.content || "", excerpt: parsed.excerpt || "", slug: parsed.slug || plan.keyword.replace(/\s+/g, "-") };
        } catch {
          content = { content: `<h2>${plan.title}</h2><p>Conteúdo...</p>`, excerpt: plan.title, slug: plan.keyword.replace(/\s+/g, "-") };
        }

        // Image
        await updateProgress(`Gerando imagem satélite ${i + 1}...`, stepBase + 1);
        const image = await generateImage(`Blog featured image for "${plan.title}". Professional, 16:9.`);

        // Save
        const { data: article, error } = await supabaseAdmin
          .from("articles")
          .insert({
            user_id: user.id,
            project_id: projectId,
            keyword: plan.keyword,
            title: plan.title,
            content: content.content,
            excerpt: content.excerpt,
            slug: content.slug,
            featured_image_url: image,
            type: "blog",
            status: publicationMode === "publish" ? "ready" : "draft",
            word_count: content.content.split(/\s+/).length,
            config: { type: "satellite", pillarId: pillarArticle.id, theme: centralTheme },
          })
          .select()
          .single();

        if (!error && article) {
          satellites.push(article);
          log.info("satellite_created", { index: i + 1, articleId: article.id });
          await sendEvent("satellite_created", { index: i + 1, id: article.id, title: article.title, featured_image_url: image });
        }

        await updateProgress(`Satélite ${i + 1} concluído`, stepBase + 2);
      }

      // Complete
      if (logId) {
        await supabaseAdmin.from("generation_logs").update({ status: "completed", completed_at: new Date().toISOString(), completed_steps: totalSteps }).eq("id", logId);
      }

      log.info("generation_completed", { pillarId: pillarArticle.id, satelliteCount: satellites.length });
      log.requestEnd(200, Date.now() - startTime);

      await sendEvent("complete", { success: true, pillar: pillarArticle, satellites, totalArticles: 1 + satellites.length });
      await writer.close();
    } catch (error) {
      log.error("generation_error", { error: error instanceof Error ? error.message : "unknown" });
      log.requestEnd(500, Date.now() - startTime);
      await sendEvent("error", { message: error instanceof Error ? error.message : "Unknown error", request_id: requestId });
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
