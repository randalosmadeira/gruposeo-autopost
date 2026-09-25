import crypto from 'node:crypto';
import sharp from 'sharp';
import { supabase } from '../config.js';
import { MASTER_SIZE, RENDER_VERSION, SUPPORTER_OUTPUTS, renderSupporterPack, type SupporterOutputKey } from './render.js';
import { PIPELINE_VERSION, QA_PROMPT, SELECTOR_PROMPT, SUPPORTER_AVATAR_PROMPT_VERSION, SUPPORTER_PHOTO_AGENT_NAME, buildCompositionPrompt } from './prompt.js';

/**
 * Gerador de apoiadores 1470 - pipeline VPS v8 ("rápido").
 *
 * Uma chamada de visão (seleção), UMA geração de imagem (composição sem texto),
 * renderização vetorial local dos 3 formatos (<1 s) e um QA de visão advisory.
 * Alvo: ~45-90 s por pedido, contra horas do pipeline Edge anterior (3 gerações
 * de imagem em invocações encadeadas).
 *
 * Contratos preservados com o banco/Edge:
 *  - claim_supporter_avatar_generation_attempt (serialização de tentativas)
 *  - record_supporter_avatar_generation_result (só conta pacote concluído)
 *  - supporter_avatar_outputs.qa_payload.{pipeline_version,generation_job_id}
 *  - vocabulário de status de request/job
 */
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
export const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const IMAGE_QUALITY = (process.env.SUPPORTER_AVATAR_IMAGE_QUALITY || 'medium') as 'low' | 'medium' | 'high';
const FIXED_DRIVE_FOLDER = '1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6';
export const MAX_PIPELINE_ATTEMPTS = 4;
const UPLOAD_BUCKET = 'supporter-avatar-uploads';
const OUTPUT_BUCKET = 'supporter-avatar-generated';
const REFERENCE_MAX_EDGE = 1536;
const VISION_MAX_EDGE = 768;

type Json = Record<string, unknown>;
type SourceRow = { id: string; storage_path: string; mime_type: string; file_size_bytes: number };
type CandidateMeta = {
  slug: string; label: string; wardrobe: string; prop: string; prompt_hint: string | null;
  drive_folder_id: string; drive_file_id: string | null; drive_file_name: string; drive_download_url: string; sort_order: number;
};
type Loaded = { bytes: Buffer; mime: string };
export interface SupporterAvatarJobData { requestId: string; jobId: string; dispatchToken: string }
export interface PipelineResult { ok: boolean; status: string; outputs?: Array<{ platform: string; width: number; height: number; qa_pass: boolean }>; timings_ms?: Record<string, number>; reason?: string }

export class TransientPipelineError extends Error { transient = true as const; }

const sha256 = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const safeDetail = (value: unknown, max = 300) => String(value instanceof Error ? value.message : value || 'unknown').replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, max);
const clamp = (value: unknown, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback; };
const nowIso = () => new Date().toISOString();
export function isTransientMessage(message: string) {
  return /429|5\d\d|abort|timeout|network|fetch failed|temporar|provider_http|ECONN|EAI_AGAIN|rate.?limit|openai_image_error|openai_image_download_error|candidate_asset|storage/i.test(message);
}

function openAIKey() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('openai_image_provider_not_configured');
  return key;
}

async function fetchTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
}
async function requestWithRetry(url: string, init: RequestInit, ms: number, attempts = 2) {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchTimeout(url, init, ms);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      last = new Error(`provider_http_${response.status}`);
    } catch (error) { last = error; }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 900 * attempt));
  }
  throw last instanceof Error ? last : new Error('provider_request_failed');
}

async function updateRequest(requestId: string, values: Json) {
  const { error } = await supabase.from('supporter_avatar_requests').update({ ...values, updated_at: nowIso() }).eq('id', requestId);
  if (error) throw error;
}
async function updateJob(jobId: string, values: Json) {
  const { error } = await supabase.from('supporter_avatar_jobs').update(values).eq('id', jobId);
  if (error) throw error;
}

/* ---------- referências ---------- */

async function downscale(bytes: Buffer, maxEdge: number, quality = 88) {
  const out = await sharp(bytes).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  return { bytes: out, mime: 'image/jpeg' } as Loaded;
}

async function loadSource(source: SourceRow): Promise<Loaded> {
  const { data, error } = await supabase.storage.from(UPLOAD_BUCKET).download(source.storage_path);
  if (error || !data) throw new TransientPipelineError(`storage_download_failed:${safeDetail(error?.message || 'empty', 120)}`);
  return downscale(Buffer.from(await data.arrayBuffer()), REFERENCE_MAX_EDGE);
}

const candidateCache = new Map<string, { loaded: Loaded; expiresAt: number }>();
const CANDIDATE_CACHE_MS = 6 * 3600_000;

async function loadCandidate(candidate: CandidateMeta): Promise<Loaded> {
  const key = candidate.drive_file_id || candidate.drive_download_url;
  const cached = candidateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.loaded;
  const urls = [
    candidate.drive_download_url,
    candidate.drive_file_id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(candidate.drive_file_id)}` : '',
    candidate.drive_file_id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(candidate.drive_file_id)}&sz=w2048` : '',
  ].filter(Boolean);
  let lastReason = 'candidate_asset_unavailable';
  for (const url of urls) {
    try {
      const response = await requestWithRetry(url, { redirect: 'follow', headers: { 'User-Agent': `${SUPPORTER_PHOTO_AGENT_NAME}/8.0` } }, 45_000, 2);
      if (!response.ok) { lastReason = `candidate_asset_http_${response.status}`; continue; }
      const mime = (response.headers.get('content-type') || '').split(';')[0]?.toLowerCase() || '';
      if (!/^image\/(jpeg|png|webp)$/.test(mime)) { lastReason = `candidate_asset_invalid_mime:${mime || 'missing'}`; continue; }
      const raw = Buffer.from(await response.arrayBuffer());
      if (!raw.length || raw.length > 15 * 1024 * 1024) { lastReason = `candidate_asset_size_invalid:${raw.length}`; continue; }
      const loaded = await downscale(raw, REFERENCE_MAX_EDGE, 92);
      candidateCache.set(key, { loaded, expiresAt: Date.now() + CANDIDATE_CACHE_MS });
      return loaded;
    } catch (error) { lastReason = safeDetail(error); }
  }
  throw new TransientPipelineError(lastReason);
}

async function candidateMetadata(): Promise<CandidateMeta[]> {
  const { data, error } = await supabase.from('supporter_avatar_candidate_presets')
    .select('slug,label,wardrobe,prop,prompt_hint,drive_folder_id,drive_file_id,drive_file_name,drive_download_url,sort_order')
    .eq('is_active', true).eq('drive_folder_id', FIXED_DRIVE_FOLDER).order('sort_order', { ascending: true });
  if (error) throw new TransientPipelineError(`candidate_presets_unavailable:${safeDetail(error.message, 120)}`);
  const rows = (data || []) as CandidateMeta[];
  if (!rows.length) throw new Error('candidate_gallery_empty');
  return rows;
}

/** Fallback determinístico, sem expor a galeria: sem taco > frontal > roupa compatível com o estilo. */
export function fallbackCandidateIndex(candidates: CandidateMeta[], style: string) {
  const formal = ['premium', 'institucional', 'dark'].includes(style);
  return candidates.map((candidate, index) => {
    let score = 0;
    if (candidate.prop === 'sem-taco') score += 50;
    if (/frontal/i.test(candidate.label)) score += 30;
    if (formal && candidate.wardrobe === 'terno') score += 15;
    if (!formal && candidate.wardrobe === 'camisa-1470') score += 15;
    score -= Number(candidate.sort_order || 0) / 100;
    return { index, score };
  }).sort((a, b) => b.score - a.score)[0]?.index ?? 0;
}

/* ---------- visão (OpenAI Responses API, saída estruturada) ---------- */

const SELECTOR_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    usable: { type: 'boolean' }, supporter_index: { type: 'integer' }, face_count: { type: 'integer' }, face_quality_score: { type: 'integer' },
    candidate_index: { type: 'integer' }, scene: { type: 'string', enum: ['institucional-oficial', 'gente-da-nossa-terra', 'construindo-o-futuro'] },
    composition_plan: { type: 'string' }, technical_notes: { type: 'string' },
  },
  required: ['usable', 'supporter_index', 'face_count', 'face_quality_score', 'candidate_index', 'scene', 'composition_plan', 'technical_notes'],
} as const;

const QA_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    supporter_fidelity_score: { type: 'integer' }, candidate_reference_fidelity_score: { type: 'integer' }, anatomy_score: { type: 'integer' },
    human_texture_score: { type: 'integer' }, lighting_consistency_score: { type: 'integer' }, face_count: { type: 'integer' }, text_detected: { type: 'boolean' },
    artifacts: { type: 'array', items: { type: 'string' } }, remediation: { type: 'array', items: { type: 'string' } },
  },
  required: ['supporter_fidelity_score', 'candidate_reference_fidelity_score', 'anatomy_score', 'human_texture_score', 'lighting_consistency_score', 'face_count', 'text_detected', 'artifacts', 'remediation'],
} as const;

async function visionJson<T>(prompt: string, images: Loaded[], schemaName: string, schema: Record<string, unknown>, key: string): Promise<T> {
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: prompt }];
  for (const image of images) {
    const small = await downscale(image.bytes, VISION_MAX_EDGE, 80);
    content.push({ type: 'input_image', image_url: `data:${small.mime};base64,${small.bytes.toString('base64')}`, detail: 'low' });
  }
  const response = await requestWithRetry('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_VISION_MODEL, input: [{ role: 'user', content }], text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } }, max_output_tokens: 600 }),
  }, 60_000, 2);
  const payload = await response.json().catch(() => ({})) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`vision_http_${response.status}:${safeDetail(payload?.error?.message, 160)}`);
  const text = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('') || '';
  if (!text) throw new Error('vision_empty_output');
  return JSON.parse(text) as T;
}

type Selection = { usable: boolean; supporter_index: number; face_count: number; face_quality_score: number; candidate_index: number; scene: string; composition_plan: string; technical_notes: string };
type QaResult = { supporter_fidelity_score: number; candidate_reference_fidelity_score: number; anatomy_score: number; human_texture_score: number; lighting_consistency_score: number; face_count: number; text_detected: boolean; artifacts: string[]; remediation: string[] };

export function qaVerdict(qa: QaResult | null) {
  if (!qa) return false;
  return qa.face_count === 2
    && clamp(qa.supporter_fidelity_score) >= 70
    && clamp(qa.candidate_reference_fidelity_score) >= 70
    && clamp(qa.anatomy_score) >= 70
    && qa.text_detected !== true;
}

/* ---------- geração ---------- */

async function generateMaster(supporter: Loaded, candidate: Loaded, prompt: string, key: string) {
  const send = async (withFidelity: boolean) => {
    const form = new FormData();
    form.set('model', OPENAI_IMAGE_MODEL);
    form.set('prompt', prompt);
    form.set('size', MASTER_SIZE.openai);
    form.set('quality', IMAGE_QUALITY);
    form.set('output_format', 'png');
    if (withFidelity) form.set('input_fidelity', 'high');
    form.append('image[]', new Blob([new Uint8Array(supporter.bytes)], { type: supporter.mime }), '01-supporter.jpg');
    form.append('image[]', new Blob([new Uint8Array(candidate.bytes)], { type: candidate.mime }), '02-candidate.jpg');
    const response = await requestWithRetry('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form }, 180_000, 2);
    const payload = await response.json().catch(() => ({})) as { data?: Array<{ b64_json?: string; url?: string }>; usage?: unknown; error?: { message?: string } };
    return { response, payload };
  };
  let result = await send(true);
  if (!result.response.ok && result.response.status === 400 && /input_fidelity|unknown parameter|unsupported/i.test(String(result.payload?.error?.message || ''))) result = await send(false);
  if (!result.response.ok) {
    const message = `openai_image_error:${result.response.status}:${safeDetail(result.payload?.error?.message)}`;
    if (result.response.status === 429 || result.response.status >= 500) throw new TransientPipelineError(message);
    throw new Error(message);
  }
  const first = result.payload?.data?.[0];
  if (first?.b64_json) return { bytes: Buffer.from(first.b64_json, 'base64'), usage: result.payload?.usage ?? null };
  if (first?.url) {
    const download = await requestWithRetry(first.url, {}, 60_000, 2);
    if (!download.ok) throw new TransientPipelineError(`openai_image_download_error:${download.status}`);
    return { bytes: Buffer.from(await download.arrayBuffer()), usage: result.payload?.usage ?? null };
  }
  throw new Error('openai_image_missing_output');
}

/* ---------- pipeline ---------- */

export async function processSupporterAvatarJob(data: SupporterAvatarJobData, attempt: number): Promise<PipelineResult> {
  const { requestId, jobId, dispatchToken } = data;
  const started = Date.now();
  const timings: Record<string, number> = {};
  const mark = (label: string, from: number) => { timings[label] = Date.now() - from; };

  const { data: job, error: jobError } = await supabase.from('supporter_avatar_jobs').select('*').eq('id', jobId).eq('request_id', requestId).maybeSingle();
  if (jobError) throw new TransientPipelineError(`job_lookup_failed:${safeDetail(jobError.message, 120)}`);
  if (!job) return { ok: false, status: 'job_not_found' };
  const expectedHash = String((job.input_payload as Json | null)?.dispatch_token_hash || '');
  if (!expectedHash || sha256(dispatchToken) !== expectedHash) return { ok: false, status: 'invalid_dispatch_token' };
  if (job.status === 'completed') return { ok: true, status: 'completed' };

  const { data: claimed, error: claimError } = await supabase.rpc('claim_supporter_avatar_generation_attempt', { p_request_id: requestId, p_job_id: jobId, p_attempt: attempt });
  if (claimError) throw new TransientPipelineError(`claim_failed:${safeDetail(claimError.message, 120)}`);
  if (claimed !== true) return { ok: true, status: 'superseded' };

  try {
    const { data: request, error: requestError } = await supabase.from('supporter_avatar_requests').select('*').eq('id', requestId).single();
    if (requestError || !request) throw new Error('request_not_found');
    if (!request.consent_image_use || !request.consent_terms) throw new Error('required_consent_missing');
    const key = openAIKey();

    await updateRequest(requestId, { status: 'analyzing', pipeline_version: PIPELINE_VERSION, supporter_approved_at: null, completed_at: null });
    const { data: sourceRows, error: sourceError } = await supabase.from('supporter_avatar_sources').select('id,storage_path,mime_type,file_size_bytes').eq('request_id', requestId).order('created_at', { ascending: true }).limit(3);
    if (sourceError) throw new TransientPipelineError(`sources_unavailable:${safeDetail(sourceError.message, 120)}`);
    const sources = (sourceRows || []) as SourceRow[];
    if (!sources.length) throw new Error('no_source_images');

    // 1) carregar referências em paralelo (apoiador + galeria privada)
    const t0 = Date.now();
    const candidates = await candidateMetadata();
    const shortlist = candidates.slice(0, 5);
    const [supporterImages, candidateImages] = await Promise.all([
      Promise.all(sources.map(loadSource)),
      Promise.all(shortlist.map((candidate) => loadCandidate(candidate).catch(() => null))),
    ]);
    mark('load_references', t0);

    // 2) uma chamada de visão: melhor foto do apoiador + referência do candidato + cenário
    const t1 = Date.now();
    const style = String(request.style || 'premium');
    let selection: Selection;
    let degraded = false;
    try {
      const visionInputs: Loaded[] = [...supporterImages, ...candidateImages.filter((image): image is Loaded => Boolean(image))];
      const availableCandidates = shortlist.filter((_, index) => candidateImages[index]);
      const descriptions = availableCandidates.map((candidate, index) => `CANDIDATO ${index}: roupa=${candidate.wardrobe}; taco=${candidate.prop}; diretriz=${candidate.prompt_hint || 'preservar referência'}`).join('\n');
      const prompt = `${SELECTOR_PROMPT}\nESTILO: ${style}.\nORDEM: imagens 0..${supporterImages.length - 1} são fotos do apoiador; as seguintes correspondem aos candidatos 0..${availableCandidates.length - 1}.\n${descriptions}`;
      const raw = await visionJson<Selection>(prompt, visionInputs, 'supporter_selection', SELECTOR_SCHEMA, key);
      const supporterIndex = Number.isInteger(raw.supporter_index) && raw.supporter_index >= 0 && raw.supporter_index < supporterImages.length ? raw.supporter_index : 0;
      const shortIndex = Number.isInteger(raw.candidate_index) && raw.candidate_index >= 0 && raw.candidate_index < availableCandidates.length ? raw.candidate_index : 0;
      const chosen = availableCandidates[shortIndex] || availableCandidates[0];
      if (!chosen) throw new Error('candidate_gallery_empty');
      selection = { ...raw, supporter_index: supporterIndex, candidate_index: candidates.indexOf(chosen) };
    } catch (error) {
      degraded = true;
      const firstAvailable = shortlist.findIndex((_, index) => candidateImages[index]);
      const fallback = fallbackCandidateIndex(candidates.filter((_, index) => index < shortlist.length && candidateImages[index]), style);
      selection = { usable: true, supporter_index: 0, face_count: 1, face_quality_score: 60, candidate_index: firstAvailable >= 0 ? (candidates.indexOf(shortlist.filter((_, index) => candidateImages[index])[fallback] || shortlist[firstAvailable]!)) : 0, scene: 'institucional-oficial', composition_plan: 'duas pessoas lado a lado; referência do candidato com área lateral livre; cenário simples', technical_notes: `fallback seguro sem exposição da galeria: ${safeDetail(error, 120)}` };
    }
    mark('vision_selection', t1);
    if (!selection.usable) {
      await updateRequest(requestId, { status: 'needs_input', internal_selection: { photo_intake: selection, pipeline_version: PIPELINE_VERSION } });
      await updateJob(jobId, { status: 'needs_review', error_message: 'supporter_photo_not_usable', output_payload: { pipeline_version: PIPELINE_VERSION, selection }, completed_at: nowIso() });
      return { ok: false, status: 'needs_input', reason: 'supporter_photo_not_usable' };
    }

    const candidateMeta = candidates[selection.candidate_index] || candidates[0]!;
    const candidateImage = candidateImages[candidates.indexOf(candidateMeta)] || await loadCandidate(candidateMeta);
    const supporterImage = supporterImages[selection.supporter_index] || supporterImages[0]!;
    const candidateHasBat = String(candidateMeta.prop || '').includes('com-taco');
    const internalSelection = {
      pipeline_version: PIPELINE_VERSION, supporter_source_index: selection.supporter_index, selected_candidate_slug: candidateMeta.slug,
      scene: selection.scene, composition_plan: selection.composition_plan, face_count: selection.face_count, degraded, autonomous_recovery: true,
    };
    await updateRequest(requestId, { status: 'candidate_selected', candidate_preset_slug: candidateMeta.slug, internal_selection: internalSelection });

    // 3) UMA geração de imagem, sem texto
    const t2 = Date.now();
    await updateRequest(requestId, { status: 'generating' });
    const prompt = buildCompositionPrompt({ candidatePresetLabel: candidateMeta.label, candidatePresetHint: candidateMeta.prompt_hint, candidateHasBat, scene: selection.scene, compositionPlan: selection.composition_plan });
    const master = await generateMaster(supporterImage, candidateImage, prompt, key);
    mark('image_generation', t2);

    // 4) renderização vetorial dos 3 formatos + master (local, < 1 s)
    const t3 = Date.now();
    await updateRequest(requestId, { status: 'qa' });
    const pack = await renderSupporterPack(master.bytes);
    const masterJpeg = await sharp(master.bytes).jpeg({ quality: 92 }).toBuffer();
    mark('render', t3);

    // 5) QA advisory (uma chamada). Falha do provedor não é aprovação: vira revisão.
    const t4 = Date.now();
    let qa: QaResult | null = null;
    let qaProviderError = '';
    try {
      qa = await visionJson<QaResult>(`${QA_PROMPT}\nA referência do candidato ${candidateHasBat ? 'CONTÉM' : 'NÃO CONTÉM'} taco.`, [supporterImage, candidateImage, { bytes: masterJpeg, mime: 'image/jpeg' }], 'quality_auditor', QA_SCHEMA, key);
    } catch (error) { qaProviderError = safeDetail(error, 200); }
    const passed = qaVerdict(qa);
    mark('qa', t4);

    // 6) persistir saídas (master + 3 formatos) - uma vez por job (índice único v8)
    const { data: currentAttempt } = await supabase.from('supporter_avatar_jobs').select('attempts,status').eq('id', jobId).single();
    if (Number(currentAttempt?.attempts || 0) !== attempt || currentAttempt?.status !== 'running') return { ok: true, status: 'superseded' };
    const t5 = Date.now();
    const qaPayloadBase = {
      ...(qa || { artifacts: ['qa_provider_unavailable'], remediation: ['reexecutar QA quando o provedor estiver disponível'] }),
      pass: passed, agent: SUPPORTER_PHOTO_AGENT_NAME, pipeline_version: PIPELINE_VERSION, render_version: RENDER_VERSION, generation_job_id: jobId,
      autonomous_recovery: true, scene: selection.scene, openai_usage: master.usage, candidate_reference_internal: candidateMeta.slug,
      supporter_source_internal_index: selection.supporter_index, qa_provider_error: qaProviderError || null, image_quality: IMAGE_QUALITY,
    };
    const files: Array<{ platform: string; width: number; height: number; bytes: Buffer; mime: string }> = [
      { platform: 'master', width: MASTER_SIZE.width, height: MASTER_SIZE.height, bytes: masterJpeg, mime: 'image/jpeg' },
      ...pack.map((item) => ({ platform: item.key, width: item.width, height: item.height, bytes: item.bytes, mime: item.mime })),
    ];
    const stored: Array<{ platform: string; width: number; height: number; qa_pass: boolean }> = [];
    for (const file of files) {
      const path = `${requestId}/${file.platform}-${file.width}x${file.height}-${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from(OUTPUT_BUCKET).upload(path, file.bytes, { contentType: file.mime, upsert: false, cacheControl: '31536000' });
      if (uploadError) throw new TransientPipelineError(`storage_upload_failed:${safeDetail(uploadError.message, 120)}`);
      const { error: insertError } = await supabase.from('supporter_avatar_outputs').insert({
        request_id: requestId, platform: file.platform, width: file.width, height: file.height, storage_path: path, mime_type: file.mime,
        model: OPENAI_IMAGE_MODEL, prompt_version: SUPPORTER_AVATAR_PROMPT_VERSION,
        qa_score: qa ? clamp(qa.supporter_fidelity_score) : null,
        qa_payload: { ...qaPayloadBase, exact_output: `${file.width}x${file.height}` },
      });
      if (insertError) {
        await supabase.storage.from(OUTPUT_BUCKET).remove([path]);
        if (!String(insertError.message || '').toLowerCase().includes('duplicate')) throw new TransientPipelineError(`output_insert_failed:${safeDetail(insertError.message, 120)}`);
      }
      if (file.platform !== 'master') stored.push({ platform: file.platform, width: file.width, height: file.height, qa_pass: passed });
    }
    mark('persist', t5);

    const { error: countError } = await supabase.rpc('record_supporter_avatar_generation_result', { p_request_id: requestId, p_job_id: jobId });
    if (countError) throw new TransientPipelineError(`generation_count_failed:${safeDetail(countError.message, 120)}`);
    timings.total = Date.now() - started;

    const finalStatus = passed ? 'completed' : 'needs_review';
    await updateRequest(requestId, { status: finalStatus, completed_at: passed ? nowIso() : null, pipeline_version: PIPELINE_VERSION });
    await updateJob(jobId, {
      status: finalStatus, stage: PIPELINE_VERSION, model: OPENAI_IMAGE_MODEL,
      error_message: passed ? null : 'qa_threshold_not_met_or_qa_provider_pending',
      output_payload: { pipeline_version: PIPELINE_VERSION, render_version: RENDER_VERSION, outputs: stored, qa_pass: passed, autonomous_recovery: true, technical_retries_are_free: true, scene: selection.scene, degraded_selection: degraded, timings_ms: timings, runtime: 'vps' },
      completed_at: nowIso(),
    });
    return { ok: true, status: finalStatus, outputs: stored, timings_ms: timings };
  } catch (error) {
    const message = safeDetail(error, 500);
    const transient = error instanceof TransientPipelineError || isTransientMessage(message);
    console.error('[supporter-avatar]', requestId, jobId, `attempt=${attempt}`, message);
    if (transient && attempt < MAX_PIPELINE_ATTEMPTS) {
      await updateRequest(requestId, { status: 'retry', pipeline_version: PIPELINE_VERSION }).catch(() => undefined);
      await updateJob(jobId, { status: 'retry', stage: PIPELINE_VERSION, attempts: attempt, error_message: `autonomous_retry:${message.slice(0, 430)}` }).catch(() => undefined);
      throw error; // BullMQ reexecuta com backoff exponencial; a próxima tentativa reclama attempt+1
    }
    const requestStatus = /no_source_images|supporter_photo_not_usable|required_consent/i.test(message) ? 'needs_input' : 'needs_review';
    await updateRequest(requestId, { status: requestStatus, pipeline_version: PIPELINE_VERSION }).catch(() => undefined);
    await updateJob(jobId, { status: 'needs_review', stage: PIPELINE_VERSION, attempts: attempt, error_message: message, completed_at: nowIso() }).catch(() => undefined);
    return { ok: false, status: requestStatus, reason: message.slice(0, 240) };
  }
}

export const SUPPORTER_OUTPUT_CONTRACT = Object.entries(SUPPORTER_OUTPUTS).map(([key, spec]) => ({ platform: key as SupporterOutputKey, width: spec.width, height: spec.height }));
