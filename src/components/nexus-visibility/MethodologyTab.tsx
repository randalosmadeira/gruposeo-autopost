import { CheckCircle2, CircleDashed } from 'lucide-react';
import { NOT_MEASURED_REASON, missingLabel, rise } from '@/lib/nexus-visibility';
import type { Methodology, VisibilityOverview } from '@/types/nexus-visibility';
import { ErrorState, LoadingBlock, PanelHeader, Pill } from './shared';

export interface MethodologyViewProps {
  method: Methodology | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Para dizer, componente a componente, o que está medido agora. Opcional. */
  overview?: VisibilityOverview;
}

const NOT_MEASURED_IDS = new Set(['pm', 'rep']);

/** Como calculamos: a metodologia aberta (componentes, pesos, versão e o que ainda é "n/d" e por quê). */
export function MethodologyView({ method, loading, error, onRetry, overview }: MethodologyViewProps) {
  if (!method && loading) return <LoadingBlock label="Carregando a metodologia" rows={2} />;
  if (!method && error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!method) return null;

  const missing = new Set((overview?.zvi.missing ?? []).map((m) => m.toLowerCase()));
  const notMeasured = (id: string) => NOT_MEASURED_IDS.has(id) || missing.has(id);
  const available = method.components.filter((c) => !notMeasured(c.id));
  const totalAvail = available.reduce((a, c) => a + c.weight, 0);
  const pct = (w: number) => `${Math.round(w * 100)}%`;
  const redistributed = (w: number) => (totalAvail > 0 ? `${Math.round((w / totalAvail) * 100)}%` : '—');

  return (
    <div className="space-y-5">
      <section aria-label="Fórmula" className="zv-panel p-5">
        <PanelHeader title="Índice Zica de Visibilidade" hint="Uma nota de 0 a 100 que combina o que as IAs dizem sobre a sua marca. A fórmula é aberta e tem versão."
          right={<Pill tone="info" title="Versão do método">Método {method.version}</Pill>} />
        <div role="img" aria-label="Peso de cada componente na nota" className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
          {method.components.map((c, i) => (
            <div key={c.id} className="zv-fill h-full" style={{ width: pct(c.weight), background: `color-mix(in srgb, var(--zv-vr) ${100 - i * 14}%, var(--zv-surface))`, opacity: notMeasured(c.id) ? 0.35 : 1 }} />
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--zv-muted)]">Faixas apagadas são componentes ainda não medidos.</p>
      </section>

      <section aria-label="Componentes" className="space-y-3">
        <ul className="grid gap-3 md:grid-cols-2" data-testid="method-components">
          {method.components.map((c, i) => {
            const nd = notMeasured(c.id);
            return (
              <li key={c.id} style={rise(i)} className={`zv-panel zv-rise space-y-1.5 p-4 ${nd ? 'border-dashed' : ''}`} data-testid={`method-${c.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{c.label}</h3>
                  <span className="flex items-center gap-1.5">
                    <Pill tone="neutral">Peso {pct(c.weight)}</Pill>
                    {nd
                      ? <Pill tone="warn" icon={<CircleDashed className="h-3 w-3" aria-hidden="true" />}>n/d agora</Pill>
                      : <Pill tone="good" icon={<CheckCircle2 className="h-3 w-3" aria-hidden="true" />}>Medido</Pill>}
                  </span>
                </div>
                <p className="text-sm text-[var(--zv-muted)]">{c.description}</p>
                {nd && <p className="text-xs text-[var(--zv-warn)]">{NOT_MEASURED_REASON}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      {method.components.some((c) => notMeasured(c.id)) && (
        <section aria-label="Índice parcial" className="zv-panel space-y-2 border-[color-mix(in_srgb,var(--zv-warn)_45%,transparent)] p-5" data-testid="method-partial">
          <h3 className="text-sm font-semibold">Por que o índice aparece como “parcial”</h3>
          <p className="text-sm text-[var(--zv-muted)]">
            Enquanto {method.components.filter((c) => notMeasured(c.id)).map((c) => missingLabel(c.id) === c.id ? c.label : missingLabel(c.id)).join(' e ')} não forem medidos, o peso deles é redistribuído de forma proporcional entre os componentes medidos e o índice é marcado como parcial.
          </p>
          {available.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Pesos redistribuídos">
              {available.map((c) => <li key={c.id} className="rounded-full bg-[var(--zv-surface-2)] px-2.5 py-1">{c.label}: {pct(c.weight)} → <strong>{redistributed(c.weight)}</strong></li>)}
            </ul>
          )}
        </section>
      )}

      <section aria-label="Notas do método" className="zv-panel p-5">
        <PanelHeader title="Como ler os números" />
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--zv-muted)]">
          {method.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
        {!method.fromServer && <p className="mt-3 text-xs text-[var(--zv-muted)]">Mostrando a descrição padrão do método {method.version}.</p>}
      </section>
    </div>
  );
}
