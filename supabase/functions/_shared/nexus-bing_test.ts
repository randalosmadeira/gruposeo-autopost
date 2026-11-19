/**
 * Testes do cliente do Bing Webmaster (nó `d`, datas `/Date(ms)/`, 1 retry, bing_unreachable).
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-bing_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bingGetPageStats, bingGetQueryStats, bingGetRankAndTrafficStats, bingGetUserSites, bingRequest, parseBingDate } from "./nexus-bing.ts";

const KEY = "BINGKEY0123456789abcdef";
const noSleep = { sleep: () => Promise.resolve() };

function mockFetch(responses: Array<() => Response>) {
  const calls: string[] = [];
  let i = 0;
  const fn = (async (input: string | URL | Request) => { calls.push(String(input)); const r = responses[Math.min(i++, responses.length - 1)]; return r(); }) as typeof fetch;
  return { fn, calls };
}
const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number, body: unknown = {}) => () => new Response(JSON.stringify(body), { status: code });

// 2023-11-14T22:13:20Z
const D1 = "/Date(1699999999000)/";

Deno.test("parseBingDate — /Date(ms)/ com e sem deslocamento, em UTC", () => {
  assertEquals(parseBingDate("/Date(1700000000000)/"), "2023-11-14");
  assertEquals(parseBingDate("/Date(1700000000000-0700)/"), "2023-11-14");
  assertEquals(parseBingDate("/Date(1700006400000+0000)/"), "2023-11-15");
  assertEquals(parseBingDate("/Date(0)/"), "1970-01-01");
  assertEquals(parseBingDate("2023-11-14"), null);
  assertEquals(parseBingDate(undefined), null);
  assertEquals(parseBingDate("/Date(abc)/"), null);
});

Deno.test("GetUserSites — URL, apikey na query, lista de sites do nó d", async () => {
  const m = mockFetch([ok({ d: [{ Url: "https://rdmadvogados.com.br/", IsVerified: true, AuthenticationCode: "x" }, { Url: "https://outro.com/", IsVerified: false }, { IsVerified: true }] })]);
  const r = await bingGetUserSites(m.fn, KEY, noSleep);
  assertEquals(r, { ok: true, sites: [{ url: "https://rdmadvogados.com.br/", isVerified: true }, { url: "https://outro.com/", isVerified: false }] });
  const u = new URL(m.calls[0]);
  assertEquals(u.origin + u.pathname, "https://ssl.bing.com/webmaster/api.svc/json/GetUserSites");
  assertEquals(u.searchParams.get("apikey"), KEY);
});

Deno.test("GetQueryStats / GetPageStats / GetRankAndTrafficStats — mapeiam d com datas /Date()/ e posição", async () => {
  const stats = { d: [
    { Query: "advogado criminal", Date: D1, Clicks: 4, Impressions: 80, AvgClickPosition: 2, AvgImpressionPosition: 3.5 },
    { Query: "sem cliques", Date: D1, Clicks: 0, Impressions: 10, AvgClickPosition: -1, AvgImpressionPosition: 8 },
    { Query: "sem posição", Date: D1, Clicks: 1, Impressions: 1, AvgClickPosition: 5, AvgImpressionPosition: -1 },
    { Query: "data ruim", Date: "ontem", Clicks: 1, Impressions: 1 },
  ] };
  const q = await bingGetQueryStats(mockFetch([ok(stats)]).fn, KEY, "https://rdmadvogados.com.br/", noSleep);
  assert(q.ok);
  assertEquals(q.rows, [
    { day: "2023-11-14", key: "advogado criminal", clicks: 4, impressions: 80, position: 3.5 },
    { day: "2023-11-14", key: "sem cliques", clicks: 0, impressions: 10, position: 8 },
    { day: "2023-11-14", key: "sem posição", clicks: 1, impressions: 1, position: 5 },
  ]);
  const m = mockFetch([ok({ d: [{ Query: "https://rdmadvogados.com.br/criminal", Date: D1, Clicks: 2, Impressions: 20, AvgClickPosition: 1, AvgImpressionPosition: 2 }] })]);
  const p = await bingGetPageStats(m.fn, KEY, "https://rdmadvogados.com.br/", noSleep);
  assert(p.ok); assertEquals(p.rows[0].key, "https://rdmadvogados.com.br/criminal");
  assertEquals(new URL(m.calls[0]).searchParams.get("siteUrl"), "https://rdmadvogados.com.br/");
  const t = await bingGetRankAndTrafficStats(mockFetch([ok({ d: [{ Date: D1, Clicks: 9, Impressions: 300 }] })]).fn, KEY, "https://rdmadvogados.com.br/", noSleep);
  assertEquals(t, { ok: true, rows: [{ day: "2023-11-14", clicks: 9, impressions: 300 }] });
  const empty = await bingGetQueryStats(mockFetch([ok({ d: [] })]).fn, KEY, "https://x/", noSleep);
  assertEquals(empty, { ok: true, rows: [] });
});

Deno.test("d ausente — 1 nova tentativa; se persistir, bing_unreachable; se a segunda funcionar, sucesso", async () => {
  const m = mockFetch([ok({}), ok({})]);
  const r = await bingRequest(m.fn, KEY, "GetUserSites", {}, noSleep);
  assertEquals(r, { ok: false, status: 200, error: "bing_unreachable", detail: "d_missing" });
  assertEquals(m.calls.length, 2);
  const nul = await bingRequest(mockFetch([ok({ d: null })]).fn, KEY, "GetUserSites", {}, noSleep);
  assert(!nul.ok && nul.error === "bing_unreachable");
  const m2 = mockFetch([ok({}), ok({ d: [] })]);
  assertEquals(await bingRequest(m2.fn, KEY, "GetUserSites", {}, noSleep), { ok: true, d: [] });
  assertEquals(m2.calls.length, 2);
});

Deno.test("HTTP 5xx, 429, falha de rede e erro do provedor — 1 retry e bing_unreachable", async () => {
  const five = mockFetch([status(503), status(502)]);
  assertEquals(await bingRequest(five.fn, KEY, "GetUserSites", {}, noSleep), { ok: false, status: 502, error: "bing_unreachable", detail: undefined });
  assertEquals(five.calls.length, 2);
  const recover = mockFetch([status(500), ok({ d: [{ Url: "https://a.com/", IsVerified: true }] })]);
  const r = await bingGetUserSites(recover.fn, KEY, noSleep);
  assert(r.ok && r.sites.length === 1); assertEquals(recover.calls.length, 2);
  let n = 0;
  const net = (async () => { n++; throw new TypeError("offline"); }) as unknown as typeof fetch;
  assertEquals(await bingRequest(net, KEY, "GetUserSites", {}, noSleep), { ok: false, status: 0, error: "bing_unreachable" });
  assertEquals(n, 2);
  const prov = mockFetch([status(400, { ErrorCode: 16, Message: "Site not found" })]);
  const pr = await bingRequest(prov.fn, KEY, "GetQueryStats", { siteUrl: "https://x/" }, noSleep);
  assertEquals(pr, { ok: false, status: 400, error: "bing_unreachable", detail: "Site not found" });
  assertEquals(prov.calls.length, 2);
});

Deno.test("chave inválida não é repetida: bing_unauthorized; 4xx sem ErrorCode: bing_invalid_request", async () => {
  const bad = mockFetch([status(400, { ErrorCode: 3, Message: "ERROR!!! InvalidApiKey" })]);
  assertEquals(await bingRequest(bad.fn, KEY, "GetUserSites", {}, noSleep), { ok: false, status: 400, error: "bing_unauthorized", detail: "ERROR!!! InvalidApiKey" });
  assertEquals(bad.calls.length, 1);
  const forbidden = mockFetch([status(403)]);
  const f = await bingRequest(forbidden.fn, KEY, "GetUserSites", {}, noSleep);
  assert(!f.ok && f.error === "bing_unauthorized"); assertEquals(forbidden.calls.length, 1);
  const nf = mockFetch([() => new Response("not json", { status: 404 })]);
  const r = await bingRequest(nf.fn, KEY, "GetUserSites", {}, noSleep);
  assert(!r.ok && r.error === "bing_invalid_request"); assertEquals(nf.calls.length, 1);
  assertEquals(await bingRequest(nf.fn, KEY, "Get/../X", {}, noSleep), { ok: false, status: 0, error: "bing_invalid_request" });
});
