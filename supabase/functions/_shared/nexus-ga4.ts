/**
 * Google Analytics 4 (Data API v1beta) por conta de serviço, sem dependências externas (13/11/2026).
 *
 * - reutiliza o JWT RS256 / troca de token de `nexus-gsc.ts` (`getGoogleAccessToken`) com o escopo `analytics.readonly`;
 * - só leitura e gratuito: `runReport` e `getMetadata`; nenhuma chamada paga;
 * - URLs montadas pelo servidor (a propriedade é validada: somente dígitos, 5 a 15); nunca URL vinda do cliente;
 * - o JSON da conta de serviço, a chave privada e os tokens nunca são devolvidos nem registrados;
 * - `syncGa4` é idempotente (upsert pela chave única) e nunca lança.
 *
 * Duas coleções por sincronização (decisão registrada em docs/NEXUS_MANAGEMENT_PLANE.md):
 *  - SITE (sem `pagePath`): linhas com `page=''`; são a base dos totais, da série diária, dos canais e das fontes de IA.
 *    No GA4 uma sessão que passa por 3 páginas aparece em 3 linhas quando `pagePath` é dimensão; somar essas linhas
 *    contaria a mesma sessão várias vezes. Por isso os totais NÃO saem das linhas por página;
 *  - PÁGINA (com `pagePath`): linhas com `page<>''`; alimentam o ranking de páginas e o desempenho por área.
 */
import { getGoogleAccessToken, googleErrorDetail, readJson, type GscFailure } from './nexus-gsc.ts';

export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GA4_API = 'https://analyticsdata.googleapis.com/v1beta';
export const GA4_HOST = 'analyticsdata.googleapis.com';
const REQUEST_TIMEOUT_MS = 30_000;

export const GA4_PAGE_DIMENSIONS = ['date', 'pagePath', 'sessionDefaultChannelGroup', 'sessionSource'] as const;
export const GA4_SITE_DIMENSIONS = ['date', 'sessionDefaultChannelGroup', 'sessionSource'] as const;
/** Nomes vigentes da API (conferidos na página de esquema da Data API): `keyEvents` substitui o antigo `conversions`. */
export const GA4_METRICS = ['sessions', 'engagedSessions', 'screenPageViews', 'totalUsers', 'userEngagementDuration', 'keyEvents'] as const;
export const GA4_PAGE_ROWS = 100_000;
export const GA4_MAX_PAGES = 5;
export const GA4_UPSERT_BATCH = 500;
export const GA4_UPSERT_CONFLICT = 'project_id,day,page,channel,source';
export const MAX_PATH_LEN = 1000;
export const MAX_SOURCE_LEN = 200;
export const MAX_CHANNEL_LEN = 200;
// A chave única é um btree (~2700 bytes por entrada): além do limite de caracteres, limita-se os bytes UTF-8.
const MAX_PATH_BYTES = 1200;
const MAX_SOURCE_BYTES = 400;
const MAX_CHANNEL_BYTES = 200;

export type Ga4Failure = GscFailure;
export type Ga4Options = { now?: () => number };

// ---------------------------------------------------------------------------
// Propriedade e fontes de IA
// ---------------------------------------------------------------------------
export const isValidPropertyId = (v: unknown): v is string => typeof v === 'string' && /^\d{5,15}$/.test(v);

/** Hosts/nomes de `sessionSource` que correspondem a assistentes de IA. Comparação por igualdade ou sufixo de domínio. */
export const AI_SOURCE_HOSTS: readonly string[] = [
  'chatgpt.com', 'chat.openai.com', 'openai.com', 'chatgpt',
  'perplexity.ai', 'perplexity',
  'gemini.google.com', 'bard.google.com',
  'copilot.microsoft.com', 'copilot.com',
  'claude.ai', 'you.com', 'phind.com', 'poe.com', 'meta.ai',
  'chat.deepseek.com', 'deepseek.com', 'grok.com', 'kagi.com', 'andisearch.com', 'iask.ai', 'duckduckgo.com/chat',
];

const hostLike = (source: string): string => source.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');

/** true quando a fonte de sessão é um assistente de IA conhecido. */
export function isAiSource(source: unknown): boolean {
  if (typeof source !== 'string' || !source.trim()) return false;
  const host = hostLike(source);
  if (!host) return false;
  return AI_SOURCE_HOSTS.some((h) => !h.includes('/') && (host === h || host.endsWith(`.${h}`)));
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------
/** Corta por caracteres e depois por bytes UTF-8 (sem partir um caractere ao meio). */
function clipText(value: string, maxChars: number, maxBytes: number): string {
  let out = value.slice(0, maxChars);
  const enc = new TextEncoder();
  while (out.length > 0 && enc.encode(out).length > maxBytes) out = out.slice(0, Math.max(0, out.length - Math.ceil((enc.encode(out).length - maxBytes) / 3)));
  // Não deixa um par substituto (emoji) partido ao meio: o Postgres rejeitaria o texto e derrubaria o lote.
  if (out.length > 0 && /[\ud800-\udbff]$/.test(out)) out = out.slice(0, -1);
  return out;
}

/** Caminho da página: sem query/fragmento, máximo 1000 caracteres, `/` quando vazio. */
export function normalizePagePath(raw: unknown): string {
  let p = typeof raw === 'string' ? raw.trim() : '';
  const cut = p.search(/[?#]/);
  if (cut >= 0) p = p.slice(0, cut);
  if (!p) return '/';
  return clipText(p, MAX_PATH_LEN, MAX_PATH_BYTES) || '/';
}
export const normalizeSourceText = (raw: unknown): string => clipText(typeof raw === 'string' ? raw.trim() : '', MAX_SOURCE_LEN, MAX_SOURCE_BYTES);
const normalizeChannelText = (raw: unknown): string => clipText(typeof raw === 'string' ? raw.trim() : '', MAX_CHANNEL_LEN, MAX_CHANNEL_BYTES);

export type Ga4RawRow = { dimensionValues?: Array<{ value?: unknown }>; metricValues?: Array<{ value?: unknown }> };
export type Ga4Row = {
  day: string; page: string; channel: string; source: string; is_ai: boolean;
  sessions: number; engaged_sessions: number; page_views: number; users: number; engagement_seconds: number; key_events: number;
};

/** `YYYYMMDD` (formato da dimensão `date` do GA4) → `YYYY-MM-DD`; null quando inválido. */
export function ga4DateToDay(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso ? null : iso;
}

const metricNumber = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) && n >= 0 ? n : NaN; };

/**
 * Converte linhas da API em linhas planas na ordem das dimensões pedidas. Linhas malformadas (data inválida, métrica ausente
 * ou negativa/não numérica) são descartadas. Contadores inteiros são arredondados; `engagement_seconds` e `key_events` ficam numéricos.
 */
export function normalizeGa4Rows(rows: Ga4RawRow[], dimensions: readonly string[]): Ga4Row[] {
  const out: Ga4Row[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const dims = Array.isArray(r?.dimensionValues) ? r.dimensionValues : [];
    const mets = Array.isArray(r?.metricValues) ? r.metricValues : [];
    if (dims.length < dimensions.length || mets.length < GA4_METRICS.length) continue;
    const row: Ga4Row = { day: '', page: '', channel: '', source: '', is_ai: false, sessions: 0, engaged_sessions: 0, page_views: 0, users: 0, engagement_seconds: 0, key_events: 0 };
    let valid = true;
    dimensions.forEach((dim, i) => {
      const v = dims[i]?.value;
      if (dim === 'date') { const d = ga4DateToDay(v); if (d) row.day = d; else valid = false; }
      else if (dim === 'pagePath') row.page = normalizePagePath(v);
      else if (dim === 'sessionDefaultChannelGroup') row.channel = normalizeChannelText(v);
      else if (dim === 'sessionSource') row.source = normalizeSourceText(v);
    });
    const m = GA4_METRICS.map((_, i) => metricNumber(mets[i]?.value));
    if (!valid || m.some((n) => Number.isNaN(n))) continue;
    row.sessions = Math.round(m[0]); row.engaged_sessions = Math.round(m[1]); row.page_views = Math.round(m[2]); row.users = Math.round(m[3]);
    row.engagement_seconds = Math.round(m[4] * 1000) / 1000; row.key_events = Math.round(m[5] * 1000) / 1000;
    row.is_ai = isAiSource(row.source);
    out.push(row);
  }
  return out;
}

/** Une linhas com a mesma chave única (um upsert não pode afetar a mesma linha duas vezes no mesmo lote). */
export function dedupeGa4Rows(rows: Ga4Row[]): Ga4Row[] {
  const map = new Map<string, Ga4Row>();
  for (const r of rows) {
    const k = [r.day, r.page, r.channel, r.source].join('\u0001');
    const cur = map.get(k);
    if (!cur) { map.set(k, { ...r }); continue; }
    cur.sessions += r.sessions; cur.engaged_sessions += r.engaged_sessions; cur.page_views += r.page_views; cur.users += r.users;
    cur.engagement_seconds += r.engagement_seconds; cur.key_events += r.key_events;
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Chamadas à API
// ---------------------------------------------------------------------------
async function ga4Call(fetchFn: typeof fetch, serviceAccountJson: string, url: string, init: RequestInit, opts: Ga4Options): Promise<{ ok: true; json: unknown } | Ga4Failure> {
  const tok = await getGoogleAccessToken(fetchFn, serviceAccountJson, { scope: GA4_SCOPE, errorPrefix: 'ga4', now: opts.now });
  if (!tok.ok) return tok;
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${tok.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch { return { ok: false, status: 0, error: 'ga4_unreachable' }; }
  const json = await readJson(res);
  if (res.ok) return { ok: true, json: json ?? {} };
  const detail = googleErrorDetail(json);
  const error = res.status === 403 || res.status === 404 ? 'ga4_forbidden' : res.status === 429 ? 'ga4_quota' : res.status >= 500 ? 'ga4_unreachable' : 'ga4_request_failed';
  return { ok: false, status: res.status, error, detail };
}

export type Ga4ReportParams = { startDate: string; endDate: string; dimensions: readonly string[]; limit?: number; offset?: number };
export type Ga4ReportOk = { ok: true; rows: Ga4RawRow[]; rowCount: number | null };

/** `properties/{id}:runReport` (gratuito). */
export async function ga4RunReport(fetchFn: typeof fetch, serviceAccountJson: string, propertyId: string, params: Ga4ReportParams, opts: Ga4Options = {}): Promise<Ga4ReportOk | Ga4Failure> {
  if (!isValidPropertyId(propertyId)) return { ok: false, status: 400, error: 'ga4_property_required' };
  const body = {
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    dimensions: params.dimensions.map((name) => ({ name })),
    metrics: GA4_METRICS.map((name) => ({ name })),
    orderBys: params.dimensions.map((dimensionName) => ({ dimension: { dimensionName } })),
    limit: String(Math.min(Math.max(Math.trunc(params.limit ?? GA4_PAGE_ROWS), 1), 250_000)),
    offset: String(Math.max(Math.trunc(params.offset ?? 0), 0)),
    keepEmptyRows: false,
  };
  const r = await ga4Call(fetchFn, serviceAccountJson, `${GA4_API}/properties/${propertyId}:runReport`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, opts);
  if (!r.ok) return r;
  const j = r.json as { rows?: unknown; rowCount?: unknown };
  const rc = Number(j.rowCount);
  return { ok: true, rows: Array.isArray(j.rows) ? j.rows as Ga4RawRow[] : [], rowCount: Number.isFinite(rc) && rc >= 0 ? rc : null };
}

/** `properties/{id}/metadata` (getMetadata, gratuito): confirma que a conta de serviço enxerga a propriedade. */
export async function ga4GetMetadata(fetchFn: typeof fetch, serviceAccountJson: string, propertyId: string, opts: Ga4Options = {}): Promise<{ ok: true; dimensions: number; metrics: number } | Ga4Failure> {
  if (!isValidPropertyId(propertyId)) return { ok: false, status: 400, error: 'ga4_property_required' };
  const r = await ga4Call(fetchFn, serviceAccountJson, `${GA4_API}/properties/${propertyId}/metadata`, { method: 'GET' }, opts);
  if (!r.ok) return r;
  const j = r.json as { dimensions?: unknown; metrics?: unknown };
  return { ok: true, dimensions: Array.isArray(j.dimensions) ? j.dimensions.length : 0, metrics: Array.isArray(j.metrics) ? j.metrics.length : 0 };
}

/** Apenas valida o token (sem propriedade): usado pelo teste de saúde quando nenhum projeto tem propriedade GA4 conhecida. */
export async function ga4CheckToken(fetchFn: typeof fetch, serviceAccountJson: string, opts: Ga4Options = {}): Promise<{ ok: true } | Ga4Failure> {
  const tok = await getGoogleAccessToken(fetchFn, serviceAccountJson, { scope: GA4_SCOPE, errorPrefix: 'ga4', now: opts.now });
  return tok.ok ? { ok: true } : tok;
}

// ---------------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------------
export type Ga4Admin = { from(table: string): { upsert(rows: unknown[], options: { onConflict: string }): PromiseLike<{ error: { message?: string; code?: string } | null }> } };
export type Ga4SyncResult = { source: 'ga4'; ok: boolean; rows_upserted: number; truncated?: boolean; error?: string; from: string; to: string };
export type Ga4SyncOptions = {
  organizationId: string;
  projectId: string;
  /** 1 a 90 (padrão 28). */
  days?: number;
  fetchFn: typeof fetch;
  resolveSecret: (provider: string) => Promise<string | null>;
  /** `projects.commercial_info.ga4_property_id`. */
  property?: string | null;
  now?: () => number;
  /** Só para testes: tamanho da página e máximo de páginas por coleta (padrão: 100000 e 5). */
  pageRows?: number;
  maxPages?: number;
};
export type Ga4SyncOutput = { property: string | null; from: string; to: string; rows_upserted: number; truncated: boolean; results: Ga4SyncResult[] };

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export function ga4SyncWindow(days: number | undefined, nowMs: number): { from: string; to: string } {
  const n = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days as number), 1), 90) : 28;
  return { from: ymd(nowMs - (n - 1) * 86_400_000), to: ymd(nowMs) };
}

type PerfRow = Ga4Row & { organization_id: string; project_id: string; synced_at: string };
async function upsertAll(admin: Ga4Admin, o: Ga4SyncOptions, rows: Ga4Row[]): Promise<{ upserted: number; error?: string }> {
  let upserted = 0;
  const syncedAt = new Date((o.now ?? Date.now)()).toISOString(); // atualiza synced_at também em reexecuções idempotentes
  for (let i = 0; i < rows.length; i += GA4_UPSERT_BATCH) {
    const batch: PerfRow[] = rows.slice(i, i + GA4_UPSERT_BATCH).map((r) => ({ organization_id: o.organizationId, project_id: o.projectId, ...r, synced_at: syncedAt }));
    try {
      const { error } = await admin.from('nexus_analytics_daily').upsert(batch, { onConflict: GA4_UPSERT_CONFLICT });
      if (error) return { upserted, error: `upsert_failed:${String(error.message || error.code || 'unknown').slice(0, 120)}` };
    } catch (e) {
      return { upserted, error: `upsert_failed:${String((e as Error)?.message || 'unknown').slice(0, 120)}` };
    }
    upserted += batch.length;
  }
  return { upserted };
}

async function collect(o: Ga4SyncOptions, secret: string, property: string, dimensions: readonly string[], from: string, to: string): Promise<{ ok: true; rows: Ga4Row[]; truncated: boolean } | { ok: false; error: string }> {
  const pageRows = o.pageRows ?? GA4_PAGE_ROWS;
  const maxPages = o.maxPages ?? GA4_MAX_PAGES;
  const collected: Ga4Row[] = [];
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const res = await ga4RunReport(o.fetchFn, secret, property, { startDate: from, endDate: to, dimensions, limit: pageRows, offset: page * pageRows }, { now: o.now });
    if (!res.ok) return { ok: false, error: res.error };
    collected.push(...normalizeGa4Rows(res.rows, dimensions));
    const fetched = page * pageRows + res.rows.length;
    // Há mais páginas só quando esta veio cheia e o total informado (quando existe) ainda não foi alcançado.
    const more = res.rows.length >= pageRows && (res.rowCount === null || fetched < res.rowCount);
    if (!more) break;
    if (page === maxPages - 1) truncated = true;
  }
  return { ok: true, rows: collected, truncated };
}

/** Sincroniza GA4 → `nexus_analytics_daily`. Nunca lança: o resultado leva `ok:false` e um código de erro. */
export async function syncGa4(admin: Ga4Admin, o: Ga4SyncOptions): Promise<Ga4SyncOutput> {
  const { from, to } = ga4SyncWindow(o.days, (o.now ?? Date.now)());
  const property = typeof o.property === 'string' ? o.property.trim() : '';
  const done = (r: Omit<Ga4SyncResult, 'source' | 'from' | 'to'>): Ga4SyncOutput => ({
    property: property || null, from, to, rows_upserted: r.rows_upserted, truncated: r.truncated === true,
    results: [{ source: 'ga4', from, to, ...r }],
  });
  try {
    let secret: string | null;
    try { secret = await o.resolveSecret('ga4'); } catch { return done({ ok: false, rows_upserted: 0, error: 'secret_unavailable' }); }
    if (!secret) return done({ ok: false, rows_upserted: 0, error: 'ga4_not_configured' });
    if (!property) return done({ ok: false, rows_upserted: 0, error: 'ga4_property_required' });
    if (!isValidPropertyId(property)) return done({ ok: false, rows_upserted: 0, error: 'ga4_property_required' });
    let total = 0;
    let truncated = false;
    // Totais do site primeiro (sem pagePath), depois as páginas.
    for (const dims of [GA4_SITE_DIMENSIONS, GA4_PAGE_DIMENSIONS] as const) {
      const got = await collect(o, secret, property, dims, from, to);
      if (!got.ok) return done({ ok: false, rows_upserted: total, truncated, error: got.error });
      truncated = truncated || got.truncated;
      const rows = dedupeGa4Rows(got.rows);
      const up = await upsertAll(admin, o, rows);
      total += up.upserted;
      if (up.error) return done({ ok: false, rows_upserted: total, truncated, error: up.error });
    }
    return done({ ok: true, rows_upserted: total, truncated });
  } catch {
    return done({ ok: false, rows_upserted: 0, error: 'ga4_unexpected_error' });
  }
}
