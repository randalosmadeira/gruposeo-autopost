/**
 * Fontes de território do Radar (pacotes opcionais por país e fontes abertas globais). O núcleo (radar-handler) só conhece o registro `GEO_SOURCES`.
 * Cada fonte: lê uma fonte pública (com limites de cortesia e cache), devolve RASCUNHOS de lugares e de pertinências; quem grava é o armazenamento.
 *
 *  - br_municipios / br_regioes / br_distritos / br_zonas_sp: pacote do Brasil (IBGE + zonas informais de São Paulo capital, inferência editável);
 *  - osm_bairros: bairros do OpenStreetMap (ODbL, atribuição obrigatória) via Overpass, com atraso entre consultas e cache de 90 dias;
 *  - wikidata_subdivisoes: subdivisões de uma entidade (CC0);  geonames_filhos: filhos de um lugar (CC BY 4.0; exige usuário gratuito configurado).
 */
import { loadAll, type Admin } from './taxonomy-shared.ts';
import type { MemberDraft, PlaceDraft, PlaceLevel } from './radar-geo-core.ts';
import {
  OSM_ATTRIBUTION, OSM_LICENSE, OVERPASS_CACHE_DAYS, OVERPASS_DEFAULT_URL, OVERPASS_MIN_INTERVAL_MS, buildGeoNamesChildrenUrl, buildOverpassQuery, buildWikidataSubdivisionsQuery, isPlaceLevel,
  parseGeoNamesChildren, parseOverpass, parseWikidataBindings, GEONAMES_ATTRIBUTION, GEONAMES_LICENSE, WIKIDATA_ATTRIBUTION, WIKIDATA_LICENSE, WIKIDATA_SPARQL_URL, normName,
} from './radar-geo-core.ts';
import {
  IBGE_METRO_URL, IBGE_MUNICIPIOS_URL, distritoDrafts, filterRegioesByName, ibgeDistritosUrl, parseIbgeDistritos, parseIbgeHierarquia, parseIbgeRegioesMetropolitanas, placesFromIbgeRows, regiaoDrafts,
  spCapitalDistritoDrafts, spCapitalZonePack, type IbgeMunicipioRow, SP_CAPITAL_IBGE_ID, spDistritoCode,
} from './radar-geo-br.ts';
import { RADAR_UA } from './radar-enrich-core.ts';

export interface GeoSourceCtx {
  admin: Admin; body: Record<string, unknown>; nowIso: string;
  deps: { fetchFn: typeof fetch; sleep: (ms: number) => Promise<void>; now: () => number; overpassUrl?: string; geonamesUser?: string | null };
}
export interface GeoSourceResult { drafts: PlaceDraft[]; members: MemberDraft[]; notes: string[]; ok: boolean }
export type GeoSource = (c: GeoSourceCtx) => Promise<GeoSourceResult>;
const empty = (note: string, ok = false): GeoSourceResult => ({ drafts: [], members: [], notes: [note], ok });

async function getJson(c: GeoSourceCtx, url: string, init: RequestInit = {}): Promise<unknown | null> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await c.deps.fetchFn(url, { ...init, signal: ctl.signal, headers: { Accept: 'application/json', 'User-Agent': RADAR_UA, ...(init.headers as Record<string, string> | undefined) } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(timer); }
}
const ids = (v: unknown, max: number): number[] => (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, max);
const strs = (v: unknown, max: number): string[] => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').slice(0, max);

const br_municipios: GeoSource = async (c) => {
  const rows = (await loadAll<IbgeMunicipioRow>(c.admin, 'ibge_municipios', 'ibge_code,nome,uf,regiao,regiao_imediata,populacao', null, 8000)).rows;
  if (!rows.length) return empty('carregue_os_municipios_na_taxonomia');
  return { drafts: placesFromIbgeRows(rows), members: [], notes: [], ok: true };
};

const br_regioes: GeoSource = async (c) => {
  const kinds = strs(c.body.kinds, 3);
  const wantKinds = kinds.length ? kinds : ['metropolitana'];
  const out: GeoSourceResult = { drafts: [], members: [], notes: [], ok: true };
  if (wantKinds.includes('metropolitana')) {
    const metro = parseIbgeRegioesMetropolitanas(await getJson(c, IBGE_METRO_URL));
    if (!metro.length) out.notes.push('ibge_regioes_metropolitanas_indisponivel');
    const picked = typeof c.body.name === 'string' && c.body.name.trim() ? filterRegioesByName(metro, c.body.name) : metro;
    const d = regiaoDrafts(picked); out.drafts.push(...d.places); out.members.push(...d.members);
    if (typeof c.body.name === 'string' && c.body.name.trim() && !picked.length) out.notes.push('nenhuma_regiao_com_esse_nome');
  }
  if (wantKinds.includes('imediata') || wantKinds.includes('intermediaria')) {
    const hier = parseIbgeHierarquia(await getJson(c, IBGE_MUNICIPIOS_URL));
    if (!hier.length) out.notes.push('ibge_hierarquia_indisponivel');
    const d = regiaoDrafts(hier.filter((r) => wantKinds.includes(r.kind))); out.drafts.push(...d.places); out.members.push(...d.members);
  }
  out.ok = out.drafts.length > 0;
  return out;
};

const br_distritos: GeoSource = async (c) => {
  const municipios = ids(c.body.municipality_ids, 25);
  if (!municipios.length) return empty('informe_municipality_ids');
  const out: GeoSourceResult = { drafts: [], members: [], notes: [], ok: true };
  for (const [i, id] of municipios.entries()) {
    if (i > 0) await c.deps.sleep(300);
    const list = parseIbgeDistritos(await getJson(c, ibgeDistritosUrl(id)));
    if (!list.length) { out.notes.push(`sem_distritos:${id}`); continue; }
    out.drafts.push(...distritoDrafts(list));
  }
  out.ok = out.drafts.length > 0;
  return out;
};

/** Zonas informais de São Paulo capital: liga cada zona aos distritos que JÁ existem (IBGE) pelo nome; só cria os do pacote se o IBGE ainda não foi lido. */
const br_zonas_sp: GeoSource = async (c) => {
  const pack = spCapitalZonePack();
  const sp = await c.admin.from('geo_places').select('id').eq('level', 'municipio').eq('code', `ibge:${SP_CAPITAL_IBGE_ID}`).maybeSingle();
  if (sp.error) throw sp.error;
  if (!sp.data) return empty('carregue_os_municipios_antes');
  const have = (await loadAll<{ id: string; name_norm: string; code: string }>(c.admin, 'geo_places', 'id,name_norm,code', { col: 'parent_id', val: sp.data.id }, 2000)).rows;
  const byName = new Map(have.filter((p) => !p.code.startsWith('br:sp-capital:zona')).map((p) => [p.name_norm, p.code]));
  const drafts = [...pack.places];
  const notes: string[] = [];
  const members: MemberDraft[] = [];
  const created = new Set<string>();
  for (const m of pack.members) {
    const pkgCode = m.member.code; const label = pkgCode.split(':').pop()!.replace(/-/g, ' ');
    const real = byName.get(label);
    if (real) members.push({ ...m, member: { level: 'distrito', code: real } });
    else { if (!created.has(pkgCode)) { created.add(pkgCode); } members.push(m); }
  }
  if (created.size) { const missing = spCapitalDistritoDrafts().filter((d) => created.has(d.code)); drafts.push(...missing); notes.push(`distritos_do_pacote_criados:${missing.length}`); }
  void spDistritoCode;
  return { drafts, members, notes, ok: true };
};

const osm_bairros: GeoSource = async (c) => {
  const placeIds = strs(c.body.place_ids, 3);
  if (!placeIds.length) return empty('informe_place_ids');
  const force = c.body.force === true;
  const url = c.deps.overpassUrl || OVERPASS_DEFAULT_URL;
  const out: GeoSourceResult = { drafts: [], members: [], notes: [], ok: true };
  let first = true;
  for (const id of placeIds) {
    const r = await c.admin.from('geo_places').select('id,level,code,name,country,meta').eq('id', id).maybeSingle();
    if (r.error) throw r.error;
    const p = r.data as { id: string; level: PlaceLevel; code: string; name: string; country: string; meta: Record<string, unknown> } | null;
    if (!p || p.level !== 'municipio') { out.notes.push(`nao_e_municipio:${id}`); continue; }
    const at = typeof p.meta?.osm_synced_at === 'string' ? Date.parse(p.meta.osm_synced_at) : 0;
    if (!force && at && c.deps.now() - at < OVERPASS_CACHE_DAYS * 86_400_000) { out.notes.push(`cache_valido:${p.name}`); continue; }
    const wd = typeof p.meta?.wikidata === 'string' && /^Q\d+$/.test(p.meta.wikidata) ? p.meta.wikidata : null;
    const q = buildOverpassQuery(wd ? { wikidata: wd } : { name: p.name, adminLevel: 8 });
    if (!q) { out.notes.push(`consulta_invalida:${p.name}`); continue; }
    if (!first) await c.deps.sleep(OVERPASS_MIN_INTERVAL_MS);
    first = false;
    const json = await getJson(c, url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(q)}` });
    if (!json) { out.notes.push(`overpass_indisponivel:${p.name}`); continue; }
    const rows = parseOverpass(json);
    for (const b of rows) out.drafts.push({ level: 'bairro', code: b.code, name: b.name, country: p.country, parent: { level: 'municipio', code: p.code }, lat: b.lat, lon: b.lon, source: 'osm', license: OSM_LICENSE, attribution: OSM_ATTRIBUTION, meta: { osm_place: b.place, ...(b.wikidata ? { wikidata: b.wikidata } : {}) } });
    const up = await c.admin.from('geo_places').update({ meta: { ...(p.meta ?? {}), osm_synced_at: c.nowIso } }).eq('id', p.id);
    if (up.error) throw up.error;
    out.notes.push(`osm:${p.name}:${rows.length}`);
  }
  out.ok = out.drafts.length > 0 || out.notes.some((n) => n.startsWith('cache_valido'));
  return out;
};

const wikidata_subdivisoes: GeoSource = async (c) => {
  const qid = String(c.body.qid ?? ''); const level = c.body.level; const lang = typeof c.body.lang === 'string' ? c.body.lang : 'en';
  const parentId = typeof c.body.parent_place_id === 'string' ? c.body.parent_place_id : null;
  if (!isPlaceLevel(level)) return empty('level_invalido');
  const q = buildWikidataSubdivisionsQuery(qid, lang);
  if (!q) return empty('qid_invalido');
  let parent: { code: string; level: PlaceLevel; country: string } | null = null;
  if (parentId) { const r = await c.admin.from('geo_places').select('code,level,country').eq('id', parentId).maybeSingle(); if (r.error) throw r.error; parent = r.data; }
  if (!parent) return empty('parent_place_id_obrigatorio');
  const json = await getJson(c, `${WIKIDATA_SPARQL_URL}?format=json&query=${encodeURIComponent(q)}`);
  if (!json) return empty('wikidata_indisponivel');
  const rows = parseWikidataBindings(json);
  return { drafts: rows.map((r) => ({ level: level as PlaceLevel, code: `wd:${r.qid}`, name: r.name, country: parent!.country, parent: { level: parent!.level, code: parent!.code }, lat: r.lat, lon: r.lon, population: r.population, source: 'wikidata' as const, license: WIKIDATA_LICENSE, attribution: WIKIDATA_ATTRIBUTION, meta: { wikidata: r.qid } })), members: [], notes: [`wikidata:${rows.length}`], ok: rows.length > 0 };
};

const geonames_filhos: GeoSource = async (c) => {
  const user = c.deps.geonamesUser;
  if (!user) return empty('geonames_nao_configurado');
  const gid = Number(c.body.geoname_id); const level = c.body.level; const parentId = typeof c.body.parent_place_id === 'string' ? c.body.parent_place_id : null;
  if (!isPlaceLevel(level) || !parentId) return empty('parametros_invalidos');
  const url = buildGeoNamesChildrenUrl(gid, user);
  if (!url) return empty('geoname_id_invalido');
  const r = await c.admin.from('geo_places').select('code,level,country').eq('id', parentId).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) return empty('parent_place_id_invalido');
  const json = await getJson(c, url);
  if (!json) return empty('geonames_indisponivel');
  const rows = parseGeoNamesChildren(json);
  return { drafts: rows.map((g) => ({ level: level as PlaceLevel, code: g.code, name: g.name, country: r.data.country, parent: { level: r.data.level as PlaceLevel, code: r.data.code }, lat: g.lat, lon: g.lon, population: g.population, source: 'geonames' as const, license: GEONAMES_LICENSE, attribution: GEONAMES_ATTRIBUTION })), members: [], notes: [`geonames:${rows.length}`], ok: rows.length > 0 };
};

export const GEO_SOURCES: Record<string, { label: string; country: string | null; run: GeoSource; note: string }> = {
  br_municipios: { label: 'Estados e municípios (cache da taxonomia)', country: 'br', run: br_municipios, note: 'Usa o cache já carregado na Taxonomia (API pública do IBGE).' },
  br_regioes: { label: 'Regiões metropolitanas, imediatas e intermediárias', country: 'br', run: br_regioes, note: 'API pública do IBGE (sem chave). O filtro por nome ignora acentos.' },
  br_distritos: { label: 'Distritos dos municípios', country: 'br', run: br_distritos, note: 'API pública do IBGE; até 25 municípios por chamada.' },
  br_zonas_sp: { label: 'Zonas de São Paulo capital (inferência editável)', country: 'br', run: br_zonas_sp, note: 'Agrupamento informal dos 96 distritos: não existe no IBGE, confira e edite.' },
  osm_bairros: { label: 'Bairros do OpenStreetMap', country: null, run: osm_bairros, note: 'ODbL: atribuição obrigatória. Overpass público é de cortesia (uso comercial pede servidor próprio): o Zica espera 10 s entre consultas e guarda por 90 dias.' },
  wikidata_subdivisoes: { label: 'Subdivisões (Wikidata)', country: null, run: wikidata_subdivisoes, note: 'CC0. Envie contato no agente de usuário conforme a política da Wikimedia.' },
  geonames_filhos: { label: 'Lugares filhos (GeoNames)', country: null, run: geonames_filhos, note: 'CC BY 4.0. Exige usuário gratuito do GeoNames configurado.' },
};
void normName;
