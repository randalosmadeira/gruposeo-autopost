import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildComplianceAdvisoryRecord,
  describeComplianceIssue,
  evaluateCompliance,
  normalizeComplianceMode,
  resolveComplianceMode,
  runComplianceCheck,
  COMPLIANCE_RULE_HELP,
} from '../../supabase/functions/_shared/compliance-mode';
import { findComplianceViolations } from '../../supabase/functions/_shared/publication-quality';
import { importedReviewComplianceWarnings, importedReviewIssues } from '../../supabase/functions/_shared/nexus-review-import';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const violating = { title: 'O melhor advogado criminalista de São Paulo', content: '<p>Garantimos a absolvição. Consulta gratuita. Entre em contato agora pelo WhatsApp.</p>' };
const clean = { title: 'Audiência de custódia: como funciona', content: '<p>Atuação em audiência de custódia. Entenda as etapas e os prazos.</p>' };

describe('normalizeComplianceMode', () => {
  it('aceita os três modos, ignorando caixa e espaços', () => {
    expect(normalizeComplianceMode('off')).toBe('off');
    expect(normalizeComplianceMode(' STRICT ')).toBe('strict');
    expect(normalizeComplianceMode('Advisory')).toBe('advisory');
  });

  it('ausente, nulo ou inválido vira "advisory" (nunca strict nem off por engano)', () => {
    for (const value of [undefined, null, '', 'rigido', 'on', 1, true, {}, []]) expect(normalizeComplianceMode(value), String(value)).toBe('advisory');
  });
});

describe('evaluateCompliance', () => {
  const issues = findComplianceViolations(violating);

  it('o texto de teste realmente tem achados', () => {
    expect(issues.length).toBeGreaterThan(0);
  });

  it('strict bloqueia como antes e devolve os achados que bloqueiam', () => {
    expect(evaluateCompliance('strict', issues)).toEqual({ blocking: true, warnings: issues });
  });

  it('advisory nunca bloqueia e devolve os achados como avisos', () => {
    expect(evaluateCompliance('advisory', issues)).toEqual({ blocking: false, warnings: issues });
  });

  it('off ignora tudo', () => {
    expect(evaluateCompliance('off', issues)).toEqual({ blocking: false, warnings: [] });
  });

  it('sem achados nunca bloqueia, em qualquer modo', () => {
    for (const mode of ['off', 'advisory', 'strict'] as const) expect(evaluateCompliance(mode, [])).toEqual({ blocking: false, warnings: [] });
    expect(evaluateCompliance('strict', null)).toEqual({ blocking: false, warnings: [] });
    expect(evaluateCompliance('strict', undefined)).toEqual({ blocking: false, warnings: [] });
  });

  it('modo inválido se comporta como advisory', () => {
    expect(evaluateCompliance('qualquer' as never, issues).blocking).toBe(false);
  });
});

describe('runComplianceCheck', () => {
  it('strict = comportamento antigo: o mesmo texto que o portão antigo reprovava bloqueia', () => {
    expect(runComplianceCheck('strict', violating).blocking).toBe(true);
    expect(runComplianceCheck('strict', violating).warnings.map((i) => i.code)).toEqual(findComplianceViolations(violating).map((i) => i.code));
    expect(runComplianceCheck('strict', clean).blocking).toBe(false);
  });

  it('advisory avisa e não bloqueia', () => {
    const result = runComplianceCheck('advisory', violating);
    expect(result.blocking).toBe(false);
    expect(result.warnings.map((i) => i.code)).toEqual(expect.arrayContaining(['superlativo', 'promessa_resultado', 'urgencia_comercial', 'captacao_direta']));
    expect(runComplianceCheck('advisory', clean)).toEqual({ blocking: false, warnings: [] });
  });

  it('off não roda a checagem (nem lê o texto)', () => {
    const trap = { get title(): string { throw new Error('texto lido no modo desligado'); }, content: '' };
    expect(runComplianceCheck('off', trap)).toEqual({ blocking: false, warnings: [] });
  });
});

describe('resolveComplianceMode', () => {
  type Seen = { table?: string; column?: string; id?: string };
  const adminReturning = (result: { data: unknown; error: { code?: string; message?: string } | null }, seen: Seen = {}) => ({
    from: (table: string) => ({
      select: (column: string) => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: () => { seen.table = table; seen.column = column; seen.id = id; return Promise.resolve(result); },
        }),
      }),
    }),
  });

  it('lê organizations.compliance_mode da organização do artigo', async () => {
    const seen: Seen = {};
    expect(await resolveComplianceMode(adminReturning({ data: { compliance_mode: 'strict' }, error: null }, seen), 'org-1')).toBe('strict');
    expect(seen).toEqual({ table: 'organizations', column: 'compliance_mode', id: 'org-1' });
    expect(await resolveComplianceMode(adminReturning({ data: { compliance_mode: 'off' }, error: null }), 'org-1')).toBe('off');
  });

  it('sem organização, sem linha, nulo ou inválido => advisory', async () => {
    expect(await resolveComplianceMode(adminReturning({ data: null, error: null }), null)).toBe('advisory');
    expect(await resolveComplianceMode(adminReturning({ data: null, error: null }), 'org-1')).toBe('advisory');
    expect(await resolveComplianceMode(adminReturning({ data: { compliance_mode: null }, error: null }), 'org-1')).toBe('advisory');
    expect(await resolveComplianceMode(adminReturning({ data: { compliance_mode: 'lixo' }, error: null }), 'org-1')).toBe('advisory');
  });

  it('migração ainda não aplicada (coluna inexistente) => advisory, sem quebrar a publicação', async () => {
    const missing = { data: null, error: { code: '42703', message: 'column organizations.compliance_mode does not exist' } };
    expect(await resolveComplianceMode(adminReturning(missing), 'org-1')).toBe('advisory');
  });

  it('falha de leitura qualquer é lançada: uma organização rígida não vira aviso por erro passageiro', async () => {
    await expect(resolveComplianceMode(adminReturning({ data: null, error: { code: '57014', message: 'timeout' } }), 'org-1')).rejects.toThrow(/compliance_mode_unavailable/);
  });
});

describe('buildComplianceAdvisoryRecord', () => {
  const warnings = findComplianceViolations(violating);

  it('só existe no modo aviso e com achados', () => {
    expect(buildComplianceAdvisoryRecord({ mode: 'strict', warnings })).toBeNull();
    expect(buildComplianceAdvisoryRecord({ mode: 'off', warnings })).toBeNull();
    expect(buildComplianceAdvisoryRecord({ mode: 'advisory', warnings: [] })).toBeNull();
  });

  it('registra modo, achados, data e quem deu o ciente', () => {
    const record = buildComplianceAdvisoryRecord({ mode: 'advisory', warnings, acknowledgedBy: 'user-1', now: '2026-11-13T12:00:00.000Z' });
    expect(record).toMatchObject({ mode: 'advisory', checked_at: '2026-11-13T12:00:00.000Z', acknowledged_by: 'user-1' });
    expect(record?.issues).toHaveLength(warnings.length);
    expect(Object.keys(record?.issues[0] || {}).sort()).toEqual(['code', 'field', 'label', 'sample']);
  });

  it('sem ciente, acknowledged_by é null', () => {
    expect(buildComplianceAdvisoryRecord({ mode: 'advisory', warnings })?.acknowledged_by).toBeNull();
  });
});

describe('explicações das regras', () => {
  it('toda regra do portão tem explicação em português, sem tom de ameaça', () => {
    const codes = ['promessa_resultado', 'superlativo', 'comparacao', 'urgencia_comercial', 'apelo_desespero', 'captacao_direta'];
    for (const code of codes) {
      const help = COMPLIANCE_RULE_HELP[code];
      expect(help, code).toBeTruthy();
      expect(`${help.title} ${help.why} ${help.suggestion}`).not.toMatch(/proibid|infra[cç][aã]o|puni|multa|ilegal|crime/i);
    }
  });

  it('código desconhecido cai numa explicação genérica', () => {
    expect(describeComplianceIssue({ code: 'nova_regra', label: 'Nova regra' }).title).toBe('Nova regra');
  });
});

describe('nexus-review-import respeita o modo', () => {
  const article = { id: 'a1', ...violating, excerpt: '', status: 'ready', config: {} };
  const project = { empresa_nome: 'RDM Advogados Associados' };
  const item = { article_id: 'a1', expected_updated_at: 'x', content_sha256: 'y', verdict: { dimensions: {}, unsupported_claims: [], issues: [], notes: '', provenance: '' } };
  const job = { project_id: 'p', user_id: 'u', organization_id: 'o' };
  const failureIn = async (mode: 'off' | 'advisory' | 'strict') => (await importedReviewIssues(item, article, project, job, false, mode)).includes('publication_quality_failure');

  it('só conta publicidade como falha em strict', async () => {
    expect(await failureIn('strict')).toBe(true);
    expect(await failureIn('advisory')).toBe(false);
    expect(await failureIn('off')).toBe(false);
  });

  it('em advisory registra como aviso; em off não há aviso', () => {
    expect(importedReviewComplianceWarnings(article, project, 'advisory').length).toBeGreaterThan(0);
    expect(importedReviewComplianceWarnings(article, project, 'off')).toEqual([]);
  });

  it('o padrão (sem modo informado) é advisory', async () => {
    expect((await importedReviewIssues(item, article, project, job, false)).includes('publication_quality_failure')).toBe(false);
  });
});

describe('publish-to-wordpress usa o modo da organização (verificação estática do fonte)', () => {
  const publisher = read('supabase/functions/publish-to-wordpress/index.ts');

  it('resolve o modo da organização do artigo e só bloqueia quando o resultado manda', () => {
    expect(publisher).toContain('compliance-mode.ts');
    expect(publisher).toContain('resolveComplianceMode(admin, article.organization_id)');
    expect(publisher).toContain('runComplianceCheck(complianceMode');
    expect(publisher).toMatch(/if \(compliance\.blocking\) \{[\s\S]{0,400}code: "compliance_gate"/);
    expect(publisher).not.toContain('findComplianceViolations');
  });

  it('modo aviso grava config.compliance_advisory e devolve compliance_warnings, com o ciente opcional', () => {
    expect(publisher).toContain('acknowledgeCompliance');
    expect(publisher).toContain('normalizedConfig.compliance_advisory = complianceAdvisory');
    expect(publisher).toContain('compliance_warnings:');
    expect(publisher).toMatch(/acknowledgedBy: body\.acknowledgeCompliance === true && body\.automated !== true \? userId : null/);
  });

  it('os demais portões continuam no lugar e antes do envio ao WordPress', () => {
    let last = -1;
    for (const gate of ['title_quality_gate', 'broken_cta_gate', 'compliance_gate', 'duplicate_slug_gate', 'publication_residue_gate']) {
      const at = publisher.indexOf(gate);
      expect(at, gate).toBeGreaterThan(last);
      last = at;
    }
    for (const gate of ['featured_image_gate', 'editorial_gate', 'nexus_approval_required', 'meta_description_gate', 'content_gate']) expect(publisher, gate).toContain(gate);
    expect(last).toBeLessThan(publisher.indexOf('publishPlugin(project, normalizedArticle'));
  });

  it('o ciente é repassado pela fila e pela API WordPress, e nunca em publicação automática', () => {
    expect(read('supabase/functions/wordpress-operations/index.ts')).toContain('acknowledgeCompliance: acknowledgeCompliance && !automated');
    expect(read('supabase/functions/wordpress-api/index.ts')).toContain('acknowledgeCompliance: input.acknowledgeCompliance === true');
  });
});

describe('migração 20261113110000_compliance_mode', () => {
  const sql = read('supabase/migrations/20261113110000_compliance_mode.sql');
  const code = sql.replace(/--.*$/gm, '');

  it('cria a coluna com padrão advisory e restrição aos três valores, de forma idempotente', () => {
    expect(sql).toMatch(/add column if not exists compliance_mode text not null default 'advisory'/);
    expect(sql).toMatch(/check \(compliance_mode in \('off','advisory','strict'\)\)/);
    expect(sql).toContain('add column if not exists compliance_mode_updated_by uuid');
    expect(sql).toContain('add column if not exists compliance_mode_updated_at timestamptz');
    expect(sql).toContain('drop constraint if exists organizations_compliance_mode_check');
    expect(sql).toContain('drop trigger if exists compliance_mode_audit');
  });

  it('não amplia permissões: nenhum grant, política ou alteração de RLS', () => {
    expect(code).not.toMatch(/\bgrant\b/i);
    expect(code).not.toMatch(/create policy|alter policy|drop policy|row level security/i);
  });

  it('descreve a reversão e não altera dados existentes', () => {
    expect(sql).toContain('Reversão');
    expect(code).not.toMatch(/update public\.organizations/i);
  });
});
