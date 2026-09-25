import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Pipeline VPS v8.
const generator = readFileSync(resolve(process.cwd(), 'services/zica-orchestrator/src/supporter-avatar/pipeline.ts'), 'utf8');

describe('supporter avatar QA integrity (VPS v8)', () => {
  it('não inventa notas de QA quando o provedor falha', () => {
    expect(generator).not.toContain('supporterFidelity: 98');
    expect(generator).not.toContain('candidateFidelity: 98');
    expect(generator).not.toContain('humanTexture: 95');
    expect(generator).not.toContain('anatomy: 95');
    expect(generator).not.toContain('cropSafe: 95');
    expect(generator).not.toContain('lighting: 92');
    expect(generator).not.toContain('batIntegrity: 92');
    expect(generator).toContain('qa_score: qa ? clamp(qa.supporter_fidelity_score) : null');
  });

  it('falha de provedor de QA vira revisão, nunca aprovação', () => {
    expect(generator).toContain('qa_provider_unavailable');
    expect(generator).toContain('qa_provider_error');
    expect(generator).toContain('if (!qa) return false;');
    expect(generator).toContain("const finalStatus = passed ? 'completed' : 'needs_review'");
    expect(generator).toContain('qa_threshold_not_met_or_qa_provider_pending');
  });

  it('o veredito exige duas pessoas, fidelidade mínima e nenhum texto na composição', () => {
    expect(generator).toContain('qa.face_count === 2');
    expect(generator).toContain('clamp(qa.supporter_fidelity_score) >= 70');
    expect(generator).toContain('clamp(qa.candidate_reference_fidelity_score) >= 70');
    expect(generator).toContain('clamp(qa.anatomy_score) >= 70');
    expect(generator).toContain('qa.text_detected !== true');
  });

  it('seleção degradada continua sem expor a galeria', () => {
    expect(generator).toContain('fallbackCandidateIndex');
    expect(generator).toContain('autonomous_recovery');
    expect(generator).toContain('fallback seguro sem exposição da galeria');
  });
});
