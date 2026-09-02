export interface ElectoralBackendDonationChannel {
  type: 'pix' | 'bank' | 'crowdfunding' | 'transparency';
  label: string;
  value: string;
  href?: string;
  verificationStatus: 'campaign-declared' | 'platform-observed' | 'official-source-verified';
}

export interface ElectoralBackendPreset {
  id:string; legalName:string; candidateName:string; ballotName:string; ballotNumber:string;
  candidateRole:string; politicalParty:string; federationOrCoalition:string; slogan:string; state:string;
  campaignCnpj:string; cnpjVerificationStatus:'campaign-declared'|'official-source-verified';
  tseSequence:string; registrationProcess:string; registrationStatus:string; registrationDecisionDate:string;
  registrationDecisionSource:string; officialWebsite:string; officialWebsiteVerificationStatus:'campaign-declared'|'electoral-filing-verified';
  fixedIssues:string[]; donationChannels:ElectoralBackendDonationChannel[]; financialReviewRequired:boolean;
  autoPublishDonationCta:boolean; footerTemplate:string;
}

export const MADEIRA_1470_BACKEND_PRESET: ElectoralBackendPreset = {
  id:'madeira-1470-sp-2026',
  legalName:'Rândalos Dias Custódio da Conceição Madeira',
  candidateName:'Dr. Rândalos Madeira',
  ballotName:'Dr. Madeira',
  ballotNumber:'1470',
  candidateRole:'deputado-federal',
  politicalParty:'Partido MISSÃO (SP)',
  federationOrCoalition:'Partido isolado',
  slogan:'Madeira Neles! Sem verniz, com atitude!',
  state:'SP',
  campaignCnpj:'68.504.175/0001-70',
  cnpjVerificationStatus:'campaign-declared',
  tseSequence:'250002546639',
  registrationProcess:'0602143-70.2026.6.26.0000',
  registrationStatus:'Registro deferido pelo TRE-SP — votação unânime em 31/08/2026',
  registrationDecisionDate:'2026-08-31',
  registrationDecisionSource:'https://www.tre-sp.jus.br/servicos-judiciais/sessoes-de-julgamento/arquivos-2022/tre-sp-eleicoes-2026-resultados-dos-julgamentos-por-v-u-sessao-de-31-de-agosto-de-2026',
  officialWebsite:'https://drmadeira1470.com.br/',
  officialWebsiteVerificationStatus:'campaign-declared',
  fixedIssues:[
    'Fim do Score Serasa, Cadastro Positivo e SCR-Bacen.',
    'Fim da burocracia do BNDES: crédito universal para micro, pequenos e médios negócios.',
    'CNH a partir dos 16 anos.',
    'IRPF Zero para Saúde, Educação e Segurança Pública.',
    'Porte de arma de fogo simplificado no modelo da CNH.',
    'Inclusão cultural plena na Lei Rouanet: Gospel, Funk, LGBTQIA+, Pagode e Samba.',
  ],
  donationChannels:[
    {type:'pix',label:'PIX — CNPJ da campanha',value:'68.504.175/0001-70',verificationStatus:'campaign-declared'},
    {type:'bank',label:'Banco do Brasil S.A. (001) — Agência 1204-1',value:'Eleição 2026 Rândalos Dias Custódio da Conceição Madeira',verificationStatus:'campaign-declared'},
    {type:'crowdfunding',label:'Quero Apoiar',value:'queroapoiar.com.br/drrandalosmadeira',href:'https://queroapoiar.com.br/drrandalosmadeira',verificationStatus:'platform-observed'},
    {type:'crowdfunding',label:'Apoiar.me',value:'apoiar.me/drrandalosmadeira',href:'https://apoiar.me/drrandalosmadeira',verificationStatus:'campaign-declared'},
    {type:'transparency',label:'DivulgaCandContas/TSE',value:'250002546639',href:'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/SUDESTE/SP/20322002026/250002546639/2026/SP',verificationStatus:'official-source-verified'},
  ],
  financialReviewRequired:true,
  autoPublishDonationCta:false,
  footerTemplate:'Propaganda Eleitoral · {party} · {candidate} · {number} · CNPJ {cnpj}. Registro TSE {tse}. Situação: {status}. Conteúdo sujeito à revisão humana e às regras eleitorais vigentes.',
};

export const ELECTORAL_BACKEND_PRESETS:Record<string,ElectoralBackendPreset>={
  [MADEIRA_1470_BACKEND_PRESET.id]:MADEIRA_1470_BACKEND_PRESET,
};

export function resolveElectoralPreset(id?:string):ElectoralBackendPreset {
  const key=String(id||MADEIRA_1470_BACKEND_PRESET.id);
  return ELECTORAL_BACKEND_PRESETS[key]||MADEIRA_1470_BACKEND_PRESET;
}

export function formatElectoralFooter(preset:ElectoralBackendPreset,campaignCnpj?:string):string {
  const cnpj=String(campaignCnpj||preset.campaignCnpj||'').trim()||'[CNPJ A CONFIRMAR]';
  return preset.footerTemplate.replace('{party}',preset.politicalParty).replace('{candidate}',preset.ballotName).replace('{number}',preset.ballotNumber).replace('{cnpj}',cnpj).replace('{tse}',preset.tseSequence).replace('{status}',preset.registrationStatus);
}
