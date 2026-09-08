import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ANTHROPIC_ECONOMY_MODEL,
  ANTHROPIC_PRIMARY_MODEL,
  resolveAnthropicModel,
} from '../../services/zica-orchestrator/src/anthropic-model-policy';

describe('política de modelos Claude', () => {
  it('fixa o modelo principal no snapshot Sonnet 4.5', () => {
    expect(ANTHROPIC_PRIMARY_MODEL).toBe('claude-sonnet-4-5-20250929');
    expect(resolveAnthropicModel()).toBe(ANTHROPIC_PRIMARY_MODEL);
  });

  it('permite Haiku 4.5 para tarefas econômicas', () => {
    expect(ANTHROPIC_ECONOMY_MODEL).toBe('claude-haiku-4-5-20251001');
    expect(resolveAnthropicModel(ANTHROPIC_ECONOMY_MODEL)).toBe(ANTHROPIC_ECONOMY_MODEL);
  });

  it('bloqueia aliases móveis e modelos fora da lista', () => {
    expect(() => resolveAnthropicModel('sonnet')).toThrow('anthropic_model_not_allowed:sonnet');
    expect(() => resolveAnthropicModel('claude-sonnet-5')).toThrow('anthropic_model_not_allowed');
    expect(() => resolveAnthropicModel('claude-opus-4-5-20251101')).toThrow('anthropic_model_not_allowed');
  });

  it('aplica o resolvedor nos consumidores Supabase configuráveis', () => {
    const avatar = readFileSync('supabase/functions/generate-supporter-avatar/index.ts', 'utf8');
    const electoral = readFileSync('supabase/functions/electoral-content-variations/index.ts', 'utf8');
    expect(avatar).toContain("resolveAnthropicModel(Deno.env.get('ANTHROPIC_MODEL'))");
    expect(electoral).toContain("resolveAnthropicModel(Deno.env.get('ANTHROPIC_MODEL'))");
  });
});
