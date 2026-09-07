import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('regeneração e modo dual', () => {
  it('usa um modelo público da OpenAI e não devolve corpos brutos dos provedores', () => {
    const orchestrator = read('supabase/functions/_shared/ai-orchestrator.ts');
    expect(orchestrator).toContain("const OPENAI_TEXT = 'gpt-4.1'");
    expect(orchestrator).toContain("['gpt-4.1', 'gpt-4o']");
    expect(orchestrator).toContain("fetch(`${OPENAI_API_BASE}/responses`");
    expect(orchestrator).toContain('max_output_tokens: Math.min(options?.maxTokens || 16384, 16384)');
    expect(orchestrator).not.toContain('HTTP ${response.status}: ${text.slice');
    expect(orchestrator).toContain("safeProviderError('anthropic', response.status, text)");
  });

  it('não deixa falha da auditoria derrubar uma geração válida no modo dual', () => {
    const orchestrator = read('supabase/functions/_shared/ai-orchestrator.ts');
    const dual = orchestrator.slice(orchestrator.indexOf('async callDualWithMeta'), orchestrator.indexOf('private async callProvider'));
    expect(dual).toContain('Promise.allSettled');
    expect(dual).toContain('for (const key of keys)');
    expect(dual).toContain('Falha não bloqueante ao registrar consumo');
    expect(dual).toContain('dual_providers_unavailable:${failureCodes.join');
    expect(dual).toContain("providerMode: successful.length > 1 ? 'dual' : 'single'");
  });

  it('calcula o status dual pela saúde real e recria com contexto do projeto', () => {
    const settings = read('src/components/settings/AIConfigCard.tsx');
    const recreate = read('src/components/articles/editor/RecreateArticleButton.tsx');
    expect(settings).toContain("item.provider === 'anthropic' && item.status === 'operational'");
    expect(settings).toContain('Parcial, fallback ativo');
    expect(recreate).toContain("responseFormat: 'json'");
    expect(recreate).toContain('projectId,');
    expect(recreate).toContain('const extractedTitle = keyword.trim()');
  });
});
