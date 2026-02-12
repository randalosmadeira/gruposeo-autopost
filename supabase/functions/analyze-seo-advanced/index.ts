import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getOrchestrator } from "../_shared/ai-orchestrator.ts";

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
  const orchestrator = getOrchestrator();

  try {
    const body = await req.json();
    const { article_ids, mode } = body;

    // --- BYOK: Fetch user's API keys from user_settings ---
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || serviceKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }).auth.getUser();

      if (user) {
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
          console.log("[AI SEO] BYOK keys loaded from user_settings");
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

    // Fetch project data for context (links, CTAs, social media)
    const projectIds = [...new Set(articles.map(a => a.project_id).filter(Boolean))];
    let projectsMap: Record<string, any> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, domain, wordpress_url, nicho, tom_padrao, links_prioritarios, social_instagram, social_youtube, social_linkedin, social_twitter, social_tiktok, social_google_maps, social_linktree, cta_leads, cta_conclusao, cta_comunidade, empresa_nome, empresa_whatsapp, empresa_telefone")
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
      
      if (publishedArticles) {
        internalLinksMap[pid] = publishedArticles
          .filter(a => a.published_url)
          .map(a => ({ title: a.title || a.keyword, url: a.published_url! }));
      }
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
              const newAnalysis = analyzeContent(generated.content, newClean, { ...article, title: generated.title || article.title, excerpt: generated.excerpt || article.excerpt });
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

              // Generate image if we have an image prompt
              if (generated.imagePrompt) {
                try {
                  await supabase.functions.invoke("generate-image", {
                    body: { articleId: article.id, prompt: generated.imagePrompt },
                  });
                } catch (imgErr) {
                  console.error(`[AI SEO] Image generation failed for ${article.id}:`, imgErr);
                }
              }

              results.push({
                article_id: article.id,
                title: generated.title || article.title,
                keyword: article.keyword,
                score: newScore,
                optimized: true,
                generated: true,
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
              const newAnalysis = analyzeContent(optimized.content, newClean, { ...article, title: optimized.title || article.title, excerpt: optimized.excerpt || article.excerpt });
              const newScore = Math.min(100, calculateScore(newAnalysis));

              await supabase.from("articles").update({
                content: optimized.content,
                title: optimized.title || article.title,
                excerpt: optimized.excerpt || article.excerpt,
                word_count: wordCount,
                seo_score: newScore,
              }).eq("id", article.id);

              results.push({
                article_id: article.id,
                title: optimized.title || article.title,
                keyword: article.keyword,
                score: newScore,
                optimized: true,
                generated: false,
                project_id: article.project_id,
                published_url: article.published_url,
                status: article.status,
              });
              continue;
            }
          }
        }

        // Fallback: analysis only
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
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// === GENERATE full content for empty articles ===
async function generateFullContent(article: any, project: any, internalLinks: Array<{title: string, url: string}>, orchestrator: any) {
  const keyword = article.keyword || "tema geral";
  const projectName = project?.empresa_nome || project?.name || "";
  const domain = project?.domain || "";
  const nicho = project?.nicho || "jurídico";
  const tom = project?.tom_padrao || "profissional";
  
  const socialLinks: string[] = [];
  if (project?.social_instagram) socialLinks.push(`Instagram: ${project.social_instagram}`);
  if (project?.social_youtube) socialLinks.push(`YouTube: ${project.social_youtube}`);
  if (project?.social_linkedin) socialLinks.push(`LinkedIn: ${project.social_linkedin}`);
  if (project?.social_twitter) socialLinks.push(`X/Twitter: ${project.social_twitter}`);
  if (project?.social_tiktok) socialLinks.push(`TikTok: ${project.social_tiktok}`);
  if (project?.social_google_maps) socialLinks.push(`Google Maps: ${project.social_google_maps}`);
  if (project?.social_linktree) socialLinks.push(`Linktree: ${project.social_linktree}`);
  
  const internalLinksStr = internalLinks.length > 0 
    ? internalLinks.slice(0, 15).map(l => `- "${l.title}": ${l.url}`).join("\n")
    : "Nenhum link interno disponível";

  const ctaInfo = [
    project?.cta_leads ? `CTA Leads: ${project.cta_leads}` : "",
    project?.cta_conclusao ? `CTA Conclusão: ${project.cta_conclusao}` : "",
    project?.cta_comunidade ? `CTA Comunidade: ${project.cta_comunidade}` : "",
    project?.empresa_whatsapp ? `WhatsApp: ${project.empresa_whatsapp}` : "",
    project?.empresa_telefone ? `Telefone: ${project.empresa_telefone}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `Crie um artigo completo e otimizado para SEO sobre "${keyword}".

DADOS DO PROJETO:
- Empresa: ${projectName}
- Domínio: ${domain}
- Nicho: ${nicho}
- Tom: ${tom}
${ctaInfo ? `\nCTAs configurados:\n${ctaInfo}` : ""}
${socialLinks.length > 0 ? `\nRedes Sociais (CITAR nos CTAs):\n${socialLinks.join("\n")}` : ""}

LINKS INTERNOS DISPONÍVEIS (USE no mínimo 10):
${internalLinksStr}

═══ REGRAS INEGOCIÁVEIS (COMPLIANCE JORNALÍSTICO v3.0) ═══

REGRA ZERO-A — META-DESCRIPTION OBRIGATÓRIA:
- 145-160 caracteres, keyword nos primeiros 60 chars, CTA implícito

REGRA ZERO-B — LEGIBILIDADE FLESCH:
- Mínimo 60 (ideal 70-100). Frases máx 25 palavras. Parágrafos máx 4-7 linhas.
- Vocabulário simples e acessível. Voz ativa prioritária (70%+).
- Teste: "Um leitor de 15 anos entenderia isso?" Se não, simplifique.

REGRA ZERO-C — LINKS EXTERNOS (mínimo 2):
- Fontes .gov.br, .edu.br, portais consolidados
- rel="noopener noreferrer" target="_blank"

REGRA ZERO-D — FORMATAÇÃO SEO LIMPA:
- Zero espaços duplos. Hierarquia H1>H2>H3 rigorosa.
- Sem tags vazias, sem divs. HTML semântico: <article>, <section>, <figure>

REGRAS SEO OBRIGATÓRIAS:
1. Estrutura: H1 único > H2 (mín 5) > H3 (mín 3)
2. Mínimo 2 listas estruturadas (ul/ol) para featured snippets
3. Mínimo 10 links internos (usando os links acima como <a href="URL">texto âncora</a>)
4. Máximo 3 links externos de autoridade
5. FAQ com 5-8 perguntas (schema FAQPage)
6. 5 CTAs estratégicos: Urgência, Autoridade, Lead, Comunidade, Fechamento
7. Conclusão estruturada com CTA final
8. Densidade de keyword 0.5%-2.5%
9. Mínimo 1500 palavras
10. Título entre 50-70 caracteres com keyword
11. Gerar slug SEO-friendly
12. Schema Article + FAQPage no JSON
13. Incluir disclaimer de nicho quando aplicável

FORMATO DA RESPOSTA - APENAS JSON VÁLIDO:
{
  "title": "título otimizado (50-70 chars)",
  "slug": "slug-seo-friendly",
  "meta_description": "meta description (145-165 chars)",
  "content": "HTML COMPLETO do artigo com todos H2, H3, links internos, links externos, CTAs, FAQ",
  "image_prompt": "prompt em inglês para gerar imagem destacada relacionada ao tema"
}`;

  const aiContent = await orchestrator.call('article_generation', [
    { 
      role: 'system', 
      content: `Você é um jornalista profissional sênior e especialista SEO do Grupo SEO Marketing. Escreva em português brasileiro seguindo a filosofia "Madeira Sem Verniz" — linguagem simples e acessível para TODOS os públicos.

REGRAS ABSOLUTAS:
- Flesch Reading Ease >= 70 (frases curtas máx 25 palavras, parágrafos 3-4 linhas)
- Vocabulário simples: "dívida" não "inadimplência", "decisão" não "jurisprudência"
- Voz ativa prioritária (mín 70% das frases)
- HTML semântico: <article>, <section>, <figure>, <blockquote> (PROIBIDO: <div>, <span>, <b>, <i>)
- Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6, figure, figcaption
- Links: sempre target="_blank" rel="noopener noreferrer"
- Zero espaços duplos, zero pontuação duplicada
- Inclua OBRIGATORIAMENTE links internos como tags <a> HTML, CTAs com redes sociais, FAQ e conclusão
- Nicho: ${nicho}. Adapte tom e vocabulário conforme especialização.
- Responda APENAS com JSON válido.` 
    },
    { role: 'user', content: prompt },
  ], { maxTokens: 16000, temperature: 0.5 });

  const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      content: parsed.content || null,
      title: parsed.title || null,
      excerpt: parsed.meta_description || null,
      slug: parsed.slug || null,
      imagePrompt: parsed.image_prompt || null,
    };
  } catch (parseErr) {
    console.error("[AI SEO] JSON parse error:", parseErr, "Raw:", jsonStr.substring(0, 500));
    throw new Error("Failed to parse AI response");
  }
}

// === OPTIMIZE existing content ===
async function optimizeExistingContent(article: any, analysis: any, project: any, internalLinks: Array<{title: string, url: string}>, orchestrator: any) {
  const internalLinksStr = internalLinks.length > 0 
    ? internalLinks.slice(0, 15).map(l => `- "${l.title}": ${l.url}`).join("\n")
    : "Nenhum link interno disponível";

  const socialLinks: string[] = [];
  if (project?.social_instagram) socialLinks.push(`Instagram: ${project.social_instagram}`);
  if (project?.social_youtube) socialLinks.push(`YouTube: ${project.social_youtube}`);
  if (project?.social_linkedin) socialLinks.push(`LinkedIn: ${project.social_linkedin}`);
  if (project?.social_twitter) socialLinks.push(`X/Twitter: ${project.social_twitter}`);
  if (project?.social_tiktok) socialLinks.push(`TikTok: ${project.social_tiktok}`);
  if (project?.social_google_maps) socialLinks.push(`Google Maps: ${project.social_google_maps}`);
  if (project?.social_linktree) socialLinks.push(`Linktree: ${project.social_linktree}`);

  const prompt = `Reescreva COMPLETAMENTE este artigo seguindo as diretrizes do Agente Repostagem Jornalística v3.0.

═══ REGRAS INEGOCIÁVEIS (COMPLIANCE JORNALÍSTICO v3.0) ═══

REGRA ZERO-A — META-DESCRIPTION: 145-160 caracteres, keyword nos primeiros 60 chars, CTA implícito
REGRA ZERO-B — LEGIBILIDADE FLESCH >= 70:
- Frases: MÁXIMO 25 palavras cada
- Parágrafos: MÁXIMO 4-7 linhas
- Vocabulário direto e acessível, voz ativa (70%+)
- Teste: "Um leitor de 15 anos entenderia?" Se não, simplifique
REGRA ZERO-C — LINKS EXTERNOS: Mínimo 2 fontes autoritativas (.gov.br, .edu.br)
REGRA ZERO-D — FORMATAÇÃO: Zero espaços duplos, hierarquia H2>H3 rigorosa, HTML semântico

## ESCALA FLESCH (OBRIGATÓRIA):
- 90-100: Muito Fácil (5º ano) — ideal
- 70-80: Bastante Fácil (8º ano) — mínimo aceitável
- 60-70: Padrão (8º-9º ano) — tolerável
- <60: REPROVADO — rejeitar e reescrever

## PROBLEMAS DETECTADOS:
- Flesch ATUAL: ${analysis.flesch.score} (${analysis.flesch.passed ? "OK" : "REPROVADO - REESCREVER TUDO"})
- Média palavras/frase: ${analysis.flesch.avgWordsPerSentence || "N/A"} (máx 25)
- H2s: ${analysis.structure.h2Count} (mín 5), H3s: ${analysis.structure.h3Count} (mín 3)
- FAQ: ${analysis.structure.hasFAQ ? "OK" : "FALTANDO - ADICIONAR"}
- CTA: ${analysis.structure.hasCTA ? "OK" : "FALTANDO - ADICIONAR CTAs"}
- Links internos: ${analysis.structure.internalLinks} (mín 10)
- Links externos: ${analysis.structure.externalLinks} (mín 2)
- Parágrafos longos: ${analysis.structure.longParagraphs}
- Conclusão: ${analysis.structure.hasConclusion ? "OK" : "FALTANDO"}

## REGRAS DE REESCRITA PARA FLESCH ≥ 70:
1. CADA frase: NO MÁXIMO 25 palavras
2. CADA parágrafo: NO MÁXIMO 4-7 linhas
3. Vocabulário simples: "fazer" não "implementar", "depois" não "subsequentemente", "sobre" não "no que diz respeito"
4. Voz ativa sempre: "O cliente assinou o contrato" não "O contrato foi assinado pelo cliente"
5. Quebre frases compostas em frases simples separadas por ponto final
6. Elimine orações subordinadas longas
7. Termos técnicos SEMPRE explicados entre parênteses
8. Prefira listas com bullets a parágrafos densos
9. HTML semântico: <article>, <section>, <figure> (PROIBIDO: <div>, <span>, <b>, <i>)
10. Tags permitidas: p, strong, em, ul, ol, li, blockquote, a, table, h2-h6

## LINKS INTERNOS PARA INSERIR (mín 10):
${internalLinksStr}

${socialLinks.length > 0 ? `## REDES SOCIAIS (citar nos CTAs):\n${socialLinks.join("\n")}` : ""}

## DADOS DO ARTIGO:
KEYWORD: ${article.keyword}
TÍTULO ATUAL: ${article.title}

## CONTEÚDO HTML A REESCREVER:
${(article.content || "").substring(0, 12000)}

RESPONDA APENAS COM JSON:
{
  "optimized_content": "HTML completo reescrito com Flesch >= 70, HTML semântico, links, CTAs, FAQ",
  "optimized_title": "título otimizado (50-70 chars)",
  "optimized_meta": "meta description (145-165 chars com keyword nos primeiros 60 chars)"
}`;

  const aiContent = await orchestrator.call('content_editing', [
    { role: 'system', content: `Você é um jornalista profissional sênior e editor especialista em legibilidade e SEO do Grupo SEO Marketing (Agente Repostagem Jornalística v3.0).

Sua MISSÃO é reescrever conteúdo para atingir Flesch Reading Ease >= 70 seguindo a filosofia "Madeira Sem Verniz":
- Frases de NO MÁXIMO 25 palavras. Parágrafos de 3-7 linhas.
- Linguagem simples e direta para TODOS os públicos.
- Vocabulário acessível: "dívida" não "inadimplência", "decisão" não "jurisprudência".
- Voz ativa prioritária (mínimo 70% das frases).
- HTML semântico: <article>, <section>, <figure>, <blockquote>. PROIBIDO: <div>, <span>, <b>, <i>.
- Zero espaços duplos, zero pontuação duplicada.
- ADICIONE links internos como tags <a href>, CTAs com redes sociais, FAQ e conclusão que estejam faltando.
- Mínimo 2 links externos para fontes autoritativas (.gov.br, .edu.br).
- Meta-description: 145-160 chars com keyword nos primeiros 60 chars.
- Responda APENAS com JSON válido.` },
    { role: 'user', content: prompt },
  ], { maxTokens: 16000, temperature: 0.3 });

  const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      content: parsed.optimized_content || null,
      title: parsed.optimized_title || null,
      excerpt: parsed.optimized_meta || null,
    };
  } catch (parseErr) {
    console.warn("[AI SEO] JSON parse failed, attempting extraction...", (parseErr as Error).message);
    
    // Try to extract JSON from partial/malformed response
    const jsonMatch = jsonStr.match(/\{[\s\S]*"optimized_content"\s*:\s*"[\s\S]*?"(?:,[\s\S]*?)?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          content: parsed.optimized_content || null,
          title: parsed.optimized_title || null,
          excerpt: parsed.optimized_meta || null,
        };
      } catch { /* fall through */ }
    }
    
    // Last resort: extract fields individually via regex
    const contentMatch = jsonStr.match(/"optimized_content"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"optimized_title"|$)/);
    const titleMatch = jsonStr.match(/"optimized_title"\s*:\s*"([^"]+)"/);
    const metaMatch = jsonStr.match(/"optimized_meta"\s*:\s*"([^"]+)"/);
    
    if (contentMatch?.[1]) {
      console.log("[AI SEO] Recovered content via regex extraction");
      return {
        content: contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
        title: titleMatch?.[1] || null,
        excerpt: metaMatch?.[1] || null,
      };
    }
    
    console.error("[AI SEO] Could not recover JSON. Raw length:", jsonStr.length, "First 300:", jsonStr.substring(0, 300));
    throw new Error("Erro ao processar resposta da IA. Tente novamente.");
  }
}

// === Content Analysis ===
function analyzeContent(content: string, cleanContent: string, article: any) {
  const words = cleanContent.split(/\s+/).filter((w: string) => w.length > 0);
  const wordCount = words.length;
  const sentences = cleanContent.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);
  const syllableCount = words.reduce((t: number, w: string) => t + countSyllables(w), 0);
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / Math.max(wordCount, 1);
  const fleschScore = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)));

  const h2Count = (content.match(/<h2[\s>]/gi) || []).length;
  const h3Count = (content.match(/<h3[\s>]/gi) || []).length;
  const imgCount = (content.match(/<img/gi) || []).length;
  const altCount = (content.match(/alt=["'][^"']+["']/gi) || []).length;
  const hasFAQ = /faq|perguntas frequentes|dúvidas comuns/i.test(cleanContent);
  const hasConclusion = /conclus[ãa]o|considerações finais|em suma/i.test(cleanContent);
  const hasCTA = /consulte|entre em contato|saiba mais|fale conosco|whatsapp|agende/i.test(cleanContent);
  const internalLinks = (content.match(/<a[^>]+href=["'][^"']*(?!https?:\/\/)[^"']*["']/gi) || []).length;
  const externalLinks = (content.match(/<a[^>]+href=["']https?:\/\//gi) || []).length;

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
    },
    structure: {
      wordCount, h2Count, h3Count, imgCount, imgsWithAlt: altCount,
      hasFAQ, hasConclusion, hasCTA, internalLinks, externalLinks,
      longParagraphs: longParagraphs.length, totalParagraphs: paragraphs.length,
    },
    keyword: {
      keyword: article.keyword, density: keywordDensity, count: keywordCount,
      isOptimal: keywordDensity >= 0.5 && keywordDensity <= 2.5,
      titleHasKeyword, excerptHasKeyword,
    },
    meta: {
      titleLength: titleLen, titleOk: titleLen >= 50 && titleLen <= 70,
      excerptLength: excerptLen, excerptOk: excerptLen >= 145 && excerptLen <= 165,
    },
  };
}

function calculateScore(analysis: any): number {
  let score = 0;
  const { flesch, structure, keyword, meta } = analysis;
  if (flesch.score >= 70) score += 20; else if (flesch.score >= 60) score += 15; else if (flesch.score >= 50) score += 5;
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
