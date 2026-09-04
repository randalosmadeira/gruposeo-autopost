/**
 * Zica.ai provider resolver.
 * User BYOK credentials take priority. Platform OpenAI/Claude credentials are
 * resolved from Supabase Vault through service-role-only RPCs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { AIOrchestrator } from "./ai-orchestrator.ts";

export interface UserAIKeys {
  gemini: string;
  openai: string;
  anthropic: string;
  serper: string;
}

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

async function vaultProviderKey(admin: any, provider: "openai" | "anthropic") {
  try {
    const { data, error } = await admin.rpc("get_zica_ai_provider_secret", { p_provider: provider });
    if (error || !data) return "";
    return String(data).trim();
  } catch {
    return "";
  }
}

/**
 * Fetch credentials for a user and merge them with platform credentials.
 * This function never logs secret values.
 */
export async function fetchUserKeys(userId: string): Promise<UserAIKeys> {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Backend de credenciais incompleto");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("user_settings")
    .select("gemini_api_key, openai_api_key, anthropic_api_key, serper_api_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) console.warn(`[BYOK] Configuração do usuário indisponível: ${error.message}`);

  const userOpenAI = String(data?.openai_api_key || "").trim();
  const userAnthropic = String(data?.anthropic_api_key || "").trim();
  const [vaultOpenAI, vaultAnthropic] = await Promise.all([
    userOpenAI ? Promise.resolve("") : vaultProviderKey(admin, "openai"),
    userAnthropic ? Promise.resolve("") : vaultProviderKey(admin, "anthropic"),
  ]);

  return {
    gemini: String(data?.gemini_api_key || env("GEMINI_API_KEY")).trim(),
    openai: userOpenAI || vaultOpenAI || env("OPENAI_API_KEY"),
    anthropic: userAnthropic || vaultAnthropic || env("ANTHROPIC_API_KEY"),
    serper: String(data?.serper_api_key || env("SERPER_API_KEY")).trim(),
  };
}

export async function getOrchestratorForUser(userId: string): Promise<AIOrchestrator> {
  const orchestrator = new AIOrchestrator();
  const userKeys = await fetchUserKeys(userId);
  const keys: { gemini?: string; openai?: string; anthropic?: string } = {};
  if (userKeys.gemini) keys.gemini = userKeys.gemini;
  if (userKeys.openai) keys.openai = userKeys.openai;
  if (userKeys.anthropic) keys.anthropic = userKeys.anthropic;
  orchestrator.setKeys(keys);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    orchestrator.setUsageSink(async ({ taskType, provider, model, usage, options }) => {
      const { error } = await admin.from("token_usage_logs").insert({
        user_id: userId,
        article_id: options?.articleId || null,
        provider,
        model,
        operation: taskType,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        estimated_cost_usd: 0,
        metadata: {
          source: "provider_reported_usage",
          correlation_id: options?.correlationId || null,
          cost_pending_pricing_resolution: true,
        },
      });
      if (error) throw error;
    });
  }

  const available = orchestrator.getAvailableProviders();
  if (!available.includes("openai") && !available.includes("anthropic")) {
    throw new Error("Nenhum provedor OpenAI/Claude disponível. Configure a credencial no painel CEO ou no Vault do Zica.ai.");
  }
  console.log(`[BYOK] Providers disponíveis: ${available.join(", ")}`);
  return orchestrator;
}

/**
 * Legacy bridge for functions still using the runtime key registry.
 */
export async function setEnvKeysForUser(userId: string): Promise<void> {
  const { setRuntimeKey } = await import("./gemini.ts");
  const keys = await fetchUserKeys(userId);
  if (keys.gemini) setRuntimeKey("GEMINI_API_KEY", keys.gemini);
  if (keys.openai) setRuntimeKey("OPENAI_API_KEY", keys.openai);
  if (keys.anthropic) setRuntimeKey("ANTHROPIC_API_KEY", keys.anthropic);
}
