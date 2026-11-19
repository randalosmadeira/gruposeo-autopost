import { Flag, Globe, Lightbulb, MessageSquarePlus, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { opportunityKindLabel, priorityLabel, rise } from '@/lib/nexus-visibility';
import type { RequestKind } from '@/types/nexus-requests';
import type { OpportunityItem } from '@/types/nexus-visibility';
import { EmptyState, ErrorState, LoadingBlock, Pill, type PillTone } from './shared';

export interface OpportunitiesViewProps {
  items: OpportunityItem[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  canManage: boolean;
  onRequest: (kind: RequestKind, message: string) => void;
}

const PRIORITY_TONE: Record<OpportunityItem['priority'], PillTone> = { alta: 'bad', media: 'warn', baixa: 'neutral' };
function KindIcon({ kind }: { kind: OpportunityItem['kind'] }) {
  const cls = 'h-4 w-4';
  return kind === 'fonte_alvo' ? <Globe className={cls} aria-hidden="true" /> : kind === 'concorrente_a_frente' ? <Swords className={cls} aria-hidden="true" /> : <Lightbulb className={cls} aria-hidden="true" />;
}

/** Oportunidades: lista priorizada, sempre com a evidência (sem texto gerado por IA). */
export function OpportunitiesView({ items, loading, error, onRetry, canManage, onRequest }: OpportunitiesViewProps) {
  if (!items && loading) return <LoadingBlock label="Carregando as oportunidades" rows={3} />;
  if (!items && error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!items) return null;
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}
        <EmptyState icon={<Flag className="h-5 w-5" />} title="Nenhuma oportunidade por enquanto">
          Elas aparecem quando há observações suficientes para mostrar perguntas sem a sua marca, fontes onde ganhar presença e concorrentes à frente. Cada item traz a evidência.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}
      <p className="text-sm text-[var(--zv-muted)]">Ordenadas por prioridade. Cada uma mostra o dado que a originou: nada aqui é estimativa.</p>
      <ul className="space-y-3" aria-label="Oportunidades">
        {items.map((o, i) => (
          <li key={`${o.kind}-${o.title}-${i}`} style={rise(i)} className="zv-panel zv-rise space-y-3 p-4 sm:p-5" data-testid="opportunity">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={PRIORITY_TONE[o.priority]} icon={<Flag className="h-3 w-3" aria-hidden="true" />}>{priorityLabel(o.priority)}</Pill>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--zv-muted)]"><KindIcon kind={o.kind} />{opportunityKindLabel(o.kind)}</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold leading-snug">{o.title}</h3>
              {o.detail && <p className="text-sm text-[var(--zv-muted)]">{o.detail}</p>}
            </div>
            {o.evidence.length > 0 && (
              <dl className="grid gap-x-6 gap-y-1.5 rounded-xl bg-[var(--zv-surface-2)] p-3 text-sm sm:grid-cols-2" aria-label="Evidência">
                {o.evidence.map((e) => (
                  <div key={e.label} className="flex min-w-0 items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-xs text-[var(--zv-muted)]">{e.label}</dt>
                    <dd className="min-w-0 truncate text-right font-medium" title={e.value}>{e.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!canManage && (
              <Button size="sm" variant="outline" onClick={() => onRequest('other', `Quero atuar nesta oportunidade da Visibilidade: ${o.title}`.slice(0, 400))}>
                <MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Solicitar ao gestor
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
