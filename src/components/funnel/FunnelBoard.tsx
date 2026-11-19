import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { FunnelAnalysis, FunnelConfig, FunnelEntries, IndicatorResult } from '../../../supabase/functions/_shared/funnel-core';
import { formatValue, monthlyTable } from '../../../supabase/functions/_shared/funnel-core';
import { monthLabel } from '@/lib/funnel-format';

const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

function Delta({ value, unit, goodWhenUp = true, suffix = '' }: { value: number | null; unit: 'pp' | 'abs'; goodWhenUp?: boolean; suffix?: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">sem mês anterior</span>;
  if (value === 0) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" aria-hidden />igual ao mês anterior</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const text = unit === 'pp' ? `${up ? '+' : ''}${value.toLocaleString('pt-BR')} pontos` : `${up ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suffix}`;
  return <span className={`inline-flex items-center gap-1 text-xs ${good ? 'text-emerald-400' : 'text-red-400'}`}><Icon className="h-3 w-3" aria-hidden /><span className="sr-only">{up ? 'subiu' : 'caiu'} </span>{text} vs. mês anterior</span>;
}

/** Colunas do funil como barras: cada barra proporcional ao primeiro número, com a conversão entre elas e a marca de onde vaza. */
export function FunnelBars({ config, analysis, values }: { config: FunnelConfig; analysis: FunnelAnalysis; values: Record<string, number> | undefined }) {
  const first = values?.[config.counts[0].key];
  return (
    <ol className="space-y-1" aria-label="Funil do mês">
      {config.counts.map((c, i) => {
        const v = values?.[c.key];
        const width = typeof v === 'number' && typeof first === 'number' && first > 0 ? Math.max(3, Math.min(100, (v / first) * 100)) : 0;
        const step = i > 0 ? analysis.steps[i - 1] : null;
        const leak = analysis.leak && step && analysis.leak.stepIndex === i - 1;
        return (
          <li key={c.key}>
            {step && (
              <div className={`my-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-2.5 py-1.5 text-xs ${leak ? 'border-red-500/60 bg-red-500/10' : 'border-dashed'}`}>
                {leak && <span className="inline-flex items-center gap-1 font-semibold text-red-300"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />Aqui o funil vaza</span>}
                <span>{pct(step.rate)} avançam</span>
                {step.lost !== null && step.lost > 0 && <span className="text-muted-foreground">{step.lost.toLocaleString('pt-BR')} ficaram pelo caminho</span>}
                <Delta value={step.deltaPp} unit="pp" />
                {step.inconsistent && <span className="text-amber-300">número de baixo maior que o de cima: confira</span>}
              </div>
            )}
            <div className="rounded-lg border p-2.5 sm:p-3">
              <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 text-sm font-medium">{c.label}</span><span className="shrink-0 text-xl font-bold tabular-nums">{typeof v === 'number' ? v.toLocaleString('pt-BR') : '—'}</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded bg-muted" aria-hidden><div className="h-full rounded bg-primary/80 transition-all" style={{ width: `${width}%` }} /></div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function IndicatorLine({ i }: { i: IndicatorResult }) {
  // tempos menores são melhores; as demais medidas, maiores
  const goodWhenUp = !(i.unit === 'minutes' || i.unit === 'days');
  return (
    <li className="rounded-md border bg-background/40 p-2.5">
      <p className="text-xs text-muted-foreground">{i.label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${i.value === null ? 'text-muted-foreground' : ''}`}>{formatValue(i.value, i.unit)}</p>
      {i.value !== null && <Delta value={i.unit === 'percent' && i.delta !== null ? Math.round(i.delta * 1000) / 10 : i.delta} unit={i.unit === 'percent' ? 'pp' : 'abs'} goodWhenUp={goodWhenUp} suffix={i.unit === 'minutes' ? ' min' : i.unit === 'days' ? ' dia(s)' : i.unit === 'per_week' ? ' por semana' : ''} />}
    </li>
  );
}

/** Uma carta por etapa: objetivo, lembrete do conselho de classe do projeto (se houver) e os indicadores medidos. */
export function StageCards({ analysis }: { analysis: FunnelAnalysis }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {analysis.stages.map((s) => (
        <li key={s.key} className="rounded-xl border bg-card/40 p-3 sm:p-4">
          <h3 className="text-base font-semibold leading-snug">{s.label}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{s.goal}</p>
          <ul className="mt-3 space-y-2">{s.indicators.map((i) => <IndicatorLine key={i.key} i={i} />)}</ul>
          {s.compliance && <p role="note" className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">{s.compliance}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Tabela mensal: do mês mais novo para o mais antigo. Rola na horizontal dentro do próprio quadro (a página nunca rola de lado). */
export function MonthlyTable({ config, entries, months }: { config: FunnelConfig; entries: FunnelEntries; months: string[] }) {
  const rows = monthlyTable(config, entries, months);
  return (
    <div className="overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-label="Tabela mensal do funil (role para o lado se precisar)">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs">
            <th scope="col" className="sticky left-0 bg-muted/60 px-3 py-2 font-medium">Mês</th>
            {config.counts.map((c, i) => <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium">{c.label}{i > 0 && <span className="block font-normal text-muted-foreground">e % do passo</span>}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-b last:border-0">
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-background px-3 py-2 text-left font-medium first-letter:uppercase">{monthLabel(r.month)}</th>
              {r.values.map((v, i) => (
                <td key={config.counts[i].key} className="px-3 py-2 text-right tabular-nums">
                  {v === null ? <span className="text-muted-foreground">—</span> : v.toLocaleString('pt-BR')}
                  {i > 0 && <span className="block text-xs text-muted-foreground">{pct(r.rates[i - 1])}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
