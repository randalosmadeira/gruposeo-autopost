import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lovable AI Gateway
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

interface AIRequest {
  action: string;
  model?: string;
  prompt?: string;
  systemPrompt?: string;
  messages?: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  imagePrompt?: string;
}

// Helper to call Lovable AI Gateway
async function callLovableAI(model: string, messages: any[], options: any = {}) {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY não configurada");
  }

  const response = await fetch("https://ai.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

// Helper to call Gemini directly (for image generation)
async function callGeminiImage(prompt: string) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não configurada");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional auth check
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    }

    const body: AIRequest = await req.json();
    const { action, model, prompt, systemPrompt, messages, maxTokens, temperature, imagePrompt } = body;

    let result;

    switch (action) {
      // === TEXT GENERATION ===
      case "generate-text": {
        const selectedModel = model || "google/gemini-2.5-flash";
        
        const aiMessages = [];
        if (systemPrompt) {
          aiMessages.push({ role: "system", content: systemPrompt });
        }
        if (messages) {
          aiMessages.push(...messages);
        } else if (prompt) {
          aiMessages.push({ role: "user", content: prompt });
        }

        const response = await callLovableAI(selectedModel, aiMessages, { maxTokens, temperature });
        
        result = {
          text: response.choices?.[0]?.message?.content || "",
          usage: response.usage,
          model: selectedModel,
        };
        break;
      }

      // === GENERATE ARTICLE TITLE ===
      case "generate-title": {
        const selectedModel = model || "google/gemini-2.5-flash";
        
        const titlePrompt = `Gere 5 títulos criativos e otimizados para SEO para um artigo sobre: "${prompt}"

Requisitos:
- Títulos entre 50-60 caracteres
- Incluir a palavra-chave principal
- Usar números ou power words quando apropriado
- Gerar curiosidade e engajamento

Retorne apenas os títulos, um por linha, numerados.`;

        const response = await callLovableAI(selectedModel, [
          { role: "user", content: titlePrompt }
        ], { maxTokens: 500, temperature: 0.8 });

        const titles = response.choices?.[0]?.message?.content
          ?.split("\n")
          .filter((line: string) => line.trim())
          .map((line: string) => line.replace(/^\d+\.\s*/, "").trim());

        result = { titles, model: selectedModel };
        break;
      }

      // === GENERATE META DESCRIPTION ===
      case "generate-meta": {
        const selectedModel = model || "google/gemini-2.5-flash";
        
        const metaPrompt = `Gere uma meta descrição otimizada para SEO para um artigo sobre: "${prompt}"

Requisitos:
- Entre 150-160 caracteres
- Incluir a palavra-chave principal
- Call-to-action implícito
- Gerar curiosidade

Retorne apenas a meta descrição, sem aspas.`;

        const response = await callLovableAI(selectedModel, [
          { role: "user", content: metaPrompt }
        ], { maxTokens: 200, temperature: 0.6 });

        result = { 
          metaDescription: response.choices?.[0]?.message?.content?.trim() || "",
          model: selectedModel,
        };
        break;
      }

      // === GENERATE OUTLINE ===
      case "generate-outline": {
        const selectedModel = model || "google/gemini-2.5-flash";
        
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

        const response = await callLovableAI(selectedModel, [
          { role: "user", content: outlinePrompt }
        ], { maxTokens: 2000, temperature: 0.7 });

        let outline;
        try {
          const content = response.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          outline = jsonMatch ? JSON.parse(jsonMatch[0]) : { sections: [] };
        } catch {
          outline = { sections: [], raw: response.choices?.[0]?.message?.content };
        }

        result = { outline, model: selectedModel };
        break;
      }

      // === IMAGE GENERATION ===
      case "generate-image": {
        if (!imagePrompt) {
          return new Response(
            JSON.stringify({ success: false, error: "imagePrompt é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const response = await callGeminiImage(imagePrompt);
        
        // Extract image from response
        const parts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((p: any) => p.inlineData);
        
        if (imagePart?.inlineData) {
          result = {
            image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
            mimeType: imagePart.inlineData.mimeType,
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
            { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", type: "text", speed: "fast" },
            { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", type: "text", speed: "medium" },
            { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro", type: "text", speed: "medium" },
            { id: "openai/gpt-5", name: "GPT-5", type: "text", speed: "slow" },
            { id: "openai/gpt-5-mini", name: "GPT-5 Mini", type: "text", speed: "fast" },
            { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Image", type: "image", speed: "medium" },
          ],
        };
        break;
      }

      // === HEALTH CHECK ===
      case "health": {
        result = {
          status: "online",
          hasLovableKey: !!LOVABLE_API_KEY,
          hasGeminiKey: !!GEMINI_API_KEY,
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

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI API error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
