import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migrationName = readdirSync(resolve(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_electoral_gestor_access_and_supporter_recovery.sql'));

describe('electoral Gestor access and supporter link', () => {
  const app = read('src/App.tsx');
  const main = read('src/main.tsx');
  const sidebar = read('src/components/layout/Sidebar.tsx');
  const mobile = read('src/components/layout/MobileDock.tsx');
  const header = read('src/components/layout/Header.tsx');
  const network = read('src/pages/ElectoralPortalNetwork.tsx');
  const admin = read('supabase/functions/supporter-avatar-admin/index.ts');
  const publicApi = read('supabase/functions/supporter-avatar-public-v2/index.ts');
  const migration = migrationName ? read(`supabase/migrations/${migrationName}`) : '';

  it('routes every private electoral screen through the server-backed electoral guard', () => {
    expect(read('src/hooks/useElectoralAccess.ts')).toContain("supabase.rpc('can_manage_electoral_campaign')");
    expect(read('src/components/ElectoralRoute.tsx')).toContain('useElectoralAccess');
    expect(app).toContain('<ElectoralRoute><ElectoralCampaign /></ElectoralRoute>');
    expect(app).toContain('<ElectoralRoute><SupportersAdminPage /></ElectoralRoute>');
  });

  it('shows the electoral workspace to authorized Gestor users on desktop and mobile', () => {
    expect(sidebar).toContain('Campanha Eleitoral');
    expect(sidebar).toContain('Base de Apoiadores');
    expect(sidebar).toContain('canManageElectoral');
    expect(mobile).toContain("to: '/electoral-campaign'");
    expect(header).toContain('Central Eleitoral 1470');
  });

  it('uses /apoiadores as the canonical public route without loading the authenticated shell', () => {
    expect(main).toContain('normalizedPath === "/apoiadores"');
    expect(main).toContain('normalizedPath.startsWith("/collab/")');
    expect(network).toContain("const SUPPORTER_PATH = '/apoiadores'");
    expect(network).toContain('Copiar link de apoiadores');
    expect(app).toContain('<Route path="/apoiadores" element={<SupporterAvatar1470 />} />');
  });

  it('authorizes only CEO or active electoral-plan management roles', () => {
    expect(migration).toContain('create or replace function public.can_manage_electoral_campaign()');
    expect(migration).toContain("m.role in ('owner', 'admin', 'campaign_manager')");
    expect(migration).toContain("(p.features ->> 'electoral')::boolean");
    expect(migration).toContain("m.status = 'active'");
    expect(admin).toContain('rpc("can_manage_electoral_campaign")');
    expect(admin).not.toContain('public_token_hash');
    expect(admin).not.toContain('fingerprint_hash');
  });

  it('preserves and surfaces stale supporter jobs instead of leaving them running forever', () => {
    expect(migration).toContain('reconcile_stale_supporter_avatar_jobs');
    expect(migration).toContain("status = 'needs_review'");
    expect(migration).toContain('stale_job_reconciled');
    expect(migration).not.toMatch(/generation_count\s*=\s*generation_count\s*[+-]/);
    expect(admin).toContain('rpc("reconcile_stale_supporter_avatar_jobs")');
    expect(publicApi).toContain('rpc("reconcile_stale_supporter_avatar_jobs")');
  });

  it('keeps the repository public endpoint aligned with the deployed v5 contract', () => {
    expect(publicApi).toContain('supporter-avatar-resumable-v5');
    expect(publicApi).toContain('technicalRetriesFree: true');
    expect(publicApi).toContain('resumable: true');
  });
});
