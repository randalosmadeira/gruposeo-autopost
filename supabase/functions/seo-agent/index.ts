import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id || null;
    const targetProjectId = body.project_id || null;
    const runType = body.run_type || "scheduled";

    console.log(`[SEO Agent] Starting run: type=${runType}, user=${targetUserId || "all"}, project=${targetProjectId || "all"}`);

    // Get all projects with WordPress connections
    let query = supabase
      .from("projects")
      .select("id, user_id, name, domain, wordpress_url, wordpress_username, wordpress_app_password, seo_plugin")
      .eq("is_connected", true)
      .not("wordpress_url", "is", null);

    if (targetUserId) query = query.eq("user_id", targetUserId);
    if (targetProjectId) query = query.eq("id", targetProjectId);

    const { data: projects, error: projErr } = await query;
    if (projErr) throw projErr;

    if (!projects || projects.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No connected projects found", runs: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SEO Agent] Found ${projects.length} connected projects`);

    const results = [];

    for (const project of projects) {
      // Create run record
      const { data: run, error: runErr } = await supabase
        .from("seo_agent_runs")
        .insert({
          user_id: project.user_id,
          project_id: project.id,
          run_type: runType,
          status: "running",
        })
        .select("id")
        .single();

      if (runErr) {
        console.error(`[SEO Agent] Failed to create run for project ${project.name}:`, runErr);
        continue;
      }

      const runId = run.id;
      let metaIssuesFound = 0;
      let metaIssuesFixed = 0;
      let linksSuggested = 0;
      let linksApplied = 0;
      let indexingSubmitted = 0;
      let sitemapUpdated = false;
      const details: Record<string, unknown> = {};

      try {
        // ═══════════════════════════════════════════
        // STEP 1: SEO Meta Audit via WordPress Plugin
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 1: SEO Meta Audit`);

        const baseUrl = project.wordpress_url?.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "") || "";
        const isPlugin = project.wordpress_username === "__CFRDM_PLUGIN__";

        if (baseUrl && isPlugin && project.wordpress_app_password) {
          try {
            // Trigger meta audit via plugin endpoint
            const auditResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/meta-audit`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CFRDM-API-Key": project.wordpress_app_password,
              },
              body: JSON.stringify({ auto_fix: true }),
            });

            if (auditResp.ok) {
              const auditData = await auditResp.json();
              metaIssuesFound = auditData.issues_found || 0;
              metaIssuesFixed = auditData.issues_fixed || 0;
              details.meta_audit = auditData;
              console.log(`[SEO Agent] [${project.name}] Meta audit: ${metaIssuesFound} found, ${metaIssuesFixed} fixed`);
            } else {
              console.log(`[SEO Agent] [${project.name}] Meta audit endpoint not available (${auditResp.status})`);
              
              // Fallback: AI-based audit on indexed articles
              const aiAuditResult = await runAIMetaAudit(supabase, project, lovableKey);
              metaIssuesFound = aiAuditResult.found;
              metaIssuesFixed = aiAuditResult.fixed;
              details.meta_audit = aiAuditResult;
            }
          } catch (e) {
            console.error(`[SEO Agent] [${project.name}] Meta audit error:`, e);
            // Fallback to AI audit
            const aiAuditResult = await runAIMetaAudit(supabase, project, lovableKey);
            metaIssuesFound = aiAuditResult.found;
            metaIssuesFixed = aiAuditResult.fixed;
            details.meta_audit = aiAuditResult;
          }
        }

        // ═══════════════════════════════════════════
        // STEP 2: Internal Linking Analysis
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 2: Internal Linking`);

        const linkResult = await analyzeInternalLinks(supabase, project, lovableKey);
        linksSuggested = linkResult.suggested;
        linksApplied = linkResult.applied;
        details.internal_links = linkResult;

        // ═══════════════════════════════════════════
        // STEP 3: Indexing & Sitemap
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 3: Indexing & Sitemap`);

        if (baseUrl && isPlugin && project.wordpress_app_password) {
          try {
            // Trigger sitemap refresh
            const sitemapResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-sitemap`, {
              method: "POST",
              headers: { "X-CFRDM-API-Key": project.wordpress_app_password },
            });
            sitemapUpdated = sitemapResp.ok;

            // Get recently modified articles for IndexNow
            const { data: recentArticles } = await supabase
              .from("wordpress_article_index")
              .select("wp_post_url")
              .eq("project_id", project.id)
              .gte("updated_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
              .limit(100);

            if (recentArticles && recentArticles.length > 0) {
              const urls = recentArticles.map(a => a.wp_post_url).filter(Boolean);
              if (urls.length > 0) {
                const indexNowResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-CFRDM-API-Key": project.wordpress_app_password,
                  },
                  body: JSON.stringify({ urls }),
                });
                indexingSubmitted = indexNowResp.ok ? urls.length : 0;
              }
            }

            // Refresh llms.txt
            await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-llms`, {
              method: "POST",
              headers: { "X-CFRDM-API-Key": project.wordpress_app_password },
            }).catch(() => {});

            details.indexing = {
              sitemap_refreshed: sitemapUpdated,
              urls_submitted: indexingSubmitted,
              llms_refreshed: true,
            };
          } catch (e) {
            console.error(`[SEO Agent] [${project.name}] Indexing error:`, e);
          }
        }

        // ═══════════════════════════════════════════
        // STEP 4: Generate Summary
        // ═══════════════════════════════════════════
        const summaryParts = [];
        if (metaIssuesFixed > 0) summaryParts.push(`${metaIssuesFixed} metas corrigidos`);
        if (linksSuggested > 0) summaryParts.push(`${linksSuggested} links sugeridos`);
        if (indexingSubmitted > 0) summaryParts.push(`${indexingSubmitted} URLs indexadas`);
        if (sitemapUpdated) summaryParts.push("sitemap atualizado");
        
        const summary = summaryParts.length > 0 
          ? `✅ ${project.name}: ${summaryParts.join(", ")}`
          : `✅ ${project.name}: sem problemas detectados`;

        // Update run record
        await supabase
          .from("seo_agent_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            meta_issues_found: metaIssuesFound,
            meta_issues_fixed: metaIssuesFixed,
            links_suggested: linksSuggested,
            links_applied: linksApplied,
            indexing_submitted: indexingSubmitted,
            sitemap_updated: sitemapUpdated,
            summary,
            details,
          })
          .eq("id", runId);

        // Create notification
        await supabase
          .from("cron_notifications")
          .insert({
            user_id: project.user_id,
            title: "🤖 Agente SEO Autônomo",
            message: summary,
            type: "seo_agent",
            metadata: { run_id: runId, project_id: project.id, project_name: project.name },
          });

        results.push({ project: project.name, status: "completed", summary });
        console.log(`[SEO Agent] [${project.name}] Completed: ${summary}`);

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("seo_agent_runs")
          .update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_message: errMsg,
          })
          .eq("id", runId);

        results.push({ project: project.name, status: "error", error: errMsg });
        console.error(`[SEO Agent] [${project.name}] Error:`, errMsg);
      }
    }

    return new Response(
      JSON.stringify({ success: true, runs: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SEO Agent] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ═══════════════════════════════════════════
// AI Meta Audit (fallback when plugin endpoint unavailable)
// ═══════════════════════════════════════════
async function runAIMetaAudit(
  supabase: ReturnType<typeof createClient>,
  project: { id: string; name: string },
  apiKey: string,
): Promise<{ found: number; fixed: number; issues: string[] }> {
  // Get indexed articles with low SEO scores
  const { data: articles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_title, wp_post_url, primary_keyword, seo_score, semantic_summary")
    .eq("project_id", project.id)
    .lt("seo_score", 60)
    .order("seo_score", { ascending: true })
    .limit(20);

  if (!articles || articles.length === 0) {
    return { found: 0, fixed: 0, issues: [] };
  }

  const issues: string[] = [];
  let found = 0;

  for (const article of articles) {
    // Check title length
    if (article.wp_post_title && article.wp_post_title.length > 70) {
      issues.push(`Título muito longo: "${article.wp_post_title.substring(0, 50)}..." (${article.wp_post_title.length} chars)`);
      found++;
    }
    if (article.wp_post_title && article.wp_post_title.length < 30) {
      issues.push(`Título muito curto: "${article.wp_post_title}" (${article.wp_post_title.length} chars)`);
      found++;
    }
    if (!article.primary_keyword) {
      issues.push(`Sem keyword principal: "${article.wp_post_title}"`);
      found++;
    }
  }

  return { found, fixed: 0, issues: issues.slice(0, 10) };
}

// ═══════════════════════════════════════════
// Internal Linking Analysis
// ═══════════════════════════════════════════
async function analyzeInternalLinks(
  supabase: ReturnType<typeof createClient>,
  project: { id: string; user_id: string; name: string },
  apiKey: string,
): Promise<{ suggested: number; applied: number; orphans: number }> {
  // Find orphan articles (no internal links)
  const { data: orphans } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_title, wp_post_url, primary_keyword, topic_cluster, internal_links_count")
    .eq("project_id", project.id)
    .lte("internal_links_count", 0)
    .limit(30);

  if (!orphans || orphans.length === 0) {
    return { suggested: 0, applied: 0, orphans: 0 };
  }

  // Get all articles for matching
  const { data: allArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_title, wp_post_url, primary_keyword, topic_cluster, semantic_summary")
    .eq("project_id", project.id)
    .limit(200);

  if (!allArticles || allArticles.length < 2) {
    return { suggested: 0, applied: 0, orphans: orphans.length };
  }

  let totalSuggested = 0;

  // Use AI to find link opportunities for orphan articles
  const orphanBatch = orphans.slice(0, 10); // Process 10 at a time
  
  try {
    const articleList = allArticles
      .map(a => `- [${a.wp_post_title}](${a.wp_post_url}) | keyword: ${a.primary_keyword || "N/A"} | cluster: ${a.topic_cluster || "N/A"}`)
      .join("\n");

    for (const orphan of orphanBatch) {
      const prompt = `Dado o artigo "${orphan.wp_post_title}" (keyword: ${orphan.primary_keyword || "N/A"}, cluster: ${orphan.topic_cluster || "N/A"}), 
sugira os 3 melhores artigos para linkar PARA este artigo e os 3 melhores artigos para este artigo linkar.

ARTIGOS DISPONÍVEIS:
${articleList}

Retorne APENAS JSON:
{
  "links_to_this": [{"title": "...", "url": "...", "anchor_text": "...", "relevance": 85}],
  "links_from_this": [{"title": "...", "url": "...", "anchor_text": "...", "relevance": 80}]
}`;

      const resp = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "Você é um especialista em SEO e linkagem interna. Responda APENAS com JSON." },
            { role: "user", content: prompt },
          ],
          max_tokens: 500,
          temperature: 0.2,
        }),
      });

      if (!resp.ok) {
        if (resp.status === 402 || resp.status === 429) break; // Stop on credit/rate issues
        continue;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      try {
        const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const suggestions = JSON.parse(jsonStr);
        
        const allSuggestions = [
          ...(suggestions.links_to_this || []).map((s: any) => ({
            source_url: s.url,
            target_url: orphan.wp_post_url,
            anchor_text: s.anchor_text,
            relevance_score: s.relevance,
          })),
          ...(suggestions.links_from_this || []).map((s: any) => ({
            source_url: orphan.wp_post_url,
            target_url: s.url,
            anchor_text: s.anchor_text,
            relevance_score: s.relevance,
          })),
        ];

        for (const suggestion of allSuggestions) {
          await supabase
            .from("internal_link_suggestions")
            .insert({
              user_id: project.user_id,
              project_id: project.id,
              anchor_text: suggestion.anchor_text || orphan.wp_post_title,
              target_url: suggestion.target_url,
              relevance_score: suggestion.relevance_score || 70,
              status: "pending",
              anchor_context: `Sugerido pelo Agente SEO para artigo: ${orphan.wp_post_title}`,
            });
          totalSuggested++;
        }
      } catch {
        // Skip parse errors
      }
    }
  } catch (e) {
    console.error(`[SEO Agent] [${project.name}] Link analysis error:`, e);
  }

  return { suggested: totalSuggested, applied: 0, orphans: orphans.length };
}
