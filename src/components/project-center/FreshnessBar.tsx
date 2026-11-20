import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ageText } from '@/lib/live-pulse';
import type { HealthOverview } from '@/lib/project-center-api';

interface Props {
  /** Quando a lista foi lida do servidor (ms; `dataUpdatedAt` do react-query, 0 = nunca). */
  overviewAt: number;
  /** Quando o pulso (novidades) foi checado pela última vez (ms; 0 = nunca). */
  pulseAt: number;
  pulseFailed: boolean;
  busy: boolean;
  live?: HealthOverview['live'];
  onCheckNow: () => void;
}

/** Faixa honesta de atualização: há quanto tempo a lista e as novidades foram lidas, o que foi conferido ao vivo nos sites e o botão "Conferir agora". */
export function FreshnessBar({ overviewAt, pulseAt, pulseFailed, busy, live, onCheckNow }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const age = (at: number) => (at > 0 ? now - at : null);
  return (
    <div role="status" aria-live="off" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
      <span>Lista atualizada <strong className="text-foreground">{ageText(age(overviewAt))}</strong></span>
      <span>
        {pulseFailed ? 'Sem contato com o servidor para ver novidades.' : <>Novidades checadas <strong className="text-foreground">{ageText(age(pulseAt))}</strong> (a cada poucos segundos, só com esta aba aberta).</>}
      </span>
      {live?.enabled && live.projects > 0 && (
        <span>
          Plugins conferidos ao vivo: {live.ao_vivo} de {live.projects}.
          {live.guardado > 0 && <> {live.guardado === 1 ? '1 site não respondeu' : `${live.guardado} sites não responderam`}: valor guardado, não conferido agora.</>}
        </span>
      )}
      <Button size="sm" variant="outline" className="ml-auto h-8" disabled={busy} onClick={onCheckNow}>
        <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden />Conferir agora
      </Button>
    </div>
  );
}
