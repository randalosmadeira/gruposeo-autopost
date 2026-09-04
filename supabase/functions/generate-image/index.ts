import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchUserKeys } from "../_shared/byok-resolver.ts";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

const OPENAI_IMAGE_MODEL = "gpt-image-2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ImageRequest = {
  title: string; keywords?: string; context?: string; content?: string;
  segment?: string; aspectRatio?: "16:9" | "1:1" | "4:3" | "9:16" | "4:5";
  quality?: "low" | "medium" | "high" | "standard"; articleId?: string;
  projectId?: string | null; moduleKey?: string; allowAiGeneration?: boolean; userId?: string;
  watermark?: string;
};
type PoolAsset = {
  id: string; slot: number; label: string; source_type: "storage" | "external_url";
  bucket_name: string | null; storage_path: string | null; external_url: string | null;
  alt_text: string; semantic_filename: string; caption: string; semantic_tags: string[];
  usage_count: number; last_used_at: string | null; background_mode: "preserve" | "chroma_replace";
  background_prompt: string | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => String(Deno.env.get(name) || "").trim();
function size(ratio?: ImageRequest["aspectRatio"]) { if (ratio === "1:1") return "1024x1024"; if (ratio === "9:16" || ratio === "4:5") return "1024x1536"; return "1536x1024"; }
function moduleFor(body: ImageRequest) { if (body.moduleKey?.trim()) return body.moduleKey.trim(); if (body.segment === "electoral") return "electoral"; if (body.segment === "news") return "news"; return "article"; }
function toBase64(bytes: Uint8Array) { const chunks: string[] = []; for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)))); return btoa(chunks.join("")); }
function fromBase64(value: string) { const raw = atob(value); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
function extension(mime: string) { if (mime.includes("png")) return "png"; if (mime.includes("webp")) return "webp"; return "jpg"; }

async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function persistImage(admin: any, userId: string, image: { bytes: Uint8Array; mime: string }) {
  const hash = await sha256Bytes(image.bytes);
  const path = `${userId}/${hash}.${extension(image.mime)}`;
  const { error } = await admin.storage.from("article-images").upload(path, image.bytes, {
    contentType: image.mime,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`article_image_upload_failed:${error.message}`);
  const { data } = admin.storage.from("article-images").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("article_image_public_url_missing");
  return { url: data.publicUrl, path, hash };
}

async function sourceAsset(admin: any, asset: PoolAsset) {
  if (asset.source_type === "storage") {
    if (!asset.bucket_name || !asset.storage_path) throw new Error("fixed_asset_storage_invalid");
    const { data, error } = await admin.storage.from(asset.bucket_name).download(asset.storage_path);
    if (error || !data) throw error || new Error("fixed_asset_download_failed");
    const mime = data.type || "image/jpeg"; const bytes = new Uint8Array(await data.arrayBuffer());
    return { bytes, mime, dataUrl: `data:${mime};base64,${toBase64(bytes)}` };
  }
  if (!asset.external_url) throw new Error("fixed_asset_url_invalid");
  const response = await fetch(asset.external_url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`fixed_asset_http_${response.status}`);
  const mime = response.headers.get("content-type") || "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error("fixed_asset_not_image");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, mime, dataUrl: `data:${mime};base64,${toBase64(bytes)}` };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/g, " ");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function choose(body: ImageRequest, assets: PoolAsset[]) {
  const context = normalize([body.title, body.keywords, body.context, body.content?.slice(0, 2200)].filter(Boolean).join(" "));
  const ranked = assets.map((asset) => {
    const terms = [asset.label, asset.alt_text, ...(asset.semantic_tags || [])]
      .flatMap((value) => normalize(value).split(" "))
      .filter((value) => value.length >= 4);
    const semanticScore = new Set(terms.filter((term) => context.includes(term))).size;
    return { asset, semanticScore };
  });
  const bestScore = Math.max(...ranked.map((item) => item.semanticScore));
  const candidates = ranked.filter((item) => item.semanticScore === bestScore).sort((a, b) => a.asset.slot - b.asset.slot);
  const selected = candidates[stableHash(body.articleId || body.title) % candidates.length];
  return {
    asset: selected?.asset,
    reason: selected?.semanticScore ? `Seleção semântica local: ${selected.semanticScore} termo(s) compatível(is).` : "Seleção local distribuída entre as fotos autorizadas.",
    provider: "deterministic",
    model: "semantic-stable-v3",
  };
}

async function chooseUsableAsset(admin: any, body: ImageRequest, assets: PoolAsset[]) {
  let remaining = [...assets];
  const failures: Array<{ assetId: string; reason: string }> = [];
  while (remaining.length) {
    const selected = choose(body, remaining);
    if (!selected.asset) break;
    try {
      const original = await sourceAsset(admin, selected.asset);
      return { selected, original, failures };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "fixed_asset_unavailable";
      failures.push({ assetId: selected.asset.id, reason });
      console.warn(`[generate-image] fixed asset unavailable: ${selected.asset.id} ${reason}`);
      remaining = remaining.filter((asset) => asset.id !== selected.asset?.id);
    }
  }
  return null;
}

async function pool(admin: any, userId: string, moduleKey: string, projectId?: string | null) {
  let scoped: any = null;
  if (projectId) { const { data } = await admin.from("module_image_policies").select("*").eq("user_id", userId).eq("module_key", moduleKey).eq("project_id", projectId).maybeSingle(); scoped = data; }
  const { data: globalPolicy } = await admin.from("module_image_policies").select("*").eq("user_id", userId).eq("module_key", moduleKey).is("project_id", null).maybeSingle();
  let policy = scoped || globalPolicy || { required_asset_count: 6, allow_ai_generation: false, allow_background_editing: false, auto_select: true, hero_width: 1200, hero_height: 630, body_width: 800, preferred_format: "webp", max_hero_kb: 200, max_body_kb: 100 };
  const select = "id,slot,label,source_type,bucket_name,storage_path,external_url,alt_text,semantic_filename,caption,semantic_tags,usage_count,last_used_at,background_mode,background_prompt";
  let assetScope: "project" | "global" = scoped && projectId ? "project" : "global";
  let q = admin.from("module_image_assets").select(select).eq("user_id", userId).eq("module_key", moduleKey).eq("is_active", true).order("slot", { ascending: true }).limit(6);
  q = assetScope === "project" ? q.eq("project_id", projectId) : q.is("project_id", null);
  let { data, error } = await q;
  if (error) throw error;
  if (!data?.length && assetScope === "project") {
    const fallback = await admin.from("module_image_assets").select(select).eq("user_id", userId).eq("module_key", moduleKey).is("project_id", null).eq("is_active", true).order("slot", { ascending: true }).limit(6);
    if (fallback.error) throw fallback.error;
    data = fallback.data;
    assetScope = "global";
    // A project policy can point to an empty project pool. When assets fall
    // back to the global pool, their global chroma/editing policy must follow
    // them. Otherwise raw green-screen sources are published unchanged.
    if (globalPolicy) policy = globalPolicy;
  }
  const assets = (data || []) as PoolAsset[];
  return { policy, assets, assetScope };
}

async function backgroundEdit(openaiKey: string, source: { bytes: Uint8Array; mime: string }, asset: PoolAsset, body: ImageRequest) {
  const form = new FormData();
  const context = [body.title, body.keywords, body.context].filter(Boolean).join(". ").slice(0, 1500);
  const prompt = `${asset.background_prompt || "Remover integralmente o chroma key verde e reconstruir somente o fundo."}\n
REGRAS OBRIGATÓRIAS:\n- Esta é uma EDIÇÃO DE FUNDO de uma fotografia real autorizada, não geração de uma nova pessoa.\n- Preserve exatamente a mesma pessoa real, rosto, cabelo, barba, pele, anatomia, mãos, roupa, acessórios, taco e proporções.\n- Não alterar expressão, identidade visual, idade aparente, corpo ou vestimenta.\n- Remover todo o verde do chroma, inclusive vazamento verde nas bordas, cabelo, roupa e objeto.\n- Criar fundo editorial compatível com o contexto: ${context || "conteúdo institucional"}.\n- O fundo não pode inventar multidão, evento, apoio, documento, cenário factual ou terceiro identificável.\n- Sem texto, logotipo ou marca d'água.\n- Recorte natural de cabelo, roupa e taco, com iluminação coerente.`;
  form.set("model", OPENAI_IMAGE_MODEL); form.set("prompt", prompt); form.set("size", size(body.aspectRatio)); form.set("quality", "high");
  form.append("image[]", new File([source.bytes], `fixed-reference.${extension(source.mime)}`, { type: source.mime }));
  const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: form, signal: AbortSignal.timeout(150000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`background_edit_http_${response.status}:${String(payload?.error?.message || "unknown").slice(0, 240)}`);
  const item = payload?.data?.[0];
  if (item?.b64_json) { const bytes = fromBase64(item.b64_json); return { bytes, mime: "image/png", dataUrl: `data:image/png;base64,${item.b64_json}` }; }
  if (item?.url) { const r = await fetch(String(item.url), { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(`background_edit_download_${r.status}`); const mime = r.headers.get("content-type") || "image/png"; const bytes = new Uint8Array(await r.arrayBuffer()); return { bytes, mime, dataUrl: `data:${mime};base64,${toBase64(bytes)}` }; }
  throw new Error("background_edit_missing_output");
}

async function synthetic(openaiKey: string, body: ImageRequest) {
  const watermark = String(body.watermark || "").trim();
  const brandRule = watermark
    ? `Aplicar no rodapé uma marca d'água discreta, legível e exatamente com o texto: ${watermark}. Não inserir nenhum outro texto.`
    : "Sem texto e sem marca d'água.";
  const prompt = `Crie uma imagem editorial horizontal original para: ${body.title}. Contexto: ${[body.context, body.keywords].filter(Boolean).join(". ")}. ${brandRule} Sem pessoa pública identificável não fornecida como referência. Não copiar logotipos, assinaturas ou composição protegida da matéria de origem.`;
  const response = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, n: 1, size: size(body.aspectRatio), quality: body.quality === "low" ? "low" : body.quality === "medium" || body.quality === "standard" ? "medium" : "high" }), signal: AbortSignal.timeout(150000) });
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(String(payload?.error?.message || `openai_image_http_${response.status}`));
  if (payload?.data?.[0]?.b64_json) return { bytes: fromBase64(payload.data[0].b64_json), mime: "image/png" };
  throw new Error("synthetic_image_missing_output");
}

async function saveArticle(admin: any, userId: string, body: ImageRequest, image: string, source: string, meta: Record<string, unknown>) {
  if (!body.articleId) return;
  const { data: article } = await admin.from("articles").select("config").eq("id", body.articleId).eq("user_id", userId).maybeSingle();
  const config = article?.config && typeof article.config === "object" ? article.config as Record<string, unknown> : {};
  await admin.from("articles").update({ featured_image_url: image, image_source: source, config: { ...config, image_geo: meta }, updated_at: new Date().toISOString() }).eq("id", body.articleId).eq("user_id", userId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({})) as ImageRequest; if (!body.title?.trim()) return json({ success: false, error: "Título é obrigatório" }, 400);
    const actor = await resolveRequestActor(req, body.userId); const userId = actor.userId;
    const supabaseUrl = env("SUPABASE_URL"); const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto" }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const moduleKey = moduleFor(body); const { policy, assets, assetScope } = await pool(admin, userId, moduleKey, body.projectId); const required = Number(policy.required_asset_count || 6);

    if (assets.length > 0 && policy.auto_select !== false) {
      const usable = await chooseUsableAsset(admin, body, assets.slice(0, 6));
      if (usable) {
      const { selected, original, failures: assetFailures } = usable;
      let finalImage = original; let source = "fixed_pool"; let edited = false;
      if (selected.asset.background_mode === "chroma_replace" && policy.allow_background_editing === true) {
        const keys = await fetchUserKeys(userId); if (!keys.openai) throw new Error("OpenAI não configurada para edição de fundo");
        finalImage = await backgroundEdit(keys.openai, original, selected.asset, body); source = "fixed_pool_background_edited"; edited = true;
      }
      const now = new Date().toISOString();
      await Promise.all([
        admin.from("module_image_assets").update({ usage_count: Number(selected.asset.usage_count || 0) + 1, last_used_at: now, updated_at: now }).eq("id", selected.asset.id).eq("user_id", userId),
        admin.from("module_image_selection_logs").insert({ user_id: userId, module_key: moduleKey, project_id: body.projectId || null, article_id: body.articleId || null, asset_id: selected.asset.id, selector_provider: selected.provider, selector_model: selected.model, selection_reason: selected.reason.slice(0, 1000) }),
      ]);
      const meta = { source, module_key: moduleKey, asset_id: selected.asset.id, asset_scope: assetScope, pool_asset_count: assets.length, pool_required_count: required, pool_complete: assets.length >= required, unavailable_assets_skipped: assetFailures.length, slot: selected.asset.slot, background_mode: selected.asset.background_mode, background_edited: edited, synthetic_person_generation: false, alt_text: selected.asset.alt_text, semantic_filename: selected.asset.semantic_filename, caption: selected.asset.caption, target_hero: `${policy.hero_width || 1200}x${policy.hero_height || 630}`, preferred_format: policy.preferred_format || "webp", selection_reason: selected.reason };
      const persisted = await persistImage(admin, userId, finalImage);
      const persistedMeta = { ...meta, storage_bucket: "article-images", storage_path: persisted.path, content_hash: persisted.hash };
      await saveArticle(admin, userId, body, persisted.url, source, persistedMeta);
      return json({ success: true, image: persisted.url, source, generated: false, edited, syntheticPersonGeneration: false, moduleKey, selectedSlot: selected.asset.slot, alt: selected.asset.alt_text, filename: selected.asset.semantic_filename, caption: selected.asset.caption, geo: persistedMeta, request_id: requestId });
      }
    }

    if (!(body.allowAiGeneration === true && policy.allow_ai_generation === true)) return json({ success: false, error: `Nenhuma das ${assets.length} imagens cadastradas no módulo ${moduleKey} está acessível.`, code: "image_pool_incomplete", retryable: false }, 409);
    const keys = await fetchUserKeys(userId); if (!keys.openai) return json({ success: false, error: "OpenAI não configurada", code: "openai_missing" }, 503);
    const image = await synthetic(keys.openai, body);
    const persisted = await persistImage(admin, userId, image);
    const meta = { source: "openai", synthetic: true, model: OPENAI_IMAGE_MODEL, module_key: moduleKey, watermark_requested: String(body.watermark || "").trim() || null, storage_bucket: "article-images", storage_path: persisted.path, content_hash: persisted.hash };
    await saveArticle(admin, userId, body, persisted.url, "openai", meta); return json({ success: true, image: persisted.url, source: "openai", generated: true, provider: "openai", model: OPENAI_IMAGE_MODEL, geo: meta });
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code }, error.status);
    const message = error instanceof Error ? error.message : "image_processing_failed"; return json({ success: false, error: message, code: "image_processing_failed", image_pending: true, retryable: true, request_id: requestId }, 500);
  }
});
