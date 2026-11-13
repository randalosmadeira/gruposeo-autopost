import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, PlugZap, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuditView } from '@/components/nexus-providers/AuditTab';
import { ConnectDialog } from '@/components/nexus-providers/ConnectDialog';
import { DocsSheet } from '@/components/nexus-providers/DocsSheet';
import { ExecutionPanel } from '@/components/nexus-providers/ExecutionPanel';
import { GuidedActivationCard } from '@/components/nexus-providers/GuidedActivationCard';
import { HealthStrip } from '@/components/nexus-providers/HealthStrip';
import { ProviderCard } from '@/components/nexus-providers/ProviderCard';
import { SearchTrafficTab } from '@/components/nexus-providers/SearchTrafficTab';
import { useToast } from '@/hooks/use-toast';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useOrganizationConsole } from '@/hooks/useOrganizationConsole';
import { useNexusAudit } from '@/hooks/useNexusAudit';
import { useProjects } from '@/hooks/useProjects';
import { useNexusProviderActions, useNexusProviders, useNexusRealtime, useNow, useSearchPerformance } from '@/hooks/useNexusProviders';
import { rangeForDays } from '@/lib/nexus-observatory';
import {
  CATEGORY_ORDER, REFERENCE_NOTICE, canAdministerOrganization, categoryLabel, connectedProviderIds, filterByCategory, mergeCatalogWithOverview,
  needsGuidedActivation, normalizeSyncResponse, providerErrorMessage, providerHealthMessage, providerName, summarizeHealthResults, syncSummaryText,
} from '@/lib/nexus-providers';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type { ProviderCategory, ProviderId } from '@/types/nexus-providers';

type TabValue = 'all' | ProviderCategory | 'traffic' | 'audit';
const TAB_VALUES: readonly string[] = ['all', ...CATEGORY_ORDER, 'traffic', 'audit'];
const BLOCKED_TEXT = 'Execução pausada: orçamento zero ou serviços pagos bloqueados. Os dados já observados continuam disponíveis; nenhuma consulta paga é acionada.';

export default function NexusProviders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();
  const { isAdmin: isPlatformAdmin } = useAdminAccess();
  const consoleQuery = useOrganizationConsole();

  const [projectId, setProjectId] = useState('');
  const selected = projectId || projects[0]?.id || '';
  const selectedProject = projects.find((p) => p.id === selected);
  const [tab, setTab] = useState<TabValue>('all');
  const [connectId, setConnectId] = useState<ProviderId | null>(null);
  const [docsId, setDocsId] = useState<ProviderId | null>(null);
  const [testingId, setTestingId] = useState<ProviderId | 'all' | null>(null);
  const [syncText, setSyncText] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const query = useNexusProviders(selected || undefined);
  const actions = useNexusProviderActions(selected || undefined);
  const audit = useNexusAudit(selected || undefined);
  const overview = query.data;
  const orgId = overview?.organization_id ?? selectedProject?.organization_id ?? undefined;
  const realtime = useNexusRealtime(selected || undefined, orgId);
  const now = useNow(5000);

  const items = useMemo(() => mergeCatalogWithOverview(overview), [overview]);
  const connected = useMemo(() => connectedProviderIds(items), [items]);
  const membership = consoleQuery.data?.membership;
  // O servidor sabe o papel real na organização do projeto; a regra local fica como reserva até a resposta chegar.
  const serverAdmin = (overview as { viewer_is_admin?: boolean } | undefined)?.viewer_is_admin;
  const canAdmin = typeof serverAdmin === 'boolean' ? serverAdmin : canAdministerOrganization({
    role: membership?.role, membershipOrgId: membership?.organization_id, activeOrgId: orgId, isPlatformAdmin,
  });
  const orgLabel = membership && membership.organization_id === orgId ? membership.organizations.name : orgId ? `…${orgId.slice(-6)}` : '—';
  const hasSearchCredential = items.some((i) => (i.id === 'gsc' || i.id === 'bing_webmaster') && i.credential.stored);
  const showGuided = !!overview && needsGuidedActivation(items);
  // Resumo leve só para saber a última sincronização do cartão de ativação guiada.
  const guidedRange = useMemo(() => rangeForDays(28), []);
  const guidedSearch = useSearchPerformance(selected || undefined, guidedRange.from, guidedRange.to, showGuided && hasSearchCredential);

  const blockedNow = blocked ?? (query.error instanceof NexusBlockedError ? BLOCKED_TEXT : null);
  const openFindings = audit.overview.data
    ? Object.values(audit.overview.data.counts.open).reduce((a, b) => a + b, 0)
    : null;

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

  async function removeCredential(id: ProviderId) {
    try {
      await actions.removeCredential.mutateAsync(id);
      toast({ title: `Chave removida: ${providerName(id)}`, description: 'A credencial foi apagada do cofre.' });
    } catch (e) { fail(e, 'Não foi possível remover a chave'); }
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-7">
      <header>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <PlugZap className="h-4 w-4" aria-hidden="true" /> NEXUS · Motores &amp; APIs
        </p>
        <h1 className="mt-2 text-3xl font-bold">Conexões, saúde e custo dos motores</h1>
        <p className="mt-2 text-muted-foreground">
          Conecte, teste e acompanhe os provedores de dados de busca e de IA usados pelo Observatório. As credenciais ficam no cofre do servidor e nunca são exibidas de volta.
          Nada aqui promete posição, tráfego ou contratação. {REFERENCE_NOTICE}
        </p>
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
          {overview && !canAdmin ? ' · modo leitura (somente proprietário ou administrador altera)' : ''}
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
          <HealthStrip
            overview={overview} items={items} now={now} updatedAt={query.dataUpdatedAt} realtime={realtime}
            testingAll={testingId === 'all'} onTestAll={() => { void runTest(undefined, false); }}
          />

          {showGuided && (
            <GuidedActivationCard
              items={items} now={now} canAdmin={canAdmin} lastSyncedAt={guidedSearch.data?.last_synced_at ?? null}
              testingId={testingId === 'all' ? null : testingId} syncing={actions.syncSearch.isPending} syncText={syncText}
              onConnect={setConnectId} onTest={(id) => { void runTest(id, false); }} onSync={() => { void syncFromUi(7); }}
            />
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList className="h-auto flex-wrap justify-start">
              {providerTabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
              <TabsTrigger value="traffic">Tráfego orgânico (Google Search Console)</TabsTrigger>
              <TabsTrigger value="audit">Saúde do sistema{openFindings ? ` (${openFindings})` : ''}</TabsTrigger>
            </TabsList>

            {providerTabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-4">
                <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={`Provedores: ${t.label}`}>
                  {filterByCategory(items, t.value).map((item) => (
                    <li key={item.id}>
                      <ProviderCard
                        item={item} now={now} canAdmin={canAdmin} testing={testingId === item.id}
                        onConnect={setConnectId} onDocs={setDocsId} onRemove={(id) => { void removeCredential(id); }}
                        onTest={(id, o) => { void runTest(id, o.confirmCost); }} onOpenObservatory={() => navigate('/nexus/observatorio')}
                      />
                    </li>
                  ))}
                </ul>
              </TabsContent>
            ))}

            <TabsContent value="traffic" className="mt-4">
              <SearchTrafficTab
                projectId={selected} hasCredentials={hasSearchCredential} now={now} canAdmin={canAdmin} syncing={actions.syncSearch.isPending} syncText={syncText}
                onSync={(days) => { void syncFromUi(days); }} onConnectGsc={() => setConnectId('gsc')}
              />
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <AuditView
                overview={audit.overview.data} loading={audit.overview.isLoading} error={audit.overview.error} now={now} canAdmin={canAdmin}
                running={audit.runNow.isPending}
                onRun={async () => { await audit.runNow.mutateAsync(); }}
                onUpdate={async (id, patch) => { await audit.updateFinding.mutateAsync({ id, ...patch }); }}
                onApplyFix={(f) => audit.applyFix.mutateAsync(f.id)}
                onOpenRoute={openRoute}
                onRetry={() => { void audit.overview.refetch(); }}
              />
            </TabsContent>
          </Tabs>

          <ExecutionPanel
            program={overview.program} connected={connected} canAdmin={canAdmin}
            onSave={async (input) => { await actions.saveExecution.mutateAsync(input); }}
            onDisableAll={async () => {
              const budgetUsd = Math.min(200, Math.max(0, overview.program.budget_usd_micros / 1_000_000));
              await actions.saveExecution.mutateAsync({ executionEnabled: false, budgetUsd, providersEnabled: [] });
            }}
          />
        </>
      )}

      <ConnectDialog
        providerId={connectId}
        currentLastFour={connectId ? items.find((i) => i.id === connectId)?.credential.last_four : null}
        onClose={() => setConnectId(null)}
        onSubmit={(id, secret) => actions.storeCredential(id, secret)}
        onSyncNow={connectId === 'gsc' || connectId === 'bing_webmaster' ? () => runSync(28) : undefined}
        canSync={canAdmin}
      />
      <DocsSheet providerId={docsId} onClose={() => setDocsId(null)} />
    </div>
  );
}
