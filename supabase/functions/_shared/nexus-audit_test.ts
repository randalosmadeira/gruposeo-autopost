/**
 * Testes do motor de auditoria (regras puras, achados, sondagens seguras, orquestrador e garantia de "nunca chamada paga").
 * Executar com: deno test supabase/functions/_shared/nexus-audit_test.ts
 */
import { assert, assertEquals, assertFalse, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  AUDIT_RULES, AuditBusyError, AuditBudgetExceeded, buildFindingUpdate, buildOverview, buildProjects, compareVersions, ContextUnavailable, createGuardedFetch,
  extractJsonLd, fingerprintOf, hasStrongOrganizationNode, isPaidProviderRequest, isPrivateIp, makeProbe, normalizeCronHealth, normalizeProgram, normalizeProviders,
  normalizeSecurityGrants, parseFixAction, parseUpdateInput, pluginDiscoveryRefresh, reconcileFindings, runAuditForOrganization, runCron, textFileOk, validateProbeUrl,
  ruleCostBudget80, ruleCostEnabledWithoutProvider, ruleExecutionEnabledInfo, ruleObservatoryNoPrompts, ruleObservatoryStale, rulePluginOutdated, rulePluginUnreachable,
  ruleProviderCheckFailed, ruleProviderFreeNotConnected, ruleProviderLatencyHigh, ruleProviderNeverVerified, ruleProviderQuotaLow, ruleProviderUnused30d,
  ruleRuntimeCronFailing, ruleRuntimeFunctionDown, ruleSearchNoData, ruleSearchSyncStale, ruleSecurityAnonWrite, ruleSecurityRlsOff, ruleSignalsNoBatch,
  ruleSignalsSnippetMissing, ruleSiteLlmsMissing, ruleSiteSchemaThin,
  type AuditContext, type AuditDeps, type AuditRule, type AuditStore, type BaseData, type FindingPatch, type FindingRow, type NewFindingRow, type ProbeResult,
  type ProjectCtx, type ProviderSnapshot, type RuleEvaluation, type RuleOutput,
} from './nexus-audit.ts';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const ORG = '11111111-1111-4111-8111-111111111111';
const PRJ = '22222222-2222-4222-8222-222222222222';
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

// ---------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------
const okProbe = (body = '', status = 200): ProbeResult => ({ ok: status >= 200 && status < 300, status, ms: 5, bodySample: body });
const provider = (id: string, over: Partial<ProviderSnapshot> = {}): ProviderSnapshot => ({
  id, credential: { stored: true, last_four: 'abcd', status: 'active', updated_at: daysAgo(60) },
  last_health: { checked_at: hoursAgo(1), ok: true, latency_ms: 300, http_status: 200, detail: null, quota: null, cost_micros: 0 },
  checks_7d: 10, ok_7d: 10, avg_latency_ms_7d: 300, usage: { valid_30d: 3, failed_30d: 0, uncertain_30d: 0, last_success_at: daysAgo(2) }, ...over,
});
const notStored = (id: string): ProviderSnapshot => provider(id, { credential: { stored: false, last_four: null, status: null, updated_at: null }, last_health: null, checks_7d: 0, ok_7d: 0, avg_latency_ms_7d: null });
const project = (over: Partial<ProjectCtx> = {}): ProjectCtx => ({
  id: PRJ, name: 'Site Teste', domain: 'site.example.com', base_url: 'https://site.example.com/blog', plugin_mode: true, plugin_namespace: 'zica-posts/v1', gsc_property: null,
  prompt_sets: 1, prompts: 3, last_observation_at: daysAgo(1), site_key: null,
  search: { gsc: { rows: 10, last_day: '2026-11-10', last_synced_at: hoursAgo(1), last_full_sync_at: daysAgo(1) }, bing: { rows: 0, last_day: null, last_synced_at: null, last_full_sync_at: null } }, ...over,
});
function ctxOf(over: Partial<AuditContext> = {}): AuditContext {
  return {
    now: NOW, organizationId: ORG, pluginVersion: '3.16.1', providers: [], program: null, projects: [], securityGrants: { anon_write_tables: 0, sample: [], rls_disabled_tables: 0, rls_sample: [] },
    cronHealth: [], functionsBaseUrl: 'https://proj.supabase.co', probe: () => Promise.resolve(okProbe('')), ...over,
  };
}
const ids = (o: RuleOutput) => o.findings.map((f) => `${f.rule_id}|${f.subject}|${f.severity}`);

// ---------------------------------------------------------------------------
// Utilitários puros
// ---------------------------------------------------------------------------
Deno.test('compareVersions compara numericamente e devolve null quando não interpreta', () => {
  assertEquals(compareVersions('3.12.0', '3.16.1'), -1);
  assertEquals(compareVersions('3.16.1', '3.16.1'), 0);
  assertEquals(compareVersions('3.16.10', '3.16.9'), 1);
  assertEquals(compareVersions('3.16', '3.16.0'), 0);
  assertEquals(compareVersions('v3.2.0-beta', '3.10.0'), -1);
  assertEquals(compareVersions('abc', '3.0.0'), null);
});

Deno.test('JSON-LD: extrai @graph e exige name+url+sameAs', () => {
  const html = (j: unknown) => `<html><script type="application/ld+json">${JSON.stringify(j)}</script></html>`;
  assert(hasStrongOrganizationNode(html({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, { '@type': ['Organization', 'LegalService'], name: 'RDM', url: 'https://x.com', sameAs: ['https://instagram.com/x'] }] })));
  assertFalse(hasStrongOrganizationNode(html({ '@type': 'Organization', name: 'RDM', url: 'https://x.com' })));
  assertFalse(hasStrongOrganizationNode(html({ '@type': 'Organization', name: 'RDM', url: 'https://x.com', sameAs: [] })));
  assertFalse(hasStrongOrganizationNode(html({ '@type': 'WebSite', name: 'RDM', url: 'https://x.com', sameAs: ['a'] })));
  assertFalse(hasStrongOrganizationNode('<script type="application/ld+json">{quebrado</script>'));
  assertEquals(extractJsonLd('<script type="application/ld+json">[{"a":1},{"b":2}]</script>').length, 2);
});

Deno.test('textFileOk rejeita página HTML com status 200 e corpo vazio', () => {
  assert(textFileOk(okProbe('User-agent: *\nAllow: /')));
  assertFalse(textFileOk(okProbe('<!DOCTYPE html><html>404</html>')));
  assertFalse(textFileOk(okProbe('   ')));
  assertFalse(textFileOk(okProbe('x', 404)));
});

// ---------------------------------------------------------------------------
// Regras de provedores
// ---------------------------------------------------------------------------
Deno.test('provider.never_verified: guardada sem teste; fix só para teste gratuito', () => {
  const o = ruleProviderNeverVerified(ctxOf({ providers: [provider('openai', { last_health: null }), provider('serper', { last_health: null }), provider('gemini'), notStored('brave')] }));
  assertEquals(ids(o), ['provider.never_verified|openai|medium', 'provider.never_verified|serper|medium']);
  assertEquals(o.findings[0].category, 'corrective');
  assertEquals(o.findings[0].fix_action, { type: 'provider_health_check', params: { provider: 'openai' } });
  assertEquals(o.findings[1].fix_action, null); // teste com custo nunca é automático
});

Deno.test('provider.check_failed: critical para GSC/Bing, high para os demais, ignora ok e não guardados', () => {
  const failed = { checked_at: hoursAgo(1), ok: false, latency_ms: 20, http_status: 401, detail: 'unauthorized', quota: null, cost_micros: 0 };
  const o = ruleProviderCheckFailed(ctxOf({ providers: [provider('gsc', { last_health: failed }), provider('bing_webmaster', { last_health: failed }), provider('openai', { last_health: failed }), provider('gemini'), notStored('anthropic')] }));
  assertEquals(ids(o), ['provider.check_failed|gsc|critical', 'provider.check_failed|bing_webmaster|critical', 'provider.check_failed|openai|high']);
  assert(o.findings[2].detail.includes('401'));
});

Deno.test('provider.latency_high: média 7d > 4000 ms (exatamente 4000 não dispara)', () => {
  const o = ruleProviderLatencyHigh(ctxOf({ providers: [provider('openai', { avg_latency_ms_7d: 4001 }), provider('gemini', { avg_latency_ms_7d: 4000 }), provider('anthropic', { avg_latency_ms_7d: 9000, checks_7d: 0 })] }));
  assertEquals(ids(o), ['provider.latency_high|openai|low']);
  assertEquals(o.findings[0].category, 'preventive');
});

Deno.test('provider.quota_low: <10% high, <25% medium, 25% não, sem limite não', () => {
  const q = (remaining: number | null, limit: number | null) => ({ checked_at: hoursAgo(1), ok: true, latency_ms: 1, http_status: 200, detail: null, quota: { label: 'créditos', remaining, limit }, cost_micros: 0 });
  const o = ruleProviderQuotaLow(ctxOf({ providers: [
    provider('dataforseo', { last_health: q(9, 100) }), provider('serpapi', { last_health: q(10, 100) }), provider('openai', { last_health: q(24, 100) }),
    provider('gemini', { last_health: q(25, 100) }), provider('anthropic', { last_health: q(null, 100) }), provider('brave', { last_health: q(5, 0) }),
  ] }));
  assertEquals(ids(o), ['provider.quota_low|dataforseo|high', 'provider.quota_low|serpapi|medium', 'provider.quota_low|openai|medium']);
});

Deno.test('provider.unused_30d: ignora GSC/Bing, uso recente e credencial com menos de 30 dias', () => {
  const unused = { valid_30d: 0, failed_30d: 0, uncertain_30d: 0, last_success_at: null };
  const o = ruleProviderUnused30d(ctxOf({ providers: [
    provider('openai', { usage: unused }), provider('gsc', { usage: unused }), provider('gemini', { usage: { ...unused, failed_30d: 1 } }),
    provider('anthropic', { usage: unused, credential: { stored: true, last_four: 'x', status: 'active', updated_at: daysAgo(5) } }),
  ] }));
  assertEquals(ids(o), ['provider.unused_30d|openai|info']);
  assertEquals(o.findings[0].category, 'improvement');
});

Deno.test('provider.free_not_connected: GSC e Bing sem credencial -> high com open_route', () => {
  const o = ruleProviderFreeNotConnected(ctxOf({ providers: [provider('gsc'), notStored('bing_webmaster')] }));
  assertEquals(ids(o), ['provider.free_not_connected|bing_webmaster|high']);
  assertEquals(o.findings[0].fix_action?.type, 'open_route');
  assertEquals(ruleProviderFreeNotConnected(ctxOf({ providers: [] })).findings.length, 2); // ausente da lista = não conectado
});

Deno.test('regras de provedores falham com ContextUnavailable quando a visão de provedores não carregou', () => {
  const c = ctxOf({ providers: null });
  for (const fn of [ruleProviderNeverVerified, ruleProviderCheckFailed, ruleProviderLatencyHigh, ruleProviderQuotaLow, ruleProviderUnused30d, ruleProviderFreeNotConnected, ruleSearchSyncStale, ruleSearchNoData]) {
    let threw = false;
    try { fn(c); } catch (e) { threw = e instanceof ContextUnavailable; }
    assert(threw, fn.name);
  }
});

// ---------------------------------------------------------------------------
// Regras de busca e observatório
// ---------------------------------------------------------------------------
Deno.test('search.sync_stale: >48 h medium, >7 d high, credencial inativa ou nunca sincronizado não', () => {
  const st = (h: number | null) => ({ rows: 5, last_day: null, last_synced_at: h === null ? null : hoursAgo(h), last_full_sync_at: null });
  const base = project();
  const p48 = project({ id: 'p48', search: { ...base.search, gsc: st(48) } });
  const p49 = project({ id: 'p49', search: { ...base.search, gsc: st(49) } });
  const p200 = project({ id: 'p200', search: { ...base.search, gsc: st(200) } });
  const pNever = project({ id: 'pn', search: { ...base.search, gsc: st(null) } });
  const o = ruleSearchSyncStale(ctxOf({ providers: [provider('gsc')], projects: [p48, p49, p200, pNever] }));
  assertEquals(ids(o), ['search.sync_stale|gsc|medium', 'search.sync_stale|gsc|high']);
  assertEquals(o.findings[0].project_id, 'p49');
  assertEquals(o.findings[0].fix_action, { type: 'search_performance_sync', params: { projectId: 'p49', source: 'gsc', days: 7 } });
  const inactive = ruleSearchSyncStale(ctxOf({ providers: [provider('gsc', { credential: { stored: true, last_four: 'x', status: 'invalid', updated_at: daysAgo(9) } })], projects: [p200] }));
  assertEquals(inactive.findings.length, 0);
});

Deno.test('search.no_data: credencial ativa há mais de 24 h e 0 linhas', () => {
  const empty = project({ search: { gsc: { rows: 0, last_day: null, last_synced_at: null, last_full_sync_at: null }, bing: { rows: 0, last_day: null, last_synced_at: null, last_full_sync_at: null } } });
  const o = ruleSearchNoData(ctxOf({ providers: [provider('gsc'), provider('bing_webmaster')], projects: [empty] }));
  assertEquals(ids(o), ['search.no_data|gsc|medium', 'search.no_data|bing|medium']);
  const fresh = ruleSearchNoData(ctxOf({ providers: [provider('gsc', { credential: { stored: true, last_four: 'x', status: 'active', updated_at: hoursAgo(2) } })], projects: [empty] }));
  assertEquals(fresh.findings.length, 0); // ainda na janela da primeira sincronização
  const withRows = ruleSearchNoData(ctxOf({ providers: [provider('gsc')], projects: [project()] }));
  assertEquals(withRows.findings.length, 0);
});

Deno.test('observatory.stale: 14 dias; projeto que nunca usou o Observatório fica para no_prompts', () => {
  const o = ruleObservatoryStale(ctxOf({ projects: [
    project({ id: 'a', last_observation_at: daysAgo(14) }), project({ id: 'b', last_observation_at: daysAgo(15) }),
    project({ id: 'c', last_observation_at: null, prompt_sets: 2 }), project({ id: 'd', last_observation_at: null, prompt_sets: 0 }),
  ] }));
  assertEquals(o.findings.map((f) => f.project_id), ['b', 'c']);
  assertEquals(o.findings[0].severity, 'low');
});

Deno.test('observatory.no_prompts: projeto com endereço e sem conjunto de prompts', () => {
  const o = ruleObservatoryNoPrompts(ctxOf({ projects: [project({ id: 'a', prompt_sets: 0 }), project({ id: 'b', prompt_sets: 0, base_url: null, domain: null }), project({ id: 'c' })] }));
  assertEquals(o.findings.map((f) => f.project_id), ['a']);
  assertEquals(o.findings[0].severity, 'medium');
});

// ---------------------------------------------------------------------------
// Sinais, plugin e site (com sondagem injetada)
// ---------------------------------------------------------------------------
Deno.test('signals.no_batch: chave com mais de 24 h sem lote', () => {
  const key = (h: number, batch: string | null) => ({ site_id: 'abcd1234efgh', created_at: hoursAgo(h), last_batch_at: batch });
  const o = ruleSignalsNoBatch(ctxOf({ projects: [project({ id: 'a', site_key: key(25, null) }), project({ id: 'b', site_key: key(23, null) }), project({ id: 'c', site_key: key(99, hoursAgo(1)) }), project({ id: 'd' })] }));
  assertEquals(o.findings.map((f) => f.project_id), ['a']);
});

Deno.test('signals.snippet_missing: achado só com página legível; página fora do ar ou truncada é inconclusiva', async () => {
  const key = { site_id: 'abcd1234efgh', created_at: daysAgo(3), last_batch_at: null };
  const mk = (body: ProbeResult) => ctxOf({ projects: [project({ site_key: key })], probe: () => Promise.resolve(body) });
  const missing = await ruleSignalsSnippetMissing(mk(okProbe('<html>sem nada</html>')));
  assertEquals(ids(missing), ['signals.snippet_missing||high']);
  const present = await ruleSignalsSnippetMissing(mk(okProbe('<script src="/ZICA-SIGNALS.js"></script>')));
  assertEquals(present.findings.length, 0);
  const down = await ruleSignalsSnippetMissing(mk({ ok: false, status: 0, ms: 1, bodySample: '' }));
  assertEquals(down.findings.length, 0);
  assertEquals(down.inconclusive, [fingerprintOf('signals.snippet_missing', PRJ, '')]);
  const truncated = await ruleSignalsSnippetMissing(mk({ ...okProbe('<html>x'), truncated: true }));
  assertEquals(truncated.inconclusive.length, 1);
  const noKey = await ruleSignalsSnippetMissing(ctxOf({ projects: [project()] }));
  assertEquals(noKey.findings.length + noKey.inconclusive.length, 0);
});

const pluginProbe = (map: Record<string, ProbeResult>) => (url: string) => Promise.resolve(map[url] ?? okProbe('', 404));
const V = 'https://site.example.com/blog/wp-json/zica-posts/v1/version';
const V2 = 'https://site.example.com/blog/?rest_route=/zica-posts/v1/version';

Deno.test('plugin.outdated: versão menor que a atual; igual/maior não; fallback rest_route; inalcançável é inconclusivo', async () => {
  const c = (map: Record<string, ProbeResult>) => ctxOf({ projects: [project()], probe: pluginProbe(map) });
  const old = await rulePluginOutdated(c({ [V]: okProbe(JSON.stringify({ success: true, version: '3.12.0' })) }));
  assertEquals(ids(old), ['plugin.outdated||medium']);
  assertEquals(old.findings[0].evidence, { installed: '3.12.0', current: '3.16.1' });
  assertEquals((await rulePluginOutdated(c({ [V]: okProbe(JSON.stringify({ version: '3.16.1' })) }))).findings.length, 0);
  assertEquals((await rulePluginOutdated(c({ [V]: okProbe(JSON.stringify({ version: '3.17.0' })) }))).findings.length, 0);
  const viaFallback = await rulePluginOutdated(c({ [V]: okProbe('', 404), [V2]: okProbe(JSON.stringify({ version: '3.10.0' })) }));
  assertEquals(viaFallback.findings.length, 1);
  const unreachable = await rulePluginOutdated(c({}));
  assertEquals(unreachable.findings.length, 0);
  assertEquals(unreachable.inconclusive.length, 1);
  const notPlugin = await rulePluginOutdated(ctxOf({ projects: [project({ plugin_mode: false })], probe: pluginProbe({}) }));
  assertEquals(notPlugin.findings.length + notPlugin.inconclusive.length, 0);
});

Deno.test('plugin.unreachable: sem 2xx com JSON de versão nos dois endereços', async () => {
  const c = (map: Record<string, ProbeResult>) => ctxOf({ projects: [project()], probe: pluginProbe(map) });
  const down = await rulePluginUnreachable(c({ [V]: okProbe('', 503), [V2]: okProbe('<html>erro</html>', 200) }));
  assertEquals(ids(down), ['plugin.unreachable||high']);
  assertEquals((await rulePluginUnreachable(c({ [V]: okProbe(JSON.stringify({ version: '3.16.1' })) }))).findings.length, 0);
});

Deno.test('site.llms_missing: llms.txt ou robots.txt ausentes -> fix plugin_discovery_refresh', async () => {
  const L = 'https://site.example.com/blog/llms.txt';
  const R = 'https://site.example.com/robots.txt';
  const c = (map: Record<string, ProbeResult>) => ctxOf({ projects: [project()], probe: pluginProbe(map) });
  const both = await ruleSiteLlmsMissing(c({ [L]: okProbe('# Site'), [R]: okProbe('User-agent: *') }));
  assertEquals(both.findings.length, 0);
  const viaRoot = await ruleSiteLlmsMissing(c({ 'https://site.example.com/llms.txt': okProbe('# Site'), [R]: okProbe('User-agent: *') }));
  assertEquals(viaRoot.findings.length, 0);
  const noLlms = await ruleSiteLlmsMissing(c({ [R]: okProbe('User-agent: *') }));
  assertEquals(ids(noLlms), ['site.llms_missing||medium']);
  assertEquals(noLlms.findings[0].fix_action, { type: 'plugin_discovery_refresh', params: { projectId: PRJ } });
  const htmlSoft404 = await ruleSiteLlmsMissing(c({ [L]: okProbe('<!doctype html><p>nada</p>'), [R]: okProbe('User-agent: *') }));
  assertEquals(htmlSoft404.findings.length, 1);
  const noRobots = await ruleSiteLlmsMissing(c({ [L]: okProbe('# Site') }));
  assert(noRobots.findings[0].title.includes('/robots.txt'));
});

Deno.test('site.schema_thin: sem nó forte -> low/improvement; página fora do ar é inconclusiva', async () => {
  const strong = `<script type="application/ld+json">${JSON.stringify({ '@type': 'LegalService', name: 'RDM', url: 'https://x', sameAs: ['https://y'] })}</script>`;
  const c = (p: ProbeResult) => ctxOf({ projects: [project()], probe: () => Promise.resolve(p) });
  assertEquals((await ruleSiteSchemaThin(c(okProbe(strong)))).findings.length, 0);
  const thin = await ruleSiteSchemaThin(c(okProbe('<html></html>')));
  assertEquals(ids(thin), ['site.schema_thin||low']);
  assertEquals(thin.findings[0].category, 'improvement');
  assertEquals(thin.findings[0].fix_action, null);
  const down = await ruleSiteSchemaThin(c({ ok: false, status: 0, ms: 1, bodySample: '' }));
  assertEquals(down.findings.length, 0);
  assertEquals(down.inconclusive.length, 1);
});

// ---------------------------------------------------------------------------
// Runtime, segurança e custo
// ---------------------------------------------------------------------------
Deno.test('runtime.function_down: 5xx e timeout são críticos; 401/405 são esperados', async () => {
  const statuses: Record<string, number> = { 'nexus-intelligence': 401, 'zica-signals': 503 };
  const c = ctxOf({ probe: (url) => { const name = url.split('/').pop()!; const s = statuses[name]; return Promise.resolve({ ok: s >= 200 && s < 300, status: s, ms: 3, bodySample: '' }); } });
  assertEquals(ids(await ruleRuntimeFunctionDown(c)), ['runtime.function_down|zica-signals|critical']);
  statuses['zica-signals'] = 405;
  assertEquals((await ruleRuntimeFunctionDown(c)).findings.length, 0);
  statuses['nexus-intelligence'] = 0;
  assertEquals(ids(await ruleRuntimeFunctionDown(c)), ['runtime.function_down|nexus-intelligence|critical']);
  await assertRejects(() => Promise.resolve(ruleRuntimeFunctionDown(ctxOf({ functionsBaseUrl: null }))), ContextUnavailable);
});

Deno.test('runtime.cron_failing: só jobs zica-*/nexus-* com 3 ou mais falhas', () => {
  const job = (jobname: string, failures: number) => ({ jobname, active: true, runs: 96, failures, last_status: 'failed', last_run: hoursAgo(1) });
  const o = ruleRuntimeCronFailing(ctxOf({ cronHealth: [job('zica-news-agents-15min', 3), job('nexus-audit-every-15-min', 2), job('outro-job', 50), job('zica-x', 0)] }));
  assertEquals(ids(o), ['runtime.cron_failing|zica-news-agents-15min|medium']);
  let threw = false;
  try { ruleRuntimeCronFailing(ctxOf({ cronHealth: null })); } catch (e) { threw = e instanceof ContextUnavailable; }
  assert(threw);
});

Deno.test('security.anon_write e security.rls_off: high quando > 0; sem dados -> ContextUnavailable', () => {
  const g = { anon_write_tables: 2, sample: ['a', 'b'], rls_disabled_tables: 1, rls_sample: ['t'] };
  assertEquals(ids(ruleSecurityAnonWrite(ctxOf({ securityGrants: g }))), ['security.anon_write||high']);
  assertEquals(ids(ruleSecurityRlsOff(ctxOf({ securityGrants: g }))), ['security.rls_off||high']);
  assertEquals(ruleSecurityAnonWrite(ctxOf()).findings.length, 0);
  assertEquals(ruleSecurityRlsOff(ctxOf()).findings.length, 0);
  let threw = false;
  try { ruleSecurityRlsOff(ctxOf({ securityGrants: null })); } catch (e) { threw = e instanceof ContextUnavailable; }
  assert(threw);
});

Deno.test('regras de sistema podem ser desligadas por organização (audit_system_rules=false) e então resolvem o que existia', async () => {
  const program = { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [], system_rules: false };
  const c = ctxOf({ program, securityGrants: { anon_write_tables: 9, sample: [], rls_disabled_tables: 9, rls_sample: [] }, cronHealth: null, functionsBaseUrl: null });
  assertEquals(ruleSecurityAnonWrite(c).findings.length, 0);
  assertEquals(ruleSecurityRlsOff(c).findings.length, 0);
  assertEquals(ruleRuntimeCronFailing(c).findings.length, 0);
  assertEquals((await ruleRuntimeFunctionDown(c)).findings.length, 0);
});

Deno.test('cost.budget_80: 80% dispara (high), 79,9% não; orçamento 0 não; reserva conta', () => {
  const prog = (consumed: number, reserved: number, budget = 5_000_000) => ({ execution_enabled: true, budget_usd_micros: budget, reserved_usd_micros: reserved, consumed_usd_micros: consumed, providers_enabled: ['openai'], system_rules: true });
  assertEquals(ids(ruleCostBudget80(ctxOf({ program: prog(4_000_000, 0) }))), ['cost.budget_80||high']);
  assertEquals(ids(ruleCostBudget80(ctxOf({ program: prog(3_000_000, 1_000_000) }))), ['cost.budget_80||high']);
  assertEquals(ruleCostBudget80(ctxOf({ program: prog(3_999_999, 0) })).findings.length, 0);
  assertEquals(ruleCostBudget80(ctxOf({ program: prog(0, 0, 0) })).findings.length, 0);
  assertEquals(ruleCostBudget80(ctxOf({ program: null })).findings.length, 0);
  assert(ruleCostBudget80(ctxOf({ program: prog(5_000_000, 0) })).findings[0].title.includes('esgotado'));
});

Deno.test('cost.enabled_without_provider e execution.enabled_info', () => {
  const prog = (enabled: boolean, list: string[]) => ({ execution_enabled: enabled, budget_usd_micros: 1, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: list, system_rules: true });
  assertEquals(ids(ruleCostEnabledWithoutProvider(ctxOf({ program: prog(true, []) }))), ['cost.enabled_without_provider||low']);
  assertEquals(ruleCostEnabledWithoutProvider(ctxOf({ program: prog(true, ['openai']) })).findings.length, 0);
  assertEquals(ruleCostEnabledWithoutProvider(ctxOf({ program: prog(false, []) })).findings.length, 0);
  const info = ruleExecutionEnabledInfo(ctxOf({ program: prog(true, ['openai']) }));
  assertEquals(ids(info), ['execution.enabled_info||info']);
  assertEquals(info.findings[0].category, 'improvement');
  assertEquals(ruleExecutionEnabledInfo(ctxOf({ program: prog(false, []) })).findings.length, 0);
});

Deno.test('catálogo: 23 regras com ids únicos e fix_actions somente da lista branca', () => {
  assertEquals(AUDIT_RULES.length, 23);
  assertEquals(new Set(AUDIT_RULES.map((r) => r.id)).size, 23);
  for (const f of [parseFixAction({ type: 'provider_health_check', params: { provider: 'openai' } }), parseFixAction({ type: 'open_route', params: {} })]) assert(f.ok);
  for (const bad of [{ type: 'drop_table', params: {} }, { type: 'run_paid_execution', params: {} }, null, 'x']) assertFalse(parseFixAction(bad).ok);
});

// ---------------------------------------------------------------------------
// Motor de achados
// ---------------------------------------------------------------------------
const cand = (over: Partial<RuleOutput['findings'][number]> = {}): RuleOutput['findings'][number] => ({
  rule_id: 'provider.check_failed', project_id: null, subject: 'openai', category: 'corrective', severity: 'high', title: 'T', detail: 'D', suggested_action: 'A', fix_action: null, evidence: { n: 1 }, ...over,
});
const evalOk = (ruleId: string, findings: RuleOutput['findings'], inconclusive: string[] = []): RuleEvaluation => ({ ruleId, ok: true, output: { findings, inconclusive } });
const row = (over: Partial<FindingRow> = {}): FindingRow => ({
  id: 'f1', organization_id: ORG, project_id: null, rule_id: 'provider.check_failed', subject: 'openai', fingerprint: 'provider.check_failed||openai', category: 'corrective', severity: 'high',
  title: 'T', detail: 'D', suggested_action: 'A', fix_action: null, evidence: {}, status: 'open', note: null, snoozed_until: null, first_seen_at: daysAgo(1), last_seen_at: hoursAgo(1),
  resolved_at: null, occurrences: 4, ...over,
});

Deno.test('fingerprint = rule_id|project_id|subject', () => {
  assertEquals(fingerprintOf('a.b', PRJ, 'gsc'), `a.b|${PRJ}|gsc`);
  assertEquals(fingerprintOf('a.b', null, ''), 'a.b||');
});

Deno.test('motor: abre achado novo com occurrences=1 e conta como aberto', () => {
  const r = reconcileFindings(ORG, [], [evalOk('provider.check_failed', [cand()])], NOW);
  assertEquals(r.opened, 1);
  assertEquals(r.inserts.length, 1);
  const f = r.inserts[0];
  assertEquals([f.status, f.occurrences, f.fingerprint, f.first_seen_at, f.last_seen_at], ['open', 1, 'provider.check_failed||openai', NOW.toISOString(), NOW.toISOString()]);
});

Deno.test('motor: deduplica por impressão digital (na mesma rodada e entre rodadas) e atualiza last_seen/occurrences', () => {
  const dup = reconcileFindings(ORG, [], [evalOk('provider.check_failed', [cand({ title: 'primeiro' }), cand({ title: 'segundo' })])], NOW);
  assertEquals(dup.inserts.length, 1);
  assertEquals(dup.inserts[0].title, 'segundo');
  const again = reconcileFindings(ORG, [row()], [evalOk('provider.check_failed', [cand({ title: 'novo título', severity: 'critical' })])], NOW);
  assertEquals(again.inserts.length, 0);
  assertEquals(again.opened, 0);
  assertEquals(again.updates.length, 1);
  assertEquals(again.updates[0].patch.occurrences, 5);
  assertEquals(again.updates[0].patch.last_seen_at, NOW.toISOString());
  assertEquals([again.updates[0].patch.title, again.updates[0].patch.severity, again.updates[0].patch.status], ['novo título', 'critical', undefined]);
});

Deno.test('motor: resolve sozinho quando a condição some (inclusive acknowledged/snoozed) e só da regra avaliada', () => {
  const rows = [row({ id: 'a', status: 'acknowledged' }), row({ id: 'b', fingerprint: 'provider.check_failed||gemini', subject: 'gemini', status: 'snoozed', snoozed_until: daysAgo(-1) }),
    row({ id: 'c', rule_id: 'cost.budget_80', fingerprint: 'cost.budget_80||' }), row({ id: 'd', status: 'resolved', fingerprint: 'provider.check_failed||x', subject: 'x', resolved_at: daysAgo(2) })];
  const r = reconcileFindings(ORG, rows, [evalOk('provider.check_failed', [])], NOW);
  assertEquals(r.resolved, 2);
  assertEquals(r.updates.map((u) => u.id).sort(), ['a', 'b']);
  for (const u of r.updates) assertEquals([u.patch.status, u.patch.resolved_at, u.patch.snoozed_until], ['resolved', NOW.toISOString(), null]);
});

Deno.test('motor: reabre achado resolvido quando a condição volta (occurrences+1, nota limpa, conta como aberto)', () => {
  const resolved = row({ status: 'resolved', resolved_at: daysAgo(1), note: 'feito', occurrences: 7 });
  const r = reconcileFindings(ORG, [resolved], [evalOk('provider.check_failed', [cand()])], NOW);
  assertEquals([r.opened, r.reopened, r.inserts.length], [1, 1, 0]);
  const p = r.updates[0].patch;
  assertEquals([p.status, p.resolved_at, p.note, p.occurrences], ['open', null, null, 8]);
  assertEquals(p.evidence?.reopened_at, NOW.toISOString());
});

Deno.test('motor: respeita snoozed_until; vencido volta a open; reconhecido continua reconhecido', () => {
  const stillSnoozed = row({ status: 'snoozed', snoozed_until: hoursAgo(-5) });
  const r1 = reconcileFindings(ORG, [stillSnoozed], [evalOk('provider.check_failed', [cand()])], NOW);
  assertEquals(r1.updates[0].patch.status, undefined); // mantém snoozed
  assertEquals(r1.opened, 0);
  const expired = row({ status: 'snoozed', snoozed_until: hoursAgo(1) });
  const r2 = reconcileFindings(ORG, [expired], [evalOk('provider.check_failed', [cand()])], NOW);
  assertEquals([r2.updates[0].patch.status, r2.updates[0].patch.snoozed_until], ['open', null]);
  const ack = row({ status: 'acknowledged' });
  const r3 = reconcileFindings(ORG, [ack], [evalOk('provider.check_failed', [cand()])], NOW);
  assertEquals(r3.updates[0].patch.status, undefined);
});

Deno.test('motor: falha isolada de regra não abre nem resolve nada daquela regra; outras regras seguem', () => {
  const existing = [row({ id: 'keep' }), row({ id: 'gone', rule_id: 'cost.budget_80', fingerprint: 'cost.budget_80||' })];
  const r = reconcileFindings(ORG, existing, [{ ruleId: 'provider.check_failed', ok: false, error: 'boom' }, evalOk('cost.budget_80', [])], NOW);
  assertEquals(r.updates.map((u) => u.id), ['gone']);
  assertEquals(r.resolved, 1);
});

Deno.test('motor: fingerprints inconclusivos não são resolvidos', () => {
  const r = reconcileFindings(ORG, [row()], [evalOk('provider.check_failed', [], ['provider.check_failed||openai'])], NOW);
  assertEquals(r.updates.length, 0);
});

Deno.test('motor: preserva evidence.last_fix na atualização', () => {
  const withFix = row({ evidence: { last_fix: { ok: true } } });
  const r = reconcileFindings(ORG, [withFix], [evalOk('provider.check_failed', [cand({ evidence: { n: 2 } })])], NOW);
  assertEquals(r.updates[0].patch.evidence, { n: 2, last_fix: { ok: true } });
});

Deno.test('update_finding: valida estado, adiamento 1–720 h e nota; resolvido não muda', () => {
  assertEquals(parseUpdateInput({ status: 'resolved' }), { ok: false, error: 'status_invalid' });
  assertEquals(parseUpdateInput({ status: 'snoozed' }), { ok: false, error: 'snooze_hours_invalid' });
  assertEquals(parseUpdateInput({ status: 'snoozed', snoozeHours: 0 }), { ok: false, error: 'snooze_hours_invalid' });
  assertEquals(parseUpdateInput({ status: 'snoozed', snoozeHours: 721 }), { ok: false, error: 'snooze_hours_invalid' });
  assertEquals(parseUpdateInput({ status: 'acknowledged', note: 'x'.repeat(501) }), { ok: false, error: 'note_invalid' });
  const snooze = parseUpdateInput({ status: 'snoozed', snoozeHours: 24, note: ' ok ' });
  assert(snooze.ok);
  const built = buildFindingUpdate({ status: 'open' }, snooze.value, NOW);
  assert(built.ok);
  assertEquals([built.patch.status, built.patch.snoozed_until, built.patch.note], ['snoozed', hoursAgo(-24), 'ok']);
  const reopen = parseUpdateInput({ status: 'open' });
  assert(reopen.ok);
  const b2 = buildFindingUpdate({ status: 'snoozed' }, reopen.value, NOW);
  assert(b2.ok);
  assertEquals([b2.patch.status, b2.patch.snoozed_until], ['open', null]);
  assertEquals(buildFindingUpdate({ status: 'resolved' }, reopen.value, NOW), { ok: false, error: 'finding_resolved' });
});

Deno.test('overview: contagens por categoria/severidade (open+acknowledged), resolvidos 7 d, adiados fora da contagem', () => {
  const rows = [
    row({ id: '1', category: 'corrective', severity: 'critical' }), row({ id: '2', category: 'preventive', severity: 'high', status: 'acknowledged' }),
    row({ id: '3', category: 'improvement', severity: 'info', status: 'snoozed', snoozed_until: hoursAgo(-3) }),
    row({ id: '4', status: 'resolved', resolved_at: daysAgo(3) }), row({ id: '5', status: 'resolved', resolved_at: daysAgo(8) }),
  ];
  const runs = [{ id: 9, trigger: 'schedule', started_at: hoursAgo(1), finished_at: hoursAgo(1), status: 'ok', rules_evaluated: 23, findings_opened: 1, findings_resolved: 0 }];
  const o = buildOverview(rows, runs, NOW);
  assertEquals(o.counts.open, { corrective: 1, preventive: 1, improvement: 0 });
  assertEquals(o.counts.by_severity, { critical: 1, high: 1, medium: 0, low: 0, info: 0 });
  assertEquals(o.counts.resolved_7d, 1);
  assertEquals(o.findings.map((f) => f.id), ['1', '2', '3', '4']); // 5 (resolvido há 8 d) não aparece
  assertEquals(o.last_run?.id, 9);
  assertEquals(buildOverview([], [], NOW).last_run, null);
});

// ---------------------------------------------------------------------------
// Rede segura: nada de chamada paga
// ---------------------------------------------------------------------------
Deno.test('isPaidProviderRequest: bloqueia endpoints cobrados e libera só os testes gratuitos conhecidos', () => {
  const paid: Array<[string, string]> = [
    ['https://google.serper.dev/search', 'POST'], ['https://api.search.brave.com/res/v1/web/search?q=a&count=1', 'GET'], ['https://api.perplexity.ai/search', 'POST'],
    ['https://serpapi.com/search.json?q=a&api_key=x', 'GET'], ['https://api.dataforseo.com/v3/serp/google/organic/live/advanced', 'POST'],
    ['https://api.openai.com/v1/responses', 'POST'], ['https://api.openai.com/v1/chat/completions', 'POST'], ['https://api.anthropic.com/v1/messages', 'POST'],
    ['https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', 'POST'], ['https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', 'GET'],
    ['https://api.openai.com/v1/models', 'POST'], ['não é url', 'GET'],
  ];
  for (const [u, m] of paid) assert(isPaidProviderRequest(u, m), `${m} ${u}`);
  const free: Array<[string, string]> = [
    ['https://api.openai.com/v1/models', 'GET'], ['https://api.anthropic.com/v1/models?limit=1', 'GET'], ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', 'GET'],
    ['https://api.dataforseo.com/v3/appendix/user_data', 'GET'], ['https://serpapi.com/account.json?api_key=x', 'GET'], ['https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=x', 'GET'],
    ['https://oauth2.googleapis.com/token', 'POST'], ['https://www.googleapis.com/webmasters/v3/sites', 'GET'], ['https://site.example.com/llms.txt', 'GET'],
  ];
  for (const [u, m] of free) assertFalse(isPaidProviderRequest(u, m), `${m} ${u}`);
});

Deno.test('createGuardedFetch: URL paga nunca chega ao fetch interno; prazo vencido aborta; só http(s)', async () => {
  const seen: string[] = [];
  const spy = ((input: RequestInfo | URL) => { seen.push(String(input)); return Promise.resolve(new Response('{}')); }) as typeof fetch;
  const guarded = createGuardedFetch(spy);
  await assertRejects(() => guarded('https://google.serper.dev/search', { method: 'POST' }), Error, 'audit_paid_call_blocked');
  await assertRejects(() => guarded('https://api.search.brave.com/res/v1/web/search?q=a'), Error, 'audit_paid_call_blocked');
  await assertRejects(() => guarded('https://api.perplexity.ai/search', { method: 'POST' }), Error, 'audit_paid_call_blocked');
  await assertRejects(() => guarded('https://api.openai.com/v1/responses', { method: 'POST' }), Error, 'audit_paid_call_blocked');
  await assertRejects(() => guarded('file:///etc/passwd'), Error, 'audit_url_not_allowed');
  assertEquals(seen, []);
  await guarded('https://api.openai.com/v1/models');
  assertEquals(seen, ['https://api.openai.com/v1/models']);
  let t = 1000;
  const timed = createGuardedFetch(spy, { now: () => t, deadlineMs: 1500 });
  await timed('https://site.example.com/');
  t = 1501;
  await assertRejects(() => timed('https://site.example.com/'), AuditBudgetExceeded);
});

Deno.test('isPrivateIp / validateProbeUrl: bloqueia SSRF (IP literal, localhost, internos, credenciais, porta, http)', () => {
  for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.5', '192.168.0.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assertFalse(isPrivateIp(ip), ip);
  for (const bad of ['http://site.example.com/', 'https://localhost/', 'https://127.0.0.1/', 'https://[::1]/', 'https://user:pw@site.example.com/', 'https://site.example.com:8443/', 'https://intranet/', 'https://srv.internal/', 'https://x.local/', 'javascript:alert(1)']) {
    assertEquals(validateProbeUrl(bad), null, bad);
  }
  assert(validateProbeUrl('https://site.example.com/blog'));
  assert(validateProbeUrl('https://proj.supabase.co/functions/v1/x', ['proj.supabase.co']));
});

const resp = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers });

Deno.test('makeProbe: GET com cache, segue redirecionamento validado, trunca corpo, nunca segue para destino bloqueado', async () => {
  const calls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url === 'https://a.example.com/') return Promise.resolve(resp('', 301, { location: 'https://www.a.example.com/home' }));
    if (url === 'https://www.a.example.com/home') return Promise.resolve(resp('x'.repeat(100)));
    if (url === 'https://evil.example.com/') return Promise.resolve(resp('', 302, { location: 'http://169.254.169.254/latest' }));
    if (url === 'https://loop.example.com/') return Promise.resolve(resp('', 302, { location: 'https://loop.example.com/' }));
    if (url === 'https://down.example.com/') return Promise.reject(new TypeError('connect failed'));
    return Promise.resolve(resp('nf', 404));
  }) as typeof fetch;
  const probe = makeProbe({ fetchFn, maxBytes: 40 });
  const a = await probe('https://a.example.com/');
  assertEquals([a.ok, a.status, a.truncated, a.bodySample.length], [true, 200, true, 40]);
  await probe('https://a.example.com/'); // cache
  assertEquals(calls.filter((u) => u === 'https://a.example.com/').length, 1);
  const evil = await probe('https://evil.example.com/');
  assertEquals([evil.ok, evil.status, evil.error], [false, 0, 'blocked_url']);
  assertFalse(calls.includes('http://169.254.169.254/latest'));
  assertEquals((await probe('https://loop.example.com/')).error, 'too_many_redirects');
  assertEquals((await probe('https://down.example.com/')).error, 'network');
  const nf = await probe('https://b.example.com/x');
  assertEquals([nf.ok, nf.status], [false, 404]);
});

Deno.test('makeProbe: bloqueia host que resolve para IP privado e URL inválida; host confiável dispensa DNS', async () => {
  let fetched = 0;
  const fetchFn = (() => { fetched++; return Promise.resolve(resp('ok')); }) as typeof fetch;
  const probe = makeProbe({ fetchFn, trustedHosts: ['proj.supabase.co'], resolveDns: (h) => Promise.resolve(h === 'rebind.example.com' ? ['10.1.1.1'] : h === 'nodns.example.com' ? [] : ['93.184.216.34']) });
  assertEquals((await probe('https://rebind.example.com/')).error, 'blocked_ip');
  assertEquals((await probe('https://nodns.example.com/')).error, 'dns_failed');
  assertEquals((await probe('http://plain.example.com/')).error, 'blocked_url');
  assertEquals(fetched, 0);
  assert((await probe('https://ok.example.com/')).ok);
  assert((await probe('https://proj.supabase.co/functions/v1/x')).ok);
});

Deno.test('makeProbe: no máximo 5 simultâneas e prazo estourado lança AuditBudgetExceeded', async () => {
  let running = 0, peak = 0;
  const fetchFn = (async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; return resp('ok'); }) as typeof fetch;
  const probe = makeProbe({ fetchFn, maxConcurrent: 5 });
  await Promise.all(Array.from({ length: 20 }, (_, i) => probe(`https://s${i}.example.com/`)));
  assertEquals(peak, 5);
  let t = 0;
  const late = makeProbe({ fetchFn, now: () => t, deadlineMs: 10 });
  await late('https://ok.example.com/');
  t = 11;
  await assertRejects(() => late('https://other.example.com/'), AuditBudgetExceeded);
});

Deno.test('pluginDiscoveryRefresh: POST ao wp-json do próprio site, fallback rest_route, 401 recusa, não-https recusa', async () => {
  const calls: Array<{ url: string; method?: string; key?: string }> = [];
  const mk = (handler: (url: string) => Response | Promise<Response>) => ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method, key: (init?.headers as Record<string, string>)?.['X-ZICA-POSTS-Key'] });
    return Promise.resolve(handler(String(input)));
  }) as typeof fetch;
  const ok = await pluginDiscoveryRefresh(mk(() => resp('{"success":true}')), 'https://site.example.com/blog/', 'KEY', 'zica-posts/v1');
  assertEquals(ok, { ok: true, status: 200 });
  assertEquals(calls[0], { url: 'https://site.example.com/blog/wp-json/zica-posts/v1/discovery/refresh', method: 'POST', key: 'KEY' });
  calls.length = 0;
  const viaFallback = await pluginDiscoveryRefresh(mk((u) => (u.includes('wp-json') ? resp('<html>', 404) : resp('{"success":true}'))), 'https://site.example.com', 'KEY', 'zica-posts/v1');
  assert(viaFallback.ok);
  assertEquals(calls.length, 2);
  const denied = await pluginDiscoveryRefresh(mk(() => resp('{"code":"x"}', 401)), 'https://site.example.com', 'KEY', 'zica-posts/v1');
  assertEquals([denied.ok, denied.detail], [false, 'api_key_rejected']);
  calls.length = 0;
  assertEquals((await pluginDiscoveryRefresh(mk(() => resp('{}')), 'http://site.example.com', 'KEY', 'zica-posts/v1')).detail, 'wordpress_base_not_https');
  assertEquals(calls.length, 0);
});

// ---------------------------------------------------------------------------
// Normalizadores
// ---------------------------------------------------------------------------
Deno.test('normalizadores: visão de provedores (nos dois formatos), programa, projetos, grants e cron', () => {
  const item = { provider: 'gsc', credential: { stored: true, last_four: 'zzzz', status: 'active', updated_at: daysAgo(1) }, last_health: { checked_at: hoursAgo(1), ok: true, latency_ms: 120, http_status: 200, detail: null, quota: null, cost_micros: 0 }, checks_7d: 5, ok_7d: 5, avg_latency_ms_7d: 120, usage: { valid_30d: 0, failed_30d: 0, uncertain_30d: 0, last_success_at: null } };
  const a = normalizeProviders({ providers: [item, { provider: 'copilot', credential: { stored: false }, last_health: null }], program: {} });
  assertEquals(a.map((p) => p.id), ['gsc', 'copilot']);
  assertEquals([a[0].last_health?.latency_ms, a[0].credential.stored, a[1].last_health, a[1].avg_latency_ms_7d], [120, true, null, null]);
  const b = normalizeProviders([{ id: 'serper', credential: { stored: true }, health: { last: item.last_health, checks_7d: 2, ok_7d: 1, avg_latency_ms_7d: 7 } }]);
  assertEquals([b[0].id, b[0].checks_7d, b[0].avg_latency_ms_7d, b[0].last_health?.ok], ['serper', 2, 7, true]);
  assertEquals(normalizeProviders(null), []);

  const prog = normalizeProgram({ execution_enabled: true, budget_usd_micros: '5000000', reserved_usd_micros: 0, consumed_usd_micros: 1, settings: { providers_enabled: ['openai', 3], audit_system_rules: false } });
  assertEquals([prog?.budget_usd_micros, prog?.providers_enabled, prog?.system_rules], [5_000_000, ['openai'], false]);
  assertEquals(normalizeProgram(null), null);
  assertEquals(normalizeProgram({ settings: {} })?.system_rules, true);

  const projects = buildProjects(
    [{ id: PRJ, name: 'Meu Site', domain: 'https://www.meusite.com.br/', wordpress_url: 'https://www.meusite.com.br/blog/', wordpress_connector_mode: 'zica_posts', commercial_info: { gsc_property: 'sc-domain:meusite.com.br' } }, { id: 'p2', name: '', domain: 'x.com' }, { id: 'p3' }],
    [{ project_id: PRJ, prompt_sets: 2, prompts: 9, last_observation_at: daysAgo(1), site_key: { site_id: 'abcd1234efgh', created_at: daysAgo(3), last_batch_at: null }, search: { gsc: { rows: 4, last_day: '2026-11-10', last_synced_at: hoursAgo(2), last_full_sync_at: null } } }],
    (r) => r.wordpress_connector_mode === 'zica_posts',
  );
  assertEquals([projects[0].base_url, projects[0].domain, projects[0].plugin_mode, projects[0].gsc_property, projects[0].prompt_sets, projects[0].site_key?.site_id, projects[0].search.gsc.rows, projects[0].search.bing.rows], ['https://www.meusite.com.br/blog', 'www.meusite.com.br', true, 'sc-domain:meusite.com.br', 2, 'abcd1234efgh', 4, 0]);
  assertEquals([projects[1].base_url, projects[1].name, projects[1].plugin_mode, projects[2].base_url], ['https://x.com', 'Projeto', false, null]);

  assertEquals(normalizeSecurityGrants({ anon_write_tables: 2, sample: ['a'], rls_disabled_tables: 1 }), { anon_write_tables: 2, sample: ['a'], rls_disabled_tables: 1, rls_sample: [] });
  assertEquals(normalizeSecurityGrants(null), null);
  assertEquals(normalizeCronHealth([{ jobname: 'zica-x', active: true, runs: 4, failures: 1, last_status: 'failed', last_run: null }]), [{ jobname: 'zica-x', active: true, runs: 4, failures: 1, last_status: 'failed', last_run: null }]);
  assertEquals(normalizeCronHealth({}), null);
});

// ---------------------------------------------------------------------------
// Orquestrador (store em memória)
// ---------------------------------------------------------------------------
class MemStore implements AuditStore {
  findings: FindingRow[] = [];
  runs: Array<Record<string, unknown>> = [];
  marks: Array<[string, string, boolean]> = [];
  inProgress = false;
  providers: ProviderSnapshot[] | Error;
  constructor(public base: BaseData, providers: ProviderSnapshot[] | Error = []) { this.providers = providers; }
  loadBase(): Promise<BaseData> { return Promise.resolve(this.base); }
  loadProviders(): Promise<ProviderSnapshot[]> { return this.providers instanceof Error ? Promise.reject(this.providers) : Promise.resolve(this.providers); }
  hasRunInProgress(): Promise<boolean> { return Promise.resolve(this.inProgress); }
  lastManualRunAt(): Promise<string | null> { return Promise.resolve(null); }
  insertRun(_o: string, trigger: string, started: string): Promise<number> { this.runs.push({ id: this.runs.length + 1, trigger, started_at: started }); return Promise.resolve(this.runs.length); }
  finishRun(id: number, patch: Record<string, unknown>): Promise<void> { Object.assign(this.runs[id - 1], patch); return Promise.resolve(); }
  loadFindings(_o: string, ruleIds: string[]): Promise<FindingRow[]> { return Promise.resolve(this.findings.filter((f) => ruleIds.includes(f.rule_id))); }
  insertFindings(rows: NewFindingRow[]): Promise<void> { for (const r of rows) this.findings.push({ ...r, id: crypto.randomUUID() }); return Promise.resolve(); }
  updateFinding(id: string, patch: FindingPatch): Promise<void> { const f = this.findings.find((x) => x.id === id)!; Object.assign(f, patch); return Promise.resolve(); }
  markSync(_o: string, projectId: string, source: 'gsc' | 'bing', full: boolean): Promise<void> { this.marks.push([projectId, source, full]); return Promise.resolve(); }
}
const emptyBase = (over: Partial<BaseData> = {}): BaseData => ({ program: null, projects: [], securityGrants: { anon_write_tables: 0, sample: [], rls_disabled_tables: 0, rls_sample: [] }, cronHealth: [], ...over });
function depsOf(store: AuditStore, over: Partial<AuditDeps> = {}): AuditDeps {
  const fetchFn = (() => Promise.resolve(resp('', 404))) as typeof fetch;
  return {
    store, now: () => NOW.getTime(), pluginVersion: '3.16.1', functionsBaseUrl: 'https://proj.supabase.co', freeHealthProviders: ['gsc', 'bing_webmaster', 'dataforseo', 'serpapi', 'openai', 'gemini', 'anthropic'],
    healthChecks: () => Promise.resolve([]), syncSearch: () => Promise.resolve({ ok: true, rows_upserted: 0 }),
    makeProbe: (deadlineMs) => makeProbe({ fetchFn: createGuardedFetch(fetchFn, { deadlineMs, now: () => NOW.getTime() }), now: () => NOW.getTime(), deadlineMs }),
    guardedFetch: (deadlineMs) => createGuardedFetch(fetchFn, { deadlineMs, now: () => NOW.getTime() }), ...over,
  };
}
const stubRule = (id: AuditRule['id'], run: AuditRule['run']): AuditRule => ({ id, scope: 'org', run });

Deno.test('orquestrador: abre, deduplica e resolve ao longo de execuções; registra a run', async () => {
  const store = new MemStore(emptyBase({ program: { execution_enabled: true, budget_usd_micros: 1_000_000, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [], system_rules: true } }));
  const deps = depsOf(store, { rules: AUDIT_RULES.filter((r) => ['cost.enabled_without_provider', 'execution.enabled_info', 'security.rls_off'].includes(r.id)) });
  const r1 = await runAuditForOrganization(deps, ORG, { trigger: 'schedule' });
  assertEquals([r1.status, r1.rules_evaluated, r1.findings_opened, r1.findings_resolved], ['ok', 3, 2, 0]);
  assertEquals(store.findings.length, 2);
  const r2 = await runAuditForOrganization(deps, ORG, { trigger: 'schedule' });
  assertEquals([r2.findings_opened, store.findings.length, store.findings.every((f) => f.occurrences === 2)], [0, 2, true]);
  store.base.program!.execution_enabled = false;
  const r3 = await runAuditForOrganization(deps, ORG, { trigger: 'manual', actorUserId: 'u1' });
  assertEquals([r3.findings_resolved, store.findings.every((f) => f.status === 'resolved')], [2, true]);
  store.base.program!.execution_enabled = true;
  const r4 = await runAuditForOrganization(deps, ORG, { trigger: 'schedule' });
  assertEquals([r4.findings_opened, store.findings.length, store.findings.every((f) => f.status === 'open')], [2, 2, true]); // reabriu, não duplicou
  assertEquals(store.runs.length, 4);
  assertEquals(store.runs[2].trigger, 'manual');
  assert(typeof store.runs[0].finished_at === 'string');
});

Deno.test('orquestrador: falha de uma regra vira detail.rule_errors, run "partial" e os achados dela ficam intactos', async () => {
  const store = new MemStore(emptyBase());
  store.findings.push(row({ rule_id: 'cost.budget_80', fingerprint: 'cost.budget_80||', subject: '' }));
  const boom = stubRule('cost.budget_80', () => { throw new Error('boom token=SECRET123 aqui'); });
  const good = stubRule('execution.enabled_info', () => ({ findings: [cand({ rule_id: 'execution.enabled_info', subject: '', category: 'improvement', severity: 'info' })], inconclusive: [] }));
  const r = await runAuditForOrganization(depsOf(store, { rules: [boom, good] }), ORG, { trigger: 'schedule' });
  assertEquals([r.status, r.rules_evaluated, r.findings_opened, r.findings_resolved], ['partial', 1, 1, 0]);
  const errors = r.detail.rule_errors as Array<{ rule_id: string; error: string }>;
  assertEquals(errors.length, 1);
  assertEquals(errors[0].rule_id, 'cost.budget_80');
  assertFalse(errors[0].error.includes('SECRET123'));
  assertEquals(store.findings.find((f) => f.rule_id === 'cost.budget_80')!.status, 'open');
});

Deno.test('orquestrador: visão de provedores indisponível -> regras de provedor falham sem resolver nada', async () => {
  const store = new MemStore(emptyBase(), new Error('providers_overview_unavailable'));
  store.findings.push(row({ rule_id: 'provider.check_failed' }));
  const rules = AUDIT_RULES.filter((r) => ['provider.check_failed', 'cost.budget_80'].includes(r.id));
  const r = await runAuditForOrganization(depsOf(store, { rules }), ORG, { trigger: 'schedule' });
  assertEquals(r.status, 'partial');
  assertEquals((r.detail.rule_errors as unknown[]).length, 1);
  assertEquals(store.findings[0].status, 'open');
});

Deno.test('orquestrador: erro ao carregar o contexto base -> run "error" registrada', async () => {
  const store = new MemStore(emptyBase());
  store.loadBase = () => Promise.reject(new Error('program_unavailable'));
  const r = await runAuditForOrganization(depsOf(store), ORG, { trigger: 'schedule' });
  assertEquals(r.status, 'error');
  assertEquals(store.runs[0].status, 'error');
});

Deno.test('orquestrador: execução em andamento -> AuditBusyError sem criar run; recordRun=false reavalia só a regra pedida', async () => {
  const store = new MemStore(emptyBase());
  store.inProgress = true;
  await assertRejects(() => runAuditForOrganization(depsOf(store), ORG, { trigger: 'manual' }), AuditBusyError);
  assertEquals(store.runs.length, 0);
  const rules = [stubRule('cost.budget_80', () => ({ findings: [], inconclusive: [] })), stubRule('execution.enabled_info', () => ({ findings: [cand({ rule_id: 'execution.enabled_info', subject: '' })], inconclusive: [] }))];
  store.findings.push(row({ rule_id: 'cost.budget_80', fingerprint: 'cost.budget_80||', subject: '' }));
  const r = await runAuditForOrganization(depsOf(store, { rules }), ORG, { trigger: 'manual', onlyRules: ['cost.budget_80'], skipActions: true, recordRun: false });
  assertEquals([r.id, r.rules_evaluated, r.findings_resolved, store.findings.length], [null, 1, 1, 1]);
  assertEquals(store.runs.length, 0);
});

Deno.test('orquestrador: estouro do orçamento de tempo vira rule_error e não resolve achados', async () => {
  let t = NOW.getTime();
  const store = new MemStore(emptyBase({ projects: [project({ site_key: { site_id: 'abcd1234efgh', created_at: daysAgo(3), last_batch_at: null } })] }));
  store.findings.push(row({ rule_id: 'signals.snippet_missing', fingerprint: fingerprintOf('signals.snippet_missing', PRJ, ''), project_id: PRJ, subject: '' }));
  const fetchFn = (() => Promise.resolve(resp('<html></html>'))) as typeof fetch;
  const deps = depsOf(store, {
    now: () => t, rules: AUDIT_RULES.filter((r) => r.id === 'signals.snippet_missing'),
    makeProbe: (deadlineMs) => { t = deadlineMs + 1; return makeProbe({ fetchFn, now: () => t, deadlineMs }); },
  });
  const r = await runAuditForOrganization(deps, ORG, { trigger: 'schedule' });
  assertEquals(r.detail.budget_exceeded, true);
  assertEquals(r.status, 'error'); // única regra falhou
  assertEquals(store.findings[0].status, 'open');
});

Deno.test('SEGURANÇA: executor completo nunca chama endpoint pago; confirmCost é sempre false; testes com custo nunca são pedidos', async () => {
  const requested: string[] = [];
  const served = (url: string): Response => {
    if (url.endsWith('/blog/')) return resp('<html><script src="/zica-signals.js"></script><script type="application/ld+json">{"@type":"LegalService","name":"X","url":"https://site.example.com","sameAs":["https://i.com/x"]}</script></html>');
    if (url.includes('/version')) return resp(JSON.stringify({ success: true, version: '3.16.1' }));
    if (url.endsWith('llms.txt') || url.endsWith('robots.txt')) return resp('# ok');
    if (url.includes('/functions/v1/')) return resp('{"error":"unauthorized"}', 401);
    return resp('nf', 404);
  };
  const spy = ((input: RequestInfo | URL) => { requested.push(String(input)); return Promise.resolve(served(String(input))); }) as typeof fetch;
  const healthCalls: Array<{ providers?: string[]; confirmCost: boolean; triggeredBy: string | null }> = [];
  const blocked: string[] = [];
  const store = new MemStore(
    emptyBase({
      program: { execution_enabled: true, budget_usd_micros: 5_000_000, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: ['openai', 'serper'], system_rules: true },
      projects: [project({ site_key: { site_id: 'abcd1234efgh', created_at: daysAgo(3), last_batch_at: hoursAgo(2) } })],
    }),
    [
      provider('gsc', { last_health: null }), provider('serper', { last_health: null }), provider('brave', { last_health: null }), provider('perplexity', { last_health: null }),
      provider('openai', { last_health: { checked_at: hoursAgo(3), ok: true, latency_ms: 10, http_status: 200, detail: null, quota: null, cost_micros: 0 } }),
      provider('gemini', { last_health: { checked_at: hoursAgo(0.1), ok: true, latency_ms: 10, http_status: 200, detail: null, quota: null, cost_micros: 0 } }), notStored('bing_webmaster'),
    ],
  );
  const syncCalls: string[] = [];
  const deps = depsOf(store, {
    healthChecks: async (o) => {
      healthCalls.push({ providers: o.providers, confirmCost: o.confirmCost, triggeredBy: o.triggeredBy });
      // um implementador falho tentaria chamar provedores pagos com o fetch recebido: o guarda precisa barrar
      for (const [url, init] of [['https://google.serper.dev/search', { method: 'POST' }], ['https://api.search.brave.com/res/v1/web/search?q=a&count=1', {}], ['https://api.perplexity.ai/search', { method: 'POST' }], ['https://api.openai.com/v1/responses', { method: 'POST' }]] as Array<[string, RequestInit]>) {
        try { await o.fetchFn(url, init); } catch (e) { if (e instanceof Error && e.message === 'audit_paid_call_blocked') blocked.push(url); }
      }
      await o.fetchFn('https://api.openai.com/v1/models'); // gratuito: passa
      return (o.providers ?? []).map((p) => ({ provider: p, ok: true }));
    },
    syncSearch: (call, fetchFn) => { syncCalls.push(`${call.source}:${call.days}`); void fetchFn; return Promise.resolve({ ok: true, rows_upserted: 3 }); },
    makeProbe: (deadlineMs) => makeProbe({ fetchFn: createGuardedFetch(spy, { deadlineMs, now: () => NOW.getTime() }), now: () => NOW.getTime(), deadlineMs, trustedHosts: ['proj.supabase.co'] }),
    guardedFetch: (deadlineMs) => createGuardedFetch(spy, { deadlineMs, now: () => NOW.getTime() }),
  });
  const r = await runAuditForOrganization(deps, ORG, { trigger: 'schedule' });
  assertEquals(r.status, 'ok');
  // confirmCost sempre false; só provedores com teste gratuito e sem teste recente (gsc sem teste, openai > 55 min; gemini recente fica de fora)
  assertEquals(healthCalls.length, 1);
  assertEquals(healthCalls[0].confirmCost, false);
  assertEquals(healthCalls[0].providers, ['gsc', 'openai']);
  assertEquals(healthCalls[0].triggeredBy, null);
  for (const costly of ['serper', 'brave', 'perplexity']) assertFalse((healthCalls[0].providers ?? []).includes(costly));
  // o guarda barrou as 4 chamadas pagas e deixou passar o teste gratuito
  assertEquals(blocked.length, 4);
  // nenhum URL de provedor pago chegou ao fetch real
  const everything = requested.filter((u) => isPaidProviderRequest(u, 'GET') || /serper|brave|perplexity|dataforseo|serpapi/.test(u));
  assertEquals(everything, []);
  assert(requested.includes('https://api.openai.com/v1/models'));
  // as demais requisições foram só ao próprio site e às funções
  for (const u of requested.filter((x) => !x.startsWith('https://api.openai.com/v1/models'))) assert(u.startsWith('https://site.example.com/') || u.startsWith('https://proj.supabase.co/functions/v1/'), u);
  // última sincronização do GSC há 1 h (< 12 h) e Bing sem credencial: nenhuma sincronização
  assertEquals(syncCalls, []);
});

Deno.test('sincronização agendada: a cada 12 h (7 dias) e 90 dias semanalmente; só com credencial ativa; marca no sucesso', async () => {
  const stale = (h: number, fullDays: number | null) => ({ rows: 5, last_day: null, last_synced_at: hoursAgo(h), last_full_sync_at: fullDays === null ? null : daysAgo(fullDays) });
  const bingStale = { rows: 5, last_day: null, last_synced_at: null, last_full_sync_at: null };
  const proj = (id: string, gsc: ReturnType<typeof stale>) => project({ id, search: { gsc, bing: bingStale } });
  const store = new MemStore(emptyBase({ projects: [proj('fresh', stale(1, 1)), proj('due', stale(13, 2)), proj('full', stale(20, 8)), proj('never', stale(13, null))] }), [provider('gsc'), provider('bing_webmaster', { credential: { stored: true, last_four: 'x', status: 'stored_unverified', updated_at: daysAgo(1) } })]);
  const calls: string[] = [];
  const deps = depsOf(store, {
    rules: [], syncSearch: (call) => { calls.push(`${call.projectId}:${call.source}:${call.days}:${call.domain}`); return Promise.resolve({ ok: call.projectId !== 'full', rows_upserted: 1, error: call.projectId === 'full' ? 'gsc_forbidden' : undefined }); },
  });
  const r = await runAuditForOrganization(deps, ORG, { trigger: 'schedule' });
  assertEquals(calls, ['due:gsc:7:site.example.com', 'full:gsc:90:site.example.com', 'never:gsc:90:site.example.com']);
  assertEquals(store.marks, [['due', 'gsc', false], ['never', 'gsc', true]]); // 'full' falhou: sem marca
  assertEquals((r.detail.syncs as Array<{ ok: boolean }>).map((s) => s.ok), [true, false, true]);
});

Deno.test('sincronização: skipActions=true (reavaliação após correção) não roda testes nem sincronizações', async () => {
  const store = new MemStore(emptyBase({ projects: [project({ search: { gsc: { rows: 1, last_day: null, last_synced_at: daysAgo(3), last_full_sync_at: daysAgo(1) }, bing: { rows: 0, last_day: null, last_synced_at: null, last_full_sync_at: null } } })] }), [provider('gsc', { last_health: null })]);
  let touched = 0;
  const deps = depsOf(store, { rules: [], healthChecks: () => { touched++; return Promise.resolve([]); }, syncSearch: () => { touched++; return Promise.resolve({ ok: true, rows_upserted: 0 }); } });
  await runAuditForOrganization(deps, ORG, { trigger: 'manual', skipActions: true, recordRun: false });
  assertEquals(touched, 0);
});

Deno.test('runCron: mais antigas primeiro, respeita orçamento total, conta ocupadas como puladas e erros', async () => {
  let t = 0;
  const order: string[] = [];
  const summary = (open: number, status: 'ok' | 'error' = 'ok') => ({ id: 1, trigger: 'schedule' as const, started_at: '', finished_at: '', status, rules_evaluated: 1, findings_opened: open, findings_resolved: 1, detail: {} });
  const r = await runCron({
    organizationIds: ['recent', 'never', 'old', 'busy', 'boom'],
    lastRunAt: { recent: hoursAgo(1), old: hoursAgo(20), busy: hoursAgo(5), boom: hoursAgo(6) }, now: () => t, totalBudgetMs: 100,
    runOne: (id) => { order.push(id); t += 30; if (id === 'busy') return Promise.reject(new AuditBusyError()); if (id === 'boom') return Promise.reject(new Error('x')); return Promise.resolve(summary(2, id === 'old' ? 'error' : 'ok')); },
  });
  assertEquals(order, ['never', 'old', 'boom', 'busy']); // 'recent' (a mais nova) ficou sem tempo: 4 x 30 ms > 100 ms
  assertEquals(r, { organizations: 2, findings_opened: 4, findings_resolved: 2, skipped: 2, errors: 2 }); // skipped = busy + recent; errors = old (status error) + boom
  const none = await runCron({ organizationIds: [], lastRunAt: {}, runOne: () => Promise.reject(new Error('n')), now: () => 0 });
  assertEquals(none, { organizations: 0, findings_opened: 0, findings_resolved: 0, skipped: 0, errors: 0 });
});
