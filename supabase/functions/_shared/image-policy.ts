/**
 * Zica.ai image policy (2026-09). Single source of truth for every image the
 * system generates, selects or publishes.
 *
 *  - Hero/featured: 1200x675 (16:9) by default, 1200x900 (4:3) when requested.
 *    Google Discover needs >= 1200 px wide and >= 300.000 px in total.
 *  - Output: WebP (JPEG copy kept for clients that cannot read WebP), <= 150 KB.
 *  - Safe zone: the subject stays in the central area; 15-20% of every border
 *    holds only background, because Google/AI cards crop to 1:1 or smaller.
 *  - No text, numbers, logos or watermarks rendered inside the pixels: the
 *    message belongs to alt text, caption and surrounding HTML.
 *
 * WebP derivation uses Supabase Storage image transformations, which are
 * enabled for this project (verified live on 2026-09-07). No wasm codecs are
 * needed inside the Edge runtime.
 */
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

/** The slice of the Supabase client this module needs (works with the service-role client). */
export interface StorageAdmin {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Uint8Array, options?: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } | null };
    };
  };
}

export const IMAGE_POLICY_VERSION = "2026-09";
export const HERO_MIN_WIDTH = 1200;
export const HERO_MIN_PIXELS = 300_000;
export const HERO_MAX_BYTES = 150 * 1024;
export const HERO_SAFE_ZONE_RATIO = 0.15; // 15% (up to 20%) clean margin on every side
export const HERO_FORMATS = ["webp", "jpeg"] as const;
export const HERO_WEBP_QUALITY_STEPS = [82, 76, 70, 64, 58, 52, 46] as const;
export const HERO_JPEG_QUALITY_STEPS = [85, 78, 72, 66, 60, 55] as const;

export type HeroAspect = "16:9" | "4:3";
export interface HeroDimensions { width: number; height: number; aspect: HeroAspect }

export const HERO_16_9: HeroDimensions = { width: 1200, height: 675, aspect: "16:9" };
export const HERO_4_3: HeroDimensions = { width: 1200, height: 900, aspect: "4:3" };

/** Anything that is not explicitly 4:3 becomes the 16:9 hero (Discover default). */
export function heroDimensionsFor(aspectRatio?: string | null): HeroDimensions {
  return aspectRatio === "4:3" ? HERO_4_3 : HERO_16_9;
}

/** Rules injected into every image-generation prompt. */
export const IMAGE_PROMPT_RULES = [
  "Imagem horizontal, proporção 16:9, pensada para 1200x675 pixels.",
  "Assunto principal (rosto, produto ou objeto) rigorosamente centralizado, ocupando no máximo a área central de 70% da largura e 70% da altura.",
  "Deixar de 15% a 20% de margem em todas as bordas apenas com cenário de fundo, sem elementos importantes, porque a imagem será recortada em 1:1 e em formatos menores.",
  "Proibido qualquer texto, letra, número, logotipo, selo, legenda ou marca d'água dentro da imagem.",
  "Sem bordas, molduras, colagens ou divisões de tela.",
].join(" ");

export interface HeroDerivation {
  url: string;
  path: string;
  bytes: number;
  width: number;
  height: number;
  aspect: HeroAspect;
  quality: number;
  withinBudget: boolean;
  format: "webp";
}

export interface JpegCopy { url: string; path: string; bytes: number; quality: number; withinBudget: boolean }

function stripExtension(path: string) {
  return path.replace(/\.[a-z0-9]+$/i, "");
}

export function heroRenderUrl(supabaseUrl: string, bucket: string, path: string, dims: HeroDimensions, quality: number) {
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/render/image/public/${bucket}/${path}`;
  return `${base}?width=${dims.width}&height=${dims.height}&resize=cover&quality=${quality}&format=webp`;
}

/**
 * Produces the WebP hero (cover crop to the target box, quality lowered until
 * the file fits the 150 KB budget) from a master already stored in a public
 * bucket, and stores it next to the master.
 */
export async function deriveHeroImage(
  admin: StorageAdmin,
  supabaseUrl: string,
  bucket: string,
  masterPath: string,
  dims: HeroDimensions = HERO_16_9,
): Promise<HeroDerivation> {
  let chosen: { bytes: Uint8Array; quality: number } | null = null;
  for (const quality of HERO_WEBP_QUALITY_STEPS) {
    const response = await fetch(heroRenderUrl(supabaseUrl, bucket, masterPath, dims, quality), {
      headers: { Accept: "image/webp,image/*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`hero_render_http_${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("image/")) throw new Error("hero_render_not_image");
    const bytes = new Uint8Array(await response.arrayBuffer());
    chosen = { bytes, quality };
    if (bytes.length <= HERO_MAX_BYTES) break;
  }
  if (!chosen) throw new Error("hero_render_empty");

  const path = `${stripExtension(masterPath)}-${dims.width}x${dims.height}.webp`;
  const { error } = await admin.storage.from(bucket).upload(path, chosen.bytes, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`hero_upload_failed:${error.message}`);
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("hero_public_url_missing");
  return {
    url: data.publicUrl,
    path,
    bytes: chosen.bytes.length,
    width: dims.width,
    height: dims.height,
    aspect: dims.aspect,
    quality: chosen.quality,
    withinBudget: chosen.bytes.length <= HERO_MAX_BYTES,
    format: "webp",
  };
}

/**
 * JPEG fallback copy for consumers that cannot read WebP. Only PNG/JPEG
 * masters can be decoded by ImageScript; other formats return null.
 */
export async function deriveJpegCopy(
  admin: StorageAdmin,
  bucket: string,
  masterPath: string,
  master: { bytes: Uint8Array; mime: string },
  dims: HeroDimensions = HERO_16_9,
): Promise<JpegCopy | null> {
  if (!/png|jpe?g/i.test(master.mime)) return null;
  try {
    const decoded = await Image.decode(master.bytes);
    const framed = decoded.cover(dims.width, dims.height);
    let chosen: { bytes: Uint8Array; quality: number } | null = null;
    for (const quality of HERO_JPEG_QUALITY_STEPS) {
      const bytes = await framed.encodeJPEG(quality);
      chosen = { bytes, quality };
      if (bytes.length <= HERO_MAX_BYTES) break;
    }
    if (!chosen) return null;
    const path = `${stripExtension(masterPath)}-${dims.width}x${dims.height}.jpg`;
    const { error } = await admin.storage.from(bucket).upload(path, chosen.bytes, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) return null;
    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) return null;
    return { url: data.publicUrl, path, bytes: chosen.bytes.length, quality: chosen.quality, withinBudget: chosen.bytes.length <= HERO_MAX_BYTES };
  } catch (error) {
    console.warn(`[image-policy] jpeg copy skipped: ${error instanceof Error ? error.message : "decode_failed"}`);
    return null;
  }
}

/** Metadata block stored in articles.config.image_geo for auditing. */
export function imagePolicyMetadata(hero: HeroDerivation | null, jpeg: JpegCopy | null, masterUrl: string) {
  return {
    policy_version: IMAGE_POLICY_VERSION,
    min_width: HERO_MIN_WIDTH,
    min_pixels: HERO_MIN_PIXELS,
    max_bytes: HERO_MAX_BYTES,
    safe_zone_ratio: HERO_SAFE_ZONE_RATIO,
    text_in_image: false,
    formats: HERO_FORMATS,
    master_url: masterUrl,
    hero: hero ? { url: hero.url, width: hero.width, height: hero.height, aspect: hero.aspect, bytes: hero.bytes, quality: hero.quality, within_budget: hero.withinBudget, format: hero.format } : null,
    jpeg_copy: jpeg ? { url: jpeg.url, bytes: jpeg.bytes, quality: jpeg.quality, within_budget: jpeg.withinBudget } : null,
    compliance: hero ? (hero.withinBudget ? "compliant" : "oversized") : "unverified",
    wordpress: { robots_meta: "max-image-preview:large", responsive: "srcset via WordPress media sizes", alt_text_required: true },
  };
}
