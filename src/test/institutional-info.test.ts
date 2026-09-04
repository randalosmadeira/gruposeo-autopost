import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('institutional information', () => {
  it('keeps the requested official contacts in one shared source', () => {
    const identity = read('src/lib/productIdentity.ts');

    expect(identity).toContain('www.app.zica.ia.posts.juris.com.br');
    expect(identity).toContain('apps.desenvolve@zicajuris.com.br');
    expect(identity).toContain('www.gruposeomkt.com.br');
  });

  it('shows the shared information on login and settings', () => {
    const auth = read('src/pages/Auth.tsx');
    const settings = read('src/pages/SettingsPage.tsx');

    expect(auth).toContain('<InstitutionalInfo variant="login" />');
    expect(settings).toContain('<InstitutionalInfo />');
  });
});
