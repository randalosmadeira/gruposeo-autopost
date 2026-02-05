import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

/**
 * Publish article using ContentFactory RDM Plugin API
 */
async function publishViaPluginAPI(
  baseUrl: string,
  apiKey: string,
  article: ArticleData,
  status: string = "publish"
): Promise<{ success: boolean; postId?: number; postUrl?: string; error?: string }> {
  console.log(`Publishing via Plugin API to: ${baseUrl}/wp-json/cfrdm/v1/articles`);

  try {
    // First, upload featured image if exists
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

    // Create the article via Plugin API
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

    // Add SEO meta if available
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

/**
 * Publish article using standard WordPress REST API with Application Password
 */
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
    // First, upload featured image if exists
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

    // Create the post
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { articleId, projectId }: PublishRequest = await req.json();

    if (!articleId || !projectId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing articleId or projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      return new Response(
        JSON.stringify({ success: false, error: "Article not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch project with WordPress credentials
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("wordpress_url, wordpress_username, wordpress_app_password")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ success: false, error: "Project not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!project.wordpress_url || !project.wordpress_app_password) {
      return new Response(
        JSON.stringify({ success: false, error: "WordPress credentials not configured for this project" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse config for categories, tags, and SEO data
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

    // Determine authentication method
    const isPluginAuth = project.wordpress_username === "__CFRDM_PLUGIN__";
    let result: { success: boolean; postId?: number; postUrl?: string; error?: string };

    if (isPluginAuth) {
      // Use Plugin API
      console.log("Using Plugin API authentication");
      result = await publishViaPluginAPI(
        project.wordpress_url.replace(/\/$/, ""),
        project.wordpress_app_password,
        articleData,
        "publish"
      );
    } else {
      // Use Standard API with Application Password
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
      // Update article status in database
      await supabase
        .from("articles")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_url: result.postUrl,
        })
        .eq("id", articleId);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Publish error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
