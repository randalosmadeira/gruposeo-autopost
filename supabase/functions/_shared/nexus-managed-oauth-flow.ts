import { authorizationUrl, exchangeOAuth, listOAuthResources, managedOAuth, type ManagedProvider } from "./nexus-managed-oauth.ts";

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));

export async function handleManagedOAuth(admin: any, fetcher: typeof fetch, body: Record<string, unknown>, project: string, org: string, actor: string) {
  const provider = body.provider as ManagedProvider;
  if (!Object.prototype.hasOwnProperty.call(managedOAuth, provider)) return { error: "oauth_provider_invalid" };
  const prefix = provider === "bing" ? "NEXUS_BING" : "NEXUS_GOOGLE";
  const app = {
    clientId: Deno.env.get(prefix + "_OAUTH_CLIENT_ID") || "",
    clientSecret: Deno.env.get(prefix + "_OAUTH_CLIENT_SECRET") || "",
    redirectUri: "https://app.zica.posts.zicajuris.com.br/nexus/motores",
  };
  if (!app.clientId || !app.clientSecret) return { error: "oauth_agency_app_not_configured" };
  const args = { p_project: project, p_org: org, p_actor: actor, p_provider: provider };
  const rpc = async (refresh?: string) => {
    const { data, error } = await admin.rpc("nexus_oauth_token", { ...args, p_refresh: refresh ?? null });
    if (error) throw new Error("oauth_project_forbidden");
    return data as string | null;
  };
  if (body.action === "oauth_start") {
    await rpc();
    const state = random();
    const verifier = random();
    const { error } = await admin.from("nexus_oauth_attempts").insert({
      state_hash: await digest(state), project_id: project, actor_id: actor, provider, verifier,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    if (error) return { error: "oauth_state_store_failed" };
    return { url: authorizationUrl(provider, app, state, await digest(verifier)), state };
  }
  if (body.action === "oauth_finish") {
    await rpc();
    if (typeof body.state !== "string" || !/^[\w-]{43}$/.test(body.state) ||
      typeof body.code !== "string" || !body.code || body.code.length > 4096) return { error: "oauth_callback_invalid" };
    const { data, error } = await admin.from("nexus_oauth_attempts").delete()
      .eq("state_hash", await digest(body.state)).eq("project_id", project).eq("actor_id", actor)
      .eq("provider", provider).gt("expires_at", new Date().toISOString()).select("verifier").maybeSingle();
    if (error || !data) return { error: "oauth_state_invalid" };
    const tokens = await exchangeOAuth(fetcher, provider, app, { code: body.code, verifier: data.verifier });
    if (!tokens.refreshToken) return { error: "oauth_refresh_token_missing" };
    await rpc(tokens.refreshToken);
    return { connected: true };
  }
  const refreshToken = await rpc();
  if (!refreshToken) return { error: "oauth_connection_required" };
  const tokens = await exchangeOAuth(fetcher, provider, app, { refreshToken });
  const properties = await listOAuthResources(fetcher, provider, tokens.accessToken);
  const connection = admin.from("nexus_oauth_connections");
  if (body.action === "oauth_bind") {
    if (!properties.some(item => item.id === body.propertyId)) return { error: "oauth_property_forbidden" };
    const { data, error } = await connection.update({ property_id: body.propertyId }).eq("project_id", project)
      .eq("organization_id", org).eq("provider", provider).select("property_id").single();
    if (error) return { error: "oauth_property_bind_failed" };
    return { propertyId: data.property_id };
  }
  const { data, error } = await connection.select("property_id").eq("project_id", project)
    .eq("organization_id", org).eq("provider", provider).single();
  if (error) return { error: "oauth_connection_required" };
  return { properties, propertyId: data.property_id };
}
