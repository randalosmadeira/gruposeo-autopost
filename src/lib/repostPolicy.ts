export const REPOST_POLICY_VERSION = 'repost-policy-2026-09-03.1';

export type RepostPolicyMode = 'ai_autonomous' | 'manual_override' | 'legacy';
export type RepostSourceType =
  | 'manual_url'
  | 'manual_text'
  | 'rss_schedule'
  | 'news_agent_rss'
  | 'google_news_rss'
  | 'monitored_portal'
  | 'bulk_generator'
  | 'article_generator'
  | 'other';

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

export type EmotionalIntensity = 'low' | 'medium' | 'high';
export type ArticleLength = 'short' | 'medium' | 'long' | 'very-long';
export type PublishAction = 'hold' | 'draft' | 'schedule' | 'publish';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PolicyChoice<T extends string = string> {
  value: T;
  confidence: number;
  reason: string;
  alternatives?: T[];
}

export interface ImagePolicyDecision {
  mode: 'authorized_pool' | 'authorized_pool_background_edit' | 'ai_generated' | 'none';
  moduleKey: string;
  requireFeaturedImage: boolean;
  allowAiFallback: boolean;
  reason: string;
}

export interface RepostPolicyOverrides {
  niche?: string;
  analysisAngle?: string;
  emotionalTrigger?: EmotionalTrigger;
  emotionalIntensity?: EmotionalIntensity;
  tone?: string;
  articleLength?: ArticleLength;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  titleStrategy?: string;
  editorialFormat?: string;
  imagePolicy?: Partial<ImagePolicyDecision>;
  publishTiming?: string;
  publishAction?: PublishAction;
  rewriteMode?: 'standard' | 'madeira_neles';
}

export interface RepostPolicyDecision {
  version: string;
  policyMode: RepostPolicyMode;
  sourceType: RepostSourceType | string;
  niche: PolicyChoice;
  analysisAngle: PolicyChoice;
  emotionalTrigger: PolicyChoice<EmotionalTrigger>;
  emotionalIntensity: PolicyChoice<EmotionalIntensity>;
  tone: PolicyChoice;
  articleLength: PolicyChoice<ArticleLength>;
  primaryKeyword: PolicyChoice;
  secondaryKeywords: string[];
  titleStrategy: PolicyChoice;
  editorialFormat: PolicyChoice;
  imagePolicy: ImagePolicyDecision;
  publishTiming: PolicyChoice;
  publishAction: PublishAction;
  riskLevel: RiskLevel;
  requiresHumanReview: boolean;
  overallConfidence: number;
  sensitiveContent: boolean;
  sensitivityReasons: string[];
  rulesApplied: string[];
  riskFlags: string[];
  decisionReason: string;
  planner?: { provider?: string; model?: string };
  reviewer?: { provider?: string; model?: string };
  overridesApplied?: RepostPolicyOverrides;
}

const SENSITIVE_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'victim', pattern: /\b(v[ií]tima|vitimiza(?:ç|c)[aã]o|abusad[ao]|agredid[ao])s?\b/i },
  { code: 'child', pattern: /\b(crian[çc]a|menor(?:es)?|adolescente|beb[eê]|inf[aâ]ncia)\b/i },
  { code: 'crime', pattern: /\b(crime|pris[aã]o|pres[oa]|homic[ií]dio|estupro|roubo|furto|tr[aá]fico|viol[eê]ncia|feminic[ií]dio)\b/i },
  { code: 'death', pattern: /\b(morte|morreu|falec(?:eu|imento)|cad[aá]ver|[oó]bito)\b/i },
  { code: 'tragedy', pattern: /\b(trag[eé]dia|desastre|acidente fatal|calamidade|enchente|inc[eê]ndio)\b/i },
  { code: 'health', pattern: /\b(sa[uú]de|doen[çc]a|c[aâ]ncer|cirurgia|hospital|paciente|tratamento|medicamento|epidemia)\b/i },
  { code: 'untried_accusation', pattern: /\b(acusad[ao]|investigad[ao]|suspeit[ao]|denunciad[ao]|processo em andamento)\b/i },
];

const PROHIBITED_SENSITIVE_TRIGGERS = new Set<EmotionalTrigger>(['humor', 'sarcasm', 'satire']);

export function detectSensitiveContent(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(' ').normalize('NFC');
  const reasons = SENSITIVE_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.code);
  return { sensitive: reasons.length > 0, reasons };
}

export function clampConfidence(value: unknown, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100));
}

export function normalizeLegacyOverrides(input: Record<string, unknown>): RepostPolicyOverrides {
  const overrides: RepostPolicyOverrides = {};
  const copy = (key: keyof RepostPolicyOverrides, value: unknown) => {
    if (typeof value === 'string' && value.trim() && value !== 'auto') {
      (overrides as Record<string, unknown>)[key] = value.trim();
    }
  };

  copy('niche', input.niche);
  copy('analysisAngle', input.analysisAngle);
  copy('primaryKeyword', input.keyword);
  copy('articleLength', input.articleLength);
  copy('emotionalTrigger', input.emotionalTriggerOverride);
  copy('rewriteMode', input.rewriteMode);

  if (Array.isArray(input.secondaryKeywords)) {
    overrides.secondaryKeywords = input.secondaryKeywords.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 20);
  }
  return overrides;
}

export function applyRepostPolicyGuardrails(
  decision: RepostPolicyDecision,
  sourceText: string,
  explicitOverrides: RepostPolicyOverrides = {},
): RepostPolicyDecision {
  const sensitivity = detectSensitiveContent(sourceText, decision.decisionReason, ...decision.riskFlags);
  const next: RepostPolicyDecision = {
    ...decision,
    version: decision.version || REPOST_POLICY_VERSION,
    overallConfidence: clampConfidence(decision.overallConfidence),
    sensitiveContent: sensitivity.sensitive || decision.sensitiveContent,
    sensitivityReasons: Array.from(new Set([...(decision.sensitivityReasons || []), ...sensitivity.reasons])),
    rulesApplied: [...(decision.rulesApplied || [])],
    riskFlags: [...(decision.riskFlags || [])],
    overridesApplied: explicitOverrides,
  };

  next.niche = { ...next.niche, confidence: clampConfidence(next.niche?.confidence) };
  next.analysisAngle = { ...next.analysisAngle, confidence: clampConfidence(next.analysisAngle?.confidence) };
  next.emotionalTrigger = { ...next.emotionalTrigger, confidence: clampConfidence(next.emotionalTrigger?.confidence) };
  next.emotionalIntensity = { ...next.emotionalIntensity, confidence: clampConfidence(next.emotionalIntensity?.confidence) };
  next.tone = { ...next.tone, confidence: clampConfidence(next.tone?.confidence) };
  next.articleLength = { ...next.articleLength, confidence: clampConfidence(next.articleLength?.confidence) };
  next.primaryKeyword = { ...next.primaryKeyword, confidence: clampConfidence(next.primaryKeyword?.confidence) };
  next.titleStrategy = { ...next.titleStrategy, confidence: clampConfidence(next.titleStrategy?.confidence) };
  next.editorialFormat = { ...next.editorialFormat, confidence: clampConfidence(next.editorialFormat?.confidence) };
  next.publishTiming = { ...next.publishTiming, confidence: clampConfidence(next.publishTiming?.confidence) };

  if (next.sensitiveContent && PROHIBITED_SENSITIVE_TRIGGERS.has(next.emotionalTrigger.value)) {
    next.emotionalTrigger = {
      value: next.sensitivityReasons.includes('health') ? 'concern' : 'serious',
      confidence: 100,
      reason: 'Gatilho ajustado por guardrail obrigatório para conteúdo sensível.',
      alternatives: ['serious', 'concern', 'doubt'],
    };
    next.rulesApplied.push('sensitive_content_emotional_guardrail');
    next.riskFlags.push('prohibited_emotional_trigger_replaced');
  }

  const confidenceFloor = 72;
  const coreConfidences = [
    next.niche.confidence,
    next.analysisAngle.confidence,
    next.primaryKeyword.confidence,
    next.emotionalTrigger.confidence,
  ];
  const lowConfidence = coreConfidences.some((value) => value < confidenceFloor) || next.overallConfidence < confidenceFloor;
  const elevatedRisk = next.riskLevel === 'high' || next.riskLevel === 'critical';
  const sourcePending = next.riskFlags.includes('needs_primary_source') || next.riskFlags.includes('primary_source_missing');

  if (lowConfidence) {
    next.requiresHumanReview = true;
    next.publishAction = 'hold';
    next.rulesApplied.push('low_confidence_hold');
  }
  if (elevatedRisk) {
    next.requiresHumanReview = true;
    next.publishAction = 'hold';
    next.rulesApplied.push('elevated_risk_hold');
  }
  if (sourcePending) {
    next.requiresHumanReview = true;
    next.publishAction = 'hold';
    next.rulesApplied.push('primary_source_hold');
  }

  if (next.imagePolicy.requireFeaturedImage && next.imagePolicy.mode === 'none') {
    next.requiresHumanReview = true;
    next.publishAction = 'hold';
    next.riskFlags.push('featured_image_required_but_disabled');
    next.rulesApplied.push('featured_image_hold');
  }

  next.rulesApplied = Array.from(new Set(next.rulesApplied));
  next.riskFlags = Array.from(new Set(next.riskFlags));
  return next;
}

export function summarizePolicyDecision(decision: RepostPolicyDecision | null | undefined) {
  if (!decision) return [];
  return [
    { label: 'Nicho', value: decision.niche.value, confidence: decision.niche.confidence, reason: decision.niche.reason },
    { label: 'Ângulo', value: decision.analysisAngle.value, confidence: decision.analysisAngle.confidence, reason: decision.analysisAngle.reason },
    { label: 'Gatilho', value: decision.emotionalTrigger.value, confidence: decision.emotionalTrigger.confidence, reason: decision.emotionalTrigger.reason },
    { label: 'Intensidade', value: decision.emotionalIntensity.value, confidence: decision.emotionalIntensity.confidence, reason: decision.emotionalIntensity.reason },
    { label: 'Tom', value: decision.tone.value, confidence: decision.tone.confidence, reason: decision.tone.reason },
    { label: 'Extensão', value: decision.articleLength.value, confidence: decision.articleLength.confidence, reason: decision.articleLength.reason },
    { label: 'Palavra-chave', value: decision.primaryKeyword.value, confidence: decision.primaryKeyword.confidence, reason: decision.primaryKeyword.reason },
    { label: 'Título', value: decision.titleStrategy.value, confidence: decision.titleStrategy.confidence, reason: decision.titleStrategy.reason },
    { label: 'Formato', value: decision.editorialFormat.value, confidence: decision.editorialFormat.confidence, reason: decision.editorialFormat.reason },
    { label: 'Horário', value: decision.publishTiming.value, confidence: decision.publishTiming.confidence, reason: decision.publishTiming.reason },
  ];
}
