import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'supabase/functions/generate-supporter-avatar/index.ts'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260903174000_supporter_avatar_autonomy_v3.sql'), 'utf8');

describe('supporter avatar autonomous vision runtime v3', () => {
  it('keeps original supporter photos out of the vision payload by using short-lived signed URLs', () => {
    expect(source).toContain('createSignedUrl');
    expect(source).toContain('signed_url');
    expect(source).not.toContain('visionImageFromBytes');
  });

  it('forces structured output from both vision providers', () => {
    expect(source).toContain("type: 'json_schema'");
    expect(source).toContain("tool_choice: { type: 'tool', name: 'emit_result' }");
    expect(source).toContain('PHOTO_INTAKE_SCHEMA');
    expect(source).toContain('CANDIDATE_SCHEMA');
    expect(source).toContain('QA_SCHEMA');
  });

  it('uses OpenAI first and Anthropic as a bounded fallback without decoding all source photos', () => {
    expect(source).toContain('openAIVisionJson');
    expect(source).toContain('anthropicVisionJson');
    expect(source).toContain('MAX_ANTHROPIC_TOTAL_BYTES');
    expect(source).toContain('vision_all_providers_failed');
  });

  it('has autonomous technical fallbacks instead of converting vision outages into terminal failures', () => {
    expect(source).toContain('intakeFallback');
    expect(source).toContain('fallbackCandidate');
    expect(source).toContain("scene: 'institucional-oficial'");
    expect(source).toContain('autonomous_recovery');
  });

  it('does not charge a public generation until at least one output is stored', () => {
    expect(migration).not.toContain('generation_count = generation_count + 1,\n      supporter_approved_at');
    expect(migration).toContain('record_supporter_avatar_generation_result');
    expect(source).toContain('if (producedAnyOutput) await countGenerationResult');
  });
});
