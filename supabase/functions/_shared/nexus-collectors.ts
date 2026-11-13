/**
 * Coletores de SERP do módulo "NEXUS · Motores & APIs" (contrato de 12/11/2026).
 *
 * Adaptadores puros para DataForSEO (Google e Bing), SerpApi (Google e Bing) e Brave Search.
 * Nada aqui faz rede por conta própria: o `fetch` é sempre injetado (`providerFetch` em produção),
 * as URLs são montadas pelo servidor e a credencial nunca entra em mensagens de erro nem na resposta
 * bruta devolvida (`raw` passa por `redactSecrets`).
 */
import { parseSerp, safePublicUrl } from './nexus-intelligence.ts';

export type CollectorInput = { engine: string; query: string; country: string; language: string; city?: string; domain: string; variants: string[] };
export type CollectorResult = { raw: unknown; output: Record<string, unknown>; cost_micros?: number };

/** Erro de coletor: `message` é sempre um código estável; `status`/`detail` ajudam o diagnóstico (sem segredo). */
export class CollectorError extends Error {
  status?: number;
  detail?: string;
  constructor(code: string, extra?: { status?: number; detail?: string }) {
    super(code);
    this.name = 'CollectorError';
    this.status = extra?.status;
    this.detail = extra?.detail;
  }
}

export const COLLECTOR_ENGINES = ['dataforseo_google', 'dataforseo_bing', 'serpapi_google', 'serpapi_bing', 'brave_search'] as const;
export type CollectorEngine = typeof COLLECTOR_ENGINES[number];
export const isCollectorEngine = (v: unknown): v is CollectorEngine => typeof v === 'string' && (COLLECTOR_ENGINES as readonly string[]).includes(v);

/** País (ISO 3166-1 alpha-2, minúsculo) -> `location_code` do DataForSEO. */
export const DATAFORSEO_LOCATION_CODES: Readonly<Record<string, number>> = {
  br: 2076, us: 2840, pt: 2620, es: 2724, it: 2380, fr: 2250, gb: 2826, de: 2276, ar: 2032, mx: 2484, ca: 2124, cl: 2152, co: 2170, uy: 2858,
};

/** Custos de referência (micros de US$) quando o provedor não informa o custo na resposta. Valores de referência — confirmar no site do provedor. */
export const COLLECTOR_REFERENCE_COST_MICROS = { serpapi: 10_000, brave: 5_000 } as const;

const TIMEOUT_MS = 25_000;
const ENDPOINTS = {
  dataforseo: (se: 'google' | 'bing') => `https://api.dataforseo.com/v3/serp/${se}/organic/live/advanced`,
  serpapi: 'https://serpapi.com/search.json',
  brave: 'https://api.search.brave.com/res/v1/web/search',
} as const;

export function normalizeCountry(country: string): string {
  const c = String(country ?? '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(c)) throw new CollectorError('country_unsupported');
  return c;
}
export function locationCodeFor(country: string): number {
  const code = DATAFORSEO_LOCATION_CODES[normalizeCountry(country)];
  if (!code) throw new CollectorError('country_unsupported');
  return code;
}
/** Idioma da interface (`pt-BR`, `en`) -> `language_code` do DataForSEO (`pt`, `en`; mantém `pt-PT`, `zh-CN`, `zh-TW`). */
export function dataforseoLanguage(language: string): string {
  const parts = String(language ?? '').trim().split(/[-_]/);
  const lang = (parts[0] || '').toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) throw new CollectorError('language_invalid');
  const region = (parts[1] || '').toUpperCase();
  if ((lang === 'pt' && region === 'PT') || (lang === 'zh' && (region === 'CN' || region === 'TW'))) return `${lang}-${region}`;
  return lang;
}
/** Idioma para SerpApi/Google (`hl`): código primário, com `pt-BR`/`pt-PT`/`zh-CN`/`zh-TW` preservados. */
export function googleHl(language: string): string {
  const parts = String(language ?? '').trim().split(/[-_]/);
  const lang = (parts[0] || '').toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) throw new CollectorError('language_invalid');
  const region = (parts[1] || '').toUpperCase();
  if (['pt-BR', 'pt-PT', 'zh-CN', 'zh-TW'].includes(`${lang}-${region}`)) return `${lang}-${region}`;
  return lang;
}
/** `search_lang` da Brave: minúsculo; `pt-br`/`pt-pt` existem; chinês usa `zh-hans`/`zh-hant`. */
export function braveSearchLang(language: string): string {
  const parts = String(language ?? '').trim().split(/[-_]/);
  const lang = (parts[0] || '').toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) throw new CollectorError('language_invalid');
  const region = (parts[1] || '').toUpperCase();
  if (lang === 'pt' && (region === 'BR' || region === 'PT')) return `pt-${region.toLowerCase()}`;
  if (lang === 'zh') return region === 'TW' || region === 'HK' ? 'zh-hant' : 'zh-hans';
  return lang;
}
/** `ui_lang` da Brave no formato `ll-CC` (usa a região do idioma; senão o país da consulta). */
export function braveUiLang(language: string, country: string): string {
  const parts = String(language ?? '').trim().split(/[-_]/);
  const lang = (parts[0] || '').toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) throw new CollectorError('language_invalid');
  const region = /^[A-Za-z]{2}$/.test(parts[1] || '') ? parts[1].toUpperCase() : normalizeCountry(country).toUpperCase();
  return `${lang}-${region}`;
}

function basicAuth(login: string, password: string): string {
  const bytes = new TextEncoder().encode(`${login}:${password}`);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `Basic ${btoa(bin)}`;
}
const clipStr = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const toMicros = (usd: unknown): number | undefined => (typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1_000_000) : undefined);

/** Remove ocorrências de segredos (e suas versões codificadas em URL) de qualquer estrutura JSON. */
export function redactSecrets(value: unknown, secrets: string[]): unknown {
  const list = secrets.filter(s => typeof s === 'string' && s.length >= 6);
  if (!list.length) return value;
  let text: string;
  try { text = JSON.stringify(value) ?? 'null'; } catch { return null; }
  for (const s of list) {
    for (const variant of new Set([s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)])) {
      if (variant) text = text.split(variant).join('[redacted]');
    }
  }
  return JSON.parse(text);
}

async function request(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<{ res: Response; json: unknown; latency_ms: number }> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new CollectorError('provider_request_failed', { detail: 'network_error' });
  }
  let json: unknown = null;
  let text = '';
  try { text = await res.text(); } catch { /* corpo ilegível */ }
  if (text) { try { json = JSON.parse(text); } catch { json = null; } }
  const latency_ms = Math.max(0, Date.now() - started);
  if (!res.ok) throw new CollectorError('provider_request_failed', { status: res.status, detail: clipStr((json as { message?: string; error?: string } | null)?.message ?? (json as { error?: string } | null)?.error, 200) || undefined });
  if (json === null || typeof json !== 'object') throw new CollectorError('provider_request_failed', { status: res.status, detail: 'invalid_json' });
  return { res, json, latency_ms };
}

function baseOutput(engine: string, provider: string, input: CollectorInput, latency_ms: number, serp: ReturnType<typeof parseSerp>, context: Record<string, unknown>) {
  return {
    ...serp,
    provider,
    engine,
    latency_ms,
    collected_at: new Date().toISOString(),
    context: { country: input.country.toLowerCase(), language: input.language, ...(input.city ? { city: input.city } : {}), query: input.query, ...context },
  } as Record<string, unknown>;
}

function dedupeSources(list: Array<{ url?: unknown; title?: unknown }>): Array<{ url: string; title: string }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; title: string }> = [];
  for (const s of list) {
    const url = safePublicUrl(s.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: clipStr(s.title, 500) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// DataForSEO
// ---------------------------------------------------------------------------
type DfsItem = { type?: string; rank_group?: number; rank_absolute?: number; url?: string; title?: string; description?: string; references?: unknown[]; items?: unknown[] };

function collectDfsReferences(item: DfsItem): Array<{ url?: unknown; title?: unknown }> {
  const refs: Array<{ url?: unknown; title?: unknown }> = [];
  for (const r of item.references || []) refs.push(r as { url?: unknown; title?: unknown });
  for (const sub of item.items || []) {
    for (const r of (sub as DfsItem)?.references || []) refs.push(r as { url?: unknown; title?: unknown });
  }
  return refs;
}

export function buildDataForSeoRequest(se: 'google' | 'bing', credential: string, input: CollectorInput) {
  const idx = credential.indexOf(':');
  if (idx <= 0 || idx === credential.length - 1) throw new CollectorError('credential_invalid');
  const login = credential.slice(0, idx);
  const password = credential.slice(idx + 1);
  const keyword = clipStr(input.query, 700);
  if (!keyword) throw new CollectorError('query_required');
  return {
    url: ENDPOINTS.dataforseo(se),
    init: {
      method: 'POST',
      headers: { Authorization: basicAuth(login, password), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([{ keyword, location_code: locationCodeFor(input.country), language_code: dataforseoLanguage(input.language), depth: 10 }]),
    } as RequestInit,
    secrets: [password, credential],
  };
}

export function parseDataForSeo(data: unknown, domain: string, se: 'google' | 'bing') {
  const d = data as { status_code?: number; status_message?: string; cost?: number; tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: DfsItem[] }> }> };
  const task = Array.isArray(d?.tasks) ? d.tasks[0] : undefined;
  if (d?.status_code !== 20000 || !task || task.status_code !== 20000) {
    throw new CollectorError('provider_request_failed', { status: task?.status_code ?? d?.status_code, detail: clipStr(task?.status_message ?? d?.status_message, 200) || undefined });
  }
  const items: DfsItem[] = Array.isArray(task.result?.[0]?.items) ? task.result![0].items! : [];
  const organic = items.filter(i => i?.type === 'organic').map(i => ({ position: i.rank_group ?? i.rank_absolute, link: i.url, title: i.title, snippet: i.description }));
  const serp = parseSerp({ organic }, domain);
  let ai_overview: { present: boolean; sources: Array<{ url: string; title: string }> } | undefined;
  if (se === 'google') {
    const aio = items.filter(i => i?.type === 'ai_overview');
    ai_overview = { present: aio.length > 0, sources: dedupeSources(aio.flatMap(collectDfsReferences)) };
  }
  const cost_micros = toMicros(task.cost) ?? toMicros(d.cost);
  return { serp, ai_overview, cost_micros };
}

async function collectDataForSeo(se: 'google' | 'bing', credential: string, input: CollectorInput, fetchFn: typeof fetch): Promise<CollectorResult> {
  const req = buildDataForSeoRequest(se, credential, input);
  const { json, latency_ms } = await request(fetchFn, req.url, req.init);
  const parsed = parseDataForSeo(json, input.domain, se);
  const output = baseOutput(`dataforseo_${se}`, 'dataforseo', input, latency_ms, parsed.serp, {
    location_code: locationCodeFor(input.country), language_code: dataforseoLanguage(input.language), depth: 10, ...(input.city ? { city_ignored: true } : {}),
  });
  if (parsed.ai_overview) output.ai_overview = parsed.ai_overview;
  output.cost_basis = parsed.cost_micros === undefined ? 'unknown' : 'provider_reported';
  return { raw: redactSecrets(json, req.secrets), output, ...(parsed.cost_micros === undefined ? {} : { cost_micros: parsed.cost_micros }) };
}

// ---------------------------------------------------------------------------
// SerpApi
// ---------------------------------------------------------------------------
export function buildSerpApiUrl(se: 'google' | 'bing', apiKey: string, input: CollectorInput): string {
  const q = clipStr(input.query, 500);
  if (!q) throw new CollectorError('query_required');
  if (!apiKey.trim()) throw new CollectorError('credential_invalid');
  const country = normalizeCountry(input.country);
  const p = new URLSearchParams({ engine: se, q });
  if (se === 'google') {
    p.set('gl', country);
    p.set('hl', googleHl(input.language));
    p.set('num', '10');
  } else {
    // Bing usa `cc` em vez de `gl`; o número de resultados é `count` (o parâmetro `num` é do Google).
    p.set('cc', country);
    p.set('count', '10');
  }
  if (input.city) p.set('location', clipStr(input.city, 120));
  p.set('api_key', apiKey);
  return `${ENDPOINTS.serpapi}?${p.toString()}`;
}

export function parseSerpApi(data: unknown, domain: string, se: 'google' | 'bing') {
  const d = data as { error?: string; organic_results?: Array<{ position?: number; link?: string; title?: string; snippet?: string }>; ai_overview?: { references?: Array<{ link?: string; url?: string; title?: string }>; page_token?: string } };
  const noResults = typeof d?.error === 'string' && /hasn't returned any results|no results/i.test(d.error);
  if (typeof d?.error === 'string' && !noResults) throw new CollectorError('provider_request_failed', { detail: clipStr(d.error, 200) });
  const organicRaw = Array.isArray(d?.organic_results) ? d.organic_results : noResults ? [] : undefined;
  // Bing do SerpApi pode omitir `position`: usa a ordem de chegada.
  const organic = Array.isArray(organicRaw) ? organicRaw.map((r, i) => ({ position: Number.isInteger(r?.position) ? r.position : i + 1, link: r?.link, title: r?.title, snippet: r?.snippet })) : organicRaw;
  const serp = parseSerp({ organic }, domain);
  let ai_overview: { present: boolean; sources: Array<{ url: string; title: string }> } | undefined;
  if (se === 'google') {
    const aio = d.ai_overview;
    ai_overview = { present: !!aio && typeof aio === 'object', sources: dedupeSources((aio?.references || []).map(r => ({ url: r.link ?? r.url, title: r.title }))) };
  }
  return { serp, ai_overview };
}

async function collectSerpApi(se: 'google' | 'bing', credential: string, input: CollectorInput, fetchFn: typeof fetch): Promise<CollectorResult> {
  const url = buildSerpApiUrl(se, credential, input);
  const { json, latency_ms } = await request(fetchFn, url, { method: 'GET', headers: { Accept: 'application/json' } });
  const parsed = parseSerpApi(json, input.domain, se);
  const output = baseOutput(`serpapi_${se}`, 'serpapi', input, latency_ms, parsed.serp, {});
  if (parsed.ai_overview) output.ai_overview = parsed.ai_overview;
  output.cost_basis = 'reference_estimate';
  return { raw: redactSecrets(json, [credential]), output, cost_micros: COLLECTOR_REFERENCE_COST_MICROS.serpapi };
}

// ---------------------------------------------------------------------------
// Brave Search
// ---------------------------------------------------------------------------
export function buildBraveUrl(input: CollectorInput): string {
  const q = clipStr(input.query, 400);
  if (!q) throw new CollectorError('query_required');
  const p = new URLSearchParams({ q, country: normalizeCountry(input.country).toUpperCase(), search_lang: braveSearchLang(input.language), ui_lang: braveUiLang(input.language, input.country), count: '10' });
  return `${ENDPOINTS.brave}?${p.toString()}`;
}

export function parseBrave(data: unknown, domain: string) {
  const d = data as { web?: { results?: Array<{ url?: string; title?: string; description?: string }> } };
  const results = d?.web?.results;
  // Sem bloco `web` a Brave não encontrou resultados web para a consulta: amostra vazia válida.
  const list = Array.isArray(results) ? results : d && typeof d === 'object' && !('web' in d) ? [] : undefined;
  const organic = Array.isArray(list) ? list.map((r, i) => ({ position: i + 1, link: r?.url, title: r?.title, snippet: r?.description })) : undefined;
  return parseSerp({ organic }, domain);
}

/** Lê `X-RateLimit-*` (a Brave envia valores por janela, ex.: "1, 15000"). */
export function parseBraveRateLimit(headers: Headers): { limit: number[]; remaining: number[]; reset: number[] } | null {
  const read = (name: string) => (headers.get(name) || '').split(',').map(s => s.trim()).filter(s => s !== '').map(Number).filter(n => Number.isFinite(n));
  const limit = read('x-ratelimit-limit');
  const remaining = read('x-ratelimit-remaining');
  const reset = read('x-ratelimit-reset');
  return limit.length || remaining.length || reset.length ? { limit, remaining, reset } : null;
}

async function collectBrave(credential: string, input: CollectorInput, fetchFn: typeof fetch): Promise<CollectorResult> {
  if (!credential.trim()) throw new CollectorError('credential_invalid');
  const url = buildBraveUrl(input);
  const { res, json, latency_ms } = await request(fetchFn, url, { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': credential } });
  const serp = parseBrave(json, input.domain);
  const output = baseOutput('brave_search', 'brave', input, latency_ms, serp, { search_lang: braveSearchLang(input.language), ui_lang: braveUiLang(input.language, input.country), ...(input.city ? { city_ignored: true } : {}) });
  const rate = parseBraveRateLimit(res.headers);
  if (rate) output.rate_limit = rate;
  output.cost_basis = 'reference_estimate';
  return { raw: redactSecrets(json, [credential]), output, cost_micros: COLLECTOR_REFERENCE_COST_MICROS.brave };
}

// ---------------------------------------------------------------------------
// Interface comum
// ---------------------------------------------------------------------------
/** Executa um coletor. Lança `CollectorError` (`message` estável): provider_request_failed, country_unsupported, credential_invalid, query_required, language_invalid, engine_unsupported. */
export async function runCollector(engine: string, credential: string, input: CollectorInput, fetchFn: typeof fetch): Promise<CollectorResult> {
  switch (engine) {
    case 'dataforseo_google': return await collectDataForSeo('google', credential, input, fetchFn);
    case 'dataforseo_bing': return await collectDataForSeo('bing', credential, input, fetchFn);
    case 'serpapi_google': return await collectSerpApi('google', credential, input, fetchFn);
    case 'serpapi_bing': return await collectSerpApi('bing', credential, input, fetchFn);
    case 'brave_search': return await collectBrave(credential, input, fetchFn);
    default: throw new CollectorError('engine_unsupported');
  }
}
