import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row, type RpcHandler } from './helpers/fake-admin';
import { LIFECYCLE_ACTIONS, buildTimeline, handleLifecycleAction, planIsEmpty, sanitizeRow } from '../../supabase/functions/_shared/project-lifecycle-handler';
import { PLUGIN_VERSION } from '../../supabase/functions/_shared/plugin-version';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const P2 = '00000000-0000-4000-8000-0000000000b2';
const FOREIGN = '00000000-0000-4000-8000-0000000000b9';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const proj = (id: string, name: string, over: Row = {}): Row => ({ id, name, organization_id: ORG, lifecycle_status: 'ativo', paused_snapshot: null, archived_at: null, archived_by: null, paused_reason: null, paused_at: null, ...over });
const rawFacts = (id: string, name: string, over: Row = {}): Row => ({
  id, name, domain: 'exemplo.com.br', wordpress_url: 'https://exemplo.com.br', created_at: daysAgo(100), lifecycle_status: 'ativo', archived_at: null, paused_reason: null,
  wordpress: { connected: true, plugin_version: PLUGIN_VERSION, mode: 'zica_posts', connected_at: daysAgo(50), last_verified_at: daysAgo(1) },
  articles: { total: 5, published: 5, last_published_at: daysAgo(3) }, gsc: { rows: 10, last_day: daysAgo(2).slice(0, 10) }, ga4: { rows: 0, last_day: null }, providers: ['gsc'],
  signals: { tracking_key: false, last_batch_at: null, last_day: null, cta_28d: 0 }, automation: { news_agents_active: 0, rss_active: 0 },
  profile: { status: 'confirmed', completeness: 90, confirmed: true }, taxonomy: null, site_map: null, speed: null, alerts: null, backlinks: null, funnel: null, observatory: null, ...over,
});
const plan = (tables: Array<{ table: string; rows: number; on_delete: string }>, nofk: Array<{ table: string; rows: number | null }> = []) => ({ found: true, name: 'x', tables: tables.map((t) => ({ schema: 'public', column: 'project_id', ...t })), total_rows: tables.reduce((s, t) => s + t.rows, 0), tables_checked: 50, without_fk: nofk });

const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [proj(P, 'Blog RDM'), proj(P2, 'Outro')], project_lifecycle_events: [],
  project_speed_schedules: [{ project_id: P, enabled: true }, { project_id: P2, enabled: true }],
  project_backlink_settings: [{ project_id: P, enabled: true }, { project_id: P2, enabled: true }],
  news_agents: [{ id: 'na1', project_id: P, is_active: true }, { id: 'na2', project_id: P, is_active: true }, { id: 'na3', project_id: P, is_active: false }, { id: 'na9', project_id: P2, is_active: true }],
  rss_schedules: [{ id: 'rs1', project_id: P, is_active: true }, { id: 'rs9', project_id: P2, is_active: true }],
  ...over,
});

interface CallOpts { role?: string | null; tables?: Record<string, Row[]>; rpcs?: Record<string, RpcHandler>; orgRole?: [string, string][] }
const call = async (action: string, body: Record<string, unknown>, o: CallOpts = {}) => {
  const tables = o.tables || seed();
  const fake = fakeAdmin(tables, o.rpcs || {});
  const roleByOrg = new Map<string, string>(o.orgRole || (o.role === null ? [[OTHER, 'owner']] : [[ORG, o.role || 'owner']]));
  const r = await handleLifecycleAction(fake.admin, { action, body: { projectId: P, ...body }, userId: USER, roleByOrg, deps: { now: () => NOW } });
  return { ...r, tables, log: fake.log };
};
const events = (tables: Record<string, Row[]>) => tables.project_lifecycle_events.map((e) => e.event);

describe('Central de Projetos: função de borda', () => {
  it('ações existentes', () => {
    expect(LIFECYCLE_ACTIONS).toEqual(['health_overview', 'health_detail', 'integrity_report', 'pause', 'resume', 'archive', 'restore', 'delete_plan', 'export', 'purge']);
  });

  describe('leitura: saúde e integridade', () => {
    const rpcs = { project_health_inputs: () => ({ data: [rawFacts(P, 'Blog RDM'), rawFacts(P2, 'Arquivado', { lifecycle_status: 'arquivado', archived_at: daysAgo(3) })], error: null }), project_orphan_scan: () => ({ data: { tables: [{ table: 'articles', orphans: 7 }], unverifiable: ['x'] }, error: null }) };
    it('health_overview: qualquer membro (inclusive visualizador) vê todos os projetos com estado e nota; só quem escreve gerencia', async () => {
      const viewer = await call('health_overview', { organizationId: ORG }, { role: 'viewer', rpcs });
      expect(viewer.status).toBe(200);
      expect(viewer.body).toMatchObject({ can_manage: false, can_delete: false, plugin_version: PLUGIN_VERSION });
      const list = viewer.body.projects as Array<{ project_id: string; state: string; score: number | null }>;
      expect(list).toHaveLength(2);
      expect(list.find((p) => p.project_id === P2)).toMatchObject({ state: 'arquivado', score: null });
      expect((viewer.body.totals as Record<string, number>).arquivado).toBe(1);
      const admin = await call('health_overview', { organizationId: ORG }, { role: 'admin', rpcs });
      expect(admin.body).toMatchObject({ can_manage: true, can_delete: true });
      const editor = await call('health_overview', { organizationId: ORG }, { role: 'editor', rpcs });
      expect(editor.body).toMatchObject({ can_manage: true, can_delete: false });
    });
    it('isolamento: quem não é da organização não vê nada, e a organização vem validada', async () => {
      expect((await call('health_overview', { organizationId: ORG }, { role: null, rpcs })).body.error).toBe('organization_membership_required');
      expect((await call('health_overview', {}, { rpcs })).body.error).toBe('organization_id_required');
      expect((await call('health_detail', {}, { role: null, rpcs })).status).toBe(403);
      expect((await call('health_detail', { projectId: FOREIGN }, { rpcs })).status).toBe(404);
      expect((await call('health_detail', { projectId: 'lixo' }, { rpcs })).body.error).toBe('project_id_required');
    });
    it('falha do banco (migração não aplicada) vira erro genérico, sem vazar detalhe', async () => {
      const r = await call('health_overview', { organizationId: ORG }, { rpcs: { project_health_inputs: () => ({ data: null, error: { message: 'function public.project_health_inputs does not exist' } }) } });
      expect(r).toMatchObject({ status: 500, body: { error: 'lifecycle_operation_failed' } });
      expect(JSON.stringify(r.body)).not.toMatch(/does not exist/);
    });
    it('health_detail: saúde, mapa de conexões e linha do tempo com eventos e atividades', async () => {
      const tables = seed({ project_lifecycle_events: [{ id: 'e1', project_id: P, event: 'restaurado', actor: USER, details: {}, created_at: daysAgo(1) }, { id: 'e2', project_id: P2, event: 'arquivado', actor: USER, details: {}, created_at: daysAgo(1) }] });
      const r = await call('health_detail', {}, { tables, rpcs });
      expect(r.status).toBe(200);
      const body = r.body as { health: { project_id: string }; map: { modules: unknown[] }; timeline: Array<{ kind: string; text: string }>; events: unknown[] };
      expect(body.health.project_id).toBe(P);
      expect(body.map.modules.length).toBeGreaterThan(5);
      expect(body.events).toHaveLength(1); // só do projeto pedido
      expect(body.timeline.some((t) => t.kind === 'evento' && t.text === 'Projeto restaurado')).toBe(true);
      expect(body.timeline.some((t) => t.kind === 'atividade')).toBe(true);
    });
    it('integrity_report: um projeto (com órfãos da organização) e resumo da organização', async () => {
      const one = await call('integrity_report', {}, { rpcs });
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ project_id: P, orphan_scan: 'ok', unverifiable_tables: ['x'] });
      expect((one.body.issues as Array<{ kind: string }>).some((i) => i.kind === 'dado_orfao')).toBe(true);
      const org = await call('integrity_report', { projectId: undefined, organizationId: ORG }, { rpcs });
      expect(org.status).toBe(200);
      expect((org.body.projects as unknown[]).length).toBe(1); // arquivado fica de fora
      expect(org.body.orphans).toEqual([{ table: 'articles', orphans: 7 }]);
      const broken = await call('integrity_report', {}, { rpcs: { ...rpcs, project_orphan_scan: () => ({ data: null, error: { message: 'x' } }) } });
      expect(broken.body.orphan_scan).toBe('indisponivel');
    });
    it('buildTimeline ordena do mais novo para o mais antigo e ignora datas inválidas', () => {
      const t = buildTimeline([{ event: 'pausado', created_at: daysAgo(5), details: { reason: 'cliente pediu' } }, { event: 'arquivado', created_at: 'lixo' }], [{ key: 'publicacao', area: 'atividade', label: 'Última publicação', status: 'ok', detail: 'ok', source: 'Artigos', date: daysAgo(1), action: null }]);
      expect(t.map((x) => x.kind)).toEqual(['atividade', 'evento']);
      expect(t[1].text).toBe('Projeto pausado: cliente pediu');
    });
  });

  describe('pausar e retomar', () => {
    it('pausar desliga velocidade, backlinks, agentes e RSS do projeto (e só dele), guarda o estado anterior e grava o evento', async () => {
      const tables = seed();
      const r = await call('pause', { reason: '  cliente pediu  ' }, { tables });
      expect(r).toMatchObject({ status: 200, body: { lifecycle_status: 'pausado', changed: { speed: 1, backlinks: 1, news_agents: 2, rss_schedules: 1 }, audit_recorded: true } });
      expect(tables.project_speed_schedules.find((x) => x.project_id === P)?.enabled).toBe(false);
      expect(tables.project_speed_schedules.find((x) => x.project_id === P2)?.enabled).toBe(true);
      expect(tables.project_backlink_settings.find((x) => x.project_id === P)?.enabled).toBe(false);
      expect(tables.news_agents.filter((a) => a.project_id === P).map((a) => a.is_active)).toEqual([false, false, false]);
      expect(tables.news_agents.find((a) => a.id === 'na9')?.is_active).toBe(true);
      expect(tables.rss_schedules.find((a) => a.id === 'rs1')?.is_active).toBe(false);
      const p = tables.projects.find((x) => x.id === P)!;
      expect(p).toMatchObject({ lifecycle_status: 'pausado', paused_reason: 'cliente pediu' });
      expect(p.paused_snapshot).toMatchObject({ speed: { enabled: true }, backlinks: { enabled: true }, news_agents: ['na1', 'na2'], rss_schedules: ['rs1'] });
      expect(events(tables)).toEqual(['pausado']);
      expect(tables.project_lifecycle_events[0]).toMatchObject({ project_id: P, project_name: 'Blog RDM', organization_id: ORG, actor: USER });
    });
    it('retomar religa SÓ o que estava ligado (o agente que já estava desligado continua desligado) e limpa os campos de pausa', async () => {
      const tables = seed();
      await call('pause', {}, { tables });
      const r = await call('resume', {}, { tables });
      expect(r).toMatchObject({ status: 200, body: { lifecycle_status: 'ativo', changed: { speed: 1, backlinks: 1, news_agents: 2, rss_schedules: 1 } } });
      expect(tables.news_agents.map((a) => [a.id, a.is_active])).toEqual([['na1', true], ['na2', true], ['na3', false], ['na9', true]]);
      expect(tables.project_speed_schedules.find((x) => x.project_id === P)?.enabled).toBe(true);
      expect(tables.projects.find((x) => x.id === P)).toMatchObject({ lifecycle_status: 'ativo', paused_snapshot: null, paused_reason: null, paused_at: null });
      expect(events(tables)).toEqual(['pausado', 'retomado']);
    });
    it('o que já estava desligado antes de pausar não é ligado ao retomar', async () => {
      const tables = seed({ project_speed_schedules: [{ project_id: P, enabled: false }] });
      await call('pause', {}, { tables });
      const r = await call('resume', {}, { tables });
      expect((r.body.changed as Record<string, number>).speed).toBe(0);
      expect(tables.project_speed_schedules[0].enabled).toBe(false);
    });
    it('transições inválidas e papéis: 409 e 403', async () => {
      expect((await call('resume', {})).body).toMatchObject({ error: 'invalid_transition', current: 'ativo' });
      const paused = seed({ projects: [proj(P, 'Blog RDM', { lifecycle_status: 'pausado' })] });
      expect((await call('pause', {}, { tables: paused })).status).toBe(409);
      expect((await call('pause', {}, { role: 'viewer' })).body.error).toBe('role_not_allowed');
      expect((await call('archive', {}, { role: 'viewer' })).status).toBe(403);
      expect((await call('pause', {}, { role: null })).status).toBe(403);
      expect((await call('pause', {}, { role: 'editor' })).status).toBe(200);
    });
    it('isolamento: não dá para pausar projeto de outra organização', async () => {
      const tables = seed({ projects: [proj(FOREIGN, 'Alheio', { organization_id: OTHER })] });
      const r = await call('pause', { projectId: FOREIGN }, { tables });
      expect(r.status).toBe(403);
      expect(tables.projects[0].lifecycle_status).toBe('ativo');
    });
  });

  describe('arquivar e restaurar', () => {
    it('arquivar um projeto ativo guarda quem e quando, desliga os agendamentos e preserva todos os dados', async () => {
      const tables = seed({ articles: [{ id: 'a1', project_id: P }] });
      const r = await call('archive', {}, { tables });
      expect(r).toMatchObject({ status: 200, body: { lifecycle_status: 'arquivado' } });
      const p = tables.projects.find((x) => x.id === P)!;
      expect(p).toMatchObject({ lifecycle_status: 'arquivado', archived_by: USER });
      expect(typeof p.archived_at).toBe('string');
      expect(tables.project_speed_schedules.find((x) => x.project_id === P)?.enabled).toBe(false);
      expect(tables.articles).toHaveLength(1); // nada apagado
      expect(tables.projects).toHaveLength(2);
      expect(events(tables)).toEqual(['arquivado']);
    });
    it('restaurar devolve o projeto a ativo e religa o que estava ligado; arquivar de novo não é permitido', async () => {
      const tables = seed();
      await call('archive', {}, { tables });
      expect((await call('archive', {}, { tables })).status).toBe(409);
      const r = await call('restore', {}, { tables });
      expect(r).toMatchObject({ status: 200, body: { lifecycle_status: 'ativo', changed: { speed: 1, backlinks: 1, news_agents: 2, rss_schedules: 1 } } });
      expect(tables.projects.find((x) => x.id === P)).toMatchObject({ lifecycle_status: 'ativo', archived_at: null, archived_by: null, paused_snapshot: null });
      expect(tables.project_speed_schedules.find((x) => x.project_id === P)?.enabled).toBe(true);
      expect(events(tables)).toEqual(['arquivado', 'restaurado']);
      expect((await call('restore', {}, { tables })).status).toBe(409);
    });
    it('arquivar um projeto pausado mantém o retrato da pausa, e restaurar religa o que estava ligado antes dela', async () => {
      const tables = seed();
      await call('pause', {}, { tables });
      await call('archive', {}, { tables });
      expect(tables.projects.find((x) => x.id === P)?.paused_snapshot).toBeTruthy();
      const r = await call('restore', {}, { tables });
      expect((r.body.changed as Record<string, number>).news_agents).toBe(2);
      expect(tables.news_agents.find((a) => a.id === 'na1')?.is_active).toBe(true);
    });
  });

  describe('plano de exclusão', () => {
    const rpcs = (p: ReturnType<typeof plan>) => ({ project_delete_plan: () => ({ data: p, error: null }) });
    const rich = plan([{ table: 'articles', rows: 2312, on_delete: 'set null' }, { table: 'nexus_search_performance', rows: 48672, on_delete: 'cascade' }, { table: 'editorial_plans', rows: 3, on_delete: 'restrict' }, { table: 'project_taxonomy_nodes', rows: 10, on_delete: 'cascade' }], [{ table: 'tabela_solta', rows: 4 }]);
    it('agrupa por módulo, avisa o que ficaria órfão e exige arquivar antes (se não estiver vazio)', async () => {
      const r = await call('delete_plan', {}, { rpcs: rpcs(rich) });
      expect(r.status).toBe(200);
      const b = r.body as { empty: boolean; requires_archive: boolean; can_purge_now: boolean; total_rows: number; groups: Array<{ module: string; rows: number }>; would_orphan: Array<{ table: string }>; without_fk: unknown[] };
      expect(b).toMatchObject({ empty: false, requires_archive: true, can_purge_now: false, total_rows: 2312 + 48672 + 3 + 10 });
      expect(b.groups[0]).toMatchObject({ module: 'google', rows: 48672 });
      expect(b.groups.find((g) => g.module === 'conteudo')?.rows).toBe(2312);
      expect(b.groups.find((g) => g.module === 'outros')?.rows).toBe(3); // editorial_plans: sem módulo no manifesto
      expect(b.would_orphan).toEqual([{ table: 'articles', rows: 2312 }]);
      expect(b.without_fk).toHaveLength(1);
    });
    it('arquivado pode excluir; vazio (só configuração padrão) pode excluir direto', async () => {
      const arch = seed({ projects: [proj(P, 'Blog RDM', { lifecycle_status: 'arquivado' })] });
      expect((await call('delete_plan', {}, { tables: arch, rpcs: rpcs(rich) })).body).toMatchObject({ can_purge_now: true, requires_archive: false });
      const empty = await call('delete_plan', {}, { rpcs: rpcs(plan([{ table: 'project_modules', rows: 7, on_delete: 'cascade' }, { table: 'project_profile_extended', rows: 1, on_delete: 'cascade' }])) });
      expect(empty.body).toMatchObject({ empty: true, can_purge_now: true, requires_archive: false });
      expect(planIsEmpty(plan([{ table: 'articles', rows: 1, on_delete: 'set null' }]))).toBe(false);
    });
    it('só dono e administrador veem o plano', async () => {
      expect((await call('delete_plan', {}, { role: 'editor', rpcs: rpcs(rich) })).body.error).toBe('role_not_allowed');
      expect((await call('delete_plan', {}, { role: 'viewer', rpcs: rpcs(rich) })).status).toBe(403);
      expect((await call('delete_plan', {}, { role: 'admin', rpcs: rpcs(rich) })).status).toBe(200);
    });
  });

  describe('exportação', () => {
    const rpcs = { project_delete_plan: () => ({ data: plan([{ table: 'articles', rows: 2, on_delete: 'set null' }]), error: null }) };
    it('índice: módulos, tabelas e contagens, com os avisos', async () => {
      const r = await call('export', {}, { rpcs });
      expect(r.status).toBe(200);
      const b = r.body as { modules: Array<{ key: string; tables: Array<{ table: string; rows: number; reobtainable: boolean }> }>; notes: string[]; row_cap: number };
      expect(b.modules.find((m) => m.key === 'conteudo')?.tables[0]).toMatchObject({ table: 'articles', rows: 2 });
      expect(b.modules.find((m) => m.key === 'google')?.tables.every((t) => t.reobtainable)).toBe(true);
      expect(b.notes.join(' ')).toMatch(/Segredos .* nunca entram/);
      expect(b.row_cap).toBe(200_000);
    });
    it('uma página de uma tabela: só do projeto pedido, sem colunas com cara de segredo, com has_more', async () => {
      const arts = Array.from({ length: 101 }, (_, i) => ({ id: `a${String(i).padStart(3, '0')}`, project_id: P, created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, title: `T${i}`, api_key: 'segredo', wordpress_token: 'x' }));
      const tables = seed({ articles: [...arts, { id: 'zz', project_id: P2, created_at: '2026-01-01', title: 'de outro projeto' }] });
      const p0 = await call('export', { module: 'conteudo', table: 'articles', page: 0 }, { tables, rpcs });
      const b0 = p0.body as { rows: Array<Record<string, unknown>>; has_more: boolean; table: string };
      expect(b0.rows).toHaveLength(100);
      expect(b0.has_more).toBe(true);
      expect(b0.rows.every((r) => r.project_id === P)).toBe(true);
      expect(JSON.stringify(b0.rows)).not.toMatch(/segredo|wordpress_token|api_key/);
      const p1 = await call('export', { module: 'conteudo', table: 'articles', page: 1 }, { tables, rpcs });
      expect((p1.body as { rows: unknown[]; has_more: boolean }).rows).toHaveLength(1);
      expect((p1.body as { has_more: boolean }).has_more).toBe(false);
    });
    it('só exporta tabelas do manifesto: nada de "projects" nem módulo inventado; só dono/admin', async () => {
      expect((await call('export', { module: 'projeto', table: 'projects' }, { rpcs })).body.error).toBe('export_module_invalid');
      expect((await call('export', { module: 'conteudo', table: 'nexus_oauth_connections' }, { rpcs })).status).toBe(422);
      expect((await call('export', { module: 'nao_existe' }, { rpcs })).status).toBe(422);
      expect((await call('export', {}, { role: 'editor', rpcs })).status).toBe(403);
      expect((await call('export', {}, { role: null, rpcs })).status).toBe(403);
    });
    it('passou do teto de linhas: avisa que o pacote ficou incompleto', async () => {
      const r = await call('export', { module: 'google', table: 'nexus_search_performance', page: 100 }, { rpcs });
      expect(r.body).toMatchObject({ truncated: true, rows: [], has_more: false });
      expect(String(r.body.warning)).toMatch(/incompleto/);
    });
    it('"finish" registra a exportação no histórico', async () => {
      const tables = seed();
      const r = await call('export', { finish: true, rows: 5000, modules: ['conteudo', 7] }, { tables, rpcs });
      expect(r.body).toEqual({ recorded: true });
      expect(tables.project_lifecycle_events[0]).toMatchObject({ event: 'exportado', details: { rows: 5000, modules: ['conteudo'] } });
    });
    it('sanitizeRow remove colunas de segredo', () => {
      expect(sanitizeRow({ id: 1, vault_secret_id: 'x', secret_sha256: 'y', Authorization: 'z', title: 'ok' })).toEqual({ id: 1, title: 'ok' });
    });
  });

  describe('exclusão definitiva (purge)', () => {
    const rich = plan([{ table: 'articles', rows: 12, on_delete: 'set null' }]);
    const purgeOk: RpcHandler = (args, tables) => {
      tables.projects = tables.projects.filter((p) => p.id !== args.p_project);
      tables.project_lifecycle_events.push({ event: 'excluido', project_id: args.p_project, actor: args.p_actor });
      return { data: { deleted: { articles: 12 }, total_rows: 12, vault: 'nao_havia', left_behind: [] }, error: null };
    };
    const mk = (extra: Partial<Record<string, RpcHandler>> = {}, planData = rich) => ({ project_delete_plan: () => ({ data: planData, error: null }), project_purge: purgeOk, ...extra }) as Record<string, RpcHandler>;
    const archived = () => seed({ projects: [proj(P, 'Blog RDM', { lifecycle_status: 'arquivado' }), proj(P2, 'Outro')] });

    it('recusa projeto que não está arquivado (e não está vazio): nada é apagado', async () => {
      const tables = seed();
      const r = await call('purge', { confirm_name: 'Blog RDM', export_acknowledged: true }, { tables, rpcs: mk() });
      expect(r).toMatchObject({ status: 409, body: { error: 'project_not_archived', current: 'ativo' } });
      expect(tables.projects).toHaveLength(2);
      expect(r.log).not.toContain('rpc:project_purge');
    });
    it('recusa sem a confirmação do nome (vazia, errada, outra caixa) e sem o reconhecimento da exportação', async () => {
      for (const typed of [undefined, '', 'blog rdm', 'Blog RDM X', 42]) {
        const r = await call('purge', { confirm_name: typed, export_acknowledged: true }, { tables: archived(), rpcs: mk() });
        expect(r, String(typed)).toMatchObject({ status: 422, body: { error: 'confirmation_mismatch' } });
        expect(r.log).not.toContain('rpc:project_purge');
      }
      for (const ack of [undefined, false, 'true', 1]) {
        const r = await call('purge', { confirm_name: 'Blog RDM', export_acknowledged: ack }, { tables: archived(), rpcs: mk() });
        expect(r, String(ack)).toMatchObject({ status: 422, body: { error: 'export_required' } });
        expect(r.log).not.toContain('rpc:project_purge');
      }
    });
    it('só dono e administrador; e nunca projeto de outra organização', async () => {
      expect((await call('purge', { confirm_name: 'Blog RDM', export_acknowledged: true }, { tables: archived(), role: 'editor', rpcs: mk() })).status).toBe(403);
      expect((await call('purge', { confirm_name: 'Blog RDM', export_acknowledged: true }, { tables: archived(), role: 'viewer', rpcs: mk() })).status).toBe(403);
      const alheio = seed({ projects: [proj(FOREIGN, 'Alheio', { organization_id: OTHER, lifecycle_status: 'arquivado' })] });
      const r = await call('purge', { projectId: FOREIGN, confirm_name: 'Alheio', export_acknowledged: true }, { tables: alheio, rpcs: mk() });
      expect(r.status).toBe(403);
      expect(alheio.projects).toHaveLength(1);
    });
    it('arquivado + nome certo + exportação reconhecida: chama a purga com o ator e devolve o que foi removido', async () => {
      const tables = archived();
      const r = await call('purge', { confirm_name: '  Blog RDM ', export_acknowledged: true }, { tables, rpcs: mk() });
      expect(r).toMatchObject({ status: 200, body: { purged: true, project_id: P, was_empty: false, total_rows: 12, deleted: { articles: 12 } } });
      expect(tables.projects.map((p) => p.id)).toEqual([P2]); // só o alvo saiu
      expect(tables.project_lifecycle_events[0]).toMatchObject({ event: 'excluido', actor: USER });
    });
    it('projeto totalmente vazio pode ser excluído direto: sem arquivar e sem exportação, mas ainda com o nome', async () => {
      const emptyPlan = plan([{ table: 'project_modules', rows: 7, on_delete: 'cascade' }]);
      const tables = seed();
      const noName = await call('purge', { confirm_name: 'x' }, { tables, rpcs: mk({}, emptyPlan) });
      expect(noName.body.error).toBe('confirmation_mismatch');
      const r = await call('purge', { confirm_name: 'Blog RDM' }, { tables, rpcs: mk({}, emptyPlan) });
      expect(r).toMatchObject({ status: 200, body: { purged: true, was_empty: true } });
      expect(tables.projects.map((p) => p.id)).toEqual([P2]);
    });
    it('projeto que tem algum dado (um artigo) NÃO é considerado vazio, mesmo sem nada mais', async () => {
      const r = await call('purge', { confirm_name: 'Blog RDM' }, { rpcs: mk({}, plan([{ table: 'articles', rows: 1, on_delete: 'set null' }])) });
      expect(r.body.error).toBe('project_not_archived');
    });
    it('purga bloqueada pelo banco: 409 e nada apagado; outro erro: 500 genérico', async () => {
      const blocked = await call('purge', { confirm_name: 'Blog RDM', export_acknowledged: true }, { tables: archived(), rpcs: mk({ project_purge: () => ({ data: null, error: { message: 'purge_blocked: editorial_plans, nexus_operations' } }) }) });
      expect(blocked).toMatchObject({ status: 409, body: { error: 'purge_blocked', detail: 'editorial_plans, nexus_operations' } });
      const boom = await call('purge', { confirm_name: 'Blog RDM', export_acknowledged: true }, { tables: archived(), rpcs: mk({ project_purge: () => ({ data: null, error: { message: 'connection refused 10.0.0.1' } }) }) });
      expect(boom).toMatchObject({ status: 500, body: { error: 'lifecycle_operation_failed' } });
      expect(JSON.stringify(boom.body)).not.toMatch(/10\.0\.0\.1/);
    });
    it('sem o plano do banco (migração ausente) a exclusão não acontece', async () => {
      const r = await call('purge', { confirm_name: 'Blog RDM', export_acknowledged: true }, { tables: archived(), rpcs: { project_delete_plan: () => ({ data: null, error: { message: 'missing' } }), project_purge: purgeOk } });
      expect(r.status).toBe(500);
      expect(r.log).not.toContain('rpc:project_purge');
    });
  });
});
