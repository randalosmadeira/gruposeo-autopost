/**
 * BYOK Key Resolver - Fetches user's personal API keys for background automation
 * 
 * Used by cron jobs and background edge functions that run WITHOUT user session.
 * Fetches keys from user_settings using SERVICE_ROLE_KEY (bypasses RLS).
 * Falls back to platform-level env secrets if user has no BYOK keys.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { AIOrchestrator } from "./ai-orchestrator.ts";

export interface UserAIKeys {
  gemini: string;
  openai: string;
  anthropic: string;
  serper: string;
}

/**
 * Fetch user's BYOK API keys from user_settings table.
 * Uses SERVICE_ROLE_KEY to bypass RLS (since SELECT is blocked for users).
 */
export async function fetchUserKeys(userId: string): Promise<UserAIKeys> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  const { data, error } = await supabase
    .from("user_settings")
    .select("gemini_api_key, openai_api_key, anthropic_api_key, serper_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  
  if (error) {
    console.warn(`[BYOK] Failed to fetch keys for user ${userId}: ${error.message}`);
  }
  
  return {
    gemini: data?.gemini_api_key || "",
    openai: data?.openai_api_key || "",
    anthropic: data?.anthropic_api_key || "",
    serper: data?.serper_api_key || "",
  };
}

/**
 * Create an AIOrchestrator pre-configured with the user's BYOK keys.
 * Falls back to platform-level env secrets automatically (AIOrchestrator constructor reads Deno.env).
 * User keys OVERRIDE platform keys when available.
 */
export async function getOrchestratorForUser(userId: string): Promise<AIOrchestrator> {
  const orchestrator = new AIOrchestrator();
  
  try {
    const userKeys = await fetchUserKeys(userId);
    
    // Override with user keys (only if non-empty)
    const keysToSet: { gemini?: string; openai?: string; anthropic?: string } = {};
    if (userKeys.gemini) keysToSet.gemini = userKeys.gemini;
    if (userKeys.openai) keysToSet.openai = userKeys.openai;
    if (userKeys.anthropic) keysToSet.anthropic = userKeys.anthropic;
    
    if (Object.keys(keysToSet).length > 0) {
      orchestrator.setKeys(keysToSet);
      console.log(`[BYOK] User ${userId.slice(0, 8)}... keys loaded: ${Object.keys(keysToSet).join(", ")}`);
    } else {
      console.log(`[BYOK] User ${userId.slice(0, 8)}... no BYOK keys, using platform defaults`);
    }
  } catch (err) {
    console.warn(`[BYOK] Error loading user keys, using platform defaults:`, err);
  }
  
  const available = orchestrator.getAvailableProviders();
  if (available.length === 0) {
    throw new Error(`Nenhuma chave de IA disponível para o usuário ${userId.slice(0, 8)}. Configure GEMINI_API_KEY ou OPENAI_API_KEY.`);
  }
  
  console.log(`[BYOK] Providers available: ${available.join(", ")}`);
  return orchestrator;
}

/**
 * Set Gemini API key in Deno.env temporarily for functions that use gemini.ts directly.
 * This allows functions using callAI/callAIStream to work with user's BYOK key.
 */
export async function setEnvKeysForUser(userId: string): Promise<void> {
  const userKeys = await fetchUserKeys(userId);
  
  // Override environment variables with user keys (if available)
  if (userKeys.gemini) {
    // Store original to restore later if needed
    Deno.env.set("GEMINI_API_KEY", userKeys.gemini);
    console.log(`[BYOK] GEMINI_API_KEY set from user ${userId.slice(0, 8)}...`);
  }
  if (userKeys.openai) {
    Deno.env.set("OPENAI_API_KEY", userKeys.openai);
    console.log(`[BYOK] OPENAI_API_KEY set from user ${userId.slice(0, 8)}...`);
  }
  if (userKeys.anthropic) {
    Deno.env.set("ANTHROPIC_API_KEY", userKeys.anthropic);
    console.log(`[BYOK] ANTHROPIC_API_KEY set from user ${userId.slice(0, 8)}...`);
  }
}
