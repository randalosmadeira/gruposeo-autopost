/**
 * Bing Webmaster Tools API (JSON). Gratuita; a resposta útil vem no nó `d`.
 * A API já teve instabilidades: `d` ausente, 5xx ou erro do provedor ganham UMA nova tentativa e,
 * persistindo, viram `bing_unreachable`. Chave inválida (ErrorCode 3/14, 401/403) não é repetida
 * e vira `bing_unauthorized`. A chave vai na query (exigência da API) e nunca é registrada.
 */
export const BING_API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const REQUEST_TIMEOUT_MS = 20_000;

export type BingOptions = { sleep?: (ms: number) => Promise<void>; retryDelayMs?: number };
export type BingFailure = { ok: false; status: number; error: 'bing_unreachable' | 'bing_unauthorized' | 'bing_invalid_request'; detail?: string };
export type BingSite = { url: string; isVerified: boolean };
export type BingStatRow = { day: string; key: string; clicks: number; impressions: number; position: number };
export type BingTrafficRow = { day: string; clicks: number; impressions: number };

/** `"/Date(1700000000000)/"` ou `"/Date(1700000000000-0700)/"` -> `YYYY-MM-DD` (UTC). */
export function parseBingDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(raw.trim());
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Chamada genérica com 1 retry. Devolve o conteúdo de `d` (array ou objeto). */
export async function bingRequest(fetchFn: typeof fetch, apiKey: string, method: string, params: Record<string, string> = {}, opts: BingOptions = {}): Promise<{ ok: true; d: unknown } | BingFailure> {
  if (!/^[A-Za-z]+$/.test(method)) return { ok: false, status: 0, error: 'bing_invalid_request' };
  const q = new URLSearchParams({ apikey: apiKey, ...params });
  const url = `${BING_API_BASE}/${method}?${q.toString()}`;
  const sleep = opts.sleep ?? defaultSleep;
  let last: BingFailure = { ok: false, status: 0, error: 'bing_unreachable' };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(opts.retryDelayMs ?? 700);
    let res: Response;
    try {
      res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch { last = { ok: false, status: 0, error: 'bing_unreachable' }; continue; }
    let json: { d?: unknown; ErrorCode?: unknown; Message?: unknown } | null = null;
    try { json = JSON.parse(await res.text()); } catch { json = null; }
    const code = typeof json?.ErrorCode === 'number' ? json.ErrorCode : undefined;
    const message = clip(json?.Message, 200) || undefined;
    if (res.status === 401 || res.status === 403 || code === 3 || code === 14 || /InvalidApiKey|NotAuthorized/i.test(message || '')) {
      return { ok: false, status: res.status, error: 'bing_unauthorized', detail: message };
    }
    // 5xx, 429 e "erro do provedor" (corpo com ErrorCode): 1 nova tentativa e, persistindo, bing_unreachable.
    if (res.status >= 500 || res.status === 429 || code !== undefined) { last = { ok: false, status: res.status, error: 'bing_unreachable', detail: message }; continue; }
    if (!res.ok) {
      // Outros 4xx sem ErrorCode: determinístico, sem nova tentativa.
      return { ok: false, status: res.status, error: 'bing_invalid_request', detail: message };
    }
    const d = json?.d;
    if (d === undefined || d === null || typeof d !== 'object') { last = { ok: false, status: res.status, error: 'bing_unreachable', detail: message ?? 'd_missing' }; continue; }
    return { ok: true, d };
  }
  return last;
}

export async function bingGetUserSites(fetchFn: typeof fetch, apiKey: string, opts: BingOptions = {}): Promise<{ ok: true; sites: BingSite[] } | BingFailure> {
  const r = await bingRequest(fetchFn, apiKey, 'GetUserSites', {}, opts);
  if (!r.ok) return r;
  const list = Array.isArray(r.d) ? r.d as Array<{ Url?: unknown; IsVerified?: unknown }> : [];
  return { ok: true, sites: list.flatMap(s => typeof s?.Url === 'string' && s.Url ? [{ url: s.Url, isVerified: s.IsVerified === true }] : []) };
}

function toStatRows(d: unknown): BingStatRow[] {
  const list = Array.isArray(d) ? d as Array<Record<string, unknown>> : [];
  const out: BingStatRow[] = [];
  for (const r of list) {
    const day = parseBingDate(r?.Date);
    const clicks = Number(r?.Clicks); const impressions = Number(r?.Impressions);
    if (!day || !Number.isFinite(clicks) || !Number.isFinite(impressions)) continue;
    // `Query` carrega a consulta em GetQueryStats e a URL da página em GetPageStats.
    const key = clip(r?.Query ?? r?.Page ?? r?.Url, 2048);
    const avgImp = Number(r?.AvgImpressionPosition); const avgClick = Number(r?.AvgClickPosition);
    const position = avgImp > 0 ? avgImp : avgClick > 0 ? avgClick : 0;
    out.push({ day, key, clicks, impressions, position });
  }
  return out;
}

export async function bingGetQueryStats(fetchFn: typeof fetch, apiKey: string, siteUrl: string, opts: BingOptions = {}): Promise<{ ok: true; rows: BingStatRow[] } | BingFailure> {
  const r = await bingRequest(fetchFn, apiKey, 'GetQueryStats', { siteUrl }, opts);
  return r.ok ? { ok: true, rows: toStatRows(r.d) } : r;
}
export async function bingGetPageStats(fetchFn: typeof fetch, apiKey: string, siteUrl: string, opts: BingOptions = {}): Promise<{ ok: true; rows: BingStatRow[] } | BingFailure> {
  const r = await bingRequest(fetchFn, apiKey, 'GetPageStats', { siteUrl }, opts);
  return r.ok ? { ok: true, rows: toStatRows(r.d) } : r;
}
export async function bingGetRankAndTrafficStats(fetchFn: typeof fetch, apiKey: string, siteUrl: string, opts: BingOptions = {}): Promise<{ ok: true; rows: BingTrafficRow[] } | BingFailure> {
  const r = await bingRequest(fetchFn, apiKey, 'GetRankAndTrafficStats', { siteUrl }, opts);
  if (!r.ok) return r;
  return { ok: true, rows: toStatRows(r.d).map(({ day, clicks, impressions }) => ({ day, clicks, impressions })) };
}
