import { Button } from '@/components/ui/button';
import type { AlertRow } from '@/lib/speed-api';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const KIND_LABEL: Record<string, string> = { score_drop: 'Nota caiu', field_worse: 'Visitantes reais pioraram', measure_failed: 'Medição falhou', links_lost: 'Backlinks perdidos' };

/** Avisos do monitoramento (velocidade ou backlinks). Ficam até alguém dispensar; só quem pode editar vê o botão. */
export function AlertsList({ alerts, canEdit, busy, onDismiss, onDismissAll }: { alerts: AlertRow[]; canEdit: boolean; busy: boolean; onDismiss: (id: string) => void; onDismissAll: () => void }) {
  if (!alerts.length) return null;
  return (
    <section aria-labelledby="alerts-title" className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="alerts-title" className="text-base font-semibold text-amber-200">Avisos do acompanhamento ({alerts.length})</h2>
        {canEdit && alerts.length > 1 && <Button size="sm" variant="outline" disabled={busy} onClick={onDismissAll}>Dispensar todos</Button>}
      </div>
      <ul className="space-y-2">
        {alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-background/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-amber-300">{KIND_LABEL[a.kind] || 'Aviso'} · {when(a.created_at)}</p>
              <p className="text-sm">{a.title}</p>
              {a.ref_url && <p className="break-all text-xs text-muted-foreground">{a.ref_url}</p>}
            </div>
            {canEdit && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(a.id)} aria-label={`Dispensar aviso: ${a.title}`}>Dispensar</Button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
