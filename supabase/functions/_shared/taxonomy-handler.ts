/**
 * Ações do Motor de Taxonomia na função de borda `taxonomy`.
 *
 *  - `overview`:      nós, arestas, escopo geográfico, campanhas, concorrentes principais, pacotes de segmento, tabela de preços (padrão) e estado do cache do IBGE.
 *  - `suggest`:       classifica as seções do mapa do domínio, as páginas e as consultas do Search Console do projeto e grava nós/arestas/lugares "sugerido".
 *  - `pack_load`:     grava o pacote de segmento inteiro como sugestão (projetos sem site ou sem Search Console).
 *  - `review`:        aprovar/rejeitar/editar um nó, ou criar um nó manual.
 *  - `geo_overview`:  municípios do IBGE por estado (para a tela de cobertura).
 *  - `geo_sync`:      traz municípios e população da API pública do IBGE (sem chave) para o cache `ibge_municipios`.
 *  - `geo_districts`: sugere os distritos (bairros) do IBGE dos municípios aprovados no escopo (API pública, sem chave).
 *  - `scope_save`:    adiciona, remove ou decide lugares do escopo geográfico (bairro, município, região, estado e país/mercado).
 *  - `tail_import`:   recebe a lista de buscas específicas (cauda) que um AGENTE de IA gerou: nós `cauda` com source 'agente', sempre revisáveis.
 *  - `tail_generate`: pede a cauda ao agente de IA. Serviço pago: responde 423 enquanto o bloqueio global de gasto estiver ligado.
 *  - ações de campanha e de concorrentes: ver market-handler.ts.
 *
 * Leitura: qualquer membro da organização. Escrita: dono, administrador e editor. Papel e organização vêm do banco, nunca do cliente.
 * Sem teto de quantidade de nós, galhos ou lugares. Conformidade em modo aviso: o que dá para fazer é feito e o aviso vem junto; só o dinheiro (preço, teto,
 * bloqueio global) segura uma ação.
 * Nada aqui executa busca paga: `campaign_execute` responde 423 enquanto o bloqueio global de gasto estiver ligado.
 */
import { WRITE_ROLES } from './profile-service.ts';
import { normalizeSiteInput } from './profile-analyze-core.ts';
import { PAID_LOCK_MESSAGE, MARKET_ACTIONS, handleMarketAction } from './market-handler.ts';
import { PAID_SERVICES_BLOCKED } from './nexus-spend-lock.ts';
import {
  buildGeoIndex, classifyItems, classifyQuery, detectGeo, getPack, packToSuggestions, parseIbgeMunicipios, parseIbgePopulacao, parseTailImport, comPopulacao, slugify, suggestNodes, tailSlug,
  GRANDES_REGIOES, SEGMENT_PACKS, SP_REGIOES, isUf, norm, type EdgeSuggestion, type NodeKind, type NodeStatus, type NodeSuggestion, type SegmentPack,
} from './taxonomy-core.ts';
import { DEFAULT_PRICE_TABLE, PHASE_LABEL, MAX_PERSIST_QUERIES } from './market-campaign-core.ts';
import { chunk, fail, isUuid, loadAll, loadNodes, loadScope, type Admin, type NodeRow, type ProjectRow, type Reply, type ScopeRow } from './taxonomy-shared.ts';
import type { TaxonomyCtx } from './taxonomy-shared.ts';
export type { TaxonomyCtx } from './taxonomy-shared.ts';

export const TAXONOMY_ACTIONS = ['overview', 'suggest', 'pack_load', 'review', 'tail_import', 'tail_generate', 'geo_overview', 'geo_sync', 'geo_districts', 'scope_save', ...MARKET_ACTIONS];
/** Quantas sugestões de lugar uma única leitura grava (o resto continua na próxima). Limite do pedido, não do projeto. */
export const MAX_GEO_SUGGESTIONS_PER_RUN = 2000;
export const MAX_DISTRICT_CITIES_PER_CALL = 25;
export const GEO_SYNC_MIN_INTERVAL_MS = 10 * 60_000;
export const IBGE_MUNICIPIOS_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
export const IBGE_POPULACAO_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[all]';
const EDGE_COLUMNS = 'id,from_id,to_id,relation,weight,source,note';
const ROLES = ['sede', 'atende', 'plantao', 'alvo'];
const DECISIONS: NodeStatus[] = ['sugerido', 'aprovado', 'rejeitado'];

export async function handleTaxonomyAction(admin: Admin, ctx: TaxonomyCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !isUuid(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select('id,name,domain,wordpress_url,organization_id').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (ctx.action === 'overview') return await overview(admin, project, role);
    if (ctx.action === 'geo_overview') return await geoOverview(admin, project);
    if (ctx.action === 'competitors_list') return await handleMarketAction(admin, ctx, project, role);
    if (!TAXONOMY_ACTIONS.includes(ctx.action)) return fail(400, 'unknown_action');
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'suggest') return await suggest(admin, ctx, project);
    if (ctx.action === 'pack_load') return await packLoad(admin, ctx, project);
    if (ctx.action === 'review') return await review(admin, ctx, project);
    if (ctx.action === 'tail_import') return await tailImport(admin, ctx, project);
    if (ctx.action === 'tail_generate') return tailGenerate(ctx);
    if (ctx.action === 'geo_sync') return await geoSync(admin, ctx);
    if (ctx.action === 'geo_districts') return await geoDistricts(admin, ctx, project);
    if (ctx.action === 'scope_save') return await scopeSave(admin, ctx, project);
    return await handleMarketAction(admin, { ...ctx, paidBlocked: ctx.paidBlocked ?? PAID_SERVICES_BLOCKED }, project, role);
  } catch (_e) {
    console.error('[taxonomy] operation_failed');
    return fail(500, 'taxonomy_operation_failed');
  }
}

const ownHostOf = (p: { domain?: unknown; wordpress_url?: unknown }): string | null => (normalizeSiteInput(p.domain) || normalizeSiteInput(p.wordpress_url))?.host ?? null;

// ------------------------------------------------------------------------------------------------------------------ leitura
async function overview(admin: Admin, project: ProjectRow, role: string): Promise<Reply> {
  const nodes = await loadNodes(admin, project.id);
  const edges = (await loadAll(admin, 'project_taxonomy_edges', EDGE_COLUMNS, { col: 'project_id', val: project.id }, 5000)).rows;
  const scope = await loadScope(admin, project.id);
  const camp = await admin.from('market_campaigns').select('id,name,status,phase,budget_cap_cents,estimated_cost_cents,spent_cents,provider,price_verified,config,created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(50);
  if (camp.error) throw camp.error;
  const qs = (await loadAll<{ campaign_id: string; status: string }>(admin, 'market_queries', 'campaign_id,status', { col: 'project_id', val: project.id }, 30000)).rows;
  const counts = new Map<string, { total: number; executada: number; planejada: number; erro: number }>();
  for (const q of qs) { const c = counts.get(q.campaign_id) ?? { total: 0, executada: 0, planejada: 0, erro: 0 }; c.total++; (c as Record<string, number>)[q.status] = ((c as Record<string, number>)[q.status] ?? 0) + 1; counts.set(q.campaign_id, c); }
  const top = await admin.from('market_competitors').select('host,kind,appearances,avg_position,score,areas,last_seen').eq('project_id', project.id).order('score', { ascending: false }).limit(10);
  if (top.error) throw top.error;
  const latest = await admin.from('ibge_municipios').select('ibge_code,fetched_at').order('fetched_at', { ascending: false }).limit(1);
  if (latest.error) throw latest.error;
  const withPop = await admin.from('ibge_municipios').select('populacao').order('populacao', { ascending: false, nullsFirst: false }).limit(1);
  if (withPop.error) throw withPop.error;
  return {
    status: 200,
    body: {
      project: { id: project.id, name: project.name, domain: ownHostOf(project) }, can_edit: WRITE_ROLES.includes(role), paid_blocked: PAID_SERVICES_BLOCKED,
      segments: SEGMENT_PACKS.map((p) => ({ id: p.id, label: p.label, status: p.status, description: p.description, matrizes: p.matrizes.length, subareas: p.rules.length })),
      nodes, edges, geo_scope: scope,
      campaigns: (camp.data || []).map((c: Record<string, unknown>) => ({ ...c, queries: counts.get(String(c.id)) ?? { total: 0, executada: 0, planejada: 0, erro: 0 } })),
      competitors_top: top.data || [], price_table: DEFAULT_PRICE_TABLE, phases: PHASE_LABEL,
      ibge: { loaded: !!(latest.data && latest.data.length), fetched_at: latest.data?.[0]?.fetched_at ?? null, with_population: !!(withPop.data && withPop.data[0] && withPop.data[0].populacao !== null && withPop.data[0].populacao !== undefined) },
      limits: { max_persist_queries: MAX_PERSIST_QUERIES },
    },
  };
}

async function geoOverview(admin: Admin, project: ProjectRow): Promise<Reply> {
  const { rows } = await loadAll<{ uf: string; populacao: number | null }>(admin, 'ibge_municipios', 'uf,populacao', null, 8000);
  const byUf: Record<string, { municipios: number; populacao: number | null }> = {};
  for (const r of rows) { const e = byUf[r.uf] ?? { municipios: 0, populacao: null }; e.municipios++; if (r.populacao !== null && r.populacao !== undefined) e.populacao = (e.populacao ?? 0) + r.populacao; byUf[r.uf] = e; }
  const scope = await loadScope(admin, project.id);
  return { status: 200, body: { loaded: rows.length > 0, total: rows.length, by_uf: byUf, grandes_regioes: GRANDES_REGIOES, scope } };
}

// ------------------------------------------------------------------------------------------------------------------ gravar sugestões
interface PersistResult { nodes_new: number; nodes_updated: number; skipped_rejected: number; edges_new: number; edges_updated: number }

async function persistSuggestions(admin: Admin, project: ProjectRow, userId: string, nodes: NodeSuggestion[], edges: EdgeSuggestion[], updateExisting: boolean): Promise<PersistResult | Reply> {
  const existing = await loadNodes(admin, project.id);
  const bySlug = new Map(existing.map((n) => [n.slug, n]));
  const idOf = new Map(existing.map((n) => [n.slug, n.id]));
  const statusOf = new Map(existing.map((n) => [n.slug, n.status]));
  const now = new Date().toISOString();
  const res: PersistResult = { nodes_new: 0, nodes_updated: 0, skipped_rejected: 0, edges_new: 0, edges_updated: 0 };
  const insert: Array<Record<string, unknown>> = [];
  for (const n of nodes) {
    const ex = bySlug.get(n.slug);
    if (ex) {
      if (ex.status === 'rejeitado') { res.skipped_rejected++; continue; }
      if (updateExisting && ex.source !== 'manual' && JSON.stringify(ex.evidence) !== JSON.stringify(n.evidence)) {
        const patch: Record<string, unknown> = { evidence: n.evidence, updated_at: now };
        if (ex.status === 'sugerido') patch.keywords = n.keywords;
        if (ex.source === 'pacote' && n.source !== 'pacote') patch.source = n.source;
        const u = await admin.from('project_taxonomy_nodes').update(patch).eq('id', ex.id).eq('project_id', project.id);
        if (u.error) throw u.error;
        res.nodes_updated++;
      }
      continue;
    }
    let parentId: string | null = null;
    if (n.parentSlug) {
      parentId = idOf.get(n.parentSlug) ?? null;
      if (!parentId || statusOf.get(n.parentSlug) === 'rejeitado') { res.skipped_rejected++; continue; }
    }
    const id = crypto.randomUUID();
    idOf.set(n.slug, id); statusOf.set(n.slug, 'sugerido');
    insert.push({ id, organization_id: project.organization_id, project_id: project.id, kind: n.kind, parent_id: parentId, slug: n.slug, label: n.label, keywords: n.keywords, source: n.source, status: 'sugerido', evidence: n.evidence, created_by: userId });
  }
  for (const part of chunk(insert, 200)) { const r = await admin.from('project_taxonomy_nodes').insert(part); if (r.error) throw r.error; }
  res.nodes_new = insert.length;

  const have = await loadAll<{ id: string; from_id: string; to_id: string; source: string; weight: number }>(admin, 'project_taxonomy_edges', 'id,from_id,to_id,source,weight', { col: 'project_id', val: project.id }, 10000);
  const edgeByKey = new Map(have.rows.map((e) => [`${e.from_id}>${e.to_id}`, e]));
  const newEdges: Array<Record<string, unknown>> = [];
  for (const e of edges) {
    const from = idOf.get(e.fromSlug); const to = idOf.get(e.toSlug);
    if (!from || !to || from === to || statusOf.get(e.fromSlug) === 'rejeitado' || statusOf.get(e.toSlug) === 'rejeitado') continue;
    const cur = edgeByKey.get(`${from}>${to}`) ?? edgeByKey.get(`${to}>${from}`);
    if (cur) {
      if (updateExisting && cur.source !== 'manual' && Number(cur.weight) !== e.weight) {
        const u = await admin.from('project_taxonomy_edges').update({ weight: e.weight, note: e.note }).eq('id', cur.id).eq('project_id', project.id);
        if (u.error) throw u.error;
        res.edges_updated++;
      }
      continue;
    }
    edgeByKey.set(`${from}>${to}`, { id: '', from_id: from, to_id: to, source: e.source, weight: e.weight });
    newEdges.push({ organization_id: project.organization_id, project_id: project.id, from_id: from, to_id: to, relation: 'correlato', weight: e.weight, source: e.source, note: e.note });
  }
  for (const part of chunk(newEdges, 200)) { const r = await admin.from('project_taxonomy_edges').insert(part); if (r.error) throw r.error; }
  res.edges_new = newEdges.length;
  return res;
}
const isReply = (v: unknown): v is Reply => !!v && typeof v === 'object' && 'status' in (v as object) && 'body' in (v as object);

function packFrom(body: Record<string, unknown>): SegmentPack | Reply {
  if (typeof body.segment !== 'string' || !body.segment) return fail(422, 'segment_required');
  const pack = getPack(body.segment);
  return pack ?? fail(422, 'segment_unknown');
}
/** Modo aviso: pacote em rascunho funciona, só que a resposta avisa que ele não foi validado. */
const draftWarnings = (pack: SegmentPack): string[] => (pack.status === 'validado' ? [] : [`O pacote "${pack.label}" é um rascunho de exemplo e não foi validado: revise o que ele sugerir antes de aprovar.`]);

async function packLoad(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const pack = packFrom(ctx.body);
  if (isReply(pack)) return pack;
  const { nodes, edges } = packToSuggestions(pack);
  const r = await persistSuggestions(admin, project, ctx.userId, nodes, edges, false);
  if (isReply(r)) return r;
  return { status: 200, body: { segment: pack.id, ...r, warnings: draftWarnings(pack) } };
}

// ------------------------------------------------------------------------------------------------------------------ sugerir a partir do site e do Search Console
interface GeoAgg { key: string; role: 'atende' | 'alvo'; source: 'site' | 'search_console'; uf: string | null; ibge_code: number | null; municipio: string | null; regiao: string | null; count: number; weight: number; examples: string[] }
interface PlaceKey { role: string; country?: string | null; language?: string | null; uf: string | null; ibge_code: number | null; municipio: string | null; bairro?: string | null; regiao: string | null }
/** Mesma chave do índice único do banco (project_geo_scope_unique). */
const scopeKey = (r: PlaceKey) => `${r.role}|${r.country ?? 'br'}|${r.language ?? 'pt-BR'}|${r.uf ?? ''}|${r.ibge_code ?? 0}|${r.municipio ?? ''}|${r.bairro ?? ''}|${r.regiao ?? ''}`;

async function suggest(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const pack = packFrom(ctx.body);
  if (isReply(pack)) return pack;
  const days = Math.min(180, Math.max(7, Math.round(Number(ctx.body.days) || 90)));
  const limit = Math.min(1000, Math.max(10, Math.round(Number(ctx.body.limit) || 400)));
  const warnings: string[] = draftWarnings(pack);

  const maps = await admin.from('project_site_maps').select('host,fetched_at,summary').eq('project_id', project.id).order('fetched_at', { ascending: false }).limit(40);
  if (maps.error) throw maps.error;
  const rpc = await admin.rpc('taxonomy_search_sample', { p_project: project.id, p_days: days, p_limit: limit });
  if (rpc.error) throw rpc.error;
  const sample = (rpc.data || {}) as { queries?: Array<{ query: string; clicks: number; impressions: number }>; pages?: Array<{ page: string; clicks: number; impressions: number }> };

  type In = Parameters<typeof classifyItems>[0][number];
  const inputs: In[] = [];
  const seenHost = new Set<string>();
  for (const m of (maps.data || []) as Array<{ host: string; summary: { sitemap?: { sections?: Array<{ section: string; count: number }> } } }>) {
    if (seenHost.has(m.host)) continue; seenHost.add(m.host);
    for (const s of m.summary?.sitemap?.sections || []) if (s.section && s.section !== '(raiz)') inputs.push({ source: 'site', kind: 'secao', key: `${m.host}/${s.section}`, url: `https://${m.host}/${s.section}/`, weight: Number(s.count) || 1 });
  }
  const nSections = inputs.length;
  for (const p of sample.pages || []) if (p.page) inputs.push({ source: 'search_console', kind: 'pagina', key: p.page, url: p.page, weight: Number(p.impressions) || 1, clicks: Number(p.clicks) || 0 });
  for (const q of sample.queries || []) if (q.query) inputs.push({ source: 'search_console', kind: 'consulta', key: q.query, query: q.query, weight: Number(q.impressions) || 1, clicks: Number(q.clicks) || 0 });
  if (!inputs.length) warnings.push('Não há mapa do domínio nem dados do Search Console para este projeto: use "Carregar o pacote do segmento" ou crie áreas manualmente.');

  const classified = classifyItems(inputs, pack);
  const sug = suggestNodes(classified, pack);
  const persisted = await persistSuggestions(admin, project, ctx.userId, sug.nodes, sug.edges, true);
  if (isReply(persisted)) return persisted;

  // lugares: do site (o que o negócio diz atender) e do Search Console (onde há demanda)
  const ibge = await loadAll<{ ibge_code: number; nome: string; uf: string; populacao: number | null }>(admin, 'ibge_municipios', 'ibge_code,nome,uf,populacao', null, 8000);
  let geoNew = 0; let geoUpdated = 0;
  if (!ibge.rows.length) warnings.push('Os municípios do IBGE ainda não foram carregados: os lugares não foram detectados. Use "Carregar municípios do IBGE" e sugira de novo.');
  else {
    const idx = buildGeoIndex(ibge.rows.map((r) => ({ ibge_code: r.ibge_code, nome: r.nome, uf: r.uf as never })));
    const agg = new Map<string, GeoAgg>();
    const bump = (a: Omit<GeoAgg, 'key' | 'count' | 'weight' | 'examples'>, weight: number, ex: string) => {
      const key = scopeKey(a);
      const e = agg.get(key) ?? { ...a, key, count: 0, weight: 0, examples: [] };
      e.count++; e.weight += weight; if (e.examples.length < 3 && !e.examples.includes(ex)) e.examples.push(ex); agg.set(key, e);
    };
    inputs.forEach((inp) => {
      const role = inp.source === 'site' ? 'atende' as const : 'alvo' as const;
      const g = detectGeo({ url: inp.url, query: inp.query }, idx);
      const w = Math.max(1, Math.round(inp.weight ?? 1));
      for (const m of g.municipios) bump({ role, source: inp.source, uf: m.uf, ibge_code: m.ibge_code, municipio: m.nome, regiao: null }, w, inp.key);
      for (const uf of g.ufs) bump({ role, source: inp.source, uf, ibge_code: null, municipio: null, regiao: null }, w, inp.key);
      for (const slug of g.regioes_sp) { const label = SP_REGIOES.find((r) => r.slug === slug)!.label; bump({ role, source: inp.source, uf: 'SP', ibge_code: null, municipio: null, regiao: label }, w, inp.key); }
    });
    const cur = await loadScope(admin, project.id);
    const byKey = new Map(cur.map((r) => [scopeKey(r), r]));
    const ranked = [...agg.values()].sort((a, b) => b.count - a.count || b.weight - a.weight).slice(0, MAX_GEO_SUGGESTIONS_PER_RUN);
    const rows: Array<Record<string, unknown>> = [];
    for (const a of ranked) {
      const evidence = { count: a.count, weight: a.weight, exemplos: a.examples };
      const ex = byKey.get(a.key);
      if (ex) {
        if (ex.status !== 'rejeitado' && JSON.stringify(ex.evidence) !== JSON.stringify(evidence)) { const u = await admin.from('project_geo_scope').update({ evidence, updated_at: new Date().toISOString() }).eq('id', ex.id).eq('project_id', project.id); if (u.error) throw u.error; geoUpdated++; }
        continue;
      }
      rows.push({ organization_id: project.organization_id, project_id: project.id, uf: a.uf, ibge_code: a.ibge_code, municipio: a.municipio, regiao: a.regiao, role: a.role, source: a.source, status: 'sugerido', evidence, created_by: ctx.userId });
    }
    for (const part of chunk(rows, 200)) { const r = await admin.from('project_geo_scope').insert(part); if (r.error) throw r.error; geoNew += part.length; }
    if (agg.size > ranked.length) warnings.push(`${agg.size - ranked.length} lugar(es) a mais foram vistos; rode de novo para gravar o restante.`);
  }
  return {
    status: 200,
    body: {
      segment: pack.id, analyzed: { secoes: nSections, paginas: (sample.pages || []).length, consultas: (sample.queries || []).length, dias: days },
      classified: sug.classified, unclassified: sug.unclassified, ...persisted, geo_new: geoNew, geo_updated: geoUpdated, warnings,
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------ revisar nós
const cleanKeywords = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.filter((k): k is string => typeof k === 'string').map((k) => k.trim().toLowerCase().slice(0, 60)).filter((k) => k.length >= 2))];
  return out;
};
function descendantsOf(nodes: NodeRow[], id: string): NodeRow[] {
  const out: NodeRow[] = []; const stack = [id];
  while (stack.length) { const p = stack.pop()!; for (const n of nodes) if (n.parent_id === p) { out.push(n); stack.push(n.id); } }
  return out;
}

async function review(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const nodes = await loadNodes(admin, project.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const now = new Date().toISOString();
  const b = ctx.body;
  const warnings: string[] = [];
  /** Modo aviso: aprovar ou criar algo dentro de uma área de cima que estava sugerida ou rejeitada reabre (aprova) a área, e a resposta avisa. */
  const ancestorsToApprove = (n: NodeRow | undefined, into: Map<string, NodeRow>) => {
    let p = n;
    while (p) {
      if (p.status !== 'aprovado' && !into.has(p.id)) { into.set(p.id, p); if (p.status === 'rejeitado') warnings.push(`A área "${p.label}" estava rejeitada e foi reaberta para caber o que está dentro dela.`); }
      p = p.parent_id ? byId.get(p.parent_id) : undefined;
    }
  };

  if (b.create !== undefined) {
    const c = (b.create && typeof b.create === 'object' ? b.create : {}) as Record<string, unknown>;
    const kind = c.kind;
    const label = typeof c.label === 'string' ? c.label.trim().replace(/\s+/g, ' ') : '';
    if (kind !== 'matriz' && kind !== 'subarea' && kind !== 'nicho' && kind !== 'cauda') return fail(422, 'kind_invalid');
    if (label.length < 2 || label.length > (kind === 'cauda' ? 300 : 160)) return fail(422, 'label_invalid');
    let parent: NodeRow | null = null;
    if (kind !== 'matriz') {
      parent = isUuid(c.parentId) ? byId.get(c.parentId) ?? null : null;
      if (!parent) return fail(422, 'parent_required');
      if ((kind === 'subarea' && parent.kind !== 'matriz') || (kind === 'nicho' && (parent.kind === 'nicho' || parent.kind === 'cauda')) || (kind === 'cauda' && parent.kind === 'cauda')) return fail(422, 'parent_kind_invalid');
    } else if (c.parentId) return fail(422, 'parent_kind_invalid');
    if (!slugify(label)) return fail(422, 'label_invalid');
    const slug = !parent ? slugify(label) : kind === 'cauda' ? tailSlug(parent.slug, label) : kind === 'nicho' ? `${parent.slug}/n/${slugify(label)}` : `${parent.slug}/${slugify(label)}`;
    if (nodes.some((n) => n.slug === slug)) return fail(409, 'node_exists');
    const reopen = new Map<string, NodeRow>();
    ancestorsToApprove(parent ?? undefined, reopen);
    const id = crypto.randomUUID();
    const row = { id, organization_id: project.organization_id, project_id: project.id, kind, parent_id: parent?.id ?? null, slug, label, keywords: cleanKeywords(c.keywords) ?? [], source: 'manual', status: 'aprovado', evidence: { total: 0, motivo: 'criado à mão' }, created_by: ctx.userId };
    const ins = await admin.from('project_taxonomy_nodes').insert(row);
    if (ins.error) throw ins.error;
    for (const part of chunk([...reopen.keys()], 100)) { const u = await admin.from('project_taxonomy_nodes').update({ status: 'aprovado', updated_at: now }).in('id', part).eq('project_id', project.id); if (u.error) throw u.error; }
    return { status: 200, body: { created: 1, id, warnings } };
  }

  const ids: string[] = Array.isArray(b.nodeIds) ? b.nodeIds : b.nodeId !== undefined ? [b.nodeId as string] : [];
  if (!ids.length || !ids.every(isUuid)) return fail(422, 'ids_invalid');
  const targets = [...new Set(ids)].map((i) => byId.get(i));
  if (targets.some((n) => !n)) return fail(404, 'node_not_found');
  const list = targets as NodeRow[];

  if (b.label !== undefined || b.keywords !== undefined) {
    if (list.length !== 1) return fail(422, 'ids_invalid');
    const patch: Record<string, unknown> = { updated_at: now };
    if (b.label !== undefined) {
      const label = typeof b.label === 'string' ? b.label.trim().replace(/\s+/g, ' ') : '';
      if (label.length < 2 || label.length > (list[0].kind === 'cauda' ? 300 : 160)) return fail(422, 'label_invalid');
      patch.label = label; // o slug não muda: ele é a identidade estável do nó
    }
    if (b.keywords !== undefined) { const kw = cleanKeywords(b.keywords); if (!kw) return fail(422, 'keywords_invalid'); patch.keywords = kw; }
    const u = await admin.from('project_taxonomy_nodes').update(patch).eq('id', list[0].id).eq('project_id', project.id);
    if (u.error) throw u.error;
    return { status: 200, body: { updated: 1, warnings } };
  }

  const decision = b.decision as NodeStatus;
  if (!DECISIONS.includes(decision)) return fail(422, 'decision_invalid');
  const toSet = new Map<string, NodeRow>();
  for (const n of list) {
    toSet.set(n.id, n);
    if (decision === 'rejeitado') for (const d of descendantsOf(nodes, n.id)) toSet.set(d.id, d); // rejeitar uma área rejeita o que está dentro dela
    if (decision === 'aprovado') ancestorsToApprove(n.parent_id ? byId.get(n.parent_id) : undefined, toSet);
  }
  const idList = [...toSet.keys()];
  const status = (id: string) => (list.some((n) => n.id === id) || decision === 'rejeitado' ? decision : 'aprovado');
  for (const st of ['aprovado', 'rejeitado', 'sugerido'] as NodeStatus[]) {
    const part = idList.filter((id) => status(id) === st);
    for (const piece of chunk(part, 100)) { const u = await admin.from('project_taxonomy_nodes').update({ status: st, updated_at: now }).in('id', piece).eq('project_id', project.id); if (u.error) throw u.error; }
  }
  return { status: 200, body: { updated: idList.length, decision, warnings } };
}

// ------------------------------------------------------------------------------------------------------------------ cauda gerada por agente de IA
/**
 * A cauda (buscas específicas) é lista GERADA POR AGENTE (source 'agente'): o agente conhece as regras de Google, Bing, Gemini etc. e escreve as buscas;
 * o sistema só guarda como nós `cauda` SUGERIDOS, com o motivo e os motores que o agente indicou, e o dono revisa. Não há lista fixa nem regra de tamanho.
 */
async function tailImport(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const parsed = parseTailImport(ctx.body.items ?? ctx.body.text);
  if ('error' in parsed) return fail(422, parsed.error);
  const pack = ctx.body.segment === undefined || ctx.body.segment === '' ? null : getPack(ctx.body.segment);
  if (ctx.body.segment !== undefined && ctx.body.segment !== '' && !pack) return fail(422, 'segment_unknown');
  const nodes = (await loadNodes(admin, project.id)).filter((n) => n.kind !== 'cauda');
  const bySlug = new Map(nodes.map((n) => [n.slug, n]));
  const byLabel = new Map(nodes.map((n) => [norm(n.label), n]));
  const have = new Set((await loadNodes(admin, project.id)).filter((n) => n.kind === 'cauda').map((n) => n.slug));
  const now = new Date(ctx.deps.now()).toISOString();
  const warnings: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const unattached: string[] = []; let existing = 0;
  for (const it of parsed.items) {
    let parent = it.parentRef ? bySlug.get(it.parentRef) ?? byLabel.get(norm(it.parentRef)) : undefined;
    if (!parent && pack) { // sem pai dito pelo agente: o sistema tenta achar pela subárea ou área que as regras do pacote reconhecem
      const c = classifyQuery(it.label, pack);
      parent = (c.matriz && c.subarea ? bySlug.get(`${slugify(c.matriz)}/${slugify(c.subarea)}`) : undefined) ?? (c.matriz ? bySlug.get(slugify(c.matriz)) : undefined);
    }
    if (!parent) { unattached.push(it.label); continue; }
    const slug = tailSlug(parent.slug, it.label);
    if (have.has(slug)) { existing++; continue; }
    have.add(slug);
    const language = it.language; const country = it.country;
    rows.push({
      id: crypto.randomUUID(), organization_id: project.organization_id, project_id: project.id, kind: 'cauda', parent_id: parent.id, slug, label: it.label, keywords: it.keywords, source: 'agente', status: 'sugerido',
      evidence: { total: 1, gerado_por: 'agente', importado_em: now, motivo: it.rationale, publico: it.publico, motores: it.engines, pais: country, lingua: language }, created_by: ctx.userId,
    });
  }
  if (unattached.length) warnings.push(`${unattached.length} busca(s) ficaram sem área: diga a área de cada uma (campo "parent"), ou informe o segmento para eu tentar classificar.`);
  if (parsed.engines_ignored) warnings.push(`${parsed.engines_ignored} nome(s) de motor não são conhecidos pelo sistema e foram ignorados.`);
  for (const part of chunk(rows, 200)) { const r = await admin.from('project_taxonomy_nodes').insert(part); if (r.error) throw r.error; }
  return { status: 200, body: { added: rows.length, already_there: existing, unattached: unattached.slice(0, 50), unattached_count: unattached.length, invalid: parsed.invalid, duplicates: parsed.duplicates, warnings } };
}

/** Pedir a cauda ao agente é serviço pago: o bloqueio global vem ANTES de qualquer leitura. O agente ainda não está ligado ao sistema. */
function tailGenerate(ctx: TaxonomyCtx): Reply {
  if (ctx.paidBlocked ?? PAID_SERVICES_BLOCKED) return fail(423, 'global_paid_services_blocked', { message: PAID_LOCK_MESSAGE, executed: false, retryable: false });
  return fail(501, 'tail_agent_not_connected', { message: 'O agente de IA que gera a cauda ainda não está ligado. Cole a lista que ele produziu em "Trazer a cauda do agente".', executed: false });
}

// ------------------------------------------------------------------------------------------------------------------ IBGE
async function ibgeJson(ctx: TaxonomyCtx, url: string): Promise<unknown | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await ctx.deps.fetchFn(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

async function geoSync(admin: Admin, ctx: TaxonomyCtx): Promise<Reply> {
  const last = await admin.from('ibge_municipios').select('fetched_at').order('fetched_at', { ascending: false }).limit(1);
  if (last.error) throw last.error;
  const lastAt = last.data && last.data.length ? Date.parse(String(last.data[0].fetched_at)) : 0;
  if (lastAt && ctx.deps.now() - lastAt < GEO_SYNC_MIN_INTERVAL_MS) return fail(429, 'sync_too_soon', { retry_after_seconds: Math.ceil((GEO_SYNC_MIN_INTERVAL_MS - (ctx.deps.now() - lastAt)) / 1000) });
  const muni = parseIbgeMunicipios(await ibgeJson(ctx, IBGE_MUNICIPIOS_URL));
  if (muni.length < 5000) return fail(502, 'ibge_unavailable'); // a lista oficial tem 5.571: resposta curta é falha, não dado
  const popRaw = await ibgeJson(ctx, IBGE_POPULACAO_URL);
  const pop = parseIbgePopulacao(popRaw);
  const full = comPopulacao(muni, pop);
  const now = new Date(ctx.deps.now()).toISOString();
  for (const part of chunk(full, 500)) {
    const r = await admin.from('ibge_municipios').upsert(part.map((m) => ({ ibge_code: m.ibge_code, nome: m.nome, uf: m.uf, regiao: m.regiao, mesorregiao: m.mesorregiao, regiao_imediata: m.regiao_imediata, populacao: m.populacao, populacao_ano: m.populacao_ano, fetched_at: now })), { onConflict: 'ibge_code' });
    if (r.error) throw r.error;
  }
  return { status: 200, body: { municipios: full.length, with_population: full.filter((m) => m.populacao !== null).length, population_year: pop.ano, population_available: pop.byCode.size > 0 } };
}

// ------------------------------------------------------------------------------------------------------------------ escopo geográfico
async function scopeSave(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const b = ctx.body;
  const cur = await loadScope(admin, project.id);
  const now = new Date().toISOString();
  let added = 0; let updated = 0; let removed = 0;
  const warnings: string[] = [];

  if (b.remove_ids !== undefined) {
    const ids = Array.isArray(b.remove_ids) ? b.remove_ids : [];
    if (!ids.length || !ids.every(isUuid)) return fail(422, 'ids_invalid');
    const mine = new Set(cur.map((r) => r.id));
    const del = (ids as string[]).filter((i) => mine.has(i));
    for (const part of chunk(del, 100)) { const r = await admin.from('project_geo_scope').delete().in('id', part).eq('project_id', project.id); if (r.error) throw r.error; }
    removed = del.length;
  }
  if (b.decide !== undefined) {
    const d = (b.decide && typeof b.decide === 'object' ? b.decide : {}) as Record<string, unknown>;
    if (!Array.isArray(d.ids) || !d.ids.length || !d.ids.every(isUuid)) return fail(422, 'ids_invalid');
    if (!DECISIONS.includes(d.status as NodeStatus)) return fail(422, 'decision_invalid');
    const mine = new Set(cur.map((r) => r.id));
    const ok = (d.ids as string[]).filter((i) => mine.has(i));
    for (const part of chunk(ok, 100)) { const r = await admin.from('project_geo_scope').update({ status: d.status, updated_at: now }).in('id', part).eq('project_id', project.id); if (r.error) throw r.error; }
    updated += ok.length;
  }
  if (b.entries !== undefined) {
    const list = Array.isArray(b.entries) ? b.entries as Array<Record<string, unknown>> : [];
    if (!list.length) return fail(422, 'entries_invalid');
    const codes = [...new Set(list.map((e) => e?.ibge_code).filter((c) => c !== undefined && c !== null))].map(Number);
    if (codes.some((c) => !Number.isInteger(c))) return fail(422, 'ibge_code_invalid');
    const known = new Map<number, { ibge_code: number; nome: string; uf: string }>();
    for (const part of chunk(codes, 100)) {
      const r = await admin.from('ibge_municipios').select('ibge_code,nome,uf').in('ibge_code', part);
      if (r.error) throw r.error;
      for (const m of r.data || []) known.set(Number(m.ibge_code), m);
    }
    const byKey = new Map(cur.map((r) => [scopeKey(r), r]));
    const rows: Array<Record<string, unknown>> = [];
    for (const raw of list) {
      const e = raw && typeof raw === 'object' ? raw : {};
      if (!ROLES.includes(e.role as string)) return fail(422, 'role_invalid');
      // país/mercado no mesmo formato dos conjuntos de prompts do NEXUS: country (2 letras), language e a cidade em "municipio"
      const country = e.country === undefined || e.country === null || e.country === '' ? 'br' : String(e.country).toLowerCase();
      if (!/^[a-z]{2}$/.test(country)) return fail(422, 'country_invalid');
      const language = e.language === undefined || e.language === null || e.language === '' ? 'pt-BR' : String(e.language);
      if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language)) return fail(422, 'language_invalid');
      let uf: string | null = e.uf === undefined || e.uf === null || e.uf === '' ? null : String(e.uf).toUpperCase();
      if (uf !== null && !isUf(uf)) return fail(422, 'uf_invalid');
      let ibge: number | null = null; let municipio: string | null = null;
      if (country !== 'br') {
        if (uf || e.ibge_code !== undefined && e.ibge_code !== null) return fail(422, 'place_ambiguous');
        if (typeof e.municipio === 'string' && e.municipio.trim()) municipio = e.municipio.trim().replace(/\s+/g, ' ').slice(0, 120);
      } else if (e.ibge_code !== undefined && e.ibge_code !== null) {
        const m = known.get(Number(e.ibge_code));
        if (!m) return fail(422, 'ibge_code_unknown');
        ibge = m.ibge_code; municipio = m.nome; uf = m.uf;
      } else if (typeof e.municipio === 'string' && e.municipio.trim()) {
        if (!uf) return fail(422, 'uf_required');
        municipio = e.municipio.trim().replace(/\s+/g, ' ').slice(0, 120);
      }
      let bairro: string | null = null;
      if (typeof e.bairro === 'string' && e.bairro.trim()) {
        if (!municipio) return fail(422, 'bairro_needs_city');
        bairro = e.bairro.trim().replace(/\s+/g, ' ').slice(0, 120);
      }
      let regiao: string | null = null;
      if (typeof e.regiao === 'string' && e.regiao.trim()) {
        regiao = e.regiao.trim();
        if (!SP_REGIOES.some((r) => r.label === regiao) && !(GRANDES_REGIOES as string[]).includes(regiao)) return fail(422, 'regiao_invalid');
        if (municipio) return fail(422, 'place_ambiguous');
      }
      if (country === 'br' && !uf && !regiao) return fail(422, 'place_required');
      const entry = { role: e.role as string, country, language, uf, ibge_code: ibge, municipio, bairro, regiao };
      if (country !== 'br' && !isPtLanguage(language)) warnings.push(`O mercado ${country}:${language}${municipio ? `:${municipio}` : ''} é em outra língua: as buscas dele precisam ser escritas pelo agente de IA (cauda).`);
      const ex = byKey.get(scopeKey(entry));
      if (ex) { const u = await admin.from('project_geo_scope').update({ status: 'aprovado', source: 'manual', updated_at: now }).eq('id', ex.id).eq('project_id', project.id); if (u.error) throw u.error; updated++; continue; }
      byKey.set(scopeKey(entry), { id: '', source: 'manual', status: 'aprovado', evidence: {}, ...entry });
      rows.push({ organization_id: project.organization_id, project_id: project.id, ...entry, source: 'manual', status: 'aprovado', evidence: {}, created_by: ctx.userId });
    }
    for (const part of chunk(rows, 200)) { const r = await admin.from('project_geo_scope').insert(part); if (r.error) throw r.error; }
    added = rows.length;
  }
  if (b.entries === undefined && b.remove_ids === undefined && b.decide === undefined) return fail(422, 'nothing_to_do');
  return { status: 200, body: { added, updated, removed, warnings } };
}
const isPtLanguage = (l: string) => /^pt\b/i.test(l);

// ------------------------------------------------------------------------------------------------------------------ bairros (distritos do IBGE)
/**
 * Sugere os bairros dos municípios aprovados no escopo a partir dos DISTRITOS do IBGE (API pública, sem chave e sem custo). Em municípios grandes (São Paulo,
 * por exemplo) os distritos são os bairros conhecidos; em cidades pequenas costuma haver um distrito só. Tudo entra como "sugerido" para o dono aprovar.
 */
async function geoDistricts(admin: Admin, ctx: TaxonomyCtx, project: ProjectRow): Promise<Reply> {
  const cur = await loadScope(admin, project.id);
  const asked = Array.isArray(ctx.body.ibge_codes) ? (ctx.body.ibge_codes as unknown[]).map(Number).filter(Number.isInteger) : null;
  const cities = new Map<number, { municipio: string; uf: string }>();
  for (const s of cur) if (s.status === 'aprovado' && s.ibge_code && s.municipio && !s.bairro && (s.country ?? 'br') === 'br' && s.uf && (!asked || asked.includes(Number(s.ibge_code)))) cities.set(Number(s.ibge_code), { municipio: s.municipio, uf: s.uf });
  const offset = Math.max(0, Math.round(Number(ctx.body.offset) || 0));
  const all = [...cities.entries()];
  const slice = all.slice(offset, offset + MAX_DISTRICT_CITIES_PER_CALL);
  if (!all.length) return { status: 200, body: { cities: 0, added: 0, existing: 0, failed: [], remaining: 0, warnings: ['Aprove pelo menos um município (com código do IBGE) em "Onde atua" para eu buscar os bairros dele.'] } };
  const byKey = new Map(cur.map((r) => [scopeKey(r), r]));
  const rows: Array<Record<string, unknown>> = [];
  const failed: string[] = []; let existing = 0;
  for (const [code, c] of slice) {
    const json = await ibgeJson(ctx, `${IBGE_MUNICIPIOS_URL}/${code}/distritos`);
    if (!Array.isArray(json)) { failed.push(c.municipio); continue; }
    for (const d of json as Array<Record<string, unknown>>) {
      const nome = typeof d?.nome === 'string' ? d.nome.trim().slice(0, 120) : '';
      if (!nome || (norm(nome) === norm(c.municipio) && json.length === 1)) continue; // distrito único com o nome da cidade não é bairro
      const entry = { role: 'atende', country: 'br', language: 'pt-BR', uf: c.uf, ibge_code: code, municipio: c.municipio, bairro: nome, regiao: null };
      if (byKey.has(scopeKey(entry))) { existing++; continue; }
      byKey.set(scopeKey(entry), { id: '', source: 'ibge', status: 'sugerido', evidence: {}, ...entry });
      rows.push({ organization_id: project.organization_id, project_id: project.id, ...entry, source: 'ibge', status: 'sugerido', evidence: { fonte: 'IBGE distritos' }, created_by: ctx.userId });
    }
  }
  for (const part of chunk(rows, 200)) { const r = await admin.from('project_geo_scope').insert(part); if (r.error) throw r.error; }
  return { status: 200, body: { cities: slice.length, added: rows.length, existing, failed, remaining: Math.max(0, all.length - offset - slice.length), warnings: failed.length ? [`Não consegui ler os distritos de: ${failed.join(', ')}.`] : [] } };
}
