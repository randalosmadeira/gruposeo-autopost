import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SUPPORT_STYLES, SUPPORT_TEXTS } from "../_shared/supporter-avatar-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const RATE_LIMIT = Number(Deno.env.get("SUPPORTER_AVATAR_DAILY_LIMIT") || "5");
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const clean = (value: unknown, max = 160) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
function b64url(bytes: Uint8Array) { let raw = ""; for (const byte of bytes) raw += String.fromCharCode(byte); return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function token() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return b64url(bytes); }
async function sha256(value: string) { const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function fullNameOk(value: string) { return value.split(/\s+/).filter((part) => part.length >= 2).length >= 2; }
function emailOk(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value); }
function normalizeWhatsapp(value: unknown) { let d = String(value || "").replace(/\D/g, ""); if (d.startsWith("55") && d.length > 11) d = d.slice(2); if (![10, 11].includes(d.length)) return ""; return `55${d}`; }

function contact(body: Record<string, unknown>) {
  const supporterName = clean(body.supporterName, 100);
  const email = clean(body.email, 180).toLowerCase();
  const whatsapp = normalizeWhatsapp(body.whatsapp);
  const city = clean(body.city, 100);
  const state = clean(body.state || "SP", 2).toUpperCase();
  if (!fullNameOk(supporterName)) return { error: "supporter_full_name_required" } as const;
  if (!emailOk(email)) return { error: "supporter_email_invalid" } as const;
  if (!whatsapp) return { error: "supporter_whatsapp_invalid" } as const;
  return { supporterName, email, whatsapp, city, state } as const;
}

function fingerprint(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${ip}|${req.headers.get("user-agent") || "unknown"}|${SUPABASE_URL}`;
}

async function captcha(value: string, req: Request) {
  if (!TURNSTILE_SECRET) return true;
  if (!value) return false;
  const form = new FormData();
  form.set("secret", TURNSTILE_SECRET);
  form.set("response", value);
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
  if (ip) form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  return data.success === true;
}

async function authenticate(requestId: string, publicToken: string) {
  if (!requestId || !publicToken) return null;
  const hash = await sha256(publicToken);
  const { data } = await admin.from("supporter_avatar_requests").select("*").eq("id", requestId).eq("public_token_hash", hash).maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) < Date.now()) return null;
  return data;
}

async function markDispatchState(requestId: string, jobId: string, status: "retry" | "needs_review", message: string) {
  await Promise.all([
    admin.from("supporter_avatar_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", requestId),
    admin.from("supporter_avatar_jobs").update({ status, error_message: message.slice(0, 500) }).eq("id", jobId),
  ]);
}

function dispatch(requestId: string, jobId: string, dispatchToken: string) {
  const task = (async () => {
    let last = "dispatch_transport_unknown";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) {
        await markDispatchState(requestId, jobId, "retry", `dispatch_retry_${attempt}`);
        await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** (attempt - 2)));
      }
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-supporter-avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, jobId, dispatchToken, dispatchAttempt: attempt }),
        });
        if (response.ok) return;
        const text = await response.text().catch(() => "");
        last = `dispatch_http_${response.status}:${text.slice(0, 180)}`;
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        last = `dispatch_network:${error instanceof Error ? error.message : "unknown"}`;
      }
    }
    await markDispatchState(requestId, jobId, "needs_review", last);
  })();

  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "service_not_configured" }, 503);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 40);

    if (action === "capabilities") {
      return json({
        ok: true,
        pipeline: "auto-selector-v2",
        candidateSelection: "private-automatic",
        publicCandidateGallery: false,
        socialOutputs: ["1080x1080", "1080x1350", "1200x630"],
        abuseProtection: { turnstileConfigured: Boolean(TURNSTILE_SECRET) },
      });
    }

    if (action === "create") {
      if (!(await captcha(clean(body.turnstileToken, 2048), req))) return json({ error: "captcha_invalid" }, 403);
      const c = contact(body);
      if ("error" in c) return json({ error: c.error }, 422);
      if (body.consentImageUse !== true || body.consentTerms !== true) return json({ error: "required_consents_missing" }, 422);

      const fp = await sha256(fingerprint(req));
      const { count } = await admin.from("supporter_avatar_requests").select("id", { count: "exact", head: true }).eq("fingerprint_hash", fp).gte("created_at", new Date(Date.now() - 86400000).toISOString());
      if ((count || 0) >= RATE_LIMIT) return json({ error: "daily_limit_reached" }, 429);

      const publicToken = token();
      const style = SUPPORT_STYLES.includes(body.style as never) ? String(body.style) : "premium";
      const supportText = SUPPORT_TEXTS.includes(body.supportText as never) ? String(body.supportText) : "EU APOIO DR. MADEIRA 1470";
      const { data, error } = await admin.from("supporter_avatar_requests").insert({
        public_token_hash: await sha256(publicToken),
        fingerprint_hash: fp,
        supporter_name: c.supporterName,
        email: c.email,
        whatsapp: c.whatsapp,
        city: c.city || null,
        state: c.state || "SP",
        social_handles: {},
        style,
        support_text: supportText,
        candidate_preset_slug: null,
        output_format: "feed-square",
        provider_preference: "openai",
        consent_image_use: true,
        consent_terms: true,
        consent_social_linking: false,
        consent_public_gallery: body.consentPublicGallery === true,
        consent_at: new Date().toISOString(),
        status: "needs_input",
        pipeline_version: "auto-selector-v2",
        internal_selection: {},
      }).select("id,status,expires_at,max_generations").single();
      if (error) throw error;

      return json({
        ok: true,
        requestId: data.id,
        token: publicToken,
        status: data.status,
        expiresAt: data.expires_at,
        maxSourceImages: 3,
        maxGenerations: data.max_generations,
        candidateSelection: "automatic",
        socialOutputs: ["1080x1080", "1080x1350", "1200x630"],
      }, 201);
    }

    const requestId = clean(body.requestId, 80);
    const publicToken = clean(body.token, 256);
    const request = await authenticate(requestId, publicToken);
    if (!request) return json({ error: "request_not_found_or_expired" }, 404);

    if (action === "update-contact") {
      const c = contact(body);
      if ("error" in c) return json({ error: c.error }, 422);
      const { error } = await admin.from("supporter_avatar_requests").update({
        supporter_name: c.supporterName,
        email: c.email,
        whatsapp: c.whatsapp,
        city: c.city || null,
        state: c.state || "SP",
        updated_at: new Date().toISOString(),
      }).eq("id", requestId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "upload-url") {
      const mimeType = clean(body.mimeType, 80).toLowerCase();
      const fileSize = Number(body.fileSize || 0);
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return json({ error: "unsupported_image_type" }, 422);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) return json({ error: "invalid_file_size" }, 422);
      const { count } = await admin.from("supporter_avatar_sources").select("id", { count: "exact", head: true }).eq("request_id", requestId);
      if ((count || 0) >= 3) return json({ error: "source_limit_reached" }, 422);
      const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await admin.storage.from("supporter-avatar-uploads").createSignedUploadUrl(path);
      if (error || !data) throw error || new Error("signed_upload_failed");
      return json({ ok: true, path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === "register-upload") {
      const path = clean(body.path, 300);
      const mimeType = clean(body.mimeType, 80).toLowerCase();
      const fileSize = Number(body.fileSize || 0);
      if (!path.startsWith(`${requestId}/`)) return json({ error: "invalid_storage_path" }, 422);
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return json({ error: "unsupported_image_type" }, 422);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) return json({ error: "invalid_file_size" }, 422);
      const name = path.split("/").pop() || "";
      const { data: objects } = await admin.storage.from("supporter-avatar-uploads").list(requestId, { search: name, limit: 2 });
      if (!objects?.some((item) => item.name === name)) return json({ error: "uploaded_object_not_found" }, 422);
      const { error } = await admin.from("supporter_avatar_sources").insert({ request_id: requestId, storage_path: path, mime_type: mimeType, file_size_bytes: fileSize });
      if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
      const { count } = await admin.from("supporter_avatar_sources").select("id", { count: "exact", head: true }).eq("request_id", requestId);
      await admin.from("supporter_avatar_requests").update({ source_count: count || 0, status: (count || 0) > 0 ? "uploaded" : "needs_input", updated_at: new Date().toISOString() }).eq("id", requestId);
      return json({ ok: true, sourceCount: count || 0, status: (count || 0) > 0 ? "uploaded" : "needs_input" });
    }

    if (action === "submit" || action === "regenerate") {
      const stored = contact({ supporterName: request.supporter_name, email: request.email, whatsapp: request.whatsapp, city: request.city, state: request.state });
      if ("error" in stored) return json({ error: stored.error }, 422);
      if (!request.consent_image_use || !request.consent_terms) return json({ error: "required_consents_missing" }, 422);
      if ((request.source_count || 0) < 1) return json({ error: "upload_at_least_one_photo" }, 422);
      if ((request.generation_count || 0) >= (request.max_generations || 3)) return json({ error: "generation_limit_reached" }, 429);

      const { data: active } = await admin.from("supporter_avatar_jobs").select("id,status").eq("request_id", requestId).in("status", ["queued", "running", "retry", "regenerate"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (active) return json({ ok: true, status: request.status, alreadyQueued: true });

      const { data: queued, error } = await admin.rpc("enqueue_supporter_avatar_generation", { p_request_id: requestId, p_reason: action });
      if (error) {
        const message = String(error.message || "");
        if (message.includes("generation_limit_reached")) return json({ error: "generation_limit_reached" }, 429);
        if (message.includes("upload_at_least_one_photo")) return json({ error: "upload_at_least_one_photo" }, 422);
        if (message.includes("active_generation_exists")) return json({ ok: true, status: request.status, alreadyQueued: true });
        throw error;
      }
      const jobId = clean(queued?.job_id, 80);
      const dispatchToken = clean(queued?.dispatch_token, 256);
      if (!jobId || !dispatchToken) throw new Error("enqueue_dispatch_credentials_missing");
      dispatch(requestId, jobId, dispatchToken);
      return json({ ok: true, status: "analyzing" }, 202);
    }

    if (action === "status") {
      const { data: latest } = await admin.from("supporter_avatar_requests")
        .select("status,supporter_name,city,state,source_count,generation_count,max_generations,updated_at,completed_at")
        .eq("id", requestId).single();
      const { data: job } = await admin.from("supporter_avatar_jobs")
        .select("stage,status")
        .eq("request_id", requestId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: outputs } = await admin.from("supporter_avatar_outputs")
        .select("platform,width,height,storage_path,qa_score")
        .eq("request_id", requestId).in("platform", ["square", "portrait", "landscape"]).order("created_at", { ascending: false });

      const signed: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      for (const output of outputs || []) {
        if (seen.has(output.platform)) continue;
        seen.add(output.platform);
        const { data } = await admin.storage.from("supporter-avatar-generated").createSignedUrl(output.storage_path, 3600);
        if (data?.signedUrl) signed.push({ platform: output.platform, width: output.width, height: output.height, qa_score: output.qa_score, url: data.signedUrl });
      }

      return json({
        ok: true,
        request: latest,
        job: job ? { stage: job.stage, status: job.status } : null,
        outputs: signed,
        candidateSelection: "automatic-private",
      });
    }

    if (action === "delete") {
      const { data: sources } = await admin.from("supporter_avatar_sources").select("storage_path").eq("request_id", requestId);
      const { data: outputs } = await admin.from("supporter_avatar_outputs").select("storage_path").eq("request_id", requestId);
      const sourcePaths = (sources || []).map((item) => item.storage_path);
      const outputPaths = (outputs || []).map((item) => item.storage_path);
      if (sourcePaths.length) await admin.storage.from("supporter-avatar-uploads").remove(sourcePaths);
      if (outputPaths.length) await admin.storage.from("supporter-avatar-generated").remove(outputPaths);
      await admin.from("supporter_avatar_requests").delete().eq("id", requestId);
      return json({ ok: true, deleted: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("supporter-avatar-public-v2:", error);
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
