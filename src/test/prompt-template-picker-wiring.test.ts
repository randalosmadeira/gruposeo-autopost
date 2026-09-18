import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

// Block P (frontend half): a "Tipo de Artigo" picker that lets users apply one of
// THEIR OWN saved prompt_templates rows (managed in PromptTemplatesCard) when
// generating an article, instead of that setting only ever being editable and
// never actually selectable at generation time.
describe('prompt template picker wiring (Block P frontend)', () => {
  describe('ArticleGeneratorV2', () => {
    const page = read('src/pages/ArticleGeneratorV2.tsx');

    it('fetches only the current user\'s own prompt_templates, scoped by user_id', () => {
      expect(page).toContain("from('prompt_templates')");
      expect(page).toContain("select('id,name,target_function,description')");
      expect(page).toContain("eq('user_id', user.id)");
      expect(page).toMatch(/enabled:\s*!!user/);
    });

    it('tracks the selection in local state, defaulting to no template (system default)', () => {
      expect(page).toMatch(/selectedTemplateId,\s*setSelectedTemplateId\s*\]\s*=\s*useState<string \| undefined>\(undefined\)/);
    });

    it('renders a Select with a "Padrão do sistema" option plus one per fetched template', () => {
      expect(page).toContain('<SelectItem value="none">Padrão do sistema</SelectItem>');
      expect(page).toContain('{promptTemplates.map((template) => (');
      expect(page).toContain('<SelectItem key={template.id} value={template.id}>');
    });

    it('forwards the selection as promptTemplateId when triggering generation', () => {
      expect(page).toContain('promptTemplateId: selectedTemplateId || undefined,');
    });
  });

  describe('BulkArticleGenerator', () => {
    const page = read('src/pages/BulkArticleGenerator.tsx');

    it('fetches only the current user\'s own prompt_templates, scoped by user_id', () => {
      expect(page).toContain("from('prompt_templates')");
      expect(page).toContain("select('id,name,target_function,description')");
      expect(page).toContain("eq('user_id', user.id)");
      expect(page).toMatch(/enabled:\s*!!user/);
    });

    it('holds the batch-wide selection on globalConfig, not a separate piece of state', () => {
      expect(page).toContain('promptTemplateId: undefined as string | undefined,');
      expect(page).toContain('globalConfig.promptTemplateId');
    });

    it('renders the same "Padrão do sistema" + per-template Select wired into globalConfig', () => {
      expect(page).toContain('<SelectItem value="none">Padrão do sistema</SelectItem>');
      expect(page).toContain('{promptTemplates.map((template) => (');
      expect(page).toContain('promptTemplateId: v === \'none\' ? undefined : v,');
    });

    it('includes promptTemplateId in the per-article config sent to generate-article, since it is not spread automatically', () => {
      expect(page).toContain('promptTemplateId: globalConfig.promptTemplateId || undefined,');
      // The invoke config below picks fields individually rather than spreading
      // globalConfig, so this field must be listed explicitly or it is silently dropped.
      const invokeIndex = page.indexOf("functions.invoke('generate-article'");
      const fieldIndex = page.indexOf('promptTemplateId: globalConfig.promptTemplateId');
      expect(invokeIndex).toBeGreaterThan(-1);
      expect(fieldIndex).toBeGreaterThan(invokeIndex);
    });
  });

  describe('useArticleGeneration hook (unchanged, already end-to-end)', () => {
    const hook = read('src/hooks/useArticleGeneration.tsx');

    it('already declares promptTemplateId on ArticleConfig and forwards the whole config verbatim', () => {
      expect(hook).toContain('promptTemplateId?: string;');
      expect(hook).toContain('body: JSON.stringify({ config })');
    });
  });
});
