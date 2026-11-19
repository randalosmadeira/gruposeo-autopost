import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeEdge, POLL_INTERVAL_MS } from '@/hooks/useNexusProviders';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type { AuditApplyFixResult, AuditFinding, AuditOverview, AuditRun } from '@/types/nexus-providers';

export const auditKey = (projectId: string | undefined) => ['nexus-audit', projectId] as const;

/** Auditoria contínua ("Saúde do sistema"): leitura + ações. Polling de 60 s como reserva do realtime. */
export function useNexusAudit(projectId: string | undefined) {
  const qc = useQueryClient();
  const need = () => { if (!projectId) throw new Error('Selecione um projeto.'); return projectId; };
  const refresh = () => qc.invalidateQueries({ queryKey: auditKey(projectId) });

  const overview = useQuery<AuditOverview>({
    queryKey: auditKey(projectId),
    enabled: !!projectId,
    retry: (count, err) => !(err instanceof NexusBlockedError) && count < 1,
    refetchInterval: POLL_INTERVAL_MS,
    queryFn: () => invokeEdge<AuditOverview>('nexus-audit', projectId as string, { action: 'overview' }),
  });

  return {
    overview,
    runNow: useMutation({
      mutationFn: () => invokeEdge<{ run: AuditRun }>('nexus-audit', need(), { action: 'run' }),
      onSuccess: refresh,
    }),
    updateFinding: useMutation({
      mutationFn: (v: { id: string; status: 'acknowledged' | 'snoozed' | 'open'; snoozeHours?: number; note?: string }) =>
        invokeEdge<{ finding: AuditFinding }>('nexus-audit', need(), { action: 'update_finding', ...v }),
      onSuccess: refresh,
    }),
    applyFix: useMutation({
      mutationFn: (id: string) => invokeEdge<AuditApplyFixResult>('nexus-audit', need(), { action: 'apply_fix', id }),
      onSuccess: () => {
        void refresh();
        void qc.invalidateQueries({ queryKey: ['nexus-providers', projectId] });
        void qc.invalidateQueries({ queryKey: ['nexus-search', projectId] });
      },
    }),
  };
}
