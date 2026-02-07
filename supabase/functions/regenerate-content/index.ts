import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { callAI, generateGeminiImage } from "../_shared/gemini.ts";

const FUNCTION_NAME = "regenerate-content";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RegenerateRequest {
  type: "title" | "content" | "excerpt" | "image";
  keyword: string;
  currentTitle?: string;
  currentContent?: string;
  language?: string;
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

    // ========== AUTHENTICATION ==========
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
    // ========== END AUTHENTICATION ==========

    const { type, keyword, currentTitle, currentContent, language = "pt-BR" }: RegenerateRequest = await req.json();
    log.info("regenerate_start", { type, keyword });

    let prompt = "";
    let systemPrompt = "";
    let useImageModel = false;

    switch (type) {
      case "title":
        systemPrompt = `Você é um especialista em SEO e copywriting. Gere títulos atraentes e otimizados para buscadores.`;
        prompt = `Crie um título SEO otimizado em ${language} para um artigo sobre: "${keyword}".

Regras:
- Máximo 60 caracteres
- Inclua a palavra-chave principal
- Seja atraente e gere curiosidade
- Use números quando apropriado

Retorne APENAS o título, sem aspas ou explicações.`;
        break;

      case "excerpt":
        systemPrompt = `Você é um especialista em SEO. Gere meta descrições persuasivas e otimizadas.`;
        prompt = `Crie uma meta descrição em ${language} para um artigo com título: "${currentTitle || keyword}".

Regras:
- Entre 150-160 caracteres
- Inclua a palavra-chave "${keyword}"
- Seja persuasivo e inclua call-to-action
- Desperte curiosidade

Retorne APENAS a meta descrição, sem aspas ou explicações.`;
        break;

      case "content":
        systemPrompt = `Você é um redator SEO especialista em criar conteúdo de alta qualidade.`;
        prompt = `Reescreva e melhore o seguinte conteúdo sobre "${keyword}" em ${language}:

${currentContent?.slice(0, 2000) || "Conteúdo vazio"}

Regras:
- Mantenha a estrutura de headers (H2, H3)
- Melhore a legibilidade
- Otimize para SEO
- Mantenha o tamanho similar

Retorne o conteúdo em HTML.`;
        break;

      case "image":
        useImageModel = true;
        prompt = `Generate a professional, high-quality featured image for a blog article about: "${keyword}". 
Style: Modern, clean, professional photography or illustration. 
Aspect ratio: 16:9 landscape format suitable for blog featured image.
No text or watermarks.`;
        break;
    }

    if (useImageModel) {
      // Use Gemini Imagen for image generation
      const imageResult = await generateGeminiImage(prompt, {
        aspectRatio: "16:9",
      });

      if (!imageResult) {
        log.warn("image_generation_unavailable", { type });
        // Return a friendly error message instead of throwing
        log.requestEnd(503, Date.now() - startTime);
        return new Response(JSON.stringify({ 
          error: "Geração de imagem indisponível no momento. Adicione créditos ao workspace ou tente novamente mais tarde.",
          code: "IMAGE_GENERATION_UNAVAILABLE",
          type: "image"
        }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      log.info("regenerate_complete", { type, success: true });
      log.requestEnd(200, Date.now() - startTime);
      return new Response(JSON.stringify({ result: imageResult.imageData, type: "image" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Use OpenAI (primary) for text generation with Gemini fallback
      const result = await callAI(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        { maxTokens: 2000 }
      );

      log.info("regenerate_complete", { type, success: !!result });
      log.requestEnd(200, Date.now() - startTime);
      return new Response(JSON.stringify({ result: result.trim(), type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    log.error("regenerate_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("Rate limit")) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
