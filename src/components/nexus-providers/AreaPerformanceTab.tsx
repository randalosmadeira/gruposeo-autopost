import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Info, MessageSquarePlus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyNote, PeriodSelect } from '@/components/nexus-providers/shared';
import { useContentPerformance } from '@/hooks/useNexusAnalytics';
import {
  HEURISTIC_NOTICE, areaLabel, areaTotals, defaultDirection, formatKeyEvents, isHeuristicClassification, sortAreas,
} from '@/lib/nexus-analytics';
import { formatCount, rangeForDays } from '@/lib/nexus-observatory';
import { formatPosition, providerErrorMessage } from '@/lib/nexus-providers';
import type { AreaRow, AreaSortKey, ContentPerformance, SortDirection } from '@/types/nexus-analytics';

interface Column { key: AreaSortKey; label: string; numeric: boolean; hint?: string }
const COLUMNS: readonly Column[] = [
  { key: 'area', label: 'Área', numeric: false },
  { key: 'articles', label: 'Artigos', numeric: true },
  { key: 'clicks', label: 'Cliques', numeric: true, hint: 'Google Search Console' },
  { key: 'impressions', label: 'Impressões', numeric: true, hint: 'Google Search Console' },
  { key: 'position', label: 'Posição', numeric: true, hint: 'Google Search Console · menor é melhor' },
  { key: 'sessions', label: 'Sessões', numeric: true, hint: 'Google Analytics' },
  { key: 'engaged_sessions', label: 'Engajadas', numeric: true, hint: 'Google Analytics' },
  { key: 'key_events', label: 'Eventos-chave', numeric: true, hint: 'Google Analytics' },
  { key: 'ai_sessions', label: 'Sessões de IA', numeric: true, hint: 'Google Analytics' },
];

export interface AreaPerformanceViewProps {
  performance: ContentPerformance | undefined;
  loading: boolean;
  error: unknown;
  /** Há ao menos uma fonte (Search Console ou Analytics) conectada. */
  hasSources: boolean;
  days: number;
  onDaysChange: (days: number) => void;
  canManage: boolean;
  onRequest: () => void;
  onRetry: () => void;
}

/** Visão pura da aba "Desempenho por área": artigos × Search Console × Analytics, ordenável, com as melhores páginas de cada área. */
export function AreaPerformanceView({ performance, loading, error, hasSources, days, onDaysChange, canManage, onRequest, onRetry }: AreaPerformanceViewProps) {
  const [sortKey, setSortKey] = useState<AreaSortKey>('sessions');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => (performance ? sortAreas(performance.areas, sortKey, direction) : []), [performance, sortKey, direction]);
  const totals = useMemo(() => areaTotals(performance?.areas ?? []), [performance]);

  function sortBy(key: AreaSortKey) {
    if (key === sortKey) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setDirection(defaultDirection(key)); }
  }

  const empty = !!performance && performance.areas.length === 0;
  const unmatched = performance?.unmatched;
  const unmatchedTotal = (unmatched?.gsc_pages.count ?? 0) + (unmatched?.ga4_pages.count ?? 0);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Cada artigo do site é agrupado por área. Para cada área, juntamos o que o Google Search Console informa (cliques, impressões, posição)
        com o que o Google Analytics mede (sessões, engajamento, eventos-chave e visitas de IA).
      </p>

      <div className="flex flex-wrap items-end gap-3"><PeriodSelect id="areas-period" days={days} onChange={onDaysChange} /></div>

      {!hasSources && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ainda sem dados de desempenho</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{canManage ? 'Conecte o Google Search Console e o Google Analytics para comparar as áreas.' : 'Ainda sem dados: peça ao gestor para conectar o Google Search Console e o Google Analytics.'}</p>
            {!canManage && <Button onClick={onRequest}><MessageSquarePlus className="mr-1 h-4 w-4" aria-hidden="true" /> Solicitar a conexão ao gestor</Button>}
          </CardContent>
        </Card>
      )}

      {loading && hasSources && <div aria-busy="true" aria-label="Carregando o desempenho por área" className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></div>}

      {!!error && !loading && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o desempenho por área</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">{providerErrorMessage(error)}<Button size="sm" variant="outline" onClick={onRetry}>Tentar de novo</Button></AlertDescription>
        </Alert>
      )}

      {performance && hasSources && (
        <>
          {empty && <EmptyNote>Sem áreas para mostrar. O índice de artigos do site ainda não foi analisado ou não há dados no período; confira também se o Search Console e o Analytics já sincronizaram.</EmptyNote>}

          {!empty && isHeuristicClassification(performance) && (
            <Alert role="note" data-testid="heuristic-notice">
              <Info className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Como as áreas são definidas</AlertTitle>
              <AlertDescription>{HEURISTIC_NOTICE}</AlertDescription>
            </Alert>
          )}

          {!empty && (
            <Card>
              <CardHeader><CardTitle className="text-base">Desempenho por área</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"><span className="sr-only">Mostrar páginas</span></TableHead>
                      {COLUMNS.map((c) => {
                        const active = sortKey === c.key;
                        return (
                          <TableHead key={c.key} className={c.numeric ? 'text-right' : undefined} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                            <button type="button" onClick={() => sortBy(c.key)} title={c.hint}
                              className={`inline-flex items-center gap-1 rounded-sm font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${c.numeric ? 'flex-row-reverse' : ''}`}
                              aria-label={`Ordenar por ${c.label}${active ? (direction === 'asc' ? ' (crescente)' : ' (decrescente)') : ''}`}>
                              {c.label}
                              {active && (direction === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
                            </button>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a: AreaRow) => {
                      const expanded = open === a.area;
                      const panelId = `area-pages-${a.area.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
                      return (
                        <Fragment key={a.area}>
                          <TableRow data-testid={`area-${a.area}`}>
                            <TableCell>
                              <button type="button" onClick={() => setOpen(expanded ? null : a.area)} aria-expanded={expanded} aria-controls={panelId}
                                aria-label={`${expanded ? 'Ocultar' : 'Ver'} as melhores páginas: ${areaLabel(a.area)}`}
                                className="rounded-sm p-1 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                                {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                              </button>
                            </TableCell>
                            <TableCell className="font-medium">{areaLabel(a.area)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCount(a.articles)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCount(a.gsc.clicks)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCount(a.gsc.impressions)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatPosition(a.gsc.position)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCount(a.ga4.sessions)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCount(a.ga4.engaged_sessions)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatKeyEvents(a.ga4.key_events)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCount(a.ga4.ai_sessions)}</TableCell>
                          </TableRow>
                          {expanded && (
                            <TableRow id={panelId} data-testid={`area-pages-${a.area}`}>
                              <TableCell />
                              <TableCell colSpan={COLUMNS.length} className="bg-muted/30">
                                {a.top_pages.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma página com dados nesta área no período.</p> : (
                                  <Table>
                                    <TableHeader><TableRow>
                                      <TableHead>Página (até 10)</TableHead><TableHead className="text-right">Cliques</TableHead><TableHead className="text-right">Impr.</TableHead>
                                      <TableHead className="text-right">Pos.</TableHead><TableHead className="text-right">Sessões</TableHead><TableHead className="text-right">Eventos-chave</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>{a.top_pages.map((p) => (
                                      <TableRow key={p.url}>
                                        <TableCell className="break-words">
                                          <span className="block font-medium">{p.title || p.url}</span>
                                          {p.title && <span className="block break-all text-xs text-muted-foreground">{p.url}</span>}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{formatCount(p.gsc.clicks)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatCount(p.gsc.impressions)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatPosition(p.gsc.position)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatCount(p.ga4.sessions)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{formatKeyEvents(p.ga4.key_events)}</TableCell>
                                      </TableRow>
                                    ))}</TableBody>
                                  </Table>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                    <TableRow className="font-semibold">
                      <TableCell />
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(totals.articles)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(totals.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(totals.impressions)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(totals.sessions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(totals.engaged_sessions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatKeyEvents(totals.key_events)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(totals.ai_sessions)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">Clique no título da coluna para ordenar. A posição média não é somada no total.</p>
              </CardContent>
            </Card>
          )}

          {unmatchedTotal > 0 && unmatched && (
            <details className="rounded-md border p-3" data-testid="unmatched">
              <summary className="cursor-pointer text-sm font-medium">
                Páginas sem correspondência no índice de artigos ({formatCount(unmatchedTotal)})
              </summary>
              <div className="mt-2 space-y-3 text-sm text-muted-foreground">
                <p>Estas páginas têm dados, mas não foram encontradas no índice de artigos, por isso não entram em nenhuma área. Nada foi descartado em silêncio.</p>
                {([['Search Console', unmatched.gsc_pages], ['Analytics', unmatched.ga4_pages]] as const).map(([label, u]) => u.count > 0 && (
                  <div key={label}>
                    <p className="font-medium text-foreground">{label}: {formatCount(u.count)} página(s)</p>
                    {u.items.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">{u.items.slice(0, 20).map((i) => <li key={i} className="break-all">{i}</li>)}</ul>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {performance.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground" aria-label="Observações">{performance.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
        </>
      )}
    </div>
  );
}

export interface AreaPerformanceTabProps extends Pick<AreaPerformanceViewProps, 'hasSources' | 'canManage' | 'onRequest'> { projectId: string }

/** Aba com dados: busca `content_performance` do período escolhido (só quando há fonte conectada). */
export function AreaPerformanceTab({ projectId, hasSources, canManage, onRequest }: AreaPerformanceTabProps) {
  const [days, setDays] = useState(28);
  const range = rangeForDays(days);
  const query = useContentPerformance(projectId, range.from, range.to, hasSources);
  return (
    <AreaPerformanceView
      performance={query.data} loading={query.isLoading} error={query.error} hasSources={hasSources} days={days} onDaysChange={setDays}
      canManage={canManage} onRequest={onRequest} onRetry={() => { void query.refetch(); }}
    />
  );
}
