import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('RSS republication routing', () => {
  it('persists every relevant field from the news-agent form', () => {
    const page = read('src/pages/CreateNewsAgent.tsx');
    for (const field of [
      'agent_type: data.agent_type',
      'category: data.category',
      'publish_status: data.publish_status',
      'news_per_day: data.news_per_day',
      'active_days: activeDays',
      'execution_times: executionTimes',
      'search_window: data.search_window',
      'image_generation: data.image_generation',
      'prompt_template: data.prompt_template',
      'is_active: data.is_active',
    ]) expect(page).toContain(field);
  });

  it('requires an explicit WordPress destination', () => {
    const page = read('src/pages/CreateNewsAgent.tsx');
    expect(page).toContain("project_id: z.string().min(1");
  });

  it('uses the shared SSRF-safe RSS reader', () => {
    const worker = read('supabase/functions/execute-news-agents/index.ts');
    expect(worker).toContain('fetchFeed, validateRSSUrl');
    expect(worker).toContain('validateRSSUrl(url)');
    expect(worker).not.toContain('const itemRegex = /<item>');
  });

  it('records source provenance and forwards the selected WordPress category', () => {
    const worker = read('supabase/functions/execute-news-agents/index.ts');
    const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
    expect(worker).toContain('source_agent_id: agent.id');
    expect(worker).toContain('source_original_title: item.title');
    expect(worker).toContain('source_published_at: item.date || null');
    expect(worker).toContain('wordpress_categories: wordpressCategories');
    expect(worker).toContain('Number.isInteger(categoryId)');
    expect(publisher).toContain('config.wordpress_categories');
  });

  it('drains unseen feed items without replaying previously processed URLs', () => {
    const worker = read('supabase/functions/execute-news-agents/index.ts');
    expect(worker).toContain('fetchRSS(feed, 50)');
    expect(worker).toContain('.from("agent_news")');
    expect(worker).toContain('seenUrls.has(normalizeSourceUrl(item.link))');
    expect(worker).toContain('rewrite.data.duplicate === true');
  });

  it('dispatches half-hour schedules through a quarter-hour cron', () => {
    const migration = read('supabase/migrations/20260926040000_news_agents_quarter_hour_cron.sql');
    expect(migration).toContain("'5,20,35,50 * * * *'");
    expect(migration).toContain("'zica-news-agents-15min'");
  });

  it('loads categories from the selected WordPress site instead of using a fixed list', () => {
    const page = read('src/pages/CreateNewsAgent.tsx');
    expect(page).toContain('getCategories(100)');
    expect(page).toContain('value={String(category.id)}');
    expect(page).not.toContain('<SelectItem value="tecnologia">');
  });
});
