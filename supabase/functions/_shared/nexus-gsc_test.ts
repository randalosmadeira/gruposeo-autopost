/**
 * Testes do cliente do Google Search Console: JWT RS256 verificado com um par RSA gerado no teste,
 * troca por token com cache de 50 min, listagem de propriedades, consulta paginada e normalização.
 * Executar com: deno test --no-lock --node-modules-dir=none supabase/functions/_shared/nexus-gsc_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clearGscTokenCache, getGscAccessToken, GSC_SCOPE, gscListSites, gscQuery, normalizeGscRows, parseServiceAccount, pemToDer, signServiceAccountJwt,
} from "./nexus-gsc.ts";

const EMAIL = "zica-gsc@projeto-teste.iam.gserviceaccount.com";

function toPem(der: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
}
async function makeAccount() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = toPem(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { json: JSON.stringify({ type: "service_account", client_email: EMAIL, private_key: pem, token_uri: "https://evil.example/token" }), publicKey: pair.publicKey, pem };
}
const b64urlToBytes = (s: string) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const decodePart = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => { const call = { url: String(input), init: init ?? {} }; calls.push(call); return await respond(call); }) as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const isToken = (c: Call) => c.url === "https://oauth2.googleapis.com/token";

Deno.test("parseServiceAccount e pemToDer", async () => {
  const acc = await makeAccount();
  assertEquals(parseServiceAccount(acc.json)?.client_email, EMAIL);
  assertEquals(parseServiceAccount("não é json"), null);
  assertEquals(parseServiceAccount(JSON.stringify({ type: "authorized_user", client_email: EMAIL, private_key: acc.pem })), null);
  assertEquals(parseServiceAccount(JSON.stringify({ type: "service_account", client_email: EMAIL, private_key: "-----BEGIN RSA PRIVATE KEY-----\nx" })), null);
  assert(pemToDer(acc.pem).length > 1000);
  assert(pemToDer(acc.pem.replace(/\n/g, "\\n")).length > 1000); // PEM com \n literais também é aceito
});

Deno.test("JWT RS256 — cabeçalho, claims e assinatura verificados com a chave pública", async () => {
  const acc = await makeAccount();
  const sa = parseServiceAccount(acc.json)!;
  const jwt = await signServiceAccountJwt(sa, 1_700_000_000);
  const [h, c, s] = jwt.split(".");
  assertEquals(decodePart(h), { alg: "RS256", typ: "JWT" });
  assertEquals(decodePart(c), { iss: EMAIL, scope: GSC_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: 1_700_000_000, exp: 1_700_003_600 });
  assert(!jwt.includes("=") && !jwt.includes("+") && !jwt.includes("/"), "base64url sem padding");
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", acc.publicKey, b64urlToBytes(s) as BufferSource, new TextEncoder().encode(`${h}.${c}`));
  assert(ok, "a assinatura deve validar com a chave pública do par gerado");
  const tampered = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", acc.publicKey, b64urlToBytes(s) as BufferSource, new TextEncoder().encode(`${h}.${c}x`));
  assert(!tampered);
});

Deno.test("troca de token — corpo, URL fixa, JWT assinado e cache de 50 min", async () => {
  clearGscTokenCache();
  const acc = await makeAccount();
  let now = 1_700_000_000_000;
  const m = mockFetch(c => isToken(c) ? json({ access_token: "tok-1", expires_in: 3599, token_type: "Bearer" }) : json({}));
  const first = await getGscAccessToken(m.fn, acc.json, { now: () => now });
  assertEquals(first, { ok: true, token: "tok-1" });
  assertEquals(m.calls.length, 1);
  assertEquals(m.calls[0].url, "https://oauth2.googleapis.com/token"); // ignora o token_uri do JSON
  const form = new URLSearchParams(String(m.calls[0].init.body));
  assertEquals(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, c, s] = form.get("assertion")!.split(".");
  assertEquals(decodePart(c).iat, 1_700_000_000);
  assert(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", acc.publicKey, b64urlToBytes(s) as BufferSource, new TextEncoder().encode(`${h}.${c}`)));
  now += 49 * 60_000;
  await getGscAccessToken(m.fn, acc.json, { now: () => now });
  assertEquals(m.calls.length, 1, "dentro de 50 min usa o cache");
  now += 2 * 60_000;
  await getGscAccessToken(m.fn, acc.json, { now: () => now });
  assertEquals(m.calls.length, 2, "após 50 min troca de novo");
});

Deno.test("troca de token — falhas: JSON inválido, invalid_grant, 5xx e rede", async () => {
  clearGscTokenCache();
  const acc = await makeAccount();
  assertEquals(await getGscAccessToken(mockFetch(() => json({})).fn, "lixo"), { ok: false, status: 400, error: "gsc_credential_invalid" });
  const badKey = JSON.stringify({ type: "service_account", client_email: EMAIL, private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" });
  const bk = await getGscAccessToken(mockFetch(() => json({})).fn, badKey);
  assert(!bk.ok && bk.error === "gsc_credential_invalid");
  const grant = await getGscAccessToken(mockFetch(() => json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400)).fn, acc.json);
  assertEquals(grant, { ok: false, status: 400, error: "gsc_auth_failed", detail: "invalid_grant: Invalid JWT Signature." });
  const five = await getGscAccessToken(mockFetch(() => json({}, 503)).fn, acc.json);
  assert(!five.ok && five.error === "gsc_unreachable" && five.status === 503);
  const net = await getGscAccessToken(mockFetch(() => { throw new TypeError("offline"); }).fn, acc.json);
  assertEquals(net, { ok: false, status: 0, error: "gsc_unreachable" });
  const noTok = await getGscAccessToken(mockFetch(() => json({ token_type: "Bearer" })).fn, acc.json);
  assert(!noTok.ok && noTok.error === "gsc_auth_failed");
});

Deno.test("gscListSites — GET /sites com Bearer, lista propriedades; 403 e rede", async () => {
  clearGscTokenCache();
  const acc = await makeAccount();
  const m = mockFetch(c => isToken(c) ? json({ access_token: "tok-2", expires_in: 3599 }) : json({ siteEntry: [{ siteUrl: "sc-domain:rdmadvogados.com.br", permissionLevel: "siteOwner" }, { siteUrl: "https://x.com/", permissionLevel: "siteRestrictedUser" }, { permissionLevel: "x" }] }));
  const r = await gscListSites(m.fn, acc.json);
  assertEquals(r, { ok: true, sites: [{ siteUrl: "sc-domain:rdmadvogados.com.br", permissionLevel: "siteOwner" }, { siteUrl: "https://x.com/", permissionLevel: "siteRestrictedUser" }] });
  assertEquals(m.calls[1].url, "https://www.googleapis.com/webmasters/v3/sites");
  assertEquals(new Headers(m.calls[1].init.headers).get("authorization"), "Bearer tok-2");
  const empty = await gscListSites(mockFetch(c => isToken(c) ? json({ access_token: "t" }) : json({})).fn, acc.json);
  assertEquals(empty, { ok: true, sites: [] });
  clearGscTokenCache();
  const forbidden = await gscListSites(mockFetch(c => isToken(c) ? json({ access_token: "t" }) : json({ error: { code: 403, message: "Search Console API has not been used in project 1 before or it is disabled." } }, 403)).fn, acc.json);
  assert(!forbidden.ok && forbidden.error === "gsc_forbidden" && forbidden.status === 403 && /has not been used/.test(forbidden.detail || ""));
});

Deno.test("gscQuery — corpo, URL com propriedade codificada, rowLimit/startRow limitados e 401 invalida o cache", async () => {
  clearGscTokenCache();
  const acc = await makeAccount();
  let tokens = 0;
  let status = 200;
  const m = mockFetch(c => isToken(c) ? json({ access_token: `tok-${++tokens}`, expires_in: 3599 }) : status === 200 ? json({ rows: [{ keys: ["2026-11-10", "q", "https://a.com/", "bra", "MOBILE"], clicks: 3, impressions: 40, ctr: 0.075, position: 4.2 }] }) : json({ error: { message: "expired" } }, status));
  const r = await gscQuery(m.fn, acc.json, "sc-domain:rdmadvogados.com.br", { startDate: "2026-11-01", endDate: "2026-11-12", dimensions: ["date", "query", "page", "country", "device"], rowLimit: 999_999, startRow: 25000 });
  assert(r.ok && r.rows.length === 1);
  assertEquals(m.calls[1].url, "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Ardmadvogados.com.br/searchAnalytics/query");
  assertEquals(m.calls[1].init.method, "POST");
  assertEquals(JSON.parse(String(m.calls[1].init.body)), { startDate: "2026-11-01", endDate: "2026-11-12", dimensions: ["date", "query", "page", "country", "device"], rowLimit: 25000, startRow: 25000 });
  status = 401;
  const unauthorized = await gscQuery(m.fn, acc.json, "sc-domain:rdmadvogados.com.br", { startDate: "2026-11-01", endDate: "2026-11-12", dimensions: ["date"] });
  assert(!unauthorized.ok && unauthorized.error === "gsc_request_failed" && unauthorized.status === 401);
  status = 200;
  await gscQuery(m.fn, acc.json, "sc-domain:rdmadvogados.com.br", { startDate: "2026-11-01", endDate: "2026-11-12", dimensions: ["date"] });
  assertEquals(tokens, 2, "o 401 limpou o cache e forçou nova troca");
  const noProp = await gscQuery(m.fn, acc.json, " ", { startDate: "a", endDate: "b", dimensions: [] });
  assert(!noProp.ok && noProp.error === "gsc_property_required");
  status = 404;
  const nf = await gscQuery(m.fn, acc.json, "sc-domain:x.com", { startDate: "2026-11-01", endDate: "2026-11-12", dimensions: ["date"] });
  assert(!nf.ok && nf.error === "gsc_forbidden");
});

Deno.test("normalizeGscRows — chaves por dimensão, minúsculas, ausentes vazias e descarte de linhas inválidas", () => {
  const dims = ["date", "query", "page", "country", "device"];
  const rows = normalizeGscRows([
    { keys: ["2026-11-10", "advogado criminal", "https://rdmadvogados.com.br/criminal", "bra", "MOBILE"], clicks: 5, impressions: 100, ctr: 0.05, position: 3.5 },
    { keys: ["2026-11-10", "x", "https://a.com/", "usa", "DESKTOP"], clicks: "2", impressions: "10", ctr: 0.2, position: 1 },
    { keys: ["10/11/2026", "x", "p", "bra", "TABLET"], clicks: 1, impressions: 1, ctr: 1, position: 1 },
    { keys: ["2026-11-10", "curta"], clicks: 1, impressions: 1, ctr: 1, position: 1 },
    { keys: ["2026-11-10", "n", "p", "bra", "MOBILE"], clicks: "abc", impressions: 1, ctr: 1, position: 1 },
    { keys: ["2026-11-11", "sem ctr", "p", "bra", "MOBILE"], clicks: 2, impressions: 8, position: undefined },
  ], dims);
  assertEquals(rows.length, 3);
  assertEquals(rows[0], { date: "2026-11-10", query: "advogado criminal", page: "https://rdmadvogados.com.br/criminal", country: "bra", device: "mobile", clicks: 5, impressions: 100, ctr: 0.05, position: 3.5 });
  assertEquals(rows[1].clicks, 2); assertEquals(rows[1].impressions, 10);
  assertEquals(rows[2].ctr, 0.25); assertEquals(rows[2].position, 0);
  assertEquals(normalizeGscRows([{ keys: ["2026-11-10"], clicks: 1, impressions: 2, ctr: 0.5, position: 2 }], ["date"]),
    [{ date: "2026-11-10", query: "", page: "", country: "", device: "", clicks: 1, impressions: 2, ctr: 0.5, position: 2 }]);
});
