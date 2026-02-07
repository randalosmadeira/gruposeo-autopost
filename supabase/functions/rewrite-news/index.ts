import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { callAI, generateGeminiImage, extractJSON } from "../_shared/gemini.ts";

const FUNCTION_NAME = "rewrite-news";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// MAA System Prompt for journalistic rewriting (Lei 9.610/98 compliance)
const SYSTEM_PROMPT = `Você é o Assistente MAA Pro, especializado em repostagem jornalística com compliance Lei 9.610/98 (Direitos Autorais).

DIRETRIZES DE COMPLIANCE:

✅ PERMITIDO:
- Reescrever 100% do conteúdo com palavras e estrutura própria
- Manter citações curtas (máx 2-3 frases) com aspas
- Creditar fonte original (nome do veículo + link)
- Adicionar análise, contexto ou opinião própria (40%+ do conteúdo)

❌ PROIBIDO:
- Copiar/colar parágrafos inteiros
- Parafrasear apenas trocando palavras (plágio)
- Remover créditos da fonte original
- Republicar conteúdo de agências (Reuters, AFP) sem licença

TÉCNICA DE REESTRUTURAÇÃO:
1. Identificar 3-5 pontos principais da notícia original
2. Reescrever com estrutura TOTALMENTE diferente
3. Adicionar:
   - Contexto local/nacional
   - Dados complementares relevantes
   - Impacto prático para o leitor
   - Análise jurídica/técnica quando aplicável
4. Inserir créditos no rodapé

SEO 2026:
- E-E-A-T (Experience, Expertise, Authority, Trust)
- Parágrafos curtos (mobile-first, máx 4 linhas)
- Flesch Reading Ease > 60
- Featured Snippets optimization
- Estrutura: H1 (1x), H2 (3-5x), H3 (quando necessário)

FORMATO DE SAÍDA (JSON):
{
  "title": "Título otimizado (55-65 chars)",
  "meta_description": "Meta description (150-160 chars)",
  "slug": "url-amigavel",
  "content_html": "HTML completo do artigo reestruturado",
  "excerpt": "Resumo em 2-3 frases",
  "credits": "Fonte: [Veículo] - [URL]",
  "originality_score": 95,
  "added_value": "Descrição do valor agregado",
  "keywords": ["keyword1", "keyword2"],
  "word_count": 1200
}`;

interface RewriteRequest {
  sourceUrl: string;
  sourceContent: string;
  sourceName: string;
  analysisAngle: string;
  keyword?: string;
  language?: string;
  projectId?: string;
}

serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  log.requestStart(req.method);

  try {
    // Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.authFailure("missing_header");
      return new Response(
        JSON.stringify({ error: "Authorization required", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      log.authFailure(authError?.message || "user_not_found");
      return new Response(
        JSON.stringify({ error: "User not authenticated", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    log.authSuccess(user.id);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const body: RewriteRequest = await req.json();
    const { sourceUrl, sourceContent, sourceName, analysisAngle, keyword, language = "pt-BR", projectId } = body;

    if (!sourceContent || !sourceName) {
      return new Response(
        JSON.stringify({ error: "sourceContent and sourceName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("rewrite_started", { sourceName, contentLength: sourceContent.length });

    // Build user prompt
    const userPrompt = `TAREFA: Repostagem jornalística com compliance Lei 9.610/98

FONTE ORIGINAL:
- Veículo: ${sourceName}
- URL: ${sourceUrl || "Não informada"}
- Conteúdo: ${sourceContent.substring(0, 3000)}${sourceContent.length > 3000 ? '... (truncado)' : ''}

ÂNGULO DE ANÁLISE:
${analysisAngle}

${keyword ? `PALAVRA-CHAVE para otimização SEO: ${keyword}` : ''}

IDIOMA: ${language}

INSTRUÇÕES CRÍTICAS:
1. Reescrever 100% com estrutura TOTALMENTE diferente
2. NÃO copiar parágrafos ou frases longas
3. Adicionar análise e contexto próprio (mín 40% do conteúdo)
4. Creditar fonte no rodapé: "Fonte: ${sourceName}${sourceUrl ? ` - ${sourceUrl}` : ''}"
5. Gerar artigo com mín 800 palavras
6. Estrutura: H2 para seções principais, parágrafos curtos

Se originalidade < 90%, reescreva novamente até atingir 90%+.

Retorne o resultado em formato JSON conforme especificado.`;

    // Call AI (OpenAI primary, Gemini fallback)
    const aiResponse = await callAI(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 4000 }
    );

    const parsed = extractJSON<{
      title: string;
      meta_description: string;
      slug: string;
      content_html: string;
      excerpt: string;
      credits: string;
      originality_score: number;
      added_value: string;
      keywords: string[];
      word_count: number;
    }>(aiResponse);
    
    if (!parsed) {
      log.error("json_parse_failed", { response: aiResponse.substring(0, 500) });
      return new Response(
        JSON.stringify({ 
          error: "Failed to parse AI response", 
          raw: aiResponse.substring(0, 1000),
          request_id: requestId 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate originality
    if (parsed.originality_score && parsed.originality_score < 90) {
      log.warn("low_originality", { score: parsed.originality_score });
    }

    // Generate featured image
    log.info("generating_image", {});
    const imagePrompt = `Professional news article featured image for: "${parsed.title}". Modern, clean, journalistic style. 16:9 aspect ratio.`;
    const imageResult = await generateGeminiImage(imagePrompt, { aspectRatio: "16:9" });
    const featuredImage = imageResult?.imageData || null;

    // Save article to database
    const { data: article, error: dbError } = await supabaseAdmin
      .from("articles")
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        keyword: keyword || parsed.keywords?.[0] || sourceName,
        title: parsed.title,
        content: parsed.content_html,
        excerpt: parsed.excerpt || parsed.meta_description,
        slug: parsed.slug,
        featured_image_url: featuredImage,
        type: "blog",
        status: "draft",
        word_count: parsed.word_count || parsed.content_html?.split(/\s+/).length || 0,
        config: {
          type: "rewrite",
          source_url: sourceUrl,
          source_name: sourceName,
          originality_score: parsed.originality_score,
          added_value: parsed.added_value,
          analysis_angle: analysisAngle,
          credits: parsed.credits,
        },
      })
      .select()
      .single();

    if (dbError) {
      log.error("db_save_error", { error: dbError.message });
      throw dbError;
    }

    log.info("rewrite_completed", { 
      articleId: article.id, 
      originalityScore: parsed.originality_score,
      wordCount: parsed.word_count 
    });
    log.requestEnd(200, Date.now() - startTime);

    return new Response(
      JSON.stringify({
        success: true,
        article: {
          id: article.id,
          title: article.title,
          slug: article.slug,
          word_count: article.word_count,
          featured_image_url: article.featured_image_url,
          originality_score: parsed.originality_score,
          added_value: parsed.added_value,
          credits: parsed.credits,
        },
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("rewrite_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);

    const message = error instanceof Error ? error.message : "Unknown error";
    
    if (message.includes("Rate limit")) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", request_id: requestId }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: message, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
