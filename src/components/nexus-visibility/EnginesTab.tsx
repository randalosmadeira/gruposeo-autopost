import { Link } from 'react-router-dom';
import { Bot, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { effectiveConfidence, formatPercent, formatSample, hasTrendData, rise } from '@/lib/nexus-visibility';
import type { RequestKind } from '@/types/nexus-requests';
import type { VisibilityOverview } from '@/types/nexus-visibility';
import { TrendChart } from './TrendChart';
import { ConfidenceBadge, EmptyState, ErrorState, LoadingBlock, Meter, PanelHeader } from './shared';

export interface EnginesViewProps {
  data: VisibilityOverview | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  canManage: boolean;
  /** Filtro de motor ativo (vazio = todos). */
  engine: string;
  onSelectEngine: (engine: string) => void;
  onRequest: (kind: RequestKind, message: string) => void;
}

/** IAs e buscadores: visibilidade e citação por motor, com a evolução do conjunto (ou do motor escolhido no filtro). */
export function EnginesView({ data, loading, error, onRetry, canManage, engine, onSelectEngine, onRequest }: EnginesViewProps) {
  if (!data && loading) return <LoadingBlock label="Carregando as IAs e buscadores" rows={3} />;
  if (!data && error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data) return null;

  if (data.by_engine.length === 0) {
    return (
      <EmptyState icon={<Bot className="h-5 w-5" />} title="Ainda sem observações por IA"
        action={canManage
          ? <Button asChild size="sm"><Link to="/nexus/observatorio">Abrir o Observatório</Link></Button>
          : <Button size="sm" onClick={() => onRequest('new_observation_round', 'Quero uma nova rodada de observação nas IAs e buscadores.')}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Pedir uma coleta ao gestor</Button>}>
        {canManage ? 'Quando uma coleta rodar, cada IA ou buscador aparece aqui com a própria visibilidade.' : 'Peça ao gestor para rodar uma coleta. Cada IA ou buscador passa a aparecer aqui, com a visibilidade de cada um.'}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Visibilidade por IA ou buscador">
        {data.by_engine.map((e, i) => {
          const active = engine === e.engine;
          const conf = effectiveConfidence('alta', e.n);
          return (
            <li key={e.engine} style={rise(i)} className="zv-rise">
              <button type="button" onClick={() => onSelectEngine(active ? '' : e.engine)} aria-pressed={active} data-testid={`engine-${e.engine}`}
                className={`zv-panel flex h-full w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-[var(--zv-surface-2)] ${active ? 'ring-2 ring-[var(--zv-vr)]' : ''}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-base font-semibold">{e.label}</span>
                  <ConfidenceBadge confidence="alta" n={e.n} />
                </span>
                <span className="grid grid-cols-2 gap-3">
                  <span className="space-y-1">
                    <span className="block text-xs text-[var(--zv-muted)]">Visibilidade</span>
                    <span className="block text-3xl font-bold tabular-nums" data-testid={`engine-${e.engine}-vr`}>{formatPercent(e.vr)}</span>
                    <Meter value={e.vr} label={`Visibilidade em ${e.label}: ${formatPercent(e.vr)}`} />
                  </span>
                  <span className="space-y-1">
                    <span className="block text-xs text-[var(--zv-muted)]">Citação</span>
                    <span className="block text-3xl font-bold tabular-nums" data-testid={`engine-${e.engine}-cr`}>{formatPercent(e.cr)}</span>
                    <Meter value={e.cr} color="var(--zv-cr)" label={`Citação em ${e.label}: ${formatPercent(e.cr)}`} />
                  </span>
                </span>
                <span className="text-xs text-[var(--zv-muted)]">{formatSample(e.n)}{conf === 'baixa' ? ' · amostra pequena' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[var(--zv-muted)]">Toque em uma IA para ver só a evolução dela. Toque de novo para voltar ao conjunto.</p>

      <section aria-label="Evolução" className="zv-panel zv-rise p-5" style={rise(6)}>
        <PanelHeader title={engine ? `Evolução em ${data.by_engine.find((e) => e.engine === engine)?.label ?? engine}` : 'Evolução de todas as IAs e buscadores'} />
        {hasTrendData(data.trend)
          ? <TrendChart trend={data.trend} height={240} />
          : <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--zv-muted)]">Ainda não há dias suficientes com observações para desenhar a evolução.</p>}
      </section>
    </div>
  );
}
