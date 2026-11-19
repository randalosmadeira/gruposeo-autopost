import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { callOverview, overviewErrorMessage, type OverviewData, type RefreshResult } from '@/lib/overview-api';
import { Diagnostics, DomainTree, KpiGrid } from '@/components/overview/OverviewBoard';

const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';
const n = (v: number | null) => (v === null ? 'sem dados' : v.toLocaleString('pt-BR'));
const path = (u: string) => u.replace(/^https?:\/\//, '');

/** Estrutura do negócio: resultados reais (Google, GA4, contatos) e a árvore do domínio com sitemaps e subdomínios. */
export default function Structure() {
  const { projects, isLoading: loadingProjects } = useProjects();
  const { selected, select } = usePreferredProject(projects || []);
  const cache = useQueryClient();
  const { toast } = useToast();
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const key = ['site-overview', selected, days];
  const q = useQuery<OverviewData>({ queryKey: key, queryFn: () => callOverview<OverviewData>('overview', { projectId: selected, days }), enabled: !!selected, retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  useEffect(() => { setNotice(null); }, [selected]);

  async function refresh() {
    setBusy(true); setNotice(null);
    try {
      const r = await callOverview<RefreshResult>('refresh_structure', { projectId: selected });
      const parts = r.hosts.map((h) => `${h.host}: ${h.ok ? (h.sitemap_urls === null ? 'sem sitemap' : `${h.sitemap_urls.toLocaleString('pt-BR')} URLs`) : 'não consegui ler'}`);
      const text = `Mapa atualizado (${parts.join('; ')}).`;
      setNotice({ kind: 'ok', text }); toast({ title: 'Mapa do domínio atualizado' });
      await cache.invalidateQueries({ queryKey: ['site-overview', selected] });
    } catch (e) {
      const text = overviewErrorMessage(e);
      setNotice({ kind: 'error', text }); toast({ title: 'Não consegui atualizar', description: text, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects && !projects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!projects?.length) return <div className={shell}><h1 className="text-2xl font-bold">Estrutura do negócio</h1><p className="text-muted-foreground">Crie um projeto para ver os resultados e a estrutura do domínio dele.</p></div>;
  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">Estrutura do negócio</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">O que o seu domínio está entregando?</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Cliques, impressões e posição do Google, visitas do site, cliques de contato e a árvore do domínio (site, subdomínios e seções com o sitemap ao lado). Cada número diz a fonte e o período; onde não há dado, aparece "sem dados", nunca zero inventado.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="ov-project" className="block text-xs text-muted-foreground">Projeto</label>
            <select id="ov-project" className={SELECT} value={selected} onChange={(e) => select(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label htmlFor="ov-days" className="block text-xs text-muted-foreground">Período</label>
            <select id="ov-days" className={SELECT} value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 28 | 90)}><option value={7}>Últimos 7 dias</option><option value={28}>Últimos 28 dias</option><option value={90}>Últimos 90 dias</option></select></div>
          <Button variant="outline" disabled={!data?.can_refresh || busy} onClick={() => void refresh()}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Lendo os sitemaps…</> : <><RefreshCw className="mr-2 h-4 w-4" aria-hidden />Atualizar mapa do domínio</>}</Button>
          {data && !data.can_refresh && <p role="note" className="text-sm text-muted-foreground">Seu papel permite ver, mas não atualizar o mapa.</p>}
        </div>
      </header>

      {q.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{overviewErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>Tentar de novo</Button></p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded border p-3 text-sm ${notice.kind === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'}`}>{notice.text}</p>}
      {q.isLoading && <div aria-busy="true"><Skeleton className="h-64 w-full" /></div>}

      {data && (
        <>
          <Diagnostics items={data.diagnostics} />
          <KpiGrid data={data} />
          <section aria-labelledby="tree-title" className="space-y-3">
            <h2 id="tree-title" className="text-lg font-semibold">Árvore do domínio</h2>
            <DomainTree tree={data.tree} />
            <p className="text-xs text-muted-foreground">{data.map_updated_at ? `Mapa do domínio atualizado em ${new Date(data.map_updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.` : 'O mapa do domínio ainda não foi lido: clique em "Atualizar mapa do domínio".'}</p>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="top-pages" className="rounded-xl border bg-card/40 p-3 sm:p-4">
              <h2 id="top-pages" className="text-base font-semibold">Páginas com mais cliques no Google</h2>
              {data.top_pages.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sem dados.</p> : (
                <ul className="mt-2 space-y-1.5 text-sm">{data.top_pages.map((p) => <li key={p.page} className="flex justify-between gap-3"><span className="break-all">{path(p.page)}</span><span className="shrink-0 tabular-nums text-muted-foreground">{n(p.clicks)} cliques · {n(p.impressions)} imp.</span></li>)}</ul>
              )}
            </section>
            <section aria-labelledby="top-queries" className="rounded-xl border bg-card/40 p-3 sm:p-4">
              <h2 id="top-queries" className="text-base font-semibold">Buscas que mais mostram o site</h2>
              {data.top_queries.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sem dados.</p> : (
                <ul className="mt-2 space-y-1.5 text-sm">{data.top_queries.map((p) => <li key={p.query} className="flex justify-between gap-3"><span className="break-words">{p.query}</span><span className="shrink-0 tabular-nums text-muted-foreground">{n(p.impressions)} imp. · pos. {p.position === null ? '—' : p.position.toLocaleString('pt-BR')}</span></li>)}</ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Busca com muita impressão e nenhum clique pode não ter relação com o negócio. Confira antes de investir nela.</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
