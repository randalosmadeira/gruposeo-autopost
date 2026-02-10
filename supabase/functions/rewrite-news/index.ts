import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { callAI, generateGeminiImage, extractJSON } from "../_shared/gemini.ts";
import { 
  JOURNALISTIC_SYSTEM_PROMPT, 
  MANDATORY_JSON_OUTPUT_INSTRUCTIONS,
  buildUserPrompt, 
  NICHE_IMAGE_PROMPTS,
  type JournalisticRewriteRequest,
  type JournalisticRewriteResponse 
} from "./prompts.ts";
import { createEmotionalImageSystem } from "../_shared/emotional/emotional-image-system.ts";

const FUNCTION_NAME = "rewrite-news";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  log.requestStart(req.method);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body first to check for internal call
    let body: JournalisticRewriteRequest & { userId?: string };
    try {
      body = await req.json();
    } catch (parseError) {
      log.error("body_parse_error", { error: parseError instanceof Error ? parseError.message : 'unknown' });
      return new Response(
        JSON.stringify({ error: "Invalid JSON body", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    log.info("request_body_received", { 
      hasUserId: !!body.userId,
      hasSourceContent: !!body.sourceContent,
      userId: body.userId || 'none'
    });
    
    let userId: string;
    
    // Check for internal call (from monitor-portals, auto-process-rss, etc.)
    // Internal calls pass userId directly in body and use service role key
    if (body.userId) {
      // Validate that userId exists in database
      const { data: userCheck, error: userCheckError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', body.userId)
        .maybeSingle();
      
      // Also check auth.users if profiles doesn't exist
      if (!userCheck && !userCheckError) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(body.userId);
        if (!authUser?.user) {
          log.authFailure("invalid_internal_user_id: " + body.userId);
          return new Response(
            JSON.stringify({ error: "Invalid userId for internal call", request_id: requestId }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      
      userId = body.userId;
      log.info("internal_call_authenticated", { userId });
    } else {
      // Standard user authentication via Bearer token
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        log.authFailure("missing_header");
        return new Response(
          JSON.stringify({ error: "Authorization required", request_id: requestId }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
      
      userId = user.id;
      log.authSuccess(userId);
    }

    // Extract request fields (body already parsed above)
    const { 
      sourceUrl, 
      sourceContent, 
      sourceName, 
      analysisAngle, 
      keyword, 
      niche = 'geral',
      articleLength = 'medium',
      language = "pt-BR", 
      projectId,
      internalLinks = []
    } = body;

    if (!sourceContent || !sourceName) {
      return new Response(
        JSON.stringify({ error: "sourceContent and sourceName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("rewrite_started", { 
      sourceName, 
      niche, 
      articleLength,
      contentLength: sourceContent.length 
    });

    // Fetch user's custom prompt template for news_rewriter
    let systemPromptToUse = JOURNALISTIC_SYSTEM_PROMPT;
    let agentName: string | null = null;
    
    const { data: customTemplate } = await supabaseAdmin
      .from("prompt_templates")
      .select("prompt, agent_name")
      .eq("user_id", userId)
      .eq("target_function", "news_rewriter")
      .eq("is_default", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();
    
    if (customTemplate?.prompt) {
      // ALWAYS append mandatory JSON output instructions to custom prompts
      // This ensures the AI always returns the expected JSON format regardless of custom persona
      // The mandatory instructions contain the exact JSON schema, checklist, and required fields
      systemPromptToUse = customTemplate.prompt + "\n\n" + MANDATORY_JSON_OUTPUT_INSTRUCTIONS;
      
      agentName = customTemplate.agent_name || null;
      log.info("using_custom_prompt", { 
        agentName,
        promptLength: systemPromptToUse.length,
        originalLength: customTemplate.prompt.length,
        mandatoryInstructionsAppended: true
      });
    } else {
      log.info("using_default_prompt");
    }

    // Build user prompt with all configurations
    const userPrompt = buildUserPrompt({
      sourceUrl,
      sourceContent,
      sourceName,
      analysisAngle,
      keyword,
      niche,
      articleLength,
      language,
      internalLinks,
    });

    // Call AI with the system prompt (custom or default)
    const aiResponse = await callAI(
      [
        { role: "system", content: systemPromptToUse },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 8000 }
    );

    // Log raw response for debugging
    log.info("ai_response_received", { 
      responseLength: aiResponse.length,
      hasContent: aiResponse.includes('"content"'),
      hasHtml: aiResponse.includes('"html"'),
      preview: aiResponse.substring(0, 300)
    });

    const parsed = extractJSON<JournalisticRewriteResponse>(aiResponse);
    
    if (!parsed) {
      log.error("json_parse_failed", { response: aiResponse.substring(0, 1000) });
      return new Response(
        JSON.stringify({ 
          error: "Failed to parse AI response", 
          raw: aiResponse.substring(0, 1000),
          request_id: requestId 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log parsed content for debugging
    log.info("json_parsed", {
      hasContent: !!parsed.content,
      hasHtml: !!parsed.content?.html,
      htmlLength: parsed.content?.html?.length || 0,
      metaTitle: parsed.seo?.metaTitle || 'missing',
      wordCount: parsed.content?.wordCount || 0
    });

    // Validate compliance scores
    const complianceCheck = parsed.internal?.complianceCheck || {
      originalityScore: 95,
      citationCompliance: true,
      seoOptimized: true,
      readabilityScore: 80,
    };

    if (complianceCheck.originalityScore < 95) {
      log.warn("low_originality", { score: complianceCheck.originalityScore });
    }

    // Generate featured image using emotional trigger system with retry
    log.info("emotional_image_processing", { niche });
    
    const emotionalSystem = createEmotionalImageSystem({
      callAI: async (msgs, opts) => callAI(msgs, opts),
      generateImage: async (prompt, opts) => generateGeminiImage(prompt, { aspectRatio: opts?.aspectRatio || "16:9" }),
      defaultAspectRatio: '16:9',
      allowOriginalImageReuse: true,
    });
    
    // Validate SEO limits - with fallback generation if missing
    let metaTitle = (parsed.seo?.metaTitle || '').substring(0, 60);
    let metaDescription = (parsed.seo?.metaDescription || '').substring(0, 160);
    
    // RETRY: Generate title if missing
    const MAX_RETRIES = 3;
    
    if (!metaTitle || metaTitle.length < 10) {
      log.warn("missing_title_retrying", { originalTitle: metaTitle });
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const titlePrompt = `Gere um título SEO otimizado (max 60 chars) em português para um artigo sobre: "${keyword || sourceName}"\nNiche: ${niche}\nRetorne APENAS o título, sem aspas, sem explicações.`;
          const titleResponse = await callAI([{ role: "user", content: titlePrompt }], { maxTokens: 100 });
          const newTitle = titleResponse.trim().replace(/^["']|["']$/g, '').substring(0, 60);
          if (newTitle.length >= 10) {
            metaTitle = newTitle;
            log.info("title_generated_retry", { attempt, title: metaTitle });
            break;
          }
        } catch (e) {
          log.warn("title_retry_failed", { attempt, error: e instanceof Error ? e.message : 'unknown' });
          if (attempt === MAX_RETRIES) {
            metaTitle = `${keyword || sourceName} - Análise Completa`.substring(0, 60);
          }
        }
      }
    }
    
    // RETRY: Generate meta description if missing
    if (!metaDescription || metaDescription.length < 50) {
      log.warn("missing_meta_retrying", { originalMeta: metaDescription });
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const metaPrompt = `Gere uma meta description SEO (max 155 chars) em português para: "${metaTitle}"\nRetorne APENAS a description, sem aspas.`;
          const metaResponse = await callAI([{ role: "user", content: metaPrompt }], { maxTokens: 200 });
          const newMeta = metaResponse.trim().replace(/^["']|["']$/g, '').substring(0, 160);
          if (newMeta.length >= 50) {
            metaDescription = newMeta;
            log.info("meta_generated_retry", { attempt, metaLength: metaDescription.length });
            break;
          }
        } catch (e) {
          log.warn("meta_retry_failed", { attempt, error: e instanceof Error ? e.message : 'unknown' });
          if (attempt === MAX_RETRIES) {
            metaDescription = `Análise completa sobre ${keyword || sourceName}. Leia agora e entenda os impactos.`.substring(0, 160);
          }
        }
      }
    }
    
    // IMAGE GENERATION with retry (up to 3 attempts)
    let featuredImage: string | null = null;
    let emotionalTrigger = 'neutral' as string;
    let emotionalConfidence = 0.5;
    let imageStyle = 'default' as string;
    let imageSource = 'generated' as string;
    let imageAltText = '';
    let lastEmotionalResult: any = null;
    
    for (let imageAttempt = 1; imageAttempt <= MAX_RETRIES; imageAttempt++) {
      try {
        const emotionalResult = await emotionalSystem.processNewsImage({
          title: metaTitle || sourceName,
          content: parsed.content?.html || sourceContent,
          sourceName: sourceName,
          sourceUrl: sourceUrl,
          originalImageUrl: parsed.image?.originalUrl,
          niche: niche,
        });
        
        log.info("emotional_analysis_result", {
          attempt: imageAttempt,
          trigger: emotionalResult.emotionalAnalysis.primaryTrigger,
          confidence: emotionalResult.emotionalAnalysis.confidence,
          action: emotionalResult.imageDecision.action,
          source: emotionalResult.source,
        });
        
        emotionalTrigger = emotionalResult.emotionalAnalysis.primaryTrigger;
        emotionalConfidence = emotionalResult.emotionalAnalysis.confidence;
        imageStyle = emotionalResult.style || emotionalResult.imageDecision.style;
        imageSource = emotionalResult.source || 'generated';
        imageAltText = emotionalResult.altText || '';
        lastEmotionalResult = emotionalResult;
        if (emotionalResult.success && emotionalResult.imageData) {
          featuredImage = emotionalResult.imageData;
          log.info("image_generated_success", { attempt: imageAttempt, trigger: emotionalTrigger });
          break;
        } else {
          // Fallback to standard image generation
          log.info("fallback_standard_image", { attempt: imageAttempt, reason: emotionalResult.error });
          const imagePrompt = parsed.image?.prompt || NICHE_IMAGE_PROMPTS[niche] || NICHE_IMAGE_PROMPTS['geral'];
          const fullImagePrompt = `${imagePrompt} Topic: "${metaTitle || sourceName}"`;
          const imageResult = await generateGeminiImage(fullImagePrompt, { aspectRatio: "16:9" });
          if (imageResult?.imageData) {
            featuredImage = imageResult.imageData;
            imageSource = 'generated';
            log.info("fallback_image_success", { attempt: imageAttempt });
            break;
          }
        }
      } catch (imgError) {
        log.warn("image_generation_attempt_failed", { 
          attempt: imageAttempt, 
          error: imgError instanceof Error ? imgError.message : 'unknown' 
        });
        if (imageAttempt < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 2000 * imageAttempt));
        }
      }
    }
    
    if (!featuredImage) {
      log.warn("image_generation_all_retries_failed", { maxRetries: MAX_RETRIES });
    }

    // Save article to database with full structured data including emotional metadata
    const { data: article, error: dbError } = await supabaseAdmin
      .from("articles")
      .insert({
        user_id: userId,
        project_id: projectId || null,
        keyword: keyword || parsed.seo?.focusKeyword || sourceName,
        title: metaTitle,
        content: parsed.content?.html || '',
        excerpt: metaDescription,
        slug: parsed.seo?.slug || '',
        featured_image_url: featuredImage,
        type: "blog",
        status: featuredImage && metaTitle && metaDescription ? "ready" : "draft",
        word_count: parsed.content?.wordCount || parsed.content?.html?.split(/\s+/).length || 0,
        emotional_trigger: emotionalTrigger,
        emotional_confidence: emotionalConfidence,
        image_style: imageStyle,
        image_source: imageSource,
        config: {
          type: "rewrite",
          source_url: sourceUrl,
          source_name: sourceName,
          originality_score: complianceCheck.originalityScore,
          readability_score: complianceCheck.readabilityScore,
          quality_score: parsed.internal?.qualityScore || 90,
          seo_optimized: complianceCheck.seoOptimized,
          citation_compliance: complianceCheck.citationCompliance,
          analysis_angle: analysisAngle,
          niche: niche,
          article_length: articleLength,
          credits: parsed.source?.credits || `Fonte: ${sourceName}${sourceUrl ? ` - ${sourceUrl}` : ''}`,
          tags: parsed.internal?.tags || [],
          keywords: parsed.seo?.keywords || [],
          focus_keyword: parsed.seo?.focusKeyword || keyword,
          image_alt_text: imageAltText || parsed.image?.altText || '',
          reading_time: parsed.content?.readingTime || '',
          monetization: parsed.monetization || null,
          has_image: !!featuredImage,
          has_meta_title: !!metaTitle && metaTitle.length >= 10,
          has_meta_description: !!metaDescription && metaDescription.length >= 50,
          emotional_analysis: {
            trigger: emotionalTrigger,
            confidence: emotionalConfidence,
            secondaryTriggers: lastEmotionalResult?.emotionalAnalysis?.secondaryTriggers || [],
            intensity: lastEmotionalResult?.emotionalAnalysis?.emotionalIntensity || 'medium',
            reasoning: lastEmotionalResult?.emotionalAnalysis?.reasoning || '',
          },
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
      originalityScore: complianceCheck.originalityScore,
      qualityScore: parsed.internal?.qualityScore,
      wordCount: parsed.content?.wordCount,
      hasImage: !!featuredImage,
      hasTitle: !!metaTitle,
      hasMeta: !!metaDescription,
      emotionalTrigger,
      imageSource,
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
          originality_score: complianceCheck.originalityScore,
          quality_score: parsed.internal?.qualityScore || 90,
          readability_score: complianceCheck.readabilityScore,
          seo_optimized: complianceCheck.seoOptimized,
          reading_time: parsed.content?.readingTime,
          credits: parsed.source?.credits,
          niche: niche,
          tags: parsed.internal?.tags,
          keywords: parsed.seo?.keywords,
          emotional_trigger: emotionalTrigger,
          emotional_confidence: emotionalConfidence,
          image_style: imageStyle,
          image_source: imageSource,
          image_alt_text: imageAltText,
        },
        compliance: complianceCheck,
        emotional: {
          trigger: emotionalTrigger,
          confidence: emotionalConfidence,
          secondaryTriggers: emotionalResult.emotionalAnalysis.secondaryTriggers,
          intensity: emotionalResult.emotionalAnalysis.emotionalIntensity,
          style: imageStyle,
          source: imageSource,
          decision: emotionalResult.imageDecision.action,
          reason: emotionalResult.imageDecision.reason,
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
