/**
 * zica-signals: verification, validation and classification for the public signals endpoint.
 * Pure (no Deno/Supabase imports) so it can be tested with `deno test` and reused by the edge function.
 *
 * Signature (server mode, identical to the WordPress plugin's sign_body):
 *   hex(hmac_sha256(secret, timestamp + "\n" + nonce + "\n" + sha256hex(rawBody)))
 */
export const MAX_SERVER_BODY = 64 * 1024;
export const MAX_BROWSER_BODY = 1024;
export const MAX_EVENTS = 500;
export const MAX_SKEW_SECONDS = 300;
export const MAX_HITS = 100000;
export const SERVER_KINDS = ['ai_bot_hit', 'ai_referral', 'search_referral', 'human_pageview', 'cta_click'] as const;
export const BROWSER_KINDS = ['ai_referral', 'search_referral', 'human_pageview', 'cta_click'] as const;
/** Tipos de contato medidos no clique (sem dado pessoal): WhatsApp, telefone, e-mail, formulário. */
export const CTA_AGENTS = ['whatsapp', 'phone', 'email', 'form'] as const;
export type SignalKind = typeof SERVER_KINDS[number];
export type SignalEvent = { site_host: string; day: string; kind: SignalKind; agent: string; path: string; hits: number };

// Canonical lists: mirror integrations/zica-signals/signals-catalog.json (v1).
export const AI_BOT_AGENTS = ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'ClaudeBot', 'Claude-User', 'anthropic-ai',
  'Google-Extended', 'Googlebot-Image', 'Googlebot-Video', 'Googlebot', 'Bingbot', 'Applebot-Extended', 'Applebot', 'DuckAssistBot', 'CCBot', 'cohere-ai',
  'meta-externalagent', 'Bytespider', 'Amazonbot'] as const;
export const AI_REFERRER_HOSTS: Record<string, string> = {
  'chatgpt.com': 'chatgpt.com', 'chat.openai.com': 'chatgpt.com', 'openai.com': 'chatgpt.com', 'perplexity.ai': 'perplexity.ai',
  'gemini.google.com': 'gemini.google.com', 'bard.google.com': 'gemini.google.com', 'copilot.microsoft.com': 'copilot.microsoft.com', 'claude.ai': 'claude.ai',
  'you.com': 'you.com', 'poe.com': 'poe.com', 'meta.ai': 'meta.ai', 'grok.com': 'grok.com', 'x.ai': 'grok.com',
};
const AI_UTM: Record<string, string> = { 'chatgpt.com': 'chatgpt.com', chatgpt: 'chatgpt.com', perplexity: 'perplexity.ai', 'perplexity.ai': 'perplexity.ai', gemini: 'gemini.google.com', copilot: 'copilot.microsoft.com', claude: 'claude.ai' };
const SEARCH_RULES: Array<[RegExp, string]> = [[/(^|.)google.[a-z.]{2,6}$/, 'google'], [/(^|.)bing.com$/, 'bing'], [/(^|.)duckduckgo.com$/, 'duckduckgo'], [/(^|.)yahoo.[a-z.]{2,6}$/, 'yahoo'],
  [/(^|.)yandex.[a-z.]{2,6}$/, 'yandex'], [/(^|.)ecosia.org$/, 'ecosia'], [/(^|.)baidu.com$/, 'baidu']];
// Accepted agent labels per kind (anything else is normalized to "other", never rejected).
const AI_REFERRAL_AGENTS = [...Object.keys(AI_REFERRER_HOSTS), ...Object.values(AI_REFERRER_HOSTS), 'duckduckgo.com', 'bing.com'];
const AGENTS_BY_KIND: Record<SignalKind, Map<string, string>> = {
  ai_bot_hit: new Map(AI_BOT_AGENTS.map(a => [a.toLowerCase(), a])),
  ai_referral: new Map(AI_REFERRAL_AGENTS.map(a => [a, a])),
  search_referral: new Map(SEARCH_RULES.map(([, a]) => [a, a])),
  human_pageview: new Map(),
  cta_click: new Map(CTA_AGENTS.map(a => [a, a])),
};
export function normalizeAgent(kind: SignalKind, raw: unknown): string {
  return AGENTS_BY_KIND[kind].get(String(raw ?? '').trim().toLowerCase()) ?? 'other';
}

/** Bot name when the User-Agent belongs to a known AI crawler; the UA itself is never stored. */
export function classifyUserAgent(ua: string | null | undefined): string | null {
  const lower = String(ua || '').toLowerCase();
  if (!lower) return null;
  return AI_BOT_AGENTS.find(bot => lower.includes(bot.toLowerCase())) ?? null;
}
/** Same table as the browser snippet: referrer and/or utm_source -> {kind, agent}. */
export function classifyReferrer(referrer: string | null | undefined, utmSource?: string | null): { kind: 'ai_referral' | 'search_referral'; agent: string } | null {
  const utm = String(utmSource || '').toLowerCase().trim();
  if (AI_UTM[utm]) return { kind: 'ai_referral', agent: AI_UTM[utm] };
  let url: URL;
  try { url = new URL(String(referrer || '')); } catch { return null; }
  const host = url.hostname.toLowerCase();
  const bare = host.replace(/^www\./, '');
  if (AI_REFERRER_HOSTS[bare]) return { kind: 'ai_referral', agent: AI_REFERRER_HOSTS[bare] };
  if (bare === 'duckduckgo.com' && url.searchParams.get('ia') === 'chat') return { kind: 'ai_referral', agent: 'duckduckgo.com' };
  if (bare === 'bing.com' && /^\/(chat|copilot)/.test(url.pathname)) return { kind: 'ai_referral', agent: 'copilot.microsoft.com' };
  for (const [re, agent] of SEARCH_RULES) if (re.test(host)) return { kind: 'search_referral', agent };
  return null;
}

// -- crypto ---------------------------------------------------------------------
const encoder = new TextEncoder();
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(data: string | Uint8Array) {
  return toHex(await crypto.subtle.digest('SHA-256', (typeof data === 'string' ? encoder.encode(data) : data) as BufferSource));
}
export async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}
/** Constant-time comparison: always walks the longer input; length mismatch only flips the result. */
export function timingSafeEqual(a: string, b: string) {
  const x = encoder.encode(a), y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
export async function computeSignature(secret: string, timestamp: string, nonce: string, rawBody: Uint8Array | string) {
  return hmacSha256Hex(secret, `${timestamp}\n${nonce}\n${await sha256Hex(rawBody)}`);
}
export type VerifyResult = { ok: true } | { ok: false; reason: 'bad_timestamp' | 'skew' | 'bad_nonce' | 'bad_signature' };
export async function verifySignature(p: { secret: string; timestamp: string; nonce: string; signature: string; rawBody: Uint8Array | string; nowSeconds: number }): Promise<VerifyResult> {
  if (!/^\d{9,12}$/.test(p.timestamp)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(p.nowSeconds - Number(p.timestamp)) > MAX_SKEW_SECONDS) return { ok: false, reason: 'skew' };
  if (p.nonce.length < 16 || p.nonce.length > 128) return { ok: false, reason: 'bad_nonce' };
  const expected = await computeSignature(p.secret, p.timestamp, p.nonce, p.rawBody);
  return timingSafeEqual(expected, p.signature.trim().toLowerCase()) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

// -- validation -------------------------------------------------------------------
const isRealDay = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
/** Path without query/hash, starting with "/", <= 200 chars. */
export function sanitizePath(raw: unknown): string {
  const p = String(raw ?? '').split('#')[0].split('?')[0].trim();
  if (!p) return '/';
  return (p.startsWith('/') ? p : `/${p}`).slice(0, 200);
}
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/i;

export type ServerBatch = { site_host: string; batch_id: string; events: SignalEvent[]; dropped: number };
export function parseServerBatch(rawBody: string): { ok: true; batch: ServerBatch } | { ok: false; error: string } {
  let body: { site_host?: unknown; batch_id?: unknown; events?: unknown };
  try { body = JSON.parse(rawBody); } catch { return { ok: false, error: 'json_invalid' }; }
  if (!body || typeof body !== 'object') return { ok: false, error: 'json_invalid' };
  const siteHost = String(body.site_host ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (!HOST_RE.test(siteHost)) return { ok: false, error: 'site_host_invalid' };
  const batchId = String(body.batch_id ?? '');
  if (!/^[A-Za-z0-9_:.-]{8,100}$/.test(batchId)) return { ok: false, error: 'batch_id_invalid' };
  if (!Array.isArray(body.events) || body.events.length === 0) return { ok: false, error: 'events_required' };
  if (body.events.length > MAX_EVENTS) return { ok: false, error: 'too_many_events' };
  const events: SignalEvent[] = []; let dropped = 0;
  for (const e of body.events as Array<Record<string, unknown>>) {
    const hits = Number(e?.hits);
    if (!e || !isRealDay(e.day) || !(SERVER_KINDS as readonly string[]).includes(e.kind as string) || !Number.isInteger(hits) || hits < 1) { dropped++; continue; }
    events.push({ site_host: siteHost, day: e.day, kind: e.kind as SignalKind, agent: normalizeAgent(e.kind as SignalKind, e.agent), path: sanitizePath(e.path), hits: Math.min(hits, MAX_HITS) });
  }
  if (!events.length) return { ok: false, error: 'no_valid_events' };
  return { ok: true, batch: { site_host: siteHost, batch_id: batchId, events, dropped } };
}
export function parseBrowserEvent(rawBody: string): { ok: true; siteId: string; kind: typeof BROWSER_KINDS[number]; agent: string; path: string } | { ok: false; error: string } {
  let body: { site_id?: unknown; kind?: unknown; agent?: unknown; path?: unknown };
  try { body = JSON.parse(rawBody); } catch { return { ok: false, error: 'json_invalid' }; }
  if (!body || typeof body !== 'object') return { ok: false, error: 'json_invalid' };
  const siteId = String(body.site_id ?? '');
  if (!/^[a-z0-9]{12}$/.test(siteId)) return { ok: false, error: 'site_id_invalid' };
  if (!(BROWSER_KINDS as readonly string[]).includes(body.kind as string)) return { ok: false, error: 'kind_invalid' };
  return { ok: true, siteId, kind: body.kind as typeof BROWSER_KINDS[number], agent: normalizeAgent(body.kind as SignalKind, body.agent), path: sanitizePath(body.path) };
}

const originHost = (origin: string) => { try { return new URL(origin).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
/** allowed list wins; with an empty list only the project's own host is accepted. */
export function isOriginAllowed(origin: string, allowed: string[], projectHost: string) {
  if (!origin) return false;
  let canonical: string; try { canonical = new URL(origin).origin; } catch { return false; }
  if (allowed.length) return allowed.some(a => { try { return new URL(a).origin === canonical; } catch { return false; } });
  return !!projectHost && originHost(canonical) === projectHost.toLowerCase().replace(/^www\./, '');
}

// -- request handler ----------------------------------------------------------------
export interface SignalsDeps {
  now(): number; // epoch ms
  lookupSite(siteId: string): Promise<{ allowed_origins: string[]; project_host: string } | null>;
  getSecret(siteId: string): Promise<string | null>;
  /** batchId null = browser beacon (no dedupe). */
  record(siteId: string, batchId: string | null, events: SignalEvent[]): Promise<{ duplicate: boolean; accepted: number }>;
}
const baseHeaders = { 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { ...baseHeaders, ...extra } });
const corsFor = (origin: string) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });

async function readBody(req: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > limit) return null;
  const bytes = new Uint8Array(await req.arrayBuffer());
  return bytes.byteLength > limit ? null : bytes;
}

export async function handleSignalsRequest(req: Request, deps: SignalsDeps): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: origin ? corsFor(origin) : {} }); // actual POST enforces the allow-list
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const type = (req.headers.get('content-type') || '').toLowerCase();
  const signature = req.headers.get('x-zica-signature');

  if (signature) { // server mode
    if (!type.includes('application/json')) return json({ error: 'unsupported_media_type' }, 415);
    const bytes = await readBody(req, MAX_SERVER_BODY);
    if (!bytes) return json({ error: 'payload_too_large' }, 413);
    const siteId = req.headers.get('x-zica-site') || '', timestamp = req.headers.get('x-zica-timestamp') || '', nonce = req.headers.get('x-zica-nonce') || '';
    if (!/^[a-z0-9]{12}$/.test(siteId) || !timestamp || !nonce) return json({ error: 'signature_invalid' }, 401);
    const nowSeconds = Math.floor(deps.now() / 1000);
    if (/^\d{9,12}$/.test(timestamp) && Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) return json({ error: 'timestamp_skew' }, 409);
    const secret = await deps.getSecret(siteId);
    // Unknown site and wrong signature are indistinguishable to the caller.
    if (!secret) return json({ error: 'signature_invalid' }, 401);
    const verdict = await verifySignature({ secret, timestamp, nonce, signature, rawBody: bytes, nowSeconds });
    if (verdict.ok === false) return verdict.reason === 'skew' ? json({ error: 'timestamp_skew' }, 409) : json({ error: 'signature_invalid' }, 401);
    const parsed = parseServerBatch(new TextDecoder().decode(bytes));
    if (parsed.ok === false) return json({ error: parsed.error }, 400);
    const result = await deps.record(siteId, parsed.batch.batch_id, parsed.batch.events);
    return json({ accepted: result.accepted, duplicate: result.duplicate, dropped: parsed.batch.dropped });
  }

  // browser mode
  if (!type.includes('application/json') && !type.includes('text/plain')) return json({ error: 'unsupported_media_type' }, 415);
  const bytes = await readBody(req, MAX_BROWSER_BODY);
  if (!bytes) return json({ error: 'payload_too_large' }, 413);
  const event = parseBrowserEvent(new TextDecoder().decode(bytes));
  if (event.ok === false) return json({ error: event.error }, 400);
  const site = origin ? await deps.lookupSite(event.siteId) : null;
  if (!site || !isOriginAllowed(origin, site.allowed_origins, site.project_host)) return json({ error: 'origin_not_allowed' }, 403);
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  await deps.record(event.siteId, null, [{ site_host: originHost(origin), day, kind: event.kind, agent: event.agent, path: event.path, hits: 1 }]);
  return new Response(null, { status: 204, headers: corsFor(origin) });
}
