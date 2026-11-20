/**
 * Ações do Planejador de Campanha de Mercado e dos concorrentes (despachadas por taxonomy-handler.ts).
 *
 *  - `campaign_plan`:           gera o plano AUTOMATICAMENTE (áreas aprovadas x lugares x mercados x motores, nas 4 fases) com o custo estimado e o ensaio (dry run).
 *                               Campanha de custo zero (você traz os resultados) já nasce aprovada; a que custa dinheiro nasce em RASCUNHO e pede aprovação. Nunca executa nada.
 *  - `campaign_approve`:        rascunho -> aprovada (exige preço verificado e teto maior que zero quando a campanha é paga).
 *  - `campaign_cancel`:         cancela uma campanha que ainda não terminou.
 *  - `campaign_execute`:        executar as buscas pagas. Responde 423 enquanto o bloqueio global de gasto estiver ligado; a execução em si ainda não foi construída.
 *  - `campaign_results_import`: recebe resultados de busca JÁ OBTIDOS (CSV/JSON colado) e recalcula os concorrentes. É o caminho de custo zero.
 *  - `competitors_list`:        concorrentes por área, município, região, estado e Brasil (domínios de diretório ficam marcados).
 */
import { normalizeSiteInput } from './profile-analyze-core.ts';
import {
  aggregateCompetitors, deriveEngines, normalizePriceTable, parseSerpImport, planCampaign, serpHost, ALL_PHASES, AUTO_PROVIDER, MANUAL_PROVIDER, MAX_PERSIST_QUERIES, DEFAULT_NOISE_HOSTS,
  type CompetitorFilter, type GeoScopeIn, type Phase, type PlanNodeIn, type QueryMeta, type ResultKind, type ResultRow, type Scope,
} from './market-campaign-core.ts';
import { isObservationEngine, normalizeMarkets } from './nexus-intelligence.ts';
import { buildGeoIndex, classifyQuery, detectGeo, getPack, isUf, norm, SP_REGIOES, type SegmentPack, type Uf } from './taxonomy-core.ts';
import { UNBOUNDED, chunk, fail, isUuid, loadAll, loadNodes, loadScope, type Admin, type ProjectRow, type Reply, type TaxonomyCtx } from './taxonomy-shared.ts';

export const MARKET_ACTIONS = ['campaign_plan', 'campaign_approve', 'campaign_cancel', 'campaign_execute', 'campaign_results_import', 'competitors_list'];
export const MAX_RESULTS_READ = 50000;
export const MAX_COMPETITORS_STORED = 2000;
export const PAID_LOCK_MESSAGE = 'Serviços pagos bloqueados globalmente. O plano pode ser salvo; a execução das buscas fica pendente até o bloqueio ser liberado.';
const CAMPAIGN_COLUMNS = 'id,name,status,phase,budget_cap_cents,estimated_cost_cents,spent_cents,provider,price_verified,config,created_at';
const QUERY_COLUMNS = 'id,campaign_id,query,node_id,engine,country,language,uf,municipio,bairro,ibge_code,regiao,scope,status';
const INT4_MAX = 2_000_000_000;

interface CampaignRow { id: string; name: string; status: string; phase: number; budget_cap_cents: number; estimated_cost_cents: number; spent_cents: number; provider: string | null; price_verified: boolean; config: Record<string, unknown> }
interface QueryRow { id: string; campaign_id: string; query: string; node_id: string | null; engine?: string; country?: string; language?: string; uf: string | null; municipio: string | null; bairro?: string | null; ibge_code: number | null; regiao: string | null; scope: Scope; status: string }

export async function handleMarketAction(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow, _role: string): Promise<Reply> {
  if (ctx.action === 'competitors_list') return await competitorsList(admin, ctx, project);
  if (ctx.action === 'campaign_execute') {
    // O bloqueio vem ANTES de qualquer leitura: nada que dependa de provedor pago passa por aqui.
    if (ctx.paidBlocked !== false) return fail(423, 'global_paid_services_blocked', { message: PAID_LOCK_MESSAGE, executed: false, retryable: false });
    return fail(501, 'execution_not_built', { message: 'A execução das buscas ainda não foi construída. Use a importação de resultados.', executed: false });
  }
  if (ctx.action === 'campaign_plan') return await campaignPlan(admin, ctx, project);
  if (ctx.action === 'campaign_approve') return await campaignApprove(admin, ctx, project);
  if (ctx.action === 'campaign_cancel') return await campaignCancel(admin, ctx, project);
  if (ctx.action === 'campaign_results_import') return await resultsImport(admin, ctx, project);
  return fail(400, 'unknown_action');
}

async function loadCampaign(admin: Admin, project: ProjectRow, id: unknown): Promise<CampaignRow | Reply> {
  if (!isUuid(id)) return fail(422, 'campaign_id_required');
  const r = await admin.from('market_campaigns').select(CAMPAIGN_COLUMNS).eq('id', id).eq('project_id', project.id).maybeSingle();
  if (r.error) throw r.error;
  return r.data ? (r.data as CampaignRow) : fail(404, 'campaign_not_found');
}
const isReply = (v: unknown): v is Reply => !!v && typeof v === 'object' && 'status' in (v as object) && 'body' in (v as object);

const packOf = (v: unknown): SegmentPack | null | Reply => {
  if (v === undefined || v === null || v === '') return null;
  return getPack(v) ?? fail(422, 'segment_unknown');
};

// ------------------------------------------------------------------------------------------------------------------ planejar
async function campaignPlan(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const b = ctx.body;
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 120) return fail(422, 'name_invalid');
  // Fases e motores são DERIVADOS (todas as fases; motores dos conjuntos de prompts do projeto). Os campos abaixo só existem para quem quiser restringir.
  const phasesIn = b.phases === undefined ? ALL_PHASES : b.phases;
  if (!Array.isArray(phasesIn) || !phasesIn.length || !phasesIn.every((p) => ALL_PHASES.includes(p as Phase))) return fail(422, 'phases_invalid');
  const provider = b.provider === undefined ? MANUAL_PROVIDER : b.provider;
  if (provider !== MANUAL_PROVIDER && provider !== AUTO_PROVIDER) return fail(422, 'provider_invalid');
  const priceTable = normalizePriceTable(b.price_table);
  const budget = b.budget_cap_cents === undefined ? 0 : Number(b.budget_cap_cents);
  if (!Number.isInteger(budget) || budget < 0 || budget > INT4_MAX) return fail(422, 'budget_invalid');
  const pages = b.pages_per_query === undefined ? 1 : Number(b.pages_per_query);
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) return fail(422, 'pages_invalid');
  const pack = packOf(b.segment);
  if (isReply(pack)) return pack;
  const central = b.central_slugs === undefined ? undefined : Array.isArray(b.central_slugs) && b.central_slugs.every((s) => typeof s === 'string') ? (b.central_slugs as string[]) : null;
  if (central === null) return fail(422, 'central_invalid');
  if (b.engines !== undefined && !(Array.isArray(b.engines) && b.engines.every(isObservationEngine))) return fail(422, 'engines_invalid');

  // lê o que já existe: nós aprovados (inclui a cauda do agente), escopo aprovado, municípios do IBGE e os conjuntos de prompts do módulo NEXUS (motores e mercados)
  const approved = (await loadNodes(admin, project.id)).filter((n) => n.status === 'aprovado');
  const slugOfId = new Map(approved.map((n) => [n.id, n.slug]));
  const planNodes: PlanNodeIn[] = approved.map((n) => {
    const ev = (n.evidence || {}) as { total?: number; central?: boolean; motores?: string[]; pais?: string | null; lingua?: string | null };
    return {
      id: n.id, slug: n.slug, kind: n.kind, label: n.label, parentSlug: n.parent_id ? slugOfId.get(n.parent_id) ?? null : null, evidenceTotal: Number(ev.total ?? 0), central: ev.central === true,
      ...(n.kind === 'cauda' ? { engines: Array.isArray(ev.motores) ? ev.motores : undefined, country: ev.pais || undefined, language: ev.lingua || undefined } : {}),
    };
  });
  const scope: GeoScopeIn[] = (await loadScope(admin, project.id)).filter((s) => s.status === 'aprovado');
  const ibge = (await loadAll<{ ibge_code: number; nome: string; uf: Uf; populacao: number | null }>(admin, 'ibge_municipios', 'ibge_code,nome,uf,populacao', null, UNBOUNDED)).rows;
  const sets = await admin.from('nexus_prompt_sets').select('engines,markets,status').eq('project_id', project.id).eq('status', 'active');
  if (sets.error) throw sets.error;
  const activeSets = (sets.data || []) as Array<{ engines?: unknown; markets?: unknown }>;
  const engines = b.engines !== undefined ? [...new Set(b.engines as string[])] : deriveEngines(activeSets);
  // mercados dos conjuntos de prompts viram lugares do plano (mesmo formato: country, language, city), sem digitar de novo
  const fromSets: GeoScopeIn[] = [];
  for (const st of activeSets) {
    const m = normalizeMarkets(st.markets ?? []);
    if ('value' in m) for (const mk of m.value) if (mk.country !== 'br' || mk.city) fromSets.push({ uf: null, ibge_code: null, municipio: mk.city ?? null, regiao: null, role: 'alvo', country: mk.country, language: mk.language });
  }

  const plan = planCampaign({
    nodes: planNodes, pack, municipios: ibge, scope: [...scope, ...fromSets], engines, phases: phasesIn as Phase[], centralSlugs: central,
    phase4Municipios: b.phase4_municipios === undefined ? undefined : Number(b.phase4_municipios), provider, priceTable, pagesPerQuery: pages, budgetCapCents: budget,
  });
  const persistList = plan.cost.paid && !plan.cost.verified ? plan.queries : plan.in_budget ?? plan.queries;
  const toStore = persistList.slice(0, MAX_PERSIST_QUERIES);
  const truncated = persistList.length > toStore.length;
  const now = new Date(ctx.deps.now()).toISOString();
  const free = !plan.cost.paid;
  const campaign = {
    id: crypto.randomUUID(), organization_id: project.organization_id, project_id: project.id, name,
    // só o que custa dinheiro pede aprovação: a campanha de custo zero já nasce aprovada
    status: free ? 'aprovada' : 'rascunho', phase: Math.max(...(phasesIn as number[])),
    budget_cap_cents: budget, estimated_cost_cents: Math.min(INT4_MAX, plan.estimated_cost_cents ?? 0), spent_cents: 0, provider, price_verified: free || plan.cost.verified,
    config: {
      segment: pack?.id ?? null, phases: phasesIn, engines: plan.engines, markets: plan.markets, pages_per_query: pages, central: plan.central, total_queries: plan.total_queries, persisted_queries: toStore.length, truncated,
      cost_known: plan.cap.cost_known, price: { ...priceTable[Object.keys(plan.cost.by_provider)[0] ?? MANUAL_PROVIDER], currency: plan.cost.currency }, by_provider: plan.cost.by_provider, needs_agent: plan.needs_agent, warnings: plan.warnings,
    },
    created_by: ctx.userId, created_at: now, updated_at: now,
  };
  const ins = await admin.from('market_campaigns').insert(campaign);
  if (ins.error) throw ins.error;
  for (const part of chunk(toStore, 500)) {
    const r = await admin.from('market_queries').insert(part.map((q) => ({
      organization_id: project.organization_id, project_id: project.id, campaign_id: campaign.id, query: q.query, node_id: q.node_id, engine: q.engine, country: q.country, language: q.language,
      uf: q.uf, municipio: q.municipio, bairro: q.bairro, ibge_code: q.ibge_code, regiao: q.regiao, scope: q.scope, phase: q.phase, status: 'planejada',
    })));
    if (r.error) throw r.error;
  }
  return {
    status: 200,
    body: {
      executed: false, campaign: { id: campaign.id, name, status: campaign.status, phase: campaign.phase, budget_cap_cents: budget, estimated_cost_cents: plan.estimated_cost_cents, provider, price_verified: campaign.price_verified },
      dry_run: {
        per_phase: plan.per_phase, total_queries: plan.total_queries, cost: plan.cost, cap: plan.cap, persisted: toStore.length, truncated, warnings: plan.warnings, central: plan.central,
        engines: plan.engines, markets: plan.markets, needs_agent: plan.needs_agent, in_budget_queries: plan.in_budget ? plan.in_budget.length : null, sample: plan.queries.slice(0, 20).map((q) => q.query),
      },
    },
  };
}

async function campaignApprove(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const c = await loadCampaign(admin, project, ctx.body.campaignId);
  if (isReply(c)) return c;
  if (c.status !== 'rascunho') return fail(422, 'campaign_not_draft');
  const paid = c.provider !== MANUAL_PROVIDER; // campanha de custo zero já nasce aprovada; esta etapa é só do que custa dinheiro
  if (paid && !c.price_verified) return fail(422, 'price_not_verified');
  if (paid && c.budget_cap_cents <= 0) return fail(422, 'budget_cap_required');
  if (paid && c.estimated_cost_cents > c.budget_cap_cents) return fail(422, 'cost_over_cap', { estimated_cost_cents: c.estimated_cost_cents, budget_cap_cents: c.budget_cap_cents });
  const n = await admin.from('market_queries').select('id').eq('campaign_id', c.id).eq('project_id', project.id).limit(1);
  if (n.error) throw n.error;
  if (!n.data || !n.data.length) return fail(422, 'campaign_empty');
  const u = await admin.from('market_campaigns').update({ status: 'aprovada', updated_at: new Date(ctx.deps.now()).toISOString() }).eq('id', c.id).eq('project_id', project.id);
  if (u.error) throw u.error;
  return { status: 200, body: { approved: true, executed: false, campaign_id: c.id } };
}

async function campaignCancel(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const c = await loadCampaign(admin, project, ctx.body.campaignId);
  if (isReply(c)) return c;
  if (c.status === 'cancelada' || c.status === 'concluida') return fail(422, 'campaign_closed');
  const u = await admin.from('market_campaigns').update({ status: 'cancelada', updated_at: new Date(ctx.deps.now()).toISOString() }).eq('id', c.id).eq('project_id', project.id);
  if (u.error) throw u.error;
  return { status: 200, body: { cancelled: true, campaign_id: c.id } };
}

// ------------------------------------------------------------------------------------------------------------------ resultados
const ownHostOf = (p: ProjectRow): string | null => (normalizeSiteInput(p.domain) || normalizeSiteInput(p.wordpress_url))?.host ?? null;

async function queryMetas(admin: Admin, project: ProjectRow): Promise<Map<string, QueryMeta>> {
  const nodes = await loadNodes(admin, project.id);
  const slugOf = new Map(nodes.map((n) => [n.id, n.slug]));
  const qs = (await loadAll<QueryRow>(admin, 'market_queries', QUERY_COLUMNS, { col: 'project_id', val: project.id }, UNBOUNDED)).rows;
  return new Map(qs.map((q) => [q.id, { id: q.id, query: q.query, node_slug: q.node_id ? slugOf.get(q.node_id) ?? null : null, scope: q.scope, uf: q.uf, municipio: q.municipio, ibge_code: q.ibge_code, regiao: q.regiao, bairro: q.bairro ?? null, country: q.country ?? 'br', engine: q.engine ?? 'google_serp' }]));
}

/** Recalcula o resumo de concorrentes do projeto (todas as campanhas). Recalculável a qualquer hora; preserva a data da primeira aparição. */
async function rebuildCompetitors(admin: Admin, project: ProjectRow, pack: SegmentPack | null, nowIso: string): Promise<{ competitors: number; own_appearances: number; truncated: boolean }> {
  const meta = await queryMetas(admin, project);
  const res = await loadAll<ResultRow>(admin, 'market_serp_results', 'query_id,position,url,host,kind', { col: 'project_id', val: project.id }, MAX_RESULTS_READ);
  const agg = aggregateCompetitors(res.rows, meta, { ownHost: ownHostOf(project), extraNoise: pack?.noiseHosts });
  const old = await admin.from('market_competitors').select('host,first_seen').eq('project_id', project.id).limit(5000);
  if (old.error) throw old.error;
  const first = new Map<string, string>((old.data || []).map((r: { host: string; first_seen: string }) => [r.host, r.first_seen]));
  const del = await admin.from('market_competitors').delete().eq('project_id', project.id);
  if (del.error) throw del.error;
  const rows = agg.competitors.slice(0, MAX_COMPETITORS_STORED).map((c) => ({
    organization_id: project.organization_id, project_id: project.id, host: c.host, kind: c.kind, areas: c.areas, locations: c.locations, appearances: c.appearances,
    avg_position: c.avg_position, score: c.score, first_seen: first.get(c.host) ?? nowIso, last_seen: nowIso,
  }));
  for (const part of chunk(rows, 200)) { const r = await admin.from('market_competitors').insert(part); if (r.error) throw r.error; }
  return { competitors: rows.length, own_appearances: agg.own_appearances, truncated: res.truncated };
}

const slugOfLabel = (s: string) => norm(s).replace(/ /g, '-');

async function resultsImport(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const c = await loadCampaign(admin, project, ctx.body.campaignId);
  if (isReply(c)) return c;
  if (c.status === 'cancelada') return fail(422, 'campaign_cancelled');
  const parsed = parseSerpImport(ctx.body.text);
  if ('error' in parsed) return fail(422, parsed.error);
  const pack = packOf(ctx.body.segment ?? (c.config as { segment?: string })?.segment);
  if (isReply(pack)) return pack;
  const createMissing = ctx.body.create_missing !== false;
  const nowIso = new Date(ctx.deps.now()).toISOString();

  const existing = (await loadAll<QueryRow>(admin, 'market_queries', QUERY_COLUMNS, { col: 'campaign_id', val: c.id }, UNBOUNDED)).rows;
  const DEFAULT_ENGINE = 'google_serp';
  const engineOf = (q: { engine?: string | null }) => q.engine || DEFAULT_ENGINE;
  const byKey = new Map<string, QueryRow>(existing.map((q) => [`${engineOf(q)}|${norm(q.query)}`, q]));
  const byText = new Map<string, QueryRow[]>();
  for (const q of existing) byText.set(norm(q.query), [...(byText.get(norm(q.query)) ?? []), q]);
  /** a linha diz o motor? usa; senão, a consulta do Google (ou a primeira) com esse texto */
  const resolve = (r: { query: string; engine?: string | null }): QueryRow | undefined => {
    if (r.engine) return byKey.get(`${r.engine}|${norm(r.query)}`);
    const list = byText.get(norm(r.query)) ?? [];
    return list.find((q) => engineOf(q) === DEFAULT_ENGINE) ?? list[0];
  };
  const wanted = new Map<string, { text: string; engine: string }>(); // consultas novas pedidas pelo arquivo
  for (const r of parsed.rows) if (!resolve(r)) { const engine = r.engine || DEFAULT_ENGINE; const k = `${engine}|${norm(r.query)}`; if (!wanted.has(k)) wanted.set(k, { text: r.query, engine }); }
  let created = 0;
  if (wanted.size && createMissing) {
    const nodes = (await loadNodes(admin, project.id)).filter((n) => n.status !== 'rejeitado');
    const nodeBySlug = new Map(nodes.map((n) => [n.slug, n]));
    const ibge = (await loadAll<{ ibge_code: number; nome: string; uf: Uf }>(admin, 'ibge_municipios', 'ibge_code,nome,uf', null, UNBOUNDED)).rows;
    const idx = ibge.length ? buildGeoIndex(ibge) : null;
    const fresh: Array<Record<string, unknown>> = [];
    for (const [k, w] of wanted) {
      const text = w.text.slice(0, 300);
      const cls = pack ? classifyQuery(text, pack) : { matriz: null, subarea: null };
      const subSlug = cls.matriz && cls.subarea ? `${slugOfLabel(cls.matriz)}/${slugOfLabel(cls.subarea)}` : null;
      const node = (subSlug && nodeBySlug.get(subSlug)) || (cls.matriz ? nodeBySlug.get(slugOfLabel(cls.matriz)) : null) || null;
      const g = idx ? detectGeo({ query: text }, idx) : null;
      const m = g?.municipios[0]; const uf = g?.ufs[0] ?? null;
      const regiao = g?.regioes_sp[0] ? SP_REGIOES.find((r) => r.slug === g.regioes_sp[0])!.label : null;
      const scope: Scope = m ? 'municipio' : regiao ? 'regiao' : uf ? 'estado' : 'brasil';
      const row = {
        id: crypto.randomUUID(), organization_id: project.organization_id, project_id: project.id, campaign_id: c.id, query: text, node_id: node?.id ?? null, engine: w.engine, country: 'br', language: 'pt-BR',
        uf: m?.uf ?? (isUf(uf) ? uf : null), municipio: m?.nome ?? null, bairro: null, ibge_code: m?.ibge_code ?? null, regiao, scope, phase: 1, status: 'executada', executed_at: nowIso,
      };
      fresh.push(row);
      byKey.set(k, row as unknown as QueryRow);
      byText.set(norm(text), [...(byText.get(norm(text)) ?? []), row as unknown as QueryRow]);
    }
    for (const part of chunk(fresh, 500)) { const r = await admin.from('market_queries').insert(part); if (r.error) throw r.error; }
    created = fresh.length;
  }

  const matched = parsed.rows.map((r) => ({ r, q: resolve(r) })).filter((x): x is { r: typeof x.r; q: QueryRow } => !!x.q);
  const ignored = parsed.rows.length - matched.length;
  const ids = [...new Set(matched.map((x) => x.q.id))];
  // reimportar uma consulta SUBSTITUI os resultados dela (idempotente)
  for (const part of chunk(ids, 100)) { const d = await admin.from('market_serp_results').delete().in('query_id', part).eq('project_id', project.id); if (d.error) throw d.error; }
  const insertRows = matched.map(({ r, q }) => ({
    organization_id: project.organization_id, project_id: project.id, query_id: q.id, position: r.position, url: r.url.slice(0, 1000),
    host: String(serpHost(r.url)).slice(0, 200), title: r.title, kind: r.kind as ResultKind, fetched_at: nowIso,
  })).filter((r) => r.host.length >= 3);
  for (const part of chunk(insertRows, 500)) { const r = await admin.from('market_serp_results').insert(part); if (r.error) throw r.error; }
  for (const part of chunk(ids, 100)) { const u = await admin.from('market_queries').update({ status: 'executada', executed_at: nowIso }).in('id', part).eq('project_id', project.id); if (u.error) throw u.error; }

  // campanha aprovada/executando cujas consultas foram todas respondidas termina sozinha
  if (c.status === 'aprovada' || c.status === 'executando') {
    const left = await admin.from('market_queries').select('id').eq('campaign_id', c.id).eq('project_id', project.id).eq('status', 'planejada').limit(1);
    if (left.error) throw left.error;
    if (!left.data || !left.data.length) { const u = await admin.from('market_campaigns').update({ status: 'concluida', updated_at: nowIso }).eq('id', c.id).eq('project_id', project.id); if (u.error) throw u.error; }
  }
  const roll = await rebuildCompetitors(admin, project, pack, nowIso);
  return {
    status: 200,
    body: {
      executed: false, results_added: insertRows.length, queries_with_results: ids.length, queries_created: created, ignored_rows: ignored, unknown_queries: createMissing ? 0 : wanted.size,
      invalid: parsed.invalid, duplicates: parsed.duplicates, truncated: parsed.truncated, competitors: roll.competitors, own_appearances: roll.own_appearances, results_truncated: roll.truncated,
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------ concorrentes
function parseFilter(b: Record<string, unknown>): CompetitorFilter | Reply {
  const raw = (b.filter && typeof b.filter === 'object' ? b.filter : {}) as Record<string, unknown>;
  const f: CompetitorFilter = {};
  if (raw.area !== undefined && raw.area !== '') { if (typeof raw.area !== 'string' || raw.area.length > 200) return fail(422, 'filter_invalid'); f.area = raw.area; }
  if (raw.uf !== undefined && raw.uf !== '') { if (!isUf(raw.uf)) return fail(422, 'filter_invalid'); f.uf = raw.uf; }
  if (raw.municipio !== undefined && raw.municipio !== '') { if (typeof raw.municipio !== 'string' || raw.municipio.length > 120) return fail(422, 'filter_invalid'); f.municipio = raw.municipio; }
  if (raw.regiao !== undefined && raw.regiao !== '') { if (typeof raw.regiao !== 'string' || raw.regiao.length > 80) return fail(422, 'filter_invalid'); f.regiao = raw.regiao; }
  if (raw.scope !== undefined && raw.scope !== '') { if (!['brasil', 'pais', 'estado', 'regiao', 'municipio', 'bairro'].includes(raw.scope as string)) return fail(422, 'filter_invalid'); f.scope = raw.scope as Scope; }
  if (raw.bairro !== undefined && raw.bairro !== '') { if (typeof raw.bairro !== 'string' || raw.bairro.length > 120) return fail(422, 'filter_invalid'); f.bairro = raw.bairro; }
  if (raw.country !== undefined && raw.country !== '') { if (typeof raw.country !== 'string' || !/^[a-z]{2}$/.test(raw.country)) return fail(422, 'filter_invalid'); f.country = raw.country; }
  if (raw.engine !== undefined && raw.engine !== '') { if (!isObservationEngine(raw.engine)) return fail(422, 'filter_invalid'); f.engine = raw.engine; }
  return f;
}

async function competitorsList(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const filter = parseFilter(ctx.body);
  if (isReply(filter)) return filter;
  const kind = ctx.body.kind === undefined ? 'todos' : ctx.body.kind;
  if (!['todos', 'concorrente', 'diretorio'].includes(kind as string)) return fail(422, 'kind_invalid');
  const limit = Math.min(500, Math.max(1, Math.round(Number(ctx.body.limit) || 100)));
  const pack = packOf(ctx.body.segment);
  if (isReply(pack)) return pack;
  if (!Object.keys(filter).length) {
    let q = admin.from('market_competitors').select('host,kind,areas,locations,appearances,avg_position,score,first_seen,last_seen').eq('project_id', project.id);
    if (kind !== 'todos') q = q.eq('kind', kind);
    const r = await q.order('score', { ascending: false }).limit(limit);
    if (r.error) throw r.error;
    return { status: 200, body: { competitors: r.data || [], filtered: false, truncated: false, noise_hosts: DEFAULT_NOISE_HOSTS.length } };
  }
  const meta = await queryMetas(admin, project);
  const res = await loadAll<ResultRow>(admin, 'market_serp_results', 'query_id,position,url,host,kind', { col: 'project_id', val: project.id }, MAX_RESULTS_READ);
  const agg = aggregateCompetitors(res.rows, meta, { ownHost: ownHostOf(project), extraNoise: pack?.noiseHosts, filter });
  const list = agg.competitors.filter((c) => kind === 'todos' || c.kind === kind);
  return { status: 200, body: { competitors: list.slice(0, limit), total: list.length, filtered: true, own_appearances: agg.own_appearances, results_used: agg.results_used, truncated: res.truncated } };
}
