/**
 * Ações da Visão Geral e Estrutura do negócio na função de borda `site-overview`.
 *
 *  - `overview`:          indicadores (Google e GA4 com comparação ao período anterior), cliques de contato, diagnósticos e a árvore do domínio.
 *  - `refresh_structure`: lê de novo os sitemaps, robots e llms.txt do site e dos subdomínios que aparecem no Google e guarda o mapa.
 *
 * Leitura: qualquer membro da organização. Atualizar o mapa: dono, administrador e editor.
 * As somas pesadas rodam no banco (`site_overview_data`); aqui só se conferem papel e projeto e se monta a resposta.
 */
import { WRITE_ROLES } from './profile-service.ts';
import { normalizeSiteInput, registrableDomain, type Deps } from './profile-analyze-core.ts';
import { discoverMap, type SiteMapResult } from './profile-discover-core.ts';
import { buildDiagnostics, buildKpis, buildTree, type Connections, type MapSummary, type RawOverview } from './overview-core.ts';

export const OVERVIEW_ACTIONS = ['overview', 'refresh_structure'];
export const REFRESH_MIN_INTERVAL_MS = 10 * 60_000;
export const MAX_REFRESH_HOSTS = 4;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface OverviewCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: Deps }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const primaryHostOf = (p: Record<string, unknown>): string | null => (normalizeSiteInput(p.domain) || normalizeSiteInput(p.wordpress_url))?.host ?? null;

export async function handleOverviewAction(admin: Admin, ctx: OverviewCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select('id,name,domain,wordpress_url,organization_id').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (ctx.action === 'overview') return await overview(admin, ctx, project, role);
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'refresh_structure') return await refreshStructure(admin, ctx, project);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[site-overview] operation_failed');
    return fail(500, 'overview_operation_failed');
  }
}

async function loadMaps(admin: Admin, projectId: unknown): Promise<MapSummary[]> {
  const r = await admin.from('project_site_maps').select('host,fetched_at,is_primary,summary').eq('project_id', projectId).order('fetched_at', { ascending: false }).limit(40);
  if (r.error) throw r.error;
  return (r.data || []) as MapSummary[];
}

async function overview(admin: Admin, ctx: OverviewCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const days = [7, 28, 90].includes(Number(ctx.body.days)) ? Number(ctx.body.days) : 28;
  const rpc = await admin.rpc('site_overview_data', { p_project: project.id, p_days: days });
  if (rpc.error) throw rpc.error;
  const raw = rpc.data as RawOverview;
  const conns = await admin.from('nexus_oauth_connections').select('provider').eq('project_id', project.id);
  if (conns.error) throw conns.error;
  const providers = new Set((conns.data || []).map((c: { provider: string }) => c.provider));
  const keys = await admin.from('nexus_site_keys').select('site_id').eq('project_id', project.id);
  if (keys.error) throw keys.error;
  const conn: Connections = { gsc: providers.has('gsc'), ga4: providers.has('ga4'), bing: providers.has('bing'), tracking_key: (keys.data || []).length > 0 };
  const maps = await loadMaps(admin, project.id);
  const primary = primaryHostOf(project);
  const kpis = buildKpis(raw);
  const mapRows = maps as MapSummary[];
  return {
    status: 200,
    body: {
      project: { id: project.id, name: project.name, domain: primary }, can_refresh: WRITE_ROLES.includes(role), days,
      windows: { gsc: raw.gsc.window, ga4: raw.ga4.window }, connections: conn, kpis,
      diagnostics: buildDiagnostics(raw, kpis, conn, mapRows, primary, ctx.deps.now()),
      channels: raw.ga4.channels, top_pages: raw.gsc.top_pages, top_queries: raw.gsc.top_queries, ga4_pages: raw.ga4.top_pages,
      tree: buildTree(raw, mapRows, primary), map_updated_at: maps[0]?.fetched_at ?? null,
    },
  };
}

/** Resumo do mapa que fica guardado (sem a página inicial inteira, só o que a árvore usa). */
export function summarizeMap(m: SiteMapResult): Record<string, unknown> {
  return {
    robots: { found: m.robots.found, sitemaps: m.robots.sitemaps.slice(0, 10), disallow_all: m.robots.disallowAll },
    llms: { found: m.llms.found },
    sitemap: {
      found: m.sitemap.found, urls: m.sitemap.urls, truncated: m.sitemap.truncated, newest: m.sitemap.newest,
      files: m.sitemap.files.slice(0, 30).map((f) => ({ url: f.url, count: f.count })),
      sections: m.sitemap.sections.slice(0, 60).map((s) => ({ section: s.section, count: s.count, latest: s.latest })),
      hosts: m.sitemap.hosts,
    },
    subdomains: m.subdomains.slice(0, 20), home_kind: m.homeKind,
  };
}

async function refreshStructure(admin: Admin, ctx: OverviewCtx, project: Record<string, unknown>): Promise<Reply> {
  const primary = primaryHostOf(project);
  if (!primary) return fail(422, 'project_domain_required');
  const last = await admin.from('project_site_maps').select('fetched_at').eq('project_id', project.id).order('fetched_at', { ascending: false }).limit(1);
  if (last.error) throw last.error;
  const lastAt = last.data && last.data.length ? Date.parse(String(last.data[0].fetched_at)) : 0;
  if (lastAt && ctx.deps.now() - lastAt < REFRESH_MIN_INTERVAL_MS) return fail(429, 'refresh_too_soon', { retry_after_seconds: Math.ceil((REFRESH_MIN_INTERVAL_MS - (ctx.deps.now() - lastAt)) / 1000) });
  const rpc = await admin.rpc('site_overview_data', { p_project: project.id, p_days: 90 });
  if (rpc.error) throw rpc.error;
  const reg = registrableDomain(primary);
  const hosts = [primary];
  for (const h of ((rpc.data as RawOverview).gsc.by_host || []).slice().sort((a, b) => b.impressions - a.impressions)) {
    if (hosts.length >= MAX_REFRESH_HOSTS) break;
    const site = h.host ? normalizeSiteInput(h.host) : null;
    if (site && registrableDomain(site.host) === reg && !hosts.includes(site.host)) hosts.push(site.host);
  }
  const results = await Promise.allSettled(hosts.map((host) => discoverMap(ctx.deps, { origin: `https://${host}`, host })));
  const now = new Date(ctx.deps.now()).toISOString();
  const rows: Array<Record<string, unknown>> = [];
  const report: Array<{ host: string; ok: boolean; sitemap_urls: number | null }> = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') { report.push({ host: hosts[i], ok: false, sitemap_urls: null }); return; }
    rows.push({ organization_id: project.organization_id, project_id: project.id, host: hosts[i], is_primary: hosts[i] === primary, fetched_at: now, home_kind: r.value.homeKind, summary: summarizeMap(r.value), requested_by: ctx.userId });
    report.push({ host: hosts[i], ok: true, sitemap_urls: r.value.sitemap.found ? r.value.sitemap.urls : null });
  });
  if (rows.length) {
    const ins = await admin.from('project_site_maps').insert(rows);
    if (ins.error) throw ins.error;
  }
  return { status: 200, body: { refreshed: rows.length, hosts: report, fetched_at: now } };
}
