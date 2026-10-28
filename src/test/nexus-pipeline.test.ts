import { describe, it, expect, vi, beforeEach } from 'vitest';
const { call, resolve } = vi.hoisted(() => ({ call: vi.fn(), resolve: vi.fn() }));
vi.mock('../../supabase/functions/_shared/byok-resolver.ts', () => ({ getOrchestratorForUser: resolve }));
// Runtime import keeps the Deno-only dependency graph out of the browser TypeScript program.
const pipelinePath = '../../supabase/functions/_shared/agents/agent-pipeline.ts';
const { runAgentPipeline } = await import(/* @vite-ignore */ pipelinePath);
const config = { keyword: 'topic', secondaryKeywords: [], sector: 'general', language: 'pt-BR', tone: 'clear', pointOfView: 'voce', wordCount: 'medium', includeFaq: false, faqCount: 0, includeTable: false, includeList: true, includeConclusion: true, userId: 'owner', sourcesContext: 'Verified supplied snippet', projectConfig: { author: 'Brand Author' }, conversionBrief: { benefit: 'Real benefit' }, templatePrompt: 'Approved brand style' };
const strategy = JSON.stringify({ conversionStrategy: { primaryCTA: 'Read more', secondaryCTAs: [], painPoints: [], objections: [], differentials: [] }, contentStructure: { hook: 'Direct answer', mainSections: [], conclusionAngle: 'Useful next step' }, competitiveAngle: 'Clear explanation' });
const html = '<h2>Topic</h2><p>Useful content and supported information.</p>';
describe('NEXUS pipeline execution', () => {
  beforeEach(() => { call.mockReset(); resolve.mockReset(); resolve.mockResolvedValue({ callWithMeta: call, getAvailableProviders: () => ['openai'] }); });
  it('forwards evidence, identity and conversion to every stage and records real providers', async () => {
    for (const content of [strategy, html, html, html]) call.mockResolvedValueOnce({ content, provider: 'openai', model: 'test-model' });
    const result = await runAgentPipeline(config);
    expect(result.content).toBe(html); expect(result.providersUsed).toEqual(Array(4).fill('openai:test-model'));
    for (const [, messages] of call.mock.calls) {
      expect(messages[0].content).toContain('Verified supplied snippet');
      expect(messages[0].content).toContain('Brand Author'); expect(messages[0].content).toContain('Real benefit');
    }
  });
  it('does not silently accept a failed editorial reviewer', async () => {
    call.mockResolvedValueOnce({ content: strategy, provider: 'openai', model: 'test' }).mockResolvedValueOnce({ content: html, provider: 'openai', model: 'test' }).mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(runAgentPipeline(config)).rejects.toThrow('editorial_review_incomplete');
  });
  it('propagates a source requirement from a reviewer without treating it as an article', async () => {
    call.mockResolvedValueOnce({ content: strategy, provider: 'openai', model: 'test' }).mockResolvedValueOnce({ content: html, provider: 'openai', model: 'test' }).mockResolvedValueOnce({ content: 'ZICA_NEEDS_PRIMARY_SOURCE: official record', provider: 'openai', model: 'test' });
    expect((await runAgentPipeline(config)).content).toContain('ZICA_NEEDS_PRIMARY_SOURCE:');
    expect(call).toHaveBeenCalledTimes(3);
  });
});
