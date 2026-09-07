
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { classifyProviderFailure, PROVIDER_CAPABILITIES, ProviderStatus, safeStatusMessage } from "../_shared/provider-health.ts";

const FUNCTION_NAME = "validate-ai-key";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Provider = "openai" | "gemini" | "anthropic" | "serper";

interface Body {
  provider: Provider;
  apiKey: string;
}

type ValidationResult = { valid: boolean; message: string; status: ProviderStatus };

async function validateOpenAI(apiKey: string): Promise<ValidationResult> {
  const resp = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (resp.ok) return { valid: true, message: "Conexão com OpenAI OK", status: "operational" };
  const status = classifyProviderFailure(resp.status, await resp.text().catch(() => ""));
  return { valid: false, message: safeStatusMessage(status), status };
}

async function validateGemini(apiKey: string): Promise<ValidationResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, { method: "GET" });

  if (resp.ok) return { valid: true, message: "Conexão com Gemini OK", status: "operational" };
  const status = classifyProviderFailure(resp.status, await resp.text().catch(() => ""));
  return { valid: false, message: safeStatusMessage(status), status };
}

async function validateAnthropic(apiKey: string): Promise<ValidationResult> {
  const resp = await fetch("https://api.anthropic.com/v1/models", {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (resp.ok) return { valid: true, message: "Conexão com Anthropic (Claude) OK", status: "operational" };
  const status = classifyProviderFailure(resp.status, await resp.text().catch(() => ""));
  return { valid: false, message: safeStatusMessage(status), status };
}

async function validateSerper(apiKey: string): Promise<ValidationResult> {
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: "test", num: 1 }),
  });

  if (resp.ok) return { valid: true, message: "Conexão com Serper OK", status: "operational" };
  const status = classifyProviderFailure(resp.status, await resp.text().catch(() => ""));
  return { valid: false, message: safeStatusMessage(status), status };
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.requestStart(req.method);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.authFailure("missing_or_invalid_header");
      return new Response(JSON.stringify({ valid: false, error: "Autorização necessária", request_id: requestId }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      log.authFailure(authError?.message || "user_not_found");
      return new Response(JSON.stringify({ valid: false, error: "Usuário não autenticado", request_id: requestId }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log.authSuccess(user.id);

    const body = (await req.json()) as Body;
    const provider = body?.provider;
    const apiKey = (body?.apiKey || "").trim();

    if (!provider || !["openai", "gemini", "anthropic", "serper"].includes(provider)) {
      return new Response(JSON.stringify({ valid: false, error: "Provider inválido. Use: openai, gemini, anthropic ou serper", request_id: requestId }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ valid: false, error: "Chave não informada", request_id: requestId }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validators: Record<Provider, (k: string) => Promise<ValidationResult>> = {
      openai: validateOpenAI,
      gemini: validateGemini,
      anthropic: validateAnthropic,
      serper: validateSerper,
    };
    const validationStarted = Date.now();
    const result = await validators[provider](apiKey);
    const latencyMs = Date.now() - validationStarted;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    if (serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await admin.from("ai_provider_health").upsert({
        user_id: user.id, provider, configured: true, status: result.status,
        latency_ms: latencyMs, capabilities: PROVIDER_CAPABILITIES[provider], checked_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });
    }

    log.info("validation_result", { provider, valid: result.valid });
    log.requestEnd(200, Date.now() - startTime);

    return new Response(
      JSON.stringify({ valid: result.valid, provider, status: result.status, latency_ms: latencyMs, message: result.message, request_id: requestId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    log.error("validation_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);

    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ valid: false, error: errorMessage, request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
