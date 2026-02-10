/**
 * SISTEMA INTEGRADO DE GERAÇÃO DE IMAGENS EMOCIONAIS
 * ContentFactory RDM - Grupo SEO Marketing
 * 
 * Módulo principal que integra:
 * - Análise de tom emocional
 * - Decisão de ação de imagem
 * - Geração de prompts otimizados
 * - Integração com APIs de geração de imagem
 */

import {
  EmotionalTrigger,
  EmotionalAnalysis,
  ImageDecision,
  ImageStyle,
  EMOTIONAL_TRIGGER_CONFIG,
  getAllTriggers,
  shouldUseCaricature,
  canReuseOriginalImage
} from './emotional-triggers-config.ts';

import {
  analyzeEmotionalTone,
  quickKeywordAnalysis,
  analyzeEmotionalToneBatch
} from './emotional-analyzer.ts';

import {
  decideImageAction,
  checkOriginalImageQuality,
  buildEmotionalImagePrompt,
  generateFinalImagePrompt,
  generateStandardImagePrompt,
  generateAltText
} from './caricature-prompt-builder.ts';

// ============================================
// INTERFACE DE CONFIGURAÇÃO
// ============================================

export interface EmotionalImageConfig {
  // Função de chamada de IA (injetada pelo projeto)
  callAI?: (messages: Array<{role: string; content: string}>, options?: any) => Promise<string>;
  
  // Função de geração de imagem (injetada pelo projeto)
  generateImage?: (prompt: string, options?: any) => Promise<{ imageData: string; mimeType: string } | null>;
  
  // Configurações
  defaultAspectRatio?: string;
  forceCaricature?: boolean;
  allowOriginalImageReuse?: boolean;
  minConfidenceForAI?: number;
}

export interface EmotionalImageRequest {
  title: string;
  content: string;
  sourceName?: string;
  sourceUrl?: string;
  originalImageUrl?: string;
  
  // Overrides manuais
  forceTrigger?: EmotionalTrigger;
  forceStyle?: ImageStyle;
  forceCaricature?: boolean;
  
  // Contexto adicional
  persons?: string[];    // Pessoas mencionadas
  entities?: string[];   // Empresas, governos, etc.
  niche?: string;        // Nicho do conteúdo
  
  // Opções
  aspectRatio?: string;
  generateMultiple?: number;
}

export interface EmotionalImageResult {
  success: boolean;
  
  // Análise
  emotionalAnalysis: EmotionalAnalysis;
  imageDecision: ImageDecision;
  
  // Imagem gerada
  imageData?: string;
  mimeType?: string;
  altText?: string;
  promptUsed?: string;
  
  // Metadados
  processingTime?: number;
  source?: 'original' | 'generated';
  style?: ImageStyle;
  
  // Erros
  error?: string;
}

// ============================================
// CLASSE PRINCIPAL
// ============================================

export class EmotionalImageSystem {
  private config: EmotionalImageConfig;
  
  constructor(config: EmotionalImageConfig = {}) {
    this.config = {
      defaultAspectRatio: '16:9',
      allowOriginalImageReuse: true,
      minConfidenceForAI: 0.85,
      ...config
    };
  }
  
  /**
   * Processa uma notícia e gera imagem emocional apropriada
   */
  async processNewsImage(request: EmotionalImageRequest): Promise<EmotionalImageResult> {
    const startTime = Date.now();
    
    try {
      // 1. ANÁLISE DE TOM EMOCIONAL
      let analysis: EmotionalAnalysis;
      
      if (request.forceTrigger) {
        // Usar gatilho forçado
        analysis = {
          primaryTrigger: request.forceTrigger,
          confidence: 1.0,
          secondaryTriggers: [],
          suggestedStyle: EMOTIONAL_TRIGGER_CONFIG[request.forceTrigger].suggestedStyle,
          toneKeywords: [],
          emotionalIntensity: 'medium',
          reasoning: 'Gatilho definido manualmente'
        };
      } else {
        // Análise automática
        analysis = await analyzeEmotionalTone(
          request.title,
          request.content,
          request.sourceName,
          this.config.callAI
        );
      }
      
      console.log(`[EmotionalImage] Trigger: ${analysis.primaryTrigger} (${analysis.confidence})`);
      
      // 2. VERIFICAR QUALIDADE DA IMAGEM ORIGINAL (se fornecida)
      let hasHighQualityOriginal = false;
      
      if (request.originalImageUrl && this.config.allowOriginalImageReuse) {
        const qualityCheck = await checkOriginalImageQuality(request.originalImageUrl);
        hasHighQualityOriginal = qualityCheck.hasHighQuality;
        console.log(`[EmotionalImage] Original image quality: ${hasHighQualityOriginal}`);
      }
      
      // 3. DECISÃO DE AÇÃO
      let imageDecision: ImageDecision;
      
      if (request.forceCaricature) {
        imageDecision = {
          action: 'create_caricature',
          reason: 'Caricatura forçada pelo usuário',
          style: 'caricature',
          trigger: analysis.primaryTrigger
        };
      } else if (request.forceStyle) {
        imageDecision = {
          action: 'generate_new',
          reason: 'Estilo forçado pelo usuário',
          style: request.forceStyle,
          trigger: analysis.primaryTrigger
        };
      } else {
        imageDecision = decideImageAction(
          analysis,
          request.originalImageUrl,
          hasHighQualityOriginal
        );
      }
      
      console.log(`[EmotionalImage] Decision: ${imageDecision.action} (${imageDecision.style})`);
      
      // 4. EXECUTAR AÇÃO
      let imageData: string | undefined;
      let mimeType: string | undefined;
      let promptUsed: string | undefined;
      let source: 'original' | 'generated' = 'generated';
      
      switch (imageDecision.action) {
        case 'reuse_original':
          // Reutilizar imagem original
          imageData = request.originalImageUrl;
          source = 'original';
          promptUsed = 'Imagem original reutilizada';
          break;
          
        case 'create_caricature':
        case 'create_conceptual':
          // Criar imagem com prompt emocional elaborado
          if (this.config.generateImage) {
            const caricaturePrompt = buildEmotionalImagePrompt(
              imageDecision.trigger,
              request.title,
              request.content.substring(0, 500),
              {
                persons: request.persons,
                entities: request.entities,
                forceCaricature: true,
                aspectRatio: request.aspectRatio || this.config.defaultAspectRatio
              }
            );
            
            promptUsed = generateFinalImagePrompt(
              caricaturePrompt,
              request.aspectRatio || this.config.defaultAspectRatio
            );
            
            const result = await this.config.generateImage(promptUsed, {
              aspectRatio: request.aspectRatio || this.config.defaultAspectRatio
            });
            
            if (result) {
              imageData = result.imageData;
              mimeType = result.mimeType;
            }
          }
          break;
          
        case 'generate_new':
        default:
          // Gerar imagem padrão com tom emocional
          if (this.config.generateImage) {
            promptUsed = generateStandardImagePrompt(
              imageDecision.trigger,
              request.title,
              request.aspectRatio || this.config.defaultAspectRatio
            );
            
            const result = await this.config.generateImage(promptUsed, {
              aspectRatio: request.aspectRatio || this.config.defaultAspectRatio
            });
            
            if (result) {
              imageData = result.imageData;
              mimeType = result.mimeType;
            }
          }
          break;
      }
      
      // 5. GERAR ALT TEXT
      const altText = generateAltText(
        imageDecision.trigger,
        request.title,
        imageDecision.style
      );
      
      return {
        success: !!imageData,
        emotionalAnalysis: analysis,
        imageDecision,
        imageData,
        mimeType,
        altText,
        promptUsed,
        processingTime: Date.now() - startTime,
        source,
        style: imageDecision.style
      };
      
    } catch (error) {
      console.error('[EmotionalImage] Error:', error);
      
      return {
        success: false,
        emotionalAnalysis: quickKeywordAnalysis(request.title, request.content),
        imageDecision: {
          action: 'generate_new',
          reason: 'Fallback devido a erro',
          style: 'photorealistic',
          trigger: 'serious'
        },
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        processingTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Análise rápida de tom emocional (sem geração de imagem)
   */
  async analyzeOnly(
    title: string, 
    content: string, 
    sourceName?: string
  ): Promise<EmotionalAnalysis> {
    return analyzeEmotionalTone(
      title,
      content,
      sourceName,
      this.config.callAI
    );
  }
  
  /**
   * Análise em batch (para feeds RSS)
   */
  async analyzeBatch(
    items: Array<{ title: string; content: string; sourceName?: string }>
  ): Promise<EmotionalAnalysis[]> {
    return analyzeEmotionalToneBatch(items, this.config.callAI);
  }
  
  /**
   * Gera apenas o prompt (sem chamar API de imagem)
   */
  generatePromptOnly(
    trigger: EmotionalTrigger,
    title: string,
    context: string,
    options?: {
      persons?: string[];
      entities?: string[];
      forceCaricature?: boolean;
    }
  ): string {
    if (shouldUseCaricature(trigger) || options?.forceCaricature) {
      const prompt = buildEmotionalImagePrompt(
        trigger,
        title,
        context,
        options
      );
      return generateFinalImagePrompt(prompt);
    }
    
    return generateStandardImagePrompt(trigger, title);
  }
  
  /**
   * Retorna todos os gatilhos disponíveis
   */
  getAvailableTriggers() {
    return getAllTriggers();
  }
  
  /**
   * Retorna configuração de um gatilho específico
   */
  getTriggerConfig(trigger: EmotionalTrigger) {
    return EMOTIONAL_TRIGGER_CONFIG[trigger];
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Cria instância do sistema de imagens emocionais
 */
export function createEmotionalImageSystem(config?: EmotionalImageConfig): EmotionalImageSystem {
  return new EmotionalImageSystem(config);
}

// ============================================
// EXPORTS
// ============================================

export {
  // Types
  EmotionalTrigger,
  EmotionalAnalysis,
  ImageDecision,
  ImageStyle,
  
  // Config
  EMOTIONAL_TRIGGER_CONFIG,
  
  // Analyzer
  analyzeEmotionalTone,
  quickKeywordAnalysis,
  analyzeEmotionalToneBatch,
  
  // Prompt Builder
  decideImageAction,
  checkOriginalImageQuality,
  buildEmotionalImagePrompt,
  generateFinalImagePrompt,
  generateStandardImagePrompt,
  generateAltText,
  
  // Utilities
  getAllTriggers,
  shouldUseCaricature,
  canReuseOriginalImage
};
