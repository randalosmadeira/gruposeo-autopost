/**
 * NEXUS · Motores & APIs — núcleo de provedores (bloco A1, 12/11/2026).
 * Catálogo do servidor, validação de formato de credencial, testes de saúde (URLs fixas + allowlist),
 * leitura de quota, status/pontuação e portão de execução paga.
 *
 * Regras de segurança deste módulo:
 *  - nenhum segredo é devolvido, registrado ou concatenado em `detail` (mensagens são fixas; há `redact` como cinto);
 *  - só URLs fixas da allowlist abaixo; nunca URL vinda do cliente; `redirect: 'manual'` sempre;
 *  - o `fetch` é injetado (`providerFetch` no runtime, fixtures nos testes): nenhum teste chama a rede.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { gscListSites } from './nexus-gsc.ts';

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
/** Provedores com credencial (mesma lista do `check` do banco). */
export const PROVIDER_IDS = ['gsc', 'bing_webmaster', 'serper', 'dataforseo', 'serpapi', 'brave', 'openai', 'gemini', 'anthropic', 'perplexity'] as const;
export type ProviderId = typeof PROVIDER_IDS[number];
/** Catálogo completo exibido no módulo: os 10 provedores + o manual (Copilot). */
export const CATALOG_IDS = [...PROVIDER_IDS, 'copilot'] as const;
export type CatalogId = typeof CATALOG_IDS[number];
export type ProviderCategory = 'search_truth' | 'serp' | 'ai_citations' | 'manual';

/** Testes gratuitos (rodam sem confirmação de custo). Ordem estável. */
export const FREE_HEALTH_PROVIDERS = ['gsc', 'bing_webmaster', 'dataforseo', 'serpapi', 'openai', 'gemini', 'anthropic'] as const;
/** Testes com custo: só com `provider` explícito + `confirmCost: true`. */
export const COST_HEALTH_PROVIDERS = ['serper', 'brave', 'perplexity'] as const;

export type ProviderInfo = { id: CatalogId; name: string; category: ProviderCategory; health_cost: 'free' | 'paid' | 'none'; test_cost_micros: number };
export const PROVIDER_CATALOG: Record<CatalogId, ProviderInfo> = {
  gsc: { id: 'gsc', name: 'Google Search Console API', category: 'search_truth', health_cost: 'free', test_cost_micros: 0 },
  bing_webmaster: { id: 'bing_webmaster', name: 'Bing Webmaster Tools API', category: 'search_truth', health_cost: 'free', test_cost_micros: 0 },
  serper: { id: 'serper', name: 'Serper', category: 'serp', health_cost: 'paid', test_cost_micros: 1000 },
  dataforseo: { id: 'dataforseo', name: 'DataForSEO SERP API', category: 'serp', health_cost: 'free', test_cost_micros: 0 },
  serpapi: { id: 'serpapi', name: 'SerpApi', category: 'serp', health_cost: 'free', test_cost_micros: 0 },
  brave: { id: 'brave', name: 'Brave Search API', category: 'serp', health_cost: 'paid', test_cost_micros: 5000 },
  openai: { id: 'openai', name: 'OpenAI Responses + web_search', category: 'ai_citations', health_cost: 'free', test_cost_micros: 0 },
  gemini: { id: 'gemini', name: 'Gemini API + Grounding com Google Search', category: 'ai_citations', health_cost: 'free', test_cost_micros: 0 },
  anthropic: { id: 'anthropic', name: 'Anthropic Messages + web_search', category: 'ai_citations', health_cost: 'free', test_cost_micros: 0 },
  perplexity: { id: 'perplexity', name: 'Perplexity Search API', category: 'ai_citations', health_cost: 'paid', test_cost_micros: 5000 },
  copilot: { id: 'copilot', name: 'Microsoft Copilot (manual)', category: 'manual', health_cost: 'none', test_cost_micros: 0 },
};
export const isProviderId = (v: unknown): v is ProviderId => typeof v === 'string' && (PROVIDER_IDS as readonly string[]).includes(v);
export const isCatalogId = (v: unknown): v is CatalogId => typeof v === 'string' && (CATALOG_IDS as readonly string[]).includes(v);

// ---------------------------------------------------------------------------
// Validação de formato da credencial (mensagem `secret_format_invalid:<dica>`)
// ---------------------------------------------------------------------------
export const MAX_SECRET_LENGTH = 4096;
export type FormatResult = { ok: true; secret: string } | { ok: false; hint: string };
export const secretFormatError = (hint: string) => `secret_format_invalid:${hint}`;

const PRINTABLE_TOKEN = /^[\x21-\x7E]{16,400}$/;
const PLAIN_KEY = /^[A-Za-z0-9_-]{16,200}$/;

/** Valida (e normaliza: `trim`; JSON compacto no `gsc`) a credencial colada pelo usuário. Nunca ecoa o valor. */
export function validateCredentialFormat(provider: string, raw: unknown): FormatResult {
  if (typeof raw !== 'string') return { ok: false, hint: 'vazio' };
  if (raw.length > MAX_SECRET_LENGTH) return { ok: false, hint: 'tamanho_maximo_4096' };
  const secret = raw.trim();
  if (!secret) return { ok: false, hint: 'vazio' };
  switch (provider) {
    case 'openai':
      if (!secret.startsWith('sk-') || secret.startsWith('sk-ant-') || !PRINTABLE_TOKEN.test(secret)) return { ok: false, hint: 'prefixo_sk-' };
      return { ok: true, secret };
    case 'anthropic':
      if (!secret.startsWith('sk-ant-') || !PRINTABLE_TOKEN.test(secret)) return { ok: false, hint: 'prefixo_sk-ant-' };
      return { ok: true, secret };
    case 'gemini':
      if (!secret.startsWith('AIza') || !PRINTABLE_TOKEN.test(secret)) return { ok: false, hint: 'prefixo_AIza' };
      return { ok: true, secret };
    case 'perplexity':
      if (!secret.startsWith('pplx-') || !PRINTABLE_TOKEN.test(secret)) return { ok: false, hint: 'prefixo_pplx-' };
      return { ok: true, secret };
    case 'serper':
    case 'serpapi':
    case 'bing_webmaster':
    case 'brave':
      if (!PLAIN_KEY.test(secret)) return { ok: false, hint: 'chave_16_a_200_caracteres_letras_numeros_hifen_sublinhado' };
      return { ok: true, secret };
    case 'dataforseo': {
      const parts = secret.split(':');
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return { ok: false, hint: 'formato_login_dois_pontos_senha' };
      return { ok: true, secret };
    }
    case 'gsc': {
      let parsed: unknown;
      try { parsed = JSON.parse(secret); } catch { return { ok: false, hint: 'json_invalido' }; }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, hint: 'json_invalido' };
      const o = parsed as Record<string, unknown>;
      if (o.type !== 'service_account') return { ok: false, hint: 'json_deve_ser_conta_de_servico' };
      if (typeof o.client_email !== 'string' || !o.client_email.includes('@')) return { ok: false, hint: 'client_email_ausente' };
      if (typeof o.private_key !== 'string' || !o.private_key.startsWith('-----BEGIN PRIVATE KEY-----')) return { ok: false, hint: 'private_key_ausente' };
      const compact = JSON.stringify(parsed);
      if (compact.length > MAX_SECRET_LENGTH) return { ok: false, hint: 'tamanho_maximo_4096' };
      return { ok: true, secret: compact };
    }
    default:
      return { ok: false, hint: 'provedor_nao_suportado' };
  }
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------
export type ProviderQuota = { label: string; remaining: number | null; limit: number | null; reset_at?: string };

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const lastNumber = (header: string | null): number | null => {
  if (!header) return null;
  const parts = header.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length ? num(parts[parts.length - 1]) : null;
};

/** DataForSEO `user_data`: saldo em `money.balance` (US$); limite = `money.total` quando coerente (>= saldo e > 0). */
export function readDataForSeoQuota(json: unknown): ProviderQuota | null {
  const body = json as { tasks?: Array<{ result?: Array<{ money?: { balance?: unknown; total?: unknown } }> }> } | null;
  const money = body?.tasks?.[0]?.result?.[0]?.money;
  const balance = num(money?.balance);
  if (balance === null) return null;
  const total = num(money?.total);
  return { label: 'Saldo (US$)', remaining: Math.round(balance * 10000) / 10000, limit: total !== null && total > 0 && total >= balance ? Math.round(total * 10000) / 10000 : null };
}

/** SerpApi `account.json`: `plan_searches_left` (ou `total_searches_left`) e `searches_per_month`. */
export function readSerpApiQuota(json: unknown): ProviderQuota | null {
  const b = json as Record<string, unknown> | null;
  const remaining = num(b?.plan_searches_left) ?? num(b?.total_searches_left);
  if (remaining === null) return null;
  return { label: 'Buscas restantes no plano', remaining, limit: num(b?.searches_per_month) };
}

/** Brave: `X-RateLimit-*` vêm como lista por janela ("1, 15000"); a última é a janela maior (mensal). */
export function readBraveQuota(headers: Headers, nowMs: number): ProviderQuota | null {
  const remaining = lastNumber(headers.get('x-ratelimit-remaining'));
  if (remaining === null) return null;
  const q: ProviderQuota = { label: 'Requisições restantes no período', remaining, limit: lastNumber(headers.get('x-ratelimit-limit')) };
  const reset = lastNumber(headers.get('x-ratelimit-reset'));
  if (reset !== null && reset >= 0) q.reset_at = new Date(nowMs + reset * 1000).toISOString();
  return q;
}

// ---------------------------------------------------------------------------
// Testes de saúde
// ---------------------------------------------------------------------------
export const HEALTH_TIMEOUT_MS = 15_000;
/** Hosts que os testes de saúde podem contatar (os URLs completos são montados abaixo, nunca vêm do cliente). */
export const HEALTH_ALLOWED_HOSTS: readonly string[] = [
  'oauth2.googleapis.com', 'www.googleapis.com', 'searchconsole.googleapis.com', 'ssl.bing.com', 'google.serper.dev', 'api.dataforseo.com',
  'serpapi.com', 'api.search.brave.com', 'api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com', 'api.perplexity.ai',
];
export function isAllowedHealthUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && HEALTH_ALLOWED_HOSTS.includes(u.hostname);
  } catch { return false; }
}

export type HealthResult = {
  provider: string;
  ok: boolean;
  skipped?: 'not_configured' | 'manual' | 'cost_confirmation_required';
  latency_ms?: number;
  http_status?: number;
  detail?: string;
  quota?: ProviderQuota | null;
  cost_micros: number;
  /** true quando o provedor recusou a credencial (HTTP 401/403 ou equivalente no corpo): o status vira `invalid`. */
  credential_invalid?: boolean;
};

type Outcome = { ok: boolean; http_status?: number; detail: string; quota?: ProviderQuota | null; credential_invalid?: boolean };
class HealthTimeout extends Error { constructor() { super('health_timeout'); } }

/** Remove do texto qualquer pedaço do segredo (cinto de segurança; as mensagens já são fixas). */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 4) out = out.split(s).join('***');
  }
  return out;
}

function classifyHttp(status: number): Outcome {
  if (status === 401 || status === 403) return { ok: false, http_status: status, detail: `Credencial recusada pelo provedor (HTTP ${status})`, credential_invalid: true };
  if (status === 429) return { ok: false, http_status: status, detail: 'Limite de requisições do provedor atingido (HTTP 429)' };
  if (status === 402) return { ok: false, http_status: status, detail: 'Saldo ou plano insuficiente no provedor (HTTP 402)' };
  if (status >= 500) return { ok: false, http_status: status, detail: `Provedor indisponível no momento (HTTP ${status})` };
  if (status >= 300 && status < 400) return { ok: false, http_status: status, detail: `Provedor respondeu com redirecionamento (HTTP ${status})` };
  return { ok: false, http_status: status, detail: `Provedor respondeu HTTP ${status}` };
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return null; }
}
async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 2000); } catch { return ''; }
}

function basicAuth(secret: string): string {
  const bytes = new TextEncoder().encode(secret);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `Basic ${btoa(bin)}`;
}

type Probe = {
  cost_micros: number;
  build: (secret: string) => { url: string; init: RequestInit };
  read: (res: Response, nowMs: number) => Promise<Outcome>;
};
const okModels = async (res: Response): Promise<Outcome> => res.ok
  ? { ok: true, http_status: res.status, detail: `Conexão válida (HTTP ${res.status})` }
  : classifyHttp(res.status);

/** Definições fixas dos testes (exceto `gsc`, que usa o assinador JWT do módulo `nexus-gsc.ts`). */
export const HEALTH_PROBES: Record<Exclude<ProviderId, 'gsc'>, Probe> = {
  bing_webmaster: {
    cost_micros: 0,
    build: (s) => ({ url: `https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=${encodeURIComponent(s)}`, init: { method: 'GET', headers: { Accept: 'application/json' } } }),
    async read(res) {
      const json = await safeJson(res);
      const body = json as { d?: unknown; ErrorCode?: unknown; Message?: unknown } | null;
      if (!res.ok) {
        const msg = typeof body?.Message === 'string' ? body.Message : '';
        if (/invalid.?api.?key|not.?authorized/i.test(msg) || body?.ErrorCode === 3 || body?.ErrorCode === 14) {
          return { ok: false, http_status: res.status, detail: `Chave recusada pelo Bing Webmaster (HTTP ${res.status})`, credential_invalid: true };
        }
        return classifyHttp(res.status);
      }
      if (body && Array.isArray(body.d)) return { ok: true, http_status: res.status, detail: `Conexão válida: ${body.d.length} site(s) no Bing Webmaster` };
      return { ok: false, http_status: res.status, detail: 'Resposta inesperada do Bing Webmaster (campo "d" ausente); a API já teve instabilidades' };
    },
  },
  serper: {
    cost_micros: 1000,
    build: (s) => ({ url: 'https://google.serper.dev/search', init: { method: 'POST', headers: { 'X-API-KEY': s, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'zica health', num: 1 }) } }),
    read: okModels,
  },
  dataforseo: {
    cost_micros: 0,
    build: (s) => ({ url: 'https://api.dataforseo.com/v3/appendix/user_data', init: { method: 'GET', headers: { Authorization: basicAuth(s), Accept: 'application/json' } } }),
    async read(res) {
      if (!res.ok) return classifyHttp(res.status);
      const json = await safeJson(res);
      const code = num((json as { status_code?: unknown } | null)?.status_code);
      if (code !== 20000) {
        if (code !== null && code >= 40100 && code < 40200) return { ok: false, http_status: 401, detail: `Credencial recusada pelo DataForSEO (código ${code})`, credential_invalid: true };
        if (code !== null && code >= 40200 && code < 40300) return { ok: false, http_status: 402, detail: `Saldo insuficiente no DataForSEO (código ${code})` };
        return { ok: false, http_status: res.status, detail: code === null ? 'Resposta inesperada do DataForSEO' : `DataForSEO respondeu com código ${code}` };
      }
      return { ok: true, http_status: res.status, detail: 'Conexão válida (saldo consultado)', quota: readDataForSeoQuota(json) };
    },
  },
  serpapi: {
    cost_micros: 0,
    build: (s) => ({ url: `https://serpapi.com/account.json?api_key=${encodeURIComponent(s)}`, init: { method: 'GET', headers: { Accept: 'application/json' } } }),
    async read(res) {
      if (!res.ok) return classifyHttp(res.status);
      const json = await safeJson(res);
      if ((json as { error?: unknown } | null)?.error) return { ok: false, http_status: res.status, detail: 'SerpApi recusou a consulta da conta' };
      return { ok: true, http_status: res.status, detail: 'Conexão válida (plano consultado)', quota: readSerpApiQuota(json) };
    },
  },
  brave: {
    cost_micros: 5000,
    build: (s) => ({ url: 'https://api.search.brave.com/res/v1/web/search?q=zica&count=1', init: { method: 'GET', headers: { 'X-Subscription-Token': s, Accept: 'application/json' } } }),
    async read(res, nowMs) {
      if (!res.ok) {
        // A Brave responde 422 (não 401) para token inválido.
        if (res.status === 422 && /SUBSCRIPTION_TOKEN_INVALID/.test(await safeText(res))) {
          return { ok: false, http_status: 422, detail: 'Token recusado pela Brave (HTTP 422)', credential_invalid: true };
        }
        return classifyHttp(res.status);
      }
      return { ok: true, http_status: res.status, detail: `Conexão válida (HTTP ${res.status})`, quota: readBraveQuota(res.headers, nowMs) };
    },
  },
  openai: {
    cost_micros: 0,
    build: (s) => ({ url: 'https://api.openai.com/v1/models', init: { method: 'GET', headers: { Authorization: `Bearer ${s}` } } }),
    read: okModels,
  },
  gemini: {
    cost_micros: 0,
    build: (s) => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', init: { method: 'GET', headers: { 'x-goog-api-key': s } } }),
    async read(res) {
      if (res.ok) return { ok: true, http_status: res.status, detail: `Conexão válida (HTTP ${res.status})` };
      // O Gemini responde 400 (não 401) para chave inválida.
      if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(await safeText(res))) {
        return { ok: false, http_status: 400, detail: 'Chave recusada pelo Gemini (HTTP 400)', credential_invalid: true };
      }
      return classifyHttp(res.status);
    },
  },
  anthropic: {
    cost_micros: 0,
    build: (s) => ({ url: 'https://api.anthropic.com/v1/models?limit=1', init: { method: 'GET', headers: { 'x-api-key': s, 'anthropic-version': '2023-06-01' } } }),
    read: okModels,
  },
  perplexity: {
    cost_micros: 5000,
    build: (s) => ({ url: 'https://api.perplexity.ai/search', init: { method: 'POST', headers: { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'zica', max_results: 1 }) } }),
    read: okModels,
  },
};

/** `fetch` restrito: só HTTPS na allowlist, sem redirecionamento automático, preso ao sinal de timeout do teste. */
function guardedFetch(fetchFn: typeof fetch, signal: AbortSignal): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!isAllowedHealthUrl(url)) return Promise.reject(new Error('url_not_allowed'));
    return fetchFn(input, { ...init, redirect: 'manual', signal });
  }) as typeof fetch;
}

/** Executa o teste de saúde de um provedor com a credencial dada. Nunca lança: devolve `ok:false` com mensagem fixa. */
export async function runProviderHealthCheck(provider: ProviderId, secret: string, fetchFn: typeof fetch, opts: { timeoutMs?: number; nowMs?: number; gscList?: typeof gscListSites } = {}): Promise<HealthResult> {
  const timeoutMs = opts.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const nowMs = opts.nowMs ?? Date.now();
  const costMicros = PROVIDER_CATALOG[provider].test_cost_micros;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const aborted = new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new HealthTimeout()), { once: true }));
  const started = performance.now();
  const f = guardedFetch(fetchFn, ctrl.signal);
  const work = async (): Promise<Outcome> => {
    if (provider === 'gsc') {
      const r = await (opts.gscList ?? gscListSites)(f, secret);
      if (r.ok) {
        const n = r.sites.length;
        return { ok: true, http_status: 200, detail: n > 0 ? `Conexão válida: ${n} propriedade(s) acessível(is) no Search Console` : 'Credencial válida, mas a conta de serviço ainda não tem acesso a nenhuma propriedade do Search Console' };
      }
      if (r.status === 403) return { ok: false, http_status: 403, detail: 'Acesso negado: ative a Search Console API no projeto do Google Cloud (HTTP 403)', credential_invalid: true };
      if (r.status === 400 || r.status === 401) return { ok: false, http_status: r.status, detail: `Conta de serviço recusada pelo Google (HTTP ${r.status})`, credential_invalid: true };
      return classifyHttp(r.status);
    }
    const probe = HEALTH_PROBES[provider];
    const { url, init } = probe.build(secret);
    const res = await f(url, init);
    return await probe.read(res, nowMs);
  };
  try {
    const out = await Promise.race([work(), aborted]);
    const latency = Math.round(performance.now() - started);
    const result: HealthResult = {
      provider, ok: out.ok, latency_ms: latency, http_status: out.http_status,
      detail: redact(out.detail, secretParts(secret)).slice(0, 300),
      quota: out.quota ?? null,
      cost_micros: out.http_status !== undefined && out.http_status >= 200 && out.http_status < 300 ? costMicros : 0,
    };
    if (out.credential_invalid) result.credential_invalid = true;
    return result;
  } catch (e) {
    const latency = Math.round(performance.now() - started);
    const detail = e instanceof HealthTimeout ? `Tempo esgotado (${timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`})`
      : e instanceof Error && e.message === 'url_not_allowed' ? 'Endereço fora da lista permitida'
      : 'Falha de rede ao consultar o provedor';
    return { provider, ok: false, latency_ms: latency, detail, quota: null, cost_micros: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function secretParts(secret: string): string[] {
  const parts = [secret];
  if (secret.includes(':')) parts.push(...secret.split(':'));
  return parts;
}

type CredentialRow = { provider: string; status: string | null };
const TESTABLE_STATUSES = ['stored_unverified', 'active', 'invalid'];

/**
 * Roda testes de saúde de uma organização e grava o histórico (`nexus_provider_health`) e o status da credencial.
 * Sem `providers`: todos os provedores configurados com teste GRATUITO (sem entradas para os não configurados).
 * Com `providers` explícito: cada um devolve resultado (`skipped` quando não configurado/manual/sem confirmação de custo).
 * Nunca lança por falha de provedor; falhas de gravação são ignoradas (resultado ainda é devolvido).
 */
export async function runHealthChecks(
  admin: SupabaseClient,
  opts: { organizationId: string; triggeredBy: string | null; providers?: string[]; confirmCost?: boolean; fetchFn: typeof fetch; timeoutMs?: number },
): Promise<HealthResult[]> {
  const explicit = Array.isArray(opts.providers) && opts.providers.length > 0;
  const targets = explicit ? [...new Set(opts.providers!)].filter(isCatalogId) : [...FREE_HEALTH_PROVIDERS];
  const { data: rows } = await admin.from('organization_provider_credentials').select('provider,status').eq('organization_id', opts.organizationId);
  const credentials = new Map<string, CredentialRow>(((rows || []) as CredentialRow[]).map((r) => [r.provider, r]));
  const results: HealthResult[] = [];
  const jobs: Promise<void>[] = [];
  const slots: Array<HealthResult | null> = targets.map(() => null);

  targets.forEach((provider, index) => {
    if (provider === 'copilot') { slots[index] = { provider, ok: false, skipped: 'manual', cost_micros: 0 }; return; }
    const cred = credentials.get(provider);
    const configured = !!cred && TESTABLE_STATUSES.includes(String(cred.status));
    if (!configured) { slots[index] = explicit ? { provider, ok: false, skipped: 'not_configured', cost_micros: 0 } : null; return; }
    if (PROVIDER_CATALOG[provider].health_cost === 'paid' && opts.confirmCost !== true) {
      slots[index] = { provider, ok: false, skipped: 'cost_confirmation_required', cost_micros: 0 };
      return;
    }
    jobs.push((async () => {
      const { data: secret, error } = await admin.rpc('nexus_provider_secret_read', { p_org: opts.organizationId, p_provider: provider });
      if (error || typeof secret !== 'string' || !secret) { slots[index] = { provider, ok: false, skipped: 'not_configured', cost_micros: 0 }; return; }
      const result = await runProviderHealthCheck(provider as ProviderId, secret, opts.fetchFn, { timeoutMs: opts.timeoutMs });
      slots[index] = result;
      try {
        await admin.from('nexus_provider_health').insert({
          organization_id: opts.organizationId, provider, ok: result.ok, latency_ms: result.latency_ms ?? null, http_status: result.http_status ?? null,
          detail: (result.detail || '').slice(0, 300), quota: result.quota ?? null, cost_micros: result.cost_micros, triggered_by: opts.triggeredBy,
        });
        const nextStatus = result.ok ? 'active' : result.credential_invalid ? 'invalid' : null;
        if (nextStatus && nextStatus !== cred!.status) {
          await admin.from('organization_provider_credentials').update({ status: nextStatus }).eq('organization_id', opts.organizationId).eq('provider', provider).in('status', TESTABLE_STATUSES);
        }
      } catch { /* o histórico é auxiliar: não derruba o teste */ }
    })());
  });
  await Promise.all(jobs);
  for (const slot of slots) if (slot) results.push(slot);
  return results;
}

// ---------------------------------------------------------------------------
// Status, pontuação e resumo
// ---------------------------------------------------------------------------
export type ProviderStatus = 'not_configured' | 'stored_unverified' | 'healthy' | 'degraded' | 'error' | 'manual';
export const HEALTH_FRESH_MS = 24 * 3600_000;
export const HEALTH_STALE_MS = 72 * 3600_000;
export const LATENCY_DEGRADED_MS = 4000;
export const QUOTA_LOW_RATIO = 0.10;
export const SUCCESS_RATE_MIN = 0.8;

export type HealthSnapshot = { checked_at: string; ok: boolean; latency_ms: number | null; http_status?: number | null; detail?: string | null; quota?: Partial<ProviderQuota> | null; cost_micros?: number | null };

const ts = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};
export function quotaRatio(quota: Partial<ProviderQuota> | null | undefined): number | null {
  const remaining = num(quota?.remaining), limit = num(quota?.limit);
  if (remaining === null || limit === null || limit <= 0) return null;
  return remaining / limit;
}

export function computeProviderStatus(input: {
  manual?: boolean; stored: boolean; credentialUpdatedAt?: string | null; last: HealthSnapshot | null; checks7d: number; ok7d: number; nowMs?: number;
}): ProviderStatus {
  if (input.manual) return 'manual';
  if (!input.stored) return 'not_configured';
  const now = input.nowMs ?? Date.now();
  let last = input.last;
  // Teste anterior à troca da chave não vale para a chave atual.
  const changed = ts(input.credentialUpdatedAt), checked = last ? ts(last.checked_at) : null;
  if (last && changed !== null && checked !== null && checked < changed) last = null;
  if (!last) return 'stored_unverified';
  if (!last.ok) return 'error';
  const age = checked === null ? Infinity : now - checked;
  const ratio = quotaRatio(last.quota);
  if (age >= HEALTH_FRESH_MS) return 'degraded';
  if ((last.latency_ms ?? 0) > LATENCY_DEGRADED_MS) return 'degraded';
  if (ratio !== null && ratio < QUOTA_LOW_RATIO) return 'degraded';
  if (input.checks7d > 0 && input.ok7d / input.checks7d < SUCCESS_RATE_MIN) return 'degraded';
  return 'healthy';
}

export function computeProviderScore(input: {
  manual?: boolean; stored: boolean; checks7d: number; ok7d: number; valid30d: number; failed30d: number; uncertain30d: number;
  lastCheckedAt: string | null; lastLatencyMs: number | null; nowMs?: number;
}): number | null {
  if (input.manual || !input.stored) return null;
  const now = input.nowMs ?? Date.now();
  const rate7 = input.checks7d > 0 ? Math.min(1, input.ok7d / input.checks7d) : 0;
  const ops = input.valid30d + input.failed30d + input.uncertain30d;
  const part7 = ops > 0 ? 40 * rate7 + 30 * (input.valid30d / ops) : 70 * rate7;
  const checked = ts(input.lastCheckedAt);
  const age = checked === null ? Infinity : now - checked;
  const fresh = age < HEALTH_FRESH_MS ? 1 : age < HEALTH_STALE_MS ? 0.5 : 0;
  const l = input.lastLatencyMs;
  const lat = l === null || l === undefined ? 0 : l <= 1500 ? 1 : l >= 6000 ? 0 : (6000 - l) / 4500;
  return Math.round(Math.max(0, Math.min(100, part7 + 20 * fresh + 10 * lat)));
}

export type OverviewProvider = {
  id: string; category: ProviderCategory; status: ProviderStatus; score: number | null; enabled: boolean;
  credential: { stored: boolean; last_four: string | null; status: string | null; updated_at: string | null };
  health: { last: HealthSnapshot | null; checks_7d: number; ok_7d: number; avg_latency_ms_7d: number | null };
  usage: { valid_30d: number; failed_30d: number; uncertain_30d: number; last_success_at: string | null };
};
export type OverviewSummary = { total: number; connected: number; healthy: number; degraded: number; error: number; not_configured: number; manual: number; overall: 'empty' | 'ok' | 'attention' | 'critical'; score: number | null };

export function summarizeProviders(providers: Array<Pick<OverviewProvider, 'status' | 'score'>>): OverviewSummary {
  const count = (s: ProviderStatus) => providers.filter((p) => p.status === s).length;
  const connectedList = providers.filter((p) => p.status !== 'not_configured' && p.status !== 'manual');
  const healthy = count('healthy'), degraded = count('degraded'), error = count('error');
  const overall = connectedList.length === 0 ? 'empty' : error > 0 && healthy === 0 ? 'critical' : error > 0 || degraded > 0 ? 'attention' : 'ok';
  const scores = connectedList.map((p) => p.score).filter((s): s is number => typeof s === 'number');
  return {
    total: providers.length, connected: connectedList.length, healthy, degraded, error, not_configured: count('not_configured'), manual: count('manual'),
    overall, score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  };
}

type RawOverview = {
  providers?: Array<{
    provider: string;
    credential?: { stored?: boolean; last_four?: string | null; status?: string | null; updated_at?: string | null };
    last_health?: HealthSnapshot | null; checks_7d?: number; ok_7d?: number; avg_latency_ms_7d?: number | null;
    usage?: { valid_30d?: number; failed_30d?: number; uncertain_30d?: number; last_success_at?: string | null };
  }>;
  program?: { execution_enabled?: boolean; budget_usd_micros?: number | string; reserved_usd_micros?: number | string; consumed_usd_micros?: number | string; settings?: Record<string, unknown> | null } | null;
};

export function providersEnabledFrom(settings: Record<string, unknown> | null | undefined): string[] {
  const v = settings?.providers_enabled;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && isProviderId(x)) : [];
}

/** Monta a resposta de `providers_overview` a partir do jsonb do RPC `nexus_providers_overview`. */
export function buildProvidersOverview(raw: RawOverview | null | undefined, organizationId: string, nowMs: number = Date.now()) {
  const enabled = providersEnabledFrom(raw?.program?.settings);
  const byId = new Map((raw?.providers || []).map((p) => [p.provider, p]));
  const providers: OverviewProvider[] = CATALOG_IDS.map((id) => {
    const r = byId.get(id);
    const manual = PROVIDER_CATALOG[id].category === 'manual';
    const credStatus = r?.credential?.status ?? null;
    const stored = !manual && !!r?.credential?.stored && !!credStatus && TESTABLE_STATUSES.includes(credStatus);
    const last = r?.last_health ?? null;
    const checks7d = Number(r?.checks_7d || 0), ok7d = Number(r?.ok_7d || 0);
    const usage = { valid_30d: Number(r?.usage?.valid_30d || 0), failed_30d: Number(r?.usage?.failed_30d || 0), uncertain_30d: Number(r?.usage?.uncertain_30d || 0), last_success_at: r?.usage?.last_success_at ?? null };
    const status = computeProviderStatus({ manual, stored, credentialUpdatedAt: r?.credential?.updated_at ?? null, last, checks7d, ok7d, nowMs });
    const score = computeProviderScore({ manual, stored, checks7d, ok7d, valid30d: usage.valid_30d, failed30d: usage.failed_30d, uncertain30d: usage.uncertain_30d, lastCheckedAt: last?.checked_at ?? null, lastLatencyMs: last?.latency_ms ?? null, nowMs });
    return {
      id, category: PROVIDER_CATALOG[id].category, status, score, enabled: enabled.includes(id),
      credential: { stored, last_four: stored ? r?.credential?.last_four ?? null : null, status: stored ? credStatus : null, updated_at: stored ? r?.credential?.updated_at ?? null : null },
      health: { last, checks_7d: checks7d, ok_7d: ok7d, avg_latency_ms_7d: r?.avg_latency_ms_7d ?? null },
      usage,
    };
  });
  const p = raw?.program;
  return {
    generated_at: new Date(nowMs).toISOString(),
    organization_id: organizationId,
    program: {
      execution_enabled: p?.execution_enabled === true,
      budget_usd_micros: Number(p?.budget_usd_micros || 0),
      reserved_usd_micros: Number(p?.reserved_usd_micros || 0),
      consumed_usd_micros: Number(p?.consumed_usd_micros || 0),
      providers_enabled: enabled,
    },
    summary: summarizeProviders(providers),
    providers,
  };
}

// ---------------------------------------------------------------------------
// Portão de execução paga (por organização). Ligado só com programa ligado + orçamento + provedor habilitado.
// ---------------------------------------------------------------------------
export function executionGate(
  program: { execution_enabled?: boolean | null; budget_usd_micros?: number | string | null; settings?: Record<string, unknown> | null } | null | undefined,
  provider: string,
): null | { error: 'budget_paused' | 'provider_not_enabled' } {
  if (!program || program.execution_enabled !== true || !(Number(program.budget_usd_micros) > 0)) return { error: 'budget_paused' };
  if (!providersEnabledFrom(program.settings).includes(provider)) return { error: 'provider_not_enabled' };
  return null;
}

/** Valida a entrada de `execution_settings_set`. `connected` = provedores com credencial guardada. */
export function validateExecutionSettings(
  input: { executionEnabled?: unknown; budgetUsd?: unknown; providersEnabled?: unknown; confirm?: unknown },
  connected: readonly string[],
): { ok: true; value: { executionEnabled: boolean; budgetUsdMicros: number; providersEnabled: string[] } } | { ok: false; error: string } {
  if (typeof input.executionEnabled !== 'boolean') return { ok: false, error: 'execution_enabled_required' };
  const budget = typeof input.budgetUsd === 'number' ? input.budgetUsd : NaN;
  if (!Number.isFinite(budget) || budget < 0 || budget > 200) return { ok: false, error: 'budget_out_of_range' };
  if (input.providersEnabled !== undefined && !Array.isArray(input.providersEnabled)) return { ok: false, error: 'providers_invalid' };
  const requested = [...new Set((Array.isArray(input.providersEnabled) ? input.providersEnabled : []).filter((p): p is string => typeof p === 'string'))];
  if (input.executionEnabled && requested.some((p) => !isProviderId(p))) return { ok: false, error: 'provider_not_supported' };
  const allowed = requested.filter((p) => isProviderId(p) && connected.includes(p));
  if (input.executionEnabled) {
    if (allowed.length !== requested.length) return { ok: false, error: 'provider_not_connected' };
    if (input.confirm !== 'LIBERAR') return { ok: false, error: 'confirm_required' };
    if (!(budget > 0)) return { ok: false, error: 'budget_required' };
    if (allowed.length < 1) return { ok: false, error: 'provider_required' };
  }
  return { ok: true, value: { executionEnabled: input.executionEnabled, budgetUsdMicros: Math.round(budget * 1_000_000), providersEnabled: allowed } };
}
