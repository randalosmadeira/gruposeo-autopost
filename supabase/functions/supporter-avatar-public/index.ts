import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPPORT_STYLES, SUPPORT_TEXTS } from '../_shared/supporter-avatar-prompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_RATE_LIMIT = Number(Deno.env.get('SUPPORTER_AVATAR_DAILY_LIMIT') || '5');
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeText(value: unknown, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clientFingerprint(req: Request) {
  const ip = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const agent = req.headers.get('user-agent') || 'unknown';
  return `${ip}|${agent}|${SUPABASE_URL}`;
}

async function validateTurnstile(token: string, req: Request) {
  if (!TURNSTILE_SECRET) return { ok: true, mode: 'rate-limit-only' };
  if (!token) return { ok: false, error: 'captcha_required' };
  const remoteip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '';
  const form = new FormData();
  form.set('secret', TURNSTILE_SECRET);
  form.set('response', token);
  if (remoteip) form.set('remoteip', remoteip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  return payload.success ? { ok: true, mode: 'turnstile' } : { ok: false, error: 'captcha_invalid' };
}

async function providerStatus() {
  const { data } = await admin.rpc('zica_ai_provider_secret_status');
  return {
    openai: Boolean(data?.openai),
    anthropic: Boolean(data?.anthropic),
  };
}

async function authenticateRequest(requestId: string, token: string) {
  if (!requestId || !token) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await admin
    .from('supporter_avatar_requests')
    .select('*')
    .eq('id', requestId)
    .eq('public_token_hash', tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin.from('supporter_avatar_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', requestId);
    return null;
  }
  return data;
}

async function dispatchGeneration(requestId: string) {
  const responsePromise = fetch(`${SUPABASE_URL}/functions/v1/generate-supporter-avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      'x-zica-internal': SERVICE_ROLE,
    },
    body: JSON.stringify({ requestId }),
  }).then(async (response) => {
    if (response.ok) return;
    const message = await response.text().catch(() => `HTTP ${response.status}`);
    console.error('supporter-avatar-dispatch:', requestId, response.status, message.slice(0, 500));
  }).catch((error) => console.error('supporter-avatar-dispatch:', requestId, error instanceof Error ? error.message : 'network_error'));

  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(responsePromise);
  else await responsePromise;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'service_not_configured' }, 503);

  try {
    const body = await req.json();
    const action = normalizeText(body.action, 40);

    if (action === 'capabilities') {
      const providers = await providerStatus();
      return json({
        ok: true,
        service: 'supporter-avatar-public',
        deliveryMode: 'single-final-download',
        socialPublishing: false,
        imageProvider: { provider: 'openai', configured: providers.openai, model: OPENAI_IMAGE_MODEL, source: providers.openai ? 'zica-ai-vault' : 'missing' },
        qaProvider: { provider: 'anthropic', configured: providers.anthropic, optional: true },
        abuseProtection: { turnstileConfigured: Boolean(TURNSTILE_SECRET), dailyLimit: PUBLIC_RATE_LIMIT },
        storage: { sourcePrivate: true, outputPrivate: true },
      });
    }

    if (action === 'create') {
      const captcha = await validateTurnstile(normalizeText(body.turnstileToken, 2048), req);
      if (!captcha.ok) return json({ error: captcha.error }, 403);

      const supporterName = normalizeText(body.supporterName, 100);
      const city = normalizeText(body.city, 100);
      const state = normalizeText(body.state || 'SP', 2).toUpperCase();
      const email = normalizeText(body.email, 180).toLowerCase();
      const whatsapp = normalizeText(body.whatsapp, 40);
      const supportText = SUPPORT_TEXTS.includes(body.supportText) ? body.supportText : SUPPORT_TEXTS[0];
      const style = SUPPORT_STYLES.includes(body.style) ? body.style : 'premium';
      const consentImageUse = body.consentImageUse === true;
      const consentTerms = body.consentTerms === true;
      const consentPublicGallery = body.consentPublicGallery === true;

      if (supporterName.length < 2) return json({ error: 'supporter_name_required' }, 422);
      if (!consentImageUse || !consentTerms) return json({ error: 'required_consents_missing' }, 422);

      const fingerprintHash = await sha256(clientFingerprint(req));
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('supporter_avatar_requests')
        .select('id', { count: 'exact', head: true })
        .eq('fingerprint_hash', fingerprintHash)
        .gte('created_at', since);
      if ((count || 0) >= PUBLIC_RATE_LIMIT) return json({ error: 'daily_limit_reached' }, 429);

      const token = randomToken();
      const publicTokenHash = await sha256(token);
      const { data, error } = await admin.from('supporter_avatar_requests').insert({
        public_token_hash: publicTokenHash,
        fingerprint_hash: fingerprintHash,
        supporter_name: supporterName,
        city: city || null,
        state: state || 'SP',
        email: email || null,
        whatsapp: whatsapp || null,
        social_handles: {},
        style,
        support_text: supportText,
        provider_preference: 'openai',
        consent_image_use: consentImageUse,
        consent_social_linking: false,
        consent_terms: consentTerms,
        consent_public_gallery: consentPublicGallery,
        consent_at: new Date().toISOString(),
        status: 'uploading',
      }).select('id,status,expires_at,max_generations').single();
      if (error) throw error;

      return json({ ok: true, requestId: data.id, token, status: data.status, expiresAt: data.expires_at, maxSourceImages: 4, maxGenerations: data.max_generations, captchaMode: captcha.mode }, 201);
    }

    const requestId = normalizeText(body.requestId, 80);
    const token = normalizeText(body.token, 256);
    const avatarRequest = await authenticateRequest(requestId, token);
    if (!avatarRequest) return json({ error: 'request_not_found_or_expired' }, 404);

    if (action === 'upload-url') {
      const mimeType = normalizeText(body.mimeType, 80).toLowerCase();
      const fileSize = Number(body.fileSize || 0);
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(mimeType)) return json({ error: 'unsupported_image_type' }, 422);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 10 * 1024 * 1024) return json({ error: 'invalid_file_size' }, 422);

      const { count } = await admin.from('supporter_avatar_sources').select('id', { count: 'exact', head: true }).eq('request_id', requestId);
      if ((count || 0) >= 4) return json({ error: 'source_limit_reached' }, 422);

      const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await admin.storage.from('supporter-avatar-uploads').createSignedUploadUrl(path);
      if (error || !data) throw error || new Error('signed_upload_failed');
      return json({ ok: true, path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === 'register-upload') {
      const path = normalizeText(body.path, 300);
      const mimeType = normalizeText(body.mimeType, 80).toLowerCase();
      const fileSize = Number(body.fileSize || 0);
      if (!path.startsWith(`${requestId}/`)) return json({ error: 'invalid_storage_path' }, 422);

      const filename = path.split('/').pop() || '';
      const { data: objects } = await admin.storage.from('supporter-avatar-uploads').list(requestId, { search: filename, limit: 2 });
      if (!objects?.some((object) => object.name === filename)) return json({ error: 'uploaded_object_not_found' }, 422);

      const { error } = await admin.from('supporter_avatar_sources').insert({ request_id: requestId, storage_path: path, mime_type: mimeType, file_size_bytes: Number.isFinite(fileSize) ? fileSize : null });
      if (error && !String(error.message || '').includes('duplicate')) throw error;

      const { count } = await admin.from('supporter_avatar_sources').select('id', { count: 'exact', head: true }).eq('request_id', requestId);
      await admin.from('supporter_avatar_requests').update({ source_count: count || 0, updated_at: new Date().toISOString() }).eq('id', requestId);
      return json({ ok: true, sourceCount: count || 0 });
    }

    if (action === 'submit' || action === 'regenerate') {
      if (!avatarRequest.consent_image_use || !avatarRequest.consent_terms) return json({ error: 'consent_revoked_or_missing' }, 422);
      if ((avatarRequest.source_count || 0) < 1) return json({ error: 'upload_at_least_one_photo' }, 422);
      if ((avatarRequest.generation_count || 0) >= (avatarRequest.max_generations || 3)) return json({ error: 'generation_limit_reached' }, 429);

      const { data: activeJob } = await admin.from('supporter_avatar_jobs').select('id,status').eq('request_id', requestId).in('status', ['queued','running']).maybeSingle();
      if (activeJob) return json({ ok: true, status: avatarRequest.status, alreadyQueued: true });

      await admin.from('supporter_avatar_requests').update({ status: 'queued', generation_count: (avatarRequest.generation_count || 0) + 1, updated_at: new Date().toISOString() }).eq('id', requestId);
      const { data: job, error } = await admin.from('supporter_avatar_jobs').insert({
        request_id: requestId,
        stage: 'generate-final',
        provider: 'openai',
        model: OPENAI_IMAGE_MODEL,
        status: 'queued',
        input_payload: { style: avatarRequest.style, support_text: avatarRequest.support_text, delivery_mode: 'single-final-download' },
      }).select('id').single();
      if (error) throw error;

      await dispatchGeneration(requestId);
      return json({ ok: true, status: 'queued', jobId: job.id }, 202);
    }

    if (action === 'status') {
      const { data: latestRequest } = await admin.from('supporter_avatar_requests').select('id,status,source_count,generation_count,max_generations,updated_at,completed_at').eq('id', requestId).single();
      const { data: job } = await admin.from('supporter_avatar_jobs').select('id,stage,provider,model,status,error_message,created_at,started_at,completed_at').eq('request_id', requestId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const { data: outputs } = await admin.from('supporter_avatar_outputs').select('id,platform,width,height,storage_path,mime_type,model,prompt_version,qa_score,created_at').eq('request_id', requestId).order('created_at', { ascending: false });

      const signedOutputs = [];
      const seen = new Set<string>();
      for (const output of outputs || []) {
        if (seen.has(output.platform)) continue;
        seen.add(output.platform);
        const { data } = await admin.storage.from('supporter-avatar-generated').createSignedUrl(output.storage_path, 3600);
        if (data?.signedUrl) signedOutputs.push({ ...output, url: data.signedUrl });
      }
      return json({ ok: true, request: latestRequest, job, outputs: signedOutputs, deliveryMode: 'single-final-download' });
    }

    if (action === 'delete') {
      const { data: sources } = await admin.from('supporter_avatar_sources').select('storage_path').eq('request_id', requestId);
      const { data: outputs } = await admin.from('supporter_avatar_outputs').select('storage_path').eq('request_id', requestId);
      const sourcePaths = (sources || []).map((item) => item.storage_path);
      const outputPaths = (outputs || []).map((item) => item.storage_path);
      if (sourcePaths.length) await admin.storage.from('supporter-avatar-uploads').remove(sourcePaths);
      if (outputPaths.length) await admin.storage.from('supporter-avatar-generated').remove(outputPaths);
      await admin.from('supporter_avatar_requests').delete().eq('id', requestId);
      return json({ ok: true, deleted: true });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('supporter-avatar-public:', error);
    return json({ error: error instanceof Error ? error.message : 'unknown_error' }, 500);
  }
});
