import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OutputFormat = "square" | "landscape" | "portrait";
type Input = {
  campaignPresetId: string;
  projectId?: string | null;
  referenceAssetIds?: string[];
  prompt?: string;
  primaryOverlay?: string;
  secondaryOverlay?: string;
  politicalParty?: string;
  ballotName?: string;
  ballotNumber?: string;
  outputFormat?: OutputFormat;
  articleId?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function ratioFor(format?: OutputFormat) {
  if (format === "portrait") return "4:5";
  if (format === "square") return "1:1";
  return "16:9";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "unauthorized", request_id: requestId }, 401);

    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "");
    if (!supabaseUrl || !anonKey) return json({ success: false, error: "backend_not_configured", request_id: requestId }, 500);

    const token = authHeader.slice(7);
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, error: "session_invalid", request_id: requestId }, 401);

    const input = await req.json().catch(() => ({})) as Input;
    if (!String(input.campaignPresetId || "").trim()) return json({ success: false, error: "campaign_preset_required", request_id: requestId }, 422);

    const title = `${input.ballotName || "Dr. Madeira"} ${input.ballotNumber || "1470"}`.trim();
    const context = [
      input.prompt,
      input.primaryOverlay ? `Overlay principal: ${input.primaryOverlay}` : "",
      input.secondaryOverlay ? `Overlay secundário: ${input.secondaryOverlay}` : "",
      input.politicalParty ? `Partido: ${input.politicalParty}` : "",
      "Conteúdo eleitoral. Use exclusivamente uma das seis fotos fixas autorizadas. Não gerar rosto, pessoa, cenário ou fotografia sintética.",
    ].filter(Boolean).join("\n");

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        articleId: input.articleId || undefined,
        projectId: input.projectId || null,
        moduleKey: "electoral",
        allowAiGeneration: false,
        title,
        context,
        segment: "electoral",
        aspectRatio: ratioFor(input.outputFormat),
        quality: "high",
      }),
      signal: AbortSignal.timeout(120000),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true) {
      return json({
        success: false,
        error: payload?.error || `Falha no pool eleitoral: HTTP ${response.status}`,
        code: payload?.code || "electoral_fixed_pool_failed",
        retryable: payload?.retryable ?? false,
        request_id: requestId,
      }, response.status || 500);
    }

    return json({
      success: true,
      request_id: requestId,
      source: "fixed_pool",
      generated: false,
      syntheticMediaDisclosureRequired: false,
      asset: {
        id: payload.selectedAssetId || null,
        slot: payload.selectedSlot || null,
        signedUrl: payload.image || null,
        alt_text: payload.alt || null,
        filename: payload.filename || null,
        caption: payload.caption || null,
      },
      selectedAssetId: payload.selectedAssetId || null,
      selectedSlot: payload.selectedSlot || null,
      selectionReason: payload.selectionReason || "Foto autorizada selecionada automaticamente.",
      selectorProvider: payload.selectorProvider || "deterministic",
      selectorModel: payload.selectorModel || "least-used-v1",
      geo: payload.geo || null,
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "electoral_fixed_pool_failed",
      code: "electoral_fixed_pool_failed",
      request_id: requestId,
    }, 500);
  }
});
