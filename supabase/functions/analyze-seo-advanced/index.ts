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
    const { article_ids, user_id, mode } = body;
    // mode: 'analyze' (default) or 'optimize' (AI rewrites paragraphs)

    if (!article_ids || !Array.isArray(article_ids) || article_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "article_ids is required (array)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch articles
    const { data: articles, error: fetchErr } = await supabase
      .from("articles")
      .select("id, title, keyword, content, excerpt, slug, seo_score, word_count, status")
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
      // Flesch calculation
      const words = cleanContent.split(/\s+/).filter((w: string) => w.length > 0);
      const wordCount = words.length;
      const sentences = cleanContent.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
      const sentenceCount = Math.max(sentences.length, 1);
      const syllableCount = words.reduce((t: number, w: string) => t + countSyllables(w), 0);
      const avgWordsPerSentence = wordCount / sentenceCount;
      const avgSyllablesPerWord = syllableCount / Math.max(wordCount, 1);
      const fleschScore = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)));

      // Structure checks
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

      // Paragraphs analysis
      const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
      const longParagraphs = paragraphs.filter((p: string) => {
        const text = p.replace(/<[^>]+>/g, "");
        return text.split(/\s+/).length > 60;
      });

      // Keyword density
      const keyword = (article.keyword || "").toLowerCase();
      const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const keywordCount = keyword ? (cleanContent.match(keywordRegex) || []).length : 0;
      const keywordDensity = keyword ? Math.round((keywordCount * keyword.split(/\s+/).length / wordCount) * 100 * 10) / 10 : 0;

      // Title/meta checks
      const titleLen = (article.title || "").length;
      const excerptLen = (article.excerpt || "").length;
      const titleHasKeyword = keyword && (article.title || "").toLowerCase().includes(keyword);
      const excerptHasKeyword = keyword && (article.excerpt || "").toLowerCase().includes(keyword);

      // Build local analysis
      const localAnalysis = {
        flesch: {
          score: fleschScore,
          level: fleschScore >= 90 ? "Muito Fácil" : fleschScore >= 80 ? "Fácil" : fleschScore >= 70 ? "Bastante Fácil" : fleschScore >= 60 ? "Padrão" : "REPROVADO",
          passed: fleschScore >= 60,
          avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
        },
        structure: {
          wordCount,
          h1Count,
          h2Count,
          h3Count,
          imgCount,
          imgsWithAlt: altCount,
          hasFAQ,
          hasConclusion,
          hasCTA,
          internalLinks,
          externalLinks,
          longParagraphs: longParagraphs.length,
          totalParagraphs: paragraphs.length,
        },
        keyword: {
          keyword: article.keyword,
          density: keywordDensity,
          count: keywordCount,
          isOptimal: keywordDensity >= 0.5 && keywordDensity <= 2.5,
          titleHasKeyword,
          excerptHasKeyword,
        },
        meta: {
          titleLength: titleLen,
          titleOk: titleLen >= 50 && titleLen <= 70,
          excerptLength: excerptLen,
          excerptOk: excerptLen >= 145 && excerptLen <= 165,
        },
      };

      // Calculate overall score
      let score = 0;
      if (fleschScore >= 60) score += 20; else if (fleschScore >= 50) score += 10;
      if (h1Count === 1) score += 5;
      if (h2Count >= 3 && h2Count <= 8) score += 10; else if (h2Count > 0) score += 5;
      if (h3Count > 0) score += 5;
      if (hasFAQ) score += 10;
      if (hasConclusion) score += 5;
      if (hasCTA) score += 5;
      if (internalLinks >= 2) score += 10; else if (internalLinks >= 1) score += 5;
      if (externalLinks >= 1) score += 5;
      if (imgCount > 0 && imgCount === altCount) score += 5; else if (imgCount > 0) score += 2;
      if (longParagraphs.length === 0) score += 5;
      if (keywordDensity >= 0.5 && keywordDensity <= 2.5) score += 10; else if (keywordCount > 0) score += 5;
      if (titleLen >= 50 && titleLen <= 70) score += 5;
      if (excerptLen >= 145 && excerptLen <= 165) score += 5;
      if (titleHasKeyword) score += 5;

      // === AI ANALYSIS ===
      let aiSuggestions = null;
      try {
        const prompt = `Analise este artigo e forneça sugestões de melhoria SEO avançada.

TÍTULO: ${article.title || "sem título"}
KEYWORD: ${article.keyword || "sem keyword"}
DADOS DA ANÁLISE:
- Flesch Score: ${fleschScore} (${localAnalysis.flesch.level})
- Palavras: ${wordCount}
- H2s: ${h2Count}, H3s: ${h3Count}
- FAQ: ${hasFAQ ? "sim" : "não"}
- CTA: ${hasCTA ? "sim" : "não"}
- Links internos: ${internalLinks}, externos: ${externalLinks}
- Densidade keyword: ${keywordDensity}%
- Parágrafos longos: ${longParagraphs.length}/${paragraphs.length}
- Título: ${titleLen} chars${titleHasKeyword ? " (com keyword)" : " (SEM keyword)"}
- Meta description: ${excerptLen} chars${excerptHasKeyword ? " (com keyword)" : " (SEM keyword)"}

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
            Authorization: `Bearer ${lovableKey}`,
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

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const aiContent = aiData.choices?.[0]?.message?.content || "";
          const jsonStr = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          aiSuggestions = JSON.parse(jsonStr);
        } else if (aiResp.status === 429 || aiResp.status === 402) {
          aiSuggestions = { error: aiResp.status === 429 ? "rate_limited" : "payment_required" };
        }
      } catch (e) {
        console.error(`[AI SEO] AI analysis error for ${article.id}:`, e);
        aiSuggestions = { error: "ai_analysis_failed" };
      }

      // Update article seo_score in DB
      const finalScore = Math.min(100, score);
      await supabase
        .from("articles")
        .update({ seo_score: finalScore })
        .eq("id", article.id);

      results.push({
        article_id: article.id,
        title: article.title,
        keyword: article.keyword,
        score: finalScore,
        analysis: localAnalysis,
        ai: aiSuggestions,
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
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
