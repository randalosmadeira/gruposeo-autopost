import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Pipeline VPS v8: a visão roda no orquestrador (Node), não mais na Edge.
const source = readFileSync(resolve(process.cwd(), 'services/zica-orchestrator/src/supporter-avatar/pipeline.ts'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260912023500_supporter_avatar_generation_counter_v7.sql'), 'utf8');

describe('supporter avatar vision runtime (VPS v8)', () => {
  it('envia referências reduzidas em base64 em vez de fotos originais completas', () => {
    expect(source).toContain('VISION_MAX_EDGE = 768');
    expect(source).toContain('downscale(image.bytes, VISION_MAX_EDGE');
    expect(source).toContain("detail: 'low'");
  });

  it('usa saídas estruturadas estritas para seleção e QA', () => {
    expect(source).toContain("type: 'json_schema'");
    expect(source).toContain('strict: true');
    expect(source).toContain('SELECTOR_SCHEMA');
    expect(source).toContain('QA_SCHEMA');
  });

  it('degrada com segurança quando o provedor de visão falha', () => {
    expect(source).toContain('fallbackCandidateIndex');
    expect(source).toContain("scene: 'institucional-oficial'");
    expect(source).toContain('autonomous_recovery');
    expect(source).toContain('degraded_selection');
  });

  it('só contabiliza a geração pública depois de persistir o pacote', () => {
    expect(migration).toContain('record_supporter_avatar_generation_result');
    expect(source).toContain("rpc('record_supporter_avatar_generation_result'");
    expect(source.indexOf("rpc('record_supporter_avatar_generation_result'")).toBeGreaterThan(source.indexOf("from(OUTPUT_BUCKET).upload("));
  });

  it('roda a imagem uma única vez e sem texto embutido', () => {
    expect((source.match(/api\.openai\.com\/v1\/images\/edits/g) || []).length).toBe(1);
    expect(source).toContain('buildCompositionPrompt(');
    expect(source).not.toContain('supportText');
  });
});
