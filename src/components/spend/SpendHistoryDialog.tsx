import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSpendHistory } from '@/hooks/useSpendStatus';
import { fmtUsd, spendErrorMessage, type SpendHistoryDay } from '@/lib/spend-api';

const dayLabel = (iso: string) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const top = (m: Record<string, number>, n = 3) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

function DayRow({ d, names }: { d: SpendHistoryDay; names: Record<string, string> }) {
  const providers = top(d.by_provider);
  const modules = top(d.by_module);
  const projects = top(d.by_project);
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <strong>{dayLabel(d.day)}</strong>
        <span className="font-medium">{fmtUsd(d.total_usd_micros)}</span>
      </div>
      {d.estimated_usd_micros > 0 && <p className="text-xs text-muted-foreground">Estimado (sem medida do provedor): {fmtUsd(d.estimated_usd_micros)}</p>}
      {providers.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">Provedor: {providers.map(([k, v]) => `${k} ${fmtUsd(v)}`).join(' · ')}</p>}
      {modules.length > 0 && <p className="break-words text-xs text-muted-foreground">Módulo: {modules.map(([k, v]) => `${k} ${fmtUsd(v)}`).join(' · ')}</p>}
      {projects.length > 0 && <p className="break-words text-xs text-muted-foreground">Projeto: {projects.map(([k, v]) => `${names[k] || 'projeto'} ${fmtUsd(v)}`).join(' · ')}</p>}
    </li>
  );
}

/** Cartão "Gasto com IA": gasto por dia dos últimos 30 dias, por provedor, módulo e projeto. Sem rolagem horizontal no celular. */
export function SpendHistoryDialog({ open, onOpenChange, organizationId }: { open: boolean; onOpenChange: (v: boolean) => void; organizationId?: string }) {
  const { data, isLoading, error } = useSpendHistory(organizationId, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gasto com IA</DialogTitle>
          <DialogDescription>Últimos 30 dias, por dia (horário de Brasília). Valores em dólar, a moeda que o provedor cobra.</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando o histórico…</p>}
        {error && <p role="alert" className="text-sm">{spendErrorMessage(error)}</p>}
        {data && data.days.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há gasto registrado nesse período.</p>}
        {data && data.days.length > 0 && <ul className="space-y-2" aria-label="Gasto por dia">{data.days.map((d) => <DayRow key={d.day} d={d} names={data.project_names || {}} />)}</ul>}
      </DialogContent>
    </Dialog>
  );
}
