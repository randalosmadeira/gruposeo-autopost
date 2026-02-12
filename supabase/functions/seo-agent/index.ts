import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getOrchestrator } from "../_shared/ai-orchestrator.ts";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  let orchestrator = getOrchestrator();

  try {
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id || null;
    const targetProjectId = body.project_id || null;
    const runType = body.run_type || "scheduled";

    console.log(`[SEO Agent] Starting run: type=${runType}, user=${targetUserId || "all"}, project=${targetProjectId || "all"}`);

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
      try {
        orchestrator = await getOrchestratorForUser(project.user_id);
      } catch (byokErr) {
        console.warn(`[SEO Agent] BYOK load failed for ${project.user_id}, using defaults`);
      }

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

      const baseUrl = project.wordpress_url?.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "") || "";
      const isPlugin = project.wordpress_username === "__CFRDM_PLUGIN__";
      const apiKey = project.wordpress_app_password || "";

      try {
        // ═══════════════════════════════════════════
        // STEP 1: SEO Meta Audit + AUTO-FIX via AI
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 1: SEO Meta Audit + Auto-Fix`);

        const metaResult = await runMetaAuditWithFix(supabase, orchestrator, project, baseUrl, isPlugin, apiKey);
        metaIssuesFound = metaResult.found;
        metaIssuesFixed = metaResult.fixed;
        details.meta_audit = metaResult;

        // ═══════════════════════════════════════════
        // STEP 2: Internal Linking - SUGGEST + APPLY
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 2: Internal Linking`);

        const linkResult = await analyzeAndApplyLinks(supabase, orchestrator, project, baseUrl, isPlugin, apiKey);
        linksSuggested = linkResult.suggested;
        linksApplied = linkResult.applied;
        details.internal_links = linkResult;

        // ═══════════════════════════════════════════
        // STEP 3: Indexing - Submit ALL published URLs
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 3: Indexing`);

        const indexResult = await submitIndexing(supabase, project, baseUrl, isPlugin, apiKey);
        indexingSubmitted = indexResult.submitted;
        sitemapUpdated = indexResult.sitemapRefreshed;
        details.indexing = indexResult;

        // ═══════════════════════════════════════════
        // STEP 4: AI Discovery Optimization
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 4: AI Discovery Optimization`);

        const aiDiscoveryResult = await optimizeAIDiscovery(supabase, project, baseUrl, isPlugin, apiKey);
        details.ai_discovery = aiDiscoveryResult;

        // ═══════════════════════════════════════════
        // STEP 5: Summary
        // ═══════════════════════════════════════════
        const summaryParts = [];
        if (metaIssuesFixed > 0) summaryParts.push(`${metaIssuesFixed} metas corrigidos`);
        if (metaIssuesFound > 0 && metaIssuesFixed === 0) summaryParts.push(`${metaIssuesFound} issues encontrados`);
        if (linksSuggested > 0) summaryParts.push(`${linksSuggested} links sugeridos`);
        if (linksApplied > 0) summaryParts.push(`${linksApplied} links aplicados`);
        if (indexingSubmitted > 0) summaryParts.push(`${indexingSubmitted} URLs indexadas`);
        if (sitemapUpdated) summaryParts.push("sitemap atualizado");
        if (aiDiscoveryResult.actions?.length > 0) summaryParts.push(`${aiDiscoveryResult.actions.length} otimizações IA discovery`);

        const summary = summaryParts.length > 0
          ? `✅ ${project.name}: ${summaryParts.join(", ")}`
          : `✅ ${project.name}: sem problemas detectados`;

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
            details,
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

// ═══════════════════════════════════════════════════════════
// STEP 1: Meta Audit with AI Auto-Fix
// ═══════════════════════════════════════════════════════════
async function runMetaAuditWithFix(
  supabase: ReturnType<typeof createClient>,
  orchestrator: ReturnType<typeof getOrchestrator>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ found: number; fixed: number; issues: string[]; fixes_applied: string[] }> {
  const issues: string[] = [];
  const fixesApplied: string[] = [];
  let found = 0;
  let fixed = 0;

  // 1) Try plugin meta-audit endpoint first
  if (baseUrl && isPlugin && apiKey) {
    try {
      const auditResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/meta-audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CFRDM-API-Key": apiKey,
        },
        body: JSON.stringify({ auto_fix: true }),
      });

      if (auditResp.ok) {
        const auditData = await auditResp.json();
        found = auditData.issues_found || 0;
        fixed = auditData.issues_fixed || 0;
        if (fixed > 0) {
          fixesApplied.push(`Plugin auto-fix: ${fixed} metas corrigidos`);
        }
        return { found, fixed, issues: auditData.issues || [], fixes_applied: fixesApplied };
      }
    } catch (e) {
      console.log(`[SEO Agent] [${project.name}] Plugin meta-audit unavailable, using AI fallback`);
    }
  }

  // 2) AI Fallback: Get articles with issues and fix them
  const { data: articles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, seo_score, semantic_summary")
    .eq("project_id", project.id)
    .order("seo_score", { ascending: true })
    .limit(50);

  if (!articles || articles.length === 0) {
    return { found: 0, fixed: 0, issues: [], fixes_applied: [] };
  }

  // Find articles with SEO issues
  const articlesWithIssues: any[] = [];
  for (const article of articles) {
    const articleIssues: string[] = [];
    if (article.wp_post_title && article.wp_post_title.length > 70) {
      articleIssues.push("title_too_long");
    }
    if (article.wp_post_title && article.wp_post_title.length < 20) {
      articleIssues.push("title_too_short");
    }
    if (!article.primary_keyword) {
      articleIssues.push("no_keyword");
    }
    if ((article.seo_score || 0) < 40) {
      articleIssues.push("low_seo_score");
    }
    if (articleIssues.length > 0) {
      articlesWithIssues.push({ ...article, issues: articleIssues });
      found++;
      issues.push(`${articleIssues.join(", ")}: "${article.wp_post_title}"`);
    }
  }

  if (articlesWithIssues.length === 0) {
    return { found: 0, fixed: 0, issues: [], fixes_applied: [] };
  }

  // 3) Use AI to generate meta fixes for articles with issues
  const batchToFix = articlesWithIssues.slice(0, 10); // Fix 10 per run
  
  try {
    const articlesList = batchToFix.map(a => 
      `- ID: ${a.wp_post_id} | Título: "${a.wp_post_title}" | Keyword: ${a.primary_keyword || "N/A"} | Score: ${a.seo_score || 0} | Issues: ${a.issues.join(", ")}`
    ).join("\n");

    const prompt = `Analise estes artigos com problemas de SEO e gere correções otimizadas:

${articlesList}

Para cada artigo, gere:
1. meta_title otimizado (max 60 chars, incluir keyword)
2. meta_description otimizada (max 155 chars, persuasiva)
3. focus_keyword sugerida (se ausente)

Retorne APENAS JSON:
{
  "fixes": [
    {
      "wp_post_id": 123,
      "meta_title": "...",
      "meta_description": "...",
      "focus_keyword": "..."
    }
  ]
}`;

    const aiContent = await orchestrator.call('seo_analysis', [
      { role: "system", content: "Você é um especialista SEO brasileiro. Gere metas otimizadas para máximo CTR e ranqueamento. Responda APENAS com JSON válido." },
      { role: "user", content: prompt },
    ], { maxTokens: 1500, temperature: 0.3 });

    const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const fixData = JSON.parse(jsonStr);

    if (fixData.fixes && Array.isArray(fixData.fixes) && baseUrl && isPlugin && apiKey) {
      for (const fix of fixData.fixes) {
        try {
          // Apply fix via WordPress REST API (plugin update-meta endpoint or standard WP API)
          const updateResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/update-seo-meta`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CFRDM-API-Key": apiKey,
            },
            body: JSON.stringify({
              post_id: fix.wp_post_id,
              meta_title: fix.meta_title,
              meta_description: fix.meta_description,
              focus_keyword: fix.focus_keyword,
            }),
          });

          if (updateResp.ok) {
            fixed++;
            fixesApplied.push(`Post ${fix.wp_post_id}: meta atualizada`);

            // Update index
            const matchingArticle = batchToFix.find(a => a.wp_post_id === fix.wp_post_id);
            if (matchingArticle) {
              await supabase
                .from("wordpress_article_index")
                .update({
                  primary_keyword: fix.focus_keyword || matchingArticle.primary_keyword,
                  seo_score: Math.min(85, (matchingArticle.seo_score || 0) + 20),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", matchingArticle.id);
            }
          } else {
            // Fallback: try standard WP REST API for Rank Math / Yoast
            const wpUpdateResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${fix.wp_post_id}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CFRDM-API-Key": apiKey,
              },
              body: JSON.stringify({
                meta: {
                  // Rank Math
                  rank_math_title: fix.meta_title,
                  rank_math_description: fix.meta_description,
                  rank_math_focus_keyword: fix.focus_keyword,
                  // Yoast
                  _yoast_wpseo_title: fix.meta_title,
                  _yoast_wpseo_metadesc: fix.meta_description,
                  _yoast_wpseo_focuskw: fix.focus_keyword,
                },
              }),
            });

            if (wpUpdateResp.ok) {
              fixed++;
              fixesApplied.push(`Post ${fix.wp_post_id}: meta atualizada (WP API)`);
            }
          }
        } catch (e) {
          console.error(`[SEO Agent] Fix failed for post ${fix.wp_post_id}:`, e);
        }
      }
    }
  } catch (e) {
    console.error(`[SEO Agent] [${project.name}] AI meta fix error:`, e);
  }

  return { found, fixed, issues: issues.slice(0, 15), fixes_applied: fixesApplied };
}

// ═══════════════════════════════════════════════════════════
// STEP 2: Internal Linking - Suggest + Apply
// ═══════════════════════════════════════════════════════════
async function analyzeAndApplyLinks(
  supabase: ReturnType<typeof createClient>,
  orchestrator: ReturnType<typeof getOrchestrator>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ suggested: number; applied: number; orphans: number; applied_details: string[] }> {
  const appliedDetails: string[] = [];

  // 1) First, apply any PENDING suggestions from previous runs
  let totalApplied = 0;
  if (baseUrl && isPlugin && apiKey) {
    const { data: pendingLinks } = await supabase
      .from("internal_link_suggestions")
      .select("id, source_wp_post_id, anchor_text, target_url, relevance_score")
      .eq("project_id", project.id)
      .eq("status", "pending")
      .gte("relevance_score", 70)
      .order("relevance_score", { ascending: false })
      .limit(20);

    if (pendingLinks && pendingLinks.length > 0) {
      for (const link of pendingLinks) {
        if (!link.source_wp_post_id || !link.anchor_text || !link.target_url) continue;

        try {
          const applyResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/apply-internal-link`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CFRDM-API-Key": apiKey,
            },
            body: JSON.stringify({
              post_id: link.source_wp_post_id,
              anchor_text: link.anchor_text,
              target_url: link.target_url,
            }),
          });

          if (applyResp.ok) {
            const applyData = await applyResp.json();
            if (applyData.success || applyData.applied) {
              totalApplied++;
              appliedDetails.push(`Link aplicado: "${link.anchor_text}" → ${link.target_url}`);

              await supabase
                .from("internal_link_suggestions")
                .update({ status: "applied", applied_at: new Date().toISOString() })
                .eq("id", link.id);
            } else {
              // Mark as failed to avoid retrying
              await supabase
                .from("internal_link_suggestions")
                .update({ status: "rejected", rejected_reason: applyData.reason || "anchor not found in content" })
                .eq("id", link.id);
            }
          }
        } catch (e) {
          console.error(`[SEO Agent] Apply link failed:`, e);
        }
      }
    }
  }

  // 2) Find orphan articles and generate new suggestions
  const { data: orphans } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, primary_keyword, topic_cluster, internal_links_count")
    .eq("project_id", project.id)
    .lte("internal_links_count", 0)
    .limit(30);

  if (!orphans || orphans.length === 0) {
    return { suggested: 0, applied: totalApplied, orphans: 0, applied_details: appliedDetails };
  }

  const { data: allArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, primary_keyword, topic_cluster, semantic_summary")
    .eq("project_id", project.id)
    .limit(200);

  if (!allArticles || allArticles.length < 2) {
    return { suggested: 0, applied: totalApplied, orphans: orphans.length, applied_details: appliedDetails };
  }

  let totalSuggested = 0;

  try {
    const articleList = allArticles
      .map(a => `- [${a.wp_post_title}](${a.wp_post_url}) | kw: ${a.primary_keyword || "N/A"} | cluster: ${a.topic_cluster || "N/A"}`)
      .join("\n");

    const orphanBatch = orphans.slice(0, 10);

    for (const orphan of orphanBatch) {
      const prompt = `Artigo órfão: "${orphan.wp_post_title}" (kw: ${orphan.primary_keyword || "N/A"}, cluster: ${orphan.topic_cluster || "N/A"})

Sugira os 3 melhores artigos para linkar PARA este e 3 artigos que este deveria linkar.

REGRAS para anchor_text:
- Use 2-4 palavras que EXISTEM no conteúdo do artigo fonte
- Prefira termos genéricos do tema
- Evite títulos completos

ARTIGOS:
${articleList}

JSON:
{"links_to_this":[{"title":"...","url":"...","anchor_text":"...","relevance":85}],"links_from_this":[{"title":"...","url":"...","anchor_text":"...","relevance":80}]}`;

      const aiContent = await orchestrator.call('seo_analysis', [
        { role: "system", content: "Especialista SEO. Gere anchor texts CURTOS (2-4 palavras). APENAS JSON." },
        { role: "user", content: prompt },
      ], { maxTokens: 500, temperature: 0.2 });

      try {
        const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const suggestions = JSON.parse(jsonStr);

        const urlToArticle = new Map(allArticles.map(a => [a.wp_post_url, a]));

        const allSuggestions = [
          ...(suggestions.links_to_this || []).map((s: any) => ({
            source_url: s.url,
            target_url: orphan.wp_post_url,
            anchor_text: s.anchor_text,
            relevance_score: s.relevance || 70,
            source_article: urlToArticle.get(s.url),
          })),
          ...(suggestions.links_from_this || []).map((s: any) => ({
            source_url: orphan.wp_post_url,
            target_url: s.url,
            anchor_text: s.anchor_text,
            relevance_score: s.relevance || 70,
            source_article: urlToArticle.get(orphan.wp_post_url),
          })),
        ];

        for (const suggestion of allSuggestions) {
          const sourceArticle = suggestion.source_article ||
            allArticles.find(a => a.wp_post_url === suggestion.source_url);

          await supabase
            .from("internal_link_suggestions")
            .insert({
              user_id: project.user_id,
              project_id: project.id,
              anchor_text: suggestion.anchor_text || orphan.wp_post_title,
              target_url: suggestion.target_url,
              relevance_score: suggestion.relevance_score,
              status: "pending",
              source_wp_post_id: sourceArticle?.wp_post_id || null,
              anchor_context: `Agente SEO: ${orphan.wp_post_title}`,
            });
          totalSuggested++;

          // Auto-apply if high relevance and plugin available
          if (suggestion.relevance_score >= 80 && sourceArticle?.wp_post_id && baseUrl && isPlugin && apiKey) {
            try {
              const applyResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/apply-internal-link`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CFRDM-API-Key": apiKey,
                },
                body: JSON.stringify({
                  post_id: sourceArticle.wp_post_id,
                  anchor_text: suggestion.anchor_text,
                  target_url: suggestion.target_url,
                }),
              });

              if (applyResp.ok) {
                const applyData = await applyResp.json();
                if (applyData.success || applyData.applied) {
                  totalApplied++;
                  appliedDetails.push(`Auto-link: "${suggestion.anchor_text}" em post ${sourceArticle.wp_post_id}`);
                }
              }
            } catch { /* continue */ }
          }
        }
      } catch { /* skip parse errors */ }
    }
  } catch (e) {
    console.error(`[SEO Agent] [${project.name}] Link analysis error:`, e);
  }

  return { suggested: totalSuggested, applied: totalApplied, orphans: orphans.length, applied_details: appliedDetails };
}

// ═══════════════════════════════════════════════════════════
// STEP 3: Indexing - Submit ALL non-indexed URLs + Sitemap
// ═══════════════════════════════════════════════════════════
async function submitIndexing(
  supabase: ReturnType<typeof createClient>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ submitted: number; sitemapRefreshed: boolean; googlePinged: boolean; details: string[] }> {
  const detailsList: string[] = [];
  let submitted = 0;
  let sitemapRefreshed = false;
  let googlePinged = false;

  if (!baseUrl || !isPlugin || !apiKey) {
    return { submitted: 0, sitemapRefreshed: false, googlePinged: false, details: ["No WordPress connection"] };
  }

  try {
    // 1) Get ALL published article URLs from index
    const { data: allArticles } = await supabase
      .from("wordpress_article_index")
      .select("wp_post_url")
      .eq("project_id", project.id)
      .eq("wp_post_status", "publish")
      .limit(500);

    const urls = allArticles?.map(a => a.wp_post_url).filter(Boolean) || [];

    if (urls.length > 0) {
      // 2) Submit to IndexNow via plugin (batch)
      try {
        const indexNowResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CFRDM-API-Key": apiKey,
          },
          body: JSON.stringify({ urls: urls.slice(0, 100) }), // IndexNow allows 10k but lets do 100 per run
        });

        if (indexNowResp.ok) {
          const indexData = await indexNowResp.json();
          submitted = indexData.submitted || urls.slice(0, 100).length;
          detailsList.push(`IndexNow: ${submitted} URLs submetidas`);
        } else {
          // Fallback: Direct IndexNow API submission
          const directResult = await submitDirectIndexNow(baseUrl, urls.slice(0, 50));
          submitted = directResult;
          detailsList.push(`IndexNow direto: ${submitted} URLs submetidas`);
        }
      } catch (e) {
        // Fallback: Direct IndexNow
        const directResult = await submitDirectIndexNow(baseUrl, urls.slice(0, 50));
        submitted = directResult;
        detailsList.push(`IndexNow fallback: ${submitted} URLs`);
      }
    }

    // 3) Refresh sitemap
    try {
      const sitemapResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-sitemap`, {
        method: "POST",
        headers: { "X-CFRDM-API-Key": apiKey },
      });
      sitemapRefreshed = sitemapResp.ok;
      if (sitemapRefreshed) detailsList.push("Sitemap atualizado");
    } catch { /* ignore */ }

    // 4) Ping Google sitemap
    try {
      const sitemapUrl = `${baseUrl.replace(/\/blog\/?$/, "")}/sitemap_index.xml`;
      await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, {
        method: "GET",
      });
      googlePinged = true;
      detailsList.push("Google sitemap pinged");
    } catch { /* ignore */ }

    // 5) Ping Bing sitemap
    try {
      const sitemapUrl = `${baseUrl.replace(/\/blog\/?$/, "")}/sitemap_index.xml`;
      await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`, {
        method: "GET",
      });
      detailsList.push("Bing sitemap pinged");
    } catch { /* ignore */ }

    // 6) Refresh llms.txt
    try {
      await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-llms`, {
        method: "POST",
        headers: { "X-CFRDM-API-Key": apiKey },
      });
      detailsList.push("llms.txt atualizado");
    } catch { /* ignore */ }

  } catch (e) {
    console.error(`[SEO Agent] [${project.name}] Indexing error:`, e);
  }

  return { submitted, sitemapRefreshed, googlePinged, details: detailsList };
}

// ═══════════════════════════════════════════════════════════
// Direct IndexNow API (fallback when plugin endpoint unavailable)
// ═══════════════════════════════════════════════════════════
async function submitDirectIndexNow(siteUrl: string, urls: string[]): Promise<number> {
  if (urls.length === 0) return 0;

  const host = new URL(siteUrl).hostname;
  // Generate a deterministic key from the hostname
  const key = Array.from(host).reduce((acc, c) => acc + c.charCodeAt(0).toString(16), "indexnow").slice(0, 32);

  try {
    const resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: urls,
      }),
    });

    const status = resp.status;
    if (status === 200 || status === 202) {
      return urls.length;
    }
  } catch (e) {
    console.error("[IndexNow Direct] Error:", e);
  }

  return 0;
}

// ═══════════════════════════════════════════════════════════
// STEP 4: AI Discovery Optimization
// Ensures content is discoverable by ChatGPT, Gemini, Claude, Manus
// ═══════════════════════════════════════════════════════════
async function optimizeAIDiscovery(
  supabase: ReturnType<typeof createClient>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ actions: string[]; llmsTxtRefreshed: boolean; schemaEnhanced: boolean; headersSet: boolean }> {
  const actions: string[] = [];
  let llmsTxtRefreshed = false;
  let schemaEnhanced = false;
  let headersSet = false;

  if (!baseUrl || !isPlugin || !apiKey) {
    return { actions: ["No WordPress connection"], llmsTxtRefreshed: false, schemaEnhanced: false, headersSet: false };
  }

  // 1) Refresh llms.txt - Critical for AI crawlers (ChatGPT, Claude, Gemini)
  try {
    const llmsResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-llms`, {
      method: "POST",
      headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ include_full_catalog: true }),
    });
    if (llmsResp.ok) {
      llmsTxtRefreshed = true;
      actions.push("llms.txt atualizado para AI crawlers");
    }
  } catch { /* ignore */ }

  // 2) Ensure X-Robots-Tag headers allow AI indexing
  try {
    const headersResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/set-ai-headers`, {
      method: "POST",
      headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        headers: {
          "X-Robots-Tag": "all",
          "X-Content-Type-Options": "nosniff",
        },
        ai_meta_tags: [
          { name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" },
          { name: "googlebot", content: "index, follow" },
          { name: "bingbot", content: "index, follow" },
        ],
      }),
    });
    if (headersResp.ok) {
      headersSet = true;
      actions.push("Headers AI-friendly configurados");
    }
  } catch { /* ignore */ }

  // 3) Validate and enhance Schema.org structured data
  try {
    const schemaResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/validate-schemas`, {
      method: "POST",
      headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ auto_fix: true, include_faq: true, include_howto: true }),
    });
    if (schemaResp.ok) {
      const schemaData = await schemaResp.json();
      schemaEnhanced = schemaData.fixed > 0 || schemaData.enhanced > 0;
      if (schemaEnhanced) {
        actions.push(`Schema.org: ${schemaData.fixed || 0} corrigidos, ${schemaData.enhanced || 0} aprimorados`);
      }
    }
  } catch { /* ignore */ }

  // 4) Ping AI search engines / services for content freshness
  const sitemapUrl = `${baseUrl.replace(/\/blog\/?$/, "")}/sitemap_index.xml`;
  const llmsUrl = `${baseUrl.replace(/\/blog\/?$/, "")}/llms.txt`;

  // Ping Bing (feeds ChatGPT via Bing index)
  try {
    await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    actions.push("Bing pinged (ChatGPT source)");
  } catch { /* ignore */ }

  // Ping Google (feeds Gemini AI)
  try {
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    actions.push("Google pinged (Gemini source)");
  } catch { /* ignore */ }

  // Ping Yandex (broader AI coverage)
  try {
    await fetch(`https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    actions.push("Yandex pinged");
  } catch { /* ignore */ }

  // 5) Submit to IndexNow (Bing, Yandex, Seznam, Naver - used by multiple AI systems)
  try {
    const host = new URL(baseUrl).hostname;
    const key = Array.from(host).reduce((acc, c) => acc + c.charCodeAt(0).toString(16), "indexnow").slice(0, 32);
    
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: [
          `https://${host}/`,
          `https://${host}/llms.txt`,
          sitemapUrl,
        ],
      }),
    });
    actions.push("IndexNow: homepage + llms.txt submetidos");
  } catch { /* ignore */ }

  // 6) Verify llms.txt is accessible
  try {
    const checkResp = await fetch(llmsUrl, { method: "HEAD" });
    if (checkResp.ok) {
      actions.push("llms.txt acessível ✓");
    } else {
      actions.push("⚠ llms.txt não acessível - verificar plugin");
    }
  } catch {
    actions.push("⚠ llms.txt check falhou");
  }

  return { actions, llmsTxtRefreshed, schemaEnhanced, headersSet };
}
