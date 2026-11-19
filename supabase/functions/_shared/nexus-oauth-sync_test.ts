/**
 * Testes da credencial de sincronização por OAuth gerenciado (causa C1, 14/11/2026).
 * Executar com: deno test supabase/functions/_shared/nexus-oauth-sync_test.ts
 */
import { assert, assertEquals, assertFalse, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { asOAuthAccessSecret, getGoogleAccessToken, gscQuery, GSC_SCOPE, OAUTH_ACCESS_PREFIX } from './nexus-gsc.ts';
import { ga4RunReport } from './nexus-ga4.ts';
import { ga4DigitsOf, loadOAuthLink, resolveOAuthSecret, type OAuthAdmin } from './nexus-oauth-sync.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRJ = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const APP = { clientId: 'client-id', clientSecret: 'client-secret' };

function adminOf(opts: { link?: Record<string, unknown> | null; linkError?: boolean; refresh?: unknown; rpcError?: boolean } = {}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const filters: string[] = [];
  const builder = {
    select: (_c: string) => builder,
    eq: (k: string, v: unknown) => { filters.push(`${k}=${v}`); return builder; },
    maybeSingle: () => Promise.resolve(
      opts.linkError
        ? { data: null, error: { message: 'x' } }
        : { data: opts.link === undefined ? { property_id: 'sc-domain:site.example.com', connected_by: ACTOR } : opts.link, error: null },
    ),
  };
  const admin: OAuthAdmin = {
    from: (_t: string) => builder,
    rpc: (name, args) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(opts.rpcError ? { data: null, error: { message: 'oauth_project_forbidden' } } : { data: opts.refresh === undefined ? 'refresh-token-123' : opts.refresh, error: null });
    },
  };
  return { admin, rpcCalls, filters };
}
const jsonRes = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

Deno.test('segredo "oauth-access:" é usado como token pronto (sem JWT nem troca), em GSC e GA4', async () => {
  const urls: string[] = [];
  const auth: string[] = [];
  const fetchFn = ((url: string | URL, init?: RequestInit) => {
    urls.push(String(url));
    auth.push(String((init?.headers as Record<string, string>)?.Authorization));
    return Promise.resolve(jsonRes({ rows: [], rowCount: 0 }));
  }) as typeof fetch;
  const secret = asOAuthAccessSecret('ya29.token');
  assert(secret.startsWith(OAUTH_ACCESS_PREFIX));
  assertEquals(await getGoogleAccessToken(fetchFn, secret, { scope: GSC_SCOPE, errorPrefix: 'gsc' }), { ok: true, token: 'ya29.token' });
  assertEquals(urls.length, 0);
  assertEquals((await gscQuery(fetchFn, secret, 'sc-domain:site.example.com', { startDate: '2026-11-01', endDate: '2026-11-07', dimensions: ['date'] })).ok, true);
  assertEquals((await ga4RunReport(fetchFn, secret, '413247338', { startDate: '2026-11-01', endDate: '2026-11-07', dimensions: ['date'] })).ok, true);
  assertEquals(urls.map((u) => new URL(u).hostname), ['www.googleapis.com', 'analyticsdata.googleapis.com']);
  assertEquals(auth, ['Bearer ya29.token', 'Bearer ya29.token']);
  assertEquals(await getGoogleAccessToken(fetchFn, OAUTH_ACCESS_PREFIX, { scope: GSC_SCOPE, errorPrefix: 'ga4' }), { ok: false, status: 400, error: 'ga4_credential_invalid' });
});

Deno.test('resolveOAuthSecret: lê o refresh token pela RPC com o ator da conexão, troca por access token e devolve o segredo', async () => {
  const { admin, rpcCalls, filters } = adminOf();
  const fetched: Array<{ url: string; body: string }> = [];
  const fetchFn = ((url: string | URL, init?: RequestInit) => {
    fetched.push({ url: String(url), body: String(init?.body) });
    return Promise.resolve(jsonRes({ access_token: 'ya29.novo', expires_in: 3599 }));
  }) as typeof fetch;
  const secret = await resolveOAuthSecret(admin, fetchFn, APP, ORG, PRJ, 'gsc');
  assertEquals(secret, 'oauth-access:ya29.novo');
  assertEquals(rpcCalls, [{ name: 'nexus_oauth_token', args: { p_project: PRJ, p_org: ORG, p_actor: ACTOR, p_provider: 'gsc', p_refresh: null } }]);
  assertEquals(filters.sort(), [`organization_id=${ORG}`, `project_id=${PRJ}`, 'provider=gsc'].sort());
  assertEquals(fetched.length, 1);
  assertEquals(fetched[0].url, 'https://oauth2.googleapis.com/token');
  const body = new URLSearchParams(fetched[0].body);
  assertEquals([body.get('grant_type'), body.get('refresh_token'), body.get('client_id')], ['refresh_token', 'refresh-token-123', 'client-id']);
  assertFalse(String(secret).includes('refresh-token-123'));
});

Deno.test('resolveOAuthSecret: sem conexão devolve null; falhas lançam códigos curtos sem vazar segredos', async () => {
  const never = (() => { throw new Error('não deveria chamar'); }) as unknown as typeof fetch;
  assertEquals(await resolveOAuthSecret(adminOf({ link: null }).admin, never, APP, ORG, PRJ, 'ga4'), null);
  assertEquals(await resolveOAuthSecret(adminOf({ linkError: true }).admin, never, APP, ORG, PRJ, 'ga4'), null);
  await assertRejects(() => resolveOAuthSecret(adminOf().admin, never, { clientId: '', clientSecret: '' }, ORG, PRJ, 'gsc'), Error, 'oauth_agency_app_not_configured');
  await assertRejects(() => resolveOAuthSecret(adminOf({ rpcError: true }).admin, never, APP, ORG, PRJ, 'gsc'), Error, 'oauth_project_forbidden');
  await assertRejects(() => resolveOAuthSecret(adminOf({ refresh: null }).admin, never, APP, ORG, PRJ, 'gsc'), Error, 'oauth_connection_required');
  const revoked = (() => Promise.resolve(jsonRes({ error: 'invalid_grant', error_description: 'Token has been revoked refresh-token-123' }, 400))) as typeof fetch;
  const err = await assertRejects(() => resolveOAuthSecret(adminOf().admin, revoked, APP, ORG, PRJ, 'gsc'), Error, 'oauth_token_exchange_failed');
  assertFalse(String((err as Error).message).includes('refresh-token-123'));
});

Deno.test('loadOAuthLink e ga4DigitsOf', async () => {
  assertEquals(await loadOAuthLink(adminOf().admin, ORG, PRJ, 'gsc'), { property_id: 'sc-domain:site.example.com', connected_by: ACTOR });
  assertEquals(await loadOAuthLink(adminOf({ link: { property_id: '', connected_by: ACTOR } }).admin, ORG, PRJ, 'ga4'), { property_id: null, connected_by: ACTOR });
  assertEquals(await loadOAuthLink(adminOf({ link: { property_id: 'x' } }).admin, ORG, PRJ, 'ga4'), null);
  assertEquals([ga4DigitsOf('properties/413247338'), ga4DigitsOf('413247338'), ga4DigitsOf('properties/abc'), ga4DigitsOf(null), ga4DigitsOf('properties/123')], ['413247338', '413247338', null, null, null]);
});
