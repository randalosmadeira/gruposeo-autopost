/**
 * Execução das ações do Perfil do Projeto (marco P2) dentro da função de borda nexus-business.
 * As decisões (papel, versão, validação, o que gravar) vêm de profile-service.ts; aqui só se lê e se grava.
 * Toda escrita usa a chave de serviço: o cliente só LÊ as tabelas novas (política do P1). Nada aqui chama serviço pago.
 */
import { cleanStrategy, legacyStrategy } from './nexus-business.ts';
import { asObject, type SectionMap } from './profile-model.ts';
import {
  canReadPrivate, isFailure, isModuleFailure, isNoop, planModuleDecision, planProfileRestore, planProfileSave, WRITE_ROLES, MODULE_ROLES,
  type CurrentState, type SavePlan,
} from './profile-service.ts';

export const PROFILE_ACTIONS = ['profile_load', 'profile_save', 'profile_restore', 'modules_set', 'modules_preview'];

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
interface Ctx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_COLUMNS = 'id,name,domain,organization_id,user_id,nexus_business_id,nexus_strategy,nexus_strategy_version,nexus_profile_status,wordpress_url,nicho,social_instagram,social_linkedin,social_tiktok,social_youtube,social_links,editorial_identity,commercial_info,compliance_rules';

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });

export async function handleProfileAction(admin: Admin, ctx: Ctx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');

    if (ctx.action === 'profile_load') return { status: 200, body: await loadPayload(admin, project, role) };
    if (ctx.action === 'profile_save') return await save(admin, ctx, project, role);
    if (ctx.action === 'profile_restore') return await restore(admin, ctx, project, role);
    if (ctx.action === 'modules_set') return await setModule(admin, ctx, project, role);
    if (ctx.action === 'modules_preview') return await previewModule(admin, ctx, project, role);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[nexus-business] profile_operation_failed');
    return fail(500, 'business_operation_failed');
  }
}

// ------------------------------------------------------------------------------------------------------------ leitura
async function readRows(admin: Admin, project: Record<string, unknown>) {
  const [ext, priv] = await Promise.all([
    admin.from('project_profile_extended').select('version,sections,status,completeness,confirmed_at,updated_at').eq('project_id', project.id).maybeSingle(),
    admin.from('project_profile_private').select('version,finance,goals,updated_at').eq('project_id', project.id).maybeSingle(),
  ]);
  if (ext.error || priv.error) throw new Error('profile_read_failed');
  return { ext: ext.data, priv: priv.data };
}

function currentOf(project: Record<string, unknown>, ext: Record<string, unknown> | null, priv: Record<string, unknown> | null): CurrentState {
  return {
    strategy: cleanStrategy(project.nexus_strategy),
    strategyVersion: Number(project.nexus_strategy_version) || 0,
    extendedExists: !!ext,
    extendedVersion: ext ? Number(ext.version) || 1 : 0,
    sections: asObject(ext?.sections) as SectionMap,
    privateExists: !!priv,
    privateVersion: priv ? Number(priv.version) || 1 : 0,
    finance: asObject(priv?.finance),
    goals: asObject(priv?.goals),
  };
}

async function loadPayload(admin: Admin, project: Record<string, unknown>, role: string): Promise<Record<string, unknown>> {
  const { ext, priv } = await readRows(admin, project);
  const [snaps, catalog, decisions] = await Promise.all([
    admin.from('project_profile_snapshots').select('version,created_at,reason').eq('project_id', project.id).order('version', { ascending: false }).limit(15),
    admin.from('module_catalog').select('code,name,description,route,core,default_enabled,sort').order('sort'),
    admin.from('project_modules').select('module_code,enabled,reason,recommendation,recommendation_reason,decided_at,paused_state').eq('project_id', project.id),
  ]);
  if (snaps.error || catalog.error || decisions.error) throw new Error('profile_read_failed');
  const readPrivate = canReadPrivate(role);
  return {
    project: { id: project.id, name: project.name, domain: project.domain, organization_id: project.organization_id },
    role,
    can_write: WRITE_ROLES.includes(role),
    can_private: readPrivate,
    can_modules: MODULE_ROLES.includes(role),
    strategy: { data: cleanStrategy(project.nexus_strategy), version: Number(project.nexus_strategy_version) || 0, status: project.nexus_profile_status },
    legacy_strategy: legacyStrategy(project),
    extended: { version: ext ? Number(ext.version) : 0, sections: asObject(ext?.sections), status: ext?.status || 'draft', completeness: ext ? Number(ext.completeness) : 0, updated_at: ext?.updated_at || null, confirmed_at: ext?.confirmed_at || null },
    private: readPrivate ? { version: priv ? Number(priv.version) : 0, finance: asObject(priv?.finance), goals: asObject(priv?.goals) } : null,
    snapshots: snaps.data || [],
    modules: { catalog: catalog.data || [], decisions: (decisions.data || []).map(withPausedCounts) },
  };
}

// ------------------------------------------------------------------------------------------------------------ gravação
async function execute(admin: Admin, ctx: Ctx, project: Record<string, unknown>, role: string, plan: SavePlan): Promise<Reply> {
  if (isFailure(plan)) return fail(plan.status, plan.error, { fields: plan.fields, stores: plan.stores });
  if (isNoop(plan)) return { status: 200, body: { success: true, noop: true, ...(await loadPayload(admin, project, role)) } };
  const saved: string[] = [];
  const partial = (stores: string[]): Reply => fail(409, 'profile_changed_reload', { stores, saved });

  // 1) perfil estendido: é o "pivô" da versão
  const e = plan.extended;
  if (e.insert) {
    const { error } = await admin.from('project_profile_extended').insert({ project_id: project.id, organization_id: project.organization_id, version: 1, sections: e.sections, completeness: e.completeness, updated_by: ctx.userId });
    if (error) { if (error.code === '23505') return partial(['extended']); throw error; }
  } else {
    const { data, error } = await admin.from('project_profile_extended').update({ sections: e.sections, completeness: e.completeness, version: e.nextVersion, updated_by: ctx.userId }).eq('project_id', project.id).eq('version', e.expectedVersion).select('version').maybeSingle();
    if (error) throw error;
    if (!data) return partial(['extended']);
  }
  saved.push('extended');

  // 2) estratégia (as 36 chaves antigas); cria o negócio vinculado se ainda não existir, como a tela antiga faz
  if (plan.strategy) {
    let businessId = project.nexus_business_id as string | null;
    if (!businessId) {
      const entity = ['company', 'brand', 'product', 'portal', 'site', 'campaign'].includes(plan.strategy.data.entityType) ? plan.strategy.data.entityType : 'company';
      const { data: b, error: be } = await admin.from('nexus_businesses').insert({ user_id: project.user_id, organization_id: project.organization_id, name: plan.strategy.data.businessName || project.name, entity_type: entity }).select('id').single();
      if (be) throw be;
      businessId = b.id;
    }
    const { data, error } = await admin.from('projects').update({ nexus_business_id: businessId, nexus_strategy: plan.strategy.data }).eq('id', project.id).eq('nexus_strategy_version', plan.strategy.expectedVersion).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return partial(['strategy']);
    saved.push('strategy');
  }

  // 3) financeiro e metas (só dono e administrador chegam até aqui)
  if (plan.private) {
    const p = plan.private;
    if (p.insert) {
      const { error } = await admin.from('project_profile_private').insert({ project_id: project.id, organization_id: project.organization_id, version: 1, finance: p.finance, goals: p.goals, updated_by: ctx.userId });
      if (error) { if (error.code === '23505') return partial(['private']); throw error; }
    } else {
      const { data, error } = await admin.from('project_profile_private').update({ finance: p.finance, goals: p.goals, version: p.nextVersion, updated_by: ctx.userId }).eq('project_id', project.id).eq('version', p.expectedVersion).select('version').maybeSingle();
      if (error) throw error;
      if (!data) return partial(['private']);
    }
    saved.push('private');
  }

  // 4) versão guardada (sem financeiro). Falha aqui não desfaz a gravação: só deixa de existir esse ponto de volta.
  const { error: snapError } = await admin.from('project_profile_snapshots').insert({ organization_id: project.organization_id, project_id: project.id, version: plan.snapshot.version, snapshot: plan.snapshot.snapshot, reason: plan.snapshot.reason, created_by: ctx.userId });
  if (snapError) console.error('[nexus-business] profile_snapshot_failed');

  const { data: fresh, error: freshError } = await admin.from('projects').select(PROJECT_COLUMNS).eq('id', project.id).maybeSingle();
  if (freshError || !fresh) throw freshError || new Error('reload_failed');
  return { status: 200, body: { success: true, noop: false, changed: plan.changed, ignored: plan.ignored, saved, ...(await loadPayload(admin, fresh, role)) } };
}

async function currentFor(admin: Admin, project: Record<string, unknown>): Promise<CurrentState> {
  const { ext, priv } = await readRows(admin, project);
  return currentOf(project, ext, priv);
}

async function save(admin: Admin, ctx: Ctx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const plan = planProfileSave({ role, current: await currentFor(admin, project), changes: ctx.body.changes, expected: ctx.body.expected, reason: ctx.body.reason });
  return execute(admin, ctx, project, role, plan);
}

async function restore(admin: Admin, ctx: Ctx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const version = Number(ctx.body.version);
  if (!Number.isInteger(version) || version < 1) return fail(422, 'version_required');
  const { data: snap, error } = await admin.from('project_profile_snapshots').select('snapshot').eq('project_id', project.id).eq('version', version).maybeSingle();
  if (error) throw error;
  if (!snap) return fail(404, 'version_not_found');
  const plan = planProfileRestore({ role, current: await currentFor(admin, project), snapshot: snap.snapshot, version, expected: ctx.body.expected });
  return execute(admin, ctx, project, role, plan);
}

/** Decisão com o resumo do que está pausado (só quantidades; os ids ficam no banco). */
function withPausedCounts(row: Record<string, unknown>): Record<string, unknown> {
  const { paused_state: state, ...rest } = row;
  const paused: Record<string, number> = {};
  for (const [table, ids] of Object.entries(asObject(state))) if (Array.isArray(ids) && ids.length) paused[table] = ids.length;
  return { ...rest, paused };
}

const isMissingFunction = (e: unknown) => ['PGRST202', '42883'].includes(String((e as { code?: string } | null)?.code || ''));

async function setModule(admin: Admin, ctx: Ctx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const { data: catalog, error } = await admin.from('module_catalog').select('code,core');
  if (error) throw error;
  const plan = planModuleDecision({ role, catalog: catalog || [], moduleCode: ctx.body.moduleCode, enabled: ctx.body.enabled, reason: ctx.body.reason });
  if (isModuleFailure(plan)) return fail(plan.status, plan.error);
  // A decisão e o efeito nas rotinas acontecem na MESMA transação do banco (apply_project_module): ou os dois, ou nenhum.
  const { data, error: rpcError } = await admin.rpc('apply_project_module', { p_project: project.id, p_module: plan.row.module_code, p_enabled: plan.row.enabled, p_reason: plan.row.reason, p_actor: ctx.userId });
  if (rpcError) {
    if (isMissingFunction(rpcError)) return fail(503, 'module_effects_unavailable');
    throw rpcError;
  }
  return { status: 200, body: { success: true, effects: asObject(data).effects || [], ...(await loadPayload(admin, project, role)) } };
}

/** O que o desligamento pausaria agora, sem mudar nada (a tela mostra antes de a pessoa confirmar). */
async function previewModule(admin: Admin, ctx: Ctx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const { data: catalog, error } = await admin.from('module_catalog').select('code,core');
  if (error) throw error;
  const plan = planModuleDecision({ role, catalog: catalog || [], moduleCode: ctx.body.moduleCode, enabled: false, reason: null });
  if (isModuleFailure(plan)) return fail(plan.status, plan.error);
  const { data, error: rpcError } = await admin.rpc('preview_project_module', { p_project: project.id, p_module: plan.row.module_code });
  if (rpcError) {
    if (isMissingFunction(rpcError)) return fail(503, 'module_effects_unavailable');
    throw rpcError;
  }
  return { status: 200, body: { module: plan.row.module_code, effects: Array.isArray(data) ? data : [] } };
}
