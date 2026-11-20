/**
 * Ações da Central de Projetos na função de borda `project-lifecycle`.
 *
 *  - `health_overview`:  todos os projetos da organização com estado, nota e itens de saúde (organizationId).
 *  - `health_detail`:    um projeto: saúde, mapa de conexões, integridade e linha do tempo.
 *  - `integrity_report`: verificador de integridade de um projeto (projectId) ou resumo de todos (organizationId).
 *  - `pause` / `resume`: desliga os agendamentos e agentes do projeto, guardando o estado anterior; "retomar" devolve o que estava ligado.
 *  - `archive` / `restore`: some das listas e dos seletores (dados e histórico ficam); restaurar desfaz.
 *  - `delete_plan`:      resumo do que seria apagado, por módulo e tabela, com o comportamento real das chaves estrangeiras.
 *  - `export`:           pacote JSON dos dados do projeto por módulo, em páginas; só devolve ao navegador, nada sai para fora.
 *  - `purge`:            exclusão definitiva. Exige projeto arquivado (ou totalmente vazio), nome digitado igual e exportação reconhecida.
 *
 * Leitura: qualquer membro. Pausar/arquivar/restaurar: dono, administrador e editor. Plano de exclusão, exportação e exclusão: dono e administrador.
 * O sistema SUGERE; nada é arquivado ou apagado sem pedido da pessoa. A exclusão roda numa transação única no banco (private.project_purge).
 */
import { assessOrganization, assessProject, normalizeFacts, normalizeIndexation, normalizeRadar, normalizeStudio, type HealthItem, type ProjectFacts, type ProjectHealth } from './project-health-core.ts';
import { buildConnectionMap, verifyIntegrity, type OrphanScan } from './project-integrity-core.ts';
import { EXPORT_TABLES, MODULES, producerOf, type ExportTable } from './module-registry.ts';
import { PLUGIN_VERSION } from './plugin-version.ts';
import { LIVE_CACHE_MS, checkProjectsLive, persistLiveVersions, toPluginLive, type LiveDeps, type LiveResult, type LiveTarget } from './plugin-live-check.ts';
import { describeEvent } from './project-events.ts';

export const LIFECYCLE_ACTIONS = ['health_overview', 'health_detail', 'integrity_report', 'pause', 'resume', 'archive', 'restore', 'delete_plan', 'export', 'purge', 'pulse'];
export const WRITE_ROLES = ['owner', 'admin', 'editor'];
export const ADMIN_ROLES = ['owner', 'admin'];
/** Teto de linhas exportadas por tabela; acima dele o pacote avisa que ficou incompleto. */
export const EXPORT_ROW_CAP = 200_000;
/** Linhas de configuração padrão que não contam como "dado" para decidir se o projeto é vazio. */
export const EMPTY_IGNORED_TABLES = ['project_modules', 'project_profile_extended', 'project_profile_private'];
const SECRET_KEY = /(secret|token|password|passwd|vault|api_?key|credential|authorization)/i;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface LifecycleCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: { now: () => number; /** conferência ao vivo do plugin; ausente = não consulta os sites (testes e chamadas sem rede) */ live?: LiveDeps } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

interface ProjectRow { id: string; name: string; organization_id: string; lifecycle_status: string; paused_snapshot: Snapshot | null }
interface Snapshot { speed?: { enabled: boolean } | null; backlinks?: { enabled: boolean } | null; news_agents?: string[]; rss_schedules?: string[]; taken_at?: string }

export async function handleLifecycleAction(admin: Admin, ctx: LifecycleCtx): Promise<Reply> {
  try {
    if (ctx.action === 'health_overview') return await healthOverview(admin, ctx);
    if (ctx.action === 'pulse') return await pulse(admin, ctx);
    if (ctx.action === 'integrity_report' && !isUuid(ctx.body.projectId)) return await integrityOrganization(admin, ctx);
    const projectId = ctx.body.projectId;
    if (!isUuid(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select('id,name,organization_id,lifecycle_status,paused_snapshot').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    const p = project as ProjectRow;
    switch (ctx.action) {
      case 'health_detail': return await healthDetail(admin, ctx, p);
      case 'integrity_report': return await integrityProject(admin, ctx, p);
      case 'pause': case 'resume': case 'archive': case 'restore':
        if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
        return await changeLifecycle(admin, ctx, p);
      case 'delete_plan': case 'export': case 'purge':
        if (!ADMIN_ROLES.includes(role)) return fail(403, 'role_not_allowed');
        if (ctx.action === 'delete_plan') return await deletePlan(admin, p);
        if (ctx.action === 'export') return await exportPackage(admin, ctx, p);
        return await purge(admin, ctx, p);
      default: return fail(400, 'unknown_action');
    }
  } catch (_e) {
    console.error('[project-lifecycle] operation_failed');
    return fail(500, 'lifecycle_operation_failed');
  }
}

async function loadFacts(admin: Admin, organizationId: string): Promise<ProjectFacts[]> {
  const rpc = await admin.rpc('project_health_inputs', { p_org: organizationId });
  if (rpc.error) throw rpc.error;
  const facts = ((rpc.data || []) as Array<Record<string, unknown>>).map(normalizeFacts);
  // Indexação (módulo novo): números por projeto vindos de project_indexation_summary. Função ausente = módulo não instalado = "sem dados" (nunca zero inventado).
  const ix = await admin.rpc('project_indexation_summary', { p_org: organizationId });
  const withIx = ix.error || !ix.data || typeof ix.data !== 'object' ? facts : facts.map((f) => ({ ...f, indexation: normalizeIndexation((ix.data as Record<string, Record<string, unknown>>)[f.id] || { urls: 0 }) }));
  // Radar de mercado: mesma regra (função ausente = módulo não instalado = "sem dados")
  const rd = await admin.rpc('project_radar_summary', { p_org: organizationId });
  const radarBy = rd.error || !rd.data || typeof rd.data !== 'object' ? null : (rd.data as Record<string, Record<string, unknown>>);
  const withRadar = radarBy ? withIx.map((f) => ({ ...f, radar: normalizeRadar(radarBy[f.id] || { focuses: 0 }) })) : withIx;
  // Estúdio de Páginas: mesma regra (função ausente = módulo não instalado = "sem dados")
  const st = await admin.rpc('project_studio_summary', { p_org: organizationId });
  if (st.error || !st.data || typeof st.data !== 'object') return withRadar;
  const studioBy = st.data as Record<string, Record<string, unknown>>;
  return withRadar.map((f) => ({ ...f, studio: normalizeStudio(studioBy[f.id] || { pages: 0 }) }));
}

/** Cache curto (por instância da função) das conferências ao vivo: várias abas e atualizações seguidas não martelam o site do cliente. */
const LIVE_CACHE = new Map<string, { at: number; result: LiveResult }>();

export interface LiveSummary { enabled: boolean; checked_at: string | null; projects: number; ao_vivo: number; guardado: number; versions_updated: number }

/**
 * Pergunta aos sites (GET /version e /status do plugin) e põe o resultado nos fatos de saúde. Só projetos conectados pelo plugin e não arquivados.
 * `onlyProject` limita a um projeto (tela de detalhe). Sem `ctx.deps.live` nada é consultado (enabled=false) e os fatos seguem como vieram do banco.
 * Falha na conferência nunca derruba a leitura: o projeto fica com o valor guardado e o motivo por extenso.
 */
export async function withLiveCheck(admin: Admin, ctx: LifecycleCtx, facts: ProjectFacts[], onlyProject: string | null): Promise<{ facts: ProjectFacts[]; summary: LiveSummary }> {
  const off: LiveSummary = { enabled: false, checked_at: null, projects: 0, ao_vivo: 0, guardado: 0, versions_updated: 0 };
  const live = ctx.deps.live;
  if (!live) return { facts, summary: off };
  const eligible = facts.filter((f) => f.wordpress.connected && f.wordpress.mode === 'zica_posts' && f.lifecycle_status !== 'arquivado' && (!onlyProject || f.id === onlyProject));
  if (!eligible.length) return { facts, summary: { ...off, enabled: true, checked_at: new Date(ctx.deps.now()).toISOString() } };
  try {
    const rows = await admin.from('projects').select('id,organization_id,wordpress_url,wordpress_plugin_namespace,wordpress_credential_ref').in('id', eligible.map((f) => f.id));
    if (rows.error) throw rows.error;
    const byId = new Map<string, Record<string, string | null>>(((rows.data || []) as Array<Record<string, string | null>>).map((r) => [String(r.id), r]));
    const targets: LiveTarget[] = eligible.map((f) => {
      const r = byId.get(f.id) || {};
      return { project_id: f.id, organization_id: r.organization_id ?? null, wordpress_url: r.wordpress_url || f.wordpress_url, namespace: r.wordpress_plugin_namespace ?? null, credential_ref: r.wordpress_credential_ref ?? null, stored_version: f.wordpress.plugin_version, stored_verified_at: f.wordpress.last_verified_at };
    });
    const results = await checkProjectsLive(targets, live, { cache: LIVE_CACHE, cacheMs: LIVE_CACHE_MS, force: ctx.body.force === true });
    const nowIso = new Date(ctx.deps.now()).toISOString();
    const updated = await persistLiveVersions(admin, results, nowIso);
    const by = new Map(results.map((r) => [r.project_id, r]));
    const out = facts.map((f) => {
      const r = by.get(f.id);
      return r ? { ...f, wordpress: { ...f.wordpress, plugin_version: r.version, last_verified_at: r.origem === 'ao vivo' && r.changed ? nowIso : f.wordpress.last_verified_at, live: toPluginLive(r) } } : f;
    });
    return { facts: out, summary: { enabled: true, checked_at: nowIso, projects: results.length, ao_vivo: results.filter((r) => r.origem === 'ao vivo').length, guardado: results.filter((r) => r.origem !== 'ao vivo').length, versions_updated: updated } };
  } catch (_e) {
    console.error('[project-lifecycle] live_check_failed');
    return { facts, summary: { ...off, enabled: true, checked_at: new Date(ctx.deps.now()).toISOString() } };
  }
}

/**
 * Pulso da organização para o painel "em tempo real" (leitura por qualquer membro): carimbo da última mudança de cada área e, se vier `since`,
 * os fatos novos do barramento de eventos. O navegador compara os carimbos a cada poucos segundos (só com a aba visível) e recarrega só o que mudou.
 * Área sem tabela/permissão = carimbo null (sem dado), nunca inventado.
 */
async function pulse(admin: Admin, ctx: LifecycleCtx): Promise<Reply> {
  const org = ctx.body.organizationId;
  if (!isUuid(org)) return fail(422, 'organization_id_required');
  if (!ctx.roleByOrg.get(org)) return fail(403, 'organization_membership_required');
  const since = typeof ctx.body.since === 'string' && Number.isFinite(Date.parse(ctx.body.since)) ? ctx.body.since : null;
  const latest = async (q: PromiseLike<{ data: unknown; error: unknown }>, col: string): Promise<string | null> => {
    try { const r = await q; const row = Array.isArray(r.data) ? (r.data[0] as Record<string, unknown> | undefined) : undefined; return r.error || !row || typeof row[col] !== 'string' ? null : String(row[col]); } catch { return null; }
  };
  const projects = await admin.from('projects').select('id,updated_at').eq('organization_id', org);
  const ids = projects.error ? [] : ((projects.data || []) as Array<{ id: string }>).map((p) => p.id);
  const projectsStamp = projects.error ? null : ((projects.data || []) as Array<{ updated_at: string | null }>).reduce<string | null>((m, p) => (p.updated_at && (!m || p.updated_at > m) ? p.updated_at : m), null);
  const [eventsStamp, articlesStamp, spendStamp, news] = await Promise.all([
    latest(admin.from('project_events').select('created_at').eq('organization_id', org).order('created_at', { ascending: false }).limit(1), 'created_at'),
    ids.length ? latest(admin.from('articles').select('updated_at').in('project_id', ids).order('updated_at', { ascending: false }).limit(1), 'updated_at') : Promise.resolve(null),
    latest(admin.from('spend_reservations').select('updated_at').eq('organization_id', org).order('updated_at', { ascending: false }).limit(1), 'updated_at'),
    since ? admin.from('project_events').select('id,project_id,module,kind,payload,created_at').eq('organization_id', org).gt('created_at', since).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
  ]);
  const events = news.error ? [] : ((news.data || []) as Array<{ id: string; project_id: string; module: string; kind: string; payload: Record<string, unknown>; created_at: string }>).map((e) => ({ id: e.id, project_id: e.project_id, module: e.module, kind: e.kind, created_at: e.created_at, text: describeEvent(e) }));
  return { status: 200, body: { organization_id: org, server_time: new Date(ctx.deps.now()).toISOString(), stamps: { events: eventsStamp, projects: projectsStamp, articles: articlesStamp, spend: spendStamp }, events } };
}

async function healthOverview(admin: Admin, ctx: LifecycleCtx): Promise<Reply> {
  const org = ctx.body.organizationId;
  if (!isUuid(org)) return fail(422, 'organization_id_required');
  const role = ctx.roleByOrg.get(org) || null;
  if (!role) return fail(403, 'organization_membership_required');
  const loaded = await loadFacts(admin, org);
  const { facts: all, summary } = await withLiveCheck(admin, ctx, loaded, null);
  const health = assessOrganization(all, ctx.deps.now());
  return { status: 200, body: { organization_id: org, can_manage: WRITE_ROLES.includes(role), can_delete: ADMIN_ROLES.includes(role), plugin_version: PLUGIN_VERSION, live: summary, ...health } };
}

interface TimelineEntry { at: string; kind: 'evento' | 'atividade'; text: string; source: string }
const EVENT_TEXT: Record<string, string> = { pausado: 'Projeto pausado', retomado: 'Projeto retomado', arquivado: 'Projeto arquivado', restaurado: 'Projeto restaurado', exportado: 'Dados exportados', excluido: 'Projeto excluído definitivamente' };

/** Linha do tempo: eventos do ciclo de vida + as últimas atividades que a saúde conhece (publicação, leitura do Google, medições...). */
export function buildTimeline(events: Array<{ event: string; created_at: string; details?: Record<string, unknown> | null }>, items: HealthItem[]): TimelineEntry[] {
  const out: TimelineEntry[] = events.map((e) => ({ at: e.created_at, kind: 'evento' as const, text: `${EVENT_TEXT[e.event] || e.event}${e.event === 'pausado' && e.details && typeof e.details.reason === 'string' && e.details.reason ? `: ${e.details.reason}` : ''}`, source: 'Central de Projetos' }));
  for (const it of items) if (it.area === 'atividade' && it.date && it.status !== 'sem_dados') out.push({ at: it.date, kind: 'atividade', text: `${it.label}: ${it.detail}`, source: it.source });
  return out.filter((t) => Number.isFinite(Date.parse(t.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

async function loadEvents(admin: Admin, projectId: string, limit = 50) {
  const r = await admin.from('project_lifecycle_events').select('id,event,actor,details,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(limit);
  if (r.error) throw r.error;
  return (r.data || []) as Array<{ id: string; event: string; actor: string | null; details: Record<string, unknown> | null; created_at: string }>;
}

async function healthDetail(admin: Admin, ctx: LifecycleCtx, p: ProjectRow): Promise<Reply> {
  const loaded = await loadFacts(admin, p.organization_id);
  const { facts: all } = await withLiveCheck(admin, ctx, loaded, p.id);
  const facts = all.find((f) => f.id === p.id);
  if (!facts) return fail(404, 'project_not_found');
  const health = assessProject(facts, all, ctx.deps.now());
  const events = await loadEvents(admin, p.id);
  return { status: 200, body: { health, map: buildConnectionMap(facts), events, timeline: buildTimeline(events, health.items), plugin_version: PLUGIN_VERSION } };
}

async function orphanScan(admin: Admin, organizationId: string): Promise<OrphanScan | null> {
  const r = await admin.rpc('project_orphan_scan', { p_org: organizationId });
  if (r.error || !r.data) return null;
  const d = r.data as { tables?: Array<{ table: string; orphans: number }>; unverifiable?: string[] };
  return { tables: d.tables || [], unverifiable: d.unverifiable || [] };
}

async function integrityProject(admin: Admin, ctx: LifecycleCtx, p: ProjectRow): Promise<Reply> {
  const all = await loadFacts(admin, p.organization_id);
  const facts = all.find((f) => f.id === p.id);
  if (!facts) return fail(404, 'project_not_found');
  const scan = await orphanScan(admin, p.organization_id);
  return { status: 200, body: { ...verifyIntegrity(facts, ctx.deps.now(), scan), orphan_scan: scan ? 'ok' : 'indisponivel', unverifiable_tables: scan?.unverifiable || [] } };
}

async function integrityOrganization(admin: Admin, ctx: LifecycleCtx): Promise<Reply> {
  const org = ctx.body.organizationId;
  if (!isUuid(org)) return fail(422, 'project_id_required');
  if (!ctx.roleByOrg.get(org)) return fail(403, 'organization_membership_required');
  const all = (await loadFacts(admin, org)).filter((f) => f.lifecycle_status !== 'arquivado');
  const scan = await orphanScan(admin, org);
  const reports = all.map((f) => verifyIntegrity(f, ctx.deps.now(), null));
  return { status: 200, body: { organization_id: org, projects: reports.map((r, i) => ({ project_id: r.project_id, name: all[i].name, intact: r.intact, totals: r.totals })), orphans: scan?.tables || [], orphan_scan: scan ? 'ok' : 'indisponivel', unverifiable_tables: scan?.unverifiable || [] } };
}

// ---------------------------------------------------------------- pausar, retomar, arquivar, restaurar

/** Lê o que está ligado hoje (agendamento de velocidade, reverificação de backlinks, agentes de notícia e RSS). Tabela que não responde fica de fora: não se mexe no que não se leu. */
async function captureSnapshot(admin: Admin, projectId: string, now: number): Promise<Snapshot> {
  const snap: Snapshot = { taken_at: new Date(now).toISOString() };
  const speed = await admin.from('project_speed_schedules').select('enabled').eq('project_id', projectId).maybeSingle();
  if (!speed.error && speed.data) snap.speed = { enabled: speed.data.enabled === true };
  const bl = await admin.from('project_backlink_settings').select('enabled').eq('project_id', projectId).maybeSingle();
  if (!bl.error && bl.data) snap.backlinks = { enabled: bl.data.enabled === true };
  const na = await admin.from('news_agents').select('id').eq('project_id', projectId).eq('is_active', true);
  if (!na.error) snap.news_agents = ((na.data || []) as Array<{ id: string }>).map((r) => r.id);
  const rs = await admin.from('rss_schedules').select('id').eq('project_id', projectId).eq('is_active', true);
  if (!rs.error) snap.rss_schedules = ((rs.data || []) as Array<{ id: string }>).map((r) => r.id);
  return snap;
}

/** Desliga o que o retrato mostra ligado. Devolve quantos itens foram desligados por tipo. */
async function applyPause(admin: Admin, projectId: string, snap: Snapshot): Promise<Record<string, number>> {
  const done: Record<string, number> = { speed: 0, backlinks: 0, news_agents: 0, rss_schedules: 0 };
  if (snap.speed?.enabled) { const r = await admin.from('project_speed_schedules').update({ enabled: false }).eq('project_id', projectId); if (r.error) throw r.error; done.speed = 1; }
  if (snap.backlinks?.enabled) { const r = await admin.from('project_backlink_settings').update({ enabled: false }).eq('project_id', projectId); if (r.error) throw r.error; done.backlinks = 1; }
  if (snap.news_agents?.length) { const r = await admin.from('news_agents').update({ is_active: false }).in('id', snap.news_agents); if (r.error) throw r.error; done.news_agents = snap.news_agents.length; }
  if (snap.rss_schedules?.length) { const r = await admin.from('rss_schedules').update({ is_active: false }).in('id', snap.rss_schedules); if (r.error) throw r.error; done.rss_schedules = snap.rss_schedules.length; }
  return done;
}

/** Religa SÓ o que estava ligado quando o projeto foi pausado/arquivado (o que já estava desligado continua desligado). */
async function applyResume(admin: Admin, projectId: string, snap: Snapshot | null): Promise<Record<string, number>> {
  const done: Record<string, number> = { speed: 0, backlinks: 0, news_agents: 0, rss_schedules: 0 };
  if (!snap) return done;
  if (snap.speed?.enabled) { const r = await admin.from('project_speed_schedules').update({ enabled: true }).eq('project_id', projectId); if (r.error) throw r.error; done.speed = 1; }
  if (snap.backlinks?.enabled) { const r = await admin.from('project_backlink_settings').update({ enabled: true }).eq('project_id', projectId); if (r.error) throw r.error; done.backlinks = 1; }
  if (snap.news_agents?.length) { const r = await admin.from('news_agents').update({ is_active: true }).in('id', snap.news_agents); if (r.error) throw r.error; done.news_agents = snap.news_agents.length; }
  if (snap.rss_schedules?.length) { const r = await admin.from('rss_schedules').update({ is_active: true }).in('id', snap.rss_schedules); if (r.error) throw r.error; done.rss_schedules = snap.rss_schedules.length; }
  return done;
}

async function recordEvent(admin: Admin, p: { id: string; name: string; organization_id: string }, event: string, actor: string, details: Record<string, unknown>): Promise<boolean> {
  const r = await admin.from('project_lifecycle_events').insert({ organization_id: p.organization_id, project_id: p.id, project_name: p.name, event, actor, details });
  return !r.error;
}

const TRANSITIONS: Record<string, { from: string[]; to: string; event: string }> = {
  pause: { from: ['ativo'], to: 'pausado', event: 'pausado' },
  resume: { from: ['pausado'], to: 'ativo', event: 'retomado' },
  archive: { from: ['ativo', 'pausado'], to: 'arquivado', event: 'arquivado' },
  restore: { from: ['arquivado'], to: 'ativo', event: 'restaurado' },
};

async function changeLifecycle(admin: Admin, ctx: LifecycleCtx, p: ProjectRow): Promise<Reply> {
  const t = TRANSITIONS[ctx.action];
  if (!t.from.includes(p.lifecycle_status)) return fail(409, 'invalid_transition', { current: p.lifecycle_status, allowed_from: t.from });
  const now = ctx.deps.now();
  const reason = typeof ctx.body.reason === 'string' ? ctx.body.reason.trim().slice(0, 300) : '';
  const stamp = new Date(now).toISOString();
  let patch: Record<string, unknown>;
  let touched: Record<string, number> = {};

  if (ctx.action === 'pause' || (ctx.action === 'archive' && p.lifecycle_status === 'ativo')) {
    // 1) guarda o estado anterior e muda o status ANTES de desligar: se algo falhar no meio, "Retomar" ainda restaura.
    const snap = await captureSnapshot(admin, p.id, now);
    patch = ctx.action === 'pause'
      ? { lifecycle_status: 'pausado', paused_reason: reason || null, paused_at: stamp, paused_snapshot: snap }
      : { lifecycle_status: 'arquivado', archived_at: stamp, archived_by: ctx.userId, paused_reason: reason || null, paused_at: stamp, paused_snapshot: snap };
    const u = await admin.from('projects').update(patch).eq('id', p.id).eq('lifecycle_status', p.lifecycle_status).select('id');
    if (u.error) throw u.error;
    if (!u.data || !u.data.length) return fail(409, 'invalid_transition', { current: 'mudou' });
    touched = await applyPause(admin, p.id, snap);
  } else if (ctx.action === 'archive') {
    // já estava pausado: o retrato da pausa continua valendo (os agendamentos já estão desligados)
    patch = { lifecycle_status: 'arquivado', archived_at: stamp, archived_by: ctx.userId };
    const u = await admin.from('projects').update(patch).eq('id', p.id).eq('lifecycle_status', 'pausado').select('id');
    if (u.error) throw u.error;
    if (!u.data || !u.data.length) return fail(409, 'invalid_transition', { current: 'mudou' });
  } else {
    // resume / restore: devolve o que estava ligado e limpa os campos de pausa e arquivo
    touched = await applyResume(admin, p.id, p.paused_snapshot);
    patch = { lifecycle_status: 'ativo', archived_at: null, archived_by: null, paused_reason: null, paused_at: null, paused_snapshot: null };
    const u = await admin.from('projects').update(patch).eq('id', p.id).eq('lifecycle_status', p.lifecycle_status).select('id');
    if (u.error) throw u.error;
    if (!u.data || !u.data.length) return fail(409, 'invalid_transition', { current: 'mudou' });
  }
  const audit = await recordEvent(admin, p, t.event, ctx.userId, { from: p.lifecycle_status, reason: reason || null, [ctx.action === 'pause' || ctx.action === 'archive' ? 'disabled' : 'reenabled']: touched });
  return { status: 200, body: { project_id: p.id, lifecycle_status: t.to, changed: touched, audit_recorded: audit } };
}

// ---------------------------------------------------------------- plano de exclusão, exportação e exclusão definitiva

interface PlanTable { table: string; schema: string; column: string; rows: number; on_delete: string }
interface Plan { found: boolean; name: string; tables: PlanTable[]; total_rows: number; tables_checked: number; without_fk: Array<{ table: string; rows: number | null }> }

/** Projeto "totalmente vazio": nenhuma linha dependente além da configuração padrão (módulos, perfil em branco). */
export function planIsEmpty(plan: Pick<Plan, 'tables'>): boolean {
  return plan.tables.every((t) => EMPTY_IGNORED_TABLES.includes(t.table) || t.rows === 0);
}

async function loadPlan(admin: Admin, projectId: string): Promise<Plan> {
  const r = await admin.rpc('project_delete_plan', { p_project: projectId });
  if (r.error) throw r.error;
  const d = r.data as Plan;
  if (!d || d.found === false) throw new Error('plan_not_found');
  return { ...d, tables: d.tables || [], without_fk: d.without_fk || [] };
}

async function deletePlan(admin: Admin, p: ProjectRow): Promise<Reply> {
  const plan = await loadPlan(admin, p.id);
  const empty = planIsEmpty(plan);
  const groups = new Map<string, { module: string; label: string; rows: number; tables: PlanTable[] }>();
  for (const t of plan.tables) {
    const m = producerOf(t.table);
    const key = m?.key || 'outros';
    const g = groups.get(key) || { module: key, label: m?.label || 'Outros dados do projeto', rows: 0, tables: [] };
    g.rows += t.rows;
    g.tables.push(t);
    groups.set(key, g);
  }
  const orphaning = plan.tables.filter((t) => t.on_delete === 'set null' && t.rows > 0);
  return {
    status: 200,
    body: {
      project: { id: p.id, name: p.name, lifecycle_status: p.lifecycle_status },
      empty, requires_archive: !empty && p.lifecycle_status !== 'arquivado', can_purge_now: empty || p.lifecycle_status === 'arquivado',
      total_rows: plan.total_rows, groups: [...groups.values()].sort((a, b) => b.rows - a.rows), without_fk: plan.without_fk,
      // Estas tabelas ficariam órfãs (sem projeto) com um "excluir" comum; a exclusão definitiva apaga as linhas junto, depois da exportação.
      would_orphan: orphaning.map((t) => ({ table: t.table, rows: t.rows })),
      note: 'A exclusão definitiva apaga tudo o que está listado, inclusive os dados que ficariam sem projeto, e não pode ser desfeita. Exporte antes.',
    },
  };
}

/** Remove do que vai ao navegador qualquer coluna com cara de segredo (defesa em profundidade; as tabelas exportadas já não guardam segredo). */
export function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!SECRET_KEY.test(k)) out[k] = v;
  return out;
}

const intOr = (v: unknown, d: number, max: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };

async function exportPackage(admin: Admin, ctx: LifecycleCtx, p: ProjectRow): Promise<Reply> {
  if (ctx.body.finish === true) {
    // O navegador terminou de montar o arquivo: registra no histórico (números informados pelo navegador, só informativos).
    const rows = intOr(ctx.body.rows, 0, 1_000_000_000);
    const modules = Array.isArray(ctx.body.modules) ? (ctx.body.modules as unknown[]).filter((m): m is string => typeof m === 'string').slice(0, 30) : [];
    const audit = await recordEvent(admin, p, 'exportado', ctx.userId, { rows, modules, reported_by: 'browser' });
    return { status: 200, body: { recorded: audit } };
  }
  const moduleKey = ctx.body.module;
  if (moduleKey === undefined || moduleKey === null || moduleKey === '') {
    // Índice: módulos, tabelas e quantas linhas cada uma tem (do plano de exclusão; tabelas sem vínculo direto ficam "sem contagem").
    const plan = await loadPlan(admin, p.id);
    const count = new Map(plan.tables.map((t) => [t.table, t.rows] as const));
    return {
      status: 200,
      body: {
        project: { id: p.id, name: p.name }, row_cap: EXPORT_ROW_CAP, format: 'json',
        modules: MODULES.filter((m) => m.exportTables.length).map((m) => ({ key: m.key, label: m.label, tables: m.exportTables.map((t) => ({ table: t.table, rows: count.get(t.table) ?? 0, page_size: t.pageSize, reobtainable: !!t.reobtainable })) })),
        notes: ['Os dados do Google (Search Console e GA4) dá para baixar de novo depois de reconectar; o restante, não.', 'Segredos (senhas, tokens, chaves) nunca entram no pacote.', 'O pacote é montado no seu navegador: nada é enviado para fora do Zica.'],
      },
    };
  }
  const spec = EXPORT_TABLES.find((t) => t.module === moduleKey && (!ctx.body.table || t.table === ctx.body.table));
  if (!spec) return fail(422, 'export_module_invalid');
  const page = intOr(ctx.body.page, 0, 100_000);
  const from = page * spec.pageSize;
  if (from >= EXPORT_ROW_CAP) return { status: 200, body: { module: spec.module, table: spec.table, page, page_size: spec.pageSize, rows: [], has_more: false, truncated: true, warning: `Limite de ${EXPORT_ROW_CAP.toLocaleString('pt-BR')} linhas por tabela atingido: o pacote desta tabela está incompleto.` } };
  return await exportPage(admin, p, spec, page, from);
}

async function exportPage(admin: Admin, p: ProjectRow, spec: ExportTable & { module: string }, page: number, from: number): Promise<Reply> {
  let q = admin.from(spec.table).select('*').eq('project_id', p.id);
  for (const col of spec.order) q = q.order(col, { ascending: true });
  const r = await q.range(from, from + spec.pageSize);
  if (r.error) throw r.error;
  const data = (r.data || []) as Array<Record<string, unknown>>;
  const hasMore = data.length > spec.pageSize;
  const rows = data.slice(0, spec.pageSize).map(sanitizeRow);
  const truncated = hasMore && from + spec.pageSize >= EXPORT_ROW_CAP;
  return { status: 200, body: { module: spec.module, table: spec.table, page, page_size: spec.pageSize, rows, has_more: hasMore && !truncated, truncated, ...(truncated ? { warning: `Limite de ${EXPORT_ROW_CAP.toLocaleString('pt-BR')} linhas por tabela atingido: o pacote desta tabela está incompleto.` } : {}) } };
}

async function purge(admin: Admin, ctx: LifecycleCtx, p: ProjectRow): Promise<Reply> {
  const plan = await loadPlan(admin, p.id);
  const empty = planIsEmpty(plan);
  if (!empty && p.lifecycle_status !== 'arquivado') return fail(409, 'project_not_archived', { current: p.lifecycle_status });
  const typed = typeof ctx.body.confirm_name === 'string' ? ctx.body.confirm_name.trim() : '';
  if (!typed || typed !== p.name.trim()) return fail(422, 'confirmation_mismatch');
  if (!empty && ctx.body.export_acknowledged !== true) return fail(422, 'export_required');
  const r = await admin.rpc('project_purge', { p_project: p.id, p_actor: ctx.userId });
  if (r.error) {
    const msg = String(r.error.message || '');
    if (msg.includes('purge_blocked')) return fail(409, 'purge_blocked', { detail: msg.replace(/^.*purge_blocked:\s*/, '').slice(0, 300) });
    throw r.error;
  }
  return { status: 200, body: { purged: true, project_id: p.id, name: p.name, was_empty: empty, ...(r.data as Record<string, unknown>) } };
}
