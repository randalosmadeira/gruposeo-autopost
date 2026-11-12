import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { rangeForDays } from '@/lib/nexus-observatory';
import {
  NexusBlockedError,
  type NexusManualObservation,
  type NexusObservatorySummary,
  type NexusPrepareRunResult,
  type NexusPrompt,
  type NexusPromptInput,
  type NexusPromptSet,
  type NexusPromptSetInput,
  type NexusSignalsStatus,
  type NexusSiteSignalsKey,
} from '@/types/nexus-observatory';

/** Chama a edge function `nexus-intelligence`. 402/423 viram NexusBlockedError (estado "bloqueado"), nunca erro genérico. */
export async function invokeNexus<T>(projectId: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nexus-intelligence', { body: { projectId, ...body } });
  if (error) {
    let status = 0;
    let code = '';
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) {
      status = ctx.status;
      const parsed = await ctx.clone().json().catch(() => null) as { error?: string } | null;
      code = parsed?.error ?? '';
    }
    if (status === 402 || status === 423) {
      throw new NexusBlockedError(
        status,
        'Execução pausada: orçamento zero ou serviços pagos bloqueados. Nenhum serviço pago foi acionado.',
        code === 'budget_paused' ? 'budget_paused' : code === 'paid_services_blocked' ? 'paid_services_blocked' : 'unknown',
      );
    }
    throw new Error(code || error.message || 'Falha ao consultar o NEXUS');
  }
  return data as T;
}

export const observatoryKey = (projectId: string | undefined, from: string, to: string) =>
  ['nexus-observatory', projectId, from, to] as const;

const noRetryWhenBlocked = (count: number, err: unknown) => !(err instanceof NexusBlockedError) && count < 1;

export function useObservatorySummary(projectId: string | undefined, from: string, to: string) {
  return useQuery<NexusObservatorySummary>({
    queryKey: observatoryKey(projectId, from, to),
    enabled: !!projectId,
    retry: noRetryWhenBlocked,
    queryFn: () => invokeNexus<NexusObservatorySummary>(projectId as string, { action: 'observatory', from, to }),
  });
}

export function usePromptSets(projectId: string | undefined) {
  return useQuery<NexusPromptSet[]>({
    queryKey: ['nexus-observatory', projectId, 'prompt-sets'],
    enabled: !!projectId,
    retry: noRetryWhenBlocked,
    queryFn: async () => (await invokeNexus<{ sets: NexusPromptSet[] }>(projectId as string, { action: 'prompt_sets' })).sets ?? [],
  });
}

export function useSignalsStatus(projectId: string | undefined) {
  return useQuery<NexusSignalsStatus>({
    queryKey: ['nexus-observatory', projectId, 'signals-status'],
    enabled: !!projectId,
    retry: noRetryWhenBlocked,
    queryFn: () => invokeNexus<NexusSignalsStatus>(projectId as string, { action: 'signals_status' }),
  });
}

export function useNexusObservatoryActions(projectId: string | undefined) {
  const qc = useQueryClient();
  const run = <T,>(body: Record<string, unknown>) => {
    if (!projectId) throw new Error('Selecione um projeto.');
    return invokeNexus<T>(projectId, body);
  };
  const refreshSets = () => qc.invalidateQueries({ queryKey: ['nexus-observatory', projectId, 'prompt-sets'] });
  const refreshAll = () => qc.invalidateQueries({ queryKey: ['nexus-observatory', projectId] });

  return {
    upsertSet: useMutation({
      mutationFn: (set: NexusPromptSetInput) => run<{ set: NexusPromptSet }>({ action: 'prompt_set_upsert', set }),
      onSuccess: refreshSets,
    }),
    upsertPrompt: useMutation({
      mutationFn: (prompt: NexusPromptInput) => run<{ prompt: NexusPrompt }>({ action: 'prompt_upsert', prompt }),
      onSuccess: refreshSets,
    }),
    deletePrompt: useMutation({
      mutationFn: (promptId: string) => run<{ success: true }>({ action: 'prompt_delete', promptId }),
      onSuccess: refreshSets,
    }),
    importObservation: useMutation({
      mutationFn: (observation: NexusManualObservation) => run<{ operation: { id: string } }>({ action: 'import_observation', observation }),
      onSuccess: refreshAll,
    }),
    preparePromptRun: useMutation({
      mutationFn: (v: { promptSetId: string; engines?: string[] }) => run<NexusPrepareRunResult>({ action: 'prepare_prompt_run', ...v }),
      onSuccess: refreshAll,
    }),
    createSignalsKey: useMutation({
      mutationFn: (allowedOrigins?: string[]) => run<NexusSiteSignalsKey>({ action: 'signals_key_create', ...(allowedOrigins ? { allowedOrigins } : {}) }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['nexus-observatory', projectId, 'signals-status'] }),
    }),
    rotateSignalsKey: useMutation({
      mutationFn: () => run<NexusSiteSignalsKey>({ action: 'signals_key_rotate' }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['nexus-observatory', projectId, 'signals-status'] }),
    }),
  };
}

/** Pacote completo para a página: resumo, conjuntos de prompts, status de sinais e ações. */
export function useNexusObservatory(projectId: string | undefined, range?: { from: string; to: string }) {
  const fallback = useMemo(() => rangeForDays(30), []);
  const { from, to } = range ?? fallback;
  return {
    summary: useObservatorySummary(projectId, from, to),
    promptSets: usePromptSets(projectId),
    signalsStatus: useSignalsStatus(projectId),
    actions: useNexusObservatoryActions(projectId),
  };
}
