
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

    const articleData: ArticleData = {
      title: article.title || "Untitled",
      content: article.content || "",
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
