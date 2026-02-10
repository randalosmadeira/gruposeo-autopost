/**
 * EMOTIONAL ANALYZER
 * Analisador de Tom Emocional para Notícias
 * 
 * GrupoSEO AutoPost - ContentFactory RDM v2.0
 * 
 * Este módulo detecta automaticamente o gatilho emocional de uma notícia
 * usando análise por keywords (rápida/gratuita) e/ou IA (profunda).
 */

import {
  EmotionalTrigger,
  EmotionalAnalysis,
  TRIGGER_KEYWORDS,
  EMOTIONAL_TRIGGER_CONFIG,
  getAllTriggers,
} from './emotional-triggers-config.ts';

// ============================================================================
// TIPOS
// ============================================================================

interface AnalyzerOptions {
  /** Usar apenas análise por keywords (sem IA) */
  keywordsOnly?: boolean;
  
  /** Confiança mínima para aceitar resultado de keywords (0-100) */
  minKeywordConfidence?: number;
  
  /** Função para chamar IA (opcional) */
  callAI?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  
  /** Gatilho forçado (override manual) */
  forceTrigger?: EmotionalTrigger;
}

interface ContentToAnalyze {
  title: string;
  content: string;
  sourceName?: string;
}

// ============================================================================
// ANÁLISE POR KEYWORDS (RÁPIDA)
// ============================================================================

/**
 * Analisa o tom emocional usando apenas palavras-chave
 * Retorna análise com confiança baseada em matches encontrados
 */
export function quickKeywordAnalysis(
  content: ContentToAnalyze
): EmotionalAnalysis {
  const title = content.title.toLowerCase();
  const body = content.content.toLowerCase();
  const fullText = `${title} ${body}`;
  
  // Contagem de matches por gatilho
  const triggerScores: Record<EmotionalTrigger, number> = {} as Record<EmotionalTrigger, number>;
  const keywordsFound: string[] = [];
  
  // Inicializa scores
  getAllTriggers().forEach(trigger => {
    triggerScores[trigger] = 0;
  });
  
  // Analisa keywords globais
  Object.entries(TRIGGER_KEYWORDS).forEach(([keyword, triggers]) => {
    const keywordLower = keyword.toLowerCase();
    
    // Peso maior para título (3x) vs corpo (1x)
    const titleMatches = (title.match(new RegExp(keywordLower, 'g')) || []).length;
    const bodyMatches = (body.match(new RegExp(keywordLower, 'g')) || []).length;
    
    const score = (titleMatches * 3) + bodyMatches;
    
    if (score > 0) {
      keywordsFound.push(keyword);
      triggers.forEach(trigger => {
        triggerScores[trigger] += score;
      });
    }
  });
  
  // Analisa keywords específicas de cada gatilho
  getAllTriggers().forEach(trigger => {
    const config = EMOTIONAL_TRIGGER_CONFIG[trigger];
    
    // Headlines (peso 2x)
    config.headlines.forEach(headline => {
      const headlineLower = headline.toLowerCase();
      if (title.includes(headlineLower)) {
        triggerScores[trigger] += 2;
        if (!keywordsFound.includes(headline)) {
          keywordsFound.push(headline);
        }
      }
    });
    
    // Body keywords (peso 1x)
    config.bodyKeywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (body.includes(keywordLower)) {
        triggerScores[trigger] += 1;
      }
    });
  });
  
  // Ordena gatilhos por score
  const sortedTriggers = Object.entries(triggerScores)
    .sort(([, a], [, b]) => b - a)
    .map(([trigger]) => trigger as EmotionalTrigger);
  
  const primaryTrigger = sortedTriggers[0];
  const primaryScore = triggerScores[primaryTrigger];
  const secondaryTrigger = sortedTriggers[1];
  const secondaryScore = triggerScores[secondaryTrigger];
  
  // Calcula confiança baseada na diferença entre primeiro e segundo
  let confidence = 50; // Base
  
  if (primaryScore > 0) {
    // Aumenta confiança se houver grande diferença
    const scoreDiff = primaryScore - secondaryScore;
    confidence = Math.min(95, 50 + (scoreDiff * 10) + (primaryScore * 5));
  }
  
  // Determina intensidade emocional
  let emotionalIntensity: 'low' | 'medium' | 'high' = 'low';
  if (primaryScore >= 10) {
    emotionalIntensity = 'high';
  } else if (primaryScore >= 5) {
    emotionalIntensity = 'medium';
  }
  
  // Se nenhum match, retorna 'serious' como padrão seguro
  if (primaryScore === 0) {
    return {
      primaryTrigger: 'serious',
      confidence: 30,
      secondaryTriggers: [],
      emotionalIntensity: 'low',
      keywordsFound: [],
      analysisMethod: 'keywords'
    };
  }
  
  // Gatilhos secundários (score > 0 e pelo menos 30% do primário)
  const secondaryTriggers = sortedTriggers
    .slice(1)
    .filter(t => triggerScores[t] > 0 && triggerScores[t] >= primaryScore * 0.3)
    .slice(0, 2);
  
  return {
    primaryTrigger,
    confidence,
    secondaryTriggers,
    emotionalIntensity,
    keywordsFound,
    analysisMethod: 'keywords'
  };
}

// ============================================================================
// ANÁLISE PROFUNDA COM IA
// ============================================================================

/**
 * Prompt para análise de tom emocional via IA
 */
function buildEmotionalAnalysisPrompt(content: ContentToAnalyze): string {
  return `
Analise o tom emocional dominante desta notícia e classifique em UM dos 11 gatilhos:

## GATILHOS DISPONÍVEIS:
1. **serious** - Tom grave, factual, informativo (notícias de impacto, decisões judiciais)
2. **humor** - Situações engraçadas, virais, memes, gafes
3. **concern** - Alertas, riscos, ameaças, situações preocupantes
4. **outrage** - Escândalos, corrupção, injustiças, indignação
5. **anguish** - Tragédias, perdas, sofrimento, luto
6. **sarcasm** - Ironias, contradições, hipocrisia
7. **satire** - Crítica social/política através do humor
8. **happiness** - Boas notícias, conquistas, vitórias pessoais
9. **celebration** - Eventos festivos, aniversários, marcos históricos
10. **doubt** - Investigações em andamento, especulações, incertezas
11. **mystery** - Casos sem resposta, enigmas, desaparecimentos

## NOTÍCIA PARA ANÁLISE:

**Título:** ${content.title}

**Conteúdo:**
${content.content.substring(0, 2000)}${content.content.length > 2000 ? '...' : ''}

${content.sourceName ? `**Fonte:** ${content.sourceName}` : ''}

## INSTRUÇÕES:
1. Analise o tom PREDOMINANTE da notícia
2. Considere o impacto emocional que a notícia causa no leitor
3. Se houver elementos de múltiplos tons, escolha o MAIS FORTE

## RESPOSTA (JSON APENAS):
\`\`\`json
{
  "primaryTrigger": "código do gatilho principal",
  "confidence": 0-100,
  "secondaryTriggers": ["gatilho2", "gatilho3"],
  "emotionalIntensity": "low|medium|high",
  "reasoning": "Explicação em 1 linha"
}
\`\`\`
`;
}

/**
 * Analisa o tom emocional usando IA
 */
export async function deepAIAnalysis(
  content: ContentToAnalyze,
  callAI: (messages: Array<{ role: string; content: string }>) => Promise<string>
): Promise<EmotionalAnalysis> {
  try {
    const prompt = buildEmotionalAnalysisPrompt(content);
    
    const response = await callAI([
      { role: 'system', content: 'Você é um especialista em análise de sentimentos e tons jornalísticos. Responda apenas em JSON.' },
      { role: 'user', content: prompt }
    ]);
    
    // Extrai JSON da resposta
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Valida gatilho
    const validTriggers = getAllTriggers();
    const primaryTrigger = validTriggers.includes(parsed.primaryTrigger) 
      ? parsed.primaryTrigger 
      : 'serious';
    
    const secondaryTriggers = (parsed.secondaryTriggers || [])
      .filter((t: string) => validTriggers.includes(t as EmotionalTrigger))
      .slice(0, 2);
    
    return {
      primaryTrigger,
      confidence: Math.min(100, Math.max(0, parsed.confidence || 70)),
      secondaryTriggers,
      emotionalIntensity: ['low', 'medium', 'high'].includes(parsed.emotionalIntensity) 
        ? parsed.emotionalIntensity 
        : 'medium',
      keywordsFound: [],
      analysisMethod: 'ai'
    };
  } catch (error) {
    console.error('AI analysis failed:', error);
    
    // Fallback para análise por keywords
    return {
      ...quickKeywordAnalysis(content),
      analysisMethod: 'keywords'
    };
  }
}

// ============================================================================
// ANÁLISE HÍBRIDA (RECOMENDADA)
// ============================================================================

/**
 * Combina análise por keywords com IA para máxima precisão
 * - Se keywords tiver alta confiança (>85%), usa direto
 * - Se confiança baixa, chama IA para refinar
 */
export async function analyzeEmotionalTone(
  content: ContentToAnalyze,
  options: AnalyzerOptions = {}
): Promise<EmotionalAnalysis> {
  // Override manual
  if (options.forceTrigger) {
    return {
      primaryTrigger: options.forceTrigger,
      confidence: 100,
      secondaryTriggers: [],
      emotionalIntensity: 'medium',
      keywordsFound: [],
      analysisMethod: 'keywords'
    };
  }
  
  // Análise rápida por keywords
  const keywordAnalysis = quickKeywordAnalysis(content);
  
  // Se apenas keywords ou alta confiança, retorna direto
  const minConfidence = options.minKeywordConfidence || 85;
  if (options.keywordsOnly || keywordAnalysis.confidence >= minConfidence) {
    return keywordAnalysis;
  }
  
  // Se tiver função de IA, faz análise profunda
  if (options.callAI) {
    const aiAnalysis = await deepAIAnalysis(content, options.callAI);
    
    // Combina resultados (híbrido)
    return mergeAnalysis(keywordAnalysis, aiAnalysis);
  }
  
  // Sem IA disponível, retorna análise por keywords
  return keywordAnalysis;
}

/**
 * Combina análises de keywords e IA
 */
function mergeAnalysis(
  keywords: EmotionalAnalysis,
  ai: EmotionalAnalysis
): EmotionalAnalysis {
  // Se ambos concordam, alta confiança
  if (keywords.primaryTrigger === ai.primaryTrigger) {
    return {
      primaryTrigger: ai.primaryTrigger,
      confidence: Math.min(98, Math.max(keywords.confidence, ai.confidence) + 10),
      secondaryTriggers: [...new Set([...keywords.secondaryTriggers, ...ai.secondaryTriggers])].slice(0, 2),
      emotionalIntensity: ai.emotionalIntensity,
      keywordsFound: keywords.keywordsFound,
      analysisMethod: 'hybrid'
    };
  }
  
  // Se discordam, prioriza IA se tiver alta confiança
  if (ai.confidence >= 80) {
    return {
      ...ai,
      secondaryTriggers: [keywords.primaryTrigger, ...ai.secondaryTriggers].slice(0, 2),
      keywordsFound: keywords.keywordsFound,
      analysisMethod: 'hybrid'
    };
  }
  
  // Prioriza keywords se IA tiver baixa confiança
  if (keywords.confidence >= 70) {
    return {
      ...keywords,
      secondaryTriggers: [ai.primaryTrigger, ...keywords.secondaryTriggers].slice(0, 2),
      analysisMethod: 'hybrid'
    };
  }
  
  // Caso duvidoso, usa IA
  return {
    ...ai,
    confidence: Math.max(ai.confidence, keywords.confidence),
    keywordsFound: keywords.keywordsFound,
    analysisMethod: 'hybrid'
  };
}

// ============================================================================
// ANÁLISE EM LOTE
// ============================================================================

/**
 * Analisa múltiplas notícias (útil para processamento de feeds RSS)
 */
export async function analyzeEmotionalToneBatch(
  contents: ContentToAnalyze[],
  options: AnalyzerOptions = {}
): Promise<EmotionalAnalysis[]> {
  // Análise por keywords é rápida, pode fazer em paralelo
  const results = await Promise.all(
    contents.map(content => analyzeEmotionalTone(content, {
      ...options,
      // Para lotes, usa apenas keywords para economia
      keywordsOnly: options.keywordsOnly !== false,
    }))
  );
  
  return results;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Valida se uma string é um gatilho válido
 */
export function isValidTrigger(trigger: string): trigger is EmotionalTrigger {
  return getAllTriggers().includes(trigger as EmotionalTrigger);
}

/**
 * Obtém gatilho padrão para fallback
 */
export function getDefaultTrigger(): EmotionalTrigger {
  return 'serious';
}

/**
 * Converte análise para log simplificado
 */
export function analysisToLog(analysis: EmotionalAnalysis): Record<string, unknown> {
  return {
    trigger: analysis.primaryTrigger,
    confidence: analysis.confidence,
    intensity: analysis.emotionalIntensity,
    method: analysis.analysisMethod,
    keywords: analysis.keywordsFound.length,
  };
}
