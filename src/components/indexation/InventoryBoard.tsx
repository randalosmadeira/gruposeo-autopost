import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PROBLEM_KEYS, type InventoryPage } from '@/lib/indexation-api';
import { useT } from '@/lib/i18n/core';
import type { Key } from '@/lib/i18n/indexation-dict';

export interface InventoryFilter { host: string; state: string; problem: string; q: string; page: number }
const SELECT = 'h-9 max-w-full rounded-md border bg-background px-2 text-sm';
const STATES = ['indexada', 'nao_indexada', 'desconhecido', 'erro', 'fora_do_escopo'] as const;

/** Inventário filtrável. Cada linha é um cartão (sem tabela larga): nada força rolagem horizontal no celular. */
export function InventoryBoard({ page, loading, filter, hosts, onFilter }: { page: InventoryPage | undefined; loading: boolean; filter: InventoryFilter; hosts: string[]; onFilter: (f: InventoryFilter) => void }) {
  const { t, n } = useT();
  const [q, setQ] = useState(filter.q);
  const set = (p: Partial<InventoryFilter>) => onFilter({ ...filter, page: 0, ...p });
  const last = page ? Math.max(0, Math.ceil(page.total / page.page_size) - 1) : 0;
  return (
    <section aria-labelledby="ix-inv" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ix-inv" className="text-lg font-semibold">{t('inv.title')}</h2>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q }); }}>
        <div><label htmlFor="inv-host" className="block text-xs text-muted-foreground">{t('inv.site')}</label>
          <select id="inv-host" className={SELECT} value={filter.host} onChange={(e) => set({ host: e.target.value })}><option value="">{t('inv.all')}</option>{hosts.map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
        <div><label htmlFor="inv-state" className="block text-xs text-muted-foreground">{t('inv.state')}</label>
          <select id="inv-state" className={SELECT} value={filter.state} onChange={(e) => set({ state: e.target.value })}><option value="">{t('inv.all')}</option>{STATES.map((s) => <option key={s} value={s}>{t(`st.${s}` as Key)}</option>)}<option value="enviada">{t('inv.sentOnly')}</option></select></div>
        <div><label htmlFor="inv-problem" className="block text-xs text-muted-foreground">{t('inv.problem')}</label>
          <select id="inv-problem" className={SELECT} value={filter.problem} onChange={(e) => set({ problem: e.target.value })}><option value="">{t('inv.any')}</option><option value="qualquer">{t('inv.anyProblem')}</option>{PROBLEM_KEYS.map((k) => <option key={k} value={k}>{t(`pr.${k}` as Key)}</option>)}</select></div>
        <div><label htmlFor="inv-q" className="block text-xs text-muted-foreground">{t('inv.search')}</label>
          <input id="inv-q" className={`${SELECT} w-48 max-w-full`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('inv.searchPh')} /></div>
        <Button type="submit" variant="outline" size="sm">{t('inv.filter')}</Button>
      </form>
      {loading && <p aria-busy="true" className="text-sm text-muted-foreground">{t('inv.loading')}</p>}
      {page && page.total === 0 && !loading && <p className="text-sm text-muted-foreground">{t('inv.empty')}</p>}
      {page && page.rows.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">{t('inv.count', { n: n(page.total), page: page.page + 1, pages: last + 1 })}</p>
          <ul className="space-y-2">
            {page.rows.map((r) => (
              <li key={r.id} className="space-y-1 rounded border bg-background/40 p-2 text-sm">
                <a href={r.url} target="_blank" rel="noreferrer noopener" className="break-all font-medium text-primary underline-offset-2 hover:underline">{r.url}</a>
                <p className="text-xs text-muted-foreground">{t('inv.google')}: <strong>{t(`st.${r.google}` as Key)}</strong>{r.google_detail ? ` (${r.google_detail})` : ''} · {r.in_sitemap ? t('inv.inSitemap') : t('inv.outSitemap')} · {t('inv.impr', { n: n(r.impressions) })} · {t('inv.http', { code: r.http_status ?? t('inv.notChecked') })}{r.sent.length ? ` · ${t('inv.sentBy', { engines: r.sent.map((e) => t(`eng.${e}` as Key)).join(', ') })}` : ''}</p>
                {r.problems.length > 0 && <p className="flex flex-wrap gap-1">{r.problems.map((p) => <span key={p} className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">{t(`pr.${p}` as Key)}</span>)}</p>}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page.page <= 0} onClick={() => onFilter({ ...filter, page: page.page - 1 })}>{t('inv.prev')}</Button>
            <Button size="sm" variant="outline" disabled={page.page >= last} onClick={() => onFilter({ ...filter, page: page.page + 1 })}>{t('inv.next')}</Button>
          </div>
        </>
      )}
    </section>
  );
}
