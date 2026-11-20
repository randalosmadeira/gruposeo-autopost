/**
 * Leituras do banco para o Estúdio de Páginas: tudo que vem de OUTROS módulos é lido só se a tabela existir (to_regclass, pela função studio_optional_tables) e
 * sempre de forma tolerante: coluna ausente vira vazio, nunca erro. Nada aqui escreve em tabela de outro módulo (a única escrita é a fila de indexação, no handler).
 *
 * CONTRATO com o Radar de Mercado (outro módulo; migração 20261120600000_radar_mercado.sql, ainda NÃO aplicada e em construção por outro agente: este leitor
 * é tolerante a coluna ausente e só lê o que existe):
 *   radar_pages          (project_id, focus_id, place_id, node_id, url, host, title, snippet, position, modality, page_type, seen_at)   -> páginas e vídeos que vencem
 *   radar_site_scans     (project_id, competitor_id, host, scan jsonb)                                                                   -> medição do site do concorrente, se o scan trouxer schema/palavras
 *   radar_identities     (project_id, competitor_id, platform, handle, url, kind, metrics jsonb)                                         -> identidades sociais e de vídeo
 *   radar_map_listings   (project_id, focus_id, name, rating, reviews, categories, position)                                             -> pacote de mapas
 *   radar_scores         (project_id, week, subject, focus_id, score)                                                                    -> placar semanal estimado
 *   project_focuses      (id, project_id, name, segment_label, topics, language, target_hosts)                                          -> o Foco
 *   geo_places           (id, name, level, country)                                                                                      -> o lugar
 * Sem essas tabelas, o leitor usa o que o Zica já tem: market_queries + market_serp_results (posição, título e endereço) e nexus_citations (Observatório).
 * O Radar ainda NÃO grava headings, entidades, palavras nem schema das páginas dos concorrentes: sem isso o benchmark fica "só títulos" e o briefing diz isso.
 */
import type { Admin } from './engine-kernel.ts';
import { EMPTY_RADAR, type CitationRow, type RadarInput, type RadarPage, type RadarSocial } from './studio-brief.ts';
import type { SitePage } from './studio-links.ts';

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const n = (v: unknown): number | null => { const x = typeof v === 'string' ? Number(v) : (v as number); return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x ? String((x as Row).text ?? (x as Row).name ?? (x as Row).title ?? '') : '')).filter(Boolean) : []);
const hostOf = (u: string): string => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const toks = (x: string) => new Set(fold(x).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
const similar = (a: string, b: string) => { const A = toks(a); const B = toks(b); if (!A.size || !B.size) return false; let i = 0; for (const t of A) if (B.has(t)) i++; return i / Math.min(A.size, B.size) >= 0.6; };

export async function optionalTables(admin: Admin): Promise<Record<string, boolean>> {
  try {
    const r = await admin.rpc('studio_optional_tables');
    if (r.error || !r.data || typeof r.data !== 'object') return {};
    return r.data as Record<string, boolean>;
  } catch { return {}; }
}

async function safe<T>(fn: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try { const r = await fn(); return r.error ? [] : ((r.data || []) as T[]); } catch { return []; }
}

export async function loadRadar(admin: Admin, projectId: string, query: string, focusId: string | null, tables: Record<string, boolean>, ownHost: string | null = null): Promise<RadarInput> {
  let pages: RadarPage[] = []; let depth: RadarInput['depth'] = 'nenhuma'; let source: RadarInput['source'] = 'ausente';
  let mapPack: RadarInput['mapPack'] = [];
  if (tables.radar_pages) {
    const rows = await safe<Row>(() => admin.from('radar_pages').select('*').eq('project_id', projectId).limit(1000));
    const mine = rows.filter((r) => (focusId && r.focus_id ? r.focus_id === focusId : similar(`${r.title || ''} ${r.snippet || ''}`, query) || similar(String(r.url || ''), query)));
    const seen = new Set<string>();
    pages = mine.filter((r) => ['web', 'videos', 'social', 'news'].includes(String(r.modality || 'web'))).sort((a, b) => Number(a.position ?? 99) - Number(b.position ?? 99))
      .filter((r) => { const k = String(r.url); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((r): RadarPage => ({ url: String(r.url || ''), host: s(r.host) || hostOf(String(r.url || '')), title: String(r.title || ''), position: n(r.position), kind: r.modality === 'videos' ? 'video' : r.modality === 'social' ? 'social' : s(r.page_type) || 'organico', textSample: null })).filter((p) => p.url);
    // medição do site do concorrente (quando o scan do Radar trouxer schema/palavras): enriquece as páginas do mesmo host
    if (tables.radar_site_scans && pages.length) {
      const scans = await safe<Row>(() => admin.from('radar_site_scans').select('host,scan').eq('project_id', projectId).limit(300));
      const byHost = new Map(scans.map((x) => [String(x.host).toLowerCase().replace(/^www\./, ''), (x.scan && typeof x.scan === 'object' ? x.scan : {}) as Row]));
      for (const p of pages) {
        const sc = byHost.get(p.host.replace(/^www\./, '')); if (!sc) continue;
        p.schemaTypes = arr(sc.schema_types ?? sc.schemaTypes); p.words = n(sc.word_count ?? sc.words); p.headings = arr(sc.headings); p.entities = arr(sc.entities); p.updatedAt = s(sc.last_modified ?? sc.updated_at);
      }
    }
    if (pages.length) { source = 'radar'; depth = pages.some((p) => (p.headings && p.headings.length) || p.words) ? 'completa' : 'so_titulos'; }
  }
  if (tables.radar_map_listings) {
    mapPack = (await safe<Row>(() => admin.from('radar_map_listings').select('name,rating,reviews,focus_id,position').eq('project_id', projectId).limit(100))).filter((r) => !focusId || !r.focus_id || r.focus_id === focusId).sort((a, b) => Number(a.position ?? 99) - Number(b.position ?? 99)).slice(0, 10).map((r) => ({ name: String(r.name || ''), rating: n(r.rating), reviews: n(r.reviews) }));
  }
  if (!pages.length && tables.market_queries && tables.market_serp_results) {
    const qs = (await safe<Row>(() => admin.from('market_queries').select('id,query').eq('project_id', projectId).limit(2000))).filter((q) => similar(String(q.query || ''), query));
    if (qs.length) {
      const ids = qs.map((q) => q.id);
      const res = await safe<Row>(() => admin.from('market_serp_results').select('query_id,position,url,host,title,kind').eq('project_id', projectId).in('query_id', ids).limit(500));
      const seen = new Set<string>();
      pages = res.filter((r) => r.kind !== 'anuncio').sort((a, b) => Number(a.position) - Number(b.position)).filter((r) => { const k = String(r.url); if (seen.has(k)) return false; seen.add(k); return true; })
        .map((r): RadarPage => ({ url: String(r.url), host: String(r.host || hostOf(String(r.url))), title: String(r.title || ''), position: n(r.position), kind: r.kind === 'mapa' ? 'mapa' : 'organico' }));
      if (pages.length) { depth = 'so_titulos'; source = 'serp_local'; }
    }
  }
  let social: RadarSocial[] = [];
  if (tables.radar_identities) {
    social = (await safe<Row>(() => admin.from('radar_identities').select('platform,handle,url,kind,metrics').eq('project_id', projectId).limit(300))).filter((r) => r.kind !== 'site' && r.kind !== 'lugar')
      .map((r): RadarSocial => { const m = (r.metrics && typeof r.metrics === 'object' ? r.metrics : {}) as Row; return { host: hostOf(String(r.url || '')), platform: String(r.platform || ''), handle: s(r.handle), topics: arr(m.topics), formats: [String(r.kind || 'perfil')], postsPerMonth: n(m.posts_per_month ?? m.postsPerMonth), lastPostAt: s(m.last_post_at ?? m.lastPostAt) }; });
  }
  // placar: nossa posição = a melhor posição de uma página do PRÓPRIO site entre os resultados; nota estimada do Radar (radar_scores) quando existir
  let scoreboard: RadarInput['scoreboard'] = null;
  const own = ownHost ? ownHost.toLowerCase().replace(/^www\./, '') : null;
  const ownPositions = own ? pages.filter((p) => p.host.replace(/^www\./, '') === own).map((p) => p.position).filter((x): x is number => typeof x === 'number') : [];
  let radarScore: number | null = null;
  if (tables.radar_scores) {
    const rows = (await safe<Row>(() => admin.from('radar_scores').select('week,subject,focus_id,score').eq('project_id', projectId).eq('subject', 'nos').limit(100))).filter((r) => !focusId || !r.focus_id || r.focus_id === focusId).sort((a, b) => String(b.week).localeCompare(String(a.week)));
    radarScore = rows[0] ? n(rows[0].score) : null;
  }
  if (ownPositions.length || radarScore !== null) scoreboard = { position: ownPositions.length ? Math.min(...ownPositions) : null, aiCitations: null, indexed: null, focusId, score: radarScore };
  if (!pages.length && !social.length && !mapPack.length && !scoreboard) return { ...EMPTY_RADAR };
  return { source, depth: depth === 'nenhuma' && (social.length || mapPack.length) ? 'so_titulos' : depth, pages: pages.filter((p) => p.host.replace(/^www\./, '') !== own), social, mapPack, scoreboard, fetchedAt: null };
}

export async function loadCitations(admin: Admin, projectId: string, tables: Record<string, boolean>): Promise<CitationRow[] | null> {
  if (!tables.nexus_citations) return null;
  const rows = await safe<Row>(() => admin.from('nexus_citations').select('engine,query,topic,url,host,is_own,position,title').eq('project_id', projectId).limit(3000));
  return rows.map((r) => ({ engine: s(r.engine), query: s(r.query), topic: s(r.topic), url: String(r.url || ''), host: String(r.host || hostOf(String(r.url || ''))), is_own: r.is_own === true, position: n(r.position), title: s(r.title) })).filter((r) => r.url && r.host);
}

export async function loadNode(admin: Admin, projectId: string, nodeId: string | null, tables: Record<string, boolean>): Promise<{ id: string; label: string; keywords: string[]; slug: string } | null> {
  if (!nodeId || !tables.project_taxonomy_nodes) return null;
  const rows = await safe<Row>(() => admin.from('project_taxonomy_nodes').select('id,label,keywords,slug').eq('project_id', projectId).eq('id', nodeId).limit(1));
  const r = rows[0]; return r ? { id: String(r.id), label: String(r.label || ''), keywords: arr(r.keywords), slug: String(r.slug || '') } : null;
}
export async function loadScope(admin: Admin, projectId: string, scopeId: string | null, tables: Record<string, boolean>): Promise<{ id: string; place: string | null; region: string | null; country: string | null; language: string | null } | null> {
  if (!scopeId || !tables.project_geo_scope) return null;
  const rows = await safe<Row>(() => admin.from('project_geo_scope').select('id,country,language,municipio,bairro,regiao,uf').eq('project_id', projectId).eq('id', scopeId).limit(1));
  const r = rows[0]; return r ? { id: String(r.id), place: s(r.bairro) || s(r.municipio), region: s(r.regiao) || s(r.uf), country: s(r.country), language: s(r.language) } : null;
}
export async function loadFocus(admin: Admin, projectId: string, focusId: string | null, tables: Record<string, boolean>): Promise<{ id: string; label: string; topics: string[]; language: string | null } | null> {
  if (!focusId || !tables.project_focuses) return null;
  const rows = await safe<Row>(() => admin.from('project_focuses').select('id,name,segment_label,topics,language').eq('project_id', projectId).eq('id', focusId).limit(1));
  const r = rows[0]; return r ? { id: String(r.id), label: s(r.name) || s(r.segment_label) || '', topics: arr(r.topics), language: s(r.language) } : null;
}
/** Lugar do Radar (geo_places é dado público compartilhado, sem projeto). */
export async function loadGeoPlace(admin: Admin, placeId: string | null, tables: Record<string, boolean>): Promise<{ id: string; name: string; level: string; country: string | null } | null> {
  if (!placeId || !tables.geo_places) return null;
  const rows = await safe<Row>(() => admin.from('geo_places').select('id,name,level,country').eq('id', placeId).limit(1));
  const r = rows[0]; return r ? { id: String(r.id), name: String(r.name || ''), level: String(r.level || ''), country: s(r.country) } : null;
}

/** Páginas que o site já tem (inventário da Indexação) para o plano de links: só as que respondem 200 (ou ainda não foram verificadas). */
export async function loadSitePages(admin: Admin, projectId: string, origin: string, tables: Record<string, boolean>): Promise<SitePage[]> {
  if (!tables.index_urls) return [];
  const rows = await safe<Row>(() => admin.from('index_urls').select('url,path,host,gsc_impressions,http_status,robots_meta,x_robots,soft404_suspect').eq('project_id', projectId).limit(5000));
  const host = hostOf(origin);
  return rows.filter((r) => hostOf(String(r.url)) === host && (r.http_status === null || r.http_status === undefined || r.http_status === 200) && !/noindex/i.test(`${r.robots_meta || ''} ${r.x_robots || ''}`) && r.soft404_suspect !== true)
    .map((r): SitePage => {
      const path = String(r.path || '/').replace(/^\/+|\/+$/g, '');
      const title = path ? path.split('/').pop()!.replace(/-/g, ' ') : 'Início';
      return { url: String(r.url), title: title.charAt(0).toUpperCase() + title.slice(1), slugPath: path, keywords: path.split(/[/-]/).filter((w) => w.length > 2), impressions: n(r.gsc_impressions) ?? 0, published: true };
    }).filter((p) => p.slugPath);
}

export async function loadPolicyRows(admin: Admin, userId: string, projectId: string, tables: Record<string, boolean>): Promise<Row[]> {
  if (!tables.module_image_policies) return [];
  return safe<Row>(() => admin.from('module_image_policies').select('*').eq('user_id', userId).eq('module_key', 'estudio_paginas').limit(5)).then((rows) => rows.sort((a, b) => (a.project_id === projectId ? 1 : 0) - (b.project_id === projectId ? 1 : 0)).filter((r) => !r.project_id || r.project_id === projectId));
}
export async function loadAssetRows(admin: Admin, userId: string, projectId: string, tables: Record<string, boolean>): Promise<Row[]> {
  if (!tables.module_image_assets) return [];
  const rows = await safe<Row>(() => admin.from('module_image_assets').select('*').eq('user_id', userId).eq('module_key', 'estudio_paginas').eq('is_active', true).limit(60));
  return rows.filter((r) => !r.project_id || r.project_id === projectId);
}
