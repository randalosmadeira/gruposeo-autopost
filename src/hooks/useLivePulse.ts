import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PULSE_INTERVAL_MS, callPulse, changedAreas, queriesToRefresh, type PulseResponse, type PulseStamps } from '@/lib/live-pulse';
import { useOrganizationConsole } from '@/hooks/useOrganizationConsole';

export const LIVE_PULSE_KEY = 'live-pulse';

/**
 * Pulso da organização: consulta leve a cada 8 s (o react-query pausa o intervalo com a aba escondida; ao voltar, consulta na hora).
 * Várias telas usando o mesmo hook compartilham UMA consulta. `organizationId` ausente = organização do próprio usuário.
 */
export function useLivePulse(organizationId?: string | null) {
  const { data: consoleData } = useOrganizationConsole();
  const orgId = organizationId || consoleData?.membership?.organization_id || null;
  return useQuery<PulseResponse>({
    queryKey: [LIVE_PULSE_KEY, orgId],
    enabled: !!orgId,
    queryFn: () => callPulse(orgId as string),
    refetchInterval: PULSE_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
}

/**
 * Ponte sem tela: quando o carimbo de uma área muda, recarrega só as consultas dessa área. Montar UMA vez (no Layout).
 * `organizationId` só é necessário para quem acompanha OUTRA organização que a do usuário (Central com seletor de organização).
 */
export function useLivePulseBridge(organizationId?: string | null) {
  const q = useLivePulse(organizationId);
  const cache = useQueryClient();
  const last = useRef<PulseStamps | null>(null);
  const org = useRef<string | null>(null);
  useEffect(() => {
    const data = q.data;
    if (!data) return;
    if (org.current !== data.organization_id) { org.current = data.organization_id; last.current = null; }
    const areas = changedAreas(last.current, data.stamps);
    last.current = data.stamps;
    for (const key of queriesToRefresh(areas)) void cache.invalidateQueries({ queryKey: key });
  }, [q.data, cache]);
  return q;
}
