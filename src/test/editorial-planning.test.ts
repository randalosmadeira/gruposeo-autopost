import { describe, expect, it } from 'vitest';
import {
  createPlanningIdempotencyKey,
  estimateEditorialConsumption,
  normalizeEditorialKeyword,
  prepareEditorialItems,
  sanitizeRequestedQuantity,
} from '@/lib/editorial-planning';

describe('editorial planning domain', () => {
  it('normalizes accents, casing and repeated separators', () => {
    expect(normalizeEditorialKeyword('  Fraude PIX em São Paulo!!! ')).toBe('fraude pix em sao paulo');
  });

  it('marks repeated keywords without discarding audit evidence', () => {
    const items = prepareEditorialItems([
      { keyword: 'Advogado Criminal' },
      { keyword: 'advogado-criminal' },
      { keyword: 'Fraude bancária' },
    ]);
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.duplicate)).toEqual([false, true, false]);
    expect(items[1].duplicateReason).toBe('within_import');
  });

  it('estimates bounded token and credit consumption', () => {
    expect(estimateEditorialConsumption(2.9)).toEqual({
      selectedItems: 2,
      estimatedInputTokens: 1700,
      estimatedOutputTokens: 6400,
      estimatedTotalTokens: 8100,
      estimatedCredits: 6,
    });
    expect(estimateEditorialConsumption(-4).selectedItems).toBe(0);
  });

  it('limits requested quantity to available unique items', () => {
    expect(sanitizeRequestedQuantity(50, 12)).toBe(12);
    expect(sanitizeRequestedQuantity(0, 12)).toBe(1);
    expect(sanitizeRequestedQuantity(5, 0)).toBe(0);
  });

  it('creates stable keys for keyword order and separates submission nonces', () => {
    const first = createPlanningIdempotencyKey('project-1', ['b', 'a'], 'nonce-1');
    const reordered = createPlanningIdempotencyKey('project-1', ['a', 'b'], 'nonce-1');
    const anotherSubmission = createPlanningIdempotencyKey('project-1', ['a', 'b'], 'nonce-2');
    expect(first).toBe(reordered);
    expect(first).not.toBe(anotherSubmission);
  });
});
