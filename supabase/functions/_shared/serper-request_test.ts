/**
 * Testes do montador de requisições do Serper (serper-request.ts) e da chave de requisição com origem (cidade e idioma).
 * Sem rede e sem banco. Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/serper-request_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SERPER_TYPES, serperRegionalInputs, serperRequest } from "./serper-request.ts";
import { manualRequestKey, runRequestKey } from "./nexus-intelligence.ts";

const base = { query: "advogado criminalista", country: "br", language: "pt-BR" };

Deno.test("busca web: payload com gl, hl, location, página e num=10", () => {
  const r = serperRequest({ ...base, city: "São Paulo" });
  assert(r);
  assertEquals(r.type, "search");
  assertEquals(r.url, "https://google.serper.dev/search");
  assertEquals(r.payload, { q: "advogado criminalista", gl: "br", hl: "pt", location: "São Paulo", page: 1, num: 10 });
});

Deno.test("tipo padrão é search, página inválida e tipo desconhecido são recusados", () => {
  assertEquals(serperRequest(base)?.type, "search");
  assertEquals(serperRequest({ ...base, serperType: "inexistente" }), null);
  assertEquals(serperRequest({ ...base, page: 0 }), null);
  assertEquals(serperRequest({ ...base, page: 1.5 }), null);
  assertEquals(serperRequest({ ...base, page: "2" }), null);
  assertEquals(Object.keys(SERPER_TYPES).length, 14);
});

Deno.test("país, idioma, cidade e tamanho da consulta são validados", () => {
  assertEquals(serperRequest({ ...base, country: "brasil" }), null);
  assertEquals(serperRequest({ ...base, language: "português" }), null);
  assertEquals(serperRequest({ ...base, city: "x".repeat(101) }), null);
  assertEquals(serperRequest({ ...base, query: "" }), null, "consulta vazia");
  assertEquals(serperRequest({ ...base, query: "x".repeat(501) }), null, "busca comum limita em 500");
  assertEquals(serperRequest({ ...base, query: 42 as unknown as string }), null);
});

Deno.test("maps usa a cidade na consulta e só o idioma como geografia", () => {
  const r = serperRequest({ ...base, serperType: "maps", city: "Lisboa", language: "pt-PT" });
  assert(r);
  assertEquals(r.payload, { q: "advogado criminalista, Lisboa", hl: "pt", page: 1 });
});

Deno.test("webpage e lens exigem URL http/https sem credenciais", () => {
  const w = serperRequest({ ...base, serperType: "webpage", query: "https://example.com/pagina" });
  assert(w);
  assertEquals(w.url, "https://scrape.serper.dev");
  assertEquals(w.payload, { url: "https://example.com/pagina", includeMarkdown: true });
  assertEquals(serperRequest({ ...base, serperType: "webpage", query: "ftp://example.com" }), null);
  assertEquals(serperRequest({ ...base, serperType: "webpage", query: "https://user:senha@example.com" }), null);
  assertEquals(serperRequest({ ...base, serperType: "lens", query: "não é url" }), null);
  const l = serperRequest({ ...base, serperType: "lens", query: "https://example.com/a.png", city: "São Paulo" });
  assertEquals(l?.payload, { url: "https://example.com/a.png", gl: "br", hl: "pt", location: "São Paulo" });
});

Deno.test("reviews exige cid:, fid: ou placeId: e normaliza o campo", () => {
  assertEquals(serperRequest({ ...base, serperType: "reviews", query: "placeId:ChIJabc_123" })?.payload, { gl: "br", hl: "pt", placeId: "ChIJabc_123" });
  assertEquals(serperRequest({ ...base, serperType: "reviews", query: "cid:123456789" })?.payload, { gl: "br", hl: "pt", cid: "123456789" });
  assertEquals(serperRequest({ ...base, serperType: "reviews", query: "qualquer coisa" }), null);
  assertEquals(serperRequest({ ...base, serperType: "reviews", query: "cid:" + "9".repeat(250) }), null);
});

Deno.test("resolve aceita JSON de objeto (até 100 mil caracteres) e recusa o resto", () => {
  const ok = serperRequest({ ...base, serperType: "resolve", query: JSON.stringify({ organic: [{ link: "https://example.com" }] }) });
  assertEquals(ok?.payload, { organic: [{ link: "https://example.com" }] });
  assertEquals(serperRequest({ ...base, serperType: "resolve", query: "isto não é json" }), null);
  assertEquals(serperRequest({ ...base, serperType: "resolve", query: "null" }), null);
  assertEquals(serperRequest({ ...base, serperType: "resolve", query: " ".repeat(100001) }), null);
});

Deno.test("planos regionais: sem regiões devolve a própria entrada; regiões duplicadas colapsam", () => {
  assertEquals(serperRegionalInputs(base, undefined)?.length, 1);
  assertEquals(serperRegionalInputs({ ...base, query: "" }, undefined), null);
  const rows = serperRegionalInputs(base, ["br | pt-BR | São Paulo", "BR|pt-br|são paulo", "br | pt-BR | Guarulhos"]);
  assertEquals(rows?.length, 2);
  // em duplicata (mesmo país, idioma e cidade sem diferenciar caixa) a última entrada vence e mantém a ordem de chegada
  assertEquals(rows?.[0].city, "são paulo");
  assertEquals(rows?.[1].city, "Guarulhos");
});

Deno.test("planos regionais: limites e regras por tipo", () => {
  assertEquals(serperRegionalInputs(base, []), null);
  assertEquals(serperRegionalInputs(base, "br|pt-BR"), null, "regiões precisam ser lista");
  assertEquals(serperRegionalInputs(base, Array.from({ length: 101 }, (_, i) => `br|pt-BR|Cidade ${i}`)), null);
  assertEquals(serperRegionalInputs(base, Array.from({ length: 100 }, (_, i) => `br|pt-BR|Cidade ${i}`))?.length, 100);
  assertEquals(serperRegionalInputs(base, ["br|pt-BR|a|extra"]), null);
  assertEquals(serperRegionalInputs(base, ["br"]), null);
  assertEquals(serperRegionalInputs(base, [3 as unknown as string]), null);
  assertEquals(serperRegionalInputs({ ...base, serperType: "maps" }, ["br|pt-BR"]), null, "maps exige cidade");
  assertEquals(serperRegionalInputs({ ...base, serperType: "maps" }, ["br|pt-BR|Lisboa"])?.length, 1);
  assertEquals(serperRegionalInputs({ ...base, serperType: "reviews", query: "cid:1" }, ["br|pt-BR|São Paulo"]), null, "reviews não aceita cidade");
  assertEquals(serperRegionalInputs({ ...base, serperType: "webpage", query: "https://example.com" }, ["br|pt-BR"]), null, "webpage não aceita regiões");
  assertEquals(serperRegionalInputs({ ...base, serperType: "resolve", query: "{}" }, ["br|pt-BR"]), null, "resolve não aceita regiões");
});

Deno.test("chaves de requisição: compatíveis com as antigas quando não há cidade (país + idioma pt-BR)", async () => {
  const antiga = await manualRequestKey("chatgpt_web", "q", "us", "2026-11-12T13:00:00.000Z");
  assertEquals(antiga, await manualRequestKey("chatgpt_web", "q", "us", "2026-11-12T13:00:00.000Z", "", "pt-BR"));
  assert(antiga.endsWith(":us:2026-11-12"));
  assertEquals(runRequestKey("s1", "p1", "google_serp", "br", "2026-11-13"), "run:s1:p1:google_serp:br:2026-11-13");
  assertEquals(runRequestKey("s1", "p1", "google_serp", "br", "2026-11-13", "", "pt-BR"), "run:s1:p1:google_serp:br:2026-11-13");
});

Deno.test("chaves de requisição: cidades e idiomas diferentes geram chaves diferentes (sem colidir)", async () => {
  const sp = runRequestKey("s1", "p1", "google_serp", "br", "2026-11-13", "São Paulo", "pt-BR");
  const guarulhos = runRequestKey("s1", "p1", "google_serp", "br", "2026-11-13", "Guarulhos", "pt-BR");
  const en = runRequestKey("s1", "p1", "google_serp", "br", "2026-11-13", "São Paulo", "en-US");
  assert(sp !== guarulhos && sp !== en && guarulhos !== en);
  assertEquals(sp, runRequestKey("s1", "p1", "google_serp", "br", "2026-11-13", "  são   paulo ", "PT-br"), "normaliza caixa e espaços");
  const m1 = await manualRequestKey("google_search", "q", "br", "2026-11-12T10:00:00Z", "São Paulo", "pt-BR");
  const m2 = await manualRequestKey("google_search", "q", "br", "2026-11-12T10:00:00Z", "Lisboa", "pt-BR");
  assert(m1 !== m2);
});
