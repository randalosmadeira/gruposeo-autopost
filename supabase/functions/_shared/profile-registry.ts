/**
 * Registro único dos campos do Perfil do Projeto (marco P2).
 *
 * É a FONTE ÚNICA de três coisas: o formulário do front (rótulo, tipo, opções, ajuda), a validação do servidor
 * (função de borda nexus-business) e, no marco P3, o contrato do agente (o que ele pode extrair).
 * Sem imports de Deno nem de React: roda no navegador, no Deno e no vitest.
 *
 * Onde cada campo mora (campo `store`):
 *  - strategy: projects.nexus_strategy. São as 36 chaves que já existem em produção; nenhuma muda de nome nem de sentido
 *    (travadas por src/test/perfil-contrato-campos-atuais.test.ts). Todo valor é TEXTO; seleção múltipla vira texto separado por vírgula.
 *  - section: project_profile_extended.sections[etapa][chave]. Valor nativo (texto, lista, número).
 *  - finance / goals: project_profile_private (só dono e administrador leem e gravam).
 */

export type FieldType = 'text' | 'textarea' | 'single' | 'multi' | 'money' | 'number' | 'percent' | 'color';
export type FieldStore = 'strategy' | 'section' | 'finance' | 'goals';
export type StepId = 'conversa' | 'negocio' | 'marca' | 'ofertas' | 'publico' | 'presenca' | 'marketing' | 'vendas' | 'modulos' | 'analise' | 'caminho';
export type FieldValue = string | string[] | number | null;
export type FieldOption = string | { value: string; label: string };

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  store: FieldStore;
  step: StepId;
  group?: string;
  options?: FieldOption[];
  /** multi: aceita itens fora da lista (ex.: idiomas que o projeto já tem em texto livre). */
  allowOther?: boolean;
  placeholder?: string;
  hint?: string;
  /** explicação fixa do termo, mostrada em "Não sei o que é" e no botão de ajuda (nunca vem de IA). */
  gloss?: [string, string];
  /** valor sugerido: aparece como botão marcado "sugestão", nunca é gravado sozinho. */
  suggest?: string | string[] | number;
  /** só aparece quando a condição for verdadeira (ex.: venda online). */
  showIf?: { key: string; notIn: string[] };
  /** campo mantido só por compatibilidade: não aparece no formulário (é derivado de outro). */
  hidden?: boolean;
  max?: number;
}

export interface StepDef {
  id: StepId;
  name: string;
  intro: string;
}

export const UNKNOWN_LABELS = ['Não sei o que é', 'Não sei', 'Não sei onde está', 'Não sei qual escolher', 'Não sei se está'];

const K4 = ['Nunca fiz', 'Já fiz sozinho', 'Agência ou terceiro faz', 'Não sei o que é'];
const K3 = K4.slice(0, 3);
export const SEGMENTS = ['Advocacia', 'Medicina', 'Odontologia', 'Psicologia', 'Contabilidade', 'Imobiliária', 'Estética e beleza', 'Marketing e agência', 'Mídia e notícias', 'Política e eleições', 'Educação', 'Varejo e e-commerce', 'Outro'];
export const COUNCIL: Record<string, [string, string]> = {
  Advocacia: ['OAB', 'Regras de publicidade da advocacia (Provimento 205/2021): sem promessa de resultado, sem captação direta.'],
  Medicina: ['CFM', 'Regras de publicidade médica: sem garantia de resultado e com limites para imagens de antes e depois.'],
  Odontologia: ['CRO', 'Regras de publicidade odontológica do conselho.'],
  Psicologia: ['CRP', 'Regras de publicidade em psicologia do conselho.'],
  Contabilidade: ['CRC', 'Regras de publicidade contábil do conselho.'],
  Imobiliária: ['CRECI', 'Regras de publicidade imobiliária: número de inscrição visível.'],
  'Política e eleições': ['Justiça Eleitoral', 'Regras de propaganda eleitoral do TSE, que só valem em período eleitoral.'],
};

export const PROFILE_STEPS: StepDef[] = [
  { id: 'conversa', name: 'Conversa', intro: 'Conte quanto você conhece de marketing. A conversa com a Zica (texto e voz) chega no próximo marco; por enquanto preencha as etapas do seu jeito, na ordem que preferir.' },
  { id: 'negocio', name: 'Negócio e documentos', intro: 'Quem é a empresa, em que momento ela está e onde quer chegar. Os números financeiros ficam só com dono e administrador da organização e nunca aparecem em texto público.' },
  { id: 'marca', name: 'Marca e identidade', intro: 'O conceito vem antes do desenho: o que a marca promete, o que transmite e o que jamais pode transmitir.' },
  { id: 'ofertas', name: 'Ofertas e metas', intro: 'O mix de ofertas define a estratégia: o que gira caixa rápido, o que dá margem e o que sustenta o crescimento. As metas ficam só com dono e administrador.' },
  { id: 'publico', name: 'Público e voz', intro: 'Para quem falar, como falar e onde. Daqui saem as perguntas que o sistema fará às IAs, em qualquer país e idioma, sem limite fixo.' },
  { id: 'presenca', name: 'Presença online', intro: 'O que já existe online. Onde algo não existir, vira oportunidade, não erro. "Não sei o que é" é uma resposta válida.' },
  { id: 'marketing', name: 'Marketing e anúncios', intro: 'Marketing sem mistério. Se uma palavra for nova, marque "Não sei o que é" e leia a explicação.' },
  { id: 'vendas', name: 'Vendas e atendimento', intro: 'Como a venda acontece e como cada contato é atendido. Se a empresa vende online, perguntamos também do pagamento e das integrações.' },
  { id: 'modulos', name: 'Módulos', intro: 'Cada projeto liga só o que tem finalidade. Nada é apagado ao desligar um módulo.' },
  { id: 'analise', name: 'Pente fino', intro: 'A verificação pública sem custo já funciona. A análise completa (CNPJ, Google, IAs) chega em um marco próprio.' },
  { id: 'caminho', name: 'Caminho', intro: 'A pontuação vem só das suas respostas: onde não houve resposta aparece "sem dados" em vez de um número inventado.' },
];

const f = (def: FieldDef): FieldDef => def;

export const PROFILE_FIELDS_V2: FieldDef[] = [
  // ---------------------------------------------------------------- conversa
  f({ key: 'lvl', label: 'Quanto você conhece de marketing digital?', type: 'single', store: 'section', step: 'conversa', options: ['Estou começando do zero', 'Sei o básico', 'Já faço campanhas', 'Sou da área'] }),

  // ---------------------------------------------------------------- negócio
  f({ key: 'businessName', label: 'Nome da empresa ou do profissional', type: 'text', store: 'strategy', step: 'negocio', placeholder: 'Como a marca se apresenta' }),
  f({ key: 'entityType', label: 'Tipo', type: 'single', store: 'strategy', step: 'negocio', options: [{ value: 'company', label: 'Empresa' }, { value: 'brand', label: 'Marca' }, { value: 'product', label: 'Produto' }, { value: 'portal', label: 'Portal' }, { value: 'site', label: 'Site' }, { value: 'campaign', label: 'Campanha' }] }),
  f({ key: 'parent', label: 'Empresa responsável', type: 'text', store: 'strategy', step: 'negocio' }),
  f({ key: 'seg', label: 'Segmento', type: 'single', store: 'section', step: 'negocio', options: SEGMENTS, hint: 'O conselho de classe do segmento entra depois do perfil, só neste projeto.' }),
  f({ key: 'sector', label: 'Nicho e subárea', type: 'text', store: 'strategy', step: 'negocio', placeholder: 'Ex.: direito criminal, estética facial' }),
  f({ key: 'offer', label: 'O que a empresa faz, em uma frase', type: 'textarea', store: 'strategy', step: 'negocio', placeholder: 'O que vende, para quem e qual o diferencial' }),
  f({ key: 'fase', label: 'Momento atual', type: 'single', store: 'section', step: 'negocio', options: ['Começando', 'Operando e estável', 'Crescendo', 'Reestruturando'], suggest: 'Crescendo' }),
  f({ key: 'primaryGoal', label: 'Objetivo principal agora', type: 'single', store: 'strategy', step: 'negocio', options: [{ value: 'unknown', label: 'A confirmar' }, { value: 'leads', label: 'Leads qualificados' }, { value: 'sales', label: 'Vendas e contratação' }, { value: 'appointment', label: 'Agendamentos' }, { value: 'brand', label: 'Marca' }, { value: 'authority', label: 'Autoridade' }, { value: 'information', label: 'Informação e orientação' }, { value: 'retention', label: 'Retenção' }] }),
  f({ key: 'visao12', label: 'Onde quer chegar em 12 meses', type: 'textarea', store: 'section', step: 'negocio', placeholder: 'Em palavras suas.' }),
  f({ key: 'cnpjstat', label: 'Situação do CNPJ', type: 'single', store: 'section', step: 'negocio', group: 'Documentos e endereços', options: ['Tenho CNPJ', 'Sou MEI', 'Ainda não tenho CNPJ', 'Não sei o que é'], gloss: ['CNPJ', 'O CNPJ é o "CPF da empresa". É ele que permite emitir nota, abrir conta PJ, ter perfil verificado no Google e contratar com mais segurança. O MEI é a forma mais simples de ter um.'] }),
  f({ key: 'cnpj', label: 'CNPJ (se tiver)', type: 'text', store: 'section', step: 'negocio', group: 'Documentos e endereços', placeholder: '00.000.000/0000-00', max: 18 }),
  f({ key: 'endereco', label: 'Endereços exatos (um por linha)', type: 'textarea', store: 'section', step: 'negocio', group: 'Documentos e endereços', placeholder: 'Rua, número, complemento, bairro, cidade, CEP' }),
  f({ key: 'capital', label: 'Capital disponível para investir (R$)', type: 'money', store: 'finance', step: 'negocio', group: 'Números do negócio (privados)' }),
  f({ key: 'fat', label: 'Faturamento mensal médio (R$)', type: 'money', store: 'finance', step: 'negocio', group: 'Números do negócio (privados)' }),
  f({ key: 'lucro', label: 'Lucro mensal médio (R$)', type: 'money', store: 'finance', step: 'negocio', group: 'Números do negócio (privados)' }),
  f({ key: 'caixa', label: 'Caixa mensal: entra menos sai (R$)', type: 'money', store: 'finance', step: 'negocio', group: 'Números do negócio (privados)' }),
  f({ key: 'func', label: 'Funcionários', type: 'number', store: 'finance', step: 'negocio', group: 'Números do negócio (privados)' }),
  f({ key: 'anos', label: 'Anos de mercado', type: 'number', store: 'finance', step: 'negocio', group: 'Números do negócio (privados)' }),

  // ---------------------------------------------------------------- marca
  f({ key: 'conceito', label: 'Conceito da marca: por que ela existe e o que promete', type: 'textarea', store: 'section', step: 'marca', placeholder: 'Em palavras suas' }),
  f({ key: 'transmite', label: 'O que a marca transmite', type: 'multi', store: 'section', step: 'marca', options: ['Confiança', 'Acolhimento', 'Autoridade', 'Modernidade', 'Luxo', 'Proximidade', 'Rapidez', 'Tradição', 'Ousadia'] }),
  f({ key: 'naotransmite', label: 'O que a marca NÃO pode transmitir', type: 'multi', store: 'section', step: 'marca', options: ['Agressividade', 'Desespero', 'Preço baixo demais', 'Frieza', 'Arrogância', 'Bagunça'] }),
  f({ key: 'voice', label: 'Tom, posicionamento e diferenciais', type: 'textarea', store: 'strategy', step: 'marca' }),
  f({ key: 'proof', label: 'Fontes e provas autorizadas', type: 'textarea', store: 'strategy', step: 'marca', hint: 'Depoimentos, números e credenciais que a marca pode citar.' }),
  f({ key: 'logo', label: 'Logomarca', type: 'single', store: 'section', step: 'marca', options: ['Tenho e guardo o arquivo', 'Só tenho imagem de baixa qualidade', 'Não tenho', 'Não sei o que é'], gloss: ['logomarca', 'A logomarca é o desenho da sua marca: símbolo e/ou letras, a "assinatura visual" da empresa. Ela precisa existir em arquivo de boa qualidade, de preferência vetorial, para servir em site, redes, cartão e anúncio.'] }),
  f({ key: 'manual', label: 'Manual da marca', type: 'single', store: 'section', step: 'marca', options: ['Tenho (PDF)', 'Tenho só as cores e fontes', 'Não tenho', 'Não sei o que é'], gloss: ['manual da marca', 'O manual da marca é um documento curto que diz como usar a logo, quais cores e fontes e qual o tom de voz. É o que mantém tudo com a mesma cara em qualquer lugar.'] }),
  f({ key: 'registro', label: 'Registro da marca (INPI)', type: 'single', store: 'section', step: 'marca', options: ['Marca registrada no INPI', 'Pedido em andamento', 'Não registrei', 'Não sei o que é'], gloss: ['registro de marca', 'O registro é feito no INPI e protege o nome e o símbolo da sua marca no seu ramo, para ninguém usar igual. Sem ele, outra empresa pode registrar antes de você. Patente é outra coisa: protege invenções.'] }),
  f({ key: 'c1', label: 'Cor primária', type: 'color', store: 'section', step: 'marca', group: 'Paleta de cores' }),
  f({ key: 'c2', label: 'Cor secundária', type: 'color', store: 'section', step: 'marca', group: 'Paleta de cores' }),
  f({ key: 'c3', label: 'Cor de fundo', type: 'color', store: 'section', step: 'marca', group: 'Paleta de cores' }),
  f({ key: 'c4', label: 'Cor de destaque', type: 'color', store: 'section', step: 'marca', group: 'Paleta de cores' }),
  f({ key: 'c5', label: 'Cor do texto', type: 'color', store: 'section', step: 'marca', group: 'Paleta de cores' }),
  f({ key: 'fontes', label: 'Fontes da marca', type: 'text', store: 'section', step: 'marca', placeholder: 'Ex.: título e texto' }),
  f({ key: 'estilo', label: 'Estilo visual', type: 'multi', store: 'section', step: 'marca', options: ['Sóbrio', 'Moderno', 'Luxo', 'Popular', 'Minimalista', 'Vibrante'], suggest: ['Sóbrio', 'Moderno'] }),
  f({ key: 'refs', label: 'Marcas ou sites que você admira (uma URL por linha)', type: 'textarea', store: 'section', step: 'marca', placeholder: 'https://...' }),

  // ---------------------------------------------------------------- ofertas e metas
  f({ key: 'low_o', label: 'Low ticket: oferta', type: 'text', store: 'section', step: 'ofertas', group: 'Low ticket: entra rápido e ajuda a girar caixa', placeholder: 'Nome do produto ou serviço' }),
  f({ key: 'low_p', label: 'Low ticket: preço (R$)', type: 'money', store: 'section', step: 'ofertas', group: 'Low ticket: entra rápido e ajuda a girar caixa' }),
  f({ key: 'low_pct', label: 'Low ticket: parte da receita (%)', type: 'percent', store: 'section', step: 'ofertas', group: 'Low ticket: entra rápido e ajuda a girar caixa', suggest: 40 }),
  f({ key: 'high_o', label: 'High ticket: oferta', type: 'text', store: 'section', step: 'ofertas', group: 'High ticket: poucas vendas, alto valor', placeholder: 'Nome do produto ou serviço' }),
  f({ key: 'high_p', label: 'High ticket: preço (R$)', type: 'money', store: 'section', step: 'ofertas', group: 'High ticket: poucas vendas, alto valor' }),
  f({ key: 'high_pct', label: 'High ticket: parte da receita (%)', type: 'percent', store: 'section', step: 'ofertas', group: 'High ticket: poucas vendas, alto valor', suggest: 40 }),
  f({ key: 'giro_o', label: 'Giro rápido: oferta', type: 'text', store: 'section', step: 'ofertas', group: 'Giro rápido: volume e rotatividade', placeholder: 'Nome do produto ou serviço' }),
  f({ key: 'giro_p', label: 'Giro rápido: preço (R$)', type: 'money', store: 'section', step: 'ofertas', group: 'Giro rápido: volume e rotatividade' }),
  f({ key: 'giro_pct', label: 'Giro rápido: parte da receita (%)', type: 'percent', store: 'section', step: 'ofertas', group: 'Giro rápido: volume e rotatividade', suggest: 20 }),
  f({ key: 'ticket', label: 'Resumo do ticket', type: 'single', store: 'strategy', step: 'ofertas', group: 'Resumo comercial', options: [{ value: 'unknown', label: 'A confirmar' }, { value: 'high', label: 'High ticket' }, { value: 'low', label: 'Low ticket' }, { value: 'mixed', label: 'Misto' }] }),
  f({ key: 'ticket_medio', label: 'Ticket médio atual (R$)', type: 'money', store: 'section', step: 'ofertas', group: 'Resumo comercial', hint: 'Sem esse número, o sistema calcula a partir do que você informou acima.' }),
  f({ key: 'price', label: 'Faixa de preço e moeda', type: 'text', store: 'strategy', step: 'ofertas', group: 'Resumo comercial' }),
  f({ key: 'ciclo', label: 'Ciclo de venda', type: 'single', store: 'section', step: 'ofertas', group: 'Resumo comercial', options: ['Imediato (no mesmo dia)', 'Curto (até 1 semana)', 'Médio (1 a 4 semanas)', 'Longo (mais de 1 mês)'], suggest: 'Médio (1 a 4 semanas)' }),
  f({ key: 'journeys', label: 'Jornada: descoberta, interesse, decisão e retenção; quais prioridades?', type: 'textarea', store: 'strategy', step: 'ofertas', group: 'Jornada e conversão' }),
  f({ key: 'cta', label: 'Ação desejada e URL de destino', type: 'text', store: 'strategy', step: 'ofertas', group: 'Jornada e conversão' }),
  f({ key: 'qualification', label: 'O que define um lead qualificado?', type: 'textarea', store: 'strategy', step: 'ofertas', group: 'Jornada e conversão' }),
  f({ key: 'm30', label: 'Meta de receita em 30 dias (R$)', type: 'money', store: 'goals', step: 'ofertas', group: 'Metas (privadas)' }),
  f({ key: 'm6', label: 'Meta de receita em 6 meses (R$)', type: 'money', store: 'goals', step: 'ofertas', group: 'Metas (privadas)' }),
  f({ key: 'm12', label: 'Meta de receita em 12 meses (R$)', type: 'money', store: 'goals', step: 'ofertas', group: 'Metas (privadas)' }),

  // ---------------------------------------------------------------- público e voz
  f({ key: 'tipo', label: 'Tipo de cliente', type: 'multi', store: 'section', step: 'publico', options: ['B2C', 'B2B', 'B2G'], hint: 'B2C vende para pessoas; B2B, para empresas; B2G, para governo.', suggest: ['B2C', 'B2B'] }),
  f({ key: 'model', label: 'Modelo comercial', type: 'single', store: 'strategy', step: 'publico', hidden: true, options: [{ value: 'unknown', label: 'A confirmar' }, { value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }, { value: 'mixed', label: 'B2B e B2C' }] }),
  f({ key: 'audience', label: 'Cliente ideal: quem é, onde vive, o que faz e o que precisa', type: 'textarea', store: 'strategy', step: 'publico' }),
  f({ key: 'dor', label: 'Principal dor ou desejo dele', type: 'textarea', store: 'section', step: 'publico', placeholder: 'O que o faz procurar a empresa' }),
  f({ key: 'objections', label: 'Objeções e critérios de decisão', type: 'textarea', store: 'strategy', step: 'publico' }),
  f({ key: 'tom', label: 'Como falar', type: 'multi', store: 'section', step: 'publico', options: ['Acolhedor', 'Técnico', 'Direto', 'Institucional', 'Descontraído', 'Autoridade'], suggest: ['Acolhedor', 'Autoridade'] }),
  f({ key: 'nunca', label: 'O que nunca dizer', type: 'textarea', store: 'section', step: 'publico', placeholder: 'Palavras, promessas e assuntos proibidos' }),
  f({ key: 'constraints', label: 'Restrições setoriais e de comunicação', type: 'textarea', store: 'strategy', step: 'publico' }),
  f({ key: 'reach', label: 'Abrangência', type: 'single', store: 'strategy', step: 'publico', group: 'Onde e em que idioma', options: [{ value: 'unknown', label: 'A confirmar' }, { value: 'neighborhood', label: 'Bairro' }, { value: 'city', label: 'Município' }, { value: 'macro', label: 'Macrorregião' }, { value: 'state', label: 'Estado' }, { value: 'states', label: 'Vários estados' }, { value: 'national', label: 'Brasil' }, { value: 'international', label: 'Internacional' }] }),
  f({ key: 'regions', label: 'Bairros, municípios, regiões, estados e países prioritários', type: 'textarea', store: 'strategy', step: 'publico', group: 'Onde e em que idioma' }),
  f({ key: 'limits', label: 'Limites de atendimento', type: 'textarea', store: 'strategy', step: 'publico', group: 'Onde e em que idioma' }),
  f({ key: 'language', label: 'Idiomas do público', type: 'multi', store: 'strategy', step: 'publico', group: 'Onde e em que idioma', options: ['Português', 'Inglês', 'Espanhol', 'Francês', 'Italiano', 'Alemão'], allowOther: true, suggest: ['Português'] }),
  f({ key: 'competitors', label: 'Concorrentes e referências, com URLs', type: 'textarea', store: 'strategy', step: 'publico', placeholder: 'Um por linha' }),

  // ---------------------------------------------------------------- presença online
  f({ key: 'sitestat', label: 'Site', type: 'single', store: 'section', step: 'presenca', group: 'Site e conteúdo', options: ['Tenho site', 'Em construção', 'Não tenho site', 'Não sei'] }),
  f({ key: 'sites', label: 'Sites e páginas principais (um por linha)', type: 'textarea', store: 'strategy', step: 'presenca', group: 'Site e conteúdo', placeholder: 'https://' }),
  f({ key: 'blog', label: 'URL do blog', type: 'text', store: 'strategy', step: 'presenca', group: 'Site e conteúdo' }),
  f({ key: 'hasArticles', label: 'Já tem artigos?', type: 'single', store: 'strategy', step: 'presenca', group: 'Site e conteúdo', options: [{ value: 'unknown', label: 'Não sei' }, { value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }] }),
  f({ key: 'sitemap', label: 'Tem uma lista de URLs (sitemap)?', type: 'single', store: 'strategy', step: 'presenca', group: 'Site e conteúdo', options: [{ value: 'unknown', label: 'Não sei' }, { value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }], hint: 'Sitemap é uma lista de endereços que ajuda a descobrir páginas.' }),
  f({ key: 'sitemapUrl', label: 'URL do sitemap, se souber', type: 'text', store: 'strategy', step: 'presenca', group: 'Site e conteúdo' }),
  f({ key: 'pages', label: 'Quantidade aproximada de páginas', type: 'text', store: 'strategy', step: 'presenca', group: 'Site e conteúdo', hint: 'Quantidade declarada e páginas verificadas são coisas diferentes.' }),
  f({ key: 'dominio', label: 'Domínio (o endereço, como minhaempresa.com.br)', type: 'single', store: 'section', step: 'presenca', group: 'Site e conteúdo', options: ['Tenho e está no meu nome', 'Está no nome de terceiro', 'Não tenho', 'Não sei o que é'], gloss: ['domínio', 'O domínio é o endereço do site, como minhaempresa.com.br. Ele precisa estar no SEU nome ou CNPJ. Se estiver no nome de um terceiro, é ele quem manda no seu endereço.'] }),
  f({ key: 'hospedagem', label: 'Hospedagem (onde o site mora)', type: 'single', store: 'section', step: 'presenca', group: 'Site e conteúdo', options: ['Sei onde está', 'Não sei onde está', 'Não sei o que é'], gloss: ['hospedagem', 'A hospedagem é o "terreno" onde o site mora: um servidor ligado 24 horas. Ela influencia velocidade e segurança. Quem não sabe onde está costuma estar com quem fez o site.'] }),
  f({ key: 'servidor', label: 'Servidor, CDN ou banco de dados (se souber)', type: 'text', store: 'section', step: 'presenca', group: 'Site e conteúdo', placeholder: 'Se não souber, deixe em branco.' }),
  f({ key: 'landings', label: 'Landing pages (uma URL por linha)', type: 'textarea', store: 'section', step: 'presenca', group: 'Site e conteúdo', placeholder: 'https://...' }),
  f({ key: 'redesstat', label: 'Redes sociais', type: 'single', store: 'section', step: 'presenca', group: 'Redes sociais', options: ['Tenho todas as que preciso', 'Tenho algumas', 'Não tenho nenhuma', 'Não sei qual escolher'] }),
  f({ key: 'instagram', label: 'Instagram', type: 'text', store: 'strategy', step: 'presenca', group: 'Redes sociais', placeholder: 'https://instagram.com/...' }),
  f({ key: 'facebook', label: 'Facebook', type: 'text', store: 'strategy', step: 'presenca', group: 'Redes sociais', placeholder: 'https://facebook.com/...' }),
  f({ key: 'linkedin', label: 'LinkedIn', type: 'text', store: 'strategy', step: 'presenca', group: 'Redes sociais', placeholder: 'https://linkedin.com/...' }),
  f({ key: 'x', label: 'X (Twitter)', type: 'text', store: 'section', step: 'presenca', group: 'Redes sociais', placeholder: 'https://x.com/...' }),
  f({ key: 'tiktok', label: 'TikTok', type: 'text', store: 'strategy', step: 'presenca', group: 'Redes sociais', placeholder: 'https://tiktok.com/@...' }),
  f({ key: 'youtube', label: 'YouTube', type: 'text', store: 'strategy', step: 'presenca', group: 'Redes sociais', placeholder: 'https://youtube.com/...' }),
  f({ key: 'kwai', label: 'Kwai', type: 'text', store: 'strategy', step: 'presenca', group: 'Redes sociais' }),
  f({ key: 'otherChannels', label: 'Outros canais', type: 'textarea', store: 'strategy', step: 'presenca', group: 'Redes sociais' }),
  f({ key: 'fbstat', label: 'Página da empresa no Facebook', type: 'single', store: 'section', step: 'presenca', group: 'Facebook', options: ['Tenho página e administro', 'Tenho página, mas sem acesso', 'Só perfil pessoal', 'Não tenho', 'Não sei o que é'], gloss: ['página do Facebook', 'A página é a vitrine oficial da empresa na rede, diferente do perfil pessoal. Ela é necessária para anunciar no Facebook e no Instagram, receber mensagens e avaliações e ter loja ou catálogo. Perfil pessoal não serve para empresa.'] }),
  f({ key: 'fbserv', label: 'Serviços do Facebook que usa ou quer usar', type: 'multi', store: 'section', step: 'presenca', group: 'Facebook', options: ['Mensagens (Messenger)', 'Avaliações', 'Loja ou catálogo', 'Marketplace do Facebook', 'Grupos', 'Eventos', 'Anúncios pela página'] }),
  f({ key: 'gbp', label: 'Google Meu Negócio', type: 'single', store: 'section', step: 'presenca', group: 'Google e mapas', options: ['Tenho e administro', 'Tenho, mas sem acesso', 'Não tenho', 'Não sei o que é'], gloss: ['Google Meu Negócio', 'É a ficha gratuita da empresa no Google e no Maps: endereço, horário, fotos, avaliações e botão de ligar. Para negócio local, é uma das vitrines mais importantes.'] }),
  f({ key: 'gbpurl', label: 'Link do perfil no Google', type: 'text', store: 'section', step: 'presenca', group: 'Google e mapas', placeholder: 'Link do Maps ou g.page/...' }),
  f({ key: 'filiais', label: 'Unidades ou filiais', type: 'single', store: 'section', step: 'presenca', group: 'Google e mapas', options: ['Nenhuma', '1 a 3', '4 a 10', 'Mais de 10'] }),
  f({ key: 'filiaisgbp', label: 'Filiais cadastradas no Google', type: 'single', store: 'section', step: 'presenca', group: 'Google e mapas', options: ['Todas', 'Algumas', 'Nenhuma', 'Não se aplica'] }),
  f({ key: 'mapas', label: 'Onde a empresa aparece em mapas', type: 'multi', store: 'section', step: 'presenca', group: 'Google e mapas', options: ['Google Maps', 'Waze', 'Apple Maps', 'Bing Places'] }),

  // ---------------------------------------------------------------- marketing e anúncios
  f({ key: 'agencia', label: 'Já trabalhou com agência de marketing ou publicidade?', type: 'single', store: 'section', step: 'marketing', group: 'Agências e experiências anteriores', options: ['Tenho agência hoje', 'Já tive e foi boa', 'Já tive e foi ruim', 'Nunca tive'] }),
  f({ key: 'agencia_fez', label: 'O que a agência fazia', type: 'multi', store: 'section', step: 'marketing', group: 'Agências e experiências anteriores', options: ['Anúncios pagos', 'Redes sociais', 'Site', 'Design e identidade visual', 'Relatórios', 'Não sei o que faziam'] }),
  f({ key: 'agencia_obs', label: 'O que funcionou e o que não funcionou', type: 'textarea', store: 'section', step: 'marketing', group: 'Agências e experiências anteriores' }),
  f({ key: 'dif_mkt_pub', label: 'Você sabe a diferença entre marketing e publicidade?', type: 'single', store: 'section', step: 'marketing', group: 'Agências e experiências anteriores', options: ['Sei a diferença', 'Confundo os dois', 'Não sei o que é'], gloss: ['marketing e publicidade', 'Marketing é o plano inteiro: entender quem compra, o que vender, por qual preço, onde vender e como chegar nele. Publicidade é uma parte desse plano: a divulgação, em geral paga, como anúncios e campanhas. O marketing decide o caminho; a publicidade é o megafone. Exemplo: decidir vender para quem mora perto, com entrega no mesmo dia, é marketing. Anunciar isso no Instagram é publicidade.'] }),
  f({ key: 'ads_google', label: 'Anúncios no Google (Google Ads)', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K4, gloss: ['Google Ads', 'São os anúncios que aparecem quando alguém pesquisa no Google. Serve para quem já está procurando o que você vende. Você define quanto quer gastar por dia.'] }),
  f({ key: 'ads_meta', label: 'Anúncios no Instagram e Facebook (Meta Ads)', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K4, gloss: ['Meta Ads', 'São anúncios no Instagram e no Facebook. Funcionam bem para despertar interesse e fazer a marca ser lembrada, com segmentação por perfil e comportamento.'] }),
  f({ key: 'org_ig', label: 'Instagram sem pagar (orgânico)', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K3 }),
  f({ key: 'org_fb', label: 'Facebook (página e grupos)', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K3 }),
  f({ key: 'org_li', label: 'LinkedIn', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K3 }),
  f({ key: 'org_tt', label: 'TikTok e Kwai', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K3 }),
  f({ key: 'org_yt', label: 'YouTube', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K3 }),
  f({ key: 'email_mkt', label: 'E-mail marketing', type: 'single', store: 'section', step: 'marketing', group: 'Canais e anúncios', options: K3 }),
  f({ key: 'metricas', label: 'Acompanha números (métricas)?', type: 'single', store: 'section', step: 'marketing', group: 'Medição e públicos', options: ['Acompanho toda semana', 'Olho de vez em quando', 'Não acompanho', 'Não sei o que é'], gloss: ['métricas', 'Métricas são os números que mostram se o marketing funciona: quantas pessoas viram, clicaram, chamaram e compraram, e quanto custou cada contato.'] }),
  f({ key: 'pixel', label: 'Pixel, GA4 e Tag Manager no site', type: 'single', store: 'section', step: 'marketing', group: 'Medição e públicos', options: ['Instalado', 'Não sei se está', 'Não tenho', 'Não sei o que é'], gloss: ['pixel, GA4 e Tag Manager', 'São "contadores" instalados no site. Eles contam visitas e ações (como o clique no WhatsApp) e permitem anunciar de novo para quem já visitou.'] }),
  f({ key: 'publicos', label: 'Públicos que já usa em anúncios', type: 'multi', store: 'section', step: 'marketing', group: 'Medição e públicos', options: ['Engajamento', 'Interesse', 'Retenção', 'Fundo de funil', 'Remarketing', 'Semelhantes', 'Não sei o que é'], gloss: ['públicos de anúncio', 'Engajamento: quem já interagiu com você. Interesse: quem gosta do assunto. Retenção: quem já é cliente e pode voltar. Fundo de funil: quem está pronto para comprar. Remarketing: quem visitou e não fechou.'] }),
  f({ key: 'orcamento', label: 'Orçamento mensal de mídia paga (R$)', type: 'money', store: 'finance', step: 'marketing', group: 'Medição e públicos' }),
  f({ key: 'outros', label: 'Outros pontos importantes que já existem', type: 'multi', store: 'section', step: 'marketing', group: 'Outros pontos', options: ['E-mail profissional', 'Política de privacidade (LGPD)', 'WhatsApp Business', 'Fotos e vídeos próprios', 'Quem aprova os conteúdos definido', 'Sazonalidade conhecida'] }),

  // ---------------------------------------------------------------- vendas e atendimento
  f({ key: 'vendeonline', label: 'Como a empresa vende?', type: 'single', store: 'section', step: 'vendas', options: ['Só vendo presencial', 'Vendo online', 'Vendo online e presencial', 'Ainda não vendo online, quero começar'] }),
  f({ key: 'canais_venda', label: 'Onde vende', type: 'multi', store: 'section', step: 'vendas', options: ['Loja ou site próprio', 'Mercado Livre', 'Shopee', 'Amazon', 'Instagram e WhatsApp', 'Marketplace do Facebook', 'Loja física', 'Representantes ou revendedores'] }),
  f({ key: 'pagamento', label: 'Como recebe os pagamentos online', type: 'single', store: 'section', step: 'vendas', group: 'Vendas online: pagamento e integrações', showIf: { key: 'vendeonline', notIn: ['Só vendo presencial'] }, options: ['Gateway ou provedor de pagamento', 'Só Pix ou transferência manual', 'Link de pagamento avulso', 'Ainda não recebo online', 'Não sei o que é'], gloss: ['gateway de pagamento', 'É o "caixa" da loja online: o serviço que recebe cartão, Pix e boleto com segurança e repassa o dinheiro para você. Provedor de pagamento é a empresa que oferece isso. Sem ele, a venda online fica manual, lenta e mais arriscada.'] }),
  f({ key: 'pagamento_qual', label: 'Qual provedor de pagamento usa? (se souber)', type: 'text', store: 'section', step: 'vendas', group: 'Vendas online: pagamento e integrações', showIf: { key: 'vendeonline', notIn: ['Só vendo presencial'] } }),
  f({ key: 'integracoes', label: 'Integração entre sistemas (loja, estoque, pagamento, nota fiscal)', type: 'single', store: 'section', step: 'vendas', group: 'Vendas online: pagamento e integrações', showIf: { key: 'vendeonline', notIn: ['Só vendo presencial'] }, options: ['Tudo integrado', 'Algumas integrações', 'Nada integrado, faço manual', 'Não sei o que é'], gloss: ['integração entre sistemas', 'É quando loja, estoque, pagamento, nota fiscal e atendimento conversam sozinhos, sem você copiar dados de um lugar para outro. Menos erro e menos tempo perdido.'] }),
  f({ key: 'integra_qual', label: 'Quais sistemas usa? (ERP, emissor de nota, loja)', type: 'text', store: 'section', step: 'vendas', group: 'Vendas online: pagamento e integrações', showIf: { key: 'vendeonline', notIn: ['Só vendo presencial'] } }),
  f({ key: 'logistica', label: 'Entrega', type: 'multi', store: 'section', step: 'vendas', group: 'Vendas online: pagamento e integrações', showIf: { key: 'vendeonline', notIn: ['Só vendo presencial'] }, options: ['Correios', 'Transportadora', 'Entrega própria', 'Retirada no local', 'Ainda não defini'] }),
  f({ key: 'leads', label: 'Quem responde os contatos que chegam', type: 'single', store: 'section', step: 'vendas', group: 'Atendimento e follow-up', options: ['Eu mesmo', 'Equipe comercial', 'Agência', 'Ninguém ainda'] }),
  f({ key: 'crm', label: 'Onde anota os clientes (CRM)', type: 'single', store: 'section', step: 'vendas', group: 'Atendimento e follow-up', options: ['Planilha', 'CRM', 'WhatsApp apenas', 'Nada', 'Não sei o que é'], gloss: ['CRM', 'CRM é o caderno inteligente dos clientes: guarda quem é, de onde veio, o que já comprou e quando falar com ele de novo. Pode ser uma ferramenta simples.'] }),
  f({ key: 'followup', label: 'Follow-up: voltar a falar com quem não comprou', type: 'single', store: 'section', step: 'vendas', group: 'Atendimento e follow-up', options: ['Tenho rotina fixa', 'Faço quando lembro', 'Não faço', 'Não sei o que é'], gloss: ['follow-up', 'É o retorno que você dá depois do primeiro contato: lembrar a pessoa, tirar dúvida, mandar a proposta de novo. Muitas vendas só fecham depois de mais de um contato.'] }),
  f({ key: 'kanban', label: 'Funil ou quadro Kanban dos clientes', type: 'single', store: 'section', step: 'vendas', group: 'Atendimento e follow-up', options: ['Uso funil ou Kanban', 'Uso planilha', 'Não uso', 'Não sei o que é'], gloss: ['Kanban', 'É um quadro com colunas (por exemplo: novo contato, conversando, proposta, fechado) onde cada cliente é um cartão que anda de coluna em coluna. Você vê de uma vez quem está parado e quem precisa de retorno.'] }),
  f({ key: 'reputacao', label: 'Reputação que já existe', type: 'multi', store: 'section', step: 'vendas', group: 'Reputação', options: ['Avaliações no Google', 'Reclame Aqui', 'Depoimentos autorizados', 'Imprensa e menções', 'Nada ainda'] }),

  // ---------------------------------------------------------------- caminho
  f({ key: 'unknown', label: 'Informações ainda desconhecidas', type: 'textarea', store: 'strategy', step: 'caminho', hint: 'Anote o que você ainda não sabe responder.' }),
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(PROFILE_FIELDS_V2.map((d) => [d.key, d]));

export function fieldsOfStep(step: StepId): FieldDef[] {
  return PROFILE_FIELDS_V2.filter((d) => d.step === step && !d.hidden);
}

export function optionList(field: FieldDef): Array<{ value: string; label: string }> {
  return (field.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

export function isPrivateStore(store: FieldStore): boolean {
  return store === 'finance' || store === 'goals';
}

/** Campo visível, dado o conjunto de valores atuais. */
export function isVisible(field: FieldDef, values: Record<string, FieldValue | undefined>): boolean {
  if (field.hidden) return false;
  if (!field.showIf) return true;
  const current = values[field.showIf.key];
  if (typeof current !== 'string' || !current) return true;
  return !field.showIf.notIn.includes(current);
}
