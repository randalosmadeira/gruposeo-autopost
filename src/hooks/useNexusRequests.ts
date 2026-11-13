import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { POLL_INTERVAL_MS } from '@/hooks/useNexusProviders';
import { createClientRequest, listClientRequests, updateClientRequest } from '@/lib/nexus-management-api';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type { ClientRequest, RequestCreateInput, RequestStatus, RequestUpdateInput } from '@/types/nexus-requests';

export const requestsKey = (projectId: string | undefined) => ['nexus-requests', projectId] as const;

/** Lista de solicitações (membro: da própria organização; gestor: de todas as que gerencia). Polling de 60 s como reserva do realtime. */
export function useNexusRequests(projectId: string | undefined, status?: RequestStatus) {
  return useQuery<ClientRequest[]>({
    queryKey: [...requestsKey(projectId), status ?? 'all'],
    enabled: !!projectId,
    retry: (count, err) => !(err instanceof NexusBlockedError) && count < 1,
    refetchInterval: POLL_INTERVAL_MS,
    queryFn: () => listClientRequests(projectId as string, status),
  });
}

export function useNexusRequestActions(projectId: string | undefined) {
  const qc = useQueryClient();
  const need = () => { if (!projectId) throw new Error('Selecione um projeto.'); return projectId; };
  const refresh = () => qc.invalidateQueries({ queryKey: requestsKey(projectId) });
  return {
    createRequest: useMutation<ClientRequest | null, Error, RequestCreateInput>({
      mutationFn: (v) => createClientRequest(need(), v),
      onSuccess: refresh,
    }),
    updateRequest: useMutation<ClientRequest | null, Error, RequestUpdateInput>({
      mutationFn: (v) => updateClientRequest(need(), v),
      onSuccess: refresh,
    }),
  };
}

/**
 * Realtime da tabela `nexus_client_requests`, filtrada pela organização do projeto ativo.
 * Canal próprio (não mexe no canal de saúde/auditoria). Se cair, vale o polling de 60 s.
 */
export function useNexusRequestsRealtime(projectId: string | undefined, organizationId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId || !organizationId) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`nexus-requests:${organizationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nexus_client_requests', filter: `organization_id=eq.${organizationId}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void qc.invalidateQueries({ queryKey: requestsKey(projectId) }); }, 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [projectId, organizationId, qc]);
}
