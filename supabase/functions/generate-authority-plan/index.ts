import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

async function callAI(messages: { role: string; content: string }[], useJsonMode = false): Promise<string> {
  const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!AI_API_KEY) throw new Error("AI API key is not configured");

  const body: Record<string, unknown> = {
    model: "google/gemini-3-flash-preview",
    messages,
  };

  if (useJsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
    if (response.status === 402) throw new Error("Payment required. Please add credits to your workspace.");
    const text = await response.text();
    console.error("AI error:", response.status, text);
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

    if (!response.ok) {
      console.error("Image generation failed:", response.status);
      return null;
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    return imageUrl || null;
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
}

async function researchTopic(theme: string, language: string): Promise<string> {
  const systemPrompt = `You are an SEO research expert. Analyze the topic and provide insights in ${language}.
Return a JSON object with:
- mainKeyword: the primary keyword for this topic
- secondaryKeywords: array of 5-10 related keywords
- searchIntent: what users are looking for
- competitorInsights: what top-ranking content covers
- contentGaps: opportunities to differentiate`;

  const result = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Research the topic: "${theme}" for the ${language} market` },
  ]);

  return result;
}

async function generatePillarPlan(theme: string, research: string, language: string): Promise<ArticlePlan> {
  const systemPrompt = `You are an expert content strategist. Create a comprehensive pillar article plan.
Return a JSON object with:
- title: compelling SEO-optimized title (60-70 chars)
- keyword: main focus keyword
- outline: array of H2 section headings (8-12 sections for a comprehensive pillar)

The pillar should be THE definitive guide on the topic, covering everything a beginner to intermediate needs to know.
Language: ${language}`;

  const result = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Create a pillar article plan for: "${theme}"\n\nResearch insights:\n${research}` },
  ]);

  try {
    const parsed = JSON.parse(result);
    return { ...parsed, type: "pillar" };
  } catch {
    return {
      title: `Guia Completo: ${theme}`,
      keyword: theme.toLowerCase(),
      outline: ["Introdução", "O que é", "Por que é importante", "Como funciona", "Melhores práticas", "Conclusão"],
      type: "pillar",
    };
  }
}

async function generateSatellitePlans(
  theme: string,
  pillarTitle: string,
  count: number,
  language: string
): Promise<ArticlePlan[]> {
  const systemPrompt = `You are an SEO content strategist. Generate ${count} satellite article ideas that support and link to a pillar article.
Each satellite should:
- Cover a specific subtopic in depth
- Target a long-tail keyword
- Complement but not duplicate the pillar content

Return a JSON object with:
- satellites: array of objects, each with:
  - title: SEO-optimized title (50-60 chars)
  - keyword: long-tail focus keyword
  - outline: array of 4-6 H2 section headings

Language: ${language}`;

  const result = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Generate ${count} satellite articles for pillar: "${pillarTitle}" on theme: "${theme}"` },
  ]);

  try {
    const parsed = JSON.parse(result);
    return (parsed.satellites || []).map((s: ArticlePlan) => ({ ...s, type: "satellite" as const }));
  } catch {
    return Array.from({ length: count }, (_, i) => ({
      title: `${theme} - Parte ${i + 1}`,
      keyword: `${theme.toLowerCase()} ${i + 1}`,
      outline: ["Introdução", "Desenvolvimento", "Dicas práticas", "Conclusão"],
      type: "satellite" as const,
    }));
  }
}

async function generateArticleContent(
  plan: ArticlePlan,
  pillarTitle: string | null,
  language: string
): Promise<{ content: string; excerpt: string; slug: string }> {
  const linkContext = plan.type === "satellite" && pillarTitle
    ? `Include an internal link reference to the pillar article: "${pillarTitle}"`
    : "This is the pillar article - include calls-to-action to explore related topics.";

  const systemPrompt = `You are an expert SEO content writer. Write a complete, high-quality article in ${language}.
${linkContext}

Requirements:
- Write in HTML format with proper heading hierarchy (H2, H3)
- Include engaging introduction with the keyword naturally
- Add practical examples and actionable tips
- Use short paragraphs (2-3 sentences max)
- Target word count: ${plan.type === "pillar" ? "2000-3000" : "1200-1800"} words
- Write in a conversational, authoritative tone

Return a JSON object with:
- content_html: the full article content in HTML
- excerpt: a compelling 150-160 char meta description
- slug: URL-friendly slug`;

  const result = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Write an article:\nTitle: ${plan.title}\nKeyword: ${plan.keyword}\nOutline: ${plan.outline.join(", ")}` },
  ]);

  try {
    const parsed = JSON.parse(result);
    return {
      content: parsed.content_html || parsed.content || "",
      excerpt: parsed.excerpt || "",
      slug: parsed.slug || plan.keyword.toLowerCase().replace(/\s+/g, "-"),
    };
  } catch {
    return {
      content: `<h2>${plan.title}</h2><p>Conteúdo em geração...</p>`,
      excerpt: plan.title,
      slug: plan.keyword.toLowerCase().replace(/\s+/g, "-"),
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Autorização necessária" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ========== END AUTHENTICATION ==========

    // Use service role for database operations
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body: AuthorityPlanRequest = await req.json();
    const { centralTheme, satelliteCount, projectId, language, country, publicationMode } = body;

    // Validate project ownership if projectId is provided
    if (projectId) {
      const { data: project, error: projectError } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .single();

      if (projectError || !project) {
        return new Response(
          JSON.stringify({ success: false, error: "Projeto não encontrado ou acesso negado" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Starting authority plan generation for: "${centralTheme}" with ${satelliteCount} satellites`);

    // Step 1: Research the topic
    console.log("Step 1: Researching topic...");
    const research = await researchTopic(centralTheme, language);

    // Step 2: Generate pillar article plan
    console.log("Step 2: Generating pillar plan...");
    const pillarPlan = await generatePillarPlan(centralTheme, research, language);

    // Step 3: Generate satellite article plans
    console.log("Step 3: Generating satellite plans...");
    const satellitePlans = await generateSatellitePlans(centralTheme, pillarPlan.title, satelliteCount, language);

    // Step 4: Generate featured image for pillar
    console.log("Step 4: Generating pillar image...");
    const pillarImagePrompt = `Professional blog featured image for article about "${pillarPlan.title}". Modern, clean design, professional photography style, 16:9 aspect ratio. No text overlays.`;
    const pillarImage = await generateImage(pillarImagePrompt);

    // Step 5: Generate pillar article content
    console.log("Step 5: Generating pillar content...");
    const pillarContent = await generateArticleContent(pillarPlan, null, language);

    // Step 6: Save pillar article to database
    console.log("Step 6: Saving pillar article...");
    const { data: pillarArticle, error: pillarError } = await supabaseAdmin
      .from("articles")
      .insert({
        user_id: user.id, // Use authenticated user's ID
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

    if (pillarError) throw pillarError;

    // Step 7: Generate satellite articles
    console.log("Step 7: Generating satellite articles...");
    const satelliteArticles = [];

    for (let i = 0; i < satellitePlans.length; i++) {
      const plan = satellitePlans[i];
      console.log(`  Generating satellite ${i + 1}/${satellitePlans.length}: ${plan.title}`);

      const content = await generateArticleContent(plan, pillarPlan.title, language);

      const imagePrompt = `Blog featured image for article: "${plan.title}". Modern, professional style, 16:9 aspect ratio. No text.`;
      const image = await generateImage(imagePrompt);

      const { data: article, error } = await supabaseAdmin
        .from("articles")
        .insert({
          user_id: user.id, // Use authenticated user's ID
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

      if (error) {
        console.error(`Error saving satellite ${i + 1}:`, error);
      } else {
        satelliteArticles.push(article);
      }
    }

    console.log("Authority plan generation complete!");

    return new Response(
      JSON.stringify({
        success: true,
        pillar: pillarArticle,
        satellites: satelliteArticles,
        totalArticles: 1 + satelliteArticles.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Authority plan generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
