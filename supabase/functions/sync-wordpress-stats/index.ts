
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "sync-wordpress-stats";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cfrdm-api-key, x-wp-nonce, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.requestStart(req.method);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Validate API Key from WordPress plugin
    const apiKey = req.headers.get("x-cfrdm-api-key");
    if (!apiKey) {
      log.authFailure("missing_api_key");
      return new Response(
        JSON.stringify({ success: false, error: "API Key required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const siteUrl = body.site_url;
    
    if (!siteUrl) {
      log.warn("missing_site_url");
      log.requestEnd(400, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "site_url required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract domain from site_url
    const domain = new URL(siteUrl).hostname;
    log.info("sync_start", { domain });

    // Find project using REST API
    const projectRes = await fetch(`${supabaseUrl}/rest/v1/projects?domain=eq.${encodeURIComponent(domain)}&select=id,user_id,name`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
    });

    const projects = await projectRes.json();
    
    if (!projects || projects.length === 0) {
      log.warn("project_not_found", { domain });
      log.requestEnd(404, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "Project not found for this domain" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const project = projects[0];
    log.setUserId(project.user_id);
    log.info("project_found", { project_id: project.id, project_name: project.name });

    // Extract stats from body
    const { stats, seo_health, internal_links_data, autocorrect_results, logs, timestamp, plugin_version, seo_plugin, readability_summary } = body;

    // Prepare stats data
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
      articles_needing_attention: seo_health?.issues?.filter((i: { severity: string }) => i.severity === 'error').length || 0,
      seo_issues: seo_health?.issues?.length || 0,
      broken_links: internal_links_data?.orphan_pages?.length || 0,
      articles_without_links: internal_links_data?.orphan_pages?.length || 0,
      auto_corrections_applied: autocorrect_results?.issues_fixed || 0,
      missing_featured_images: stats?.missing_featured_images || 0,
      pending_comments: stats?.pending_comments || 0,
      approved_comments: stats?.approved_comments || stats?.comments || 0,
      publishing_trend: stats?.publishing_trend || [],
      raw_data: { 
        stats, seo_health, internal_links_data, autocorrect_results, 
        logs_count: logs?.length || 0, synced_at: timestamp,
        plugin_version: plugin_version || 'unknown',
        seo_plugin: seo_plugin || 'none',
        readability_summary: readability_summary || null,
      },
      last_sync_at: new Date().toISOString(),
    };

    // Check existing stats
    const existingRes = await fetch(`${supabaseUrl}/rest/v1/wordpress_stats?project_id=eq.${project.id}&select=id`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
    });
    
    const existing = await existingRes.json();

    if (existing && existing.length > 0) {
      // Update existing
      await fetch(`${supabaseUrl}/rest/v1/wordpress_stats?id=eq.${existing[0].id}`, {
        method: "PATCH",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(statsData),
      });
    } else {
      // Insert new
      await fetch(`${supabaseUrl}/rest/v1/wordpress_stats`, {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(statsData),
      });
    }

    // Update project timestamp
    await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${project.id}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    });

    log.info("sync_complete", { project_id: project.id, total_posts: stats?.total_posts });
    log.requestEnd(200, Date.now() - startTime);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Stats synced successfully",
        project_id: project.id,
        project_name: project.name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("sync_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Internal error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
