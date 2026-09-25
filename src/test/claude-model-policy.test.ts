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
    // O gerador de apoiadores migrou para o orquestrador da VPS (2026-09-25), que já aplica o resolvedor em ai.ts.
    const orchestratorAi = readFileSync('services/zica-orchestrator/src/ai.ts', 'utf8');
    expect(orchestratorAi).toContain('resolveAnthropicModel(process.env.ANTHROPIC_MODEL)');
  });

  it('electoral-content-variations delega ao orchestrator compartilhado em vez de resolver o modelo por conta própria', () => {
    // Since 2026-09-19 this function no longer calls Claude/OpenAI directly (and so
    // no longer needs its own resolveAnthropicModel call) — it routes through
    // ai-orchestrator.ts's shared callWithMeta, which the next assertion confirms
    // is itself pinned to the policy-approved constants below.
    const electoral = readFileSync('supabase/functions/electoral-content-variations/index.ts', 'utf8');
    expect(electoral).toContain('getOrchestratorForUser');
    expect(electoral).toContain("orchestrator.callWithMeta('electoral_content'");
    expect(electoral).not.toContain('api.anthropic.com');
    expect(electoral).not.toContain('resolveAnthropicModel');
  });

  it('o orchestrator compartilhado só usa os modelos Claude aprovados', () => {
    const orchestrator = readFileSync('supabase/functions/_shared/ai-orchestrator.ts', 'utf8');
    expect(orchestrator).toContain("import { ANTHROPIC_PRIMARY_MODEL, ANTHROPIC_ECONOMY_MODEL } from './anthropic-model-policy.ts'");
    expect(orchestrator).toContain('const CLAUDE_TEXT = ANTHROPIC_PRIMARY_MODEL;');
  });
});
