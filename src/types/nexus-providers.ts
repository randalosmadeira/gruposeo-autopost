// Contrato NEXUS · Motores & APIs (docs/NEXUS_PROVIDERS_CONTRACT.md e ..._ADENDO.md).
// Apenas formatos de dados; não importar nada de supabase/ aqui.
// Nenhum destes tipos carrega a credencial em claro: o servidor só devolve `last_four`.

export type ProviderId =
  | 'gsc' | 'bing_webmaster' | 'serper' | 'dataforseo' | 'serpapi' | 'brave'
  | 'openai' | 'gemini' | 'anthropic' | 'perplexity' | 'copilot';

export type ProviderCategory = 'search_truth' | 'serp' | 'ai_citations' | 'manual';

export type ProviderStatus = 'not_configured' | 'stored_unverified' | 'healthy' | 'degraded' | 'error' | 'manual';

export type OverallStatus = 'empty' | 'ok' | 'attention' | 'critical';

export interface ProviderQuota {
  label?: string | null;
  remaining?: number | null;
  limit?: number | null;
  reset_at?: string | null;
}

export interface ProviderHealthSnapshot {
  checked_at: string;
  ok: boolean;
  latency_ms?: number | null;
  http_status?: number | null;
  detail?: string | null;
  quota?: ProviderQuota | null;
  cost_micros?: number | null;
}

export interface ProviderCredentialInfo {
  stored: boolean;
  last_four: string | null;
  /** `stored_unverified | active | invalid | disabled` (ou ausente). */
  status: string | null;
  updated_at: string | null;
}

export interface ProviderUsage {
  valid_30d: number;
  failed_30d: number;
  uncertain_30d: number;
  last_success_at: string | null;
}

export interface ProviderOverviewItem {
  id: ProviderId;
  category: ProviderCategory;
  status: ProviderStatus;
  /** 0–100; null quando não configurado. */
  score: number | null;
  /** Habilitado para execução paga (`settings.providers_enabled`). */
  enabled: boolean;
  credential: ProviderCredentialInfo;
  health: {
    last: ProviderHealthSnapshot | null;
    checks_7d: number;
    ok_7d: number;
    avg_latency_ms_7d: number | null;
  };
  usage: ProviderUsage;
}

export interface ProviderProgram {
  execution_enabled: boolean;
  budget_usd_micros: number;
  reserved_usd_micros: number;
  consumed_usd_micros: number;
  providers_enabled: string[];
}

export interface ProvidersSummary {
  total: number;
  connected: number;
  healthy: number;
  degraded: number;
  error: number;
  not_configured: number;
  manual: number;
  overall: OverallStatus;
  score: number | null;
}

export interface ProvidersOverview {
  generated_at: string;
  organization_id: string;
  program: ProviderProgram;
  summary: ProvidersSummary;
  providers: ProviderOverviewItem[];
}

/** Resultado de um teste de saúde (ação `provider_health_check`). */
export type HealthSkipReason = 'not_configured' | 'manual' | 'cost_confirmation_required';
export interface HealthCheckResult {
  provider: string;
  ok: boolean;
  skipped?: HealthSkipReason;
  latency_ms?: number | null;
  http_status?: number | null;
  detail?: string | null;
  quota?: ProviderQuota | null;
  cost_micros?: number | null;
}
export interface HealthCheckResponse { results: HealthCheckResult[] }

/** Resposta de `store_credential`. Nunca contém o segredo. */
export interface StoreCredentialResult {
  success: boolean;
  status?: string;
  last_four?: string;
  health?: HealthCheckResult | null;
}

export interface ExecutionSettingsInput {
  executionEnabled: boolean;
  budgetUsd: number;
  providersEnabled: string[];
  confirm?: string;
}
export interface ExecutionSettingsResponse { program: Partial<ProviderProgram> & { settings?: Record<string, unknown> } }

// ---- Tráfego orgânico (GSC/Bing) ----

export interface SearchTotals { clicks: number; impressions: number; ctr: number | null; position: number | null }
export interface SearchDailyRow { day: string; clicks: number; impressions: number; position: number | null }
export interface SearchQueryRow { query: string; clicks: number; impressions: number; ctr: number | null; position: number | null }
export interface SearchPageRow { page: string; clicks: number; impressions: number; ctr: number | null; position: number | null }
export interface SearchCountryRow { country: string; clicks: number; impressions: number }
export interface SearchDeviceRow { device: string; clicks: number; impressions: number }

export interface SearchPerformanceSummary {
  totals: SearchTotals;
  daily: SearchDailyRow[];
  top_queries: SearchQueryRow[];
  top_pages: SearchPageRow[];
  by_country: SearchCountryRow[];
  by_device: SearchDeviceRow[];
  last_synced_at: string | null;
}

/** `search_performance_sync`: formato único (GSC) ou lista por fonte (adendo, `source: 'all'`). */
export interface SearchSyncSourceResult {
  source: 'gsc' | 'bing';
  ok: boolean;
  rows_upserted?: number;
  truncated?: boolean;
  error?: string;
  from?: string;
  to?: string;
}
export interface SearchSyncResponse {
  property?: string;
  from?: string;
  to?: string;
  rows_upserted?: number;
  truncated?: boolean;
  results?: SearchSyncSourceResult[];
}

// ---- Auditoria contínua ("Saúde do sistema") ----

export type AuditCategory = 'corrective' | 'preventive' | 'improvement';
export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AuditFindingStatus = 'open' | 'acknowledged' | 'snoozed' | 'resolved';

export type AuditFixType = 'provider_health_check' | 'search_performance_sync' | 'plugin_discovery_refresh' | 'open_route';
export interface AuditFixAction { type: AuditFixType; params?: Record<string, unknown> }

export interface AuditFinding {
  id: string;
  rule_id: string;
  project_id: string | null;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  detail: string | null;
  suggested_action: string | null;
  fix_action: AuditFixAction | null;
  status: AuditFindingStatus;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  snoozed_until: string | null;
  evidence?: Record<string, unknown> | null;
}

export interface AuditRun {
  id: number | string;
  trigger: 'schedule' | 'manual';
  started_at: string;
  finished_at: string | null;
  status: 'ok' | 'partial' | 'error' | null;
  rules_evaluated: number;
  findings_opened: number;
  findings_resolved: number;
}

export interface AuditOverview {
  generated_at: string;
  last_run: AuditRun | null;
  counts: {
    open: Record<AuditCategory, number>;
    by_severity: Record<AuditSeverity, number>;
    resolved_7d: number;
  };
  findings: AuditFinding[];
  runs: AuditRun[];
}

export interface AuditApplyFixResult {
  ok: boolean;
  result?: unknown;
  finding?: AuditFinding;
}
