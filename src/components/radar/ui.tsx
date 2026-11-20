import { useMemo, type ReactNode } from 'react';
import { useT } from '@/lib/i18n/core';
import { makeRadarT, type RadarT } from '@/lib/i18n/radar-dict';
import type { Label, Trend } from '@/lib/radar-api';

/** Tradutor do Radar + formatadores do idioma escolhido na tela (pt-BR primeiro; chave ausente em en/es cai no pt-BR). */
export function useRT(): { t: RadarT; n: (v: number) => string; date: (iso: string) => string; locale: string } {
  const { locale, n, date } = useT();
  const t = useMemo(() => makeRadarT(locale), [locale]);
  return { t, n, date, locale };
}

export const SECTION = 'space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5';
export const SELECT = 'h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
export const INPUT = 'h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm disabled:opacity-60';

export function Chip({ children, tone = 'muted', title }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'info'; title?: string }) {
  const tones = { muted: 'border-border text-muted-foreground', ok: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', warn: 'border-amber-500/50 bg-amber-500/10 text-amber-300', bad: 'border-red-500/50 bg-red-500/10 text-red-300', info: 'border-sky-500/50 bg-sky-500/10 text-sky-300' };
  return <span title={title} className={`inline-flex max-w-full items-center break-words rounded border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

/** Rótulo da ORIGEM de um número de rede social: nunca aparece número sem dizer de onde veio. */
export function LabelChip({ label }: { label: Label }) {
  const { t } = useRT();
  const tone = label === 'api_oficial' ? 'ok' : label === 'indisponivel' ? 'muted' : label === 'provedor_terceiro' ? 'info' : 'warn';
  return <Chip tone={tone}>{t(`label.${label}`)}</Chip>;
}

/** Tendência com texto e seta (não depende só da cor). */
export function TrendTag({ trend }: { trend: Trend }) {
  const { t } = useRT();
  if (trend.direction === 'sem_dados') return <Chip>{t('trend.sem_dados')}</Chip>;
  const arrow = trend.direction === 'subindo' ? '▲' : trend.direction === 'caindo' ? '▼' : '■';
  const tone = trend.direction === 'subindo' ? 'ok' : trend.direction === 'caindo' ? 'bad' : 'muted';
  return <Chip tone={tone}>{arrow} {t(`trend.${trend.direction}`)}{trend.delta !== null ? ` (${trend.delta > 0 ? '+' : ''}${trend.delta})` : ''}</Chip>;
}

export function ScoreTag({ value, coverage }: { value: number | null; coverage: number }) {
  const { t, n } = useRT();
  if (value === null) return <Chip title={t('score.insufficient.hint', { pct: Math.round(coverage * 100) })}>{t('score.insufficient')}</Chip>;
  return <span className="inline-flex items-baseline gap-1"><strong className="text-lg">{n(value)}</strong><span className="text-xs text-muted-foreground">/100 · {t('score.estimated')}</span></span>;
}

export const metricText = (m: Record<string, number | null>, n: (v: number) => string, t: RadarT): string =>
  Object.entries(m).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${t(`metric.${k}`)}: ${n(v as number)}`).join(' · ');

export function Notice({ kind, children }: { kind: 'ok' | 'error' | 'warn'; children: ReactNode }) {
  const c = kind === 'ok' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : kind === 'warn' ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-red-500/50 bg-red-500/10 text-red-300';
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`break-words rounded border p-3 text-sm ${c}`}>{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p>; }
