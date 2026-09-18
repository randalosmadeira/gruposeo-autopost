/**
 * Frontend mirror of the Zica.ai image policy (2026-09).
 *
 * This repo already has a precedent for a deliberately-duplicated
 * cross-runtime constants file: `supabase/functions/_shared/plugin-version.ts`
 * (Deno) has a sibling `src/lib/plugin-version.ts` (frontend), manually kept
 * in sync and checked by a test — because a frontend bundle can't literally
 * `import` a Deno edge-function file. This file follows that same pattern for
 * `supabase/functions/_shared/image-policy.ts`, mirroring only the subset the
 * browser-side "Banco visual reutilizável" (reusable visual bank) code needs.
 *
 * Keep the numbers below in sync with `supabase/functions/_shared/image-policy.ts`.
 * `src/test/image-policy-frontend-parity.test.ts` checks that numeric parity.
 */

export const HERO_MAX_BYTES = 150 * 1024;
export const HERO_SAFE_ZONE_RATIO = 0.15; // 15% (up to 20%) clean margin on every side

export interface HeroDimensions {
  width: number;
  height: number;
}

export const HERO_16_9: HeroDimensions = { width: 1200, height: 675 };
export const HERO_4_3: HeroDimensions = { width: 1200, height: 900 };

/**
 * Quality ladder for exporting a client-side <canvas> to WebP via
 * `HTMLCanvasElement.toBlob(blob, 'image/webp', quality)`, which takes a
 * 0-1 scale. Lower the quality in steps until the export fits HERO_MAX_BYTES;
 * the last step is kept even if it is still larger.
 *
 * NOTE: this is intentionally a different scale than
 * `HERO_WEBP_QUALITY_STEPS` in `supabase/functions/_shared/image-policy.ts`,
 * which drives a server-side Supabase Storage render URL (`?quality=`) on a
 * 0-100 scale. The two lists are not meant to be identical values — they are
 * meant to move in tandem conceptually (same number of steps, same rough
 * "how aggressively do we compress" shape) whenever the hero image budget
 * changes. Update both together.
 */
export const WEBP_CANVAS_QUALITY_STEPS = [0.86, 0.8, 0.74, 0.68, 0.62, 0.56];

/**
 * Standardized backdrop for the reusable visual bank ("Banco visual
 * reutilizável"). Every chroma-keyed headshot is composited onto this
 * backdrop instead of being left transparent or letterboxed with black bars,
 * so every slot in the bank shares one consistent, professional look — which
 * is what actually makes the bank worth reusing across articles.
 *
 * Sourced from this app's own dark-surface brand token rather than an
 * invented color: `--gradient-dark` in `src/index.css`
 * (`linear-gradient(135deg, #0D1117 0%, #161B22 100%)`), the same gradient
 * already used for cards/sidebar dark surfaces elsewhere in the product.
 */
export const BRAND_BACKDROP_GRADIENT = {
  angleDeg: 135,
  stops: [
    { offset: 0, color: '#0D1117' },
    { offset: 1, color: '#161B22' },
  ],
} as const;
