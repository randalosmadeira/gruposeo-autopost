import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getOrchestrator } from "../_shared/ai-orchestrator.ts";
import { orchestrate } from "../_shared/verniz-orchestrator.ts";
import { setEnvKeysForUser } from "../_shared/byok-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// === ROBUST JSON EXTRACTION (anti-truncation) ===
function extractJsonFromAIResponse(response: string): any {
  // Step 1: Clean markdown wrappers
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Step 2: Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // Step 3: Find JSON boundaries
  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error("No JSON found in AI response");
  cleaned = cleaned.substring(jsonStart);

  // Step 4: Detect truncation
  const openBraces = (cleaned.match(/{/g) || []).length;
  const closeBraces = (cleaned.match(/}/g) || []).length;
  
  if (openBraces > closeBraces) {
    console.warn(`[AI SEO] Truncated JSON detected: ${openBraces} open vs ${closeBraces} close braces. Repairing...`);
    
    // Fix common truncation: unclosed strings
    // Check if we're inside a string value
    let inString = false;
    let lastQuoteIdx = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '"' && (i === 0 || cleaned[i-1] !== '\\')) {
        inString = !inString;
        lastQuoteIdx = i;
      }
    }
    
    if (inString && lastQuoteIdx > 0) {
      // Close the string
      cleaned = cleaned + '"';
    }
    
    // Add missing close braces
    const diff = openBraces - (cleaned.match(/}/g) || []).length;
    cleaned = cleaned + '}'.repeat(diff);
  }

  // Step 5: Fix common JSON issues
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' ? '\\n' : c === '\t' ? '\\t' : '');

  try {
    return JSON.parse(cleaned);
  } catch { /* continue to regex fallback */ }

  // Step 6: Regex field extraction as last resort
  console.warn("[AI SEO] JSON parse failed after repair. Trying regex extraction...");
  
  const fields: Record<string, string> = {};
  const fieldNames = [
    'content', 'optimized_content', 'title', 'optimized_title', 
    'meta_description', 'optimized_meta', 'slug', 'image_prompt'
  ];
  
  for (const field of fieldNames) {
    // Match field: "value" (handles multiline content)
    const regex = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)(?:(?<!\\\\)"\\s*(?:,|}))`);
    const match = cleaned.match(regex);
    if (match?.[1]) {
      fields[field] = match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  
  if (Object.keys(fields).length > 0) {
    console.log(`[AI SEO] Recovered ${Object.keys(fields).length} fields via regex: ${Object.keys(fields).join(', ')}`);
    return fields;
  }
  
  throw new Error("Could not extract JSON from AI response");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const orchestrator = getOrchestrator();

  try {
    const body = await req.json();
    const { article_ids, mode } = body;

    // --- BYOK: Fetch user's API keys from user_settings ---
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    
    if (token) {
      const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || serviceKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }).auth.getUser();

      if (user) {
        userId = user.id;
        await setEnvKeysForUser(user.id);

        const { data: settings } = await supabase
          .from("user_settings")
          .select("gemini_api_key, openai_api_key, anthropic_api_key")
          .eq("user_id", user.id)
          .single();

        if (settings) {
          orchestrator.setKeys({
            gemini: settings.gemini_api_key || undefined,
            openai: settings.openai_api_key || undefined,
            anthropic: settings.anthropic_api_key || undefined,
          });
          console.log("[AI SEO] BYOK keys loaded for orchestrator + gemini.ts runtime");
        }
      }
    }

    if (!article_ids || !Array.isArray(article_ids) || article_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "article_ids is required (array)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isOptimize = mode === "optimize";

    // Fetch articles
    const { data: articles, error: fetchErr } = await supabase
      .from("articles")
      .select("id, title, keyword, content, excerpt, slug, seo_score, word_count, status, project_id, published_url, secondary_keywords, type")
      .in("id", article_ids);

    if (fetchErr) throw fetchErr;
    if (!articles || articles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No articles found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch project data for context
    const projectIds = [...new Set(articles.map(a => a.project_id).filter(Boolean))];
    let projectsMap: Record<string, any> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, domain, wordpress_url, wordpress_username, wordpress_app_password, nicho, tom_padrao, compliance_rules, links_prioritarios, social_instagram, social_youtube, social_linkedin, social_twitter, social_tiktok, social_google_maps, social_linktree, cta_leads, cta_conclusao, cta_comunidade, empresa_nome, empresa_whatsapp, empresa_telefone, empresa_endereco")
        .in("id", projectIds);
      if (projects) {
        for (const p of projects) {
          projectsMap[p.id] = p;
        }
      }
    }

    // Fetch existing published articles for internal linking — EXPANDED to 100+ for better coverage
    let internalLinksMap: Record<string, Array<{title: string, url: string, keyword?: string, cluster?: string}>> = {};
    let orphanDataMap: Record<string, { orphanCount: number; totalArticles: number; duplicateHashes: Set<string> }> = {};
    
    for (const pid of projectIds) {
      const { data: publishedArticles } = await supabase
        .from("articles")
        .select("title, published_url, keyword")
        .eq("project_id", pid)
        .eq("status", "published")
        .not("published_url", "is", null)
        .limit(100);
      
      const articleLinks = (publishedArticles || [])
        .filter(a => a.published_url)
        .map(a => ({ title: a.title || a.keyword, url: a.published_url!, keyword: a.keyword }));

      const { data: wpIndexArticles } = await supabase
        .from("wordpress_article_index")
        .select("wp_post_title, wp_post_url, primary_keyword, topic_cluster, internal_links_count, content_hash")
        .eq("project_id", pid)
        .eq("wp_post_status", "publish")
        .order("linkability_score", { ascending: false })
        .limit(200);

      const wpLinks = (wpIndexArticles || [])
        .filter(a => a.wp_post_url)
        .map(a => ({ title: a.wp_post_title || a.primary_keyword || '', url: a.wp_post_url, keyword: a.primary_keyword || '', cluster: a.topic_cluster || '' }));

      // Orphan detection data
      const orphanCount = (wpIndexArticles || []).filter(a => (a.internal_links_count || 0) === 0).length;
      const totalArticles = (wpIndexArticles || []).length;
      const hashes = new Set<string>();
      const duplicateHashes = new Set<string>();
      for (const a of (wpIndexArticles || [])) {
        if (a.content_hash) {
          if (hashes.has(a.content_hash)) duplicateHashes.add(a.content_hash);
          hashes.add(a.content_hash);
        }
      }
      orphanDataMap[pid] = { orphanCount, totalArticles, duplicateHashes };

      const allLinks = [...articleLinks, ...wpLinks];
      const seen = new Set<string>();
      internalLinksMap[pid] = allLinks.filter(l => {
        if (seen.has(l.url)) return false;
        seen.add(l.url);
        return true;
      }).slice(0, 120);

      console.log(`[AI SEO] Internal links for project ${pid}: ${internalLinksMap[pid].length} | Orphans: ${orphanCount}/${totalArticles} | Duplicate hashes: ${duplicateHashes.size}`);
    }

    const results = [];

    for (const article of articles) {
      const content = article.content || "";
      const cleanContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const hasContent = cleanContent.length > 200;
      const project = article.project_id ? projectsMap[article.project_id] : null;
      const internalLinks = article.project_id ? (internalLinksMap[article.project_id] || []) : [];

      try {
        if (isOptimize) {
          if (!hasContent) {
            // GENERATE full content from scratch
            console.log(`[AI SEO] Generating full content for article ${article.id} (keyword: ${article.keyword})`);
            const generated = await generateFullContent(article, project, internalLinks, orchestrator);
            
            if (generated.content) {
              const newClean = generated.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              const wordCount = newClean.split(/\s+/).filter((w: string) => w.length > 0).length;
              const updatedArticle = { ...article, title: generated.title || article.title, excerpt: generated.excerpt || article.excerpt };
              const newAnalysis = analyzeContent(generated.content, newClean, updatedArticle, project);
              const newScore = Math.min(100, calculateScore(newAnalysis));

              const finalTitle = generated.title || article.keyword;
              const finalExcerpt = generated.excerpt || `Saiba tudo sobre ${article.keyword}. Guia completo com dicas práticas e informações atualizadas.`;
              
              const { error: updateErr } = await supabase.from("articles").update({
                content: generated.content,
                title: finalTitle,
                excerpt: finalExcerpt,
                slug: generated.slug || article.slug,
                word_count: wordCount,
                seo_score: newScore,
                status: "ready",
                image_prompt: generated.imagePrompt || null,
              }).eq("id", article.id);

              if (updateErr) {
                console.error(`[AI SEO] DB UPDATE FAILED for article ${article.id}:`, updateErr);
                throw new Error(`Falha ao salvar artigo: ${updateErr.message}`);
              }
              console.log(`[AI SEO] ✅ Article ${article.id} saved: title="${finalTitle}", content=${generated.content.length} chars, score=${newScore}`);

              // Generate image if we have a prompt
              if (generated.imagePrompt) {
                try {
                  await supabase.functions.invoke("generate-image", {
                    body: { articleId: article.id, prompt: generated.imagePrompt },
                  });
                } catch (imgErr) {
                  console.error(`[AI SEO] Image generation failed:`, imgErr);
                }
              }

              results.push({
                article_id: article.id,
                title: generated.title || article.title,
                keyword: article.keyword,
                score: newScore,
                optimized: true,
                generated: true,
                analysis: newAnalysis,
                ai: {
                  overall_grade: newScore >= 80 ? 'A' : newScore >= 60 ? 'B' : newScore >= 40 ? 'C' : 'D',
                  changes_made: ['Artigo completo gerado do zero', 'Título SEO otimizado', 'Meta description criada', 'Links internos inseridos', 'FAQ e CTAs adicionados'],
                  new_flesch_estimate: newAnalysis.flesch.score,
                },
                project_id: article.project_id,
                published_url: article.published_url,
                status: "ready",
              });
              continue;
            }
          } else {
            // OPTIMIZE existing content
            console.log(`[AI SEO] Optimizing existing content for article ${article.id}`);
            const localAnalysis = analyzeContent(content, cleanContent, article, project);
            const optimized = await optimizeExistingContent(article, localAnalysis, project, internalLinks, orchestrator);

            if (optimized.content) {
              const newClean = optimized.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              const wordCount = newClean.split(/\s+/).filter((w: string) => w.length > 0).length;
              const updatedArticle = { ...article, title: optimized.title || article.title, excerpt: optimized.excerpt || article.excerpt };
              const newAnalysis = analyzeContent(optimized.content, newClean, updatedArticle, project);
              const newScore = Math.min(100, calculateScore(newAnalysis));

              // Build changes list
              const changesMade: string[] = [];
              if (optimized.title && optimized.title !== article.title) changesMade.push(`Título: "${optimized.title}"`);
              if (optimized.excerpt && optimized.excerpt !== article.excerpt) changesMade.push(`Meta description atualizada (${optimized.excerpt.length} chars)`);
              if (newAnalysis.flesch.score > localAnalysis.flesch.score) changesMade.push(`Flesch: ${localAnalysis.flesch.score} → ${newAnalysis.flesch.score}`);
              if (newAnalysis.structure.internalLinks > localAnalysis.structure.internalLinks) changesMade.push(`Links internos: ${localAnalysis.structure.internalLinks} → ${newAnalysis.structure.internalLinks}`);
              if (newAnalysis.structure.hasFAQ && !localAnalysis.structure.hasFAQ) changesMade.push('FAQ adicionado');
              if (newAnalysis.structure.hasCTA && !localAnalysis.structure.hasCTA) changesMade.push('CTAs inseridos');
              if (newAnalysis.structure.hasConclusion && !localAnalysis.structure.hasConclusion) changesMade.push('Conclusão adicionada');
              if (wordCount > (article.word_count || 0)) changesMade.push(`Palavras: ${article.word_count || 0} → ${wordCount}`);
              if (changesMade.length === 0) changesMade.push('Conteúdo reescrito e otimizado');

              const finalOptTitle = optimized.title || article.title;
              const finalOptExcerpt = optimized.excerpt || article.excerpt || `Descubra tudo sobre ${article.keyword}. Informações completas e atualizadas.`;
              
              const { error: optUpdateErr } = await supabase.from("articles").update({
                content: optimized.content,
                title: finalOptTitle,
                excerpt: finalOptExcerpt,
                word_count: wordCount,
                seo_score: newScore,
              }).eq("id", article.id);

              if (optUpdateErr) {
                console.error(`[AI SEO] DB UPDATE FAILED for optimize ${article.id}:`, optUpdateErr);
                throw new Error(`Falha ao salvar otimização: ${optUpdateErr.message}`);
              }
              console.log(`[AI SEO] ✅ Article ${article.id} optimized: title="${finalOptTitle}", content=${optimized.content.length} chars, score=${newScore}`);

              // AUTO-REPUBLISH to WordPress if already published
              if (article.status === 'published' && article.published_url && project) {
                try {
                  console.log(`[AI SEO] Auto-republishing optimized article ${article.id} to WordPress...`);
                  await supabase.functions.invoke("publish-to-wordpress", {
                    body: {
                      articleId: article.id,
                      projectId: article.project_id,
                      updateExisting: true,
                    },
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  changesMade.push('✅ Republicado no WordPress automaticamente');
                  console.log(`[AI SEO] Auto-republish success for article ${article.id}`);
                } catch (pubErr) {
                  console.error(`[AI SEO] Auto-republish failed for ${article.id}:`, pubErr);
                  changesMade.push('⚠️ Republicação automática falhou — publique manualmente');
                }
              }

              results.push({
                article_id: article.id,
                title: optimized.title || article.title,
                keyword: article.keyword,
                score: newScore,
                optimized: true,
                generated: false,
                analysis: newAnalysis,
                ai: {
                  overall_grade: newScore >= 80 ? 'A' : newScore >= 60 ? 'B' : newScore >= 40 ? 'C' : 'D',
                  changes_made: changesMade,
                  optimized_title: optimized.title || undefined,
                  optimized_meta: optimized.excerpt || undefined,
                  new_flesch_estimate: newAnalysis.flesch.score,
                  critical_issues: newAnalysis.flesch.score < 60 ? ['Flesch ainda abaixo de 60 — requer outra passada'] : [],
                  improvements: buildImprovements(newAnalysis),
                },
                project_id: article.project_id,
                published_url: article.published_url,
                status: article.status,
              });
              continue;
            }
          }
        }

        // Fallback: analysis only (no optimization)
        const localAnalysis = analyzeContent(content, cleanContent, article, project);
        const score = Math.min(100, calculateScore(localAnalysis));
        await supabase.from("articles").update({ seo_score: score }).eq("id", article.id);
        
        results.push({
          article_id: article.id,
          title: article.title,
          keyword: article.keyword,
          score,
          optimized: false,
          generated: false,
          analysis: localAnalysis,
          ai: {
            overall_grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
            critical_issues: buildCriticalIssues(localAnalysis),
            improvements: buildImprovements(localAnalysis),
            flesch_tips: localAnalysis.flesch.score < 70 ? [
              `Flesch atual: ${localAnalysis.flesch.score}. Alvo: ≥70.`,
              `Média atual: ${localAnalysis.flesch.avgWordsPerSentence} palavras/frase. Alvo: ≤25.`,
              'Quebre frases longas em frases curtas de até 25 palavras.',
              'Use vocabulário simples e voz ativa.',
            ] : [],
            seo_tips: buildSEOTips(localAnalysis),
            content_tips: buildContentTips(localAnalysis),
          },
          project_id: article.project_id,
          published_url: article.published_url,
          status: article.status,
        });
      } catch (e) {
        console.error(`[AI SEO] Error processing article ${article.id}:`, e);
        results.push({
          article_id: article.id,
          title: article.title,
          keyword: article.keyword,
          score: 0,
          optimized: false,
          generated: false,
          error: e instanceof Error ? e.message : "unknown",
          analysis: null,
          ai: { error: e instanceof Error ? e.message : "unknown" },
          project_id: article.project_id,
          status: article.status,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results, mode: isOptimize ? "optimize" : "analyze" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[AI SEO Analysis] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// === Build helper functions for analysis results ===
function buildCriticalIssues(analysis: any): string[] {
  const issues: string[] = [];
  if (analysis.flesch.score < 60) issues.push(`Flesch ${analysis.flesch.score} — abaixo do mínimo (60). Conteúdo difícil de ler.`);
  if (analysis.structure.h2Count < 3) issues.push(`Apenas ${analysis.structure.h2Count} H2s — mínimo recomendado: 5.`);
  if (analysis.structure.internalLinks < 2) issues.push(`⚠️ PÁGINA ÓRFÃ: Apenas ${analysis.structure.internalLinks} links internos — sem linkagem interna o Google não rastreia. Execute o OrphanFixer.`);
  if (!analysis.structure.hasFAQ) issues.push('FAQ ausente — perde featured snippets e visibilidade em IAs generativas (GEO).');
  if (!analysis.meta.titleOk) issues.push(`Título com ${analysis.meta.titleLength} chars (ideal: 55-80).`);
  if (!analysis.meta.excerptOk) issues.push(`Meta description com ${analysis.meta.excerptLength} chars (ideal: 145-180).`);
  if (!analysis.structure.hasBreadcrumb) issues.push('Breadcrumb ausente — prejudica navegação e schema BreadcrumbList.');
  if (!analysis.structure.hasArticleSchema && !analysis.structure.hasFAQSchema) issues.push('Schema markup ausente — sem Article/FAQPage schema, perde rich results e AI Overviews.');
  // GEO/AEO critical issues
  if (analysis.geo && analysis.geo.score < 40) issues.push(`⚠️ GEO Score ${analysis.geo.score}/100 (Grade ${analysis.geo.grade}) — conteúdo invisível para IAs generativas.`);
  if (analysis.aeo && analysis.aeo.score < 40) issues.push(`AEO Score ${analysis.aeo.score}/100 — sem formato Q&A, IAs não extraem respostas deste conteúdo.`);
  if (analysis.eeat && analysis.eeat.score < 30) issues.push(`E-E-A-T Score ${analysis.eeat.score}/100 — falta autoridade, citações de especialistas e dados verificáveis.`);
  if (analysis.geo && !analysis.geo.hasDirectAnswer) issues.push('Sem resposta direta no 1º parágrafo — IAs não podem extrair snippet citável.');
  if (analysis.geo && analysis.geo.genericPhraseCount > 3) issues.push(`${analysis.geo.genericPhraseCount} frases genéricas detectadas — anti-duplicidade falhou.`);
  return issues;
}

function buildImprovements(analysis: any): Array<{area: string, priority: string, suggestion: string, impact: string}> {
  const improvements: Array<{area: string, priority: string, suggestion: string, impact: string}> = [];
  
  if (analysis.flesch.score < 70) {
    improvements.push({ area: 'Legibilidade', priority: 'alta', suggestion: `Flesch ${analysis.flesch.score}. Reduza frases para máx 25 palavras e use vocabulário simples.`, impact: 'Score SEO +15-20 pontos' });
  }
  if (analysis.structure.internalLinks < 10) {
    improvements.push({ area: 'Links Internos (Órfão)', priority: 'alta', suggestion: `Apenas ${analysis.structure.internalLinks} links internos. Mín 10: 2 na introdução, 4-6 no corpo (H2), 2 na conclusão. Use o OrphanFixer automático.`, impact: 'Crawlability e authority +20%' });
  }
  if (!analysis.structure.hasFAQ) {
    improvements.push({ area: 'FAQ + Schema', priority: 'alta', suggestion: 'Adicione FAQ com 5-8 perguntas + FAQPage schema para featured snippets e Share of Model em IAs.', impact: 'CTR +30% + visibilidade GEO' });
  }
  if (!analysis.structure.hasCTA) {
    improvements.push({ area: 'CTA', priority: 'média', suggestion: 'Adicione CTAs estratégicos (urgência, autoridade, lead, comunidade, fechamento).', impact: 'Conversão +15%' });
  }
  if (!analysis.keyword.titleHasKeyword) {
    improvements.push({ area: 'Keyword no Título', priority: 'alta', suggestion: `A keyword "${analysis.keyword.keyword}" não está no título. Inclua-a nos primeiros 60 chars.`, impact: 'Ranking +10-15 posições' });
  }
  if (analysis.structure.longParagraphs > 0) {
    improvements.push({ area: 'Parágrafos', priority: 'média', suggestion: `${analysis.structure.longParagraphs} parágrafos muito longos. Quebre em 4-7 linhas.`, impact: 'Legibilidade mobile +25%' });
  }
  if (analysis.structure.externalLinks < 1) {
    improvements.push({ area: 'Links Externos', priority: 'média', suggestion: 'Adicione 2-3 links para fontes autoritativas (.gov.br, .edu.br, .org).', impact: 'Trust signal + E-E-A-T +10%' });
  }
  if (!analysis.structure.hasBreadcrumb) {
    improvements.push({ area: 'Breadcrumb', priority: 'média', suggestion: 'Ative breadcrumbs para criar caminhos automáticos e schema BreadcrumbList.', impact: 'Navegação + rich results' });
  }
  if (analysis.structure.wordCount >= 2000 && analysis.structure.internalLinks < 5) {
    improvements.push({ area: 'Pilar de Conteúdo', priority: 'alta', suggestion: 'Artigo longo (>2000p) com poucos links = pilar potencial. Conecte spoke articles e adicione ao menu/rodapé.', impact: 'Hub-and-Spoke architecture' });
  }
  
  // GEO/AEO improvements
  if (analysis.geo) {
    if (!analysis.geo.hasDirectAnswer) {
      improvements.push({ area: 'GEO: Resposta Direta', priority: 'alta', suggestion: 'O 1º parágrafo NÃO responde diretamente ao tema. Reescreva com definição clara em 40-60 palavras.', impact: 'Share of Model +40%' });
    }
    if (analysis.geo.questionH2Pct < 50) {
      improvements.push({ area: 'GEO: H2s como Perguntas', priority: 'alta', suggestion: `Apenas ${analysis.geo.questionH2Pct}% dos H2s são perguntas naturais. Reformule como "Como...", "O que é...", "Quanto custa...".`, impact: 'AEO Score +25%' });
    }
    if (analysis.geo.statsEvery200Words < 0.5) {
      improvements.push({ area: 'GEO: Dados Verificáveis', priority: 'alta', suggestion: `Estatísticas insuficientes (${analysis.geo.statsEvery200Words}/200 palavras). Adicione dados com fonte e ano a cada 150-200 palavras.`, impact: 'E-E-A-T + citabilidade +30%' });
    }
    if (analysis.geo.expertMentions < 2) {
      improvements.push({ area: 'E-E-A-T: Especialistas', priority: 'média', suggestion: 'Poucas citações de especialistas. Adicione "Segundo Dr. X, especialista em Y..." com credenciais verificáveis.', impact: 'Domain Authority +20%' });
    }
    if (!analysis.geo.isConversational) {
      improvements.push({ area: 'AEO: Tom Conversacional', priority: 'média', suggestion: 'Conteúdo não conversacional. Use "você", perguntas retóricas e tom natural para melhor extração por IAs.', impact: 'People-First Content signal' });
    }
    if (analysis.geo.genericPhraseCount > 0) {
      improvements.push({ area: 'Anti-Duplicidade', priority: 'média', suggestion: `${analysis.geo.genericPhraseCount} frases genéricas detectadas ("no mundo de hoje", etc.). Substitua por dados específicos e insights originais.`, impact: 'Originalidade + Pulse AI' });
    }
    if (!analysis.geo.hasFreshData) {
      improvements.push({ area: 'Pulse AI: Frescor', priority: 'média', suggestion: `Ano corrente não mencionado. Adicione referências temporais ("Em ${new Date().getFullYear()}...") para sinalizar frescor ao Google e IAs.`, impact: 'Data freshness signal' });
    }
  }
  
  return improvements;
}

function buildSEOTips(analysis: any): string[] {
  const tips: string[] = [];
  if (!analysis.keyword.isOptimal) tips.push(`Densidade da keyword: ${analysis.keyword.density}%. Ideal: 0.5%-2.5%.`);
  if (!analysis.keyword.excerptHasKeyword) tips.push('Inclua a keyword na meta description.');
  if (analysis.structure.wordCount < 1500) tips.push(`Artigo com ${analysis.structure.wordCount} palavras. Ideal: ≥1500 para rankeamento.`);
  return tips;
}

function buildContentTips(analysis: any): string[] {
  const tips: string[] = [];
  if (!analysis.structure.hasConclusion) tips.push('Adicione uma conclusão com CTA final.');
  if (analysis.structure.h3Count < 3) tips.push(`Apenas ${analysis.structure.h3Count} H3s. Use subtópicos para melhor escaneabilidade.`);
  if (analysis.readability_v2?.passive_voice_pct > 15) tips.push(`${analysis.readability_v2.passive_voice_pct}% voz passiva. Reduza para <15% usando voz ativa.`);
  if (analysis.readability_v2?.transition_words_pct < 30) tips.push(`${analysis.readability_v2.transition_words_pct}% de palavras de transição. Aumente para ≥30%.`);
  return tips;
}

// === GENERATE full content for empty articles ===
async function generateFullContent(article: any, project: any, internalLinks: Array<{title: string, url: string}>, orchestrator: any) {
  const keyword = article.keyword || "tema geral";
  const projectName = project?.empresa_nome || project?.name || "";
  const domain = project?.domain || "";
  const nicho = project?.nicho || "jurídico";
  const tom = project?.tom_padrao || "profissional";
  
  const internalLinksStr = internalLinks.length > 0 
    ? internalLinks.slice(0, 15).map(l => `- "${l.title}": ${l.url}`).join("\n")
    : "Nenhum link interno disponível";

  const projectConfig = project ? {
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
  } : undefined;

  const orchestration = orchestrate(article.title || keyword, keyword, projectConfig);
  const vernizDNA = orchestration.vernizSection;

  // Social links for CTAs
  const socialLinks: string[] = [];
  if (project?.social_instagram) socialLinks.push(`Instagram: ${project.social_instagram}`);
  if (project?.social_youtube) socialLinks.push(`YouTube: ${project.social_youtube}`);
  if (project?.social_linkedin) socialLinks.push(`LinkedIn: ${project.social_linkedin}`);
  if (project?.social_google_maps) socialLinks.push(`Google Maps: ${project.social_google_maps}`);
  if (project?.empresa_whatsapp) socialLinks.push(`WhatsApp: ${project.empresa_whatsapp}`);
  const socialStr = socialLinks.length > 0 ? socialLinks.join("\n") : "";

  const prompt = `Crie um artigo completo e otimizado para SEO sobre "${keyword}".

DADOS DO PROJETO:
- Empresa: ${projectName}
- Domínio: ${domain}
- Nicho: ${nicho}
- Tom: ${tom}
${socialStr ? `\nREDES SOCIAIS (cite nos CTAs):\n${socialStr}` : ""}

${vernizDNA}

LINKS INTERNOS DISPONÍVEIS (USE no mínimo 10):
${internalLinksStr}

═══ REGRAS INEGOCIÁVEIS ═══
1. TÍTULO: 55-80 chars, keyword no início, SEM ":" ou "Guia Completo"
2. META-DESCRIPTION: 145-180 chars, frase COMPLETA com ponto final
3. LINKS INTERNOS: MÍNIMO 10 como <a href="URL">texto âncora</a>
4. LINKS EXTERNOS: Mínimo 2 fontes autoritativas (.gov.br, .edu.br, .org)
5. FLESCH >= 70: Frases máx 25 palavras, parágrafos 3-7 linhas, voz ativa
6. Estrutura: H2 (mín 5) > H3 (mín 3), HTML semântico
7. FAQ: 5-8 perguntas com <h3> dentro de seção FAQ
8. CTAs: 5 estratégicos (urgência, autoridade, lead, comunidade, fechamento)
9. CONCLUSÃO: com CTA final e links de redes sociais
10. MÍNIMO 1500 palavras de conteúdo

FORMATO DA RESPOSTA - JSON VÁLIDO COM ESTAS CHAVES EXATAS:
{"title":"título aqui","slug":"slug-aqui","meta_description":"meta aqui","content":"<h2>...</h2><p>...</p>...","image_prompt":"prompt in english"}`;

  // Retry up to 2 times on truncation
  for (let attempt = 0; attempt < 2; attempt++) {
    const maxTokens = attempt === 0 ? 16000 : 24000;
    console.log(`[AI SEO] generateFullContent attempt ${attempt + 1} with maxTokens=${maxTokens}`);
    
    const aiContent = await orchestrator.call('article_generation', [
      { 
        role: 'system', 
        content: `Você é um jornalista sênior e especialista SEO. Escreva em pt-BR.
REGRAS ABSOLUTAS: Flesch ≥ 70, frases ≤ 25 palavras, HTML semântico, mín 10 links internos, FAQ, CTAs, conclusão.
Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6, figure, figcaption, section, article.
PROIBIDO: div, span, b, i. Responda APENAS com JSON válido com as chaves: title, slug, meta_description, content, image_prompt.` 
      },
      { role: 'user', content: prompt },
    ], { maxTokens, temperature: 0.5 });

    const finishReason = (globalThis as any).__lastFinishReason;
    console.log(`[AI SEO] AI response: ${aiContent.length} chars, finishReason: ${finishReason}`);

    try {
      const parsed = extractJsonFromAIResponse(aiContent);
      const extractedContent = parsed.content || parsed.optimized_content || parsed.html || null;
      const extractedTitle = parsed.title || null;
      const extractedMeta = parsed.meta_description || parsed.meta || parsed.excerpt || null;
      
      console.log(`[AI SEO] Generation extraction: content=${!!extractedContent} (${(extractedContent||'').length} chars), title="${extractedTitle}", meta="${extractedMeta?.substring(0, 50)}"`);
      
      if (!extractedContent || extractedContent.length < 500) {
        if (attempt === 0) {
          console.warn(`[AI SEO] Content too short (${(extractedContent||'').length} chars), retrying with more tokens...`);
          continue;
        }
        throw new Error("IA gerou conteúdo muito curto. Tente novamente.");
      }
      
      // Validate title quality
      let finalTitle = extractedTitle;
      if (!finalTitle || finalTitle.length < 20 || finalTitle.includes(': Guia Completo')) {
        finalTitle = null; // Will trigger title regeneration or keep keyword
      }
      
      return {
        content: extractedContent,
        title: finalTitle,
        excerpt: extractedMeta,
        slug: parsed.slug || null,
        imagePrompt: parsed.image_prompt || null,
      };
    } catch (parseErr) {
      console.error(`[AI SEO] JSON extraction failed attempt ${attempt + 1}:`, (parseErr as Error).message, "Raw length:", aiContent.length);
      if (attempt === 0 && finishReason === 'MAX_TOKENS') {
        console.warn("[AI SEO] Truncation detected, retrying with more tokens...");
        continue;
      }
      
      // Last resort: if AI returned raw HTML
      if (aiContent.includes('<h2') && aiContent.includes('<p') && aiContent.length > 1000) {
        console.warn("[AI SEO] Using raw AI response as HTML content");
        return { content: aiContent.trim(), title: null, excerpt: null, slug: null, imagePrompt: null };
      }
      throw new Error("Erro ao processar resposta da IA na geração. Tente novamente.");
    }
  }
  
  throw new Error("Geração falhou após 2 tentativas. Verifique créditos e tente novamente.");
}

// === OPTIMIZE existing content ===
async function optimizeExistingContent(article: any, analysis: any, project: any, internalLinks: Array<{title: string, url: string}>, orchestrator: any) {
  const internalLinksStr = internalLinks.length > 0 
    ? internalLinks.slice(0, 15).map(l => `- "${l.title}": ${l.url}`).join("\n")
    : "Nenhum link interno disponível";

  const projectConfig = project ? {
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
  } : undefined;

  const orchestration = orchestrate(article.title || article.keyword, article.keyword, projectConfig);
  const vernizDNA = orchestration.vernizSection;

  // Truncate content to avoid token overflow — keep first 14000 chars
  const contentForAI = (article.content || "").substring(0, 14000);

  const issuesList: string[] = [];
  if (!analysis.flesch.passed) issuesList.push(`Flesch: ${analysis.flesch.score} (REPROVADO, mín 60)`);
  if (analysis.structure.h2Count < 5) issuesList.push(`H2s: ${analysis.structure.h2Count} (mín 5)`);
  if (!analysis.structure.hasFAQ) issuesList.push(`FAQ: FALTANDO`);
  if (!analysis.structure.hasCTA) issuesList.push(`CTA: FALTANDO`);
  if (analysis.structure.internalLinks < 10) issuesList.push(`Links internos: ${analysis.structure.internalLinks} (mín 10)`);
  if (analysis.structure.externalLinks < 2) issuesList.push(`Links externos: ${analysis.structure.externalLinks} (mín 2)`);
  if (!analysis.structure.hasConclusion) issuesList.push(`Conclusão: FALTANDO`);
  if (analysis.structure.longParagraphs > 0) issuesList.push(`Parágrafos longos: ${analysis.structure.longParagraphs}`);
  if (!analysis.meta.titleOk) issuesList.push(`Título: ${analysis.meta.titleLength} chars (ideal 55-80)`);
  if (!analysis.meta.excerptOk) issuesList.push(`Meta: ${analysis.meta.excerptLength} chars (ideal 145-180)`);

  const prompt = `Reescreva COMPLETAMENTE este artigo corrigindo TODOS os problemas listados.

${vernizDNA}

═══ PROBLEMAS ENCONTRADOS (CORRIJA TODOS) ═══
${issuesList.length > 0 ? issuesList.map(i => `❌ ${i}`).join("\n") : "Nenhum problema crítico"}

═══ REGRAS DE CORREÇÃO OBRIGATÓRIAS ═══
1. Flesch ≥ 70: frases ≤ 25 palavras, parágrafos 3-7 linhas, voz ativa
2. Mín 10 links internos como <a href="URL">texto âncora contextual</a>
3. Mín 2 links externos autoritativos (.gov.br, .edu.br, .org)
4. FAQ com 5-8 perguntas se ausente
5. CTAs estratégicos em todo o artigo
6. Conclusão com CTA final
7. Título: 55-80 chars, SEM ":" no final, SEM "Guia Completo"
8. Meta: 145-180 chars, frase COMPLETA com ponto final

LINKS INTERNOS PARA INSERIR:
${internalLinksStr}

KEYWORD: ${article.keyword}
TÍTULO ATUAL: ${article.title}

CONTEÚDO A REESCREVER:
${contentForAI}

RESPONDA APENAS COM JSON — use EXATAMENTE estas chaves:
{"content":"HTML COMPLETO reescrito","title":"título otimizado 55-80 chars","meta_description":"meta 145-180 chars"}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const maxTokens = attempt === 0 ? 16000 : 24000;
    console.log(`[AI SEO] optimizeExistingContent attempt ${attempt + 1} with maxTokens=${maxTokens}`);
    
    const aiContent = await orchestrator.call('content_editing', [
      { role: 'system', content: `Você é um editor SEO sênior. Reescreva conteúdo para Flesch ≥ 70 com frases curtas, voz ativa, HTML semântico.
ADICIONE links internos, CTAs, FAQ e conclusão faltantes. Responda APENAS com JSON válido com chaves: content, title, meta_description.
Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6, section, article, figure, figcaption.` },
      { role: 'user', content: prompt },
    ], { maxTokens, temperature: 0.3 });

    const finishReason = (globalThis as any).__lastFinishReason;
    console.log(`[AI SEO] Optimize response: ${aiContent.length} chars, finishReason: ${finishReason}`);

    try {
      const parsed = extractJsonFromAIResponse(aiContent);
      const extractedContent = parsed.optimized_content || parsed.content || parsed.html || parsed.article || null;
      const extractedTitle = parsed.optimized_title || parsed.title || null;
      const extractedMeta = parsed.optimized_meta || parsed.meta_description || parsed.excerpt || parsed.meta || null;
      
      console.log(`[AI SEO] Optimization extraction: content=${!!extractedContent} (${(extractedContent||'').length} chars), title="${extractedTitle}", meta="${extractedMeta?.substring(0, 50)}"`);
      
      if (!extractedContent || extractedContent.length < 500) {
        if (attempt === 0) {
          console.warn(`[AI SEO] Optimized content too short (${(extractedContent||'').length} chars), retrying...`);
          continue;
        }
        throw new Error("A IA não retornou conteúdo otimizado suficiente.");
      }
      
      return {
        content: extractedContent,
        title: extractedTitle,
        excerpt: extractedMeta,
      };
    } catch (parseErr) {
      console.error(`[AI SEO] JSON extraction failed attempt ${attempt + 1}:`, (parseErr as Error).message);
      if (attempt === 0 && finishReason === 'MAX_TOKENS') {
        console.warn("[AI SEO] Truncation detected, retrying with more tokens...");
        continue;
      }
      
      // Last resort: raw HTML
      if (aiContent.includes('<h2') && aiContent.includes('<p') && aiContent.length > 1000) {
        console.warn("[AI SEO] Using raw AI response as HTML content (no JSON wrapper)");
        return { content: aiContent.trim(), title: null, excerpt: null };
      }
      throw new Error("Erro ao processar resposta da IA na otimização. Tente novamente.");
    }
  }
  
  throw new Error("Otimização falhou após 2 tentativas.");
}

// === Content Analysis v5.0 — SEO + GEO + AEO ===
function analyzeContent(content: string, cleanContent: string, article: any, project?: any) {
  const words = cleanContent.split(/\s+/).filter((w: string) => w.length > 0);
  const wordCount = words.length;
  const sentences = cleanContent.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);
  const syllableCount = words.reduce((t: number, w: string) => t + countSyllables(w), 0);
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / Math.max(wordCount, 1);
  const fleschScore = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)));

  const charCount = cleanContent.replace(/\s+/g, '').length;
  const L = (charCount / Math.max(wordCount, 1)) * 100;
  const S = (sentenceCount / Math.max(wordCount, 1)) * 100;
  const colemanLiau = Math.max(0, Math.round((0.0588 * L - 0.296 * S - 15.8) * 10) / 10);
  const complexWords = words.filter((w: string) => countSyllables(w) >= 3).length;
  const gunningFog = Math.max(0, Math.round(0.4 * (avgWordsPerSentence + 100 * (complexWords / Math.max(wordCount, 1))) * 10) / 10);

  const passiveRegex = /\b(?:foi|foram|é|são|era|eram|será|serão|sido|sendo)\s+\w+(?:ado|ada|ados|adas|ido|ida|idos|idas|to|ta|tos|tas)\b/gi;
  const passiveMatches = cleanContent.match(passiveRegex) || [];
  const passivePercentage = Math.round((passiveMatches.length / sentenceCount) * 100 * 10) / 10;

  const transitionWords = [
    'além disso', 'portanto', 'contudo', 'entretanto', 'porém', 'todavia',
    'no entanto', 'assim', 'dessa forma', 'por isso', 'consequentemente',
    'em primeiro lugar', 'em segundo lugar', 'finalmente', 'por exemplo',
    'ou seja', 'isto é', 'em resumo', 'em conclusão', 'por outro lado',
    'além do mais', 'sobretudo', 'principalmente', 'especialmente',
    'de fato', 'na verdade', 'certamente', 'sem dúvida',
  ];
  const lowerContent = cleanContent.toLowerCase();
  let transitionCount = 0;
  for (const tw of transitionWords) {
    const regex = new RegExp(tw, 'gi');
    transitionCount += (lowerContent.match(regex) || []).length;
  }
  const transitionPercentage = Math.round((transitionCount / sentenceCount) * 100 * 10) / 10;

  const longSentences = sentences.filter((s: string) => s.trim().split(/\s+/).length > 25).length;
  const longSentencePct = Math.round((longSentences / sentenceCount) * 100 * 10) / 10;

  let trafficLight: 'green' | 'orange' | 'red' = 'green';
  const readabilityIssues: string[] = [];
  if (fleschScore < 60) { trafficLight = 'red'; readabilityIssues.push('Flesch < 60'); }
  else if (fleschScore < 70) { trafficLight = 'orange'; readabilityIssues.push('Flesch 60-70'); }
  if (passivePercentage > 25) { trafficLight = 'red'; readabilityIssues.push(`Voz passiva ${passivePercentage}%`); }
  else if (passivePercentage > 15) { if (trafficLight !== 'red') trafficLight = 'orange'; }
  if (longSentencePct > 40) { trafficLight = 'red'; readabilityIssues.push(`Frases longas ${longSentencePct}%`); }

  const h1Count = (content.match(/<h1[\s>]/gi) || []).length;
  const h2Count = (content.match(/<h2[\s>]/gi) || []).length;
  const h3Count = (content.match(/<h3[\s>]/gi) || []).length;
  const imgCount = (content.match(/<img/gi) || []).length;
  const altCount = (content.match(/alt=["'][^"']+["']/gi) || []).length;
  const hasFAQ = /faq|perguntas frequentes|dúvidas comuns/i.test(cleanContent);
  const hasConclusion = /conclus[ãa]o|considerações finais|em suma/i.test(cleanContent);
  const hasCTA = /consulte|entre em contato|saiba mais|fale conosco|whatsapp|agende/i.test(cleanContent);
  const allLinks = content.match(/<a[^>]+href=["']https?:\/\/[^"']+["']/gi) || [];
  
  const projectDomain = project?.domain || '';
  const wpUrl = project?.wordpress_url || '';
  const domainPatterns: string[] = [];
  if (projectDomain) domainPatterns.push(projectDomain.replace(/^www\./, ''));
  if (wpUrl) {
    try { domainPatterns.push(new URL(wpUrl).hostname.replace(/^www\./, '')); } catch {}
  }
  
  const isInternalLink = (link: string): boolean => {
    if (domainPatterns.length === 0) return false;
    const lowerLink = link.toLowerCase();
    return domainPatterns.some(d => lowerLink.includes(d.toLowerCase()));
  };
  
  const internalLinksArr = allLinks.filter(isInternalLink);
  const externalLinksArr = allLinks.filter(l => !isInternalLink(l));
  const relativeLinks = content.match(/<a[^>]+href=["']\/[^"']*["']/gi) || [];
  const internalLinksCount = internalLinksArr.length + relativeLinks.length;
  const externalLinksCount = externalLinksArr.length;

  const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const longParagraphs = paragraphs.filter((p: string) => {
    const text = p.replace(/<[^>]+>/g, "");
    return text.split(/\s+/).length > 60;
  });

  // Keyword matching with fuzzy long-tail support
  const keyword = (article.keyword || "").toLowerCase();
  const keywordWords = keyword.split(/[\s:,;]+/).filter((w: string) => w.length > 3);
  const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const exactKeywordCount = keyword ? (cleanContent.match(keywordRegex) || []).length : 0;
  
  let keywordCount = exactKeywordCount;
  if (keywordWords.length >= 3 && exactKeywordCount === 0) {
    const significantMatches = keywordWords.filter(w => {
      const wRegex = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, 'gi');
      return (cleanContent.match(wRegex) || []).length >= 2;
    });
    if (significantMatches.length >= keywordWords.length * 0.6) {
      keywordCount = Math.max(1, significantMatches.length);
    }
  }
  const keywordDensity = keyword && wordCount > 0 ? Math.round((keywordCount * Math.min(keywordWords.length, 3) / wordCount) * 100 * 10) / 10 : 0;

  const titleLen = (article.title || "").length;
  const excerptLen = (article.excerpt || "").length;
  
  const titleLower = (article.title || "").toLowerCase();
  const excerptLower = (article.excerpt || "").toLowerCase();
  let titleHasKeyword = keyword ? titleLower.includes(keyword) : false;
  let excerptHasKeyword = keyword ? excerptLower.includes(keyword) : false;
  
  if (!titleHasKeyword && keywordWords.length >= 3) {
    const titleMatches = keywordWords.filter(w => titleLower.includes(w));
    titleHasKeyword = titleMatches.length >= keywordWords.length * 0.5;
  }
  if (!excerptHasKeyword && keywordWords.length >= 3) {
    const excerptMatches = keywordWords.filter(w => excerptLower.includes(w));
    excerptHasKeyword = excerptMatches.length >= keywordWords.length * 0.5;
  }

  // Schema & breadcrumb detection
  const hasBreadcrumb = /<[^>]*class=["'][^"']*breadcrumb/i.test(content) || /breadcrumbList/i.test(content);
  const hasArticleSchema = /ArticleSchema|"@type"\s*:\s*"Article"/i.test(content);
  const hasFAQSchema = /FAQPage|"@type"\s*:\s*"FAQPage"/i.test(content);
  const hasHowToSchema = /HowTo|"@type"\s*:\s*"HowTo"/i.test(content);

  // ====== GEO SCORING (v5.0) ======
  
  // 1. Direct Answer Detection — first paragraph answers the query autossuficiently
  const firstParagraph = paragraphs.length > 0 ? paragraphs[0].replace(/<[^>]+>/g, '').trim() : '';
  const firstParaWords = firstParagraph.split(/\s+/).length;
  const hasDirectAnswer = firstParaWords >= 30 && firstParaWords <= 80 && (
    firstParagraph.includes(' é ') || firstParagraph.includes(' são ') || 
    firstParagraph.includes(' significa ') || firstParagraph.includes(' consiste ') ||
    /^\w+.*[.!]$/.test(firstParagraph.trim())
  );
  
  // 2. Q&A Format Detection — H2s as natural questions
  const h2Texts = (content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || []).map(h => h.replace(/<[^>]+>/g, '').trim());
  const questionH2s = h2Texts.filter(h => h.endsWith('?') || /^(como|o que|qual|quando|quanto|por que|onde|quem|para que)/i.test(h));
  const questionH2Pct = h2Texts.length > 0 ? Math.round((questionH2s.length / h2Texts.length) * 100) : 0;
  
  // 3. Verified Statistics Detection — "Segundo [fonte] ([ano])" pattern
  const statsPatterns = [
    /segundo\s+[^,.(]+\s*\(\d{4}\)/gi,
    /de acordo com\s+[^,.(]+/gi,
    /dados d[aeo]\s+[^,.(]+\s*\(\d{4}\)/gi,
    /pesquisa\s+d[aeo]\s+[^,.(]+/gi,
    /estudo\s+d[aeo]\s+[^,.(]+/gi,
    /\d+[.,]\d*\s*%/g, // percentage stats
    /R\$\s*[\d.,]+/g, // monetary values
  ];
  let statsCount = 0;
  for (const pattern of statsPatterns) {
    statsCount += (cleanContent.match(pattern) || []).length;
  }
  const statsEvery200Words = wordCount > 0 ? Math.round((statsCount / (wordCount / 200)) * 10) / 10 : 0;
  
  // 4. Expert Quotes Detection
  const expertPatterns = [
    /(?:Dr\.|Dra\.|Prof\.|Profª\.)\s+[A-ZÀ-Ü][a-zà-ü]+/g,
    /especialista\s+em\s+/gi,
    /segundo\s+(?:o|a)\s+(?:advogad|médic|professor|especialista)/gi,
  ];
  let expertMentions = 0;
  for (const p of expertPatterns) {
    expertMentions += (cleanContent.match(p) || []).length;
  }
  
  // 5. Conversational Tone Detection
  const conversationalPatterns = [
    /\bvocê\b/gi,
    /\bsua\b/gi,
    /\bseu\b/gi,
    /\?/g, // questions in content
  ];
  let conversationalScore = 0;
  for (const p of conversationalPatterns) {
    conversationalScore += Math.min((cleanContent.match(p) || []).length, 20);
  }
  const isConversational = conversationalScore >= 10;
  
  // 6. Anti-Duplicity Check — generic phrases that exist everywhere
  const genericPhrases = [
    'no mundo de hoje', 'em um mundo cada vez mais', 'neste artigo vamos',
    'é importante ressaltar', 'vale mencionar que', 'vamos mergulhar',
    'sem dúvida alguma', 'nos dias atuais', 'como já sabemos',
  ];
  const genericCount = genericPhrases.filter(p => lowerContent.includes(p)).length;
  
  // 7. Data Freshness / Pulse AI
  const currentYear = new Date().getFullYear();
  const yearMentions = (cleanContent.match(new RegExp(`\\b${currentYear}\\b`, 'g')) || []).length;
  const hasFreshData = yearMentions >= 2;
  
  // 8. Definition Format Detection ("X é...")
  const definitionPatterns = (cleanContent.match(/\b\w+\s+(?:é|são|consiste|significa|refere-se)\s+/gi) || []).length;
  
  // Compute GEO Score (0-100)
  let geoScore = 0;
  if (hasDirectAnswer) geoScore += 15;
  if (questionH2Pct >= 50) geoScore += 15; else if (questionH2Pct >= 25) geoScore += 8;
  if (statsEvery200Words >= 0.8) geoScore += 15; else if (statsEvery200Words >= 0.4) geoScore += 8;
  if (expertMentions >= 2) geoScore += 10; else if (expertMentions >= 1) geoScore += 5;
  if (isConversational) geoScore += 10;
  if (genericCount === 0) geoScore += 10; else if (genericCount <= 2) geoScore += 5;
  if (hasFreshData) geoScore += 10;
  if (definitionPatterns >= 3) geoScore += 5;
  if (hasFAQ) geoScore += 10;
  
  // AEO Score (subset of GEO focused on answer extraction)
  let aeoScore = 0;
  if (hasDirectAnswer) aeoScore += 25;
  if (questionH2Pct >= 50) aeoScore += 20; else if (questionH2Pct >= 25) aeoScore += 10;
  if (hasFAQ) aeoScore += 20;
  if (statsEvery200Words >= 0.8) aeoScore += 15; else if (statsEvery200Words >= 0.4) aeoScore += 8;
  if (isConversational) aeoScore += 10;
  if (definitionPatterns >= 3) aeoScore += 10;

  // E-E-A-T Score
  let eeatScore = 0;
  if (expertMentions >= 2) eeatScore += 25; else if (expertMentions >= 1) eeatScore += 15;
  if (externalLinksCount >= 2) eeatScore += 20; else if (externalLinksCount >= 1) eeatScore += 10;
  if (statsEvery200Words >= 0.8) eeatScore += 20; else if (statsEvery200Words >= 0.4) eeatScore += 10;
  if (hasFreshData) eeatScore += 15;
  if (hasArticleSchema || hasFAQSchema) eeatScore += 10;
  if (wordCount >= 1500) eeatScore += 10;

  return {
    flesch: {
      score: fleschScore,
      level: fleschScore >= 90 ? "Muito Fácil" : fleschScore >= 80 ? "Fácil" : fleschScore >= 70 ? "Bastante Fácil" : fleschScore >= 60 ? "Padrão" : "REPROVADO",
      passed: fleschScore >= 60,
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    },
    readability_v2: {
      coleman_liau: colemanLiau,
      gunning_fog: gunningFog,
      composite_score: Math.round((fleschScore * 0.5 + Math.max(0, 100 - gunningFog * 5) * 0.25 + Math.max(0, 100 - colemanLiau * 5) * 0.25) * 10) / 10,
      passive_voice_pct: passivePercentage,
      passive_count: passiveMatches.length,
      transition_words_pct: transitionPercentage,
      transition_count: transitionCount,
      long_sentences_pct: longSentencePct,
      long_sentences: longSentences,
      complex_words_pct: Math.round((complexWords / Math.max(wordCount, 1)) * 100 * 10) / 10,
      traffic_light: trafficLight,
      issues: readabilityIssues,
    },
    structure: {
      wordCount, h1Count, h2Count, h3Count, imgCount, imgsWithAlt: altCount,
      hasFAQ, hasConclusion, hasCTA, internalLinks: internalLinksCount, externalLinks: externalLinksCount,
      longParagraphs: longParagraphs.length, totalParagraphs: paragraphs.length,
      hasBreadcrumb, hasArticleSchema, hasFAQSchema, hasHowToSchema,
    },
    keyword: {
      keyword: article.keyword, density: keywordDensity, count: keywordCount,
      isOptimal: keywordDensity >= 0.5 && keywordDensity <= 2.5,
      titleHasKeyword, excerptHasKeyword,
    },
    meta: {
      titleLength: titleLen, titleOk: titleLen >= 55 && titleLen <= 80,
      excerptLength: excerptLen, excerptOk: excerptLen >= 145 && excerptLen <= 180,
    },
    // NEW: GEO/AEO/E-E-A-T scores
    geo: {
      score: geoScore,
      grade: geoScore >= 80 ? 'A' : geoScore >= 60 ? 'B' : geoScore >= 40 ? 'C' : 'D',
      hasDirectAnswer,
      questionH2Pct,
      statsEvery200Words,
      expertMentions,
      isConversational,
      genericPhraseCount: genericCount,
      hasFreshData,
      definitionPatterns: definitionPatterns,
    },
    aeo: {
      score: aeoScore,
      grade: aeoScore >= 80 ? 'A' : aeoScore >= 60 ? 'B' : aeoScore >= 40 ? 'C' : 'D',
    },
    eeat: {
      score: eeatScore,
      grade: eeatScore >= 80 ? 'A' : eeatScore >= 60 ? 'B' : eeatScore >= 40 ? 'C' : 'D',
    },
  };
}

function calculateScore(analysis: any): number {
  let score = 0;
  const { flesch, readability_v2, structure, keyword, meta, geo, aeo, eeat } = analysis;
  
  // Readability (max 30)
  if (flesch.score >= 70) score += 15; else if (flesch.score >= 60) score += 10; else if (flesch.score >= 50) score += 5;
  if (readability_v2) {
    if (readability_v2.passive_voice_pct <= 10) score += 5; else if (readability_v2.passive_voice_pct <= 15) score += 3;
    if (readability_v2.transition_words_pct >= 30) score += 5; else if (readability_v2.transition_words_pct >= 20) score += 3;
    if (readability_v2.long_sentences_pct <= 15) score += 5; else if (readability_v2.long_sentences_pct <= 25) score += 3;
  }
  
  // Structure (max 30)
  if (structure.h2Count >= 5) score += 7; else if (structure.h2Count >= 3) score += 5; else if (structure.h2Count > 0) score += 2;
  if (structure.h3Count >= 3) score += 3; else if (structure.h3Count > 0) score += 1;
  if (structure.hasFAQ) score += 5;
  if (structure.hasConclusion) score += 3;
  if (structure.hasCTA) score += 5;
  if (structure.internalLinks >= 10) score += 10; else if (structure.internalLinks >= 5) score += 7; else if (structure.internalLinks >= 1) score += 2;
  if (structure.externalLinks >= 1 && structure.externalLinks <= 3) score += 3;
  if (structure.longParagraphs === 0) score += 3;
  
  // Keyword & Meta (max 15)
  if (keyword.isOptimal) score += 5; else if (keyword.count > 0) score += 3;
  if (meta.titleOk) score += 3;
  if (meta.excerptOk) score += 3;
  if (keyword.titleHasKeyword) score += 4;
  
  // GEO/AEO/E-E-A-T (max 25 — NEW)
  if (geo) {
    const geoContrib = Math.round(geo.score * 0.10); // max 10 pts
    score += geoContrib;
  }
  if (aeo) {
    const aeoContrib = Math.round(aeo.score * 0.08); // max 8 pts
    score += aeoContrib;
  }
  if (eeat) {
    const eeatContrib = Math.round(eeat.score * 0.07); // max 7 pts
    score += eeatContrib;
  }
  
  if (structure.wordCount >= 1500) score += 3; else if (structure.wordCount >= 800) score += 1;
  
  return score;
}

function countSyllables(word: string): number {
  const vowels = "aeiouáéíóúâêîôûãõàè";
  const w = word.toLowerCase();
  let count = 0;
  let prevWasVowel = false;
  for (const char of w) {
    const isVowel = vowels.includes(char);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }
  return Math.max(count, 1);
}
