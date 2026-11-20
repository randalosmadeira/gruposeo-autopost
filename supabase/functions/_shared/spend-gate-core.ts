/**
 * Núcleo puro do Teto Diário de Gasto (sem rede, sem banco, sem Deno): tipos, regra de decisão, estados, preços, classificação de
 * chamadas pagas, estimativa de custo e mensagens em português. Tudo em micros de dólar (1 US$ = 1.000.000), a unidade que o provedor
 * cobra e que organization_usage_ledger já registra (metric 'cost_usd_micros').
 *
 * Decisão do dono (20/11/2026): teto de US$ 7,00 por dia; crédito adicional de até US$ 2,20 (teto absoluto US$ 9,20); dia em
 * America/Sao_Paulo; aviso aos 80%. A regra de decideReserve() é a MESMA de private.spend_reserve() na migração
 * 20261120400000_teto_diario_gasto.sql (o banco é quem decide de verdade, sob lock por organização; este espelho serve aos testes
 * e às mensagens). Nenhum preço daqui é fato verificado: tudo 'verified: false' até o dono conferir na tabela do provedor.
 */

export const SPEND_TZ = 'America/Sao_Paulo';
export const DEFAULT_CAP_MICROS = 7_000_000;
export const DEFAULT_EXTRA_MICROS = 2_200_000;
/** Trava fixa: nenhuma política gravada, nenhum botão e nenhuma estimativa pode permitir gasto acima disso em um dia. */
export const ABSOLUTE_HARD_MAX_MICROS = 9_200_000;
export const DEFAULT_ALERT_PCT = 80;
export const RESERVATION_TTL_MS = 15 * 60 * 1000;

export type SpendState = 'livre' | 'aviso' | 'teto_atingido' | 'adicional_liberado' | 'esgotado';

export interface SpendNumbers {
  spent: number;
  reserved: number;
  cap: number;
  extra: number;
  extraUnlocked: boolean;
  alertPct?: number;
}

/** Limite absoluto efetivo do dia: teto + adicional, nunca acima da trava fixa. */
export const absoluteLimit = (cap: number, extra: number) => Math.min(cap + extra, ABSOLUTE_HARD_MAX_MICROS);

export function computeState(n: SpendNumbers): SpendState {
  const used = n.spent + n.reserved;
  if (used >= absoluteLimit(n.cap, n.extra)) return 'esgotado';
  if (used >= n.cap) return n.extraUnlocked ? 'adicional_liberado' : 'teto_atingido';
  const pct = n.alertPct ?? DEFAULT_ALERT_PCT;
  if (n.cap > 0 && used * 100 >= n.cap * pct) return 'aviso';
  return 'livre';
}

export interface ReserveInput extends SpendNumbers {
  estimate: number;
  /** operação já iniciada hoje (mesma operation_key já reservada) */
  started: boolean;
  enabled?: boolean;
}
export type ReserveDecision =
  | { allow: true; limit: number; state: SpendState }
  | { allow: false; code: 'daily_cap_reached' | 'spend_paused'; reason: 'cap' | 'absolute_cap' | 'paused'; limit: number; state: SpendState };

/** Espelho de private.spend_reserve. Operação nova: até o teto. Iniciada ou com o adicional liberado no dia: até o absoluto. Nunca além. */
export function decideReserve(i: ReserveInput): ReserveDecision {
  const abs = absoluteLimit(i.cap, i.extra);
  const used = i.spent + i.reserved;
  const state = computeState(i);
  if (i.enabled === false) return { allow: false, code: 'spend_paused', reason: 'paused', limit: 0, state };
  const limit = i.started || i.extraUnlocked ? abs : Math.min(i.cap, abs);
  if (used + i.estimate > limit) {
    return { allow: false, code: 'daily_cap_reached', reason: used + i.estimate > abs ? 'absolute_cap' : 'cap', limit, state };
  }
  return { allow: true, limit, state: computeState({ ...i, reserved: i.reserved + i.estimate }) };
}

// ---------- tempo ----------

/** Dia civil (AAAA-MM-DD) no fuso informado. Reinicia à meia-noite de Brasília. */
export function dayKey(nowMs: number, tz: string = SPEND_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
}

// ---------- formatação e mensagens ----------

export const usd = (micros: number) => micros / 1_000_000;
export function formatUsd(micros: number): string {
  const v = usd(micros);
  const digits = micros > 0 && micros < 10_000 ? 4 : 2;
  return `US$ ${v.toFixed(digits).replace('.', ',')}`;
}
export function formatBrl(micros: number, fx: number): string {
  return `R$ ${(usd(micros) * fx).toFixed(2).replace('.', ',')}`;
}

export interface DenyFacts {
  code: 'daily_cap_reached' | 'spend_paused' | 'spend_status_unavailable' | 'spend_org_unresolved' | 'spend_scope_missing' | 'spend_provider_unpriced';
  reason?: string;
  spent?: number;
  reserved?: number;
  cap?: number;
  extra?: number;
  extraUnlocked?: boolean;
}

/** Mensagem em português para o 423. Sempre diz o gasto e o teto quando há leitura confiável. */
export function denyMessage(f: DenyFacts): string {
  const used = (f.spent ?? 0) + (f.reserved ?? 0);
  const cap = f.cap ?? DEFAULT_CAP_MICROS;
  const extra = f.extra ?? DEFAULT_EXTRA_MICROS;
  switch (f.code) {
    case 'daily_cap_reached':
      if (f.reason === 'absolute_cap') {
        return `Teto diário de gasto com IA atingido: ${formatUsd(used)} gastos hoje, e o limite absoluto é ${formatUsd(absoluteLimit(cap, extra))} (teto de ${formatUsd(cap)} mais o crédito adicional de ${formatUsd(extra)}). Nada novo é executado até a meia-noite de Brasília.`;
      }
      return f.extraUnlocked
        ? `Teto diário de gasto com IA atingido: ${formatUsd(used)} gastos hoje de ${formatUsd(cap)} (crédito adicional já liberado, limite ${formatUsd(absoluteLimit(cap, extra))}). Esta operação não cabe no que resta; nada foi executado.`
        : `Teto diário de gasto com IA atingido: ${formatUsd(used)} gastos hoje de ${formatUsd(cap)}. Nenhuma operação nova começa até a meia-noite de Brasília. O dono ou administrador pode liberar o crédito adicional de até ${formatUsd(extra)}.`;
    case 'spend_paused':
      return 'As operações pagas desta organização estão pausadas pelo dono. Nada foi executado.';
    case 'spend_status_unavailable':
      return 'Não consegui confirmar o gasto de hoje. Por segurança, nenhuma chamada paga foi feita. Tente de novo em instantes.';
    case 'spend_org_unresolved':
      return 'Não consegui identificar de qual organização é este gasto. Por segurança, nenhuma chamada paga foi feita. Abra o projeto e tente de novo.';
    case 'spend_scope_missing':
      return 'Esta operação paga não passou pelo controle de gasto. Por segurança, nada foi executado.';
    case 'spend_provider_unpriced':
      return 'Este serviço pago ainda não tem preço cadastrado para estimar o gasto. Por segurança, nada foi executado.';
  }
}

// ---------- preços e estimativa ----------

export interface TextPrice { inMicrosPerM: number; outMicrosPerM: number; verified: boolean; note?: string }
export interface UnitPrice { micros: number; verified: boolean; note?: string }
export interface PriceBook {
  text: Record<string, TextPrice>;
  textFallback: TextPrice;
  /** chave `${provider}:${route}` (ex.: 'openai:images', 'serper:search') */
  units: Record<string, UnitPrice>;
}

const NV = 'não verificado';
const t = (i: number, o: number, note: string): TextPrice => ({ inMicrosPerM: i, outMicrosPerM: o, verified: false, note });
const u = (micros: number, note: string): UnitPrice => ({ micros, verified: false, note });

/** Preços padrão (espelham o seed da migração). NENHUM é verificado. Valores de imagem/busca são placeholders conservadores do projeto. */
export const DEFAULT_PRICE_BOOK: PriceBook = {
  text: {
    'gpt-4.1': t(2_000_000, 8_000_000, 'model_pricing_catalog, aproximado'),
    'gpt-4o': t(2_500_000, 10_000_000, 'model_pricing_catalog, aproximado'),
    'gpt-4o-mini': t(150_000, 600_000, 'model_pricing_catalog, aproximado'),
    'gpt-4.1-mini': t(400_000, 1_600_000, `estimativa do projeto, ${NV}`),
    'gpt-5-mini': t(300_000, 1_250_000, `token-logger (2025), ${NV}`),
    'claude-sonnet-4-5-20250929': t(3_000_000, 15_000_000, 'model_pricing_catalog, aproximado'),
    'claude-haiku-4-5-20251001': t(1_000_000, 5_000_000, 'model_pricing_catalog, aproximado'),
    'gemini-2.0-flash': t(100_000, 400_000, `token-logger (2025), ${NV}`),
    'gemini-2.5-flash': t(300_000, 2_500_000, `estimativa do projeto, ${NV}`),
    'gemini-2.5-pro': t(1_250_000, 10_000_000, `token-logger (2025), ${NV}`),
  },
  textFallback: t(5_000_000, 20_000_000, `modelo desconhecido: valor conservador do projeto, ${NV}`),
  units: {
    'openai:images': u(250_000, `gpt-image-2: placeholder conservador do projeto, ${NV}`),
    'gemini:images': u(40_000, `token-logger (Imagen), ${NV}`),
    'serper:search': u(2_000, `placeholder conservador do projeto, ${NV}`),
    'dataforseo:task': u(10_000, `placeholder conservador do projeto, ${NV}`),
    'brave:search': u(10_000, `placeholder conservador do projeto, ${NV}`),
    'serpapi:search': u(15_000, `placeholder conservador do projeto, ${NV}`),
    'perplexity:search': u(10_000, `placeholder conservador do projeto, ${NV}`),
  },
};

export interface PriceRow { provider: string; route: string; unit: string; usd_micros_per_unit: number | string; verified?: boolean; source_note?: string | null }

/** Junta o que veio de provider_price_table por cima dos padrões. Linha inválida é ignorada (padrão conservador continua valendo). */
export function priceBookFromRows(rows: unknown): PriceBook {
  const book: PriceBook = { text: { ...DEFAULT_PRICE_BOOK.text }, textFallback: { ...DEFAULT_PRICE_BOOK.textFallback }, units: { ...DEFAULT_PRICE_BOOK.units } };
  if (!Array.isArray(rows)) return book;
  const partial: Record<string, Partial<TextPrice>> = {};
  for (const raw of rows as PriceRow[]) {
    const micros = Number(raw?.usd_micros_per_unit);
    if (!raw || typeof raw.provider !== 'string' || typeof raw.route !== 'string' || !Number.isFinite(micros) || micros < 0) continue;
    const verified = raw.verified === true;
    const note = raw.source_note || undefined;
    if (raw.unit === 'million_input_tokens' || raw.unit === 'million_output_tokens') {
      const key = raw.route === 'text_fallback' ? '__fallback__' : raw.route;
      const p = (partial[key] ||= {});
      if (raw.unit === 'million_input_tokens') p.inMicrosPerM = micros; else p.outMicrosPerM = micros;
      p.verified = (p.verified ?? true) && verified;
      p.note = note;
    } else if (['image', 'search', 'task'].includes(raw.unit)) {
      book.units[`${raw.provider}:${raw.unit === 'image' ? 'images' : raw.unit}`] = { micros, verified, note };
    }
  }
  for (const [key, p] of Object.entries(partial)) {
    if (p.inMicrosPerM === undefined || p.outMicrosPerM === undefined) continue;
    const price: TextPrice = { inMicrosPerM: p.inMicrosPerM, outMicrosPerM: p.outMicrosPerM, verified: p.verified === true, note: p.note };
    if (key === '__fallback__') book.textFallback = price; else book.text[key] = price;
  }
  return book;
}

/** Preço do modelo; nome com sufixo de data ('gpt-4.1-mini-2025-04-14') usa o prefixo mais longo conhecido; desconhecido = conservador. */
export function textPriceFor(book: PriceBook, model: string | undefined): TextPrice & { fallback: boolean } {
  const m = String(model || '').toLowerCase();
  if (m && book.text[m]) return { ...book.text[m], fallback: false };
  const prefix = Object.keys(book.text).filter((k) => m.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (prefix) return { ...book.text[prefix], fallback: false };
  return { ...book.textFallback, fallback: true };
}

/** Custo de tokens. Preço em micros por milhão de tokens => micros por token = preço / 1e6. */
export const textCostMicros = (p: TextPrice, inputTokens: number, outputTokens: number) =>
  Math.ceil((Math.max(0, inputTokens) * p.inMicrosPerM + Math.max(0, outputTokens) * p.outMicrosPerM) / 1_000_000);

/** Estimativa de teto máximo de uma chamada de texto: entrada ~ caracteres/3 (conservador para português) + saída = máximo pedido. */
export function estimateTextMicros(book: PriceBook, models: string[], inputChars: number, maxOutputTokens: number): number {
  const inTokens = Math.ceil(Math.max(0, inputChars) / 3);
  const costs = (models.length ? models : [undefined]).map((m) => textCostMicros(textPriceFor(book, m), inTokens, maxOutputTokens));
  return Math.max(...costs);
}

// ---------- classificação de chamadas pagas ----------

export type PaidProvider = 'openai' | 'anthropic' | 'gemini' | 'serper' | 'dataforseo' | 'brave' | 'serpapi' | 'perplexity';
export type PaidRoute = 'text' | 'image' | 'search' | 'task';
export interface RequestClass {
  /** false = não é serviço pago medido pelo gate (leitura pública, nosso Supabase, Google gratuito, listagem de modelos) */
  billable: boolean;
  provider?: PaidProvider;
  route?: PaidRoute;
  model?: string;
  /** host de provedor pago conhecido pela trava antiga, mas sem preço cadastrado: o gate nega (falha fechada) */
  unknown?: boolean;
  host: string;
}

const UNKNOWN_PAID_HOST = /(^|\.)(tavily\.com|exa\.ai|firecrawl\.dev|rapidapi\.com|apify\.com|scrapingbee\.com|scraperapi\.com|replicate\.com|fal\.ai|fal\.run|openrouter\.ai|deepseek\.com|mistral\.ai|cohere\.com|x\.ai|groq\.com|together\.xyz)$/i;

export function classifyRequest(url: string, method: string, bodyText?: string): RequestClass {
  let u: URL;
  try { u = new URL(url); } catch { return { billable: false, host: '' }; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const get = method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD';
  const free = { billable: false, host };
  const body = parseJson(bodyText);
  switch (host) {
    case 'api.openai.com':
      if (get && /^\/v1\/models/.test(path)) return free;
      if (/^\/v1\/images\//.test(path)) return { billable: true, provider: 'openai', route: 'image', model: str(body?.model), host };
      if (/^\/v1\/(responses|chat\/completions|completions)$/.test(path)) return { billable: true, provider: 'openai', route: 'text', model: str(body?.model), host };
      return { billable: true, unknown: true, provider: 'openai', host };
    case 'api.anthropic.com':
      if (get && /^\/v1\/models/.test(path)) return free;
      if (/^\/v1\/messages\/count_tokens$/.test(path)) return free;
      if (/^\/v1\/messages$/.test(path)) return { billable: true, provider: 'anthropic', route: 'text', model: str(body?.model), host };
      return { billable: true, unknown: true, provider: 'anthropic', host };
    case 'generativelanguage.googleapis.com': {
      if (get && /\/models\/?$/.test(path)) return free;
      const m = /\/models\/([^/:]+):(generateContent|streamGenerateContent|predict|embedContent|batchEmbedContents)$/.exec(path);
      if (!m) return get ? free : { billable: true, unknown: true, provider: 'gemini', host };
      const image = /imagen|image/i.test(m[1]) || m[2] === 'predict';
      return { billable: true, provider: 'gemini', route: image ? 'image' : 'text', model: m[1], host };
    }
    case 'google.serper.dev':
      return { billable: true, provider: 'serper', route: 'search', host };
    case 'api.search.brave.com':
      return { billable: true, provider: 'brave', route: 'search', host };
    case 'serpapi.com':
      return /^\/account\.json$/.test(path) ? free : { billable: true, provider: 'serpapi', route: 'search', host };
    case 'api.dataforseo.com':
      return /^\/v3\/appendix\//.test(path) ? free : { billable: true, provider: 'dataforseo', route: 'task', host };
    case 'api.perplexity.ai':
      return /^\/search$/.test(path) ? { billable: true, provider: 'perplexity', route: 'search', host } : { billable: true, unknown: true, provider: 'perplexity', host };
    default:
      if (UNKNOWN_PAID_HOST.test(host)) return { billable: true, unknown: true, host };
      return free;
  }
}

const parseJson = (s?: string): Record<string, unknown> | null => {
  if (!s || s[0] !== '{') return null;
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v as Record<string, unknown> : null; } catch { return null; }
};
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

export interface RequestEstimate { micros: number; verified: boolean; note?: string; model?: string; stream: boolean }

/** Estimativa de teto de uma chamada paga arbitrária (usada quando a chamada não passou por um grant do AIOrchestrator). */
export function estimateRequest(cls: RequestClass, bodyText: string | undefined, book: PriceBook, url = ''): RequestEstimate {
  const body = parseJson(bodyText);
  const stream = body?.stream === true || /streamGenerateContent/.test(url);
  if (cls.route === 'text') {
    const gen = (body?.generationConfig as Record<string, unknown> | undefined) || {};
    const maxOut = num(body?.max_output_tokens) ?? num(body?.max_tokens) ?? num(body?.max_completion_tokens) ?? num(gen.maxOutputTokens) ?? 16384;
    const models = cls.model === 'gpt-4.1' ? ['gpt-4.1', 'gpt-4o'] : [cls.model || ''];
    const price = textPriceFor(book, cls.model);
    return { micros: estimateTextMicros(book, models, (bodyText || '').length, maxOut), verified: price.verified, note: price.note, model: cls.model, stream };
  }
  const unit = book.units[`${cls.provider}:${cls.route === 'image' ? 'images' : cls.route}`];
  if (!unit) return { micros: 0, verified: false, model: cls.model, stream };
  let count = 1;
  if (cls.route === 'image') count = Math.max(1, Math.min(10, Math.floor(num(body?.n) ?? 1)));
  if (cls.route === 'task') { try { const a = JSON.parse(bodyText || 'null'); if (Array.isArray(a)) count = Math.max(1, a.length); } catch { /* uma tarefa */ } }
  return { micros: unit.micros * count, verified: unit.verified, note: unit.note, model: cls.model, stream };
}

/** Uso real informado na resposta do provedor (texto). null = não deu para ler (usa-se a estimativa, marcada como estimada). */
export function extractUsage(provider: PaidProvider | undefined, json: unknown): { inputTokens: number; outputTokens: number } | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  if (provider === 'gemini') {
    const i = n(j.usageMetadata?.promptTokenCount); const o = n(j.usageMetadata?.candidatesTokenCount);
    return i === null || o === null ? null : { inputTokens: i, outputTokens: o };
  }
  const i = n(j.usage?.input_tokens) ?? n(j.usage?.prompt_tokens);
  const o = n(j.usage?.output_tokens) ?? n(j.usage?.completion_tokens);
  return i === null || o === null ? null : { inputTokens: i, outputTokens: o };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Pistas de identidade no corpo da requisição (só UUIDs válidos). Quem decide se valem é o banco (spend_resolve_org confere o vínculo). */
export function extractBodyHints(bodyText: string | undefined): { projectId?: string; articleId?: string; userId?: string } {
  const body = parseJson(bodyText);
  if (!body) return {};
  const pick = (...keys: string[]) => { for (const k of keys) if (isUuid(body[k])) return body[k] as string; return undefined; };
  return { projectId: pick('projectId', 'project_id'), articleId: pick('articleId', 'article_id'), userId: pick('userId', 'user_id') };
}

/** Rótulo do módulo a partir do caminho da função de borda (/functions/v1/generate-image -> generate-image). */
export function moduleFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'desconhecido';
  } catch { return 'desconhecido'; }
}

// ---------- mapa de medição (documentação executável) ----------

/** Quais rotas o ledger mede sozinho e quais entram por estimativa. Usado no relatório e nos testes. */
export const METERING_MAP: ReadonlyArray<{ route: string; metered: 'ledger' | 'estimativa'; how: string }> = [
  { route: 'AIOrchestrator (OpenAI/Claude/Gemini texto)', metered: 'ledger', how: 'token_usage_logs -> gatilhos -> ledger; o gate só reserva e confirma sem duplicar' },
  { route: 'Texto direto (gemini.ts, gbp-audit, generate-content-variations, rdm-manual-*, profile-agent, nexus-observe/intelligence)', metered: 'ledger', how: 'o gate lê o uso real da resposta (tokens) e grava no ledger com metadata.source=spend_gate; se não conseguir ler, estimativa' },
  { route: 'Imagem (OpenAI images, Imagen/Gemini)', metered: 'estimativa', how: 'preço por imagem da provider_price_table (não verificado)' },
  { route: 'Busca (Serper, Brave, SerpAPI, Perplexity) e tarefas DataForSEO', metered: 'estimativa', how: 'preço por busca/tarefa da provider_price_table (não verificado)' },
  { route: 'Streaming de texto', metered: 'estimativa', how: 'uso real não chega a tempo: confirma-se o valor estimado' },
];
