// Lógica pura da página Visibilidade (ZVI `zvi-1`): normalizadores tolerantes, rótulos, formatação e regras de confiança.
// Nenhuma rede aqui. O servidor é a autoridade: a tela nunca inventa número; campo ausente vira null / 0 / lista vazia
// e a interface mostra "n/d" ou "não medido".
import type { CSSProperties } from 'react';
import { formatCount, formatRate, rangeForDays } from '@/lib/nexus-observatory';
import type {
  ChangeItem, CompetitorInput, CompetitorKind, CompetitorStatus, CompetitorsData, Confidence, EngineRow, HistoryItem, KeywordRow, MethodComponent,
  MethodInfo, Methodology, OpportunityItem, OpportunityKind, OpportunityPriority, PreviousPeriod, QuestionHistory, QuestionRow, QuestionsData, RankingRow,
  RateStat, SavedCompetitor, SourceRow, SourceTarget, SourceType, SourcesData, SuggestedCompetitor, TrackedCompetitor, TrendPoint, VisibilityOverview, ZviScore,
} from '@/types/nexus-visibility';

export const METHOD_VERSION = 'zvi-1';
/** Abaixo disso a nota é "baixa confiança" (metodologia, seção 2.1). */
export const SMALL_SAMPLE = 30;
/** Mínimo para ranquear concorrentes (metodologia, seção 2.5). */
export const MIN_RANK_SAMPLE = 8;
export const PERIOD_DAYS = [7, 28, 90] as const;
export const DEFAULT_DAYS = 28;
export const QUESTIONS_PAGE_SIZE = 25;
export const COMPETITOR_NAME_MIN = 2;
export const COMPETITOR_NAME_MAX = 160;
export const COMPETITOR_MAX_DOMAINS = 10;

// ---------------------------------------------------------------------------
// Leitura tolerante
// ---------------------------------------------------------------------------
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const rec = (v: unknown): Rec => (isRec(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown): number => numOrNull(v) ?? 0;
const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const strList = (v: unknown): string[] => arr(v).map((x) => str(x).trim()).filter(Boolean);

/**
 * Taxas devem chegar como fração 0 a 1. Se algum valor do grupo passar de 1, o servidor mandou percentual 0 a 100:
 * divide o grupo inteiro por 100 (decisão defensiva, ver relatório do bloco). Valores fora de 0..1 depois disso são cortados.
 */
function rateScale(values: Array<number | null>): number {
  return values.some((v) => v !== null && v > 1.0001) ? 100 : 1;
}
const clamp01 = (v: number | null, scale: number): number | null => (v === null ? null : Math.min(1, Math.max(0, v / scale)));

function rateStat(raw: unknown): RateStat {
  const r = rec(raw);
  const value = numOrNull(r.value); const low = numOrNull(r.low); const high = numOrNull(r.high);
  const s = rateScale([value, low, high]);
  return { value: clamp01(value, s), low: clamp01(low, s), high: clamp01(high, s), n: Math.max(0, Math.round(num(r.n))) };
}
function simpleRate(raw: unknown): { value: number | null; n: number } {
  const r = rec(raw);
  const value = numOrNull(r.value);
  return { value: clamp01(value, rateScale([value])), n: Math.max(0, Math.round(num(r.n))) };
}

const CONFIDENCES: readonly Confidence[] = ['alta', 'media', 'baixa', 'sem_dados'];
function confidenceOf(v: unknown): Confidence {
  const s = str(v).trim().toLowerCase().replace('é', 'e');
  return (CONFIDENCES as readonly string[]).includes(s) ? (s as Confidence) : 'baixa';
}

function methodInfo(raw: unknown): MethodInfo {
  const m = rec(raw);
  const version = strOrNull(m.version) ?? METHOD_VERSION;
  return { version, label: strOrNull(m.label) ?? `Método ${version}` };
}

function previousOf(raw: unknown): PreviousPeriod | null {
  if (!isRec(raw)) return null;
  const pick = (v: unknown): number | null => (isRec(v) ? numOrNull(v.value) : numOrNull(v));
  const zvi = pick(raw.zvi); const vr = pick(raw.vr); const cr = pick(raw.cr);
  if (zvi === null && vr === null && cr === null) return null;
  const s = rateScale([vr, cr]);
  const n = numOrNull(raw.n);
  return { zvi: zvi === null ? null : Math.min(100, Math.max(0, zvi)), vr: clamp01(vr, s), cr: clamp01(cr, s), n: n === null ? null : Math.max(0, Math.round(n)) };
}

export function normalizeOverview(raw: unknown): VisibilityOverview {
  const r = rec(raw);
  const z = rec(r.zvi);
  const ind = rec(r.indicators);
  const zviValue = numOrNull(z.value);
  const zvi: ZviScore = {
    value: zviValue === null ? null : Math.min(100, Math.max(0, zviValue)),
    low: numOrNull(z.low) === null ? null : Math.min(100, Math.max(0, numOrNull(z.low) as number)),
    high: numOrNull(z.high) === null ? null : Math.min(100, Math.max(0, numOrNull(z.high) as number)),
    partial: z.partial === undefined ? true : z.partial === true, // sem informação, assume o caso restritivo
    missing: strList(z.missing),
    confidence: confidenceOf(z.confidence),
  };
  const byEngine: EngineRow[] = arr(r.by_engine).map((e) => {
    const x = rec(e);
    const vr = numOrNull(x.vr); const cr = numOrNull(x.cr);
    const s = rateScale([vr, cr]);
    const engine = str(x.engine).trim();
    return { engine, label: strOrNull(x.label) ?? engineLabel(engine), vr: clamp01(vr, s), cr: clamp01(cr, s), n: Math.max(0, Math.round(num(x.n))) };
  }).filter((e) => e.engine).sort((a, b) => b.n - a.n);
  const trend: TrendPoint[] = arr(r.trend).map((t) => {
    const x = rec(t);
    const vr = numOrNull(x.vr); const cr = numOrNull(x.cr);
    const s = rateScale([vr, cr]);
    return { day: str(x.day).slice(0, 10), vr: clamp01(vr, s), cr: clamp01(cr, s), n: Math.max(0, Math.round(num(x.n))) };
  }).filter((t) => t.day).sort((a, b) => a.day.localeCompare(b.day));
  const changes: ChangeItem[] = arr(r.changes).map((c) => {
    const x = rec(c);
    return { kind: str(x.kind).trim() || 'info', text: str(x.text).trim() };
  }).filter((c) => c.text);
  const res = rec(r.result);
  const ga4 = isRec(res.ga4) ? { sessions: num(res.ga4.sessions), ai_sessions: num(res.ga4.ai_sessions), key_events: num(res.ga4.key_events) } : null;
  const gsc = isRec(res.gsc) ? { clicks: num(res.gsc.clicks), impressions: num(res.gsc.impressions) } : null;
  const period = rec(r.period);
  const viewer = rec(r.viewer);
  const vrStat = rateStat(ind.vr);
  const nObs = Math.max(0, Math.round(num(r.n_observations) || vrStat.n));
  return {
    method: methodInfo(r.method),
    period: { from: strOrNull(period.from), to: strOrNull(period.to) },
    n_observations: nObs,
    zvi,
    indicators: { vr: vrStat, cr: simpleRate(ind.cr), sov: simpleRate(ind.sov), est: simpleRate(ind.est), pm: null, rep: null },
    previous: previousOf(r.previous),
    by_engine: byEngine,
    trend,
    changes,
    result: { ga4, gsc },
    truncated: r.truncated === true,
    generated_at: strOrNull(r.generated_at),
    viewer_can_manage: typeof viewer.can_manage_technical === 'boolean' ? viewer.can_manage_technical : null,
  };
}

const SOURCE_TYPES: readonly SourceType[] = ['orgao_oficial', 'portal_agregador', 'midia', 'escritorio', 'diretorio', 'rede_social', 'academico', 'outro'];
function sourceType(v: unknown): SourceType { const s = str(v).trim(); return (SOURCE_TYPES as readonly string[]).includes(s) ? (s as SourceType) : 'outro'; }
const score100 = (v: unknown): number | null => { const n = numOrNull(v); return n === null ? null : Math.min(100, Math.max(0, n)); };
const frac = (v: unknown): number | null => { const n = numOrNull(v); return n === null ? null : Math.min(1, Math.max(0, n > 1.0001 ? n / 100 : n)); };

export function normalizeSources(raw: unknown): SourcesData {
  const r = rec(raw);
  const sources: SourceRow[] = arr(r.sources).map((s) => {
    const x = rec(s);
    return {
      host: str(x.host).trim().toLowerCase(), type: sourceType(x.type), zss: score100(x.zss), coverage: frac(x.coverage), position: frac(x.position),
      diversity: frac(x.diversity), recency: frac(x.recency), relevance: frac(x.relevance), citations: Math.max(0, Math.round(num(x.citations))),
      queries: Math.max(0, Math.round(num(x.queries))), engines: strList(x.engines), is_own: x.is_own === true, last_seen: strOrNull(x.last_seen),
    };
  }).filter((s) => s.host).sort((a, b) => (b.zss ?? -1) - (a.zss ?? -1));
  const targets: SourceTarget[] = arr(r.targets).map((t) => {
    const x = rec(t);
    return { host: str(x.host).trim().toLowerCase(), type: sourceType(x.type), zss: score100(x.zss), why: str(x.why).trim() };
  }).filter((t) => t.host);
  return { method: methodInfo(r.method), sources, targets, truncated: r.truncated === true, generated_at: strOrNull(r.generated_at) };
}

const KINDS: readonly CompetitorKind[] = ['escritorio', 'advogado_individual', 'portal', 'outro'];
const STATUSES: readonly CompetitorStatus[] = ['suggested', 'tracked', 'ignored'];
const kindOf = (v: unknown): CompetitorKind => (KINDS as readonly string[]).includes(str(v)) ? (str(v) as CompetitorKind) : 'outro';
const statusOf = (v: unknown): CompetitorStatus => (STATUSES as readonly string[]).includes(str(v)) ? (str(v) as CompetitorStatus) : 'suggested';

export function normalizeSavedCompetitor(raw: unknown): SavedCompetitor | null {
  const c = rec(isRec(raw) && isRec(raw.competitor) ? raw.competitor : raw);
  const id = str(c.id).trim(); const name = str(c.name).trim();
  if (!id || !name) return null;
  return { id, name, domains: strList(c.domains), kind: kindOf(c.kind), status: statusOf(c.status) };
}

export function normalizeCompetitors(raw: unknown): CompetitorsData {
  const r = rec(raw);
  const tracked: TrackedCompetitor[] = arr(r.tracked).map((t) => {
    const x = rec(t);
    return {
      id: str(x.id).trim(), name: str(x.name).trim(), domains: strList(x.domains), kind: kindOf(x.kind), status: x.status === undefined ? 'tracked' : statusOf(x.status),
      vr: frac(x.vr), sov: frac(x.sov), mentions: Math.max(0, Math.round(num(x.mentions))), n: Math.max(0, Math.round(num(x.n))),
      insufficient_sample: x.insufficient_sample === true,
    };
  }).filter((t) => t.id && t.name);
  const suggested: SuggestedCompetitor[] = arr(r.suggested).map((s) => {
    const x = rec(s);
    return { name: str(x.name).trim(), domain: str(x.domain).trim().toLowerCase(), mentions: Math.max(0, Math.round(num(x.mentions))), engines: strList(x.engines), reason: str(x.reason).trim() };
  }).filter((s) => s.name);
  const own = rec(r.own);
  const ranking: RankingRow[] = arr(r.ranking).map((k) => {
    const x = rec(k);
    return {
      rank: numOrNull(x.rank), name: str(x.name).trim(), is_own: x.is_own === true, vr: frac(x.vr), sov: frac(x.sov),
      n: Math.max(0, Math.round(num(x.n))), insufficient_sample: x.insufficient_sample === true,
    };
  }).filter((k) => k.name);
  return {
    method: methodInfo(r.method), tracked, suggested,
    own: { vr: frac(own.vr), sov: frac(own.sov), n: Math.max(0, Math.round(num(own.n))) },
    ranking, generated_at: strOrNull(r.generated_at),
  };
}

export function normalizeQuestions(raw: unknown): QuestionsData {
  const r = rec(raw);
  const questions: QuestionRow[] = arr(r.questions).map((q) => {
    const x = rec(q);
    return {
      query: str(x.query).trim(), topic: strOrNull(x.topic), intent: strOrNull(x.intent), observations: Math.max(0, Math.round(num(x.observations))),
      vr: frac(x.vr), cr: frac(x.cr), last_observed_at: strOrNull(x.last_observed_at), engines: strList(x.engines),
    };
  }).filter((q) => q.query);
  return { total: Math.max(questions.length, Math.round(num(r.total))), questions, generated_at: strOrNull(r.generated_at) };
}

export function normalizeHistory(raw: unknown): QuestionHistory {
  const r = rec(raw);
  const items: HistoryItem[] = arr(r.items).map((i) => {
    const x = rec(i);
    return {
      observed_at: strOrNull(x.observed_at), engine: str(x.engine).trim(), country: strOrNull(x.country), mentioned: x.mentioned === true ? true : x.mentioned === false ? false : null, cited: x.cited === true,
      position: numOrNull(x.position), brands: strList(x.brands),
      sources: arr(x.sources).map((s) => { const y = rec(s); return { host: str(y.host).trim(), url: str(y.url).trim() }; }).filter((s) => s.host || s.url),
      response_excerpt: strOrNull(x.response_excerpt),
    };
  }).sort((a, b) => (b.observed_at ?? '').localeCompare(a.observed_at ?? ''));
  return { query: str(r.query).trim(), items };
}

export function normalizeKeywords(raw: unknown): KeywordRow[] {
  return arr(rec(raw).keywords).map((k) => {
    const x = rec(k);
    return { term: str(x.term).trim(), prompts: Math.max(0, Math.round(num(x.prompts))), observations: Math.max(0, Math.round(num(x.observations))), vr: frac(x.vr) };
  }).filter((k) => k.term);
}

const OPP_KINDS: readonly OpportunityKind[] = ['pergunta_sem_marca', 'fonte_alvo', 'concorrente_a_frente'];
const PRIORITIES: readonly OpportunityPriority[] = ['alta', 'media', 'baixa'];
const EVIDENCE_LABELS: Record<string, string> = {
  query: 'Pergunta', host: 'Fonte', competitor: 'Concorrente', competitor_name: 'Concorrente', engines: 'IAs', engine: 'IA', observations: 'Observações',
  n: 'Amostra', zss: 'Nota da fonte', citations: 'Citações', queries: 'Perguntas', mentions: 'Menções', vr: 'Visibilidade', sov: 'Participação', cr: 'Citação',
  topic: 'Tema', own_vr: 'Sua visibilidade', competitor_vr: 'Visibilidade do concorrente', last_seen: 'Última vez',
};
const RATE_KEYS = new Set(['vr', 'sov', 'cr', 'own_vr', 'competitor_vr']);
function evidenceValue(key: string, v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return RATE_KEYS.has(key) && v <= 1 ? formatRate(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 160);
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (Array.isArray(v)) {
    const items = v.map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : isRec(x) ? str(x.name ?? x.host ?? x.query ?? '') : '')).filter(Boolean);
    return items.length ? items.slice(0, 6).join(', ').slice(0, 160) : null;
  }
  return null;
}
export function normalizeOpportunities(raw: unknown): OpportunityItem[] {
  return arr(rec(raw).items).map((o) => {
    const x = rec(o);
    const evidence = Object.entries(rec(x.evidence)).map(([k, v]) => {
      const value = evidenceValue(k, v);
      return value === null ? null : { label: EVIDENCE_LABELS[k] ?? k.replace(/_/g, ' '), value };
    }).filter((e): e is { label: string; value: string } => e !== null).slice(0, 6);
    return {
      kind: (OPP_KINDS as readonly string[]).includes(str(x.kind)) ? (str(x.kind) as OpportunityKind) : 'pergunta_sem_marca',
      title: str(x.title).trim(), detail: str(x.detail).trim(),
      priority: (PRIORITIES as readonly string[]).includes(str(x.priority)) ? (str(x.priority) as OpportunityPriority) : 'baixa',
      evidence,
    };
  }).filter((o) => o.title).sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
}

// ---------------------------------------------------------------------------
// Metodologia (o texto do servidor vale; sem ele, mostra o padrão do método `zvi-1` e avisa)
// ---------------------------------------------------------------------------
export const DEFAULT_METHOD_COMPONENTS: readonly MethodComponent[] = [
  { id: 'vr', label: 'Visibilidade (VR)', weight: 0.35, description: 'Em quantas respostas das IAs a sua marca é mencionada, dividido pelo total de respostas válidas.' },
  { id: 'cr', label: 'Citação (CR)', weight: 0.25, description: 'Em quantas respostas as IAs usam um endereço do seu site como fonte.' },
  { id: 'sov', label: 'Participação (SoV)', weight: 0.15, description: 'Quantas menções são suas, entre todas as marcas acompanhadas (a sua e os concorrentes cadastrados).' },
  { id: 'pm', label: 'Posição de menção', weight: 0.10, description: 'Em que ordem a sua marca aparece na resposta (1 = primeira). Precisa da leitura automática de cada resposta.' },
  { id: 'rep', label: 'Reputação', weight: 0.10, description: 'Proporção de menções positivas contra negativas. Precisa da leitura automática de cada resposta.' },
  { id: 'est', label: 'Estabilidade', weight: 0.05, description: 'Se a IA responde de forma consistente quando a mesma pergunta se repete.' },
];
export const DEFAULT_METHOD_NOTES: readonly string[] = [
  'Cada nota mostra o número de observações (n), o intervalo de confiança e a versão do método.',
  'Quando falta um componente, o peso dele é redistribuído entre os demais e o índice aparece como “parcial”.',
  'Com menos de 30 observações a nota é de baixa confiança: serve como pista, não como conclusão.',
  'Visibilidade não é resultado: o que as IAs dizem é mostrado ao lado do que realmente chegou (visitas e cliques), sem afirmar que um causou o outro.',
];

export function normalizeMethodology(raw: unknown): Methodology {
  const r = rec(raw);
  const components: MethodComponent[] = arr(r.components).map((c) => {
    const x = rec(c);
    const w = numOrNull(x.weight);
    return { id: str(x.id).trim(), label: str(x.label).trim(), weight: w === null ? 0 : Math.min(1, Math.max(0, w > 1 ? w / 100 : w)), description: str(x.description).trim() };
  }).filter((c) => c.id && c.label);
  if (components.length === 0) {
    return { version: METHOD_VERSION, components: [...DEFAULT_METHOD_COMPONENTS], notes: [...DEFAULT_METHOD_NOTES], fromServer: false };
  }
  const notes = strList(r.notes);
  return { version: strOrNull(r.version) ?? METHOD_VERSION, components, notes: notes.length ? notes : [...DEFAULT_METHOD_NOTES], fromServer: true };
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------
const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT', openai: 'ChatGPT', gpt: 'ChatGPT', gemini: 'Gemini', google_gemini: 'Gemini', claude: 'Claude', anthropic: 'Claude', perplexity: 'Perplexity',
  google_aio: 'Google (visão geral por IA)', aio: 'Google (visão geral por IA)', google_ai_overview: 'Google (visão geral por IA)', google: 'Google',
  copilot: 'Copilot', bing: 'Bing', bing_copilot: 'Copilot', brave: 'Brave', serper: 'Google (busca)', serpapi: 'Google (busca)', duckduckgo: 'DuckDuckGo',
  grok: 'Grok', meta_ai: 'Meta AI', deepseek: 'DeepSeek', manual: 'Observação manual',
};
export function engineLabel(engine: string): string {
  const key = engine.trim().toLowerCase();
  if (ENGINE_LABELS[key]) return ENGINE_LABELS[key];
  const clean = engine.trim().replace(/[_-]+/g, ' ');
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Não informado';
}

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  orgao_oficial: 'Órgão oficial', portal_agregador: 'Portal de conteúdo', midia: 'Mídia', escritorio: 'Escritório', diretorio: 'Diretório',
  rede_social: 'Rede social', academico: 'Acadêmico', outro: 'Outro',
};
export function sourceTypeLabel(t: SourceType): string { return SOURCE_TYPE_LABELS[t] ?? 'Outro'; }
export const SOURCE_TYPE_ORDER: readonly SourceType[] = SOURCE_TYPES;

const COMPETITOR_KIND_LABELS: Record<CompetitorKind, string> = { escritorio: 'Escritório', advogado_individual: 'Advogado(a)', portal: 'Portal', outro: 'Outro' };
export function competitorKindLabel(k: CompetitorKind): string { return COMPETITOR_KIND_LABELS[k] ?? 'Outro'; }
export const COMPETITOR_KINDS: readonly CompetitorKind[] = KINDS;

const OPP_LABELS: Record<OpportunityKind, string> = {
  pergunta_sem_marca: 'Pergunta em que a marca não aparece', fonte_alvo: 'Fonte para ganhar presença', concorrente_a_frente: 'Concorrente à frente',
};
export function opportunityKindLabel(k: OpportunityKind): string { return OPP_LABELS[k] ?? 'Oportunidade'; }
export function priorityLabel(p: OpportunityPriority): string { return p === 'alta' ? 'Prioridade alta' : p === 'media' ? 'Prioridade média' : 'Prioridade baixa'; }

const INTENT_LABELS: Record<string, string> = {
  informational: 'Informativa', informacional: 'Informativa', commercial: 'Comparação', comercial: 'Comparação', transactional: 'Contratação', transacional: 'Contratação',
  navigational: 'Busca pela marca', navegacional: 'Busca pela marca', local: 'Local', urgent: 'Urgência', urgencia: 'Urgência',
};
export function intentLabel(intent: string | null): string {
  if (!intent) return '—';
  const key = intent.trim().toLowerCase();
  return INTENT_LABELS[key] ?? (intent.charAt(0).toUpperCase() + intent.slice(1));
}

const MISSING_LABELS: Record<string, string> = { pm: 'Posição de menção', rep: 'Reputação', sov: 'Participação', est: 'Estabilidade', cr: 'Citação', vr: 'Visibilidade' };
export function missingLabel(id: string): string { return MISSING_LABELS[id.trim().toLowerCase()] ?? id; }
export const NOT_MEASURED_REASON = 'Precisa da leitura automática de cada resposta das IAs, que ainda não está ativada.';

// ---------------------------------------------------------------------------
// Confiança
// ---------------------------------------------------------------------------
const CONF_RANK: Record<Confidence, number> = { alta: 3, media: 2, baixa: 1, sem_dados: 0 };

/** Nunca mais otimista que o servidor, nem que a regra local (n=0 sem dados; n < 30 baixa). */
export function effectiveConfidence(server: Confidence, n: number): Confidence {
  const local: Confidence = n <= 0 ? 'sem_dados' : n < SMALL_SAMPLE ? 'baixa' : 'alta';
  return CONF_RANK[server] <= CONF_RANK[local] ? server : local;
}
export function confidenceLabel(c: Confidence): string {
  return c === 'alta' ? 'Confiança alta' : c === 'media' ? 'Confiança média' : c === 'baixa' ? 'Baixa confiança' : 'Sem dados';
}
export function confidenceHint(c: Confidence, n: number): string {
  if (c === 'sem_dados') return 'Ainda não há observações no período.';
  if (c === 'baixa') return `Amostra pequena (${formatCount(n)} ${n === 1 ? 'observação' : 'observações'}): use como pista, não como conclusão.`;
  if (c === 'media') return `${formatCount(n)} observações: boa pista, ainda com margem de erro.`;
  return `${formatCount(n)} observações: amostra boa para acompanhar.`;
}

/** Frase curta (sem repetir o n, que já aparece na linha de amostra). */
export function confidenceNote(c: Confidence): string {
  return c === 'sem_dados' ? 'Ainda não há observações no período.'
    : c === 'baixa' ? 'Amostra pequena: use como pista, não como conclusão.'
      : c === 'media' ? 'Boa pista, ainda com margem de erro.' : 'Amostra boa para acompanhar.';
}

/** Marcas do eixo do gráfico em %: no máximo 5 faixas com passo redondo (2, 5, 10, 20, 25 ou 50) e teto de 100. */
export function chartAxis(maxPct: number): { max: number; ticks: number[] } {
  const top = Number.isFinite(maxPct) ? Math.min(100, Math.max(0, maxPct)) : 0;
  const step = [2, 5, 10, 20, 25, 50].find((s) => Math.ceil(top / s) <= 5) ?? 50;
  const bands = Math.max(2, Math.ceil(top / step));
  return { max: bands * step, ticks: Array.from({ length: bands + 1 }, (_, i) => i * step) };
}

// ---------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------
export function formatZvi(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : 'n/d';
}
export function formatPercent(v: number | null | undefined): string { return v === null || v === undefined ? 'n/d' : formatRate(v); }
/** Intervalo de 95%: "entre 38 e 52" (ZVI) ou "entre 12% e 31%" (taxas). */
export function formatZviInterval(low: number | null, high: number | null): string {
  return low === null || high === null ? 'intervalo n/d' : `entre ${Math.round(low)} e ${Math.round(high)}`;
}
export function formatRateInterval(low: number | null, high: number | null): string {
  return low === null || high === null ? 'intervalo n/d' : `entre ${formatRate(low)} e ${formatRate(high)}`;
}
export function formatSample(n: number): string { return `${formatCount(n)} ${n === 1 ? 'observação' : 'observações'}`; }
export function formatScore(v: number | null | undefined): string { return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : 'n/d'; }

const DM = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const DMY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const DAY_HM = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function parseDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export function formatDay(day: string | null | undefined): string {
  const d = day ? parseDay(day) : null;
  return d ? DM.format(d).replace('.', '') : '—';
}
export function formatDayLong(day: string | null | undefined): string {
  const d = day ? parseDay(day) : null;
  return d ? DMY.format(d).replace(/\./g, '') : '—';
}
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DAY_HM.format(d).replace('.', '');
}
export function formatPeriod(p: { from: string | null; to: string | null }): string {
  return p.from && p.to ? `${formatDayLong(p.from)} a ${formatDayLong(p.to)}` : '';
}

export interface Delta { direction: 'up' | 'down' | 'flat'; label: string; spoken: string }
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Variação contra o período anterior. `unit` 'pts' = pontos do ZVI (0 a 100); 'pp' = pontos percentuais de uma taxa (fração 0 a 1). */
export function computeDelta(current: number | null | undefined, previous: number | null | undefined, unit: 'pts' | 'pp'): Delta | null {
  if (typeof current !== 'number' || typeof previous !== 'number' || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const diff = unit === 'pp' ? (current - previous) * 100 : current - previous;
  const abs = Math.abs(diff);
  const suffix = unit === 'pp' ? 'p.p.' : 'pts';
  if (abs < 0.5) return { direction: 'flat', label: 'estável', spoken: 'Estável em relação ao período anterior.' };
  const up = diff > 0;
  const shown = nf1.format(abs);
  return {
    direction: up ? 'up' : 'down',
    label: `${up ? '+' : '−'}${shown} ${suffix}`,
    spoken: `${up ? 'Subiu' : 'Caiu'} ${shown} ${unit === 'pp' ? 'pontos percentuais' : 'pontos'} em relação ao período anterior.`,
  };
}

// ---------------------------------------------------------------------------
// Períodos e filtros
// ---------------------------------------------------------------------------
export function parseDays(v: string | null | undefined): number {
  const n = Number(v);
  return (PERIOD_DAYS as readonly number[]).includes(n) ? n : DEFAULT_DAYS;
}
export function periodRange(days: number, today: Date = new Date()): { from: string; to: string } { return rangeForDays(days, today); }

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------
/** Pontos prontos para o gráfico (em %). Dia sem observação vira lacuna (null), nunca zero. */
export function trendChartData(trend: TrendPoint[]): Array<{ day: string; label: string; vr: number | null; cr: number | null; n: number }> {
  return trend.map((t) => ({
    day: t.day, label: formatDay(t.day), n: t.n,
    vr: t.n > 0 && t.vr !== null ? Math.round(t.vr * 1000) / 10 : null,
    cr: t.n > 0 && t.cr !== null ? Math.round(t.cr * 1000) / 10 : null,
  }));
}
export function sparkValues(trend: TrendPoint[], key: 'vr' | 'cr'): Array<number | null> {
  return trend.map((t) => (t.n > 0 && t[key] !== null ? (t[key] as number) : null));
}
export function hasTrendData(trend: TrendPoint[]): boolean { return trend.some((t) => t.n > 0 && (t.vr !== null || t.cr !== null)); }

// ---------------------------------------------------------------------------
// Links e texto de fontes (segurança: só http/https)
// ---------------------------------------------------------------------------
export function safeHttpUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Concorrentes: validação de formulário (o servidor revalida)
// ---------------------------------------------------------------------------
/** "https://www.Exemplo.com.br/pagina" -> "exemplo.com.br". `null` = não é um domínio. */
export function normalizeDomain(input: string): string | null {
  let t = input.trim().toLowerCase();
  if (!t) return null;
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '');
  t = t.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  return /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(t) ? t : null;
}
export function parseDomains(text: string): { domains: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const domains: string[] = []; const invalid: string[] = [];
  for (const p of parts) {
    const d = normalizeDomain(p);
    if (!d) invalid.push(p);
    else if (!domains.includes(d)) domains.push(d);
  }
  return { domains, invalid };
}
export interface CompetitorFormErrors { name?: string; domains?: string }
export function validateCompetitorForm(input: { name: string; domainsText: string }): { errors: CompetitorFormErrors; domains: string[]; ok: boolean } {
  const errors: CompetitorFormErrors = {};
  const name = input.name.trim();
  if (name.length < COMPETITOR_NAME_MIN) errors.name = `Informe o nome (mínimo ${COMPETITOR_NAME_MIN} letras).`;
  else if (name.length > COMPETITOR_NAME_MAX) errors.name = `O nome passa de ${COMPETITOR_NAME_MAX} caracteres.`;
  const { domains, invalid } = parseDomains(input.domainsText);
  if (invalid.length) errors.domains = `Não entendi: ${invalid.slice(0, 3).join(', ')}. Use só o endereço, como exemplo.com.br.`;
  else if (domains.length > COMPETITOR_MAX_DOMAINS) errors.domains = `No máximo ${COMPETITOR_MAX_DOMAINS} endereços.`;
  return { errors, domains, ok: Object.keys(errors).length === 0 };
}
export function competitorInputFromSuggestion(s: SuggestedCompetitor): CompetitorInput {
  const d = s.domain ? normalizeDomain(s.domain) : null;
  return { name: s.name.slice(0, COMPETITOR_NAME_MAX), domains: d ? [d] : [], kind: 'escritorio', status: 'tracked' };
}
export function suggestionRequestMessage(s: SuggestedCompetitor): string {
  return `Quero acompanhar “${s.name}”${s.domain ? ` (${s.domain})` : ''} como concorrente na página de Visibilidade.`;
}

// ---------------------------------------------------------------------------
// Erros em linguagem simples
// ---------------------------------------------------------------------------
const ERRORS: Record<string, string> = {
  manager_required: 'Só o gestor pode fazer essa alteração. Use o botão “Solicitar” e ele cuida disso.',
  forbidden: 'Você não tem acesso aos dados deste projeto.',
  '403': 'Você não tem acesso aos dados deste projeto.',
  not_found: 'Não encontramos este item. Atualize a página e tente de novo.',
  '404': 'Não encontramos este projeto ou item. Atualize a página e tente de novo.',
  project_not_found: 'Não encontramos este projeto.',
  '409': 'Já existe um concorrente com esse nome neste projeto.',
  conflict: 'Já existe um concorrente com esse nome neste projeto.',
  duplicate_competitor: 'Já existe um concorrente com esse nome neste projeto.',
  '429': 'Muitas consultas seguidas. Espere um instante e tente de novo.',
  rate_limited: 'Muitas consultas seguidas. Espere um instante e tente de novo.',
  '400': 'Confira os dados informados e tente de novo.',
  invalid_input: 'Confira os dados informados e tente de novo.',
  '401': 'Sua sessão expirou. Entre de novo.',
  unauthorized: 'Sua sessão expirou. Entre de novo.',
};
export function visibilityErrorMessage(error: unknown): string {
  const raw = (error instanceof Error ? error.message : typeof error === 'string' ? error : '').trim();
  if (!raw) return 'Não foi possível carregar agora. Tente de novo em instantes.';
  if (raw in ERRORS) return ERRORS[raw];
  if (/^[a-z0-9_]+$/.test(raw) || /^\d{3}$/.test(raw)) return /^5\d\d$/.test(raw) ? 'O servidor não respondeu agora. Tente de novo em instantes.' : 'Não foi possível concluir. Tente de novo em instantes.';
  return raw;
}
export function isManagerRequiredError(error: unknown): boolean { return error instanceof Error && error.message === 'manager_required'; }

/** Escalonamento da animação de entrada (`.zv-rise`). */
export function rise(i: number): CSSProperties { return { '--i': i } as CSSProperties; }
