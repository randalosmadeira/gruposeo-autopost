import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { installSpendLock } from "../_shared/nexus-spend-lock.ts";
import { handleSignalsRequest, type SignalsDeps } from "../_shared/zica-signals.ts";

// Public endpoint (verify_jwt=false): authentication is the HMAC signature (server mode) or the Origin allow-list (browser mode).
// No outbound calls besides this project's own Supabase API.
installSpendLock();

const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps: SignalsDeps = {
  now: () => Date.now(),
  async lookupSite(siteId) {
    const { data: key, error } = await admin.from("nexus_site_keys").select("project_id,allowed_origins").eq("site_id", siteId).maybeSingle();
    if (error || !key) return null;
    const { data: project } = await admin.from("projects").select("wordpress_url,domain").eq("id", key.project_id).maybeSingle();
    let projectHost = "";
    try { projectHost = new URL(project?.wordpress_url || `https://${project?.domain}`).hostname; } catch { /* no host: only the allow-list can match */ }
    return { allowed_origins: key.allowed_origins || [], project_host: projectHost };
  },
  async getSecret(siteId) {
    const { data, error } = await admin.rpc("nexus_site_secret", { p_site_id: siteId });
    return error || !data ? null : String(data);
  },
  async record(siteId, batchId, events) {
    const { data, error } = await admin.rpc("nexus_record_signals", { p_site_id: siteId, p_batch_id: batchId, p_events: events });
    if (error) throw new Error("record_failed");
    return { duplicate: data?.duplicate === true, accepted: Number(data?.accepted) || 0 };
  },
};

Deno.serve(async (req) => {
  try {
    return await handleSignalsRequest(req, deps);
  } catch {
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
