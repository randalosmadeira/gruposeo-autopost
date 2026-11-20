import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import {
  indexation, indexationErrorMessage, type CheckReport, type GoogleReport, type HygieneReport, type IndexationOverview, type InventoryPage, type KeyReply, type PlanReply, type SubmitReport, type SyncReport,
} from '@/lib/indexation-api';
import { LocaleProvider } from '@/lib/i18n';
import { LOCALES, LOCALE_LABEL, useT, type Locale, type TFn } from '@/lib/i18n/core';
import { CoveragePanel } from '@/components/indexation/CoveragePanel';
import { InventoryBoard, type InventoryFilter } from '@/components/indexation/InventoryBoard';
import { PriorityQueue } from '@/components/indexation/PriorityQueue';
import { HygieneList } from '@/components/indexation/HygieneList';
import { SubmissionsHistory } from '@/components/indexation/SubmissionsHistory';
import { IndexNowKeyPanel } from '@/components/indexation/IndexNowKeyPanel';
import { EnginesPanel } from '@/components/indexation/EnginesPanel';
import { ProjectTimeline } from '@/components/project-events/ProjectTimeline';

type Notice = { kind: 'ok' | 'error'; text: string } | null;
const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';

type Fmt = { t: TFn; n: (v: number) => string };
const syncText = (r: SyncReport, { t, n }: Fmt) => `${t('res.sync', { total: n(r.urls_total), new: n(r.new), removed: n(r.removed_from_sitemap), outside: n(r.outside_sitemap) })}${r.rejected_foreign ? t('res.sync.foreign', { n: n(r.rejected_foreign) }) : ''}${r.warnings.length ? t('res.warn', { text: r.warnings.join(' ') }) : ''}`;
const checkText = (r: CheckReport, { t, n }: Fmt) => `${t('res.check', { n: n(r.checked) })}${r.failed ? t('res.check.failed', { n: n(r.failed) }) : ''}${Object.keys(r.problems).length ? t('res.check.problems', { text: Object.values(r.problems).map((p) => `${n(p.count)} (${p.text})`).join(' ') }) : t('res.check.none')}${t('res.check.left', { n: n(r.remaining_unchecked) })}`;
const googleText = (r: GoogleReport, { t, n }: Fmt) => (!r.connected ? r.message || t('conn.none') : `${t('res.google', { n: n(r.checked), indexed: n(r.indexed ?? 0), not: n(r.not_indexed ?? 0) })}${r.outside_scope ? t('res.google.scope', { n: n(r.outside_scope) }) : ''}${r.message ? ` ${r.message}` : ''}`);
const submitText = (engine: string, r: SubmitReport, { t, n }: Fmt) => {
  if (r.connected === false) return r.message || t('conn.none');
  const pend = (r.hosts || []).filter((h) => h.pending > 0 && h.message).map((h) => `${h.host}: ${h.message}`);
  return `${t('res.submit', { n: n(r.sent), engine })}${r.skipped_unchanged ? t('res.submit.skipped', { n: n(r.skipped_unchanged) }) : ''}${pend.length ? t('res.warn', { text: pend.join(' ') }) : ''}`;
};
const hygieneText = (r: HygieneReport, { t }: Fmt) => t('res.hygiene', { n: r.failing, high: r.by_severity.alta });

/** Indexação avançada (global: qualquer idioma, país ou mecanismo): inventário de URLs, estado nos buscadores, fila "o que indexar primeiro", envio (IndexNow/Bing), consulta ao Google (somente leitura) e higiene. */
export default function Indexation() {
  return <LocaleProvider><IndexationScreen /></LocaleProvider>;
}

function IndexationScreen() {
  const { t, n, date, locale, setLocale } = useT();
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState('cobertura');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [generated, setGenerated] = useState<KeyReply | null>(null);
  const [filter, setFilter] = useState<InventoryFilter>({ host: '', state: '', problem: '', q: '', page: 0 });
  const fmt: Fmt = { t, n };

  const q = useQuery<IndexationOverview>({ queryKey: ['indexation', selected], queryFn: () => indexation.overview(selected), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const planQ = useQuery<PlanReply>({ queryKey: ['indexation-plan', selected], queryFn: () => indexation.plan(selected), enabled: !!selected && tab === 'fila', retry: false, refetchOnWindowFocus: false });
  const listQ = useQuery<InventoryPage>({ queryKey: ['indexation-list', selected, filter], queryFn: () => indexation.list(selected, { host: filter.host || undefined, state: filter.state || undefined, problem: filter.problem || undefined, q: filter.q || undefined, page: filter.page }), enabled: !!selected && tab === 'inventario', retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  const canEdit = !!data?.can_edit;
  const refresh = async () => { for (const k of ['indexation', 'indexation-plan', 'indexation-list', 'project-events']) await cache.invalidateQueries({ queryKey: [k] }); };
  useEffect(() => { setNotice(null); setGenerated(null); setFilter({ host: '', state: '', problem: '', q: '', page: 0 }); }, [selected]);

  async function run<T>(key: string, fn: () => Promise<T>, text: (r: T) => string): Promise<T | null> {
    setBusy(key); setNotice(null);
    try { const r = await fn(); setNotice({ kind: 'ok', text: text(r) }); await refresh(); return r; } catch (e) {
      const msg = indexationErrorMessage(e); setNotice({ kind: 'error', text: msg }); toast({ title: t('common.failed'), description: msg, variant: 'destructive' }); return null;
    } finally { setBusy(null); }
  }
  const P = selected;
  const keySave = async (host: string, key: string) => (await run('key', () => indexation.keySave(P, { host, key }), () => t('res.key.saved', { host }))) !== null;
  const keyGenerate = async (host: string) => { const r = await run('key', () => indexation.keySave(P, { host, generate: true }), () => t('res.key.suggested')); if (r) setGenerated(r); };

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">{t('page.kicker')}</h1><p className="text-muted-foreground">{t('page.noProjects')}</p></div>;
  const spin = (k: string, label: string, busyLabel: string) => (busy === k ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{busyLabel}</> : label);
  const idle = busy === null;
  const empty = (data?.totals.urls ?? 0) === 0;
  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">{t('page.kicker')}</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{t('page.h1')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('page.intro')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="ix-project" className="block text-xs text-muted-foreground">{t('page.project')}</label>
            <select id="ix-project" className={SELECT} value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div>
            <label htmlFor="ix-lang" className="block text-xs text-muted-foreground">{t('page.language')}</label>
            <select id="ix-lang" className={SELECT} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}</select>
          </div>
        </div>
      </header>

      <aside aria-label={t('honest.title')} className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
        <p className="font-medium">{t('honest.title')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
          {(data?.notices?.length && locale === 'pt-BR' ? data.notices : [t('honest.google'), t('honest.indexnow')]).map((x) => <li key={x}>{x}</li>)}
        </ul>
      </aside>

      {q.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{indexationErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>{t('common.retry')}</Button></p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`break-words rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</p>}
      {q.isLoading && <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>}

      {data && (
        <>
          <section aria-labelledby="ix-actions" className="space-y-2 rounded-xl border bg-card/40 p-3 sm:p-5">
            <h2 id="ix-actions" className="text-lg font-semibold">{t('act.title')}</h2>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canEdit || !idle} onClick={() => void run('sync', () => indexation.sync(P), (r) => syncText(r, fmt))}>{spin('sync', t('act.sync'), t('act.sync.busy'))}</Button>
              <Button variant="outline" disabled={!canEdit || !idle || empty} onClick={() => void run('check', () => indexation.check(P), (r) => checkText(r, fmt))}>{spin('check', t('act.check'), t('act.check.busy'))}</Button>
              <Button variant="outline" disabled={!canEdit || !idle || empty} onClick={() => void run('google', () => indexation.google(P, 50, locale === 'pt-BR' ? 'pt-BR' : locale), (r) => googleText(r, fmt))}>{spin('google', t('act.google'), t('act.google.busy'))}</Button>
              <Button variant="outline" disabled={!canEdit || !idle || empty} onClick={() => void run('indexnow', () => indexation.indexnow(P), (r) => submitText('IndexNow', r, fmt))}>{spin('indexnow', t('act.indexnow'), t('act.send.busy'))}</Button>
              <Button variant="outline" disabled={!canEdit || !idle || empty} onClick={() => void run('bing', () => indexation.bing(P), (r) => submitText('Bing', r, fmt))}>{spin('bing', t('act.bing'), t('act.send.busy'))}</Button>
              <Button variant="outline" disabled={!canEdit || !idle} onClick={() => void run('hygiene', () => indexation.hygiene(P), (r) => hygieneText(r, fmt))}>{spin('hygiene', t('act.hygiene'), t('act.hygiene.busy'))}</Button>
            </div>
            {!canEdit && <p role="note" className="text-sm text-muted-foreground">{t('act.readonly')}</p>}
            <p className="text-xs text-muted-foreground">{t('act.polite')}{data.last_synced_at ? ` ${t('act.synced', { date: date(data.last_synced_at) })}` : ''}</p>
          </section>

          {data.blockers.length > 0 && (
            <section aria-labelledby="ix-block" className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <h2 id="ix-block" className="font-semibold">{t('blockers.title')}</h2>
              <ul className="space-y-1">{data.blockers.map((b) => <li key={b.key} className="break-words">{b.text}{b.action ? <span className="text-xs text-muted-foreground"> {b.action}</span> : null}</li>)}</ul>
            </section>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="cobertura">{t('tab.coverage')}</TabsTrigger>
              <TabsTrigger value="fila">{t('tab.queue')}</TabsTrigger>
              <TabsTrigger value="inventario">{t('tab.inventory')}</TabsTrigger>
              <TabsTrigger value="higiene">{t('tab.hygiene')}</TabsTrigger>
              <TabsTrigger value="envios">{t('tab.sends')}</TabsTrigger>
              <TabsTrigger value="buscadores">{t('tab.engines')}</TabsTrigger>
              <TabsTrigger value="linha">{t('tab.timeline')}</TabsTrigger>
            </TabsList>
            <TabsContent value="cobertura"><CoveragePanel data={data} /></TabsContent>
            <TabsContent value="fila"><PriorityQueue plan={planQ.data} />{planQ.isError && <p role="alert" className="mt-2 text-sm text-red-300">{indexationErrorMessage(planQ.error)}</p>}</TabsContent>
            <TabsContent value="inventario"><InventoryBoard page={listQ.data} loading={listQ.isFetching} filter={filter} hosts={[...new Set(data.coverage.by_host.map((b) => b.key))]} onFilter={setFilter} /></TabsContent>
            <TabsContent value="higiene"><HygieneList rows={data.hygiene} /></TabsContent>
            <TabsContent value="envios" className="space-y-4">
              <section aria-labelledby="ix-conn" className="space-y-1 rounded-xl border bg-card/40 p-3 text-sm sm:p-5">
                <h2 id="ix-conn" className="text-lg font-semibold">{t('conn.title')}</h2>
                <p>{t('conn.google')}: <strong>{data.connections.google.connected ? `${t('conn.connected')}${data.connections.google.property ? ` (${data.connections.google.property})` : ''}` : t('conn.none')}</strong></p>
                <p>{t('conn.bing')}: <strong>{data.connections.bing.connected ? t('conn.connected') : t('conn.none')}</strong></p>
                <p className="text-xs text-muted-foreground">{t('conn.quota', { used: n(data.quota.google.used_24h), limit: n(data.quota.google.limit), state: data.quota.google.verified ? t('conn.quota.verified') : t('conn.quota.unverified') })}</p>
              </section>
              <IndexNowKeyPanel hosts={data.connections.indexnow.hosts} canAdmin={data.can_admin} busy={busy === 'key'} generated={generated} onGenerate={(h) => void keyGenerate(h)} onSave={keySave} />
              <SubmissionsHistory rows={data.submissions} />
            </TabsContent>
            <TabsContent value="buscadores"><EnginesPanel engines={data.engines} /></TabsContent>
            <TabsContent value="linha"><ProjectTimeline projectId={selected} limit={30} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
