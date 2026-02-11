import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { article_ids, mode } = body;
    // mode: 'analyze' (default) or 'optimize' (AI rewrites + saves + marks for republish)

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
      .select("id, title, keyword, content, excerpt, slug, seo_score, word_count, status, project_id, published_url")
      .in("id", article_ids);

    if (fetchErr) throw fetchErr;
    if (!articles || articles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No articles found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const article of articles) {
      const content = article.content || "";
      const cleanContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      // === LOCAL ANALYSIS ===
      const localAnalysis = analyzeContent(content, cleanContent, article);
      const score = calculateScore(localAnalysis);
      const finalScore = Math.min(100, score);

      // === AI ANALYSIS / OPTIMIZATION ===
      let aiSuggestions = null;
      let optimizedContent = null;
      let optimizedTitle = null;
      let optimizedExcerpt = null;

      try {
        if (isOptimize) {
          // Full optimization: AI rewrites content for better Flesch, structure, SEO
          const optimizeResult = await runAIOptimization(article, localAnalysis, cleanContent, lovableKey);
          aiSuggestions = optimizeResult.suggestions;
          optimizedContent = optimizeResult.content;
          optimizedTitle = optimizeResult.title;
          optimizedExcerpt = optimizeResult.excerpt;
        } else {
          // Analysis only
          aiSuggestions = await runAIAnalysis(article, localAnalysis, cleanContent, lovableKey);
        }
      } catch (e) {
        console.error(`[AI SEO] AI error for ${article.id}:`, e);
        aiSuggestions = { error: "ai_analysis_failed" };
      }

      // Update article in DB
      const updateData: Record<string, unknown> = { seo_score: finalScore };
      
      if (isOptimize && optimizedContent) {
        updateData.content = optimizedContent;
        if (optimizedTitle) updateData.title = optimizedTitle;
        if (optimizedExcerpt) updateData.excerpt = optimizedExcerpt;
        // Recalculate word count
        const newClean = optimizedContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        updateData.word_count = newClean.split(/\s+/).filter((w: string) => w.length > 0).length;
        // Re-analyze optimized content for new score
        const newAnalysis = analyzeContent(optimizedContent, newClean, { ...article, title: optimizedTitle || article.title, excerpt: optimizedExcerpt || article.excerpt });
        const newScore = Math.min(100, calculateScore(newAnalysis));
        updateData.seo_score = newScore;
      }

      await supabase.from("articles").update(updateData).eq("id", article.id);

      results.push({
        article_id: article.id,
        title: optimizedTitle || article.title,
        keyword: article.keyword,
        score: updateData.seo_score as number,
        analysis: localAnalysis,
        ai: aiSuggestions,
        optimized: isOptimize && !!optimizedContent,
        project_id: article.project_id,
        published_url: article.published_url,
        status: article.status,
      });
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

// === AI Optimization: rewrites content ===
async function runAIOptimization(article: any, analysis: any, cleanContent: string, apiKey: string) {
  const prompt = `Você é um editor SEO especialista. Otimize este artigo seguindo TODAS as regras:

REGRAS OBRIGATÓRIAS:
1. Flesch Reading Ease >= 60 (frases curtas, máximo 15 palavras por frase)
2. Parágrafos com no máximo 3-4 linhas
3. Mínimo 3 H2s e 1 H3
4. Incluir seção FAQ se não existir
5. Incluir CTA se não existir
6. Incluir conclusão se não existir
7. Densidade de keyword entre 0.5% e 2.5%
8. Título entre 50-70 caracteres com keyword
9. Meta description entre 145-165 caracteres com keyword
10. Quebrar parágrafos longos (>60 palavras)

TÍTULO ATUAL: ${article.title || "sem título"}
KEYWORD: ${article.keyword || "sem keyword"}
PROBLEMAS ENCONTRADOS:
- Flesch: ${analysis.flesch.score} (${analysis.flesch.passed ? "OK" : "REPROVADO - CORRIGIR"})
- Parágrafos longos: ${analysis.structure.longParagraphs}
- H2s: ${analysis.structure.h2Count}, H3s: ${analysis.structure.h3Count}
- FAQ: ${analysis.structure.hasFAQ ? "sim" : "NÃO - ADICIONAR"}
- CTA: ${analysis.structure.hasCTA ? "sim" : "NÃO - ADICIONAR"}
- Conclusão: ${analysis.structure.hasConclusion ? "sim" : "NÃO - ADICIONAR"}
- Densidade keyword: ${analysis.keyword.density}%
- Título: ${analysis.meta.titleLength} chars
- Meta: ${analysis.meta.excerptLength} chars

CONTEÚDO HTML COMPLETO:
${(article.content || "").substring(0, 8000)}

Responda APENAS com JSON válido:
{
  "optimized_content": "HTML completo otimizado do artigo",
  "optimized_title": "título otimizado (50-70 chars com keyword)",
  "optimized_meta": "meta description otimizada (145-165 chars com keyword)",
  "changes_made": ["lista de mudanças feitas"],
  "new_flesch_estimate": 70
}`;

  const aiResp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um editor SEO que otimiza artigos em HTML para máximo desempenho. Responda APENAS com JSON válido. Mantenha todo o conteúdo semântico original, apenas melhore estrutura, legibilidade e SEO." },
        { role: "user", content: prompt },
      ],
      max_tokens: 16000,
      temperature: 0.3,
    }),
  });

  if (!aiResp.ok) {
    const status = aiResp.status;
    return { suggestions: { error: status === 429 ? "rate_limited" : "ai_failed" }, content: null, title: null, excerpt: null };
  }

  const aiData = await aiResp.json();
  const aiContent = aiData.choices?.[0]?.message?.content || "";
  const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    suggestions: { changes_made: parsed.changes_made, new_flesch_estimate: parsed.new_flesch_estimate },
    content: parsed.optimized_content || null,
    title: parsed.optimized_title || null,
    excerpt: parsed.optimized_meta || null,
  };
}

// === AI Analysis only ===
async function runAIAnalysis(article: any, analysis: any, cleanContent: string, apiKey: string) {
  const prompt = `Analise este artigo e forneça sugestões de melhoria SEO avançada.

TÍTULO: ${article.title || "sem título"}
KEYWORD: ${article.keyword || "sem keyword"}
DADOS DA ANÁLISE:
- Flesch Score: ${analysis.flesch.score} (${analysis.flesch.level})
- Palavras: ${analysis.structure.wordCount}
- H2s: ${analysis.structure.h2Count}, H3s: ${analysis.structure.h3Count}
- FAQ: ${analysis.structure.hasFAQ ? "sim" : "não"}
- CTA: ${analysis.structure.hasCTA ? "sim" : "não"}
- Links internos: ${analysis.structure.internalLinks}, externos: ${analysis.structure.externalLinks}
- Densidade keyword: ${analysis.keyword.density}%
- Parágrafos longos: ${analysis.structure.longParagraphs}/${analysis.structure.totalParagraphs}
- Título: ${analysis.meta.titleLength} chars${analysis.keyword.titleHasKeyword ? " (com keyword)" : " (SEM keyword)"}
- Meta description: ${analysis.meta.excerptLength} chars${analysis.keyword.excerptHasKeyword ? " (com keyword)" : " (SEM keyword)"}

CONTEÚDO (primeiros 2000 chars):
${cleanContent.substring(0, 2000)}

Responda APENAS com JSON:
{
  "overall_grade": "A/B/C/D/F",
  "critical_issues": ["string - problemas críticos"],
  "improvements": [
    {"area": "string", "priority": "alta/média/baixa", "suggestion": "string", "impact": "string"}
  ],
  "flesch_tips": ["dicas específicas para melhorar legibilidade"],
  "seo_tips": ["dicas específicas de SEO on-page"],
  "content_tips": ["dicas para melhorar a qualidade do conteúdo"],
  "optimized_title": "título otimizado sugerido (50-70 chars)",
  "optimized_meta": "meta description otimizada (145-165 chars)"
}`;

  const aiResp = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Você é um especialista em SEO avançado e legibilidade Flesch para conteúdo em português brasileiro. Responda APENAS com JSON válido." },
        { role: "user", content: prompt },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!aiResp.ok) {
    return { error: aiResp.status === 429 ? "rate_limited" : "payment_required" };
  }

  const aiData = await aiResp.json();
  const aiContent = aiData.choices?.[0]?.message?.content || "";
  const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr);
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

  const h1Count = (content.match(/<h1[\s>]/gi) || []).length;
  const h2Count = (content.match(/<h2[\s>]/gi) || []).length;
  const h3Count = (content.match(/<h3[\s>]/gi) || []).length;
  const imgCount = (content.match(/<img/gi) || []).length;
  const altCount = (content.match(/alt=["'][^"']+["']/gi) || []).length;
  const hasFAQ = /faq|perguntas frequentes|dúvidas comuns/i.test(cleanContent);
  const hasConclusion = /conclus[ãa]o|considerações finais|em suma/i.test(cleanContent);
  const hasCTA = /consulte|entre em contato|saiba mais|fale conosco/i.test(cleanContent);
  const internalLinks = (content.match(/href=["'][^"']*(?!https?:\/\/)/gi) || []).length;
  const externalLinks = (content.match(/href=["']https?:\/\//gi) || []).length;

  const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const longParagraphs = paragraphs.filter((p: string) => {
    const text = p.replace(/<[^>]+>/g, "");
    return text.split(/\s+/).length > 60;
  });

  const keyword = (article.keyword || "").toLowerCase();
  const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const keywordCount = keyword ? (cleanContent.match(keywordRegex) || []).length : 0;
  const keywordDensity = keyword ? Math.round((keywordCount * keyword.split(/\s+/).length / wordCount) * 100 * 10) / 10 : 0;

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
    structure: {
      wordCount, h1Count, h2Count, h3Count, imgCount, imgsWithAlt: altCount,
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
  if (flesch.score >= 60) score += 20; else if (flesch.score >= 50) score += 10;
  if (structure.h1Count === 1) score += 5;
  if (structure.h2Count >= 3 && structure.h2Count <= 8) score += 10; else if (structure.h2Count > 0) score += 5;
  if (structure.h3Count > 0) score += 5;
  if (structure.hasFAQ) score += 10;
  if (structure.hasConclusion) score += 5;
  if (structure.hasCTA) score += 5;
  if (structure.internalLinks >= 2) score += 10; else if (structure.internalLinks >= 1) score += 5;
  if (structure.externalLinks >= 1) score += 5;
  if (structure.imgCount > 0 && structure.imgCount === structure.imgsWithAlt) score += 5; else if (structure.imgCount > 0) score += 2;
  if (structure.longParagraphs === 0) score += 5;
  if (keyword.isOptimal) score += 10; else if (keyword.count > 0) score += 5;
  if (meta.titleOk) score += 5;
  if (meta.excerptOk) score += 5;
  if (keyword.titleHasKeyword) score += 5;
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
