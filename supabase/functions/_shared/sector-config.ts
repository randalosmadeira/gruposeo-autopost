/**
 * Sector Configuration - Specialized prompts and rules for 9 sectors
 * 
 * Each sector has compliance rules, approved CTAs, forbidden words,
 * and conversion-focused writing guidelines.
 */

export type SectorType =
  | 'legal'
  | 'legal-high-complexity'
  | 'marketing_digital'
  | 'beauty_aesthetics'
  | 'health_general'
  | 'health_dental'
  | 'health_physiotherapy'
  | 'health_medical'
  | 'real_estate'
  | 'accounting';

/**
 * YMYL sub-area mapping for 'legal-high-complexity' sector.
 * Maps SectorType 'legal-high-complexity' + free-text hint → geo-aeo-2026 sub-area.
 * Used by prompt builders to route to the correct YMYL block.
 */
export const LEGAL_HIGH_COMPLEXITY_SUBAREAS = {
  criminal_empresarial: {
    label: 'Penal Empresarial / Colarinho Branco',
    schema: 'LegalService+Attorney+TechArticle+FAQPage+Legislation',
    keywords: ['penal empresarial', 'colarinho branco', 'busca e apreensão', 'condução coercitiva'],
  },
  ordem_economica_tributaria: {
    label: 'Tributário / Ordem Econômica',
    schema: 'LegalService+Attorney+TechArticle+FAQPage+Legislation',
    keywords: ['tributário', 'sonegação', 'crime tributário', 'lei 8137', 'ordem econômica'],
  },
  fraudes_icms: {
    label: 'ICMS / Autuações Fiscais',
    schema: 'LegalService+Attorney+TechArticle+FAQPage+Legislation',
    keywords: ['icms', 'sefaz', 'autuação fiscal', 'kandir'],
  },
  assessoria_isp: {
    label: 'Digital / ISPs / LGPD',
    schema: 'LegalService+Attorney+TechArticle+FAQPage+Legislation',
    keywords: ['isp', 'provedor', 'marco civil', 'lgpd', 'anatel'],
  },
  lavagem_dinheiro: {
    label: 'Lavagem de Dinheiro',
    schema: 'LegalService+Attorney+TechArticle+FAQPage+Legislation',
    keywords: ['lavagem', 'coaf', 'ocultação de bens'],
  },
  audiencia_custodia: {
    label: 'Audiência de Custódia (Urgência 24/7)',
    schema: 'LegalService+Attorney+TechArticle+FAQPage+Legislation+LocalBusiness',
    keywords: ['audiência de custódia', 'flagrante', 'plantão criminal'],
  },
} as const;

export type LegalHighComplexitySubArea = keyof typeof LEGAL_HIGH_COMPLEXITY_SUBAREAS;

/**
 * Resolve sub-area from free-text (keyword+title) for 'legal-high-complexity' sector.
 * Returns null when no sub-area matches so callers can fall back to 'generico'.
 */
export function resolveLegalHighComplexitySubArea(text: string): LegalHighComplexitySubArea | null {
  const t = (text || '').toLowerCase();
  for (const [area, cfg] of Object.entries(LEGAL_HIGH_COMPLEXITY_SUBAREAS)) {
    if (cfg.keywords.some((k) => t.includes(k))) return area as LegalHighComplexitySubArea;
  }
  return null;
}

export interface SectorConfig {
  sector: SectorType;
  displayName: string;
  complianceLevel: 'strict' | 'moderate' | 'light';
  complianceBody?: string;
  
  // Conversion
  primaryCTA: string;
  secondaryCTAs: string[];
  forbiddenWords: string[];
  requiredDisclaimer?: string;
  
  // Tone
  tone: 'formal' | 'consultive' | 'empathetic' | 'motivational';
  pronounUsage: 'nos' | 'voce' | 'terceira';
  
  // Structure
  openingStyle: 'problem' | 'statistic' | 'question' | 'story';
  closingStyle: 'urgency' | 'summary' | 'transformation';
  
  // AI preference
  preferredAI: 'gemini' | 'openai' | 'anthropic';
  
  // Conversion strategy prompts
  conversionTechniques: string[];
  exampleOpening: string;
}

export const SECTOR_CONFIGS: Record<SectorType, SectorConfig> = {
  legal: {
    sector: 'legal',
    displayName: 'Advocacia',
    complianceLevel: 'strict',
    complianceBody: 'OAB',
    primaryCTA: 'Agende sua consulta jurídica',
    secondaryCTAs: [
      'Fale com um advogado especializado',
      'Solicite análise do seu caso',
      'Tire suas dúvidas com nossa equipe',
    ],
    forbiddenWords: ['garantimos', 'certeza de ganho', 'vitória garantida', 'preço', 'valor', 'promoção', 'desconto', 'melhor advogado', 'somos os melhores'],
    requiredDisclaimer: 'Este conteúdo tem caráter informativo e não substitui consultoria jurídica especializada. Cada caso possui particularidades que exigem análise individualizada.',
    tone: 'formal',
    pronounUsage: 'nos',
    openingStyle: 'statistic',
    closingStyle: 'urgency',
    preferredAI: 'anthropic',
    conversionTechniques: [
      'Autoridade sem arrogância: "Em mais de [X] anos atuando em [área], nossa equipe já analisou centenas de casos semelhantes ao seu."',
      'Urgência Ética: "O prazo para [ação] é de [X dias/anos]. Quanto antes você buscar orientação, mais opções terá."',
      'Remoção de objeções: "Muitos clientes nos procuram preocupados com custos. Por isso, oferecemos uma análise inicial para você entender sua situação antes de qualquer compromisso."',
      'Prova social: "Nosso escritório atende clientes em [X] estados, com especialização reconhecida em [área]."',
    ],
    exampleOpening: 'A cada hora, mais de 100 trabalhadores brasileiros são demitidos sem receber todos os seus direitos. Você pode ser um deles.\n\nSe você foi demitido recentemente – ou está prestes a ser – provavelmente está se perguntando: recebi tudo que me era devido?',
  },

  'legal-high-complexity': {
    sector: 'legal-high-complexity',
    displayName: 'Advocacia — Alta Complexidade (Penal Empresarial / Tributário / Digital)',
    complianceLevel: 'strict',
    complianceBody: 'OAB',
    primaryCTA: 'Agende análise sigilosa com o Dr. Rândalos Madeira',
    secondaryCTAs: [
      'Solicite parecer técnico especializado',
      'Fale com defesa criminal empresarial',
      'Atendimento 24h para audiência de custódia',
    ],
    forbiddenWords: [
      'garantimos', 'certeza de ganho', 'arquivamento garantido', 'absolvição garantida',
      'preço', 'valor', 'honorário', 'promoção', 'desconto', 'melhor advogado', 'somos os melhores',
    ],
    requiredDisclaimer: 'Este conteúdo é informativo e não substitui consulta jurídica individualizada. Casos de alta complexidade (penal empresarial, tributário, ISPs, LGPD) exigem análise sigilosa caso a caso.',
    tone: 'formal',
    pronounUsage: 'nos',
    openingStyle: 'statistic',
    closingStyle: 'urgency',
    preferredAI: 'anthropic',
    conversionTechniques: [
      'Autoridade técnica: cite base legal + tribunal + ano em cada tese apresentada.',
      'Sigilo institucional: reforce a proteção da imagem e do patrimônio do cliente empresarial.',
      'Urgência ética: prazos decadenciais/prescricionais de operações fiscais e criminais empresariais.',
      'Prova social anonimizada: casos sem valor de causa, sem identificação de cliente, seguindo OAB 205/2021.',
    ],
    exampleOpening: 'Empresários alvos de operação de busca e apreensão têm entre 24 e 72 horas para estruturar defesa técnica antes de decisões cautelares (CPP arts. 240-250). Neste guia, os passos jurídicos imediatos para preservar patrimônio e reputação em São Paulo.',
  },



  marketing_digital: {
    sector: 'marketing_digital',
    displayName: 'Marketing Digital',
    complianceLevel: 'light',
    primaryCTA: 'Solicite diagnóstico gratuito',
    secondaryCTAs: [
      'Agende uma análise sem compromisso',
      'Descubra quanto está perdendo',
      'Veja cases do seu setor',
    ],
    forbiddenWords: ['primeira página garantida', 'resultados imediatos', 'fique rico', 'dinheiro fácil'],
    tone: 'consultive',
    pronounUsage: 'nos',
    openingStyle: 'problem',
    closingStyle: 'summary',
    preferredAI: 'openai',
    conversionTechniques: [
      'ROI tangível: "Para um escritório que investe R$ 3.000/mês em Google Ads bem otimizado, conseguimos em média 40-60 leads qualificados."',
      'Case compacto: "Cliente: Clínica de estética em SP. Resultado em 6 meses: 3.200 visitas/mês, 180 agendamentos, ROI de 8x."',
      'Remoção de objeção (preço): "Marketing digital não é custo, é investimento com retorno mensurável."',
      'Transparência: "SEO não é mágica. Resultados sólidos começam entre 3-6 meses. Quem promete em 30 dias está mentindo."',
    ],
    exampleOpening: 'Você já jogou dinheiro fora com marketing digital? Se a resposta é sim, você está na maioria.\n\nUma pesquisa recente mostrou que 67% das pequenas empresas brasileiras já contrataram serviços de marketing digital e ficaram insatisfeitas.',
  },

  beauty_aesthetics: {
    sector: 'beauty_aesthetics',
    displayName: 'Beleza e Estética',
    complianceLevel: 'moderate',
    complianceBody: 'ANVISA/CRM',
    primaryCTA: 'Agende sua avaliação gratuita',
    secondaryCTAs: [
      'Conheça nosso espaço',
      'Fale com nossa especialista',
      'Descubra o procedimento ideal para você',
    ],
    forbiddenWords: ['garantia de resultado', 'antes e depois', 'preço', 'promoção', 'milagre'],
    requiredDisclaimer: 'Resultados podem variar de pessoa para pessoa. Procedimentos estéticos requerem avaliação profissional.',
    tone: 'empathetic',
    pronounUsage: 'voce',
    openingStyle: 'question',
    closingStyle: 'transformation',
    preferredAI: 'anthropic',
    conversionTechniques: [
      'Emoção + Segurança: "Sabemos que dar o primeiro passo pode gerar ansiedade. Por isso, nossa avaliação inicial é uma conversa sem compromisso."',
      'Prova social: "Mais de [X] procedimentos realizados com índice de satisfação de [X]%."',
      'Remoção de medo: "Muitas pacientes chegam preocupadas com resultado artificial. Nossa especialidade é justamente o resultado natural."',
      'Foco em transformação (não procedimento): "Imagine acordar, olhar no espelho, e ver a versão de você que se sente mais confiante."',
    ],
    exampleOpening: 'Você já deixou de ir a um evento porque não se sentia bem com sua aparência? Já evitou fotos porque não gostava do que via?\n\nVocê não está sozinha. Milhões de mulheres brasileiras sentem a mesma insegurança.',
  },

  health_general: {
    sector: 'health_general',
    displayName: 'Saúde Geral',
    complianceLevel: 'strict',
    complianceBody: 'CFM',
    primaryCTA: 'Agende sua consulta',
    secondaryCTAs: [
      'Faça seu check-up preventivo',
      'Fale com um especialista',
      'Avaliação sem compromisso',
    ],
    forbiddenWords: ['cura garantida', 'preço', 'valor', 'mais barato', 'resultado certo'],
    requiredDisclaimer: 'Este conteúdo é informativo e NÃO substitui consulta médica. Sempre procure um profissional de saúde para diagnóstico e tratamento.',
    tone: 'empathetic',
    pronounUsage: 'voce',
    openingStyle: 'problem',
    closingStyle: 'urgency',
    preferredAI: 'anthropic',
    conversionTechniques: [
      'Empatia: "Sabemos que marcar uma consulta pode parecer um passo grande. Por isso, nossa equipe está pronta para tirar suas dúvidas antes mesmo do agendamento."',
      'Prova social: "Clínica referência em [região] com mais de [X] pacientes atendidos."',
      'Autoridade: "Com mais de [X] anos de experiência, Dr./Dra. [Nome] já atendeu milhares de pacientes."',
    ],
    exampleOpening: 'Se você sente [sintoma] há semanas e está adiando uma consulta, saiba que não está sozinho — mas também que a espera pode custar caro.\n\nNeste guia, vamos explicar quando é hora de procurar ajuda profissional.',
  },

  health_dental: {
    sector: 'health_dental',
    displayName: 'Odontologia',
    complianceLevel: 'strict',
    complianceBody: 'CRO',
    primaryCTA: 'Agende sua avaliação',
    secondaryCTAs: [
      'Conheça nosso consultório',
      'Primeira consulta com condição especial',
      'Tire suas dúvidas',
    ],
    forbiddenWords: ['preço', 'valor', 'mais barato', 'garantia', 'resultado certo'],
    requiredDisclaimer: 'Este conteúdo é informativo e não substitui consulta odontológica.',
    tone: 'empathetic',
    pronounUsage: 'voce',
    openingStyle: 'question',
    closingStyle: 'transformation',
    preferredAI: 'anthropic',
    conversionTechniques: [
      'Remoção de medo: "Medo de dentista? Você não está sozinho — 60% dos brasileiros têm essa preocupação. Nossa equipe é treinada para atendimento humanizado."',
      'Transformação: "Imagine poder sorrir sem preocupação em todas as fotos."',
      'Empatia: "Entendemos que cuidar da saúde bucal pode parecer intimidador. Por isso, tornamos cada visita o mais confortável possível."',
    ],
    exampleOpening: 'Quando foi a última vez que você sorriu sem pensar duas vezes?\n\nSe a resposta demorou a vir, você faz parte dos milhões de brasileiros que evitam sorrir por vergonha dos dentes.',
  },

  health_physiotherapy: {
    sector: 'health_physiotherapy',
    displayName: 'Fisioterapia',
    complianceLevel: 'moderate',
    complianceBody: 'COFFITO',
    primaryCTA: 'Agende avaliação postural',
    secondaryCTAs: [
      'Primeira sessão com condição especial',
      'Descubra o tratamento ideal para você',
      'Fale com um fisioterapeuta',
    ],
    forbiddenWords: ['cura milagrosa', 'resultado imediato', 'preço'],
    requiredDisclaimer: 'Este conteúdo é informativo e não substitui avaliação fisioterapêutica profissional.',
    tone: 'motivational',
    pronounUsage: 'voce',
    openingStyle: 'problem',
    closingStyle: 'transformation',
    preferredAI: 'openai',
    conversionTechniques: [
      'Motivação: "Cada sessão é um passo mais perto de voltar a fazer o que você ama."',
      'Empatia: "Sabemos como a dor limita sua rotina. Estamos aqui para ajudar você a recuperar sua qualidade de vida."',
      'Prova social: "Mais de [X] pacientes já recuperaram mobilidade e qualidade de vida com nossos tratamentos."',
    ],
    exampleOpening: 'Acordar com dor não deveria ser normal. Mas para milhões de brasileiros, é a realidade de cada manhã.\n\nSe você sente dores que limitam suas atividades, este guia vai mostrar como a fisioterapia pode transformar sua qualidade de vida.',
  },

  health_medical: {
    sector: 'health_medical',
    displayName: 'Medicina Especializada',
    complianceLevel: 'strict',
    complianceBody: 'CFM',
    primaryCTA: 'Agende sua consulta com especialista',
    secondaryCTAs: [
      'Check-up preventivo',
      'Avaliação personalizada',
      'Fale com nossa equipe médica',
    ],
    forbiddenWords: ['cura', 'garantia', 'melhor médico', 'preço', 'desconto'],
    requiredDisclaimer: 'Este conteúdo é informativo e não substitui avaliação, diagnóstico ou tratamento médico. Consulte sempre um profissional de saúde.',
    tone: 'empathetic',
    pronounUsage: 'voce',
    openingStyle: 'statistic',
    closingStyle: 'urgency',
    preferredAI: 'anthropic',
    conversionTechniques: [
      'Autoridade + Empatia: "Com mais de [X] anos de experiência, entendemos: você não é um diagnóstico, é uma pessoa."',
      'Prevenção: "Um check-up preventivo pode identificar problemas antes que se tornem graves — e mais caros."',
      'Urgência ética: "Quanto mais cedo o diagnóstico, mais opções de tratamento e melhores os resultados."',
    ],
    exampleOpening: 'Segundo dados do Ministério da Saúde, 1 em cada 4 brasileiros deixa de procurar ajuda médica até que o problema se agrave.\n\nSe você está sentindo [sintoma] e adiando a consulta, este guia vai mostrar por que agir agora pode fazer toda a diferença.',
  },

  real_estate: {
    sector: 'real_estate',
    displayName: 'Imobiliária / Corretor',
    complianceLevel: 'moderate',
    complianceBody: 'CRECI',
    primaryCTA: 'Agende uma visita',
    secondaryCTAs: [
      'Simule seu financiamento',
      'Receba imóveis do seu perfil',
      'Fale com um corretor especializado',
    ],
    forbiddenWords: ['valorização garantida', 'investimento sem risco', 'melhor negócio do mundo'],
    tone: 'consultive',
    pronounUsage: 'voce',
    openingStyle: 'story',
    closingStyle: 'urgency',
    preferredAI: 'openai',
    conversionTechniques: [
      'Dados de mercado: "A [região] valorizou 23% nos últimos 2 anos. Imóveis bem localizados estão saindo em menos de 30 dias."',
      'Visualização: "Imagine tomar seu café da manhã olhando para [vista]. Isso pode ser sua realidade."',
      'Remoção de objeções: "Preocupado com a burocracia? Nossa equipe cuida de toda documentação."',
      'Investimento + Sonho: "Mais do que um imóvel, você está escolhendo onde vai criar memórias com sua família."',
    ],
    exampleOpening: 'Você já parou pra pensar quanto tempo da sua vida passa dentro de casa? É onde você descansa, cria seus filhos, compartilha momentos com quem ama.\n\nPor isso, encontrar o imóvel certo não é só uma decisão financeira. É uma decisão de vida.',
  },

  accounting: {
    sector: 'accounting',
    displayName: 'Contabilidade',
    complianceLevel: 'moderate',
    complianceBody: 'CRC',
    primaryCTA: 'Solicite diagnóstico fiscal gratuito',
    secondaryCTAs: [
      'Descubra quanto pode economizar',
      'Fale com um contador especializado no seu setor',
      'Migre sua contabilidade sem dor de cabeça',
    ],
    forbiddenWords: ['sonegação', 'jeitinho', 'garantia de economia'],
    requiredDisclaimer: 'Este conteúdo é informativo e não substitui consultoria contábil especializada para seu caso específico.',
    tone: 'consultive',
    pronounUsage: 'voce',
    openingStyle: 'statistic',
    closingStyle: 'summary',
    preferredAI: 'openai',
    conversionTechniques: [
      'Dor financeira: "Uma empresa no Simples Nacional que fatura R$ 50.000/mês pode economizar até R$ 15.000/ano com planejamento tributário correto."',
      'Remoção de objeções: "Trocar de contador parece complicado? Cuidamos de toda a transição. Você não precisa fazer nada."',
      'Segurança: "Fique tranquilo com o Fisco. Nossa equipe monitora todas as obrigações e prazos para você."',
      'Economia tangível: "A pergunta certa não é \'quanto custa?\' mas \'quanto estou perdendo por não ter contabilidade estratégica?\'"',
    ],
    exampleOpening: 'Você está pagando mais impostos do que deveria?\n\nA maioria dos empresários brasileiros está — e nem sabe. Entre regime tributário errado, benefícios fiscais não utilizados e erros de classificação, sua empresa pode estar perdendo milhares de reais todos os anos.',
  },
};

/**
 * Map legacy segment names to SectorType
 */
export function mapSegmentToSector(segment: string): SectorType | null {
  const mapping: Record<string, SectorType> = {
    'legal': 'legal',
    'health': 'health_general',
    'fintech': 'accounting',
    'ecommerce': 'marketing_digital',
    'b2b-saas': 'marketing_digital',
    'education': 'marketing_digital',
    'general': 'marketing_digital',
    // Direct mappings
    'marketing_digital': 'marketing_digital',
    'beauty_aesthetics': 'beauty_aesthetics',
    'health_general': 'health_general',
    'health_dental': 'health_dental',
    'health_physiotherapy': 'health_physiotherapy',
    'health_medical': 'health_medical',
    'real_estate': 'real_estate',
    'accounting': 'accounting',
  };
  return mapping[segment] || null;
}

/**
 * Build sector-specific prompt section for article generation
 */
export function buildSectorPromptSection(sectorConfig: SectorConfig): string {
  let prompt = `\n## 🏢 DIRETRIZES DO SETOR: ${sectorConfig.displayName.toUpperCase()}\n\n`;
  
  // Compliance
  if (sectorConfig.complianceBody) {
    prompt += `### Compliance ${sectorConfig.complianceBody} (${sectorConfig.complianceLevel === 'strict' ? 'RIGOROSO' : 'MODERADO'})\n`;
  }
  
  prompt += `**Palavras/Expressões PROIBIDAS:**\n`;
  sectorConfig.forbiddenWords.forEach(w => { prompt += `- ❌ "${w}"\n`; });
  
  if (sectorConfig.requiredDisclaimer) {
    prompt += `\n**Disclaimer OBRIGATÓRIO (incluir no final):**\n"${sectorConfig.requiredDisclaimer}"\n`;
  }
  
  // CTAs
  prompt += `\n### CTAs Aprovados\n`;
  prompt += `- **Principal:** "${sectorConfig.primaryCTA}"\n`;
  sectorConfig.secondaryCTAs.forEach(cta => { prompt += `- "${cta}"\n`; });
  
  // Conversion techniques
  prompt += `\n### Técnicas de Conversão (USAR NO CONTEÚDO)\n`;
  sectorConfig.conversionTechniques.forEach((t, i) => { prompt += `${i + 1}. ${t}\n`; });
  
  // Writing style
  prompt += `\n### Estilo de Escrita\n`;
  prompt += `- **Tom:** ${sectorConfig.tone}\n`;
  prompt += `- **Abertura ideal:** ${sectorConfig.openingStyle}\n`;
  prompt += `- **Fechamento ideal:** ${sectorConfig.closingStyle}\n`;
  
  // Example
  if (sectorConfig.exampleOpening) {
    prompt += `\n### Exemplo de Abertura (Referência)\n`;
    prompt += `"${sectorConfig.exampleOpening}"\n`;
  }
  
  // Conversion structure
  prompt += `\n### Estrutura de Conversão OBRIGATÓRIA\n`;
  prompt += `1. **ABERTURA** (2 parágrafos): Gancho emocional/estatística → Validação do problema → Promessa\n`;
  prompt += `2. **DESENVOLVIMENTO**: Cada H2 resolve UMA dor específica. Inclua micro-CTAs após resolver cada dor.\n`;
  prompt += `3. **FECHAMENTO**: Resumo de benefícios → Urgência ética → CTA principal → Múltiplos canais de contato\n`;
  
  prompt += `\n### PROIBIÇÕES DE ESCRITA\n`;
  prompt += `- Começar com "Neste artigo vamos falar sobre..."\n`;
  prompt += `- Parágrafos maiores que 4 linhas\n`;
  prompt += `- Seções sem propósito de conversão\n`;
  prompt += `- CTAs genéricos ("Entre em contato")\n`;
  prompt += `- Linguagem passiva demais\n`;
  
  return prompt;
}
