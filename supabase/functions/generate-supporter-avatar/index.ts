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
const OPENAI_VISION_MODEL = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-5.6-sol';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';
const FIXED_DRIVE_FOLDER = '1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6';
const AGENT = 'NEXUS PHOTO 1470';
const PIPELINE_VERSION = 'auto-selector-v3';
const MAX_PIPELINE_ATTEMPTS = 5;
const MAX_QA_GENERATIONS = 3;
const SIGNED_URL_TTL_SECONDS = 900;
const MAX_ANTHROPIC_REMOTE_BYTES = 5 * 1024 * 1024;
const MAX_ANTHROPIC_TOTAL_BYTES = 10 * 1024 * 1024;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function b64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length))));
  }
  return btoa(chunks.join(''));
}
function unb64(value: string) {
  const source = atob(value);
  const out = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 1) out[i] = source.charCodeAt(i);
  return out;
}
function ext(mimeType: string) {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
}
function mimeFor(name: string) {
  const x = name.toLowerCase();
  return x.endsWith('.png') ? 'image/png' : x.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
}
function isImageMime(value: string) {
  return /^image\/(jpeg|png|webp|gif)$/i.test(String(value || '').split(';')[0]);
}
function safeDetail(value: unknown, max = 300) {
  return String(value || 'unknown')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function clampScore(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
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

const PHOTO_INTAKE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    reference_index: { type: 'integer' },
    ranked_reference_indices: { type: 'array', items: { type: 'integer' } },
    face_count: { type: 'integer' },
    primary_subject_detected: { type: 'boolean' },
    face_visibility: { type: 'number' },
    face_size_ratio: { type: 'number' },
    yaw_direction: { type: 'string', enum: ['left', 'frontal', 'right'] },
    yaw_estimate_degrees: { type: 'number' },
    subject_position: { type: 'string', enum: ['left', 'center', 'right'] },
    crop_type: { type: 'string', enum: ['headshot', 'upper_body', 'half_body', 'full_body'] },
    lighting_direction: { type: 'string', enum: ['frontal', 'left', 'right', 'mixed'] },
    lighting_quality: { type: 'string', enum: ['soft', 'hard', 'mixed'] },
    sharpness_score: { type: 'integer' },
    face_quality_score: { type: 'integer' },
    occlusions: { type: 'array', items: { type: 'string' } },
    framing_score: { type: 'integer' },
    usable_for_identity_preservation: { type: 'boolean' },
    recommended_candidate_composition: { type: 'string' },
    technical_notes: { type: 'string' },
  },
  required: ['reference_index','ranked_reference_indices','face_count','primary_subject_detected','face_visibility','face_size_ratio','yaw_direction','yaw_estimate_degrees','subject_position','crop_type','lighting_direction','lighting_quality','sharpness_score','face_quality_score','occlusions','framing_score','usable_for_identity_preservation','recommended_candidate_composition','technical_notes'],
};
const CANDIDATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    selected_index: { type: 'integer' },
    runner_up_index: { type: 'integer' },
    selected_score: { type: 'integer' },
    runner_up_score: { type: 'integer' },
    score_breakdown: {
      type: 'object', additionalProperties: false,
      properties: {
        angle: { type: 'integer' }, space: { type: 'integer' }, perspective: { type: 'integer' },
        crop: { type: 'integer' }, lighting: { type: 'integer' }, social_formats: { type: 'integer' }, obstruction_risk: { type: 'integer' },
      },
      required: ['angle','space','perspective','crop','lighting','social_formats','obstruction_risk'],
    },
    selection_reason: { type: 'string' },
    composition_plan: { type: 'string' },
  },
  required: ['selected_index','runner_up_index','selected_score','runner_up_score','score_breakdown','selection_reason','composition_plan'],
};
const SCENE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    scene: { type: 'string', enum: ['gente-da-nossa-terra','palanque-convencao-generica','construindo-o-futuro','institucional-oficial'] },
    rationale: { type: 'string' }, lighting_plan: { type: 'string' },
  },
  required: ['scene','rationale','lighting_plan'],
};
const QA_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    supporter_fidelity_score: { type: 'integer' }, candidate_reference_fidelity_score: { type: 'integer' },
    human_texture_score: { type: 'integer' }, anatomy_score: { type: 'integer' }, crop_safe_score: { type: 'integer' },
    lighting_consistency_score: { type: 'integer' }, disclosure_legibility_score: { type: 'integer' }, prop_integrity_score: { type: 'integer' },
    artifacts: { type: 'array', items: { type: 'string' } }, remediation: { type: 'array', items: { type: 'string' } }, pass: { type: 'boolean' },
  },
  required: ['supporter_fidelity_score','candidate_reference_fidelity_score','human_texture_score','anatomy_score','crop_safe_score','lighting_consistency_score','disclosure_legibility_score','prop_integrity_score','artifacts','remediation','pass'],
};

type VisionInput = { url?: string; mimeType?: string; base64?: string; approxBytes?: number };

async function openAIVisionJson(prompt: string, images: VisionInput[], key: string, schemaName: string, schema: Record<string, unknown>) {
  const content: any[] = [{ type: 'input_text', text: prompt }];
  for (const image of images) {
    const imageUrl = image.url || (image.base64 && image.mimeType ? `data:${image.mimeType};base64,${image.base64}` : '');
    if (imageUrl) content.push({ type: 'input_image', image_url: imageUrl });
  }
  const response = await requestWithRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_VISION_MODEL,
      input: [{ role: 'user', content }],
      max_output_tokens: 1800,
      text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
    }),
  }, 90000, 2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`openai_vision_error:${response.status}:${safeDetail(payload?.error?.message || 'unknown')}`);
  const text = openAIOutputText(payload);
  try { return JSON.parse(text); }
  catch { throw new Error(`openai_vision_unparseable_json:${safeDetail(text, 120)}`); }
}

async function remoteVisionBytes(input: VisionInput) {
  if (input.base64 && input.mimeType) return { mimeType: input.mimeType, bytes: unb64(input.base64) };
  if (!input.url) throw new Error('vision_input_missing');
  const response = await requestWithRetry(input.url, { redirect: 'follow' }, 45000, 2);
  if (!response.ok) throw new Error(`vision_remote_http_${response.status}`);
  const mimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!isImageMime(mimeType)) throw new Error(`vision_remote_invalid_mime:${mimeType || 'missing'}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_ANTHROPIC_REMOTE_BYTES) throw new Error(`vision_remote_size:${bytes.length}`);
  return { mimeType, bytes };
}

async function anthropicVisionJson(prompt: string, images: VisionInput[], key: string, schema: Record<string, unknown>) {
  const hintedTotal = images.reduce((sum, image) => sum + Number(image.approxBytes || 0), 0);
  if (hintedTotal > MAX_ANTHROPIC_TOTAL_BYTES) throw new Error(`anthropic_skipped_payload_size:${hintedTotal}`);
  const content: any[] = [{ type: 'text', text: prompt }];
  let actualTotal = 0;
  for (let i = 0; i < images.length; i += 1) {
    const materialized = await remoteVisionBytes(images[i]);
    actualTotal += materialized.bytes.length;
    if (actualTotal > MAX_ANTHROPIC_TOTAL_BYTES) throw new Error(`anthropic_skipped_payload_size:${actualTotal}`);
    content.push({ type: 'text', text: `IMAGEM ${i}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: materialized.mimeType, data: b64(materialized.bytes) } });
  }
  const response = await requestWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1800,
      tools: [{ name: 'emit_result', description: 'Retorne somente o resultado técnico solicitado.', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'emit_result' },
      messages: [{ role: 'user', content }],
    }),
  }, 90000, 2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`anthropic_vision_error:${response.status}:${safeDetail(payload?.error?.message || payload?.message || 'unknown')}`);
  const tool = Array.isArray(payload?.content) ? payload.content.find((item: any) => item?.type === 'tool_use' && item?.name === 'emit_result') : null;
  if (!tool?.input || typeof tool.input !== 'object') throw new Error('anthropic_vision_unparseable_json');
  return tool.input;
}

async function visionJson(prompt: string, images: VisionInput[], keys: { openai: string; anthropic: string }, schemaName: string, schema: Record<string, unknown>) {
  let openaiFailure = '';
  if (keys.openai) {
    try { return await openAIVisionJson(prompt, images, keys.openai, schemaName, schema); }
    catch (error) {
      openaiFailure = error instanceof Error ? error.message : String(error);
      console.warn('visionJson OpenAI fallback:', safeDetail(openaiFailure));
    }
  }
  if (keys.anthropic) {
    try { return await anthropicVisionJson(prompt, images, keys.anthropic, schema); }
    catch (error) {
      const anthropicFailure = error instanceof Error ? error.message : String(error);
      throw new Error(`vision_all_providers_failed:${safeDetail(openaiFailure || 'openai_not_configured')}|${safeDetail(anthropicFailure)}`);
    }
  }
  throw new Error(`vision_all_providers_failed:${safeDetail(openaiFailure || 'openai_not_configured')}|anthropic_not_configured`);
}

type SourceImage = {
  id: string; storage_path: string; mime_type: string; file_size_bytes: number; signed_url: string;
};
type LoadedSource = SourceImage & { bytes: Uint8Array };

async function sourceImages(requestId: string) {
  const { data, error } = await admin.from('supporter_avatar_sources')
    .select('id,storage_path,mime_type,file_size_bytes,created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(3);
  if (error) throw error;
  const out: SourceImage[] = [];
  for (const source of data || []) {
    const { data: signed, error: signedError } = await admin.storage.from('supporter-avatar-uploads').createSignedUrl(source.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signedError || !signed?.signedUrl) continue;
    out.push({
      id: source.id,
      storage_path: source.storage_path,
      mime_type: String(source.mime_type || 'image/jpeg'),
      file_size_bytes: Number(source.file_size_bytes || 0),
      signed_url: signed.signedUrl,
    });
  }
  return out;
}

async function loadSource(source: SourceImage): Promise<LoadedSource> {
  const { data: file, error } = await admin.storage.from('supporter-avatar-uploads').download(source.storage_path);
  if (error || !file) throw error || new Error('supporter_source_download_failed');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('supporter_source_empty');
  return { ...source, bytes };
}

function intakeFallback(items: SourceImage[], reason: string) {
  const ranked = items.map((item, index) => ({ index, size: item.file_size_bytes })).sort((a, b) => b.size - a.size).map((item) => item.index);
  const referenceIndex = ranked[0] ?? 0;
  return {
    referenceIndex,
    rankedReferenceIndices: ranked.length ? ranked : [0],
    usable: true,
    degraded: true,
    analysis: {
      reference_index: referenceIndex,
      ranked_reference_indices: ranked.length ? ranked : [0],
      face_count: 1,
      primary_subject_detected: true,
      face_visibility: 0.7,
      face_size_ratio: 0.35,
      yaw_direction: 'frontal',
      yaw_estimate_degrees: 0,
      subject_position: 'center',
      crop_type: 'upper_body',
      lighting_direction: 'frontal',
      lighting_quality: 'mixed',
      sharpness_score: 70,
      face_quality_score: 70,
      occlusions: [],
      framing_score: 70,
      usable_for_identity_preservation: true,
      recommended_candidate_composition: 'referência frontal limpa; preservar identidade e simplificar cenário',
      technical_notes: `fallback autônomo por indisponibilidade do agente de visão: ${safeDetail(reason, 140)}`,
      fallback: true,
    },
  };
}

async function photoIntakeAgent(items: SourceImage[], keys: { openai: string; anthropic: string }) {
  if (!items.length) throw new Error('no_source_images');
  try {
    const analysis: any = await visionJson(
      PHOTO_INTAKE_AGENT_PROMPT,
      items.map((item) => ({ url: item.signed_url, mimeType: item.mime_type, approxBytes: item.file_size_bytes })),
      keys,
      'photo_intake',
      PHOTO_INTAKE_SCHEMA,
    );
    const rawIndex = Number(analysis?.reference_index);
    const referenceIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < items.length ? rawIndex : 0;
    const ranked = Array.isArray(analysis?.ranked_reference_indices)
      ? analysis.ranked_reference_indices.map(Number).filter((index: number) => Number.isInteger(index) && index >= 0 && index < items.length)
      : [];
    const rankedReferenceIndices = Array.from(new Set([referenceIndex, ...ranked, ...items.map((_, index) => index)]));
    const hardUnusable = analysis?.primary_subject_detected === false || Number(analysis?.face_count || 0) < 1 || clampScore(analysis?.face_quality_score) < 25 || Number(analysis?.face_visibility || 0) < 0.3;
    return { referenceIndex, rankedReferenceIndices, analysis, usable: !hardUnusable, degraded: false };
  } catch (error) {
    return intakeFallback(items, error instanceof Error ? error.message : String(error));
  }
}

type CandidateMeta = {
  slug: string; label: string; wardrobe: string; prop: string; prompt_hint: string | null;
  drive_folder_id: string; drive_file_id: string | null; drive_file_name: string; drive_download_url: string; sort_order: number;
};
type CandidateImage = CandidateMeta & { mime_type: string; bytes: Uint8Array };

async function candidateMetadata() {
  const { data, error } = await admin.from('supporter_avatar_candidate_presets')
    .select('slug,label,wardrobe,prop,prompt_hint,drive_folder_id,drive_file_id,drive_file_name,drive_download_url,sort_order')
    .eq('is_active', true)
    .eq('drive_folder_id', FIXED_DRIVE_FOLDER)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as CandidateMeta[];
}
function candidatePreviewUrl(candidate: CandidateMeta, edge = 1024) {
  return candidate.drive_file_id
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(candidate.drive_file_id)}&sz=w${edge}`
    : candidate.drive_download_url;
}
function fallbackCandidate(candidates: CandidateMeta[], style: string, reason: string) {
  const formal = ['premium','institucional','dark'].includes(style);
  const scored = candidates.map((candidate, index) => {
    let score = 0;
    if (candidate.prop === 'sem-taco') score += 50;
    if (/frontal/i.test(candidate.label)) score += 30;
    if (formal && candidate.wardrobe === 'terno') score += 15;
    if (!formal && candidate.wardrobe === 'camisa-1470') score += 15;
    score -= Number(candidate.sort_order || 0) / 100;
    return { index, score };
  }).sort((a, b) => b.score - a.score);
  const selectedIndex = scored[0]?.index ?? 0;
  const runnerUpIndex = scored.find((item) => item.index !== selectedIndex)?.index ?? selectedIndex;
  return {
    selectedIndex,
    runnerUpIndex,
    degraded: true,
    selection: {
      selected_index: selectedIndex,
      runner_up_index: runnerUpIndex,
      selected_score: 70,
      runner_up_score: 65,
      score_breakdown: { angle: 70, space: 80, perspective: 70, crop: 80, lighting: 70, social_formats: 80, obstruction_risk: 90 },
      selection_reason: `fallback seguro sem exposição da galeria: ${safeDetail(reason, 120)}`,
      composition_plan: 'duas pessoas lado a lado; referência do candidato com área lateral livre; cenário simples',
      fallback: true,
    },
  };
}

async function candidateSelectorAgent(supporter: SourceImage, intake: any, candidates: CandidateMeta[], style: string, keys: { openai: string; anthropic: string }) {
  if (!candidates.length) throw new Error('candidate_gallery_empty');
  const descriptions = candidates.map((candidate, index) => `CANDIDATO ${index}: roupa=${candidate.wardrobe}; taco=${candidate.prop}; diretriz=${candidate.prompt_hint || 'preservar referência'}`).join('\n');
  const prompt = `${CANDIDATE_SELECTOR_AGENT_PROMPT}\nANÁLISE DO APOIADOR: ${JSON.stringify(intake)}\nESTILO: ${style}.\nORDEM: imagem 0 é o apoiador; imagens 1..N correspondem aos candidatos 0..N-1.\n${descriptions}`;
  const inputs: VisionInput[] = [{ url: supporter.signed_url, mimeType: supporter.mime_type, approxBytes: supporter.file_size_bytes }];
  for (const candidate of candidates) inputs.push({ url: candidatePreviewUrl(candidate, 1024), mimeType: mimeFor(candidate.drive_file_name), approxBytes: 700_000 });
  try {
    const selection: any = await visionJson(prompt, inputs, keys, 'candidate_selector', CANDIDATE_SCHEMA);
    const selectedRaw = Number(selection?.selected_index);
    const runnerRaw = Number(selection?.runner_up_index);
    const selectedIndex = Number.isInteger(selectedRaw) && selectedRaw >= 0 && selectedRaw < candidates.length ? selectedRaw : 0;
    const runnerUpIndex = Number.isInteger(runnerRaw) && runnerRaw >= 0 && runnerRaw < candidates.length && runnerRaw !== selectedIndex
      ? runnerRaw : (candidates.length > 1 ? (selectedIndex === 0 ? 1 : 0) : selectedIndex);
    return { selectedIndex, runnerUpIndex, selection, degraded: false };
  } catch (error) {
    return fallbackCandidate(candidates, style, error instanceof Error ? error.message : String(error));
  }
}

async function fullCandidate(candidate: CandidateMeta): Promise<CandidateImage> {
  const urls = [
    candidate.drive_download_url,
    candidate.drive_file_id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(candidate.drive_file_id)}` : '',
    candidate.drive_file_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(candidate.drive_file_id)}&sz=w2048` : '',
  ].filter(Boolean);
  let lastReason = 'candidate_asset_unavailable';
  let lastStatus = 0;
  for (const url of urls) {
    try {
      const response = await requestWithRetry(url, { redirect: 'follow', headers: { 'User-Agent': `${AGENT}/3.0` } }, 45000, 2);
      lastStatus = response.status;
      if (!response.ok) continue;
      const mimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!isImageMime(mimeType)) { lastReason = `candidate_asset_invalid_mime:${mimeType || 'missing'}`; continue; }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 15 * 1024 * 1024) { lastReason = `candidate_asset_size_invalid:${bytes.length}`; continue; }
      return { ...candidate, mime_type: mimeType || mimeFor(candidate.drive_file_name), bytes };
    } catch (error) { lastReason = safeDetail(error instanceof Error ? error.message : error); }
  }
  throw new Error(`${lastReason}:http_${lastStatus || 502}`);
}

async function campaignSceneAgent(intake: any, candidate: CandidateMeta, style: string, keys: { openai: string; anthropic: string }) {
  const prompt = `${CAMPAIGN_SCENE_AGENT_PROMPT}\nANÁLISE DO APOIADOR: ${JSON.stringify(intake)}\nREFERÊNCIA DO CANDIDATO: roupa=${candidate.wardrobe}; taco=${candidate.prop}; estilo=${style}.`;
  try {
    return await visionJson(prompt, [], keys, 'campaign_scene', SCENE_SCHEMA);
  } catch (error) {
    return { scene: 'institucional-oficial', rationale: `fallback seguro: ${safeDetail(error instanceof Error ? error.message : error, 100)}`, lighting_plan: 'soft frontal', fallback: true };
  }
}

async function generateEdit(supporter: LoadedSource, candidate: CandidateImage, prompt: string, modelSize: string, key: string) {
  const send = async (withFidelity: boolean) => {
    const form = new FormData();
    form.set('model', OPENAI_IMAGE_MODEL);
    form.set('prompt', prompt);
    form.set('size', modelSize);
    form.set('quality', 'high');
    if (withFidelity) form.set('input_fidelity', 'high');
    form.append('image[]', new File([supporter.bytes], `01-supporter.${ext(supporter.mime_type)}`, { type: supporter.mime_type }));
    form.append('image[]', new File([candidate.bytes], `02-candidate.${ext(candidate.mime_type)}`, { type: candidate.mime_type }));
    const response = await requestWithRetry('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form }, 210000, 3);
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  let result = await send(true);
  if (!result.response.ok && result.response.status === 400 && /input_fidelity|unknown parameter|unsupported/i.test(String(result.payload?.error?.message || ''))) {
    result = await send(false);
  }
  if (!result.response.ok) throw new Error(`openai_image_error:${result.response.status}:${safeDetail(result.payload?.error?.message || 'unknown')}`);
  const first = result.payload?.data?.[0];
  if (first?.b64_json) return { bytes: unb64(first.b64_json), mimeType: 'image/png', usage: result.payload?.usage || null };
  if (first?.url) {
    const imageResponse = await requestWithRetry(first.url, {}, 60000, 2);
    if (!imageResponse.ok) throw new Error(`openai_image_download_error:${imageResponse.status}`);
    return { bytes: new Uint8Array(await imageResponse.arrayBuffer()), mimeType: (imageResponse.headers.get('content-type') || 'image/png').split(';')[0], usage: result.payload?.usage || null };
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

function qaPass(qa: any, candidateHasBat: boolean) {
  return clampScore(qa?.supporter_fidelity_score) >= 92
    && clampScore(qa?.candidate_reference_fidelity_score) >= 90
    && clampScore(qa?.human_texture_score) >= 92
    && clampScore(qa?.anatomy_score) >= 92
    && clampScore(qa?.crop_safe_score) >= 90
    && clampScore(qa?.lighting_consistency_score) >= 90
    && clampScore(qa?.disclosure_legibility_score) >= 90
    && (!candidateHasBat || clampScore(qa?.prop_integrity_score) >= 90);
}
function qaFeedback(qa: any) {
  const remediation = Array.isArray(qa?.remediation) ? qa.remediation.join('; ') : String(qa?.remediation || '');
  return `${remediation || 'preservar mais fielmente as referências'}; supporter=${clampScore(qa?.supporter_fidelity_score)} candidate=${clampScore(qa?.candidate_reference_fidelity_score)} anatomy=${clampScore(qa?.anatomy_score)} crop=${clampScore(qa?.crop_safe_score)} lighting=${clampScore(qa?.lighting_consistency_score)}`;
}
async function qualityAuditorAgent(supporter: SourceImage, candidate: CandidateMeta, finalBytes: Uint8Array, candidateHasBat: boolean, keys: { openai: string; anthropic: string }) {
  const prompt = `${QUALITY_AUDITOR_AGENT_PROMPT}\nA referência do candidato ${candidateHasBat ? 'CONTÉM' : 'NÃO CONTÉM'} taco. Imagem 0=apoiador, imagem 1=candidato, imagem 2=resultado final.`;
  const qa: any = await visionJson(prompt, [
    { url: supporter.signed_url, mimeType: supporter.mime_type, approxBytes: supporter.file_size_bytes },
    { url: candidatePreviewUrl(candidate, 1600), mimeType: mimeFor(candidate.drive_file_name), approxBytes: 1_000_000 },
    { mimeType: 'image/png', base64: b64(finalBytes), approxBytes: finalBytes.length },
  ], keys, 'quality_auditor', QA_SCHEMA);
  qa.pass = qaPass(qa, candidateHasBat);
  return qa;
}

async function existingPassedOutput(requestId: string, platform: SupportSocialPackKey) {
  const { data } = await admin.from('supporter_avatar_outputs')
    .select('id,platform,width,height,storage_path,qa_payload,created_at')
    .eq('request_id', requestId)
    .eq('platform', platform)
    .contains('qa_payload', { pass: true, pipeline_version: PIPELINE_VERSION })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}
async function updateRequest(requestId: string, values: Record<string, unknown>) {
  const { error } = await admin.from('supporter_avatar_requests').update({ ...values, updated_at: new Date().toISOString() }).eq('id', requestId);
  if (error) throw error;
}
async function updateJob(jobId: string, values: Record<string, unknown>) {
  const { error } = await admin.from('supporter_avatar_jobs').update(values).eq('id', jobId);
  if (error) throw error;
}
async function countGenerationResult(requestId: string, jobId: string) {
  const { error } = await admin.rpc('record_supporter_avatar_generation_result', { p_request_id: requestId, p_job_id: jobId });
  if (error) throw error;
}
function transientError(message: string) {
  return /429|5\d\d|abort|timeout|network|fetch|temporar|provider_http|connection|rate.?limit|openai_image_error|openai_image_download_error|candidate_asset|storage/i.test(message);
}
function scheduleSelfRetry(requestId: string, jobId: string, dispatchToken: string, pipelineAttempt: number) {
  const task = (async () => {
    await sleep(Math.min(15000, 1200 * 2 ** Math.max(0, pipelineAttempt - 1)));
    await fetch(`${SUPABASE_URL}/functions/v1/generate-supporter-avatar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, jobId, dispatchToken, pipelineAttempt }),
    }).catch(() => undefined);
  })();
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task); else void task;
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
    if (job.status === 'completed') return json({ ok: true, idempotent: true, status: 'completed', pipeline: PIPELINE_VERSION });
    if (pipelineAttempt > MAX_PIPELINE_ATTEMPTS) return json({ error: 'pipeline_retry_limit' }, 409);

    const { data: request, error: requestError } = await admin.from('supporter_avatar_requests').select('*').eq('id', requestId).single();
    if (requestError || !request) return json({ error: 'request_not_found' }, 404);
    if (!request.consent_image_use || !request.consent_terms) {
      await updateRequest(requestId, { status: 'needs_input' });
      await updateJob(jobId, { status: 'needs_review', error_message: 'required_consent_missing', completed_at: new Date().toISOString() });
      return json({ error: 'required_consent_missing' }, 422);
    }

    const keys = await providerKeys();
    if (!keys.openai) {
      await updateRequest(requestId, { status: 'needs_review' });
      await updateJob(jobId, { status: 'needs_review', error_message: 'openai_image_provider_not_configured', completed_at: new Date().toISOString() });
      return json({ error: 'openai_image_provider_not_configured' }, 503);
    }

    await updateJob(jobId, {
      status: 'running', stage: PIPELINE_VERSION, provider: 'openai', model: OPENAI_IMAGE_MODEL,
      attempts: pipelineAttempt, started_at: job.started_at || new Date().toISOString(), error_message: null,
    });
    await updateRequest(requestId, { status: 'analyzing', pipeline_version: PIPELINE_VERSION, supporter_approved_at: null, completed_at: null });

    const sources = await sourceImages(requestId);
    if (!sources.length) {
      await updateRequest(requestId, { status: 'needs_input' });
      await updateJob(jobId, { status: 'needs_review', error_message: 'no_source_images', completed_at: new Date().toISOString() });
      return json({ error: 'no_source_images' }, 422);
    }

    const intake = await photoIntakeAgent(sources, keys);
    if (!intake.usable) {
      await updateRequest(requestId, { status: 'needs_input', internal_selection: { photo_intake: intake.analysis } });
      await updateJob(jobId, { status: 'needs_review', error_message: 'supporter_photo_not_usable', output_payload: { photo_intake: intake.analysis }, completed_at: new Date().toISOString() });
      return json({ ok: false, status: 'needs_input', error: 'supporter_photo_not_usable' }, 422);
    }

    const initialSupporterIndex = intake.referenceIndex;
    const supporterMeta = sources[initialSupporterIndex] || sources[0];
    const candidates = await candidateMetadata();
    const selected = await candidateSelectorAgent(supporterMeta, intake.analysis, candidates, String(request.style || 'premium'), keys);
    let candidateMeta = candidates[selected.selectedIndex] || candidates[0];
    let runnerUpMeta = candidates[selected.runnerUpIndex] || candidateMeta;
    const scene = await campaignSceneAgent(intake.analysis, candidateMeta, String(request.style || 'premium'), keys);

    await updateRequest(requestId, {
      status: 'candidate_selected',
      candidate_preset_slug: candidateMeta.slug,
      internal_selection: {
        photo_intake: intake.analysis,
        photo_intake_degraded: intake.degraded,
        supporter_source_index: initialSupporterIndex,
        ranked_supporter_indices: intake.rankedReferenceIndices,
        candidate_selection: selected.selection,
        candidate_selection_degraded: selected.degraded,
        selected_candidate_slug: candidateMeta.slug,
        runner_up_candidate_slug: runnerUpMeta.slug,
        scene,
        autonomous_recovery: true,
      },
    });
    await updateJob(jobId, { output_payload: { pipeline_version: PIPELINE_VERSION, photo_intake: intake.analysis, candidate_selection: selected.selection, scene, autonomous_recovery: true } });

    const sourceCache = new Map<number, Promise<LoadedSource>>();
    const candidateCache = new Map<string, Promise<CandidateImage>>();
    const getSource = (index: number) => {
      if (!sourceCache.has(index)) sourceCache.set(index, loadSource(sources[index] || sources[0]));
      return sourceCache.get(index)!;
    };
    const getCandidate = (candidate: CandidateMeta) => {
      if (!candidateCache.has(candidate.slug)) candidateCache.set(candidate.slug, fullCandidate(candidate));
      return candidateCache.get(candidate.slug)!;
    };

    try { await getCandidate(candidateMeta); }
    catch (error) {
      if (runnerUpMeta.slug === candidateMeta.slug) throw error;
      candidateMeta = runnerUpMeta;
      const fallback = candidates.find((candidate) => candidate.slug !== candidateMeta.slug && candidate.prop === 'sem-taco');
      runnerUpMeta = fallback || candidateMeta;
      await getCandidate(candidateMeta);
    }

    const packEntries = Object.entries(SUPPORT_SOCIAL_PACK) as Array<[SupportSocialPackKey, typeof SUPPORT_SOCIAL_PACK[SupportSocialPackKey]]>;
    const stored: Array<Record<string, unknown>> = [];
    let allPass = true;
    let producedAnyOutput = false;

    for (const [key, spec] of packEntries) {
      const existing = await existingPassedOutput(requestId, key);
      if (existing) {
        stored.push({ platform: key, width: existing.width, height: existing.height, qa_pass: true, resumed: true, output_id: existing.id });
        continue;
      }

      let currentSupporterIndex = initialSupporterIndex;
      let currentCandidateMeta = candidateMeta;
      let finalBytes: Uint8Array | null = null;
      let finalQa: any = null;
      let usage: unknown = null;
      let generationAttempt = 0;
      let feedback = '';
      let qaProviderError = '';

      while (generationAttempt < MAX_QA_GENERATIONS) {
        generationAttempt += 1;
        if (generationAttempt > 1) {
          await updateRequest(requestId, { status: 'regenerate' });
          await updateJob(jobId, { status: 'regenerate' });
        }

        const supporter = await getSource(currentSupporterIndex);
        let candidate: CandidateImage;
        try { candidate = await getCandidate(currentCandidateMeta); }
        catch (error) {
          if (runnerUpMeta.slug !== currentCandidateMeta.slug) {
            currentCandidateMeta = runnerUpMeta;
            candidate = await getCandidate(currentCandidateMeta);
          } else throw error;
        }

        const candidateHasBat = String(candidate.prop || '').includes('com-taco');
        const compositionPlan = String(selected.selection?.composition_plan || intake.analysis?.recommended_candidate_composition || 'duas pessoas lado a lado, escala e perspectiva coerentes');
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

        await updateRequest(requestId, { status: 'generating' });
        await updateJob(jobId, { status: 'running' });
        const generated = await generateEdit(supporter, candidate, prompt, spec.modelSize, keys.openai);
        finalBytes = await resizeCover(generated.bytes, spec.exactWidth, spec.exactHeight);
        usage = generated.usage;

        await updateRequest(requestId, { status: 'qa' });
        try {
          finalQa = await qualityAuditorAgent(sources[currentSupporterIndex] || sources[0], currentCandidateMeta, finalBytes, candidateHasBat, keys);
          if (finalQa.pass === true) break;
          feedback = qaFeedback(finalQa);

          if (generationAttempt < MAX_QA_GENERATIONS && clampScore(finalQa?.candidate_reference_fidelity_score) < 90 && runnerUpMeta.slug !== currentCandidateMeta.slug) {
            currentCandidateMeta = runnerUpMeta;
            feedback += '; trocar automaticamente para referência reserva do candidato com maior estabilidade';
          }
          const supporterAlternatives = intake.rankedReferenceIndices.filter((index: number) => index !== currentSupporterIndex);
          if (generationAttempt < MAX_QA_GENERATIONS && clampScore(finalQa?.supporter_fidelity_score) < 92 && supporterAlternatives.length) {
            currentSupporterIndex = supporterAlternatives[0];
            intake.rankedReferenceIndices = [currentSupporterIndex, ...intake.rankedReferenceIndices.filter((index: number) => index !== currentSupporterIndex)];
            feedback += '; trocar automaticamente para segunda referência técnica do apoiador';
          }
        } catch (error) {
          qaProviderError = safeDetail(error instanceof Error ? error.message : error, 260);
          finalQa = {
            supporter_fidelity_score: 0, candidate_reference_fidelity_score: 0, human_texture_score: 0, anatomy_score: 0,
            crop_safe_score: 0, lighting_consistency_score: 0, disclosure_legibility_score: 0, prop_integrity_score: 0,
            artifacts: ['qa_provider_unavailable'], remediation: ['reexecutar QA técnico automaticamente quando o provedor estiver disponível'],
            pass: false, qa_provider_error: qaProviderError,
          };
          break;
        }
      }

      if (!finalBytes) throw new Error(`variant_generation_missing:${key}`);
      const passed = finalQa?.pass === true;
      allPass = allPass && passed;
      producedAnyOutput = true;
      const path = `${requestId}/${key}-${spec.exactWidth}x${spec.exactHeight}-${crypto.randomUUID()}.png`;
      const { error: uploadError } = await admin.storage.from('supporter-avatar-generated').upload(path, finalBytes, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const score = Number(finalQa?.supporter_fidelity_score);
      const { data: inserted, error: outputError } = await admin.from('supporter_avatar_outputs').insert({
        request_id: requestId,
        platform: key,
        width: spec.exactWidth,
        height: spec.exactHeight,
        storage_path: path,
        mime_type: 'image/png',
        model: OPENAI_IMAGE_MODEL,
        prompt_version: SUPPORTER_AVATAR_PROMPT_VERSION,
        qa_score: Number.isFinite(score) ? score : null,
        qa_payload: {
          ...(finalQa || {}),
          pass: passed,
          agent: AGENT,
          pipeline_version: PIPELINE_VERSION,
          autonomous_recovery: true,
          social_crop_agent: true,
          exact_output: `${spec.exactWidth}x${spec.exactHeight}`,
          generation_attempt: generationAttempt,
          scene: scene?.scene,
          openai_usage: usage,
          candidate_reference_internal: currentCandidateMeta.slug,
          supporter_source_internal_index: currentSupporterIndex,
          qa_provider_error: qaProviderError || null,
        },
      }).select('id').single();
      if (outputError) throw outputError;
      stored.push({ platform: key, width: spec.exactWidth, height: spec.exactHeight, qa_pass: passed, output_id: inserted?.id, qa_provider_error: qaProviderError || null });
    }

    if (producedAnyOutput) await countGenerationResult(requestId, jobId);

    const finalStatus = allPass ? 'completed' : 'needs_review';
    const completedAt = allPass ? new Date().toISOString() : null;
    await updateRequest(requestId, { status: finalStatus, completed_at: completedAt, pipeline_version: PIPELINE_VERSION });
    await updateJob(jobId, {
      status: allPass ? 'completed' : 'needs_review',
      stage: PIPELINE_VERSION,
      model: OPENAI_IMAGE_MODEL,
      error_message: allPass ? null : 'qa_threshold_not_met_or_qa_provider_pending',
      output_payload: {
        pipeline_version: PIPELINE_VERSION,
        outputs: stored,
        qa_pass: allPass,
        autonomous_recovery: true,
        technical_retries_are_free: true,
        candidate_selection_score: selected.selection?.selected_score ?? null,
        scene: scene?.scene,
      },
      completed_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      requestId,
      status: finalStatus,
      pipeline: PIPELINE_VERSION,
      autonomousRecovery: true,
      outputs: stored.map((item) => ({ platform: item.platform, width: item.width, height: item.height, qaPass: item.qa_pass })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('generate-supporter-avatar:', requestId, safeDetail(message, 500));
    if (requestId && jobId) {
      if (transientError(message) && pipelineAttempt < MAX_PIPELINE_ATTEMPTS) {
        await updateRequest(requestId, { status: 'retry', pipeline_version: PIPELINE_VERSION }).catch(() => undefined);
        await updateJob(jobId, { status: 'retry', stage: PIPELINE_VERSION, attempts: pipelineAttempt, error_message: `autonomous_retry:${safeDetail(message, 430)}` }).catch(() => undefined);
        scheduleSelfRetry(requestId, jobId, dispatchToken, pipelineAttempt + 1);
        return json({ ok: false, status: 'retry', retrying: true, autonomousRecovery: true, attempt: pipelineAttempt, error: 'transient_generation_error' }, 202);
      }
      const requestStatus = /no_source_images|supporter_photo_not_usable|required_consent/i.test(message) ? 'needs_input' : 'needs_review';
      await updateRequest(requestId, { status: requestStatus, pipeline_version: PIPELINE_VERSION }).catch(() => undefined);
      await updateJob(jobId, { status: 'needs_review', stage: PIPELINE_VERSION, attempts: pipelineAttempt, error_message: safeDetail(message, 500), completed_at: new Date().toISOString() }).catch(() => undefined);
    }
    return json({ error: 'generation_pipeline_error', status: 'needs_review', pipeline: PIPELINE_VERSION, detail: safeDetail(message, 240) }, 500);
  }
});
