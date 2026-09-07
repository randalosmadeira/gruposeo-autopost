import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('WordPress download integrity', () => {
  it('builds archives with a deterministic timestamp', () => {
    const buildScript = read('scripts/build-wordpress-downloads.mjs');
    expect(buildScript).toContain("const ARCHIVE_DATE = new Date('2026-09-06T00:00:00.000Z')");
    expect(buildScript).toContain('{ date: ARCHIVE_DATE }');
  });

  it('returns 404 for missing downloads instead of the SPA shell', () => {
    const deploy = read('.github/workflows/zica-ai-vps-deploy.yml');
    expect(deploy).toContain('location /downloads/');
    expect(deploy).toContain('try_files \\$uri =404;');
  });
});
