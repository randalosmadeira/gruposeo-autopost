import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
// Renomeado em 2c2c369 (fix(db): higiene de governança pós-auditoria
// 2026-09-18) para bater com o timestamp realmente aplicado em produção.
const migration = read('supabase/migrations/20260917094128_token_cost_governance.sql');

describe('token cost governance (2026-09-16 audit remediation)', () => {
  it('recreates the token_usage_logs access policies dropped by the admin-only hardening migration', () => {
    expect(migration).toContain('token_usage_logs_owner_or_member_select');
    expect(migration).toContain('token_usage_logs_owner_insert');
    expect(migration).toContain('is_organization_member(organization_id)');
  });

  it('prices every new row from a real catalog instead of always writing zero', () => {
    expect(migration).toContain('model_pricing_catalog');
    expect(migration).toContain('trg_price_token_usage_log');
    expect(migration).toContain('claude-sonnet-4-5-20250929');
    expect(migration).toContain('claude-haiku-4-5-20251001');
  });

  it('mirrors priced usage into organization_usage_ledger for every row that has an organization', () => {
    expect(migration).toContain('trg_ledger_token_usage_log');
    expect(migration).toContain("'input_tokens'");
    expect(migration).toContain("'output_tokens'");
    expect(migration).toContain("'cost_usd_micros'");
  });

  it('no longer hardcodes a pending zero cost in the usage sink', () => {
    const resolver = read('supabase/functions/_shared/byok-resolver.ts');
    expect(resolver).not.toContain('estimated_cost_usd: 0');
    expect(resolver).not.toContain('cost_pending_pricing_resolution');
  });
});
