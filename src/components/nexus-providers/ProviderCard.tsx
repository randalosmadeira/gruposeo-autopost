import { useState } from 'react';
import { BookOpen, ExternalLink, KeyRound, Loader2, PlugZap, Radar, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatusBadge, ToneBadge } from '@/components/nexus-providers/badges';
import { formatRate } from '@/lib/nexus-observatory';
import {
  REFERENCE_NOTICE, categoryLabel, confirmCostText, formatLatency, formatRelative, getCatalogEntry, providerHealthMessage, quotaText,
  successRate7d,
} from '@/lib/nexus-providers';
import type { ProviderId, ProviderOverviewItem } from '@/types/nexus-providers';

export interface ProviderCardProps {
  item: ProviderOverviewItem;
  now: number;
  /** Um teste desta conexão está em andamento. */
  testing?: boolean;
  /** Dono/admin da organização. Remover exige; os demais veem em modo leitura. */
  canAdmin: boolean;
  onConnect: (id: ProviderId) => void;
  onTest: (id: ProviderId, opts: { confirmCost: boolean }) => void;
  onDocs: (id: ProviderId) => void;
  onRemove: (id: ProviderId) => void;
  onOpenObservatory?: () => void;
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

export function ProviderCard({ item, now, testing = false, canAdmin, onConnect, onTest, onDocs, onRemove, onOpenObservatory }: ProviderCardProps) {
  const entry = getCatalogEntry(item.id);
  const [costOpen, setCostOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  if (!entry) return null;

  const manual = entry.category === 'manual';
  const stored = item.credential.stored;
  const last = item.health.last;
  const rate = successRate7d(item);
  const quota = quotaText(last?.quota);
  const costly = !!entry.testCost;

  function requestTest() {
    if (costly) setCostOpen(true);
    else onTest(item.id, { confirmCost: false });
  }

  return (
    <Card data-testid={`provider-${item.id}`} className="flex h-full flex-col" aria-labelledby={`provider-title-${item.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle id={`provider-title-${item.id}`} className="text-base leading-snug">{entry.name}</CardTitle>
          {/* aria-live: mudanças de status são anunciadas a leitores de tela */}
          <span aria-live="polite" aria-atomic="true"><StatusBadge status={item.status} /></span>
        </div>
        <CardDescription>{categoryLabel(entry.category)}</CardDescription>
        {item.enabled && <ToneBadge tone="info" icon={PlugZap}>Habilitado para execução paga</ToneBadge>}
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {manual ? (
          <p className="text-sm text-muted-foreground">
            Não há API pública de chat do Copilot. As observações são registradas manualmente no Observatório; a única fonte oficial de citação é o relatório
            “AI Performance” do Bing Webmaster.
          </p>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span id={`score-${item.id}`}>Pontuação de qualidade</span>
                <span className="font-semibold tabular-nums text-foreground">{item.score === null ? '—' : `${Math.round(item.score)}/100`}</span>
              </div>
              <Progress value={item.score ?? 0} className="mt-1 h-2" aria-labelledby={`score-${item.id}`} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Metric label="Credencial">{stored ? `guardada …${item.credential.last_four ?? '????'}` : 'sem credencial'}</Metric>
              <Metric label="Última verificação">{formatRelative(last?.checked_at, now)}</Metric>
              <Metric label="Latência do último teste">{formatLatency(last?.latency_ms)}</Metric>
              <Metric label="Sucesso em 7 dias">{rate === null ? '—' : `${formatRate(rate)} (${item.health.ok_7d}/${item.health.checks_7d})`}</Metric>
              {quota && <Metric label="Quota / saldo">{quota}</Metric>}
              <Metric label="Uso em 30 dias">{`${item.usage.valid_30d} válidas · ${item.usage.failed_30d} falhas · ${item.usage.uncertain_30d} incertas`}</Metric>
            </dl>
            {stored && !last && <p className="text-sm text-muted-foreground">Credencial guardada, ainda sem teste. Use “Testar conexão”.</p>}
            {last && !last.ok && <p role="status" className="text-sm text-destructive">{providerHealthMessage(last)}</p>}
            {last && last.ok && item.status === 'degraded' && <p className="text-sm text-amber-800 dark:text-amber-200">Último teste passou, mas há sinais de atenção (latência, quota, idade do teste ou taxa de sucesso).</p>}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Custo de referência:</span> {entry.costLabel} {REFERENCE_NOTICE}
        </p>
        {entry.costWarning && (
          <p className="rounded-md border border-amber-600/50 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">{entry.costWarning}</p>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {manual ? (
          <Button size="sm" onClick={onOpenObservatory}><Radar className="mr-1 h-4 w-4" aria-hidden="true" /> Abrir o Observatório</Button>
        ) : (
          <>
            <Button size="sm" variant={stored ? 'outline' : 'default'} onClick={() => onConnect(item.id)} aria-label={`${stored ? 'Trocar chave' : 'Conectar'}: ${entry.name}`}>
              <KeyRound className="mr-1 h-4 w-4" aria-hidden="true" /> {stored ? 'Trocar chave' : 'Conectar'}
            </Button>
            <Button size="sm" variant="outline" disabled={!stored || testing} aria-busy={testing} onClick={requestTest} aria-label={`Testar conexão: ${entry.name}`}>
              {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="mr-1 h-4 w-4" aria-hidden="true" />}
              {testing ? 'Testando…' : 'Testar conexão'}
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" asChild>
          <a href={entry.contractUrl} target="_blank" rel="noopener noreferrer" aria-label={`Contratar: ${entry.name} (abre em nova aba)`}>
            <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" /> Contratar
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDocs(item.id)} aria-label={`Documentação: ${entry.name}`}>
          <BookOpen className="mr-1 h-4 w-4" aria-hidden="true" /> Documentação
        </Button>
        {!manual && stored && (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={!canAdmin} title={canAdmin ? undefined : 'Só proprietário ou administrador pode remover'}
            onClick={() => setRemoveOpen(true)} aria-label={`Remover chave: ${entry.name}`}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Remover
          </Button>
        )}
      </CardFooter>

      <AlertDialog open={costOpen} onOpenChange={setCostOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Testar conexão com custo</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCostText(item.id)} {REFERENCE_NOTICE}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onTest(item.id, { confirmCost: true })}>Continuar e testar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a chave de {entry.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A credencial será apagada do cofre e o provedor deixará de ser habilitado para execução paga. O histórico de testes continua. Para voltar a usar, será preciso conectar de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onRemove(item.id)}>Remover chave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
