/**
 * Ações dos Backlinks (F2) na função de borda `backlinks`.
 *
 *  - `get`:           resumo (contagens, domínios, âncoras, atributos, avisos) + uma página da lista + configuração + alvos acompanhados.
 *  - `import`:        guarda a lista colada/exportada (Search Console, Bing, Ahrefs, Semrush, Moz, planilha própria) para o site do projeto ou para um concorrente.
 *  - `verify`:        verifica ao vivo um lote de páginas (o link está no HTML? âncora? atributo?).
 *  - `remove`:        apaga linhas da lista.
 *  - `settings_save`: liga/desliga a reverificação automática e escolhe de quantos em quantos dias.
 *  - `alerts_dismiss`: dispensa avisos de backlinks.
 *
 * Leitura: qualquer membro da organização. Escrever e verificar: dono, administrador e editor.
 * O sistema não inventa backlinks: só existe o que foi importado e o que a verificação viu (cada linha guarda a origem e a data).
 */
import { WRITE_ROLES } from './profile-service.ts';
import { normalizeSiteInput, registrableDomain, type Deps } from './profile-analyze-core.ts';
import {
  MAX_COMPETITOR_TARGETS, MAX_IMPORT_CHARS, MAX_LINKS_PER_PROJECT, ORIGINS, VERIFY_BATCH, parseImport, summarize, verifyLink,
  type LinkRow, type LinkStatus, type Verdict,
} from './backlinks-core.ts';

export const BACKLINK_ACTIONS = ['get', 'import', 'verify', 'remove', 'settings_save', 'alerts_dismiss'];
export const PAGE_SIZE = 50;
export const MAX_VERIFY_PER_PROJECT_DAY = 3000;
const CONCURRENCY = 4;
const INSERT_CHUNK = 200;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface BacklinkCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: Deps }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const COLUMNS = 'id,target_host,kind,source_url,source_host,source_domain,target_url,anchor,link_attr,origin,status,http_status,source_noindex,links_found,check_error,first_seen_at,last_checked_at,status_changed_at,last_live_at';
const ALERT_COLUMNS = 'id,source,kind,title,detail,ref_url,created_at';

interface DbLink extends LinkRow { target_host: string; kind: 'own' | 'competitor'; source_host: string; target_url: string | null; source_noindex: boolean | null; links_found: number | null; check_error: string | null }

export async function handleBacklinkAction(admin: Admin, ctx: BacklinkCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select('id,name,domain,organization_id,wordpress_url').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (ctx.action === 'get') return await get(admin, ctx, project, role);
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'import') return await importList(admin, ctx, project);
    if (ctx.action === 'verify') return await verifyBatch(admin, ctx, project);
    if (ctx.action === 'remove') return await remove(admin, ctx, project);
    if (ctx.action === 'settings_save') return await settingsSave(admin, ctx, project);
    if (ctx.action === 'alerts_dismiss') return await alertsDismiss(admin, ctx, project);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[backlinks] operation_failed');
    return fail(500, 'backlinks_operation_failed');
  }
}

const ownHostOf = (project: Record<string, unknown>): string | null => (normalizeSiteInput(project.domain) || normalizeSiteInput(project.wordpress_url))?.host ?? null;

/** Todas as linhas do projeto (limite de 5.000 por projeto), lidas em páginas de 1.000. */
export async function loadLinks(admin: Admin, projectId: unknown): Promise<DbLink[]> {
  const out: DbLink[] = [];
  for (let from = 0; from < MAX_LINKS_PER_PROJECT + 1000; from += 1000) {
    const r = await admin.from('project_backlinks').select(COLUMNS).eq('project_id', projectId).order('first_seen_at', { ascending: true }).range(from, from + 999);
    if (r.error) throw r.error;
    out.push(...((r.data || []) as DbLink[]));
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
}

const brandTerms = (project: Record<string, unknown>, host: string | null): string[] => [String(project.name || ''), host ? registrableDomain(host).split('.')[0] : ''].filter((t) => t.trim().length >= 3);

/** Qual alvo o pedido quer: o site do projeto (padrão) ou um concorrente informado. */
function resolveTarget(ctx: BacklinkCtx, own: string | null): { host: string; kind: 'own' | 'competitor' } | { error: string } {
  const raw = ctx.body.target;
  if (raw === undefined || raw === null || raw === '') return own ? { host: own, kind: 'own' } : { error: 'project_domain_required' };
  const site = normalizeSiteInput(raw);
  if (!site) return { error: 'target_invalid' };
  if (own && registrableDomain(site.host) === registrableDomain(own)) return { host: own, kind: 'own' };
  return { host: registrableDomain(site.host), kind: 'competitor' };
}

async function get(admin: Admin, ctx: BacklinkCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const own = ownHostOf(project);
  const all = await loadLinks(admin, project.id);
  const counts = new Map<string, { host: string; kind: 'own' | 'competitor'; count: number }>();
  if (own) counts.set(own, { host: own, kind: 'own', count: 0 });
  for (const l of all) { const c = counts.get(l.target_host) || { host: l.target_host, kind: l.kind, count: 0 }; c.count++; counts.set(l.target_host, c); }
  const t = resolveTarget(ctx, own);
  if ('error' in t) return fail(422, t.error);
  const rows = all.filter((l) => l.target_host === t.host);
  const summary = summarize(rows, brandTerms(project, t.host), t.host, ctx.deps.now());
  const status = typeof ctx.body.status === 'string' ? ctx.body.status : '';
  const q = typeof ctx.body.q === 'string' ? ctx.body.q.trim().toLowerCase().slice(0, 100) : '';
  let list = rows.filter((l) => (!status || l.status === status) && (!q || l.source_url.toLowerCase().includes(q) || (l.anchor || '').toLowerCase().includes(q)));
  list = [...list].sort((a, b) => (a.status === b.status ? a.source_domain.localeCompare(b.source_domain) : a.status === 'live' ? -1 : b.status === 'live' ? 1 : a.status.localeCompare(b.status)));
  const page = Math.max(0, Math.min(Number(ctx.body.page) || 0, Math.floor(Math.max(0, list.length - 1) / PAGE_SIZE)));
  const settings = await admin.from('project_backlink_settings').select('enabled,recheck_days,last_run_at').eq('project_id', project.id).maybeSingle();
  if (settings.error) throw settings.error;
  const alerts = await admin.from('project_alerts').select(ALERT_COLUMNS).eq('project_id', project.id).eq('source', 'backlinks').is('dismissed_at', null).order('created_at', { ascending: false }).limit(30);
  if (alerts.error) throw alerts.error;
  return {
    status: 200,
    body: {
      project: { id: project.id, name: project.name, domain: own }, can_edit: WRITE_ROLES.includes(role), target: t,
      targets: [...counts.values()], summary, links: list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), page, page_size: PAGE_SIZE, filtered_total: list.length,
      settings: settings.data || null, alerts: alerts.data || [], limits: { max_links: MAX_LINKS_PER_PROJECT, total_links: all.length, max_competitors: MAX_COMPETITOR_TARGETS },
    },
  };
}

async function importList(admin: Admin, ctx: BacklinkCtx, project: Record<string, unknown>): Promise<Reply> {
  const own = ownHostOf(project);
  const t = resolveTarget(ctx, own);
  if ('error' in t) return fail(422, t.error);
  const text = ctx.body.text;
  if (typeof text !== 'string' || !text.trim()) return fail(422, 'list_required');
  if (text.length > MAX_IMPORT_CHARS) return fail(422, 'list_too_large', { limit: MAX_IMPORT_CHARS });
  const origin = typeof ctx.body.origin === 'string' ? ctx.body.origin : 'manual';
  if (!Object.prototype.hasOwnProperty.call(ORIGINS, origin)) return fail(422, 'origin_invalid');
  const parsed = parseImport(text, t.host);
  if (!parsed.rows.length) return { status: 200, body: { added: 0, already_there: 0, invalid: parsed.invalid, self_links: parsed.self_links, duplicates_in_file: parsed.duplicates, over_limit: 0, file_truncated: parsed.truncated } };
  const existing = await loadLinks(admin, project.id);
  if (t.kind === 'competitor') {
    const hosts = new Set(existing.filter((l) => l.kind === 'competitor').map((l) => l.target_host));
    if (!hosts.has(t.host) && hosts.size >= MAX_COMPETITOR_TARGETS) return fail(422, 'competitor_limit', { limit: MAX_COMPETITOR_TARGETS });
  }
  const known = new Set(existing.filter((l) => l.target_host === t.host).map((l) => l.source_url));
  const fresh = parsed.rows.filter((r) => !known.has(r.source_url));
  const room = Math.max(0, MAX_LINKS_PER_PROJECT - existing.length);
  const take = fresh.slice(0, room);
  const now = new Date(ctx.deps.now()).toISOString();
  for (let i = 0; i < take.length; i += INSERT_CHUNK) {
    const chunk = take.slice(i, i + INSERT_CHUNK).map((r) => ({
      organization_id: project.organization_id, project_id: project.id, target_host: t.host, kind: t.kind, source_url: r.source_url, source_host: r.source_host, source_domain: r.source_domain,
      target_url: r.target_url, anchor: r.anchor, link_attr: r.link_attr, origin, status: 'unverified', first_seen_at: now, created_by: ctx.userId,
    }));
    const ins = await admin.from('project_backlinks').insert(chunk);
    if (ins.error) throw ins.error;
  }
  return { status: 200, body: { added: take.length, already_there: parsed.rows.length - fresh.length, invalid: parsed.invalid, self_links: parsed.self_links, duplicates_in_file: parsed.duplicates, over_limit: fresh.length - take.length, file_truncated: parsed.truncated } };
}

export interface Transition { id: string; source_url: string; from: LinkStatus; to: LinkStatus }
/** Verifica as linhas dadas (4 de cada vez), grava o resultado e devolve quem mudou de situação. */
export async function verifyAndStore(admin: Admin, deps: Deps, rows: Array<Pick<DbLink, 'id' | 'target_host' | 'source_url' | 'status'>>): Promise<{ checked: number; transitions: Transition[]; failed: number }> {
  const transitions: Transition[] = [];
  let failed = 0;
  const one = async (r: (typeof rows)[number]) => {
    let v: Verdict;
    try { v = await verifyLink(deps, r.source_url, r.target_host); } catch { failed++; return; }
    const now = new Date(deps.now()).toISOString();
    const from = r.status;
    const changed = v.status !== from;
    const patch: Record<string, unknown> = { status: v.status, http_status: v.http_status, source_noindex: v.source_noindex, links_found: v.links_found, check_error: v.check_error, last_checked_at: now };
    if (changed) patch.status_changed_at = now;
    if (v.status === 'live') { patch.last_live_at = now; patch.anchor = v.anchor; patch.link_attr = v.link_attr; patch.target_url = v.target_url; }
    const u = await admin.from('project_backlinks').update(patch).eq('id', r.id);
    if (u.error) throw u.error;
    if (changed) transitions.push({ id: r.id as string, source_url: r.source_url, from, to: v.status });
  };
  for (let i = 0; i < rows.length; i += CONCURRENCY) await Promise.all(rows.slice(i, i + CONCURRENCY).map(one));
  return { checked: rows.length - failed, transitions, failed };
}

async function verifyBatch(admin: Admin, ctx: BacklinkCtx, project: Record<string, unknown>): Promise<Reply> {
  const own = ownHostOf(project);
  const t = resolveTarget(ctx, own);
  if ('error' in t) return fail(422, t.error);
  const all = await loadLinks(admin, project.id);
  const since = new Date(ctx.deps.now() - 86_400_000).toISOString();
  const today = all.filter((l) => l.last_checked_at && l.last_checked_at >= since).length;
  if (today >= MAX_VERIFY_PER_PROJECT_DAY) return fail(429, 'daily_limit', { limit: MAX_VERIFY_PER_PROJECT_DAY });
  const mine = all.filter((l) => l.target_host === t.host);
  const never = (l: DbLink) => !l.last_checked_at;
  let pick: DbLink[];
  const ids = ctx.body.ids;
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > VERIFY_BATCH || ids.some((i) => typeof i !== 'string' || !UUID.test(i))) return fail(422, 'ids_invalid');
    const want = new Set(ids as string[]);
    pick = mine.filter((l) => want.has(l.id as string));
  } else {
    // por padrão só as nunca verificadas; com only_pending=false, as verificadas há mais tempo primeiro
    const pool = ctx.body.only_pending === false ? mine : mine.filter(never);
    pick = [...pool].sort((a, b) => ((a.last_checked_at || '') < (b.last_checked_at || '') ? -1 : (a.last_checked_at || '') > (b.last_checked_at || '') ? 1 : 0)).slice(0, VERIFY_BATCH);
  }
  const res = await verifyAndStore(admin, ctx.deps, pick);
  const remaining = mine.filter(never).length - pick.filter(never).length;
  return { status: 200, body: { checked: res.checked, failed: res.failed, changes: res.transitions.length, remaining_pending: Math.max(0, remaining) } };
}

async function remove(admin: Admin, ctx: BacklinkCtx, project: Record<string, unknown>): Promise<Reply> {
  const ids = ctx.body.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((i) => typeof i !== 'string' || !UUID.test(i))) return fail(422, 'ids_invalid');
  const r = await admin.from('project_backlinks').delete().eq('project_id', project.id).in('id', ids);
  if (r.error) throw r.error;
  return { status: 200, body: { removed: Array.isArray(r.data) ? r.data.length : 0 } };
}

async function settingsSave(admin: Admin, ctx: BacklinkCtx, project: Record<string, unknown>): Promise<Reply> {
  const { enabled, recheck_days: days } = ctx.body;
  if (typeof enabled !== 'boolean') return fail(422, 'settings_enabled_invalid');
  const n = days === undefined ? 14 : Number(days);
  if (!Number.isInteger(n) || n < 7 || n > 90) return fail(422, 'settings_days_invalid');
  const fields = { enabled, recheck_days: n, updated_by: ctx.userId, updated_at: new Date(ctx.deps.now()).toISOString() };
  const ex = await admin.from('project_backlink_settings').select('project_id').eq('project_id', project.id).maybeSingle();
  if (ex.error) throw ex.error;
  const w = ex.data
    ? await admin.from('project_backlink_settings').update(fields).eq('project_id', project.id)
    : await admin.from('project_backlink_settings').insert({ ...fields, project_id: project.id, organization_id: project.organization_id });
  if (w.error) throw w.error;
  return { status: 200, body: { settings: { enabled, recheck_days: n } } };
}

async function alertsDismiss(admin: Admin, ctx: BacklinkCtx, project: Record<string, unknown>): Promise<Reply> {
  const id = ctx.body.alertId;
  if (id !== undefined && (typeof id !== 'string' || !UUID.test(id))) return fail(422, 'alert_id_invalid');
  if (id === undefined && ctx.body.all !== true) return fail(422, 'alert_id_required');
  let q = admin.from('project_alerts').update({ dismissed_at: new Date(ctx.deps.now()).toISOString(), dismissed_by: ctx.userId }).eq('project_id', project.id).eq('source', 'backlinks').is('dismissed_at', null);
  if (typeof id === 'string') q = q.eq('id', id);
  const r = await q;
  if (r.error) throw r.error;
  return { status: 200, body: { dismissed: Array.isArray(r.data) ? r.data.length : 0 } };
}
