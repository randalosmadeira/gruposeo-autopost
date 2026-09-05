import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260905221413_manager_commercial_and_publication_policies.sql');
const consoleEdge = read('supabase/functions/organization-console/index.ts');
const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
const wordpressOperations = read('supabase/functions/wordpress-operations/index.ts');
const panel = read('src/components/admin/CommercialGovernancePanel.tsx');

describe('manager-controlled commercial and publication policies', () => {
  it('stores commercial terms and versioned organization policies behind RLS', () => {
    expect(migration).toContain('organization_operating_policies');
    expect(migration).toContain('organization_policy_versions');
    expect(migration).toContain('commercial_plan_versions');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain("p_overage_policy not in ('block','per_article','package')");
  });

  it('keeps privileged mutations restricted to service role', () => {
    expect(migration).toContain('update_organization_business_policy');
    expect(migration).toContain('from public,anon,authenticated');
    expect(migration).toContain('to service_role');
    expect(consoleEdge).toContain('adminActions.has(action)');
    expect(consoleEdge).toContain('scoped.rpc("is_ceo")');
  });

  it('enforces publication permission at the final WordPress barrier', () => {
    expect(publisher).toContain('check_organization_publication_permission');
    expect(publisher).toContain('organization_boundary');
    expect(publisher).toContain('publication_approval_required');
    expect(wordpressOperations).toContain('automated');
  });

  it('provides manager controls for price, cycle, overage and approval roles', () => {
    expect(panel).toContain('Tabela comercial');
    expect(panel).toContain('Ciclo de cobrança');
    expect(panel).toContain('Política de excedente');
    expect(panel).toContain('Podem aprovar');
    expect(panel).toContain('Salvar e versionar política');
  });
});
