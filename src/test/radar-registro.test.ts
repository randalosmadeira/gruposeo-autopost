import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { ADAPTERS, routeEngineRequest, type EngineDeps } from '../../supabase/functions/_shared/engine-router';
import { ENGINE_SPECS, MODULES, engineSpec, moduleEdges, moduleByKey } from '../../supabase/functions/_shared/module-registry';
import { RADAR_ACTIONS, RADAR_MIN_ROLE, RADAR_PAID_ACTIONS } from '../../supabase/functions/_shared/radar-handler';
import { buildItems, normalizeFacts, normalizeRadar } from '../../supabase/functions/_shared/project-health-core';
import { EVENT_LABELS } from '../../supabase/functions/_shared/project-events';
import { ORG, PROJECT, USER } from './helpers/radar-fixtures';

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

function deps(over: Partial<EngineDeps> = {}): EngineDeps {
  return { fetchFn: (async () => new Response('x', { status: 404 })) as typeof fetch, lookupA: async () => ['93.184.216.34'], now: () => NOW, sleep: async () => undefined, speedApiKey: null, paidBlocked: false, ...over };
}
const tables = (role: string): Record<string, Row[]> => ({
  projects: [{ id: PROJECT, name: 'RDM', domain: 'rdmadvogados.com.br', wordpress_url: null, organization_id: ORG }],
  organization_members: [{ organization_id: ORG, user_id: USER, role, status: 'active' }], organizations: [{ id: ORG, owner_user_id: null }],
  project_focuses: [], project_focus_places: [], project_taxonomy_nodes: [], radar_competitors: [], radar_identities: [], radar_pages: [], radar_map_listings: [], radar_links: [], radar_coverage: [], radar_runs: [], radar_scores: [],
  radar_schedules: [], radar_site_scans: [], radar_identity_metrics: [], geo_places: [], geo_place_members: [], nexus_citations: [], nexus_prompts: [], nexus_search_performance: [], project_events: [],
});
const gate = (body: Record<string, unknown>, role = 'editor', d: Partial<EngineDeps> = {}) => {
  const t = tables(role); const f = fakeAdmin(t);
  return routeEngineRequest(f.admin, { userId: USER, body }, deps(d)).then((r) => ({ ...r, log: f.log, t }));
};

describe('Radar: módulo no núcleo único (manifesto e portão)', () => {
  it('registra o módulo `radar` com rota, entrada no portão, produtores e exportação por tabela', () => {
    const m = moduleByKey('radar')!;
    expect(m).toMatchObject({ key: 'radar', route: '/radar', status: 'ativo' });
    const spec = engineSpec('radar')!;
    expect(spec).toMatchObject({ handler: 'radar', scope: 'project', roleSource: 'members', cost: 'none' });
    expect(ADAPTERS.radar).toBeTypeOf('function');
    expect(m.produces).toEqual(expect.arrayContaining(['project_focuses', 'geo_places', 'radar_competitors', 'radar_identities', 'radar_links', 'radar_coverage', 'radar_scores', 'radar_schedules']));
    expect(m.exportTables.map((t) => t.table)).toEqual(expect.arrayContaining(['project_focuses', 'radar_competitors', 'radar_identities', 'radar_pages', 'radar_links', 'radar_scores']));
    expect(m.exportTables.every((t) => t.order.length >= 1 && t.pageSize > 0)).toBe(true);
    expect(ENGINE_SPECS.filter((s) => s.name === 'radar')).toHaveLength(1);
  });
  it('as ações e os papéis do manifesto são EXATAMENTE os do tratador (sem divergência entre portão e handler)', () => {
    const spec = engineSpec('radar')!;
    expect(Object.keys(spec.actions).sort()).toEqual([...RADAR_ACTIONS].sort());
    for (const a of RADAR_ACTIONS) expect(spec.actions[a].minRole).toBe(RADAR_MIN_ROLE[a]);
    expect(Object.entries(spec.actions).filter(([, v]) => v.paid).map(([k]) => k).sort()).toEqual([...RADAR_PAID_ACTIONS].sort());
    for (const a of ['focus_from_text', 'focus_save', 'territory_resolve', 'plan', 'run_batch', 'competitors_list', 'competitor_detail', 'scoreboard', 'attack_list', 'coverage', 'schedule_save']) expect(spec.actions[a]).toBeDefined();
  });
  it('liga ao resto do sistema por tabelas reais (taxonomia, Search Console, Observatório) e todas dispensáveis', () => {
    const edges = moduleEdges().filter((e) => e.to === 'radar');
    expect(edges.length).toBeGreaterThanOrEqual(3);
    expect(edges.every((e) => e.optional === true)).toBe(true);
    expect(edges.map((e) => e.from)).toEqual(expect.arrayContaining(['taxonomia', 'google', 'observatorio']));
    expect(MODULES.find((x) => x.key === 'radar')!.hasData({ radar: null } as never)).toBeNull(); // não instalado = sem dados
  });
  it('portão: leitura = membro, escrita = editor, território compartilhado = administrador', async () => {
    expect((await gate({ module: 'radar', action: 'overview', projectId: PROJECT }, 'member')).status).toBe(200);
    expect((await gate({ module: 'radar', action: 'focus_save', projectId: PROJECT, name: 'Algo' }, 'member')).body.error).toBe('role_not_allowed');
    expect((await gate({ module: 'radar', action: 'focus_save', projectId: PROJECT, name: 'Algo' }, 'editor')).status).toBe(200);
    expect((await gate({ module: 'radar', action: 'territory_sync', projectId: PROJECT, sources: [] }, 'editor')).body.error).toBe('role_not_allowed');
    expect((await gate({ module: 'radar', action: 'nao_existe', projectId: PROJECT })).body.error).toBe('unknown_action');
  });
  it('portão: ação paga passa pelo gancho do teto (sem guarda = negada; bloqueio global = negada) e as sem custo nunca chamam o guarda', async () => {
    expect((await gate({ module: 'radar', action: 'run_batch', projectId: PROJECT })).body.error).toBe('spend_guard_unavailable'); // falha fechada
    const guard = vi.fn(async () => ({ allowed: false as const, status: 423, error: 'global_paid_services_blocked' }));
    const r = await gate({ module: 'radar', action: 'run_batch', projectId: PROJECT }, 'editor', { spendGuard: guard });
    expect(r).toMatchObject({ status: 423, body: { error: 'global_paid_services_blocked' } });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(r.log.filter((l) => l.startsWith('insert:radar_'))).toEqual([]); // nada foi gravado
    const free = vi.fn(async () => ({ allowed: true as const }));
    await gate({ module: 'radar', action: 'overview', projectId: PROJECT }, 'member', { spendGuard: free });
    await gate({ module: 'radar', action: 'focus_from_text', projectId: PROJECT, text: 'foco em criminal na zona leste' }, 'editor', { spendGuard: free });
    expect(free).not.toHaveBeenCalled();
    const ok = await gate({ module: 'radar', action: 'backlinks_fetch', projectId: PROJECT, competitorIds: [] }, 'editor', { spendGuard: free });
    expect(free).toHaveBeenCalledTimes(1);
    expect(ok.status).toBe(422);
  });
  it('sem o fetch guardado configurado, a rodada nunca usa rede paga (falha fechada no adaptador)', async () => {
    const t = tables('editor'); const f = fakeAdmin(t);
    const r = await routeEngineRequest(f.admin, { userId: USER, body: { module: 'radar', action: 'run_batch', projectId: PROJECT } }, deps({ spendGuard: async () => ({ allowed: true }) }));
    expect(r.status).toBe(422); // sem foco ativo e sem chave: recusa clara, nada gasto
  });
});

describe('Radar: item no mapa de saúde do projeto e rótulos de eventos', () => {
  const facts = (radar: unknown) => normalizeFacts({ id: PROJECT, name: 'RDM', radar });
  const item = (radar: unknown) => buildItems(facts(radar), NOW).find((i) => i.key === 'radar')!;
  it('sem módulo = sem dados; sem foco = sem dados; ponta solta = atenção; tudo ligado = ok', () => {
    expect(item(undefined)).toMatchObject({ status: 'sem_dados', label: 'Radar de mercado' });
    expect(item({ focuses: 0 })).toMatchObject({ status: 'sem_dados' });
    const a = item({ focuses: 2, competitors: 14, last_run_at: '2026-11-19T10:00:00Z', coverage_done: 30, coverage_total: 60, identities_orphan: 2, competitors_without_link: 1 });
    expect(a.status).toBe('atencao');
    expect(a.detail).toContain('50% das buscas consultadas');
    expect(a.detail).toContain('3 pontas soltas fora da árvore');
    expect(a.action).toMatch(/Pontas soltas/);
    const ok = item({ focuses: 1, competitors: 3, last_run_at: null, coverage_done: 4, coverage_total: 4, identities_orphan: 0, competitors_without_link: 0 });
    expect(ok.status).toBe('ok');
    expect(ok.detail).toContain('nenhuma ponta solta');
    expect(normalizeRadar('x')).toBeNull();
    expect(normalizeRadar({ focuses: '3' })).toMatchObject({ focuses: 3, competitors: 0 });
  });
  it('fatos do radar têm rótulo em português na linha do tempo', () => {
    for (const k of ['radar.foco_criado', 'radar.rodada_concluida', 'radar.parada_no_teto', 'radar.rotina_executada', 'radar.concorrentes_fundidos', 'radar.pontas_soltas_ligadas']) expect(EVENT_LABELS[k]).toBeTruthy();
  });
});

describe('Radar: migração aditiva, RLS ligada, sem grant a anon/authenticated, rollback completo', () => {
  const sql = read('supabase', 'migrations', '20261120600000_radar_mercado.sql');
  const rollback = read('supabase', 'rollbacks', '20261120600000_radar_mercado_rollback.sql');
  const created = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  it('cria as tabelas esperadas e nenhuma tabela existente é alterada (exceto o CHECK de project_alerts)', () => {
    expect(created).toEqual(expect.arrayContaining(['geo_places', 'geo_place_members', 'project_focuses', 'project_focus_places', 'radar_competitors', 'radar_identities', 'radar_identity_metrics', 'radar_pages', 'radar_map_listings', 'radar_site_scans', 'radar_links', 'radar_runs', 'radar_coverage', 'radar_scores', 'radar_schedules']));
    const alters = [...sql.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]).filter((t) => !created.includes(t));
    expect([...new Set(alters)]).toEqual(['project_alerts']);
    expect(sql).not.toMatch(/drop table|truncate|delete from/i);
  });
  it('toda tabela do radar com projeto tem organization_id, trigger de organização, RLS e revoke; nada para anon/authenticated', () => {
    const body = (t: string) => { const i = sql.indexOf(`create table if not exists public.${t} (`); return sql.slice(i, sql.indexOf('\n);', i)); };
    const withProject = created.filter((t) => /project_id uuid not null/.test(body(t)));
    expect(withProject.length).toBe(13);
    for (const t of withProject) expect(sql).toContain(`'${t}'`); // listada no laço de trigger/RLS/revoke
    expect(sql).toMatch(/execute function public\.profile_assert_project_org\(\)/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.%I from public, anon, authenticated/);
    expect(sql).toMatch(/foreach t in array array\['geo_places', 'geo_place_members'\]/);
    expect(sql).not.toMatch(/grant[^;]*to[^;]*(anon|authenticated)/i);
    expect(sql).toMatch(/grant all on table public\.%I to service_role/);
    for (const t of withProject) expect(body(t)).toMatch(/organization_id uuid not null references public\.organizations/);
  });
  it('checagens de integridade: peso 1-10, públicos permitidos, rótulo do score só "estimado", métricas só com origem rotulada', () => {
    expect(sql).toMatch(/weight smallint not null default 5 check \(weight between 1 and 10\)/);
    expect(sql).toMatch(/audiences <@ array\['urgencia', 'alvo', 'interesse', 'engajamento', 'retencao'\]/);
    expect(sql).toMatch(/label text not null default 'estimado' check \(label = 'estimado'\)/);
    expect(sql).toMatch(/metrics_label in \('api_oficial', 'trecho_publico_do_buscador', 'provedor_terceiro', 'indisponivel'\)/);
    expect(sql).toMatch(/license text/);
    expect(sql).toMatch(/attribution text/);
    expect(sql).toMatch(/project_radar_summary/);
    expect(sql).toMatch(/'radar'/);
  });
  it('cron próprio com chave própria (hash no banco, segredo no cofre) e função sem login', () => {
    expect(sql).toMatch(/'radar-run'/);
    expect(sql).toMatch(/zica_radar_run_key/);
    expect(sql).toMatch(/cron\.schedule\(\s*'zica-radar-run-hourly'/);
    const cfg = read('supabase', 'config.toml');
    expect(cfg).toMatch(/\[functions\.radar-run\]\s*\r?\nverify_jwt = false/);
    const fn = read('supabase', 'functions', 'radar-run', 'index.ts');
    expect(fn).toContain("x-zica-automation-key");
    expect(fn).toContain("eq('name', 'radar-run')");
    expect(fn).toContain('providerFetch');
    expect(fn).toContain('scopedServe');
    expect(fn).not.toMatch(/Deno\.serve/);
  });
  it('o rollback derruba tudo o que a migração criou, restaura o CHECK antigo e remove cron e chave', () => {
    for (const t of created) expect(rollback).toContain(`drop table if exists public.${t};`);
    expect(rollback).toMatch(/drop function if exists public\.project_radar_summary\(uuid\)/);
    expect(rollback).toMatch(/cron\.unschedule/);
    expect(rollback).toMatch(/delete from public\.automation_ingress_keys where name = 'radar-run'/);
    expect(rollback).toMatch(/delete from public\.project_alerts where source = 'radar'/);
    expect(rollback).toMatch(/check \(source in \('speed', 'backlinks'\)\)/);
  });
  it('a função de borda `engine` entrega o fetch guardado e roda dentro do contexto de gasto', () => {
    const idx = read('supabase', 'functions', 'engine', 'index.ts');
    expect(idx).toContain('providerFetch');
    expect(idx).toContain('scopedServe');
    expect(idx).toContain("orchestrator.call('seo_analysis'"); // tarefa de IA em modo econômico
    expect(idx).not.toMatch(/^\s*Deno\.serve\(/m);
    expect(idx).not.toMatch(/console\.log\([^)]*(secret|key)/i);
  });
});
