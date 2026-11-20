import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EdgeRow, NodeRow } from '@/lib/taxonomy-api';

export const STATUS_LABEL: Record<NodeRow['status'], string> = { sugerido: 'Sugerido', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
export const SOURCE_LABEL: Record<string, string> = { pacote: 'Pacote do segmento', site: 'Site', search_console: 'Google (Search Console)', manual: 'Criado à mão', ibge: 'IBGE', agente: 'Agente de IA' };
const KIND_LABEL: Record<NodeRow['kind'], string> = { matriz: 'Área matriz', subarea: 'Subárea', nicho: 'Nicho', cauda: 'Busca específica (cauda)' };
const STATUS_CLS: Record<NodeRow['status'], string> = {
  sugerido: 'border-dashed text-muted-foreground', aprovado: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', rejeitado: 'border-red-500/50 bg-red-500/10 text-red-300 line-through',
};
const SELECT = 'mt-1 h-10 max-w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';

export function StatusChip({ s }: { s: NodeRow['status'] }) {
  return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-4 ${STATUS_CLS[s]}`}>{STATUS_LABEL[s]}</span>;
}

type Ev = { total?: number; site?: { count?: number; exemplos?: string[] }; search_console?: { count?: number; weight?: number; exemplos?: string[] }; motivo?: string | null; termo?: string; em?: string; gerado_por?: string; publico?: string | null; motores?: string[] };
function evidenceText(n: NodeRow): string {
  const e = (n.evidence || {}) as Ev;
  const parts: string[] = [];
  if (e.site?.count) parts.push(`${e.site.count} no site`);
  if (e.search_console?.count) parts.push(`${e.search_console.count} no Google${e.search_console.weight ? ` (${e.search_console.weight.toLocaleString('pt-BR')} impressões)` : ''}`);
  if (e.gerado_por === 'agente') {
    const bits = [e.motivo ? `motivo do agente: ${e.motivo}` : 'sugerida pelo agente de IA'];
    if (e.publico) bits.push(`público: ${e.publico}`);
    if (e.motores?.length) bits.push(`motores: ${e.motores.join(', ')}`);
    return bits.join(' · ');
  }
  if (!parts.length && e.termo) return `termo "${e.termo}" apareceu ${e.total ?? 0}× em ${e.em ?? 'esta subárea'}`;
  if (!parts.length) return e.motivo ? e.motivo : 'sem evidências ainda';
  return parts.join(' · ');
}
const examples = (n: NodeRow): string[] => { const e = (n.evidence || {}) as Ev; return [...(e.search_console?.exemplos ?? []), ...(e.site?.exemplos ?? [])].slice(0, 5); };

interface RowProps { node: NodeRow; canEdit: boolean; busy: boolean; depth: number; onDecide: (ids: string[], d: NodeRow['status']) => void; onRename: (id: string, label: string) => void; children?: React.ReactNode; correlatos?: string[] }

function NodeRowView({ node, canEdit, busy, depth, onDecide, onRename, children, correlatos }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.label);
  const ex = examples(node);
  return (
    <li className={depth ? 'mt-2 border-l pl-3' : 'rounded-lg border bg-background/40 p-3'}>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim().length >= 2) { onRename(node.id, draft.trim()); setEditing(false); } }}>
            <Input aria-label={`Novo nome de ${node.label}`} className="h-9 w-56 max-w-full" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button size="sm" type="submit" disabled={busy}>Salvar nome</Button>
            <Button size="sm" type="button" variant="outline" onClick={() => { setEditing(false); setDraft(node.label); }}>Cancelar</Button>
          </form>
        ) : <span className={`break-words font-medium ${node.kind === 'matriz' ? 'text-base' : 'text-sm'}`}>{node.label}</span>}
        <span className="text-[11px] text-muted-foreground">{KIND_LABEL[node.kind]}</span>
        <StatusChip s={node.status} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{evidenceText(node)} · origem: {SOURCE_LABEL[node.source] ?? node.source}</p>
      {ex.length > 0 && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Ver exemplos ({ex.length})</summary>
          <ul className="mt-1 space-y-0.5 break-all text-muted-foreground">{ex.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}
      {correlatos && correlatos.length > 0 && <p className="mt-1 text-xs"><strong>Nichos correlatos:</strong> <span className="break-words text-muted-foreground">{correlatos.join('; ')}</span></p>}
      {canEdit && !editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          {node.status !== 'aprovado' && <Button size="sm" variant="outline" disabled={busy} aria-label={`Aprovar ${node.label}`} onClick={() => onDecide([node.id], 'aprovado')}>Aprovar</Button>}
          {node.status !== 'rejeitado' && <Button size="sm" variant="outline" disabled={busy} aria-label={`Rejeitar ${node.label}`} onClick={() => onDecide([node.id], 'rejeitado')}>Rejeitar</Button>}
          {node.status !== 'sugerido' && <Button size="sm" variant="ghost" disabled={busy} aria-label={`Voltar ${node.label} para sugerido`} onClick={() => onDecide([node.id], 'sugerido')}>Voltar para sugerido</Button>}
          <Button size="sm" variant="ghost" disabled={busy} aria-label={`Renomear ${node.label}`} onClick={() => setEditing(true)}>Renomear</Button>
        </div>
      )}
      {children}
    </li>
  );
}

/** Árvore área matriz > subárea > nicho, com status, evidências e os nichos correlatos de cada área matriz. */
export function AreaTree({ nodes, edges, canEdit, busy, onDecide, onRename }: { nodes: NodeRow[]; edges: EdgeRow[]; canEdit: boolean; busy: boolean; onDecide: (ids: string[], d: NodeRow['status']) => void; onRename: (id: string, label: string) => void }) {
  const { roots, kids, labelOf } = useMemo(() => {
    const kids = new Map<string, NodeRow[]>();
    for (const n of nodes) if (n.parent_id) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
    const weight = (n: NodeRow) => Number(((n.evidence || {}) as Ev).total ?? 0);
    const sort = (l: NodeRow[]) => [...l].sort((a, b) => weight(b) - weight(a) || a.label.localeCompare(b.label, 'pt-BR'));
    for (const [k, v] of kids) kids.set(k, sort(v));
    return { roots: sort(nodes.filter((n) => !n.parent_id)), kids, labelOf: new Map(nodes.map((n) => [n.id, n.label])) };
  }, [nodes]);
  if (!nodes.length) return <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">Sem dados. Clique em "Sugerir a partir do site e do Google" ou carregue o pacote do segmento.</p>;
  const corr = (id: string): string[] => edges.filter((e) => e.from_id === id || e.to_id === id).map((e) => {
    const other = labelOf.get(e.from_id === id ? e.to_id : e.from_id) ?? '?';
    return `${other}${e.note ? ` (${e.note})` : ''}${e.source !== 'pacote' ? ` · ${e.weight}× nos dados` : ''}`;
  });
  const render = (n: NodeRow, depth: number): React.ReactNode => (
    <NodeRowView key={n.id} node={n} depth={depth} canEdit={canEdit} busy={busy} onDecide={onDecide} onRename={onRename} correlatos={n.kind === 'matriz' ? corr(n.id) : undefined}>
      {(kids.get(n.id) ?? []).length > 0 && (
        <details className="mt-2" open={depth === 0 && n.status !== 'rejeitado' && (kids.get(n.id) ?? []).length <= 12}>
          <summary className="cursor-pointer text-xs text-muted-foreground">{(kids.get(n.id) ?? []).length} {n.kind === 'matriz' ? 'item(ns) dentro (subáreas, nichos e buscas específicas)' : 'nicho(s) e busca(s) específica(s)'}</summary>
          <ul>{(kids.get(n.id) ?? []).map((k) => render(k, depth + 1))}</ul>
        </details>
      )}
    </NodeRowView>
  );
  return <ul className="space-y-3" aria-label="Árvore de áreas">{roots.map((n) => render(n, 0))}</ul>;
}

/** Cria uma área, subárea ou nicho à mão (para negócios sem pacote de segmento ou com algo que o sistema não viu). */
export function AddNodeForm({ nodes, disabled, onCreate }: { nodes: NodeRow[]; disabled: boolean; onCreate: (kind: NodeRow['kind'], parentId: string | null, label: string) => Promise<boolean> }) {
  const [kind, setKind] = useState<NodeRow['kind']>('matriz');
  const [parent, setParent] = useState('');
  const [label, setLabel] = useState('');
  const parents = nodes.filter((n) => n.status !== 'rejeitado' && (kind === 'subarea' ? n.kind === 'matriz' : kind === 'nicho' ? n.kind === 'matriz' || n.kind === 'subarea' : kind === 'cauda' ? n.kind !== 'cauda' : false));
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); if (await onCreate(kind, kind === 'matriz' ? null : parent, label)) setLabel(''); }}>
      <div><label htmlFor="tx-new-kind" className="block text-xs text-muted-foreground">O que criar</label>
        <select id="tx-new-kind" className={SELECT} value={kind} disabled={disabled} onChange={(e) => { setKind(e.target.value as NodeRow['kind']); setParent(''); }}><option value="matriz">Área matriz</option><option value="subarea">Subárea</option><option value="nicho">Nicho</option><option value="cauda">Busca específica (cauda)</option></select></div>
      {kind !== 'matriz' && (
        <div><label htmlFor="tx-new-parent" className="block text-xs text-muted-foreground">Dentro de</label>
          <select id="tx-new-parent" className={`${SELECT} w-56`} value={parent} disabled={disabled} onChange={(e) => setParent(e.target.value)}><option value="">Escolha…</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
      )}
      <div><label htmlFor="tx-new-label" className="block text-xs text-muted-foreground">Nome</label>
        <Input id="tx-new-label" className="mt-1 h-10 w-64 max-w-full" value={label} disabled={disabled} onChange={(e) => setLabel(e.target.value)} /></div>
      <Button type="submit" variant="outline" disabled={disabled || label.trim().length < 2 || (kind !== 'matriz' && !parent)}>Criar e aprovar</Button>
    </form>
  );
}
