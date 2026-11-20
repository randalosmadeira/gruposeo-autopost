/**
 * Motor de Taxonomia: regras puras (sem rede, sem banco).
 *
 *  - Classificador de página (URL + título + H1) e de consulta do Search Console, com as regras do pacote de segmento.
 *  - Agregador: transforma páginas/consultas classificadas em SUGESTÕES de nós (matriz > subárea > nicho, sempre "sugerido") e arestas de correlação
 *    (as do pacote + as que os dados confirmam por co-ocorrência).
 *  - Geografia: ver taxonomy-geo.ts (re-exportada daqui).
 *
 * Princípio: o sistema SUGERE com evidência (contagem, exemplos, termos que casaram); quem aprova é o dono do projeto.
 * A classificação segue o analisar.py validado: a página entra na PRIMEIRA subárea que combinar. A confiança é uma heurística nossa (SUPOSIÇÃO):
 * sobe com o número de campos (URL, título, H1) em que a regra casou e cai nas regras amplas.
 */
import { norm, slugify, type GeoHit } from './taxonomy-geo.ts';
import { isObservationEngine } from './nexus-intelligence.ts';
import type { PackCorrel, PackRule, SegmentPack } from './taxonomy-packs.ts';

export * from './taxonomy-geo.ts';
export * from './taxonomy-packs.ts';

export const SEM_AREA = 'Sem área identificada';
export type ItemSource = 'site' | 'search_console';
/** cauda = busca específica gerada por AGENTE de IA (source 'agente'); as regras de Google, Bing, Gemini etc. ficam com o agente, não com este código */
export type NodeKind = 'matriz' | 'subarea' | 'nicho' | 'cauda';
export type NodeStatus = 'sugerido' | 'aprovado' | 'rejeitado';

// ------------------------------------------------------------------------------------------------------------------ pacote compilado
interface Compiled { rule: PackRule; rx: RegExp; rxg: RegExp; index: number }
const cache = new WeakMap<SegmentPack, Compiled[]>();
export function compilePack(pack: SegmentPack): Compiled[] {
  let c = cache.get(pack);
  if (!c) { c = pack.rules.map((rule, index) => ({ rule, index, rx: new RegExp(rule.rx), rxg: new RegExp(rule.rx, 'g') })); cache.set(pack, c); }
  return c;
}

export const matrizSlug = (matriz: string) => slugify(matriz);
export const subareaSlug = (matriz: string, subarea: string) => `${slugify(matriz)}/${slugify(subarea)}`;
export const nichoSlug = (parentSlug: string, term: string) => `${parentSlug}/n/${slugify(term)}`;
export const urlPathText = (u: string): string => u.replace(/^https?:\/\/[^/]+/i, '').replace(/-/g, ' ').replace(/\//g, ' ');

// ------------------------------------------------------------------------------------------------------------------ classificação
export interface Evidencia { regra: number; termos: string[]; campos: Array<'url' | 'titulo' | 'h1' | 'consulta'>; generica: boolean }
export interface Classificacao { matriz: string | null; subarea: string | null; confianca: number; evidencia: Evidencia | null }

function termosCasados(rxg: RegExp, texto: string): string[] {
  rxg.lastIndex = 0;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rxg.exec(texto)) && out.size < 8) { const t = m[0].trim(); if (t.length >= 3) out.add(t); if (m[0] === '') rxg.lastIndex++; }
  return [...out];
}
const confianca = (campos: number, generica: boolean): number => Math.round(Math.min(0.95, Math.max(0.1, 0.35 + 0.2 * campos - (generica ? 0.15 : 0))) * 100) / 100;

function classifyFields(campos: Array<{ nome: Evidencia['campos'][number]; texto: string }>, pack: SegmentPack): Classificacao {
  const joined = campos.map((c) => c.texto).join(' ');
  for (const c of compilePack(pack)) {
    if (!c.rx.test(joined)) continue;
    const hit = campos.filter((f) => f.texto && c.rx.test(f.texto)).map((f) => f.nome);
    const generica = !!c.rule.generic;
    return {
      matriz: c.rule.matriz, subarea: c.rule.subarea, confianca: confianca(Math.max(1, hit.length), generica),
      evidencia: { regra: c.index, termos: termosCasados(c.rxg, joined), campos: hit.length ? hit : [campos[0].nome], generica },
    };
  }
  return { matriz: null, subarea: null, confianca: 0, evidencia: null };
}

/** Classifica uma página. Sem regra que combine: matriz/subárea nulas (a tela mostra "Sem área identificada"). */
export function classifyPage(input: { url?: string; title?: string; h1?: string }, pack: SegmentPack): Classificacao {
  return classifyFields([{ nome: 'url', texto: norm(urlPathText(input.url || '')) }, { nome: 'titulo', texto: norm(input.title) }, { nome: 'h1', texto: norm(input.h1) }], pack);
}
/** Classifica uma consulta do Search Console com as mesmas regras. */
export function classifyQuery(query: string, pack: SegmentPack): Classificacao {
  return classifyFields([{ nome: 'consulta', texto: norm(query) }], pack);
}
/** Todas as áreas matriz em que o texto casa com ALGUMA regra (base da co-ocorrência). */
export function matrizesCasadas(texto: string, pack: SegmentPack): string[] {
  const t = norm(texto);
  return [...new Set(compilePack(pack).filter((c) => c.rx.test(t)).map((c) => c.rule.matriz))];
}

// ------------------------------------------------------------------------------------------------------------------ pacote -> nós
export interface NodeSuggestion {
  kind: NodeKind; slug: string; label: string; parentSlug: string | null; keywords: string[];
  source: 'pacote' | 'agente' | ItemSource; evidence: Record<string, unknown>;
}
export interface EdgeSuggestion { fromSlug: string; toSlug: string; weight: number; source: 'pacote' | ItemSource; note: string | null }

/** Palavras-chave legíveis de uma regra: as alternativas da expressão, sem metacaracteres. */
export function ruleKeywords(rx: string): string[] {
  return [...new Set(rx.split('|').map((t) => t.replace(/\\b/g, '').replace(/\?/g, '').trim()).filter((t) => t.length >= 3 && !/[\\()[\]]/.test(t)))];
}

const isMatriz = (pack: SegmentPack, label: string) => pack.matrizes.some((m) => m.label === label);

/** Arestas do pacote como sugestões. Destino que não é área matriz vira nicho da área de origem. */
function packEdge(pack: SegmentPack, c: PackCorrel): { edge: EdgeSuggestion; extraNode?: NodeSuggestion } {
  const fromSlug = matrizSlug(c.from);
  if (isMatriz(pack, c.to)) return { edge: { fromSlug, toSlug: matrizSlug(c.to), weight: 1, source: 'pacote', note: c.note ?? null } };
  const toSlug = nichoSlug(fromSlug, c.to);
  return {
    edge: { fromSlug, toSlug, weight: 1, source: 'pacote', note: c.note ?? null },
    extraNode: { kind: 'nicho', slug: toSlug, label: c.to, parentSlug: fromSlug, keywords: [norm(c.to)], source: 'pacote', evidence: { total: 0, motivo: `correlato de ${c.from} no pacote` } },
  };
}

/** O pacote inteiro como sugestões (para projetos sem site/Search Console). */
export function packToSuggestions(pack: SegmentPack): { nodes: NodeSuggestion[]; edges: EdgeSuggestion[] } {
  const nodes: NodeSuggestion[] = [];
  const seen = new Set<string>();
  const add = (n: NodeSuggestion) => { if (!seen.has(n.slug)) { seen.add(n.slug); nodes.push(n); } };
  for (const m of pack.matrizes) add({ kind: 'matriz', slug: matrizSlug(m.label), label: m.label, parentSlug: null, keywords: [], source: 'pacote', evidence: { total: 0, motivo: `área do pacote ${pack.label}`, transversal: !!m.transversal } });
  for (const r of pack.rules) add({ kind: 'subarea', slug: subareaSlug(r.matriz, r.subarea), label: r.subarea, parentSlug: matrizSlug(r.matriz), keywords: ruleKeywords(r.rx).slice(0, 40), source: 'pacote', evidence: { total: 0, motivo: `subárea do pacote ${pack.label}` } });
  const edges: EdgeSuggestion[] = [];
  for (const c of pack.correl) { const { edge, extraNode } = packEdge(pack, c); if (extraNode) add(extraNode); edges.push(edge); }
  return { nodes, edges };
}

// ------------------------------------------------------------------------------------------------------------------ agregação
export interface ClassifiedItem {
  source: ItemSource; kind: 'pagina' | 'consulta' | 'secao'; key: string;
  /** impressões (Search Console) ou número de URLs (seção do mapa); 1 quando não há medida */
  weight: number; clicks?: number;
  cls: Classificacao; coMatrizes: string[]; geo?: GeoHit[];
}
export interface SuggestOptions { minNicho?: number; minCoocc?: number; maxExamples?: number }
export interface UnclassifiedSummary { count: number; weight: number; examples: string[] }

/** Classifica páginas, consultas e seções do mapa de uma vez (a função de borda usa isto). */
export function classifyItems(
  inputs: Array<{ source: ItemSource; kind: ClassifiedItem['kind']; key: string; url?: string; title?: string; h1?: string; query?: string; weight?: number; clicks?: number }>,
  pack: SegmentPack,
): ClassifiedItem[] {
  return inputs.map((i) => {
    const cls = i.kind === 'consulta' ? classifyQuery(i.query ?? i.key, pack) : classifyPage({ url: i.url ?? i.key, title: i.title, h1: i.h1 }, pack);
    const texto = i.kind === 'consulta' ? (i.query ?? i.key) : `${urlPathText(i.url ?? i.key)} ${i.title ?? ''} ${i.h1 ?? ''}`;
    return { source: i.source, kind: i.kind, key: i.key, weight: Math.max(1, Math.round(i.weight ?? 1)), clicks: i.clicks, cls, coMatrizes: matrizesCasadas(texto, pack) };
  });
}

interface Bucket { count: number; weight: number; conf: number; examples: Array<{ key: string; weight: number }>; terms: Map<string, number> }
const newBucket = (): Bucket => ({ count: 0, weight: 0, conf: 0, examples: [], terms: new Map() });

function fill(b: Bucket, it: ClassifiedItem) {
  b.count++; b.weight += it.weight; b.conf += it.cls.confianca;
  b.examples.push({ key: it.key, weight: it.weight });
  for (const t of it.cls.evidencia?.termos ?? []) b.terms.set(t, (b.terms.get(t) ?? 0) + 1);
}
const topExamples = (b: Bucket, n: number) => b.examples.sort((a, c) => c.weight - a.weight || a.key.localeCompare(c.key)).slice(0, n).map((e) => e.key);

/**
 * Páginas/consultas classificadas -> nós sugeridos + arestas.
 *  - matriz e subárea: um nó por combinação encontrada, com contagem, peso (impressões), confiança média, exemplos e termos que casaram.
 *  - nicho: um termo que casou pelo menos `minNicho` vezes dentro de uma subárea (padrão 3). O rótulo é o termo normalizado (sem acento): o dono pode renomear.
 *  - correlatos: as arestas do pacote saindo das áreas detectadas (o destino entra como sugestão do pacote) + as que os dados confirmam
 *    (duas áreas aparecem juntas em pelo menos `minCoocc` itens, padrão 3).
 */
export function suggestNodes(items: ClassifiedItem[], pack: SegmentPack, opts: SuggestOptions = {}): { nodes: NodeSuggestion[]; edges: EdgeSuggestion[]; unclassified: UnclassifiedSummary; classified: number } {
  const minNicho = opts.minNicho ?? 3; const minCoocc = opts.minCoocc ?? 3; const maxEx = opts.maxExamples ?? 5;
  const bySub = new Map<string, { matriz: string; subarea: string; per: Record<ItemSource, Bucket> }>();
  const unclassified: UnclassifiedSummary = { count: 0, weight: 0, examples: [] };
  let classified = 0;
  for (const it of items) {
    if (!it.cls.matriz || !it.cls.subarea) {
      unclassified.count++; unclassified.weight += it.weight; if (unclassified.examples.length < maxEx) unclassified.examples.push(it.key);
      continue;
    }
    classified++;
    const k = subareaSlug(it.cls.matriz, it.cls.subarea);
    const e = bySub.get(k) ?? { matriz: it.cls.matriz, subarea: it.cls.subarea, per: { site: newBucket(), search_console: newBucket() } };
    fill(e.per[it.source], it); bySub.set(k, e);
  }
  const nodes = new Map<string, NodeSuggestion>();
  const dominant = (per: Record<ItemSource, Bucket>): ItemSource => (per.search_console.weight >= per.site.weight && per.search_console.count > 0 ? 'search_console' : per.site.count > 0 ? 'site' : 'search_console');
  const evidenceOf = (per: Record<ItemSource, Bucket>) => {
    const one = (b: Bucket) => ({ count: b.count, weight: b.weight, confianca_media: b.count ? Math.round((b.conf / b.count) * 100) / 100 : null, exemplos: topExamples(b, maxEx) });
    return { total: per.site.count + per.search_console.count, site: one(per.site), search_console: one(per.search_console) };
  };
  const mergeBuckets = (a: Record<ItemSource, Bucket>, b: Record<ItemSource, Bucket>) => { for (const s of ['site', 'search_console'] as ItemSource[]) { a[s].count += b[s].count; a[s].weight += b[s].weight; a[s].conf += b[s].conf; a[s].examples.push(...b[s].examples); } };
  const byMatriz = new Map<string, Record<ItemSource, Bucket>>();

  for (const [slug, e] of bySub) {
    const kw = compilePack(pack).filter((c) => c.rule.matriz === e.matriz && c.rule.subarea === e.subarea).flatMap((c) => ruleKeywords(c.rule.rx));
    nodes.set(slug, { kind: 'subarea', slug, label: e.subarea, parentSlug: matrizSlug(e.matriz), keywords: kw.slice(0, 40), source: dominant(e.per), evidence: evidenceOf(e.per) });
    const m = byMatriz.get(e.matriz) ?? { site: newBucket(), search_console: newBucket() };
    mergeBuckets(m, e.per); byMatriz.set(e.matriz, m);
    const terms = new Map<string, number>();
    for (const s of ['site', 'search_console'] as ItemSource[]) for (const [t, n] of e.per[s].terms) terms.set(t, (terms.get(t) ?? 0) + n);
    for (const [t, n] of terms) {
      if (n < minNicho) continue;
      const ns = nichoSlug(slug, t);
      nodes.set(ns, { kind: 'nicho', slug: ns, label: t, parentSlug: slug, keywords: [t], source: dominant(e.per), evidence: { total: n, termo: t, em: e.subarea } });
    }
  }
  for (const [matriz, per] of byMatriz) nodes.set(matrizSlug(matriz), { kind: 'matriz', slug: matrizSlug(matriz), label: matriz, parentSlug: null, keywords: [], source: dominant(per), evidence: evidenceOf(per) });

  // arestas: pacote (a partir das áreas detectadas) e co-ocorrência confirmada pelos dados
  const edges = new Map<string, EdgeSuggestion>();
  for (const c of pack.correl) {
    if (!nodes.has(matrizSlug(c.from)) || nodes.get(matrizSlug(c.from))!.kind !== 'matriz') continue;
    const { edge, extraNode } = packEdge(pack, c);
    if (!nodes.has(edge.toSlug)) {
      if (extraNode) nodes.set(extraNode.slug, extraNode);
      else { const m = pack.matrizes.find((x) => matrizSlug(x.label) === edge.toSlug)!; nodes.set(edge.toSlug, { kind: 'matriz', slug: edge.toSlug, label: m.label, parentSlug: null, keywords: [], source: 'pacote', evidence: { total: 0, motivo: `correlata de ${c.from} no pacote ${pack.label}` } }); }
    }
    edges.set(`${edge.fromSlug}>${edge.toSlug}`, edge);
  }
  const pairs = new Map<string, { a: string; b: string; n: number; per: Record<ItemSource, number> }>();
  for (const it of items) {
    const co = it.coMatrizes.filter((m) => !pack.matrizes.find((x) => x.label === m)?.transversal).sort();
    for (let i = 0; i < co.length; i++) for (let j = i + 1; j < co.length; j++) {
      const k = `${co[i]}|${co[j]}`; const p = pairs.get(k) ?? { a: co[i], b: co[j], n: 0, per: { site: 0, search_console: 0 } };
      p.n++; p.per[it.source]++; pairs.set(k, p);
    }
  }
  for (const p of pairs.values()) {
    if (p.n < minCoocc) continue;
    const a = matrizSlug(p.a); const b = matrizSlug(p.b);
    for (const [slug, label] of [[a, p.a], [b, p.b]] as Array<[string, string]>) if (!nodes.has(slug)) nodes.set(slug, { kind: 'matriz', slug, label, parentSlug: null, keywords: [], source: p.per.search_console >= p.per.site ? 'search_console' : 'site', evidence: { total: 0, motivo: 'aparece junto de outra área nos dados' } });
    const note = `aparecem juntas em ${p.n} ${p.n === 1 ? 'item' : 'itens'}`;
    const existing = edges.get(`${a}>${b}`) ?? edges.get(`${b}>${a}`);
    if (existing) { existing.weight = p.n; existing.note = existing.note ? `${existing.note}; ${note}` : note; }
    else edges.set(`${a}>${b}`, { fromSlug: a, toSlug: b, weight: p.n, source: p.per.search_console >= p.per.site ? 'search_console' : 'site', note });
  }
  const order = { matriz: 0, subarea: 1, nicho: 2 } as const;
  return { nodes: [...nodes.values()].sort((x, y) => order[x.kind] - order[y.kind] || x.slug.localeCompare(y.slug)), edges: [...edges.values()], unclassified, classified };
}


// ------------------------------------------------------------------------------------------------------------------ cauda do agente
export interface TailItem {
  label: string; /** slug ou nome da área/subárea/nicho a que a busca pertence (o agente diz); vazio = o sistema tenta classificar */ parentRef: string | null;
  engines: string[]; country: string | null; language: string | null; publico: string | null; rationale: string | null; keywords: string[];
}
const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
export const MAX_TAIL_LABEL = 300;

/**
 * Lista de buscas específicas (cauda) produzida por um agente de IA: JSON (lista de textos, lista de objetos ou { items: [...] }) ou um texto por linha.
 * O sistema NÃO impõe tamanho mínimo nem número de palavras: quem define como a cauda deve ser (regras de Google, Bing, Gemini etc.) é o agente.
 * Só descarta o que não dá para guardar (texto vazio ou maior que o campo do banco) e conta o que descartou.
 */
export function parseTailImport(raw: unknown): { items: TailItem[]; invalid: number; duplicates: number; engines_ignored: number } | { error: string } {
  let list: unknown[];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') { const o = raw as Record<string, unknown>; list = Array.isArray(o.items) ? o.items : Array.isArray(o.cauda) ? o.cauda : Array.isArray(o.tail) ? o.tail : []; }
  else if (typeof raw === 'string' && raw.trim()) {
    const t = raw.trim();
    if (t.startsWith('[') || t.startsWith('{')) { try { return parseTailImport(JSON.parse(t)); } catch { return { error: 'tail_format' }; } }
    list = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } else return { error: 'tail_empty' };
  if (!list.length) return { error: 'tail_empty' };
  const items: TailItem[] = []; const seen = new Set<string>();
  let invalid = 0; let duplicates = 0; let ignored = 0;
  for (const it of list) {
    const o = typeof it === 'string' ? { label: it } : it && typeof it === 'object' ? (it as Record<string, unknown>) : null;
    const label = o ? clip(o.label ?? o.query ?? o.busca ?? o.consulta ?? o.text, MAX_TAIL_LABEL + 1) : '';
    if (!o || label.length < 2 || label.length > MAX_TAIL_LABEL) { invalid++; continue; }
    const key = norm(label);
    if (!key || seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const engRaw = Array.isArray(o.engines) ? o.engines : Array.isArray(o.motores) ? o.motores : [];
    const engines = [...new Set(engRaw.filter((e): e is string => typeof e === 'string' && isObservationEngine(e)))];
    ignored += engRaw.length - engines.length;
    const country = clip(o.country ?? o.pais, 2).toLowerCase();
    const language = clip(o.language ?? o.lingua ?? o.idioma, 10);
    items.push({
      label, parentRef: clip(o.parent ?? o.parent_slug ?? o.area ?? o.node ?? o.pai, 200) || null, engines,
      country: /^[a-z]{2}$/.test(country) ? country : null, language: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language) ? language : null,
      publico: clip(o.publico ?? o.audience, 80) || null, rationale: clip(o.rationale ?? o.motivo, 300) || null,
      keywords: [...new Set((Array.isArray(o.keywords) ? o.keywords : []).filter((k): k is string => typeof k === 'string').map((k) => clip(k, 60).toLowerCase()).filter(Boolean))],
    });
  }
  return { items, invalid, duplicates, engines_ignored: ignored };
}

/** Endereço estável de uma cauda: o texto pode ser longo, então o slug leva um resumo (hash) para nunca colidir nem estourar o limite. */
export function tailSlug(parentSlug: string, label: string): string {
  let h = 5381; for (const ch of norm(label)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `${parentSlug}/c/${slugify(label).slice(0, 90)}-${h.toString(36)}`;
}
