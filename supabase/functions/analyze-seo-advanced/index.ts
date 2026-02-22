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

    // Fetch existing published articles for internal linking
    let internalLinksMap: Record<string, Array<{title: string, url: string}>> = {};
    for (const pid of projectIds) {
      const { data: publishedArticles } = await supabase
        .from("articles")
        .select("title, published_url, keyword")
        .eq("project_id", pid)
        .eq("status", "published")
        .not("published_url", "is", null)
        .limit(30);
      
      const articleLinks = (publishedArticles || [])
        .filter(a => a.published_url)
        .map(a => ({ title: a.title || a.keyword, url: a.published_url! }));

      const { data: wpIndexArticles } = await supabase
        .from("wordpress_article_index")
        .select("wp_post_title, wp_post_url, primary_keyword, topic_cluster")
        .eq("project_id", pid)
        .eq("wp_post_status", "publish")
        .order("linkability_score", { ascending: false })
        .limit(50);

      const wpLinks = (wpIndexArticles || [])
        .filter(a => a.wp_post_url)
        .map(a => ({ title: a.wp_post_title || a.primary_keyword || '', url: a.wp_post_url }));

      const allLinks = [...articleLinks, ...wpLinks];
      const seen = new Set<string>();
      internalLinksMap[pid] = allLinks.filter(l => {
        if (seen.has(l.url)) return false;
        seen.add(l.url);
        return true;
      }).slice(0, 50);

      console.log(`[AI SEO] Internal links for project ${pid}: ${internalLinksMap[pid].length}`);
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
              const newAnalysis = analyzeContent(generated.content, newClean, updatedArticle);
              const newScore = Math.min(100, calculateScore(newAnalysis));

              await supabase.from("articles").update({
                content: generated.content,
                title: generated.title || article.title,
                excerpt: generated.excerpt || article.excerpt,
                slug: generated.slug || article.slug,
                word_count: wordCount,
                seo_score: newScore,
                status: "ready",
                image_prompt: generated.imagePrompt || null,
              }).eq("id", article.id);

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
            const localAnalysis = analyzeContent(content, cleanContent, article);
            const optimized = await optimizeExistingContent(article, localAnalysis, project, internalLinks, orchestrator);

            if (optimized.content) {
              const newClean = optimized.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              const wordCount = newClean.split(/\s+/).filter((w: string) => w.length > 0).length;
              const updatedArticle = { ...article, title: optimized.title || article.title, excerpt: optimized.excerpt || article.excerpt };
              const newAnalysis = analyzeContent(optimized.content, newClean, updatedArticle);
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

              await supabase.from("articles").update({
                content: optimized.content,
                title: optimized.title || article.title,
                excerpt: optimized.excerpt || article.excerpt,
                word_count: wordCount,
                seo_score: newScore,
              }).eq("id", article.id);

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
        const localAnalysis = analyzeContent(content, cleanContent, article);
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
  if (analysis.structure.internalLinks < 2) issues.push(`Apenas ${analysis.structure.internalLinks} links internos — sem linkagem interna o Google não rastreia.`);
  if (!analysis.structure.hasFAQ) issues.push('FAQ ausente — perde featured snippets.');
  if (!analysis.meta.titleOk) issues.push(`Título com ${analysis.meta.titleLength} chars (ideal: 55-80).`);
  if (!analysis.meta.excerptOk) issues.push(`Meta description com ${analysis.meta.excerptLength} chars (ideal: 145-180).`);
  return issues;
}

function buildImprovements(analysis: any): Array<{area: string, priority: string, suggestion: string, impact: string}> {
  const improvements: Array<{area: string, priority: string, suggestion: string, impact: string}> = [];
  
  if (analysis.flesch.score < 70) {
    improvements.push({ area: 'Legibilidade', priority: 'alta', suggestion: `Flesch ${analysis.flesch.score}. Reduza frases para máx 25 palavras e use vocabulário simples.`, impact: 'Score SEO +15-20 pontos' });
  }
  if (analysis.structure.internalLinks < 10) {
    improvements.push({ area: 'Links Internos', priority: 'alta', suggestion: `Apenas ${analysis.structure.internalLinks} links internos. Adicione no mínimo 10 links contextuais.`, impact: 'Crawlability e authority +20%' });
  }
  if (!analysis.structure.hasFAQ) {
    improvements.push({ area: 'FAQ', priority: 'alta', suggestion: 'Adicione seção FAQ com 5-8 perguntas para capturar featured snippets.', impact: 'CTR +30% via rich snippets' });
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
    improvements.push({ area: 'Links Externos', priority: 'média', suggestion: 'Adicione 2-3 links para fontes autoritativas (.gov.br, .edu.br).', impact: 'Trust signal +10%' });
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

  const prompt = `Crie um artigo completo e otimizado para SEO sobre "${keyword}".

DADOS DO PROJETO:
- Empresa: ${projectName}
- Domínio: ${domain}
- Nicho: ${nicho}
- Tom: ${tom}

${vernizDNA}

LINKS INTERNOS DISPONÍVEIS (USE no mínimo 10):
${internalLinksStr}

═══ REGRAS INEGOCIÁVEIS ═══
- META-DESCRIPTION: 145-180 chars, frase COMPLETA com pontuação final
- TÍTULO: 55-80 chars, COMPLETO, sem parênteses abertos
- LINKS INTERNOS: MÍNIMO 10, ZERO TOLERÂNCIA
- FLESCH >= 70: Frases máx 25 palavras, parágrafos 3-7 linhas
- LINKS EXTERNOS: Mínimo 2 fontes autoritativas
- Estrutura: H2 (mín 5) > H3 (mín 3)
- FAQ: 5-8 perguntas
- CTAs estratégicos

FORMATO DA RESPOSTA - APENAS JSON VÁLIDO:
{
  "title": "título otimizado (55-80 chars)",
  "slug": "slug-seo-friendly",
  "meta_description": "meta description (145-180 chars)",
  "content": "HTML COMPLETO do artigo",
  "image_prompt": "prompt em inglês para imagem"
}`;

  const aiContent = await orchestrator.call('article_generation', [
    { 
      role: 'system', 
      content: `Você é um jornalista sênior e especialista SEO. Escreva em pt-BR, filosofia "Madeira Sem Verniz" — linguagem simples e acessível.
REGRAS: Flesch ≥ 70, frases ≤ 25 palavras, HTML semântico, mín 10 links internos, FAQ, CTAs, conclusão.
Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6, figure, figcaption, section, article.
PROIBIDO: div, span, b, i. Responda APENAS com JSON válido.` 
    },
    { role: 'user', content: prompt },
  ], { maxTokens: 16000, temperature: 0.5 });

  try {
    const parsed = extractJsonFromAIResponse(aiContent);
    return {
      content: parsed.content || null,
      title: parsed.title || null,
      excerpt: parsed.meta_description || null,
      slug: parsed.slug || null,
      imagePrompt: parsed.image_prompt || null,
    };
  } catch (parseErr) {
    console.error("[AI SEO] JSON extraction failed for generateFullContent:", (parseErr as Error).message, "Raw length:", aiContent.length);
    throw new Error("Erro ao processar resposta da IA na geração. Tente novamente.");
  }
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

  const prompt = `Reescreva COMPLETAMENTE este artigo com SEO avançado.

${vernizDNA}

═══ PROBLEMAS DETECTADOS ═══
- Flesch: ${analysis.flesch.score} (${analysis.flesch.passed ? "OK" : "REPROVADO"})
- Média palavras/frase: ${analysis.flesch.avgWordsPerSentence || "N/A"}
- H2s: ${analysis.structure.h2Count} (mín 5)
- FAQ: ${analysis.structure.hasFAQ ? "OK" : "FALTANDO"}
- CTA: ${analysis.structure.hasCTA ? "OK" : "FALTANDO"}
- Links internos: ${analysis.structure.internalLinks} (mín 10)
- Links externos: ${analysis.structure.externalLinks} (mín 2)
- Parágrafos longos: ${analysis.structure.longParagraphs}
- Conclusão: ${analysis.structure.hasConclusion ? "OK" : "FALTANDO"}

═══ REGRAS DE CORREÇÃO ═══
1. Flesch ≥ 70: frases ≤ 25 palavras, parágrafos 3-7 linhas
2. Vocabulário simples, voz ativa 70%+
3. Mín 10 links internos como <a href="URL">
4. Mín 2 links externos autoritativos
5. FAQ com 5-8 perguntas se ausente
6. CTAs estratégicos se ausentes
7. Conclusão com CTA final
8. Título: 55-80 chars, COMPLETO
9. Meta: 145-180 chars, frase COMPLETA

LINKS INTERNOS PARA INSERIR:
${internalLinksStr}

KEYWORD: ${article.keyword}
TÍTULO ATUAL: ${article.title}

CONTEÚDO A REESCREVER:
${contentForAI}

RESPONDA APENAS COM JSON VÁLIDO (use EXATAMENTE estas chaves):
{
  "content": "HTML COMPLETO reescrito do artigo inteiro",
  "title": "título otimizado (55-80 chars)",
  "meta_description": "meta description (145-180 chars)"
}

ATENÇÃO: Use as chaves "content", "title" e "meta_description" — NÃO mude os nomes.`;

  const aiContent = await orchestrator.call('content_editing', [
    { role: 'system', content: `Você é um editor SEO sênior. Reescreva conteúdo para Flesch ≥ 70 com frases curtas, voz ativa, HTML semântico.
ADICIONE links internos, CTAs, FAQ e conclusão faltantes. Responda APENAS com JSON válido.
Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6, section, article, figure, figcaption.` },
    { role: 'user', content: prompt },
  ], { maxTokens: 16000, temperature: 0.3 });

  try {
    const parsed = extractJsonFromAIResponse(aiContent);
    // Support multiple field name variants the AI might use
    const extractedContent = parsed.optimized_content || parsed.content || parsed.html || parsed.article || null;
    const extractedTitle = parsed.optimized_title || parsed.title || null;
    const extractedMeta = parsed.optimized_meta || parsed.meta_description || parsed.excerpt || parsed.meta || null;
    
    console.log(`[AI SEO] Optimization extraction: content=${!!extractedContent} (${(extractedContent||'').length} chars), title=${!!extractedTitle}, meta=${!!extractedMeta}`);
    
    if (!extractedContent) {
      console.error("[AI SEO] AI returned no content. Parsed keys:", Object.keys(parsed).join(', '));
      throw new Error("A IA não retornou conteúdo otimizado. Tente novamente.");
    }
    
    return {
      content: extractedContent,
      title: extractedTitle,
      excerpt: extractedMeta,
    };
  } catch (parseErr) {
    console.error("[AI SEO] JSON extraction failed for optimizeExistingContent:", (parseErr as Error).message, "Raw length:", aiContent.length);
    // Last resort: if AI returned raw HTML without JSON wrapper, try to use it directly
    if (aiContent.includes('<h2') && aiContent.includes('<p') && aiContent.length > 500) {
      console.warn("[AI SEO] Using raw AI response as HTML content (no JSON wrapper detected)");
      return {
        content: aiContent.trim(),
        title: null,
        excerpt: null,
      };
    }
    throw new Error("Erro ao processar resposta da IA na otimização. Tente novamente.");
  }
}

// === Content Analysis ===
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
  const externalLinksArr = allLinks.filter((l: string) => !l.includes(project?.domain || '___'));
  const internalLinksArr = allLinks.filter((l: string) => project?.domain && l.includes(project.domain));
  const relativeLinks = content.match(/<a[^>]+href=["']\/[^"']*["']/gi) || [];
  const internalLinksCount = internalLinksArr.length + relativeLinks.length;
  const externalLinksCount = externalLinksArr.length;

  const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const longParagraphs = paragraphs.filter((p: string) => {
    const text = p.replace(/<[^>]+>/g, "");
    return text.split(/\s+/).length > 60;
  });

  const keyword = (article.keyword || "").toLowerCase();
  const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const keywordCount = keyword ? (cleanContent.match(keywordRegex) || []).length : 0;
  const keywordDensity = keyword && wordCount > 0 ? Math.round((keywordCount * keyword.split(/\s+/).length / wordCount) * 100 * 10) / 10 : 0;

  const titleLen = (article.title || "").length;
  const excerptLen = (article.excerpt || "").length;
  const titleHasKeyword = keyword && (article.title || "").toLowerCase().includes(keyword);
  const excerptHasKeyword = keyword && (article.excerpt || "").toLowerCase().includes(keyword);

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
  };
}

function calculateScore(analysis: any): number {
  let score = 0;
  const { flesch, readability_v2, structure, keyword, meta } = analysis;
  
  if (flesch.score >= 70) score += 20; else if (flesch.score >= 60) score += 15; else if (flesch.score >= 50) score += 5;
  
  if (readability_v2) {
    if (readability_v2.passive_voice_pct <= 10) score += 5; else if (readability_v2.passive_voice_pct <= 15) score += 3;
    if (readability_v2.transition_words_pct >= 30) score += 5; else if (readability_v2.transition_words_pct >= 20) score += 3;
    if (readability_v2.long_sentences_pct <= 15) score += 5; else if (readability_v2.long_sentences_pct <= 25) score += 3;
  }
  
  if (structure.h2Count >= 5) score += 10; else if (structure.h2Count >= 3) score += 7; else if (structure.h2Count > 0) score += 3;
  if (structure.h3Count >= 3) score += 5; else if (structure.h3Count > 0) score += 2;
  if (structure.hasFAQ) score += 10;
  if (structure.hasConclusion) score += 5;
  if (structure.hasCTA) score += 10;
  
  if (structure.internalLinks >= 10) score += 15; else if (structure.internalLinks >= 5) score += 10; else if (structure.internalLinks >= 1) score += 3;
  if (structure.externalLinks >= 1 && structure.externalLinks <= 3) score += 5;
  
  if (structure.imgCount > 0 && structure.imgCount === structure.imgsWithAlt) score += 5; else if (structure.imgCount > 0) score += 2;
  if (structure.longParagraphs === 0) score += 5;
  
  if (keyword.isOptimal) score += 10; else if (keyword.count > 0) score += 5;
  if (meta.titleOk) score += 5;
  if (meta.excerptOk) score += 5;
  if (keyword.titleHasKeyword) score += 5;
  
  if (structure.wordCount >= 1500) score += 5; else if (structure.wordCount >= 800) score += 2;
  
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
