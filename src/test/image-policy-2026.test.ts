import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('image policy 2026: one rule set for every generated image', () => {
  const policy = read('supabase/functions/_shared/image-policy.ts');
  const generator = read('supabase/functions/generate-image/index.ts');
  const directives = read('supabase/functions/_shared/behavioral-directives.ts');
  const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
  const migration = read('supabase/migrations/20260907210000_image_policy_2026_hero_150kb.sql');

  it('fixes the technical specification in the shared module', () => {
    expect(policy).toContain('export const HERO_MIN_WIDTH = 1200;');
    expect(policy).toContain('export const HERO_MIN_PIXELS = 300_000;');
    expect(policy).toContain('export const HERO_MAX_BYTES = 150 * 1024;');
    expect(policy).toContain('export const HERO_16_9: HeroDimensions = { width: 1200, height: 675, aspect: "16:9" };');
    expect(policy).toContain('export const HERO_4_3: HeroDimensions = { width: 1200, height: 900, aspect: "4:3" };');
    expect(policy).toContain('export const HERO_SAFE_ZONE_RATIO = 0.15;');
    expect(policy).toContain('resize=cover&quality=${quality}&format=webp');
    expect(policy).toContain('encodeJPEG(quality)');
  });

  it('forbids text inside images and demands the centred safe zone in every prompt', () => {
    expect(policy).toMatch(/Proibido qualquer texto, letra, número, logotipo, selo, legenda ou marca d'água/);
    expect(policy).toMatch(/15% a 20% de margem/);
    expect(generator).toContain('IMAGE_PROMPT_RULES');
    expect(generator).not.toMatch(/exatamente com o texto: \$\{watermark\}/);
    expect(directives).toContain('1200x675');
    expect(directives).toContain('Nunca inserir texto');
    expect(directives).toContain('15% a 20%');
  });

  it('the generator derives the WebP hero and the JPEG copy for pool and synthetic images', () => {
    expect(generator).toContain('deriveHeroImage(');
    expect(generator).toContain('deriveJpegCopy(');
    expect(generator).toContain('imagePolicyMetadata(');
    expect((generator.match(/finalizeHero\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(generator).toContain('heroDimensionsFor(body.aspectRatio)');
  });

  it('the publisher asks WordPress for the 1200x675 / 150 KB featured image', () => {
    expect(publisher).toContain('target_width: 1200');
    expect(publisher).toContain('target_height: 675');
    expect(publisher).toContain('max_kb: 150');
  });

  it('stored module policies follow the same numbers', () => {
    expect(migration).toContain('hero_height = 675');
    expect(migration).toContain('max_hero_kb = 150');
    expect(migration).toContain("alter column hero_height set default 675");
  });
});

describe('Zica Posts 3.13.0 image delivery', () => {
  const plugin = read('public/wordpress-plugin/zica-posts/zica-posts.php');
  const rest = read('public/wordpress-plugin/zica-posts/includes/class-zica-posts-rest.php');
  const card = read('src/components/settings/BrandAssetsCard.tsx');

  it('forces max-image-preview:large regardless of theme or SEO plugin', () => {
    expect(plugin).toContain("add_filter('wp_robots', array($this, 'robots_max_image_preview'))");
    expect(plugin).toContain("$robots['max-image-preview'] = 'large';");
  });

  it('keeps alt text and stores the caption on the uploaded media', () => {
    expect(rest).toContain("update_post_meta($attachment,'_wp_attachment_image_alt'");
    expect(rest).toContain("'post_excerpt'=>sanitize_textarea_field($p['caption'])");
  });

  it('bumps the plugin version everywhere while keeping 3.12.0 installs allowed', () => {
    expect(plugin).toContain('Version: 3.13.0');
    expect(plugin).toContain("define('ZICA_POSTS_VERSION', '3.13.0');");
    expect(read('public/wordpress-plugin/zica-posts/version.json')).toContain('"version": "3.13.0"');
    expect(read('public/wordpress-plugin/zica-posts/readme.txt')).toContain('Stable tag: 3.13.0');
    expect(read('scripts/build-wordpress-downloads.mjs')).toContain("outputName: 'zica-posts-3.13.0.zip'");
    expect(read('.github/workflows/zica-posts-package.yml')).toContain("grep -q 'Version: 3.13.0'");
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('PLUGIN_VERSION="3.13.0"');
    expect(read('supabase/functions/_shared/plugin-version.ts')).toContain('PLUGIN_MINIMUM_VERSION="3.12.0"');
    expect(read('src/lib/plugin-version.ts')).toContain("PLUGIN_VERSION='3.13.0'");
  });

  it('the brand bank export stays under 150 KB', () => {
    expect(card).toContain('HERO_MAX_BYTES');
    expect(card).toMatch(/for \(const quality of WEBP_QUALITY_STEPS\)/);
  });
});
