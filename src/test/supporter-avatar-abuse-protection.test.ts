import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const edge = readFileSync('supabase/functions/supporter-avatar-public-v2/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260912033000_supporter_avatar_abuse_protection.sql', 'utf8');

describe('proteção contra abuso do link de apoiadores', () => {
  it('reserva limites de forma atômica por rede, contato e janela global', () => {
    expect(edge).toContain('reserve_supporter_avatar_create');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("interval '1 hour'");
    expect(migration).not.toContain("'rate_limit_reached'");
  });

  it('não armazena IP ou contato em claro no ledger de abuso', () => {
    expect(migration).toContain('network_hash text');
    expect(migration).toContain('contact_hash text not null');
    expect(migration).not.toMatch(/\bip_address\b|\bemail\b|\bwhatsapp\b/i);
    expect(edge).toContain('sha256(`network:v1:');
    expect(edge).toContain('sha256(`contact:v1:');
  });

  it('mantém o ledger inacessível a anon e authenticated', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on table public.supporter_avatar_abuse_events from public, anon, authenticated');
    expect(migration).toContain('service_role_required');
  });

  it('valida os bytes reais do upload e remove objetos inválidos', () => {
    expect(edge).toContain('detectedImageMime');
    expect(edge).toContain('bytes.length !== fileSize');
    expect(edge).toContain('uploaded_image_integrity_invalid');
    expect(edge).toContain("remove([path])");
    expect(migration).toContain('file_size_limit = 10485760');
  });

  it('preserva Turnstile quando configurado e declara defesa em profundidade', () => {
    expect(edge).toContain('TURNSTILE_SECRET_KEY');
    expect(edge).toContain('atomicRateLimits: true');
    expect(edge).toContain('uploadSignatureValidation: true');
  });
});
