import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_IMAGE_MODEL = "gpt-image-2";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const VISUAL_TEMPLATE = "visual_content_master_v1";

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
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function b64(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length))));
  }
  return btoa(parts.join(""));
}

function unb64(value: string) {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function extension(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function sizeFor(format: OutputFormat) {
  if (format === "portrait") return "1024x1536";
  if (format === "landscape") return "1536x1024";
  return "1024x1024";
}

async function reviewPromptWithClaude(apiKey: string, prompt: string) {
  if (!apiKey) return { prompt, reviewed: false };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1800,
        messages: [{
          role: "user",
          content: `Você é diretor de arte e revisor de segurança factual. Revise o prompt eleitoral abaixo sem mudar a identidade visual solicitada. Preserve a pessoa das fotos de referência, não invente terceiro, evento, documento, uniforme, apoio ou endosso. Evite anatomia artificial. Mantenha o texto de branding exatamente como solicitado quando houver. Retorne somente o prompt final, sem comentários.\n\n${prompt}`,
        }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return { prompt, reviewed: false };
    const data = await res.json();
    const reviewed = Array.isArray(data?.content)
      ? data.content.map((part: { text?: string }) => part.text || "").join("\n").trim()
      : "";
    return { prompt: reviewed || prompt, reviewed: Boolean(reviewed) };
  } catch {
    return { prompt, reviewed: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  const requestId = crypto.randomUUID();
  let jobId = "";

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "unauthorized", request_id: requestId }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "backend_not_configured", request_id: requestId }, 500);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.slice(7);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, error: "session_invalid", request_id: requestId }, 401);
    const userId = authData.user.id;

    const input = await req.json() as Input;
    const presetId = String(input.campaignPresetId || "").trim();
    if (!presetId) return json({ success: false, error: "campaign_preset_required", request_id: requestId }, 422);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const [{ data: settings }, { data: template }] = await Promise.all([
      admin.from("user_settings")
        .select("openai_api_key,anthropic_api_key")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("prompt_templates")
        .select("prompt,agent_name")
        .eq("user_id", userId)
        .eq("name", VISUAL_TEMPLATE)
        .maybeSingle(),
    ]);

    const openaiKey = String(settings?.openai_api_key || "").trim();
    const anthropicKey = String(settings?.anthropic_api_key || "").trim();
    if (!openaiKey) return json({ success: false, error: "OpenAI não configurada para este usuário.", code: "openai_missing", request_id: requestId }, 503);

    let assetQuery = admin.from("electoral_visual_assets")
      .select("id,storage_path,mime_type,status,is_default,alt_text")
      .eq("user_id", userId)
      .eq("campaign_preset_id", presetId)
      .eq("asset_kind", "reference")
      .in("status", ["ready", "approved"])
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(4);

    if (Array.isArray(input.referenceAssetIds) && input.referenceAssetIds.length) {
      assetQuery = assetQuery.in("id", input.referenceAssetIds.slice(0, 4));
    }

    const { data: references, error: referenceError } = await assetQuery;
    if (referenceError) throw referenceError;
    if (!references?.length) return json({ success: false, error: "Cadastre ao menos uma foto de referência antes de gerar.", code: "reference_required", request_id: requestId }, 422);

    const format: OutputFormat = input.outputFormat === "portrait" || input.outputFormat === "landscape" ? input.outputFormat : "square";
    const primary = String(input.primaryOverlay || `DR. MADEIRA ${input.ballotNumber || "1470"}`).trim();
    const secondary = String(input.secondaryOverlay || `FEDERAL ${input.ballotNumber || "1470"}`).trim();
    const operatorPrompt = String(input.prompt || "Retrato editorial de campanha, natural, humano, contemporâneo e visualmente forte.").trim().slice(0, 5000);
    const master = String(template?.prompt || "").trim();

    const basePrompt = `${master}\n\nMODO: ELEITORAL / IDENTIDADE VISUAL COM FOTOS DE REFERÊNCIA.\nCandidato: ${input.ballotName || "Dr. Madeira"}. Número: ${input.ballotNumber || "1470"}. Partido: ${input.politicalParty || "Partido MISSÃO"}.\nPedido do operador: ${operatorPrompt}\nBranding solicitado: \"${primary}\" e \"${secondary}\".\n\nREGRAS ESPECÍFICAS:\n- Use as imagens anexadas somente como referências visuais da mesma pessoa; preserve rosto, cabelo, barba, idade aparente, proporções e aparência natural.\n- Não criar outra identidade, não fazer face-swap com terceiro e não inventar apoio de outra pessoa pública.\n- Não representar fato jornalístico, comício, reunião, autoridade, uniforme ou documento como se tivesse ocorrido, salvo se explicitamente fornecido como referência factual.\n- Evitar pele plástica, membros extras, mãos deformadas, olhos artificiais e estética genérica de banco de imagens.\n- A peça é mídia sintética de campanha e deve permanecer marcada no sistema como tal.\n- Composição ${format}; safe-zone central; contraste alto e leitura mobile.\n- Quando o modelo renderizar texto, tentar manter exatamente: ${primary} / ${secondary}.\n- Sem marca d'água de IA.`.trim();

    const reviewed = await reviewPromptWithClaude(anthropicKey, basePrompt);

    const { data: job, error: jobError } = await admin.from("electoral_image_jobs").insert({
      user_id: userId,
      project_id: input.projectId || null,
      campaign_preset_id: presetId,
      status: "running",
      provider: "openai",
      generation_mode: "reference-edit-gpt-image-2",
      fidelity_preference: 0.96,
      reference_asset_ids: references.map((item: { id: string }) => item.id),
      requested_formats: { selected: format, model_size: sizeFor(format) },
      overlay_config: { primary, secondary, safeZone: true, party: input.politicalParty || null },
      prompt_context: reviewed.prompt,
    }).select("id").single();
    if (jobError || !job) throw jobError || new Error("job_create_failed");
    jobId = job.id;

    const form = new FormData();
    form.set("model", OPENAI_IMAGE_MODEL);
    form.set("prompt", reviewed.prompt);
    form.set("size", sizeFor(format));
    form.set("quality", "high");

    for (let index = 0; index < references.length; index++) {
      const ref = references[index] as { storage_path: string; mime_type: string | null };
      const { data: blob, error: downloadError } = await admin.storage.from("electoral-assets").download(ref.storage_path);
      if (downloadError || !blob) throw downloadError || new Error("reference_download_failed");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = ref.mime_type || blob.type || "image/jpeg";
      form.append("image[]", new File([bytes], `reference-${index + 1}.${extension(mime)}`, { type: mime }));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 150000);
    let openaiResponse: Response;
    try {
      openaiResponse = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const providerPayload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      const code = String(providerPayload?.error?.code || "openai_image_error");
      const message = String(providerPayload?.error?.message || `OpenAI HTTP ${openaiResponse.status}`);
      const credit = code === "credit_balance_exhausted" || code === "insufficient_quota" || /no credits|credit balance|quota/i.test(message);
      await admin.from("electoral_image_jobs").update({
        status: credit ? "provider_unavailable" : "failed",
        error_message: `${code}: ${message}`.slice(0, 1000),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId).eq("user_id", userId);
      return json({
        success: false,
        error: credit ? "A OpenAI está conectada, mas a conta está sem créditos para gerar a imagem." : message,
        code: credit ? "openai_credit_balance_exhausted" : code,
        retryable: !credit,
        request_id: requestId,
      }, credit ? 402 : openaiResponse.status);
    }

    const first = providerPayload?.data?.[0];
    let outputBytes: Uint8Array;
    let outputMime = "image/png";
    if (first?.b64_json) {
      outputBytes = unb64(String(first.b64_json));
    } else if (first?.url) {
      const imageResponse = await fetch(String(first.url), { signal: AbortSignal.timeout(60000) });
      if (!imageResponse.ok) throw new Error(`generated_image_download_http_${imageResponse.status}`);
      outputMime = imageResponse.headers.get("content-type") || "image/png";
      outputBytes = new Uint8Array(await imageResponse.arrayBuffer());
    } else {
      throw new Error("gpt_image_2_missing_output");
    }

    const path = `${userId}/${presetId}/generated/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await admin.storage.from("electoral-assets").upload(path, outputBytes, {
      contentType: outputMime,
      upsert: false,
      cacheControl: "31536000",
    });
    if (uploadError) throw uploadError;

    const [width, height] = sizeFor(format).split("x").map(Number);
    const { data: asset, error: assetError } = await admin.from("electoral_visual_assets").insert({
      user_id: userId,
      project_id: input.projectId || null,
      campaign_preset_id: presetId,
      asset_kind: "generated",
      status: "ready",
      storage_path: path,
      source_asset_id: references[0]?.id || null,
      width,
      height,
      mime_type: outputMime,
      file_size_bytes: outputBytes.byteLength,
      alt_text: `Imagem sintética eleitoral de ${input.ballotName || "Dr. Madeira"} ${input.ballotNumber || "1470"}`,
      overlay_config: { primary, secondary, safeZone: true },
      metadata: {
        source: "nexus-visual-studio",
        prompt_template: VISUAL_TEMPLATE,
        prompt_reviewed_by_claude: reviewed.reviewed,
        reviewer_model: reviewed.reviewed ? CLAUDE_MODEL : null,
        provider: "openai",
        model: OPENAI_IMAGE_MODEL,
        synthetic_media: true,
        synthetic_media_disclosure_required: true,
        reference_asset_ids: references.map((item: { id: string }) => item.id),
        output_format: format,
      },
    }).select("id,storage_path,status,width,height,alt_text,created_at").single();
    if (assetError || !asset) throw assetError || new Error("asset_insert_failed");

    await admin.from("electoral_image_jobs").update({
      status: "completed",
      output_asset_ids: [asset.id],
      provider_job_id: String(providerPayload?.id || ""),
      error_message: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId).eq("user_id", userId);

    const { data: signed } = await admin.storage.from("electoral-assets").createSignedUrl(path, 3600);
    return json({
      success: true,
      request_id: requestId,
      job_id: jobId,
      asset: { ...asset, signedUrl: signed?.signedUrl || null },
      provider: "openai",
      model: OPENAI_IMAGE_MODEL,
      promptReviewedByClaude: reviewed.reviewed,
      reviewerModel: reviewed.reviewed ? CLAUDE_MODEL : null,
      syntheticMediaDisclosureRequired: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    if (jobId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (supabaseUrl && serviceKey) {
          const admin = createClient(supabaseUrl, serviceKey);
          await admin.from("electoral_image_jobs").update({
            status: "failed",
            error_message: message.slice(0, 1000),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);
        }
      } catch { /* preserve original error */ }
    }
    return json({ success: false, error: message, code: "generation_failed", request_id: requestId }, 500);
  }
});
