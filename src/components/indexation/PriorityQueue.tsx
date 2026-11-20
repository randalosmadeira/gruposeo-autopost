import type { PlanReply } from '@/lib/indexation-api';
import { useT } from '@/lib/i18n/core';

/** Fila "o que indexar primeiro" e os lotes sugeridos por motor. */
export function PriorityQueue({ plan }: { plan: PlanReply | undefined }) {
  const { t, n } = useT();
  return (
    <section aria-labelledby="ix-plan" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ix-plan" className="text-lg font-semibold">{t('queue.title')}</h2>
      {!plan && <p className="text-sm text-muted-foreground">{t('queue.loading')}</p>}
      {plan?.empty && <p className="text-sm text-muted-foreground">{t('queue.empty')}</p>}
      {plan && !plan.empty && (
        <>
          <p className="text-xs text-muted-foreground">{t('queue.explain', { total: n(plan.total_queue), indexed: n(plan.excluded.indexed), blocked: n(plan.excluded.blocked) })}</p>
          {plan.queue.length === 0 ? <p className="text-sm text-muted-foreground">{t('queue.nothing')}</p> : (
            <ol className="space-y-2">
              {plan.queue.slice(0, 15).map((q, i) => (
                <li key={q.url_id} className="rounded border bg-background/40 p-2 text-sm"><span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span><span className="break-all font-medium">{q.url}</span><p className="text-xs text-muted-foreground">{t('queue.points', { n: q.score })} {q.reasons.join('; ')}.</p></li>
              ))}
            </ol>
          )}
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded border bg-background/40 p-2"><h3 className="font-medium">{t('queue.google')}</h3><p className="text-xs text-muted-foreground">{t('queue.googleLine', { n: plan.batches.google_inspect.urls })}</p></div>
            <div className="rounded border bg-background/40 p-2"><h3 className="font-medium">{t('queue.indexnow')}</h3>{plan.batches.indexnow.length === 0 ? <p className="text-xs text-muted-foreground">{t('queue.noneToSend')}</p> : plan.batches.indexnow.map((b, i) => <p key={i} className="break-all text-xs text-muted-foreground">{t('queue.urlsN', { host: b.host, n: n(b.urls) })}</p>)}</div>
            <div className="rounded border bg-background/40 p-2"><h3 className="font-medium">{t('queue.bing')}</h3>{plan.batches.bing.length === 0 ? <p className="text-xs text-muted-foreground">{t('queue.noneToSend')}</p> : plan.batches.bing.map((b, i) => <p key={i} className="break-all text-xs text-muted-foreground">{t('queue.urlsN', { host: b.host, n: n(b.urls) })}</p>)}</div>
          </div>
          {plan.blocking && Object.keys(plan.blocking).length > 0 && <div className="text-xs text-muted-foreground"><p className="font-medium text-foreground">{t('queue.blocking')}</p><ul className="list-disc pl-5">{Object.entries(plan.blocking).map(([k, v]) => <li key={k}>{n(v.count)}: {v.text}</li>)}</ul></div>}
        </>
      )}
    </section>
  );
}
