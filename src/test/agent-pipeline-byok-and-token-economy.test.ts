import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('auditoria 2026-09-18 — pipeline de 4 agentes usa BYOK real', () => {
  const pipeline = read('supabase/functions/_shared/agents/agent-pipeline.ts');

  it('não chama mais getOrchestrator() (credenciais de ambiente/plataforma isoladas)', () => {
    expect(pipeline).not.toMatch(/\bgetOrchestrator\(\)/);
    expect(pipeline).not.toMatch(/import\s*\{[^}]*\bgetOrchestrator\b[^}]*\}\s*from\s*"\.\.\/ai-orchestrator\.ts"/);
  });

  it('resolve o orquestrador com getOrchestratorForUser, importado do byok-resolver', () => {
    expect(pipeline).toContain('getOrchestratorForUser');
    expect(pipeline).toMatch(/import\s*\{\s*getOrchestratorForUser\s*\}\s*from\s*"\.\.\/byok-resolver\.ts"/);
    expect(pipeline).toContain('await getOrchestratorForUser(config.userId)');
  });

  it('exige userId em AgentPipelineConfig (sem fallback silencioso para chave da plataforma)', () => {
    expect(pipeline).toMatch(/userId:\s*string;/);
  });

  it('encaminha articleId/correlationId dos 4 agentes para o usageSink de token_usage_logs', () => {
    const callCount = (pipeline.match(/\.\.\.callOptions/g) || []).length;
    expect(callCount).toBeGreaterThanOrEqual(4);
  });
});

describe('auditoria 2026-09-18 — generate-article expõe o pipeline como modo opt-in', () => {
  const fn = read('supabase/functions/generate-article/index.ts');

  it('aceita usePipeline no payload, default false, sem afetar o fluxo padrão existente', () => {
    expect(fn).toContain('usePipeline?: boolean');
    expect(fn).toContain('if (config.usePipeline)');
  });

  it('mantém callWithMeta/callDualWithMeta como o caminho padrão (else), intocado', () => {
    const elseIdx = fn.indexOf('} else {');
    const dualIdx = fn.indexOf('await orchestrator.callDualWithMeta("article_generation"');
    const singleIdx = fn.indexOf('await orchestrator.callWithMeta("article_generation"');
    expect(elseIdx).toBeGreaterThan(-1);
    expect(dualIdx).toBeGreaterThan(elseIdx);
    expect(singleIdx).toBeGreaterThan(elseIdx);
  });

  it('importa runAgentPipeline do módulo compartilhado de agentes', () => {
    expect(fn).toMatch(/import\s*\{\s*runAgentPipeline\s*\}\s*from\s*"\.\.\/_shared\/agents\/agent-pipeline\.ts"/);
  });
});

describe('auditoria 2026-09-18 — seo_analysis migrado para o tier econômico', () => {
  const orchestrator = read('supabase/functions/_shared/ai-orchestrator.ts');

  it('roteia seo_analysis pelos mesmos modelos econômicos de title_generation/meta_description', () => {
    const line = orchestrator.split('\n').find((l) => l.trim().startsWith('seo_analysis:'));
    expect(line).toBeDefined();
    expect(line).toContain('OPENAI_ECONOMY');
    expect(line).toContain('CLAUDE_ECONOMY');
    expect(line).not.toContain('OPENAI_TEXT');
    expect(line).not.toContain('CLAUDE_TEXT');
  });
});

describe('auditoria 2026-09-18 — prompt caching da Anthropic nas diretivas estáticas', () => {
  const orchestrator = read('supabase/functions/_shared/ai-orchestrator.ts');

  it('marca o bloco de diretivas injetado como cacheable, separado do system dinâmico do chamador', () => {
    expect(orchestrator).toContain("{ role: 'system', content: directives, cacheable: true }");
  });

  it('envia system como array de blocos com cache_control ephemeral apenas no bloco cacheable', () => {
    expect(orchestrator).toContain("cache_control: { type: 'ephemeral' as const }");
    expect(orchestrator).toMatch(/m\.cacheable\s*\?/);
  });
});
