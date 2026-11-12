/**
 * Testes do Observatório NEXUS: parsers dos quatro formatos de motor, observação manual e helpers.
 * Executar com: deno test supabase/functions/_shared/nexus-intelligence_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSignalsSnippet, engineKind, generateSiteId, generateSiteSecret, manualRequestKey, normalizeObservation, normalizeOrigins, normalizePrompt,
  normalizePromptSet, parseAiObservation, parseClaudeObservation, parseGeminiObservation, parsePerplexityObservation, runRequestKey,
} from "./nexus-intelligence.ts";

const DOMAIN = "rdmadvogados.com.br";
const VARIANTS = ["RDM Advogados"];

// Fixtures mínimas (formato resumido de cada provedor)
const openai = { model: "m-openai", output: [{ type: "message", content: [{ type: "output_text", text: "A RDM Advogados atua em direito criminal.",
  annotations: [{ type: "url_citation", url: "https://www.rdmadvogados.com.br/criminal", title: "RDM" }, { type: "url_citation", url: "https://outro.com.br/x", title: "Outro" }] }] }] };
const gemini = { modelVersion: "gemini-x", candidates: [{ content: { parts: [{ text: "Escritórios como a RDM Advogados e outros." }] },
  groundingMetadata: { groundingChunks: [
    { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA", title: "rdmadvogados.com.br" } },
    { web: { uri: "https://concorrente.com.br/pagina", title: "Concorrente" } },
    { web: { uri: "http://insecure.example/x", title: "x" } },
  ] } }] };
const claude = { model: "claude-x", content: [
  { type: "server_tool_use", name: "web_search" },
  { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://naocitado.com/a", title: "Nao citado" }] },
  { type: "text", text: "Segundo a fonte, o escritório Fulano & Cia lidera.", citations: [
    { type: "web_search_result_location", url: "https://fulano.com.br/p", title: "Fulano", cited_text: "..." },
    { type: "web_search_result_location", url: "https://fulano.com.br/p", title: "Fulano repetido", cited_text: "..." }] },
  { type: "text", text: " Também aparece o site da RDM.", citations: [{ type: "web_search_result_location", url: "https://rdmadvogados.com.br/", title: "Home" }] },
] };
const perplexity = { results: [
  { title: "Guia de custódia", url: "https://cnj.jus.br/guia", snippet: "Audiência de custódia explicada." },
  { title: "RDM Advogados — Criminal", url: "https://rdmadvogados.com.br/criminal", snippet: "Defesa criminal em São Paulo." },
  { title: "sem url válida", url: "javascript:alert(1)", snippet: "" },
] };

Deno.test("parseAiObservation (OpenAI Responses) — baseline mantido", () => {
  const r = parseAiObservation(openai, DOMAIN, VARIANTS);
  assertEquals(r.citations.length, 2); assert(r.mentioned); assert(r.cited); assertEquals(r.model, "m-openai");
});

Deno.test("parseGeminiObservation — grounding chunks, redirect usa o domínio do título, http descartado", () => {
  const r = parseGeminiObservation(gemini, DOMAIN, VARIANTS);
  assertEquals(r.citations.map(c => c.url), ["https://rdmadvogados.com.br/", "https://concorrente.com.br/pagina"]);
  assert(r.mentioned); assert(r.cited); assertEquals(r.model, "gemini-x"); assertEquals(r.rank, null);
  const none = parseGeminiObservation({ candidates: [{ content: { parts: [{ text: "Nada sobre o escritório." }] } }] }, DOMAIN, VARIANTS);
  assertEquals(none.citations, []); assert(!none.mentioned); assert(!none.cited);
});

Deno.test("parseClaudeObservation — só citações de blocos de texto, deduplicadas", () => {
  const r = parseClaudeObservation(claude, DOMAIN, ["RDM"]);
  assertEquals(r.citations.map(c => c.url), ["https://fulano.com.br/p", "https://rdmadvogados.com.br/"]);
  assert(r.mentioned); assert(r.cited); assertEquals(r.model, "claude-x");
  const notCited = parseClaudeObservation({ content: [{ type: "text", text: "RDM aparece só no texto." }] }, DOMAIN, ["RDM"]);
  assert(notCited.mentioned); assert(!notCited.cited);
});

Deno.test("parsePerplexityObservation — results[].url, menção em título/snippet, URL inválida descartada", () => {
  const r = parsePerplexityObservation(perplexity, DOMAIN, VARIANTS);
  assertEquals(r.citations.map(c => c.url), ["https://cnj.jus.br/guia", "https://rdmadvogados.com.br/criminal"]);
  assert(r.mentioned); assert(r.cited); assertEquals(r.model, null);
});

Deno.test("parsers — resposta vazia ou inválida lança erro", () => {
  for (const [fn, bad] of [[parseGeminiObservation, {}], [parseClaudeObservation, { content: [] }], [parsePerplexityObservation, {}], [parsePerplexityObservation, { results: [] }]] as const) {
    let threw = false; try { fn(bad, DOMAIN, VARIANTS); } catch { threw = true; }
    assert(threw);
  }
});

const manual = { engine: "chatgpt_web", country: "US", language: "en-US", query: "custody abroad lawyer", topic: "custodia", intent: "international",
  rdm_mentioned: false, rdm_cited: false, citations: [{ url: "https://cnj.jus.br/x#frag", title: "CNJ" }, "https://example.org/a"],
  competitors: ["CNJ", { name: "Fernandes & Magalhães", source: "organic" }, { name: "X", source: "bogus", host: "WWW.X.com" }], observed_at: "2026-11-12T10:00:00-03:00", observer: "Rândalos" };

Deno.test("normalizeObservation — monta input/output conforme o contrato", () => {
  const r = normalizeObservation(manual, Date.parse("2026-11-12T20:00:00Z"));
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.value.kind, "ai_observation");
  assertEquals(r.value.input.method, "manual_product_ui"); assertEquals(r.value.input.method_version, "manual-1.1"); assertEquals(r.value.input.country, "us");
  assertEquals(r.value.output.collected_at, "2026-11-12T13:00:00.000Z");
  assertEquals((r.value.output.citations as Array<{ url: string }>).map(c => c.url), ["https://cnj.jus.br/x", "https://example.org/a"]);
  const comps = r.value.output.competitors as Array<{ name: string; source: string; host?: string }>;
  assertEquals(comps.map(c => c.source), ["mention", "organic", "mention"]); assertEquals(comps[2].host, "x.com");
  assertEquals(engineKind("google_serp"), "serp");
  assertEquals(engineKind("gemini_web"), "ai_observation");
});

Deno.test("normalizeObservation — rejeita campos inválidos", () => {
  const now = Date.parse("2026-11-12T20:00:00Z");
  const err = (patch: Record<string, unknown>) => { const r = normalizeObservation({ ...manual, ...patch }, now); return r.ok ? "ok" : r.error; };
  assertEquals(err({ engine: "nope" }), "engine_invalid");
  assertEquals(err({ country: "usa" }), "country_invalid");
  assertEquals(err({ query: "  " }), "query_required");
  assertEquals(err({ intent: "x" }), "intent_invalid");
  assertEquals(err({ rdm_cited: "no" }), "mention_flags_required");
  assertEquals(err({ observed_at: "2027-01-01T00:00:00Z" }), "observed_at_invalid");
  assertEquals(err({ citations: [{ url: "javascript:1" }] }), "citation_url_invalid");
  assertEquals(err({ competitors: [{ name: " " }] }), "competitor_name_invalid");
});

Deno.test("manualRequestKey / runRequestKey são determinísticas", async () => {
  const a = await manualRequestKey("chatgpt_web", "q", "us", "2026-11-12T13:00:00.000Z");
  assertEquals(a, await manualRequestKey("chatgpt_web", "q", "us", "2026-11-12T01:00:00.000Z"));
  assert(/^manual:chatgpt_web:[0-9a-f]{12}:us:2026-11-12$/.test(a));
  assertEquals(runRequestKey("s", "p", "gemini_api", "br", "2026-11-12"), "run:s:p:gemini_api:br:2026-11-12");
});

Deno.test("normalizePromptSet / normalizePrompt", () => {
  const set = normalizePromptSet({ name: " Custódia ", markets: [{ country: "BR", language: "pt-BR", city: "São Paulo" }], engines: ["gemini_api", "gemini_api", "claude_api"], cadence: "weekly" });
  assert(set.ok); if (set.ok) { assertEquals(set.value.engines, ["gemini_api", "claude_api"]); assertEquals(set.value.name, "Custódia"); assertEquals(set.value.status, "active"); }
  assertEquals(normalizePromptSet({ name: "x", engines: ["zzz"] }), { ok: false, error: "engines_invalid" });
  assertEquals(normalizePromptSet({ name: "x", markets: [{ country: "brasil", language: "pt" }] }), { ok: false, error: "market_invalid" });
  assertEquals(normalizePromptSet({ name: "" }), { ok: false, error: "name_required" });
  const p = normalizePrompt({ topic: "t", intent: "discovery", query: "q" });
  assert(p.ok); if (p.ok) { assertEquals(p.value.active, true); assertEquals(p.value.position, 0); }
  assertEquals(normalizePrompt({ topic: "t", intent: "bad", query: "q" }), { ok: false, error: "intent_invalid" });
});

Deno.test("chave de sinais: site_id, segredo, origens e snippet", () => {
  assert(/^[a-z0-9]{12}$/.test(generateSiteId()));
  assert(/^[0-9a-f]{64}$/.test(generateSiteSecret()));
  assert(generateSiteSecret() !== generateSiteSecret());
  assertEquals(normalizeOrigins(["https://Site.com/", "https://site.com", "https://b.example.org:8443"]), { ok: true, value: ["https://site.com", "https://b.example.org:8443"] });
  assertEquals(normalizeOrigins(["http://site.com"]), { ok: false, error: "allowed_origins_invalid" });
  assertEquals(normalizeOrigins(["https://site.com/path"]), { ok: false, error: "allowed_origins_invalid" });
  assertEquals(normalizeOrigins(undefined), { ok: true, value: [] });
  assertEquals(buildSignalsSnippet("https://app.example/zica-signals.js", "abc123abc123", "https://p.supabase.co/functions/v1/zica-signals"),
    '<script src="https://app.example/zica-signals.js" data-site="abc123abc123" data-endpoint="https://p.supabase.co/functions/v1/zica-signals" defer></script>');
});
