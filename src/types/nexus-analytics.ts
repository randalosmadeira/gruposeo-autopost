// Contrato GA4 + plano de gerenciamento (docs/NEXUS_GA4_AND_MANAGEMENT_PLANE_CONTRACT.md, seções B, D e G).
// Apenas formatos de dados já normalizados para a tela. O que chega do servidor passa por src/lib/nexus-analytics.ts
// (normalizadores tolerantes: campo ausente vira 0/null/lista vazia, nunca derruba a tela).

export interface Ga4Totals {
  sessions: number;
  engaged_sessions: number;
  page_views: number;
  users: number;
  /** 0–1; null quando não medido. */
  engagement_rate: number | null;
  avg_engagement_seconds: number | null;
  key_events: number;
}
export interface Ga4DailyRow { day: string; sessions: number; engaged_sessions: number; page_views: number; users: number; key_events: number }
export interface Ga4PageRow { page: string; sessions: number; engaged_sessions: number; page_views: number; key_events: number }
export interface Ga4ChannelRow { channel: string; sessions: number; engaged_sessions: number; key_events: number }
export interface Ga4AiSourceRow { source: string; sessions: number; engaged_sessions: number; key_events: number }
export interface Ga4AiReferrals {
  totals: { sessions: number; engaged_sessions: number; key_events: number };
  by_source: Ga4AiSourceRow[];
}

/** Saída de `nexus_analytics_summary` (ação `ga4_summary`). */
export interface Ga4Summary {
  period: { from: string | null; to: string | null };
  totals: Ga4Totals;
  daily: Ga4DailyRow[];
  top_pages: Ga4PageRow[];
  by_channel: Ga4ChannelRow[];
  ai_referrals: Ga4AiReferrals;
  last_synced_at: string | null;
}

export interface AreaGscMetrics { clicks: number; impressions: number; ctr: number | null; position: number | null }
export interface AreaGa4Metrics { sessions: number; engaged_sessions: number; key_events: number; ai_sessions: number }
export interface AreaPageRow { url: string; title: string; gsc: AreaGscMetrics; ga4: AreaGa4Metrics }
export interface AreaRow {
  area: string;
  articles: number;
  gsc: AreaGscMetrics;
  ga4: AreaGa4Metrics;
  /** No máximo 10 por área (o servidor limita). */
  top_pages: AreaPageRow[];
}
export interface UnmatchedPages { count: number; items: string[] }

/** Saída de `nexus_content_performance` (ação `content_performance`). */
export interface ContentPerformance {
  areas: AreaRow[];
  unmatched: { gsc_pages: UnmatchedPages; ga4_pages: UnmatchedPages };
  notes: string[];
  /** `1000` marca classificação heurística por palavras-chave; null quando o servidor não informou. */
  analysis_version: number | null;
}

export type AreaSortKey = 'area' | 'articles' | 'clicks' | 'impressions' | 'position' | 'sessions' | 'engaged_sessions' | 'key_events' | 'ai_sessions';
export type SortDirection = 'asc' | 'desc';
