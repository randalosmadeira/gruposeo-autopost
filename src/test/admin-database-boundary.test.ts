import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260905195700_enforce_admin_only_technical_controls.sql'), 'utf8');

describe('database-enforced administrative boundary', () => {
  it('removes client policies from prompts, IndexNow, usage and queues', () => {
    expect(sql).toContain('Users can create their own templates');
    expect(sql).toContain('Users can manage their own indexnow config');
    expect(sql).toContain('Users can view their own usage logs');
    expect(sql).toContain('Users view own brain jobs');
  });

  it('blocks provider and model changes for non-CEO users', () => {
    expect(sql).toContain('guard_user_settings_technical_fields');
    expect(sql).toContain("current_setting('request.jwt.claim.role', true)");
    expect(sql).toContain('not coalesce((select public.is_ceo()), false)');
    for (const field of ['openai_api_key', 'anthropic_api_key', 'gemini_api_key', 'serper_api_key', 'byok_enabled', 'ai_provider', 'image_model']) {
      expect(sql).toContain(field);
    }
  });

  it('keeps WordPress operation logs visible only to the CEO', () => {
    expect(sql).toContain('CEO reads wordpress operations');
    expect(sql).toContain('using ((select public.is_ceo()))');
  });
});
