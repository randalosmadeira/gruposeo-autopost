import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchContentPerformance, fetchGa4Summary, fetchProjectIntegrations, runGa4Sync, saveProjectIntegrations } from '@/lib/nexus-management-api';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type { ContentPerformance, Ga4Summary } from '@/types/nexus-analytics';
import type { Ga4SyncResult, ProjectIntegrations, ProjectIntegrationsInput } from '@/types/nexus-providers';

export const analyticsKey = (projectId: string | undefined) => ['nexus-analytics', projectId] as const;
export const contentKey = (projectId: string | undefined) => ['nexus-content', projectId] as const;
export const integrationsKey = (projectId: string | undefined) => ['nexus-integrations', projectId] as const;

const noRetryWhenBlocked = (count: number, err: unknown) => !(err instanceof NexusBlockedError) && count < 1;

/** Resumo do GA4 (leitura, qualquer membro). `enabled=false` evita chamada enquanto o motor não está conectado. */
export function useGa4Summary(projectId: string | undefined, from: string, to: string, enabled = true) {
  return useQuery<Ga4Summary>({
    queryKey: [...analyticsKey(projectId), from, to],
    enabled: !!projectId && enabled,
    retry: noRetryWhenBlocked,
    queryFn: () => fetchGa4Summary(projectId as string, from, to),
  });
}

/** Desempenho por área (GSC + GA4 junto do índice de artigos). Leitura, qualquer membro. */
export function useContentPerformance(projectId: string | undefined, from: string, to: string, enabled = true) {
  return useQuery<ContentPerformance>({
    queryKey: [...contentKey(projectId), from, to],
    enabled: !!projectId && enabled,
    retry: noRetryWhenBlocked,
    queryFn: () => fetchContentPerformance(projectId as string, from, to),
  });
}

/** IDs por projeto. Gestor recebe os valores; os demais só `*_configured`. */
export function useProjectIntegrations(projectId: string | undefined, enabled = true) {
  return useQuery<ProjectIntegrations>({
    queryKey: integrationsKey(projectId),
    enabled: !!projectId && enabled,
    retry: noRetryWhenBlocked,
    queryFn: () => fetchProjectIntegrations(projectId as string),
  });
}

/** Ações técnicas do Analytics (só gestor; o servidor responde 403 `manager_required` a quem não pode). */
export function useGa4Actions(projectId: string | undefined) {
  const qc = useQueryClient();
  const need = () => { if (!projectId) throw new Error('Selecione um projeto.'); return projectId; };
  return {
    syncGa4: useMutation<Ga4SyncResult, Error, { days?: number }>({
      mutationFn: (v) => runGa4Sync(need(), v.days),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: analyticsKey(projectId) });
        void qc.invalidateQueries({ queryKey: contentKey(projectId) });
        void qc.invalidateQueries({ queryKey: ['nexus-providers', projectId] });
      },
    }),
    saveIntegrations: useMutation<ProjectIntegrations, Error, ProjectIntegrationsInput>({
      mutationFn: (v) => saveProjectIntegrations(need(), v),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: integrationsKey(projectId) });
        void qc.invalidateQueries({ queryKey: ['nexus-providers', projectId] });
      },
    }),
  };
}
