// Contrato NEXUS Observatório (docs/NEXUS_FUSION_CONTRACTS.md, seções 1.10 e 2).
// Não importar nada de supabase/ aqui: são apenas formatos de dados.

export type NexusEngine =
  | 'chatgpt_web' | 'chatgpt_api' | 'gemini_web' | 'gemini_api'
  | 'claude_web' | 'claude_api' | 'perplexity_web' | 'perplexity_api'
  | 'copilot_web' | 'google_aio' | 'google_serp' | 'bing_serp';

export const NEXUS_ENGINES: readonly NexusEngine[] = [
  'chatgpt_web', 'chatgpt_api', 'gemini_web', 'gemini_api', 'claude_web', 'claude_api',
  'perplexity_web', 'perplexity_api', 'copilot_web', 'google_aio', 'google_serp', 'bing_serp',
];

export type NexusIntent = 'informational' | 'discovery' | 'transactional' | 'international' | 'branded';
export const NEXUS_INTENTS: readonly NexusIntent[] = ['informational', 'discovery', 'transactional', 'international', 'branded'];

export type NexusCadence = 'manual' | 'weekly' | 'daily';
export type NexusSetStatus = 'active' | 'paused';

export interface NexusPeriod { from: string; to: string }

export interface NexusTotals {
  operations: number;
  valid: number;
  mention_rate: number | null;
  citation_rate: number | null;
  own_citations: number;
  competitor_mentions: number;
  share_of_voice: number | null;
}

export interface NexusEngineRow { engine: string; valid: number; mentioned: number; cited: number }
export interface NexusCountryRow { country: string; valid: number; mentioned: number; cited: number }
export interface NexusEngineCountryRow { engine: string; country: string; valid: number; mentioned: number; cited: number }
export interface NexusTopicRow {
  topic: string; intent: string; valid: number; mentioned: number; cited: number; competitors: string[];
}
export interface NexusTrendRow { day: string; valid: number; mentioned: number; cited: number }
export interface NexusCompetitorRow { name: string; host: string | null; mentions: number; engines: string[] }
export interface NexusOwnUrlRow { url: string; citations: number; engines: string[] }
export interface NexusGap {
  topic: string;
  intent: string;
  query: string;
  country: string;
  engines_missing: string[];
  competitors: string[];
}
export interface NexusSignalsAgentRow { kind: string; agent: string; hits: number }
export interface NexusSignalsPathRow { path: string; kind: string; hits: number }
export interface NexusSignalsSummary {
  ai_bot_hits: number;
  ai_referrals: number;
  search_referrals: number;
  by_agent: NexusSignalsAgentRow[];
  by_path: NexusSignalsPathRow[];
  last_batch_at: string | null;
}

export interface NexusObservatorySummary {
  period: NexusPeriod;
  totals: NexusTotals;
  by_engine: NexusEngineRow[];
  by_country: NexusCountryRow[];
  by_topic: NexusTopicRow[];
  trend: NexusTrendRow[];
  /** Extensão opcional (fora do contrato 1.10): cruzamento motor x país. */
  by_engine_country?: NexusEngineCountryRow[];
  top_competitors: NexusCompetitorRow[];
  own_urls: NexusOwnUrlRow[];
  gaps?: NexusGap[];
  signals: NexusSignalsSummary;
}

export interface NexusMarket { country: string; language: string; city?: string }

export interface NexusPromptSetInput {
  id?: string;
  name: string;
  description?: string | null;
  markets: NexusMarket[];
  engines: string[];
  cadence: NexusCadence;
  status: NexusSetStatus;
}

export interface NexusPromptInput {
  id?: string;
  prompt_set_id: string;
  topic: string;
  intent: NexusIntent;
  query: string;
  branded?: boolean;
  position?: number;
  active?: boolean;
}

export interface NexusPrompt extends NexusPromptInput {
  id: string;
  created_at?: string;
}

export interface NexusPromptSet extends NexusPromptSetInput {
  id: string;
  created_at?: string;
  updated_at?: string;
  prompts: NexusPrompt[];
}

export interface NexusObservationCitation { url: string; title?: string }
export type NexusObservationCompetitor =
  | string
  | { name: string; host?: string; source?: 'citation' | 'mention' | 'map_pack' | 'organic' };

export interface NexusManualObservation {
  engine: string;
  engine_surface?: string;
  country: string;
  language: string;
  query: string;
  topic: string;
  intent: NexusIntent;
  branded?: boolean;
  rdm_mentioned: boolean;
  rdm_cited: boolean;
  citations: NexusObservationCitation[];
  competitors: NexusObservationCompetitor[];
  answer_excerpt?: string;
  note?: string;
  observed_at: string;
  evidence_path?: string;
  observer?: string;
  session_state?: string;
}

export interface NexusSiteSignalsKey {
  site_id: string;
  /** Segredo em claro: só existe na resposta de criação/rotação. Nunca persistir. */
  secret: string;
  endpoint: string;
  snippet: string;
  plugin_configured?: boolean;
}

export interface NexusSignalsStatus {
  site_id: string | null;
  allowed_origins: string[];
  last_batch_at: string | null;
  totals_30d?: { ai_bot_hits?: number; ai_referrals?: number; search_referrals?: number; human_pageviews?: number } | null;
}

/** Resposta de `homepage_schema_sync`. `dry_run:true` = pré-visualização, nada foi enviado ao site. */
export interface NexusHomepageSchemaResult {
  dry_run: boolean;
  applied: boolean;
  schemas: Array<Record<string, unknown>>;
  /** Só no sucesso real: quantidade de schemas gravados, informada pelo plugin. */
  count?: number;
  /** Só na pré-visualização: URL do WordPress do projeto (ou null). */
  site?: string | null;
}

export interface NexusPrepareRunResult { prepared: number; skipped: number; executed: false }

/** Resultado de leitura que distingue o estado "bloqueado" (402/423) de erro. */
export type NexusBlockedReason = 'budget_paused' | 'paid_services_blocked' | 'unknown';
export class NexusBlockedError extends Error {
  readonly status: number;
  readonly reason: NexusBlockedReason;
  constructor(status: number, message: string, reason: NexusBlockedReason = 'unknown') {
    super(message);
    this.name = 'NexusBlockedError';
    this.status = status;
    this.reason = reason;
  }
}

export interface NexusGapSelection { query: string; country: string; engines_missing: string[] }
