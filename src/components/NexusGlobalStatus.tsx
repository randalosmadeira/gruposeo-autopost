import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SpendHistoryDialog } from '@/components/spend/SpendHistoryDialog';
import { useSpendStatus, useUnlockExtra } from '@/hooks/useSpendStatus';
import { fmtBrl, fmtUsd, fmtUsdBare, spendErrorMessage, type SpendState, type SpendStatus } from '@/lib/spend-api';

/** Faixa antiga: continua valendo enquanto o servidor não disser que o teto diário está ativo (constante PAID_SERVICES_BLOCKED = true). */
function BlockedBanner() {
  return <aside className="border-b border-primary/20 bg-background/90 px-4 py-2 text-sm"><strong>Serviços pagos bloqueados globalmente.</strong> Geração e revisão por IA pendentes. <Link className="font-medium text-primary underline" to="/business-profile">Configurar negócio e estratégia</Link></aside>;
}

const TONE: Record<SpendState, { box: string; bar: string; label: string }> = {
  livre: { box: 'border-emerald-500/40 bg-emerald-500/10', bar: 'bg-emerald-500', label: 'Dentro do teto.' },
  aviso: { box: 'border-amber-500/50 bg-amber-500/10', bar: 'bg-amber-500', label: 'Atenção: o gasto de hoje passou do aviso.' },
  teto_atingido: { box: 'border-red-500/50 bg-red-500/10', bar: 'bg-red-500', label: 'Teto atingido: nenhuma operação nova começa até a meia-noite. O que já começou termina.' },
  adicional_liberado: { box: 'border-orange-500/50 bg-orange-500/10', bar: 'bg-orange-500', label: 'Crédito adicional liberado só por hoje.' },
  esgotado: { box: 'border-red-600/60 bg-red-600/15', bar: 'bg-red-600', label: 'Limite absoluto do dia atingido: nada novo é executado até a meia-noite.' },
};

function SpendBanner({ s }: { s: SpendStatus }) {
  const [confirming, setConfirming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const unlock = useUnlockExtra(s.organization_id);
  const tone = TONE[s.state] || TONE.livre;
  const pct = s.absolute_usd_micros > 0 ? Math.min(100, (s.used_usd_micros / s.absolute_usd_micros) * 100) : 0;
  const capPct = s.absolute_usd_micros > 0 ? (s.cap_usd_micros / s.absolute_usd_micros) * 100 : 100;
  const canOffer = s.can_unlock && !s.extra_unlocked && (s.state === 'aviso' || s.state === 'teto_atingido');
  return (
    <aside role="region" aria-label="Teto diário de gasto com IA" className={`border-b px-4 py-2 text-sm ${tone.box}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 break-words">
          <strong>Hoje: {fmtUsd(s.used_usd_micros)} de {fmtUsdBare(s.cap_usd_micros)}</strong>{' '}
          <span className="text-muted-foreground">(+{fmtUsdBare(s.extra_usd_micros)} adicional)</span>
          {s.brl && <span className="text-muted-foreground"> · ≈ {fmtBrl(s.brl.spent)} (câmbio informado: {s.brl.fx_brl_per_usd.toFixed(2).replace('.', ',')})</span>}
        </p>
        <div
          role="progressbar" aria-label="Gasto de hoje" aria-valuemin={0} aria-valuemax={Math.round(s.absolute_usd_micros / 10_000) / 100} aria-valuenow={Math.round(s.used_usd_micros / 10_000) / 100}
          className="relative h-2 w-full min-w-0 overflow-hidden rounded bg-muted sm:w-56"
        >
          <div className={`h-full ${tone.bar}`} style={{ width: `${pct}%` }} />
          <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${capPct}%` }} aria-hidden="true" />
        </div>
        <p className="min-w-0 break-words text-xs text-muted-foreground">{tone.label}{!s.enabled && ' As operações pagas estão pausadas pelo dono.'}</p>
        <div className="flex flex-wrap items-center gap-2">
          {canOffer && !confirming && <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>Usar crédito adicional (até {fmtUsd(s.extra_usd_micros)})</Button>}
          {confirming && (
            <span role="group" aria-label="Confirmar crédito adicional" className="flex flex-wrap items-center gap-2">
              <span>Liberar até {fmtUsd(s.extra_usd_micros)} a mais, só por hoje?</span>
              <Button size="sm" disabled={unlock.isPending} onClick={() => unlock.mutate(undefined, { onSettled: () => setConfirming(false) })}>Confirmar</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
            </span>
          )}
          <Button size="sm" variant="link" className="h-auto p-0" onClick={() => setHistoryOpen(true)}>Gasto com IA</Button>
          <Link className="font-medium text-primary underline" to="/business-profile">Configurar negócio e estratégia</Link>
        </div>
      </div>
      {unlock.isError && <p role="alert" className="mt-1 text-xs">{spendErrorMessage(unlock.error)}</p>}
      {s.unverified_prices > 0 && <p className="mt-1 text-xs text-muted-foreground">Parte dos preços usados para estimar imagem e busca ainda não foi conferida; o gasto estimado aparece marcado no histórico.</p>}
      <SpendHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} organizationId={s.organization_id} />
    </aside>
  );
}

export function NexusGlobalStatus() {
  const { data } = useSpendStatus();
  // o indicador novo só aparece quando o SERVIDOR informa que o teto está ativo; em qualquer outro caso vale a faixa de bloqueio de sempre
  if (data && data.cap_active === true && data.paid_blocked === false) return <SpendBanner s={data} />;
  return <BlockedBanner />;
}
