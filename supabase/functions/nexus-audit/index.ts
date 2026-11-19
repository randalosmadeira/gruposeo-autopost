// `fetch` original do runtime: primeiro import (mesma regra do nexus-intelligence). Esta função NÃO instala o bloqueio global de gastos
// (nexus-runtime-bootstrap), mas toda requisição de rede do executor passa por createGuardedFetch, que bloqueia endpoints pagos.
import { providerFetch } from '../_shared/nexus-provider-fetch.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { isServiceCredential, RequestAuthError, resolveRequestActor } from '../_shared/request-auth.ts';
import { PLUGIN_VERSION } from '../_shared/plugin-version.ts';
import { FREE_HEALTH_PROVIDERS, runHealthChecks } from '../_shared/nexus-providers.ts';
import { syncSearchPerformance } from '../_shared/nexus-search-sync.ts';
import { isValidPropertyId, syncGa4 } from '../_shared/nexus-ga4.ts';
import { ga4DigitsOf, loadOAuthLink, resolveOAuthSecret, type OAuthSyncProvider } from '../_shared/nexus-oauth-sync.ts';
import { findingsForViewer, isSystemRuleId, loadViewer, makeManagementStore, redactFindingForClient, type ManagementStore } from '../_shared/nexus-management.ts';
import { isPluginModeProject, resolvePluginKey, resolvePluginNamespace } from '../_shared/wordpress-plugin-client.ts';
import {
  AuditBusyError, buildFindingUpdate, buildOverview, buildProjects, COST_HEALTH_PROVIDERS, createGuardedFetch, makeProbe, normalizeCronHealth, normalizeProgram,
  normalizeProviders, normalizeSecurityGrants, parseFixAction, parseUpdateInput, pluginDiscoveryRefresh, runAuditForOrganization, runCron,
  type AuditDeps, type AuditStore, type FindingRow, type FixAction, type RuleId, type RunRow,
} from '../_shared/nexus-audit.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zica-automation-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_COLUMNS = 'id,trigger,started_at,finished_at,status,rules_evaluated,findings_opened,findings_resolved';
const MANUAL_RATE_LIMIT_MS = 60_000;

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Store sobre o Supabase (service role)
// ---------------------------------------------------------------------------
function makeStore(admin: SupabaseClient): AuditStore {
  return {
    async loadBase(orgId) {
      const [program, projects, stats, grants, cron, oauth] = await Promise.all([
        admin.from('nexus_programs').select('execution_enabled,budget_usd_micros,reserved_usd_micros,consumed_usd_micros,settings').eq('organization_id', orgId).maybeSingle(),
        admin.from('projects').select('id,name,domain,wordpress_url,wordpress_connector_mode,wordpress_username,wordpress_plugin_namespace,commercial_info').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100),
        admin.rpc('nexus_audit_project_stats', { p_org: orgId }),
        admin.rpc('nexus_security_grants_audit'),
        admin.rpc('nexus_cron_health', { p_hours: 24 }),
        // conexões OAuth gerenciadas (GSC/GA4/Bing) do projeto: valem como credencial na auditoria e na sincronização
        admin.from('nexus_oauth_connections').select('project_id,provider,property_id,connected_at').eq('organization_id', orgId).limit(500),
      ]);
      if (program.error) throw new Error('program_unavailable');
      if (projects.error) throw new Error('projects_unavailable');
      if (stats.error) throw new Error('project_stats_unavailable');
      return {
        program: normalizeProgram(program.data),
        projects: buildProjects(projects.data || [], stats.data, (row) => isPluginModeProject(row), undefined, oauth.error ? [] : oauth.data || []),
        securityGrants: grants.error ? null : normalizeSecurityGrants(grants.data),
        cronHealth: cron.error ? null : normalizeCronHealth(cron.data),
      };
    },
    async loadProviders(orgId) {
      const { data, error } = await admin.rpc('nexus_providers_overview', { p_org: orgId });
      if (error) throw new Error('providers_overview_unavailable');
      return normalizeProviders(data);
    },
    async hasRunInProgress(orgId, sinceIso) {
      const { count, error } = await admin.from('nexus_audit_runs').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('finished_at', null).gte('started_at', sinceIso);
      if (error) throw new Error('runs_unavailable');
      return (count ?? 0) > 0;
    },
    async lastManualRunAt(orgId) {
      const { data } = await admin.from('nexus_audit_runs').select('started_at').eq('organization_id', orgId).eq('trigger', 'manual').order('started_at', { ascending: false }).limit(1).maybeSingle();
      return data?.started_at ?? null;
    },
    async insertRun(orgId, trigger, startedAtIso) {
      const { data, error } = await admin.from('nexus_audit_runs').insert({ organization_id: orgId, trigger, started_at: startedAtIso }).select('id').single();
      if (error || !data) throw new Error('run_not_created');
      return Number(data.id);
    },
    async finishRun(id, patch) {
      const { error } = await admin.from('nexus_audit_runs').update(patch).eq('id', id);
      if (error) throw new Error('run_not_closed');
    },
    async loadFindings(orgId, ruleIds) {
      const { data, error } = await admin.from('nexus_audit_findings').select('*').eq('organization_id', orgId).in('rule_id', ruleIds).limit(5000);
      if (error) throw new Error('findings_unavailable');
      return (data || []) as FindingRow[];
    },
    async insertFindings(rows) {
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await admin.from('nexus_audit_findings').upsert(rows.slice(i, i + 100), { onConflict: 'organization_id,fingerprint', ignoreDuplicates: true });
        if (error) throw new Error('findings_not_saved');
      }
    },
    async updateFinding(id, patch) {
      const { error } = await admin.from('nexus_audit_findings').update(patch).eq('id', id);
      if (error) throw new Error('finding_not_saved');
    },
    async markSync(orgId, projectId, source, full) {
      await admin.rpc('nexus_audit_mark_sync', { p_org: orgId, p_project: projectId, p_source: source, p_full: full });
    },
  };
}

async function resolveDns(host: string): Promise<string[]> {
  const [a, aaaa] = await Promise.all([Deno.resolveDns(host, 'A').catch(() => [] as string[]), Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])]);
  return [...a, ...aaaa];
}

function buildDeps(admin: SupabaseClient, organizationId: string): AuditDeps {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  let ownHost = '';
  try { ownHost = new URL(supabaseUrl).hostname; } catch { ownHost = ''; }
  const guarded = (deadlineMs: number) => createGuardedFetch(providerFetch, { deadlineMs });
  const googleApp = () => ({ clientId: Deno.env.get('NEXUS_GOOGLE_OAUTH_CLIENT_ID') || '', clientSecret: Deno.env.get('NEXUS_GOOGLE_OAUTH_CLIENT_SECRET') || '' });
  const readOrgSecret = async (provider: string) => {
    const { data, error } = await admin.rpc('nexus_provider_secret_read', { p_org: organizationId, p_provider: provider });
    return error || typeof data !== 'string' || !data ? null : data;
  };
  /** Segredo da fonte: conexão OAuth do projeto primeiro (GSC/GA4); senão a credencial da organização. Falha da conexão só aparece se não houver a outra. */
  const secretFor = (projectId: string, fetchFn: typeof fetch) => async (provider: string): Promise<string | null> => {
    if (provider === 'gsc' || provider === 'ga4') {
      let failure: unknown = null;
      try {
        const viaOAuth = await resolveOAuthSecret(admin, fetchFn, googleApp(), organizationId, projectId, provider as OAuthSyncProvider);
        if (viaOAuth) return viaOAuth;
      } catch (e) { failure = e; }
      const org = await readOrgSecret(provider);
      if (org) return org;
      if (failure) throw failure;
      return null;
    }
    return readOrgSecret(provider);
  };
  return {
    store: makeStore(admin),
    now: Date.now,
    pluginVersion: PLUGIN_VERSION,
    functionsBaseUrl: ownHost ? supabaseUrl : null,
    freeHealthProviders: FREE_HEALTH_PROVIDERS,
    healthChecks: (o) => runHealthChecks(admin, o),
    syncSearch: async (call, fetchFn) => {
      // propriedade do GSC: a do projeto; senão a escolhida na conexão OAuth
      const property = call.property || (call.source === 'gsc' ? (await loadOAuthLink(admin, organizationId, call.projectId, 'gsc'))?.property_id || undefined : undefined);
      const { results } = await syncSearchPerformance(admin, {
        organizationId, projectId: call.projectId, source: call.source, days: call.days, fetchFn, domain: call.domain, property,
        resolveSecret: secretFor(call.projectId, fetchFn),
      });
      const r = results[0];
      return { ok: r?.ok === true, rows_upserted: r?.rows_upserted ?? 0, error: r?.error };
    },
    syncAnalytics: async (call, fetchFn) => {
      const out = await syncGa4(admin, {
        organizationId, projectId: call.projectId, days: call.days, fetchFn, property: call.property,
        resolveSecret: secretFor(call.projectId, fetchFn),
      });
      const r = out.results[0];
      return { ok: r?.ok === true, rows_upserted: out.rows_upserted, error: r?.error };
    },
    makeProbe: (deadlineMs) => makeProbe({ fetchFn: guarded(deadlineMs), deadlineMs, trustedHosts: ownHost ? [ownHost] : [], resolveDns }),
    guardedFetch: guarded,
  };
}

/** Projeto da organização: do usuário; para o gestor (CEO), de qualquer organização (ele opera as organizações clientes). */
async function loadProject(admin: SupabaseClient, mgmt: ManagementStore, projectId: string, userId: string): Promise<{ id: string; organization_id: string | null } | null> {
  const own = await admin.from('projects').select('id,organization_id').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (own.data) return own.data as { id: string; organization_id: string | null };
  if (own.error || !(await mgmt.isManagerUser(userId))) return null;
  const foreign = await admin.from('projects').select('id,organization_id').eq('id', projectId).maybeSingle();
  return (foreign.data as { id: string; organization_id: string | null } | null) ?? null;
}

// ---------------------------------------------------------------------------
// apply_fix: SOMENTE os cinco tipos da lista branca (inclui analytics_sync); nenhum faz chamada paga
// ---------------------------------------------------------------------------
type FixOutcome = { ok: boolean; result: Record<string, unknown>; error?: { code: string; status: number }; navigationOnly?: boolean };
async function executeFix(admin: SupabaseClient, deps: AuditDeps, finding: FindingRow, fix: FixAction, actorUserId: string): Promise<FixOutcome> {
  const org = finding.organization_id;
  const params = fix.params;
  const fetchFn = deps.guardedFetch(Date.now() + 40_000);
  const projectOf = async (value: unknown) => {
    const id = str(value, 36);
    if (!UUID.test(id)) return null;
    const { data } = await admin.from('projects').select('*').eq('id', id).eq('organization_id', org).maybeSingle();
    return data as Record<string, unknown> | null;
  };
  switch (fix.type) {
    case 'open_route': {
      const route = str(params.route, 120);
      if (!route.startsWith('/nexus')) return { ok: false, result: {}, error: { code: 'route_not_allowed', status: 400 } };
      return { ok: true, navigationOnly: true, result: { route, section: str(params.section, 60) || null } };
    }
    case 'provider_health_check': {
      const provider = str(params.provider, 30);
      if (!(FREE_HEALTH_PROVIDERS as readonly string[]).includes(provider) || (COST_HEALTH_PROVIDERS as readonly string[]).includes(provider)) {
        return { ok: false, result: {}, error: { code: 'paid_check_not_allowed', status: 400 } };
      }
      const res = await deps.healthChecks({ organizationId: org, triggeredBy: actorUserId, providers: [provider], confirmCost: false, fetchFn });
      const r = res[0];
      return { ok: r?.ok === true, result: { provider, ok: r?.ok === true, skipped: r?.skipped ?? null, latency_ms: r?.latency_ms ?? null, http_status: r?.http_status ?? null, detail: r?.detail ? String(r.detail).slice(0, 200) : null } };
    }
    case 'search_performance_sync': {
      const project = await projectOf(params.projectId);
      if (!project) return { ok: false, result: {}, error: { code: 'project_not_found', status: 404 } };
      const source = params.source === 'bing' ? 'bing' : params.source === 'gsc' ? 'gsc' : null;
      if (!source) return { ok: false, result: {}, error: { code: 'source_invalid', status: 400 } };
      const days = Math.min(90, Math.max(1, Math.floor(Number(params.days) || 7)));
      const domain = str(project.domain, 253).replace(/^https?:\/\//i, '').replace(/\/.*$/, '') || (() => { try { return new URL(String(project.wordpress_url)).hostname; } catch { return ''; } })();
      if (!domain) return { ok: false, result: {}, error: { code: 'project_without_domain', status: 409 } };
      const info = (project.commercial_info && typeof project.commercial_info === 'object' ? project.commercial_info : {}) as Record<string, unknown>;
      const r = await deps.syncSearch({ projectId: String(project.id), source, days, domain, property: typeof info.gsc_property === 'string' ? info.gsc_property : undefined }, fetchFn);
      if (r.ok) await deps.store.markSync(org, String(project.id), source, false);
      return { ok: r.ok, result: { source, days, rows_upserted: r.rows_upserted, error: r.error ?? null } };
    }
    case 'analytics_sync': {
      const project = await projectOf(params.projectId);
      if (!project) return { ok: false, result: {}, error: { code: 'project_not_found', status: 404 } };
      const info = (project.commercial_info && typeof project.commercial_info === 'object' ? project.commercial_info : {}) as Record<string, unknown>;
      const property = (typeof info.ga4_property_id === 'string' ? info.ga4_property_id.trim() : '')
        || ga4DigitsOf((await loadOAuthLink(admin, org, String(project.id), 'ga4'))?.property_id) || '';
      if (!isValidPropertyId(property)) return { ok: false, result: {}, error: { code: 'ga4_property_required', status: 409 } };
      if (!deps.syncAnalytics) return { ok: false, result: {}, error: { code: 'analytics_sync_unavailable', status: 500 } };
      const days = Math.min(90, Math.max(1, Math.floor(Number(params.days) || 7)));
      const r = await deps.syncAnalytics({ projectId: String(project.id), days, property }, fetchFn);
      if (r.ok) await deps.store.markSync(org, String(project.id), 'ga4', false);
      return { ok: r.ok, result: { source: 'ga4', days, rows_upserted: r.rows_upserted, error: r.error ?? null } };
    }
    case 'plugin_discovery_refresh': {
      const project = await projectOf(params.projectId);
      if (!project) return { ok: false, result: {}, error: { code: 'project_not_found', status: 404 } };
      if (!isPluginModeProject(project) || !project.wordpress_url) return { ok: false, result: {}, error: { code: 'plugin_not_configured', status: 409 } };
      let apiKey: string;
      try { apiKey = (await resolvePluginKey(admin, project)).apiKey; } catch { return { ok: false, result: {}, error: { code: 'plugin_credential_unavailable', status: 409 } }; }
      const r = await pluginDiscoveryRefresh(fetchFn, String(project.wordpress_url), apiKey, resolvePluginNamespace(project));
      return { ok: r.ok, result: { http_status: r.status, detail: r.detail ?? null } };
    }
  }
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    let body: Record<string, unknown> = {};
    try { const parsed = await req.json(); if (parsed && typeof parsed === 'object') body = parsed; } catch { body = {}; }

    // ---- modo cron: segredo interno, sem usuário ----
    const automationKey = req.headers.get('x-zica-automation-key') || '';
    const bearer = (req.headers.get('Authorization') || '').startsWith('Bearer ') ? (req.headers.get('Authorization') || '').slice(7).trim() : '';
    if (automationKey || body.cron === true) {
      let authorized = false;
      if (automationKey) {
        const { data: rows } = await admin.from('automation_ingress_keys').select('secret_hash').eq('name', 'nexus-audit').eq('enabled', true);
        const hash = await sha256Hex(automationKey);
        authorized = (rows || []).some((r: { secret_hash?: string }) => typeof r.secret_hash === 'string' && safeEqual(r.secret_hash, hash));
      } else {
        authorized = isServiceCredential(bearer);
      }
      if (!authorized) return json({ error: 'authorization_required' }, 401);
      const { data: programs, error: programsError } = await admin.from('nexus_programs').select('organization_id').limit(1000);
      if (programsError) return json({ error: 'organizations_unavailable' }, 500);
      const organizationIds = (programs || []).map((p: { organization_id: string }) => p.organization_id);
      const lastRunAt: Record<string, string | undefined> = {};
      const { data: recent } = await admin.from('nexus_audit_runs').select('organization_id,started_at').gte('started_at', new Date(Date.now() - 86_400_000).toISOString()).order('started_at', { ascending: false }).limit(2000);
      for (const r of (recent || []) as Array<{ organization_id: string; started_at: string }>) lastRunAt[r.organization_id] ??= r.started_at;
      const summary = await runCron({
        organizationIds, lastRunAt, now: Date.now,
        runOne: (organizationId) => runAuditForOrganization(buildDeps(admin, organizationId), organizationId, { trigger: 'schedule' }),
      });
      return json(summary);
    }

    // ---- ações de usuário ----
    const actor = await resolveRequestActor(req, typeof body.userId === 'string' ? body.userId : null);
    if (actor.mode !== 'user') return json({ error: 'interactive_user_required' }, 403);
    const action = str(body.action, 30);

    const mgmt = makeManagementStore(admin);

    if (action === 'overview' || action === 'run') {
      const projectId = str(body.projectId, 36);
      if (!UUID.test(projectId)) return json({ error: 'project_required' }, 400);
      const project = await loadProject(admin, mgmt, projectId, actor.userId);
      if (!project?.organization_id) return json({ error: 'project_forbidden' }, 403);
      const org = String(project.organization_id);
      const { viewer, isMember } = await loadViewer(mgmt, org, actor.userId);
      if (!isMember) return json({ error: 'organization_membership_required' }, 403);

      if (action === 'overview') {
        const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const [active, resolved, runs] = await Promise.all([
          admin.from('nexus_audit_findings').select('*').eq('organization_id', org).neq('status', 'resolved').order('last_seen_at', { ascending: false }).limit(500),
          admin.from('nexus_audit_findings').select('*').eq('organization_id', org).eq('status', 'resolved').gte('resolved_at', since).order('resolved_at', { ascending: false }).limit(200),
          admin.from('nexus_audit_runs').select(RUN_COLUMNS).eq('organization_id', org).order('started_at', { ascending: false }).limit(20),
        ]);
        if (active.error || resolved.error || runs.error) return json({ error: 'audit_unavailable' }, 500);
        // Quem não gerencia: sem regras de sistema (security.*/runtime.*), sem fix_action e com evidência reduzida (ver nexus-management.ts).
        const visible = findingsForViewer([...(active.data || []), ...(resolved.data || [])] as FindingRow[], viewer);
        return json({ ...buildOverview(visible, (runs.data || []) as RunRow[], new Date()), viewer: { role: viewer.role, can_manage_technical: viewer.can_manage_technical } });
      }

      if (!viewer.can_manage_technical) return json({ error: 'manager_required' }, 403);
      const store = makeStore(admin);
      const last = await store.lastManualRunAt(org);
      if (last && Date.now() - Date.parse(last) < MANUAL_RATE_LIMIT_MS) return json({ error: 'audit_rate_limited' }, 429);
      try {
        const run = await runAuditForOrganization(buildDeps(admin, org), org, { trigger: 'manual', actorUserId: actor.userId });
        return json({ run });
      } catch (e) {
        if (e instanceof AuditBusyError) return json({ error: 'audit_in_progress' }, 409);
        throw e;
      }
    }

    if (action === 'update_finding' || action === 'apply_fix') {
      const id = str(body.id, 36);
      if (!UUID.test(id)) return json({ error: 'finding_id_required' }, 400);
      const { data: finding } = await admin.from('nexus_audit_findings').select('*').eq('id', id).maybeSingle();
      // quem não é membro recebe 404 (não revela a existência do achado)
      const found = finding ? await loadViewer(mgmt, String(finding.organization_id), actor.userId) : null;
      if (!finding || !found?.isMember) return json({ error: 'finding_not_found' }, 404);
      const viewer = found.viewer;
      const row = finding as FindingRow;
      // regras de sistema não são visíveis (nem alteráveis) por quem não gerencia
      if (!viewer.can_manage_technical && isSystemRuleId(row.rule_id)) return json({ error: 'finding_not_found' }, 404);

      if (action === 'update_finding') {
        const parsed = parseUpdateInput(body);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const built = buildFindingUpdate(row, parsed.value, new Date());
        if (!built.ok) return json({ error: built.error }, 409);
        const { data: updated, error } = await admin.from('nexus_audit_findings').update(built.patch).eq('id', row.id).select('*').single();
        if (error) throw error;
        return json({ finding: viewer.can_manage_technical ? updated : redactFindingForClient(updated as FindingRow) });
      }

      // apply_fix [gestor ou admin de organização interna]
      if (!viewer.can_manage_technical) return json({ error: 'manager_required' }, 403);
      if (row.status === 'resolved') return json({ error: 'finding_not_open' }, 409);
      const fix = parseFixAction(row.fix_action);
      if (!fix.ok) return json({ error: fix.error }, fix.error === 'no_fix_available' ? 409 : 400);
      const deps = buildDeps(admin, row.organization_id);
      const outcome = await executeFix(admin, deps, row, fix.fix, actor.userId);
      if (outcome.error) return json({ error: outcome.error.code }, outcome.error.status);
      if (outcome.navigationOnly) return json({ ok: true, result: outcome.result, finding: row });
      const lastFix = { at: new Date().toISOString(), by: actor.userId, type: fix.fix.type, ok: outcome.ok, result: outcome.result };
      await admin.from('nexus_audit_findings').update({ evidence: { ...(row.evidence || {}), last_fix: lastFix } }).eq('id', row.id);
      // reavalia só a regra deste achado (sem registrar uma execução nova)
      await runAuditForOrganization(deps, row.organization_id, { trigger: 'manual', actorUserId: actor.userId, onlyRules: [row.rule_id as RuleId], skipActions: true, recordRun: false }).catch(() => null);
      const { data: refreshed } = await admin.from('nexus_audit_findings').select('*').eq('id', row.id).maybeSingle();
      return json({ ok: outcome.ok, result: outcome.result, finding: refreshed ?? row });
    }

    return json({ error: 'unsupported_action' }, 400);
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ error: error.code }, error.status);
    console.error('nexus-audit_failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    return json({ error: 'audit_failed' }, 500);
  }
});
