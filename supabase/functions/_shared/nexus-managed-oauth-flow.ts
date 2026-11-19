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
  if (provider === "bing") console.info("bing_oauth_config", body.action, Boolean(app.clientId), Boolean(app.clientSecret));
  if (!app.clientId || !app.clientSecret) return { error: "oauth_agency_app_not_configured" };
  const args = { p_project: project, p_org: org, p_actor: actor, p_provider: provider };
  const rpc = async (refresh?: string) => {
    const { data, error } = await admin.rpc("nexus_oauth_token", { ...args, p_refresh: refresh ?? null });
    if (error) { console.warn("nexus_oauth_rpc", body.action, provider, error.code); throw new Error("oauth_project_forbidden"); }
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
    if (error || !data) { console.warn("nexus_oauth_state", provider, error?.code || "no_match"); return { error: "oauth_state_invalid" }; }
    const tokens = await exchangeOAuth(fetcher, provider, app, { code: body.code, verifier: data.verifier });
    if (!tokens.refreshToken) { console.warn("nexus_oauth_refresh_missing", provider); return { error: "oauth_refresh_token_missing" }; }
    await rpc(tokens.refreshToken);
    return { connected: true };
  }
  const refreshToken = await rpc();
  if (!refreshToken) return { error: "oauth_connection_required" };
  if (body.action === "oauth_bing_audit") {
    if (provider !== "bing" || !Array.isArray(body.urls) || body.urls.length > 8 ||
      (body.metrics !== true && !body.urls.length)) return { error: "invalid_bing_batch" };
    const site = "https://rdmadvogados.com.br/";
    const urls = [...new Set(body.urls)];
    if (urls.some(raw => {
      if (typeof raw !== "string" || raw.length > 2048) return true;
      try { const url = new URL(raw); return url.origin !== new URL(site).origin || !!(url.username || url.password || url.hash); }
      catch { return true; }
    })) return { error: "invalid_bing_url" };
    const { data, error } = await admin.from("nexus_oauth_connections").select("property_id")
      .eq("project_id", project).eq("organization_id", org).eq("provider", provider).single();
    if (error || data?.property_id !== site) return { error: "oauth_property_forbidden" };
    const previous = await admin.from("nexus_bing_oauth_audit").select("resource,result").eq("project_id",project).in("resource",urls);
    if(previous.error) return {error:"bing_audit_history_failed"};
    const cached = (previous.data ?? []).filter((row: any) => row.result?.ok === true);
    const jobs = urls.filter(resource => !cached.some((row: any) => row.resource === resource)).map(resource => ({ resource: String(resource), method: "GetUrlInfo" }));
    if (body.metrics === true) jobs.unshift({resource: "traffic", method: "GetRankAndTrafficStats"});
    if (!jobs.length) return {results: cached.map((row: any) => ({resource:row.resource,ok:true})),saved:cached.length};
    const { accessToken } = await exchangeOAuth(fetcher, provider, app, { refreshToken });
    const checked_at = new Date().toISOString();
    const rows = await Promise.all(jobs.map(async ({resource, method}) => {
      let result: Record<string, unknown>;
      try {
        const url = new URL("https://www.bing.com/webmaster/api.svc/json/" + method);
        url.searchParams.set("siteUrl", site);
        if (method === "GetUrlInfo") url.searchParams.set("url", resource);
        const response = await fetcher(url, {headers: {Authorization: "Bearer " + accessToken, Accept: "application/json"},
          redirect: "error", signal: AbortSignal.timeout(12000)});
        const payload = await response.json().catch(() => null);
        const ok = response.ok && (method === "GetUrlInfo" ? !!payload?.d && typeof payload.d === "object" : Array.isArray(payload?.d));
        const diagnostic = String(payload?.Message ?? payload?.message ?? payload?.ErrorCode ?? "");
        result = { ok, status: response.status, method, ...(!ok && /quota|limit|throttl/i.test(diagnostic) ? {reason:"provider_limit"} : {}), ...(ok ? { data: payload.d } : {}) };
      } catch { result = { ok: false, method, reason: "request_failed" }; }
      return {project_id: project, resource, checked_at, result};
    }));
    const saved = await admin.from("nexus_bing_oauth_audit").upsert(rows, {onConflict: "project_id,resource"});
    if (saved.error) return {error: "bing_audit_store_failed"};
    return { results: [...cached, ...rows].map(({resource, result}) => ({resource, ok: result.ok, status: result.status})), saved: rows.length + cached.length };
  }
  if (body.action === "oauth_ga4_test") {
    if (provider !== "ga4") return { error: "oauth_provider_invalid" };
    const { data, error } = await admin.from("nexus_oauth_connections").select("property_id")
      .eq("project_id", project).eq("organization_id", org).eq("provider", provider).single();
    if (error || !/^properties\/\d+$/.test(data?.property_id ?? "")) return { stage: "property", ok: false };
    let accessToken: string;
    try { ({ accessToken } = await exchangeOAuth(fetcher, provider, app, { refreshToken })); }
    catch { return { stage: "token", ok: false }; }
    try {
      const response = await fetcher("https://analyticsdata.googleapis.com/v1beta/" + data.property_id + ":runReport", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }], metrics: [{ name: "sessions" }], limit: "1" }),
      });
      const report = await response.json().catch(() => null);
      return { stage: "report", ok: response.ok && Array.isArray(report?.metricHeaders), status: response.status,
        sessions: response.ok ? report?.rows?.[0]?.metricValues?.[0]?.value ?? null : null,
        reason: report?.error?.details?.some?.((detail: { reason?: string }) => detail.reason === "SERVICE_DISABLED") ? "SERVICE_DISABLED" : undefined };
    } catch (error) {
      return { stage: "network", ok: false, timeout: error instanceof Error && error.name === "TimeoutError" };
    }
  }
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
  if (provider === "gsc" && data.property_id && properties.some(item => item.id === data.property_id)) {
    const end = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
    const response = await fetcher("https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(data.property_id) + "/searchAnalytics/query", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: "Bearer " + tokens.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, rowLimit: 1 }),
    });
    if (response.ok) {
      const metrics = await response.json();
      console.info("nexus_oauth_gsc_metrics", response.status, metrics.rows?.length ?? 0);
    } else console.warn("nexus_oauth_gsc_metrics", response.status);
  }
  return { properties, propertyId: data.property_id };
}
