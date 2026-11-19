import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { FunnelConfig } from '../../../supabase/functions/_shared/funnel-core';
import { parsePaste } from '../../../supabase/functions/_shared/funnel-edit';
import { monthLabel } from '@/lib/funnel-format';

/** Traz números de uma planilha: cola a tabela (com os mesmos nomes de coluna do funil), confere a prévia e importa mês a mês. */
export function PasteImport({ config, canWrite, busy, onImport }: { config: FunnelConfig; canWrite: boolean; busy: boolean; onImport: (months: Record<string, Record<string, string>>) => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parsePaste(config, text) : null), [config, text]);
  const months = parsed ? Object.keys(parsed.months).sort() : [];
  const cells = parsed ? months.reduce((n, m) => n + Object.keys(parsed.months[m]).length, 0) : 0;
  return (
    <details className="group rounded-xl border bg-card/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span><span className="block text-lg font-semibold">Importar da planilha</span><span className="block text-sm text-muted-foreground">Cole uma tabela do Excel ou Google Planilhas: um mês por linha, colunas com os mesmos nomes do funil.</span></span>
        <span className="shrink-0 rounded-full border px-3 py-1 text-xs group-open:hidden">Abrir</span>
      </summary>
      <div className="space-y-3 border-t p-3 sm:p-5">
        <label htmlFor="funnel-paste" className="text-sm font-medium">Tabela colada</label>
        <Textarea id="funnel-paste" className="min-h-32 font-mono text-xs" disabled={!canWrite || busy} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={`Mês\t${config.counts.slice(0, 3).map((c) => c.label).join('\t')}\n2026-09\t100\t40\t30\n2026-10\t120\t42\t21`} />
        <p className="text-xs text-muted-foreground">Aceita meses como 2026-10, 10/2026 ou out/2026. Célula vazia é ignorada (nunca vira zero). Colunas que não têm o nome de um número do funil são ignoradas.</p>
        {parsed && (
          <div className="space-y-1.5 rounded-lg border bg-background/40 p-3 text-sm" aria-live="polite">
            {parsed.matchedColumns.length > 0 && <p><strong>Colunas reconhecidas:</strong> {parsed.matchedColumns.join(', ')}.</p>}
            {parsed.unknownColumns.length > 0 && <p className="text-amber-300"><strong>Ignoradas (nome não confere):</strong> {parsed.unknownColumns.join(', ')}.</p>}
            {months.length > 0 && <p><strong>{months.length} mês(es), {cells} número(s):</strong> {months.map((m) => monthLabel(m)).join(', ')}.</p>}
            {parsed.errors.map((e) => <p key={e} role="alert" className="text-red-400">{e}</p>)}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" disabled={!canWrite || busy || !parsed || !months.length} onClick={() => { if (parsed) onImport(parsed.months); }}>{busy ? 'Importando…' : `Importar ${months.length || ''} mês(es)`}</Button>
        </div>
      </div>
    </details>
  );
}
