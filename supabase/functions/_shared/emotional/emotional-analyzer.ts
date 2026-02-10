/**
 * ANALISADOR DE TOM EMOCIONAL
 * ContentFactory RDM - Grupo SEO Marketing
 * 
 * Analisa o conteúdo da notícia e identifica o gatilho emocional predominante
 * usando análise de palavras-chave (rápida) e IA (profunda).
 */

import { 
  EmotionalTrigger, 
  EmotionalAnalysis, 
  EMOTIONAL_TRIGGER_CONFIG,
  TRIGGER_KEYWORDS,
  getSuggestedIntensity
} from './emotional-triggers-config.ts';

// Importar função de chamada de IA do projeto
// import { callAI } from './gemini.ts';

/**
 * Analisa o conteúdo e identifica o gatilho emocional predominante
 * Usa análise híbrida: keywords (rápido) + IA (quando necessário)
 */
export async function analyzeEmotionalTone(
  title: string,
  content: string,
  sourceName?: string,
  callAI?: (messages: Array<{role: string; content: string}>, options?: any) => Promise<string>
): Promise<EmotionalAnalysis> {
  
  // Pré-análise por palavras-chave (rápida e sem custo)
  const preAnalysis = quickKeywordAnalysis(title, content);
  
  // Se confiança alta na pré-análise (>85%), usar diretamente
  if (preAnalysis.confidence > 0.85) {
    console.log(`[EmotionalAnalyzer] High confidence keyword analysis: ${preAnalysis.primaryTrigger} (${preAnalysis.confidence})`);
    return preAnalysis;
  }
  
  // Se não há função de IA disponível, retornar pré-análise
  if (!callAI) {
    console.log(`[EmotionalAnalyzer] No AI function provided, using keyword analysis`);
    return preAnalysis;
  }
  
  // Análise profunda com IA para casos de baixa confiança
  try {
    console.log(`[EmotionalAnalyzer] Running deep AI analysis...`);
    const aiAnalysis = await deepAIAnalysis(title, content, sourceName, callAI);
    
    // Combinar resultados: IA tem precedência mas considera keywords
    return mergeAnalysis(preAnalysis, aiAnalysis);
    
  } catch (error) {
    console.error('[EmotionalAnalyzer] AI analysis failed, using keyword analysis:', error);
    return preAnalysis; // Fallback para pré-análise
  }
}

/**
 * Análise rápida por palavras-chave
 * Sem custo de API, ideal para triagem inicial
 */
export function quickKeywordAnalysis(title: string, content: string): EmotionalAnalysis {
  const fullText = `${title} ${content}`.toLowerCase();
  
  // Inicializar scores para todos os gatilhos
  const triggerScores: Record<EmotionalTrigger, number> = {
    serious: 0, 
    humor: 0, 
    concern: 0, 
    outrage: 0, 
    anguish: 0,
    sarcasm: 0, 
    satire: 0, 
    happiness: 0, 
    celebration: 0, 
    doubt: 0, 
    mystery: 0
  };
  
  const matchedKeywords: string[] = [];
  
  // Calcular scores baseado em palavras-chave
  for (const [keyword, triggers] of Object.entries(TRIGGER_KEYWORDS)) {
    // Verificar se keyword existe no texto
    const keywordLower = keyword.toLowerCase();
    const regex = new RegExp(`\\b${escapeRegex(keywordLower)}\\b`, 'gi');
    const matches = fullText.match(regex);
    
    if (matches && matches.length > 0) {
      matchedKeywords.push(keyword);
      
      // Aplicar peso por posição e frequência
      const inTitle = title.toLowerCase().includes(keywordLower);
      const frequency = matches.length;
      
      triggers.forEach((trigger, index) => {
        // Primeiro trigger na lista tem peso maior
        const positionWeight = 2 - (index * 0.5);
        // Keyword no título tem peso extra
        const titleBonus = inTitle ? 1.5 : 1;
        // Frequência adiciona peso (max 2x)
        const frequencyBonus = Math.min(2, 1 + (frequency - 1) * 0.2);
        
        triggerScores[trigger] += positionWeight * titleBonus * frequencyBonus;
      });
    }
  }
  
  // Encontrar trigger com maior score
  let primaryTrigger: EmotionalTrigger = 'serious'; // Default
  let maxScore = 0;
  
  for (const [trigger, score] of Object.entries(triggerScores)) {
    if (score > maxScore) {
      maxScore = score;
      primaryTrigger = trigger as EmotionalTrigger;
    }
  }
  
  // Calcular confiança baseada na diferença de scores
  const sortedScores = Object.values(triggerScores).sort((a, b) => b - a);
  const scoreDiff = sortedScores[0] - (sortedScores[1] || 0);
  
  // Confiança baseada em:
  // 1. Diferença entre primeiro e segundo lugar
  // 2. Número de keywords matched
  // 3. Score absoluto do vencedor
  let confidence = 0.5; // Base
  
  if (maxScore > 0) {
    confidence += Math.min(0.3, scoreDiff * 0.1);          // Diferença
    confidence += Math.min(0.1, matchedKeywords.length * 0.02); // Quantidade
    confidence += Math.min(0.1, maxScore * 0.03);          // Score absoluto
  }
  
  confidence = Math.min(0.95, confidence); // Cap em 95%
  
  // Triggers secundários (scores > 0 e diferentes do primário)
  const secondaryTriggers = Object.entries(triggerScores)
    .filter(([t, s]) => s > 0 && t !== primaryTrigger)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t as EmotionalTrigger);
  
  // Obter configuração do trigger vencedor
  const config = EMOTIONAL_TRIGGER_CONFIG[primaryTrigger];
  
  return {
    primaryTrigger,
    confidence,
    secondaryTriggers,
    suggestedStyle: config.suggestedStyle,
    toneKeywords: matchedKeywords.slice(0, 5),
    emotionalIntensity: getSuggestedIntensity(primaryTrigger),
    reasoning: `Análise de keywords: ${matchedKeywords.length} palavras encontradas. Score: ${maxScore.toFixed(2)}`
  };
}

/**
 * Análise profunda usando IA
 * Mais precisa mas com custo de API
 */
async function deepAIAnalysis(
  title: string,
  content: string,
  sourceName: string | undefined,
  callAI: (messages: Array<{role: string; content: string}>, options?: any) => Promise<string>
): Promise<EmotionalAnalysis> {
  
  const triggerDescriptions = Object.entries(EMOTIONAL_TRIGGER_CONFIG)
    .map(([id, config], index) => `${index + 1}. **${id}** - ${config.description}`)
    .join('\n');
  
  const prompt = `
Você é um especialista em análise de tom emocional para jornalismo e marketing de conteúdo.

Analise o seguinte conteúdo e identifique o GATILHO EMOCIONAL predominante:

**TÍTULO:** ${title}
**FONTE:** ${sourceName || 'Não informada'}
**CONTEÚDO (primeiros 1500 caracteres):**
${content.substring(0, 1500)}

---

## GATILHOS DISPONÍVEIS:

${triggerDescriptions}

---

## INSTRUÇÕES:

1. Analise o tom geral do conteúdo
2. Identifique palavras e expressões que indicam emoção
3. Considere o contexto da notícia
4. Escolha o gatilho que MELHOR representa o tom predominante

## RETORNE APENAS JSON (sem markdown, sem explicações antes ou depois):

{
  "primaryTrigger": "código_do_gatilho",
  "confidence": 0.0 a 1.0,
  "secondaryTriggers": ["gatilho2", "gatilho3"],
  "emotionalIntensity": "low" ou "medium" ou "high",
  "toneKeywords": ["palavra1", "palavra2", "palavra3"],
  "reasoning": "Breve explicação do porquê (máx 100 caracteres)"
}
`;

  const response = await callAI([
    { role: 'user', content: prompt }
  ], { maxTokens: 500, temperature: 0.3 });
  
  // Extrair JSON da resposta
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI response does not contain valid JSON');
  }
  
  const parsed = JSON.parse(jsonMatch[0]);
  
  // Validar e normalizar resposta
  const validTrigger = validateTrigger(parsed.primaryTrigger);
  const config = EMOTIONAL_TRIGGER_CONFIG[validTrigger];
  
  return {
    primaryTrigger: validTrigger,
    confidence: Math.max(0, Math.min(1, parsed.confidence || 0.7)),
    secondaryTriggers: (parsed.secondaryTriggers || [])
      .map(validateTrigger)
      .filter((t: EmotionalTrigger) => t !== validTrigger)
      .slice(0, 2),
    suggestedStyle: config.suggestedStyle,
    toneKeywords: parsed.toneKeywords || [],
    emotionalIntensity: validateIntensity(parsed.emotionalIntensity),
    reasoning: parsed.reasoning || 'Análise por IA'
  };
}

/**
 * Combina análise de keywords com análise de IA
 */
function mergeAnalysis(
  keywordAnalysis: EmotionalAnalysis,
  aiAnalysis: EmotionalAnalysis
): EmotionalAnalysis {
  
  // Se ambos concordam, alta confiança
  if (keywordAnalysis.primaryTrigger === aiAnalysis.primaryTrigger) {
    return {
      ...aiAnalysis,
      confidence: Math.min(0.98, aiAnalysis.confidence + 0.1),
      toneKeywords: [...new Set([...aiAnalysis.toneKeywords, ...keywordAnalysis.toneKeywords])].slice(0, 5),
      reasoning: `Análise confirmada por keywords e IA: ${aiAnalysis.primaryTrigger}`
    };
  }
  
  // Se IA tem alta confiança, usar IA
  if (aiAnalysis.confidence > 0.8) {
    return {
      ...aiAnalysis,
      secondaryTriggers: [
        keywordAnalysis.primaryTrigger, 
        ...aiAnalysis.secondaryTriggers
      ].slice(0, 2),
      toneKeywords: [...new Set([...aiAnalysis.toneKeywords, ...keywordAnalysis.toneKeywords])].slice(0, 5),
    };
  }
  
  // Se keywords tem alta confiança, usar keywords
  if (keywordAnalysis.confidence > 0.75) {
    return {
      ...keywordAnalysis,
      secondaryTriggers: [
        aiAnalysis.primaryTrigger,
        ...keywordAnalysis.secondaryTriggers
      ].slice(0, 2),
    };
  }
  
  // Caso de incerteza: usar IA com confiança reduzida
  return {
    ...aiAnalysis,
    confidence: Math.max(0.5, aiAnalysis.confidence - 0.1),
    secondaryTriggers: [
      keywordAnalysis.primaryTrigger,
      ...aiAnalysis.secondaryTriggers
    ].slice(0, 2),
    reasoning: `Análise incerta - IA: ${aiAnalysis.primaryTrigger}, Keywords: ${keywordAnalysis.primaryTrigger}`
  };
}

/**
 * Valida se o trigger é válido
 */
function validateTrigger(trigger: string): EmotionalTrigger {
  const validTriggers: EmotionalTrigger[] = [
    'serious', 'humor', 'concern', 'outrage', 'anguish',
    'sarcasm', 'satire', 'happiness', 'celebration', 'doubt', 'mystery'
  ];
  
  const normalized = trigger?.toLowerCase()?.trim();
  
  if (validTriggers.includes(normalized as EmotionalTrigger)) {
    return normalized as EmotionalTrigger;
  }
  
  // Mapeamento de termos alternativos
  const alternativeMap: Record<string, EmotionalTrigger> = {
    'sério': 'serious',
    'serio': 'serious',
    'grave': 'serious',
    'engraçado': 'humor',
    'engraçado': 'humor',
    'comico': 'humor',
    'preocupação': 'concern',
    'preocupacao': 'concern',
    'alerta': 'concern',
    'revolta': 'outrage',
    'indignação': 'outrage',
    'indignacao': 'outrage',
    'escândalo': 'outrage',
    'escandalo': 'outrage',
    'angústia': 'anguish',
    'angustia': 'anguish',
    'tristeza': 'anguish',
    'ironia': 'sarcasm',
    'satírico': 'satire',
    'satirico': 'satire',
    'crítica': 'satire',
    'critica': 'satire',
    'alegria': 'happiness',
    'feliz': 'happiness',
    'vitória': 'happiness',
    'vitoria': 'happiness',
    'comemoração': 'celebration',
    'comemoracao': 'celebration',
    'festa': 'celebration',
    'incerteza': 'doubt',
    'dúvida': 'doubt',
    'duvida': 'doubt',
    'mistério': 'mystery',
    'misterio': 'mystery',
    'enigma': 'mystery',
  };
  
  return alternativeMap[normalized] || 'serious';
}

/**
 * Valida intensidade emocional
 */
function validateIntensity(intensity: string): 'low' | 'medium' | 'high' {
  const normalized = intensity?.toLowerCase()?.trim();
  
  if (['low', 'medium', 'high'].includes(normalized)) {
    return normalized as 'low' | 'medium' | 'high';
  }
  
  // Mapeamento de termos alternativos
  const alternativeMap: Record<string, 'low' | 'medium' | 'high'> = {
    'baixa': 'low',
    'baixo': 'low',
    'média': 'medium',
    'medio': 'medium',
    'média': 'medium',
    'alta': 'high',
    'alto': 'high',
  };
  
  return alternativeMap[normalized] || 'medium';
}

/**
 * Escapa caracteres especiais para regex
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Analisa múltiplos conteúdos em batch
 * Útil para processamento em lote de feeds RSS
 */
export async function analyzeEmotionalToneBatch(
  items: Array<{ title: string; content: string; sourceName?: string }>,
  callAI?: (messages: Array<{role: string; content: string}>, options?: any) => Promise<string>
): Promise<EmotionalAnalysis[]> {
  
  // Para batch, usar apenas keyword analysis para eficiência
  return items.map(item => quickKeywordAnalysis(item.title, item.content));
}

/**
 * Retorna estatísticas sobre a distribuição de gatilhos em um conjunto de conteúdos
 */
export function getEmotionalDistribution(
  analyses: EmotionalAnalysis[]
): Record<EmotionalTrigger, number> {
  const distribution: Record<EmotionalTrigger, number> = {
    serious: 0, humor: 0, concern: 0, outrage: 0, anguish: 0,
    sarcasm: 0, satire: 0, happiness: 0, celebration: 0, doubt: 0, mystery: 0
  };
  
  for (const analysis of analyses) {
    distribution[analysis.primaryTrigger]++;
  }
  
  return distribution;
}
