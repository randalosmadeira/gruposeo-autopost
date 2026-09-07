import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync('src/pages/SettingsPage.tsx', 'utf8');

describe('atalho do plugin nas configurações', () => {
  it('oferece download direto, versionado e acesso à central de pacotes', () => {
    expect(settings).toContain('WORDPRESS_PLUGIN_DOWNLOAD');
    expect(settings).toContain('Baixar Zica Posts {PLUGIN_VERSION}');
    expect(settings).toContain('download={`zica-posts-${PLUGIN_VERSION}.zip`}');
    expect(settings).toContain('to="/wordpress-plugin"');
  });
});
