/**
 * Radar de Mercado, placar, tendência, "onde atacar", retrato agregado, sobreposição na árvore e Livro de pontas soltas. Regras puras.
 *
 * O score é SEMPRE rotulado "estimado" (nunca é a nota do Google, nem DR/Domain Authority). Componentes transparentes, cada um com os fatos que o formaram.
 * Componente sem dado fica "sem dados" e SAI da conta (o score é a média ponderada só do que existe); abaixo de 30% de cobertura de peso o score não é mostrado.
 */
import { nameTokens, candidatesFor, type EntityBook } from './radar-entity-core.ts';
import { placeWeight, type GeoPlace } from './radar-geo-core.ts';
import type { SiteScan } from './radar-enrich-core.ts';

export const SCORE_LABEL = 'estimado' as const;
export const SCORE_DISCLAIMER = 'Score de força ESTIMADO pelo Zica a partir de buscas, mapas, varredura do site e fontes gratuitas. Não é a nota do Google, nem DR, nem Domain Authority.';
export const MIN_COVERAGE = 0.3;

export type ComponentKey = 'serp' | 'maps' | 'content' | 'local' | 'authority' | 'ai' | 'reviews' | 'social';
export const WEIGHTS: Record<ComponentKey, number> = { serp: 22, maps: 13, content: 14, local: 9, authority: 9, ai: 14, reviews: 9, social: 10 };
export interface ScoreComponent { key: ComponentKey; weight: number; value: number | null; facts: Record<string, unknown> }
export interface ScoreResult { score: number | null; coverage: number; label: typeof SCORE_LABEL; components: ScoreComponent[] }

// ------------------------------------------------------------------------------------------------------------------ evidência
export interface Evidence {
  serp: { tasks: number; appearances: number; best_positions: number[] } | null;
  maps: { tasks: number; appearances: number; best_positions: number[] } | null;
  scan: SiteScan | null;
  authority_opr: number | null;
  ai: { prompts_total: number; prompts_cited: number } | null;
  reviews: { rating: number; count: number } | null;
  social: { tasks: number; platforms: string[]; active: boolean } | null;
}

/** Pontos por posição (1 = 100). Curva própria do Zica para ordenar, não é taxa de clique. */
export function positionPoints(pos: number): number {
  if (pos <= 1) return 100; if (pos === 2) return 85; if (pos === 3) return 72; if (pos <= 5) return 55; if (pos <= 10) return 35; if (pos <= 20) return 15; return 5;
}
const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

function presenceValue(x: { tasks: number; appearances: number; best_positions: number[] } | null) {
  if (!x || x.tasks <= 0) return null;
  const share = Math.min(1, x.appearances / x.tasks);
  const avgPts = x.best_positions.length ? x.best_positions.reduce((a, b) => a + positionPoints(b), 0) / x.best_positions.length : 0;
  return { value: clamp(100 * (0.55 * share + 0.45 * (avgPts / 100))), facts: { tarefas: x.tasks, apareceu_em: x.appearances, posicao_media: x.best_positions.length ? round1(x.best_positions.reduce((a, b) => a + b, 0) / x.best_positions.length) : null } };
}

export function scoreEvidence(e: Evidence): ScoreResult {
  const comps: ScoreComponent[] = [];
  const add = (key: ComponentKey, v: { value: number; facts: Record<string, unknown> } | null) => comps.push({ key, weight: WEIGHTS[key], value: v ? round1(v.value) : null, facts: v?.facts ?? {} });
  add('serp', presenceValue(e.serp));
  add('maps', presenceValue(e.maps));
  const s = e.scan;
  add('content', s && s.content.sampled > 0 ? (() => {
    const words = s.content.words_avg ?? 0; const variety = Math.min(1, s.content.types_seen.length / 6); const size = s.sitemap.urls ? Math.min(1, Math.log10(s.sitemap.urls + 1) / 3) : 0;
    return { value: clamp(100 * (0.6 * Math.min(1, words / 1500) + 0.25 * variety + 0.15 * size)), facts: { palavras_medias: words, tipos_de_pagina: s.content.types_seen.length, urls_no_sitemap: s.sitemap.urls } };
  })() : null);
  add('local', s && s.status !== 'erro' && s.status !== 'bloqueado_pelo_robots' && s.content.sampled > 0 ? (() => {
    const sc = s.schema; const checks = { schema_local: !!sc?.isLocal, telefone: s.nap.phones.length > 0, endereco: !!s.nap.address, horario: !!sc?.openingHours, area_atendida: (sc?.areaServed.length ?? 0) > 0, geo_ou_mapa: !!sc?.geo };
    const n = Object.values(checks).filter(Boolean).length;
    return { value: (100 * n) / Object.keys(checks).length, facts: checks };
  })() : null);
  add('authority', e.authority_opr === null ? null : { value: clamp(e.authority_opr * 10), facts: { open_pagerank: e.authority_opr } });
  add('ai', e.ai && e.ai.prompts_total > 0 ? { value: clamp((100 * e.ai.prompts_cited) / e.ai.prompts_total), facts: { perguntas_com_citacao: e.ai.prompts_cited, perguntas_observadas: e.ai.prompts_total } } : null);
  add('reviews', e.reviews ? { value: clamp((e.reviews.rating / 5) * 100 * Math.min(1, Math.log10(1 + e.reviews.count) / 2)), facts: { nota: e.reviews.rating, avaliacoes: e.reviews.count } } : null);
  add('social', e.social && e.social.tasks > 0 ? { value: clamp(60 * Math.min(1, e.social.platforms.length / 4) + (e.social.active ? 40 : 0)), facts: { plataformas: e.social.platforms, com_atividade_publica: e.social.active } } : null);
  const have = comps.filter((c) => c.value !== null);
  const total = comps.reduce((a, c) => a + c.weight, 0); const got = have.reduce((a, c) => a + c.weight, 0);
  const coverage = Math.round((got / total) * 1000) / 1000;
  const score = got > 0 && coverage >= MIN_COVERAGE ? round1(have.reduce((a, c) => a + (c.value as number) * c.weight, 0) / got) : null;
  return { score, coverage, label: SCORE_LABEL, components: comps };
}

// ------------------------------------------------------------------------------------------------------------------ tendência
export type Direction = 'subindo' | 'caindo' | 'estavel' | 'sem_dados';
export interface Trend { direction: Direction; delta: number | null; points: number }
export const TREND_THRESHOLD = 3;
/** Monday (UTC) da semana de uma data: chave da série semanal. */
export function weekKey(ms: number): string {
  const d = new Date(ms); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10);
}
/** Compara as 2 últimas semanas com as 2 anteriores (ou a última com a primeira, com 2 ou 3 pontos). Diferença menor que 3 pontos = estável. Menos de 2 semanas = sem dados. */
export function trendOf(series: Array<{ week: string; score: number | null }>): Trend {
  const pts = series.filter((p): p is { week: string; score: number } => p.score !== null).sort((a, b) => a.week.localeCompare(b.week));
  if (pts.length < 2) return { direction: 'sem_dados', delta: null, points: pts.length };
  const avg = (xs: typeof pts) => xs.reduce((a, b) => a + b.score, 0) / xs.length;
  const recent = pts.length >= 4 ? pts.slice(-2) : [pts[pts.length - 1]];
  const before = pts.length >= 4 ? pts.slice(-4, -2) : [pts[0]];
  const delta = Math.round((avg(recent) - avg(before)) * 10) / 10;
  return { direction: delta >= TREND_THRESHOLD ? 'subindo' : delta <= -TREND_THRESHOLD ? 'caindo' : 'estavel', delta, points: pts.length };
}

// ------------------------------------------------------------------------------------------------------------------ onde atacar
/** Curva de cliques por posição GENÉRICA (médias do setor): só para ordenar oportunidades, nunca como previsão do seu site. */
export const CTR_CURVE: Record<number, number> = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.065, 6: 0.05, 7: 0.04, 8: 0.032, 9: 0.028, 10: 0.024 };
export const ctrAt = (pos: number) => (pos <= 10 ? CTR_CURVE[Math.max(1, Math.round(pos))] : pos <= 20 ? 0.012 : 0.004);

export type AttackKind = 'posicao_4_20' | 'territorio_fraco' | 'lacuna_serp' | 'buraco_maps' | 'correcao_barata';
export interface AttackItem { id: string; kind: AttackKind; priority: number; focus_id: string | null; place_id: string | null; node_id: string | null; title: string; why: string; what: string; facts: Record<string, unknown> }

export interface GscRow { query: string; page: string | null; position: number; impressions: number; clicks: number }
export interface FocusLite { id: string; name: string; weight: number; node_id: string | null; status: string; topics: string[]; segment_label?: string | null }
export interface CompLite { id: string; name: string; kind: string; primary_host: string | null; is_own: boolean; status: string; merged_into: string | null; authority?: Record<string, unknown> }
export interface IdLite { id: string; competitor_id: string | null; platform: string; kind: string; metrics: Record<string, unknown>; metrics_label: string; display?: string | null; handle?: string | null; evidence?: Record<string, unknown> }
export interface PageLite { competitor_id: string | null; focus_id: string | null; place_id: string | null; node_id: string | null; position: number | null; modality: string; query_key: string | null; url: string; page_type?: string | null }
export interface ListingLite { competitor_id: string | null; focus_id: string | null; place_id: string | null; rating: number | null; reviews: number | null; position: number | null }
export interface LinkLite { competitor_id: string; focus_id: string | null; place_id: string | null; node_id: string | null }
export interface CoverageLite { task_key: string; focus_id: string | null; place_id: string | null; node_id: string | null; modality: string; status: string; query: string }
export interface NodeLite { id: string; label: string; slug: string; kind: string; parent_id: string | null; status: string }
export interface AiRow { host: string; query: string; is_own: boolean; focus_id: string | null }
export interface Snapshot {
  now: number; focuses: FocusLite[]; places: Map<string, GeoPlace>; focusPlaces: Array<{ focus_id: string; place_id: string; status: string }>; nodes: NodeLite[];
  competitors: CompLite[]; identities: IdLite[]; pages: PageLite[]; listings: ListingLite[]; scans: Map<string, SiteScan>; links: LinkLite[]; coverage: CoverageLite[];
  ai: AiRow[]; aiPromptsTotal: number; gsc: GscRow[]; prompts: Array<{ id: string; query: string; topic: string | null }>;
}

const alive = (c: CompLite) => !c.merged_into && c.status !== 'ignorado' && c.kind !== 'diretorio';
const hostOf = (c: CompLite) => (c.primary_host ?? '').toLowerCase();

export interface Scope { focus_id: string | null; place_id: string | null; node_id?: string | null }
const inScope = (r: { focus_id: string | null; place_id: string | null; node_id?: string | null }, s: Scope) => (!s.focus_id || r.focus_id === s.focus_id) && (!s.place_id || r.place_id === s.place_id) && (!s.node_id || r.node_id === s.node_id);

/** Evidência de UM concorrente (ou do próprio negócio) num escopo (Foco, lugar, nó). */
export function evidenceFor(snap: Snapshot, c: CompLite, s: Scope): Evidence {
  const tasks = (mods: string[]) => snap.coverage.filter((t) => t.status === 'consultada' && mods.includes(t.modality) && inScope(t, s));
  const webTasks = tasks(['web']); const mapTasks = tasks(['maps', 'places']); const socTasks = tasks(['social', 'videos']);
  const myPages = snap.pages.filter((p) => p.competitor_id === c.id && inScope(p, s));
  const best = (keys: string[], list: Array<{ query_key: string | null; position: number | null }>) => {
    const m = new Map<string, number>();
    for (const p of list) if (p.query_key && keys.includes(p.query_key) && p.position != null) m.set(p.query_key, Math.min(m.get(p.query_key) ?? 999, p.position));
    return m;
  };
  const web = best(webTasks.map((t) => t.task_key), myPages.filter((p) => p.modality === 'web'));
  const myListings = snap.listings.filter((l) => l.competitor_id === c.id && inScope(l, s));
  const mapPositions = myListings.filter((l) => l.position != null).map((l) => l.position as number);
  const ids = snap.identities.filter((i) => i.competitor_id === c.id);
  const platforms = [...new Set(ids.filter((i) => i.platform !== 'site' && i.platform !== 'gbp').map((i) => i.platform))];
  const active = ids.some((i) => { const m = i.metrics as Record<string, number>; return (m.last_30d ?? 0) > 0 || (m.followers ?? 0) > 0 || (m.subscribers ?? 0) > 0 || (m.videos ?? 0) > 0; });
  const rated = myListings.filter((l) => l.rating != null && l.reviews != null).sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0))[0];
  const scan = snap.scans.get(c.id) ?? null;
  const schemaRating = scan?.schema?.rating ?? null;
  const aiRows = snap.ai.filter((a) => !s.focus_id || a.focus_id === s.focus_id);
  const aiTotal = new Set(aiRows.map((a) => a.query)).size || (s.focus_id ? 0 : snap.aiPromptsTotal);
  const reg = hostOf(c);
  const cited = new Set(aiRows.filter((a) => (c.is_own ? a.is_own : !!reg && (a.host === reg || a.host.endsWith(`.${reg}`)))).map((a) => a.query)).size;
  const opr = typeof c.authority?.opr === 'number' ? c.authority.opr as number : null;
  return {
    serp: webTasks.length ? { tasks: webTasks.length, appearances: web.size, best_positions: [...web.values()] } : null,
    maps: mapTasks.length ? { tasks: mapTasks.length, appearances: myListings.length, best_positions: mapPositions } : null,
    scan, authority_opr: opr,
    ai: aiTotal > 0 ? { prompts_total: aiTotal, prompts_cited: Math.min(cited, aiTotal) } : null,
    reviews: rated ? { rating: rated.rating as number, count: rated.reviews as number } : schemaRating ? { rating: schemaRating.value, count: schemaRating.count } : null,
    social: socTasks.length ? { tasks: socTasks.length, platforms, active } : null,
  };
}

export interface ScoredCompetitor { competitor: CompLite; scope: Scope; result: ScoreResult }
export function scoreBoard(snap: Snapshot, s: Scope, opts: { includeOwn?: boolean } = {}): ScoredCompetitor[] {
  return snap.competitors.filter((c) => alive(c) && (opts.includeOwn !== false || !c.is_own)).map((c) => ({ competitor: c, scope: s, result: scoreEvidence(evidenceFor(snap, c, s)) }))
    .sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1) || a.competitor.name.localeCompare(b.competitor.name));
}

const tokOverlap = (a: string, b: string) => { const ta = new Set(nameTokens(a)); const tb = new Set(nameTokens(b)); if (!ta.size || !tb.size) return 0; let i = 0; for (const t of ta) if (tb.has(t)) i++; return i / Math.min(ta.size, tb.size); };

export function attackList(snap: Snapshot, o: { minImpressions?: number; limit?: number } = {}): AttackItem[] {
  const out: AttackItem[] = [];
  const minImp = o.minImpressions ?? 50;
  const focusById = new Map(snap.focuses.map((f) => [f.id, f]));
  const own = snap.competitors.find((c) => c.is_own && !c.merged_into) ?? null;
  const rivals = snap.competitors.filter((c) => alive(c) && !c.is_own);
  const ownPages = own ? snap.pages.filter((p) => p.competitor_id === own.id) : [];

  // 1) posições 4 a 20 com impressões do Search Console
  for (const g of snap.gsc) {
    if (g.position < 4 || g.position > 20 || g.impressions < minImp) continue;
    const gain = g.impressions * (ctrAt(3) - ctrAt(g.position));
    if (gain <= 0) continue;
    let focus: FocusLite | null = null; let best = 0;
    for (const f of snap.focuses.filter((x) => x.status === 'ativo')) { const ov = Math.max(tokOverlap(g.query, f.name), ...f.topics.map((t) => tokOverlap(g.query, t)), 0); if (ov > best) { best = ov; focus = f; } }
    out.push({
      id: `p420:${g.query}`, kind: 'posicao_4_20', priority: Math.round(gain * (focus ? 0.5 + focus.weight / 20 : 0.7) * 10) / 10, focus_id: focus?.id ?? null, place_id: null, node_id: focus?.node_id ?? null,
      title: g.query, why: `Está na posição ${String(Math.round(g.position * 10) / 10).replace('.', ',')} com ${g.impressions.toLocaleString('pt-BR')} impressões. Chegar à 3ª posição renderia cerca de ${Math.round(gain).toLocaleString('pt-BR')} cliques a mais no mesmo período (curva genérica de cliques, estimada).`,
      what: g.page ? `Reforce a página ${g.page}: título e H1 com a busca, resposta direta no início, FAQ, links internos de páginas relacionadas e prova local.` : 'Crie ou reforce a página que responde a essa busca.', facts: { posicao: g.position, impressoes: g.impressions, cliques: g.clicks, pagina: g.page },
    });
  }

  // 2) territórios onde o melhor concorrente é fraco
  for (const f of snap.focuses.filter((x) => x.status === 'ativo')) {
    for (const fp of snap.focusPlaces.filter((p) => p.focus_id === f.id && p.status !== 'rejeitado')) {
      const place = snap.places.get(fp.place_id); if (!place) continue;
      // só há conclusão sobre um território que FOI consultado (sem busca ali, o score só refletiria o site inteiro)
      if (!snap.coverage.some((c) => c.focus_id === f.id && c.place_id === fp.place_id && c.status === 'consultada')) continue;
      const scope: Scope = { focus_id: f.id, place_id: fp.place_id };
      const board = scoreBoard(snap, scope, { includeOwn: false }).filter((r) => r.result.score !== null);
      if (!board.length) continue;
      const top = board[0];
      if ((top.result.score as number) >= 40) continue;
      const weak = 100 - (top.result.score as number);
      out.push({ id: `fraco:${f.id}:${fp.place_id}`, kind: 'territorio_fraco', priority: Math.round((f.weight / 10) * placeWeight(place) * weak * 10) / 10 / 2, focus_id: f.id, place_id: fp.place_id, node_id: f.node_id, title: `${f.name} em ${place.name}`, why: `O melhor concorrente mapeado aqui (${top.competitor.name}) tem score estimado de ${top.result.score}: o território está fraco.`, what: 'Crie a página local e o perfil local deste território com conteúdo próprio, endereço/atendimento e prova.', facts: { melhor_concorrente: top.competitor.name, score: top.result.score, concorrentes_mapeados: board.length } });
    }
  }

  // 3) lacuna na busca: concorrentes no topo e nós ausentes
  const webTasks = snap.coverage.filter((t) => t.status === 'consultada' && t.modality === 'web');
  const group = new Map<string, { focus_id: string | null; place_id: string | null; queries: string[]; rivals: Set<string> }>();
  for (const t of webTasks) {
    const rivalHere = new Set(snap.pages.filter((p) => p.query_key === t.task_key && p.position != null && p.position <= 10 && p.competitor_id && rivals.some((r) => r.id === p.competitor_id)).map((p) => p.competitor_id as string));
    const ownHere = own ? ownPages.some((p) => p.query_key === t.task_key && p.position != null && p.position <= 20) : false;
    if (rivalHere.size >= 2 && !ownHere) {
      const k = `${t.focus_id}|${t.place_id}`; const g = group.get(k) ?? { focus_id: t.focus_id, place_id: t.place_id, queries: [], rivals: new Set<string>() };
      g.queries.push(t.query); rivalHere.forEach((r) => g.rivals.add(r)); group.set(k, g);
    }
  }
  for (const [k, g] of group) {
    const f = g.focus_id ? focusById.get(g.focus_id) : null; const place = g.place_id ? snap.places.get(g.place_id) : null;
    out.push({ id: `lacuna:${k}`, kind: 'lacuna_serp', priority: Math.round(((f?.weight ?? 5) / 10) * (place ? placeWeight(place) : 0.5) * g.rivals.size * g.queries.length * 8 * 10) / 10, focus_id: g.focus_id, place_id: g.place_id, node_id: f?.node_id ?? null, title: `${f?.name ?? 'Foco'}${place ? ` em ${place.name}` : ''}`, why: `${g.rivals.size} concorrentes aparecem no topo em ${g.queries.length} busca(s) e o seu site não aparece (nem entre os 20 primeiros).`, what: 'Crie a página que responde a essas buscas (uma por tema e território) ou reforce a existente.', facts: { buscas: g.queries.slice(0, 5), concorrentes: g.rivals.size } });
  }

  // 4) buraco no Maps
  const mapGroups = new Map<string, { focus_id: string | null; place_id: string | null; rivals: Set<string> }>();
  for (const l of snap.listings) {
    if (!l.competitor_id || !rivals.some((r) => r.id === l.competitor_id)) continue;
    const k = `${l.focus_id}|${l.place_id}`; const g = mapGroups.get(k) ?? { focus_id: l.focus_id, place_id: l.place_id, rivals: new Set<string>() }; g.rivals.add(l.competitor_id); mapGroups.set(k, g);
  }
  for (const [k, g] of mapGroups) {
    const ownHere = own ? snap.listings.some((l) => l.competitor_id === own.id && l.focus_id === g.focus_id && l.place_id === g.place_id) : false;
    if (g.rivals.size < 2 || ownHere) continue;
    const f = g.focus_id ? focusById.get(g.focus_id) : null; const place = g.place_id ? snap.places.get(g.place_id) : null;
    out.push({ id: `maps:${k}`, kind: 'buraco_maps', priority: Math.round(((f?.weight ?? 5) / 10) * (place ? placeWeight(place) : 0.5) * g.rivals.size * 10 * 10) / 10, focus_id: g.focus_id, place_id: g.place_id, node_id: f?.node_id ?? null, title: `${f?.name ?? 'Foco'}${place ? ` em ${place.name}` : ''}`, why: `${g.rivals.size} concorrentes têm perfil no Maps neste território e você não aparece.`, what: 'Crie ou reivindique o perfil local (se houver endereço real e atendimento no local), com categorias, horários, fotos e pedido de avaliações.', facts: { concorrentes_no_maps: g.rivals.size } });
  }

  // 5) correções baratas: o que a maioria dos concorrentes varridos tem e o seu site não
  const ownScan = own ? snap.scans.get(own.id) : null;
  if (ownScan) {
    const rivalScans = rivals.map((r) => snap.scans.get(r.id)).filter((s): s is SiteScan => !!s && s.content.sampled > 0);
    const checks: Array<[string, string, (s: SiteScan) => boolean, string]> = [
      ['llms_txt', 'arquivo llms.txt', (s) => s.llms_txt.present, 'Publique um llms.txt curto na raiz do site descrevendo a empresa, as áreas e as páginas principais.'],
      ['schema_local', 'schema de negócio local', (s) => !!s.schema?.isLocal, 'Adicione o schema de negócio local (nome, endereço, telefone, horário, área atendida) na página inicial.'],
      ['same_as', 'perfis ligados no schema (sameAs)', (s) => (s.schema?.sameAs.length ?? 0) >= 2, 'Liste os perfis oficiais (Maps, redes, YouTube) no sameAs do schema e linke-os no rodapé.'],
      ['faq', 'perguntas frequentes marcadas (FAQ)', (s) => !!s.schema?.hasFaq, 'Marque as perguntas frequentes com FAQPage nas páginas de serviço.'],
      ['horario', 'horário de atendimento no schema', (s) => !!s.schema?.openingHours, 'Informe o horário de atendimento no schema e na página de contato.'],
      ['whatsapp', 'botão de contato direto', (s) => s.tech.includes('whatsapp_button'), 'Inclua um botão de contato direto (telefone ou mensageiro) visível em todas as páginas.'],
    ];
    for (const [key, label, fn, todo] of checks) {
      if (fn(ownScan) || rivalScans.length < 2) continue;
      const share = rivalScans.filter(fn).length / rivalScans.length;
      if (share < 0.5) continue;
      out.push({ id: `barata:${key}`, kind: 'correcao_barata', priority: Math.round(share * 30 * 10) / 10, focus_id: null, place_id: null, node_id: null, title: label, why: `${Math.round(share * 100)}% dos ${rivalScans.length} concorrentes varridos têm ${label} e o seu site não.`, what: todo, facts: { concorrentes_com: Math.round(share * rivalScans.length), varridos: rivalScans.length } });
    }
  }
  out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return out.slice(0, o.limit ?? 60);
}

// ------------------------------------------------------------------------------------------------------------------ retrato agregado
export interface LandscapeRow {
  key: string; competitors: number; with_site: number; with_maps: number; with_instagram: number; with_tiktok: number; with_kwai: number; with_youtube: number; with_facebook: number; with_linkedin: number;
  videos_total: number | null; posts_30d: number | null; reviews_total: number; rating_avg: number | null; strength_avg: number | null; strength_top: number | null;
}
const LS_PLATFORMS = ['instagram', 'tiktok', 'kwai', 'youtube', 'facebook', 'linkedin'] as const;

function competitorsIn(snap: Snapshot, pick: (r: { focus_id: string | null; place_id: string | null; node_id: string | null }) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const l of snap.links) if (pick(l)) ids.add(l.competitor_id);
  for (const p of snap.pages) if (p.competitor_id && pick(p)) ids.add(p.competitor_id);
  for (const l of snap.listings) if (l.competitor_id && pick({ focus_id: l.focus_id, place_id: l.place_id, node_id: null })) ids.add(l.competitor_id);
  return ids;
}
export function landscapeFor(snap: Snapshot, key: string, ids: Set<string>, scope: Scope): LandscapeRow {
  const comps = snap.competitors.filter((c) => ids.has(c.id) && alive(c) && !c.is_own);
  const idents = (cid: string) => snap.identities.filter((i) => i.competitor_id === cid);
  const has = (p: string) => comps.filter((c) => idents(c.id).some((i) => i.platform === p)).length;
  let videos: number | null = null; let posts30: number | null = null; let reviews = 0; const ratings: number[] = []; const strengths: number[] = [];
  for (const c of comps) {
    for (const i of idents(c.id)) { const m = i.metrics as Record<string, number>; if (i.platform === 'youtube' && typeof m.videos === 'number') videos = (videos ?? 0) + m.videos; if (typeof m.last_30d === 'number') posts30 = (posts30 ?? 0) + m.last_30d; }
    for (const l of snap.listings.filter((x) => x.competitor_id === c.id)) { if (l.reviews) reviews += l.reviews; if (l.rating != null) ratings.push(l.rating); }
    const r = scoreEvidence(evidenceFor(snap, c, scope)); if (r.score !== null) strengths.push(r.score);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    key, competitors: comps.length, with_site: comps.filter((c) => idents(c.id).some((i) => i.platform === 'site')).length, with_maps: comps.filter((c) => idents(c.id).some((i) => i.platform === 'gbp')).length,
    with_instagram: has('instagram'), with_tiktok: has('tiktok'), with_kwai: has('kwai'), with_youtube: has('youtube'), with_facebook: has('facebook'), with_linkedin: has('linkedin'),
    videos_total: videos, posts_30d: posts30, reviews_total: reviews, rating_avg: avg(ratings), strength_avg: avg(strengths), strength_top: strengths.length ? Math.max(...strengths) : null,
  };
}
export function landscape(snap: Snapshot, by: 'focus' | 'place' | 'node'): Array<LandscapeRow & { id: string }> {
  const keys = new Set<string>();
  const get = (r: { focus_id: string | null; place_id: string | null; node_id: string | null }) => (by === 'focus' ? r.focus_id : by === 'place' ? r.place_id : r.node_id);
  for (const r of [...snap.links, ...snap.pages]) { const k = get({ focus_id: r.focus_id, place_id: r.place_id, node_id: (r as { node_id: string | null }).node_id }); if (k) keys.add(k); }
  if (by === 'node') { const byId = new Map(snap.nodes.map((n) => [n.id, n])); for (const k of [...keys]) { let p = byId.get(k)?.parent_id; while (p) { keys.add(p); p = byId.get(p)?.parent_id; } } }
  const descendants = (id: string): Set<string> => { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const n of snap.nodes) if (n.parent_id && out.has(n.parent_id) && !out.has(n.id)) { out.add(n.id); grew = true; } } return out; };
  return [...keys].map((k) => {
    const nodeSet = by === 'node' ? descendants(k) : null;
    const ids = competitorsIn(snap, (r) => (by === 'node' ? !!r.node_id && nodeSet!.has(r.node_id) : get(r) === k));
    return { id: k, ...landscapeFor(snap, k, ids, by === 'focus' ? { focus_id: k, place_id: null } : by === 'place' ? { focus_id: null, place_id: k } : { focus_id: null, place_id: null, node_id: k }) };
  }).sort((a, b) => b.competitors - a.competitors);
}

// ------------------------------------------------------------------------------------------------------------------ sobreposição na árvore
export interface NodeOverlap { node_id: string; label: string; kind: string; depth: number; competitors: Array<{ id: string; name: string; score: number | null }>; own_score: number | null; leader_score: number | null; gap: number | null; attacks: number; empty: boolean }
/** Por nó/galho: concorrentes que passam por ele (ele ou um descendente), nossa posição, lacuna e quantas ações de ataque apontam para ele. */
export function overlapByNode(snap: Snapshot, attacks: AttackItem[]): NodeOverlap[] {
  const byId = new Map(snap.nodes.map((n) => [n.id, n])); const own = snap.competitors.find((c) => c.is_own && !c.merged_into) ?? null;
  const depth = (n: NodeLite) => { let d = 0; let p = n.parent_id ? byId.get(n.parent_id) : undefined; while (p && d < 20) { d++; p = p.parent_id ? byId.get(p.parent_id) : undefined; } return d; };
  const kids = (id: string): Set<string> => { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const n of snap.nodes) if (n.parent_id && out.has(n.parent_id) && !out.has(n.id)) { out.add(n.id); grew = true; } } return out; };
  return snap.nodes.filter((n) => n.status !== 'rejeitado').map((n) => {
    const set = kids(n.id);
    const ids = competitorsIn(snap, (r) => !!r.node_id && set.has(r.node_id));
    const scope: Scope = { focus_id: null, place_id: null, node_id: n.id };
    const comps = snap.competitors.filter((c) => ids.has(c.id) && alive(c) && !c.is_own).map((c) => ({ id: c.id, name: c.name, score: scoreEvidence(evidenceFor(snap, c, scope)).score }));
    const ownScore = own ? scoreEvidence(evidenceFor(snap, own, scope)).score : null;
    const leader = comps.reduce<number | null>((m, c) => (c.score !== null && (m === null || c.score > m) ? c.score : m), null);
    return { node_id: n.id, label: n.label, kind: n.kind, depth: depth(n), competitors: comps.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)), own_score: ownScore, leader_score: leader, gap: ownScore !== null && leader !== null ? Math.round((leader - ownScore) * 10) / 10 : null, attacks: attacks.filter((a) => a.node_id && set.has(a.node_id)).length, empty: comps.length === 0 };
  });
}

// ------------------------------------------------------------------------------------------------------------------ Livro de pontas soltas
export type OrphanKind = 'perfil_sem_concorrente' | 'concorrente_sem_no' | 'concorrente_sem_foco' | 'no_sem_concorrente' | 'territorio_sem_varredura' | 'prompt_sem_foco' | 'foco_sem_no' | 'foco_sem_territorio';
export interface Orphan { kind: OrphanKind; ref: string; label: string; suggestion: { action: 'ligar_identidade' | 'ligar_no' | 'ligar_foco' | 'rodar_descoberta' | 'criar_foco' | 'definir_no' | 'definir_territorio'; target_id: string | null; target_label: string | null; confidence: number; auto: boolean } | null }
export interface OrphanReport { items: Orphan[]; counts: Record<OrphanKind, number>; total: number; zero_orphans: boolean; auto_fixable: number }
export const ORPHAN_KINDS: OrphanKind[] = ['perfil_sem_concorrente', 'concorrente_sem_no', 'concorrente_sem_foco', 'no_sem_concorrente', 'territorio_sem_varredura', 'prompt_sem_foco', 'foco_sem_no', 'foco_sem_territorio'];
export const AUTO_LINK_MIN = 0.7;

export function auditOrphans(snap: Snapshot, book: EntityBook): OrphanReport {
  const items: Orphan[] = [];
  const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
  const activeFocuses = snap.focuses.filter((f) => f.status === 'ativo');
  // 1) perfis sem concorrente
  for (const x of book.identities.values()) {
    if (x.competitor_id || x.platform === 'site') continue;
    const cand = candidatesFor(book, x, 1)[0];
    items.push({ kind: 'perfil_sem_concorrente', ref: x.id, label: `${x.platform}:${x.handle ?? x.url}`, suggestion: cand ? { action: 'ligar_identidade', target_id: cand.competitor_id, target_label: cand.name, confidence: cand.score, auto: cand.score >= AUTO_LINK_MIN } : null });
  }
  // 2) concorrentes sem nó / sem foco
  const rivals = snap.competitors.filter((c) => alive(c) && !c.is_own);
  for (const c of rivals) {
    const mine = snap.links.filter((l) => l.competitor_id === c.id);
    if (!mine.some((l) => l.node_id)) {
      const freq = new Map<string, number>();
      for (const p of snap.pages) if (p.competitor_id === c.id && p.node_id) freq.set(p.node_id, (freq.get(p.node_id) ?? 0) + 1);
      for (const t of snap.coverage) { /* o nó vem da página; a cobertura sozinha não prova que o concorrente passa pelo nó */ void t; }
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      items.push({ kind: 'concorrente_sem_no', ref: c.id, label: c.name, suggestion: top ? { action: 'ligar_no', target_id: top[0], target_label: nodeById.get(top[0])?.label ?? null, confidence: Math.min(0.95, 0.6 + top[1] * 0.1), auto: true } : null });
    }
    if (!mine.some((l) => l.focus_id)) {
      const freq = new Map<string, number>();
      for (const p of snap.pages) if (p.competitor_id === c.id && p.focus_id) freq.set(p.focus_id, (freq.get(p.focus_id) ?? 0) + 1);
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      items.push({ kind: 'concorrente_sem_foco', ref: c.id, label: c.name, suggestion: top ? { action: 'ligar_foco', target_id: top[0], target_label: snap.focuses.find((f) => f.id === top[0])?.name ?? null, confidence: Math.min(0.95, 0.6 + top[1] * 0.1), auto: true } : null });
    }
  }
  // 3) nós aprovados sem concorrente mapeado
  const linkedNodes = new Set([...snap.links.filter((l) => l.node_id).map((l) => l.node_id as string), ...snap.pages.filter((p) => p.node_id).map((p) => p.node_id as string)]);
  const covered = (id: string): boolean => { if (linkedNodes.has(id)) return true; return snap.nodes.some((n) => n.parent_id === id && covered(n.id)); };
  for (const n of snap.nodes.filter((x) => x.status === 'aprovado')) {
    if (covered(n.id)) continue;
    const focus = activeFocuses.find((f) => f.node_id === n.id || (f.node_id && isDesc(nodeById, n.id, f.node_id)));
    items.push({ kind: 'no_sem_concorrente', ref: n.id, label: n.label, suggestion: { action: focus ? 'rodar_descoberta' : 'criar_foco', target_id: focus?.id ?? null, target_label: focus?.name ?? null, confidence: focus ? 0.8 : 0.5, auto: false } });
  }
  // 4) territórios sem varredura
  const queried = new Set(snap.coverage.filter((t) => t.status === 'consultada').map((t) => `${t.focus_id}|${t.place_id}`));
  for (const f of activeFocuses) for (const fp of snap.focusPlaces.filter((p) => p.focus_id === f.id && p.status !== 'rejeitado')) {
    if (queried.has(`${f.id}|${fp.place_id}`)) continue;
    items.push({ kind: 'territorio_sem_varredura', ref: `${f.id}|${fp.place_id}`, label: `${f.name} / ${snap.places.get(fp.place_id)?.name ?? fp.place_id}`, suggestion: { action: 'rodar_descoberta', target_id: f.id, target_label: f.name, confidence: 0.9, auto: false } });
  }
  // 5) prompts sem foco
  for (const p of snap.prompts) {
    let best: FocusLite | null = null; let bo = 0;
    for (const f of activeFocuses) { const ov = Math.max(tokOverlap(p.query, f.name), tokOverlap(p.query, f.segment_label ?? ''), ...f.topics.map((t) => tokOverlap(p.query, t)), 0); if (ov > bo) { bo = ov; best = f; } }
    if (best && bo >= 0.5) continue; // já pertence a um foco
    items.push({ kind: 'prompt_sem_foco', ref: p.id, label: p.query.slice(0, 120), suggestion: best && bo >= 0.34 ? { action: 'ligar_foco', target_id: best.id, target_label: best.name, confidence: Math.round(bo * 100) / 100, auto: false } : { action: 'criar_foco', target_id: null, target_label: null, confidence: 0.3, auto: false } });
  }
  // 6) focos incompletos
  for (const f of activeFocuses) {
    if (!f.node_id) {
      const match = snap.nodes.filter((n) => n.status !== 'rejeitado').map((n) => ({ n, ov: Math.max(tokOverlap(f.name, n.label), tokOverlap(f.segment_label ?? '', n.label)) })).sort((a, b) => b.ov - a.ov)[0];
      items.push({ kind: 'foco_sem_no', ref: f.id, label: f.name, suggestion: match && match.ov >= 0.5 ? { action: 'definir_no', target_id: match.n.id, target_label: match.n.label, confidence: Math.round(match.ov * 100) / 100, auto: match.ov >= AUTO_LINK_MIN } : null });
    }
    if (!snap.focusPlaces.some((p) => p.focus_id === f.id && p.status !== 'rejeitado')) items.push({ kind: 'foco_sem_territorio', ref: f.id, label: f.name, suggestion: { action: 'definir_territorio', target_id: null, target_label: null, confidence: 1, auto: false } });
  }
  const counts = Object.fromEntries(ORPHAN_KINDS.map((k) => [k, items.filter((i) => i.kind === k).length])) as Record<OrphanKind, number>;
  return { items, counts, total: items.length, zero_orphans: items.length === 0, auto_fixable: items.filter((i) => i.suggestion?.auto && (i.suggestion.confidence >= AUTO_LINK_MIN)).length };
}
function isDesc(byId: Map<string, NodeLite>, id: string, ancestor: string): boolean {
  let p = byId.get(id)?.parent_id; let guard = 0;
  while (p && guard++ < 20) { if (p === ancestor) return true; p = byId.get(p)?.parent_id; }
  return false;
}
