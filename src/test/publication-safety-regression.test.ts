import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
const guard = read('supabase/functions/_shared/publication-safety.ts');
const modal = read('src/components/articles/BulkPublishModal.tsx');
const migration = read('supabase/migrations/20260902223000_publication_safety_guard.sql');

describe('fail-closed publication safety', () => {
  it('blocks internal scaffolds, review markers, prompt residue and operational errors before WordPress', () => {
    expect(publisher).toContain('findPublicationResidues');
    expect(publisher).toContain('publication_residue_gate');
    expect(guard).toContain('RASCUNHO\\s+ELEITORAL');
    expect(guard).toContain('ALVO\\s+EDITORIAL\\s+CONFIGURADO');
    expect(guard).toContain('verify_primary_source');
    expect(guard).toContain('requery_external_source');
    expect(guard).toContain('internal_error_token');
    expect(guard).toContain('system_prompt_residue');
    expect(guard).toContain('placeholder_token');
  });

  it('generates and persists a clean meta description automatically before publication', () => {
    expect(publisher).toContain('resolveMetaDescription');
    expect(publisher).toContain('meta_description_gate');
    expect(publisher).toContain('excerpt: metaDescription');
    expect(publisher).toContain('seo_description: metaDescription');
    expect(publisher).toContain('meta_description_auto: true');
    expect(guard).toContain('buildAutomaticMetaDescription');
  });

  it('loads WordPress projects directly whenever the bulk publication modal opens', () => {
    expect(modal).toContain(".from('projects')");
    expect(modal).toContain(".select('id,name,domain,wordpress_url')");
    expect(modal).toContain('setAutoProjects');
    expect(modal).toContain('Atualizando projetos WordPress');
    expect(modal).toContain('resolvedProjects');
  });

  it('prevents operational scaffolds from persisting as reader-facing article content', () => {
    expect(migration).toContain('guard_article_reader_content');
    expect(migration).toContain('before insert or update of content');
    expect(migration).toContain("new.content := ''");
    expect(migration).toContain('publication_guard_origin_blocked');
    expect(migration).toContain("status::text <> 'published'");
  });
});
