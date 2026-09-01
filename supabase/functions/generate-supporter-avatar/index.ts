import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildSupporterAvatarPrompt,
  SUPPORTER_AVATAR_PROMPT_VERSION,
  SUPPORTER_AVATAR_QA_PROMPT,
} from '../_shared/supporter-avatar-prompt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ENV_OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2';
const ENV_ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';

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
  const [vaultOpenAI, vaultAnthropic] = await Promise.all([
    ENV_OPENAI_API_KEY ? Promise.resolve('') : readVault('openai'),
    ENV_ANTHROPIC_API_KEY ? Promise.resolve('') : readVault('anthropic'),
  ]);
  return {
    openai: ENV_OPENAI_API_KEY || vaultOpenAI,
    anthropic: ENV_ANTHROPIC_API_KEY || vaultAnthropic,
    openaiSource: ENV_OPENAI_API_KEY ? 'edge-secret' : vaultOpenAI ? 'zica-ai-vault' : 'missing',
    anthropicSource: ENV_ANTHROPIC_API_KEY ? 'edge-secret' : vaultAnthropic ? 'zica-ai-vault' : 'missing',
  };
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

async function downloadSources(requestId: string) {
  const { data: sources, error } = await admin
    .from('supporter_avatar_sources')
    .select('id,storage_path,mime_type,file_size_bytes,created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(4);
  if (error) throw error;

  const loaded = [];
  for (const source of sources || []) {
    const { data, error: downloadError } = await admin.storage.from('supporter-avatar-uploads').download(source.storage_path);
    if (downloadError || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    loaded.push({ ...source, bytes, base64: bytesToBase64(bytes) });
  }
  return loaded;
}

async function selectBestReference(sources: Array<{ mime_type: string; base64: string }>, anthropicApiKey: string) {
  if (!anthropicApiKey || sources.length <= 1) return { index: 0, qa: null };

  const content: unknown[] = [{
    type: 'text',
    text: 'Escolha somente a melhor fotografia técnica para servir como referência principal de edição facial. Considere nitidez do rosto, iluminação, ausência de oclusão e proporção facial. As imagens estão numeradas na ordem enviada. Não identifique a pessoa e não infira atributos sensíveis. Retorne apenas JSON: {"reference_index":0,"technical_source_score":0,"reason":"..."}.',
  }];
  sources.forEach((source, index) => {
    content.push({ type: 'text', text: `REFERÊNCIA ${index}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: source.mime_type, data: source.base64 } });
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!response.ok) return { index: 0, qa: { provider_error: response.status } };
  const payload = await response.json();
  const text = Array.isArray(payload.content) ? payload.content.map((item: { text?: string }) => item.text || '').join('\n') : '';
  const parsed = extractJson(text);
  const index = Number(parsed?.reference_index);
  return {
    index: Number.isInteger(index) && index >= 0 && index < sources.length ? index : 0,
    qa: parsed,
  };
}

async function generateWithOpenAI(source: { mime_type: string; bytes: Uint8Array }, prompt: string, openaiApiKey: string) {
  if (!openaiApiKey) throw new Error('openai_not_configured');
  const form = new FormData();
  form.set('model', OPENAI_IMAGE_MODEL);
  form.set('prompt', prompt);
  form.set('size', '1024x1024');
  form.set('quality', 'high');
  const extension = source.mime_type === 'image/png' ? 'png' : source.mime_type === 'image/webp' ? 'webp' : 'jpg';
  form.set('image', new File([source.bytes], `reference.${extension}`, { type: source.mime_type }));

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`openai_image_error:${response.status}:${payload?.error?.message || 'unknown'}`);
  const first = payload?.data?.[0];
  if (first?.b64_json) return { bytes: base64ToBytes(first.b64_json), mimeType: 'image/png' };
  if (first?.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error(`openai_image_download_error:${imageResponse.status}`);
    return { bytes: new Uint8Array(await imageResponse.arrayBuffer()), mimeType: imageResponse.headers.get('content-type') || 'image/png' };
  }
  throw new Error('openai_image_missing_output');
}

async function qaWithClaude(reference: { mime_type: string; base64: string }, candidate: { mimeType: string; bytes: Uint8Array }, anthropicApiKey: string) {
  if (!anthropicApiKey) return null;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      system: SUPPORTER_AVATAR_QA_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'IMAGEM DE REFERÊNCIA' },
          { type: 'image', source: { type: 'base64', media_type: reference.mime_type, data: reference.base64 } },
          { type: 'text', text: 'IMAGEM CANDIDATA' },
          { type: 'image', source: { type: 'base64', media_type: candidate.mimeType, data: bytesToBase64(candidate.bytes) } },
          { type: 'text', text: 'Avalie conforme o sistema e retorne somente JSON válido.' },
        ],
      }],
    }),
  });
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

    const { data: avatarRequest, error: requestError } = await admin
      .from('supporter_avatar_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (requestError || !avatarRequest) return json({ error: 'request_not_found' }, 404);
    if (!avatarRequest.consent_image_use || !avatarRequest.consent_terms) return json({ error: 'required_consent_missing' }, 422);

    const { data: job } = await admin
      .from('supporter_avatar_jobs')
      .select('id')
      .eq('request_id', requestId)
      .in('status', ['queued','running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    jobId = job?.id || '';

    const providerKeys = await resolveProviderKeys();
    if (!providerKeys.openai) {
      await admin.from('supporter_avatar_requests').update({ status: 'provider_not_configured', updated_at: new Date().toISOString() }).eq('id', requestId);
      if (jobId) await admin.from('supporter_avatar_jobs').update({ status: 'provider_not_configured', error_message: 'OpenAI não configurada no Zica.ai', completed_at: new Date().toISOString() }).eq('id', jobId);
      return json({ error: 'openai_not_configured' }, 503);
    }

    await admin.from('supporter_avatar_requests').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', requestId);
    if (jobId) await admin.from('supporter_avatar_jobs').update({ status: 'running', attempts: 1, started_at: new Date().toISOString() }).eq('id', jobId);

    const sources = await downloadSources(requestId);
    if (!sources.length) throw new Error('no_source_images');

    const selection = await selectBestReference(sources, providerKeys.anthropic);
    const primary = sources[selection.index] || sources[0];

    const { data: dbTemplate } = await admin
      .from('supporter_avatar_prompt_templates')
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
      socialHandles: avatarRequest.social_handles || {},
    });
    const prompt = `${dbTemplate?.system_prompt || ''}\n\n${runtimePrompt}\n\nRESTRIÇÕES ADICIONAIS:\n${dbTemplate?.negative_prompt || ''}`.trim();

    const generated = await generateWithOpenAI(primary, prompt, providerKeys.openai);
    const path = `${requestId}/master-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await admin.storage.from('supporter-avatar-generated').upload(path, generated.bytes, {
      contentType: generated.mimeType,
      upsert: false,
      cacheControl: '31536000',
    });
    if (uploadError) throw uploadError;

    const qa = await qaWithClaude(primary, generated, providerKeys.anthropic);
    const qaScore = Number(qa?.facial_fidelity_score);
    const qaPass = qa ? qa.pass === true : true;

    await admin.from('supporter_avatar_outputs').insert({
      request_id: requestId,
      platform: 'master',
      width: 1024,
      height: 1024,
      storage_path: path,
      mime_type: generated.mimeType,
      model: OPENAI_IMAGE_MODEL,
      prompt_version: SUPPORTER_AVATAR_PROMPT_VERSION,
      qa_score: Number.isFinite(qaScore) ? qaScore : null,
      qa_payload: {
        ...(qa || {}),
        source_selection: selection.qa,
        source_index: selection.index,
        fidelity_target: Number(dbTemplate?.fidelity_target || 0.99),
        fidelity_target_is_not_biometric_guarantee: true,
        openai_key_source: providerKeys.openaiSource,
        anthropic_key_source: providerKeys.anthropicSource,
      },
    });

    const finalStatus = qa && !qaPass ? 'qa' : 'completed';
    await admin.from('supporter_avatar_requests').update({
      status: finalStatus,
      updated_at: new Date().toISOString(),
      completed_at: finalStatus === 'completed' ? new Date().toISOString() : null,
    }).eq('id', requestId);

    if (jobId) await admin.from('supporter_avatar_jobs').update({
      status: 'completed',
      model: OPENAI_IMAGE_MODEL,
      output_payload: {
        output_path: path,
        prompt_version: SUPPORTER_AVATAR_PROMPT_VERSION,
        qa_pass: qaPass,
        qa_score: Number.isFinite(qaScore) ? qaScore : null,
        anthropic_qa_used: Boolean(providerKeys.anthropic),
        provider_sources: { openai: providerKeys.openaiSource, anthropic: providerKeys.anthropicSource },
      },
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    return json({ ok: true, requestId, status: finalStatus, model: OPENAI_IMAGE_MODEL, qa });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('generate-supporter-avatar:', requestId, message);
    if (requestId) await admin.from('supporter_avatar_requests').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', requestId);
    if (jobId) await admin.from('supporter_avatar_jobs').update({ status: 'failed', error_message: message.slice(0, 2000), completed_at: new Date().toISOString() }).eq('id', jobId);
    return json({ error: message }, 500);
  }
});
