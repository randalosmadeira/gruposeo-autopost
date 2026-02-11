/**
 * Gemini API Helper - Direct API Integration
 * 
 * This module provides a unified interface for AI calls using
 * ONLY Gemini (GEMINI_API_KEY).
 * 
 * PROVIDER: Gemini is the EXCLUSIVE provider.
 * No OpenAI calls - all requests go through Gemini.
 * 
 * NO Lovable AI Gateway - Direct Gemini API calls only.
 */

// API endpoints
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Default provider configuration - GEMINI ONLY
const DEFAULT_PROVIDER: "gemini" = "gemini";

// Model mappings - internal names to Gemini model IDs
export const GEMINI_MODELS = {
  // Text models
  "flash": "gemini-2.0-flash",
  "flash-lite": "gemini-2.0-flash-lite",
  "pro": "gemini-2.5-pro",
  "flash-thinking": "gemini-2.0-flash-thinking-exp",
  // Image generation model (Imagen 3)
  "imagen": "imagen-3.0-generate-002",
  // Aliases for backward compatibility
  "standard": "gemini-2.0-flash",
  "premium": "gemini-2.5-pro",
  "advanced": "gemini-2.0-flash",
  "professional": "gemini-2.5-pro",
} as const;

// OpenAI models
export const OPENAI_MODELS = {
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4-turbo",
  "dall-e-3": "dall-e-3",
  "dall-e-2": "dall-e-2",
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
  provider?: "gemini" | "openai" | "auto";
  openaiQuality?: "standard" | "hd";
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
 * Get the OpenAI API key
 */
export function getOpenAIApiKey(): string | null {
  return Deno.env.get("OPENAI_API_KEY") || null;
}

/**
 * Check if Gemini API key is available
 */
export function hasGeminiKey(): boolean {
  return !!Deno.env.get("GEMINI_API_KEY");
}

/**
 * Check if OpenAI API key is available
 */
export function hasOpenAIKey(): boolean {
  return !!Deno.env.get("OPENAI_API_KEY");
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
  
  // Handle legacy format (google/gemini-*)
  if (modelAlias.startsWith("google/")) {
    const cleanModel = modelAlias.replace("google/", "").replace("-preview", "");
    if (cleanModel.includes("gemini-3-flash")) return GEMINI_MODELS.flash;
    if (cleanModel.includes("gemini-3-pro")) return GEMINI_MODELS.pro;
    if (cleanModel.includes("gemini-2.5-flash-lite")) return GEMINI_MODELS["flash-lite"];
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
  
  // Transform Gemini SSE format to OpenAI-compatible format
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
              const openAIFormat = {
                choices: [{
                  delta: { content },
                  index: 0,
                }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAIFormat)}\n\n`));
            }
            if (data.candidates?.[0]?.finishReason) {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch {
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
 * Call OpenAI API for text generation
 */
export async function callOpenAI(
  messages: GeminiMessage[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }
  
  const model = options.model || "gpt-4o-mini";
  
  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
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
    
    if (response.status === 429) {
      throw new Error("OpenAI rate limit excedido. Tente novamente.");
    }
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Call OpenAI API with streaming
 */
export async function callOpenAIStream(
  messages: GeminiMessage[],
  options: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<Response> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }
  
  const model = options.model || "gpt-4o-mini";
  
  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
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
      stream: true,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI streaming error:", response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Generate image using OpenAI DALL-E 3
 */
async function generateImageWithOpenAI(
  prompt: string,
  options: GeminiImageOptions = {}
): Promise<{ imageData: string; mimeType: string } | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    console.log("OpenAI API key not available for image generation");
    return null;
  }
  
  // Map aspect ratio to DALL-E 3 size
  const sizeMap: Record<string, string> = {
    "1:1": "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
    "4:3": "1024x1024", // DALL-E doesn't support 4:3, use square
    "3:4": "1024x1024",
  };
  
  const size = sizeMap[options.aspectRatio || "16:9"] || "1792x1024";
  
  try {
    console.log("Generating image with OpenAI DALL-E 3...");
    
    const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: size,
        quality: options.openaiQuality === "standard" ? "standard" : "hd",
        response_format: "b64_json",
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("DALL-E 3 error:", response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    const imageBase64 = data.data?.[0]?.b64_json;
    
    if (imageBase64) {
      console.log("Image generated successfully with DALL-E 3");
      return {
        imageData: `data:image/png;base64,${imageBase64}`,
        mimeType: "image/png",
      };
    }
    
    console.log("No image data in DALL-E 3 response");
    return null;
  } catch (error) {
    console.error("DALL-E 3 generation error:", error);
    return null;
  }
}

/**
 * Generate image using Gemini Imagen 3
 */
async function generateImageWithGemini(
  prompt: string,
  options: GeminiImageOptions = {}
): Promise<{ imageData: string; mimeType: string } | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.log("Gemini API key not available for image generation");
    return null;
  }
  
  const aspectRatio = options.aspectRatio || "16:9";
  
  // Try Imagen 3 first (requires specific API access)
  const imagenModels = [
    "imagen-3.0-generate-002",
    "imagen-3.0-generate-001",
  ];
  
  for (const model of imagenModels) {
    try {
      console.log(`Trying Gemini image generation with ${model}...`);
      
      const url = `${GEMINI_API_BASE}/models/${model}:predict?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectRatio,
            personGeneration: options.personGeneration || "allow_adult",
          },
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Imagen ${model} failed: ${response.status}`, errorText);
        continue;
      }
      
      const data = await response.json();
      const imageBytes = data.predictions?.[0]?.bytesBase64Encoded;
      
      if (imageBytes) {
        console.log(`Image generated successfully with Gemini ${model}`);
        return {
          imageData: `data:image/png;base64,${imageBytes}`,
          mimeType: "image/png",
        };
      }
    } catch (error) {
      console.error(`Error with Gemini ${model}:`, error);
    }
  }
  
  // Try experimental image generation models
  const experimentalModels = [
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.0-flash-preview-image-generation",
  ];
  
  for (const model of experimentalModels) {
    try {
      console.log(`Trying experimental model: ${model}...`);
      
      const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
      });
      
      if (!response.ok) {
        console.log(`Model ${model} failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || "image/png";
          console.log(`Image generated with ${model}`);
          return {
            imageData: `data:${mimeType};base64,${part.inlineData.data}`,
            mimeType,
          };
        }
      }
    } catch (error) {
      console.error(`Error with ${model}:`, error);
    }
  }
  
  console.log("All Gemini image models failed");
  return null;
}

/**
 * Generate image - GEMINI ONLY (Imagen 3)
 * All image generation goes through Gemini
 */
export async function generateGeminiImage(
  prompt: string,
  options: GeminiImageOptions = {}
): Promise<{ imageData: string; mimeType: string } | null> {
  const aspectRatio = options.aspectRatio || "16:9";
  const enhancedPrompt = `Create a professional, high-quality photograph for a blog article.

${prompt}

Requirements:
- Aspect ratio: ${aspectRatio} landscape format
- Style: Modern, clean, professional photography with natural lighting
- No text, watermarks, or logos
- High resolution, sharp details, suitable for web publication
- Professional business/editorial quality`;
  
  console.log("Image generation: using Gemini Imagen (exclusive provider)...");
  const result = await generateImageWithGemini(enhancedPrompt, options);
  
  if (result) {
    return result;
  }
  
  console.log("Gemini image generation failed");
  return null;
}

/**
 * Universal AI call - GEMINI ONLY
 * All text generation goes through Gemini
 */
export async function callAI(
  messages: GeminiMessage[],
  options: GeminiTextOptions = {}
): Promise<string> {
  if (!hasGeminiKey()) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }
  
  console.log("Using Gemini (exclusive provider)...");
  return await callGemini(messages, options);
}

/**
 * Universal AI call with streaming - GEMINI ONLY
 */
export async function callAIStream(
  messages: GeminiMessage[],
  options: GeminiTextOptions = {}
): Promise<Response> {
  if (!hasGeminiKey()) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }
  
  console.log("Using Gemini stream (exclusive provider)...");
  return await callGeminiStream(messages, options);
}

/**
 * Helper to extract JSON from AI response
 */
export function extractJSON<T>(text: string): T | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
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

/**
 * Get available AI providers status - GEMINI ONLY
 */
export function getAIProvidersStatus(): {
  gemini: boolean;
  imageGeneration: boolean;
  primaryProvider: string;
} {
  const hasGemini = hasGeminiKey();
  
  return {
    gemini: hasGemini,
    imageGeneration: hasGemini,
    primaryProvider: hasGemini ? "Google Gemini" : "none",
  };
}
