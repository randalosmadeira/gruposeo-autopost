import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PublishRequest = {
  articleId: string;
  projectId: string;
  userId?: string;
  publishStatus?: "draft" | "publish";
  requireFeaturedImage?: boolean;
};

type PluginContract = { namespace: string; header: string; id: string };
const contracts: PluginContract[] = [
  { namespace: "zica-posts/v1", header: "X-ZICA-POSTS-Key", id: "zica-posts" },
  { namespace: "zica-ai/v1", header: "X-ZICA-AI-API-Key", id: "zica-ai" },
  { namespace: "cfrdm/v1", header: "X-CFRDM-API-Key", id: "legacy-cfrdm" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function jwtRole(token: string) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return String(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")))?.role || "");
  } catch { return ""; }
}

function cleanContent(content: string) {
  return content.replace(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
}

function endpointCandidates(baseUrl: string, namespace: string, path: string) {
  const base = baseUrl.replace(/\/$/, "");
  const clean = path.replace(/^\/+/, "");
  return [`${base}/wp-json/${namespace}/${clean}`, `${base}/?rest_route=/${namespace}/${clean}`];
}

async function pluginRequest(baseUrl: string, apiKey: string, path: string, init: RequestInit) {
  let lastError = "Plugin WordPress indisponível";
  for (const contract of contracts) {
    for (const endpoint of endpointCandidates(baseUrl, contract.namespace, path)) {
      try {
        const response = await fetch(endpoint, { ...init, headers: { ...(init.headers || {}), [contract.header]: apiKey, Accept: "application/json" } });
        const text = await response.text();
        let data: Record<string, any> | null = null;
        try { data = JSON.parse(text); } catch { /* fallback */ }
        if (response.ok && data) return { data, contract, endpointMode: endpoint.includes("rest_route=") ? "rest_route" : "wp_json" };
        if ((response.status === 401 || response.status === 403) && data) throw new Error(`API Key recusada por ${contract.id}`);
        lastError = String(data?.message || data?.error || `HTTP ${response.status}`);
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (lastError.includes("API Key recusada")) throw new Error(lastError);
      }
    }
  }
  throw new Error(lastError);
}

async function resolvePluginKey(admin: any, project: Record<string, any>) {
  const ref = String(project.wordpress_credential_ref || "").trim();
  if (ref) {
    const { data, error } = await admin.rpc("get_zica_wordpress_credential", { p_ref: ref });
    if (error || !data) throw new Error("Credencial WordPress do Vault indisponível");
    return { apiKey: String(data), source: "vault" };
  }
  const legacy = String(project.wordpress_app_password || "").trim();
  if (!legacy) throw new Error("Credencial WordPress não configurada");
  return { apiKey: legacy, source: "legacy-project-field" };
}

async function uploadPluginImage(baseUrl: string, apiKey: string, dataUrl: string, slug: string, alt: string) {
  if (!dataUrl.startsWith("data:image")) return undefined;
  const { data } = await pluginRequest(baseUrl, apiKey, "media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_data: dataUrl, filename: `${slug || "featured"}.png`, alt_text: alt }),
    signal: AbortSignal.timeout(45000),
  });
  return data?.data?.id as number | undefined;
}

async function publishPlugin(project: Record<string, any>, article: Record<string, any>, apiKey: string, status: "draft" | "publish") {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  const featured = String(article.featured_image_url || "");
  const featuredImageId = featured ? await uploadPluginImage(baseUrl, apiKey, featured, String(article.slug || "featured"), String(article.title || "")) : undefined;
  const config = article.config && typeof article.config === "object" ? article.config as Record<string, unknown> : {};
  const payload: Record<string, unknown> = {
    title: String(article.title || ""),
    content: cleanContent(String(article.content || "")),
    excerpt: String(article.excerpt || ""),
    slug: String(article.slug || ""),
    status,
    zica_ai_id: String(article.id),
    cfrdm_id: String(article.id),
    focus_keyword: String(config.focus_keyword || article.keyword || ""),
    seo_title: config.seo_title || undefined,
    seo_description: config.seo_description || undefined,
  };
  if (featuredImageId) payload.featured_image_id = featuredImageId;
  if (Array.isArray(config.wordpress_categories)) payload.categories = config.wordpress_categories;
  if (Array.isArray(config.wordpress_tags)) payload.tags = config.wordpress_tags;
  const result = await pluginRequest(baseUrl, apiKey, "articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
  if (!result.data.success) throw new Error(String(result.data.message || result.data.error || "Publicação recusada"));
  const row = result.data.data || {};
  return { postId: row.id, postUrl: row.link, pluginContract: result.contract.id, pluginNamespace: result.contract.namespace, endpointMode: result.endpointMode };
}

async function standardRequest(baseUrl: string, path: string, auth: string, init: RequestInit) {
  const clean = path.replace(/^\/+/, "");
  const urls = [`${baseUrl}/wp-json/wp/v2/${clean}`, `${baseUrl}/?rest_route=/wp/v2/${clean}`];
  let last = 500;
  for (const url of urls) {
    const response = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Basic ${auth}`, Accept: "application/json" } });
    last = response.status;
    const text = await response.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* fallback */ }
    if (response.ok && data) return data;
  }
  throw new Error(`WordPress REST HTTP ${last}`);
}

async function publishStandard(project: Record<string, any>, article: Record<string, any>, status: "draft" | "publish") {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  const auth = btoa(`${String(project.wordpress_username)}:${String(project.wordpress_app_password)}`);
  const post = await standardRequest(baseUrl, "posts", auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: String(article.title || ""), content: cleanContent(String(article.content || "")), excerpt: String(article.excerpt || ""), slug: String(article.slug || ""), status }),
    signal: AbortSignal.timeout(60000),
  });
  return { postId: post.id, postUrl: post.link, pluginContract: null, pluginNamespace: null, endpointMode: "auto" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "Autorização necessária" }, 401);

  try {
    const body = await req.json() as PublishRequest;
    if (!body.articleId || !body.projectId) return json({ success: false, error: "articleId e projectId são obrigatórios" }, 400);
    const token = authHeader.slice(7);
    const role = jwtRole(token);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "Backend incompleto" }, 500);

    let userId = "";
    if (role === "service_role") {
      userId = body.userId || "";
      if (!userId) return json({ success: false, error: "userId é obrigatório em background" }, 400);
    } else {
      const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return json({ success: false, error: "Sessão inválida" }, 401);
      userId = data.user.id;
      if (body.userId && body.userId !== userId) return json({ success: false, error: "userId incompatível" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const [{ data: article }, { data: project }] = await Promise.all([
      admin.from("articles").select("*").eq("id", body.articleId).eq("user_id", userId).maybeSingle(),
      admin.from("projects").select("*").eq("id", body.projectId).eq("user_id", userId).maybeSingle(),
    ]);
    if (!article) return json({ success: false, error: "Artigo não encontrado" }, 404);
    if (!project?.wordpress_url) return json({ success: false, error: "Projeto WordPress não encontrado" }, 404);
    if (article.project_id && article.project_id !== body.projectId) return json({ success: false, error: "Artigo pertence a outro projeto" }, 409);

    const status = body.publishStatus || "publish";
    const config = article.config && typeof article.config === "object" ? article.config as Record<string, any> : {};
    if (status === "publish" && (config.needs_primary_source || config.review_pass === false)) return json({ success: false, error: "Publicação bloqueada: revisão/fonte primária pendente", code: "editorial_gate" }, 409);
    if (status === "publish" && body.requireFeaturedImage && !article.featured_image_url) return json({ success: false, error: "Publicação bloqueada: imagem destacada pendente", code: "featured_image_gate" }, 409);
    if (cleanContent(String(article.content || "")).length < 50) return json({ success: false, error: "Conteúdo insuficiente" }, 409);
    if (status === "publish" && article.status === "published" && article.published_url) return json({ success: true, duplicate: true, postUrl: article.published_url, articleId: article.id });

    const pluginMode = String(project.wordpress_connector_mode) === "zica_posts" || ["__ZICA_POSTS_PLUGIN__", "__ZICA_AI_PLUGIN__", "__CFRDM_PLUGIN__"].includes(String(project.wordpress_username));
    let result: any;
    let credentialSource: string | null = null;
    if (pluginMode) {
      const credential = await resolvePluginKey(admin, project);
      credentialSource = credential.source;
      result = await publishPlugin(project, article, credential.apiKey, status);
    } else {
      if (!project.wordpress_username || !project.wordpress_app_password) return json({ success: false, error: "Credenciais WordPress não configuradas" }, 400);
      result = await publishStandard(project, article, status);
    }

    const now = new Date().toISOString();
    const nextConfig = { ...config, wordpress_post_id: result.postId || null, wordpress_status: status, wordpress_last_sync_at: now };
    const articleUpdate = status === "publish"
      ? { status: "published", published_at: now, published_url: result.postUrl || null, error_message: null, config: nextConfig, updated_at: now }
      : { status: "draft", error_message: null, config: nextConfig, updated_at: now };
    await Promise.all([
      admin.from("articles").update(articleUpdate).eq("id", article.id).eq("user_id", userId),
      admin.from("projects").update({ is_connected: true, wordpress_last_verified_at: now, updated_at: now }).eq("id", project.id).eq("user_id", userId),
    ]);

    return json({ success: true, articleId: article.id, postId: result.postId, postUrl: result.postUrl, status, pluginContract: result.pluginContract, pluginNamespace: result.pluginNamespace, endpointMode: result.endpointMode, credentialSource });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Falha ao publicar no WordPress" }, 502);
  }
});
