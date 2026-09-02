import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Zica Posts stability regressions', () => {
  it('does not use the legacy zica-ai WordPress API in active queue and publisher flows', () => {
    const queue = read('src/pages/QueueMonitor.tsx');
    const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
    const publishHook = read('src/hooks/useWordPressPublish.tsx');
    expect(queue).not.toContain('zica-ai/v1');
    expect(publisher).not.toContain('zica-ai/v1');
    expect(publishHook).toContain('wordpressOperations');
  });

  it('writes calendar rescheduling to scheduled_at and never mutates created_at', () => {
    const calendar = read('src/pages/ContentCalendar.tsx');
    expect(calendar).toContain('scheduled_at: nextSchedule.toISOString()');
    expect(calendar).not.toMatch(/created_at\s*:\s*target/i);
  });

  it('routes news publishing through wordpress-operations', () => {
    const agent = read('supabase/functions/execute-news-agents/index.ts');
    expect(agent).toContain('"wordpress-operations"');
    expect(agent).toContain('moduleKey: "news"');
    expect(agent).toContain('allowAiGeneration: false');
  });

  it('uses the shared AI orchestrator for unit and bulk article generation', () => {
    const generator = read('supabase/functions/generate-article/index.ts');
    const bulk = read('src/hooks/useBulkGeneration.tsx');
    expect(generator).toContain('getOrchestratorForUser');
    expect(generator).toContain('article_generation');
    expect(bulk).toContain('/functions/v1/generate-article');
  });

  it('uses fixed image pools before any synthetic generation', () => {
    const image = read('supabase/functions/generate-image/index.ts');
    expect(image).toContain('module_image_assets');
    expect(image).toContain('image_pool_incomplete');
    expect(image).toContain('body.allowAiGeneration === true && policy.allow_ai_generation === true');
  });

  it('edits chroma backgrounds without authorizing synthetic people', () => {
    const image = read('supabase/functions/generate-image/index.ts');
    expect(image).toContain('chroma_replace');
    expect(image).toContain('fixed_pool_background_edited');
    expect(image).toContain('synthetic_person_generation: false');
    expect(image).toContain('allow_background_editing');
  });

  it('does not contain the stale route timeout implementation', () => {
    const page = read('src/pages/ArticleViewPage.tsx');
    expect(page).toContain('getArticleById');
    expect(page).not.toContain("if (isLoading) {\n        setError('O servidor está demorando");
  });

  it('uses custom internal auth for supporter rendering instead of gateway JWT validation', () => {
    const config = read('supabase/config.toml');
    expect(config).toMatch(/\[functions\.generate-supporter-avatar\][\s\S]*?verify_jwt\s*=\s*false/);
    expect(config).toMatch(/\[functions\.supporter-avatar-public-v2\][\s\S]*?verify_jwt\s*=\s*false/);
  });

  it('requires supporter full name email and WhatsApp and shows local upload previews', () => {
    const page = read('src/pages/SupporterAvatar1470V2.tsx');
    const api = read('supabase/functions/supporter-avatar-public-v2/index.ts');
    expect(page).toContain('Nome e sobrenome *');
    expect(page).toContain('WhatsApp *');
    expect(page).toContain('Prévia dos anexos');
    expect(page).toContain("action: 'update-contact'");
    expect(api).toContain('supporter_full_name_required');
    expect(api).toContain('supporter_email_invalid');
    expect(api).toContain('supporter_whatsapp_invalid');
  });

  it('exposes the supporter database only through a protected CEO endpoint', () => {
    const app = read('src/App.tsx');
    const admin = read('supabase/functions/supporter-avatar-admin/index.ts');
    expect(app).toContain('/electoral-campaign/supporters');
    expect(admin).toContain('rpc("is_ceo")');
    expect(admin).not.toContain('public_token_hash');
    expect(admin).not.toContain('fingerprint_hash');
  });
});
