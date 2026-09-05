import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260905203000_multitenant_commercial_foundation.sql'), 'utf8');
const adr = readFileSync(resolve(process.cwd(), 'docs/architecture/ADR-005-multitenant-commercial-core.md'), 'utf8');
const hardening = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260905215500_harden_multitenant_privileged_functions.sql'), 'utf8');

describe('Zica.IA Posts multi-tenant commercial foundation', () => {
  it('keeps ZicaCortex outside the tenant and data model', () => {
    expect(adr).toContain('ZicaCortex como software independente');
    expect(sql).not.toMatch(/create table[^;]*cortex/i);
  });

  it('defines the contracted commercial limits', () => {
    expect(sql).toContain("('commercial', 'Zica.IA Posts Comercial', 3, 300, 6, false");
    expect(sql).toContain("('byok', 'Zica.IA Posts BYOK', 3, 650, 6, true");
    expect(sql).toContain('guard_project_plan_limit');
  });

  it('uses organization-scoped transactional quotas and idempotency', () => {
    expect(sql).toContain('reserve_article_quota');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain('monthly_article_quota_reached');
  });

  it('stores only BYOK metadata in public tables and secrets in Vault', () => {
    expect(sql).toContain('vault.create_secret');
    expect(sql).toContain('vault.update_secret');
    expect(sql).toContain('vault_secret_name');
    expect(sql).not.toMatch(/organization_provider_credentials[\s\S]{0,900}api_key\s+text/i);
    expect(hardening).toContain('revoke all on function public.set_organization_openai_byok(uuid,text) from authenticated');
    expect(hardening).toContain('grant execute on function public.set_organization_openai_byok(uuid,text) to service_role');
  });

  it('keeps recursive RLS helpers outside the exposed public schema', () => {
    expect(hardening).toContain('create schema if not exists private');
    expect(hardening).toContain('security invoker');
    expect(hardening).toContain('private.has_organization_role');
  });

  it('limits reusable brand assets to six non-Base64 slots', () => {
    expect(sql).toContain('slot between 1 and 6');
    expect(sql).toContain("original_storage_path !~* '^data:'");
    expect(sql).toContain("format = 'webp'");
  });

  it('requires confirmation for Copilot external and destructive tools', () => {
    expect(sql).toContain("('publish_article','Publicar artigo','external',true,false)");
    expect(sql).toContain("('manage_provider_secrets','Gerenciar segredos de provedores','destructive',true,true)");
  });
});
