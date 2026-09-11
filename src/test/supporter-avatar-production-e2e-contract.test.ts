import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/supporter-avatar-production-e2e.mjs', 'utf8');

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
  });

  it('mantém regeneração explícita e opt-in para controlar custo', () => {
    expect(script).toContain("SUPPORTER_E2E_REGENERATE === 'true'");
    expect(script).toContain('regeneration_counter_not_incremented');
  });
});
