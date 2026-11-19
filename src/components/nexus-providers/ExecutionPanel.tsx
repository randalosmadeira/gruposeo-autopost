import { useEffect, useState } from 'react';
import { Loader2, Power, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ToneBadge } from '@/components/nexus-providers/badges';
import {
  CONFIRM_WORD, MAX_BUDGET_USD, budgetUsedPercent, executionEnableBlocker, formatUsdMicros, parseBudgetUsd, providerErrorMessage, providerName,
} from '@/lib/nexus-providers';
import type { ExecutionSettingsInput, ProviderId, ProviderProgram } from '@/types/nexus-providers';

export interface ExecutionPanelProps {
  program: ProviderProgram;
  /** Provedores com credencial guardada e não manuais: só estes podem ser habilitados. */
  connected: ProviderId[];
  /** Somente dono/admin altera; os demais veem o estado em modo leitura. */
  canAdmin: boolean;
  onSave: (input: ExecutionSettingsInput) => Promise<void>;
  onDisableAll: () => Promise<void>;
}

function budgetToText(micros: number): string {
  if (!micros) return '';
  const usd = micros / 1_000_000;
  return String(usd).replace('.', ',');
}

export function ExecutionPanel({ program, connected, canAdmin, onSave, onDisableAll }: ExecutionPanelProps) {
  const [budgetText, setBudgetText] = useState(() => budgetToText(program.budget_usd_micros));
  const [providers, setProviders] = useState<string[]>(() => program.providers_enabled.filter((p) => connected.includes(p as ProviderId)));
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'save' | 'off' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mantém o formulário em sincronia com o servidor (ex.: outro admin alterou, ou "Desligar tudo").
  const enabledKey = program.providers_enabled.join(',');
  useEffect(() => {
    setBudgetText(budgetToText(program.budget_usd_micros));
    setProviders(program.providers_enabled.filter((p) => connected.includes(p as ProviderId)));
    setConfirm('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.budget_usd_micros, program.execution_enabled, enabledKey, connected.join(',')]);

  const readOnly = !canAdmin;
  const enabled = program.execution_enabled;
  const blocker = executionEnableBlocker({ budgetText, providers, confirm });
  const used = budgetUsedPercent(program);

  function toggle(id: string, checked: boolean) {
    setProviders((cur) => (checked ? Array.from(new Set([...cur, id])) : cur.filter((p) => p !== id)));
  }

  async function save() {
    const budget = parseBudgetUsd(budgetText);
    if (blocker || budget === null) return;
    setBusy('save'); setError(null); setNotice(null);
    try {
      await onSave({ executionEnabled: true, budgetUsd: budget, providersEnabled: providers, confirm: CONFIRM_WORD });
      setConfirm('');
      setNotice('Execução paga liberada com o orçamento e os provedores acima.');
    } catch (e) { setError(providerErrorMessage(e)); } finally { setBusy(null); }
  }

  async function disableAll() {
    setBusy('off'); setError(null); setNotice(null);
    try {
      await onDisableAll();
      setConfirm('');
      setNotice('Execução paga desligada. Nenhuma chamada paga será feita.');
    } catch (e) { setError(providerErrorMessage(e)); } finally { setBusy(null); }
  }

  return (
    <Card aria-labelledby="exec-title">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="exec-title" className="text-lg">Liberação de execução paga</CardTitle>
          <span aria-live="polite" aria-atomic="true" data-testid="exec-state">
            {enabled
              ? <ToneBadge tone="warning" icon={Power}>Execução paga LIGADA</ToneBadge>
              : <ToneBadge tone="success" icon={PowerOff}>Execução paga DESLIGADA (padrão)</ToneBadge>}
          </span>
        </div>
        <CardDescription>Nenhuma chamada paga acontece sem este painel ligado, sem orçamento e sem o provedor habilitado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Gasto</dt><dd className="text-lg font-semibold tabular-nums">{formatUsdMicros(program.consumed_usd_micros)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Reservado</dt><dd className="text-lg font-semibold tabular-nums">{formatUsdMicros(program.reserved_usd_micros)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Orçamento mensal</dt><dd className="text-lg font-semibold tabular-nums">{formatUsdMicros(program.budget_usd_micros)}</dd></div>
        </dl>
        {used !== null && (
          <div>
            <Progress value={used} aria-label={`Orçamento comprometido: ${used}%`} className="h-2" />
            <p className="mt-1 text-xs text-muted-foreground">{used}% do orçamento comprometido (gasto + reservado).</p>
          </div>
        )}

        {readOnly && <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Somente proprietário ou administrador da organização pode alterar esta liberação. Você está vendo o estado atual.</p>}

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="exec-budget">Orçamento mensal (US$, máximo {MAX_BUDGET_USD})</Label>
            <Input id="exec-budget" inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} disabled={readOnly || busy !== null} placeholder="Ex.: 5" />
            <p className="text-xs text-muted-foreground">Sugestão inicial: US$ 5. Valor de referência; confira os custos no site de cada provedor.</p>
          </div>

          <fieldset className="space-y-2" disabled={readOnly || busy !== null}>
            <legend className="text-sm font-medium">Provedores habilitados (somente os conectados)</legend>
            {connected.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum provedor conectado ainda. Conecte ao menos um para poder habilitá-lo.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {connected.map((id) => (
                  <label key={id} htmlFor={`exec-p-${id}`} className="flex items-center gap-2 text-sm">
                    <Checkbox id={`exec-p-${id}`} checked={providers.includes(id)} onCheckedChange={(c) => toggle(id, c === true)} />
                    {providerName(id)}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="space-y-1.5 sm:max-w-xs">
            <Label htmlFor="exec-confirm">Para liberar, digite {CONFIRM_WORD}</Label>
            <Input id="exec-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={readOnly || busy !== null} autoComplete="off" aria-describedby="exec-hint" />
            <p id="exec-hint" className="text-xs text-muted-foreground">{blocker ?? 'Tudo pronto para liberar.'}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={readOnly || busy !== null || blocker !== null}>
              {busy === 'save' && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {enabled ? 'Salvar e manter ligada' : 'Liberar execução paga'}
            </Button>
            <Button type="button" variant="destructive" disabled={readOnly || busy !== null} onClick={() => { void disableAll(); }}>
              {busy === 'off' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <PowerOff className="mr-1 h-4 w-4" aria-hidden="true" />}
              Desligar tudo
            </Button>
          </div>
        </form>

        <div aria-live="polite">
          {notice && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-200">{notice}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
