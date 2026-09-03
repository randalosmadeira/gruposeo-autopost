import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'supabase/functions/generate-supporter-avatar/index.ts'), 'utf8');

describe('supporter avatar vision runtime safeguards', () => {
  it('does not send original multi-megabyte photos directly to vision providers', () => {
    expect(source).toContain('visionImageFromBytes');
    expect(source).toContain('VISION_MAX_EDGE = 896');
    expect(source).toContain('VISION_PREVIEW_EDGE = 768');
  });

  it('requires a real image content-type from Drive', () => {
    expect(source).toContain('candidate_preview_invalid_mime');
    expect(source).toContain('candidate_asset_invalid_mime');
  });

  it('falls back from Anthropic to OpenAI vision', () => {
    expect(source).toContain('falling back to OpenAI');
    expect(source).toContain('openAIVisionJson');
  });
});
