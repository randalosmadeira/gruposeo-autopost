import { Card, CardContent } from '@/components/ui/card';
import { ToneBadge } from '@/components/nexus-providers/badges';
import { formatRelative, providerUpdatedAt, summarizeItemsSimple } from '@/lib/nexus-providers';
import type { ProviderOverviewItem } from '@/types/nexus-providers';

export interface ClientStatusStripProps { items: ProviderOverviewItem[]; now: number }

/** Faixa simples da Visão cliente: quantos motores estão conectados e quando houve a última atualização. Sem custo, sem pontuação, sem teste. */
export function ClientStatusStrip({ items, now }: ClientStatusStripProps) {
  const s = summarizeItemsSimple(items);
  let latest: string | null = null;
  for (const i of items) {
    const at = providerUpdatedAt(i);
    if (at && (!latest || new Date(at).getTime() > new Date(latest).getTime())) latest = at;
  }
  const tone = s.connected === 0 ? 'neutral' : s.attention > 0 ? 'warning' : 'success';
  const label = s.connected === 0 ? 'Nenhum motor conectado ainda' : s.attention > 0 ? 'Há motores que precisam de atenção' : 'Tudo em ordem';
  return (
    <Card>
      <CardContent className="space-y-2 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={tone} className="text-sm">{label}</ToneBadge>
          <span className="text-xs text-muted-foreground">Última atualização {latest ? formatRelative(latest, now) : 'ainda sem dados'}</span>
        </div>
        <p data-testid="client-strip-text" aria-live="polite" className="text-sm">
          {s.connected} de {s.total} motores conectados · {s.attention} com atenção · {s.notConnected} não conectados
        </p>
        <p className="text-xs text-muted-foreground">As conexões são feitas pelo gestor. Precisa de algo? Use Solicitar em qualquer motor ou a aba Solicitações.</p>
      </CardContent>
    </Card>
  );
}
