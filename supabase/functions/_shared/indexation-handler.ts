/**
 * Ações da Indexação avançada (módulo `indexacao` do portão `engine`).
 *
 *  Leitura (qualquer membro):  overview, list, plan.
 *  Editor, administrador, dono: inventory_sync, check_urls, google_inspect, submit_indexnow, bing_submit, hygiene.
 *  Administrador ou dono:       indexnow_key_save (a chave decide quem pode avisar os buscadores em nome do site).
 *
 * Nada aqui é destrutivo e nada custa dinheiro: Search Console (consulta), IndexNow e Bing Webmaster são gratuitos.
 * O Google NÃO tem API para pedir indexação de páginas comuns: `google_inspect` só LÊ o estado.
 * Cada ação grava fatos no barramento (project_events). Estado desconhecido é "desconhecido": nada é inventado.
 */
import {
  fail, guarded, hasRole, isUuid, loadAllRows, mapLimit, ok, resolveProject, type Admin, type MinRole, type ProjectBase, type Reply,
} from './engine-kernel.ts';
import { recordEvents, type ProjectEventInput } from './project-events.ts';
import {
  BING_BATCH_MAX, GOOGLE_INSPECT_DAILY_LIMIT, GOOGLE_INSPECT_PER_MINUTE, INDEXNOW_KEY_RE, INDEXNOW_MAX_URLS, PROBLEM_TEXT, SEVERITY_ORDER,
  ENGINE_CATALOG, belongsToProject, buildPlan, chunkList, coverageBy, defaultKeyLocation, evaluateHygiene, isValidHreflang, keyFileMatches, languageOfUrl, makeLimiter, matchTaxonomyNode, normalizeUrl, parentOf,
  projectHosts, propertyCovers, sectionOfPath, selectUnsent, urlProblems, type HreflangEvidence, type Engine, type HostEvidence, type HygieneEvidence, type IndexState, type PlanInput, type ProblemKey,
  type TaxNode, type UrlRow, type UrlSource,
} from './indexation-core.ts';
import {
  checkUrl, makeCrawler, politeGet, probeSoft404, robotsFor, softVerdictFor, walkSitemaps, type CrawlDeps, type Crawler, type SoftProbe,
} from './indexation-crawl.ts';
import { bingQuota, bingSiteFor, bingSubmitBatch, googleInspect, submitIndexNow } from './indexation-engines.ts';
import { pageSignals } from './indexation-core.ts';

export const INDEXATION_ACTIONS = ['overview', 'list', 'plan', 'inventory_sync', 'check_urls', 'google_inspect', 'submit_indexnow', 'bing_submit', 'hygiene', 'indexnow_key_save'];
export const READ_ACTIONS = ['overview', 'list', 'plan'];
export const ADMIN_ACTIONS = ['indexnow_key_save'];
export const MAX_INVENTORY = 50_000;
export const MAX_CHECK_PER_CALL = 100;
export const MAX_GOOGLE_PER_CALL = 100;
export const MAX_INDEXNOW_PER_CALL = INDEXNOW_MAX_URLS * 3;
export const MAX_SOFT_PROBES = 12;
export const MAX_HOSTS = 8;
const WINDOW_24H = 86_400_000;

export interface GoogleLink { secret: string; property: string | null }
export interface IndexationDeps extends CrawlDeps {
  /** Segredo do Search Console do projeto (`oauth-access:<token>` ou conta de serviço). null = sem conexão; lança código curto se a conexão existe e não pôde ser usada. */
  resolveGoogle?: (organizationId: string, projectId: string) => Promise<GoogleLink | null>;
  /** Chave de API do Bing Webmaster da organização. null = sem credencial. */
  resolveBingKey?: (organizationId: string) => Promise<string | null>;
  budgetMs?: number;
}
export interface IndexationCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: IndexationDeps }

const URL_COLUMNS = 'id,url,host,path,source,lang,taxonomy_node_id,first_seen,last_seen,in_sitemap,in_search_console,gsc_impressions,gsc_clicks,article_id,lastmod,changed_at,http_status,canonical,robots_meta,x_robots,redirect_to,https_redirect,soft404_suspect,check_error,last_checked_at';
const nowIso = (ctx: IndexationCtx) => new Date(ctx.deps.now()).toISOString();
const clampInt = (v: unknown, def: number, min: number, max: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
const UPSERT_CHUNK = 500;

type Status = { state: IndexState; checked_at: string; detail: Record<string, unknown> };
type StatusMap = Map<string, Map<Engine, Status>>;

export async function handleIndexationAction(admin: Admin, ctx: IndexationCtx): Promise<Reply> {
  return guarded('indexacao', async () => {
    if (!INDEXATION_ACTIONS.includes(ctx.action)) return fail(400, 'unknown_action');
    const min: MinRole = READ_ACTIONS.includes(ctx.action) ? 'member' : ADMIN_ACTIONS.includes(ctx.action) ? 'admin' : 'editor';
    const scope = await resolveProject(admin, ctx, ctx.body.projectId, min);
    if (scope.ok === false) return scope.reply;
    const { project, role } = scope;
    switch (ctx.action) {
      case 'overview': return await overview(admin, ctx, project, role);
      case 'list': return await list(admin, ctx, project);
      case 'plan': return await plan(admin, ctx, project);
      case 'inventory_sync': return await inventorySync(admin, ctx, project);
      case 'check_urls': return await checkUrls(admin, ctx, project);
      case 'google_inspect': return await googleInspectAction(admin, ctx, project);
      case 'submit_indexnow': return await submitIndexNowAction(admin, ctx, project);
      case 'bing_submit': return await bingSubmit(admin, ctx, project);
      case 'hygiene': return await hygiene(admin, ctx, project);
      case 'indexnow_key_save': return await indexnowKeySave(admin, ctx, project);
      default: return fail(400, 'unknown_action');
    }
  });
}

// ------------------------------------------------------------------------------------------------------------ leitura do banco
const loadUrls = async (admin: Admin, projectId: string): Promise<{ rows: UrlRow[]; truncated: boolean }> => loadAllRows<UrlRow>(admin, 'index_urls', URL_COLUMNS, { col: 'project_id', val: projectId }, MAX_INVENTORY + 1000);

async function loadStatuses(admin: Admin, projectId: string): Promise<StatusMap> {
  const { rows } = await loadAllRows<{ url_id: string; engine: Engine; state: IndexState; checked_at: string; detail: Record<string, unknown> }>(admin, 'index_status', 'url_id,engine,state,checked_at,detail', { col: 'project_id', val: projectId }, 200_000);
  const m: StatusMap = new Map();
  for (const r of rows) (m.get(r.url_id) || m.set(r.url_id, new Map()).get(r.url_id)!).set(r.engine, { state: r.state, checked_at: r.checked_at, detail: r.detail || {} });
  return m;
}
const googleOf = (sm: StatusMap, id: string): IndexState => sm.get(id)?.get('google')?.state ?? 'desconhecido';
const googleMap = (rows: UrlRow[], sm: StatusMap) => new Map(rows.map((r) => [r.id, googleOf(sm, r.id)] as const));
const sentSet = (rows: UrlRow[], sm: StatusMap) => new Set(rows.filter((r) => [...(sm.get(r.id)?.values() || [])].some((s) => s.state === 'enviada')).map((r) => r.id));

async function loadNodes(admin: Admin, projectId: string): Promise<TaxNode[]> {
  try {
    const { rows } = await loadAllRows<TaxNode>(admin, 'project_taxonomy_nodes', 'id,kind,slug,label,keywords,status', { col: 'project_id', val: projectId }, 20_000);
    return rows.map((n) => ({ ...n, keywords: Array.isArray(n.keywords) ? n.keywords : [] }));
  } catch { return []; } // módulo de taxonomia ainda não instalado: sem nós
}

async function upsertStatus(admin: Admin, project: ProjectBase, rows: Array<{ url_id: string; engine: Engine; state: IndexState; detail: Record<string, unknown>; checked_at: string }>): Promise<void> {
  for (const part of chunkList(rows, UPSERT_CHUNK)) {
    const r = await admin.from('index_status').upsert(part.map((x) => ({ organization_id: project.organization_id, project_id: project.id, ...x })), { onConflict: 'url_id,engine' });
    if (r.error) throw r.error;
  }
}
async function addSubmission(admin: Admin, ctx: IndexationCtx, project: ProjectBase, s: { engine: Engine; host: string | null; urls: number; status: 'aceita' | 'recusada' | 'erro' | 'bloqueada'; response: Record<string, unknown> }): Promise<void> {
  const r = await admin.from('index_submissions').insert({ organization_id: project.organization_id, project_id: project.id, engine: s.engine, host: s.host, urls_count: s.urls, status: s.status, response: s.response, created_by: ctx.userId });
  if (r.error) throw r.error;
}
const event = (project: ProjectBase, kind: string, subject: Record<string, unknown>, payload: Record<string, unknown>): ProjectEventInput => ({ organization_id: project.organization_id, project_id: project.id, module: 'indexacao', kind, subject, payload });
const samplePaths = (urls: string[], n = 5) => urls.slice(0, n).map((u) => { try { const x = new URL(u); return `${x.hostname}${x.pathname}`; } catch { return u; } });
const crawlerFor = (ctx: IndexationCtx, project: ProjectBase): Crawler => makeCrawler(ctx.deps, projectHosts(project));

// ------------------------------------------------------------------------------------------------------------ inventory_sync
interface Cand { url: string; host: string; path: string; key: string; sources: Set<UrlSource>; in_sitemap: boolean; lastmod: string | null; imp: number; clk: number; in_gsc: boolean; article_id: string | null; article_changed: string | null }
const SOURCE_PRIORITY: UrlSource[] = ['sitemap', 'artigo', 'search_console', 'manual', 'varredura'];
const DEFAULT_SITEMAPS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml'];

/** Endereços de partida dos sitemaps de um host: os declarados no robots.txt + os caminhos comuns + os guardados no mapa do domínio. */
async function sitemapStarts(c: Crawler, hosts: string[], mapStarts: string[], langPrefixes: string[] = []): Promise<{ starts: string[]; optional: Set<string> }> {
  const out = new Set<string>(mapStarts);
  const optional = new Set<string>();
  const guess = (u: string) => { out.add(u); const k = normalizeUrl(u)?.key; if (k) optional.add(k); };
  await mapLimit(hosts, 4, async (h) => {
    const rb = await robotsFor(c, h);
    if (rb.state === 'ok') for (const s of rb.rules.sitemaps) { out.add(s); const k = normalizeUrl(s)?.key; if (k) optional.delete(k); }
    for (const p of DEFAULT_SITEMAPS) if (!out.has(`https://${h}${p}`)) guess(`https://${h}${p}`);
    // sites com uma pasta por idioma (/en/, /es/...) costumam ter um sitemap em cada pasta
    for (const l of langPrefixes) for (const p of ['sitemap.xml', 'sitemap_index.xml']) if (!out.has(`https://${h}/${l}/${p}`)) guess(`https://${h}/${l}/${p}`);
  });
  return { starts: [...out], optional };
}

async function siteMapHints(admin: Admin, project: ProjectBase): Promise<{ hosts: string[]; starts: string[] }> {
  const r = await admin.from('project_site_maps').select('host,fetched_at,summary').eq('project_id', project.id).order('fetched_at', { ascending: false }).limit(40);
  if (r.error) return { hosts: [], starts: [] };
  const hosts = new Set<string>(); const starts = new Set<string>(); const seen = new Set<string>();
  for (const m of (r.data || []) as Array<{ host: string; summary: { robots?: { sitemaps?: string[] }; sitemap?: { files?: Array<{ url: string }> }; subdomains?: string[] } | null }>) {
    if (seen.has(m.host)) continue; // só o mapa mais recente de cada host
    seen.add(m.host); hosts.add(m.host);
    for (const s of m.summary?.subdomains || []) hosts.add(s);
    for (const s of m.summary?.robots?.sitemaps || []) starts.add(s);
    for (const f of m.summary?.sitemap?.files || []) starts.add(f.url);
  }
  return { hosts: [...hosts], starts: [...starts] };
}

async function inventorySync(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const ph = projectHosts(project);
  if (!ph.primary) return fail(422, 'project_domain_required', { message: 'Cadastre o domínio do projeto antes de montar o inventário.' });
  const started = ctx.deps.now();
  const warnings: string[] = [];
  let rejectedForeign = 0, rejectedInvalid = 0, httpNormalized = 0;
  const c = crawlerFor(ctx, project);
  const existing = await loadUrls(admin, project.id);
  if (existing.truncated) warnings.push('O inventário já passa do limite de leitura desta ação; parte dele não foi considerada.');
  const byKey = new Map<string, UrlRow>();
  for (const r of existing.rows) { const n = normalizeUrl(r.url); if (n) byKey.set(n.key, r); }

  // (b) Search Console: páginas com impressões (somadas no banco)
  const cands = new Map<string, Cand>();
  const cand = (raw: unknown, base?: string): Cand | null => {
    const n = normalizeUrl(raw, base);
    if (!n) { rejectedInvalid++; return null; }
    if (typeof raw === 'string' && /^http:\/\//i.test(raw.trim())) httpNormalized++;
    if (!belongsToProject(n.host, ph)) { rejectedForeign++; return null; }
    return cands.get(n.key) || (cands.set(n.key, { url: n.url, host: n.host, path: n.path, key: n.key, sources: new Set(), in_sitemap: false, lastmod: null, imp: 0, clk: 0, in_gsc: false, article_id: null, article_changed: null }), cands.get(n.key)!);
  };
  let gscHosts: string[] = [];
  const gsc = await admin.rpc('indexation_gsc_pages', { p_project: project.id, p_days: 90, p_limit: 20000 });
  if (gsc.error) warnings.push('Não consegui ler as páginas do Search Console (a função do banco não respondeu). O inventário ficou sem elas.');
  else {
    for (const p of (Array.isArray(gsc.data) ? gsc.data : []) as Array<{ page: string; impressions: number; clicks: number }>) {
      const x = cand(p.page);
      if (!x) continue;
      x.sources.add('search_console'); x.in_gsc = true; x.imp += Number(p.impressions) || 0; x.clk += Number(p.clicks) || 0;
    }
    gscHosts = [...new Set([...cands.values()].map((x) => x.host))];
  }

  // (c) artigos publicados
  const art = await loadAllRows<{ id: string; published_url: string | null; published_at: string | null; updated_at?: string | null }>(admin, 'articles', 'id,published_url,published_at,updated_at', { col: 'project_id', val: project.id }, 50_000).catch(() => null);
  if (!art) warnings.push('Não consegui ler os artigos do projeto.');
  else for (const a of art.rows as Array<{ id: string; published_url: string | null; published_at: string | null; updated_at?: string | null; status?: string }>) {
    if (!a.published_url || (a.status !== undefined && a.status !== 'published')) continue;
    const x = cand(a.published_url);
    if (!x) continue;
    x.sources.add('artigo'); x.article_id = a.id; x.article_changed = a.updated_at || a.published_at || null;
  }

  // (d) URLs manuais
  const manual = Array.isArray(ctx.body.urls) ? (ctx.body.urls as unknown[]).slice(0, 500) : [];
  for (const raw of manual) { const x = cand(raw); if (x) x.sources.add('manual'); }

  // (a) sitemaps do domínio e dos subdomínios do projeto
  const hints = await siteMapHints(admin, project);
  const hostList = [...new Set([ph.primary, ...hints.hosts, ...gscHosts, ...existing.rows.map((r) => r.host)].filter((h) => h && belongsToProject(h, ph)) as string[])].slice(0, MAX_HOSTS);
  const starts = await sitemapStarts(c, hostList, hints.starts, langFolders(existing.rows));
  const walk = await walkSitemaps(c, { startUrls: starts.starts, optional: starts.optional, budgetMs: ctx.deps.budgetMs ?? 100_000, startedAt: started });
  rejectedForeign += walk.rejectedForeign; rejectedInvalid += walk.rejectedInvalid; httpNormalized += walk.httpNormalized;
  for (const e of walk.entries) {
    const x = cand(e.url);
    if (!x) continue;
    x.sources.add('sitemap'); x.in_sitemap = true;
    if (e.lastmod && (!x.lastmod || e.lastmod > x.lastmod)) x.lastmod = e.lastmod;
  }
  if (walk.truncated) warnings.push(`A leitura dos sitemaps foi cortada pelo tempo ou pelo limite de arquivos (${walk.remaining} arquivo(s) ficaram para a próxima).`);
  if (!walk.files.some((f) => f.kind !== 'erro')) warnings.push('Nenhum sitemap válido foi encontrado.');

  if (cands.size > MAX_INVENTORY) warnings.push(`O inventário passou de ${MAX_INVENTORY.toLocaleString('pt-BR')} URLs; as que passaram do limite ficaram de fora.`);
  const nodes = await loadNodes(admin, project.id);
  const now = nowIso(ctx);
  const rowsOut: Array<Record<string, unknown>> = [];
  let created = 0, updated = 0;
  const newUrls: string[] = [];
  for (const x of [...cands.values()].slice(0, MAX_INVENTORY)) {
    const ex = byKey.get(x.key);
    const source = SOURCE_PRIORITY.find((s) => x.sources.has(s)) as UrlSource;
    const node = matchTaxonomyNode(x.path, nodes);
    if (!ex) {
      created++; newUrls.push(x.url);
      rowsOut.push({ organization_id: project.organization_id, project_id: project.id, url: x.url, host: x.host, path: x.path.slice(0, 2048), source, lang: languageOfUrl(x.url), taxonomy_node_id: node, first_seen: now, last_seen: now, in_sitemap: x.in_sitemap, in_search_console: x.in_gsc, gsc_impressions: x.imp, gsc_clicks: x.clk, article_id: x.article_id, lastmod: x.lastmod, changed_at: now, soft404_suspect: false });
      continue;
    }
    const lastmodAdvanced = !!x.lastmod && (!ex.lastmod || x.lastmod > ex.lastmod);
    const articleChanged = !!x.article_changed && Date.parse(x.article_changed) > Date.parse(ex.changed_at);
    if (lastmodAdvanced || articleChanged || x.in_sitemap !== ex.in_sitemap || x.imp !== ex.gsc_impressions) updated++;
    rowsOut.push({
      organization_id: project.organization_id, project_id: project.id, url: ex.url, host: ex.host, path: ex.path, source: ex.source, lang: ex.lang ?? languageOfUrl(ex.url), taxonomy_node_id: node ?? ex.taxonomy_node_id, first_seen: ex.first_seen, last_seen: now,
      in_sitemap: x.in_sitemap || (ex.in_sitemap && !walk.completeHosts.has(ex.host)), in_search_console: x.in_gsc || (gsc.error ? ex.in_search_console : false), gsc_impressions: gsc.error ? ex.gsc_impressions : x.imp, gsc_clicks: gsc.error ? ex.gsc_clicks : x.clk,
      article_id: x.article_id ?? ex.article_id, lastmod: x.lastmod ?? ex.lastmod, changed_at: lastmodAdvanced || articleChanged ? now : ex.changed_at, soft404_suspect: ex.soft404_suspect,
    });
  }
  // URLs que estavam no sitemap e sumiram dele (só quando o host teve a leitura completa)
  const seenKeys = new Set(cands.keys());
  let removed = 0;
  for (const [key, ex] of byKey) {
    if (seenKeys.has(key) || !ex.in_sitemap || !walk.completeHosts.has(ex.host)) continue;
    removed++;
    rowsOut.push({ organization_id: project.organization_id, project_id: project.id, url: ex.url, host: ex.host, path: ex.path, source: ex.source, lang: ex.lang ?? null, taxonomy_node_id: ex.taxonomy_node_id, first_seen: ex.first_seen, last_seen: ex.last_seen, in_sitemap: false, in_search_console: ex.in_search_console, gsc_impressions: ex.gsc_impressions, gsc_clicks: ex.gsc_clicks, article_id: ex.article_id, lastmod: ex.lastmod, changed_at: ex.changed_at, soft404_suspect: ex.soft404_suspect });
  }
  for (const part of chunkList(rowsOut, UPSERT_CHUNK)) {
    const r = await admin.from('index_urls').upsert(part, { onConflict: 'project_id,url' });
    if (r.error) throw r.error;
  }
  const total = byKey.size + created;
  const outside = [...cands.values()].filter((x) => !x.in_sitemap && (x.in_gsc || x.sources.has('artigo')));
  const evs: ProjectEventInput[] = [event(project, 'indexacao.inventario_atualizado', { hosts: hostList }, { count: total, new: created, updated, removed_from_sitemap: removed, rejected_foreign: rejectedForeign })];
  if (created > 0) evs.push(event(project, 'indexacao.url_descoberta', { sample: samplePaths(newUrls) }, { count: created }));
  if (outside.length > 0) evs.push(event(project, 'indexacao.problema', { check: 'fora_do_sitemap', sample: samplePaths(outside.map((x) => x.url)) }, { count: outside.length, kind: 'fora_do_sitemap' }));
  await recordEvents(admin, evs);
  return ok({
    urls_total: total, new: created, updated, removed_from_sitemap: removed, in_sitemap: [...cands.values()].filter((x) => x.in_sitemap).length, outside_sitemap: outside.length,
    outside_sitemap_sample: outside.slice(0, 10).map((x) => x.url), rejected_foreign: rejectedForeign, rejected_invalid: rejectedInvalid, http_normalized: httpNormalized,
    hosts: hostList, sitemap_files: walk.files.map((f) => ({ url: f.url, kind: f.kind, urls: f.urls, error: f.error ?? null })), truncated: walk.truncated, remaining_files: walk.remaining, warnings, synced_at: now,
  });
}

// ------------------------------------------------------------------------------------------------------------ check_urls
async function checkUrls(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const all = await loadUrls(admin, project.id);
  if (!all.rows.length) return fail(422, 'inventory_empty', { message: 'O inventário está vazio. Atualize o inventário antes de verificar.' });
  let pick: UrlRow[];
  const ids = ctx.body.urlIds;
  if (ids !== undefined) {
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_CHECK_PER_CALL || ids.some((i) => !isUuid(i))) return fail(422, 'ids_invalid', { message: 'Seleção de URLs inválida (de 1 a 100).' });
    const want = new Set(ids as string[]);
    pick = all.rows.filter((r) => want.has(r.id));
  } else {
    const host = typeof ctx.body.host === 'string' ? ctx.body.host.toLowerCase() : '';
    const limit = clampInt(ctx.body.limit, 40, 1, MAX_CHECK_PER_CALL);
    pick = all.rows.filter((r) => !host || r.host === host).sort((a, b) => (a.last_checked_at || '').localeCompare(b.last_checked_at || '') || b.gsc_impressions - a.gsc_impressions).slice(0, limit);
  }
  const c = crawlerFor(ctx, project);
  const token = (ctx.deps.now() % 1_000_000).toString(36);
  const probes = new Map<string, Promise<SoftProbe | null>>();
  let probeCount = 0, probesSkipped = 0;
  const probeFor = (parent: string): Promise<SoftProbe | null> => {
    let p = probes.get(parent);
    if (!p) {
      if (probeCount >= MAX_SOFT_PROBES) { probesSkipped++; return Promise.resolve(null); }
      probeCount++;
      p = probeSoft404(c, parent, token).catch(() => null);
      probes.set(parent, p);
    }
    return p;
  };
  const now = nowIso(ctx);
  const probeHttp = ctx.body.probeHttp === true;
  let httpProbed = 0;
  const results = await mapLimit(pick, 4, async (r) => {
    const out = await checkUrl(c, r.url);
    let soft = false;
    if (out.status === 200 && out.fingerprint) {
      const parent = parentOf(r.url);
      if (parent) soft = softVerdictFor(r.url, out, await probeFor(parent)).soft;
    }
    let httpsRedirect: boolean | null = r.https_redirect;
    if (probeHttp && httpProbed < 20) {
      httpProbed++;
      const g = await politeGet(c, r.url.replace(/^https:/i, 'http:'), { method: 'GET', maxBytes: 1, checkRobots: false });
      if (g.ok && g.hops[0]) httpsRedirect = g.hops[0].status >= 300 && g.hops[0].status < 400 && /^https:\/\//i.test(new URL(g.hops[0].location || '', g.hops[0].url).href);
    }
    const patch = {
      lang: out.htmlLang ?? r.lang ?? null, http_status: out.status, canonical: out.canonical, robots_meta: out.robotsMeta, x_robots: out.xRobots, redirect_to: out.redirectTo, soft404_suspect: soft, https_redirect: httpsRedirect,
      check_error: out.error, last_checked_at: now,
    };
    const u = await admin.from('index_urls').update(patch).eq('id', r.id).eq('project_id', project.id);
    if (u.error) throw u.error;
    return { row: { ...r, ...patch } as UrlRow, error: out.error };
  });
  const byProblem = new Map<ProblemKey, string[]>();
  for (const r of results) for (const p of urlProblems(r.row)) (byProblem.get(p) || byProblem.set(p, []).get(p)!).push(r.row.url);
  const failed = results.filter((r) => r.error).length;
  const evs: ProjectEventInput[] = [event(project, 'indexacao.verificadas', {}, { count: results.length, failed, with_problems: [...new Set([...byProblem.values()].flat())].length })];
  for (const [p, urls] of byProblem) if (p !== 'fora_do_sitemap') evs.push(event(project, 'indexacao.problema', { check: p, sample: samplePaths(urls) }, { count: urls.length, kind: p }));
  await recordEvents(admin, evs);
  const checkedIds = new Set(results.map((r) => r.row.id));
  return ok({
    checked: results.length, failed, problems: Object.fromEntries([...byProblem].map(([k, v]) => [k, { count: v.length, text: PROBLEM_TEXT[k], sample: v.slice(0, 5) }])),
    remaining_unchecked: all.rows.filter((r) => !r.last_checked_at && !checkedIds.has(r.id)).length, soft404_probes: probeCount, soft404_probes_skipped: probesSkipped, checked_at: now,
  });
}

// ------------------------------------------------------------------------------------------------------------ google_inspect (somente leitura)
const NO_GOOGLE = 'O Google (Search Console) não está conectado neste projeto. Nada foi consultado. Conecte em NEXUS · Motores & APIs.';

async function googleUsed24h(admin: Admin, projectId: string, nowMs: number): Promise<number> {
  const since = new Date(nowMs - WINDOW_24H).toISOString();
  const r = await admin.from('index_submissions').select('urls_count').eq('project_id', projectId).eq('engine', 'google').gte('created_at', since);
  if (r.error) throw r.error;
  return ((r.data || []) as Array<{ urls_count: number }>).reduce((n, x) => n + (Number(x.urls_count) || 0), 0);
}

async function googleInspectAction(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  if (!ctx.deps.resolveGoogle) return ok({ connected: false, checked: 0, message: NO_GOOGLE });
  let link: GoogleLink | null;
  try { link = await ctx.deps.resolveGoogle(project.organization_id, project.id); } catch { return fail(502, 'google_connection_unusable', { message: 'A conexão com o Google existe, mas não pôde ser usada agora. Reconecte o Google em NEXUS · Motores & APIs.' }); }
  if (!link) return ok({ connected: false, checked: 0, message: NO_GOOGLE });
  if (!link.property) return fail(422, 'google_property_required', { message: 'A conexão do Google não tem uma propriedade do Search Console escolhida. Escolha a propriedade na conexão.' });
  const used = await googleUsed24h(admin, project.id, ctx.deps.now());
  const remaining = GOOGLE_INSPECT_DAILY_LIMIT - used;
  if (remaining <= 0) return fail(429, 'google_quota_reached', { message: `O limite diário de consultas ao Google (${GOOGLE_INSPECT_DAILY_LIMIT.toLocaleString('pt-BR')} por site, cota catalogada) foi atingido. Tente de novo amanhã.`, used_24h: used, limit: GOOGLE_INSPECT_DAILY_LIMIT });
  const all = await loadUrls(admin, project.id);
  const sm = await loadStatuses(admin, project.id);
  let pick: UrlRow[];
  const ids = ctx.body.urlIds;
  if (ids !== undefined) {
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_GOOGLE_PER_CALL || ids.some((i) => !isUuid(i))) return fail(422, 'ids_invalid', { message: 'Seleção de URLs inválida (de 1 a 100).' });
    const want = new Set(ids as string[]);
    pick = all.rows.filter((r) => want.has(r.id));
  } else {
    // prioridade: o plano (impressões, taxonomia, artigos novos), só quem ainda não foi consultado ou foi há mais de 7 dias
    const nodes = new Set(all.rows.filter((r) => r.taxonomy_node_id).map((r) => r.id));
    const stale = ctx.deps.now() - 7 * WINDOW_24H;
    const eligible = all.rows.filter((r) => { const g = sm.get(r.id)?.get('google'); return !g || Date.parse(g.checked_at) < stale; });
    const planned = buildPlan(eligible.map((row) => ({ row, google: 'desconhecido' as IndexState, bingOrNowSent: false, nodeApproved: nodes.has(row.id), nowMs: ctx.deps.now() })), 500).queue;
    const order = new Map(planned.map((p, i) => [p.url_id, i] as const));
    pick = eligible.filter((r) => order.has(r.id)).sort((a, b) => (order.get(a.id) as number) - (order.get(b.id) as number));
  }
  pick = pick.slice(0, Math.min(clampInt(ctx.body.limit, 50, 1, MAX_GOOGLE_PER_CALL), remaining));
  const limiter = makeLimiter(ctx.deps, Math.ceil(60_000 / GOOGLE_INSPECT_PER_MINUTE) + 20);
  // idioma das mensagens do Google (ex.: pt-BR, en-US, es-419); a tela manda o idioma dela, o padrão é neutro
  const languageCode = typeof ctx.body.languageCode === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(ctx.body.languageCode) ? ctx.body.languageCode : 'en-US';
  const now = nowIso(ctx);
  const out: Array<{ url_id: string; engine: Engine; state: IndexState; detail: Record<string, unknown>; checked_at: string }> = [];
  let calls = 0, stopped: string | null = null;
  await mapLimit(pick, 3, async (r) => {
    if (stopped) return;
    if (!propertyCovers(link!.property as string, r.url)) { out.push({ url_id: r.id, engine: 'google', state: 'fora_do_escopo', detail: { property_checked: true }, checked_at: now }); return; }
    await limiter('google');
    calls++;
    const res = await googleInspect(ctx.deps.fetchFn, link!.secret, link!.property as string, r.url, ctx.deps.now, languageCode);
    if (res.ok === true) { out.push({ url_id: r.id, engine: 'google', state: res.result.state, detail: res.result.detail, checked_at: now }); return; }
    if (res.error === 'gsc_quota' || res.error === 'gsc_forbidden' || res.error === 'gsc_auth_failed' || res.error === 'gsc_credential_invalid') { stopped = res.error; return; }
    out.push({ url_id: r.id, engine: 'google', state: 'erro', detail: { error: res.error, status: res.status }, checked_at: now });
  });
  if (out.length) await upsertStatus(admin, project, out);
  if (calls > 0) await addSubmission(admin, ctx, project, { engine: 'google', host: null, urls: calls, status: stopped ? 'erro' : 'aceita', response: { kind: 'consulta', checked: out.length, stopped } });
  const tally = (s: IndexState) => out.filter((x) => x.state === s).length;
  const coverage: Record<string, number> = {};
  for (const x of out) if (x.state === 'nao_indexada') { const k = String(x.detail.coverage_state || 'sem motivo informado'); coverage[k] = (coverage[k] || 0) + 1; }
  if (out.length) await recordEvents(admin, [event(project, 'indexacao.google_consultado', { property: link.property }, { count: out.length, indexed: tally('indexada'), not_indexed: tally('nao_indexada'), outside_scope: tally('fora_do_escopo'), errors: tally('erro'), by_coverage: coverage })]);
  const message = stopped === 'gsc_quota' ? 'O Google pediu para parar (cota). Tente mais tarde.' : stopped ? 'O Google recusou a credencial. Reconecte o Google em NEXUS · Motores & APIs.' : null;
  return ok({
    connected: true, property: link.property, checked: out.length, indexed: tally('indexada'), not_indexed: tally('nao_indexada'), outside_scope: tally('fora_do_escopo'), errors: tally('erro'), by_coverage: coverage,
    stopped, message, quota: { used_24h: used + calls, limit: GOOGLE_INSPECT_DAILY_LIMIT, per_minute: GOOGLE_INSPECT_PER_MINUTE, verified: false, note: 'Cota catalogada em 20/11/2026 (documentação do Google); não confirmada por chamada real.' },
    notice: 'Somente leitura: a API do Google não permite pedir indexação de páginas comuns.',
  });
}

// ------------------------------------------------------------------------------------------------------------ IndexNow
interface KeyRow { host: string; key: string; location: string }
async function keysFor(admin: Admin, project: ProjectBase): Promise<Map<string, KeyRow>> {
  const out = new Map<string, KeyRow>();
  const mine = await admin.from('index_keys').select('host,key_value,key_location').eq('project_id', project.id);
  if (!mine.error) for (const k of (mine.data || []) as Array<{ host: string; key_value: string; key_location: string | null }>) out.set(k.host.toLowerCase(), { host: k.host.toLowerCase(), key: k.key_value, location: k.key_location || defaultKeyLocation(k.host, k.key_value) });
  // configuração antiga (indexnow_config, usada pela função indexnow-notify): só leitura e só quando o host é do projeto
  const legacy = await admin.from('indexnow_config').select('host,api_key,key_location,active').eq('active', true);
  if (!legacy.error) for (const k of (legacy.data || []) as Array<{ host: string; api_key: string; key_location: string }>) {
    const h = String(k.host || '').toLowerCase();
    if (h && !out.has(h) && INDEXNOW_KEY_RE.test(String(k.api_key || '')) && belongsToProject(h, projectHosts(project))) out.set(h, { host: h, key: k.api_key, location: k.key_location || defaultKeyLocation(h, k.api_key) });
  }
  return out;
}
const HOW_TO_KEY = (host: string) => `Para usar o IndexNow em ${host}: (1) gere uma chave (8 a 128 letras, números ou hífen; use "Gerar chave" aqui); (2) publique em https://${host}/<chave>.txt um arquivo de texto contendo só a chave — no WordPress, os plugins IndexNow, Rank Math e Yoast fazem isso sozinhos; em site estático, suba o arquivo na pasta pública; (3) cadastre a chave aqui. Sem o arquivo no ar, o envio não é feito.`;

async function verifyKeyFile(c: Crawler, k: KeyRow): Promise<{ ok: boolean; status: number | null }> {
  const g = await politeGet(c, k.location, { maxBytes: 4096, timeoutMs: 8000, accept: 'text/plain,*/*;q=0.5', checkRobots: false });
  if (!g.ok) return { ok: false, status: null };
  return { ok: g.status === 200 && !/html/i.test(g.headers.get('content-type') || '') && keyFileMatches(g.text, k.key), status: g.status };
}

function candidatesFor(rows: UrlRow[], sm: StatusMap, engine: Engine, ctx: IndexationCtx): ReturnType<typeof selectUnsent> & { byHost: Map<string, UrlRow[]> } {
  const host = typeof ctx.body.host === 'string' ? ctx.body.host.toLowerCase() : '';
  const only = Array.isArray(ctx.body.urlIds) ? new Set((ctx.body.urlIds as unknown[]).filter(isUuid)) : null;
  const pool = rows.filter((r) => (!host || r.host === host) && (!only || only.has(r.id)));
  const sentAt = new Map<string, string>();
  for (const r of pool) { const s = sm.get(r.id)?.get(engine); if (s?.state === 'enviada') sentAt.set(r.id, s.checked_at); }
  const sel = selectUnsent(pool.map((r) => ({ id: r.id, url: r.url, host: r.host, changed_at: r.changed_at, problems: urlProblems(r) })), sentAt);
  const byId = new Map(pool.map((r) => [r.id, r] as const));
  const byHost = new Map<string, UrlRow[]>();
  for (const s of sel.send) (byHost.get(s.host) || byHost.set(s.host, []).get(s.host)!).push(byId.get(s.id) as UrlRow);
  return { ...sel, byHost };
}

async function submitIndexNowAction(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const all = await loadUrls(admin, project.id);
  const sm = await loadStatuses(admin, project.id);
  const cand = candidatesFor(all.rows, sm, 'indexnow', ctx);
  const keys = await keysFor(admin, project);
  const c = crawlerFor(ctx, project);
  const now = nowIso(ctx);
  const hostsOut: Array<Record<string, unknown>> = [];
  let sentTotal = 0, budget = MAX_INDEXNOW_PER_CALL;
  const evs: ProjectEventInput[] = [];
  for (const [host, rows] of cand.byHost) {
    const key = keys.get(host);
    if (!key) { hostsOut.push({ host, sent: 0, pending: rows.length, reason: 'sem_chave', message: `Não há chave do IndexNow cadastrada para ${host}.`, how_to: HOW_TO_KEY(host) }); continue; }
    const file = await verifyKeyFile(c, key);
    if (!file.ok) { hostsOut.push({ host, sent: 0, pending: rows.length, reason: 'arquivo_da_chave_ausente', http_status: file.status, message: `O arquivo da chave não está no ar em ${key.location} (ou não contém a chave). Nada foi enviado.`, how_to: HOW_TO_KEY(host) }); continue; }
    const take = rows.slice(0, budget);
    let sent = 0; let lastStatus: string | null = null; let lastMessage = '';
    for (const part of chunkList(take, INDEXNOW_MAX_URLS)) {
      const res = await submitIndexNow(ctx.deps.fetchFn, { host, key: key.key, keyLocation: key.location, urlList: part.map((r) => r.url) });
      lastStatus = res.state; lastMessage = res.message;
      await addSubmission(admin, ctx, project, { engine: 'indexnow', host, urls: part.length, status: res.state, response: { http_status: res.status, message: res.message } });
      if (res.ok) {
        sent += part.length;
        await upsertStatus(admin, project, part.map((r) => ({ url_id: r.id, engine: 'indexnow' as Engine, state: 'enviada' as IndexState, detail: { http_status: res.status }, checked_at: now })));
      } else break;
    }
    budget -= take.length; sentTotal += sent;
    hostsOut.push({ host, sent, pending: rows.length - sent, reason: sent === take.length ? (rows.length > take.length ? 'limite_da_chamada' : null) : lastStatus, message: lastMessage });
    if (sent > 0) evs.push(event(project, 'indexacao.enviada', { engine: 'indexnow', host, sample: samplePaths(take.map((r) => r.url)) }, { count: sent, engine: 'indexnow' }));
  }
  await recordEvents(admin, evs);
  return ok({
    sent: sentTotal, hosts: hostsOut, skipped_unchanged: cand.skipped_unchanged, skipped_problem: cand.skipped_problem, batch_limit: INDEXNOW_MAX_URLS,
    notice: 'IndexNow avisa Bing, Yandex, Seznam, Naver e outros. NÃO avisa o Google. "Recebido" não significa "indexado".',
  });
}

async function indexnowKeySave(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const ph = projectHosts(project);
  const host = String(ctx.body.host || ph.primary || '').toLowerCase();
  if (!host || !belongsToProject(host, ph)) return fail(422, 'host_not_in_project', { message: 'Esse endereço não pertence ao projeto.' });
  if (ctx.body.generate === true) {
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    const key = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return ok({ host, key, file_name: `${key}.txt`, file_content: key, file_url: defaultKeyLocation(host, key), how_to: HOW_TO_KEY(host), saved: false });
  }
  const key = String(ctx.body.key || '').trim();
  if (!INDEXNOW_KEY_RE.test(key)) return fail(422, 'key_invalid', { message: 'A chave precisa ter de 8 a 128 caracteres: letras, números ou hífen.' });
  const row: KeyRow = { host, key, location: defaultKeyLocation(host, key) };
  const file = await verifyKeyFile(crawlerFor(ctx, project), row);
  if (!file.ok) return fail(422, 'key_file_not_found', { message: `O arquivo ${row.location} não está no ar com a chave dentro. Publique-o e tente de novo.`, how_to: HOW_TO_KEY(host) });
  const now = nowIso(ctx);
  const r = await admin.from('index_keys').upsert({ organization_id: project.organization_id, project_id: project.id, host, key_value: key, key_location: row.location, verified_at: now, created_by: ctx.userId }, { onConflict: 'project_id,host' });
  if (r.error) throw r.error;
  await recordEvents(admin, [event(project, 'indexacao.chave_indexnow', { host }, {})]);
  return ok({ host, saved: true, verified_at: now });
}

// ------------------------------------------------------------------------------------------------------------ Bing Webmaster
async function bingSubmit(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const apiKey = ctx.deps.resolveBingKey ? await ctx.deps.resolveBingKey(project.organization_id).catch(() => null) : null;
  if (!apiKey) return ok({ connected: false, sent: 0, message: 'O Bing Webmaster não está conectado com uma chave de API nesta organização. Nada foi enviado. (A conexão OAuth do Bing é só de leitura e não envia URLs.)' });
  const all = await loadUrls(admin, project.id);
  const sm = await loadStatuses(admin, project.id);
  const cand = candidatesFor(all.rows, sm, 'bing', ctx);
  const now = nowIso(ctx);
  const hostsOut: Array<Record<string, unknown>> = [];
  const evs: ProjectEventInput[] = [];
  let sentTotal = 0;
  for (const [host, rows] of cand.byHost) {
    const site = await bingSiteFor(ctx.deps.fetchFn, apiKey, host);
    if (site.ok === false) { hostsOut.push({ host, sent: 0, pending: rows.length, reason: site.error, message: site.error === 'bing_site_not_found' ? `${host} não está cadastrado e verificado no Bing Webmaster Tools desta chave.` : 'O Bing não respondeu ou recusou a chave.' }); continue; }
    const q = await bingQuota(ctx.deps.fetchFn, apiKey, site.siteUrl);
    const daily = q.ok ? q.quota.daily : null;
    if (q.ok && daily === 0) { hostsOut.push({ host, sent: 0, pending: rows.length, reason: 'cota_diaria_zerada', quota: q.quota, message: 'A cota diária de envio do Bing acabou. Tente amanhã.' }); continue; }
    const room = daily === null ? BING_BATCH_MAX : daily;
    const take = rows.slice(0, room);
    let sent = 0; let msg = '';
    for (const part of chunkList(take, BING_BATCH_MAX)) {
      const res = await bingSubmitBatch(ctx.deps.fetchFn, apiKey, site.siteUrl, part.map((r) => r.url));
      await addSubmission(admin, ctx, project, { engine: 'bing', host, urls: part.length, status: res.ok ? 'aceita' : res.error === 'bing_invalid_request' || res.error === 'bing_unauthorized' ? 'recusada' : 'erro', response: { http_status: res.status, error: res.error ?? null, quota: q.ok ? q.quota : null } });
      if (!res.ok) { msg = res.error === 'bing_unauthorized' ? 'O Bing recusou a chave.' : 'O Bing recusou ou não respondeu ao lote.'; break; }
      sent += part.length;
      await upsertStatus(admin, project, part.map((r) => ({ url_id: r.id, engine: 'bing' as Engine, state: 'enviada' as IndexState, detail: { http_status: res.status }, checked_at: now })));
    }
    sentTotal += sent;
    hostsOut.push({ host, sent, pending: rows.length - sent, quota: q.ok ? q.quota : null, quota_read: q.ok, message: msg });
    if (sent > 0) evs.push(event(project, 'indexacao.enviada', { engine: 'bing', host, sample: samplePaths(take.map((r) => r.url)) }, { count: sent, engine: 'bing' }));
  }
  await recordEvents(admin, evs);
  return ok({ connected: true, sent: sentTotal, hosts: hostsOut, skipped_unchanged: cand.skipped_unchanged, skipped_problem: cand.skipped_problem, notice: '"Aceito pelo Bing" não significa "indexado". A cota diária varia por site e é lida pela API quando ela responde.' });
}

// ------------------------------------------------------------------------------------------------------------ hygiene
async function hostEvidence(c: Crawler, host: string, primary: boolean, samples: string[], token: string): Promise<HostEvidence> {
  const rb = await robotsFor(c, host);
  const llmsR = await politeGet(c, `https://${host}/llms.txt`, { maxBytes: 64 * 1024, timeoutMs: 8000, accept: 'text/plain,text/markdown,*/*;q=0.5', checkRobots: false });
  const llms = llmsR.ok ? llmsR.status === 200 && !/html/i.test(llmsR.headers.get('content-type') || '') && llmsR.text.trim().length > 20 : null;
  const home = await politeGet(c, `https://${host}/`, { maxBytes: 400 * 1024, checkRobots: false });
  let https: HostEvidence['https'] = { state: 'nao_testado' };
  let hreflang: HostEvidence['hreflang'] = null;
  if (home.ok === false) https = { state: home.error === 'certificado_invalido' ? 'certificado_invalido' : 'erro', error: home.error };
  else {
    https = { state: 'ok' };
    if (home.status === 200 && home.text) {
      const sig = pageSignals(home.text, home.headers, home.finalUrl);
      if (sig.hreflang.length) hreflang = await hreflangEvidence(c, home.finalUrl, sig.hreflang);
    }
  }
  const httpProbes: HostEvidence['httpProbes'] = [];
  if (https.state === 'ok' || https.state === 'nao_testado') {
    for (const path of ['/', ...samples].slice(0, 4)) {
      const url = `http://${host}${path}`;
      const g = await politeGet(c, url, { maxBytes: 1, checkRobots: false });
      if (!g.ok || !g.hops[0]) { httpProbes.push({ url, status: null, location: null, ok: false }); continue; }
      const h0 = g.hops[0];
      const loc = h0.location ? new URL(h0.location, h0.url).href : null;
      httpProbes.push({ url, status: h0.status, location: loc, ok: [301, 302, 307, 308].includes(h0.status) && !!loc && /^https:\/\//i.test(loc) });
    }
  }
  let rootSoft: HostEvidence['rootSoft404'] = null;
  if (https.state === 'ok') { try { rootSoft = (await probeSoft404(c, `https://${host}/`, token)).template; } catch { rootSoft = null; } }
  return { host, primary, robots: rb.state === 'ok' ? { state: 'ok', rules: rb.rules } : rb.state === 'ausente' ? { state: 'ausente' } : { state: 'erro', error: rb.error }, llms, https, httpProbes, rootSoft404: rootSoft, hreflang };
}

/** Pastas de idioma já vistas no inventário (/en/, /es-mx/...): cada uma pode ter o próprio sitemap. */
const langFolders = (rows: UrlRow[]): string[] => [...new Set(rows.map((r) => { const seg = r.path.split('/').filter(Boolean)[0]; return seg && languageOfUrl(`https://x.example/${seg}/`) ? seg : ''; }).filter(Boolean))].slice(0, 12);

/** Lê o hreflang da página: auto-referência, x-default, códigos válidos, idiomas repetidos e se até 5 alternativas do projeto apontam de volta. */
async function hreflangEvidence(c: Crawler, pageUrl: string, links: Array<{ lang: string; href: string }>): Promise<HreflangEvidence> {
  const self = normalizeUrl(pageUrl)?.key;
  const ph = c.hosts;
  const byLang = new Map<string, Set<string>>();
  for (const l of links) (byLang.get(l.lang) || byLang.set(l.lang, new Set()).get(l.lang)!).add(normalizeUrl(l.href)?.key || l.href);
  const alternates = links.filter((l) => l.lang !== 'x-default').map((l) => ({ lang: l.lang, n: normalizeUrl(l.href) })).filter((a): a is { lang: string; n: NonNullable<ReturnType<typeof normalizeUrl>> } => !!a.n);
  const own = alternates.filter((a) => belongsToProject(a.n.host, ph));
  const foreign = alternates.filter((a) => !belongsToProject(a.n.host, ph)).map((a) => a.n.url);
  let missing: string[] | null = [];
  let conferred = 0, unreachable = 0;
  for (const a of own.filter((x) => x.n.key !== self).slice(0, 5)) {
    const g = await politeGet(c, a.n.url, { maxBytes: 300 * 1024 });
    if (!g.ok || g.status !== 200) { unreachable++; continue; }
    conferred++;
    const back = pageSignals(g.text, g.headers, g.finalUrl).hreflang.some((h) => normalizeUrl(h.href)?.key === self);
    if (!back) missing.push(a.n.url);
  }
  if (conferred === 0 && unreachable > 0) missing = null; // não deu para conferir: fica desconhecido (null), nunca "tudo certo"

  return {
    present: true, selfRef: alternates.some((a) => a.n.key === self), xDefault: links.some((l) => l.lang === 'x-default'), languages: [...new Set(links.map((l) => l.lang))],
    invalidCodes: [...new Set(links.map((l) => l.lang).filter((l) => !isValidHreflang(l)))], duplicateLangs: [...byLang].filter(([, v]) => v.size > 1).map(([k]) => k), missingReturn: missing, foreignAlternates: foreign,
  };
}

async function hygiene(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const ph = projectHosts(project);
  if (!ph.primary) return fail(422, 'project_domain_required', { message: 'Cadastre o domínio do projeto antes de verificar a higiene.' });
  const started = ctx.deps.now();
  const c = crawlerFor(ctx, project);
  const inv = await loadUrls(admin, project.id);
  const hints = await siteMapHints(admin, project);
  const hostList = [...new Set([ph.primary, ...hints.hosts, ...inv.rows.map((r) => r.host)].filter((h) => belongsToProject(h, ph)))].slice(0, MAX_HOSTS);
  const token = (ctx.deps.now() % 1_000_000).toString(36);
  const samplesOf = (host: string) => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const r of inv.rows.filter((x) => x.host === host).sort((a, b) => b.gsc_impressions - a.gsc_impressions)) { const s = sectionOfPath(r.path); if (s === '(raiz)' || seen.has(s)) continue; seen.add(s); out.push(r.path.split('?')[0]); if (out.length >= 3) break; }
    return out;
  };
  const hosts = await mapLimit(hostList, 4, (h) => hostEvidence(c, h, h === ph.primary, samplesOf(h), token));
  const starts = await sitemapStarts(c, hostList, hints.starts, langFolders(inv.rows));
  const walk = await walkSitemaps(c, { startUrls: starts.starts, optional: starts.optional, budgetMs: ctx.deps.budgetMs ?? 100_000, startedAt: started });
  const keysUnique = new Set(walk.entries.map((e) => e.key));
  const withP = inv.rows.map((r) => ({ r, p: urlProblems(r) }));
  const pick = (k: ProblemKey) => withP.filter((x) => x.p.includes(k)).map((x) => x.r.url);
  const evidence: HygieneEvidence = {
    hosts,
    sitemaps: { declared: walk.declared, files: walk.files, totalEntries: walk.totalEntries, uniqueEntries: keysUnique.size },
    inventory: {
      languages: [...new Set(inv.rows.map((r) => r.lang).filter((l): l is string => !!l))].slice(0, 20), total: inv.rows.length, checked: inv.rows.filter((r) => r.last_checked_at).length, outsideSitemap: pick('fora_do_sitemap'), soft404: pick('soft404'), noindex: pick('noindex'),
      canonicalDiverges: pick('canonical_diferente'), httpErrors: pick('erro_http'), sitemapRedirects: withP.filter((x) => x.r.in_sitemap && x.p.includes('redirecionada')).map((x) => x.r.url),
    },
  };
  const items = evaluateHygiene(evidence);
  const prev = await admin.from('index_hygiene').select('check_key,ok').eq('project_id', project.id);
  if (prev.error) throw prev.error;
  const wasOk = new Map(((prev.data || []) as Array<{ check_key: string; ok: boolean }>).map((p) => [p.check_key, p.ok] as const));
  const now = nowIso(ctx);
  const r = await admin.from('index_hygiene').upsert(items.map((i) => ({ organization_id: project.organization_id, project_id: project.id, check_key: i.key, ok: i.ok || !i.applicable, severity: i.severity, detail: { label: i.label, text: i.detail, evidence: i.evidence, fix: i.fix, applicable: i.applicable }, checked_at: now })), { onConflict: 'project_id,check_key' });
  if (r.error) throw r.error;
  const failing = items.filter((i) => !i.ok && i.applicable);
  const newly = failing.filter((i) => wasOk.get(i.key) !== false);
  const bySeverity = { alta: failing.filter((i) => i.severity === 'alta').length, media: failing.filter((i) => i.severity === 'media').length, baixa: failing.filter((i) => i.severity === 'baixa').length };
  const evs: ProjectEventInput[] = [event(project, 'indexacao.higiene', { hosts: hostList }, { count: failing.length, newly: newly.length, ...bySeverity })];
  for (const i of newly.filter((x) => x.severity === 'alta')) evs.push(event(project, 'indexacao.problema', { check: i.key, label: i.label }, { severity: i.severity, detail: i.detail }));
  await recordEvents(admin, evs);
  return ok({
    items: [...items].sort((a, b) => Number(a.ok || !a.applicable) - Number(b.ok || !b.applicable) || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    failing: failing.length, by_severity: bySeverity, newly_failing: newly.length, hosts: hostList, sitemap_files: walk.files.length, truncated: walk.truncated, checked_at: now,
  });
}

// ------------------------------------------------------------------------------------------------------------ plan
async function plan(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const all = await loadUrls(admin, project.id);
  if (!all.rows.length) return ok({ queue: [], total_queue: 0, batches: { google_inspect: { urls: 0 }, indexnow: [], bing: [] }, excluded: { indexed: 0, blocked: 0 }, empty: true, message: 'O inventário está vazio. Atualize o inventário para montar a fila.' });
  const sm = await loadStatuses(admin, project.id);
  const now = ctx.deps.now();
  const inputs: PlanInput[] = all.rows.map((row) => ({ row, google: googleOf(sm, row.id), bingOrNowSent: [...(sm.get(row.id)?.entries() || [])].some(([e, s]) => e !== 'google' && s.state === 'enviada'), nodeApproved: !!row.taxonomy_node_id, nowMs: now }));
  const limit = clampInt(ctx.body.limit, 100, 1, 500);
  const { queue, excluded } = buildPlan(inputs, 100_000);
  const rowById = new Map(all.rows.map((r) => [r.id, r] as const));
  const googleBatch = queue.filter((q) => q.google === 'desconhecido').slice(0, MAX_GOOGLE_PER_CALL);
  const inQueue = new Set(queue.map((q) => q.url_id));
  const pool = all.rows.filter((r) => inQueue.has(r.id));
  const nowCand = candidatesFor(pool, sm, 'indexnow', { ...ctx, body: {} });
  const bingCand = candidatesFor(pool, sm, 'bing', { ...ctx, body: {} });
  const batchesFor = (m: Map<string, UrlRow[]>, size: number) => [...m].flatMap(([host, rows]) => chunkList(rows, size).map((part) => ({ host, urls: part.length, sample: samplePaths(part.map((r) => r.url), 3) })));
  const blocking: Record<string, number> = {};
  for (const r of all.rows) if (googleOf(sm, r.id) !== 'indexada') for (const p of urlProblems(r)) if (p !== 'fora_do_sitemap') blocking[p] = (blocking[p] || 0) + 1;
  return ok({
    queue: queue.slice(0, limit).map((q) => ({ ...q, host: rowById.get(q.url_id)?.host })), total_queue: queue.length, excluded,
    batches: { google_inspect: { urls: googleBatch.length, url_ids: googleBatch.map((q) => q.url_id), note: 'Consulta de estado (somente leitura).' }, indexnow: batchesFor(nowCand.byHost, INDEXNOW_MAX_URLS), bing: batchesFor(bingCand.byHost, BING_BATCH_MAX).slice(0, 20) },
    blocking: Object.fromEntries(Object.entries(blocking).map(([k, v]) => [k, { count: v, text: PROBLEM_TEXT[k as ProblemKey] }])),
    notes: ['A fila ignora URLs com problema (noindex, erro, redirecionamento, soft-404, canonical em outra página): corrija-as antes de enviar.', 'O Google não aceita pedido de indexação de páginas comuns; o que ajuda é sitemap, links internos e conteúdo útil.'],
  });
}

// ------------------------------------------------------------------------------------------------------------ list
async function list(admin: Admin, ctx: IndexationCtx, project: ProjectBase): Promise<Reply> {
  const all = await loadUrls(admin, project.id);
  const sm = await loadStatuses(admin, project.id);
  const f = ctx.body;
  const host = typeof f.host === 'string' ? f.host.toLowerCase() : '';
  const section = typeof f.section === 'string' ? f.section.toLowerCase() : '';
  const state = typeof f.state === 'string' ? f.state : '';
  const problem = typeof f.problem === 'string' ? f.problem : '';
  const q = typeof f.q === 'string' ? f.q.trim().toLowerCase().slice(0, 100) : '';
  const rows = all.rows.map((r) => ({ r, g: googleOf(sm, r.id), p: urlProblems(r), sent: [...(sm.get(r.id)?.entries() || [])].filter(([, s]) => s.state === 'enviada').map(([e]) => e) }))
    .filter((x) => (!host || x.r.host === host) && (!section || sectionOfPath(x.r.path) === section) && (!q || x.r.url.toLowerCase().includes(q))
      && (!state || (state === 'enviada' ? x.sent.length > 0 : x.g === state)) && (!problem || (problem === 'qualquer' ? x.p.length > 0 : x.p.includes(problem as ProblemKey))))
    .sort((a, b) => b.r.gsc_impressions - a.r.gsc_impressions || a.r.url.localeCompare(b.r.url));
  const size = clampInt(f.pageSize, 50, 10, 100);
  const page = Math.max(0, Math.min(clampInt(f.page, 0, 0, 100000), Math.floor(Math.max(0, rows.length - 1) / size)));
  return ok({
    total: rows.length, page, page_size: size,
    rows: rows.slice(page * size, page * size + size).map((x) => ({
      id: x.r.id, url: x.r.url, host: x.r.host, section: sectionOfPath(x.r.path), source: x.r.source, in_sitemap: x.r.in_sitemap, impressions: x.r.gsc_impressions, http_status: x.r.http_status, google: x.g,
      google_detail: (sm.get(x.r.id)?.get('google')?.detail?.coverage_state as string | undefined) ?? null, sent: x.sent, problems: x.p, last_checked_at: x.r.last_checked_at,
    })),
  });
}

// ------------------------------------------------------------------------------------------------------------ overview
async function overview(admin: Admin, ctx: IndexationCtx, project: ProjectBase, role: string): Promise<Reply> {
  const ph = projectHosts(project);
  const all = await loadUrls(admin, project.id);
  const sm = await loadStatuses(admin, project.id);
  const nodes = await loadNodes(admin, project.id);
  const g = googleMap(all.rows, sm);
  const sent = sentSet(all.rows, sm);
  const nodeLabel = new Map(nodes.map((n) => [n.id, n.label] as const));
  const subs = await admin.from('index_submissions').select('id,engine,host,urls_count,status,response,created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(20);
  if (subs.error) throw subs.error;
  const hy = await admin.from('index_hygiene').select('check_key,ok,severity,detail,checked_at').eq('project_id', project.id);
  if (hy.error) throw hy.error;
  const keys = await keysFor(admin, project);
  const oauth = await admin.from('nexus_oauth_connections').select('provider,property_id').eq('project_id', project.id);
  const gscConn = ((oauth.data || []) as Array<{ provider: string; property_id: string | null }>).find((x) => x.provider === 'gsc');
  const bingKey = ctx.deps.resolveBingKey ? await ctx.deps.resolveBingKey(project.organization_id).catch(() => null) : null;
  const used = await googleUsed24h(admin, project.id, ctx.deps.now());

  const withP = all.rows.map((r) => ({ r, p: urlProblems(r) }));
  const totals = {
    urls: all.rows.length, indexed: [...g.values()].filter((s) => s === 'indexada').length, not_indexed: [...g.values()].filter((s) => s === 'nao_indexada').length,
    unknown: [...g.values()].filter((s) => s !== 'indexada' && s !== 'nao_indexada').length, sent: sent.size, with_problems: withP.filter((x) => x.p.length).length,
    in_sitemap: all.rows.filter((r) => r.in_sitemap).length, outside_sitemap: withP.filter((x) => x.p.includes('fora_do_sitemap')).length, never_checked: all.rows.filter((r) => !r.last_checked_at).length,
  };
  const problemsByKind: Record<string, { count: number; text: string }> = {};
  for (const x of withP) for (const p of x.p) problemsByKind[p] = { count: (problemsByKind[p]?.count || 0) + 1, text: PROBLEM_TEXT[p] };
  const hygieneRows = ((hy.data || []) as Array<{ check_key: string; ok: boolean; severity: string; detail: Record<string, unknown>; checked_at: string }>)
    .map((h) => ({ key: h.check_key, ok: h.ok, severity: h.severity, label: String(h.detail?.label || h.check_key), text: String(h.detail?.text || ''), fix: (h.detail?.fix as string | null) ?? null, evidence: h.detail?.evidence ?? {}, applicable: h.detail?.applicable !== false, checked_at: h.checked_at }))
    .sort((a, b) => Number(a.ok) - Number(b.ok) || (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 9) - (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 9));
  const hosts = [...new Set(all.rows.map((r) => r.host))];
  const blockers: Array<{ key: string; text: string; action: string | null }> = [];
  if (!ph.primary) blockers.push({ key: 'sem_dominio', text: 'O projeto não tem domínio cadastrado.', action: 'Cadastre o endereço do site no projeto.' });
  if (!all.rows.length) blockers.push({ key: 'sem_inventario', text: 'Ainda não há inventário de URLs.', action: 'Clique em "Atualizar inventário".' });
  if (!gscConn) blockers.push({ key: 'sem_google', text: 'O Google (Search Console) não está conectado: não dá para consultar o estado das URLs.', action: 'Conecte em NEXUS · Motores & APIs.' });
  const noKey = hosts.filter((h) => !keys.has(h));
  if (hosts.length && noKey.length) blockers.push({ key: 'sem_chave_indexnow', text: `Sem chave do IndexNow em: ${noKey.slice(0, 4).join(', ')}${noKey.length > 4 ? '…' : ''}. Sem ela não há aviso ao Bing e outros.`, action: 'Gere a chave, publique o arquivo no site e cadastre aqui.' });
  for (const h of hygieneRows.filter((x) => !x.ok && x.applicable && x.severity === 'alta')) blockers.push({ key: `higiene:${h.key}`, text: h.text, action: h.fix });
  if (totals.outside_sitemap > 0) blockers.push({ key: 'fora_do_sitemap', text: `${totals.outside_sitemap.toLocaleString('pt-BR')} página(s) conhecida(s) fora de qualquer sitemap.`, action: 'Inclua no sitemap ou marque noindex de propósito.' });
  const lastSynced = all.rows.reduce<string | null>((m, r) => (!m || r.last_seen > m ? r.last_seen : m), null);
  return ok({
    project: { id: project.id, name: project.name, domain: ph.primary }, can_edit: hasRole(role, 'editor'), can_admin: hasRole(role, 'admin'),
    totals, last_synced_at: lastSynced, truncated: all.truncated,
    coverage: {
      by_host: coverageBy(all.rows, g, sent, (r) => ({ key: r.host, label: r.host })).slice(0, 30),
      by_section: coverageBy(all.rows, g, sent, (r) => { const s = sectionOfPath(r.path); return { key: `${r.host}|${s}`, label: `${r.host}${s === '(raiz)' ? '/' : `/${s}`}` }; }).slice(0, 30),
      by_lang: coverageBy(all.rows, g, sent, (r) => (r.lang ? { key: r.lang, label: r.lang } : { key: 'sem_idioma', label: 'Idioma não identificado' })).slice(0, 30),
      by_node: coverageBy(all.rows, g, sent, (r) => (r.taxonomy_node_id && nodeLabel.has(r.taxonomy_node_id) ? { key: r.taxonomy_node_id, label: nodeLabel.get(r.taxonomy_node_id) as string } : { key: 'sem_area', label: 'Sem área da taxonomia' })).slice(0, 30),
    },
    problems: problemsByKind, submissions: subs.data || [], hygiene: hygieneRows, blockers,
    connections: {
      google: { connected: !!gscConn, property: gscConn?.property_id ?? null },
      bing: { connected: !!bingKey },
      indexnow: { hosts: hosts.map((h) => ({ host: h, key_ready: keys.has(h) })) },
    },
    quota: { google: { used_24h: used, limit: GOOGLE_INSPECT_DAILY_LIMIT, per_minute: GOOGLE_INSPECT_PER_MINUTE, verified: false } },
    engines: ENGINE_CATALOG,
    notices: [
      'O Google não permite pedir indexação de páginas comuns por API (a Indexing API é só para vagas e transmissões ao vivo). Aqui o Google é somente consulta.',
      'IndexNow avisa Bing, Yandex, Seznam, Naver e outros; não avisa o Google. "Recebido" ou "aceito" não significa "indexado".',
      'Cotas (Google: 2.000 consultas por dia por site; Bing: lida pela API) vêm da documentação e podem mudar.',
    ],
  });
}
