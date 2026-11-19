/**
 * Google Search Console (API de Search Analytics) por conta de serviço, sem dependências externas.
 *
 * - JWT RS256 assinado com WebCrypto a partir da chave PEM PKCS8 da conta de serviço;
 * - troca por access token em `https://oauth2.googleapis.com/token` (URL fixa; nunca lida do JSON);
 * - cache do token em memória por 50 min (por e-mail + impressão digital da chave);
 * - o JSON da conta de serviço, a chave privada e os tokens nunca são devolvidos nem registrados.
 */
export type GscSite = { siteUrl: string; permissionLevel: string };
export type GscFailure = { ok: false; status: number; error: string; detail?: string };

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GSC_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_API = 'https://www.googleapis.com/webmasters/v3';
const TOKEN_TTL_MS = 50 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export type GscOptions = { now?: () => number };
export type ServiceAccount = { client_email: string; private_key: string };

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
export const clearGscTokenCache = () => tokenCache.clear();

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const b64urlFromString = (s: string) => b64urlFromBytes(new TextEncoder().encode(s));

export function parseServiceAccount(json: string): ServiceAccount | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o || o.type !== 'service_account') return null;
    const email = typeof o.client_email === 'string' ? o.client_email.trim() : '';
    const key = typeof o.private_key === 'string' ? o.private_key.trim() : '';
    if (!email || !key.startsWith('-----BEGIN PRIVATE KEY-----')) return null;
    return { client_email: email, private_key: key };
  } catch { return null; }
}

export function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Monta e assina o JWT de asserção (RS256). `iat`/`exp` em segundos. */
export async function signServiceAccountJwt(sa: ServiceAccount, nowSeconds: number, scope: string = GSC_SCOPE): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key) as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const header = b64urlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlFromString(JSON.stringify({ iss: sa.client_email, scope, aud: GSC_TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signingInput = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${b64urlFromBytes(sig)}`;
}

async function keyFingerprint(sa: ServiceAccount): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sa.private_key)));
  return [...digest.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
export function googleErrorDetail(json: unknown): string | undefined {
  const j = json as { error?: unknown; error_description?: unknown } | null;
  const e = j?.error;
  const msg = typeof e === 'string' ? `${e}${j?.error_description ? `: ${clip(j.error_description, 150)}` : ''}` : clip((e as { message?: unknown } | undefined)?.message, 200);
  return msg || undefined;
}

export async function readJson(res: Response): Promise<unknown> {
  try { return JSON.parse(await res.text()); } catch { return null; }
}

/**
 * Segredo que já É um access token OAuth (conexão gerenciada, 14/11/2026): `oauth-access:<token>`. Um JSON de conta de serviço
 * começa com `{`, então os dois formatos nunca se confundem. O token vive só na memória da execução (nunca é gravado nem devolvido).
 */
export const OAUTH_ACCESS_PREFIX = 'oauth-access:';
export const asOAuthAccessSecret = (token: string) => `${OAUTH_ACCESS_PREFIX}${token}`;

export type GoogleTokenOptions = GscOptions & { scope: string; /** Prefixo dos códigos de erro: `gsc` ou `ga4`. */ errorPrefix: string };

/**
 * Obtém (ou reaproveita) o access token de uma conta de serviço do Google para o escopo dado. Nunca lança.
 * Código comum ao Search Console e ao GA4 (13/11/2026): o cache é por e-mail + impressão digital da chave + escopo,
 * e os códigos de erro levam o prefixo do provedor (`gsc_auth_failed`, `ga4_auth_failed`...).
 */
export async function getGoogleAccessToken(fetchFn: typeof fetch, serviceAccountJson: string, opts: GoogleTokenOptions): Promise<{ ok: true; token: string } | GscFailure> {
  const now = opts.now ?? Date.now;
  const p = opts.errorPrefix;
  if (serviceAccountJson.startsWith(OAUTH_ACCESS_PREFIX)) {
    const token = serviceAccountJson.slice(OAUTH_ACCESS_PREFIX.length).trim();
    return token ? { ok: true, token } : { ok: false, status: 400, error: `${p}_credential_invalid` };
  }
  const sa = parseServiceAccount(serviceAccountJson);
  if (!sa) return { ok: false, status: 400, error: `${p}_credential_invalid` };
  let cacheKey: string;
  try { cacheKey = `${sa.client_email}|${await keyFingerprint(sa)}|${opts.scope}`; } catch { return { ok: false, status: 400, error: `${p}_credential_invalid` }; }
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > now()) return { ok: true, token: hit.token };
  let assertion: string;
  try { assertion = await signServiceAccountJwt(sa, Math.floor(now() / 1000), opts.scope); } catch { return { ok: false, status: 400, error: `${p}_credential_invalid`, detail: 'private_key_unreadable' }; }
  let res: Response;
  try {
    res = await fetchFn(GSC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { return { ok: false, status: 0, error: `${p}_unreachable` }; }
  const json = await readJson(res) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!res.ok) return { ok: false, status: res.status, error: res.status >= 500 ? `${p}_unreachable` : `${p}_auth_failed`, detail: googleErrorDetail(json) };
  if (!json || typeof json.access_token !== 'string' || !json.access_token) return { ok: false, status: res.status, error: `${p}_auth_failed`, detail: 'token_missing' };
  const ttl = typeof json.expires_in === 'number' && json.expires_in > 0 ? Math.min(TOKEN_TTL_MS, json.expires_in * 1000 - 60_000) : TOKEN_TTL_MS;
  tokenCache.set(cacheKey, { token: json.access_token, expiresAt: now() + Math.max(ttl, 0) });
  return { ok: true, token: json.access_token };
}

/** Obtém (ou reaproveita) o access token do Search Console. Nunca lança. */
export function getGscAccessToken(fetchFn: typeof fetch, serviceAccountJson: string, opts: GscOptions = {}): Promise<{ ok: true; token: string } | GscFailure> {
  return getGoogleAccessToken(fetchFn, serviceAccountJson, { ...opts, scope: GSC_SCOPE, errorPrefix: 'gsc' });
}

/** Limpa o cache de tokens em memória (todos os escopos). */
export const clearGoogleTokenCache = () => tokenCache.clear();

async function gscCall(fetchFn: typeof fetch, serviceAccountJson: string, url: string, init: RequestInit, opts: GscOptions): Promise<{ ok: true; json: unknown } | GscFailure> {
  const tok = await getGscAccessToken(fetchFn, serviceAccountJson, opts);
  if (!tok.ok) return tok;
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${tok.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch { return { ok: false, status: 0, error: 'gsc_unreachable' }; }
  const json = await readJson(res);
  if (res.ok) return { ok: true, json: json ?? {} };
  if (res.status === 401) tokenCache.clear(); // token revogado/expirado: força nova troca na próxima chamada
  const error = res.status === 403 || res.status === 404 ? 'gsc_forbidden' : res.status === 429 || res.status >= 500 ? 'gsc_unreachable' : 'gsc_request_failed';
  return { ok: false, status: res.status, error, detail: googleErrorDetail(json) };
}

/** Lista as propriedades acessíveis à conta de serviço (teste de saúde gratuito). */
export async function gscListSites(fetchFn: typeof fetch, serviceAccountJson: string, opts: GscOptions = {}): Promise<{ ok: true; sites: GscSite[] } | GscFailure> {
  const r = await gscCall(fetchFn, serviceAccountJson, `${GSC_API}/sites`, { method: 'GET' }, opts);
  if (!r.ok) return r;
  const entries = (r.json as { siteEntry?: Array<{ siteUrl?: unknown; permissionLevel?: unknown }> }).siteEntry;
  const sites = (Array.isArray(entries) ? entries : []).flatMap(e => typeof e?.siteUrl === 'string' && e.siteUrl ? [{ siteUrl: e.siteUrl, permissionLevel: typeof e.permissionLevel === 'string' ? e.permissionLevel : '' }] : []);
  return { ok: true, sites };
}

export type GscDimension = 'date' | 'query' | 'page' | 'country' | 'device' | 'searchAppearance';
export type GscQueryParams = { startDate: string; endDate: string; dimensions: GscDimension[]; rowLimit?: number; startRow?: number };
export type GscRawRow = { keys?: unknown[]; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown };
export type GscRow = { date: string; query: string; page: string; country: string; device: string; clicks: number; impressions: number; ctr: number; position: number };

/** Consulta Search Analytics. `property`: `sc-domain:exemplo.com.br` ou `https://exemplo.com.br/`. */
export async function gscQuery(fetchFn: typeof fetch, serviceAccountJson: string, property: string, params: GscQueryParams, opts: GscOptions = {}): Promise<{ ok: true; rows: GscRawRow[] } | GscFailure> {
  if (!property.trim()) return { ok: false, status: 400, error: 'gsc_property_required' };
  const body = { startDate: params.startDate, endDate: params.endDate, dimensions: params.dimensions, rowLimit: Math.min(Math.max(params.rowLimit ?? 1000, 1), 25_000), startRow: Math.max(params.startRow ?? 0, 0) };
  const url = `${GSC_API}/sites/${encodeURIComponent(property.trim())}/searchAnalytics/query`;
  const r = await gscCall(fetchFn, serviceAccountJson, url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, opts);
  if (!r.ok) return r;
  const rows = (r.json as { rows?: unknown }).rows;
  return { ok: true, rows: Array.isArray(rows) ? rows as GscRawRow[] : [] };
}

const num = (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : NaN; };

/**
 * Converte linhas da API em linhas planas. Dimensão ausente vira string vazia; `country` e `device`
 * são gravados em minúsculas (o GSC devolve `bra` e `MOBILE`). Linhas malformadas são descartadas.
 */
export function normalizeGscRows(rows: GscRawRow[], dimensions: string[]): GscRow[] {
  const out: GscRow[] = [];
  for (const r of rows || []) {
    const keys = Array.isArray(r?.keys) ? r.keys : [];
    if (keys.length < dimensions.length) continue;
    const row: GscRow = { date: '', query: '', page: '', country: '', device: '', clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) };
    let valid = true;
    dimensions.forEach((dim, i) => {
      const v = typeof keys[i] === 'string' ? keys[i] as string : '';
      if (dim === 'date') { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) row.date = v; else valid = false; }
      else if (dim === 'query') row.query = v.slice(0, 2048);
      else if (dim === 'page') row.page = v.slice(0, 2048);
      else if (dim === 'country') row.country = v.toLowerCase();
      else if (dim === 'device') row.device = v.toLowerCase();
    });
    if (!valid || !Number.isFinite(row.clicks) || !Number.isFinite(row.impressions)) continue;
    if (!Number.isFinite(row.ctr)) row.ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
    if (!Number.isFinite(row.position)) row.position = 0;
    out.push(row);
  }
  return out;
}
