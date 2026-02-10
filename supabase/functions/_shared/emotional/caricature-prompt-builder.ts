/**
 * GERADOR DE PROMPTS PARA CARICATURAS E IMAGENS EMOCIONAIS
 * ContentFactory RDM - Grupo SEO Marketing
 * 
 * Constrói prompts otimizados para geração de imagens baseadas
 * no gatilho emocional identificado na notícia.
 */

import { 
  EmotionalTrigger, 
  ImageStyle,
  CaricaturePrompt,
  EMOTIONAL_TRIGGER_CONFIG,
  ImageDecision,
  EmotionalAnalysis
} from './emotional-triggers-config.ts';

// ============================================
// DECISOR DE AÇÃO DE IMAGEM
// ============================================

/**
 * Decide qual ação tomar com a imagem baseado na análise emocional
 */
export function decideImageAction(
  analysis: EmotionalAnalysis,
  originalImageUrl?: string,
  hasHighQualityOriginal: boolean = false
): ImageDecision {
  
  const trigger = analysis.primaryTrigger;
  
  // REGRA 1: Notícias sérias com imagem de alta qualidade - REUTILIZAR
  if (
    trigger === 'serious' && 
    originalImageUrl && 
    hasHighQualityOriginal
  ) {
    return {
      action: 'reuse_original',
      reason: 'Notícia séria com imagem original de qualidade - manter autenticidade jornalística',
      originalImageUrl,
      style: 'photorealistic',
      trigger,
    };
  }
  
  // REGRA 2: Anguish com imagem original - REUTILIZAR (respeito às vítimas)
  if (
    trigger === 'anguish' && 
    originalImageUrl &&
    hasHighQualityOriginal
  ) {
    return {
      action: 'reuse_original',
      reason: 'Notícia sensível sobre tragédia - manter imagem original por respeito',
      originalImageUrl,
      style: 'photorealistic',
      trigger,
    };
  }
  
  // REGRA 3: Concern com imagem original - REUTILIZAR (credibilidade)
  if (
    trigger === 'concern' && 
    originalImageUrl &&
    hasHighQualityOriginal
  ) {
    return {
      action: 'reuse_original',
      reason: 'Alerta importante - manter imagem original para credibilidade',
      originalImageUrl,
      style: 'dramatic',
      trigger,
    };
  }
  
  // REGRA 4: Humor, Sátira, Sarcasmo, Revolta - CRIAR CARICATURA
  if (['humor', 'satire', 'sarcasm', 'outrage'].includes(trigger)) {
    return {
      action: 'create_caricature',
      reason: `Gatilho ${trigger} detectado - criar caricatura editorial para maior engajamento e expressividade`,
      style: trigger === 'satire' ? 'cartoon' : 'caricature',
      trigger,
    };
  }
  
  // REGRA 5: Mistério, Dúvida - CRIAR IMAGEM CONCEITUAL
  if (['mystery', 'doubt'].includes(trigger)) {
    return {
      action: 'create_conceptual',
      reason: `Gatilho ${trigger} detectado - criar arte conceitual que sugere o desconhecido/incerto`,
      style: 'conceptual',
      trigger,
    };
  }
  
  // REGRA 6: Felicidade, Comemoração - GERAR IMAGEM VIBRANTE
  if (['happiness', 'celebration'].includes(trigger)) {
    return {
      action: 'generate_new',
      reason: `Gatilho ${trigger} - gerar imagem vibrante e otimista`,
      style: 'photorealistic',
      trigger,
    };
  }
  
  // REGRA DEFAULT: Demais casos - GERAR NOVA IMAGEM
  return {
    action: 'generate_new',
    reason: 'Gerar imagem otimizada para o tom emocional identificado',
    style: EMOTIONAL_TRIGGER_CONFIG[trigger].suggestedStyle,
    trigger,
  };
}

/**
 * Verifica qualidade da imagem original via HEAD request
 */
export async function checkOriginalImageQuality(
  imageUrl: string
): Promise<{ hasHighQuality: boolean; contentLength: number; contentType: string }> {
  try {
    const response = await fetch(imageUrl, { 
      method: 'HEAD',
      headers: {
        'User-Agent': 'ContentFactory-RDM/1.0'
      }
    });
    
    if (!response.ok) {
      return { hasHighQuality: false, contentLength: 0, contentType: '' };
    }
    
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    const contentType = response.headers.get('content-type') || '';
    
    // Imagem com mais de 50KB e tipo válido provavelmente tem qualidade razoável
    const isValidType = contentType.startsWith('image/');
    const hasHighQuality = contentLength > 50000 && isValidType;
    
    return {
      hasHighQuality,
      contentLength,
      contentType,
    };
  } catch (error) {
    console.error('[ImageQualityCheck] Error:', error);
    return { hasHighQuality: false, contentLength: 0, contentType: '' };
  }
}

// ============================================
// GERADOR DE PROMPTS
// ============================================

/**
 * Constrói prompt otimizado para geração de imagem baseada no gatilho emocional
 */
export function buildEmotionalImagePrompt(
  trigger: EmotionalTrigger,
  title: string,
  context: string,
  options?: {
    persons?: string[];      // Nomes de pessoas mencionadas
    entities?: string[];     // Entidades (empresas, governos)
    forceCaricature?: boolean;
    aspectRatio?: string;
  }
): CaricaturePrompt {
  
  const config = EMOTIONAL_TRIGGER_CONFIG[trigger];
  
  // Elementos emocionais baseados no gatilho
  const emotionalElements = getEmotionalElements(trigger);
  
  // Construir prompt base
  const basePrompt = buildBasePrompt(
    trigger, 
    title, 
    context, 
    options?.persons, 
    options?.entities
  );
  
  // Modificadores de estilo
  const styleModifiers = [
    ...config.promptModifiers,
    getStyleModifier(trigger),
  ];
  
  // Composição
  const composition = getComposition(trigger);
  
  // Restrições importantes (sempre incluir)
  const restrictions = buildRestrictions(trigger);
  
  return {
    basePrompt,
    styleModifiers,
    emotionalElements,
    colorPalette: config.colorPalette,
    composition,
    restrictions,
  };
}

/**
 * Constrói o prompt base para a imagem
 */
function buildBasePrompt(
  trigger: EmotionalTrigger,
  title: string,
  context: string,
  persons?: string[],
  entities?: string[]
): string {
  const config = EMOTIONAL_TRIGGER_CONFIG[trigger];
  
  // Tipo de arte baseado no estilo sugerido
  const artType: Record<ImageStyle, string> = {
    'caricature': 'caricatura editorial de alta qualidade no estilo de charge de jornal brasileiro (como O Globo, Folha)',
    'cartoon': 'ilustração cartoon estilizada para editorial, estilo moderno e colorido',
    'conceptual': 'arte conceitual abstrata com elementos simbólicos e atmosfera sugestiva',
    'dramatic': 'fotografia artística dramática com iluminação expressiva e impactante',
    'photorealistic': 'fotografia profissional editorial de alta qualidade para mídia digital',
  };
  
  // Elementos visuais principais
  const visualDesc = config.visualElements.slice(0, 3).join(', ');
  
  let prompt = `Crie uma ${artType[config.suggestedStyle]} para ilustrar a seguinte notícia:

## CONTEÚDO
**Título:** "${title}"
**Contexto:** ${context.substring(0, 400)}

## DIREÇÃO VISUAL
${visualDesc}

## PALETA DE CORES
Usar predominantemente: ${config.colorPalette.slice(0, 4).join(', ')}
`;

  // Adicionar elementos específicos para caricaturas
  if (config.suggestedStyle === 'caricature' || config.suggestedStyle === 'cartoon') {
    
    if (persons && persons.length > 0) {
      prompt += `
## PERSONAGENS
Representar de forma caricata GENÉRICA (NÃO retratos realistas de pessoas reais):
${persons.slice(0, 2).map(p => `- Figura representando "${p}" com expressões exageradas apropriadas ao tom`).join('\n')}
`;
    }
    
    if (entities && entities.length > 0) {
      prompt += `
## ENTIDADES (representar simbolicamente)
${entities.slice(0, 2).map(e => `- Símbolo ou elemento visual representando "${e}"`).join('\n')}
`;
    }
    
    // Adicionar instruções específicas de caricatura
    prompt += `
## ESTILO DE CARICATURA
- Traços expressivos e dinâmicos
- Proporções exageradas para efeito (cabeças maiores, expressões amplificadas)
- Cores vibrantes e contrastantes
- Elementos simbólicos que reforcem a mensagem
- Estilo editorial brasileiro (Angeli, Laerte, Lailson)
`;
  }
  
  // Para arte conceitual (mistério/dúvida)
  if (config.suggestedStyle === 'conceptual') {
    prompt += `
## ESTILO CONCEITUAL
- Elementos abstratos que sugerem mais do que mostram
- Uso criativo de sombras e luz
- Símbolos sutis relacionados ao tema
- Atmosfera que convida à reflexão
- Composição que deixa espaço para interpretação
`;
  }
  
  return prompt;
}

/**
 * Retorna elementos emocionais específicos do gatilho
 */
function getEmotionalElements(trigger: EmotionalTrigger): string[] {
  const elements: Record<EmotionalTrigger, string[]> = {
    serious: [
      'Expressões neutras e compostas',
      'Postura formal e respeitosa',
      'Ambiente profissional ou institucional',
      'Iluminação equilibrada sem drama excessivo'
    ],
    humor: [
      'Expressões exageradas e cômicas (olhos arregalados, bocas abertas)',
      'Elementos de surpresa visual inesperados',
      'Proporções distorcidas para efeito cômico',
      'Cores saturadas e alegres',
      'Elementos cartoon que reforcem o humor'
    ],
    concern: [
      'Expressões de apreensão e tensão',
      'Elementos visuais de alerta (exclamações, símbolos de atenção)',
      'Atmosfera tensa com iluminação dramática',
      'Cores de aviso (laranja, amarelo intenso)',
      'Composição que direciona atenção ao risco'
    ],
    outrage: [
      'Expressões de indignação exageradas (raiva, desprezo)',
      'Símbolos de corrupção (notas de dinheiro, malas)',
      'Contraste dramático entre luz e sombra',
      'Vermelho como cor emocional dominante',
      'Elementos que expõem a injustiça'
    ],
    anguish: [
      'Tons sombrios e melancólicos',
      'Atmosfera contemplativa e respeitosa',
      'Elementos que sugerem perda ou ausência',
      'Iluminação suave e difusa',
      'Composição com espaço vazio intencional'
    ],
    sarcasm: [
      'Expressões de deboche ou desdém exageradas',
      'Elementos contraditórios colocados lado a lado',
      'Ironia visual clara e inteligente',
      'Símbolos de hipocrisia ou falsidade',
      'Composição que evidencia o absurdo'
    ],
    satire: [
      'Símbolos políticos estilizados e reconhecíveis',
      'Metáforas visuais claras e inteligentes',
      'Elementos de crítica social perspicaz',
      'Estilo clássico de charge política',
      'Composição editorial de qualidade'
    ],
    happiness: [
      'Expressões radiantes e genuínas de alegria',
      'Cores vibrantes e quentes (dourado, laranja)',
      'Elementos de celebração e vitória',
      'Iluminação otimista e brilhante',
      'Composição expansiva e aberta'
    ],
    celebration: [
      'Elementos festivos (confetes, balões, fogos)',
      'Cores vibrantes e festivas',
      'Atmosfera de comemoração coletiva',
      'Iluminação de evento especial',
      'Composição dinâmica e alegre'
    ],
    doubt: [
      'Elementos de interrogação visual sutis',
      'Composição ambígua que sugere questionamento',
      'Tons neutros e indefinidos',
      'Sombras parciais estratégicas',
      'Foco suave em algumas áreas'
    ],
    mystery: [
      'Sombras profundas e enigmáticas',
      'Silhuetas parcialmente reveladas',
      'Elementos ocultos ou semi-visíveis',
      'Atmosfera noir ou de suspense',
      'Composição que esconde mais do que revela'
    ]
  };
  
  return elements[trigger] || elements.serious;
}

/**
 * Retorna modificador de estilo específico
 */
function getStyleModifier(trigger: EmotionalTrigger): string {
  const modifiers: Record<EmotionalTrigger, string> = {
    serious: 'Fotojornalismo documental de alta qualidade, iluminação natural, composição jornalística',
    humor: 'Cartoon expressivo brasileiro, cores saturadas, traços dinâmicos, exagero proposital',
    concern: 'Iluminação dramática de alerta, tons quentes de aviso, tensão visual palpável',
    outrage: 'Charge política contundente, vermelho dominante, expressões de indignação amplificadas',
    anguish: 'Fotografia emocional em tons frios, atmosfera melancólica, luz difusa respeitosa',
    sarcasm: 'Ironia visual inteligente, elementos contraditórios, deboche sutil ou evidente',
    satire: 'Estilo de cartunista político clássico, metáforas visuais claras, crítica perspicaz',
    happiness: 'Cores quentes e brilhantes, iluminação dourada otimista, energia de conquista',
    celebration: 'Elementos festivos coloridos, atmosfera de evento, composição vibrante',
    doubt: 'Composição reflexiva, elementos de questionamento, tons neutros indefinidos',
    mystery: 'Atmosfera noir, sombras enigmáticas, elementos parcialmente ocultos'
  };
  
  return modifiers[trigger];
}

/**
 * Retorna descrição de composição para o gatilho
 */
function getComposition(trigger: EmotionalTrigger): string {
  const compositions: Record<EmotionalTrigger, string> = {
    serious: 'Composição centralizada e equilibrada, regra dos terços, foco claro no sujeito principal',
    humor: 'Composição dinâmica e assimétrica, ângulos inusitados, elementos de surpresa visual',
    concern: 'Foco central intenso com elementos de tensão nas bordas, direcionamento do olhar',
    outrage: 'Composição dramática com ângulo de baixo para cima (poder), símbolos de corrupção em destaque',
    anguish: 'Composição que sugere vazio e ausência, espaço negativo intencional, contemplação',
    sarcasm: 'Elementos contraditórios posicionados lado a lado para evidenciar a ironia',
    satire: 'Composição clássica de charge política, símbolos e metáforas em posições estratégicas',
    happiness: 'Composição expansiva e aberta, elementos ascendentes, energia positiva',
    celebration: 'Composição festiva centralizada, elementos que sugerem movimento e alegria coletiva',
    doubt: 'Composição ambígua com elementos parcialmente visíveis, foco suave',
    mystery: 'Composição noir com sombras dominantes, revelação parcial, suspense visual'
  };
  
  return compositions[trigger];
}

/**
 * Constrói lista de restrições para o prompt
 */
function buildRestrictions(trigger: EmotionalTrigger): string[] {
  const baseRestrictions = [
    'NÃO incluir texto, palavras ou letras na imagem',
    'NÃO incluir logotipos ou marcas registradas',
    'NÃO criar imagens com conteúdo sexualmente explícito ou violência gráfica',
    'NÃO criar imagens que possam ser confundidas com fotografias reais de pessoas identificáveis',
  ];
  
  // Restrições específicas por gatilho
  const triggerRestrictions: Record<EmotionalTrigger, string[]> = {
    serious: [
      'Manter tom absolutamente respeitoso e sóbrio',
      'Evitar qualquer elemento que possa parecer sensacionalista',
    ],
    humor: [
      'Manter humor inteligente, evitar vulgaridade',
      'Caricaturas devem ser genéricas, não retratos de pessoas reais',
    ],
    concern: [
      'Não exagerar elementos de pânico',
      'Manter foco informativo, não alarmista',
    ],
    outrage: [
      'Figuras devem ser representações genéricas, não pessoas reais identificáveis',
      'Crítica deve ser inteligente, não ofensiva',
    ],
    anguish: [
      'Manter tom de respeito absoluto às vítimas',
      'Não explorar sofrimento de forma sensacionalista',
      'Evitar imagens perturbadoras ou traumatizantes',
    ],
    sarcasm: [
      'Ironia deve ser inteligente, não agressiva',
      'Evitar ataques pessoais diretos',
    ],
    satire: [
      'Sátira deve ser perspicaz e bem elaborada',
      'Evitar representações que possam ser consideradas difamatórias',
    ],
    happiness: [
      'Evitar exagero artificial',
      'Manter autenticidade nas expressões',
    ],
    celebration: [
      'Evitar elementos que possam ser considerados exclusivos',
      'Manter atmosfera de celebração inclusiva',
    ],
    doubt: [
      'Não sugerir conclusões específicas',
      'Manter abertura à interpretação',
    ],
    mystery: [
      'Evitar elementos macabros ou perturbadores',
      'Sugestão deve ser sutil, não explícita',
    ],
  };
  
  return [...baseRestrictions, ...(triggerRestrictions[trigger] || [])];
}

/**
 * Gera o prompt final formatado para a API de geração de imagem
 */
export function generateFinalImagePrompt(
  caricaturePrompt: CaricaturePrompt,
  aspectRatio: string = '16:9'
): string {
  return `${caricaturePrompt.basePrompt}

## DIREÇÃO ARTÍSTICA
${caricaturePrompt.styleModifiers.map(m => `• ${m}`).join('\n')}

## ELEMENTOS EMOCIONAIS
${caricaturePrompt.emotionalElements.map(e => `• ${e}`).join('\n')}

## PALETA DE CORES
Cores principais: ${caricaturePrompt.colorPalette.slice(0, 4).join(', ')}

## COMPOSIÇÃO
${caricaturePrompt.composition}

## RESTRIÇÕES OBRIGATÓRIAS
${caricaturePrompt.restrictions.map(r => `⚠️ ${r}`).join('\n')}

## ESPECIFICAÇÕES TÉCNICAS
- Formato: ${aspectRatio} (landscape para web)
- Resolução: Alta qualidade para publicação digital
- Estilo: Profissional e polido
- Adequado para blogs e redes sociais`;
}

/**
 * Gera prompt simplificado para fallback (quando caricatura não é necessária)
 */
export function generateStandardImagePrompt(
  trigger: EmotionalTrigger,
  title: string,
  aspectRatio: string = '16:9'
): string {
  const config = EMOTIONAL_TRIGGER_CONFIG[trigger];
  
  return `Crie uma fotografia profissional de alta qualidade para ilustrar:

"${title}"

## ESTILO
${config.promptModifiers.slice(0, 3).join('. ')}.

## ELEMENTOS VISUAIS
${config.visualElements.slice(0, 2).join('. ')}.

## CORES
Usar predominantemente: ${config.colorPalette.slice(0, 3).join(', ')}

## TÉCNICO
- Formato: ${aspectRatio} landscape
- Sem texto ou marcas d'água
- Alta resolução para web
- Estilo editorial profissional`;
}

/**
 * Gera alt text otimizado para SEO baseado no gatilho
 */
export function generateAltText(
  trigger: EmotionalTrigger,
  title: string,
  imageStyle: ImageStyle
): string {
  const styleDescriptions: Record<ImageStyle, string> = {
    photorealistic: 'Imagem ilustrativa',
    caricature: 'Caricatura editorial',
    cartoon: 'Ilustração cartoon',
    conceptual: 'Arte conceitual',
    dramatic: 'Fotografia dramática',
  };
  
  const style = styleDescriptions[imageStyle];
  
  // Limitar título a ~100 caracteres para alt text
  const shortTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
  
  return `${style}: ${shortTitle}`;
}
