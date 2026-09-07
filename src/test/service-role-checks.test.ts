import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(process.cwd(), 'supabase/migrations');
const read = (name: string) => readFileSync(resolve(dir, name), 'utf8');

describe('service-role checks accept both PostgREST claim formats', () => {
  it('the rewrite migration targets the legacy GUC reads and keeps set_config writes', () => {
    const migration = read('20260907200000_service_role_checks_use_auth_role.sql').split('
').filter((line) => !line.trimStart().startsWith('--')).join('
');
    expect(migration).toContain("'coalesce(auth.role(), '''')'");
    expect(migration).toContain("'auth.role()'");
    expect(migration).toContain('execute v_new;');
    expect(migration).not.toContain('set_config(');
  });

  it('no migration written after the rewrite introduces a new legacy GUC read', () => {
    const later = readdirSync(dir).filter((name) => name > '20260907200000_service_role_checks_use_auth_role.sql');
    for (const name of later) {
      const sql = read(name).replace(/set_config\('request\.jwt\.claim\.role'[^)]*\)/g, '');
      expect(sql, name).not.toMatch(/current_setting\('request\.jwt\.claim\.role'/);
    }
  });
});
