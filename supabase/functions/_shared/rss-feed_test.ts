/**
 * Testes do módulo rss-feed (SSRF blocklist + parsing RSS/Atom).
 * Executar com: deno test supabase/functions/_shared/rss-feed_test.ts
 */
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateRSSUrl, fetchFeed } from "./rss-feed.ts";

// ─────────────────────────────────────────────────────────────────────────
// validateRSSUrl — SSRF blocklist
// ─────────────────────────────────────────────────────────────────────────

Deno.test("validateRSSUrl — rejects localhost", () => {
  assertThrows(() => validateRSSUrl("http://localhost/feed.xml"));
});

Deno.test("validateRSSUrl — rejects 127.0.0.1", () => {
  assertThrows(() => validateRSSUrl("http://127.0.0.1/feed.xml"));
});

Deno.test("validateRSSUrl — rejects the cloud metadata IP 169.254.169.254", () => {
  assertThrows(() => validateRSSUrl("http://169.254.169.254/latest/meta-data/"));
});

Deno.test("validateRSSUrl — rejects 10.x.x.x private range", () => {
  assertThrows(() => validateRSSUrl("http://10.0.0.5/feed.xml"));
});

Deno.test("validateRSSUrl — rejects 172.16-31.x.x private range", () => {
  assertThrows(() => validateRSSUrl("http://172.16.0.1/feed.xml"));
  assertThrows(() => validateRSSUrl("http://172.24.5.9/feed.xml"));
  assertThrows(() => validateRSSUrl("http://172.31.255.255/feed.xml"));
});

Deno.test("validateRSSUrl — does not block 172.15.x.x or 172.32.x.x (outside the /12 range)", () => {
  validateRSSUrl("https://172.15.0.1/feed.xml");
  validateRSSUrl("https://172.32.0.1/feed.xml");
});

Deno.test("validateRSSUrl — rejects 192.168.x.x private range", () => {
  assertThrows(() => validateRSSUrl("http://192.168.1.1/feed.xml"));
});

Deno.test("validateRSSUrl — rejects .internal and .local suffixes", () => {
  assertThrows(() => validateRSSUrl("http://service.internal/feed.xml"));
  assertThrows(() => validateRSSUrl("http://printer.local/feed.xml"));
});

Deno.test("validateRSSUrl — rejects non-http(s) protocols", () => {
  assertThrows(() => validateRSSUrl("file:///etc/passwd"));
  assertThrows(() => validateRSSUrl("ftp://example.com/feed.xml"));
});

Deno.test("validateRSSUrl — rejects malformed URLs", () => {
  assertThrows(() => validateRSSUrl("not a url"));
});

Deno.test("validateRSSUrl — accepts a normal public https URL", () => {
  // Should not throw.
  validateRSSUrl("https://www.conjur.com.br/rss.xml");
});

// ─────────────────────────────────────────────────────────────────────────
// fetchFeed — RSS and Atom parsing (network mocked via globalThis.fetch)
// ─────────────────────────────────────────────────────────────────────────

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed de Teste</title>
    <description>Descrição do feed</description>
    <link>https://example.com</link>
    <item>
      <title><![CDATA[Primeira notícia]]></title>
      <link>https://example.com/noticia-1</link>
      <description><![CDATA[Resumo da primeira notícia.]]></description>
      <pubDate>Mon, 15 Sep 2026 10:00:00 GMT</pubDate>
      <guid>https://example.com/noticia-1</guid>
      <author>redacao@example.com</author>
      <category>Direito</category>
      <category>Notícias</category>
    </item>
    <item>
      <title>Segunda notícia</title>
      <link>https://example.com/noticia-2</link>
      <description>Resumo da segunda notícia.</description>
      <pubDate>Tue, 16 Sep 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Feed Atom de Teste</title>
  <subtitle>Descrição do feed atom</subtitle>
  <link href="https://example.org" />
  <entry>
    <title>Entrada Atom</title>
    <link href="https://example.org/entrada-1" />
    <summary>Resumo da entrada atom.</summary>
    <published>2026-09-15T10:00:00Z</published>
    <id>https://example.org/entrada-1</id>
  </entry>
</feed>`;

function withMockedFetch<T>(xml: string, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } }),
    )) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

Deno.test({
  name: "fetchFeed — parses basic RSS items",
  // AbortSignal.timeout(...) inside fetchFeed schedules a timer that outlives
  // this fast, mocked-fetch test; sanitizers are disabled the same way any
  // test around a fetch()-with-timeout helper would need to.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const feed = await withMockedFetch(RSS_FIXTURE, () => fetchFeed("https://example.com/feed.xml"));
    assertEquals(feed.title, "Feed de Teste");
    assertEquals(feed.items.length, 2);
    assertEquals(feed.items[0].title, "Primeira notícia");
    assertEquals(feed.items[0].link, "https://example.com/noticia-1");
    assertEquals(feed.items[0].description, "Resumo da primeira notícia.");
    assertEquals(feed.items[0].guid, "https://example.com/noticia-1");
    assertEquals(feed.items[0].author, "redacao@example.com");
    assertEquals(feed.items[0].categories, ["Direito", "Notícias"]);
    assert(!("imageUrl" in feed.items[0]));
  },
});

Deno.test({
  name: "fetchFeed — parses basic Atom entries",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const feed = await withMockedFetch(ATOM_FIXTURE, () => fetchFeed("https://example.org/feed.xml"));
    assertEquals(feed.title, "Feed Atom de Teste");
    assertEquals(feed.items.length, 1);
    assertEquals(feed.items[0].title, "Entrada Atom");
    assertEquals(feed.items[0].link, "https://example.org/entrada-1");
    assertEquals(feed.items[0].description, "Resumo da entrada atom.");
    assertEquals(feed.items[0].guid, "https://example.org/entrada-1");
  },
});
