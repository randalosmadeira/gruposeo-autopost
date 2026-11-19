import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchCompetitors, fetchKeywords, fetchMethodology, fetchOpportunities, fetchOverview, fetchQuestionHistory, fetchQuestions, fetchSources,
  removeCompetitor, requestFromManager, upsertCompetitor, type ScopeFilter,
} from '@/lib/nexus-visibility-api';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type { RequestKind } from '@/types/nexus-requests';
import type {
  CompetitorInput, CompetitorsData, KeywordRow, Methodology, OpportunityItem, QuestionHistory, QuestionsData, SourceType, SourcesData, VisibilityOverview,
} from '@/types/nexus-visibility';

/** Reserva do tempo real: a página recarrega sozinha a cada 2 minutos. */
export const VISIBILITY_POLL_MS = 120_000;
const REALTIME_DEBOUNCE_MS = 800;

export const visibilityKey = (projectId: string | undefined) => ['nexus-visibility', projectId] as const;
const retryOnce = (count: number, err: unknown) => !(err instanceof NexusBlockedError) && !(err instanceof Error && /^(manager_required|forbidden|40[0134])$/.test(err.message)) && count < 1;

interface Common { enabled?: boolean }

export function useVisibilityOverview(projectId: string | undefined, f: ScopeFilter, o: Common = {}) {
  return useQuery<VisibilityOverview>({
    queryKey: [...visibilityKey(projectId), 'overview', f.from, f.to, f.engine ?? '', f.topic ?? ''],
    enabled: !!projectId && o.enabled !== false, retry: retryOnce, refetchInterval: VISIBILITY_POLL_MS, placeholderData: keepPreviousData,
    queryFn: () => fetchOverview(projectId as string, f),
  });
}

export function useVisibilitySources(projectId: string | undefined, f: { from: string; to: string; type?: SourceType }, o: Common = {}) {
  return useQuery<SourcesData>({
    queryKey: [...visibilityKey(projectId), 'sources', f.from, f.to, f.type ?? ''],
    enabled: !!projectId && o.enabled !== false, retry: retryOnce, refetchInterval: VISIBILITY_POLL_MS, placeholderData: keepPreviousData,
    queryFn: () => fetchSources(projectId as string, f),
  });
}

export function useVisibilityCompetitors(projectId: string | undefined, f: { from: string; to: string }, o: Common = {}) {
  return useQuery<CompetitorsData>({
    queryKey: [...visibilityKey(projectId), 'competitors', f.from, f.to],
    enabled: !!projectId && o.enabled !== false, retry: retryOnce, refetchInterval: VISIBILITY_POLL_MS, placeholderData: keepPreviousData,
    queryFn: () => fetchCompetitors(projectId as string, f),
  });
}

export function useVisibilityQuestions(projectId: string | undefined, f: { from: string; to: string; topic?: string; intent?: string; limit: number; offset: number }, o: Common = {}) {
  return useQuery<QuestionsData>({
    queryKey: [...visibilityKey(projectId), 'questions', f.from, f.to, f.topic ?? '', f.intent ?? '', f.limit, f.offset],
    enabled: !!projectId && o.enabled !== false, retry: retryOnce, refetchInterval: VISIBILITY_POLL_MS, placeholderData: keepPreviousData,
    queryFn: () => fetchQuestions(projectId as string, f),
  });
}

export function useVisibilityHistory(projectId: string | undefined, query: string | null, engine?: string) {
  return useQuery<QuestionHistory>({
    queryKey: [...visibilityKey(projectId), 'history', query ?? '', engine ?? ''],
    enabled: !!projectId && !!query, retry: retryOnce,
    queryFn: () => fetchQuestionHistory(projectId as string, query as string, engine),
  });
}

export function useVisibilityKeywords(projectId: string | undefined, f: { from: string; to: string }, o: Common = {}) {
  return useQuery<KeywordRow[]>({
    queryKey: [...visibilityKey(projectId), 'keywords', f.from, f.to],
    enabled: !!projectId && o.enabled !== false, retry: retryOnce,
    queryFn: () => fetchKeywords(projectId as string, f),
  });
}

export function useVisibilityOpportunities(projectId: string | undefined, f: { from: string; to: string }, o: Common = {}) {
  return useQuery<OpportunityItem[]>({
    queryKey: [...visibilityKey(projectId), 'opportunities', f.from, f.to],
    enabled: !!projectId && o.enabled !== false, retry: retryOnce, refetchInterval: VISIBILITY_POLL_MS, placeholderData: keepPreviousData,
    queryFn: () => fetchOpportunities(projectId as string, f),
  });
}

export function useVisibilityMethodology(projectId: string | undefined, o: Common = {}) {
  return useQuery<Methodology>({
    queryKey: [...visibilityKey(projectId), 'methodology'],
    enabled: !!projectId && o.enabled !== false, retry: retryOnce, staleTime: 10 * 60_000,
    queryFn: () => fetchMethodology(projectId as string),
  });
}

/** Escrita de concorrentes (só o gestor; o servidor responde 403 `manager_required` a quem não pode). */
export function useCompetitorActions(projectId: string | undefined) {
  const qc = useQueryClient();
  const need = () => { if (!projectId) throw new Error('Selecione um projeto.'); return projectId; };
  const refresh = () => qc.invalidateQueries({ queryKey: [...visibilityKey(projectId), 'competitors'] });
  return {
    save: useMutation({ mutationFn: (input: CompetitorInput) => upsertCompetitor(need(), input), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => removeCompetitor(need(), id), onSuccess: refresh }),
  };
}

/** "Solicitar" do cliente. */
export function useVisibilityRequest(projectId: string | undefined) {
  return useMutation({ mutationFn: (v: { kind: RequestKind; message: string }) => requestFromManager(projectId as string, v.kind, v.message) });
}

/**
 * Tempo real: quando entram observações novas (tabelas já usadas pelo Observatório), recarrega a página com debounce.
 * Se o canal cair, vale o polling de 2 minutos. Filtrado pela organização; nada técnico trafega.
 */
export function useVisibilityRealtime(projectId: string | undefined, organizationId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId || !organizationId) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void qc.invalidateQueries({ queryKey: visibilityKey(projectId) }); }, REALTIME_DEBOUNCE_MS);
    };
    const filter = `organization_id=eq.${organizationId}`;
    const channel = supabase
      .channel(`nexus-visibilidade:${organizationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nexus_citations', filter }, bump)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nexus_competitor_mentions', filter }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nexus_competitors', filter }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [projectId, organizationId, qc]);
}

/**
 * Opções de filtro acumuladas: um filtro por motor ou tema devolve só o que sobrou, e o seletor não pode perder as demais opções.
 * Guarda o conjunto já visto por projeto (estado local, sem servidor).
 */
export function useSeenOptions(projectId: string | undefined, incoming: readonly string[]): string[] {
  const [seen, setSeen] = useState<{ project: string | undefined; items: string[] }>({ project: projectId, items: [] });
  const key = JSON.stringify(incoming);
  const list = useMemo(() => JSON.parse(key) as string[], [key]);
  useEffect(() => {
    setSeen((prev) => {
      const base = prev.project === projectId ? prev.items : [];
      const merged = Array.from(new Set([...base, ...list.filter(Boolean)])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      return prev.project === projectId && merged.length === base.length ? prev : { project: projectId, items: merged };
    });
  }, [list, projectId]);
  return seen.project === projectId ? seen.items : [];
}
