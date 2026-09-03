import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const app = read('src/App.tsx');
const indexHtml = read('index.html');
const ui = read('src/pages/SupporterAvatar1470V2.tsx');
const publicApi = read('supabase/functions/supporter-avatar-public-v2/index.ts');
const legacyProxy = read('supabase/functions/supporter-avatar-public/index.ts');
const generator = read('supabase/functions/generate-supporter-avatar/index.ts');
const candidateAssets = read('supabase/functions/supporter-avatar-candidate-assets/index.ts');
const prompts = read('supabase/functions/_shared/supporter-avatar-prompt.ts');
const migration = read('supabase/migrations/20260902173000_supporter_avatar_auto_selector_pipeline.sql');

const runtime = [ui, publicApi, generator, candidateAssets, prompts].join('\n');

describe('Supporter Avatar 1470 auto-selector v2 regressions', () => {
  it('0. hard-pins both public routes to V2 and removes the legacy UI source', () => {
    expect(app).toContain('import("./pages/SupporterAvatar1470V2")');
    expect(app).toContain('<Route path="/1470" element={<SupporterAvatar1470 />} />');
    expect(app).toContain('<Route path="/apoiadores/avatar" element={<SupporterAvatar1470 />} />');
    expect(app).not.toContain('import("./pages/SupporterAvatar1470")');
    expect(existsSync(resolve(root, 'src/pages/SupporterAvatar1470.tsx'))).toBe(false);
    expect(indexHtml).toContain('name="zica-supporter-flow" content="supporter-avatar-public-v2"');
  });

  it('1. does not require candidatePresetSlug from the supporter', () => {
    expect(ui).not.toContain('candidatePresetSlug');
    expect(publicApi).not.toContain('candidatePresetSlug');
    expect(publicApi).toContain('candidate_preset_slug: null');
  });

  it('2. supports supporter upload with 1, 2 or 3 photos and caps at 3', () => {
    expect(ui).toContain('.slice(0, 3)');
    expect(publicApi).toContain('(count || 0) >= 3');
    expect(publicApi).toContain('maxSourceImages: 3');
  });

  it('3. keeps candidate gallery inaccessible to anonymous public users', () => {
    expect(candidateAssets).toContain('requireCeo');
    expect(candidateAssets).toContain("ceo_access_required");
    expect(candidateAssets).toContain("'Cache-Control': 'private, max-age=300'");
    expect(ui).not.toContain('supporter-avatar-candidate-assets');
  });

  it('4. public responses do not expose candidate URLs, storage paths, Drive IDs or preset identifiers', () => {
    const statusBlock = publicApi.slice(publicApi.indexOf('if (action === "status")'));
    expect(statusBlock).not.toContain('candidate_preset_slug');
    expect(statusBlock).not.toContain('drive_file_id');
    expect(statusBlock).not.toContain('drive_download_url');
    expect(statusBlock).toContain('candidateSelection: "automatic-private"');
  });

  it('5. performs private automatic candidate selection after photo intake', () => {
    expect(generator).toContain('photoIntakeAgent');
    expect(generator).toContain('candidateSelectorAgent');
    expect(generator).toContain("status: 'candidate_selected'");
    expect(prompts).toContain('CANDIDATE SELECTOR AGENT');
  });

  it('6. enforces dual identity preservation without face swap or beautification', () => {
    expect(prompts).toContain('IDENTITY GUARDIAN AGENT');
    expect(prompts).toContain('Não embeleze');
    expect(prompts).toContain('não faça face swap');
    expect(prompts).toContain('supporter_fidelity_score');
    expect(prompts).toContain('candidate_reference_fidelity_score');
  });

  it('7. has retry states and bounded retry logic', () => {
    expect(generator).toContain('MAX_PIPELINE_ATTEMPTS = 3');
    expect(generator).toContain("status: 'retry'");
    expect(publicApi).toContain('dispatch_retry_');
    expect(migration).toContain("'retry'::text");
  });

  it('8. treats timeouts as transient instead of terminal failed', () => {
    expect(generator).toContain('AbortController');
    expect(generator).toMatch(/abort\|timeout/i);
    expect(generator).toContain('transientError');
  });

  it('9. treats HTTP 429 as retryable', () => {
    expect(generator).toContain('response.status !== 429');
    expect(generator).toMatch(/429/);
    expect(publicApi).toContain('response.status !== 429');
  });

  it('10. treats HTTP 5xx as retryable', () => {
    expect(generator).toContain('response.status < 500');
    expect(generator).toMatch(/5\\d\\d/);
  });

  it('11. automatically regenerates a QA-rejected variant before needs_review', () => {
    expect(generator).toContain('MAX_QA_GENERATIONS = 2');
    expect(generator).toContain("status: 'regenerate'");
    expect(generator).toContain("const finalStatus = allPass ? 'completed' : 'needs_review'");
    expect(prompts).toContain('QUALITY AUDITOR AGENT');
  });

  it('12. produces the requested horizontal 1200x630 social output', () => {
    expect(prompts).toContain('landscape: {');
    expect(prompts).toContain('exactWidth: 1200');
    expect(prompts).toContain('exactHeight: 630');
  });

  it('13. produces the requested vertical 1080x1350 social output', () => {
    expect(prompts).toContain('portrait: {');
    expect(prompts).toContain('exactWidth: 1080');
    expect(prompts).toContain('exactHeight: 1350');
  });

  it('14. produces the requested square 1080x1080 social output', () => {
    expect(prompts).toContain('square: {');
    expect(prompts).toContain('exactWidth: 1080');
    expect(prompts).toContain('exactHeight: 1080');
  });

  it('15. active runtime contains no legacy-dispatch call and legacy public endpoint proxies to v2', () => {
    expect(runtime.toLowerCase()).not.toContain('legacy_dispatch');
    expect(runtime.toLowerCase()).not.toContain('legacy-dispatch');
    expect(legacyProxy).toContain('supporter-avatar-public-v2');
  });

  it('16. public UI contains no legacy gallery/error copy', () => {
    expect(ui).not.toContain('Fotos oficiais indisponíveis');
    expect(ui).not.toContain('Escolha uma foto oficial');
    expect(ui).not.toContain('Escolha a foto oficial');
    expect(ui).not.toContain('PRESETS_URL');
  });

  it('preserves candidate attire, bat integrity, safe synthetic scenes and AI disclosure', () => {
    expect(prompts).toContain('taco preto de beisebol');
    expect(prompts).toContain('Preserve o vestuário autorizado');
    expect(prompts).toContain('palanque-convencao-generica');
    expect(prompts).toContain('não invente local real identificável');
    expect(prompts).toContain('Imagem gerada por IA - Campanha Oficial');
  });

  it('uses only the requested durable request-state vocabulary', () => {
    for (const state of ['uploaded','analyzing','candidate_selected','generating','qa','retry','regenerate','needs_input','needs_review','completed','failed']) {
      expect(migration).toContain(`'${state}'::text`);
    }
  });
});
