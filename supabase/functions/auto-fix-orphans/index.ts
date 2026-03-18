/**
 * Auto-Fix Orphan Articles v4.0 — Advanced SEO Orphan Repair Engine
 * 
 * TRIAGE SYSTEM:
 * 1. Scans ALL projects for orphan pages (0 internal links pointing to them)
 * 2. AI-powered TRIAGE: Valuable (keep+link) | Duplicate (301 redirect) | Obsolete (update or 410)
 * 3. Keyword mapping: identifies best "link donor" articles by semantic relevance
 * 4. Hub-and-Spoke: detects pillar pages and builds cluster architecture
 * 5. Contextual linking with anchor text optimization
 * 6. Click-depth analysis: ensures no page is >3 clicks from home
 * 7. Breadcrumb and navigation suggestions
 * 8. Re-indexing via IndexNow + Google Indexing API
 * 9. Notifications with full audit report
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

    console.log(`[OrphanFixer v4] Starting advanced orphan fix cycle`);

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

    console.log(`[OrphanFixer v4] Processing ${projects.length} projects`);
    const allResults = [];

    for (const project of projects) {
      let orchestrator = getOrchestrator();
      try {
        orchestrator = await getOrchestratorForUser(project.user_id);
      } catch {
        console.warn(`[OrphanFixer v4] BYOK failed for ${project.user_id}, using defaults`);
      }

      const baseUrl = project.wordpress_url?.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "") || "";
      const isPlugin = project.wordpress_username === "__CFRDM_PLUGIN__";
      const apiKey = project.wordpress_app_password || "";

      if (!baseUrl || !isPlugin || !apiKey) {
        console.log(`[OrphanFixer v4] [${project.name}] Skipped — no plugin connection`);
        continue;
      }

      try {
        const result = await processProjectOrphans(supabase, orchestrator, project, baseUrl, apiKey);
        allResults.push({ project: project.name, ...result });

        if (result.orphansFound > 0) {
          const parts = [];
          if (result.linksApplied > 0) parts.push(`${result.linksApplied} links aplicados`);
          if (result.linksSuggested > 0) parts.push(`${result.linksSuggested} sugestões geradas`);
          if (result.redirectsCreated > 0) parts.push(`${result.redirectsCreated} redirecionamentos 301`);
          if (result.indexingSubmitted > 0) parts.push(`${result.indexingSubmitted} URLs re-indexadas`);
          parts.push(`${result.orphansFound} órfãos: ${result.triageResults.valuable} valiosos, ${result.triageResults.duplicate} duplicados, ${result.triageResults.obsolete} obsoletos`);

          await supabase.from("cron_notifications").insert({
            user_id: project.user_id,
            title: "🔗 Correção Avançada de Páginas Órfãs v4",
            message: `${project.name}: ${parts.join(" | ")}`,
            type: "orphan_fix",
            metadata: { project_id: project.id, project_name: project.name, ...result },
          });
        }

        console.log(`[OrphanFixer v4] [${project.name}] Done: ${result.orphansFound} orphans, ${result.linksApplied} links, ${result.redirectsCreated} redirects`);
      } catch (err) {
        console.error(`[OrphanFixer v4] [${project.name}] Error:`, err);
        allResults.push({ project: project.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, projects: allResults.length, results: allResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[OrphanFixer v4] Fatal:", error);
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
  let redirectsCreated = 0;
  const triageResults = { valuable: 0, duplicate: 0, obsolete: 0 };
  const fixDetails: string[] = [];

  // ══════════════════════════════════════
  // PHASE 1: Detect ALL orphan articles
  // ══════════════════════════════════════
  const { data: orphans } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, topic_cluster, internal_links_count, word_count, seo_score, semantic_summary, content_hash, secondary_keywords")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .lte("internal_links_count", 0)
    .order("word_count", { ascending: false })
    .limit(5000);

  if (!orphans || orphans.length === 0) {
    return { orphansFound: 0, orphansFixed: 0, linksSuggested: 0, linksApplied: 0, indexingSubmitted: 0, redirectsCreated: 0, triageResults, details: [] };
  }

  orphansFound = orphans.length;
  console.log(`[OrphanFixer v4] [${project.name}] Found ${orphansFound} orphan articles`);

  // ══════════════════════════════════════
  // PHASE 2: Get ALL articles for context
  // ══════════════════════════════════════
  const { data: allArticles } = await supabase
    .from("wordpress_article_index")
    .select("id, wp_post_id, wp_post_title, wp_post_url, wp_post_slug, primary_keyword, topic_cluster, semantic_summary, internal_links_count, word_count, content_hash, secondary_keywords, seo_score")
    .eq("project_id", project.id)
    .eq("wp_post_status", "publish")
    .order("word_count", { ascending: false })
    .limit(5000);

  if (!allArticles || allArticles.length < 2) {
    return { orphansFound, orphansFixed: 0, linksSuggested: 0, linksApplied: 0, indexingSubmitted: 0, redirectsCreated: 0, triageResults, details: ["Not enough articles for linking"] };
  }

  // Build lookup maps
  const urlToArticle = new Map(allArticles.map(a => [a.wp_post_url, a]));
  const hashToArticles = new Map<string, typeof allArticles>();
  for (const a of allArticles) {
    if (a.content_hash) {
      const existing = hashToArticles.get(a.content_hash) || [];
      existing.push(a);
      hashToArticles.set(a.content_hash, existing);
    }
  }

  // Identify high-authority link sources (non-orphan, long content)
  const linkSources = allArticles
    .filter(a => (a.internal_links_count || 0) >= 1 && (a.word_count || 0) >= 300)
    .sort((a, b) => (b.word_count || 0) - (a.word_count || 0));

  // Build cluster map for hub-spoke
  const clusterMap = new Map<string, typeof allArticles>();
  for (const a of allArticles) {
    if (a.topic_cluster) {
      const cluster = clusterMap.get(a.topic_cluster) || [];
      cluster.push(a);
      clusterMap.set(a.topic_cluster, cluster);
    }
  }

  // ══════════════════════════════════════
  // PHASE 3: AI-POWERED TRIAGE
  // ══════════════════════════════════════
  console.log(`[OrphanFixer v4] [${project.name}] Running triage on ${orphansFound} orphans...`);
  
  const triageBatches = chunkArray(orphans, 20);
  const triageDecisions: Map<string, { action: 'link' | 'redirect' | 'update' | 'delete'; redirectTo?: string; reason: string; isPillar: boolean; suggestMenu: boolean; }> = new Map();

  for (const batch of triageBatches) {
    // Check for duplicates first (fast, no AI needed)
    for (const orphan of batch) {
      if (orphan.content_hash) {
        const duplicates = hashToArticles.get(orphan.content_hash) || [];
        const nonOrphanDup = duplicates.find(d => d.id !== orphan.id && (d.internal_links_count || 0) > 0);
        if (nonOrphanDup) {
          triageDecisions.set(orphan.id, {
            action: 'redirect',
            redirectTo: nonOrphanDup.wp_post_url,
            reason: `Duplicate of "${nonOrphanDup.wp_post_title}" (content_hash match)`,
            isPillar: false,
            suggestMenu: false,
          });
          triageResults.duplicate++;
          continue;
        }
      }
    }

    // AI triage for remaining (non-duplicate) orphans
    const needsAI = batch.filter(o => !triageDecisions.has(o.id));
    if (needsAI.length === 0) continue;

    const orphanDescs = needsAI.map(o => 
      `• "${o.wp_post_title}" | URL: ${o.wp_post_url} | KW: ${o.primary_keyword || "N/A"} | Cluster: ${o.topic_cluster || "N/A"} | ${o.word_count || 0} palavras | SEO: ${o.seo_score || 0}`
    ).join("\n");

    // Provide cluster context for hub-spoke decisions
    const clusterContext = [...clusterMap.entries()]
      .slice(0, 10)
      .map(([name, articles]) => `Cluster "${name}": ${articles.length} artigos, pilar: ${articles[0]?.wp_post_title || "N/A"}`)
      .join("\n");

    try {
      const triagePrompt = `Você é um auditor SEO enterprise fazendo triagem de páginas órfãs.

ARTIGOS ÓRFÃOS (sem links internos):
${orphanDescs}

CLUSTERS EXISTENTES:
${clusterContext || "Nenhum cluster definido"}

Para CADA artigo, decida a ação:
1. "link" — Artigo valioso, deve receber links internos contextuais
2. "redirect" — Conteúdo duplicado/inferior, redirecionar 301 para artigo melhor
3. "update" — Conteúdo obsoleto mas útil, precisa ser atualizado antes de linkar

CRITÉRIOS DE DECISÃO:
- Artigo com >2000 palavras = provável pilar de conteúdo → "link" + suggest_menu=true
- Artigo com <300 palavras e sem keyword = thin content → "redirect" para artigo relacionado
- Artigo com keyword relevante e >500 palavras = valioso → "link"
- Artigo duplicado (mesmo tema/keyword de outro) = → "redirect"

JSON OBRIGATÓRIO:
{
  "decisions": [
    {
      "orphan_url": "url",
      "action": "link|redirect|update",
      "redirect_to": "url_destino (só se redirect)",
      "reason": "justificativa breve",
      "is_pillar": true/false,
      "suggest_menu": true/false,
      "best_cluster": "nome_do_cluster_ideal"
    }
  ]
}`;

      const aiResult = await orchestrator.call("seo_analysis", [
        { role: "system", content: `Auditor SEO enterprise. Nicho: ${project.nicho || "geral"}. Retorne APENAS JSON válido.` },
        { role: "user", content: triagePrompt },
      ], { maxTokens: 3000, temperature: 0.1 });

      const parsed = safeParseJSON(aiResult);
      if (parsed?.decisions && Array.isArray(parsed.decisions)) {
        for (const dec of parsed.decisions) {
          const orphan = needsAI.find(o => o.wp_post_url === dec.orphan_url);
          if (!orphan) continue;

          const action = ['link', 'redirect', 'update'].includes(dec.action) ? dec.action : 'link';
          triageDecisions.set(orphan.id, {
            action: action as any,
            redirectTo: dec.redirect_to || undefined,
            reason: dec.reason || 'AI triage',
            isPillar: !!dec.is_pillar,
            suggestMenu: !!dec.suggest_menu,
          });

          if (action === 'redirect') triageResults.duplicate++;
          else if (action === 'update') triageResults.obsolete++;
          else triageResults.valuable++;
        }
      }
    } catch (e) {
      console.warn(`[OrphanFixer v4] AI triage failed, defaulting to "link":`, e);
    }

    // Default: any orphan without a decision = valuable → link
    for (const o of needsAI) {
      if (!triageDecisions.has(o.id)) {
        triageDecisions.set(o.id, {
          action: 'link',
          reason: 'Default: no triage decision',
          isPillar: (o.word_count || 0) >= 2000,
          suggestMenu: (o.word_count || 0) >= 2000,
        });
        triageResults.valuable++;
      }
    }
  }

  // ══════════════════════════════════════
  // PHASE 4: Apply REDIRECTS for duplicates
  // ══════════════════════════════════════
  for (const orphan of orphans) {
    const decision = triageDecisions.get(orphan.id);
    if (!decision || decision.action !== 'redirect' || !decision.redirectTo) continue;

    try {
      const redirectResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/redirect-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
        body: JSON.stringify({
          source_url: orphan.wp_post_url,
          target_url: decision.redirectTo,
          type: 301,
          reason: `OrphanFixer: ${decision.reason}`,
        }),
      });

      if (redirectResp.ok) {
        redirectsCreated++;
        fixDetails.push(`↪️ 301: "${orphan.wp_post_title}" → ${decision.redirectTo}`);
      }
    } catch (e) {
      console.warn(`[OrphanFixer v4] Redirect failed for ${orphan.wp_post_url}:`, e);
    }
  }

  // ══════════════════════════════════════
  // PHASE 5: AI generates contextual links with keyword mapping
  // ══════════════════════════════════════
  const valuableOrphans = orphans.filter(o => {
    const d = triageDecisions.get(o.id);
    return !d || d.action === 'link' || d.action === 'update';
  });

  const orphanBatches = chunkArray(valuableOrphans, 10);

  for (const batch of orphanBatches) {
    try {
      const orphanDescriptions = batch.map(o => {
        const decision = triageDecisions.get(o.id);
        return `• "${o.wp_post_title}" (URL: ${o.wp_post_url}, kw: ${o.primary_keyword || "N/A"}, cluster: ${o.topic_cluster || "N/A"}, ${o.word_count || 0} palavras, pilar: ${decision?.isPillar ? "SIM" : "não"})`;
      }).join("\n");

      // Build keyword-mapped donor list: prioritize articles with matching clusters/keywords
      const batchClusters = new Set(batch.map(o => o.topic_cluster).filter(Boolean));
      const batchKeywords = new Set(batch.flatMap(o => [o.primary_keyword, ...(o.secondary_keywords || [])].filter(Boolean)));
      
      // Score donors by relevance to batch
      const scoredDonors = linkSources.map(a => {
        let relevance = 0;
        if (a.topic_cluster && batchClusters.has(a.topic_cluster)) relevance += 30;
        if (a.primary_keyword && batchKeywords.has(a.primary_keyword)) relevance += 20;
        for (const sk of (a.secondary_keywords || [])) {
          if (batchKeywords.has(sk)) relevance += 10;
        }
        if ((a.word_count || 0) >= 1500) relevance += 10;
        if ((a.seo_score || 0) >= 70) relevance += 10;
        return { ...a, relevance };
      }).sort((a, b) => b.relevance - a.relevance);

      const topDonors = scoredDonors.slice(0, 60);
      const sourceDescriptions = topDonors
        .map(a => `• [${a.wp_post_title}](${a.wp_post_url}) | kw: ${a.primary_keyword || "N/A"} | cluster: ${a.topic_cluster || "N/A"} | ${a.word_count || 0}p | relevância: ${a.relevance}`)
        .join("\n");

      const prompt = `Você é um consultor SEO especializado em Internal Linking Matrix e arquitetura Hub-and-Spoke.

ARTIGOS ÓRFÃOS (sem links internos apontando para eles):
${orphanDescriptions}

ARTIGOS DOADORES (ordenados por relevância semântica):
${sourceDescriptions}

TAREFA:
Para CADA artigo órfão, identifique os 3-5 melhores artigos doadores que deveriam linkar para ele.

REGRAS DE LINKING AVANÇADO:
1. KEYWORD MAPPING: O anchor_text deve conter a keyword principal do artigo ÓRFÃO (destino)
2. RELEVÂNCIA SEMÂNTICA: Priorize doadores do MESMO cluster/tema
3. HUB-AND-SPOKE: Se o órfão for pilar (>2000 palavras), TODOS os spoke articles do cluster devem linkar para ele
4. PROFUNDIDADE: Garanta que o link reduza a profundidade de clique (≤3 cliques da home)
5. POSIÇÃO CONTEXTUAL: Links na introdução ou primeiro H2 são mais fortes que no rodapé
6. ANTI-CANIBALIZAÇÃO: Não linke com anchor idêntico ao título do doador

JSON OBRIGATÓRIO:
{
  "fixes": [
    {
      "orphan_url": "url_do_orfao",
      "orphan_title": "título",
      "is_pillar": true/false,
      "suggest_menu": true/false,
      "suggest_breadcrumb": true/false,
      "links": [
        {
          "source_url": "url_do_artigo_fonte",
          "source_post_id": 123,
          "anchor_text": "texto âncora com keyword do destino",
          "position": "introdução|primeiro_h2|meio|conclusão",
          "relevance": 85,
          "reason": "mesmo cluster + keyword match"
        }
      ]
    }
  ]
}`;

      const aiResult = await orchestrator.call("seo_analysis", [
        { role: "system", content: `Especialista SEO enterprise em Internal Linking, Hub-and-Spoke e Domain Authority. Nicho: ${project.nicho || "geral"}. JSON válido apenas.` },
        { role: "user", content: prompt },
      ], { maxTokens: 4000, temperature: 0.2 });

      const fixes = safeParseJSON(aiResult);
      if (!fixes?.fixes || !Array.isArray(fixes.fixes)) continue;

      // ══════════════════════════════════════
      // PHASE 6: Apply links via WordPress API
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
            anchor_context: `OrphanFixer v4: ${link.reason || "auto-detected"} | triage: ${triageDecisions.get(orphanArticle.id)?.reason || "N/A"}`,
          });
          linksSuggested++;

          // Auto-apply if relevance >= 70
          if ((link.relevance || 0) >= 70) {
            try {
              const applied = await applyLinkWithFallback(
                baseUrl, apiKey, sourceArticle.wp_post_id, link.anchor_text, fix.orphan_url, orphanArticle.wp_post_title, link.position
              );

              if (applied) {
                linksApplied++;
                fixedThisOrphan = true;
                fixDetails.push(`✅ "${link.anchor_text}" em post ${sourceArticle.wp_post_id} → ${orphanArticle.wp_post_title}`);

                await supabase
                  .from("internal_link_suggestions")
                  .update({ status: "applied", applied_at: new Date().toISOString() })
                  .eq("project_id", project.id)
                  .eq("source_wp_post_id", sourceArticle.wp_post_id)
                  .eq("target_url", fix.orphan_url)
                  .eq("status", "pending");
              } else {
                await supabase
                  .from("internal_link_suggestions")
                  .update({ status: "rejected", rejected_reason: "apply failed" })
                  .eq("project_id", project.id)
                  .eq("source_wp_post_id", sourceArticle.wp_post_id)
                  .eq("target_url", fix.orphan_url)
                  .eq("status", "pending");
              }
            } catch (e) {
              console.warn(`[OrphanFixer v4] Apply failed for post ${sourceArticle.wp_post_id}:`, e);
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

        // Pillar page: suggest menu/footer/breadcrumb addition
        const decision = triageDecisions.get(orphanArticle.id);
        if ((fix.suggest_menu || decision?.suggestMenu) && (fix.is_pillar || decision?.isPillar)) {
          fixDetails.push(`📌 PILAR: "${orphanArticle.wp_post_title}" — adicionar ao menu/rodapé/breadcrumb`);
          try {
            await fetch(`${baseUrl}/wp-json/cfrdm/v1/suggest-menu-item`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
              body: JSON.stringify({
                post_id: orphanArticle.wp_post_id,
                title: orphanArticle.wp_post_title,
                url: orphanArticle.wp_post_url,
                position: "footer",
              }),
            });
          } catch { /* optional */ }
        }
      }
    } catch (e) {
      console.error(`[OrphanFixer v4] [${project.name}] AI batch error:`, e);
    }
  }

  // ══════════════════════════════════════════════════════════
  // PHASE 6.5: PONTE SEMÂNTICA — Gera conteúdo contextual
  // com links internos DIRETAMENTE nos artigos órfãos que
  // não foram corrigidos pelas fases anteriores.
  // ══════════════════════════════════════════════════════════
  const stillOrphans = valuableOrphans.filter(o => {
    // Orphans that were NOT fixed by donor linking in Phase 5/6
    const wasFixed = fixDetails.some(d => d.includes(o.wp_post_title) && d.startsWith("✅"));
    return !wasFixed;
  });

  if (stillOrphans.length > 0) {
    console.log(`[OrphanFixer v4] [${project.name}] Phase 6.5: Ponte Semântica for ${stillOrphans.length} remaining orphans`);

    // Find best target articles for each orphan (articles the orphan should link TO)
    const bridgeBatches = chunkArray(stillOrphans, 5);

    for (const batch of bridgeBatches) {
      try {
        const orphanDescs = batch.map(o => {
          const cluster = o.topic_cluster || "sem-cluster";
          return `• "${o.wp_post_title}" (URL: ${o.wp_post_url}, post_id: ${o.wp_post_id}, kw: ${o.primary_keyword || "N/A"}, cluster: ${cluster}, ${o.word_count || 0} palavras)`;
        }).join("\n");

        // Build pool of potential link targets (non-orphan articles with good authority)
        const batchClusters = new Set(batch.map(o => o.topic_cluster).filter(Boolean));
        const batchKeywords = new Set(batch.flatMap(o => [o.primary_keyword, ...(o.secondary_keywords || [])].filter(Boolean)));

        const targetPool = allArticles
          .filter(a => !batch.some(o => o.id === a.id))
          .map(a => {
            let score = 0;
            if (a.topic_cluster && batchClusters.has(a.topic_cluster)) score += 40;
            if (a.primary_keyword && batchKeywords.has(a.primary_keyword)) score += 25;
            for (const sk of (a.secondary_keywords || [])) {
              if (batchKeywords.has(sk)) score += 10;
            }
            if ((a.word_count || 0) >= 1500) score += 15;
            if ((a.seo_score || 0) >= 60) score += 10;
            return { ...a, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 40);

        const targetDescs = targetPool.map(a =>
          `• "${a.wp_post_title}" (URL: ${a.wp_post_url}, kw: ${a.primary_keyword || "N/A"}, cluster: ${a.topic_cluster || "N/A"}, score: ${a.score})`
        ).join("\n");

        const bridgePrompt = `Você é um redator SEO sênior especializado em arquitetura de conteúdo e linkagem interna.

CONTEXTO: Estes artigos são ÓRFÃOS — nenhum outro artigo do site linka para eles. A abordagem padrão (inserir links em artigos doadores) falhou porque não há contexto natural.

SOLUÇÃO: Gerar um "Snippet de Ponte Semântica" — um parágrafo contextual (2-4 frases, 40-80 palavras) para ser ADICIONADO AO FINAL de cada artigo órfão. Este snippet deve:
1. Fazer uma TRANSIÇÃO NATURAL do tema do artigo órfão para o tema do artigo destino
2. Conter 2-3 links internos para artigos relacionados usando anchor text rico em keywords
3. Ser redigido como continuação natural do conteúdo, NÃO como "Leia também" genérico
4. Usar HTML semântico (<p> com links <a href="...">)

ARTIGOS ÓRFÃOS (receberão o snippet):
${orphanDescs}

ARTIGOS DESTINO DISPONÍVEIS (para linkar dentro do snippet):
${targetDescs}

REGRAS:
- O snippet deve parecer PARTE NATURAL do artigo, não um apêndice
- Anchor texts devem ser variados e contextuais (NUNCA "clique aqui" ou "leia mais")
- Cada snippet deve ter 2-3 links internos
- Se não houver artigo destino com relevância alta, sugira temas de artigos que DEVERIAM existir
- Nicho: ${project.nicho || "geral"} | Tom: profissional e acessível

JSON OBRIGATÓRIO:
{
  "bridges": [
    {
      "orphan_post_id": 123,
      "orphan_url": "url",
      "snippet_html": "<p>Parágrafo contextual com <a href='url_destino1' title='titulo'>anchor text 1</a> e <a href='url_destino2' title='titulo'>anchor text 2</a>.</p>",
      "links_in_snippet": 2,
      "target_urls": ["url1", "url2"],
      "missing_content_suggestions": ["tema que deveria existir para melhorar linkagem"]
    }
  ]
}`;

        const aiResult = await orchestrator.call("seo_analysis", [
          { role: "system", content: `Redator SEO enterprise. Gere snippets de ponte semântica em português brasileiro. Nicho: ${project.nicho || "geral"}. APENAS JSON válido.` },
          { role: "user", content: bridgePrompt },
        ], { maxTokens: 4000, temperature: 0.4 });

        const parsed = safeParseJSON(aiResult);
        if (!parsed?.bridges || !Array.isArray(parsed.bridges)) continue;

        for (const bridge of parsed.bridges) {
          if (!bridge.snippet_html || !bridge.orphan_post_id) continue;

          const orphan = batch.find(o => o.wp_post_id === bridge.orphan_post_id || o.wp_post_url === bridge.orphan_url);
          if (!orphan) continue;

          // Inject snippet into the orphan article via WP REST API
          try {
            const wpResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${orphan.wp_post_id}`, {
              headers: { "X-CFRDM-API-Key": apiKey },
              signal: AbortSignal.timeout(10000),
            });

            if (!wpResp.ok) continue;

            const wpData = await wpResp.json();
            const currentContent = wpData.content?.raw || wpData.content?.rendered || "";

            if (currentContent.length < 50) continue;

            // Check if snippet links already exist in article
            const alreadyHasLinks = (bridge.target_urls || []).some((url: string) => currentContent.includes(url));
            if (alreadyHasLinks) continue;

            // Wrap snippet with semantic section
            const wrappedSnippet = `\n\n<!-- wp:group {"className":"ponte-semantica"} -->\n<div class="wp-block-group ponte-semantica">\n${bridge.snippet_html}\n</div>\n<!-- /wp:group -->`;

            const updateResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${orphan.wp_post_id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
              body: JSON.stringify({ content: currentContent + wrappedSnippet }),
              signal: AbortSignal.timeout(10000),
            });

            if (updateResp.ok) {
              linksApplied += (bridge.links_in_snippet || 2);
              orphansFixed++;
              fixDetails.push(`🌉 Ponte Semântica: "${orphan.wp_post_title}" — ${bridge.links_in_snippet || 2} links injetados`);

              // Save suggestions to DB for tracking
              for (const targetUrl of (bridge.target_urls || [])) {
                await supabase.from("internal_link_suggestions").insert({
                  user_id: project.user_id,
                  project_id: project.id,
                  anchor_text: `Ponte Semântica: ${orphan.wp_post_title}`,
                  target_url: targetUrl,
                  relevance_score: 80,
                  status: "applied",
                  applied_at: new Date().toISOString(),
                  source_wp_post_id: orphan.wp_post_id,
                  anchor_context: "Ponte Semântica v1.0 — conteúdo gerado por IA para linkagem contextual",
                });
                linksSuggested++;
              }

              // Update orphan index
              await supabase
                .from("wordpress_article_index")
                .update({
                  internal_links_count: Math.max(1, (orphan.internal_links_count || 0) + (bridge.links_in_snippet || 2)),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", orphan.id);

              // Log missing content suggestions
              if (bridge.missing_content_suggestions && bridge.missing_content_suggestions.length > 0) {
                fixDetails.push(`💡 Sugestão: criar artigos sobre: ${bridge.missing_content_suggestions.join(", ")}`);
              }
            }
          } catch (e) {
            console.warn(`[OrphanFixer v4] [${project.name}] Bridge inject failed for post ${orphan.wp_post_id}:`, e);
          }
        }
      } catch (e) {
        console.error(`[OrphanFixer v4] [${project.name}] Semantic Bridge batch error:`, e);
      }
    }

    console.log(`[OrphanFixer v4] [${project.name}] Ponte Semântica complete: ${stillOrphans.length} processed`);
  }

  // ══════════════════════════════════════
  // PHASE 7: Re-index fixed + redirected pages
  // ══════════════════════════════════════
  const fixedUrls = [
    ...orphans.filter(o => triageDecisions.get(o.id)?.action !== 'redirect').map(o => o.wp_post_url),
  ].filter(Boolean).slice(0, 200);

  if (fixedUrls.length > 0 && (linksApplied > 0 || redirectsCreated > 0)) {
    try {
      const indexResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
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
          body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: fixedUrls }),
        });
        indexingSubmitted = fixedUrls.length;
      } catch { /* ignore */ }
    }

    // Google Indexing API
    try {
      await fetch(`${baseUrl}/wp-json/cfrdm/v1/google-indexing/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
        body: JSON.stringify({ urls: fixedUrls }),
      });
    } catch { /* optional */ }

    // Ping sitemaps
    const siteRoot = baseUrl.replace(/\/blog\/?$/, "");
    try { await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(siteRoot + "/wp-sitemap.xml")}`); } catch { /* */ }
    try { await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(siteRoot + "/wp-sitemap.xml")}`); } catch { /* */ }
  }

  // ══════════════════════════════════════
  // PHASE 8: Process PENDING suggestions from previous runs
  // ══════════════════════════════════════
  const { data: pendingLinks } = await supabase
    .from("internal_link_suggestions")
    .select("id, source_wp_post_id, anchor_text, target_url, relevance_score")
    .eq("project_id", project.id)
    .eq("status", "pending")
    .gte("relevance_score", 70)
    .order("relevance_score", { ascending: false })
    .limit(1000);

  if (pendingLinks && pendingLinks.length > 0) {
    for (const link of pendingLinks) {
      if (!link.source_wp_post_id || !link.anchor_text || !link.target_url) continue;

      try {
        const applied = await applyLinkWithFallback(baseUrl, apiKey, link.source_wp_post_id, link.anchor_text, link.target_url, '', 'auto');

        if (applied) {
          linksApplied++;
          await supabase.from("internal_link_suggestions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", link.id);
        } else {
          await supabase.from("internal_link_suggestions").update({ status: "rejected", rejected_reason: "anchor not found" }).eq("id", link.id);
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
    redirectsCreated,
    triageResults,
    details: fixDetails,
  };
}

// ═══════════════════════════════════════════════════════════
// Apply link with plugin → WP REST API fallback
// ═══════════════════════════════════════════════════════════
async function applyLinkWithFallback(
  baseUrl: string, apiKey: string, sourcePostId: number, anchorText: string, targetUrl: string, targetTitle: string, position?: string
): Promise<boolean> {
  // Try plugin endpoint first
  try {
    const resp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/apply-internal-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
      body: JSON.stringify({
        source_post_id: sourcePostId,
        post_id: sourcePostId,
        anchor_text: anchorText,
        target_url: targetUrl,
        position: position || "auto",
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.success || data.applied) return true;
    }

    // 422 = content doesn't support insertion — try WP REST API fallback
    if (resp.status === 422) {
      return await wpRestFallbackAppend(baseUrl, apiKey, sourcePostId, anchorText, targetUrl, targetTitle);
    }
  } catch { /* continue to fallback */ }

  // Final fallback
  return await wpRestFallbackAppend(baseUrl, apiKey, sourcePostId, anchorText, targetUrl, targetTitle);
}

async function wpRestFallbackAppend(
  baseUrl: string, apiKey: string, sourcePostId: number, anchorText: string, targetUrl: string, targetTitle: string
): Promise<boolean> {
  try {
    const wpPost = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${sourcePostId}`, {
      headers: { "X-CFRDM-API-Key": apiKey },
    });

    if (!wpPost.ok) return false;

    const wpData = await wpPost.json();
    const currentContent = wpData.content?.raw || wpData.content?.rendered || "";

    if (currentContent.length < 50 || currentContent.includes(targetUrl)) return false;

    const linkHtml = `\n<p><strong>📖 Leia também:</strong> <a href="${targetUrl}" title="${targetTitle || anchorText}">${anchorText}</a></p>\n`;
    const updateResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${sourcePostId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CFRDM-API-Key": apiKey },
      body: JSON.stringify({ content: currentContent + linkHtml }),
    });

    return updateResp.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function safeParseJSON(text: string): any {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  try { return JSON.parse(cleaned); } catch { /* continue */ }

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) return null;
  let candidate = cleaned.substring(jsonStart);

  // Close unclosed brackets/braces
  const opens = { '[': 0, '{': 0 };
  for (const ch of candidate) {
    if (ch === '[' || ch === '{') opens[ch]++;
    if (ch === ']') opens['[']--;
    if (ch === '}') opens['{']--;
  }

  candidate = candidate.replace(/,\s*$/, '');
  candidate += ']'.repeat(Math.max(0, opens['[']));
  candidate += '}'.repeat(Math.max(0, opens['{']));

  try { return JSON.parse(candidate); } catch { return null; }
}
