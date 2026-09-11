import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260912053000_supporter_avatar_data_reconciliation.sql', 'utf8');

describe('reconciliação de dados eleitorais', () => {
  it('reconcilia jobs sem saída, parciais e completos para revisão humana', () => {
    expect(sql).toContain('stale_job_reconciled');
    expect(sql).toContain('stale_partial_pack_reconciled');
    expect(sql).toContain('stale_complete_pack_review_required');
    expect(sql).toContain('for update skip locked');
  });

  it('corrige somente source_count determinístico e preserva créditos', () => {
    expect(sql).toContain('set source_count = (select count(*)');
    expect(sql).not.toMatch(/set\s+generation_count\s*=/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });

  it('oferece auditoria agregada restrita ao service role', () => {
    expect(sql).toContain('audit_supporter_avatar_data_consistency');
    expect(sql).toContain('activeJobDuplicates');
    expect(sql).toContain('service_role_required');
    expect(sql).toContain('from public, anon, authenticated');
  });
});
