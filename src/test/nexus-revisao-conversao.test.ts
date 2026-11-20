import { describe, expect, it } from 'vitest';
import { isInformationalArticle, validateAutonomousReview } from '../../supabase/functions/_shared/nexus-intelligence.ts';

const sources = 'A Sexta Turma do STJ manteve a anulação do júri. '.repeat(5);
const base = {
  dimensions: { factuality: true, utility: true, semantic: true, conversion: false, sector_compliance: true },
  unsupported_claims: [], issues: [], notes: 'ok',
  material_claims: [{ claim: 'A Sexta Turma do STJ manteve a anulação do júri', quote: 'A Sexta Turma do STJ manteve a anulação do júri.' }],
};

describe('revisão editorial: a conversão só é exigida de conteúdo comercial', () => {
  it('padrão (comercial): conversão falsa reprova, como sempre foi', () => {
    expect(validateAutonomousReview(base, sources).pass).toBe(false);
    expect(validateAutonomousReview(base, sources, { requireConversion: true }).pass).toBe(false);
  });
  it('informativo/notícia: conversão não se aplica, mas fatos, utilidade, semântica, setor, fontes e citações continuam obrigatórios', () => {
    expect(validateAutonomousReview(base, sources, { requireConversion: false }).pass).toBe(true);
    for (const k of ['factuality', 'utility', 'semantic', 'sector_compliance']) {
      expect(validateAutonomousReview({ ...base, dimensions: { ...base.dimensions, [k]: false } }, sources, { requireConversion: false }).pass).toBe(false);
    }
    expect(validateAutonomousReview(base, '', { requireConversion: false }).pass).toBe(false);
    expect(validateAutonomousReview({ ...base, issues: ['x'] }, sources, { requireConversion: false }).pass).toBe(false);
    expect(validateAutonomousReview({ ...base, material_claims: [{ claim: 'x', quote: 'trecho que não existe nas fontes' }] }, sources, { requireConversion: false }).pass).toBe(false);
  });
  it('quem é informativo: intenção informativa, segmento de notícia ou projeto de notícias', () => {
    expect(isInformationalArticle({ config: { intentType: 'informational' } }, { nicho: 'advocacia' })).toBe(true);
    expect(isInformationalArticle({ config: { segment: 'news' } }, null)).toBe(true);
    expect(isInformationalArticle({ config: {} }, { nicho: 'notícias jurídicas' })).toBe(true);
    expect(isInformationalArticle({ config: { intentType: 'transactional' } }, { nicho: 'advocacia criminal' })).toBe(false);
    expect(isInformationalArticle({ config: {} }, { nicho: 'advocacia criminal' })).toBe(false);
    expect(isInformationalArticle(null, null)).toBe(false);
  });
});
