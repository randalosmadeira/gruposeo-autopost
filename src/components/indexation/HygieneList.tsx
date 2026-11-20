import type { HygieneRow } from '@/lib/indexation-api';
import { useT } from '@/lib/i18n/core';
import type { Key } from '@/lib/i18n/indexation-dict';

const examples = (r: HygieneRow): string[] => { const e = (r.evidence as { exemplos?: unknown }).exemplos; return Array.isArray(e) ? e.filter((x): x is string => typeof x === 'string').slice(0, 3) : []; };

/** Checklist de higiene: o que falhou aparece primeiro, com severidade por extenso, evidência e "como corrigir". O rótulo vem do dicionário pela chave estável; o texto explicativo vem do servidor (pt-BR). */
export function HygieneList({ rows }: { rows: HygieneRow[] }) {
  const { t, date } = useT();
  const applicable = rows.filter((r) => r.applicable);
  const failing = applicable.filter((r) => !r.ok);
  const label = (r: HygieneRow) => { const k = `hy.${r.key}` as Key; const own = t(k); return own === k ? r.label : own; };
  return (
    <section aria-labelledby="ix-hyg" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ix-hyg" className="text-lg font-semibold">{t('hy.title')}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('hy.empty')}</p> : (
        <>
          <p className="text-xs text-muted-foreground">{t('hy.summary', { failing: failing.length, total: applicable.length, date: date(rows[0].checked_at) })}</p>
          <ul className="space-y-2">
            {applicable.map((r) => (
              <li key={r.key} className={`rounded border p-2 text-sm ${r.ok ? 'bg-background/40' : r.severity === 'alta' ? 'border-red-500/50 bg-red-500/10' : 'border-amber-500/50 bg-amber-500/10'}`}>
                <p className="font-medium">{r.ok ? t('hy.ok') : t('hy.fixSev', { sev: t(`sev.${r.severity}` as Key) })}: {label(r)}</p>
                <p className="break-words text-xs text-muted-foreground">{r.text}</p>
                {!r.ok && r.fix && <p className="mt-1 break-words text-xs"><strong>{t('hy.how')}</strong> {r.fix}</p>}
                {!r.ok && examples(r).length > 0 && <p className="mt-1 break-all text-xs text-muted-foreground">{t('hy.examples')} {examples(r).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
