import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callSpend, type SpendHistory, type SpendStatus } from '@/lib/spend-api';
import { useOrganizationConsole } from '@/hooks/useOrganizationConsole';

export const SPEND_STATUS_KEY = 'spend-status';

/**
 * Situação do Teto Diário de Gasto. Em erro (função ainda não publicada, sem rede, sem leitura) `data` fica indefinido e a tela mostra a
 * faixa antiga de bloqueio: o painel nunca afirma que o teto está ativo sem o servidor dizer.
 */
export function useSpendStatus() {
  const { data: consoleData, isLoading: consoleLoading } = useOrganizationConsole();
  const organizationId = consoleData?.membership?.organization_id ?? null;
  return useQuery({
    queryKey: [SPEND_STATUS_KEY, organizationId],
    enabled: !consoleLoading,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: () => callSpend<SpendStatus>('status', organizationId ? { organizationId } : {}),
  });
}

export function useUnlockExtra(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callSpend<SpendStatus>('unlock_extra', organizationId ? { organizationId } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SPEND_STATUS_KEY] }),
  });
}

export function useSpendHistory(organizationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['spend-history', organizationId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: () => callSpend<SpendHistory>('history', { ...(organizationId ? { organizationId } : {}), days: 30 }),
  });
}
