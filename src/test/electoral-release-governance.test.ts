import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/check-electoral-release-contract.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/electoral-release-gate.yml', 'utf8');
const governance = readFileSync('docs/audits/2026-09-11-electoral-release-governance.md', 'utf8');

describe('governança de release eleitoral', () => {
  it('bloqueia divergência de pipeline, controles e migrations', () => {
    expect(script).toContain('public_pipeline_sha_drift');
    expect(script).toContain('generator_pipeline_sha_drift');
    expect(script).toContain('abuse_reservation_missing');
    expect(script).toContain('migration_missing');
  });

  it('executa contrato, regressão e build antes do release', () => {
    expect(workflow).toContain('npm run check:electoral-release');
    expect(workflow).toContain('npx vitest run');
    expect(workflow).toContain('npm run build:zica');
    expect(workflow).toContain('supporter-avatar-admin');
  });

  it('formaliza a URL de privacidade como não bloqueadora', () => {
    expect(governance).toContain('definitivamente cancelada como pendência');
    expect(governance).toContain('não constitui bloqueio técnico, de merge, deploy ou homologação');
  });
});
