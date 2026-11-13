/**
 * NEXUS · plano de gerenciamento (gestor x cliente), 13/11/2026.
 *
 * Capacidade `can_manage_technical(user, org)` = gestor OU (organização interna E papel owner/admin).
 *  - gestor = usuário com `app_metadata.app_role = 'ceo'` (mesmo critério de `public.is_ceo()` e de `organization-console`);
 *    lido do cadastro do usuário no servidor (`auth.admin.getUserById`), nunca de `user_metadata` nem de campo enviado pelo cliente;
 *  - organização interna = `organizations.kind = 'internal'`; qualquer outro valor (inclusive nulo) é tratado como cliente;
 *  - em organização cliente nem o `owner` passa.
 *
 * Módulo sem efeitos colaterais de importação: a decisão é pura (`resolveViewer`) e o acesso a dados é injetável (`ManagementStore`).
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { OverviewProvider, ProviderStatus } from './nexus-providers.ts';

// ---------------------------------------------------------------------------
// Capacidade
// ---------------------------------------------------------------------------
export type ViewerRole = 'manager' | 'org_admin' | 'client';
export type Viewer = { role: ViewerRole; can_manage_technical: boolean };
export type CapabilityInput = { isManager: boolean; orgKind: string | null; memberRole: string | null; isOrgOwner: boolean };

export const ADMIN_ROLES = ['owner', 'admin'] as const;

/** Decisão pura da capacidade técnica. */
export function resolveViewer(input: CapabilityInput): Viewer {
  if (input.isManager) return { role: 'manager', can_manage_technical: true };
  const internal = input.orgKind === 'internal';
  const admin = input.isOrgOwner || (input.memberRole !== null && (ADMIN_ROLES as readonly string[]).includes(input.memberRole));
  if (internal && admin) return { role: 'org_admin', can_manage_technical: true };
  return { role: 'client', can_manage_technical: false };
}

/** Acesso a dados necessário para decidir a capacidade. */
export interface ManagementStore {
  isManagerUser(userId: string): Promise<boolean>;
  orgInfo(organizationId: string): Promise<{ kind: string | null; owner_user_id: string | null } | null>;
  /** Papel do usuário na organização quando o vínculo está ativo; null caso contrário. */
  activeMemberRole(organizationId: string, userId: string): Promise<string | null>;
}
export type ViewerContext = { viewer: Viewer; isMember: boolean; orgKind: string | null };

export async function loadViewer(store: ManagementStore, organizationId: string, userId: string): Promise<ViewerContext> {
  const [isManager, org, role] = await Promise.all([store.isManagerUser(userId), store.orgInfo(organizationId), store.activeMemberRole(organizationId, userId)]);
  const viewer = resolveViewer({ isManager, orgKind: org?.kind ?? null, memberRole: role, isOrgOwner: !!org && !!org.owner_user_id && org.owner_user_id === userId });
  return { viewer, isMember: role !== null || isManager, orgKind: org?.kind ?? null };
}

/** Implementação sobre o Supabase (service role). Falha de leitura NUNCA concede acesso: vira `false`/`null`. */
export function makeManagementStore(admin: SupabaseClient): ManagementStore {
  const managers = new Map<string, Promise<boolean>>(); // por requisição: evita consultar o mesmo usuário duas vezes
  return {
    isManagerUser(userId) {
      let known = managers.get(userId);
      if (!known) {
        known = (async () => {
          try {
            const { data, error } = await admin.auth.admin.getUserById(userId);
            return !error && data?.user?.app_metadata?.app_role === 'ceo';
          } catch { return false; }
        })();
        managers.set(userId, known);
      }
      return known;
    },
    async orgInfo(organizationId) {
      const { data, error } = await admin.from('organizations').select('kind,owner_user_id').eq('id', organizationId).maybeSingle();
      if (error || !data) return null;
      return { kind: typeof data.kind === 'string' ? data.kind : null, owner_user_id: typeof data.owner_user_id === 'string' ? data.owner_user_id : null };
    },
    async activeMemberRole(organizationId, userId) {
      const { data } = await admin.from('organization_members').select('role').eq('organization_id', organizationId).eq('user_id', userId).eq('status', 'active').maybeSingle();
      return typeof data?.role === 'string' ? data.role : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Matriz de ações (nexus-intelligence)
// ---------------------------------------------------------------------------
/** Ações técnicas: exigem `can_manage_technical` (HTTP 403 `manager_required`). */
export const TECHNICAL_ACTIONS = [
  'store_credential', 'provider_credential_remove', 'execution_settings_set', 'provider_health_check', 'search_performance_sync',
  'ga4_sync', 'project_integrations_set',
  // Decisão (mais restritiva): vincular o plugin (chave de sinais) e alterar o schema público da homepage também são ajustes técnicos.
  'signals_key_create', 'signals_key_rotate', 'homepage_schema_sync',
  // Decisão do dono (13/11/2026): a rodada paga de coleta (operações `serp` e `ai_observation` executadas por `execute`, que gastam crédito de
  // provedor) só pode ser disparada pela conta de gerenciamento. `execute_collection` NÃO é uma ação do corpo da requisição: é o nome da regra,
  // aplicado dentro de `execute` conforme o tipo da operação. A revisão editorial (`editorial_review`), que também passa por `execute`, não é afetada.
  'execute_collection',
] as const;
/** Leituras e solicitações: qualquer membro ativo. */
export const MEMBER_ACTIONS = ['providers_overview', 'search_performance', 'ga4_summary', 'content_performance', 'project_integrations_get', 'request_create', 'requests_list'] as const;
/** Só o gestor (CEO): atualizar solicitações. */
export const MANAGER_ONLY_ACTIONS = ['request_update'] as const;
/** Ações em que o gestor pode operar projeto de OUTRA pessoa/organização (ex.: organização cliente) sem ser o dono do projeto. */
export const MANAGER_PROJECT_ACTIONS: readonly string[] = [...TECHNICAL_ACTIONS, 'providers_overview', 'search_performance', 'ga4_summary', 'content_performance', 'project_integrations_get', 'requests_list', 'request_update'];

const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
export const isTechnicalAction = (v: unknown) => has(TECHNICAL_ACTIONS, v);
export const isManagerOnlyAction = (v: unknown) => has(MANAGER_ONLY_ACTIONS, v);
export const canManagerOperateOnForeignProject = (v: unknown) => has(MANAGER_PROJECT_ACTIONS, v);

export type PolicyDecision = { ok: true } | { ok: false; error: 'manager_required' };
/** Política de uma ação para o visualizador. Ações fora das listas não são tratadas aqui (seguem as regras antigas). */
export function checkActionPolicy(action: unknown, viewer: Viewer): PolicyDecision {
  if (isManagerOnlyAction(action)) return viewer.role === 'manager' ? { ok: true } : { ok: false, error: 'manager_required' };
  if (isTechnicalAction(action)) return viewer.can_manage_technical ? { ok: true } : { ok: false, error: 'manager_required' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Visão do cliente: nada técnico
// ---------------------------------------------------------------------------
export type SimpleStatus = 'connected' | 'attention' | 'not_connected';
export function simpleStatus(status: ProviderStatus): SimpleStatus {
  if (status === 'healthy') return 'connected';
  if (status === 'not_configured' || status === 'manual') return 'not_connected';
  return 'attention';
}

type OverviewShape = {
  generated_at: string; organization_id: string;
  program: { execution_enabled: boolean; budget_usd_micros: number; reserved_usd_micros: number; consumed_usd_micros: number; providers_enabled: string[] };
  summary: { score: number | null } & Record<string, unknown>;
  providers: OverviewProvider[];
};
export type ClientProvider = Omit<OverviewProvider, 'status'> & { status: ProviderStatus; simple_status: SimpleStatus; updated_at: string | null };

/**
 * Versão de `providers_overview` para quem NÃO gerencia: sem últimos 4 dígitos, sem detalhe de saúde, sem quota/latência/pontuação,
 * sem orçamento nem lista de provedores liberados. Mantém o mesmo formato (os campos técnicos vêm nulos/zerados) e acrescenta
 * `simple_status` (connected|attention|not_connected) e `updated_at` (última atualização). `status` vira um valor grosso
 * (healthy | degraded | not_configured | manual) para não revelar a causa técnica.
 */
export function redactOverviewForClient<T extends OverviewShape>(overview: T): Omit<T, 'providers' | 'program' | 'summary'> & { providers: ClientProvider[]; program: OverviewShape['program']; summary: { score: null } & Record<string, unknown> } {
  const providers: ClientProvider[] = overview.providers.map((p) => {
    const simple = simpleStatus(p.status);
    const status: ProviderStatus = p.status === 'manual' ? 'manual' : simple === 'connected' ? 'healthy' : simple === 'attention' ? 'degraded' : 'not_configured';
    const updated = p.health.last?.checked_at ?? p.credential.updated_at ?? null;
    return {
      id: p.id, category: p.category, status, simple_status: simple, score: null, enabled: false,
      credential: { stored: p.credential.stored, last_four: null, status: null, updated_at: null },
      health: { last: null, checks_7d: 0, ok_7d: 0, avg_latency_ms_7d: null },
      usage: { ...p.usage },
      updated_at: updated,
    };
  });
  const connected = providers.filter((p) => p.simple_status !== 'not_connected').length;
  const { providers: _p, program: _g, summary: _s, ...rest } = overview;
  return {
    ...rest,
    program: { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [] },
    summary: { total: providers.length, connected, attention: providers.filter((p) => p.simple_status === 'attention').length, not_connected: providers.filter((p) => p.simple_status === 'not_connected').length, score: null },
    providers,
  };
}

/** Regras de sistema (segurança/runtime) ficam ocultas de quem não gerencia. */
export const isSystemRuleId = (ruleId: string) => /^(security|runtime)\./.test(ruleId);

/** Chaves de `evidence` seguras para quem não gerencia (o resto, como últimos 4 dígitos, códigos HTTP e `last_fix`, é removido). */
const CLIENT_EVIDENCE_KEYS = ['hours', 'last_synced_at', 'source', 'rows', 'percent', 'remaining', 'limit', 'label', 'average_internal_links', 'total_contents', 'unclassified_percent', 'reopened_at'] as const;

type FindingLike = { rule_id: string; fix_action: unknown; evidence: Record<string, unknown> };
/** Achado para quem não gerencia: sem `fix_action` (não há botão Corrigir) e com `evidence` reduzida à lista segura. */
export function redactFindingForClient<T extends FindingLike>(finding: T): T {
  const evidence: Record<string, unknown> = {};
  for (const k of CLIENT_EVIDENCE_KEYS) if (finding.evidence && k in finding.evidence) evidence[k] = finding.evidence[k];
  return { ...finding, fix_action: null, evidence };
}
/** Filtra e reduz os achados conforme o visualizador. Gestor/org interna admin recebem tudo. */
export function findingsForViewer<T extends FindingLike>(findings: T[], viewer: Viewer): T[] {
  if (viewer.can_manage_technical) return findings;
  return findings.filter((f) => !isSystemRuleId(f.rule_id)).map(redactFindingForClient);
}

// ---------------------------------------------------------------------------
// Solicitações
// ---------------------------------------------------------------------------
export const REQUEST_KINDS = ['connect_source', 'plugin_link', 'plugin_update', 'new_observation_round', 'report', 'access', 'other'] as const;
export const REQUEST_STATUSES = ['open', 'in_progress', 'done', 'rejected'] as const;
export const MAX_OPEN_REQUESTS = 20;
export type RequestKind = typeof REQUEST_KINDS[number];
export type RequestStatus = typeof REQUEST_STATUSES[number];
const KIND_SET: readonly string[] = REQUEST_KINDS;
const STATUS_SET: readonly string[] = REQUEST_STATUSES;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseRequestCreate(body: Record<string, unknown>): Parsed<{ kind: RequestKind; message: string }> {
  if (typeof body.kind !== 'string' || !KIND_SET.includes(body.kind)) return { ok: false, error: 'request_kind_invalid' };
  if (typeof body.message !== 'string') return { ok: false, error: 'request_message_invalid' };
  const message = body.message.trim();
  if (message.length < 3 || message.length > 1000) return { ok: false, error: 'request_message_invalid' };
  return { ok: true, value: { kind: body.kind as RequestKind, message } };
}

export function parseRequestsFilter(body: Record<string, unknown>): Parsed<{ status: RequestStatus | null }> {
  if (body.status === undefined || body.status === null || body.status === '') return { ok: true, value: { status: null } };
  if (typeof body.status !== 'string' || !STATUS_SET.includes(body.status)) return { ok: false, error: 'request_status_invalid' };
  return { ok: true, value: { status: body.status as RequestStatus } };
}

export type RequestPatch = { status?: RequestStatus; manager_note?: string | null; resolved_at?: string | null };
export function parseRequestUpdate(body: Record<string, unknown>, nowIso: string): Parsed<{ id: string; patch: RequestPatch }> {
  if (!isUuid(body.id)) return { ok: false, error: 'request_id_required' };
  const patch: RequestPatch = {};
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUS_SET.includes(body.status)) return { ok: false, error: 'request_status_invalid' };
    patch.status = body.status as RequestStatus;
    patch.resolved_at = body.status === 'done' || body.status === 'rejected' ? nowIso : null;
  }
  if (body.managerNote !== undefined) {
    if (body.managerNote !== null && typeof body.managerNote !== 'string') return { ok: false, error: 'manager_note_invalid' };
    const note = typeof body.managerNote === 'string' ? body.managerNote.trim() : '';
    if (note.length > 1000) return { ok: false, error: 'manager_note_invalid' };
    patch.manager_note = note === '' ? null : note;
  }
  if (patch.status === undefined && patch.manager_note === undefined) return { ok: false, error: 'nothing_to_update' };
  return { ok: true, value: { id: body.id, patch } };
}

/** Códigos de erro do banco (mensagem fixa do RPC) → HTTP. */
export function requestRpcError(message: string | undefined): { error: string; status: number } {
  const m = String(message ?? '');
  if (m.includes('too_many_open_requests')) return { error: 'too_many_open_requests', status: 429 };
  if (m.includes('request_kind_invalid') || m.includes('request_message_invalid')) return { error: m.includes('kind') ? 'request_kind_invalid' : 'request_message_invalid', status: 400 };
  if (m.includes('organization_membership_required') || m.includes('project_forbidden')) return { error: m.includes('project') ? 'project_forbidden' : 'organization_membership_required', status: 403 };
  return { error: 'request_not_created', status: 500 };
}

// ---------------------------------------------------------------------------
// Integrações do projeto (ID GA4 / propriedade GSC)
// ---------------------------------------------------------------------------
export type IntegrationsInput = { setGa4: boolean; ga4: string; setGsc: boolean; gsc: string };

/** `sc-domain:exemplo.com.br` ou URL de prefixo `https://exemplo.com.br/` (https ou http, sem credenciais, sem espaços), até 200 caracteres. */
export function normalizeGscProperty(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 200 || /\s/.test(v) || [...v].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return null;
  if (v.startsWith('sc-domain:')) {
    const host = v.slice('sc-domain:'.length).toLowerCase();
    return /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(host) && host.includes('.') && !host.includes('..') ? `sc-domain:${host}` : null;
  }
  try {
    const u = new URL(v);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname.includes('.')) return null;
    return v;
  } catch { return null; }
}

/** `ga4PropertyId?` (somente dígitos, 5 a 15; vazio remove) e `gscProperty?` (vazio remove). Ao menos um dos dois. */
export function parseIntegrationsInput(body: Record<string, unknown>): Parsed<IntegrationsInput> {
  const out: IntegrationsInput = { setGa4: false, ga4: '', setGsc: false, gsc: '' };
  if (body.ga4PropertyId !== undefined && body.ga4PropertyId !== null) {
    const raw = typeof body.ga4PropertyId === 'number' ? String(body.ga4PropertyId) : body.ga4PropertyId;
    if (typeof raw !== 'string') return { ok: false, error: 'ga4_property_invalid' };
    const v = raw.trim();
    if (v !== '' && !/^\d{5,15}$/.test(v)) return { ok: false, error: 'ga4_property_invalid' };
    out.setGa4 = true; out.ga4 = v;
  } else if (body.ga4PropertyId === null) { out.setGa4 = true; }
  if (body.gscProperty !== undefined && body.gscProperty !== null) {
    if (typeof body.gscProperty !== 'string') return { ok: false, error: 'gsc_property_invalid' };
    const v = body.gscProperty.trim();
    if (v !== '') {
      const norm = normalizeGscProperty(v);
      if (!norm) return { ok: false, error: 'gsc_property_invalid' };
      out.gsc = norm;
    }
    out.setGsc = true;
  } else if (body.gscProperty === null) { out.setGsc = true; }
  if (!out.setGa4 && !out.setGsc) return { ok: false, error: 'nothing_to_update' };
  return { ok: true, value: out };
}

export function integrationsRpcError(message: string | undefined): { error: string; status: number } {
  const m = String(message ?? '');
  if (m.includes('ga4_property_already_used')) return { error: 'ga4_property_already_used', status: 409 };
  if (m.includes('ga4_property_invalid')) return { error: 'ga4_property_invalid', status: 400 };
  if (m.includes('gsc_property_invalid')) return { error: 'gsc_property_invalid', status: 400 };
  if (m.includes('project_forbidden')) return { error: 'project_forbidden', status: 403 };
  return { error: 'integrations_not_saved', status: 500 };
}

/** Visão das integrações: o gestor vê os valores; os demais só veem se estão configuradas. */
export function integrationsView(info: unknown, canManage: boolean): { ga4_property_id: string | null; gsc_property: string | null } | { ga4_configured: boolean; gsc_configured: boolean } {
  const o = info && typeof info === 'object' && !Array.isArray(info) ? info as Record<string, unknown> : {};
  const ga4 = typeof o.ga4_property_id === 'string' && o.ga4_property_id.trim() ? o.ga4_property_id.trim() : null;
  const gsc = typeof o.gsc_property === 'string' && o.gsc_property.trim() ? o.gsc_property.trim() : null;
  return canManage ? { ga4_property_id: ga4, gsc_property: gsc } : { ga4_configured: ga4 !== null, gsc_configured: gsc !== null };
}

// ---------------------------------------------------------------------------
// GA4: HTTP de cada código de erro do `ga4_sync`
// ---------------------------------------------------------------------------
export function ga4ErrorStatus(code: string): number {
  if (code === 'ga4_not_configured' || code === 'ga4_property_required') return 409;
  if (code === 'ga4_forbidden') return 403;
  if (code === 'ga4_quota') return 429;
  return 502;
}
