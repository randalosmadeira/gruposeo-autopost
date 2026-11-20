/** Cliente da Indexação: chama o portão `engine` com module='indexacao' e traduz os erros para português. */
import { callEngine, EngineError } from '@/lib/engine-api';
import type { Engine, IndexState, ProblemKey } from '../../supabase/functions/_shared/indexation-core';

export type { Engine, IndexState, ProblemKey };

export interface CoverageBucket { key: string; label: string; urls: number; indexed: number; not_indexed: number; sent: number; unknown: number; problems: number }
export interface HygieneRow { key: string; ok: boolean; severity: 'alta' | 'media' | 'baixa' | 'info'; label: string; text: string; fix: string | null; evidence: Record<string, unknown>; applicable: boolean; checked_at: string }
export interface SubmissionRow { id: string; engine: Engine; host: string | null; urls_count: number; status: 'aceita' | 'recusada' | 'erro' | 'bloqueada'; response: Record<string, unknown>; created_at: string }
export interface EngineInfo { key: string; label: string; support: 'implementado' | 'cobertura_indexnow' | 'sem_api_gratuita_verificada'; how: string }
export interface IndexationOverview {
  project: { id: string; name: string; domain: string | null }; can_edit: boolean; can_admin: boolean;
  totals: { urls: number; indexed: number; not_indexed: number; unknown: number; sent: number; with_problems: number; in_sitemap: number; outside_sitemap: number; never_checked: number };
  last_synced_at: string | null; truncated: boolean;
  coverage: { by_host: CoverageBucket[]; by_section: CoverageBucket[]; by_lang: CoverageBucket[]; by_node: CoverageBucket[] };
  engines: EngineInfo[];
  problems: Record<string, { count: number; text: string }>; submissions: SubmissionRow[]; hygiene: HygieneRow[];
  blockers: Array<{ key: string; text: string; action: string | null }>;
  connections: { google: { connected: boolean; property: string | null }; bing: { connected: boolean }; indexnow: { hosts: Array<{ host: string; key_ready: boolean }> } };
  quota: { google: { used_24h: number; limit: number; per_minute: number; verified: boolean } };
  notices: string[];
}
export interface InventoryRow {
  id: string; url: string; host: string; section: string; source: string; in_sitemap: boolean; impressions: number; http_status: number | null; google: IndexState;
  google_detail: string | null; sent: Engine[]; problems: ProblemKey[]; last_checked_at: string | null;
}
export interface InventoryPage { total: number; page: number; page_size: number; rows: InventoryRow[] }
export interface PlanItem { url_id: string; url: string; host?: string; score: number; reasons: string[]; google: IndexState }
export interface PlanReply {
  queue: PlanItem[]; total_queue: number; excluded: { indexed: number; blocked: number }; empty?: boolean; message?: string;
  batches: { google_inspect: { urls: number; url_ids?: string[] }; indexnow: Array<{ host: string; urls: number; sample: string[] }>; bing: Array<{ host: string; urls: number; sample: string[] }> };
  blocking?: Record<string, { count: number; text: string }>; notes?: string[];
}
export interface SyncReport {
  urls_total: number; new: number; updated: number; removed_from_sitemap: number; in_sitemap: number; outside_sitemap: number; rejected_foreign: number; rejected_invalid: number; http_normalized: number;
  hosts: string[]; sitemap_files: Array<{ url: string; kind: string; urls: number; error: string | null }>; truncated: boolean; remaining_files: number; warnings: string[];
}
export interface CheckReport { checked: number; failed: number; problems: Record<string, { count: number; text: string; sample: string[] }>; remaining_unchecked: number; soft404_probes: number; soft404_probes_skipped: number }
export interface GoogleReport {
  connected: boolean; message?: string | null; property?: string; checked: number; indexed?: number; not_indexed?: number; outside_scope?: number; errors?: number; stopped?: string | null;
  by_coverage?: Record<string, number>; quota?: { used_24h: number; limit: number; verified: boolean; note: string }; notice?: string;
}
export interface HostSubmit { host: string; sent: number; pending: number; reason?: string | null; message?: string; how_to?: string; quota?: { daily: number | null; monthly: number | null } | null }
export interface SubmitReport { connected?: boolean; sent: number; message?: string; hosts?: HostSubmit[]; skipped_unchanged?: number; skipped_problem?: number; notice?: string }
export interface HygieneReport { items: Array<{ key: string; label: string; ok: boolean; applicable: boolean; severity: HygieneRow['severity']; detail: string; fix: string | null }>; failing: number; by_severity: { alta: number; media: number; baixa: number }; newly_failing: number; hosts: string[] }
export interface KeyReply { host: string; key?: string; file_name?: string; file_content?: string; file_url?: string; how_to?: string; saved: boolean }

export const IndexationError = EngineError;
const MESSAGES: Record<string, string> = {
  project_domain_required: 'Cadastre o domínio do projeto antes de usar a Indexação.',
  inventory_empty: 'O inventário está vazio. Clique em "Atualizar inventário" primeiro.',
  ids_invalid: 'Seleção de URLs inválida.',
  google_quota_reached: 'O limite diário de consultas ao Google foi atingido. Tente de novo amanhã.',
  google_connection_unusable: 'A conexão com o Google não pôde ser usada agora. Reconecte o Google em NEXUS · Motores & APIs.',
  google_property_required: 'A conexão do Google não tem uma propriedade do Search Console escolhida.',
  host_not_in_project: 'Esse endereço não pertence ao projeto.',
  key_invalid: 'A chave precisa ter de 8 a 128 caracteres: letras, números ou hífen.',
  key_file_not_found: 'O arquivo da chave não está no ar com a chave dentro. Publique-o no site e tente de novo.',
  role_not_allowed: 'Seu papel nesta organização permite ver, mas não alterar.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
  project_id_required: 'Escolha o projeto.',
  unknown_module: 'O portão ainda não está no ar (função "engine" não publicada).',
};
export const indexationErrorMessage = (e: unknown): string => {
  if (e instanceof EngineError) return MESSAGES[e.code] || e.serverMessage || 'Não foi possível concluir agora. Tente de novo.';
  return 'Não foi possível concluir agora. Tente de novo.';
};

const call = <T>(action: string, body: Record<string, unknown>) => callEngine<T>('indexacao', action, body);
export const indexation = {
  overview: (projectId: string) => call<IndexationOverview>('overview', { projectId }),
  list: (projectId: string, f: { host?: string; section?: string; state?: string; problem?: string; q?: string; page?: number }) => call<InventoryPage>('list', { projectId, ...f }),
  plan: (projectId: string) => call<PlanReply>('plan', { projectId, limit: 50 }),
  sync: (projectId: string, urls?: string[]) => call<SyncReport>('inventory_sync', { projectId, urls }),
  check: (projectId: string, limit = 40) => call<CheckReport>('check_urls', { projectId, limit }),
  google: (projectId: string, limit = 50, languageCode?: string) => call<GoogleReport>('google_inspect', { projectId, limit, languageCode }),
  indexnow: (projectId: string) => call<SubmitReport>('submit_indexnow', { projectId }),
  bing: (projectId: string) => call<SubmitReport>('bing_submit', { projectId }),
  hygiene: (projectId: string) => call<HygieneReport>('hygiene', { projectId }),
  keySave: (projectId: string, body: { host?: string; key?: string; generate?: boolean }) => call<KeyReply>('indexnow_key_save', { projectId, ...body }),
};

/** Problemas que o servidor pode marcar em uma URL (a tela traduz pelo rótulo `pr.<chave>`). */
export const PROBLEM_KEYS: ProblemKey[] = ['noindex', 'soft404', 'erro_http', 'redirecionada', 'canonical_diferente', 'fora_do_sitemap', 'bloqueada_robots', 'sem_resposta', 'http_sem_redirecionamento'];
