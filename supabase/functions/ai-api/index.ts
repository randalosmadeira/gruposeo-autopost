import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { callGemini, generateGeminiImage, extractJSON, getGeminiApiKey, getOpenAIApiKey } from "../_shared/gemini.ts";

const FUNCTION_NAME = "ai-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AIRequest {
  action: string;
  model?: string;
  prompt?: string;
  systemPrompt?: string;
  messages?: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  imagePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
}

serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional auth check
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
      if (userId) log.authSuccess(userId);
    }

    const body: AIRequest = await req.json();
    const { action, model, prompt, systemPrompt, messages, maxTokens, temperature, imagePrompt, aspectRatio } = body;

    log.requestStart(req.method, action);

    let result;

    switch (action) {
      // === TEXT GENERATION ===
      case "generate-text": {
        const selectedModel = model || "flash";
        
        const aiMessages: Array<{ role: "user" | "system" | "assistant" | "model"; content: string }> = [];
        if (systemPrompt) {
          aiMessages.push({ role: "system", content: systemPrompt });
        }
        if (messages) {
          aiMessages.push(...messages.map(m => ({
            role: m.role as "user" | "system" | "assistant" | "model",
            content: m.content,
          })));
        } else if (prompt) {
          aiMessages.push({ role: "user", content: prompt });
        }

        const response = await callGemini(aiMessages, { 
          model: selectedModel, 
          maxTokens, 
          temperature 
        });
        
        result = {
          text: response,
          model: selectedModel,
        };
        break;
      }

      // === GENERATE ARTICLE TITLE ===
      case "generate-title": {
        const selectedModel = model || "flash";
        
        const titlePrompt = `Gere 5 títulos criativos e otimizados para SEO para um artigo sobre: "${prompt}"

Requisitos:
- Títulos entre 50-60 caracteres
- Incluir a palavra-chave principal
- Usar números ou power words quando apropriado
- Gerar curiosidade e engajamento

Retorne apenas os títulos, um por linha, numerados.`;

        const response = await callGemini(
          [{ role: "user", content: titlePrompt }],
          { model: selectedModel, maxTokens: 500, temperature: 0.8 }
        );

        const titles = response
          .split("\n")
          .filter((line: string) => line.trim())
          .map((line: string) => line.replace(/^\d+\.\s*/, "").trim());

        result = { titles, model: selectedModel };
        break;
      }

      // === GENERATE META DESCRIPTION ===
      case "generate-meta": {
        const selectedModel = model || "flash";
        
        const metaPrompt = `Gere uma meta descrição otimizada para SEO para um artigo sobre: "${prompt}"

Requisitos:
- Entre 150-160 caracteres
- Incluir a palavra-chave principal
- Call-to-action implícito
- Gerar curiosidade

Retorne apenas a meta descrição, sem aspas.`;

        const response = await callGemini(
          [{ role: "user", content: metaPrompt }],
          { model: selectedModel, maxTokens: 200, temperature: 0.6 }
        );

        result = { 
          metaDescription: response.trim(),
          model: selectedModel,
        };
        break;
      }

      // === GENERATE OUTLINE ===
      case "generate-outline": {
        const selectedModel = model || "flash";
        
        const outlinePrompt = `Crie uma estrutura de artigo SEO-otimizado para: "${prompt}"

Inclua:
- H2s principais (3-5)
- H3s secundários (2-3 por H2)
- Pontos-chave para cada seção

Formato JSON:
{
  "sections": [
    {
      "h2": "Título H2",
      "h3s": ["Subtítulo 1", "Subtítulo 2"],
      "keyPoints": ["Ponto 1", "Ponto 2"]
    }
  ]
}`;

        const response = await callGemini(
          [{ role: "user", content: outlinePrompt }],
          { model: selectedModel, maxTokens: 2000, temperature: 0.7 }
        );

        const outline = extractJSON<{ sections: unknown[] }>(response) || { sections: [], raw: response };

        result = { outline, model: selectedModel };
        break;
      }

      // === IMAGE GENERATION (via Gemini Imagen) ===
      case "generate-image": {
        if (!imagePrompt) {
          return new Response(
            JSON.stringify({ success: false, error: "imagePrompt é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const imageResult = await generateGeminiImage(imagePrompt, {
          aspectRatio: aspectRatio || "16:9",
        });
        
        if (imageResult) {
          result = {
            image: imageResult.imageData,
            alt: `Imagem gerada para: ${imagePrompt.slice(0, 50)}...`,
            model: "imagen-3.0",
          };
        } else {
          result = { error: "Nenhuma imagem gerada" };
        }
        break;
      }

      // === AVAILABLE MODELS ===
      case "list-models": {
        result = {
          models: [
            { id: "flash", name: "Gemini 2.0 Flash", type: "text", speed: "fast" },
            { id: "flash-lite", name: "Gemini 2.0 Flash Lite", type: "text", speed: "very-fast" },
            { id: "pro", name: "Gemini 2.5 Pro", type: "text", speed: "medium" },
            { id: "flash-thinking", name: "Gemini 2.0 Flash Thinking", type: "text", speed: "medium" },
            { id: "imagen", name: "Imagen 3.0", type: "image", speed: "medium" },
          ],
        };
        break;
      }

      // === HEALTH CHECK ===
      case "health": {
        let hasGeminiKey = false;
        let hasOpenAIKey = false;
        
        try {
          getGeminiApiKey();
          hasGeminiKey = true;
        } catch { /* key not configured */ }
        
        hasOpenAIKey = !!getOpenAIApiKey();
        
        result = {
          status: "online",
          hasGeminiKey,
          hasOpenAIKey,
          provider: "Google Gemini (direct API)",
          timestamp: new Date().toISOString(),
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Ação não reconhecida",
            availableActions: [
              "generate-text", "generate-title", "generate-meta", 
              "generate-outline", "generate-image", "list-models", "health"
            ]
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    log.requestEnd(200, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("ai_api_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    
    if (errorMessage.includes("Rate limit")) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit excedido. Tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
