/**
 * CARICATURE PROMPT BUILDER
 * Construtor de Prompts para Caricaturas e Decisor de Imagem
 * 
 * GrupoSEO AutoPost - ContentFactory RDM v2.0
 * 
 * Este módulo decide se deve reutilizar a imagem original ou criar nova,
 * e gera prompts otimizados para cada tipo de gatilho emocional.
 */

import {
  EmotionalTrigger,
  EmotionalAnalysis,
  ImageDecision,
  ImageAction,
  ImageStyle,
  CaricaturePrompt,
  TriggerConfig,
  getTriggerConfig,
  shouldUseCaricature,
  canReuseOriginalImage,
  getSuggestedStyle,
  getColorPalette,
} from './emotional-triggers-config.ts';

// ============================================================================
// TIPOS
// ============================================================================

export interface ImageDecisionInput {
  emotionalAnalysis: EmotionalAnalysis;
  originalImageUrl?: string;
  forceCaricature?: boolean;
  forceOriginal?: boolean;
  niche?: string;
}

export interface PromptBuildInput {
  title: string;
  emotionalAnalysis: EmotionalAnalysis;
  persons?: string[];
  niche?: string;
  aspectRatio?: '16:9' | '1:1' | '4:3';
}

// ============================================================================
// DECISOR DE IMAGEM
// ============================================================================

/**
 * Verifica se a URL da imagem original é válida e acessível
 */
export async function checkOriginalImageQuality(
  imageUrl: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    // Verifica se URL é válida
    const url = new URL(imageUrl);
    
    // Verifica extensão
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const hasValidExtension = validExtensions.some(ext => 
      url.pathname.toLowerCase().endsWith(ext)
    );
    
    if (!hasValidExtension && !url.pathname.includes('/images/')) {
      return { valid: false, reason: 'Invalid image extension' };
    }
    
    // Tenta fazer HEAD request para verificar se imagem existe
    const response = await fetch(imageUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      return { valid: false, reason: `HTTP ${response.status}` };
    }
    
    // Verifica content-type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return { valid: false, reason: 'Not an image content-type' };
    }
    
    // Verifica tamanho mínimo (pelo menos 10KB para não ser placeholder)
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > 0 && contentLength < 10000) {
      return { valid: false, reason: 'Image too small (probably placeholder)' };
    }
    
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      reason: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Decide qual ação tomar com a imagem baseado no gatilho emocional
 */
export async function decideImageAction(
  input: ImageDecisionInput
): Promise<ImageDecision> {
  const { emotionalAnalysis, originalImageUrl, forceCaricature, forceOriginal, niche } = input;
  const trigger = emotionalAnalysis.primaryTrigger;
  const config = getTriggerConfig(trigger);
  
  // Override: Forçar caricatura
  if (forceCaricature) {
    return {
      action: 'create_caricature',
      reason: 'Caricature forced by user',
      triggerUsed: trigger,
      style: shouldUseCaricature(trigger) ? config.suggestedStyle : 'caricature_colorful',
      shouldIncludeDisclaimer: true
    };
  }
  
  // Override: Forçar imagem original
  if (forceOriginal && originalImageUrl) {
    return {
      action: 'reuse_original',
      reason: 'Original image forced by user',
      triggerUsed: trigger,
      style: 'photorealistic_documentary',
      shouldIncludeDisclaimer: false
    };
  }
  
  // REGRA 1: Gatilhos que DEVEM reutilizar imagem original (se disponível)
  // serious, anguish - respeito ao tema
  if (['serious', 'anguish'].includes(trigger)) {
    if (originalImageUrl) {
      const imageCheck = await checkOriginalImageQuality(originalImageUrl);
      if (imageCheck.valid) {
        return {
          action: 'reuse_original',
          reason: `Trigger "${trigger}" prefers original image for respect`,
          triggerUsed: trigger,
          style: config.suggestedStyle,
          shouldIncludeDisclaimer: false
        };
      }
    }
    // Se não tem imagem ou falhou, gera nova com estilo sóbrio
    return {
      action: 'generate_new',
      reason: `No valid original image for ${trigger}, generating respectful new image`,
      triggerUsed: trigger,
      style: config.suggestedStyle,
      shouldIncludeDisclaimer: false
    };
  }
  
  // REGRA 2: concern - prefere original se disponível
  if (trigger === 'concern') {
    if (originalImageUrl) {
      const imageCheck = await checkOriginalImageQuality(originalImageUrl);
      if (imageCheck.valid) {
        return {
          action: 'reuse_original',
          reason: 'Concern trigger prefers original image for credibility',
          triggerUsed: trigger,
          style: config.suggestedStyle,
          shouldIncludeDisclaimer: false
        };
      }
    }
    return {
      action: 'generate_new',
      reason: 'Generating dramatic image for concern trigger',
      triggerUsed: trigger,
      style: 'photorealistic_dramatic',
      shouldIncludeDisclaimer: false
    };
  }
  
  // REGRA 3: Gatilhos que DEVEM criar caricatura
  // humor, sarcasm, satire, outrage
  if (['humor', 'sarcasm', 'satire', 'outrage'].includes(trigger)) {
    return {
      action: 'create_caricature',
      reason: `Trigger "${trigger}" requires caricature for engagement`,
      triggerUsed: trigger,
      style: config.suggestedStyle,
      shouldIncludeDisclaimer: true
    };
  }
  
  // REGRA 4: mystery e doubt - arte conceitual
  if (['mystery', 'doubt'].includes(trigger)) {
    return {
      action: 'create_conceptual',
      reason: `Trigger "${trigger}" requires conceptual/abstract art`,
      triggerUsed: trigger,
      style: config.suggestedStyle,
      shouldIncludeDisclaimer: false
    };
  }
  
  // REGRA 5: happiness e celebration - gerar nova vibrante
  if (['happiness', 'celebration'].includes(trigger)) {
    // Pode reutilizar se original for de qualidade
    if (originalImageUrl) {
      const imageCheck = await checkOriginalImageQuality(originalImageUrl);
      if (imageCheck.valid) {
        return {
          action: 'reuse_original',
          reason: 'Positive trigger can reuse quality original image',
          triggerUsed: trigger,
          style: config.suggestedStyle,
          shouldIncludeDisclaimer: false
        };
      }
    }
    return {
      action: 'generate_new',
      reason: 'Generating vibrant image for positive trigger',
      triggerUsed: trigger,
      style: config.suggestedStyle,
      shouldIncludeDisclaimer: false
    };
  }
  
  // REGRA 6: Fallback - gerar nova com estilo do nicho
  return {
    action: 'generate_new',
    reason: 'Default: generating new image based on niche and trigger',
    triggerUsed: trigger,
    style: config.suggestedStyle,
    shouldIncludeDisclaimer: false
  };
}

// ============================================================================
// CONSTRUTOR DE PROMPTS
// ============================================================================

/**
 * Gera elementos visuais emocionais para o prompt
 */
function getEmotionalElements(trigger: EmotionalTrigger): string {
  const elements: Record<EmotionalTrigger, string> = {
    serious: 'Composição equilibrada e profissional, iluminação neutra, tom jornalístico',
    humor: 'Expressões exageradas e cômicas, elementos de surpresa visual, proporções distorcidas para efeito cômico',
    concern: 'Iluminação dramática, cores de alerta (laranja/vermelho), tensão visual palpável',
    outrage: 'Símbolos de corrupção (notas, malas), expressão culpada exagerada, contraste dramático luz/sombra',
    anguish: 'Tons frios e dessaturados, silhuetas, composição que transmite vazio e perda',
    sarcasm: 'Expressão irônica sutil, elementos visuais contraditórios, humor inteligente',
    satire: 'Estilo charge de jornal, símbolos políticos reconhecíveis, exagero característico de cartoon editorial',
    happiness: 'Cores quentes e vibrantes, iluminação natural brilhante, energia positiva e celebratória',
    celebration: 'Múltiplas cores festivas, confetes, bandeiras, atmosfera de festa e alegria coletiva',
    doubt: 'Elementos abstratos, nebulosidade, composição que sugere incerteza e questionamento',
    mystery: 'Sombras enigmáticas, silhuetas parciais, elementos ocultos, atmosfera noir'
  };
  
  return elements[trigger] || elements.serious;
}

/**
 * Constrói o prompt completo para geração de imagem emocional
 */
export function buildEmotionalImagePrompt(
  input: PromptBuildInput
): CaricaturePrompt {
  const { title, emotionalAnalysis, persons = [], niche, aspectRatio = '16:9' } = input;
  const trigger = emotionalAnalysis.primaryTrigger;
  const config = getTriggerConfig(trigger);
  
  // Base do prompt
  let basePrompt = '';
  
  // Determina tipo de imagem
  if (shouldUseCaricature(trigger)) {
    basePrompt = `Caricatura editorial ${config.labelPtBr.toLowerCase()} de alta qualidade estilo charge de jornal brasileiro`;
  } else if (['mystery', 'doubt'].includes(trigger)) {
    basePrompt = `Arte conceitual abstrata com elementos simbólicos`;
  } else {
    basePrompt = `Fotografia profissional editorial de alta qualidade`;
  }
  
  // Modifiers de estilo
  const styleModifiers = config.promptModifiers;
  
  // Elementos emocionais
  const emotionalElements = getEmotionalElements(trigger);
  
  // Paleta de cores
  const colorPalette = config.colorPalette.join(', ');
  
  // Composição
  let composition = 'Composição equilibrada, regra dos terços';
  if (['humor', 'outrage', 'sarcasm', 'satire'].includes(trigger)) {
    composition = 'Composição dinâmica, ângulos inusitados, elementos de surpresa';
  } else if (['mystery', 'doubt'].includes(trigger)) {
    composition = 'Composição enigmática, elementos parcialmente visíveis, foco em sombras e ausência';
  } else if (['anguish'].includes(trigger)) {
    composition = 'Composição melancólica, espaços vazios, silhuetas distantes';
  }
  
  // Restrições (o que NÃO incluir)
  const restrictions: string[] = [
    ...config.negativePrompts,
    'texto na imagem',
    'marca d\'água',
    'logo',
  ];
  
  // Se tiver pessoas mencionadas e for caricatura
  if (shouldUseCaricature(trigger) && persons.length > 0) {
    restrictions.push(
      'NÃO criar rosto reconhecível de pessoa real',
      'Usar figura genérica que representa a categoria/profissão',
      'Evitar identificação direta'
    );
  }
  
  return {
    basePrompt,
    styleModifiers,
    emotionalElements,
    colorPalette,
    composition,
    restrictions
  };
}

/**
 * Gera o prompt final formatado para a API de geração de imagem
 */
export function generateFinalImagePrompt(
  input: PromptBuildInput
): string {
  const { title, aspectRatio = '16:9' } = input;
  const promptParts = buildEmotionalImagePrompt(input);
  const trigger = input.emotionalAnalysis.primaryTrigger;
  const config = getTriggerConfig(trigger);
  
  const prompt = `${promptParts.basePrompt}

TÍTULO/TEMA: "${title}"

DIREÇÃO VISUAL:
${promptParts.styleModifiers}

ELEMENTOS EMOCIONAIS:
${promptParts.emotionalElements}

PALETA DE CORES: ${promptParts.colorPalette}

COMPOSIÇÃO: ${promptParts.composition}

ESPECIFICAÇÕES TÉCNICAS:
- Aspect ratio: ${aspectRatio}
- Resolução: Alta definição
- Sem texto na imagem
- Sem marcas d'água

RESTRIÇÕES IMPORTANTES:
${promptParts.restrictions.map(r => `⚠️ ${r}`).join('\n')}

Gere uma imagem única e impactante que transmita o tom emocional "${config.labelPtBr}" para este conteúdo jornalístico.`;

  return prompt;
}

/**
 * Gera prompt simplificado para imagens padrão (non-emotional)
 */
export function generateStandardImagePrompt(
  title: string,
  niche: string = 'geral',
  aspectRatio: string = '16:9'
): string {
  const nichePrompts: Record<string, string> = {
    advocacia: 'ambiente jurídico profissional, martelo de juiz, documentos legais, tons marrom e dourado',
    saude: 'ambiente médico moderno, equipamentos de saúde, tons azul e branco, atmosfera de confiança',
    beleza: 'estética profissional, cuidados pessoais, tons suaves e elegantes, iluminação suave',
    tecnologia: 'elementos digitais futuristas, circuitos, telas, tons azul neon e ciano',
    marketing: 'gráficos de crescimento, métricas, design moderno, cores vibrantes',
    geral: 'fotografia editorial profissional, composição equilibrada, iluminação natural'
  };
  
  const nicheContext = nichePrompts[niche] || nichePrompts.geral;
  
  return `Fotografia profissional para artigo de blog.

TEMA: "${title}"

CONTEXTO VISUAL: ${nicheContext}

ESPECIFICAÇÕES:
- Aspect ratio: ${aspectRatio}
- Estilo: Editorial moderno e profissional
- Sem texto ou logotipos
- Alta resolução

Gere uma imagem que represente visualmente o tema de forma profissional e atrativa.`;
}

// ============================================================================
// GERADOR DE ALT TEXT
// ============================================================================

/**
 * Gera alt text SEO-optimizado para a imagem
 */
export function generateAltText(
  title: string,
  trigger: EmotionalTrigger,
  action: ImageAction
): string {
  const config = getTriggerConfig(trigger);
  
  // Prefixo baseado na ação
  let prefix = 'Imagem ilustrativa:';
  
  if (action === 'create_caricature') {
    prefix = 'Caricatura:';
  } else if (action === 'create_conceptual') {
    prefix = 'Arte conceitual:';
  } else if (action === 'reuse_original') {
    prefix = 'Foto:';
  }
  
  // Limita título a 100 caracteres
  const shortTitle = title.length > 100 
    ? title.substring(0, 97) + '...' 
    : title;
  
  return `${prefix} ${shortTitle}`;
}

/**
 * Gera disclaimer para caricaturas
 */
export function generateDisclaimer(trigger: EmotionalTrigger): string {
  if (['humor', 'sarcasm', 'satire', 'outrage'].includes(trigger)) {
    return 'Esta imagem é uma representação artística/caricatura e não reflete a aparência real das pessoas envolvidas.';
  }
  return '';
}
