import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const generator = readFileSync(resolve(process.cwd(), 'supabase/functions/generate-supporter-avatar/index.ts'), 'utf8');

describe('supporter avatar provider errors', () => {
  it('uses a dedicated error for a real QA miss', () => {
    expect(generator).toContain("qa_threshold_not_met");
  });

  it('uses a dedicated provider error after both vision providers fail', () => {
    expect(generator).toContain('vision_provider_failure:');
    expect(generator).toContain('vision_all_providers_failed');
  });
});
