/**
 * Ações do pente fino do Perfil (marco P4) na função de borda `profile-analyze`.
 * Só leitura da internet pública, sem custo. Grava execução, verificações e achados nas tabelas do P1 (project_analysis_*), com a chave de serviço;
 * quem lê pelo navegador é protegido por RLS (membros da organização). Quem inicia ou decide precisa de papel de escrita no projeto.
 * O financeiro e as metas NUNCA entram aqui (só os valores públicos do perfil: CNPJ, endereços, site, redes).
 */
import { asObject, readValues, type SectionMap, type Stores } from './profile-model.ts';
import { cleanStrategy } from './nexus-business.ts';
import { WRITE_ROLES } from './profile-service.ts';
import { extractCeps, runAnalysis, runStatus, SOCIAL_KEYS, type Deps, type Inputs } from './profile-analyze-core.ts';

export const ANALYZE_ACTIONS = ['start', 'get', 'history', 'decide_finding'];
export const MAX_RUNS_PER_PROJECT_DAY = 12;
export const STALE_RUN_MS = 3 * 60_000;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface AnalyzeCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: Deps }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_COLUMNS = 'id,name,domain,organization_id,user_id,nexus_strategy,wordpress_url,social_instagram,social_linkedin,social_tiktok,social_youtube,social_twitter';
const CHECK_ORDER = ['cnpj_formato', 'cnpj_receita', 'cep', 'dominio_rdap', 'dns', 'site_resposta', 'robots_txt', 'sitemap', 'llms_txt', 'site_idade', 'redes_formato', 'maps_google_meu_negocio', 'ia_marca'];
const SEV = { alta: 0, media: 1, baixa: 2, info: 3 } as const;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });

export async function handleAnalyzeAction(admin: Admin, ctx: AnalyzeCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (ctx.action === 'get') return await getRun(admin, ctx, project);
    if (ctx.action === 'history') return await history(admin, project);
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'start') return await start(admin, ctx, project);
    if (ctx.action === 'decide_finding') return await decideFinding(admin, ctx, project);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[profile-analyze] operation_failed');
    return fail(500, 'analyze_operation_failed');
  }
}

// ------------------------------------------------------------------------------------------------------------ entradas (só valores públicos)
async function buildInputs(admin: Admin, project: Record<string, unknown>): Promise<Inputs> {
  const { data: ext, error } = await admin.from('project_profile_extended').select('sections').eq('project_id', project.id).maybeSingle();
  if (error) throw error;
  const stores: Stores = { strategy: cleanStrategy(project.nexus_strategy), sections: asObject(ext?.sections) as SectionMap, finance: {}, goals: {} };
  const values = readValues(stores, false);
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const firstSite = text(values.sites).split(/\r?\n/).map((l) => l.trim()).find(Boolean) || text(project.wordpress_url) || text(project.domain) || null;
  const socials: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const v = text(values[key]) || text(project[`social_${key}`]);
    if (v) socials[key] = v.slice(0, 300);
  }
  return {
    cnpj: text(values.cnpj) || null,
    cnpjStatus: text(values.cnpjstat) || null,
    ceps: extractCeps(values.endereco),
    siteUrl: firstSite,
    sitemapDeclared: typeof values.sitemap === 'string' ? values.sitemap : null,
    socials,
  };
}

// ------------------------------------------------------------------------------------------------------------ leitura de uma execução
async function loadRun(admin: Admin, run: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [checks, findings] = await Promise.all([
    admin.from('project_analysis_checks').select('check_key,source,status,measured,evidence_url,duration_ms,error').eq('run_id', run.id),
    admin.from('project_findings').select('id,check_key,severity,title,detail,evidence,suggested_action,state').eq('run_id', run.id),
  ]);
  if (checks.error || findings.error) throw new Error('analysis_read_failed');
  const orderOf = (k: string) => { const i = CHECK_ORDER.indexOf(k); return i === -1 ? 99 : i; };
  return {
    run: { id: run.id, status: run.status, created_at: run.created_at, started_at: run.started_at, finished_at: run.finished_at, summary: run.summary, error: run.error },
    checks: [...(checks.data || [])].sort((a: { check_key: string }, b: { check_key: string }) => orderOf(a.check_key) - orderOf(b.check_key)),
    findings: [...(findings.data || [])].sort((a: { severity: keyof typeof SEV; title: string }, b: { severity: keyof typeof SEV; title: string }) => SEV[a.severity] - SEV[b.severity] || a.title.localeCompare(b.title)),
  };
}

async function getRun(admin: Admin, ctx: AnalyzeCtx, project: Record<string, unknown>): Promise<Reply> {
  const runId = ctx.body.runId;
  if (typeof runId === 'string' && runId) {
    if (!UUID.test(runId)) return fail(422, 'run_id_invalid');
    const { data, error } = await admin.from('project_analysis_runs').select('*').eq('id', runId).eq('project_id', project.id).maybeSingle();
    if (error) throw error;
    if (!data) return fail(404, 'run_not_found');
    return { status: 200, body: await loadRun(admin, data) };
  }
  const { data, error } = await admin.from('project_analysis_runs').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  if (!data || !data.length) return { status: 200, body: { run: null, checks: [], findings: [] } };
  return { status: 200, body: await loadRun(admin, data[0]) };
}

async function history(admin: Admin, project: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await admin.from('project_analysis_runs').select('id,status,created_at,finished_at,summary').eq('project_id', project.id).order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  return { status: 200, body: { runs: data || [] } };
}

// ------------------------------------------------------------------------------------------------------------ iniciar
async function start(admin: Admin, ctx: AnalyzeCtx, project: Record<string, unknown>): Promise<Reply> {
  const requestKey = ctx.body.requestKey;
  if (typeof requestKey !== 'string' || requestKey.length < 8 || requestKey.length > 120) return fail(422, 'request_key_required');
  const now = ctx.deps.now();

  // repetição do mesmo pedido (duplo clique, nova tentativa de rede): devolve a execução que já existe
  const same = await admin.from('project_analysis_runs').select('*').eq('organization_id', project.organization_id).eq('request_key', requestKey).maybeSingle();
  if (same.error) throw same.error;
  if (same.data) {
    if (same.data.project_id !== project.id) return fail(409, 'request_key_in_use');
    return { status: 200, body: { ...(await loadRun(admin, same.data)), replayed: true } };
  }

  // uma execução por vez no projeto; as que travaram (função interrompida) são encerradas como falha
  const running = await admin.from('project_analysis_runs').select('id,started_at,created_at').eq('project_id', project.id).eq('status', 'running');
  if (running.error) throw running.error;
  let busy = false;
  for (const r of running.data || []) {
    const since = Date.parse(String(r.started_at || r.created_at));
    if (Number.isFinite(since) && now - since < STALE_RUN_MS) busy = true;
    else await admin.from('project_analysis_runs').update({ status: 'failed', error: 'interrompida', finished_at: new Date(now).toISOString() }).eq('id', r.id);
  }
  if (busy) return fail(409, 'already_running');

  const dayAgo = new Date(now - 86_400_000).toISOString();
  const today = await admin.from('project_analysis_runs').select('id').eq('project_id', project.id).gte('created_at', dayAgo);
  if (today.error) throw today.error;
  if ((today.data || []).length >= MAX_RUNS_PER_PROJECT_DAY) return fail(429, 'daily_limit', { limit: MAX_RUNS_PER_PROJECT_DAY });

  const inserted = await admin.from('project_analysis_runs').insert({
    organization_id: project.organization_id, project_id: project.id, requested_by: ctx.userId, request_key: requestKey, level: 'basico', status: 'running', started_at: new Date(now).toISOString(),
  }).select('*').single();
  if (inserted.error) {
    if ((inserted.error as { code?: string }).code === '23505') {
      const again = await admin.from('project_analysis_runs').select('*').eq('organization_id', project.organization_id).eq('request_key', requestKey).maybeSingle();
      if (again.data && again.data.project_id === project.id) return { status: 200, body: { ...(await loadRun(admin, again.data)), replayed: true } };
      return fail(409, 'request_key_in_use');
    }
    throw inserted.error;
  }
  const run = inserted.data as Record<string, unknown>;

  try {
    const inputs = await buildInputs(admin, project);
    const result = await runAnalysis(ctx.deps, inputs);
    const base = { run_id: run.id, organization_id: project.organization_id, project_id: project.id };
    const checkRows = result.checks.map((c) => ({ ...base, check_key: c.check_key, source: c.source, status: c.status, measured: c.measured, evidence_url: c.evidence_url, duration_ms: c.duration_ms, error: c.error }));
    const c = await admin.from('project_analysis_checks').insert(checkRows);
    if (c.error) throw c.error;
    if (result.findings.length) {
      const f = await admin.from('project_findings').insert(result.findings.map((x) => ({ ...base, check_key: x.check_key, severity: x.severity, title: x.title, detail: x.detail, evidence: x.evidence, suggested_action: x.suggested_action, state: 'open' })));
      if (f.error) throw f.error;
    }
    const status = runStatus(result.checks);
    const u = await admin.from('project_analysis_runs').update({ status, summary: result.summary, finished_at: new Date(ctx.deps.now()).toISOString() }).eq('id', run.id);
    if (u.error) throw u.error;
  } catch (_e) {
    console.error('[profile-analyze] run_failed');
    await admin.from('project_analysis_runs').update({ status: 'failed', error: 'falha_interna', finished_at: new Date(ctx.deps.now()).toISOString() }).eq('id', run.id);
    return fail(500, 'analyze_run_failed', { run_id: run.id });
  }
  const fresh = await admin.from('project_analysis_runs').select('*').eq('id', run.id).maybeSingle();
  return { status: 200, body: await loadRun(admin, fresh.data) };
}

// ------------------------------------------------------------------------------------------------------------ decidir achado
async function decideFinding(admin: Admin, ctx: AnalyzeCtx, project: Record<string, unknown>): Promise<Reply> {
  const findingId = ctx.body.findingId;
  const state = ctx.body.state;
  if (typeof findingId !== 'string' || !UUID.test(findingId)) return fail(422, 'finding_id_invalid');
  if (state !== 'open' && state !== 'applied' && state !== 'ignored') return fail(422, 'state_invalid');
  const { data, error } = await admin.from('project_findings').select('id,project_id').eq('id', findingId).maybeSingle();
  if (error) throw error;
  if (!data || data.project_id !== project.id) return fail(404, 'finding_not_found');
  const u = await admin.from('project_findings').update({ state, decided_by: state === 'open' ? null : ctx.userId, decided_at: state === 'open' ? null : new Date(ctx.deps.now()).toISOString() }).eq('id', findingId);
  if (u.error) throw u.error;
  return { status: 200, body: { id: findingId, state } };
}
