/**
 * Ações da Velocidade e Core Web Vitals (F1) na função de borda `site-speed`.
 *
 *  - `run`:     mede uma URL agora (PageSpeed Insights = laboratório; CrUX = dados reais de usuários quando existirem) e guarda no histórico.
 *  - `history`: devolve as últimas medições do projeto (e os concorrentes já medidos), o agendamento e os avisos em aberto.
 *  - `schedule_save`: liga, muda ou desliga a medição automática (diária, semanal ou mensal) com alerta de piora.
 *  - `alerts_dismiss`: dispensa um aviso (ou todos os avisos de velocidade) do projeto.
 *
 * A chave do Google é SEGREDO da função (variável de ambiente): nunca é devolvida, gravada nem registrada em log.
 * Todos os projetos (antigos e novos) usam a mesma chave da plataforma; o cliente não configura nada.
 * Leitura: qualquer membro da organização. Medir: dono, administrador e editor.
 * Limites de abuso (não de cobrança): medições por projeto por dia e quantidade de concorrentes por projeto.
 */
import { WRITE_ROLES } from './profile-service.ts';
import { normalizeSiteInput, parseSafeUrl, registrableDomain } from './profile-analyze-core.ts';
import { compareRuns, parseCrux, parsePsi, type FieldMetrics, type SpeedRunRow, type Strategy } from './speed-core.ts';
import { nextRunAt, validateSchedule } from './monitor-core.ts';

export const SPEED_ACTIONS = ['run', 'history', 'schedule_save', 'alerts_dismiss'];
export const MAX_RUNS_PER_PROJECT_DAY = 40;
export const MAX_COMPETITOR_HOSTS = 10;
export const PSI_TIMEOUT_MS = 100_000;
export const CRUX_TIMEOUT_MS = 15_000;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface SpeedDeps { fetchFn: typeof fetch; now: () => number; apiKey: string | null }
export interface SpeedCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: SpeedDeps }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const COLUMNS = 'id,url,host,kind,strategy,fetched_at,performance_score,lcp_ms,cls,tbt_ms,fcp_ms,ttfb_ms,speed_index_ms,field,lighthouse_version';

const toRow = (r: Record<string, unknown>): SpeedRunRow => ({
  id: String(r.id ?? ''), url: String(r.url), host: String(r.host), kind: r.kind === 'competitor' ? 'competitor' : 'own', strategy: r.strategy === 'desktop' ? 'desktop' : 'mobile',
  fetched_at: String(r.fetched_at), performance_score: r.performance_score === null || r.performance_score === undefined ? null : Number(r.performance_score),
  lcp_ms: r.lcp_ms === null || r.lcp_ms === undefined ? null : Number(r.lcp_ms), cls: r.cls === null || r.cls === undefined ? null : Number(r.cls),
  tbt_ms: r.tbt_ms === null || r.tbt_ms === undefined ? null : Number(r.tbt_ms), fcp_ms: r.fcp_ms === null || r.fcp_ms === undefined ? null : Number(r.fcp_ms),
  ttfb_ms: r.ttfb_ms === null || r.ttfb_ms === undefined ? null : Number(r.ttfb_ms), speed_index_ms: r.speed_index_ms === null || r.speed_index_ms === undefined ? null : Number(r.speed_index_ms),
  field: (r.field as FieldMetrics | null) ?? null, lighthouse_version: (r.lighthouse_version as string | null) ?? null,
});

export async function handleSpeedAction(admin: Admin, ctx: SpeedCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select('id,name,domain,organization_id,wordpress_url').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (ctx.action === 'history') return await history(admin, project, role);
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'run') return await run(admin, ctx, project);
    if (ctx.action === 'schedule_save') return await scheduleSave(admin, ctx, project);
    if (ctx.action === 'alerts_dismiss') return await alertsDismiss(admin, ctx, project);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[site-speed] operation_failed');
    return fail(500, 'speed_operation_failed');
  }
}

async function history(admin: Admin, project: Record<string, unknown>, role: string): Promise<Reply> {
  const { data, error } = await admin.from('project_speed_runs').select(COLUMNS).eq('project_id', project.id).order('fetched_at', { ascending: false }).limit(80);
  if (error) throw error;
  const runs = (data || []).map(toRow);
  const own = normalizeSiteInput(project.domain) || normalizeSiteInput(project.wordpress_url);
  const sch = await admin.from('project_speed_schedules').select(SCHEDULE_COLUMNS).eq('project_id', project.id).maybeSingle();
  if (sch.error) throw sch.error;
  const al = await admin.from('project_alerts').select(ALERT_COLUMNS).eq('project_id', project.id).eq('source', 'speed').is('dismissed_at', null).order('created_at', { ascending: false }).limit(30);
  if (al.error) throw al.error;
  return { status: 200, body: { project: { id: project.id, name: project.name, domain: own ? own.host : null }, can_run: WRITE_ROLES.includes(role), runs, competitors: [...new Set(runs.filter((r: SpeedRunRow) => r.kind === 'competitor').map((r: SpeedRunRow) => r.host))], schedule: sch.data || null, alerts: al.data || [] } };
}

const SCHEDULE_COLUMNS = 'enabled,frequency,devices,extra_urls,include_competitors,alert_drop_points,next_run_at,last_run_at,consecutive_failures';
const ALERT_COLUMNS = 'id,source,kind,title,detail,ref_url,created_at';

async function scheduleSave(admin: Admin, ctx: SpeedCtx, project: Record<string, unknown>): Promise<Reply> {
  const own = normalizeSiteInput(project.domain) || normalizeSiteInput(project.wordpress_url);
  if (!own) return fail(422, 'project_domain_required');
  const checked = validateSchedule(ctx.body.schedule, own.host);
  if (checked.ok === false) return fail(422, checked.error);
  const v = checked.value;
  const now = ctx.deps.now();
  const existing = await admin.from('project_speed_schedules').select('enabled,frequency,devices,extra_urls,include_competitors,next_run_at').eq('project_id', project.id).maybeSingle();
  if (existing.error) throw existing.error;
  const prev = existing.data as { enabled: boolean; frequency: string; devices: string; extra_urls: string[]; include_competitors: boolean; next_run_at: string } | null;
  const sameTargets = !!prev && prev.devices === v.devices && prev.include_competitors === v.include_competitors && JSON.stringify(prev.extra_urls || []) === JSON.stringify(v.extra_urls);
  const keepClock = !!prev && prev.enabled && v.enabled && prev.frequency === v.frequency && sameTargets;
  const next = keepClock ? prev!.next_run_at : v.enabled ? new Date(now).toISOString() : nextRunAt(v.frequency, now);
  const fields = { ...v, next_run_at: next, ...(keepClock ? {} : { progress: 0, consecutive_failures: 0 }), updated_at: new Date(now).toISOString() };
  const w = prev
    ? await admin.from('project_speed_schedules').update(fields).eq('project_id', project.id)
    : await admin.from('project_speed_schedules').insert({ ...fields, project_id: project.id, organization_id: project.organization_id, created_by: ctx.userId });
  if (w.error) throw w.error;
  const saved = await admin.from('project_speed_schedules').select(SCHEDULE_COLUMNS).eq('project_id', project.id).maybeSingle();
  if (saved.error) throw saved.error;
  return { status: 200, body: { schedule: saved.data } };
}

async function alertsDismiss(admin: Admin, ctx: SpeedCtx, project: Record<string, unknown>): Promise<Reply> {
  const id = ctx.body.alertId;
  if (id !== undefined && (typeof id !== 'string' || !UUID.test(id))) return fail(422, 'alert_id_invalid');
  if (id === undefined && ctx.body.all !== true) return fail(422, 'alert_id_required');
  let q = admin.from('project_alerts').update({ dismissed_at: new Date(ctx.deps.now()).toISOString(), dismissed_by: ctx.userId }).eq('project_id', project.id).eq('source', 'speed').is('dismissed_at', null);
  if (typeof id === 'string') q = q.eq('id', id);
  const r = await q;
  if (r.error) throw r.error;
  return { status: 200, body: { dismissed: Array.isArray(r.data) ? r.data.length : 0 } };
}

async function timed(deps: SpeedDeps, url: string, init: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await deps.fetchFn(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}

async function field(deps: SpeedDeps, url: string, strategy: Strategy): Promise<{ field: FieldMetrics | null; note: string | null }> {
  const formFactor = strategy === 'desktop' ? 'DESKTOP' : 'PHONE';
  const endpoint = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(deps.apiKey || '')}`;
  const ask = async (payload: Record<string, unknown>) => {
    const res = await timed(deps, endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, formFactor }) }, CRUX_TIMEOUT_MS);
    if (res.status === 404) return { status: 404, json: null as unknown };
    if (!res.ok) return { status: res.status, json: null as unknown };
    return { status: 200, json: await res.json().catch(() => null) as unknown };
  };
  try {
    const byUrl = await ask({ url });
    if (byUrl.status === 200) { const f = parseCrux(byUrl.json, 'url'); if (f) return { field: f, note: null }; }
    if (byUrl.status !== 404 && byUrl.status !== 200) return { field: null, note: 'crux_unavailable' };
    const origin = await ask({ origin: new URL(url).origin });
    if (origin.status === 200) { const f = parseCrux(origin.json, 'origin'); if (f) return { field: f, note: null }; }
    if (origin.status !== 404 && origin.status !== 200) return { field: null, note: 'crux_unavailable' };
    return { field: null, note: 'no_field_data' };
  } catch (_e) {
    return { field: null, note: 'crux_unavailable' };
  }
}

async function run(admin: Admin, ctx: SpeedCtx, project: Record<string, unknown>): Promise<Reply> {
  if (!ctx.deps.apiKey) return fail(503, 'speed_not_configured');
  const strategy: Strategy = ctx.body.strategy === 'desktop' ? 'desktop' : 'mobile';
  const raw = typeof ctx.body.url === 'string' ? ctx.body.url.trim() : '';
  if (!raw || raw.length > 400) return fail(422, 'url_required');
  const parsed = parseSafeUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if ('error' in parsed) return fail(422, 'url_invalid');
  const u = parsed.url;
  u.hash = '';
  const url = u.href;
  const own = normalizeSiteInput(project.domain) || normalizeSiteInput(project.wordpress_url);
  const sameSite = !!own && registrableDomain(u.hostname) === registrableDomain(own.host);
  const kind: 'own' | 'competitor' = sameSite ? 'own' : 'competitor';
  if (!sameSite && ctx.body.kind !== 'competitor') return fail(422, own ? 'url_outside_project_domain' : 'project_domain_required');

  const since = new Date(ctx.deps.now() - 86_400_000).toISOString();
  const day = await admin.from('project_speed_runs').select('id').eq('project_id', project.id).gte('fetched_at', since);
  if (day.error) throw day.error;
  if ((day.data || []).length >= MAX_RUNS_PER_PROJECT_DAY) return fail(429, 'daily_limit', { limit: MAX_RUNS_PER_PROJECT_DAY });
  if (kind === 'competitor') {
    const hosts = await admin.from('project_speed_runs').select('host').eq('project_id', project.id).eq('kind', 'competitor');
    if (hosts.error) throw hosts.error;
    const known = new Set((hosts.data || []).map((r: { host: string }) => r.host));
    if (!known.has(u.hostname) && known.size >= MAX_COMPETITOR_HOSTS) return fail(422, 'competitor_limit', { limit: MAX_COMPETITOR_HOSTS });
  }

  const m = await measureAndStore(admin, ctx.deps, project, url, u.hostname, strategy, kind, ctx.userId);
  if (m.ok === false) return m.reply;
  return { status: 200, body: { run: m.saved, previous: m.priors[0] ?? null, delta: compareRuns(m.saved, m.priors[0] ?? null), field_note: m.fieldNote, lab_fetched_at: m.labFetchedAt } };
}

export type MeasureResult =
  | { ok: true; saved: SpeedRunRow; priors: SpeedRunRow[]; fieldNote: string | null; labFetchedAt: string | null }
  | { ok: false; reply: Reply };

/** Mede uma URL (laboratório + campo), guarda no histórico e devolve também as medições anteriores da mesma URL/aparelho (até 3, da mais nova). Usado pela medição manual e pelo agendamento. */
export async function measureAndStore(admin: Admin, deps: SpeedDeps, project: Record<string, unknown>, url: string, host: string, strategy: Strategy, kind: 'own' | 'competitor', requestedBy: string | null): Promise<MeasureResult> {
  if (!deps.apiKey) return { ok: false, reply: fail(503, 'speed_not_configured') };
  const before = await admin.from('project_speed_runs').select(COLUMNS).eq('project_id', project.id).eq('url', url).eq('strategy', strategy).order('fetched_at', { ascending: false }).limit(3);
  if (before.error) throw before.error;
  let psiJson: unknown;
  try {
    const res = await timed(deps, `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${encodeURIComponent(deps.apiKey)}`, { method: 'GET' }, PSI_TIMEOUT_MS);
    if (res.status === 429) return { ok: false, reply: fail(429, 'google_quota') };
    if (res.status === 400) {
      const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      return { ok: false, reply: fail(422, 'url_not_measurable', { detail: String(body?.error?.message || '').slice(0, 200) }) };
    }
    if (!res.ok) return { ok: false, reply: fail(502, 'google_error', { status: res.status }) };
    psiJson = await res.json();
  } catch (_e) {
    return { ok: false, reply: fail(504, 'google_timeout') };
  }
  const lab = parsePsi(psiJson);
  if (!lab) return { ok: false, reply: fail(502, 'google_no_report') };
  const f = await field(deps, url, strategy);
  const row = {
    organization_id: project.organization_id, project_id: project.id, url, host, kind, strategy,
    performance_score: lab.score, lcp_ms: lab.lcp, cls: lab.cls, tbt_ms: lab.tbt, fcp_ms: lab.fcp, ttfb_ms: lab.ttfb, speed_index_ms: lab.speedIndex,
    field: f.field, lighthouse_version: lab.lighthouseVersion, requested_by: requestedBy, fetched_at: new Date(deps.now()).toISOString(),
  };
  const ins = await admin.from('project_speed_runs').insert(row).select(COLUMNS).single();
  if (ins.error) throw ins.error;
  return { ok: true, saved: toRow(ins.data), priors: (before.data || []).map(toRow), fieldNote: f.note, labFetchedAt: lab.fetchTime };
}
