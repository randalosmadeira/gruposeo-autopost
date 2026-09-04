import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const env = (name: string) => String(Deno.env.get(name) || "").trim();

async function sha256(value: string | Uint8Array) {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeDataUrl(value: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw new Error("unsupported_image_data_url");
  const raw = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  return { bytes, mime: match[1], extension };
}

async function persist(admin: ReturnType<typeof createClient>, userId: string, value: string) {
  const decoded = decodeDataUrl(value);
  const contentHash = await sha256(decoded.bytes);
  const path = `${userId}/legacy-preserved/${contentHash}.${decoded.extension}`;
  const { error } = await admin.storage.from("article-images").upload(path, decoded.bytes, {
    contentType: decoded.mime,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from("article-images").getPublicUrl(path);
  return { url: data.publicUrl, path, contentHash, mime: decoded.mime, bytes: decoded.bytes.byteLength };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!url || !serviceKey) return json({ success: false, error: "backend_not_configured", request_id: requestId }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const suppliedKey = req.headers.get("x-zica-automation-key") || "";
    const { data: ingress } = await admin.from("automation_ingress_keys").select("secret_hash,enabled").eq("name", "zica-brain").maybeSingle();
    if (!suppliedKey || !ingress?.enabled || !ingress.secret_hash || await sha256(suppliedKey) !== ingress.secret_hash) {
      return json({ success: false, error: "automation_unauthorized", request_id: requestId }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const maxRows = Math.max(1, Math.min(25, Number(body?.maxRows || 10)));
    const deadline = Date.now() + 140_000;
    const results: Array<Record<string, unknown>> = [];

    while (results.length < maxRows && Date.now() < deadline) {
      // Data URLs expand substantially while JSON, decoded bytes and upload
      // buffers coexist. Two rows keep Edge memory bounded on historical data.
      const batchSize = Math.min(2, maxRows - results.length);
      const { data: articles, error: articleError } = await admin.from("articles")
        .select("id,user_id,config,featured_image_url")
        .like("featured_image_url", "data:image/%;base64,%")
        .order("created_at", { ascending: true })
        .limit(batchSize);
      if (articleError) throw articleError;
      if (articles?.length) {
        const processed = await Promise.all(articles.map(async (article) => {
          const stored = await persist(admin, article.user_id, article.featured_image_url);
          const config = article.config && typeof article.config === "object" ? article.config : {};
          const imageGeo = config.image_geo && typeof config.image_geo === "object" ? config.image_geo : {};
          const { error } = await admin.from("articles").update({
            featured_image_url: stored.url,
            config: { ...config, image_geo: { ...imageGeo, storage_bucket: "article-images", storage_path: stored.path, content_hash: stored.contentHash, original_base64_preserved: true, externalized_at: new Date().toISOString() } },
            updated_at: new Date().toISOString(),
          }).eq("id", article.id).like("featured_image_url", "data:image/%;base64,%");
          if (error) throw error;
          return { source: "articles", id: article.id, content_hash: stored.contentHash, bytes: stored.bytes };
        }));
        results.push(...processed);
        continue;
      }

      const { data: versions, error: versionError } = await admin.from("article_versions")
        .select("id,user_id,featured_image_url")
        .like("featured_image_url", "data:image/%;base64,%")
        .order("created_at", { ascending: true })
        .limit(batchSize);
      if (versionError) throw versionError;
      if (!versions?.length) break;
      const processed = await Promise.all(versions.map(async (version) => {
        const stored = await persist(admin, version.user_id, version.featured_image_url);
        const { error } = await admin.from("article_versions").update({ featured_image_url: stored.url })
          .eq("id", version.id).like("featured_image_url", "data:image/%;base64,%");
        if (error) throw error;
        return { source: "article_versions", id: version.id, content_hash: stored.contentHash, bytes: stored.bytes };
      }));
      results.push(...processed);
    }

    const [{ count: remainingArticles }, { count: remainingVersions }] = await Promise.all([
      admin.from("articles").select("id", { count: "exact", head: true }).like("featured_image_url", "data:image/%;base64,%"),
      admin.from("article_versions").select("id", { count: "exact", head: true }).like("featured_image_url", "data:image/%;base64,%"),
    ]);
    return json({
      success: true,
      processed: results.length,
      results,
      remaining: { articles: remainingArticles || 0, article_versions: remainingVersions || 0 },
      complete: (remainingArticles || 0) === 0 && (remainingVersions || 0) === 0,
      request_id: requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error).slice(0, 800);
    return json({ success: false, error: message || "externalization_failed", request_id: requestId }, 500);
  }
});
