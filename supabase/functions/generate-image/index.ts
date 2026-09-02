import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchUserKeys, getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

const OPENAI_IMAGE_MODEL = "gpt-image-2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Segment = "legal" | "criminal" | "consumer" | "health" | "business" | "labor" | "electoral" | "news" | "fintech" | "education" | "general";
type ImageRequest = {
  title: string;
  keywords?: string;
  context?: string;
  content?: string;
  segment?: Segment;
  style?: "photorealistic" | "illustration" | "abstract";
  aspectRatio?: "16:9" | "1:1" | "4:3" | "9:16" | "4:5";
  quality?: "low" | "medium" | "high" | "standard";
  articleId?: string;
  projectId?: string | null;
  moduleKey?: string;
  allowAiGeneration?: boolean;
  userId?: string;
};

type PoolAsset = {
  id: string;
  slot: number;
  label: string;
  source_type: "storage" | "external_url";
  bucket_name: string | null;
  storage_path: string | null;
  external_url: string | null;
  alt_text: string;
  semantic_filename: string;
  caption: string;
  semantic_tags: string[];
  usage_count: number;
  last_used_at: string | null;
};

const SEGMENT_RULES: Record<Segment, string> = {
  legal: "Ambiente jurídico genérico. Não falsificar processo, sentença, prova, selo, brasão ou documento oficial.",
  criminal: "Atmosfera séria e informativa. Não glamourizar violência nem simular cena criminal real específica.",
  consumer: "Situação cotidiana de consumo, fraude, crédito, contrato ou atendimento, sem dados pessoais reais.",
  health: "Ambiente clínico genérico. Não simular prontuário, diagnóstico ou resultado atribuído a pessoa real.",
  business: "Ambiente empresarial, contratos, operação e tecnologia com aparência editorial profissional.",
  labor: "Ambiente de trabalho coerente com o tema, sem documento trabalhista falsificado.",
  electoral: "Usar somente identidade autorizada. Não inventar apoio, multidões, eventos ou endossos.",
  news: "Imagem editorial conceitual. Não se passar por fotografia documental de fato que não ocorreu.",
  fintech: "Ambiente financeiro/tecnológico sem contas, cartões ou extratos reais.",
  education: "Ambiente educacional genérico, sem identificar menores reais sem autorização.",
  general: "Imagem editorial coerente com o assunto, sem simular fatos não documentados.",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function outputSize(ratio?: ImageRequest["aspectRatio"]) {
  if (ratio === "1:1") return "1024x1024";
  if (ratio === "9:16" || ratio === "4:5") return "1024x1536";
  return "1536x1024";
}

function defaultModule(body: ImageRequest) {
  if (body.moduleKey?.trim()) return body.moduleKey.trim();
  if (body.segment === "electoral") return "electoral";
  if (body.segment === "news") return "news";
  return "article";
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function sourceAsDataUrl(admin: any, asset: PoolAsset) {
  if (asset.source_type === "storage") {
    if (!asset.bucket_name || !asset.storage_path) throw new Error("fixed_asset_storage_invalid");
    const { data, error } = await admin.storage.from(asset.bucket_name).download(asset.storage_path);
    if (error || !data) throw error || new Error("fixed_asset_download_failed");
    const mime = data.type || "image/jpeg";
    const bytes = new Uint8Array(await data.arrayBuffer());
    return { dataUrl: `data:${mime};base64,${toBase64(bytes)}`, mime, bytes: bytes.byteLength };
  }

  if (!asset.external_url) throw new Error("fixed_asset_url_invalid");
  const response = await fetch(asset.external_url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`fixed_asset_http_${response.status}`);
  const mime = response.headers.get("content-type") || "image/jpeg";
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { dataUrl: `data:${mime};base64,${toBase64(bytes)}`, mime, bytes: bytes.byteLength };
}

function parseSelection(text: string) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(cleaned.slice(first, last + 1)) as { asset_id?: string; reason?: string }; } catch { return null; }
}

async function chooseAsset(userId: string, body: ImageRequest, assets: PoolAsset[]) {
  const context = [body.title, body.keywords, body.context, body.content?.replace(/<[^>]+>/g, " ").slice(0, 2500)].filter(Boolean).join("\n");
  try {
    const orchestrator = await getOrchestratorForUser(userId);
    const options = assets.map((asset) => ({
      asset_id: asset.id,
      slot: asset.slot,
      label: asset.label,
      alt_text: asset.alt_text,
      semantic_tags: asset.semantic_tags,
      usage_count: asset.usage_count,
      last_used_at: asset.last_used_at,
    }));
    const result = await orchestrator.callWithMeta("strategy_planning", [
      { role: "system", content: "Escolha exatamente uma foto autorizada do pool. Não gere imagem. Prefira adequação semântica e diversidade de uso. Retorne somente JSON." },
      { role: "user", content: `CONTEÚDO:\n${context}\n\nFOTOS AUTORIZADAS:\n${JSON.stringify(options)}\n\nRetorne {\"asset_id\":\"uuid\",\"reason\":\"motivo objetivo em uma frase\"}.` },
    ], { preferredProvider: "openai", maxTokens: 700, temperature: 0.05 });
    const parsed = parseSelection(result.content);
    const selected = assets.find((asset) => asset.id === parsed?.asset_id);
    if (selected) return { asset: selected, reason: String(parsed?.reason || "Maior aderência semântica ao conteúdo."), provider: result.provider, model: result.model };
  } catch (error) {
    console.warn(`[generate-image] seletor IA indisponível: ${error instanceof Error ? error.message : "unknown"}`);
  }

  const ordered = [...assets].sort((a, b) => {
    if (a.usage_count !== b.usage_count) return a.usage_count - b.usage_count;
    const aTime = a.last_used_at ? Date.parse(a.last_used_at) : 0;
    const bTime = b.last_used_at ? Date.parse(b.last_used_at) : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.slot - b.slot;
  });
  return { asset: ordered[0], reason: "Fallback determinístico: foto autorizada menos utilizada recentemente.", provider: "deterministic", model: "least-used-v1" };
}

async function loadPool(admin: any, userId: string, moduleKey: string, projectId?: string | null) {
  let scopedPolicy: any = null;
  if (projectId) {
    const { data } = await admin.from("module_image_policies").select("*").eq("user_id", userId).eq("module_key", moduleKey).eq("project_id", projectId).maybeSingle();
    scopedPolicy = data;
  }
  const { data: globalPolicy } = await admin.from("module_image_policies").select("*").eq("user_id", userId).eq("module_key", moduleKey).is("project_id", null).maybeSingle();
  const policy = scopedPolicy || globalPolicy || { required_asset_count: 6, allow_ai_generation: false, auto_select: true, hero_width: 1200, hero_height: 630, body_width: 800, preferred_format: "webp", max_hero_kb: 200, max_body_kb: 100 };

  let query = admin.from("module_image_assets").select("id,slot,label,source_type,bucket_name,storage_path,external_url,alt_text,semantic_filename,caption,semantic_tags,usage_count,last_used_at").eq("user_id", userId).eq("module_key", moduleKey).eq("is_active", true).order("slot", { ascending: true }).limit(6);
  query = scopedPolicy && projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
  const { data: assets, error } = await query;
  if (error) throw error;
  return { policy, assets: (assets || []) as PoolAsset[] };
}

async function updateArticleImage(admin: any, userId: string, body: ImageRequest, image: string, source: string, meta: Record<string, unknown>) {
  if (!body.articleId) return;
  const { data: article } = await admin.from("articles").select("config").eq("id", body.articleId).eq("user_id", userId).maybeSingle();
  const config = article?.config && typeof article.config === "object" ? article.config as Record<string, unknown> : {};
  await admin.from("articles").update({
    featured_image_url: image,
    image_source: source,
    config: { ...config, image_geo: meta },
    updated_at: new Date().toISOString(),
  }).eq("id", body.articleId).eq("user_id", userId);
}

async function generateSynthetic(openaiKey: string, body: ImageRequest) {
  const segment = body.segment || "general";
  const prompt = `Crie uma única imagem editorial. Título: ${body.title}. Contexto: ${[body.context, body.keywords, body.content?.slice(0, 2500)].filter(Boolean).join("\n")}. Regra: ${SEGMENT_RULES[segment]}. Sem texto, sem marca d'água e sem pessoa pública identificável não fornecida como referência.`;
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, n: 1, size: outputSize(body.aspectRatio), quality: body.quality === "low" ? "low" : body.quality === "medium" || body.quality === "standard" ? "medium" : "high" }),
    signal: AbortSignal.timeout(150000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `OpenAI image HTTP ${response.status}`)) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = String(payload?.error?.code || "openai_image_error");
    throw error;
  }
  const item = payload?.data?.[0] || {};
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item.url) {
    const imageResponse = await fetch(String(item.url), { signal: AbortSignal.timeout(60000) });
    if (!imageResponse.ok) throw new Error(`generated_image_download_http_${imageResponse.status}`);
    const mime = imageResponse.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    return `data:${mime};base64,${toBase64(bytes)}`;
  }
  throw new Error("gpt_image_missing_output");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({})) as ImageRequest;
    if (!body.title?.trim()) return json({ success: false, error: "Título é obrigatório", request_id: requestId }, 400);
    const actor = await resolveRequestActor(req, body.userId);
    const userId = actor.userId;
    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const moduleKey = defaultModule(body);
    const { policy, assets } = await loadPool(admin, userId, moduleKey, body.projectId);
    const required = Number(policy.required_asset_count || 6);

    if (assets.length >= required && policy.auto_select !== false) {
      const selected = await chooseAsset(userId, body, assets.slice(0, 6));
      if (!selected.asset) throw new Error("fixed_image_selection_failed");
      const resolved = await sourceAsDataUrl(admin, selected.asset);
      const now = new Date().toISOString();
      await Promise.all([
        admin.from("module_image_assets").update({ usage_count: Number(selected.asset.usage_count || 0) + 1, last_used_at: now, updated_at: now }).eq("id", selected.asset.id).eq("user_id", userId),
        admin.from("module_image_selection_logs").insert({
          user_id: userId,
          module_key: moduleKey,
          project_id: body.projectId || null,
          article_id: body.articleId || null,
          asset_id: selected.asset.id,
          selector_provider: selected.provider,
          selector_model: selected.model,
          selection_reason: selected.reason.slice(0, 1000),
        }),
      ]);
      const imageMeta = {
        source: "fixed_pool",
        module_key: moduleKey,
        asset_id: selected.asset.id,
        slot: selected.asset.slot,
        alt_text: selected.asset.alt_text,
        semantic_filename: selected.asset.semantic_filename,
        caption: selected.asset.caption,
        preferred_format: policy.preferred_format || "webp",
        target_hero: `${policy.hero_width || 1200}x${policy.hero_height || 630}`,
        target_body_width: policy.body_width || 800,
        max_hero_kb: policy.max_hero_kb || 200,
        max_body_kb: policy.max_body_kb || 100,
        selector_provider: selected.provider,
        selector_model: selected.model,
        selection_reason: selected.reason,
      };
      await updateArticleImage(admin, userId, body, resolved.dataUrl, "fixed_pool", imageMeta);
      return json({
        success: true,
        image: resolved.dataUrl,
        source: "fixed_pool",
        generated: false,
        moduleKey,
        poolCount: assets.length,
        selectedAssetId: selected.asset.id,
        selectedSlot: selected.asset.slot,
        alt: selected.asset.alt_text,
        filename: selected.asset.semantic_filename,
        caption: selected.asset.caption,
        selectionReason: selected.reason,
        selectorProvider: selected.provider,
        selectorModel: selected.model,
        geo: imageMeta,
        request_id: requestId,
      });
    }

    const aiExplicitlyAllowed = body.allowAiGeneration === true && policy.allow_ai_generation === true;
    if (!aiExplicitlyAllowed) {
      return json({
        success: false,
        error: `O módulo ${moduleKey} exige ${required} fotos fixas ativas e possui ${assets.length}. Geração sintética não foi autorizada.`,
        code: "image_pool_incomplete",
        moduleKey,
        poolCount: assets.length,
        requiredPoolCount: required,
        image_pending: true,
        retryable: false,
        request_id: requestId,
      }, 409);
    }

    const keys = await fetchUserKeys(userId);
    if (!keys.openai) return json({ success: false, error: "OpenAI não configurada", code: "openai_missing", request_id: requestId }, 503);
    const image = await generateSynthetic(keys.openai, body);
    const imageMeta = { source: "openai", synthetic: true, model: OPENAI_IMAGE_MODEL, module_key: moduleKey, target_hero: "1200x630", preferred_format: policy.preferred_format || "webp" };
    await updateArticleImage(admin, userId, body, image, "openai", imageMeta);
    return json({ success: true, image, source: "openai", generated: true, provider: "openai", model: OPENAI_IMAGE_MODEL, geo: imageMeta, request_id: requestId });
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    const e = error as Error & { status?: number; code?: string };
    const credit = e.code === "credit_balance_exhausted" || e.code === "insufficient_quota" || /credit balance|quota|no credits/i.test(e.message);
    return json({ success: false, error: credit ? "OpenAI sem saldo disponível para geração de imagem." : e.message, code: credit ? "openai_credit_balance_exhausted" : (e.code || "image_processing_failed"), image_pending: true, retryable: !credit, request_id: requestId }, credit ? 402 : (e.status || 500));
  }
});
