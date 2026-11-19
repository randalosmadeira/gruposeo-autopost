// Camada de cliente das ações novas (contrato GA4/gestão, seção G). Todos os nomes de ação, campos e envelopes
// vivem AQUI: se o backend mudar algo, é este o único arquivo a ajustar. Chamadas sempre via `invokeEdge`
// (nunca registra o corpo; 403 `manager_required` chega como Error('manager_required')).
import { invokeEdge } from '@/hooks/useNexusProviders';
import { normalizeContentPerformance, normalizeGa4Summary } from '@/lib/nexus-analytics';
import { normalizeRequests } from '@/lib/nexus-requests';
import type { ContentPerformance, Ga4Summary } from '@/types/nexus-analytics';
import type { Ga4SyncResponse, Ga4SyncResult, ProjectIntegrations, ProjectIntegrationsInput } from '@/types/nexus-providers';
import type { ClientRequest, RequestCreateInput, RequestStatus, RequestUpdateInput } from '@/types/nexus-requests';

const FN = 'nexus-intelligence' as const;

export async function fetchGa4Summary(projectId: string, from: string, to: string): Promise<Ga4Summary> {
  const r = await invokeEdge<{ summary?: unknown }>(FN, projectId, { action: 'ga4_summary', from, to });
  return normalizeGa4Summary(r?.summary);
}

export async function fetchContentPerformance(projectId: string, from: string, to: string): Promise<ContentPerformance> {
  const r = await invokeEdge<{ performance?: unknown }>(FN, projectId, { action: 'content_performance', from, to });
  return normalizeContentPerformance(r?.performance);
}

/** Ação técnica (gestor). */
export async function runGa4Sync(projectId: string, days?: number): Promise<Ga4SyncResult> {
  const r = await invokeEdge<Ga4SyncResponse>(FN, projectId, { action: 'ga4_sync', ...(days ? { days } : {}) });
  return r?.result ?? {};
}

export async function fetchProjectIntegrations(projectId: string): Promise<ProjectIntegrations> {
  const r = await invokeEdge<{ integrations?: ProjectIntegrations }>(FN, projectId, { action: 'project_integrations_get' });
  return r?.integrations ?? {};
}

/** Ação técnica (gestor). String vazia remove o valor. */
export async function saveProjectIntegrations(projectId: string, input: ProjectIntegrationsInput): Promise<ProjectIntegrations> {
  const r = await invokeEdge<{ integrations?: ProjectIntegrations }>(FN, projectId, {
    action: 'project_integrations_set',
    ...(input.ga4PropertyId !== undefined ? { ga4PropertyId: input.ga4PropertyId } : {}),
    ...(input.gscProperty !== undefined ? { gscProperty: input.gscProperty } : {}),
  });
  return r?.integrations ?? {};
}

export async function createClientRequest(projectId: string, input: RequestCreateInput): Promise<ClientRequest | null> {
  const r = await invokeEdge<{ request?: unknown }>(FN, projectId, { action: 'request_create', kind: input.kind, message: input.message.trim() });
  return normalizeRequests(r?.request ? [r.request] : [])[0] ?? null;
}

export async function listClientRequests(projectId: string, status?: RequestStatus): Promise<ClientRequest[]> {
  const r = await invokeEdge<{ requests?: unknown }>(FN, projectId, { action: 'requests_list', ...(status ? { status } : {}) });
  return normalizeRequests(r?.requests);
}

/** Só o gestor. */
export async function updateClientRequest(projectId: string, input: RequestUpdateInput): Promise<ClientRequest | null> {
  const r = await invokeEdge<{ request?: unknown }>(FN, projectId, {
    action: 'request_update', id: input.id,
    ...(input.status ? { status: input.status } : {}),
    ...(input.managerNote !== undefined ? { managerNote: input.managerNote.trim() } : {}),
  });
  return normalizeRequests(r?.request ? [r.request] : [])[0] ?? null;
}
