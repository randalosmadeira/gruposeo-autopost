import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { callOverview, type OverviewData } from '@/lib/overview-api';

const n = (v: number | null | undefined) => (v === null || v === undefined ? 'sem dados' : v.toLocaleString('pt-BR'));

/** Resumo de resultados reais do projeto na Visão Geral: Google, visitas, contatos e os 3 principais pontos de atenção. */
export function TrafficSummary() {
  const { projects } = useProjects();
  const { selected } = usePreferredProject(projects || []);
  const q = useQuery<OverviewData>({ queryKey: ['site-overview', selected, 28], queryFn: () => callOverview<OverviewData>('overview', { projectId: selected, days: 28 }), enabled: !!selected, retry: false, refetchOnWindowFocus: false, staleTime: 5 * 60_000 });
  if (!selected) return null;
  const d = q.data; const k = d?.kpis;
  return (
    <Card className="border-0 shadow-card" aria-labelledby="traffic-summary-title">
      <CardHeader className="pb-3">
        <CardTitle id="traffic-summary-title" className="flex flex-wrap items-center justify-between gap-2 text-lg">
          <span>Resultados de {d?.project.name || 'seu projeto'} (28 dias)</span>
          <Link to="/estrutura" className="text-sm font-normal text-primary underline-offset-2 hover:underline">Ver estrutura do domínio e detalhes</Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading && <Skeleton className="h-20 w-full" />}
        {q.isError && <p role="note" className="text-sm text-muted-foreground">Não consegui carregar os resultados agora.</p>}
        {k && (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resultados do projeto">
            <li className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Cliques no Google</p><p className="text-xl font-bold tabular-nums">{n(k.gsc?.clicks.value)}</p><p className="text-xs text-muted-foreground">{n(k.gsc?.impressions.value)} impressões</p></li>
            <li className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Posição média no Google</p><p className="text-xl font-bold tabular-nums">{k.gsc?.position.value === null || k.gsc === null ? 'sem dados' : k.gsc.position.value?.toLocaleString('pt-BR')}</p><p className="text-xs text-muted-foreground">quanto menor, melhor</p></li>
            <li className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Visitas ao site (GA4)</p><p className="text-xl font-bold tabular-nums">{n(k.ga4?.sessions.value)}</p><p className="text-xs text-muted-foreground">{n(k.ga4?.ai_sessions.value)} vindas de IA</p></li>
            <li className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Cliques de contato</p><p className="text-xl font-bold tabular-nums">{k.cta.total > 0 ? n(k.cta.total) : 'não medido'}</p><p className="text-xs text-muted-foreground">WhatsApp, telefone, e-mail, formulário</p></li>
          </ul>
        )}
        {d && d.diagnostics.filter((x) => x.level === 'atencao').slice(0, 3).map((x) => <p key={x.key} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-100">{x.text}</p>)}
      </CardContent>
    </Card>
  );
}
