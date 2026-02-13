
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "publish-to-wordpress";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PublishRequest {
  articleId: string;
  projectId: string;
}

interface WordPressCredentials {
  wordpress_url: string;
  wordpress_username: string;
  wordpress_app_password: string;
}

interface ArticleData {
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  featured_image_url: string | null;
  categories?: number[];
  tags?: number[];
  cfrdm_id?: string;
  seo_title?: string;
  seo_description?: string;
  focus_keyword?: string;
}

interface SchemaInjectionContext {
  title: string;
  description: string;
  slug: string;
  keyword: string;
  content: string;
  featuredImageUrl: string | null;
  publishedAt: string;
  authorName: string;
  authorJobTitle: string;
  publisherName: string;
  publisherLogoUrl: string;
  siteUrl: string;
  categoryName: string;
}

/**
 * Build Article JSON-LD schema
 */
function buildArticleSchema(ctx: SchemaInjectionContext): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ctx.title,
    "description": ctx.description,
    "image": ctx.featuredImageUrl || `${ctx.siteUrl}/logo.png`,
    "datePublished": ctx.publishedAt,
    "dateModified": ctx.publishedAt,
    "author": {
      "@type": "Person",
      "name": ctx.authorName,
      "jobTitle": ctx.authorJobTitle,
    },
    "publisher": {
      "@type": "Organization",
      "name": ctx.publisherName,
      "logo": { "@type": "ImageObject", "url": ctx.publisherLogoUrl },
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${ctx.siteUrl}/${ctx.categoryName ? ctx.categoryName + '/' : ''}${ctx.slug}/`,
    },
  };
}

/**
 * Extract FAQ items from article content (markdown/HTML)
 */
function extractFAQsFromContent(content: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];
  if (!content) return faqs;

  // Detect FAQ section
  const hasFAQ = /##\s*(FAQ|Perguntas\s+Frequentes|Dúvidas)/i.test(content) ||
    /<h[23][^>]*>(FAQ|Perguntas\s+Frequentes|Dúvidas)/i.test(content);

  if (!hasFAQ) return faqs;

  // Pattern: ### Question? followed by answer
  const qaPattern = /###\s*(.+\?)\s*\n+([\s\S]*?)(?=###|\n##|$)/g;
  let match;
  while ((match = qaPattern.exec(content)) !== null) {
    const q = match[1].replace(/\*\*/g, '').trim();
    const a = match[2].replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (q && a && a.length > 20) faqs.push({ question: q, answer: a.slice(0, 300) });
  }

  // HTML h3/h4 questions
  if (faqs.length === 0) {
    const htmlPattern = /<h[34][^>]*>([^<]+\?)<\/h[34]>\s*<p>([^<]+)<\/p>/gi;
    while ((match = htmlPattern.exec(content)) !== null) {
      const q = match[1].trim();
      const a = match[2].trim();
      if (q && a && a.length > 20) faqs.push({ question: q, answer: a.slice(0, 300) });
    }
  }

  return faqs.slice(0, 10);
}

/**
 * Build FAQPage JSON-LD schema
 */
function buildFAQSchema(faqs: Array<{ question: string; answer: string }>): Record<string, unknown> | null {
  if (faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((f) => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.answer },
    })),
  };
}

/**
 * Build BreadcrumbList JSON-LD schema
 */
function buildBreadcrumbSchema(ctx: SchemaInjectionContext): Record<string, unknown> {
  const items = [
    { "@type": "ListItem", "position": 1, "name": "Início", "item": ctx.siteUrl + "/" },
  ];
  if (ctx.categoryName) {
    items.push({ "@type": "ListItem", "position": 2, "name": ctx.categoryName, "item": `${ctx.siteUrl}/${ctx.categoryName}/` });
    items.push({ "@type": "ListItem", "position": 3, "name": ctx.title, "item": `${ctx.siteUrl}/${ctx.categoryName}/${ctx.slug}/` });
  } else {
    items.push({ "@type": "ListItem", "position": 2, "name": ctx.title, "item": `${ctx.siteUrl}/${ctx.slug}/` });
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items,
  };
}

/**
 * Extract HowTo steps from content for how-to articles
 */
function extractHowToSteps(content: string): Array<{ name: string; text: string }> {
  const steps: Array<{ name: string; text: string }> = [];
  if (!content) return steps;

  // Detect how-to patterns: "Passo X:", "Etapa X:", numbered lists with instructions
  const hasHowTo = /##\s*(Como|How\s+To|Passo\s+a\s+Passo|Tutorial|Guia)/i.test(content) ||
    /<h[23][^>]*>(Como|How\s+To|Passo\s+a\s+Passo|Tutorial|Guia)/i.test(content);
  if (!hasHowTo) return steps;

  // Pattern: ### Passo X: Title \n description
  const stepPattern = /###\s*(?:Passo|Etapa|Step)\s*\d+[:.]\s*(.+?)\s*\n+([\s\S]*?)(?=###|\n##|$)/gi;
  let match;
  while ((match = stepPattern.exec(content)) !== null) {
    const name = match[1].replace(/\*\*/g, '').trim();
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (name && text) steps.push({ name, text: text.slice(0, 500) });
  }

  // Pattern: numbered H3 headings in how-to section
  if (steps.length === 0) {
    const numberedPattern = /###\s*\d+[.)]\s*(.+?)\s*\n+([\s\S]*?)(?=###|\n##|$)/g;
    while ((match = numberedPattern.exec(content)) !== null) {
      const name = match[1].replace(/\*\*/g, '').trim();
      const text = match[2].replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      if (name && text) steps.push({ name, text: text.slice(0, 500) });
    }
  }

  return steps.slice(0, 15);
}

/**
 * Build HowTo JSON-LD schema
 */
function buildHowToSchema(title: string, description: string, steps: Array<{ name: string; text: string }>): Record<string, unknown> | null {
  if (steps.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": title,
    "description": description,
    "step": steps.map((s, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": s.name,
      "text": s.text,
    })),
  };
}

/**
 * Inject all JSON-LD schemas into article content
 */
function injectSchemas(content: string, ctx: SchemaInjectionContext): string {
  const schemas: string[] = [];

  // 1. Article schema (always)
  schemas.push(`<script type="application/ld+json">\n${JSON.stringify(buildArticleSchema(ctx), null, 2)}\n</script>`);

  // 2. FAQPage schema (if FAQs detected)
  const faqs = extractFAQsFromContent(content);
  const faqSchema = buildFAQSchema(faqs);
  if (faqSchema) {
    schemas.push(`<script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n</script>`);
  }

  // 3. HowTo schema (if how-to steps detected)
  const howToSteps = extractHowToSteps(content);
  const howToSchema = buildHowToSchema(ctx.title, ctx.description, howToSteps);
  if (howToSchema) {
    schemas.push(`<script type="application/ld+json">\n${JSON.stringify(howToSchema, null, 2)}\n</script>`);
  }

  // 4. BreadcrumbList schema (always)
  schemas.push(`<script type="application/ld+json">\n${JSON.stringify(buildBreadcrumbSchema(ctx), null, 2)}\n</script>`);

  return content + "\n\n<!-- JSON-LD Structured Data by ContentFactory -->\n" + schemas.join("\n");
}

async function publishViaPluginAPI(
  baseUrl: string,
  apiKey: string,
  article: ArticleData,
  status: string = "publish"
): Promise<{ success: boolean; postId?: number; postUrl?: string; error?: string }> {
  console.log(`Publishing via Plugin API to: ${baseUrl}/wp-json/cfrdm/v1/articles`);

  try {
    let featuredMediaId: number | undefined;

    if (article.featured_image_url && article.featured_image_url.startsWith("data:image")) {
      const mediaApiUrl = `${baseUrl}/wp-json/cfrdm/v1/media`;
      
      const mediaResponse = await fetch(mediaApiUrl, {
        method: "POST",
        headers: {
          "X-CFRDM-API-Key": apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          image_data: article.featured_image_url,
          filename: `${article.slug || "featured"}.png`,
          alt_text: article.title,
        }),
      });

      if (mediaResponse.ok) {
        const mediaData = await mediaResponse.json();
        if (mediaData.success && mediaData.data?.id) {
          featuredMediaId = mediaData.data.id;
          console.log("Featured image uploaded via plugin:", featuredMediaId);
        }
      } else {
        console.warn("Failed to upload featured image via plugin:", await mediaResponse.text());
      }
    }

    const articleApiUrl = `${baseUrl}/wp-json/cfrdm/v1/articles`;
    
    const postData: Record<string, unknown> = {
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      slug: article.slug,
      status: status === "publish" ? "publish" : "draft",
      cfrdm_id: article.cfrdm_id,
    };

    if (article.categories && article.categories.length > 0) {
      postData.categories = article.categories;
    }

    if (article.tags && article.tags.length > 0) {
      postData.tags = article.tags;
    }

    if (featuredMediaId) {
      postData.featured_image_id = featuredMediaId;
    }

    if (article.seo_title) {
      postData.seo_title = article.seo_title;
    }
    if (article.seo_description) {
      postData.seo_description = article.seo_description;
    }
    if (article.focus_keyword) {
      postData.focus_keyword = article.focus_keyword;
    }

    const response = await fetch(articleApiUrl, {
      method: "POST",
      headers: {
        "X-CFRDM-API-Key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(postData),
    });

    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();

    console.log(`Plugin API response status: ${response.status}, Content-Type: ${contentType}`);
    console.log(`Plugin API response: ${responseText.substring(0, 500)}`);

    if (!contentType.includes("application/json")) {
      return { 
        success: false, 
        error: "Plugin retornou resposta inválida. Verifique se o plugin está ativo." 
      };
    }

    const data = JSON.parse(responseText);

    if (response.ok && data.success) {
      return {
        success: true,
        postId: data.data?.id,
        postUrl: data.data?.link,
      };
    } else {
      return {
        success: false,
        error: data.message || `Erro ao publicar via plugin: ${response.status}`,
      };
    }
  } catch (error) {
    console.error("Plugin API publish error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao publicar via plugin",
    };
  }
}

async function publishViaStandardAPI(
  credentials: WordPressCredentials,
  article: ArticleData,
  status: string = "draft"
): Promise<{ success: boolean; postId?: number; postUrl?: string; error?: string }> {
  const { wordpress_url, wordpress_username, wordpress_app_password } = credentials;

  if (!wordpress_url || !wordpress_username || !wordpress_app_password) {
    return { success: false, error: "WordPress credentials not configured" };
  }

  const baseUrl = wordpress_url.replace(/\/$/, "");
  const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;
  const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

  console.log(`Publishing via Standard API to: ${apiUrl}`);

  try {
    let featuredMediaId: number | undefined;

    if (article.featured_image_url && article.featured_image_url.startsWith("data:image")) {
      const mediaApiUrl = `${baseUrl}/wp-json/wp/v2/media`;

      const base64Data = article.featured_image_url.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const imageResponse = await fetch(mediaApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="${article.slug || "featured"}.png"`,
        },
        body: bytes,
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        featuredMediaId = imageData.id;
        console.log("Featured image uploaded:", featuredMediaId);
      } else {
        console.warn("Failed to upload featured image:", await imageResponse.text());
      }
    }

    const postData: Record<string, unknown> = {
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      slug: article.slug,
      status: status === "publish" ? "publish" : "draft",
    };

    if (article.categories && article.categories.length > 0) {
      postData.categories = article.categories;
    }

    if (article.tags && article.tags.length > 0) {
      postData.tags = article.tags;
    }

    if (featuredMediaId) {
      postData.featured_media = featuredMediaId;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("WordPress API error:", response.status, errorText);

      if (response.status === 401) {
        return { success: false, error: "Autenticação falhou. Verifique suas credenciais WordPress." };
      }
      if (response.status === 403) {
        return { success: false, error: "Permissão negada. Verifique se o usuário tem permissão para criar posts." };
      }

      return { success: false, error: `WordPress API error: ${response.status}` };
    }

    const post = await response.json();
    console.log("Post created successfully:", post.id, post.link);

    return {
      success: true,
      postId: post.id,
      postUrl: post.link,
    };
  } catch (error) {
    console.error("WordPress publish error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.requestStart(req.method);

    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.authFailure("missing_or_invalid_header");
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      log.authFailure(authError?.message || "invalid_token");
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userId = claimsData.claims.sub;
    const user = { id: userId };
    log.authSuccess(userId);
    // ========== END AUTHENTICATION ==========

    // Use service role for database operations (to access all data)
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { articleId, projectId }: PublishRequest = await req.json();

    if (!articleId || !projectId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing articleId or projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch article and verify ownership
    const { data: article, error: articleError } = await supabaseAdmin
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .eq("user_id", user.id) // IMPORTANT: Validate user owns the article
      .single();

    if (articleError || !article) {
      return new Response(
        JSON.stringify({ success: false, error: "Article not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch project and verify ownership
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("wordpress_url, wordpress_username, wordpress_app_password")
      .eq("id", projectId)
      .eq("user_id", user.id) // IMPORTANT: Validate user owns the project
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ success: false, error: "Project not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!project.wordpress_url || !project.wordpress_app_password) {
      return new Response(
        JSON.stringify({ success: false, error: "WordPress credentials not configured for this project" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = article.config as { 
      wordpress_categories?: number[]; 
      wordpress_tags?: number[];
      seo_title?: string;
      seo_description?: string;
      focus_keyword?: string;
    } | null;
    
    const categories = config?.wordpress_categories || [];
    const tags = config?.wordpress_tags || [];

    // Build schema injection context
    const siteUrl = project.wordpress_url.replace(/\/$/, "");
    const publishedAt = new Date().toISOString();
    const schemaCtx: SchemaInjectionContext = {
      title: article.title || "Untitled",
      description: article.excerpt || config?.seo_description || "",
      slug: article.slug || "",
      keyword: config?.focus_keyword || article.keyword || "",
      content: article.content || "",
      featuredImageUrl: article.featured_image_url,
      publishedAt,
      authorName: config?.seo_title ? "Equipe Editorial" : "Equipe Editorial",
      authorJobTitle: "Redator SEO",
      publisherName: siteUrl.replace(/https?:\/\/(www\.)?/, "").split("/")[0],
      publisherLogoUrl: `${siteUrl}/wp-content/uploads/logo.png`,
      siteUrl,
      categoryName: "",
    };

    // Inject JSON-LD schemas into content
    const enrichedContent = injectSchemas(article.content || "", schemaCtx);
    console.log("JSON-LD schemas injected: Article + FAQPage + BreadcrumbList");

    const articleData: ArticleData = {
      title: article.title || "Untitled",
      content: enrichedContent,
      excerpt: article.excerpt || "",
      slug: article.slug || "",
      featured_image_url: article.featured_image_url,
      categories,
      tags,
      cfrdm_id: article.id,
      seo_title: config?.seo_title,
      seo_description: config?.seo_description,
      focus_keyword: config?.focus_keyword || article.keyword,
    };

    const isPluginAuth = project.wordpress_username === "__CFRDM_PLUGIN__";
    let result: { success: boolean; postId?: number; postUrl?: string; error?: string };

    if (isPluginAuth) {
      console.log("Using Plugin API authentication");
      result = await publishViaPluginAPI(
        project.wordpress_url.replace(/\/$/, ""),
        project.wordpress_app_password,
        articleData,
        "publish"
      );
    } else {
      console.log("Using Standard API authentication");
      result = await publishViaStandardAPI(
        {
          wordpress_url: project.wordpress_url,
          wordpress_username: project.wordpress_username!,
          wordpress_app_password: project.wordpress_app_password,
        },
        articleData,
        "publish"
      );
    }

    if (result.success) {
      await supabaseAdmin
        .from("articles")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_url: result.postUrl,
        })
        .eq("id", articleId);
      log.info("publish_success", { articleId, postId: result.postId });
    } else {
      log.warn("publish_failed", { articleId, error: result.error });
    }

    log.requestEnd(200, Date.now() - startTime);
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("publish_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
