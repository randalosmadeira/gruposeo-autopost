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
  registrationDecisionDate: string;
  registrationDecisionSource: string;
  officialWebsite: string;
  officialWebsiteVerificationStatus: 'campaign-declared' | 'electoral-filing-verified';
  fixedIssues: string[];
  biographyDefault: string;
  legislativeProjectsDefault: string;
  documentedActsDefault: string;
  factualDifferentialsDefault: string;
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
  registrationStatus: 'Registro deferido pelo TRE-SP — votação unânime em 31/08/2026',
  registrationDecisionDate: '2026-08-31',
  registrationDecisionSource: 'https://www.tre-sp.jus.br/servicos-judiciais/sessoes-de-julgamento/arquivos-2022/tre-sp-eleicoes-2026-resultados-dos-julgamentos-por-v-u-sessao-de-31-de-agosto-de-2026',
  officialWebsite: 'https://drmadeira1470.com.br/',
  officialWebsiteVerificationStatus: 'campaign-declared',
  fixedIssues: [
    'Fim do Score Serasa, Cadastro Positivo e SCR-Bacen.',
    'Fim da burocracia do BNDES: crédito universal para micro, pequenos e médios negócios.',
    'CNH a partir dos 16 anos.',
    'IRPF Zero para Saúde, Educação e Segurança Pública.',
    'Porte de arma de fogo simplificado no modelo da CNH.',
    'Inclusão cultural plena na Lei Rouanet: Gospel, Funk, LGBTQIA+, Pagode e Samba.',
    'Proteção e desburocratização para ambulantes e pequenos comerciantes.',
    'Limite de 15% para taxas de plataformas de aplicativo, conforme pauta oficial da campanha.',
    'Escola Segura e valorização de profissionais da educação.',
    'Proteção patrimonial para vítima de veículo roubado, com referência à tabela FIPE na pauta da campanha.',
    'Minha Casa, Não Minha Dívida: revisão da pauta habitacional e do endividamento familiar.',
    'Bota Fé na Quebrada: microcrédito para economia criativa e pequenos negócios.',
    'Funk é Cultura e ampliação do acesso da cultura periférica às políticas culturais.',
    'Lei dos Alvarás Criativos e simplificação para eventos e economia criativa.',
    'Núcleos Populares de Propriedade Intelectual.',
    'Polos PerifaTech de Economia Digital.',
    'Lei do Primeiro Emprego Criativo.',
    'Programa Devido Processo na Quebrada.',
  ],
  biographyDefault: `Rândalos Dias Custódio da Conceição Madeira, nome de urna Dr. Madeira, nasceu no Bairro dos Pimentas, em Guarulhos. A página oficial da candidatura registra trajetória como ex-técnico de telecomunicações, com atuação vinculada a Telefônica, GVT, TIM e Ericsson, e posterior atuação como advogado inscrito na OAB/SP e sócio-fundador da RDM Advogados. A biografia declarada pela campanha acrescenta experiência de trabalho popular e técnico em diferentes regiões da Grande São Paulo, vivência empresarial e atuação jurídica voltada a consumidor, fraudes, criminal, civil e defesa de pequenos negócios. É candidato a Deputado Federal por São Paulo, número 1470, Partido MISSÃO. Detalhes biográficos não documentados em fonte externa permanecem classificados no corpus como declaração da campanha e sujeitos a revisão antes de publicação factual.`,
  legislativeProjectsDefault: `• Fim do Score Serasa, Cadastro Positivo e SCR-Bacen opacos.\n• Crédito e desburocratização do BNDES para micro, pequenos e médios negócios.\n• CNH a partir dos 16 anos, com responsabilidade e regras próprias a serem definidas por projeto de lei.\n• IRPF Zero para Saúde, Educação e Segurança Pública.\n• Porte de arma de fogo simplificado no modelo da CNH, sujeito ao processo legislativo e às regras constitucionais.\n• Inclusão cultural na Lei Rouanet: Gospel, Funk, LGBTQIA+, Pagode e Samba.\n• Proteção ao ambulante e ao pequeno comerciante.\n• Limite de 15% para taxas de Uber, 99, iFood e plataformas equivalentes, conforme pauta da campanha.\n• Escola Segura.\n• Carro roubado: pauta de proteção patrimonial com referência à FIPE.\n• Minha Casa, Não Minha Dívida.\n• Bota Fé na Quebrada — microcrédito para economia criativa.\n• Funk é Cultura.\n• Lei dos Alvarás Criativos.\n• Núcleos Populares de Propriedade Intelectual.\n• Polos PerifaTech de Economia Digital.\n• Lei do Primeiro Emprego Criativo.\n• Programa Devido Processo na Quebrada.`,
  documentedActsDefault: `• Nascido e criado no Bairro dos Pimentas, Guarulhos, conforme perfil oficial da candidatura.\n• Experiência profissional como técnico de telecomunicações antes da advocacia, conforme site oficial.\n• Advogado inscrito na OAB/SP; no RCand 0602143-70.2026.6.26.0000 consta também como advogado no processo.\n• Sócio-fundador da RDM Advogados, conforme página oficial da candidatura.\n• Registro de candidatura nº 0602143-70.2026.6.26.0000 deferido pelo TRE-SP em sessão de 31/08/2026; relator Des. Mairan Maia Júnior. O resultado consta da relação oficial de julgamentos por votação unânime.\n• Candidatura a Deputado Federal por São Paulo, número 1470, Partido MISSÃO, sequencial TSE 250002546639.`,
  factualDifferentialsDefault: `Combinação de experiência técnica em telecomunicações, atuação jurídica, gestão empresarial e origem em Guarulhos. O conteúdo editorial deve distinguir fatos documentados, experiências declaradas pela campanha, propostas legislativas e opiniões. Para matérias sobre o registro eleitoral, usar como fonte primária o TRE-SP e registrar que o processo 0602143-70.2026.6.26.0000 foi deferido em 31/08/2026 em julgamento unânime.`,
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
