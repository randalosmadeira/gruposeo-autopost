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

import { quoteSupported } from '../../supabase/functions/_shared/nexus-intelligence.ts';

describe('revisão editorial: a citação precisa existir na fonte (tolera só a digitação do modelo)', () => {
  const fonte = 'FONTE: Código de Processo Penal. Art. 310. Após receber o auto de prisão em flagrante, no prazo máximo de até 24 (vinte e quatro) horas após a realização da prisão, o juiz deverá promover audiência de custódia com a presença do acusado, seu advogado constituído ou membro da Defensoria Pública. I - relaxar a prisão ilegal; ou III - conceder liberdade provisória, com ou sem fiança.';
  it('aceita trecho literal, mesmo com outra caixa, sem acento ou pontuação diferente', () => {
    expect(quoteSupported(fonte, 'o juiz deverá promover audiência de custódia com a presença do acusado')).toBe(true);
    expect(quoteSupported(fonte, 'O JUIZ DEVERA PROMOVER AUDIENCIA DE CUSTODIA, com a presença do acusado')).toBe(true);
  });
  it('aceita pequena diferença de digitação do modelo (palavra trocada/omitida), mas não paráfrase', () => {
    expect(quoteSupported(fonte, 'prazo máximo de até 24 horas após a realização da prisão o juiz deverá promover audiência de custódia')).toBe(true);
    expect(quoteSupported(fonte, 'a audiência de custódia é um direito de quem é preso e deve acontecer rapidamente em todos os casos')).toBe(false);
  });
  it('recusa afirmação que não está na fonte, citação curta demais e fonte pequena', () => {
    expect(quoteSupported(fonte, 'o preso pode ficar até 72 horas sem ver um juiz em qualquer situação')).toBe(false);
    expect(quoteSupported(fonte, 'a prisão')).toBe(false);
    expect(quoteSupported('curta', 'curta demais para valer como fonte de verdade')).toBe(false);
  });
  it('o validador usa a conferência robusta e continua exigindo todos os outros critérios', () => {
    const base = { dimensions: { factuality: true, utility: true, semantic: true, conversion: true, sector_compliance: true }, unsupported_claims: [], issues: [], notes: '',
      material_claims: [{ claim: 'prazo da custódia', quote: 'O JUIZ DEVERA PROMOVER AUDIENCIA DE CUSTODIA, com a presença do acusado' }] };
    expect(validateAutonomousReview(base, fonte).pass).toBe(true);
    expect(validateAutonomousReview({ ...base, issues: ['x'] }, fonte).pass).toBe(false);
    expect(validateAutonomousReview({ ...base, material_claims: [{ claim: 'c', quote: 'o preso pode ficar até 72 horas sem ver um juiz em qualquer situação' }] }, fonte).pass).toBe(false);
  });
});

describe('revisão editorial: aceita as dimensões dentro de `dimensions` ou no nível de cima do JSON', () => {
  const fonte2 = 'Art. 916. No prazo para embargos, reconhecendo o crédito do exequente e comprovando o depósito de trinta por cento do valor em execução, o executado poderá requerer que lhe seja permitido pagar o restante em até 6 (seis) parcelas mensais.';
  const flat = { factuality: true, utility: true, semantic: true, conversion: true, sector_compliance: true, unsupported_claims: [], issues: [], notes: '',
    material_claims: [{ claim: 'parcelamento em até 6 parcelas', quote: 'o executado poderá requerer que lhe seja permitido pagar o restante em até 6 (seis) parcelas mensais' }] };
  it('formato plano (como o modelo costuma responder) passa quando tudo está certo', () => {
    expect(validateAutonomousReview(flat, fonte2).pass).toBe(true);
  });
  it('formato plano com uma dimensão falsa ou dimensão ausente reprova', () => {
    expect(validateAutonomousReview({ ...flat, factuality: false }, fonte2).pass).toBe(false);
    const { sector_compliance: _s, ...semSetor } = flat; void _s;
    expect(validateAutonomousReview(semSetor, fonte2).pass).toBe(false);
  });
  it('o formato antigo (dimensions) continua valendo', () => {
    const { factuality, utility, semantic, conversion, sector_compliance, ...resto } = flat; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(validateAutonomousReview({ ...resto, dimensions: { factuality, utility, semantic, conversion, sector_compliance } }, fonte2).pass).toBe(true);
  });
});
