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
    expect(agent).toContain('allowAiGeneration: true');
    expect(agent).toContain('watermark: "RDM ADVOGADOS"');
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
    expect(image).toContain('assets.length > 0 && policy.auto_select !== false');
    expect(image).toContain('semantic-stable-v3');
    expect(image).toContain('stableHash(body.articleId || body.title)');
    expect(image).toContain('assetScope === "project"');
    expect(image).toContain('watermark_requested');
    expect(image).toContain('chooseUsableAsset');
    expect(image).toContain('unavailable_assets_skipped');
    expect(image).not.toContain('getOrchestratorForUser');
  });

  it('generates a branded image before an automatic RSS publication', () => {
    const rss = read('supabase/functions/auto-process-rss/index.ts');
    expect(rss).toContain('x-zica-automation-key');
    expect(rss).toContain('.eq("name", "news-agents")');
    expect(rss).toContain('body?.dryRun === true');
    expect(rss).toContain('/functions/v1/generate-image');
    expect(rss).toContain('watermark: "RDM ADVOGADOS"');
    expect(rss).toContain('schedule.auto_publish && schedule.project_id && imageReady');
  });

  it('keeps the brain worker batch within the Edge Function execution window', () => {
    const brain = read('supabase/functions/zica-brain-tick/index.ts');
    expect(brain).toContain('Math.min(20, Number(body?.maxJobs || 5))');
  });

  it('serves article images through Storage CDN instead of database data URLs', () => {
    const image = read('supabase/functions/generate-image/index.ts');
    const brain = read('supabase/functions/zica-brain-tick/index.ts');
    const migration = read('supabase/migrations/20260904034000_externalize_article_images.sql');
    expect(image).toContain('storage.from("article-images").upload');
    expect(image).toContain('getPublicUrl(path)');
    expect(migration).toContain(`'{"maxJobs":5}'::jsonb`);
  });

  it('allows bulk image generation to use the configured provider only after pool fallback', () => {
    const page = read('src/pages/ArticlesList.tsx');
    expect(page).toContain('allowAiGeneration: true');
    expect(page).toContain('O pool oficial é priorizado');
    expect(page).not.toContain('RDM usa somente o pool oficial de 3 imagens.');
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
    expect(page).toContain('URL.createObjectURL(file)');
    expect(page).toContain('previews.map');
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

  it('supports selecting multiple WordPress destinations in bulk publishing', () => {
    const modal = read('src/components/articles/BulkPublishModal.tsx');
    expect(modal).toContain('selectedProjectIds');
    expect(modal).toContain('selectedSites.length');
    expect(modal).toContain('allowCrossProject: true');
    expect(modal).toContain("functions.invoke('test-wordpress-connection'");
    expect(modal).not.toContain("const [selectedProject, setSelectedProject]");
  });

  it('loads public WordPress categories without requiring an application password', () => {
    const api = read('supabase/functions/wordpress-api/index.ts');
    expect(api).toContain('/wp-json/wp/v2/categories');
    expect(api).toContain('hide_empty=false');
    expect(api).not.toContain('Credenciais do WordPress não configuradas');
  });

  it('tracks WordPress publications by destination instead of globally blocking republish', () => {
    const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
    expect(publisher).toContain('allowCrossProject');
    expect(publisher).toContain('wordpress_publications');
    expect(publisher).toContain('categories?: Array<number | string>');
    expect(publisher).not.toContain('article.status === "published" && article.published_url');
  });

  it('keeps all visible article editor actions connected to real handlers', () => {
    const editor = read('src/components/articles/ArticleEditor.tsx');
    expect(editor).toContain('onClick={handleExport}');
    expect(editor).toContain("functions.invoke('generate-image'");
    expect(editor).toContain("functions.invoke('regenerate-content'");
    expect(editor).toContain("hasChanges ? 'Salvar e publicar' : 'Publicar'");
    expect(editor).not.toContain('disabled={isPublishing || hasChanges}');
  });

  it('implements real AI regeneration instead of a placeholder endpoint', () => {
    const regenerate = read('supabase/functions/regenerate-content/index.ts');
    expect(regenerate).toContain('getOrchestratorForUser');
    expect(regenerate).toContain('title_generation');
    expect(regenerate).toContain('meta_description');
    expect(regenerate).toContain('content_editing');
    expect(regenerate).toContain('success: true');
    expect(regenerate).not.toContain('Regeneração regida por instrucoes.md');
  });

  it('captures complete article version history with concurrency protection', () => {
    const migration = read('supabase/migrations/20260902141000_fix_article_version_history.sql');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('OLD.excerpt IS DISTINCT FROM NEW.excerpt');
    expect(migration).toContain('OLD.featured_image_url IS DISTINCT FROM NEW.featured_image_url');
    expect(migration).toContain('Estado inicial capturado pelo editor');
  });
});
