import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'supabase/functions/generate-article/index.ts'), 'utf8');

describe('generate-article publication safety', () => {
  it('moves primary-source uncertainty out of article body', () => {
    expect(source).toContain('ZICA_NEEDS_PRIMARY_SOURCE');
    expect(source).toContain('primary_source_required');
    expect(source).toContain('REVIEW_MARKER');
    expect(source).toContain('É PROIBIDO escrever [VERIFICAR]');
  });

  it('does not instruct the model to emit TITLE_SEO/META_DESCRIPTION comments', () => {
    expect(source).toContain('Não escreva comentários técnicos TITLE_SEO, META_DESCRIPTION');
    expect(source).not.toContain('Inclua no início comentários HTML TITLE_SEO e META_DESCRIPTION');
  });
});
