import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

// Frontend mirror of the Deno-only shared module, following the same
// deliberate-duplication pattern already used for plugin-version.ts (see
// image-policy-2026.test.ts). This file checks the two copies stay in
// numeric agreement instead of drifting apart silently.
function extractNumber(source: string, pattern: RegExp): number {
  const match = source.match(pattern);
  if (!match) throw new Error(`Pattern not found: ${pattern}`);
  return Number(match[1]);
}

describe('image policy frontend/backend parity', () => {
  const backend = read('supabase/functions/_shared/image-policy.ts');
  const frontend = read('src/lib/image-policy.ts');

  it('keeps HERO_MAX_BYTES numerically identical', () => {
    const backendValue = extractNumber(backend, /export const HERO_MAX_BYTES = (\d+) \* 1024;/);
    const frontendValue = extractNumber(frontend, /export const HERO_MAX_BYTES = (\d+) \* 1024;/);
    expect(frontendValue).toBe(backendValue);
    expect(frontendValue).toBe(150);
  });

  it('keeps HERO_SAFE_ZONE_RATIO numerically identical', () => {
    const backendValue = extractNumber(backend, /export const HERO_SAFE_ZONE_RATIO = (0\.\d+);/);
    const frontendValue = extractNumber(frontend, /export const HERO_SAFE_ZONE_RATIO = (0\.\d+);/);
    expect(frontendValue).toBe(backendValue);
    expect(frontendValue).toBe(0.15);
  });

  it('keeps HERO_16_9 dimensions numerically identical', () => {
    const backendWidth = extractNumber(backend, /HERO_16_9: HeroDimensions = \{ width: (\d+), height: \d+/);
    const backendHeight = extractNumber(backend, /HERO_16_9: HeroDimensions = \{ width: \d+, height: (\d+)/);
    const frontendWidth = extractNumber(frontend, /HERO_16_9: HeroDimensions = \{ width: (\d+), height: \d+/);
    const frontendHeight = extractNumber(frontend, /HERO_16_9: HeroDimensions = \{ width: \d+, height: (\d+)/);
    expect(frontendWidth).toBe(backendWidth);
    expect(frontendHeight).toBe(backendHeight);
    expect([frontendWidth, frontendHeight]).toEqual([1200, 675]);
  });

  it('keeps HERO_4_3 dimensions numerically identical', () => {
    const backendWidth = extractNumber(backend, /HERO_4_3: HeroDimensions = \{ width: (\d+), height: \d+/);
    const backendHeight = extractNumber(backend, /HERO_4_3: HeroDimensions = \{ width: \d+, height: (\d+)/);
    const frontendWidth = extractNumber(frontend, /HERO_4_3: HeroDimensions = \{ width: (\d+), height: \d+/);
    const frontendHeight = extractNumber(frontend, /HERO_4_3: HeroDimensions = \{ width: \d+, height: (\d+)/);
    expect(frontendWidth).toBe(backendWidth);
    expect(frontendHeight).toBe(backendHeight);
    expect([frontendWidth, frontendHeight]).toEqual([1200, 900]);
  });
});
