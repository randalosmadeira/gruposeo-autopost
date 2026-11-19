import { useState } from 'react';
import { Check, EyeOff, Loader2, MessageSquarePlus, Plus, Swords, Trash2, Trophy } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  COMPETITOR_KINDS, COMPETITOR_MAX_DOMAINS, COMPETITOR_NAME_MAX, MIN_RANK_SAMPLE, competitorInputFromSuggestion, competitorKindLabel, engineLabel, formatPercent,
  formatSample, rise, suggestionRequestMessage, validateCompetitorForm, visibilityErrorMessage,
} from '@/lib/nexus-visibility';
import type { RequestKind } from '@/types/nexus-requests';
import type { CompetitorInput, CompetitorKind, CompetitorsData, RankingRow, SuggestedCompetitor, TrackedCompetitor } from '@/types/nexus-visibility';
import { EmptyState, ErrorState, LoadingBlock, Meter, PanelHeader, Pill } from './shared';

export interface CompetitorsViewProps {
  data: CompetitorsData | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Só o gestor escreve. O servidor revalida (403 `manager_required`). */
  canManage: boolean;
  onSave: (input: CompetitorInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onRequest: (kind: RequestKind, message: string) => void;
}

function RankingList({ rows }: { rows: RankingRow[] }) {
  const ranked = rows.filter((r) => !r.insufficient_sample && r.rank !== null);
  const sorted = [...rows].sort((a, b) => {
    if (a.insufficient_sample !== b.insufficient_sample) return a.insufficient_sample ? 1 : -1;
    return (a.rank ?? 999) - (b.rank ?? 999) || (b.vr ?? -1) - (a.vr ?? -1);
  });
  const maxVr = Math.max(0.01, ...rows.map((r) => r.vr ?? 0));
  return (
    <div className="space-y-3">
      {ranked.length === 0 && (
        <p role="status" className="rounded-xl bg-[var(--zv-warn-bg)] p-3 text-sm text-[var(--zv-warn)]" data-testid="ranking-insufficient">
          Ainda não dá para montar o ranking: precisamos de pelo menos {MIN_RANK_SAMPLE} observações por marca. Mostramos os números parciais abaixo, sem posição.
        </p>
      )}
      <ol className="space-y-2" aria-label="Ranking de visibilidade">
        {sorted.map((r, i) => (
          <li key={`${r.name}-${i}`} data-testid={r.is_own ? 'ranking-own' : 'ranking-row'} style={rise(i)}
            className={`zv-rise grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-1.5 rounded-xl border p-3 sm:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1.6fr)_5.5rem] ${r.is_own ? 'zv-own-row border-[var(--zv-own-line)]' : 'border-[var(--zv-line)]'} ${r.insufficient_sample ? 'opacity-80' : ''}`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--zv-surface-2)] text-sm font-bold tabular-nums" aria-label={r.rank !== null && !r.insufficient_sample ? `Posição ${r.rank}` : 'Sem posição'}>
              {r.rank !== null && !r.insufficient_sample ? (r.rank === 1 ? <Trophy className="h-4 w-4 text-[var(--zv-warn)]" aria-hidden="true" /> : r.rank) : '—'}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold">{r.name}</span>
                {r.is_own && <Pill tone="info">Sua marca</Pill>}
                {r.insufficient_sample && <Pill tone="warn" title={`Menos de ${MIN_RANK_SAMPLE} observações`}>Amostra insuficiente</Pill>}
              </span>
              <span className="block text-xs text-[var(--zv-muted)]">{formatSample(r.n)}</span>
            </span>
            <span className="col-span-2 space-y-1 sm:col-span-1">
              <Meter value={r.vr} max={maxVr} color={r.is_own ? 'var(--zv-vr)' : 'var(--zv-muted)'} label={`Visibilidade de ${r.name}: ${formatPercent(r.vr)}`} />
              <span className="block text-xs text-[var(--zv-muted)]">Visibilidade <strong className="text-[var(--zv-ink)] tabular-nums">{formatPercent(r.vr)}</strong></span>
            </span>
            <span className="col-span-2 text-xs text-[var(--zv-muted)] sm:col-span-1 sm:text-right">Participação <strong className="block text-base text-[var(--zv-ink)] tabular-nums sm:inline-block">{formatPercent(r.sov)}</strong></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SuggestionCard({ s, canManage, busy, onApprove, onIgnore, onRequest }: {
  s: SuggestedCompetitor; canManage: boolean; busy: boolean; onApprove: () => void; onIgnore: () => void; onRequest: () => void;
}) {
  return (
    <li className="zv-panel flex flex-col gap-2 p-4" data-testid="suggestion">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{s.name}</p>
          {s.domain && <p className="truncate text-xs text-[var(--zv-muted)]">{s.domain}</p>}
        </div>
        <Pill tone="neutral">{s.mentions} {s.mentions === 1 ? 'menção' : 'menções'}</Pill>
      </div>
      {s.reason && <p className="text-sm text-[var(--zv-muted)]">{s.reason}</p>}
      {s.engines.length > 0 && <p className="text-xs text-[var(--zv-muted)]">Apareceu em: {s.engines.map(engineLabel).join(', ')}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {canManage ? (
          <>
            <Button size="sm" onClick={onApprove} disabled={busy}>{busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}Aprovar</Button>
            <Button size="sm" variant="ghost" onClick={onIgnore} disabled={busy}><EyeOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Ignorar</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onRequest}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Solicitar</Button>
        )}
      </div>
    </li>
  );
}

function AddForm({ onSave }: { onSave: (input: CompetitorInput) => Promise<void> }) {
  const [name, setName] = useState('');
  const [domainsText, setDomainsText] = useState('');
  const [kind, setKind] = useState<CompetitorKind>('escritorio');
  const [errors, setErrors] = useState<{ name?: string; domains?: string }>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit() {
    const v = validateCompetitorForm({ name, domainsText });
    setErrors(v.errors); setServerError(null);
    if (!v.ok) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), domains: v.domains, kind, status: 'tracked' });
      setName(''); setDomainsText(''); setKind('escritorio');
    } catch (e) { setServerError(visibilityErrorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <form className="zv-panel space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label="Acompanhar um concorrente">
      <h3 className="text-sm font-semibold">Acompanhar um concorrente</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cmp-name">Nome</Label>
          <Input id="cmp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={COMPETITOR_NAME_MAX + 20} disabled={busy} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'cmp-name-err' : undefined} placeholder="Ex.: Escritório Exemplo" />
          {errors.name && <p id="cmp-name-err" role="alert" className="text-xs text-[var(--zv-bad)]">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cmp-domains">Endereços do site (separe por vírgula)</Label>
          <Input id="cmp-domains" value={domainsText} onChange={(e) => setDomainsText(e.target.value)} disabled={busy} aria-invalid={!!errors.domains} aria-describedby={errors.domains ? 'cmp-domains-err' : 'cmp-domains-hint'} placeholder="exemplo.com.br" />
          {errors.domains ? <p id="cmp-domains-err" role="alert" className="text-xs text-[var(--zv-bad)]">{errors.domains}</p> : <p id="cmp-domains-hint" className="text-xs text-[var(--zv-muted)]">Até {COMPETITOR_MAX_DOMAINS}. Pode colar o endereço completo: limpamos para você.</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cmp-kind">Tipo</Label>
          <select id="cmp-kind" value={kind} onChange={(e) => setKind(e.target.value as CompetitorKind)} disabled={busy}
            className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {COMPETITOR_KINDS.map((k) => <option key={k} value={k}>{competitorKindLabel(k)}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="mr-1 h-4 w-4" aria-hidden="true" />}Acompanhar</Button>
      </div>
      {serverError && <p role="alert" className="text-sm text-[var(--zv-bad)]">{serverError}</p>}
    </form>
  );
}

function TrackedList({ items, canManage, onAskRemove }: { items: TrackedCompetitor[]; canManage: boolean; onAskRemove: (c: TrackedCompetitor) => void }) {
  if (items.length === 0) return <p className="text-sm text-[var(--zv-muted)]">{canManage ? 'Nenhum concorrente acompanhado ainda. Aprove uma sugestão ou cadastre abaixo.' : 'O gestor ainda não cadastrou concorrentes para acompanhar.'}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Concorrentes acompanhados">
      {items.map((c) => (
        <li key={c.id} className="zv-panel flex flex-col gap-2 p-4" data-testid="tracked">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{c.name}</p>
              <p className="text-xs text-[var(--zv-muted)]">{competitorKindLabel(c.kind)}{c.domains.length ? ` · ${c.domains.join(', ')}` : ''}</p>
            </div>
            {canManage && <Button size="icon" variant="ghost" aria-label={`Remover ${c.name}`} onClick={() => onAskRemove(c)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--zv-muted)]">
            <span>Visibilidade <strong className="text-[var(--zv-ink)] tabular-nums">{formatPercent(c.vr)}</strong></span>
            <span>Participação <strong className="text-[var(--zv-ink)] tabular-nums">{formatPercent(c.sov)}</strong></span>
            <span>{c.mentions} {c.mentions === 1 ? 'menção' : 'menções'}</span>
            <span>{formatSample(c.n)}</span>
          </div>
          {c.insufficient_sample && <Pill tone="warn" className="w-fit" title={`Menos de ${MIN_RANK_SAMPLE} observações`}>Amostra insuficiente</Pill>}
        </li>
      ))}
    </ul>
  );
}

export function CompetitorsView({ data, loading, error, onRetry, canManage, onSave, onRemove, onRequest }: CompetitorsViewProps) {
  const [removing, setRemoving] = useState<TrackedCompetitor | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data && loading) return <LoadingBlock label="Carregando os concorrentes" rows={3} />;
  if (!data && error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data) return null;

  async function guarded(key: string, fn: () => Promise<void>) {
    setBusyKey(key); setActionError(null);
    try { await fn(); } catch (e) { setActionError(visibilityErrorMessage(e)); } finally { setBusyKey(null); }
  }
  const rows = data.ranking;
  const noContent = rows.length === 0 && data.tracked.length === 0 && data.suggested.length === 0 && data.own.n === 0;

  return (
    <div className="space-y-5">
      {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}
      {actionError && <p role="alert" className="rounded-xl border border-[var(--zv-bad)] p-3 text-sm text-[var(--zv-bad)]">{actionError}</p>}

      {noContent && (
        <EmptyState icon={<Swords className="h-5 w-5" />} title="Ainda sem dados de concorrentes"
          action={!canManage ? <Button size="sm" onClick={() => onRequest('other', 'Quero acompanhar concorrentes na página de Visibilidade. Pode me ajudar a escolher quais?')}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Solicitar ao gestor</Button> : undefined}>
          {canManage ? 'Cadastre os concorrentes abaixo. Quando houver observações, o ranking aparece aqui.' : 'Quando o gestor cadastrar os concorrentes e houver observações, o ranking aparece aqui.'}
        </EmptyState>
      )}

      {rows.length > 0 && (
        <section aria-label="Ranking" className="zv-panel p-5">
          <PanelHeader title="Quem as IAs lembram mais" hint={`Ranking por visibilidade. Só ranqueamos marcas com ${MIN_RANK_SAMPLE} observações ou mais.`} />
          <RankingList rows={rows} />
        </section>
      )}

      <section aria-label="Concorrentes acompanhados">
        <PanelHeader title="Concorrentes acompanhados" hint={canManage ? 'Você gerencia esta lista.' : 'Quem acompanha esta lista é o gestor. Você pode solicitar mudanças.'} />
        <TrackedList items={data.tracked} canManage={canManage} onAskRemove={setRemoving} />
      </section>

      <section aria-label="Sugestões">
        <PanelHeader title="Sugestões a partir das observações" hint="Marcas que apareceram nas respostas das IAs e ainda não são acompanhadas." />
        {data.suggested.length === 0
          ? <p className="text-sm text-[var(--zv-muted)]">Nenhuma sugestão por enquanto.</p>
          : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.suggested.map((s) => (
                <SuggestionCard key={`${s.name}-${s.domain}`} s={s} canManage={canManage} busy={busyKey === `s:${s.name}`}
                  onApprove={() => { void guarded(`s:${s.name}`, () => onSave(competitorInputFromSuggestion(s))); }}
                  onIgnore={() => { void guarded(`s:${s.name}`, () => onSave({ ...competitorInputFromSuggestion(s), status: 'ignored' })); }}
                  onRequest={() => onRequest('other', suggestionRequestMessage(s))} />
              ))}
            </ul>
          )}
      </section>

      {canManage && <AddForm onSave={onSave} />}

      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parar de acompanhar {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>As observações já feitas continuam guardadas. Você pode cadastrar o concorrente de novo quando quiser.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const r = removing; setRemoving(null); if (r) void guarded(`r:${r.id}`, () => onRemove(r.id)); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
