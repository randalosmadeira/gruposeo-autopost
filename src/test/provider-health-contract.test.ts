import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260907031000_provider_realtime_health.sql', 'utf8');
const edgeFunction = readFileSync('supabase/functions/provider-health/index.ts', 'utf8');
const classifier = readFileSync('supabase/functions/_shared/provider-health.ts', 'utf8');
const validation = readFileSync('supabase/functions/validate-ai-key/index.ts', 'utf8');

describe('provider health security contract', () => {
  it('isolates telemetry by authenticated user and publishes realtime events', () => {
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain('revoke insert, update, delete');
    expect(migration).toContain('alter publication supabase_realtime add table');
  });

  it('never returns keys and recognizes credit blocks separately from rate limits', () => {
    expect(edgeFunction).not.toMatch(/providers: rows.*key/s);
    expect(classifier).toContain('insufficient_credit');
    expect(classifier).toContain('if (status === 429) return "rate_limited"');
  });

  it('uses no-token model-list probes with a bounded timeout', () => {
    expect(edgeFunction).toContain('/v1/models');
    expect(edgeFunction).toContain('AbortSignal.timeout(8000)');
  });

  it('records explicit key-test latency without persisting raw provider responses', () => {
    expect(validation).toContain('latency_ms: latencyMs');
    expect(validation).toContain('PROVIDER_CAPABILITIES[provider]');
    expect(validation).not.toContain('text.slice');
  });

  it('validates OpenAI with a tiny real generation instead of a misleading model-list request', () => {
    expect(validation).toContain('api.openai.com/v1/responses');
    expect(validation).toContain('model = "gpt-5-mini"');
    expect(validation).toContain('max_output_tokens: 32');
    expect(validation).toContain('AbortSignal.timeout(15000)');
    expect(validation).toContain('"functional_generation"');
    expect(validation).not.toContain('api.openai.com/v1/models');
  });
});
