import { describe, expect, it, vi } from 'vitest';
import { fakeAdmin, type Row, type RpcHandler } from './helpers/fake-admin';
import { fakeSpendDb, ORG_A, ORG_B, USER_1 } from './helpers/fake-spend';
import { ADAPTERS, routeEngineRequest, type EngineDeps } from '../../supabase/functions/_shared/engine-router';
import { ENGINE_SPECS, MODULES, engineSpec } from '../../supabase/functions/_shared/module-registry';
import { checkSpend, hasRole, roleRank, resolveProject, loadMemberships, fail } from '../../supabase/functions/_shared/engine-kernel';
import { EVENT_KIND_RE, buildEventRow, describeEvent, handleEventsAction, recordEvent, recordEvents, sanitizeEventData } from '../../supabase/functions/_shared/project-events';
import { OVERVIEW_ACTIONS, handleOverviewAction } from '../../supabase/functions/_shared/overview-handler';
import { BACKLINK_ACTIONS, handleBacklinkAction } from '../../supabase/functions/_shared/backlinks-handler';
import { TAXONOMY_ACTIONS, handleTaxonomyAction } from '../../supabase/functions/_shared/taxonomy-handler';
import { SPEED_ACTIONS, handleSpeedAction } from '../../supabase/functions/_shared/speed-handler';
import { LIFECYCLE_ACTIONS, handleLifecycleAction } from '../../supabase/functions/_shared/project-lifecycle-handler';
import { SPEND_POLICY_ACTIONS, handleSpendPolicyAction } from '../../supabase/functions/_shared/spend-policy-handler';
import { INDEXATION_ACTIONS, handleIndexationAction } from '../../supabase/functions/_shared/indexation-handler';
import { EVENTS_ACTIONS } from '../../supabase/functions/_shared/project-events';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const P_OTHER = '00000000-0000-4000-8000-0000000000b9';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

const RAW_OVERVIEW = { days: 28, gsc: { window: null, totals: {}, by_host: [], by_section: [], top_pages: [], top_queries: [] }, ga4: { window: null, totals: {}, channels: [], top_pages: [] }, signals: [], articles: null };
const world = (role: string | null = 'owner', over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [
    { id: P, name: 'RDM', domain: 'rdmadvogados.com.br', wordpress_url: null, organization_id: ORG, lifecycle_status: 'ativo', paused_snapshot: null },
    { id: P_OTHER, name: 'Alheio', domain: 'outra-org.com', wordpress_url: null, organization_id: OTHER, lifecycle_status: 'ativo', paused_snapshot: null },
  ],
  organization_members: role ? [{ organization_id: ORG, user_id: USER, role, status: 'active' }] : [{ organization_id: OTHER, user_id: USER, role: 'owner', status: 'active' }],
  organizations: [{ id: ORG, owner_user_id: null }, { id: OTHER, owner_user_id: null }],
  project_backlinks: [{ id: '00000000-0000-4000-8000-000000000101', organization_id: ORG, project_id: P, target_host: 'rdmadvogados.com.br', kind: 'own', source_url: 'https://a.com/p', source_host: 'a.com', source_domain: 'a.com', origin: 'manual', status: 'live', first_seen_at: '2026-11-10T10:00:00.000Z' }],
  project_backlink_settings: [], project_alerts: [], project_speed_runs: [], project_speed_schedules: [], project_site_maps: [], project_events: [], index_urls: [], index_status: [], index_submissions: [], index_hygiene: [], index_keys: [], project_lifecycle_events: [],
  news_agents: [], rss_schedules: [], project_taxonomy_nodes: [], market_competitors: [], market_campaigns: [], market_serp_results: [], ...over,
});
const RPCS: Record<string, RpcHandler> = { site_overview_data: () => ({ data: RAW_OVERVIEW, error: null }), project_health_inputs: () => ({ data: [], error: null }), indexation_gsc_pages: () => ({ data: [], error: null }) };

function netDeps(over: Partial<EngineDeps> = {}): EngineDeps {
  return { fetchFn: (async () => new Response('x', { status: 404 })) as typeof fetch, lookupA: async () => ['93.184.216.34'], now: () => NOW, sleep: async () => undefined, speedApiKey: 'chave-de-teste', paidBlocked: true, ...over };
}
const portal = (body: Record<string, unknown>, o: { role?: string | null; tables?: Record<string, Row[]>; deps?: Partial<EngineDeps>; rpcs?: Record<string, RpcHandler> } = {}) => {
  const tables = o.tables || world(o.role === undefined ? 'owner' : o.role);
  const fake = fakeAdmin(tables, o.rpcs || RPCS);
  return routeEngineRequest(fake.admin, { userId: USER, body }, netDeps(o.deps)).then((r) => ({ ...r, tables, log: fake.log }));
};
const memberRoles = (tables: Record<string, Row[]>) => new Map<string, string>((tables.organization_members as Array<{ organization_id: string; role: string }>).map((m) => [m.organization_id, m.role]));

describe('portão engine: despacho idêntico ao handler direto', () => {
  const dnet = { fetchFn: netDeps().fetchFn, lookupA: netDeps().lookupA, now: () => NOW };
  const same = async (module: string, action: string, extra: Record<string, unknown>, direct: (admin: ReturnType<typeof fakeAdmin>['admin'], tables: Record<string, Row[]>, body: Record<string, unknown>, roles: Map<string, string>) => Promise<{ status: number; body: Record<string, unknown> }>) => {
    const viaPortal = await portal({ module, action, ...extra });
    const t2 = world('owner');
    const f2 = fakeAdmin(t2, RPCS);
    const body = { action, ...extra };
    const viaDirect = await direct(f2.admin, t2, body, memberRoles(t2));
    expect({ status: viaPortal.status, body: viaPortal.body }).toEqual({ status: viaDirect.status, body: viaDirect.body });
    return viaPortal;
  };
  it('backlinks.get', async () => {
    const r = await same('backlinks', 'get', { projectId: P }, (a, _t, body, roles) => handleBacklinkAction(a, { action: 'get', body, userId: USER, roleByOrg: roles, deps: dnet }));
    expect(r.status).toBe(200);
    expect((r.body.links as unknown[]).length).toBe(1);
  });
  it('velocidade.history', async () => {
    const r = await same('velocidade', 'history', { projectId: P }, (a, _t, body, roles) => handleSpeedAction(a, { action: 'history', body, userId: USER, roleByOrg: roles, deps: { fetchFn: dnet.fetchFn, now: dnet.now, apiKey: 'chave-de-teste' } }));
    expect(r.status).toBe(200);
  });
  it('visao_geral.overview', async () => {
    const r = await same('visao_geral', 'overview', { projectId: P }, (a, _t, body, roles) => handleOverviewAction(a, { action: 'overview', body, userId: USER, roleByOrg: roles, deps: dnet }));
    expect(r.status).toBe(200);
  });
  it('central.health_overview', async () => {
    const r = await same('central', 'health_overview', { organizationId: ORG }, (a, _t, body, roles) => handleLifecycleAction(a, { action: 'health_overview', body, userId: USER, roleByOrg: roles, deps: { now: () => NOW } }));
    expect(r.status).toBe(200);
  });
  it('taxonomia.overview e mercado.competitors_list', async () => {
    const a = await same('taxonomia', 'overview', { projectId: P }, (adm, _t, body, roles) => handleTaxonomyAction(adm, { action: 'overview', body, userId: USER, roleByOrg: roles, deps: dnet }));
    const b = await same('mercado', 'competitors_list', { projectId: P }, (adm, _t, body, roles) => handleTaxonomyAction(adm, { action: 'competitors_list', body, userId: USER, roleByOrg: roles, deps: dnet }));
    expect([a.status, b.status]).toEqual([200, 200]);
  });
  it('teto_gasto.status (a organização vem do corpo; papel de dono pela tabela de organizações)', async () => {
    const mk = () => { const spend = fakeSpendDb({ now: () => NOW }); const tables = { projects: [{ id: P, name: 'x', organization_id: ORG_A }], organization_spend_policy: [], organization_members: [{ organization_id: ORG_A, user_id: USER_1, role: 'viewer', status: 'active' }], organizations: [{ id: ORG_A, owner_user_id: null }] } as Record<string, Row[]>; return { admin: { rpc: spend.rpc, from: fakeAdmin(tables).admin.from } }; };
    const body = { module: 'teto_gasto', action: 'status', organizationId: ORG_A };
    const viaPortal = await routeEngineRequest(mk().admin, { userId: USER_1, body }, netDeps({ paidBlocked: true }));
    const viaDirect = await handleSpendPolicyAction(mk().admin, { action: 'status', body: { action: 'status', organizationId: ORG_A }, userId: USER_1, roleByOrg: new Map([[ORG_A, 'viewer']]), paidBlocked: true });
    expect(viaPortal).toEqual(viaDirect);
    expect(viaPortal.status).toBe(200);
    expect(viaPortal.body).toMatchObject({ organization_id: ORG_A, role: 'viewer', paid_blocked: true });
  });
  it('indexacao.overview', async () => {
    const viaPortal = await portal({ module: 'indexacao', action: 'overview', projectId: P });
    const t2 = world('owner');
    const direct = await handleIndexationAction(fakeAdmin(t2, RPCS).admin, { action: 'overview', body: { action: 'overview', projectId: P }, userId: USER, roleByOrg: memberRoles(t2), deps: { ...dnet, sleep: async () => undefined } });
    expect({ status: viaPortal.status, body: viaPortal.body }).toEqual({ status: direct.status, body: direct.body });
    expect(viaPortal.status).toBe(200);
  });
});

describe('portão engine: recusas', () => {
  it('corpo inválido, módulo ausente, ação ausente, módulo e ação desconhecidos (inclusive nomes herdados do JavaScript)', async () => {
    const f = fakeAdmin(world()).admin;
    for (const body of [null, 'texto', [], 5]) expect((await routeEngineRequest(f, { userId: USER, body }, netDeps())).body.error).toBe('body_invalid');
    expect((await portal({ action: 'get' })).body).toMatchObject({ error: 'module_required', message: expect.stringMatching(/módulo/i) });
    expect((await portal({ module: 'backlinks' })).body.error).toBe('action_required');
    const um = await portal({ module: 'nao_existe', action: 'get' });
    expect(um.status).toBe(404);
    expect(um.body).toMatchObject({ error: 'unknown_module', message: expect.stringMatching(/não existe/) });
    expect((await portal({ module: 'constructor', action: 'get' })).body.error).toBe('unknown_module');
    const ua = await portal({ module: 'backlinks', action: 'apagar_tudo' });
    expect(ua.status).toBe(400);
    expect(ua.body.error).toBe('unknown_action');
    expect((await portal({ module: 'backlinks', action: 'constructor' })).body.error).toBe('unknown_action');
    expect((await portal({ module: 'backlinks', action: '__proto__' })).body.error).toBe('unknown_action');
  });
  it('papel abaixo do mínimo é recusado ANTES do handler (nada é gravado); membro de outra organização é recusado; papel mínimo igual ao do handler', async () => {
    const t = world('viewer');
    const r = await portal({ module: 'backlinks', action: 'import', projectId: P, text: 'https://a.com/1' }, { tables: t });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'role_not_allowed' });
    expect(r.log.filter((l) => l.startsWith('insert:') || l.startsWith('update:'))).toEqual([]);
    expect((await portal({ module: 'indexacao', action: 'inventory_sync', projectId: P }, { role: 'viewer' })).body.error).toBe('role_not_allowed');
    expect((await portal({ module: 'indexacao', action: 'indexnow_key_save', projectId: P }, { role: 'editor' })).body.error).toBe('role_not_allowed');
    expect((await portal({ module: 'central', action: 'purge', projectId: P }, { role: 'editor' })).body.error).toBe('role_not_allowed');
    expect((await portal({ module: 'indexacao', action: 'overview', projectId: P }, { role: null })).body.error).toBe('organization_membership_required');
    expect((await portal({ module: 'indexacao', action: 'overview', projectId: P_OTHER })).body.error).toBe('organization_membership_required');
    expect((await portal({ module: 'indexacao', action: 'overview', projectId: P }, { role: 'viewer' })).status).toBe(200);
  });
  it('dono pela tabela de organizações (sem linha de membro) só vale no teto de gasto; update_policy exige dono, unlock_extra exige administrador', async () => {
    const mk = (role: string) => { const spend = fakeSpendDb({ now: () => NOW }); const tables = { projects: [], organization_spend_policy: [], organization_members: [{ organization_id: ORG_A, user_id: USER_1, role, status: 'active' }], organizations: [{ id: ORG_A, owner_user_id: null }] } as Record<string, Row[]>; return { rpc: spend.rpc, from: fakeAdmin(tables).admin.from }; };
    expect((await routeEngineRequest(mk('admin'), { userId: USER_1, body: { module: 'teto_gasto', action: 'update_policy', organizationId: ORG_A } }, netDeps())).body.error).toBe('role_not_allowed');
    expect((await routeEngineRequest(mk('editor'), { userId: USER_1, body: { module: 'teto_gasto', action: 'unlock_extra', organizationId: ORG_A } }, netDeps())).body.error).toBe('role_not_allowed');
    const viaOwnerTable = { projects: [], organization_spend_policy: [], organization_members: [], organizations: [{ id: ORG_B, owner_user_id: USER_1 }] } as Record<string, Row[]>;
    const spend = fakeSpendDb({ now: () => NOW });
    const r = await routeEngineRequest({ rpc: spend.rpc, from: fakeAdmin(viaOwnerTable).admin.from }, { userId: USER_1, body: { module: 'teto_gasto', action: 'status', organizationId: ORG_B } }, netDeps());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ role: 'owner' });
  });
  it('papéis do manifesto = papéis dos handlers (nem mais frouxo, nem mais rígido) para os módulos por projeto', async () => {
    type H = (admin: ReturnType<typeof fakeAdmin>['admin'], action: string, role: string) => Promise<{ status: number; body: Record<string, unknown> }>;
    const dnet = { fetchFn: netDeps().fetchFn, lookupA: netDeps().lookupA, now: () => NOW };
    const direct: Record<string, H> = {
      backlinks: (a, action, role) => handleBacklinkAction(a, { action, body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: dnet }),
      velocidade: (a, action, role) => handleSpeedAction(a, { action, body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: { fetchFn: dnet.fetchFn, now: dnet.now, apiKey: 'k' } }),
      visao_geral: (a, action, role) => handleOverviewAction(a, { action, body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: dnet }),
      taxonomia: (a, action, role) => handleTaxonomyAction(a, { action, body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: dnet }),
      mercado: (a, action, role) => handleTaxonomyAction(a, { action, body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: dnet }),
      indexacao: (a, action, role) => handleIndexationAction(a, { action, body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: { ...dnet, sleep: async () => undefined } }),
      central: (a, action, role) => handleLifecycleAction(a, { action, body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, role]]), deps: { now: () => NOW } }),
    };
    for (const spec of ENGINE_SPECS.filter((s) => direct[s.name])) {
      for (const [action, a] of Object.entries(spec.actions)) {
        const probe = async (role: string) => (await direct[spec.name](fakeAdmin(world(role), RPCS).admin, action, role)).body.error === 'role_not_allowed';
        if (a.minRole === 'member') expect(await probe('viewer'), `${spec.name}.${action} com leitor`).toBe(false);
        if (a.minRole === 'editor') { expect(await probe('viewer'), `${spec.name}.${action} leitor`).toBe(true); expect(await probe('editor'), `${spec.name}.${action} editor`).toBe(false); }
        if (a.minRole === 'admin') { expect(await probe('editor'), `${spec.name}.${action} editor`).toBe(true); expect(await probe('admin'), `${spec.name}.${action} admin`).toBe(false); }
      }
    }
  });
});

describe('portão engine: gancho do teto de gasto', () => {
  it('módulo sem custo (cost none) NUNCA chama o guarda; ação paga sem guarda é negada (falha fechada); guarda que nega ou quebra impede o handler', async () => {
    const guard = vi.fn(async () => ({ allowed: false as const }));
    const free = await portal({ module: 'indexacao', action: 'overview', projectId: P }, { deps: { spendGuard: guard } });
    expect(free.status).toBe(200);
    expect(guard).not.toHaveBeenCalled();
    const noGuard = await portal({ module: 'mercado', action: 'campaign_execute', projectId: P }, { deps: { spendGuard: undefined } });
    expect(noGuard.status).toBe(423);
    expect(noGuard.body).toMatchObject({ error: 'spend_guard_unavailable', message: expect.stringMatching(/teto de gasto/) });
    const denied = await portal({ module: 'mercado', action: 'campaign_execute', projectId: P }, { deps: { spendGuard: async () => ({ allowed: false, status: 423, error: 'global_paid_services_blocked' }) } });
    expect(denied.status).toBe(423);
    expect(denied.body).toMatchObject({ error: 'global_paid_services_blocked', message: expect.stringMatching(/bloqueados/) });
    const broken = await portal({ module: 'mercado', action: 'campaign_execute', projectId: P }, { deps: { spendGuard: async () => { throw new Error('banco fora'); } } });
    expect(broken.body.error).toBe('spend_guard_unavailable');
    // guarda liberou: a ação chega ao handler (que decide o resto)
    const allowed = await portal({ module: 'mercado', action: 'campaign_execute', projectId: P }, { deps: { spendGuard: async () => ({ allowed: true }) } });
    expect(['spend_guard_unavailable', 'global_paid_services_blocked']).not.toContain(allowed.body.error);
    // as demais ações de mercado (planejar, importar) não são pagas e não passam pelo guarda
    guard.mockClear();
    await portal({ module: 'mercado', action: 'competitors_list', projectId: P }, { deps: { spendGuard: guard } });
    expect(guard).not.toHaveBeenCalled();
  });
  it('checkSpend isolado', async () => {
    const g = vi.fn(async () => ({ allowed: true as const }));
    expect(await checkSpend('none', false, g, { module: 'x', action: 'y', organizationId: ORG, projectId: null, userId: USER })).toBeNull();
    expect(g).not.toHaveBeenCalled();
    expect(await checkSpend('paid', false, g, { module: 'x', action: 'y', organizationId: ORG, projectId: null, userId: USER })).toBeNull();
    expect(g).toHaveBeenCalledTimes(1);
    expect(await checkSpend('none', true, undefined, { module: 'x', action: 'y', organizationId: ORG, projectId: null, userId: USER })).toMatchObject({ status: 423 });
  });
});

describe('portão engine: manifesto e adaptadores', () => {
  it('cada módulo do portão tem adaptador; cada adaptador é usado; todas as ações dos handlers estão no manifesto (e só elas)', () => {
    for (const s of ENGINE_SPECS) expect(ADAPTERS[s.handler], s.name).toBeTypeOf('function');
    const used = new Set(ENGINE_SPECS.map((s) => s.handler));
    for (const k of Object.keys(ADAPTERS)) expect(used.has(k), k).toBe(true);
    const declared = (h: string) => new Set(ENGINE_SPECS.filter((s) => s.handler === h).flatMap((s) => Object.keys(s.actions)));
    const eq = (h: string, list: string[]) => expect([...declared(h)].sort(), h).toEqual([...list].sort());
    eq('overview', OVERVIEW_ACTIONS); eq('backlinks', BACKLINK_ACTIONS); eq('taxonomy', TAXONOMY_ACTIONS); eq('speed', SPEED_ACTIONS);
    eq('lifecycle', LIFECYCLE_ACTIONS); eq('spend-policy', SPEND_POLICY_ACTIONS); eq('indexacao', INDEXATION_ACTIONS); eq('events', EVENTS_ACTIONS);
  });
  it('nomes únicos, módulo de origem existente, custo declarado e só as ações pagas conhecidas marcadas como pagas', () => {
    const names = ENGINE_SPECS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of ENGINE_SPECS) { expect(MODULES.some((m) => m.key === s.moduleKey)).toBe(true); expect(['none', 'paid']).toContain(s.cost); }
    const paid = ENGINE_SPECS.flatMap((s) => Object.entries(s.actions).filter(([, a]) => a.paid).map(([k]) => `${s.name}.${k}`));
    // ações pagas conhecidas (cada módulo novo com custo entra aqui de propósito): mercado, radar (rodada e backlinks) e estúdio (texto e imagens)
    expect(paid).toContain('mercado.campaign_execute');
    expect(paid.filter((p) => !['mercado.campaign_execute', 'radar.run_batch', 'radar.backlinks_fetch', 'estudio.generate', 'estudio.images'].includes(p))).toEqual([]);
    expect(ENGINE_SPECS.find((s) => s.name === 'indexacao')).toMatchObject({ cost: 'none' });
    expect(engineSpec('indexacao')!.produces).toEqual(expect.arrayContaining(['index_urls', 'index_status', 'project_events']));
    expect(engineSpec('indexacao')!.consumes).toEqual(expect.arrayContaining(['project_taxonomy_nodes', 'nexus_search_performance', 'articles', 'project_site_maps']));
  });
  it('fatos de módulos antigos publicados só pelo adaptador: sitemap atualizado e backlinks verificados (e nada quando a resposta não é 200)', async () => {
    const t = world('owner', { project_backlinks: [] });
    const r = await portal({ module: 'visao_geral', action: 'refresh_structure', projectId: P }, { tables: t });
    expect(r.status).toBe(200);
    expect(t.project_events.map((e) => e.kind)).toEqual(['estrutura.mapa_atualizado']);
    expect(t.project_events[0]).toMatchObject({ project_id: P, organization_id: ORG, module: 'visao_geral' });
    const t2 = world('owner', { project_backlinks: [] });
    const failing = await portal({ module: 'backlinks', action: 'verify', projectId: P_OTHER }, { tables: t2 });
    expect(failing.status).toBe(403);
    expect(t2.project_events).toHaveLength(0);
    const t3 = world('owner');
    t3.project_backlinks[0].status = 'unverified';
    const v = await portal({ module: 'backlinks', action: 'verify', projectId: P }, { tables: t3 });
    expect(v.status).toBe(200);
    expect(t3.project_events.map((e) => e.kind)).toEqual(['backlinks.verificados']);
  });
  it('erro inesperado vira 500 padronizado sem vazar detalhe', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = { from: () => { throw new Error('detalhe interno com segredo'); }, rpc: async () => ({ data: null, error: null }) };
    const r = await routeEngineRequest(boom, { userId: USER, body: { module: 'indexacao', action: 'overview', projectId: P } }, netDeps());
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('segredo');
    expect(r.body.message).toBeTypeOf('string');
    spy.mockRestore();
  });
});

describe('núcleo: papéis, projeto e barramento de eventos', () => {
  it('ordem dos papéis', () => {
    expect(roleRank('owner')).toBeGreaterThan(roleRank('admin'));
    expect(roleRank('admin')).toBeGreaterThan(roleRank('editor'));
    expect(roleRank('editor')).toBeGreaterThan(roleRank('viewer'));
    expect(roleRank(null)).toBe(0);
    expect(hasRole('viewer', 'member')).toBe(true);
    expect(hasRole('viewer', 'editor')).toBe(false);
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('admin', 'owner')).toBe(false);
    expect(fail(403, 'role_not_allowed').body.message).toMatch(/papel/);
  });
  it('resolveProject: uuid inválido, projeto inexistente, outra organização e papel baixo, em português', async () => {
    const a = fakeAdmin(world()).admin;
    const ctx = { roleByOrg: new Map([[ORG, 'viewer']]) };
    expect(await resolveProject(a, ctx, 'x')).toMatchObject({ ok: false, reply: { status: 422 } });
    expect(await resolveProject(a, ctx, '00000000-0000-4000-8000-0000000000ff')).toMatchObject({ ok: false, reply: { status: 404 } });
    expect(await resolveProject(a, ctx, P_OTHER)).toMatchObject({ ok: false, reply: { status: 403, body: { error: 'organization_membership_required' } } });
    expect(await resolveProject(a, ctx, P, 'editor')).toMatchObject({ ok: false, reply: { body: { error: 'role_not_allowed' } } });
    expect(await resolveProject(a, ctx, P)).toMatchObject({ ok: true, role: 'viewer' });
    expect([...(await loadMemberships(a, USER)).entries()]).toEqual([[ORG, 'owner']]);
  });
  it('recordEvent: só aceita tipo no formato modulo.fato, tira segredos, corta texto e lista; falha de gravação nunca derruba quem chamou', async () => {
    expect(EVENT_KIND_RE.test('indexacao.enviada')).toBe(true);
    for (const bad of ['enviada', 'Indexacao.Enviada', 'a b.c', '', 'x'.repeat(90) + '.y']) expect(buildEventRow({ organization_id: ORG, project_id: P, module: 'm', kind: bad }), bad).toBeNull();
    const row = buildEventRow({ organization_id: ORG, project_id: P, module: 'indexacao', kind: 'indexacao.enviada', subject: { host: 'x.com', api_key: 'SEGREDO', nested: { token: 'SEGREDO2', ok: 1 } }, payload: { count: 3, texto: 'a'.repeat(1000), lista: Array.from({ length: 50 }, (_, i) => i) } })!;
    expect(JSON.stringify(row)).not.toMatch(/SEGREDO/);
    expect((row.payload as { texto: string }).texto.length).toBeLessThan(400);
    expect((row.payload as { lista: unknown[] }).lista).toHaveLength(20);
    expect(sanitizeEventData({ key_value: 'k', credential: 'c', authorization: 'a', fine: 'ok' })).toEqual({ fine: 'ok' });
    const huge = buildEventRow({ organization_id: ORG, project_id: P, module: 'm', kind: 'm.big', payload: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'x'.repeat(290)])) })!;
    expect(huge.payload).toEqual({ truncated: true });
    const t = world();
    expect(await recordEvent(fakeAdmin(t).admin, { organization_id: ORG, project_id: P, module: 'indexacao', kind: 'indexacao.enviada', payload: { count: 2 } })).toBe(true);
    expect(await recordEvents(fakeAdmin(t).admin, [])).toBe(0);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'rls' } }) }) };
    expect(await recordEvent(broken, { organization_id: ORG, project_id: P, module: 'm', kind: 'm.x' })).toBe(false);
    const thrower = { from: () => { throw new Error('x'); } };
    expect(await recordEvent(thrower, { organization_id: ORG, project_id: P, module: 'm', kind: 'm.x' })).toBe(false);
    spy.mockRestore();
    expect(describeEvent({ kind: 'indexacao.enviada', payload: { count: 1500 } })).toMatch(/URLs enviadas a buscador \(1\.500\)/);
    expect(describeEvent({ kind: 'modulo.desconhecido', payload: {} })).toBe('modulo.desconhecido');
  });
  it('módulo eventos: lista só do projeto, mais recentes primeiro, filtro por módulo, limite; de outra organização é recusado; ação desconhecida recusada', async () => {
    const mk = (id: number, module: string, kind: string, at: string): Row => ({ id: `e${id}`, organization_id: ORG, project_id: P, module, kind, subject: {}, payload: { count: id }, created_at: at });
    const t = world('viewer', { project_events: [mk(1, 'indexacao', 'indexacao.enviada', '2026-11-18T10:00:00Z'), mk(2, 'backlinks', 'backlinks.verificados', '2026-11-19T10:00:00Z'), mk(3, 'indexacao', 'indexacao.problema', '2026-11-20T10:00:00Z'), { ...mk(4, 'indexacao', 'indexacao.enviada', '2026-11-21T10:00:00Z'), project_id: P_OTHER, organization_id: OTHER }] });
    const r = await portal({ module: 'eventos', action: 'list', projectId: P }, { tables: t });
    expect((r.body.events as Array<{ id: string }>).map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
    expect((r.body.events as Array<{ text: string }>)[0].text).toMatch(/Problema de indexação/);
    const f = await portal({ module: 'eventos', action: 'list', projectId: P, eventModule: 'indexacao', limit: 1 }, { tables: t });
    expect((f.body.events as Array<{ id: string }>).map((e) => e.id)).toEqual(['e3']);
    expect((await portal({ module: 'eventos', action: 'list', projectId: P_OTHER }, { tables: t })).body.error).toBe('organization_membership_required');
    expect((await handleEventsAction(fakeAdmin(t).admin, { action: 'apagar', body: {}, roleByOrg: new Map() })).body.error).toBe('unknown_action');
  });
});
