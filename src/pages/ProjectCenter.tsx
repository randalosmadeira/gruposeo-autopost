import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/hooks/useProjects';
import { callLifecycle, lifecycleErrorMessage, type HealthOverview, type HealthState } from '@/lib/project-center-api';
import { ProjectCard } from '@/components/project-center/ProjectCard';
import { ProjectDetailPanel } from '@/components/project-center/ProjectDetailPanel';
import { STATE_ORDER, STATE_STYLE } from '@/components/project-center/state-style';

const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm';

/** Central de Projetos: status e saúde de cada projeto, ciclo de vida seguro (pausar, arquivar, restaurar, excluir) e mapa de conexões. */
export default function ProjectCenter() {
  const { projects, isLoading: loadingProjects } = useProjects({ includeArchived: true });
  const cache = useQueryClient();
  const orgIds = useMemo(() => [...new Set(projects.map((p) => p.organization_id).filter((v): v is string => !!v))], [projects]);
  const [orgChoice, setOrgChoice] = useState('');
  const orgId = orgIds.includes(orgChoice) ? orgChoice : orgIds[0] || '';
  const [filter, setFilter] = useState<HealthState | 'todos'>('todos');
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery<HealthOverview>({ queryKey: ['project-center', 'overview', orgId], queryFn: () => callLifecycle<HealthOverview>('health_overview', { organizationId: orgId }), enabled: !!orgId, retry: false, refetchOnWindowFocus: false });
  const data = q.data;
  const list = useMemo(() => (data?.projects || []).filter((p) => (filter === 'todos' ? p.state !== 'arquivado' : p.state === filter)), [data, filter]);
  const refresh = () => { void cache.invalidateQueries({ queryKey: ['project-center'] }); };

  const shell = 'mx-auto w-full max-w-7xl space-y-4 px-4 py-5 pb-32 sm:px-6 md:pb-10 lg:px-8';
  if (loadingProjects) return <div className={shell} aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /></div>;
  if (!orgId) return <div className={shell}><h1 className="text-2xl font-bold">Central de Projetos</h1><p className="text-muted-foreground">Ainda não há projetos. Crie um projeto para acompanhar a saúde dele aqui.</p></div>;

  return (
    <div className={shell}>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary">Central de Projetos</p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Como estão os seus projetos?</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Saúde de cada projeto com a fonte e a data de cada item, sugestões de arquivamento e o ciclo de vida seguro: pausar, arquivar, restaurar e, só no fim, excluir definitivamente (com resumo, exportação e confirmação). O sistema sugere; você decide. Onde não há dado, aparece "sem dados".</p>
        <div className="flex flex-wrap items-end gap-3">
          {orgIds.length > 1 && <div><label htmlFor="pc-org" className="block text-xs text-muted-foreground">Organização</label><select id="pc-org" className={SELECT} value={orgId} onChange={(e) => { setOrgChoice(e.target.value); setSelected(null); }}>{orgIds.map((id, i) => <option key={id} value={id}>Organização {i + 1} ({projects.filter((p) => p.organization_id === id).length} projetos)</option>)}</select></div>}
          <Button variant="outline" disabled={q.isFetching} onClick={refresh}><RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? 'animate-spin' : ''}`} aria-hidden />Atualizar</Button>
        </div>
      </header>

      {q.isError && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{lifecycleErrorMessage(q.error)} <Button size="sm" variant="outline" className="ml-2" onClick={() => q.refetch()}>Tentar de novo</Button></p>}
      {q.isLoading && <div aria-busy="true"><Skeleton className="h-48 w-full" /></div>}

      {data && (
        <>
          <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={filter === 'todos'} onClick={() => setFilter('todos')} className={`rounded-full border px-3 py-1 text-sm ${filter === 'todos' ? 'border-primary bg-primary/10' : ''}`}>Todos ({data.projects.filter((p) => p.state !== 'arquivado').length})</button>
            {STATE_ORDER.map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${filter === s ? 'border-primary bg-primary/10' : ''}`}>
                <span className={`h-2 w-2 rounded-full ${STATE_STYLE[s].dot}`} aria-hidden />{STATE_STYLE[s].label} ({data.totals[s]})
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-labelledby="pc-list" className="min-w-0 space-y-3">
              <h2 id="pc-list" className="sr-only">Projetos</h2>
              {list.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum projeto neste filtro.</p> : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {list.map((h) => <ProjectCard key={h.project_id} health={h} selected={selected === h.project_id} onSelect={() => setSelected(h.project_id)} />)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Versão atual do plugin do WordPress: {data.plugin_version}. Painel calculado em {new Date(data.generated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.</p>
            </section>
            <section aria-label="Detalhe do projeto" className="min-w-0">
              {selected ? (
                <ProjectDetailPanel key={selected} projectId={selected} canManage={data.can_manage} canDelete={data.can_delete}
                  onChanged={refresh} onDeleted={() => { setSelected(null); refresh(); }} />
              ) : <p className="rounded-xl border bg-card/40 p-4 text-sm text-muted-foreground">Escolha um projeto para ver os itens de saúde, o mapa de conexões, a linha do tempo e as ações.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
