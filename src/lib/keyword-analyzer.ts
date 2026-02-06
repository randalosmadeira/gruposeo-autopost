/**
 * Keyword Analyzer - Análise automática de keywords conforme PROMPT_UNIVERSAL
 * Classifica keywords por intenção, score de conversão e tipo de conteúdo ideal
 */

export interface KeywordData {
  keyword: string;
  categoria?: string;
  tipo?: string;
  cauda?: string;
  volume?: string;
  dificuldade?: string;
  intencao?: string;
  plataformas?: string;
  prioridade?: string;
}

export interface AnalyzedKeyword extends KeywordData {
  scoreConversao: number;
  tipoConteudo: 'landing_page' | 'conteudo_misto' | 'artigo_blog';
  tipoConteudoLabel: string;
  estrategiasPersuasao: string[];
  ehLocal: boolean;
  comprimentoSugerido: number;
  elementosObrigatorios: string[];
}

// Palavras-gatilho para detectar foco local
const PALAVRAS_LOCAIS = [
  'são paulo', 'sp', 'rio de janeiro', 'rj', 'brasil',
  'próximo', 'perto', 'região', 'capital', 'cidade',
  'bairro', 'zona', 'centro', 'tatuapé', 'paulista'
];

// Palavras-gatilho para detectar intenção transacional
const PALAVRAS_TRANSACIONAIS = [
  'contratar', 'orçamento', 'preço', 'valor', 'custo',
  'agência', 'empresa', 'serviço', 'profissional',
  'melhor', 'comprar', 'adquirir', 'assinar'
];

// Palavras-gatilho para detectar intenção comercial
const PALAVRAS_COMERCIAIS = [
  'como escolher', 'comparar', 'vs', 'versus', 'diferença',
  'review', 'avaliação', 'vale a pena', 'funciona'
];

// Estratégias por tipo de conteúdo
const ESTRATEGIAS_POR_TIPO = {
  landing_page: ['AIDA', 'PAS', 'FAB', 'Scarcity', 'Social Proof'],
  conteudo_misto: ['AIDA', 'Problem-Solution', 'Authority', 'Educational'],
  artigo_blog: ['Problem-Solution', 'Educational', 'Subtle CTA', 'E-E-A-T']
};

// Elementos obrigatórios por tipo
const ELEMENTOS_POR_TIPO = {
  landing_page: [
    'Título persuasivo com benefício claro',
    'Subtítulo com proposta de valor',
    'Seção de benefícios (bullet points)',
    'Prova social (cases, depoimentos)',
    'CTA principal acima da dobra',
    'CTA secundário no rodapé',
    'FAQ com objeções comuns',
    'Formulário de contato/lead',
    'Garantia ou diferencial competitivo'
  ],
  conteudo_misto: [
    'Título educacional + keyword',
    'Introdução com gancho emocional',
    'Seções educacionais (H2)',
    'Dados e estatísticas',
    'CTA contextual no meio',
    'Conclusão com CTA final',
    'FAQ complementar'
  ],
  artigo_blog: [
    'Título informativo otimizado',
    'Introdução com problema claro',
    'Estrutura H2/H3 organizada',
    'Parágrafos curtos (mobile-first)',
    'Exemplos práticos',
    'Links internos relacionados',
    'CTA sutil no final',
    'Meta description otimizada'
  ]
};

/**
 * Detecta a intenção de busca automaticamente
 */
export function detectarIntencao(keyword: string, intencaoManual?: string): string {
  if (intencaoManual) return intencaoManual;
  
  const kw = keyword.toLowerCase();
  
  if (PALAVRAS_TRANSACIONAIS.some(p => kw.includes(p))) {
    return 'Transacional';
  }
  if (PALAVRAS_COMERCIAIS.some(p => kw.includes(p))) {
    return 'Comercial';
  }
  
  // Default: Informacional
  return 'Informacional';
}

/**
 * Detecta se a keyword tem foco local
 */
export function detectarFocoLocal(keyword: string): boolean {
  const kw = keyword.toLowerCase();
  return PALAVRAS_LOCAIS.some(p => kw.includes(p));
}

/**
 * Calcula o score de conversão (0-100)
 */
export function calcularScoreConversao(data: KeywordData): number {
  let score = 0;
  
  // Intenção (40 pontos)
  const intencao = detectarIntencao(data.keyword, data.intencao);
  switch (intencao) {
    case 'Transacional': score += 40; break;
    case 'Comercial': score += 25; break;
    case 'Informacional': score += 10; break;
  }
  
  // Volume (30 pontos)
  const volume = (data.volume || '').toLowerCase();
  if (volume.includes('alto') || volume.includes('alta')) score += 30;
  else if (volume.includes('méd')) score += 20;
  else score += 10;
  
  // Dificuldade invertida (15 pontos - menos concorrência = mais pontos)
  const dificuldade = (data.dificuldade || '').toLowerCase();
  if (dificuldade.includes('baixa') || dificuldade.includes('baixo')) score += 15;
  else if (dificuldade.includes('méd')) score += 10;
  else score += 5;
  
  // Prioridade (15 pontos)
  const prioridade = (data.prioridade || '').toUpperCase();
  if (prioridade === 'ALTA') score += 15;
  else if (prioridade === 'MÉDIA') score += 10;
  else score += 5;
  
  return Math.min(100, score);
}

/**
 * Determina o tipo de conteúdo ideal
 */
export function determinarTipoConteudo(intencao: string): 'landing_page' | 'conteudo_misto' | 'artigo_blog' {
  switch (intencao) {
    case 'Transacional': return 'landing_page';
    case 'Comercial': return 'conteudo_misto';
    default: return 'artigo_blog';
  }
}

/**
 * Retorna label legível para o tipo de conteúdo
 */
export function getTipoConteudoLabel(tipo: string): string {
  const labels: Record<string, string> = {
    landing_page: 'Landing Page',
    conteudo_misto: 'Conteúdo Misto',
    artigo_blog: 'Artigo de Blog'
  };
  return labels[tipo] || tipo;
}

/**
 * Calcula comprimento sugerido baseado no tipo
 */
export function calcularComprimentoSugerido(tipo: string): number {
  switch (tipo) {
    case 'landing_page': return 1500;
    case 'conteudo_misto': return 2000;
    case 'artigo_blog': return 1800;
    default: return 1500;
  }
}

/**
 * Analisa uma keyword completa
 */
export function analyzeKeyword(data: KeywordData): AnalyzedKeyword {
  const intencao = detectarIntencao(data.keyword, data.intencao);
  const tipoConteudo = determinarTipoConteudo(intencao);
  
  return {
    ...data,
    intencao,
    scoreConversao: calcularScoreConversao(data),
    tipoConteudo,
    tipoConteudoLabel: getTipoConteudoLabel(tipoConteudo),
    estrategiasPersuasao: ESTRATEGIAS_POR_TIPO[tipoConteudo],
    ehLocal: detectarFocoLocal(data.keyword),
    comprimentoSugerido: calcularComprimentoSugerido(tipoConteudo),
    elementosObrigatorios: ELEMENTOS_POR_TIPO[tipoConteudo]
  };
}

/**
 * Analisa múltiplas keywords
 */
export function analyzeKeywords(keywords: KeywordData[]): AnalyzedKeyword[] {
  return keywords.map(analyzeKeyword);
}

/**
 * Filtra keywords por prioridade e volume
 */
export function filterPriorityKeywords(keywords: AnalyzedKeyword[]): AnalyzedKeyword[] {
  return keywords
    .filter(k => {
      const prioridade = (k.prioridade || '').toUpperCase();
      const volume = (k.volume || '').toLowerCase();
      return (
        (prioridade === 'ALTA' || prioridade === 'MÉDIA') &&
        (volume.includes('alto') || volume.includes('alta') || volume.includes('méd'))
      );
    })
    .sort((a, b) => b.scoreConversao - a.scoreConversao);
}

/**
 * Agrupa keywords por tipo de conteúdo
 */
export function groupByContentType(keywords: AnalyzedKeyword[]): Record<string, AnalyzedKeyword[]> {
  return keywords.reduce((acc, kw) => {
    const tipo = kw.tipoConteudo;
    if (!acc[tipo]) acc[tipo] = [];
    acc[tipo].push(kw);
    return acc;
  }, {} as Record<string, AnalyzedKeyword[]>);
}

/**
 * Gera resumo estatístico
 */
export function generateSummary(keywords: AnalyzedKeyword[]) {
  const total = keywords.length;
  const byType = groupByContentType(keywords);
  const avgScore = keywords.reduce((sum, k) => sum + k.scoreConversao, 0) / total;
  const localCount = keywords.filter(k => k.ehLocal).length;
  
  return {
    total,
    landingPages: (byType.landing_page || []).length,
    conteudoMisto: (byType.conteudo_misto || []).length,
    artigosBlog: (byType.artigo_blog || []).length,
    avgScore: Math.round(avgScore),
    localKeywords: localCount,
    highPriority: keywords.filter(k => (k.prioridade || '').toUpperCase() === 'ALTA').length
  };
}
