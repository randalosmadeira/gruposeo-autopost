import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Estado vazio útil: borda tracejada e texto que diz o que fazer em seguida. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{children}</p>;
}

const PERIOD_OPTIONS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: 'Últimos 7 dias' }, { days: 28, label: 'Últimos 28 dias' }, { days: 90, label: 'Últimos 90 dias' },
];

export function PeriodSelect({ id, days, onChange }: { id: string; days: number; onChange: (days: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Período</Label>
      <Select value={String(days)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{PERIOD_OPTIONS.map((o) => <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export interface KpiItem { id: string; label: string; value: string; note?: string }

/** Indicadores em cartões. O número vem primeiro; a nota explica em linguagem simples. */
export function KpiList({ items, label, testIdPrefix = 'kpi' }: { items: KpiItem[]; label: string; testIdPrefix?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label={label}>
      {items.map((k) => (
        <li key={k.id}>
          <Card className="h-full"><CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-bold tabular-nums" data-testid={`${testIdPrefix}-${k.id}`}>{k.value}</p>
            {k.note && <p className="text-xs text-muted-foreground">{k.note}</p>}
          </CardContent></Card>
        </li>
      ))}
    </ul>
  );
}
