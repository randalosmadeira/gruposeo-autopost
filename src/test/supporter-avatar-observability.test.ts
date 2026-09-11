import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260912043000_supporter_avatar_observability.sql', 'utf8');
const admin = readFileSync('supabase/functions/supporter-avatar-admin/index.ts', 'utf8');
const publicApi = readFileSync('supabase/functions/supporter-avatar-public-v2/index.ts', 'utf8');

describe('observabilidade do fluxo de apoiadores', () => {
  it('expõe somente métricas agregadas via service role', () => {
    expect(migration).toContain('get_supporter_avatar_operational_metrics');
    expect(migration).toContain('service_role_required');
    expect(migration).toContain('revoke all on function public.get_supporter_avatar_operational_metrics(integer) from public, anon, authenticated');
    expect(migration).not.toMatch(/supporter_name|email|whatsapp|public_token_hash|fingerprint_hash|storage_path/);
  });

  it('autoriza o gestor antes de consultar telemetria', () => {
    expect(admin.indexOf('requireElectoralManager(req)')).toBeLessThan(admin.indexOf('body.action === "metrics"'));
    expect(admin).toContain('supporter_metrics_read');
    expect(admin).toContain('return json({ error: "internal_error" }, 500)');
  });

  it('publica apenas reasonCode mapeado e nunca a mensagem interna', () => {
    expect(publicApi).toContain('function publicReason');
    expect(publicApi).toContain('reasonCode: publicReason(job.error_message)');
    expect(publicApi).not.toContain('reasonCode: job.error_message');
  });
});
