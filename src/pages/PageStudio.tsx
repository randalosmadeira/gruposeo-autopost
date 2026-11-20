import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { studio, studioErrorMessage, type BriefInput, type PageDetail, type StaticPackage, type StudioList as StudioListData } from '@/lib/studio-api';
import { LocaleProvider } from '@/lib/i18n';
import { LOCALES, LOCALE_LABEL, type Locale } from '@/lib/i18n/core';
import { useStudioT, type StudioKey } from '@/lib/i18n/studio-dict';
import { StudioList, type ListFilter } from '@/components/studio/StudioList';
import { STATUS_STYLE } from '@/components/studio/status-style';
import { BriefForm } from '@/components/studio/BriefForm';
import { BriefPanel } from '@/components/studio/BriefPanel';
import { EditorPane, type EditorFields } from '@/components/studio/EditorPane';
import { AiDetectorPanel, GatesPanel, ImagesPanel, LinksPanel } from '@/components/studio/QualityPanels';
import { PublishPanel } from '@/components/studio/PublishPanel';
import { ProjectTimeline } from '@/components/project-events/ProjectTimeline';

type Notice = { kind: 'ok' | 'error'; text: string } | null;
const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
const CAPS: Array<[keyof StudioListData['capabilities'], StudioKey]> = [['ai', 'cap.ai'], ['images', 'cap.images'], ['plugin', 'cap.plugin'], ['radar', 'cap.radar'], ['serp_local', 'cap.serp'], ['observatory', 'cap.obs'], ['taxonomy', 'cap.tax'], ['focuses', 'cap.focus']];

/** Estúdio de Páginas (global: qualquer idioma, país ou segmento): briefing de superação, rascunho por etapas, portões técnicos, detector anti-IA, plano de links, imagens, aprovação humana e publicação. */
export default function PageStudio() {
  return <LocaleProvider><StudioScreen /></LocaleProvider>;
}

function StudioScreen() {
  const { t, locale, n, setLocale } = useStudioT();
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState('lista');
  const [pageId, setPageId] = useState<string | null>(null);
  const [dtab, setDtab] = useState('brief');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [filter, setFilter] = useState<ListFilter>({ status: '', type: '', q: '' });
  const [pkg, setPkg] = useState<StaticPackage | null>(null);

  const listQ = useQuery<StudioListData>({ queryKey: ['studio', selected, filter], queryFn: () => studio.list(selected, { status: filter.status || undefined, type: filter.type || undefined, q: filter.q || undefined }), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const detailQ = useQuery<PageDetail>({ queryKey: ['studio-detail', selected, pageId], queryFn: () => studio.detail(selected, pageId as string), enabled: !!selected && !!pageId, retry: false, refetchOnWindowFocus: false });
  useEffect(() => { setNotice(null); setPageId(null); setPkg(null); setTab('lista'); }, [selected]);
  const refresh = async () => { for (const k of ['studio', 'studio-detail', 'project-events']) await cache.invalidateQueries({ queryKey: [k] }); };
  const P = selected;

  async function run<T>(key: string, fn: () => Promise<T>, text: (r: T) => string): Promise<T | null> {
    setBusy(key); setNotice(null);
    try { const r = await fn(); setNotice({ kind: 'ok', text: text(r) }); await refresh(); return r; } catch (e) {
      const msg = studioErrorMessage(e); setNotice({ kind: 'error', text: msg }); toast({ title: t('common.failed'), description: msg, variant: 'destructive' }); return null;
    } finally { setBusy(null); }
  }
  const open = (id: string, to = 'brief') => { setPageId(id); setDtab(to); setPkg(null); setNotice(null); };

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">{t('page.kicker')}</h1><p className="text-muted-foreground">{t('page.noProjects')}</p></div>;
  const data = listQ.data;
  const d = detailQ.data;

  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">{t('page.kicker')}</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{t('page.h1')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('page.intro')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="st-project" className="block text-xs text-muted-foreground">{t('page.project')}</label>
            <select id="st-project" className={SELECT} value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label htmlFor="st-lang" className="block text-xs text-muted-foreground">{t('page.language')}</label>
            <select id="st-lang" className={SELECT} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}</select></div>
        </div>
      </header>

      <aside aria-label={t('honest.title')} className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
        <p className="font-medium">{t('honest.title')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs"><li>{t('honest.noinvent')}</li><li>{t('honest.approval')}</li><li>{t('honest.cost')}</li></ul>
      </aside>

      {listQ.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{studioErrorMessage(listQ.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => listQ.refetch()}>{t('common.retry')}</Button></p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`break-words rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'}`}>{notice.text}</p>}
      {listQ.isLoading && <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>}

      {data && !pageId && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1"><TabsTrigger value="lista">{t('tab.list')}</TabsTrigger><TabsTrigger value="nova">{t('tab.new')}</TabsTrigger></TabsList>
          <TabsContent value="lista" className="space-y-4">
            <StudioList data={data} filter={filter} onFilter={setFilter} onOpen={(id) => open(id)} />
            {data.profile_gaps.length > 0 && (
              <section aria-labelledby="st-gaps" className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm sm:p-5"><h2 id="st-gaps" className="font-semibold">{t('gaps.title')}</h2><p className="text-xs text-muted-foreground">{t('gaps.help')}</p>
                <ul className="list-disc space-y-1 pl-5">{data.profile_gaps.map((g) => <li key={g.key} className="break-words"><strong>{g.label}</strong> <span className="text-xs text-muted-foreground">({g.where})</span></li>)}</ul></section>
            )}
            <section aria-labelledby="st-caps" className="space-y-1 rounded-xl border bg-card/40 p-3 text-sm sm:p-5"><h2 id="st-caps" className="font-semibold">{t('cap.title')}</h2>
              <ul className="flex flex-wrap gap-2 text-xs">{CAPS.map(([k, label]) => <li key={k} className={`rounded border px-2 py-0.5 ${data.capabilities[k] ? 'border-emerald-500/50' : 'border-slate-500/40 text-muted-foreground'}`}>{t(label)}: {data.capabilities[k] ? t('cap.on') : t('cap.off')}</li>)}</ul></section>
            <ProjectTimeline projectId={selected} module="estudio" limit={15} />
          </TabsContent>
          <TabsContent value="nova">
            {data.can_edit ? <BriefForm busy={busy === 'brief'} defaultLanguage={locale === 'pt-BR' ? 'pt-BR' : locale} onSubmit={async (b: BriefInput) => { const r = await run('brief', () => studio.brief(P, b), () => t('new.created')); if (r) { open(r.page.id, 'brief'); setTab('lista'); } }} /> : <p className="text-sm text-muted-foreground">{t('ed.readonly')}</p>}
          </TabsContent>
        </Tabs>
      )}

      {pageId && detailQ.isLoading && <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>}
      {pageId && detailQ.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{studioErrorMessage(detailQ.error)}</p>}
      {pageId && d && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => { setPageId(null); setPkg(null); }}>{t('common.back')}</Button>
            <h2 className="min-w-0 flex-1 break-words text-lg font-semibold">{d.page.title || d.page.query}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[d.page.status]}`}>{t(`status.${d.page.status}` as StudioKey)} · v{d.page.version}</span>
          </div>
          <p className="break-all text-xs text-muted-foreground">/{d.page.slug_path}/ · {d.page.language} · {n(d.quality.score)}/100</p>
          <Tabs value={dtab} onValueChange={setDtab}>
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              {[['brief', 'tab.brief'], ['editor', 'tab.editor'], ['qualidade', 'tab.quality'], ['ia', 'tab.ai'], ['links', 'tab.links'], ['imagens', 'tab.images'], ['publicar', 'tab.publish']].map(([v, k]) => <TabsTrigger key={v} value={v}>{t(k as StudioKey)}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="brief"><BriefPanel brief={d.brief} /></TabsContent>
            <TabsContent value="editor"><EditorPane d={d} busy={busy}
              onSave={(f: EditorFields) => void run('revise', () => studio.revise(P, d.page.id, { title: f.title, metaDescription: f.metaDescription, h1: f.h1, slugPath: f.slugPath, bodyHtml: f.bodyHtml }), (r) => `${t('ed.saved', { n: r.page.version })}${r.redirect_needed ? ` ${t('ed.redirect', { from: r.redirect_needed.from, to: r.redirect_needed.to })}` : ''}`)}
              onGenerate={(restart) => void run('generate', () => studio.generate(P, d.page.id, restart), (r) => (r.pipeline.stopped ? t('ed.stopped', { msg: r.pipeline.stopped.message }) : r.pipeline.ai_available ? t('ed.steps', { n: r.pipeline.ai_used, cost: `US$ ${(r.pipeline.cost_usd_micros / 1_000_000).toFixed(3)}` }) : t('ed.noai')))}
              onCheck={(verify) => void run('check', () => studio.check(P, d.page.id, verify), (r) => t('q.score', { n: r.quality.score }))} /></TabsContent>
            <TabsContent value="qualidade"><GatesPanel q={d.quality} /></TabsContent>
            <TabsContent value="ia"><AiDetectorPanel d={d} /></TabsContent>
            <TabsContent value="links"><LinksPanel d={d} busy={busy} onPlan={(verify) => void run('links', () => studio.planLinks(P, d.page.id, verify), (r) => t('ln.missing', { i: r.missing.internal, e: r.missing.external }))} /></TabsContent>
            <TabsContent value="imagens"><ImagesPanel d={d} busy={busy} canGenerate={!!data?.capabilities.images} onRun={(o) => void run('images', () => studio.images(P, d.page.id, o), (r) => t('im.cost', { c: `US$ ${(r.cost_usd_micros / 1_000_000).toFixed(3)}` }))} /></TabsContent>
            <TabsContent value="publicar"><PublishPanel d={d} busy={busy} pkg={pkg}
              onStep={(s) => void run('approve', () => studio.approve(P, d.page.id, s), () => t('pub.done'))}
              onPublish={async (o) => { const r = await run('publish', () => studio.publish(P, d.page.id, o), (x) => (x.published ? t('pub.published') : x.draft_sent ? t('pub.sentDraft') : t('pub.pkgDone'))); if (r?.package) setPkg(r.package); }}
              onUnpublish={(c) => void run('unpublish', () => studio.unpublish(P, d.page.id, { confirmRemoved: c }), () => t('pub.done'))} /></TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

