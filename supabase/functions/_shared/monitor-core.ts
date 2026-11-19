/**
 * Monitoramento automático da Velocidade: regras puras (sem rede, sem banco).
 *
 *  - validateSchedule: confere o que o cliente pediu (frequência, aparelhos, páginas extras, limiar do alerta).
 *  - nextRunAt: próxima medição.
 *  - buildTargets: o que medir em cada rodada (página inicial + até 2 extras, nos aparelhos escolhidos, e opcionalmente concorrentes).
 *  - evaluateSpeedAlerts: decide se uma medição NOVA piorou de verdade, sem alarme falso por oscilação normal do laboratório.
 *
 * Por que a mediana: a nota do Lighthouse oscila alguns pontos de uma rodada para outra sem o site ter mudado.
 * Comparar com UMA medição anterior geraria alerta à toa; comparar com a mediana das últimas 3 só dispara quando a queda é real.
 */
import { parseSafeUrl, registrableDomain } from './profile-analyze-core.ts';
import { rate, type FieldMetrics, type MetricKey, type Rating, type SpeedRunRow, type Strategy } from './speed-core.ts';

import { DEFAULT_DROP_POINTS, DEVICES, FREQUENCIES, MAX_EXTRA_URLS, type Devices, type Frequency } from './monitor-labels.ts';
export { DEFAULT_DROP_POINTS, DEVICES, DEVICES_LABEL, FREQUENCIES, FREQUENCY_LABEL, MAX_EXTRA_URLS } from './monitor-labels.ts';
export type { Devices, Frequency } from './monitor-labels.ts';
export const MAX_SCHEDULED_COMPETITORS = 4;
export const MAX_TARGETS_PER_ROUND = 12;
const DAY = 86_400_000;
const INTERVAL_MS: Record<Frequency, number> = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY };

export interface Schedule {
  enabled: boolean;
  frequency: Frequency;
  devices: Devices;
  extra_urls: string[];
  include_competitors: boolean;
  alert_drop_points: number;
}
export type ScheduleCheck = { ok: true; value: Schedule } | { ok: false; error: string };

export function validateSchedule(raw: unknown, ownHost: string | null): ScheduleCheck {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof o.enabled !== 'boolean') return { ok: false, error: 'schedule_enabled_invalid' };
  if (!FREQUENCIES.includes(o.frequency as Frequency)) return { ok: false, error: 'schedule_frequency_invalid' };
  if (!DEVICES.includes(o.devices as Devices)) return { ok: false, error: 'schedule_devices_invalid' };
  const include = o.include_competitors === true;
  const drop = o.alert_drop_points === undefined ? DEFAULT_DROP_POINTS : Number(o.alert_drop_points);
  if (!Number.isInteger(drop) || drop < 3 || drop > 50) return { ok: false, error: 'schedule_threshold_invalid' };
  const list = Array.isArray(o.extra_urls) ? o.extra_urls : o.extra_urls === undefined ? [] : null;
  if (list === null) return { ok: false, error: 'schedule_urls_invalid' };
  if (!ownHost) return list.length ? { ok: false, error: 'project_domain_required' } : { ok: true, value: { enabled: o.enabled, frequency: o.frequency as Frequency, devices: o.devices as Devices, extra_urls: [], include_competitors: include, alert_drop_points: drop } };
  const reg = registrableDomain(ownHost);
  const home = `https://${ownHost}/`;
  const seen = new Set<string>([home]);
  const urls: string[] = [];
  for (const item of list) {
    const text = typeof item === 'string' ? item.trim() : '';
    if (!text) continue;
    if (text.length > 400) return { ok: false, error: 'schedule_urls_invalid' };
    const parsed = parseSafeUrl(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if ('error' in parsed) return { ok: false, error: 'schedule_urls_invalid' };
    parsed.url.hash = '';
    if (registrableDomain(parsed.url.hostname) !== reg) return { ok: false, error: 'schedule_url_outside_project_domain' };
    const href = parsed.url.href;
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(href);
  }
  if (urls.length > MAX_EXTRA_URLS) return { ok: false, error: 'schedule_too_many_urls' };
  return { ok: true, value: { enabled: o.enabled, frequency: o.frequency as Frequency, devices: o.devices as Devices, extra_urls: urls, include_competitors: include, alert_drop_points: drop } };
}

export const nextRunAt = (frequency: Frequency, fromMs: number): string => new Date(fromMs + INTERVAL_MS[frequency]).toISOString();

export interface Target { url: string; strategy: Strategy; kind: 'own' | 'competitor' }
const strategiesOf = (d: Devices): Strategy[] => (d === 'both' ? ['mobile', 'desktop'] : [d]);

/** Lista de medições da rodada, em ordem estável (a ordem importa: o progresso é guardado como "quantas já foram"). */
export function buildTargets(schedule: Pick<Schedule, 'devices' | 'extra_urls' | 'include_competitors'>, ownHost: string, competitorUrls: string[]): Target[] {
  const out: Target[] = [];
  const strategies = strategiesOf(schedule.devices);
  for (const url of [`https://${ownHost}/`, ...schedule.extra_urls]) for (const strategy of strategies) out.push({ url, strategy, kind: 'own' });
  if (schedule.include_competitors) {
    const strategy: Strategy = schedule.devices === 'desktop' ? 'desktop' : 'mobile';
    const seenHosts = new Set<string>();
    for (const url of competitorUrls) {
      let host: string;
      try { host = new URL(url).hostname; } catch { continue; }
      if (seenHosts.has(host) || seenHosts.size >= MAX_SCHEDULED_COMPETITORS) continue;
      seenHosts.add(host);
      out.push({ url, strategy, kind: 'competitor' });
    }
  }
  return out.slice(0, MAX_TARGETS_PER_ROUND);
}

/** Mediana de uma lista de números (vazia -> null). */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface SpeedAlertDraft { kind: 'score_drop' | 'field_worse'; title: string; detail: Record<string, unknown>; ref_url: string }
const RANK: Record<Rating, number> = { bom: 0, melhorar: 1, ruim: 2 };
const FIELD_METRICS: MetricKey[] = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
const DEVICE_NAME: Record<Strategy, string> = { mobile: 'celular', desktop: 'computador' };

/**
 * `priors`: medições anteriores da MESMA URL e do MESMO aparelho, da mais nova para a mais antiga (usa até 3).
 * Só o site do cliente gera alerta; concorrente não.
 */
export function evaluateSpeedAlerts(now: SpeedRunRow, priors: SpeedRunRow[], dropPoints: number): SpeedAlertDraft[] {
  if (now.kind !== 'own' || !priors.length) return [];
  const out: SpeedAlertDraft[] = [];
  const recent = priors.slice(0, 3);
  const baseline = median(recent.map((p) => p.performance_score).filter((v): v is number => v !== null));
  if (baseline !== null && now.performance_score !== null) {
    const drop = Math.round(baseline - now.performance_score);
    if (drop >= dropPoints) {
      out.push({
        kind: 'score_drop', ref_url: now.url,
        title: `A nota de velocidade de ${now.host} no ${DEVICE_NAME[now.strategy]} caiu ${drop} pontos (de ${Math.round(baseline)} para ${now.performance_score})`,
        detail: { url: now.url, strategy: now.strategy, baseline: Math.round(baseline), score: now.performance_score, drop, compared_with: recent.length, method: 'mediana das últimas medições' },
      });
    }
  }
  const before: FieldMetrics | null = priors[0].field;
  const after: FieldMetrics | null = now.field;
  if (before && after && before.scope === after.scope) {
    const worse: Array<Record<string, unknown>> = [];
    for (const m of FIELD_METRICS) {
      const a = rate(m, before[m as keyof FieldMetrics] as number | null);
      const b = rate(m, after[m as keyof FieldMetrics] as number | null);
      if (a && b && RANK[b] > RANK[a]) worse.push({ metric: m, from: before[m as keyof FieldMetrics], to: after[m as keyof FieldMetrics], from_rating: a, to_rating: b });
    }
    if (worse.length) {
      out.push({
        kind: 'field_worse', ref_url: now.url,
        title: `Visitantes reais de ${now.host} (${DEVICE_NAME[now.strategy]}): ${worse.length} indicador(es) passaram para uma faixa pior`,
        detail: { url: now.url, strategy: now.strategy, scope: after.scope, metrics: worse, source: 'Chrome UX Report, 28 dias, percentil 75' },
      });
    }
  }
  return out;
}
