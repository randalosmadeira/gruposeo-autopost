import { AIOrchestrator } from "./ai-orchestrator.ts";
import { adminClient, getRuntimeKeys } from "./supabase-runtime.ts";

export interface UserAIKeys {
  gemini: string;
  openai: string;
  anthropic: string;
  serper: string;
}

export interface EffectiveAIKeys extends UserAIKeys {
  sources: {
    openai: "user" | "vault" | "env" | "missing";
    anthropic: "user" | "vault" | "env" | "missing";
    gemini: "user" | "env" | "missing";
    serper: "user" | "env" | "missing";
  };
}

async function fetchUserKeysWithAdmin(admin: any, userId: string): Promise<UserAIKeys> {
  const { data, error } = await admin
    .from("user_settings")
    .select("gemini_api_key, openai_api_key, anthropic_api_key, serper_api_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) console.warn(`[BYOK] user_settings indisponível: ${error.message}`);
  return {
    gemini: String(data?.gemini_api_key || "").trim(),
    openai: String(data?.openai_api_key || "").trim(),
    anthropic: String(data?.anthropic_api_key || "").trim(),
    serper: String(data?.serper_api_key || "").trim(),
  };
}

async function platformProviderSecret(admin: any, provider: "openai" | "anthropic") {
  try {
    const { data, error } = await admin.rpc("get_zica_ai_provider_secret", { p_provider: provider });
    if (error) return "";
    return String(data || "").trim();
  } catch {
    return "";
  }
}

export async function fetchUserKeys(userId: string): Promise<UserAIKeys> {
  const keys = getRuntimeKeys();
  const admin = adminClient(keys);
  return fetchUserKeysWithAdmin(admin, userId);
}

export async function fetchEffectiveAIKeys(userId: string): Promise<EffectiveAIKeys> {
  const runtime = getRuntimeKeys();
  const admin = adminClient(runtime);
  const user = await fetchUserKeysWithAdmin(admin, userId);
  const [vaultOpenAI, vaultAnthropic] = await Promise.all([
    platformProviderSecret(admin, "openai"),
    platformProviderSecret(admin, "anthropic"),
  ]);

  const envOpenAI = String(Deno.env.get("OPENAI_API_KEY") || "").trim();
  const envAnthropic = String(Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  const envGemini = String(Deno.env.get("GEMINI_API_KEY") || "").trim();
  const envSerper = String(Deno.env.get("SERPER_API_KEY") || "").trim();

  const openai = user.openai || vaultOpenAI || envOpenAI;
  const anthropic = user.anthropic || vaultAnthropic || envAnthropic;
  const gemini = user.gemini || envGemini;
  const serper = user.serper || envSerper;

  return {
    openai,
    anthropic,
    gemini,
    serper,
    sources: {
      openai: user.openai ? "user" : vaultOpenAI ? "vault" : envOpenAI ? "env" : "missing",
      anthropic: user.anthropic ? "user" : vaultAnthropic ? "vault" : envAnthropic ? "env" : "missing",
      gemini: user.gemini ? "user" : envGemini ? "env" : "missing",
      serper: user.serper ? "user" : envSerper ? "env" : "missing",
    },
  };
}

export async function getOrchestratorForUser(userId: string): Promise<AIOrchestrator> {
  const orchestrator = new AIOrchestrator();
  const effective = await fetchEffectiveAIKeys(userId);

  orchestrator.setKeys({
    openai: effective.openai || undefined,
    anthropic: effective.anthropic || undefined,
    gemini: effective.gemini || undefined,
  });

  const available = orchestrator.getAvailableProviders();
  if (!available.length) throw new Error("Nenhum provedor de IA disponível. Configure OpenAI ou Claude.");

  console.log(JSON.stringify({
    level: "info",
    message: "ai_keys_resolved",
    user: userId.slice(0, 8),
    providers: available,
    sources: effective.sources,
  }));
  return orchestrator;
}

export async function setEnvKeysForUser(userId: string): Promise<void> {
  const { setRuntimeKey } = await import("./gemini.ts");
  const effective = await fetchEffectiveAIKeys(userId);
  if (effective.gemini) setRuntimeKey("GEMINI_API_KEY", effective.gemini);
  if (effective.openai) setRuntimeKey("OPENAI_API_KEY", effective.openai);
  if (effective.anthropic) setRuntimeKey("ANTHROPIC_API_KEY", effective.anthropic);
}
