import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('client and admin surface separation', () => {
  const app = read('src/App.tsx');
  const sidebar = read('src/components/layout/Sidebar.tsx');
  const settings = read('src/pages/SettingsPage.tsx');
  const wordpress = read('src/components/settings/WordPressSitesCard.tsx');
  const adminRoute = read('src/components/AdminRoute.tsx');
  const dashboard = read('src/pages/DashboardNew.tsx');

  it('exposes only the five commercial destinations in the client menu', () => {
    for (const label of ['Visão Geral', 'Conteúdo & Notícias', 'Calendário Editorial', 'Meus Blogs', 'Minha Conta']) {
      expect(sidebar).toContain(label);
    }
    expect(sidebar).toContain('isAdmin ?');
    expect(sidebar).toContain('Motor de IA & Chaves');
    expect(sidebar).toContain('Engenharia de Prompts');
    expect(sidebar).toContain('Filas & Operações');
  });

  it('protects technical routes with the server-backed CEO check', () => {
    expect(adminRoute).toContain('useAdminAccess');
    expect(read('src/hooks/useAdminAccess.ts')).toContain("supabase.rpc('is_ceo')");
    expect(app).toContain('<AdminRoute><SettingsPage mode="ai" /></AdminRoute>');
    expect(app).toContain('<AdminRoute><SettingsPage mode="prompts" /></AdminRoute>');
    expect(app).toContain('<AdminRoute><QueueMonitor /></AdminRoute>');
  });

  it('does not render provider, token, prompt or IndexNow controls in client modes', () => {
    expect(settings).toContain("mode === 'ai'");
    expect(settings).toContain("mode === 'prompts'");
    expect(settings).toContain("mode === 'integrations'");
    expect(settings).not.toContain('<TabsTrigger value="prompts"');
  });

  it('keeps legacy WordPress credentials restricted to administrators', () => {
    expect(wordpress).toContain("defaultValue={isAdmin ? 'standard' : 'plugin'}");
    expect(wordpress).toContain('Código de Ativação do Plugin');
    expect(wordpress).toContain("{isAdmin ? <TabsContent value=\"standard\"");
  });

  it('keeps autonomous agents and technical monitoring off the client dashboard', () => {
    expect(dashboard).toContain('useAdminAccess');
    expect(dashboard).toContain('useNewsAgents({ enabled: isAdmin })');
    expect(dashboard).toContain('{isAdmin && (');
    expect(dashboard).toContain('<SEOAgentPanel />');
    expect(dashboard).toContain('<AuditReportPanel />');
    expect(dashboard).toContain('<CronNotificationsPanel />');
    expect(dashboard).toContain('<WordPressHealthCard projects={projects} compact />');
  });

  it('does not expose ZicaCortex branding inside Zica.IA Posts screens', () => {
    const visibleSurfaces = [
      read('src/pages/Auth.tsx'),
      read('src/components/brand/TrafficBrainHero.tsx'),
      read('src/components/brand/CentralCortex.tsx'),
    ].join('\n');

    expect(visibleSurfaces).not.toContain('Central Cortex');
    expect(visibleSurfaces).toContain('Zica.IA Posts');
  });
});
