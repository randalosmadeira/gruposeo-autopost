// Tipos NORMALIZADOS da página Visibilidade (Zica Visibility Index, método `zvi-1`).
// Os envelopes do servidor são lidos por `src/lib/nexus-visibility.ts` (normalizadores tolerantes) e só a camada
// `src/lib/nexus-visibility-api.ts` conhece nomes de ação. Taxas (VR, CR, SoV, EST) ficam em fração 0 a 1; o ZVI em 0 a 100.

export type Confidence = 'alta' | 'media' | 'baixa' | 'sem_dados';

export type SourceType =
  | 'orgao_oficial' | 'portal_agregador' | 'midia' | 'escritorio' | 'diretorio' | 'rede_social' | 'academico' | 'outro';

export type CompetitorKind = 'escritorio' | 'advogado_individual' | 'portal' | 'outro';
export type CompetitorStatus = 'suggested' | 'tracked' | 'ignored';

export type OpportunityKind = 'pergunta_sem_marca' | 'fonte_alvo' | 'concorrente_a_frente';
export type OpportunityPriority = 'alta' | 'media' | 'baixa';

/** Taxa com intervalo de confiança e tamanho da amostra. `value === null` = "não medido". */
export interface RateStat { value: number | null; low: number | null; high: number | null; n: number }

export interface MethodInfo { version: string; label: string }

export interface ZviScore {
  /** 0 a 100. */
  value: number | null;
  low: number | null;
  high: number | null;
  partial: boolean;
  missing: string[];
  confidence: Confidence;
}

export interface PreviousPeriod { zvi: number | null; vr: number | null; cr: number | null; /** Observações do período anterior, quando o servidor informa. */ n: number | null }

export interface EngineRow { engine: string; label: string; vr: number | null; cr: number | null; n: number }
export interface TrendPoint { day: string; vr: number | null; cr: number | null; n: number }
export interface ChangeItem { kind: string; text: string }

export interface ResultLayer {
  ga4: { sessions: number; ai_sessions: number; key_events: number } | null;
  gsc: { clicks: number; impressions: number } | null;
}

export interface VisibilityOverview {
  method: MethodInfo;
  period: { from: string | null; to: string | null };
  n_observations: number;
  zvi: ZviScore;
  indicators: {
    vr: RateStat;
    cr: { value: number | null; n: number };
    sov: { value: number | null; n: number };
    est: { value: number | null; n: number };
    /** Sempre `null` em `zvi-1` sem extração por modelo: a tela mostra "n/d". */
    pm: null;
    rep: null;
  };
  previous: PreviousPeriod | null;
  by_engine: EngineRow[];
  trend: TrendPoint[];
  changes: ChangeItem[];
  result: ResultLayer;
  truncated: boolean;
  generated_at: string | null;
  /** Se o servidor devolver o papel, ele só pode RESTRINGIR a interface. */
  viewer_can_manage: boolean | null;
}

export interface SourceRow {
  host: string;
  type: SourceType;
  zss: number | null;
  coverage: number | null;
  position: number | null;
  diversity: number | null;
  recency: number | null;
  relevance: number | null;
  citations: number;
  queries: number;
  engines: string[];
  is_own: boolean;
  last_seen: string | null;
}
export interface SourceTarget { host: string; type: SourceType; zss: number | null; why: string }
export interface SourcesData { method: MethodInfo; sources: SourceRow[]; targets: SourceTarget[]; truncated: boolean; generated_at: string | null }

export interface TrackedCompetitor {
  id: string;
  name: string;
  domains: string[];
  kind: CompetitorKind;
  status: CompetitorStatus;
  vr: number | null;
  sov: number | null;
  mentions: number;
  n: number;
  insufficient_sample: boolean;
}
export interface SuggestedCompetitor { name: string; domain: string; mentions: number; engines: string[]; reason: string }
export interface RankingRow { rank: number | null; name: string; is_own: boolean; vr: number | null; sov: number | null; n: number; insufficient_sample: boolean }
export interface CompetitorsData {
  method: MethodInfo;
  tracked: TrackedCompetitor[];
  suggested: SuggestedCompetitor[];
  own: { vr: number | null; sov: number | null; n: number };
  ranking: RankingRow[];
  generated_at: string | null;
}

export interface CompetitorInput { id?: string; name: string; domains: string[]; kind: CompetitorKind; status: CompetitorStatus }
export interface SavedCompetitor { id: string; name: string; domains: string[]; kind: CompetitorKind; status: CompetitorStatus }

export interface QuestionRow {
  query: string;
  topic: string | null;
  intent: string | null;
  observations: number;
  vr: number | null;
  cr: number | null;
  last_observed_at: string | null;
  engines: string[];
}
export interface QuestionsData { total: number; questions: QuestionRow[]; generated_at: string | null }

export interface HistorySource { host: string; url: string }
export interface HistoryItem {
  observed_at: string | null;
  engine: string;
  country: string | null;
  /** null = "não informado" (a flag de menção não foi registrada); nunca tratar como "não mencionou". */
  mentioned: boolean | null;
  cited: boolean;
  position: number | null;
  brands: string[];
  sources: HistorySource[];
  response_excerpt: string | null;
}
export interface QuestionHistory { query: string; items: HistoryItem[] }

export interface KeywordRow { term: string; prompts: number; observations: number; vr: number | null }

export interface OpportunityItem {
  kind: OpportunityKind;
  title: string;
  detail: string;
  priority: OpportunityPriority;
  /** Evidência já formatada em pares "rótulo: valor" (sem texto gerado por IA). */
  evidence: Array<{ label: string; value: string }>;
}

export interface MethodComponent { id: string; label: string; weight: number; description: string }
export interface Methodology { version: string; components: MethodComponent[]; notes: string[]; fromServer: boolean }

export interface VisibilityFilters { days: number; engine: string; topic: string }
