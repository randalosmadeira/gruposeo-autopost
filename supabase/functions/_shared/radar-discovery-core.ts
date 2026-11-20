/**
 * Radar de Mercado, descoberta da concorrência: regras puras (sem rede, sem banco, SEM gastar nada).
 *
 *  - gerador AUTOMÁTICO de consultas: Foco x tema x território x motor x modalidade (web, lugares/mapas, notícias, imagens, vídeos, redes);
 *  - prioridade por peso do Foco, tamanho do lugar e valor da modalidade; lote que cabe no orçamento (o teto diário do spend-gate continua mandando);
 *  - ledger de COBERTURA (o que foi consultado, o que falta, custo, data) e métrica de SATURAÇÃO (concorrentes novos por rodada tendendo a zero).
 *    Nunca prometemos "100% do que existe": prometemos cobertura do espaço DEFINIDO (focos x lugares x modalidades) e mostramos a saturação;
 *  - construtores de chamada e leitores de resposta: Serper (web, lugares, mapas, notícias, imagens, vídeos), DataForSEO (SERP, mapas, Bing, backlinks), Brave.
 * Genérico: o texto da consulta usa o idioma do Foco; nada aqui conhece um segmento ou país.
 */
import { serperRequest } from './serper-request.ts';
import { DATAFORSEO_LOCATION_CODES } from './nexus-collectors.ts';
import { normName, placeLabel, placeWeight, type GeoPlace, type PlaceIndex } from './radar-geo-core.ts';
import { MODALITIES, type Modality } from './radar-focus-core.ts';
import { PLATFORMS, type SocialPlatform } from './radar-social-core.ts';

export type { Modality };
export type DiscoveryEngine = 'serper' | 'dfs_google' | 'dfs_maps' | 'dfs_bing' | 'brave';
export const DISCOVERY_ENGINES: DiscoveryEngine[] = ['serper', 'dfs_google', 'dfs_maps', 'dfs_bing', 'brave'];
/** Provedor (segredo do cofre) de cada motor. */
export const ENGINE_SECRET_PROVIDER: Record<DiscoveryEngine, 'serper' | 'dataforseo' | 'brave'> = { serper: 'serper', dfs_google: 'dataforseo', dfs_maps: 'dataforseo', dfs_bing: 'dataforseo', brave: 'brave' };
/** Quais modalidades cada motor atende (o que ele realmente oferece). */
export const ENGINE_MODALITIES: Record<DiscoveryEngine, Modality[]> = {
  serper: ['web', 'places', 'maps', 'news', 'images', 'videos', 'social'],
  dfs_google: ['web', 'social'],
  dfs_maps: ['maps', 'places'],
  dfs_bing: ['web'],
  brave: ['web', 'news', 'images', 'videos', 'social'],
};
/** Valor relativo de cada modalidade para achar CONCORRENTES (web e lugares valem mais; imagens menos). */
export const MODALITY_VALUE: Record<Modality, number> = { web: 1, places: 0.95, maps: 0.9, videos: 0.75, social: 0.7, news: 0.45, images: 0.3 };
/** Preferência entre motores que atendem a mesma modalidade (o mais barato/geral primeiro). */
export const ENGINE_PREFERENCE: DiscoveryEngine[] = ['serper', 'brave', 'dfs_google', 'dfs_maps', 'dfs_bing'];

const CONNECTOR: Record<string, string> = { pt: 'em', en: 'in', es: 'en', fr: 'à', de: 'in', it: 'a', nl: 'in', pl: 'w', tr: 'de' };
/** "tema em lugar" no idioma do Foco; idioma sem conector conhecido usa só "tema lugar" (o buscador entende a vizinhança). */
export function composeQuery(topic: string, place: string, language: string): string {
  const lang = (language || 'en').split('-')[0].toLowerCase();
  const c = CONNECTOR[lang];
  return `${topic.trim()}${place ? ` ${c ? `${c} ` : ''}${place.trim()}` : ''}`.replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------------------------------------------------------ tarefas
export interface DiscoveryTask {
  key: string; focusId: string; placeId: string | null; nodeId: string | null; engine: DiscoveryEngine; modality: Modality; query: string; topic: string;
  country: string; language: string; city: string | null; platform: SocialPlatform | null; priority: number; est_micros: number;
}
export interface FocusIn { id: string; name: string; weight: number; topics: string[]; segmentLabel: string | null; nodeId: string | null; language: string; modalities: Modality[]; status: string }
export interface FocusPlaceIn { focusId: string; place: GeoPlace; weightMult: number; status: string }

/** FNV-1a de 32 bits em hexadecimal (chave curta e estável; não é segurança). */
export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const taskKey = (t: { engine: string; modality: string; country: string; language: string; query: string; platform?: string | null }): string =>
  `${t.engine}.${t.modality}.${fnv(`${t.engine}|${t.modality}|${t.country}|${t.language}|${t.platform ?? ''}|${normName(t.query)}`)}${fnv(normName(t.query)).slice(0, 4)}`;

export interface PriceUnits { [k: string]: { micros: number; verified: boolean } | undefined }
/** Estimativa por consulta (micros de US$) a partir da tabela de preços do teto diário. Preço NÃO verificado continua sendo estimativa e a tela diz isso. */
export function estimateTaskMicros(engine: DiscoveryEngine, modality: Modality, units: PriceUnits): { micros: number; verified: boolean } {
  const key = engine === 'serper' ? 'serper:search' : engine === 'brave' ? 'brave:search' : 'dataforseo:task';
  const u = units[key];
  if (!u) return { micros: 20_000, verified: false }; // sem preço cadastrado: valor conservador, nunca zero
  const factor = engine === 'dfs_maps' || modality === 'maps' ? 2 : 1;
  return { micros: Math.ceil(u.micros * factor), verified: u.verified };
}

export interface GridOptions {
  engines: DiscoveryEngine[]; units: PriceUnits; topicsPerFocus?: number; placesPerFocus?: number; maxTasks?: number;
  /** mercados fora do país do lugar: por padrão o país vem do lugar */
  socialPlatforms?: SocialPlatform[];
  /** consulta a busca web em TODOS os motores ligados que a atendem (mais completo, custa mais); padrão: um motor por modalidade */
  multiWeb?: boolean;
}
export interface GridResult { tasks: DiscoveryTask[]; truncated: boolean; notes: string[]; total_before_cut: number }

/** País do lugar (o código vem do próprio lugar; sem isso, a consulta não nasce). */
const countryOf = (p: GeoPlace) => p.country.toLowerCase();

/**
 * Gera TODAS as consultas do espaço definido e as ordena por prioridade. Cada consulta nasce de um Foco ativo, um tema do Foco (ou o próprio segmento),
 * um lugar aprovado/sugerido do Foco e um motor que atende a modalidade. Um motor por modalidade (o preferido que estiver ligado); redes sociais usam `site:`.
 */
export function generateTasks(focuses: FocusIn[], focusPlaces: FocusPlaceIn[], idx: PlaceIndex, o: GridOptions): GridResult {
  const notes: string[] = [];
  const engines = ENGINE_PREFERENCE.filter((e) => o.engines.includes(e));
  if (!engines.length) return { tasks: [], truncated: false, notes: ['sem_motor_ligado'], total_before_cut: 0 };
  const out: DiscoveryTask[] = [];
  const seen = new Set<string>();
  const topicsCap = o.topicsPerFocus ?? 6; const placesCap = o.placesPerFocus ?? 400;
  for (const f of focuses.filter((x) => x.status === 'ativo')) {
    const topics = [...new Set([f.segmentLabel, ...f.topics, f.name].map((t) => (t ?? '').trim()).filter((t) => t.length >= 2))].slice(0, topicsCap);
    if (!topics.length) { notes.push(`foco_sem_tema:${f.name}`); continue; }
    const fps = focusPlaces.filter((p) => p.focusId === f.id && p.status !== 'rejeitado').sort((a, b) => placeWeight(b.place) * b.weightMult - placeWeight(a.place) * a.weightMult).slice(0, placesCap);
    if (!fps.length) { notes.push(`foco_sem_territorio:${f.name}`); continue; }
    const modalities = f.modalities.length ? f.modalities : (['web'] as Modality[]);
    for (const fp of fps) {
      const label = placeLabel(fp.place, idx);
      const city = fp.place.level === 'municipio' || fp.place.level === 'distrito' || fp.place.level === 'bairro' ? label : null;
      for (const topic of topics) {
        for (const modality of modalities) {
          const capable = engines.filter((e) => ENGINE_MODALITIES[e].includes(modality));
          if (!capable.length) continue;
          const chosen = o.multiWeb && (modality === 'web' || modality === 'social') ? capable : [capable[0]];
          for (const engine of chosen) {
          const platforms: Array<SocialPlatform | null> = modality === 'social' ? (o.socialPlatforms ?? PLATFORMS.filter((p) => p.searchSite && p.id !== 'youtube').map((p) => p.id)) : [null];
          for (const platform of platforms) {
            const base = composeQuery(topic, label, f.language);
            const site = platform ? PLATFORMS.find((p) => p.id === platform)?.searchSite : null;
            const query = site ? `site:${site} ${base}` : base;
            if (query.length < 3 || query.length > 300) continue;
            const t: Omit<DiscoveryTask, 'key' | 'priority' | 'est_micros'> = { focusId: f.id, placeId: fp.place.id, nodeId: f.nodeId, engine, modality: modality === 'social' && engine === 'serper' ? 'social' : modality, query, topic, country: countryOf(fp.place), language: f.language, city, platform };
            const key = taskKey({ ...t });
            if (seen.has(key)) continue;
            seen.add(key);
            const est = estimateTaskMicros(engine, modality, o.units);
            // prioridade: peso do Foco (1-10) x peso do lugar x multiplicador manual x valor da modalidade; temas mais altos na lista pesam um pouco mais
            const topicBoost = 1 - topics.indexOf(topic) * 0.04;
            const priority = Math.round((f.weight / 10) * placeWeight(fp.place) * fp.weightMult * MODALITY_VALUE[modality] * topicBoost * 10_000) / 10_000;
            out.push({ ...t, key, priority, est_micros: est.micros });
          }
          }
        }
      }
    }
  }
  out.sort((a, b) => b.priority - a.priority || a.est_micros - b.est_micros || a.key.localeCompare(b.key));
  const max = o.maxTasks ?? 20_000;
  return { tasks: out.slice(0, max), truncated: out.length > max, notes, total_before_cut: out.length };
}

// ------------------------------------------------------------------------------------------------------------------ ledger de cobertura
export type CoverageStatus = 'planejada' | 'consultada' | 'erro' | 'pulada_orcamento';
export interface CoverageEntry { task_key: string; status: CoverageStatus; cost_micros: number; results: number; new_entities: number; queried_at: string | null; focus_id?: string | null }

export interface BatchInput { tasks: DiscoveryTask[]; ledger: CoverageEntry[]; budgetMicros: number; maxTasks: number; nowMs: number; ttlDays: number }
export interface BatchPlan { selected: DiscoveryTask[]; estimated_micros: number; skipped_covered: number; skipped_budget: number; budget_micros: number }

/** Escolhe o lote: pula o que já foi consultado dentro da validade, ordena por prioridade e para quando o próximo item estoura o orçamento. */
export function planBatch(i: BatchInput): BatchPlan {
  const done = new Map(i.ledger.map((e) => [e.task_key, e]));
  const fresh = (e: CoverageEntry | undefined) => !!e && e.status === 'consultada' && !!e.queried_at && i.nowMs - Date.parse(e.queried_at) < i.ttlDays * 86_400_000;
  const selected: DiscoveryTask[] = []; let spent = 0; let covered = 0; let budgetSkips = 0;
  for (const t of i.tasks) {
    if (fresh(done.get(t.key))) { covered++; continue; }
    if (selected.length >= i.maxTasks) break;
    if (spent + t.est_micros > i.budgetMicros) { budgetSkips++; continue; }
    selected.push(t); spent += t.est_micros;
  }
  return { selected, estimated_micros: spent, skipped_covered: covered, skipped_budget: budgetSkips, budget_micros: i.budgetMicros };
}

export interface CoverageSummary {
  planned_total: number; done: number; pending: number; errors: number; skipped_budget: number; cost_micros: number; last_queried_at: string | null; pct_done: number;
  by_focus: Array<{ focus_id: string | null; total: number; done: number; pending: number }>;
}
/** O que foi consultado e o que falta (sobre as tarefas geradas), com custo e data. `pending` = tarefa gerada ainda sem consulta válida. */
export function coverageSummary(tasks: Array<Pick<DiscoveryTask, 'key' | 'focusId'>>, ledger: CoverageEntry[]): CoverageSummary {
  const by = new Map(ledger.map((e) => [e.task_key, e]));
  const focus = new Map<string | null, { total: number; done: number; pending: number }>();
  let done = 0; let errors = 0; let skipped = 0;
  for (const t of tasks) {
    const e = by.get(t.key); const f = focus.get(t.focusId) ?? { total: 0, done: 0, pending: 0 };
    f.total++;
    if (e?.status === 'consultada') { done++; f.done++; } else { f.pending++; if (e?.status === 'erro') errors++; if (e?.status === 'pulada_orcamento') skipped++; }
    focus.set(t.focusId, f);
  }
  const cost = ledger.reduce((s, e) => s + (e.cost_micros || 0), 0);
  const last = ledger.map((e) => e.queried_at).filter((x): x is string => !!x).sort().pop() ?? null;
  return { planned_total: tasks.length, done, pending: tasks.length - done, errors, skipped_budget: skipped, cost_micros: cost, last_queried_at: last, pct_done: tasks.length ? Math.round((1000 * done) / tasks.length) / 10 : 0, by_focus: [...focus.entries()].map(([focus_id, v]) => ({ focus_id, ...v })) };
}

// ------------------------------------------------------------------------------------------------------------------ saturação
export interface RoundStat { queries: number; new_entities: number; total_entities: number }
export interface Saturation { rounds: number; recent_new_rate: number | null; trending_to_zero: boolean; saturated: boolean; message_key: 'sem_rodadas' | 'poucas_rodadas' | 'ainda_descobrindo' | 'tendendo_a_zero' | 'saturado' }
export const SATURATION_WINDOW = 3;
export const SATURATION_THRESHOLD = 0.02;
/**
 * Saturação = concorrentes NOVOS por rodada em relação ao total já conhecido, nas últimas 3 rodadas com consulta.
 *  - saturado: 3 rodadas seguidas com taxa <= 2%;  - tendendo a zero: a taxa não sobe e a última é menor que a primeira da janela.
 * Mede o espaço consultado, não "tudo o que existe": um espaço mal definido satura cedo e esconde concorrentes fora dele.
 */
export function saturationOf(rounds: RoundStat[]): Saturation {
  const used = rounds.filter((r) => r.queries > 0);
  if (!used.length) return { rounds: 0, recent_new_rate: null, trending_to_zero: false, saturated: false, message_key: 'sem_rodadas' };
  const win = used.slice(-SATURATION_WINDOW);
  const rate = (r: RoundStat) => (r.total_entities > 0 ? r.new_entities / r.total_entities : r.new_entities > 0 ? 1 : 0);
  const rates = win.map(rate);
  const recent = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 1000) / 1000;
  if (used.length < SATURATION_WINDOW) return { rounds: used.length, recent_new_rate: recent, trending_to_zero: false, saturated: false, message_key: 'poucas_rodadas' };
  const saturated = rates.every((r) => r <= SATURATION_THRESHOLD);
  const trending = !saturated && rates.every((r, k) => k === 0 || r <= rates[k - 1] + 1e-9) && rates[rates.length - 1] < rates[0];
  return { rounds: used.length, recent_new_rate: recent, trending_to_zero: trending, saturated, message_key: saturated ? 'saturado' : trending ? 'tendendo_a_zero' : 'ainda_descobrindo' };
}

// ------------------------------------------------------------------------------------------------------------------ chamadas aos provedores
export interface ProviderCall { url: string; init: RequestInit }
const basic = (cred: string) => { let bin = ''; for (const b of new TextEncoder().encode(cred)) bin += String.fromCharCode(b); return `Basic ${btoa(bin)}`; };
const lang2 = (l: string) => (l || 'en').split('-')[0].toLowerCase();

/** Monta a chamada HTTP de uma tarefa. O segredo só entra no cabeçalho (nunca na URL, exceto onde o provedor exige) e nunca é devolvido ao cliente. */
export function buildProviderCall(t: DiscoveryTask, secret: string): ProviderCall | null {
  if (!secret) return null;
  if (t.engine === 'serper') {
    const type = ({ web: 'search', social: 'search', places: 'places', maps: 'maps', news: 'news', images: 'images', videos: 'videos' } as Record<string, string>)[t.modality];
    const r = serperRequest({ serperType: type, query: t.query, country: t.country, language: t.language, city: t.modality === 'maps' ? t.city ?? undefined : undefined, page: 1 });
    if (!r) return null;
    return { url: r.url, init: { method: 'POST', headers: { 'X-API-KEY': secret, 'Content-Type': 'application/json' }, body: JSON.stringify(r.payload) } };
  }
  if (t.engine === 'brave') {
    const path = ({ web: 'web', social: 'web', news: 'news', images: 'images', videos: 'videos' } as Record<string, string>)[t.modality];
    if (!path) return null;
    const p = new URLSearchParams({ q: t.query.slice(0, 400), country: t.country.toUpperCase(), search_lang: lang2(t.language), count: '20' });
    return { url: `https://api.search.brave.com/res/v1/${path}/search?${p.toString()}`, init: { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': secret } } };
  }
  const code = DATAFORSEO_LOCATION_CODES[t.country.toLowerCase()];
  if (!code || !secret.includes(':')) return null;
  const path = t.engine === 'dfs_maps' ? 'serp/google/maps/live/advanced' : t.engine === 'dfs_bing' ? 'serp/bing/organic/live/advanced' : 'serp/google/organic/live/advanced';
  const task: Record<string, unknown> = { keyword: t.query.slice(0, 700), location_code: code, language_code: lang2(t.language), depth: t.engine === 'dfs_maps' ? 20 : 20 };
  return { url: `https://api.dataforseo.com/v3/${path}`, init: { method: 'POST', headers: { Authorization: basic(secret), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify([task]) } };
}

// ------------------------------------------------------------------------------------------------------------------ leitores de resposta
export type HitKind = 'organico' | 'noticia' | 'imagem' | 'video' | 'mapa';
export interface Hit { kind: HitKind; position: number; url: string; title: string | null; snippet: string | null; date: string | null; source: string | null }
export interface Listing { ref: string; name: string; address: string | null; rating: number | null; reviews: number | null; categories: string[]; phone: string | null; website: string | null; lat: number | null; lon: number | null; position: number | null }
export interface Parsed { hits: Hit[]; listings: Listing[]; cost_micros: number | null }

const s = (v: unknown, n = 600): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const n0 = (v: unknown): number | null => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const okUrl = (v: unknown): string | null => { const u = s(v, 1000); if (!u) return null; try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export function parseSerper(modality: Modality, json: unknown): Parsed {
  const d = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const hits: Hit[] = []; const listings: Listing[] = [];
  const arr = (k: string) => (Array.isArray(d[k]) ? d[k] as Array<Record<string, unknown>> : []);
  if (modality === 'web' || modality === 'social') {
    for (const [i, r] of arr('organic').entries()) { const url = okUrl(r.link); if (url) hits.push({ kind: 'organico', position: n0(r.position) ?? i + 1, url, title: s(r.title, 300), snippet: s(r.snippet), date: s(r.date, 40), source: null }); }
    for (const [i, r] of arr('places').entries()) listings.push(...listingFrom(r, i + 1));
  } else if (modality === 'places' || modality === 'maps') {
    for (const [i, r] of arr('places').entries()) listings.push(...listingFrom(r, i + 1));
  } else if (modality === 'news') {
    for (const [i, r] of arr('news').entries()) { const url = okUrl(r.link); if (url) hits.push({ kind: 'noticia', position: i + 1, url, title: s(r.title, 300), snippet: s(r.snippet), date: s(r.date, 40), source: s(r.source, 120) }); }
  } else if (modality === 'images') {
    for (const [i, r] of arr('images').entries()) { const url = okUrl(r.link); if (url) hits.push({ kind: 'imagem', position: i + 1, url, title: s(r.title, 300), snippet: null, date: null, source: s(r.source, 120) }); }
  } else if (modality === 'videos') {
    for (const [i, r] of arr('videos').entries()) { const url = okUrl(r.link); if (url) hits.push({ kind: 'video', position: i + 1, url, title: s(r.title, 300), snippet: s(r.snippet), date: s(r.date, 40), source: s(r.channel, 120) ?? s(r.source, 120) }); }
  }
  return { hits, listings, cost_micros: null };
}
function listingFrom(r: Record<string, unknown>, pos: number): Listing[] {
  const name = s(r.title, 200); if (!name) return [];
  const ref = s(r.cid, 200) ?? s(r.placeId, 200) ?? s(r.fid, 200) ?? `${normName(name)}|${normName(s(r.address, 200) ?? '')}`.slice(0, 200);
  const cat = [s(r.category, 80), ...(Array.isArray(r.types) ? r.types.map((x) => s(x, 80)) : [])].filter((x): x is string => !!x);
  return [{ ref, name, address: s(r.address, 400), rating: r.rating === undefined ? null : n0(r.rating), reviews: r.ratingCount === undefined ? null : n0(r.ratingCount), categories: [...new Set(cat)].slice(0, 6), phone: s(r.phoneNumber, 60), website: okUrl(r.website), lat: n0(r.latitude), lon: n0(r.longitude), position: n0(r.position) ?? pos }];
}

type DfsItem = Record<string, unknown>;
const dfsItems = (json: unknown): { items: DfsItem[]; ok: boolean; cost: number | null } => {
  const d = json as { status_code?: number; cost?: number; tasks?: Array<{ status_code?: number; cost?: number; result?: Array<{ items?: DfsItem[] }> }> };
  const task = Array.isArray(d?.tasks) ? d.tasks[0] : undefined;
  const ok = d?.status_code === 20000 && task?.status_code === 20000;
  const cost = typeof task?.cost === 'number' ? Math.round(task.cost * 1_000_000) : typeof d?.cost === 'number' ? Math.round(d.cost * 1_000_000) : null;
  return { items: ok && Array.isArray(task?.result?.[0]?.items) ? task!.result![0].items! : [], ok, cost };
};
export function parseDfs(engine: DiscoveryEngine, json: unknown): Parsed & { ok: boolean } {
  const { items, ok, cost } = dfsItems(json);
  const hits: Hit[] = []; const listings: Listing[] = [];
  for (const it of items) {
    if (it.type === 'organic') { const url = okUrl(it.url); if (url) hits.push({ kind: 'organico', position: n0(it.rank_group) ?? n0(it.rank_absolute) ?? hits.length + 1, url, title: s(it.title, 300), snippet: s(it.description), date: null, source: null }); }
    else if (it.type === 'maps_search' || it.type === 'maps_paid_item') {
      const name = s(it.title, 200); if (!name) continue;
      const r = (it.rating && typeof it.rating === 'object' ? it.rating : {}) as Record<string, unknown>;
      listings.push({ ref: s(it.cid, 200) ?? s(it.place_id, 200) ?? `${normName(name)}|${normName(s(it.address, 200) ?? '')}`.slice(0, 200), name, address: s(it.address, 400), rating: n0(r.value), reviews: n0(r.votes_count), categories: [s(it.category, 80), ...(Array.isArray(it.additional_categories) ? it.additional_categories.map((x) => s(x, 80)) : [])].filter((x): x is string => !!x).slice(0, 6), phone: s(it.phone, 60), website: okUrl(it.url) ?? (s(it.domain, 200) ? `https://${s(it.domain, 200)}/` : null), lat: n0(it.latitude), lon: n0(it.longitude), position: n0(it.rank_group) ?? n0(it.rank_absolute) });
    }
  }
  void engine;
  return { hits, listings, cost_micros: cost, ok };
}

export function parseBrave(modality: Modality, json: unknown): Parsed {
  const d = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const list = (modality === 'web' || modality === 'social' ? (d.web as { results?: unknown } | undefined)?.results : d.results) as Array<Record<string, unknown>> | undefined;
  const hits: Hit[] = [];
  for (const [i, r] of (Array.isArray(list) ? list : []).entries()) {
    const url = okUrl(r.url); if (!url) continue;
    const kind: HitKind = modality === 'news' ? 'noticia' : modality === 'images' ? 'imagem' : modality === 'videos' ? 'video' : 'organico';
    hits.push({ kind, position: i + 1, url, title: s(r.title, 300), snippet: s(r.description), date: s(r.age, 40) ?? s(r.page_age, 40), source: s((r.meta_url as Record<string, unknown> | undefined)?.hostname, 120) });
  }
  return { hits, listings: [], cost_micros: null };
}

/** Resposta do provedor -> hits e listagens (um ponto só para o executor). */
export function parseProviderResponse(t: Pick<DiscoveryTask, 'engine' | 'modality'>, json: unknown): Parsed & { ok: boolean } {
  if (t.engine === 'serper') return { ...parseSerper(t.modality, json), ok: !!json && typeof json === 'object' };
  if (t.engine === 'brave') return { ...parseBrave(t.modality, json), ok: !!json && typeof json === 'object' };
  return parseDfs(t.engine, json);
}

// ------------------------------------------------------------------------------------------------------------------ backlinks pagos (DataForSEO)
export function buildDfsBacklinksCall(target: string, secret: string): ProviderCall | null {
  const host = target.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || !secret.includes(':')) return null;
  return { url: 'https://api.dataforseo.com/v3/backlinks/summary/live', init: { method: 'POST', headers: { Authorization: basic(secret), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify([{ target: host, include_subdomains: true }]) } };
}
export interface BacklinkSummary { backlinks: number | null; referring_domains: number | null; rank: number | null; spam_score: number | null; cost_micros: number | null }
export function parseDfsBacklinks(json: unknown): BacklinkSummary | null {
  const { items, ok, cost } = dfsItems({ ...(json as object), tasks: ((json as { tasks?: Array<{ result?: unknown[] }> })?.tasks ?? []).map((t) => ({ ...t, result: [{ items: Array.isArray(t.result) ? t.result : [] }] })) });
  const r = (ok ? items[0] : null) as DfsItem | null;
  if (!r) return null;
  return { backlinks: n0(r.backlinks), referring_domains: n0(r.referring_domains), rank: n0(r.rank), spam_score: n0(r.backlinks_spam_score), cost_micros: cost };
}

export const MODALITY_LIST = MODALITIES;
