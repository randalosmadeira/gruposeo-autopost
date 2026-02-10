/**
 * EMOTIONAL IMAGE SYSTEM
 * Sistema Integrado de Imagens com Gatilhos Emocionais
 * 
 * GrupoSEO AutoPost - ContentFactory RDM v2.0
 * 
 * Este módulo é o ponto de entrada principal para o sistema de imagens emocionais.
 * Integra análise de tom, decisão de imagem e geração de prompts.
 * 
 * USO:
 * ```typescript
 * import { createEmotionalImageSystem } from '../_shared/emotional/emotional-image-system.ts';
 * 
 * const emotionalSystem = createEmotionalImageSystem({
 *   callAI: callAI,
 *   generateImage: generateGeminiImage,
 * });
 * 
 * const result = await emotionalSystem.processNewsImage({
 *   title: "Título da notícia",
 *   content: "Conteúdo completo...",
 *   originalImageUrl: "https://...",
 * });
 * ```
 */

import {
  EmotionalTrigger,
  EmotionalAnalysis,
  ImageDecision,
  ImageStyle,
  getTriggerConfig,
} from './emotional-triggers-config.ts';

import {
  analyzeEmotionalTone,
  quickKeywordAnalysis,
  analysisToLog,
} from './emotional-analyzer.ts';

import {
  decideImageAction,
  generateFinalImagePrompt,
  generateStandardImagePrompt,
  generateAltText,
  generateDisclaimer,
  checkOriginalImageQuality,
} from './caricature-prompt-builder.ts';

// ============================================================================
// TIPOS
// ============================================================================

export interface EmotionalImageSystemConfig {
  /** Função para chamar IA (Gemini/Claude) */
  callAI?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  
  /** Função para gerar imagem */
  generateImage: (
    prompt: string, 
    options?: { aspectRatio?: string }
  ) => Promise<{ imageData: string; mimeType: string } | null>;
  
  /** Aspect ratio padrão */
  defaultAspectRatio?: '16:9' | '1:1' | '4:3';
  
  /** Permitir reutilização de imagem original */
  allowOriginalImageReuse?: boolean;
  
  /** Confiança mínima para análise por keywords (0-100) */
  minKeywordConfidence?: number;
}

export interface EmotionalImageRequest {
  /** Título da notícia */
  title: string;
  
  /** Conteúdo completo da notícia */
  content: string;
  
  /** Nome do veículo de origem */
  sourceName?: string;
  
  /** URL da notícia original */
  sourceUrl?: string;
  
  /** URL da imagem original (para possível reutilização) */
  originalImageUrl?: string;
  
  /** Pessoas mencionadas (para evitar em caricaturas) */
  persons?: string[];
  
  /** Nicho do conteúdo */
  niche?: string;
  
  /** Forçar criação de caricatura */
  forceCaricature?: boolean;
  
  /** Forçar reutilização da imagem original */
  forceOriginal?: boolean;
  
  /** Override manual do gatilho emocional */
  emotionalTrigger?: EmotionalTrigger;
  
  /** Aspect ratio desejado */
  aspectRatio?: '16:9' | '1:1' | '4:3';
}

export interface EmotionalImageResult {
  /** Dados da imagem (base64 ou URL) */
  imageData: string | null;
  
  /** Origem da imagem */
  imageSource: 'original' | 'caricature' | 'generated' | 'conceptual';
  
  /** Análise emocional completa */
  emotionalAnalysis: EmotionalAnalysis;
  
  /** Decisão tomada */
  decision: ImageDecision;
  
  /** Prompt usado (se gerado) */
  prompt?: string;
  
  /** Alt text SEO */
  altText: string;
  
  /** Disclaimer (se aplicável) */
  disclaimer?: string;
  
  /** Sucesso da operação */
  success: boolean;
  
  /** Erro (se houver) */
  error?: string;
}

// ============================================================================
// CLASSE PRINCIPAL
// ============================================================================

export class EmotionalImageSystem {
  private config: EmotionalImageSystemConfig;
  
  constructor(config: EmotionalImageSystemConfig) {
    this.config = {
      defaultAspectRatio: '16:9',
      allowOriginalImageReuse: true,
      minKeywordConfidence: 85,
      ...config,
    };
  }
  
  /**
   * Processa uma notícia e retorna a imagem adequada
   * Este é o método principal a ser usado
   */
  async processNewsImage(
    request: EmotionalImageRequest
  ): Promise<EmotionalImageResult> {
    const startTime = Date.now();
    
    try {
      // 1. Análise de tom emocional
      const emotionalAnalysis = await this.analyzeContent(request);
      
      console.log('[EmotionalImageSystem] Analysis:', analysisToLog(emotionalAnalysis));
      
      // 2. Decisão de imagem
      const decision = await decideImageAction({
        emotionalAnalysis,
        originalImageUrl: this.config.allowOriginalImageReuse 
          ? request.originalImageUrl 
          : undefined,
        forceCaricature: request.forceCaricature,
        forceOriginal: request.forceOriginal,
        niche: request.niche,
      });
      
      console.log('[EmotionalImageSystem] Decision:', decision.action, decision.reason);
      
      // 3. Executar ação
      let imageData: string | null = null;
      let imageSource: EmotionalImageResult['imageSource'] = 'generated';
      let prompt: string | undefined;
      
      switch (decision.action) {
        case 'reuse_original':
          // Reutiliza imagem original
          imageData = request.originalImageUrl || null;
          imageSource = 'original';
          break;
          
        case 'create_caricature':
          // Gera caricatura
          prompt = generateFinalImagePrompt({
            title: request.title,
            emotionalAnalysis,
            persons: request.persons,
            niche: request.niche,
            aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
          });
          
          const caricatureResult = await this.config.generateImage(prompt, {
            aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
          });
          
          imageData = caricatureResult?.imageData || null;
          imageSource = 'caricature';
          break;
          
        case 'create_conceptual':
          // Gera arte conceitual
          prompt = generateFinalImagePrompt({
            title: request.title,
            emotionalAnalysis,
            persons: request.persons,
            niche: request.niche,
            aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
          });
          
          const conceptualResult = await this.config.generateImage(prompt, {
            aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
          });
          
          imageData = conceptualResult?.imageData || null;
          imageSource = 'conceptual';
          break;
          
        case 'generate_new':
        default:
          // Gera nova imagem padrão
          prompt = generateFinalImagePrompt({
            title: request.title,
            emotionalAnalysis,
            persons: request.persons,
            niche: request.niche,
            aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
          });
          
          const newResult = await this.config.generateImage(prompt, {
            aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
          });
          
          imageData = newResult?.imageData || null;
          imageSource = 'generated';
          break;
      }
      
      // 4. Gerar metadados
      const altText = generateAltText(
        request.title,
        emotionalAnalysis.primaryTrigger,
        decision.action
      );
      
      const disclaimer = decision.shouldIncludeDisclaimer 
        ? generateDisclaimer(emotionalAnalysis.primaryTrigger)
        : undefined;
      
      const duration = Date.now() - startTime;
      console.log(`[EmotionalImageSystem] Completed in ${duration}ms`);
      
      return {
        imageData,
        imageSource,
        emotionalAnalysis,
        decision,
        prompt,
        altText,
        disclaimer,
        success: true,
      };
      
    } catch (error) {
      console.error('[EmotionalImageSystem] Error:', error);
      
      // Fallback: tenta gerar imagem padrão
      try {
        const fallbackPrompt = generateStandardImagePrompt(
          request.title,
          request.niche,
          request.aspectRatio || this.config.defaultAspectRatio
        );
        
        const fallbackResult = await this.config.generateImage(fallbackPrompt, {
          aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
        });
        
        return {
          imageData: fallbackResult?.imageData || null,
          imageSource: 'generated',
          emotionalAnalysis: {
            primaryTrigger: 'serious',
            confidence: 50,
            secondaryTriggers: [],
            emotionalIntensity: 'medium',
            keywordsFound: [],
            analysisMethod: 'keywords',
          },
          decision: {
            action: 'generate_new',
            reason: 'Fallback after error',
            triggerUsed: 'serious',
            style: 'photorealistic_documentary',
            shouldIncludeDisclaimer: false,
          },
          altText: `Imagem ilustrativa: ${request.title.substring(0, 100)}`,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      } catch (fallbackError) {
        return {
          imageData: null,
          imageSource: 'generated',
          emotionalAnalysis: {
            primaryTrigger: 'serious',
            confidence: 0,
            secondaryTriggers: [],
            emotionalIntensity: 'low',
            keywordsFound: [],
            analysisMethod: 'keywords',
          },
          decision: {
            action: 'generate_new',
            reason: 'Complete failure',
            triggerUsed: 'serious',
            style: 'photorealistic_documentary',
            shouldIncludeDisclaimer: false,
          },
          altText: `Imagem: ${request.title.substring(0, 50)}`,
          success: false,
          error: 'Failed to generate any image',
        };
      }
    }
  }
  
  /**
   * Analisa o conteúdo e retorna a análise emocional
   */
  private async analyzeContent(
    request: EmotionalImageRequest
  ): Promise<EmotionalAnalysis> {
    // Override manual
    if (request.emotionalTrigger) {
      return {
        primaryTrigger: request.emotionalTrigger,
        confidence: 100,
        secondaryTriggers: [],
        emotionalIntensity: 'medium',
        keywordsFound: [],
        analysisMethod: 'keywords',
      };
    }
    
    // Análise automática
    return await analyzeEmotionalTone(
      {
        title: request.title,
        content: request.content,
        sourceName: request.sourceName,
      },
      {
        callAI: this.config.callAI,
        minKeywordConfidence: this.config.minKeywordConfidence,
      }
    );
  }
  
  /**
   * Apenas analisa o tom, sem gerar imagem
   */
  async analyzeOnly(
    request: Pick<EmotionalImageRequest, 'title' | 'content' | 'sourceName' | 'emotionalTrigger'>
  ): Promise<EmotionalAnalysis> {
    return this.analyzeContent(request as EmotionalImageRequest);
  }
  
  /**
   * Analisa múltiplas notícias em lote
   */
  async analyzeBatch(
    requests: Array<Pick<EmotionalImageRequest, 'title' | 'content' | 'sourceName'>>
  ): Promise<EmotionalAnalysis[]> {
    // Usa apenas keywords para velocidade
    return requests.map(req => quickKeywordAnalysis({
      title: req.title,
      content: req.content,
      sourceName: req.sourceName,
    }));
  }
  
  /**
   * Gera apenas o prompt sem executar geração
   */
  async generatePromptOnly(
    request: EmotionalImageRequest
  ): Promise<{ prompt: string; decision: ImageDecision }> {
    const emotionalAnalysis = await this.analyzeContent(request);
    
    const decision = await decideImageAction({
      emotionalAnalysis,
      originalImageUrl: request.originalImageUrl,
      forceCaricature: request.forceCaricature,
      niche: request.niche,
    });
    
    const prompt = generateFinalImagePrompt({
      title: request.title,
      emotionalAnalysis,
      persons: request.persons,
      niche: request.niche,
      aspectRatio: request.aspectRatio || this.config.defaultAspectRatio,
    });
    
    return { prompt, decision };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Cria uma instância do sistema de imagens emocionais
 */
export function createEmotionalImageSystem(
  config: EmotionalImageSystemConfig
): EmotionalImageSystem {
  return new EmotionalImageSystem(config);
}

// ============================================================================
// EXPORTS
// ============================================================================

// Re-export tipos principais para conveniência
export type {
  EmotionalTrigger,
  EmotionalAnalysis,
  ImageDecision,
  ImageStyle,
};

// Re-export funções utilitárias
export {
  getTriggerConfig,
  quickKeywordAnalysis,
  analyzeEmotionalTone,
  generateAltText,
  generateDisclaimer,
  checkOriginalImageQuality,
};
