export interface ElectoralDonationChannel {
  type: 'pix' | 'bank' | 'crowdfunding' | 'transparency';
  label: string;
  value: string;
  href?: string;
  verificationStatus: 'campaign-declared' | 'platform-observed' | 'official-source-verified';
}

export interface ElectoralCampaignPreset {
  id: string;
  label: string;
  legalName: string;
  candidateName: string;
  ballotName: string;
  ballotNumber: string;
  candidateRole: string;
  politicalParty: string;
  federationOrCoalition: string;
  slogan: string;
  state: string;
  campaignCnpj: string;
  cnpjVerificationStatus: 'campaign-declared' | 'official-source-verified';
  tseSequence: string;
  registrationProcess: string;
  registrationStatus: string;
  officialWebsite: string;
  officialWebsiteVerificationStatus: 'campaign-declared' | 'electoral-filing-verified';
  fixedIssues: string[];
  donationChannels: ElectoralDonationChannel[];
  financialReviewRequired: boolean;
  autoPublishDonationCta: boolean;
  footerTemplate: string;
}

export const MADEIRA_1470_PRESET: ElectoralCampaignPreset = {
  id: 'madeira-1470-sp-2026',
  label: 'Dr. Madeira 1470 — Deputado Federal SP 2026',
  legalName: 'Rândalos Dias Custódio da Conceição Madeira',
  candidateName: 'Dr. Rândalos Madeira',
  ballotName: 'Dr. Madeira',
  ballotNumber: '1470',
  candidateRole: 'deputado-federal',
  politicalParty: 'Partido MISSÃO (SP)',
  federationOrCoalition: 'Partido isolado',
  slogan: 'Madeira Neles! Sem verniz, com atitude!',
  state: 'SP',
  campaignCnpj: '68.504.175/0001-70',
  cnpjVerificationStatus: 'campaign-declared',
  tseSequence: '250002546639',
  registrationProcess: '0602143-70.2026.6.26.0000',
  registrationStatus: 'Aguardando julgamento',
  officialWebsite: 'https://drmadeira1470.com.br/',
  officialWebsiteVerificationStatus: 'campaign-declared',
  fixedIssues: [
    'Fim do Score Serasa, Cadastro Positivo e SCR-Bacen.',
    'Fim da burocracia do BNDES: crédito universal para micro, pequenos e médios negócios.',
    'CNH a partir dos 16 anos.',
    'IRPF Zero para Saúde, Educação e Segurança Pública.',
    'Porte de arma de fogo simplificado no modelo da CNH.',
    'Inclusão cultural plena na Lei Rouanet: Gospel, Funk, LGBTQIA+, Pagode e Samba.',
  ],
  donationChannels: [
    { type: 'pix', label: 'PIX — CNPJ da campanha', value: '68.504.175/0001-70', verificationStatus: 'campaign-declared' },
    { type: 'bank', label: 'Banco do Brasil S.A. (001) — Agência 1204-1', value: 'Eleição 2026 Rândalos Dias Custódio da Conceição Madeira', verificationStatus: 'campaign-declared' },
    { type: 'crowdfunding', label: 'Quero Apoiar', value: 'queroapoiar.com.br/drrandalosmadeira', href: 'https://queroapoiar.com.br/drrandalosmadeira', verificationStatus: 'platform-observed' },
    { type: 'crowdfunding', label: 'Apoiar.me', value: 'apoiar.me/drrandalosmadeira', href: 'https://apoiar.me/drrandalosmadeira', verificationStatus: 'campaign-declared' },
    { type: 'transparency', label: 'DivulgaCandContas/TSE', value: '250002546639', href: 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/SUDESTE/SP/20322002026/250002546639/2026/SP', verificationStatus: 'official-source-verified' },
  ],
  financialReviewRequired: true,
  autoPublishDonationCta: false,
  footerTemplate:
    'Propaganda Eleitoral · {party} · {candidate} · {number} · CNPJ {cnpj}. Registro TSE {tse}. Situação: {status}. Conteúdo sujeito à revisão humana e às regras eleitorais vigentes.',
};

export const ELECTORAL_CAMPAIGN_PRESETS: Record<string, ElectoralCampaignPreset> = {
  [MADEIRA_1470_PRESET.id]: MADEIRA_1470_PRESET,
};

export function formatCampaignFooter(
  preset: ElectoralCampaignPreset,
  campaignCnpj = preset.campaignCnpj,
): string {
  return preset.footerTemplate
    .replace('{party}', preset.politicalParty)
    .replace('{candidate}', preset.ballotName)
    .replace('{number}', preset.ballotNumber)
    .replace('{cnpj}', campaignCnpj.trim() || '[CNPJ A CONFIRMAR]')
    .replace('{tse}', preset.tseSequence)
    .replace('{status}', preset.registrationStatus);
}
