/** Cliente do Radar de Mercado: chama o portão `engine` com module='radar'. Os erros chegam com `error` (código) e `message` (português) do servidor. */
import { callEngine, EngineError } from '@/lib/engine-api';

export type Level = 'pais' | 'uf' | 'regiao' | 'municipio' | 'distrito' | 'bairro' | 'zona';
export type Label = 'api_oficial' | 'trecho_publico_do_buscador' | 'provedor_terceiro' | 'indisponivel';
export type Direction = 'subindo' | 'caindo' | 'estavel' | 'sem_dados';
export interface Trend { direction: Direction; delta: number | null; points: number }
export interface Why { rule: string; via: string | null; detail: string }

export interface FocusRow {
  id: string; name: string; weight: number; topics: string[]; audiences: string[]; segment_node_id: string | null; segment_label: string | null; modalities: string[]; language: string;
  status: 'ativo' | 'pausado' | 'arquivado'; needs_review: boolean; compliance_mode: string; source: string; places: { total: number; aprovado: number; sugerido: number };
}
export interface Saturation { rounds: number; recent_new_rate: number | null; trending_to_zero: boolean; saturated: boolean; message_key: 'sem_rodadas' | 'poucas_rodadas' | 'ainda_descobrindo' | 'tendendo_a_zero' | 'saturado' }
export interface RunRow { id: string; kind: string; status: string; queries_planned: number; queries_done: number; new_entities: number; total_entities: number; cost_micros: number; stop_reason: string | null; started_at: string; finished_at: string | null }
export interface ScheduleRow { id: string; focus_id: string | null; cadence: 'diaria' | 'semanal' | 'mensal'; enabled: boolean; budget_micros: number; max_queries: number; next_run_at: string; last_run_at: string | null; consecutive_failures: number }
export interface DayBudget { remaining_micros: number; used_micros: number; cap_micros: number }

export interface Overview {
  project: { id: string; name: string; domain: string | null }; can_edit: boolean; can_admin: boolean; focuses: FocusRow[];
  totals: { competitors: number; identities: number; pages: number; listings: number; scanned_sites: number; links: number };
  providers: { serper: boolean; dataforseo: boolean; brave: boolean; youtube: boolean; open_pagerank: boolean; third_party: boolean };
  youtube: { available: boolean; message: string | null };
  cost: { radar_today_micros: number; day: DayBudget | null; basis: string };
  saturation: Saturation; runs: RunRow[]; schedules: ScheduleRow[]; orphans: { total: number; counts: Record<string, number>; zero: boolean };
  limits: { social: string; score: string; authority: string[]; overpass: string | null; osm_attribution: string | null; platforms: Array<{ id: string; label: string; metrics: string }> };
}

export interface FocusDraftReply {
  source: 'ia' | 'heuristica'; ai_note: string | null; saved: boolean; geo_loaded: boolean; geo_hint: string | null; issues: string[];
  focuses: Array<{
    id: string | null; name: string; weight: number; topics: string[]; places_saved: number; taxonomy_node: { id: string; label: string } | null;
    resolved: Array<{ text: string; kind: string; places: Array<{ id: string; name: string; level: Level; inferred: boolean }>; note: string | null }>;
    unresolved: Array<{ mention: { text: string }; status: string; note: string | null }>; expansion: { added: number; truncated: boolean; sample: Array<{ id: string; name: string; level: Level; why: Why[] }> };
  }>;
}
export interface TerritoryReply {
  focus: { id: string; name: string };
  places: Array<{ id: string; place: { id: string; name: string; level: Level; label: string; parents: string[]; population: number | null; source: string; license: string | null; attribution: string | null }; origin: string; why: Why[]; inferred: boolean; status: 'sugerido' | 'aprovado' | 'rejeitado'; weight_mult: number }>;
  attributions: string[]; counts: { total: number; aprovado: number; sugerido: number; rejeitado: number; inferido: number };
}
export interface PlanReply {
  providers: Overview['providers']; engines: string[]; tasks_total: number; truncated: boolean; notes: string[]; by_modality: Record<string, { tasks: number; est_micros: number }>; estimated_total_micros: number; cost_basis: string;
  coverage: CoverageSummary; day: DayBudget | null; sample: Array<{ key: string; query: string; engine: string; modality: string; priority: number; est_micros: number }>; blocked_reason: string | null;
}
export interface CoverageSummary { planned_total: number; done: number; pending: number; errors: number; skipped_budget: number; cost_micros: number; last_queried_at: string | null; pct_done: number; by_focus: Array<{ focus_id: string | null; name?: string | null; total: number; done: number; pending: number }> }
export interface CoverageReply { coverage: CoverageSummary; saturation: Saturation; runs: RunRow[]; honesty: string }
export interface RunReport {
  run_id: string | null; ok: boolean; queries_planned: number; queries_done: number; errors: number; cost_micros: number; cost_basis: string; new_entities: number; total_entities: number;
  stopped: 'teto_diario' | 'orcamento' | 'tempo' | null; stop_reason: string | null; budget_micros: number; day_remaining_micros: number | null; saturation: Saturation; engines: string[];
}
export interface IdentityRow { id: string; platform: string; kind: string; handle: string | null; metrics: Record<string, number | null>; metrics_label: Label }
export interface CompetitorRow {
  id: string; name: string; kind: string; primary_host: string | null; is_own: boolean; status: string; identities: IdentityRow[]; maps: { listings: number; rating: number | null; reviews: number };
  pages: number; links: number; score: { value: number | null; coverage: number; label: 'estimado' }; trend: Trend; authority: Record<string, unknown>;
}
export interface Availability { status: 'api_oficial' | 'trecho_publico' | 'provedor_terceiro' | 'indisponivel'; text: string }
export interface CompetitorsReply { competitors: CompetitorRow[]; total: number; disclaimer: string; availability: Record<string, Availability> }
export interface ScoreComponent { key: string; weight: number; value: number | null; facts: Record<string, unknown> }
export interface ScoreRow { competitor_id: string; name: string; is_own: boolean; status: string; score: number | null; coverage: number; label: 'estimado'; components: ScoreComponent[]; trend: Trend }
export interface ScoreboardReply { own: ScoreRow | null; rows: ScoreRow[]; leader: ScoreRow | null; gap: number | null; disclaimer: string; weights: Record<string, number> }
export interface AttackItem { id: string; kind: string; priority: number; title: string; why: string; what: string; facts: Record<string, unknown>; focus_name: string | null; place_name: string | null; node_label: string | null }
export interface AttackReply { items: AttackItem[]; has_search_console: boolean; ctr_note: string }
export interface LandscapeRow { id: string; label: string | null; competitors: number; with_site: number; with_maps: number; with_instagram: number; with_tiktok: number; with_kwai: number; with_youtube: number; with_facebook: number; with_linkedin: number; videos_total: number | null; posts_30d: number | null; reviews_total: number; rating_avg: number | null; strength_avg: number | null; strength_top: number | null }
export interface OverlapNode { node_id: string; label: string; kind: string; depth: number; competitors: Array<{ id: string; name: string; score: number | null }>; own_score: number | null; leader_score: number | null; gap: number | null; attacks: number; empty: boolean }
export interface OrphanItem { kind: string; ref: string; label: string; suggestion: { action: string; target_id: string | null; target_label: string | null; confidence: number; auto: boolean } | null }
export interface OrphansReply { items: OrphanItem[]; counts: Record<string, number>; total: number; zero_orphans: boolean; auto_fixable: number; goal: string }
export interface CompetitorDetail {
  competitor: { id: string; name: string; kind: string; primary_host: string | null; is_own: boolean; status: string; authority: Record<string, unknown> };
  identities: Array<IdentityRow & { url: string; source: string; confidence: number; metrics_source: string | null; metrics_at: string | null; availability: Availability }>;
  listings: Array<{ name: string; address: string | null; rating: number | null; reviews: number | null; phone: string | null; website: string | null }>; pages: Array<{ url: string; title: string | null; position: number | null; modality: string }>;
  scan: { status: string; sitemap: { urls: number | null }; llms_txt: { present: boolean }; schema: { types: string[]; hasFaq: boolean; isLocal: boolean } | null; tech: string[]; nap: { phones: string[] } } | null;
  links: Array<{ focus: string | null; place: string | null; node: string | null }>; score: { value: number | null; coverage: number; label: 'estimado'; components: ScoreComponent[] }; trend: Trend; notes: { disclaimer: string; authority: string[]; social: string };
}
export interface SyncReply { results: Array<{ source: string; ok: boolean; notes: string[]; places: number; members: number }> }
export interface SourcesReply { sources: Array<{ id: string; label: string; country: string | null; note: string }>; overpass_note: string; osm_attribution: string }
export interface YtReply { status: 'ok' | 'sem_chave' | 'nao_habilitada' | 'cota' | 'chave_invalida' | 'erro'; message: string | null; searches: number; channels: number; videos: number }
export interface EnrichReply { scanned: number; blocked_by_robots: number; failed: number; links_found: number; relinked: number; authority_updated: number; youtube_updated: number; youtube: { status: string; message: string | null }; remaining_unscanned: number }

const R = <T,>(action: string, projectId: string, body: Record<string, unknown> = {}) => callEngine<T>('radar', action, { projectId, ...body });

export const radar = {
  overview: (p: string) => R<Overview>('overview', p),
  focusFromText: (p: string, text: string, o: { save?: boolean; rules?: Record<string, unknown> } = {}) => R<FocusDraftReply>('focus_from_text', p, { text, save: o.save ?? true, ...(o.rules ? { rules: o.rules } : {}) }),
  focusSave: (p: string, body: Record<string, unknown>) => R<{ id?: string; updated?: boolean; created?: boolean; deleted?: boolean }>('focus_save', p, body),
  territory: (p: string, focusId: string) => R<TerritoryReply>('territory', p, { focusId }),
  territoryDecide: (p: string, focusId: string, ids: string[], patch: { status?: string; weightMult?: number }) => R<{ updated: number }>('territory_decide', p, { focusId, ids, ...patch }),
  territoryResolve: (p: string, focusId: string, mentions: Array<{ text: string; kind?: string; context?: string; expand_region?: boolean }>, rules?: Record<string, unknown>) => R<{ saved: number; unresolved: unknown[]; truncated: boolean }>('territory_resolve', p, { focusId, mentions, ...(rules ? { rules } : {}) }),
  territorySources: (p: string) => R<SourcesReply>('territory_sync', p),
  territorySync: (p: string, sources: string[], body: Record<string, unknown> = {}) => R<SyncReply>('territory_sync', p, { sources, ...body }),
  plan: (p: string, focusId?: string) => R<PlanReply>('plan', p, focusId ? { focusId } : {}),
  coverage: (p: string) => R<CoverageReply>('coverage', p),
  runBatch: (p: string, body: { budgetMicros?: number; maxQueries?: number; focusId?: string; multiWeb?: boolean } = {}) => R<RunReport>('run_batch', p, body),
  enrich: (p: string, limit = 3) => R<EnrichReply>('enrich_run', p, { limit }),
  youtubeDiscover: (p: string, focusId?: string) => R<YtReply>('youtube_discover', p, focusId ? { focusId } : {}),
  competitors: (p: string, body: { focusId?: string; placeId?: string; nodeId?: string; platform?: string; status?: string; q?: string } = {}) => R<CompetitorsReply>('competitors_list', p, body),
  competitor: (p: string, competitorId: string) => R<CompetitorDetail>('competitor_detail', p, { competitorId }),
  competitorSave: (p: string, competitorId: string, patch: { status?: string; kind?: string; name?: string }) => R<{ updated: boolean }>('competitor_save', p, { competitorId, ...patch }),
  scoreboard: (p: string, focusId?: string) => R<ScoreboardReply>('scoreboard', p, focusId ? { focusId } : {}),
  attack: (p: string) => R<AttackReply>('attack_list', p),
  landscape: (p: string, by: 'focus' | 'place' | 'node') => R<{ by: string; rows: LandscapeRow[]; disclaimer: string }>('landscape', p, { by }),
  overlap: (p: string) => R<{ nodes: OverlapNode[]; disclaimer: string }>('tree_overlap', p),
  orphans: (p: string) => R<OrphansReply>('orphans', p),
  orphanFix: (p: string, refs?: string[]) => R<{ applied: number; skipped: string[]; remaining: OrphansReply }>('orphan_fix', p, refs ? { refs } : {}),
  scheduleSave: (p: string, body: { cadence: string; focusId?: string | null; enabled?: boolean; budgetMicros?: number; maxQueries?: number; delete?: boolean }) => R<{ id?: string }>('schedule_save', p, body),
  snapshot: (p: string) => R<{ week: string; rows: number }>('scores_snapshot', p),
};

const MESSAGES: Record<string, string> = {
  radar_no_provider_key: 'Nenhuma chave de busca está guardada para esta organização. Cadastre Serper, DataForSEO ou Brave em NEXUS · Motores & APIs.',
  radar_no_active_focus: 'Crie ao menos um Foco ativo antes de rodar.',
  focus_not_understood: 'Não consegui entender a frase. Descreva o segmento e onde atuar.',
  text_required: 'Escreva a frase do Foco (pelo menos 8 letras).',
  spend_denied: 'O teto de gasto do dia não permite esta ação agora.',
  global_paid_services_blocked: 'Serviços pagos estão bloqueados globalmente. Esta ação não foi executada.',
  spend_guard_unavailable: 'Não foi possível conferir o teto de gasto agora. Por segurança, a ação paga não foi executada.',
  role_not_allowed: 'Seu papel nesta organização permite ver, mas não fazer isso.',
  weight_invalid: 'O peso vai de 1 a 10.',
  radar_operation_failed: 'Não foi possível concluir agora. Tente de novo.',
};
export function radarErrorMessage(e: unknown): string {
  if (e instanceof EngineError) return e.serverMessage || MESSAGES[e.code] || 'Não foi possível concluir agora. Tente de novo.';
  return 'Não foi possível concluir agora. Tente de novo.';
}
export const usd = (micros: number) => `US$ ${(micros / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
