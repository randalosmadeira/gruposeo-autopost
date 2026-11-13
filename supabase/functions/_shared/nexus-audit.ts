/**
 * NEXUS · Saúde do sistema: motor de auditoria contínua.
 *
 * Módulo sem efeitos colaterais de importação: regras puras (uma função por regra), motor de achados
 * (`reconcileFindings`), sondagens HTTP seguras e o orquestrador `runAuditForOrganization` com tudo injetável
 * (relógio, store, sondagem, testes de saúde, sincronização). O executor NUNCA faz chamada paga:
 * toda requisição de rede passa por `createGuardedFetch` (bloqueia endpoints cobrados) e `confirmCost` é sempre `false`.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type Category = 'corrective' | 'preventive' | 'improvement';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'open' | 'acknowledged' | 'snoozed' | 'resolved';
export const FIX_TYPES = ['provider_health_check', 'search_performance_sync', 'analytics_sync', 'plugin_discovery_refresh', 'open_route'] as const;
export type FixType = typeof FIX_TYPES[number];
export type FixAction = { type: FixType; params: Record<string, unknown> };

export type Candidate = {
  rule_id: string;
  project_id: string | null;
  subject: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  suggested_action: string;
  fix_action: FixAction | null;
  evidence: Record<string, unknown>;
};
/** Resultado de uma regra: achados atuais + fingerprints cujo estado não pôde ser determinado (não resolver). */
export type RuleOutput = { findings: Candidate[]; inconclusive: string[] };

export type ProbeResult = { ok: boolean; status: number; ms: number; bodySample: string; truncated?: boolean; error?: string };
export type ProviderQuota = { label?: string; remaining?: number | null; limit?: number | null; reset_at?: string | null };
export type ProviderHealth = { checked_at: string; ok: boolean; latency_ms: number | null; http_status: number | null; detail: string | null; quota: ProviderQuota | null; cost_micros: number };
export type ProviderSnapshot = {
  id: string;
  credential: { stored: boolean; last_four: string | null; status: string | null; updated_at: string | null };
  last_health: ProviderHealth | null;
  checks_7d: number;
  ok_7d: number;
  avg_latency_ms_7d: number | null;
  usage: { valid_30d: number; failed_30d: number; uncertain_30d: number; last_success_at: string | null };
};
export type ProgramCtx = {
  execution_enabled: boolean;
  budget_usd_micros: number;
  reserved_usd_micros: number;
  consumed_usd_micros: number;
  providers_enabled: string[];
  /** false = regras de sistema (runtime/segurança) desligadas para esta organização (`settings.audit_system_rules=false`). */
  system_rules: boolean;
};
export type SearchSourceState = { rows: number; last_day: string | null; last_synced_at: string | null; last_full_sync_at: string | null };
export type ContentIndexState = { total: number; avg_internal_links: number | null; unclassified: number };
export type ProjectCtx = {
  id: string;
  name: string;
  domain: string | null;
  /** Base do WordPress (sem barra final) ou `https://<domínio>`; null quando o projeto não tem endereço. */
  base_url: string | null;
  plugin_mode: boolean;
  plugin_namespace: string;
  gsc_property: string | null;
  prompt_sets: number;
  prompts: number;
  last_observation_at: string | null;
  site_key: { site_id: string; created_at: string; last_batch_at: string | null } | null;
  search: { gsc: SearchSourceState; bing: SearchSourceState };
  /** `projects.commercial_info.ga4_property_id` (somente dígitos) ou null. */
  ga4_property_id: string | null;
  /** Estado da sincronização do GA4 (`nexus_analytics_daily`). */
  analytics: SearchSourceState;
  /** Índice de conteúdos publicados (`wordpress_article_index`): total, média de links internos e quantos sem área. */
  content_index: ContentIndexState;
};
export type SecurityGrants = { anon_write_tables: number; sample: string[]; rls_disabled_tables: number; rls_sample: string[] };
export type CronJobHealth = { jobname: string; active: boolean; runs: number; failures: number; last_status: string | null; last_run: string | null };

export type AuditContext = {
  now: Date;
  organizationId: string;
  pluginVersion: string;
  /** null = indisponível (a regra falha e os achados dela NÃO são resolvidos). */
  providers: ProviderSnapshot[] | null;
  program: ProgramCtx | null;
  projects: ProjectCtx[];
  securityGrants: SecurityGrants | null;
  cronHealth: CronJobHealth[] | null;
  functionsBaseUrl: string | null;
  probe: (url: string) => Promise<ProbeResult>;
};

export type RuleId =
  | 'provider.never_verified' | 'provider.check_failed' | 'provider.latency_high' | 'provider.quota_low' | 'provider.unused_30d' | 'provider.free_not_connected'
  | 'search.sync_stale' | 'search.no_data' | 'ga4.not_connected' | 'ga4.property_missing' | 'ga4.sync_stale' | 'ga4.no_data'
  | 'content.internal_links_low' | 'content.area_unclassified_high' | 'observatory.stale' | 'observatory.no_prompts'
  | 'signals.no_batch' | 'signals.snippet_missing' | 'plugin.outdated' | 'plugin.unreachable'
  | 'site.llms_missing' | 'site.schema_thin' | 'runtime.function_down' | 'runtime.cron_failing'
  | 'security.anon_write' | 'security.rls_off' | 'cost.budget_80' | 'cost.enabled_without_provider' | 'execution.enabled_info';
export type AuditRule = { id: RuleId; scope: 'org' | 'system'; run: (ctx: AuditContext) => Promise<RuleOutput> | RuleOutput };

/** Falha de contexto: a regra não pôde ser avaliada (dado ausente). Não resolve achados existentes. */
export class ContextUnavailable extends Error {
  constructor(what: string) { super(`context_unavailable:${what}`); this.name = 'ContextUnavailable'; }
}
export class AuditBudgetExceeded extends Error {
  constructor() { super('audit_budget_exceeded'); this.name = 'AuditBudgetExceeded'; }
}

// ---------------------------------------------------------------------------
// Constantes de catálogo (espelham o contrato; mantidas locais para o módulo ser puro)
// ---------------------------------------------------------------------------
export const PROVIDER_NAMES: Record<string, string> = {
  gsc: 'Google Search Console', bing_webmaster: 'Bing Webmaster Tools', ga4: 'Google Analytics 4', serper: 'Serper', dataforseo: 'DataForSEO', serpapi: 'SerpApi', brave: 'Brave Search',
  openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Anthropic', perplexity: 'Perplexity',
};
export const SEARCH_TRUTH_PROVIDERS = ['gsc', 'bing_webmaster'] as const;
/** Provedores consumidos por sincronização (não por operações do Observatório): nunca "sem uso em 30 dias". */
export const SYNC_PROVIDERS = ['gsc', 'bing_webmaster', 'ga4'] as const;
/** Testes de saúde que consomem crédito: nunca executados pela auditoria. */
export const COST_HEALTH_PROVIDERS = ['serper', 'brave', 'perplexity'] as const;
export const STALE_HEALTH_MS = 24 * 3600_000;
export const LATENCY_HIGH_MS = 4000;
const DAY = 86_400_000;
const HOUR = 3_600_000;

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const providerName = (id: string) => PROVIDER_NAMES[id] ?? id;
const isSearchTruth = (id: string) => (SEARCH_TRUTH_PROVIDERS as readonly string[]).includes(id);
const isCostProvider = (id: string) => (COST_HEALTH_PROVIDERS as readonly string[]).includes(id);
const ms = (iso: string | null | undefined): number | null => { if (!iso) return null; const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
const clip = (v: unknown, max: number) => String(v ?? '').slice(0, max);

export const fingerprintOf = (ruleId: string, projectId: string | null, subject: string) => `${ruleId}|${projectId ?? ''}|${subject}`;
const out = (findings: Candidate[], inconclusive: string[] = []): RuleOutput => ({ findings, inconclusive });
function cand(c: Omit<Candidate, 'subject' | 'project_id' | 'fix_action' | 'evidence'> & Partial<Pick<Candidate, 'subject' | 'project_id' | 'fix_action' | 'evidence'>>): Candidate {
  return { subject: '', project_id: null, fix_action: null, evidence: {}, ...c };
}
const needProviders = (ctx: AuditContext) => { if (!ctx.providers) throw new ContextUnavailable('providers'); return ctx.providers; };
const systemOn = (ctx: AuditContext) => ctx.program?.system_rules !== false;
const healthFix = (id: string): FixAction | null => (isCostProvider(id) ? null : { type: 'provider_health_check', params: { provider: id } });

// ---------------------------------------------------------------------------
// Utilitários puros (versões, JSON-LD, arquivos de texto)
// ---------------------------------------------------------------------------
/** Compara versões numéricas pontuadas ("3.16.1" vs "3.12.0"). null quando alguma não é interpretável. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const parse = (v: string) => { const m = /^\s*v?(\d+(?:\.\d+){0,3})/.exec(String(v ?? '')); return m ? m[1].split('.').map(Number) : null; };
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function extractJsonLd(html: string): unknown[] {
  const nodes: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const push = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(push); return; }
    if (v && typeof v === 'object') {
      nodes.push(v);
      const g = (v as Record<string, unknown>)['@graph'];
      if (Array.isArray(g)) g.forEach(push);
    }
  };
  while ((m = re.exec(html)) !== null) {
    try { push(JSON.parse(m[1].trim())); } catch { /* bloco inválido é ignorado */ }
  }
  return nodes;
}
const ORG_TYPES = ['Organization', 'LegalService', 'Attorney', 'ProfessionalService', 'LocalBusiness', 'NewsMediaOrganization'];
/** Há nó de organização com name + url + sameAs não vazios? */
export function hasStrongOrganizationNode(html: string): boolean {
  return extractJsonLd(html).some((n) => {
    const o = n as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o['@type'] ?? []).map(String);
    if (!types.some((t) => ORG_TYPES.includes(t))) return false;
    const sameAs = o.sameAs;
    const sameOk = Array.isArray(sameAs) ? sameAs.some((s) => typeof s === 'string' && s.trim()) : typeof sameAs === 'string' && sameAs.trim() !== '';
    return typeof o.name === 'string' && o.name.trim() !== '' && typeof o.url === 'string' && o.url.trim() !== '' && sameOk;
  });
}
/** Arquivo de texto servido de verdade (2xx, não vazio, não é uma página HTML de erro com status 200). */
export function textFileOk(p: ProbeResult): boolean {
  return p.ok && p.status >= 200 && p.status < 300 && p.bodySample.trim().length > 0 && !/^\s*<(!doctype|html|\?xml)/i.test(p.bodySample);
}

// ---------------------------------------------------------------------------
// Sondagens por projeto (com cache por contexto)
// ---------------------------------------------------------------------------
const siteUrl = (p: ProjectCtx, path = '/') => (p.base_url ? `${p.base_url.replace(/\/+$/, '')}${path}` : null);
const originOf = (base: string): string | null => { try { return new URL(base).origin; } catch { return null; } };
const memo = new WeakMap<AuditContext, Map<string, Promise<unknown>>>();
function cached<T>(ctx: AuditContext, key: string, fn: () => Promise<T>): Promise<T> {
  let m = memo.get(ctx);
  if (!m) { m = new Map(); memo.set(ctx, m); }
  let v = m.get(key) as Promise<T> | undefined;
  if (!v) { v = fn(); m.set(key, v); }
  return v;
}
const homepage = (ctx: AuditContext, p: ProjectCtx) => cached(ctx, `home:${p.id}`, () => ctx.probe(siteUrl(p, '/')!));

type PluginInfo = { reachable: boolean; version: string | null; tried: Array<{ url: string; status: number }> };
function pluginInfo(ctx: AuditContext, p: ProjectCtx): Promise<PluginInfo> {
  return cached(ctx, `plugin:${p.id}`, async () => {
    const base = p.base_url!.replace(/\/+$/, '');
    const ns = p.plugin_namespace || 'zica-posts/v1';
    const urls = [`${base}/wp-json/${ns}/version`, `${base}/?rest_route=/${ns}/version`];
    const tried: PluginInfo['tried'] = [];
    for (const url of urls) {
      const r = await ctx.probe(url);
      tried.push({ url, status: r.status });
      if (r.ok) {
        let version: string | null = null;
        try { const j = JSON.parse(r.bodySample); version = typeof j?.version === 'string' ? j.version : null; } catch { /* resposta HTML do WordPress */ }
        if (version) return { reachable: true, version, tried };
      }
    }
    // 2xx sem JSON de versão não conta como alcançável
    return { reachable: false, version: null, tried };
  });
}

// ---------------------------------------------------------------------------
// Regras (uma função por regra)
// ---------------------------------------------------------------------------
export function ruleProviderNeverVerified(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const p of needProviders(ctx)) {
    if (!p.credential.stored || p.last_health) continue;
    const costly = isCostProvider(p.id);
    f.push(cand({
      rule_id: 'provider.never_verified', subject: p.id, category: 'corrective', severity: 'medium',
      title: `${providerName(p.id)}: chave guardada, mas nunca testada`,
      detail: 'A credencial está no cofre, porém nenhum teste de conexão foi registrado para ela.',
      suggested_action: costly ? 'Teste manualmente pelo painel (o teste consome 1 consulta e pede confirmação de custo).' : 'Rodar o teste de conexão gratuito.',
      fix_action: healthFix(p.id), evidence: { last_four: p.credential.last_four, credential_status: p.credential.status },
    }));
  }
  return out(f);
}
export function ruleProviderCheckFailed(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const p of needProviders(ctx)) {
    const h = p.last_health;
    if (!p.credential.stored || !h || h.ok) continue;
    f.push(cand({
      rule_id: 'provider.check_failed', subject: p.id, category: 'corrective', severity: isSearchTruth(p.id) ? 'critical' : 'high',
      title: `${providerName(p.id)}: o último teste de conexão falhou`,
      detail: `Último teste em ${h.checked_at}${h.http_status ? ` (HTTP ${h.http_status})` : ''}${h.detail ? `: ${clip(h.detail, 200)}` : '.'}`,
      suggested_action: 'Reconferir a chave, as permissões e o saldo/plano do provedor; depois testar de novo.',
      fix_action: healthFix(p.id), evidence: { checked_at: h.checked_at, http_status: h.http_status, latency_ms: h.latency_ms, detail: h.detail ? clip(h.detail, 200) : null },
    }));
  }
  return out(f);
}
export function ruleProviderLatencyHigh(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const p of needProviders(ctx)) {
    if (!p.credential.stored || p.checks_7d <= 0 || p.avg_latency_ms_7d == null || p.avg_latency_ms_7d <= LATENCY_HIGH_MS) continue;
    f.push(cand({
      rule_id: 'provider.latency_high', subject: p.id, category: 'preventive', severity: 'low',
      title: `${providerName(p.id)}: latência média alta nos últimos 7 dias`,
      detail: `Média de ${Math.round(p.avg_latency_ms_7d)} ms em ${p.checks_7d} testes (limite de referência: ${LATENCY_HIGH_MS} ms).`,
      suggested_action: 'Acompanhar; se persistir, avaliar outro provedor da mesma categoria.',
      evidence: { avg_latency_ms_7d: Math.round(p.avg_latency_ms_7d), checks_7d: p.checks_7d },
    }));
  }
  return out(f);
}
export function ruleProviderQuotaLow(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const p of needProviders(ctx)) {
    const q = p.last_health?.quota;
    if (!p.credential.stored || !q || typeof q.remaining !== 'number' || typeof q.limit !== 'number' || q.limit <= 0) continue;
    const pct = q.remaining / q.limit;
    if (!(pct < 0.25)) continue;
    f.push(cand({
      rule_id: 'provider.quota_low', subject: p.id, category: 'preventive', severity: pct < 0.1 ? 'high' : 'medium',
      title: `${providerName(p.id)}: saldo/cota restante baixo`,
      detail: `Restam ${q.remaining} de ${q.limit}${q.label ? ` (${clip(q.label, 60)})` : ''}, cerca de ${(pct * 100).toFixed(1)}%.`,
      suggested_action: 'Recarregar créditos ou subir o plano antes de acabar.',
      evidence: { remaining: q.remaining, limit: q.limit, percent: Math.round(pct * 1000) / 10, label: q.label ?? null },
    }));
  }
  return out(f);
}
export function ruleProviderUnused30d(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const p of needProviders(ctx)) {
    if (!p.credential.stored || (SYNC_PROVIDERS as readonly string[]).includes(p.id)) continue; // GSC/Bing/GA4 são consumidos pela sincronização, não por operações
    const used = p.usage.valid_30d + p.usage.failed_30d + p.usage.uncertain_30d;
    if (used > 0) continue;
    const at = ms(p.credential.updated_at);
    if (at !== null && ctx.now.getTime() - at < 30 * DAY) continue; // configurado há menos de 30 dias ainda não "ficou parado"
    f.push(cand({
      rule_id: 'provider.unused_30d', subject: p.id, category: 'improvement', severity: 'info',
      title: `${providerName(p.id)}: configurado, sem uso em 30 dias`,
      detail: 'Nenhuma operação registrada com este provedor nos últimos 30 dias.',
      suggested_action: 'Usar o provedor numa rodada do Observatório ou remover a chave.',
      evidence: { valid_30d: 0, failed_30d: 0, uncertain_30d: 0 },
    }));
  }
  return out(f);
}
export function ruleProviderFreeNotConnected(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  const providers = needProviders(ctx);
  for (const id of SEARCH_TRUTH_PROVIDERS) {
    const p = providers.find((x) => x.id === id);
    if (p?.credential.stored) continue;
    f.push(cand({
      rule_id: 'provider.free_not_connected', subject: id, category: 'improvement', severity: 'high',
      title: `${providerName(id)} ainda não está conectado`,
      detail: 'É gratuito e traz dados reais de tráfego (cliques, impressões, posição, consultas e páginas).',
      suggested_action: 'Abrir a Ativação guiada dos gratuitos e colar a credencial.',
      fix_action: { type: 'open_route', params: { route: '/nexus/motores', section: 'free_activation', provider: id } },
    }));
  }
  return out(f);
}

const activeCred = (ctx: AuditContext, id: string) => ctx.providers?.find((p) => p.id === id && p.credential.stored && p.credential.status === 'active') ?? null;
const SOURCES = [['gsc', 'gsc'], ['bing', 'bing_webmaster']] as const;
export function ruleSearchSyncStale(ctx: AuditContext): RuleOutput {
  needProviders(ctx);
  const f: Candidate[] = [];
  for (const [source, providerId] of SOURCES) {
    if (!activeCred(ctx, providerId)) continue;
    for (const pr of ctx.projects) {
      const last = ms(pr.search[source].last_synced_at);
      if (last === null) continue; // nunca sincronizado: tratado por search.no_data
      const age = ctx.now.getTime() - last;
      if (age <= 48 * HOUR) continue;
      f.push(cand({
        rule_id: 'search.sync_stale', project_id: pr.id, subject: source, category: 'corrective', severity: age > 7 * DAY ? 'high' : 'medium',
        title: `${pr.name}: dados de ${providerName(providerId)} desatualizados`,
        detail: `Última sincronização há ${Math.floor(age / HOUR)} h (limite: 48 h).`,
        suggested_action: 'Sincronizar agora; se falhar, conferir a propriedade e as permissões da conta.',
        fix_action: { type: 'search_performance_sync', params: { projectId: pr.id, source, days: 7 } },
        evidence: { last_synced_at: pr.search[source].last_synced_at, hours: Math.floor(age / HOUR) },
      }));
    }
  }
  return out(f);
}
export function ruleSearchNoData(ctx: AuditContext): RuleOutput {
  needProviders(ctx);
  const f: Candidate[] = [];
  for (const [source, providerId] of SOURCES) {
    const cred = activeCred(ctx, providerId);
    if (!cred) continue;
    const credAt = ms(cred.credential.updated_at);
    if (credAt !== null && ctx.now.getTime() - credAt < DAY) continue; // dá tempo à primeira sincronização agendada
    for (const pr of ctx.projects) {
      if (!pr.base_url && !pr.domain) continue;
      if (pr.search[source].rows > 0) continue;
      f.push(cand({
        rule_id: 'search.no_data', project_id: pr.id, subject: source, category: 'improvement', severity: 'medium',
        title: `${pr.name}: ${providerName(providerId)} conectado, mas sem dados`,
        detail: 'A credencial está ativa e nenhuma linha de desempenho foi gravada para este projeto.',
        suggested_action: source === 'gsc'
          ? 'Conferir a propriedade (sc-domain:…) e se o e-mail da conta de serviço foi adicionado como usuário no Search Console.'
          : 'Conferir se o site está verificado no Bing Webmaster com a mesma conta da chave.',
        evidence: { rows: 0, source },
      }));
    }
  }
  return out(f);
}
const ga4Active = (ctx: AuditContext) => activeCred(ctx, 'ga4');
const hasSite = (pr: ProjectCtx) => !!(pr.base_url || pr.domain);
export function ruleGa4NotConnected(ctx: AuditContext): RuleOutput {
  const providers = needProviders(ctx);
  if (providers.find((p) => p.id === 'ga4')?.credential.stored) return out([]);
  if (!ctx.projects.some(hasSite)) return out([]);
  const gscConnected = providers.some((p) => p.id === 'gsc' && p.credential.stored);
  return out([cand({
    rule_id: 'ga4.not_connected', subject: 'ga4', category: 'improvement', severity: gscConnected ? 'high' : 'medium',
    title: 'Google Analytics 4 ainda não está conectado',
    detail: 'É gratuito e mostra sessões, engajamento, eventos-chave e a origem do tráfego (inclusive vindo de assistentes de IA); o Search Console mostra só a busca.',
    suggested_action: 'Pedir ao gestor para conectar o GA4 (a conta de serviço do Search Console pode ser reaproveitada) e informar a propriedade de cada site.',
    fix_action: { type: 'open_route', params: { route: '/nexus/motores', section: 'free_activation', provider: 'ga4' } },
    evidence: { source: 'ga4' },
  })]);
}
export function ruleGa4PropertyMissing(ctx: AuditContext): RuleOutput {
  needProviders(ctx);
  if (!ga4Active(ctx)) return out([]);
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    if (!hasSite(pr) || pr.ga4_property_id) continue;
    f.push(cand({
      rule_id: 'ga4.property_missing', project_id: pr.id, category: 'corrective', severity: 'medium',
      title: `${pr.name}: GA4 conectado, mas o projeto não tem a propriedade informada`,
      detail: 'A credencial do GA4 está ativa, porém este projeto não tem o ID da propriedade GA4 (somente dígitos); sem ele nenhum dado é coletado.',
      suggested_action: 'Pedir ao gestor para informar o ID da propriedade GA4 deste site (cada site tem a sua; nunca compartilhe uma propriedade entre sites).',
      fix_action: { type: 'open_route', params: { route: '/nexus/motores', section: 'ga4_property', projectId: pr.id } },
      evidence: { source: 'ga4' },
    }));
  }
  return out(f);
}
export function ruleGa4SyncStale(ctx: AuditContext): RuleOutput {
  needProviders(ctx);
  if (!ga4Active(ctx)) return out([]);
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    if (!pr.ga4_property_id) continue;
    const last = ms(pr.analytics.last_synced_at);
    if (last === null) continue; // nunca sincronizado: tratado por ga4.no_data
    const age = ctx.now.getTime() - last;
    if (age <= 48 * HOUR) continue;
    f.push(cand({
      rule_id: 'ga4.sync_stale', project_id: pr.id, subject: 'ga4', category: 'corrective', severity: age > 7 * DAY ? 'high' : 'medium',
      title: `${pr.name}: dados do Google Analytics 4 desatualizados`,
      detail: `Última sincronização há ${Math.floor(age / HOUR)} h (limite: 48 h).`,
      suggested_action: 'Sincronizar agora; se falhar, conferir a propriedade e se a conta de serviço é leitora dela.',
      fix_action: { type: 'analytics_sync', params: { projectId: pr.id, days: 7 } },
      evidence: { last_synced_at: pr.analytics.last_synced_at, hours: Math.floor(age / HOUR), source: 'ga4' },
    }));
  }
  return out(f);
}
export function ruleGa4NoData(ctx: AuditContext): RuleOutput {
  needProviders(ctx);
  const cred = ga4Active(ctx);
  if (!cred) return out([]);
  const credAt = ms(cred.credential.updated_at);
  if (credAt !== null && ctx.now.getTime() - credAt < DAY) return out([]); // dá tempo à primeira sincronização agendada
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    if (!pr.ga4_property_id || pr.analytics.rows > 0) continue;
    f.push(cand({
      rule_id: 'ga4.no_data', project_id: pr.id, subject: 'ga4', category: 'improvement', severity: 'medium',
      title: `${pr.name}: GA4 conectado, mas sem dados`,
      detail: 'A credencial está ativa, a propriedade foi informada e nenhuma linha do Google Analytics foi gravada para este projeto.',
      suggested_action: 'Conferir o ID da propriedade e se o e-mail da conta de serviço foi adicionado como leitor na propriedade GA4 (Administrador → Gerenciamento de acesso à propriedade).',
      evidence: { rows: 0, source: 'ga4' },
    }));
  }
  return out(f);
}
export function ruleContentInternalLinksLow(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    const c = pr.content_index;
    if (!c || c.total <= 0 || c.avg_internal_links === null || !(c.avg_internal_links < 2)) continue;
    f.push(cand({
      rule_id: 'content.internal_links_low', project_id: pr.id, category: 'improvement', severity: c.avg_internal_links < 1 ? 'medium' : 'low',
      title: `${pr.name}: poucos links internos nos conteúdos`,
      detail: `Média de ${c.avg_internal_links.toFixed(2)} link(s) interno(s) por conteúdo, em ${c.total} conteúdo(s) publicado(s) do índice (referência: pelo menos 2).`,
      suggested_action: 'Ligar os artigos entre si (links para páginas da mesma área). Os links sugeridos do Observatório ajudam; todo link aplicado passa por revisão.',
      evidence: { average_internal_links: c.avg_internal_links, total_contents: c.total },
    }));
  }
  return out(f);
}
export function ruleContentAreaUnclassifiedHigh(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    const c = pr.content_index;
    if (!c || c.total <= 0 || !(c.unclassified / c.total > 0.2)) continue;
    const pct = Math.round((c.unclassified / c.total) * 1000) / 10;
    f.push(cand({
      rule_id: 'content.area_unclassified_high', project_id: pr.id, category: 'improvement', severity: 'info',
      title: `${pr.name}: ${pct}% dos conteúdos sem área definida`,
      detail: `${c.unclassified} de ${c.total} conteúdos do índice estão como "não classificado"; o desempenho por área fica menos fiel.`,
      suggested_action: 'Revisar a classificação por área dos conteúdos (hoje feita por palavras-chave) ou ajustar as regras de classificação.',
      evidence: { unclassified_percent: pct, total_contents: c.total },
    }));
  }
  return out(f);
}
export function ruleObservatoryStale(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    if (pr.prompt_sets === 0 && !pr.last_observation_at) continue; // projeto que nunca usou o Observatório: coberto por observatory.no_prompts
    const last = ms(pr.last_observation_at);
    if (last !== null && ctx.now.getTime() - last <= 14 * DAY) continue;
    f.push(cand({
      rule_id: 'observatory.stale', project_id: pr.id, category: 'preventive', severity: 'low',
      title: `${pr.name}: nenhuma observação nova há mais de 14 dias`,
      detail: last === null ? 'Há conjuntos de prompts, mas nenhuma observação válida registrada.' : `Última observação em ${pr.last_observation_at}.`,
      suggested_action: 'Registrar uma observação manual ou preparar uma nova rodada no Observatório.',
      evidence: { last_observation_at: pr.last_observation_at },
    }));
  }
  return out(f);
}
export function ruleObservatoryNoPrompts(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    if (pr.prompt_sets > 0 || (!pr.base_url && !pr.domain)) continue;
    f.push(cand({
      rule_id: 'observatory.no_prompts', project_id: pr.id, category: 'improvement', severity: 'medium',
      title: `${pr.name}: sem conjunto de prompts no Observatório`,
      detail: 'Sem prompts não há o que observar nas respostas de IA e nos resultados de busca.',
      suggested_action: 'Criar um conjunto de prompts (perguntas que o seu cliente faria) no Observatório.',
      evidence: { prompt_sets: 0 },
    }));
  }
  return out(f);
}
export function ruleSignalsNoBatch(ctx: AuditContext): RuleOutput {
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    const k = pr.site_key;
    if (!k || k.last_batch_at) continue;
    const created = ms(k.created_at);
    if (created === null || ctx.now.getTime() - created <= DAY) continue;
    f.push(cand({
      rule_id: 'signals.no_batch', project_id: pr.id, category: 'corrective', severity: 'medium',
      title: `${pr.name}: chave de sinais criada, mas nenhum dado recebido`,
      detail: `A chave ${k.site_id} existe há mais de 24 h e o site ainda não enviou nenhum lote.`,
      suggested_action: 'Conferir se o snippet (ou a configuração do plugin) foi instalado e se a origem do site está permitida.',
      evidence: { site_id: k.site_id, created_at: k.created_at },
    }));
  }
  return out(f);
}
export async function ruleSignalsSnippetMissing(ctx: AuditContext): Promise<RuleOutput> {
  const f: Candidate[] = [];
  const inconclusive: string[] = [];
  for (const pr of ctx.projects) {
    if (!pr.site_key || !pr.base_url) continue;
    const key = fingerprintOf('signals.snippet_missing', pr.id, '');
    const page = await homepage(ctx, pr);
    if (!page.ok || page.truncated) { inconclusive.push(key); continue; } // sem página legível não dá para afirmar
    if (/zica-signals/i.test(page.bodySample)) continue;
    f.push(cand({
      rule_id: 'signals.snippet_missing', project_id: pr.id, category: 'corrective', severity: 'high',
      title: `${pr.name}: o snippet de sinais não aparece na página inicial`,
      detail: 'A chave de sinais existe, mas a página inicial não contém "zica-signals".',
      suggested_action: 'Instalar o snippet no tema (ou ativar os sinais no plugin Zica Posts) e limpar o cache do site.',
      evidence: { site_id: pr.site_key.site_id, http_status: page.status },
    }));
  }
  return out(f, inconclusive);
}
export async function rulePluginOutdated(ctx: AuditContext): Promise<RuleOutput> {
  const f: Candidate[] = [];
  const inconclusive: string[] = [];
  for (const pr of ctx.projects) {
    if (!pr.plugin_mode || !pr.base_url) continue;
    const key = fingerprintOf('plugin.outdated', pr.id, '');
    const info = await pluginInfo(ctx, pr);
    if (!info.reachable || !info.version) { inconclusive.push(key); continue; }
    if (compareVersions(info.version, ctx.pluginVersion) !== -1) continue;
    f.push(cand({
      rule_id: 'plugin.outdated', project_id: pr.id, category: 'preventive', severity: 'medium',
      title: `${pr.name}: plugin Zica Posts desatualizado`,
      detail: `Instalado: ${info.version}. Atual: ${ctx.pluginVersion}.`,
      suggested_action: 'Instalar o zip mais recente do plugin (Plugins → Adicionar novo → Enviar plugin) e ativar.',
      evidence: { installed: info.version, current: ctx.pluginVersion },
    }));
  }
  return out(f, inconclusive);
}
export async function rulePluginUnreachable(ctx: AuditContext): Promise<RuleOutput> {
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    if (!pr.plugin_mode || !pr.base_url) continue;
    const info = await pluginInfo(ctx, pr);
    if (info.reachable) continue;
    f.push(cand({
      rule_id: 'plugin.unreachable', project_id: pr.id, category: 'corrective', severity: 'high',
      title: `${pr.name}: a API do plugin não responde`,
      detail: `Nenhum dos endereços de versão do plugin respondeu 2xx com JSON (${info.tried.map((t) => t.status || 'sem resposta').join(' / ')}).`,
      suggested_action: 'Verificar se o plugin está ativo, se o permalink/REST está habilitado e se um WAF ou cache não está bloqueando /wp-json/.',
      evidence: { tried: info.tried.map((t) => ({ status: t.status })) },
    }));
  }
  return out(f);
}
export async function ruleSiteLlmsMissing(ctx: AuditContext): Promise<RuleOutput> {
  const f: Candidate[] = [];
  for (const pr of ctx.projects) {
    if (!pr.plugin_mode || !pr.base_url) continue;
    const origin = originOf(pr.base_url);
    const llmsUrls = [siteUrl(pr, '/llms.txt')!, ...(origin && `${origin}/llms.txt` !== siteUrl(pr, '/llms.txt') ? [`${origin}/llms.txt`] : [])];
    const llms = await Promise.all(llmsUrls.map((u) => ctx.probe(u)));
    const robots = await ctx.probe(`${origin ?? pr.base_url.replace(/\/+$/, '')}/robots.txt`);
    const llmsOk = llms.some(textFileOk);
    const robotsOk = textFileOk(robots);
    if (llmsOk && robotsOk) continue;
    const missing = [!llmsOk ? '/llms.txt' : '', !robotsOk ? '/robots.txt' : ''].filter(Boolean);
    f.push(cand({
      rule_id: 'site.llms_missing', project_id: pr.id, category: 'corrective', severity: 'medium',
      title: `${pr.name}: ${missing.join(' e ')} fora do ar`,
      detail: `Arquivo(s) de descoberta não encontrado(s): ${missing.join(', ')}.`,
      suggested_action: 'Regenerar os arquivos de descoberta pelo plugin (a correção chama o plugin do próprio site).',
      fix_action: { type: 'plugin_discovery_refresh', params: { projectId: pr.id } },
      evidence: { llms_status: llms.map((p) => p.status), robots_status: robots.status },
    }));
  }
  return out(f);
}
export async function ruleSiteSchemaThin(ctx: AuditContext): Promise<RuleOutput> {
  const f: Candidate[] = [];
  const inconclusive: string[] = [];
  for (const pr of ctx.projects) {
    if (!pr.base_url) continue;
    const key = fingerprintOf('site.schema_thin', pr.id, '');
    const page = await homepage(ctx, pr);
    if (!page.ok || page.truncated) { inconclusive.push(key); continue; }
    if (hasStrongOrganizationNode(page.bodySample)) continue;
    f.push(cand({
      rule_id: 'site.schema_thin', project_id: pr.id, category: 'improvement', severity: 'low',
      title: `${pr.name}: dados estruturados da organização incompletos na página inicial`,
      detail: 'Não foi encontrado um nó Organization/LegalService com nome, endereço do site (url) e perfis oficiais (sameAs).',
      suggested_action: 'Preencher o perfil de schema do projeto e aplicá-lo na página inicial.',
    }));
  }
  return out(f, inconclusive);
}
export const RUNTIME_FUNCTIONS = ['nexus-intelligence', 'zica-signals'] as const;
export async function ruleRuntimeFunctionDown(ctx: AuditContext): Promise<RuleOutput> {
  if (!systemOn(ctx)) return out([]);
  if (!ctx.functionsBaseUrl) throw new ContextUnavailable('functions_base_url');
  const f: Candidate[] = [];
  for (const name of RUNTIME_FUNCTIONS) {
    const r = await ctx.probe(`${ctx.functionsBaseUrl.replace(/\/+$/, '')}/functions/v1/${name}`);
    if (r.status !== 0 && r.status < 500) continue; // 401/405/404 sem token são esperados: a função respondeu
    f.push(cand({
      rule_id: 'runtime.function_down', subject: name, category: 'corrective', severity: 'critical',
      title: `Função "${name}" não está respondendo`,
      detail: r.status === 0 ? 'Sem resposta (tempo esgotado ou falha de conexão).' : `A função respondeu HTTP ${r.status}.`,
      suggested_action: 'Acionar o suporte da plataforma; conferir os logs da função e o status do Supabase.',
      evidence: { http_status: r.status, ms: r.ms },
    }));
  }
  return out(f);
}
export function ruleRuntimeCronFailing(ctx: AuditContext): RuleOutput {
  if (!systemOn(ctx)) return out([]);
  if (!ctx.cronHealth) throw new ContextUnavailable('cron_health');
  const f: Candidate[] = [];
  for (const j of ctx.cronHealth) {
    if (!/^(zica|nexus)-/.test(j.jobname) || j.failures < 3) continue;
    f.push(cand({
      rule_id: 'runtime.cron_failing', subject: j.jobname, category: 'preventive', severity: 'medium',
      title: `Agendamento "${j.jobname}" com falhas repetidas`,
      detail: `${j.failures} falhas em ${j.runs} execuções nas últimas 24 h${j.active ? '' : ' (job inativo)'}.`,
      suggested_action: 'Investigar o histórico em cron.job_run_details e a função chamada.',
      evidence: { runs: j.runs, failures: j.failures, last_status: j.last_status, last_run: j.last_run },
    }));
  }
  return out(f);
}
export function ruleSecurityAnonWrite(ctx: AuditContext): RuleOutput {
  if (!systemOn(ctx)) return out([]);
  if (!ctx.securityGrants) throw new ContextUnavailable('security_grants');
  const g = ctx.securityGrants;
  if (!(g.anon_write_tables > 0)) return out([]);
  return out([cand({
    rule_id: 'security.anon_write', category: 'preventive', severity: 'high',
    title: `${g.anon_write_tables} tabela(s) aceitam escrita anônima`,
    detail: `O papel "anon" tem INSERT/UPDATE/DELETE/TRUNCATE em: ${g.sample.slice(0, 10).join(', ')}${g.anon_write_tables > g.sample.length ? '…' : ''}.`,
    suggested_action: 'Revogar a escrita anônima nas tabelas listadas (sem correção automática: revise cada uma).',
    evidence: { anon_write_tables: g.anon_write_tables, sample: g.sample.slice(0, 10) },
  })]);
}
export function ruleSecurityRlsOff(ctx: AuditContext): RuleOutput {
  if (!systemOn(ctx)) return out([]);
  if (!ctx.securityGrants) throw new ContextUnavailable('security_grants');
  const g = ctx.securityGrants;
  if (!(g.rls_disabled_tables > 0)) return out([]);
  const sample = (g.rls_sample ?? []).slice(0, 10);
  return out([cand({
    rule_id: 'security.rls_off', category: 'preventive', severity: 'high',
    title: `${g.rls_disabled_tables} tabela(s) sem RLS`,
    detail: `Tabelas do esquema public sem Row Level Security${sample.length ? `: ${sample.join(', ')}` : ''}.`,
    suggested_action: 'Habilitar RLS e criar as políticas necessárias (sem correção automática).',
    evidence: { rls_disabled_tables: g.rls_disabled_tables, sample },
  })]);
}
export function ruleCostBudget80(ctx: AuditContext): RuleOutput {
  const p = ctx.program;
  if (!p || !(p.budget_usd_micros > 0)) return out([]);
  const used = p.consumed_usd_micros + p.reserved_usd_micros;
  const ratio = used / p.budget_usd_micros;
  if (ratio < 0.8) return out([]);
  const usd = (m: number) => `US$ ${(m / 1e6).toFixed(2)}`;
  return out([cand({
    rule_id: 'cost.budget_80', category: 'preventive', severity: 'high',
    title: ratio >= 1 ? 'Orçamento de execução paga esgotado' : 'Orçamento de execução paga acima de 80%',
    detail: `Consumido + reservado: ${usd(used)} de ${usd(p.budget_usd_micros)} (${(ratio * 100).toFixed(1)}%). O valor é um teto configurado, não a fatura do provedor.`,
    suggested_action: 'Ajustar o orçamento no painel de Liberação de execução paga ou desligar a execução.',
    evidence: { consumed_usd_micros: p.consumed_usd_micros, reserved_usd_micros: p.reserved_usd_micros, budget_usd_micros: p.budget_usd_micros, percent: Math.round(ratio * 1000) / 10 },
  })]);
}
export function ruleCostEnabledWithoutProvider(ctx: AuditContext): RuleOutput {
  const p = ctx.program;
  if (!p?.execution_enabled || p.providers_enabled.length > 0) return out([]);
  return out([cand({
    rule_id: 'cost.enabled_without_provider', category: 'corrective', severity: 'low',
    title: 'Execução paga ligada, sem nenhum provedor habilitado',
    detail: 'A execução está ligada, mas nenhum provedor foi habilitado; nada será executado.',
    suggested_action: 'Habilitar os provedores desejados ou desligar a execução.',
    fix_action: { type: 'open_route', params: { route: '/nexus/motores', section: 'execution_control' } },
  })]);
}
export function ruleExecutionEnabledInfo(ctx: AuditContext): RuleOutput {
  const p = ctx.program;
  if (!p?.execution_enabled) return out([]);
  return out([cand({
    rule_id: 'execution.enabled_info', category: 'improvement', severity: 'info',
    title: 'Execução paga está ligada',
    detail: `Provedores habilitados: ${p.providers_enabled.length ? p.providers_enabled.join(', ') : 'nenhum'}.`,
    suggested_action: 'Revisar o orçamento e desligar quando não estiver em uso.',
    evidence: { providers_enabled: p.providers_enabled, budget_usd_micros: p.budget_usd_micros },
  })]);
}

export const AUDIT_RULES: AuditRule[] = [
  { id: 'provider.never_verified', scope: 'org', run: ruleProviderNeverVerified },
  { id: 'provider.check_failed', scope: 'org', run: ruleProviderCheckFailed },
  { id: 'provider.latency_high', scope: 'org', run: ruleProviderLatencyHigh },
  { id: 'provider.quota_low', scope: 'org', run: ruleProviderQuotaLow },
  { id: 'provider.unused_30d', scope: 'org', run: ruleProviderUnused30d },
  { id: 'provider.free_not_connected', scope: 'org', run: ruleProviderFreeNotConnected },
  { id: 'search.sync_stale', scope: 'org', run: ruleSearchSyncStale },
  { id: 'search.no_data', scope: 'org', run: ruleSearchNoData },
  { id: 'ga4.not_connected', scope: 'org', run: ruleGa4NotConnected },
  { id: 'ga4.property_missing', scope: 'org', run: ruleGa4PropertyMissing },
  { id: 'ga4.sync_stale', scope: 'org', run: ruleGa4SyncStale },
  { id: 'ga4.no_data', scope: 'org', run: ruleGa4NoData },
  { id: 'content.internal_links_low', scope: 'org', run: ruleContentInternalLinksLow },
  { id: 'content.area_unclassified_high', scope: 'org', run: ruleContentAreaUnclassifiedHigh },
  { id: 'observatory.stale', scope: 'org', run: ruleObservatoryStale },
  { id: 'observatory.no_prompts', scope: 'org', run: ruleObservatoryNoPrompts },
  { id: 'signals.no_batch', scope: 'org', run: ruleSignalsNoBatch },
  { id: 'signals.snippet_missing', scope: 'org', run: ruleSignalsSnippetMissing },
  { id: 'plugin.outdated', scope: 'org', run: rulePluginOutdated },
  { id: 'plugin.unreachable', scope: 'org', run: rulePluginUnreachable },
  { id: 'site.llms_missing', scope: 'org', run: ruleSiteLlmsMissing },
  { id: 'site.schema_thin', scope: 'org', run: ruleSiteSchemaThin },
  { id: 'runtime.function_down', scope: 'system', run: ruleRuntimeFunctionDown },
  { id: 'runtime.cron_failing', scope: 'system', run: ruleRuntimeCronFailing },
  { id: 'security.anon_write', scope: 'system', run: ruleSecurityAnonWrite },
  { id: 'security.rls_off', scope: 'system', run: ruleSecurityRlsOff },
  { id: 'cost.budget_80', scope: 'org', run: ruleCostBudget80 },
  { id: 'cost.enabled_without_provider', scope: 'org', run: ruleCostEnabledWithoutProvider },
  { id: 'execution.enabled_info', scope: 'org', run: ruleExecutionEnabledInfo },
];

// ---------------------------------------------------------------------------
// Motor de achados
// ---------------------------------------------------------------------------
export type FindingRow = {
  id: string; organization_id: string; project_id: string | null; rule_id: string; subject: string; fingerprint: string;
  category: Category; severity: Severity; title: string; detail: string | null; suggested_action: string | null; fix_action: FixAction | null;
  evidence: Record<string, unknown>; status: FindingStatus; note: string | null; snoozed_until: string | null;
  first_seen_at: string; last_seen_at: string; resolved_at: string | null; occurrences: number;
};
export type NewFindingRow = Omit<FindingRow, 'id'>;
export type FindingPatch = Partial<Omit<FindingRow, 'id' | 'organization_id' | 'fingerprint' | 'rule_id'>>;
export type RuleEvaluation = { ruleId: string; ok: true; output: RuleOutput } | { ruleId: string; ok: false; error: string };

export type Reconciliation = {
  inserts: NewFindingRow[];
  updates: Array<{ id: string; patch: FindingPatch }>;
  opened: number;
  reopened: number;
  resolved: number;
};

/**
 * Concilia o resultado das regras com os achados existentes:
 * abre, deduplica por impressão digital, atualiza last_seen/occurrences, resolve sozinho, reabre, respeita `snoozed_until`.
 * Regras que falharam (ok:false) não alteram nada. Fingerprints "inconclusivos" nunca são resolvidos.
 */
export function reconcileFindings(organizationId: string, existing: FindingRow[], evaluations: RuleEvaluation[], now: Date): Reconciliation {
  const nowIso = now.toISOString();
  const byFp = new Map(existing.map((e) => [e.fingerprint, e]));
  const rec: Reconciliation = { inserts: [], updates: [], opened: 0, reopened: 0, resolved: 0 };
  for (const ev of evaluations) {
    if (!ev.ok) continue;
    const current = new Map<string, Candidate>();
    for (const c of ev.output.findings) current.set(fingerprintOf(c.rule_id, c.project_id, c.subject), c); // duplicata na mesma rodada: vale a última
    const inconclusive = new Set(ev.output.inconclusive);
    for (const [fp, c] of current) {
      const row = byFp.get(fp);
      const fields = {
        category: c.category, severity: c.severity, title: clip(c.title, 200), detail: clip(c.detail, 1000) || null,
        suggested_action: clip(c.suggested_action, 500) || null, fix_action: c.fix_action,
      };
      if (!row) {
        rec.inserts.push({
          organization_id: organizationId, project_id: c.project_id, rule_id: c.rule_id, subject: c.subject, fingerprint: fp, ...fields,
          evidence: c.evidence, status: 'open', note: null, snoozed_until: null, first_seen_at: nowIso, last_seen_at: nowIso, resolved_at: null, occurrences: 1,
        });
        rec.opened++;
        continue;
      }
      const evidence = { ...c.evidence, ...(row.evidence?.last_fix ? { last_fix: row.evidence.last_fix } : {}) };
      const patch: FindingPatch = { ...fields, evidence, last_seen_at: nowIso, occurrences: row.occurrences + 1 };
      if (row.status === 'resolved') {
        patch.status = 'open'; patch.resolved_at = null; patch.snoozed_until = null; patch.note = null;
        patch.evidence = { ...evidence, reopened_at: nowIso };
        rec.reopened++; rec.opened++;
      } else if (row.status === 'snoozed') {
        const until = ms(row.snoozed_until);
        if (until === null || until <= now.getTime()) { patch.status = 'open'; patch.snoozed_until = null; } // adiamento venceu
      }
      rec.updates.push({ id: row.id, patch });
    }
    // resolve o que sumiu (apenas desta regra, e só quando a avaliação foi conclusiva)
    for (const row of existing) {
      if (row.rule_id !== ev.ruleId || row.status === 'resolved' || current.has(row.fingerprint) || inconclusive.has(row.fingerprint)) continue;
      rec.updates.push({ id: row.id, patch: { status: 'resolved', resolved_at: nowIso, snoozed_until: null } });
      rec.resolved++;
    }
  }
  return rec;
}

// --- update_finding ---------------------------------------------------------
export type UpdateFindingInput = { status: 'acknowledged' | 'snoozed' | 'open'; snoozeHours?: number; note?: string };
export type UpdateParse = { ok: true; value: UpdateFindingInput } | { ok: false; error: string };
export function parseUpdateInput(body: Record<string, unknown>): UpdateParse {
  const status = body.status;
  if (status !== 'acknowledged' && status !== 'snoozed' && status !== 'open') return { ok: false, error: 'status_invalid' };
  let snoozeHours: number | undefined;
  if (status === 'snoozed') {
    snoozeHours = Number(body.snoozeHours);
    if (!Number.isFinite(snoozeHours) || snoozeHours < 1 || snoozeHours > 720) return { ok: false, error: 'snooze_hours_invalid' };
  }
  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string' || body.note.length > 500) return { ok: false, error: 'note_invalid' };
    note = body.note.trim();
  }
  return { ok: true, value: { status, snoozeHours, note } };
}
/** Patch para a mudança manual de estado; achados resolvidos não podem ser alterados. */
export function buildFindingUpdate(finding: Pick<FindingRow, 'status'>, input: UpdateFindingInput, now: Date): { ok: true; patch: FindingPatch } | { ok: false; error: string } {
  if (finding.status === 'resolved') return { ok: false, error: 'finding_resolved' };
  const patch: FindingPatch = { status: input.status, snoozed_until: input.status === 'snoozed' ? new Date(now.getTime() + (input.snoozeHours as number) * HOUR).toISOString() : null };
  if (input.note !== undefined) patch.note = input.note === '' ? null : input.note;
  return { ok: true, patch };
}

// --- overview ---------------------------------------------------------------
export type RunRow = { id: number; trigger: string; started_at: string; finished_at: string | null; status: string | null; rules_evaluated: number; findings_opened: number; findings_resolved: number; detail?: unknown };
export function buildOverview(findings: FindingRow[], runs: RunRow[], now: Date) {
  const sinceMs = now.getTime() - 7 * DAY;
  const visible = findings.filter((f) => f.status !== 'resolved' || (ms(f.resolved_at) ?? 0) >= sinceMs);
  const active = visible.filter((f) => f.status === 'open' || f.status === 'acknowledged');
  const counts = {
    open: { corrective: 0, preventive: 0, improvement: 0 },
    by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    resolved_7d: visible.filter((f) => f.status === 'resolved').length,
  };
  for (const f of active) { counts.open[f.category]++; counts.by_severity[f.severity]++; }
  const statusRank: Record<FindingStatus, number> = { open: 0, acknowledged: 1, snoozed: 2, resolved: 3 };
  const sorted = [...visible].sort((a, b) =>
    statusRank[a.status] - statusRank[b.status] || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (ms(b.last_seen_at) ?? 0) - (ms(a.last_seen_at) ?? 0));
  const last = runs[0] ?? null;
  return {
    generated_at: now.toISOString(),
    last_run: last ? { id: last.id, trigger: last.trigger, started_at: last.started_at, finished_at: last.finished_at, status: last.status, rules_evaluated: last.rules_evaluated, findings_opened: last.findings_opened, findings_resolved: last.findings_resolved } : null,
    counts,
    findings: sorted.slice(0, 200).map((f) => ({
      id: f.id, rule_id: f.rule_id, project_id: f.project_id, category: f.category, severity: f.severity, title: f.title, detail: f.detail,
      suggested_action: f.suggested_action, fix_action: f.fix_action, status: f.status, note: f.note, first_seen_at: f.first_seen_at, last_seen_at: f.last_seen_at,
      resolved_at: f.resolved_at, occurrences: f.occurrences, snoozed_until: f.snoozed_until, evidence: f.evidence,
    })),
    runs: runs.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// Rede segura: bloqueio de chamadas pagas, SSRF, sondagens
// ---------------------------------------------------------------------------
/** true quando a requisição consumiria crédito de um provedor pago (ou não é uma leitura gratuita conhecida). */
export function isPaidProviderRequest(url: string, method = 'GET'): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return true; }
  const host = u.hostname.toLowerCase(), path = u.pathname, m = method.toUpperCase();
  if (host === 'google.serper.dev' || host.endsWith('.serper.dev') || host === 'serper.dev') return true;
  if (host === 'api.search.brave.com') return true;
  if (host === 'api.perplexity.ai') return true;
  if (host === 'serpapi.com') return !(m === 'GET' && (path === '/account.json' || path === '/account'));
  if (host === 'api.dataforseo.com') return !(m === 'GET' && path === '/v3/appendix/user_data');
  if (host === 'api.openai.com') return !(m === 'GET' && (path === '/v1/models' || path.startsWith('/v1/models/')));
  if (host === 'api.anthropic.com') return !(m === 'GET' && path.startsWith('/v1/models'));
  if (host === 'generativelanguage.googleapis.com') return !(m === 'GET' && !path.includes(':') && /\/models(\/|$)/.test(path));
  return false;
}

export function createGuardedFetch(inner: typeof fetch, opts: { now?: () => number; deadlineMs?: number; onRequest?: (url: string, method: string) => void } = {}): typeof fetch {
  const now = opts.now ?? Date.now;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = req?.url ?? String(input);
    const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
    if (opts.deadlineMs !== undefined && now() > opts.deadlineMs) return Promise.reject(new AuditBudgetExceeded());
    let proto = '';
    try { proto = new URL(url).protocol; } catch { /* fallthrough */ }
    if (proto !== 'https:' && proto !== 'http:') return Promise.reject(new Error('audit_url_not_allowed'));
    if (isPaidProviderRequest(url, method)) return Promise.reject(new Error('audit_paid_call_blocked'));
    opts.onRequest?.(url, method);
    return inner(input, init);
  }) as typeof fetch;
}

export function isPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIp(mapped[1]);
  const m4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (m4) {
    const [a, b, c] = [Number(m4[1]), Number(m4[2]), Number(m4[3])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v.includes(':')) return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  return false;
}
/** Valida um endereço de sondagem: https, sem credenciais, sem porta, sem IP literal nem nomes internos. */
export function validateProbeUrl(raw: string, trustedHosts: string[] = []): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (trustedHosts.map((h) => h.toLowerCase()).includes(host)) return u;
  if (!host.includes('.') || /^\[/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  if (host === 'localhost' || /\.(local|localhost|internal|lan|home|corp|test|invalid)$/.test(host)) return null;
  return u;
}

export type ProbeOptions = {
  fetchFn: typeof fetch;
  now?: () => number;
  deadlineMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  maxConcurrent?: number;
  trustedHosts?: string[];
  resolveDns?: (host: string) => Promise<string[]>;
};
async function readCapped(res: Response, max: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '', bytes = 0, truncated = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) { text += dec.decode(value.subarray(0, Math.max(0, value.byteLength - (bytes - max)))); truncated = true; await reader.cancel().catch(() => {}); break; }
    text += dec.decode(value, { stream: true });
  }
  return { text, truncated };
}

/** Sondagem GET pública: segue até 3 redirecionamentos revalidando cada destino, cache por URL, no máximo `maxConcurrent` simultâneas. */
export function makeProbe(o: ProbeOptions): (url: string) => Promise<ProbeResult> {
  const now = o.now ?? Date.now;
  const timeoutMs = o.timeoutMs ?? 8000, maxBytes = o.maxBytes ?? 512 * 1024, limit = o.maxConcurrent ?? 5;
  const trusted = o.trustedHosts ?? [];
  const cache = new Map<string, Promise<ProbeResult>>();
  let running = 0;
  const waiters: Array<() => void> = [];
  const acquire = async () => { if (running >= limit) await new Promise<void>((r) => waiters.push(r)); running++; };
  const release = () => { running--; waiters.shift()?.(); };

  async function once(start: string): Promise<ProbeResult> {
    const t0 = now();
    const fail = (status: number, error: string): ProbeResult => ({ ok: false, status, ms: now() - t0, bodySample: '', error });
    let current = start;
    for (let hop = 0; hop <= 3; hop++) {
      const u = validateProbeUrl(current, trusted);
      if (!u) return fail(0, 'blocked_url');
      if (o.resolveDns && !trusted.includes(u.hostname.toLowerCase())) {
        let ips: string[];
        try { ips = await o.resolveDns(u.hostname); } catch { return fail(0, 'dns_failed'); }
        if (!ips.length) return fail(0, 'dns_failed');
        if (ips.some(isPrivateIp)) return fail(0, 'blocked_ip');
      }
      let res: Response;
      try {
        res = await o.fetchFn(u.href, { method: 'GET', redirect: 'manual', headers: { Accept: 'text/html,application/json,text/plain,*/*;q=0.5', 'User-Agent': 'ZicaPosts-NexusAudit/1.0' }, signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        if (e instanceof AuditBudgetExceeded) throw e;
        return fail(0, e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'network');
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        await res.body?.cancel().catch(() => {});
        if (!loc) return { ok: false, status: res.status, ms: now() - t0, bodySample: '', error: 'redirect_without_location' };
        try { current = new URL(loc, u).href; } catch { return fail(0, 'blocked_url'); }
        continue;
      }
      let body = { text: '', truncated: false };
      try { body = await readCapped(res, maxBytes); } catch { /* corpo ilegível: segue só com o status */ }
      return { ok: res.status >= 200 && res.status < 300, status: res.status, ms: now() - t0, bodySample: body.text, truncated: body.truncated };
    }
    return fail(0, 'too_many_redirects');
  }

  return (url: string) => {
    if (o.deadlineMs !== undefined && now() > o.deadlineMs) return Promise.reject(new AuditBudgetExceeded());
    let p = cache.get(url);
    if (!p) {
      p = (async () => {
        await acquire();
        try {
          if (o.deadlineMs !== undefined && now() > o.deadlineMs) throw new AuditBudgetExceeded();
          return await once(url);
        } finally { release(); }
      })();
      cache.set(url, p);
    }
    return p;
  };
}

// ---------------------------------------------------------------------------
// Fix actions (lista branca) e plugin_discovery_refresh
// ---------------------------------------------------------------------------
export type FixParse = { ok: true; fix: FixAction } | { ok: false; error: string };
export function parseFixAction(value: unknown): FixParse {
  if (!value || typeof value !== 'object') return { ok: false, error: 'no_fix_available' };
  const v = value as Record<string, unknown>;
  if (!(FIX_TYPES as readonly string[]).includes(String(v.type))) return { ok: false, error: 'fix_type_not_allowed' };
  const params = v.params && typeof v.params === 'object' && !Array.isArray(v.params) ? v.params as Record<string, unknown> : {};
  return { ok: true, fix: { type: v.type as FixType, params } };
}

/** POST …/zica-posts/v1/discovery/refresh no WordPress do projeto, com `fetchFn` injetado (mesmo contrato de pluginRequest). */
export async function pluginDiscoveryRefresh(fetchFn: typeof fetch, baseUrl: string, apiKey: string, namespace: string): Promise<{ ok: boolean; status: number; detail?: string }> {
  const base = baseUrl.replace(/\/+$/, '');
  let origin: string;
  try { const u = new URL(base); if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, status: 0, detail: 'wordpress_base_not_https' }; origin = u.origin; } catch { return { ok: false, status: 0, detail: 'wordpress_base_invalid' }; }
  const ns = namespace || 'zica-posts/v1';
  let last: { ok: boolean; status: number; detail?: string } = { ok: false, status: 0, detail: 'unreachable' };
  for (const endpoint of [`${base}/wp-json/${ns}/discovery/refresh`, `${base}/?rest_route=/${ns}/discovery/refresh`]) {
    if (new URL(endpoint).origin !== origin) continue;
    try {
      const r = await fetchFn(endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-ZICA-POSTS-Key': apiKey, Accept: 'application/json' }, body: '{}', signal: AbortSignal.timeout(30_000) });
      const text = await r.text();
      let data: Record<string, unknown> | null = null;
      try { data = JSON.parse(text); } catch { /* HTML */ }
      if (r.ok && data) return { ok: true, status: r.status };
      if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, detail: 'api_key_rejected' };
      last = { ok: false, status: r.status, detail: clip(data?.message ?? data?.error ?? `HTTP ${r.status}`, 160) };
    } catch (e) {
      if (e instanceof AuditBudgetExceeded) throw e;
      last = { ok: false, status: 0, detail: 'unreachable' };
    }
  }
  return last;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------
export type HealthCheckOpts = { organizationId: string; triggeredBy: string | null; providers?: string[]; confirmCost: false; fetchFn: typeof fetch };
export type HealthCheckResult = { provider: string; ok: boolean; skipped?: string; latency_ms?: number; http_status?: number; detail?: string };
export type SyncCall = { projectId: string; source: 'gsc' | 'bing'; days: number; domain: string; property?: string };
export type SyncCallResult = { ok: boolean; rows_upserted: number; error?: string };
export type AnalyticsSyncCall = { projectId: string; days: number; property: string };

export type BaseData = {
  program: ProgramCtx | null;
  projects: ProjectCtx[];
  securityGrants: SecurityGrants | null;
  cronHealth: CronJobHealth[] | null;
};
export interface AuditStore {
  loadBase(organizationId: string): Promise<BaseData>;
  /** Lança se a visão de provedores estiver indisponível. */
  loadProviders(organizationId: string): Promise<ProviderSnapshot[]>;
  hasRunInProgress(organizationId: string, sinceIso: string): Promise<boolean>;
  lastManualRunAt(organizationId: string): Promise<string | null>;
  insertRun(organizationId: string, trigger: 'schedule' | 'manual', startedAtIso: string): Promise<number>;
  finishRun(id: number, patch: { finished_at: string; status: 'ok' | 'partial' | 'error'; rules_evaluated: number; findings_opened: number; findings_resolved: number; detail: Record<string, unknown> }): Promise<void>;
  loadFindings(organizationId: string, ruleIds: string[]): Promise<FindingRow[]>;
  insertFindings(rows: NewFindingRow[]): Promise<void>;
  updateFinding(id: string, patch: FindingPatch): Promise<void>;
  markSync(organizationId: string, projectId: string, source: 'gsc' | 'bing' | 'ga4', full: boolean): Promise<void>;
}
export type AuditDeps = {
  store: AuditStore;
  now: () => number;
  pluginVersion: string;
  functionsBaseUrl: string | null;
  freeHealthProviders: readonly string[];
  /** `fetchFn` já vem protegido por createGuardedFetch. */
  healthChecks: (opts: HealthCheckOpts) => Promise<HealthCheckResult[]>;
  syncSearch: (call: SyncCall, fetchFn: typeof fetch) => Promise<SyncCallResult>;
  /** GA4 (gratuito). Opcional: sem ele o executor não sincroniza o GA4. */
  syncAnalytics?: (call: AnalyticsSyncCall, fetchFn: typeof fetch) => Promise<SyncCallResult>;
  /** Cria a sondagem (cache + concorrência + prazo) para esta execução. */
  makeProbe: (deadlineMs: number) => (url: string) => Promise<ProbeResult>;
  guardedFetch: (deadlineMs: number) => typeof fetch;
  rules?: AuditRule[];
};
export type RunSummary = { id: number | null; trigger: 'schedule' | 'manual'; started_at: string; finished_at: string; status: 'ok' | 'partial' | 'error'; rules_evaluated: number; findings_opened: number; findings_resolved: number; detail: Record<string, unknown> };

export const ORG_BUDGET_MS = 50_000;
export const SYNC_WINDOW_MS = 30_000;
export const HEALTH_REFRESH_MS = 55 * 60_000;
const IN_PROGRESS_MS = 2 * 60_000;
const MAX_SYNCS_PER_RUN = 4;
const safeErr = (e: unknown) => clip(e instanceof Error ? e.message : e, 160).replace(/(api[_-]?key|token|secret|authorization)[=:]\s*\S+/gi, '$1=[oculto]');

export type RunOptions = { trigger: 'schedule' | 'manual'; actorUserId?: string | null; onlyRules?: RuleId[]; skipActions?: boolean; recordRun?: boolean };
export class AuditBusyError extends Error { constructor() { super('audit_in_progress'); } }

export async function runAuditForOrganization(deps: AuditDeps, organizationId: string, opts: RunOptions): Promise<RunSummary> {
  const t0 = deps.now();
  const startedIso = new Date(t0).toISOString();
  const record = opts.recordRun !== false;
  if (record && await deps.store.hasRunInProgress(organizationId, new Date(t0 - IN_PROGRESS_MS).toISOString())) throw new AuditBusyError();
  const runId = record ? await deps.store.insertRun(organizationId, opts.trigger, startedIso) : null;
  const detail: Record<string, unknown> = { rule_errors: [], health_checked: [], syncs: [] };
  const ruleErrors = detail.rule_errors as Array<{ rule_id: string; error: string }>;
  let status: 'ok' | 'partial' | 'error' = 'ok';
  let opened = 0, resolved = 0, evaluatedCount = 0;
  try {
    const ruleset = (deps.rules ?? AUDIT_RULES).filter((r) => !opts.onlyRules || opts.onlyRules.includes(r.id));
    let base = await deps.store.loadBase(organizationId);
    let providers: ProviderSnapshot[] | null = null;
    try { providers = await deps.store.loadProviders(organizationId); } catch (e) { detail.providers_error = safeErr(e); }

    if (!opts.skipActions) {
      const actions = deps.guardedFetch(t0 + SYNC_WINDOW_MS);
      // 1) testes de saúde GRATUITOS dos provedores sem teste recente (nunca com custo: confirmCost é sempre false)
      if (providers) {
        const due = providers.filter((p) => p.credential.stored && deps.freeHealthProviders.includes(p.id) && !isCostProvider(p.id)
          && (!p.last_health || deps.now() - (ms(p.last_health.checked_at) ?? 0) > HEALTH_REFRESH_MS)).map((p) => p.id);
        if (due.length) {
          try {
            const res = await deps.healthChecks({ organizationId, triggeredBy: opts.actorUserId ?? null, providers: due, confirmCost: false, fetchFn: actions });
            detail.health_checked = res.map((r) => ({ provider: r.provider, ok: r.ok, skipped: r.skipped ?? null }));
            providers = await deps.store.loadProviders(organizationId).catch(() => providers);
          } catch (e) { detail.health_error = safeErr(e); status = 'partial'; }
        }
      }
      // 2) sincronização de busca (GSC/Bing) a cada 12 h (janela de 7 dias) e 90 dias uma vez por semana
      const syncs = detail.syncs as Array<Record<string, unknown>>;
      let done = 0;
      for (const [source, providerId] of SOURCES) {
        const cred = providers?.find((p) => p.id === providerId && p.credential.stored && p.credential.status === 'active');
        if (!cred) continue;
        for (const pr of base.projects) {
          if (done >= MAX_SYNCS_PER_RUN || deps.now() > t0 + SYNC_WINDOW_MS) break;
          const domain = pr.domain || (pr.base_url ? hostOf(pr.base_url) : '');
          if (!domain) continue;
          const st = pr.search[source];
          const last = ms(st.last_synced_at);
          if (last !== null && deps.now() - last < 12 * HOUR) continue;
          const lastFull = ms(st.last_full_sync_at);
          const full = lastFull === null || deps.now() - lastFull >= 7 * DAY;
          done++;
          try {
            const r = await deps.syncSearch({ projectId: pr.id, source, days: full ? 90 : 7, domain, property: pr.gsc_property ?? undefined }, actions);
            syncs.push({ project_id: pr.id, source, ok: r.ok, rows: r.rows_upserted, days: full ? 90 : 7, error: r.error ?? null });
            if (r.ok) await deps.store.markSync(organizationId, pr.id, source, full);
          } catch (e) { syncs.push({ project_id: pr.id, source, ok: false, rows: 0, error: safeErr(e) }); }
        }
      }
      // 2b) GA4 (gratuito): mesma cadência (12 h com janela de 7 dias; 90 dias uma vez por semana) e o mesmo teto de sincronizações por execução
      const ga4Cred = providers?.find((p) => p.id === 'ga4' && p.credential.stored && p.credential.status === 'active');
      if (deps.syncAnalytics && ga4Cred) {
        for (const pr of base.projects) {
          if (done >= MAX_SYNCS_PER_RUN || deps.now() > t0 + SYNC_WINDOW_MS) break;
          if (!pr.ga4_property_id) continue;
          const last = ms(pr.analytics.last_synced_at);
          if (last !== null && deps.now() - last < 12 * HOUR) continue;
          const lastFull = ms(pr.analytics.last_full_sync_at);
          const full = lastFull === null || deps.now() - lastFull >= 7 * DAY;
          done++;
          try {
            const r = await deps.syncAnalytics({ projectId: pr.id, days: full ? 90 : 7, property: pr.ga4_property_id }, actions);
            syncs.push({ project_id: pr.id, source: 'ga4', ok: r.ok, rows: r.rows_upserted, days: full ? 90 : 7, error: r.error ?? null });
            if (r.ok) await deps.store.markSync(organizationId, pr.id, 'ga4', full);
          } catch (e) { syncs.push({ project_id: pr.id, source: 'ga4', ok: false, rows: 0, error: safeErr(e) }); }
        }
      }
      if (done) base = await deps.store.loadBase(organizationId);
    }

    // 3) regras
    const deadline = t0 + ORG_BUDGET_MS;
    const probe = deps.makeProbe(deadline);
    const ctx: AuditContext = {
      now: new Date(deps.now()), organizationId, pluginVersion: deps.pluginVersion, providers, program: base.program, projects: base.projects,
      securityGrants: base.securityGrants, cronHealth: base.cronHealth, functionsBaseUrl: deps.functionsBaseUrl, probe,
    };
    const settled = await Promise.all(ruleset.map(async (r): Promise<RuleEvaluation> => {
      try { return { ruleId: r.id, ok: true, output: await r.run(ctx) }; }
      catch (e) { return { ruleId: r.id, ok: false, error: safeErr(e) }; }
    }));
    for (const e of settled) if (!e.ok) ruleErrors.push({ rule_id: e.ruleId, error: e.error });
    evaluatedCount = settled.filter((e) => e.ok).length;
    if (ruleErrors.some((e) => e.error.includes('audit_budget_exceeded'))) detail.budget_exceeded = true;

    // 4) motor de achados
    const existing = await deps.store.loadFindings(organizationId, ruleset.map((r) => r.id));
    const plan = reconcileFindings(organizationId, existing, settled, ctx.now);
    if (plan.inserts.length) await deps.store.insertFindings(plan.inserts);
    for (let i = 0; i < plan.updates.length; i += 10) {
      await Promise.all(plan.updates.slice(i, i + 10).map((u) => deps.store.updateFinding(u.id, u.patch)));
    }
    opened = plan.opened; resolved = plan.resolved;
    if (ruleErrors.length) status = ruleErrors.length >= ruleset.length ? 'error' : 'partial';
  } catch (e) {
    status = 'error';
    detail.error = safeErr(e);
  }
  detail.duration_ms = deps.now() - t0;
  const finished = new Date(deps.now()).toISOString();
  if (runId !== null) {
    await deps.store.finishRun(runId, { finished_at: finished, status, rules_evaluated: evaluatedCount, findings_opened: opened, findings_resolved: resolved, detail });
  }
  return { id: runId, trigger: opts.trigger, started_at: startedIso, finished_at: finished, status, rules_evaluated: evaluatedCount, findings_opened: opened, findings_resolved: resolved, detail };
}
const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ''; } };

/** Modo cron: audita as organizações em sequência, mais antigas primeiro, parando de iniciar novas ao esgotar o orçamento total. */
export async function runCron(o: {
  organizationIds: string[];
  lastRunAt: Record<string, string | undefined>;
  runOne: (organizationId: string) => Promise<RunSummary>;
  now: () => number;
  totalBudgetMs?: number;
}): Promise<{ organizations: number; findings_opened: number; findings_resolved: number; skipped: number; errors: number }> {
  const t0 = o.now(), total = o.totalBudgetMs ?? 80_000;
  const order = [...o.organizationIds].sort((a, b) => (ms(o.lastRunAt[a]) ?? 0) - (ms(o.lastRunAt[b]) ?? 0));
  const r = { organizations: 0, findings_opened: 0, findings_resolved: 0, skipped: 0, errors: 0 };
  for (const id of order) {
    if (o.now() - t0 > total) { r.skipped++; continue; }
    try {
      const s = await o.runOne(id);
      r.organizations++; r.findings_opened += s.findings_opened; r.findings_resolved += s.findings_resolved;
      if (s.status === 'error') r.errors++;
    } catch (e) {
      if (e instanceof AuditBusyError) r.skipped++; else r.errors++;
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Normalização de dados vindos do banco (puro, tolerante a variações de formato)
// ---------------------------------------------------------------------------
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const asRec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Aceita o retorno de `nexus_providers_overview` (array na raiz ou em `.providers`; saúde em `last_health` ou `health.last`). */
export function normalizeProviders(raw: unknown): ProviderSnapshot[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(asRec(raw).providers) ? asRec(raw).providers as unknown[] : [];
  const result: ProviderSnapshot[] = [];
  for (const item of list) {
    const o = asRec(item);
    const id = strOrNull(o.provider) ?? strOrNull(o.id);
    if (!id) continue;
    const cred = asRec(o.credential), health = asRec(o.health), usage = asRec(o.usage);
    const lastRaw = o.last_health ?? health.last;
    const l = asRec(lastRaw);
    const last: ProviderHealth | null = lastRaw && typeof l.checked_at === 'string'
      ? {
        checked_at: l.checked_at, ok: l.ok === true, latency_ms: numOrNull(l.latency_ms), http_status: numOrNull(l.http_status), detail: strOrNull(l.detail),
        quota: l.quota && typeof l.quota === 'object' ? l.quota as ProviderQuota : null, cost_micros: num(l.cost_micros),
      }
      : null;
    result.push({
      id,
      credential: { stored: cred.stored === true, last_four: strOrNull(cred.last_four), status: strOrNull(cred.status), updated_at: strOrNull(cred.updated_at) },
      last_health: last,
      checks_7d: num(o.checks_7d ?? health.checks_7d),
      ok_7d: num(o.ok_7d ?? health.ok_7d),
      avg_latency_ms_7d: numOrNull(o.avg_latency_ms_7d ?? health.avg_latency_ms_7d),
      usage: { valid_30d: num(usage.valid_30d), failed_30d: num(usage.failed_30d), uncertain_30d: num(usage.uncertain_30d), last_success_at: strOrNull(usage.last_success_at) },
    });
  }
  return result;
}

export function normalizeProgram(row: Record<string, unknown> | null | undefined): ProgramCtx | null {
  if (!row) return null;
  const settings = asRec(row.settings);
  return {
    execution_enabled: row.execution_enabled === true,
    budget_usd_micros: num(row.budget_usd_micros), reserved_usd_micros: num(row.reserved_usd_micros), consumed_usd_micros: num(row.consumed_usd_micros),
    providers_enabled: Array.isArray(settings.providers_enabled) ? settings.providers_enabled.filter((x): x is string => typeof x === 'string') : [],
    system_rules: settings.audit_system_rules !== false,
  };
}

const emptySearch = (): SearchSourceState => ({ rows: 0, last_day: null, last_synced_at: null, last_full_sync_at: null });
function normalizeSearch(v: unknown): SearchSourceState {
  const o = asRec(v);
  return { rows: num(o.rows), last_day: strOrNull(o.last_day), last_synced_at: strOrNull(o.last_synced_at), last_full_sync_at: strOrNull(o.last_full_sync_at) };
}

/** Une as linhas de `projects` com as estatísticas de `nexus_audit_project_stats`. */
export function buildProjects(
  rows: Array<Record<string, unknown>>,
  stats: unknown,
  isPluginMode: (row: Record<string, unknown>) => boolean,
  defaultNamespace = 'zica-posts/v1',
): ProjectCtx[] {
  const statById = new Map<string, Record<string, unknown>>();
  for (const s of Array.isArray(stats) ? stats : []) { const o = asRec(s); if (typeof o.project_id === 'string') statById.set(o.project_id, o); }
  return rows.filter((r) => typeof r.id === 'string').map((r) => {
    const id = String(r.id);
    const st = statById.get(id) ?? {};
    const wp = typeof r.wordpress_url === 'string' ? r.wordpress_url.trim().replace(/\/+$/, '') : '';
    const domain = typeof r.domain === 'string' ? r.domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : '';
    const base = wp || (domain ? `https://${domain}` : null);
    const key = asRec(st.site_key);
    const search = asRec(st.search);
    const gscProp = asRec(r.commercial_info).gsc_property;
    const ga4Raw = asRec(r.commercial_info).ga4_property_id ?? st.ga4_property_id;
    const ga4Id = typeof ga4Raw === 'string' && /^\d{5,15}$/.test(ga4Raw.trim()) ? ga4Raw.trim() : null;
    const ci = asRec(st.content_index);
    return {
      id, name: typeof r.name === 'string' && r.name ? r.name : 'Projeto', domain: domain || null, base_url: base,
      plugin_mode: isPluginMode(r), plugin_namespace: typeof r.wordpress_plugin_namespace === 'string' && r.wordpress_plugin_namespace ? r.wordpress_plugin_namespace : defaultNamespace,
      gsc_property: typeof gscProp === 'string' && gscProp.trim() ? gscProp.trim() : null,
      prompt_sets: num(st.prompt_sets), prompts: num(st.prompts), last_observation_at: strOrNull(st.last_observation_at),
      site_key: typeof key.site_id === 'string' ? { site_id: key.site_id, created_at: String(key.created_at ?? ''), last_batch_at: strOrNull(key.last_batch_at) } : null,
      search: { gsc: search.gsc ? normalizeSearch(search.gsc) : emptySearch(), bing: search.bing ? normalizeSearch(search.bing) : emptySearch() },
      ga4_property_id: ga4Id,
      analytics: st.ga4 ? normalizeSearch(st.ga4) : emptySearch(),
      content_index: { total: num(ci.total), avg_internal_links: numOrNull(ci.internal_links_avg), unclassified: num(ci.unclassified) },
    };
  });
}
export function normalizeSecurityGrants(raw: unknown): SecurityGrants | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = asRec(raw);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { anon_write_tables: num(o.anon_write_tables), sample: arr(o.sample), rls_disabled_tables: num(o.rls_disabled_tables), rls_sample: arr(o.rls_sample) };
}
export function normalizeCronHealth(raw: unknown): CronJobHealth[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((j) => { const o = asRec(j); return { jobname: String(o.jobname ?? ''), active: o.active === true, runs: num(o.runs), failures: num(o.failures), last_status: strOrNull(o.last_status), last_run: strOrNull(o.last_run) }; });
}
