import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Eye, Info, MessageSquarePlus, MousePointerClick, Quote, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/nexus-observatory';
import {
  NOT_MEASURED_REASON, SMALL_SAMPLE, computeDelta, confidenceNote, effectiveConfidence, formatPercent, formatPeriod, formatZvi, hasTrendData, missingLabel, rise, sparkValues,
} from '@/lib/nexus-visibility';
import type { RequestKind } from '@/types/nexus-requests';
import type { ChangeItem, VisibilityOverview } from '@/types/nexus-visibility';
import { TrendChart } from './TrendChart';
import {
  ConfidenceBadge, DeltaPill, EmptyState, ErrorState, LoadingBlock, PanelHeader, PartialBadge, Pill, RangeBar, SampleLine, Sparkline,
} from './shared';

export interface OverviewViewProps {
  data: VisibilityOverview | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  canManage: boolean;
  onRequest: (kind: RequestKind, message: string) => void;
}

function Tile({ i, label, hint, badges, children, testId }: { i: number; label: string; hint: string; badges?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <section aria-label={label} data-testid={testId} style={rise(i)} className="zv-panel zv-rise flex min-w-0 flex-col gap-3 p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{label}</h2>
          <p className="text-xs text-[var(--zv-muted)]">{hint}</p>
        </div>
        {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
      </header>
      {children}
    </section>
  );
}

function BigNumber({ value, suffix, testId }: { value: string; suffix?: string; testId: string }) {
  return (
    <p className="flex items-baseline gap-1.5 tabular-nums" data-testid={testId}>
      <span className="text-5xl font-bold leading-none tracking-tight sm:text-6xl">{value}</span>
      {suffix && <span className="text-lg font-medium text-[var(--zv-muted)]">{suffix}</span>}
    </p>
  );
}

function ChangeIcon({ kind }: { kind: string }) {
  const k = kind.toLowerCase();
  if (/(up|subiu|ganh|gain|increase|alta)/.test(k)) return <ArrowUpRight className="h-4 w-4 text-[var(--zv-good)]" aria-hidden="true" />;
  if (/(down|caiu|perd|loss|decrease|queda|baixa)/.test(k)) return <ArrowDownRight className="h-4 w-4 text-[var(--zv-bad)]" aria-hidden="true" />;
  if (/(new|novo|nova|first|primeira)/.test(k)) return <Sparkles className="h-4 w-4 text-[var(--zv-info)]" aria-hidden="true" />;
  return <Info className="h-4 w-4 text-[var(--zv-muted)]" aria-hidden="true" />;
}

function ChangesList({ items }: { items: ChangeItem[] }) {
  if (items.length === 0) return <p className="text-sm text-[var(--zv-muted)]">Nada de novo para destacar neste período.</p>;
  return (
    <ul className="space-y-2.5" aria-label="O que mudou">
      {items.map((c, idx) => (
        <li key={`${c.kind}-${idx}`} className="flex items-start gap-2.5 text-sm">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--zv-surface-2)]"><ChangeIcon kind={c.kind} /></span>
          <span className="min-w-0 leading-snug">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ResultStrip({ data, canManage, onRequest }: { data: VisibilityOverview; canManage: boolean; onRequest: OverviewViewProps['onRequest'] }) {
  const { ga4, gsc } = data.result;
  const steps: Array<{ id: string; icon: ReactNode; title: string; value: string; note: string }> = [
    { id: 'vis', icon: <Eye className="h-4 w-4" aria-hidden="true" />, title: 'O que as IAs dizem', value: formatPercent(data.indicators.vr.value), note: 'respostas que mencionam a marca' },
    { id: 'gsc', icon: <Search className="h-4 w-4" aria-hidden="true" />, title: 'Cliques no Google', value: gsc ? formatCount(gsc.clicks) : 'n/d', note: gsc ? `${formatCount(gsc.impressions)} impressões` : 'Search Console não conectado' },
    { id: 'ga4', icon: <MousePointerClick className="h-4 w-4" aria-hidden="true" />, title: 'Visitas ao site', value: ga4 ? formatCount(ga4.sessions) : 'n/d', note: ga4 ? `${formatCount(ga4.ai_sessions)} vindas de IA · ${formatCount(ga4.key_events)} ações-chave` : 'Analytics não conectado' },
  ];
  const missing = !ga4 || !gsc;
  return (
    <section aria-label="Visibilidade e resultado" className="zv-panel zv-rise p-5" style={rise(6)} data-testid="result-strip">
      <PanelHeader title="Visibilidade → Resultado" hint="O que as IAs dizem ao lado do que realmente chegou ao site, no mesmo período." />
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, idx) => (
          <li key={s.id} className="relative flex min-w-0 flex-col gap-1 rounded-xl bg-[var(--zv-surface-2)] p-3.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--zv-muted)]">{s.icon}{s.title}</span>
            <span className="text-2xl font-bold tabular-nums" data-testid={`result-${s.id}`}>{s.value}</span>
            <span className="text-xs text-[var(--zv-muted)]">{s.note}</span>
            {idx < steps.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--zv-surface)] text-[var(--zv-muted)] sm:block" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-[var(--zv-muted)]">Os números aparecem lado a lado para você comparar. Eles não provam que um causou o outro.</p>
      {missing && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[var(--zv-muted)]">{canManage ? 'Conecte o Search Console e o Analytics para completar esta faixa.' : 'Ainda faltam fontes de dados reais neste projeto.'}</span>
          {canManage
            ? <Button asChild size="sm" variant="outline"><Link to="/nexus/motores">Abrir conexões</Link></Button>
            : <Button size="sm" variant="outline" onClick={() => onRequest('connect_source', 'Quero conectar o Google Search Console e o Google Analytics para ver o resultado real na página de Visibilidade.')}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Solicitar ao gestor</Button>}
        </div>
      )}
    </section>
  );
}

/** Painel: em 5 segundos, "estou melhorando?". Visão pura (sem hooks de dados). */
export function OverviewView({ data, loading, error, onRetry, canManage, onRequest }: OverviewViewProps) {
  if (!data && loading) return <LoadingBlock label="Carregando o painel de visibilidade" rows={3} />;
  if (!data && error) return <ErrorState error={error} onRetry={onRetry} title="Não foi possível carregar o painel" />;
  if (!data) return null;

  if (data.n_observations === 0) {
    return (
      <div className="space-y-4">
        {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="Ainda sem observações neste período"
          action={canManage
            ? <Button asChild size="sm"><Link to="/nexus/observatorio">Abrir o Observatório</Link></Button>
            : <Button size="sm" onClick={() => onRequest('new_observation_round', 'Quero uma nova rodada de observação para ver a minha visibilidade nas IAs.')}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Pedir uma coleta ao gestor</Button>}
        >
          <p>{canManage
            ? 'Rode uma coleta no Observatório (ou escolha um período maior) e o painel passa a mostrar a evolução.'
            : 'Peça ao gestor para rodar uma coleta. Quando houver observações, aqui você vê em segundos se a sua marca está sendo mais lembrada pelas IAs.'}</p>
          <ul className="mx-auto mt-3 max-w-sm list-disc space-y-1 pl-5 text-left">
            <li>A nota de 0 a 100 e se ela subiu ou caiu.</li>
            <li>Em quais IAs a sua marca aparece e quem aparece ao lado.</li>
            <li>De onde as IAs tiram as respostas e o que dá para melhorar.</li>
          </ul>
          <p className="mt-3">Nada é preenchido por estimativa: sem observação, mostramos “n/d”.</p>
        </EmptyState>
      </div>
    );
  }

  const { zvi, indicators: ind, previous } = data;
  const zviN = data.n_observations;
  const zviConf = effectiveConfidence(zvi.confidence, zviN);
  const vrConf = effectiveConfidence('alta', ind.vr.n);
  // Variação só é confiável se os DOIS períodos têm amostra boa (o anterior pode não informar n).
  const prevSmall = previous?.n != null && previous.n < SMALL_SAMPLE;
  const zviDelta = computeDelta(zvi.value, previous?.zvi, 'pts');
  const vrDelta = computeDelta(ind.vr.value, previous?.vr, 'pp');
  const crDelta = computeDelta(ind.cr.value, previous?.cr, 'pp');
  const ga4 = data.result.ga4;
  const aiShare = ga4 && ga4.sessions > 0 ? ga4.ai_sessions / ga4.sessions : null;
  const trend = data.trend;

  return (
    <div className="space-y-4">
      {!!error && <ErrorState error={error} onRetry={onRetry} title="Não foi possível atualizar" />}
      {data.truncated && <p role="status" className="rounded-xl border border-dashed p-3 text-sm text-[var(--zv-muted)]">Este período tem muitas observações; mostramos o resumo das 20.000 mais recentes. Escolha um período menor para ver tudo.</p>}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <Tile i={0} testId="tile-zvi" label="Índice Zica de Visibilidade" hint="Nota de 0 a 100 que resume o quanto as IAs lembram da sua marca."
          badges={<>{zvi.partial && <PartialBadge />}<ConfidenceBadge confidence={zvi.confidence} n={zviN} /></>}>
          <BigNumber value={formatZvi(zvi.value)} suffix={zvi.value === null ? undefined : '/ 100'} testId="zvi-value" />
          <DeltaPill delta={zviDelta} lowConfidence={(zviConf === 'baixa' || prevSmall) && !!zviDelta} />
          <div className="space-y-1.5">
            <RangeBar value={zvi.value} low={zvi.low} high={zvi.high} max={100} label={`Nota ${formatZvi(zvi.value)} de 100, intervalo de confiança de ${zvi.low === null ? 'n/d' : Math.round(zvi.low)} a ${zvi.high === null ? 'n/d' : Math.round(zvi.high)}`} />
            <div className="flex justify-between text-[10px] tabular-nums text-[var(--zv-muted)]" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>
            <SampleLine n={zviN} low={zvi.low} high={zvi.high} kind="zvi" />
          </div>
          {zvi.partial && (
            <p className="rounded-xl bg-[var(--zv-warn-bg)] p-2.5 text-xs leading-relaxed text-[var(--zv-warn)]" data-testid="zvi-partial-note">
              Índice parcial: ainda não medimos {zvi.missing.length ? zvi.missing.map(missingLabel).join(' e ') : 'todos os componentes'}. O peso deles foi redistribuído entre os demais.
            </p>
          )}
          <p className="text-xs text-[var(--zv-muted)]">{confidenceNote(zviConf)} Método {data.method.version}.</p>
        </Tile>

        <Tile i={1} testId="tile-vr" label="Visibilidade nas IAs" hint="Em quantas respostas a sua marca é mencionada." badges={<ConfidenceBadge confidence="alta" n={ind.vr.n} />}>
          <BigNumber value={formatPercent(ind.vr.value)} testId="vr-value" />
          <DeltaPill delta={vrDelta} lowConfidence={(vrConf === 'baixa' || prevSmall) && !!vrDelta} />
          <Sparkline values={sparkValues(trend, 'vr')} label="Evolução diária da visibilidade" />
          <SampleLine n={ind.vr.n} low={ind.vr.low} high={ind.vr.high} />
        </Tile>

        <Tile i={2} testId="tile-ai" label="Visitas vindas de IA" hint="Pessoas que chegaram ao site a partir de assistentes de IA.">
          <BigNumber value={ga4 ? formatCount(ga4.ai_sessions) : 'n/d'} testId="ai-value" />
          {ga4 ? (
            <>
              <p className="text-sm text-[var(--zv-muted)]" data-testid="ai-share">
                {aiShare === null ? 'Sem visitas no período.' : `${formatPercent(aiShare)} das ${formatCount(ga4.sessions)} visitas ao site.`}
              </p>
              <p className="text-xs text-[var(--zv-muted)]">Comparação com o período anterior ainda não disponível. Medido pelo Google Analytics.</p>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--zv-muted)]">Ainda não medimos: o Google Analytics não está conectado a este projeto.</p>
              {canManage
                ? <Button asChild size="sm" variant="outline"><Link to="/nexus/motores">Conectar o Analytics</Link></Button>
                : <Button size="sm" variant="outline" onClick={() => onRequest('connect_source', 'Quero conectar o Google Analytics para ver as visitas vindas de IA.')}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Solicitar ao gestor</Button>}
            </div>
          )}
        </Tile>
      </div>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Outros indicadores">
        {[
          { id: 'cr', label: 'Citação', value: formatPercent(ind.cr.value), note: 'respostas que usam o seu site como fonte', n: ind.cr.n, delta: crDelta },
          { id: 'sov', label: 'Participação', value: formatPercent(ind.sov.value), note: 'das menções entre as marcas acompanhadas', n: ind.sov.n, delta: null },
          { id: 'est', label: 'Estabilidade', value: formatPercent(ind.est.value), note: 'quanto a IA repete a mesma resposta', n: ind.est.n, delta: null },
        ].map((k, idx) => (
          <li key={k.id} style={rise(3 + idx)} className="zv-panel zv-rise flex flex-col gap-1 p-4" data-testid={`ind-${k.id}`}>
            <span className="text-xs font-medium text-[var(--zv-muted)]">{k.label}</span>
            <span className="text-2xl font-bold tabular-nums" data-testid={`ind-${k.id}-value`}>{k.value}</span>
            {k.delta && <DeltaPill delta={k.delta} />}
            <span className="text-xs text-[var(--zv-muted)]">{k.note}</span>
            <span className="text-[11px] text-[var(--zv-muted)]">{k.n} {k.n === 1 ? 'observação' : 'observações'}</span>
          </li>
        ))}
        {[
          { id: 'pm', label: 'Posição de menção' },
          { id: 'rep', label: 'Reputação' },
        ].map((k, idx) => (
          <li key={k.id} style={rise(6 + idx)} className="zv-panel zv-rise flex flex-col gap-1 border-dashed p-4" data-testid={`ind-${k.id}`}>
            <span className="text-xs font-medium text-[var(--zv-muted)]">{k.label}</span>
            <span className="text-2xl font-bold text-[var(--zv-muted)]" data-testid={`ind-${k.id}-value`}>n/d</span>
            <Pill tone="neutral" className="w-fit">Não medido</Pill>
            <span className="text-xs text-[var(--zv-muted)]">{NOT_MEASURED_REASON}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Evolução" className="zv-panel zv-rise p-5" style={rise(8)}>
          <PanelHeader title="Evolução no período" hint={formatPeriod(data.period) || undefined} />
          {hasTrendData(trend) ? <TrendChart trend={trend} /> : <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--zv-muted)]">Ainda não há dias suficientes com observações para desenhar a evolução.</p>}
        </section>
        <section aria-label="O que mudou" className="zv-panel zv-rise p-5" style={rise(9)}>
          <PanelHeader title="O que mudou" hint="Os fatos mais importantes do período." />
          <ChangesList items={data.changes} />
        </section>
      </div>

      <ResultStrip data={data} canManage={canManage} onRequest={onRequest} />
      <p className="flex items-center gap-1.5 text-xs text-[var(--zv-muted)]"><Quote className="h-3 w-3" aria-hidden="true" /> Números observados, sem promessa de resultado.</p>
    </div>
  );
}
