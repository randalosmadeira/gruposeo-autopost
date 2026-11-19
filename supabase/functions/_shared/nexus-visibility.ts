/**
 * NEXUS · Visibilidade: ações da Edge Function `nexus-visibility` (13/11/2026), sem rede e sem banco: o acesso a dados é injetável
 * (`VisibilityStore`) e a autorização do visualizador chega pronta (`viewer`). A função (index.ts) só autentica, aplica o portão de projeto
 * e liga o store ao Supabase; toda a regra de negócio e os envelopes de resposta ficam aqui, testáveis.
 * Envelopes: docs/NEXUS_VISIBILITY.md.
 */
import { isUuid } from './nexus-management.ts';
import {
  aggregateQuestions, buildChanges, buildOpportunities, COMPONENT_DOCS, computeSourceScores, engineInfo, engineLabel, enginesFor, extractKeywords, METHOD_LABEL,
  METHOD_NOTES, METHOD_VERSION, MIN_RANK_N, normalizeDomain, ownCited, rankCompetitors, round, selectTargets, SOURCE_TYPES, splitObservations, suggestCompetitors, summarizeVisibility,
  trackedHits, buildTrackedIndex, ZSS_WEIGHTS, cleanBrandName, brandKey,
  type Observation, type ObsCitation, type ObsCompetitor, type SourceCitation, type SourceType, type TrackedCompetitor, type VisibilitySummary,
} from './nexus-zvi.ts';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export const COMPETITOR_KINDS = ['escritorio', 'advogado_individual', 'portal', 'outro'] as const;
export const COMPETITOR_STATUSES = ['suggested', 'tracked', 'ignored'] as const;
export type CompetitorKind = typeof COMPETITOR_KINDS[number];
export type CompetitorStatus = typeof COMPETITOR_STATUSES[number];
export type CompetitorRow = { id: string; name: string; domains: string[]; kind: string; status: string; source: string; created_at: string; updated_at: string };
export type ObsBundle = { observations: Observation[]; own_aliases: string[]; own_hosts: string[]; truncated: boolean };
export type HistoryRaw = {
  observed_at: string; engine: string; country: string | null; mentioned: boolean | null; cited: boolean | null; personalization_risk: boolean;
  answer_excerpt: string | null; citations: ObsCitation[]; competitors: ObsCompetitor[];
};
export type UpsertInput = { id: string | null; name: string; domains: string[]; kind: CompetitorKind; status: CompetitorStatus };
export type UpsertResult = { ok: true; competitor: CompetitorRow } | { ok: false; error: string; status: number };
export type Ga4Result = { sessions: number; ai_sessions: number; key_events: number };
export type GscResult = { clicks: number; impressions: number };

export interface VisibilityStore {
  observations(a: { from: string; to: string; engines: string[] | null; topic: string | null; limit: number }): Promise<ObsBundle>;
  history(a: { query: string; engines: string[] | null; limit: number }): Promise<HistoryRaw[]>;
  competitors(): Promise<CompetitorRow[]>;
  upsertCompetitor(input: UpsertInput, actorId: string): Promise<UpsertResult>;
  removeCompetitor(id: string): Promise<boolean>;
  prompts(): Promise<Array<{ query: string }>>;
  gsc(from: string, to: string): Promise<GscResult | null>;
  ga4(from: string, to: string): Promise<Ga4Result | null>;
}
export type VisibilityDeps = {
  store: VisibilityStore;
  viewer: { role: string; can_manage_technical: boolean };
  nowMs: number;
  /** Nome da marca do projeto (para o ranking). */
  brandName: string;
  actorId: string;
};
export type Reply = { status: number; body: Record<string, unknown> };

export const READ_ACTIONS = ['overview', 'sources', 'competitors', 'questions', 'question_history', 'keywords', 'opportunities', 'methodology'] as const;
export const WRITE_ACTIONS = ['competitor_upsert', 'competitor_remove'] as const;
export const VISIBILITY_ACTIONS: readonly string[] = [...READ_ACTIONS, ...WRITE_ACTIONS];
export const MAX_OBSERVATIONS = 20_000;
export const MAX_PERIOD_DAYS = 366;

const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const ok = (body: Record<string, unknown>, nowMs: number): Reply => ({ status: 200, body: { ...body, generated_at: new Date(nowMs).toISOString() } });

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
/** Período em UTC, inclusivo. Padrão: os últimos 28 dias terminando hoje. Máximo de 366 dias. */
export function parsePeriod(body: Record<string, unknown>, nowMs: number): Parsed<{ from: string; to: string; days: number }> {
  if (body.to !== undefined && body.to !== null && !isDay(body.to)) return { ok: false, error: 'period_invalid' };
  if (body.from !== undefined && body.from !== null && !isDay(body.from)) return { ok: false, error: 'period_invalid' };
  const to = isDay(body.to) ? body.to : new Date(nowMs).toISOString().slice(0, 10);
  const from = isDay(body.from) ? body.from : addDays(to, -27);
  const days = daysBetween(from, to) + 1;
  if (from > to || days > MAX_PERIOD_DAYS) return { ok: false, error: 'period_invalid' };
  return { ok: true, value: { from, to, days } };
}

function optText(v: unknown, max: number, error: string): Parsed<string | null> {
  if (v === undefined || v === null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error };
  const t = v.trim();
  if (!t) return { ok: true, value: null };
  return t.length > max ? { ok: false, error } : { ok: true, value: t };
}
function optEngine(v: unknown): Parsed<string[] | null> {
  const t = optText(v, 40, 'engine_invalid');
  if (!t.ok) return t;
  if (t.value === null) return { ok: true, value: null };
  if (!/^[a-z0-9_]{1,40}$/i.test(t.value)) return { ok: false, error: 'engine_invalid' };
  return { ok: true, value: enginesFor(t.value) };
}
function optInt(v: unknown, min: number, max: number, def: number, error: string): Parsed<number> {
  if (v === undefined || v === null || v === '') return { ok: true, value: def };
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, error };
  return { ok: true, value: n };
}

export function parseCompetitorInput(body: Record<string, unknown>): Parsed<UpsertInput> {
  let id: string | null = null;
  if (body.id !== undefined && body.id !== null && body.id !== '') {
    if (!isUuid(body.id)) return { ok: false, error: 'id_invalid' };
    id = body.id;
  }
  if (typeof body.name !== 'string') return { ok: false, error: 'name_invalid' };
  const name = body.name.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 160) return { ok: false, error: 'name_invalid' };
  if (!Array.isArray(body.domains) || body.domains.length > 10) return { ok: false, error: 'domains_invalid' };
  const domains: string[] = [];
  for (const raw of body.domains) {
    const d = normalizeDomain(raw);
    if (!d) return { ok: false, error: 'domains_invalid' };
    if (!domains.includes(d)) domains.push(d);
  }
  if (typeof body.kind !== 'string' || !(COMPETITOR_KINDS as readonly string[]).includes(body.kind)) return { ok: false, error: 'kind_invalid' };
  if (typeof body.status !== 'string' || !(COMPETITOR_STATUSES as readonly string[]).includes(body.status)) return { ok: false, error: 'status_invalid' };
  return { ok: true, value: { id, name, domains, kind: body.kind as CompetitorKind, status: body.status as CompetitorStatus } };
}

// ---------------------------------------------------------------------------
// Normalização tolerante do que vem do banco
// ---------------------------------------------------------------------------
const asBool = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);
const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
function normCitations(v: unknown): ObsCitation[] {
  if (!Array.isArray(v)) return [];
  const out: ObsCitation[] = [];
  for (const c of v) {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const host = asStr(o.host);
    if (!host) continue;
    out.push({ host: host.toLowerCase().replace(/^www\./, ''), url: asStr(o.url) ?? '', position: asNum(o.position), is_own: o.is_own === true });
  }
  return out;
}
function normCompetitors(v: unknown): ObsCompetitor[] {
  if (!Array.isArray(v)) return [];
  const out: ObsCompetitor[] = [];
  for (const c of v) {
    const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const name = asStr(o.name);
    if (name) out.push({ name, host: asStr(o.host), source: asStr(o.source) ?? 'mention' });
  }
  return out;
}
export function normalizeBundle(raw: unknown): ObsBundle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const observations: Observation[] = [];
  for (const item of Array.isArray(r.observations) ? r.observations : []) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const observed_at = isoOrNull(o.observed_at);
    if (!observed_at || typeof o.id !== 'string') continue;
    observations.push({
      id: o.id, engine: asStr(o.engine) ?? 'desconhecido', country: asStr(o.country), query: asStr(o.query), topic: asStr(o.topic), intent: asStr(o.intent),
      repetition: asNum(o.repetition), observed_at, mentioned: asBool(o.mentioned), cited: asBool(o.cited), personalization_risk: o.personalization_risk === true,
      citations: normCitations(o.citations), competitors: normCompetitors(o.competitors),
    });
  }
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
  return { observations, own_aliases: strings(r.own_aliases), own_hosts: strings(r.own_hosts), truncated: r.truncated === true };
}
export function normalizeHistory(raw: unknown): HistoryRaw[] {
  const out: HistoryRaw[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const observed_at = isoOrNull(o.observed_at);
    if (!observed_at) continue;
    out.push({
      observed_at, engine: asStr(o.engine) ?? 'desconhecido', country: asStr(o.country), mentioned: asBool(o.mentioned), cited: asBool(o.cited), personalization_risk: o.personalization_risk === true,
      answer_excerpt: asStr(o.answer_excerpt), citations: normCitations(o.citations), competitors: normCompetitors(o.competitors),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auxiliares de resposta
// ---------------------------------------------------------------------------
const dayOf = (iso: string) => iso.slice(0, 10);
const r4 = (v: number | null) => round(v, 4);
const r1 = (v: number | null) => round(v, 1);
const toTracked = (rows: CompetitorRow[]): TrackedCompetitor[] => rows.map((c) => ({ id: c.id, name: c.name, domains: c.domains, kind: c.kind }));
const tracked = (rows: CompetitorRow[]) => rows.filter((c) => c.status === 'tracked');

function publicCompetitor(c: CompetitorRow) {
  return { id: c.id, name: c.name, domains: c.domains, kind: c.kind, status: c.status, source: c.source, created_at: c.created_at, updated_at: c.updated_at };
}
function zviView(s: VisibilitySummary) {
  return { value: r1(s.zvi.value), low: r1(s.zvi.low), high: r1(s.zvi.high), partial: s.zvi.partial, missing: s.zvi.missing as string[], confidence: s.zvi.confidence };
}
function indicatorsView(s: VisibilitySummary) {
  const i = s.indicators;
  return {
    vr: { value: r4(i.vr.value), low: r4(i.vr.low), high: r4(i.vr.high), n: i.vr.n },
    cr: { value: r4(i.cr.value), low: r4(i.cr.low), high: r4(i.cr.high), n: i.cr.n },
    sov: { value: r4(i.sov.value), n: i.sov.n },
    est: { value: r4(i.est.value), n: i.est.n },
    pm: null, rep: null,
  };
}

type Window = { cur: Observation[]; prev: Observation[]; truncated: boolean; bundle: ObsBundle };
async function loadWindow(deps: VisibilityDeps, period: { from: string; to: string; days: number }, filters: { engines: string[] | null; topic: string | null }, withPrevious: boolean): Promise<Window> {
  const prevTo = addDays(period.from, -1);
  const prevFrom = addDays(prevTo, -(period.days - 1));
  const bundle = await deps.store.observations({ from: withPrevious ? prevFrom : period.from, to: period.to, engines: filters.engines, topic: filters.topic, limit: MAX_OBSERVATIONS });
  const cur: Observation[] = [], prev: Observation[] = [];
  for (const o of bundle.observations) (dayOf(o.observed_at) >= period.from ? cur : prev).push(o);
  return { cur, prev, truncated: bundle.truncated, bundle };
}

function sourceCitationsOf(valid: Observation[]): SourceCitation[] {
  const out: SourceCitation[] = [];
  for (const o of valid) {
    const present = o.mentioned === true || ownCited(o);
    for (const c of o.citations) out.push({ obs_id: o.id, host: c.host, url: c.url, engine: o.engine, query: o.query, topic: o.topic, position: c.position, is_own: c.is_own, observed_at: o.observed_at, brand_present: present });
  }
  return out;
}

/** Fontes (ZSS) e alvos de presença de um conjunto de observações. Domínios de concorrentes (cadastrados ou inferidos nas sugestões) viram "escritório". */
function sourcesFor(valid: Observation[], bundle: ObsBundle, rows: CompetitorRow[], brandName: string, nowMs: number) {
  const trackedRows = tracked(rows);
  const suggestions = suggestCompetitors(valid, { ownAliases: [...bundle.own_aliases, brandName], ownHosts: bundle.own_hosts, known: toTracked(rows.filter((c) => c.status !== 'suggested')) });
  const competitorDomains = [...new Set([...trackedRows.flatMap((c) => c.domains), ...suggestions.map((s) => s.domain).filter((d): d is string => !!d)])];
  const queries = new Set(valid.map((o) => (o.query ?? '').trim().toLowerCase()).filter(Boolean));
  const engines = new Set(valid.map((o) => engineInfo(o.engine).id));
  const sources = computeSourceScores(sourceCitationsOf(valid), { nowMs, totalQueries: queries.size, activeEngines: engines.size, competitorDomains, ownHosts: bundle.own_hosts });
  return { sources, targets: selectTargets(sources, { competitorDomains }), suggestions, competitorDomains };
}

const method = () => ({ version: METHOD_VERSION, label: METHOD_LABEL });

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
export async function handleVisibilityAction(action: string, body: Record<string, unknown>, deps: VisibilityDeps): Promise<Reply> {
  const now = deps.nowMs;
  if (action === 'competitor_upsert' || action === 'competitor_remove') {
    if (!deps.viewer.can_manage_technical) return fail(403, 'manager_required');
    if (action === 'competitor_remove') {
      if (!isUuid(body.id)) return fail(400, 'id_invalid');
      return (await deps.store.removeCompetitor(body.id)) ? ok({ ok: true }, now) : fail(404, 'competitor_not_found');
    }
    const parsed = parseCompetitorInput(body);
    if (!parsed.ok) return fail(400, parsed.error);
    const res = await deps.store.upsertCompetitor(parsed.value, deps.actorId);
    return res.ok ? ok({ competitor: publicCompetitor(res.competitor) }, now) : fail(res.status, res.error);
  }

  if (action === 'methodology') {
    return ok({
      version: METHOD_VERSION, label: METHOD_LABEL,
      components: COMPONENT_DOCS.map((c) => ({ id: c.id, label: c.label, weight: c.weight, description: c.description })),
      notes: METHOD_NOTES,
      source_index: { name: 'Índice Zica de Fonte (ZSS)', weights: ZSS_WEIGHTS, half_life_days: 30 },
    }, now);
  }

  if (action === 'question_history') {
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > 500) return fail(400, 'query_required');
    const engines = optEngine(body.engine); if (!engines.ok) return fail(400, engines.error);
    const limit = optInt(body.limit, 1, 100, 50, 'limit_invalid'); if (!limit.ok) return fail(400, limit.error);
    const raw = await deps.store.history({ query, engines: engines.value, limit: limit.value });
    const items = raw.map((h) => {
      const own = h.citations.filter((c) => c.is_own).map((c) => c.position).filter((p): p is number => p !== null);
      const brands: string[] = [];
      const seen = new Set<string>();
      const add = (n: string) => { const k = brandKey(n) || n.toLowerCase(); if (!seen.has(k)) { seen.add(k); brands.push(n); } };
      if (h.mentioned === true) add(deps.brandName);
      for (const c of h.competitors) { const n = cleanBrandName(c.name); if (n) add(n); }
      const e = engineInfo(h.engine);
      return {
        observed_at: h.observed_at, engine: e.id, engine_label: e.label, country: h.country,
        mentioned: h.mentioned, cited: h.cited === true || h.citations.some((c) => c.is_own),
        position: own.length ? Math.min(...own) : null, brands,
        sources: h.citations.slice(0, 20).map((c) => ({ host: c.host, url: c.url })),
        response_excerpt: h.answer_excerpt,
        counted: h.mentioned !== null && !h.personalization_risk,
        note: h.personalization_risk ? 'Observação feita com a conta logada do titular: pode estar influenciada por histórico pessoal e não entra no índice.' : h.mentioned === null ? 'A observação não informa se a marca foi mencionada.' : null,
      };
    });
    return ok({ query, items }, now);
  }

  // As demais ações leem observações de um período.
  const period = parsePeriod(body, now);
  if (!period.ok) return fail(400, period.error);
  const rows = await deps.store.competitors();
  const trackedList = toTracked(tracked(rows));

  if (action === 'overview') {
    const engines = optEngine(body.engine); if (!engines.ok) return fail(400, engines.error);
    const topic = optText(body.topic, 120, 'topic_invalid'); if (!topic.ok) return fail(400, topic.error);
    const [win, ga4, gsc] = await Promise.all([
      loadWindow(deps, period.value, { engines: engines.value, topic: topic.value }, true),
      deps.store.ga4(period.value.from, period.value.to),
      deps.store.gsc(period.value.from, period.value.to),
    ]);
    const opts = { tracked: trackedList };
    const cur = summarizeVisibility(win.cur, opts);
    const prev = win.prev.length ? summarizeVisibility(win.prev, { ...opts, interval: false }) : null;
    const prevView = prev && prev.n > 0 ? { zvi: r1(prev.zvi.value), vr: r4(prev.indicators.vr.value), cr: r4(prev.indicators.cr.value), n: prev.n } : null;
    const byEngine = new Map<string, { vr: number; cr: number; n: number }>();
    for (const o of win.cur) byEngine.set(engineInfo(o.engine).id, byEngine.get(engineInfo(o.engine).id) ?? { vr: 0, cr: 0, n: 0 });
    for (const o of splitObservations(win.cur).valid) {
      const g = byEngine.get(engineInfo(o.engine).id)!;
      g.n++; if (o.mentioned === true) g.vr++; if (ownCited(o)) g.cr++;
    }
    const days = new Map<string, { vr: number; cr: number; n: number }>();
    for (const o of splitObservations(win.cur).valid) {
      const g = days.get(dayOf(o.observed_at)) ?? { vr: 0, cr: 0, n: 0 };
      g.n++; if (o.mentioned === true) g.vr++; if (ownCited(o)) g.cr++;
      days.set(dayOf(o.observed_at), g);
    }
    const changes = buildChanges({ current: cur, previous: prevView ? prev : null, currentObs: win.cur, previousObs: win.prev });
    return ok({
      method: method(),
      period: { from: period.value.from, to: period.value.to },
      n_observations: cur.n,
      zvi: zviView(cur),
      indicators: indicatorsView(cur),
      previous: prevView,
      by_engine: [...byEngine.entries()]
        .map(([id, g]) => ({ engine: id, label: engineLabel(id), vr: r4(g.n ? g.vr / g.n : null), cr: r4(g.n ? g.cr / g.n : null), n: g.n }))
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR')),
      trend: [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, g]) => ({ day, vr: r4(g.vr / g.n), cr: r4(g.cr / g.n), n: g.n })),
      changes,
      result: {
        ga4: ga4 ? { sessions: ga4.sessions, ai_sessions: ga4.ai_sessions, key_events: ga4.key_events } : null,
        gsc: gsc ? { clicks: gsc.clicks, impressions: gsc.impressions } : null,
      },
      viewer: { role: deps.viewer.role, can_manage_technical: deps.viewer.can_manage_technical },
      quality: { observations_total: win.cur.length, excluded_personalization: cur.indicators.excluded.personalization, excluded_unmeasured: cur.indicators.excluded.unmeasured },
      truncated: win.truncated,
    }, now);
  }

  if (action === 'sources') {
    const type = optText(body.type, 30, 'type_invalid'); if (!type.ok) return fail(400, type.error);
    if (type.value !== null && !(SOURCE_TYPES as readonly string[]).includes(type.value)) return fail(400, 'type_invalid');
    const limit = optInt(body.limit, 1, 200, 50, 'limit_invalid'); if (!limit.ok) return fail(400, limit.error);
    const win = await loadWindow(deps, period.value, { engines: null, topic: null }, false);
    const valid = splitObservations(win.cur).valid;
    const { sources, targets } = sourcesFor(valid, win.bundle, rows, deps.brandName, now);
    const filtered = type.value ? sources.filter((s) => s.type === (type.value as SourceType)) : sources;
    return ok({
      method: method(),
      sources: filtered.slice(0, limit.value).map((s) => ({
        host: s.host, type: s.type, zss: s.zss, coverage: s.coverage, position: s.position, diversity: s.diversity, recency: s.recency, relevance: s.relevance,
        citations: s.citations, queries: s.queries, engines: s.engines.map(engineLabel), is_own: s.is_own, last_seen: s.last_seen, brand_present: s.brand_present,
      })),
      targets, total: filtered.length, n_observations: valid.length, truncated: win.truncated,
    }, now);
  }

  if (action === 'competitors') {
    const win = await loadWindow(deps, period.value, { engines: null, topic: null }, false);
    const valid = splitObservations(win.cur).valid;
    const n = valid.length;
    const idx = buildTrackedIndex(trackedList);
    const counts = new Array<number>(trackedList.length).fill(0);
    let own = 0;
    for (const o of valid) {
      if (o.mentioned === true) own++;
      for (const i of trackedHits(o, idx)) counts[i]++;
    }
    const brand = deps.brandName || 'Marca';
    const ranking = rankCompetitors({ own: { name: brand, mentions: own }, competitors: trackedList.map((t, i) => ({ id: t.id, name: t.name, mentions: counts[i] })), n });
    const byId = new Map(ranking.filter((r) => r.id).map((r) => [r.id as string, r]));
    const trackedRows = tracked(rows);
    const ownRow = ranking.find((r) => r.is_own)!;
    // Sugestões: calculadas na leitura. Não voltam as já cadastradas (acompanhadas ou ignoradas).
    const known = toTracked(rows.filter((c) => c.status !== 'suggested'));
    const auto = suggestCompetitors(valid, { ownAliases: [...win.bundle.own_aliases, brand], ownHosts: win.bundle.own_hosts, known });
    const autoKeys = new Set(auto.map((s) => brandKey(s.name)));
    const persisted = rows.filter((c) => c.status === 'suggested' && !autoKeys.has(brandKey(c.name))).map((c) => {
      const t = buildTrackedIndex([{ name: c.name, domains: c.domains }]);
      let mentions = 0; const eng = new Set<string>();
      for (const o of valid) if (trackedHits(o, t).size) { mentions++; eng.add(engineInfo(o.engine).id); }
      return { name: c.name, domain: c.domains[0] ?? null, mentions, engines: [...eng].sort(), kind: c.kind, reason: 'Cadastrado como sugestão pelo gestor.' };
    });
    const suggested = [...auto, ...persisted].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, 'pt-BR'));
    return ok({
      method: method(),
      tracked: trackedRows.map((c) => {
        const r = byId.get(c.id)!;
        return { id: c.id, name: c.name, domains: c.domains, kind: c.kind, vr: r4(r.vr), sov: r4(r.sov), mentions: r.mentions, n: r.n, insufficient_sample: r.insufficient_sample };
      }),
      suggested: suggested.map((s) => ({ name: s.name, domain: s.domain, mentions: s.mentions, engines: s.engines.map(engineLabel), reason: s.reason, kind: s.kind })),
      own: { name: brand, vr: r4(ownRow.vr), sov: r4(ownRow.sov), n: ownRow.n, mentions: ownRow.mentions },
      ranking: ranking.map((r) => ({ rank: r.rank, name: r.name, is_own: r.is_own, vr: r4(r.vr), sov: r4(r.sov), n: r.n, mentions: r.mentions, insufficient_sample: r.insufficient_sample })),
      ignored: deps.viewer.can_manage_technical ? rows.filter((c) => c.status === 'ignored').map((c) => ({ id: c.id, name: c.name, domains: c.domains, kind: c.kind })) : [],
      viewer: { role: deps.viewer.role, can_manage_technical: deps.viewer.can_manage_technical },
      min_rank_n: MIN_RANK_N, n_observations: n, truncated: win.truncated,
    }, now);
  }

  if (action === 'questions' || action === 'keywords' || action === 'opportunities') {
    const topic = optText(body.topic, 120, 'topic_invalid'); if (!topic.ok) return fail(400, topic.error);
    const intent = optText(body.intent, 40, 'intent_invalid'); if (!intent.ok) return fail(400, intent.error);
    const limit = optInt(body.limit, 1, 200, 50, 'limit_invalid'); if (!limit.ok) return fail(400, limit.error);
    const offset = optInt(body.offset, 0, 100_000, 0, 'offset_invalid'); if (!offset.ok) return fail(400, offset.error);
    const win = await loadWindow(deps, period.value, { engines: null, topic: action === 'questions' ? topic.value : null }, false);
    const scoped = intent.value && action === 'questions' ? win.cur.filter((o) => o.intent === intent.value) : win.cur;
    const questions = aggregateQuestions(scoped, { tracked: trackedList });

    if (action === 'questions') {
      return ok({
        total: questions.length,
        questions: questions.slice(offset.value, offset.value + limit.value).map((q) => ({
          query: q.query, topic: q.topic, intent: q.intent, observations: q.observations, n: q.n, vr: r4(q.vr), cr: r4(q.cr), last_observed_at: q.last_observed_at, engines: q.engines.map(engineLabel),
        })),
        n_observations: splitObservations(scoped).valid.length, truncated: win.truncated,
      }, now);
    }

    if (action === 'keywords') {
      const prompts = await deps.store.prompts();
      const seen = new Set(questions.map((q) => q.query.toLowerCase()));
      const list = [
        ...questions.map((q) => ({ query: q.query, observations: q.observations, valid: q.n, mentioned: q.mentioned })),
        ...prompts.filter((p) => p.query && !seen.has(p.query.trim().toLowerCase())).map((p) => ({ query: p.query, observations: 0, valid: 0, mentioned: 0 })),
      ];
      const kws = extractKeywords(list, { limit: 100 });
      return ok({ keywords: kws.map((k) => ({ term: k.term, prompts: k.prompts, observations: k.observations, vr: r4(k.vr), valid: k.valid })), n_prompts: list.length, truncated: win.truncated }, now);
    }

    // opportunities
    const valid = splitObservations(win.cur).valid;
    const { targets } = sourcesFor(valid, win.bundle, rows, deps.brandName, now);
    const idx = buildTrackedIndex(trackedList);
    const counts = new Array<number>(trackedList.length).fill(0);
    let own = 0;
    for (const o of valid) { if (o.mentioned === true) own++; for (const i of trackedHits(o, idx)) counts[i]++; }
    const n = valid.length;
    const items = buildOpportunities({
      questions, targets, own: { name: deps.brandName, vr: n ? own / n : null, n },
      rivals: trackedList.map((t, i) => ({ name: t.name, vr: n ? counts[i] / n : null, mentions: counts[i] })),
    });
    return ok({ items, n_observations: n, truncated: win.truncated }, now);
  }

  return fail(400, 'unsupported_action');
}
