import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { optionList, UNKNOWN_LABELS, type FieldDef, type FieldValue } from '../../../supabase/functions/_shared/profile-registry';

interface Props {
  field: FieldDef;
  value: FieldValue | undefined;
  error?: string;
  disabled?: boolean;
  /** valor veio do projeto antigo ou do banco, e não foi digitado agora */
  fromSystem?: boolean;
  onChange: (value: FieldValue | null) => void;
}

const ERROR_TEXT: Record<string, string> = {
  invalid_cnpj: 'Esse CNPJ não confere. Confira os números.',
  too_long: 'Texto longo demais.',
  option_not_allowed: 'Escolha uma das opções.',
  number_invalid: 'Informe um número válido.',
  percent_invalid: 'Use um valor de 0 a 100.',
  percent_sum_exceeds_100: 'As três partes da receita somam mais de 100%.',
  color_invalid: 'Cor inválida.',
  list_too_long: 'Itens demais.',
  private_not_allowed: 'Só dono e administrador podem informar isto.',
};

const asList = (v: FieldValue | undefined): string[] => (Array.isArray(v) ? v : []);
const asText = (v: FieldValue | undefined): string => (typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'string' ? v : '');

export function ProfileField({ field, value, error, disabled, fromSystem, onChange }: Props) {
  const uid = useId();
  const id = `pf-${field.key}-${uid}`;
  const helpId = `${id}-help`;
  const [glossOpen, setGlossOpen] = useState(false);
  const [extra, setExtra] = useState('');
  const options = optionList(field);
  const unknownNow = field.gloss && (Array.isArray(value) ? value.some((x) => UNKNOWN_LABELS.includes(x)) : typeof value === 'string' && UNKNOWN_LABELS.includes(value));
  const showGloss = !!field.gloss && (glossOpen || !!unknownNow);
  const filled = value !== undefined && value !== '' && !(Array.isArray(value) && !value.length);
  const suggestion = field.suggest !== undefined && !filled && !disabled ? field.suggest : undefined;
  const wide = field.type === 'textarea' || field.type === 'single' || field.type === 'multi';
  const describedBy = [field.hint ? helpId : '', error ? `${id}-err` : '', showGloss ? `${id}-gloss` : ''].filter(Boolean).join(' ') || undefined;

  const label = (
    <div className="flex flex-wrap items-center gap-2">
      <Label id={`${id}-label`} htmlFor={field.type === 'single' || field.type === 'multi' ? undefined : id} className="text-sm font-medium">{field.label}</Label>
      {fromSystem && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">já no sistema</span>}
      {field.gloss && (
        <button type="button" className="rounded border px-1.5 text-xs text-primary hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-expanded={showGloss} aria-controls={`${id}-gloss`} onClick={() => setGlossOpen((o) => !o)}>
          O que é {field.gloss[0]}?
        </button>
      )}
    </div>
  );

  let control: JSX.Element;
  if (field.type === 'text') {
    control = <Input id={id} value={asText(value)} disabled={disabled} maxLength={field.max ?? 4000} placeholder={field.placeholder} aria-describedby={describedBy} aria-invalid={!!error} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />;
  } else if (field.type === 'textarea') {
    control = <Textarea id={id} className="min-h-24" value={asText(value)} disabled={disabled} maxLength={4000} placeholder={field.placeholder} aria-describedby={describedBy} aria-invalid={!!error} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />;
  } else if (field.type === 'money' || field.type === 'number') {
    control = <Input id={id} inputMode="decimal" value={asText(value)} disabled={disabled} placeholder={field.type === 'money' ? 'R$' : 'Número'} aria-describedby={describedBy} aria-invalid={!!error} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />;
  } else if (field.type === 'percent') {
    const n = typeof value === 'number' ? value : 0;
    control = (
      <div className="flex items-center gap-3">
        <input id={id} type="range" min={0} max={100} step={5} value={n} disabled={disabled} aria-describedby={describedBy} className="flex-1" onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={id} className="w-12 text-right text-sm tabular-nums">{n}%</output>
      </div>
    );
  } else if (field.type === 'color') {
    control = (
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={typeof value === 'string' ? value : '#888888'} disabled={disabled} aria-describedby={describedBy} className="h-9 w-14 cursor-pointer rounded border bg-background" onChange={(e) => onChange(e.target.value)} />
        <span className="text-xs text-muted-foreground">{typeof value === 'string' ? value : 'não definida'}</span>
        {typeof value === 'string' && !disabled && <button type="button" className="text-xs underline" onClick={() => onChange(null)}>limpar</button>}
      </div>
    );
  } else {
    const multi = field.type === 'multi';
    const selected = multi ? asList(value) : [typeof value === 'string' ? value : ''];
    const extras = multi ? selected.filter((s) => !options.some((o) => o.value === s)) : [];
    const toggle = (v: string) => {
      if (!multi) return onChange(selected[0] === v ? null : v);
      const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
      onChange(next.length ? next : null);
    };
    control = (
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex flex-wrap gap-2">
        {[...options, ...extras.map((e) => ({ value: e, label: e }))].map((o) => {
          const on = selected.includes(o.value);
          const dk = UNKNOWN_LABELS.includes(o.value);
          return (
            <button key={o.value} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggle(o.value)}
              className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent', dk && !on && 'border-dashed')}>
              {o.label}
            </button>
          );
        })}
        {multi && field.allowOther && !disabled && (
          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const t = extra.trim(); if (t && !selected.includes(t)) onChange([...selected.filter(Boolean), t]); setExtra(''); }}>
            <Input aria-label={`Outro item para ${field.label}`} className="h-8 w-36" value={extra} maxLength={60} placeholder="Outro…" onChange={(e) => setExtra(e.target.value)} />
            <button type="submit" className="text-sm underline">adicionar</button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5', wide ? 'md:col-span-2' : '')} data-field={field.key}>
      {label}
      {control}
      {field.hint && <p id={helpId} className="text-xs text-muted-foreground">{field.hint}</p>}
      {suggestion !== undefined && (
        <button type="button" className="w-fit rounded border border-dashed px-2 py-1 text-xs text-primary hover:bg-accent" onClick={() => onChange(suggestion as FieldValue)}>
          Sugestão: {Array.isArray(suggestion) ? suggestion.join(' e ') : String(suggestion)}{field.type === 'percent' ? '%' : ''} (clique para usar)
        </button>
      )}
      {showGloss && field.gloss && (
        <div id={`${id}-gloss`} role="note" className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
          <strong>{field.gloss[0]}.</strong> {field.gloss[1]}
        </div>
      )}
      {error && <p id={`${id}-err`} role="alert" className="text-sm text-destructive">{ERROR_TEXT[error] || 'Confira este campo.'}</p>}
    </div>
  );
}
