import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildSupporterAvatarPrompt,
  SUPPORTER_AVATAR_PROMPT_VERSION,
  SUPPORTER_AVATAR_QA_PROMPT,
  SUPPORTER_OUTPUT_FORMATS,
  SUPPORTER_PHOTO_AGENT_NAME,
  type SupportOutputFormat,
} from '../_shared/supporter-avatar-prompt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';
const FIXED_DRIVE_FOLDER = '1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function resolveProviderKeys() {
  const readVault = async (provider: 'openai' | 'anthropic') => {
    const { data, error } = await admin.rpc('get_zica_ai_provider_secret', { p_provider: provider });
    if (error) return '';
    return String(data || '').trim();
  };
  const [openai, anthropic] = await Promise.all([readVault('openai'), readVault('anthropic')]);
  return {
    openai,
    anthropic,
    openaiSource: openai ? 'zica-ai-vault' : 'missing',
    anthropicSource: anthropic ? 'zica-ai-vault' : 'missing',
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, attempts = 3) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`provider_http_${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 700 * 2 ** (attempt - 1)));
  }
  throw lastError instanceof Error ? lastError : new Error('provider_request_failed');
}

function bytesToBase64(bytes: Uint8Array) {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))));
  }
  return btoa(chunks.join(''));
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extractJson(text: string) {
  const clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch { /* continue */ }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

function mimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function extensionForMime(mime: string) {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}

async function downloadSources(requestId: string) {
  const { data: sources, error } = await admin
    .from('supporter_avatar_sources')
    .select('id,storage_path,mime_type,file_size_bytes,created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(4);
  if (error) throw error;

  const loaded: Array<any> = [];
  for (const source of sources || []) {
    const { data, error: downloadError } = await admin.storage.from('supporter-avatar-uploads').download(source.storage_path);
    if (downloadError || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    loaded.push({ ...source, bytes, base64: bytesToBase64(bytes) });
  }
  return loaded;
}

async function selectBestSupporterReference(sources: Array<{ mime_type: string; base64: string }>, anthropicApiKey: string) {
  if (!anthropicApiKey || sources.length <= 1) return { index: 0, qa: null };
  const content: unknown[] = [{
    type: 'text',
    text: 'Escolha apenas a melhor foto técnica do APOIADOR para uma composição fotográfica conjunta. Considere nitidez facial, iluminação, ausência de oclusão e proporção. Não identifique a pessoa nem infira atributos sensíveis. Retorne apenas JSON: {"reference_index":0,"technical_source_score":0,"reason":"..."}.',
  }];
  sources.forEach((source, index) => {
    content.push({ type: 'text', text: `FOTO DO APOIADOR ${index}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: source.mime_type, data: source.base64 } });
  });

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 500, messages: [{ role: 'user', content }] }),
  }, 45000, 2);
  if (!response.ok) return { index: 0, qa: { provider_error: response.status } };
  const payload = await response.json();
  const text = Array.isArray(payload.content) ? payload.content.map((item: { text?: string }) => item.text || '').join('\n') : '';
  const parsed = extractJson(text);
  const index = Number(parsed?.reference_index);
  return { index: Number.isInteger(index) && index >= 0 && index < sources.length ? index : 0, qa: parsed };
}

async function loadCandidatePreset(slug: string) {
  const { data, error } = await admin
    .from('supporter_avatar_candidate_presets')
    .select('slug,label,wardrobe,prop,drive_folder_id,drive_file_id,drive_file_name,drive_download_url,prompt_hint,is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data || data.drive_folder_id !== FIXED_DRIVE_FOLDER) throw new Error('candidate_preset_not_found');

  const response = await fetchWithRetry(data.drive_download_url, {
    headers: { 'User-Agent': `${SUPPORTER_PHOTO_AGENT_NAME}/1.0` },
    redirect: 'follow',
  }, 30000, 2);
  if (!response.ok) throw new Error(`candidate_asset_http_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('candidate_asset_size_invalid');
  return { ...data, mime_type: mimeFromName(data.drive_file_name), bytes, base64: bytesToBase64(bytes) };
}

async function generateWithOpenAI(
  supporter: { mime_type: string; bytes: Uint8Array },
  candidate: { mime_type: string; bytes: Uint8Array },
  prompt: string,
  modelSize: string,
  openaiApiKey: string,
) {
  if (!openaiApiKey) throw new Error('openai_not_configured');
  const form = new FormData();
  form.set('model', OPENAI_IMAGE_MODEL);
  form.set('prompt', prompt);
  form.set('size', modelSize);
  form.set('quality', 'high');
  form.append('image[]', new File([supporter.bytes], `01-supporter.${extensionForMime(supporter.mime_type)}`, { type: supporter.mime_type }));
  form.append('image[]', new File([candidate.bytes], `02-candidate.${extensionForMime(candidate.mime_type)}`, { type: candidate.mime_type }));

  const response = await fetchWithRetry('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: form,
  }, 150000, 3);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`openai_image_error:${response.status}:${payload?.error?.message || 'unknown'}`);
  const first = payload?.data?.[0];
  if (first?.b64_json) return { bytes: base64ToBytes(first.b64_json), mimeType: 'image/png', usage: payload?.usage || null };
  if (first?.url) {
    const imageResponse = await fetchWithRetry(first.url, {}, 60000, 2);
    if (!imageResponse.ok) throw new Error(`openai_image_download_error:${imageResponse.status}`);
    return { bytes: new Uint8Array(await imageResponse.arrayBuffer()), mimeType: imageResponse.headers.get('content-type') || 'image/png', usage: payload?.usage || null };
  }
  throw new Error('openai_image_missing_output');
}

async function qaWithClaude(
  supporter: { mime_type: string; base64: string },
  candidateReference: { mime_type: string; base64: string },
  generated: { mimeType: string; bytes: Uint8Array },
  anthropicApiKey: string,
) {
  if (!anthropicApiKey) return null;
  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      system: SUPPORTER_AVATAR_QA_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'REFERÊNCIA 1 — APOIADOR' },
          { type: 'image', source: { type: 'base64', media_type: supporter.mime_type, data: supporter.base64 } },
          { type: 'text', text: 'REFERÊNCIA 2 — MODELO OFICIAL DO CANDIDATO' },
          { type: 'image', source: { type: 'base64', media_type: candidateReference.mime_type, data: candidateReference.base64 } },
          { type: 'text', text: 'COMPOSIÇÃO FINAL' },
          { type: 'image', source: { type: 'base64', media_type: generated.mimeType, data: bytesToBase64(generated.bytes) } },
          { type: 'text', text: 'Avalie a preservação independente das duas pessoas, naturalidade, anatomia, roupa/objeto, zona segura e branding. Retorne somente JSON.' },
        ],
      }],
    }),
  }, 60000, 2);
  if (!response.ok) return { provider_error: response.status };
  const payload = await response.json();
  const text = Array.isArray(payload.content) ? payload.content.map((item: { text?: string }) => item.text || '').join('\n') : '';
  return extractJson(text) || { raw: text.slice(0, 2000) };
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'service_not_configured' }, 503);
  const internal = req.headers.get('x-zica-internal') || '';
  if (!internal || internal !== SERVICE_ROLE) return json({ error: 'unauthorized' }, 401);

  let requestId = '';
  let jobId = '';
  try {
    const body = await req.json();
    requestId = String(body.requestId || '').trim();
    if (!requestId) return json({ error: 'request_id_required' }, 422);

    const { data: avatarRequest, error: requestError } = await admin.from('supporter_avatar_requests').select('*').eq('id', requestId).single();
    if (requestError || !avatarRequest) return json({ error: 'request_not_found' }, 404);
    if (!avatarRequest.consent_image_use || !avatarRequest.consent_terms) return json({ error: 'required_consent_missing' }, 422);
    if (!avatarRequest.candidate_preset_slug) return json({ error: 'candidate_preset_required' }, 422);

    const outputFormat = String(avatarRequest.output_format || 'feed-square') as SupportOutputFormat;
    const format = SUPPORT_OUTPUT_FORMATS[outputFormat] || SUPPORT_OUTPUT_FORMATS['feed-square'];

    const { data: job } = await admin.from('supporter_avatar_jobs').select('id').eq('request_id', requestId).in('status', ['queued','running']).order('created_at', { ascending: false }).limit(1).maybeSingle();
    jobId = job?.id || '';

    const providerKeys = await resolveProviderKeys();
    if (!providerKeys.openai) {
      await admin.from('supporter_avatar_requests').update({ status: 'provider_not_configured', updated_at: new Date().toISOString() }).eq('id', requestId);
      if (jobId) await admin.from('supporter_avatar_jobs').update({ status: 'provider_not_configured', error_message: 'OpenAI não configurada no Vault do Zica.ai', completed_at: new Date().toISOString() }).eq('id', jobId);
      return json({ error: 'openai_not_configured' }, 503);
    }

    await admin.from('supporter_avatar_requests').update({ status: 'processing', supporter_approved_at: null, updated_at: new Date().toISOString() }).eq('id', requestId);
    if (jobId) await admin.from('supporter_avatar_jobs').update({ status: 'running', attempts: 1, started_at: new Date().toISOString() }).eq('id', jobId);

    const [sources, candidatePreset] = await Promise.all([
      downloadSources(requestId),
      loadCandidatePreset(String(avatarRequest.candidate_preset_slug)),
    ]);
    if (!sources.length) throw new Error('no_source_images');

    const selection = await selectBestSupporterReference(sources, providerKeys.anthropic);
    const supporterPrimary = sources[selection.index] || sources[0];

    const { data: dbTemplate } = await admin.from('supporter_avatar_prompt_templates')
      .select('system_prompt,negative_prompt,fidelity_target,version')
      .is('owner_user_id', null)
      .eq('slug', avatarRequest.prompt_template_slug || 'supporter-avatar-human-v1')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const runtimePrompt = buildSupporterAvatarPrompt({
      supporterName: avatarRequest.supporter_name,
      supportText: avatarRequest.support_text,
      style: avatarRequest.style,
      candidatePresetLabel: candidatePreset.label,
      candidatePresetHint: candidatePreset.prompt_hint,
      outputFormat,
      socialHandles: {},
    });
    const prompt = `${dbTemplate?.system_prompt || ''}\n\n${runtimePrompt}\n\nRESTRIÇÕES ADICIONAIS:\n${dbTemplate?.negative_prompt || ''}`.trim();

    const generated = await generateWithOpenAI(supporterPrimary, candidatePreset, prompt, format.modelSize, providerKeys.openai);
    const path = `${requestId}/master-${outputFormat}-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await admin.storage.from('supporter-avatar-generated').upload(path, generated.bytes, {
      contentType: generated.mimeType,
      upsert: false,
      cacheControl: '31536000',
    });
    if (uploadError) throw uploadError;

    const qa = await qaWithClaude(supporterPrimary, candidatePreset, generated, providerKeys.anthropic);
    const qaScore = Number(qa?.supporter_fidelity_score);
    const qaPass = qa ? qa.pass === true : true;
    const [modelWidth, modelHeight] = format.modelSize.split('x').map(Number);

    await admin.from('supporter_avatar_outputs').insert({
      request_id: requestId,
      platform: 'master',
      width: modelWidth,
      height: modelHeight,
      storage_path: path,
      mime_type: generated.mimeType,
      model: OPENAI_IMAGE_MODEL,
      prompt_version: SUPPORTER_AVATAR_PROMPT_VERSION,
      qa_score: Number.isFinite(qaScore) ? qaScore : null,
      qa_payload: {
        ...(qa || {}),
        agent: SUPPORTER_PHOTO_AGENT_NAME,
        source_selection: selection.qa,
        supporter_source_index: selection.index,
        candidate_preset_slug: candidatePreset.slug,
        candidate_reference_file: candidatePreset.drive_file_name,
        candidate_reference_folder: FIXED_DRIVE_FOLDER,
        output_format: outputFormat,
        exact_output: `${format.exactWidth}x${format.exactHeight}`,
        model_master_size: format.modelSize,
        fidelity_target: Number(dbTemplate?.fidelity_target || 0.99),
        fidelity_target_is_not_biometric_guarantee: true,
        openai_key_source: providerKeys.openaiSource,
        anthropic_key_source: providerKeys.anthropicSource,
        openai_usage: generated.usage,
        manual_supporter_approval_required: true,
      },
    });

    const finalStatus = qa && !qaPass ? 'qa' : 'completed';
    const completedAt = finalStatus === 'completed' ? new Date().toISOString() : null;
    await admin.from('supporter_avatar_requests').update({ status: finalStatus, updated_at: new Date().toISOString(), completed_at: completedAt }).eq('id', requestId);

    if (jobId) await admin.from('supporter_avatar_jobs').update({
      status: 'completed',
      model: OPENAI_IMAGE_MODEL,
      output_payload: {
        output_path: path,
        agent: SUPPORTER_PHOTO_AGENT_NAME,
        prompt_version: SUPPORTER_AVATAR_PROMPT_VERSION,
        qa_pass: qaPass,
        qa_score: Number.isFinite(qaScore) ? qaScore : null,
        anthropic_qa_used: Boolean(providerKeys.anthropic),
        candidate_preset_slug: candidatePreset.slug,
        output_format: outputFormat,
        exact_output: `${format.exactWidth}x${format.exactHeight}`,
        provider_sources: { openai: providerKeys.openaiSource, anthropic: providerKeys.anthropicSource },
        manual_supporter_approval_required: true,
      },
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    return json({ ok: true, requestId, status: finalStatus, model: OPENAI_IMAGE_MODEL, agent: SUPPORTER_PHOTO_AGENT_NAME, candidatePreset: candidatePreset.slug, outputFormat, qa });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('generate-supporter-avatar:', requestId, message);
    if (requestId) await admin.from('supporter_avatar_requests').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', requestId);
    if (jobId) await admin.from('supporter_avatar_jobs').update({ status: 'failed', error_message: message.slice(0, 500), completed_at: new Date().toISOString() }).eq('id', jobId);
    return json({ error: 'generation_failed', detail: message.slice(0, 240) }, 500);
  }
});
