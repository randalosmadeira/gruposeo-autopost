/**
 * Ações do funil de captação (módulo M1) na função de borda `funnel`.
 *
 *  - `get`:         devolve a definição do funil do projeto (ou o modelo sugerido pelo segmento do Perfil, se ainda não existe),
 *                   os números dos últimos meses e o papel de quem pediu.
 *  - `save_config`: grava a definição (etapas, colunas e indicadores). Controle de versão otimista: dois editores não se sobrescrevem.
 *  - `save_month`:  grava (ou limpa) os números de um mês, validados contra a definição do projeto.
 * Leitura: qualquer membro da organização. Escrita: dono, administrador e editor. A origem dos números é sempre "manual" por enquanto.
 * Nenhum dado pessoal entra aqui: só contagens e médias agregadas por mês.
 */
import { asObject, readValues, type SectionMap, type Stores } from './profile-model.ts';
import { cleanStrategy } from './nexus-business.ts';
import { WRITE_ROLES } from './profile-service.ts';
import { COUNCIL } from './profile-registry.ts';
import { MONTH_RE, configFromTemplate, monthsBack, suggestTemplate, validateConfig, validateMonth, type FunnelConfig, type FunnelEntries } from './funnel-core.ts';

export const FUNNEL_ACTIONS = ['get', 'save_config', 'save_month'];
export const HISTORY_MONTHS = 14;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface FunnelCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; now: () => number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });
const monthDate = (m: string) => `${m}-01`;
const monthOf = (d: string) => String(d).slice(0, 7);

export async function handleFunnelAction(admin: Admin, ctx: FunnelCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select('id,name,organization_id,nexus_strategy').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (ctx.action === 'get') return await getFunnel(admin, ctx, project, role);
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'save_config') return await saveConfig(admin, ctx, project);
    if (ctx.action === 'save_month') return await saveMonth(admin, ctx, project);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[funnel] operation_failed');
    return fail(500, 'funnel_operation_failed');
  }
}

async function segmentOf(admin: Admin, project: Record<string, unknown>): Promise<string | null> {
  const { data: ext, error } = await admin.from('project_profile_extended').select('sections').eq('project_id', project.id).maybeSingle();
  if (error) throw error;
  const stores: Stores = { strategy: cleanStrategy(project.nexus_strategy), sections: asObject(ext?.sections) as SectionMap, finance: {}, goals: {} };
  const seg = readValues(stores, false).seg;
  return typeof seg === 'string' && seg ? seg : null;
}

async function loadEntries(admin: Admin, projectId: string, months: string[]): Promise<FunnelEntries> {
  const oldest = months[months.length - 1];
  const { data, error } = await admin.from('project_funnel_entries').select('month,metric_key,value').eq('project_id', projectId).gte('month', monthDate(oldest));
  if (error) throw error;
  const out: FunnelEntries = {};
  for (const r of (data || []) as Array<{ month: string; metric_key: string; value: number | string }>) {
    const m = monthOf(r.month);
    if (!months.includes(m)) continue;
    (out[m] ||= {})[r.metric_key] = Number(r.value);
  }
  return out;
}

async function getFunnel(admin: Admin, ctx: FunnelCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const { data: row, error } = await admin.from('project_funnels').select('config,version,template,updated_at').eq('project_id', project.id).maybeSingle();
  if (error) throw error;
  const now = new Date(ctx.now());
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const months = monthsBack(current, HISTORY_MONTHS);
  const seg = await segmentOf(admin, project);
  const template = suggestTemplate(seg);
  const council = seg ? COUNCIL[seg]?.[1] || null : null;
  const stored = row ? validateConfig(row.config) : null;
  return {
    status: 200,
    body: {
      project: { id: project.id, name: project.name },
      role, can_write: WRITE_ROLES.includes(role),
      segment: seg, council,
      configured: !!row && !!stored?.ok,
      version: row ? Number(row.version) : 0,
      config: stored?.ok ? stored.value : null,
      // modelo pronto para a tela oferecer enquanto o funil não foi configurado (nada é gravado até o clique)
      suggested: { template, config: configFromTemplate(template, council) },
      current_month: current,
      months,
      entries: stored?.ok ? await loadEntries(admin, String(project.id), months) : {},
    },
  };
}

async function saveConfig(admin: Admin, ctx: FunnelCtx, project: Record<string, unknown>): Promise<Reply> {
  const checked = validateConfig(ctx.body.config);
  if (checked.ok === false) return fail(422, 'config_invalid', { reason: checked.error, where: checked.where });
  const expected = Number(ctx.body.expectedVersion);
  if (!Number.isInteger(expected) || expected < 0) return fail(422, 'expected_version_required');
  const config: FunnelConfig = checked.value;
  if (expected === 0) {
    const { error } = await admin.from('project_funnels').insert({ project_id: project.id, organization_id: project.organization_id, template: config.template, config, version: 1, updated_by: ctx.userId });
    if (error) { if ((error as { code?: string }).code === '23505') return fail(409, 'funnel_changed_reload'); throw error; }
    return { status: 200, body: { saved: true, version: 1, config } };
  }
  const { data, error } = await admin.from('project_funnels').update({ template: config.template, config, version: expected + 1, updated_by: ctx.userId }).eq('project_id', project.id).eq('version', expected).select('version').maybeSingle();
  if (error) throw error;
  if (!data) return fail(409, 'funnel_changed_reload');
  return { status: 200, body: { saved: true, version: expected + 1, config } };
}

async function saveMonth(admin: Admin, ctx: FunnelCtx, project: Record<string, unknown>): Promise<Reply> {
  const { data: row, error } = await admin.from('project_funnels').select('config').eq('project_id', project.id).maybeSingle();
  if (error) throw error;
  const stored = row ? validateConfig(row.config) : null;
  if (!stored || !stored.ok) return fail(409, 'funnel_not_configured');
  const checked = validateMonth(stored.value, ctx.body.month, ctx.body.values);
  if (checked.ok === false) return fail(422, 'month_values_invalid', { reason: checked.error, where: checked.where });
  const { month, set, clear } = checked.value;
  // no máximo o mês corrente (não se lança número de mês que ainda não começou)
  const now = new Date(ctx.now());
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (!MONTH_RE.test(month) || month > current) return fail(422, 'month_in_future');
  const rows = Object.entries(set).map(([metric_key, value]) => ({ project_id: project.id, organization_id: project.organization_id, month: monthDate(month), metric_key, value, source: 'manual', updated_by: ctx.userId }));
  if (rows.length) {
    const up = await admin.from('project_funnel_entries').upsert(rows, { onConflict: 'project_id,month,metric_key' });
    if (up.error) throw up.error;
  }
  if (clear.length) {
    const del = await admin.from('project_funnel_entries').delete().eq('project_id', project.id).eq('month', monthDate(month)).in('metric_key', clear);
    if (del.error) throw del.error;
  }
  return { status: 200, body: { saved: true, month, set: Object.keys(set).length, cleared: clear.length, entries: await loadEntries(admin, String(project.id), [month]) } };
}
