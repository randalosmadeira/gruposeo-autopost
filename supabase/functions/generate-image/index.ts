
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { generateGeminiImage, callAI } from "../_shared/gemini.ts";
import { createTokenLogger } from "../_shared/token-logger.ts";
import { createEmotionalImageSystem } from "../_shared/emotional/emotional-image-system.ts";
import type { EmotionalTrigger } from "../_shared/emotional/emotional-triggers-config.ts";
import { setEnvKeysForUser } from "../_shared/byok-resolver.ts";

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
  provider?: 'openai' | 'gemini' | 'auto';
  model?: string;
  articleId?: string;
  // Emotional trigger support
  emotionalTrigger?: EmotionalTrigger;
  forceCaricature?: boolean;
  content?: string;
  sourceName?: string;
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
  
  let prompt = `${style === 'photorealistic' ? 'Ultra-realistic, cinematic photograph shot on a Canon EOS R5 with 85mm f/1.4 lens' : style === 'illustration' ? 'Clean modern editorial illustration' : 'Abstract conceptual image'} that DIRECTLY represents the concept: "${title}".

## CRITICAL: VISUAL CONNECTION TO TITLE
The image MUST visually tell the story of "${title}". The viewer should immediately understand what the article is about just by looking at the image.
${keywordList ? `Incorporate visual elements related to: ${keywordList}` : ''}
${context ? `Scene context: ${context}` : ''}

## SCENE & ENVIRONMENT
${visualContext}

## PHOTOGRAPHIC QUALITY
- ${style === 'photorealistic' ? 'Shot in golden hour or soft studio lighting. Shallow depth of field with creamy bokeh. Natural skin tones. Film-grain texture. 8K resolution detail. Hyper-detailed textures on materials (fabric, wood, metal). Volumetric lighting with subtle lens flare.' : style === 'illustration' ? 'Clean vector-style illustration, modern flat design with rich color palette' : 'Abstract geometric patterns, gradient colors, modern art style'}
- Aspect Ratio: ${aspectRatio}
- Composition: Cinematic rule of thirds, strong leading lines, main subject clearly in sharp focus
- Color grading: Professional cinema-grade color correction appropriate for ${segment} sector
- Mood: Authentic, trustworthy, emotionally engaging - NOT stock photo feeling

## ABSOLUTE RESTRICTIONS
- ZERO text, watermarks, or overlays in the image
- NO AI-looking artifacts, plastic skin, or uncanny valley effects
- NO distorted faces, extra fingers, or incorrect anatomy
- NO generic stock photo poses - make it feel candid and real
- NO third-party logos or trademarks

Generate ONE stunning, emotionally compelling image that creates immediate visual connection with the article title.`;

  return prompt;
}

Deno.serve(async (req) => {
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

    // Load user's BYOK API keys for image generation
    await setEnvKeysForUser(user.id);

    // Parse request
    const body: ImageRequest = await req.json();
    
    if (!body.title) {
      return new Response(
        JSON.stringify({ error: "Título é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if emotional trigger mode is requested
    let imageResult: { imageData: string; mimeType: string } | null = null;
    let imagePrompt = '';
    let emotionalData: any = null;
    let provider = 'auto';
    let openaiQuality = 'hd';
    
    if (body.emotionalTrigger || body.forceCaricature) {
      // Use emotional image system
      log.info("emotional_mode", { trigger: body.emotionalTrigger, forceCaricature: body.forceCaricature });
      
      const emotionalSystem = createEmotionalImageSystem({
        callAI: async (msgs) => callAI(msgs),
        generateImage: async (prompt, opts) => generateGeminiImage(prompt, { aspectRatio: opts?.aspectRatio || "16:9" }),
        defaultAspectRatio: body.aspectRatio || '16:9',
        allowOriginalImageReuse: false,
      });
      
      const emotionalResult = await emotionalSystem.processNewsImage({
        title: body.title,
        content: body.content || body.context || body.title,
        sourceName: body.sourceName,
        emotionalTrigger: body.emotionalTrigger,
        forceCaricature: body.forceCaricature,
        niche: body.segment,
        aspectRatio: body.aspectRatio as '16:9' | '1:1' | '4:3',
      });
      
      emotionalData = {
        trigger: emotionalResult.emotionalAnalysis.primaryTrigger,
        confidence: emotionalResult.emotionalAnalysis.confidence,
        style: emotionalResult.decision.style,
        decision: emotionalResult.decision.action,
        disclaimer: emotionalResult.disclaimer || null,
      };
      
      if (emotionalResult.success && emotionalResult.imageData) {
        imageResult = { imageData: emotionalResult.imageData, mimeType: 'image/png' };
        imagePrompt = emotionalResult.prompt || '';
      }
    }
    
    // Standard generation if emotional didn't produce result
    let effectiveProvider = 'gemini'; // will be updated after generation
    if (!imageResult) {
      imagePrompt = buildImagePrompt(body);
      
      const requestedModel = body.model;
      const requestedProvider = body.provider;
      const requestedQuality = body.quality;

      const derivedProvider = requestedModel?.startsWith('dall-e')
        ? 'openai'
        : requestedModel?.startsWith('gemini')
          ? 'gemini'
          : undefined;

      provider = requestedProvider || derivedProvider || 'auto';
      openaiQuality =
        requestedModel === 'dall-e-3-standard' || requestedQuality === 'standard'
          ? 'standard'
          : 'hd';

      log.info("generating_image", { 
        title: body.title,
        segment: body.segment || 'general',
        style: body.style || 'photorealistic',
        provider,
        model: requestedModel,
        openaiQuality: provider === 'openai' ? openaiQuality : undefined,
      });

      const aspectRatioMap: Record<string, "16:9" | "1:1" | "4:3" | "3:4" | "9:16"> = {
        "16:9": "16:9",
        "1:1": "1:1",
        "4:3": "4:3",
      };
      const geminiAspectRatio = aspectRatioMap[body.aspectRatio || "16:9"] || "16:9";

      const genResult = await generateGeminiImage(imagePrompt, {
        aspectRatio: geminiAspectRatio,
        provider,
        openaiQuality,
      });

      if (genResult) {
        imageResult = { imageData: genResult.imageData, mimeType: genResult.mimeType };
        effectiveProvider = genResult.usedProvider || 'gemini';
        log.info("image_provider_used", { provider: effectiveProvider, requested: provider });
      }
    }

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

    // Log token usage – use effectiveProvider (reflects actual fallback used)
    try {
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseServiceKey) {
        const tokenLogger = createTokenLogger(user.id, supabaseUrl, supabaseServiceKey);
        const actualProvider = (effectiveProvider || provider) as 'openai' | 'gemini';
        const actualModel = actualProvider === 'openai'
          ? (openaiQuality === 'standard' ? 'dall-e-3-standard' : 'dall-e-3')
          : 'imagen-3.0-generate-002';
        
        await tokenLogger.logImage(
          actualProvider,
          actualModel,
          body.articleId,
          openaiQuality,
          { 
            aspectRatio: body.aspectRatio || '16:9',
            segment: body.segment || 'general',
            style: body.style || 'photorealistic',
            fallback: effectiveProvider !== provider && provider !== 'auto' ? true : undefined,
          }
        );
      }
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error("Failed to log token usage:", logError);
    }

    // Generate alt text and metadata
    const altText = emotionalData 
      ? `${emotionalData.style === 'caricature' ? 'Caricatura editorial' : 'Imagem ilustrativa'}: ${body.title}`
      : `Imagem ilustrativa: ${body.title}`;
    const imageTitle = body.title.slice(0, 100);

    log.requestEnd(200, Date.now() - startTime);
    
    return new Response(
      JSON.stringify({
        success: true,
        image: imageResult.imageData,
        alt: altText,
        title: imageTitle,
        prompt: imagePrompt,
        model: effectiveProvider === 'openai' ? 'dall-e-3' : 'imagen-3.0-generate-002',
        provider: effectiveProvider || 'gemini',
        request_id: requestId,
        ...(emotionalData && { emotional: emotionalData }),
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
