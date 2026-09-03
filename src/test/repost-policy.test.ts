import { describe, expect, it } from 'vitest';
import {
  applyRepostPolicyGuardrails,
  detectSensitiveContent,
  normalizeLegacyOverrides,
  type RepostPolicyDecision,
} from '@/lib/repostPolicy';

function decision(overrides: Partial<RepostPolicyDecision> = {}): RepostPolicyDecision {
  return {
    version: 'test-v1',
    policyMode: 'ai_autonomous',
    sourceType: 'manual_url',
    niche: { value: 'advocacia', confidence: 90, reason: 'tema jurídico' },
    analysisAngle: { value: 'análise jurídica', confidence: 90, reason: 'efeitos legais' },
    emotionalTrigger: { value: 'serious', confidence: 90, reason: 'tom adequado' },
    emotionalIntensity: { value: 'medium', confidence: 90, reason: 'equilíbrio' },
    tone: { value: 'jornalístico', confidence: 90, reason: 'clareza' },
    articleLength: { value: 'medium', confidence: 90, reason: 'profundidade suficiente' },
    primaryKeyword: { value: 'decisão judicial', confidence: 90, reason: 'intenção de busca' },
    secondaryKeywords: ['direito', 'tribunal'],
    titleStrategy: { value: 'informativo direto', confidence: 90, reason: 'sem sensacionalismo' },
    editorialFormat: { value: 'notícia explicativa', confidence: 90, reason: 'adequado à fonte' },
    imagePolicy: { mode: 'authorized_pool', moduleKey: 'repost', requireFeaturedImage: true, allowAiFallback: false, reason: 'pool autorizado' },
    publishTiming: { value: 'next_available_slot', confidence: 90, reason: 'distribuição uniforme' },
    publishAction: 'publish',
    riskLevel: 'low',
    requiresHumanReview: false,
    overallConfidence: 90,
    sensitiveContent: false,
    sensitivityReasons: [],
    rulesApplied: [],
    riskFlags: [],
    decisionReason: 'decisão editorial segura',
    ...overrides,
  };
}

describe('repost editorial policy guardrails', () => {
  it('detecta conteúdo sensível', () => {
    expect(detectSensitiveContent('Criança vítima de violência em investigação').sensitive).toBe(true);
  });

  it('bloqueia humor em notícia criminal sensível', () => {
    const result = applyRepostPolicyGuardrails(
      decision({ emotionalTrigger: { value: 'humor', confidence: 95, reason: 'engajamento' } }),
      'Vítima menor em investigação de crime violento',
    );
    expect(result.emotionalTrigger.value).toBe('serious');
    expect(result.rulesApplied).toContain('sensitive_content_emotional_guardrail');
  });

  it('coloca decisão de alto risco em hold', () => {
    const result = applyRepostPolicyGuardrails(decision({ riskLevel: 'high' }), 'Tema empresarial');
    expect(result.publishAction).toBe('hold');
    expect(result.requiresHumanReview).toBe(true);
  });

  it('coloca baixa confiança em hold', () => {
    const result = applyRepostPolicyGuardrails(
      decision({ overallConfidence: 60, niche: { value: 'geral', confidence: 50, reason: 'incerto' } }),
      'Conteúdo comum',
    );
    expect(result.publishAction).toBe('hold');
    expect(result.rulesApplied).toContain('low_confidence_hold');
  });

  it('normaliza apenas overrides manuais reais', () => {
    expect(normalizeLegacyOverrides({
      niche: 'auto',
      analysisAngle: 'Análise Jurídica',
      emotionalTriggerOverride: 'concern',
      articleLength: 'auto',
    })).toEqual({ analysisAngle: 'Análise Jurídica', emotionalTrigger: 'concern' });
  });
});
