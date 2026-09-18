import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

// Strips `--` line comments so assertions about "no CHECK constraint" etc.
// aren't tripped up by this migration's own prose explaining what existing
// RLS policies already say (e.g. "WITH CHECK (auth.uid() = user_id)").
const stripSqlComments = (sql: string) =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

describe('article translation groups schema (hreflang foundation)', () => {
  const migration = read('supabase/migrations/20260918020000_article_translation_groups.sql');
  const executableSql = stripSqlComments(migration);

  it('adds a language column that defaults existing and new rows to pt-BR', () => {
    expect(migration).toContain(
      "add column if not exists language text not null default 'pt-BR'",
    );
  });

  it('adds a nullable translation_group_id column to link translations of the same article', () => {
    expect(migration).toContain('add column if not exists translation_group_id uuid null');
  });

  it('indexes translation_group_id with a partial index, since most articles have no group', () => {
    expect(migration).toContain('create index if not exists articles_translation_group_idx');
    expect(migration).toMatch(
      /on public\.articles \(translation_group_id\)\s+where translation_group_id is not null/,
    );
  });

  it('does not add a CHECK constraint on language, since the app does not use a closed set of values yet', () => {
    expect(executableSql).not.toMatch(/add constraint/i);
    expect(executableSql).not.toMatch(/\bcheck\s*\(/i);
  });

  it('is schema-only: no trigger or function is created', () => {
    expect(executableSql).not.toMatch(/create (or replace )?function/i);
    expect(executableSql).not.toMatch(/create trigger/i);
  });

  it('does not touch RLS: no policy is created, dropped or altered', () => {
    expect(executableSql).not.toMatch(/create policy/i);
    expect(executableSql).not.toMatch(/drop policy/i);
    expect(executableSql).not.toMatch(/enable row level security/i);
  });
});
