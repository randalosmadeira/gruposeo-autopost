import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getOrchestrator } from "../_shared/ai-orchestrator.ts";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { orchestrate, resolveVernizDNA } from "../_shared/verniz-orchestrator.ts";
import { PLUGIN_VERSION } from "../_shared/plugin-version.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════
// VERIFICATION HELPER: Confirms a link was ACTUALLY inserted
// into the WordPress post content by re-fetching and checking
// ═══════════════════════════════════════════════════════════
async function verifyLinkInContent(
  baseUrl: string,
  apiKey: string,
  postId: number,
  targetUrl: string,
  projectName: string,
): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}?_fields=content`, {
      headers: { "X-CFRDM-API-Key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    const content = data.content?.rendered || data.content?.raw || "";
    // Normalize URLs for comparison (strip trailing slashes, protocol)
    const normalizedTarget = targetUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const hasLink = content.includes(targetUrl) ||
      content.includes(normalizedTarget) ||
      content.includes(`href="${targetUrl}"`) ||
      content.includes(`href="${targetUrl.replace(/\/+$/, "")}"`);
    if (!hasLink) {
      console.warn(`[SEO Agent] [${projectName}] VERIFICATION FAILED: Post ${postId} does NOT contain link to ${targetUrl}`);
    }
    return hasLink;
  } catch (e) {
    console.warn(`[SEO Agent] [${projectName}] Verification fetch failed for post ${postId}:`, e);
    return false; // If we can't verify, don't count it
  }
}

// ═══════════════════════════════════════════════════════════
// BROKEN LINK DETECTOR: Crawl published articles for 404s
// ═══════════════════════════════════════════════════════════
async function detectBrokenLinks(
  supabase: ReturnType<typeof createClient>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ total_checked: number; broken_found: number; redirects_found: number; broken_urls: Array<{ source_url: string; broken_url: string; status: number }>; redirect_chains: Array<{ url: string; chain_length: number; final_url: string }> }> {
  const brokenUrls: Array<{ source_url: string; broken_url: string; status: number }> = [];
  const redirectChains: Array<{ url: string; chain_length: number; final_url: string }> = [];
  let totalChecked = 0;

  // 1) Try plugin endpoint first (fastest, uses server-side crawl)
  if (isPlugin && apiKey && baseUrl) {
    try {
      const resp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/scan-broken-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
        body: JSON.stringify({ limit: 500, check_redirects: true }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return {
          total_checked: data.total_checked || 0,
          broken_found: data.broken_found || 0,
          redirects_found: data.redirects_found || 0,
          broken_urls: data.broken_urls || [],
          redirect_chains: data.redirect_chains || [],
        };
      }
    } catch { /* fallback below */ }
  }

  // 2) Fallback: Check published article URLs from our index
  const { data: articles } = await supabase
    .from("wordpress_article_index")
    .select("wp_post_url, wp_post_title")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .limit(1000);

  if (!articles || articles.length === 0) {
    return { total_checked: 0, broken_found: 0, redirects_found: 0, broken_urls: [], redirect_chains: [] };
  }

  // Check each article URL for 404 or redirect chains
  for (const article of articles) {
    if (!article.wp_post_url) continue;
    totalChecked++;
    try {
      const resp = await fetch(article.wp_post_url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const status = resp.status;
      if (status === 404 || status === 410) {
        brokenUrls.push({ source_url: article.wp_post_url, broken_url: article.wp_post_url, status });
      } else if (status >= 300 && status < 400) {
        // Follow redirect chain
        let chainLength = 1;
        let currentUrl = resp.headers.get("location") || "";
        let finalUrl = currentUrl;
        while (chainLength < 5 && currentUrl) {
          try {
            const chainResp = await fetch(currentUrl, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
            if (chainResp.status >= 300 && chainResp.status < 400) {
              chainLength++;
              currentUrl = chainResp.headers.get("location") || "";
              finalUrl = currentUrl || finalUrl;
            } else {
              finalUrl = currentUrl;
              break;
            }
          } catch { break; }
        }
        if (chainLength > 1) {
          redirectChains.push({ url: article.wp_post_url, chain_length: chainLength, final_url: finalUrl });
        }
      }
    } catch { /* timeout or network error - skip */ }
  }

  return {
    total_checked: totalChecked,
    broken_found: brokenUrls.length,
    redirects_found: redirectChains.length,
    broken_urls: brokenUrls,
    redirect_chains: redirectChains,
  };
}

// ═══════════════════════════════════════════════════════════
// DUPLICATE CONTENT DETECTOR
// ═══════════════════════════════════════════════════════════
async function detectDuplicateContent(
  supabase: ReturnType<typeof createClient>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ duplicates_found: number; duplicate_titles: Array<{ title: string; urls: string[] }>; thin_pages: number; duplicate_metas: number }> {
  const duplicateTitles: Array<{ title: string; urls: string[] }> = [];
  let thinPages = 0;
  let duplicateMetas = 0;

  // 1) Plugin endpoint
  if (isPlugin && apiKey && baseUrl) {
    try {
      const resp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/scan-duplicates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
        body: JSON.stringify({ limit: 500, check_meta: true }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return {
          duplicates_found: data.duplicates_found || 0,
          duplicate_titles: data.duplicate_titles || [],
          thin_pages: data.thin_pages || 0,
          duplicate_metas: data.duplicate_metas || 0,
        };
      }
    } catch { /* fallback */ }
  }

  // 2) Fallback: Check from our index
  const { data: articles } = await supabase
    .from("wordpress_article_index")
    .select("wp_post_title, wp_post_url, word_count, content_hash")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .limit(1000);

  if (!articles) return { duplicates_found: 0, duplicate_titles: [], thin_pages: 0, duplicate_metas: 0 };

  // Detect duplicate titles
  const titleMap = new Map<string, string[]>();
  for (const a of articles) {
    const normalizedTitle = (a.wp_post_title || "").toLowerCase().trim();
    if (!normalizedTitle) continue;
    if (!titleMap.has(normalizedTitle)) titleMap.set(normalizedTitle, []);
    titleMap.get(normalizedTitle)!.push(a.wp_post_url);
  }
  for (const [title, urls] of titleMap) {
    if (urls.length > 1) duplicateTitles.push({ title, urls });
  }

  // Detect thin pages
  thinPages = articles.filter(a => (a.word_count || 0) < 300).length;

  // Detect duplicate content hashes
  const hashMap = new Map<string, number>();
  for (const a of articles) {
    if (!a.content_hash) continue;
    hashMap.set(a.content_hash, (hashMap.get(a.content_hash) || 0) + 1);
  }
  duplicateMetas = Array.from(hashMap.values()).filter(c => c > 1).length;

  return {
    duplicates_found: duplicateTitles.length + duplicateMetas,
    duplicate_titles: duplicateTitles.slice(0, 20),
    thin_pages: thinPages,
    duplicate_metas: duplicateMetas,
  };
}

// ═══════════════════════════════════════════════════════════
// META & TITLE ANALYZER: Comprehensive page metadata audit
// ═══════════════════════════════════════════════════════════
async function auditPageMetadata(
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
  project: any,
): Promise<{ pages_audited: number; missing_titles: number; long_titles: number; short_titles: number; missing_descriptions: number; long_descriptions: number; duplicate_titles: number; duplicate_descriptions: number; issues: Array<{ url: string; issue: string; current_value?: string }> }> {
  const issues: Array<{ url: string; issue: string; current_value?: string }> = [];

  if (!isPlugin || !apiKey || !baseUrl) {
    return { pages_audited: 0, missing_titles: 0, long_titles: 0, short_titles: 0, missing_descriptions: 0, long_descriptions: 0, duplicate_titles: 0, duplicate_descriptions: 0, issues: [] };
  }

  try {
    const resp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/meta-audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
      body: JSON.stringify({ auto_fix: false, detailed: true }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return {
        pages_audited: data.pages_audited || data.total || 0,
        missing_titles: data.missing_titles || 0,
        long_titles: data.long_titles || 0,
        short_titles: data.short_titles || 0,
        missing_descriptions: data.missing_descriptions || 0,
        long_descriptions: data.long_descriptions || 0,
        duplicate_titles: data.duplicate_titles || 0,
        duplicate_descriptions: data.duplicate_descriptions || 0,
        issues: (data.issues || []).slice(0, 50),
      };
    }
  } catch { /* fallback below */ }

  return { pages_audited: 0, missing_titles: 0, long_titles: 0, short_titles: 0, missing_descriptions: 0, long_descriptions: 0, duplicate_titles: 0, duplicate_descriptions: 0, issues: [] };
}

// ═══════════════════════════════════════════════════════════
// REDIRECT AUDITOR: Find temporary/permanent redirects, chains, loops
// ═══════════════════════════════════════════════════════════
async function auditRedirects(
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ total_redirects: number; temporary: number; permanent: number; chains: number; loops: number; details: Array<{ source: string; target: string; type: number; chain_length?: number }> }> {
  if (!isPlugin || !apiKey || !baseUrl) {
    return { total_redirects: 0, temporary: 0, permanent: 0, chains: 0, loops: 0, details: [] };
  }

  try {
    const resp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/redirects/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
      body: JSON.stringify({ check_chains: true, check_loops: true }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return {
        total_redirects: data.total_redirects || 0,
        temporary: data.temporary || 0,
        permanent: data.permanent || 0,
        chains: data.chains || 0,
        loops: data.loops || 0,
        details: (data.details || []).slice(0, 50),
      };
    }
  } catch { /* endpoint unavailable */ }

  return { total_redirects: 0, temporary: 0, permanent: 0, chains: 0, loops: 0, details: [] };
}

// ═══════════════════════════════════════════════════════════
// GLOBAL EXECUTION TIMER — prevents stuck runs by saving
// partial results before the edge function timeout (150s).
// NOTE: requestStart is set per-request inside Deno.serve()
// to avoid stale timestamps on warm function instances.
// ═══════════════════════════════════════════════════════════
let requestStart = Date.now();
const MAX_EXECUTION_MS = 140_000; // 140s safety margin (Deno limit ~150s)

// ═══════════════════════════════════════════════════════════
// 200% MODE: All limits doubled for maximum throughput
// ═══════════════════════════════════════════════════════════
const LIMIT_MULTIPLIER = 2;

function elapsedMs(): number { return Date.now() - requestStart; }
function hasTimeLeft(reserveMs = 15_000): boolean { return elapsedMs() + reserveMs < MAX_EXECUTION_MS; }

Deno.serve(async (req) => {
  // Reset timer for each request (critical for warm instances)
  requestStart = Date.now();

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

    console.log(`[SEO Agent v${PLUGIN_VERSION}] Starting run: type=${runType}, user=${targetUserId || "all"}, project=${targetProjectId || "all"}`);

    // ═══════════════════════════════════════════
    // PRE-STEP: Auto-repair stuck/truncated runs
    // ═══════════════════════════════════════════
    const cutoff30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckRuns } = await supabase
      .from("seo_agent_runs")
      .select("id, project_id, started_at")
      .eq("status", "running")
      .lt("started_at", cutoff30min)
      .limit(50);

    if (stuckRuns && stuckRuns.length > 0) {
      console.log(`[SEO Agent] Auto-repairing ${stuckRuns.length} stuck/truncated runs`);
      for (const stuck of stuckRuns) {
        await supabase
          .from("seo_agent_runs")
          .update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_message: "Auto-recuperado: run travado por >30min [self-healing v3.6.0]",
          })
          .eq("id", stuck.id);
      }
    }

    let query = supabase
      .from("projects")
      .select("id, user_id, name, domain, wordpress_url, wordpress_username, wordpress_app_password, seo_plugin, nicho, empresa_nome, empresa_telefone, empresa_endereco, empresa_whatsapp, social_instagram, social_youtube, social_linkedin, social_twitter, social_tiktok, social_google_maps, social_linktree, cta_comunidade, cta_conclusao, cta_leads, compliance_rules")
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

      // Helper: save partial results when time runs out
      const savePartialAndFinish = async (lastStep: string) => {
        const elapsed = elapsedMs();
        console.log(`[SEO Agent] [${project.name}] ⏱ Time limit reached at ${lastStep} (${Math.round(elapsed / 1000)}s). Saving partial results.`);
        const summary = `⏱ ${project.name}: execução parcial até ${lastStep} (${Math.round(elapsed / 1000)}s) — ${linksSuggested} links sugeridos, ${metaIssuesFixed} metas corrigidos`;
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
            details: { ...details, partial: true, stopped_at: lastStep, elapsed_ms: elapsed },
          })
          .eq("id", runId);
        return summary;
      };

      try {
        // ═══════════════════════════════════════════
        // STEPS 1-2: Meta Audit + Internal Linking (sequential — Step 2 depends on project state)
        // ═══════════════════════════════════════════
        if (hasTimeLeft()) {
          console.log(`[SEO Agent v200%] [${project.name}] Step 1: SEO Meta Audit (${Math.round(elapsedMs()/1000)}s)`);
          const metaResult = await runMetaAuditWithFix(supabase, orchestrator, project, baseUrl, isPlugin, apiKey);
          metaIssuesFound = metaResult.found;
          metaIssuesFixed = metaResult.fixed;
          details.meta_audit = metaResult;
        }

        if (hasTimeLeft()) {
          console.log(`[SEO Agent v200%] [${project.name}] Step 2: Internal Linking (${Math.round(elapsedMs()/1000)}s)`);
          const linkResult = await analyzeAndApplyLinks(supabase, orchestrator, project, baseUrl, isPlugin, apiKey);
          linksSuggested = linkResult.suggested;
          linksApplied = linkResult.applied;
          details.internal_links = linkResult;
        } else { const s = await savePartialAndFinish("Step 1"); results.push({ project: project.name, status: "partial", summary: s }); continue; }

        // ═══════════════════════════════════════════
        // STEPS 3+4: Indexing + AI Discovery (PARALLEL — independent)
        // ═══════════════════════════════════════════
        let aiDiscoveryResult: any = { actions: [] };
        if (hasTimeLeft()) {
          console.log(`[SEO Agent v200%] [${project.name}] Steps 3+4 PARALLEL: Indexing + AI Discovery (${Math.round(elapsedMs()/1000)}s)`);
          const [indexRes, aiDiscRes] = await Promise.allSettled([
            submitIndexing(supabase, project, baseUrl, isPlugin, apiKey),
            optimizeAIDiscovery(supabase, project, baseUrl, isPlugin, apiKey),
          ]);
          if (indexRes.status === "fulfilled") {
            indexingSubmitted = indexRes.value.submitted;
            sitemapUpdated = indexRes.value.sitemapRefreshed;
            details.indexing = indexRes.value;
          }
          aiDiscoveryResult = aiDiscRes.status === "fulfilled" ? aiDiscRes.value : aiDiscoveryResult;
          details.ai_discovery = aiDiscoveryResult;
        } else { const s = await savePartialAndFinish("Step 2"); results.push({ project: project.name, status: "partial", summary: s }); continue; }

        // ═══════════════════════════════════════════
        // STEPS 5+6: Technical Audit + Autonomous Fix (PARALLEL — independent)
        // ═══════════════════════════════════════════
        let auditResult: any = { score: 0, issues: [], issues_found: 0, issues_fixed: 0, categories: {} };
        let autonomousResult: any = { applied: 0, redirects_created: 0, types: [] };
        if (hasTimeLeft()) {
          console.log(`[SEO Agent v200%] [${project.name}] Steps 5+6 PARALLEL: Audit + Autonomous Fix (${Math.round(elapsedMs()/1000)}s)`);
          const [auditRes, autoRes] = await Promise.allSettled([
            runFullTechnicalAudit(supabase, orchestrator, project, baseUrl, isPlugin, apiKey),
            runAutonomousSEOFix(supabase, orchestrator, project, baseUrl, isPlugin, apiKey),
          ]);
          auditResult = auditRes.status === "fulfilled" ? auditRes.value : auditResult;
          autonomousResult = autoRes.status === "fulfilled" ? autoRes.value : autonomousResult;
          details.audit = auditResult;
          details.autonomous_fix = autonomousResult;
        } else { const s = await savePartialAndFinish("Step 4"); results.push({ project: project.name, status: "partial", summary: s }); continue; }

        // ═══════════════════════════════════════════
        // STEP 8: Full Site Crawl (v3.5.0 — REAL HTTP checks)
        // ═══════════════════════════════════════════
        let fullCrawlResult: Record<string, unknown> = {};
        let brokenLinksResult: any = { broken_found: 0, broken_urls: [], redirects_found: 0, redirect_chains: [] };
        let duplicateResult: any = { duplicates_found: 0, duplicate_titles: [], thin_pages: 0, duplicate_metas: 0 };
        let metadataAudit: any = { pages_audited: 0, missing_titles: 0, long_titles: 0, short_titles: 0, missing_descriptions: 0, long_descriptions: 0, duplicate_titles: 0, duplicate_descriptions: 0, issues: [] };
        let redirectAudit: any = { total_redirects: 0, temporary: 0, permanent: 0, chains: 0, loops: 0, details: [] };

        if (hasTimeLeft(25_000)) {
          console.log(`[SEO Agent] [${project.name}] Step 8: Full Site Crawl (${Math.round(elapsedMs()/1000)}s)`);
          if (isPlugin && apiKey && baseUrl) {
            try {
              const crawlTimeout = Math.min(60_000, MAX_EXECUTION_MS - elapsedMs() - 20_000);
              const crawlResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/full-site-crawl`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
                body: JSON.stringify({ limit: 200 }),
                signal: AbortSignal.timeout(Math.max(crawlTimeout, 10_000)),
              });
              if (crawlResp.ok) {
                fullCrawlResult = await crawlResp.json();
                console.log(`[SEO Agent] [${project.name}] Full crawl completed: score=${(fullCrawlResult as any).overall_score}/100`);
              }
            } catch (e) {
              console.log(`[SEO Agent] [${project.name}] Full site crawl timed out or unavailable`);
            }
          }

          brokenLinksResult = (fullCrawlResult as any).broken_links || await detectBrokenLinks(supabase, project, baseUrl, isPlugin, apiKey);
          duplicateResult = (fullCrawlResult as any).duplicates || await detectDuplicateContent(supabase, project, baseUrl, isPlugin, apiKey);
          metadataAudit = (fullCrawlResult as any).titles_metas || await auditPageMetadata(baseUrl, isPlugin, apiKey, project);
          redirectAudit = (fullCrawlResult as any).redirects || await auditRedirects(baseUrl, isPlugin, apiKey);
        } else {
          console.log(`[SEO Agent] [${project.name}] Skipping Step 8 (crawl) — time: ${Math.round(elapsedMs()/1000)}s`);
        }

        details.broken_links = brokenLinksResult;
        details.duplicate_content = duplicateResult;
        details.metadata_audit = metadataAudit;
        details.redirect_audit = redirectAudit;

        if ((fullCrawlResult as any).site_structure) details.site_structure = (fullCrawlResult as any).site_structure;
        if ((fullCrawlResult as any).directives) details.directives = (fullCrawlResult as any).directives;
        if ((fullCrawlResult as any).images) details.images = (fullCrawlResult as any).images;
        if ((fullCrawlResult as any).overall_score !== undefined) details.crawl_score = (fullCrawlResult as any).overall_score;
        if ((fullCrawlResult as any).priority_issues) details.priority_issues = (fullCrawlResult as any).priority_issues;

        // ═══════════════════════════════════════════
        // STEP 9: AUTO-FIX Broken Links (404 → 301 Redirects) v3.6.0
        // ═══════════════════════════════════════════
        if (!hasTimeLeft()) { const s = await savePartialAndFinish("Step 8"); results.push({ project: project.name, status: "partial", summary: s }); continue; }
        console.log(`[SEO Agent] [${project.name}] Step 9: Auto-Fix Broken Links (${Math.round(elapsedMs()/1000)}s)`);

        let brokenLinksFixed = 0;
        let redirectsAutoCreated = 0;
        const brokenFixDetails: string[] = [];

        if (brokenLinksResult.broken_found > 0 && isPlugin && apiKey && baseUrl) {
          const brokenUrls = brokenLinksResult.broken_urls || [];
          
          // For each broken URL, try to find the best redirect target via AI
          if (brokenUrls.length > 0) {
            const { data: allPublished } = await supabase
              .from("wordpress_article_index")
              .select("wp_post_title, wp_post_url, primary_keyword, topic_cluster")
              .eq("project_id", project.id)
              .eq("wp_post_status", "publish")
              .limit(500);

            if (allPublished && allPublished.length > 0) {
              const brokenBatch = brokenUrls.slice(0, 50);
              const brokenList = brokenBatch.map((b: any) => `- ${b.broken_url} (status: ${b.status})`).join("\n");
              const publishedList = allPublished.slice(0, 100).map(a => `- ${a.wp_post_url} | ${a.wp_post_title} | kw: ${a.primary_keyword || "N/A"}`).join("\n");

              try {
                const redirectPrompt = `URLs QUEBRADAS (404/410):
${brokenList}

ARTIGOS VÁLIDOS:
${publishedList}

Para cada URL quebrada, encontre o melhor artigo válido para redirecionar (301).
Escolha com base na similaridade de tema, keyword e slug.
Se não houver match relevante, redirecione para a homepage.

JSON: {"redirects":[{"broken_url":"...","target_url":"...","reason":"..."}]}`;

                const aiResult = await orchestrator.call("seo_analysis", [
                  { role: "system", content: "Especialista SEO. Gere redirects 301 inteligentes para URLs quebradas. APENAS JSON." },
                  { role: "user", content: redirectPrompt },
                ], { maxTokens: 4000, temperature: 0.1 });

                let jsonStr = aiResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) jsonStr = jsonMatch[0];
                const parsed = JSON.parse(jsonStr);

                if (parsed?.redirects && Array.isArray(parsed.redirects)) {
                  const redirectsToCreate = parsed.redirects.map((r: any) => ({
                    source_url: r.broken_url,
                    target_url: r.target_url,
                    category: "auto_404_fix",
                    notes: `Auto-fix v3.6.0: ${r.reason || "AI-matched"}`,
                  }));

                  const redirectResult = await manageRedirects(baseUrl, isPlugin, apiKey, redirectsToCreate);
                  redirectsAutoCreated = redirectResult.created;
                  brokenLinksFixed = redirectResult.created;
                  if (redirectResult.created > 0) {
                    brokenFixDetails.push(`✅ ${redirectResult.created} redirects 301 criados para URLs 404`);
                  }
                }
              } catch (e) {
                console.error(`[SEO Agent] [${project.name}] Broken link AI fix error:`, e);
              }
            }
          }
        }

        // Auto-fix redirect chains
        if (brokenLinksResult.redirects_found > 0 && isPlugin && apiKey && baseUrl) {
          const chains = brokenLinksResult.redirect_chains || [];
          if (chains.length > 0) {
            const chainRedirects = chains.map((c: any) => ({
              source_url: c.url,
              target_url: c.final_url,
              category: "chain_fix",
              notes: `Auto-fix: chain de ${c.chain_length} hops simplificada`,
            }));
            const chainResult = await manageRedirects(baseUrl, isPlugin, apiKey, chainRedirects);
            if (chainResult.created > 0) {
              redirectsAutoCreated += chainResult.created;
              brokenFixDetails.push(`✅ ${chainResult.created} redirect chains simplificadas`);
            }
          }
        }

        details.broken_links_fix = { fixed: brokenLinksFixed, redirects_created: redirectsAutoCreated, details: brokenFixDetails };

        // ═══════════════════════════════════════════
        // STEP 10: AI Bulk Title & Meta Fix v3.6.0
        // ═══════════════════════════════════════════
        if (!hasTimeLeft()) { const s = await savePartialAndFinish("Step 9"); results.push({ project: project.name, status: "partial", summary: s }); continue; }
        console.log(`[SEO Agent] [${project.name}] Step 10: AI Bulk Meta Fix (${Math.round(elapsedMs()/1000)}s)`);

        let bulkMetasFixed = 0;
        const bulkMetaDetails: string[] = [];

        if (isPlugin && apiKey && baseUrl) {
          // Get articles with meta issues from our index
          const { data: metaIssueArticles } = await supabase
            .from("wordpress_article_index")
            .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, secondary_keywords, word_count, seo_score")
            .eq("project_id", project.id)
            .eq("wp_post_status", "publish")
            .order("seo_score", { ascending: true })
            .limit(1000);

          if (metaIssueArticles && metaIssueArticles.length > 0) {
            // Filter articles needing title/meta fixes
            const needsFix = metaIssueArticles.filter(a => {
              const titleLen = (a.wp_post_title || "").length;
              return titleLen > 70 || titleLen < 25 || (a.seo_score || 0) < 50;
            });

            if (needsFix.length > 0) {
              const batchSize = 20;
              for (let i = 0; i < Math.min(needsFix.length, 500); i += batchSize) {
                const batch = needsFix.slice(i, i + batchSize);
                const articlesList = batch.map(a => 
                  `- post_id: ${a.wp_post_id} | Título: "${a.wp_post_title}" (${(a.wp_post_title || "").length} chars) | kw: ${a.primary_keyword || "N/A"} | score: ${a.seo_score || 0}`
                ).join("\n");

                try {
                  const metaPrompt = `Corrija títulos e meta descriptions para estes artigos com problemas SEO:

${articlesList}

REGRAS INEGOCIÁVEIS:
- meta_title: 55-65 caracteres, keyword no início, sem cortar palavras
- meta_description: 145-160 caracteres, keyword nos primeiros 60 chars, CTA sutil
- focus_keyword: se ausente, extrair do título
- Flesch 60+: vocabulário simples e direto
- Nicho: ${project.nicho || "geral"} | Empresa: ${project.empresa_nome || project.name}
- LIMPAR: remover parênteses órfãos, anos truncados, caracteres especiais pendentes

JSON: {"fixes":[{"wp_post_id":123,"meta_title":"...","meta_description":"...","focus_keyword":"..."}]}`;

                  const aiResult = await orchestrator.call("seo_analysis", [
                    { role: "system", content: "Especialista SEO brasileiro. Gere títulos e meta descriptions otimizadas. Máximo CTR. APENAS JSON válido." },
                    { role: "user", content: metaPrompt },
                  ], { maxTokens: 4000, temperature: 0.3 });

                  let jsonStr = aiResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                  if (jsonMatch) jsonStr = jsonMatch[0];
                  const parsed = JSON.parse(jsonStr);

                  if (parsed?.fixes && Array.isArray(parsed.fixes)) {
                    // Apply via bulk-meta-update endpoint
                    const updates = parsed.fixes.map((fix: any) => ({
                      post_id: fix.wp_post_id,
                      meta_title: fix.meta_title,
                      meta_description: fix.meta_description,
                      focus_keyword: fix.focus_keyword,
                    }));

                    try {
                      const bulkResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/bulk-meta-update`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
                        body: JSON.stringify({ updates }),
                      });
                      if (bulkResp.ok) {
                        const bulkData = await bulkResp.json();
                        const batchFixed = bulkData.updated || bulkData.success_count || 0;
                        bulkMetasFixed += batchFixed;
                        if (batchFixed > 0) {
                          bulkMetaDetails.push(`✅ ${batchFixed} títulos/metas otimizados via IA`);
                        }
                      }
                    } catch {
                      // Fallback: apply individually via AI SEO endpoint
                      for (const fix of parsed.fixes) {
                        try {
                          const singleResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/update-seo-meta`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
                            body: JSON.stringify({ post_id: fix.wp_post_id, meta_title: fix.meta_title, meta_description: fix.meta_description, focus_keyword: fix.focus_keyword }),
                          });
                          if (singleResp.ok) bulkMetasFixed++;
                        } catch { /* continue */ }
                      }
                    }
                  }
                } catch (e) {
                  console.error(`[SEO Agent] [${project.name}] Bulk meta AI fix error:`, e);
                }
              }
            }
          }
        }

        details.bulk_meta_fix = { fixed: bulkMetasFixed, details: bulkMetaDetails };
        metaIssuesFixed += bulkMetasFixed;

        // ═══════════════════════════════════════════
        // STEP 11: Advanced Sitemap Optimization v3.6.0
        // ═══════════════════════════════════════════
        if (!hasTimeLeft()) { const s = await savePartialAndFinish("Step 10"); results.push({ project: project.name, status: "partial", summary: s }); continue; }
        console.log(`[SEO Agent] [${project.name}] Step 11: Sitemap Optimization (${Math.round(elapsedMs()/1000)}s)`);

        const sitemapOptDetails: string[] = [];
        if (isPlugin && apiKey && baseUrl) {
          // Validate sitemap structure
          try {
            const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
            for (const sitemapUrl of [`${siteRoot}/wp-sitemap.xml`, `${siteRoot}/sitemap_index.xml`, `${siteRoot}/sitemap.xml`]) {
              try {
                const sResp = await fetch(sitemapUrl, { signal: AbortSignal.timeout(8000) });
                if (sResp.ok) {
                  const sContent = await sResp.text();
                  const urlCount = (sContent.match(/<loc>/g) || []).length;
                  sitemapOptDetails.push(`Sitemap encontrado: ${sitemapUrl} (${urlCount} URLs)`);
                  
                  // Check for 404 URLs in sitemap
                  const locMatches = sContent.match(/<loc>(.*?)<\/loc>/g) || [];
                  let dead404InSitemap = 0;
                  const sampleUrls = locMatches.slice(0, 10).map(m => m.replace(/<\/?loc>/g, ""));
                  for (const url of sampleUrls) {
                    try {
                      const checkResp = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
                      if (checkResp.status === 404 || checkResp.status === 410) dead404InSitemap++;
                    } catch { /* skip */ }
                  }
                  if (dead404InSitemap > 0) {
                    sitemapOptDetails.push(`⚠ ${dead404InSitemap} URLs mortas no sitemap (amostra de ${sampleUrls.length})`);
                    // Try to refresh sitemap to remove dead URLs
                    try {
                      await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-sitemap`, {
                        method: "POST",
                        headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
                        body: JSON.stringify({ remove_404: true }),
                      });
                      sitemapOptDetails.push("✅ Sitemap refresh solicitado (remoção de 404s)");
                    } catch { /* */ }
                  }
                  break;
                }
              } catch { /* try next */ }
            }
          } catch { /* */ }

          // Ping all search engines
          const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
          let bestSitemap = `${siteRoot}/wp-sitemap.xml`;
          try {
            for (const c of [`${siteRoot}/wp-sitemap.xml`, `${siteRoot}/sitemap_index.xml`, `${siteRoot}/sitemap.xml`]) {
              try { const r = await fetch(c, { method: "HEAD", signal: AbortSignal.timeout(3000) }); if (r.ok) { bestSitemap = c; break; } } catch { /* next */ }
            }
            await Promise.all([
              fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(bestSitemap)}`).catch(() => {}),
              fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(bestSitemap)}`).catch(() => {}),
              fetch(`https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(bestSitemap)}`).catch(() => {}),
            ]);
            sitemapOptDetails.push("✅ Google, Bing e Yandex notificados sobre sitemap");
          } catch { /* */ }
        }
        details.sitemap_optimization = { details: sitemapOptDetails };

        // ═══════════════════════════════════════════
        // STEP 12: Autonomous Noindex Manager v3.6.0
        // Desativa automaticamente: date archives, categorias/tags vazias,
        // author archives, attachment pages, paginated archives
        // ═══════════════════════════════════════════
        if (!hasTimeLeft()) { const s = await savePartialAndFinish("Step 11"); results.push({ project: project.name, status: "partial", summary: s }); continue; }
        console.log(`[SEO Agent] [${project.name}] Step 12: Noindex Manager (${Math.round(elapsedMs()/1000)}s)`);

        let noindexApplied = 0;
        const noindexDetails: string[] = [];

        if (isPlugin && apiKey && baseUrl) {
          try {
            const noindexResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/noindex-manager`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
              body: JSON.stringify({
                targets: [
                  "date_archives",
                  "empty_categories",
                  "empty_tags",
                  "author_archives",
                  "attachment_pages",
                  "paginated_archives",
                ],
              }),
              signal: AbortSignal.timeout(30000),
            });

            if (noindexResp.ok) {
              const noindexData = await noindexResp.json();
              noindexApplied = noindexData.total_applied || 0;

              if (noindexData.actions && Array.isArray(noindexData.actions)) {
                for (const action of noindexData.actions) {
                  if (action.applied > 0) {
                    noindexDetails.push(`✅ ${action.details}`);
                  } else {
                    noindexDetails.push(`ℹ️ ${action.details}`);
                  }
                }
              }

              if (noindexApplied > 0) {
                console.log(`[SEO Agent] [${project.name}] Noindex Manager: ${noindexApplied} changes applied`);
                // Refresh sitemap after noindex changes
                try {
                  await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-sitemap`, {
                    method: "POST",
                    headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
                    body: JSON.stringify({ remove_noindex: true }),
                  });
                  noindexDetails.push("✅ Sitemap atualizado após noindex");
                } catch { /* */ }
              }
            } else {
              noindexDetails.push(`⚠ Noindex Manager endpoint indisponível (${noindexResp.status})`);
            }
          } catch (e) {
            console.log(`[SEO Agent] [${project.name}] Noindex Manager: endpoint unavailable`);
            noindexDetails.push("⚠ Noindex Manager: endpoint não disponível — atualizar plugin");
          }
        }

        details.noindex_manager = { applied: noindexApplied, details: noindexDetails };

        // ═══════════════════════════════════════════
        // STEP 13: VPS Server Health & Bot Accessibility Audit v3.8.0
        // Verifica configurações críticas do servidor VPS para SEO
        // ═══════════════════════════════════════════
        if (!hasTimeLeft()) { const s = await savePartialAndFinish("Step 12"); results.push({ project: project.name, status: "partial", summary: s }); continue; }
        console.log(`[SEO Agent] [${project.name}] Step 13: VPS Server Health Audit (${Math.round(elapsedMs()/1000)}s)`);

        const vpsAuditDetails: string[] = [];
        let vpsScore = 100;
        const siteRoot = baseUrl.replace(/\/blog\/?$/, "");

        // 13a: Check robots.txt — AI bots accessibility
        try {
          const robotsResp = await fetch(`${siteRoot}/robots.txt`, { signal: AbortSignal.timeout(8000) });
          if (robotsResp.ok) {
            const robotsTxt = await robotsResp.text();
            const requiredBots = [
              "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot",
              "PerplexityBot", "Google-Extended", "Bingbot", "Applebot-Extended",
              "Googlebot", "Googlebot-Image", "Googlebot-Video"
            ];
            const blockedBots: string[] = [];
            for (const bot of requiredBots) {
              const botRegex = new RegExp(`User-agent:\\s*${bot}[\\s\\S]*?Disallow:\\s*/\\s*$`, "im");
              if (botRegex.test(robotsTxt)) {
                blockedBots.push(bot);
              }
            }
            if (blockedBots.length > 0) {
              vpsAuditDetails.push(`🔴 P0: ${blockedBots.length} bots bloqueados no robots.txt: ${blockedBots.join(", ")}`);
              vpsScore -= blockedBots.length * 5;
              // Auto-fix via plugin
              if (isPlugin && apiKey) {
                try {
                  await fetch(`${baseUrl}/wp-json/cfrdm/v1/fix-robots-ai-crawlers`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
                    body: JSON.stringify({ bots: blockedBots }),
                  });
                  vpsAuditDetails.push(`✅ Auto-fix: ${blockedBots.length} bots desbloqueados no robots.txt`);
                } catch { /* */ }
              }
            } else {
              vpsAuditDetails.push("✅ robots.txt: todos os bots de IA e busca permitidos");
            }
            // Check Sitemap reference in robots.txt
            if (!robotsTxt.toLowerCase().includes("sitemap:")) {
              vpsAuditDetails.push("⚠ robots.txt não contém referência ao sitemap");
              vpsScore -= 5;
            }
          } else {
            vpsAuditDetails.push(`⚠ robots.txt inacessível (status ${robotsResp.status})`);
            vpsScore -= 10;
          }
        } catch { vpsAuditDetails.push("🔴 robots.txt: timeout ou erro de conexão"); vpsScore -= 15; }

        // 13b: Check llms.txt accessibility
        try {
          const llmsResp = await fetch(`${siteRoot}/llms.txt`, { signal: AbortSignal.timeout(8000) });
          if (llmsResp.ok) {
            const llmsContent = await llmsResp.text();
            if (llmsContent.length > 100) {
              vpsAuditDetails.push(`✅ llms.txt acessível (${llmsContent.length} chars)`);
            } else {
              vpsAuditDetails.push("⚠ llms.txt existe mas conteúdo muito curto");
              vpsScore -= 5;
            }
          } else {
            vpsAuditDetails.push("⚠ llms.txt não encontrado — IA discovery comprometida");
            vpsScore -= 10;
            // Auto-fix: force regenerate via plugin
            if (isPlugin && apiKey) {
              try {
                await fetch(`${baseUrl}/wp-json/cfrdm/v1/llms-txt-regenerate`, {
                  method: "POST",
                  headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
                });
                vpsAuditDetails.push("✅ llms.txt regeneração solicitada");
              } catch { /* */ }
            }
          }
        } catch { vpsAuditDetails.push("⚠ llms.txt: timeout"); vpsScore -= 5; }

        // 13c: HTTPS enforcement & SSL
        try {
          const httpsResp = await fetch(siteRoot, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(8000) });
          const headers = Object.fromEntries(httpsResp.headers.entries());

          // Check HTTPS
          if (!siteRoot.startsWith("https://")) {
            vpsAuditDetails.push("🔴 P0: Site não usa HTTPS — penalização severa no Google");
            vpsScore -= 20;
          } else {
            vpsAuditDetails.push("✅ HTTPS ativo");
          }

          // Check HTTP→HTTPS redirect
          const httpUrl = siteRoot.replace("https://", "http://");
          try {
            const httpResp = await fetch(httpUrl, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
            if (httpResp.status === 301 || httpResp.status === 302) {
              vpsAuditDetails.push("✅ Redirect HTTP→HTTPS configurado");
            } else {
              vpsAuditDetails.push("⚠ HTTP não redireciona para HTTPS");
              vpsScore -= 10;
            }
          } catch { /* behind firewall */ }

          // Check caching headers
          if (headers["cache-control"]) {
            vpsAuditDetails.push(`✅ Cache-Control: ${headers["cache-control"]}`);
          } else {
            vpsAuditDetails.push("⚠ Cache-Control ausente — performance comprometida em VPS");
            vpsScore -= 5;
          }

          // Check GZIP/Brotli
          const encoding = headers["content-encoding"] || "";
          if (encoding.includes("gzip") || encoding.includes("br")) {
            vpsAuditDetails.push(`✅ Compressão ativa: ${encoding}`);
          } else {
            vpsAuditDetails.push("⚠ Compressão (GZIP/Brotli) não detectada — ativar no VPS");
            vpsScore -= 5;
          }

          // Check X-Robots-Tag
          if (headers["x-robots-tag"]) {
            if (headers["x-robots-tag"].includes("noindex")) {
              vpsAuditDetails.push("🔴 P0: X-Robots-Tag: noindex detectado no servidor!");
              vpsScore -= 25;
            } else {
              vpsAuditDetails.push("✅ X-Robots-Tag permitindo indexação");
            }
          }

          // Check security headers
          if (headers["strict-transport-security"]) {
            vpsAuditDetails.push("✅ HSTS ativo");
          } else {
            vpsAuditDetails.push("⚠ HSTS não configurado no VPS");
            vpsScore -= 3;
          }

          // Check server response time
          const t0 = Date.now();
          await fetch(siteRoot, { method: "HEAD", signal: AbortSignal.timeout(10000) });
          const ttfb = Date.now() - t0;
          if (ttfb > 3000) {
            vpsAuditDetails.push(`🔴 TTFB muito alto: ${ttfb}ms (ideal <800ms)`);
            vpsScore -= 15;
          } else if (ttfb > 1500) {
            vpsAuditDetails.push(`⚠ TTFB alto: ${ttfb}ms (ideal <800ms)`);
            vpsScore -= 5;
          } else {
            vpsAuditDetails.push(`✅ TTFB: ${ttfb}ms`);
          }
        } catch { vpsAuditDetails.push("🔴 Servidor inacessível — verificar VPS"); vpsScore -= 30; }

        // 13d: Check IndexNow key accessibility
        try {
          const indexNowResp = await fetch(`${siteRoot}/indexnow-key.txt`, { signal: AbortSignal.timeout(5000) });
          if (indexNowResp.ok) {
            vpsAuditDetails.push("✅ IndexNow key acessível");
          } else {
            vpsAuditDetails.push("⚠ IndexNow key não encontrada — indexação instantânea comprometida");
            vpsScore -= 5;
          }
        } catch { /* */ }

        // 13e: Check plugin REST API accessibility
        if (isPlugin && apiKey) {
          try {
            const pluginResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/diagnostics`, {
              headers: { "X-CFRDM-API-Key": apiKey },
              signal: AbortSignal.timeout(10000),
            });
            if (pluginResp.ok) {
              const diag = await pluginResp.json();
              vpsAuditDetails.push(`✅ Plugin REST API ativo (v${diag.plugin_version || "?"})`);
              if (diag.plugin_version && diag.plugin_version !== PLUGIN_VERSION) {
                vpsAuditDetails.push(`⚠ Plugin desatualizado: ${diag.plugin_version} → ${PLUGIN_VERSION}`);
              }
            } else {
              vpsAuditDetails.push(`⚠ Plugin REST API erro (${pluginResp.status})`);
              vpsScore -= 10;
            }
          } catch {
            vpsAuditDetails.push("🔴 Plugin REST API inacessível — verificar configuração do VPS");
            vpsScore -= 15;
          }
        }

        vpsScore = Math.max(0, Math.min(100, vpsScore));
        details.vps_server_audit = { score: vpsScore, details: vpsAuditDetails, checks_performed: vpsAuditDetails.length };

        // ═══════════════════════════════════════════
        // STEP 14: Summary
        // ═══════════════════════════════════════════
        const summaryParts = [];
        if (metaIssuesFixed > 0) summaryParts.push(`${metaIssuesFixed} metas corrigidos`);
        if (metaIssuesFound > 0 && metaIssuesFixed === 0) summaryParts.push(`${metaIssuesFound} issues encontrados`);
        if (linksSuggested > 0) summaryParts.push(`${linksSuggested} links sugeridos`);
        if (linksApplied > 0) summaryParts.push(`${linksApplied} links aplicados (verificados)`);
        if (indexingSubmitted > 0) summaryParts.push(`${indexingSubmitted} URLs indexadas`);
        if (sitemapUpdated) summaryParts.push("sitemap atualizado");
        if (aiDiscoveryResult.actions?.length > 0) summaryParts.push(`${aiDiscoveryResult.actions.length} otimizações IA discovery`);
        if (auditResult.score > 0) summaryParts.push(`audit score: ${auditResult.score}/100`);
        if (auditResult.issues_fixed > 0) summaryParts.push(`${auditResult.issues_fixed} problemas corrigidos`);
        if (autonomousResult.applied > 0) summaryParts.push(`${autonomousResult.applied} correções autônomas (${autonomousResult.types.join(", ")})`);
        if (autonomousResult.redirects_created > 0) summaryParts.push(`${autonomousResult.redirects_created} redirects criados`);
        if (crossLinkResult.cross_links_created > 0) summaryParts.push(`${crossLinkResult.cross_links_created} cross-links criados (verificados)`);
        if (crossLinkResult.articles_enriched > 0) summaryParts.push(`${crossLinkResult.articles_enriched} artigos enriquecidos`);
        if (brokenLinksResult.broken_found > 0) summaryParts.push(`🔴 ${brokenLinksResult.broken_found} links quebrados (404)`);
        if (brokenLinksFixed > 0) summaryParts.push(`✅ ${brokenLinksFixed} 404s corrigidos com redirects 301`);
        if (redirectsAutoCreated > 0) summaryParts.push(`${redirectsAutoCreated} redirects auto-criados`);
        if (brokenLinksResult.redirects_found > 0) summaryParts.push(`⚠️ ${brokenLinksResult.redirects_found} cadeias de redirect`);
        if (duplicateResult.duplicates_found > 0) summaryParts.push(`${duplicateResult.duplicates_found} conteúdos duplicados`);
        if (duplicateResult.thin_pages > 0) summaryParts.push(`${duplicateResult.thin_pages} páginas finas (<300p)`);
        if (metadataAudit.missing_titles > 0) summaryParts.push(`${metadataAudit.missing_titles} títulos ausentes`);
        if (metadataAudit.missing_descriptions > 0) summaryParts.push(`${metadataAudit.missing_descriptions} meta desc ausentes`);
        if (bulkMetasFixed > 0) summaryParts.push(`✅ ${bulkMetasFixed} títulos/metas corrigidos via IA`);
        if (redirectAudit.chains > 0) summaryParts.push(`${redirectAudit.chains} redirect chains`);
        if (redirectAudit.loops > 0) summaryParts.push(`🔴 ${redirectAudit.loops} redirect loops`);
        if (noindexApplied > 0) summaryParts.push(`🚫 ${noindexApplied} páginas noindex (archives/vazias)`);
        if (vpsScore < 80) summaryParts.push(`🖥️ VPS Score: ${vpsScore}/100`);
        if (vpsScore >= 80) summaryParts.push(`✅ VPS: ${vpsScore}/100`);

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
            title: `🤖 Agente SEO v${PLUGIN_VERSION}`,
            message: summary,
            type: "seo_agent",
            metadata: { run_id: runId, project_id: project.id, project_name: project.name },
          });

        // ═══ P0 Critical Issue Notifications ═══
        const p0Issues = (auditResult.issues || []).filter((i: any) => i.priority === "P0");
        // Add broken links as P0
        if (brokenLinksResult.broken_found > 0) {
          p0Issues.push({
            id: "BRK-001",
            title: `${brokenLinksResult.broken_found} links quebrados (404)`,
            fix_instruction: "Criar redirects 301 para as URLs quebradas ou corrigir os links.",
          });
        }
        if (redirectAudit.loops > 0) {
          p0Issues.push({
            id: "RDR-001",
            title: `${redirectAudit.loops} redirect loops detectados`,
            fix_instruction: "Corrigir loops de redirecionamento que causam erro infinito.",
          });
        }

        if (p0Issues.length > 0) {
          const p0Titles = p0Issues.map((i: any) => i.title).join("; ");
          await supabase
            .from("cron_notifications")
            .insert({
              user_id: project.user_id,
              title: "🚨 ALERTA CRÍTICO — Problemas P0 Detectados",
              message: `${p0Issues.length} problema(s) crítico(s) em ${project.name}: ${p0Titles}`,
              type: "audit_critical",
              metadata: {
                run_id: runId,
                project_id: project.id,
                project_name: project.name,
                p0_count: p0Issues.length,
                p0_issues: p0Issues.map((i: any) => ({ id: i.id, title: i.title, fix: i.fix_instruction })),
              },
            });
          console.log(`[SEO Agent] [${project.name}] 🚨 ${p0Issues.length} P0 critical notifications sent`);
        }

        results.push({ project: project.name, status: "completed", summary });
        console.log(`[SEO Agent v200%] [${project.name}] Completed: ${summary}`);

        // ═══════════════════════════════════════════
        // INTER-AGENT COORDINATION: Fire-and-forget OrphanFixer
        // ═══════════════════════════════════════════
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
          fetch(`${supabaseUrl}/functions/v1/auto-fix-orphans`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
            body: JSON.stringify({ project_id: project.id, user_id: project.user_id, triggered_by: "seo-agent-v200" }),
          }).catch(() => {}); // fire-and-forget
          console.log(`[SEO Agent v200%] [${project.name}] 🔗 Triggered OrphanFixer (fire-and-forget)`);
        } catch { /* non-critical */ }

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

  // 2) AI Fallback: Get ALL articles with issues and fix them
  const { data: articles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, seo_score, semantic_summary")
    .eq("project_id", project.id)
    .order("seo_score", { ascending: true })
    .limit(1000);

  if (!articles || articles.length === 0) {
    return { found: 0, fixed: 0, issues: [], fixes_applied: [] };
  }

  const articlesWithIssues: any[] = [];
  for (const article of articles) {
    const articleIssues: string[] = [];
    if (article.wp_post_title && article.wp_post_title.length > 70) articleIssues.push("title_too_long");
    if (article.wp_post_title && article.wp_post_title.length < 20) articleIssues.push("title_too_short");
    if (!article.primary_keyword) articleIssues.push("no_keyword");
    if ((article.seo_score || 0) < 40) articleIssues.push("low_seo_score");
    if (articleIssues.length > 0) {
      articlesWithIssues.push({ ...article, issues: articleIssues });
      found++;
      issues.push(`${articleIssues.join(", ")}: "${article.wp_post_title}"`);
    }
  }

  if (articlesWithIssues.length === 0) {
    return { found: 0, fixed: 0, issues: [], fixes_applied: [] };
  }

  const batchToFix = articlesWithIssues.slice(0, 500);
  
  try {
    const articlesList = batchToFix.map(a => 
      `- ID: ${a.wp_post_id} | Título: "${a.wp_post_title}" | Keyword: ${a.primary_keyword || "N/A"} | Score: ${a.seo_score || 0} | Issues: ${a.issues.join(", ")}`
    ).join("\n");

    const projectConfig = {
      nicho: project.nicho || undefined,
      compliance_rules: project.compliance_rules || undefined,
      empresa_nome: project.empresa_nome || undefined,
      empresa_telefone: project.empresa_telefone || undefined,
      empresa_endereco: project.empresa_endereco || undefined,
      empresa_whatsapp: project.empresa_whatsapp || undefined,
      social_instagram: project.social_instagram || undefined,
      social_youtube: project.social_youtube || undefined,
      social_linkedin: project.social_linkedin || undefined,
      social_twitter: project.social_twitter || undefined,
      social_tiktok: project.social_tiktok || undefined,
      social_google_maps: project.social_google_maps || undefined,
      social_linktree: project.social_linktree || undefined,
      cta_comunidade: project.cta_comunidade || undefined,
      cta_conclusao: project.cta_conclusao || undefined,
      cta_leads: project.cta_leads || undefined,
    };

    const orchestration = orchestrate(project.name, project.domain || '', projectConfig);
    const dnaEntry = resolveVernizDNA(orchestration.nichoDetectado.nicho, orchestration.gatilho.gatilho);

    const prompt = `Analise estes artigos com problemas de SEO e gere correções otimizadas:

${articlesList}

CONTEXTO DO PROJETO:
- Nicho: ${orchestration.nichoDetectado.nicho} | Compliance: ${orchestration.nichoDetectado.compliance}
${dnaEntry ? `- Tom: "${dnaEntry.tone}" | Vocabulário: ${dnaEntry.vocabulary.join(', ')}` : ''}
${project.empresa_nome ? `- Empresa: ${project.empresa_nome}` : ''}

Para cada artigo, gere:
1. meta_title otimizado (max 60 chars, incluir keyword, tom "${dnaEntry?.tone || 'profissional'}")
2. meta_description otimizada (145-160 chars, keyword nos primeiros 60 chars, CTA implícito)
3. focus_keyword sugerida (se ausente)

REGRAS INEGOCIÁVEIS:
- Meta-description SEMPRE entre 145-160 caracteres
- Keyword nos primeiros 60 chars da meta-description
- Flesch mínimo 60: vocabulário simples, frases curtas
- Adaptar tom ao nicho ${orchestration.nichoDetectado.nicho}
${orchestration.nichoDetectado.disclaimers.length > 0 ? `- Disclaimers obrigatórios: ${orchestration.nichoDetectado.disclaimers[0]}` : ''}

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
      { role: "system", content: `Você é um especialista SEO brasileiro seguindo a filosofia "Madeira Sem Verniz": linguagem simples, acessível, Flesch mínimo 60. Gere metas otimizadas para máximo CTR e ranqueamento. Meta-descriptions SEMPRE 145-160 caracteres. Responda APENAS com JSON válido.` },
      { role: "user", content: prompt },
    ], { maxTokens: 4000, temperature: 0.3 });

    const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const fixData = JSON.parse(jsonStr);

    if (fixData.fixes && Array.isArray(fixData.fixes) && baseUrl && isPlugin && apiKey) {
      for (const fix of fixData.fixes) {
        try {
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
            const updateData = await updateResp.json();
            if (updateData.success !== false && updateData.error === undefined) {
              fixed++;
              fixesApplied.push(`Post ${fix.wp_post_id}: meta atualizada (verificado)`);

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
              console.warn(`[SEO Agent] Post ${fix.wp_post_id}: API returned OK but no confirmation — NOT counted as fixed`);
            }
          } else {
            const wpUpdateResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${fix.wp_post_id}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CFRDM-API-Key": apiKey,
              },
              body: JSON.stringify({
                meta: {
                  rank_math_title: fix.meta_title,
                  rank_math_description: fix.meta_description,
                  rank_math_focus_keyword: fix.focus_keyword,
                  _yoast_wpseo_title: fix.meta_title,
                  _yoast_wpseo_metadesc: fix.meta_description,
                  _yoast_wpseo_focuskw: fix.focus_keyword,
                },
              }),
            });

            if (wpUpdateResp.ok) {
              const wpData = await wpUpdateResp.json();
              if (wpData.id) {
                fixed++;
                fixesApplied.push(`Post ${fix.wp_post_id}: meta atualizada via WP API (verificado)`);
              } else {
                console.warn(`[SEO Agent] Post ${fix.wp_post_id}: WP API response missing id — NOT counted`);
              }
            } else {
              console.error(`[SEO Agent] Post ${fix.wp_post_id}: both plugin and WP API failed (${wpUpdateResp.status})`);
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
// STEP 2: Internal Linking - Suggest + Apply (WITH VERIFICATION)
// CRITICAL FIX v3.4.9: Now verifies links are ACTUALLY in content
// ═══════════════════════════════════════════════════════════
async function analyzeAndApplyLinks(
  supabase: ReturnType<typeof createClient>,
  orchestrator: ReturnType<typeof getOrchestrator>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ suggested: number; applied: number; verified: number; rejected_false_positive: number; orphans: number; applied_details: string[] }> {
  const appliedDetails: string[] = [];
  let rejectedFalsePositive = 0;
  let verified = 0;

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
      .limit(400);

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
              source_post_id: link.source_wp_post_id,
              post_id: link.source_wp_post_id,
              anchor_text: link.anchor_text,
              target_url: link.target_url,
            }),
          });

          if (applyResp.ok) {
            const applyData = await applyResp.json();
            if (applyData.success || applyData.applied) {
              // ═══ CRITICAL v3.4.9: VERIFY the link was ACTUALLY inserted ═══
              const isVerified = await verifyLinkInContent(baseUrl, apiKey, link.source_wp_post_id, link.target_url, project.name);
              if (isVerified) {
                totalApplied++;
                verified++;
                appliedDetails.push(`✅ Link VERIFICADO: "${link.anchor_text}" → ${link.target_url} (post ${link.source_wp_post_id})`);
                await supabase
                  .from("internal_link_suggestions")
                  .update({ status: "applied", applied_at: new Date().toISOString() })
                  .eq("id", link.id);
              } else {
                // FALSE POSITIVE: Plugin said success but link NOT in content
                rejectedFalsePositive++;
                console.warn(`[SEO Agent] [${project.name}] ❌ FALSE POSITIVE: Post ${link.source_wp_post_id} - plugin said applied but link NOT found in content`);
                await supabase
                  .from("internal_link_suggestions")
                  .update({ status: "rejected", rejected_reason: "false_positive: link not found in content after apply" })
                  .eq("id", link.id);
                appliedDetails.push(`❌ FALSO POSITIVO: "${link.anchor_text}" em post ${link.source_wp_post_id} — link NÃO encontrado no conteúdo`);
              }
            } else {
              await supabase
                .from("internal_link_suggestions")
                .update({ status: "rejected", rejected_reason: applyData.reason || applyData.message || "anchor not found in content" })
                .eq("id", link.id);
            }
          } else if (applyResp.status === 422) {
            const errBody = await applyResp.json().catch(() => ({}));
            const reason = errBody.reason || errBody.message || "content_unsupported";
            console.warn(`[SEO Agent] Post ${link.source_wp_post_id} returned 422: ${reason}`);
            await supabase
              .from("internal_link_suggestions")
              .update({ status: "rejected", rejected_reason: `422: ${reason}` })
              .eq("id", link.id);
          }
        } catch (e) {
          console.error(`[SEO Agent] Apply link failed:`, e);
        }
      }
    }
  }

  // 2) Find ALL orphan articles and generate new suggestions
  const { data: orphans } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, primary_keyword, topic_cluster, internal_links_count")
    .eq("project_id", project.id)
    .lte("internal_links_count", 0)
    .limit(1000);

  if (!orphans || orphans.length === 0) {
    return { suggested: 0, applied: totalApplied, verified, rejected_false_positive: rejectedFalsePositive, orphans: 0, applied_details: appliedDetails };
  }

  const { data: allArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, primary_keyword, topic_cluster, semantic_summary")
    .eq("project_id", project.id)
    .limit(1000);

  if (!allArticles || allArticles.length < 2) {
    return { suggested: 0, applied: totalApplied, verified, rejected_false_positive: rejectedFalsePositive, orphans: orphans.length, applied_details: appliedDetails };
  }

  let totalSuggested = 0;

  try {
    const articleList = allArticles
      .map(a => `- [${a.wp_post_title}](${a.wp_post_url}) | kw: ${a.primary_keyword || "N/A"} | cluster: ${a.topic_cluster || "N/A"}`)
      .join("\n");

    const orphanBatch = orphans.slice(0, 200);

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
      ], { maxTokens: 2000, temperature: 0.2 });

      console.log(`[SEO Agent] [${project.name}] Link AI response for "${orphan.wp_post_title}" (${aiContent.length} chars)`);

      try {
        let jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
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
                  source_post_id: sourceArticle.wp_post_id,
                  post_id: sourceArticle.wp_post_id,
                  anchor_text: suggestion.anchor_text,
                  target_url: suggestion.target_url,
                }),
              });

              if (applyResp.ok) {
                const applyData = await applyResp.json();
                if (applyData.success || applyData.applied) {
                  // ═══ CRITICAL v3.4.9: VERIFY ═══
                  const isVerified = await verifyLinkInContent(baseUrl, apiKey, sourceArticle.wp_post_id, suggestion.target_url, project.name);
                  if (isVerified) {
                    totalApplied++;
                    verified++;
                    appliedDetails.push(`✅ Auto-link VERIFICADO: "${suggestion.anchor_text}" em post ${sourceArticle.wp_post_id}`);
                  } else {
                    rejectedFalsePositive++;
                    console.warn(`[SEO Agent] [${project.name}] ❌ FALSE POSITIVE auto-link: post ${sourceArticle.wp_post_id}`);
                    appliedDetails.push(`❌ FALSO POSITIVO auto-link: "${suggestion.anchor_text}" em post ${sourceArticle.wp_post_id}`);
                  }
                }
              } else if (applyResp.status === 422) {
                console.warn(`[SEO Agent] Post ${sourceArticle.wp_post_id} 422 — content unsupported for link insertion`);
              }
            } catch { /* continue */ }
          }
        }
      } catch (parseErr) {
        console.error(`[SEO Agent] [${project.name}] Link suggestion parse failed for orphan "${orphan.wp_post_title}":`, parseErr instanceof Error ? parseErr.message : parseErr);
        console.error(`[SEO Agent] [${project.name}] Raw AI response (first 500 chars):`, aiContent?.substring(0, 500));
      }
    }
  } catch (e) {
    console.error(`[SEO Agent] [${project.name}] Link analysis error:`, e);
  }

  return { suggested: totalSuggested, applied: totalApplied, verified, rejected_false_positive: rejectedFalsePositive, orphans: orphans.length, applied_details: appliedDetails };
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
    const { data: allArticlesIdx } = await supabase
      .from("wordpress_article_index")
      .select("wp_post_url")
      .eq("project_id", project.id)
      .eq("wp_post_status", "publish")
      .limit(1000);

    const urls = allArticlesIdx?.map(a => a.wp_post_url).filter(Boolean) || [];

    if (urls.length > 0) {
      try {
        const indexNowResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CFRDM-API-Key": apiKey,
          },
          body: JSON.stringify({ urls: urls.slice(0, 1000) }),
        });

        if (indexNowResp.ok) {
          const indexData = await indexNowResp.json();
          submitted = indexData.submitted || 0;
          if (submitted > 0) {
            detailsList.push(`IndexNow: ${submitted} URLs submetidas`);
          } else {
            detailsList.push(`IndexNow: plugin retornou sem submissões efetivas`);
          }
        } else {
          const directResult = await submitDirectIndexNow(baseUrl, urls.slice(0, 50), apiKey);
          submitted = directResult;
          detailsList.push(`IndexNow direto: ${submitted} URLs submetidas`);
        }
      } catch (e) {
        const directResult = await submitDirectIndexNow(baseUrl, urls.slice(0, 50), apiKey);
        submitted = directResult;
        detailsList.push(`IndexNow fallback: ${submitted} URLs`);
      }
    }

    try {
      const sitemapResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-sitemap`, {
        method: "POST",
        headers: { "X-CFRDM-API-Key": apiKey },
      });
      sitemapRefreshed = sitemapResp.ok;
      if (sitemapRefreshed) detailsList.push("Sitemap atualizado");
    } catch { /* ignore */ }

    const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
    let detectedSitemapUrl = `${siteRoot}/wp-sitemap.xml`;
    try {
      for (const candidate of [`${siteRoot}/wp-sitemap.xml`, `${siteRoot}/sitemap_index.xml`, `${siteRoot}/sitemap.xml`]) {
        try {
          const checkResp = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          if (checkResp.ok) {
            detectedSitemapUrl = candidate;
            break;
          }
        } catch { /* try next */ }
      }
    } catch { /* use default */ }

    try {
      await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(detectedSitemapUrl)}`, { method: "GET" });
      googlePinged = true;
      detailsList.push(`Google sitemap pinged (${detectedSitemapUrl})`);
    } catch { /* ignore */ }

    try {
      await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(detectedSitemapUrl)}`, { method: "GET" });
      detailsList.push("Bing sitemap pinged");
    } catch { /* ignore */ }

    if (isPlugin && apiKey) {
      try {
        const gscIndexResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/google-indexing/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CFRDM-API-Key": apiKey,
          },
          body: JSON.stringify({}),
        });
        if (gscIndexResp.ok) {
          const gscData = await gscIndexResp.json();
          if (gscData.results?.submitted > 0) {
            submitted += gscData.results.submitted;
            detailsList.push(`Google Indexing API: ${gscData.results.submitted} URLs submetidas (quota restante: ${gscData.quota_remaining})`);
          }
        }
      } catch {
        detailsList.push("Google Indexing API: indisponível (GSC OAuth não configurado)");
      }
    }

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
// Direct IndexNow API (fallback)
// ═══════════════════════════════════════════════════════════
async function submitDirectIndexNow(siteUrl: string, urls: string[], apiKey?: string): Promise<number> {
  if (urls.length === 0) return 0;

  const host = new URL(siteUrl).hostname;
  let key = "";
  if (apiKey) {
    try {
      const keyResp = await fetch(`${siteUrl}/wp-json/cfrdm/v1/info`, {
        headers: { "X-CFRDM-API-Key": apiKey },
        signal: AbortSignal.timeout(5000),
      });
      if (keyResp.ok) {
        const info = await keyResp.json();
        key = info.indexnow_key || "";
      }
    } catch { /* ignore */ }
  }
  
  if (!key) {
    key = Array.from(host).reduce((acc, c) => acc + c.charCodeAt(0).toString(16), "indexnow").slice(0, 32);
  }

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
      console.log(`[IndexNow Direct] Success: ${urls.length} URLs submitted for ${host}`);
      return urls.length;
    }
    console.warn(`[IndexNow Direct] Status ${status} for ${host}`);
  } catch (e) {
    console.error("[IndexNow Direct] Error:", e);
  }

  return 0;
}

// ═══════════════════════════════════════════════════════════
// STEP 4: AI Discovery Optimization
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

  try {
    const llmsResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-llms`, {
      method: "POST",
      headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ include_full_catalog: true }),
    });
    if (llmsResp.ok) { llmsTxtRefreshed = true; actions.push("llms.txt atualizado para AI crawlers"); }
  } catch { /* ignore */ }

  try {
    const headersResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/set-ai-headers`, {
      method: "POST",
      headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        headers: { "X-Robots-Tag": "all", "X-Content-Type-Options": "nosniff" },
        ai_meta_tags: [
          { name: "robots", content: "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" },
          { name: "googlebot", content: "index, follow" },
          { name: "bingbot", content: "index, follow" },
        ],
      }),
    });
    if (headersResp.ok) { headersSet = true; actions.push("Headers AI-friendly configurados"); }
  } catch { /* ignore */ }

  try {
    const schemaResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/validate-schemas`, {
      method: "POST",
      headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ auto_fix: true, include_faq: true, include_howto: true }),
    });
    if (schemaResp.ok) {
      const schemaData = await schemaResp.json();
      schemaEnhanced = schemaData.fixed > 0 || schemaData.enhanced > 0;
      if (schemaEnhanced) actions.push(`Schema.org: ${schemaData.fixed || 0} corrigidos, ${schemaData.enhanced || 0} aprimorados`);
    }
  } catch { /* ignore */ }

  const siteRoot2 = baseUrl.replace(/\/blog\/?$/, "");
  let sitemapUrl2 = `${siteRoot2}/wp-sitemap.xml`;
  for (const candidate of [`${siteRoot2}/wp-sitemap.xml`, `${siteRoot2}/sitemap_index.xml`, `${siteRoot2}/sitemap.xml`]) {
    try {
      const r = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (r.ok) { sitemapUrl2 = candidate; break; }
    } catch { /* next */ }
  }
  const llmsUrl = `${siteRoot2}/llms.txt`;

  try { await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl2)}`); actions.push("Bing pinged (ChatGPT source)"); } catch { /* ignore */ }
  try { await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl2)}`); actions.push("Google pinged (Gemini source)"); } catch { /* ignore */ }
  try { await fetch(`https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(sitemapUrl2)}`); actions.push("Yandex pinged"); } catch { /* ignore */ }

  try {
    const host = new URL(baseUrl).hostname;
    const key = Array.from(host).reduce((acc, c) => acc + c.charCodeAt(0).toString(16), "indexnow").slice(0, 32);
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: [`https://${host}/`, `https://${host}/llms.txt`, sitemapUrl2] }),
    });
    actions.push("IndexNow: homepage + llms.txt submetidos");
  } catch { /* ignore */ }

  try {
    const checkResp = await fetch(llmsUrl, { method: "HEAD" });
    if (checkResp.ok) actions.push("llms.txt acessível ✓");
    else actions.push("⚠ llms.txt não acessível - verificar plugin");
  } catch { actions.push("⚠ llms.txt check falhou"); }

  return { actions, llmsTxtRefreshed, schemaEnhanced, headersSet };
}

// ═══════════════════════════════════════════════════════════
// STEP 5: Full Technical Audit (v3.4.9 enhanced)
// ═══════════════════════════════════════════════════════════
interface AuditIssue {
  id: string;
  priority: "P0" | "P1" | "P2" | "P3";
  category: string;
  title: string;
  description: string;
  impact: string;
  fix_instruction: string;
  auto_fixed: boolean;
}

async function runFullTechnicalAudit(
  supabase: ReturnType<typeof createClient>,
  orchestrator: ReturnType<typeof getOrchestrator>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{
  score: number;
  issues: AuditIssue[];
  issues_found: number;
  issues_fixed: number;
  categories: Record<string, { score: number; issues: number; fixed: number }>;
}> {
  const issues: AuditIssue[] = [];
  let totalFixed = 0;
  const categories: Record<string, { score: number; issues: number; fixed: number }> = {
    indexing: { score: 100, issues: 0, fixed: 0 },
    schema: { score: 100, issues: 0, fixed: 0 },
    performance: { score: 100, issues: 0, fixed: 0 },
    content: { score: 100, issues: 0, fixed: 0 },
    geo: { score: 100, issues: 0, fixed: 0 },
    links: { score: 100, issues: 0, fixed: 0 },
  };

  // ═══ AUDIT 1: Indexing Health ═══
  if (baseUrl) {
    try {
      const robotsResp = await fetch(`${baseUrl.replace(/\/blog\/?$/, "")}/robots.txt`, { signal: AbortSignal.timeout(8000) });
      if (!robotsResp.ok) {
        issues.push({ id: "IDX-001", priority: "P0", category: "indexing", title: "robots.txt ausente ou inacessível", description: "O arquivo robots.txt não foi encontrado.", impact: "Crawlers podem ter dificuldade em rastrear o site corretamente.", fix_instruction: "Criar robots.txt na raiz com User-agent: * e Sitemap.", auto_fixed: false });
        categories.indexing.score -= 25;
        categories.indexing.issues++;
      } else {
        const robotsContent = await robotsResp.text();
        const robotsLines = robotsContent.split('\n').map(l => l.trim().toLowerCase());
        const blockedCrawlers = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"].filter(bot => {
          const botLower = bot.toLowerCase();
          const botLineIdx = robotsLines.findIndex(l => l === `user-agent: ${botLower}`);
          if (botLineIdx === -1) return false;
          for (let i = botLineIdx + 1; i < robotsLines.length; i++) {
            if (robotsLines[i].startsWith('user-agent:')) break;
            if (robotsLines[i] === 'disallow: /') return true;
          }
          return false;
        });
        if (blockedCrawlers.length > 0) {
          issues.push({ id: "IDX-002", priority: "P1", category: "indexing", title: `${blockedCrawlers.length} crawlers de IA bloqueados no robots.txt`, description: `Crawlers bloqueados: ${blockedCrawlers.join(", ")}`, impact: "Conteúdo não aparecerá em respostas de IAs generativas.", fix_instruction: "Remover regras de Disallow para crawlers de IA estratégicos.", auto_fixed: false });
          categories.indexing.score -= 10 * blockedCrawlers.length;
          categories.indexing.issues++;

          if (isPlugin && apiKey) {
            try {
              const fixResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/fix-ai-crawlers`, { method: "POST", headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" } });
              if (fixResp.ok) {
                const fixData = await fixResp.json();
                if (fixData.unblocked > 0 || fixData.fixed > 0) {
                  issues[issues.length - 1].auto_fixed = true;
                  issues[issues.length - 1].description += ` → Auto-fix: ${fixData.message || fixData.unblocked + ' crawlers desbloqueados'}`;
                  totalFixed++;
                  categories.indexing.fixed++;
                  categories.indexing.score += 10 * blockedCrawlers.length;
                }
              }
            } catch { /* plugin endpoint unavailable */ }
          }
        }
        if (!robotsContent.toLowerCase().includes("sitemap:")) {
          issues.push({ id: "IDX-003", priority: "P2", category: "indexing", title: "Referência ao sitemap ausente no robots.txt", description: "robots.txt não contém diretiva Sitemap.", impact: "Crawlers podem demorar mais para descobrir todas as páginas.", fix_instruction: "Adicionar 'Sitemap: https://dominio/sitemap_index.xml' ao robots.txt.", auto_fixed: false });
          categories.indexing.score -= 10;
          categories.indexing.issues++;
        }
      }
    } catch { /* timeout */ }

    // Check sitemap
    try {
      const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
      let sitemapFound = false;
      let lastStatus = 0;
      for (const sitemapUrl of [`${siteRoot}/wp-sitemap.xml`, `${siteRoot}/sitemap_index.xml`, `${siteRoot}/sitemap.xml`]) {
        try {
          const sitemapResp = await fetch(sitemapUrl, { signal: AbortSignal.timeout(8000) });
          lastStatus = sitemapResp.status;
          if (sitemapResp.ok) { sitemapFound = true; break; }
        } catch { /* try next */ }
      }
      if (!sitemapFound) {
        issues.push({ id: "IDX-004", priority: "P0", category: "indexing", title: "Sitemap XML inacessível", description: `Nenhum sitemap encontrado. Último status: ${lastStatus}`, impact: "Motores de busca não conseguem descobrir páginas eficientemente.", fix_instruction: "Verificar se o WordPress core sitemap está habilitado ou se plugin de SEO está gerando sitemap.", auto_fixed: false });
        categories.indexing.score -= 30;
        categories.indexing.issues++;

        if (isPlugin && apiKey) {
          try {
            const fixResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-sitemap`, { method: "POST", headers: { "X-CFRDM-API-Key": apiKey } });
            if (fixResp.ok) {
              let sitemapVerified = false;
              for (const candidate of [`${siteRoot}/wp-sitemap.xml`, `${siteRoot}/sitemap_index.xml`, `${siteRoot}/sitemap.xml`]) {
                try { const vr = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(5000) }); if (vr.ok) { sitemapVerified = true; break; } } catch { /* next */ }
              }
              if (sitemapVerified) { issues[issues.length - 1].auto_fixed = true; totalFixed++; categories.indexing.fixed++; categories.indexing.score += 20; }
            }
          } catch { /* */ }
        }
      }
    } catch { /* timeout */ }

    // Check llms.txt
    try {
      const llmsResp = await fetch(`${baseUrl.replace(/\/blog\/?$/, "")}/llms.txt`, { signal: AbortSignal.timeout(5000) });
      if (!llmsResp.ok) {
        issues.push({ id: "IDX-005", priority: "P1", category: "geo", title: "llms.txt ausente", description: "Arquivo llms.txt não encontrado na raiz do site.", impact: "IAs generativas têm dificuldade em descobrir conteúdo.", fix_instruction: "Ativar geração de llms.txt no plugin.", auto_fixed: false });
        categories.geo.score -= 20;
        categories.geo.issues++;

        if (isPlugin && apiKey) {
          try {
            const fixResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-llms`, { method: "POST", headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ force_enable: true }) });
            if (fixResp.ok) {
              try {
                const verifyResp = await fetch(`${baseUrl.replace(/\/blog\/?$/, "")}/llms.txt`, { signal: AbortSignal.timeout(5000) });
                if (verifyResp.ok) { issues[issues.length - 1].auto_fixed = true; totalFixed++; categories.geo.fixed++; categories.geo.score += 15; }
              } catch { /* */ }
            }
          } catch { /* */ }
        }
      }
    } catch { /* timeout */ }

    if (!baseUrl.startsWith("https")) {
      issues.push({ id: "IDX-006", priority: "P0", category: "performance", title: "Site sem HTTPS", description: "URL do WordPress não utiliza protocolo HTTPS.", impact: "Penalização severa no ranking.", fix_instruction: "Instalar certificado SSL e forçar redirecionamento HTTPS.", auto_fixed: false });
      categories.performance.score -= 30;
      categories.performance.issues++;
    }
  }

  // ═══ AUDIT 2: Schema Markup ═══
  if (isPlugin && apiKey && baseUrl) {
    try {
      const schemaResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/validate-schemas`, { method: "POST", headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ auto_fix: true, include_faq: true }) });
      if (schemaResp.ok) {
        const schemaData = await schemaResp.json();
        const schemaErrors = schemaData.errors || 0;
        const schemaFixed = schemaData.fixed || 0;
        if (schemaErrors > 0) {
          issues.push({ id: "SCH-001", priority: "P1", category: "schema", title: `${schemaErrors} erros de Schema JSON-LD detectados`, description: `Schemas inválidos encontrados em ${schemaErrors} páginas.`, impact: "Rich Results não aparecerão no Google.", fix_instruction: "Plugin tentou corrigir automaticamente.", auto_fixed: schemaFixed > 0 });
          categories.schema.score -= Math.min(schemaErrors * 5, 40);
          categories.schema.issues++;
          if (schemaFixed > 0) { totalFixed++; categories.schema.fixed++; }
        }
      }
    } catch { /* */ }
  }

  // ═══ AUDIT 3: Content Quality ═══
  const { data: recentArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_title, wp_post_url, primary_keyword, seo_score, word_count, internal_links_count, last_wp_modified_at")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .order("last_wp_modified_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (recentArticles && recentArticles.length > 0) {
    const thinContent = recentArticles.filter(a => (a.word_count || 0) < 800);
    if (thinContent.length > 0) {
      issues.push({ id: "CNT-001", priority: "P1", category: "content", title: `${thinContent.length} artigos com conteúdo fino (<800 palavras)`, description: `Artigos: ${thinContent.slice(0, 5).map(a => a.wp_post_title).join(", ")}`, impact: "Conteúdo fino tem dificuldade de ranquear.", fix_instruction: "Expandir artigos para mínimo 1.500 palavras.", auto_fixed: false });
      categories.content.score -= Math.min(thinContent.length * 3, 30);
      categories.content.issues++;
    }

    const orphanPages = recentArticles.filter(a => (a.internal_links_count || 0) === 0);
    if (orphanPages.length > 0) {
      issues.push({ id: "CNT-002", priority: "P1", category: "content", title: `${orphanPages.length} páginas órfãs (sem links internos)`, description: `Páginas sem nenhum link interno apontando para elas.`, impact: "Páginas órfãs são difíceis de descobrir por crawlers.", fix_instruction: "Usar o motor de linkagem interna para aplicar links.", auto_fixed: false });
      categories.content.score -= Math.min(orphanPages.length * 2, 25);
      categories.content.issues++;

      // Orphan auto-fix via AI (with verification v3.4.9)
      if (isPlugin && apiKey && baseUrl) {
        try {
          const allForLinks = recentArticles.filter(a => (a.internal_links_count || 0) > 0 || (a.word_count || 0) > 1000);
          if (allForLinks.length >= 2) {
            const orphanBatch = orphanPages.slice(0, 50);
            let orphanLinksApplied = 0;

            for (const orphan of orphanBatch) {
              const candidates = allForLinks.filter(a => a.wp_post_url !== orphan.wp_post_url).slice(0, 10);
              if (candidates.length === 0) continue;

              const candidateList = candidates.map(a => `- [${a.wp_post_title}](${a.wp_post_url}) | kw: ${a.primary_keyword || "N/A"}`).join("\n");

              try {
                const linkPrompt = `Artigo órfão SEM backlinks: "${orphan.wp_post_title}" (${orphan.wp_post_url}, kw: ${orphan.primary_keyword || "N/A"})

Selecione os 3 melhores artigos para inserir um link PARA o artigo órfão. O anchor_text deve ter 2-4 palavras que provavelmente existem no corpo do artigo fonte.

ARTIGOS CANDIDATOS:
${candidateList}

JSON: {"links":[{"source_url":"...","anchor_text":"...","relevance":85}]}`;

                const aiResp = await orchestrator.call('seo_analysis', [
                  { role: "system", content: "Especialista SEO brasileiro. Gere anchor texts CURTOS (2-4 palavras genéricas do tema). APENAS JSON." },
                  { role: "user", content: linkPrompt },
                ], { maxTokens: 2000, temperature: 0.2 });

                let jsonStr = aiResp.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) jsonStr = jsonMatch[0];
                const parsed = JSON.parse(jsonStr);

                for (const link of (parsed.links || [])) {
                  const sourceArticle = candidates.find(a => a.wp_post_url === link.source_url);
                  if (!sourceArticle?.wp_post_id) continue;

                  try {
                    const applyResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/apply-internal-link`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
                      body: JSON.stringify({ post_id: sourceArticle.wp_post_id, anchor_text: link.anchor_text, target_url: orphan.wp_post_url }),
                    });
                    if (applyResp.ok) {
                      const applyData = await applyResp.json();
                      if (applyData.success || applyData.applied) {
                        // ═══ v3.4.9 VERIFICATION ═══
                        const isVerified = await verifyLinkInContent(baseUrl, apiKey, sourceArticle.wp_post_id, orphan.wp_post_url, project.name);
                        if (isVerified) {
                          orphanLinksApplied++;
                        } else {
                          console.warn(`[SEO Agent] [${project.name}] Orphan false positive: post ${sourceArticle.wp_post_id}`);
                        }
                      }
                    }
                  } catch { /* continue */ }
                }
              } catch (parseErr) {
                console.error(`[SEO Agent] Orphan link parse error:`, parseErr);
              }
            }

            if (orphanLinksApplied > 0) {
              issues[issues.length - 1].auto_fixed = true;
              issues[issues.length - 1].description += ` → Auto-fix: ${orphanLinksApplied} backlinks VERIFICADOS inseridos.`;
              totalFixed++;
              categories.content.fixed++;
              categories.content.score += Math.min(orphanLinksApplied * 3, 20);
            }
          }
        } catch (orphanFixErr) {
          console.error(`[SEO Agent] [${project.name}] Orphan auto-fix error:`, orphanFixErr);
        }
      }
    }

    const lowSEO = recentArticles.filter(a => (a.seo_score || 0) < 40);
    if (lowSEO.length > 0) {
      issues.push({ id: "CNT-003", priority: "P2", category: "content", title: `${lowSEO.length} artigos com SEO score baixo (<40)`, description: `Artigos com otimização deficiente.`, impact: "Baixo ranqueamento e visibilidade orgânica.", fix_instruction: "Usar 'Análise SEO IA' no editor para otimizar.", auto_fixed: false });
      categories.content.score -= Math.min(lowSEO.length * 2, 20);
      categories.content.issues++;
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const staleContent = recentArticles.filter(a => a.last_wp_modified_at && new Date(a.last_wp_modified_at) < sixMonthsAgo);
    if (staleContent.length > recentArticles.length * 0.5) {
      issues.push({ id: "CNT-004", priority: "P2", category: "content", title: `${staleContent.length} artigos sem atualização há 6+ meses`, description: "Mais de 50% do conteúdo publicado está desatualizado.", impact: "Google penaliza conteúdo desatualizado.", fix_instruction: "Priorizar atualização de pillar pages.", auto_fixed: false });
      categories.content.score -= 15;
      categories.content.issues++;
    }
  }

  // ═══ AUDIT 4: GEO Visibility ═══
  if (baseUrl && isPlugin && apiKey) {
    try {
      const homepageResp = await fetch(`${baseUrl.replace(/\/blog\/?$/, "")}`, { signal: AbortSignal.timeout(10000) });
      if (homepageResp.ok) {
        const homepageHtml = await homepageResp.text();
        const hasLocalBusiness = homepageHtml.includes('"LocalBusiness"') || homepageHtml.includes('"LegalService"') || homepageHtml.includes('"Attorney"') || homepageHtml.includes('"HealthAndBeautyBusiness"');
        
        if (!hasLocalBusiness) {
          issues.push({ id: "GEO-003", priority: "P0", category: "geo", title: "Schema LocalBusiness ausente na homepage", description: "Nenhum schema de negócio local detectado.", impact: "Sem LocalBusiness schema, o site não aparece no Map Pack do Google.", fix_instruction: "Injetar schema JSON-LD na homepage.", auto_fixed: false });
          categories.geo.score -= 25;
          categories.geo.issues++;

          try {
            const nicho = (project.nicho || '').toLowerCase();
            const domain = (project.domain || '').toLowerCase();
            let schemaType = 'LocalBusiness';
            if (nicho === 'juridico' || nicho === 'legal' || domain.includes('rdm') || domain.includes('advogad')) schemaType = 'LegalService';
            else if (nicho === 'beleza' || nicho === 'estetica' || domain.includes('tracy') || domain.includes('beauty')) schemaType = 'HealthAndBeautyBusiness';
            else if (nicho === 'marketing' || domain.includes('seo')) schemaType = 'ProfessionalService';

            const localBusinessSchema: Record<string, unknown> = { "@context": "https://schema.org", "@type": schemaType, "name": project.empresa_nome || project.name, "url": `https://${project.domain || ''}` };
            if (project.empresa_telefone) localBusinessSchema.telephone = project.empresa_telefone;
            if (project.empresa_endereco) localBusinessSchema.address = { "@type": "PostalAddress", "streetAddress": project.empresa_endereco, "addressLocality": "São Paulo", "addressRegion": "SP", "addressCountry": "BR" };
            if (project.social_google_maps) localBusinessSchema.hasMap = project.social_google_maps;
            const sameAs: string[] = [];
            if (project.social_instagram) sameAs.push(project.social_instagram);
            if (project.social_linkedin) sameAs.push(project.social_linkedin);
            if (project.social_youtube) sameAs.push(project.social_youtube);
            if (project.social_tiktok) sameAs.push(project.social_tiktok);
            if (project.social_twitter) sameAs.push(project.social_twitter);
            if (sameAs.length > 0) localBusinessSchema.sameAs = sameAs;

            const injectResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/inject-homepage-schema`, { method: "POST", headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey }, body: JSON.stringify({ schema: localBusinessSchema }) });
            if (injectResp.ok) { issues[issues.length - 1].auto_fixed = true; totalFixed++; categories.geo.fixed++; categories.geo.score += 20; }
          } catch { /* endpoint may not exist yet */ }
        }
      }
    } catch { /* timeout */ }
  }

  // FAQ schema check
  const { data: articlesWithConfig } = await supabase
    .from("articles")
    .select("id, config, status")
    .eq("project_id", project.id)
    .eq("status", "published")
    .limit(50);

  if (articlesWithConfig && articlesWithConfig.length > 0) {
    const withoutFaq = articlesWithConfig.filter(a => { const cfg = a.config as any; return !cfg?.include_faq && !cfg?.faq_count; });
    if (withoutFaq.length > articlesWithConfig.length * 0.3) {
      issues.push({ id: "GEO-001", priority: "P2", category: "geo", title: `${withoutFaq.length} artigos sem FAQ Schema`, description: `Artigos publicados sem FAQPage schema.`, impact: "Perde oportunidade de rich snippets.", fix_instruction: "Ativar FAQ na geração de artigos.", auto_fixed: false });
      categories.geo.score -= 15;
      categories.geo.issues++;

      if (isPlugin && apiKey) {
        try {
          const faqResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/batch-inject-faq-schema`, { method: "POST", headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ limit: 50, post_type: "post" }) });
          if (faqResp.ok) {
            const faqData = await faqResp.json();
            if (faqData.injected > 0) { issues[issues.length - 1].auto_fixed = true; totalFixed++; categories.geo.fixed++; categories.geo.score += 10; }
          }
        } catch { /* */ }
      }

      try {
        for (const article of withoutFaq.slice(0, 20)) {
          const newConfig = { ...(article.config as any || {}), include_faq: true, faq_count: 5 };
          await supabase.from("articles").update({ config: newConfig }).eq("id", article.id);
        }
      } catch { /* ignore */ }
    }
  }

  // Geo-targeting check
  if (recentArticles && recentArticles.length > 0) {
    const domain = (project.domain || '').toLowerCase();
    const isLocalBusiness = domain.includes('rdm') || domain.includes('tracy') || (project.nicho || '').toLowerCase() === 'juridico' || (project.nicho || '').toLowerCase() === 'beleza';
    if (isLocalBusiness) {
      const articlesWithGeo = recentArticles.filter(a => {
        const title = (a.wp_post_title || '').toLowerCase();
        return title.includes('são paulo') || title.includes('sp') || title.includes('zona leste') || title.includes('tatuapé') || title.includes('guarulhos') || title.includes('paulista');
      });
      const geoPercentage = (articlesWithGeo.length / recentArticles.length) * 100;
      if (geoPercentage < 30) {
        issues.push({ id: "GEO-002", priority: "P1", category: "geo", title: `Apenas ${Math.round(geoPercentage)}% dos artigos têm geo-targeting no título`, description: `Para negócios locais, recomenda-se 50%+ com localização.`, impact: "Perde visibilidade em buscas locais.", fix_instruction: "Incluir localização nos títulos.", auto_fixed: false });
        categories.geo.score -= 15;
        categories.geo.issues++;
      }
    }
  }

  // Calculate overall score
  const categoryScores = Object.values(categories).map(c => Math.max(0, Math.min(100, c.score)));
  const overallScore = Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length);

  console.log(`[SEO Agent] [${project.name}] Audit complete: score=${overallScore}, issues=${issues.length}, fixed=${totalFixed}`);

  return { score: overallScore, issues, issues_found: issues.length, issues_fixed: totalFixed, categories };
}

// ═══════════════════════════════════════════════════════════
// STEP 6: Autonomous SEO Scan + Fix
// ═══════════════════════════════════════════════════════════
async function runAutonomousSEOFix(
  supabase: ReturnType<typeof createClient>,
  orchestrator: ReturnType<typeof getOrchestrator>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ scanned: number; issues_found: number; applied: number; redirects_created: number; types: string[]; details: string[] }> {
  const detailsList: string[] = [];
  const typesApplied: string[] = [];
  let applied = 0;
  let redirectsCreated = 0;

  if (!baseUrl || !isPlugin || !apiKey) {
    return { scanned: 0, issues_found: 0, applied: 0, redirects_created: 0, types: [], details: ["No WordPress connection"] };
  }

  try {
    const scanResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/scan-seo-issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
      body: JSON.stringify({ limit: 2000, checks: ["canonical", "https", "missing_h1", "duplicate_title", "missing_meta"] }),
    });

    if (!scanResp.ok) {
      detailsList.push(`scan-seo-issues indisponível (${scanResp.status})`);
      return { scanned: 0, issues_found: 0, applied: 0, redirects_created: 0, types: [], details: detailsList };
    }

    const scanData = await scanResp.json();
    const scanned = scanData.scanned || 0;
    const issuesFound = scanData.issues_found || 0;
    const issuesList = scanData.issues || [];

    console.log(`[SEO Agent] [${project.name}] Autonomous: ${scanned} scanned, ${issuesFound} issues`);

    if (issuesFound === 0) {
      return { scanned, issues_found: 0, applied: 0, redirects_created: 0, types: [], details: [`Scan limpo: ${scanned} posts OK`] };
    }

    const fixes: any[] = [];
    for (const issue of issuesList) {
      for (const iss of issue.issues) {
        if (iss.type === "http_urls") fixes.push({ type: "force_https", post_id: issue.post_id });
        else if (iss.type === "missing_canonical") {
          const canonical = issue.url?.replace("http://", "https://");
          if (canonical) fixes.push({ type: "canonical", post_id: issue.post_id, canonical_url: canonical });
        }
        else if (iss.type === "missing_h1") fixes.push({ type: "inject_faq_schema", post_id: issue.post_id });
        else if (iss.type === "duplicate_title") detailsList.push(`⚠ Título duplicado: "${issue.title}" (${issue.post_id})`);
      }
    }

    if (fixes.length > 0) {
      for (let i = 0; i < fixes.length; i += 50) {
        try {
          const fixResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/autonomous-seo-fix`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
            body: JSON.stringify({ fixes: fixes.slice(i, i + 50) }),
          });
          if (fixResp.ok) {
            const fixData = await fixResp.json();
            applied += fixData.applied || 0;
            for (const r of (fixData.results || [])) {
              if (r.status === "applied" && !typesApplied.includes(r.type)) typesApplied.push(r.type);
            }
            detailsList.push(`Batch: ${fixData.applied} correções aplicadas`);
          }
        } catch (e) { console.error(`[SEO Agent] Autonomous batch error:`, e); }
      }
    }

    if (applied > 0) {
      const fixedUrls = issuesList.map((i: any) => i.url).filter(Boolean).slice(0, 100);
      try {
        await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
          body: JSON.stringify({ urls: fixedUrls }),
        });
        detailsList.push(`Re-indexação: ${fixedUrls.length} URLs corrigidas`);
      } catch { /* ignore */ }
    }

    // Duplicate URL Cleanup + Redirect Creation
    try {
      const cleanupResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/redirects/cleanup-duplicates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
        body: JSON.stringify({ limit: 100, dry_run: false }),
      });
      if (cleanupResp.ok) {
        const cleanupData = await cleanupResp.json();
        if (cleanupData.redirects_created > 0) {
          redirectsCreated += cleanupData.redirects_created;
          typesApplied.push("duplicate_cleanup");
          detailsList.push(`Duplicatas: ${cleanupData.redirects_created} redirects 301, ${cleanupData.noindex_applied} noindex`);
        }
      }
    } catch { detailsList.push(`Cleanup duplicatas: endpoint indisponível`); }

    return { scanned, issues_found: issuesFound, applied, redirects_created: redirectsCreated, types: typesApplied, details: detailsList };
  } catch (e) {
    return { scanned: 0, issues_found: 0, applied: 0, redirects_created: 0, types: [], details: [`Error: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

// ═══════════════════════════════════════════════════════════
// STEP 7: Full-Base Cross-Linking (with VERIFICATION v3.4.9)
// ═══════════════════════════════════════════════════════════
async function runFullBaseCrossLinking(
  supabase: ReturnType<typeof createClient>,
  orchestrator: ReturnType<typeof getOrchestrator>,
  project: any,
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
): Promise<{ articles_analyzed: number; articles_enriched: number; cross_links_created: number; cross_links_verified: number; false_positives: number; details: string[] }> {
  const detailsList: string[] = [];
  let articlesEnriched = 0;
  let crossLinksCreated = 0;
  let crossLinksVerified = 0;
  let falsePositives = 0;

  if (!baseUrl || !isPlugin || !apiKey) {
    return { articles_analyzed: 0, articles_enriched: 0, cross_links_created: 0, cross_links_verified: 0, false_positives: 0, details: ["No WordPress connection"] };
  }

  const { data: allArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, secondary_keywords, topic_cluster, semantic_summary, internal_links_count, word_count, seo_score")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .order("word_count", { ascending: false })
    .limit(1000);

  if (!allArticles || allArticles.length < 3) {
    return { articles_analyzed: allArticles?.length || 0, articles_enriched: 0, cross_links_created: 0, cross_links_verified: 0, false_positives: 0, details: ["Not enough articles for cross-linking"] };
  }

  const articlesNeedingLinks = allArticles.filter(a => (a.internal_links_count || 0) < 3);
  if (articlesNeedingLinks.length === 0) {
    return { articles_analyzed: allArticles.length, articles_enriched: 0, cross_links_created: 0, cross_links_verified: 0, false_positives: 0, details: ["All articles already have 3+ internal links"] };
  }

  console.log(`[SEO Agent] [${project.name}] Cross-linking: ${articlesNeedingLinks.length} articles need enrichment`);

  const clusterMap = new Map<string, typeof allArticles>();
  for (const article of allArticles) {
    const cluster = article.topic_cluster || "geral";
    if (!clusterMap.has(cluster)) clusterMap.set(cluster, []);
    clusterMap.get(cluster)!.push(article);
  }

  const batches: (typeof allArticles)[] = [];
  for (let i = 0; i < articlesNeedingLinks.length && i < 200; i += 10) {
    batches.push(articlesNeedingLinks.slice(i, i + 10));
  }

  for (const batch of batches) {
    try {
      const articleDescriptions = batch.map(a => {
        const cluster = a.topic_cluster || "geral";
        const clusterPeers = (clusterMap.get(cluster) || [])
          .filter(p => p.wp_post_url !== a.wp_post_url)
          .slice(0, 10)
          .map(p => `  - [${p.wp_post_title}](${p.wp_post_url}) | kw: ${p.primary_keyword || "N/A"}`)
          .join("\n");

        const otherClusters = Array.from(clusterMap.entries())
          .filter(([k]) => k !== cluster)
          .flatMap(([, v]) => v)
          .slice(0, 10)
          .map(p => `  - [${p.wp_post_title}](${p.wp_post_url}) | kw: ${p.primary_keyword || "N/A"} | cluster: ${p.topic_cluster || "N/A"}`)
          .join("\n");

        return `ARTIGO: "${a.wp_post_title}" (${a.wp_post_url})
  Keyword: ${a.primary_keyword || "N/A"} | Cluster: ${cluster} | Links: ${a.internal_links_count || 0} | ${a.word_count || 0}p
  MESMO CLUSTER:\n${clusterPeers || "  (nenhum)"}
  OUTROS:\n${otherClusters || "  (nenhum)"}`;
      }).join("\n\n---\n\n");

      const prompt = `Gere cross-links internos para fortalecer autoridade semântica:

${articleDescriptions}

REGRAS:
1. Para cada artigo, sugira 3-5 backlinks de outros artigos
2. anchor_text: 2-4 palavras descritivas naturais
3. 80% intra-cluster, 20% cross-cluster
4. Relevância mínima: 75 — ZERO falsos positivos
5. Posição: introdução/meio/conclusão

JSON:
{"cross_links":[{"target_url":"...","links":[{"source_url":"...","source_post_id":123,"anchor_text":"...","position":"meio","relevance":85,"reason":"..."}]}]}`;

      const aiResult = await orchestrator.call("seo_analysis", [
        { role: "system", content: `Especialista SEO brasileiro em Internal Linking. Nicho: ${project.nicho || "geral"}. APENAS JSON.` },
        { role: "user", content: prompt },
      ], { maxTokens: 8000, temperature: 0.2 });

      let jsonStr = aiResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        try {
          const opens = { '[': 0, '{': 0 };
          for (const ch of jsonStr) {
            if (ch === '[' || ch === '{') opens[ch]++;
            if (ch === ']') opens['[']--;
            if (ch === '}') opens['{']--;
          }
          jsonStr = jsonStr.replace(/,\s*$/, '');
          jsonStr += ']'.repeat(Math.max(0, opens['[']));
          jsonStr += '}'.repeat(Math.max(0, opens['{']));
          parsed = JSON.parse(jsonStr);
        } catch {
          console.warn(`[SEO Agent] Cross-link JSON parse failed, skipping batch`);
          continue;
        }
      }

      if (!parsed?.cross_links || !Array.isArray(parsed.cross_links)) continue;

      const urlToArticle = new Map(allArticles.map(a => [a.wp_post_url, a]));

      for (const crossLink of parsed.cross_links) {
        if (!crossLink.links || !Array.isArray(crossLink.links)) continue;
        const targetArticle = urlToArticle.get(crossLink.target_url);
        if (!targetArticle) continue;

        let enrichedThis = false;

        for (const link of crossLink.links) {
          if (!link.source_url || !link.anchor_text || (link.relevance || 0) < 75) continue;

          const sourceArticle = urlToArticle.get(link.source_url) ||
            allArticles.find(a => a.wp_post_id === link.source_post_id);
          if (!sourceArticle?.wp_post_id) continue;

          await supabase.from("internal_link_suggestions").insert({
            user_id: project.user_id,
            project_id: project.id,
            anchor_text: link.anchor_text,
            target_url: crossLink.target_url,
            relevance_score: link.relevance || 75,
            status: "pending",
            source_wp_post_id: sourceArticle.wp_post_id,
            target_wp_post_id: targetArticle.wp_post_id,
            position_suggestion: link.position || "meio",
            anchor_context: `Cross-link: ${link.reason || "semantic relevance"}`,
          });

          if ((link.relevance || 0) >= 80) {
            try {
              const applyResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/apply-internal-link`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
                body: JSON.stringify({ post_id: sourceArticle.wp_post_id, anchor_text: link.anchor_text, target_url: crossLink.target_url, position: link.position || "auto" }),
              });
              if (applyResp.ok) {
                const applyData = await applyResp.json();
                if (applyData.success || applyData.applied) {
                  // ═══ CRITICAL v3.4.9: VERIFY cross-link ═══
                  const isVerified = await verifyLinkInContent(baseUrl, apiKey, sourceArticle.wp_post_id, crossLink.target_url, project.name);
                  if (isVerified) {
                    crossLinksCreated++;
                    crossLinksVerified++;
                    enrichedThis = true;
                    await supabase
                      .from("internal_link_suggestions")
                      .update({ status: "applied", applied_at: new Date().toISOString() })
                      .eq("project_id", project.id)
                      .eq("source_wp_post_id", sourceArticle.wp_post_id)
                      .eq("target_url", crossLink.target_url)
                      .eq("status", "pending");
                    detailsList.push(`✅ VERIFICADO: "${link.anchor_text}" → ${targetArticle.wp_post_title}`);
                  } else {
                    falsePositives++;
                    console.warn(`[SEO Agent] [${project.name}] ❌ CROSS-LINK FALSE POSITIVE: post ${sourceArticle.wp_post_id} → ${crossLink.target_url}`);
                    detailsList.push(`❌ FALSO POSITIVO: "${link.anchor_text}" em post ${sourceArticle.wp_post_id}`);
                    await supabase
                      .from("internal_link_suggestions")
                      .update({ status: "rejected", rejected_reason: "false_positive: link not found after apply" })
                      .eq("project_id", project.id)
                      .eq("source_wp_post_id", sourceArticle.wp_post_id)
                      .eq("target_url", crossLink.target_url)
                      .eq("status", "pending");
                  }
                }
              }
            } catch { /* continue */ }
          }
        }

        if (enrichedThis) {
          articlesEnriched++;
          await supabase
            .from("wordpress_article_index")
            .update({ internal_links_count: (targetArticle.internal_links_count || 0) + 1, updated_at: new Date().toISOString() })
            .eq("id", targetArticle.id);
        }
      }
    } catch (e) {
      console.error(`[SEO Agent] [${project.name}] Cross-link batch error:`, e);
    }
  }

  // Re-index enriched articles
  if (crossLinksCreated > 0) {
    const enrichedUrls = articlesNeedingLinks.slice(0, crossLinksCreated + 10).map(a => a.wp_post_url).filter(Boolean);
    if (enrichedUrls.length > 0) {
      try {
        await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
          body: JSON.stringify({ urls: enrichedUrls }),
        });
        detailsList.push(`Re-indexação: ${enrichedUrls.length} artigos enriquecidos`);
      } catch { /* ignore */ }
    }
  }

  console.log(`[SEO Agent] [${project.name}] Cross-linking: ${crossLinksCreated} links (${crossLinksVerified} verified, ${falsePositives} false positives), ${articlesEnriched} enriched`);
  return { articles_analyzed: allArticles.length, articles_enriched: articlesEnriched, cross_links_created: crossLinksCreated, cross_links_verified: crossLinksVerified, false_positives: falsePositives, details: detailsList };
}

// ═══════════════════════════════════════════════════════════
// STEP 8: Redirect Management
// ═══════════════════════════════════════════════════════════
async function manageRedirects(
  baseUrl: string,
  isPlugin: boolean,
  apiKey: string,
  redirects: Array<{ source_url: string; target_url: string; category?: string; notes?: string }>,
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  if (!baseUrl || !isPlugin || !apiKey || redirects.length === 0) {
    return { created: 0, errors: ["No connection or empty redirects"] };
  }

  try {
    const resp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/redirects/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
      body: JSON.stringify({ redirects }),
    });
    if (resp.ok) {
      const data = await resp.json();
      created = data.created || 0;
    } else {
      errors.push(`Batch redirects failed: ${resp.status}`);
    }
  } catch (e) {
    errors.push(`Redirect error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { created, errors };
}
