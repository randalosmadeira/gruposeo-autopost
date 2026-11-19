// Modo de conformidade publicitária (Provimento 205/2021). A regra mora no módulo compartilhado com as
// Edge Functions; aqui só se reexporta o que o front-end usa, para o aviso mostrado ao usuário ser o mesmo
// que o publicador grava.
export {
  COMPLIANCE_MODES,
  COMPLIANCE_MODE_LABELS,
  COMPLIANCE_RULE_HELP,
  DEFAULT_COMPLIANCE_MODE,
  describeComplianceIssue,
  evaluateCompliance,
  normalizeComplianceMode,
  runComplianceCheck,
} from '../../supabase/functions/_shared/compliance-mode';
export type { ComplianceMode, ComplianceEvaluation, ComplianceRuleHelp } from '../../supabase/functions/_shared/compliance-mode';
export type { QualityIssue } from '../../supabase/functions/_shared/publication-quality';

export const COMPLIANCE_RESPONSIBILITY_NOTE =
  'A responsabilidade pela publicidade do escritório é do responsável pelo escritório. O sistema só orienta: não substitui a análise do advogado responsável.';
