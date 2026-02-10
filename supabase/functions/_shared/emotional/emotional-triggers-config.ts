/**
 * SISTEMA DE GATILHOS EMOCIONAIS PARA GERAÇÃO DE IMAGENS
 * ContentFactory RDM - Grupo SEO Marketing
 * 
 * Este módulo define os gatilhos emocionais e configurações
 * para geração de imagens caricatura/conceituais baseadas no tom da notícia.
 */

// ============================================
// TIPOS E INTERFACES
// ============================================

export type EmotionalTrigger = 
  | 'serious'      // Sério - notícias graves, decisões judiciais, mortes
  | 'humor'        // Humor - fatos curiosos, gafes, situações cômicas
  | 'concern'      // Preocupação - alertas, riscos, ameaças
  | 'outrage'      // Revolta/Indignação - injustiças, escândalos, corrupção
  | 'anguish'      // Angústia - tragédias, perdas, crises humanitárias
  | 'sarcasm'      // Sarcasmo - ironias políticas, contradições
  | 'satire'       // Sátira - crítica social e política através do humor
  | 'happiness'    // Felicidade - conquistas, vitórias, boas notícias
  | 'celebration'  // Comemoração - eventos festivos, marcos históricos
  | 'doubt'        // Dúvidas/Incertezas - especulações, teorias
  | 'mystery';     // Mistério - casos sem resposta, enigmas

export type ImageStyle = 
  | 'photorealistic'  // Fotografia realista
  | 'caricature'      // Caricatura editorial
  | 'cartoon'         // Cartoon estilizado
  | 'conceptual'      // Arte conceitual
  | 'dramatic';       // Fotografia dramática

export interface EmotionalAnalysis {
  primaryTrigger: EmotionalTrigger;
  confidence: number;                     // 0-1
  secondaryTriggers: EmotionalTrigger[];
  suggestedStyle: ImageStyle;
  toneKeywords: string[];
  emotionalIntensity: 'low' | 'medium' | 'high';
  reasoning?: string;
}

export interface ImageDecision {
  action: 'reuse_original' | 'create_caricature' | 'create_conceptual' | 'generate_new';
  reason: string;
  originalImageUrl?: string;
  style: ImageStyle;
  trigger: EmotionalTrigger;
}

export interface CaricaturePrompt {
  basePrompt: string;
  styleModifiers: string[];
  emotionalElements: string[];
  colorPalette: string[];
  composition: string;
  restrictions: string[];
}

export interface TriggerConfig {
  label: string;
  labelPtBr: string;
  description: string;
  suggestedStyle: ImageStyle;
  colorPalette: string[];
  visualElements: string[];
  promptModifiers: string[];
  headlines: string[];           // Palavras típicas em manchetes
  vocabularyTone: string[];      // Tom do vocabulário
  ctaStyle: string;              // Estilo de CTA apropriado
  negativePrompts: string[];     // O que evitar na imagem
}

// ============================================
// CONFIGURAÇÃO COMPLETA DOS GATILHOS
// ============================================

export const EMOTIONAL_TRIGGER_CONFIG: Record<EmotionalTrigger, TriggerConfig> = {
  
  serious: {
    label: 'Serious',
    labelPtBr: 'Sério',
    description: 'Notícias graves, decisões importantes, falecimentos, questões sensíveis',
    suggestedStyle: 'photorealistic',
    colorPalette: ['#2C3E50', '#34495E', '#7F8C8D', '#BDC3C7', '#ECF0F1'],
    visualElements: [
      'composição sóbria e equilibrada',
      'iluminação natural neutra',
      'fundo limpo e profissional',
      'sem elementos decorativos extravagantes',
      'foco central no assunto principal',
      'atmosfera de respeito e gravidade'
    ],
    promptModifiers: [
      'fotografia jornalística profissional',
      'estilo documental de alta qualidade',
      'tons neutros e sóbrios',
      'composição respeitosa e equilibrada',
      'iluminação natural suave',
      'sem elementos que distraiam'
    ],
    headlines: [
      'morre', 'falece', 'morte', 'óbito', 'decide', 'determina', 
      'condena', 'proíbe', 'anuncia', 'confirma', 'oficializa',
      'sentença', 'julgamento', 'tribunal', 'supremo'
    ],
    vocabularyTone: ['formal', 'respeitoso', 'objetivo', 'preciso', 'sóbrio'],
    ctaStyle: 'Saiba mais sobre este importante acontecimento',
    negativePrompts: [
      'humor', 'cores vibrantes', 'elementos cartoon', 
      'exagero', 'sarcasmo', 'ironia visual'
    ]
  },

  humor: {
    label: 'Humor',
    labelPtBr: 'Humor',
    description: 'Fatos curiosos, gafes, situações cômicas, virais engraçados',
    suggestedStyle: 'caricature',
    colorPalette: ['#F39C12', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#FF6B6B'],
    visualElements: [
      'exagero de expressões faciais',
      'proporções distorcidas humorísticas',
      'elementos cartoon coloridos',
      'cores vibrantes e saturadas',
      'composição dinâmica e divertida',
      'elementos de surpresa visual'
    ],
    promptModifiers: [
      'caricatura editorial cômica de alta qualidade',
      'estilo cartoon humorístico brasileiro',
      'expressões exageradas e engraçadas',
      'cores vivas e alegres',
      'elementos de humor visual inteligente',
      'proporções exageradas para efeito cômico'
    ],
    headlines: [
      'hilário', 'inacreditável', 'bizarro', 'curioso', 'gafe', 
      'viraliza', 'meme', 'inesperado', 'surpreende', 'trapalhada',
      'confusão', 'engano', 'troca'
    ],
    vocabularyTone: ['leve', 'descontraído', 'irônico', 'bem-humorado', 'espirituoso'],
    ctaStyle: 'Você não vai acreditar no que aconteceu!',
    negativePrompts: [
      'tom sério', 'cores escuras', 'atmosfera pesada',
      'realismo fotográfico', 'composição rígida'
    ]
  },

  concern: {
    label: 'Concern',
    labelPtBr: 'Preocupação',
    description: 'Alertas de segurança, riscos à saúde, ameaças, avisos importantes',
    suggestedStyle: 'dramatic',
    colorPalette: ['#E67E22', '#D35400', '#C0392B', '#7F8C8D', '#2C3E50', '#F39C12'],
    visualElements: [
      'iluminação dramática com sombras marcantes',
      'tons quentes de alerta (laranja/amarelo)',
      'composição que transmite tensão',
      'foco em elementos de risco ou perigo',
      'atmosfera de urgência',
      'elementos simbólicos de atenção'
    ],
    promptModifiers: [
      'fotografia dramática de alerta',
      'iluminação que transmite urgência',
      'tons de aviso predominantes (laranja/amarelo)',
      'composição tensa e impactante',
      'atmosfera de preocupação genuína',
      'elementos que chamam atenção para o risco'
    ],
    headlines: [
      'alerta', 'risco', 'perigo', 'ameaça', 'cuidado', 'aviso',
      'preocupa', 'pode causar', 'evite', 'atenção', 'urgente',
      'emergência', 'crise', 'colapso'
    ],
    vocabularyTone: ['urgente', 'cauteloso', 'preventivo', 'informativo', 'direto'],
    ctaStyle: 'Proteja-se: veja o que você precisa saber',
    negativePrompts: [
      'alegria', 'celebração', 'cores festivas',
      'atmosfera relaxada', 'elementos de humor'
    ]
  },

  outrage: {
    label: 'Outrage',
    labelPtBr: 'Revolta / Indignação',
    description: 'Injustiças, escândalos de corrupção, abusos de poder, fraudes',
    suggestedStyle: 'caricature',
    colorPalette: ['#C0392B', '#E74C3C', '#2C3E50', '#1A1A2E', '#FF6B6B', '#8B0000'],
    visualElements: [
      'caricatura com exagero dramático',
      'expressões de indignação ou ganância',
      'elementos simbólicos de injustiça ou corrupção',
      'vermelho como cor dominante',
      'contraste forte entre luz e sombra',
      'símbolos de poder corrupto'
    ],
    promptModifiers: [
      'caricatura política editorial contundente',
      'estilo de charge jornalística indignada',
      'cores fortes com vermelho dominante',
      'expressões de revolta ou ganância exageradas',
      'símbolos visuais de corrupção ou injustiça',
      'composição dramática e impactante'
    ],
    headlines: [
      'escândalo', 'corrupção', 'absurdo', 'vergonha', 'denuncia',
      'acusa', 'fraude', 'desvio', 'propina', 'irregular',
      'abuso', 'crime', 'prisão', 'investigação'
    ],
    vocabularyTone: ['contundente', 'crítico', 'denunciativo', 'enfático', 'indignado'],
    ctaStyle: 'Entenda o escândalo que revolta o país',
    negativePrompts: [
      'tom neutro', 'cores pastéis', 'atmosfera calma',
      'celebração', 'felicidade', 'otimismo'
    ]
  },

  anguish: {
    label: 'Anguish',
    labelPtBr: 'Angústia',
    description: 'Tragédias, perdas humanas, crises humanitárias, desastres naturais',
    suggestedStyle: 'dramatic',
    colorPalette: ['#2C3E50', '#34495E', '#5D6D7E', '#85929E', '#AEB6BF', '#1A1A2E'],
    visualElements: [
      'tons frios e melancólicos (azul/cinza)',
      'iluminação suave e difusa',
      'composição que transmite vazio ou perda',
      'expressões de tristeza ou contemplação',
      'atmosfera reflexiva e respeitosa',
      'elementos que sugerem ausência'
    ],
    promptModifiers: [
      'fotografia emocional dramática',
      'tons frios predominantes (azul/cinza)',
      'iluminação melancólica e suave',
      'composição contemplativa',
      'atmosfera de luto ou tristeza respeitosa',
      'sem exploração sensacionalista'
    ],
    headlines: [
      'tragédia', 'vítimas', 'luto', 'desastre', 'crise', 'drama',
      'sofrimento', 'mortos', 'feridos', 'destruição', 'colapso',
      'perdas', 'catástrofe', 'calamidade'
    ],
    vocabularyTone: ['empático', 'respeitoso', 'solidário', 'sensível', 'cuidadoso'],
    ctaStyle: 'Saiba como ajudar as vítimas',
    negativePrompts: [
      'humor', 'cores vibrantes', 'celebração',
      'sensacionalismo', 'exploração do sofrimento'
    ]
  },

  sarcasm: {
    label: 'Sarcasm',
    labelPtBr: 'Sarcasmo',
    description: 'Ironias políticas, contradições evidentes, hipocrisia exposta',
    suggestedStyle: 'caricature',
    colorPalette: ['#9B59B6', '#8E44AD', '#3498DB', '#E74C3C', '#F39C12', '#2C3E50'],
    visualElements: [
      'caricatura com ironia visual clara',
      'elementos de contradição lado a lado',
      'expressões cínicas ou debochadas',
      'símbolos de hipocrisia',
      'composição que expõe absurdos',
      'justaposição de elementos contraditórios'
    ],
    promptModifiers: [
      'caricatura editorial sarcástica inteligente',
      'estilo irônico e cínico de charge',
      'elementos visuais que expõem contradições',
      'expressões de deboche visual sutil',
      'símbolos de hipocrisia política',
      'composição que destaca o absurdo'
    ],
    headlines: [
      'ironia', 'contradição', 'promete mas', 'diz uma coisa',
      'ao contrário', 'enquanto isso', 'hipócrita', 'mentira',
      'fake', 'desmente', 'nega'
    ],
    vocabularyTone: ['irônico', 'cínico', 'perspicaz', 'mordaz', 'sagaz'],
    ctaStyle: 'A ironia que ninguém esperava ver',
    negativePrompts: [
      'tom sério', 'neutralidade', 'sem opinião',
      'realismo puro', 'composição conservadora'
    ]
  },

  satire: {
    label: 'Satire',
    labelPtBr: 'Sátira',
    description: 'Crítica social e política inteligente através do humor',
    suggestedStyle: 'cartoon',
    colorPalette: ['#2ECC71', '#3498DB', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C'],
    visualElements: [
      'estilo editorial de charge clássica',
      'símbolos políticos exagerados',
      'metáforas visuais claras e inteligentes',
      'elementos de crítica social',
      'composição de revista ou jornal',
      'estilo de cartunista político'
    ],
    promptModifiers: [
      'charge política editorial de alta qualidade',
      'estilo de cartunista de jornal renomado',
      'metáforas visuais de crítica social',
      'símbolos políticos estilizados',
      'composição de sátira clássica brasileira',
      'estilo inteligente e perspicaz'
    ],
    headlines: [
      'enquanto isso', 'governo', 'político', 'eleição',
      'decisão polêmica', 'congresso', 'senado', 'câmara',
      'ministro', 'presidente', 'oposição'
    ],
    vocabularyTone: ['satírico', 'crítico', 'perspicaz', 'inteligente', 'provocativo'],
    ctaStyle: 'A charge que resume a situação política',
    negativePrompts: [
      'realismo', 'neutralidade', 'sem opinião',
      'tom institucional', 'propaganda'
    ]
  },

  happiness: {
    label: 'Happiness',
    labelPtBr: 'Felicidade',
    description: 'Conquistas pessoais e coletivas, vitórias, boas notícias, superação',
    suggestedStyle: 'photorealistic',
    colorPalette: ['#F1C40F', '#F39C12', '#E67E22', '#27AE60', '#3498DB', '#FF6B6B'],
    visualElements: [
      'iluminação brilhante e otimista',
      'cores quentes e vibrantes',
      'expressões genuínas de alegria',
      'composição expansiva e aberta',
      'elementos de sucesso e conquista',
      'atmosfera de celebração contida'
    ],
    promptModifiers: [
      'fotografia vibrante e otimista',
      'iluminação dourada de sucesso',
      'cores quentes e alegres',
      'expressões de vitória e felicidade',
      'atmosfera de conquista',
      'composição que transmite realização'
    ],
    headlines: [
      'conquista', 'vitória', 'sucesso', 'aprovado', 'recorde',
      'histórico', 'inédito', 'supera', 'alcança', 'ganha',
      'vence', 'campeão', 'medalha'
    ],
    vocabularyTone: ['otimista', 'entusiasmado', 'comemorativo', 'positivo', 'inspirador'],
    ctaStyle: 'Celebre essa conquista histórica!',
    negativePrompts: [
      'tom sério', 'cores frias', 'atmosfera melancólica',
      'crítica', 'negatividade'
    ]
  },

  celebration: {
    label: 'Celebration',
    labelPtBr: 'Comemoração',
    description: 'Eventos festivos, aniversários, marcos históricos, celebrações coletivas',
    suggestedStyle: 'photorealistic',
    colorPalette: ['#F1C40F', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#FF69B4'],
    visualElements: [
      'elementos festivos (confetes, balões)',
      'cores vibrantes e festivas',
      'iluminação de celebração',
      'composição alegre e dinâmica',
      'símbolos de festa e união',
      'atmosfera de comemoração coletiva'
    ],
    promptModifiers: [
      'fotografia de celebração festiva',
      'elementos de festa coloridos',
      'confetes e decoração comemorativa',
      'atmosfera de alegria coletiva',
      'iluminação vibrante de evento',
      'composição que transmite união'
    ],
    headlines: [
      'comemora', 'aniversário', 'marca', 'celebra', 'festeja',
      'homenagem', 'jubileu', 'centenário', 'feriado', 'evento',
      'festa', 'carnaval', 'réveillon'
    ],
    vocabularyTone: ['festivo', 'alegre', 'comemorativo', 'entusiasmado', 'vibrante'],
    ctaStyle: 'Participe dessa celebração histórica!',
    negativePrompts: [
      'tom sério', 'cores escuras', 'melancolia',
      'crítica', 'atmosfera pesada'
    ]
  },

  doubt: {
    label: 'Doubt',
    labelPtBr: 'Dúvidas / Incertezas',
    description: 'Especulações, teorias, investigações em andamento, questões em aberto',
    suggestedStyle: 'conceptual',
    colorPalette: ['#7F8C8D', '#95A5A6', '#BDC3C7', '#34495E', '#2C3E50', '#5D6D7E'],
    visualElements: [
      'elementos de interrogação visual',
      'composição ambígua e reflexiva',
      'tons neutros e indefinidos',
      'sombras parciais estratégicas',
      'foco suave em algumas áreas',
      'elementos que sugerem questionamento'
    ],
    promptModifiers: [
      'arte conceitual de questionamento',
      'elementos visuais de dúvida e reflexão',
      'composição ambígua e aberta',
      'tons neutros de incerteza',
      'símbolos de interrogação sutis',
      'atmosfera de investigação'
    ],
    headlines: [
      'pode ser', 'será que', 'investiga', 'suspeita', 'apura',
      'dúvidas', 'incerto', 'não confirmado', 'possível',
      'especula', 'teoria', 'hipótese'
    ],
    vocabularyTone: ['cauteloso', 'questionador', 'analítico', 'ponderado', 'reflexivo'],
    ctaStyle: 'Entenda os fatos e tire suas conclusões',
    negativePrompts: [
      'certeza', 'afirmação categórica', 'cores vibrantes',
      'composição fechada', 'conclusões'
    ]
  },

  mystery: {
    label: 'Mystery',
    labelPtBr: 'Mistério',
    description: 'Casos sem resposta, enigmas, desaparecimentos, fenômenos inexplicados',
    suggestedStyle: 'conceptual',
    colorPalette: ['#1A1A2E', '#16213E', '#0F3460', '#533483', '#2C2C54', '#3D3D6B'],
    visualElements: [
      'sombras profundas e misteriosas',
      'elementos parcialmente ocultos',
      'silhuetas enigmáticas',
      'névoa ou blur intencional',
      'composição que esconde mais do que revela',
      'atmosfera noir ou de suspense'
    ],
    promptModifiers: [
      'arte conceitual de mistério profundo',
      'sombras e silhuetas enigmáticas',
      'elementos parcialmente revelados',
      'atmosfera de suspense noir',
      'composição que sugere o oculto',
      'tons escuros e misteriosos'
    ],
    headlines: [
      'mistério', 'enigma', 'desaparece', 'sem explicação',
      'ninguém sabe', 'caso', 'inexplicável', 'estranho',
      'desconhecido', 'oculto', 'secreto'
    ],
    vocabularyTone: ['intrigante', 'misterioso', 'investigativo', 'suspense', 'enigmático'],
    ctaStyle: 'O mistério que ainda não tem resposta',
    negativePrompts: [
      'clareza', 'cores vibrantes', 'alegria',
      'explicação clara', 'certeza'
    ]
  }
};

// ============================================
// MAPEAMENTO DE PALAVRAS-CHAVE PARA GATILHOS
// ============================================

export const TRIGGER_KEYWORDS: Record<string, EmotionalTrigger[]> = {
  // Sério / Morte
  'morre': ['serious', 'anguish'],
  'falece': ['serious', 'anguish'],
  'morte': ['serious', 'anguish'],
  'óbito': ['serious', 'anguish'],
  'falecimento': ['serious', 'anguish'],
  'luto': ['anguish', 'serious'],
  'velório': ['serious', 'anguish'],
  'funeral': ['serious', 'anguish'],
  
  // Sério / Justiça
  'condena': ['serious', 'outrage'],
  'prisão': ['serious', 'outrage'],
  'sentença': ['serious'],
  'tribunal': ['serious'],
  'supremo': ['serious'],
  'stf': ['serious', 'satire'],
  'stj': ['serious'],
  'justiça': ['serious'],
  'julgamento': ['serious'],
  
  // Humor
  'hilário': ['humor'],
  'bizarro': ['humor', 'mystery'],
  'inacreditável': ['humor', 'outrage'],
  'viraliza': ['humor', 'happiness'],
  'meme': ['humor', 'satire'],
  'gafe': ['humor', 'sarcasm'],
  'trapalhada': ['humor'],
  'confusão': ['humor', 'concern'],
  'engraçado': ['humor'],
  
  // Preocupação / Alerta
  'alerta': ['concern'],
  'risco': ['concern'],
  'perigo': ['concern', 'anguish'],
  'ameaça': ['concern', 'outrage'],
  'cuidado': ['concern'],
  'urgente': ['concern', 'serious'],
  'emergência': ['concern', 'anguish'],
  'crise': ['concern', 'anguish'],
  'colapso': ['concern', 'anguish'],
  
  // Revolta / Escândalo
  'escândalo': ['outrage'],
  'corrupção': ['outrage', 'satire'],
  'fraude': ['outrage'],
  'absurdo': ['outrage', 'sarcasm'],
  'vergonha': ['outrage'],
  'denúncia': ['outrage', 'serious'],
  'propina': ['outrage'],
  'desvio': ['outrage'],
  'irregular': ['outrage', 'concern'],
  'abuso': ['outrage', 'anguish'],
  
  // Tragédia / Angústia
  'tragédia': ['anguish'],
  'vítimas': ['anguish', 'concern'],
  'desastre': ['anguish', 'concern'],
  'catástrofe': ['anguish'],
  'sofrimento': ['anguish'],
  'destruição': ['anguish', 'concern'],
  
  // Felicidade / Vitória
  'vitória': ['happiness', 'celebration'],
  'conquista': ['happiness'],
  'recorde': ['happiness', 'celebration'],
  'sucesso': ['happiness'],
  'aprovado': ['happiness'],
  'campeão': ['happiness', 'celebration'],
  'medalha': ['happiness', 'celebration'],
  'ouro': ['happiness', 'celebration'],
  
  // Celebração
  'comemora': ['celebration'],
  'celebra': ['celebration'],
  'festa': ['celebration'],
  'aniversário': ['celebration'],
  'jubileu': ['celebration'],
  'carnaval': ['celebration', 'humor'],
  
  // Ironia / Sarcasmo
  'ironia': ['sarcasm'],
  'contradição': ['sarcasm'],
  'hipócrita': ['sarcasm', 'outrage'],
  'mentira': ['sarcasm', 'outrage'],
  'fake': ['sarcasm', 'outrage'],
  'desmente': ['sarcasm'],
  
  // Sátira / Política
  'enquanto isso': ['satire', 'sarcasm'],
  'político': ['satire', 'serious'],
  'governo': ['satire', 'serious'],
  'congresso': ['satire', 'serious'],
  'deputado': ['satire', 'serious'],
  'senador': ['satire', 'serious'],
  
  // Mistério
  'mistério': ['mystery'],
  'enigma': ['mystery'],
  'desaparece': ['mystery', 'anguish'],
  'desaparecido': ['mystery', 'anguish'],
  'inexplicável': ['mystery'],
  'estranho': ['mystery', 'humor'],
  'oculto': ['mystery'],
  'secreto': ['mystery'],
  
  // Dúvida / Incerteza
  'investiga': ['doubt', 'mystery'],
  'suspeita': ['doubt'],
  'incerto': ['doubt'],
  'não confirmado': ['doubt'],
  'possível': ['doubt'],
  'especula': ['doubt'],
  'teoria': ['doubt', 'mystery'],
  'hipótese': ['doubt'],
};

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

/**
 * Retorna a configuração de um gatilho específico
 */
export function getTriggerConfig(trigger: EmotionalTrigger): TriggerConfig {
  return EMOTIONAL_TRIGGER_CONFIG[trigger];
}

/**
 * Retorna todos os gatilhos disponíveis com labels
 */
export function getAllTriggers(): Array<{ id: EmotionalTrigger; label: string; labelPtBr: string }> {
  return Object.entries(EMOTIONAL_TRIGGER_CONFIG).map(([id, config]) => ({
    id: id as EmotionalTrigger,
    label: config.label,
    labelPtBr: config.labelPtBr,
  }));
}

/**
 * Verifica se um gatilho deve usar caricatura
 */
export function shouldUseCaricature(trigger: EmotionalTrigger): boolean {
  const style = EMOTIONAL_TRIGGER_CONFIG[trigger].suggestedStyle;
  return style === 'caricature' || style === 'cartoon';
}

/**
 * Retorna gatilhos que permitem reutilização de imagem original
 */
export function canReuseOriginalImage(trigger: EmotionalTrigger): boolean {
  return ['serious', 'anguish', 'concern'].includes(trigger);
}

/**
 * Retorna a intensidade emocional sugerida para um gatilho
 */
export function getSuggestedIntensity(trigger: EmotionalTrigger): 'low' | 'medium' | 'high' {
  const highIntensity: EmotionalTrigger[] = ['outrage', 'anguish', 'celebration'];
  const lowIntensity: EmotionalTrigger[] = ['doubt', 'serious'];
  
  if (highIntensity.includes(trigger)) return 'high';
  if (lowIntensity.includes(trigger)) return 'low';
  return 'medium';
}
