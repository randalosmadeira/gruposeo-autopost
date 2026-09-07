import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('publish-to-wordpress: featured image reaches the plugin from Storage URLs', () => {
  const publisher = read('supabase/functions/publish-to-wordpress/index.ts');

  it('downloads https featured images and re-encodes them as Data URL before the media upload', () => {
    expect(publisher).toContain('async function resolveFeaturedDataUrl(featured: string)');
    expect(publisher).toMatch(/if \(value\.startsWith\("data:image"\)\) return value;/);
    expect(publisher).toMatch(/if \(!\/\^https\?:\\\/\\\/\/i\.test\(value\)\) return "";/);
    expect(publisher).toContain('const dataUrl = await resolveFeaturedDataUrl(featured);');
    expect(publisher).toContain('const FEATURED_IMAGE_MAX_BYTES = 8 * 1024 * 1024;');
  });

  it('never fails the publication because of an unreachable image', () => {
    const helper = publisher.slice(publisher.indexOf('async function resolveFeaturedDataUrl'), publisher.indexOf('async function uploadPluginImage'));
    expect(helper).toContain('catch (error)');
    expect(helper).toContain('return "";');
  });
});

describe('reprocess-article-images: batch application of the 2026 policy', () => {
  const fn = read('supabase/functions/reprocess-article-images/index.ts');

  it('reuses the shared policy module instead of redefining dimensions', () => {
    expect(fn).toContain('from "../_shared/image-policy.ts"');
    expect(fn).toContain('deriveHeroImage(storage, supabaseUrl, BUCKET, masterPath, HERO_16_9)');
    expect(fn).toContain('deriveJpegCopy(storage, BUCKET, masterPath, master, HERO_16_9)');
    expect(fn).not.toMatch(/1200x675|width=1200/);
  });

  it('is idempotent and only accepts internal callers', () => {
    expect(fn).toContain('function isCompliant(config');
    expect(fn).toContain("policy.compliance === \"compliant\"");
    expect(fn).toContain('isServiceCredential(bearer)');
    expect(fn).toContain('.eq("name", "zica-brain")');
    expect(fn).toContain('automation_unauthorized');
  });

  it('keeps the previous URL for rollback and updates optimistically', () => {
    expect(fn).toContain('previous_featured_image_url: featured');
    expect(fn).toContain('.eq("featured_image_url", featured)');
    expect(fn).toContain('reprocessed_at: now');
  });

  it('pushes to WordPress only for published articles and through the regular publisher', () => {
    expect(fn).toContain('body.pushToWordpress === true && row.status === "published"');
    expect(fn).toContain('/functions/v1/publish-to-wordpress');
    expect(fn).toContain('requireFeaturedImage: true');
  });
});
