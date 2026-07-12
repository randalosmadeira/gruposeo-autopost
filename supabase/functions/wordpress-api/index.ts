
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "wordpress-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WordPressCredentials {
  wordpress_url: string;
  wordpress_username: string;
  wordpress_app_password: string;
}

// Normalize WordPress URL - extract base URL from plugin endpoint URL if needed
function normalizeWordPressUrl(url: string): string {
  if (!url) return '';
  
  let normalized = url.replace(/\/+$/, '');
  
  // If URL contains /wp-json/cfrdm/v1, strip it to get the base WordPress URL
  // e.g., https://example.com/blog/wp-json/cfrdm/v1 -> https://example.com/blog
  const cfrdmMatch = normalized.match(/^(.+?)\/wp-json\/cfrdm\/v1/);
  if (cfrdmMatch) {
    normalized = cfrdmMatch[1];
    console.log(`Normalized plugin URL: ${url} -> ${normalized}`);
  }
  
  // Also handle if someone put /wp-json/ at the end
  const wpJsonMatch = normalized.match(/^(.+?)\/wp-json\/?$/);
  if (wpJsonMatch) {
    normalized = wpJsonMatch[1];
  }
  
  return normalized.replace(/\/+$/, '');
}

async function wpFetch(
  credentials: WordPressCredentials,
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data?: unknown; error?: string; status: number }> {
  const { wordpress_url, wordpress_username, wordpress_app_password } = credentials;
  const baseUrl = normalizeWordPressUrl(wordpress_url);
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
    const rawText = await response.text();

    if (!contentType.includes("application/json")) {
      console.error(`WP non-JSON response [${response.status}] ${apiUrl}:`, rawText.slice(0, 500));
      return {
        error: `WordPress REST API retornou resposta não-JSON (HTTP ${response.status}). Verifique permalinks e se o endpoint ${endpoint} está habilitado. Body: ${rawText.slice(0, 200)}`,
        status: response.status,
      };
    }

    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (parseErr) {
      console.error(`WP JSON parse error [${response.status}] ${apiUrl}:`, rawText.slice(0, 500));
      return {
        error: `Falha ao decodificar JSON do WordPress (HTTP ${response.status}). Body: ${rawText.slice(0, 200)}`,
        status: response.status,
      };
    }

    if (!response.ok) {
      const wpMessage = data?.message || data?.data?.message || data?.code || rawText.slice(0, 200);
      console.error(`WP error [${response.status}] ${apiUrl}:`, wpMessage);
      return {
        error: wpMessage ? `WordPress ${response.status}: ${wpMessage}` : `Erro ${response.status}`,
        status: response.status,
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

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Support action from query params OR body
    let action = url.searchParams.get("action");
    log.requestStart(req.method, action || undefined);

    // Health check doesn't need authentication
    if (action === "health") {
      log.requestEnd(200, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: true, message: "WordPress API Proxy online", timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      log.authFailure(authError?.message || "user_not_found");
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    log.authSuccess(user.id);
    // ========== END AUTHENTICATION ==========

    // Use service role for database operations
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = req.method !== "GET" ? await req.json() : {};
    const { projectId, action: bodyAction, ...params } = body;
    
    // If action was not in query params, use body action
    if (!action && bodyAction) {
      action = bodyAction;
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: "projectId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get WordPress credentials and verify ownership
    const { data: project, error } = await supabaseAdmin
      .from("projects")
      .select("wordpress_url, wordpress_username, wordpress_app_password")
      .eq("id", projectId)
      .eq("user_id", user.id) // IMPORTANT: Validate user owns the project
      .single();

    if (error || !project?.wordpress_url) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais WordPress não encontradas ou acesso negado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = project as WordPressCredentials;
    let result;

    switch (action) {
      case "get-posts":
        result = await wpFetch(credentials, `/posts?per_page=${params.perPage || 10}&page=${params.page || 1}`);
        break;

      case "get-post":
        if (!params.postId) {
          return new Response(
            JSON.stringify({ success: false, error: "postId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await wpFetch(credentials, `/posts/${params.postId}`);
        break;

      case "create-post":
        result = await wpFetch(credentials, "/posts", {
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
        result = await wpFetch(credentials, `/posts/${params.postId}`, {
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
        result = await wpFetch(credentials, `/posts/${params.postId}?force=${params.force || false}`, {
          method: "DELETE",
        });
        break;

      case "get-categories":
        result = await wpFetch(credentials, `/categories?per_page=${params.perPage || 100}`);
        break;

      case "create-category":
        result = await wpFetch(credentials, "/categories", {
          method: "POST",
          body: JSON.stringify({
            name: params.name,
            slug: params.slug,
            description: params.description,
            parent: params.parent,
          }),
        });
        break;

      case "get-tags":
        result = await wpFetch(credentials, `/tags?per_page=${params.perPage || 100}`);
        break;

      case "create-tag":
        result = await wpFetch(credentials, "/tags", {
          method: "POST",
          body: JSON.stringify({
            name: params.name,
            slug: params.slug,
            description: params.description,
          }),
        });
        break;

      case "get-media":
        result = await wpFetch(credentials, `/media?per_page=${params.perPage || 20}`);
        break;

      case "upload-media":
        if (!params.imageData) {
          return new Response(
            JSON.stringify({ success: false, error: "imageData (base64) é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { wordpress_url, wordpress_username, wordpress_app_password } = credentials;
        const baseUrl = wordpress_url.replace(/\/$/, "");
        const mediaApiUrl = `${baseUrl}/wp-json/wp/v2/media`;
        const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

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

      case "get-users":
        result = await wpFetch(credentials, `/users?per_page=${params.perPage || 100}`);
        break;

      case "get-current-user":
        result = await wpFetch(credentials, "/users/me");
        break;

      case "update-yoast-meta":
        if (!params.postId) {
          return new Response(
            JSON.stringify({ success: false, error: "postId é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await wpFetch(credentials, `/posts/${params.postId}`, {
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
        result = await wpFetch(credentials, `/posts/${params.postId}`, {
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
      log.warn("wp_action_error", { action, error: result.error, status: result.status });
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.requestEnd(200, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: true, data: result.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("api_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
