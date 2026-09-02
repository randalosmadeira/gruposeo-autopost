import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

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
  allowCrossProject?: boolean;
  categories?: Array<number | string>;
  tags?: Array<number | string>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function cleanContent(content: string) {
  return content.replace(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim();
}

function countWords(content: string) {
  return cleanContent(content).replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function endpointCandidates(baseUrl: string, path: string, namespace = "zica-posts/v1") {
  const base = baseUrl.replace(/\/$/, "");
  const clean = path.replace(/^\/+/, "");
  return [`${base}/wp-json/${namespace}/${clean}`, `${base}/?rest_route=/${namespace}/${clean}`];
}

async function pluginRequest(baseUrl: string, apiKey: string, path: string, init: RequestInit, namespace = "zica-posts/v1") {
  let lastError = "Zica Posts WordPress indisponível";
  for (const endpoint of endpointCandidates(baseUrl, path, namespace)) {
    try {
      const response = await fetch(endpoint, {
        ...init,
        headers: { ...(init.headers || {}), "X-ZICA-POSTS-Key": apiKey, Accept: "application/json" },
      });
      const text = await response.text();
      let data: Record<string, any> | null = null;
      try { data = JSON.parse(text); } catch { /* non-json */ }
      if (response.ok && data) return { data, endpointMode: endpoint.includes("rest_route=") ? "rest_route" : "wp_json" };
      if (response.status === 401 || response.status === 403) throw new Error("API Key Zica Posts recusada");
      lastError = String(data?.message || data?.error || (text.trim().startsWith("<") ? `WordPress retornou HTML (HTTP ${response.status})` : `HTTP ${response.status}`));
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (lastError.includes("API Key")) throw error;
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

function extensionForDataUrl(dataUrl: string) {
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  if (dataUrl.startsWith("data:image/avif")) return "avif";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "jpg";
  return "png";
}

async function uploadPluginImage(baseUrl: string, apiKey: string, dataUrl: string, article: Record<string, any>) {
  if (!dataUrl.startsWith("data:image")) return undefined;
  const config = article.config && typeof article.config === "object" ? article.config as Record<string, any> : {};
  const imageGeo = config.image_geo && typeof config.image_geo === "object" ? config.image_geo as Record<string, any> : {};
  const ext = extensionForDataUrl(dataUrl);
  const semanticBase = String(imageGeo.semantic_filename || article.slug || "featured").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase();
  const { data } = await pluginRequest(baseUrl, apiKey, "media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_data: dataUrl,
      filename: `${semanticBase || "featured"}.${ext}`,
      alt_text: String(imageGeo.alt_text || article.title || "Imagem destacada").slice(0, 300),
      caption: String(imageGeo.caption || "").slice(0, 500),
      preferred_format: imageGeo.preferred_format || "webp",
      target_width: 1200,
      target_height: 630,
      max_kb: 200,
    }),
    signal: AbortSignal.timeout(60000),
  });
  return data?.data?.id as number | undefined;
}

async function publishPlugin(project: Record<string, any>, article: Record<string, any>, apiKey: string, status: "draft" | "publish", categories: Array<number | string>, tags: Array<number | string>) {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  const featured = String(article.featured_image_url || "");
  const featuredImageId = featured ? await uploadPluginImage(baseUrl, apiKey, featured, article) : undefined;
  const config = article.config && typeof article.config === "object" ? article.config as Record<string, any> : {};
  const payload: Record<string, unknown> = {
    title: String(article.title || ""),
    content: cleanContent(String(article.content || "")),
    excerpt: String(article.excerpt || ""),
    slug: String(article.slug || ""),
    status,
    zica_ai_id: String(article.id),
    focus_keyword: String(config.focus_keyword || article.keyword || ""),
    seo_title: config.seo_title || undefined,
    seo_description: config.seo_description || undefined,
    image_alt_text: config.image_geo?.alt_text || undefined,
    image_caption: config.image_geo?.caption || undefined,
  };
  if (featuredImageId) payload.featured_image_id = featuredImageId;
  if (categories.length) payload.categories = categories;
  else if (Array.isArray(config.wordpress_categories)) payload.categories = config.wordpress_categories;
  if (tags.length) payload.tags = tags;
  else if (Array.isArray(config.wordpress_tags)) payload.tags = config.wordpress_tags;
  const result = await pluginRequest(baseUrl, apiKey, "articles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  }, String(project.wordpress_plugin_namespace || "zica-posts/v1"));
  if (!result.data.success) throw new Error(String(result.data.message || result.data.error || "Publicação recusada"));
  const row = result.data.data || {};
  return { postId: row.id, postUrl: row.link, duplicate: Boolean(result.data.duplicate), pluginContract: "zica-posts", pluginNamespace: project.wordpress_plugin_namespace || "zica-posts/v1", endpointMode: result.endpointMode };
}

async function standardRequest(baseUrl: string, path: string, auth: string, init: RequestInit) {
  const clean = path.replace(/^\/+/, "");
  const urls = [`${baseUrl}/wp-json/wp/v2/${clean}`, `${baseUrl}/?rest_route=/wp/v2/${clean}`];
  let lastStatus = 500;
  let lastMessage = "WordPress REST indisponível";
  for (const url of urls) {
    const response = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Basic ${auth}`, Accept: "application/json" } });
    lastStatus = response.status;
    const text = await response.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* non-json */ }
    if (response.ok && data) return data;
    lastMessage = String(data?.message || data?.error || `WordPress REST HTTP ${response.status}`);
  }
  throw new Error(`${lastMessage} (${lastStatus})`);
}

async function publishStandard(project: Record<string, any>, article: Record<string, any>, status: "draft" | "publish", categories: Array<number | string>, tags: Array<number | string>) {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  const auth = btoa(`${String(project.wordpress_username)}:${String(project.wordpress_app_password)}`);
  const payload: Record<string, unknown> = {
    title: String(article.title || ""),
    content: cleanContent(String(article.content || "")),
    excerpt: String(article.excerpt || ""),
    slug: String(article.slug || ""),
    status,
  };
  if (categories.length) payload.categories = categories.filter((value) => typeof value === "number");
  if (tags.length) payload.tags = tags.filter((value) => typeof value === "number");
  const post = await standardRequest(baseUrl, "posts", auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });
  return { postId: post.id, postUrl: post.link, duplicate: false, pluginContract: null, pluginNamespace: null, endpointMode: "wp-v2" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({})) as PublishRequest;
    if (!body.articleId || !body.projectId) return json({ success: false, error: "articleId e projectId são obrigatórios", request_id: requestId }, 400);
    const actor = await resolveRequestActor(req, body.userId);
    const userId = actor.userId;
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const [{ data: article }, { data: project }] = await Promise.all([
      admin.from("articles").select("*").eq("id", body.articleId).eq("user_id", userId).maybeSingle(),
      admin.from("projects").select("*").eq("id", body.projectId).eq("user_id", userId).maybeSingle(),
    ]);
    if (!article) return json({ success: false, error: "Artigo não encontrado", request_id: requestId }, 404);
    if (!project?.wordpress_url) return json({ success: false, error: "Projeto WordPress não encontrado", request_id: requestId }, 404);
    if (article.project_id && article.project_id !== body.projectId && body.allowCrossProject !== true) {
      return json({ success: false, error: "Artigo pertence a outro projeto. Para publicação multissite use allowCrossProject.", code: "cross_project_blocked", request_id: requestId }, 409);
    }

    const status = body.publishStatus || "publish";
    const config = article.config && typeof article.config === "object" ? article.config as Record<string, any> : {};
    if (status === "publish" && article.scheduled_at && Date.parse(article.scheduled_at) > Date.now() + 1000) return json({ success: false, error: "Publicação agendada ainda não venceu", code: "scheduled_not_due", scheduled_at: article.scheduled_at, retryable: true, request_id: requestId }, 409);
    if (status === "publish" && (config.needs_primary_source || config.review_pass === false)) return json({ success: false, error: "Publicação bloqueada: revisão/fonte primária pendente", code: "editorial_gate", retryable: false, request_id: requestId }, 409);
    if (status === "publish" && body.requireFeaturedImage && !article.featured_image_url) return json({ success: false, error: "Publicação bloqueada: imagem destacada pendente", code: "featured_image_gate", retryable: false, request_id: requestId }, 409);

    const words = Number(article.word_count || countWords(String(article.content || "")));
    const configuredMin = Number(config?.geo_word_band?.min || 0);
    const minimum = configuredMin > 0 ? configuredMin : 300;
    if (status === "publish" && words < minimum) return json({ success: false, error: `Conteúdo insuficiente para publicação: ${words} palavras, mínimo configurado ${minimum}`, code: "content_gate", retryable: false, request_id: requestId }, 409);

    const categories = Array.isArray(body.categories) ? body.categories : [];
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const pluginMode = String(project.wordpress_connector_mode) === "zica_posts" || String(project.wordpress_username) === "__ZICA_POSTS_PLUGIN__";
    let result: any;
    let credentialSource: string | null = null;
    if (pluginMode) {
      const credential = await resolvePluginKey(admin, project);
      credentialSource = credential.source;
      result = await publishPlugin(project, article, credential.apiKey, status, categories, tags);
    } else {
      if (!project.wordpress_username || !project.wordpress_app_password) return json({ success: false, error: "Credenciais WordPress não configuradas", request_id: requestId }, 400);
      result = await publishStandard(project, article, status, categories, tags);
    }

    const now = new Date().toISOString();
    const publications = config.wordpress_publications && typeof config.wordpress_publications === "object" ? { ...config.wordpress_publications } : {};
    publications[project.id] = {
      project_id: project.id,
      project_name: project.name,
      post_id: result.postId || null,
      post_url: result.postUrl || null,
      status,
      categories,
      tags,
      duplicate: Boolean(result.duplicate),
      published_at: now,
    };
    const nextConfig = {
      ...config,
      wordpress_publications: publications,
      wordpress_last_sync_at: now,
      wordpress_last_project_id: project.id,
      wordpress_last_post_id: result.postId || null,
      wordpress_last_post_url: result.postUrl || null,
    };

    const isPrimaryProject = !article.project_id || article.project_id === project.id;
    const articleUpdate = status === "publish"
      ? {
          status: "published",
          published_at: article.published_at || now,
          published_url: isPrimaryProject ? (result.postUrl || article.published_url || null) : (article.published_url || result.postUrl || null),
          scheduled_at: isPrimaryProject ? null : article.scheduled_at,
          error_message: null,
          config: nextConfig,
          updated_at: now,
        }
      : { status: article.status || "draft", error_message: null, config: nextConfig, updated_at: now };

    await Promise.all([
      admin.from("articles").update(articleUpdate).eq("id", article.id).eq("user_id", userId),
      admin.from("projects").update({ is_connected: true, wordpress_last_verified_at: now, updated_at: now }).eq("id", project.id).eq("user_id", userId),
    ]);

    return json({
      success: true,
      articleId: article.id,
      projectId: project.id,
      projectName: project.name,
      postId: result.postId,
      postUrl: result.postUrl,
      status,
      duplicate: Boolean(result.duplicate),
      categories,
      pluginContract: result.pluginContract,
      pluginNamespace: result.pluginNamespace,
      endpointMode: result.endpointMode,
      credentialSource,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    return json({ success: false, error: error instanceof Error ? error.message : "Falha ao publicar no WordPress", request_id: requestId }, 502);
  }
});
