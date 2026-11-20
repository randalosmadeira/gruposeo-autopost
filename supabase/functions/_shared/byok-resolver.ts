/**
 * Zica.ai provider resolver.
 * User BYOK credentials take priority. Platform OpenAI/Claude credentials are
 * resolved from Supabase Vault through service-role-only RPCs.
 * Platform credentials (Vault and environment) are only used when the database
 * function `platform_ai_allowed` says so (manager, or member of a live organization
 * on a non-trial plan); trial spaces and users without an organization get BYOK only.
 * See _shared/platform-ai-gate.ts (fails closed).
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AIOrchestrator } from "./ai-orchestrator.ts";
import { isPlatformAiAllowed, mergeProviderKeys, PLATFORM_AI_BLOCKED_MESSAGE } from "./platform-ai-gate.ts";
import { bindSpendIdentity, currentSpendOrgId } from "./spend-gate.ts";
import { DEFAULT_PRICE_BOOK, textCostMicros, textPriceFor } from "./spend-gate-core.ts";

export interface UserAIKeys {
  gemini: string;
  openai: string;
  anthropic: string;
  serper: string;
  /** false = espaço de teste / sem plano: só as chaves do próprio usuário valem */
  platformAi?: boolean;
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
  const platformAllowed = await isPlatformAiAllowed(admin, userId);
  const [vaultOpenAI, vaultAnthropic] = await Promise.all([
    userOpenAI || !platformAllowed ? Promise.resolve("") : vaultProviderKey(admin, "openai"),
    userAnthropic || !platformAllowed ? Promise.resolve("") : vaultProviderKey(admin, "anthropic"),
  ]);

  return mergeProviderKeys({
    user: { gemini: data?.gemini_api_key, openai: userOpenAI, anthropic: userAnthropic, serper: data?.serper_api_key },
    platformAllowed,
    vault: { openai: vaultOpenAI, anthropic: vaultAnthropic },
    env: { gemini: env("GEMINI_API_KEY"), openai: env("OPENAI_API_KEY"), anthropic: env("ANTHROPIC_API_KEY"), serper: env("SERPER_API_KEY") },
  });
}

export async function getOrchestratorForUser(userId: string): Promise<AIOrchestrator> {
  // Teto Diário de Gasto: o usuário já foi autenticado pela função; o contexto da requisição passa a saber quem paga (no-op sem contexto).
  bindSpendIdentity({ userId });
  const orchestrator = new AIOrchestrator();
  const userKeys = await fetchUserKeys(userId);
  // sem autorização para a IA da plataforma: o orquestrador não pode cair nas chaves do ambiente (só vale o que for do usuário)
  if (userKeys.platformAi === false) orchestrator.disablePlatformKeys();
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
      // estimated_cost_usd and organization_id are resolved by the
      // trg_price_token_usage_log / trg_ledger_token_usage_log triggers
      // (migration 20260917010000_token_cost_governance.sql) from
      // model_pricing_catalog, not computed here - this keeps pricing in one
      // place instead of duplicated across every caller of this sink.
      // Com o teto ligado, a organização que paga já está resolvida no contexto: grava-a explicitamente (o gatilho só a deduz do artigo
      // ou da organização própria do usuário, e sem organização o ledger não recebe o gasto) e dá um custo de reserva para modelo fora do
      // catálogo (o gatilho só substitui o custo quando o modelo está em model_pricing_catalog).
      const spendOrg = currentSpendOrgId();
      const spendFields = spendOrg
        ? { organization_id: spendOrg, estimated_cost_usd: textCostMicros(textPriceFor(DEFAULT_PRICE_BOOK, model), usage.inputTokens, usage.outputTokens) / 1_000_000 }
        : {};
      const { error } = await admin.from("token_usage_logs").insert({
        user_id: userId,
        article_id: options?.articleId || null,
        provider,
        model,
        operation: taskType,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        ...spendFields,
        metadata: {
          source: "provider_reported_usage",
          correlation_id: options?.correlationId || null,
        },
      });
      if (error) throw error;
    });
  }

  const available = orchestrator.getAvailableProviders();
  if (!available.includes("openai") && !available.includes("anthropic")) {
    throw new Error(userKeys.platformAi === false
      ? PLATFORM_AI_BLOCKED_MESSAGE
      : "Nenhum provedor OpenAI/Claude disponível. Configure a credencial no painel CEO ou no Vault do Zica.ai.");
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
  // a ponte antiga lê as chaves do ambiente quando não há chave em memória: sem autorização e sem chave própria, não segue
  if (keys.platformAi === false && !keys.gemini && !keys.openai && !keys.anthropic) throw new Error(PLATFORM_AI_BLOCKED_MESSAGE);
  if (keys.gemini) setRuntimeKey("GEMINI_API_KEY", keys.gemini);
  if (keys.openai) setRuntimeKey("OPENAI_API_KEY", keys.openai);
  if (keys.anthropic) setRuntimeKey("ANTHROPIC_API_KEY", keys.anthropic);
}
