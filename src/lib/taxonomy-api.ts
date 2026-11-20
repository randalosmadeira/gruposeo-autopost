/** Cliente da Taxonomia e do Planejador de Mercado: chama a função de borda `taxonomy` e traduz os erros para português. */
import { supabase } from '@/integrations/supabase/client';
import type { NodeRow, ScopeRow } from '../../supabase/functions/_shared/taxonomy-shared';
import type { Competitor, CostInfo, PriceTable, Scope } from '../../supabase/functions/_shared/market-campaign-core';

export type { NodeRow, ScopeRow, Competitor, CostInfo, PriceTable, Scope };

export interface SegmentInfo { id: string; label: string; status: 'validado' | 'rascunho'; description: string; matrizes: number; subareas: number }
export interface EdgeRow { id: string; from_id: string; to_id: string; relation: string; weight: number; source: string; note: string | null }
export interface CampaignCounts { total: number; executada: number; planejada: number; erro: number }
export interface CampaignRow {
  id: string; name: string; status: 'rascunho' | 'aprovada' | 'executando' | 'concluida' | 'cancelada'; phase: number; budget_cap_cents: number; estimated_cost_cents: number; spent_cents: number;
  provider: string | null; price_verified: boolean; config: { cost_known?: boolean; total_queries?: number; warnings?: string[]; price?: { currency?: string } }; created_at: string; queries: CampaignCounts;
}
export interface RollupCompetitor { host: string; kind: 'concorrente' | 'diretorio'; appearances: number; avg_position: number | null; score: number; areas: string[]; locations?: Competitor['locations']; last_seen?: string }
export interface TaxonomyOverview {
  project: { id: string; name: string; domain: string | null }; can_edit: boolean; paid_blocked: boolean;
  segments: SegmentInfo[]; nodes: NodeRow[]; edges: EdgeRow[]; geo_scope: ScopeRow[]; campaigns: CampaignRow[]; competitors_top: RollupCompetitor[];
  price_table: PriceTable; phases: Record<string, string>; ibge: { loaded: boolean; fetched_at: string | null; with_population: boolean };
  limits: { max_persist_queries: number };
}
export interface GeoOverview { loaded: boolean; total: number; by_uf: Record<string, { municipios: number; populacao: number | null }>; grandes_regioes: string[]; scope: ScopeRow[] }
export interface SuggestReport {
  segment: string; analyzed: { secoes: number; paginas: number; consultas: number; dias: number }; classified: number; unclassified: { count: number; weight: number; examples: string[] };
  nodes_new: number; nodes_updated: number; skipped_rejected: number; edges_new: number; edges_updated: number; geo_new: number; geo_updated: number; warnings: string[];
}
export interface PackReport { segment: string; nodes_new: number; nodes_updated: number; skipped_rejected: number; edges_new: number; edges_updated: number; warnings?: string[] }
export interface TailReport { added: number; already_there: number; unattached: string[]; unattached_count: number; invalid: number; duplicates: number; warnings: string[] }
export interface DistrictsReport { cities: number; added: number; existing: number; failed: string[]; remaining: number; warnings: string[] }
export interface WarningsReply { warnings?: string[] }
export interface SyncReport { municipios: number; with_population: number; population_year: number | null; population_available: boolean }
export interface PlanReport {
  executed: false; campaign: { id: string; name: string; status: string; estimated_cost_cents: number | null; provider: string; price_verified: boolean };
  dry_run: {
    per_phase: Array<{ phase: number; label: string; queries: number; cost_cents: number | null }>; total_queries: number; cost: CostInfo; engines: string[]; markets: string[]; needs_agent: string[];
    cap: { budget_cap_cents: number; cost_known: boolean; fits_queries: number | null; fits_all: boolean | null; max_queries_by_cap: number | null };
    persisted: number; truncated: boolean; warnings: string[]; central: string[]; in_budget_queries: number | null; sample: string[];
  };
}
export interface ImportReport { results_added: number; queries_with_results: number; queries_created: number; ignored_rows: number; unknown_queries: number; invalid: number; duplicates: number; truncated: boolean; competitors: number; own_appearances: number }
export interface CompetitorsReply { competitors: Array<RollupCompetitor | Competitor>; filtered: boolean; total?: number; own_appearances?: number; results_used?: number; truncated: boolean }

export class TaxonomyError extends Error {
  constructor(public code: string, public detail?: Record<string, unknown> | null) { super(code); }
}
const MESSAGES: Record<string, string> = {
  segment_required: 'Escolha o tipo de negócio (segmento) antes.',
  segment_unknown: 'Esse segmento não existe.',
  kind_invalid: 'Escolha se é área matriz, subárea ou nicho.',
  label_invalid: 'O nome precisa ter de 2 a 160 letras.',
  parent_required: 'Escolha dentro de qual área este item entra.',
  parent_kind_invalid: 'Esse item não pode entrar dentro dessa área.',
  node_exists: 'Já existe um item com esse nome nesse lugar.',
  node_not_found: 'Item não encontrado.',
  ids_invalid: 'Seleção inválida.',
  decision_invalid: 'Decisão inválida.',
  keywords_invalid: 'Palavras-chave inválidas.',
  sync_too_soon: 'Os municípios foram carregados há pouco. Tente de novo em alguns minutos.',
  ibge_unavailable: 'A base pública do IBGE não respondeu direito agora. Nada foi alterado. Tente de novo mais tarde.',
  role_invalid: 'Escolha a função do lugar (sede, atende, plantão ou alvo).',
  uf_invalid: 'Estado inválido.',
  uf_required: 'Informe o estado do município.',
  ibge_code_unknown: 'Esse município não está na base do IBGE carregada.',
  regiao_invalid: 'Essa região não existe na lista.',
  place_required: 'Informe um estado, um município ou uma região.',
  place_ambiguous: 'Informe só o município OU só a região.',
  entries_invalid: 'Informe pelo menos um lugar.',
  country_invalid: 'O país é a sigla de 2 letras (por exemplo: br, pt, fr, us).',
  language_invalid: 'A língua precisa ser algo como pt-BR, en ou fr.',
  bairro_needs_city: 'Para informar um bairro, informe também o município.',
  tail_empty: 'Cole a lista de buscas que o agente gerou (JSON ou uma busca por linha).',
  tail_format: 'Não consegui entender a lista. Use JSON (lista de buscas ou lista de objetos) ou uma busca por linha.',
  tail_agent_not_connected: 'O agente de IA que gera a cauda ainda não está ligado. Cole a lista que ele produziu.',
  engines_invalid: 'Motor de busca desconhecido.',
  nothing_to_do: 'Nada para fazer.',
  name_invalid: 'Dê um nome à campanha (2 a 120 letras).',
  phases_invalid: 'Escolha pelo menos uma fase.',
  provider_invalid: 'Escolha quem faz as buscas.',
  budget_invalid: 'O teto de gasto precisa ser um valor válido.',
  pages_invalid: 'Páginas por consulta: de 1 a 10.',
  central_invalid: 'Lista de subáreas centrais inválida.',
  campaign_id_required: 'Escolha a campanha.',
  campaign_not_found: 'Campanha não encontrada.',
  campaign_not_draft: 'Só campanhas em rascunho podem ser aprovadas.',
  campaign_empty: 'A campanha não tem nenhuma consulta.',
  campaign_closed: 'Essa campanha já terminou ou foi cancelada.',
  campaign_cancelled: 'Essa campanha foi cancelada.',
  price_not_verified: 'O preço deste provedor ainda não foi verificado. Informe o preço e marque que conferiu antes de aprovar.',
  budget_cap_required: 'Defina um teto de gasto maior que zero antes de aprovar.',
  cost_over_cap: 'O custo estimado passa do teto. Aumente o teto ou reduza as fases.',
  import_empty: 'Cole os resultados das buscas (CSV ou JSON).',
  import_too_large: 'O texto é grande demais para uma vez só. Envie em partes.',
  import_format: 'Não consegui entender o formato. Use JSON (no formato do Serper) ou CSV com cabeçalho.',
  import_header_required: 'O CSV precisa de cabeçalho com pelo menos as colunas "consulta" e "url".',
  filter_invalid: 'Filtro inválido.',
  global_paid_services_blocked: 'Serviços pagos estão bloqueados globalmente. O plano pode ser salvo; a execução das buscas fica pendente.',
  execution_not_built: 'A execução das buscas pagas ainda não foi construída. Use a importação de resultados.',
  role_not_allowed: 'Seu papel nesta organização permite ver, mas não alterar.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
};
export const taxonomyErrorMessage = (e: unknown): string => (e instanceof TaxonomyError ? MESSAGES[e.code] : undefined) || 'Não foi possível concluir agora. Tente de novo.';

export async function callTaxonomy<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('taxonomy', { body: { action, ...body } });
  if (error) {
    let payload: ({ error?: string } & Record<string, unknown>) | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new TaxonomyError(payload?.error || 'request_failed', payload);
  }
  return data as T;
}
