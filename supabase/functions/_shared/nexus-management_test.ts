/**
 * Testes do plano de gerenciamento (gestor x cliente): capacidade `can_manage_technical`, política por ação, visão do cliente
 * (sem campos técnicos), achados filtrados, solicitações e integrações do projeto. Sem rede e sem banco.
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-management_test.ts
 */
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { buildProvidersOverview } from "./nexus-providers.ts";
import {
  canManagerOperateOnForeignProject, checkActionPolicy, findingsForViewer, ga4ErrorStatus, integrationsRpcError, integrationsView, isManagerOnlyAction, isSystemRuleId,
  isCollectionPlanning, isTechnicalAction, isUuid, loadViewer, MANAGER_ONLY_ACTIONS, MEMBER_ACTIONS, makeManagementStore, normalizeGscProperty, parseIntegrationsInput, parseRequestCreate,
  parseRequestsFilter, parseRequestUpdate, redactFindingForClient, redactOverviewForClient, requestRpcError, resolveViewer, simpleStatus, TECHNICAL_ACTIONS,
  type ManagementStore, type Viewer,
} from "./nexus-management.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-11-13T12:00:00Z");

// ---------------------------------------------------------------------------
// Capacidade: gestor, owner de org interna, owner de org cliente, membro
// ---------------------------------------------------------------------------
Deno.test("can_manage_technical — matriz: gestor, owner/admin de org interna, owner/admin de org cliente, membros", () => {
  const v = (isManager: boolean, orgKind: string | null, memberRole: string | null, isOrgOwner = false) => resolveViewer({ isManager, orgKind, memberRole, isOrgOwner });
  // gestor (CEO): sempre, em qualquer organização
  assertEquals(v(true, "client", null), { role: "manager", can_manage_technical: true });
  assertEquals(v(true, "internal", "viewer"), { role: "manager", can_manage_technical: true });
  assertEquals(v(true, null, null), { role: "manager", can_manage_technical: true });
  // organização interna: owner e admin passam (inclusive o dono registrado só em organizations.owner_user_id)
  assertEquals(v(false, "internal", "owner"), { role: "org_admin", can_manage_technical: true });
  assertEquals(v(false, "internal", "admin"), { role: "org_admin", can_manage_technical: true });
  assertEquals(v(false, "internal", null, true), { role: "org_admin", can_manage_technical: true });
  // organização interna: os demais papéis não
  for (const role of ["editor", "viewer", "campaign_manager", null]) assertEquals(v(false, "internal", role), { role: "client", can_manage_technical: false }, String(role));
  // organização cliente: nem o owner (por vínculo ou por owner_user_id)
  for (const role of ["owner", "admin", "editor", "viewer", "campaign_manager"]) assertEquals(v(false, "client", role), { role: "client", can_manage_technical: false }, role);
  assertEquals(v(false, "client", null, true), { role: "client", can_manage_technical: false });
  assertEquals(v(false, "client", "owner", true), { role: "client", can_manage_technical: false });
  // tipo desconhecido ou ausente é tratado como cliente
  for (const kind of [null, "", "partner", "INTERNAL", "internal "]) assertEquals(v(false, kind, "owner", true), { role: "client", can_manage_technical: false }, String(kind));
});

function fakeStore(over: Partial<{ manager: boolean; kind: string | null; owner: string | null; role: string | null; orgMissing: boolean }> = {}): ManagementStore {
  const o = { manager: false, kind: "client", owner: null, role: null, orgMissing: false, ...over };
  return {
    isManagerUser: async () => o.manager,
    orgInfo: async () => (o.orgMissing ? null : { kind: o.kind, owner_user_id: o.owner }),
    activeMemberRole: async () => o.role,
  };
}

Deno.test("loadViewer — combina gestor, organização e vínculo ativo; ausência de dados nunca concede acesso", async () => {
  assertEquals(await loadViewer(fakeStore({ manager: true, role: null }), ORG, USER), { viewer: { role: "manager", can_manage_technical: true }, isMember: true, orgKind: "client" });
  assertEquals(await loadViewer(fakeStore({ kind: "internal", role: "owner" }), ORG, USER), { viewer: { role: "org_admin", can_manage_technical: true }, isMember: true, orgKind: "internal" });
  assertEquals(await loadViewer(fakeStore({ kind: "internal", owner: USER, role: null }), ORG, USER), { viewer: { role: "org_admin", can_manage_technical: true }, isMember: false, orgKind: "internal" });
  assertEquals(await loadViewer(fakeStore({ kind: "client", role: "owner", owner: USER }), ORG, USER), { viewer: { role: "client", can_manage_technical: false }, isMember: true, orgKind: "client" });
  assertEquals(await loadViewer(fakeStore({ orgMissing: true, role: "owner" }), ORG, USER), { viewer: { role: "client", can_manage_technical: false }, isMember: true, orgKind: null });
  assertEquals((await loadViewer(fakeStore({ kind: "internal", owner: OTHER, role: null }), ORG, USER)).viewer.can_manage_technical, false, "owner de outro usuário não conta");
});

Deno.test("makeManagementStore — o gestor vem de app_metadata (nunca de user_metadata); falha de leitura = não gestor; consulta memoizada", async () => {
  let getUserCalls = 0;
  const users: Record<string, { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | "erro" | "lança"> = {
    ceo: { app_metadata: { app_role: "ceo" } },
    spoof: { app_metadata: {}, user_metadata: { app_role: "ceo" } },
    comum: { app_metadata: { app_role: "viewer" } },
    erro: "erro", lanca: "lança",
  };
  const admin = {
    auth: { admin: { async getUserById(id: string) {
      getUserCalls++;
      const u = users[id];
      if (u === "lança") throw new Error("auth fora");
      if (u === "erro" || !u) return { data: { user: null }, error: { message: "x" } };
      return { data: { user: u }, error: null };
    } } },
    from(table: string) {
      const b = {
        select() { return b; }, eq() { return b; },
        maybeSingle: async () => table === "organizations" ? { data: { kind: "internal", owner_user_id: USER }, error: null } : { data: { role: "admin" }, error: null },
      };
      return b;
    },
  } as unknown as SupabaseClient;
  const store = makeManagementStore(admin);
  assertEquals(await store.isManagerUser("ceo"), true);
  assertEquals(await store.isManagerUser("ceo"), true);
  assertEquals(getUserCalls, 1, "memoizado por requisição");
  assertEquals(await store.isManagerUser("spoof"), false);
  assertEquals(await store.isManagerUser("comum"), false);
  assertEquals(await store.isManagerUser("erro"), false);
  assertEquals(await store.isManagerUser("lanca"), false);
  assertEquals(await store.orgInfo(ORG), { kind: "internal", owner_user_id: USER });
  assertEquals(await store.activeMemberRole(ORG, USER), "admin");
});

// ---------------------------------------------------------------------------
// Política por ação
// ---------------------------------------------------------------------------
const MANAGER: Viewer = { role: "manager", can_manage_technical: true };
const ORG_ADMIN: Viewer = { role: "org_admin", can_manage_technical: true };
const CLIENT: Viewer = { role: "client", can_manage_technical: false };

Deno.test("política — as ações técnicas do contrato exigem can_manage_technical (403 manager_required) e request_update exige o gestor", () => {
  const contract = ["store_credential", "provider_credential_remove", "execution_settings_set", "provider_health_check", "search_performance_sync", "ga4_sync", "project_integrations_set"];
  for (const a of contract) {
    assert(isTechnicalAction(a), a);
    assertEquals(checkActionPolicy(a, CLIENT), { ok: false, error: "manager_required" }, a);
    assertEquals(checkActionPolicy(a, ORG_ADMIN), { ok: true }, a);
    assertEquals(checkActionPolicy(a, MANAGER), { ok: true }, a);
  }
  // decisão: vincular plugin e ajustar o schema público também são técnicos
  for (const a of ["signals_key_create", "signals_key_rotate", "homepage_schema_sync"]) assertEquals(checkActionPolicy(a, CLIENT), { ok: false, error: "manager_required" }, a);
  assert(isManagerOnlyAction("request_update"));
  assertEquals(checkActionPolicy("request_update", CLIENT), { ok: false, error: "manager_required" });
  assertEquals(checkActionPolicy("request_update", ORG_ADMIN), { ok: false, error: "manager_required" }, "admin de org interna não é o gestor");
  assertEquals(checkActionPolicy("request_update", MANAGER), { ok: true });
  assertEquals([...MANAGER_ONLY_ACTIONS], ["request_update"]);
});

Deno.test("política — leituras e solicitações são de qualquer membro; ações fora da matriz seguem as regras antigas", () => {
  for (const a of ["providers_overview", "search_performance", "ga4_summary", "content_performance", "request_create", "requests_list", "project_integrations_get"]) {
    assert(MEMBER_ACTIONS.includes(a as typeof MEMBER_ACTIONS[number]), a);
    assertFalse(isTechnicalAction(a), a);
    assertEquals(checkActionPolicy(a, CLIENT), { ok: true }, a);
  }
  // `execute` continua aberto ao dono do projeto (a revisão editorial passa por ele); a coleta paga é travada por tipo de operação
  for (const a of ["status", "observatory", "prepare", "execute", "inexistente", undefined, 3]) assertEquals(checkActionPolicy(a, CLIENT), { ok: true }, String(a));
  // decisão do dono (13/11/2026): a rodada paga de coleta (serp, ai_observation) só pela conta de gerenciamento
  assert(isTechnicalAction("execute_collection"));
  assertEquals(checkActionPolicy("execute_collection", CLIENT), { ok: false, error: "manager_required" }, "cliente não dispara coleta paga");
  assertEquals(checkActionPolicy("execute_collection", MANAGER), { ok: true });
  assertEquals(checkActionPolicy("execute_collection", ORG_ADMIN), { ok: true }, "admin de org interna gerencia o técnico");
  // não há ação técnica na lista de leitura
  assertEquals(TECHNICAL_ACTIONS.filter((a) => (MEMBER_ACTIONS as readonly string[]).includes(a)), []);
});

Deno.test("gestor opera projetos de outras organizações só nas ações de Motores & APIs", () => {
  for (const a of ["ga4_sync", "ga4_summary", "providers_overview", "store_credential", "requests_list", "request_update", "project_integrations_set"]) assert(canManagerOperateOnForeignProject(a), a);
  for (const a of ["execute", "prepare", "record_conversion", "apply_link", "status", "request_create", undefined]) assertFalse(canManagerOperateOnForeignProject(a), String(a));
});

// ---------------------------------------------------------------------------
// Visão do cliente
// ---------------------------------------------------------------------------
const RAW_OVERVIEW = {
  providers: [
    { provider: "gsc", credential: { stored: true, last_four: "k3y9", status: "active", updated_at: "2026-11-13T08:00:00Z" },
      last_health: { checked_at: "2026-11-13T10:00:00Z", ok: true, latency_ms: 412, http_status: 200, detail: "Conexão válida: 3 propriedade(s) acessível(is) no Search Console", quota: { label: "Cota", remaining: 50, limit: 100 }, cost_micros: 0 },
      checks_7d: 10, ok_7d: 10, avg_latency_ms_7d: 400, usage: { valid_30d: 4, failed_30d: 1, uncertain_30d: 0, last_success_at: "2026-11-12T10:00:00Z" } },
    { provider: "ga4", credential: { stored: true, last_four: "z7q1", status: "invalid", updated_at: "2026-11-12T08:00:00Z" },
      last_health: { checked_at: "2026-11-13T09:00:00Z", ok: false, latency_ms: 90, http_status: 403, detail: "Sem acesso: ative a Google Analytics Data API (HTTP 403)", quota: null, cost_micros: 0 },
      checks_7d: 4, ok_7d: 0, avg_latency_ms_7d: 90, usage: {} },
    { provider: "openai", credential: { stored: true, last_four: "ab12", status: "stored_unverified", updated_at: "2026-11-13T11:00:00Z" }, last_health: null, checks_7d: 0, ok_7d: 0, avg_latency_ms_7d: null, usage: {} },
  ],
  program: { execution_enabled: true, budget_usd_micros: 5_000_000, reserved_usd_micros: 1000, consumed_usd_micros: 2000, settings: { providers_enabled: ["openai"] } },
};

Deno.test("providers_overview para quem não gerencia — sem últimos 4 dígitos, detalhe de saúde, quota, latência, pontuação nem orçamento", () => {
  const full = buildProvidersOverview(RAW_OVERVIEW, ORG, NOW);
  const red = redactOverviewForClient(full);
  const dump = JSON.stringify(red);
  for (const leak of ["k3y9", "z7q1", "ab12", "Conexão válida", "Sem acesso", "Cota", "412", "last_health", "5000000", "403"]) assertFalse(dump.includes(leak), `vazou: ${leak}`);
  const by = Object.fromEntries(red.providers.map((p) => [p.id, p]));
  assertEquals([by.gsc.simple_status, by.gsc.status], ["connected", "healthy"]);
  assertEquals([by.ga4.simple_status, by.ga4.status], ["attention", "degraded"]);
  assertEquals([by.openai.simple_status, by.openai.status], ["attention", "degraded"]);
  assertEquals([by.serper.simple_status, by.serper.status], ["not_connected", "not_configured"]);
  assertEquals([by.copilot.simple_status, by.copilot.status], ["not_connected", "manual"]);
  for (const p of red.providers) {
    assertEquals([p.credential.last_four, p.credential.status, p.health.last, p.health.avg_latency_ms_7d, p.score, p.enabled], [null, null, null, null, null, false], p.id);
  }
  assertEquals(by.gsc.updated_at, "2026-11-13T10:00:00Z", "última atualização preservada");
  assertEquals(by.gsc.usage.valid_30d, 4, "uso agregado preservado");
  assertEquals(red.program, { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [] });
  assertEquals([red.summary.score, red.summary.connected, red.summary.attention], [null, 3, 2]);
  assertEquals(red.providers.length, full.providers.length);
  // a visão completa (gestor) segue intacta
  assertEquals(full.providers.find((p) => p.id === "gsc")!.credential.last_four, "k3y9");
});

Deno.test("simpleStatus mapeia os status internos para connected | attention | not_connected", () => {
  assertEquals((["healthy", "degraded", "error", "stored_unverified", "not_configured", "manual"] as const).map(simpleStatus), ["connected", "attention", "attention", "attention", "not_connected", "not_connected"]);
});

const finding = (rule_id: string, evidence: Record<string, unknown> = {}) => ({ id: rule_id, rule_id, fix_action: { type: "provider_health_check", params: { provider: "gsc" } } as unknown, evidence });

Deno.test("achados para quem não gerencia — sem regras de sistema, sem fix_action e com evidência reduzida", () => {
  const all = [
    finding("provider.check_failed", { last_four: "k3y9", credential_status: "invalid", http_status: 403, detail: "Sem acesso", latency_ms: 90, checked_at: "x" }),
    finding("search.sync_stale", { hours: 60, last_synced_at: "2026-11-10T00:00:00Z", source: "gsc", last_fix: { by: "uuid-gestor", result: { error: "x" } } }),
    finding("security.rls_off", { rls_disabled_tables: 2, sample: ["t1"] }),
    finding("runtime.function_down", { http_status: 503 }),
    finding("content.internal_links_low", { average_internal_links: 1.4, total_contents: 38 }),
  ];
  const client = findingsForViewer(all, CLIENT);
  assertEquals(client.map((f) => f.rule_id), ["provider.check_failed", "search.sync_stale", "content.internal_links_low"]);
  assert(client.every((f) => f.fix_action === null));
  assertEquals(client[0].evidence, {});
  assertEquals(client[1].evidence, { hours: 60, last_synced_at: "2026-11-10T00:00:00Z", source: "gsc" });
  assertEquals(client[2].evidence, { average_internal_links: 1.4, total_contents: 38 });
  assertFalse(JSON.stringify(client).includes("uuid-gestor"));
  // gestor e admin de organização interna veem tudo, intacto
  assertEquals(findingsForViewer(all, MANAGER), all);
  assertEquals(findingsForViewer(all, ORG_ADMIN).length, 5);
  assert(isSystemRuleId("security.anon_write") && isSystemRuleId("runtime.cron_failing"));
  assertFalse(isSystemRuleId("ga4.sync_stale") || isSystemRuleId("provider.check_failed") || isSystemRuleId("content.area_unclassified_high"));
  assertEquals(redactFindingForClient(all[0]).fix_action, null);
});

// ---------------------------------------------------------------------------
// Solicitações
// ---------------------------------------------------------------------------
Deno.test("request_create — tipo e mensagem (3 a 1000 caracteres, aparada)", () => {
  assertEquals(parseRequestCreate({ kind: "connect_source", message: "  Conectar o GA4 do site  " }), { ok: true, value: { kind: "connect_source", message: "Conectar o GA4 do site" } });
  for (const kind of ["connect_source", "plugin_link", "plugin_update", "new_observation_round", "report", "access", "other"]) assert(parseRequestCreate({ kind, message: "abc" }).ok, kind);
  assertEquals(parseRequestCreate({ kind: "hack", message: "abc" }), { ok: false, error: "request_kind_invalid" });
  assertEquals(parseRequestCreate({ message: "abc" }), { ok: false, error: "request_kind_invalid" });
  assertEquals(parseRequestCreate({ kind: "other", message: "ab" }), { ok: false, error: "request_message_invalid" });
  assertEquals(parseRequestCreate({ kind: "other", message: "   a  " }), { ok: false, error: "request_message_invalid" });
  assertEquals(parseRequestCreate({ kind: "other", message: "x".repeat(1001) }), { ok: false, error: "request_message_invalid" });
  assert(parseRequestCreate({ kind: "other", message: "x".repeat(1000) }).ok);
  assertEquals(parseRequestCreate({ kind: "other", message: 123 }), { ok: false, error: "request_message_invalid" });
});

Deno.test("requests_list — filtro de status opcional e validado", () => {
  assertEquals(parseRequestsFilter({}), { ok: true, value: { status: null } });
  assertEquals(parseRequestsFilter({ status: "" }), { ok: true, value: { status: null } });
  assertEquals(parseRequestsFilter({ status: "in_progress" }), { ok: true, value: { status: "in_progress" } });
  assertEquals(parseRequestsFilter({ status: "pendente" }), { ok: false, error: "request_status_invalid" });
  assertEquals(parseRequestsFilter({ status: 1 }), { ok: false, error: "request_status_invalid" });
});

Deno.test("request_update — status e managerNote; resolved_at acompanha concluída/recusada; nada para atualizar é 400", () => {
  const now = new Date(NOW).toISOString();
  assertEquals(parseRequestUpdate({ id: ORG, status: "done" }, now), { ok: true, value: { id: ORG, patch: { status: "done", resolved_at: now } } });
  assertEquals(parseRequestUpdate({ id: ORG, status: "rejected", managerNote: "  Fora do plano  " }, now), { ok: true, value: { id: ORG, patch: { status: "rejected", resolved_at: now, manager_note: "Fora do plano" } } });
  assertEquals(parseRequestUpdate({ id: ORG, status: "in_progress" }, now), { ok: true, value: { id: ORG, patch: { status: "in_progress", resolved_at: null } } });
  assertEquals(parseRequestUpdate({ id: ORG, status: "open" }, now), { ok: true, value: { id: ORG, patch: { status: "open", resolved_at: null } } });
  assertEquals(parseRequestUpdate({ id: ORG, managerNote: "   " }, now), { ok: true, value: { id: ORG, patch: { manager_note: null } } });
  assertEquals(parseRequestUpdate({ id: ORG, managerNote: null }, now), { ok: true, value: { id: ORG, patch: { manager_note: null } } });
  assertEquals(parseRequestUpdate({ id: ORG }, now), { ok: false, error: "nothing_to_update" });
  assertEquals(parseRequestUpdate({ id: "x", status: "done" }, now), { ok: false, error: "request_id_required" });
  assertEquals(parseRequestUpdate({ status: "done" }, now), { ok: false, error: "request_id_required" });
  assertEquals(parseRequestUpdate({ id: ORG, status: "feito" }, now), { ok: false, error: "request_status_invalid" });
  assertEquals(parseRequestUpdate({ id: ORG, managerNote: "x".repeat(1001) }, now), { ok: false, error: "manager_note_invalid" });
  assertEquals(parseRequestUpdate({ id: ORG, managerNote: 5 }, now), { ok: false, error: "manager_note_invalid" });
  assert(isUuid(ORG) && !isUuid("1234") && !isUuid(null));
});

Deno.test("erros do RPC de solicitações viram HTTP estável (429 too_many_open_requests)", () => {
  assertEquals(requestRpcError("too_many_open_requests"), { error: "too_many_open_requests", status: 429 });
  assertEquals(requestRpcError("P0001: request_kind_invalid"), { error: "request_kind_invalid", status: 400 });
  assertEquals(requestRpcError("request_message_invalid"), { error: "request_message_invalid", status: 400 });
  assertEquals(requestRpcError("organization_membership_required"), { error: "organization_membership_required", status: 403 });
  assertEquals(requestRpcError("project_forbidden"), { error: "project_forbidden", status: 403 });
  assertEquals(requestRpcError("deadlock detected qualquer coisa"), { error: "request_not_created", status: 500 });
  assertEquals(requestRpcError(undefined), { error: "request_not_created", status: 500 });
});

// ---------------------------------------------------------------------------
// Integrações do projeto
// ---------------------------------------------------------------------------
Deno.test("project_integrations_set — ID GA4 só dígitos (5 a 15), vazio remove; propriedade GSC validada; ao menos um campo", () => {
  assertEquals(parseIntegrationsInput({ ga4PropertyId: " 123456789 " }), { ok: true, value: { setGa4: true, ga4: "123456789", setGsc: false, gsc: "" } });
  assertEquals(parseIntegrationsInput({ ga4PropertyId: 123456789 }), { ok: true, value: { setGa4: true, ga4: "123456789", setGsc: false, gsc: "" } });
  assertEquals(parseIntegrationsInput({ ga4PropertyId: "" }), { ok: true, value: { setGa4: true, ga4: "", setGsc: false, gsc: "" } });
  assertEquals(parseIntegrationsInput({ ga4PropertyId: null }), { ok: true, value: { setGa4: true, ga4: "", setGsc: false, gsc: "" } });
  for (const bad of ["1234", "1234567890123456", "properties/123456", "12345a", "123 456", "-12345"]) assertEquals(parseIntegrationsInput({ ga4PropertyId: bad }), { ok: false, error: "ga4_property_invalid" }, bad);
  assertEquals(parseIntegrationsInput({ ga4PropertyId: { x: 1 } }), { ok: false, error: "ga4_property_invalid" });
  assertEquals(parseIntegrationsInput({ gscProperty: "SC-DOMAIN:Exemplo.com.br" }).ok, false, "prefixo em maiúsculas não é aceito");
  assertEquals(parseIntegrationsInput({ gscProperty: "sc-domain:Exemplo.com.br" }), { ok: true, value: { setGa4: false, ga4: "", setGsc: true, gsc: "sc-domain:exemplo.com.br" } });
  assertEquals(parseIntegrationsInput({ gscProperty: "" }), { ok: true, value: { setGa4: false, ga4: "", setGsc: true, gsc: "" } });
  assertEquals(parseIntegrationsInput({ gscProperty: "https://exemplo.com.br/blog/", ga4PropertyId: "99999" }), { ok: true, value: { setGa4: true, ga4: "99999", setGsc: true, gsc: "https://exemplo.com.br/blog/" } });
  assertEquals(parseIntegrationsInput({ gscProperty: "ftp://x.com" }), { ok: false, error: "gsc_property_invalid" });
  assertEquals(parseIntegrationsInput({ gscProperty: 5 }), { ok: false, error: "gsc_property_invalid" });
  assertEquals(parseIntegrationsInput({}), { ok: false, error: "nothing_to_update" });
  assertEquals(parseIntegrationsInput({ projectId: ORG, action: "project_integrations_set" }), { ok: false, error: "nothing_to_update" });
});

Deno.test("normalizeGscProperty — domínio, prefixo de URL, sem credenciais, sem espaços, até 200", () => {
  assertEquals(normalizeGscProperty("sc-domain:rdmadvogados.com.br"), "sc-domain:rdmadvogados.com.br");
  assertEquals(normalizeGscProperty("https://www.rdmadvogados.com.br/"), "https://www.rdmadvogados.com.br/");
  assertEquals(normalizeGscProperty("http://rdmadvogados.com.br/"), "http://rdmadvogados.com.br/");
  for (const bad of ["", "sc-domain:", "sc-domain:semponto", "sc-domain:a..b.com", "sc-domain:a b.com", "https://user:pw@x.com/", "https://localhost/", "javascript:alert(1)", "https://x.com/ com espaço", `https://x.com/${"a".repeat(200)}`, "sc-domain:x\n.com"]) assertEquals(normalizeGscProperty(bad), null, JSON.stringify(bad));
});

Deno.test("integrações: o gestor vê os valores; os demais só veem se estão configuradas (nunca o ID)", () => {
  const info = { ga4_property_id: "123456789", gsc_property: "sc-domain:x.com.br", schema_profile: { secreto: true } };
  assertEquals(integrationsView(info, true), { ga4_property_id: "123456789", gsc_property: "sc-domain:x.com.br" });
  assertEquals(integrationsView(info, false), { ga4_configured: true, gsc_configured: true });
  assertEquals(integrationsView({}, false), { ga4_configured: false, gsc_configured: false });
  assertEquals(integrationsView(null, true), { ga4_property_id: null, gsc_property: null });
  assertEquals(integrationsView({ ga4_property_id: "  ", gsc_property: 3 }, true), { ga4_property_id: null, gsc_property: null });
  assertFalse(JSON.stringify(integrationsView(info, false)).includes("123456789"));
  assertFalse(JSON.stringify(integrationsView(info, false)).includes("schema_profile"));
});

Deno.test("erros do RPC de integrações e do ga4_sync mapeiam para HTTP estável", () => {
  assertEquals(integrationsRpcError("ga4_property_already_used"), { error: "ga4_property_already_used", status: 409 });
  assertEquals(integrationsRpcError("ga4_property_invalid"), { error: "ga4_property_invalid", status: 400 });
  assertEquals(integrationsRpcError("gsc_property_invalid"), { error: "gsc_property_invalid", status: 400 });
  assertEquals(integrationsRpcError("project_forbidden"), { error: "project_forbidden", status: 403 });
  assertEquals(integrationsRpcError("boom"), { error: "integrations_not_saved", status: 500 });
  assertEquals(["ga4_not_configured", "ga4_property_required", "ga4_forbidden", "ga4_quota", "ga4_unreachable", "ga4_request_failed", "upsert_failed:x", "secret_unavailable"].map(ga4ErrorStatus), [409, 409, 403, 429, 502, 502, 502, 502]);
});

Deno.test("planejar coleta paga: prepare de serp/ai_observation/pilot, prepare_pilot e prepare_prompt_run são da gestão; editorial não", () => {
  for (const kind of ["serp", "ai_observation", "pilot"]) assert(isCollectionPlanning("prepare", kind), kind);
  assert(isCollectionPlanning("prepare_pilot"));
  assert(isCollectionPlanning("prepare_prompt_run"));
  assertFalse(isCollectionPlanning("prepare", "editorial_review"), "revisão editorial do cliente segue livre");
  assertFalse(isCollectionPlanning("prepare"));
  assertFalse(isCollectionPlanning("prepare", 3));
  for (const a of ["execute", "status", "observatory", "import_observation", "prepare_clusters", "providers_overview", undefined, 7]) assertFalse(isCollectionPlanning(a, "serp"), String(a));
});

Deno.test("OAuth gerenciado (oauth_start/finish/properties/bind) é ação técnica: cliente leva manager_required; gestor e admin de org interna passam", () => {
  for (const a of ["oauth_start", "oauth_finish", "oauth_properties", "oauth_bind"]) {
    assert(isTechnicalAction(a), a);
    assertEquals(checkActionPolicy(a, CLIENT), { ok: false, error: "manager_required" }, a);
    assertEquals(checkActionPolicy(a, MANAGER), { ok: true }, a);
    assertEquals(checkActionPolicy(a, ORG_ADMIN), { ok: true }, a);
  }
});
