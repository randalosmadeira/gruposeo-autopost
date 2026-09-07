import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeSiteUrl(input: string) {
  const url = new URL(input.trim());
  if (url.protocol !== "https:") throw new Error("site_url_must_use_https");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked = host === "localhost" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal") || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^0\./.test(host);
  if (blocked) throw new Error("private_site_url_not_allowed");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/wp-json(?:\/.*)?$/i, "").replace(/\/$/, "");
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

async function verifyPlugin(siteUrl: string, apiKey: string) {
  const endpoints = [
    `${siteUrl}/wp-json/zica-posts/v1/test`,
    `${siteUrl}/?rest_route=/zica-posts/v1/test`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { headers: { "X-ZICA-POSTS-Key": apiKey, Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) return data;
    } catch { /* fallback */ }
  }
  throw new Error("plugin_verification_failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ success: false, error: "backend_not_configured" }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action || "connect");
    const apiKey = String(body.api_key || "").trim();
    if (apiKey.length < 24 || apiKey.length > 256) return json({ success: false, error: "invalid_pairing_key" }, 400);
    const keyHash = await sha256(apiKey);

    if (action === "register") {
      const siteUrl = normalizeSiteUrl(String(body.site_url || ""));
      const verified = await verifyPlugin(siteUrl, apiKey);
      const { error } = await admin.from("wordpress_pairing_registry").upsert({
        key_hash: keyHash,
        site_url: siteUrl,
        site_name: String(verified?.site?.name || body.site_name || new URL(siteUrl).hostname).slice(0, 160),
        plugin_version: String(verified?.version || body.plugin_version || "").slice(0, 32) || null,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ success: true, registered: true });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser(authHeader.slice(7));
    if (userError || !user) return json({ success: false, error: "unauthorized" }, 401);

    const { data: registry } = await admin.from("wordpress_pairing_registry").select("site_url,site_name,plugin_version").eq("key_hash", keyHash).maybeSingle();
    if (!registry) return json({ success: false, error: "pairing_key_not_registered", hint: "Atualize o plugin e copie novamente a chave exibida no WordPress." }, 404);
    const verified = await verifyPlugin(registry.site_url, apiKey);
    const projectName = String(body.site_name || registry.site_name || new URL(registry.site_url).hostname).trim().slice(0, 160);
    const domain = new URL(registry.site_url).hostname;
    const { data: membership } = await admin.from("organization_members").select("organization_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    const credentialRef = `wordpress_${user.id}_${keyHash.slice(0, 16)}`;
    await admin.rpc("upsert_zica_secret", { p_name: credentialRef, p_secret: apiKey, p_description: "Zica Posts WordPress pairing key" });

    const now = new Date().toISOString();
    const projectValues = {
      user_id: user.id,
      organization_id: membership?.organization_id || null,
      name: projectName,
      domain,
      wordpress_url: registry.site_url,
      wordpress_username: "__ZICA_POSTS_PLUGIN__",
      wordpress_app_password: null,
      wordpress_connector_mode: "zica_posts",
      wordpress_credential_ref: credentialRef,
      wordpress_plugin_namespace: "zica-posts/v1",
      wordpress_plugin_version: String(verified?.version || registry.plugin_version || ""),
      wordpress_connected_at: now,
      wordpress_last_verified_at: now,
      is_connected: true,
      updated_at: now,
    };
    const { data: existing } = await admin.from("projects").select("id").eq("user_id", user.id).eq("domain", domain).limit(1).maybeSingle();
    const query = existing
      ? admin.from("projects").update(projectValues).eq("id", existing.id)
      : admin.from("projects").insert(projectValues);
    const { data: project, error: projectError } = await query.select("id,name,domain,wordpress_url,wordpress_plugin_version").single();
    if (projectError) throw projectError;
    return json({ success: true, project, correctedUrl: registry.site_url, site: verified?.site || { name: projectName }, pluginVersion: verified?.version || registry.plugin_version });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pairing_failed";
    return json({ success: false, error: message }, 400);
  }
});
