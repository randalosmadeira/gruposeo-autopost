import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Eye, PlugZap, RefreshCw, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnalyticsTab } from '@/components/nexus-providers/AnalyticsTab';
import { AreaPerformanceTab } from '@/components/nexus-providers/AreaPerformanceTab';
import { AuditView } from '@/components/nexus-providers/AuditTab';
import { ClientProviderCard } from '@/components/nexus-providers/ClientProviderCard';
import { ClientStatusStrip } from '@/components/nexus-providers/ClientStatusStrip';
import { ConnectDialog } from '@/components/nexus-providers/ConnectDialog';
import { DocsSheet } from '@/components/nexus-providers/DocsSheet';
import { ExecutionPanel } from '@/components/nexus-providers/ExecutionPanel';
import { GuidedActivationCard } from '@/components/nexus-providers/GuidedActivationCard';
import { HealthStrip } from '@/components/nexus-providers/HealthStrip';
import { ProjectIntegrationsCard } from '@/components/nexus-providers/ProjectIntegrationsCard';
import { ProviderCard } from '@/components/nexus-providers/ProviderCard';
import { RequestDialog } from '@/components/nexus-providers/RequestDialog';
import { ManagerInboxView, MemberRequestsView } from '@/components/nexus-providers/RequestsTab';
import { SearchTrafficTab } from '@/components/nexus-providers/SearchTrafficTab';
import { useToast } from '@/hooks/use-toast';
import { useNexusAudit } from '@/hooks/useNexusAudit';
import { useOrganizationConsole } from '@/hooks/useOrganizationConsole';
import { useGa4Actions, useGa4Summary, useProjectIntegrations } from '@/hooks/useNexusAnalytics';
import { useNexusRequestActions, useNexusRequests, useNexusRequestsRealtime } from '@/hooks/useNexusRequests';
import { useProjects } from '@/hooks/useProjects';
import { usePreferredProject } from '@/hooks/usePreferredProject';
import { SerperPlans } from '@/components/nexus/SerperPlans';
import { useNexusProviderActions, useNexusProviders, useNexusRealtime, useNow, useSearchPerformance } from '@/hooks/useNexusProviders';
import { rangeForDays } from '@/lib/nexus-observatory';
import {
  CATEGORY_ORDER, EMPTY_PROGRAM, REFERENCE_NOTICE, canTriageRequests, categoryLabel, connectedProviderIds, filterByCategory, ga4SyncSummaryText,
  mergeCatalogWithOverview, needsGuidedActivation, normalizeSyncResponse, providerErrorMessage, providerHealthMessage, providerIsConnected, providerName,
  resolveViewer, sanitizeItemForClient, simpleStatusOf, summarizeHealthResults, syncSummaryText,
} from '@/lib/nexus-providers';
import { openRequestsCount, providerRequestMessage } from '@/lib/nexus-requests';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type { ProviderCategory, ProviderId } from '@/types/nexus-providers';
import type { RequestCreateInput, RequestKind } from '@/types/nexus-requests';

type TabValue = 'all' | ProviderCategory | 'analytics' | 'areas' | 'traffic' | 'audit' | 'requests';
const TAB_VALUES: readonly string[] = ['all', ...CATEGORY_ORDER, 'analytics', 'areas', 'traffic', 'audit', 'requests'];
const BLOCKED_TEXT = 'Execução pausada: orçamento zero ou serviços pagos bloqueados. Os dados já observados continuam disponíveis; nenhuma consulta paga é acionada.';

export default function NexusProviders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  const consoleQuery = useOrganizationConsole();

  // Projeto padrão: o último escolhido ou o mais pronto (perfil completo + site conectado), não o primeiro da lista.
  const { selected, select: setProjectId } = usePreferredProject(projects);
  const selectedProject = projects.find((p) => p.id === selected);
  const [tab, setTab] = useState<TabValue>('all');
  const [connectId, setConnectId] = useState<ProviderId | null>(null);
  const [docsId, setDocsId] = useState<ProviderId | null>(null);
  const [testingId, setTestingId] = useState<ProviderId | 'all' | null>(null);
  const [syncText, setSyncText] = useState<string | null>(null);
  const [ga4SyncText, setGa4SyncText] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [requestDialog, setRequestDialog] = useState<{ kind: RequestKind; message: string } | null>(null);

  const query = useNexusProviders(selected || undefined);
  const actions = useNexusProviderActions(selected || undefined);
  const audit = useNexusAudit(selected || undefined);
  const overview = query.data;
  const orgId = overview?.organization_id ?? selectedProject?.organization_id ?? undefined;
  const realtime = useNexusRealtime(selected || undefined, orgId);
  const now = useNow(5000);

  // Papel de quem consulta: quem decide é o servidor (`viewer`). Sem resposta, trata como cliente (opção restritiva).
  const viewer = useMemo(() => resolveViewer(overview), [overview]);
  const canManage = viewer.can_manage_technical;
  const canTriage = canTriageRequests(viewer);

  const rawItems = useMemo(() => mergeCatalogWithOverview(overview), [overview]);
  // Visão cliente: descarta últimos 4 dígitos, detalhe técnico e quota mesmo que o servidor mande.
  const items = useMemo(() => (canManage ? rawItems : rawItems.map(sanitizeItemForClient)), [canManage, rawItems]);
  const connected = useMemo(() => connectedProviderIds(items), [items]);
  // Só para exibir o nome da organização; permissão nunca sai daqui.
  const membership = consoleQuery.data?.membership;
  const orgLabel = membership && membership.organization_id === orgId ? membership.organizations.name : orgId ? `…${orgId.slice(-6)}` : '—';

  const itemById = (id: ProviderId) => items.find((i) => i.id === id);
  const hasSearchCredential = ['gsc', 'bing_webmaster'].some((id) => { const it = itemById(id as ProviderId); return !!it && providerIsConnected(it); });
  const ga4Item = itemById('ga4');
  const ga4Connected = !!ga4Item && providerIsConnected(ga4Item);
  const hasSources = hasSearchCredential || ga4Connected;
  const showGuided = canManage && !!overview && needsGuidedActivation(items);
  // Resumos leves só para saber a última sincronização do cartão de ativação guiada.
  const guidedRange = useMemo(() => rangeForDays(28), []);
  const guidedSearch = useSearchPerformance(selected || undefined, guidedRange.from, guidedRange.to, showGuided && hasSearchCredential);
  const guidedGa4 = useGa4Summary(selected || undefined, guidedRange.from, guidedRange.to, showGuided && ga4Connected);

  // Só o gestor lê/grava os IDs por projeto (o cliente recebe apenas booleanos e não precisa deles).
  const integrations = useProjectIntegrations(selected || undefined, canManage && !!overview);
  const ga4Actions = useGa4Actions(selected || undefined);

  const requestsEnabledId = overview ? selected || undefined : undefined;
  const requests = useNexusRequests(requestsEnabledId);
  const requestActions = useNexusRequestActions(selected || undefined);
  useNexusRequestsRealtime(requestsEnabledId, orgId);
  const openRequests = requests.data ? openRequestsCount(requests.data) : 0;

  const blockedNow = blocked ?? (query.error instanceof NexusBlockedError ? BLOCKED_TEXT : null);
  const openFindings = audit.overview.data
    ? Object.values(audit.overview.data.counts.open).reduce((a, b) => a + b, 0)
    : null;
  // `viewer` da auditoria (quando existir) só pode restringir, nunca ampliar.
  const auditManage = canManage && audit.overview.data?.viewer?.can_manage_technical !== false;

  function fail(e: unknown, title: string) {
    if (e instanceof NexusBlockedError) { setBlocked(e.message); return; }
    toast({ title, description: providerErrorMessage(e), variant: 'destructive' });
  }

  async function runTest(id: ProviderId | undefined, confirmCost: boolean) {
    setTestingId(id ?? 'all');
    try {
      const r = await actions.testProvider.mutateAsync({ ...(id ? { provider: id } : {}), ...(confirmCost ? { confirmCost: true } : {}) });
      if (id) {
        const res = r.results.find((x) => x.provider === id) ?? r.results[0];
        toast({ title: `${providerName(id)}: ${res?.ok ? 'conexão ok' : 'teste não concluído'}`, description: providerHealthMessage(res), variant: res && !res.ok && !res.skipped ? 'destructive' : 'default' });
      } else {
        toast({ title: 'Testes gratuitos concluídos', description: summarizeHealthResults(r.results) });
      }
    } catch (e) { fail(e, 'Não foi possível testar a conexão'); } finally { setTestingId(null); }
  }

  async function runSync(days: number): Promise<string> {
    const r = await actions.syncSearch.mutateAsync({ days, source: 'all' });
    const text = syncSummaryText(normalizeSyncResponse(r));
    setSyncText(text);
    return text;
  }

  async function syncFromUi(days: number) {
    try { await runSync(days); } catch (e) { setSyncText(null); fail(e, 'Não foi possível sincronizar'); }
  }

  async function runGa4Sync(days: number): Promise<string> {
    const r = await ga4Actions.syncGa4.mutateAsync({ days });
    const text = ga4SyncSummaryText(r);
    setGa4SyncText(text);
    return text;
  }

  async function ga4SyncFromUi(days: number) {
    try { await runGa4Sync(days); } catch (e) { setGa4SyncText(null); fail(e, 'Não foi possível sincronizar o Analytics'); }
  }

  async function removeCredential(id: ProviderId) {
    try {
      await actions.removeCredential.mutateAsync(id);
      toast({ title: `Chave removida: ${providerName(id)}`, description: 'A credencial foi apagada do cofre.' });
    } catch (e) { fail(e, 'Não foi possível remover a chave'); }
  }

  async function sendRequest(input: RequestCreateInput): Promise<void> {
    await requestActions.createRequest.mutateAsync(input);
    toast({ title: 'Solicitação enviada', description: 'O gestor responde na aba Solicitações.' });
  }

  function askForProvider(id: ProviderId) {
    const it = itemById(id);
    setRequestDialog({ kind: 'connect_source', message: providerRequestMessage(providerName(id), simpleStatusOf(it?.status ?? 'not_configured')) });
  }

  function openRoute(route: string, tabHint?: string) {
    const [path, hash] = route.split('#');
    const [pathname, search = ''] = path.split('?');
    if (pathname === '/nexus/motores') {
      const t = tabHint ?? new URLSearchParams(search).get('tab');
      if (t && TAB_VALUES.includes(t)) setTab(t as TabValue);
      if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    navigate(route);
  }

  const providerTabs: Array<{ value: 'all' | ProviderCategory; label: string }> = [
    { value: 'all', label: 'Todos' },
    ...CATEGORY_ORDER.map((c) => ({ value: c, label: categoryLabel(c) })),
  ];
  // Na Visão cliente não há abas por categoria: tudo fica em "Motores".
  const activeTab: TabValue = !canManage && (CATEGORY_ORDER as readonly string[]).includes(tab) ? 'all' : tab;
  const requestsLabel = `Solicitações${openRequests ? ` (${openRequests})` : ''}`;
  const roleLabel = canManage ? 'Visão gestor' : 'Visão cliente';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-7">
      <header>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <PlugZap className="h-4 w-4" aria-hidden="true" /> NEXUS · Motores &amp; APIs
        </p>
        <h1 className="mt-2 text-3xl font-bold">{!overview || canManage ? 'Conexões, saúde e custo dos motores' : 'Motores e dados do seu site'}</h1>
        {!overview || canManage ? (
          <p className="mt-2 text-muted-foreground">
            Conecte, teste e acompanhe os provedores de dados de busca e de IA usados pelo Observatório. As credenciais ficam no cofre do servidor e nunca são exibidas de volta.
            Nada aqui promete posição, tráfego ou contratação. {REFERENCE_NOTICE}
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">
            Acompanhe os dados reais do seu site (busca, visitas e tráfego de IA) e peça ajustes ao gestor. Conexões, chaves e configurações técnicas são feitas só pela conta de gerenciamento.
            Nada aqui promete posição, tráfego ou resultado.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prov-project">Projeto</Label>
          <Select value={selected} onValueChange={setProjectId}>
            <SelectTrigger id="prov-project"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="self-end text-sm text-muted-foreground" data-testid="active-scope">
          Projeto ativo: <strong>{selectedProject?.name ?? '—'}</strong> · Organização: <strong>{orgLabel}</strong>
          {overview && (
            <span data-testid="viewer-badge" className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold">
              {canManage ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
              {roleLabel}
            </span>
          )}
        </p>
      </div>

      {blockedNow && (
        <Alert role="status" className="border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Execução bloqueada</AlertTitle>
          <AlertDescription>{blockedNow}</AlertDescription>
        </Alert>
      )}

      {!selected && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhum projeto encontrado. Crie um projeto para conectar os motores.</p>}

      {selected && query.isLoading && (
        <div aria-busy="true" aria-label="Carregando conexões" className="space-y-4">
          <Skeleton className="h-28" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64" />)}</div>
        </div>
      )}

      {selected && query.error && !(query.error instanceof NexusBlockedError) && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar as conexões</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {providerErrorMessage(query.error)}
            <Button size="sm" variant="outline" onClick={() => { void query.refetch(); }}><RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" /> Tentar de novo</Button>
          </AlertDescription>
        </Alert>
      )}

      {overview && (
        <>
          {canManage ? (
            <HealthStrip
              overview={overview} items={items} now={now} updatedAt={query.dataUpdatedAt} realtime={realtime}
              testingAll={testingId === 'all'} onTestAll={() => { void runTest(undefined, false); }}
            />
          ) : (
            <ClientStatusStrip items={items} now={now} />
          )}

          {showGuided && (
            <GuidedActivationCard
              items={items} now={now} canAdmin={canManage} lastSyncedAt={guidedSearch.data?.last_synced_at ?? null}
              testingId={testingId === 'all' ? null : testingId} syncing={actions.syncSearch.isPending} syncText={syncText}
              onConnect={setConnectId} onTest={(id) => { void runTest(id, false); }} onSync={() => { void syncFromUi(7); }}
              ga4LastSyncedAt={guidedGa4.data?.last_synced_at ?? null} ga4Syncing={ga4Actions.syncGa4.isPending} ga4SyncText={ga4SyncText}
              onSyncGa4={() => { void ga4SyncFromUi(28); }} onOpenAnalytics={() => setTab('analytics')}
            />
          )}

          <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList className="h-auto flex-wrap justify-start">
              {canManage
                ? providerTabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)
                : <TabsTrigger value="all">Motores</TabsTrigger>}
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="areas">Desempenho por área</TabsTrigger>
              <TabsTrigger value="traffic">{canManage ? 'Tráfego orgânico (Google Search Console)' : 'Tráfego de busca'}</TabsTrigger>
              <TabsTrigger value="audit">{canManage ? 'Saúde do sistema' : 'Auditoria'}{openFindings ? ` (${openFindings})` : ''}</TabsTrigger>
              <TabsTrigger value="requests">{requestsLabel}</TabsTrigger>
            </TabsList>

            {canManage && providerTabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-4">
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={`Provedores: ${t.label}`}>
                  {filterByCategory(items, t.value).map((item) => (
                    <li key={item.id}>
                      <ProviderCard
                        item={item} now={now} canAdmin={canManage} testing={testingId === item.id}
                        onConnect={setConnectId} onDocs={setDocsId} onRemove={(id) => { void removeCredential(id); }}
                        onTest={(id, o) => { void runTest(id, o.confirmCost); }} onOpenObservatory={() => navigate('/nexus/observatorio')}
                      />
                    </li>
                  ))}
                </ul>
              </TabsContent>
            ))}

            {!canManage && (
              <TabsContent value="all" className="mt-4">
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Motores">
                  {items.map((item) => <li key={item.id}><ClientProviderCard item={item} now={now} onRequest={askForProvider} /></li>)}
                </ul>
              </TabsContent>
            )}

            <TabsContent value="analytics" className="mt-4">
              <AnalyticsTab
                projectId={selected} connected={ga4Connected} now={now} canManage={canManage} syncing={ga4Actions.syncGa4.isPending} syncText={ga4SyncText}
                onSync={() => { void ga4SyncFromUi(28); }} onConnect={() => setConnectId('ga4')}
                onRequest={() => askForProvider('ga4')}
                managerSlot={(
                  <ProjectIntegrationsCard
                    projectName={selectedProject?.name ?? '—'} integrations={integrations.data} loading={integrations.isLoading}
                    onSave={async (input) => { await ga4Actions.saveIntegrations.mutateAsync(input); }}
                  />
                )}
              />
            </TabsContent>

            <TabsContent value="areas" className="mt-4">
              <AreaPerformanceTab
                projectId={selected} hasSources={hasSources} canManage={canManage}
                onRequest={() => setRequestDialog({ kind: 'connect_source', message: 'Quero conectar o Google Search Console e o Google Analytics para ver o desempenho por área.' })}
              />
            </TabsContent>

            <TabsContent value="traffic" className="mt-4">
              <SearchTrafficTab
                projectId={selected} hasCredentials={hasSearchCredential} now={now} canAdmin={canManage} syncing={actions.syncSearch.isPending} syncText={syncText}
                onSync={(days) => { void syncFromUi(days); }} onConnectGsc={() => setConnectId('gsc')} onRequest={() => askForProvider('gsc')}
              />
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <AuditView
                overview={audit.overview.data} loading={audit.overview.isLoading} error={audit.overview.error} now={now} canAdmin={auditManage}
                running={audit.runNow.isPending}
                onRun={async () => { await audit.runNow.mutateAsync(); }}
                onUpdate={async (id, patch) => { await audit.updateFinding.mutateAsync({ id, ...patch }); }}
                onApplyFix={(f) => audit.applyFix.mutateAsync(f.id)}
                onOpenRoute={openRoute}
                onRetry={() => { void audit.overview.refetch(); }}
              />
            </TabsContent>

            <TabsContent value="requests" className="mt-4">
              {canTriage ? (
                <ManagerInboxView
                  requests={requests.data} loading={requests.isLoading} error={requests.error} now={now}
                  onUpdate={async (input) => { await requestActions.updateRequest.mutateAsync(input); }}
                  onRetry={() => { void requests.refetch(); }}
                />
              ) : (
                <MemberRequestsView
                  requests={requests.data} loading={requests.isLoading} error={requests.error} now={now}
                  onCreate={sendRequest} onRetry={() => { void requests.refetch(); }}
                />
              )}
            </TabsContent>
          </Tabs>

          {/* Planejamento de coletas e execução paga são decisões do gestor: o cliente nem vê esses painéis. */}
          {canManage && <SerperPlans projectId={selected || undefined} />}
          {canManage && (
            <ExecutionPanel
              program={overview.program ?? EMPTY_PROGRAM} connected={connected} canAdmin={canManage}
              onSave={async (input) => { await actions.saveExecution.mutateAsync(input); }}
              onDisableAll={async () => {
                const budgetUsd = Math.min(200, Math.max(0, (overview.program ?? EMPTY_PROGRAM).budget_usd_micros / 1_000_000));
                await actions.saveExecution.mutateAsync({ executionEnabled: false, budgetUsd, providersEnabled: [] });
              }}
            />
          )}
        </>
      )}

      {canManage && (
        <>
          <ConnectDialog
            providerId={connectId}
            currentLastFour={connectId ? items.find((i) => i.id === connectId)?.credential.last_four : null}
            onClose={() => setConnectId(null)}
            onSubmit={(id, secret) => actions.storeCredential(id, secret)}
            onSyncNow={connectId === 'gsc' || connectId === 'bing_webmaster' ? () => runSync(28) : connectId === 'ga4' ? () => runGa4Sync(28) : undefined}
            canSync={canManage}
          />
          <DocsSheet providerId={docsId} onClose={() => setDocsId(null)} />
        </>
      )}
      {!canManage && !!overview && <RequestDialog open={requestDialog} onClose={() => setRequestDialog(null)} onSubmit={sendRequest} />}
    </div>
  );
}
