import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Zica Brain RSS contract', () => {
  it('enqueues an idempotent RSS repost job every 15-minute bucket', () => {
    const brain = read('supabase/functions/zica-brain-tick/index.ts');
    expect(brain).toContain('job_type: "rss_repost"');
    expect(brain).toContain('`rss-repost:${fifteen}`');
    expect(brain).toContain('"auto-process-rss"');
  });

  it('routes scheduled publishing and reconciliation through wordpress-operations', () => {
    const brain = read('supabase/functions/zica-brain-tick/index.ts');
    expect(brain).toContain('action: "process_due"');
    expect(brain).toContain('action: "publish"');
    expect(brain).not.toContain('edgeCall(url, serviceKey, "publish-to-wordpress"');
  });

  it('keeps historical dead letters for audit without degrading current health forever', () => {
    const brain = read('supabase/functions/zica-brain-tick/index.ts');
    expect(brain).toContain('deadLetterHistorical');
    expect(brain).toContain('deadLetterRecent24h');
    expect(brain).toContain('recentDead > 0 ? "degraded" : "healthy"');
  });
});
