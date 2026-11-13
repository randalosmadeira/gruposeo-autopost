import { useState } from 'react';
import { Crosshair, Globe, Layers, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  SOURCE_TYPE_ORDER, engineLabel, formatDateTime, formatPercent, formatScore, rise, sourceTypeLabel,
} from '@/lib/nexus-visibility';
import type { RequestKind } from '@/types/nexus-requests';
import type { SourceRow, SourceType, SourcesData } from '@/types/nexus-visibility';
import { EmptyState, ErrorState, LoadingBlock, Meter, PanelHeader, Pill } from './shared';

const ALL = '__all';

export interface SourcesViewProps {
  data: SourcesData | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  canManage: boolean;
  type: SourceType | '';
  onTypeChange: (t: SourceType | '') => void;
  onRequest: (kind: RequestKind, message: string) => void;
}

const COMPONENTS: Array<{ key: keyof Pick<SourceRow, 'coverage' | 'position' | 'diversity' | 'recency' | 'relevance'>; label: string; weight: number; hint: string }> = [
  { key: 'coverage', label: 'Cobertura', weight: 0.40, hint: 'Em quantas das suas perguntas a fonte aparece.' },
  { key: 'position', label: 'Posição', weight: 0.25, hint: 'Quanto mais perto do topo da resposta, maior.' },
  { key: 'diversity', label: 'Diversidade', weight: 0.20, hint: 'Quantas IAs diferentes citam a fonte.' },
  { key: 'recency', label: 'Recência', weight: 0.10, hint: 'Citada recentemente (cai pela metade a cada 30 dias).' },
  { key: 'relevance', label: 'Relevância', weight: 0.05, hint: 'Parte das citações que cai nos seus temas.' },
];

function ScoreCell({ zss }: { zss: number | null }) {
  return (
    <span className="flex items-center justify-end gap-2.5 md:min-w-[8rem]">
      <span className="hidden w-16 md:block"><Meter value={zss} max={100} label={`Nota da fonte: ${formatScore(zss)} de 100`} /></span>
      <strong className="w-8 text-right text-base tabular-nums" data-testid="zss-value">{formatScore(zss)}</strong>
    </span>
  );
}

function SourceDetail({ s, onClose }: { s: SourceRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!s} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {s && (
          <>
            <SheetHeader>
              <SheetTitle className="break-all">{s.host}</SheetTitle>
              <SheetDescription>{sourceTypeLabel(s.type)}{s.is_own ? ' · seu site' : ''}</SheetDescription>
            </SheetHeader>
            <div className="mt-5 space-y-5 zv">
              <p className="flex items-baseline gap-2"><span className="text-5xl font-bold tabular-nums">{formatScore(s.zss)}</span><span className="text-[var(--zv-muted)]">de 100 · nota da fonte</span></p>
              <ul className="space-y-3" aria-label="Como a nota é formada">
                {COMPONENTS.map((c) => (
                  <li key={c.key} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{c.label} <span className="text-xs font-normal text-[var(--zv-muted)]">peso {Math.round(c.weight * 100)}%</span></span><span className="tabular-nums">{formatPercent(s[c.key])}</span></div>
                    <Meter value={s[c.key]} label={`${c.label}: ${formatPercent(s[c.key])}`} />
                    <p className="text-xs text-[var(--zv-muted)]">{c.hint}</p>
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-[var(--zv-muted)]">Citações</dt><dd className="font-semibold tabular-nums">{s.citations}</dd></div>
                <div><dt className="text-xs text-[var(--zv-muted)]">Perguntas diferentes</dt><dd className="font-semibold tabular-nums">{s.queries}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-[var(--zv-muted)]">IAs que citam</dt><dd className="font-semibold">{s.engines.length ? s.engines.map(engineLabel).join(', ') : 'n/d'}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-[var(--zv-muted)]">Última citação</dt><dd className="font-semibold">{formatDateTime(s.last_seen)}</dd></div>
              </dl>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Fontes: domínios que as IAs citam, com a nota ZSS (0 a 100) e os alvos de presença. */
export function SourcesView({ data, loading, error, onRetry, canManage, type, onTypeChange, onRequest }: SourcesViewProps) {
  const [open, setOpen] = useState<SourceRow | null>(null);
  if (!data && loading) return <LoadingBlock label="Carregando as fontes" rows={3} />;
  if (!data && error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data) return null;

  const empty = data.sources.length === 0;
  return (
    <div className="space-y-5">
      {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}

      {data.targets.length > 0 && (
        <section aria-label="Alvos de presença" className="zv-panel p-5">
          <PanelHeader title="Onde ainda não aparecemos" hint="Fontes que as IAs mais usam e em que a sua marca ainda não está. Boas candidatas para ganhar presença." />
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.targets.map((t, i) => (
              <li key={t.host} style={rise(i)} className="zv-rise flex flex-col gap-1.5 rounded-xl bg-[var(--zv-surface-2)] p-3.5" data-testid="target">
                <span className="flex items-start justify-between gap-2"><span className="flex items-center gap-1.5 break-all text-sm font-semibold"><Crosshair className="h-3.5 w-3.5 shrink-0 text-[var(--zv-vr)]" aria-hidden="true" />{t.host}</span><Pill tone="info">Nota {formatScore(t.zss)}</Pill></span>
                <span className="text-xs text-[var(--zv-muted)]">{sourceTypeLabel(t.type)}</span>
                {t.why && <span className="text-sm">{t.why}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Fontes citadas" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PanelHeader title="Fontes que as IAs citam" hint="Nota de 0 a 100 (peso: cobertura 40%, posição 25%, diversidade 20%, recência 10%, relevância 5%)." />
          <div className="space-y-1.5">
            <Label htmlFor="zv-src-type">Tipo de fonte</Label>
            <Select value={type || ALL} onValueChange={(v) => onTypeChange(v === ALL ? '' : (v as SourceType))}>
              <SelectTrigger id="zv-src-type" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                {SOURCE_TYPE_ORDER.map((t) => <SelectItem key={t} value={t}>{sourceTypeLabel(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {empty ? (
          <EmptyState icon={<Globe className="h-5 w-5" />} title={type ? 'Nenhuma fonte deste tipo no período' : 'Ainda sem fontes citadas'}
            action={!canManage && !type ? <Button size="sm" onClick={() => onRequest('new_observation_round', 'Quero uma nova rodada de observação para mapear as fontes que as IAs citam.')}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Pedir uma coleta ao gestor</Button> : undefined}>
            {type ? 'Tente outro tipo ou um período maior.' : 'Quando as IAs citarem endereços nas respostas, eles aparecem aqui com a nota de cada fonte.'}
          </EmptyState>
        ) : (
          <div className="zv-panel overflow-hidden p-1 md:p-2">
            <table className="zv-table zv-stack" data-testid="sources-table">
              <caption className="sr-only">Fontes citadas pelas IAs, da maior para a menor nota</caption>
              <thead><tr><th scope="col">Fonte</th><th scope="col">Tipo</th><th scope="col" className="num">Nota</th><th scope="col">IAs</th><th scope="col" className="num">Citações</th><th scope="col">Última vez</th></tr></thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.host} data-clickable="true" data-testid="source-row" onClick={() => setOpen(s)} className={s.is_own ? 'zv-own-row' : undefined}>
                    <td data-primary="true">
                      <button type="button" className="flex flex-wrap items-center gap-1.5 break-all text-left font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(s); }} aria-label={`Ver detalhes de ${s.host}`}>
                        <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--zv-muted)]" aria-hidden="true" />{s.host}
                      </button>
                      {s.is_own && <Pill tone="info" className="ml-1.5">Seu site</Pill>}
                    </td>
                    <td data-label="Tipo">{sourceTypeLabel(s.type)}</td>
                    <td data-label="Nota" className="num"><ScoreCell zss={s.zss} /></td>
                    <td data-label="IAs">{s.engines.length ? `${s.engines.length} ${s.engines.length === 1 ? 'IA' : 'IAs'}` : 'n/d'}</td>
                    <td data-label="Citações" className="num">{s.citations}</td>
                    <td data-label="Última vez" className="text-[var(--zv-muted)]">{formatDateTime(s.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.truncated && <p className="text-xs text-[var(--zv-muted)]">Lista limitada às fontes mais relevantes do período.</p>}
      </section>
      <SourceDetail s={open} onClose={() => setOpen(null)} />
    </div>
  );
}
