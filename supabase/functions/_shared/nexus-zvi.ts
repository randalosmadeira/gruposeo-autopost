/**
 * NEXUS · Índice Zica de Visibilidade (ZVI) e Índice Zica de Fonte (ZSS), método `zvi-1` (13/11/2026).
 *
 * Módulo PURO: sem rede, sem banco, sem relógio implícito (o "agora" é sempre um parâmetro) e sem API específica do Deno.
 * Implementa a seção 2 de docs/nexus-rdm/ZICA_VISIBILITY_INTELLIGENCE_MASTER.md. Regras de honestidade de dado:
 *  - sem dado, o valor é `null` (nunca 0 inventado); PM (posição de menção) e REP (reputação) ficam `null` porque ainda não há extração
 *    por modelo; o ZVI sai `partial: true` com a lista do que faltou;
 *  - observação "contaminada" por personalização (conta logada do dono) não entra no índice (opção `includePersonalized` a reativa);
 *  - o intervalo do ZVI vem de bootstrap determinístico (semente fixa): a mesma entrada devolve sempre o mesmo intervalo.
 */

export const METHOD_VERSION = 'zvi-1';
export const METHOD_LABEL = 'Índice Zica de Visibilidade (ZVI), método zvi-1';

/** Pesos do ZVI (somam 1). Componente indisponível: o peso é redistribuído proporcionalmente entre os disponíveis. */
export const ZVI_WEIGHTS = { vr: 0.35, cr: 0.25, sov: 0.15, pm: 0.10, rep: 0.10, est: 0.05 } as const;
export type ComponentId = keyof typeof ZVI_WEIGHTS;
export const COMPONENT_IDS = Object.keys(ZVI_WEIGHTS) as ComponentId[];

/** Pesos do ZSS (somam 1). */
export const ZSS_WEIGHTS = { coverage: 0.40, position: 0.25, diversity: 0.20, recency: 0.10, relevance: 0.05 } as const;
export const ZSS_RECENCY_HALF_LIFE_DAYS = 30;

export const LOW_CONFIDENCE_N = 30;
export const HIGH_CONFIDENCE_N = 100;
/** n mínimo de observações válidas para ranquear marcas (abaixo disso: `insufficient_sample`). */
export const MIN_RANK_N = 8;
/** Repetições mínimas da mesma pergunta/motor/mercado para medir estabilidade (EST). */
export const EST_MIN_REPS = 2;
export const BOOTSTRAP_SEED = 20261113;
export const BOOTSTRAP_ITERATIONS = 1000;
export const BOOTSTRAP_ITERATIONS_LARGE = 200; // acima de BOOTSTRAP_LARGE_N observações
export const BOOTSTRAP_LARGE_N = 5000;
/** ZSS mínimo para uma fonte virar "alvo de presença" (heurística documentada em docs/NEXUS_VISIBILITY.md). */
export const TARGET_MIN_ZSS = 25;

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------
export type ObsCitation = { host: string; url: string; position: number | null; is_own: boolean };
export type ObsCompetitor = { name: string; host: string | null; source: string };
export type Observation = {
  id: string;
  engine: string;
  country: string | null;
  query: string | null;
  topic: string | null;
  intent: string | null;
  repetition: number | null;
  observed_at: string; // ISO
  /** Flag de menção da marca; `null` = a observação não informa (não entra no denominador). */
  mentioned: boolean | null;
  cited: boolean | null;
  personalization_risk: boolean;
  citations: ObsCitation[];
  competitors: ObsCompetitor[];
};
export type TrackedCompetitor = { id?: string; name: string; domains: string[]; kind?: string };

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------
/** Intervalo de Wilson (95% por padrão) para k sucessos em n tentativas; `null` quando n <= 0. */
export function wilsonInterval(k: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) return null;
  const kk = Math.min(Math.max(k, 0), n);
  const p = kk / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const round = (v: number | null, digits = 4): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);
const ratio = (k: number, n: number): number | null => (n > 0 ? k / n : null);

// ---------------------------------------------------------------------------
// Texto, marcas, domínios
// ---------------------------------------------------------------------------
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const GENERIC_WORDS = new Set([
  'advogados', 'advogado', 'advogada', 'advogadas', 'advocacia', 'associados', 'associado', 'escritorio', 'sociedade', 'juridico', 'juridica', 'dr', 'dra', 'doutor', 'doutora',
  'ltda', 'eireli', 'epp', 'me', 'sa', 'de', 'da', 'do', 'dos', 'das', 'e',
]);
const GENERIC_SUFFIXES = ['advogados', 'advocacia', 'associados', 'advogado'];

/** Remove anotações entre parênteses ("(Guarulhos)", "(AIO + orgânico)") e espaços repetidos. */
export function cleanBrandName(raw: string): string {
  return raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/[\s,;:.\-–]+$/g, '').trim();
}

/** Chave de comparação de uma marca: sem acentos, sem pontuação e sem palavras genéricas ("Advogados", "Associados", "Dr."). */
export function brandKey(name: string): string {
  const tokens = normalizeText(cleanBrandName(name)).split(' ').filter(Boolean);
  const meaningful = tokens.filter((t) => !GENERIC_WORDS.has(t));
  return (meaningful.length ? meaningful : tokens).join('');
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Domínio normalizado (sem protocolo, caminho, porta nem `www.`) ou `null` se não for um domínio válido. */
export function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let v = raw.trim().toLowerCase();
  if (!v || v.length > 300 || /\s/.test(v)) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  v = v.split(/[/?#]/)[0];
  if (v.includes('@')) return null;
  v = v.replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (v.length > 253 || !DOMAIN_RE.test(v)) return null;
  return v;
}

const TWO_LEVEL_SUFFIXES = ['com.br', 'adv.br', 'org.br', 'gov.br', 'jus.br', 'net.br', 'edu.br', 'leg.br', 'def.br', 'mp.br', 'co.uk', 'com.pt', 'org.pt'];
/** Rótulo principal do domínio ("machadomeyer" em www.machadomeyer.com.br). */
export function mainLabel(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length < 2) return h;
  const two = parts.slice(-2).join('.');
  if (TWO_LEVEL_SUFFIXES.includes(two) && parts.length >= 3) return parts[parts.length - 3];
  return parts[parts.length - 2];
}

const compact = (s: string) => normalizeText(s).replace(/ /g, '');
function stripGenericSuffix(c: string): string {
  let out = c;
  for (let i = 0; i < 3; i++) {
    const hit = GENERIC_SUFFIXES.find((g) => out.endsWith(g) && out.length > g.length);
    if (!hit) break;
    out = out.slice(0, -hit.length);
  }
  return out;
}

/** O nome da marca parece ser o rótulo principal deste domínio? ("Machado Meyer" ~ machadomeyer.com.br; "JLC Advogados" ~ jlcadvogados.com.br). */
export function nameMatchesHost(name: string, host: string): boolean {
  const label = mainLabel(host);
  if (label.length < 3) return false;
  const full = compact(cleanBrandName(name));
  if (!full) return false;
  const stripped = stripGenericSuffix(full);
  const labelStripped = stripGenericSuffix(label);
  return full === label || (stripped.length >= 3 && (stripped === label || stripped === labelStripped)) || (labelStripped.length >= 3 && labelStripped === full);
}

const hostSuffixes = (host: string): string[] => {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  const out: string[] = [];
  for (let i = 0; i <= parts.length - 2; i++) out.push(parts.slice(i).join('.'));
  return out;
};
/** `host` é o domínio `domain` ou um subdomínio dele. */
export const hostInDomain = (host: string, domain: string): boolean => {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === domain || h.endsWith('.' + domain);
};

// ---------------------------------------------------------------------------
// Motores
// ---------------------------------------------------------------------------
export type EngineKind = 'ia' | 'busca';
export type EngineInfo = { id: string; label: string; kind: EngineKind };
/** Famílias de motor: o painel agrupa `chatgpt`, `chatgpt_web` e `chatgpt_api` como ChatGPT. */
export const ENGINE_FAMILIES: Record<string, { label: string; kind: EngineKind; aliases: string[] }> = {
  chatgpt: { label: 'ChatGPT', kind: 'ia', aliases: ['chatgpt', 'chatgpt_web', 'chatgpt_api'] },
  gemini: { label: 'Gemini', kind: 'ia', aliases: ['gemini', 'gemini_web', 'gemini_api'] },
  claude: { label: 'Claude', kind: 'ia', aliases: ['claude', 'claude_web', 'claude_api'] },
  perplexity: { label: 'Perplexity', kind: 'ia', aliases: ['perplexity', 'perplexity_web', 'perplexity_api'] },
  copilot: { label: 'Copilot', kind: 'ia', aliases: ['copilot', 'copilot_web'] },
  google_aio: { label: 'Google (visão geral de IA)', kind: 'ia', aliases: ['google_aio'] },
  google_search: { label: 'Google (busca)', kind: 'busca', aliases: ['google_search', 'google_serp', 'dataforseo_google', 'serpapi_google'] },
  bing_search: { label: 'Bing (busca)', kind: 'busca', aliases: ['bing_search', 'bing_serp', 'dataforseo_bing', 'serpapi_bing'] },
  brave_search: { label: 'Brave (busca)', kind: 'busca', aliases: ['brave_search'] },
};
export function engineInfo(raw: string | null | undefined): EngineInfo {
  const e = String(raw ?? '').trim().toLowerCase();
  for (const [id, f] of Object.entries(ENGINE_FAMILIES)) if (f.aliases.includes(e)) return { id, label: f.label, kind: f.kind };
  return { id: e || 'desconhecido', label: e || 'Desconhecido', kind: 'ia' };
}
/** Todos os nomes brutos de motor que o filtro `engine` (família ou nome bruto) deve alcançar. */
export const engineLabel = (id: string): string => ENGINE_FAMILIES[id]?.label ?? id;
export function enginesFor(idOrRaw: string): string[] {
  const e = String(idOrRaw ?? '').trim().toLowerCase();
  if (!e) return [];
  const fam = engineInfo(e).id;
  const aliases = ENGINE_FAMILIES[fam]?.aliases ?? [];
  return [...new Set([e, ...aliases])];
}

// ---------------------------------------------------------------------------
// Tipo de fonte
// ---------------------------------------------------------------------------
export const SOURCE_TYPES = ['orgao_oficial', 'portal_agregador', 'midia', 'escritorio', 'diretorio', 'rede_social', 'academico', 'outro'] as const;
export type SourceType = typeof SOURCE_TYPES[number];

/** Regras públicas (exportadas e testadas). A ordem de avaliação é a ordem deste objeto. Extensões além do contrato original estão marcadas. */
export const SOURCE_TYPE_RULES = {
  orgao_oficial: {
    suffixes: ['.gov.br', '.jus.br', '.leg.br', '.def.br', '.mp.br', '.gov', '.esteri.it', '.europa.eu'], // `.leg.br`, `.def.br`, `.mp.br`, `.gov`, `.esteri.it`, `.europa.eu`: extensão (casas legislativas, defensorias, ministérios públicos, governos e consulados estrangeiros)
    exact: ['gov.br', 'jus.br', 'leg.br'],
    labelStartsWith: ['oab'], // oabsp.org.br, consulta.oab.org.br
    labelContains: ['embassy', 'consulate'], // extensão: br.usembassy.org
    foreignGovernment: /(^|\.)(gov|gob|gouv|govt)\.[a-z]{2}$/, // extensão: gov.pt, gob.mx, gouv.fr
  },
  portal_agregador: { labelContains: ['jusbrasil', 'migalhas', 'conjur', 'consultor-juridico'] },
  midia: { labels: ['g1', 'globo', 'oglobo', 'uol', 'folha', 'estadao', 'terra', 'cnnbrasil'] },
  rede_social: { labels: ['instagram', 'youtube', 'youtu', 'facebook', 'linkedin', 'twitter', 'reddit', 'tiktok'], exact: ['x.com'], suffixes: ['.x.com'] },
  academico: { suffixes: ['.edu.br', '.usp.br'], exact: ['usp.br'], labelContains: ['scielo'] },
  escritorio: { suffixes: ['.adv.br'], hostContains: ['advoc', 'advogad'], labelEndsWith: ['adv'] }, // `labelEndsWith`: extensão (paulomagalhaesadv.com); exige rótulo com mais de 5 letras
} as const;

/** Classifica o domínio citado. Regras na ordem de `SOURCE_TYPE_RULES`; sem correspondência: `outro`. */
export function classifySourceType(hostRaw: string): SourceType {
  const host = String(hostRaw ?? '').toLowerCase().trim().replace(/^www\./, '').replace(/\.$/, '');
  if (!host) return 'outro';
  const labels = host.split('.');
  const endsWithAny = (list: readonly string[]) => list.some((s) => host.endsWith(s));
  const o = SOURCE_TYPE_RULES.orgao_oficial;
  if (endsWithAny(o.suffixes) || (o.exact as readonly string[]).includes(host) || o.foreignGovernment.test(host) || labels.some((l) => o.labelStartsWith.some((p) => l.startsWith(p)) || o.labelContains.some((t) => l.includes(t)))) return 'orgao_oficial';
  if (SOURCE_TYPE_RULES.portal_agregador.labelContains.some((t) => labels.some((l) => l.includes(t)))) return 'portal_agregador';
  if (labels.some((l) => (SOURCE_TYPE_RULES.midia.labels as readonly string[]).includes(l))) return 'midia';
  const r = SOURCE_TYPE_RULES.rede_social;
  if (labels.some((l) => (r.labels as readonly string[]).includes(l)) || (r.exact as readonly string[]).includes(host) || endsWithAny(r.suffixes)) return 'rede_social';
  const a = SOURCE_TYPE_RULES.academico;
  if (endsWithAny(a.suffixes) || (a.exact as readonly string[]).includes(host) || a.labelContains.some((t) => labels.some((l) => l.includes(t)))) return 'academico';
  const e = SOURCE_TYPE_RULES.escritorio;
  if (endsWithAny(e.suffixes) || e.hostContains.some((t) => host.includes(t)) || labels.some((l) => l.length > 5 && e.labelEndsWith.some((t) => l.endsWith(t)))) return 'escritorio';
  return 'outro';
}

// ---------------------------------------------------------------------------
// Observações válidas, concorrentes rastreados
// ---------------------------------------------------------------------------
export type VisibilityOptions = {
  tracked?: TrackedCompetitor[];
  /** Padrão false: observação com risco de personalização (conta logada do dono) NÃO entra no índice. */
  includePersonalized?: boolean;
};

export const ownCited = (o: Observation): boolean => o.cited === true || o.citations.some((c) => c.is_own);

export function splitObservations(obs: Observation[], opts: VisibilityOptions = {}): { valid: Observation[]; excluded: { personalization: number; unmeasured: number } } {
  const valid: Observation[] = [];
  const excluded = { personalization: 0, unmeasured: 0 };
  for (const o of obs) {
    if (o.mentioned === null) { excluded.unmeasured++; continue; }
    if (o.personalization_risk && !opts.includePersonalized) { excluded.personalization++; continue; }
    valid.push(o);
  }
  return { valid, excluded };
}

type TrackedIndex = { count: number; byKey: Map<string, number[]>; byDomain: Map<string, number[]> };
export function buildTrackedIndex(tracked: TrackedCompetitor[]): TrackedIndex {
  const byKey = new Map<string, number[]>();
  const byDomain = new Map<string, number[]>();
  tracked.forEach((t, i) => {
    const key = brandKey(t.name);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), i]);
    for (const d of t.domains) {
      const nd = normalizeDomain(d);
      if (nd) byDomain.set(nd, [...(byDomain.get(nd) ?? []), i]);
    }
  });
  return { count: tracked.length, byKey, byDomain };
}
/** Índices (em `tracked`) dos concorrentes que aparecem na observação: por nome, por domínio do concorrente ou por citação de domínio dele. */
export function trackedHits(o: Observation, idx: TrackedIndex): Set<number> {
  const hits = new Set<number>();
  if (!idx.count) return hits;
  for (const m of o.competitors) {
    for (const i of idx.byKey.get(brandKey(m.name)) ?? []) hits.add(i);
    if (m.host) for (const s of hostSuffixes(m.host)) for (const i of idx.byDomain.get(s) ?? []) hits.add(i);
  }
  for (const c of o.citations) for (const s of hostSuffixes(c.host)) for (const i of idx.byDomain.get(s) ?? []) hits.add(i);
  return hits;
}

const groupKey = (o: Observation) => `${(o.query ?? '').trim().toLowerCase()}|${engineInfo(o.engine).id}|${o.country ?? ''}`;

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------
export type RateIndicator = { value: number | null; low: number | null; high: number | null; n: number; k: number };
export type Indicators = {
  n: number;
  vr: RateIndicator;
  cr: RateIndicator;
  sov: { value: number | null; n: number; own: number; competitors: number };
  est: { value: number | null; n: number };
  pm: null;
  rep: null;
  excluded: { personalization: number; unmeasured: number };
};

const rate = (k: number, n: number): RateIndicator => {
  const w = wilsonInterval(k, n);
  return { value: ratio(k, n), low: w ? w.low : null, high: w ? w.high : null, n, k };
};

/** Estabilidade de um grupo de repetições: 1 − 2·desvio padrão (binário: máximo 0,5), de 0 (instável) a 1 (sempre igual). Quem chama só usa grupos com ao menos 1 menção. */
export const stabilityOfGroup = (mentions: number, n: number): number => 1 - 2 * Math.sqrt(Math.max(0, (mentions / n) * (1 - mentions / n)));

export function computeIndicators(observations: Observation[], opts: VisibilityOptions = {}): Indicators {
  const { valid, excluded } = splitObservations(observations, opts);
  const idx = buildTrackedIndex(opts.tracked ?? []);
  let k = 0, c = 0, comp = 0;
  const groups = new Map<string, { n: number; m: number }>();
  for (const o of valid) {
    const m = o.mentioned === true;
    if (m) k++;
    if (ownCited(o)) c++;
    comp += trackedHits(o, idx).size;
    const g = groups.get(groupKey(o)) ?? { n: 0, m: 0 };
    g.n++; if (m) g.m++;
    groups.set(groupKey(o), g);
  }
  const n = valid.length;
  // EST só conta grupos em que a marca aparece ao menos uma vez: a ausência constante é "estável", mas não é visibilidade e não pode premiar o índice.
  const reps = [...groups.values()].filter((g) => g.n >= EST_MIN_REPS && g.m >= 1);
  const est = reps.length ? reps.reduce((s, g) => s + stabilityOfGroup(g.m, g.n), 0) / reps.length : null;
  const sovDen = k + comp;
  return {
    n,
    vr: rate(k, n),
    cr: rate(c, n),
    sov: { value: idx.count > 0 && sovDen > 0 ? k / sovDen : null, n: idx.count > 0 ? sovDen : 0, own: k, competitors: comp },
    est: { value: est, n: reps.length },
    pm: null,
    rep: null,
    excluded,
  };
}

// ---------------------------------------------------------------------------
// ZVI composto
// ---------------------------------------------------------------------------
type MaybeValue = { value: number | null } | null | undefined;
export type IndicatorInput = { vr: MaybeValue; cr: MaybeValue; sov: MaybeValue; est: MaybeValue; pm?: MaybeValue; rep?: MaybeValue };
export type ZviResult = { value: number | null; partial: boolean; missing: ComponentId[]; weights_used: Partial<Record<ComponentId, number>> };

const clip01 = (x: number) => Math.min(1, Math.max(0, x));
/** Normaliza cada indicador para 0–1 (P = clip(1/PM); R = (REP+100)/200). `null` = indisponível. */
function componentValues(ind: IndicatorInput): Record<ComponentId, number | null> {
  const num = (m: MaybeValue) => (m && typeof m.value === 'number' && Number.isFinite(m.value) ? m.value : null);
  const pm = num(ind.pm);
  const rep = num(ind.rep);
  const vr = num(ind.vr), cr = num(ind.cr), sov = num(ind.sov), est = num(ind.est);
  return {
    vr: vr === null ? null : clip01(vr),
    cr: cr === null ? null : clip01(cr),
    sov: sov === null ? null : clip01(sov),
    pm: pm === null || pm <= 0 ? null : clip01(1 / pm),
    rep: rep === null ? null : clip01((rep + 100) / 200),
    est: est === null ? null : clip01(est),
  };
}

/** ZVI = 100 · Σ(peso·componente) / Σ(pesos disponíveis). Sem VR (sem observações válidas) o índice é `null`. */
export function computeZvi(ind: IndicatorInput, weights?: Partial<Record<ComponentId, number>>): ZviResult {
  const w: Record<ComponentId, number> = { ...ZVI_WEIGHTS };
  for (const id of COMPONENT_IDS) {
    const v = weights?.[id];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) w[id] = v;
  }
  const comps = componentValues(ind);
  const missing: ComponentId[] = [];
  let sum = 0, wsum = 0;
  const used: Partial<Record<ComponentId, number>> = {};
  for (const id of COMPONENT_IDS) {
    const x = comps[id];
    if (x === null) { missing.push(id); continue; }
    sum += w[id] * x; wsum += w[id];
  }
  if (comps.vr === null || wsum <= 0) return { value: null, partial: missing.length > 0, missing, weights_used: {} };
  for (const id of COMPONENT_IDS) if (comps[id] !== null) used[id] = w[id] / wsum;
  return { value: (100 * sum) / wsum, partial: missing.length > 0, missing, weights_used: used };
}

export type Confidence = 'alta' | 'media' | 'baixa' | 'sem_dados';
/** Confiança pelo tamanho da amostra; um índice parcial nunca passa de "media". */
export function confidenceFor(n: number, partial: boolean): Confidence {
  if (n <= 0) return 'sem_dados';
  if (n < LOW_CONFIDENCE_N) return 'baixa';
  if (n < HIGH_CONFIDENCE_N || partial) return 'media';
  return 'alta';
}

export type VisibilitySummary = {
  n: number;
  indicators: Indicators;
  zvi: ZviResult & { low: number | null; high: number | null; confidence: Confidence };
};

/**
 * Intervalo do ZVI: bootstrap das observações com semente fixa (determinístico). A estabilidade (EST) entra como valor FIXO (o do conjunto
 * original): reamostrar com reposição duplicaria observações e criaria "repetições" artificiais da mesma pergunta, inflando a EST.
 * Logo o intervalo reflete a incerteza de VR, CR e SoV (95% do peso observável).
 */
export function bootstrapZvi(valid: Observation[], opts: VisibilityOptions = {}, seed = BOOTSTRAP_SEED, iterations?: number): { low: number; high: number } | null {
  const n = valid.length;
  if (n === 0) return null;
  const B = iterations ?? (n > BOOTSTRAP_LARGE_N ? BOOTSTRAP_ITERATIONS_LARGE : BOOTSTRAP_ITERATIONS);
  const idx = buildTrackedIndex(opts.tracked ?? []);
  const estFixed = computeIndicators(valid, { ...opts, includePersonalized: true }).est.value;
  const m = new Uint8Array(n), c = new Uint8Array(n), cc = new Uint16Array(n);
  valid.forEach((o, i) => {
    m[i] = o.mentioned === true ? 1 : 0;
    c[i] = ownCited(o) ? 1 : 0;
    cc[i] = trackedHits(o, idx).size;
  });
  const rng = mulberry32(seed);
  const values: number[] = [];
  for (let b = 0; b < B; b++) {
    let sm = 0, sc = 0, scc = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      sm += m[j]; sc += c[j]; scc += cc[j];
    }
    const den = sm + scc;
    const z = computeZvi({
      vr: { value: sm / n }, cr: { value: sc / n },
      sov: { value: idx.count > 0 && den > 0 ? sm / den : null },
      est: { value: estFixed },
    }).value;
    if (z !== null) values.push(z);
  }
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return { low: values[Math.floor(0.025 * (values.length - 1))], high: values[Math.ceil(0.975 * (values.length - 1))] };
}

/** Indicadores + ZVI (com intervalo e confiança) de um conjunto de observações. `interval: false` pula o bootstrap. */
export function summarizeVisibility(observations: Observation[], opts: VisibilityOptions & { interval?: boolean; weights?: Partial<Record<ComponentId, number>> } = {}): VisibilitySummary {
  const indicators = computeIndicators(observations, opts);
  const zvi = computeZvi(indicators, opts.weights);
  let low: number | null = null, high: number | null = null;
  if (zvi.value !== null && opts.interval !== false) {
    const iv = bootstrapZvi(splitObservations(observations, opts).valid, opts);
    if (iv) { low = Math.min(iv.low, zvi.value); high = Math.max(iv.high, zvi.value); }
  }
  return { n: indicators.n, indicators, zvi: { ...zvi, low, high, confidence: confidenceFor(indicators.n, zvi.partial) } };
}

// ---------------------------------------------------------------------------
// ZSS: índice de fonte
// ---------------------------------------------------------------------------
export type SourceCitation = {
  obs_id: string;
  host: string;
  url: string;
  engine: string;
  query: string | null;
  topic: string | null;
  position: number | null;
  is_own: boolean;
  observed_at: string;
  /** A marca foi mencionada ou citada na mesma observação. */
  brand_present: boolean;
};
export type SourceContext = {
  nowMs: number;
  /** Perguntas distintas do segmento (denominador da Cobertura). */
  totalQueries: number;
  /** Motores ativos (famílias distintas observadas; denominador da Diversidade). */
  activeEngines: number;
  /** Temas-alvo do cliente; `null`/ausente = todo tema observado conta como alvo. */
  targetTopics?: Set<string> | null;
  /** Domínios de concorrentes (rastreados ou inferidos): viram tipo `escritorio`. */
  competitorDomains?: string[];
  ownHosts?: string[];
};
export type SourceScore = {
  host: string;
  type: SourceType;
  zss: number;
  coverage: number;
  position: number;
  diversity: number;
  recency: number;
  relevance: number;
  citations: number;
  queries: number;
  engines: string[];
  is_own: boolean;
  last_seen: string | null;
  /** A marca aparece (mencionada ou citada) em ao menos uma das respostas que citam esta fonte. */
  brand_present: boolean;
};

export function computeSourceScores(citations: SourceCitation[], ctx: SourceContext): SourceScore[] {
  const byHost = new Map<string, SourceCitation[]>();
  for (const c of citations) {
    const host = c.host.toLowerCase().replace(/^www\./, '');
    if (!host) continue;
    byHost.set(host, [...(byHost.get(host) ?? []), c]);
  }
  const out: SourceScore[] = [];
  for (const [host, list] of byHost) {
    const queries = new Set(list.map((c) => (c.query ?? '').trim().toLowerCase()).filter(Boolean));
    const engines = [...new Set(list.map((c) => engineInfo(c.engine).id))].sort();
    const positions = list.map((c) => c.position).filter((p): p is number => typeof p === 'number' && p >= 1);
    const lastMs = Math.max(...list.map((c) => Date.parse(c.observed_at)).filter(Number.isFinite), Number.NEGATIVE_INFINITY);
    const days = Number.isFinite(lastMs) ? Math.max(0, (ctx.nowMs - lastMs) / 86_400_000) : Infinity;
    const topics = ctx.targetTopics;
    const relevant = list.filter((c) => (topics ? c.topic !== null && topics.has(c.topic) : c.topic !== null)).length;
    const coverage = ctx.totalQueries > 0 ? Math.min(1, queries.size / ctx.totalQueries) : 0;
    const position = positions.length ? positions.reduce((s, p) => s + 1 / p, 0) / positions.length : 0;
    const diversity = ctx.activeEngines > 0 ? Math.min(1, engines.length / ctx.activeEngines) : 0;
    const recency = Number.isFinite(days) ? Math.pow(0.5, days / ZSS_RECENCY_HALF_LIFE_DAYS) : 0;
    const relevance = list.length ? relevant / list.length : 0;
    const zss = 100 * (ZSS_WEIGHTS.coverage * coverage + ZSS_WEIGHTS.position * position + ZSS_WEIGHTS.diversity * diversity + ZSS_WEIGHTS.recency * recency + ZSS_WEIGHTS.relevance * relevance);
    const isOwn = list.some((c) => c.is_own) || (ctx.ownHosts ?? []).some((h) => hostInDomain(host, h));
    const isCompetitor = (ctx.competitorDomains ?? []).some((d) => hostInDomain(host, d));
    const type: SourceType = isOwn || isCompetitor ? 'escritorio' : classifySourceType(host);
    out.push({
      host, type, zss: round(zss, 1) as number, coverage: round(coverage) as number, position: round(position) as number, diversity: round(diversity) as number,
      recency: round(recency) as number, relevance: round(relevance) as number, citations: list.length, queries: queries.size, engines, is_own: isOwn,
      last_seen: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null, brand_present: list.some((c) => c.brand_present),
    });
  }
  return out.sort((a, b) => b.zss - a.zss || b.citations - a.citations || a.host.localeCompare(b.host));
}

export type SourceTarget = { host: string; type: SourceType; zss: number; why: string };
/** Alvos de presença: fontes de ZSS alto (>= mínimo) onde a marca não aparece; exclui a própria, órgãos oficiais e domínios de concorrentes. */
export function selectTargets(sources: SourceScore[], opts: { minZss?: number; limit?: number; competitorDomains?: string[] } = {}): SourceTarget[] {
  const min = opts.minZss ?? TARGET_MIN_ZSS;
  const comp = opts.competitorDomains ?? [];
  return sources
    .filter((s) => !s.is_own && !s.brand_present && s.zss >= min && s.type !== 'orgao_oficial' && s.type !== 'escritorio' && !comp.some((d) => hostInDomain(s.host, d)))
    .slice(0, opts.limit ?? 10)
    .map((s) => ({
      host: s.host, type: s.type, zss: s.zss,
      why: `Citada em ${s.queries} ${s.queries === 1 ? 'pergunta' : 'perguntas'} por ${s.engines.length} ${s.engines.length === 1 ? 'motor' : 'motores'}, e a marca não aparece nessas respostas.`,
    }));
}

// ---------------------------------------------------------------------------
// Concorrentes: ranking, sugestões
// ---------------------------------------------------------------------------
export type RankRow = { rank: number | null; name: string; is_own: boolean; vr: number | null; sov: number | null; n: number; mentions: number; insufficient_sample: boolean; id?: string };
export function rankCompetitors(input: { own: { name: string; mentions: number }; competitors: Array<{ id?: string; name: string; mentions: number }>; n: number; minN?: number }): RankRow[] {
  const minN = input.minN ?? MIN_RANK_N;
  const insufficient = input.n < minN;
  const rows = [
    { id: undefined as string | undefined, name: input.own.name, is_own: true, mentions: input.own.mentions },
    ...input.competitors.map((c) => ({ id: c.id, name: c.name, is_own: false, mentions: c.mentions })),
  ];
  const total = rows.reduce((s, r) => s + r.mentions, 0);
  const sorted = [...rows].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, 'pt-BR'));
  let lastMentions = -1, lastRank = 0;
  return sorted.map((r, i) => {
    const rank = r.mentions === lastMentions ? lastRank : i + 1; // empate: mesma posição (1, 1, 3)
    lastMentions = r.mentions; lastRank = rank;
    return {
      ...(r.id ? { id: r.id } : {}), rank: insufficient ? null : rank, name: r.name, is_own: r.is_own,
      vr: ratio(r.mentions, input.n), sov: total > 0 ? r.mentions / total : null, n: input.n, mentions: r.mentions, insufficient_sample: insufficient,
    };
  });
}

export type NameClass = 'escritorio' | 'advogado_individual' | 'rede_social' | 'portal' | 'midia' | 'oficial' | 'dominio' | 'fora_do_tema';
/** Classifica o NOME de uma marca citada pelo observador (para decidir se vira sugestão de concorrente). */
export function classifyBrandName(raw: string): NameClass {
  const cleaned = cleanBrandName(raw);
  const n = normalizeText(raw);
  if (/fora do tema/.test(n)) return 'fora_do_tema';
  if (/^\s*(instagram|youtube|facebook|linkedin|tiktok|twitter|reddit)\s*:/i.test(raw)) return 'rede_social';
  if (!/\s/.test(cleaned) && normalizeDomain(cleaned)) return 'dominio';
  const c = compact(cleaned);
  if (['jusbrasil', 'migalhas', 'conjur', 'consultorjuridico'].some((t) => c.includes(t))) return 'portal';
  if (/\b(g1|globo|uol|folha|estadao|cnn)\b/.test(n)) return 'midia';
  if (/\b(tribunal|defensoria|ministerio|ordem dos advogados|oab|delegacia|prefeitura|embaixada|consulado|camara|senado|stj|stf|cnj)\b/.test(n)) return 'oficial';
  const firm = /\b(advocacia|advogados|associados|sociedade)\b/.test(n) || /&/.test(cleaned);
  const person = /^(dr|dra)\b/.test(n) || /\b(advogado|advogada|criminalista)\b/.test(n);
  if (person && !firm) return 'advogado_individual';
  return 'escritorio';
}

export type CompetitorSuggestion = { name: string; domain: string | null; mentions: number; engines: string[]; reason: string; kind: 'escritorio' | 'advogado_individual' };
/**
 * Sugestões calculadas em tempo de leitura (nada é gravado). Só entram marcas que parecem escritórios/advogados: exclui a própria marca,
 * redes sociais, portais, mídia, órgãos oficiais, domínios soltos e anotações "fora do tema". Rastreadas e ignoradas não voltam como sugestão.
 */
export function suggestCompetitors(valid: Observation[], ctx: { ownAliases: string[]; ownHosts: string[]; known: TrackedCompetitor[]; limit?: number }): CompetitorSuggestion[] {
  const ownKeys = new Set<string>();
  const ownHostSet = new Set<string>(ctx.ownHosts.map((h) => h.toLowerCase().replace(/^www\./, '')));
  for (const a of ctx.ownAliases) {
    const dom = normalizeDomain(a);
    if (dom && !/\s/.test(a.trim())) { ownHostSet.add(dom); continue; }
    const k = brandKey(a);
    if (k.length >= 3) ownKeys.add(k);
  }
  for (const h of ownHostSet) { const l = stripGenericSuffix(mainLabel(h)); if (l.length >= 3) ownKeys.add(l); }
  const knownIdx = buildTrackedIndex(ctx.known);
  const hosts = new Set<string>();
  for (const o of valid) for (const c of o.citations) hosts.add(c.host.toLowerCase().replace(/^www\./, ''));
  const agg = new Map<string, { name: string; kind: 'escritorio' | 'advogado_individual'; obs: Set<string>; engines: Set<string>; host: string | null }>();
  for (const o of valid) {
    for (const m of o.competitors) {
      const name = cleanBrandName(m.name);
      if (name.length < 2) continue;
      const cls = classifyBrandName(m.name);
      if (cls !== 'escritorio' && cls !== 'advogado_individual') continue;
      const key = brandKey(name);
      if (!key || ownKeys.has(key) || ownKeys.has(stripGenericSuffix(key))) continue;
      if (knownIdx.byKey.has(key)) continue;
      const rec = agg.get(key) ?? { name, kind: cls, obs: new Set<string>(), engines: new Set<string>(), host: null };
      rec.obs.add(o.id);
      rec.engines.add(engineInfo(o.engine).id);
      if (!rec.host) rec.host = (m.host ? normalizeDomain(m.host) : null) ?? [...hosts].find((h) => nameMatchesHost(name, h)) ?? null;
      agg.set(key, rec);
    }
  }
  return [...agg.values()]
    .filter((r) => !(r.host && [...knownIdx.byDomain.keys()].some((d) => hostInDomain(r.host!, d))) && !(r.host && ownHostSet.has(r.host)))
    .map((r) => ({
      name: r.name, domain: r.host, mentions: r.obs.size, engines: [...r.engines].sort(), kind: r.kind,
      reason: `Apareceu em ${r.obs.size} ${r.obs.size === 1 ? 'resposta' : 'respostas'} de ${r.engines.size} ${r.engines.size === 1 ? 'motor' : 'motores'}, nas perguntas observadas.`,
    }))
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, ctx.limit ?? 30);
}

// ---------------------------------------------------------------------------
// Perguntas
// ---------------------------------------------------------------------------
export type QuestionAgg = {
  query: string;
  topic: string | null;
  intent: string | null;
  /** Todas as observações da pergunta (inclusive as fora do índice). */
  observations: number;
  /** Observações válidas (entram no índice). */
  n: number;
  vr: number | null;
  cr: number | null;
  last_observed_at: string;
  engines: string[];
  /** Concorrentes (nomes limpos) vistos nas observações válidas. */
  competitors: string[];
  mentioned: number;
};

export function aggregateQuestions(observations: Observation[], opts: VisibilityOptions = {}): QuestionAgg[] {
  const groups = new Map<string, Observation[]>();
  for (const o of observations) {
    const q = (o.query ?? '').trim();
    if (!q) continue;
    groups.set(q, [...(groups.get(q) ?? []), o]);
  }
  const out: QuestionAgg[] = [];
  for (const [query, list] of groups) {
    const { valid } = splitObservations(list, opts);
    const mentioned = valid.filter((o) => o.mentioned === true).length;
    const cited = valid.filter(ownCited).length;
    const last = list.map((o) => o.observed_at).sort().at(-1) as string;
    const comps = new Set<string>();
    for (const o of valid) for (const m of o.competitors) { const c = cleanBrandName(m.name); if (c) comps.add(c); }
    out.push({
      query, topic: list.find((o) => o.topic)?.topic ?? null, intent: list.find((o) => o.intent)?.intent ?? null, observations: list.length, n: valid.length,
      vr: ratio(mentioned, valid.length), cr: ratio(cited, valid.length), last_observed_at: last,
      engines: [...new Set(list.map((o) => engineInfo(o.engine).id))].sort(), competitors: [...comps].sort((a, b) => a.localeCompare(b, 'pt-BR')), mentioned,
    });
  }
  return out.sort((a, b) => (a.last_observed_at < b.last_observed_at ? 1 : a.last_observed_at > b.last_observed_at ? -1 : a.query.localeCompare(b.query, 'pt-BR')));
}

// ---------------------------------------------------------------------------
// Palavras-chave dos prompts
// ---------------------------------------------------------------------------
const STOPWORDS = new Set((
  // português
  'a o as os um uma uns umas de da do das dos em na no nas nos por para pra com sem sob sobre entre ate ao aos à às e ou mas que se como quando onde qual quais quem quanto quantos quantas ' +
  'eu me meu minha meus minhas tu te seu sua seus suas ele ela eles elas nos nosso nossa nossos nossas lhe lhes isso isto aquilo esse essa esses essas este esta estes estas aquele aquela ' +
  'foi era ser sao esta estao estou estamos estive ter tem tenho temos tinha ha havia fazer faz fiz pode posso podem deve devo preciso quero queria vai vou vamos ir ainda ja nao sim mais menos muito muita ' +
  'tambem so apenas depois antes durante entao porque pois pelo pela pelos pelas num numa dele dela deles delas aqui ali la cada todo toda todos todas outro outra outros outras mesmo mesma ' +
  'o que oque qual sobre uns algum alguma alguns algumas nenhum nenhuma ' +
  // palavras de instrução do roteiro de coleta (não são tema da pergunta)
  'pesquise pesquisar cite citar links link web responda responder consultou realmente internet ' +
  // inglês e espanhol (consultas internacionais)
  'the of and to in is it my was for on with as at by an be this that from or are i he she we you they his her their our your me him them ' +
  'el la los las un una unos unas y en es del al lo por con para su sus mi mis tu tus que fue'
).split(/\s+/).filter(Boolean));
export const isStopword = (t: string) => STOPWORDS.has(t);

export type KeywordPrompt = { query: string; observations: number; valid: number; mentioned: number };
export type KeywordRow = { term: string; size: number; prompts: number; observations: number; valid: number; vr: number | null };

/** Termos simples (n-gramas de 1 a 3 palavras, sem parar em stopwords) a partir dos textos das perguntas. */
export function extractKeywords(prompts: KeywordPrompt[], opts: { minPrompts?: number; limit?: number; maxSize?: number } = {}): KeywordRow[] {
  const maxSize = Math.min(3, Math.max(1, opts.maxSize ?? 3));
  const stats = new Map<string, { size: number; ids: Set<number> }>();
  prompts.forEach((p, pid) => {
    // "São Paulo" é um termo só (senão "são" cairia como stopword)
    const tokens = (p.query.toLowerCase().replace(/\bs[ãa]o\s+paulo\b/g, 'são-paulo').match(/\p{L}[\p{L}\p{N}'-]*|\d[\d.,/]*\d/gu) ?? []).map((t) => t.replace(/[.,/'-]+$/g, ''));
    const segments: string[][] = [[]];
    for (const t of tokens) {
      const bare = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (STOPWORDS.has(t) || STOPWORDS.has(bare) || t.length < 3) segments.push([]);
      else segments[segments.length - 1].push(t);
    }
    for (const seg of segments) {
      for (let size = 1; size <= maxSize; size++) {
        for (let i = 0; i + size <= seg.length; i++) {
          const term = seg.slice(i, i + size).join(' ').replace(/são-paulo/g, 'são paulo');
          const rec = stats.get(term) ?? { size, ids: new Set<number>() };
          rec.ids.add(pid);
          stats.set(term, rec);
        }
      }
    }
  });
  // Entre termos com exatamente as mesmas perguntas, fica o mais longo (os contidos nele são redundantes).
  const bySignature = new Map<string, string[]>();
  for (const [term, rec] of stats) {
    const sig = [...rec.ids].sort((a, b) => a - b).join(',');
    bySignature.set(sig, [...(bySignature.get(sig) ?? []), term]);
  }
  const kept: string[] = [];
  for (const terms of bySignature.values()) {
    const sorted = [...terms].sort((a, b) => b.length - a.length || a.localeCompare(b));
    const chosen: string[] = [];
    for (const t of sorted) if (!chosen.some((c) => (' ' + c + ' ').includes(' ' + t + ' '))) chosen.push(t);
    kept.push(...chosen);
  }
  const min = opts.minPrompts ?? 1;
  const rows: KeywordRow[] = kept.map((term) => {
    const rec = stats.get(term)!;
    let observations = 0, valid = 0, mentioned = 0;
    for (const id of rec.ids) { observations += prompts[id].observations; valid += prompts[id].valid; mentioned += prompts[id].mentioned; }
    return { term, size: rec.size, prompts: rec.ids.size, observations, valid, vr: ratio(mentioned, valid) };
  }).filter((r) => r.prompts >= min);
  return rows.sort((a, b) => b.prompts - a.prompts || b.size - a.size || b.observations - a.observations || a.term.localeCompare(b.term, 'pt-BR')).slice(0, opts.limit ?? 100);
}

// ---------------------------------------------------------------------------
// Oportunidades (determinísticas, com evidência; nenhum texto gerado por IA)
// ---------------------------------------------------------------------------
export type Priority = 'alta' | 'media' | 'baixa';
export type OpportunityKind = 'pergunta_sem_marca' | 'fonte_alvo' | 'concorrente_a_frente';
export type Opportunity = { kind: OpportunityKind; title: string; detail: string; priority: Priority; evidence: Record<string, unknown> };
const PRIORITY_ORDER: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };
const KIND_ORDER: Record<OpportunityKind, number> = { pergunta_sem_marca: 0, concorrente_a_frente: 1, fonte_alvo: 2 };

export function buildOpportunities(input: {
  questions: QuestionAgg[];
  targets: SourceTarget[];
  sourceStats?: Map<string, SourceScore>;
  own: { name: string; vr: number | null; n: number };
  rivals: Array<{ name: string; vr: number | null; mentions: number }>;
  limit?: number;
}): Opportunity[] {
  const items: Opportunity[] = [];
  for (const q of input.questions) {
    if (q.n < 1 || q.mentioned > 0) continue;
    const priority: Priority = q.competitors.length > 0 || q.engines.length >= 2 ? 'alta' : q.n >= 2 ? 'media' : 'baixa';
    items.push({
      kind: 'pergunta_sem_marca', priority,
      title: `A marca ainda não aparece na pergunta: "${q.query.length > 110 ? q.query.slice(0, 107) + '...' : q.query}"`,
      detail: q.competitors.length
        ? `Nas ${q.n} ${q.n === 1 ? 'observação' : 'observações'} desta pergunta a marca não foi mencionada, e as respostas citaram ${q.competitors.slice(0, 3).join(', ')}${q.competitors.length > 3 ? ' e outros' : ''}. Um conteúdo que responda bem a esta pergunta é o primeiro passo.`
        : `Nas ${q.n} ${q.n === 1 ? 'observação' : 'observações'} desta pergunta a marca não foi mencionada. Um conteúdo que responda bem a esta pergunta é o primeiro passo.`,
      evidence: { query: q.query, topic: q.topic, observations: q.n, engines: q.engines, competitors: q.competitors.slice(0, 10) },
    });
  }
  for (const t of input.targets) {
    items.push({
      kind: 'fonte_alvo', priority: t.zss >= 50 ? 'alta' : t.zss >= 35 ? 'media' : 'baixa',
      title: `Buscar presença em ${t.host}`,
      detail: `${t.why} Estar nesta fonte (por exemplo, com um artigo, uma entrevista ou um perfil) aumenta a chance de aparecer nas respostas.`,
      evidence: { host: t.host, type: t.type, zss: t.zss },
    });
  }
  if (input.own.n >= MIN_RANK_N && input.own.vr !== null) {
    for (const r of input.rivals) {
      if (r.vr === null || r.vr <= input.own.vr) continue;
      const gap = r.vr - input.own.vr;
      items.push({
        kind: 'concorrente_a_frente', priority: gap >= 0.2 ? 'alta' : gap >= 0.1 ? 'media' : 'baixa',
        title: `${r.name} aparece mais do que a marca`,
        detail: `${r.name} foi mencionado em ${Math.round(r.vr * 100)}% das respostas, contra ${Math.round(input.own.vr * 100)}% da marca, em ${input.own.n} observações.`,
        evidence: { competitor: r.name, competitor_vr: round(r.vr), own_vr: round(input.own.vr), n: input.own.n, mentions: r.mentions },
      });
    }
  }
  return items
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, 'pt-BR'))
    .slice(0, input.limit ?? 50);
}

// ---------------------------------------------------------------------------
// "O que mudou" (determinístico)
// ---------------------------------------------------------------------------
export type Change = { kind: string; text: string };
const pct = (v: number) => `${Math.round(v * 100)}%`;
export function buildChanges(input: { current: VisibilitySummary; previous: VisibilitySummary | null; currentObs: Observation[]; previousObs: Observation[]; opts?: VisibilityOptions }): Change[] {
  const out: Change[] = [];
  const cur = input.current, prev = input.previous;
  if (cur.n === 0) return [{ kind: 'sem_observacoes', text: 'Ainda não há observações válidas neste período. Peça ao gestor para rodar uma coleta.' }];
  const curV = cur.indicators.vr.value, prevV = prev?.indicators.vr.value ?? null;
  if (prev && prevV !== null && curV !== null) {
    const d = curV - prevV;
    if (Math.abs(d) >= 0.05) out.push({ kind: d > 0 ? 'visibilidade_subiu' : 'visibilidade_caiu', text: `A visibilidade ${d > 0 ? 'subiu' : 'caiu'} de ${pct(prevV)} para ${pct(curV)} em relação ao período anterior.` });
    else out.push({ kind: 'visibilidade_estavel', text: `A visibilidade ficou estável: ${pct(prevV)} antes e ${pct(curV)} agora.` });
  } else if (!prev) {
    out.push({ kind: 'sem_comparacao', text: 'O período anterior não tem observações válidas, então ainda não dá para comparar.' });
  }
  const curValid = splitObservations(input.currentObs, input.opts).valid;
  const prevValid = splitObservations(input.previousObs, input.opts).valid;
  const prevHosts = new Set(prevValid.flatMap((o) => o.citations.map((c) => c.host.toLowerCase().replace(/^www\./, ''))));
  const curHosts = new Map<string, number>();
  for (const o of curValid) for (const c of o.citations) { const h = c.host.toLowerCase().replace(/^www\./, ''); curHosts.set(h, (curHosts.get(h) ?? 0) + 1); }
  if (prevValid.length) {
    const fresh = [...curHosts.entries()].filter(([h]) => !prevHosts.has(h)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([h]) => h);
    if (fresh.length) out.push({ kind: 'fontes_novas', text: `Fontes novas nas respostas das IAs: ${fresh.join(', ')}.` });
    const ownBefore = prevValid.some(ownCited), ownNow = curValid.some(ownCited);
    if (ownNow && !ownBefore) out.push({ kind: 'primeira_citacao', text: 'A marca foi citada como fonte pela primeira vez no período.' });
  }
  if (cur.indicators.excluded.personalization > 0) {
    const k = cur.indicators.excluded.personalization;
    out.push({ kind: 'observacoes_desconsideradas', text: `${k} ${k === 1 ? 'observação foi desconsiderada' : 'observações foram desconsideradas'} por possível personalização (conta logada); ${k === 1 ? 'ela não entra' : 'elas não entram'} no índice.` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Metodologia aberta
// ---------------------------------------------------------------------------
export const COMPONENT_DOCS: Array<{ id: ComponentId; label: string; weight: number; description: string }> = [
  { id: 'vr', label: 'Visibilidade', weight: ZVI_WEIGHTS.vr, description: 'Parte das respostas das IAs e dos buscadores em que a marca é mencionada. Mostra o intervalo de confiança de Wilson (95%).' },
  { id: 'cr', label: 'Citação como fonte', weight: ZVI_WEIGHTS.cr, description: 'Parte das respostas em que um endereço da marca aparece como fonte. Mede quem a IA usa, não só quem ela menciona.' },
  { id: 'sov', label: 'Participação de voz', weight: ZVI_WEIGHTS.sov, description: 'Menções da marca divididas pelas menções da marca e dos concorrentes acompanhados. Só existe com concorrentes cadastrados.' },
  { id: 'pm', label: 'Posição da menção', weight: ZVI_WEIGHTS.pm, description: 'Ordem em que a marca aparece na resposta (1 = primeira). Ainda não medido: depende da leitura automática das respostas (bloco V2).' },
  { id: 'rep', label: 'Reputação', weight: ZVI_WEIGHTS.rep, description: 'Saldo entre menções positivas e negativas. Ainda não medido: depende da leitura automática das respostas (bloco V2).' },
  { id: 'est', label: 'Estabilidade', weight: ZVI_WEIGHTS.est, description: 'Quanto a menção se repete quando a mesma pergunta é feita mais de uma vez no mesmo motor (0 a 1). Só existe com perguntas repetidas em que a marca apareceu ao menos uma vez: ausência constante não conta como estabilidade.' },
];
export const METHOD_NOTES: string[] = [
  'ZVI = 100 × soma(peso × componente) ÷ soma dos pesos dos componentes medidos. Componente sem dado sai da conta e o peso dele é dividido proporcionalmente entre os demais; o índice aparece como "parcial".',
  'O intervalo do ZVI vem de 1.000 reamostragens das observações com semente fixa: a mesma base sempre gera o mesmo intervalo.',
  'Confiança: "baixa" com menos de 30 observações válidas, "média" de 30 a 99, "alta" com 100 ou mais. Um índice parcial não passa de "média".',
  'Observações feitas com a conta logada do titular (risco de personalização) não entram no índice; elas continuam visíveis no histórico, marcadas.',
  'Índice de fonte (ZSS, 0 a 100) = 40% cobertura + 25% posição + 20% diversidade + 10% recência (meia-vida de 30 dias) + 5% relevância.',
  'Ranking de concorrentes só é feito com pelo menos 8 observações válidas; abaixo disso a tela mostra "amostra insuficiente".',
  'Visibilidade não é resultado: o painel mostra o que as IAs dizem e, ao lado, o que chegou de fato (Search Console e Google Analytics), sem afirmar causa e efeito.',
];

export function topicsOf(observations: Observation[]): Set<string> {
  return new Set(observations.map((o) => o.topic).filter((t): t is string => !!t));
}
