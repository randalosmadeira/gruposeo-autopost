import type {
  Ga4SyncResult, HealthCheckResult, NexusViewer, OverallStatus, ProviderCategory, ProviderId, ProviderOverviewItem, ProviderProgram, ProviderStatus,
  ProvidersOverview, ProvidersSummary, RawProviderOverviewItem, SearchSyncResponse, SimpleProviderStatus,
} from '@/types/nexus-providers';

// ---------------------------------------------------------------------------
// Catálogo tipado dos provedores (fonte: docs/NEXUS_PROVIDERS_CONTRACT.md, verificado em 12/11/2026).
// Valores de custo são de referência. Nada aqui promete resultado de visibilidade, posição ou tráfego.
// ---------------------------------------------------------------------------

export const REFERENCE_NOTICE = 'Valores de referência — confirmar no site do provedor.';
export const BRAVE_NOTICE = 'O plano gratuito fixo da Brave acabou (2026): a cobrança agora é por crédito (cerca de US$ 5 por mil requisições, com crédito mensal incluído). Confirme valores e créditos no site da Brave antes de usar.';
export const CONFIRM_WORD = 'LIBERAR';
export const MAX_BUDGET_USD = 200;
export const MAX_SECRET_LENGTH = 4096;

export type CredentialKind = 'api_key' | 'service_account_json' | 'login_password' | 'none';

export interface ProviderEndpoint { label: string; method: 'GET' | 'POST'; url: string; note?: string }
export interface ProviderDoc {
  steps: string[];
  keyLocation: string;
  credentialFormat: string;
  endpoints: ProviderEndpoint[];
  params: string;
  limits: string;
  commonErrors: { symptom: string; fix: string }[];
  zicaUsage: string;
  warnings?: string[];
}

export interface ProviderCatalogEntry {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  credentialKind: CredentialKind;
  credentialLabel: string;
  /** Exemplo de formato SEM valor real (nunca colocar chave de verdade aqui). */
  credentialExample: string;
  formatHint: string;
  /** Link "Contratar". */
  contractUrl: string;
  docsUrl: string;
  /** Link "Onde encontro minha chave?". */
  keyUrl: string;
  extraLinks: { label: string; url: string }[];
  costLabel: string;
  /** Aviso destacado de custo (ex.: Brave). */
  costWarning?: string;
  /** `null` = teste gratuito ou inexistente; objeto = o teste consome 1 consulta. */
  testCost: { approxUsdMicros: number } | null;
  hasTest: boolean;
  doc: ProviderDoc;
}

const GSC: ProviderCatalogEntry = {
  id: 'gsc', name: 'Google Search Console API', category: 'search_truth', credentialKind: 'service_account_json',
  credentialLabel: 'JSON da conta de serviço', credentialExample: '{ "type": "service_account", "client_email": "…", "private_key": "-----BEGIN PRIVATE KEY-----…" }',
  formatHint: 'Cole o JSON completo da conta de serviço (type "service_account", com client_email e private_key).',
  contractUrl: 'https://search.google.com/search-console',
  docsUrl: 'https://developers.google.com/webmaster-tools/v1/searchanalytics/query',
  keyUrl: 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com',
  extraLinks: [{ label: 'Ativar a API do Search Console', url: 'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com' }],
  costLabel: 'Grátis.', testCost: null, hasTest: true,
  doc: {
    steps: [
      'No Google Cloud, crie (ou escolha) um projeto e ative a API do Google Search Console.',
      'Crie uma conta de serviço e gere uma chave no formato JSON. Guarde o arquivo em local seguro.',
      'No Search Console, abra Configurações → Usuários e permissões e adicione o e-mail da conta de serviço (campo client_email do JSON) com permissão de leitura.',
      'No Zica.ai, clique em Conectar e cole o conteúdo completo do JSON. O teste gratuito roda em seguida.',
      'Clique em Sincronizar agora para trazer cliques, impressões, consultas e páginas reais.',
    ],
    keyLocation: 'Google Cloud → IAM e administrador → Contas de serviço → Chaves → Adicionar chave → JSON.',
    credentialFormat: 'JSON com "type": "service_account", "client_email" e "private_key" iniciando em -----BEGIN PRIVATE KEY-----. Tamanho máximo de 4096 caracteres.',
    endpoints: [
      { label: 'Troca do token (teste de saúde)', method: 'POST', url: 'https://oauth2.googleapis.com/token', note: 'JWT assinado com a chave da conta de serviço.' },
      { label: 'Lista de propriedades (teste de saúde)', method: 'GET', url: 'https://www.googleapis.com/webmasters/v3/sites' },
      { label: 'Dados de desempenho (sincronização)', method: 'POST', url: 'https://www.googleapis.com/webmasters/v3/sites/{propriedade}/searchAnalytics/query', note: 'Dimensões: data, consulta, página, país e dispositivo.' },
    ],
    params: 'País e dispositivo vêm nativos nos dados. A propriedade usada é a do projeto (padrão sc-domain:<domínio sem www>).',
    limits: 'Uso gratuito, sujeito às cotas da API do Google.',
    commonErrors: [
      { symptom: 'Acesso negado (gsc_forbidden)', fix: 'A conta de serviço ainda não foi adicionada como usuário da propriedade no Search Console.' },
      { symptom: 'Formato inválido', fix: 'Cole o JSON inteiro, sem remover chaves nem quebras de linha da private_key.' },
      { symptom: 'API não ativada', fix: 'Ative a API do Google Search Console no projeto do Google Cloud da conta de serviço.' },
    ],
    zicaUsage: 'Traz dados reais de busca do Google (cliques, impressões, posição) para a aba Tráfego orgânico. Só leitura.',
  },
};

const BING: ProviderCatalogEntry = {
  id: 'bing_webmaster', name: 'Bing Webmaster Tools API', category: 'search_truth', credentialKind: 'api_key',
  credentialLabel: 'Chave de API', credentialExample: '32 caracteres entre letras e números',
  formatHint: 'De 16 a 200 caracteres: letras, números, "_" e "-".',
  contractUrl: 'https://www.bing.com/webmasters',
  docsUrl: 'https://learn.microsoft.com/en-us/bingwebmaster/getting-access',
  keyUrl: 'https://learn.microsoft.com/en-us/bingwebmaster/getting-access',
  extraLinks: [],
  costLabel: 'Grátis.', testCost: null, hasTest: true,
  doc: {
    steps: [
      'Entre no Bing Webmaster Tools e adicione/verifique o site (ou importe do Search Console).',
      'Abra Configurações → Acesso à API e gere a chave de API.',
      'No Zica.ai, clique em Conectar e cole a chave. O teste gratuito roda em seguida.',
      'Clique em Sincronizar agora (ou aguarde a sincronização automática).',
    ],
    keyLocation: 'Bing Webmaster Tools → Configurações → Acesso à API → Gerar chave de API.',
    credentialFormat: 'Texto de 16 a 200 caracteres (letras, números, "_" e "-").',
    endpoints: [
      { label: 'Lista de sites (teste de saúde)', method: 'GET', url: 'https://ssl.bing.com/webmaster/api.svc/json/GetUserSites', note: 'A resposta vem no nó "d".' },
      { label: 'Consultas (sincronização)', method: 'GET', url: 'https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats' },
      { label: 'Páginas (sincronização)', method: 'GET', url: 'https://ssl.bing.com/webmaster/api.svc/json/GetPageStats' },
      { label: 'Série diária (sincronização)', method: 'GET', url: 'https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats' },
    ],
    params: 'O Bing não informa país nem dispositivo por consulta: esses campos ficam vazios.',
    limits: 'Uso gratuito. A API já teve instabilidades: o Zica.ai tenta de novo uma vez e mostra o erro com clareza.',
    commonErrors: [
      { symptom: 'Provedor instável (5xx ou resposta vazia)', fix: 'Aguarde alguns minutos e use Testar conexão de novo.' },
      { symptom: 'Chave recusada (401/403)', fix: 'Gere uma nova chave em Configurações → Acesso à API e use Trocar chave.' },
    ],
    zicaUsage: 'Traz dados reais de busca do Bing para a aba Tráfego orgânico. Só leitura.',
  },
};

const GA4: ProviderCatalogEntry = {
  id: 'ga4', name: 'Google Analytics 4 (Data API)', category: 'search_truth', credentialKind: 'service_account_json',
  credentialLabel: 'JSON da conta de serviço', credentialExample: '{ "type": "service_account", "client_email": "…", "private_key": "-----BEGIN PRIVATE KEY-----…" }',
  formatHint: 'Cole o JSON completo da conta de serviço (pode ser o mesmo arquivo usado no Search Console).',
  contractUrl: 'https://analytics.google.com/',
  docsUrl: 'https://developers.google.com/analytics/devguides/reporting/data/v1',
  keyUrl: 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com',
  extraLinks: [{ label: 'Ativar a Google Analytics Data API', url: 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com' }],
  costLabel: 'Grátis.', testCost: null, hasTest: true,
  doc: {
    steps: [
      'No Google Cloud, ative a Google Analytics Data API no mesmo projeto da conta de serviço (pode ser a mesma do Search Console).',
      'No Google Analytics, abra Administrador → Acesso à propriedade e adicione o e-mail da conta de serviço (campo client_email do JSON) com a função Leitor.',
      'No Zica.ai, clique em Conectar e cole o conteúdo completo do JSON. O teste gratuito roda em seguida.',
      'Informe o ID da propriedade GA4 do projeto (somente números) na aba Analytics. Cada site usa a sua própria propriedade.',
      'Clique em Sincronizar o Analytics para trazer sessões, engajamento, eventos-chave e tráfego vindo de assistentes de IA.',
    ],
    keyLocation: 'Google Cloud → IAM e administrador → Contas de serviço → Chaves → Adicionar chave → JSON. O ID da propriedade fica em Google Analytics → Administrador → Detalhes da propriedade.',
    credentialFormat: 'JSON com "type": "service_account", "client_email" e "private_key" iniciando em -----BEGIN PRIVATE KEY-----. Tamanho máximo de 4096 caracteres.',
    endpoints: [
      { label: 'Troca do token (teste de saúde)', method: 'POST', url: 'https://oauth2.googleapis.com/token', note: 'JWT assinado; escopo analytics.readonly.' },
      { label: 'Metadados da propriedade (teste de saúde)', method: 'GET', url: 'https://analyticsdata.googleapis.com/v1beta/properties/{propriedade}/metadata', note: 'Gratuito; só roda quando o projeto já tem o ID da propriedade.' },
      { label: 'Relatório (sincronização)', method: 'POST', url: 'https://analyticsdata.googleapis.com/v1beta/properties/{propriedade}:runReport', note: 'Dimensões: data, página, canal e origem.' },
    ],
    params: 'O ID da propriedade GA4 é por projeto (somente dígitos). A janela de sincronização vai de 1 a 90 dias (padrão 28).',
    limits: 'Uso gratuito, sujeito às cotas da Google Analytics Data API.',
    commonErrors: [
      { symptom: 'Acesso negado (ga4_forbidden)', fix: 'A conta de serviço ainda não foi adicionada como Leitor na propriedade do Google Analytics.' },
      { symptom: 'Propriedade não informada (ga4_property_required)', fix: 'Informe o ID da propriedade GA4 do projeto na aba Analytics.' },
      { symptom: 'Propriedade já usada em outro projeto', fix: 'Cada site precisa da sua própria propriedade: use o ID correto deste projeto.' },
      { symptom: 'Cota atingida (ga4_quota)', fix: 'Aguarde a renovação da cota e sincronize de novo.' },
    ],
    zicaUsage: 'Traz dados reais de visitas (sessões, engajamento, eventos-chave e tráfego de assistentes de IA) para a aba Analytics e para o Desempenho por área. Só leitura.',
  },
};

const SERPER: ProviderCatalogEntry = {
  id: 'serper', name: 'Serper', category: 'serp', credentialKind: 'api_key',
  credentialLabel: 'Chave de API', credentialExample: 'texto de 16 a 200 caracteres',
  formatHint: 'De 16 a 200 caracteres: letras, números, "_" e "-".',
  contractUrl: 'https://serper.dev', docsUrl: 'https://serper.dev', keyUrl: 'https://serper.dev', extraLinks: [],
  costLabel: '~US$ 0,001–0,003 por consulta.', testCost: { approxUsdMicros: 1000 }, hasTest: true,
  doc: {
    steps: [
      'Crie uma conta no Serper e copie a chave de API do painel.',
      'No Zica.ai, clique em Conectar e cole a chave.',
      'Use Testar conexão: não existe teste gratuito, então o teste consome 1 crédito (~US$ 0,001) e pede a sua confirmação.',
      'Para usar em execuções pagas, habilite o provedor no painel Liberação de execução paga.',
    ],
    keyLocation: 'Painel do Serper (serper.dev), após o login, na área da chave de API.',
    credentialFormat: 'Texto de 16 a 200 caracteres (letras, números, "_" e "-").',
    endpoints: [{ label: 'Busca (teste e execução)', method: 'POST', url: 'https://google.serper.dev/search', note: 'Chave no cabeçalho X-API-KEY.' }],
    params: 'Parâmetros gl (país), hl (idioma) e location (cidade).',
    limits: 'Cada consulta consome 1 crédito.',
    commonErrors: [
      { symptom: 'Sem créditos (HTTP 400/402)', fix: 'Recarregue créditos no painel do Serper.' },
      { symptom: 'Chave recusada (401/403)', fix: 'Confira a chave no painel e use Trocar chave.' },
    ],
    zicaUsage: 'Coleta posições do Google (resultados orgânicos) para as consultas do Observatório, somente com execução paga liberada.',
    warnings: ['O teste de conexão tem custo (1 consulta).'],
  },
};

const DATAFORSEO: ProviderCatalogEntry = {
  id: 'dataforseo', name: 'DataForSEO SERP API', category: 'serp', credentialKind: 'login_password',
  credentialLabel: 'login:senha da API', credentialExample: 'login:senha_da_API',
  formatHint: 'Use o formato login:senha_da_API, com exatamente um ":" entre login e senha. Na DataForSEO, copie o "Login da API" e a "Senha da API" (clique no olho para ver); não use o campo "Formato Base64" nem a senha de entrada do painel.',
  contractUrl: 'https://app.dataforseo.com/register',
  docsUrl: 'https://docs.dataforseo.com/v3/appendix/user_data/',
  keyUrl: 'https://docs.dataforseo.com/v3/appendix/user_data/', extraLinks: [],
  costLabel: '~US$ 0,002–0,006 por consulta.', testCost: null, hasTest: true,
  doc: {
    steps: [
      'Crie a conta no DataForSEO, conclua a verificação da conta e abra "Acesso à API": copie o Login da API e a Senha da API (clique no olho). Não é a senha do site, e o campo "Formato Base64" não serve aqui.',
      'No Zica.ai, clique em Conectar e cole no formato login:senha_da_API (login, um único ":" e a senha).',
      'O teste gratuito consulta o saldo e os limites da conta.',
      'Para usar em execuções pagas, habilite o provedor no painel Liberação de execução paga.',
    ],
    keyLocation: 'Painel do DataForSEO → credenciais da API (login e senha da API).',
    credentialFormat: 'login:senha_da_API, com exatamente um ":" e ambos os lados preenchidos.',
    endpoints: [
      { label: 'Dados do usuário (teste de saúde)', method: 'GET', url: 'https://api.dataforseo.com/v3/appendix/user_data', note: 'Devolve saldo e limites; autenticação Basic.' },
      { label: 'SERP Google (execução)', method: 'POST', url: 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced', note: 'Inclui AI Overview quando disponível.' },
      { label: 'SERP Bing (execução)', method: 'POST', url: 'https://api.dataforseo.com/v3/serp/bing/organic/live/advanced' },
    ],
    params: 'location_code e language_code. Países atendidos: BR, US, PT, ES, IT, FR, GB, DE, AR, MX, CA, CL, CO e UY.',
    limits: 'Cobrança por consulta, debitada do saldo da conta.',
    commonErrors: [
      { symptom: 'Credencial recusada (401)', fix: 'Use a senha da API (não a senha de login do site) e confira o login.' },
      { symptom: 'País não suportado (country_unsupported)', fix: 'Use um dos países da lista acima.' },
    ],
    zicaUsage: 'Coleta posições no Google e no Bing, inclusive AI Overview quando informado, somente com execução paga liberada.',
  },
};

const SERPAPI: ProviderCatalogEntry = {
  id: 'serpapi', name: 'SerpApi', category: 'serp', credentialKind: 'api_key',
  credentialLabel: 'Chave de API', credentialExample: 'texto de 16 a 200 caracteres',
  formatHint: 'De 16 a 200 caracteres: letras, números, "_" e "-".',
  contractUrl: 'https://serpapi.com/users/sign_up', docsUrl: 'https://serpapi.com/account-api', keyUrl: 'https://serpapi.com/account-api', extraLinks: [],
  costLabel: 'A partir de ~US$ 0,01 por consulta.', testCost: null, hasTest: true,
  doc: {
    steps: [
      'Crie a conta na SerpApi e copie a chave de API do painel.',
      'No Zica.ai, clique em Conectar e cole a chave.',
      'O teste gratuito consulta o plano e as buscas restantes.',
      'Para usar em execuções pagas, habilite o provedor no painel Liberação de execução paga.',
    ],
    keyLocation: 'Painel da SerpApi → Your Account (chave de API).',
    credentialFormat: 'Texto de 16 a 200 caracteres (letras, números, "_" e "-").',
    endpoints: [
      { label: 'Conta (teste de saúde)', method: 'GET', url: 'https://serpapi.com/account.json', note: 'Devolve plano e buscas restantes.' },
      { label: 'Busca (execução)', method: 'GET', url: 'https://serpapi.com/search.json', note: 'engine=google ou bing.' },
    ],
    params: 'gl (país), hl (idioma) e location. No Bing, o país usa o parâmetro cc.',
    limits: 'Limite de buscas do plano contratado.',
    commonErrors: [
      { symptom: 'Chave inválida (401)', fix: 'Copie a chave de novo em Your Account e use Trocar chave.' },
      { symptom: 'Buscas esgotadas', fix: 'Aguarde a renovação do plano ou faça upgrade.' },
    ],
    zicaUsage: 'Coleta posições no Google e no Bing; bom para pacote local e Maps. Somente com execução paga liberada.',
  },
};

const BRAVE: ProviderCatalogEntry = {
  id: 'brave', name: 'Brave Search API', category: 'serp', credentialKind: 'api_key',
  credentialLabel: 'Token de assinatura', credentialExample: 'texto de 16 a 200 caracteres',
  formatHint: 'De 16 a 200 caracteres: letras, números, "_" e "-".',
  contractUrl: 'https://api-dashboard.search.brave.com', docsUrl: 'https://api-dashboard.search.brave.com/documentation', keyUrl: 'https://api-dashboard.search.brave.com',
  extraLinks: [{ label: 'Limites de uso (rate limiting)', url: 'https://api-dashboard.search.brave.com/documentation/guides/rate-limiting' }],
  costLabel: 'Cobrança por crédito: cerca de US$ 5 por mil requisições, com crédito mensal incluído.',
  costWarning: BRAVE_NOTICE, testCost: { approxUsdMicros: 5000 }, hasTest: true,
  doc: {
    steps: [
      'Crie a conta no painel da Brave Search API e assine um plano (não há mais plano gratuito fixo).',
      'Gere o token de assinatura no painel.',
      'No Zica.ai, clique em Conectar e cole o token.',
      'Use Testar conexão: o teste consome 1 requisição (~US$ 0,005) e pede a sua confirmação.',
    ],
    keyLocation: 'Painel da Brave Search API → API Keys (token de assinatura).',
    credentialFormat: 'Texto de 16 a 200 caracteres (letras, números, "_" e "-").',
    endpoints: [{ label: 'Busca web (teste e execução)', method: 'GET', url: 'https://api.search.brave.com/res/v1/web/search', note: 'Token no cabeçalho X-Subscription-Token; o teste lê os cabeçalhos X-RateLimit-*.' }],
    params: 'country, search_lang e ui_lang.',
    limits: 'Limites por segundo e por mês conforme o plano; veja o guia de rate limiting.',
    commonErrors: [
      { symptom: 'Token recusado (401/403)', fix: 'Gere um novo token no painel e use Trocar chave.' },
      { symptom: 'Limite atingido (429)', fix: 'Aguarde a renovação do limite ou ajuste o plano.' },
    ],
    zicaUsage: 'Coleta resultados da busca da Brave para as consultas do Observatório, somente com execução paga liberada.',
    warnings: [BRAVE_NOTICE, 'O teste de conexão tem custo (1 requisição).'],
  },
};

const OPENAI: ProviderCatalogEntry = {
  id: 'openai', name: 'OpenAI Responses + web_search', category: 'ai_citations', credentialKind: 'api_key',
  credentialLabel: 'Chave de API', credentialExample: 'sk-…',
  formatHint: 'A chave da OpenAI começa com "sk-".',
  contractUrl: 'https://platform.openai.com/api-keys', docsUrl: 'https://platform.openai.com/docs/api-reference/models/list', keyUrl: 'https://platform.openai.com/api-keys', extraLinks: [],
  costLabel: 'Tokens + busca (~US$ 0,01–0,03 por resposta com modelo mini).', testCost: null, hasTest: true,
  doc: {
    steps: [
      'Entre na plataforma da OpenAI, abra API keys e crie uma chave.',
      'No Zica.ai, clique em Conectar e cole a chave.',
      'O teste gratuito lista os modelos disponíveis.',
      'Para usar em execuções pagas, habilite o provedor no painel Liberação de execução paga.',
    ],
    keyLocation: 'platform.openai.com → API keys → Create new secret key.',
    credentialFormat: 'Começa com "sk-".',
    endpoints: [{ label: 'Lista de modelos (teste de saúde)', method: 'GET', url: 'https://api.openai.com/v1/models' }],
    params: 'user_location (país/cidade) para contextualizar a busca.',
    limits: 'Limites por organização e por modelo, conforme a conta.',
    commonErrors: [
      { symptom: 'Chave recusada (401)', fix: 'Crie uma nova chave e use Trocar chave.' },
      { symptom: 'Sem créditos (429 insufficient_quota)', fix: 'Adicione créditos na conta da OpenAI.' },
    ],
    zicaUsage: 'Observa respostas do ChatGPT com busca na web (citações e menções), somente com execução paga liberada.',
  },
};

const GEMINI: ProviderCatalogEntry = {
  id: 'gemini', name: 'Gemini API + Grounding com Google Search', category: 'ai_citations', credentialKind: 'api_key',
  credentialLabel: 'Chave de API', credentialExample: 'AIza…',
  formatHint: 'A chave do Gemini começa com "AIza" ou tem o formato novo do Google AI Studio (30 caracteres ou mais, sem espaços).',
  contractUrl: 'https://aistudio.google.com/apikey', docsUrl: 'https://ai.google.dev/gemini-api/docs/google-search', keyUrl: 'https://aistudio.google.com/apikey', extraLinks: [],
  costLabel: 'Gemini 2.5: ~US$ 35 por mil prompts com grounding.', testCost: null, hasTest: true,
  doc: {
    steps: [
      'No Google AI Studio, crie uma chave de API.',
      'No Zica.ai, clique em Conectar e cole a chave.',
      'O teste gratuito lista os modelos disponíveis.',
      'Para usar em execuções pagas, habilite o provedor no painel Liberação de execução paga.',
    ],
    keyLocation: 'aistudio.google.com/apikey → Criar chave de API.',
    credentialFormat: 'Começa com "AIza" ou tem o formato novo do AI Studio (30 caracteres ou mais, sem espaços).',
    endpoints: [{ label: 'Lista de modelos (teste de saúde)', method: 'GET', url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', note: 'Chave no cabeçalho x-goog-api-key.' }],
    params: 'Sem parâmetro de país explícito.',
    limits: 'Cotas do plano do Gemini API; grounding é cobrado à parte.',
    commonErrors: [
      { symptom: 'Chave recusada (400/403)', fix: 'Crie uma nova chave no AI Studio e use Trocar chave.' },
      { symptom: 'Cota excedida (429)', fix: 'Aguarde a renovação da cota ou habilite o faturamento.' },
    ],
    zicaUsage: 'Observa respostas do Gemini com Google Search (citações e menções), somente com execução paga liberada.',
  },
};

const ANTHROPIC: ProviderCatalogEntry = {
  id: 'anthropic', name: 'Anthropic Messages + web_search', category: 'ai_citations', credentialKind: 'api_key',
  credentialLabel: 'Chave de API', credentialExample: 'sk-ant-…',
  formatHint: 'A chave da Anthropic começa com "sk-ant-".',
  contractUrl: 'https://platform.claude.com/settings/keys', docsUrl: 'https://platform.claude.com/docs/en/api/models/list', keyUrl: 'https://platform.claude.com/settings/keys', extraLinks: [],
  costLabel: 'US$ 10 por mil buscas + tokens.', testCost: null, hasTest: true,
  doc: {
    steps: [
      'No console da Anthropic, abra Settings → API keys e crie uma chave.',
      'No Zica.ai, clique em Conectar e cole a chave.',
      'O teste gratuito lista os modelos disponíveis.',
      'Para usar em execuções pagas, habilite o provedor no painel Liberação de execução paga.',
    ],
    keyLocation: 'platform.claude.com → Settings → API keys → Create key.',
    credentialFormat: 'Começa com "sk-ant-".',
    endpoints: [{ label: 'Lista de modelos (teste de saúde)', method: 'GET', url: 'https://api.anthropic.com/v1/models?limit=1', note: 'Cabeçalhos x-api-key e anthropic-version: 2023-06-01.' }],
    params: 'user_location (país/cidade) para contextualizar a busca.',
    limits: 'Limites por organização e por modelo, conforme o nível da conta.',
    commonErrors: [
      { symptom: 'Chave recusada (401)', fix: 'Crie uma nova chave e use Trocar chave.' },
      { symptom: 'Sem créditos', fix: 'Adicione créditos na conta da Anthropic.' },
    ],
    zicaUsage: 'Observa respostas do Claude com busca na web (citações e menções), somente com execução paga liberada.',
  },
};

const PERPLEXITY: ProviderCatalogEntry = {
  id: 'perplexity', name: 'Perplexity Search API', category: 'ai_citations', credentialKind: 'api_key',
  credentialLabel: 'Chave de API', credentialExample: 'pplx-…',
  formatHint: 'A chave da Perplexity começa com "pplx-".',
  contractUrl: 'https://www.perplexity.ai/account/api/keys', docsUrl: 'https://docs.perplexity.ai/', keyUrl: 'https://www.perplexity.ai/account/api/keys', extraLinks: [],
  costLabel: '~US$ 5 por mil buscas.', testCost: { approxUsdMicros: 5000 }, hasTest: true,
  doc: {
    steps: [
      'No painel da Perplexity, abra API keys e gere uma chave.',
      'No Zica.ai, clique em Conectar e cole a chave.',
      'Use Testar conexão: não existe teste gratuito, então o teste consome 1 busca (~US$ 0,005) e pede a sua confirmação.',
      'Para usar em execuções pagas, habilite o provedor no painel Liberação de execução paga.',
    ],
    keyLocation: 'perplexity.ai → Conta → API → API keys.',
    credentialFormat: 'Começa com "pplx-".',
    endpoints: [{ label: 'Busca (teste e execução)', method: 'POST', url: 'https://api.perplexity.ai/search' }],
    params: 'Parâmetro country.',
    limits: 'Limites conforme o plano e os créditos da conta.',
    commonErrors: [
      { symptom: 'Chave recusada (401)', fix: 'Gere uma nova chave e use Trocar chave.' },
      { symptom: 'Sem créditos (402/429)', fix: 'Adicione créditos na conta da Perplexity.' },
    ],
    zicaUsage: 'Observa buscas da Perplexity (citações e menções), somente com execução paga liberada.',
    warnings: ['O teste de conexão tem custo (1 busca).'],
  },
};

const COPILOT: ProviderCatalogEntry = {
  id: 'copilot', name: 'Microsoft Copilot (manual)', category: 'manual', credentialKind: 'none',
  credentialLabel: 'Sem credencial', credentialExample: '', formatHint: 'Não há API pública de chat do Copilot.',
  contractUrl: 'https://www.bing.com/webmasters', docsUrl: 'https://learn.microsoft.com/en-us/bingwebmaster/getting-access', keyUrl: 'https://learn.microsoft.com/en-us/bingwebmaster/getting-access', extraLinks: [],
  costLabel: 'Sem custo de API.', testCost: null, hasTest: false,
  doc: {
    steps: [
      'Não existe API pública de chat do Copilot: as observações são registradas manualmente no Observatório.',
      'A única fonte oficial de citação é o relatório "AI Performance" do Bing Webmaster Tools, quando disponível na sua conta.',
      'Use o atalho para o Observatório e registre o que viu, guardando a evidência fora do sistema.',
    ],
    keyLocation: 'Não se aplica.',
    credentialFormat: 'Não se aplica.',
    endpoints: [],
    params: 'Não se aplica.',
    limits: 'Não se aplica.',
    commonErrors: [{ symptom: 'Não há dados do Copilot no painel', fix: 'Registre observações manuais no Observatório; o relatório AI Performance do Bing depende da sua conta.' }],
    zicaUsage: 'Guarda observações manuais do Copilot no Observatório. Não há teste automático.',
  },
};

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  GSC, BING, GA4, SERPER, DATAFORSEO, SERPAPI, BRAVE, OPENAI, GEMINI, ANTHROPIC, PERPLEXITY, COPILOT,
];
export const PROVIDER_IDS: readonly ProviderId[] = PROVIDER_CATALOG.map((p) => p.id);
export const COST_TEST_PROVIDERS: readonly ProviderId[] = PROVIDER_CATALOG.filter((p) => p.testCost).map((p) => p.id);
export const CATEGORY_ORDER: readonly ProviderCategory[] = ['search_truth', 'serp', 'ai_citations', 'manual'];
export const FREE_SEARCH_PROVIDERS: readonly ProviderId[] = ['gsc', 'bing_webmaster'];
/** Provedores com teste de saúde gratuito (contrato GA4/gestão): entram na ativação guiada. */
export const FREE_HEALTH_PROVIDERS: readonly ProviderId[] = ['gsc', 'bing_webmaster', 'ga4'];

export function isProviderId(value: string): value is ProviderId { return PROVIDER_IDS.includes(value as ProviderId); }
export function getCatalogEntry(id: string): ProviderCatalogEntry | undefined { return PROVIDER_CATALOG.find((p) => p.id === id); }
export function providerName(id: string): string { return getCatalogEntry(id)?.name ?? id; }

/** Todas as URLs do catálogo (usado em teste para garantir que as URLs do contrato estejam presentes). */
export function allCatalogUrls(): string[] {
  const urls = new Set<string>();
  for (const p of PROVIDER_CATALOG) {
    [p.contractUrl, p.docsUrl, p.keyUrl, ...p.extraLinks.map((l) => l.url), ...p.doc.endpoints.map((e) => e.url)].forEach((u) => urls.add(u));
  }
  return Array.from(urls);
}

// ---------------------------------------------------------------------------
// Rótulos e formatação (funções puras)
// ---------------------------------------------------------------------------

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const STATUS_LABELS: Record<ProviderStatus, string> = {
  not_configured: 'Não configurado', stored_unverified: 'Guardada, sem teste', healthy: 'Saudável',
  degraded: 'Com atenção', error: 'Com erro', manual: 'Manual',
};
export function statusLabel(status: ProviderStatus | string): string {
  return STATUS_LABELS[status as ProviderStatus] ?? 'Desconhecido';
}

const CREDENTIAL_STATUS_LABELS: Record<string, string> = {
  active: 'ativa', invalid: 'recusada pelo provedor', stored_unverified: 'guardada, sem teste', disabled: 'desabilitada',
  healthy: 'saudável', degraded: 'com atenção', error: 'com erro',
};
/** Situação da credencial (`organization_provider_credentials.status`) em pt-BR. */
export function credentialStatusLabel(status: string | null | undefined): string {
  return status ? (CREDENTIAL_STATUS_LABELS[status] ?? status) : 'sem informação';
}

export function statusTone(status: ProviderStatus | string): Tone {
  switch (status) {
    case 'healthy': return 'success';
    case 'degraded': return 'warning';
    case 'error': return 'danger';
    case 'stored_unverified': return 'info';
    default: return 'neutral';
  }
}

/** Classes (claro/escuro) com contraste AA. A cor nunca vem sozinha: o selo sempre traz ícone e texto. */
export function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'success': return 'border-emerald-600/50 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100';
    case 'warning': return 'border-amber-600/50 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100';
    case 'danger': return 'border-red-600/50 bg-red-50 text-red-950 dark:bg-red-950/50 dark:text-red-100';
    case 'info': return 'border-sky-600/50 bg-sky-50 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100';
    default: return 'border-border bg-muted text-muted-foreground';
  }
}

const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  search_truth: 'Verdade dos buscadores', serp: 'Posições e SERP', ai_citations: 'Citações em IAs', manual: 'Manual',
};
export function categoryLabel(category: ProviderCategory | string): string {
  return CATEGORY_LABELS[category as ProviderCategory] ?? String(category);
}

const OVERALL_LABELS: Record<OverallStatus, string> = {
  empty: 'Nenhuma conexão ainda', ok: 'Tudo em ordem', attention: 'Atenção', critical: 'Crítico',
};
export function overallLabel(overall: OverallStatus | string): string { return OVERALL_LABELS[overall as OverallStatus] ?? 'Desconhecido'; }
export function overallTone(overall: OverallStatus | string): Tone {
  return overall === 'ok' ? 'success' : overall === 'attention' ? 'warning' : overall === 'critical' ? 'danger' : 'neutral';
}

/** "há 5 s", "há 3 min", "há 2 h", "há 4 d". Sem data = "nunca". */
export function formatRelative(iso: string | null | undefined, now: number | Date = Date.now()): string {
  if (!iso) return 'nunca';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'nunca';
  const n = typeof now === 'number' ? now : now.getTime();
  const sec = Math.floor((n - t) / 1000);
  if (sec < 1) return 'agora';
  if (sec < 60) return `há ${sec} s`;
  if (sec < 3600) return `há ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `há ${Math.floor(sec / 3600)} h`;
  return `há ${Math.floor(sec / 86400)} d`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** Micros de dólar -> "US$ 1,23". Valores positivos abaixo de US$ 0,01 mostram até 4 casas. */
export function formatUsdMicros(micros: number | null | undefined): string {
  if (typeof micros !== 'number' || !Number.isFinite(micros)) return '—';
  const usd = micros / 1_000_000;
  if (usd > 0 && usd < 0.01) return `US$ ${usd.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`;
  return `US$ ${usd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Texto do diálogo de confirmação dos testes com custo. */
export function confirmCostText(providerId: string): string {
  const cost = getCatalogEntry(providerId)?.testCost;
  const approx = cost ? formatUsdMicros(cost.approxUsdMicros).replace('US$ ', '') : '0,001';
  return `Este teste consome 1 consulta (~US$ ${approx}). Continuar?`;
}

/** Quota "restante de limite" em texto curto; null quando o provedor não informou. */
export function quotaText(quota: { label?: string | null; remaining?: number | null; limit?: number | null } | null | undefined): string | null {
  if (!quota) return null;
  const hasRemaining = typeof quota.remaining === 'number' && Number.isFinite(quota.remaining);
  const hasLimit = typeof quota.limit === 'number' && Number.isFinite(quota.limit);
  if (!hasRemaining && !hasLimit) return quota.label ? String(quota.label) : null;
  const label = quota.label ? `${quota.label}: ` : '';
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  if (hasRemaining && hasLimit) return `${label}${fmt(quota.remaining as number)} de ${fmt(quota.limit as number)} restantes`;
  if (hasRemaining) return `${label}${fmt(quota.remaining as number)} restantes`;
  return `${label}limite ${fmt(quota.limit as number)}`;
}

/** Taxa de sucesso dos testes dos últimos 7 dias (0–1) ou null sem testes. */
export function successRate7d(item: Pick<ProviderOverviewItem, 'health'>): number | null {
  const { checks_7d, ok_7d } = item.health;
  return checks_7d > 0 ? ok_7d / checks_7d : null;
}

const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{10,}|pplx-[A-Za-z0-9]{8,}|-----BEGIN[\s\S]*)/g;
/** Defesa em profundidade: o servidor já não manda segredo, mas aqui mascaramos padrões de chave e limitamos o tamanho. */
export function safeDetail(detail: string | null | undefined): string {
  if (!detail) return '';
  return String(detail).replace(SECRET_PATTERN, '[oculto]').slice(0, 300);
}

/** Mensagem humana para um resultado de teste de saúde. */
export function providerHealthMessage(h: Pick<HealthCheckResult, 'ok' | 'skipped' | 'http_status' | 'detail'> | null | undefined): string {
  if (!h) return 'Ainda sem teste.';
  if (h.skipped === 'not_configured') return 'Sem credencial guardada.';
  if (h.skipped === 'manual') return 'Provedor manual: não há teste automático.';
  if (h.skipped === 'cost_confirmation_required') return 'Este teste tem custo: confirme para executá-lo.';
  if (h.ok) return 'Conexão confirmada.';
  const s = h.http_status ?? 0;
  if (s === 401 || s === 403) return `O provedor recusou a credencial (HTTP ${s}). Confira se a chave está completa, ativa e com as permissões certas; se precisar, use Trocar chave.`;
  if (s === 429) return 'O limite de uso do provedor foi atingido (HTTP 429). Aguarde a renovação ou confira os créditos.';
  if (s >= 500) return `O provedor está instável agora (HTTP ${s}). Tente novamente mais tarde.`;
  const d = safeDetail(h.detail);
  return d || 'O teste falhou. Tente novamente.';
}

const ERROR_MESSAGES: Record<string, string> = {
  provider_not_connected: 'Algum provedor marcado não está conectado ou está com a chave recusada. Desmarque-o ou troque a chave e tente de novo.',
  forbidden: 'Só proprietário ou administrador da organização pode fazer esta ação.',
  provider_invalid: 'Provedor desconhecido.',
  provider_not_configured: 'Este provedor ainda não tem credencial guardada.',
  provider_manual: 'Este provedor é manual: não há credencial nem teste automático.',
  cost_confirmation_required: 'Este teste tem custo: confirme antes de executar.',
  budget_paused: 'Execução paga desligada ou sem orçamento: nenhuma chamada paga foi feita.',
  provider_not_enabled: 'Provedor não habilitado para execução paga neste projeto.',
  budget_invalid: 'Informe um orçamento entre US$ 0 e US$ 200.',
  confirm_required: 'Digite LIBERAR para confirmar.',
  provider_required: 'Habilite ao menos um provedor conectado.',
  providers_required: 'Habilite ao menos um provedor conectado.',
  gsc_not_configured: 'O Google Search Console ainda não está conectado. Guarde o JSON da conta de serviço primeiro.',
  gsc_forbidden: 'A conta de serviço não tem acesso à propriedade. No Search Console, adicione o e-mail da conta de serviço em Configurações → Usuários e permissões.',
  manager_required: 'Esta ação é técnica e só a conta de gerenciamento pode fazer. Use “Solicitar” para pedir ao gestor.',
  ga4_not_configured: 'O Google Analytics ainda não está conectado. Peça ao gestor para guardar a credencial primeiro.',
  ga4_property_required: 'Falta informar o ID da propriedade do Google Analytics deste projeto.',
  ga4_forbidden: 'A conta de serviço não tem acesso à propriedade do Google Analytics. Adicione o e-mail da conta de serviço como Leitor em Administrador → Acesso à propriedade.',
  ga4_quota: 'A cota do Google Analytics foi atingida. Tente de novo mais tarde.',
  ga4_unreachable: 'Não foi possível falar com o Google Analytics agora. Tente de novo em alguns minutos.',
  ga4_property_already_used: 'Este ID de propriedade já está em uso por outro projeto. Cada site precisa da sua própria propriedade.',
  ga4_property_invalid: 'O ID da propriedade GA4 deve ter só números (de 5 a 15 dígitos).',
  too_many_open_requests: 'Já existem muitas solicitações abertas (limite de 20). Aguarde o gestor responder antes de enviar outra.',
  request_not_found: 'Solicitação não encontrada.',
  gsc_unreachable: 'Não foi possível falar com o Google Search Console agora. Tente de novo em alguns minutos.',
  bing_not_configured: 'O Bing Webmaster ainda não está conectado. Guarde a chave de API primeiro.',
  bing_unreachable: 'O Bing Webmaster está instável ou fora do ar. Tente de novo em alguns minutos.',
  audit_rate_limited: 'Auditoria rodada há pouco. Aguarde um minuto para auditar de novo.',
  fix_not_applicable: 'Este achado não tem correção automática.',
  fix_action_invalid: 'Esta correção não é permitida.',
  provider_request_failed: 'O provedor devolveu erro. Tente de novo.',
  country_unsupported: 'País não suportado por este provedor.',
  timeout: 'O provedor demorou demais para responder (15 s).',
  operation_failed: 'Falha inesperada no servidor. Tente de novo; se persistir, avise o suporte.',
};

/** Traduz códigos do servidor para pt-BR. `secret_format_invalid:<dica>` mostra a dica. Desconhecido passa como veio. */
export function providerErrorMessage(error: unknown): string {
  const raw = (error instanceof Error ? error.message : typeof error === 'string' ? error : '').trim();
  if (!raw) return 'Falha inesperada.';
  const fmt = /^secret_format_invalid(?::(.*))?$/.exec(raw);
  if (fmt) return `A credencial não está no formato esperado.${fmt[1]?.trim() ? ` ${fmt[1].trim()}` : ''}`;
  if (/^401\b/.test(raw) || raw === 'unauthorized') return 'O provedor recusou a credencial (HTTP 401). Confira a chave e tente de novo.';
  if (raw in ERROR_MESSAGES) return ERROR_MESSAGES[raw];
  return raw;
}

// ---------------------------------------------------------------------------
// Validação da credencial no cliente (espelha o servidor; o servidor é a autoridade)
// ---------------------------------------------------------------------------

export function normalizeSecret(secret: string): string { return secret.trim(); }

/** `null` = formato aceito; texto = dica para o usuário. Nunca registra nem devolve o segredo. */
export function validateSecretFormat(providerId: string, rawSecret: string): string | null {
  const entry = getCatalogEntry(providerId);
  if (!entry || entry.credentialKind === 'none') return 'Este provedor não usa credencial.';
  const secret = normalizeSecret(rawSecret);
  if (!secret) return 'Cole a credencial.';
  if (secret.length > MAX_SECRET_LENGTH) return `A credencial passa de ${MAX_SECRET_LENGTH} caracteres.`;
  const fail = entry.formatHint;
  switch (providerId) {
    case 'openai': return secret.startsWith('sk-') ? null : fail;
    case 'anthropic': return secret.startsWith('sk-ant-') ? null : fail;
    // Chaves antigas começam com "AIza"; o Google AI Studio também emite chaves em formato novo (sem esse prefixo).
    case 'gemini': return secret.startsWith('AIza') || (secret.length >= 30 && /^[\x21-\x7E]+$/.test(secret)) ? null : fail;
    case 'perplexity': return secret.startsWith('pplx-') ? null : fail;
    case 'serper': case 'serpapi': case 'bing_webmaster': case 'brave':
      return /^[A-Za-z0-9_-]{16,200}$/.test(secret) ? null : fail;
    case 'dataforseo': {
      const parts = secret.split(':');
      return parts.length === 2 && parts[0].trim() && parts[1].trim() ? null : fail;
    }
    case 'gsc': case 'ga4': {
      try {
        const j = JSON.parse(secret) as Record<string, unknown>;
        const ok = j && j.type === 'service_account' && typeof j.client_email === 'string' && j.client_email
          && typeof j.private_key === 'string' && j.private_key.startsWith('-----BEGIN PRIVATE KEY-----');
        return ok ? null : fail;
      } catch { return fail; }
    }
    default: return fail;
  }
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

export function emptyOverviewItem(id: ProviderId): ProviderOverviewItem {
  const entry = getCatalogEntry(id);
  return {
    id, category: entry?.category ?? 'serp', status: id === 'copilot' ? 'manual' : 'not_configured', score: null, enabled: false,
    credential: { stored: false, last_four: null, status: null, updated_at: null },
    health: { last: null, checks_7d: 0, ok_7d: 0, avg_latency_ms_7d: null },
    usage: { valid_30d: 0, failed_30d: 0, uncertain_30d: 0, last_success_at: null },
  };
}

/** Status simplificado (cliente) -> status técnico equivalente, para a tela usar um único tipo. */
const SIMPLE_TO_STATUS: Record<SimpleProviderStatus, ProviderStatus> = { connected: 'healthy', attention: 'degraded', not_connected: 'not_configured' };
const TECHNICAL_STATUSES: readonly string[] = ['not_configured', 'stored_unverified', 'healthy', 'degraded', 'error', 'manual'];

/** Completa o que o servidor omite (cliente não recebe credencial, saúde nem uso) e converte o status simplificado. */
export function normalizeOverviewItem(raw: RawProviderOverviewItem): ProviderOverviewItem {
  const base = emptyOverviewItem(raw.id);
  const status: ProviderStatus = TECHNICAL_STATUSES.includes(raw.status)
    ? (raw.status as ProviderStatus)
    : SIMPLE_TO_STATUS[raw.status as SimpleProviderStatus] ?? base.status;
  return {
    ...base, ...raw, status,
    credential: { ...base.credential, ...(raw.credential ?? {}) },
    health: { ...base.health, ...(raw.health ?? {}) },
    usage: { ...base.usage, ...(raw.usage ?? {}) },
  };
}

/** Sempre devolve os provedores do catálogo, na ordem do catálogo, preenchendo os que o servidor não mandou. */
export function mergeCatalogWithOverview(overview: ProvidersOverview | null | undefined): ProviderOverviewItem[] {
  const byId = new Map((overview?.providers ?? []).map((p) => [p.id, p] as const));
  return PROVIDER_CATALOG.map((c) => {
    const raw = byId.get(c.id);
    return raw ? normalizeOverviewItem(raw) : emptyOverviewItem(c.id);
  });
}

/**
 * Defesa em profundidade para a Visão cliente: mesmo que o servidor mande, a tela descarta os últimos 4 dígitos,
 * o detalhe técnico dos testes e a quota. Fica só o que o cliente pode ver (status, atualização e uso agregado).
 */
export function sanitizeItemForClient(item: ProviderOverviewItem): ProviderOverviewItem {
  const last = item.health.last;
  return {
    ...item,
    enabled: false,
    credential: { stored: item.credential.stored, last_four: null, status: null, updated_at: item.credential.updated_at },
    health: { ...item.health, last: last ? { checked_at: last.checked_at, ok: last.ok } : null },
  };
}

// ---- Papel de quem consulta (gestor × cliente) ----

export const CLIENT_VIEWER: NexusViewer = { role: 'client', can_manage_technical: false };

/**
 * Papel de quem consulta. Ordem: `viewer` (contrato novo) -> `viewer_is_admin` (compatibilidade) -> cliente.
 * Decisão restritiva: sem resposta do servidor NÃO se deduz permissão pelo papel local; o servidor é quem decide.
 */
export function resolveViewer(overview: Pick<ProvidersOverview, 'viewer' | 'viewer_is_admin'> | null | undefined): NexusViewer {
  const v = overview?.viewer;
  if (v && typeof v.can_manage_technical === 'boolean') {
    if (!v.can_manage_technical) return CLIENT_VIEWER;
    return { role: v.role === 'manager' ? 'manager' : 'org_admin', can_manage_technical: true };
  }
  if (overview?.viewer_is_admin === true) return { role: 'org_admin', can_manage_technical: true };
  return CLIENT_VIEWER;
}

/** Só o gestor da plataforma responde solicitações (contrato, seção A). Admin de org interna gerencia o técnico, mas não triagem. */
export function canTriageRequests(viewer: NexusViewer): boolean { return viewer.role === 'manager' && viewer.can_manage_technical; }

const SIMPLE_LABELS: Record<SimpleProviderStatus, string> = { connected: 'Conectado', attention: 'Precisa de atenção', not_connected: 'Não conectado' };
export function simpleStatusOf(status: ProviderStatus | string): SimpleProviderStatus {
  if (status === 'healthy' || status === 'connected') return 'connected';
  if (status === 'degraded' || status === 'error' || status === 'stored_unverified' || status === 'attention') return 'attention';
  return 'not_connected';
}
export function simpleStatusLabel(status: SimpleProviderStatus): string { return SIMPLE_LABELS[status]; }
export function simpleStatusTone(status: SimpleProviderStatus): Tone {
  return status === 'connected' ? 'success' : status === 'attention' ? 'warning' : 'neutral';
}

/** Há dados chegando deste provedor (ou ao menos credencial guardada)? Vale para as duas visões. */
export function providerIsConnected(item: Pick<ProviderOverviewItem, 'status' | 'credential'>): boolean {
  return item.credential.stored || (item.status !== 'manual' && simpleStatusOf(item.status) !== 'not_connected');
}

/** Última atualização conhecida do provedor (cliente: `updated_at`; gestor: último teste ou data da credencial). */
export function providerUpdatedAt(item: ProviderOverviewItem): string | null {
  return item.updated_at ?? item.health.last?.checked_at ?? item.credential.updated_at ?? null;
}

export function summarizeItemsSimple(items: ProviderOverviewItem[]): { total: number; connected: number; attention: number; notConnected: number } {
  const s = items.filter((i) => i.category !== 'manual').map((i) => simpleStatusOf(i.status));
  return {
    total: s.length,
    connected: s.filter((x) => x === 'connected').length,
    attention: s.filter((x) => x === 'attention').length,
    notConnected: s.filter((x) => x === 'not_connected').length,
  };
}

export const EMPTY_PROGRAM: ProviderProgram = { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [] };

/** Resumo de reserva quando o servidor não manda `summary`. */
export function fallbackSummary(items: ProviderOverviewItem[]): ProvidersSummary {
  const by = (st: ProviderStatus) => items.filter((i) => i.status === st).length;
  const connected = items.filter((i) => i.credential.stored).length;
  return {
    total: items.length, connected, healthy: by('healthy'), degraded: by('degraded'), error: by('error'),
    not_configured: by('not_configured'), manual: by('manual'), overall: connected === 0 ? 'empty' : by('error') > 0 ? 'attention' : 'ok', score: null,
  };
}

export function filterByCategory(items: ProviderOverviewItem[], category: ProviderCategory | 'all'): ProviderOverviewItem[] {
  return category === 'all' ? items : items.filter((i) => i.category === category);
}

/** Provedores que podem ser habilitados para execução paga: credencial guardada e não manual. */
/** Provedores que podem ser habilitados para execução paga: credencial guardada E aceita (ativa ou ainda não testada). Chave inválida, revogada ou pausada fica de fora, como no servidor. */
export function connectedProviderIds(items: ProviderOverviewItem[]): ProviderId[] {
  const usable = (status: string | null | undefined) => status == null || status === 'active' || status === 'stored_unverified';
  return items.filter((i) => i.credential.stored && i.category !== 'manual' && usable(i.credential.status)).map((i) => i.id);
}

/** O cartão "Ativação guiada dos gratuitos" some quando GSC e Bing estão conectados e saudáveis. */
export function needsGuidedActivation(items: ProviderOverviewItem[]): boolean {
  return FREE_HEALTH_PROVIDERS.some((id) => {
    const it = items.find((i) => i.id === id);
    return !it || it.status !== 'healthy';
  });
}

export function latestCheckAt(items: ProviderOverviewItem[]): string | null {
  let best: string | null = null;
  for (const i of items) {
    const at = i.health.last?.checked_at;
    if (at && (!best || new Date(at).getTime() > new Date(best).getTime())) best = at;
  }
  return best;
}

/** Linha da faixa de saúde geral. */
export function healthStripText(overview: ProvidersOverview, items: ProviderOverviewItem[], now: number | Date = Date.now()): string {
  const s = overview.summary ?? fallbackSummary(items);
  const p = overview.program ?? EMPTY_PROGRAM;
  const total = s.total || PROVIDER_CATALOG.length;
  return [
    `${s.connected} de ${total} conectados`,
    `${s.healthy} ${s.healthy === 1 ? 'saudável' : 'saudáveis'}`,
    `${s.degraded} com atenção`,
    `${s.error} com erro`,
    `custo do mês ${formatUsdMicros(p.consumed_usd_micros)} de ${formatUsdMicros(p.budget_usd_micros)}`,
    `última verificação ${formatRelative(latestCheckAt(items), now)}`,
  ].join(' · ');
}

/** Resume um lote de testes de saúde em uma frase. */
export function summarizeHealthResults(results: HealthCheckResult[]): string {
  const tested = results.filter((r) => !r.skipped);
  const ok = tested.filter((r) => r.ok).length;
  const failed = tested.length - ok;
  const skipped = results.length - tested.length;
  if (results.length === 0) return 'Nenhuma conexão gratuita para testar.';
  const parts = [`${tested.length} testada(s)`, `${ok} ok`, `${failed} com falha`];
  if (skipped > 0) parts.push(`${skipped} ignorada(s)`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Liberação de execução paga
// ---------------------------------------------------------------------------

/** "5", "5,5" ou "5.5" -> número entre 0 e 200; inválido = null. */
export function parseBudgetUsd(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t || !/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= MAX_BUDGET_USD ? n : null;
}

/** Motivo pelo qual não se pode LIGAR a execução paga; `null` = pode. Espelha as regras do servidor. */
export function executionEnableBlocker(input: { budgetText: string; providers: string[]; confirm: string }): string | null {
  const budget = parseBudgetUsd(input.budgetText);
  if (budget === null) return `Informe um orçamento mensal entre US$ 0,01 e US$ ${MAX_BUDGET_USD}.`;
  if (budget <= 0) return 'O orçamento precisa ser maior que zero.';
  if (input.providers.length === 0) return 'Habilite ao menos um provedor conectado.';
  if (input.confirm.trim() !== CONFIRM_WORD) return `Digite ${CONFIRM_WORD} para confirmar.`;
  return null;
}

/** Percentual (0–100) de orçamento comprometido (consumido + reservado). */
export function budgetUsedPercent(program: { budget_usd_micros: number; reserved_usd_micros: number; consumed_usd_micros: number }): number | null {
  if (!program.budget_usd_micros || program.budget_usd_micros <= 0) return null;
  return Math.min(100, Math.round(((program.consumed_usd_micros + program.reserved_usd_micros) / program.budget_usd_micros) * 100));
}

// ---------------------------------------------------------------------------
// Sincronização de tráfego orgânico
// ---------------------------------------------------------------------------

export interface NormalizedSyncRow { source: 'gsc' | 'bing'; ok: boolean; rows: number; truncated: boolean; error?: string }

/** Aceita o formato único do GSC e o formato por fonte do adendo. */
export function normalizeSyncResponse(r: SearchSyncResponse | null | undefined): NormalizedSyncRow[] {
  if (!r) return [];
  if (Array.isArray(r.results)) {
    return r.results.map((x) => ({ source: x.source, ok: x.ok, rows: x.rows_upserted ?? 0, truncated: !!x.truncated, ...(x.error ? { error: x.error } : {}) }));
  }
  return [{ source: 'gsc', ok: true, rows: r.rows_upserted ?? 0, truncated: !!r.truncated }];
}

/** Resumo do `ga4_sync` em uma frase. */
export function ga4SyncSummaryText(r: Ga4SyncResult | null | undefined): string {
  const rows = r?.results ?? [];
  if (!r) return 'Nada foi sincronizado.';
  if (rows.length === 0) return typeof r.rows_upserted === 'number' ? `Google Analytics: ${r.rows_upserted.toLocaleString('pt-BR')} linha(s) gravada(s)` : 'Nada foi sincronizado.';
  return rows.map((x) => (x.ok
    ? `Google Analytics: ${(x.rows_upserted ?? 0).toLocaleString('pt-BR')} linha(s) gravada(s)${r.truncated ? ' (resultado truncado)' : ''}`
    : `Google Analytics: ${providerErrorMessage(x.error ?? 'operation_failed')}`)).join(' · ');
}

export function sourceLabel(source: string): string { return source === 'bing' ? 'Bing Webmaster' : 'Google Search Console'; }

export function syncSummaryText(rows: NormalizedSyncRow[]): string {
  if (rows.length === 0) return 'Nada foi sincronizado.';
  return rows.map((r) => (r.ok
    ? `${sourceLabel(r.source)}: ${r.rows.toLocaleString('pt-BR')} linha(s) gravada(s)${r.truncated ? ' (resultado truncado)' : ''}`
    : `${sourceLabel(r.source)}: ${providerErrorMessage(r.error ?? 'operation_failed')}`)).join(' · ');
}

/** Só rotas internas do app (começam com "/" e não com "//"). */
export function isSafeInternalRoute(route: unknown): route is string {
  return typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') && !route.includes('\\');
}

/**
 * Quem pode alterar chaves, liberação de execução, auditoria e sincronização: dono/admin da organização do projeto ativo
 * (ou o CEO da plataforma). É só uma dica de interface: o servidor revalida e é quem decide.
 */
export function canAdministerOrganization(input: { role?: string | null; membershipOrgId?: string | null; activeOrgId?: string | null; isPlatformAdmin?: boolean }): boolean {
  if (input.isPlatformAdmin) return true;
  const roleOk = input.role === 'owner' || input.role === 'admin';
  return roleOk && !!input.membershipOrgId && input.membershipOrgId === input.activeOrgId;
}

const DEVICE_LABELS: Record<string, string> = { DESKTOP: 'Computador', MOBILE: 'Celular', TABLET: 'Tablet', '': 'Não informado' };
export function deviceLabel(device: string): string { return DEVICE_LABELS[device.toUpperCase()] ?? device; }
/** Posição média com 1 casa decimal em pt-BR; sem dado = "—". */
export function formatPosition(p: number | null | undefined): string {
  return typeof p === 'number' && Number.isFinite(p) ? p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
}
