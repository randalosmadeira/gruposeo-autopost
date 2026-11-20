/**
 * Radar de Mercado, leitura e gravação no banco (sem regra de negócio: as regras estão nos arquivos radar-*-core.ts).
 * Toda leitura/gravação filtra por project_id; o organization_id vem do projeto já conferido pelo portão, nunca do corpo do pedido.
 */
import { loadAll, chunk, UNBOUNDED, type Admin } from './taxonomy-shared.ts';
import { engineKind } from './nexus-intelligence.ts';
import { buildPlaceIndex, type GeoMember, type GeoPlace, type PlaceDraft, type MemberDraft, type PlaceLevel } from './radar-geo-core.ts';
import { createBook, type EntityBook } from './radar-entity-core.ts';
import type { Snapshot, FocusLite, CompLite, IdLite, PageLite, ListingLite, LinkLite, CoverageLite, NodeLite, AiRow, GscRow } from './radar-score-core.ts';
import { nameTokens } from './radar-entity-core.ts';
import type { SiteScan } from './radar-enrich-core.ts';
import { normName } from './radar-geo-core.ts';

export interface ProjectLite { id: string; name: string; domain: string | null; wordpress_url: string | null; organization_id: string }
const DAY = 86_400_000;
const PLACE_COLUMNS = 'id,level,parent_id,country,code,name,lat,lon,population,source,license,attribution,inferred,meta';

export const toPlace = (r: Record<string, unknown>): GeoPlace => ({
  id: String(r.id), level: r.level as PlaceLevel, parent_id: (r.parent_id as string | null) ?? null, country: String(r.country ?? '').toLowerCase(), code: String(r.code), name: String(r.name),
  lat: r.lat === null || r.lat === undefined ? null : Number(r.lat), lon: r.lon === null || r.lon === undefined ? null : Number(r.lon), population: r.population === null || r.population === undefined ? null : Number(r.population),
  source: String(r.source), license: (r.license as string | null) ?? null, attribution: (r.attribution as string | null) ?? null, inferred: r.inferred === true, meta: (r.meta as Record<string, unknown>) ?? {},
});

/** Todos os lugares de um país (referência compartilhada) com a pertinência de grupos. */
export async function loadGeo(admin: Admin, country?: string): Promise<{ places: GeoPlace[]; members: GeoMember[] }> {
  const rows = (await loadAll<Record<string, unknown>>(admin, 'geo_places', PLACE_COLUMNS, country ? { col: 'country', val: country } : null, UNBOUNDED)).rows;
  const places = rows.map(toPlace);
  const ids = new Set(places.map((p) => p.id));
  const mem = (await loadAll<GeoMember>(admin, 'geo_place_members', 'group_id,member_id,relation,inferred', null, UNBOUNDED)).rows.filter((m) => ids.has(m.group_id) && ids.has(m.member_id));
  return { places, members: mem };
}

export async function placesByIds(admin: Admin, ids: string[]): Promise<GeoPlace[]> {
  const out: GeoPlace[] = [];
  for (const part of chunk([...new Set(ids)], 100)) {
    const r = await admin.from('geo_places').select(PLACE_COLUMNS).in('id', part);
    if (r.error) throw r.error;
    out.push(...((r.data || []) as Array<Record<string, unknown>>).map(toPlace));
  }
  return out;
}

const tokOverlap = (a: string, b: string) => { const ta = new Set(nameTokens(a)); const tb = new Set(nameTokens(b)); if (!ta.size || !tb.size) return 0; let i = 0; for (const t of ta) if (tb.has(t)) i++; return i / Math.min(ta.size, tb.size); };
const AI_ENGINES = ['chatgpt_web', 'chatgpt_api', 'gemini_web', 'gemini_api', 'claude_web', 'claude_api', 'perplexity_web', 'perplexity_api', 'copilot_web', 'google_aio'];

export interface LoadedSnapshot { snap: Snapshot; book: EntityBook; index: ReturnType<typeof buildPlaceIndex>; truncated: boolean }

/** Monta tudo o que o placar, o "onde atacar", o retrato e o Livro de pontas soltas precisam (um projeto). */
export async function loadSnapshot(admin: Admin, project: ProjectLite, nowMs: number, extraNoise: string[] = []): Promise<LoadedSnapshot> {
  const pf = { col: 'project_id', val: project.id };
  const focusesRaw = (await loadAll<Record<string, unknown>>(admin, 'project_focuses', 'id,name,weight,segment_node_id,segment_label,topics,status', pf, UNBOUNDED)).rows;
  const focuses: FocusLite[] = focusesRaw.map((f) => ({ id: String(f.id), name: String(f.name), weight: Number(f.weight), node_id: (f.segment_node_id as string | null) ?? null, status: String(f.status), topics: (f.topics as string[]) ?? [], segment_label: (f.segment_label as string | null) ?? null }));
  const fps = (await loadAll<{ focus_id: string; place_id: string; status: string }>(admin, 'project_focus_places', 'focus_id,place_id,status', pf, UNBOUNDED)).rows;
  const placeRows = await placesByIds(admin, fps.map((p) => p.place_id));
  // o índice de lugares precisa dos pais e dos grupos para explicar e para nomear "Bairro, Município"
  const need = new Set(placeRows.map((p) => p.id)); const all = [...placeRows];
  for (let depth = 0; depth < 4; depth++) { const parents = [...new Set(all.map((p) => p.parent_id).filter((x): x is string => !!x && !need.has(x)))]; if (!parents.length) break; const got = await placesByIds(admin, parents); got.forEach((g) => need.add(g.id)); all.push(...got); }
  const places = new Map(all.map((p) => [p.id, p]));
  const nodes = (await loadAll<NodeLite>(admin, 'project_taxonomy_nodes', 'id,label,slug,kind,parent_id,status', pf, UNBOUNDED)).rows;
  const comps = (await loadAll<Record<string, unknown>>(admin, 'radar_competitors', 'id,name,kind,primary_host,is_own,status,merged_into,authority', pf, UNBOUNDED)).rows;
  const competitors: CompLite[] = comps.map((c) => ({ id: String(c.id), name: String(c.name), kind: String(c.kind), primary_host: (c.primary_host as string | null) ?? null, is_own: c.is_own === true, status: String(c.status), merged_into: (c.merged_into as string | null) ?? null, authority: (c.authority as Record<string, unknown>) ?? {} }));
  const idRows = (await loadAll<Record<string, unknown>>(admin, 'radar_identities', 'id,competitor_id,platform,handle,url,identity_key,kind,source,confidence,evidence,metrics,metrics_label,metrics_at', pf, UNBOUNDED)).rows;
  const identities: IdLite[] = idRows.map((i) => ({ id: String(i.id), competitor_id: (i.competitor_id as string | null) ?? null, platform: String(i.platform), kind: String(i.kind), metrics: (i.metrics as Record<string, unknown>) ?? {}, metrics_label: String(i.metrics_label), handle: (i.handle as string | null) ?? null, evidence: (i.evidence as Record<string, unknown>) ?? {}, display: String(((i.evidence as Record<string, unknown>) ?? {}).titulo ?? '') || null }));
  const pageRows = await loadAll<Record<string, unknown>>(admin, 'radar_pages', 'competitor_id,focus_id,place_id,node_id,position,modality,query_key,url,page_type', pf, 60000);
  const pages: PageLite[] = pageRows.rows.map((p) => ({ competitor_id: (p.competitor_id as string | null) ?? null, focus_id: (p.focus_id as string | null) ?? null, place_id: (p.place_id as string | null) ?? null, node_id: (p.node_id as string | null) ?? null, position: p.position === null || p.position === undefined ? null : Number(p.position), modality: String(p.modality), query_key: (p.query_key as string | null) ?? null, url: String(p.url), page_type: (p.page_type as string | null) ?? null }));
  const listings: ListingLite[] = (await loadAll<Record<string, unknown>>(admin, 'radar_map_listings', 'competitor_id,focus_id,place_id,rating,reviews,position', pf, UNBOUNDED)).rows.map((l) => ({ competitor_id: (l.competitor_id as string | null) ?? null, focus_id: (l.focus_id as string | null) ?? null, place_id: (l.place_id as string | null) ?? null, rating: l.rating === null || l.rating === undefined ? null : Number(l.rating), reviews: l.reviews === null || l.reviews === undefined ? null : Number(l.reviews), position: l.position === null || l.position === undefined ? null : Number(l.position) }));
  const links = (await loadAll<LinkLite>(admin, 'radar_links', 'competitor_id,focus_id,place_id,node_id', pf, UNBOUNDED)).rows;
  const coverage = (await loadAll<CoverageLite>(admin, 'radar_coverage', 'task_key,focus_id,place_id,node_id,modality,status,query', pf, UNBOUNDED)).rows;

  const scans = new Map<string, SiteScan>();
  const scanRows = (await loadAll<Record<string, unknown>>(admin, 'radar_site_scans', 'competitor_id,scan,scanned_at', pf, 20000, 'scanned_at')).rows;
  for (const r of scanRows) scans.set(String(r.competitor_id), r.scan as SiteScan); // ordem crescente: a última sobrescreve

  // IA: citações dos motores de IA do Observatório; cada pergunta é ligada ao Foco de maior sobreposição de termos
  const cit = (await loadAll<Record<string, unknown>>(admin, 'nexus_citations', 'engine,query,host,is_own', pf, 60000)).rows.filter((c) => AI_ENGINES.includes(String(c.engine)) && engineKind(String(c.engine)) === 'ai_observation');
  const act = focuses.filter((f) => f.status === 'ativo');
  const focusOfQuery = (q: string): string | null => { let best: string | null = null; let bo = 0; for (const f of act) { const ov = Math.max(tokOverlap(q, f.name), tokOverlap(q, f.segment_label ?? ''), ...f.topics.map((t) => tokOverlap(q, t)), 0); if (ov > bo) { bo = ov; best = f.id; } } return bo >= 0.5 ? best : null; };
  const ai: AiRow[] = cit.map((c) => ({ host: String(c.host ?? '').toLowerCase().replace(/^www\./, ''), query: String(c.query ?? ''), is_own: c.is_own === true, focus_id: focusOfQuery(String(c.query ?? '')) }));
  const promptRows = (await loadAll<Record<string, unknown>>(admin, 'nexus_prompts', 'id,query,topic,active', pf, UNBOUNDED)).rows.filter((p) => p.active !== false);
  const prompts = promptRows.map((p) => ({ id: String(p.id), query: String(p.query), topic: (p.topic as string | null) ?? null }));

  // Search Console (90 dias): posição média ponderada pelas impressões
  const since = new Date(nowMs - 90 * DAY).toISOString().slice(0, 10);
  const gscRaw = await loadAll<Record<string, unknown>>(admin, 'nexus_search_performance', 'query,page,clicks,impressions,position,day,source', pf, 60000);
  const agg = new Map<string, { imp: number; clicks: number; pos: number; page: string | null; pageImp: number }>();
  for (const r of gscRaw.rows) {
    if (String(r.source) !== 'gsc' || String(r.day) < since || !r.query) continue;
    const imp = Number(r.impressions) || 0; const k = String(r.query);
    const a = agg.get(k) ?? { imp: 0, clicks: 0, pos: 0, page: null, pageImp: 0 };
    a.imp += imp; a.clicks += Number(r.clicks) || 0; a.pos += (Number(r.position) || 0) * imp;
    if (imp > a.pageImp && r.page) { a.page = String(r.page); a.pageImp = imp; }
    agg.set(k, a);
  }
  const gsc: GscRow[] = [...agg.entries()].filter(([, a]) => a.imp > 0).map(([query, a]) => ({ query, page: a.page, position: a.pos / a.imp, impressions: a.imp, clicks: a.clicks }));

  const book = createBook({
    competitors: comps.map((c) => ({ id: String(c.id), name: String(c.name), kind: String(c.kind), primary_host: (c.primary_host as string | null) ?? null, is_own: c.is_own === true, merged_into: (c.merged_into as string | null) ?? null })),
    identities: idRows.map((i) => ({ id: String(i.id), competitor_id: (i.competitor_id as string | null) ?? null, platform: String(i.platform), handle: (i.handle as string | null) ?? null, url: String(i.url), identity_key: String(i.identity_key), kind: String(i.kind), source: String(i.source), confidence: Number(i.confidence), evidence: (i.evidence as Record<string, unknown>) ?? {} })),
    ownHosts: [project.domain, project.wordpress_url].filter((x): x is string => !!x).map((d) => d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]), extraNoise,
  });
  const snap: Snapshot = { now: nowMs, focuses, places, focusPlaces: fps, nodes, competitors, identities, pages, listings, scans, links, coverage, ai, aiPromptsTotal: new Set(ai.map((a) => a.query)).size, gsc, prompts };
  return { snap, book, index: buildPlaceIndex([...places.values()]), truncated: pageRows.truncated || gscRaw.truncated };
}

// ------------------------------------------------------------------------------------------------------------------ gravar o livro de entidades
export async function persistBook(admin: Admin, project: ProjectLite, book: EntityBook, nowIso: string): Promise<{ entities: number; identities: number }> {
  const base = { organization_id: project.organization_id, project_id: project.id };
  const fresh = [...book.entities.values()].filter((e) => e.isNew);
  for (const part of chunk(fresh, 200)) {
    const r = await admin.from('radar_competitors').insert(part.map((e) => ({ id: e.id, ...base, name: e.name, name_norm: e.name_norm, kind: e.kind, primary_host: e.merged_into ? null : e.primary_host, is_own: e.is_own, merged_into: null, first_seen: nowIso, last_seen: nowIso })));
    if (r.error) throw r.error;
  }
  // fusões primeiro (liberam o endereço), depois o resto
  const changed = [...book.entities.values()].filter((e) => !e.isNew && e.dirty).sort((a, b) => Number(!!b.merged_into) - Number(!!a.merged_into));
  for (const e of changed) {
    const u = await admin.from('radar_competitors').update({ kind: e.kind, is_own: e.is_own, merged_into: e.merged_into ?? null, primary_host: e.merged_into ? null : e.primary_host, last_seen: nowIso }).eq('id', e.id).eq('project_id', project.id);
    if (u.error) throw u.error;
  }
  const idn = [...book.identities.values()].filter((i) => i.dirty);
  for (const part of chunk(idn, 200)) {
    const r = await admin.from('radar_identities').upsert(part.map((i) => ({ id: i.id, ...base, competitor_id: i.competitor_id, platform: String(i.platform), handle: i.handle, url: i.url.slice(0, 1000), identity_key: i.identity_key, kind: i.kind, source: i.source, confidence: i.confidence, evidence: i.evidence, last_seen: nowIso, ...(i.isNew ? { first_seen: nowIso } : {}) })), { onConflict: 'project_id,identity_key' });
    if (r.error) throw r.error;
  }
  const out = { entities: fresh.length + changed.length, identities: idn.length };
  for (const e of book.entities.values()) { e.isNew = false; e.dirty = false; }
  for (const i of book.identities.values()) { i.isNew = false; i.dirty = false; }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ gravar lugares (rascunhos)
const LEVEL_ORDER: PlaceLevel[] = ['pais', 'uf', 'regiao', 'zona', 'municipio', 'distrito', 'bairro'];
/** Grava lugares e pertinências. O pai é resolvido por (nível, código) entre os já gravados e os do próprio lote. Idempotente (mesma fonte+nível+código atualiza). */
export async function persistGeoDrafts(admin: Admin, drafts: PlaceDraft[], members: MemberDraft[], nowIso: string): Promise<{ places: number; members: number; skipped_parent: number }> {
  const countries = [...new Set(drafts.map((d) => d.country))];
  const existing = new Map<string, { id: string; source: string }>(); // `${level}|${code}` -> id
  for (const c of countries) for (const r of (await loadAll<{ id: string; level: string; code: string; source: string }>(admin, 'geo_places', 'id,level,code,source', { col: 'country', val: c }, UNBOUNDED)).rows) existing.set(`${r.level}|${r.code}`, { id: r.id, source: r.source });
  const ids = new Map<string, string>();
  for (const d of drafts) { const k = `${d.level}|${d.code}`; ids.set(k, existing.get(k)?.id ?? crypto.randomUUID()); }
  const ordered = [...drafts].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
  let skipped = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const d of ordered) {
    const k = `${d.level}|${d.code}`;
    const have = existing.get(k);
    if (have && have.source !== d.source) continue; // não sobrescreve o que outra fonte gravou com o mesmo código
    let parent: string | null = null;
    if (d.parent) { parent = ids.get(`${d.parent.level}|${d.parent.code}`) ?? existing.get(`${d.parent.level}|${d.parent.code}`)?.id ?? null; if (!parent) skipped++; }
    rows.push({ id: ids.get(k), level: d.level, parent_id: parent, country: d.country, code: d.code, name: d.name.slice(0, 160), name_norm: normName(d.name).slice(0, 160), lat: d.lat ?? null, lon: d.lon ?? null, population: d.population ?? null, source: d.source, license: d.license ?? null, attribution: d.attribution ?? null, inferred: d.inferred === true, meta: d.meta ?? {}, updated_at: nowIso });
  }
  for (const part of chunk(rows, 400)) { const r = await admin.from('geo_places').upsert(part, { onConflict: 'source,level,code' }); if (r.error) throw r.error; }
  const mrows: Array<Record<string, unknown>> = [];
  for (const m of members) {
    const g = ids.get(`${m.group.level}|${m.group.code}`) ?? existing.get(`${m.group.level}|${m.group.code}`)?.id;
    const p = ids.get(`${m.member.level}|${m.member.code}`) ?? existing.get(`${m.member.level}|${m.member.code}`)?.id;
    if (g && p && g !== p) mrows.push({ group_id: g, member_id: p, relation: m.relation, inferred: m.inferred === true });
  }
  for (const part of chunk(mrows, 500)) { const r = await admin.from('geo_place_members').upsert(part, { onConflict: 'group_id,member_id,relation' }); if (r.error) throw r.error; }
  return { places: rows.length, members: mrows.length, skipped_parent: skipped };
}

export async function ensureLink(admin: Admin, project: ProjectLite, existing: Set<string>, l: { competitor_id: string; focus_id: string | null; place_id: string | null; node_id: string | null; source: 'busca' | 'varredura' | 'sugestao_aceita' | 'manual'; evidence?: Record<string, unknown> }): Promise<boolean> {
  const k = `${l.competitor_id}|${l.focus_id ?? ''}|${l.place_id ?? ''}|${l.node_id ?? ''}`;
  if (existing.has(k) || (!l.focus_id && !l.place_id && !l.node_id)) return false;
  existing.add(k);
  const r = await admin.from('radar_links').insert({ organization_id: project.organization_id, project_id: project.id, competitor_id: l.competitor_id, focus_id: l.focus_id, place_id: l.place_id, node_id: l.node_id, source: l.source, evidence: l.evidence ?? {} });
  if (r.error) throw r.error;
  return true;
}
export const linkKeys = (links: LinkLite[]) => new Set(links.map((l) => `${l.competitor_id}|${l.focus_id ?? ''}|${l.place_id ?? ''}|${l.node_id ?? ''}`));
