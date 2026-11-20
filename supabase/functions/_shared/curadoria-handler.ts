/**
 * Ações da Curadoria de conteúdo no portão `engine` (módulo `curadoria`). NENHUMA chama IA, busca paga ou serviço externo: custo zero por desenho.
 *
 *  - resumo:          contagem por projeto x status do artigo x estado da curadoria (inclui "sem curadoria" e "desatualizada").
 *  - listar:          artigos (paginado) com filtros de projeto, status e estado.
 *  - detalhe:         o relatório de um artigo (o gravado, ou calculado agora quando não há gravado / pedido `recalcular`).
 *  - rodar:           curadoria determinística em lote (N por chamada, com teto de tempo), SÓ em artigos NÃO publicados; grava `article_curation`.
 *  - prompts_abertos: perguntas do Observatório de IA sem artigo que as cubra (e com a correspondência usada).
 *  - imagens:         diagnóstico de repetição de imagens e lista de artigos que precisam de imagem nova, por prioridade.
 * Leitura: qualquer membro. `rodar`: dono, administrador e editor. Papel e organização vêm SEMPRE do banco (resolveProject), nunca do corpo.
 * `rodar` NÃO altera o artigo: só grava o relatório. Artigo publicado nunca é tocado.
 */
import { fail, isUuid, ok, resolveProject, type Admin, type MinRole, type ProjectBase, type Reply } from './engine-kernel.ts';
import { loadAll, UNBOUNDED, loadNodes, loadScope } from './taxonomy-shared.ts';
import { readValues, asObject, type SectionMap } from './profile-model.ts';
import { cleanStrategy } from './nexus-business.ts';
import { PROJECT_COLUMNS, profileFromProject, originOf } from './studio-profile.ts';
import { resolveRuleProfile, type RuleProfile } from './optimization-rules.ts';
import { loadLinkCandidates } from './auto-optimize-handler.ts';
import {
  CURADORIA_VERSION, PROMPT_RULE, STATUS_LABEL, STATUS_PRIORITY, buildImageUsage, curateArticle, imageKey, promptCoverage,
  type CurationArticle, type CurationContext, type CurationReport, type PromptRef, type TextRef,
} from './curadoria-core.ts';

type Rec = Record<string, unknown>;
export interface CuradoriaDeps { now: () => number; budgetMs?: number }
export interface CuradoriaCtx { action: string; body: Rec; userId: string; roleByOrg: Map<string, string>; deps: CuradoriaDeps }

export const CURADORIA_MIN_ROLE: Record<string, MinRole> = { resumo: 'member', listar: 'member', detalhe: 'member', prompts_abertos: 'member', imagens: 'member', rodar: 'editor' };
export const CURADORIA_ACTIONS = Object.keys(CURADORIA_MIN_ROLE);

/** status que a curadoria avalia (tudo que ainda não saiu) */
export const CURATED_STATUSES = ['generating', 'draft', 'ready', 'error'] as const;
const DEFAULT_RUN_STATUSES = ['generating', 'draft', 'ready'];
export const CURATION_STATES = ['sem_curadoria', 'desatualizada', 'aprovado', 'precisa_correcao', 'bloqueado'] as const;
type CurState = (typeof CURATION_STATES)[number];
const DEFAULT_BUDGET_MS = 40_000;

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const num = (v: unknown, d: number, min: number, max: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const isoOk = (v: unknown): number | null => { if (typeof v !== 'string') return null; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const shortUrl = (u: unknown) => { const s = String(u ?? ''); return /^data:/i.test(s) ? 'imagem embutida no registro (base64)' : s.slice(0, 300); };

export async function handleCuradoriaAction(admin: Admin, ctx: CuradoriaCtx): Promise<Reply> {
  try {
    if (!Object.prototype.hasOwnProperty.call(CURADORIA_MIN_ROLE, ctx.action)) return fail(400, 'unknown_action');
    if (ctx.action === 'resumo' && !isUuid(ctx.body.projectId)) return await resumoOrganizacao(admin, ctx);
    const scope = await resolveProject(admin, ctx, ctx.body.projectId, CURADORIA_MIN_ROLE[ctx.action]);
    if (scope.ok === false) return scope.reply;
    const project = scope.project;
    switch (ctx.action) {
      case 'resumo': return ok(await resumoProjeto(admin, project));
      case 'listar': return await listar(admin, ctx, project);
      case 'detalhe': return await detalhe(admin, ctx, project);
      case 'rodar': return await rodar(admin, ctx, project);
      case 'prompts_abertos': return await promptsAbertos(admin, ctx, project);
      case 'imagens': return await imagens(admin, ctx, project);
      default: return fail(400, 'unknown_action');
    }
  } catch (_e) {
    console.error('[curadoria] operation_failed');
    return fail(500, 'curadoria_operation_failed');
  }
}

// ------------------------------------------------------------------------------------------------------------------ leitura leve
interface LightArticle { id: string; status: string; title: string | null; keyword: string | null; created_at: string | null; updated_at: string | null; featured_image_url: string | null }
interface CurRow { article_id: string; estado: string; nota: number | null; image_state: string; image_uses: number | null; curated_at: string; version: number; content_hash?: string; article_status?: string | null }

const loadLight = async (admin: Admin, projectId: string): Promise<LightArticle[]> =>
  (await loadAll<LightArticle>(admin, 'articles', 'id,status,title,keyword,created_at,updated_at,featured_image_url', { col: 'project_id', val: projectId }, UNBOUNDED)).rows;
const loadCuration = async (admin: Admin, projectId: string): Promise<Map<string, CurRow>> => {
  const rows = (await loadAll<CurRow>(admin, 'article_curation', 'article_id,estado,nota,image_state,image_uses,curated_at,version,article_status', { col: 'project_id', val: projectId }, UNBOUNDED)).rows;
  return new Map(rows.map((r) => [r.article_id, r]));
};

/** estado da curadoria de um artigo: gravada e ainda valendo, ou "sem curadoria"/"desatualizada" (artigo mudou depois, ou regras novas) */
export function curationState(a: Pick<LightArticle, 'updated_at'>, cur: CurRow | undefined): CurState {
  if (!cur) return 'sem_curadoria';
  const upd = a.updated_at ? Date.parse(a.updated_at) : 0;
  if (cur.version !== CURADORIA_VERSION || (upd && Date.parse(cur.curated_at) < upd)) return 'desatualizada';
  return (cur.estado === 'aprovado' || cur.estado === 'precisa_correcao' || cur.estado === 'bloqueado') ? cur.estado : 'desatualizada';
}

const emptyCounts = () => ({ total: 0, sem_curadoria: 0, desatualizada: 0, aprovado: 0, precisa_correcao: 0, bloqueado: 0 });

async function resumoProjeto(admin: Admin, project: ProjectBase): Promise<Rec> {
  const [arts, cur] = await Promise.all([loadLight(admin, project.id), loadCuration(admin, project.id)]);
  const por_status: Record<string, ReturnType<typeof emptyCounts>> = {};
  for (const s of CURATED_STATUSES) por_status[s] = emptyCounts();
  let publicados = 0; let porImagem = 0;
  for (const a of arts) {
    if (a.status === 'published') { publicados++; continue; }
    const bucket = por_status[a.status];
    if (!bucket) continue;
    const c = cur.get(a.id);
    const st = curationState(a, c);
    bucket.total++; bucket[st]++;
    if (st === 'bloqueado' && c && (c.image_state === 'repetida' || c.image_state === 'ausente')) porImagem++;
  }
  const totais = emptyCounts();
  for (const s of CURATED_STATUSES) for (const k of Object.keys(totais) as Array<keyof typeof totais>) totais[k] += por_status[s][k];
  return {
    project_id: project.id, name: project.name, total_artigos: arts.length, por_status, totais, bloqueados_por_imagem: porImagem,
    publicados: { total: publicados, observacao: 'Artigos já publicados não passam pela curadoria nem são alterados por ela; o portão vale para o que ainda vai sair.' },
    rotulos: STATUS_LABEL, versao_das_regras: CURADORIA_VERSION,
  };
}

async function resumoOrganizacao(admin: Admin, ctx: CuradoriaCtx): Promise<Reply> {
  const org = ctx.body.organizationId;
  if (!isUuid(org)) return fail(422, 'project_id_required');
  if (!ctx.roleByOrg.get(org)) return fail(403, 'organization_membership_required');
  const r = await admin.from('projects').select('id,name,domain,wordpress_url,organization_id').eq('organization_id', org);
  if (r.error) throw r.error;
  const projects: Rec[] = [];
  for (const p of (r.data || []) as ProjectBase[]) projects.push(await resumoProjeto(admin, p));
  return ok({ organization_id: org, projects });
}

// ------------------------------------------------------------------------------------------------------------------ listar
async function listar(admin: Admin, ctx: CuradoriaCtx, project: ProjectBase): Promise<Reply> {
  const status = typeof ctx.body.status === 'string' ? ctx.body.status : 'todos';
  if (status !== 'todos' && !(CURATED_STATUSES as readonly string[]).includes(status)) return fail(422, 'status_invalid');
  const estado = typeof ctx.body.estado === 'string' ? ctx.body.estado : '';
  if (estado && !(CURATION_STATES as readonly string[]).includes(estado)) return fail(422, 'estado_invalid');
  const q = clip(ctx.body.q, 120).toLowerCase();
  const pageSize = num(ctx.body.pageSize, 50, 1, 100);
  const page = num(ctx.body.page, 1, 1, 10_000);
  const [arts, cur] = await Promise.all([loadLight(admin, project.id), loadCuration(admin, project.id)]);
  const rows = arts
    .filter((a) => (CURATED_STATUSES as readonly string[]).includes(a.status) && (status === 'todos' || a.status === status))
    .filter((a) => !q || `${a.title || ''} ${a.keyword || ''}`.toLowerCase().includes(q))
    .map((a) => { const c = cur.get(a.id); return { a, c, st: curationState(a, c) }; })
    .filter((x) => !estado || x.st === estado)
    .sort((x, y) => (STATUS_PRIORITY[x.a.status] ?? 9) - (STATUS_PRIORITY[y.a.status] ?? 9) || String(x.a.created_at).localeCompare(String(y.a.created_at)));
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  return ok({
    project_id: project.id, total: rows.length, page, pageSize,
    artigos: slice.map(({ a, c, st }) => ({
      article_id: a.id, title: a.title, keyword: a.keyword, status: a.status, status_rotulo: STATUS_LABEL[a.status] ?? a.status, updated_at: a.updated_at,
      estado: st, estado_gravado: c?.estado ?? null, nota: c?.nota ?? null, image_state: c?.image_state ?? null, image_uses: c?.image_uses ?? null, curated_at: c?.curated_at ?? null,
    })),
  });
}

// ------------------------------------------------------------------------------------------------------------------ contexto
const toRefs = (rows: Rec[], col: string): TextRef[] => rows.map((r) => ({ id: String(r.id), label: String(r[col] ?? '') })).filter((r) => r.label);

/** Lê o que cada módulo sabe do projeto. Módulo não instalado/sem leitura vira null ("sem dados"): nunca derruba a curadoria. */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> { try { return await fn(); } catch { return null; } }

export async function loadCurationContext(admin: Admin, project: ProjectBase, nowMs: number): Promise<{ ctx: CurationContext; row: Rec }> {
  const p = await admin.from('projects').select(PROJECT_COLUMNS).eq('id', project.id).maybeSingle();
  const row: Rec = (p?.data || { ...project }) as Rec;
  const ext = await safe(async () => (await admin.from('project_profile_extended').select('sections').eq('project_id', project.id).maybeSingle()).data);
  const values = readValues({ strategy: cleanStrategy(row.nexus_strategy), sections: asObject(ext?.sections) as SectionMap, finance: {}, goals: {} }, false);
  const { profile } = profileFromProject(row, values as Record<string, unknown>);
  const funnel = await safe(async () => { const r = await admin.from('project_funnels').select('template').eq('project_id', project.id).maybeSingle(); if (r.error) throw r.error; return { configured: !!r.data, template: (r.data?.template as string) ?? null }; });
  const taxonomy = await safe(async () => (await loadNodes(admin, project.id)).map((n) => ({ id: n.id, label: n.label, slug: n.slug, kind: n.kind, keywords: n.keywords, status: n.status })));
  const geo = await safe(async () => (await loadScope(admin, project.id)).map((g) => ({ uf: g.uf, municipio: g.municipio, bairro: g.bairro ?? null, regiao: g.regiao, status: (g as unknown as Rec).status as string | undefined })));
  const prompts = await safe(async () => (await loadPrompts(admin, project.id)).prompts);
  const market = await safe(async () => toRefs((await loadAll<Rec>(admin, 'market_queries', 'id,query', { col: 'project_id', val: project.id }, 3000)).rows, 'query'));
  const radar = await safe(async () => {
    const f = (await loadAll<Rec>(admin, 'project_focuses', 'id,name,topics,status', { col: 'project_id', val: project.id }, 500)).rows.filter((x) => x.status === 'ativo' || x.status === undefined);
    const out: TextRef[] = [];
    for (const x of f) { out.push({ id: String(x.id), label: String(x.name), kind: 'foco' }); for (const t of (Array.isArray(x.topics) ? x.topics : []) as string[]) out.push({ id: `${x.id}:${t}`, label: String(t), kind: 'tema' }); }
    return out;
  });
  const usageRows = (await loadAll<{ id: string; featured_image_url: string | null }>(admin, 'articles', 'id,featured_image_url', { col: 'project_id', val: project.id }, UNBOUNDED)).rows;
  const maxImageUses = await loadMaxImageUses(admin, project.id);
  const candidates = (await safe(() => loadLinkCandidates(admin, project.id, ''))) || [];
  const origin = originOf(row);
  const rules = resolveRuleProfile({ projectIdentity: row.editorial_identity, projectStrategy: row.nexus_strategy && typeof row.nexus_strategy === 'object' ? row.nexus_strategy as Rec : null, articleConfig: null, prompts: [] }) as RuleProfile;
  return {
    row,
    ctx: {
      now: nowMs, project: row, profile, rules, funnel, taxonomy, geo, prompts, market, radar,
      indexation: null, backlinks: null, inbound: null,
      siteHost: origin ? new URL(origin).hostname.replace(/^www\./, '') : null,
      candidates, imageUsage: buildImageUsage(usageRows), maxImageUses,
    },
  };
}

/** limite de artigos por imagem deste projeto (curadoria_project_rules); sem regra ou sem a tabela = 1 */
export async function loadMaxImageUses(admin: Admin, projectId: string): Promise<number> {
  const r = await safe(async () => { const q = await admin.from('curadoria_project_rules').select('max_image_uses').eq('project_id', projectId).maybeSingle(); if (q.error) throw q.error; return q.data; });
  const n = Number((r as Rec | null)?.max_image_uses);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.floor(n) : 1;
}

async function loadPrompts(admin: Admin, projectId: string): Promise<{ prompts: PromptRef[]; sets: number }> {
  const sets = (await loadAll<Rec>(admin, 'nexus_prompt_sets', 'id,name,status', { col: 'project_id', val: projectId }, 2000)).rows;
  const names = new Map(sets.map((s) => [String(s.id), String(s.name ?? '')]));
  const rows = (await loadAll<Rec>(admin, 'nexus_prompts', 'id,query,topic,intent,prompt_set_id,active', { col: 'project_id', val: projectId }, UNBOUNDED)).rows.filter((r) => r.active !== false);
  return { sets: sets.length, prompts: rows.map((r) => ({ id: String(r.id), query: String(r.query ?? ''), topic: (r.topic as string | null) ?? null, intent: (r.intent as string | null) ?? null, set_name: names.get(String(r.prompt_set_id)) ?? null })).filter((p) => p.query) };
}

const FULL_COLUMNS = 'id,project_id,organization_id,title,keyword,secondary_keywords,excerpt,content,slug,status,language,type,featured_image_url,image_prompt,image_source,nicho_detectado,published_url,config,created_at,updated_at';
const asCurationArticle = (r: Rec): CurationArticle => r as unknown as CurationArticle;

// ------------------------------------------------------------------------------------------------------------------ rodar
function curationRow(project: ProjectBase, r: CurationReport, userId: string): Rec {
  return {
    article_id: r.article_id, organization_id: project.organization_id, project_id: project.id, estado: r.estado, nota: r.nota, image_state: r.imagem.estado,
    image_key: r.imagem.chave ? r.imagem.chave.slice(0, 600) : null, image_uses: r.imagem.usos, checks: r, content_hash: r.content_hash, article_status: r.article_status,
    version: CURADORIA_VERSION, curated_at: r.evaluated_at, curated_by: userId,
  };
}

async function rodar(admin: Admin, ctx: CuradoriaCtx, project: ProjectBase): Promise<Reply> {
  const t0 = ctx.deps.now();
  const budget = num(ctx.body.budgetMs, ctx.deps.budgetMs ?? DEFAULT_BUDGET_MS, 1000, 120_000);
  const limit = num(ctx.body.limit, 20, 1, 100);
  const wanted = Array.isArray(ctx.body.statuses) ? (ctx.body.statuses as unknown[]).filter((s): s is string => typeof s === 'string') : DEFAULT_RUN_STATUSES;
  const statuses = wanted.filter((s) => (CURATED_STATUSES as readonly string[]).includes(s));
  if (!statuses.length) return fail(422, 'status_invalid');
  const refazer = ctx.body.refazer === true;
  const desde = isoOk(ctx.body.desde);
  if (refazer && desde === null) return fail(422, 'desde_required', { message: 'Para refazer tudo, informe a hora de início da rodada (desde).' });

  const [arts, cur] = await Promise.all([loadLight(admin, project.id), loadCuration(admin, project.id)]);
  const mine = arts.filter((a) => statuses.includes(a.status));
  const pending = mine.filter((a) => {
    const c = cur.get(a.id);
    const st = curationState(a, c);
    if (st === 'sem_curadoria' || st === 'desatualizada') return true;
    if (desde === null || !c) return false;
    // imagem bloqueada pode ter sido resolvida em outro artigo: reconfere uma vez por rodada (curated_at antes do início da rodada)
    const before = Date.parse(c.curated_at) < desde;
    return before && (refazer || c.image_state === 'repetida');
  }).sort((x, y) => (STATUS_PRIORITY[x.status] ?? 9) - (STATUS_PRIORITY[y.status] ?? 9) || String(x.created_at).localeCompare(String(y.created_at)));

  const batch = pending.slice(0, limit);
  const processados: Array<{ article_id: string; title: string | null; status: string; estado: string; bloqueios: string[]; faltando: string[] }> = [];
  const estados: Record<string, number> = { aprovado: 0, precisa_correcao: 0, bloqueado: 0 };
  let cortadoPeloTempo = false;
  if (batch.length) {
    const { ctx: cctx } = await loadCurationContext(admin, project, ctx.deps.now());
    const full = await admin.from('articles').select(FULL_COLUMNS).eq('project_id', project.id).in('id', batch.map((b) => b.id));
    if (full.error) throw full.error;
    const byId = new Map<string, Rec>(((full.data || []) as Rec[]).map((r) => [String(r.id), r]));
    const buffer: Rec[] = [];
    const flush = async () => { if (!buffer.length) return; const w = await admin.from('article_curation').upsert(buffer.splice(0), { onConflict: 'article_id' }); if (w.error) throw w.error; };
    for (const b of batch) {
      if (ctx.deps.now() - t0 > budget) { cortadoPeloTempo = true; break; }
      const raw = byId.get(b.id);
      if (!raw) continue;
      const art = asCurationArticle(raw);
      if (art.status === 'published' || art.published_url) continue; // a curadoria nunca avalia nem grava sobre o que já saiu
      cctx.now = ctx.deps.now();
      const rep = await curateArticle(art, cctx);
      buffer.push(curationRow(project, rep, ctx.userId));
      estados[rep.estado]++;
      processados.push({ article_id: rep.article_id, title: art.title, status: art.status, estado: rep.estado, bloqueios: rep.bloqueios, faltando: rep.faltando });
      if (buffer.length >= 10) await flush();
    }
    await flush();
  }
  const restantes = pending.length - processados.length;
  return ok({
    project_id: project.id, processados: processados.length, restantes, concluido: restantes === 0, cortado_pelo_tempo: cortadoPeloTempo,
    estados, artigos: processados.slice(0, 50), decorrido_ms: ctx.deps.now() - t0, custo_ia: 0,
    observacao: 'Curadoria determinística: sem IA e sem custo. Nenhum artigo foi alterado; só o relatório foi gravado.',
  });
}

// ------------------------------------------------------------------------------------------------------------------ detalhe
async function detalhe(admin: Admin, ctx: CuradoriaCtx, project: ProjectBase): Promise<Reply> {
  if (!isUuid(ctx.body.articleId)) return fail(422, 'article_id_required');
  const r = await admin.from('articles').select(FULL_COLUMNS).eq('id', ctx.body.articleId).eq('project_id', project.id).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return fail(404, 'article_not_found');
  const art = asCurationArticle(r.data as Rec);
  const c = await admin.from('article_curation').select('*').eq('article_id', art.id).maybeSingle();
  const stored = (c?.data || null) as Rec | null;
  const state = curationState({ updated_at: art.updated_at ?? null }, stored ? ({ article_id: art.id, estado: String(stored.estado), nota: stored.nota as number | null, image_state: String(stored.image_state), image_uses: stored.image_uses as number | null, curated_at: String(stored.curated_at), version: Number(stored.version) }) : undefined);
  let report: CurationReport | null = stored ? (stored.checks as CurationReport) : null;
  let calculado = false;
  if (!report || ctx.body.recalcular === true) {
    const { ctx: cctx } = await loadCurationContext(admin, project, ctx.deps.now());
    report = await curateArticle(art, cctx);
    calculado = true;
  }
  return ok({
    article: { id: art.id, title: art.title, keyword: art.keyword, status: art.status, featured_image_url: shortUrl(art.featured_image_url), updated_at: art.updated_at },
    estado_gravado: stored?.estado ?? null, estado_atual: calculado ? report.estado : state, gravado: !!stored, calculado_agora: calculado, curated_at: stored?.curated_at ?? null,
    relatorio: report, publicado: art.status === 'published' || !!art.published_url,
  });
}

// ------------------------------------------------------------------------------------------------------------------ prompts abertos
async function promptsAbertos(admin: Admin, ctx: CuradoriaCtx, project: ProjectBase): Promise<Reply> {
  const filtro = typeof ctx.body.estado === 'string' ? ctx.body.estado : '';
  if (filtro && !['sem_artigo', 'so_em_producao', 'coberto'].includes(filtro)) return fail(422, 'estado_invalid');
  const limit = num(ctx.body.limit, 100, 1, 500);
  const { prompts, sets } = await loadPrompts(admin, project.id);
  if (!prompts.length) return ok({ project_id: project.id, sem_dados: true, motivo: 'O Observatório de IA ainda não tem perguntas ativas neste projeto.', total_prompts: 0, sets, resumo: { sem_artigo: 0, so_em_producao: 0, coberto: 0 }, prompts: [], heuristica: true, regra: PROMPT_RULE });
  // só título, palavra-chave, secundárias e resumo (sem o corpo): leve para milhares de artigos
  const arts = (await loadAll<Rec>(admin, 'articles', 'id,title,keyword,secondary_keywords,excerpt,status', { col: 'project_id', val: project.id }, UNBOUNDED)).rows
    .map((r) => ({ id: String(r.id), title: r.title ?? null, keyword: r.keyword ?? null, secondary_keywords: (r.secondary_keywords as string[] | null) ?? null, excerpt: r.excerpt ?? null, status: String(r.status), content: null, slug: null, project_id: project.id, featured_image_url: null }) as CurationArticle);
  const cov = promptCoverage(prompts, arts);
  const resumo = { sem_artigo: 0, so_em_producao: 0, coberto: 0 };
  for (const x of cov) resumo[x.estado]++;
  const shown = cov.filter((x) => !filtro ? x.estado !== 'coberto' : x.estado === filtro).slice(0, limit);
  return ok({
    project_id: project.id, sem_dados: false, total_prompts: prompts.length, sets, resumo, heuristica: true, regra: PROMPT_RULE,
    prompts: shown.map((x) => ({ id: x.prompt.id, query: x.prompt.query, topic: x.prompt.topic, intent: x.prompt.intent, conjunto: x.prompt.set_name, estado: x.estado, cobertos_por: x.cobertos_por })),
  });
}

// ------------------------------------------------------------------------------------------------------------------ imagens
async function imagens(admin: Admin, ctx: CuradoriaCtx, project: ProjectBase): Promise<Reply> {
  const limit = num(ctx.body.limit, 200, 1, 500);
  const offset = num(ctx.body.offset, 0, 0, 100_000);
  const arts = await loadLight(admin, project.id);
  const usage = buildImageUsage(arts);
  const maxUses = await loadMaxImageUses(admin, project.id);
  const porStatus: Record<string, { artigos: number; com_imagem: number; sem_imagem: number; em_imagem_repetida: number; imagens_distintas: number }> = {};
  const distintas: Record<string, Set<string>> = {};
  for (const a of arts) {
    const s = a.status;
    porStatus[s] ||= { artigos: 0, com_imagem: 0, sem_imagem: 0, em_imagem_repetida: 0, imagens_distintas: 0 };
    distintas[s] ||= new Set();
    porStatus[s].artigos++;
    const k = imageKey(a.featured_image_url);
    if (!k) { porStatus[s].sem_imagem++; continue; }
    porStatus[s].com_imagem++; distintas[s].add(k);
    if ((usage.get(k) || []).length > maxUses) porStatus[s].em_imagem_repetida++;
  }
  for (const s of Object.keys(porStatus)) porStatus[s].imagens_distintas = distintas[s].size;
  const byId = new Map(arts.map((a) => [a.id, a]));
  const grupos = [...usage.entries()].filter(([, ids]) => ids.length > maxUses).map(([k, ids]) => {
    const st: Record<string, number> = {};
    for (const id of ids) { const s = byId.get(id)?.status ?? '?'; st[s] = (st[s] || 0) + 1; }
    return { chave: k.startsWith('data:') ? 'imagem embutida (base64)' : k, exemplo_url: shortUrl(byId.get(ids[0])?.featured_image_url), usos: ids.length, por_status: st, usada_em_publicado: (st.published || 0) > 0 };
  }).sort((x, y) => y.usos - x.usos);
  const precisam = arts.filter((a) => a.status !== 'published' && (CURATED_STATUSES as readonly string[]).includes(a.status)).map((a) => {
    const k = imageKey(a.featured_image_url);
    const usos = k ? (usage.get(k) || []).length : 0;
    return { a, k, usos, motivo: !k ? 'ausente' : usos > maxUses ? 'repetida' : null };
  }).filter((x) => x.motivo).sort((x, y) => (STATUS_PRIORITY[x.a.status] ?? 9) - (STATUS_PRIORITY[y.a.status] ?? 9) || (x.motivo === 'ausente' ? 0 : 1) - (y.motivo === 'ausente' ? 0 : 1) || y.usos - x.usos || String(x.a.created_at).localeCompare(String(y.a.created_at)));
  return ok({
    project_id: project.id, total_artigos: arts.length, imagens_distintas: usage.size, artigos_sem_imagem: arts.filter((a) => !imageKey(a.featured_image_url)).length,
    por_status: porStatus, rotulos: STATUS_LABEL, mais_repetidas: grupos.slice(0, 15), grupos_repetidos: grupos.length,
    precisam_imagem_nova: { total: precisam.length, offset, limit, artigos: precisam.slice(offset, offset + limit).map((x, i) => ({ prioridade: offset + i + 1, article_id: x.a.id, title: x.a.title, keyword: x.a.keyword, status: x.a.status, status_rotulo: STATUS_LABEL[x.a.status] ?? x.a.status, motivo: x.motivo, usos: x.usos })) },
    regra: `Imagem repetida (a mesma imagem em mais de ${maxUses} artigo(s) do projeto, de qualquer status) ou ausente bloqueia a publicação. Prioridade: Em criação, depois Na fila, depois Finalizado.`,
    normalizacao: 'A mesma imagem é reconhecida mesmo com parâmetros, versão derivada (-1200x675) ou rota de render do armazenamento.',
  });
}
