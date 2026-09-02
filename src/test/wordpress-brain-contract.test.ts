import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const brain = readFileSync(resolve(root, 'supabase/functions/zica-brain-tick/index.ts'), 'utf8');
const wordpressOperations = readFileSync(resolve(root, 'supabase/functions/wordpress-operations/index.ts'), 'utf8');

describe('Zica brain x WordPress operations contract', () => {
  it('usa apenas uma ação suportada para drenar a fila WordPress', () => {
    expect(brain).toContain('action: "process_due"');
    expect(brain).not.toContain('action: "reconcile"');
    expect(wordpressOperations).toContain('"process_due"');
  });

  it('mantém process_due restrito a execução interna', () => {
    expect(wordpressOperations).toContain('if (input.action === "process_due")');
    expect(wordpressOperations).toContain('actor?.mode !== "service"');
  });
});
