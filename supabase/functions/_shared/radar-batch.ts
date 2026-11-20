/**
 * Radar de Mercado, execução: rodada de descoberta (gasta), enriquecimento do concorrente (educado), YouTube, placar semanal.
 * Usado pelo portão (`engine`) e pelo cron (`radar-run`). Tudo injetável: rede paga, rede pública, segredos, tempo e sono.
 *
 * Teto de gasto: TODA chamada paga sai pelo `paidFetch` (o fetch guardado do teto diário, spend-gate). Negação (teto atingido, pausa, status indisponível) PARA a rodada
 * na hora e fica registrada; este arquivo nunca tenta outro provedor depois de uma negação. Além do teto do banco, a rodada tem orçamento próprio
 * (estimativa por consulta) e usa no máximo metade do que ainda resta no dia (parâmetro), para não consumir o dia inteiro dividido com artigos e imagens.
 */
import { mapLimit, type Admin } from './engine-kernel.ts';
import { loadAll, UNBOUNDED, chunk } from './taxonomy-shared.ts';
import { recordEvent } from './project-events.ts';
import { DEFAULT_PRICE_BOOK, priceBookFromRows } from './spend-gate-core.ts';
import {
  coverageSummary, estimateTaskMicros, generateTasks, planBatch, saturationOf, buildProviderCall, parseProviderResponse, buildDfsBacklinksCall, parseDfsBacklinks,
  type CoverageEntry, type DiscoveryEngine, type DiscoveryTask, type PriceUnits, type RoundStat,
} from './radar-discovery-core.ts';
import { buildPlaceIndex } from './radar-geo-core.ts';
import { ensureOwn, ingestHit, ingestListing, ingestSiteLinks, relinkOrphans, liveEntity, type EntityBook } from './radar-entity-core.ts';
import { scanSite, buildOpenPageRankUrl, parseOpenPageRank, RADAR_UA, type ScanDeps } from './radar-enrich-core.ts';
import {
  SNIPPET_LABEL, YT_KEY_MISSING_MESSAGE, buildYtChannelsUrl, buildYtSearchUrl, buildYtVideosUrl, parseSnippetCounts, parseYtChannels, parseYtError, parseYtSearch, parseYtVideos, postingCadence,
} from './radar-social-core.ts';
import { scoreBoard, weekKey, type Scope, type Snapshot } from './radar-score-core.ts';
import { ensureLink, linkKeys, loadSnapshot, persistBook, type ProjectLite } from './radar-store.ts';
import type { FocusIn, FocusPlaceIn } from './radar-discovery-core.ts';
import { DEFAULT_MODALITIES, type Modality } from './radar-focus-core.ts';

export interface BatchDeps {
  fetchFn: typeof fetch; lookupA: (host: string) => Promise<string[]>; now: () => number; sleep: (ms: number) => Promise<void>;
  /** fetch guardado pelo teto diário (providerFetch em produção). NUNCA o fetch cru. */
  paidFetch: typeof fetch;
  readSecret: (organizationId: string, provider: string) => Promise<string | null>;
  youtubeKey: string | null; oprKey: string | null; speedApiKey: string | null;
  /** avisa o contexto de gasto de quem está pagando (organização e projeto) antes das chamadas pagas */
  bindOrg?: (organizationId: string, projectId: string, userId: string | null) => void;
  /** o que resta no dia (teto do spend-gate); null = indisponível (o gate continua negando por conta própria) */
  dayBudget?: (organizationId: string) => Promise<{ remaining_micros: number; used_micros: number; cap_micros: number } | null>;
  unitPrices?: () => Promise<PriceUnits>;
  budgetMs?: number;
}
export const DEFAULT_RUN_BUDGET_MICROS = 500_000;
export const DEFAULT_MAX_QUERIES = 40;
export const DEFAULT_SHARE_OF_REMAINING = 0.5;
export const RUN_TIME_BUDGET_MS = 100_000;
export const TASK_PARALLEL = 3;
export const COVERAGE_TTL_DAYS: Record<string, number> = { manual: 7, diaria: 1, semanal: 7, mensal: 30 };

const isSpendDenied = (e: unknown): boolean => !!e && typeof e === 'object' && ((e as { name?: string }).name === 'SpendDeniedError' || typeof (e as { info?: { code?: string } }).info?.code === 'string');
const denyCode = (e: unknown): string => String((e as { info?: { code?: string } })?.info?.code ?? 'spend_denied');

export async function defaultUnits(deps: BatchDeps): Promise<PriceUnits> {
  if (deps.unitPrices) return await deps.unitPrices();
  return DEFAULT_PRICE_BOOK.units;
}
export const unitsFromRows = (rows: unknown): PriceUnits => priceBookFromRows(rows).units;

/** Chaves guardadas por organização (só presença é devolvida à tela; o valor fica na memória desta execução). */
export async function loadSecrets(deps: BatchDeps, organizationId: string): Promise<{ serper: string | null; dataforseo: string | null; brave: string | null }> {
  const read = async (p: string) => { try { return (await deps.readSecret(organizationId, p)) || null; } catch { return null; } };
  const [serper, dataforseo, brave] = await Promise.all([read('serper'), read('dataforseo'), read('brave')]);
  return { serper, dataforseo, brave };
}
export const enginesFrom = (s: { serper: string | null; dataforseo: string | null; brave: string | null }, includeBing = false): DiscoveryEngine[] => {
  const out: DiscoveryEngine[] = [];
  if (s.serper) out.push('serper');
  if (s.brave) out.push('brave');
  if (s.dataforseo) out.push('dfs_google', 'dfs_maps', ...(includeBing ? ['dfs_bing' as const] : []));
  return out;
};

// ------------------------------------------------------------------------------------------------------------------ plano
export interface FocusRow { id: string; name: string; weight: number; topics: string[]; segment_label: string | null; segment_node_id: string | null; language: string; modalities: string[]; status: string }
export async function loadFocusInputs(admin: Admin, snap: Snapshot, projectId: string): Promise<{ focuses: FocusIn[]; focusPlaces: FocusPlaceIn[] }> {
  const rows = (await loadAll<FocusRow>(admin, 'project_focuses', 'id,name,weight,topics,segment_label,segment_node_id,language,modalities,status', { col: 'project_id', val: projectId }, UNBOUNDED)).rows;
  const wm = (await loadAll<{ focus_id: string; place_id: string; weight_mult: number; status: string }>(admin, 'project_focus_places', 'focus_id,place_id,weight_mult,status', { col: 'project_id', val: projectId }, UNBOUNDED)).rows;
  const focuses: FocusIn[] = rows.map((f) => ({ id: f.id, name: f.name, weight: Number(f.weight), topics: f.topics ?? [], segmentLabel: f.segment_label, nodeId: f.segment_node_id, language: f.language || 'en', modalities: (f.modalities?.length ? f.modalities : DEFAULT_MODALITIES) as Modality[], status: f.status }));
  const focusPlaces: FocusPlaceIn[] = [];
  for (const r of wm) { const place = snap.places.get(r.place_id); if (place) focusPlaces.push({ focusId: r.focus_id, place, weightMult: Number(r.weight_mult) || 1, status: r.status }); }
  return { focuses, focusPlaces };
}
export async function loadLedger(admin: Admin, projectId: string): Promise<Array<CoverageEntry & { focus_id: string | null }>> {
  return (await loadAll<CoverageEntry & { focus_id: string | null }>(admin, 'radar_coverage', 'task_key,status,cost_micros,results,new_entities,queried_at,focus_id', { col: 'project_id', val: projectId }, UNBOUNDED)).rows;
}

export async function dayBudgetOf(deps: BatchDeps, orgId: string) { try { return deps.dayBudget ? await deps.dayBudget(orgId) : null; } catch { return null; } }

export interface RunOptions { kind: 'manual' | 'diaria' | 'semanal' | 'mensal'; budgetMicros?: number; maxQueries?: number; focusId?: string | null; userId: string | null; multiWeb?: boolean; includeBing?: boolean; shareOfRemaining?: number }
export interface RunReport {
  run_id: string | null; ok: boolean; error?: string; queries_planned: number; queries_done: number; errors: number; cost_micros: number; cost_basis: 'estimado_pela_tabela_de_precos_e_resposta_do_provedor';
  new_entities: number; total_entities: number; new_identities: number; orphan_identities: number; pages: number; listings: number; skipped_covered: number; skipped_budget: number;
  stopped: 'teto_diario' | 'orcamento' | 'tempo' | null; stop_reason: string | null; budget_micros: number; day_remaining_micros: number | null; saturation: ReturnType<typeof saturationOf>; engines: string[];
}

/** Uma rodada de descoberta. Para na hora em que o teto diário nega. Cada consulta fica no ledger (consultada/erro) com custo e data. */
export async function executeBatch(admin: Admin, deps: BatchDeps, project: ProjectLite, o: RunOptions): Promise<RunReport> {
  const t0 = deps.now(); const nowIso = new Date(t0).toISOString();
  const empty = (error: string): RunReport => ({ run_id: null, ok: false, error, queries_planned: 0, queries_done: 0, errors: 0, cost_micros: 0, cost_basis: 'estimado_pela_tabela_de_precos_e_resposta_do_provedor', new_entities: 0, total_entities: 0, new_identities: 0, orphan_identities: 0, pages: 0, listings: 0, skipped_covered: 0, skipped_budget: 0, stopped: null, stop_reason: null, budget_micros: 0, day_remaining_micros: null, saturation: saturationOf([]), engines: [] });
  deps.bindOrg?.(project.organization_id, project.id, o.userId);
  const secrets = await loadSecrets(deps, project.organization_id);
  const engines = enginesFrom(secrets, o.includeBing);
  if (!engines.length) return empty('radar_no_provider_key');
  const { snap, book } = await loadSnapshot(admin, project, t0);
  const inputs = await loadFocusInputs(admin, snap, project.id);
  const focuses = o.focusId ? inputs.focuses.filter((f) => f.id === o.focusId) : inputs.focuses;
  if (!focuses.some((f) => f.status === 'ativo')) return empty('radar_no_active_focus');
  const units = await defaultUnits(deps);
  const grid = generateTasks(focuses, inputs.focusPlaces, buildPlaceIndex([...snap.places.values()]), { engines, units, multiWeb: o.multiWeb });
  const ledger = await loadLedger(admin, project.id);
  const day = await dayBudgetOf(deps, project.organization_id);
  const requested = Math.max(0, Math.round(o.budgetMicros ?? DEFAULT_RUN_BUDGET_MICROS));
  const share = Math.min(1, Math.max(0.05, o.shareOfRemaining ?? DEFAULT_SHARE_OF_REMAINING));
  const budget = day ? Math.min(requested, Math.floor(day.remaining_micros * share)) : requested;
  const plan = planBatch({ tasks: grid.tasks, ledger, budgetMicros: budget, maxTasks: Math.max(1, Math.min(1000, o.maxQueries ?? DEFAULT_MAX_QUERIES)), nowMs: t0, ttlDays: COVERAGE_TTL_DAYS[o.kind] ?? 7 });

  const runId = crypto.randomUUID();
  const base = { organization_id: project.organization_id, project_id: project.id };
  const ins = await admin.from('radar_runs').insert({ id: runId, ...base, kind: o.kind, status: 'executando', queries_planned: plan.selected.length, started_at: nowIso, created_by: o.userId });
  if (ins.error) throw ins.error;

  const own = (project.domain || project.wordpress_url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (own) ensureOwn(book, own, project.name);
  const entitiesBefore = [...book.entities.values()].filter((e) => !e.merged_into && e.kind !== 'diretorio' && !e.is_own).length;

  const results: Array<{ t: DiscoveryTask; ok: boolean; hits: ReturnType<typeof parseProviderResponse> | null; error: string | null; cost: number }> = [];
  let stopped: RunReport['stopped'] = null; let stopReason: string | null = null; let spent = 0; let done = 0; let errors = 0;
  for (const group of chunk(plan.selected, TASK_PARALLEL)) {
    if (stopped) break;
    if (deps.now() - t0 > (deps.budgetMs ?? RUN_TIME_BUDGET_MS)) { stopped = 'tempo'; stopReason = 'tempo_da_rodada'; break; }
    const outs = await mapLimit(group, TASK_PARALLEL, async (t) => {
      const secret = secrets[({ serper: 'serper', brave: 'brave', dfs_google: 'dataforseo', dfs_maps: 'dataforseo', dfs_bing: 'dataforseo' } as const)[t.engine]];
      const call = secret ? buildProviderCall(t, secret) : null;
      if (!call) return { t, ok: false, hits: null, error: 'consulta_invalida', cost: 0, denied: null as string | null };
      try {
        const res = await deps.paidFetch(call.url, call.init);
        if (!res.ok) return { t, ok: false, hits: null, error: `http_${res.status}`, cost: 0, denied: null };
        const json = await res.json().catch(() => null);
        const parsed = parseProviderResponse(t, json);
        if (!parsed.ok) return { t, ok: false, hits: null, error: 'resposta_invalida', cost: 0, denied: null };
        return { t, ok: true, hits: parsed, error: null, cost: parsed.cost_micros ?? t.est_micros, denied: null };
      } catch (e) {
        if (isSpendDenied(e)) return { t, ok: false, hits: null, error: 'negada_pelo_teto', cost: 0, denied: denyCode(e) };
        return { t, ok: false, hits: null, error: 'falha_de_rede', cost: 0, denied: null };
      }
    });
    for (const r of outs) {
      if (r.denied) { stopped = 'teto_diario'; stopReason = r.denied; continue; }
      results.push(r); if (r.ok) { done++; spent += r.cost; } else errors++;
    }
    if (!stopped && spent >= budget) { stopped = 'orcamento'; stopReason = 'orcamento_da_rodada'; }
  }

  // ingestão sequencial (a ordem do plano é a ordem de prioridade)
  const pages = new Map<string, Record<string, unknown>>(); const listings = new Map<string, Record<string, unknown>>(); const covRows: Array<Record<string, unknown>> = [];
  const pendingMetrics = new Map<string, { metrics: Record<string, number>; query: string }>();
  const linkWanted: Array<{ ref: string; t: DiscoveryTask }> = [];
  for (const r of results) {
    const t = r.t; const ctx = { engine: t.engine, modality: t.modality, focusId: t.focusId, placeId: t.placeId, nodeId: t.nodeId, queryKey: t.key };
    const before = [...book.entities.values()].filter((e) => e.isNew && !e.merged_into && e.kind !== 'diretorio').length;
    let count = 0;
    if (r.ok && r.hits) {
      for (const h of r.hits.hits) {
        const ing = ingestHit(book, h, ctx);
        if (ing.kind === 'ignorado') continue;
        count++;
        let host = ''; try { host = new URL(h.url).hostname.replace(/^www\./, ''); } catch { continue; }
        const pk = `${h.url}|${t.engine}|${h.kind}|${t.key}`;
        pages.set(pk, { ...ingestBase(project), competitor_id: ing.entityId, focus_id: t.focusId, place_id: t.placeId, node_id: t.nodeId, url: h.url.slice(0, 1000), host: host.slice(0, 200), title: h.title, snippet: h.snippet?.slice(0, 600) ?? null, position: Math.min(200, Math.max(1, h.position)), modality: t.modality === 'social' ? 'social' : h.kind === 'video' ? 'videos' : h.kind === 'noticia' ? 'news' : h.kind === 'imagem' ? 'images' : 'web', engine: t.engine, page_type: ing.kind === 'perfil' ? 'perfil' : ing.kind === 'diretorio' ? 'diretorio' : null, query_key: t.key, seen_at: nowIso });
        if (ing.entityId && ing.kind !== 'diretorio') linkWanted.push({ ref: ing.entityId, t });
        if (ing.kind === 'perfil' && ing.identityKey) { const counts = parseSnippetCounts(`${h.title ?? ''} ${h.snippet ?? ''}`); if (counts.length) pendingMetrics.set(ing.identityKey, { metrics: Object.fromEntries(counts.map((c) => [c.metric, c.value])), query: t.query }); }
      }
      for (const l of r.hits.listings) {
        const ing = ingestListing(book, l, ctx); count++;
        listings.set(l.ref, { ...ingestBase(project), competitor_id: ing.entityId, focus_id: t.focusId, place_id: t.placeId, listing_ref: l.ref.slice(0, 200), name: l.name, address: l.address, rating: l.rating, reviews: l.reviews, categories: l.categories, phone: l.phone, website: l.website, hours: {}, lat: l.lat, lon: l.lon, position: l.position ? Math.min(200, Math.max(1, l.position)) : null, engine: t.engine, seen_at: nowIso });
        linkWanted.push({ ref: ing.entityId, t });
      }
    }
    const fresh = [...book.entities.values()].filter((e) => e.isNew && !e.merged_into && e.kind !== 'diretorio').length - before;
    covRows.push({ ...ingestBase(project), run_id: runId, task_key: t.key, focus_id: t.focusId, place_id: t.placeId, node_id: t.nodeId, engine: t.engine, modality: t.modality, query: t.query.slice(0, 500), country: t.country, language: t.language, status: r.ok ? 'consultada' : 'erro', cost_micros: Math.round(r.cost), results: count, new_entities: Math.max(0, fresh), error: r.error, queried_at: nowIso });
  }
  relinkOrphans(book);
  const persisted = await persistBook(admin, project, book, nowIso);

  // métricas do trecho público (rotuladas) + histórico
  for (const [key, m] of pendingMetrics) {
    const id = book.byIdentityKey.get(key); if (!id) continue;
    const u = await admin.from('radar_identities').update({ metrics: m.metrics, metrics_label: SNIPPET_LABEL, metrics_source: `trecho público do buscador: "${m.query}"`.slice(0, 300), metrics_at: nowIso }).eq('id', id).eq('project_id', project.id);
    if (u.error) throw u.error;
    const h = await admin.from('radar_identity_metrics').insert({ ...base, identity_id: id, observed_at: nowIso, metrics: m.metrics, label: SNIPPET_LABEL, source: `trecho público: ${m.query}`.slice(0, 300) });
    if (h.error) throw h.error;
  }
  for (const part of chunk([...pages.values()], 300)) { const r = await admin.from('radar_pages').upsert(part, { onConflict: 'project_id,url,engine,modality,query_key' }); if (r.error) throw r.error; }
  for (const part of chunk([...listings.values()], 300)) { const r = await admin.from('radar_map_listings').upsert(part, { onConflict: 'project_id,listing_ref' }); if (r.error) throw r.error; }
  for (const part of chunk(covRows, 300)) { const r = await admin.from('radar_coverage').upsert(part, { onConflict: 'project_id,task_key' }); if (r.error) throw r.error; }
  const have = linkKeys((await loadAll<{ competitor_id: string; focus_id: string | null; place_id: string | null; node_id: string | null }>(admin, 'radar_links', 'competitor_id,focus_id,place_id,node_id', { col: 'project_id', val: project.id }, UNBOUNDED)).rows);
  for (const w of linkWanted) { const live = liveEntity(book, w.ref); if (live && !live.is_own) await ensureLink(admin, project, have, { competitor_id: live.id, focus_id: w.t.focusId, place_id: w.t.placeId, node_id: w.t.nodeId, source: 'busca' }); }

  const entitiesAfter = [...book.entities.values()].filter((e) => !e.merged_into && e.kind !== 'diretorio' && !e.is_own).length;
  const newEntities = Math.max(0, entitiesAfter - entitiesBefore);
  const status = stopped === 'teto_diario' ? 'parada_no_teto' : 'concluida';
  const up = await admin.from('radar_runs').update({ status, queries_done: done, new_entities: newEntities, total_entities: entitiesAfter, cost_micros: Math.round(spent), stop_reason: stopReason, finished_at: new Date(deps.now()).toISOString(), detail: { errors, engines, skipped_covered: plan.skipped_covered, skipped_budget: plan.skipped_budget, budget_micros: budget } }).eq('id', runId).eq('project_id', project.id);
  if (up.error) throw up.error;
  const rounds = (await loadAll<{ queries_done: number; new_entities: number; total_entities: number }>(admin, 'radar_runs', 'queries_done,new_entities,total_entities,started_at', { col: 'project_id', val: project.id }, 500, 'started_at')).rows.map((r): RoundStat => ({ queries: r.queries_done, new_entities: r.new_entities, total_entities: r.total_entities }));
  await recordEvent(admin, { organization_id: project.organization_id, project_id: project.id, module: 'radar', kind: stopped === 'teto_diario' ? 'radar.parada_no_teto' : 'radar.rodada_concluida', subject: { run_id: runId }, payload: { queries: done, new_competitors: newEntities, cost_micros_estimated: Math.round(spent), stopped } });
  return { run_id: runId, ok: true, queries_planned: plan.selected.length, queries_done: done, errors, cost_micros: Math.round(spent), cost_basis: 'estimado_pela_tabela_de_precos_e_resposta_do_provedor', new_entities: newEntities, total_entities: entitiesAfter, new_identities: persisted.identities, orphan_identities: book.stats.orphan_identities, pages: pages.size, listings: listings.size, skipped_covered: plan.skipped_covered, skipped_budget: plan.skipped_budget, stopped, stop_reason: stopReason, budget_micros: budget, day_remaining_micros: day?.remaining_micros ?? null, saturation: saturationOf(rounds), engines };
}
const ingestBase = (p: ProjectLite) => ({ organization_id: p.organization_id, project_id: p.id });

// ------------------------------------------------------------------------------------------------------------------ enriquecimento
export interface EnrichReport { scanned: number; blocked_by_robots: number; failed: number; links_found: number; relinked: number; authority_updated: number; youtube_updated: number; youtube: { status: 'ok' | 'sem_chave' | 'nao_habilitada' | 'cota' | 'chave_invalida' | 'erro'; message: string | null }; remaining_unscanned: number }
const SCAN_STALE_DAYS = 30;

/** Varre os concorrentes mais relevantes ainda não varridos (ou varridos há mais de 30 dias): site, schema, links de redes, autoridade estimada e YouTube. */
export async function enrichCompetitors(admin: Admin, deps: BatchDeps, project: ProjectLite, o: { limit?: number; ids?: string[]; speed?: boolean }): Promise<EnrichReport> {
  const t0 = deps.now(); const nowIso = new Date(t0).toISOString();
  const { snap, book } = await loadSnapshot(admin, project, t0);
  const report: EnrichReport = { scanned: 0, blocked_by_robots: 0, failed: 0, links_found: 0, relinked: 0, authority_updated: 0, youtube_updated: 0, youtube: { status: deps.youtubeKey ? 'ok' : 'sem_chave', message: deps.youtubeKey ? null : YT_KEY_MISSING_MESSAGE }, remaining_unscanned: 0 };
  const lastScan = new Map<string, number>();
  for (const [id, s] of snap.scans) lastScan.set(id, Date.parse(s.scanned_at) || 0);
  const freq = new Map<string, number>();
  for (const p of snap.pages) if (p.competitor_id) freq.set(p.competitor_id, (freq.get(p.competitor_id) ?? 0) + 1);
  const eligible = snap.competitors.filter((c) => !c.merged_into && c.status !== 'ignorado' && c.kind !== 'diretorio' && !!c.primary_host && (o.ids?.length ? o.ids.includes(c.id) : true));
  const due = eligible.filter((c) => o.ids?.length || !lastScan.get(c.id) || t0 - (lastScan.get(c.id) as number) > SCAN_STALE_DAYS * 86_400_000).sort((a, b) => Number(b.is_own) - Number(a.is_own) || (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0));
  const pick = due.slice(0, Math.max(1, Math.min(10, o.limit ?? 3)));
  report.remaining_unscanned = Math.max(0, due.length - pick.length);
  const scanDeps: ScanDeps = { fetchFn: deps.fetchFn, lookupA: deps.lookupA, now: deps.now, sleep: deps.sleep };
  const base = { organization_id: project.organization_id, project_id: project.id };
  for (const c of pick) {
    if (deps.now() - t0 > (deps.budgetMs ?? RUN_TIME_BUDGET_MS)) break;
    const scan = await scanSite(scanDeps, c.primary_host as string);
    if (scan.status === 'bloqueado_pelo_robots') report.blocked_by_robots++; else if (scan.status === 'erro') report.failed++; else report.scanned++;
    const ins = await admin.from('radar_site_scans').insert({ ...base, competitor_id: c.id, host: c.primary_host, scan, status: scan.status, error: scan.error, scanned_at: nowIso });
    if (ins.error) throw ins.error;
    report.links_found += ingestSiteLinks(book, c.id, scan.social.map((s) => ({ url: s.url, source: s.source })));
  }
  report.relinked = relinkOrphans(book);

  // autoridade estimada (Open PageRank): lote de domínios; falha de chave/IP não derruba o resto
  if (deps.oprKey && pick.length) {
    const url = buildOpenPageRankUrl(pick.map((c) => c.primary_host as string));
    if (url) {
      try {
        const r = await deps.fetchFn(url, { headers: { 'API-OPR': deps.oprKey, 'User-Agent': RADAR_UA } });
        if (r.ok) {
          const rows = parseOpenPageRank(await r.json().catch(() => null));
          for (const row of rows) { const c = pick.find((x) => x.primary_host === row.domain); if (!c || row.rank === null) continue; const u = await admin.from('radar_competitors').update({ authority: { ...(c.authority ?? {}), opr: row.rank, opr_global_rank: row.global_rank, opr_at: nowIso, label: 'estimado' } }).eq('id', c.id).eq('project_id', project.id); if (u.error) throw u.error; report.authority_updated++; }
        }
      } catch { /* sem autoridade desta vez: o score apenas fica sem esse componente */ }
    }
  }
  await persistBook(admin, project, book, nowIso);

  // YouTube: contagens públicas dos canais já ligados aos concorrentes (API oficial)
  if (deps.youtubeKey) {
    const chans = [...book.identities.values()].filter((i) => i.platform === 'youtube' && i.kind === 'canal' && /^UC[\w-]{20,24}$/.test(i.handle ?? ''));
    const url = buildYtChannelsUrl(chans.map((c) => c.handle as string), deps.youtubeKey);
    if (url) {
      try {
        const r = await deps.fetchFn(url, { headers: { 'User-Agent': RADAR_UA } });
        const json = await r.json().catch(() => null);
        const fail = parseYtError(r.status, json);
        if (fail) report.youtube = { status: fail.code === 'not_enabled' ? 'nao_habilitada' : fail.code === 'quota' ? 'cota' : fail.code === 'key_invalid' ? 'chave_invalida' : 'erro', message: fail.message };
        else report.youtube_updated = await storeYtChannels(admin, project, book, parseYtChannels(json), nowIso);
      } catch { report.youtube = { status: 'erro', message: 'Não consegui falar com a YouTube Data API agora.' }; }
    }
  }
  return report;
}

async function storeYtChannels(admin: Admin, project: ProjectLite, book: EntityBook, channels: ReturnType<typeof parseYtChannels>, nowIso: string): Promise<number> {
  let n = 0;
  for (const ch of channels) {
    const idn = [...book.identities.values()].find((i) => i.platform === 'youtube' && i.handle === ch.id);
    if (!idn) continue;
    const metrics = { subscribers: ch.subscribers, videos: ch.videos, views: ch.views };
    const u = await admin.from('radar_identities').update({ metrics, metrics_label: 'api_oficial', metrics_source: 'YouTube Data API v3 (channels.list)', metrics_at: nowIso }).eq('id', idn.id).eq('project_id', project.id);
    if (u.error) throw u.error;
    const h = await admin.from('radar_identity_metrics').insert({ organization_id: project.organization_id, project_id: project.id, identity_id: idn.id, observed_at: nowIso, metrics, label: 'api_oficial', source: 'YouTube Data API v3' });
    if (h.error) throw h.error;
    n++;
  }
  return n;
}

// ------------------------------------------------------------------------------------------------------------------ YouTube: descoberta por Foco x território
export interface YtDiscoverReport { status: 'ok' | 'sem_chave' | 'nao_habilitada' | 'cota' | 'chave_invalida' | 'erro'; message: string | null; searches: number; channels: number; videos: number; new_entities: number }
export async function youtubeDiscover(admin: Admin, deps: BatchDeps, project: ProjectLite, o: { focusId?: string | null; maxSearches?: number }): Promise<YtDiscoverReport> {
  const out: YtDiscoverReport = { status: 'ok', message: null, searches: 0, channels: 0, videos: 0, new_entities: 0 };
  if (!deps.youtubeKey) return { ...out, status: 'sem_chave', message: YT_KEY_MISSING_MESSAGE };
  const t0 = deps.now(); const nowIso = new Date(t0).toISOString();
  const { snap, book } = await loadSnapshot(admin, project, t0);
  const inputs = await loadFocusInputs(admin, snap, project.id);
  const grid = generateTasks(o.focusId ? inputs.focuses.filter((f) => f.id === o.focusId) : inputs.focuses, inputs.focusPlaces, buildPlaceIndex([...snap.places.values()]), { engines: ['serper'], units: DEFAULT_PRICE_BOOK.units });
  const seen = new Set<string>(); const picks: DiscoveryTask[] = [];
  for (const t of grid.tasks) { if (t.modality !== 'web') continue; const k = `${t.focusId}|${t.placeId}|${t.topic}`; if (seen.has(k)) continue; seen.add(k); picks.push(t); if (picks.length >= Math.max(1, Math.min(10, o.maxSearches ?? 4))) break; }
  const before = [...book.entities.values()].filter((e) => e.isNew).length;
  const channelIds = new Map<string, { t: DiscoveryTask; title: string }>(); const videos: Array<{ t: DiscoveryTask; v: ReturnType<typeof parseYtSearch>[number] }> = [];
  for (const t of picks) {
    const url = buildYtSearchUrl({ q: t.query, type: 'channel', key: deps.youtubeKey, regionCode: t.country, relevanceLanguage: t.language, maxResults: 10 });
    const vurl = buildYtSearchUrl({ q: t.query, type: 'video', key: deps.youtubeKey, regionCode: t.country, relevanceLanguage: t.language, maxResults: 10 });
    for (const u of [url, vurl]) {
      if (!u) continue;
      const r = await deps.fetchFn(u, { headers: { 'User-Agent': RADAR_UA } }); const json = await r.json().catch(() => null); out.searches++;
      const f = parseYtError(r.status, json);
      if (f) return { ...out, status: f.code === 'not_enabled' ? 'nao_habilitada' : f.code === 'quota' ? 'cota' : f.code === 'key_invalid' ? 'chave_invalida' : 'erro', message: f.message };
      for (const it of parseYtSearch(json)) { if (it.kind === 'canal') channelIds.set(it.id, { t, title: it.title }); else { videos.push({ t, v: it }); if (it.channelId && !channelIds.has(it.channelId)) channelIds.set(it.channelId, { t, title: '' }); } }
    }
  }
  const cUrl = buildYtChannelsUrl([...channelIds.keys()], deps.youtubeKey);
  const chans: ReturnType<typeof parseYtChannels> = [];
  if (cUrl) { const r = await deps.fetchFn(cUrl, { headers: { 'User-Agent': RADAR_UA } }); const json = await r.json().catch(() => null); const f = parseYtError(r.status, json); if (f) return { ...out, status: f.code === 'not_enabled' ? 'nao_habilitada' : f.code === 'quota' ? 'cota' : 'erro', message: f.message }; chans.push(...parseYtChannels(json)); }
  const vUrl = buildYtVideosUrl(videos.map((x) => x.v.id), deps.youtubeKey);
  let vids: ReturnType<typeof parseYtVideos> = [];
  if (vUrl) { const r = await deps.fetchFn(vUrl, { headers: { 'User-Agent': RADAR_UA } }); vids = parseYtVideos(await r.json().catch(() => null)); }
  const cadence = new Map<string, ReturnType<typeof postingCadence>>();
  for (const ch of chans) cadence.set(ch.id, postingCadence(vids.filter((v) => v.channelId === ch.id).map((v) => v.published_at), t0));
  for (const ch of chans) {
    const src = channelIds.get(ch.id); if (!src) continue;
    const ing = ingestHit(book, { kind: 'organico', position: 1, url: `https://www.youtube.com/channel/${ch.id}`, title: ch.title, snippet: null, date: null, source: null }, { engine: 'youtube_api', modality: 'social', focusId: src.t.focusId, placeId: src.t.placeId, nodeId: src.t.nodeId, queryKey: src.t.key });
    if (ing.entityId === null && ing.identityKey) { /* órfã: vai ao Livro de pontas soltas */ }
    out.channels++;
  }
  relinkOrphans(book);
  await persistBook(admin, project, book, nowIso);
  for (const ch of chans) {
    const idn = [...book.identities.values()].find((i) => i.platform === 'youtube' && i.handle === ch.id);
    if (!idn) continue;
    const cad = cadence.get(ch.id);
    const metrics = { subscribers: ch.subscribers, videos: ch.videos, views: ch.views, last_30d: cad?.last_30d ?? 0, last_90d: cad?.last_90d ?? 0, days_since_last: cad?.days_since_last ?? null };
    const u = await admin.from('radar_identities').update({ metrics, metrics_label: 'api_oficial', metrics_source: 'YouTube Data API v3 (search.list + channels.list)', metrics_at: nowIso }).eq('id', idn.id).eq('project_id', project.id);
    if (u.error) throw u.error;
    const h = await admin.from('radar_identity_metrics').insert({ organization_id: project.organization_id, project_id: project.id, identity_id: idn.id, observed_at: nowIso, metrics, label: 'api_oficial', source: 'YouTube Data API v3' });
    if (h.error) throw h.error;
    if (idn.competitor_id) { const src = channelIds.get(ch.id)!; const live = liveEntity(book, idn.competitor_id); if (live) await ensureLink(admin, project, linkKeys((await loadAll<{ competitor_id: string; focus_id: string | null; place_id: string | null; node_id: string | null }>(admin, 'radar_links', 'competitor_id,focus_id,place_id,node_id', { col: 'project_id', val: project.id }, UNBOUNDED)).rows), { competitor_id: live.id, focus_id: src.t.focusId, place_id: src.t.placeId, node_id: src.t.nodeId, source: 'busca' }); }
  }
  const rows = vids.map((v) => { const src = videos.find((x) => x.v.id === v.id); return src ? { organization_id: project.organization_id, project_id: project.id, competitor_id: [...book.identities.values()].find((i) => i.platform === 'youtube' && i.handle === v.channelId)?.competitor_id ?? null, focus_id: src.t.focusId, place_id: src.t.placeId, node_id: src.t.nodeId, url: `https://www.youtube.com/watch?v=${v.id}`, host: 'youtube.com', title: v.title, snippet: null, position: null, modality: 'videos', engine: 'youtube_api', page_type: 'video', query_key: src.t.key, seen_at: nowIso } : null; }).filter((r): r is NonNullable<typeof r> => !!r);
  for (const part of chunk(rows, 300)) { const r = await admin.from('radar_pages').upsert(part, { onConflict: 'project_id,url,engine,modality,query_key' }); if (r.error) throw r.error; }
  out.videos = rows.length;
  out.new_entities = [...book.entities.values()].length - before;
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ backlinks pagos (opcional)
export async function fetchBacklinkSummaries(admin: Admin, deps: BatchDeps, project: ProjectLite, ids: string[]): Promise<{ ok: boolean; updated: number; stopped: string | null; error?: string }> {
  const secret = await (async () => { try { return await deps.readSecret(project.organization_id, 'dataforseo'); } catch { return null; } })();
  if (!secret) return { ok: false, updated: 0, stopped: null, error: 'radar_no_provider_key' };
  const comps = (await loadAll<{ id: string; primary_host: string | null; authority: Record<string, unknown> }>(admin, 'radar_competitors', 'id,primary_host,authority', { col: 'project_id', val: project.id }, UNBOUNDED)).rows.filter((c) => ids.includes(c.id) && c.primary_host).slice(0, 10);
  let updated = 0;
  for (const c of comps) {
    const call = buildDfsBacklinksCall(c.primary_host as string, secret); if (!call) continue;
    try {
      const res = await deps.paidFetch(call.url, call.init); if (!res.ok) continue;
      const s = parseDfsBacklinks(await res.json().catch(() => null)); if (!s) continue;
      const u = await admin.from('radar_competitors').update({ authority: { ...(c.authority ?? {}), backlinks: s.backlinks, referring_domains: s.referring_domains, dfs_rank: s.rank, backlinks_at: new Date(deps.now()).toISOString(), backlinks_source: 'DataForSEO Backlinks (pago)' } }).eq('id', c.id).eq('project_id', project.id);
      if (u.error) throw u.error; updated++;
    } catch (e) { if (isSpendDenied(e)) return { ok: true, updated, stopped: denyCode(e) }; }
  }
  return { ok: true, updated, stopped: null };
}

// ------------------------------------------------------------------------------------------------------------------ placar semanal
const ZERO = '00000000-0000-0000-0000-000000000000';
export interface ScoreHistoryPoint { week: string; score: number | null }
export async function scoreHistory(admin: Admin, projectId: string): Promise<Map<string, ScoreHistoryPoint[]>> {
  const rows = (await loadAll<{ week: string; subject: string; competitor_id: string | null; focus_id: string | null; place_id: string | null; node_id: string | null; score: number | null }>(admin, 'radar_scores', 'week,subject,competitor_id,focus_id,place_id,node_id,score', { col: 'project_id', val: projectId }, 50000)).rows;
  const m = new Map<string, ScoreHistoryPoint[]>();
  for (const r of rows) { const k = `${r.competitor_id ?? ''}|${r.focus_id ?? ''}|${r.place_id ?? ''}|${r.node_id ?? ''}`; m.set(k, [...(m.get(k) ?? []), { week: String(r.week), score: r.score === null ? null : Number(r.score) }]); }
  return m;
}
export const historyKey = (competitorId: string, s: Scope) => `${competitorId}|${s.focus_id ?? ''}|${s.place_id ?? ''}|${s.node_id ?? ''}`;

/** Guarda a foto da semana: por Foco (todos os concorrentes e nós) e por Foco x território (os 10 melhores de cada Foco que têm dado). Reexecutar na mesma semana substitui. */
export async function storeScoreSnapshot(admin: Admin, project: ProjectLite, snap: Snapshot, nowMs: number): Promise<{ week: string; rows: number }> {
  const week = weekKey(nowMs);
  const rows: Array<Record<string, unknown>> = [];
  const push = (s: Scope, r: ReturnType<typeof scoreBoard>[number]) => rows.push({ organization_id: project.organization_id, project_id: project.id, week, subject: r.competitor.is_own ? 'nos' : 'concorrente', competitor_id: r.competitor.id, focus_id: s.focus_id, place_id: s.place_id, node_id: s.node_id ?? null, score: r.result.score, coverage: r.result.coverage, components: r.result.components, label: 'estimado' });
  for (const f of snap.focuses.filter((x) => x.status === 'ativo')) {
    const top = scoreBoard(snap, { focus_id: f.id, place_id: null });
    top.forEach((r) => push({ focus_id: f.id, place_id: null }, r));
    const keep = top.filter((r) => r.result.score !== null).slice(0, 10).map((r) => r.competitor.id);
    for (const fp of snap.focusPlaces.filter((p) => p.focus_id === f.id && p.status !== 'rejeitado')) {
      if (!snap.coverage.some((c) => c.focus_id === f.id && c.place_id === fp.place_id && c.status === 'consultada')) continue;
      scoreBoard(snap, { focus_id: f.id, place_id: fp.place_id }).filter((r) => keep.includes(r.competitor.id) || r.competitor.is_own).forEach((r) => push({ focus_id: f.id, place_id: fp.place_id }, r));
    }
  }
  const existing = (await loadAll<{ id: string; competitor_id: string | null; focus_id: string | null; place_id: string | null; node_id: string | null; week: string }>(admin, 'radar_scores', 'id,competitor_id,focus_id,place_id,node_id,week', { col: 'project_id', val: project.id }, 50000)).rows.filter((r) => String(r.week) === week);
  const idOf = new Map(existing.map((r) => [`${r.competitor_id ?? ZERO}|${r.focus_id ?? ZERO}|${r.place_id ?? ZERO}|${r.node_id ?? ZERO}`, r.id]));
  const fresh: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const k = `${r.competitor_id ?? ZERO}|${r.focus_id ?? ZERO}|${r.place_id ?? ZERO}|${r.node_id ?? ZERO}`;
    const id = idOf.get(k);
    if (id) { const u = await admin.from('radar_scores').update({ score: r.score, coverage: r.coverage, components: r.components }).eq('id', id).eq('project_id', project.id); if (u.error) throw u.error; } else fresh.push(r);
  }
  for (const part of chunk(fresh, 300)) { const r = await admin.from('radar_scores').insert(part); if (r.error) throw r.error; }
  return { week, rows: rows.length };
}

export { estimateTaskMicros, coverageSummary };
