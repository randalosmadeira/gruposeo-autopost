import { Button } from '@/components/ui/button';
import type { StudioList as ListData, PageStatus, PageType } from '@/lib/studio-api';
import { useStudioT, type StudioKey } from '@/lib/i18n/studio-dict';
import { STATUS_STYLE } from '@/components/studio/status-style';

const STATUSES: PageStatus[] = ['rascunho', 'em_revisao', 'aprovada', 'publicada', 'despublicada'];
const TYPES: PageType[] = ['pagina', 'landing', 'hub', 'servico', 'local', 'guia', 'comparativo'];
const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm';

export interface ListFilter { status: string; type: string; q: string }

/** Lista de páginas do Estúdio: estado, tipo, nota de qualidade, nota de "cara de IA", pendências e versão. Cabe em 400 px (cartões, sem tabela larga). */
export function StudioList({ data, filter, onFilter, onOpen }: { data: ListData; filter: ListFilter; onFilter: (f: ListFilter) => void; onOpen: (id: string) => void }) {
  const { t, n } = useStudioT();
  const label = (k: string) => t(k as StudioKey);
  return (
    <section aria-labelledby="st-list" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="st-list" className="text-lg font-semibold">{t('tab.list')} <span className="text-sm font-normal text-muted-foreground">({t('list.counts', { n: n(data.total) })})</span></h2>
      <div className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="sl-status" className="block text-xs text-muted-foreground">{t('list.filterStatus')}</label>
          <select id="sl-status" className={SELECT} value={filter.status} onChange={(e) => onFilter({ ...filter, status: e.target.value })}><option value="">{t('list.all')}</option>{STATUSES.map((s) => <option key={s} value={s}>{label(`status.${s}`)} ({data.counts[s] ?? 0})</option>)}</select></div>
        <div><label htmlFor="sl-type" className="block text-xs text-muted-foreground">{t('list.filterType')}</label>
          <select id="sl-type" className={SELECT} value={filter.type} onChange={(e) => onFilter({ ...filter, type: e.target.value })}><option value="">{t('list.all')}</option>{TYPES.map((x) => <option key={x} value={x}>{label(`type.${x}`)}</option>)}</select></div>
        <div className="min-w-0 flex-1"><label htmlFor="sl-q" className="block text-xs text-muted-foreground">{t('list.search')}</label>
          <input id="sl-q" className={`${SELECT} w-full`} value={filter.q} onChange={(e) => onFilter({ ...filter, q: e.target.value })} /></div>
      </div>
      <p className="text-xs text-muted-foreground" role="note"><strong>{t('list.lotTitle')}:</strong> {t('list.lotText', { used: n(data.options.created_in_24h ?? 0), limit: n(data.options.batch_limit) })}</p>
      {data.pages.length === 0 ? <p className="text-sm text-muted-foreground">{t('list.empty')}</p> : (
        <ul className="space-y-2">
          {data.pages.map((p) => (
            <li key={p.id} className="rounded-lg border bg-background/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{p.title}</p>
                  <p className="break-all text-xs text-muted-foreground">/{p.slug_path}/</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[p.status]}`}>{label(`status.${p.status}`)}{p.live && p.status !== 'publicada' ? ` · ${t('list.live')}` : ''}</span>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{label(`type.${p.type}`)}</span><span>{p.language}</span>{p.place && <span>{p.place}</span>}<span>{t('list.version', { n: p.version })}</span>
                {p.quality_score !== null && <span>{t('list.quality', { n: p.quality_score })}</span>}{p.ai_score !== null && <span>{t('list.ai', { n: p.ai_score })}</span>}
                {p.pending_count > 0 && <span className="text-amber-300">{t('list.pending', { n: p.pending_count })}</span>}
              </p>
              <div className="mt-2"><Button size="sm" variant="outline" onClick={() => onOpen(p.id)}>{t('list.open')}</Button></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
