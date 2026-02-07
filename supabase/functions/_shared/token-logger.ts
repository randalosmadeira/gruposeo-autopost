/**
 * Token Usage Logger
 * 
 * Utility for logging token consumption to the database.
 * Used to track AI API usage per user and article.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export interface TokenUsageLog {
  user_id: string;
  article_id?: string;
  provider: "openai" | "gemini";
  model: string;
  operation: "title" | "content" | "image" | "outline" | "secondary_keywords" | "other";
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  metadata?: Record<string, unknown>;
}

// Token pricing per 1M tokens (as of 2025)
const TOKEN_PRICING = {
  openai: {
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4-turbo": { input: 10.00, output: 30.00 },
    "gpt-5": { input: 5.00, output: 15.00 },
    "gpt-5-mini": { input: 0.30, output: 1.25 },
    "gpt-5-nano": { input: 0.10, output: 0.40 },
  },
  gemini: {
    "gemini-2.0-flash": { input: 0.10, output: 0.40 },
    "gemini-2.0-flash-lite": { input: 0.05, output: 0.20 },
    "gemini-2.5-pro-preview-06-05": { input: 1.25, output: 10.00 },
    "gemini-3-pro-preview": { input: 1.50, output: 12.00 },
    "gemini-3-flash-preview": { input: 0.15, output: 0.60 },
  },
  // Image pricing per image
  images: {
    "dall-e-3-hd": 0.080,
    "dall-e-3-standard": 0.040,
    "dall-e-3": 0.080, // Default to HD
    "imagen-3.0-generate-002": 0.040,
    "imagen-3.0-generate-001": 0.040,
  },
} as const;

/**
 * Calculate estimated cost for text generation
 */
export function calculateTextCost(
  provider: "openai" | "gemini",
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = TOKEN_PRICING[provider];
  
  // Find matching model pricing
  let modelPricing = { input: 0.10, output: 0.40 }; // Default to cheapest
  
  for (const [key, value] of Object.entries(pricing)) {
    if (model.includes(key) || key.includes(model.replace("google/", "").split("-preview")[0])) {
      modelPricing = value;
      break;
    }
  }
  
  // Calculate cost (pricing is per 1M tokens)
  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;
  
  return inputCost + outputCost;
}

/**
 * Calculate estimated cost for image generation
 */
export function calculateImageCost(model: string, quality?: "standard" | "hd"): number {
  if (model.includes("dall-e-3")) {
    if (quality === "standard") return TOKEN_PRICING.images["dall-e-3-standard"];
    return TOKEN_PRICING.images["dall-e-3-hd"];
  }
  
  if (model.includes("imagen")) {
    return TOKEN_PRICING.images["imagen-3.0-generate-002"];
  }
  
  // Default
  return 0.04;
}

/**
 * Estimate token count from text (rough approximation)
 * ~4 characters per token for English, ~3 for Portuguese
 */
export function estimateTokens(text: string, language: string = "pt"): number {
  const charsPerToken = language === "pt" ? 3 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Log token usage to database
 */
export async function logTokenUsage(
  usage: TokenUsageLog,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  try {
    // Use service role to bypass RLS for logging
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error } = await supabase
      .from("token_usage_logs")
      .insert({
        user_id: usage.user_id,
        article_id: usage.article_id || null,
        provider: usage.provider,
        model: usage.model,
        operation: usage.operation,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        estimated_cost_usd: usage.estimated_cost_usd,
        metadata: usage.metadata || {},
      });
    
    if (error) {
      console.error("Failed to log token usage:", error);
    } else {
      console.log(`Token usage logged: ${usage.operation} - ${usage.input_tokens + usage.output_tokens} tokens, $${usage.estimated_cost_usd.toFixed(6)}`);
    }
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error("Token logging error:", error);
  }
}

/**
 * Create a token logger bound to a specific user
 */
export function createTokenLogger(
  userId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  return {
    logText: async (
      provider: "openai" | "gemini",
      model: string,
      operation: TokenUsageLog["operation"],
      inputText: string,
      outputText: string,
      articleId?: string,
      metadata?: Record<string, unknown>
    ) => {
      const inputTokens = estimateTokens(inputText);
      const outputTokens = estimateTokens(outputText);
      const cost = calculateTextCost(provider, model, inputTokens, outputTokens);
      
      await logTokenUsage({
        user_id: userId,
        article_id: articleId,
        provider,
        model,
        operation,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: cost,
        metadata,
      }, supabaseUrl, supabaseServiceKey);
      
      return { inputTokens, outputTokens, cost };
    },
    
    logImage: async (
      provider: "openai" | "gemini",
      model: string,
      articleId?: string,
      quality?: "standard" | "hd",
      metadata?: Record<string, unknown>
    ) => {
      const cost = calculateImageCost(model, quality);
      
      await logTokenUsage({
        user_id: userId,
        article_id: articleId,
        provider,
        model,
        operation: "image",
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: cost,
        metadata: { quality, ...metadata },
      }, supabaseUrl, supabaseServiceKey);
      
      return { cost };
    },
  };
}
