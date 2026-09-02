import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SUPPORT_STYLES, SUPPORT_TEXTS, SUPPORT_OUTPUT_FORMATS, SUPPORTER_PHOTO_AGENT_NAME, type SupportOutputFormat } from "../_shared/supporter-avatar-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const RATE_LIMIT = Number(Deno.env.get("SUPPORTER_AVATAR_DAILY_LIMIT") || "5");
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
const IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-2";
const FIXED_DRIVE_FOLDER = "1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
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
  if (!fullNameOk(supporterName)) return { error: "supporter_full_name_required" };
  if (!emailOk(email)) return { error: "supporter_email_invalid" };
  if (!whatsapp) return { error: "supporter_whatsapp_invalid" };
  return { supporterName, email, whatsapp, city, state };
}
function fingerprint(req: Request) { const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"; return `${ip}|${req.headers.get("user-agent") || "unknown"}|${SUPABASE_URL}`; }

async function captcha(value: string, req: Request) {
  if (!TURNSTILE_SECRET) return true;
  if (!value) return false;
  const form = new FormData(); form.set("secret", TURNSTILE_SECRET); form.set("response", value);
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || ""; if (ip) form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = await response.json().catch(() => ({})); return data.success === true;
}

async function authenticate(requestId: string, publicToken: string) {
  if (!requestId || !publicToken) return null;
  const hash = await sha256(publicToken);
  const { data } = await admin.from("supporter_avatar_requests").select("*").eq("id", requestId).eq("public_token_hash", hash).maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) < Date.now()) { await admin.from("supporter_avatar_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", requestId); return null; }
  return data;
}

async function preset(slug: string) {
  const { data } = await admin.from("supporter_avatar_candidate_presets").select("slug,label,wardrobe,prop,drive_folder_id,is_active").eq("slug", slug).eq("is_active", true).maybeSingle();
  return data?.drive_folder_id === FIXED_DRIVE_FOLDER ? data : null;
}

async function dispatch(requestId: string, jobId: string) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-supporter-avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zica-internal": SERVICE_ROLE },
      body: JSON.stringify({ requestId }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return true;
    const text = await response.text().catch(() => "");
    const message = `dispatch_http_${response.status}:${text.slice(0, 180)}`;
    await Promise.all([
      admin.from("supporter_avatar_requests").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", requestId),
      admin.from("supporter_avatar_jobs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", jobId),
    ]);
    return false;
  } catch (error) {
    const message = `dispatch_network:${error instanceof Error ? error.message : "unknown"}`;
    await Promise.all([
      admin.from("supporter_avatar_requests").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", requestId),
      admin.from("supporter_avatar_jobs").update({ status: "failed", error_message: message.slice(0, 500), completed_at: new Date().toISOString() }).eq("id", jobId),
    ]);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "service_not_configured" }, 503);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = clean(body.action, 40);

    if (action === "create") {
      if (!(await captcha(clean(body.turnstileToken, 2048), req))) return json({ error: "captcha_invalid" }, 403);
      const c = contact(body); if ("error" in c) return json({ error: c.error }, 422);
      const candidatePresetSlug = clean(body.candidatePresetSlug, 80);
      const outputFormat = clean(body.outputFormat || "feed-square", 60) as SupportOutputFormat;
      if (!(outputFormat in SUPPORT_OUTPUT_FORMATS)) return json({ error: "invalid_output_format" }, 422);
      const p = await preset(candidatePresetSlug); if (!p) return json({ error: "candidate_preset_required_or_invalid" }, 422);
      if (body.consentImageUse !== true || body.consentTerms !== true) return json({ error: "required_consents_missing" }, 422);
      const fp = await sha256(fingerprint(req));
      const { count } = await admin.from("supporter_avatar_requests").select("id", { count: "exact", head: true }).eq("fingerprint_hash", fp).gte("created_at", new Date(Date.now() - 86400000).toISOString());
      if ((count || 0) >= RATE_LIMIT) return json({ error: "daily_limit_reached" }, 429);
      const publicToken = token();
      const { data, error } = await admin.from("supporter_avatar_requests").insert({
        public_token_hash: await sha256(publicToken), fingerprint_hash: fp, supporter_name: c.supporterName, email: c.email, whatsapp: c.whatsapp,
        city: c.city || null, state: c.state || "SP", social_handles: {}, style: SUPPORT_STYLES.includes(body.style as never) ? body.style : "premium",
        support_text: SUPPORT_TEXTS.includes(body.supportText as never) ? body.supportText : SUPPORT_TEXTS[0], candidate_preset_slug: p.slug,
        output_format: outputFormat, provider_preference: "openai", consent_image_use: true, consent_terms: true, consent_social_linking: false,
        consent_public_gallery: body.consentPublicGallery === true, consent_at: new Date().toISOString(), status: "uploading",
      }).select("id,status,expires_at,max_generations,candidate_preset_slug,output_format").single();
      if (error) throw error;
      return json({ ok: true, requestId: data.id, token: publicToken, status: data.status, expiresAt: data.expires_at, maxSourceImages: 4, maxGenerations: data.max_generations, candidatePreset: p, outputFormat: data.output_format }, 201);
    }

    const requestId = clean(body.requestId, 80); const publicToken = clean(body.token, 256);
    const request = await authenticate(requestId, publicToken); if (!request) return json({ error: "request_not_found_or_expired" }, 404);

    if (action === "update-contact") {
      const c = contact(body); if ("error" in c) return json({ error: c.error }, 422);
      const { error } = await admin.from("supporter_avatar_requests").update({ supporter_name: c.supporterName, email: c.email, whatsapp: c.whatsapp, city: c.city || null, state: c.state || "SP", updated_at: new Date().toISOString() }).eq("id", requestId);
      if (error) throw error; return json({ ok: true });
    }

    if (action === "upload-url") {
      const mimeType = clean(body.mimeType, 80).toLowerCase(); const fileSize = Number(body.fileSize || 0);
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return json({ error: "unsupported_image_type" }, 422);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) return json({ error: "invalid_file_size" }, 422);
      const { count } = await admin.from("supporter_avatar_sources").select("id", { count: "exact", head: true }).eq("request_id", requestId);
      if ((count || 0) >= 4) return json({ error: "source_limit_reached" }, 422);
      const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"; const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await admin.storage.from("supporter-avatar-uploads").createSignedUploadUrl(path); if (error || !data) throw error || new Error("signed_upload_failed");
      return json({ ok: true, path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === "register-upload") {
      const path = clean(body.path, 300); const mimeType = clean(body.mimeType, 80).toLowerCase(); const fileSize = Number(body.fileSize || 0);
      if (!path.startsWith(`${requestId}/`)) return json({ error: "invalid_storage_path" }, 422);
      const name = path.split("/").pop() || ""; const { data: objects } = await admin.storage.from("supporter-avatar-uploads").list(requestId, { search: name, limit: 2 });
      if (!objects?.some((item) => item.name === name)) return json({ error: "uploaded_object_not_found" }, 422);
      const { error } = await admin.from("supporter_avatar_sources").insert({ request_id: requestId, storage_path: path, mime_type: mimeType, file_size_bytes: fileSize });
      if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
      const { count } = await admin.from("supporter_avatar_sources").select("id", { count: "exact", head: true }).eq("request_id", requestId);
      await admin.from("supporter_avatar_requests").update({ source_count: count || 0, updated_at: new Date().toISOString() }).eq("id", requestId);
      return json({ ok: true, sourceCount: count || 0 });
    }

    if (action === "submit" || action === "regenerate") {
      const stored = contact({ supporterName: request.supporter_name, email: request.email, whatsapp: request.whatsapp, city: request.city, state: request.state });
      if ("error" in stored) return json({ error: stored.error }, 422);
      if (!request.consent_image_use || !request.consent_terms) return json({ error: "required_consents_missing" }, 422);
      if ((request.source_count || 0) < 1) return json({ error: "upload_at_least_one_photo" }, 422);
      if ((request.generation_count || 0) >= (request.max_generations || 3)) return json({ error: "generation_limit_reached" }, 429);
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await admin.from("supporter_avatar_jobs").update({ status: "failed", error_message: "stale_dispatch_recovered", completed_at: new Date().toISOString() }).eq("request_id", requestId).eq("status", "queued").eq("attempts", 0).lt("created_at", staleBefore);
      const { data: active } = await admin.from("supporter_avatar_jobs").select("id,status").eq("request_id", requestId).in("status", ["queued", "running"]).maybeSingle();
      if (active) return json({ ok: true, status: request.status, alreadyQueued: true });
      await admin.from("supporter_avatar_requests").update({ status: "queued", generation_count: (request.generation_count || 0) + 1, supporter_approved_at: null, updated_at: new Date().toISOString() }).eq("id", requestId);
      const { data: job, error } = await admin.from("supporter_avatar_jobs").insert({ request_id: requestId, stage: "generate-final", provider: "openai", model: IMAGE_MODEL, status: "queued", input_payload: { agent: SUPPORTER_PHOTO_AGENT_NAME, style: request.style, support_text: request.support_text, candidate_preset_slug: request.candidate_preset_slug, output_format: request.output_format } }).select("id").single();
      if (error) throw error;
      const started = await dispatch(requestId, job.id); if (!started) return json({ error: "generation_dispatch_failed" }, 502);
      return json({ ok: true, status: "queued", jobId: job.id }, 202);
    }

    if (action === "status") {
      const { data: latest } = await admin.from("supporter_avatar_requests").select("id,status,supporter_name,email,whatsapp,city,state,source_count,generation_count,max_generations,candidate_preset_slug,output_format,updated_at,completed_at").eq("id", requestId).single();
      const { data: p } = latest?.candidate_preset_slug ? await admin.from("supporter_avatar_candidate_presets").select("slug,label,wardrobe,prop").eq("slug", latest.candidate_preset_slug).maybeSingle() : { data: null };
      const { data: job } = await admin.from("supporter_avatar_jobs").select("id,stage,provider,model,status,error_message,created_at,started_at,completed_at").eq("request_id", requestId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: outputs } = await admin.from("supporter_avatar_outputs").select("id,platform,storage_path,qa_score").eq("request_id", requestId).order("created_at", { ascending: false });
      const signed = []; const seen = new Set<string>(); for (const output of outputs || []) { if (seen.has(output.platform)) continue; seen.add(output.platform); const { data } = await admin.storage.from("supporter-avatar-generated").createSignedUrl(output.storage_path, 3600); if (data?.signedUrl) signed.push({ ...output, url: data.signedUrl }); }
      const spec = latest?.output_format && latest.output_format in SUPPORT_OUTPUT_FORMATS ? SUPPORT_OUTPUT_FORMATS[latest.output_format as SupportOutputFormat] : SUPPORT_OUTPUT_FORMATS["feed-square"];
      return json({ ok: true, request: latest, candidatePreset: p, outputSpec: spec, job, outputs: signed });
    }

    if (action === "delete") {
      const { data: sources } = await admin.from("supporter_avatar_sources").select("storage_path").eq("request_id", requestId); const { data: outputs } = await admin.from("supporter_avatar_outputs").select("storage_path").eq("request_id", requestId);
      const a = (sources || []).map((item) => item.storage_path); const b = (outputs || []).map((item) => item.storage_path); if (a.length) await admin.storage.from("supporter-avatar-uploads").remove(a); if (b.length) await admin.storage.from("supporter-avatar-generated").remove(b); await admin.from("supporter_avatar_requests").delete().eq("id", requestId); return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("supporter-avatar-public-v2:", error);
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
