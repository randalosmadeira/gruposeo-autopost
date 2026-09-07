import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('AI provider keys come only from GitHub', () => {
  const workflow = read('.github/workflows/zica-ai-vps-deploy.yml');
  const migration = read('supabase/migrations/20260907190000_ai_keys_github_single_source.sql');
  const validator = read('supabase/functions/validate-ai-key/index.ts');

  it('the deploy validates each provider key with the provider before touching the Vault', () => {
    expect(workflow).toContain('Validate OpenAI secret before touching the Vault');
    expect(workflow).toContain('https://api.openai.com/v1/models');
    expect(workflow).toContain('Synchronize Anthropic secret with Supabase Vault (optional)');
    expect(workflow).toContain('https://api.anthropic.com/v1/models');
    expect(workflow).toContain('ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}');
  });

  it('per-user OpenAI/Anthropic keys are cleared and cannot come back', () => {
    expect(migration).toContain('new.openai_api_key := null;');
    expect(migration).toContain('new.anthropic_api_key := null;');
    expect(migration).toContain('before insert or update on public.user_settings');
    expect(migration).toContain("message = 'provider_managed_by_github'");
  });

  it('manual Vault writes are closed to signed-in users and stale backups are dropped', () => {
    expect(migration).toContain('revoke execute on function public.set_zica_ai_provider_secret(text, text) from authenticated;');
    expect(migration).toContain('revoke execute on function public.delete_zica_ai_provider_secret(text) from authenticated;');
    expect(migration).toContain("delete from vault.secrets where name like 'paused_%';");
  });

  it('the validation function never persists platform-managed providers', () => {
    expect(validator).toContain('const PLATFORM_MANAGED: ReadonlySet<string> = new Set(["openai", "anthropic"]);');
    expect(validator).toContain('if (result.valid && !platformManaged) {');
    expect(validator).toContain('managed_by: platformManaged ? "github" : "user"');
  });
});
