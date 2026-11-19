import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TEMPLATES, TEMPLATE_LABEL, type FunnelConfig, type MetricKind } from '../../../supabase/functions/_shared/funnel-core';
import { addCount, addExtra, addIndicator, addStage, moveCount, removeIndicator, removeMetric, removeStage, type NewIndicator } from '../../../supabase/functions/_shared/funnel-edit';

const KIND_LABEL: Record<MetricKind, string> = { count: 'quantidade', minutes: 'minutos', days: 'dias', number: 'número' };
const IND_KIND: Array<[NewIndicator['kind'], string]> = [['ratio', 'Razão entre duas colunas (ex.: contratos ÷ análises)'], ['metric', 'Um número de apoio (ex.: tempo de resposta)'], ['per_week', 'Uma contagem por semana']];

interface Props { config: FunnelConfig; version: number; busy: boolean; canWrite: boolean; templateLabel: string; onSave: (c: FunnelConfig) => void; onReset: (templateId: string) => void }

function describeIndicator(c: FunnelConfig, i: FunnelConfig['stages'][number]['indicators'][number]): string {
  const name = (k: string) => [...c.counts, ...c.extras].find((m) => m.key === k)?.label || k;
  if (i.kind === 'ratio') return `${name(i.numerator)} ÷ ${name(i.denominator)}`;
  return i.kind === 'per_week' ? `${name(i.metric)} por semana` : name(i.metric);
}

function AddIndicator({ config, stageKey, disabled, onAdd }: { config: FunnelConfig; stageKey: string; disabled: boolean; onAdd: (stage: string, ind: NewIndicator) => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<NewIndicator['kind']>('ratio');
  const counts = config.counts;
  const numeric = config.extras;
  const [a, setA] = useState(counts[1]?.key || counts[0]?.key || '');
  const [b, setB] = useState(counts[0]?.key || '');
  const [m, setM] = useState('');
  const metricOptions = kind === 'per_week' ? counts : [...numeric, ...counts];
  const metric = metricOptions.some((x) => x.key === m) ? m : metricOptions[0]?.key || '';
  const ok = label.trim().length >= 2 && (kind === 'ratio' ? a !== '' && b !== '' && a !== b : metric !== '');
  const id = `ind-${stageKey}`;
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <p className="text-xs font-medium">Adicionar indicador a esta etapa</p>
      <Input aria-label={`Nome do novo indicador da etapa ${stageKey}`} placeholder="Nome do indicador (ex.: Contratos ÷ análises)" disabled={disabled} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
      <select id={`${id}-kind`} aria-label="Tipo de indicador" className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={disabled} value={kind} onChange={(e) => setKind(e.target.value as NewIndicator['kind'])}>
        {IND_KIND.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
      {kind === 'ratio' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <select aria-label="Parte de cima da razão" className="h-9 rounded-md border bg-background px-2 text-sm" disabled={disabled} value={a} onChange={(e) => setA(e.target.value)}>{counts.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          <select aria-label="Parte de baixo da razão" className="h-9 rounded-md border bg-background px-2 text-sm" disabled={disabled} value={b} onChange={(e) => setB(e.target.value)}>{counts.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </div>
      ) : (
        <select aria-label="Número do indicador" className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={disabled} value={metric} onChange={(e) => setM(e.target.value)}>{metricOptions.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      )}
      <Button type="button" size="sm" variant="outline" disabled={disabled || !ok} onClick={() => {
        onAdd(stageKey, kind === 'ratio' ? { label, kind: 'ratio', numerator: a, denominator: b } : { label, kind, metric });
        setLabel('');
      }}><Plus className="mr-1 h-3.5 w-3.5" aria-hidden />Adicionar indicador</Button>
    </div>
  );
}

/** Editor completo do funil: renomear, adicionar, remover e reordenar colunas, números de apoio, etapas e indicadores. Só grava ao clicar em "Salvar ajustes". */
export function ConfigEditor({ config, version, busy, canWrite, templateLabel, onSave, onReset }: Props) {
  const [draft, setDraft] = useState<FunnelConfig>(config);
  const [reset, setReset] = useState('');
  const [note, setNote] = useState('');
  const [newCount, setNewCount] = useState('');
  const [newExtra, setNewExtra] = useState('');
  const [newExtraKind, setNewExtraKind] = useState<MetricKind>('number');
  const [newStage, setNewStage] = useState('');
  const [newStageGoal, setNewStageGoal] = useState('');
  useEffect(() => { setDraft(config); setNote(''); }, [config, version]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);
  const off = !canWrite || busy;
  const rename = (kind: 'counts' | 'extras', i: number, label: string) => setDraft((d) => ({ ...d, template: 'custom', [kind]: d[kind].map((m, j) => (j === i ? { ...m, label } : m)) }));
  const setStage = (i: number, patch: Partial<FunnelConfig['stages'][number]>) => setDraft((d) => ({ ...d, template: 'custom', stages: d.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const drop = (key: string, label: string) => {
    const r = removeMetric(draft, key);
    if (r.blocked) { setNote(r.blocked); return; }
    setDraft(r.config);
    setNote(r.removedIndicators.length ? `"${label}" foi removido, e com ele os indicadores: ${r.removedIndicators.join('; ')}.` : `"${label}" foi removido.`);
  };
  return (
    <details className="group rounded-xl border bg-card/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span><span className="block text-lg font-semibold">Ajustar o funil</span><span className="block text-sm text-muted-foreground">Modelo atual: {templateLabel}. Renomeie, adicione, remova e reordene colunas, números de apoio, etapas e indicadores.</span></span>
        <span className="shrink-0 rounded-full border px-3 py-1 text-xs group-open:hidden">Abrir</span>
      </summary>
      <div className="space-y-6 border-t p-3 sm:p-5">
        {note && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-sm">{note}</p>}

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-primary">Colunas do funil (a ordem é a do funil)</legend>
          <ul className="space-y-2">
            {draft.counts.map((m, i) => (
              <li key={m.key} className="flex items-center gap-1.5">
                <Input aria-label={`Nome da coluna ${i + 1}`} disabled={off} value={m.label} maxLength={80} onChange={(e) => rename('counts', i, e.target.value)} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Subir a coluna ${m.label}`} disabled={off || i === 0} onClick={() => setDraft(moveCount(draft, i, -1))}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Descer a coluna ${m.label}`} disabled={off || i === draft.counts.length - 1} onClick={() => setDraft(moveCount(draft, i, 1))}><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover a coluna ${m.label}`} disabled={off} onClick={() => drop(m.key, m.label)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2"><Input aria-label="Nome da nova coluna" placeholder="Nova coluna (ex.: Propostas enviadas)" disabled={off || draft.counts.length >= 10} value={newCount} maxLength={80} onChange={(e) => setNewCount(e.target.value)} />
            <Button type="button" variant="outline" disabled={off || newCount.trim().length < 2 || draft.counts.length >= 10} onClick={() => { setDraft(addCount(draft, newCount)); setNewCount(''); setNote(''); }}><Plus className="mr-1 h-4 w-4" aria-hidden />Adicionar coluna</Button></div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-primary">Números de apoio (tempos, médias, contatos de uma origem)</legend>
          <ul className="space-y-2">
            {draft.extras.map((m, i) => (
              <li key={m.key} className="flex items-center gap-1.5">
                <Input aria-label={`Nome do número de apoio ${i + 1}`} disabled={off} value={m.label} maxLength={80} onChange={(e) => rename('extras', i, e.target.value)} />
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{KIND_LABEL[m.kind]}</span>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover o número ${m.label}`} disabled={off} onClick={() => drop(m.key, m.label)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2"><Input className="min-w-[12rem] flex-1" aria-label="Nome do novo número de apoio" placeholder="Novo número (ex.: Tempo até a proposta)" disabled={off || draft.extras.length >= 12} value={newExtra} maxLength={80} onChange={(e) => setNewExtra(e.target.value)} />
            <select aria-label="Unidade do novo número" className="h-10 rounded-md border bg-background px-2 text-sm" disabled={off} value={newExtraKind} onChange={(e) => setNewExtraKind(e.target.value as MetricKind)}>
              {(['number', 'count', 'minutes', 'days'] as MetricKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <Button type="button" variant="outline" disabled={off || newExtra.trim().length < 2 || draft.extras.length >= 12} onClick={() => { setDraft(addExtra(draft, newExtra, newExtraKind)); setNewExtra(''); setNote(''); }}><Plus className="mr-1 h-4 w-4" aria-hidden />Adicionar número</Button></div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-primary">Etapas e indicadores</legend>
          {draft.stages.map((s, i) => (
            <div key={s.key} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-1.5">
                <Input aria-label={`Nome da etapa ${i + 1}`} disabled={off} value={s.label} maxLength={80} onChange={(e) => setStage(i, { label: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover a etapa ${s.label}`} disabled={off || draft.stages.length <= 1} onClick={() => { setDraft(removeStage(draft, s.key)); setNote(`A etapa "${s.label}" foi removida.`); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <Input aria-label={`Objetivo da etapa ${i + 1}`} disabled={off} value={s.goal} maxLength={280} onChange={(e) => setStage(i, { goal: e.target.value })} />
              <Input aria-label={`Lembrete de regra da etapa ${i + 1} (opcional)`} placeholder="Lembrete de regra do conselho ou da marca (opcional)" disabled={off} value={s.compliance || ''} maxLength={280} onChange={(e) => setStage(i, { compliance: e.target.value || undefined })} />
              <ul className="space-y-1.5">
                {s.indicators.map((ind) => (
                  <li key={ind.key} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-sm">
                    <span className="min-w-0"><span className="font-medium">{ind.label}</span><span className="block break-words text-xs text-muted-foreground">{describeIndicator(draft, ind)}</span></span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remover o indicador ${ind.label}`} disabled={off} onClick={() => setDraft(removeIndicator(draft, s.key, ind.key))}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                ))}
                {!s.indicators.length && <li className="text-xs text-muted-foreground">Esta etapa ainda não tem indicador.</li>}
              </ul>
              {s.indicators.length < 4 && <AddIndicator config={draft} stageKey={s.key} disabled={off} onAdd={(st, ind) => { setDraft(addIndicator(draft, st, ind)); setNote(''); }} />}
            </div>
          ))}
          {draft.stages.length < 10 && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Adicionar etapa</p>
              <Input aria-label="Nome da nova etapa" placeholder="Nome da etapa (ex.: 7. Pós-venda)" disabled={off} value={newStage} maxLength={80} onChange={(e) => setNewStage(e.target.value)} />
              <Input aria-label="Objetivo da nova etapa" placeholder="Objetivo da etapa" disabled={off} value={newStageGoal} maxLength={280} onChange={(e) => setNewStageGoal(e.target.value)} />
              <Button type="button" variant="outline" disabled={off || newStage.trim().length < 2} onClick={() => { setDraft(addStage(draft, newStage, newStageGoal)); setNewStage(''); setNewStageGoal(''); setNote(''); }}><Plus className="mr-1 h-4 w-4" aria-hidden />Adicionar etapa</Button>
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="funnel-reset" className="text-sm text-muted-foreground">Recomeçar a partir de outro modelo:</label>
            <select id="funnel-reset" className="h-9 rounded-md border bg-background px-2 text-sm" disabled={off} value={reset} onChange={(e) => setReset(e.target.value)}>
              <option value="">escolher…</option>
              {Object.keys(TEMPLATES).map((id) => <option key={id} value={id}>{TEMPLATE_LABEL[id]}</option>)}
            </select>
            {reset && <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => { onReset(reset); setReset(''); }}>Trocar (mantém os números já lançados)</Button>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground" aria-live="polite">{dirty ? 'Ajustes não salvos' : 'Nada para salvar'}</span>
            <Button type="button" disabled={off || !dirty} onClick={() => onSave(draft)}>{busy ? 'Salvando…' : 'Salvar ajustes'}</Button>
          </div>
        </div>
      </div>
    </details>
  );
}
