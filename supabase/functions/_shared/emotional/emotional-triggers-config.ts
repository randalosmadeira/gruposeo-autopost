/**
 * EMOTIONAL TRIGGERS CONFIGURATION
 * Sistema de Gatilhos Emocionais para Geração de Imagens
 * 
 * GrupoSEO AutoPost - ContentFactory RDM v2.0
 * 
 * Este módulo define os 11 gatilhos emocionais e suas configurações
 * para decisão inteligente entre reutilizar imagem original ou criar caricatura.
 */

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export type EmotionalTrigger = 
  | 'serious' 
  | 'humor' 
  | 'concern' 
  | 'outrage' 
  | 'anguish' 
  | 'sarcasm' 
  | 'satire' 
  | 'happiness' 
  | 'celebration' 
  | 'doubt' 
  | 'mystery';

export type ImageStyle = 
  | 'photorealistic_documentary'
  | 'photorealistic_dramatic'
  | 'photorealistic_melancholic'
  | 'photorealistic_vibrant'
  | 'photorealistic_festive'
  | 'caricature_colorful'
  | 'caricature_bold'
  | 'caricature_ironic'
  | 'editorial_cartoon'
  | 'conceptual_abstract'
  | 'noir_enigmatic';

export type ImageAction = 
  | 'reuse_original'
  | 'create_caricature'
  | 'generate_new'
  | 'create_conceptual';

export interface TriggerConfig {
  code: EmotionalTrigger;
  label: string;
  labelPtBr: string;
  emoji: string;
  description: string;
  
  // Visual configuration
  suggestedStyle: ImageStyle;
  colorPalette: string[];
  visualElements: string[];
  
  // Image decision rules
  reuseOriginal: boolean | 'optional';
  createCaricature: boolean | 'optional';
  
  // Prompt modifiers
  promptModifiers: string;
  negativePrompts: string[];
  
  // Detection keywords (Portuguese)
  headlines: string[];
  bodyKeywords: string[];
  
  // Text tone
  vocabularyTone: string;
  ctaStyle: string;
}

export interface EmotionalAnalysis {
  primaryTrigger: EmotionalTrigger;
  confidence: number; // 0-100
  secondaryTriggers: EmotionalTrigger[];
  emotionalIntensity: 'low' | 'medium' | 'high';
  keywordsFound: string[];
  analysisMethod: 'keywords' | 'ai' | 'hybrid';
}

export interface ImageDecision {
  action: ImageAction;
  reason: string;
  triggerUsed: EmotionalTrigger;
  style: ImageStyle;
  shouldIncludeDisclaimer: boolean;
}

export interface CaricaturePrompt {
  basePrompt: string;
  styleModifiers: string;
  emotionalElements: string;
  colorPalette: string;
  composition: string;
  restrictions: string[];
}

// ============================================================================
// CONFIGURAÇÃO DOS 11 GATILHOS EMOCIONAIS
// ============================================================================

export const EMOTIONAL_TRIGGER_CONFIG: Record<EmotionalTrigger, TriggerConfig> = {
  
  // ---------------------------------------------------------------------------
  // 1. SÉRIO - Notícias graves, factuais, informativas
  // ---------------------------------------------------------------------------
  serious: {
    code: 'serious',
    label: 'Serious',
    labelPtBr: 'Sério',
    emoji: '📰',
    description: 'Tom grave, factual, informativo. Notícias de impacto sem sensacionalismo.',
    
    suggestedStyle: 'photorealistic_documentary',
    colorPalette: ['#2C3E50', '#34495E', '#7F8C8D', '#BDC3C7', '#ECF0F1'],
    visualElements: [
      'Iluminação sóbria e equilibrada',
      'Composição clássica jornalística',
      'Sem exageros ou dramatização',
      'Foco em fatos, não emoções'
    ],
    
    reuseOriginal: true,
    createCaricature: false,
    
    promptModifiers: 'Tom documental, fotojornalismo profissional, sem sensacionalismo, respeito ao tema, iluminação neutra',
    negativePrompts: ['cartoon', 'humor', 'cores vibrantes', 'exagero', 'caricatura', 'meme'],
    
    headlines: [
      'morre', 'falece', 'óbito', 'morte de', 'tribunal', 'decisão judicial',
      'condenado', 'julgamento', 'sentença', 'absolvido', 'preso', 'prisão',
      'lei', 'projeto de lei', 'votação', 'aprovado', 'sancionado', 'vetado',
      'ministro', 'presidente', 'governador', 'prefeito', 'secretário'
    ],
    bodyKeywords: [
      'tribunal', 'justiça', 'processo', 'audiência', 'recurso', 'apelação',
      'constituição', 'lei', 'decreto', 'portaria', 'resolução', 'norma',
      'oficial', 'declarou', 'afirmou', 'informou', 'comunicou', 'anunciou'
    ],
    
    vocabularyTone: 'Formal, objetivo, imparcial. Verbos no pretérito. Citações diretas.',
    ctaStyle: 'Informativo: "Acompanhe as atualizações", "Saiba mais sobre o caso"'
  },

  // ---------------------------------------------------------------------------
  // 2. HUMOR - Situações engraçadas, virais, memes
  // ---------------------------------------------------------------------------
  humor: {
    code: 'humor',
    label: 'Humor',
    labelPtBr: 'Humor',
    emoji: '😄',
    description: 'Situações engraçadas, virais, memes. Gafes e trapalhadas.',
    
    suggestedStyle: 'caricature_colorful',
    colorPalette: ['#F39C12', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6'],
    visualElements: [
      'Expressões faciais exageradas',
      'Cores saturadas e vibrantes',
      'Proporções distorcidas humorísticas',
      'Elementos de surpresa visual'
    ],
    
    reuseOriginal: false,
    createCaricature: true,
    
    promptModifiers: 'Caricatura cômica estilo charge brasileira, expressões exageradas e divertidas, cores vibrantes saturadas, estilo cartoon moderno, atmosfera leve e bem-humorada',
    negativePrompts: ['fotorealismo', 'sério', 'sóbrio', 'rosto realista', 'triste', 'dramático', 'sombrio'],
    
    headlines: [
      'viral', 'meme', 'hilário', 'risada', 'gafe', 'trapalhada', 'bizarro',
      'inusitado', 'curioso', 'engraçado', 'divertido', 'zoeira', 'piada',
      'treta', 'confusão', 'climão', 'saia justa', 'vergonha alheia'
    ],
    bodyKeywords: [
      'rir', 'gargalhada', 'cômico', 'engraçado', 'piada', 'humor',
      'meme', 'viral', 'compartilhado', 'bombou', 'explodiu', 'viralizou',
      'internautas', 'redes sociais', 'twitter', 'tiktok'
    ],
    
    vocabularyTone: 'Leve, informal, coloquial. Gírias e expressões populares.',
    ctaStyle: 'Divertido: "Confira e divirta-se!", "Veja o vídeo completo"'
  },

  // ---------------------------------------------------------------------------
  // 3. PREOCUPAÇÃO - Alertas, riscos, ameaças
  // ---------------------------------------------------------------------------
  concern: {
    code: 'concern',
    label: 'Concern',
    labelPtBr: 'Preocupação',
    emoji: '⚠️',
    description: 'Alertas, riscos, ameaças. Situações que demandam atenção.',
    
    suggestedStyle: 'photorealistic_dramatic',
    colorPalette: ['#E67E22', '#D35400', '#C0392B', '#2C3E50', '#7F8C8D'],
    visualElements: [
      'Iluminação dramática com contraste',
      'Cores de alerta (laranja, vermelho)',
      'Composição que transmite tensão',
      'Elementos visuais de urgência'
    ],
    
    reuseOriginal: true,
    createCaricature: false,
    
    promptModifiers: 'Fotografia dramática, tensão visual, urgência, iluminação contrastante, cores de alerta, atmosfera de seriedade',
    negativePrompts: ['cartoon', 'humor', 'cores suaves', 'paz', 'tranquilidade', 'caricatura'],
    
    headlines: [
      'alerta', 'risco', 'perigo', 'ameaça', 'cuidado', 'atenção', 'urgente',
      'emergência', 'grave', 'crítico', 'preocupante', 'alarmante', 'sério',
      'pode causar', 'evite', 'não faça', 'fique atento'
    ],
    bodyKeywords: [
      'alerta', 'aviso', 'comunicado', 'orientação', 'recomendação',
      'risco', 'perigo', 'ameaça', 'vulnerabilidade', 'exposição',
      'precaução', 'prevenção', 'cuidado', 'atenção', 'vigilância'
    ],
    
    vocabularyTone: 'Urgente mas não alarmista. Objetivo e direto. Foco em ação.',
    ctaStyle: 'Orientativo: "Proteja-se agora", "Tome as medidas necessárias"'
  },

  // ---------------------------------------------------------------------------
  // 4. REVOLTA/INDIGNAÇÃO - Escândalos, corrupção, injustiças
  // ---------------------------------------------------------------------------
  outrage: {
    code: 'outrage',
    label: 'Outrage',
    labelPtBr: 'Revolta/Indignação',
    emoji: '😡',
    description: 'Escândalos, corrupção, injustiças. Situações que geram indignação.',
    
    suggestedStyle: 'caricature_bold',
    colorPalette: ['#C0392B', '#E74C3C', '#922B21', '#2C3E50', '#1A1A1A'],
    visualElements: [
      'Expressão de culpa ou arrogância exagerada',
      'Símbolos de corrupção (notas, malas, cofres)',
      'Contraste forte com vermelho dominante',
      'Composição dramática e contundente'
    ],
    
    reuseOriginal: false,
    createCaricature: true,
    
    promptModifiers: 'Caricatura política contundente estilo charge editorial, símbolos de corrupção visíveis, vermelho dominante, expressão que transmite a gravidade do escândalo, sem identificar rosto real',
    negativePrompts: ['foto realista', 'rosto identificável', 'celebração', 'humor leve', 'cores alegres'],
    
    headlines: [
      'escândalo', 'corrupção', 'desvio', 'fraude', 'propina', 'roubo',
      'absurdo', 'vergonha', 'indignação', 'revolta', 'inadmissível',
      'desviou', 'roubou', 'fraudou', 'superfaturamento', 'nepotismo'
    ],
    bodyKeywords: [
      'escândalo', 'corrupção', 'desvio', 'fraude', 'propina', 'suborno',
      'lavagem', 'enriquecimento', 'ilícito', 'irregular', 'ilegal',
      'MP', 'PF', 'investigação', 'operação', 'denúncia', 'delação'
    ],
    
    vocabularyTone: 'Indignado mas factual. Destaque para valores e irregularidades.',
    ctaStyle: 'Mobilizador: "Compartilhe para que todos saibam", "Exija transparência"'
  },

  // ---------------------------------------------------------------------------
  // 5. ANGÚSTIA - Tragédias, perdas, sofrimento
  // ---------------------------------------------------------------------------
  anguish: {
    code: 'anguish',
    label: 'Anguish',
    labelPtBr: 'Angústia',
    emoji: '😢',
    description: 'Tragédias, perdas, sofrimento. Eventos que causam dor coletiva.',
    
    suggestedStyle: 'photorealistic_melancholic',
    colorPalette: ['#2C3E50', '#34495E', '#5D6D7E', '#85929E', '#ABB2B9'],
    visualElements: [
      'Tons frios e dessaturados',
      'Desfoque suave (bokeh melancólico)',
      'Silhuetas e sombras',
      'Composição que transmite solidão/vazio'
    ],
    
    reuseOriginal: true,
    createCaricature: false,
    
    promptModifiers: 'Fotografia respeitosa e sóbria, tons frios e dessaturados, sem exploração do sofrimento, composição que transmite respeito às vítimas, iluminação suave e melancólica',
    negativePrompts: ['cores vibrantes', 'humor', 'celebração', 'rostos em close', 'sangue', 'violência gráfica', 'caricatura'],
    
    headlines: [
      'tragédia', 'perda', 'luto', 'vítimas', 'desastre', 'acidente fatal',
      'desabamento', 'incêndio', 'afogamento', 'atropelamento', 'queda',
      'morreram', 'faleceram', 'perderam a vida', 'encontrados mortos'
    ],
    bodyKeywords: [
      'tragédia', 'vítima', 'óbito', 'falecimento', 'luto', 'velório',
      'enterro', 'sepultamento', 'homenagem', 'consternação', 'comoção',
      'solidariedade', 'família', 'amigos', 'comunidade', 'dor'
    ],
    
    vocabularyTone: 'Respeitoso, sóbrio, empático. Foco nas vítimas, não no sensacionalismo.',
    ctaStyle: 'Solidário: "Nossos sentimentos às famílias", "Acesse canais de ajuda"'
  },

  // ---------------------------------------------------------------------------
  // 6. SARCASMO - Ironias, contradições, hipocrisia
  // ---------------------------------------------------------------------------
  sarcasm: {
    code: 'sarcasm',
    label: 'Sarcasm',
    labelPtBr: 'Sarcasmo',
    emoji: '😏',
    description: 'Ironias, contradições, hipocrisia. Situações que pedem ironia fina.',
    
    suggestedStyle: 'caricature_ironic',
    colorPalette: ['#9B59B6', '#8E44AD', '#3498DB', '#2980B9', '#1ABC9C'],
    visualElements: [
      'Expressão irônica/sarcástica',
      'Elementos visuais contraditórios',
      'Sutileza humorística inteligente',
      'Composição que destaca a ironia'
    ],
    
    reuseOriginal: false,
    createCaricature: true,
    
    promptModifiers: 'Caricatura irônica e inteligente, expressão sarcástica sutil, elementos visuais que mostram contradição, cores frias com toques de destaque, estilo editorial sofisticado',
    negativePrompts: ['foto séria', 'documentário', 'literal', 'humor escrachado', 'ofensivo'],
    
    headlines: [
      'ironia', 'contradição', 'hipocrisia', 'incoerência', 'cinismo',
      'depois de dizer que', 'apesar de ter', 'mesmo tendo', 'curiosamente',
      'contraditoriamente', 'ironicamente', 'para variar'
    ],
    bodyKeywords: [
      'ironia', 'irônico', 'contraditório', 'hipócrita', 'incoerente',
      'antes disse', 'agora faz', 'mudou de posição', 'virou a casaca',
      'dois pesos', 'duas medidas', 'quando convém'
    ],
    
    vocabularyTone: 'Irônico mas elegante. Sutileza intelectual. Sem baixaria.',
    ctaStyle: 'Provocativo: "Entenda a contradição", "Compare as declarações"'
  },

  // ---------------------------------------------------------------------------
  // 7. SÁTIRAS - Crítica social/política através do humor
  // ---------------------------------------------------------------------------
  satire: {
    code: 'satire',
    label: 'Satire',
    labelPtBr: 'Sátira',
    emoji: '🎭',
    description: 'Crítica social ou política através do humor inteligente.',
    
    suggestedStyle: 'editorial_cartoon',
    colorPalette: ['#2ECC71', '#27AE60', '#E74C3C', '#F39C12', '#3498DB'],
    visualElements: [
      'Estilo charge de jornal brasileiro',
      'Símbolos políticos/sociais reconhecíveis',
      'Exagero característico de charge',
      'Crítica visual inteligente'
    ],
    
    reuseOriginal: false,
    createCaricature: true,
    
    promptModifiers: 'Charge editorial estilo brasileiro (Angeli, Laerte, Jaguar), crítica visual inteligente e bem-humorada, símbolos políticos reconhecíveis, sem rosto identificável de pessoa real, humor sofisticado',
    negativePrompts: ['foto realista', 'rosto real identificável', 'neutro', 'ofensivo', 'agressivo'],
    
    headlines: [
      'político', 'governo', 'congresso', 'presidente', 'ministro', 'eleição',
      'votação', 'partido', 'campanha', 'promessa', 'discurso', 'palanque',
      'brasília', 'planalto', 'câmara', 'senado'
    ],
    bodyKeywords: [
      'político', 'política', 'governo', 'oposição', 'base aliada',
      'deputado', 'senador', 'vereador', 'prefeito', 'governador',
      'eleitor', 'eleição', 'urna', 'voto', 'mandato', 'reeleição'
    ],
    
    vocabularyTone: 'Crítico mas bem-humorado. Inteligente, não agressivo.',
    ctaStyle: 'Reflexivo: "O que você acha?", "Deixe sua opinião"'
  },

  // ---------------------------------------------------------------------------
  // 8. FELICIDADE - Boas notícias, conquistas, vitórias
  // ---------------------------------------------------------------------------
  happiness: {
    code: 'happiness',
    label: 'Happiness',
    labelPtBr: 'Felicidade',
    emoji: '😊',
    description: 'Boas notícias, conquistas pessoais, vitórias. Momentos positivos.',
    
    suggestedStyle: 'photorealistic_vibrant',
    colorPalette: ['#F1C40F', '#F39C12', '#27AE60', '#3498DB', '#E74C3C'],
    visualElements: [
      'Cores quentes e vibrantes',
      'Iluminação natural e alegre',
      'Sorrisos e expressões de alegria',
      'Composição dinâmica e positiva'
    ],
    
    reuseOriginal: 'optional',
    createCaricature: false,
    
    promptModifiers: 'Fotografia vibrante e alegre, cores quentes e saturadas, iluminação natural brilhante, atmosfera de celebração e conquista, energia positiva e inspiradora',
    negativePrompts: ['sombrio', 'frio', 'triste', 'cinza', 'dessaturado', 'melancólico'],
    
    headlines: [
      'vitória', 'conquista', 'sucesso', 'aprovado', 'ganhou', 'campeão',
      'recorde', 'primeiro lugar', 'medalha', 'troféu', 'prêmio', 'homenagem',
      'superou', 'alcançou', 'realizou', 'conseguiu', 'venceu'
    ],
    bodyKeywords: [
      'vitória', 'conquista', 'sucesso', 'aprovação', 'premiação',
      'reconhecimento', 'destaque', 'excelência', 'mérito', 'esforço',
      'dedicação', 'perseverança', 'sonho', 'realização', 'objetivo'
    ],
    
    vocabularyTone: 'Celebratório, inspirador, motivacional. Energia positiva.',
    ctaStyle: 'Inspirador: "Parabéns!", "Que história inspiradora!"'
  },

  // ---------------------------------------------------------------------------
  // 9. COMEMORAÇÃO - Eventos, aniversários, marcos históricos
  // ---------------------------------------------------------------------------
  celebration: {
    code: 'celebration',
    label: 'Celebration',
    labelPtBr: 'Comemoração',
    emoji: '🎉',
    description: 'Eventos festivos, aniversários, marcos históricos, inaugurações.',
    
    suggestedStyle: 'photorealistic_festive',
    colorPalette: ['#F1C40F', '#E74C3C', '#9B59B6', '#3498DB', '#2ECC71', '#E67E22'],
    visualElements: [
      'Cores festivas múltiplas',
      'Confetes, balões, bandeiras',
      'Multidão alegre',
      'Atmosfera de festa'
    ],
    
    reuseOriginal: 'optional',
    createCaricature: false,
    
    promptModifiers: 'Fotografia festiva e colorida, atmosfera de celebração coletiva, múltiplas cores vibrantes, elementos festivos (confetes, bandeiras), iluminação alegre e brilhante',
    negativePrompts: ['sóbrio', 'cinza', 'solitário', 'triste', 'minimalista', 'frio'],
    
    headlines: [
      'celebra', 'comemora', 'aniversário', 'inauguração', 'festa', 'marco',
      'histórico', 'jubileu', 'centenário', 'evento', 'festival', 'carnaval',
      'réveillon', 'natal', 'páscoa'
    ],
    bodyKeywords: [
      'celebração', 'comemoração', 'festa', 'evento', 'festividade',
      'aniversário', 'inauguração', 'abertura', 'lançamento', 'estreia',
      'convidados', 'público', 'participantes', 'presentes'
    ],
    
    vocabularyTone: 'Festivo, alegre, contagiante. Destaque para a ocasião.',
    ctaStyle: 'Convidativo: "Participe!", "Não perca!", "Venha celebrar!"'
  },

  // ---------------------------------------------------------------------------
  // 10. DÚVIDAS/INCERTEZAS - Investigações, teorias, especulações
  // ---------------------------------------------------------------------------
  doubt: {
    code: 'doubt',
    label: 'Doubt',
    labelPtBr: 'Dúvidas/Incertezas',
    emoji: '🤔',
    description: 'Investigações em andamento, teorias, especulações, questões em aberto.',
    
    suggestedStyle: 'conceptual_abstract',
    colorPalette: ['#7F8C8D', '#95A5A6', '#BDC3C7', '#2C3E50', '#34495E'],
    visualElements: [
      'Elementos abstratos e nebulosos',
      'Pontos de interrogação sutis',
      'Composição que sugere incerteza',
      'Transições e sobreposições'
    ],
    
    reuseOriginal: false,
    createCaricature: 'optional',
    
    promptModifiers: 'Arte conceitual abstrata, elementos que sugerem incerteza e questionamento, composição enigmática com camadas, cores neutras com acentos sutis, atmosfera de mistério intelectual',
    negativePrompts: ['definido', 'claro', 'literal', 'fotojornalismo', 'certeza', 'conclusivo'],
    
    headlines: [
      'investiga', 'apura', 'suspeita', 'será que', 'rumores', 'especulação',
      'mistério', 'incerto', 'indefinido', 'pode ser', 'talvez', 'possível',
      'hipótese', 'teoria', 'ainda não se sabe'
    ],
    bodyKeywords: [
      'investigação', 'apuração', 'suspeita', 'dúvida', 'incerteza',
      'especulação', 'rumor', 'boato', 'hipótese', 'teoria',
      'possibilidade', 'análise', 'averiguação', 'perícia'
    ],
    
    vocabularyTone: 'Questionador, analítico, cuidadoso. Evitar afirmações categóricas.',
    ctaStyle: 'Investigativo: "Acompanhe a apuração", "O que você acha?"'
  },

  // ---------------------------------------------------------------------------
  // 11. MISTÉRIO - Casos sem resposta, enigmas, desaparecimentos
  // ---------------------------------------------------------------------------
  mystery: {
    code: 'mystery',
    label: 'Mystery',
    labelPtBr: 'Mistério',
    emoji: '🔮',
    description: 'Casos sem resposta, enigmas não resolvidos, desaparecimentos misteriosos.',
    
    suggestedStyle: 'noir_enigmatic',
    colorPalette: ['#1A1A2E', '#16213E', '#0F3460', '#533483', '#2C3E50'],
    visualElements: [
      'Sombras densas e profundas',
      'Silhuetas e figuras parciais',
      'Elementos ocultos ou sugeridos',
      'Atmosfera noir e enigmática'
    ],
    
    reuseOriginal: false,
    createCaricature: false,
    
    promptModifiers: 'Arte noir enigmática, sombras densas e misteriosas, elementos parcialmente visíveis, atmosfera de suspense e mistério, composição que esconde mais do que revela, sem rostos identificáveis',
    negativePrompts: ['claro', 'iluminado', 'literal', 'rosto visível', 'explicativo', 'óbvio'],
    
    headlines: [
      'desapareceu', 'sem explicação', 'inexplicável', 'nunca encontrado',
      'caso arquivado', 'mistério', 'enigma', 'sem solução', 'anos depois',
      'caso não resolvido', 'polícia não sabe', 'ninguém viu'
    ],
    bodyKeywords: [
      'mistério', 'enigma', 'desaparecimento', 'caso', 'investigação',
      'pistas', 'vestígios', 'testemunhas', 'sem resposta', 'arquivado',
      'reabertura', 'cold case', 'inconclusivo', 'inexplicado'
    ],
    
    vocabularyTone: 'Intrigante, cativante, suspensivo. Criar interesse sem sensacionalismo.',
    ctaStyle: 'Enigmático: "O mistério continua", "E você, o que acha que aconteceu?"'
  }
};

// ============================================================================
// MAPEAMENTO DE KEYWORDS PARA GATILHOS
// ============================================================================

export const TRIGGER_KEYWORDS: Record<string, EmotionalTrigger[]> = {
  // Morte/Óbito → serious ou anguish
  'morre': ['serious', 'anguish'],
  'morreu': ['serious', 'anguish'],
  'morreram': ['anguish'],
  'falece': ['serious', 'anguish'],
  'faleceu': ['serious', 'anguish'],
  'óbito': ['serious', 'anguish'],
  'morte': ['serious', 'anguish'],
  
  // Tragédias → anguish
  'tragédia': ['anguish'],
  'trágico': ['anguish'],
  'desastre': ['anguish'],
  'catástrofe': ['anguish'],
  'vítimas': ['anguish', 'concern'],
  'acidente': ['anguish', 'concern'],
  'incêndio': ['anguish', 'concern'],
  'desabamento': ['anguish'],
  
  // Justiça → serious
  'tribunal': ['serious'],
  'julgamento': ['serious'],
  'sentença': ['serious'],
  'condenado': ['serious'],
  'absolvido': ['serious'],
  'preso': ['serious'],
  'prisão': ['serious'],
  'STF': ['serious'],
  'STJ': ['serious'],
  
  // Corrupção → outrage
  'escândalo': ['outrage'],
  'corrupção': ['outrage'],
  'desvio': ['outrage'],
  'fraude': ['outrage'],
  'propina': ['outrage'],
  'roubo': ['outrage'],
  'superfaturamento': ['outrage'],
  'nepotismo': ['outrage'],
  'lavagem': ['outrage'],
  
  // Humor → humor
  'viral': ['humor'],
  'meme': ['humor'],
  'hilário': ['humor'],
  'gafe': ['humor'],
  'trapalhada': ['humor'],
  'bizarro': ['humor'],
  'inusitado': ['humor'],
  'engraçado': ['humor'],
  'zoeira': ['humor'],
  
  // Alerta → concern
  'alerta': ['concern'],
  'risco': ['concern'],
  'perigo': ['concern'],
  'ameaça': ['concern'],
  'urgente': ['concern'],
  'emergência': ['concern'],
  'cuidado': ['concern'],
  
  // Ironia → sarcasm
  'ironia': ['sarcasm'],
  'contradição': ['sarcasm'],
  'hipocrisia': ['sarcasm'],
  'incoerência': ['sarcasm'],
  'ironicamente': ['sarcasm'],
  
  // Política → satire
  'político': ['satire', 'serious'],
  'deputado': ['satire', 'serious'],
  'senador': ['satire', 'serious'],
  'congresso': ['satire', 'serious'],
  'eleição': ['satire', 'serious'],
  'campanha': ['satire'],
  
  // Vitória → happiness
  'vitória': ['happiness', 'celebration'],
  'conquista': ['happiness'],
  'sucesso': ['happiness'],
  'aprovado': ['happiness'],
  'campeão': ['happiness', 'celebration'],
  'recorde': ['happiness'],
  'medalha': ['happiness', 'celebration'],
  
  // Festa → celebration
  'celebra': ['celebration'],
  'comemora': ['celebration'],
  'aniversário': ['celebration'],
  'inauguração': ['celebration'],
  'festival': ['celebration'],
  'carnaval': ['celebration'],
  
  // Investigação → doubt
  'investiga': ['doubt'],
  'apura': ['doubt'],
  'suspeita': ['doubt'],
  'rumores': ['doubt'],
  'especulação': ['doubt'],
  'hipótese': ['doubt'],
  
  // Mistério → mystery
  'desapareceu': ['mystery'],
  'desaparecimento': ['mystery'],
  'sem explicação': ['mystery'],
  'inexplicável': ['mystery'],
  'enigma': ['mystery'],
  'caso arquivado': ['mystery'],
  'nunca encontrado': ['mystery'],
};

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

/**
 * Obtém a configuração de um gatilho específico
 */
export function getTriggerConfig(trigger: EmotionalTrigger): TriggerConfig {
  return EMOTIONAL_TRIGGER_CONFIG[trigger];
}

/**
 * Obtém todos os gatilhos disponíveis
 */
export function getAllTriggers(): EmotionalTrigger[] {
  return Object.keys(EMOTIONAL_TRIGGER_CONFIG) as EmotionalTrigger[];
}

/**
 * Verifica se um gatilho deve criar caricatura
 */
export function shouldUseCaricature(trigger: EmotionalTrigger): boolean {
  const config = getTriggerConfig(trigger);
  return config.createCaricature === true;
}

/**
 * Verifica se um gatilho pode reutilizar a imagem original
 */
export function canReuseOriginalImage(trigger: EmotionalTrigger): boolean {
  const config = getTriggerConfig(trigger);
  return config.reuseOriginal === true || config.reuseOriginal === 'optional';
}

/**
 * Obtém o estilo de imagem sugerido para um gatilho
 */
export function getSuggestedStyle(trigger: EmotionalTrigger): ImageStyle {
  return getTriggerConfig(trigger).suggestedStyle;
}

/**
 * Obtém a paleta de cores para um gatilho
 */
export function getColorPalette(trigger: EmotionalTrigger): string[] {
  return getTriggerConfig(trigger).colorPalette;
}

/**
 * Obtém as opções de gatilhos para UI (select/dropdown)
 */
export function getTriggerOptions(): Array<{ value: EmotionalTrigger; label: string; emoji: string }> {
  return getAllTriggers().map(trigger => {
    const config = getTriggerConfig(trigger);
    return {
      value: trigger,
      label: config.labelPtBr,
      emoji: config.emoji
    };
  });
}
