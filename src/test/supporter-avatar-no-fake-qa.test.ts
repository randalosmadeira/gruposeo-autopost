import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const generator = readFileSync(resolve(process.cwd(), 'supabase/functions/generate-supporter-avatar/index.ts'), 'utf8');

describe('supporter avatar QA truthfulness v3', () => {
  it('never fabricates identity QA scores when vision providers fail', () => {
    expect(generator).not.toContain('supporterFidelity: 98');
    expect(generator).not.toContain('candidateFidelity: 98');
    expect(generator).not.toContain('humanTexture: 95');
    expect(generator).not.toContain('anatomy: 95');
    expect(generator).not.toContain('cropSafe: 95');
    expect(generator).not.toContain('lighting: 92');
    expect(generator).not.toContain('batIntegrity: 92');
  });

  it('stores a generated image as pending review when the QA provider itself is unavailable', () => {
    expect(generator).toContain('qa_provider_unavailable');
    expect(generator).toContain('qa_provider_error');
    expect(generator).toContain("pass: false");
    expect(generator).toContain("const finalStatus = allPass ? 'completed' : 'needs_review'");
    expect(generator).toContain('qa_threshold_not_met_or_qa_provider_pending');
  });

  it('keeps provider-failure diagnostics internally while Photo Intake and selection recover autonomously', () => {
    expect(generator).toContain('vision_all_providers_failed');
    expect(generator).toContain('intakeFallback');
    expect(generator).toContain('fallbackCandidate');
    expect(generator).toContain('autonomous_recovery');
  });
});
