/**
 * Núcleo único dos módulos do Zica Posts (padrão "strangler": módulos novos nascem aqui; os antigos continuam como estão e são ligados por adaptadores).
 *
 * Reúne o que todo módulo repetia: resolver usuário -> organização -> projeto -> papel, erros padronizados em português,
 * resposta padrão e o gancho do teto de gasto. NÃO decide regra de negócio de módulo nenhum.
 *
 * Regras:
 *  - papel e organização vêm SEMPRE do banco (organization_members), nunca do corpo da requisição;
 *  - módulo sem custo declara cost 'none' e nunca passa pelo teto de gasto; módulo com custo exige o guarda (falha fechada se ele não existir);
 *  - nenhum segredo, token ou e-mail entra em mensagem de erro ou em log.
 */

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Admin = any;
export type Reply = { status: number; body: Record<string, unknown> };

export type MinRole = 'member' | 'editor' | 'admin' | 'owner';
export type CostKind = 'none' | 'paid';

export const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, editor: 2 };
export const MIN_RANK: Record<MinRole, number> = { member: 1, editor: 2, admin: 3, owner: 4 };
/** Papéis que podem escrever (mesma lista dos handlers antigos). */
export const WRITE_ROLES = ['owner', 'admin', 'editor'];

/** Qualquer papel ativo que não seja dono/administrador/editor (ex.: leitor) conta como membro (nível 1); sem papel = 0. */
export const roleRank = (role: string | null | undefined): number => (role ? ROLE_RANK[role] ?? 1 : 0);
export const hasRole = (role: string | null | undefined, min: MinRole): boolean => roleRank(role) >= MIN_RANK[min];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Mensagens em português para os códigos de erro do núcleo e do portão. O código em inglês continua indo junto (a tela e os testes usam). */
export const ENGINE_MESSAGES: Record<string, string> = {
  user_session_required: 'Entre com a sua conta para continuar.',
  module_required: 'Informe o módulo.',
  action_required: 'Informe a ação.',
  unknown_module: 'Esse módulo não existe no portão.',
  unknown_action: 'Essa ação não existe nesse módulo.',
  project_id_required: 'Escolha o projeto.',
  organization_id_required: 'Escolha a organização.',
  organization_required: 'Escolha a organização.',
  project_not_found: 'Projeto não encontrado.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  role_not_allowed: 'Seu papel nesta organização permite ver, mas não fazer isso.',
  global_paid_services_blocked: 'Serviços pagos estão bloqueados globalmente. Esta ação não foi executada.',
  spend_guard_unavailable: 'Não foi possível conferir o teto de gasto agora. Por segurança, a ação paga não foi executada.',
  spend_denied: 'O teto de gasto do dia não permite esta ação agora.',
  engine_operation_failed: 'Não foi possível concluir agora. Tente de novo.',
  method_not_allowed: 'Método não permitido.',
  body_invalid: 'O pedido está malformado.',
  handler_missing: 'Este módulo ainda não está ligado ao portão.',
};
export const errorMessage = (code: string): string => ENGINE_MESSAGES[code] || 'Não foi possível concluir agora. Tente de novo.';

/** Erro do núcleo (com mensagem em português). Os handlers antigos devolvem só o código; ambos são aceitos pela tela. */
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, message: errorMessage(error), ...extra } });
export const ok = (body: Record<string, unknown>, status = 200): Reply => ({ status, body });

export interface ActorContext { userId: string; roleByOrg: Map<string, string> }

/** Organizações do usuário e o papel em cada uma (organization_members ativos). `includeOwner` soma o dono pela tabela de organizações (como o teto de gasto faz). */
export async function loadMemberships(admin: Admin, userId: string, opts: { includeOwner?: boolean } = {}): Promise<Map<string, string>> {
  const { data, error } = await admin.from('organization_members').select('organization_id,role').eq('user_id', userId).eq('status', 'active');
  if (error) throw error;
  const roleByOrg = new Map<string, string>(((data || []) as Array<{ organization_id: string; role: string | null }>).map((m) => [m.organization_id, String(m.role || '')]));
  if (opts.includeOwner) {
    const owned = await admin.from('organizations').select('id').eq('owner_user_id', userId);
    if (owned.error) throw owned.error;
    for (const o of (owned.data || []) as Array<{ id: string }>) roleByOrg.set(o.id, 'owner');
  }
  return roleByOrg;
}

export interface ProjectBase { id: string; name: string; domain: string | null; wordpress_url: string | null; organization_id: string }
export type ProjectScope = { ok: true; project: ProjectBase; role: string } | { ok: false; reply: Reply };

/** projectId -> projeto + papel do usuário na organização dele. Recusa (em português) projeto inexistente, de outra organização ou sem papel suficiente. */
export async function resolveProject(admin: Admin, ctx: { roleByOrg: Map<string, string> }, projectId: unknown, min: MinRole = 'member'): Promise<ProjectScope> {
  if (!isUuid(projectId)) return { ok: false, reply: fail(422, 'project_id_required') };
  const { data: project, error } = await admin.from('projects').select('id,name,domain,wordpress_url,organization_id').eq('id', projectId).maybeSingle();
  if (error) throw error;
  if (!project) return { ok: false, reply: fail(404, 'project_not_found') };
  const role = ctx.roleByOrg.get(project.organization_id) || null;
  if (!role) return { ok: false, reply: fail(403, 'organization_membership_required') };
  if (!hasRole(role, min)) return { ok: false, reply: fail(403, 'role_not_allowed') };
  return { ok: true, project: project as ProjectBase, role };
}

/** Organização que o pedido alcança (pelo projeto ou pelo organizationId); null quando o pedido não informa nenhuma. */
export async function resolveRequestOrganization(admin: Admin, body: Record<string, unknown>): Promise<string | null> {
  if (isUuid(body.projectId)) {
    const { data, error } = await admin.from('projects').select('organization_id').eq('id', body.projectId).maybeSingle();
    if (error) throw error;
    if (data?.organization_id) return String(data.organization_id);
    return null;
  }
  return isUuid(body.organizationId) ? body.organizationId : null;
}

// ------------------------------------------------------------------------------------------------------------ teto de gasto
export interface SpendQuery { module: string; action: string; organizationId: string; projectId: string | null; userId: string }
export type SpendVerdict = { allowed: true } | { allowed: false; status?: number; error?: string; message?: string };
/** Guarda do teto de gasto, injetado pela função de borda (que conhece o bloqueio global e o portão do banco). */
export type SpendGuard = (q: SpendQuery) => Promise<SpendVerdict>;

/**
 * Gancho do teto de gasto. Ação sem custo (cost 'none' e sem marca `paid`) NUNCA chama o guarda.
 * Ação paga sem guarda injetado é negada (falha fechada): nada pago sai sem alguém ter conferido o teto.
 */
export async function checkSpend(cost: CostKind, actionPaid: boolean, guard: SpendGuard | undefined, q: SpendQuery): Promise<Reply | null> {
  if (cost === 'none' && !actionPaid) return null;
  if (!guard) return fail(423, 'spend_guard_unavailable');
  let v: SpendVerdict;
  try { v = await guard(q); } catch { return fail(423, 'spend_guard_unavailable'); }
  if (v.allowed === true) return null;
  const code = v.error || 'spend_denied';
  return { status: v.status || 423, body: { error: code, message: v.message || errorMessage(code) } };
}

/** Envolve um handler: qualquer exceção vira 500 padronizado (sem expor detalhe) e só o nome do módulo vai ao log. */
export async function guarded(name: string, fn: () => Promise<Reply>): Promise<Reply> {
  try { return await fn(); } catch (_e) {
    console.error(`[${name}] operation_failed`);
    return fail(500, `${name}_operation_failed`);
  }
}

/** Lê uma tabela inteira do projeto em páginas de 1.000 (com teto), para somar na memória. `truncated` avisa quando o teto cortou. */
export async function loadAllRows<T = Record<string, unknown>>(admin: Admin, table: string, columns: string, filter: { col: string; val: unknown }, maxRows = 60_000): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += 1000) {
    const r = await admin.from(table).select(columns).eq(filter.col, filter.val).range(from, from + 999);
    if (r.error) throw r.error;
    rows.push(...((r.data || []) as T[]));
    if (!r.data || r.data.length < 1000) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** Executa `fn` sobre a lista com no máximo `n` em paralelo, mantendo a ordem dos resultados. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}
