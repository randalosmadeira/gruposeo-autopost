import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('universal RSS and distribution invariants', () => {
  it('discovers RSS/Atom through alternate links and all safe fallbacks', () => {
    const source = read('supabase/functions/_shared/rss-discovery.ts');
    expect(source).toContain('rel.includes("alternate")');
    expect(source).toContain('"feed/"');
    expect(source).toContain('searchParams.set("feed", "rss2")');
    expect(source).toContain('searchParams.set("format", "rss")');
    expect(source).toContain('["rss", "rss.xml", "feed.xml", "atom.xml"]');
    expect(source).toContain('content_type_valid');
    expect(source).toContain('structure_valid');
  });

  it('persists RSS association without replacing canonical URLs', () => {
    const discovery = read('supabase/functions/discover-rss-feed/index.ts');
    const migration = read('supabase/migrations/20260903122000_universal_rss_association_core.sql');
    expect(discovery).toContain('canonical_url_preserved: true');
    expect(discovery).toContain('rss_feed_url: discovery.url');
    expect(discovery).not.toMatch(/published_url\s*:\s*discovery\.url/);
    expect(migration).toContain('It never replaces canonical URLs');
  });

  it('routes automatic repost publication through wordpress-operations', () => {
    const hook = read('src/hooks/useNewsRewriter.tsx');
    const rss = read('supabase/functions/auto-process-rss/index.ts');
    expect(hook).toContain('/functions/v1/wordpress-operations');
    expect(hook).not.toContain('/functions/v1/publish-to-wordpress');
    expect(rss).toContain('"wordpress-operations"');
    expect(rss).not.toContain('callEdge(url, key, "publish-to-wordpress"');
  });

  it('uses an independent queue identity per article, project and operation', () => {
    const queue = read('supabase/functions/wordpress-operations/index.ts');
    const migration = read('supabase/migrations/20260903122000_universal_rss_association_core.sql');
    expect(queue).toContain('.eq("article_id", articleId).eq("project_id", projectId).eq("operation_type", operationType)');
    expect(migration).toContain('article_id, project_id, operation_type');
  });

  it('adds deterministic project-scoped interlinks and social links before publication', () => {
    const queue = read('supabase/functions/wordpress-operations/index.ts');
    expect(queue).toContain('data-zica-interlinks="1"');
    expect(queue).toContain('data-zica-social="1"');
    expect(queue).toContain('sameProjectUrl');
    expect(queue).toContain('project.social_instagram');
    expect(queue).toContain('project.social_youtube');
    expect(queue).toContain('project.social_linkedin');
  });

  it('exposes RSS to LLM discovery but keeps IndexNow canonical-only', () => {
    const plugin = read('public/wordpress-plugin/zica-posts-3.10.2/includes/class-zica-posts-discovery.php');
    expect(plugin).toContain("add_action('wp_head',array($this,'output_rss_alternate')");
    expect(plugin).toContain('RSS/Atom discovery: ');
    expect(plugin).toContain("'@type'=>'DataFeed'");
    expect(plugin).toContain('canonical_content_urls_only_submission_received_not_indexing_confirmation');
    expect(plugin).toContain("untrailingslashit($url)!==untrailingslashit($this->feed_url())");
  });

  it('supports controlled E2E publication as WordPress draft', () => {
    const rss = read('supabase/functions/auto-process-rss/index.ts');
    expect(rss).toContain('forceDraft?: boolean');
    expect(rss).toContain('input.forceDraft ? "draft"');
    expect(rss).toContain('source_canonical_url: item.link');
  });
});
