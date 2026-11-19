import { Check, ChevronLeft, ChevronRight, ExternalLink, HelpCircle, MessageSquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  QUESTIONS_PAGE_SIZE, engineLabel, formatDateTime, formatDay, formatDayLong, formatPercent, intentLabel, rise, safeHttpUrl,
} from '@/lib/nexus-visibility';
import type { RequestKind } from '@/types/nexus-requests';
import type { HistoryItem, KeywordRow, QuestionHistory, QuestionRow, QuestionsData } from '@/types/nexus-visibility';
import { EmptyState, ErrorState, LoadingBlock, Meter, PanelHeader, Pill } from './shared';

const ALL = '__all';

export interface HistoryState { query: string | null; data: QuestionHistory | undefined; loading: boolean; error: unknown; onRetry: () => void }

export interface QuestionsViewProps {
  data: QuestionsData | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  canManage: boolean;
  keywords: KeywordRow[] | undefined;
  topic: string; topics: string[]; onTopic: (t: string) => void;
  intent: string; intents: string[]; onIntent: (i: string) => void;
  page: number; onPage: (p: number) => void;
  onOpen: (query: string) => void;
  onCloseHistory: () => void;
  history: HistoryState;
  onRequest: (kind: RequestKind, message: string) => void;
}

function FilterSelect({ id, label, value, options, all, format, onChange }: { id: string; label: string; value: string; options: string[]; all: string; format?: (v: string) => string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id} className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{all}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{format ? format(o) : o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function HistoryEntry({ item }: { item: HistoryItem }) {
  return (
    <li className="space-y-2 rounded-xl border border-[var(--zv-line)] p-3.5" data-testid="history-item">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold">{engineLabel(item.engine)}</span>
        {item.country && <span className="text-xs text-[var(--zv-muted)]">{item.country}</span>}
        <span className="text-xs text-[var(--zv-muted)]">{formatDateTime(item.observed_at)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Pill tone={item.mentioned === true ? 'good' : 'neutral'} icon={item.mentioned === true ? <Check className="h-3 w-3" aria-hidden="true" /> : item.mentioned === false ? <X className="h-3 w-3" aria-hidden="true" /> : undefined}>{item.mentioned === true ? 'Mencionou a marca' : item.mentioned === false ? 'Não mencionou a marca' : 'Menção não informada'}</Pill>
        <Pill tone={item.cited ? 'good' : 'neutral'} icon={item.cited ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}>{item.cited ? 'Citou o seu site' : 'Não citou o seu site'}</Pill>
        {item.position !== null && <Pill tone="info">Posição {item.position}</Pill>}
      </div>
      {item.brands.length > 0 && <p className="text-xs text-[var(--zv-muted)]">Marcas na resposta: <span className="text-[var(--zv-ink)]">{item.brands.join(', ')}</span></p>}
      {item.sources.length > 0 && (
        <ul className="space-y-0.5 text-xs" aria-label="Fontes da resposta">
          {item.sources.map((s, i) => {
            const href = safeHttpUrl(s.url);
            return (
              <li key={`${s.url}-${i}`} className="break-all">
                {href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[var(--zv-vr)] underline-offset-2 hover:underline">{s.host || href}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="sr-only"> (abre em nova aba)</span></a> : <span>{s.host || s.url}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {item.response_excerpt
        ? (
          <figure className="space-y-1">
            <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-[var(--zv-muted)]">Resposta registrada da IA</figcaption>
            <blockquote className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--zv-surface-2)] p-3 text-sm leading-relaxed" data-testid="history-response">{item.response_excerpt}</blockquote>
          </figure>
        )
        : <p className="text-xs text-[var(--zv-muted)]">O texto da resposta não foi guardado nesta observação.</p>}
    </li>
  );
}

export function HistorySheet({ state, onClose }: { state: HistoryState; onClose: () => void }) {
  const { query, data, loading, error, onRetry } = state;
  const items = data?.items ?? [];
  const byDay = new Map<string, HistoryItem[]>();
  for (const it of items) {
    const k = (it.observed_at ?? '').slice(0, 10) || 'sem-data';
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  return (
    <Sheet open={!!query} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <div className="zv space-y-4">
          <SheetHeader>
            <SheetTitle className="text-left text-lg leading-snug">{query}</SheetTitle>
            <SheetDescription>Histórico dia a dia: o que cada IA respondeu a esta pergunta.</SheetDescription>
          </SheetHeader>
          {loading && !data && <LoadingBlock label="Carregando o histórico" rows={2} />}
          {!!error && !data && <ErrorState error={error} onRetry={onRetry} title="Não foi possível carregar o histórico" />}
          {data && items.length === 0 && <EmptyState title="Sem observações para esta pergunta" icon={<HelpCircle className="h-5 w-5" />}>Quando uma coleta incluir esta pergunta, o histórico aparece aqui.</EmptyState>}
          {Array.from(byDay.entries()).map(([day, list]) => (
            <section key={day} aria-label={day === 'sem-data' ? 'Sem data' : formatDayLong(day)} className="space-y-2">
              <h3 className="text-sm font-semibold">{day === 'sem-data' ? 'Sem data' : formatDayLong(day)}</h3>
              <ul className="space-y-2.5">{list.map((it, i) => <HistoryEntry key={`${day}-${i}`} item={it} />)}</ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuestionRows({ rows, onOpen }: { rows: QuestionRow[]; onOpen: (q: string) => void }) {
  return (
    <div className="zv-panel overflow-hidden p-1 md:p-2">
      <table className="zv-table zv-stack" data-testid="questions-table">
        <caption className="sr-only">Perguntas observadas</caption>
        <thead><tr><th scope="col">Pergunta</th><th scope="col">Tema</th><th scope="col" className="num">Visibilidade</th><th scope="col" className="num">Citação</th><th scope="col" className="num">Observações</th><th scope="col">Última</th></tr></thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.query} data-clickable="true" data-testid="question-row" onClick={() => onOpen(q.query)}>
              <td data-primary="true">
                <button type="button" className="zv-clamp-2 text-left font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(q.query); }} aria-label={`Ver o histórico de: ${q.query}`}>{q.query}</button>
                {q.engines.length > 0 && <span className="mt-0.5 block text-xs text-[var(--zv-muted)]">{q.engines.map(engineLabel).join(' · ')}</span>}
              </td>
              <td data-label="Tema" className="text-[var(--zv-muted)]">{q.topic ?? '—'}{q.intent ? ` · ${intentLabel(q.intent)}` : ''}</td>
              <td data-label="Visibilidade" className="num"><span className="flex items-center justify-end gap-2"><span className="hidden w-14 md:block"><Meter value={q.vr} label={`Visibilidade: ${formatPercent(q.vr)}`} /></span><strong className="tabular-nums">{formatPercent(q.vr)}</strong></span></td>
              <td data-label="Citação" className="num">{formatPercent(q.cr)}</td>
              <td data-label="Observações" className="num">{q.observations}</td>
              <td data-label="Última" className="whitespace-nowrap text-[var(--zv-muted)]">{formatDay(q.last_observed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Perguntas: tabela com histórico dia a dia e a resposta registrada de cada IA em um painel lateral. */
export function QuestionsView(p: QuestionsViewProps) {
  const { data, loading, error, onRetry, canManage, keywords, page, onPage } = p;
  if (!data && loading) return <LoadingBlock label="Carregando as perguntas" rows={3} />;
  if (!data && error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!data) return null;

  const total = data.total;
  const from = total === 0 ? 0 : page * QUESTIONS_PAGE_SIZE + 1;
  const to = Math.min(total, page * QUESTIONS_PAGE_SIZE + data.questions.length);
  const lastPage = Math.max(0, Math.ceil(total / QUESTIONS_PAGE_SIZE) - 1);
  const filtered = !!p.topic || !!p.intent;

  return (
    <div className="space-y-5">
      {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}

      {keywords && keywords.length > 0 && (
        <section aria-label="Termos mais frequentes" className="zv-panel p-5">
          <PanelHeader title="Termos que mais aparecem nas perguntas" hint="Palavras e expressões frequentes nas perguntas observadas." />
          <ul className="flex flex-wrap gap-2">
            {keywords.slice(0, 20).map((k, i) => (
              <li key={k.term} style={rise(i)} className="zv-rise inline-flex items-center gap-1.5 rounded-full border border-[var(--zv-line)] bg-[var(--zv-surface-2)] px-3 py-1 text-sm" data-testid="keyword">
                <span className="font-medium">{k.term}</span>
                <span className="text-xs tabular-nums text-[var(--zv-muted)]" title="Perguntas com o termo e visibilidade da marca nelas">{k.prompts} {k.prompts === 1 ? 'pergunta' : 'perguntas'}{k.vr !== null ? ` · ${formatPercent(k.vr)}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect id="zv-q-topic" label="Tema" value={p.topic} options={p.topics} all="Todos os temas" onChange={p.onTopic} />
        <FilterSelect id="zv-q-intent" label="Intenção" value={p.intent} options={p.intents} all="Todas as intenções" format={intentLabel} onChange={p.onIntent} />
        {filtered && <Button variant="ghost" size="sm" onClick={() => { p.onTopic(''); p.onIntent(''); }}>Limpar filtros</Button>}
      </div>

      {data.questions.length === 0 ? (
        <EmptyState icon={<HelpCircle className="h-5 w-5" />} title={filtered ? 'Nenhuma pergunta com esses filtros' : 'Ainda sem perguntas observadas neste período'}
          action={!canManage && !filtered ? <Button size="sm" onClick={() => p.onRequest('new_observation_round', 'Quero uma nova rodada de observação com as perguntas do meu segmento.')}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Pedir uma coleta ao gestor</Button> : undefined}>
          {filtered ? 'Limpe os filtros ou escolha um período maior.' : 'Quando uma coleta rodar, cada pergunta aparece aqui com a visibilidade e o histórico das respostas.'}
        </EmptyState>
      ) : (
        <>
          <QuestionRows rows={data.questions} onOpen={p.onOpen} />
          <nav aria-label="Paginação das perguntas" className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--zv-muted)]" data-testid="questions-range">{from}–{to} de {total}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onPage(page - 1)} disabled={page <= 0}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Anterior</Button>
              <Button size="sm" variant="outline" onClick={() => onPage(page + 1)} disabled={page >= lastPage}>Próxima<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button>
            </div>
          </nav>
        </>
      )}
      <HistorySheet state={p.history} onClose={p.onCloseHistory} />
    </div>
  );
}
