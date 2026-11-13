import { CheckCircle2, Circle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FREE_HEALTH_PROVIDERS, formatRelative, getCatalogEntry, providerHealthMessage } from '@/lib/nexus-providers';
import type { ProviderId, ProviderOverviewItem } from '@/types/nexus-providers';

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${done ? 'text-emerald-600' : 'text-muted-foreground'}`} aria-hidden="true" />
      <span><span className="sr-only">{done ? 'Concluído: ' : 'Pendente: '}</span>{children}</span>
    </li>
  );
}

export interface GuidedActivationCardProps {
  items: ProviderOverviewItem[];
  /** Última sincronização de dados de busca (GSC/Bing), ou null se nunca houve. */
  lastSyncedAt: string | null;
  now: number;
  canAdmin: boolean;
  testingId: ProviderId | null;
  syncing: boolean;
  syncText: string | null;
  onConnect: (id: ProviderId) => void;
  onTest: (id: ProviderId) => void;
  onSync: () => void;
  /** Google Analytics (opcional): última sincronização e ação. Sem `onSyncGa4`, o passo 4 não aparece. */
  ga4LastSyncedAt?: string | null;
  ga4Syncing?: boolean;
  ga4SyncText?: string | null;
  onSyncGa4?: () => void;
  /** Leva o gestor à aba Analytics, onde se informa o ID da propriedade. */
  onOpenAnalytics?: () => void;
}

/** Passo a passo dos provedores gratuitos (Search Console, Bing e Google Analytics). O pai decide quando mostrá-lo (ver `needsGuidedActivation`). */
export function GuidedActivationCard({
  items, lastSyncedAt, now, canAdmin, testingId, syncing, syncText, onConnect, onTest, onSync, ga4LastSyncedAt = null, ga4Syncing = false, ga4SyncText = null, onSyncGa4, onOpenAnalytics,
}: GuidedActivationCardProps) {
  const rows = FREE_HEALTH_PROVIDERS.map((id) => ({ id, entry: getCatalogEntry(id), item: items.find((i) => i.id === id) }));
  const searchRows = rows.filter((r) => r.id !== 'ga4');
  const anyStored = searchRows.some((r) => r.item?.credential.stored);
  const ga4Stored = !!rows.find((r) => r.id === 'ga4')?.item?.credential.stored;
  return (
    <Card id="ativacao-guiada" aria-labelledby="guided-title" className="border-primary/40">
      <CardHeader>
        <CardTitle id="guided-title" className="text-lg">Ativação guiada dos gratuitos</CardTitle>
        <CardDescription>
          O Google Search Console, o Bing Webmaster e o Google Analytics 4 trazem dados reais (busca, visitas, engajamento e tráfego de IA) sem custo.
          Você só precisa gerar as credenciais; o Zica.ai guarda no cofre, testa e sincroniza.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          {rows.map(({ id, entry, item }) => {
            if (!entry) return null;
            const stored = !!item?.credential.stored;
            const last = item?.health.last ?? null;
            const tested = !!last?.ok;
            return (
              <section key={id} aria-labelledby={`guided-${id}`} className="space-y-2 rounded-md border p-3">
                <h3 id={`guided-${id}`} className="text-sm font-semibold">{entry.name}</h3>
                <ol className="space-y-1.5">
                  <Step done={stored}>1. Guardar a credencial{stored ? ` (…${item?.credential.last_four ?? '????'})` : ''}</Step>
                  <Step done={tested}>2. Primeiro teste de conexão{last ? ` — ${formatRelative(last.checked_at, now)}` : ''}</Step>
                </ol>
                {last && !last.ok && <p role="status" className="text-xs text-destructive">{providerHealthMessage(last)}</p>}
                {id === 'ga4' && stored && (
                  <p className="text-xs text-muted-foreground">
                    Falta informar o ID da propriedade GA4 do projeto.
                    {onOpenAnalytics && <> <button type="button" className="underline" onClick={onOpenAnalytics}>Abrir a aba Analytics</button></>}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!stored ? (
                    <Button size="sm" onClick={() => onConnect(id)} aria-label={`Conectar: ${entry.name}`}>Conectar</Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={testingId === id} onClick={() => onTest(id)} aria-label={`Testar conexão: ${entry.name}`}>
                      {testingId === id && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                      {tested ? 'Testar de novo' : 'Testar conexão'}
                    </Button>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <ul>
            <Step done={!!lastSyncedAt}>
              3. Primeira sincronização de dados de busca{lastSyncedAt ? ` — concluída ${formatRelative(lastSyncedAt, now)}` : ''}
            </Step>
          </ul>
          <Button size="sm" variant="outline" onClick={onSync} disabled={!anyStored || !canAdmin || syncing}
            title={!canAdmin ? 'Só proprietário ou administrador pode sincronizar' : !anyStored ? 'Guarde ao menos uma credencial primeiro' : undefined}>
            {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />}
            Sincronizar agora
          </Button>
          {syncText && <p role="status" className="text-sm text-muted-foreground">{syncText}</p>}
        </div>

        {onSyncGa4 && (
          <div className="space-y-2 rounded-md border p-3">
            <ul>
              <Step done={!!ga4LastSyncedAt}>
                4. Primeira sincronização do Google Analytics{ga4LastSyncedAt ? ` — concluída ${formatRelative(ga4LastSyncedAt, now)}` : ''}
              </Step>
            </ul>
            <Button size="sm" variant="outline" onClick={onSyncGa4} disabled={!ga4Stored || !canAdmin || ga4Syncing}
              title={!canAdmin ? 'Só a conta de gerenciamento pode sincronizar' : !ga4Stored ? 'Guarde a credencial do Google Analytics primeiro' : undefined}>
              {ga4Syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />}
              Sincronizar o Analytics
            </Button>
            {ga4SyncText && <p role="status" className="text-sm text-muted-foreground">{ga4SyncText}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
