import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const image = readFileSync('supabase/functions/generate-image/index.ts', 'utf8');
const orchestrator = readFileSync('supabase/functions/_shared/ai-orchestrator.ts', 'utf8');
const article = readFileSync('supabase/functions/generate-article/index.ts', 'utf8');

describe('image tenancy and dual provider generation', () => {
  it('uses only approved organization assets for non-electoral projects', () => {
    expect(image).toContain('.eq("organization_id", project.organization_id).eq("status", "ready")');
    expect(image).toContain('electoral_portal_resources');
    expect(image).toContain('assetScope: "organization"');
  });

  it('keeps electoral pools isolated from ordinary projects', () => {
    expect(image).toContain('if (!electoralLinks && project.organization_id)');
    expect(image).toContain('origin: "organization"');
  });

  it('runs OpenAI and Claude concurrently when dual mode is selected', () => {
    expect(orchestrator).toContain('Promise.allSettled');
    expect(orchestrator).toContain("['openai', 'anthropic']");
    expect(article).toContain('provider === "dual"');
    expect(article).toContain('callDualWithMeta');
  });
});
