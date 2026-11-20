/**
 * Teto Diário de Gasto: o portão (gate), o contexto por requisição e o fetch guardado.
 *
 * Como funciona (resumo; detalhes em PROJETO-ZICA-ROTEIRO-MESTRE-2026-11-15/14-teto-diario-gasto-ia-2026-11-20.md):
 *  - toda chamada paga RESERVA o valor estimado no banco (private.spend_reserve, atômico, sob lock por organização) antes de sair;
 *  - depois da chamada CONFIRMA com o custo real (ou estimado) ou DEVOLVE a reserva se não houve chamada;
 *  - sem leitura confiável do gasto = FALHA FECHADA: a chamada paga é negada;
 *  - o contexto da requisição (AsyncLocalStorage) guarda quem está pagando; NÃO existe estado global compartilhado entre requisições.
 *
 * Este arquivo NÃO decide se o teto está ligado: quem decide é a constante PAID_SERVICES_BLOCKED em nexus-spend-lock.ts. Com a constante
 * true nada daqui roda (o bloqueio total antigo continua idêntico). Este módulo não importa o nexus-spend-lock (evita ciclo).
 */
import {
  DEFAULT_PRICE_BOOK, classifyRequest, denyMessage, estimateRequest, estimateTextMicros, extractBodyHints, extractUsage, isUuid, moduleFromUrl,
  priceBookFromRows, textCostMicros, textPriceFor, type DenyFacts, type PaidProvider, type PriceBook,
} from './spend-gate-core.ts';

export interface SpendAdmin {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export type DenyCode = DenyFacts['code'];
export interface DenyInfo {
  code: DenyCode;
  facts: DenyFacts;
  message: string;
  httpStatus: number;
  retryable: boolean;
  /** números do dia quando o banco respondeu (micros) */
  spend?: { spent: number; reserved: number; cap: number; extra: number; extraUnlocked: boolean; state?: string };
}

export class SpendDeniedError extends Error {
  constructor(public info: DenyInfo) { super(info.code); this.name = 'SpendDeniedError'; }
}

export type GateResult =
  | { allowed: true; reservationId: string; duplicate: boolean; state?: string }
  | ({ allowed: false } & DenyInfo);

export interface GateContext {
  module: string;
  operation?: string;
  /** chave da operação (artigo, correlação ou requisição): reservas da mesma chave no dia contam como operação já iniciada */
  operationKey?: string;
  projectId?: string | null;
  articleId?: string | null;
  userId?: string | null;
  provider?: string;
  model?: string;
  route?: string;
  started?: boolean;
}

const RETRYABLE: DenyCode[] = ['spend_status_unavailable'];
const denyInfo = (facts: DenyFacts, httpStatus = 423): DenyInfo => ({
  code: facts.code, facts, message: denyMessage(facts), httpStatus, retryable: RETRYABLE.includes(facts.code),
  spend: facts.cap === undefined ? undefined : {
    spent: facts.spent ?? 0, reserved: facts.reserved ?? 0, cap: facts.cap, extra: facts.extra ?? 0, extraUnlocked: !!facts.extraUnlocked,
  },
});
export const denied = (code: DenyCode, extra: Partial<DenyFacts> = {}) => denyInfo({ code, ...extra });

/** AbortSignal.timeout não existe em todo ambiente (ex.: jsdom): sem ele a chamada segue sem prazo próprio. */
const timeoutSignal = (ms: number): AbortSignal | undefined => (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined);
const asObj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const nz = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** Reserva o valor. Qualquer falha de leitura/validação vira NEGAÇÃO (falha fechada). */
export async function gate(admin: SpendAdmin | null, orgId: string, estimateMicros: number, ctx: GateContext, idempotencyKey?: string): Promise<GateResult> {
  const unavailable = () => ({ allowed: false as const, ...denied('spend_status_unavailable') });
  if (!admin || !isUuid(orgId) || !Number.isFinite(estimateMicros) || estimateMicros < 0) return unavailable();
  const clean = (v?: string | null) => (isUuid(v) ? v : undefined);
  const context = {
    module: ctx.module, operation: ctx.operation || ctx.module, operation_key: ctx.operationKey, project_id: clean(ctx.projectId),
    article_id: clean(ctx.articleId), user_id: clean(ctx.userId), provider: ctx.provider, model: ctx.model, route: ctx.route,
  };
  try {
    const { data, error } = await admin.rpc('spend_reserve', {
      p_org: orgId, p_estimate_usd_micros: Math.ceil(estimateMicros), p_idempotency_key: idempotencyKey || `spend-${crypto.randomUUID()}`,
      p_context: context, p_started_job: !!ctx.started,
    });
    const r = asObj(data);
    if (error || !r || typeof r.allowed !== 'boolean') return unavailable();
    if (r.allowed) {
      if (typeof r.reservation_id !== 'string' || !r.reservation_id) return unavailable();
      return { allowed: true, reservationId: r.reservation_id, duplicate: r.duplicate === true, state: typeof r.state === 'string' ? r.state : undefined };
    }
    const code = r.code === 'spend_paused' ? 'spend_paused' : 'daily_cap_reached';
    return {
      allowed: false,
      ...denyInfo({
        code, reason: String(r.reason || ''), spent: nz(r.spent), reserved: nz(r.reserved), cap: nz(r.cap), extra: nz(r.extra), extraUnlocked: r.extra_unlocked === true,
      }),
      spend: { spent: nz(r.spent), reserved: nz(r.reserved), cap: nz(r.cap), extra: nz(r.extra), extraUnlocked: r.extra_unlocked === true, state: typeof r.state === 'string' ? r.state : undefined },
    };
  } catch {
    return unavailable();
  }
}

/** Confirma o gasto. Nunca lança: falha vira log sem dados sensíveis (a reserva continua contando até expirar). */
export async function commitSpend(admin: SpendAdmin | null, reservationId: string, actualMicros: number, opts: { recordLedger: boolean; estimated: boolean; priceVerified?: boolean }): Promise<boolean> {
  if (!admin) return false;
  try {
    const { error } = await admin.rpc('spend_commit', {
      p_reservation: reservationId, p_actual_usd_micros: Math.max(0, Math.ceil(actualMicros)), p_record_ledger: opts.recordLedger,
      p_meta: { estimated: opts.estimated, price_verified: opts.priceVerified === true },
    });
    if (error) { console.error('[spend-gate] commit_failed'); return false; }
    return true;
  } catch { console.error('[spend-gate] commit_failed'); return false; }
}

export async function releaseSpend(admin: SpendAdmin | null, reservationId: string): Promise<void> {
  if (!admin) return;
  try { await admin.rpc('spend_release', { p_reservation: reservationId }); } catch { console.error('[spend-gate] release_failed'); }
}

/** Corpo e resposta 423 padronizados (mesmas chaves da trava antiga: success/error/code/executed/retryable). */
export function spendDeniedBody(info: DenyInfo) {
  return { success: false, error: info.message, code: info.code, executed: false, retryable: info.retryable, spend: info.spend ?? null };
}
export function spendDeniedResponse(info: DenyInfo, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', 'application/json');
  if (!headers.has('Access-Control-Allow-Origin')) headers.set('Access-Control-Allow-Origin', '*');
  if (!headers.has('Access-Control-Allow-Headers')) headers.set('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(spendDeniedBody(info)), { status: info.httpStatus, headers });
}

// ---------- contexto por requisição (sem estado global compartilhado) ----------

export interface SpendIdentity { userId?: string; projectId?: string; articleId?: string }
export interface SpendScope {
  id: string;
  module: string;
  admin: SpendAdmin | null;
  now: () => number;
  userId?: string;
  orgId?: string;
  /** organização fixada por quem a conhece: mudanças de usuário/projeto não a invalidam */
  orgPinned?: boolean;
  projectId?: string;
  articleId?: string;
  correlationId?: string;
  /** leitura preguiçosa da identidade da requisição (token verificado + pistas do corpo); só roda se faltar organização */
  resolveIdentity?: () => Promise<SpendIdentity>;
  /** última negação desta requisição (o invólucro troca a resposta de erro pelo 423) */
  denied: DenyInfo | null;
  /** teto já atingido nesta requisição: as próximas chamadas pagas são negadas sem ir ao banco (nada de laço de tentativas) */
  capReached: DenyInfo | null;
  prices?: PriceBook;
}

// AsyncLocalStorage (node:async_hooks) carregado sem derrubar o boot: se o runtime não oferecer, o contexto nunca existe e toda chamada paga é
// NEGADA (spend_scope_missing). Falha fechada, nunca passagem silenciosa.
interface Store<T> { getStore(): T | undefined; run<R>(value: T, fn: () => R): R }
let AlsCtor: (new <T>() => Store<T>) | null = null;
try { AlsCtor = (await import('node:async_hooks')).AsyncLocalStorage as unknown as new <T>() => Store<T>; } catch { AlsCtor = null; }
const makeStore = <T>(): Store<T> => (AlsCtor ? new AlsCtor<T>() : { getStore: () => undefined, run: (_v, fn) => fn() });
const scopeStore = makeStore<SpendScope>();
interface Grant { provider: string; calls: number; reservationId: string }
const grantStore = makeStore<Grant>();

export const currentSpendScope = (): SpendScope | undefined => scopeStore.getStore();
export const runWithSpendScope = <T>(scope: SpendScope, fn: () => T): T => scopeStore.run(scope, fn);
/** Funções que já autenticaram o usuário/projeto informam aqui (no-op sem contexto, por exemplo nos testes antigos). */
export function bindSpendIdentity(identity: SpendIdentity & { correlationId?: string; orgId?: string }): void {
  const s = scopeStore.getStore();
  if (!s) return;
  if (isUuid(identity.orgId)) {
    // organização informada de forma explícita por quem já a conhece (rodada em lote por organização, função de organização fixa)
    if (s.orgId !== identity.orgId) { s.capReached = null; s.denied = null; }
    s.orgId = identity.orgId;
    s.orgPinned = true;
  } else {
    let changed = false;
    for (const key of ['userId', 'projectId', 'articleId'] as const) {
      const v = identity[key];
      if (!isUuid(v) || s[key] === v) continue;
      if (s[key] !== undefined) changed = true;
      s[key] = v;
    }
    // outro usuário/projeto/artigo na mesma requisição (lote): a organização em cache deixa de valer e o estado de teto recomeça
    if (changed && !s.orgPinned) { s.orgId = undefined; s.capReached = null; s.denied = null; }
  }
  if (identity.correlationId) s.correlationId = identity.correlationId;
}
export const spendCapReached = (): boolean => !!scopeStore.getStore()?.capReached;
export function currentSpendOrgId(): string | undefined { return scopeStore.getStore()?.orgId; }

export function newSpendScope(init: Partial<SpendScope> & { module: string }): SpendScope {
  return { id: crypto.randomUUID(), admin: null, now: () => Date.now(), denied: null, capReached: null, ...init };
}

// ---------- preços (cache curto por processo; só leitura de tabela pública de preços, não é estado de requisição) ----------

let priceCache: { at: number; book: PriceBook } | null = null;
export const resetPriceCache = () => { priceCache = null; };
export async function loadPrices(scope: SpendScope): Promise<PriceBook> {
  if (scope.prices) return scope.prices;
  const now = scope.now();
  if (priceCache && now - priceCache.at < 5 * 60_000) return (scope.prices = priceCache.book);
  let book = DEFAULT_PRICE_BOOK;
  try {
    const { data, error } = await scope.admin!.rpc('spend_price_table', {});
    if (!error && Array.isArray(data)) book = priceBookFromRows(data);
  } catch { /* usa os padrões conservadores */ }
  priceCache = { at: now, book };
  return (scope.prices = book);
}

/** Descobre a organização que paga. Ambíguo/sem relação = negação (falha fechada). */
export async function resolveScopeOrg(scope: SpendScope): Promise<string> {
  if (scope.orgId) return scope.orgId;
  if (!scope.admin) throw new SpendDeniedError(denied('spend_status_unavailable'));
  let hinted: SpendIdentity = {};
  if (scope.resolveIdentity) { try { hinted = await scope.resolveIdentity(); } catch { hinted = {}; } }
  const userId = scope.userId || hinted.userId || null;
  const projectId = scope.projectId || hinted.projectId || null;
  const articleId = scope.articleId || hinted.articleId || null;
  if (!userId && !projectId && !articleId) throw new SpendDeniedError(denied('spend_org_unresolved'));
  let org: unknown = null;
  try {
    const { data, error } = await scope.admin.rpc('spend_resolve_org', { p_user: userId, p_project: projectId, p_article: articleId });
    if (error) throw new SpendDeniedError(denied('spend_status_unavailable'));
    org = data;
  } catch (e) {
    if (e instanceof SpendDeniedError) throw e;
    throw new SpendDeniedError(denied('spend_status_unavailable'));
  }
  if (!isUuid(org)) throw new SpendDeniedError(denied('spend_org_unresolved'));
  scope.orgId = org;
  return org;
}

const operationKeyOf = (scope: SpendScope, articleId?: string, correlationId?: string) =>
  articleId || correlationId || scope.articleId || scope.correlationId || scope.id;

/** Reserva dentro do contexto atual; lança SpendDeniedError (e marca o contexto) se não puder. */
async function reserveInScope(scope: SpendScope, estimateMicros: number, ctx: Omit<GateContext, 'module'> & { module?: string }): Promise<{ reservationId: string; orgId: string }> {
  if (scope.capReached) { scope.denied = scope.capReached; throw new SpendDeniedError(scope.capReached); }
  let orgId: string;
  try { orgId = await resolveScopeOrg(scope); } catch (e) {
    if (e instanceof SpendDeniedError) scope.denied = e.info;
    throw e;
  }
  const g = await gate(scope.admin, orgId, estimateMicros, {
    module: scope.module, ...ctx, projectId: ctx.projectId ?? scope.projectId, articleId: ctx.articleId ?? scope.articleId, userId: ctx.userId ?? scope.userId,
  });
  if (!g.allowed) {
    const info = g as DenyInfo;
    scope.denied = info;
    if (info.code === 'daily_cap_reached' || info.code === 'spend_paused') scope.capReached = info;
    throw new SpendDeniedError(info);
  }
  return { reservationId: g.reservationId, orgId };
}

// ---------- cobertura de uma chamada de texto do AIOrchestrator ----------

export interface TextCallPlan {
  provider: 'openai' | 'anthropic' | 'gemini';
  models: string[];
  inputChars: number;
  maxOutputTokens: number;
  articleId?: string;
  correlationId?: string;
  operation?: string;
}
export interface CallCover {
  /** executa a chamada com o grant ativo (o fetch guardado reconhece a chamada como já reservada) */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** confirma com o uso real; ledgerRecorded=true quando o consumo já foi para o ledger (token_usage_logs); false grava aqui */
  commit(usage: { inputTokens: number; outputTokens: number }, model: string, ledgerRecorded: boolean): Promise<void>;
  release(): Promise<void>;
}

export async function coverTextCall(plan: TextCallPlan): Promise<CallCover> {
  const scope = currentSpendScope();
  if (!scope) throw new SpendDeniedError(denied('spend_scope_missing'));
  const book = await loadPrices(scope);
  const estimate = estimateTextMicros(book, plan.models, plan.inputChars, plan.maxOutputTokens);
  const { reservationId } = await reserveInScope(scope, estimate, {
    operation: plan.operation, operationKey: operationKeyOf(scope, plan.articleId, plan.correlationId),
    articleId: plan.articleId, provider: plan.provider, model: plan.models[0], route: 'text',
  });
  const grant: Grant = { provider: plan.provider, calls: plan.models.length, reservationId };
  let closed = false;
  return {
    run: (fn) => grantStore.run(grant, fn),
    async commit(usage, model, ledgerRecorded) {
      if (closed) return;
      closed = true;
      const price = textPriceFor(book, model);
      await commitSpend(scope.admin, reservationId, textCostMicros(price, usage.inputTokens, usage.outputTokens), {
        recordLedger: !ledgerRecorded, estimated: false, priceVerified: price.verified,
      });
    },
    async release() {
      if (closed) return;
      closed = true;
      await releaseSpend(scope.admin, reservationId);
    },
  };
}

// ---------- fetch guardado ----------

export interface GuardedFetchOptions {
  original: typeof fetch;
  getScope?: () => SpendScope | undefined;
}

/**
 * Fetch usado quando o teto está ligado (constante false). Chamada não paga passa direto. Chamada paga só sai com reserva:
 * (a) grant do AIOrchestrator para o mesmo provedor, ou (b) reserva própria por estimativa com confirmação pelo uso real/estimado.
 * Sem contexto de requisição, ou host pago sem preço cadastrado = negada.
 */
export function createGuardedFetch(opts: GuardedFetchOptions): typeof fetch {
  const getScope = opts.getScope || currentSpendScope;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = req?.url || String(input);
    const method = (init?.method || req?.method || 'GET').toUpperCase();
    const bodyText = typeof init?.body === 'string' ? init.body : undefined;
    const cls = classifyRequest(url, method, bodyText);
    if (!cls.billable) return opts.original(input, init);
    const scope = getScope();
    if (cls.unknown) { if (scope) scope.denied = denied('spend_provider_unpriced'); throw new SpendDeniedError(denied('spend_provider_unpriced')); }
    const guarded: RequestInit = { ...init, redirect: 'manual' };

    const grant = grantStore.getStore();
    if (grant && cls.route === 'text' && grant.provider === cls.provider && grant.calls > 0) {
      grant.calls -= 1;
      return opts.original(input, guarded);
    }
    if (!scope) throw new SpendDeniedError(denied('spend_scope_missing'));

    const book = await loadPrices(scope);
    const est = estimateRequest(cls, bodyText, book, url);
    const { reservationId } = await reserveInScope(scope, est.micros, {
      operationKey: operationKeyOf(scope), provider: cls.provider, model: est.model, route: cls.route,
    });
    let res: Response;
    try { res = await opts.original(input, guarded); } catch (e) { await releaseSpend(scope.admin, reservationId); throw e; }
    if (!res.ok) { await releaseSpend(scope.admin, reservationId); return res; }

    let actual = est.micros; let estimated = true;
    const eventStream = /text\/event-stream/i.test(res.headers.get('content-type') || '');
    if (cls.route === 'text' && !est.stream && !eventStream) {
      try {
        const usage = extractUsage(cls.provider as PaidProvider, await res.clone().json());
        if (usage) { actual = textCostMicros(textPriceFor(book, est.model), usage.inputTokens, usage.outputTokens); estimated = false; }
      } catch { /* resposta não é JSON legível: confirma a estimativa */ }
    }
    await commitSpend(scope.admin, reservationId, actual, { recordLedger: true, estimated, priceVerified: est.verified });
    return res;
  }) as typeof fetch;
}

// ---------- invólucro de requisição (paidLockedServe / funções que usam providerFetch) ----------

export interface RuntimeScopeEnv {
  url: string;
  serviceKeys: string[];
  rawFetch: typeof fetch;
}

/** Cliente mínimo de RPC via REST (sem supabase-js: o gate precisa funcionar antes de qualquer import e com o fetch original). */
export function restAdmin(env: RuntimeScopeEnv): SpendAdmin | null {
  const key = env.serviceKeys[0];
  if (!env.url || !key) return null;
  return {
    async rpc(name, args) {
      try {
        const r = await env.rawFetch(`${env.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
          method: 'POST', redirect: 'error', signal: timeoutSignal(8000),
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
        });
        const text = await r.text();
        if (!r.ok) return { data: null, error: { status: r.status } };
        return { data: text ? JSON.parse(text) : null, error: null };
      } catch { return { data: null, error: { network: true } }; }
    },
  };
}

/** Identidade da requisição: usuário VERIFICADO pelo Auth (ou, com chave de serviço, as pistas do corpo) + pistas de projeto/artigo. */
export function runtimeIdentityResolver(req: Request, env: RuntimeScopeEnv): () => Promise<SpendIdentity> {
  return async () => {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    let bodyText = '';
    try { bodyText = (await req.clone().text()).slice(0, 1_000_000); } catch { /* sem corpo legível */ }
    const hints = extractBodyHints(bodyText);
    if (!token) return {};
    if (env.serviceKeys.includes(token)) return { userId: hints.userId, projectId: hints.projectId, articleId: hints.articleId };
    let userId: string | undefined;
    try {
      const r = await env.rawFetch(`${env.url.replace(/\/$/, '')}/auth/v1/user`, {
        redirect: 'error', signal: timeoutSignal(8000), headers: { apikey: env.serviceKeys[0] || '', Authorization: `Bearer ${token}` },
      });
      if (r.ok) { const j = await r.json(); if (isUuid(j?.id)) userId = j.id; }
    } catch { /* sem usuário verificado */ }
    return { userId, projectId: hints.projectId, articleId: hints.articleId };
  };
}

/**
 * Cria o contexto de gasto de uma requisição. Só é chamado quando a constante PAID_SERVICES_BLOCKED é false.
 * A resposta de erro do handler é trocada pelo 423 padronizado se houve negação de gasto nesta requisição.
 */
export function spendScoped(handler: (req: Request) => Response | Promise<Response>, env: RuntimeScopeEnv, opts: { module?: string; orgId?: string } = {}) {
  return (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return Promise.resolve(handler(req));
    const scope = newSpendScope({
      module: opts.module || moduleFromUrl(req.url), admin: restAdmin(env), resolveIdentity: runtimeIdentityResolver(req, env),
      orgId: isUuid(opts.orgId) ? opts.orgId : undefined, orgPinned: isUuid(opts.orgId),
    });
    return runWithSpendScope(scope, async () => {
      try {
        const res = await handler(req);
        if (scope.denied && res.status >= 400) return spendDeniedResponse(scope.denied, res.headers);
        return res;
      } catch (e) {
        if (e instanceof SpendDeniedError) return spendDeniedResponse(e.info);
        throw e;
      }
    });
  };
}
