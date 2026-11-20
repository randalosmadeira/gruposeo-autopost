/**
 * Pacotes de segmento da taxonomia: DADOS (sem rede, sem banco). Cada pacote diz, para um tipo de negócio, quais são as áreas matriz,
 * as subáreas, as palavras que revelam cada uma e quais áreas costumam andar juntas (nichos correlacionados).
 *
 * ADVOCACIA é o único pacote VALIDADO: as regras (RULES), as correlações (CORREL) e a ordem das regras vêm EXATAMENTE de
 * `auditoria-tecnica-rdm-2026-11-20/analisar.py` (a ordem importa: a página entra na PRIMEIRA subárea que combinar).
 * Acréscimos feitos depois, marcados abaixo e em PACK_ADDITIONS: `tornozeleira|monitoramento eletronico` em "Execução penal".
 * Os demais pacotes são RASCUNHOS de exemplo: mostram a estrutura, não foram validados e a função de borda recusa usá-los sem pedido explícito.
 *
 * As frases de consulta (`consulta`) são SUPOSIÇÃO de redação para o planejador de buscas, não vieram do analisar.py.
 */

export type PackStatus = 'validado' | 'rascunho';
export interface PackMatriz { label: string; /** área que atravessa as outras (peças, notícias): não vira consulta de mercado */ transversal?: boolean; /** base da consulta de mercado, ex.: "advogado criminalista" */ consulta?: string | null }
export interface PackRule { matriz: string; subarea: string; /** expressão regular (texto) sobre URL + título + H1 já normalizados (sem acento, minúsculos) */ rx: string; /** regra ampla: derruba a confiança */ generic?: boolean; consulta?: string | null }
export interface PackCorrel { from: string; to: string; note?: string }
export interface SegmentPack {
  id: string; label: string; status: PackStatus; description: string;
  matrizes: PackMatriz[]; rules: PackRule[]; correl: PackCorrel[];
  /** domínios que costumam ser diretório/portal do segmento (somam à lista geral do planejador) */
  noiseHosts: string[];
}

const R = String.raw;

export const PACK_ADDITIONS = [
  'ADVOCACIA > Execução penal e progressão de regime: acrescentados os termos "tornozeleira" e "monitoramento eletronico" (busca real: "tornozeleira apitando"). Fora isso, idêntico ao analisar.py.',
];

const ADV_MATRIZES: PackMatriz[] = [
  { label: 'Eleitoral e Político', consulta: 'advogado eleitoral' },
  { label: 'Peças e modelos', transversal: true },
  { label: 'Criminal', consulta: 'advogado criminalista' },
  { label: 'Trânsito e CNH', consulta: 'advogado de trânsito' },
  { label: 'Previdenciário (INSS)', consulta: 'advogado previdenciário' },
  { label: 'Bancário e Financiamentos', consulta: 'advogado bancário' },
  { label: 'Telecom e Provedores', consulta: 'advogado de telecomunicações' },
  { label: 'Saúde e Planos', consulta: 'advogado de plano de saúde' },
  { label: 'Consumidor', consulta: 'advogado do consumidor' },
  { label: 'Trabalhista', consulta: 'advogado trabalhista' },
  { label: 'Empresarial', consulta: 'advogado empresarial' },
  { label: 'Tributário', consulta: 'advogado tributarista' },
  { label: 'Família e Sucessões', consulta: 'advogado de família' },
  { label: 'Imobiliário', consulta: 'advogado imobiliário' },
  { label: 'Notícias e conteúdo jurídico', transversal: true },
];

// Mesma ordem e mesmas expressões do RULES do analisar.py.
const ADV_RULES: PackRule[] = [
  { matriz: 'Eleitoral e Político', subarea: 'Eleitoral e candidaturas', rx: R`eleitor|candidat|campanha eleitoral|deputado|votar|quem votar|propaganda eleitoral|\btre\b`, consulta: 'advogado de direito eleitoral' },
  { matriz: 'Peças e modelos', subarea: 'Modelos de petição', rx: R`modelo de peticao|modelo peticao|seumodelo|peticao inicial modelo`, consulta: null },
  { matriz: 'Criminal', subarea: 'Crimes aeroportuários e federais', rx: R`aeroport|crime federal|crimes federais|trafico internacional|contrabando|policia federal`, consulta: 'advogado de crimes federais' },
  { matriz: 'Criminal', subarea: 'Violência doméstica e Maria da Penha', rx: R`maria da penha|violencia domestica|medida protetiva|lesao corporal domestica|feminicidio`, consulta: 'advogado de violência doméstica' },
  { matriz: 'Criminal', subarea: 'Crimes digitais e cibernéticos', rx: R`crime digital|crimes digitais|ciberneticos|crime cibernetico|invasao de dispositivo|stalking|calunia|difamacao|injuria`, consulta: 'advogado de crimes digitais' },
  { matriz: 'Criminal', subarea: 'Crimes de trânsito', rx: R`embriaguez ao volante|lei seca|homicidio culposo no transito|bafometro|recusa ao bafometro`, consulta: 'advogado de crime de trânsito' },
  { matriz: 'Criminal', subarea: 'Drogas e tráfico', rx: R`trafico|drogas|entorpecente|lei de drogas|associacao para o trafico|posse de drogas`, consulta: 'advogado de tráfico de drogas' },
  { matriz: 'Criminal', subarea: 'Crimes patrimoniais (roubo, furto, estelionato)', rx: R`roubo|furto|estelionato|receptacao|latrocinio|extorsao`, consulta: 'advogado de crimes patrimoniais' },
  { matriz: 'Criminal', subarea: 'Tribunal do Júri e homicídio', rx: R`\bjuri\b|homicidio|tentativa de homicidio`, consulta: 'advogado de tribunal do júri' },
  { matriz: 'Criminal', subarea: 'Crimes econômicos, tributários e lavagem', rx: R`lavagem de dinheiro|crime tributario|crime economico|crimes financeiros|sonegacao|crime contra a ordem`, consulta: 'advogado de crimes econômicos' },
  { matriz: 'Criminal', subarea: 'Execução penal e progressão de regime', rx: R`execucao penal|progressao de regime|livramento condicional|saidinha|indulto|remicao|tornozeleira|monitoramento eletronico`, consulta: 'advogado de execução penal' },
  { matriz: 'Criminal', subarea: 'Habeas corpus e recursos criminais', rx: R`habeas corpus|recurso criminal|apelacao criminal|revisao criminal`, consulta: 'advogado de habeas corpus' },
  { matriz: 'Criminal', subarea: 'Prisão em flagrante, custódia e liberdade', rx: R`flagrante|audiencia de custodia|prisao preventiva|prisao temporaria|liberdade provisoria|relaxamento|fianca|preso|prisao`, consulta: 'advogado para prisão em flagrante' },
  { matriz: 'Criminal', subarea: 'Plantão, delegacia e inquérito', rx: R`plantao|delegacia|inquerito|depoimento|intimacao|dp \d|dhpp|deic`, consulta: 'advogado criminalista plantão 24 horas' },
  { matriz: 'Criminal', subarea: 'Defesa criminal geral', rx: R`criminal|criminalista|crime|penal|reu\b`, generic: true, consulta: null },
  { matriz: 'Trânsito e CNH', subarea: 'Suspensão, cassação e processo administrativo', rx: R`suspensao da cnh|cassacao|processo administrativo de transito|cnh|carteira de habilitacao|detran`, consulta: 'advogado de suspensão de CNH' },
  { matriz: 'Trânsito e CNH', subarea: 'Multas e pontuação', rx: R`multa|pontos na carteira|pontuacao|recurso de multa|jari`, consulta: 'advogado de multas de trânsito' },
  { matriz: 'Previdenciário (INSS)', subarea: 'Aposentadorias', rx: R`aposentadoria|tempo de contribuicao|aposentar`, consulta: 'advogado de aposentadoria' },
  { matriz: 'Previdenciário (INSS)', subarea: 'Benefícios por incapacidade e BPC/LOAS', rx: R`auxilio doenca|auxilio por incapacidade|incapacidade|invalidez|bpc|loas|beneficio assistencial|auxilio acidente`, consulta: 'advogado de BPC LOAS e auxílio-doença' },
  { matriz: 'Previdenciário (INSS)', subarea: 'Pensão, maternidade e outros benefícios', rx: R`pensao por morte|salario maternidade|auxilio reclusao|inss|previdenci|revisao da vida toda|beneficio`, generic: true, consulta: 'advogado de pensão por morte' },
  { matriz: 'Bancário e Financiamentos', subarea: 'Revisional de financiamento e juros abusivos', rx: R`revisional|juros abusivos|juros|financiamento|veiculo financiado|busca e apreensao`, consulta: 'advogado de revisional de financiamento' },
  { matriz: 'Bancário e Financiamentos', subarea: 'Empréstimos, consignado e cartão', rx: R`consignado|emprestimo|cartao de credito|cartao|superendividamento|renegociacao|bancos?\b`, consulta: 'advogado de empréstimo consignado' },
  { matriz: 'Telecom e Provedores', subarea: 'Regulação e contratos de provedores', rx: R`provedor|anatel|fibra optica|telecom|telecomunicac|internet`, consulta: 'advogado para provedores de internet' },
  { matriz: 'Saúde e Planos', subarea: 'Planos de saúde e negativas', rx: R`plano de saude|negativa de cobertura|medicamento|cirurgia|bariatrica|tratamento|convenio medico`, consulta: 'advogado de negativa de plano de saúde' },
  { matriz: 'Consumidor', subarea: 'Negativação, cobrança e danos morais', rx: R`negativacao|nome sujo|cobranca indevida|serasa|spc|danos morais|consumidor|nome negativado`, consulta: 'advogado de negativação indevida' },
  { matriz: 'Consumidor', subarea: 'Produtos, serviços e transporte aéreo', rx: R`produto|voo|cancelamento|atraso|overbooking|garantia|vicio`, generic: true, consulta: 'advogado de cancelamento de voo' },
  { matriz: 'Trabalhista', subarea: 'Rescisão, verbas e vínculo', rx: R`trabalhista|rescisao|horas extras|vinculo empregaticio|reclamatoria|verbas rescisorias|fgts|justa causa|trabalho`, consulta: 'advogado de rescisão trabalhista' },
  { matriz: 'Empresarial', subarea: 'Assessoria e contratos empresariais', rx: R`empresarial|assessoria empresarial|contrato|societario|compliance|empresa|empresas|cnpj`, generic: true, consulta: 'advogado de contratos empresariais' },
  { matriz: 'Empresarial', subarea: 'Recuperação judicial e falência', rx: R`recuperacao judicial|falencia|insolvencia`, consulta: 'advogado de recuperação judicial' },
  { matriz: 'Tributário', subarea: 'Planejamento e defesa tributária', rx: R`tributario|imposto|icms|execucao fiscal|cda`, consulta: 'advogado de defesa tributária' },
  { matriz: 'Família e Sucessões', subarea: 'Divórcio, guarda e pensão alimentícia', rx: R`divorcio|pensao alimenticia|guarda|uniao estavel|alimentos`, consulta: 'advogado de divórcio e pensão alimentícia' },
  { matriz: 'Família e Sucessões', subarea: 'Inventário e testamento', rx: R`inventario|testamento|heranca|sucessoes`, consulta: 'advogado de inventário' },
  { matriz: 'Imobiliário', subarea: 'Usucapião, locação e despejo', rx: R`usucapiao|despejo|locacao|imovel|imoveis|condominio|condominial|escritura`, consulta: 'advogado de usucapião' },
  { matriz: 'Notícias e conteúdo jurídico', subarea: 'Notícias jurídicas', rx: R`noticia|direitosnews|direitonews|jurisprudencia|stf|stj`, consulta: null },
];

// Correlações curadas (CORREL do analisar.py), uma aresta por destino. "to" que não é área matriz vira nicho da área de origem.
// Os destinos "(transversal ...)" do original não viram aresta: são as áreas `transversal`.
const ADV_CORREL: PackCorrel[] = [
  { from: 'Criminal', to: 'Trânsito e CNH', note: 'crimes de trânsito, embriaguez' },
  { from: 'Criminal', to: 'Empresarial', note: 'crimes econômicos, compliance' },
  { from: 'Criminal', to: 'Tributário', note: 'crimes tributários' },
  { from: 'Criminal', to: 'Família e Sucessões', note: 'violência doméstica, medidas protetivas' },
  { from: 'Criminal', to: 'Consumidor', note: 'golpes e estelionato' },
  { from: 'Criminal', to: 'Bancário e Financiamentos', note: 'golpes e estelionato' },
  { from: 'Trânsito e CNH', to: 'Criminal', note: 'crimes de trânsito' },
  { from: 'Trânsito e CNH', to: 'Consumidor', note: 'seguros e danos' },
  { from: 'Trânsito e CNH', to: 'Trabalhista', note: 'motoristas profissionais' },
  { from: 'Previdenciário (INSS)', to: 'Saúde e Planos', note: 'incapacidade, laudos' },
  { from: 'Previdenciário (INSS)', to: 'Trabalhista', note: 'acidente de trabalho, vínculo' },
  { from: 'Previdenciário (INSS)', to: 'Família e Sucessões', note: 'pensão por morte' },
  { from: 'Bancário e Financiamentos', to: 'Consumidor', note: 'cobrança, negativação' },
  { from: 'Bancário e Financiamentos', to: 'Empresarial', note: 'crédito, renegociação de dívida' },
  { from: 'Bancário e Financiamentos', to: 'Imobiliário', note: 'financiamento de imóvel' },
  { from: 'Consumidor', to: 'Bancário e Financiamentos' },
  { from: 'Consumidor', to: 'Telecom e Provedores' },
  { from: 'Consumidor', to: 'Saúde e Planos' },
  { from: 'Consumidor', to: 'Transporte aéreo' },
  { from: 'Telecom e Provedores', to: 'Empresarial', note: 'regulação, contratos' },
  { from: 'Telecom e Provedores', to: 'Consumidor', note: 'cobrança, qualidade' },
  { from: 'Telecom e Provedores', to: 'Tributário', note: 'tributos do setor' },
  { from: 'Empresarial', to: 'Tributário' },
  { from: 'Empresarial', to: 'Trabalhista', note: 'passivo' },
  { from: 'Empresarial', to: 'Criminal', note: 'crimes econômicos' },
  { from: 'Empresarial', to: 'Telecom e Provedores' },
  { from: 'Empresarial', to: 'Imobiliário', note: 'contratos' },
  { from: 'Trabalhista', to: 'Previdenciário (INSS)' },
  { from: 'Trabalhista', to: 'Empresarial', note: 'assessoria preventiva' },
  { from: 'Saúde e Planos', to: 'Consumidor' },
  { from: 'Saúde e Planos', to: 'Previdenciário (INSS)' },
  { from: 'Família e Sucessões', to: 'Imobiliário', note: 'partilha' },
  { from: 'Família e Sucessões', to: 'Criminal', note: 'violência doméstica' },
  { from: 'Família e Sucessões', to: 'Tributário', note: 'ITCMD' },
  { from: 'Imobiliário', to: 'Família e Sucessões' },
  { from: 'Imobiliário', to: 'Bancário e Financiamentos', note: 'financiamento' },
  { from: 'Imobiliário', to: 'Empresarial', note: 'locação comercial' },
  { from: 'Tributário', to: 'Empresarial' },
  { from: 'Tributário', to: 'Criminal', note: 'crimes tributários' },
  { from: 'Eleitoral e Político', to: 'Criminal', note: 'crimes eleitorais' },
  { from: 'Eleitoral e Político', to: 'Administrativo', note: 'improbidade' },
];

export const PACK_ADVOCACIA: SegmentPack = {
  id: 'advocacia', label: 'Advocacia', status: 'validado',
  description: 'Escritórios de advocacia: 13 áreas de atuação e 2 áreas transversais (peças e notícias), com subáreas e correlações validadas na varredura da RDM Advogados (20/11/2026).',
  matrizes: ADV_MATRIZES, rules: ADV_RULES, correl: ADV_CORREL,
  noiseHosts: ['jusbrasil.com.br', 'escavador.com', 'jus.com.br', 'migalhas.com.br', 'conjur.com.br', 'oab.org.br', 'advogados.com.br', 'jusdecisao.com.br', 'tjsp.jus.br', 'conjur.com'],
};

const draft = (id: string, label: string, description: string, matrizes: PackMatriz[], rules: PackRule[]): SegmentPack => ({ id, label, status: 'rascunho', description, matrizes, rules, correl: [], noiseHosts: [] });

export const PACK_SAUDE_ESTETICA = draft('saude_estetica', 'Saúde e estética (rascunho de exemplo)', 'Exemplo de estrutura. NÃO validado: serve para mostrar o formato; revise antes de usar.',
  [{ label: 'Estética facial', consulta: 'clínica de estética facial' }, { label: 'Estética corporal', consulta: 'clínica de estética corporal' }],
  [{ matriz: 'Estética facial', subarea: 'Harmonização e preenchimento', rx: R`harmonizacao|preenchimento|botox|toxina botulinica`, consulta: 'harmonização facial' }, { matriz: 'Estética corporal', subarea: 'Redução de medidas', rx: R`criolipolise|lipo|reducao de medidas|gordura localizada`, consulta: 'redução de medidas' }]);
export const PACK_VAREJO_LOCAL = draft('varejo_local', 'Varejo local (rascunho de exemplo)', 'Exemplo de estrutura. NÃO validado: serve para mostrar o formato; revise antes de usar.',
  [{ label: 'Produtos', consulta: 'loja' }], [{ matriz: 'Produtos', subarea: 'Catálogo e promoções', rx: R`promocao|oferta|catalogo|loja`, consulta: 'loja de promoções' }]);
export const PACK_EDUCACAO = draft('educacao', 'Educação (rascunho de exemplo)', 'Exemplo de estrutura. NÃO validado: serve para mostrar o formato; revise antes de usar.',
  [{ label: 'Cursos', consulta: 'curso' }], [{ matriz: 'Cursos', subarea: 'Cursos livres e técnicos', rx: R`curso|tecnico|capacitacao|formacao`, consulta: 'curso técnico' }]);
export const PACK_POLITICA = draft('politica', 'Política e campanha (rascunho de exemplo)', 'Exemplo de estrutura. NÃO validado: serve para mostrar o formato; revise antes de usar.',
  [{ label: 'Mandato e propostas', consulta: 'vereador' }], [{ matriz: 'Mandato e propostas', subarea: 'Propostas e agenda', rx: R`proposta|agenda|mandato|projeto de lei`, consulta: 'projeto de lei' }]);

export const SEGMENT_PACKS: SegmentPack[] = [PACK_ADVOCACIA, PACK_SAUDE_ESTETICA, PACK_VAREJO_LOCAL, PACK_EDUCACAO, PACK_POLITICA];
export const getPack = (id: unknown): SegmentPack | null => SEGMENT_PACKS.find((p) => p.id === id) ?? null;
