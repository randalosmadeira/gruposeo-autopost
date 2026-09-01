export const ELECTORAL_LONGFORM_TARGET = {
  targetWords: 4000,
  sections: [
    { id: 'local-diagnosis', label: 'Diagnóstico local factual', min: 500, max: 650 },
    { id: 'biographical-context', label: 'Contexto biográfico verificável', min: 600, max: 850 },
    { id: 'technical-analysis', label: 'Análise técnica e institucional', min: 1000, max: 1250 },
    { id: 'proposal-context', label: 'Propostas e competências do cargo', min: 1000, max: 1250 },
    { id: 'faq-summary', label: 'FAQ factual e resumo executivo', min: 600, max: 850 },
  ],
  requiredEvidence: ['fonte primária', 'data da fonte', 'URL', 'competência federativa', 'distinção entre proposta e resultado'],
} as const;

const normalizeSlugPart = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\b(de|da|do|das|dos|e|em|para|por|com|a|o|as|os)\b/g, ' ')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

export function buildFactualElectoralSlug(input: {
  topic: string;
  problem?: string;
  city?: string;
  district?: string;
}): string {
  const pieces = [input.topic, input.problem, input.district, input.city, 'eleicoes-2026']
    .filter(Boolean)
    .map((value) => normalizeSlugPart(String(value)))
    .filter(Boolean);
  return `/noticias/${pieces.join('-')}`;
}

export function evaluateLongformDepth(content: string) {
  const plainText = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`#>*_\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;
  const hasFaq = /\bFAQ\b|perguntas frequentes/i.test(content);
  const hasSources = /https?:\/\//i.test(content) || /fontes?:/i.test(content);
  const hasProposalDistinction = /proposta|compet[eê]ncia|pode propor|pode votar|fiscalizar/i.test(content);

  return {
    wordCount,
    targetWords: ELECTORAL_LONGFORM_TARGET.targetWords,
    reachesConfiguredLongformTarget: wordCount >= ELECTORAL_LONGFORM_TARGET.targetWords,
    hasFaq,
    hasSources,
    hasProposalDistinction,
    warnings: [
      ...(wordCount < ELECTORAL_LONGFORM_TARGET.targetWords ? [`Rascunho abaixo do alvo editorial configurado de ${ELECTORAL_LONGFORM_TARGET.targetWords} palavras.`] : []),
      ...(!hasFaq ? ['FAQ factual não detectado.'] : []),
      ...(!hasSources ? ['Fontes/URLs não detectadas.'] : []),
      ...(!hasProposalDistinction ? ['Não foi detectada distinção clara entre proposta e competência do cargo.'] : []),
    ],
  };
}

export const ELECTORAL_GEO_POLICY = {
  allowed: [
    'contextualização por município/distrito com dados públicos',
    'metadados e schema geográficos',
    'pautas editoriais baseadas em problemas públicos verificáveis',
  ],
  prohibitedAutomation: [
    'inferir preferência política individual',
    'personalizar persuasão eleitoral por bairro ou perfil',
    'ranquear ou recomendar candidatura',
    'converter dado territorial em probabilidade de voto',
  ],
} as const;
