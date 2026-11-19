/**
 * Sincronização de desempenho de busca (Google Search Console e Bing Webmaster) para
 * `nexus_search_performance`. Idempotente (upsert pela chave única), nunca lança por falha de um
 * provedor (devolve `ok:false` com um código de erro) e nunca registra credenciais.
 */
import { gscQuery, normalizeGscRows, type GscRow } from './nexus-gsc.ts';
import { bingGetPageStats, bingGetQueryStats, bingGetRankAndTrafficStats, bingGetUserSites, type BingOptions } from './nexus-bing.ts';

/** Subconjunto do cliente Supabase (service role) usado aqui: `from(tabela).upsert(linhas, opções)`. */
export type SearchAdmin = { from(table: string): { upsert(rows: unknown[], options: { onConflict: string }): PromiseLike<{ error: { message?: string; code?: string } | null }> } };
export type SyncResult = { source: string; ok: boolean; rows_upserted: number; truncated?: boolean; error?: string; from: string; to: string };

export type SyncOptions = {
  organizationId: string;
  projectId: string;
  source: 'gsc' | 'bing' | 'all';
  days: number;
  fetchFn: typeof fetch;
  resolveSecret: (provider: string) => Promise<string | null>;
  domain: string;
  property?: string;
  /** Opcionais (testes): relógio e espera entre tentativas do Bing. */
  now?: () => number;
  sleep?: BingOptions['sleep'];
};

export const GSC_DIMENSIONS = ['date', 'query', 'page', 'country', 'device'] as const;
export const GSC_PAGE_ROWS = 25_000;
export const GSC_MAX_QUERIES = 5;
export const UPSERT_BATCH = 500;
/** A chave única é um btree (limite ~2700 bytes por entrada): textos muito longos derrubariam o lote inteiro. */
export const MAX_QUERY_LEN = 500;
export const MAX_PAGE_LEN = 1000;
export const UPSERT_CONFLICT = 'project_id,source,day,query,page,country,device';

type PerfRow = { organization_id: string; project_id: string; source: 'gsc' | 'bing'; day: string; query: string; page: string; country: string; device: string; clicks: number; impressions: number; ctr: number; position: number };
type Aggregated = Omit<PerfRow, 'organization_id' | 'project_id' | 'source'>;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const bareDomain = (d: string) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

export function syncWindow(days: number, nowMs: number): { from: string; to: string } {
  const n = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 90) : 28;
  const to = ymd(nowMs);
  return { from: ymd(nowMs - (n - 1) * 86_400_000), to };
}

/** Une linhas com a mesma chave única (necessário: um upsert não pode afetar a mesma linha duas vezes). */
export function dedupeRows(rows: Aggregated[]): Aggregated[] {
  const map = new Map<string, Aggregated & { _pw: number }>();
  for (const r of rows) {
    const k = [r.day, r.query, r.page, r.country, r.device].join('\u0001');
    const cur = map.get(k);
    if (!cur) { map.set(k, { ...r, _pw: r.position * r.impressions }); continue; }
    cur.clicks += r.clicks; cur.impressions += r.impressions; cur._pw += r.position * r.impressions;
    cur.position = cur.impressions > 0 ? cur._pw / cur.impressions : Math.max(cur.position, r.position);
    cur.ctr = cur.impressions > 0 ? cur.clicks / cur.impressions : 0;
  }
  return [...map.values()].map(({ _pw: _unused, ...r }) => r);
}

async function upsertAll(admin: SearchAdmin, source: 'gsc' | 'bing', o: SyncOptions, rows: Aggregated[]): Promise<{ upserted: number; error?: string }> {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch: PerfRow[] = rows.slice(i, i + UPSERT_BATCH).map(r => ({ organization_id: o.organizationId, project_id: o.projectId, source, ...r }));
    try {
      const { error } = await admin.from('nexus_search_performance').upsert(batch, { onConflict: UPSERT_CONFLICT });
      if (error) return { upserted, error: `upsert_failed:${String(error.message || error.code || 'unknown').slice(0, 120)}` };
    } catch (e) {
      return { upserted, error: `upsert_failed:${String((e as Error)?.message || 'unknown').slice(0, 120)}` };
    }
    upserted += batch.length;
  }
  return { upserted };
}

async function syncGsc(admin: SearchAdmin, o: SyncOptions, from: string, to: string): Promise<SyncResult> {
  const fail = (error: string, rows_upserted = 0, truncated?: boolean): SyncResult => ({ source: 'gsc', ok: false, rows_upserted, error, from, to, ...(truncated === undefined ? {} : { truncated }) });
  let secret: string | null;
  try { secret = await o.resolveSecret('gsc'); } catch { return fail('secret_unavailable'); }
  if (!secret) return fail('gsc_not_configured');
  const property = (o.property && o.property.trim()) || `sc-domain:${bareDomain(o.domain)}`;
  if (property === 'sc-domain:') return fail('gsc_property_required');
  const collected: GscRow[] = [];
  let truncated = false;
  for (let q = 0; q < GSC_MAX_QUERIES; q++) {
    const res = await gscQuery(o.fetchFn, secret, property, { startDate: from, endDate: to, dimensions: [...GSC_DIMENSIONS], rowLimit: GSC_PAGE_ROWS, startRow: q * GSC_PAGE_ROWS }, { now: o.now });
    if (!res.ok) return fail(res.error);
    collected.push(...normalizeGscRows(res.rows, [...GSC_DIMENSIONS]));
    if (res.rows.length < GSC_PAGE_ROWS) break;
    if (q === GSC_MAX_QUERIES - 1) truncated = true;
  }
  const up = await upsertAll(admin, 'gsc', o, dedupeRows(collected.map(({ date, ...r }) => ({ day: date, ...r, query: r.query.slice(0, MAX_QUERY_LEN), page: r.page.slice(0, MAX_PAGE_LEN) }))));
  if (up.error) return fail(up.error, up.upserted, truncated);
  return { source: 'gsc', ok: true, rows_upserted: up.upserted, truncated, from, to };
}

async function syncBing(admin: SearchAdmin, o: SyncOptions, from: string, to: string): Promise<SyncResult> {
  const fail = (error: string, rows_upserted = 0): SyncResult => ({ source: 'bing', ok: false, rows_upserted, error, from, to });
  let key: string | null;
  try { key = await o.resolveSecret('bing_webmaster'); } catch { return fail('secret_unavailable'); }
  if (!key) return fail('bing_not_configured');
  const bo: BingOptions = { sleep: o.sleep };
  const sites = await bingGetUserSites(o.fetchFn, key, bo);
  if (!sites.ok) return fail(sites.error);
  const target = bareDomain(o.domain);
  const host = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return bareDomain(u); } };
  const matches = sites.sites.filter(s => host(s.url) === target);
  const site = matches.find(s => s.isVerified) ?? matches[0];
  if (!site) return fail('bing_site_not_found');

  const [queries, pages, traffic] = await Promise.all([
    bingGetQueryStats(o.fetchFn, key, site.url, bo),
    bingGetPageStats(o.fetchFn, key, site.url, bo),
    bingGetRankAndTrafficStats(o.fetchFn, key, site.url, bo),
  ]);
  const inRange = (day: string) => day >= from && day <= to;
  const ctr = (c: number, i: number) => (i > 0 ? c / i : 0);
  const rows: Aggregated[] = [];
  const failed: string[] = [];
  const add = (day: string, query: string, page: string, clicks: number, impressions: number, position: number) => {
    if (inRange(day)) rows.push({ day, query: query.slice(0, MAX_QUERY_LEN), page: page.slice(0, MAX_PAGE_LEN), country: '', device: '', clicks, impressions, ctr: ctr(clicks, impressions), position });
  };
  if (queries.ok) { for (const r of queries.rows) add(r.day, r.key, '', r.clicks, r.impressions, r.position); } else failed.push(`GetQueryStats:${queries.error}`);
  if (pages.ok) { for (const r of pages.rows) add(r.day, '', r.key, r.clicks, r.impressions, r.position); } else failed.push(`GetPageStats:${pages.error}`);
  if (traffic.ok) { for (const r of traffic.rows) add(r.day, '', '', r.clicks, r.impressions, 0); } else failed.push(`GetRankAndTrafficStats:${traffic.error}`);

  if (failed.length === 3) return fail(!queries.ok ? queries.error : 'bing_unreachable');
  const up = await upsertAll(admin, 'bing', o, dedupeRows(rows));
  if (up.error) return fail(up.error, up.upserted);
  if (failed.length) return fail(`bing_partial:${failed.join(',')}`, up.upserted);
  return { source: 'bing', ok: true, rows_upserted: up.upserted, truncated: false, from, to };
}

/** Sincroniza GSC e/ou Bing. Nunca lança: cada fonte devolve o próprio resultado. */
export async function syncSearchPerformance(admin: SearchAdmin, opts: SyncOptions): Promise<{ results: SyncResult[] }> {
  const { from, to } = syncWindow(opts.days, (opts.now ?? Date.now)());
  const sources: Array<'gsc' | 'bing'> = opts.source === 'all' ? ['gsc', 'bing'] : [opts.source];
  const results: SyncResult[] = [];
  for (const source of sources) {
    try {
      results.push(source === 'gsc' ? await syncGsc(admin, opts, from, to) : await syncBing(admin, opts, from, to));
    } catch {
      results.push({ source, ok: false, rows_upserted: 0, error: `${source}_unexpected_error`, from, to });
    }
  }
  return { results };
}
