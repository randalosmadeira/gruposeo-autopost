import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { radar, radarErrorMessage, usd, type Overview } from '@/lib/radar-api';
import { LocaleProvider } from '@/lib/i18n';
import { LOCALES, LOCALE_LABEL, useT, type Locale } from '@/lib/i18n/core';
import { FocusPanel } from '@/components/radar/FocusPanel';
import { CoveragePanel } from '@/components/radar/CoveragePanel';
import { CompetitorsPanel } from '@/components/radar/CompetitorsPanel';
import { AttackPanel, LandscapePanel, OrphansPanel, ScoreboardPanel } from '@/components/radar/InsightPanels';
import { Chip, Notice, SELECT, useRT } from '@/components/radar/ui';
import { ProjectTimeline } from '@/components/project-events/ProjectTimeline';

/** Radar de mercado (global: qualquer segmento, idioma ou país): focos, território resolvido sozinho, concorrência completa (sites, páginas, mapas, redes, vídeo), placar estimado, onde atacar e pontas soltas. */
export default function Radar() {
  return <LocaleProvider><RadarScreen /></LocaleProvider>;
}

function RadarScreen() {
  const { t, n } = useRT();
  const { locale, setLocale } = useT();
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const [tab, setTab] = useState('focos');
  const q = useQuery<Overview>({ queryKey: ['radar', selected], queryFn: () => radar.overview(selected), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  const refresh = async () => { await cache.invalidateQueries({ queryKey: ['radar'] }); };

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">{t('page.kicker')}</h1><p className="text-muted-foreground">{t('page.noProjects')}</p></div>;
  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">{t('page.kicker')}</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{t('page.h1')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('page.intro')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="rd-project" className="block text-xs text-muted-foreground">{t('page.project')}</label>
            <select id="rd-project" className={`${SELECT} mt-1`} value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </div>
          <div>
            <label htmlFor="rd-lang" className="block text-xs text-muted-foreground">{t('page.language')}</label>
            <select id="rd-lang" className={`${SELECT} mt-1`} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}</select>
          </div>
          {data && (
            <div className="flex flex-wrap gap-2" aria-label={t('cost.title')}>
              <Chip tone="info">{t('cost.radarToday')}: {usd(data.cost.radar_today_micros)}</Chip>
              <Chip tone="info">{t('cost.dayLeft')}: {data.cost.day ? usd(data.cost.day.remaining_micros) : t('cost.unknown')}</Chip>
              <Chip tone={data.orphans.zero ? 'ok' : 'warn'}>{data.orphans.zero ? t('orph.zeroShort') : t('orph.totalShort', { n: n(data.orphans.total) })}</Chip>
            </div>
          )}
        </div>
      </header>

      <aside aria-label={t('honest.title')} className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
        <p className="font-medium">{t('honest.title')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
          <li>{t('honest.score')}</li>
          <li>{t('honest.social')}</li>
          <li>{t('honest.coverage')}</li>
          <li>{t('honest.backlinks')}</li>
          {data && !data.youtube.available && <li>{data.youtube.message}</li>}
          {data?.limits.overpass && <li>{data.limits.overpass}</li>}
          {data?.limits.osm_attribution && <li>{data.limits.osm_attribution}</li>}
        </ul>
      </aside>

      {q.isError && <Notice kind="error">{radarErrorMessage(q.error)}</Notice>}
      {q.isLoading && <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>}

      {data && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="focos">{t('tab.focus')}</TabsTrigger>
            <TabsTrigger value="cobertura">{t('tab.coverage')}</TabsTrigger>
            <TabsTrigger value="concorrentes">{t('tab.competitors')}</TabsTrigger>
            <TabsTrigger value="placar">{t('tab.score')}</TabsTrigger>
            <TabsTrigger value="atacar">{t('tab.attack')}</TabsTrigger>
            <TabsTrigger value="retrato">{t('tab.landscape')}</TabsTrigger>
            <TabsTrigger value="pontas">{t('tab.orphans')}</TabsTrigger>
            <TabsTrigger value="linha">{t('tab.timeline')}</TabsTrigger>
          </TabsList>
          <TabsContent value="focos"><FocusPanel projectId={selected} data={data} onChanged={refresh} /></TabsContent>
          <TabsContent value="cobertura"><CoveragePanel projectId={selected} data={data} onChanged={refresh} /></TabsContent>
          <TabsContent value="concorrentes"><CompetitorsPanel projectId={selected} data={data} onChanged={refresh} /></TabsContent>
          <TabsContent value="placar"><ScoreboardPanel projectId={selected} data={data} /></TabsContent>
          <TabsContent value="atacar"><AttackPanel projectId={selected} /></TabsContent>
          <TabsContent value="retrato"><LandscapePanel projectId={selected} /></TabsContent>
          <TabsContent value="pontas"><OrphansPanel projectId={selected} canEdit={data.can_edit} onChanged={refresh} /></TabsContent>
          <TabsContent value="linha"><ProjectTimeline projectId={selected} limit={30} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
