import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { generateGeminiImage } from "../_shared/gemini.ts";
import { createTokenLogger } from "../_shared/token-logger.ts";

const FUNCTION_NAME = "generate-image";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ImageRequest {
  title: string;
  keywords?: string;
  context?: string;
  segment?: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  style?: 'photorealistic' | 'illustration' | 'abstract';
  aspectRatio?: '16:9' | '1:1' | '4:3';
  quality?: 'standard' | 'high';
  // Optional provider/model override
  provider?: 'openai' | 'gemini' | 'auto';
  model?: string;
  // Optional article ID for linking usage logs
  articleId?: string;
}

// Mapping segment to visual context
const SEGMENT_VISUAL_CONTEXT: Record<string, string> = {
  legal: `Legal/law office environment. Professional attorneys in courtroom or office setting. Scales of justice, gavels, legal documents. Formal, trustworthy atmosphere with dark wood tones and leather.`,
  health: `Medical/healthcare setting. Modern hospital or clinic environment. Doctors with patients, medical equipment, clean white spaces. Warm, caring, professional atmosphere with soft lighting.`,
  fintech: `Financial technology environment. Modern office with screens showing charts and data. Digital elements, abstract representations of money flow. Blue and green color tones, professional and innovative feel.`,
  ecommerce: `E-commerce/retail setting. Product photography style, lifestyle shots with products in use. Clean backgrounds, modern packaging, professional studio lighting.`,
  'b2b-saas': `Business/corporate office environment. Modern workspace with technology, team collaboration, digital screens. Professional atmosphere with blue tones and clean lines.`,
  education: `Educational setting. Classrooms, libraries, students learning. Books, laptops, whiteboards. Bright, inspiring atmosphere with warm lighting.`,
  general: `Professional business environment. Clean, modern setting appropriate for the topic. Neutral but engaging atmosphere.`,
};

// Build image prompt from context
function buildImagePrompt(request: ImageRequest): string {
  const { title, keywords, context, segment = 'general', style = 'photorealistic', aspectRatio = '16:9' } = request;
  
  const visualContext = SEGMENT_VISUAL_CONTEXT[segment] || SEGMENT_VISUAL_CONTEXT.general;
  const keywordList = keywords ? keywords.split(',').map(k => k.trim()).join(', ') : '';
  
  let prompt = `Create a ${style === 'photorealistic' ? 'photorealistic, high-quality professional photograph' : style === 'illustration' ? 'clean modern illustration' : 'abstract conceptual image'} for a blog article.

## TOPIC
Title: "${title}"
${keywordList ? `Keywords: ${keywordList}` : ''}
${context ? `Additional Context: ${context}` : ''}

## VISUAL DIRECTION
${visualContext}

## TECHNICAL REQUIREMENTS
- Aspect Ratio: ${aspectRatio}
- Style: ${style === 'photorealistic' ? 'Professional photography with natural lighting, depth of field (bokeh effect), high resolution' : style === 'illustration' ? 'Clean vector-style illustration, modern flat design' : 'Abstract geometric patterns, gradient colors'}
- Composition: Rule of thirds, main subject clearly in focus
- Colors: Professional color palette appropriate for the segment
- Mood: Trustworthy, professional, engaging

## RESTRICTIONS
- NO text or watermarks in the image
- NO fantasy elements or cartoons (unless illustration style)
- NO distorted faces or incorrect anatomy
- NO third-party logos or trademarks

Generate a single, high-quality image that visually represents the article topic.`;

  return prompt;
}

serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.requestStart(req.method);

    // Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.authFailure("missing_or_invalid_header");
      return new Response(
        JSON.stringify({ error: "Autorização necessária" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      log.authFailure(authError?.message || "user_not_found");
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    log.authSuccess(user.id);

    // Parse request
    const body: ImageRequest = await req.json();
    
    if (!body.title) {
      return new Response(
        JSON.stringify({ error: "Título é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the image prompt
    const imagePrompt = buildImagePrompt(body);

    // Resolve provider/model overrides
    const requestedModel = body.model;
    const requestedProvider = body.provider;
    const derivedProvider = requestedModel?.startsWith('dall-e')
      ? 'openai'
      : requestedModel?.startsWith('gemini')
        ? 'gemini'
        : undefined;
    const provider = requestedProvider || derivedProvider || 'auto';
    const openaiQuality = requestedModel === 'dall-e-3-standard' ? 'standard' : 'hd';

    log.info("generating_image", { 
      title: body.title,
      segment: body.segment || 'general',
      style: body.style || 'photorealistic',
      provider,
      model: requestedModel,
      openaiQuality: provider === 'openai' ? openaiQuality : undefined,
    });

    // Map aspect ratio to Gemini format
    const aspectRatioMap: Record<string, "16:9" | "1:1" | "4:3" | "3:4" | "9:16"> = {
      "16:9": "16:9",
      "1:1": "1:1",
      "4:3": "4:3",
    };
    const geminiAspectRatio = aspectRatioMap[body.aspectRatio || "16:9"] || "16:9";

    // Generate image (OpenAI primary, Gemini fallback), with optional provider override
    const imageResult = await generateGeminiImage(imagePrompt, {
      aspectRatio: geminiAspectRatio,
      provider,
      openaiQuality,
    });

    if (!imageResult) {
      log.error("no_image_generated", {});
      return new Response(
        JSON.stringify({ 
          error: "Nenhuma imagem foi gerada. Tente novamente.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("image_generated", { 
      hasImage: true,
      mimeType: imageResult.mimeType,
    });

    // Log token usage
    try {
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseServiceKey) {
        const tokenLogger = createTokenLogger(user.id, supabaseUrl, supabaseServiceKey);
        const actualModel = provider === 'openai' 
          ? (openaiQuality === 'standard' ? 'dall-e-3-standard' : 'dall-e-3')
          : 'imagen-3.0-generate-002';
        const actualProvider = provider === 'auto' 
          ? (imageResult.mimeType === 'image/png' ? 'openai' : 'gemini')
          : provider as 'openai' | 'gemini';
        
        await tokenLogger.logImage(
          actualProvider,
          actualModel,
          body.articleId,
          openaiQuality,
          { 
            aspectRatio: body.aspectRatio || '16:9',
            segment: body.segment || 'general',
            style: body.style || 'photorealistic',
          }
        );
      }
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error("Failed to log token usage:", logError);
    }

    // Generate alt text and metadata
    const altText = `Imagem ilustrativa: ${body.title}`;
    const imageTitle = body.title.slice(0, 100);

    log.requestEnd(200, Date.now() - startTime);
    
    return new Response(
      JSON.stringify({
        success: true,
        image: imageResult.imageData,
        alt: altText,
        title: imageTitle,
        prompt: imagePrompt,
        model: "gemini-2.0-flash-exp",
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("generation_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    
    if (errorMessage.includes("Rate limit")) {
      return new Response(
        JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos.", request_id: requestId }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
