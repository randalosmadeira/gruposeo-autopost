import { importCellText, isValidEditorialKeyword, initialArticleTitle } from '@/lib/keyword-import';
import type {
  NexusGap, NexusGapSelection, NexusObservatorySummary, NexusEngineCountryRow,
} from '@/types/nexus-observatory';

export const ENGINE_LABELS: Record<string, string> = {
  chatgpt_web: 'ChatGPT (produto)', chatgpt_api: 'ChatGPT (API)', gemini_web: 'Gemini (produto)',
  gemini_api: 'Gemini (API)', claude_web: 'Claude (produto)', claude_api: 'Claude (API)',
  perplexity_web: 'Perplexity (produto)', perplexity_api: 'Perplexity (API)', copilot_web: 'Copilot (produto)',
  google_aio: 'Google AI Overviews', google_serp: 'Google (busca)', bing_serp: 'Bing (busca)',
};

export const INTENT_LABELS: Record<string, string> = {
  informational: 'Informacional', discovery: 'Descoberta', transactional: 'Transacional',
  international: 'Internacional', branded: 'Marca',
};

export const SIGNAL_KIND_LABELS: Record<string, string> = {
  ai_bot_hit: 'Robô de IA', ai_referral: 'Visita vinda de IA',
  search_referral: 'Visita vinda de busca', human_pageview: 'Visita (geral)',
};

export function engineLabel(engine: string) { return ENGINE_LABELS[engine] ?? engine; }
export function countryLabel(country: string) { return country ? country.toUpperCase() : '—'; }

/** Taxa 0–1 em pt-BR. null/undefined/NaN = não medido ("—"), nunca "0%". */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  const pct = Math.round(rate * 1000) / 10;
  return `${Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace('.', ',')}%`;
}

export function formatCount(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR') : '—';
}

export interface ObservatoryKpi { id: string; label: string; value: string; footnote: string }

export function summaryToKpis(summary: NexusObservatorySummary | null | undefined): ObservatoryKpi[] {
  const t = summary?.totals;
  const s = summary?.signals;
  const ops = t?.operations ?? 0;
  const valid = t?.valid ?? 0;
  const obsNote = valid > 0 ? `observado em ${valid} ${valid === 1 ? 'operação' : 'operações'}` : 'sem dados';
  const hasSignals = !!s && (s.last_batch_at !== null || s.ai_referrals > 0 || s.ai_bot_hits > 0);
  return [
    {
      id: 'valid', label: 'Observações válidas', value: formatCount(valid),
      footnote: ops > 0 ? `de ${ops} ${ops === 1 ? 'operação' : 'operações'} no período` : 'sem dados',
    },
    { id: 'mention_rate', label: 'Taxa de menção', value: formatRate(t?.mention_rate), footnote: obsNote },
    { id: 'citation_rate', label: 'Taxa de citação', value: formatRate(t?.citation_rate), footnote: obsNote },
    {
      id: 'share_of_voice', label: 'Share of voice', value: formatRate(t?.share_of_voice),
      footnote: t && t.own_citations + t.competitor_mentions > 0
        ? `${t.own_citations} citações próprias e ${t.competitor_mentions} menções a concorrentes` : 'sem dados',
    },
    {
      id: 'ai_referrals', label: 'Visitas vindas de IA (30 d)', value: hasSignals ? formatCount(s?.ai_referrals) : '—',
      footnote: hasSignals ? 'sinais recebidos do site' : 'sem dados',
    },
    {
      id: 'ai_bot_hits', label: 'Acessos de robôs de IA (30 d)', value: hasSignals ? formatCount(s?.ai_bot_hits) : '—',
      footnote: hasSignals ? 'sinais recebidos do site' : 'sem dados',
    },
  ];
}

export interface MatrixCell { valid: number; mentioned: number; cited: number; mentionRate: number | null; citationRate: number | null }
export interface EngineCountryMatrix {
  countries: string[];
  rows: { engine: string; cells: Record<string, MatrixCell | null>; total: MatrixCell }[];
  /** false quando o backend só enviou totais por motor e por país (sem cruzamento). */
  crossAvailable: boolean;
  countryTotals: Record<string, MatrixCell>;
}

function cell(valid: number, mentioned: number, cited: number): MatrixCell {
  return {
    valid, mentioned, cited,
    mentionRate: valid > 0 ? mentioned / valid : null,
    citationRate: valid > 0 ? cited / valid : null,
  };
}

export function buildEngineCountryMatrix(summary: NexusObservatorySummary | null | undefined): EngineCountryMatrix {
  const byEngine = summary?.by_engine ?? [];
  const byCountry = summary?.by_country ?? [];
  const cross: NexusEngineCountryRow[] = summary?.by_engine_country ?? [];
  const countries = Array.from(new Set([...byCountry.map((c) => c.country), ...cross.map((c) => c.country)])).sort();
  const engines = Array.from(new Set([...byEngine.map((e) => e.engine), ...cross.map((c) => c.engine)]));
  const countryTotals: Record<string, MatrixCell> = {};
  byCountry.forEach((c) => { countryTotals[c.country] = cell(c.valid, c.mentioned, c.cited); });
  const rows = engines.map((engine) => {
    const e = byEngine.find((x) => x.engine === engine);
    const mine = cross.filter((c) => c.engine === engine);
    const cells: Record<string, MatrixCell | null> = {};
    countries.forEach((country) => {
      const x = mine.find((c) => c.country === country);
      cells[country] = x ? cell(x.valid, x.mentioned, x.cited) : null;
    });
    const total = e
      ? cell(e.valid, e.mentioned, e.cited)
      : cell(
        mine.reduce((a, c) => a + c.valid, 0),
        mine.reduce((a, c) => a + c.mentioned, 0),
        mine.reduce((a, c) => a + c.cited, 0),
      );
    return { engine, cells, total };
  });
  return { countries, rows, crossAvailable: cross.length > 0, countryTotals };
}

/** Classe de cor da célula por taxa de citação (não medido = neutro). Contraste AA: texto sempre escuro/claro conforme o tema. */
export function rateTone(rate: number | null): string {
  if (rate === null) return 'bg-muted text-muted-foreground';
  if (rate === 0) return 'bg-red-100 text-red-950 dark:bg-red-950/60 dark:text-red-100';
  if (rate < 0.34) return 'bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100';
  return 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100';
}

/** Identificador estável da lacuna, usado em ?nexusGaps=. */
export function gapKey(gap: Pick<NexusGap, 'topic' | 'intent' | 'query' | 'country'>): string {
  const raw = [gap.topic, gap.intent, gap.query, gap.country].map((v) => importCellText(v).toLowerCase()).join('|');
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return `g${h.toString(36)}`;
}

/**
 * Lacunas: usa as do backend quando existem; senão deriva de by_topic (tópicos com observações válidas e
 * nenhuma citação própria). A derivação não conhece a consulta exata: usa o tópico.
 */
export function deriveGaps(summary: NexusObservatorySummary | null | undefined, limit = 50): NexusGap[] {
  if (!summary) return [];
  const sortGaps = (gaps: NexusGap[]) =>
    [...gaps]
      .sort((a, b) => b.competitors.length - a.competitors.length || a.topic.localeCompare(b.topic, 'pt-BR'))
      .slice(0, limit);
  if (Array.isArray(summary.gaps)) return sortGaps(summary.gaps);
  const missing = (summary.by_engine ?? []).filter((e) => e.valid > 0 && e.cited === 0).map((e) => e.engine);
  const countries = (summary.by_country ?? []).map((c) => c.country);
  const country = countries.length === 1 ? countries[0] : '';
  return sortGaps(
    (summary.by_topic ?? [])
      .filter((t) => t.valid > 0 && t.cited === 0)
      .map((t) => ({
        topic: t.topic, intent: t.intent, query: t.topic, country, engines_missing: missing, competitors: t.competitors ?? [],
      })),
  );
}

/** Converte lacuna em pauta pelo mesmo critério de validação da importação de palavras-chave. */
export function gapToPauta(gap: NexusGap): { keyword: string; title: string; nexusGap: NexusGapSelection } | null {
  const topicKeyword = importCellText(String(gap.topic ?? '').replace(/[-_]+/g, ' '));
  const keyword = isValidEditorialKeyword(topicKeyword) ? topicKeyword : importCellText(gap.query);
  if (!isValidEditorialKeyword(keyword)) return null;
  return {
    keyword,
    title: initialArticleTitle(gap.query || keyword),
    nexusGap: { query: gap.query, country: gap.country, engines_missing: gap.engines_missing },
  };
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildSignalsSnippet(siteId: string, endpoint: string, appOrigin: string): string {
  const origin = appOrigin.replace(/\/+$/, '');
  return `<script src="${escapeAttr(origin)}/zica-signals.js" data-site="${escapeAttr(siteId)}" data-endpoint="${escapeAttr(endpoint)}" defer></script>`;
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function rangeForDays(days: number, today: Date = new Date()): { from: string; to: string } {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  return { from: isoDate(from), to: isoDate(today) };
}

/** Linhas "https://url | título opcional". URLs que não são http(s) contam como inválidas. */
export function parseCitationLines(text: string): { items: { url: string; title?: string }[]; invalid: number } {
  const items: { url: string; title?: string }[] = [];
  let invalid = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [url, ...rest] = line.split('|').map((p) => p.trim());
    if (!/^https?:\/\/[^\s]+$/i.test(url)) { invalid++; continue; }
    const title = rest.join(' | ').trim();
    items.push(title ? { url, title } : { url });
  }
  return { items, invalid };
}

/** Linhas "Nome | host opcional". */
export function parseCompetitorLines(text: string): { name: string; host?: string }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, host] = line.split('|').map((p) => p.trim());
    return host ? { name, host: host.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '') } : { name };
  }).filter((c) => c.name.length > 0);
}

/** "br:pt-BR, us:en-US:Miami" -> mercados. País ISO-2 minúsculo; linhas inválidas são descartadas. */
export function parseMarkets(text: string): { country: string; language: string; city?: string }[] {
  return text.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean).flatMap((part) => {
    const [country, language, ...city] = part.split(':').map((p) => p.trim());
    if (!/^[a-zA-Z]{2}$/.test(country ?? '') || !language) return [];
    const c = city.join(':').trim();
    return [{ country: country.toLowerCase(), language, ...(c ? { city: c } : {}) }];
  });
}

export function marketsToText(markets: { country: string; language: string; city?: string }[]): string {
  return markets.map((m) => [m.country, m.language, m.city].filter(Boolean).join(':')).join(', ');
}

/** Aplica motor/país às partes do resumo que permitem esse recorte sem recalcular no servidor. */
export function filterSummary(s: NexusObservatorySummary | undefined, engine: string, country: string): NexusObservatorySummary {
  const base = s ?? ({
    period: { from: '', to: '' },
    totals: { operations: 0, valid: 0, mention_rate: null, citation_rate: null, own_citations: 0, competitor_mentions: 0, share_of_voice: null },
    by_engine: [], by_country: [], by_topic: [], trend: [], top_competitors: [], own_urls: [],
    signals: { ai_bot_hits: 0, ai_referrals: 0, search_referrals: 0, by_agent: [], by_path: [], last_batch_at: null },
  } satisfies NexusObservatorySummary);
  if (engine === 'all' && country === 'all') return base;
  return {
    ...base,
    by_engine: engine === 'all' ? base.by_engine : base.by_engine.filter((e) => e.engine === engine),
    by_country: country === 'all' ? base.by_country : base.by_country.filter((c) => c.country === country),
    by_engine_country: base.by_engine_country?.filter((c) => (engine === 'all' || c.engine === engine) && (country === 'all' || c.country === country)),
    top_competitors: engine === 'all' ? base.top_competitors : base.top_competitors.filter((c) => c.engines.includes(engine)),
    own_urls: engine === 'all' ? base.own_urls : base.own_urls.filter((u) => u.engines.includes(engine)),
    gaps: base.gaps?.filter((g) => (country === 'all' || g.country === country) && (engine === 'all' || g.engines_missing.includes(engine))),
  };
}
