/**
 * Auto-Fix Orphan Articles — Runs every 6 hours
 * 
 * 1. Scans ALL projects for orphan pages (0 internal links pointing to them)
 * 2. Uses AI (Gemini + OpenAI fallback) to generate contextual internal links
 * 3. Applies links to high-traffic/old articles via WordPress API
 * 4. Submits fixed pages for re-indexing (IndexNow + Google)
 * 5. Sends notifications with results
 */

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

  try {
    const body = await req.json().catch(() => ({}));
    const targetProjectId = body.project_id || null;
    const targetUserId = body.user_id || null;

    console.log(`[OrphanFixer] Starting automated orphan fix cycle`);

    // Fetch all connected WordPress projects
    let query = supabase
      .from("projects")
      .select("id, user_id, name, domain, wordpress_url, wordpress_username, wordpress_app_password, seo_plugin, nicho, marca, empresa_nome, compliance_rules")
      .eq("is_connected", true)
      .not("wordpress_url", "is", null);

    if (targetUserId) query = query.eq("user_id", targetUserId);
    if (targetProjectId) query = query.eq("id", targetProjectId);

    const { data: projects, error: projErr } = await query;
    if (projErr) throw projErr;

    if (!projects || projects.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No connected projects", fixed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[OrphanFixer] Processing ${projects.length} projects`);
    const allResults = [];

    for (const project of projects) {
      let orchestrator = getOrchestrator();
      try {
        orchestrator = await getOrchestratorForUser(project.user_id);
      } catch {
        console.warn(`[OrphanFixer] BYOK failed for ${project.user_id}, using defaults`);
      }

      const baseUrl = project.wordpress_url?.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "") || "";
      const isPlugin = project.wordpress_username === "__CFRDM_PLUGIN__";
      const apiKey = project.wordpress_app_password || "";

      if (!baseUrl || !isPlugin || !apiKey) {
        console.log(`[OrphanFixer] [${project.name}] Skipped — no plugin connection`);
        continue;
      }

      try {
        const result = await processProjectOrphans(supabase, orchestrator, project, baseUrl, apiKey);
        allResults.push({ project: project.name, ...result });

        // Send notification if work was done
        if (result.orphansFound > 0) {
          const parts = [];
          if (result.linksApplied > 0) parts.push(`${result.linksApplied} links aplicados`);
          if (result.linksSuggested > 0) parts.push(`${result.linksSuggested} sugestões geradas`);
          if (result.indexingSubmitted > 0) parts.push(`${result.indexingSubmitted} URLs re-indexadas`);
          parts.push(`${result.orphansFound} órfãos detectados, ${result.orphansFixed} corrigidos`);

          await supabase.from("cron_notifications").insert({
            user_id: project.user_id,
            title: "🔗 Correção Automática de Páginas Órfãs",
            message: `${project.name}: ${parts.join(" | ")}`,
            type: "orphan_fix",
            metadata: {
              project_id: project.id,
              project_name: project.name,
              ...result,
            },
          });
        }

        console.log(`[OrphanFixer] [${project.name}] Done: ${result.orphansFound} orphans, ${result.linksApplied} links applied`);
      } catch (err) {
        console.error(`[OrphanFixer] [${project.name}] Error:`, err);
        allResults.push({ project: project.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, projects: allResults.length, results: allResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[OrphanFixer] Fatal:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ═══════════════════════════════════════════════════════════
// Main processor per project
// ═══════════════════════════════════════════════════════════
async function processProjectOrphans(
  supabase: ReturnType<typeof createClient>,
  orchestrator: ReturnType<typeof getOrchestrator>,
  project: any,
  baseUrl: string,
  apiKey: string,
) {
  let orphansFound = 0;
  let orphansFixed = 0;
  let linksSuggested = 0;
  let linksApplied = 0;
  let indexingSubmitted = 0;
  const fixDetails: string[] = [];

  // ══════════════════════════════════════
  // PHASE 1: Detect orphan articles
  // ══════════════════════════════════════
  const { data: orphans } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, topic_cluster, internal_links_count, word_count, seo_score, semantic_summary")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .lte("internal_links_count", 0)
    .order("word_count", { ascending: false }) // prioritize longer/important content
    .limit(1000); // Process ALL orphans — zero artificial limits

  if (!orphans || orphans.length === 0) {
    return { orphansFound: 0, orphansFixed: 0, linksSuggested: 0, linksApplied: 0, indexingSubmitted: 0, details: [] };
  }

  orphansFound = orphans.length;
  console.log(`[OrphanFixer] [${project.name}] Found ${orphansFound} orphan articles`);

  // ══════════════════════════════════════
  // PHASE 2: Get ALL articles for linking context
  // ══════════════════════════════════════
  const { data: allArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, topic_cluster, semantic_summary, internal_links_count, word_count")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .order("word_count", { ascending: false })
    .limit(1000); // Full article base for maximum cross-linking

  if (!allArticles || allArticles.length < 2) {
    return { orphansFound, orphansFixed: 0, linksSuggested: 0, linksApplied: 0, indexingSubmitted: 0, details: ["Not enough articles for linking"] };
  }

  // Identify high-traffic/high-linkability articles as best link sources
  // Use ALL published articles as potential link sources (no arbitrary cap)
  const linkSources = allArticles
    .filter(a => (a.internal_links_count || 0) >= 1 && (a.word_count || 0) >= 300);

  const urlToArticle = new Map(allArticles.map(a => [a.wp_post_url, a]));

  // ══════════════════════════════════════
  // PHASE 3: AI generates contextual links for each orphan batch
  // ══════════════════════════════════════
  const orphanBatches = chunkArray(orphans, 5); // Process 5 orphans per AI call for throughput

  for (const batch of orphanBatches) {
    try {
      const orphanDescriptions = batch
        .map(o => `• "${o.wp_post_title}" (URL: ${o.wp_post_url}, kw: ${o.primary_keyword || "N/A"}, cluster: ${o.topic_cluster || "N/A"}, ${o.word_count || 0} palavras)`)
        .join("\n");

      const sourceDescriptions = linkSources.slice(0, 80)
        .map(a => `• [${a.wp_post_title}](${a.wp_post_url}) | kw: ${a.primary_keyword || "N/A"} | cluster: ${a.topic_cluster || "N/A"} | ${a.word_count || 0}p`)
        .join("\n");

      const prompt = `Você é um consultor SEO especializado em Internal Linking.

ARTIGOS ÓRFÃOS (sem links internos apontando para eles):
${orphanDescriptions}

ARTIGOS EXISTENTES (potenciais fontes de link):
${sourceDescriptions}

TAREFA:
Para CADA artigo órfão, identifique os 3-5 melhores artigos existentes que deveriam linkar para ele.

REGRAS OBRIGATÓRIAS:
1. O anchor_text deve ter 2-5 palavras descritivas (use keywords relevantes)
2. O link deve ser CONTEXTUALMENTE relevante (mesmo cluster/tema)
3. Prefira artigos longos (>800 palavras) como fonte de links
4. O anchor_text deve ser natural e variado (nunca repetir o mesmo)
5. Sugira também onde no conteúdo o link deveria ser inserido (posição: introdução, meio, conclusão)
6. Se o artigo órfão for um pilar de conteúdo (>2000 palavras), sugira adicioná-lo ao menu/rodapé

FORMATO JSON OBRIGATÓRIO:
{
  "fixes": [
    {
      "orphan_url": "url_do_orfao",
      "orphan_title": "título",
      "is_pillar": true/false,
      "suggest_menu": true/false,
      "links": [
        {
          "source_url": "url_do_artigo_fonte",
          "source_post_id": 123,
          "anchor_text": "texto âncora descritivo",
          "position": "introdução|meio|conclusão",
          "relevance": 85,
          "reason": "motivo breve da relevância"
        }
      ]
    }
  ]
}`;

      const aiResult = await orchestrator.call("seo_analysis", [
        {
          role: "system",
          content: `Especialista SEO brasileiro em Internal Linking Matrix. Nicho: ${project.nicho || "geral"}. Retorne APENAS JSON válido, sem markdown.`,
        },
        { role: "user", content: prompt },
      ], { maxTokens: 4000, temperature: 0.2 });

      const jsonStr = aiResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      let fixes;
      try {
        fixes = JSON.parse(jsonStr);
      } catch {
        // Resilient: extract partial JSON even if truncated
        try {
          // Find the start of fixes array
          const fixesStart = jsonStr.indexOf('"fixes"');
          if (fixesStart === -1) {
            console.warn(`[OrphanFixer] No "fixes" key found, skipping batch`);
            continue;
          }
          
          // Take everything from the opening brace
          let candidate = jsonStr.substring(jsonStr.lastIndexOf('{', fixesStart));
          
          // Close any unclosed brackets/braces
          const opens = { '[': 0, '{': 0 };
          const closes: Record<string, string> = { '[': ']', '{': '}' };
          for (const ch of candidate) {
            if (ch === '[' || ch === '{') opens[ch]++;
            if (ch === ']') opens['[']--;
            if (ch === '}') opens['{']--;
          }
          
          // Remove trailing comma if present before closing
          candidate = candidate.replace(/,\s*$/, '');
          candidate += ']'.repeat(Math.max(0, opens['[']));
          candidate += '}'.repeat(Math.max(0, opens['{']));
          
          fixes = JSON.parse(candidate);
        } catch (e2) {
          console.warn(`[OrphanFixer] JSON repair failed: ${e2 instanceof Error ? e2.message : e2}`);
          continue;
        }
      }

      if (!fixes?.fixes || !Array.isArray(fixes.fixes)) continue;

      // ══════════════════════════════════════
      // PHASE 4: Apply links via WordPress API
      // ══════════════════════════════════════
      for (const fix of fixes.fixes) {
        if (!fix.links || !Array.isArray(fix.links)) continue;

        const orphanArticle = batch.find(o => o.wp_post_url === fix.orphan_url);
        if (!orphanArticle) continue;

        let fixedThisOrphan = false;

        for (const link of fix.links) {
          if (!link.source_url || !link.anchor_text) continue;

          const sourceArticle = urlToArticle.get(link.source_url) || 
            allArticles.find(a => a.wp_post_id === link.source_post_id);

          if (!sourceArticle?.wp_post_id) continue;

          // Save suggestion to DB
          await supabase.from("internal_link_suggestions").insert({
            user_id: project.user_id,
            project_id: project.id,
            anchor_text: link.anchor_text,
            target_url: fix.orphan_url,
            relevance_score: link.relevance || 75,
            status: "pending",
            source_wp_post_id: sourceArticle.wp_post_id,
            target_wp_post_id: orphanArticle.wp_post_id,
            position_suggestion: link.position || null,
            anchor_context: `OrphanFixer: ${link.reason || "auto-detected"}`,
          });
          linksSuggested++;

          // Auto-apply if relevance >= 75
          if ((link.relevance || 0) >= 75) {
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
                  anchor_text: link.anchor_text,
                  target_url: fix.orphan_url,
                  position: link.position || "auto",
                }),
              });

              if (applyResp.ok) {
                const applyData = await applyResp.json();
                if (applyData.success || applyData.applied) {
                  linksApplied++;
                  fixedThisOrphan = true;
                  fixDetails.push(`✅ "${link.anchor_text}" em post ${sourceArticle.wp_post_id} → ${orphanArticle.wp_post_title}`);

                  // Update suggestion status
                  await supabase
                    .from("internal_link_suggestions")
                    .update({ status: "applied", applied_at: new Date().toISOString() })
                    .eq("project_id", project.id)
                    .eq("source_wp_post_id", sourceArticle.wp_post_id)
                    .eq("target_url", fix.orphan_url)
                    .eq("status", "pending");
                }
              } else if (applyResp.status === 422) {
                // 422 = content doesn't support insertion — try WP REST API direct append
                console.warn(`[OrphanFixer] Post ${sourceArticle.wp_post_id} returned 422, trying WP REST API fallback`);
                try {
                  const wpPost = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${sourceArticle.wp_post_id}`, {
                    headers: { "X-CFRDM-API-Key": apiKey },
                  });
                  if (wpPost.ok) {
                    const wpData = await wpPost.json();
                    const currentContent = wpData.content?.raw || wpData.content?.rendered || "";
                    if (currentContent.length > 50 && !currentContent.includes(fix.orphan_url)) {
                      const linkHtml = `\n<p><strong>📖 Leia também:</strong> <a href="${fix.orphan_url}" title="${orphanArticle.wp_post_title}">${link.anchor_text}</a></p>\n`;
                      const updateResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${sourceArticle.wp_post_id}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
                        body: JSON.stringify({ content: currentContent + linkHtml }),
                      });
                      if (updateResp.ok) {
                        linksApplied++;
                        fixedThisOrphan = true;
                        fixDetails.push(`✅ (fallback) "${link.anchor_text}" appended to post ${sourceArticle.wp_post_id}`);
                        await supabase
                          .from("internal_link_suggestions")
                          .update({ status: "applied", applied_at: new Date().toISOString() })
                          .eq("project_id", project.id)
                          .eq("source_wp_post_id", sourceArticle.wp_post_id)
                          .eq("target_url", fix.orphan_url)
                          .eq("status", "pending");
                      }
                    }
                  }
                } catch (fallbackErr) {
                  console.warn(`[OrphanFixer] WP REST fallback also failed for post ${sourceArticle.wp_post_id}:`, fallbackErr);
                }

                // Mark as rejected to avoid re-trying indefinitely
                await supabase
                  .from("internal_link_suggestions")
                  .update({ status: "rejected", rejected_reason: "422: content does not support insertion" })
                  .eq("project_id", project.id)
                  .eq("source_wp_post_id", sourceArticle.wp_post_id)
                  .eq("target_url", fix.orphan_url)
                  .eq("status", "pending");
              }
            } catch (e) {
              console.warn(`[OrphanFixer] Apply failed for post ${sourceArticle.wp_post_id}:`, e);
            }
          }
        }

        // Update orphan's internal_links_count if fixed
        if (fixedThisOrphan) {
          orphansFixed++;
          await supabase
            .from("wordpress_article_index")
            .update({
              internal_links_count: Math.max(1, (orphanArticle.internal_links_count || 0) + linksApplied),
              updated_at: new Date().toISOString(),
            })
            .eq("id", orphanArticle.id);
        }

        // If pillar content, suggest menu/footer addition
        if (fix.suggest_menu && fix.is_pillar) {
          fixDetails.push(`📌 PILAR detectado: "${orphanArticle.wp_post_title}" — sugerir adição ao menu/rodapé`);
          
          // Try to add to menu via plugin
          try {
            await fetch(`${baseUrl}/wp-json/cfrdm/v1/suggest-menu-item`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CFRDM-API-Key": apiKey,
              },
              body: JSON.stringify({
                post_id: orphanArticle.wp_post_id,
                title: orphanArticle.wp_post_title,
                url: orphanArticle.wp_post_url,
                position: "footer",
              }),
            });
          } catch { /* optional feature */ }
        }
      }
    } catch (e) {
      console.error(`[OrphanFixer] [${project.name}] AI batch error:`, e);
    }
  }

  // ══════════════════════════════════════
  // PHASE 5: Re-index fixed pages
  // ══════════════════════════════════════
  if (linksApplied > 0) {
    const fixedUrls = orphans
      .slice(0, linksApplied + 5)
      .map(o => o.wp_post_url)
      .filter(Boolean);

    if (fixedUrls.length > 0) {
      // IndexNow batch
      try {
        const indexResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CFRDM-API-Key": apiKey,
          },
          body: JSON.stringify({ urls: fixedUrls }),
        });

        if (indexResp.ok) {
          const indexData = await indexResp.json();
          indexingSubmitted = indexData.submitted || fixedUrls.length;
        }
      } catch {
        // Direct IndexNow fallback
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
              urlList: fixedUrls,
            }),
          });
          indexingSubmitted = fixedUrls.length;
        } catch { /* ignore */ }
      }

      // Google Indexing API via plugin
      try {
        await fetch(`${baseUrl}/wp-json/cfrdm/v1/google-indexing/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CFRDM-API-Key": apiKey,
          },
          body: JSON.stringify({ urls: fixedUrls }),
        });
      } catch { /* optional */ }

      // Ping sitemaps
      const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
      try { await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(siteRoot + "/wp-sitemap.xml")}`); } catch { /* */ }
      try { await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(siteRoot + "/wp-sitemap.xml")}`); } catch { /* */ }
    }
  }

  // ══════════════════════════════════════
  // PHASE 6: Also apply any PENDING suggestions from previous runs
  // ══════════════════════════════════════
  const { data: pendingLinks } = await supabase
    .from("internal_link_suggestions")
    .select("id, source_wp_post_id, anchor_text, target_url, relevance_score")
    .eq("project_id", project.id)
    .eq("status", "pending")
    .gte("relevance_score", 70)
    .order("relevance_score", { ascending: false })
    .limit(500); // Process ALL pending links

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
          const data = await applyResp.json();
          if (data.success || data.applied) {
            linksApplied++;
            await supabase
              .from("internal_link_suggestions")
              .update({ status: "applied", applied_at: new Date().toISOString() })
              .eq("id", link.id);
          } else {
            await supabase
              .from("internal_link_suggestions")
              .update({ status: "rejected", rejected_reason: data.reason || "anchor not found" })
              .eq("id", link.id);
          }
        }
      } catch { /* continue */ }
    }
  }

  return {
    orphansFound,
    orphansFixed,
    linksSuggested,
    linksApplied,
    indexingSubmitted,
    details: fixDetails,
  };
}

// ═══════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
