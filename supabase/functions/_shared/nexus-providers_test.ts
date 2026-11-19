/**
 * Testes do núcleo de provedores NEXUS: formatos de credencial, saúde por provedor (fixtures; nenhuma chamada de rede),
 * quota, status/pontuação, resumo, portão de execução e validação de liberação.
 * Executar com: deno test supabase/functions/_shared/nexus-providers_test.ts
 */
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { clearGoogleTokenCache } from "./nexus-gsc.ts";
import {
  buildProvidersOverview, CATALOG_IDS, computeProviderScore, computeProviderStatus, executionGate, FREE_HEALTH_PROVIDERS, HEALTH_ALLOWED_HOSTS, isAllowedHealthUrl,
  PROVIDER_IDS, readBraveQuota, readDataForSeoQuota, readSerpApiQuota, redact, runHealthChecks, runProviderHealthCheck, summarizeProviders, validateCredentialFormat,
  validateExecutionSettings, type HealthSnapshot, type ProviderId,
} from "./nexus-providers.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3600_000;

// ---------------------------------------------------------------------------
// Fixtures de provedores (formatos resumidos)
// ---------------------------------------------------------------------------
const res = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null; redirect?: string };
function recorder(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const call: Call = { url: String(input), method: init?.method || "GET", headers, body: typeof init?.body === "string" ? init.body : null, redirect: init?.redirect };
    calls.push(call);
    return Promise.resolve(handler(call));
  }) as typeof fetch;
  return { fetchFn, calls };
}

const SECRETS: Record<string, string> = {
  bing_webmaster: "bingkey_1234567890ABCD",
  dataforseo: "login@example.com:pass-Word-123",
  serpapi: "serpapikey_1234567890",
  openai: "sk-test-0000000000000000",
  gemini: "AIzaTest0000000000000000",
  anthropic: "sk-ant-test-000000000000",
  serper: "serperkey_1234567890",
  brave: "bravekey_1234567890",
  perplexity: "pplx-test-00000000000",
};
type Fixture = { ok: () => Response; unauthorized: () => Response; urlStart: string; method: string; cost: number; invalidHttp: number; authHeader: (h: Record<string, string>, secret: string) => boolean };
const FIXTURES: Record<Exclude<ProviderId, "gsc" | "ga4">, Fixture> = {
  bing_webmaster: {
    ok: () => res({ d: [{ Url: "https://www.exemplo.com.br/", IsVerified: true }] }),
    unauthorized: () => res({ ErrorCode: 3, Message: "ERROR!!! InvalidApiKey" }, 400),
    urlStart: "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=", method: "GET", cost: 0, invalidHttp: 400, authHeader: () => true,
  },
  dataforseo: {
    ok: () => res({ status_code: 20000, tasks: [{ result: [{ money: { total: 50, balance: 12.34567 } }] }] }),
    unauthorized: () => res({ status_code: 40100, status_message: "Authorization failed" }, 401),
    urlStart: "https://api.dataforseo.com/v3/appendix/user_data", method: "GET", cost: 0, invalidHttp: 401,
    authHeader: (h, s) => h["authorization"] === `Basic ${btoa(s)}`,
  },
  serpapi: {
    ok: () => res({ plan_searches_left: 42, searches_per_month: 100, total_searches_left: 42 }),
    unauthorized: () => res({ error: "Invalid API key" }, 401),
    urlStart: "https://serpapi.com/account.json?api_key=", method: "GET", cost: 0, invalidHttp: 401, authHeader: () => true,
  },
  openai: {
    ok: () => res({ object: "list", data: [{ id: "m1" }] }),
    unauthorized: () => res({ error: { message: "Incorrect API key provided: sk-test-****0000" } }, 401),
    urlStart: "https://api.openai.com/v1/models", method: "GET", cost: 0, invalidHttp: 401, authHeader: (h, s) => h["authorization"] === `Bearer ${s}`,
  },
  gemini: {
    ok: () => res({ models: [{ name: "models/gemini-x" }] }),
    unauthorized: () => res({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, 400),
    urlStart: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", method: "GET", cost: 0, invalidHttp: 400, authHeader: (h, s) => h["x-goog-api-key"] === s,
  },
  anthropic: {
    ok: () => res({ data: [{ id: "claude-x" }], has_more: false }),
    unauthorized: () => res({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401),
    urlStart: "https://api.anthropic.com/v1/models?limit=1", method: "GET", cost: 0, invalidHttp: 401,
    authHeader: (h, s) => h["x-api-key"] === s && h["anthropic-version"] === "2023-06-01",
  },
  serper: {
    ok: () => res({ organic: [{ title: "x", link: "https://x.com", position: 1 }], credits: 1 }),
    unauthorized: () => res({ message: "Unauthorized." }, 403),
    urlStart: "https://google.serper.dev/search", method: "POST", cost: 1000, invalidHttp: 403, authHeader: (h, s) => h["x-api-key"] === s,
  },
  brave: {
    ok: () => res({ web: { results: [{ url: "https://x.com" }] } }, 200, { "X-RateLimit-Limit": "1, 2000", "X-RateLimit-Remaining": "1, 1999", "X-RateLimit-Reset": "1, 86400" }),
    unauthorized: () => res({ error: { code: "SUBSCRIPTION_TOKEN_INVALID", status: 422 } }, 422),
    urlStart: "https://api.search.brave.com/res/v1/web/search?q=zica&count=1", method: "GET", cost: 5000, invalidHttp: 422, authHeader: (h, s) => h["x-subscription-token"] === s,
  },
  perplexity: {
    ok: () => res({ results: [{ title: "x", url: "https://x.com" }] }),
    unauthorized: () => res({ error: "Unauthorized" }, 401),
    urlStart: "https://api.perplexity.ai/search", method: "POST", cost: 5000, invalidHttp: 401, authHeader: (h, s) => h["authorization"] === `Bearer ${s}`,
  },
};
const ids = Object.keys(FIXTURES) as Array<Exclude<ProviderId, "gsc" | "ga4">>;

// ---------------------------------------------------------------------------
// Formatos de credencial
// ---------------------------------------------------------------------------
Deno.test("validateCredentialFormat — prefixos, comprimentos e dica", () => {
  assertEquals(validateCredentialFormat("openai", " sk-abcdefghijklmnop1234 "), { ok: true, secret: "sk-abcdefghijklmnop1234" });
  assertEquals(validateCredentialFormat("openai", "abcdefghijklmnop12345678"), { ok: false, hint: "prefixo_sk-" });
  assertEquals(validateCredentialFormat("openai", "sk-ant-abcdefghijklmnop123456"), { ok: false, hint: "prefixo_sk-" }, "chave da Anthropic não vale como OpenAI");
  assertEquals(validateCredentialFormat("openai", "sk-has space 1234567890123"), { ok: false, hint: "prefixo_sk-" });
  assertEquals(validateCredentialFormat("anthropic", "sk-ant-abcdefghijklmnop1234").ok, true);
  assertEquals(validateCredentialFormat("anthropic", "sk-abcdefghijklmnop1234"), { ok: false, hint: "prefixo_sk-ant-" });
  assertEquals(validateCredentialFormat("gemini", "AIzaSyABCDEFGHIJKLMNOP").ok, true);
  assertEquals(validateCredentialFormat("gemini", "BIzaSyABCDEFGHIJKLMNOP"), { ok: false, hint: "prefixo_AIza" });
  assertEquals(validateCredentialFormat("perplexity", "pplx-abcdefghijklmnop12").ok, true);
  assertEquals(validateCredentialFormat("perplexity", "ppl-abcdefghijklmnop12"), { ok: false, hint: "prefixo_pplx-" });
  for (const p of ["serper", "serpapi", "bing_webmaster", "brave"]) {
    assertEquals(validateCredentialFormat(p, "abcdefghij_klmnop-123").ok, true, p);
    assertFalse(validateCredentialFormat(p, "curta").ok, `${p} curta`);
    assertFalse(validateCredentialFormat(p, "abcdefghij klmnop-123").ok, `${p} espaço`);
    assertFalse(validateCredentialFormat(p, "a".repeat(201)).ok, `${p} longa`);
    assertEquals(validateCredentialFormat(p, "a".repeat(200)).ok, true, `${p} 200`);
  }
  assertEquals(validateCredentialFormat("dataforseo", "login@x.com:senha123").ok, true);
  assertFalse(validateCredentialFormat("dataforseo", "semdoispontos").ok);
  assertFalse(validateCredentialFormat("dataforseo", "a:b:c").ok);
  assertFalse(validateCredentialFormat("dataforseo", ":senha").ok);
  assertFalse(validateCredentialFormat("dataforseo", "login:").ok);
  assertEquals(validateCredentialFormat("openai", ""), { ok: false, hint: "vazio" });
  assertEquals(validateCredentialFormat("openai", 42), { ok: false, hint: "vazio" });
  assertEquals(validateCredentialFormat("openai", "sk-" + "a".repeat(5000)), { ok: false, hint: "tamanho_maximo_4096" });
  assertEquals(validateCredentialFormat("copilot", "qualquer-coisa-longa-123"), { ok: false, hint: "provedor_nao_suportado" });
});

Deno.test("validateCredentialFormat — gsc: JSON de conta de serviço", () => {
  const sa = { type: "service_account", project_id: "p", client_email: "zica@p.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n", private_key_id: "abcd1234" };
  const ok = validateCredentialFormat("gsc", JSON.stringify(sa, null, 2));
  assert(ok.ok);
  if (ok.ok) { assertEquals(JSON.parse(ok.secret), sa); assertFalse(ok.secret.includes("\n  "), "JSON normalizado (compacto)"); }
  assertEquals(validateCredentialFormat("gsc", "{nao json"), { ok: false, hint: "json_invalido" });
  assertEquals(validateCredentialFormat("gsc", "[1,2]"), { ok: false, hint: "json_invalido" });
  assertEquals(validateCredentialFormat("gsc", JSON.stringify({ ...sa, type: "authorized_user" })), { ok: false, hint: "json_deve_ser_conta_de_servico" });
  assertEquals(validateCredentialFormat("gsc", JSON.stringify({ ...sa, client_email: "" })), { ok: false, hint: "client_email_ausente" });
  assertEquals(validateCredentialFormat("gsc", JSON.stringify({ ...sa, private_key: "-----BEGIN RSA PRIVATE KEY-----\nx" })), { ok: false, hint: "private_key_ausente" });
  assertEquals(validateCredentialFormat("gsc", JSON.stringify({ ...sa, private_key: undefined })), { ok: false, hint: "private_key_ausente" });
});

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------
Deno.test("isAllowedHealthUrl — só https e hosts da lista; sem credenciais, porta ou host parecido", () => {
  assert(isAllowedHealthUrl("https://api.openai.com/v1/models"));
  assertFalse(isAllowedHealthUrl("http://api.openai.com/v1/models"));
  assertFalse(isAllowedHealthUrl("https://api.openai.com.evil.com/v1/models"));
  assertFalse(isAllowedHealthUrl("https://evil.com/https://api.openai.com"));
  assertFalse(isAllowedHealthUrl("https://user:pw@api.openai.com/v1/models"));
  assertFalse(isAllowedHealthUrl("https://api.openai.com:8443/v1/models"));
  assertFalse(isAllowedHealthUrl("not a url"));
  for (const id of ids) assert(isAllowedHealthUrl(FIXTURES[id].urlStart), `${id} deve estar na allowlist`);
  assert(HEALTH_ALLOWED_HOSTS.length >= 12);
});

Deno.test("catálogo — 11 provedores com credencial (inclui ga4) + copilot; testes grátis e com custo disjuntos", () => {
  assertEquals(PROVIDER_IDS.length, 11);
  assertEquals(CATALOG_IDS.length, 12);
  assertEquals(PROVIDER_IDS.slice(0, 3), ["gsc", "bing_webmaster", "ga4"], "ga4 logo depois de bing_webmaster");
  assertEquals([...FREE_HEALTH_PROVIDERS].sort(), ["anthropic", "bing_webmaster", "dataforseo", "ga4", "gemini", "gsc", "openai", "serpapi"]);
  assertEquals(FREE_HEALTH_PROVIDERS.slice(0, 3), ["gsc", "bing_webmaster", "ga4"]);
});

// ---------------------------------------------------------------------------
// Saúde por provedor
// ---------------------------------------------------------------------------
for (const id of ids) {
  Deno.test(`saúde ${id} — sucesso: URL fixa, método, cabeçalho de autenticação e custo`, async () => {
    const f = FIXTURES[id], secret = SECRETS[id];
    const { fetchFn, calls } = recorder(() => f.ok());
    const r = await runProviderHealthCheck(id, secret, fetchFn, { nowMs: NOW });
    assertEquals(r.ok, true, JSON.stringify(r));
    assertEquals(r.provider, id);
    assertEquals(calls.length, 1);
    assert(calls[0].url.startsWith(f.urlStart), calls[0].url);
    assertEquals(calls[0].method, f.method);
    assert(f.authHeader(calls[0].headers, secret) || id === "bing_webmaster" || id === "serpapi", "cabeçalho de autenticação");
    assertEquals(calls[0].redirect, "manual");
    assertEquals(r.cost_micros, f.cost);
    assertEquals(r.http_status, 200);
    assert(typeof r.latency_ms === "number" && r.latency_ms >= 0);
    assertFalse(JSON.stringify(r).includes(secret), "o resultado não pode conter a credencial");
    assert((r.detail || "").length > 0 && (r.detail || "").length <= 300);
    assertEquals(r.credential_invalid, undefined);
  });
  Deno.test(`saúde ${id} — credencial recusada marca credential_invalid e não cobra`, async () => {
    const f = FIXTURES[id], secret = SECRETS[id];
    const { fetchFn } = recorder(() => f.unauthorized());
    const r = await runProviderHealthCheck(id, secret, fetchFn, { nowMs: NOW });
    assertEquals(r.ok, false);
    assertEquals(r.credential_invalid, true);
    assertEquals(r.http_status, f.invalidHttp === 400 && id === "bing_webmaster" ? 400 : f.invalidHttp);
    assertEquals(r.cost_micros, 0);
    assertFalse(JSON.stringify(r).includes(secret));
    assertFalse((r.detail || "").includes("****"), "não repete a mensagem do provedor");
  });
  Deno.test(`saúde ${id} — HTTP 503 é falha sem invalidar a credencial`, async () => {
    const { fetchFn } = recorder(() => res({ error: "down" }, 503));
    const r = await runProviderHealthCheck(id, SECRETS[id], fetchFn, { nowMs: NOW });
    assertEquals(r.ok, false);
    assertEquals(r.http_status, 503);
    assertEquals(r.credential_invalid, undefined);
    assertEquals(r.cost_micros, 0);
    assert((r.detail || "").includes("503"));
  });
  Deno.test(`saúde ${id} — tempo esgotado e erro de rede`, async () => {
    const hang = ((_i: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); })) as typeof fetch;
    const t = await runProviderHealthCheck(id, SECRETS[id], hang, { timeoutMs: 30 });
    assertEquals(t.ok, false);
    assertEquals(t.detail, "Tempo esgotado (30 ms)");
    // fetch que nunca resolve e ignora o sinal: o limite global ainda vale
    const deaf = (() => new Promise<Response>(() => {})) as typeof fetch;
    const t2 = await runProviderHealthCheck(id, SECRETS[id], deaf, { timeoutMs: 30 });
    assertEquals(t2.detail, "Tempo esgotado (30 ms)");
    const boom = (() => Promise.reject(new TypeError(`connect failed for ${SECRETS[id]}`))) as typeof fetch;
    const n = await runProviderHealthCheck(id, SECRETS[id], boom, { timeoutMs: 1000 });
    assertEquals(n.ok, false);
    assertEquals(n.detail, "Falha de rede ao consultar o provedor");
    assertFalse(JSON.stringify(n).includes(SECRETS[id]));
  });
}

Deno.test("saúde — quota: DataForSEO (saldo), SerpApi (buscas) e Brave (cabeçalhos); OpenAI/Anthropic sem quota", async () => {
  const run = async (id: Exclude<ProviderId, "gsc" | "ga4">) => (await runProviderHealthCheck(id, SECRETS[id], recorder(() => FIXTURES[id].ok()).fetchFn, { nowMs: NOW })).quota;
  assertEquals(await run("dataforseo"), { label: "Saldo (US$)", remaining: 12.3457, limit: 50 });
  assertEquals(await run("serpapi"), { label: "Buscas restantes no plano", remaining: 42, limit: 100 });
  assertEquals(await run("brave"), { label: "Requisições restantes no período", remaining: 1999, limit: 2000, reset_at: new Date(NOW + 86400_000).toISOString() });
  for (const id of ["openai", "anthropic", "gemini", "bing_webmaster", "serper", "perplexity"] as const) assertEquals(await run(id), null, id);
});

Deno.test("leitores de quota — casos de borda", () => {
  assertEquals(readDataForSeoQuota({ tasks: [{ result: [{ money: { balance: 3, total: 1 } }] }] }), { label: "Saldo (US$)", remaining: 3, limit: null });
  assertEquals(readDataForSeoQuota({ tasks: [] }), null);
  assertEquals(readSerpApiQuota({ total_searches_left: 7 }), { label: "Buscas restantes no plano", remaining: 7, limit: null });
  assertEquals(readSerpApiQuota({}), null);
  assertEquals(readBraveQuota(new Headers({ "X-RateLimit-Remaining": "5" }), NOW), { label: "Requisições restantes no período", remaining: 5, limit: null });
  assertEquals(readBraveQuota(new Headers(), NOW), null);
});

Deno.test("saúde dataforseo — status_code do corpo: 40100 recusa, 40200 saldo, 50000 inesperado", async () => {
  const run = (body: unknown) => runProviderHealthCheck("dataforseo", SECRETS.dataforseo, recorder(() => res(body)).fetchFn, { nowMs: NOW });
  const a = await run({ status_code: 40100 });
  assertEquals([a.ok, a.http_status, a.credential_invalid], [false, 401, true]);
  const b = await run({ status_code: 40200 });
  assertEquals([b.ok, b.http_status, b.credential_invalid], [false, 402, undefined]);
  const c = await run({ status_code: 50000 });
  assertEquals([c.ok, c.credential_invalid], [false, undefined]);
  const d = await run("lixo");
  assertEquals(d.ok, false);
});

Deno.test("saúde bing — resposta 200 sem o campo d (instabilidade conhecida) é falha, não sucesso", async () => {
  const r = await runProviderHealthCheck("bing_webmaster", SECRETS.bing_webmaster, recorder(() => res({ ErrorCode: 0 })).fetchFn, { nowMs: NOW });
  assertEquals(r.ok, false);
  assert((r.detail || "").includes("instabilidades"));
  const ok = await runProviderHealthCheck("bing_webmaster", SECRETS.bing_webmaster, recorder(() => res({ d: [] })).fetchFn, { nowMs: NOW });
  assertEquals(ok.ok, true);
});

Deno.test("saúde gsc — mapeia a lista de sites e os erros do módulo GSC (injetado)", async () => {
  const f = recorder(() => res({})).fetchFn;
  const ok = await runProviderHealthCheck("gsc", "{}", f, { gscList: () => Promise.resolve({ ok: true, sites: [{ siteUrl: "sc-domain:x.com", permissionLevel: "siteOwner" }] }) });
  assertEquals([ok.ok, ok.http_status, ok.detail], [true, 200, "Conexão válida: 1 propriedade(s) acessível(is) no Search Console"]);
  const empty = await runProviderHealthCheck("gsc", "{}", f, { gscList: () => Promise.resolve({ ok: true, sites: [] }) });
  assertEquals(empty.ok, true);
  assert((empty.detail || "").includes("nenhuma propriedade"));
  const forbidden = await runProviderHealthCheck("gsc", "{}", f, { gscList: () => Promise.resolve({ ok: false, status: 403, error: "x" }) });
  assertEquals([forbidden.ok, forbidden.http_status, forbidden.credential_invalid], [false, 403, true]);
  const bad = await runProviderHealthCheck("gsc", "{}", f, { gscList: () => Promise.resolve({ ok: false, status: 400, error: "invalid_grant" }) });
  assertEquals([bad.ok, bad.credential_invalid], [false, true]);
  const down = await runProviderHealthCheck("gsc", "{}", f, { gscList: () => Promise.resolve({ ok: false, status: 503, error: "x" }) });
  assertEquals([down.ok, down.credential_invalid, down.http_status], [false, undefined, 503]);
  // o fetch entregue ao módulo GSC é restrito à allowlist
  let guardError = "";
  await runProviderHealthCheck("gsc", "{}", f, { gscList: async (ff) => { try { await ff("https://evil.example.com/x"); } catch (e) { guardError = (e as Error).message; } return { ok: false, status: 500, error: "x" }; } });
  assertEquals(guardError, "url_not_allowed");
  const slow = await runProviderHealthCheck("gsc", "{}", f, { timeoutMs: 20, gscList: () => new Promise(() => {}) });
  assertEquals(slow.detail, "Tempo esgotado (20 ms)");
});

Deno.test("redact — remove a credencial e partes de login:senha", () => {
  assertEquals(redact("falhou com abc123456 e user", ["abc123456"]), "falhou com *** e user");
  assertEquals(redact("x", [""]), "x");
});

// ---------------------------------------------------------------------------
// runHealthChecks com administrador falso
// ---------------------------------------------------------------------------
type Ins = { table: string; row: Record<string, unknown> };
type Upd = { table: string; values: Record<string, unknown>; filters: unknown[] };
function fakeAdmin(creds: Array<{ provider: string; status: string }>, secrets: Record<string, string | null>) {
  const inserts: Ins[] = [], updates: Upd[] = [], rpcs: string[] = [];
  const admin = {
    from(table: string) {
      const filters: unknown[] = [];
      let pending: Upd | null = null;
      const b = {
        select() { return b; },
        eq(c: string, v: unknown) { filters.push([c, v]); return b; },
        in(c: string, v: unknown) { filters.push([c, v]); return b; },
        insert(row: Record<string, unknown>) { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
        update(values: Record<string, unknown>) { pending = { table, values, filters }; updates.push(pending); return b; },
        then(resolve: (v: unknown) => void) { resolve({ data: table === "organization_provider_credentials" ? creds : [], error: null }); },
      };
      return b;
    },
    rpc(name: string, args: { p_provider: string }) { rpcs.push(`${name}:${args.p_provider}`); return Promise.resolve({ data: secrets[args.p_provider] ?? null, error: null }); },
  };
  return { admin: admin as unknown as SupabaseClient, inserts, updates, rpcs };
}
const ORG = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

Deno.test("runHealthChecks — sem provider: só configurados com teste GRATUITO, grava histórico e promove stored_unverified para active", async () => {
  const { admin, inserts, updates, rpcs } = fakeAdmin(
    [{ provider: "openai", status: "active" }, { provider: "serper", status: "active" }, { provider: "bing_webmaster", status: "stored_unverified" }, { provider: "gemini", status: "revoked" }],
    { ...SECRETS },
  );
  const { fetchFn, calls } = recorder((c) => c.url.includes("bing.com") ? FIXTURES.bing_webmaster.ok() : FIXTURES.openai.ok());
  const results = await runHealthChecks(admin, { organizationId: ORG, triggeredBy: USER, fetchFn });
  assertEquals(results.map((r) => r.provider), ["bing_webmaster", "openai"]);
  assert(results.every((r) => r.ok));
  assertEquals(calls.length, 2);
  assertFalse(calls.some((c) => c.url.includes("serper")), "serper (com custo) não roda sem confirmação");
  assertEquals(rpcs.sort(), ["nexus_provider_secret_read:bing_webmaster", "nexus_provider_secret_read:openai"]);
  assertEquals(inserts.length, 2);
  assert(inserts.every((i) => i.table === "nexus_provider_health" && i.row.organization_id === ORG && i.row.triggered_by === USER && i.row.ok === true && i.row.cost_micros === 0));
  assertFalse(JSON.stringify(inserts).includes(SECRETS.openai));
  // só o bing mudou de stored_unverified para active; openai já estava active
  assertEquals(updates.length, 1);
  assertEquals(updates[0].values, { status: "active" });
});

Deno.test("runHealthChecks — 401 marca invalid; 503 mantém o status; grava falha no histórico", async () => {
  const { admin, inserts, updates } = fakeAdmin([{ provider: "openai", status: "active" }, { provider: "anthropic", status: "active" }], { ...SECRETS });
  const { fetchFn } = recorder((c) => c.url.includes("openai") ? FIXTURES.openai.unauthorized() : res({}, 503));
  const results = await runHealthChecks(admin, { organizationId: ORG, triggeredBy: null, fetchFn });
  assertEquals(results.map((r) => [r.provider, r.ok]), [["openai", false], ["anthropic", false]]);
  assertEquals(inserts.length, 2);
  assertEquals(inserts.map((i) => i.row.ok), [false, false]);
  assertEquals(inserts[0].row.triggered_by, null);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].values, { status: "invalid" });
});

Deno.test("runHealthChecks — provider explícito: custo exige confirmCost; não configurado e manual viram skipped", async () => {
  const { admin, inserts } = fakeAdmin([{ provider: "serper", status: "active" }], { ...SECRETS });
  const { fetchFn, calls } = recorder(() => FIXTURES.serper.ok());
  const noConfirm = await runHealthChecks(admin, { organizationId: ORG, triggeredBy: USER, providers: ["serper"], fetchFn });
  assertEquals(noConfirm, [{ provider: "serper", ok: false, skipped: "cost_confirmation_required", cost_micros: 0 }]);
  assertEquals(calls.length, 0);
  const confirmed = await runHealthChecks(admin, { organizationId: ORG, triggeredBy: USER, providers: ["serper"], confirmCost: true, fetchFn });
  assertEquals([confirmed[0].ok, confirmed[0].cost_micros], [true, 1000]);
  assertEquals(calls.length, 1);
  assertEquals(inserts[0].row.cost_micros, 1000);
  const skipped = await runHealthChecks(admin, { organizationId: ORG, triggeredBy: USER, providers: ["brave", "copilot", "inexistente"], confirmCost: true, fetchFn });
  assertEquals(skipped, [{ provider: "brave", ok: false, skipped: "not_configured", cost_micros: 0 }, { provider: "copilot", ok: false, skipped: "manual", cost_micros: 0 }]);
  assertEquals(calls.length, 1, "nenhuma chamada extra");
});

Deno.test("runHealthChecks — segredo ausente no Vault vira not_configured; falha ao gravar histórico não derruba o teste", async () => {
  const a = fakeAdmin([{ provider: "openai", status: "active" }], { openai: null });
  const r1 = await runHealthChecks(a.admin, { organizationId: ORG, triggeredBy: USER, providers: ["openai"], fetchFn: recorder(() => FIXTURES.openai.ok()).fetchFn });
  assertEquals(r1[0].skipped, "not_configured");
  const broken = { from: () => { throw new Error("db down"); }, rpc: () => Promise.resolve({ data: SECRETS.openai, error: null }) };
  // `from` quebra já na leitura das credenciais: o chamador recebe o erro (a ação responde 500), sem vazar segredo
  let threw = false;
  try { await runHealthChecks(broken as unknown as SupabaseClient, { organizationId: ORG, triggeredBy: USER, fetchFn: recorder(() => FIXTURES.openai.ok()).fetchFn }); } catch { threw = true; }
  assert(threw);
  const failingInsert = fakeAdmin([{ provider: "openai", status: "stored_unverified" }], { ...SECRETS });
  const orig = failingInsert.admin.from.bind(failingInsert.admin);
  (failingInsert.admin as unknown as { from: (t: string) => unknown }).from = (t: string) => t === "nexus_provider_health" ? { insert: () => Promise.reject(new Error("insert failed")) } : orig(t);
  const r2 = await runHealthChecks(failingInsert.admin, { organizationId: ORG, triggeredBy: USER, providers: ["openai"], fetchFn: recorder(() => FIXTURES.openai.ok()).fetchFn });
  assertEquals(r2[0].ok, true);
});

// ---------------------------------------------------------------------------
// Status e pontuação
// ---------------------------------------------------------------------------
const snap = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({ checked_at: ago(2 * H), ok: true, latency_ms: 800, quota: null, ...over });

Deno.test("computeProviderStatus — regras do contrato", () => {
  const base = { stored: true, checks7d: 5, ok7d: 5, nowMs: NOW };
  assertEquals(computeProviderStatus({ ...base, manual: true, stored: false, last: null }), "manual");
  assertEquals(computeProviderStatus({ ...base, stored: false, last: snap() }), "not_configured");
  assertEquals(computeProviderStatus({ ...base, last: null }), "stored_unverified");
  assertEquals(computeProviderStatus({ ...base, last: snap() }), "healthy");
  assertEquals(computeProviderStatus({ ...base, last: snap({ ok: false }) }), "error");
  // latência
  assertEquals(computeProviderStatus({ ...base, last: snap({ latency_ms: 4000 }) }), "healthy");
  assertEquals(computeProviderStatus({ ...base, last: snap({ latency_ms: 4001 }) }), "degraded");
  // idade do teste
  assertEquals(computeProviderStatus({ ...base, last: snap({ checked_at: ago(24 * H - 1000) }) }), "healthy");
  assertEquals(computeProviderStatus({ ...base, last: snap({ checked_at: ago(24 * H) }) }), "degraded");
  // quota
  assertEquals(computeProviderStatus({ ...base, last: snap({ quota: { label: "x", remaining: 10, limit: 100 } }) }), "healthy");
  assertEquals(computeProviderStatus({ ...base, last: snap({ quota: { label: "x", remaining: 9, limit: 100 } }) }), "degraded");
  assertEquals(computeProviderStatus({ ...base, last: snap({ quota: { label: "x", remaining: 3, limit: null } }) }), "healthy", "sem limite não há percentual");
  // taxa de sucesso 7 d
  assertEquals(computeProviderStatus({ ...base, checks7d: 10, ok7d: 8, last: snap() }), "healthy");
  assertEquals(computeProviderStatus({ ...base, checks7d: 10, ok7d: 7, last: snap() }), "degraded");
  // teste anterior à troca da chave não vale
  assertEquals(computeProviderStatus({ ...base, credentialUpdatedAt: ago(1 * H), last: snap({ checked_at: ago(2 * H) }) }), "stored_unverified");
  assertEquals(computeProviderStatus({ ...base, credentialUpdatedAt: ago(3 * H), last: snap({ checked_at: ago(2 * H) }) }), "healthy");
});

Deno.test("computeProviderScore — pesos 40/30/20/10, redistribuição sem operações, frescor e latência lineares", () => {
  const base = { stored: true, checks7d: 10, ok7d: 10, valid30d: 10, failed30d: 0, uncertain30d: 0, lastCheckedAt: ago(1 * H), lastLatencyMs: 500, nowMs: NOW };
  assertEquals(computeProviderScore(base), 100);
  assertEquals(computeProviderScore({ ...base, manual: true }), null);
  assertEquals(computeProviderScore({ ...base, stored: false }), null);
  // sem operações: peso das operações vai para os testes
  assertEquals(computeProviderScore({ ...base, valid30d: 0 }), 100);
  assertEquals(computeProviderScore({ ...base, valid30d: 0, ok7d: 5 }), 70 * 0.5 + 20 + 10);
  // operações: 3 de 4 válidas
  assertEquals(computeProviderScore({ ...base, valid30d: 3, failed30d: 1 }), Math.round(40 + 30 * 0.75 + 20 + 10));
  assertEquals(computeProviderScore({ ...base, valid30d: 2, failed30d: 1, uncertain30d: 1 }), 40 + 15 + 20 + 10);
  // frescor
  assertEquals(computeProviderScore({ ...base, lastCheckedAt: ago(48 * H) }), 90);
  assertEquals(computeProviderScore({ ...base, lastCheckedAt: ago(100 * H) }), 80);
  assertEquals(computeProviderScore({ ...base, lastCheckedAt: null }), 80);
  // latência linear entre 1500 e 6000 ms
  assertEquals(computeProviderScore({ ...base, lastLatencyMs: 1500 }), 100);
  assertEquals(computeProviderScore({ ...base, lastLatencyMs: 3750 }), 95);
  assertEquals(computeProviderScore({ ...base, lastLatencyMs: 6000 }), 90);
  assertEquals(computeProviderScore({ ...base, lastLatencyMs: 9000 }), 90);
  assertEquals(computeProviderScore({ ...base, lastLatencyMs: null }), 90);
  // credencial guardada, nunca testada
  assertEquals(computeProviderScore({ ...base, checks7d: 0, ok7d: 0, valid30d: 0, lastCheckedAt: null, lastLatencyMs: null }), 0);
});

Deno.test("summarizeProviders — overall empty/critical/attention/ok e score médio dos conectados", () => {
  const p = (status: string, score: number | null) => ({ status: status as never, score });
  assertEquals(summarizeProviders([p("not_configured", null), p("manual", null)]).overall, "empty");
  assertEquals(summarizeProviders([p("error", 10), p("stored_unverified", 0), p("not_configured", null)]).overall, "critical");
  assertEquals(summarizeProviders([p("error", 10), p("healthy", 90)]).overall, "attention");
  assertEquals(summarizeProviders([p("degraded", 60), p("healthy", 90)]).overall, "attention");
  const ok = summarizeProviders([p("healthy", 100), p("healthy", 91), p("not_configured", null), p("manual", null)]);
  assertEquals(ok, { total: 4, connected: 2, healthy: 2, degraded: 0, error: 0, not_configured: 1, manual: 1, overall: "ok", score: 96 });
  assertEquals(summarizeProviders([]).score, null);
});

Deno.test("buildProvidersOverview — monta os 12 itens, aplica status/score e lê providers_enabled do programa", () => {
  const raw = {
    providers: [
      { provider: "openai", credential: { stored: true, last_four: "abcd", status: "active", updated_at: ago(30 * H) }, last_health: { checked_at: ago(1 * H), ok: true, latency_ms: 700, http_status: 200, detail: "Conexão válida", quota: null, cost_micros: 0 },
        checks_7d: 4, ok_7d: 4, avg_latency_ms_7d: 650, usage: { valid_30d: 9, failed_30d: 1, uncertain_30d: 0, last_success_at: ago(2 * H) } },
      { provider: "serper", credential: { stored: true, last_four: "wxyz", status: "stored_unverified", updated_at: ago(1 * H) }, last_health: null, checks_7d: 0, ok_7d: 0, avg_latency_ms_7d: null, usage: { valid_30d: 0, failed_30d: 0, uncertain_30d: 0, last_success_at: null } },
      { provider: "brave", credential: { stored: false, last_four: null, status: null, updated_at: null }, last_health: null, checks_7d: 0, ok_7d: 0, avg_latency_ms_7d: null, usage: {} },
      { provider: "copilot", credential: { stored: false }, usage: {} },
      { provider: "gemini", credential: { stored: true, last_four: "1234", status: "invalid", updated_at: ago(30 * H) }, last_health: { checked_at: ago(1 * H), ok: false, latency_ms: 300, http_status: 400, detail: "Chave recusada", quota: null, cost_micros: 0 }, checks_7d: 2, ok_7d: 0, avg_latency_ms_7d: 300, usage: {} },
    ],
    program: { execution_enabled: true, budget_usd_micros: "5000000", reserved_usd_micros: 1000, consumed_usd_micros: 2000, settings: { providers_enabled: ["openai", "inexistente", 7], destination_hosts: ["x.com"] } },
  };
  const o = buildProvidersOverview(raw, ORG, NOW);
  assertEquals(o.organization_id, ORG);
  assertEquals(o.generated_at, new Date(NOW).toISOString());
  assertEquals(o.providers.map((p) => p.id), [...CATALOG_IDS]);
  const by = Object.fromEntries(o.providers.map((p) => [p.id, p]));
  assertEquals([by.openai.status, by.openai.enabled, by.openai.credential.last_four], ["healthy", true, "abcd"]);
  assertEquals(by.openai.score, Math.round(40 + 30 * 0.9 + 20 + 10 * (1)));
  assertEquals([by.serper.status, by.serper.score, by.serper.enabled], ["stored_unverified", 0, false]);
  assertEquals([by.brave.status, by.brave.score, by.brave.credential.stored], ["not_configured", null, false]);
  assertEquals([by.copilot.status, by.copilot.score, by.copilot.category], ["manual", null, "manual"]);
  assertEquals(by.gemini.status, "error");
  assertEquals(by.anthropic.status, "not_configured");
  assertEquals(o.program, { execution_enabled: true, budget_usd_micros: 5_000_000, reserved_usd_micros: 1000, consumed_usd_micros: 2000, providers_enabled: ["openai"] });
  assertEquals(o.summary.total, 12);
  assertEquals([o.summary.connected, o.summary.healthy, o.summary.error, o.summary.manual, o.summary.not_configured], [3, 1, 1, 1, 8]);
  assertEquals(o.summary.overall, "attention");
  // sem dados: tudo "não configurado" e vazio
  const empty = buildProvidersOverview(null, ORG, NOW);
  assertEquals([empty.summary.overall, empty.summary.connected, empty.program.execution_enabled, empty.program.providers_enabled], ["empty", 0, false, []]);
  // credencial pausada/revogada conta como não configurada
  const paused = buildProvidersOverview({ providers: [{ provider: "openai", credential: { stored: true, last_four: "abcd", status: "paused", updated_at: ago(H) } }] }, ORG, NOW);
  assertEquals(paused.providers.find((p) => p.id === "openai")!.status, "not_configured");
});

// ---------------------------------------------------------------------------
// Portão de execução e liberação
// ---------------------------------------------------------------------------
Deno.test("executionGate — desligado, sem orçamento e provedor não habilitado bloqueiam; só o conjunto completo libera", () => {
  const on = { execution_enabled: true, budget_usd_micros: 5_000_000, settings: { providers_enabled: ["serper"] } };
  assertEquals(executionGate(null, "serper"), { error: "budget_paused" });
  assertEquals(executionGate(undefined, "serper"), { error: "budget_paused" });
  assertEquals(executionGate({ ...on, execution_enabled: false }, "serper"), { error: "budget_paused" });
  assertEquals(executionGate({ ...on, budget_usd_micros: 0 }, "serper"), { error: "budget_paused" });
  assertEquals(executionGate({ ...on, budget_usd_micros: "0" }, "serper"), { error: "budget_paused" });
  assertEquals(executionGate({ ...on, budget_usd_micros: null }, "serper"), { error: "budget_paused" });
  assertEquals(executionGate({ ...on, settings: {} }, "serper"), { error: "provider_not_enabled" });
  assertEquals(executionGate({ ...on, settings: { providers_enabled: "serper" } }, "serper"), { error: "provider_not_enabled" });
  assertEquals(executionGate(on, "openai"), { error: "provider_not_enabled" });
  assertEquals(executionGate(on, "serper"), null);
  assertEquals(executionGate({ ...on, budget_usd_micros: "5000000" }, "serper"), null);
  // padrão de produção: tudo desligado
  assertEquals(executionGate({ execution_enabled: false, budget_usd_micros: 0, settings: {} }, "openai"), { error: "budget_paused" });
});

Deno.test("validateExecutionSettings — limites, confirmação LIBERAR, provedores conectados; desligar é sempre permitido", () => {
  const connected = ["serper", "openai"];
  const valid = { executionEnabled: true, budgetUsd: 5, providersEnabled: ["serper"], confirm: "LIBERAR" };
  assertEquals(validateExecutionSettings(valid, connected), { ok: true, value: { executionEnabled: true, budgetUsdMicros: 5_000_000, providersEnabled: ["serper"] } });
  assertEquals(validateExecutionSettings({ ...valid, budgetUsd: 0.0000015 + 1 }, connected), { ok: true, value: { executionEnabled: true, budgetUsdMicros: 1_000_002, providersEnabled: ["serper"] } });
  assertEquals(validateExecutionSettings({ ...valid, budgetUsd: 200 }, connected).ok, true);
  assertEquals(validateExecutionSettings({ ...valid, budgetUsd: 200.01 }, connected), { ok: false, error: "budget_out_of_range" });
  assertEquals(validateExecutionSettings({ ...valid, budgetUsd: -1 }, connected), { ok: false, error: "budget_out_of_range" });
  assertEquals(validateExecutionSettings({ ...valid, budgetUsd: "5" }, connected), { ok: false, error: "budget_out_of_range" });
  assertEquals(validateExecutionSettings({ ...valid, budgetUsd: NaN }, connected), { ok: false, error: "budget_out_of_range" });
  assertEquals(validateExecutionSettings({ ...valid, executionEnabled: "true" }, connected), { ok: false, error: "execution_enabled_required" });
  assertEquals(validateExecutionSettings({ ...valid, confirm: "liberar" }, connected), { ok: false, error: "confirm_required" });
  assertEquals(validateExecutionSettings({ ...valid, confirm: undefined }, connected), { ok: false, error: "confirm_required" });
  assertEquals(validateExecutionSettings({ ...valid, budgetUsd: 0 }, connected), { ok: false, error: "budget_required" });
  assertEquals(validateExecutionSettings({ ...valid, providersEnabled: [] }, connected), { ok: false, error: "provider_required" });
  assertEquals(validateExecutionSettings({ ...valid, providersEnabled: ["brave"] }, connected), { ok: false, error: "provider_not_connected" });
  assertEquals(validateExecutionSettings({ ...valid, providersEnabled: ["serper", "brave"] }, connected), { ok: false, error: "provider_not_connected" });
  assertEquals(validateExecutionSettings({ ...valid, providersEnabled: ["copilot"] }, ["copilot"]), { ok: false, error: "provider_not_supported" });
  assertEquals(validateExecutionSettings({ ...valid, providersEnabled: "serper" }, connected), { ok: false, error: "providers_invalid" });
  assertEquals(validateExecutionSettings({ ...valid, providersEnabled: ["serper", "serper"] }, connected), { ok: true, value: { executionEnabled: true, budgetUsdMicros: 5_000_000, providersEnabled: ["serper"] } });
  // desligar: sem confirmação, sem provedores, provedor já desconectado é filtrado em silêncio
  assertEquals(validateExecutionSettings({ executionEnabled: false, budgetUsd: 0, providersEnabled: [] }, connected), { ok: true, value: { executionEnabled: false, budgetUsdMicros: 0, providersEnabled: [] } });
  assertEquals(validateExecutionSettings({ executionEnabled: false, budgetUsd: 3, providersEnabled: ["serper", "brave", "copilot"] }, connected), { ok: true, value: { executionEnabled: false, budgetUsdMicros: 3_000_000, providersEnabled: ["serper"] } });
});

// ---------------------------------------------------------------------------
// GA4 (13/11/2026): formato da credencial, saúde (token; token + getMetadata) e seleção da propriedade em runHealthChecks
// ---------------------------------------------------------------------------
async function ga4Account(): Promise<string> {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der));
  return JSON.stringify({ type: "service_account", client_email: "ga4@proj-teste.iam.gserviceaccount.com", private_key: `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n` });
}
let ga4Json: string | null = null;
const ga4Secret = async () => (ga4Json ??= await ga4Account());
const isTokenCall = (c: { url: string }) => c.url === "https://oauth2.googleapis.com/token";

Deno.test("validateCredentialFormat — ga4 usa o mesmo formato de conta de serviço do gsc (JSON compactado)", async () => {
  const secret = await ga4Secret();
  const r = validateCredentialFormat("ga4", JSON.stringify(JSON.parse(secret), null, 2));
  assertEquals(r.ok, true);
  assertEquals(r.ok && r.secret, JSON.stringify(JSON.parse(secret)));
  assertEquals(validateCredentialFormat("ga4", "lixo"), { ok: false, hint: "json_invalido" });
  assertEquals(validateCredentialFormat("ga4", JSON.stringify({ type: "authorized_user" })), { ok: false, hint: "json_deve_ser_conta_de_servico" });
});

Deno.test("allowlist de saúde inclui a GA4 Data API (HTTPS, sem porta)", () => {
  assert(isAllowedHealthUrl("https://analyticsdata.googleapis.com/v1beta/properties/123456789/metadata"));
  assertFalse(isAllowedHealthUrl("http://analyticsdata.googleapis.com/v1beta/properties/1/metadata"));
});

Deno.test("saúde ga4 — sem propriedade valida só o token (escopo analytics.readonly)", async () => {
  clearGoogleTokenCache();
  const secret = await ga4Secret();
  const { fetchFn, calls } = recorder((c) => isTokenCall(c) ? res({ access_token: "tok-ga4-a", expires_in: 3599 }) : res({}));
  const r = await runProviderHealthCheck("ga4", secret, fetchFn, { nowMs: NOW });
  assertEquals([r.ok, r.http_status, r.cost_micros], [true, 200, 0]);
  assert(/propriedade GA4/.test(r.detail || ""));
  assertEquals(calls.length, 1);
  assert(isTokenCall(calls[0]));
  const assertion = new URLSearchParams(calls[0].body || "").get("assertion")!;
  const claims = JSON.parse(atob(assertion.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  assertEquals(claims.scope, "https://www.googleapis.com/auth/analytics.readonly");
  assertFalse(JSON.stringify(r).includes("BEGIN PRIVATE KEY"));
});

Deno.test("saúde ga4 — com propriedade consulta getMetadata (GET gratuito) com Bearer", async () => {
  clearGoogleTokenCache();
  const secret = await ga4Secret();
  const { fetchFn, calls } = recorder((c) => isTokenCall(c) ? res({ access_token: "tok-ga4-b", expires_in: 3599 }) : res({ dimensions: [{}], metrics: [{}, {}] }));
  const r = await runProviderHealthCheck("ga4", secret, fetchFn, { nowMs: NOW, ga4Property: "123456789" });
  assertEquals([r.ok, r.http_status], [true, 200]);
  assert(/enxerga a propriedade/.test(r.detail || ""));
  const api = calls.find((c) => !isTokenCall(c))!;
  assertEquals([api.url, api.method], ["https://analyticsdata.googleapis.com/v1beta/properties/123456789/metadata", "GET"]);
  assertEquals(api.headers["authorization"], "Bearer tok-ga4-b");
  // propriedade inválida (não só dígitos) é ignorada: nenhuma URL montada com texto do cliente
  const bad = recorder((c) => isTokenCall(c) ? res({ access_token: "tok-ga4-c", expires_in: 3599 }) : res({}));
  await runProviderHealthCheck("ga4", secret, bad.fetchFn, { nowMs: NOW, ga4Property: "123/../../x" });
  assertFalse(bad.calls.some((c) => c.url.includes("analyticsdata")));
});

Deno.test("saúde ga4 — 403 na propriedade NÃO invalida a credencial; token recusado invalida; 429 e rede viram falha comum", async () => {
  clearGoogleTokenCache();
  const secret = await ga4Secret();
  const forbidden = recorder((c) => isTokenCall(c) ? res({ access_token: "tok-ga4-d", expires_in: 3599 }) : res({ error: { message: "User does not have sufficient permissions" } }, 403));
  const f = await runProviderHealthCheck("ga4", secret, forbidden.fetchFn, { nowMs: NOW, ga4Property: "123456789" });
  assertEquals([f.ok, f.http_status, f.credential_invalid], [false, 403, undefined]);
  assert(/leitor da propriedade GA4/.test(f.detail || ""));
  assertFalse((f.detail || "").includes("sufficient permissions"), "não repete a mensagem do Google");
  clearGoogleTokenCache();
  const refused = recorder((c) => isTokenCall(c) ? res({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400) : res({}));
  const inv = await runProviderHealthCheck("ga4", secret, refused.fetchFn, { nowMs: NOW });
  assertEquals([inv.ok, inv.credential_invalid, inv.http_status], [false, true, 400]);
  const bad = await runProviderHealthCheck("ga4", "não é json", recorder(() => res({})).fetchFn, { nowMs: NOW });
  assertEquals([bad.ok, bad.credential_invalid], [false, true]);
  clearGoogleTokenCache();
  const quota = recorder((c) => isTokenCall(c) ? res({ access_token: "tok-ga4-e", expires_in: 3599 }) : res({}, 429));
  const q = await runProviderHealthCheck("ga4", secret, quota.fetchFn, { nowMs: NOW, ga4Property: "123456789" });
  assertEquals([q.ok, q.http_status, q.credential_invalid], [false, 429, undefined]);
  clearGoogleTokenCache();
  const net = await runProviderHealthCheck("ga4", secret, (() => { throw new TypeError("offline"); }) as unknown as typeof fetch, { nowMs: NOW });
  assertEquals([net.ok, net.detail], [false, "Falha de rede ao consultar o provedor"]);
});

Deno.test("runHealthChecks — ga4 usa a propriedade informada; grava histórico sem segredo", async () => {
  clearGoogleTokenCache();
  const secret = await ga4Secret();
  const { admin, inserts, rpcs } = fakeAdmin([{ provider: "ga4", status: "stored_unverified" }], { ga4: secret });
  const { fetchFn, calls } = recorder((c) => isTokenCall(c) ? res({ access_token: "tok-ga4-f", expires_in: 3599 }) : res({ dimensions: [], metrics: [] }));
  const results = await runHealthChecks(admin, { organizationId: ORG, triggeredBy: USER, providers: ["ga4"], fetchFn, ga4Property: "987654321" });
  assertEquals(results.map((r) => [r.provider, r.ok]), [["ga4", true]]);
  assert(calls.some((c) => c.url.endsWith("/properties/987654321/metadata")));
  assertEquals(rpcs, ["nexus_provider_secret_read:ga4"]);
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].row.provider, "ga4");
  assertFalse(JSON.stringify(inserts).includes("PRIVATE KEY"));
});

Deno.test("buildProvidersOverview — inclui ga4 em search_truth, logo depois de bing_webmaster", () => {
  const o = buildProvidersOverview({ providers: [{ provider: "ga4", credential: { stored: true, last_four: "ab12", status: "active", updated_at: ago(2 * H) } }] }, ORG, NOW);
  assertEquals(o.providers.slice(0, 3).map((p) => p.id), ["gsc", "bing_webmaster", "ga4"]);
  const ga4 = o.providers.find((p) => p.id === "ga4")!;
  assertEquals([ga4.category, ga4.credential.stored, ga4.status], ["search_truth", true, "stored_unverified"]);
});
