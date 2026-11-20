import type { SubmissionRow } from '@/lib/indexation-api';
import { useT } from '@/lib/i18n/core';
import type { Key } from '@/lib/i18n/indexation-dict';

export function SubmissionsHistory({ rows }: { rows: SubmissionRow[] }) {
  const { t, n, date } = useT();
  return (
    <section aria-labelledby="ix-sub" className="space-y-2 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ix-sub" className="text-lg font-semibold">{t('sub.title')}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('sub.empty')}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded border bg-background/40 p-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{t(`eng.${r.engine}` as Key)}{r.host ? ` · ${r.host}` : ''}</span><time className="text-xs text-muted-foreground" dateTime={r.created_at}>{date(r.created_at)}</time></div>
              <p className="text-xs text-muted-foreground">{r.engine === 'google' ? t('sub.google', { n: n(r.urls_count) }) : t('sub.urls', { n: n(r.urls_count), status: t(`sub.st.${r.status}` as Key) })}{typeof r.response?.message === 'string' ? `. ${r.response.message}` : ''}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
