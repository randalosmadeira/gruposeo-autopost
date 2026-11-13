import type { ClientRequest, RequestKind, RequestStatus } from '@/types/nexus-requests';
import type { Tone } from '@/lib/nexus-providers';

export const REQUEST_KINDS: readonly RequestKind[] = ['connect_source', 'plugin_link', 'plugin_update', 'new_observation_round', 'report', 'access', 'other'];
export const REQUEST_STATUSES: readonly RequestStatus[] = ['open', 'in_progress', 'done', 'rejected'];
export const REQUEST_MESSAGE_MIN = 3;
export const REQUEST_MESSAGE_MAX = 1000;
export const MANAGER_NOTE_MAX = 1000;
export const MAX_OPEN_REQUESTS = 20;

const KIND_LABELS: Record<RequestKind, string> = {
  connect_source: 'Conectar uma fonte de dados',
  plugin_link: 'Vincular o plugin ao meu site',
  plugin_update: 'Atualizar o plugin',
  new_observation_round: 'Nova rodada de observação',
  report: 'Pedir um relatório',
  access: 'Acesso ou permissões',
  other: 'Outro assunto',
};
const KIND_HINTS: Record<RequestKind, string> = {
  connect_source: 'Google Analytics, Search Console, Bing ou outro motor ainda não conectado.',
  plugin_link: 'Ligar o plugin do Zica.ai ao seu site WordPress.',
  plugin_update: 'Instalar a versão mais recente do plugin.',
  new_observation_round: 'Pedir uma nova rodada de acompanhamento das citações em IAs.',
  report: 'Um resumo do desempenho para você ou sua equipe.',
  access: 'Incluir, trocar ou remover quem acessa.',
  other: 'Qualquer outro pedido ao gestor.',
};
export function requestKindLabel(kind: RequestKind | string): string { return KIND_LABELS[kind as RequestKind] ?? 'Outro assunto'; }
export function requestKindHint(kind: RequestKind): string { return KIND_HINTS[kind]; }

const STATUS_LABELS: Record<RequestStatus, string> = { open: 'Aberta', in_progress: 'Em andamento', done: 'Concluída', rejected: 'Recusada' };
export function requestStatusLabel(status: RequestStatus | string): string { return STATUS_LABELS[status as RequestStatus] ?? String(status); }
export function requestStatusTone(status: RequestStatus | string): Tone {
  return status === 'done' ? 'success' : status === 'in_progress' ? 'info' : status === 'rejected' ? 'danger' : 'warning';
}

/** `null` = válido. O servidor revalida (3 a 1000 caracteres). */
export function validateRequestMessage(text: string): string | null {
  const t = text.trim();
  if (t.length < REQUEST_MESSAGE_MIN) return `Escreva ao menos ${REQUEST_MESSAGE_MIN} caracteres para o gestor entender o pedido.`;
  if (t.length > REQUEST_MESSAGE_MAX) return `A mensagem passa de ${REQUEST_MESSAGE_MAX} caracteres.`;
  return null;
}
export function validateManagerNote(text: string): string | null {
  return text.trim().length > MANAGER_NOTE_MAX ? `A resposta passa de ${MANAGER_NOTE_MAX} caracteres.` : null;
}

export function isRequestKind(v: unknown): v is RequestKind { return typeof v === 'string' && (REQUEST_KINDS as readonly string[]).includes(v); }
export function isRequestStatus(v: unknown): v is RequestStatus { return typeof v === 'string' && (REQUEST_STATUSES as readonly string[]).includes(v); }

const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const sn = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Aceita a linha crua do servidor; descarta o que não tiver id/kind/status válidos. */
export function normalizeRequests(raw: unknown): ClientRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientRequest[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const x = r as Record<string, unknown>;
    if (!s(x.id) || !isRequestStatus(x.status)) continue;
    out.push({
      id: s(x.id), organization_id: s(x.organization_id), project_id: sn(x.project_id), requested_by: s(x.requested_by),
      kind: isRequestKind(x.kind) ? x.kind : 'other', message: s(x.message), status: x.status, manager_note: sn(x.manager_note),
      created_at: s(x.created_at), updated_at: sn(x.updated_at), resolved_at: sn(x.resolved_at),
      organization_name: sn(x.organization_name), project_name: sn(x.project_name),
    });
  }
  return out;
}

/** Abertas primeiro (aberta, em andamento), depois as encerradas; dentro de cada grupo, a mais recente primeiro. */
export function sortRequests(list: ClientRequest[]): ClientRequest[] {
  const rank = (r: ClientRequest) => (r.status === 'open' ? 0 : r.status === 'in_progress' ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function openRequestsCount(list: ClientRequest[]): number { return list.filter((r) => r.status === 'open' || r.status === 'in_progress').length; }

/** Mensagem pronta do botão "Solicitar" de um provedor. */
export function providerRequestMessage(providerName: string, simpleStatus: 'connected' | 'attention' | 'not_connected'): string {
  return simpleStatus === 'not_connected'
    ? `Quero conectar: ${providerName}.`
    : `Preciso de ajuda com a conexão: ${providerName}.`;
}
