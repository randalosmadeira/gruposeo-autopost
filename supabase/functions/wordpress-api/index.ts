import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WordPressCredentials {
  wordpress_url: string;
  wordpress_username: string;
  wordpress_app_password: string;
}

// Helper to make WordPress API calls
async function wpFetch(
  credentials: WordPressCredentials,
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: any; error?: string; status: number }> {
  const { wordpress_url, wordpress_username, wordpress_app_password } = credentials;
  const baseUrl = wordpress_url.replace(/\/$/, "");
  const apiUrl = `${baseUrl}/wp-json/wp/v2${endpoint}`;
  const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

  try {
    const response = await fetch(apiUrl, {
      ...options,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    const contentType = response.headers.get("content-type") || "";
    
    if (!contentType.includes("application/json")) {
      return { 
        error: "WordPress REST API retornou resposta inválida", 
        status: response.status 
      };
    }

    const data = await response.json();
    
    if (!response.ok) {
      return { 
        error: data.message || `Erro ${response.status}`, 
        status: response.status 
      };
    }

    return { data, status: response.status };
  } catch (error) {
    console.error("WordPress API error:", error);
    return { 
      error: error instanceof Error ? error.message : "Erro de conexão", 
      status: 500 
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = req.method !== "GET" ? await req.json() : {};
    const { projectId, ...params } = body;

    if (!projectId && action !== "health") {
      return new Response(
        JSON.stringify({ success: false, error: "projectId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get WordPress credentials from project
    let credentials: WordPressCredentials | null = null;
    if (projectId) {
      const { data: project, error } = await supabase
        .from("projects")
        .select("wordpress_url, wordpress_username, wordpress_app_password")
        .eq("id", projectId)
        .single();

      if (error || !project?.wordpress_url) {
        return new Response(
          JSON.stringify({ success: false, error: "Credenciais WordPress não encontradas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      credentials = project as WordPressCredentials;
    }

    let result;

    switch (action) {
      // === HEALTH CHECK ===
      case "health":
        return new Response(
          JSON.stringify({ success: true, message: "WordPress API Proxy online", timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      // === POSTS ===
      case "get-posts":
        result = await wpFetch(credentials!, `/posts?per_page=${params.perPage || 10}&page=${params.page || 1}`);
        break;

      case "get-post":
        if (!params.postId) {
          return new Response(
            JSON.stringify({ success: false, error: "postId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await wpFetch(credentials!, `/posts/${params.postId}`);
        break;

      case "create-post":
        result = await wpFetch(credentials!, "/posts", {
          method: "POST",
          body: JSON.stringify({
            title: params.title,
            content: params.content,
            excerpt: params.excerpt,
            slug: params.slug,
            status: params.status || "draft",
            categories: params.categories,
            tags: params.tags,
            featured_media: params.featuredMedia,
          }),
        });
        break;

      case "update-post":
        if (!params.postId) {
          return new Response(
            JSON.stringify({ success: false, error: "postId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await wpFetch(credentials!, `/posts/${params.postId}`, {
          method: "PUT",
          body: JSON.stringify({
            title: params.title,
            content: params.content,
            excerpt: params.excerpt,
            slug: params.slug,
            status: params.status,
            categories: params.categories,
            tags: params.tags,
            featured_media: params.featuredMedia,
          }),
        });
        break;

      case "delete-post":
        if (!params.postId) {
          return new Response(
            JSON.stringify({ success: false, error: "postId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await wpFetch(credentials!, `/posts/${params.postId}?force=${params.force || false}`, {
          method: "DELETE",
        });
        break;

      // === CATEGORIES ===
      case "get-categories":
        result = await wpFetch(credentials!, `/categories?per_page=${params.perPage || 100}`);
        break;

      case "create-category":
        result = await wpFetch(credentials!, "/categories", {
          method: "POST",
          body: JSON.stringify({
            name: params.name,
            slug: params.slug,
            description: params.description,
            parent: params.parent,
          }),
        });
        break;

      // === TAGS ===
      case "get-tags":
        result = await wpFetch(credentials!, `/tags?per_page=${params.perPage || 100}`);
        break;

      case "create-tag":
        result = await wpFetch(credentials!, "/tags", {
          method: "POST",
          body: JSON.stringify({
            name: params.name,
            slug: params.slug,
            description: params.description,
          }),
        });
        break;

      // === MEDIA ===
      case "get-media":
        result = await wpFetch(credentials!, `/media?per_page=${params.perPage || 20}`);
        break;

      case "upload-media":
        if (!params.imageData) {
          return new Response(
            JSON.stringify({ success: false, error: "imageData (base64) é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { wordpress_url, wordpress_username, wordpress_app_password } = credentials!;
        const baseUrl = wordpress_url.replace(/\/$/, "");
        const mediaApiUrl = `${baseUrl}/wp-json/wp/v2/media`;
        const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

        // Convert base64 to binary
        const base64Data = params.imageData.replace(/^data:image\/\w+;base64,/, "");
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const mediaResponse = await fetch(mediaApiUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": params.mimeType || "image/png",
            "Content-Disposition": `attachment; filename="${params.filename || "image.png"}"`,
          },
          body: bytes,
        });

        if (mediaResponse.ok) {
          result = { data: await mediaResponse.json(), status: 201 };
        } else {
          result = { error: "Falha ao fazer upload", status: mediaResponse.status };
        }
        break;

      // === USERS ===
      case "get-users":
        result = await wpFetch(credentials!, `/users?per_page=${params.perPage || 100}`);
        break;

      case "get-current-user":
        result = await wpFetch(credentials!, "/users/me");
        break;

      // === SEO PLUGINS ===
      case "update-yoast-meta":
        if (!params.postId) {
          return new Response(
            JSON.stringify({ success: false, error: "postId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await wpFetch(credentials!, `/posts/${params.postId}`, {
          method: "PUT",
          body: JSON.stringify({
            yoast_head_json: {
              title: params.seoTitle,
              description: params.seoDescription,
            },
            meta: {
              _yoast_wpseo_title: params.seoTitle,
              _yoast_wpseo_metadesc: params.seoDescription,
              _yoast_wpseo_focuskw: params.focusKeyword,
            },
          }),
        });
        break;

      case "update-rankmath-meta":
        if (!params.postId) {
          return new Response(
            JSON.stringify({ success: false, error: "postId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await wpFetch(credentials!, `/posts/${params.postId}`, {
          method: "PUT",
          body: JSON.stringify({
            meta: {
              rank_math_title: params.seoTitle,
              rank_math_description: params.seoDescription,
              rank_math_focus_keyword: params.focusKeyword,
            },
          }),
        });
        break;

      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Ação não reconhecida",
            availableActions: [
              "health", "get-posts", "get-post", "create-post", "update-post", "delete-post",
              "get-categories", "create-category", "get-tags", "create-tag",
              "get-media", "upload-media", "get-users", "get-current-user",
              "update-yoast-meta", "update-rankmath-meta"
            ]
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (result.error) {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: result.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("API error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
