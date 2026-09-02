import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "sync-wordpress-stats";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zica-posts-key, x-zica-ai-api-key, x-cfrdm-api-key, x-wp-nonce, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sameSecret(a: string, b: string) {
  if (!a || !b) return false;
  return (await digest(a)) === (await digest(b));
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    log.requestStart(req.method);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend not configured" }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const incomingKey =
      req.headers.get("x-zica-posts-key") ||
      req.headers.get("x-zica-ai-api-key") ||
      req.headers.get("x-cfrdm-api-key") ||
      "";
    if (!incomingKey) {
      log.authFailure("missing_api_key");
      return json({ success: false, error: "API Key required" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const siteUrl = String(body?.site_url || "").trim();
    if (!siteUrl) {
      log.warn("missing_site_url");
      log.requestEnd(400, Date.now() - startTime);
      return json({ success: false, error: "site_url required" }, 400);
    }

    let domain = "";
    try { domain = new URL(siteUrl).hostname.toLowerCase(); }
    catch { return json({ success: false, error: "invalid site_url" }, 400); }
    log.info("sync_start", { domain });

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id,user_id,name,domain,wordpress_connector_mode,wordpress_credential_ref,wordpress_app_password")
      .eq("domain", domain)
      .maybeSingle();

    if (projectError || !project) {
      log.warn("project_not_found", { domain });
      log.requestEnd(404, Date.now() - startTime);
      return json({ success: false, error: "Project not found for this domain" }, 404);
    }

    let expectedKey = "";
    let credentialSource = "none";
    const ref = String(project.wordpress_credential_ref || "").trim();
    if (ref) {
      const { data: secret, error: secretError } = await admin.rpc("get_zica_wordpress_credential", { p_ref: ref });
      if (secretError) {
        log.authFailure("credential_vault_unavailable");
        return json({ success: false, error: "Credential unavailable" }, 503);
      }
      expectedKey = String(secret || "");
      credentialSource = "vault";
    } else {
      expectedKey = String(project.wordpress_app_password || "");
      credentialSource = expectedKey ? "legacy-project-field" : "none";
    }

    if (!expectedKey || !(await sameSecret(incomingKey, expectedKey))) {
      log.authFailure("invalid_api_key");
      return json({ success: false, error: "Invalid API Key" }, 401);
    }

    log.setUserId(project.user_id);
    log.info("project_authenticated", { project_id: project.id, project_name: project.name, credential_source: credentialSource });

    const { stats, seo_health, internal_links_data, autocorrect_results, logs, timestamp, plugin_version, seo_plugin, readability_summary } = body;
    const now = new Date().toISOString();
    const statsData = {
      project_id: project.id,
      user_id: project.user_id,
      total_articles: stats?.total_posts || 0,
      published_articles: stats?.published || 0,
      draft_articles: stats?.draft || 0,
      pending_articles: stats?.pending || 0,
      synced_articles: stats?.synced || 0,
      sync_errors: stats?.errors || 0,
      total_internal_links: stats?.internal_links || 0,
      total_comments: stats?.comments || 0,
      articles_needing_attention: seo_health?.issues?.filter((i: { severity: string }) => i.severity === "error").length || 0,
      seo_issues: seo_health?.issues?.length || 0,
      broken_links: internal_links_data?.orphan_pages?.length || 0,
      articles_without_links: internal_links_data?.orphan_pages?.length || 0,
      auto_corrections_applied: autocorrect_results?.issues_fixed || 0,
      missing_featured_images: stats?.missing_featured_images || 0,
      pending_comments: stats?.pending_comments || 0,
      approved_comments: stats?.approved_comments || stats?.comments || 0,
      publishing_trend: stats?.publishing_trend || [],
      raw_data: {
        stats,
        seo_health,
        internal_links_data,
        autocorrect_results,
        logs_count: Array.isArray(logs) ? logs.length : 0,
        synced_at: timestamp,
        plugin_version: plugin_version || "unknown",
        seo_plugin: seo_plugin || "none",
        readability_summary: readability_summary || null,
        credential_source: credentialSource,
      },
      last_sync_at: now,
    };

    const { data: existing, error: existingError } = await admin
      .from("wordpress_stats")
      .select("id")
      .eq("project_id", project.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) {
      const { error } = await admin.from("wordpress_stats").update(statsData).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from("wordpress_stats").insert(statsData);
      if (error) throw error;
    }

    const projectPatch: Record<string, unknown> = {
      is_connected: true,
      wordpress_last_verified_at: now,
      updated_at: now,
    };
    if (plugin_version) projectPatch.wordpress_plugin_version = String(plugin_version).slice(0, 32);
    if (seo_plugin) projectPatch.seo_plugin = String(seo_plugin).slice(0, 80);
    const { error: projectUpdateError } = await admin.from("projects").update(projectPatch).eq("id", project.id);
    if (projectUpdateError) throw projectUpdateError;

    log.info("sync_complete", { project_id: project.id, total_posts: stats?.total_posts || 0 });
    log.requestEnd(200, Date.now() - startTime);
    return json({ success: true, message: "Stats synced successfully", project_id: project.id, project_name: project.name });
  } catch (error) {
    log.error("sync_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return json({ success: false, error: "Internal error" }, 500);
  }
});