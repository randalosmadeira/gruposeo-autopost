
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { 
  callGemini, 
  callOpenAI,
  generateGeminiImage, 
  extractJSON, 
  hasGeminiKey, 
  hasOpenAIKey,
  getAIProvidersStatus,
} from "../_shared/gemini.ts";

const FUNCTION_NAME = "ai-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

Deno.serve(async (req) => {
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
        
        const titlePrompt = `Você é um especialista em copywriting e SEO. Sua tarefa é gerar 5 títulos ÚNICOS e PERSUASIVOS para um artigo sobre: "${prompt}"

REGRAS OBRIGATÓRIAS:
1. NUNCA use padrões genéricos como "Guia Completo para [ano]", "Tudo o que Você Precisa Saber", "O Guia Definitivo"
2. NUNCA inclua o ano (2025, 2026, etc.) no título, a menos que o tema seja inerentemente temporal (ex: "tendências", "mudanças na legislação")
3. Cada título deve ter entre 45-60 caracteres para melhor CTR no Google
4. Inclua a palavra-chave principal "${prompt}" de forma natural

TÉCNICAS DE TÍTULOS PERSUASIVOS (use variadas):
- Números específicos: "7 Estratégias", "12 Erros que..."
- Curiosidade: "Por Que...", "O Que Ninguém Te Conta Sobre..."
- Benefício direto: "Como Aumentar...", "Economize..."
- Urgência/Escassez: "Antes Que Seja Tarde...", "O Segredo..."
- Autoridade: "Segundo Especialistas...", "Comprovado:..."
- Negative hooks: "Erros Fatais em...", "Pare de..."
- How-to prático: "Passo a Passo para...", "Como Fazer..."
- Comparativo: "X vs Y: Qual o Melhor..."

INSPIRAÇÃO: Pense como os melhores portais e blogs ranqueados no Google, Bing e Yahoo criam seus títulos para alta taxa de cliques. Analise mentalmente o que funciona nos resultados de busca para o termo "${prompt}".

Retorne APENAS os 5 títulos, um por linha, numerados de 1 a 5. Sem explicações adicionais.`;

        const response = await callGemini(
          [{ role: "user", content: titlePrompt }],
          { model: selectedModel, maxTokens: 500, temperature: 0.9 }
        );

        const titles = response
          .split("\n")
          .filter((line: string) => line.trim())
          .map((line: string) => line.replace(/^\d+\.\s*/, "").replace(/\*\*/g, "").trim())
          .filter((line: string) => line.length > 10);

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
        const providers = getAIProvidersStatus();
        
        result = {
          status: "online",
          hasGeminiKey: providers.gemini,
          hasOpenAIKey: providers.openai,
          imageGeneration: providers.imageGeneration,
          primaryProvider: providers.primaryProvider,
          provider: "Direct API (OpenAI primary, Gemini fallback)",
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
