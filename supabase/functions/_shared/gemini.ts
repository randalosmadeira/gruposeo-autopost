/**
 * Gemini API Helper - Centralized module for Google Gemini AI integration
 * 
 * This module provides a unified interface for all Gemini API calls,
 * supporting both text generation and image generation.
 * 
 * Environment variable required: GEMINI_API_KEY
 * Fallback: OPENAI_API_KEY for OpenAI models (optional complement)
 */

// Gemini API endpoints
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Model mappings - internal names to Gemini model IDs
export const GEMINI_MODELS = {
  // Text models
  "flash": "gemini-2.0-flash",
  "flash-lite": "gemini-2.0-flash-lite",
  "pro": "gemini-2.5-pro-preview-06-05",
  "flash-thinking": "gemini-2.0-flash-thinking-exp",
  // Image models
  "imagen": "imagen-3.0-generate-002",
  // Aliases for backward compatibility
  "standard": "gemini-2.0-flash",
  "premium": "gemini-2.5-pro-preview-06-05",
  "advanced": "gemini-2.0-flash",
  "professional": "gemini-2.5-pro-preview-06-05",
} as const;

// OpenAI fallback models (optional)
export const OPENAI_MODELS = {
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4-turbo",
} as const;

export interface GeminiTextOptions {
  model?: keyof typeof GEMINI_MODELS | string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface GeminiMessage {
  role: "user" | "system" | "assistant" | "model";
  content: string;
}

export interface GeminiImageOptions {
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  numberOfImages?: number;
  personGeneration?: "dont_allow" | "allow_adult";
}

/**
 * Get the configured Gemini API key
 */
export function getGeminiApiKey(): string {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada. Configure a chave da API do Gemini.");
  }
  return apiKey;
}

/**
 * Get the optional OpenAI API key for fallback
 */
export function getOpenAIApiKey(): string | null {
  return Deno.env.get("OPENAI_API_KEY") || null;
}

/**
 * Resolve model alias to actual Gemini model ID
 */
export function resolveModel(modelAlias: string): string {
  // Check if it's a direct Gemini model ID
  if (modelAlias.startsWith("gemini-") || modelAlias.startsWith("imagen-")) {
    return modelAlias;
  }
  
  // Check if it's a known alias
  if (modelAlias in GEMINI_MODELS) {
    return GEMINI_MODELS[modelAlias as keyof typeof GEMINI_MODELS];
  }
  
  // Check for legacy Lovable AI Gateway format
  if (modelAlias.startsWith("google/")) {
    const cleanModel = modelAlias.replace("google/", "").replace("-preview", "");
    if (cleanModel.includes("gemini-3-flash")) return GEMINI_MODELS.flash;
    if (cleanModel.includes("gemini-3-pro")) return GEMINI_MODELS.pro;
    if (cleanModel.includes("gemini-2.5-flash-lite")) return GEMINI_MODELS["flash-lite"];
    if (cleanModel.includes("gemini-2.5-flash-image")) return GEMINI_MODELS.imagen;
    if (cleanModel.includes("gemini-2.5-flash")) return GEMINI_MODELS.flash;
    if (cleanModel.includes("gemini-2.5-pro")) return GEMINI_MODELS.pro;
    return GEMINI_MODELS.flash;
  }
  
  // Default to flash
  return GEMINI_MODELS.flash;
}

/**
 * Convert messages to Gemini API format
 */
function convertToGeminiFormat(messages: GeminiMessage[]): { 
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: string; parts: { text: string }[] }[];
} {
  const systemMessages = messages.filter(m => m.role === "system");
  const otherMessages = messages.filter(m => m.role !== "system");
  
  const systemInstruction = systemMessages.length > 0 
    ? { parts: [{ text: systemMessages.map(m => m.content).join("\n\n") }] }
    : undefined;
  
  const contents = otherMessages.map(m => ({
    role: m.role === "assistant" || m.role === "model" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  
  return { systemInstruction, contents };
}

/**
 * Call Gemini API for text generation (non-streaming)
 */
export async function callGemini(
  messages: GeminiMessage[],
  options: GeminiTextOptions = {}
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const model = resolveModel(options.model || "flash");
  
  const { systemInstruction, contents } = convertToGeminiFormat(messages);
  
  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
    },
  };
  
  if (systemInstruction) {
    requestBody.systemInstruction = systemInstruction;
  }
  
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit excedido. Tente novamente em alguns segundos.");
    }
    if (response.status === 403) {
      throw new Error("Chave API inválida ou sem permissão.");
    }
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/**
 * Call Gemini API for text generation with streaming
 * Returns a ReadableStream for SSE
 */
export async function callGeminiStream(
  messages: GeminiMessage[],
  options: GeminiTextOptions = {}
): Promise<Response> {
  const apiKey = getGeminiApiKey();
  const model = resolveModel(options.model || "flash");
  
  const { systemInstruction, contents } = convertToGeminiFormat(messages);
  
  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
    },
  };
  
  if (systemInstruction) {
    requestBody.systemInstruction = systemInstruction;
  }
  
  const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini streaming error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit excedido. Tente novamente em alguns segundos.");
    }
    if (response.status === 403) {
      throw new Error("Chave API inválida ou sem permissão.");
    }
    throw new Error(`Gemini API error: ${response.status}`);
  }
  
  // Transform Gemini SSE format to OpenAI-compatible format for frontend compatibility
  const transformStream = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      const lines = text.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              // Convert to OpenAI-compatible format
              const openAIFormat = {
                choices: [{
                  delta: { content },
                  index: 0,
                }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAIFormat)}\n\n`));
            }
            // Check for finish reason
            if (data.candidates?.[0]?.finishReason) {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch {
            // Pass through as-is if not parseable
            controller.enqueue(chunk);
          }
        }
      }
    },
  });
  
  return new Response(response.body?.pipeThrough(transformStream), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Generate image using Lovable AI Gateway with Gemini image model
 * Uses google/gemini-2.5-flash-image for image generation
 */
export async function generateGeminiImage(
  prompt: string,
  options: GeminiImageOptions = {}
): Promise<{ imageData: string; mimeType: string } | null> {
  // Use Lovable AI Gateway for image generation
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  
  if (!lovableApiKey) {
    console.error("LOVABLE_API_KEY not configured for image generation");
    // Fallback to direct Gemini API
    return await generateGeminiImageDirect(prompt, options);
  }
  
  const url = "https://ai.gateway.lovable.dev/v1/chat/completions";
  
  const aspectRatioText = options.aspectRatio || "16:9";
  const enhancedPrompt = `Generate a high-quality professional image based on this description:

${prompt}

Requirements:
- Aspect ratio: ${aspectRatioText}
- Style: Professional, clean, suitable for business/blog use
- No text or watermarks in the image
- High resolution and sharp details`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: enhancedPrompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI Gateway image error:", response.status, errorText);
      
      if (response.status === 429) {
        console.log("Rate limit exceeded, trying direct Gemini API fallback");
        return await generateGeminiImageDirect(prompt, options);
      }
      if (response.status === 402) {
        console.log("Credits insufficient, trying direct Gemini API fallback");
        return await generateGeminiImageDirect(prompt, options);
      }
      
      // For other errors, try direct API as fallback
      console.log("Gateway error, trying direct Gemini API fallback");
      return await generateGeminiImageDirect(prompt, options);
    }
    
    const data = await response.json();
    
    // Extract image from Lovable AI Gateway response
    const images = data.choices?.[0]?.message?.images;
    if (images && images.length > 0) {
      const imageUrl = images[0]?.image_url?.url;
      if (imageUrl) {
        // Extract mime type from data URL
        const mimeMatch = imageUrl.match(/^data:([^;]+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        
        return {
          imageData: imageUrl,
          mimeType,
        };
      }
    }
    
    console.error("No image data in Lovable AI Gateway response");
    return null;
  } catch (error) {
    console.error("Image generation error:", error);
    return null;
  }
}

/**
 * Fallback: Generate image using direct Gemini Imagen API
 * Uses the imagen-3.0-generate-001 model which is available in the v1beta API
 */
async function generateGeminiImageDirect(
  prompt: string,
  options: GeminiImageOptions = {}
): Promise<{ imageData: string; mimeType: string } | null> {
  const apiKey = getGeminiApiKey();
  
  // Try Imagen 3 first (the correct image generation model)
  const model = "imagen-3.0-generate-001";
  const url = `${GEMINI_API_BASE}/models/${model}:predict?key=${apiKey}`;
  
  const aspectRatioText = options.aspectRatio || "16:9";
  const enhancedPrompt = `A professional, high-quality photograph for a blog article. ${prompt}. 
Style: Modern, clean, professional photography with natural lighting. 
Aspect ratio: ${aspectRatioText} landscape format.
No text, watermarks, or logos in the image.
High resolution, sharp details, suitable for web publication.`;
  
  const requestBody = {
    instances: [{ prompt: enhancedPrompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatioText,
      personGeneration: options.personGeneration || "allow_adult",
    },
  };
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Imagen 3 API error:", response.status, errorText);
      
      // If Imagen 3 fails, model might not be available
      // Return null and let the caller handle it gracefully
      console.log("Imagen 3 not available, image generation skipped");
      return null;
    }
    
    const data = await response.json();
    
    // Imagen 3 returns predictions with bytesBase64Encoded
    const imageBytes = data.predictions?.[0]?.bytesBase64Encoded;
    
    if (imageBytes) {
      return {
        imageData: `data:image/png;base64,${imageBytes}`,
        mimeType: "image/png",
      };
    }
    
    console.log("No image data in Imagen 3 response");
    return null;
  } catch (error) {
    console.error("Direct Gemini image generation error:", error);
    return null;
  }
}

/**
 * Call OpenAI API as fallback (requires OPENAI_API_KEY)
 */
export async function callOpenAI(
  messages: GeminiMessage[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada. OpenAI está disponível apenas como complemento.");
  }
  
  const model = options.model || "gpt-4o-mini";
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.content,
      })),
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Universal AI call - tries Gemini first, falls back to OpenAI if configured
 */
export async function callAI(
  messages: GeminiMessage[],
  options: GeminiTextOptions & { fallbackToOpenAI?: boolean } = {}
): Promise<string> {
  try {
    return await callGemini(messages, options);
  } catch (error) {
    if (options.fallbackToOpenAI && getOpenAIApiKey()) {
      console.warn("Gemini failed, falling back to OpenAI:", error);
      return await callOpenAI(messages, {
        model: "gpt-4o-mini",
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });
    }
    throw error;
  }
}

/**
 * Helper to extract JSON from AI response
 */
export function extractJSON<T>(text: string): T | null {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      // Try fixing common JSON issues
      let fixed = jsonMatch[0]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"');
      try {
        return JSON.parse(fixed) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}
