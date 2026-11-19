import type { ReactNode } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CircleDashed, Info, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  confidenceHint, confidenceLabel, effectiveConfidence, formatRateInterval, formatSample, formatZviInterval, visibilityErrorMessage,
  type Delta,
} from '@/lib/nexus-visibility';
import type { Confidence } from '@/types/nexus-visibility';
import './visibility.css';

export type PillTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

export function Pill({ tone = 'neutral', icon, children, className, title }: { tone?: PillTone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cn('zv-pill', `zv-pill--${tone}`, className)}>{icon}{children}</span>;
}

/** Confiança em texto + ícone (nunca só cor). Aplica a regra local: n pequeno nunca passa de "baixa". */
export function ConfidenceBadge({ confidence, n, className }: { confidence: Confidence; n: number; className?: string }) {
  const c = effectiveConfidence(confidence, n);
  const tone: PillTone = c === 'alta' ? 'good' : c === 'media' ? 'info' : c === 'baixa' ? 'warn' : 'neutral';
  const Icon = c === 'alta' || c === 'media' ? ShieldCheck : c === 'baixa' ? ShieldAlert : CircleDashed;
  return (
    <Pill tone={tone} className={className} title={confidenceHint(c, n)} icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
      <span data-testid="confidence-badge">{confidenceLabel(c)}</span>
    </Pill>
  );
}

export function PartialBadge({ className }: { className?: string }) {
  return <Pill tone="warn" className={className} title="Alguns componentes do índice ainda não são medidos; o peso deles é redistribuído." icon={<CircleDashed className="h-3 w-3" aria-hidden="true" />}>Parcial</Pill>;
}

/** Variação contra o período anterior: seta + sinal + texto. */
export function DeltaPill({ delta, lowConfidence }: { delta: Delta | null; lowConfidence?: boolean }) {
  if (!delta) return <span className="text-xs text-[var(--zv-muted)]" data-testid="delta-none">Sem período anterior para comparar</span>;
  const tone: PillTone = delta.direction === 'up' ? 'good' : delta.direction === 'down' ? 'bad' : 'neutral';
  const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Pill tone={tone} icon={<Icon className="h-3 w-3" aria-hidden="true" />}>
        <span data-testid="delta-label">{delta.label}</span>
        <span className="sr-only"> {delta.spoken}</span>
      </Pill>
      {lowConfidence && <span className="text-[11px] text-[var(--zv-muted)]">variação pouco confiável</span>}
    </span>
  );
}

/** Mini-gráfico de linha em SVG puro. Dias sem dado viram lacuna. */
export function Sparkline({ values, label, color = 'var(--zv-vr)', height = 40 }: { values: Array<number | null>; label: string; color?: string; height?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) {
    return <div role="img" aria-label={`${label}: dados insuficientes para o gráfico`} className="flex items-center text-[11px] text-[var(--zv-muted)]" style={{ height }}>Poucos dias com dado para desenhar a evolução</div>;
  }
  const W = 120; const pad = 3;
  const max = Math.max(...pts.map((p) => p.v), 0.0001);
  const min = Math.min(...pts.map((p) => p.v), max);
  const span = Math.max(max - min, max * 0.15, 0.0001);
  const x = (i: number) => pad + (i / Math.max(values.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2 - 2);
  const segs: string[][] = []; let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur);
  const last = pts[pts.length - 1];
  const gid = `zv-sp-${label.replace(/\W+/g, '').slice(0, 12)}`;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {segs.filter((s) => s.length === 1).map((s, k) => {
        const [cx, cy] = s[0].split(',');
        return <circle key={`dot-${k}`} cx={cx} cy={cy} r="2.2" fill={color} vectorEffect="non-scaling-stroke" />;
      })}
      {segs.filter((s) => s.length > 1).map((s, k) => (
        <g key={k}>
          <polygon points={`${s[0].split(',')[0]},${height} ${s.join(' ')} ${s[s.length - 1].split(',')[0]},${height}`} fill={`url(#${gid})`} />
          <polyline points={s.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      <circle cx={x(last.i)} cy={y(last.v)} r="2.4" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Barra 0..max com o intervalo de confiança como faixa e o valor como marcador. */
export function RangeBar({ value, low, high, max = 1, label, color = 'var(--zv-vr)' }: { value: number | null; low: number | null; high: number | null; max?: number; label: string; color?: string }) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const hasValue = value !== null;
  const hasRange = low !== null && high !== null && high >= low;
  return (
    <div role="img" aria-label={label} className="relative h-2.5 w-full rounded-full zv-track">
      {hasRange && <div className="zv-fill absolute top-0 h-full rounded-full opacity-35" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})`, background: color }} />}
      {hasValue && <div className="zv-fill absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--zv-surface)]" style={{ left: pct(value), background: color }} />}
    </div>
  );
}

/** Barra simples de taxa 0..1 (ou 0..max). */
export function Meter({ value, max = 1, color = 'var(--zv-vr)', label, className }: { value: number | null; max?: number; color?: string; label: string; className?: string }) {
  const w = value === null ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div role="img" aria-label={label} className={cn('h-2 w-full overflow-hidden rounded-full zv-track', className)}>
      <div className="zv-fill h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** Valor com amostra e intervalo: a regra "mostre sempre n e intervalo" em um só lugar. */
export function SampleLine({ n, low, high, kind = 'rate' }: { n: number; low?: number | null; high?: number | null; kind?: 'rate' | 'zvi' | 'none' }) {
  const interval = kind === 'none' ? null : kind === 'zvi' ? formatZviInterval(low ?? null, high ?? null) : formatRateInterval(low ?? null, high ?? null);
  return (
    <p className="text-xs text-[var(--zv-muted)]" data-testid="sample-line">
      {formatSample(n)}{interval ? ` · 95%: ${interval}` : ''}
    </p>
  );
}

export function PanelHeader({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-[var(--zv-muted)]">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="zv-panel flex flex-col items-center gap-2 border-dashed px-5 py-10 text-center" data-testid="empty-state">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--zv-surface-2)] text-[var(--zv-muted)]" aria-hidden="true">{icon ?? <Info className="h-5 w-5" />}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-[var(--zv-muted)]">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Não foi possível carregar' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="zv-panel flex flex-wrap items-center gap-3 border-[color-mix(in_srgb,var(--zv-bad)_45%,transparent)] p-4">
      <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--zv-bad)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-[var(--zv-muted)]">{visibilityErrorMessage(error)}</p>
      </div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Tentar de novo</Button>}
    </div>
  );
}

export function LoadingBlock({ label, rows = 3, className }: { label: string; rows?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label={label} role="status" className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
    </div>
  );
}
