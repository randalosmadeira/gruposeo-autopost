import { useState } from 'react';
import type { CoverageBucket, IndexationOverview } from '@/lib/indexation-api';
import { useT } from '@/lib/i18n/core';

const pct = (n: number, total: number) => (total > 0 ? Math.round((100 * n) / total) : 0);

/** Barra empilhada: indexadas / não indexadas / desconhecidas. Cada cor tem o número por extenso ao lado (não depende só da cor). */
function Bar({ b }: { b: CoverageBucket }) {
  const { t, n } = useT();
  const a = pct(b.indexed, b.urls), nn = pct(b.not_indexed, b.urls), u = Math.max(0, 100 - a - nn);
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="break-all text-sm font-medium">{b.label}</span><span className="text-xs text-muted-foreground">{t('cov.urlsCount', { n: n(b.urls) })}</span></div>
      <div className="flex h-3 w-full overflow-hidden rounded bg-muted" role="img" aria-label={t('cov.barAria', { label: b.label, indexed: b.indexed, not: b.not_indexed, unknown: b.unknown })}>
        <div className="bg-emerald-500" style={{ width: `${a}%` }} /><div className="bg-red-500" style={{ width: `${nn}%` }} /><div className="bg-slate-500/50" style={{ width: `${u}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{t('cov.line', { indexed: b.indexed, not: b.not_indexed, unknown: b.unknown, sent: b.sent, problems: b.problems })}</p>
    </li>
  );
}

const VIEWS = [['by_host', 'cov.byHost'], ['by_section', 'cov.bySection'], ['by_lang', 'cov.byLang'], ['by_node', 'cov.byNode']] as const;

export function CoveragePanel({ data }: { data: IndexationOverview }) {
  const { t, n } = useT();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('by_host');
  const x = data.totals;
  const cards = [['cov.urls', x.urls], ['cov.indexed', x.indexed], ['cov.notIndexed', x.not_indexed], ['cov.unknown', x.unknown], ['cov.sent', x.sent], ['cov.problems', x.with_problems], ['cov.inSitemap', x.in_sitemap], ['cov.neverChecked', x.never_checked]] as const;
  return (
    <section aria-labelledby="ix-cov" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ix-cov" className="text-lg font-semibold">{t('cov.title')}</h2>
      {x.urls === 0 ? <p className="text-sm text-muted-foreground">{t('cov.empty')}</p> : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {cards.map(([k, v]) => (
              <div key={k} className="rounded border bg-background/40 p-2"><dt className="text-xs text-muted-foreground">{t(k)}</dt><dd className="text-lg font-semibold">{n(v)}</dd></div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">{t('cov.note')}</p>
          <div role="tablist" aria-label={t('cov.groupAria')} className="flex flex-wrap gap-2">
            {VIEWS.map(([k, label]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded border px-3 py-1 text-sm ${view === k ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>{t(label)}</button>)}
          </div>
          {data.coverage[view].length === 0 ? <p className="text-sm text-muted-foreground">{t('cov.emptyGroup')}</p> : <ul className="space-y-3">{data.coverage[view].map((b) => <Bar key={b.key} b={b} />)}</ul>}
        </>
      )}
    </section>
  );
}
