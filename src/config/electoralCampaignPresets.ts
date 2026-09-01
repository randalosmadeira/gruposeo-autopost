export interface ElectoralCampaignPreset {
  id: string;
  label: string;
  candidateName: string;
  ballotName: string;
  ballotNumber: string;
  candidateRole: string;
  politicalParty: string;
  federationOrCoalition: string;
  slogan: string;
  state: string;
  campaignCnpj: string;
  fixedIssues: string[];
  footerTemplate: string;
}

export const MADEIRA_1470_PRESET: ElectoralCampaignPreset = {
  id: 'madeira-1470-sp-2026',
  label: 'Dr. Madeira 1470 — Deputado Federal SP 2026',
  candidateName: 'Dr. Rândalos Madeira',
  ballotName: 'Dr. Madeira',
  ballotNumber: '1470',
  candidateRole: 'deputado-federal',
  politicalParty: 'Partido da Missão - SP',
  federationOrCoalition: '',
  slogan: 'Madeira Neles! Sem verniz, com atitude!',
  state: 'SP',
  // Identificador jurídico: manter vazio até confirmação do número oficial da campanha.
  campaignCnpj: '',
  fixedIssues: [
    'Fim do Score Serasa, Cadastro Positivo e SCR-Bacen.',
    'Fim da burocracia do BNDES: crédito universal para micro, pequenos e médios negócios.',
    'CNH a partir dos 16 anos.',
    'IRPF Zero para Saúde, Educação e Segurança Pública.',
    'Porte de arma de fogo simplificado no modelo da CNH.',
    'Inclusão cultural plena na Lei Rouanet: Gospel, Funk, LGBTQIA+, Pagode e Samba.',
  ],
  footerTemplate:
    'Propaganda Eleitoral · {party} · {candidate} · {number} · CNPJ {cnpj}. Conteúdo sujeito à revisão humana e às regras eleitorais vigentes.',
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
    .replace('{cnpj}', campaignCnpj.trim() || '[CNPJ A CONFIRMAR]');
}
