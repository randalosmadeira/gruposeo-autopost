import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type {
  ExecutionSettingsInput, ExecutionSettingsResponse, HealthCheckResponse, ProviderId, ProvidersOverview,
  SearchPerformanceSummary, SearchSyncResponse, StoreCredentialResult,
} from '@/types/nexus-providers';

export const POLL_INTERVAL_MS = 60_000;
const REALTIME_DEBOUNCE_MS = 400;

/**
 * Chama uma edge function do módulo (`nexus-intelligence` ou `nexus-audit`). 402/423 viram NexusBlockedError;
 * os demais erros viram `Error(<código do servidor>)` para a camada de tela traduzir. Nunca registra o corpo da requisição
 * (ele pode carregar a credencial em `store_credential`).
 */
export async function invokeEdge<T>(fn: 'nexus-intelligence' | 'nexus-audit' | 'nexus-visibility', projectId: string, body: Record<string, unknown>): Promise<T> {
  const payload = { projectId, ...body };
  let { data, error } = await supabase.functions.invoke(fn, { body: payload });
  if (fn === 'nexus-visibility' && error?.context instanceof Response && error.context.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    const token = refreshed.data.session?.access_token;
    if (!refreshed.error && token) {
      ({ data, error } = await supabase.functions.invoke(fn, {
        body: payload,
        headers: { Authorization: `Bearer ${token}` },
      }));
    }
  }
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
    throw new Error(code || (status ? `${status}` : '') || error.message || 'Falha ao consultar o NEXUS');
  }
  return data as T;
}

const noRetryWhenBlocked = (count: number, err: unknown) => !(err instanceof NexusBlockedError) && count < 1;

export const providersKey = (projectId: string | undefined) => ['nexus-providers', projectId] as const;
export const searchKey = (projectId: string | undefined) => ['nexus-search', projectId] as const;

export function useNexusProviders(projectId: string | undefined) {
  return useQuery<ProvidersOverview>({
    queryKey: providersKey(projectId),
    enabled: !!projectId,
    retry: noRetryWhenBlocked,
    refetchInterval: POLL_INTERVAL_MS, // reserva do realtime
    queryFn: () => invokeEdge<ProvidersOverview>('nexus-intelligence', projectId as string, { action: 'providers_overview' }),
  });
}

export function useSearchPerformance(projectId: string | undefined, from: string, to: string, enabled = true) {
  return useQuery<SearchPerformanceSummary>({
    queryKey: [...searchKey(projectId), from, to],
    enabled: !!projectId && enabled,
    retry: noRetryWhenBlocked,
    queryFn: () => invokeEdge<SearchPerformanceSummary>('nexus-intelligence', projectId as string, { action: 'search_performance', from, to }),
  });
}

export function useNexusProviderActions(projectId: string | undefined) {
  const qc = useQueryClient();
  const need = () => { if (!projectId) throw new Error('Selecione um projeto.'); return projectId; };
  const refreshProviders = () => qc.invalidateQueries({ queryKey: providersKey(projectId) });
  const refreshSearch = () => qc.invalidateQueries({ queryKey: searchKey(projectId) });

  /**
   * Guarda a credencial. De propósito NÃO usa useMutation: o cache de mutações do React Query retém as variáveis
   * (e o segredo ficaria em memória/devtools). Aqui o segredo só existe durante a chamada.
   */
  const storeCredential = useCallback(async (provider: ProviderId, secret: string): Promise<StoreCredentialResult> => {
    if (!projectId) throw new Error('Selecione um projeto.');
    const result = await invokeEdge<StoreCredentialResult>('nexus-intelligence', projectId, { action: 'store_credential', provider, secret });
    await qc.invalidateQueries({ queryKey: providersKey(projectId) });
    return result;
  }, [projectId, qc]);

  return {
    storeCredential,
    testProvider: useMutation({
      mutationFn: (v: { provider?: ProviderId; confirmCost?: boolean }) => invokeEdge<HealthCheckResponse>('nexus-intelligence', need(), {
        action: 'provider_health_check', ...(v.provider ? { provider: v.provider } : {}), ...(v.confirmCost ? { confirmCost: true } : {}),
      }),
      onSuccess: refreshProviders,
    }),
    removeCredential: useMutation({
      mutationFn: (provider: ProviderId) => invokeEdge<{ success: true }>('nexus-intelligence', need(), { action: 'provider_credential_remove', provider }),
      onSuccess: refreshProviders,
    }),
    saveExecution: useMutation({
      mutationFn: (v: ExecutionSettingsInput) => invokeEdge<ExecutionSettingsResponse>('nexus-intelligence', need(), { action: 'execution_settings_set', ...v }),
      onSuccess: refreshProviders,
    }),
    syncSearch: useMutation({
      mutationFn: (v: { days?: number; source?: 'gsc' | 'bing' | 'all' }) => invokeEdge<SearchSyncResponse>('nexus-intelligence', need(), { action: 'search_performance_sync', ...v }),
      onSuccess: () => { void refreshSearch(); void refreshProviders(); },
    }),
  };
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export type NexusRealtimeTable = 'nexus_provider_health' | 'nexus_audit_findings' | 'nexus_audit_runs';

/**
 * Assina as três tabelas do módulo, filtradas pela organização. Devolve a função que cancela a assinatura.
 * `onStatus(true)` = canal conectado ("ao vivo"); `false` = desconectado (a tela cai no polling de 60 s).
 */
export function subscribeNexusRealtime(
  organizationId: string,
  onEvent: (table: NexusRealtimeTable) => void,
  onStatus: (live: boolean) => void,
): () => void {
  const filter = `organization_id=eq.${organizationId}`;
  const channel = supabase
    .channel(`nexus-motores:${organizationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nexus_provider_health', filter }, () => onEvent('nexus_provider_health'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nexus_audit_findings', filter }, () => onEvent('nexus_audit_findings'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nexus_audit_runs', filter }, () => onEvent('nexus_audit_runs'))
    .subscribe((status: string) => onStatus(status === 'SUBSCRIBED'));
  return () => { void supabase.removeChannel(channel); };
}

export type RealtimeState = 'connecting' | 'live' | 'polling';

/** Mantém o canal realtime e invalida as consultas (com debounce) quando chega um evento. */
export function useNexusRealtime(projectId: string | undefined, organizationId: string | undefined): RealtimeState {
  const qc = useQueryClient();
  const [state, setState] = useState<RealtimeState>('connecting');
  const timers = useRef<Partial<Record<'providers' | 'audit', ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    if (!projectId || !organizationId) { setState('connecting'); return undefined; }
    setState('connecting');
    const schedule = (bucket: 'providers' | 'audit', key: readonly unknown[]) => {
      const current = timers.current[bucket];
      if (current) clearTimeout(current);
      timers.current[bucket] = setTimeout(() => { void qc.invalidateQueries({ queryKey: key }); }, REALTIME_DEBOUNCE_MS);
    };
    const unsubscribe = subscribeNexusRealtime(
      organizationId,
      (table) => {
        if (table === 'nexus_provider_health') schedule('providers', providersKey(projectId));
        else schedule('audit', ['nexus-audit', projectId]);
      },
      (live) => setState(live ? 'live' : 'polling'),
    );
    const pending = timers.current;
    return () => {
      unsubscribe();
      (Object.keys(pending) as Array<'providers' | 'audit'>).forEach((k) => { const t = pending[k]; if (t) clearTimeout(t); delete pending[k]; });
    };
  }, [projectId, organizationId, qc]);

  return state;
}

/** Relógio para "há Ns": atualiza a cada `everyMs`. */
export function useNow(everyMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
