import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Copy, KeyRound, Plus, Radar, RefreshCw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { HomepageSchemaSection } from '@/components/nexus-observatory/HomepageSchemaSection';
import { useToast } from '@/hooks/use-toast';
import { useProjects } from '@/hooks/useProjects';
import { useNexusObservatoryActions, useObservatorySummary, usePromptSets, useSignalsStatus } from '@/hooks/useNexusObservatory';
import {
  INTENT_LABELS, SIGNAL_KIND_LABELS, buildEngineCountryMatrix, filterSummary, buildSignalsSnippet, countryLabel, deriveGaps,
  engineLabel, formatCount, formatRate, gapKey, isoDate, marketsToText, nexusErrorMessage, parseCitationLines, parseCompetitorLines,
  parseMarkets, rangeForDays, rateTone, summaryToKpis,
} from '@/lib/nexus-observatory';
import {
  NEXUS_ENGINES, NEXUS_INTENTS, NexusBlockedError,
  type NexusCadence, type NexusIntent, type NexusObservatorySummary, type NexusPromptSet, type NexusSiteSignalsKey,
} from '@/types/nexus-observatory';

const MENTION_COLOR = 'hsl(217, 91%, 60%)';
const CITED_COLOR = 'hsl(160, 84%, 39%)';
const BAR_COLOR = 'hsl(42, 100%, 55%)';

type PeriodPreset = '7' | '30' | '90' | 'custom';

function isBlocked(...errors: unknown[]) { return errors.some((e) => e instanceof NexusBlockedError); }
function messageOf(e: unknown) { return nexusErrorMessage(e); }

/** Gráfico com rótulo acessível e tabela equivalente visível sob demanda. */
function ChartFigure({ label, config, table, children }: { label: string; config: ChartConfig; table: ReactNode; children: React.ReactElement }) {
  return (
    <figure className="space-y-2">
      <div role="img" aria-label={label}>
        <ChartContainer config={config} className="h-64 w-full">{children}</ChartContainer>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ver dados em tabela</summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </figure>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{children}</p>;
}

function Section({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="text-xl font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function NexusObservatory() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { projects } = useProjects();

  const [projectId, setProjectId] = useState('');
  const selected = projectId || projects[0]?.id || '';
  const selectedProject = projects.find((p) => p.id === selected);
  const [preset, setPreset] = useState<PeriodPreset>('30');
  const [customFrom, setCustomFrom] = useState(() => rangeForDays(30).from);
  const [customTo, setCustomTo] = useState(() => rangeForDays(30).to);
  const [engineFilter, setEngineFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [pickedGaps, setPickedGaps] = useState<Record<string, boolean>>({});
  const [blocked, setBlocked] = useState<string | null>(null);

  const range = useMemo(
    () => (preset === 'custom' ? { from: customFrom, to: customTo } : rangeForDays(Number(preset))),
    [preset, customFrom, customTo],
  );
  const rangeValid = !!range.from && !!range.to && range.from <= range.to;

  const summaryQuery = useObservatorySummary(rangeValid ? selected : undefined, range.from, range.to);
  const setsQuery = usePromptSets(selected || undefined);
  const signalsQuery = useSignalsStatus(selected || undefined);
  const actions = useNexusObservatoryActions(selected || undefined);

  const summary = summaryQuery.data;
  const blockedNow = blocked ?? (isBlocked(summaryQuery.error, setsQuery.error, signalsQuery.error)
    ? 'Execução pausada: orçamento zero ou serviços pagos bloqueados. Os dados já observados continuam disponíveis; nenhuma consulta paga é acionada.' : null);

  function handleError(e: unknown, fallback: string) {
    if (e instanceof NexusBlockedError) { setBlocked(e.message); return; }
    toast({ title: fallback, description: messageOf(e), variant: 'destructive' });
  }

  const filtered = useMemo(() => filterSummary(summary, engineFilter, countryFilter), [summary, engineFilter, countryFilter]);
  const kpis = summaryToKpis(summary);
  const matrix = useMemo(() => buildEngineCountryMatrix(filtered), [filtered]);
  const gaps = useMemo(() => deriveGaps(filtered, 25), [filtered]);
  const engineOptions = useMemo(() => Array.from(new Set(summary?.by_engine.map((e) => e.engine) ?? [])), [summary]);
  const countryOptions = useMemo(() => Array.from(new Set(summary?.by_country.map((c) => c.country) ?? [])), [summary]);

  const empty = !!summary && summary.totals.operations === 0 && summary.signals.last_batch_at === null && summary.signals.ai_bot_hits === 0;

  function carryGaps() {
    const keys = gaps.map(gapKey).filter((k) => pickedGaps[k]);
    const use = keys.length ? keys : gaps.slice(0, 10).map(gapKey);
    if (!use.length) return;
    navigate(`/articles/bulk?nexusGaps=${encodeURIComponent(use.join(','))}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-7">
      <header>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Radar className="h-4 w-4" aria-hidden="true" /> NEXUS · Observatório
        </p>
        <h1 className="mt-2 text-3xl font-bold">Visibilidade em IA e busca, com evidências</h1>
        <p className="mt-2 text-muted-foreground">
          Mostra o que foi observado em amostras de consultas. “Não encontrado na amostra” não significa ausência geral, e submissão recebida não é indexação.
          Nada aqui promete posição, tráfego ou contratação.
        </p>
      </header>

      {blockedNow && (
        <Alert role="status" className="border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Execução bloqueada</AlertTitle>
          <AlertDescription>{blockedNow}</AlertDescription>
        </Alert>
      )}

      {/* 1. Filtros */}
      <Section id="obs-filtros" title="Filtros">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="obs-project">Projeto</Label>
            <Select value={selected} onValueChange={setProjectId}>
              <SelectTrigger id="obs-project"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-period">Período</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
              <SelectTrigger id="obs-period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-engine">Motor</Label>
            <Select value={engineFilter} onValueChange={setEngineFilter}>
              <SelectTrigger id="obs-engine"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motores</SelectItem>
                {engineOptions.map((e) => <SelectItem key={e} value={e}>{engineLabel(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-country">País</Label>
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger id="obs-country"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os países</SelectItem>
                {countryOptions.map((c) => <SelectItem key={c} value={c}>{countryLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="space-y-1.5"><Label htmlFor="obs-from">De</Label><Input id="obs-from" type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="obs-to">Até</Label><Input id="obs-to" type="date" value={customTo} min={customFrom} max={isoDate(new Date())} onChange={(e) => setCustomTo(e.target.value)} /></div>
          </div>
        )}
        {!rangeValid && <p role="alert" className="text-sm text-destructive">A data inicial deve ser anterior ou igual à final.</p>}
        <p className="text-xs text-muted-foreground">Os filtros de motor e país refinam tabelas e gráficos; os indicadores do topo refletem o total do período.</p>
      </Section>

      {!selected && <EmptyNote>Nenhum projeto encontrado. Crie um projeto para começar a observar a visibilidade.</EmptyNote>}

      {selected && summaryQuery.isLoading && (
        <div aria-busy="true" aria-label="Carregando observações" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-64" />
        </div>
      )}

      {selected && summaryQuery.error && !(summaryQuery.error instanceof NexusBlockedError) && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o Observatório</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {messageOf(summaryQuery.error)}
            <Button size="sm" variant="outline" onClick={() => summaryQuery.refetch()}><RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" /> Tentar de novo</Button>
          </AlertDescription>
        </Alert>
      )}

      {summary && (
        <>
          {empty && <EmptyNote>Nenhuma observação no período. Registre uma observação manual ou prepare uma rodada.</EmptyNote>}

          {/* 2. KPIs */}
          <Section id="obs-kpis" title="Indicadores">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores do período">
              {kpis.map((k) => (
                <li key={k.id}>
                  <Card className="h-full">
                    <CardContent className="space-y-1 p-4">
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                      <p className="text-2xl font-bold tabular-nums">{k.value}</p>
                      <p className="text-xs text-muted-foreground">{k.footnote}</p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </Section>

          {/* 3. Gráficos */}
          <Section id="obs-graficos" title="Evolução, motores e concorrentes">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Tendência diária: menções e citações</CardTitle></CardHeader>
                <CardContent>
                  {summary.trend.length === 0 ? <EmptyNote>Sem dados no período.</EmptyNote> : (
                    <ChartFigure
                      label={`Tendência diária de menções e citações, ${summary.trend.length} dias com observações`}
                      config={{ mentioned: { label: 'Menções', color: MENTION_COLOR }, cited: { label: 'Citações', color: CITED_COLOR } }}
                      table={(
                        <Table>
                          <TableHeader><TableRow><TableHead>Dia</TableHead><TableHead>Válidas</TableHead><TableHead>Menções</TableHead><TableHead>Citações</TableHead></TableRow></TableHeader>
                          <TableBody>{summary.trend.map((t) => <TableRow key={t.day}><TableCell>{t.day}</TableCell><TableCell>{t.valid}</TableCell><TableCell>{t.mentioned}</TableCell><TableCell>{t.cited}</TableCell></TableRow>)}</TableBody>
                        </Table>
                      )}
                    >
                      <AreaChart data={summary.trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Area type="monotone" dataKey="mentioned" name="Menções" stroke={MENTION_COLOR} fill={MENTION_COLOR} fillOpacity={0.15} strokeWidth={2} />
                        <Area type="monotone" dataKey="cited" name="Citações" stroke={CITED_COLOR} fill={CITED_COLOR} fillOpacity={0.15} strokeWidth={2} />
                      </AreaChart>
                    </ChartFigure>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Motor × país: taxa de citação</CardTitle>
                  <CardDescription>Cor pela taxa de citação (vermelho 0%, âmbar até 33%, verde acima). Cinza: não medido.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {matrix.rows.length === 0 ? <EmptyNote>Sem dados no período.</EmptyNote> : matrix.crossAvailable ? (
                    <Table>
                      <TableHeader><TableRow><TableHead>Motor</TableHead>{matrix.countries.map((c) => <TableHead key={c}>{countryLabel(c)}</TableHead>)}<TableHead>Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {matrix.rows.map((r) => (
                          <TableRow key={r.engine}>
                            <TableCell className="font-medium">{engineLabel(r.engine)}</TableCell>
                            {matrix.countries.map((c) => {
                              const cell = r.cells[c];
                              return <TableCell key={c} className={rateTone(cell?.citationRate ?? null)}>{cell ? `${formatRate(cell.citationRate)} (${cell.cited}/${cell.valid})` : '—'}</TableCell>;
                            })}
                            <TableCell className={rateTone(r.total.citationRate)}>{formatRate(r.total.citationRate)} ({r.total.cited}/{r.total.valid})</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Table>
                        <TableHeader><TableRow><TableHead>Motor</TableHead><TableHead>Válidas</TableHead><TableHead>Menção</TableHead><TableHead>Citação</TableHead></TableRow></TableHeader>
                        <TableBody>{matrix.rows.map((r) => (
                          <TableRow key={r.engine}>
                            <TableCell className="font-medium">{engineLabel(r.engine)}</TableCell><TableCell>{r.total.valid}</TableCell>
                            <TableCell>{formatRate(r.total.mentionRate)}</TableCell>
                            <TableCell className={rateTone(r.total.citationRate)}>{formatRate(r.total.citationRate)}</TableCell>
                          </TableRow>
                        ))}</TableBody>
                      </Table>
                      <Table>
                        <TableHeader><TableRow><TableHead>País</TableHead><TableHead>Válidas</TableHead><TableHead>Menção</TableHead><TableHead>Citação</TableHead></TableRow></TableHeader>
                        <TableBody>{matrix.countries.map((c) => {
                          const t = matrix.countryTotals[c];
                          return (
                            <TableRow key={c}>
                              <TableCell className="font-medium">{countryLabel(c)}</TableCell><TableCell>{t?.valid ?? 0}</TableCell>
                              <TableCell>{formatRate(t?.mentionRate ?? null)}</TableCell>
                              <TableCell className={rateTone(t?.citationRate ?? null)}>{formatRate(t?.citationRate ?? null)}</TableCell>
                            </TableRow>
                          );
                        })}</TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Concorrentes mais observados (top 10)</CardTitle></CardHeader>
                <CardContent>
                  {filtered.top_competitors.length === 0 ? <EmptyNote>Nenhum concorrente observado.</EmptyNote> : (
                    <ChartFigure
                      label={`Concorrentes mais observados: ${filtered.top_competitors.slice(0, 10).map((c) => `${c.name} ${c.mentions}`).join(', ')}`}
                      config={{ mentions: { label: 'Menções', color: BAR_COLOR } }}
                      table={(
                        <Table>
                          <TableHeader><TableRow><TableHead>Concorrente</TableHead><TableHead>Menções</TableHead><TableHead>Motores</TableHead></TableRow></TableHeader>
                          <TableBody>{filtered.top_competitors.slice(0, 10).map((c) => <TableRow key={c.name}><TableCell>{c.name}</TableCell><TableCell>{c.mentions}</TableCell><TableCell>{c.engines.map(engineLabel).join(', ')}</TableCell></TableRow>)}</TableBody>
                        </Table>
                      )}
                    >
                      <BarChart data={filtered.top_competitors.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} fontSize={12} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="mentions" name="Menções" fill={BAR_COLOR} radius={3} />
                      </BarChart>
                    </ChartFigure>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Robôs de IA por agente</CardTitle></CardHeader>
                <CardContent>
                  <AgentBars rows={summary.signals.by_agent.filter((a) => a.kind === 'ai_bot_hit')} label="Robôs de IA por agente" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Visitas vindas de IA por origem</CardTitle></CardHeader>
                <CardContent>
                  <AgentBars rows={summary.signals.by_agent.filter((a) => a.kind === 'ai_referral')} label="Visitas vindas de IA por origem" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Visitas por página</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  {summary.signals.by_path.length === 0 ? <EmptyNote>Nenhum sinal recebido do site.</EmptyNote> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Página</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Acessos</TableHead></TableRow></TableHeader>
                      <TableBody>{summary.signals.by_path.slice(0, 20).map((p) => (
                        <TableRow key={`${p.kind}:${p.path}`}><TableCell className="break-all">{p.path}</TableCell><TableCell>{SIGNAL_KIND_LABELS[p.kind] ?? p.kind}</TableCell><TableCell className="text-right tabular-nums">{formatCount(p.hits)}</TableCell></TableRow>
                      ))}</TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* 4. URLs próprias */}
          <Section id="obs-urls" title="URLs próprias citadas" description="Páginas do seu site que apareceram como fonte nas respostas observadas.">
            {filtered.own_urls.length === 0 ? <EmptyNote>Nenhuma URL própria citada na amostra observada.</EmptyNote> : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>URL</TableHead><TableHead>Citações</TableHead><TableHead>Motores</TableHead></TableRow></TableHeader>
                  <TableBody>{filtered.own_urls.map((u) => (
                    <TableRow key={u.url}>
                      <TableCell className="break-all">{/^https?:\/\//i.test(u.url) ? <a className="text-primary underline" href={u.url} target="_blank" rel="noopener noreferrer">{u.url}</a> : u.url}</TableCell>
                      <TableCell>{u.citations}</TableCell><TableCell>{u.engines.map(engineLabel).join(', ')}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </Section>

          {/* 5. Lacunas */}
          <Section id="obs-lacunas" title="Lacunas" description="Consultas observadas em que o seu site não foi encontrado na amostra, ordenadas por concorrentes presentes.">
            {gaps.length === 0 ? <EmptyNote>Nenhuma lacuna observada no período.</EmptyNote> : (
              <>
                <ul className="space-y-2">
                  {gaps.map((g) => {
                    const key = gapKey(g);
                    return (
                      <li key={key} className="flex items-start gap-3 rounded-md border p-3">
                        <Checkbox id={`pick-${key}`} checked={!!pickedGaps[key]} onCheckedChange={(v) => setPickedGaps((p) => ({ ...p, [key]: v === true }))} aria-label={`Selecionar lacuna ${g.topic}`} />
                        <label htmlFor={`pick-${key}`} className="min-w-0 flex-1 space-y-1 text-sm">
                          <span className="block break-words font-medium">{g.query || g.topic}</span>
                          <span className="block text-xs text-muted-foreground">
                            Tópico: {g.topic} · {INTENT_LABELS[g.intent] ?? g.intent}{g.country ? ` · ${countryLabel(g.country)}` : ''}
                            {g.engines_missing.length > 0 && ` · sem citação em: ${g.engines_missing.map(engineLabel).join(', ')}`}
                          </span>
                          {g.competitors.length > 0 && <span className="block text-xs text-muted-foreground">Concorrentes: {g.competitors.join(', ')}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <Button onClick={carryGaps}>Levar para o gerador em massa</Button>
                <p className="text-xs text-muted-foreground">Sem seleção, levamos as 10 primeiras. O gerador valida cada pauta antes de incluí-la.</p>
              </>
            )}
          </Section>
        </>
      )}

      {/* 6. Conjuntos de prompts */}
      {selected && (
        <PromptSetsSection
          sets={setsQuery.data ?? []}
          loading={setsQuery.isLoading}
          error={setsQuery.error && !(setsQuery.error instanceof NexusBlockedError) ? messageOf(setsQuery.error) : null}
          actions={actions}
          onError={handleError}
          toastInfo={(title, description) => toast({ title, description })}
        />
      )}

      {/* 7. Chave de sinais */}
      {selected && (
        <SignalsSection
          status={signalsQuery.data}
          loading={signalsQuery.isLoading}
          error={signalsQuery.error && !(signalsQuery.error instanceof NexusBlockedError) ? messageOf(signalsQuery.error) : null}
          actions={actions}
          onError={handleError}
          toastInfo={(title, description) => toast({ title, description })}
        />
      )}

      {/* 8. Schema da homepage */}
      {selected && (
        <HomepageSchemaSection
          key={selected}
          sync={actions.homepageSchemaSync.mutateAsync}
          siteFallback={selectedProject?.wordpress_url || (selectedProject?.domain ? `https://${selectedProject.domain}` : null)}
          onBlocked={(e) => setBlocked(e.message)}
        />
      )}
    </div>
  );
}

function AgentBars({ rows, label }: { rows: { agent: string; hits: number }[]; label: string }) {
  if (rows.length === 0) return <EmptyNote>Nenhum sinal recebido do site. Configure a chave de sinais abaixo.</EmptyNote>;
  return (
    <ChartFigure
      label={`${label}: ${rows.map((r) => `${r.agent} ${r.hits}`).join(', ')}`}
      config={{ hits: { label: 'Acessos', color: BAR_COLOR } }}
      table={(
        <Table>
          <TableHeader><TableRow><TableHead>Agente</TableHead><TableHead className="text-right">Acessos</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((r) => <TableRow key={r.agent}><TableCell>{r.agent}</TableCell><TableCell className="text-right">{r.hits}</TableCell></TableRow>)}</TableBody>
        </Table>
      )}
    >
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis type="category" dataKey="agent" width={110} tickLine={false} axisLine={false} fontSize={12} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="hits" name="Acessos" fill={BAR_COLOR} radius={3} />
      </BarChart>
    </ChartFigure>
  );
}

type Actions = ReturnType<typeof useNexusObservatoryActions>;
interface SectionProps { actions: Actions; onError: (e: unknown, fallback: string) => void; toastInfo: (title: string, description?: string) => void }

function PromptSetsSection({ sets, loading, error, actions, onError, toastInfo }: SectionProps & { sets: NexusPromptSet[]; loading: boolean; error: string | null }) {
  const [name, setName] = useState('');
  const [marketsText, setMarketsText] = useState('br:pt-BR');
  const [engines, setEngines] = useState<string[]>([]);
  const [cadence, setCadence] = useState<NexusCadence>('manual');
  const [observationOpen, setObservationOpen] = useState(false);

  async function createSet() {
    const markets = parseMarkets(marketsText);
    if (!name.trim() || !markets.length) { toastInfo('Dados incompletos', 'Informe o nome e ao menos um mercado no formato br:pt-BR.'); return; }
    try {
      await actions.upsertSet.mutateAsync({ name: name.trim().slice(0, 120), markets, engines, cadence, status: 'active' });
      setName('');
      toastInfo('Conjunto salvo', 'Nenhuma consulta foi executada.');
    } catch (e) { onError(e, 'Não foi possível salvar o conjunto'); }
  }

  async function prepare(set: NexusPromptSet) {
    try {
      const r = await actions.preparePromptRun.mutateAsync({ promptSetId: set.id });
      toastInfo('Rodada preparada', `${r.prepared} preparada(s), ${r.skipped} já existente(s). Nada foi executado.`);
    } catch (e) { onError(e, 'Não foi possível preparar a rodada'); }
  }

  return (
    <Section id="obs-prompts" title="Conjuntos de prompts" description="Defina as perguntas que o seu público faz. Preparar uma rodada apenas registra a operação: não executa nem gasta.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setObservationOpen(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Registrar observação manual</Button>
      </div>

      {loading && <Skeleton className="h-24 w-full" aria-label="Carregando conjuntos" />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && !error && sets.length === 0 && <EmptyNote>Nenhum conjunto de prompts ainda. Crie o primeiro abaixo.</EmptyNote>}

      {sets.map((set) => (
        <PromptSetCard key={set.id} set={set} actions={actions} onError={onError} toastInfo={toastInfo} onPrepare={() => prepare(set)} />
      ))}

      <Card>
        <CardHeader><CardTitle className="text-base">Novo conjunto</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="set-name">Nome</Label><Input id="set-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Defesa criminal, Brasil" /></div>
            <div className="space-y-1.5"><Label htmlFor="set-markets">Mercados (país:idioma[:cidade], separados por vírgula)</Label><Input id="set-markets" value={marketsText} onChange={(e) => setMarketsText(e.target.value)} placeholder="br:pt-BR, us:en-US" /></div>
            <div className="space-y-1.5">
              <Label htmlFor="set-cadence">Cadência</Label>
              <Select value={cadence} onValueChange={(v) => setCadence(v as NexusCadence)}>
                <SelectTrigger id="set-cadence"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="weekly">Semanal</SelectItem><SelectItem value="daily">Diária</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <EnginePicker value={engines} onChange={setEngines} idPrefix="new-set" />
          <Button onClick={createSet} disabled={actions.upsertSet.isPending}>Salvar conjunto</Button>
        </CardContent>
      </Card>

      <ObservationDialog open={observationOpen} onOpenChange={setObservationOpen} actions={actions} onError={onError} toastInfo={toastInfo} />
    </Section>
  );
}

function EnginePicker({ value, onChange, idPrefix }: { value: string[]; onChange: (v: string[]) => void; idPrefix: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Motores</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {NEXUS_ENGINES.map((e) => (
          <label key={e} htmlFor={`${idPrefix}-${e}`} className="flex items-center gap-2 text-sm">
            <Checkbox id={`${idPrefix}-${e}`} checked={value.includes(e)} onCheckedChange={(c) => onChange(c === true ? [...value, e] : value.filter((x) => x !== e))} />
            {engineLabel(e)}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Somente os motores por API podem ser preparados em rodadas; os de produto exigem observação manual.</p>
    </fieldset>
  );
}

function PromptSetCard({ set, actions, onError, toastInfo, onPrepare }: SectionProps & { set: NexusPromptSet; onPrepare: () => void }) {
  const [topic, setTopic] = useState('');
  const [intent, setIntent] = useState<NexusIntent>('informational');
  const [query, setQuery] = useState('');
  const [branded, setBranded] = useState(false);

  async function addPrompt() {
    if (!topic.trim() || !query.trim()) { toastInfo('Dados incompletos', 'Informe tópico e consulta.'); return; }
    try {
      await actions.upsertPrompt.mutateAsync({ prompt_set_id: set.id, topic: topic.trim(), intent, query: query.trim().slice(0, 500), branded, position: set.prompts.length, active: true });
      setTopic(''); setQuery(''); setBranded(false);
    } catch (e) { onError(e, 'Não foi possível salvar o prompt'); }
  }
  async function remove(id: string) {
    try { await actions.deletePrompt.mutateAsync(id); } catch (e) { onError(e, 'Não foi possível apagar o prompt'); }
  }
  async function toggleStatus() {
    try {
      const { prompts: _prompts, created_at: _c, updated_at: _u, ...rest } = set;
      void _prompts; void _c; void _u;
      await actions.upsertSet.mutateAsync({ ...rest, status: set.status === 'active' ? 'paused' : 'active' });
    } catch (e) { onError(e, 'Não foi possível alterar o conjunto'); }
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{set.name}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{set.status === 'active' ? 'Ativo' : 'Pausado'}</Badge>
            <Badge variant="outline">{set.cadence === 'manual' ? 'Manual' : set.cadence === 'weekly' ? 'Semanal' : 'Diária'}</Badge>
          </div>
        </div>
        <CardDescription>
          Mercados: {marketsToText(set.markets) || '—'} · Motores: {set.engines.length ? set.engines.map(engineLabel).join(', ') : 'nenhum selecionado'}
        </CardDescription>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onPrepare} disabled={actions.preparePromptRun.isPending}>Preparar rodada (não executa)</Button>
          <Button size="sm" variant="outline" onClick={toggleStatus}>{set.status === 'active' ? 'Pausar' : 'Reativar'}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {set.prompts.length === 0 ? <EmptyNote>Sem prompts neste conjunto.</EmptyNote> : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Tópico</TableHead><TableHead>Intenção</TableHead><TableHead>Consulta</TableHead><TableHead>Marca</TableHead><TableHead><span className="sr-only">Ações</span></TableHead></TableRow></TableHeader>
              <TableBody>{set.prompts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.topic}</TableCell><TableCell>{INTENT_LABELS[p.intent] ?? p.intent}</TableCell>
                  <TableCell className="max-w-md break-words">{p.query}</TableCell><TableCell>{p.branded ? 'Sim' : 'Não'}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" aria-label={`Apagar prompt ${p.topic}`} onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor={`pt-${set.id}`}>Tópico</Label><Input id={`pt-${set.id}`} value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`pi-${set.id}`}>Intenção</Label>
            <Select value={intent} onValueChange={(v) => setIntent(v as NexusIntent)}>
              <SelectTrigger id={`pi-${set.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>{NEXUS_INTENTS.map((i) => <SelectItem key={i} value={i}>{INTENT_LABELS[i]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label htmlFor={`pq-${set.id}`}>Consulta (até 500 caracteres)</Label><Input id={`pq-${set.id}`} value={query} maxLength={500} onChange={(e) => setQuery(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor={`pb-${set.id}`} className="flex items-center gap-2 text-sm"><Checkbox id={`pb-${set.id}`} checked={branded} onCheckedChange={(c) => setBranded(c === true)} /> Consulta de marca</label>
          <Button size="sm" variant="outline" onClick={addPrompt} disabled={actions.upsertPrompt.isPending}>Adicionar prompt</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ObservationDialog({ open, onOpenChange, actions, onError, toastInfo }: SectionProps & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const today = isoDate(new Date());
  const empty = {
    engine: 'chatgpt_web', engine_surface: '', country: 'br', language: 'pt-BR', query: '', topic: '', intent: 'informational' as NexusIntent,
    branded: false, mentioned: false, cited: false, citations: '', competitors: '', answer_excerpt: '', note: '', observed_at: today,
    evidence_path: '', observer: '', session_state: '',
  };
  const [f, setF] = useState(empty);
  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setF((p) => ({ ...p, [k]: v }));
  const parsed = parseCitationLines(f.citations);
  const valid = f.query.trim() && f.topic.trim() && /^[a-z]{2}$/i.test(f.country) && f.language.trim() && f.observed_at && parsed.invalid === 0;

  async function submit() {
    try {
      await actions.importObservation.mutateAsync({
        engine: f.engine, country: f.country.toLowerCase(), language: f.language.trim(), query: f.query.trim(), topic: f.topic.trim(),
        intent: f.intent, branded: f.branded, rdm_mentioned: f.mentioned, rdm_cited: f.cited,
        citations: parsed.items, competitors: parseCompetitorLines(f.competitors), observed_at: f.observed_at,
        ...(f.engine_surface.trim() ? { engine_surface: f.engine_surface.trim() } : {}),
        ...(f.answer_excerpt.trim() ? { answer_excerpt: f.answer_excerpt.trim() } : {}),
        ...(f.note.trim() ? { note: f.note.trim() } : {}),
        ...(f.evidence_path.trim() ? { evidence_path: f.evidence_path.trim() } : {}),
        ...(f.observer.trim() ? { observer: f.observer.trim() } : {}),
        ...(f.session_state.trim() ? { session_state: f.session_state.trim() } : {}),
      });
      toastInfo('Observação registrada', 'Entra nos indicadores como observação manual.');
      setF(empty);
      onOpenChange(false);
    } catch (e) { onError(e, 'Não foi possível registrar a observação'); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar observação manual</DialogTitle>
          <DialogDescription>Registre o que você viu ao fazer a pergunta no produto. Guarde a evidência (captura) fora do sistema e indique o caminho.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ob-engine">Motor</Label>
            <Select value={f.engine} onValueChange={(v) => set('engine', v)}>
              <SelectTrigger id="ob-engine"><SelectValue /></SelectTrigger>
              <SelectContent>{NEXUS_ENGINES.map((e) => <SelectItem key={e} value={e}>{engineLabel(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ob-surface">Superfície (opcional)</Label><Input id="ob-surface" value={f.engine_surface} onChange={(e) => set('engine_surface', e.target.value)} placeholder="Ex.: app web, busca ativada" /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-country">País (ISO-2)</Label><Input id="ob-country" value={f.country} maxLength={2} onChange={(e) => set('country', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-lang">Idioma</Label><Input id="ob-lang" value={f.language} onChange={(e) => set('language', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ob-query">Consulta exata</Label><Input id="ob-query" value={f.query} maxLength={500} onChange={(e) => set('query', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-topic">Tópico</Label><Input id="ob-topic" value={f.topic} onChange={(e) => set('topic', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-intent">Intenção</Label>
            <Select value={f.intent} onValueChange={(v) => set('intent', v as NexusIntent)}>
              <SelectTrigger id="ob-intent"><SelectValue /></SelectTrigger>
              <SelectContent>{NEXUS_INTENTS.map((i) => <SelectItem key={i} value={i}>{INTENT_LABELS[i]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ob-date">Data da observação</Label><Input id="ob-date" type="date" value={f.observed_at} max={today} onChange={(e) => set('observed_at', e.target.value)} /></div>
          <div className="flex flex-col justify-end gap-2">
            <label htmlFor="ob-branded" className="flex items-center gap-2 text-sm"><Checkbox id="ob-branded" checked={f.branded} onCheckedChange={(c) => set('branded', c === true)} /> Consulta de marca</label>
            <label htmlFor="ob-mentioned" className="flex items-center gap-2 text-sm"><Checkbox id="ob-mentioned" checked={f.mentioned} onCheckedChange={(c) => set('mentioned', c === true)} /> O escritório foi mencionado</label>
            <label htmlFor="ob-cited" className="flex items-center gap-2 text-sm"><Checkbox id="ob-cited" checked={f.cited} onCheckedChange={(c) => set('cited', c === true)} /> Uma página do site foi citada como fonte</label>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ob-citations">Fontes citadas (uma por linha: URL | título opcional)</Label>
            <Textarea id="ob-citations" rows={3} value={f.citations} onChange={(e) => set('citations', e.target.value)} placeholder="https://exemplo.com.br/artigo | Título" />
            {parsed.invalid > 0 && <p role="alert" className="text-xs text-destructive">{parsed.invalid} linha(s) sem URL http(s) válida.</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ob-competitors">Concorrentes ou entidades apontadas (uma por linha: nome | site opcional)</Label>
            <Textarea id="ob-competitors" rows={3} value={f.competitors} onChange={(e) => set('competitors', e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ob-excerpt">Trecho da resposta (opcional)</Label><Textarea id="ob-excerpt" rows={3} value={f.answer_excerpt} onChange={(e) => set('answer_excerpt', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ob-note">Observação (opcional)</Label><Input id="ob-note" value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-evidence">Caminho da evidência</Label><Input id="ob-evidence" value={f.evidence_path} onChange={(e) => set('evidence_path', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-observer">Quem observou</Label><Input id="ob-observer" value={f.observer} onChange={(e) => set('observer', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ob-session">Estado da sessão (opcional)</Label><Input id="ob-session" value={f.session_state} onChange={(e) => set('session_state', e.target.value)} placeholder="Ex.: sem login, janela anônima" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid || actions.importObservation.isPending}>Registrar observação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignalsSection({ status, loading, error, actions, onError, toastInfo }: SectionProps & { status?: { site_id: string | null; allowed_origins: string[]; last_batch_at: string | null; totals_30d?: Record<string, number | undefined> | null }; loading: boolean; error: string | null }) {
  const [origins, setOrigins] = useState('');
  const [fresh, setFresh] = useState<NexusSiteSignalsKey | null>(null);
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const siteId = fresh?.site_id ?? status?.site_id ?? null;
  const endpoint = fresh?.endpoint ?? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/zica-signals`;
  const snippet = siteId ? buildSignalsSnippet(siteId, endpoint, appOrigin) : '';

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toastInfo(`${what} copiado`); } catch { toastInfo('Não foi possível copiar', 'Selecione o texto e copie manualmente.'); }
  }
  async function create() {
    try {
      const list = origins.split(/[,\s]+/).map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
      setFresh(await actions.createSignalsKey.mutateAsync(list.length ? list : undefined));
    } catch (e) { onError(e, 'Não foi possível criar a chave'); }
  }
  async function rotate() {
    if (!window.confirm('Girar a chave invalida o segredo atual. Sites que o usam deixarão de enviar sinais até receberem o novo. Continuar?')) return;
    try { setFresh(await actions.rotateSignalsKey.mutateAsync()); } catch (e) { onError(e, 'Não foi possível girar a chave'); }
  }

  return (
    <Section id="obs-sinais" title="Chave de sinais" description="Coleta contagens de visitas vindas de IA e de acessos de robôs de IA ao seu site. Sem cookies e sem dados pessoais.">
      {loading && <Skeleton className="h-24 w-full" aria-label="Carregando chave de sinais" />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardContent className="space-y-4 p-4 md:p-5">
          {fresh && (
            <Alert role="alert" className="border-amber-500/60 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Guarde o segredo agora: ele aparece uma única vez</AlertTitle>
              <AlertDescription className="space-y-2">
                <code className="block break-all rounded bg-background/70 p-2 text-xs" data-testid="signals-secret">{fresh.secret}</code>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(fresh.secret, 'Segredo')}><Copy className="mr-1 h-3 w-3" aria-hidden="true" /> Copiar segredo</Button>
                  <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>Já guardei, ocultar</Button>
                </div>
                {fresh.plugin_configured !== undefined && (
                  <p className="text-xs">{fresh.plugin_configured ? 'Plugin do WordPress configurado automaticamente.' : 'Plugin do WordPress não foi configurado automaticamente; configure-o manualmente se usar.'}</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {!siteId && !loading ? (
            <div className="space-y-3">
              <EmptyNote>Nenhuma chave criada para este projeto.</EmptyNote>
              <div className="space-y-1.5 sm:max-w-lg">
                <Label htmlFor="sig-origins">Origens permitidas (opcional, separadas por vírgula)</Label>
                <Input id="sig-origins" value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://www.seusite.com.br" />
                <p className="text-xs text-muted-foreground">Vazio: aceita apenas o domínio do projeto.</p>
              </div>
              <Button onClick={create} disabled={actions.createSignalsKey.isPending}><KeyRound className="mr-1 h-4 w-4" aria-hidden="true" /> Criar chave de sinais</Button>
            </div>
          ) : siteId ? (
            <div className="space-y-3">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Identificador do site</dt><dd className="font-mono">{siteId}</dd></div>
                <div><dt className="text-muted-foreground">Último lote recebido</dt><dd>{status?.last_batch_at ? new Date(status.last_batch_at).toLocaleString('pt-BR') : 'nenhum recebido'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Origens permitidas</dt><dd>{status?.allowed_origins?.length ? status.allowed_origins.join(', ') : 'apenas o domínio do projeto'}</dd></div>
              </dl>
              <div className="space-y-1.5">
                <Label htmlFor="sig-snippet">Snippet para colar antes de &lt;/head&gt;</Label>
                <Textarea id="sig-snippet" readOnly rows={3} className="font-mono text-xs" value={snippet} />
                <Button size="sm" variant="outline" onClick={() => copy(snippet, 'Snippet')}><Copy className="mr-1 h-3 w-3" aria-hidden="true" /> Copiar snippet</Button>
                <p className="text-xs text-muted-foreground">O snippet só vê visitas de pessoas. Robôs de IA não executam JavaScript: para contá-los, use o plugin do WordPress ou uma integração de servidor.</p>
              </div>
              <Button size="sm" variant="outline" onClick={rotate} disabled={actions.rotateSignalsKey.isPending}><RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" /> Girar chave</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Section>
  );
}
