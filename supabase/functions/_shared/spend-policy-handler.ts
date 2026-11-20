/**
 * Ações do Teto Diário de Gasto na função de borda `spend-policy`.
 *
 *  - `status`:        gasto de hoje, teto, adicional, restante, estado, quem mais gastou, câmbio (só se o dono informou) e a estimativa
 *                     "cabem ≈ N chamadas / M artigos / K landing pages" calculada do custo médio REAL do ledger (sem dados = "sem dados").
 *  - `update_policy`: só o dono. Câmbio, aviso (%), pausa. Teto e adicional só podem DIMINUIR em relação à decisão do dono (7,00 / 2,20).
 *  - `unlock_extra`:  dono ou administrador. Libera o crédito adicional SÓ no dia corrente (America/Sao_Paulo).
 *  - `history`:       gasto por dia dos últimos 30 dias (até 90) por provedor, projeto e módulo.
 * Leitura: qualquer membro da organização. Isolamento: o papel vem do banco (organization_members/owner), nunca do corpo da requisição.
 */
import { ABSOLUTE_HARD_MAX_MICROS, DEFAULT_CAP_MICROS, DEFAULT_EXTRA_MICROS, SPEND_TZ, absoluteLimit, isUuid, priceBookFromRows } from './spend-gate-core.ts';

export const SPEND_POLICY_ACTIONS = ['status', 'update_policy', 'unlock_extra', 'history'];
export const POLICY_EDIT_ROLES = ['owner'];
export const UNLOCK_ROLES = ['owner', 'admin'];

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface SpendPolicyCtx {
  action: string;
  body: Record<string, unknown>;
  userId: string;
  roleByOrg: Map<string, string>;
  /** a constante PAID_SERVICES_BLOCKED; os testes injetam */
  paidBlocked: boolean;
}

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

export async function handleSpendPolicyAction(admin: Admin, ctx: SpendPolicyCtx): Promise<Reply> {
  try {
    if (!SPEND_POLICY_ACTIONS.includes(ctx.action)) return fail(400, 'unknown_action');
    const wanted = ctx.body.organizationId;
    let orgId: string | null = null;
    if (typeof wanted === 'string' && wanted) orgId = isUuid(wanted) ? wanted : null;
    else if (ctx.roleByOrg.size === 1) orgId = [...ctx.roleByOrg.keys()][0];
    else return fail(422, 'organization_required');
    if (!orgId) return fail(422, 'organization_invalid');
    const role = ctx.roleByOrg.get(orgId) || null;
    if (!role) return fail(403, 'organization_membership_required');

    if (ctx.action === 'status') return await status(admin, ctx, orgId, role);
    if (ctx.action === 'history') return await history(admin, ctx, orgId);
    if (ctx.action === 'unlock_extra') {
      if (!UNLOCK_ROLES.includes(role)) return fail(403, 'role_not_allowed');
      const { error } = await admin.rpc('spend_unlock_extra', { p_org: orgId, p_actor: ctx.userId });
      if (error) return fail(503, 'spend_unlock_failed');
      const r = await status(admin, ctx, orgId, role);
      return r.status === 200 ? { status: 200, body: { ...r.body, unlocked: true } } : r;
    }
    if (!POLICY_EDIT_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    return await updatePolicy(admin, ctx, orgId);
  } catch (_e) {
    console.error('[spend-policy] operation_failed');
    return fail(500, 'spend_policy_operation_failed');
  }
}

function estimateFits(st: Record<string, unknown>, avg: Record<string, unknown>) {
  const unlocked = st.extra_unlocked === true;
  const room = Math.max(0, num(unlocked ? st.remaining_absolute_usd_micros : st.remaining_to_cap_usd_micros));
  const one = (key: string) => {
    const a = obj(avg[key]);
    const n = num(a.n); const unit = num(a.avg_usd_micros);
    return n > 0 && unit > 0 ? { n, avg_usd_micros: unit, fits: Math.floor(room / unit) } : null;
  };
  const calls = one('calls'); const articles = one('article'); const landing = one('landing_page');
  return {
    room_usd_micros: room,
    basis: 'custo médio real do ledger nos últimos 60 dias',
    calls, articles, landing_pages: landing,
    summary: {
      calls: calls ? `≈ ${calls.fits} chamadas` : 'sem dados',
      articles: articles ? `≈ ${articles.fits} artigos` : 'sem dados',
      landing_pages: landing ? `≈ ${landing.fits} landing pages` : 'sem dados',
    },
  };
}

async function status(admin: Admin, ctx: SpendPolicyCtx, orgId: string, role: string): Promise<Reply> {
  const { data, error } = await admin.rpc('spend_status', { p_org: orgId });
  const st = obj(data);
  // sem leitura confiável do gasto: nada de painel inventado (e o servidor também nega as chamadas pagas)
  if (error || typeof st.cap_usd_micros === 'undefined') return fail(503, 'spend_status_unavailable');
  const [avgRes, priceRes] = await Promise.all([admin.rpc('spend_averages', { p_org: orgId }), admin.rpc('spend_price_table', {})]);
  const book = priceBookFromRows(Array.isArray(priceRes?.data) ? priceRes.data : []);
  const unverified = [...Object.values(book.text), ...Object.values(book.units)].filter((p) => !p.verified).length;
  const fx = st.fx_brl_per_usd === null || st.fx_brl_per_usd === undefined ? null : num(st.fx_brl_per_usd);
  const brl = fx && fx > 0
    ? { fx_brl_per_usd: fx, spent: num(st.used_usd_micros) / 1e6 * fx, cap: num(st.cap_usd_micros) / 1e6 * fx, absolute: num(st.absolute_usd_micros) / 1e6 * fx }
    : null;
  return {
    status: 200,
    body: {
      organization_id: orgId, role, can_unlock: UNLOCK_ROLES.includes(role), can_edit_policy: POLICY_EDIT_ROLES.includes(role),
      paid_blocked: ctx.paidBlocked, cap_active: !ctx.paidBlocked,
      ...st, brl,
      estimate: avgRes?.error ? { room_usd_micros: 0, basis: 'sem dados', summary: { calls: 'sem dados', articles: 'sem dados', landing_pages: 'sem dados' } } : estimateFits(st, obj(avgRes?.data)),
      unverified_prices: unverified,
      limits: { max_cap_usd_micros: DEFAULT_CAP_MICROS, max_extra_usd_micros: DEFAULT_EXTRA_MICROS, hard_max_usd_micros: ABSOLUTE_HARD_MAX_MICROS },
    },
  };
}

async function history(admin: Admin, ctx: SpendPolicyCtx, orgId: string): Promise<Reply> {
  const days = Math.min(Math.max(Math.trunc(num(ctx.body.days, 30)) || 30, 1), 90);
  const { data, error } = await admin.rpc('spend_history', { p_org: orgId, p_days: days });
  const h = obj(data);
  if (error || !Array.isArray(h.days)) return fail(503, 'spend_history_unavailable');
  const ids = new Set<string>();
  for (const d of h.days as Array<Record<string, unknown>>) for (const id of Object.keys(obj(d.by_project))) if (isUuid(id)) ids.add(id);
  const names: Record<string, string> = {};
  if (ids.size) {
    // só projetos DESTA organização: o histórico nunca vaza nome de projeto de outra
    const { data: projects } = await admin.from('projects').select('id,name').eq('organization_id', orgId).in('id', [...ids]);
    for (const p of (projects || []) as Array<{ id: string; name: string }>) names[p.id] = p.name;
  }
  return { status: 200, body: { organization_id: orgId, ...h, project_names: names } };
}

async function updatePolicy(admin: Admin, ctx: SpendPolicyCtx, orgId: string): Promise<Reply> {
  const b = ctx.body;
  const patch: Record<string, unknown> = { organization_id: orgId, updated_by: ctx.userId, updated_at: new Date().toISOString(), timezone: SPEND_TZ };
  const usdToMicros = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000) : null; };
  if (b.dailyCapUsd !== undefined) {
    const m = usdToMicros(b.dailyCapUsd);
    if (m === null || m > DEFAULT_CAP_MICROS) return fail(422, 'cap_invalid', { max_usd: DEFAULT_CAP_MICROS / 1e6 });
    patch.daily_cap_usd_micros = m;
  }
  if (b.extraAllowanceUsd !== undefined) {
    const m = usdToMicros(b.extraAllowanceUsd);
    if (m === null || m > DEFAULT_EXTRA_MICROS) return fail(422, 'extra_invalid', { max_usd: DEFAULT_EXTRA_MICROS / 1e6 });
    patch.extra_allowance_usd_micros = m;
  }
  if (b.alertPct !== undefined) {
    const p = Number(b.alertPct);
    if (!Number.isInteger(p) || p < 1 || p > 100) return fail(422, 'alert_pct_invalid');
    patch.alert_pct = p;
  }
  if (b.fxBrlPerUsd !== undefined) {
    if (b.fxBrlPerUsd === null) patch.fx_brl_per_usd = null;
    else {
      const f = Number(b.fxBrlPerUsd);
      if (!Number.isFinite(f) || f <= 0 || f > 100) return fail(422, 'fx_invalid');
      patch.fx_brl_per_usd = f;
    }
  }
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') return fail(422, 'enabled_invalid');
    patch.enabled = b.enabled;
  }
  if (Object.keys(patch).length <= 4) return fail(422, 'nothing_to_update');
  // o teto efetivo nunca passa de teto + adicional da decisão do dono (a função do banco ainda trava em 9,20)
  const cap = (patch.daily_cap_usd_micros as number | undefined) ?? DEFAULT_CAP_MICROS;
  const extra = (patch.extra_allowance_usd_micros as number | undefined) ?? DEFAULT_EXTRA_MICROS;
  if (absoluteLimit(cap, extra) > ABSOLUTE_HARD_MAX_MICROS) return fail(422, 'absolute_limit_exceeded');
  const { error } = await admin.from('organization_spend_policy').upsert(patch, { onConflict: 'organization_id' });
  if (error) return fail(500, 'policy_save_failed');
  const r = await status(admin, ctx, orgId, 'owner');
  return r.status === 200 ? { status: 200, body: { ...r.body, saved: true } } : r;
}
