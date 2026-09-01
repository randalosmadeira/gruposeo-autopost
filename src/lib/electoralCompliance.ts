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
  majoritarianRunningMateOrAlternates: string;
  majoritarianPartyLegends: string;
  campaignCnpj: string;
  officialWebsite: string;
  websiteRegisteredWithElectoralJustice: boolean;
  websitePreexisting: boolean;
  websiteListedInInitialFiling: boolean;
  websiteCreatedAt: string;
  websiteRegistrationDate: string;
  providerEstablishedInBrazil: boolean;
  privacyPolicyUrl: string;
  responsibleName: string;
  dataSubjectRightsChannel: string;
  dataProtectionOfficerName: string;
  dataProcessingRecordMaintained: boolean;
  securityMeasuresConfirmed: boolean;
  processesSensitiveData: boolean;
  sensitiveDataExplicitConsentConfirmed: boolean;
  contentMode: ElectoralContentMode;
  usesAi: boolean;
  usesSyntheticMedia: boolean;
  syntheticMediaDisclosure: boolean;
  sourceVerificationRequired: boolean;
  legalReviewRequired: boolean;
  legalReviewConfirmed: boolean;
  messagingConsentConfirmed: boolean;
  senderIdentificationConfirmed: boolean;
  unsubscribeMechanismConfirmed: boolean;
  unsubscribeWithin48HoursConfirmed: boolean;
  paidBoosting: boolean;
  paidBoostingProvider: string;
  paidBoostingContractedByAuthorizedActor: boolean;
  paidBoostingIdentificationConfirmed: boolean;
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
    'número eleitoral, partido e dados de chapa majoritária',
    'CNPJ de campanha',
    'comunicação do endereço eletrônico à Justiça Eleitoral',
    'LGPD eleitoral, encarregado, canal do titular e registro de operações',
    'regras de propaganda e impulsionamento eleitoral',
    'rotulagem e bloqueios eleitorais de IA',
  ],
} as const;

const normalizeDigits = (value: string) => value.replace(/\D/g, '');
const HOUR = 3_600_000;

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

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function hoursSinceRegistration(registrationDate: string, now = new Date()): number | null {
  const registeredAt = parseDate(registrationDate);
  if (!registeredAt) return null;
  return (now.getTime() - registeredAt.getTime()) / HOUR;
}

function isWithinElectionWindow(electionDate: string, beforeHours: number, afterHours: number, now = new Date()): boolean {
  if (!electionDate) return false;
  const election = new Date(`${electionDate}T17:00:00-03:00`);
  if (Number.isNaN(election.getTime())) return false;
  return now.getTime() >= election.getTime() - beforeHours * HOUR && now.getTime() <= election.getTime() + afterHours * HOUR;
}

export function isSyntheticMediaRestrictedWindow(electionDate: string, now = new Date()): boolean {
  return isWithinElectionWindow(electionDate, 72, 24, now);
}

export function isPaidBoostingRestrictedWindow(electionDate: string, now = new Date()): boolean {
  return isWithinElectionWindow(electionDate, 48, 24, now);
}

export function isMajoritarianRole(role: string): boolean {
  return ['presidente', 'governador', 'senador'].includes(role);
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
  if (isMajoritarianRole(profile.candidateRole) && !profile.majoritarianRunningMateOrAlternates.trim()) {
    blockers.push('Propaganda majoritária exige cadastro dos nomes de vice ou suplentes, conforme o cargo.');
  }
  if (isMajoritarianRole(profile.candidateRole) && profile.federationOrCoalition.trim() && !profile.majoritarianPartyLegends.trim()) {
    blockers.push('Informe as legendas partidárias integrantes da federação/coligação para a propaganda majoritária.');
  }
  if (!isValidCampaignCnpj(profile.campaignCnpj)) blockers.push('CNPJ da campanha deve conter 14 dígitos.');
  if (!isLikelyHttpsUrl(profile.officialWebsite)) blockers.push('Site oficial HTTPS da campanha não informado.');
  if (!profile.websiteRegisteredWithElectoralJustice) blockers.push('Endereço eletrônico ainda não confirmado como comunicado à Justiça Eleitoral.');
  if (!profile.providerEstablishedInBrazil) blockers.push('Hospedagem/provedor estabelecido no Brasil ainda não confirmado para o site oficial da candidatura.');
  if (!profile.responsibleName.trim()) blockers.push('Responsável pela publicação não informado.');

  if (profile.websiteRegisteredWithElectoralJustice) {
    const communicatedAt = parseDate(profile.websiteRegistrationDate);
    if (!communicatedAt) {
      blockers.push('Informe a data/hora da comunicação do endereço eletrônico à Justiça Eleitoral.');
    } else if (profile.websitePreexisting && !profile.websiteListedInInitialFiling) {
      const ageHours = (now.getTime() - communicatedAt.getTime()) / HOUR;
      if (ageHours < 48) blockers.push('Endereço preexistente não informado no RRC/DRAP só pode ser usado 48 horas após seu registro na Justiça Eleitoral.');
    }

    if (!profile.websitePreexisting) {
      const createdAt = parseDate(profile.websiteCreatedAt);
      if (!createdAt) {
        blockers.push('Informe a data/hora de criação do endereço eletrônico criado durante a campanha.');
      } else if (communicatedAt) {
        const delayHours = (communicatedAt.getTime() - createdAt.getTime()) / HOUR;
        if (delayHours < 0) blockers.push('A comunicação à Justiça Eleitoral não pode anteceder a criação do endereço.');
        if (delayHours > 24) blockers.push('Endereço criado durante a campanha deve ser comunicado à Justiça Eleitoral em até 24 horas da criação.');
      }
    }
  }

  if (!isLikelyHttpsUrl(profile.privacyPolicyUrl)) blockers.push('Política de Privacidade HTTPS não cadastrada.');
  if (!profile.dataSubjectRightsChannel.trim()) blockers.push('Canal de direitos do titular/LGPD não informado de forma clara e acessível.');
  if (!profile.dataProtectionOfficerName.trim()) blockers.push('Encarregado pelo tratamento de dados pessoais não informado.');
  if (!profile.dataProcessingRecordMaintained) blockers.push('Registro das operações de tratamento de dados pessoais deve estar ativo e conservado.');
  if (!profile.securityMeasuresConfirmed) blockers.push('Medidas técnicas e administrativas de segurança para dados pessoais ainda não foram confirmadas.');
  if (profile.processesSensitiveData && !profile.sensitiveDataExplicitConsentConfirmed) {
    blockers.push('Tratamento de dado pessoal sensível para propaganda eleitoral exige consentimento específico, expresso e destacado, salvo hipótese legal específica devidamente validada.');
  }

  if (!profile.sourceVerificationRequired) blockers.push('Verificação de fontes deve permanecer obrigatória no módulo eleitoral.');
  if (!profile.legalReviewRequired) blockers.push('Revisão humana/jurídica deve permanecer obrigatória antes de publicar.');
  if (!profile.legalReviewConfirmed) blockers.push('Revisão humana/jurídica ainda não foi confirmada para publicação.');

  if (profile.usesSyntheticMedia && !profile.syntheticMediaDisclosure) {
    blockers.push('Conteúdo sintético multimídia exige rotulagem explícita, destacada e acessível com indicação da tecnologia utilizada.');
  }
  if (profile.usesSyntheticMedia && options.electionDate && isSyntheticMediaRestrictedWindow(options.electionDate, now)) {
    blockers.push('Novo conteúdo sintético com imagem, voz ou manifestação de candidatura/pessoa pública está bloqueado da janela de 72h antes até 24h após o pleito.');
  }

  if (profile.paidBoosting) {
    if (!profile.paidBoostingProvider.trim()) blockers.push('Informe o provedor de impulsionamento eleitoral.');
    if (/google/i.test(profile.paidBoostingProvider)) blockers.push('Google proíbe anúncios político-eleitorais no Brasil; não encaminhar campanha eleitoral para Google Ads.');
    if (!profile.paidBoostingContractedByAuthorizedActor) blockers.push('Impulsionamento deve ser contratado diretamente por ator autorizado da campanha, conforme a regra eleitoral aplicável.');
    if (!profile.paidBoostingIdentificationConfirmed) blockers.push('Impulsionamento deve manter identificação eleitoral exigida, inclusive CNPJ/CPF do responsável e indicação de propaganda eleitoral, conforme aplicável.');
    if (options.electionDate && isPaidBoostingRestrictedWindow(options.electionDate, now)) blockers.push('Circulação paga/impulsionada está bloqueada de 48 horas antes até 24 horas depois da eleição.');
  }

  if (!profile.messagingConsentConfirmed) warnings.push('Mensageria eleitoral não deve ser habilitada sem base legal/consentimento aplicável e origem legítima dos dados.');
  if (!profile.senderIdentificationConfirmed) warnings.push('Mensagens eleitorais precisam identificar completamente a pessoa remetente.');
  if (!profile.unsubscribeMechanismConfirmed || !profile.unsubscribeWithin48HoursConfirmed) {
    warnings.push('Mensageria deve permitir descadastramento/eliminação e cumprir a solicitação no prazo eleitoral aplicável de 48 horas.');
  }

  if (profile.monetizationMode !== 'off' && !profile.monetizationLegalReviewConfirmed) {
    blockers.push('Monetização em página oficial de campanha exige revisão eleitoral/contábil específica antes de ser habilitada.');
  }
  if (profile.monetizationMode === 'adsense-editorial') {
    warnings.push('Blocos AdSense devem ser visualmente separados de banners políticos, CTAs e controles interativos, sem indução a clique.');
  }

  const totalChecks = 28;
  const score = Math.max(0, Math.round(((totalChecks - Math.min(blockers.length, totalChecks)) / totalChecks) * 100));
  return {
    score,
    blockers,
    warnings,
    canGenerateDraft: blockers.filter((item) => /Nome completo|Nome de urna|Número de urna|Partido|Cargo|CNPJ/.test(item)).length === 0,
    canPublish: blockers.length === 0,
  };
}
