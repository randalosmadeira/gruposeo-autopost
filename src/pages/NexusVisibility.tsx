import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Gauge, PlugZap, ShieldCheck } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RequestDialog } from '@/components/nexus-providers/RequestDialog';
import { CompetitorsView } from '@/components/nexus-visibility/CompetitorsTab';
import { EnginesView } from '@/components/nexus-visibility/EnginesTab';
import { FilterBar } from '@/components/nexus-visibility/FilterBar';
import { MethodologyView } from '@/components/nexus-visibility/MethodologyTab';
import { OpportunitiesView } from '@/components/nexus-visibility/OpportunitiesTab';
import { OverviewView } from '@/components/nexus-visibility/OverviewTab';
import { QuestionsView } from '@/components/nexus-visibility/QuestionsTab';
import { SourcesView } from '@/components/nexus-visibility/SourcesTab';
import '@/components/nexus-visibility/visibility.css';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationConsole } from '@/hooks/useOrganizationConsole';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { useNexusProviders, useNow } from '@/hooks/useNexusProviders';
import {
  useCompetitorActions, useSeenOptions, useVisibilityCompetitors, useVisibilityHistory, useVisibilityKeywords, useVisibilityMethodology,
  useVisibilityOpportunities, useVisibilityOverview, visibilityKey, useVisibilityQuestions, useVisibilityRealtime, useVisibilityRequest, useVisibilitySources,
} from '@/hooks/useNexusVisibility';
import { resolveViewer } from '@/lib/nexus-providers';
import { QUESTIONS_PAGE_SIZE, normalizeMethodology, parseDays, periodRange } from '@/lib/nexus-visibility';
import type { CompetitorInput, SourceType } from '@/types/nexus-visibility';
import type { RequestKind } from '@/types/nexus-requests';

const TABS = [
  { value: 'painel', label: 'Painel' },
  { value: 'ias', label: 'IAs e buscadores' },
  { value: 'concorrentes', label: 'Concorrentes' },
  { value: 'fontes', label: 'Fontes' },
  { value: 'perguntas', label: 'Perguntas' },
  { value: 'oportunidades', label: 'Oportunidades' },
  { value: 'metodo', label: 'Como calculamos' },
] as const;
type TabValue = (typeof TABS)[number]['value'];
const TAB_VALUES: readonly string[] = TABS.map((t) => t.value);

export default function NexusVisibility() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { projects } = useProjects();
  const consoleQuery = useOrganizationConsole();
  const [params, setParams] = useSearchParams();

  // Estado de tela mínimo: aba, período e filtros vivem na URL (link compartilhável); o resto é cache do servidor.
  const tab: TabValue = TAB_VALUES.includes(params.get('aba') ?? '') ? (params.get('aba') as TabValue) : 'painel';
  const days = parseDays(params.get('dias'));
  const engine = params.get('ia') ?? '';
  const topic = params.get('tema') ?? '';
  const setParam = useCallback((key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  // Projeto padrão: o último escolhido ou o mais pronto (perfil completo + site conectado), não o primeiro da lista.
  const { selected, select: setProjectId } = usePreferredProject(projects);
  const selectedProject = projects.find((p) => p.id === selected);
  const [requestDialog, setRequestDialog] = useState<{ kind: RequestKind; message: string } | null>(null);
  const [sourceType, setSourceType] = useState<SourceType | ''>('');
  const [intent, setIntent] = useState('');
  const [qPage, setQPage] = useState(0);
  const [openQuery, setOpenQuery] = useState<string | null>(null);
  const now = useNow(30_000);

  // Papel de quem consulta: quem decide é o servidor. Sem resposta, tratamos como cliente (opção restritiva).
  const providers = useNexusProviders(selected || undefined);
  const range = useMemo(() => periodRange(days), [days]);
  const overview = useVisibilityOverview(selected || undefined, { ...range, engine, topic });
  const viewer = useMemo(() => resolveViewer(providers.data), [providers.data]);
  const canManage = viewer.can_manage_technical && overview.data?.viewer_can_manage !== false;
  const membership = consoleQuery.data?.membership;
  const orgId = providers.data?.organization_id ?? selectedProject?.organization_id ?? undefined;
  const orgLabel = membership && membership.organization_id === orgId ? membership.organizations.name : orgId ? `…${orgId.slice(-6)}` : '—';
  useVisibilityRealtime(selected || undefined, orgId);

  const sources = useVisibilitySources(selected || undefined, { ...range, type: sourceType || undefined }, { enabled: tab === 'fontes' });
  const competitors = useVisibilityCompetitors(selected || undefined, range, { enabled: tab === 'concorrentes' });
  const questions = useVisibilityQuestions(selected || undefined, { ...range, topic: topic || undefined, intent: intent || undefined, limit: QUESTIONS_PAGE_SIZE, offset: qPage * QUESTIONS_PAGE_SIZE }, { enabled: tab === 'perguntas' });
  // Fonte das opções do filtro "Tema": uma página larga de perguntas, sem filtro (o servidor limita o tamanho).
  const topicSource = useVisibilityQuestions(selected || undefined, { ...range, limit: 100, offset: 0 }, { enabled: !!selected });
  const keywords = useVisibilityKeywords(selected || undefined, range, { enabled: tab === 'perguntas' });
  const history = useVisibilityHistory(selected || undefined, openQuery);
  const opportunities = useVisibilityOpportunities(selected || undefined, range, { enabled: tab === 'oportunidades' });
  const methodology = useVisibilityMethodology(selected || undefined, { enabled: tab === 'metodo' });

  const engines = useSeenOptions(selected || undefined, (overview.data?.by_engine ?? []).map((e) => e.engine));
  const topics = useSeenOptions(selected || undefined, [...(topicSource.data?.questions ?? []), ...(questions.data?.questions ?? [])].map((q) => q.topic ?? '').filter(Boolean));
  const intents = useSeenOptions(selected ? `${selected}:intent` : undefined, [...(topicSource.data?.questions ?? []), ...(questions.data?.questions ?? [])].map((q) => q.intent ?? '').filter(Boolean));

  const competitorActions = useCompetitorActions(selected || undefined);
  const requestAction = useVisibilityRequest(selected || undefined);

  const openRequest = useCallback((kind: RequestKind, message: string) => setRequestDialog({ kind, message }), []);
  const sendRequest = useCallback(async (input: { kind: RequestKind; message: string }) => {
    await requestAction.mutateAsync(input);
    toast({ title: 'Solicitação enviada', description: 'O gestor responde na aba Solicitações da página Motores & APIs.' });
  }, [requestAction, toast]);

  const saveCompetitor = useCallback(async (input: CompetitorInput) => {
    await competitorActions.save.mutateAsync(input);
    toast({ title: input.status === 'ignored' ? 'Sugestão ignorada' : 'Concorrente salvo', description: input.name });
  }, [competitorActions.save, toast]);
  const removeCompetitor = useCallback(async (id: string) => {
    await competitorActions.remove.mutateAsync(id);
    toast({ title: 'Concorrente removido' });
  }, [competitorActions.remove, toast]);

  const changeDays = (d: number) => { setParam('dias', d === 28 ? '' : String(d)); setQPage(0); };
  const changeEngine = (e: string) => { setParam('ia', e); };
  const changeTopic = (t: string) => { setParam('tema', t); setQPage(0); };
  const roleLabel = canManage ? 'Visão gestor' : 'Visão cliente';
  const refreshing = overview.isFetching && !overview.isLoading;

  return (
    <div className="zv mx-auto max-w-6xl space-y-5 p-4 md:p-7">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Gauge className="h-4 w-4" aria-hidden="true" /> NEXUS · Visibilidade
        </p>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Sua visibilidade nas IAs e buscadores</h1>
        <p className="hidden max-w-3xl text-[var(--zv-muted)] sm:block">
          Veja em segundos se a sua marca está sendo mais lembrada pelas IAs, quem aparece ao seu lado e de onde elas tiram as respostas.
          {' '}Números observados, sem promessa de resultado.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="w-full space-y-1.5 sm:w-auto">
          <Label htmlFor="zv-project">Projeto</Label>
          <Select value={selected} onValueChange={(v) => { setProjectId(v); setQPage(0); setOpenQuery(null); setParam('ia', ''); setParam('tema', ''); }}>
            <SelectTrigger id="zv-project" className="w-full sm:w-64"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="pb-2 text-sm text-[var(--zv-muted)]" data-testid="active-scope">
          <span className="hidden sm:inline">Projeto ativo: <strong className="text-[var(--zv-ink)]">{selectedProject?.name ?? '—'}</strong> · Organização: <strong className="text-[var(--zv-ink)]">{orgLabel}</strong></span>
          {providers.data && (
            <span data-testid="viewer-badge" className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold sm:ml-2">
              {canManage ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
              {roleLabel}
            </span>
          )}
        </p>
        {canManage && (
          <Button asChild size="sm" variant="outline" className="mb-0.5 ml-auto"><Link to="/nexus/motores"><PlugZap className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Conexões e coleta</Link></Button>
        )}
      </div>

      {!selected && <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--zv-muted)]">Nenhum projeto encontrado. Crie um projeto para acompanhar a visibilidade.</p>}

      {selected && (
        <>
          {tab !== 'metodo' && <FilterBar
            showEngine={tab === 'painel' || tab === 'ias'} showTopic={tab === 'painel' || tab === 'ias'}
            days={days} onDays={changeDays} engine={engine} engines={engines} onEngine={changeEngine} topic={topic} topics={topics} onTopic={changeTopic}
            generatedAt={overview.data?.generated_at ?? null} now={now} refreshing={refreshing}
            onRefresh={() => { void qc.invalidateQueries({ queryKey: visibilityKey(selected) }); }}
          />}

          <Tabs value={tab} onValueChange={(v) => setParam('aba', v === 'painel' ? '' : v)}>
            <TabsList className="zv-noscrollbar h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-xl bg-[var(--zv-surface-2)] p-1">
              {TABS.map((t) => <TabsTrigger key={t.value} value={t.value} className="shrink-0 rounded-lg px-3.5 py-2">{t.label}</TabsTrigger>)}
            </TabsList>

            <TabsContent value="painel" className="mt-4">
              <OverviewView data={overview.data} loading={overview.isLoading} error={overview.error} onRetry={() => { void overview.refetch(); }} canManage={canManage} onRequest={openRequest} />
            </TabsContent>
            <TabsContent value="ias" className="mt-4">
              <EnginesView data={overview.data} loading={overview.isLoading} error={overview.error} onRetry={() => { void overview.refetch(); }} canManage={canManage} engine={engine} onSelectEngine={changeEngine} onRequest={openRequest} />
            </TabsContent>
            <TabsContent value="concorrentes" className="mt-4">
              <CompetitorsView data={competitors.data} loading={competitors.isLoading} error={competitors.error} onRetry={() => { void competitors.refetch(); }} canManage={canManage}
                onSave={saveCompetitor} onRemove={removeCompetitor} onRequest={openRequest} />
            </TabsContent>
            <TabsContent value="fontes" className="mt-4">
              <SourcesView data={sources.data} loading={sources.isLoading} error={sources.error} onRetry={() => { void sources.refetch(); }} canManage={canManage} type={sourceType} onTypeChange={setSourceType} onRequest={openRequest} />
            </TabsContent>
            <TabsContent value="perguntas" className="mt-4">
              <QuestionsView
                data={questions.data} loading={questions.isLoading} error={questions.error} onRetry={() => { void questions.refetch(); }} canManage={canManage}
                keywords={keywords.data} topic={topic} topics={topics} onTopic={changeTopic} intent={intent} intents={intents} onIntent={(i) => { setIntent(i); setQPage(0); }}
                page={qPage} onPage={setQPage} onOpen={setOpenQuery} onCloseHistory={() => setOpenQuery(null)}
                history={{ query: openQuery, data: history.data, loading: history.isLoading, error: history.error, onRetry: () => { void history.refetch(); } }}
                onRequest={openRequest}
              />
            </TabsContent>
            <TabsContent value="oportunidades" className="mt-4">
              <OpportunitiesView items={opportunities.data} loading={opportunities.isLoading} error={opportunities.error} onRetry={() => { void opportunities.refetch(); }} canManage={canManage} onRequest={openRequest} />
            </TabsContent>
            <TabsContent value="metodo" className="mt-4">
              <MethodologyView method={methodology.data ?? (methodology.isError ? normalizeMethodology(null) : undefined)} loading={methodology.isLoading} error={undefined} onRetry={() => { void methodology.refetch(); }} overview={overview.data} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {!canManage && !!selected && <RequestDialog open={requestDialog} onClose={() => setRequestDialog(null)} onSubmit={sendRequest} />}
    </div>
  );
}
