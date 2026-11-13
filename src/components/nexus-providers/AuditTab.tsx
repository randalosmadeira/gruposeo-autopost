import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SeverityBadge, ToneBadge } from '@/components/nexus-providers/badges';
import {
  CATEGORY_ORDER_AUDIT, SEVERITY_ORDER, SNOOZE_OPTIONS, auditCategoryHint, auditCategoryLabel, findingStatusLabel, fixLabel, fixResultMessage, fixRoute,
  groupFindings, isApplicableFix, minutesToNextAudit, runStatusLabel, runStatusTone, severityLabel, snoozeHoursLabel,
} from '@/lib/nexus-audit';
import { formatRelative, providerErrorMessage } from '@/lib/nexus-providers';
import type { AuditApplyFixResult, AuditFinding, AuditOverview } from '@/types/nexus-providers';

export interface AuditViewProps {
  overview: AuditOverview | undefined;
  loading: boolean;
  error: unknown;
  now: number;
  canAdmin: boolean;
  running: boolean;
  onRun: () => Promise<void>;
  onUpdate: (id: string, patch: { status: 'acknowledged' | 'snoozed' | 'open'; snoozeHours?: number }) => Promise<void>;
  onApplyFix: (finding: AuditFinding) => Promise<AuditApplyFixResult>;
  /** `open_route`: navegação interna do app (sem chamada ao servidor). */
  onOpenRoute: (route: string, tab?: string) => void;
  onRetry: () => void;
}

export function AuditView({ overview, loading, error, now, canAdmin, running, onRun, onUpdate, onApplyFix, onOpenRoute, onRetry }: AuditViewProps) {
  const [fixTarget, setFixTarget] = useState<AuditFinding | null>(null);
  const [fixBusy, setFixBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function run() {
    setActionError(null);
    try { await onRun(); } catch (e) { setActionError(providerErrorMessage(e)); }
  }

  async function update(id: string, patch: { status: 'acknowledged' | 'snoozed' | 'open'; snoozeHours?: number }) {
    setActionError(null); setRowBusy(id);
    try { await onUpdate(id, patch); } catch (e) { setActionError(providerErrorMessage(e)); } finally { setRowBusy(null); }
  }

  async function confirmFix() {
    const f = fixTarget;
    setFixTarget(null);
    if (!f) return;
    setFixBusy(f.id); setActionError(null);
    try {
      const r = await onApplyFix(f);
      setMessages((m) => ({ ...m, [f.id]: { ok: r.ok, text: fixResultMessage(r) } }));
    } catch (e) {
      setMessages((m) => ({ ...m, [f.id]: { ok: false, text: `A correção não pôde ser concluída. ${providerErrorMessage(e)}` } }));
    } finally { setFixBusy(null); }
  }

  function startFix(f: AuditFinding) {
    const route = fixRoute(f.fix_action);
    if (route) { onOpenRoute(route.route, route.tab); return; } // navegação: sem confirmação nem chamada ao servidor
    setFixTarget(f);
  }

  if (loading && !overview) {
    return <div aria-busy="true" aria-label="Carregando a auditoria" className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  }
  if (error && !overview) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar a Saúde do sistema</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">{providerErrorMessage(error)}<Button size="sm" variant="outline" onClick={onRetry}>Tentar de novo</Button></AlertDescription>
      </Alert>
    );
  }
  if (!overview) return null;

  const { active, resolved } = groupFindings(overview.findings);
  const activeCount = CATEGORY_ORDER_AUDIT.reduce((n, c) => n + active[c].length, 0);
  const next = minutesToNextAudit(overview.runs, overview.last_run, now);
  const last = overview.last_run;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" data-testid="audit-strip" className="text-sm">
              {last
                ? <>Última auditoria {formatRelative(last.finished_at ?? last.started_at, now)} ({runStatusLabel(last.status)}){next === null ? '' : ` · próxima em ≈ ${next} min`}</>
                : 'Nenhuma auditoria executada ainda.'}
            </p>
            <Button onClick={() => { void run(); }} disabled={!canAdmin || running} title={canAdmin ? undefined : 'Só proprietário ou administrador pode auditar agora'}>
              {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="mr-1 h-4 w-4" aria-hidden="true" />}
              Auditar agora
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Achados abertos por categoria">
            {CATEGORY_ORDER_AUDIT.map((c) => (
              <li key={c}><ToneBadge tone={c === 'corrective' && overview.counts.open[c] > 0 ? 'danger' : 'neutral'}>{`${auditCategoryLabel(c)}: ${overview.counts.open[c] ?? 0}`}</ToneBadge></li>
            ))}
            <li><ToneBadge tone="success">{`Resolvidos em 7 dias: ${overview.counts.resolved_7d ?? 0}`}</ToneBadge></li>
          </ul>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Achados abertos por severidade">
            {SEVERITY_ORDER.map((s) => <li key={s}>{severityLabel(s)}: {overview.counts.by_severity[s] ?? 0}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">A auditoria roda a cada 15 minutos e usa só verificações gratuitas e leituras: nunca faz chamadas pagas.</p>
          <div aria-live="polite">{actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}</div>
        </CardContent>
      </Card>

      {activeCount === 0 && (
        <div className="flex items-start gap-3 rounded-md border border-emerald-600/50 bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Nenhum achado aberto.</p>
            <p className="text-sm">A última auditoria não encontrou nada a corrigir, prevenir ou melhorar. Novos achados aparecem aqui sozinhos.</p>
          </div>
        </div>
      )}

      {CATEGORY_ORDER_AUDIT.map((c) => active[c].length > 0 && (
        <section key={c} aria-labelledby={`audit-${c}`} className="space-y-3">
          <div>
            <h3 id={`audit-${c}`} className="text-lg font-semibold">{auditCategoryLabel(c)} ({active[c].length})</h3>
            <p className="text-sm text-muted-foreground">{auditCategoryHint(c)}</p>
          </div>
          <ul className="space-y-3">
            {active[c].map((f) => {
              const fixable = isApplicableFix(f.fix_action);
              const msg = messages[f.id];
              const isRoute = !!fixRoute(f.fix_action);
              return (
                <li key={f.id}>
                  <Card data-testid={`finding-${f.id}`}>
                    <CardHeader className="space-y-2 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={f.severity} />
                        {f.status !== 'open' && <ToneBadge tone="neutral">{findingStatusLabel(f.status)}</ToneBadge>}
                      </div>
                      <CardTitle className="text-base leading-snug">{f.title}</CardTitle>
                      {f.detail && <CardDescription>{f.detail}</CardDescription>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {f.suggested_action && <p className="text-sm"><span className="font-medium">Ação sugerida:</span> {f.suggested_action}</p>}
                      <p className="text-xs text-muted-foreground">
                        Visto pela primeira vez {formatRelative(f.first_seen_at, now)} · {f.occurrences} ocorrência(s)
                        {f.status === 'snoozed' && f.snoozed_until ? ` · adiado até ${new Date(f.snoozed_until).toLocaleString('pt-BR')}` : ''}
                      </p>
                      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-800 dark:text-emerald-200' : 'text-destructive'}`}>{msg.text}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        {fixable && (
                          <Button size="sm" disabled={(!canAdmin && !isRoute) || fixBusy === f.id} onClick={() => startFix(f)}
                            title={!canAdmin && !isRoute ? 'Só proprietário ou administrador pode aplicar correções' : undefined} aria-label={`${isRoute ? 'Abrir tela' : 'Aplicar correção'}: ${f.title}`}>
                            {fixBusy === f.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Wrench className="mr-1 h-4 w-4" aria-hidden="true" />}
                            {isRoute ? 'Abrir tela' : 'Aplicar correção'}
                          </Button>
                        )}
                        {f.status === 'open' ? (
                          <Button size="sm" variant="outline" disabled={rowBusy === f.id} onClick={() => { void update(f.id, { status: 'acknowledged' }); }} aria-label={`Reconhecer: ${f.title}`}>Reconhecer</Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={rowBusy === f.id} onClick={() => { void update(f.id, { status: 'open' }); }} aria-label={`Reabrir: ${f.title}`}>Reabrir</Button>
                        )}
                        <span className="text-xs text-muted-foreground" id={`snooze-${f.id}`}>Adiar:</span>
                        {SNOOZE_OPTIONS.map((h) => (
                          <Button key={h} size="sm" variant="ghost" disabled={rowBusy === f.id} onClick={() => { void update(f.id, { status: 'snoozed', snoozeHours: h }); }}
                            aria-label={`Adiar por ${snoozeHoursLabel(h)}: ${f.title}`}>
                            {h === 1 ? '1 h' : h === 24 ? '24 h' : '7 d'}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {resolved.length > 0 && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Resolvidos nos últimos 7 dias ({resolved.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {resolved.map((f) => <li key={f.id}>{f.title} <span className="text-xs">({auditCategoryLabel(f.category)})</span></li>)}
          </ul>
        </details>
      )}

      <section aria-labelledby="audit-runs" className="space-y-2">
        <h3 id="audit-runs" className="text-lg font-semibold">Histórico de execuções</h3>
        {overview.runs.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhuma execução registrada.</p> : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Início</TableHead><TableHead>Origem</TableHead><TableHead>Resultado</TableHead><TableHead className="text-right">Regras</TableHead><TableHead className="text-right">Abertos</TableHead><TableHead className="text-right">Resolvidos</TableHead></TableRow></TableHeader>
              <TableBody>{overview.runs.map((r) => (
                <TableRow key={String(r.id)}>
                  <TableCell>{new Date(r.started_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{r.trigger === 'manual' ? 'Manual' : 'Agendada'}</TableCell>
                  <TableCell><ToneBadge tone={runStatusTone(r.status)}>{runStatusLabel(r.status)}</ToneBadge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.rules_evaluated}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.findings_opened}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.findings_resolved}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
      </section>

      <AlertDialog open={!!fixTarget} onOpenChange={(open) => { if (!open) setFixTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar esta correção?</AlertDialogTitle>
            <AlertDialogDescription>
              {fixTarget ? `${fixLabel(fixTarget.fix_action?.type ?? '')}. ` : ''}A correção não faz chamadas pagas. Depois de aplicada, a regra é reavaliada e o resultado aparece no achado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void confirmFix(); }}>Aplicar correção</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
