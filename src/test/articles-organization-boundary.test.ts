import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('articles inherit the organization required by the publisher boundary', () => {
  const migration = read('supabase/migrations/20260907180000_articles_inherit_organization.sql');
  const publisher = read('supabase/functions/publish-to-wordpress/index.ts');

  it('the publisher still enforces the organization boundary', () => {
    expect(publisher).toContain('article.organization_id !== project.organization_id');
    expect(publisher).toContain('code: "organization_boundary"');
  });

  it('fills organization_id from the project before insert and when the project changes', () => {
    expect(migration).toContain('before insert or update of project_id, organization_id on public.articles');
    expect(migration).toContain('select p.organization_id into new.organization_id from public.projects p where p.id = new.project_id');
    expect(migration).toContain("where m.user_id = new.user_id and m.status = 'active'");
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = public, pg_temp');
  });

  it('backfills existing articles without widening privileges', () => {
    expect(migration).toMatch(/update public\.articles a\s+set organization_id = p\.organization_id/);
    expect(migration).toContain('revoke all on function public.inherit_article_organization() from public, anon, authenticated;');
    expect(migration).not.toMatch(/grant /i);
  });
});
