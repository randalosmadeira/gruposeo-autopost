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

  it('does not contain the stale route timeout implementation', () => {
    const page = read('src/pages/ArticleViewPage.tsx');
    expect(page).toContain('getArticleById');
    expect(page).not.toContain("if (isLoading) {\n        setError('O servidor está demorando");
  });
});
