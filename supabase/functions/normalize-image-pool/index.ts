import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const env = (name: string) => String(Deno.env.get(name) || "").trim();

async function sha256(value: string | Uint8Array) {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveOpenAIKey(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: settings } = await admin.from("user_settings").select("openai_api_key").eq("user_id", userId).maybeSingle();
  const userKey = String(settings?.openai_api_key || "").trim();
  if (userKey) return userKey;
  const { data: vaultKey, error } = await admin.rpc("get_zica_ai_provider_secret", { p_provider: "openai" });
  if (error) throw error;
  return String(vaultKey || env("OPENAI_API_KEY")).trim();
}

async function downloadSource(admin: ReturnType<typeof createClient>, asset: Record<string, unknown>) {
  if (asset.source_type === "storage") {
    const bucket = String(asset.bucket_name || "");
    const path = String(asset.storage_path || "");
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) throw error || new Error("source_download_failed");
    return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || "image/jpeg" };
  }
  const sourceUrl = String(asset.external_url || "");
  const response = await fetch(sourceUrl, { redirect: "follow", signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  const mime = response.headers.get("content-type") || "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error("source_not_image");
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
}

async function editChroma(openaiKey: string, source: { bytes: Uint8Array; mime: string }, prompt: string) {
  const form = new FormData();
  form.set("model", "gpt-image-2");
  form.set("size", "1536x1024");
  form.set("quality", "high");
  form.set("prompt", `${prompt}\n
Regras obrigatórias:
- remover integralmente todo o chroma verde, inclusive reflexos e contaminação nas bordas;
- preservar exatamente a pessoa real, rosto, cabelo, barba, pele, mãos, corpo, roupa, acessórios e proporções;
- criar fundo editorial jurídico profissional, sóbrio, realista e sem terceiros identificáveis;
- manter área de respiro lateral para recortes 1200x630, 1200x1200 e 1080x1350;
- não inserir texto, símbolo partidário, logotipo ou marca d'água;
- não simular evento, apoio, documento, tribunal ou local factual.`);
  form.append("image[]", new File([source.bytes], "source-image", { type: source.mime }));
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`openai_edit_${response.status}:${String(payload?.error?.message || "unknown").slice(0, 220)}`);
  const encoded = payload?.data?.[0]?.b64_json;
  if (!encoded) throw new Error("openai_edit_missing_output");
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!url || !serviceKey) return json({ success: false, error: "backend_not_configured", request_id: requestId }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const suppliedKey = req.headers.get("x-zica-automation-key") || "";
    const { data: ingress } = await admin.from("automation_ingress_keys").select("secret_hash,enabled").eq("name", "zica-brain").maybeSingle();
    if (!suppliedKey || !ingress?.enabled || !ingress.secret_hash || await sha256(suppliedKey) !== ingress.secret_hash) {
      return json({ success: false, error: "automation_unauthorized", request_id: requestId }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const assetIds = Array.isArray(body?.assetIds) ? body.assetIds.map(String).filter(Boolean).slice(0, 6) : [];
    if (!assetIds.length) return json({ success: false, error: "asset_ids_required", request_id: requestId }, 400);
    const { data: assets, error: assetsError } = await admin.from("module_image_assets").select("*").in("id", assetIds).eq("is_active", true);
    if (assetsError) throw assetsError;

    const results: Array<Record<string, unknown>> = [];
    for (const asset of assets || []) {
      try {
        if (asset.background_mode !== "chroma_replace") {
          results.push({ asset_id: asset.id, status: "skipped", reason: "chroma_not_required" });
          continue;
        }
        const openaiKey = await resolveOpenAIKey(admin, String(asset.user_id));
        if (!openaiKey) throw new Error("openai_not_configured");
        const originalUrl = asset.source_type === "external_url"
          ? String(asset.external_url || "")
          : `${String(asset.bucket_name || "")}/${String(asset.storage_path || "")}`;
        const source = await downloadSource(admin, asset);
        const normalized = await editChroma(openaiKey, source, String(asset.background_prompt || "Remover o fundo verde e criar fundo editorial jurídico profissional."));
        const contentHash = await sha256(normalized);
        const storagePath = `${asset.user_id}/normalized-pool/${asset.id}/${contentHash}.png`;
        const { error: uploadError } = await admin.storage.from("article-images").upload(storagePath, normalized, {
          contentType: "image/png",
          cacheControl: "31536000",
          upsert: true,
        });
        if (uploadError) throw uploadError;
        const { data: publicData } = admin.storage.from("article-images").getPublicUrl(storagePath);
        const publicUrl = publicData.publicUrl;
        const now = new Date().toISOString();
        const metadata = {
          pipeline: "chroma-normalization-v1",
          processed_at: now,
          content_hash: contentHash,
          master_width: 1536,
          master_height: 1024,
          discover_min_width: 1200,
          intended_crops: ["1200x630", "1200x1200", "1080x1350"],
          chroma_removed: true,
          original_preserved: true,
        };
        const { error: updateError } = await admin.from("module_image_assets").update({
          source_type: "storage",
          bucket_name: "article-images",
          storage_path: storagePath,
          external_url: null,
          original_source_url: originalUrl,
          background_mode: "preserve",
          processing_metadata: metadata,
          updated_at: now,
        }).eq("id", asset.id).eq("user_id", asset.user_id);
        if (updateError) throw updateError;

        const { data: linkedArticles, error: linkedError } = await admin.from("articles")
          .select("id,config")
          .eq("user_id", asset.user_id)
          .eq("config->image_geo->>asset_id", asset.id);
        if (linkedError) throw linkedError;
        let updatedArticles = 0;
        for (const article of linkedArticles || []) {
          const config = article.config && typeof article.config === "object" ? article.config : {};
          const imageGeo = config.image_geo && typeof config.image_geo === "object" ? config.image_geo : {};
          const { error } = await admin.from("articles").update({
            featured_image_url: publicUrl,
            image_source: "fixed_pool_normalized",
            config: { ...config, image_geo: { ...imageGeo, ...metadata, source: "fixed_pool_normalized", storage_bucket: "article-images", storage_path: storagePath, background_mode: "chroma_replace", background_edited: true } },
            updated_at: now,
          }).eq("id", article.id).eq("user_id", asset.user_id);
          if (error) throw error;
          updatedArticles += 1;
        }
        results.push({ asset_id: asset.id, status: "processed", url: publicUrl, linked_articles_updated: updatedArticles, content_hash: contentHash });
      } catch (error) {
        results.push({ asset_id: asset.id, status: "failed", error: error instanceof Error ? error.message : "unknown_error" });
      }
    }
    return json({ success: results.every((item) => item.status !== "failed"), results, request_id: requestId });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "normalization_failed", request_id: requestId }, 500);
  }
});
