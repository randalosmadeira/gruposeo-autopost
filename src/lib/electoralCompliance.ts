export type ElectoralContentMode = 'editorial-factual' | 'synthetic-media' | 'manual';
export type MonetizationMode = 'off' | 'adsense-editorial' | 'other';

export interface ElectoralComplianceProfile {
  electionYear: number;
  candidateName: string;
  ballotName: string;
  ballotNumber: string;
  politicalParty: string;
  federationOrCoalition: string;
  candidateRole: string;
  campaignCnpj: string;
  officialWebsite: string;
  websiteRegisteredWithElectoralJustice: boolean;
  websiteRegistrationDate: string;
  providerEstablishedInBrazil: boolean;
  privacyPolicyUrl: string;
  responsibleName: string;
  contentMode: ElectoralContentMode;
  usesAi: boolean;
  usesSyntheticMedia: boolean;
  syntheticMediaDisclosure: boolean;
  sourceVerificationRequired: boolean;
  legalReviewRequired: boolean;
  legalReviewConfirmed: boolean;
  messagingConsentConfirmed: boolean;
  unsubscribeMechanismConfirmed: boolean;
  paidBoosting: boolean;
  paidBoostingProvider: string;
  monetizationMode: MonetizationMode;
  monetizationLegalReviewConfirmed: boolean;
}

export interface ElectoralComplianceResult {
  score: number;
  blockers: string[];
  warnings: string[];
  canGenerateDraft: boolean;
  canPublish: boolean;
}

export const ELECTORAL_EDITORIAL_SECTIONS = [
  'Finanças & Crédito',
  'Economia & Tributos',
  'Mobilidade & Juventude',
  'Segurança Pública',
  'Cultura & Sociedade',
] as const;

export const GENERAL_PORTAL_FEATURES = {
  reusable: [
    'gestão multi-site e multi-tenant',
    'categorias, tags e agendamento',
    'workflow editorial e revisão humana',
    'fontes e trilha de auditoria',
    'slots de publicidade claramente identificados',
    'analytics e consentimento configuráveis',
    'IndexNow, sitemaps, RSS e dados estruturados',
  ],
  electoralOnly: [
    'identificação da candidatura',
    'número eleitoral e partido',
    'CNPJ de campanha',
    'registro do endereço eletrônico na Justiça Eleitoral',
    'regras de propaganda e impulsionamento eleitoral',
    'rotulagem e bloqueios eleitorais de IA',
  ],
} as const;

const normalizeDigits = (value: string) => value.replace(/\D/g, '');

export function isValidCampaignCnpj(value: string): boolean {
  return normalizeDigits(value).length === 14;
}

export function isLikelyHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function hoursSinceRegistration(registrationDate: string, now = new Date()): number | null {
  if (!registrationDate) return null;
  const registeredAt = new Date(registrationDate);
  if (Number.isNaN(registeredAt.getTime())) return null;
  return (now.getTime() - registeredAt.getTime()) / 3_600_000;
}

export function isSyntheticMediaRestrictedWindow(
  electionDate: string,
  now = new Date(),
): boolean {
  if (!electionDate) return false;
  const election = new Date(`${electionDate}T17:00:00-03:00`);
  if (Number.isNaN(election.getTime())) return false;
  const starts = election.getTime() - 72 * 3_600_000;
  const ends = election.getTime() + 24 * 3_600_000;
  return now.getTime() >= starts && now.getTime() <= ends;
}

export function evaluateElectoralCompliance(
  profile: ElectoralComplianceProfile,
  options: { electionDate?: string; now?: Date } = {},
): ElectoralComplianceResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const now = options.now ?? new Date();

  if (!profile.candidateName.trim()) blockers.push('Nome completo da candidatura ausente.');
  if (!profile.ballotName.trim()) blockers.push('Nome de urna ausente.');
  if (!profile.ballotNumber.trim()) blockers.push('Número de urna ausente.');
  if (!profile.politicalParty.trim()) blockers.push('Partido/federação responsável não informado.');
  if (!profile.candidateRole.trim()) blockers.push('Cargo em disputa não informado.');
  if (!isValidCampaignCnpj(profile.campaignCnpj)) blockers.push('CNPJ da campanha deve conter 14 dígitos.');
  if (!isLikelyHttpsUrl(profile.officialWebsite)) blockers.push('Site oficial HTTPS da campanha não informado.');
  if (!profile.websiteRegisteredWithElectoralJustice) blockers.push('Endereço eletrônico ainda não confirmado como informado à Justiça Eleitoral.');
  if (!profile.providerEstablishedInBrazil) blockers.push('Hospedagem/provedor no Brasil ainda não confirmado para o endereço oficial.');
  if (!profile.responsibleName.trim()) blockers.push('Responsável pela publicação não informado.');
  if (!profile.sourceVerificationRequired) blockers.push('Verificação de fontes deve permanecer obrigatória no módulo eleitoral.');
  if (!profile.legalReviewRequired) blockers.push('Revisão humana/jurídica deve permanecer obrigatória antes de publicar.');
  if (!profile.legalReviewConfirmed) blockers.push('Revisão humana/jurídica ainda não foi confirmada para publicação.');

  if (profile.websiteRegisteredWithElectoralJustice) {
    const ageHours = hoursSinceRegistration(profile.websiteRegistrationDate, now);
    if (ageHours === null) {
      warnings.push('Informe a data/hora do registro do endereço eletrônico para avaliar a janela de 48 horas aplicável a endereço preexistente.');
    } else if (ageHours < 48) {
      blockers.push('Aguarde 48 horas após o registro na Justiça Eleitoral antes de usar endereço preexistente não informado originalmente no RRC/DRAP.');
    }
  }

  if (profile.usesSyntheticMedia && !profile.syntheticMediaDisclosure) {
    blockers.push('Conteúdo sintético multimídia exige rotulagem explícita, destacada e acessível com indicação da tecnologia utilizada.');
  }

  if (profile.usesSyntheticMedia && options.electionDate && isSyntheticMediaRestrictedWindow(options.electionDate, now)) {
    blockers.push('Publicação/republicação de novo conteúdo sintético com imagem, voz ou manifestação de candidatura/pessoa pública está bloqueada na janela de 72h antes até 24h após o pleito.');
  }

  if (profile.paidBoosting) {
    if (!profile.paidBoostingProvider.trim()) warnings.push('Informe o provedor de impulsionamento para aplicar regras específicas da plataforma.');
    if (/google/i.test(profile.paidBoostingProvider)) {
      blockers.push('Google proíbe anúncios político-eleitorais no Brasil; não encaminhar campanha eleitoral para Google Ads.');
    }
    warnings.push('Impulsionamento eleitoral deve ser contratado e identificado conforme as regras eleitorais e da plataforma aplicável.');
  }

  if (profile.socialMessagingRequested && false) {
    // Kept intentionally unreachable for backwards compatibility with older saved JSON.
  }

  if (!profile.messagingConsentConfirmed || !profile.unsubscribeMechanismConfirmed) {
    warnings.push('Disparos/mensageria em massa não devem ser habilitados sem base válida de consentimento e mecanismo de descadastramento quando aplicável.');
  }

  if (profile.monetizationMode !== 'off' && !profile.monetizationLegalReviewConfirmed) {
    blockers.push('Monetização em página oficial de campanha exige revisão eleitoral/contábil específica antes de ser habilitada.');
  }

  if (profile.monetizationMode === 'adsense-editorial') {
    warnings.push('Blocos AdSense devem ser visualmente separados de banners políticos, CTAs e controles interativos, sem indução a clique.');
  }

  if (!isLikelyHttpsUrl(profile.privacyPolicyUrl)) {
    warnings.push('Cadastre Política de Privacidade HTTPS antes de ativar analytics, cookies não essenciais ou coleta de contatos.');
  }

  const totalChecks = 15;
  const score = Math.max(0, Math.round(((totalChecks - blockers.length) / totalChecks) * 100));
  return {
    score,
    blockers,
    warnings,
    canGenerateDraft: blockers.filter((item) => /Nome completo|Nome de urna|Número de urna|Partido|Cargo|CNPJ/.test(item)).length === 0,
    canPublish: blockers.length === 0,
  };
}

// Declaration used only to make older persisted payloads safe to deserialize without enabling anything.
declare module './electoralCompliance' {
  interface ElectoralComplianceProfile {
    socialMessagingRequested?: boolean;
  }
}
