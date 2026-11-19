import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PROJECT_COLUMN_LIST, PROJECT_COLUMNS, hasUsableCredential, passwordPatch } from '@/lib/project-columns';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'test' && name !== 'node_modules' && name !== 'integrations') walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const srcFiles = walk(join(ROOT, 'src'));

describe('S1: a senha do WordPress não pode ser lida pelo navegador', () => {
  it('a lista de colunas legíveis não contém a senha e tem a coluna gerada', () => {
    expect(PROJECT_COLUMN_LIST as readonly string[]).not.toContain('wordpress_app_password');
    expect(PROJECT_COLUMN_LIST as readonly string[]).toContain('wordpress_has_credential');
    expect(PROJECT_COLUMNS).not.toMatch(/password/);
    expect(new Set(PROJECT_COLUMN_LIST).size).toBe(PROJECT_COLUMN_LIST.length);
  });

  it('a migração que concede SELECT tem exatamente as mesmas colunas da lista do front', () => {
    const sql = read('supabase/migrations/20261116000100_s1_projects_sem_leitura_da_senha.sql');
    const m = sql.match(/GRANT SELECT \(([\s\S]*?)\) ON public\.projects TO authenticated;/);
    expect(m).toBeTruthy();
    const granted = m![1].split(',').map((c) => c.trim()).filter(Boolean);
    expect(granted).not.toContain('wordpress_app_password');
    expect([...granted].sort()).toEqual([...PROJECT_COLUMN_LIST].sort());
    expect(sql).toMatch(/REVOKE SELECT ON public\.projects FROM authenticated;/);
  });

  it('a coluna gerada existe na migração A e o rollback das duas migrações existe', () => {
    expect(read('supabase/migrations/20261116000000_s1_projects_credencial_gerada.sql')).toMatch(/wordpress_has_credential[\s\S]*GENERATED ALWAYS AS[\s\S]*STORED/);
    expect(read('supabase/rollbacks/20261116000000_s1_projects_credencial_gerada_rollback.sql')).toMatch(/DROP COLUMN IF EXISTS wordpress_has_credential/);
    expect(read('supabase/rollbacks/20261116000100_s1_projects_sem_leitura_da_senha_rollback.sql')).toMatch(/GRANT SELECT ON public\.projects TO authenticated/);
  });

  it('o tipo de leitura de projects não traz a senha', () => {
    const types = read('src/integrations/supabase/types.ts');
    const m = types.match(/\n {6}projects: \{\s+Row: \{([\s\S]*?)\bInsert: \{/);
    expect(m).toBeTruthy();
    const row = m![1];
    expect(row).not.toMatch(/wordpress_app_password:/);
    expect(row).toMatch(/wordpress_has_credential: boolean/);
  });

  it('nenhum arquivo do front lê projects com select("*") / select() sem colunas, nem pede a senha', () => {
    const bad: string[] = [];
    for (const f of srcFiles) {
      const code = readFileSync(f, 'utf-8');
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      const re = /\.from\((['"`])projects\1\)([\s\S]{0,400}?)(?=;|\n\s*\n)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const chain = m[2];
        if (/\.select\(\s*(['"`])\*\1/.test(chain) || /\.select\(\s*\)/.test(chain)) bad.push(`${rel}: select('*') ou select() em projects`);
        if (/\.select\([^)]*wordpress_app_password/.test(chain)) bad.push(`${rel}: pede wordpress_app_password`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhum arquivo do front lê a senha de um objeto de projeto (só campos de formulário a escrevem)', () => {
    const bad: string[] = [];
    for (const f of srcFiles) {
      const code = readFileSync(f, 'utf-8');
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      if (/\b(project|selectedProject|p|proj|row)\??\.wordpress_app_password\b/.test(code)) bad.push(rel);
    }
    expect(bad).toEqual([]);
  });

  it('useProjects lê, cria e atualiza só com a lista explícita de colunas', () => {
    const hook = read('src/hooks/useProjects.tsx');
    expect(hook).not.toMatch(/\.select\(\s*(['"`])\*\1\s*\)/);
    expect((hook.match(/\.select\(PROJECT_COLUMNS\)/g) || []).length).toBe(3);
    expect(hook).not.toMatch(/\.select\(\s*\)/);
  });

  it('o navegador não manda mais a senha salva ao servidor nem ao WordPress (as telas e hooks)', () => {
    const files = [
      'src/components/internal-linking/InternalLinkingCard.tsx',
      'src/components/internal-linking/InternalLinkingDashboard.tsx',
      'src/components/settings/WordPressSitesCard.tsx',
      'src/hooks/useWordPressStats.tsx',
    ];
    for (const f of files) {
      const code = read(f);
      expect(code, f).not.toMatch(/\bapi_key:\s*project\./);
      expect(code, f).not.toMatch(/wordpress_app_password:\s*project\./);
      expect(code, f).not.toMatch(/btoa\(`\$\{project\./);
    }
    expect(read('src/hooks/useWordPressStats.tsx')).not.toMatch(/Basic \$\{/);
  });

  it('o servidor que lia a credencial com a sessão do usuário passou a ler com a chave de serviço, mantendo a checagem de posse', () => {
    const fn = read('supabase/functions/analyze-wp-articles/index.ts');
    const i = fn.indexOf('const projectReader');
    expect(i).toBeGreaterThan(0);
    expect(fn.slice(i, i + 700)).toMatch(/\.eq\("user_id", user\.id\)/);
  });
});

describe('S1: regras da senha na tela de edição', () => {
  it('em branco NÃO vai no UPDATE (mantém a guardada); digitada vai', () => {
    expect(passwordPatch('')).toEqual({});
    expect(passwordPatch(undefined)).toEqual({});
    expect(passwordPatch('abcd efgh')).toEqual({ wordpress_app_password: 'abcd efgh' });
  });
  it('conectado = URL + usuário + (senha digitada ou já guardada)', () => {
    expect(hasUsableCredential('https://x.com', 'ana', '', true)).toBe(true);
    expect(hasUsableCredential('https://x.com', 'ana', 'nova', false)).toBe(true);
    expect(hasUsableCredential('https://x.com', 'ana', '', false)).toBe(false);
    expect(hasUsableCredential('', 'ana', 'nova', true)).toBe(false);
    expect(hasUsableCredential('https://x.com', '', 'nova', true)).toBe(false);
  });
});
