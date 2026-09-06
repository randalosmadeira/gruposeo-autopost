import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Zica Posts 3.11.0', () => {
  it('exposes bulk publishing in the client sidebar', () => {
    const sidebar = read('src/components/layout/Sidebar.tsx');
    expect(sidebar).toContain("label: 'Publicar em massa'");
    expect(sidebar).toContain("href: '/keywords/bulk'");
  });
  it('ships guarded post-publication curation', () => {
    const curator = read('public/wordpress-plugin/zica-posts-3.11.0/includes/class-zica-posts-curator.php');
    expect(curator).toContain("add_action('save_post_post'");
    expect(curator).toContain('possible_duplicate');
    expect(curator).toContain("check_admin_referer('zica_posts_curator_'");
    expect(curator).toContain("current_user_can('delete_post'");
    expect(curator).toContain("'trash' === get_post_status($post_id)");
  });
  it('keeps CTA composition in the application backend', () => {
    const helper = read('supabase/functions/_shared/editorial-cta.ts');
    const plugin = read('public/wordpress-plugin/zica-posts-3.11.0/zica-posts.php');
    expect(helper).toContain('zica-cta:contact');
    expect(helper).toContain('zica-cta:social');
    expect(plugin).not.toContain('editorial-cta');
  });
});
