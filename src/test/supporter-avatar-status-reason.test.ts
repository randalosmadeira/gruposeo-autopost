import { describe, expect, it } from 'vitest';
import { supporterReviewKind, supporterReviewMessage } from '@/lib/supporter-avatar-status';

describe('supporter avatar review reason', () => {
  it('classifies vision provider failures separately from QA rejection', () => {
    expect(supporterReviewKind({ error_message: 'vision_provider_failure:anthropic_vision_error:400' })).toBe('provider');
    expect(supporterReviewMessage({ error_message: 'vision_provider_failure:anthropic_vision_error:400' })).toContain('não foi reprovada por qualidade');
  });

  it('keeps genuine QA rejection explicit', () => {
    expect(supporterReviewKind({ error_message: 'qa_threshold_not_met' })).toBe('qa');
    expect(supporterReviewMessage({ error_message: 'qa_threshold_not_met' })).toContain('QA de fidelidade');
  });
});
