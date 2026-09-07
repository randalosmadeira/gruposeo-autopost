import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isServiceCredential } from "../_shared/request-auth.ts";
import { HERO_16_9, deriveHeroImage, deriveJpegCopy, imagePolicyMetadata, type StorageAdmin } from "../_shared/image-policy.ts";

/**
 * Batch maintenance: applies the 2026-09 image policy to articles whose
 * featured image predates it (master-only URL, external URL or missing
 * compliance metadata). Idempotent: compliant articles are skipped.
 *
 * Optionally re-syncs published posts so WordPress receives the derived hero
 * as featured media through the regular publish-to-wordpress path.
 *
 * Auth: service-role bearer (internal callers) or the zica-brain automation
 * key (cron / SQL maintenance). Never exposed to end users.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const env = (name: string) => String(Deno.env.get(name) || "").trim();
const BUCKET = "article-images";
const HERO_SUFFIX = `-${HERO_16_9.width}x${HERO_16_9.height}.webp`;

type Json = Record<string, unknown>;
type Admin = ReturnType<typeof createClient>;
type ArticleRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  status: string;
  title: string | null;
  slug: string | null;
  featured_image_url: string | null;
  config: Json | null;
};
type ReprocessRequest = {
  userId?: string;
  articleIds?: string[];
  maxRows?: number;
  pushToWordpress?: boolean;
  dryRun?: boolean;
};

const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : {});
const str = (value: unknown) => String(value ?? "").trim();

async function sha256(value: string | Uint8Array) {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extensionFor(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("avif")) return "avif";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function isCompliant(config: Json, featured: string) {
  const policy = obj(obj(config.image_geo).image_policy);
  return policy.compliance === "compliant" && featured.endsWith(HERO_SUFFIX);
}

/** Path inside the public article-images bucket, when the URL points there. */
function masterPathFromUrl(supabaseUrl: string, url: string) {
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = decodeURIComponent(url.slice(prefix.length).split("?")[0]);
  return path || null;
}

async function downloadMaster(admin: Admin, path: string) {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`master_download_failed:${error?.message || "empty"}`);
  const mime = data.type || "image/jpeg";
  return { bytes: new Uint8Array(await data.arrayBuffer()), mime };
}

/** External image → stored master inside article-images (kept for audit). */
async function importExternalMaster(admin: Admin, userId: string, url: string) {
  const response = await fetch(url, { redirect: "follow", headers: { Accept: "image/*" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`external_image_http_${response.status}`);
  const mime = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("image/")) throw new Error("external_image_not_image");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error("external_image_size");
  const hash = await sha256(bytes);
  const path = `${userId}/reprocessed/${hash}.${extensionFor(mime)}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, cacheControl: "31536000", upsert: true });
  if (error) throw new Error(`master_upload_failed:${error.message}`);
  return { path, bytes, mime, hash };
}

async function authorize(req: Request, admin: Admin) {
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (bearer && isServiceCredential(bearer)) return "service";
  const supplied = req.headers.get("x-zica-automation-key") || "";
  if (supplied) {
    const { data } = await admin.from("automation_ingress_keys").select("secret_hash,enabled").eq("name", "zica-brain").maybeSingle();
    const ingress = obj(data);
    if (ingress.enabled === true && typeof ingress.secret_hash === "string" && await sha256(supplied) === ingress.secret_hash) return "automation";
  }
  return null;
}

async function republish(supabaseUrl: string, serviceKey: string, userId: string, articleId: string, projectId: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/publish-to-wordpress`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, articleId, projectId, publishStatus: "publish", automated: true, allowCrossProject: true, requireFeaturedImage: true }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await response.text();
  let data: Json = {};
  try { data = obj(JSON.parse(text)); } catch { data = { error: text.slice(0, 400) }; }
  return { ok: response.ok && data.success !== false, status: response.status, postId: data.postId ?? null, postUrl: data.postUrl ?? null, error: data.error ?? null, code: data.code ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "backend_not_configured", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const mode = await authorize(req, admin);
    if (!mode) return json({ success: false, error: "automation_unauthorized", request_id: requestId }, 401);

    const body = await req.json().catch(() => ({})) as ReprocessRequest;
    const maxRows = Math.max(1, Math.min(40, Number(body.maxRows || 10)));
    const ids = Array.isArray(body.articleIds) ? body.articleIds.map(String).filter(Boolean).slice(0, 200) : [];
    const deadline = started + 130_000;

    let query = admin.from("articles")
      .select("id,user_id,project_id,status,title,slug,featured_image_url,config")
      .not("featured_image_url", "is", null)
      .neq("featured_image_url", "")
      .order("created_at", { ascending: true })
      .limit(Math.min(200, maxRows * 4));
    if (body.userId) query = query.eq("user_id", body.userId);
    if (ids.length) query = query.in("id", ids);
    const { data: rowsData, error: rowsError } = await query;
    if (rowsError) throw rowsError;
    const rows = (rowsData || []) as unknown as ArticleRow[];

    const pending = rows.filter((row) => !isCompliant(obj(row.config), str(row.featured_image_url)));
    const candidates = pending.slice(0, maxRows);

    if (body.dryRun) {
      return json({ success: true, dry_run: true, pending: pending.length, candidates: candidates.map((row) => ({ id: row.id, status: row.status, featured_image_url: row.featured_image_url })), request_id: requestId });
    }

    const results: Json[] = [];
    for (const row of candidates) {
      if (Date.now() > deadline) break;
      const featured = str(row.featured_image_url);
      const config = obj(row.config);
      const imageGeo = obj(config.image_geo);
      const entry: Json = { id: row.id, status: row.status, previous_url: featured };
      try {
        let masterPath = str(imageGeo.master_path) || masterPathFromUrl(supabaseUrl, featured);
        // A featured URL that already is a derived hero but lacks metadata: rebuild from its master.
        if (masterPath && masterPath.endsWith(HERO_SUFFIX)) {
          const candidate = str(imageGeo.master_path) || str(imageGeo.storage_path);
          masterPath = candidate && !candidate.endsWith(HERO_SUFFIX) ? candidate : masterPath;
        }
        let master: { bytes: Uint8Array; mime: string };
        let contentHash = str(imageGeo.content_hash);
        if (masterPath) {
          master = await downloadMaster(admin, masterPath);
          if (!contentHash) contentHash = await sha256(master.bytes);
        } else {
          const imported = await importExternalMaster(admin, row.user_id, featured);
          masterPath = imported.path; master = { bytes: imported.bytes, mime: imported.mime }; contentHash = imported.hash;
          entry.imported_external = true;
        }

        const storage = admin as unknown as StorageAdmin;
        const hero = await deriveHeroImage(storage, supabaseUrl, BUCKET, masterPath, HERO_16_9);
        let jpeg = null;
        try { jpeg = await deriveJpegCopy(storage, BUCKET, masterPath, master, HERO_16_9); } catch { jpeg = null; }
        const { data: masterUrl } = admin.storage.from(BUCKET).getPublicUrl(masterPath);
        const policy = imagePolicyMetadata(hero, jpeg, masterUrl?.publicUrl || featured);
        const now = new Date().toISOString();
        const nextGeo: Json = {
          ...imageGeo,
          storage_bucket: BUCKET,
          storage_path: hero.path,
          master_path: masterPath,
          content_hash: contentHash,
          previous_featured_image_url: featured,
          image_policy: policy,
          reprocessed_at: now,
          watermark_rendered: false,
        };
        const { error: updateError } = await admin.from("articles")
          .update({ featured_image_url: hero.url, config: { ...config, image_geo: nextGeo }, updated_at: now })
          .eq("id", row.id)
          .eq("featured_image_url", featured); // optimistic: skip if the article changed meanwhile
        if (updateError) throw updateError;
        entry.hero = { url: hero.url, bytes: hero.bytes, quality: hero.quality, within_budget: hero.withinBudget };
        entry.jpeg_copy = jpeg ? { bytes: jpeg.bytes } : null;
        entry.compliance = policy.compliance;

        if (body.pushToWordpress === true && row.status === "published") {
          const publications = obj(config.wordpress_publications);
          const projectIds = new Set<string>(Object.keys(publications).filter((key) => Boolean(obj(publications[key]).post_id)));
          if (row.project_id && !projectIds.size) projectIds.add(String(row.project_id));
          const pushes: Json[] = [];
          for (const projectId of projectIds) {
            if (Date.now() > deadline) { pushes.push({ projectId, skipped: "deadline" }); continue; }
            const result = await republish(supabaseUrl, serviceKey, row.user_id, row.id, projectId);
            pushes.push({ projectId, ...result });
          }
          entry.wordpress = pushes;
        }
        entry.ok = true;
      } catch (error) {
        entry.ok = false;
        entry.error = error instanceof Error ? error.message : "reprocess_failed";
      }
      results.push(entry);
    }

    const succeeded = results.filter((entry) => entry.ok === true).length;
    return json({
      success: true,
      mode,
      processed: results.length,
      succeeded,
      failed: results.length - succeeded,
      remaining_in_scan: Math.max(0, pending.length - succeeded),
      results,
      duration_ms: Date.now() - started,
      request_id: requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error).slice(0, 800);
    return json({ success: false, error: message || "reprocess_failed", request_id: requestId }, 500);
  }
});
