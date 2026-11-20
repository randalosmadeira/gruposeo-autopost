/**
 * Ações do Estúdio de Páginas (módulo `estudio` do portão `engine`).
 *
 *  Leitura (qualquer membro):  list, detail.
 *  Editor, administrador, dono: brief, revise, check, plan_links, approve (enviar, aprovar, devolver), publish, unpublish.
 *  Podem gerar custo (passam pelo teto diário de gasto): generate (IA) e images (só se a política do projeto permitir gerar).
 *
 * Regras que este módulo impõe (testadas): nada é publicado sem aprovação humana; o que foi aprovado é o que é publicado (hash); editar desfaz a aprovação; trava de páginas novas
 * por lote e de publicações por dia (números do perfil de regras); página de porta é recusada com proposta de consolidar; nada inventado (pendência humana); papel e organização
 * vêm SEMPRE do banco; cada ação grava fatos no barramento (project_events). Chamada de IA e de imagem entram por portas injetadas (sem rede nos testes).
 */
import { fail, guarded, isUuid, ok, resolveProject, type Admin, type MinRole, type ProjectBase, type Reply } from './engine-kernel.ts';
import { recordEvent } from './project-events.ts';
import { readValues, asObject, type SectionMap } from './profile-model.ts';
import { cleanStrategy } from './nexus-business.ts';
import { loadPromptTexts } from './rules-loader.ts';
import { resolveStudioRules, type StudioRules } from './studio-rules.ts';
import { ADAPTERS, PAGE_TYPES, type AdapterKind, type FieldFact, type PageStatus, type PageType, type Pending, type SourceRef, type StudioPageDoc } from './studio-types.ts';
import { PROJECT_COLUMNS, profileFromProject, originOf, wordpressBasePath } from './studio-profile.ts';
import { breadcrumbsFor, buildSlugPath, publicUrl, slugifySegment, validateSlugPath } from './studio-url.ts';
import { buildSuperiorityBrief, type SuperiorityBrief } from './studio-brief.ts';
import { loadAssetRows, loadCitations, loadFocus, loadGeoPlace, loadNode, loadPolicyRows, loadRadar, loadScope, loadSitePages, optionalTables } from './studio-sources.ts';
import { runPipeline, factsUsed, type PipelineState, type StudioAiPort } from './studio-pipeline.ts';
import { runGates, type QualityReport } from './studio-gates.ts';
import { buildStudioSchema, type SchemaBuild } from './studio-schema.ts';
import { LINK_LABELS, planExternalLinks, planInternalLinks, renderLinkBlocks, replaceLinkBlocks, timeoutSignal, verifyLinks, type SitePage } from './studio-links.ts';
import { checkThrottle, type SiblingText } from './studio-doorway.ts';
import { buildImages, resolvePolicy, type AssetRow, type ImagePort } from './studio-images.ts';
import { buildPluginPagePayload, buildStaticPackage, parsePluginPageReply, ZICA_HOSTED_CONTRACT } from './studio-adapters.ts';
import { approvalCheck, canTransition, contentHash, docToStored, emptyStored, estimateCost, publishCheck, rowToDoc, STUDIO_EVENT_LABELS, storedOf, summarize, type PageRow, type StoredDoc } from './studio-core.ts';
import { markFindings } from './studio-ai-detector.ts';
import { renderDocument, labelsFor } from './studio-render.ts';
import { LANGUAGES, parseLanguageTag } from './language-packs.ts';
import { submitIndexNow } from './indexation-engines.ts';
import { extractPendingMarkers } from './studio-facts.ts';

export const STUDIO_ACTIONS = ['brief', 'generate', 'revise', 'check', 'plan_links', 'images', 'approve', 'publish', 'unpublish', 'list', 'detail'];
export const READ_ACTIONS = ['list', 'detail'];
export const PAGE_SIZE = 30;
export { STUDIO_EVENT_LABELS };

export interface StudioDeps {
  fetchFn: typeof fetch;
  lookupA: (host: string) => Promise<string[]>;
  now: () => number;
  /** IA do projeto (reserva e confirma no teto diário a cada chamada). null/ausente = sem IA: o rascunho vira pendências. */
  ai?: (c: { organizationId: string; projectId: string; userId: string }) => Promise<StudioAiPort | null>;
  image?: (c: { organizationId: string; projectId: string; userId: string }) => Promise<ImagePort | null>;
  /** Chamada ao plugin do WordPress do projeto (a chave fica no servidor). */
  plugin?: (c: { organizationId: string; projectId: string }, path: string, init: { method: 'POST' | 'GET'; body?: unknown }) => Promise<Record<string, unknown>>;
}
export interface StudioCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: StudioDeps }

type Row = Record<string, unknown>;
const nowIso = (ctx: StudioCtx) => new Date(ctx.deps.now()).toISOString();
const txt = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const httpsUrl = (v: unknown): string | null => { const u = typeof v === 'string' ? v.trim() : ''; return /^https:\/\/[^\s]{4,2000}$/i.test(u) ? u : null; };
const MIN_ROLE: Record<string, MinRole> = { list: 'member', detail: 'member' };

const MESSAGES: Record<string, string> = {
  query_required: 'Informe a busca (ou o assunto) que a página precisa responder.',
  language_required: 'Informe o idioma da página (o sistema não presume idioma).',
  type_invalid: 'Tipo de página inválido.',
  adapter_invalid: 'Adaptador de publicação inválido.',
  page_not_found: 'Página não encontrada neste projeto.',
  page_id_required: 'Escolha a página.',
  slug_invalid: 'O endereço da página não é válido.',
  origin_required: 'O projeto não tem domínio cadastrado: sem ele não há endereço público.',
  batch_limit: 'Limite de páginas novas por lote atingido.',
  brief_missing: 'Esta página ainda não tem briefing. Crie o briefing primeiro.',
  page_changed_reload: 'A página mudou enquanto você mexia. Recarregue e tente de novo.',
  not_approved: 'Só página aprovada por uma pessoa pode ser publicada.',
  approval_blocked: 'A página não pode ser aprovada ainda.',
  publish_blocked: 'A página não pode ser publicada ainda.',
  transition_invalid: 'Essa mudança de estado não é permitida.',
  adapter_not_built: 'Esse adaptador de publicação ainda não foi construído.',
  plugin_unavailable: 'A conexão com o plugin do WordPress não está disponível neste ambiente.',
  daily_limit: 'Limite de publicações por dia atingido.',
  doorway: 'Página de porta: o texto repete as páginas irmãs.',
  step_invalid: 'Passo de aprovação inválido.',
  nothing_to_change: 'Nada para alterar.',
};
const bad = (status: number, code: string, extra: Record<string, unknown> = {}): Reply => fail(status, code, { message: MESSAGES[code], ...extra });

// ------------------------------------------------------------------------------------------------------------ entrada
export async function handleStudioAction(admin: Admin, ctx: StudioCtx): Promise<Reply> {
  return guarded('estudio', async () => {
    if (!STUDIO_ACTIONS.includes(ctx.action)) return fail(400, 'unknown_action');
    const scope = await resolveProject(admin, ctx, ctx.body.projectId, MIN_ROLE[ctx.action] || 'editor');
    if (scope.ok === false) return scope.reply;
    const { project, role } = scope;
    switch (ctx.action) {
      case 'list': return await list(admin, ctx, project, role);
      case 'detail': return await detail(admin, ctx, project, role);
      case 'brief': return await brief(admin, ctx, project);
      case 'generate': return await generate(admin, ctx, project);
      case 'revise': return await revise(admin, ctx, project);
      case 'check': return await check(admin, ctx, project);
      case 'plan_links': return await planLinks(admin, ctx, project);
      case 'images': return await images(admin, ctx, project);
      case 'approve': return await approve(admin, ctx, project);
      case 'publish': return await publish(admin, ctx, project);
      case 'unpublish': return await unpublish(admin, ctx, project);
      default: return fail(400, 'unknown_action');
    }
  });
}

// ------------------------------------------------------------------------------------------------------------ carregamento
interface Env {
  project: Row; profile: ReturnType<typeof profileFromProject>['profile']; gaps: ReturnType<typeof profileFromProject>['gaps']; origin: string | null; basePath: string;
  tables: Record<string, boolean>; promptTexts: string[];
}
async function loadEnv(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Env> {
  const p = await admin.from('projects').select(PROJECT_COLUMNS).eq('id', project.id).maybeSingle();
  if (p.error) throw p.error;
  const row: Row = (p.data || { ...project }) as Row;
  const ext = await admin.from('project_profile_extended').select('sections').eq('project_id', project.id).maybeSingle();
  const values = readValues({ strategy: cleanStrategy(row.nexus_strategy), sections: asObject(ext.data?.sections) as SectionMap, finance: {}, goals: {} }, false);
  const { profile, gaps } = profileFromProject(row, values as Record<string, unknown>);
  const tables = await optionalTables(admin);
  const promptTexts = await loadPromptTexts(admin, {}, { id: project.id });
  return { project: row, profile, gaps, origin: originOf(row), basePath: wordpressBasePath(row), tables, promptTexts };
}
const rulesOf = (env: Env, type: PageType): StudioRules => resolveStudioRules({ type, projectIdentity: env.project.editorial_identity, projectStrategy: (env.project.nexus_strategy && typeof env.project.nexus_strategy === 'object' ? env.project.nexus_strategy : null) as Row | null, prompts: env.promptTexts });

async function loadPage(admin: Admin, project: ProjectBase, id: unknown): Promise<{ page: PageRow } | { reply: Reply }> {
  if (!isUuid(id)) return { reply: bad(422, 'page_id_required') };
  const r = await admin.from('studio_pages').select('*').eq('id', id).eq('project_id', project.id).eq('organization_id', project.organization_id).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return { reply: bad(404, 'page_not_found') };
  return { page: r.data as PageRow };
}
async function allPages(admin: Admin, project: ProjectBase): Promise<PageRow[]> {
  const r = await admin.from('studio_pages').select('*').eq('project_id', project.id).eq('organization_id', project.organization_id).limit(2000);
  if (r.error) throw r.error;
  return (r.data || []) as PageRow[];
}

function siblingsOf(page: Pick<PageRow, 'id' | 'type' | 'subject' | 'slug_path'>, pages: PageRow[]): SiblingText[] {
  const parent = page.slug_path.split('/').slice(0, -1).join('/');
  return pages.filter((p) => p.id !== page.id && p.type === page.type && p.status !== 'despublicada' && p.body_html && ((page.subject && p.subject === page.subject) || (parent && p.slug_path.startsWith(`${parent}/`))))
    .map((p) => ({ id: p.id, label: p.title || p.slug_path, html: p.body_html, place: p.place }));
}

interface Computed { quality: QualityReport; schema: SchemaBuild; doc: StudioPageDoc; hash: string }
async function computeQuality(admin: Admin, ctx: StudioCtx, project: ProjectBase, env: Env, page: PageRow, pages: PageRow[], override: Partial<{ doc: StudioPageDoc }> = {}): Promise<Computed> {
  const origin = env.origin || '';
  const stored = storedOf(page);
  const doc = override.doc || rowToDoc(page, origin);
  const rules = rulesOf(env, page.type);
  const schema = buildStudioSchema(doc, env.profile);
  const others = pages.filter((p) => p.id !== page.id);
  const inbound = others.filter((p) => storedOf(p).links.some((l) => l.url === doc.url)).length + (stored.inboundSuggested.length ? 1 : 0);
  const links = await admin.from('studio_page_links').select('url,verified,kind,direction').eq('page_id', page.id);
  const checks: Record<string, boolean | null> = {};
  for (const l of ((links.data || []) as Row[])) if (l.kind === 'externo') checks[String(l.url)] = l.verified === null || l.verified === undefined ? null : l.verified === true;
  for (const s of doc.sources) if (s.verified !== undefined && s.verified !== null) checks[s.url] = s.verified;
  const siteLinks = others.flatMap((p) => storedOf(p).links.filter((l) => l.kind === 'interno').map((l) => ({ to: l.url, anchor: l.anchor })));
  const used = stored.usedFactIds.length ? stored.usedFactIds : factsUsed(doc.bodyHtml, stored.fieldFacts);
  const quality = runGates({
    doc, rules, profile: env.profile, schema, siblings: siblingsOf(page, pages), existing: { titles: others.map((p) => p.title).filter(Boolean), metas: others.map((p) => p.meta_description).filter(Boolean) },
    fieldFacts: stored.fieldFacts, usedFactIds: used, keywords: stored.keywords, inboundPlanned: inbound, linkChecks: checks, siteLinks, hasTranslations: stored.hasTranslations, nowMs: ctx.deps.now(),
  });
  return { quality, schema, doc, hash: await contentHash(doc) };
}

/** Versão compacta do relatório para a coluna `quality` (sem repetir o texto inteiro). */
function compactQuality(q: QualityReport, hash: string): Record<string, unknown> {
  return {
    generated_at: q.generated_at, content_hash: hash, score: q.score, complete: q.complete, blocking: q.blocking, warnings: q.warnings, ok: q.ok, active: q.active, pendings: q.pendings,
    results: q.results.map((r) => ({ id: r.id, label: r.label, level: r.level, status: r.status, note: r.note, fix: r.fix, details: (r.details || []).slice(0, 6) })),
    ai: { score: q.ai.score, coverage: q.ai.coverage, words: q.ai.words, metrics: q.ai.metrics, findings: q.ai.findings.slice(0, 25) },
    doorway: { verdict: q.doorway.verdict, uniquePct: q.doorway.uniquePct, maxSimilarity: q.doorway.maxSimilarity, mostSimilar: q.doorway.mostSimilar, reasons: q.doorway.reasons, proposal: q.doorway.proposal },
    invention: q.invention.slice(0, 25),
  };
}

const eventOf = (project: ProjectBase, kind: string, subject: Row, payload: Row) => ({ organization_id: project.organization_id, project_id: project.id, module: 'estudio', kind, subject, payload });

/** Grava a nova versão (imutável) e atualiza a linha da página, comparando e trocando pelo `updated_at` (duas pessoas editando não se atropelam). */
async function saveVersion(admin: Admin, ctx: StudioCtx, project: ProjectBase, page: PageRow, patch: Row, reason: string, c: Computed): Promise<{ page: PageRow } | { reply: Reply }> {
  const version = page.version + 1;
  const now = nowIso(ctx);
  const row = { ...patch, version, content_hash: c.hash, quality: compactQuality(c.quality, c.hash), quality_score: c.quality.score, ai_score: c.quality.ai.score, pending_count: c.quality.pendings.length + (page.pipeline && Array.isArray((page.pipeline as Row).sections) ? ((page.pipeline as Row).sections as Row[]).filter((s) => s.status !== 'ok').length : 0), updated_by: ctx.userId, updated_at: now };
  const up = await admin.from('studio_pages').update(row).eq('id', page.id).eq('project_id', project.id).eq('organization_id', project.organization_id).eq('updated_at', page.updated_at).select('*').maybeSingle();
  if (up.error) throw up.error;
  if (!up.data) return { reply: bad(409, 'page_changed_reload') };
  const next = up.data as PageRow;
  const v = await admin.from('studio_page_versions').insert({ page_id: page.id, version, organization_id: project.organization_id, project_id: project.id, title: next.title, meta_description: next.meta_description, h1: next.h1, body_html: next.body_html, doc: next.doc, quality: compactQuality(c.quality, c.hash), content_hash: c.hash, reason: reason.slice(0, 300), created_by: ctx.userId });
  if (v.error) throw v.error;
  return { page: next };
}

const pendingFromBrief = (b: SuperiorityBrief): Pending[] => b.pendings;

// ------------------------------------------------------------------------------------------------------------ brief
const cleanFacts = (v: unknown): FieldFact[] => (Array.isArray(v) ? v : []).slice(0, 60).map((f, i): FieldFact | null => {
  const o = (f && typeof f === 'object' ? f : {}) as Row; const text = txt(o.text, 500); if (text.length < 5) return null;
  const kind = (['orgao', 'local', 'prazo', 'documento', 'numero', 'norma'].includes(String(o.kind)) ? String(o.kind) : 'outro') as FieldFact['kind'];
  return { id: txt(o.id, 60) || `m${i + 1}`, kind, text, place: txt(o.place, 200) || null, source_url: httpsUrl(o.source_url), source_label: txt(o.source_label, 200) || null, approved: o.approved === true };
}).filter((x): x is FieldFact => !!x);
const cleanSources = (v: unknown): SourceRef[] => (Array.isArray(v) ? v : []).slice(0, 30).map((s): SourceRef | null => {
  const o = (s && typeof s === 'object' ? s : {}) as Row; const url = httpsUrl(o.url); const label = txt(o.label, 200); if (!url || !label) return null;
  return { url, label, official: o.official === true, verified: typeof o.verified === 'boolean' ? o.verified : null };
}).filter((x): x is SourceRef => !!x);

async function brief(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const b = ctx.body;
  const query = txt(b.query, 300);
  if (query.length < 2) return bad(422, 'query_required');
  const type = (b.type === undefined || b.type === null ? null : String(b.type)) as PageType | null;
  if (type && !PAGE_TYPES.includes(type)) return bad(422, 'type_invalid');
  const adapterIn = b.adapter === undefined ? null : String(b.adapter);
  if (adapterIn && !(ADAPTERS as readonly string[]).includes(adapterIn)) return bad(422, 'adapter_invalid');
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const focusId = isUuid(b.focusId) ? b.focusId : null; const nodeId = isUuid(b.nodeId) ? b.nodeId : null; const scopeId = isUuid(b.geoScopeId) ? b.geoScopeId : null;
  const placeId = isUuid(b.placeId) ? b.placeId : null;
  const [focus, node, scope, geo] = await Promise.all([loadFocus(admin, project.id, focusId, env.tables), loadNode(admin, project.id, nodeId, env.tables), loadScope(admin, project.id, scopeId, env.tables), loadGeoPlace(admin, placeId, env.tables)]);
  const place = txt(b.place, 200) || scope?.place || geo?.name || null;
  const language = (parseLanguageTag(b.language)?.tag) || (scope?.language ? parseLanguageTag(scope.language)?.tag : null) || (focus?.language ? parseLanguageTag(focus.language)?.tag : null) || (env.profile.languages.map((l) => parseLanguageTag(l)?.tag).find(Boolean) as string | undefined) || null;
  if (!language) return bad(422, 'language_required');
  const subject = txt(b.subject, 200) || node?.label || null;
  const pages = await allPages(admin, project);
  const rules = rulesOf(env, type || 'pagina');

  // trava contra páginas finas em massa: páginas novas por lote (janela de 24 h)
  const since = ctx.deps.now() - 86_400_000;
  const created = pages.filter((p) => Date.parse(p.created_at) >= since).length;
  const thr = checkThrottle({ requested: 1, createdInWindow: created, batchLimit: rules.options.batch_limit, publishedToday: 0, dailyPublishLimit: rules.options.daily_publish_limit, kind: 'criar' });
  if (thr.blocked) return bad(429, 'batch_limit', { message: thr.reason, limit: rules.options.batch_limit, created_in_window: created });

  const site = await loadSitePages(admin, project.id, env.origin, env.tables);
  const lang2 = language.slice(0, 2).toLowerCase();
  const slugPath = txt(b.slugPath, 200).replace(/^\/+|\/+$/g, '') || buildSlugPath([subject || query, place || ''], lang2);
  const existing = pages.map((p) => p.slug_path);
  const parents = [...existing, ...site.map((s) => String(s.slugPath || ''))];
  const check = validateSlugPath(slugPath, { existing, parents: b.allowMissingParent === true ? undefined : parents, qualifiers: [place || '', subject || '', query].filter(Boolean), lang: lang2 });
  if (!check.ok) return bad(422, 'slug_invalid', { slug: check });

  const fieldFacts = cleanFacts(b.fieldFacts);
  const sources = cleanSources(b.sources);
  const citations = await loadCitations(admin, project.id, env.tables);
  const radar = await loadRadar(admin, project.id, query, focusId, env.tables, env.origin.replace(/^https:\/\//, ''));
  const ownText = [env.profile.offer || '', ...pages.filter((p) => p.subject && p.subject === subject).map((p) => p.body_html)].join(' ');
  const candidates = [...(node?.keywords || []).map((k) => ({ text: k, source: 'taxonomia' })), ...(focus?.topics || []).map((k) => ({ text: k, source: 'foco' })), ...(Array.isArray(b.candidateQuestions) ? (b.candidateQuestions as unknown[]).map((q) => ({ text: txt(q, 200), source: 'informada' })).filter((c) => c.text) : [])];
  const nowMs = ctx.deps.now();
  const sb = buildSuperiorityBrief({
    query, language, type, focus: focus ? { id: focus.id, label: focus.label } : null, node: node ? { id: node.id, label: node.label, keywords: node.keywords } : null,
    territory: { place, region: scope?.region || null, country: scope?.country || geo?.country || null }, profile: env.profile, fieldFacts, sources, radar, citations, ownText, ownTopics: [...(subject ? [subject] : []), ...(env.profile.offer ? [env.profile.offer] : [])],
    candidateQuestions: candidates, topN: rules.options.benchmark_top_n, nowMs, gbpUrl: env.profile.sameAs.find((u) => /google\.[a-z.]+\/maps|g\.page|maps\.app\.goo\.gl/i.test(u)) || null, linkCount: { internal: 0, external: sources.length },
  });
  const finalType = sb.type;
  const host = txt(b.host, 255).toLowerCase() || env.origin.replace(/^https:\/\//, '');
  const adapter = (adapterIn as AdapterKind) || (env.project.wordpress_url ? 'wordpress_plugin' : 'site_manifest');
  const basePath = adapter === 'wordpress_plugin' ? env.basePath : '';
  const url = publicUrl(env.origin, slugPath, basePath);
  const crumbs = breadcrumbsFor({ origin: env.origin, slugPath, homeLabel: LANGUAGES[lang2]?.labels.home ?? 'Home', title: subject ? (place ? `${subject} · ${place}` : subject) : query, basePath });
  const author = env.profile.authors[0] || null;
  const stored: StoredDoc = {
    ...emptyStored(), breadcrumbs: crumbs, sources, author, dateModified: new Date(nowMs).toISOString(), seoPlugin: env.profile.seoPlugin, segment: env.profile.segment, fieldFacts,
    areaServed: scope?.country ? [scope.country.toUpperCase()] : Array.isArray((env.project.commercial_info as Row | null)?.areas_served) ? ((env.project.commercial_info as Row).areas_served as unknown[]).map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)) : [],
    keywords: [query, ...(subject ? [subject] : []), ...(node?.keywords || [])].slice(0, 12), hasTranslations: b.hasTranslations === true,
  };
  const row = {
    id: crypto.randomUUID(), organization_id: project.organization_id, project_id: project.id, focus_id: focus?.id ?? null, taxonomy_node_id: node?.id ?? null, geo_scope_id: scope?.id ?? null, type: finalType, language, query, subject, place, slug_path: slugPath, host, base_path: basePath, adapter,
    external_id: crypto.randomUUID(), status: 'rascunho', version: 1, title: '', meta_description: '', h1: '', body_html: '', doc: stored, brief: sb, pipeline: {}, quality: {}, pending_count: pendingFromBrief(sb).length, created_by: ctx.userId, updated_by: ctx.userId,
    created_at: nowIso(ctx), updated_at: nowIso(ctx),
  };
  const ins = await admin.from('studio_pages').insert(row).select('*').maybeSingle();
  if (ins.error) { if ((ins.error as { code?: string }).code === '23505') return bad(422, 'slug_invalid', { slug: { ok: false, path: slugPath, issues: [{ code: 'colisao', text: 'Já existe uma página com esse endereço.' }], suggestions: [] } }); throw ins.error; }
  const page = (ins.data || row) as PageRow;
  const hash = await contentHash(rowToDoc({ ...page, ...row } as unknown as PageRow, env.origin));
  const vr = await admin.from('studio_page_versions').insert({ page_id: page.id, version: 1, organization_id: project.organization_id, project_id: project.id, title: '', meta_description: '', h1: '', body_html: '', doc: stored, quality: {}, content_hash: hash, reason: 'briefing', created_by: ctx.userId });
  if (vr.error) throw vr.error;
  await recordEvent(admin, eventOf(project, 'estudio.briefing_criado', { page_id: page.id, slug_path: slugPath, type: finalType }, { count: 1, radar: sb.radarSource, pendings: sb.pendings.length }));
  return ok({ page: summarize(page), brief: sb, slug: check, pendings: sb.pendings, profile_gaps: env.gaps, rules: { layers: rules.layers, batch_limit: rules.options.batch_limit } }, 201);
}

// ------------------------------------------------------------------------------------------------------------ generate
async function aiFor(ctx: StudioCtx, project: ProjectBase): Promise<StudioAiPort | null> {
  if (!ctx.deps.ai) return null;
  try { return await ctx.deps.ai({ organizationId: project.organization_id, projectId: project.id, userId: ctx.userId }); } catch { return null; }
}

async function generate(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  const sbRaw = page.brief as unknown as SuperiorityBrief;
  if (!sbRaw || !Array.isArray(sbRaw.outline)) return bad(422, 'brief_missing');
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const rules = rulesOf(env, page.type);
  const pages = await allPages(admin, project);
  const stored = storedOf(page);
  const doc0 = rowToDoc(page, env.origin);
  const site = await loadSitePages(admin, project.id, env.origin, env.tables);
  const ai = await aiFor(ctx, project);
  const prior = ctx.body.restart === true ? null : (page.pipeline && Array.isArray((page.pipeline as Row).sections) && (page.pipeline as Row).sections && ((page.pipeline as Row).sections as unknown[]).length ? (page.pipeline as unknown as PipelineState) : null);
  const planned = planInternalLinks({ page: { url: doc0.url, slugPath: page.slug_path, title: page.query, subject: page.subject, place: page.place, keywords: stored.keywords, type: page.type }, site: [...site, ...pages.filter((p) => p.status === 'publicada' && p.public_url).map((p): SitePage => ({ url: p.public_url as string, title: p.title, slugPath: p.slug_path, keywords: storedOf(p).keywords, published: true }))], minLinks: rules.gates.internal_links.value ?? 3 });
  const links = [...planned.links, ...planExternalLinks({ sources: stored.sources, targetKeywords: stored.keywords, ownHost: doc0.origin.replace(/^https:\/\//, ''), min: rules.gates.external_links.value ?? 1 }).links];
  const out = await runPipeline({
    brief: sbRaw, profile: env.profile, fieldFacts: stored.fieldFacts, sources: stored.sources, rules, origin: env.origin, slugPath: page.slug_path, url: doc0.url, breadcrumbs: stored.breadcrumbs, links, ai, now: ctx.deps.now, budgetMs: 100_000,
    nowYear: new Date(ctx.deps.now()).getUTCFullYear(), language: page.language,
  }, prior);
  const nowStamp = nowIso(ctx);
  const doc: StudioPageDoc = { ...doc0, bodyHtml: out.body, title: page.title || out.meta.title, metaDescription: page.meta_description || out.meta.description, h1: page.h1 || out.meta.h1, links, dateModified: nowStamp };
  const nextStored: StoredDoc = { ...docToStored(doc, stored), links, usedFactIds: out.usedFactIds, inboundSuggested: planned.inbound };
  const patch: Row = { title: doc.title, meta_description: doc.metaDescription, h1: doc.h1, body_html: out.body, doc: nextStored, pipeline: out.state, status: 'rascunho', approved_by: null, approved_at: null, approved_hash: null, last_error: null };
  const tmp = { ...page, ...patch } as PageRow;
  const c = await computeQuality(admin, ctx, project, env, tmp, pages, { doc });
  const saved = await saveVersion(admin, ctx, project, page, patch, ai ? 'geração' : 'rascunho sem IA', c);
  if ('reply' in saved) return saved.reply;
  await recordEvent(admin, eventOf(project, 'estudio.pagina_gerada', { page_id: page.id, slug_path: page.slug_path }, { count: out.state.aiUsed, cost_usd_micros: out.state.costMicros, stopped: out.state.stopped?.reason ?? null, pendings: out.pendings.length }));
  return ok({
    page: summarize(saved.page), quality: compactQuality(c.quality, c.hash), pendings: out.pendings,
    pipeline: { stage: out.state.stage, done: out.state.done, stopped: out.state.stopped, ai_used: out.state.aiUsed, cost_usd_micros: out.state.costMicros, cost_is_estimate: true, steps: out.state.steps.slice(-20), sections: out.state.sections.map((s) => ({ id: s.id, heading: s.heading, status: s.status, reason: s.reason ?? null })), ai_available: !!ai },
  });
}

// ------------------------------------------------------------------------------------------------------------ revise
async function revise(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page; const b = ctx.body;
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const stored = storedOf(page);
  const patch: Row = {}; const nextStored: StoredDoc = { ...stored };
  let changed = false;
  const setText = (key: 'title' | 'meta_description' | 'h1', val: unknown, max: number) => { if (typeof val === 'string') { const t = val.replace(/\s+/g, ' ').trim().slice(0, max); if (t !== page[key]) { patch[key] = t; changed = true; } } };
  setText('title', b.title, 300); setText('meta_description', b.metaDescription, 500); setText('h1', b.h1, 300);
  if (typeof b.bodyHtml === 'string' && b.bodyHtml !== page.body_html) { patch.body_html = b.bodyHtml.slice(0, 400_000); changed = true; }
  let slugPath = page.slug_path;
  if (typeof b.slugPath === 'string') {
    const s = b.slugPath.trim().replace(/^\/+|\/+$/g, '');
    if (s && s !== page.slug_path) {
      const pages = await allPages(admin, project);
      const c = validateSlugPath(s, { existing: pages.map((p) => p.slug_path), selfPath: page.slug_path, qualifiers: [page.place || '', page.subject || ''].filter(Boolean), lang: page.language.slice(0, 2) });
      if (!c.ok) return bad(422, 'slug_invalid', { slug: c });
      slugPath = s; patch.slug_path = s; changed = true;
      if (page.published_version !== null || page.status === 'publicada') nextStored.redirectFrom = page.slug_path; // 301 obrigatório no destino
      nextStored.breadcrumbs = breadcrumbsFor({ origin: env.origin, slugPath: s, homeLabel: LANGUAGES[page.language.slice(0, 2)]?.labels.home ?? 'Home', title: (patch.h1 as string) || page.h1 || page.query, basePath: page.base_path });
    }
  }
  if (Array.isArray(b.faq)) { nextStored.faq = (b.faq as unknown[]).slice(0, 30).map((f) => ({ q: txt((f as Row)?.q, 300), a: txt((f as Row)?.a, 1500) })).filter((f) => f.q && f.a); changed = true; }
  if (Array.isArray(b.sources)) { nextStored.sources = cleanSources(b.sources); changed = true; }
  if (Array.isArray(b.fieldFacts)) { nextStored.fieldFacts = cleanFacts(b.fieldFacts); nextStored.usedFactIds = []; changed = true; }
  if (b.author !== undefined) { const a = b.author as Row | null; nextStored.author = a && txt(a.name, 120) ? { name: txt(a.name, 120), credential: txt(a.credential, 200) || null, url: httpsUrl(a.url) } : null; changed = true; }
  if (typeof b.noindex === 'boolean') { nextStored.noindex = b.noindex; changed = true; }
  if (b.hreflang && typeof b.hreflang === 'object') { nextStored.hreflang = Object.fromEntries(Object.entries(b.hreflang as Row).filter(([, v]) => !!httpsUrl(v)).map(([k, v]) => [k, String(v)])); changed = true; }
  if (typeof b.hasTranslations === 'boolean') { nextStored.hasTranslations = b.hasTranslations; changed = true; }
  if (!changed) return bad(422, 'nothing_to_change');
  nextStored.dateModified = nowIso(ctx);
  nextStored.usedFactIds = Array.isArray(b.fieldFacts) ? [] : nextStored.usedFactIds;
  const pages = await allPages(admin, project);
  const merged = { ...page, ...patch, slug_path: slugPath, doc: nextStored } as PageRow;
  const doc = rowToDoc(merged, env.origin);
  nextStored.usedFactIds = factsUsed(doc.bodyHtml, nextStored.fieldFacts);
  Object.assign(patch, { doc: nextStored, status: 'rascunho', approved_by: null, approved_at: null, approved_hash: null, last_error: null });
  const c = await computeQuality(admin, ctx, project, env, { ...merged, doc: nextStored }, pages, { doc: { ...doc, dateModified: nextStored.dateModified } });
  const saved = await saveVersion(admin, ctx, project, page, patch, txt(b.reason, 300) || 'revisão humana', c);
  if ('reply' in saved) return saved.reply;
  await recordEvent(admin, eventOf(project, 'estudio.pagina_revisada', { page_id: page.id, slug_path: slugPath }, { count: 1 }));
  return ok({ page: summarize(saved.page), quality: compactQuality(c.quality, c.hash), redirect_needed: nextStored.redirectFrom ? { from: `/${nextStored.redirectFrom}/`, to: `/${slugPath}/` } : null });
}

// ------------------------------------------------------------------------------------------------------------ check
async function check(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const pages = await allPages(admin, project);
  let verified = 0;
  if (ctx.body.verifyLinks === true) {
    const stored = storedOf(page);
    const urls = [...stored.sources.map((s) => s.url), ...stored.links.filter((x) => x.kind === 'externo').map((x) => x.url)];
    const res = await verifyLinks(urls, { fetchFn: ctx.deps.fetchFn, lookupA: ctx.deps.lookupA });
    const map = new Map(res.map((r) => [r.url, r]));
    const nextStored: StoredDoc = { ...stored, sources: stored.sources.map((s) => (map.has(s.url) ? { ...s, verified: map.get(s.url)!.ok } : s)), links: stored.links.map((x) => (map.has(x.url) ? { ...x, verified: map.get(x.url)!.ok } : x)) };
    const up = await admin.from('studio_pages').update({ doc: nextStored, updated_at: nowIso(ctx) }).eq('id', page.id).eq('project_id', project.id).eq('updated_at', page.updated_at).select('*').maybeSingle();
    if (up.error) throw up.error;
    if (!up.data) return bad(409, 'page_changed_reload');
    Object.assign(page, up.data);
    for (const r of res) {
      const u = await admin.from('studio_page_links').update({ verified: r.ok, verified_at: nowIso(ctx), http_status: r.status }).eq('page_id', page.id).eq('url', r.url);
      if (u.error) throw u.error; verified++;
    }
  }
  const c = await computeQuality(admin, ctx, project, env, page, pages);
  const up2 = await admin.from('studio_pages').update({ quality: compactQuality(c.quality, c.hash), quality_score: c.quality.score, ai_score: c.quality.ai.score, content_hash: c.hash, pending_count: c.quality.pendings.length }).eq('id', page.id).eq('project_id', project.id).select('*').maybeSingle();
  if (up2.error) throw up2.error;
  await recordEvent(admin, eventOf(project, 'estudio.qualidade_verificada', { page_id: page.id }, { count: c.quality.active, score: c.quality.score, blocking: c.quality.blocking.length }));
  return ok({ quality: compactQuality(c.quality, c.hash), links_verified: verified, page: summarize((up2.data || page) as PageRow) });
}

// ------------------------------------------------------------------------------------------------------------ plan_links
async function planLinks(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const rules = rulesOf(env, page.type);
  const pages = await allPages(admin, project);
  const stored = storedOf(page);
  const doc0 = rowToDoc(page, env.origin);
  const site = await loadSitePages(admin, project.id, env.origin, env.tables);
  const siteAll: SitePage[] = [...site, ...pages.filter((p) => p.id !== page.id && p.status === 'publicada' && p.public_url).map((p): SitePage => ({ url: p.public_url as string, title: p.title, slugPath: p.slug_path, keywords: storedOf(p).keywords, published: true }))];
  const used: Record<string, string[]> = {};
  for (const p of pages.filter((x) => x.id !== page.id)) for (const k of storedOf(p).links.filter((x) => x.kind === 'interno')) used[k.url] = [...(used[k.url] || []), k.anchor];
  const internal = planInternalLinks({ page: { url: doc0.url, slugPath: page.slug_path, title: page.title || page.query, subject: page.subject, place: page.place, keywords: stored.keywords, type: page.type }, site: siteAll, usedAnchors: used, minLinks: rules.gates.internal_links.value ?? 3 });
  let sources = stored.sources;
  if (ctx.body.verifyLinks === true && sources.length) {
    const res = await verifyLinks(sources.map((s) => s.url), { fetchFn: ctx.deps.fetchFn, lookupA: ctx.deps.lookupA });
    const m = new Map(res.map((r) => [r.url, r.ok])); sources = sources.map((s) => (m.has(s.url) ? { ...s, verified: m.get(s.url)! } : s));
  }
  const external = planExternalLinks({ sources, targetKeywords: stored.keywords, ownHost: env.origin.replace(/^https:\/\//, ''), min: rules.gates.external_links.value ?? 1 });
  const links = [...internal.links, ...external.links];
  const labels = LINK_LABELS[page.language.slice(0, 2).toLowerCase()] || LINK_LABELS.en;
  const body = page.body_html ? replaceLinkBlocks(page.body_html, renderLinkBlocks(links, labels)) : page.body_html;
  const nextStored: StoredDoc = { ...stored, links, sources, inboundSuggested: internal.inbound, dateModified: nowIso(ctx) };
  const patch: Row = { body_html: body, doc: nextStored, status: 'rascunho', approved_by: null, approved_at: null, approved_hash: null };
  const merged = { ...page, ...patch } as PageRow;
  const c = await computeQuality(admin, ctx, project, env, merged, pages);
  const saved = await saveVersion(admin, ctx, project, page, patch, 'plano de links', c);
  if ('reply' in saved) return saved.reply;
  const del = await admin.from('studio_page_links').delete().eq('page_id', page.id);
  if (del.error) throw del.error;
  const rows = [
    ...links.map((x) => ({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, direction: 'saida', kind: x.kind, url: x.url, anchor: x.anchor, reason: x.reason, verified: x.verified ?? null })),
    ...internal.inbound.map((x) => ({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, direction: 'entrada', kind: 'interno', url: x.from, anchor: '', reason: x.reason, verified: null })),
  ];
  if (rows.length) { const ins = await admin.from('studio_page_links').insert(rows); if (ins.error) throw ins.error; }
  await recordEvent(admin, eventOf(project, 'estudio.links_planejados', { page_id: page.id }, { count: links.length, inbound: internal.inbound.length, missing_internal: internal.missing, missing_external: external.missing }));
  return ok({ page: summarize(saved.page), links, inbound: internal.inbound, missing: { internal: internal.missing, external: external.missing }, rejected_external: external.rejected, quality: compactQuality(c.quality, c.hash) });
}

// ------------------------------------------------------------------------------------------------------------ images
async function images(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const policy = resolvePolicy(await loadPolicyRows(admin, ctx.userId, project.id, env.tables));
  const rawAssets = await loadAssetRows(admin, ctx.userId, project.id, env.tables);
  const assets: AssetRow[] = rawAssets.map((a): AssetRow => {
    let pub = typeof a.external_url === 'string' ? a.external_url : null;
    if (!pub && a.source_type === 'storage' && admin.storage) { try { pub = admin.storage.from(String(a.bucket_name)).getPublicUrl(String(a.storage_path))?.data?.publicUrl || null; } catch { pub = null; } }
    return { id: String(a.id), label: String(a.label || ''), source_type: a.source_type === 'storage' ? 'storage' : 'external_url', external_url: typeof a.external_url === 'string' ? a.external_url : null, public_url: pub, alt_text: String(a.alt_text || ''), semantic_filename: String(a.semantic_filename || ''), caption: typeof a.caption === 'string' ? a.caption : null, semantic_tags: Array.isArray(a.semantic_tags) ? (a.semantic_tags as unknown[]).map(String) : [], is_active: a.is_active !== false, usage_count: Number(a.usage_count) || 0 };
  });
  const generate = ctx.body.generate === true && policy.allow_ai_generation;
  const port = generate && ctx.deps.image ? await ctx.deps.image({ organizationId: project.organization_id, projectId: project.id, userId: ctx.userId }).catch(() => null) : null;
  const scene = ctx.body.scene && typeof ctx.body.scene === 'object' ? { sceneEn: txt((ctx.body.scene as Row).sceneEn, 400), alt: txt((ctx.body.scene as Row).alt, 200) } : null;
  const stored = storedOf(page);
  const r = await buildImages({ policy: generate ? policy : { ...policy, allow_ai_generation: false }, assets, topic: { subject: page.subject || page.query, place: page.place, keywords: stored.keywords }, language: page.language, origin: env.origin, inline: Math.max(0, Math.min(4, Number(ctx.body.inline) || 0)), scene: scene && scene.sceneEn && scene.alt ? scene : null, port, credit: txt(ctx.body.credit, 200) || null });
  const pages = await allPages(admin, project);
  const nextStored: StoredDoc = { ...stored, images: r.images, dateModified: nowIso(ctx) };
  const patch: Row = { doc: nextStored, status: 'rascunho', approved_by: null, approved_at: null, approved_hash: null };
  const merged = { ...page, ...patch } as PageRow;
  const c = await computeQuality(admin, ctx, project, env, merged, pages);
  const saved = await saveVersion(admin, ctx, project, page, patch, 'imagens', c);
  if ('reply' in saved) return saved.reply;
  const del = await admin.from('studio_page_assets').delete().eq('page_id', page.id);
  if (del.error) throw del.error;
  const rows = r.images.map((i, k) => ({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, slot: i.slot, position: i.slot === 'inline' ? k : 0, origin: i.origin, url: i.url, alt: i.alt, width: i.width, height: i.height, format: i.format, filename: i.filename, credit: i.credit ?? null, bytes: i.bytes ?? null, cost_usd_micros: i.origin === 'gerada' ? Math.round(r.costMicros / Math.max(1, r.generated)) : 0 }));
  if (rows.length) { const ins = await admin.from('studio_page_assets').insert(rows); if (ins.error) throw ins.error; }
  await recordEvent(admin, eventOf(project, 'estudio.imagens_preparadas', { page_id: page.id }, { count: r.images.filter((i) => i.origin !== 'pendente').length, generated: r.generated, selected: r.selected, cost_usd_micros: r.costMicros }));
  return ok({ page: summarize(saved.page), images: r.images, pendings: r.pendings, notes: r.notes, generated: r.generated, selected: r.selected, cost_usd_micros: r.costMicros, cost_is_estimate: true, stopped: r.stopped, policy });
}

// ------------------------------------------------------------------------------------------------------------ approve
async function approve(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  const step = String(ctx.body.step || '');
  if (!['enviar', 'aprovar', 'devolver'].includes(step)) return bad(422, 'step_invalid');
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const rules = rulesOf(env, page.type);
  const pages = await allPages(admin, project);
  const upd = async (patch: Row, to: PageStatus): Promise<PageRow | null> => {
    if (!canTransition(page.status, to)) return null;
    const r = await admin.from('studio_pages').update({ ...patch, status: to, updated_by: ctx.userId, updated_at: nowIso(ctx) }).eq('id', page.id).eq('project_id', project.id).eq('organization_id', project.organization_id).eq('status', page.status).eq('updated_at', page.updated_at).select('*').maybeSingle();
    if (r.error) throw r.error;
    return (r.data as PageRow) || null;
  };
  if (step === 'enviar') {
    const c = await computeQuality(admin, ctx, project, env, page, pages);
    const next = await upd({ quality: compactQuality(c.quality, c.hash), quality_score: c.quality.score, ai_score: c.quality.ai.score, content_hash: c.hash }, 'em_revisao');
    if (!next) return bad(409, 'transition_invalid');
    await recordEvent(admin, eventOf(project, 'estudio.enviada_para_revisao', { page_id: page.id }, { count: 1 }));
    return ok({ page: summarize(next), quality: compactQuality(c.quality, c.hash) });
  }
  if (step === 'devolver') {
    const next = await upd({ approved_by: null, approved_at: null, approved_hash: null }, 'rascunho');
    if (!next) return bad(409, 'transition_invalid');
    await recordEvent(admin, eventOf(project, 'estudio.pagina_devolvida', { page_id: page.id }, { count: 1 }));
    return ok({ page: summarize(next) });
  }
  // aprovar: verificação NOVA agora (o relatório antigo não vale), sem pendência no texto, hash igual, aprovador conforme o perfil de regras
  const c = await computeQuality(admin, ctx, project, env, page, pages);
  const check = approvalCheck({ page: { status: page.status, created_by: page.created_by, content_hash: c.hash }, currentHash: c.hash, quality: c.quality, userId: ctx.userId, options: rules.options, pendingMarkers: extractPendingMarkers(page.body_html).length });
  if (!check.ok) return bad(422, 'approval_blocked', { reasons: check.reasons, quality: compactQuality(c.quality, c.hash) });
  const next = await upd({ approved_by: ctx.userId, approved_at: nowIso(ctx), approved_hash: c.hash, content_hash: c.hash, quality: compactQuality(c.quality, c.hash), quality_score: c.quality.score, ai_score: c.quality.ai.score }, 'aprovada');
  if (!next) return bad(409, 'transition_invalid');
  await recordEvent(admin, eventOf(project, 'estudio.pagina_aprovada', { page_id: page.id, slug_path: page.slug_path }, { count: 1, score: c.quality.score }));
  return ok({ page: summarize(next), approved_hash: c.hash });
}

// ------------------------------------------------------------------------------------------------------------ publish
async function enqueueIndexation(admin: Admin, ctx: StudioCtx, project: ProjectBase, page: PageRow, url: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { queued: false, indexnow: 'nao_tentado', bing: 'use_o_modulo_indexacao', sitemap: page.adapter === 'site_manifest' ? 'no_pacote' : 'pelo_wordpress' };
  try {
    const u = new URL(url);
    const path = u.pathname;
    const up = await admin.from('index_urls').upsert({ organization_id: project.organization_id, project_id: project.id, url, host: u.hostname.toLowerCase(), path, source: 'manual', in_sitemap: false, last_seen: nowIso(ctx), changed_at: nowIso(ctx), lang: page.language.slice(0, 2) }, { onConflict: 'project_id,url' });
    if (up.error) throw up.error;
    out.queued = true;
    const key = await admin.from('index_keys').select('key_value,key_location').eq('project_id', project.id).eq('host', u.hostname.toLowerCase()).maybeSingle();
    const k = key?.data as { key_value?: string; key_location?: string } | null;
    if (k?.key_value) {
      const res = await submitIndexNow(ctx.deps.fetchFn, { host: u.hostname.toLowerCase(), key: k.key_value, keyLocation: k.key_location || `https://${u.hostname.toLowerCase()}/${k.key_value}.txt`, urlList: [url] });
      out.indexnow = res.state; out.indexnow_http = res.status;
      await admin.from('index_submissions').insert({ organization_id: project.organization_id, project_id: project.id, engine: 'indexnow', host: u.hostname.toLowerCase(), urls_count: 1, status: res.state, response: { http_status: res.status, message: res.message }, created_by: ctx.userId });
    } else out.indexnow = 'sem_chave';
  } catch { out.error = 'a fila de indexação não pôde ser atualizada; use o módulo Indexação'; }
  return out;
}

async function publish(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  const env = await loadEnv(admin, ctx, project);
  if (!env.origin) return bad(422, 'origin_required');
  const rules = rulesOf(env, page.type);
  const pages = await allPages(admin, project);
  const stored = storedOf(page);
  const c = await computeQuality(admin, ctx, project, env, page, pages);
  const gate = publishCheck({ page, currentHash: c.hash, quality: c.quality, adapter: page.adapter });
  const recordFail = async (why: string, extra: Row = {}) => {
    await admin.from('studio_publications').insert({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, version: page.version, adapter: page.adapter, action: 'publicar', status: 'recusada', content_hash: c.hash, result: extra, error: why.slice(0, 480), created_by: ctx.userId });
    await recordEvent(admin, eventOf(project, 'estudio.publicacao_falhou', { page_id: page.id }, { count: 1, reason: why.slice(0, 120) }));
  };
  if (!gate.ok) { await recordFail(gate.reasons.join(' | ')); return bad(page.status === 'aprovada' ? 422 : 403, page.status === 'aprovada' || page.status === 'despublicada' ? 'publish_blocked' : 'not_approved', { reasons: gate.reasons }); }
  if (page.adapter === 'zica_hosted') return bad(501, 'adapter_not_built', { contract: ZICA_HOSTED_CONTRACT });
  const startOfDay = new Date(ctx.deps.now()); startOfDay.setUTCHours(0, 0, 0, 0);
  const publishedToday = pages.filter((p) => p.published_at && Date.parse(p.published_at) >= startOfDay.getTime()).length;
  const thr = checkThrottle({ requested: 1, createdInWindow: 0, batchLimit: rules.options.batch_limit, publishedToday, dailyPublishLimit: rules.options.daily_publish_limit, kind: 'publicar' });
  if (thr.blocked) return bad(429, 'daily_limit', { message: thr.reason });
  if (c.quality.doorway.verdict === 'porta') return bad(422, 'doorway', { reasons: c.quality.doorway.reasons, proposal: c.quality.doorway.proposal });

  const doc = c.doc;
  if (page.adapter === 'wordpress_plugin') {
    if (!ctx.deps.plugin) return bad(503, 'plugin_unavailable');
    const asDraft = ctx.body.target === 'draft';
    const payload = await buildPluginPagePayload({ externalId: page.external_id, doc, graph: c.schema.graph, rules, status: asDraft ? 'draft' : 'publish', hasTranslations: stored.hasTranslations, dropTypes: c.schema.dropped });
    let reply: ReturnType<typeof parsePluginPageReply>;
    try { reply = parsePluginPageReply(await ctx.deps.plugin({ organizationId: project.organization_id, projectId: project.id }, 'pages', { method: 'POST', body: payload }), page.slug_path); } catch (e) {
      const msg = (e as Error)?.message ? String((e as Error).message).slice(0, 200) : 'O plugin não respondeu.';
      await recordFail(msg);
      await admin.from('studio_pages').update({ last_error: msg.slice(0, 480) }).eq('id', page.id).eq('project_id', project.id);
      return bad(502, 'publish_blocked', { reasons: [msg] });
    }
    if (!reply.ok) { await recordFail(reply.error || 'recusada', { slug_changed: reply.slugChanged, path: reply.path }); await admin.from('studio_pages').update({ last_error: (reply.error || '').slice(0, 480) }).eq('id', page.id).eq('project_id', project.id); return bad(409, 'publish_blocked', { reasons: [reply.error || 'O plugin recusou.'], slug_changed: reply.slugChanged }); }
    const finalUrl = reply.url || doc.url;
    if (asDraft) {
      await admin.from('studio_publications').insert({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, version: page.version, adapter: 'wordpress_plugin', action: 'publicar', status: 'ok', content_hash: c.hash, result: { wp_status: reply.status, draft: true, completeness: reply.completeness }, final_url: finalUrl, wp_post_id: reply.id, created_by: ctx.userId });
      return ok({ published: false, draft_sent: true, wp_post_id: reply.id, url: finalUrl, completeness: reply.completeness });
    }
    const now = nowIso(ctx);
    const up = await admin.from('studio_pages').update({ status: 'publicada', public_url: finalUrl, wp_post_id: reply.id, published_version: page.version, published_at: now, unpublished_at: null, last_error: null, updated_by: ctx.userId, updated_at: now }).eq('id', page.id).eq('project_id', project.id).eq('status', page.status).select('*').maybeSingle();
    if (up.error) throw up.error;
    const indexation = await enqueueIndexation(admin, ctx, project, page, finalUrl);
    await admin.from('studio_publications').insert({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, version: page.version, adapter: 'wordpress_plugin', action: 'publicar', status: 'ok', content_hash: c.hash, result: { wp_status: reply.status, idempotent: reply.idempotent, created: reply.created, completeness: reply.completeness }, final_url: finalUrl, wp_post_id: reply.id, indexation, created_by: ctx.userId });
    await recordEvent(admin, eventOf(project, 'estudio.pagina_publicada', { page_id: page.id, slug_path: page.slug_path }, { count: 1, urls: 1, adapter: 'wordpress_plugin' }));
    const comp = (reply.completeness && typeof reply.completeness === 'object' ? reply.completeness : {}) as { hash?: { stored?: string | null; expected?: string | null } };
    const warnings = comp.hash?.stored && comp.hash.expected && comp.hash.stored !== comp.hash.expected ? ['O WordPress filtrou o HTML (wp_kses_post): o texto gravado não é idêntico ao aprovado. Confira a página no ar.'] : [];
    return ok({ published: true, page: up.data ? summarize(up.data as PageRow) : summarize(page), url: finalUrl, indexation, completeness: reply.completeness, idempotent: reply.idempotent, warnings });
  }

  // site_manifest: 1ª chamada gera o PACOTE; a página só vira "publicada" quando a pessoa confirma que o pacote subiu e a URL responde
  if (ctx.body.confirmDeployed !== true) {
    const pkg = await buildStaticPackage({ pages: [{ externalId: page.external_id, version: page.version, doc, graph: c.schema.graph, approvedHash: page.approved_hash || c.hash, previousPath: stored.redirectFrom, wasPublished: !!stored.redirectFrom }], siteName: env.profile.name, language: page.language, llmsTxt: ctx.body.llmsTxt === true, now: ctx.deps.now });
    await admin.from('studio_publications').insert({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, version: page.version, adapter: 'site_manifest', action: 'publicar', status: 'pacote_gerado', content_hash: c.hash, result: { manifest: pkg.manifest, warnings: pkg.warnings }, final_url: doc.url, created_by: ctx.userId });
    await recordEvent(admin, eventOf(project, 'estudio.pacote_gerado', { page_id: page.id, slug_path: page.slug_path }, { count: pkg.files.length }));
    return ok({ published: false, package: { files: pkg.files, manifest: pkg.manifest, warnings: pkg.warnings, instructions: pkg.instructions }, next_step: 'Publique o pacote no site e volte para confirmar (confirmDeployed).' });
  }
  const live = await checkLive(ctx, doc.url, doc);
  if (!live.ok) { await recordFail(live.reason); return bad(422, 'publish_blocked', { reasons: [live.reason], live }); }
  const now = nowIso(ctx);
  const up = await admin.from('studio_pages').update({ status: 'publicada', public_url: doc.url, published_version: page.version, published_at: now, unpublished_at: null, last_error: null, updated_by: ctx.userId, updated_at: now }).eq('id', page.id).eq('project_id', project.id).eq('status', page.status).select('*').maybeSingle();
  if (up.error) throw up.error;
  const indexation = await enqueueIndexation(admin, ctx, project, page, doc.url);
  await admin.from('studio_publications').insert({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, version: page.version, adapter: 'site_manifest', action: 'publicar', status: 'ok', content_hash: c.hash, result: { live }, final_url: doc.url, indexation, created_by: ctx.userId });
  await recordEvent(admin, eventOf(project, 'estudio.pagina_publicada', { page_id: page.id, slug_path: page.slug_path }, { count: 1, urls: 1, adapter: 'site_manifest' }));
  return ok({ published: true, page: up.data ? summarize(up.data as PageRow) : summarize(page), url: doc.url, indexation, live });
}

/** A URL pública responde 200, tem o canonical certo e não está noindex. Só https público (sem rede interna). */
async function checkLive(ctx: StudioCtx, url: string, doc: StudioPageDoc): Promise<{ ok: boolean; status: number | null; reason: string }> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return { ok: false, status: null, reason: 'A URL precisa ser https.' };
    const ips = await ctx.deps.lookupA(u.hostname);
    if (!ips.length || ips.some((ip) => /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.)/.test(ip))) return { ok: false, status: null, reason: 'O endereço não é público.' };
    const res = await ctx.deps.fetchFn(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'ZicaPostsStudioCheck/1.0' }, signal: timeoutSignal(15_000) });
    const html = (await res.text()).slice(0, 400_000);
    if (res.status !== 200) return { ok: false, status: res.status, reason: `A página respondeu ${res.status}, não 200.` };
    if (!html.includes(`href="${doc.url}"`) && !html.includes(`href='${doc.url}'`)) return { ok: false, status: 200, reason: 'A página no ar não tem o canonical esperado (pode ser outra página, como uma resposta genérica do site).' };
    if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html) && !doc.noindex) return { ok: false, status: 200, reason: 'A página no ar está noindex.' };
    return { ok: true, status: 200, reason: '' };
  } catch { return { ok: false, status: null, reason: 'Não consegui abrir a URL.' }; }
}

// ------------------------------------------------------------------------------------------------------------ unpublish
async function unpublish(admin: Admin, ctx: StudioCtx, project: ProjectBase): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  if (page.status !== 'publicada') return bad(422, 'transition_invalid');
  if (page.adapter === 'wordpress_plugin') {
    if (!ctx.deps.plugin) return bad(503, 'plugin_unavailable');
    try { const r = await ctx.deps.plugin({ organizationId: project.organization_id, projectId: project.id }, 'pages/status', { method: 'POST', body: { zica_ai_id: page.external_id, status: 'draft' } }); if (r.success !== true) return bad(502, 'publish_blocked', { reasons: ['O plugin não confirmou a despublicação.'] }); } catch { return bad(502, 'publish_blocked', { reasons: ['O plugin não respondeu.'] }); }
  } else if (ctx.body.confirmRemoved !== true) {
    return ok({ unpublished: false, next_step: 'Apague a pasta da página no site (a lista está no manifesto do pacote), coloque o redirecionamento 301 se houver destino, e confirme (confirmRemoved).' });
  }
  const now = nowIso(ctx);
  const up = await admin.from('studio_pages').update({ status: 'despublicada', unpublished_at: now, published_version: null, updated_by: ctx.userId, updated_at: now }).eq('id', page.id).eq('project_id', project.id).eq('status', 'publicada').select('*').maybeSingle();
  if (up.error) throw up.error;
  await admin.from('studio_publications').insert({ organization_id: project.organization_id, project_id: project.id, page_id: page.id, version: page.version, adapter: page.adapter, action: 'despublicar', status: 'ok', content_hash: page.content_hash, result: {}, final_url: page.public_url, created_by: ctx.userId });
  await recordEvent(admin, eventOf(project, 'estudio.pagina_despublicada', { page_id: page.id, slug_path: page.slug_path }, { count: 1 }));
  return ok({ unpublished: true, page: up.data ? summarize(up.data as PageRow) : summarize(page), redirect_hint: 'Se a página tinha tráfego, aponte o endereço antigo para uma página equivalente com um 301.' });
}

// ------------------------------------------------------------------------------------------------------------ list e detail
async function list(admin: Admin, ctx: StudioCtx, project: ProjectBase, role: string): Promise<Reply> {
  const env = await loadEnv(admin, ctx, project);
  const pages = await allPages(admin, project);
  const status = typeof ctx.body.status === 'string' ? ctx.body.status : '';
  const type = typeof ctx.body.type === 'string' ? ctx.body.type : '';
  const q = txt(ctx.body.q, 100).toLowerCase();
  const filtered = pages.filter((p) => (!status || p.status === status) && (!type || p.type === type) && (!q || `${p.title} ${p.query} ${p.slug_path}`.toLowerCase().includes(q))).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const page = Math.max(0, Math.floor(Number(ctx.body.page) || 0));
  const counts: Record<string, number> = { rascunho: 0, em_revisao: 0, aprovada: 0, publicada: 0, despublicada: 0 };
  for (const p of pages) counts[p.status] = (counts[p.status] || 0) + 1;
  const rules = rulesOf(env, 'pagina');
  const cost = estimateCost({ options: rules.options, sections: 5, imagesToGenerate: 0 });
  const since = ctx.deps.now() - 86_400_000;
  return ok({
    project: { id: project.id, name: project.name, domain: project.domain }, can_edit: ['owner', 'admin', 'editor'].includes(role), total: filtered.length, page, page_size: PAGE_SIZE, counts,
    pages: filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(summarize),
    options: { ...rules.options, created_in_24h: pages.filter((p) => Date.parse(p.created_at) >= since).length }, rules_layers: rules.layers,
    capabilities: { ai: !!ctx.deps.ai, images: !!ctx.deps.image, plugin: !!ctx.deps.plugin, radar: !!env.tables.radar_pages, serp_local: !!(env.tables.market_queries && env.tables.market_serp_results), observatory: !!env.tables.nexus_citations, taxonomy: !!env.tables.project_taxonomy_nodes, focuses: !!env.tables.project_focuses },
    profile_gaps: env.gaps, cost, adapters: ADAPTERS, types: PAGE_TYPES, origin: env.origin, base_path: env.basePath,
  });
}

async function detail(admin: Admin, ctx: StudioCtx, project: ProjectBase, role: string): Promise<Reply> {
  const l = await loadPage(admin, project, ctx.body.pageId); if ('reply' in l) return l.reply;
  const page = l.page;
  const env = await loadEnv(admin, ctx, project);
  const origin = env.origin || '';
  const rules = rulesOf(env, page.type);
  const doc = rowToDoc(page, origin);
  const pages = await allPages(admin, project);
  const c = await computeQuality(admin, ctx, project, env, page, pages);
  const [vers, links, assets, pubs] = await Promise.all([
    admin.from('studio_page_versions').select('version,title,content_hash,reason,created_by,created_at').eq('page_id', page.id).order('version', { ascending: false }).limit(30),
    admin.from('studio_page_links').select('direction,kind,url,anchor,reason,verified,http_status').eq('page_id', page.id).limit(200),
    admin.from('studio_page_assets').select('slot,position,origin,url,alt,width,height,format,filename,credit,bytes').eq('page_id', page.id).limit(30),
    admin.from('studio_publications').select('version,adapter,action,status,final_url,indexation,error,created_at').eq('page_id', page.id).order('created_at', { ascending: false }).limit(15),
  ]);
  const body = doc.bodyHtml;
  const stored = storedOf(page);
  const sections = Array.isArray((page.pipeline as Row)?.sections) ? ((page.pipeline as Row).sections as Row[]) : [];
  const cost = estimateCost({ options: rules.options, sections: Math.max(3, sections.length || 5), imagesToGenerate: 0 });
  return ok({
    page: { ...summarize(page), query: page.query, subject: page.subject, place: page.place, host: page.host, base_path: page.base_path, h1: page.h1, meta_description: page.meta_description, body_html: page.body_html, public_url: page.public_url, external_id: page.external_id, approved_by: page.approved_by, approved_at: page.approved_at, last_error: page.last_error, content_hash: c.hash, approved_hash: page.approved_hash, published_version: page.published_version },
    doc: stored, brief: page.brief, quality: compactQuality(c.quality, c.hash), marked_html: markFindings(body, c.quality.ai.findings),
    serp: { title: page.title, url: doc.url, display_url: doc.url.replace(/^https:\/\//, '').replace(/\/$/, '').split('/').join(' › '), description: page.meta_description },
    preview_html: origin ? renderDocument(doc, c.schema.graph, { siteName: env.profile.name }) : '', schema: c.schema.graph, schema_notes: c.schema.notes,
    versions: vers.data || [], links: links.data || [], assets: assets.data || [], publications: pubs.data || [], profile_gaps: env.gaps,
    pipeline: { stage: (page.pipeline as Row)?.stage ?? null, done: (page.pipeline as Row)?.done ?? false, stopped: (page.pipeline as Row)?.stopped ?? null, sections: sections.map((s) => ({ id: s.id, heading: s.heading, status: s.status, reason: s.reason ?? null })) },
    can_edit: ['owner', 'admin', 'editor'].includes(role), cost, labels: labelsFor(page.language),
    rules: { layers: rules.layers, options: rules.options, gates: Object.fromEntries(Object.entries(rules.gates).map(([k, v]) => [k, { level: v.level, value: v.value ?? null, max: v.max ?? null, source: v.source }])) },
  });
}

// util exportado para testes
export { slugifySegment };
