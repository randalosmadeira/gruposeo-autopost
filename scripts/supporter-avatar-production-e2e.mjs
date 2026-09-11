import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const edgeRoot = String(process.env.SUPPORTER_E2E_EDGE_ROOT || 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1').replace(/\/$/, '');
const publicUrl = `${edgeRoot}/supporter-avatar-public-v2`;
const approveUrl = `${edgeRoot}/approve-supporter-avatar-final`;
const fixturePath = resolve(String(process.env.SUPPORTER_E2E_FIXTURE || ''));
const timeoutMs = Number(process.env.SUPPORTER_E2E_TIMEOUT_MS || 12 * 60 * 1000);
const pollMs = Number(process.env.SUPPORTER_E2E_POLL_MS || 5000);
const testRegeneration = process.env.SUPPORTER_E2E_REGENERATE === 'true';
const expectedPipeline = 'supporter-avatar-resumable-v7';
const expectedDisclosure = 'Imagem gerada por IA - Campanha Oficial';
const expectedOutputs = new Map([
  ['square', [1080, 1080]],
  ['portrait', [1080, 1350]],
  ['landscape', [1200, 630]],
]);

if (!process.env.SUPPORTER_E2E_FIXTURE) {
  throw new Error('SUPPORTER_E2E_FIXTURE is required and must point to a synthetic PNG fixture.');
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 60_000) throw new Error('SUPPORTER_E2E_TIMEOUT_MS must be at least 60000.');
if (!Number.isFinite(pollMs) || pollMs < 1000) throw new Error('SUPPORTER_E2E_POLL_MS must be at least 1000.');

const startedAt = Date.now();
const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
let session = null;

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, elapsedMs: Date.now() - startedAt, ...fields })}\n`);
}

async function post(url, body, expectedStatuses = [200]) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'zica-supporter-e2e/1.0' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`HTTP ${response.status}: ${String(payload.error || payload.detail || 'unexpected_response')}`);
  }
  return { status: response.status, payload };
}

async function assertDownload(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`${label}_download_http_${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!contentType.startsWith('image/')) throw new Error(`${label}_invalid_content_type:${contentType}`);
  if (bytes.byteLength < 10_000) throw new Error(`${label}_image_too_small:${bytes.byteLength}`);
  return { contentType, bytes: bytes.byteLength };
}

async function waitForTerminal(generation) {
  const deadline = Date.now() + timeoutMs;
  let previous = '';
  while (Date.now() < deadline) {
    const { payload } = await post(publicUrl, { action: 'status', requestId: session.requestId, token: session.token });
    const status = String(payload.request?.status || 'unknown');
    const stage = String(payload.job?.stage || 'none');
    const signature = `${status}:${stage}:${payload.outputs?.length || 0}`;
    if (signature !== previous) {
      log('generation_status', { generation, status, stage, outputCount: payload.outputs?.length || 0 });
      previous = signature;
    }
    if (status === 'completed') return payload;
    if (status === 'needs_review' && Array.isArray(payload.outputs) && payload.outputs.length === expectedOutputs.size) return payload;
    if (status === 'failed' || status === 'needs_review') {
      throw new Error(`generation_${generation}_${status}:${stage}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
  }
  throw new Error(`generation_${generation}_timeout`);
}

function assertOutputContract(outputs) {
  if (!Array.isArray(outputs)) throw new Error('outputs_missing');
  for (const [platform, dimensions] of expectedOutputs) {
    const output = outputs.find((item) => item.platform === platform);
    if (!output) throw new Error(`output_missing:${platform}`);
    if (output.width !== dimensions[0] || output.height !== dimensions[1]) {
      throw new Error(`output_dimensions_invalid:${platform}:${output.width}x${output.height}`);
    }
    if (typeof output.url !== 'string' || !output.url.startsWith('https://')) throw new Error(`output_url_invalid:${platform}`);
  }
}

try {
  const fixtureInfo = await stat(fixturePath);
  if (!fixtureInfo.isFile() || fixtureInfo.size < 10_000 || fixtureInfo.size > 10 * 1024 * 1024) {
    throw new Error(`fixture_size_invalid:${fixtureInfo.size}`);
  }
  const fixture = await readFile(fixturePath);
  log('fixture_ready', { filename: basename(fixturePath), bytes: fixture.byteLength });

  const capabilities = await post(publicUrl, { action: 'capabilities' });
  if (capabilities.payload.pipeline !== expectedPipeline || capabilities.payload.resumable !== true) {
    throw new Error(`capabilities_invalid:${String(capabilities.payload.pipeline)}`);
  }
  log('capabilities_ok', { pipeline: capabilities.payload.pipeline });

  const created = await post(publicUrl, {
    action: 'create',
    supporterName: 'Apoiador Sintetico E2E',
    email: `zica-e2e-${runId}@example.invalid`,
    whatsapp: '11999999999',
    city: 'Sao Paulo',
    state: 'SP',
    style: 'premium',
    supportText: 'EU APOIO DR. MADEIRA 1470',
    consentImageUse: true,
    consentTerms: true,
    consentPublicGallery: false,
  }, [201]);
  session = { requestId: created.payload.requestId, token: created.payload.token };
  if (!session.requestId || !session.token) throw new Error('create_session_missing');
  log('request_created', { requestId: session.requestId, status: created.payload.status });

  const upload = await post(publicUrl, {
    action: 'upload-url', requestId: session.requestId, token: session.token,
    mimeType: 'image/png', fileSize: fixture.byteLength,
  });
  if (!upload.payload.signedUrl || !upload.payload.path) throw new Error('signed_upload_missing');
  const uploadResponse = await fetch(upload.payload.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' },
    body: fixture,
    signal: AbortSignal.timeout(90_000),
  });
  if (!uploadResponse.ok) throw new Error(`signed_upload_http_${uploadResponse.status}:${(await uploadResponse.text()).slice(0, 160)}`);
  await post(publicUrl, {
    action: 'register-upload', requestId: session.requestId, token: session.token,
    path: upload.payload.path, mimeType: 'image/png', fileSize: fixture.byteLength,
  });
  log('upload_registered', { bytes: fixture.byteLength });

  const submitted = await post(publicUrl, { action: 'submit', requestId: session.requestId, token: session.token }, [200, 202]);
  log('generation_submitted', { status: submitted.payload.status });
  let completed = await waitForTerminal(1);
  assertOutputContract(completed.outputs);
  for (const output of completed.outputs) {
    const downloaded = await assertDownload(output.url, `preview_${output.platform}`);
    log('preview_verified', { platform: output.platform, ...downloaded });
  }

  const approved = await post(approveUrl, { requestId: session.requestId, token: session.token });
  if (approved.payload.disclosure !== expectedDisclosure || approved.payload.deliveryMode !== 'social-pack-3') {
    throw new Error('approval_contract_invalid');
  }
  assertOutputContract(approved.payload.outputs);
  for (const output of approved.payload.outputs) {
    const downloaded = await assertDownload(output.url, `final_${output.platform}`);
    log('final_verified', { platform: output.platform, ...downloaded });
  }
  log('approval_ok', { approvedAt: approved.payload.approvedAt });

  if (testRegeneration) {
    const previousGenerationCount = Number(completed.request?.generation_count || 0);
    const regenerated = await post(publicUrl, { action: 'regenerate', requestId: session.requestId, token: session.token }, [200, 202]);
    log('regeneration_submitted', { status: regenerated.payload.status, previousGenerationCount });
    completed = await waitForTerminal(2);
    if (Number(completed.request?.generation_count || 0) <= previousGenerationCount) {
      throw new Error('regeneration_counter_not_incremented');
    }
    assertOutputContract(completed.outputs);
    log('regeneration_ok', { generationCount: completed.request.generation_count });
  }

  log('e2e_passed', { requestId: session.requestId, pipeline: expectedPipeline });
} finally {
  if (session?.requestId && session?.token) {
    let cleanupError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const deleted = await post(publicUrl, { action: 'delete', requestId: session.requestId, token: session.token });
        log('cleanup_complete', { requestId: session.requestId, deleted: deleted.payload.deleted === true, attempt });
        cleanupError = null;
        break;
      } catch (error) {
        cleanupError = error;
        if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000 * attempt));
      }
    }
    if (cleanupError) {
      log('cleanup_failed', { requestId: session.requestId, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
      process.exitCode = 2;
    }
  }
}
