import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const sidebar = read('src/components/layout/Sidebar.tsx');
const mobile = read('src/components/layout/MobileDock.tsx');
const routeGuard = read('src/components/ElectoralRoute.tsx');
const accessHook = read('src/hooks/useElectoralAccess.ts');
const portal = read('src/pages/ElectoralPortalNetwork.tsx');
const campaign = read('src/pages/ElectoralCampaign.tsx');
const adminApi = read('supabase/functions/supporter-avatar-admin/index.ts');
const accessMigration = read('supabase/migrations/20260911192337_electoral_gestor_access_and_supporter_recovery.sql');

describe('matriz de aceite do usuário GESTOR eleitoral', () => {
  it('protege todas as telas operacionais eleitorais pela autorização server-backed', () => {
    for (const route of [
      '/electoral-campaign',
      '/electoral-campaign/portal-network',
      '/electoral-campaign/editorial-console',
      '/electoral-campaign/history',
      '/electoral-campaign/supporters',
    ]) {
      expect(app).toMatch(new RegExp(`path="${route.replaceAll('/', '\\/')}" element=\\{<ElectoralRoute>`));
    }
    expect(accessHook).toContain("supabase.rpc('can_manage_electoral_campaign')");
    expect(routeGuard).toContain('<Navigate to="/dashboard" replace />');
    expect(routeGuard).toContain('Nenhuma informação eleitoral foi carregada');
  });

  it('mantém a engenharia de prompts restrita ao administrador', () => {
    expect(app).toContain('path="/electoral-campaign/supporter-avatar-prompts" element={<AdminRoute>');
    expect(sidebar).not.toContain('/electoral-campaign/supporter-avatar-prompts');
  });

  it('expõe o espaço eleitoral no desktop e o ponto de entrada no mobile', () => {
    for (const label of ['Campanha Eleitoral', 'Rede & Portais', 'Base de Apoiadores']) {
      expect(sidebar).toContain(label);
    }
    expect(sidebar).toContain('canManageElectoral ?');
    expect(mobile).toContain("to: '/electoral-campaign'");
    expect(mobile).toContain("label: 'Eleitoral'");
  });

  it('oferece o link canônico de apoiadores na campanha e na rede de portais', () => {
    expect(campaign).toContain('href="/apoiadores"');
    expect(portal).toContain("const SUPPORTER_PATH = '/apoiadores'");
    expect(portal).toContain('Copiar link de apoiadores');
    expect(portal).toContain('Abrir link de apoiadores');
  });

  it('autoriza somente funções gestoras ativas em plano eleitoral', () => {
    expect(accessMigration).toContain("m.role in ('owner', 'admin', 'campaign_manager')");
    expect(accessMigration).toContain("m.status = 'active'");
    expect(accessMigration).toContain("s.status in ('trialing', 'active', 'past_due')");
    expect(accessMigration).toContain("(p.features ->> 'electoral')::boolean");
  });

  it('aplica a mesma RPC na Edge administrativa e não expõe segredos de recuperação', () => {
    expect(adminApi).toContain('rpc("can_manage_electoral_campaign")');
    expect(adminApi).toContain('electoral_manager_access_required');
    expect(adminApi).not.toContain('public_token_hash');
    expect(adminApi).not.toContain('fingerprint_hash');
  });
});

