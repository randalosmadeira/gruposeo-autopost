import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PublishRequest { articleId: string; projectId: string; userId?: string; }
type PluginContract = { namespace: string; header: string; id: string };
const pluginContracts: PluginContract[] = [
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
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return String(decoded?.role || "");
  } catch { return ""; }
}

function cleanContent(content: string) {
  return content.replace(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
}

function basicSchemas(article: Record<string, unknown>, siteUrl: string) {
  const title = String(article.title || "");
  const excerpt = String(article.excerpt || "");
  const slug = String(article.slug || "");
  const image = article.featured_image_url ? String(article.featured_image_url) : undefined;
  const url = `${siteUrl.replace(/\/$/, "")}/${slug}/`;
  return [
    {
      "@context": "https://schema.org", "@type": "Article", headline: title, description: excerpt,
      ...(image ? { image } : {}), mainEntityOfPage: { "@type": "WebPage", "@id": url },
      publisher: { "@type": "Organization", name: new URL(siteUrl).hostname },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${siteUrl.replace(/\/$/, "")}/` },
        { "@type": "ListItem", position: 2, name: title, item: url },
      ],
    },
  ];
}

function pluginEndpointCandidates(baseUrl: string, namespace: string, path: string) {
  const base = baseUrl.replace(/\/$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return [
    `${base}/wp-json/${namespace}/${normalizedPath}`,
    `${base}/?rest_route=/${namespace}/${normalizedPath}`,
  ];
}

async function pluginRequest(baseUrl: string, apiKey: string, path: string, init: RequestInit) {
  let lastError = "Plugin WordPress indisponível";
  for (const contract of pluginContracts) {
    for (const endpoint of pluginEndpointCandidates(baseUrl, contract.namespace, path)) {
      try {
        const res = await fetch(endpoint, {
          ...init,
          headers: { ...(init.headers || {}), [contract.header]: apiKey, Accept: "application/json" },
        });
        const text = await res.text();
        let data: Record<string, any> | null = null;
        try { data = JSON.parse(text); } catch { /* route fallback */ }
        if (res.ok && data) return { res, data, contract, endpointMode: endpoint.includes("rest_route=") ? "rest_route" : "wp_json" };
        if ((res.status === 401 || res.status === 403) && data) throw new Error(`API Key recusada por ${contract.id}`);
        lastError = String(data?.message || data?.error || `HTTP ${res.status} em ${contract.namespace}`);
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (lastError.includes("API Key recusada")) throw new Error(lastError);
      }
    }
  }
  throw new Error(lastError);
}

async function resolvePluginCredential(admin: any, project: Record<string, unknown>) {
  const ref = String(project.wordpress_credential_ref || "").trim();
  if (ref) {
    const { data, error } = await admin.rpc("get_zica_wordpress_credential", { p_ref: ref });
    if (error) throw new Error("Credencial WordPress do Vault indisponível");
    const secret = String(data || "").trim();
    if (!secret) throw new Error("Credencial WordPress não encontrada no Vault");
    return { apiKey: secret, keySource: "vault" };
  }
  const legacy = String(project.wordpress_app_password || "").trim();
  if (!legacy) throw new Error("Credencial WordPress não configurada");
  return { apiKey: legacy, keySource: "legacy-project-field" };
}

async function uploadPluginImage(baseUrl: string, apiKey: string, dataUrl: string, slug: string, alt: string) {
  try {
    const { data } = await pluginRequest(baseUrl, apiKey, "media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: dataUrl, filename: `${slug || "featured"}.png`, alt_text: alt }),
      signal: AbortSignal.timeout(30000),
    });
    return data?.data?.id as number | undefined;
  } catch { return undefined; }
}

async function publishPlugin(project: Record<string, unknown>, article: Record<string, unknown>, apiKey: string) {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  let featuredImageId: number | undefined;
  const featured = article.featured_image_url ? String(article.featured_image_url) : "";
  if (featured.startsWith("data:image")) featuredImageId = await uploadPluginImage(baseUrl, apiKey, featured, String(article.slug || "featured"), String(article.title || ""));

  const config = (article.config && typeof article.config === "object") ? article.config as Record<string, unknown> : {};
  const payload: Record<string, unknown> = {
    title: String(article.title || ""), content: cleanContent(String(article.content || "")), excerpt: String(article.excerpt || ""),
    slug: String(article.slug || ""), status: "publish", zica_ai_id: String(article.id), cfrdm_id: String(article.id),
    focus_keyword: String(config.focus_keyword || article.keyword || ""), seo_title: config.seo_title || undefined,
    seo_description: config.seo_description || undefined, json_ld_schemas: basicSchemas(article, baseUrl),
  };
  if (featuredImageId) payload.featured_image_id = featuredImageId;
  if (Array.isArray(config.wordpress_categories)) payload.categories = config.wordpress_categories;
  if (Array.isArray(config.wordpress_tags)) payload.tags = config.wordpress_tags;

  const { data, contract, endpointMode } = await pluginRequest(baseUrl, apiKey, "articles", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(45000),
  });
  if (!data.success) throw new Error(String(data.message || data.error || "Publicação recusada pelo plugin"));
  const result = (data.data && typeof data.data === "object") ? data.data as Record<string, unknown> : {};
  return { postId: result.id, postUrl: result.link, pluginContract: contract.id, pluginNamespace: contract.namespace, endpointMode };
}

async function uploadStandardImage(baseUrl: string, auth: string, dataUrl: string, slug: string) {
  const encoded = dataUrl.split(",")[1]; if (!encoded) return undefined;
  const binary = atob(encoded); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
    method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${slug || "featured"}.png"` }, body: bytes, signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return undefined; const data = await res.json(); return data?.id as number | undefined;
}

async function publishStandard(project: Record<string, unknown>, article: Record<string, unknown>) {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  const auth = btoa(`${String(project.wordpress_username)}:${String(project.wordpress_app_password)}`);
  let featuredMedia: number | undefined;
  const featured = article.featured_image_url ? String(article.featured_image_url) : "";
  if (featured.startsWith("data:image")) featuredMedia = await uploadStandardImage(baseUrl, auth, featured, String(article.slug || "featured"));
  const payload: Record<string, unknown> = { title: String(article.title || ""), content: cleanContent(String(article.content || "")), excerpt: String(article.excerpt || ""), slug: String(article.slug || ""), status: "publish" };
  if (featuredMedia) payload.featured_media = featuredMedia;
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`WordPress REST HTTP ${res.status}`);
  const post = await res.json(); return { postId: post.id, postUrl: post.link, pluginContract: null, pluginNamespace: null, endpointMode: "wp_json" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Autorização necessária" }, 401);
  const token = authHeader.slice(7); const role = jwtRole(token);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""; const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || ""; const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "Backend incompleto" }, 500);

  try {
    const body = await req.json() as PublishRequest;
    if (!body.articleId || !body.projectId) return json({ success: false, error: "articleId e projectId são obrigatórios" }, 400);
    let userId = "";
    if (role === "service_role") { userId = body.userId || ""; if (!userId) return json({ success: false, error: "userId é obrigatório em background" }, 400); }
    else {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data.user) return json({ success: false, error: "Sessão inválida" }, 401);
      userId = data.user.id; if (body.userId && body.userId !== userId) return json({ success: false, error: "userId incompatível" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const [{ data: article, error: articleError }, { data: project, error: projectError }] = await Promise.all([
      admin.from("articles").select("*").eq("id", body.articleId).eq("user_id", userId).maybeSingle(),
      admin.from("projects").select("id,user_id,wordpress_url,wordpress_username,wordpress_app_password,wordpress_connector_mode,wordpress_credential_ref,wordpress_plugin_namespace,wordpress_plugin_version").eq("id", body.projectId).eq("user_id", userId).maybeSingle(),
    ]);
    if (articleError || !article) return json({ success: false, error: "Artigo não encontrado ou acesso negado" }, 404);
    if (projectError || !project) return json({ success: false, error: "Projeto não encontrado ou acesso negado" }, 404);
    if (!project.wordpress_url) return json({ success: false, error: "URL WordPress não configurada" }, 400);
    if (article.project_id && article.project_id !== body.projectId) return json({ success: false, error: "Artigo não pertence ao projeto informado" }, 409);
    const content = cleanContent(String(article.content || ""));
    if (content.length < 50) return json({ success: false, error: "Artigo sem conteúdo suficiente para publicação" }, 409);
    if (article.status === "published" && article.published_url) return json({ success: true, duplicate: true, postUrl: article.published_url, articleId: article.id });

    const pluginMode = String(project.wordpress_connector_mode) === "zica_posts" || ["__ZICA_POSTS_PLUGIN__", "__ZICA_AI_PLUGIN__", "__CFRDM_PLUGIN__"].includes(String(project.wordpress_username));
    let result: any;
    let keySource: string | null = null;
    if (pluginMode) {
      const credential = await resolvePluginCredential(admin, project);
      keySource = credential.keySource;
      result = await publishPlugin(project, article, credential.apiKey);
    } else {
      if (!project.wordpress_username || !project.wordpress_app_password) return json({ success: false, error: "Credenciais WordPress não configuradas" }, 400);
      result = await publishStandard(project, article);
    }

    const now = new Date().toISOString();
    await Promise.all([
      admin.from("articles").update({ status: "published", published_at: now, published_url: result.postUrl || null, error_message: null, updated_at: now }).eq("id", article.id).eq("user_id", userId),
      admin.from("projects").update({ is_connected: true, wordpress_last_verified_at: now, updated_at: now }).eq("id", project.id).eq("user_id", userId),
    ]);
    return json({ success: true, articleId: article.id, postId: result.postId, postUrl: result.postUrl, pluginContract: result.pluginContract, pluginNamespace: result.pluginNamespace, endpointMode: result.endpointMode, credentialSource: keySource });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Falha ao publicar no WordPress" }, 502);
  }
});