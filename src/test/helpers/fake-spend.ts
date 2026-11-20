/**
 * Banco em memória do Teto Diário de Gasto: responde às RPCs que o gate usa (spend_reserve/commit/release/status/resolve_org/price_table/...)
 * espelhando a migração 20261120400000. A decisão usa decideReserve() do núcleo (o espelho da função SQL). `lock: true` simula o advisory
 * lock por organização (reservas simultâneas esperam); `lock: false` é o CONTROLE NEGATIVO: leitura e escrita separadas por uma pausa, que
 * deixa as reservas simultâneas enxergarem o mesmo saldo e estourarem o teto (prova que o teste de concorrência tem dentes).
 * O SQL em si NÃO é executado aqui (não há Postgres neste ambiente): a lógica é a mesma, a sintaxe SQL não é provada por estes testes.
 */
import { ABSOLUTE_HARD_MAX_MICROS, DEFAULT_ALERT_PCT, DEFAULT_CAP_MICROS, DEFAULT_EXTRA_MICROS, RESERVATION_TTL_MS, SPEND_TZ, computeState, dayKey, decideReserve } from '../../../supabase/functions/_shared/spend-gate-core';

export interface Policy { cap?: number; extra?: number; unlockedOn?: string | null; alertPct?: number; fx?: number | null; enabled?: boolean }
export interface LedgerRow { organization_id: string; project_id?: string | null; article_id?: string | null; amount: number; provider?: string | null; model?: string | null; occurred_at: number; metadata: Record<string, unknown> }
export interface Reservation { id: string; organization_id: string; day: string; operation_key: string | null; key: string; estimate: number; actual: number | null; status: 'reserved' | 'committed' | 'released' | 'expired'; started: boolean; context: Record<string, unknown>; expires_at: number }

export interface FakeSpendOptions {
  now?: () => number;
  lock?: boolean;
  policies?: Record<string, Policy>;
  ledger?: LedgerRow[];
  /** resolve_org: (user, project, article) -> org (ou null) */
  resolveOrg?: (user: string | null, project: string | null, article: string | null) => string | null;
  averages?: Record<string, unknown>;
  prices?: unknown[];
  history?: Record<string, unknown>;
}

export function fakeSpendDb(opts: FakeSpendOptions = {}) {
  const clock = { now: opts.now || (() => Date.UTC(2026, 10, 20, 15, 0, 0)) };
  const policies: Record<string, Policy> = { ...(opts.policies || {}) };
  const ledger: LedgerRow[] = [...(opts.ledger || [])];
  const reservations: Reservation[] = [];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const state = { failRead: false as boolean | 'throw' | 'malformed', seq: 0 };
  const chains = new Map<string, Promise<unknown>>();
  const mutex = <T>(org: string, fn: () => Promise<T>): Promise<T> => {
    if (opts.lock === false) return fn();
    const prev = chains.get(org) || Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(org, next.catch(() => undefined));
    return next;
  };
  const pol = (org: string) => {
    const p = policies[org] || {};
    return { cap: p.cap ?? DEFAULT_CAP_MICROS, extra: p.extra ?? DEFAULT_EXTRA_MICROS, unlockedOn: p.unlockedOn ?? null, alertPct: p.alertPct ?? DEFAULT_ALERT_PCT, fx: p.fx ?? null, enabled: p.enabled ?? true };
  };
  const today = () => dayKey(clock.now(), SPEND_TZ);
  const totals = (org: string) => {
    const d = today();
    const spent = ledger.filter((l) => l.organization_id === org && dayKey(l.occurred_at, SPEND_TZ) === d).reduce((n, l) => n + l.amount, 0);
    const est = ledger.filter((l) => l.organization_id === org && dayKey(l.occurred_at, SPEND_TZ) === d && l.metadata.estimated === true).reduce((n, l) => n + l.amount, 0);
    const reserved = reservations.filter((r) => r.organization_id === org && r.day === d && r.status === 'reserved' && r.expires_at > clock.now()).reduce((n, r) => n + r.estimate, 0);
    return { spent, est, reserved, day: d };
  };
  const expire = (org: string) => { for (const r of reservations) if (r.organization_id === org && r.status === 'reserved' && r.expires_at <= clock.now()) r.status = 'expired'; };
  const statusOf = (org: string) => {
    const p = pol(org); const t = totals(org); const used = t.spent + t.reserved;
    const unlocked = p.unlockedOn === t.day;
    const abs = Math.min(p.cap + p.extra, ABSOLUTE_HARD_MAX_MICROS);
    return {
      day: t.day, timezone: SPEND_TZ, spent_usd_micros: t.spent, estimated_usd_micros: t.est, reserved_usd_micros: t.reserved, used_usd_micros: used,
      cap_usd_micros: p.cap, extra_usd_micros: p.extra, absolute_usd_micros: abs, extra_unlocked: unlocked,
      remaining_to_cap_usd_micros: Math.max(p.cap - used, 0), remaining_absolute_usd_micros: Math.max(abs - used, 0),
      state: computeState({ spent: t.spent, reserved: t.reserved, cap: p.cap, extra: p.extra, extraUnlocked: unlocked, alertPct: p.alertPct }),
      alert_pct: p.alertPct, fx_brl_per_usd: p.fx, enabled: p.enabled, top_projects: [], top_modules: [], top_providers: [],
    };
  };

  const reserve = async (a: Record<string, unknown>) => {
    const org = String(a.p_org); const est = Number(a.p_estimate_usd_micros); const key = String(a.p_idempotency_key);
    const ctx = (a.p_context || {}) as Record<string, unknown>;
    return mutex(org, async () => {
      if (!org || !(est >= 0) || key.length < 8) return { data: null, error: { message: 'invalid' } };
      expire(org);
      const p = pol(org); const t = totals(org);
      const unlocked = p.unlockedOn === t.day;
      const existing = reservations.find((r) => r.organization_id === org && r.key === key);
      if (existing && (existing.status === 'reserved' || existing.status === 'committed')) return { data: { allowed: true, duplicate: true, reservation_id: existing.id, reservation_status: existing.status }, error: null };
      if (!p.enabled) return { data: { allowed: false, code: 'spend_paused', reason: 'paused', spent: t.spent, reserved: t.reserved, cap: p.cap, extra: p.extra, extra_unlocked: unlocked }, error: null };
      const op = (ctx.operation_key as string) || null;
      const started = a.p_started_job === true || (!!op && reservations.some((r) => r.organization_id === org && r.day === t.day && r.operation_key === op && (r.status === 'reserved' || r.status === 'committed')));
      const decision = decideReserve({ spent: t.spent, reserved: t.reserved, cap: p.cap, extra: p.extra, extraUnlocked: unlocked, estimate: est, started });
      if (opts.lock === false) await new Promise((r) => setTimeout(r, 1)); // controle negativo: pausa entre ler e escrever
      if (!decision.allow) {
        const denied = decision as { code: string; reason: string; state: string };
        return { data: { allowed: false, code: denied.code, reason: denied.reason, spent: t.spent, reserved: t.reserved, estimate: est, cap: p.cap, extra: p.extra, extra_unlocked: unlocked, started, state: denied.state }, error: null };
      }
      let r = existing;
      if (r) { Object.assign(r, { status: 'reserved', estimate: est, actual: null, day: t.day, operation_key: op, started, context: ctx, expires_at: clock.now() + RESERVATION_TTL_MS }); }
      else { r = { id: `00000000-0000-4000-8000-${String(++state.seq).padStart(12, '0')}`, organization_id: org, day: t.day, operation_key: op, key, estimate: est, actual: null, status: 'reserved', started, context: ctx, expires_at: clock.now() + RESERVATION_TTL_MS }; reservations.push(r); }
      return { data: { allowed: true, duplicate: false, reservation_id: r.id, state: decision.state, spent: t.spent, reserved: t.reserved + est, cap: p.cap, extra: p.extra, extra_unlocked: unlocked, started }, error: null };
    });
  };

  const rpc = async (name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> => {
    calls.push({ name, args });
    if (state.failRead === 'throw') throw new Error('network');
    if (state.failRead === true) return { data: null, error: { message: 'db_unavailable' } };
    if (state.failRead === 'malformed') return { data: 'not-json-object', error: null };
    switch (name) {
      case 'spend_reserve': return reserve(args);
      case 'spend_commit': {
        const r = reservations.find((x) => x.id === args.p_reservation);
        if (!r) return { data: null, error: { message: 'reservation_not_found' } };
        return mutex(r.organization_id, async () => {
          if (r.status === 'committed') return { data: { ok: true, duplicate: true }, error: null };
          const actual = args.p_actual_usd_micros === null || args.p_actual_usd_micros === undefined ? r.estimate : Number(args.p_actual_usd_micros);
          r.status = 'committed'; r.actual = actual;
          if (args.p_record_ledger !== false && actual > 0) {
            const meta = (args.p_meta || {}) as Record<string, unknown>;
            ledger.push({
              organization_id: r.organization_id, project_id: (r.context.project_id as string) || null, article_id: (r.context.article_id as string) || null, amount: actual,
              provider: (r.context.provider as string) || null, model: (r.context.model as string) || null, occurred_at: clock.now(),
              metadata: { source: 'spend_gate', reservation_id: r.id, module: r.context.module, route: r.context.route, estimated: false, ...meta },
            });
          }
          return { data: { ok: true, duplicate: false, actual_usd_micros: actual }, error: null };
        });
      }
      case 'spend_release': {
        const r = reservations.find((x) => x.id === args.p_reservation);
        if (r && r.status === 'reserved') r.status = 'released';
        return { data: { ok: true }, error: null };
      }
      case 'spend_status': return { data: statusOf(String(args.p_org)), error: null };
      case 'spend_unlock_extra': { const org = String(args.p_org); policies[org] = { ...(policies[org] || {}), unlockedOn: today() }; return { data: statusOf(org), error: null }; }
      case 'spend_resolve_org': return { data: opts.resolveOrg ? opts.resolveOrg((args.p_user as string) ?? null, (args.p_project as string) ?? null, (args.p_article as string) ?? null) : null, error: null };
      case 'spend_price_table': return { data: opts.prices ?? [], error: null };
      case 'spend_averages': return { data: opts.averages ?? { calls: { n: 0, avg_usd_micros: null }, article: { n: 0, avg_usd_micros: null }, landing_page: { n: 0, avg_usd_micros: null } }, error: null };
      case 'spend_history': return { data: opts.history ?? { days: [], timezone: SPEND_TZ, window_days: 30 }, error: null };
      default: return { data: null, error: { message: `rpc_not_mocked:${name}` } };
    }
  };

  return { admin: { rpc, from: undefined as unknown }, rpc, clock, policies, ledger, reservations, calls, state, statusOf, totals };
}

export const ORG_A = '00000000-0000-4000-8000-0000000000a1';
export const ORG_B = '00000000-0000-4000-8000-0000000000a2';
export const USER_1 = '00000000-0000-4000-8000-0000000000c1';
export const PROJECT_1 = '00000000-0000-4000-8000-0000000000b1';
export const usdm = (v: number) => Math.round(v * 1_000_000);
