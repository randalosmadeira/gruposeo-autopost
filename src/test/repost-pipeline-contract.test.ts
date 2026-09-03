import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('autonomous repost pipeline contracts', () => {
  it('migration defines normalized source and RSS evidence fields', () => {
    const sql = read('supabase/migrations/20260903150000_autonomous_repost_editorial_policy.sql');
    for (const token of [
      'source_type',
      'editorial_decision',
      'rss_feed_url',
      'rss_status',
      'rss_verified_at',
      'rss_verification_error',
      'editorial_policy_decisions',
      'rss_publication_verifications',
      'image_generation_attempts',
    ]) {
      expect(sql).toContain(token);
    }
  });

  it('all ingestion workers delegate policy resolution through rewrite-news', () => {
    for (const file of [
      'supabase/functions/auto-process-rss/index.ts',
      'supabase/functions/execute-news-agents/index.ts',
      'supabase/functions/monitor-portals/index.ts',
    ]) {
      const source = read(file);
      expect(source).toContain('rewrite-news');
      expect(source).toContain('policyMode');
      expect(source).toContain('sourceType');
    }
  });

  it('legacy fixed editorial defaults are removed from workers', () => {
    const rss = read('supabase/functions/auto-process-rss/index.ts');
    const agents = read('supabase/functions/execute-news-agents/index.ts');
    expect(rss).not.toContain('Contextualizar ${item.title} para o nicho');
    expect(agents).not.toContain('impacto jurídico prático, linguagem acessível e prevenção');
    expect(agents).not.toContain('articleLength: "medium"');
  });

  it('WordPress publication performs RSS verification', () => {
    const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
    expect(publisher).toContain('verifyPublishedInRss');
    expect(publisher).toContain('rss_publication_verifications');
  });

  it('image pipeline has bounded fallbacks and cooldowns', () => {
    const image = read('supabase/functions/generate-image/index.ts');
    expect(image).toContain('MAX_FIXED_ASSET_ATTEMPTS');
    expect(image).toContain('cooldown_until');
    expect(image).toContain('image_generation_attempts');
  });
});
