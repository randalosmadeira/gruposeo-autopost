import { Loader2, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ToneBadge } from '@/components/nexus-providers/badges';
import { fallbackSummary, formatRelative, healthStripText, overallLabel, overallTone } from '@/lib/nexus-providers';
import type { RealtimeState } from '@/hooks/useNexusProviders';
import type { ProviderOverviewItem, ProvidersOverview } from '@/types/nexus-providers';

/** Indicador "ao vivo": verde quando o canal realtime está conectado, âmbar quando só há polling de 60 s. */
export function LiveIndicator({ state }: { state: RealtimeState }) {
  const live = state === 'live';
  return (
    <span
      data-testid="live-indicator"
      data-state={state}
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${live
        ? 'border-emerald-600/50 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100'
        : 'border-amber-600/50 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100'}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {live ? 'ao vivo' : state === 'connecting' ? 'conectando… (atualiza a cada 60 s)' : 'atualiza a cada 60 s'}
    </span>
  );
}

export interface HealthStripProps {
  overview: ProvidersOverview;
  items: ProviderOverviewItem[];
  now: number;
  /** `dataUpdatedAt` da consulta (ms). */
  updatedAt: number;
  realtime: RealtimeState;
  testingAll: boolean;
  onTestAll: () => void;
}

export function HealthStrip({ overview, items, now, updatedAt, realtime, testingAll, onTestAll }: HealthStripProps) {
  const summary = overview.summary ?? fallbackSummary(items);
  const updated = updatedAt ? formatRelative(new Date(updatedAt).toISOString(), now) : '—';
  return (
    <Card>
      <CardContent className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={overallTone(summary.overall)} className="text-sm">{`Saúde geral: ${overallLabel(summary.overall)}`}</ToneBadge>
          {summary.score !== null && <span className="text-sm font-semibold tabular-nums">Pontuação média {Math.round(summary.score)}/100</span>}
          <LiveIndicator state={realtime} />
          <span className="text-xs text-muted-foreground" aria-live="off">Atualizado {updated}</span>
        </div>
        <p aria-live="polite" data-testid="health-strip-text" className="text-sm">{healthStripText(overview, items, now)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onTestAll} disabled={testingAll || summary.connected === 0}>
            {testingAll ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="mr-1 h-4 w-4" aria-hidden="true" />}
            Testar todas as conexões (gratuitas)
          </Button>
          <span className="text-xs text-muted-foreground">Os testes com custo (Serper, Brave e Perplexity) ficam de fora e só rodam um a um, com a sua confirmação.</span>
        </div>
      </CardContent>
    </Card>
  );
}
