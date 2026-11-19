/**
 * Velocidade e Core Web Vitals (módulo F1): leitura dos resultados oficiais do Google.
 *
 * Duas fontes, SEMPRE separadas e rotuladas (nunca misturadas):
 *  - LABORATÓRIO: Lighthouse via PageSpeed Insights API. Teste simulado agora, de um servidor do Google. Nota 0 a 100 e métricas em milissegundos.
 *  - CAMPO: Chrome UX Report (CrUX). Dados reais de usuários do Chrome, janela de 28 dias, percentil 75. Só existe para páginas/sites com tráfego suficiente.
 *
 * Função pura (sem rede): recebe o JSON das APIs e devolve números normalizados. Se um dado não veio, o campo é null (nada é estimado ou preenchido).
 * Limites de "bom/melhorar/ruim" são os publicados pelo Google (web.dev/vitals) e pelo Lighthouse.
 */

export type Strategy = 'mobile' | 'desktop';
export type Rating = 'bom' | 'melhorar' | 'ruim';
export type MetricKey = 'lcp' | 'cls' | 'inp' | 'fcp' | 'ttfb' | 'tbt' | 'speedIndex';

/** [limite do "bom", limite do "ruim"]: até o primeiro é bom; acima do segundo é ruim. LCP/FCP/TTFB/INP/TBT/Speed Index em ms; CLS sem unidade. */
export const THRESHOLDS: Record<MetricKey, [number, number]> = {
  lcp: [2500, 4000], cls: [0.1, 0.25], inp: [200, 500], fcp: [1800, 3000], ttfb: [800, 1800], tbt: [200, 600], speedIndex: [3400, 5800],
};
export const METRIC_LABEL: Record<MetricKey, string> = {
  lcp: 'LCP: maior elemento visível', cls: 'CLS: estabilidade visual', inp: 'INP: resposta ao clique', fcp: 'FCP: primeiro conteúdo', ttfb: 'TTFB: resposta do servidor', tbt: 'TBT: bloqueio da página', speedIndex: 'Speed Index: velocidade percebida',
};

export function rate(metric: MetricKey, value: number | null | undefined): Rating | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const [good, poor] = THRESHOLDS[metric];
  return value <= good ? 'bom' : value > poor ? 'ruim' : 'melhorar';
}
/** Nota do Lighthouse: 90+ boa, 50 a 89 precisa melhorar, abaixo de 50 ruim. */
export const rateScore = (score: number | null | undefined): Rating | null => (typeof score !== 'number' ? null : score >= 90 ? 'bom' : score >= 50 ? 'melhorar' : 'ruim');

export interface LabMetrics {
  score: number | null;
  lcp: number | null; cls: number | null; tbt: number | null; fcp: number | null; ttfb: number | null; speedIndex: number | null;
  lighthouseVersion: string | null; fetchTime: string | null; finalUrl: string | null;
}
export interface FieldMetrics {
  scope: 'url' | 'origin';
  lcp: number | null; cls: number | null; inp: number | null; fcp: number | null; ttfb: number | null;
  period: { first: string; last: string } | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const round = (v: number | null, digits = 0): number | null => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** Resposta do PageSpeed Insights -> métricas de laboratório. null se a resposta não tiver o relatório do Lighthouse. */
export function parsePsi(json: unknown): LabMetrics | null {
  const lh = rec(rec(json).lighthouseResult);
  const audits = rec(lh.audits);
  if (!Object.keys(audits).length) return null;
  const val = (id: string) => num(rec(audits[id]).numericValue);
  const score = num(rec(rec(lh.categories).performance).score);
  return {
    score: score === null ? null : Math.round(score * 100),
    lcp: round(val('largest-contentful-paint')), cls: round(val('cumulative-layout-shift'), 3), tbt: round(val('total-blocking-time')),
    fcp: round(val('first-contentful-paint')), ttfb: round(val('server-response-time')), speedIndex: round(val('speed-index')),
    lighthouseVersion: typeof lh.lighthouseVersion === 'string' ? lh.lighthouseVersion.slice(0, 20) : null,
    fetchTime: typeof lh.fetchTime === 'string' ? lh.fetchTime : null,
    finalUrl: typeof lh.finalDisplayedUrl === 'string' ? lh.finalDisplayedUrl.slice(0, 500) : typeof lh.finalUrl === 'string' ? lh.finalUrl.slice(0, 500) : null,
  };
}

const ymd = (d: unknown): string | null => {
  const o = rec(d);
  const y = num(o.year); const m = num(o.month); const day = num(o.day);
  return y && m && day ? `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
};
/** Resposta do CrUX (records:queryRecord) -> métricas de campo no percentil 75. null se não houver registro. */
export function parseCrux(json: unknown, scope: 'url' | 'origin'): FieldMetrics | null {
  const record = rec(rec(json).record);
  const metrics = rec(record.metrics);
  if (!Object.keys(metrics).length) return null;
  const p75 = (k: string) => num(rec(rec(metrics[k]).percentiles).p75);
  const cp = rec(record.collectionPeriod);
  const first = ymd(cp.firstDate); const last = ymd(cp.lastDate);
  const out: FieldMetrics = {
    scope, lcp: round(p75('largest_contentful_paint')), cls: round(p75('cumulative_layout_shift'), 3), inp: round(p75('interaction_to_next_paint')),
    fcp: round(p75('first_contentful_paint')), ttfb: round(p75('experimental_time_to_first_byte')), period: first && last ? { first, last } : null,
  };
  return [out.lcp, out.cls, out.inp, out.fcp, out.ttfb].every((v) => v === null) ? null : out;
}

export const formatMs = (v: number | null): string => (v === null ? 'sem dados' : v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : `${Math.round(v).toLocaleString('pt-BR')} ms`);
export const formatCls = (v: number | null): string => (v === null ? 'sem dados' : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }));
export const formatMetric = (k: MetricKey, v: number | null): string => (k === 'cls' ? formatCls(v) : formatMs(v));

export interface SpeedRunRow {
  id?: string; url: string; host: string; kind: 'own' | 'competitor'; strategy: Strategy; fetched_at: string;
  performance_score: number | null; lcp_ms: number | null; cls: number | null; tbt_ms: number | null; fcp_ms: number | null; ttfb_ms: number | null; speed_index_ms: number | null;
  field: FieldMetrics | null; lighthouse_version: string | null;
}
/** Diferença entre duas medições da mesma URL e do mesmo dispositivo (negativo = melhorou, exceto a nota, onde positivo = melhorou). */
export function compareRuns(now: SpeedRunRow, before: SpeedRunRow | null | undefined): Partial<Record<'score' | 'lcp' | 'cls' | 'tbt' | 'fcp' | 'ttfb' | 'speedIndex', number>> | null {
  if (!before || before.url !== now.url || before.strategy !== now.strategy) return null;
  const d = (a: number | null, b: number | null, digits = 0) => (a === null || b === null ? undefined : Math.round((a - b) * 10 ** digits) / 10 ** digits);
  const out = { score: d(now.performance_score, before.performance_score), lcp: d(now.lcp_ms, before.lcp_ms), cls: d(now.cls, before.cls, 3), tbt: d(now.tbt_ms, before.tbt_ms), fcp: d(now.fcp_ms, before.fcp_ms), ttfb: d(now.ttfb_ms, before.ttfb_ms), speedIndex: d(now.speed_index_ms, before.speed_index_ms) };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}
