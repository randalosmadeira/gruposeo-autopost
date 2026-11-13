// Modo de conformidade publicitária (Provimento 205/2021 CFOAB) configurável por organização.
//
//   off       a verificação não roda e nada é mostrado;
//   advisory  (padrão) a verificação roda, avisa e explica, mas NUNCA bloqueia a publicação;
//   strict    comportamento antigo: qualquer achado bloqueia (409 compliance_gate).
//
// A responsabilidade pela publicidade é do responsável pelo escritório. O sistema só orienta; quem
// quiser o bloqueio escolhe o modo rígido. Ausente, nulo ou inválido => 'advisory' (nunca 'strict'
// por engano, nunca 'off' por engano). Ver docs/COMPLIANCE_MODE.md.
//
// Sem dependência de Deno: este arquivo também é importado pelo front-end e pelo vitest.

import { findComplianceViolations, type QualityIssue } from './publication-quality.ts';

export const COMPLIANCE_MODES = ['off', 'advisory', 'strict'] as const;
export type ComplianceMode = (typeof COMPLIANCE_MODES)[number];
export const DEFAULT_COMPLIANCE_MODE: ComplianceMode = 'advisory';

export function normalizeComplianceMode(value: unknown): ComplianceMode {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (COMPLIANCE_MODES as readonly string[]).includes(text) ? (text as ComplianceMode) : DEFAULT_COMPLIANCE_MODE;
}

export type ComplianceEvaluation = {
  /** true só no modo rígido e com pelo menos um achado. */
  blocking: boolean;
  /** advisory: avisos que não bloqueiam. strict: os achados que bloqueiam. off: sempre vazio. */
  warnings: QualityIssue[];
};

export function evaluateCompliance(mode: ComplianceMode, violations: QualityIssue[] | null | undefined): ComplianceEvaluation {
  const issues = Array.isArray(violations) ? violations : [];
  const normalized = normalizeComplianceMode(mode);
  if (normalized === 'off' || issues.length === 0) return { blocking: false, warnings: [] };
  if (normalized === 'strict') return { blocking: true, warnings: issues };
  return { blocking: false, warnings: issues };
}

type ComplianceInput = { title?: string | null; content?: string | null; excerpt?: string | null; brand?: string | null };

/** Roda a checagem só quando o modo pede; no modo desligado nem varre o texto. */
export function runComplianceCheck(mode: ComplianceMode, input: ComplianceInput): ComplianceEvaluation {
  if (normalizeComplianceMode(mode) === 'off') return { blocking: false, warnings: [] };
  return evaluateCompliance(mode, findComplianceViolations(input));
}

type OrganizationReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: { compliance_mode?: unknown } | null; error: { code?: string; message?: string } | null }>;
      };
    };
  };
};

/**
 * Lê o modo da organização. Sem organização, sem linha, nulo ou valor inválido => 'advisory'.
 * Coluna ainda inexistente (migração 20261113110000 não aplicada, SQLSTATE 42703) => 'advisory'.
 * Qualquer outro erro de leitura é lançado: uma organização no modo rígido não pode virar aviso por causa
 * de uma falha passageira do banco (o publicador responde 502 e a fila tenta de novo).
 */
export async function resolveComplianceMode(admin: unknown, organizationId: string | null | undefined): Promise<ComplianceMode> {
  if (!organizationId) return DEFAULT_COMPLIANCE_MODE;
  const { data, error } = await (admin as OrganizationReader)
    .from('organizations')
    .select('compliance_mode')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) {
    if (error.code === '42703' || /compliance_mode/i.test(String(error.message || ''))) return DEFAULT_COMPLIANCE_MODE;
    throw new Error(`compliance_mode_unavailable: ${String(error.message || error.code || 'erro desconhecido').slice(0, 200)}`);
  }
  return normalizeComplianceMode(data?.compliance_mode);
}

export type ComplianceAdvisoryRecord = {
  mode: ComplianceMode;
  issues: QualityIssue[];
  checked_at: string;
  acknowledged_by: string | null;
};

/** Registro gravado em articles.config.compliance_advisory. Só existe no modo aviso e com achados. */
export function buildComplianceAdvisoryRecord(input: {
  mode: ComplianceMode;
  warnings: QualityIssue[];
  acknowledgedBy?: string | null;
  now?: string;
}): ComplianceAdvisoryRecord | null {
  if (normalizeComplianceMode(input.mode) !== 'advisory' || input.warnings.length === 0) return null;
  return {
    mode: 'advisory',
    issues: input.warnings.map((issue) => ({ code: issue.code, label: issue.label, field: issue.field, sample: issue.sample })),
    checked_at: input.now || new Date().toISOString(),
    acknowledged_by: input.acknowledgedBy || null,
  };
}

export type ComplianceRuleHelp = { title: string; why: string; suggestion: string };

// Texto de apoio mostrado ao lado de cada aviso. Linguagem simples, sem tom de ameaça.
export const COMPLIANCE_RULE_HELP: Record<string, ComplianceRuleHelp> = {
  promessa_resultado: {
    title: 'Promessa ou garantia de resultado',
    why: 'O Provimento 205/2021 da OAB não admite prometer ou garantir o resultado de um caso.',
    suggestion: 'Troque por uma frase sobre o trabalho de defesa, por exemplo: "analisamos o seu caso e atuamos com dedicação".',
  },
  superlativo: {
    title: 'Superlativo ou autotitulação',
    why: 'Expressões como "o melhor" ou "líder de mercado" são consideradas autopromoção pelo Provimento 205/2021.',
    suggestion: 'Descreva a experiência de forma objetiva: área de atuação, tempo de atividade, formação.',
  },
  comparacao: {
    title: 'Comparação com outros escritórios',
    why: 'A publicidade não deve comparar o escritório com outros profissionais.',
    suggestion: 'Fale do que o escritório faz, sem citar o que os outros deixam de fazer.',
  },
  urgencia_comercial: {
    title: 'Urgência comercial ou gratuidade como isca',
    why: 'Apelos como "não perca" ou "consulta gratuita" dão ao texto um tom de oferta comercial, o que o Provimento 205/2021 desaconselha.',
    suggestion: 'Use um convite informativo, por exemplo: "entre em contato para entender as opções do seu caso".',
  },
  apelo_desespero: {
    title: 'Apelo ao desespero como gatilho de contato',
    why: 'Usar o medo ou o desespero do leitor para provocar o contato pode ser visto como captação indevida.',
    suggestion: 'Explique a situação com calma e deixe o contato como uma opção, sem pressão.',
  },
  captacao_direta: {
    title: 'Captação direta de clientela',
    why: 'Chamadas como "ligue agora" ou "contrate já" caracterizam captação, que o Provimento 205/2021 não admite.',
    suggestion: 'Prefira um convite sóbrio, como "converse com a nossa equipe pelo WhatsApp".',
  },
};

export function describeComplianceIssue(issue: Pick<QualityIssue, 'code' | 'label'>): ComplianceRuleHelp {
  return COMPLIANCE_RULE_HELP[issue.code] || {
    title: issue.label || 'Trecho a revisar',
    why: 'Este trecho pode não estar de acordo com o Provimento 205/2021 da OAB.',
    suggestion: 'Releia o trecho e ajuste o que julgar necessário.',
  };
}

export const COMPLIANCE_MODE_LABELS: Record<ComplianceMode, { label: string; summary: string }> = {
  off: { label: 'Desligado', summary: 'Não verifica o texto e não mostra avisos.' },
  advisory: { label: 'Aviso (padrão)', summary: 'Mostra avisos e explica cada um. Você decide e publica quando quiser.' },
  strict: { label: 'Rígido', summary: 'Bloqueia a publicação enquanto houver trechos apontados pela verificação.' },
};
