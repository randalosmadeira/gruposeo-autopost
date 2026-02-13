/**
 * Brand Detection & SEO+GEO Prompt Builder
 * 
 * Auto-detects brand (RDM, Grupo SEO, Elas Tracy) from project config
 * and injects brand-specific SEO+GEO optimization directives.
 */

export type BrandType = 'rdm' | 'grupo_seo' | 'elas_tracy' | 'generic';

export interface BrandDetectionResult {
  brand: BrandType;
  brandName: string;
  confidence: number;
}

interface ProjectConfig {
  empresa_nome?: string;
  nicho?: string;
  wordpress_url?: string;
  domain?: string;
  social_instagram?: string;
  social_youtube?: string;
  social_linkedin?: string;
  social_twitter?: string;
  social_tiktok?: string;
  social_google_maps?: string;
  social_linktree?: string;
  empresa_telefone?: string;
  empresa_endereco?: string;
  empresa_whatsapp?: string;
  cta_comunidade?: string;
  cta_conclusao?: string;
  cta_leads?: string;
}

/**
 * Auto-detect brand from project configuration data.
 */
export function detectBrand(config?: ProjectConfig): BrandDetectionResult {
  if (!config) return { brand: 'generic', brandName: 'Marca Genérica', confidence: 0 };

  const nome = (config.empresa_nome || '').toLowerCase();
  const domain = (config.wordpress_url || config.domain || '').toLowerCase();
  const nicho = (config.nicho || '').toLowerCase();
  const instagram = (config.social_instagram || '').toLowerCase();

  // RDM detection
  if (
    nome.includes('rdm') || nome.includes('rândalos') || nome.includes('randalos') ||
    nome.includes('madeira') || domain.includes('rdm') ||
    nicho === 'juridico' || nicho === 'legal'
  ) {
    return { brand: 'rdm', brandName: 'RDM Advogados Associados', confidence: 0.95 };
  }

  // Elas Tracy detection
  if (
    nome.includes('elas tracy') || nome.includes('elastracy') ||
    domain.includes('elastracy') || instagram.includes('elastracy')
  ) {
    return { brand: 'elas_tracy', brandName: 'Elas Tracy', confidence: 0.95 };
  }

  // Grupo SEO detection
  if (
    nome.includes('grupo seo') || nome.includes('gruposeo') ||
    domain.includes('gruposeo') || nicho === 'marketing'
  ) {
    return { brand: 'grupo_seo', brandName: 'Grupo SEO Marketing', confidence: 0.95 };
  }

  return { brand: 'generic', brandName: config.empresa_nome || 'Marca', confidence: 0.3 };
}

/**
 * Build brand-specific SEO+GEO system prompt section.
 */
export function buildBrandSEOGeoPrompt(brand: BrandDetectionResult, config?: ProjectConfig): string {
  const currentYear = new Date().getFullYear();

  const geoRules = `
## 🌐 OTIMIZAÇÃO GEO (IA Generativa: ChatGPT, Claude, Gemini, Perplexity)

### Parágrafo 1 — Resposta Direta (CRÍTICO para GEO):
- Primeiras 40-60 palavras DEVEM responder à pergunta/tema de forma completa e autossuficiente
- Este parágrafo será extraído por IAs generativas como citação
- Incluir dado estatístico verificável
- Formato: [Definição/Resposta] + [Dado estatístico] + [Contexto geográfico]

### H2s e H3s — Formato Pergunta Natural:
- Cada H2 deve ser formulado como pergunta natural (como as pessoas perguntam ao ChatGPT)
- Exemplo: "Quanto tempo demora um processo trabalhista em São Paulo?"
- NÃO usar formato SEO antigo: "Duração do processo trabalhista"

### Regras GEO Obrigatórias:
- Estatísticas verificáveis com fonte a cada 150-200 palavras
- Citações de especialistas com nome e credencial
- Formato: Pergunta → Resposta Direta → Detalhes → Fontes
- Tabelas comparativas em HTML semântico (<table><tr><td>)
- Definições claras no formato "X é..." para extração por IAs
- Listas estruturadas quando apropriado

### Metadados Obrigatórios:
- Title Tag: 50-60 caracteres | Keyword + Modificador + Localização
- Meta Description: 150-160 caracteres | Keyword + CTA + Diferencial
- URL Slug: Máximo 5 palavras, só keyword principal
- FAQPage Schema JSON-LD obrigatório (mínimo 5 perguntas)`;

  const seoTechRules = `
### SEO On-Page Avançado:
- Keyword no H1, primeiro parágrafo, 1 H2, meta title, meta description, alt da imagem
- Densidade: 1-2% (natural, nunca forçado)
- Keywords LSI: mínimo 8-12 termos semânticos espalhados naturalmente
- Links externos: MÁXIMO 3 (apenas .gov.br, .edu.br, fontes oficiais)
- Extensão: mínimo 1.500 palavras (informativos), 2.500+ (pillar pages)`;

  switch (brand.brand) {
    case 'rdm':
      return buildRDMPrompt(config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules;
    case 'elas_tracy':
      return buildElasTracyPrompt(config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules;
    case 'grupo_seo':
      return buildGrupoSEOPrompt(config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules;
    default:
      return buildGenericBrandPrompt(brand.brandName, config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules;
  }
}

function buildRDMPrompt(config: ProjectConfig | undefined, year: number): string {
  const siteUrl = config?.social_linktree || config?.wordpress_url || '';
  
  return `
## 🏛️ IDENTIDADE DA MARCA: RDM Advogados Associados

**Tom**: Direto, sem verniz, acessível à classe trabalhadora. Voz do Dr. Rândalos Madeira.
**Persona**: "Madeira Sem Verniz" — anti-guru, transparência radical.
**Bordão**: "Madeiraaa Nelesss!"
**Público**: Trabalhadores CLT, consumidores lesados, empresários de PME, pessoas comuns que precisam de justiça.
**Áreas**: Direito Trabalhista, Penal, Consumidor, Empresarial, Telecomunicações, Família.
**Localização**: São Paulo (Av. Paulista + Tatuapé). Atuação: 9 estados brasileiros.

### Compliance OAB (Provimento 205/2021):
- JAMAIS fazer promessas de resultado
- JAMAIS mencionar valores de causas
- JAMAIS usar linguagem comercial agressiva
- JAMAIS divulgar casos concretos com identificação
- SEMPRE: "consulte um advogado", informativo/educacional

### Formato de Título RDM:
- "[Situação urgente]? [Solução] — RDM Advogados São Paulo"
- "[Tema]: O Que a Lei Garante Para Você [${year}]"
- "[Número] Direitos Que Você Tem em [Situação] — Advogado Explica"

### Âncoras de Autoridade E-E-A-T (mínimo 3 por artigo):
- Mencionar "Dr. Rândalos Madeira" pelo menos 2x
- Mencionar "OAB"
- Mencionar pelo menos um endereço físico do escritório
- Citar pelo menos 1 artigo de lei com número
- Mencionar "9 estados"

### CTA Final RDM:
- WhatsApp direto + formulário de consulta (sem promessa de resultado)
- Site: ${siteUrl}`;
}

function buildElasTracyPrompt(config: ProjectConfig | undefined, year: number): string {
  return `
## 💅 IDENTIDADE DA MARCA: Elas Tracy

**Tom**: Empoderador, feminino, acolhedor, moderno, aspiracional mas acessível.
**Público**: Mulheres da Zona Leste de São Paulo (Tatuapé, Mooca, Penha, Anália Franco, Vila Carrão, Itaquera, São Mateus, Sapopemba).
**Áreas**: Beleza, estética, autoestima, cuidados pessoais.
**Localização**: EXCLUSIVAMENTE Zona Leste de São Paulo. Toda referência geográfica deve citar bairros da Zona Leste.
**Site**: www.elastracy.com.br

### Formato de Título Elas Tracy:
- "Limpeza de Pele na Zona Leste SP: Onde Fazer e Preços (${year})"
- "[Procedimento] no Tatuapé: [Benefício] Para Você (${year})"
- "[Número] Tratamentos de [Área] na Zona Leste SP — Elas Tracy"

### Regras Específicas:
- SEMPRE mencionar bairros da Zona Leste
- Linguagem empática e encorajadora
- Focar em autoestima e empoderamento feminino
- Incluir preços quando possível
- Evitar linguagem clínica/fria

### CTA Final Elas Tracy:
- Agendamento online + WhatsApp + Instagram
- Site: www.elastracy.com.br`;
}

function buildGrupoSEOPrompt(config: ProjectConfig | undefined, year: number): string {
  return `
## 📊 IDENTIDADE DA MARCA: Grupo SEO Marketing

**Tom**: Técnico mas acessível, autoridade digital, orientado a resultados mensuráveis.
**Público**: Advogados, médicos, dentistas, profissionais de beleza que querem crescer no digital.
**Áreas**: SEO, Google Ads, Gestão de Redes Sociais, Criação de Sites, Branding Digital.
**Localização**: São Paulo, atendimento nacional.

### Formato de Título Grupo SEO:
- "SEO para [Profissão]: Como Aparecer no Google em ${year}"
- "[Número] Estratégias de Marketing Digital para [Segmento] (${year})"
- "Google Ads para [Profissão]: [Resultado] em [Prazo]"

### Regras Específicas:
- Incluir dados de ROI e métricas mensuráveis
- Cases de sucesso (anonimizados se necessário)
- Comparativos de estratégias com prós e contras
- Linguagem orientada a resultados
- Demonstrar expertise técnica sem intimidar

### CTA Final Grupo SEO:
- Diagnóstico gratuito + WhatsApp
- Site: ${config?.wordpress_url || 'gruposeomarketing.com.br'}`;
}

function buildGenericBrandPrompt(brandName: string, config: ProjectConfig | undefined, year: number): string {
  return `
## 🏢 IDENTIDADE DA MARCA: ${brandName}

**Tom**: Profissional, acessível, orientado ao público-alvo.
${config?.empresa_endereco ? `**Localização**: ${config.empresa_endereco}` : ''}

### Formato de Título:
- "[Keyword Principal]: [Benefício] em [Localização] (${year})"

### CTA Final:
- WhatsApp + Site${config?.wordpress_url ? `: ${config.wordpress_url}` : ''}`;
}
