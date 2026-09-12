import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateTitleQuality,
  findBrokenContactCtas,
  findComplianceViolations,
  normalizeSlugForLookup,
  sentenceCaseTitle,
} from '../../supabase/functions/_shared/publication-quality';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('portão de qualidade de título (palavra-chave crua não vira título)', () => {
  it('reprova as grafias erradas que chegaram ao ar no blog RDM em 2026-09', () => {
    for (const title of ['habias corpos', 'habes copus', 'audiencia de custoza', 'tornoseleira eletronica', 'abeas copus', 'aveas corpus', 'audiencia de custodi']) {
      const codes = evaluateTitleQuality(title).issues.map((i) => i.code);
      expect(codes, title).toContain('title_misspelling');
    }
  });

  it('não confunde "habeas corpus" correto com grafia errada', () => {
    const codes = evaluateTitleQuality('Quanto tempo demora um habeas corpus').issues.map((i) => i.code);
    expect(codes).not.toContain('title_misspelling');
    expect(codes).toHaveLength(0);
  });

  it('reprova título curto, truncado em preposição ou com marcação técnica', () => {
    expect(evaluateTitleQuality('modelo de').issues.map((i) => i.code)).toContain('title_truncated');
    expect(evaluateTitleQuality('habeas').issues.map((i) => i.code)).toContain('title_too_short');
    expect(evaluateTitleQuality('# Título: exemplo de título {x}').issues.map((i) => i.code)).toContain('title_artifact_markup');
  });

  it('normaliza título todo em minúsculas para caixa de frase sem alterar títulos já formatados', () => {
    expect(sentenceCaseTitle('provas importantes em casos de progressão de regime')).toBe('Provas importantes em casos de progressão de regime');
    expect(sentenceCaseTitle('Prisão em Flagrante: o que fazer')).toBe('Prisão em Flagrante: o que fazer');
    expect(evaluateTitleQuality('provas importantes em casos de progressão de regime').normalizedTitle.startsWith('P')).toBe(true);
  });
});

describe('portão Provimento 205/2021 (publicidade de advocacia)', () => {
  it('reprova promessa de resultado, superlativo, urgência comercial e captação direta', () => {
    const codes = findComplianceViolations({
      title: 'O melhor advogado criminalista de São Paulo',
      content: '<p>Garantimos a absolvição. Consulta gratuita. Entre em contato agora pelo WhatsApp.</p>',
    }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['superlativo', 'promessa_resultado', 'urgencia_comercial', 'captacao_direta']));
  });

  it('não reprova pergunta de FAQ que nega a promessa ("é garantia de absolvição? Não.")', () => {
    const codes = findComplianceViolations({
      title: 'Pedido de liberdade provisória',
      content: '<p><strong>Liberdade provisória é garantia de absolvição?</strong> Não. Ela apenas permite responder em liberdade.</p>',
    }).map((i) => i.code);
    expect(codes).not.toContain('promessa_resultado');
  });

  it('aprova texto informativo dentro do padrão', () => {
    expect(findComplianceViolations({ title: 'Audiência de custódia: como funciona', content: '<p>Atuação em audiência de custódia. Entenda as etapas e os prazos.</p>' })).toHaveLength(0);
  });
});

describe('portão de CTA quebrada (WhatsApp sem número, link do Google Maps como contato)', () => {
  it('reprova as quatro formas encontradas nos posts 2308, 2409, 2529, 3861, 3891 e 2322', () => {
    const maps = 'https://www.google.com/maps?rlz=1C1&daddr=Av.+Paulista,+1842';
    const samples = [
      `entre em contato agora pelo WhatsApp [aqui](${maps}) ou procure o escritório`,
      `Fale com o time do Blog RDM Advogados através do WhatsApp [](${maps})`,
      'ou envie um WhatsApp para .',
      'ou utilize nosso WhatsApp () para análise personalizada',
      'canal disponível é o WhatsApp de atendimento especializado: .',
    ];
    for (const sample of samples) expect(findBrokenContactCtas(sample), sample).not.toHaveLength(0);
  });

  it('aceita menção legítima a WhatsApp como meio de prova ou canal com link válido', () => {
    expect(findBrokenContactCtas('Mensagens de WhatsApp podem ser usadas como prova de estelionato? Sim.')).toHaveLength(0);
    expect(findBrokenContactCtas('<a href="https://wa.me/5511951730074">Fale pelo WhatsApp</a>')).toHaveLength(0);
    expect(findBrokenContactCtas('Veja o endereço no <a href="https://www.google.com/maps?q=x">Google Maps</a>')).toHaveLength(0);
  });
});

describe('slug para checagem de duplicata', () => {
  it('normaliza acentos, espaços e caracteres inválidos e cai no título quando o slug está vazio', () => {
    expect(normalizeSlugForLookup(' Quanto tempo demora um Habeas Corpus? ')).toBe('quanto-tempo-demora-um-habeas-corpus');
    expect(normalizeSlugForLookup('', 'Audiência de custódia')).toBe('audiencia-de-custodia');
  });
});

describe('publish-to-wordpress aplica os portões antes de enviar ao plugin', () => {
  const publisher = read('supabase/functions/publish-to-wordpress/index.ts');
  it('importa e usa os quatro portões, fail-closed', () => {
    expect(publisher).toContain('publication-quality.ts');
    expect(publisher).toContain('title_quality_gate');
    expect(publisher).toContain('compliance_gate');
    expect(publisher).toContain('broken_cta_gate');
    expect(publisher).toContain('duplicate_slug_gate');
    expect(publisher).toContain('lookupPublishedSlug');
  });
});
