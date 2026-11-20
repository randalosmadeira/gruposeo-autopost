import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { TailReport } from '@/lib/taxonomy-api';

interface Props { canEdit: boolean; busy: boolean; paidBlocked: boolean; report: TailReport | null; hasSegment: boolean; onImport: (text: string) => Promise<boolean> }

/**
 * Cauda (buscas específicas): lista GERADA POR AGENTE DE IA conforme as regras de Google, Bing, Gemini etc. O agente decide o tamanho, o público e os motores
 * de cada busca; aqui ela entra como "sugerida" (origem: Agente de IA), o dono revisa na árvore e só a aprovada vira consulta do plano.
 */
export function TailBoard({ canEdit, busy, paidBlocked, report, hasSegment, onImport }: Props) {
  const [text, setText] = useState('');
  return (
    <section aria-labelledby="tx-tail" className="space-y-3 border-t pt-3">
      <h3 id="tx-tail" className="text-sm font-semibold">Buscas específicas (cauda) geradas por agente de IA</h3>
      <p className="text-xs text-muted-foreground">Quem escreve a cauda é o <strong>agente de IA</strong>, seguindo as regras de cada motor (Google, Bing, Gemini e outros): eu não imponho lista fixa, tamanho nem número de palavras. A lista entra como <strong>sugerida</strong>, com o motivo, o público e os motores que o agente indicou, e você aprova ou rejeita na árvore acima. Aceito JSON (lista de buscas ou lista de objetos com <code>label</code>, <code>parent</code>, <code>engines</code>, <code>publico</code>, <code>rationale</code>) ou uma busca por linha.</p>
      <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await onImport(text)) setText(''); }}>
        <label htmlFor="tl-text" className="text-sm font-medium">Lista do agente</label>
        <Textarea id="tl-text" className="min-h-28 font-mono text-xs" value={text} disabled={!canEdit} placeholder={'[{"label":"tornozeleira apitando o que fazer","parent":"criminal","engines":["google_serp"],"publico":"família do preso","rationale":"dúvida muito repetida"}]'} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canEdit || busy || !text.trim()}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Guardando…</> : 'Trazer a cauda do agente'}</Button>
          <Button type="button" variant="outline" disabled aria-describedby="tl-paid">Pedir a cauda ao agente</Button>
          <p id="tl-paid" className="text-xs text-muted-foreground">{paidBlocked ? 'Pedir ao agente é serviço pago e está bloqueado globalmente por enquanto.' : 'O agente que gera a cauda ainda não está ligado ao sistema.'} Enquanto isso, cole a lista que ele produziu.</p>
        </div>
        {!hasSegment && <p className="text-xs text-muted-foreground">Dica: escolha o tipo de negócio no alto da página para eu tentar achar a área das buscas que o agente não indicou.</p>}
      </form>
      {report && (
        <div role="status" className="space-y-1 rounded border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <p>{report.added} busca(s) específica(s) sugerida(s){report.already_there ? `; ${report.already_there} já estavam` : ''}{report.duplicates ? `; ${report.duplicates} repetida(s)` : ''}{report.invalid ? `; ${report.invalid} não coube(ram) no campo` : ''}.</p>
          {report.warnings.length > 0 && <ul className="list-disc pl-5 text-xs">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          {report.unattached.length > 0 && <p className="break-words text-xs">Sem área: {report.unattached.slice(0, 5).join('; ')}{report.unattached_count > 5 ? '…' : ''}</p>}
        </div>
      )}
    </section>
  );
}
