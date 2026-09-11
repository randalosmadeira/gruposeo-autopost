import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/supporter-avatar-production-e2e.mjs', 'utf8');
const approval = readFileSync('supabase/functions/approve-supporter-avatar-final/index.ts', 'utf8');
const resumableMigration = readFileSync('supabase/migrations/20260912022000_supporter_avatar_resumable_v7.sql', 'utf8');
const counterMigration = readFileSync('supabase/migrations/20260912023500_supporter_avatar_generation_counter_v7.sql', 'utf8');

describe('contrato do E2E de produção do apoiador 1470', () => {
  it('exige fixture sintética e nunca incorpora token público', () => {
    expect(script).toContain('SUPPORTER_E2E_FIXTURE');
    expect(script).not.toMatch(/token:\s*['"][A-Za-z0-9_-]{24,}/);
  });

  it('exercita upload, geração, status, aprovação, download e limpeza', () => {
    for (const action of ['upload-url', 'register-upload', 'submit', 'status', 'regenerate', 'delete']) {
      expect(script).toContain(`action: '${action}'`);
    }
    expect(script).toContain('approve-supporter-avatar-final');
    expect(script).toContain('assertDownload');
    expect(script).toContain('finally');
  });

  it('valida o pacote social e o aviso obrigatório', () => {
    expect(script).toContain("['square', [1080, 1080]]");
    expect(script).toContain("['portrait', [1080, 1350]]");
    expect(script).toContain("['landscape', [1200, 630]]");
    expect(script).toContain('Imagem gerada por IA - Campanha Oficial');
    expect(script).toContain('supporter-avatar-resumable-v7');
    expect(script).toContain("status === 'needs_review'");
  });

  it('mantém regeneração explícita e opt-in para controlar custo', () => {
    expect(script).toContain("SUPPORTER_E2E_REGENERATE === 'true'");
    expect(script).toContain('regeneration_counter_not_incremented');
  });

  it('permite revisão humana de pacote completo sem relaxar dimensões ou estados prévios', () => {
    expect(approval).toContain("['completed', 'needs_review'].includes(request.status)");
    expect(approval).toContain('social_pack_incomplete');
    expect(approval).toContain('social_pack_dimensions_invalid');
    expect(approval).toContain("status: 'completed'");
  });

  it('serializa tentativas e impede duplicidade de formato dentro do mesmo job', () => {
    expect(resumableMigration).toContain('claim_supporter_avatar_generation_attempt');
    expect(resumableMigration).toContain('for update');
    expect(resumableMigration).toContain('uq_supporter_avatar_v7_job_platform');
    expect(resumableMigration).not.toMatch(/generation_count\s*=\s*case/);
  });

  it('contabiliza somente pacote concluído e de forma idempotente por job', () => {
    expect(counterMigration).toContain('record_supporter_avatar_generation_result');
    expect(counterMigration).toContain('generation_counted');
    expect(counterMigration).toContain('for update');
    expect(script).toContain('attempt <= 3');
  });
});
