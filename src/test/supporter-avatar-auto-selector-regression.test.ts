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
const generator = read('supabase/functions/generate-supporter-avatar/index.ts');
const candidateAssets = read('supabase/functions/supporter-avatar-candidate-assets/index.ts');
const prompts = read('supabase/functions/_shared/supporter-avatar-prompt.ts');
const stateMigration = read('supabase/migrations/20260902173000_supporter_avatar_auto_selector_pipeline.sql');
const autonomyMigration = read('supabase/migrations/20260903174000_supporter_avatar_autonomy_v3.sql');

const runtime = [ui, publicApi, generator, candidateAssets, prompts].join('\n');

describe('Supporter Avatar 1470 autonomous auto-selector v3 regressions', () => {
  it('0. hard-pins public routes to the V2 UI while the backend pipeline evolves independently', () => {
    expect(mainEntry).toContain('import("./pages/SupporterAvatar1470V2")');
    expect(mainEntry).not.toContain('import("./pages/SupporterAvatar1470")');
    expect(app).toContain('import("./pages/SupporterAvatar1470V2")');
    expect(app).toContain('<Route path="/1470" element={<SupporterAvatar1470 />} />');
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
  });

  it('5. performs private automatic selection with a deterministic fallback and runner-up', () => {
    expect(generator).toContain('photoIntakeAgent');
    expect(generator).toContain('candidateSelectorAgent');
    expect(generator).toContain('fallbackCandidate');
    expect(generator).toContain('runnerUpMeta');
    expect(prompts).toContain('CANDIDATE SELECTOR AGENT');
  });

  it('6. enforces dual identity preservation without face swap or beautification', () => {
    expect(prompts).toContain('IDENTITY GUARDIAN AGENT');
    expect(prompts).toContain('Não embeleze');
    expect(prompts).toContain('Não use face swap');
    expect(generator).toContain('supporter_fidelity_score');
    expect(generator).toContain('candidate_reference_fidelity_score');
  });

  it('7. has five bounded infrastructure retries plus three autonomous QA attempts per output', () => {
    expect(generator).toContain('MAX_PIPELINE_ATTEMPTS = 5');
    expect(generator).toContain('MAX_QA_GENERATIONS = 3');
    expect(generator).toContain("status: 'retry'");
    expect(publicApi).toContain('dispatch_retry_');
  });

  it('8. treats timeout, HTTP 429 and HTTP 5xx as recoverable infrastructure conditions', () => {
    expect(generator).toContain('AbortController');
    expect(generator).toMatch(/abort\|timeout/i);
    expect(generator).toContain('response.status !== 429');
    expect(generator).toMatch(/5\\d\\d/);
    expect(generator).toContain('transientError');
  });

  it('9. technical failures do not consume a public generation before an output exists', () => {
    expect(autonomyMigration).toContain('technical_retries_are_free');
    expect(autonomyMigration).toContain('record_supporter_avatar_generation_result');
    expect(generator).toContain('if (producedAnyOutput) await countGenerationResult');
  });

  it('10. vision analysis uses short-lived URLs plus structured outputs instead of resizing all uploads inside Edge', () => {
    expect(generator).toContain('createSignedUrl');
    expect(generator).toContain("type: 'json_schema'");
    expect(generator).toContain("tool_choice: { type: 'tool', name: 'emit_result' }");
    expect(generator).not.toContain('visionImageFromBytes');
  });

  it('11. automatically switches candidate or supporter reference after identity QA drift', () => {
    expect(generator).toContain('trocar automaticamente para referência reserva do candidato');
    expect(generator).toContain('trocar automaticamente para segunda referência técnica do apoiador');
    expect(generator).toContain('rankedReferenceIndices');
  });

  it('12. resumes already approved output formats after a retry instead of regenerating them', () => {
    expect(generator).toContain('existingPassedOutput');
    expect(generator).toContain('resumed: true');
    expect(generator).toContain("pipeline_version: PIPELINE_VERSION");
  });

  it('13. produces square, portrait and landscape outputs', () => {
    expect(prompts).toContain('exactWidth: 1080');
    expect(prompts).toContain('exactHeight: 1080');
    expect(prompts).toContain('exactHeight: 1350');
    expect(prompts).toContain('exactWidth: 1200');
    expect(prompts).toContain('exactHeight: 630');
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

  it('16. validates Drive asset MIME before generation and can fall back to the runner-up asset', () => {
    expect(generator).toContain('candidate_asset_invalid_mime');
    expect(generator).toContain('runnerUpMeta.slug !== candidateMeta.slug');
  });

  it('17. uses high image input fidelity when supported and transparently retries without the optional parameter if rejected', () => {
    expect(generator).toContain("form.set('input_fidelity', 'high')");
    expect(generator).toMatch(/input_fidelity\|unknown parameter\|unsupported/);
  });

  it('18. distinguishes generated-but-pending-QA from a terminal pipeline crash', () => {
    expect(generator).toContain('qa_provider_unavailable');
    expect(generator).toContain("const finalStatus = allPass ? 'completed' : 'needs_review'");
    expect(generator).toContain('qa_threshold_not_met_or_qa_provider_pending');
  });

  it('19. preserves candidate attire, bat integrity, safe synthetic scenes and AI disclosure', () => {
    expect(prompts).toContain('taco preto de beisebol');
    expect(prompts).toContain('Preserve o vestuário autorizado');
    expect(prompts).toContain('palanque-convencao-generica');
    expect(prompts).toContain('Imagem gerada por IA - Campanha Oficial');
  });

  it('20. preserves the durable request-state vocabulary', () => {
    for (const state of ['uploaded','analyzing','candidate_selected','generating','qa','retry','regenerate','needs_input','needs_review','completed','failed']) {
      expect(stateMigration).toContain(`'${state}'::text`);
    }
  });
});
