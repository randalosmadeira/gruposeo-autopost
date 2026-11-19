/**
 * Testes dos coletores SERP (DataForSEO, SerpApi, Brave) com `fetch` injetado e fixtures.
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-collectors_test.ts
 */
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CollectorError, dataforseoLanguage, DATAFORSEO_LOCATION_CODES, braveSearchLang, braveUiLang, googleHl, locationCodeFor, parseBraveRateLimit, redactSecrets, runCollector,
  type CollectorInput,
} from "./nexus-collectors.ts";

const INPUT: CollectorInput = { engine: "", query: "advogado criminalista são paulo", country: "BR", language: "pt-BR", domain: "rdmadvogados.com.br", variants: ["RDM Advogados"] };
const FAKE_PASSWORD = "senha-super-secreta-123";
const DFS_CRED = `login@example.com:${FAKE_PASSWORD}`;
const FAKE_KEY = "FAKEKEY0123456789abcdef";

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return await respond(call);
  }) as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

// ---- DataForSEO -------------------------------------------------------------------------------
const dfsOk = (se: "google" | "bing") => ({
  status_code: 20000, status_message: "Ok.", cost: 0.0006,
  tasks: [{ status_code: 20000, status_message: "Ok.", cost: 0.0006, result: [{ keyword: INPUT.query, items: [
    ...(se === "google" ? [{ type: "ai_overview", rank_group: 1, references: [{ type: "ai_overview_reference", url: "https://www.rdmadvogados.com.br/criminal", title: "RDM", source: "RDM" }, { url: "https://cnj.jus.br/x", title: "CNJ" }, { url: "http://inseguro.example/x", title: "x" }, { url: "https://cnj.jus.br/x", title: "dup" }] }] : []),
    { type: "organic", rank_group: 1, rank_absolute: 2, url: "https://concorrente.com.br/a", title: "Concorrente", description: "desc a" },
    { type: "paid", rank_group: 1, rank_absolute: 1, url: "https://anuncio.com.br/", title: "Anúncio" },
    { type: "organic", rank_group: 2, rank_absolute: 3, url: "https://www.rdmadvogados.com.br/criminal", title: "RDM Criminal", description: "defesa criminal" },
    { type: "organic", rank_group: 3, rank_absolute: 4, url: "javascript:alert(1)", title: "lixo" },
  ] }] }],
});

Deno.test("DataForSEO Google — requisição, parser, AI Overview, custo e latência", async () => {
  const m = mockFetch(() => json(dfsOk("google")));
  const r = await runCollector("dataforseo_google", DFS_CRED, { ...INPUT, engine: "dataforseo_google", city: "São Paulo" }, m.fn);
  assertEquals(m.calls.length, 1);
  const call = m.calls[0];
  assertEquals(call.url, "https://api.dataforseo.com/v3/serp/google/organic/live/advanced");
  assertEquals(call.init.method, "POST");
  assertEquals(header(call.init, "authorization"), `Basic ${btoa(DFS_CRED)}`);
  assertEquals(JSON.parse(String(call.init.body)), [{ keyword: INPUT.query, location_code: 2076, language_code: "pt", depth: 10 }]);
  const o = r.output as Record<string, unknown> & { organic: Array<{ position: number; url: string }> };
  assertEquals(o.organic.map(x => [x.position, x.url]), [[1, "https://concorrente.com.br/a"], [2, "https://www.rdmadvogados.com.br/criminal"]]);
  assertEquals(o.observed_rank, 2); assertEquals(o.not_found_in_sample, false); assertEquals(o.results_in_sample, 2);
  assertEquals(o.ai_overview, { present: true, sources: [{ url: "https://www.rdmadvogados.com.br/criminal", title: "RDM" }, { url: "https://cnj.jus.br/x", title: "CNJ" }] });
  assertEquals(o.provider, "dataforseo"); assertEquals(o.engine, "dataforseo_google");
  assert(typeof o.latency_ms === "number" && (o.latency_ms as number) >= 0);
  assert(!Number.isNaN(Date.parse(String(o.collected_at))));
  assertEquals((o.context as Record<string, unknown>).country, "br"); assertEquals((o.context as Record<string, unknown>).location_code, 2076);
  assertEquals(r.cost_micros, 600); assertEquals(o.cost_basis, "provider_reported");
});

Deno.test("DataForSEO Bing — sem ai_overview e endpoint do Bing; idioma en-US vira en", async () => {
  const m = mockFetch(() => json(dfsOk("bing")));
  const r = await runCollector("dataforseo_bing", DFS_CRED, { ...INPUT, engine: "dataforseo_bing", country: "us", language: "en-US" }, m.fn);
  assertEquals(m.calls[0].url, "https://api.dataforseo.com/v3/serp/bing/organic/live/advanced");
  assertEquals(JSON.parse(String(m.calls[0].init.body))[0].location_code, 2840);
  assertEquals(JSON.parse(String(m.calls[0].init.body))[0].language_code, "en");
  assert(!("ai_overview" in r.output));
});

Deno.test("DataForSEO — Google sem item ai_overview informa present=false", async () => {
  const ok = dfsOk("bing");
  const m = mockFetch(() => json(ok));
  const r = await runCollector("dataforseo_google", DFS_CRED, INPUT, m.fn);
  assertEquals(r.output.ai_overview, { present: false, sources: [] });
});

Deno.test("DataForSEO — status_code != 20000 (tarefa ou topo) e HTTP não-2xx lançam provider_request_failed", async () => {
  const taskErr = { status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field: 'location_code'." }] };
  const topErr = { status_code: 40100, status_message: "You are not authorized" , tasks: [] };
  for (const body of [taskErr, topErr]) {
    const m = mockFetch(() => json(body));
    const err = await assertRejects(() => runCollector("dataforseo_google", DFS_CRED, INPUT, m.fn), CollectorError, "provider_request_failed");
    assert((err as CollectorError).detail !== undefined);
  }
  const http = mockFetch(() => json({ status_message: "boom" }, 502));
  const e = await assertRejects(() => runCollector("dataforseo_google", DFS_CRED, INPUT, http.fn), Error, "provider_request_failed");
  assertEquals((e as CollectorError).status, 502);
  const net = mockFetch(() => { throw new TypeError("connection reset"); });
  await assertRejects(() => runCollector("dataforseo_bing", DFS_CRED, INPUT, net.fn), Error, "provider_request_failed");
  const notJson = mockFetch(() => new Response("<html>", { status: 200 }));
  await assertRejects(() => runCollector("dataforseo_bing", DFS_CRED, INPUT, notJson.fn), Error, "provider_request_failed");
});

Deno.test("DataForSEO — país fora da tabela, credencial sem ':' e consulta vazia", async () => {
  const m = mockFetch(() => json(dfsOk("google")));
  await assertRejects(() => runCollector("dataforseo_google", DFS_CRED, { ...INPUT, country: "jp" }, m.fn), Error, "country_unsupported");
  await assertRejects(() => runCollector("dataforseo_google", DFS_CRED, { ...INPUT, country: "brasil" }, m.fn), Error, "country_unsupported");
  await assertRejects(() => runCollector("dataforseo_google", "semdoispontos", INPUT, m.fn), Error, "credential_invalid");
  await assertRejects(() => runCollector("dataforseo_google", "login:", INPUT, m.fn), Error, "credential_invalid");
  await assertRejects(() => runCollector("dataforseo_google", DFS_CRED, { ...INPUT, query: "   " }, m.fn), Error, "query_required");
  assertEquals(m.calls.length, 0); // nada vai à rede quando a validação falha
});

Deno.test("tabela de países e mapeamento de idioma", () => {
  assertEquals(DATAFORSEO_LOCATION_CODES, { br: 2076, us: 2840, pt: 2620, es: 2724, it: 2380, fr: 2250, gb: 2826, de: 2276, ar: 2032, mx: 2484, ca: 2124, cl: 2152, co: 2170, uy: 2858 });
  assertEquals(locationCodeFor("BR"), 2076); assertEquals(locationCodeFor("uy"), 2858);
  assertEquals(dataforseoLanguage("pt-BR"), "pt"); assertEquals(dataforseoLanguage("pt-PT"), "pt-PT"); assertEquals(dataforseoLanguage("es_MX"), "es"); assertEquals(dataforseoLanguage("zh-TW"), "zh-TW");
  assertEquals(googleHl("pt-BR"), "pt-BR"); assertEquals(googleHl("en-US"), "en"); assertEquals(googleHl("FR"), "fr");
  assertEquals(braveSearchLang("pt-BR"), "pt-br"); assertEquals(braveSearchLang("en-US"), "en"); assertEquals(braveSearchLang("zh-CN"), "zh-hans");
  assertEquals(braveUiLang("pt-BR", "br"), "pt-BR"); assertEquals(braveUiLang("en", "us"), "en-US"); assertEquals(braveUiLang("es", "mx"), "es-MX");
  let threw = false; try { dataforseoLanguage("1"); } catch (e) { threw = (e as Error).message === "language_invalid"; }
  assert(threw);
});

// ---- SerpApi ----------------------------------------------------------------------------------
const serpapiGoogle = {
  search_metadata: { status: "Success" },
  search_parameters: { engine: "google", q: INPUT.query, api_key: FAKE_KEY },
  ai_overview: { text_blocks: [], references: [{ title: "RDM", link: "https://rdmadvogados.com.br/criminal" }, { title: "Outro", link: "https://outro.com.br/p" }] },
  organic_results: [
    { position: 1, title: "A", link: "https://a.com.br/", snippet: "sa" },
    { position: 2, title: "RDM", link: "https://rdmadvogados.com.br/criminal", snippet: "sr" },
  ],
};

Deno.test("SerpApi Google — parâmetros gl/hl/num, parser, AI Overview, custo de referência e chave redigida", async () => {
  const m = mockFetch(() => json(serpapiGoogle));
  const r = await runCollector("serpapi_google", FAKE_KEY, { ...INPUT, engine: "serpapi_google", city: "Sao Paulo, State of Sao Paulo, Brazil" }, m.fn);
  const u = new URL(m.calls[0].url);
  assertEquals(u.origin + u.pathname, "https://serpapi.com/search.json");
  assertEquals(u.searchParams.get("engine"), "google"); assertEquals(u.searchParams.get("q"), INPUT.query);
  assertEquals(u.searchParams.get("gl"), "br"); assertEquals(u.searchParams.get("hl"), "pt-BR"); assertEquals(u.searchParams.get("num"), "10");
  assertEquals(u.searchParams.get("location"), "Sao Paulo, State of Sao Paulo, Brazil"); assertEquals(u.searchParams.get("api_key"), FAKE_KEY);
  assertEquals(m.calls[0].init.method, "GET");
  const o = r.output as Record<string, unknown>;
  assertEquals(o.observed_rank, 2); assertEquals(o.results_in_sample, 2); assertEquals(o.provider, "serpapi");
  assertEquals(o.ai_overview, { present: true, sources: [{ url: "https://rdmadvogados.com.br/criminal", title: "RDM" }, { url: "https://outro.com.br/p", title: "Outro" }] });
  assertEquals(r.cost_micros, 10_000); assertEquals(o.cost_basis, "reference_estimate");
  assert(!JSON.stringify(r).includes(FAKE_KEY), "a chave não pode aparecer na resposta bruta nem na saída");
});

Deno.test("SerpApi Bing — usa cc em vez de gl, sem ai_overview, posição ausente usa a ordem", async () => {
  const m = mockFetch(() => json({ organic_results: [{ title: "x", link: "https://x.com.br/", snippet: "" }, { title: "r", link: "https://rdmadvogados.com.br/", snippet: "" }] }));
  const r = await runCollector("serpapi_bing", FAKE_KEY, { ...INPUT, engine: "serpapi_bing" }, m.fn);
  const u = new URL(m.calls[0].url);
  assertEquals(u.searchParams.get("engine"), "bing"); assertEquals(u.searchParams.get("cc"), "br"); assertEquals(u.searchParams.get("gl"), null); assertEquals(u.searchParams.get("count"), "10");
  assertEquals(r.output.observed_rank, 2); assert(!("ai_overview" in r.output));
});

Deno.test("SerpApi — sem resultados é amostra vazia; erro do provedor e HTTP 401 lançam provider_request_failed", async () => {
  const empty = mockFetch(() => json({ error: "Google hasn't returned any results for this query." }));
  const r = await runCollector("serpapi_google", FAKE_KEY, INPUT, empty.fn);
  assertEquals(r.output.results_in_sample, 0); assertEquals(r.output.not_found_in_sample, true); assertEquals(r.output.observed_rank, null);
  const bad = mockFetch(() => json({ error: "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key" }));
  await assertRejects(() => runCollector("serpapi_google", FAKE_KEY, INPUT, bad.fn), Error, "provider_request_failed");
  const unauthorized = mockFetch(() => json({ error: "Invalid API key" }, 401));
  const e = await assertRejects(() => runCollector("serpapi_bing", FAKE_KEY, INPUT, unauthorized.fn), Error, "provider_request_failed");
  assertEquals((e as CollectorError).status, 401);
  const none = mockFetch(() => json({ search_metadata: { status: "Success" } }));
  await assertRejects(() => runCollector("serpapi_google", FAKE_KEY, INPUT, none.fn), Error, "serp_response_invalid");
});

// ---- Brave ------------------------------------------------------------------------------------
const braveBody = { type: "search", web: { results: [
  { title: "Guia", url: "https://cnj.jus.br/guia", description: "d1" },
  { title: "RDM", url: "https://rdmadvogados.com.br/criminal", description: "d2" },
  { title: "ruim", url: "ftp://x.com/a", description: "" },
] } };

Deno.test("Brave — parâmetros, token, posição pela ordem, headers de rate limit e custo de referência", async () => {
  const m = mockFetch(() => json(braveBody, 200, { "X-RateLimit-Limit": "1, 15000", "X-RateLimit-Remaining": "0, 14999", "X-RateLimit-Reset": "1, 2592000" }));
  const r = await runCollector("brave_search", FAKE_KEY, { ...INPUT, engine: "brave_search" }, m.fn);
  const u = new URL(m.calls[0].url);
  assertEquals(u.origin + u.pathname, "https://api.search.brave.com/res/v1/web/search");
  assertEquals(u.searchParams.get("q"), INPUT.query); assertEquals(u.searchParams.get("country"), "BR");
  assertEquals(u.searchParams.get("search_lang"), "pt-br"); assertEquals(u.searchParams.get("ui_lang"), "pt-BR"); assertEquals(u.searchParams.get("count"), "10");
  assertEquals(header(m.calls[0].init, "x-subscription-token"), FAKE_KEY);
  assertEquals(u.toString().includes(FAKE_KEY), false); // o token vai no header, nunca na URL
  const o = r.output as Record<string, unknown> & { organic: Array<{ position: number; url: string }> };
  assertEquals(o.organic.map(x => x.position), [1, 2]); assertEquals(o.observed_rank, 2); assertEquals(o.provider, "brave"); assertEquals(o.engine, "brave_search");
  assertEquals(o.rate_limit, { limit: [1, 15000], remaining: [0, 14999], reset: [1, 2592000] });
  assertEquals(r.cost_micros, 5000); assert(!("ai_overview" in o));
});

Deno.test("Brave — sem bloco web é amostra vazia; 429/5xx e token inválido lançam provider_request_failed; país inválido", async () => {
  const empty = mockFetch(() => json({ type: "search", query: { original: "x" } }));
  const r = await runCollector("brave_search", FAKE_KEY, INPUT, empty.fn);
  assertEquals(r.output.results_in_sample, 0); assert(!("rate_limit" in r.output));
  for (const status of [401, 422, 429, 503]) {
    const m = mockFetch(() => json({ error: { code: "X", detail: "falhou" } }, status, { "X-RateLimit-Remaining": "0, 0" }));
    const e = await assertRejects(() => runCollector("brave_search", FAKE_KEY, INPUT, m.fn), Error, "provider_request_failed");
    assertEquals((e as CollectorError).status, status);
  }
  const m2 = mockFetch(() => json(braveBody));
  await assertRejects(() => runCollector("brave_search", FAKE_KEY, { ...INPUT, country: "b" }, m2.fn), Error, "country_unsupported");
  await assertRejects(() => runCollector("serper_x", FAKE_KEY, INPUT, m2.fn), Error, "engine_unsupported");
  assertEquals(m2.calls.length, 0);
});

Deno.test("parseBraveRateLimit e redactSecrets", () => {
  assertEquals(parseBraveRateLimit(new Headers()), null);
  assertEquals(parseBraveRateLimit(new Headers({ "x-ratelimit-remaining": "3" })), { limit: [], remaining: [3], reset: [] });
  const red = redactSecrets({ a: `x ${FAKE_KEY} y`, b: [encodeURIComponent("a b&c=senha123")] }, [FAKE_KEY, "a b&c=senha123"]);
  assertEquals(JSON.stringify(red).includes(FAKE_KEY), false);
  assertEquals(JSON.stringify(red).includes("senha123"), false);
});
