import '../_shared/nexus-runtime-bootstrap.ts';
import {paidLockedServe} from '../_shared/nexus-spend-lock.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { orchestrate } from "../_shared/verniz-orchestrator.ts";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { analyzeContent, buildContentTips, buildCriticalIssues, buildImprovements, buildSEOTips, calculateScore, fleschTips } from "../_shared/seo-analysis-core.ts";
import { promptLimits, type RuleProfile } from "../_shared/optimization-rules.ts";
import { loadRuleProfile } from "../_shared/rules-loader.ts";
import { resolveLanguage } from "../_shared/language-packs.ts";

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

paidLockedServe(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { article_ids, mode } = body;

    // Gate de autenticação obrigatório — sem isso, userId ficava null e a função
    // seguia executando com o service role (bypassa RLS), permitindo IDOR sobre
    // article_ids de qualquer organização. Ver auditoria 2026-09-18, CRÍTICO 1.
    let userId: string;
    try {
      const actor = await resolveRequestActor(req, body.userId);
      userId = actor.userId;
    } catch (error) {
      if (error instanceof RequestAuthError) {
        return new Response(
          JSON.stringify({ success: false, error: error.message, code: error.code }),
          { status: error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    // BYOK: mesmo padrão de ai-chat/gbp-audit — resolve chaves do usuário (com
    // fallback para Vault/plataforma) em vez de ler user_settings diretamente.
    const orchestrator = await getOrchestratorForUser(userId);

    // Bearer bruto do caller, só para repassar ao publish-to-wordpress no
    // auto-republish abaixo — já validado por resolveRequestActor acima.
    const token = (req.headers.get("Authorization") || req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

    if (!article_ids || !Array.isArray(article_ids) || article_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "article_ids is required (array)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isOptimize = mode === "optimize";

    // Fetch articles (inclui organization_id para a checagem de fronteira abaixo)
    const { data: articlesRaw, error: fetchErr } = await supabase
      .from("articles")
      .select("id, title, keyword, content, excerpt, slug, seo_score, word_count, status, project_id, published_url, secondary_keywords, type, organization_id, config, language")
      .in("id", article_ids);

    if (fetchErr) throw fetchErr;
    if (!articlesRaw || articlesRaw.length === 0) {
      return new Response(
        JSON.stringify({ error: "No articles found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fronteira organizacional (mesmo padrão de publish-to-wordpress): mantém
    // apenas artigos cuja organização o usuário autenticado integra ativamente.
    // Isso corrige o IDOR — sem isso, qualquer article_id era lido/sobrescrito
    // e as credenciais WordPress do projeto associado eram carregadas em memória
    // independentemente da organização do requisitante.
    const candidateOrgIds = [...new Set(articlesRaw.map((a) => a.organization_id).filter(Boolean))];
    const allowedOrgIds = new Set<string>();
    if (candidateOrgIds.length > 0) {
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id")
        .in("organization_id", candidateOrgIds)
        .eq("user_id", userId)
        .eq("status", "active");
      for (const m of memberships || []) allowedOrgIds.add(m.organization_id);
    }

    const deniedIds = articlesRaw
      .filter((a) => !a.organization_id || !allowedOrgIds.has(a.organization_id))
      .map((a) => a.id);
    const articles = articlesRaw.filter((a) => a.organization_id && allowedOrgIds.has(a.organization_id));

    if (deniedIds.length > 0) {
      console.warn(`[AI SEO] organization_boundary: ${deniedIds.length} article_id(s) fora da organização do usuário ${userId} foram excluídos do processamento`);
    }
    if (articles.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum artigo pertence a uma organização do usuário autenticado", code: "organization_boundary" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch project data for context (somente projetos dos artigos já filtrados pela fronteira acima)
    const projectIds = [...new Set(articles.map(a => a.project_id).filter(Boolean))];
    const projectsMap: Record<string, any> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, domain, wordpress_url, nicho, tom_padrao, compliance_rules, links_prioritarios, social_instagram, social_youtube, social_linkedin, social_twitter, social_tiktok, social_google_maps, social_linktree, cta_leads, cta_conclusao, cta_comunidade, empresa_nome, empresa_whatsapp, empresa_telefone, empresa_endereco, editorial_identity, nexus_strategy, seo_plugin")
        .in("id", projectIds);
      if (projects) {
        for (const p of projects) {
          projectsMap[p.id] = p;
        }
      }
    }

    // Fetch existing published articles for internal linking — EXPANDED to 100+ for better coverage
    const internalLinksMap: Record<string, Array<{title: string, url: string, keyword?: string, cluster?: string}>> = {};
    const orphanDataMap: Record<string, { orphanCount: number; totalArticles: number; duplicateHashes: Set<string> }> = {};
    
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

    const results: any[] = deniedIds.map((id) => ({
      article_id: id,
      score: 0,
      optimized: false,
      generated: false,
      error: "organization_boundary",
      analysis: null,
      ai: { error: "Artigo não pertence à organização do usuário autenticado." },
    }));

    for (const article of articles) {
      const content = article.content || "";
      const cleanContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const hasContent = cleanContent.length > 200;
      const project = article.project_id ? projectsMap[article.project_id] : null;
      const internalLinks = article.project_id ? (internalLinksMap[article.project_id] || []) : [];
      // Perfil de regras: padrão editável + projeto + artigo + prompt do agente (nada de 60/70/1500 fixo no código).
      const rules = await loadRuleProfile(supabase, article, project);
      const langInfo = resolveLanguage({ configured: [article.language, article.config?.language, project?.nexus_strategy?.language], text: cleanContent || article.keyword });
      const langName = langInfo.profile?.name || (langInfo.tag !== 'und' ? langInfo.tag : 'the same language as the keyword');
      const extras = { schemaTypes: Array.isArray(article.config?.schema_plan?.types) ? article.config.schema_plan.types : undefined, seoPlugin: project?.seo_plugin || null };

      try {
        if (isOptimize) {
          if (!hasContent) {
            // GENERATE full content from scratch
            console.log(`[AI SEO] Generating full content for article ${article.id} (keyword: ${article.keyword})`);
            const generated = await generateFullContent(article, project, internalLinks, orchestrator, rules, langName);
            
            if (generated.content) {
              const newClean = generated.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              const wordCount = newClean.split(/\s+/).filter((w: string) => w.length > 0).length;
              const updatedArticle = { ...article, title: generated.title || article.title, excerpt: generated.excerpt || article.excerpt };
              const newAnalysis = analyzeContent(generated.content, newClean, updatedArticle, project, rules, extras);
              const newScore = Math.min(100, calculateScore(newAnalysis, rules));

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
              }).eq("id", article.id).eq("organization_id", article.organization_id);

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
            const localAnalysis = analyzeContent(content, cleanContent, article, project, rules, extras);
            const optimized = await optimizeExistingContent(article, localAnalysis, project, internalLinks, orchestrator, rules, langName);

            if (optimized.content) {
              const newClean = optimized.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              const wordCount = newClean.split(/\s+/).filter((w: string) => w.length > 0).length;
              const updatedArticle = { ...article, title: optimized.title || article.title, excerpt: optimized.excerpt || article.excerpt };
              const newAnalysis = analyzeContent(optimized.content, newClean, updatedArticle, project, rules, extras);
              const newScore = Math.min(100, calculateScore(newAnalysis, rules));

              // Build changes list
              const changesMade: string[] = [];
              if (optimized.title && optimized.title !== article.title) changesMade.push(`Título: "${optimized.title}"`);
              if (optimized.excerpt && optimized.excerpt !== article.excerpt) changesMade.push(`Meta description atualizada (${optimized.excerpt.length} chars)`);
              if (newAnalysis.flesch.score !== null && localAnalysis.flesch.score !== null && newAnalysis.flesch.score > localAnalysis.flesch.score) changesMade.push(`Flesch: ${localAnalysis.flesch.score} → ${newAnalysis.flesch.score}`);
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
              }).eq("id", article.id).eq("organization_id", article.organization_id);

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
                  critical_issues: newAnalysis.flesch.score !== null && newAnalysis.flesch.score < (newAnalysis.flesch.min ?? 60) ? [`Flesch ainda abaixo de ${newAnalysis.flesch.min ?? 60}: requer outra passada`] : [],
                  improvements: buildImprovements(newAnalysis, rules),
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
        const localAnalysis = analyzeContent(content, cleanContent, article, project, rules, extras);
        const score = Math.min(100, calculateScore(localAnalysis, rules));
        await supabase.from("articles").update({ seo_score: score }).eq("id", article.id).eq("organization_id", article.organization_id);
        
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
            critical_issues: buildCriticalIssues(localAnalysis, rules),
            improvements: buildImprovements(localAnalysis, rules),
            flesch_tips: fleschTips(localAnalysis),
            seo_tips: buildSEOTips(localAnalysis, rules),
            content_tips: buildContentTips(localAnalysis, rules),
            rules_applied: { layers: rules.layers, options: rules.options },
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

// === GENERATE full content for empty articles ===
async function generateFullContent(article: any, project: any, internalLinks: Array<{title: string, url: string}>, orchestrator: any, rules: RuleProfile, langName: string) {
  const lim = promptLimits(rules);
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

LINKS INTERNOS DISPONÍVEIS (USE ${lim.internalLinks}):
${internalLinksStr}

═══ REGRAS INEGOCIÁVEIS ═══
1. TÍTULO: 55-80 chars, keyword no início, SEM ":" ou "Guia Completo"
2. META-DESCRIPTION: 145-180 chars, frase COMPLETA com ponto final
3. LINKS INTERNOS: ${lim.internalLinks} como <a href="URL">texto âncora</a>
4. LINKS EXTERNOS: fontes oficiais ou autoritativas reais (órgãos públicos, instituições de ensino, organizações reconhecidas), só se existirem; nunca invente URL
5. ${lim.readability}
6. Estrutura: ${lim.structure}, HTML semântico
7. FAQ: 5-8 perguntas com <h3> dentro de seção FAQ
8. CONVITES DE CONTATO: sóbrios e informativos, nos cinco blocos indicados acima (orientação, autoridade, contato, comunidade, fechamento); sem urgência, medo, gratuidade ou promessa
9. CONCLUSÃO: com CTA final e links de redes sociais
10. ${lim.words}

FORMATO DA RESPOSTA - JSON VÁLIDO COM ESTAS CHAVES EXATAS:
{"title":"título aqui","slug":"slug-aqui","meta_description":"meta aqui","content":"<h2>...</h2><p>...</p>...","image_prompt":"prompt in english"}`;

  // Retry up to 2 times on truncation
  for (let attempt = 0; attempt < 2; attempt++) {
    const maxTokens = attempt === 0 ? 16000 : 24000;
    console.log(`[AI SEO] generateFullContent attempt ${attempt + 1} with maxTokens=${maxTokens}`);
    
    const aiContent = await orchestrator.call('article_generation', [
      { 
        role: 'system', 
        content: `Você é um jornalista sênior e especialista SEO. Escreva em ${langName}.
REGRAS: ${lim.readability} HTML semântico, links internos (${lim.internalLinks}), FAQ, CTAs, conclusão. Não invente fatos, números, fontes nem citações.
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
async function optimizeExistingContent(article: any, analysis: any, project: any, internalLinks: Array<{title: string, url: string}>, orchestrator: any, rules: RuleProfile, langName: string) {
  const lim = promptLimits(rules);
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
  if (!analysis.flesch.passed) issuesList.push(`Flesch: ${analysis.flesch.score} (abaixo do mínimo ${analysis.flesch.min ?? 60})`);
  if (analysis.structure.h2Count < (rules.rules.h2_count.value ?? 5)) issuesList.push(`H2s: ${analysis.structure.h2Count} (alvo ${rules.rules.h2_count.value ?? 5})`);
  if (!analysis.structure.hasFAQ) issuesList.push(`FAQ: FALTANDO`);
  if (!analysis.structure.hasCTA) issuesList.push(`CTA: FALTANDO`);
  if (analysis.structure.internalLinks < (rules.rules.internal_links.value ?? 10)) issuesList.push(`Links internos: ${analysis.structure.internalLinks} (mín ${rules.rules.internal_links.value ?? 10})`);
  if (analysis.structure.externalLinks < (rules.rules.external_links.value ?? 2)) issuesList.push(`Links externos: ${analysis.structure.externalLinks} (alvo ${rules.rules.external_links.value ?? 2}; só fontes reais já presentes ou informadas)`);
  if (!analysis.structure.hasConclusion) issuesList.push(`Conclusão: FALTANDO`);
  if (analysis.structure.longParagraphs > 0) issuesList.push(`Parágrafos longos: ${analysis.structure.longParagraphs}`);
  if (!analysis.meta.titleOk) issuesList.push(`Título: ${analysis.meta.titleLength} chars (faixa ${rules.rules.title_length.value ?? 55}-${rules.rules.title_length.max ?? 80})`);
  if (!analysis.meta.excerptOk) issuesList.push(`Meta: ${analysis.meta.excerptLength} chars (faixa ${rules.rules.meta_length.value ?? 145}-${rules.rules.meta_length.max ?? 180})`);

  const prompt = `Reescreva COMPLETAMENTE este artigo corrigindo TODOS os problemas listados.

${vernizDNA}

═══ PROBLEMAS ENCONTRADOS (CORRIJA TODOS) ═══
${issuesList.length > 0 ? issuesList.map(i => `❌ ${i}`).join("\n") : "Nenhum problema crítico"}

═══ REGRAS DE CORREÇÃO OBRIGATÓRIAS ═══
1. ${lim.readability}
2. ${lim.internalLinks} como <a href="URL">texto âncora contextual</a>
3. Links externos: só fontes oficiais ou autoritativas reais que já estejam no texto ou na lista fornecida; nunca invente URL
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
      { role: 'system', content: `Você é um editor SEO sênior. Mantenha o idioma original do texto (${langName}). Reescreva conteúdo para ${lim.readability} Frases curtas, voz ativa, HTML semântico. Não invente fatos, números, fontes nem citações.
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
