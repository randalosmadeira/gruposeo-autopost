/**
 * Radar de Mercado, território: regras puras (sem rede, sem banco). GENÉRICO: qualquer país, idioma e segmento.
 *
 *  - modelo de lugar (país > estado/província > região > município > distrito > bairro, mais "zona" informal);
 *  - resolução de menções (zona informal, "cidade e região", sigla do estado) para lugares do banco, com ambiguidade declarada;
 *  - expansão AUTOMÁTICA de vizinhança com regra configurável e EXPLICÁVEL: cada lugar que entra leva o "por que entrou";
 *  - construtores/leitores das fontes abertas (OpenStreetMap/Overpass, Wikidata, GeoNames) com licença, atribuição e limites de cortesia.
 * Fontes específicas de um país ficam em pacotes opcionais (radar-geo-br.ts); este arquivo não conhece nenhum.
 */

export type PlaceLevel = 'pais' | 'uf' | 'regiao' | 'municipio' | 'distrito' | 'bairro' | 'zona';
export const PLACE_LEVELS: PlaceLevel[] = ['pais', 'uf', 'regiao', 'municipio', 'distrito', 'bairro', 'zona'];
export const isPlaceLevel = (v: unknown): v is PlaceLevel => typeof v === 'string' && (PLACE_LEVELS as string[]).includes(v);

export interface GeoPlace {
  id: string; level: PlaceLevel; parent_id: string | null; country: string; code: string; name: string;
  lat: number | null; lon: number | null; population: number | null; source: string; license?: string | null; attribution?: string | null; inferred?: boolean;
  meta?: Record<string, unknown>;
}
export type GroupRelation = 'regiao_metropolitana' | 'regiao_imediata' | 'regiao_intermediaria' | 'zona' | 'vizinho';
export interface GeoMember { group_id: string; member_id: string; relation: GroupRelation; inferred?: boolean }

/** Por que um lugar entrou: `rule` é uma chave estável (a tela traduz); `detail` é a explicação pronta. */
export interface PlaceWhy { rule: WhyRule; via: string | null; detail: string }
export type WhyRule = 'citado_na_frase' | 'zona_membro' | 'mesma_regiao_metropolitana' | 'mesma_regiao_imediata' | 'raio_km' | 'maior_cidade_do_estado' | 'filho_do_lugar' | 'manual';
export type PlaceOrigin = 'frase' | 'vizinhanca' | 'zona' | 'manual';
export interface ResolvedPlace { place: GeoPlace; origin: PlaceOrigin; why: PlaceWhy[]; inferred: boolean }

/** Sem acento, minúsculas, só letras e números (mesma ideia do restante do sistema; independente para o núcleo não depender de pacote de país). */
export const normName = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ------------------------------------------------------------------------------------------------------------------ índice
export interface PlaceIndex {
  byId: Map<string, GeoPlace>;
  byNorm: Map<string, GeoPlace[]>;
  children: Map<string, GeoPlace[]>;
  /** grupo (região/zona) -> membros */
  membersOf: Map<string, Array<{ place: GeoPlace; relation: GroupRelation; inferred: boolean }>>;
  /** lugar -> grupos a que pertence */
  groupsOf: Map<string, Array<{ group: GeoPlace; relation: GroupRelation; inferred: boolean }>>;
}

export function buildPlaceIndex(places: GeoPlace[], members: GeoMember[] = []): PlaceIndex {
  const byId = new Map(places.map((p) => [p.id, p]));
  const byNorm = new Map<string, GeoPlace[]>();
  const children = new Map<string, GeoPlace[]>();
  for (const p of places) {
    const k = normName(p.name);
    byNorm.set(k, [...(byNorm.get(k) ?? []), p]);
    if (p.parent_id) children.set(p.parent_id, [...(children.get(p.parent_id) ?? []), p]);
  }
  const membersOf: PlaceIndex['membersOf'] = new Map();
  const groupsOf: PlaceIndex['groupsOf'] = new Map();
  for (const m of members) {
    const g = byId.get(m.group_id); const p = byId.get(m.member_id);
    if (!g || !p) continue;
    membersOf.set(g.id, [...(membersOf.get(g.id) ?? []), { place: p, relation: m.relation, inferred: m.inferred === true }]);
    groupsOf.set(p.id, [...(groupsOf.get(p.id) ?? []), { group: g, relation: m.relation, inferred: m.inferred === true }]);
  }
  return { byId, byNorm, children, membersOf, groupsOf };
}

/** Cadeia de ancestrais (do pai até a raiz), com proteção contra ciclo. */
export function ancestors(p: GeoPlace, idx: PlaceIndex): GeoPlace[] {
  const out: GeoPlace[] = []; const seen = new Set<string>([p.id]);
  let cur = p.parent_id ? idx.byId.get(p.parent_id) : undefined;
  while (cur && !seen.has(cur.id)) { out.push(cur); seen.add(cur.id); cur = cur.parent_id ? idx.byId.get(cur.parent_id) : undefined; }
  return out;
}

/** "Bairro, Município": rótulo curto para consultas e telas (o município só entra quando existe). */
export function placeLabel(p: GeoPlace, idx: PlaceIndex): string {
  if (p.level === 'bairro' || p.level === 'distrito') {
    const city = ancestors(p, idx).find((a) => a.level === 'municipio');
    return city ? `${p.name}, ${city.name}` : p.name;
  }
  return p.name;
}

// ------------------------------------------------------------------------------------------------------------------ menções
export type MentionKind = 'lugar' | 'zona';
/** Um trecho de território dito pela pessoa. `context` = lugar maior que ajuda a escolher (a cidade de uma zona). `expand_region` = "e região". */
export interface Mention { text: string; kind: MentionKind; context?: string | null; expand_region?: boolean }
export type ResolveStatus = 'resolvido' | 'ambiguo' | 'nao_encontrado';
export interface MentionResolution { mention: Mention; status: ResolveStatus; places: GeoPlace[]; note: string | null; candidates?: GeoPlace[] }

const ABBR_KEYS = ['abbr', 'sigla', 'iso'];
const abbrOf = (p: GeoPlace): string[] => ABBR_KEYS.map((k) => (p.meta && typeof p.meta[k] === 'string' ? normName(p.meta[k]) : '')).filter(Boolean);

/** Zonas informais costumam ser escritas sem o prefixo ("Leste"): aceita o nome com e sem a palavra "zona". */
const stripZonePrefix = (n: string) => n.replace(/^(zona|zone|zonas|zones)\s+/, '');

function pickByContext(cands: GeoPlace[], context: string | null | undefined, idx: PlaceIndex): { pick: GeoPlace[]; byContext: boolean } {
  const ctx = normName(context);
  if (ctx) {
    const hit = cands.filter((c) => ancestors(c, idx).some((a) => normName(a.name) === ctx || abbrOf(a).includes(ctx)) || abbrOf(c).includes(ctx));
    if (hit.length) return { pick: hit, byContext: true };
  }
  return { pick: cands, byContext: false };
}

export function resolveMention(m: Mention, idx: PlaceIndex): MentionResolution {
  const name = normName(m.text);
  if (!name) return { mention: m, status: 'nao_encontrado', places: [], note: 'texto_vazio' };
  let cands: GeoPlace[] = [];
  if (m.kind === 'zona') {
    const want = stripZonePrefix(name);
    cands = [...idx.byId.values()].filter((p) => p.level === 'zona' && stripZonePrefix(normName(p.name)) === want);
    if (!cands.length) return { mention: m, status: 'nao_encontrado', places: [], note: 'pacote_de_zonas_nao_carregado' };
  } else {
    cands = idx.byNorm.get(name) ?? [];
    if (!cands.length) cands = [...idx.byId.values()].filter((p) => abbrOf(p).includes(name));
    if (!cands.length) return { mention: m, status: 'nao_encontrado', places: [], note: 'lugar_nao_encontrado' };
  }
  const { pick, byContext } = pickByContext(cands, m.context, idx);
  if (pick.length === 1) return { mention: m, status: 'resolvido', places: pick, note: byContext ? 'escolhido_pelo_contexto' : null };
  // vários com o mesmo nome: escolhe o de maior população só quando ela existe e o vencedor é claro; senão declara ambiguidade (a pessoa decide)
  const byPop = [...pick].sort((a, b) => (b.population ?? -1) - (a.population ?? -1));
  if (byPop[0].population != null && (byPop[1]?.population ?? -1) * 3 < byPop[0].population) {
    return { mention: m, status: 'resolvido', places: [byPop[0]], note: 'maior_populacao_entre_homonimos', candidates: byPop.slice(1, 5) };
  }
  return { mention: m, status: 'ambiguo', places: [], note: 'homonimos_sem_contexto', candidates: byPop.slice(0, 8) };
}

// ------------------------------------------------------------------------------------------------------------------ expansão de vizinhança
export interface ProximityRules {
  /** inclui os outros municípios da mesma região metropolitana do lugar citado */
  metro: boolean;
  /** inclui os municípios da mesma região imediata */
  immediate: boolean;
  /** raio em km a partir do lugar citado (precisa de latitude/longitude); 0 = desligado */
  radius_km: number;
  /** as N maiores cidades do mesmo estado (0 = desligado) */
  state_top: number;
  /** descarta municípios menores que isso (quando há população) */
  min_population: number;
  /** teto de lugares ADICIONADOS por expansão (proteção contra explosão; mostrado na tela quando corta) */
  max_added: number;
}
export const DEFAULT_PROXIMITY: ProximityRules = { metro: false, immediate: false, radius_km: 0, state_top: 0, min_population: 0, max_added: 80 };

export function normalizeRules(raw: unknown): ProximityRules {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return {
    metro: o.metro === undefined ? DEFAULT_PROXIMITY.metro : o.metro === true,
    immediate: o.immediate === true,
    radius_km: num(o.radius_km, 0, 0, 500),
    state_top: Math.round(num(o.state_top, 0, 0, 100)),
    min_population: Math.round(num(o.min_population, 0, 0, 50_000_000)),
    max_added: Math.round(num(o.max_added, DEFAULT_PROXIMITY.max_added, 0, 2000)),
  };
}

const cityOf = (p: GeoPlace, idx: PlaceIndex): GeoPlace | null => (p.level === 'municipio' ? p : ancestors(p, idx).find((a) => a.level === 'municipio') ?? null);

export interface ExpansionResult { added: ResolvedPlace[]; truncated: boolean; skipped_small: number }

/**
 * Expande os lugares citados. Regras, nesta ordem (um lugar que cai em mais de uma regra recebe todas as explicações):
 *  - lugar do tipo zona -> todos os membros (distritos) da zona;
 *  - `expand_region` na menção (ou `rules.metro`) -> municípios da mesma região metropolitana;
 *  - `rules.immediate` -> municípios da mesma região imediata;
 *  - `rules.radius_km` -> municípios dentro do raio;
 *  - `rules.state_top` -> maiores cidades do mesmo estado.
 */
export function expandNeighborhood(seeds: ResolvedPlace[], idx: PlaceIndex, rules: ProximityRules, opts: { regionFor?: Set<string> } = {}): ExpansionResult {
  const out = new Map<string, ResolvedPlace>();
  const have = new Set(seeds.map((s) => s.place.id));
  let skippedSmall = 0;
  const add = (p: GeoPlace, origin: PlaceOrigin, why: PlaceWhy, inferred: boolean) => {
    if (have.has(p.id)) return;
    if (rules.min_population > 0 && p.population != null && p.population < rules.min_population && (p.level === 'municipio')) { skippedSmall++; return; }
    const cur = out.get(p.id);
    if (cur) { if (!cur.why.some((w) => w.rule === why.rule && w.via === why.via)) cur.why.push(why); cur.inferred = cur.inferred && inferred; return; }
    out.set(p.id, { place: p, origin, why: [why], inferred });
  };
  for (const s of seeds) {
    const p = s.place;
    if (p.level === 'zona') {
      for (const m of idx.membersOf.get(p.id) ?? []) add(m.place, 'zona', { rule: 'zona_membro', via: p.name, detail: `${m.place.name} faz parte de ${p.name}${p.inferred || m.inferred ? ' (agrupamento informal, inferido: confira)' : ''}` }, p.inferred === true || m.inferred);
      continue;
    }
    const city = cityOf(p, idx);
    if (!city) continue;
    const wantsRegion = rules.metro || (opts.regionFor?.has(p.id) ?? false);
    const groups = idx.groupsOf.get(city.id) ?? [];
    if (wantsRegion) {
      for (const g of groups.filter((x) => x.relation === 'regiao_metropolitana')) {
        for (const m of idx.membersOf.get(g.group.id) ?? []) if (m.place.level === 'municipio') add(m.place, 'vizinhanca', { rule: 'mesma_regiao_metropolitana', via: city.name, detail: `${m.place.name} está na mesma região metropolitana de ${city.name} (${g.group.name})` }, false);
      }
    }
    if (rules.immediate) {
      for (const g of groups.filter((x) => x.relation === 'regiao_imediata')) {
        for (const m of idx.membersOf.get(g.group.id) ?? []) if (m.place.level === 'municipio') add(m.place, 'vizinhanca', { rule: 'mesma_regiao_imediata', via: city.name, detail: `${m.place.name} está na mesma região imediata de ${city.name} (${g.group.name})` }, false);
      }
    }
    if (rules.radius_km > 0 && city.lat != null && city.lon != null) {
      for (const o of idx.byId.values()) {
        if (o.level !== 'municipio' || o.id === city.id || o.lat == null || o.lon == null) continue;
        const km = haversineKm({ lat: city.lat, lon: city.lon }, { lat: o.lat, lon: o.lon });
        if (km <= rules.radius_km) add(o, 'vizinhanca', { rule: 'raio_km', via: city.name, detail: `${o.name} fica a ${Math.round(km)} km de ${city.name} (limite ${rules.radius_km} km)` }, false);
      }
    }
    if (rules.state_top > 0) {
      const state = ancestors(city, idx).find((a) => a.level === 'uf');
      if (state) {
        const top = (idx.children.get(state.id) ?? []).filter((c) => c.level === 'municipio').sort((a, b) => (b.population ?? 0) - (a.population ?? 0)).slice(0, rules.state_top);
        for (const o of top) add(o, 'vizinhanca', { rule: 'maior_cidade_do_estado', via: state.name, detail: `${o.name} está entre as ${rules.state_top} maiores cidades de ${state.name}` }, false);
      }
    }
  }
  const all = [...out.values()];
  // proximidade: quem está mais perto/mais populoso fica primeiro quando o teto corta (determinístico)
  all.sort((a, b) => (b.place.population ?? 0) - (a.place.population ?? 0) || a.place.name.localeCompare(b.place.name));
  const truncated = all.length > rules.max_added;
  return { added: all.slice(0, rules.max_added), truncated, skipped_small: skippedSmall };
}

/** Texto curto "por que entrou" (a tela usa as chaves `rule`; este texto é o reserva e o que vai nos eventos). */
export const explainPlace = (rp: ResolvedPlace): string => rp.why.map((w) => w.detail).join('; ');

// ------------------------------------------------------------------------------------------------------------------ OpenStreetMap / Overpass
export const OSM_LICENSE = 'ODbL-1.0';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';
/** Instância pública: o uso é de cortesia (poucas consultas por dia, uso comercial pede servidor próprio). A URL é configurável para apontar para uma instância própria. */
export const OVERPASS_DEFAULT_URL = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_MIN_INTERVAL_MS = 10_000;
export const OVERPASS_CACHE_DAYS = 90;
export const OVERPASS_USAGE_NOTE = 'Overpass público é de cortesia (poucas consultas por dia, uso regular deve ser dividido por 100; uso comercial pede servidor próprio ou pago). O Zica guarda o resultado por 90 dias e espera entre consultas.';

export type OverpassAreaRef = { wikidata: string } | { osmRelation: number } | { name: string; adminLevel?: number };
export function buildOverpassQuery(area: OverpassAreaRef, opts: { timeoutS?: number } = {}): string | null {
  const to = Math.max(5, Math.min(180, Math.round(opts.timeoutS ?? 60)));
  let areaExpr: string;
  if ('wikidata' in area) { if (!/^Q\d{1,12}$/.test(area.wikidata)) return null; areaExpr = `area["wikidata"="${area.wikidata}"]->.a;`; }
  else if ('osmRelation' in area) { if (!Number.isInteger(area.osmRelation) || area.osmRelation <= 0) return null; areaExpr = `area(${3_600_000_000 + area.osmRelation})->.a;`; }
  else {
    const n = String(area.name ?? '').replace(/["\\\n\r]/g, '').trim();
    if (n.length < 2 || n.length > 120) return null;
    areaExpr = `area["name"="${n}"]["boundary"="administrative"]${area.adminLevel ? `["admin_level"="${Math.round(area.adminLevel)}"]` : ''}->.a;`;
  }
  const kinds = '(suburb|neighbourhood|quarter)';
  return `[out:json][timeout:${to}];${areaExpr}(node["place"~"^${kinds}$"](area.a);way["place"~"^${kinds}$"](area.a);relation["place"~"^${kinds}$"](area.a););out center tags;`;
}

export interface OsmPlaceRow { code: string; name: string; lat: number | null; lon: number | null; place: string; wikidata: string | null }
export function parseOverpass(json: unknown): OsmPlaceRow[] {
  const els = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(els)) return [];
  const out = new Map<string, OsmPlaceRow>();
  for (const e of els as Array<Record<string, unknown>>) {
    const tags = (e?.tags && typeof e.tags === 'object' ? e.tags : {}) as Record<string, unknown>;
    const name = typeof tags.name === 'string' ? tags.name.trim().slice(0, 160) : '';
    const place = typeof tags.place === 'string' ? tags.place : '';
    if (!name || !['suburb', 'neighbourhood', 'quarter'].includes(place)) continue;
    const c = (e.center && typeof e.center === 'object' ? e.center : e) as Record<string, unknown>;
    const lat = Number(c.lat); const lon = Number(c.lon);
    const code = `osm:${String(e.type ?? 'node')}/${String(e.id ?? '')}`;
    if (!/^osm:(node|way|relation)\/\d+$/.test(code)) continue;
    // o mesmo nome em duas feições do mesmo tipo: fica a primeira (o mapa costuma ter o nó e a área do mesmo bairro)
    const k = normName(name);
    if (!out.has(k)) out.set(k, { code, name, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null, place, wikidata: typeof tags.wikidata === 'string' && /^Q\d+$/.test(tags.wikidata) ? tags.wikidata : null });
  }
  return [...out.values()];
}

// ------------------------------------------------------------------------------------------------------------------ Wikidata
export const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
export const WIKIDATA_LICENSE = 'CC0-1.0';
export const WIKIDATA_ATTRIBUTION = 'Wikidata (CC0)';
/** Subdivisões administrativas de uma entidade (P131), com coordenada e população quando existirem. */
export function buildWikidataSubdivisionsQuery(qid: string, lang = 'en', limit = 500): string | null {
  if (!/^Q\d{1,12}$/.test(qid) || !/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(lang)) return null;
  const lim = Math.max(1, Math.min(2000, Math.round(limit)));
  return `SELECT ?item ?itemLabel ?coord ?pop WHERE { ?item wdt:P131 wd:${qid} . OPTIONAL { ?item wdt:P625 ?coord } OPTIONAL { ?item wdt:P1082 ?pop } SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en" } } LIMIT ${lim}`;
}
export interface WikidataRow { qid: string; name: string; lat: number | null; lon: number | null; population: number | null }
export function parseWikidataBindings(json: unknown): WikidataRow[] {
  const rows = (json as { results?: { bindings?: unknown } })?.results?.bindings;
  if (!Array.isArray(rows)) return [];
  const out: WikidataRow[] = [];
  for (const r of rows as Array<Record<string, { value?: string }>>) {
    const qid = /\/(Q\d+)$/.exec(r?.item?.value ?? '')?.[1];
    const name = r?.itemLabel?.value?.trim();
    if (!qid || !name || /^Q\d+$/.test(name)) continue; // sem rótulo no idioma: o rótulo vem igual ao QID
    const m = /Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)/.exec(r?.coord?.value ?? '');
    const pop = Number(r?.pop?.value);
    out.push({ qid, name: name.slice(0, 160), lon: m ? Number(m[1]) : null, lat: m ? Number(m[2]) : null, population: Number.isFinite(pop) && pop >= 0 ? Math.round(pop) : null });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ GeoNames (opcional; exige usuário gratuito configurado)
export const GEONAMES_LICENSE = 'CC-BY-4.0';
export const GEONAMES_ATTRIBUTION = 'GeoNames (CC BY 4.0)';
export function buildGeoNamesChildrenUrl(geonameId: number, username: string): string | null {
  if (!Number.isInteger(geonameId) || geonameId <= 0 || !/^[A-Za-z0-9_.-]{2,60}$/.test(username)) return null;
  return `https://secure.geonames.org/childrenJSON?geonameId=${geonameId}&maxRows=1000&username=${encodeURIComponent(username)}`;
}
export interface GeoNamesRow { code: string; name: string; lat: number | null; lon: number | null; population: number | null; fcode: string }
export function parseGeoNamesChildren(json: unknown): GeoNamesRow[] {
  const list = (json as { geonames?: unknown })?.geonames;
  if (!Array.isArray(list)) return [];
  const out: GeoNamesRow[] = [];
  for (const g of list as Array<Record<string, unknown>>) {
    const id = Number(g?.geonameId); const name = typeof g?.name === 'string' ? g.name.trim() : '';
    if (!Number.isInteger(id) || !name) continue;
    const lat = Number(g.lat); const lon = Number(g.lng); const pop = Number(g.population);
    out.push({ code: `gn:${id}`, name: name.slice(0, 160), lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null, population: Number.isFinite(pop) && pop > 0 ? Math.round(pop) : null, fcode: typeof g.fcode === 'string' ? g.fcode : '' });
  }
  return out;
}

/** Peso de um lugar para priorizar consultas: cidade grande vale mais; bairro herda um peso mínimo; sem população, peso neutro. */
export function placeWeight(p: GeoPlace): number {
  const pop = p.population ?? 0;
  const base = pop > 0 ? Math.log10(pop + 10) / 7 : 0.35; // 10 milhões ~ 1,0
  const levelBoost: Record<PlaceLevel, number> = { pais: 0.6, uf: 0.7, regiao: 0.75, municipio: 1, distrito: 0.9, bairro: 0.85, zona: 0.9 };
  return Math.max(0.05, Math.min(1.2, base * levelBoost[p.level] + 0.15));
}

// ------------------------------------------------------------------------------------------------------------------ rascunhos para gravar
/** Lugar ainda sem id do banco: o pai é apontado por (nível, código) e resolvido na hora de gravar. */
export interface PlaceDraft {
  level: PlaceLevel; code: string; name: string; country: string; parent?: { level: PlaceLevel; code: string } | null;
  lat?: number | null; lon?: number | null; population?: number | null; source: string; /* fonte aberta ou pacote: osm, wikidata, geonames, pacote, manual ou a de um pacote de país */
  license?: string | null; attribution?: string | null; inferred?: boolean; meta?: Record<string, unknown>;
}
export interface MemberDraft { group: { level: PlaceLevel; code: string }; member: { level: PlaceLevel; code: string }; relation: GroupRelation; inferred?: boolean }
/** Pacote de país/fonte: registrado pelo lado de fora (o núcleo não conhece nenhum). */
export interface GeoPack { id: string; country: string; label: string; description: string }
