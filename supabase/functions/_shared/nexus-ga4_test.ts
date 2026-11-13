/**
 * Testes do cliente do Google Analytics 4 (Data API): normalização, fontes de IA, chamadas (fetch simulado, credencial sintética),
 * paginação, sincronização idempotente e erros. Nenhum teste chama a rede.
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-ga4_test.ts
 */
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearGoogleTokenCache } from "./nexus-gsc.ts";
import {
  AI_SOURCE_HOSTS, dedupeGa4Rows, ga4CheckToken, ga4DateToDay, ga4GetMetadata, ga4RunReport, ga4SyncWindow, GA4_METRICS, GA4_PAGE_DIMENSIONS, GA4_SITE_DIMENSIONS, GA4_SCOPE,
  isAiSource, isValidPropertyId, normalizeGa4Rows, normalizePagePath, normalizeSourceText, syncGa4, type Ga4Admin, type Ga4RawRow, type Ga4Row,
} from "./nexus-ga4.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const PROPERTY = "123456789";
const NOW = Date.parse("2026-11-12T12:00:00Z");

async function serviceAccountJson() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der));
  return JSON.stringify({ type: "service_account", client_email: "ga4-sync@proj-teste.iam.gserviceaccount.com", private_key: `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n` });
}
let saCache: string | null = null;
const sa = async () => (saCache ??= await serviceAccountJson());

type Call = { url: string; init: RequestInit };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const isToken = (c: Call) => c.url === "https://oauth2.googleapis.com/token";
function mock(respond: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => { const call = { url: String(input), init: init ?? {} }; calls.push(call); return await respond(call); }) as typeof fetch;
  return { fn, calls, api: () => calls.filter((c) => !isToken(c)) };
}
const bodyOf = (c: Call) => JSON.parse(String(c.init.body));

/** Linha da API na ordem das dimensões e das 6 métricas (strings, como o GA4 devolve). */
const raw = (dims: string[], m: [number, number, number, number, number, number] = [10, 8, 25, 9, 321.5, 2]): Ga4RawRow => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: m.map((v) => ({ value: String(v) })) });
const siteRow = (day: string, channel: string, source: string, m?: [number, number, number, number, number, number]) => raw([day, channel, source], m);
const pageRow = (day: string, page: string, channel: string, source: string, m?: [number, number, number, number, number, number]) => raw([day, page, channel, source], m);

function fakeAdmin(opts: { failOnBatch?: number; throwOnBatch?: number } = {}) {
  const upserts: Array<{ table: string; rows: Array<Record<string, unknown>>; options: unknown }> = [];
  const admin: Ga4Admin = { from(table: string) { return { upsert: async (rows: unknown[], options: { onConflict: string }) => {
    upserts.push({ table, rows: rows as Array<Record<string, unknown>>, options });
    if (opts.throwOnBatch === upserts.length) throw new Error("conexão perdida");
    if (opts.failOnBatch === upserts.length) return { error: { message: "permission denied for table nexus_analytics_daily" } };
    return { error: null };
  } }; } };
  return { admin, upserts, all: () => upserts.flatMap((u) => u.rows) };
}

// ---------------------------------------------------------------------------
Deno.test("propriedade GA4: somente dígitos, 5 a 15", () => {
  for (const ok of ["12345", "123456789", "123456789012345"]) assert(isValidPropertyId(ok), ok);
  for (const bad of ["1234", "1234567890123456", "12a45", "properties/123456", " 123456", "", "123/../x", 123456, null, undefined]) assertFalse(isValidPropertyId(bad as unknown), String(bad));
});

Deno.test("fontes de IA: lista exportada; igualdade ou sufixo de domínio; sem falsos positivos", () => {
  for (const host of ["chatgpt.com", "chat.openai.com", "openai.com", "perplexity.ai", "gemini.google.com", "copilot.microsoft.com", "claude.ai", "you.com", "phind.com"]) assert(AI_SOURCE_HOSTS.includes(host), `lista deve conter ${host}`);
  for (const yes of ["chatgpt.com", "CHATGPT.COM", "www.perplexity.ai", "https://chat.openai.com/", "gemini.google.com", "api.you.com", "claude.ai", "perplexity", " copilot.microsoft.com "]) assert(isAiSource(yes), yes);
  for (const no of ["google", "google.com", "(direct)", "bing", "evil-claude.ai", "chatgpt.com.evil.example", "notyou.com", "facebook.com", "", "   ", null, undefined, 42]) assertFalse(isAiSource(no as unknown), String(no));
});

Deno.test("normalizePagePath: sem query/fragmento, '/' quando vazio, até 1000 caracteres e sem partir emoji", () => {
  assertEquals(normalizePagePath("/criminal/habeas-corpus/?utm_source=x#topo"), "/criminal/habeas-corpus/");
  assertEquals(normalizePagePath(""), "/");
  assertEquals(normalizePagePath("   "), "/");
  assertEquals(normalizePagePath("?so=query"), "/");
  assertEquals(normalizePagePath(undefined), "/");
  assertEquals(normalizePagePath("/" + "a".repeat(2000)).length, 1000);
  assertEquals(normalizePagePath("(not set)"), "(not set)");
  const emoji = normalizePagePath("/" + "😀".repeat(900)); // 4 bytes cada: o limite de bytes vale
  assert(new TextEncoder().encode(emoji).length <= 1200);
  assertFalse(/[\ud800-\udbff]$/.test(emoji), "não termina em metade de par substituto");
  assertEquals(normalizeSourceText("x".repeat(500)).length, 200);
  assertEquals(normalizeSourceText("  chatgpt.com  "), "chatgpt.com");
});

Deno.test("ga4DateToDay: YYYYMMDD vira YYYY-MM-DD; inválidas viram null", () => {
  assertEquals(ga4DateToDay("20261110"), "2026-11-10");
  assertEquals(ga4DateToDay("2026-11-10"), "2026-11-10");
  for (const bad of ["20261340", "20260231", "2026110", "abc", "", null, 20261110]) assertEquals(ga4DateToDay(bad as unknown), null, String(bad));
});

Deno.test("normalizeGa4Rows: ordem das dimensões, is_ai, arredondamento e descarte de linhas inválidas", () => {
  const rows = normalizeGa4Rows([
    pageRow("20261110", "/blog/x/?a=1", "Organic Search", "google", [10, 8, 25, 9, 321.5, 2]),
    pageRow("20261110", "/blog/y/", "Referral", "chatgpt.com", [3.4, 2, 4, 3, 10.123456, 0.5]),
    pageRow("2026-11-11", "", "Direct", "(direct)", [1, 1, 1, 1, 0, 0]),
    pageRow("99999999", "/x", "a", "b"), // data inválida
    pageRow("20261110", "/z", "a", "b", [-1, 0, 0, 0, 0, 0]), // negativa
    { dimensionValues: [{ value: "20261110" }], metricValues: [] }, // curta
    { dimensionValues: [{ value: "20261110" }, { value: "/p" }, { value: "c" }, { value: "s" }], metricValues: [{ value: "x" }, { value: "1" }, { value: "1" }, { value: "1" }, { value: "1" }, { value: "1" }] }, // métrica não numérica
  ] as Ga4RawRow[], GA4_PAGE_DIMENSIONS);
  assertEquals(rows.length, 3);
  assertEquals(rows[0], { day: "2026-11-10", page: "/blog/x/", channel: "Organic Search", source: "google", is_ai: false, sessions: 10, engaged_sessions: 8, page_views: 25, users: 9, engagement_seconds: 321.5, key_events: 2 });
  assertEquals([rows[1].is_ai, rows[1].sessions, rows[1].engagement_seconds, rows[1].key_events], [true, 3, 10.123, 0.5]);
  assertEquals([rows[2].day, rows[2].page], ["2026-11-11", "/"]);
  const site = normalizeGa4Rows([siteRow("20261110", "Organic Search", "google")], GA4_SITE_DIMENSIONS);
  assertEquals([site[0].page, site[0].channel, site[0].source], ["", "Organic Search", "google"]);
  assertEquals(normalizeGa4Rows(null as unknown as Ga4RawRow[], GA4_SITE_DIMENSIONS), []);
});

Deno.test("dedupeGa4Rows: soma linhas que colidem na chave única (página cortada, '(not set)'...)", () => {
  const base: Ga4Row = { day: "2026-11-10", page: "/a", channel: "c", source: "s", is_ai: false, sessions: 1, engaged_sessions: 1, page_views: 2, users: 1, engagement_seconds: 10, key_events: 1 };
  const merged = dedupeGa4Rows([base, { ...base, sessions: 4, page_views: 3, engagement_seconds: 5.5 }, { ...base, page: "/b" }]);
  assertEquals(merged.length, 2);
  assertEquals([merged[0].sessions, merged[0].page_views, merged[0].engagement_seconds, merged[0].users], [5, 5, 15.5, 2]);
});

Deno.test("janela de datas: 1 a 90 dias (padrão 28)", () => {
  assertEquals(ga4SyncWindow(7, NOW), { from: "2026-11-06", to: "2026-11-12" });
  assertEquals(ga4SyncWindow(undefined, NOW), { from: "2026-10-16", to: "2026-11-12" });
  assertEquals(ga4SyncWindow(0, NOW), { from: "2026-11-12", to: "2026-11-12" });
  assertEquals(ga4SyncWindow(500, NOW), { from: "2026-08-15", to: "2026-11-12" });
  assertEquals(ga4SyncWindow(Number.NaN, NOW).from, "2026-10-16");
});

// ---------------------------------------------------------------------------
Deno.test("ga4RunReport — URL fixa, escopo analytics.readonly, Bearer, corpo (dimensões, 6 métricas, ordenação, limit/offset)", async () => {
  clearGoogleTokenCache();
  const secret = await sa();
  const m = mock((c) => isToken(c) ? json({ access_token: "tok-1", expires_in: 3599 }) : json({ rows: [pageRow("20261110", "/a", "Direct", "(direct)")], rowCount: 1 }));
  const r = await ga4RunReport(m.fn, secret, PROPERTY, { startDate: "2026-10-16", endDate: "2026-11-12", dimensions: GA4_PAGE_DIMENSIONS, limit: 100000, offset: 200000 });
  assert(r.ok && r.rows.length === 1 && r.rowCount === 1);
  const api = m.api()[0];
  assertEquals([api.url, api.init.method], [`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, "POST"]);
  assertEquals(new Headers(api.init.headers).get("authorization"), "Bearer tok-1");
  const b = bodyOf(api);
  assertEquals(b.dateRanges, [{ startDate: "2026-10-16", endDate: "2026-11-12" }]);
  assertEquals(b.dimensions.map((d: { name: string }) => d.name), ["date", "pagePath", "sessionDefaultChannelGroup", "sessionSource"]);
  assertEquals(b.metrics.map((x: { name: string }) => x.name), ["sessions", "engagedSessions", "screenPageViews", "totalUsers", "userEngagementDuration", "keyEvents"]);
  assertEquals(b.metrics.length, GA4_METRICS.length);
  assertEquals(b.orderBys.map((o: { dimension: { dimensionName: string } }) => o.dimension.dimensionName), ["date", "pagePath", "sessionDefaultChannelGroup", "sessionSource"]);
  assertEquals([b.limit, b.offset, b.keepEmptyRows], ["100000", "200000", false]);
  const form = new URLSearchParams(String(m.calls[0].init.body));
  const claims = JSON.parse(atob(form.get("assertion")!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  assertEquals(claims.scope, GA4_SCOPE);
  assertEquals(GA4_SCOPE, "https://www.googleapis.com/auth/analytics.readonly");
});

Deno.test("ga4RunReport — propriedade inválida não faz chamada; erros por código", async () => {
  clearGoogleTokenCache();
  const secret = await sa();
  const never = mock(() => { throw new Error("sem rede"); });
  const bad = await ga4RunReport(never.fn, secret, "12/../34", { startDate: "a", endDate: "b", dimensions: GA4_SITE_DIMENSIONS });
  assert(!bad.ok && bad.error === "ga4_property_required");
  assertEquals(never.calls.length, 0);
  const code = async (status: number, body: unknown = { error: { message: "x" } }) => {
    clearGoogleTokenCache();
    const m = mock((c) => isToken(c) ? json({ access_token: "t", expires_in: 3599 }) : json(body, status));
    const r = await ga4RunReport(m.fn, secret, PROPERTY, { startDate: "2026-11-01", endDate: "2026-11-12", dimensions: GA4_SITE_DIMENSIONS });
    return r.ok ? "ok" : `${r.error}:${r.status}`;
  };
  assertEquals(await code(403), "ga4_forbidden:403");
  assertEquals(await code(404), "ga4_forbidden:404");
  assertEquals(await code(429), "ga4_quota:429");
  assertEquals(await code(503), "ga4_unreachable:503");
  assertEquals(await code(400), "ga4_request_failed:400");
  clearGoogleTokenCache();
  const net = await ga4RunReport(mock((c) => { if (isToken(c)) return json({ access_token: "t" }); throw new TypeError("offline"); }).fn, secret, PROPERTY, { startDate: "2026-11-01", endDate: "2026-11-12", dimensions: GA4_SITE_DIMENSIONS });
  assert(!net.ok && net.error === "ga4_unreachable" && net.status === 0);
  // falhas na troca de token ganham o prefixo ga4_
  clearGoogleTokenCache();
  const invalid = await ga4RunReport(mock(() => json({})).fn, "lixo", PROPERTY, { startDate: "a", endDate: "b", dimensions: GA4_SITE_DIMENSIONS });
  assert(!invalid.ok && invalid.error === "ga4_credential_invalid");
  const grant = await ga4RunReport(mock(() => json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400)).fn, secret, PROPERTY, { startDate: "a", endDate: "b", dimensions: GA4_SITE_DIMENSIONS });
  assert(!grant.ok && grant.error === "ga4_auth_failed");
  clearGoogleTokenCache();
});

Deno.test("ga4GetMetadata e ga4CheckToken — GET gratuito da propriedade; só token", async () => {
  clearGoogleTokenCache();
  const secret = await sa();
  const m = mock((c) => isToken(c) ? json({ access_token: "tok-m", expires_in: 3599 }) : json({ dimensions: [{}, {}], metrics: [{}] }));
  assertEquals(await ga4GetMetadata(m.fn, secret, PROPERTY), { ok: true, dimensions: 2, metrics: 1 });
  assertEquals([m.api()[0].url, m.api()[0].init.method], [`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}/metadata`, "GET"]);
  const bad = await ga4GetMetadata(m.fn, secret, "x");
  assert(!bad.ok && bad.error === "ga4_property_required");
  assertEquals(await ga4CheckToken(m.fn, secret), { ok: true });
  clearGoogleTokenCache();
  const tok = await ga4CheckToken(mock(() => json({}, 503)).fn, secret);
  assert(!tok.ok && tok.error === "ga4_unreachable");
  clearGoogleTokenCache();
});

// ---------------------------------------------------------------------------
Deno.test("syncGa4 — não configurado, sem propriedade, propriedade inválida: códigos e nenhuma chamada", async () => {
  const a = fakeAdmin();
  const never = mock(() => { throw new Error("sem rede"); });
  const base = { organizationId: ORG, projectId: PROJECT, days: 7, fetchFn: never.fn, now: () => NOW };
  const r1 = await syncGa4(a.admin, { ...base, property: PROPERTY, resolveSecret: async () => null });
  assertEquals(r1.results, [{ source: "ga4", ok: false, rows_upserted: 0, error: "ga4_not_configured", from: "2026-11-06", to: "2026-11-12" }]);
  const r2 = await syncGa4(a.admin, { ...base, property: "", resolveSecret: async () => "{}" });
  assertEquals([r2.results[0].error, r2.property], ["ga4_property_required", null]);
  const r3 = await syncGa4(a.admin, { ...base, property: "abc", resolveSecret: async () => "{}" });
  assertEquals(r3.results[0].error, "ga4_property_required");
  const r4 = await syncGa4(a.admin, { ...base, property: PROPERTY, resolveSecret: async () => { throw new Error("vault fora"); } });
  assertEquals(r4.results[0].error, "secret_unavailable");
  assertEquals([never.calls.length, a.upserts.length], [0, 0]);
});

Deno.test("syncGa4 — duas coletas (site e páginas), onConflict, lotes de 500, ids e synced_at; reexecutar repete as mesmas chaves (idempotente)", async () => {
  clearGoogleTokenCache();
  const secret = await sa();
  const bodies: Array<{ dims: string[]; limit: string; offset: string }> = [];
  const siteRows = Array.from({ length: 700 }, (_, i) => siteRow("20261110", `Canal ${i}`, i === 0 ? "chatgpt.com" : "google"));
  const pageRows = [pageRow("20261110", "/blog/a/?x=1", "Organic Search", "google"), pageRow("20261110", "/blog/a/", "Organic Search", "google", [1, 1, 1, 1, 5, 0]), pageRow("20261110", "/blog/b/", "Referral", "perplexity.ai")];
  const m = mock((c) => {
    if (isToken(c)) return json({ access_token: "tok-s", expires_in: 3599 });
    const b = bodyOf(c); bodies.push({ dims: b.dimensions.map((d: { name: string }) => d.name), limit: b.limit, offset: b.offset });
    return json(b.dimensions.length === 3 ? { rows: siteRows, rowCount: siteRows.length } : { rows: pageRows, rowCount: pageRows.length });
  });
  const run = async () => { const a = fakeAdmin(); const out = await syncGa4(a.admin, { organizationId: ORG, projectId: PROJECT, days: 7, fetchFn: m.fn, now: () => NOW, property: PROPERTY, resolveSecret: async (p) => (p === "ga4" ? secret : null) }); return { a, out }; };
  const first = await run();
  assertEquals(first.out.results, [{ source: "ga4", ok: true, rows_upserted: 702, truncated: false, from: "2026-11-06", to: "2026-11-12" }]);
  assertEquals([first.out.property, first.out.rows_upserted, first.out.truncated, first.out.from, first.out.to], [PROPERTY, 702, false, "2026-11-06", "2026-11-12"]);
  assertEquals(bodies.map((b) => b.dims.length), [3, 4], "site primeiro, depois páginas");
  assertEquals(first.a.upserts.map((u) => u.rows.length), [500, 200, 2]); // 700 do site em 2 lotes + 2 de páginas (a duplicata "/blog/a/" foi somada)
  assert(first.a.upserts.every((u) => u.table === "nexus_analytics_daily" && (u.options as { onConflict: string }).onConflict === "project_id,day,page,channel,source"));
  const all = first.a.all();
  assert(all.every((r) => r.organization_id === ORG && r.project_id === PROJECT && r.synced_at === new Date(NOW).toISOString()));
  assertEquals(all.filter((r) => r.page === "").length, 700, "linhas do site têm page=''");
  const a = all.find((r) => r.page === "/blog/a/")!;
  assertEquals([a.sessions, a.page_views, a.engagement_seconds], [11, 26, 326.5]);
  assertEquals(all.find((r) => r.source === "chatgpt.com")!.is_ai, true);
  assertEquals(all.find((r) => r.page === "/blog/b/")!.is_ai, true);
  const second = await run();
  const keys = (rows: Array<Record<string, unknown>>) => rows.map((r) => [r.project_id, r.day, r.page, r.channel, r.source].join("|")).sort();
  assertEquals(keys(second.a.all()), keys(first.a.all()), "mesmas chaves: o upsert atualiza, não duplica");
  assertEquals(new Set(keys(first.a.all())).size, first.a.all().length, "nenhuma chave repetida dentro de uma execução");
});

Deno.test("syncGa4 — paginação por offset e truncated quando o teto de páginas é atingido", async () => {
  clearGoogleTokenCache();
  const secret = await sa();
  const offsets: string[] = [];
  const m = mock((c) => {
    if (isToken(c)) return json({ access_token: "tok-p", expires_in: 3599 });
    const b = bodyOf(c); offsets.push(`${b.dimensions.length}:${b.offset}`);
    const start = Number(b.offset);
    return json({ rows: Array.from({ length: 3 }, (_, i) => siteRow("20261110", `c${start + i}`, "google")), rowCount: 100 });
  });
  const a = fakeAdmin();
  const out = await syncGa4(a.admin, { organizationId: ORG, projectId: PROJECT, days: 1, fetchFn: m.fn, now: () => NOW, property: PROPERTY, resolveSecret: async () => secret, pageRows: 3, maxPages: 2 });
  // as linhas por página têm 4 dimensões; o mock devolve linhas de 3 dimensões, então só as do site são aceitas
  assertEquals(offsets, ["3:0", "3:3", "4:0", "4:3"]);
  assertEquals([out.truncated, out.results[0].truncated, out.results[0].ok], [true, true, true]);
  // página parcial encerra sem pedir a seguinte, mesmo com rowCount maior
  offsets.length = 0;
  const short = mock((c) => isToken(c) ? json({ access_token: "tok-q", expires_in: 3599 }) : json({ rows: [siteRow("20261110", "c", "google")], rowCount: 500 }));
  const b = fakeAdmin();
  const out2 = await syncGa4(b.admin, { organizationId: ORG, projectId: PROJECT, days: 1, fetchFn: short.fn, now: () => NOW, property: PROPERTY, resolveSecret: async () => secret, pageRows: 3, maxPages: 5 });
  assertEquals([short.api().length, out2.truncated], [2, false]);
});

Deno.test("syncGa4 — erros: 403/429/5xx da API, falha de upsert (parcial) e exceção do banco; nunca lança", async () => {
  clearGoogleTokenCache();
  const secret = await sa();
  const mk = (status: number) => mock((c) => isToken(c) ? json({ access_token: "tok-e", expires_in: 3599 }) : json({ error: { message: "x" } }, status));
  const opts = (fetchFn: typeof fetch, admin: Ga4Admin) => [admin, { organizationId: ORG, projectId: PROJECT, days: 7, fetchFn, now: () => NOW, property: PROPERTY, resolveSecret: async () => secret }] as const;
  for (const [status, error] of [[403, "ga4_forbidden"], [429, "ga4_quota"], [503, "ga4_unreachable"], [400, "ga4_request_failed"]] as const) {
    clearGoogleTokenCache();
    const a = fakeAdmin();
    const out = await syncGa4(...opts(mk(status).fn, a.admin));
    assertEquals([out.results[0].ok, out.results[0].error, out.rows_upserted, a.upserts.length], [false, error, 0, 0]);
  }
  clearGoogleTokenCache();
  const okFetch = mock((c) => isToken(c) ? json({ access_token: "tok-f", expires_in: 3599 }) : json({ rows: [siteRow("20261110", "Direct", "(direct)")], rowCount: 1 }));
  const failing = fakeAdmin({ failOnBatch: 1 });
  const f = await syncGa4(...opts(okFetch.fn, failing.admin));
  assertEquals([f.results[0].ok, f.results[0].error], [false, "upsert_failed:permission denied for table nexus_analytics_daily"]);
  const throwing = fakeAdmin({ throwOnBatch: 1 });
  const t = await syncGa4(...opts(okFetch.fn, throwing.admin));
  assertEquals([t.results[0].ok, t.results[0].error], [false, "upsert_failed:conexão perdida"]);
  // site gravado e a coleta por página falha: devolve as linhas já gravadas e o código da falha
  let calls = 0;
  const half = mock((c) => { if (isToken(c)) return json({ access_token: "tok-g", expires_in: 3599 }); calls++; return calls === 1 ? json({ rows: [siteRow("20261110", "Direct", "(direct)")], rowCount: 1 }) : json({ error: {} }, 429); });
  const h = fakeAdmin();
  const hr = await syncGa4(...opts(half.fn, h.admin));
  assertEquals([hr.results[0].ok, hr.results[0].error, hr.rows_upserted], [false, "ga4_quota", 1]);
  // o administrador que falha ao ser chamado não escapa
  const exploding = { from() { throw new Error("boom"); } } as unknown as Ga4Admin;
  const e = await syncGa4(...opts(okFetch.fn, exploding));
  assertEquals([e.results[0].ok, e.results[0].error], [false, "upsert_failed:boom"]);
  clearGoogleTokenCache();
});

Deno.test("syncGa4 — nenhum resultado carrega credencial, chave ou token", async () => {
  clearGoogleTokenCache();
  const secret = await sa();
  const m = mock((c) => isToken(c) ? json({ access_token: "tok-SEGREDO-123", expires_in: 3599 }) : json({ rows: [siteRow("20261110", "Direct", "(direct)")], rowCount: 1 }));
  const a = fakeAdmin();
  const out = await syncGa4(a.admin, { organizationId: ORG, projectId: PROJECT, days: 7, fetchFn: m.fn, now: () => NOW, property: PROPERTY, resolveSecret: async () => secret });
  const dump = JSON.stringify([out, a.upserts]);
  for (const forbidden of ["tok-SEGREDO-123", "PRIVATE KEY", "ga4-sync@proj-teste", JSON.parse(secret).private_key.slice(40, 80)]) assertFalse(dump.includes(forbidden), forbidden);
  clearGoogleTokenCache();
});
