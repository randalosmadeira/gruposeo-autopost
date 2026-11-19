/**
 * Credencial de sincronização vinda da conexão OAuth gerenciada do projeto (`nexus_oauth_connections`, Vault), 14/11/2026.
 *
 * Causa C1 das métricas vazias: a auditoria e a sincronização só enxergavam credenciais da organização
 * (`organization_provider_credentials`), mas o Search Console e o GA4 foram conectados por OAuth. Aqui o refresh token do projeto
 * (lido pela RPC `nexus_oauth_token`, que revalida ator e projeto) vira um access token de curta duração, entregue ao cliente do
 * Google como segredo `oauth-access:<token>` (ver `asOAuthAccessSecret`). Nada é gravado nem devolvido; só leitura gratuita.
 *
 * Limite conhecido: a RPC exige que `connected_by` ainda seja owner/admin ativo da organização; se deixar de ser, a sincronização
 * falha com `oauth_project_forbidden` (visível no detalhe da execução) até alguém reconectar.
 */
import { exchangeOAuth, type ManagedProvider } from './nexus-managed-oauth.ts';
import { asOAuthAccessSecret } from './nexus-gsc.ts';

export type OAuthSyncProvider = 'gsc' | 'ga4';
export type OAuthLinkRecord = { property_id: string | null; connected_by: string };
export type OAuthApp = { clientId: string; clientSecret: string };

/** Subconjunto do cliente Supabase (service role) usado aqui. */
export type OAuthAdmin = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
};

export async function loadOAuthLink(admin: OAuthAdmin, organizationId: string, projectId: string, provider: OAuthSyncProvider): Promise<OAuthLinkRecord | null> {
  const { data, error } = await admin.from('nexus_oauth_connections').select('property_id,connected_by')
    .eq('organization_id', organizationId).eq('project_id', projectId).eq('provider', provider).maybeSingle();
  if (error || !data || typeof data.connected_by !== 'string') return null;
  return { property_id: typeof data.property_id === 'string' && data.property_id ? data.property_id : null, connected_by: data.connected_by };
}

/** Propriedade do GA4 só com dígitos (a conexão guarda `properties/123`); null se não for válida. */
export function ga4DigitsOf(propertyId: string | null | undefined): string | null {
  const v = typeof propertyId === 'string' ? propertyId.trim().replace(/^properties\//, '') : '';
  return /^\d{5,15}$/.test(v) ? v : null;
}

/**
 * Access token do projeto para o provedor, no formato de segredo do cliente Google; null quando o projeto não tem conexão.
 * Lança (códigos curtos, sem dados sensíveis) quando a conexão existe mas não pôde ser usada.
 */
export async function resolveOAuthSecret(
  admin: OAuthAdmin, fetchFn: typeof fetch, app: OAuthApp, organizationId: string, projectId: string, provider: OAuthSyncProvider,
): Promise<string | null> {
  const link = await loadOAuthLink(admin, organizationId, projectId, provider);
  if (!link) return null;
  if (!app.clientId || !app.clientSecret) throw new Error('oauth_agency_app_not_configured');
  const { data, error } = await admin.rpc('nexus_oauth_token', {
    p_project: projectId, p_org: organizationId, p_actor: link.connected_by, p_provider: provider, p_refresh: null,
  });
  if (error) throw new Error('oauth_project_forbidden');
  if (typeof data !== 'string' || !data) throw new Error('oauth_connection_required');
  const tokens = await exchangeOAuth(fetchFn, provider as ManagedProvider, { ...app, redirectUri: '' }, { refreshToken: data });
  return asOAuthAccessSecret(tokens.accessToken);
}
