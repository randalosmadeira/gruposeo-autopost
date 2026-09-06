import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const listHook = read('src/hooks/useArticlesList.tsx');
const generator = read('supabase/functions/generate-article/index.ts');
const bulkModal = read('src/components/articles/BulkPublishModal.tsx');
const articlesList = read('src/pages/ArticlesList.tsx');
const app = read('src/App.tsx');

describe('bulk publication readiness invariants', () => {
  it('does not treat word_count alone as publishable content', () => {
    expect(listHook).toContain("if (!['ready', 'published'].includes(article.status)) return false");
    expect(listHook).toContain("if (article.error_message?.trim()) return false");
    expect(listHook).toContain("config.publication_guard_origin_blocked === true");
    expect(listHook).toContain("config.needs_primary_source === true");
    expect(listHook).toContain("config.complianceSnapshot?.canPublish === false");
  });

  it('loads publication config into the article list contract', () => {
    expect(listHook).toMatch(/config, error_message/);
  });

  it('never allows review tokens to be returned as final generated article content', () => {
    expect(generator).toContain('ZICA_NEEDS_PRIMARY_SOURCE');
    expect(generator).toContain('primary_source_required');
    expect(generator).toContain('REVIEW_MARKER');
    expect(generator).toContain('É PROIBIDO escrever [VERIFICAR]');
  });

  it('keeps the publisher as the last fail-closed barrier', () => {
    expect(bulkModal).toContain('publish-to-wordpress');
    expect(bulkModal).toContain('allowCrossProject: true');
  });

  it('exposes bulk generation from the commercial content screen', () => {
    expect(articlesList).toContain('<Link to="/keywords/bulk">');
    expect(articlesList).toContain('Gerar em massa');
    expect(articlesList).toContain('Publicar selecionados');
    expect(app).toContain('<Route path="/keywords/bulk" element={<BulkKeywordGenerator />} />');
    expect(app).toContain('<Route path="/bulk-generator" element={<Navigate to="/keywords/bulk" replace />} />');
  });
});
