export const ANTHROPIC_PRIMARY_MODEL = 'claude-sonnet-4-5-20250929';
export const ANTHROPIC_ECONOMY_MODEL = 'claude-haiku-4-5-20251001';

const ALLOWED_ANTHROPIC_MODELS = new Set([
  ANTHROPIC_PRIMARY_MODEL,
  ANTHROPIC_ECONOMY_MODEL,
]);

export function resolveAnthropicModel(requested?: string): string {
  const model = String(requested || ANTHROPIC_PRIMARY_MODEL).trim();
  if (!ALLOWED_ANTHROPIC_MODELS.has(model)) {
    throw new Error(`anthropic_model_not_allowed:${model || 'empty'}`);
  }
  return model;
}
