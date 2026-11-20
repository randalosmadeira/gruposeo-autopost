/**
 * Ações do Piloto Automático de Otimização (função de borda `auto-optimize`).
 *
 *  - `get`:          perfil de regras (de onde vem cada número), relatório e rascunho da última rodada, custo do dia e do teto, chave "automático".
 *  - `start`/`step`/`finish`: execução PASSO A PASSO dirigida pela tela (cada chamada faz no máximo UM passo de IA pequeno: nada de chamada única
 *    de 16.000 tokens, nada de estourar o prazo da função). O estado do trabalho viaja com a tela; nada fica pendurado no servidor.
 *  - `trigger`:      rodada automática no servidor (ao salvar como pronto, antes de publicar). `mode: 'quick'` = só o que não gasta IA.
 *  - `get_proposal`, `apply`, `discard`: o rascunho de revisão. Aplicar confere que o artigo não mudou desde a análise.
 *  - `set_auto`:     liga/desliga o piloto do projeto (e, só dono/administrador, "aplicar sem revisão" e o portão do plugin).
 * Leitura: qualquer membro. Escrita: dono, administrador e editor. Papel e organização vêm SEMPRE do banco, nunca do corpo da requisição.
 * Todo gasto de IA passa pelo teto diário (a porta de IA reserva e confirma); teto atingido = o piloto para e informa.
 */
import { analyzeWorking, buildReport, newJob, runAll, runDeterministic, runNext, planAiSteps, sha256Hex, type AiPort, type PilotInput, type PilotJob, type PilotReport, type PilotSource } from './auto-optimize-core.ts';
import { RULE_IDS, RULE_LABELS, STEP_MAX_TOKENS_HARD, type RuleProfile } from './optimization-rules.ts';
import { loadRuleProfile } from './rules-loader.ts';
import { resolveLanguage } from './language-packs.ts';
import { dayKey, textCostMicros, textPriceFor, DEFAULT_PRICE_BOOK } from './spend-gate-core.ts';
import type { LinkCandidate } from './auto-optimize-fixes.ts';

export const AUTO_OPTIMIZE_ACTIONS = ['get', 'start', 'step', 'finish', 'trigger', 'get_proposal', 'apply', 'discard', 'set_auto'];
export const WRITE_ROLES = ['owner', 'admin', 'editor'];
const ADMIN_ROLES = ['owner', 'admin'];
export const MAX_CONTENT_CHARS = 400_000;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
type Rec = Record<string, unknown>;

export type { AiPort };
export interface AutoOptimizeCtx {
  action: string;
  body: Rec;
  userId: string;
  roleByOrg: Map<string, string>;
  now: () => number;
  /** cria a porta de IA (orquestrador do usuário + teto diário). Ausente = ações que precisam de IA respondem 503. */
  makeAi?: (article: Rec, project: Rec | null) => Promise<AiPort> | AiPort;
  /** informa quem paga ao contexto de gasto (no-op fora do contexto) */
  bindSpend?: (ids: { userId: string; projectId?: string; articleId?: string; orgId?: string }) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Rec = {}): Reply => ({ status, body: { error, ...extra } });
const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? v as Rec : {});
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ARTICLE_COLUMNS = 'id,title,keyword,content,excerpt,slug,language,status,project_id,organization_id,published_url,published_at,created_at,updated_at,featured_image_url,config';
const PROJECT_COLUMNS = 'id,name,domain,wordpress_url,organization_id,nicho,editorial_identity,nexus_strategy,seo_plugin,empresa_nome,cta_conclusao,updated_at';

export async function handleAutoOptimizeAction(admin: Admin, ctx: AutoOptimizeCtx): Promise<Reply> {
  try {
    if (!AUTO_OPTIMIZE_ACTIONS.includes(ctx.action)) return fail(400, 'unknown_action');
    if (ctx.action === 'set_auto') return await setAuto(admin, ctx);
    const articleId = ctx.body.articleId;
    if (typeof articleId !== 'string' || !UUID.test(articleId)) return fail(422, 'article_id_required');
    const { data: article, error } = await admin.from('articles').select(ARTICLE_COLUMNS).eq('id', articleId).maybeSingle();
    if (error) throw error;
    if (!article) return fail(404, 'article_not_found');
    const role = ctx.roleByOrg.get(String(article.organization_id)) || null;
    if (!role) return fail(403, 'organization_membership_required');
    let project: Rec | null = null;
    if (article.project_id) {
      const pr = await admin.from('projects').select(PROJECT_COLUMNS).eq('id', article.project_id).maybeSingle();
      if (pr.error) throw pr.error;
      project = pr.data || null;
      if (project && project.organization_id !== article.organization_id) return fail(403, 'organization_boundary');
    }
    if (ctx.action === 'get') return await getState(admin, ctx, article, project, role);
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'get_proposal') return getProposal(article);
    if (ctx.action === 'discard') return await discard(admin, article);
    if (ctx.action === 'apply') return await apply(admin, ctx, article, project);
    // as ações abaixo rodam o piloto
    if (str(article.content).length > MAX_CONTENT_CHARS) return fail(413, 'content_too_large');
    const { input, profile } = await buildInput(admin, article, project);
    if (ctx.action === 'start') return await start(ctx, article, input);
    if (ctx.action === 'step') return await step(ctx, article, project, input);
    if (ctx.action === 'finish') return await finish(admin, ctx, article, project, input, profile, obj(ctx.body.job), 'manual');
    if (ctx.action === 'trigger') return await trigger(admin, ctx, article, project, input, profile);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[auto-optimize] operation_failed');
    return fail(500, 'auto_optimize_failed');
  }
}

// ---------- entrada do piloto ----------

const hashOf = (a: { title?: unknown; excerpt?: unknown; content?: unknown }) => sha256Hex(`${str(a.title)}\n${str(a.excerpt)}\n${str(a.content)}`);
const aoConfig = (article: Rec): Rec => obj(obj(article.config).auto_optimize);

function toSources(cfg: Rec): PilotSource[] {
  const out: PilotSource[] = []; const seen = new Set<string>();
  for (const key of ['primary_sources', 'secondary_sources', 'legal_authorities']) {
    const list = Array.isArray(cfg[key]) ? cfg[key] as unknown[] : [];
    for (const it of list) {
      const url = typeof it === 'string' ? it.trim() : str(obj(it).url).trim();
      const title = typeof it === 'string' ? undefined : (str(obj(it).title) || str(obj(it).name) || undefined);
      if (/^https?:\/\/[^\s]+$/i.test(url) && !seen.has(url)) { seen.add(url); out.push({ url, title }); }
    }
  }
  return out.slice(0, 12);
}

/** Candidatos a link interno: artigos já publicados do projeto + índice do WordPress (mesma fonte que a análise e o OrphanFixer usam). Só leitura. */
export async function loadLinkCandidates(admin: Admin, projectId: string, selfId: string): Promise<LinkCandidate[]> {
  const out: LinkCandidate[] = []; const seen = new Set<string>();
  const push = (title: string, url: string, keyword?: string) => { const u = str(url).trim(); if (u && !seen.has(u)) { seen.add(u); out.push({ title: title || keyword || '', url: u, keyword: keyword || '' }); } };
  try {
    const a = await admin.from('articles').select('id,title,keyword,published_url,status').eq('project_id', projectId).eq('status', 'published').limit(120);
    for (const r of (Array.isArray(a.data) ? a.data : []) as Rec[]) if (r.id !== selfId && r.published_url) push(str(r.title), str(r.published_url), str(r.keyword));
  } catch { /* sem candidatos de artigos */ }
  try {
    const w = await admin.from('wordpress_article_index').select('wp_post_title,wp_post_url,primary_keyword,wp_post_status,linkability_score').eq('project_id', projectId).eq('wp_post_status', 'publish').order('linkability_score', { ascending: false }).limit(200);
    for (const r of (Array.isArray(w.data) ? w.data : []) as Rec[]) if (r.wp_post_url) push(str(r.wp_post_title), str(r.wp_post_url), str(r.primary_keyword));
  } catch { /* sem índice do WordPress */ }
  return out.slice(0, 150);
}

async function buildInput(admin: Admin, article: Rec, project: Rec | null): Promise<{ input: PilotInput; profile: RuleProfile }> {
  const profile = await loadRuleProfile(admin, article, project);
  const cfg = obj(article.config);
  const ao = aoConfig(article);
  const candidates = project ? await loadLinkCandidates(admin, String(project.id), String(article.id)) : [];
  const input: PilotInput = {
    article: {
      id: String(article.id), title: str(article.title), keyword: str(article.keyword), excerpt: str(article.excerpt), content: str(article.content), slug: str(article.slug) || null,
      language: str(article.language) || null, published_url: str(article.published_url) || null, published_at: str(article.published_at) || null, created_at: str(article.created_at) || null,
      updated_at: str(article.updated_at) || null, featured_image_url: str(article.featured_image_url) || null, config: cfg,
    },
    project, rules: profile, candidates, sources: toSources(cfg), cta: project ? (str(project.cta_conclusao) || null) : null,
    segment: cfg.segment ?? project?.nicho ?? null, brand: project ? (str(project.empresa_nome) || str(project.name) || null) : null,
    skipUnits: Array.isArray(ao.touched_units) ? (ao.touched_units as unknown[]).filter((x): x is string => typeof x === 'string').slice(-200) : [],
  };
  return { input, profile };
}

const needAi = async (ctx: AutoOptimizeCtx, article: Rec, project: Rec | null): Promise<AiPort | null> => {
  if (!ctx.makeAi) return null;
  ctx.bindSpend?.({ userId: ctx.userId, projectId: project ? String(project.id) : undefined, articleId: String(article.id), orgId: str(article.organization_id) || undefined });
  return await ctx.makeAi(article, project);
};

// ---------- estado ----------

function rulesTable(p: RuleProfile) {
  return RULE_IDS.map((id) => ({ id, label: RULE_LABELS[id], level: p.rules[id].level, value: p.rules[id].value ?? null, max: p.rules[id].max ?? null, source: p.rules[id].source }));
}

async function spendNumbers(admin: Admin, orgId: string) {
  try {
    const { data, error } = await admin.rpc('spend_status', { p_org: orgId });
    const st = obj(data);
    if (error || typeof st.cap_usd_micros === 'undefined') return null;
    const cap = Number(st.cap_usd_micros) || 0; const used = Number(st.used_usd_micros) || 0;
    return { cap_usd_micros: cap, used_usd_micros: used, pct: cap > 0 ? Math.round((used / cap) * 1000) / 10 : null, state: str(st.state) || null, remaining_usd_micros: Number(st.remaining_to_cap_usd_micros) || 0 };
  } catch { return null; }
}

/** Custo estimado do piloto hoje neste projeto (soma dos custos gravados nos artigos; o gasto real total do dia é o do teto diário). */
async function pilotDayCost(admin: Admin, projectId: string, now: number): Promise<number> {
  try {
    const r = await admin.from('articles').select('id,config').eq('project_id', projectId).gte('updated_at', new Date(now - 36 * 3600 * 1000).toISOString()).limit(300);
    const today = dayKey(now);
    let sum = 0;
    for (const a of (Array.isArray(r.data) ? r.data : []) as Rec[]) {
      const log = obj(obj(a.config).auto_optimize).cost_log;
      for (const e of (Array.isArray(log) ? log : []) as Rec[]) if (typeof e.at === 'string' && dayKey(Date.parse(e.at)) === today) sum += Number(e.usd_micros) || 0;
    }
    return sum;
  } catch { return 0; }
}

async function getState(admin: Admin, ctx: AutoOptimizeCtx, article: Rec, project: Rec | null, role: string): Promise<Reply> {
  const profile = await loadRuleProfile(admin, article, project);
  const ao = aoConfig(article);
  const prop = obj(ao.proposal);
  const lang = resolveLanguage({ configured: [article.language, obj(article.config).language, obj(project?.nexus_strategy).language, obj(project?.editorial_identity).language], text: str(article.content).replace(/<[^>]+>/g, ' ').slice(0, 6000) });
  const currentHash = await hashOf(article);
  const spend = await spendNumbers(admin, str(article.organization_id));
  const pilot = project ? await pilotDayCost(admin, String(project.id), ctx.now()) : 0;
  return {
    status: 200,
    body: {
      article: { id: article.id, project_id: article.project_id, status: article.status, hash: currentHash },
      role, can_write: WRITE_ROLES.includes(role), can_admin: ADMIN_ROLES.includes(role),
      auto: profile.options.auto, apply_without_review: profile.options.apply_without_review, plugin_gate: profile.options.plugin_gate,
      options: profile.options, rules: rulesTable(profile), rules_layers: profile.layers,
      language: { tag: lang.tag, source: lang.source, formula: lang.profile?.readability ? { id: lang.profile.readability.id, label: lang.profile.readability.label, status: lang.profile.readability.status } : null },
      last_run: ao.last_run ?? null, last_report: ao.last_report ?? null,
      proposal: prop.status ? { status: prop.status, at: prop.at ?? null, base_hash: prop.base_hash ?? null, final_hash: prop.final_hash ?? null, stale: prop.status === 'pending_review' && prop.base_hash !== currentHash } : null,
      spend, pilot_today_usd_micros: pilot, pilot_cost_is_estimate: true,
    },
  };
}

// ---------- execução passo a passo ----------

const cleanJob = (raw: Rec, input: PilotInput, originalHash: string): PilotJob => {
  const base = newJob(input, originalHash);
  const w = obj(raw.working);
  const arr = (v: unknown, n = 200) => (Array.isArray(v) ? v.slice(0, n) : []);
  if (str(w.content).length > MAX_CONTENT_CHARS) return base;
  return {
    ...base,
    working: { title: str(w.title).slice(0, 500) || base.working.title, content: typeof w.content === 'string' ? w.content : base.working.content, excerpt: typeof w.excerpt === 'string' ? w.excerpt.slice(0, 2000) : base.working.excerpt },
    applied: arr(raw.applied) as PilotJob['applied'], pending: arr(raw.pending) as PilotJob['pending'], steps: arr(raw.steps, 100) as PilotJob['steps'],
    attempted: arr(raw.attempted).filter((x): x is string => typeof x === 'string'), touchedUnits: arr(raw.touchedUnits).filter((x): x is string => typeof x === 'string'),
    aiUsed: Math.max(0, Math.min(Number(raw.aiUsed) || 0, 50)), costMicros: Math.max(0, Number(raw.costMicros) || 0), deterministicDone: raw.deterministicDone === true,
    stopped: raw.stopped && typeof raw.stopped === 'object' ? raw.stopped as PilotJob['stopped'] : null, done: raw.done === true,
    compliance: arr(raw.compliance) as PilotJob['compliance'], schema: raw.schema && typeof raw.schema === 'object' ? raw.schema as PilotJob['schema'] : null,
  };
};

const progress = (input: PilotInput, job: PilotJob) => ({
  done: job.done, ai_used: job.aiUsed, ai_max: input.rules.options.max_ai_steps, cost_usd_micros: job.costMicros,
  next: job.done ? [] : (job.deterministicDone ? planAiSteps(input, job).slice(0, 4).map((s) => s.label) : ['Correções que não gastam IA']),
  stopped: job.stopped, step_max_tokens: input.rules.options.step_max_tokens,
});

async function start(_ctx: AutoOptimizeCtx, article: Rec, input: PilotInput): Promise<Reply> {
  const originalHash = await hashOf(article);
  const job = newJob(input, originalHash);
  const { analysis, score } = analyzeWorking(input, job.working);
  return { status: 200, body: { job, progress: progress(input, job), analysis_score: score, flesch: analysis.flesch, original_hash: originalHash, language: analysis.language } };
}

async function step(ctx: AutoOptimizeCtx, article: Rec, project: Rec | null, input: PilotInput): Promise<Reply> {
  const originalHash = await hashOf(article);
  const job = cleanJob(obj(ctx.body.job), input, originalHash);
  let ai: AiPort | null = null;
  if (job.deterministicDone && !job.stopped && !job.done) {
    ai = await needAi(ctx, article, project);
    if (!ai && planAiSteps(input, job).length) return fail(503, 'ai_unavailable');
  }
  const next = await runNext(input, job, { ai: ai ?? { call: () => Promise.reject(new Error('ai_unavailable')) }, now: ctx.now });
  return { status: 200, body: { job: next, progress: progress(input, next) } };
}

// ---------- gravação do resultado ----------

async function persist(admin: Admin, ctx: AutoOptimizeCtx, article: Rec, project: Rec | null, input: PilotInput, report: PilotReport, job: PilotJob, triggerName: string): Promise<{ status: 'applied' | 'pending_review' | 'none'; saved: boolean }> {
  const cfg = obj(article.config);
  const prev = aoConfig(article);
  const hasChange = !report.unchanged;
  const mayApply = input.rules.options.apply_without_review && hasChange && !job.stopped;
  const status: 'applied' | 'pending_review' | 'none' = !hasChange ? 'none' : mayApply ? 'applied' : 'pending_review';
  const nowIso = new Date(ctx.now()).toISOString();
  const cost = Number(report.cost_usd_micros) || 0;
  const trimmed = { ...report, steps: report.steps.slice(0, 60).map((s) => ({ ...s, detail: s.detail ? s.detail.slice(0, 300) : s.detail })) };
  const auto = {
    ...prev,
    last_run: { at: nowIso, trigger: triggerName, base_hash: report.base_hash, final_hash: report.final_hash, partial: report.partial, unchanged: report.unchanged, cost_usd_micros: cost, score_before: report.before.score, score_after: report.after.score },
    last_report: trimmed,
    proposal: hasChange ? { status, at: nowIso, title: job.working.title, content: job.working.content, excerpt: job.working.excerpt, base_hash: report.base_hash, final_hash: report.final_hash } : (obj(prev.proposal).status === 'applied' ? prev.proposal : null),
    touched_units: Array.from(new Set([...(Array.isArray(prev.touched_units) ? prev.touched_units as string[] : []), ...job.touchedUnits])).slice(-200),
    cost_log: [...(Array.isArray(prev.cost_log) ? prev.cost_log as unknown[] : []), ...(cost > 0 ? [{ at: nowIso, usd_micros: cost }] : [])].slice(-10),
  };
  const nextConfig: Rec = { ...cfg, auto_optimize: auto };
  if (job.schema) nextConfig.schema_plan = { types: job.schema.types, policy: job.schema.policy, author_identified: job.schema.author.identified, language: job.schema.language, area_served: job.schema.areaServed, updated_at: nowIso };
  const patch: Rec = { config: nextConfig };
  if (status === 'applied') {
    patch.title = job.working.title; patch.content = job.working.content; patch.excerpt = job.working.excerpt;
    patch.word_count = job.working.content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  }
  // controle otimista: se o artigo mudou durante a rodada, nada é gravado por cima
  const { data, error } = await admin.from('articles').update(patch).eq('id', article.id).eq('organization_id', article.organization_id).eq('updated_at', article.updated_at).select('id').maybeSingle();
  if (error) throw error;
  const saved = !!data;
  if (saved) await emitEvent(admin, article, project, { kind: 'otimizacao.piloto_concluido', payload: { trigger: triggerName, applied: report.applied.length, pending: report.pending.length, cost_usd_micros: cost, partial: report.partial, proposal: status } });
  return { status, saved };
}

let eventsTable: { ok: boolean; at: number } | null = null;
/** Publica um fato no barramento SE a tabela project_events existir (o agente de Indexação a cria). Nunca cria tabela e nunca derruba a ação. */
export async function emitEvent(admin: Admin, article: Rec, project: Rec | null, e: { kind: string; payload: Rec }): Promise<boolean> {
  try {
    if (!project || !article.organization_id) return false;
    const now = Date.now();
    if (!eventsTable || now - eventsTable.at > 60_000) {
      const probe = await admin.from('project_events').select('id').limit(1);
      const code = String(probe.error?.code || ''); const msg = String(probe.error?.message || '');
      eventsTable = { ok: !probe.error || !(code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg)), at: now };
    }
    if (!eventsTable.ok) return false;
    const r = await admin.from('project_events').insert({ organization_id: article.organization_id, project_id: project.id, module: 'otimizacao', kind: e.kind, subject: { article_id: article.id }, payload: e.payload });
    return !r.error;
  } catch { return false; }
}
export const resetEventsProbe = () => { eventsTable = null; };

async function finish(admin: Admin, ctx: AutoOptimizeCtx, article: Rec, project: Rec | null, input: PilotInput, _profile: RuleProfile, rawJob: Rec, triggerName: string): Promise<Reply> {
  const originalHash = await hashOf(article);
  // o texto que a tela analisou precisa ser o texto que está no banco agora; senão o rascunho passaria por cima de uma edição
  const startedHash = str(rawJob.originalHash);
  if (startedHash && startedHash !== originalHash) return fail(409, 'article_changed_reload');
  const job = cleanJob(rawJob, input, originalHash);
  const report = await buildReport(input, job, { now: ctx.now });
  report.base_hash = originalHash;
  const saved = await persist(admin, ctx, article, project, input, report, job, triggerName);
  if (!saved.saved) return fail(409, 'article_changed_reload', { report });
  return { status: 200, body: { report, proposal: saved.status, applied_without_review: saved.status === 'applied' } };
}

// ---------- gatilho automático ----------

async function trigger(admin: Admin, ctx: AutoOptimizeCtx, article: Rec, project: Rec | null, input: PilotInput, profile: RuleProfile): Promise<Reply> {
  const triggerName = ['pre_publish', 'ready', 'manual'].includes(str(ctx.body.trigger)) ? str(ctx.body.trigger) : 'ready';
  const force = ctx.body.force === true;
  if (!profile.options.auto && triggerName !== 'manual') return { status: 200, body: { skipped: 'auto_off', message: 'O piloto automático está desligado neste projeto.' } };
  const currentHash = await hashOf(article);
  const ao = aoConfig(article); const last = obj(ao.last_run);
  if (!force && (last.base_hash === currentHash || last.final_hash === currentHash)) {
    return { status: 200, body: { skipped: 'already_optimized', last_run: ao.last_run, message: 'Este texto já passou pelo piloto; nada novo a fazer (nenhum gasto).' } };
  }
  const quick = str(ctx.body.mode) !== 'full';
  let job: PilotJob;
  if (quick) {
    job = runDeterministic(input, newJob(input, currentHash));
    for (const s of planAiSteps(input, job)) job.pending.push({ id: s.ruleId, label: s.label, kind: 'limite', reason: 'Passo de IA não executado na rodada rápida (antes de publicar). Rode o piloto completo no editor.' });
    job.done = true;
  } else {
    const ai = await needAi(ctx, article, project);
    if (!ai) return fail(503, 'ai_unavailable');
    job = await runAll(input, { ai, now: ctx.now }, currentHash);
  }
  const report = await buildReport(input, job, { now: ctx.now });
  const saved = await persist(admin, ctx, article, project, input, report, job, triggerName);
  return { status: 200, body: { ran: true, mode: quick ? 'quick' : 'full', report, proposal: saved.status, saved: saved.saved } };
}

// ---------- rascunho de revisão ----------

function getProposal(article: Rec): Reply {
  const prop = obj(aoConfig(article).proposal);
  if (!prop.status) return fail(404, 'no_proposal');
  return { status: 200, body: { proposal: prop } };
}

async function discard(admin: Admin, article: Rec): Promise<Reply> {
  const ao = aoConfig(article); const prop = obj(ao.proposal);
  if (prop.status !== 'pending_review') return fail(409, 'no_pending_proposal');
  const next = { ...obj(article.config), auto_optimize: { ...ao, proposal: { ...prop, status: 'discarded' } } };
  const { data, error } = await admin.from('articles').update({ config: next }).eq('id', article.id).eq('organization_id', article.organization_id).eq('updated_at', article.updated_at).select('id').maybeSingle();
  if (error) throw error;
  return data ? { status: 200, body: { discarded: true } } : fail(409, 'article_changed_reload');
}

async function apply(admin: Admin, ctx: AutoOptimizeCtx, article: Rec, project: Rec | null): Promise<Reply> {
  const ao = aoConfig(article); const prop = obj(ao.proposal);
  if (prop.status !== 'pending_review') return fail(409, 'no_pending_proposal');
  const currentHash = await hashOf(article);
  // O rascunho vale só para o texto sobre o qual foi feito. Se alguém editou o artigo depois, aplicar apagaria essa edição.
  if (prop.base_hash !== currentHash) return fail(409, 'article_changed_since_proposal', { message: 'O artigo foi editado depois da análise do piloto. Rode o piloto de novo.' });
  const content = str(prop.content);
  if (!content.trim()) return fail(422, 'proposal_empty');
  const nowIso = new Date(ctx.now()).toISOString();
  const next = { ...obj(article.config), auto_optimize: { ...ao, proposal: { ...prop, status: 'applied', applied_at: nowIso, applied_by: ctx.userId } } };
  const patch = {
    title: str(prop.title) || article.title, content, excerpt: typeof prop.excerpt === 'string' ? prop.excerpt : article.excerpt,
    word_count: content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, config: next,
  };
  const { data, error } = await admin.from('articles').update(patch).eq('id', article.id).eq('organization_id', article.organization_id).eq('updated_at', article.updated_at).select('id').maybeSingle();
  if (error) throw error;
  if (!data) return fail(409, 'article_changed_reload');
  await emitEvent(admin, article, project, { kind: 'otimizacao.rascunho_aplicado', payload: { by: 'revisao' } });
  return { status: 200, body: { applied: true, hash: await hashOf({ title: patch.title, excerpt: patch.excerpt, content }), needs_review_before_publish: true } };
}

// ---------- liga/desliga por projeto ----------

async function setAuto(admin: Admin, ctx: AutoOptimizeCtx): Promise<Reply> {
  const projectId = ctx.body.projectId;
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
  const { data: project, error } = await admin.from('projects').select('id,organization_id,editorial_identity,updated_at').eq('id', projectId).maybeSingle();
  if (error) throw error;
  if (!project) return fail(404, 'project_not_found');
  const role = ctx.roleByOrg.get(String(project.organization_id)) || null;
  if (!role) return fail(403, 'organization_membership_required');
  if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
  const identity = obj(project.editorial_identity);
  const rules = obj(identity.optimization_rules);
  const options = { ...obj(rules.options) };
  let changed = false;
  if (typeof ctx.body.auto === 'boolean') { options.auto = ctx.body.auto; changed = true; }
  // decisões mais sensíveis: só dono ou administrador
  if (typeof ctx.body.apply_without_review === 'boolean') { if (!ADMIN_ROLES.includes(role)) return fail(403, 'role_not_allowed'); options.apply_without_review = ctx.body.apply_without_review; changed = true; }
  if (ctx.body.plugin_gate === 'avisar' || ctx.body.plugin_gate === 'exigir') { if (!ADMIN_ROLES.includes(role)) return fail(403, 'role_not_allowed'); options.plugin_gate = ctx.body.plugin_gate; changed = true; }
  if (!changed) return fail(422, 'nothing_to_change');
  const next = { ...identity, optimization_rules: { ...rules, options } };
  const { data: saved, error: upErr } = await admin.from('projects').update({ editorial_identity: next }).eq('id', project.id).eq('organization_id', project.organization_id).eq('updated_at', project.updated_at).select('id').maybeSingle();
  if (upErr) throw upErr;
  if (!saved) return fail(409, 'project_changed_reload');
  return { status: 200, body: { saved: true, options } };
}

// ---------- porta de IA sobre o orquestrador (com teto diário) ----------

interface OrchestratorLike { callWithMeta(task: string, messages: Array<{ role: string; content: string }>, options?: Rec): Promise<{ content: string; model?: string; usage?: { inputTokens: number; outputTokens: number } }> }

/**
 * Adapta o AIOrchestrator à porta do núcleo. O orquestrador já reserva no teto diário ANTES de cada chamada e confirma depois (SpendDeniedError se negar);
 * o custo devolvido aqui é só a ESTIMATIVA para o relatório (tabela de preços padrão), nunca o valor do ledger.
 */
export function orchestratorPort(orchestrator: OrchestratorLike, articleId: string, correlationId: string): AiPort {
  return {
    async call(req) {
      const maxTokens = Math.max(100, Math.min(req.maxTokens, STEP_MAX_TOKENS_HARD));
      const r = await orchestrator.callWithMeta(req.task, [{ role: 'system', content: req.system }, { role: 'user', content: req.user }], { maxTokens, temperature: req.temperature, articleId, correlationId });
      const usage = r.usage ?? { inputTokens: 0, outputTokens: 0 };
      const price = textPriceFor(DEFAULT_PRICE_BOOK, r.model);
      return { content: r.content, model: r.model, usage, costMicros: textCostMicros(price, usage.inputTokens, usage.outputTokens) };
    },
  };
}

