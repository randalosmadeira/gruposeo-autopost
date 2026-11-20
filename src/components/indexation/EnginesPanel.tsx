import type { EngineInfo } from '@/lib/indexation-api';
import { useT } from '@/lib/i18n/core';
import type { Key } from '@/lib/i18n/indexation-dict';

/** Mecanismos de busca (globais): o que o Zica realmente faz por cada um. Onde não há API pública gratuita verificada, diz isso em vez de fingir suporte. */
export function EnginesPanel({ engines }: { engines: EngineInfo[] }) {
  const { t } = useT();
  return (
    <section aria-labelledby="ix-eng" className="space-y-2 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ix-eng" className="text-lg font-semibold">{t('engcat.title')}</h2>
      <p className="text-xs text-muted-foreground">{t('engcat.note')}</p>
      <ul className="space-y-2">
        {engines.map((e) => (
          <li key={e.key} className="rounded border bg-background/40 p-2 text-sm">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{e.label}</span><span className={`rounded border px-2 py-0.5 text-xs ${e.support === 'implementado' ? 'border-emerald-500/50 text-emerald-300' : e.support === 'cobertura_indexnow' ? 'border-sky-500/50 text-sky-300' : 'border-amber-500/50 text-amber-300'}`}>{t(`engcat.sup.${e.support}` as Key)}</span></p>
            <p className="break-words text-xs text-muted-foreground">{e.how}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
