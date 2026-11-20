import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Rocket, ShieldAlert, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { autoOptimizeMessage, fmtUsd, PENDING_KIND_LABEL, SOURCE_LABEL, STEP_STATUS_LABEL, type PilotReport } from '@/lib/auto-optimize-api';
import type { AutoPilot } from '@/hooks/useAutoPilot';
import { cn } from '@/lib/utils';

interface Props { pilot: AutoPilot; className?: string }

const levelLabel = { exigir: 'exigir', recomendar: 'recomendar', desligado: 'desligado' } as const;

/** Painel do Piloto Automático: o que foi aplicado sozinho, o que precisa de uma pessoa, o custo do dia e a chave "automático" do projeto. */
export function AutoPilotPanel({ pilot, className }: Props) {
  const { state, loading, loadError, phase, steps, report, error } = pilot;
  const [rulesOpen, setRulesOpen] = useState(false);
  const running = phase === 'running'; const busy = running || phase === 'applying';
  const canWrite = !!state?.can_write;
  const shown: PilotReport | null = report ?? state?.last_report ?? null;
  const proposal = state?.proposal;
  const spend = state?.spend;
  const cap = spend?.cap_usd_micros ?? 0;

  return (
    <Card className={cn('w-full min-w-0 overflow-hidden', className)} data-testid="autopilot-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><Rocket className="h-4 w-4 shrink-0 text-primary" />Piloto automático</span>
          {state && (
            <label className="flex items-center gap-2 text-xs font-normal">
              <span>Automático</span>
              <Switch
                aria-label="Automático ligado neste projeto"
                checked={state.auto}
                disabled={!canWrite || !state.article.project_id || busy}
                onCheckedChange={(v) => { void pilot.setAuto({ auto: v }); }}
              />
            </label>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3 break-words text-xs">
        {loading && <p className="text-muted-foreground">Carregando o estado do piloto...</p>}
        {!loading && loadError ? <p role="alert" className="text-red-600">{autoOptimizeMessage(loadError)}</p> : null}

        {state && (
          <>
            <p className="text-muted-foreground">
              {state.auto
                ? 'Ligado: ao salvar como pronto e antes de publicar, o piloto confere as regras do projeto e prepara um rascunho de revisão. Você aprova antes de valer.'
                : 'Desligado: o piloto só roda quando você clicar. Ligue para ele rodar sozinho ao salvar como pronto e antes de publicar.'}
            </p>
            <p className="text-muted-foreground" data-testid="autopilot-language">
              Idioma do texto: <strong>{state.language.tag === 'und' ? 'não identificado' : state.language.tag}</strong>
              {state.language.formula ? ` — legibilidade pela fórmula ${state.language.formula.label}${state.language.formula.status === 'referencia' ? ' (constantes de referência)' : ''}.` : ' — sem fórmula de legibilidade para este idioma (a nota não é calculada, nunca vira zero).'}
            </p>

            <div className="rounded border p-2" data-testid="autopilot-cost">
              <div className="flex flex-wrap justify-between gap-x-3">
                <span>Custo do piloto hoje (estimado)</span>
                <strong>{fmtUsd(state.pilot_today_usd_micros)}</strong>
              </div>
              {spend ? (
                <>
                  <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-muted-foreground">
                    <span>Gasto do dia no teto</span>
                    <span>{fmtUsd(spend.used_usd_micros)} de {fmtUsd(cap)}{spend.pct !== null ? ` (${String(spend.pct).replace('.', ',')}%)` : ''}</span>
                  </div>
                  <Progress value={Math.min(100, spend.pct ?? 0)} className="mt-1 h-1.5" aria-label="Uso do teto diário de gasto" />
                </>
              ) : <p className="mt-1 text-muted-foreground">Não consegui ler o teto de hoje agora. Por segurança, o piloto não faz chamada de IA sem essa leitura.</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">O valor do piloto é uma estimativa pela tabela de preços; o gasto real do dia é o do teto diário.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!running ? (
                <Button size="sm" className="min-w-0 flex-1" disabled={!canWrite || busy} onClick={() => { void pilot.run(); }}>
                  <Rocket className="mr-2 h-4 w-4 shrink-0" />Otimizar e Corrigir
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="min-w-0 flex-1" onClick={pilot.stop}>Parar depois deste passo</Button>
              )}
            </div>
            {!canWrite && <p className="text-muted-foreground">Seu papel permite ver o piloto, mas não rodá-lo.</p>}

            {steps.length > 0 && (
              <ol className="space-y-1" aria-label="Progresso do piloto" data-testid="autopilot-steps">
                {steps.map((s, i) => (
                  <li key={`${s.label}-${i}`} className="flex items-start gap-2">
                    {s.status === 'em_andamento' ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" /> : s.status === 'feito' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" /> : s.status === 'parou' ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                    <span className="min-w-0"><span>{s.label}</span>{s.detail ? <span className="block text-muted-foreground">{s.detail}</span> : null}</span>
                  </li>
                ))}
              </ol>
            )}

            {error ? <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-red-700 dark:border-red-800 dark:bg-red-950/30">{autoOptimizeMessage(error)}</p> : null}

            {shown?.stopped?.reason === 'teto' && (
              <div role="alert" className="flex gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" data-testid="autopilot-cap-stop">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span><strong>O teto diário de gasto bateu e o piloto parou.</strong> {shown.stopped.message} O texto do artigo continua como estava; o que faltou está na lista de pendências.</span>
              </div>
            )}

            {shown && (
              <div className="space-y-2" data-testid="autopilot-report">
                <p className="text-muted-foreground">
                  Nota {shown.before.score} → {shown.after.score}. Custo desta rodada (estimado): {fmtUsd(shown.cost_usd_micros)}.
                </p>
                <section aria-label="Aplicado automaticamente">
                  <p className="font-semibold">Aplicado automaticamente ({shown.applied.length})</p>
                  {shown.applied.length === 0 ? <p className="text-muted-foreground">Nada precisou ser corrigido sozinho.</p> : (
                    <ul className="space-y-1">
                      {shown.applied.map((a, i) => (
                        <li key={`${a.id}-${i}`} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                          <span className="min-w-0">{a.label}{a.count && a.count > 1 ? ` (${a.count})` : ''}{a.kind === 'ia' ? ' · IA' : ' · sem IA'}{a.detail ? <span className="block text-muted-foreground">{a.detail}</span> : null}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section aria-label="Pendências humanas">
                  <p className="font-semibold">Pendências para uma pessoa ({shown.pending.length})</p>
                  {shown.pending.length === 0 ? <p className="text-muted-foreground">Nenhuma pendência.</p> : (
                    <ul className="space-y-1">
                      {shown.pending.map((p, i) => (
                        <li key={`${p.id}-${i}`} className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <span className="min-w-0"><Badge variant="outline" className="mr-1 text-[10px]">{PENDING_KIND_LABEL[p.kind]}</Badge>{p.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {shown.compliance.warnings.length > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">Conformidade ({shown.compliance.pack ?? 'pacote do segmento'}, modo {shown.compliance.mode}): {shown.compliance.warnings.map((w) => w.label).join('; ')}.</p>
                )}
                {shown.steps.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Passos: {shown.steps.map((s) => `${s.id} ${STEP_STATUS_LABEL[s.status]}`).join(' · ')}</p>
                )}
              </div>
            )}

            {proposal?.status === 'pending_review' && (
              <div className="space-y-2 rounded border border-primary/30 bg-primary/5 p-2" data-testid="autopilot-proposal">
                <p><strong>Rascunho do piloto aguardando a sua revisão.</strong> O texto do artigo ainda não mudou.</p>
                {proposal.stale && <p role="alert" className="text-amber-700 dark:text-amber-400">O artigo foi editado depois desta análise. Rode o piloto de novo antes de aplicar.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="min-w-0 flex-1" disabled={!canWrite || busy || proposal.stale} onClick={() => { void pilot.apply(); }}>Aplicar no artigo</Button>
                  <Button size="sm" variant="outline" className="min-w-0 flex-1" disabled={!canWrite || busy} onClick={() => { void pilot.discard(); }}>Descartar</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Depois de aplicar, o texto muda: a revisão e a aprovação para publicar valem de novo.</p>
              </div>
            )}

            <Collapsible open={rulesOpen} onOpenChange={setRulesOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left font-medium" aria-label="Ver as regras usadas">
                <span>Regras usadas ({state.rules.filter((r) => r.level !== 'desligado').length} ligadas)</span><ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', rulesOpen && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-1" data-testid="autopilot-rules">
                <p className="text-muted-foreground">Tamanho, legibilidade e demais mínimos não são regras fixas do sistema: quem define são o prompt e o agente do projeto. Os valores marcados como padrão editável valem enquanto ninguém disser outra coisa.</p>
                <ul className="space-y-0.5">
                  {state.rules.map((r) => (
                    <li key={r.id} className="flex flex-wrap justify-between gap-x-2">
                      <span className="min-w-0">{r.label}</span>
                      <span className="text-muted-foreground">{levelLabel[r.level]}{r.value !== null ? ` ${r.value}${r.max !== null ? `–${r.max}` : ''}` : ''} · {SOURCE_LABEL[r.source]}</span>
                    </li>
                  ))}
                </ul>
                {state.can_admin && (
                  <div className="space-y-2 rounded border p-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="min-w-0">Aplicar sem revisão (não recomendado para texto sensível)</span>
                      <Switch aria-label="Aplicar sem revisão" checked={state.apply_without_review} disabled={busy} onCheckedChange={(v) => { void pilot.setAuto({ apply_without_review: v }); }} />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span className="min-w-0">Segurar como rascunho no WordPress se faltar item exigido</span>
                      <Switch aria-label="Segurar como rascunho no WordPress" checked={state.plugin_gate === 'exigir'} disabled={busy} onCheckedChange={(v) => { void pilot.setAuto({ plugin_gate: v ? 'exigir' : 'avisar' }); }} />
                    </label>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}
