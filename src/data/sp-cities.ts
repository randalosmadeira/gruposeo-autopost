export interface IbgeLocality {
  id: number;
  nome: string;
}

export const IBGE_SP_MUNICIPALITIES_ENDPOINT =
  'https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios?orderBy=nome';

export const IBGE_SP_CAPITAL_DISTRICTS_ENDPOINT =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios/3550308/distritos?orderBy=nome';

// Atalhos editoriais. A cobertura integral dos municípios é carregada da API oficial do IBGE.
export const SP_REGIONS = [
  { region: 'Capital', cities: ['São Paulo'] },
  { region: 'Grande São Paulo', cities: ['Guarulhos', 'São Bernardo do Campo', 'Santo André', 'Osasco', 'Mauá', 'Diadema', 'Carapicuíba', 'Mogi das Cruzes', 'Itaquaquecetuba', 'Taboão da Serra', 'Barueri', 'Cotia', 'Suzano', 'Embu das Artes', 'Ferraz de Vasconcelos', 'Francisco Morato', 'Itapecerica da Serra', 'Franco da Rocha', 'Poá', 'Arujá', 'Caieiras', 'Jandira', 'Mairiporã', 'Ribeirão Pires', 'Rio Grande da Serra', 'Santana de Parnaíba', 'Vargem Grande Paulista', 'Pirapora do Bom Jesus', 'São Lourenço da Serra', 'Juquitiba', 'Biritiba-Mirim', 'Salesópolis', 'Guararema'] },
  { region: 'Campinas', cities: ['Campinas', 'Indaiatuba', 'Americana', 'Sumaré', 'Hortolândia', 'Santa Bárbara d\'Oeste', 'Valinhos', 'Vinhedo', 'Itatiba', 'Paulínia', 'Nova Odessa', 'Monte Mor', 'Cosmópolis', 'Artur Nogueira', 'Engenheiro Coelho', 'Holambra', 'Jaguariúna', 'Pedreira', 'Santo Antônio de Posse'] },
  { region: 'Baixada Santista', cities: ['Santos', 'São Vicente', 'Praia Grande', 'Guarujá', 'Cubatão', 'Bertioga', 'Itanhaém', 'Mongaguá', 'Peruíbe'] },
  { region: 'Vale do Paraíba', cities: ['São José dos Campos', 'Taubaté', 'Jacareí', 'Pindamonhangaba', 'Caraguatatuba', 'Lorena', 'Guaratinguetá', 'Cruzeiro', 'Ubatuba', 'São Sebastião', 'Ilhabela', 'Campos do Jordão', 'Caçapava', 'Tremembé', 'Aparecida'] },
  { region: 'Sorocaba', cities: ['Sorocaba', 'Itu', 'Salto', 'Tatuí', 'Itapetininga', 'Piedade', 'Votorantim', 'São Roque', 'Araçoiaba da Serra', 'Boituva', 'Cerquilho', 'Tietê', 'Porto Feliz', 'Alumínio', 'Mairinque', 'Capela do Alto'] },
  { region: 'Ribeirão Preto', cities: ['Ribeirão Preto', 'Franca', 'Sertãozinho', 'Bebedouro', 'Barretos', 'Jardinópolis', 'Cravinhos', 'Batatais', 'Orlândia', 'Ituverava', 'Guará', 'São Joaquim da Barra', 'Brodowski', 'Pontal', 'Altinópolis'] },
  { region: 'São José do Rio Preto', cities: ['São José do Rio Preto', 'Catanduva', 'Votuporanga', 'Mirassol', 'Fernandópolis', 'Jales', 'Olímpia', 'José Bonifácio', 'Tanabi', 'Monte Aprazível', 'Novo Horizonte', 'Potirendaba'] },
  { region: 'Bauru / Marília', cities: ['Bauru', 'Jaú', 'Marília', 'Lins', 'Botucatu', 'Avaré', 'Pederneiras', 'Bariri', 'Barra Bonita', 'Dois Córregos', 'Agudos', 'Lençóis Paulista', 'São Manuel'] },
  { region: 'Presidente Prudente', cities: ['Presidente Prudente', 'Assis', 'Presidente Epitácio', 'Adamantina', 'Dracena', 'Osvaldo Cruz', 'Presidente Venceslau', 'Regente Feijó', 'Martinópolis', 'Rancharia'] },
  { region: 'Araçatuba', cities: ['Araçatuba', 'Birigui', 'Penápolis', 'Andradina', 'Ilha Solteira', 'Guararapes', 'Valparaíso', 'Castilho'] },
  { region: 'Piracicaba', cities: ['Piracicaba', 'Limeira', 'Rio Claro', 'Araras', 'São Pedro', 'Leme', 'Santa Gertrudes', 'Cordeirópolis', 'Iracemápolis', 'Charqueada', 'Águas de São Pedro'] },
  { region: 'Jundiaí', cities: ['Jundiaí', 'Várzea Paulista', 'Campo Limpo Paulista', 'Itupeva', 'Louveira', 'Cabreúva', 'Jarinu'] },
  { region: 'Araraquara / São Carlos', cities: ['Araraquara', 'São Carlos', 'Matão', 'Descalvado', 'Ibaté', 'Porto Ferreira', 'Ibitinga', 'Américo Brasiliense'] },
] as const;

export const ALL_SP_CITIES = Array.from(new Set(SP_REGIONS.flatMap((region) => [...region.cities])))
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));

export async function fetchAllSpMunicipalities(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(IBGE_SP_MUNICIPALITIES_ENDPOINT, { signal });
  if (!response.ok) throw new Error(`IBGE municípios: HTTP ${response.status}`);
  const data = (await response.json()) as IbgeLocality[];
  return data.map((item) => item.nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function fetchSpCapitalDistricts(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(IBGE_SP_CAPITAL_DISTRICTS_ENDPOINT, { signal });
  if (!response.ok) throw new Error(`IBGE distritos: HTTP ${response.status}`);
  const data = (await response.json()) as IbgeLocality[];
  return data.map((item) => item.nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Sugestões factuais. Não recomendar voto, ranquear ou classificar candidaturas.
export const ELECTORAL_KEYWORD_SUGGESTIONS: Record<string, string[]> = {
  'deputado-federal': [
    'atribuições de deputado federal',
    'propostas para crédito e pequenas empresas em São Paulo',
    'SCR Bacen e acesso a crédito',
    'Cadastro Positivo e Score Serasa',
    'BNDES para micro e pequenas empresas',
    'CNH aos 16 anos proposta legislativa',
    'IRPF saúde educação segurança pública proposta',
    'legislação federal sobre porte de arma de fogo',
    'Lei Rouanet inclusão cultural',
    'impacto de políticas federais em {city}',
    'competência do Congresso Nacional sobre crédito',
    'competência federal sobre trânsito e CNH',
  ],
  'deputado-estadual': [
    'atribuições de deputado estadual',
    'competências da Assembleia Legislativa de São Paulo',
    'políticas estaduais em {city}',
  ],
  'senador': [
    'atribuições de senador',
    'competências do Senado Federal',
    'políticas federais com impacto em São Paulo',
  ],
  'governador': [
    'atribuições do governador do estado',
    'competências do governo estadual de São Paulo',
  ],
  'prefeito': [
    'atribuições do prefeito de {city}',
    'competências municipais em {city}',
  ],
  'vereador': [
    'atribuições do vereador de {city}',
    'competências da câmara municipal de {city}',
  ],
};

export const CAMPAIGN_TOPICS = [
  'Finanças & Crédito',
  'Economia & Tributos',
  'Mobilidade & Juventude',
  'Segurança Pública',
  'Cultura & Sociedade',
  'Empreendedorismo',
  'Educação',
  'Saúde',
  'Infraestrutura',
  'Tecnologia e Inovação',
];
