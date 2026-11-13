import { AlertTriangle, CheckCircle2, CircleDashed, Hand, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ToneBadge } from '@/components/nexus-providers/badges';
import {
  categoryLabel, formatRelative, getCatalogEntry, providerUpdatedAt, simpleStatusLabel, simpleStatusOf, simpleStatusTone,
} from '@/lib/nexus-providers';
import type { ProviderId, ProviderOverviewItem, SimpleProviderStatus } from '@/types/nexus-providers';

const SIMPLE_ICON: Record<SimpleProviderStatus, typeof CheckCircle2> = { connected: CheckCircle2, attention: AlertTriangle, not_connected: CircleDashed };

export interface ClientProviderCardProps {
  item: ProviderOverviewItem;
  now: number;
  /** "Solicitar": abre o formulário de pedido ao gestor. */
  onRequest: (id: ProviderId) => void;
}

/**
 * Visão cliente de um motor: só status simples, última atualização, uso agregado e o botão Solicitar.
 * Não existe aqui campo de chave, Conectar, Trocar, Remover, teste, custo nem documentação técnica.
 */
export function ClientProviderCard({ item, now, onRequest }: ClientProviderCardProps) {
  const entry = getCatalogEntry(item.id);
  if (!entry) return null;
  const manual = entry.category === 'manual';
  const simple = simpleStatusOf(item.status);
  const updated = providerUpdatedAt(item);
  const usage = item.usage;
  const hasUsage = usage.valid_30d + usage.failed_30d + usage.uncertain_30d > 0;

  return (
    <Card data-testid={`client-provider-${item.id}`} className="flex h-full flex-col" aria-labelledby={`client-provider-title-${item.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle id={`client-provider-title-${item.id}`} className="text-base leading-snug">{entry.name}</CardTitle>
          <span aria-live="polite" aria-atomic="true">
            {manual
              ? <ToneBadge tone="neutral" icon={Hand}>Registro manual</ToneBadge>
              : <ToneBadge tone={simpleStatusTone(simple)} icon={SIMPLE_ICON[simple]}>{simpleStatusLabel(simple)}</ToneBadge>}
          </span>
        </div>
        <CardDescription>{categoryLabel(entry.category)}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <p className="text-sm text-muted-foreground">{entry.doc.zicaUsage}</p>
        {!manual && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Última atualização</dt><dd className="text-sm font-medium">{updated ? formatRelative(updated, now) : 'ainda sem dados'}</dd></div>
            {hasUsage && (
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">Uso em 30 dias</dt><dd className="text-sm font-medium">{`${usage.valid_30d} válidas · ${usage.failed_30d} com falha`}</dd></div>
            )}
          </dl>
        )}
        {simple === 'not_connected' && !manual && <p className="text-sm text-muted-foreground">Ainda sem dados: peça ao gestor para conectar.</p>}
        {simple === 'attention' && !manual && <p role="status" className="text-sm text-amber-800 dark:text-amber-200">Esta conexão precisa de atenção. O gestor pode corrigir: use Solicitar.</p>}
      </CardContent>
      {!manual && (
        <CardFooter>
          <Button size="sm" variant={simple === 'connected' ? 'outline' : 'default'} onClick={() => onRequest(item.id)}
            aria-label={`${simple === 'not_connected' ? 'Solicitar conexão' : 'Solicitar ajuda'}: ${entry.name}`}>
            <MessageSquarePlus className="mr-1 h-4 w-4" aria-hidden="true" /> Solicitar
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
