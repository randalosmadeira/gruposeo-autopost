import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countryLabel, formatCount, formatRate, rangeForDays } from '@/lib/nexus-observatory';
import { deviceLabel, formatPosition, formatRelative, getCatalogEntry, providerErrorMessage } from '@/lib/nexus-providers';
import { useSearchPerformance } from '@/hooks/useNexusProviders';
import type { SearchPerformanceSummary } from '@/types/nexus-providers';

const CLICKS_COLOR = 'hsl(217, 91%, 60%)';
const IMPRESSIONS_COLOR = 'hsl(42, 100%, 45%)';

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{children}</p>;
}

export interface SearchTrafficViewProps {
  summary: SearchPerformanceSummary | undefined;
  loading: boolean;
  /** Código/mensagem de erro do servidor (ex.: `gsc_not_configured`). */
  error: unknown;
  /** Há credencial guardada de GSC ou Bing. */
  hasCredentials: boolean;
  now: number;
  days: number;
  onDaysChange: (days: number) => void;
  canAdmin: boolean;
  syncing: boolean;
  syncText: string | null;
  onSync: () => void;
  onConnectGsc: () => void;
  onRetry: () => void;
}

/** Visão pura (sem hooks de dados) da aba "Tráfego orgânico (Google Search Console)". */
export function SearchTrafficView({ summary, loading, error, hasCredentials, now, days, onDaysChange, canAdmin, syncing, syncText, onSync, onConnectGsc, onRetry }: SearchTrafficViewProps) {
  const errorCode = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const notConfigured = !hasCredentials || errorCode === 'gsc_not_configured';
  const gsc = getCatalogEntry('gsc');
  const noData = !!summary && summary.daily.length === 0 && summary.totals.impressions === 0 && summary.totals.clicks === 0;

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="traffic-period">Período</Label>
        <Select value={String(days)} onValueChange={(v) => onDaysChange(Number(v))}>
          <SelectTrigger id="traffic-period" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="28">Últimos 28 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={onSync} disabled={!canAdmin || syncing || !hasCredentials} title={!canAdmin ? 'Só proprietário ou administrador pode sincronizar' : undefined}>
        {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />}
        Sincronizar agora
      </Button>
      <p className="text-sm text-muted-foreground" data-testid="last-synced">
        Última sincronização: {summary?.last_synced_at ? formatRelative(summary.last_synced_at, now) : 'nunca'}
      </p>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Dados reais de busca informados pelo Google Search Console (e pelo Bing Webmaster, quando conectado): cliques, impressões, CTR e posição média.
        São números observados, sem promessa de resultado.
      </p>
      {toolbar}
      <div aria-live="polite">{syncText && <p role="status" className="text-sm text-muted-foreground">{syncText}</p>}</div>

      {notConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conecte uma conta de serviço do Google para ver o seu tráfego orgânico</CardTitle>
            <CardDescription>Passo a passo (gratuito):</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">{gsc?.doc.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <Button onClick={onConnectGsc}><KeyRound className="mr-1 h-4 w-4" aria-hidden="true" /> Conectar o Google Search Console</Button>
          </CardContent>
        </Card>
      )}

      {loading && !notConfigured && (
        <div aria-busy="true" aria-label="Carregando tráfego orgânico" className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      )}

      {!!error && !notConfigured && !loading && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os dados de busca</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {providerErrorMessage(error)}
            <Button size="sm" variant="outline" onClick={onRetry}>Tentar de novo</Button>
          </AlertDescription>
        </Alert>
      )}

      {summary && !notConfigured && (
        <>
          {noData && <EmptyNote>Sem dados no período. Clique em “Sincronizar agora” e confira se a conta de serviço foi adicionada como usuário da propriedade no Search Console.</EmptyNote>}

          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores de busca">
            {[
              { id: 'clicks', label: 'Cliques', value: formatCount(summary.totals.clicks) },
              { id: 'impressions', label: 'Impressões', value: formatCount(summary.totals.impressions) },
              { id: 'ctr', label: 'CTR', value: formatRate(summary.totals.ctr) },
              { id: 'position', label: 'Posição média', value: formatPosition(summary.totals.position) },
            ].map((k) => (
              <li key={k.id}>
                <Card className="h-full"><CardContent className="space-y-1 p-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold tabular-nums" data-testid={`kpi-${k.id}`}>{k.value}</p>
                </CardContent></Card>
              </li>
            ))}
          </ul>

          <Card>
            <CardHeader><CardTitle className="text-base">Cliques e impressões por dia</CardTitle></CardHeader>
            <CardContent>
              {summary.daily.length === 0 ? <EmptyNote>Sem dados diários no período.</EmptyNote> : (
                <figure className="space-y-2">
                  <div role="img" aria-label={`Cliques e impressões por dia, ${summary.daily.length} dias`}>
                    <ChartContainer config={{ clicks: { label: 'Cliques', color: CLICKS_COLOR }, impressions: { label: 'Impressões', color: IMPRESSIONS_COLOR } }} className="h-64 w-full">
                      <LineChart data={summary.daily} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis yAxisId="c" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis yAxisId="i" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line yAxisId="c" type="monotone" dataKey="clicks" name="Cliques" stroke={CLICKS_COLOR} strokeWidth={2} dot={false} />
                        <Line yAxisId="i" type="monotone" dataKey="impressions" name="Impressões" stroke={IMPRESSIONS_COLOR} strokeWidth={2} strokeDasharray="5 3" dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </div>
                  <p className="text-xs text-muted-foreground">Linha contínua azul: cliques (eixo esquerdo). Linha tracejada âmbar: impressões (eixo direito).</p>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Ver dados em tabela</summary>
                    <div className="mt-2 max-h-72 overflow-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Cliques</TableHead><TableHead className="text-right">Impressões</TableHead><TableHead className="text-right">Posição</TableHead></TableRow></TableHeader>
                        <TableBody>{summary.daily.map((d) => (
                          <TableRow key={d.day}><TableCell>{d.day}</TableCell><TableCell className="text-right tabular-nums">{formatCount(d.clicks)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(d.impressions)}</TableCell><TableCell className="text-right tabular-nums">{formatPosition(d.position)}</TableCell></TableRow>
                        ))}</TableBody>
                      </Table>
                    </div>
                  </details>
                </figure>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Principais consultas (top 20)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {summary.top_queries.length === 0 ? <EmptyNote>Sem consultas no período.</EmptyNote> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Consulta</TableHead><TableHead className="text-right">Cliques</TableHead><TableHead className="text-right">Impr.</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">Pos.</TableHead></TableRow></TableHeader>
                    <TableBody>{summary.top_queries.map((q) => (
                      <TableRow key={q.query}><TableCell className="break-words">{q.query}</TableCell><TableCell className="text-right tabular-nums">{formatCount(q.clicks)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(q.impressions)}</TableCell><TableCell className="text-right tabular-nums">{formatRate(q.ctr)}</TableCell><TableCell className="text-right tabular-nums">{formatPosition(q.position)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Principais páginas (top 20)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {summary.top_pages.length === 0 ? <EmptyNote>Sem páginas no período.</EmptyNote> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Página</TableHead><TableHead className="text-right">Cliques</TableHead><TableHead className="text-right">Impr.</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">Pos.</TableHead></TableRow></TableHeader>
                    <TableBody>{summary.top_pages.map((p) => (
                      <TableRow key={p.page}><TableCell className="break-all">{p.page}</TableCell><TableCell className="text-right tabular-nums">{formatCount(p.clicks)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(p.impressions)}</TableCell><TableCell className="text-right tabular-nums">{formatRate(p.ctr)}</TableCell><TableCell className="text-right tabular-nums">{formatPosition(p.position)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Por país</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {summary.by_country.length === 0 ? <EmptyNote>Sem dados por país. O Bing não informa país.</EmptyNote> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>País</TableHead><TableHead className="text-right">Cliques</TableHead><TableHead className="text-right">Impressões</TableHead></TableRow></TableHeader>
                    <TableBody>{summary.by_country.map((c) => (
                      <TableRow key={c.country}><TableCell>{countryLabel(c.country)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(c.clicks)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(c.impressions)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Por dispositivo</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {summary.by_device.length === 0 ? <EmptyNote>Sem dados por dispositivo.</EmptyNote> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Dispositivo</TableHead><TableHead className="text-right">Cliques</TableHead><TableHead className="text-right">Impressões</TableHead></TableRow></TableHeader>
                    <TableBody>{summary.by_device.map((d) => (
                      <TableRow key={d.device || 'na'}><TableCell>{deviceLabel(d.device)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(d.clicks)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(d.impressions)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export interface SearchTrafficTabProps {
  projectId: string;
  hasCredentials: boolean;
  now: number;
  canAdmin: boolean;
  syncing: boolean;
  syncText: string | null;
  onSync: (days: number) => void;
  onConnectGsc: () => void;
}

/** Aba com dados: busca o resumo (`search_performance`) para o período escolhido. */
export function SearchTrafficTab({ projectId, hasCredentials, now, canAdmin, syncing, syncText, onSync, onConnectGsc }: SearchTrafficTabProps) {
  const [days, setDays] = useState(28);
  const range = rangeForDays(days);
  const query = useSearchPerformance(projectId, range.from, range.to, hasCredentials);
  return (
    <SearchTrafficView
      summary={query.data} loading={query.isLoading} error={query.error} hasCredentials={hasCredentials} now={now} days={days} onDaysChange={setDays}
      canAdmin={canAdmin} syncing={syncing} syncText={syncText} onSync={() => onSync(days)} onConnectGsc={onConnectGsc} onRetry={() => { void query.refetch(); }}
    />
  );
}
