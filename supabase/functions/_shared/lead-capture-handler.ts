/**
 * Ações da captação de leads na função de borda `lead-capture`.
 *  Públicas (sem login): `challenge`, `submit`, `peek`, `activate` (FASE DE TESTE: cria a conta já confirmada, sem e-mail de confirmação,
 *  a partir do token do lead + a senha escolhida; a verificação do e-mail volta numa fase de endurecimento).
 *  Com login: `claim` (a pessoa que acabou de se cadastrar liga o cadastro ao lead pelo token de passagem e recebe o ESPAÇO DE TESTE:
 *  1 projeto, sem IA paga da plataforma; ver migração 20261116060000).
 *  Só do gestor (app_role = "ceo"): `list`, `update`, `release` (libera o espaço de teste para um plano de verdade).
 * Toda a escrita usa a chave de serviço; o navegador nunca lê estas tabelas. O IP nunca é guardado (só um hash diário).
 */
import {
  HANDOFF_TTL_MS, LEAD_CONSENT_VERSION, LIMITS, checkChallenge, handoffHash, isAllowedOrigin, isHandoffShape, makeChallenge, newHandoff,
  rateDecision, signupRedirect, validateLead, visitorHash, type Crypto2,
} from './lead-capture-core.ts';

export const LEAD_ACTIONS = ['challenge', 'submit', 'peek', 'activate', 'claim', 'list', 'update', 'release'];
/** Planos para os quais a gestão pode liberar um espaço de teste (o banco ainda confere: ativo, não-teste, nunca o interno). */
const RELEASE_PLAN = /^[a-z0-9_-]{1,40}$/;
export const LEAD_STATUSES = ['new', 'contacted', 'signed_up', 'discarded'];

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface LeadCtx {
  action: string;
  body: Record<string, unknown>;
  ip: string;
  origin: string | null;
  crypto: Crypto2;
  /** segredo de assinatura (derivado no servidor; nunca sai dele) */
  secret: string;
  now: () => number;
  /** quem está logado (null = visitante anônimo) */
  userId: string | null;
  isManager: () => Promise<boolean>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const LEAD_COLUMNS = 'id,created_at,updated_at,name,email,phone,segment,message,site_url,source,consent_at,consent_version,status,claimed_at,notes';
/** O que o gestor pode ver de um lead: lista FIXA (nunca o hash do visitante, nem o do token), mesmo que o banco devolva mais colunas. */
const publicLead = (row: Record<string, unknown>) => Object.fromEntries(LEAD_COLUMNS.split(',').map((k) => [k, row[k] ?? null]));

export async function handleLeadAction(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  try {
    switch (ctx.action) {
      case 'challenge': return { status: 200, body: { challenge: await makeChallenge(ctx.crypto, ctx.secret, ctx.now()), consent_version: LEAD_CONSENT_VERSION } };
      case 'submit': return await submit(admin, ctx);
      case 'peek': return await peek(admin, ctx);
      case 'activate': return await activate(admin, ctx);
      case 'claim': return await claim(admin, ctx);
      case 'list': return await list(admin, ctx);
      case 'update': return await update(admin, ctx);
      case 'release': return await release(admin, ctx);
      default: return fail(400, 'unknown_action');
    }
  } catch (_e) {
    console.error('[lead-capture] operation_failed');
    return fail(500, 'lead_operation_failed');
  }
}

// ------------------------------------------------------------------------------------------------------------ limites
async function counts(admin: Admin, ctx: LeadCtx, ip: string) {
  const nowMs = ctx.now();
  const dayAgo = new Date(nowMs - 86_400_000).toISOString();
  const hourAgoMs = nowMs - 3_600_000;
  const mine = await admin.from('lead_capture_attempts').select('outcome,created_at').eq('ip_hash', ip).gte('created_at', dayAgo);
  if (mine.error) throw mine.error;
  const rows = (mine.data || []) as Array<{ outcome: string; created_at: string }>;
  const global = await admin.from('lead_capture_attempts').select('id').eq('outcome', 'ok').gte('created_at', dayAgo);
  if (global.error) throw global.error;
  return {
    hour: rows.filter((r) => r.outcome !== 'peek' && Date.parse(r.created_at) >= hourAgoMs).length,
    day: rows.filter((r) => r.outcome !== 'peek').length,
    peekHour: rows.filter((r) => r.outcome === 'peek' && Date.parse(r.created_at) >= hourAgoMs).length,
    globalOkDay: (global.data || []).length,
  };
}
async function record(admin: Admin, ctx: LeadCtx, ip: string, outcome: 'ok' | 'invalid' | 'blocked' | 'bot' | 'peek') {
  await admin.from('lead_capture_attempts').insert({ ip_hash: ip, outcome, created_at: new Date(ctx.now()).toISOString() });
}

// ------------------------------------------------------------------------------------------------------------ envio do formulário
async function submit(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  if (!isAllowedOrigin(ctx.origin)) return fail(403, 'origin_not_allowed');
  const nowMs = ctx.now();
  const ip = await visitorHash(ctx.crypto, ctx.secret, ctx.ip, nowMs);
  const c = await counts(admin, ctx, ip);
  const decision = rateDecision({ hour: c.hour, day: c.day, globalOkDay: c.globalOkDay });
  if (decision === 'unavailable') return fail(503, 'temporarily_unavailable');
  if (decision === 'rate_limited') return fail(429, 'rate_limited');

  // campo-isca: robô que preenche tudo recebe "sucesso" falso e nada é guardado
  if (typeof ctx.body.website === 'string' && ctx.body.website.trim() !== '') {
    await record(admin, ctx, ip, 'bot');
    return { status: 200, body: { ok: true, redirect: signupRedirect((await newHandoff(ctx.crypto)).token) } };
  }
  const challenge = await checkChallenge(ctx.crypto, ctx.secret, ctx.body.challenge, nowMs);
  if (challenge !== 'ok') {
    await record(admin, ctx, ip, 'invalid');
    return fail(400, challenge === 'invalid' ? 'challenge_invalid' : challenge);
  }
  const checked = validateLead(ctx.body);
  if ('fields' in checked) {
    await record(admin, ctx, ip, 'invalid');
    return fail(422, 'invalid', { fields: checked.fields });
  }
  const v = checked.value;
  const handoff = await newHandoff(ctx.crypto);
  const expires = new Date(nowMs + HANDOFF_TTL_MS).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    const byEmail = v.emailNorm ? await admin.from('marketing_leads').select('id,email_norm,phone,status').eq('email_norm', v.emailNorm).in('status', ['new', 'contacted']).maybeSingle() : { data: null, error: null };
    if (byEmail.error) throw byEmail.error;
    const byPhone = v.phone ? await admin.from('marketing_leads').select('id,email_norm,phone,status').eq('phone', v.phone).in('status', ['new', 'contacted']).maybeSingle() : { data: null, error: null };
    if (byPhone.error) throw byPhone.error;
    const target = byEmail.data || byPhone.data;
    let write: { error?: { code?: string } | null };
    if (target) {
      // atualiza o MESMO lead; um contato que já pertence a OUTRO lead não é copiado para este
      const patch: Record<string, unknown> = { name: v.name, consent_at: nowIso, consent_version: LEAD_CONSENT_VERSION, ip_hash: ip, handoff_hash: handoff.hash, handoff_expires_at: expires };
      if (v.segment) patch.segment = v.segment;
      if (v.message) patch.message = v.message;
      if (v.siteUrl) patch.site_url = v.siteUrl;
      if (Object.keys(v.source).length) patch.source = v.source;
      if (v.emailNorm && !target.email_norm && (!byEmail.data || byEmail.data.id === target.id)) { patch.email = v.email; patch.email_norm = v.emailNorm; }
      if (v.phone && !target.phone && (!byPhone.data || byPhone.data.id === target.id)) patch.phone = v.phone;
      write = await admin.from('marketing_leads').update(patch).eq('id', target.id);
    } else {
      write = await admin.from('marketing_leads').insert({
        name: v.name, email: v.email, email_norm: v.emailNorm, phone: v.phone, segment: v.segment, message: v.message, site_url: v.siteUrl, source: v.source,
        consent_at: nowIso, consent_version: LEAD_CONSENT_VERSION, ip_hash: ip, status: 'new', handoff_hash: handoff.hash, handoff_expires_at: expires,
      });
    }
    if (!write.error) break;
    if (write.error.code === '23505' && attempt === 0) continue; // corrida entre dois envios do mesmo contato: tenta de novo como atualização
    throw write.error;
  }
  await record(admin, ctx, ip, 'ok');
  // limpeza das tentativas antigas (só hashes); barata e sem cron
  await admin.from('lead_capture_attempts').delete().lt('created_at', new Date(nowMs - 7 * 86_400_000).toISOString());
  // a resposta é a MESMA com ou sem lead anterior: não revela se o contato já existia
  return { status: 200, body: { ok: true, redirect: signupRedirect(handoff.token) } };
}

// ------------------------------------------------------------------------------------------------------------ pré-preenchimento do cadastro
async function peek(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  const nowMs = ctx.now();
  const ip = await visitorHash(ctx.crypto, ctx.secret, ctx.ip, nowMs);
  const c = await counts(admin, ctx, ip);
  if (c.peekHour >= LIMITS.peekPerHour) return fail(429, 'rate_limited');
  await record(admin, ctx, ip, 'peek');
  if (!isHandoffShape(ctx.body.token)) return { status: 200, body: { valid: false } };
  const hash = await handoffHash(ctx.crypto, ctx.body.token);
  const { data, error } = await admin.from('marketing_leads').select('name,email,handoff_expires_at,claimed_by,status').eq('handoff_hash', hash).maybeSingle();
  if (error) throw error;
  if (!data || data.claimed_by || data.status === 'discarded' || !data.handoff_expires_at || Date.parse(data.handoff_expires_at) < nowMs) return { status: 200, body: { valid: false } };
  return { status: 200, body: { valid: true, name: data.name, email: data.email ?? null } };
}

// ------------------------------------------------------------------------------------------------------------ vínculo depois do cadastro
/** Liga o lead à conta e cria o espaço de teste (idempotente). Falhar na criação do espaço NÃO desfaz o vínculo: a gestão vê o lead e resolve. */
async function linkLead(admin: Admin, lead: { id: string; name?: unknown }, userId: string, nowMs: number): Promise<'created' | 'existing' | 'unavailable'> {
  const { error: upError } = await admin.from('marketing_leads').update({ claimed_by: userId, claimed_at: new Date(nowMs).toISOString(), status: 'signed_up', handoff_hash: null, handoff_expires_at: null }).eq('id', lead.id);
  if (upError) throw upError;
  let space: 'created' | 'existing' | 'unavailable' = 'unavailable';
  try {
    const prov = await admin.rpc('provision_trial_space', { p_user: userId, p_display_name: typeof lead.name === 'string' ? lead.name : '' });
    if (!prov.error && prov.data && typeof prov.data === 'object') space = (prov.data as { created?: boolean }).created ? 'created' : 'existing';
    else console.error('[lead-capture] trial_space_failed');
  } catch (_e) {
    console.error('[lead-capture] trial_space_failed');
  }
  return space;
}

type LeadForLink = { id: string; name?: unknown; email?: string | null; email_norm?: string | null; handoff_expires_at?: string | null; claimed_by?: string | null; status?: string };
const LEAD_LINK_COLUMNS = 'id,name,email,email_norm,handoff_expires_at,claimed_by,status';
const leadUsable = (d: LeadForLink | null, nowMs: number) => !!d && !d.claimed_by && d.status !== 'discarded' && !!d.handoff_expires_at && Date.parse(d.handoff_expires_at) >= nowMs;

// ------------------------------------------------------------------------------------------------------------ cadastro direto (fase de teste)
/**
 * FASE DE TESTE, a pedido do dono: quem preencheu o formulário cria a senha e já entra, sem e-mail de confirmação.
 * O e-mail da conta é SEMPRE o do lead (guardado no servidor), nunca um valor digitado agora; a conta nasce confirmada.
 * Risco conhecido e aceito nesta fase: ninguém prova que o e-mail é da pessoa. O espaço de teste é mínimo (1 projeto, sem IA paga).
 * Endurecer depois: voltar a exigir confirmação do e-mail (ou link mágico) antes de ativar o espaço.
 */
async function activate(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  if (!isAllowedOrigin(ctx.origin)) return fail(403, 'origin_not_allowed');
  const nowMs = ctx.now();
  const ip = await visitorHash(ctx.crypto, ctx.secret, ctx.ip, nowMs);
  const c = await counts(admin, ctx, ip);
  if (c.peekHour >= LIMITS.peekPerHour) return fail(429, 'rate_limited');
  await record(admin, ctx, ip, 'peek');
  const password = ctx.body.password;
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) return fail(422, 'password_invalid');
  if (!isHandoffShape(ctx.body.token)) return fail(404, 'lead_not_found');
  const hash = await handoffHash(ctx.crypto, ctx.body.token);
  const { data, error } = await admin.from('marketing_leads').select(LEAD_LINK_COLUMNS).eq('handoff_hash', hash).maybeSingle();
  if (error) throw error;
  const lead = data as LeadForLink | null;
  if (!lead || !leadUsable(lead, nowMs)) return fail(404, 'lead_not_found');
  if (!lead.email) return fail(422, 'email_required');
  const name = typeof lead.name === 'string' ? lead.name.slice(0, 120) : '';
  const created = await admin.auth.admin.createUser({ email: lead.email, password, email_confirm: true, user_metadata: name ? { full_name: name } : {} });
  if (created.error || !created.data?.user?.id) {
    const code = String(created.error?.code || '');
    const msg = String(created.error?.message || '').toLowerCase();
    if (code === 'email_exists' || code === 'user_already_exists' || msg.includes('already been registered') || msg.includes('already registered')) return fail(409, 'account_exists');
    if (code === 'weak_password' || msg.includes('password')) return fail(422, 'password_invalid');
    throw created.error ?? new Error('create_user_failed');
  }
  const space = await linkLead(admin, lead, created.data.user.id as string, nowMs);
  return { status: 200, body: { activated: true, email: lead.email, space } };
}

async function claim(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  if (!ctx.userId) return fail(401, 'authorization_required');
  if (!isHandoffShape(ctx.body.token)) return fail(404, 'lead_not_found', { claimed: false });
  const nowMs = ctx.now();
  const hash = await handoffHash(ctx.crypto, ctx.body.token);
  const { data, error } = await admin.from('marketing_leads').select(LEAD_LINK_COLUMNS).eq('handoff_hash', hash).maybeSingle();
  if (error) throw error;
  const lead = data as LeadForLink | null;
  if (!lead || !leadUsable(lead, nowMs)) return fail(404, 'lead_not_found', { claimed: false });
  // o lead só pode ser ligado à conta com o MESMO e-mail (quem já estava logado com outra conta, por exemplo a do gestor, não o "rouba"). Falha fechada.
  if (lead.email_norm) {
    let mine = '';
    try {
      const u = await admin.auth.admin.getUserById(ctx.userId);
      mine = String(u?.data?.user?.email || '').trim().toLowerCase();
    } catch (_e) { mine = ''; }
    if (!mine || mine !== lead.email_norm) return fail(409, 'email_mismatch', { claimed: false });
  }
  const space = await linkLead(admin, lead, ctx.userId, nowMs);
  return { status: 200, body: { claimed: true, space } };
}

// ------------------------------------------------------------------------------------------------------------ gestor
async function requireManager(ctx: LeadCtx): Promise<Reply | null> {
  if (!ctx.userId) return fail(401, 'authorization_required');
  return (await ctx.isManager()) ? null : fail(403, 'manager_only');
}

async function list(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  const denied = await requireManager(ctx);
  if (denied) return denied;
  const status = ctx.body.status;
  if (status !== undefined && status !== null && status !== '' && !LEAD_STATUSES.includes(String(status))) return fail(422, 'status_invalid');
  const limit = Math.max(1, Math.min(100, Math.floor(Number(ctx.body.limit)) || 50));
  const offset = Math.max(0, Math.floor(Number(ctx.body.offset)) || 0);
  let query = admin.from('marketing_leads').select(LEAD_COLUMNS + ',claimed_by').order('created_at', { ascending: false });
  if (status) query = query.eq('status', String(status));
  const page = await query.range(offset, offset + limit - 1);
  if (page.error) throw page.error;
  const all = await admin.from('marketing_leads').select('status');
  if (all.error) throw all.error;
  const byStatus: Record<string, number> = { new: 0, contacted: 0, signed_up: 0, discarded: 0 };
  for (const r of (all.data || []) as Array<{ status: string }>) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  const rows = (page.data || []) as Array<Record<string, unknown>>;
  // espaço de cada pessoa que já se cadastrou (plano e situação); se a consulta falhar, a lista continua, só sem essa coluna
  const spaces = new Map<string, { organization_id: string; plan_id: string; status: string }>();
  const users = [...new Set(rows.map((r) => r.claimed_by).filter((v): v is string => typeof v === 'string'))];
  if (users.length) {
    const info = await admin.rpc('lead_trial_info', { p_users: users });
    if (!info.error) for (const i of (info.data || []) as Array<{ user_id: string; organization_id: string; plan_id: string; subscription_status: string }>) spaces.set(i.user_id, { organization_id: i.organization_id, plan_id: i.plan_id, status: i.subscription_status });
  }
  const leads = rows.map((r) => ({ ...publicLead(r), space: (typeof r.claimed_by === 'string' && spaces.get(r.claimed_by)) || null }));
  return { status: 200, body: { leads, counts: byStatus } };
}

async function update(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  const denied = await requireManager(ctx);
  if (denied) return denied;
  const id = ctx.body.id;
  if (typeof id !== 'string' || !UUID.test(id)) return fail(422, 'lead_id_invalid');
  const patch: Record<string, unknown> = {};
  if (ctx.body.status !== undefined) {
    if (typeof ctx.body.status !== 'string' || !LEAD_STATUSES.includes(ctx.body.status)) return fail(422, 'status_invalid');
    patch.status = ctx.body.status;
  }
  if (ctx.body.notes !== undefined) {
    if (ctx.body.notes !== null && (typeof ctx.body.notes !== 'string' || ctx.body.notes.length > 1000)) return fail(422, 'notes_invalid');
    patch.notes = ctx.body.notes === null || String(ctx.body.notes).trim() === '' ? null : String(ctx.body.notes).trim();
  }
  if (!Object.keys(patch).length) return fail(422, 'nothing_to_update');
  const found = await admin.from('marketing_leads').select('id').eq('id', id).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return fail(404, 'lead_not_found');
  const { error } = await admin.from('marketing_leads').update(patch).eq('id', id);
  if (error) throw error;
  return { status: 200, body: { id, ...patch } };
}

/** A gestão libera o espaço de teste para um plano de verdade (só quem tem app_role "ceo"; o banco recusa plano interno/de teste/inexistente). */
async function release(admin: Admin, ctx: LeadCtx): Promise<Reply> {
  const denied = await requireManager(ctx);
  if (denied) return denied;
  const org = ctx.body.organization_id;
  const plan = ctx.body.plan;
  if (typeof org !== 'string' || !UUID.test(org)) return fail(422, 'organization_invalid');
  if (typeof plan !== 'string' || !RELEASE_PLAN.test(plan)) return fail(422, 'plan_invalid');
  const { data, error } = await admin.rpc('release_trial_space', { p_org: org, p_plan: plan, p_actor: ctx.userId });
  if (error) {
    const m = String(error.message || '');
    if (m.includes('plan_not_releasable')) return fail(422, 'plan_not_releasable');
    if (m.includes('not_a_trial_space')) return fail(409, 'not_a_trial_space');
    if (m.includes('subscription_not_found')) return fail(404, 'space_not_found');
    throw error;
  }
  return { status: 200, body: { released: true, organization_id: org, plan_id: (data as { plan_id?: string } | null)?.plan_id ?? plan } };
}
