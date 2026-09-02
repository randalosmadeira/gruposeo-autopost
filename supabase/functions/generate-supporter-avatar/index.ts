import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import {
  SUPPORTER_AVATAR_PROMPT_VERSION,
  SUPPORT_SOCIAL_PACK,
  PHOTO_INTAKE_AGENT_PROMPT,
  CANDIDATE_SELECTOR_AGENT_PROMPT,
  CAMPAIGN_SCENE_AGENT_PROMPT,
  QUALITY_AUDITOR_AGENT_PROMPT,
  buildSupporterAvatarPrompt,
  type SupportSocialPackKey,
} from '../_shared/supporter-avatar-prompt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2';
const OPENAI_VISION_MODEL = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-5-mini';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';
const FIXED_DRIVE_FOLDER = '1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6';
const AGENT = 'NEXUS PHOTO 1470';
const MAX_PIPELINE_ATTEMPTS = 3;
const MAX_QA_GENERATIONS = 2;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function b64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length))));
  return btoa(chunks.join(''));
}
function unb64(value: string) { const source = atob(value); const out = new Uint8Array(source.length); for (let i = 0; i < source.length; i += 1) out[i] = source.charCodeAt(i); return out; }
function ext(mimeType: string) { return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'; }
function mimeFor(name: string) { const x = name.toLowerCase(); return x.endsWith('.png') ? 'image/png' : x.endsWith('.webp') ? 'image/webp' : 'image/jpeg'; }
function parseJson(text: string) {
  const cleaned = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const first = cleaned.indexOf('{'); const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) { try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { /* ignore */ } }
  return null;
}
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
async function sleep(ms: number) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function providerKeys() {
  const read = async (provider: 'openai' | 'anthropic') => {
    const { data, error } = await admin.rpc('get_zica_ai_provider_secret', { p_provider: provider });
    return error ? '' : String(data || '').trim();
  };
  const [openai, anthropic] = await Promise.all([read('openai'), read('anthropic')]);
  return { openai, anthropic };
}

async function fetchTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function requestWithRetry(url: string, init: RequestInit, ms: number, attempts = 3) {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchTimeout(url, init, ms);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      last = new Error(`provider_http_${response.status}`);
    } catch (error) {
      last = error;
    }
    if (attempt < attempts) await sleep(700 * 2 ** (attempt - 1));
  }
  throw last instanceof Error ? last : new Error('provider_request_failed');
}

function openAIOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const pieces: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') pieces.push(content.text);
      else if (typeof content?.output_text === 'string') pieces.push(content.output_text);
    }
  }
  return pieces.join('\n');
}

type VisionImage = { mimeType: string; base64: string };
async function visionJson(prompt: string, images: VisionImage[], keys: { openai: string; anthropic: string }) {
  if (keys.anthropic) {
    const content: any[] = [{ type: 'text', text: prompt }];
    images.forEach((image, index) => {
      content.push({ type: 'text', text: `IMAGEM ${index}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } });
    });
    const response = await requestWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': keys.anthropic, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1400, messages: [{ role: 'user', content }] }),
    }, 60000, 2);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`anthropic_vision_error:${response.status}`);
    return parseJson(Array.isArray(payload.content) ? payload.content.map((x: any) => x.text || '').join('\n') : '');
  }

  if (!keys.openai) throw new Error('vision_provider_not_configured');
  const content: any[] = [{ type: 'input_text', text: prompt }];
  images.forEach((image) => content.push({ type: 'input_image', image_url: `data:${image.mimeType};base64,${image.base64}` }));
  const response = await requestWithRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.openai}` },
    body: JSON.stringify({ model: OPENAI_VISION_MODEL, input: [{ role: 'user', content }], max_output_tokens: 1400 }),
  }, 60000, 2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`openai_vision_error:${response.status}:${payload?.error?.message || 'unknown'}`);
  return parseJson(openAIOutputText(payload));
}

type SourceImage = { id: string; storage_path: string; mime_type: string; bytes: Uint8Array; base64: string };
async function sourceImages(requestId: string) {
  const { data, error } = await admin.from('supporter_avatar_sources').select('id,storage_path,mime_type,created_at').eq('request_id', requestId).order('created_at', { ascending: true }).limit(3);
  if (error) throw error;
  const out: SourceImage[] = [];
  for (const source of data || []) {
    const { data: file, error: downloadError } = await admin.storage.from('supporter-avatar-uploads').download(source.storage_path);
    if (downloadError || !file) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) continue;
    out.push({ ...source, bytes, base64: b64(bytes) });
  }
  return out;
}

async function photoIntakeAgent(items: SourceImage[], keys: { openai: string; anthropic: string }) {
  if (!items.length) throw new Error('no_source_images');
  const analysis = await visionJson(PHOTO_INTAKE_AGENT_PROMPT, items.map((item) => ({ mimeType: item.mime_type, base64: item.base64 })), keys);
  const rawIndex = Number(analysis?.reference_index);
  const referenceIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < items.length ? rawIndex : 0;
  if (analysis?.usable_for_identity_preservation === false) return { referenceIndex, analysis, usable: false };
  return { referenceIndex, analysis: analysis || { fallback: true, reference_index: referenceIndex }, usable: true };
}

type CandidateMeta = {
  slug: string;
  label: string;
  wardrobe: string;
  prop: string;
  prompt_hint: string | null;
  drive_folder_id: string;
  drive_file_id: string | null;
  drive_file_name: string;
  drive_download_url: string;
};
type CandidateImage = CandidateMeta & { mime_type: string; bytes: Uint8Array; base64: string };

async function candidateMetadata() {
  const { data, error } = await admin.from('supporter_avatar_candidate_presets')
    .select('slug,label,wardrobe,prop,prompt_hint,drive_folder_id,drive_file_id,drive_file_name,drive_download_url,sort_order')
    .eq('is_active', true).eq('drive_folder_id', FIXED_DRIVE_FOLDER).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as CandidateMeta[];
}

async function candidatePreview(candidate: CandidateMeta) {
  const urls = candidate.drive_file_id
    ? [`https://drive.google.com/thumbnail?id=${encodeURIComponent(candidate.drive_file_id)}&sz=w768`, candidate.drive_download_url]
    : [candidate.drive_download_url];
  let lastStatus = 0;
  for (const url of urls) {
    const response = await requestWithRetry(url, { redirect: 'follow', headers: { 'User-Agent': `${AGENT}/2.0` } }, 30000, 2);
    lastStatus = response.status;
    if (!response.ok) continue;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) continue;
    return { mimeType: (response.headers.get('content-type') || mimeFor(candidate.drive_file_name)).split(';')[0], base64: b64(bytes) };
  }
  throw new Error(`candidate_preview_http_${lastStatus || 502}`);
}

async function candidateSelectorAgent(supporter: SourceImage, intake: any, candidates: CandidateMeta[], keys: { openai: string; anthropic: string }) {
  if (!candidates.length) throw new Error('candidate_gallery_empty');
  const previews = await Promise.all(candidates.map((candidate) => candidatePreview(candidate)));
  const descriptions = candidates.map((candidate, index) => `CANDIDATO ${index}: roupa=${candidate.wardrobe}; taco=${candidate.prop}; diretriz=${candidate.prompt_hint || 'preservar referência'}`).join('\n');
  const prompt = `${CANDIDATE_SELECTOR_AGENT_PROMPT}\nANÁLISE TÉCNICA DO APOIADOR: ${JSON.stringify(intake)}\nORDEM: imagem 0 é o apoiador; imagens 1..N correspondem aos candidatos 0..N-1.\n${descriptions}`;
  const selection = await visionJson(prompt, [{ mimeType: supporter.mime_type, base64: supporter.base64 }, ...previews], keys);
  const selectedIndexRaw = Number(selection?.selected_index);
  const runnerUpRaw = Number(selection?.runner_up_index);
  const selectedIndex = Number.isInteger(selectedIndexRaw) && selectedIndexRaw >= 0 && selectedIndexRaw < candidates.length ? selectedIndexRaw : 0;
  const runnerUpIndex = Number.isInteger(runnerUpRaw) && runnerUpRaw >= 0 && runnerUpRaw < candidates.length && runnerUpRaw !== selectedIndex ? runnerUpRaw : (candidates.length > 1 ? (selectedIndex === 0 ? 1 : 0) : selectedIndex);
  return { selectedIndex, runnerUpIndex, selection: selection || { fallback: true, selected_index: selectedIndex, runner_up_index: runnerUpIndex } };
}

async function fullCandidate(candidate: CandidateMeta): Promise<CandidateImage> {
  const response = await requestWithRetry(candidate.drive_download_url, { redirect: 'follow', headers: { 'User-Agent': `${AGENT}/2.0` } }, 45000, 3);
  if (!response.ok) throw new Error(`candidate_asset_http_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('candidate_asset_size_invalid');
  const mimeType = (response.headers.get('content-type') || mimeFor(candidate.drive_file_name)).split(';')[0];
  return { ...candidate, mime_type: mimeType, bytes, base64: b64(bytes) };
}

async function campaignSceneAgent(intake: any, candidate: CandidateMeta, style: string, keys: { openai: string; anthropic: string }) {
  const prompt = `${CAMPAIGN_SCENE_AGENT_PROMPT}\nANÁLISE DO APOIADOR: ${JSON.stringify(intake)}\nREFERÊNCIA DO CANDIDATO: roupa=${candidate.wardrobe}; taco=${candidate.prop}; estilo=${style}.`;
  const scene = await visionJson(prompt, [], keys);
  const allowed = new Set(['gente-da-nossa-terra', 'palanque-convencao-generica', 'construindo-o-futuro', 'institucional-oficial']);
  return allowed.has(String(scene?.scene)) ? scene : { scene: 'institucional-oficial', rationale: 'fallback seguro', lighting_plan: 'soft frontal' };
}

async function generateEdit(supporter: SourceImage, candidate: CandidateImage, prompt: string, modelSize: string, key: string) {
  const form = new FormData();
  form.set('model', OPENAI_IMAGE_MODEL);
  form.set('prompt', prompt);
  form.set('size', modelSize);
  form.set('quality', 'high');
  form.append('image[]', new File([supporter.bytes], `01-supporter.${ext(supporter.mime_type)}`, { type: supporter.mime_type }));
  form.append('image[]', new File([candidate.bytes], `02-candidate.${ext(candidate.mime_type)}`, { type: candidate.mime_type }));
  const response = await requestWithRetry('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form }, 180000, 3);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`openai_image_error:${response.status}:${payload?.error?.message || 'unknown'}`);
  const first = payload?.data?.[0];
  if (first?.b64_json) return { bytes: unb64(first.b64_json), mimeType: 'image/png', usage: payload?.usage || null };
  if (first?.url) {
    const imageResponse = await requestWithRetry(first.url, {}, 60000, 2);
    if (!imageResponse.ok) throw new Error(`openai_image_download_error:${imageResponse.status}`);
    return { bytes: new Uint8Array(await imageResponse.arrayBuffer()), mimeType: (imageResponse.headers.get('content-type') || 'image/png').split(';')[0], usage: payload?.usage || null };
  }
  throw new Error('openai_image_missing_output');
}

async function resizeCover(bytes: Uint8Array, width: number, height: number) {
  const image = await Image.decode(bytes);
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  if (Math.abs(sourceRatio - targetRatio) > 0.001) {
    if (sourceRatio > targetRatio) {
      const cropWidth = Math.max(1, Math.round(image.height * targetRatio));
      image.crop(Math.max(0, Math.floor((image.width - cropWidth) / 2)), 0, cropWidth, image.height);
    } else {
      const cropHeight = Math.max(1, Math.round(image.width / targetRatio));
      image.crop(0, Math.max(0, Math.floor((image.height - cropHeight) / 2)), image.width, cropHeight);
    }
  }
  image.resize(width, height);
  return await image.encode();
}

async function qualityAuditorAgent(supporter: SourceImage, candidate: CandidateImage, finalBytes: Uint8Array, candidateHasBat: boolean, keys: { openai: string; anthropic: string }) {
  const prompt = `${QUALITY_AUDITOR_AGENT_PROMPT}\nA referência do candidato ${candidateHasBat ? 'CONTÉM' : 'NÃO CONTÉM'} taco. Imagem 0=apoiador, imagem 1=candidato, imagem 2=resultado final.`;
  return await visionJson(prompt, [
    { mimeType: supporter.mime_type, base64: supporter.base64 },
    { mimeType: candidate.mime_type, base64: candidate.base64 },
    { mimeType: 'image/png', base64: b64(finalBytes) },
  ], keys);
}

function transientError(message: string) {
  return /429|5\d\d|abort|timeout|network|fetch|temporar|provider_http|connection|rate.?limit/i.test(message);
}

async function updateRequest(requestId: string, values: Record<string, unknown>) {
  const { error } = await admin.from('supporter_avatar_requests').update({ ...values, updated_at: new Date().toISOString() }).eq('id', requestId);
  if (error) throw error;
}

async function updateJob(jobId: string, values: Record<string, unknown>) {
  const { error } = await admin.from('supporter_avatar_jobs').update(values).eq('id', jobId);
  if (error) throw error;
}

function scheduleSelfRetry(requestId: string, jobId: string, dispatchToken: string, pipelineAttempt: number) {
  const task = (async () => {
    await sleep(1500 * pipelineAttempt);
    await fetch(`${SUPABASE_URL}/functions/v1/generate-supporter-avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, jobId, dispatchToken, pipelineAttempt }),
    }).catch(() => undefined);
  })();
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'service_not_configured' }, 503);

  let requestId = '';
  let jobId = '';
  let dispatchToken = '';
  let pipelineAttempt = 1;

  try {
    const body = await req.json().catch(() => ({}));
    requestId = String(body.requestId || '').trim();
    jobId = String(body.jobId || '').trim();
    dispatchToken = String(body.dispatchToken || '').trim();
    pipelineAttempt = Math.max(1, Number(body.pipelineAttempt || body.dispatchAttempt || 1));
    if (!requestId || !jobId || !dispatchToken) return json({ error: 'dispatch_credentials_required' }, 422);

    const { data: job, error: jobError } = await admin.from('supporter_avatar_jobs').select('*').eq('id', jobId).eq('request_id', requestId).maybeSingle();
    if (jobError || !job) return json({ error: 'job_not_found' }, 404);
    const expectedHash = String(job.input_payload?.dispatch_token_hash || '');
    if (!expectedHash || await sha256(dispatchToken) !== expectedHash) return json({ error: 'invalid_dispatch_token' }, 401);
    if (job.status === 'completed') return json({ ok: true, idempotent: true, status: 'completed' });
    if (pipelineAttempt > MAX_PIPELINE_ATTEMPTS) return json({ error: 'pipeline_retry_limit' }, 409);

    const { data: request, error: requestError } = await admin.from('supporter_avatar_requests').select('*').eq('id', requestId).single();
    if (requestError || !request) return json({ error: 'request_not_found' }, 404);
    if (!request.consent_image_use || !request.consent_terms) {
      await updateRequest(requestId, { status: 'needs_input' });
      await updateJob(jobId, { status: 'needs_review', error_message: 'required_consent_missing' });
      return json({ error: 'required_consent_missing' }, 422);
    }

    const keys = await providerKeys();
    if (!keys.openai) {
      await updateRequest(requestId, { status: 'needs_review' });
      await updateJob(jobId, { status: 'needs_review', error_message: 'openai_not_configured' });
      return json({ error: 'openai_not_configured' }, 503);
    }

    await updateJob(jobId, { status: 'running', attempts: pipelineAttempt, started_at: job.started_at || new Date().toISOString(), error_message: null });
    await updateRequest(requestId, { status: 'analyzing', supporter_approved_at: null, completed_at: null });

    const sources = await sourceImages(requestId);
    if (!sources.length) {
      await updateRequest(requestId, { status: 'needs_input' });
      await updateJob(jobId, { status: 'needs_review', error_message: 'no_source_images' });
      return json({ error: 'no_source_images' }, 422);
    }

    const intake = await photoIntakeAgent(sources, keys);
    if (!intake.usable) {
      await updateRequest(requestId, { status: 'needs_input', internal_selection: { photo_intake: intake.analysis } });
      await updateJob(jobId, { status: 'needs_review', error_message: 'supporter_photo_not_usable', output_payload: { photo_intake: intake.analysis } });
      return json({ ok: false, status: 'needs_input', error: 'supporter_photo_not_usable' }, 422);
    }
    const supporter = sources[intake.referenceIndex] || sources[0];

    const candidates = await candidateMetadata();
    const selected = await candidateSelectorAgent(supporter, intake.analysis, candidates, keys);
    const candidateMeta = candidates[selected.selectedIndex] || candidates[0];
    const runnerUpMeta = candidates[selected.runnerUpIndex] || candidateMeta;
    const scene = await campaignSceneAgent(intake.analysis, candidateMeta, String(request.style || 'premium'), keys);

    await updateRequest(requestId, {
      status: 'candidate_selected',
      candidate_preset_slug: candidateMeta.slug,
      internal_selection: {
        photo_intake: intake.analysis,
        supporter_source_index: intake.referenceIndex,
        candidate_selection: selected.selection,
        selected_candidate_slug: candidateMeta.slug,
        runner_up_candidate_slug: runnerUpMeta.slug,
        scene,
      },
    });
    await updateJob(jobId, {
      output_payload: {
        pipeline_version: 'auto-selector-v2',
        photo_intake: intake.analysis,
        candidate_selection: selected.selection,
        scene,
      },
    });

    const candidate = await fullCandidate(candidateMeta);
    const candidateHasBat = String(candidate.prop || '').includes('com-taco');
    const compositionPlan = String(selected.selection?.composition_plan || intake.analysis?.recommended_candidate_composition || 'duas pessoas lado a lado, escala e perspectiva coerentes');

    await updateRequest(requestId, { status: 'generating' });
    const packEntries = Object.entries(SUPPORT_SOCIAL_PACK) as Array<[SupportSocialPackKey, typeof SUPPORT_SOCIAL_PACK[SupportSocialPackKey]]>;

    type Variant = { key: SupportSocialPackKey; bytes: Uint8Array; qa: any; usage: unknown; generationAttempt: number };
    const variants: Variant[] = [];

    for (const [key, spec] of packEntries) {
      let finalBytes: Uint8Array | null = null;
      let qa: any = null;
      let usage: unknown = null;
      let generationAttempt = 0;
      let feedback = '';

      while (generationAttempt < MAX_QA_GENERATIONS) {
        generationAttempt += 1;
        if (generationAttempt > 1) {
          await updateRequest(requestId, { status: 'regenerate' });
          await updateJob(jobId, { status: 'regenerate' });
        }
        const prompt = buildSupporterAvatarPrompt({
          supportText: String(request.support_text || 'EU APOIO DR. MADEIRA 1470'),
          style: String(request.style || 'premium'),
          candidatePresetLabel: candidate.label,
          candidatePresetHint: candidate.prompt_hint || undefined,
          candidateHasBat,
          scene: String(scene?.scene || 'institucional-oficial'),
          compositionPlan,
          socialPackKey: key,
          qaFeedback: feedback || undefined,
        });
        const generated = await generateEdit(supporter, candidate, prompt, spec.modelSize, keys.openai);
        finalBytes = await resizeCover(generated.bytes, spec.exactWidth, spec.exactHeight);
        usage = generated.usage;
        await updateRequest(requestId, { status: 'qa' });
        await updateJob(jobId, { status: 'running' });
        qa = await qualityAuditorAgent(supporter, candidate, finalBytes, candidateHasBat, keys);
        if (qa?.pass === true) break;
        feedback = Array.isArray(qa?.remediation) ? qa.remediation.join('; ') : String(qa?.remediation || qa?.artifacts || 'corrigir fidelidade, anatomia, luz e legibilidade');
      }

      if (!finalBytes) throw new Error(`variant_generation_missing:${key}`);
      variants.push({ key, bytes: finalBytes, qa, usage, generationAttempt });
    }

    const allPass = variants.every((variant) => variant.qa?.pass === true);
    const stored: Array<Record<string, unknown>> = [];

    for (const variant of variants) {
      const spec = SUPPORT_SOCIAL_PACK[variant.key];
      const path = `${requestId}/${variant.key}-${spec.exactWidth}x${spec.exactHeight}-${crypto.randomUUID()}.png`;
      const { error: uploadError } = await admin.storage.from('supporter-avatar-generated').upload(path, variant.bytes, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const score = Number(variant.qa?.supporter_fidelity_score);
      const { error: outputError } = await admin.from('supporter_avatar_outputs').insert({
        request_id: requestId,
        platform: variant.key,
        width: spec.exactWidth,
        height: spec.exactHeight,
        storage_path: path,
        mime_type: 'image/png',
        model: OPENAI_IMAGE_MODEL,
        prompt_version: SUPPORTER_AVATAR_PROMPT_VERSION,
        qa_score: Number.isFinite(score) ? score : null,
        qa_payload: {
          ...(variant.qa || {}),
          agent: AGENT,
          pipeline_version: 'auto-selector-v2',
          social_crop_agent: true,
          exact_output: `${spec.exactWidth}x${spec.exactHeight}`,
          generation_attempt: variant.generationAttempt,
          scene: scene?.scene,
          openai_usage: variant.usage,
          candidate_reference_internal: candidate.slug,
        },
      });
      if (outputError) throw outputError;
      stored.push({ platform: variant.key, width: spec.exactWidth, height: spec.exactHeight, qa_pass: variant.qa?.pass === true });
    }

    const finalStatus = allPass ? 'completed' : 'needs_review';
    const completedAt = allPass ? new Date().toISOString() : null;
    await updateRequest(requestId, { status: finalStatus, completed_at: completedAt });
    await updateJob(jobId, {
      status: allPass ? 'completed' : 'needs_review',
      model: OPENAI_IMAGE_MODEL,
      output_payload: {
        pipeline_version: 'auto-selector-v2',
        outputs: stored,
        qa_pass: allPass,
        candidate_selection_score: selected.selection?.selected_score ?? null,
        scene: scene?.scene,
      },
      completed_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      requestId,
      status: finalStatus,
      pipeline: 'auto-selector-v2',
      outputs: stored.map((item) => ({ platform: item.platform, width: item.width, height: item.height })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('generate-supporter-avatar:', requestId, message);

    if (requestId && jobId) {
      if (transientError(message) && pipelineAttempt < MAX_PIPELINE_ATTEMPTS) {
        await updateRequest(requestId, { status: 'retry' }).catch(() => undefined);
        await updateJob(jobId, { status: 'retry', attempts: pipelineAttempt, error_message: message.slice(0, 500) }).catch(() => undefined);
        scheduleSelfRetry(requestId, jobId, dispatchToken, pipelineAttempt + 1);
        return json({ ok: false, status: 'retry', retrying: true, attempt: pipelineAttempt, error: 'transient_generation_error' }, 202);
      }

      const requestStatus = /no_source_images|supporter_photo_not_usable|required_consent/i.test(message) ? 'needs_input' : 'needs_review';
      await updateRequest(requestId, { status: requestStatus }).catch(() => undefined);
      await updateJob(jobId, { status: 'needs_review', attempts: pipelineAttempt, error_message: message.slice(0, 500), completed_at: new Date().toISOString() }).catch(() => undefined);
    }

    return json({ error: 'generation_pipeline_error', status: transientError(message) ? 'needs_review' : 'needs_review', detail: message.slice(0, 240) }, 500);
  }
});
