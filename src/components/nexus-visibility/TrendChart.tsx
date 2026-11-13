import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { chartAxis, formatDayLong, hasTrendData, trendChartData } from '@/lib/nexus-visibility';
import type { TrendPoint } from '@/types/nexus-visibility';

type Row = ReturnType<typeof trendChartData>[number];

function ChartTip({ active, payload }: TooltipProps<number, string>) {
  const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
  if (!row) return null;
  const pct = (v: number | null) => (v === null ? 'n/d' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lg" style={{ borderColor: 'var(--zv-line)' }}>
      <p className="mb-1 font-semibold">{formatDayLong(row.day)}</p>
      <p><span className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: 'var(--zv-vr)' }} />Visibilidade: <strong>{pct(row.vr)}</strong></p>
      <p><span className="mr-1.5 inline-block h-0 w-3 border-t-2 border-dashed align-middle" style={{ borderColor: 'var(--zv-cr)' }} />Citação: <strong>{pct(row.cr)}</strong></p>
      <p className="mt-1 text-[var(--zv-muted)]">{row.n} {row.n === 1 ? 'observação' : 'observações'} no dia</p>
    </div>
  );
}

/** Evolução diária de visibilidade (linha cheia) e citação (tracejada). Dia sem observação é lacuna, não zero. */
export function TrendChart({ trend, height = 260 }: { trend: TrendPoint[]; height?: number }) {
  const reduced = usePrefersReducedMotion();
  const data = trendChartData(trend);
  const withData = data.filter((d) => d.n > 0);
  const axis = chartAxis(Math.max(0, ...withData.flatMap((d) => [d.vr ?? 0, d.cr ?? 0])));
  const summary = hasTrendData(trend)
    ? `Visibilidade e citação por dia, ${withData.length} ${withData.length === 1 ? 'dia' : 'dias'} com observações, de ${formatDayLong(withData[0].day)} a ${formatDayLong(withData[withData.length - 1].day)}.`
    : 'Sem dias com observações para desenhar.';
  return (
    <figure className="space-y-2">
      <div role="img" aria-label={summary} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--zv-line)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={28} stroke="var(--zv-muted)" />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} domain={[0, axis.max]} ticks={axis.ticks} tickFormatter={(v: number) => `${v}%`} stroke="var(--zv-muted)" />
            <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--zv-line)' }} />
            <Line type="monotone" dataKey="vr" name="Visibilidade" stroke="var(--zv-vr)" strokeWidth={2.4} dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--zv-vr)' }} activeDot={{ r: 4.5 }} connectNulls={false} isAnimationActive={!reduced} animationDuration={500} />
            <Line type="monotone" dataKey="cr" name="Citação" stroke="var(--zv-cr)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={!reduced} animationDuration={500} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--zv-muted)]">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: 'var(--zv-vr)' }} aria-hidden="true" />Visibilidade (mencionam a marca)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--zv-cr)' }} aria-hidden="true" />Citação (usam o seu site como fonte)</span>
      </figcaption>
      <div className="sr-only"><table>
        <caption>Valores por dia</caption>
        <thead><tr><th>Dia</th><th>Visibilidade</th><th>Citação</th><th>Observações</th></tr></thead>
        <tbody>{withData.map((d) => <tr key={d.day}><td>{formatDayLong(d.day)}</td><td>{d.vr === null ? 'n/d' : `${d.vr}%`}</td><td>{d.cr === null ? 'n/d' : `${d.cr}%`}</td><td>{d.n}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}
