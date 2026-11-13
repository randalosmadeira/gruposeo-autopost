import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Bot, KeyRound, Loader2, MessageSquarePlus, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyNote, KpiList, PeriodSelect, type KpiItem } from '@/components/nexus-providers/shared';
import { useGa4Summary } from '@/hooks/useNexusAnalytics';
import { channelLabel, formatDuration, formatKeyEvents } from '@/lib/nexus-analytics';
import { formatCount, formatRate, rangeForDays } from '@/lib/nexus-observatory';
import { formatRelative, providerErrorMessage } from '@/lib/nexus-providers';
import type { Ga4Summary } from '@/types/nexus-analytics';

const SESSIONS_COLOR = 'hsl(217, 91%, 60%)';
const ENGAGED_COLOR = 'hsl(160, 70%, 35%)';

export interface AnalyticsViewProps {
  summary: Ga4Summary | undefined;
  loading: boolean;
  /** Código/mensagem de erro do servidor (ex.: `ga4_not_configured`, `ga4_property_required`). */
  error: unknown;
  /** O Google Analytics já está conectado (credencial guardada ou status de conectado). */
  connected: boolean;
  now: number;
  days: number;
  onDaysChange: (days: number) => void;
  /** Gestor: vê Conectar e Sincronizar. Cliente: vê só o pedido ao gestor. */
  canManage: boolean;
  syncing: boolean;
  syncText: string | null;
  onSync: () => void;
  onConnect: () => void;
  onRequest: () => void;
  onRetry: () => void;
  /** Gestor: formulário de ID por projeto, exibido acima dos dados. */
  managerSlot?: ReactNode;
}

function share(part: number, total: number): string { return total > 0 ? formatRate(part / total) : '—'; }

/** Visão pura (sem hooks de dados) da aba "Analytics". */
export function AnalyticsView({
  summary, loading, error, connected, now, days, onDaysChange, canManage, syncing, syncText, onSync, onConnect, onRequest, onRetry, managerSlot,
}: AnalyticsViewProps) {
  const errorCode = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const needsConnection = !connected || errorCode === 'ga4_not_configured';
  const needsProperty = !needsConnection && errorCode === 'ga4_property_required';
  const showData = !!summary && !needsConnection && !needsProperty;
  const noData = showData && summary.totals.sessions === 0 && summary.daily.length === 0;

  const kpis: KpiItem[] = summary ? [
    { id: 'sessions', label: 'Sessões', value: formatCount(summary.totals.sessions), note: 'Visitas ao site' },
    { id: 'engagement', label: 'Engajamento', value: formatRate(summary.totals.engagement_rate), note: `Tempo médio ${formatDuration(summary.totals.avg_engagement_seconds)}` },
    { id: 'key_events', label: 'Eventos-chave', value: formatKeyEvents(summary.totals.key_events), note: 'Ações importantes (ex.: contatos)' },
    { id: 'users', label: 'Usuários', value: formatCount(summary.totals.users), note: 'Pessoas diferentes' },
    { id: 'ai', label: 'Tráfego de IA', value: formatCount(summary.ai_referrals.totals.sessions), note: 'Sessões vindas de assistentes de IA' },
  ] : [];
  const totalSessions = summary?.totals.sessions ?? 0;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Visitas reais ao site, medidas pelo Google Analytics 4: sessões, engajamento, eventos-chave e o tráfego que chega de assistentes de IA.
        São números observados, sem promessa de resultado.
      </p>

      {canManage && managerSlot}

      <div className="flex flex-wrap items-end gap-3">
        <PeriodSelect id="analytics-period" days={days} onChange={onDaysChange} />
        {canManage && (
          <Button onClick={onSync} disabled={syncing || needsConnection}>
            {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />}
            Sincronizar o Analytics
          </Button>
        )}
        <p className="text-sm text-muted-foreground" data-testid="analytics-last-synced">
          Dados atualizados: {summary?.last_synced_at ? formatRelative(summary.last_synced_at, now) : 'nunca'}
        </p>
      </div>
      <div aria-live="polite">{syncText && <p role="status" className="text-sm text-muted-foreground">{syncText}</p>}</div>

      {needsConnection && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ainda sem dados de visitas</CardTitle>
            <CardDescription>
              {canManage
                ? 'Conecte o Google Analytics 4 com a conta de serviço (gratuito) e informe o ID da propriedade do projeto.'
                : 'Ainda sem dados: peça ao gestor para conectar o Google Analytics do seu site.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canManage
              ? <Button onClick={onConnect}><KeyRound className="mr-1 h-4 w-4" aria-hidden="true" /> Conectar o Google Analytics</Button>
              : <Button onClick={onRequest}><MessageSquarePlus className="mr-1 h-4 w-4" aria-hidden="true" /> Solicitar a conexão ao gestor</Button>}
          </CardContent>
        </Card>
      )}

      {needsProperty && (
        <Alert role="status">
          <AlertTitle>Falta o ID da propriedade deste projeto</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {canManage ? 'Informe o ID da propriedade GA4 no formulário acima para começar a sincronizar.' : 'O gestor ainda precisa informar qual propriedade do Google Analytics pertence a este site.'}
            {!canManage && <Button size="sm" variant="outline" onClick={onRequest}>Solicitar ao gestor</Button>}
          </AlertDescription>
        </Alert>
      )}

      {loading && !needsConnection && (
        <div aria-busy="true" aria-label="Carregando o Analytics" className="grid grid-cols-2 gap-3 md:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      )}

      {!!error && !needsConnection && !needsProperty && !loading && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o Analytics</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {providerErrorMessage(error)}
            <Button size="sm" variant="outline" onClick={onRetry}>Tentar de novo</Button>
          </AlertDescription>
        </Alert>
      )}

      {showData && summary && (
        <>
          {noData && (
            <EmptyNote>
              {canManage
                ? 'Sem dados no período. Clique em “Sincronizar o Analytics” e confira se a conta de serviço foi adicionada como Leitor na propriedade.'
                : 'Ainda sem dados neste período. Se o Analytics já foi conectado, os números aparecem após a próxima atualização; se precisar, solicite ao gestor.'}
            </EmptyNote>
          )}

          <KpiList items={kpis} label="Indicadores do Analytics" testIdPrefix="ga4" />

          <Card>
            <CardHeader><CardTitle className="text-base">Sessões por dia</CardTitle></CardHeader>
            <CardContent>
              {summary.daily.length === 0 ? <EmptyNote>Sem dados diários no período.</EmptyNote> : (
                <figure className="space-y-2">
                  <div role="img" aria-label={`Sessões e sessões engajadas por dia, ${summary.daily.length} dias`}>
                    <ChartContainer config={{ sessions: { label: 'Sessões', color: SESSIONS_COLOR }, engaged_sessions: { label: 'Sessões engajadas', color: ENGAGED_COLOR } }} className="h-64 w-full">
                      <LineChart data={summary.daily} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line type="monotone" dataKey="sessions" name="Sessões" stroke={SESSIONS_COLOR} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="engaged_sessions" name="Sessões engajadas" stroke={ENGAGED_COLOR} strokeWidth={2} strokeDasharray="5 3" dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </div>
                  <p className="text-xs text-muted-foreground">Linha contínua azul: sessões. Linha tracejada verde: sessões engajadas (visitas em que a pessoa realmente interagiu).</p>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Ver dados em tabela</summary>
                    <div className="mt-2 max-h-72 overflow-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Sessões</TableHead><TableHead className="text-right">Engajadas</TableHead><TableHead className="text-right">Usuários</TableHead><TableHead className="text-right">Eventos-chave</TableHead></TableRow></TableHeader>
                        <TableBody>{summary.daily.map((d) => (
                          <TableRow key={d.day}><TableCell>{d.day}</TableCell><TableCell className="text-right tabular-nums">{formatCount(d.sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(d.engaged_sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(d.users)}</TableCell><TableCell className="text-right tabular-nums">{formatKeyEvents(d.key_events)}</TableCell></TableRow>
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
              <CardHeader><CardTitle className="text-base">De onde vêm as visitas (canais)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {summary.by_channel.length === 0 ? <EmptyNote>Sem dados por canal no período.</EmptyNote> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Canal</TableHead><TableHead className="text-right">Sessões</TableHead><TableHead className="text-right">% do total</TableHead><TableHead className="text-right">Engajadas</TableHead><TableHead className="text-right">Eventos-chave</TableHead></TableRow></TableHeader>
                    <TableBody>{summary.by_channel.map((c) => (
                      <TableRow key={c.channel || 'na'}><TableCell>{channelLabel(c.channel)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(c.sessions)}</TableCell><TableCell className="text-right tabular-nums">{share(c.sessions, totalSessions)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(c.engaged_sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatKeyEvents(c.key_events)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card aria-labelledby="ai-sources-title">
              <CardHeader>
                <CardTitle id="ai-sources-title" className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" aria-hidden="true" /> Fontes de IA</CardTitle>
                <CardDescription>Visitas que chegaram de assistentes como ChatGPT, Perplexity, Gemini, Copilot e Claude. É o que o Analytics consegue observar, não o total de menções.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {summary.ai_referrals.by_source.length === 0 ? <EmptyNote>Nenhuma visita vinda de assistentes de IA neste período.</EmptyNote> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Fonte</TableHead><TableHead className="text-right">Sessões</TableHead><TableHead className="text-right">Engajadas</TableHead><TableHead className="text-right">Eventos-chave</TableHead></TableRow></TableHeader>
                    <TableBody>{summary.ai_referrals.by_source.map((s) => (
                      <TableRow key={s.source}><TableCell className="break-all">{s.source || 'Não informado'}</TableCell><TableCell className="text-right tabular-nums">{formatCount(s.sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(s.engaged_sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatKeyEvents(s.key_events)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Páginas mais visitadas</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {summary.top_pages.length === 0 ? <EmptyNote>Sem páginas no período.</EmptyNote> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Página</TableHead><TableHead className="text-right">Sessões</TableHead><TableHead className="text-right">Visualizações</TableHead><TableHead className="text-right">Engajadas</TableHead><TableHead className="text-right">Eventos-chave</TableHead></TableRow></TableHeader>
                  <TableBody>{summary.top_pages.map((p) => (
                    <TableRow key={p.page}><TableCell className="break-all">{p.page || '/'}</TableCell><TableCell className="text-right tabular-nums">{formatCount(p.sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(p.page_views)}</TableCell><TableCell className="text-right tabular-nums">{formatCount(p.engaged_sessions)}</TableCell><TableCell className="text-right tabular-nums">{formatKeyEvents(p.key_events)}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export interface AnalyticsTabProps extends Omit<AnalyticsViewProps, 'summary' | 'loading' | 'error' | 'days' | 'onDaysChange' | 'onRetry'> {
  projectId: string;
}

/** Aba com dados: busca o resumo (`ga4_summary`) do período escolhido. Sem motor conectado, não consulta o servidor. */
export function AnalyticsTab({ projectId, ...rest }: AnalyticsTabProps) {
  const [days, setDays] = useState(28);
  const range = rangeForDays(days);
  const query = useGa4Summary(projectId, range.from, range.to, rest.connected);
  return (
    <AnalyticsView
      {...rest} summary={query.data} loading={query.isLoading} error={query.error} days={days} onDaysChange={setDays}
      onRetry={() => { void query.refetch(); }}
    />
  );
}
