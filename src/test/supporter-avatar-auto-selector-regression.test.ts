import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const mainEntry = read('src/main.tsx');
const app = read('src/App.tsx');
const indexHtml = read('index.html');
const ui = read('src/pages/SupporterAvatar1470V2.tsx');
const publicApi = read('supabase/functions/supporter-avatar-public-v2/index.ts');
const legacyProxy = read('supabase/functions/supporter-avatar-public/index.ts');
// Desde 2026-09-25 o gerador roda no orquestrador da VPS (pipeline v8).
const generator = read('services/zica-orchestrator/src/supporter-avatar/pipeline.ts');
const candidateAssets = read('supabase/functions/supporter-avatar-candidate-assets/index.ts');
const prompts = read('supabase/functions/_shared/supporter-avatar-prompt.ts');
const stateMigration = read('supabase/migrations/20260902173000_supporter_avatar_auto_selector_pipeline.sql');
const autonomyMigration = read('supabase/migrations/20260903174000_supporter_avatar_autonomy_v3.sql');

const runtime = [ui, publicApi, generator, candidateAssets, prompts].join('\n');

describe('Supporter Avatar 1470 autonomous auto-selector regressions (pipeline VPS v8)', () => {
  it('0. hard-pins public routes to the V2 UI while the backend pipeline evolves independently', () => {
    expect(mainEntry).toContain('import("./pages/SupporterAvatar1470V2")');
    expect(mainEntry).not.toContain('import("./pages/SupporterAvatar1470")');
    expect(app).toContain('import("./pages/SupporterAvatar1470V2")');
    expect(app).toContain('<Route path="/1470" element={<SupporterAvatar1470 />} />');
    expect(app).toContain('<Route path="/apoiadores" element={<SupporterAvatar1470 />} />');
    expect(app).toContain('<Route path="/apoiadores/avatar" element={<SupporterAvatar1470 />} />');
    expect(existsSync(resolve(root, 'src/pages/SupporterAvatar1470.tsx'))).toBe(false);
    expect(indexHtml).toContain('name="zica-supporter-flow" content="supporter-avatar-public-v2"');
  });

  it('1. never requires candidatePresetSlug from the supporter', () => {
    expect(ui).not.toContain('candidatePresetSlug');
    expect(publicApi).not.toContain('candidatePresetSlug');
    expect(publicApi).toContain('candidate_preset_slug: null');
  });

  it('2. supports 1, 2 or 3 supporter photos and caps public upload at 3', () => {
    expect(ui).toContain('.slice(0, 3)');
    expect(publicApi).toContain('(count || 0) >= 3');
    expect(publicApi).toContain('maxSourceImages: 3');
    expect(generator).toContain(".order('created_at', { ascending: true }).limit(3)");
  });

  it('3. keeps candidate gallery inaccessible to anonymous public users', () => {
    expect(candidateAssets).toContain('requireCeo');
    expect(candidateAssets).toContain('ceo_access_required');
    expect(ui).not.toContain('supporter-avatar-candidate-assets');
  });

  it('4. never exposes candidate URLs, Drive IDs or preset infrastructure to the public response', () => {
    const statusBlock = publicApi.slice(publicApi.indexOf('if (action === "status")'));
    expect(statusBlock).not.toContain('drive_file_id');
    expect(statusBlock).not.toContain('drive_download_url');
    expect(statusBlock).toContain('candidateSelection: "automatic-private"');
    expect(prompts).toContain('Nunca exponha URL, ID, nome de arquivo ou caminho');
  });

  it('5. performs private automatic selection in one vision call with a deterministic fallback', () => {
    expect(generator).toContain('SELECTOR_PROMPT');
    expect(generator).toContain('fallbackCandidateIndex');
    expect(generator).toContain('fallback seguro sem exposição da galeria');
    expect(generator).toContain('visionShortlist');
    expect(generator).toContain("candidate.prop === 'com-taco'");
    expect(generator).toContain('qaNeedsRegeneration');
    expect(prompts).toContain('PHOTO INTAKE + CANDIDATE SELECTOR');
  });

  it('6. enforces dual identity preservation without face swap or beautification', () => {
    expect(prompts).toContain('IDENTITY GUARDIAN AGENT');
    expect(prompts).toContain('Não embeleze');
    expect(prompts).toContain('Não use face swap');
    expect(generator).toContain('supporter_fidelity_score');
    expect(generator).toContain('candidate_reference_fidelity_score');
  });

  it('7. has bounded infrastructure retries serialized by the claim RPC', () => {
    expect(generator).toContain('MAX_PIPELINE_ATTEMPTS = 4');
    expect(generator).toContain("rpc('claim_supporter_avatar_generation_attempt'");
    expect(generator).toContain("status: 'superseded'");
    expect(generator).toContain("status: 'retry'");
    expect(generator).toContain('attempt < MAX_PIPELINE_ATTEMPTS');
    expect(publicApi).toContain('dispatch_retry_');
  });

  it('8. treats timeout, HTTP 429 and HTTP 5xx as recoverable infrastructure conditions', () => {
    expect(generator).toContain('AbortController');
    expect(generator).toMatch(/abort\|timeout/i);
    expect(generator).toContain('response.status !== 429');
    expect(generator).toMatch(/5\\d\\d/);
    expect(generator).toContain('TransientPipelineError');
  });

  it('9. technical failures do not consume a public generation before an output exists', () => {
    expect(autonomyMigration).toContain('technical_retries_are_free');
    expect(autonomyMigration).toContain('record_supporter_avatar_generation_result');
    expect(generator).toContain("rpc('record_supporter_avatar_generation_result'");
    expect(generator.indexOf("rpc('record_supporter_avatar_generation_result'")).toBeGreaterThan(generator.indexOf("from(OUTPUT_BUCKET).upload("));
  });

  it('10. vision analysis uses downscaled references plus strict structured outputs', () => {
    expect(generator).toContain("type: 'json_schema'");
    expect(generator).toContain('strict: true');
    expect(generator).toContain('VISION_MAX_EDGE');
    expect(generator).toContain('SELECTOR_SCHEMA');
    expect(generator).toContain('QA_SCHEMA');
  });

  it('11. unusable supporter photos go back to needs_input instead of a terminal failure', () => {
    expect(generator).toContain('if (!selection.usable)');
    expect(generator).toContain("error_message: 'supporter_photo_not_usable'");
    expect(generator).toContain("status: 'needs_input'");
  });

  it('12. stores master plus the three formats under the same job with an idempotent unique index', () => {
    expect(generator).toContain("platform: 'master'");
    expect(generator).toContain('generation_job_id: jobId');
    expect(generator).toContain('pipeline_version: PIPELINE_VERSION');
    expect(generator).toContain("includes('duplicate')");
  });

  it('13. produces whatsapp, instagram and story outputs only', () => {
    expect(prompts).toContain('whatsapp: {');
    expect(prompts).toContain('instagram: {');
    expect(prompts).toContain('story: {');
    expect(prompts).toContain('exactHeight: 1920');
    expect(prompts).not.toContain('exactHeight: 630');
    expect(prompts).not.toContain('landscape');
  });

  it('14. contains no legacy dispatch in the active runtime', () => {
    expect(runtime.toLowerCase()).not.toContain('legacy_dispatch');
    expect(runtime.toLowerCase()).not.toContain('legacy-dispatch');
    expect(legacyProxy).toContain('supporter-avatar-public-v2');
  });

  it('15. public UI contains no candidate gallery/error copy', () => {
    expect(ui).not.toContain('Fotos oficiais indisponíveis');
    expect(ui).not.toContain('Escolha uma foto oficial');
    expect(ui).not.toContain('Escolha a foto oficial');
    expect(ui).not.toContain('PRESETS_URL');
  });

  it('16. validates Drive asset MIME before generation and caches the private gallery in memory', () => {
    expect(generator).toContain('candidate_asset_invalid_mime');
    expect(generator).toContain('candidateCache');
    expect(generator).toContain('CANDIDATE_CACHE_MS');
  });

  it('17. uses high image input fidelity when supported and transparently retries without the optional parameter if rejected', () => {
    expect(generator).toContain("form.set('input_fidelity', 'high')");
    expect(generator).toMatch(/input_fidelity\|unknown parameter\|unsupported/);
  });

  it('18. distinguishes generated-but-pending-QA from a terminal pipeline crash', () => {
    expect(generator).toContain('qa_provider_unavailable');
    expect(generator).toContain("const finalStatus = passed ? 'completed' : 'needs_review'");
    expect(generator).toContain('qa_threshold_not_met_or_qa_provider_pending');
  });

  it('19. preserves candidate attire, bat integrity and safe synthetic scenes, without any text inside the image', () => {
    expect(prompts).toContain('taco preto de beisebol');
    expect(prompts).toContain('Preserve integralmente o vestuário');
    expect(prompts).toContain('institucional-oficial');
    expect(prompts).toContain('PROIBIDO ADICIONAR: qualquer texto');
    expect(prompts).toContain('WARDROBE GUARDIAN AGENT');
    expect(prompts).not.toContain('Imagem gerada por IA - Campanha Oficial');
  });

  it('20. preserves the durable request-state vocabulary', () => {
    for (const state of ['uploaded','analyzing','candidate_selected','generating','qa','retry','regenerate','needs_input','needs_review','completed','failed']) {
      expect(stateMigration).toContain(`'${state}'::text`);
    }
  });
});
