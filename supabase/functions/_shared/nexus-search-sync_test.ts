/**
 * Testes de `syncSearchPerformance` com `fetch` e `admin` injetados (sem rede, sem banco).
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-search-sync_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clearGscTokenCache } from "./nexus-gsc.ts";
import { dedupeRows, GSC_PAGE_ROWS, syncSearchPerformance, syncWindow, type SyncOptions } from "./nexus-search-sync.ts";

const ORG = "11111111-1111-1111-1111-111111111111";
const PROJECT = "22222222-2222-2222-2222-222222222222";
const NOW = Date.parse("2026-11-12T12:00:00Z");
const noSleep = () => Promise.resolve();

async function serviceAccountJson() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der));
  return JSON.stringify({ type: "service_account", client_email: "sync@proj.iam.gserviceaccount.com", private_key: `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n` });
}
let saCache: string | null = null;
const sa = async () => (saCache ??= await serviceAccountJson());

type Upsert = { table: string; rows: Array<Record<string, unknown>>; options: unknown };
function fakeAdmin(opts: { failOnBatch?: number; throwOnBatch?: number } = {}) {
  const upserts: Upsert[] = [];
  const admin = { from(table: string) { return { upsert: async (rows: Array<Record<string, unknown>>, options: unknown) => {
    upserts.push({ table, rows, options });
    if (opts.throwOnBatch === upserts.length) throw new Error("conexão perdida");
    if (opts.failOnBatch === upserts.length) return { error: { message: "permission denied for table nexus_search_performance" } };
    return { error: null };
  } }; } };
  return { admin, upserts, all: () => upserts.flatMap(u => u.rows) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function gscRow(i: number, day = "2026-11-10") { return { keys: [day, `consulta ${i}`, `https://rdmadvogados.com.br/p/${i % 7}`, "bra", i % 2 ? "MOBILE" : "DESKTOP"], clicks: i % 5, impressions: 10 + (i % 9), ctr: 0.1, position: 2 + (i % 4) }; }

function gscFetch(pages: Array<Array<ReturnType<typeof gscRow>>>, onApi?: (body: Record<string, unknown>, url: string) => Response | void) {
  const apiBodies: Array<Record<string, unknown>> = []; const urls: string[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "tok", expires_in: 3599 });
    const body = JSON.parse(String(init?.body)); apiBodies.push(body); urls.push(url);
    const custom = onApi?.(body, url); if (custom) return custom;
    return json({ rows: pages[Math.floor(body.startRow / GSC_PAGE_ROWS)] ?? [] });
  }) as typeof fetch;
  return { fn, apiBodies, urls };
}
const base = (over: Partial<SyncOptions>): SyncOptions => ({ organizationId: ORG, projectId: PROJECT, source: "gsc", days: 7, domain: "www.rdmadvogados.com.br", now: () => NOW, sleep: noSleep,
  fetchFn: (() => { throw new Error("rede indisponível no teste"); }) as unknown as typeof fetch, resolveSecret: async () => null, ...over });

Deno.test("janela de datas e dedupeRows", () => {
  assertEquals(syncWindow(7, NOW), { from: "2026-11-06", to: "2026-11-12" });
  assertEquals(syncWindow(0, NOW), { from: "2026-11-12", to: "2026-11-12" });
  assertEquals(syncWindow(999, NOW), { from: "2026-08-15", to: "2026-11-12" });
  assertEquals(syncWindow(Number.NaN, NOW).from, "2026-10-16");
  const merged = dedupeRows([
    { day: "d", query: "q", page: "", country: "", device: "", clicks: 1, impressions: 10, ctr: 0.1, position: 2 },
    { day: "d", query: "q", page: "", country: "", device: "", clicks: 3, impressions: 30, ctr: 0.1, position: 4 },
    { day: "d", query: "outra", page: "", country: "", device: "", clicks: 1, impressions: 1, ctr: 1, position: 1 },
  ]);
  assertEquals(merged.length, 2);
  assertEquals(merged[0], { day: "d", query: "q", page: "", country: "", device: "", clicks: 4, impressions: 40, ctr: 0.1, position: 3.5 });
});

Deno.test("GSC — várias páginas por startRow, dimensões, lotes de 500, onConflict e idempotência de chaves", async () => {
  clearGscTokenCache();
  const secret = await sa();
  const page1 = Array.from({ length: GSC_PAGE_ROWS }, (_, i) => gscRow(i));
  const page2 = Array.from({ length: 1234 }, (_, i) => gscRow(GSC_PAGE_ROWS + i));
  const f = gscFetch([page1, page2]);
  const a = fakeAdmin();
  const r = await syncSearchPerformance(a.admin, base({ fetchFn: f.fn, resolveSecret: async p => (p === "gsc" ? secret : null) }));
  assertEquals(r.results, [{ source: "gsc", ok: true, rows_upserted: GSC_PAGE_ROWS + 1234, truncated: false, from: "2026-11-06", to: "2026-11-12" }]);
  assertEquals(f.apiBodies.map(b => b.startRow), [0, GSC_PAGE_ROWS]);
  assertEquals(f.apiBodies[0], { startDate: "2026-11-06", endDate: "2026-11-12", dimensions: ["date", "query", "page", "country", "device"], rowLimit: 25000, startRow: 0 });
  assertEquals(f.urls[0], "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Ardmadvogados.com.br/searchAnalytics/query"); // sem www
  assert(a.upserts.every(u => u.table === "nexus_search_performance" && u.rows.length <= 500));
  assertEquals(a.upserts.length, Math.ceil((GSC_PAGE_ROWS + 1234) / 500));
  assertEquals(a.upserts[0].options, { onConflict: "project_id,source,day,query,page,country,device" });
  assertEquals(a.upserts[0].rows[0], { organization_id: ORG, project_id: PROJECT, source: "gsc", day: "2026-11-10", query: "consulta 0", page: "https://rdmadvogados.com.br/p/0", country: "bra", device: "desktop", clicks: 0, impressions: 10, ctr: 0.1, position: 2 });
  assertEquals(new Set(a.all().map(x => `${x.day}|${x.query}|${x.page}|${x.country}|${x.device}`)).size, a.all().length, "sem chaves repetidas");
});

Deno.test("GSC — truncated quando as 5 consultas vêm cheias; nunca passa de 5 consultas", async () => {
  clearGscTokenCache();
  const secret = await sa();
  const full = (k: number) => Array.from({ length: GSC_PAGE_ROWS }, (_, i) => gscRow(k * GSC_PAGE_ROWS + i));
  const f = gscFetch([0, 1, 2, 3, 4, 5].map(full));
  const a = fakeAdmin();
  const r = await syncSearchPerformance(a.admin, base({ fetchFn: f.fn, resolveSecret: async () => secret }));
  assertEquals(f.apiBodies.length, 5);
  assertEquals(f.apiBodies.map(b => b.startRow), [0, 25000, 50000, 75000, 100000]);
  assertEquals(r.results[0].ok, true); assertEquals(r.results[0].truncated, true); assertEquals(r.results[0].rows_upserted, 5 * GSC_PAGE_ROWS);
});

Deno.test("GSC — propriedade explícita, duplicatas entre páginas são unidas, sem dados é ok com 0 linhas", async () => {
  clearGscTokenCache();
  const secret = await sa();
  const dup = gscRow(1);
  const f = gscFetch([[dup, dup, gscRow(2)]]);
  const a = fakeAdmin();
  const r = await syncSearchPerformance(a.admin, base({ fetchFn: f.fn, resolveSecret: async () => secret, property: "https://rdmadvogados.com.br/" }));
  assertEquals(f.urls[0], "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Frdmadvogados.com.br%2F/searchAnalytics/query");
  assertEquals(r.results[0].rows_upserted, 2);
  assertEquals(a.all().find(x => x.query === "consulta 1")!.clicks, 2 * dup.clicks);
  const none = fakeAdmin();
  const empty = await syncSearchPerformance(none.admin, base({ fetchFn: gscFetch([[]]).fn, resolveSecret: async () => secret }));
  assertEquals(empty.results[0], { source: "gsc", ok: true, rows_upserted: 0, truncated: false, from: "2026-11-06", to: "2026-11-12" });
  assertEquals(none.upserts.length, 0);
});

Deno.test("GSC — falhas nunca lançam: não configurado, segredo indisponível, 403, rede, upsert com erro ou exceção", async () => {
  clearGscTokenCache();
  const secret = await sa();
  const a = fakeAdmin();
  assertEquals((await syncSearchPerformance(a.admin, base({ resolveSecret: async () => null }))).results[0].error, "gsc_not_configured");
  assertEquals((await syncSearchPerformance(a.admin, base({ resolveSecret: async () => { throw new Error("vault fora"); } }))).results[0].error, "secret_unavailable");
  assertEquals((await syncSearchPerformance(a.admin, base({ resolveSecret: async () => "lixo" }))).results[0].error, "gsc_credential_invalid");
  const forbidden = await syncSearchPerformance(a.admin, base({ fetchFn: gscFetch([], () => json({ error: { message: "User does not have sufficient permission" } }, 403)).fn, resolveSecret: async () => secret }));
  assertEquals(forbidden.results[0], { source: "gsc", ok: false, rows_upserted: 0, error: "gsc_forbidden", from: "2026-11-06", to: "2026-11-12" });
  const net = await syncSearchPerformance(a.admin, base({ fetchFn: gscFetch([], () => { throw new TypeError("offline"); }).fn, resolveSecret: async () => secret }));
  assertEquals(net.results[0].error, "gsc_unreachable");
  const pages = [Array.from({ length: 1200 }, (_, i) => gscRow(i))];
  const failing = fakeAdmin({ failOnBatch: 2 });
  const up = await syncSearchPerformance(failing.admin, base({ fetchFn: gscFetch(pages).fn, resolveSecret: async () => secret }));
  assertEquals(up.results[0].ok, false); assertEquals(up.results[0].rows_upserted, 500);
  assert(String(up.results[0].error).startsWith("upsert_failed:permission denied"));
  const throwing = fakeAdmin({ throwOnBatch: 1 });
  const th = await syncSearchPerformance(throwing.admin, base({ fetchFn: gscFetch(pages).fn, resolveSecret: async () => secret }));
  assertEquals(th.results[0].error, "upsert_failed:conexão perdida");
  const noDomain = await syncSearchPerformance(a.admin, base({ domain: "", resolveSecret: async () => secret }));
  assertEquals(noDomain.results[0].error, "gsc_property_required");
});

// ---- Bing --------------------------------------------------------------------------------------
const ms = (iso: string) => `/Date(${Date.parse(iso)})/`;
function bingFetch(handlers: Partial<Record<string, () => Response>> = {}) {
  const calls: string[] = [];
  const defaults: Record<string, unknown> = {
    GetUserSites: { d: [{ Url: "https://outro.com/", IsVerified: true }, { Url: "https://rdmadvogados.com.br/", IsVerified: true }] },
    GetQueryStats: { d: [
      { Query: "advogado criminal", Date: ms("2026-11-10T07:00:00Z"), Clicks: 4, Impressions: 80, AvgClickPosition: 2, AvgImpressionPosition: 3.5 },
      { Query: "antiga", Date: ms("2026-09-01T07:00:00Z"), Clicks: 1, Impressions: 1, AvgImpressionPosition: 1 },
      { Query: "advogado criminal", Date: ms("2026-11-10T22:00:00Z"), Clicks: 1, Impressions: 20, AvgImpressionPosition: 5.5 },
    ] },
    GetPageStats: { d: [{ Query: "https://rdmadvogados.com.br/criminal", Date: ms("2026-11-11T07:00:00Z"), Clicks: 2, Impressions: 40, AvgImpressionPosition: 2 }] },
    GetRankAndTrafficStats: { d: [{ Date: ms("2026-11-11T07:00:00Z"), Clicks: 6, Impressions: 120 }, { Date: ms("2026-10-01T07:00:00Z"), Clicks: 1, Impressions: 1 }] },
  };
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(String(input)); const method = url.pathname.split("/").pop()!;
    calls.push(`${method}?${url.searchParams.get("siteUrl") ?? ""}`);
    const h = handlers[method]; if (h) return h();
    return json(defaults[method]);
  }) as typeof fetch;
  return { fn, calls };
}

Deno.test("Bing — união de consultas, páginas e série diária, filtro de datas, chave com strings vazias", async () => {
  const f = bingFetch(); const a = fakeAdmin();
  const r = await syncSearchPerformance(a.admin, base({ source: "bing", fetchFn: f.fn, resolveSecret: async p => (p === "bing_webmaster" ? "BINGKEY0123456789abcdef" : null) }));
  assertEquals(r.results, [{ source: "bing", ok: true, rows_upserted: 3, truncated: false, from: "2026-11-06", to: "2026-11-12" }]);
  assertEquals(f.calls.sort(), ["GetPageStats?https://rdmadvogados.com.br/", "GetQueryStats?https://rdmadvogados.com.br/", "GetRankAndTrafficStats?https://rdmadvogados.com.br/", "GetUserSites?"]);
  const rows = a.all();
  const query = rows.find(x => x.query === "advogado criminal")!;
  assertEquals(query, { organization_id: ORG, project_id: PROJECT, source: "bing", day: "2026-11-10", query: "advogado criminal", page: "", country: "", device: "", clicks: 5, impressions: 100, ctr: 0.05, position: 3.9 });
  assertEquals(rows.find(x => x.page === "https://rdmadvogados.com.br/criminal"), { organization_id: ORG, project_id: PROJECT, source: "bing", day: "2026-11-11", query: "", page: "https://rdmadvogados.com.br/criminal", country: "", device: "", clicks: 2, impressions: 40, ctr: 0.05, position: 2 });
  assertEquals(rows.find(x => x.query === "" && x.page === ""), { organization_id: ORG, project_id: PROJECT, source: "bing", day: "2026-11-11", query: "", page: "", country: "", device: "", clicks: 6, impressions: 120, ctr: 0.05, position: 0 });
  assert(!rows.some(x => x.query === "antiga"));
  assertEquals(a.upserts[0].options, { onConflict: "project_id,source,day,query,page,country,device" });
});

Deno.test("Bing — não configurado, site não cadastrado, chave inválida e 5xx persistente (com retry)", async () => {
  const a = fakeAdmin();
  assertEquals((await syncSearchPerformance(a.admin, base({ source: "bing" }))).results[0].error, "bing_not_configured");
  const none = bingFetch({ GetUserSites: () => json({ d: [{ Url: "https://outro.com/", IsVerified: true }] }) });
  assertEquals((await syncSearchPerformance(a.admin, base({ source: "bing", fetchFn: none.fn, resolveSecret: async () => "K1234567890123456" }))).results[0].error, "bing_site_not_found");
  const badKey = bingFetch({ GetUserSites: () => json({ ErrorCode: 3, Message: "InvalidApiKey" }, 400) });
  assertEquals((await syncSearchPerformance(a.admin, base({ source: "bing", fetchFn: badKey.fn, resolveSecret: async () => "K1234567890123456" }))).results[0].error, "bing_unauthorized");
  const down = bingFetch({ GetUserSites: () => json({}, 503) });
  const r = await syncSearchPerformance(a.admin, base({ source: "bing", fetchFn: down.fn, resolveSecret: async () => "K1234567890123456" }));
  assertEquals(r.results[0].error, "bing_unreachable"); assertEquals(down.calls.length, 2);
  assertEquals(a.upserts.length, 0);
});

Deno.test("Bing — `d` ausente em todos os métodos: falha; só em um: grava o resto e informa bing_partial", async () => {
  const allBad = bingFetch({ GetQueryStats: () => json({}), GetPageStats: () => json({}), GetRankAndTrafficStats: () => json({}) });
  const a = fakeAdmin();
  const r = await syncSearchPerformance(a.admin, base({ source: "bing", fetchFn: allBad.fn, resolveSecret: async () => "K1234567890123456" }));
  assertEquals(r.results[0].ok, false); assertEquals(r.results[0].error, "bing_unreachable"); assertEquals(a.upserts.length, 0);
  const partial = bingFetch({ GetPageStats: () => json({ d: null }, 200) });
  const b = fakeAdmin();
  const p = await syncSearchPerformance(b.admin, base({ source: "bing", fetchFn: partial.fn, resolveSecret: async () => "K1234567890123456" }));
  assertEquals(p.results[0].ok, false); assertEquals(p.results[0].error, "bing_partial:GetPageStats:bing_unreachable"); assertEquals(p.results[0].rows_upserted, 2);
});

Deno.test("source 'all' — um provedor falha e o outro segue; cada resultado é independente", async () => {
  clearGscTokenCache();
  const secret = await sa();
  const gscF = gscFetch([[gscRow(1), gscRow(2)]]); const bingF = bingFetch();
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => String(input).includes("bing.com") ? await bingF.fn(input) : await gscF.fn(input, init)) as typeof fetch;
  const a = fakeAdmin();
  const both = await syncSearchPerformance(a.admin, base({ source: "all", fetchFn, resolveSecret: async p => (p === "gsc" ? secret : "BINGKEY0123456789abcdef") }));
  assertEquals(both.results.map(r => [r.source, r.ok, r.rows_upserted]), [["gsc", true, 2], ["bing", true, 3]]);
  const onlyBing = await syncSearchPerformance(fakeAdmin().admin, base({ source: "all", fetchFn, resolveSecret: async p => (p === "gsc" ? null : "BINGKEY0123456789abcdef") }));
  assertEquals(onlyBing.results.map(r => [r.source, r.ok, r.error ?? null]), [["gsc", false, "gsc_not_configured"], ["bing", true, null]]);
  const noneCfg = await syncSearchPerformance(fakeAdmin().admin, base({ source: "all" }));
  assertEquals(noneCfg.results.map(r => r.error), ["gsc_not_configured", "bing_not_configured"]);
});

Deno.test("nenhum resultado, erro ou log contém credenciais", async () => {
  clearGscTokenCache();
  const secret = await sa();
  const logs: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...x: unknown[]) => { logs.push(x.join(" ")); };
  try {
    const r = await syncSearchPerformance(fakeAdmin().admin, base({ source: "all", fetchFn: gscFetch([], () => json({ error: { message: "x" } }, 403)).fn, resolveSecret: async p => (p === "gsc" ? secret : "BINGKEY0123456789abcdef") }));
    const dump = JSON.stringify(r) + logs.join("\n");
    assert(!dump.includes("BEGIN PRIVATE KEY") && !dump.includes("BINGKEY0123456789abcdef"));
  } finally { console.log = orig.log; console.error = orig.error; console.warn = orig.warn; }
});
