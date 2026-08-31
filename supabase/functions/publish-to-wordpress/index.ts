import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PublishRequest {
  articleId: string;
  projectId: string;
  userId?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function jwtRole(token: string) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return String(decoded?.role || "");
  } catch {
    return "";
  }
}

function cleanContent(content: string) {
  return content
    .replace(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function basicSchemas(article: Record<string, unknown>, siteUrl: string) {
  const title = String(article.title || "");
  const excerpt = String(article.excerpt || "");
  const slug = String(article.slug || "");
  const image = article.featured_image_url ? String(article.featured_image_url) : undefined;
  const url = `${siteUrl.replace(/\/$/, "")}/${slug}/`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description: excerpt,
      ...(image ? { image } : {}),
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      publisher: { "@type": "Organization", name: new URL(siteUrl).hostname },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${siteUrl.replace(/\/$/, "")}/` },
        { "@type": "ListItem", position: 2, name: title, item: url },
      ],
    },
  ];
}

async function uploadPluginImage(baseUrl: string, apiKey: string, dataUrl: string, slug: string, alt: string) {
  const res = await fetch(`${baseUrl}/wp-json/zica-ai/v1/media`, {
    method: "POST",
    headers: { "X-ZICA-AI-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ image_data: dataUrl, filename: `${slug || "featured"}.png`, alt_text: alt }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return undefined;
  const data = await res.json().catch(() => null);
  return data?.data?.id as number | undefined;
}

async function publishPlugin(project: Record<string, unknown>, article: Record<string, unknown>) {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  const apiKey = String(project.wordpress_app_password);
  let featuredImageId: number | undefined;
  const featured = article.featured_image_url ? String(article.featured_image_url) : "";
  if (featured.startsWith("data:image")) {
    featuredImageId = await uploadPluginImage(baseUrl, apiKey, featured, String(article.slug || "featured"), String(article.title || ""));
  }

  const config = (article.config && typeof article.config === "object") ? article.config as Record<string, unknown> : {};
  const payload: Record<string, unknown> = {
    title: String(article.title || ""),
    content: cleanContent(String(article.content || "")),
    excerpt: String(article.excerpt || ""),
    slug: String(article.slug || ""),
    status: "publish",
    zica_ai_id: String(article.id),
    cfrdm_id: String(article.id),
    focus_keyword: String(config.focus_keyword || article.keyword || ""),
    seo_title: config.seo_title || undefined,
    seo_description: config.seo_description || undefined,
    json_ld_schemas: basicSchemas(article, baseUrl),
  };
  if (featuredImageId) payload.featured_image_id = featuredImageId;
  if (Array.isArray(config.wordpress_categories)) payload.categories = config.wordpress_categories;
  if (Array.isArray(config.wordpress_tags)) payload.tags = config.wordpress_tags;

  const res = await fetch(`${baseUrl}/wp-json/zica-ai/v1/articles`, {
    method: "POST",
    headers: { "X-ZICA-AI-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* response checked below */ }
  if (!res.ok || !data.success) throw new Error(String(data.message || `WordPress plugin HTTP ${res.status}`));
  const result = (data.data && typeof data.data === "object") ? data.data as Record<string, unknown> : {};
  return { postId: result.id, postUrl: result.link };
}

async function uploadStandardImage(baseUrl: string, auth: string, dataUrl: string, slug: string) {
  const encoded = dataUrl.split(",")[1];
  if (!encoded) return undefined;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${slug || "featured"}.png"` },
    body: bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data?.id as number | undefined;
}

async function publishStandard(project: Record<string, unknown>, article: Record<string, unknown>) {
  const baseUrl = String(project.wordpress_url).replace(/\/$/, "");
  const auth = btoa(`${String(project.wordpress_username)}:${String(project.wordpress_app_password)}`);
  let featuredMedia: number | undefined;
  const featured = article.featured_image_url ? String(article.featured_image_url) : "";
  if (featured.startsWith("data:image")) featuredMedia = await uploadStandardImage(baseUrl, auth, featured, String(article.slug || "featured"));

  const payload: Record<string, unknown> = {
    title: String(article.title || ""),
    content: cleanContent(String(article.content || "")),
    excerpt: String(article.excerpt || ""),
    slug: String(article.slug || ""),
    status: "publish",
  };
  if (featuredMedia) payload.featured_media = featuredMedia;

  const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`WordPress REST HTTP ${res.status}`);
  const post = await res.json();
  return { postId: post.id, postUrl: post.link };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Autorização necessária" }, 401);
  const token = authHeader.slice(7);
  const role = jwtRole(token);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "Backend incompleto" }, 500);

  try {
    const body = (await req.json()) as PublishRequest;
    if (!body.articleId || !body.projectId) return json({ success: false, error: "articleId e projectId são obrigatórios" }, 400);

    let userId = "";
    if (role === "service_role") {
      userId = body.userId || "";
      if (!userId) return json({ success: false, error: "userId é obrigatório em background" }, 400);
    } else {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data.user) return json({ success: false, error: "Sessão inválida" }, 401);
      userId = data.user.id;
      if (body.userId && body.userId !== userId) return json({ success: false, error: "userId incompatível" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const [{ data: article, error: articleError }, { data: project, error: projectError }] = await Promise.all([
      admin.from("articles").select("*").eq("id", body.articleId).eq("user_id", userId).maybeSingle(),
      admin.from("projects").select("id,user_id,wordpress_url,wordpress_username,wordpress_app_password").eq("id", body.projectId).eq("user_id", userId).maybeSingle(),
    ]);

    if (articleError || !article) return json({ success: false, error: "Artigo não encontrado ou acesso negado" }, 404);
    if (projectError || !project) return json({ success: false, error: "Projeto não encontrado ou acesso negado" }, 404);
    if (!project.wordpress_url || !project.wordpress_app_password) return json({ success: false, error: "Credenciais WordPress não configuradas" }, 400);
    if (article.project_id && article.project_id !== body.projectId) return json({ success: false, error: "Artigo não pertence ao projeto informado" }, 409);

    const content = cleanContent(String(article.content || ""));
    if (content.length < 50) return json({ success: false, error: "Artigo sem conteúdo suficiente para publicação" }, 409);
    if (article.status === "published" && article.published_url) {
      return json({ success: true, duplicate: true, postUrl: article.published_url, articleId: article.id });
    }

    const result = ["__ZICA_AI_PLUGIN__", "__CFRDM_PLUGIN__"].includes(String(project.wordpress_username))
      ? await publishPlugin(project, article)
      : await publishStandard(project, article);

    await admin.from("articles").update({
      status: "published",
      published_at: new Date().toISOString(),
      published_url: result.postUrl || null,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", article.id).eq("user_id", userId);

    return json({ success: true, articleId: article.id, postId: result.postId, postUrl: result.postUrl });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Falha ao publicar no WordPress" }, 502);
  }
});
