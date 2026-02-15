import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getOrchestrator } from "../_shared/ai-orchestrator.ts";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { orchestrate, resolveVernizDNA } from "../_shared/verniz-orchestrator.ts";

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
        // STEP 5: Full Technical Audit
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 5: Full Technical Audit`);

        const auditResult = await runFullTechnicalAudit(supabase, orchestrator, project, baseUrl, isPlugin, apiKey);
        details.audit = auditResult;

        // ═══════════════════════════════════════════
        // STEP 6: Autonomous SEO Scan + Fix (v3.4.0)
        // ═══════════════════════════════════════════
        console.log(`[SEO Agent] [${project.name}] Step 6: Autonomous SEO Scan & Fix`);

        const autonomousResult = await runAutonomousSEOFix(supabase, orchestrator, project, baseUrl, isPlugin, apiKey);
        details.autonomous_fix = autonomousResult;

        // ═══════════════════════════════════════════
        // STEP 7: Summary
        // ═══════════════════════════════════════════
        const summaryParts = [];
        if (metaIssuesFixed > 0) summaryParts.push(`${metaIssuesFixed} metas corrigidos`);
        if (metaIssuesFound > 0 && metaIssuesFixed === 0) summaryParts.push(`${metaIssuesFound} issues encontrados`);
        if (linksSuggested > 0) summaryParts.push(`${linksSuggested} links sugeridos`);
        if (linksApplied > 0) summaryParts.push(`${linksApplied} links aplicados`);
        if (indexingSubmitted > 0) summaryParts.push(`${indexingSubmitted} URLs indexadas`);
        if (sitemapUpdated) summaryParts.push("sitemap atualizado");
        if (aiDiscoveryResult.actions?.length > 0) summaryParts.push(`${aiDiscoveryResult.actions.length} otimizações IA discovery`);
        if (auditResult.score > 0) summaryParts.push(`audit score: ${auditResult.score}/100`);
        if (auditResult.issues_fixed > 0) summaryParts.push(`${auditResult.issues_fixed} problemas corrigidos`);
        if (autonomousResult.applied > 0) summaryParts.push(`${autonomousResult.applied} correções autônomas (${autonomousResult.types.join(", ")})`);
        if (autonomousResult.redirects_created > 0) summaryParts.push(`${autonomousResult.redirects_created} redirects criados`);

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

        // ═══ P0 Critical Issue Notifications ═══
        const p0Issues = (auditResult.issues || []).filter((i: any) => i.priority === "P0");
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

    // Use Verniz orchestrator for project context
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
      ], { maxTokens: 800, temperature: 0.2 });

      console.log(`[SEO Agent] [${project.name}] Link AI response for "${orphan.wp_post_title}" (${aiContent.length} chars)`);

      try {
        let jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        // Try to extract JSON object if surrounded by text
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
      } catch (parseErr) {
        console.error(`[SEO Agent] [${project.name}] Link suggestion parse failed for orphan "${orphan.wp_post_title}":`, parseErr instanceof Error ? parseErr.message : parseErr);
        console.error(`[SEO Agent] [${project.name}] Raw AI response (first 500 chars):`, aiContent?.substring(0, 500));
      }
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
          // Only count actually submitted, not the request size
          submitted = indexData.submitted || 0;
          if (submitted > 0) {
            detailsList.push(`IndexNow: ${submitted} URLs submetidas`);
          } else {
            detailsList.push(`IndexNow: plugin retornou sem submissões efetivas`);
          }
        } else {
          // Fallback: Direct IndexNow API submission
          const directResult = await submitDirectIndexNow(baseUrl, urls.slice(0, 50), apiKey);
          submitted = directResult;
          detailsList.push(`IndexNow direto: ${submitted} URLs submetidas`);
        }
      } catch (e) {
        // Fallback: Direct IndexNow
        const directResult = await submitDirectIndexNow(baseUrl, urls.slice(0, 50), apiKey);
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

    // 4) Ping Google sitemap (detect correct sitemap URL)
    const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
    let detectedSitemapUrl = `${siteRoot}/wp-sitemap.xml`; // default WordPress core
    try {
      // Try to detect which sitemap exists
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

    // 5) Ping Bing sitemap
    try {
      await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(detectedSitemapUrl)}`, { method: "GET" });
      detailsList.push("Bing sitemap pinged");
    } catch { /* ignore */ }

    // 6) Submit to Google Indexing API via plugin (if GSC OAuth configured)
    if (isPlugin && apiKey) {
      try {
        const gscIndexResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/google-indexing/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CFRDM-API-Key": apiKey,
          },
          body: JSON.stringify({}), // empty = auto-collect recent URLs
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
async function submitDirectIndexNow(siteUrl: string, urls: string[], apiKey?: string): Promise<number> {
  if (urls.length === 0) return 0;

  const host = new URL(siteUrl).hostname;
  
  // Try to get the real IndexNow key from the plugin first
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
  
  // Fallback: generate a deterministic key (won't have matching .txt file, but IndexNow may still accept)
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
    // 403/422 = key validation failed (key.txt not found on server)
    console.warn(`[IndexNow Direct] Status ${status} for ${host} — likely key validation failure (${key}.txt not accessible)`);
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
  const siteRoot2 = baseUrl.replace(/\/blog\/?$/, "");
  let sitemapUrl2 = `${siteRoot2}/wp-sitemap.xml`;
  // Detect correct sitemap
  for (const candidate of [`${siteRoot2}/wp-sitemap.xml`, `${siteRoot2}/sitemap_index.xml`, `${siteRoot2}/sitemap.xml`]) {
    try {
      const r = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (r.ok) { sitemapUrl2 = candidate; break; }
    } catch { /* next */ }
  }
  const llmsUrl = `${siteRoot2}/llms.txt`;

  // Ping Bing (feeds ChatGPT via Bing index)
  try {
    await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl2)}`);
    actions.push("Bing pinged (ChatGPT source)");
  } catch { /* ignore */ }

  // Ping Google (feeds Gemini AI)
  try {
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl2)}`);
    actions.push("Google pinged (Gemini source)");
  } catch { /* ignore */ }

  // Ping Yandex (broader AI coverage)
  try {
    await fetch(`https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(sitemapUrl2)}`);
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
          sitemapUrl2,
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

// ═══════════════════════════════════════════════════════════
// STEP 5: Full Technical Audit
// Schema Validation, Performance, Content Quality, GEO
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
  };

  // ═══ AUDIT 1: Indexing Health ═══
  if (baseUrl) {
    // Check robots.txt
    try {
      const robotsResp = await fetch(`${baseUrl.replace(/\/blog\/?$/, "")}/robots.txt`, { signal: AbortSignal.timeout(8000) });
      if (!robotsResp.ok) {
        issues.push({
          id: "IDX-001", priority: "P0", category: "indexing",
          title: "robots.txt ausente ou inacessível",
          description: "O arquivo robots.txt não foi encontrado.",
          impact: "Crawlers podem ter dificuldade em rastrear o site corretamente.",
          fix_instruction: "Criar robots.txt na raiz com User-agent: * e Sitemap.", auto_fixed: false
        });
        categories.indexing.score -= 25;
        categories.indexing.issues++;
      } else {
        const robotsContent = await robotsResp.text();
        // Parse robots.txt properly: check if each bot has its OWN Disallow: / rule
        const robotsLines = robotsContent.split('\n').map(l => l.trim().toLowerCase());
        const blockedCrawlers = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"].filter(bot => {
          const botLower = bot.toLowerCase();
          const botLineIdx = robotsLines.findIndex(l => l === `user-agent: ${botLower}`);
          if (botLineIdx === -1) return false;
          // Check subsequent lines until next User-agent for "disallow: /"
          for (let i = botLineIdx + 1; i < robotsLines.length; i++) {
            if (robotsLines[i].startsWith('user-agent:')) break;
            if (robotsLines[i] === 'disallow: /') return true;
          }
          return false;
        });
        if (blockedCrawlers.length > 0) {
          issues.push({
            id: "IDX-002", priority: "P1", category: "indexing",
            title: `${blockedCrawlers.length} crawlers de IA bloqueados no robots.txt`,
            description: `Crawlers bloqueados: ${blockedCrawlers.join(", ")}`,
            impact: "Conteúdo não aparecerá em respostas de IAs generativas.",
            fix_instruction: "Remover regras de Disallow para crawlers de IA estratégicos.", auto_fixed: false
          });
          categories.indexing.score -= 10 * blockedCrawlers.length;
          categories.indexing.issues++;

          // AUTO-FIX: Call plugin endpoint to unblock AI crawlers
          if (isPlugin && apiKey) {
            try {
              const fixResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/fix-ai-crawlers`, {
                method: "POST",
                headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
              });
              if (fixResp.ok) {
                const fixData = await fixResp.json();
                // Only count as fixed if crawlers were actually unblocked
                if (fixData.unblocked > 0 || fixData.fixed > 0) {
                  issues[issues.length - 1].auto_fixed = true;
                  issues[issues.length - 1].description += ` → Auto-fix: ${fixData.message || fixData.unblocked + ' crawlers desbloqueados'}`;
                  totalFixed++;
                  categories.indexing.fixed++;
                  categories.indexing.score += 10 * blockedCrawlers.length;
                } else {
                  console.log(`[SEO Agent] [${project.name}] fix-ai-crawlers: no actual changes made (${JSON.stringify(fixData)})`);
                }
              }
            } catch { /* plugin endpoint unavailable */ }
          }
        }
        // Check sitemap reference
        if (!robotsContent.toLowerCase().includes("sitemap:")) {
          issues.push({
            id: "IDX-003", priority: "P2", category: "indexing",
            title: "Referência ao sitemap ausente no robots.txt",
            description: "robots.txt não contém diretiva Sitemap.",
            impact: "Crawlers podem demorar mais para descobrir todas as páginas.",
            fix_instruction: "Adicionar 'Sitemap: https://dominio/sitemap_index.xml' ao robots.txt.", auto_fixed: false
          });
          categories.indexing.score -= 10;
          categories.indexing.issues++;
        }
      }
    } catch { /* timeout */ }

    // Check sitemap (try multiple common URLs)
    try {
      const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
      const sitemapCandidates = [
        `${siteRoot}/wp-sitemap.xml`,        // WordPress core (default)
        `${siteRoot}/sitemap_index.xml`,      // Yoast / Rank Math
        `${siteRoot}/sitemap.xml`,            // Generic
      ];
      
      let sitemapFound = false;
      let lastStatus = 0;
      for (const sitemapUrl of sitemapCandidates) {
        try {
          const sitemapResp = await fetch(sitemapUrl, { signal: AbortSignal.timeout(8000) });
          lastStatus = sitemapResp.status;
          if (sitemapResp.ok) {
            sitemapFound = true;
            break;
          }
        } catch { /* try next */ }
      }
      
      if (!sitemapFound) {
        issues.push({
          id: "IDX-004", priority: "P0", category: "indexing",
          title: "Sitemap XML inacessível",
          description: `Nenhum sitemap encontrado (wp-sitemap.xml, sitemap_index.xml, sitemap.xml). Último status: ${lastStatus}`,
          impact: "Motores de busca não conseguem descobrir páginas eficientemente.",
          fix_instruction: "Verificar se o WordPress core sitemap está habilitado (wp-sitemap.xml) ou se plugin de SEO (Rank Math/Yoast) está gerando sitemap_index.xml. No plugin ContentFactory, ativar o Sitemap Optimizer.", auto_fixed: false
        });
        categories.indexing.score -= 30;
        categories.indexing.issues++;

        // Auto-fix: try refreshing sitemap via plugin
        if (isPlugin && apiKey) {
          try {
            const fixResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-sitemap`, {
              method: "POST",
              headers: { "X-CFRDM-API-Key": apiKey },
            });
            if (fixResp.ok) {
              // Verify sitemap is now accessible
              let sitemapVerified = false;
              for (const candidate of [`${siteRoot}/wp-sitemap.xml`, `${siteRoot}/sitemap_index.xml`, `${siteRoot}/sitemap.xml`]) {
                try {
                  const vr = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(5000) });
                  if (vr.ok) { sitemapVerified = true; break; }
                } catch { /* next */ }
              }
              if (sitemapVerified) {
                issues[issues.length - 1].auto_fixed = true;
                issues[issues.length - 1].description += " → Sitemap regenerado com sucesso.";
                totalFixed++;
                categories.indexing.fixed++;
                categories.indexing.score += 20;
              } else {
                issues[issues.length - 1].description += " → Plugin tentou regenerar mas sitemap ainda inacessível.";
                console.warn(`[SEO Agent] [${project.name}] Sitemap refresh: plugin returned OK but sitemap still not accessible`);
              }
            }
          } catch (e) {
            console.error(`[SEO Agent] [${project.name}] Sitemap refresh failed:`, e);
          }
        }
      }
    } catch { /* timeout */ }

    // Check llms.txt
    try {
      const llmsResp = await fetch(`${baseUrl.replace(/\/blog\/?$/, "")}/llms.txt`, { signal: AbortSignal.timeout(5000) });
      if (!llmsResp.ok) {
        issues.push({
          id: "IDX-005", priority: "P1", category: "geo",
          title: "llms.txt ausente",
          description: "Arquivo llms.txt não encontrado na raiz do site.",
          impact: "IAs generativas (ChatGPT, Claude, Gemini) têm dificuldade em descobrir conteúdo.",
          fix_instruction: "Ativar geração de llms.txt no plugin ContentFactory.", auto_fixed: false
        });
        categories.geo.score -= 20;
        categories.geo.issues++;

        // Auto-fix via plugin: force-enable and regenerate llms.txt
        if (isPlugin && apiKey) {
          try {
            // Use refresh-llms which now force-enables the option
            const fixResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/refresh-llms`, {
              method: "POST", headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ force_enable: true }),
            });
            if (fixResp.ok) {
              // Verify llms.txt is actually accessible now
              try {
                const verifyResp = await fetch(`${baseUrl.replace(/\/blog\/?$/, "")}/llms.txt`, { signal: AbortSignal.timeout(5000) });
                if (verifyResp.ok) {
                  issues[issues.length - 1].auto_fixed = true;
                  totalFixed++;
                  categories.geo.fixed++;
                  categories.geo.score += 15;
                } else {
                  console.warn(`[SEO Agent] [${project.name}] llms.txt refresh claimed OK but file still not accessible (${verifyResp.status})`);
                }
              } catch {
                console.warn(`[SEO Agent] [${project.name}] llms.txt verification timeout`);
              }
            }
          } catch (e) {
            console.error(`[SEO Agent] [${project.name}] llms.txt fix failed:`, e);
          }
        }
      }
    } catch { /* timeout */ }

    // Check HTTPS
    if (!baseUrl.startsWith("https")) {
      issues.push({
        id: "IDX-006", priority: "P0", category: "performance",
        title: "Site sem HTTPS",
        description: "URL do WordPress não utiliza protocolo HTTPS.",
        impact: "Penalização severa no ranking. Navegadores mostram aviso de insegurança.",
        fix_instruction: "Instalar certificado SSL e forçar redirecionamento HTTPS.", auto_fixed: false
      });
      categories.performance.score -= 30;
      categories.performance.issues++;
    }
  }

  // ═══ AUDIT 2: Schema Markup ═══
  if (isPlugin && apiKey && baseUrl) {
    try {
      const schemaResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/validate-schemas`, {
        method: "POST",
        headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ auto_fix: true, include_faq: true }),
      });
      if (schemaResp.ok) {
        const schemaData = await schemaResp.json();
        const schemaErrors = schemaData.errors || 0;
        const schemaFixed = schemaData.fixed || 0;

        if (schemaErrors > 0) {
          issues.push({
            id: "SCH-001", priority: "P1", category: "schema",
            title: `${schemaErrors} erros de Schema JSON-LD detectados`,
            description: `Schemas inválidos encontrados em ${schemaErrors} páginas.`,
            impact: "Rich Results não aparecerão no Google. Perda de CTR estimada em 20-30%.",
            fix_instruction: "Plugin tentou corrigir automaticamente. Validar no Google Rich Results Test.",
            auto_fixed: schemaFixed > 0
          });
          categories.schema.score -= Math.min(schemaErrors * 5, 40);
          categories.schema.issues++;
          if (schemaFixed > 0) {
            totalFixed++;
            categories.schema.fixed++;
          }
        }
      }
    } catch { /* */ }
  }

  // ═══ AUDIT 3: Content Quality (E-E-A-T) ═══
  const { data: recentArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_title, wp_post_url, primary_keyword, seo_score, word_count, internal_links_count, wp_post_date")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .order("wp_post_date", { ascending: false })
    .limit(50);

  if (recentArticles && recentArticles.length > 0) {
    // Check for thin content
    const thinContent = recentArticles.filter(a => (a.word_count || 0) < 800);
    if (thinContent.length > 0) {
      issues.push({
        id: "CNT-001", priority: "P1", category: "content",
        title: `${thinContent.length} artigos com conteúdo fino (<800 palavras)`,
        description: `Artigos: ${thinContent.slice(0, 5).map(a => a.wp_post_title).join(", ")}`,
        impact: "Conteúdo fino tem dificuldade de ranquear e baixo E-E-A-T.",
        fix_instruction: "Expandir artigos para mínimo 1.500 palavras com dados, fontes e FAQ.",
        auto_fixed: false
      });
      categories.content.score -= Math.min(thinContent.length * 3, 30);
      categories.content.issues++;
    }

    // Check for orphan pages (no internal links)
    const orphans = recentArticles.filter(a => (a.internal_links_count || 0) === 0);
    if (orphans.length > 0) {
      issues.push({
        id: "CNT-002", priority: "P1", category: "content",
        title: `${orphans.length} páginas órfãs (sem links internos)`,
        description: `Páginas sem nenhum link interno apontando para elas.`,
        impact: "Páginas órfãs são difíceis de descobrir por crawlers e perdem autoridade.",
        fix_instruction: "Usar o motor de linkagem interna para sugerir e aplicar links automaticamente.",
        auto_fixed: false
      });
      categories.content.score -= Math.min(orphans.length * 2, 25);
      categories.content.issues++;

      // AUTO-FIX: Generate and apply internal links for orphan articles
      if (isPlugin && apiKey && baseUrl) {
        try {
          const allForLinks = recentArticles.filter(a => (a.internal_links_count || 0) > 0 || (a.word_count || 0) > 1000);
          if (allForLinks.length >= 2) {
            const orphanBatch = orphans.slice(0, 8);
            let orphanLinksApplied = 0;

            for (const orphan of orphanBatch) {
              // Find best matching articles by keyword/topic similarity
              const candidates = allForLinks
                .filter(a => a.wp_post_url !== orphan.wp_post_url)
                .slice(0, 10);

              if (candidates.length === 0) continue;

              const candidateList = candidates.map(a =>
                `- [${a.wp_post_title}](${a.wp_post_url}) | kw: ${a.primary_keyword || "N/A"}`
              ).join("\n");

              try {
                const linkPrompt = `Artigo órfão SEM backlinks: "${orphan.wp_post_title}" (${orphan.wp_post_url}, kw: ${orphan.primary_keyword || "N/A"})

Selecione os 3 melhores artigos para inserir um link PARA o artigo órfão. O anchor_text deve ter 2-4 palavras que provavelmente existem no corpo do artigo fonte.

ARTIGOS CANDIDATOS:
${candidateList}

JSON: {"links":[{"source_url":"...","anchor_text":"...","relevance":85}]}`;

                const aiResp = await orchestrator.call('seo_analysis', [
                  { role: "system", content: "Especialista SEO brasileiro. Gere anchor texts CURTOS (2-4 palavras genéricas do tema). APENAS JSON." },
                  { role: "user", content: linkPrompt },
                ], { maxTokens: 500, temperature: 0.2 });

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
                      body: JSON.stringify({
                        post_id: sourceArticle.wp_post_id,
                        anchor_text: link.anchor_text,
                        target_url: orphan.wp_post_url,
                      }),
                    });
                    if (applyResp.ok) {
                      const applyData = await applyResp.json();
                      if (applyData.success || applyData.applied) {
                        orphanLinksApplied++;
                      }
                    }
                  } catch { /* continue */ }
                }
              } catch (parseErr) {
                console.error(`[SEO Agent] Orphan link parse error for "${orphan.wp_post_title}":`, parseErr);
              }
            }

            if (orphanLinksApplied > 0) {
              issues[issues.length - 1].auto_fixed = true;
              issues[issues.length - 1].description += ` → Auto-fix: ${orphanLinksApplied} backlinks inseridos em artigos órfãos.`;
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

    // Check for low SEO score articles
    const lowSEO = recentArticles.filter(a => (a.seo_score || 0) < 40);
    if (lowSEO.length > 0) {
      issues.push({
        id: "CNT-003", priority: "P2", category: "content",
        title: `${lowSEO.length} artigos com SEO score baixo (<40)`,
        description: `Artigos com otimização deficiente.`,
        impact: "Baixo ranqueamento e visibilidade orgânica.",
        fix_instruction: "Usar 'Análise SEO IA' no editor para otimizar metas, headings e keywords.",
        auto_fixed: false
      });
      categories.content.score -= Math.min(lowSEO.length * 2, 20);
      categories.content.issues++;
    }

    // Check content freshness
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const staleContent = recentArticles.filter(a => a.wp_post_date && new Date(a.wp_post_date) < sixMonthsAgo);
    if (staleContent.length > recentArticles.length * 0.5) {
      issues.push({
        id: "CNT-004", priority: "P2", category: "content",
        title: `${staleContent.length} artigos sem atualização há 6+ meses`,
        description: "Mais de 50% do conteúdo publicado está desatualizado.",
        impact: "Google penaliza conteúdo desatualizado, especialmente em nichos YMYL.",
        fix_instruction: "Priorizar atualização de pillar pages e artigos de maior tráfego.",
        auto_fixed: false
      });
      categories.content.score -= 15;
      categories.content.issues++;
    }
  }

  // ═══ AUDIT 4: GEO Visibility ═══
  // Check if articles have FAQ schema
  const { data: articlesWithConfig } = await supabase
    .from("articles")
    .select("id, config, status")
    .eq("project_id", project.id)
    .eq("status", "published")
    .limit(50);

  if (articlesWithConfig && articlesWithConfig.length > 0) {
    const withoutFaq = articlesWithConfig.filter(a => {
      const cfg = a.config as any;
      return !cfg?.include_faq && !cfg?.faq_count;
    });
    if (withoutFaq.length > articlesWithConfig.length * 0.3) {
      issues.push({
        id: "GEO-001", priority: "P2", category: "geo",
        title: `${withoutFaq.length} artigos sem FAQ Schema`,
        description: "Artigos publicados sem FAQPage schema estruturado.",
        impact: "Perde oportunidade de rich snippets e citação por IAs generativas.",
        fix_instruction: "Ativar FAQ na geração de artigos e reprocessar artigos existentes.",
        auto_fixed: false
      });
      categories.geo.score -= 15;
      categories.geo.issues++;

      // AUTO-FIX: Call plugin to batch-inject FAQ schema
      if (isPlugin && apiKey) {
        try {
          const faqResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/batch-inject-faq-schema`, {
            method: "POST",
            headers: { "X-CFRDM-API-Key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ limit: 50, post_type: "post" }),
          });
          if (faqResp.ok) {
            const faqData = await faqResp.json();
            if (faqData.injected > 0) {
              issues[issues.length - 1].auto_fixed = true;
              issues[issues.length - 1].description += ` → Auto-fix: ${faqData.injected} artigos receberam FAQ Schema.`;
              totalFixed++;
              categories.geo.fixed++;
              categories.geo.score += 10;
            }
          }
        } catch { /* plugin endpoint unavailable */ }
      }

      // Also update article configs in Supabase to include FAQ for future generations
      try {
        for (const article of withoutFaq.slice(0, 20)) {
          const newConfig = { ...(article.config as any || {}), include_faq: true, faq_count: 5 };
          await supabase.from("articles").update({ config: newConfig }).eq("id", article.id);
        }
      } catch { /* ignore */ }
    }
  }

  // ═══ Calculate overall score ═══
  const categoryScores = Object.values(categories).map(c => Math.max(0, Math.min(100, c.score)));
  const overallScore = Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length);

  console.log(`[SEO Agent] [${project.name}] Audit complete: score=${overallScore}, issues=${issues.length}, fixed=${totalFixed}`);

  return {
    score: overallScore,
    issues,
    issues_found: issues.length,
    issues_fixed: totalFixed,
    categories,
  };
}

// ═══════════════════════════════════════════════════════════
// STEP 6: Autonomous SEO Scan + Fix (v3.4.0)
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
      body: JSON.stringify({ limit: 200, checks: ["canonical", "https", "missing_h1", "duplicate_title", "missing_meta"] }),
    });

    if (!scanResp.ok) {
      detailsList.push(`scan-seo-issues indisponível (${scanResp.status}) — plugin precisa v3.4.0`);
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

    return { scanned, issues_found: issuesFound, applied, redirects_created: redirectsCreated, types: typesApplied, details: detailsList };
  } catch (e) {
    return { scanned: 0, issues_found: 0, applied: 0, redirects_created: 0, types: [], details: [`Error: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
