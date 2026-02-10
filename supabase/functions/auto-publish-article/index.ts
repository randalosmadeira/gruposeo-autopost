
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "auto-publish-article";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AutoPublishRequest {
  projectId: string;
  keyword: string;
  type?: 'blog' | 'sales';
  wordCount?: 'short' | 'medium' | 'long' | 'very-long';
  tone?: string;
  language?: string;
  generateImage?: boolean;
  autoPublish?: boolean;
}

const wordCountRanges = {
  short: { min: 600, max: 1000 },
  medium: { min: 1200, max: 1800 },
  long: { min: 2200, max: 2800 },
  'very-long': { min: 3500, max: 4500 },
};

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!AI_API_KEY) {
    log.error("missing_ai_key");
    log.requestEnd(500, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: false, error: "AI API key not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    log.requestStart(req.method);

    const body: AutoPublishRequest = await req.json();
    const {
      projectId,
      keyword,
      type = 'blog',
      wordCount = 'medium',
      tone = 'profissional',
      language = 'pt-BR',
      generateImage = true,
      autoPublish = true,
    } = body;

    if (!projectId || !keyword) {
      log.warn("missing_required_fields", { projectId: !!projectId, keyword: !!keyword });
      log.requestEnd(400, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "projectId and keyword are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      log.warn("project_not_found", { projectId });
      log.requestEnd(404, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "Project not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.setUserId(project.user_id);
    log.info("auto_publish_start", { project: project.name, keyword });

    // Create article record in database
    const { data: article, error: insertError } = await supabase
      .from("articles")
      .insert({
        user_id: project.user_id,
        project_id: projectId,
        keyword,
        type,
        status: "generating",
        config: {
          wordCount,
          tone,
          language,
          generateImage,
          autoPublish,
        },
      })
      .select()
      .single();

    if (insertError || !article) {
      log.error("article_create_failed", { error: insertError?.message });
      log.requestEnd(500, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create article record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("article_created", { article_id: article.id });

    // Generate article content using Lovable AI
    const wordRange = wordCountRanges[wordCount];
    const systemPrompt = `Você é um redator SEO especialista em criar conteúdo de alta qualidade para ranquear no Google.

REGRAS IMPORTANTES:
- Escreva em português brasileiro
- Use o tom "${tone}"
- Use segunda pessoa (você)
- O artigo deve ter entre ${wordRange.min} e ${wordRange.max} palavras
- Use formatação Markdown com headers (H2, H3), listas e negrito quando apropriado
- A palavra-chave principal "${keyword}" deve aparecer naturalmente no título, introdução, headers e conclusão
- Otimize para SEO: use variações semânticas, escreva parágrafos curtos, use headers descritivos
- Inclua uma seção de FAQ com 3-5 perguntas frequentes ao final
- Finalize com uma conclusão que resume os pontos principais e inclui um call-to-action`;

    const userPrompt = `Escreva um artigo completo e otimizado para SEO sobre: "${keyword}"

Estrutura esperada:
1. Título principal atraente (H1)
2. Introdução engajadora que prenda o leitor
3. Seções organizadas com subtítulos (H2/H3)
4. Conteúdo detalhado e útil
5. FAQ com 3-5 perguntas e respostas
6. Conclusão com resumo e CTA

Comece agora:`;

    log.info("generating_content", { model: "google/gemini-3-flash-preview" });

    const contentResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!contentResponse.ok) {
      const error = await contentResponse.text();
      log.error("ai_generation_failed", { status: contentResponse.status });
      await supabase.from("articles").update({ status: "error", error_message: "AI generation failed" }).eq("id", article.id);
      log.requestEnd(500, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "AI content generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentData = await contentResponse.json();
    const content = contentData.choices?.[0]?.message?.content || "";
    log.info("content_generated", { length: content.length });

    // Extract title from content (first H1)
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1] || keyword;

    // Generate slug
    const slug = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Generate excerpt (first paragraph without markdown)
    const excerptMatch = content.match(/^(?!#)(.{100,300}?)(?:\.|$)/m);
    const excerpt = excerptMatch?.[1]?.replace(/[*_#]/g, "").trim() + "..." || "";

    // Generate image if requested
    let featuredImageUrl: string | null = null;
    if (generateImage) {
      log.info("generating_image");
      try {
        const imagePrompt = `Professional blog header image for an article about "${keyword}". Modern, clean design with subtle gradients. No text in the image. High quality, photorealistic, 16:9 aspect ratio.`;
        
        const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image-preview",
            messages: [{ role: "user", content: imagePrompt }],
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const imageParts = imageData.choices?.[0]?.message?.content;
          if (imageParts && typeof imageParts === 'string' && imageParts.startsWith('data:image')) {
            featuredImageUrl = imageParts;
            log.info("image_generated");
          }
        } else {
          log.warn("image_generation_failed", { status: imageResponse.status });
        }
      } catch (imageError) {
        log.warn("image_generation_error", { error: imageError instanceof Error ? imageError.message : "unknown" });
      }
    }

    // Calculate word count
    const wordCountActual = content.split(/\s+/).length;

    // Update article with generated content
    await supabase.from("articles").update({
      title,
      content,
      excerpt,
      slug,
      featured_image_url: featuredImageUrl,
      word_count: wordCountActual,
      status: autoPublish ? "ready" : "draft",
      seo_score: 85, // Placeholder
    }).eq("id", article.id);

    log.info("article_updated", { title, wordCount: wordCountActual });

    // If autoPublish is true, publish to WordPress
    let publishResult = null;
    if (autoPublish && project.wordpress_url && project.wordpress_app_password) {
      log.info("auto_publishing_to_wordpress");

      const isPluginAuth = project.wordpress_username === "__CFRDM_PLUGIN__";
      const baseUrl = project.wordpress_url.replace(/\/$/, "").replace(/\/wp-json(\/.*)?$/, "");

      if (isPluginAuth) {
        // Publish via Plugin API
        const articleApiUrl = `${baseUrl}/wp-json/cfrdm/v1/articles`;
        
        const postData: Record<string, unknown> = {
          title,
          content,
          excerpt,
          slug,
          status: "publish",
          cfrdm_id: article.id,
          focus_keyword: keyword,
        };

        // Upload image first if exists
        if (featuredImageUrl && featuredImageUrl.startsWith("data:image")) {
          try {
            const mediaResponse = await fetch(`${baseUrl}/wp-json/cfrdm/v1/media`, {
              method: "POST",
              headers: {
                "X-CFRDM-API-Key": project.wordpress_app_password,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                image_data: featuredImageUrl,
                filename: `${slug}.png`,
                alt_text: title,
              }),
            });

            if (mediaResponse.ok) {
              const mediaData = await mediaResponse.json();
              if (mediaData.success && mediaData.data?.id) {
                postData.featured_image_id = mediaData.data.id;
                log.info("image_uploaded_to_wp", { media_id: mediaData.data.id });
              }
            }
          } catch (mediaError) {
            log.warn("image_upload_failed", { error: mediaError instanceof Error ? mediaError.message : "unknown" });
          }
        }

        const publishResponse = await fetch(articleApiUrl, {
          method: "POST",
          headers: {
            "X-CFRDM-API-Key": project.wordpress_app_password,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postData),
        });

        const publishData = await publishResponse.json();

        if (publishResponse.ok && publishData.success) {
          publishResult = {
            success: true,
            postId: publishData.data?.id,
            postUrl: publishData.data?.link,
          };
          log.info("publish_success", { postUrl: publishData.data?.link });
        } else {
          publishResult = {
            success: false,
            error: publishData.message || "Publish failed",
          };
          log.warn("publish_failed", { error: publishData.message });
        }
      } else {
        // Standard API publish
        const auth = btoa(`${project.wordpress_username}:${project.wordpress_app_password}`);
        const publishResponse = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            content,
            excerpt,
            slug,
            status: "publish",
          }),
        });

        if (publishResponse.ok) {
          const postData = await publishResponse.json();
          publishResult = {
            success: true,
            postId: postData.id,
            postUrl: postData.link,
          };
          log.info("publish_success", { postUrl: postData.link });
        } else {
          publishResult = {
            success: false,
            error: `HTTP ${publishResponse.status}`,
          };
          log.warn("publish_failed", { status: publishResponse.status });
        }
      }

      // Update article status based on publish result
      if (publishResult?.success) {
        await supabase.from("articles").update({
          status: "published",
          published_at: new Date().toISOString(),
          published_url: publishResult.postUrl,
        }).eq("id", article.id);
      } else {
        await supabase.from("articles").update({
          status: "error",
          error_message: publishResult?.error || "Publish failed",
        }).eq("id", article.id);
      }
    }

    log.requestEnd(200, Date.now() - startTime);
    return new Response(
      JSON.stringify({
        success: true,
        articleId: article.id,
        title,
        slug,
        wordCount: wordCountActual,
        hasImage: !!featuredImageUrl,
        published: publishResult?.success || false,
        publishedUrl: publishResult?.postUrl || null,
        publishError: publishResult?.error || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("auto_publish_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
