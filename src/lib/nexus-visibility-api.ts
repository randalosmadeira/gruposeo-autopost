// Camada única de acesso à função `nexus-visibility` (contrato V1, PARTE 1). Todos os nomes de ação, campos e envelopes
// vivem AQUI: se o backend mudar algo, é este o único arquivo a ajustar. Chamadas via `invokeEdge` (nunca registra o corpo;
// 403 `manager_required` chega como Error('manager_required')). Nada técnico (chaves, custo, execução paga) passa por aqui.
import { invokeEdge } from '@/hooks/useNexusProviders';
import { createClientRequest } from '@/lib/nexus-management-api';
import {
  normalizeCompetitors, normalizeHistory, normalizeKeywords, normalizeMethodology, normalizeOpportunities, normalizeOverview, normalizeQuestions,
  normalizeSavedCompetitor, normalizeSources,
} from '@/lib/nexus-visibility';
import type {
  CompetitorInput, CompetitorsData, KeywordRow, Methodology, OpportunityItem, QuestionHistory, QuestionsData, SavedCompetitor, SourceType, SourcesData,
  VisibilityOverview,
} from '@/types/nexus-visibility';
import type { ClientRequest, RequestKind } from '@/types/nexus-requests';

const FN = 'nexus-visibility' as const;
const call = <T>(projectId: string, body: Record<string, unknown>) => invokeEdge<T>(FN, projectId, body);

export interface PeriodFilter { from: string; to: string }
export interface ScopeFilter extends PeriodFilter { engine?: string; topic?: string }

const opt = (key: string, v: string | undefined) => (v ? { [key]: v } : {});

export async function fetchOverview(projectId: string, f: ScopeFilter): Promise<VisibilityOverview> {
  return normalizeOverview(await call<unknown>(projectId, { action: 'overview', from: f.from, to: f.to, ...opt('engine', f.engine), ...opt('topic', f.topic) }));
}

export async function fetchSources(projectId: string, f: PeriodFilter & { type?: SourceType; limit?: number }): Promise<SourcesData> {
  return normalizeSources(await call<unknown>(projectId, { action: 'sources', from: f.from, to: f.to, ...opt('type', f.type), limit: Math.min(200, f.limit ?? 100) }));
}

export async function fetchCompetitors(projectId: string, f: PeriodFilter): Promise<CompetitorsData> {
  return normalizeCompetitors(await call<unknown>(projectId, { action: 'competitors', from: f.from, to: f.to }));
}

/** Só o gestor (`can_manage_technical`); o cliente recebe 403 `manager_required`. */
export async function upsertCompetitor(projectId: string, input: CompetitorInput): Promise<SavedCompetitor | null> {
  const r = await call<unknown>(projectId, {
    action: 'competitor_upsert', ...(input.id ? { id: input.id } : {}), name: input.name.trim(), domains: input.domains, kind: input.kind, status: input.status,
  });
  return normalizeSavedCompetitor(r);
}

/** Só o gestor. */
export async function removeCompetitor(projectId: string, id: string): Promise<void> {
  await call<{ ok?: boolean }>(projectId, { action: 'competitor_remove', id });
}

export interface QuestionsFilter extends PeriodFilter { topic?: string; intent?: string; limit?: number; offset?: number }
export async function fetchQuestions(projectId: string, f: QuestionsFilter): Promise<QuestionsData> {
  return normalizeQuestions(await call<unknown>(projectId, {
    action: 'questions', from: f.from, to: f.to, ...opt('topic', f.topic), ...opt('intent', f.intent), limit: f.limit ?? 25, offset: f.offset ?? 0,
  }));
}

export async function fetchQuestionHistory(projectId: string, query: string, engine?: string): Promise<QuestionHistory> {
  return normalizeHistory(await call<unknown>(projectId, { action: 'question_history', query, ...opt('engine', engine), limit: 100 }));
}

export async function fetchKeywords(projectId: string, f: PeriodFilter): Promise<KeywordRow[]> {
  return normalizeKeywords(await call<unknown>(projectId, { action: 'keywords', from: f.from, to: f.to }));
}

export async function fetchOpportunities(projectId: string, f: PeriodFilter): Promise<OpportunityItem[]> {
  return normalizeOpportunities(await call<unknown>(projectId, { action: 'opportunities', from: f.from, to: f.to }));
}

export async function fetchMethodology(projectId: string): Promise<Methodology> {
  return normalizeMethodology(await call<unknown>(projectId, { action: 'methodology' }));
}

/** "Solicitar" do cliente: reaproveita o `request_create` do plano de gerenciamento (tipos existentes). */
export async function requestFromManager(projectId: string, kind: RequestKind, message: string): Promise<ClientRequest | null> {
  return createClientRequest(projectId, { kind, message });
}
