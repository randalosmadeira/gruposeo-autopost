import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { classifyProviderFailure, PROVIDER_CAPABILITIES, ProviderName, ProviderStatus, safeStatusMessage } from "../_shared/provider-health.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Probe = { configured: boolean; status: ProviderStatus; latency_ms: number | null };

async function fetchKeys(admin: any, userId: string): Promise<Record<ProviderName, string>> {
  const { data } = await admin.from("user_settings")
    .select("gemini_api_key,openai_api_key,anthropic_api_key,serper_api_key")
    .eq("user_id", userId).maybeSingle();
  const vaultKey = async (provider: "openai" | "anthropic") => {
    const { data: secret } = await admin.rpc("get_zica_ai_provider_secret", { p_provider: provider });
    return String(secret || "").trim();
  };
  return {
    gemini: String(data?.gemini_api_key || Deno.env.get("GEMINI_API_KEY") || "").trim(),
    openai: String(data?.openai_api_key || await vaultKey("openai") || Deno.env.get("OPENAI_API_KEY") || "").trim(),
    anthropic: String(data?.anthropic_api_key || await vaultKey("anthropic") || Deno.env.get("ANTHROPIC_API_KEY") || "").trim(),
    serper: String(data?.serper_api_key || Deno.env.get("SERPER_API_KEY") || "").trim(),
  };
}

async function probe(provider: ProviderName, key: string): Promise<Probe> {
  if (!key) return { configured: false, status: "not_configured", latency_ms: null };
  if (provider === "serper") return { configured: true, status: "unverified", latency_ms: null };

  const targets: Record<Exclude<ProviderName, "serper">, { url: string; headers?: Record<string, string> }> = {
    openai: { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${key}` } },
    gemini: { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}` },
    anthropic: { url: "https://api.anthropic.com/v1/models", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } },
  };
  const target = targets[provider];
  const started = Date.now();
  try {
    const response = await fetch(target.url, { headers: target.headers, signal: AbortSignal.timeout(8000) });
    const latency_ms = Date.now() - started;
    if (response.ok) return { configured: true, status: "operational", latency_ms };
    const body = await response.text().catch(() => "");
    return { configured: true, status: classifyProviderFailure(response.status, body), latency_ms };
  } catch (error) {
    return { configured: true, status: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "unavailable", latency_ms: Date.now() - started };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user } } = await authClient.auth.getUser(token);
  if (!user) return Response.json({ error: "Usuário não autenticado" }, { status: 401, headers: corsHeaders });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const keys = await fetchKeys(admin, user.id);
  const providers: ProviderName[] = ["gemini", "openai", "anthropic", "serper"];
  const results = await Promise.all(providers.map(async (provider) => ({ provider, ...(await probe(provider, keys[provider])) })));
  const checkedAt = new Date().toISOString();
  const rows = results.map((result) => ({
    user_id: user.id,
    provider: result.provider,
    configured: result.configured,
    status: result.status,
    latency_ms: result.latency_ms,
    capabilities: PROVIDER_CAPABILITIES[result.provider],
    checked_at: checkedAt,
  }));
  const { error } = await admin.from("ai_provider_health").upsert(rows, { onConflict: "user_id,provider" });
  if (error) return Response.json({ error: "Não foi possível atualizar a telemetria" }, { status: 500, headers: corsHeaders });
  return Response.json({ providers: rows.map((row) => ({ ...row, message: safeStatusMessage(row.status) })) }, { headers: corsHeaders });
});
