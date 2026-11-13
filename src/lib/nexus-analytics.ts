import type {
  AreaGa4Metrics, AreaGscMetrics, AreaPageRow, AreaRow, AreaSortKey, ContentPerformance, Ga4AiReferrals, Ga4ChannelRow, Ga4DailyRow, Ga4PageRow,
  Ga4Summary, SortDirection, UnmatchedPages,
} from '@/types/nexus-analytics';

// ---------------------------------------------------------------------------
// Normalizadores: o servidor é a autoridade, mas a tela nunca deve quebrar por campo ausente ou fora do tipo.
// Campo ausente vira 0 / null / lista vazia. Texto vem como texto (React escapa; nada é inserido como HTML).
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const rec = (v: unknown): Rec => (isRec(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function normalizeGa4Summary(raw: unknown): Ga4Summary {
  const r = rec(raw);
  const t = rec(r.totals);
  const ai = rec(r.ai_referrals);
  const aiTotals = rec(ai.totals);
  const period = rec(r.period);
  const sessions = num(t.sessions);
  const engaged = num(t.engaged_sessions);
  const rate = numOrNull(t.engagement_rate) ?? (sessions > 0 ? engaged / sessions : null);
  const daily: Ga4DailyRow[] = arr(r.daily).map((d) => {
    const x = rec(d);
    return { day: str(x.day), sessions: num(x.sessions), engaged_sessions: num(x.engaged_sessions), page_views: num(x.page_views), users: num(x.users), key_events: num(x.key_events) };
  }).filter((d) => d.day);
  const top_pages: Ga4PageRow[] = arr(r.top_pages).map((p) => {
    const x = rec(p);
    return { page: str(x.page ?? x.url), sessions: num(x.sessions), engaged_sessions: num(x.engaged_sessions), page_views: num(x.page_views), key_events: num(x.key_events) };
  });
  const by_channel: Ga4ChannelRow[] = arr(r.by_channel).map((c) => {
    const x = rec(c);
    return { channel: str(x.channel), sessions: num(x.sessions), engaged_sessions: num(x.engaged_sessions), key_events: num(x.key_events) };
  });
  const ai_referrals: Ga4AiReferrals = {
    totals: { sessions: num(aiTotals.sessions), engaged_sessions: num(aiTotals.engaged_sessions), key_events: num(aiTotals.key_events) },
    by_source: arr(ai.by_source).map((s) => {
      const x = rec(s);
      return { source: str(x.source), sessions: num(x.sessions), engaged_sessions: num(x.engaged_sessions), key_events: num(x.key_events) };
    }),
  };
  return {
    period: { from: strOrNull(period.from), to: strOrNull(period.to) },
    totals: {
      sessions, engaged_sessions: engaged, page_views: num(t.page_views), users: num(t.users), engagement_rate: rate,
      avg_engagement_seconds: numOrNull(t.avg_engagement_seconds), key_events: num(t.key_events),
    },
    daily, top_pages, by_channel, ai_referrals, last_synced_at: strOrNull(r.last_synced_at),
  };
}

function gscMetrics(v: unknown): AreaGscMetrics {
  const x = rec(v);
  return { clicks: num(x.clicks), impressions: num(x.impressions), ctr: numOrNull(x.ctr), position: numOrNull(x.position) };
}
function ga4Metrics(v: unknown): AreaGa4Metrics {
  const x = rec(v);
  return { sessions: num(x.sessions), engaged_sessions: num(x.engaged_sessions), key_events: num(x.key_events), ai_sessions: num(x.ai_sessions) };
}
function unmatched(v: unknown): UnmatchedPages {
  if (Array.isArray(v)) {
    const items = v.map((i) => (isRec(i) ? str(i.page ?? i.url) : str(i))).filter(Boolean);
    return { count: items.length, items };
  }
  if (isRec(v)) {
    const items = arr(v.items ?? v.pages).map((i) => (isRec(i) ? str(i.page ?? i.url) : str(i))).filter(Boolean);
    return { count: numOrNull(v.count) ?? items.length, items };
  }
  return { count: num(v), items: [] };
}

export function normalizeContentPerformance(raw: unknown): ContentPerformance {
  const r = rec(raw);
  const areas: AreaRow[] = arr(r.areas).map((a) => {
    const x = rec(a);
    const top_pages: AreaPageRow[] = arr(x.top_pages).slice(0, 10).map((p) => {
      const y = rec(p);
      return { url: str(y.url ?? y.page), title: str(y.title), gsc: gscMetrics(y.gsc), ga4: ga4Metrics(y.ga4) };
    });
    return { area: str(x.area) || 'nao-classificado', articles: num(x.articles), gsc: gscMetrics(x.gsc), ga4: ga4Metrics(x.ga4), top_pages };
  });
  const u = rec(r.unmatched);
  const notes = Array.isArray(r.notes) ? r.notes.map(str).filter(Boolean) : typeof r.notes === 'string' && r.notes ? [r.notes] : [];
  return {
    areas,
    unmatched: { gsc_pages: unmatched(u.gsc_pages), ga4_pages: unmatched(u.ga4_pages) },
    notes,
    analysis_version: numOrNull(r.analysis_version),
  };
}

// ---------------------------------------------------------------------------
// Formatação e rótulos (pt-BR)
// ---------------------------------------------------------------------------

/** "3 min 20 s", "45 s", "—" sem dado. */
export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** Eventos-chave podem ser fracionários no GA4: até 1 casa decimal. */
export function formatKeyEvents(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—';
}

const CHANNEL_LABELS: Record<string, string> = {
  'organic search': 'Busca orgânica', direct: 'Direto', 'organic social': 'Rede social (orgânico)', 'paid search': 'Busca paga',
  referral: 'Indicação (outros sites)', email: 'E-mail', 'paid social': 'Rede social (pago)', display: 'Display', video: 'Vídeo',
  'organic video': 'Vídeo (orgânico)', 'organic shopping': 'Shopping (orgânico)', 'paid shopping': 'Shopping (pago)', affiliates: 'Afiliados',
  'cross-network': 'Várias redes', unassigned: 'Não atribuído', '(not set)': 'Não informado', audio: 'Áudio', sms: 'SMS',
};
export function channelLabel(channel: string): string {
  const key = channel.trim().toLowerCase();
  if (!key) return 'Não informado';
  return CHANNEL_LABELS[key] ?? channel;
}

const AREA_LABELS: Record<string, string> = {
  'nao-classificado': 'Não classificado', criminal: 'Criminal', consumidor: 'Consumidor', empresarial: 'Empresarial', trabalhista: 'Trabalhista',
  'cnh-transito': 'CNH e trânsito', transito: 'Trânsito', civil: 'Cível', familia: 'Família', previdenciario: 'Previdenciário',
  tributario: 'Tributário', imobiliario: 'Imobiliário',
};
/** Rótulo legível de uma área (slug do índice). Desconhecida: capitaliza o slug. */
export function areaLabel(area: string): string {
  const key = area.trim().toLowerCase();
  if (AREA_LABELS[key]) return AREA_LABELS[key];
  if (/[A-Z\s]/.test(area.trim())) return area.trim(); // texto livre da análise (ex.: "Marketing Digital"): mantém como veio
  const text = key.replace(/[-_]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Não classificado';
}

/** Versão que marca a classificação heurística por palavras-chave (docs/contrato, seção B). */
export const HEURISTIC_ANALYSIS_VERSION = 1000;
export const HEURISTIC_NOTICE = 'Classificação por palavras-chave, não revisão jurídica. Use como visão geral e confira os artigos antes de decidir algo importante.';
/** Sem `analysis_version` no retorno, o aviso aparece (opção restritiva); some só quando o servidor diz que a versão não é a heurística. */
export function isHeuristicClassification(perf: Pick<ContentPerformance, 'analysis_version'>): boolean {
  return perf.analysis_version === null || perf.analysis_version === HEURISTIC_ANALYSIS_VERSION;
}

// ---------------------------------------------------------------------------
// Ordenação da tabela "Desempenho por área"
// ---------------------------------------------------------------------------

function sortValue(a: AreaRow, key: AreaSortKey): number | string | null {
  switch (key) {
    case 'area': return areaLabel(a.area).toLocaleLowerCase('pt-BR');
    case 'articles': return a.articles;
    case 'clicks': return a.gsc.clicks;
    case 'impressions': return a.gsc.impressions;
    case 'position': return a.gsc.position;
    case 'sessions': return a.ga4.sessions;
    case 'engaged_sessions': return a.ga4.engaged_sessions;
    case 'key_events': return a.ga4.key_events;
    case 'ai_sessions': return a.ga4.ai_sessions;
  }
}

/** Ordena sem alterar a lista original. Valor ausente (posição sem dado) vai sempre para o fim. */
export function sortAreas(areas: AreaRow[], key: AreaSortKey, direction: SortDirection): AreaRow[] {
  const mul = direction === 'asc' ? 1 : -1;
  return [...areas].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'pt-BR') * mul;
    return ((x as number) - (y as number)) * mul;
  });
}

/** Posição menor é melhor: ordenar "melhor primeiro" é crescente. Os demais indicadores, decrescente. */
export function defaultDirection(key: AreaSortKey): SortDirection { return key === 'position' || key === 'area' ? 'asc' : 'desc'; }

export function sortDirectionLabel(direction: SortDirection): 'ascending' | 'descending' { return direction === 'asc' ? 'ascending' : 'descending'; }

/** Totais gerais da tabela (soma das áreas; posição não é somada). */
export function areaTotals(areas: AreaRow[]): { articles: number; clicks: number; impressions: number; sessions: number; engaged_sessions: number; key_events: number; ai_sessions: number } {
  return areas.reduce((t, a) => ({
    articles: t.articles + a.articles, clicks: t.clicks + a.gsc.clicks, impressions: t.impressions + a.gsc.impressions,
    sessions: t.sessions + a.ga4.sessions, engaged_sessions: t.engaged_sessions + a.ga4.engaged_sessions,
    key_events: t.key_events + a.ga4.key_events, ai_sessions: t.ai_sessions + a.ga4.ai_sessions,
  }), { articles: 0, clicks: 0, impressions: 0, sessions: 0, engaged_sessions: 0, key_events: 0, ai_sessions: 0 });
}

/** O ID da propriedade GA4 tem só dígitos, de 5 a 15 (contrato, seção B). Vazio = remover. */
export function validateGa4PropertyId(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return /^\d{5,15}$/.test(t) ? null : 'O ID da propriedade GA4 tem só números (de 5 a 15 dígitos). Ex.: 123456789.';
}
