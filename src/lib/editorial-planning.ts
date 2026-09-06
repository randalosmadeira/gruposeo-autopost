export type EditorialFrequency = 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface EditorialKeywordInput {
  keyword: string;
  category?: string;
  intent?: string;
  volume?: string | number;
  difficulty?: string | number;
  priority?: string | number;
}

export interface EditorialPlanItem extends EditorialKeywordInput {
  normalizedKeyword: string;
  fingerprint: string;
  duplicate: boolean;
  duplicateReason?: 'within_import';
}

export interface EditorialConsumptionEstimate {
  selectedItems: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCredits: number;
}

const TOKEN_RATES = {
  inputPerItem: 850,
  outputPerItem: 3_200,
  creditsPerItem: 3,
} as const;

export function normalizeEditorialKeyword(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Deterministic, non-cryptographic client fingerprint. The database computes
// the authoritative SHA-256 fingerprint when the plan is persisted.
export function fingerprintKeyword(normalizedKeyword: string): string {
  let hash = 2166136261;
  for (let index = 0; index < normalizedKeyword.length; index += 1) {
    hash ^= normalizedKeyword.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `preview-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function prepareEditorialItems(inputs: EditorialKeywordInput[]): EditorialPlanItem[] {
  const seen = new Set<string>();
  return inputs
    .map((input) => ({ ...input, keyword: input.keyword.trim() }))
    .filter((input) => input.keyword.length > 0)
    .map((input) => {
      const normalizedKeyword = normalizeEditorialKeyword(input.keyword);
      const duplicate = seen.has(normalizedKeyword);
      seen.add(normalizedKeyword);
      return {
        ...input,
        normalizedKeyword,
        fingerprint: fingerprintKeyword(normalizedKeyword),
        duplicate,
        duplicateReason: duplicate ? 'within_import' as const : undefined,
      };
    });
}

export function estimateEditorialConsumption(selectedItems: number): EditorialConsumptionEstimate {
  const safeCount = Math.max(0, Math.floor(selectedItems));
  const estimatedInputTokens = safeCount * TOKEN_RATES.inputPerItem;
  const estimatedOutputTokens = safeCount * TOKEN_RATES.outputPerItem;
  return {
    selectedItems: safeCount,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedCredits: safeCount * TOKEN_RATES.creditsPerItem,
  };
}

export function sanitizeRequestedQuantity(value: number, availableItems: number): number {
  if (!Number.isFinite(value) || availableItems <= 0) return 0;
  return Math.min(Math.max(1, Math.floor(value)), availableItems);
}

export function createPlanningIdempotencyKey(projectId: string, normalizedKeywords: string[], nonce: string): string {
  return `editorial-plan:${projectId}:${fingerprintKeyword(normalizedKeywords.slice().sort().join('|'))}:${nonce}`;
}
