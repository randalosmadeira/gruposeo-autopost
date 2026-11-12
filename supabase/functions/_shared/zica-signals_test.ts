/**
 * Testes do módulo zica-signals (HMAC, validação de lotes, classificação, handler com mocks).
 * Executar com: deno test supabase/functions/_shared/zica-signals_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyReferrer, classifyUserAgent, computeSignature, handleSignalsRequest, isOriginAllowed, normalizeAgent, parseBrowserEvent, parseServerBatch,
  sanitizePath, timingSafeEqual, verifySignature, type SignalEvent, type SignalsDeps,
} from "./zica-signals.ts";

const SECRET = "secret-secret-secret-0123456789abcd";
const SITE = "abcd1234efgh";
const NOW = 1_700_000_000;
const NONCE = "abcdefghijklmnop";

Deno.test("computeSignature matches the independent Node/PHP-equivalent vector", async () => {
  // node: sha256('{"a":1}') then hmac_sha256(secret, ts + "\n" + nonce + "\n" + hash)
  assertEquals(await computeSignature(SECRET, "1700000000", NONCE, '{"a":1}'), "4d6a1224774c89fe0763b5417b92c6b12f82248bdfab351b0d9d4a383b5cf11f");
});

Deno.test("verifySignature — valid, tampered body, wrong secret, skew, short nonce", async () => {
  const body = '{"a":1}';
  const signature = await computeSignature(SECRET, String(NOW), NONCE, body);
  const base = { secret: SECRET, timestamp: String(NOW), nonce: NONCE, signature, rawBody: body, nowSeconds: NOW };
  assertEquals(await verifySignature(base), { ok: true });
  assertEquals(await verifySignature({ ...base, rawBody: '{"a":2}' }), { ok: false, reason: "bad_signature" });
  assertEquals(await verifySignature({ ...base, secret: "another-secret-another-secret-0000" }), { ok: false, reason: "bad_signature" });
  assertEquals(await verifySignature({ ...base, nowSeconds: NOW + 301 }), { ok: false, reason: "skew" });
  assertEquals(await verifySignature({ ...base, nowSeconds: NOW - 301 }), { ok: false, reason: "skew" });
  assertEquals(await verifySignature({ ...base, nowSeconds: NOW + 300 }), { ok: true });
  assertEquals(await verifySignature({ ...base, nonce: "short" }), { ok: false, reason: "bad_nonce" });
  assertEquals(await verifySignature({ ...base, timestamp: "abc" }), { ok: false, reason: "bad_timestamp" });
  assertEquals(await verifySignature({ ...base, signature: signature.toUpperCase() }), { ok: true });
});

Deno.test("timingSafeEqual — equal, different, different length", () => {
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
  assert(!timingSafeEqual("abc", "abcd"));
  assert(!timingSafeEqual("", "a"));
});

Deno.test("parseServerBatch — validates, clamps and drops bad events", () => {
  const ok = parseServerBatch(JSON.stringify({ site_host: "WWW.Example.com", batch_id: "batch-0001", events: [
    { day: "2026-11-12", kind: "ai_bot_hit", agent: "GPTBot", path: "/blog/x?utm=1#top", hits: 3 },
    { day: "2026-11-12", kind: "ai_referral", agent: "chatgpt.com", path: "pagina", hits: 999999 },
    { day: "2026-13-45", kind: "ai_bot_hit", agent: "GPTBot", path: "/", hits: 1 },
    { day: "2026-11-12", kind: "nope", agent: "GPTBot", path: "/", hits: 1 },
    { day: "2026-11-12", kind: "ai_bot_hit", agent: "GPTBot", path: "/", hits: 0 },
  ] }));
  assert(ok.ok);
  if (ok.ok) {
    assertEquals(ok.batch.site_host, "example.com");
    assertEquals(ok.batch.events.length, 2);
    assertEquals(ok.batch.dropped, 3);
    assertEquals(ok.batch.events[0].path, "/blog/x");
    assertEquals(ok.batch.events[1].path, "/pagina");
    assertEquals(ok.batch.events[1].hits, 100000);
  }
  assertEquals(parseServerBatch("not json"), { ok: false, error: "json_invalid" });
  assertEquals(parseServerBatch(JSON.stringify({ site_host: "localhost", batch_id: "batch-0001", events: [] })), { ok: false, error: "site_host_invalid" });
  assertEquals(parseServerBatch(JSON.stringify({ site_host: "example.com", batch_id: "x", events: [{}] })), { ok: false, error: "batch_id_invalid" });
  assertEquals(parseServerBatch(JSON.stringify({ site_host: "example.com", batch_id: "batch-0001", events: [] })), { ok: false, error: "events_required" });
  const many = Array.from({ length: 501 }, () => ({ day: "2026-11-12", kind: "ai_bot_hit", agent: "GPTBot", path: "/", hits: 1 }));
  assertEquals(parseServerBatch(JSON.stringify({ site_host: "example.com", batch_id: "batch-0001", events: many })), { ok: false, error: "too_many_events" });
  assertEquals(parseServerBatch(JSON.stringify({ site_host: "example.com", batch_id: "batch-0001", events: [{ day: "bad" }] })), { ok: false, error: "no_valid_events" });
});

Deno.test("parseBrowserEvent — unknown agent becomes other, human kind ok, bot kind refused", () => {
  const e = parseBrowserEvent(JSON.stringify({ site_id: SITE, kind: "ai_referral", agent: "ChatGPT.com", path: "/a?b=1" }));
  assertEquals(e, { ok: true, siteId: SITE, kind: "ai_referral", agent: "chatgpt.com", path: "/a" });
  const other = parseBrowserEvent(JSON.stringify({ site_id: SITE, kind: "search_referral", agent: "weird<script>", path: "/" }));
  assert(other.ok && other.agent === "other");
  assertEquals(parseBrowserEvent(JSON.stringify({ site_id: SITE, kind: "ai_bot_hit", agent: "x", path: "/" })), { ok: false, error: "kind_invalid" });
  assertEquals(parseBrowserEvent(JSON.stringify({ site_id: "BAD", kind: "ai_referral" })), { ok: false, error: "site_id_invalid" });
});

Deno.test("normalizeAgent — canonical hosts kept, unknown or human become other", () => {
  assertEquals(normalizeAgent("ai_bot_hit", "gptbot"), "GPTBot");
  assertEquals(normalizeAgent("ai_bot_hit", "SomeCrawler"), "other");
  assertEquals(normalizeAgent("ai_referral", "chat.openai.com"), "chat.openai.com");
  assertEquals(normalizeAgent("ai_referral", "bing.com"), "bing.com");
  assertEquals(normalizeAgent("search_referral", "Yandex"), "yandex");
  assertEquals(normalizeAgent("search_referral", "chatgpt.com"), "other");
  assertEquals(normalizeAgent("human_pageview", "anything"), "other");
});

Deno.test("handler — UUID nonce, text/plain;charset=UTF-8 beacon, duplicate is 200 and never 409", async () => {
  const { deps } = makeDeps();
  const nonce = crypto.randomUUID();
  const mk = async () => new Request("https://x/", { method: "POST", body: batchBody, headers: { "Content-Type": "application/json", "X-Zica-Site": SITE, "X-Zica-Timestamp": String(NOW), "X-Zica-Nonce": nonce,
    "X-Zica-Signature": await computeSignature(SECRET, String(NOW), nonce, batchBody) } });
  assertEquals((await handleSignalsRequest(await mk(), deps)).status, 200);
  const dup = await handleSignalsRequest(await mk(), deps);
  assertEquals(dup.status, 200); assertEquals((await dup.json()).duplicate, true);
  const beacon = new Request("https://x/", { method: "POST", body: JSON.stringify({ site_id: SITE, kind: "human_pageview", agent: "x", path: "/" }), headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: "https://site.com" } });
  assertEquals((await handleSignalsRequest(beacon, deps)).status, 204);
});

Deno.test("classifyUserAgent and classifyReferrer", () => {
  assertEquals(classifyUserAgent("Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)"), "GPTBot");
  assertEquals(classifyUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/120"), null);
  assertEquals(classifyUserAgent(null), null);
  assertEquals(classifyReferrer("https://chatgpt.com/"), { kind: "ai_referral", agent: "chatgpt.com" });
  assertEquals(classifyReferrer("https://www.perplexity.ai/search?q=x"), { kind: "ai_referral", agent: "perplexity.ai" });
  assertEquals(classifyReferrer("https://www.google.com.br/"), { kind: "search_referral", agent: "google" });
  assertEquals(classifyReferrer("https://www.bing.com/copilot/x"), { kind: "ai_referral", agent: "copilot.microsoft.com" });
  assertEquals(classifyReferrer("https://www.bing.com/search?q=x"), { kind: "search_referral", agent: "bing" });
  assertEquals(classifyReferrer("https://duckduckgo.com/?q=x&ia=chat"), { kind: "ai_referral", agent: "duckduckgo.com" });
  assertEquals(classifyReferrer("", "ChatGPT.com"), { kind: "ai_referral", agent: "chatgpt.com" });
  assertEquals(classifyReferrer("https://news.example.org/"), null);
  assertEquals(classifyReferrer("https://notgoogle.com.evil.io/"), null);
});

Deno.test("sanitizePath and isOriginAllowed", () => {
  assertEquals(sanitizePath("/a/b?x=1#y"), "/a/b");
  assertEquals(sanitizePath(""), "/");
  assertEquals(sanitizePath("/" + "a".repeat(300)).length, 200);
  assert(isOriginAllowed("https://site.com", ["https://site.com"], "other.com"));
  assert(!isOriginAllowed("https://evil.com", ["https://site.com"], "site.com"));
  assert(isOriginAllowed("https://www.site.com", [], "site.com"));
  assert(!isOriginAllowed("https://evil.com", [], "site.com"));
  assert(!isOriginAllowed("", [], "site.com"));
});

// -- handler with mocks ----------------------------------------------------------------
function makeDeps(overrides: Partial<SignalsDeps> = {}) {
  const seen = new Set<string>(); const recorded: Array<{ siteId: string; batchId: string | null; events: SignalEvent[] }> = [];
  const deps: SignalsDeps = {
    now: () => NOW * 1000,
    lookupSite: (id) => Promise.resolve(id === SITE ? { allowed_origins: [], project_host: "site.com" } : null),
    getSecret: (id) => Promise.resolve(id === SITE ? SECRET : null),
    record: (siteId, batchId, events) => {
      recorded.push({ siteId, batchId, events });
      if (batchId) { if (seen.has(batchId)) return Promise.resolve({ duplicate: true, accepted: 0 }); seen.add(batchId); }
      return Promise.resolve({ duplicate: false, accepted: events.length });
    },
    ...overrides,
  };
  return { deps, recorded };
}
const batchBody = JSON.stringify({ site_host: "site.com", batch_id: "batch-0001", events: [{ day: "2026-11-12", kind: "ai_bot_hit", agent: "GPTBot", path: "/", hits: 2 }] });
async function signedRequest(body: string, over: { ts?: number; secret?: string; site?: string } = {}) {
  const ts = String(over.ts ?? NOW);
  return new Request("https://x.supabase.co/functions/v1/zica-signals", { method: "POST", body, headers: {
    "Content-Type": "application/json", "X-Zica-Site": over.site ?? SITE, "X-Zica-Timestamp": ts, "X-Zica-Nonce": NONCE,
    "X-Zica-Signature": await computeSignature(over.secret ?? SECRET, ts, NONCE, body),
  } });
}

Deno.test("handler server mode — accepts valid signature, then reports duplicate batch", async () => {
  const { deps, recorded } = makeDeps();
  const first = await handleSignalsRequest(await signedRequest(batchBody), deps);
  assertEquals(first.status, 200);
  assertEquals(await first.json(), { accepted: 1, duplicate: false, dropped: 0 });
  const second = await handleSignalsRequest(await signedRequest(batchBody), deps);
  assertEquals(second.status, 200);
  assertEquals(await second.json(), { accepted: 0, duplicate: true, dropped: 0 });
  assertEquals(recorded.length, 2);
});

Deno.test("handler server mode — 401 invalid signature / unknown site, 409 skew, 413 size, 400 bad batch", async () => {
  const { deps, recorded } = makeDeps();
  assertEquals((await handleSignalsRequest(await signedRequest(batchBody, { secret: "wrong-secret-wrong-secret-000000" }), deps)).status, 401);
  assertEquals((await handleSignalsRequest(await signedRequest(batchBody, { site: "zzzz1234zzzz" }), deps)).status, 401);
  assertEquals((await handleSignalsRequest(await signedRequest(batchBody, { ts: NOW - 1000 }), deps)).status, 409);
  const big = JSON.stringify({ pad: "x".repeat(70 * 1024) });
  assertEquals((await handleSignalsRequest(await signedRequest(big), deps)).status, 413);
  assertEquals((await handleSignalsRequest(await signedRequest("{bad json"), deps)).status, 400);
  assertEquals(recorded.length, 0);
  assertEquals((await handleSignalsRequest(new Request("https://x/", { method: "GET" }), deps)).status, 405);
});

Deno.test("handler browser mode — origin allow-list, 204 with CORS, 403 otherwise, no dedupe row", async () => {
  const { deps, recorded } = makeDeps();
  const body = JSON.stringify({ site_id: SITE, kind: "ai_referral", agent: "chatgpt.com", path: "/blog/x" });
  const mk = (origin?: string, b = body) => new Request("https://x.supabase.co/functions/v1/zica-signals", { method: "POST", body: b, headers: { "Content-Type": "text/plain", ...(origin ? { Origin: origin } : {}) } });
  const ok = await handleSignalsRequest(mk("https://www.site.com"), deps);
  assertEquals(ok.status, 204);
  assertEquals(ok.headers.get("access-control-allow-origin"), "https://www.site.com");
  assertEquals(recorded[0].batchId, null);
  assertEquals(recorded[0].events[0], { site_host: "site.com", day: "2023-11-14", kind: "ai_referral", agent: "chatgpt.com", path: "/blog/x", hits: 1 });
  assertEquals((await handleSignalsRequest(mk("https://evil.com"), deps)).status, 403);
  assertEquals((await handleSignalsRequest(mk(undefined), deps)).status, 403);
  assertEquals((await handleSignalsRequest(mk("https://site.com", "x".repeat(2000)), deps)).status, 413);
  const pre = await handleSignalsRequest(new Request("https://x/", { method: "OPTIONS", headers: { Origin: "https://site.com" } }), deps);
  assertEquals(pre.status, 204);
  assertEquals(recorded.length, 1);
});

Deno.test("handler browser mode — explicit allowed_origins replaces the host rule", async () => {
  const { deps } = makeDeps({ lookupSite: () => Promise.resolve({ allowed_origins: ["https://landing.example.org"], project_host: "site.com" }) });
  const body = JSON.stringify({ site_id: SITE, kind: "search_referral", agent: "google", path: "/" });
  const req = (origin: string) => new Request("https://x/", { method: "POST", body, headers: { "Content-Type": "application/json", Origin: origin } });
  assertEquals((await handleSignalsRequest(req("https://landing.example.org"), deps)).status, 204);
  assertEquals((await handleSignalsRequest(req("https://site.com"), deps)).status, 403);
});
