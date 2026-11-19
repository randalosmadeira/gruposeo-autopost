import type { ReactNode } from 'react';
import { METRIC_LABEL, formatMetric, rate, rateScore, type MetricKey, type Rating, type SpeedRunRow } from '../../../supabase/functions/_shared/speed-core';
import { STRATEGY_LABEL, type SpeedRunResult } from '@/lib/speed-api';

const RATING_CLS: Record<Rating, string> = {
  bom: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  melhorar: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  ruim: 'border-red-500/50 bg-red-500/10 text-red-300',
};
const RATING_TEXT: Record<Rating, string> = { bom: 'Bom', melhorar: 'Precisa melhorar', ruim: 'Ruim' };
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function Chip({ r }: { r: Rating | null }) {
  return r ? <span className={`rounded-full border px-2 py-0.5 text-[11px] leading-4 ${RATING_CLS[r]}`}>{RATING_TEXT[r]}</span> : <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">sem dados</span>;
}

/** Variação em relação à medição anterior. Para tempos e CLS, cair é melhorar; para a nota, subir é melhorar. */
function DeltaText({ value, metric, higherIsBetter = false }: { value: number | undefined; metric: MetricKey | 'score'; higherIsBetter?: boolean }) {
  if (value === undefined) return null;
  if (value === 0) return <span className="text-xs text-muted-foreground">igual à medição anterior</span>;
  const better = higherIsBetter ? value > 0 : value < 0;
  const text = metric === 'score' ? `${value > 0 ? '+' : ''}${value} ponto(s)` : metric === 'cls' ? `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}` : `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('pt-BR')} ms`;
  return <span className={`text-xs ${better ? 'text-emerald-400' : 'text-red-400'}`}>{better ? 'melhorou' : 'piorou'} {text} vs. a medição anterior</span>;
}

function Tile({ metric, value, delta }: { metric: MetricKey; value: number | null; delta?: number }) {
  return (
    <li className="rounded-lg border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{METRIC_LABEL[metric]}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{formatMetric(metric, value)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><Chip r={rate(metric, value)} /><DeltaText value={delta} metric={metric} /></div>
    </li>
  );
}

function Section({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card/40 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{title}</h3><span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{badge}</span></div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Resultado de uma medição: nota e métricas de laboratório; dados reais de usuários (CrUX) quando existirem; origem e hora de cada número. */
export function RunResult({ result }: { result: SpeedRunResult }) {
  const r = result.run;
  const d = result.delta || {};
  const f = r.field;
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-4 rounded-xl border bg-card/40 p-3 sm:p-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 text-3xl font-bold tabular-nums" style={{ borderColor: r.performance_score === null ? undefined : r.performance_score >= 90 ? '#34d399' : r.performance_score >= 50 ? '#fbbf24' : '#f87171' }} aria-label={`Nota de desempenho ${r.performance_score ?? 'sem dados'} de 100`}>{r.performance_score ?? '—'}</div>
        <div className="min-w-0">
          <p className="break-all text-sm font-semibold">{r.url}</p>
          <p className="text-sm text-muted-foreground">{STRATEGY_LABEL[r.strategy]} · medido em {when(r.fetched_at)}{r.lighthouse_version ? ` · Lighthouse ${r.lighthouse_version}` : ''}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2"><Chip r={rateScore(r.performance_score)} /><DeltaText value={d.score} metric="score" higherIsBetter /></div>
        </div>
      </header>

      <Section title="Teste simulado agora" badge="Laboratório · Lighthouse via PageSpeed Insights (Google)">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Tile metric="lcp" value={r.lcp_ms} delta={d.lcp} /><Tile metric="fcp" value={r.fcp_ms} delta={d.fcp} /><Tile metric="speedIndex" value={r.speed_index_ms} delta={d.speedIndex} />
          <Tile metric="tbt" value={r.tbt_ms} delta={d.tbt} /><Tile metric="cls" value={r.cls} delta={d.cls} /><Tile metric="ttfb" value={r.ttfb_ms} delta={d.ttfb} />
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Teste feito por um servidor do Google, em rede e aparelho simulados. Serve para achar problemas, mas não é o que seus visitantes sentem.</p>
      </Section>

      <Section title="O que os visitantes reais sentiram" badge="Campo · Chrome UX Report (Google), últimos 28 dias, percentil 75">
        {f ? (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Tile metric="lcp" value={f.lcp} /><Tile metric="inp" value={f.inp} /><Tile metric="cls" value={f.cls} /><Tile metric="fcp" value={f.fcp} /><Tile metric="ttfb" value={f.ttfb} />
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{f.scope === 'url' ? 'Dados desta página.' : 'Esta página não tem visitas suficientes: são os dados do site inteiro.'}{f.period ? ` Período: ${f.period.first.split('-').reverse().join('/')} a ${f.period.last.split('-').reverse().join('/')}.` : ''}</p>
          </>
        ) : (
          <p role="note" className="text-sm text-muted-foreground">{result.field_note === 'crux_unavailable' ? 'Não consegui consultar os dados de visitantes reais agora. O teste simulado acima continua valendo.' : 'Sem dados de visitantes reais: o Google só publica esses números para páginas e sites com tráfego suficiente no Chrome. Isto não é um problema do site.'}</p>
        )}
      </Section>
    </div>
  );
}

/** Quadro lado a lado: a última medição de cada site (o seu e os concorrentes) por dispositivo. */
export function CompareTable({ runs, ownHost }: { runs: SpeedRunRow[]; ownHost: string | null }) {
  const latest = new Map<string, SpeedRunRow>();
  for (const r of runs) { const k = `${r.host}|${r.strategy}`; if (!latest.has(k)) latest.set(k, r); }
  const rows = [...latest.values()].sort((a, b) => (a.kind === b.kind ? (b.performance_score ?? -1) - (a.performance_score ?? -1) : a.kind === 'own' ? -1 : 1));
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border" tabIndex={0} role="region" aria-label="Comparação de velocidade entre sites (role para o lado se precisar)">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead><tr className="border-b bg-muted/30 text-left text-xs">
          <th scope="col" className="sticky left-0 bg-muted/60 px-3 py-2 font-medium">Site</th><th scope="col" className="px-3 py-2 font-medium">Aparelho</th><th scope="col" className="px-3 py-2 text-right font-medium">Nota</th>
          <th scope="col" className="px-3 py-2 text-right font-medium">LCP</th><th scope="col" className="px-3 py-2 text-right font-medium">CLS</th><th scope="col" className="px-3 py-2 text-right font-medium">TTFB</th><th scope="col" className="px-3 py-2 text-right font-medium">Medido em</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.host}|${r.strategy}`} className="border-b last:border-0">
              <th scope="row" className="sticky left-0 bg-background px-3 py-2 text-left font-medium"><span className="break-all">{r.host}</span>{r.kind === 'own' || r.host === ownHost ? <span className="ml-2 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary">seu site</span> : <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">concorrente</span>}</th>
              <td className="px-3 py-2">{STRATEGY_LABEL[r.strategy]}</td>
              <td className="px-3 py-2 text-right"><span className="tabular-nums font-semibold">{r.performance_score ?? '—'}</span></td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMetric('lcp', r.lcp_ms)}</td><td className="px-3 py-2 text-right tabular-nums">{formatMetric('cls', r.cls)}</td><td className="px-3 py-2 text-right tabular-nums">{formatMetric('ttfb', r.ttfb_ms)}</td>
              <td className="px-3 py-2 text-right text-xs text-muted-foreground">{when(r.fetched_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
