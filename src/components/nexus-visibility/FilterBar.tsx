import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PERIOD_DAYS, engineLabel } from '@/lib/nexus-visibility';
import { formatRelative } from '@/lib/nexus-providers';

const ALL = '__all';

export interface FilterBarProps {
  showEngine: boolean;
  showTopic: boolean;
  days: number;
  onDays: (d: number) => void;
  engine: string; engines: string[]; onEngine: (e: string) => void;
  topic: string; topics: string[]; onTopic: (t: string) => void;
  generatedAt: string | null;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
}

/** Período (7, 28 ou 90 dias) e filtros de IA e tema. Em celular quebra em linhas, sem rolagem horizontal. */
export function FilterBar(p: FilterBarProps) {
  return (
    <div className="grid grid-cols-2 items-end gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-4" role="group" aria-label="Filtros">
      <div className="col-span-2 space-y-1.5 sm:col-auto">
        <span id="zv-period-label" className="block text-sm font-medium leading-none">Período</span>
        <div role="radiogroup" aria-labelledby="zv-period-label" className="flex w-full rounded-xl sm:inline-flex sm:w-auto border border-[var(--zv-line)] bg-[var(--zv-surface-2)] p-0.5">
          {PERIOD_DAYS.map((d) => {
            const on = p.days === d;
            return (
              <button key={d} type="button" role="radio" aria-checked={on} onClick={() => p.onDays(d)}
                className={`flex-1 rounded-[10px] px-3.5 py-2 text-sm sm:flex-none font-medium transition-colors ${on ? 'bg-[var(--zv-surface)] text-[var(--zv-ink)] shadow-sm' : 'text-[var(--zv-muted)] hover:text-[var(--zv-ink)]'}`}>
                {d} dias
              </button>
            );
          })}
        </div>
      </div>
      {p.showEngine && <div className="space-y-1.5">
        <Label htmlFor="zv-f-engine">IA ou buscador</Label>
        <Select value={p.engine || ALL} onValueChange={(v) => p.onEngine(v === ALL ? '' : v)}>
          <SelectTrigger id="zv-f-engine" className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {p.engines.map((e) => <SelectItem key={e} value={e}>{engineLabel(e)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>}
      {p.showTopic && <div className="space-y-1.5">
        <Label htmlFor="zv-f-topic">Tema</Label>
        <Select value={p.topic || ALL} onValueChange={(v) => p.onTopic(v === ALL ? '' : v)}>
          <SelectTrigger id="zv-f-topic" className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os temas</SelectItem>
            {p.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>}
      <div className="col-span-2 flex items-center justify-end gap-2 pb-0.5 sm:col-auto sm:ml-auto">
        <p className="text-xs text-[var(--zv-muted)]" data-testid="generated-at" aria-live="polite">Atualizado {p.generatedAt ? formatRelative(p.generatedAt, p.now) : 'nunca'}</p>
        <Button size="icon" variant="ghost" onClick={p.onRefresh} aria-label="Atualizar agora" disabled={p.refreshing}>
          {p.refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
