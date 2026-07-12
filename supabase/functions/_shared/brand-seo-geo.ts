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

// =================== SHARED HELPERS ===================

/**
 * Build social media links section from project config.
 * Used by ALL brand prompts to inject real social URLs.
 */
function buildSocialMediaSection(config?: ProjectConfig): string {
  if (!config) return '';

  const links: string[] = [];
  if (config.social_instagram) links.push(`- Instagram: ${config.social_instagram}`);
  if (config.social_youtube) links.push(`- YouTube: ${config.social_youtube}`);
  if (config.social_linkedin) links.push(`- LinkedIn: ${config.social_linkedin}`);
  if (config.social_twitter) links.push(`- X (Twitter): ${config.social_twitter}`);
  if (config.social_tiktok) links.push(`- TikTok: ${config.social_tiktok}`);
  if (config.social_google_maps) links.push(`- Google Maps: ${config.social_google_maps}`);
  if (config.social_linktree) links.push(`- Site / Linktree: ${config.social_linktree}`);

  if (links.length === 0) return '';

  return `
### Redes Sociais OBRIGATÓRIAS (citar TODAS no artigo):
${links.join('\n')}

**Regras de Citação de Redes Sociais:**
- Citar TODAS as redes configuradas acima em formato de LINK HTML clicável
- Formato OBRIGATÓRIO: <a href="URL_REAL" target="_blank" rel="noopener noreferrer">Nome da Rede</a>
- NUNCA inventar URLs — usar APENAS as URLs listadas acima
- Distribuir menções ao longo do artigo: introdução, meio e conclusão
- Se uma rede não está listada acima, NÃO a mencione`;
}

/**
 * Build CTAs section from project config.
 * Ensures CTAs use ONLY the configured text, never legal/juridical language.
 */
function buildCTASection(config?: ProjectConfig, brandContext?: string): string {
  if (!config) return '';

  const ctaLeads = config.cta_leads || '';
  const ctaConclusao = config.cta_conclusao || '';
  const ctaComunidade = config.cta_comunidade || '';
  const whatsapp = config.empresa_whatsapp || config.empresa_telefone || '';
  const site = config.social_linktree || config.wordpress_url || '';

  return `
### CTAs Estratégicos (usar os textos EXATOS configurados):

**CTA de Leads (usar no primeiro terço do artigo):**
${ctaLeads ? `"${ctaLeads}"` : 'Omitir se não configurado.'}

**CTA de Conclusão/Fechamento (usar na conclusão):**
${ctaConclusao ? `"${ctaConclusao}"` : 'Omitir se não configurado.'}

**CTA de Comunidade (usar no meio do artigo, se configurado):**
${ctaComunidade ? `"${ctaComunidade}"` : 'Omitir se não configurado.'}

${whatsapp ? `**WhatsApp:** ${whatsapp}` : ''}
${site ? `**Site:** ${site}` : ''}

### ⚠️ REGRAS DE CTA — PROIBIÇÕES ABSOLUTAS:
- NUNCA usar linguagem jurídica: "avalie seu caso", "consulte um advogado", "sem custo"
- NUNCA usar CTAs genéricos copiados de outro projeto/marca
- NUNCA inventar URLs para CTAs — usar APENAS as URLs configuradas acima
- NUNCA usar emojis de alerta (🚨) ou linguagem de urgência agressiva
- Se o CTA não está configurado, OMITIR — não inventar texto
- Os CTAs devem ser inseridos como HTML puro: <strong> e <a href>, NUNCA como markdown (**)

### Formato OBRIGATÓRIO dos CTAs no artigo (HTML PURO):
\`\`\`html
<p><strong>${ctaLeads || 'Texto do CTA'}</strong></p>
${site ? `<p><a href="${site}" target="_blank" rel="noopener noreferrer">${ctaConclusao || 'Acesse nosso site'}</a></p>` : ''}
\`\`\`

### FORMATO PROIBIDO (NUNCA usar):
- Negrito com asteriscos duplos
- Links entre colchetes e parênteses
- Emojis combinados com markdown
- Qualquer sintaxe que não seja HTML puro`;
}

/**
 * Build HTML output enforcement rules.
 * Prevents markdown leaking and JSON appearing in content.
 */
function buildOutputFormatRules(): string {
  return `
### 🚨 REGRAS DE FORMATO DE SAÍDA (CRÍTICO — APLICAR SEMPRE):

**O conteúdo DEVE ser 100% HTML SEMÂNTICO. ZERO markdown.**

✅ HTML CORRETO:
\`\`\`html
<h2>Título da seção</h2>
<p>Parágrafo com <strong>destaque</strong> em HTML.</p>
<p><a href="https://site.com" target="_blank" rel="noopener noreferrer">Texto do link</a></p>
<ul><li>Item da lista</li></ul>
\`\`\`

❌ MARKDOWN PROIBIDO (NUNCA usar no conteúdo):
\`\`\`
**texto em negrito** ← PROIBIDO, usar <strong>
[texto](url) ← PROIBIDO, usar <a href="url">
## Título ← PROIBIDO, usar <h2>
- Item ← PROIBIDO, usar <ul><li>
* Item ← PROIBIDO, usar <ul><li>
\`\`\`

### ❌ NUNCA incluir JSON, Schema, ou metadados dentro do conteúdo HTML:
- O JSON de schema_markup, faq_schema, tags, etc. NÃO vai dentro do <article>
- Schema JSON-LD é SEPARADO e vai em tags <script type="application/ld+json">
- Se o prompt pedir JSON estruturado, retorne-o FORA do conteúdo HTML
- O conteúdo visível ao leitor NUNCA deve conter código JSON

### Resultado esperado:
- Conteúdo em HTML semântico limpo, pronto para publicação WordPress
- SEM markdown, SEM JSON visível, SEM código-fonte exposto ao leitor`;
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
- Exemplo: "Quanto custa limpeza de pele na Zona Leste SP?"
- NÃO usar formato SEO antigo: "Preço da limpeza de pele"

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

  const outputRules = buildOutputFormatRules();

  switch (brand.brand) {
    case 'rdm':
      return buildRDMPrompt(config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules + '\n\n' + outputRules;
    case 'elas_tracy':
      return buildElasTracyPrompt(config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules + '\n\n' + outputRules;
    case 'grupo_seo':
      return buildGrupoSEOPrompt(config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules + '\n\n' + outputRules;
    default:
      return buildGenericBrandPrompt(brand.brandName, config, currentYear) + '\n\n' + geoRules + '\n\n' + seoTechRules + '\n\n' + outputRules;
  }
}

function buildRDMPrompt(config: ProjectConfig | undefined, year: number, contentHint?: string): string {
  const siteUrl = config?.social_linktree || config?.wordpress_url || '';

  // ============ INJEÇÃO GEO/AEO 2026 (RDM ONLY) ============
  // Lazy import via require-style — módulo puro sem dependências.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildGeo2026Block, detectLegalSubArea } = require('./geo-aeo-2026.ts');
  const subArea = detectLegalSubArea(contentHint || config?.empresa_nome || '');
  const isLocalUrgency = subArea === 'audiencia_custodia';
  const geo2026 = buildGeo2026Block({
    subArea,
    isLocalUrgency,
    attorneyName: 'Dr. Rândalos Madeira',
    officeAddress: config?.empresa_endereco || 'Av. Paulista, São Paulo/SP',
    officePhone: config?.empresa_telefone,
    officeWhatsapp: config?.empresa_whatsapp,
    siteUrl,
  });

  return `
## 🏛️ IDENTIDADE DA MARCA: RDM Advogados Associados

**Tom**: Direto, sem verniz, acessível à classe trabalhadora. Voz do Dr. Rândalos Madeira.
**Persona**: "Madeira Sem Verniz" — anti-guru, transparência radical.
**Bordão**: "Madeiraaa Nelesss!"
**Público**: Trabalhadores CLT, consumidores lesados, empresários de PME, pessoas comuns que precisam de justiça.
**Áreas**: Direito Penal Empresarial, Tributário, Consumidor, Empresarial, Digital (ISPs), Trabalhista, Família.
**Localização**: São Paulo (Av. Paulista + Tatuapé). Atuação: 9 estados brasileiros.

### Compliance OAB (Provimento 205/2021):
- JAMAIS fazer promessas de resultado
- JAMAIS mencionar valores de causas
- JAMAIS usar linguagem comercial agressiva
- JAMAIS divulgar casos concretos com identificação
- SEMPRE: "consulte um advogado", informativo/educacional

### Formato de Título RDM (2026 — pergunta natural + jurisdição):
- "[Pergunta natural sobre risco/direito] em São Paulo (${year}) — RDM Advogados"
- "[Tema]: O Que a Lei Garante Para Você em ${year}"
- "[Número] Direitos Que Você Tem em [Situação] — Advogado Penal Empresarial Explica"

### Âncoras de Autoridade E-E-A-T (mínimo 3 por artigo):
- Mencionar "Dr. Rândalos Madeira" pelo menos 2x
- Mencionar "OAB"
- Mencionar pelo menos um endereço físico do escritório
- Citar pelo menos 1 artigo de lei com número
- Mencionar "9 estados"

${buildSocialMediaSection(config)}

### CTA Final RDM:
- WhatsApp direto + formulário de consulta (sem promessa de resultado)
- Site: ${siteUrl}

${buildCTASection(config, 'RDM')}

${geo2026}`;
}

function buildElasTracyPrompt(config: ProjectConfig | undefined, year: number): string {
  const siteUrl = config?.social_linktree || config?.wordpress_url || 'https://elastracy.com.br';
  const googleMaps = config?.social_google_maps || '';
  const whatsapp = config?.empresa_whatsapp || config?.empresa_telefone || '';

  return `
## 💅 IDENTIDADE DA MARCA: Elas Tracy

**Tom**: Empoderador, feminino, acolhedor, moderno, aspiracional mas acessível. Linguagem próxima, como uma amiga que entende de beleza.
**Persona**: Especialista em beleza da Zona Leste que fala de igual para igual com suas clientes.
**Público-Alvo**: Mulheres da Zona Leste de São Paulo — trabalhadoras, mães, empreendedoras que querem se sentir bonitas e confiantes.
**Nicho**: Beleza, estética, autoestima, cuidados pessoais, procedimentos estéticos.
**Localização**: EXCLUSIVAMENTE Zona Leste de São Paulo.
**Bairros obrigatórios**: Tatuapé, Mooca, Penha, Anália Franco, Vila Carrão, Itaquera, São Mateus, Sapopemba.
**Site**: ${siteUrl}

### Formato de Título Elas Tracy:
- "[Procedimento] na Zona Leste SP: Guia Completo (${year})"
- "[Procedimento] no Tatuapé: [Benefício] Para Você (${year})"
- "[Número] Tratamentos de [Área] na Zona Leste SP — Elas Tracy"
- "Onde Fazer [Procedimento] na Zona Leste de São Paulo (${year})"
- "[Procedimento]: Preços, Resultados e Onde Fazer na ZL SP"

### Âncoras de Autoridade E-E-A-T (mínimo 4 por artigo):
- Mencionar "Elas Tracy" pelo menos 3x ao longo do artigo
- Mencionar localização física (Tatuapé) pelo menos 2x
- Mencionar "Zona Leste" ou "ZL SP" pelo menos 3x em contextos diferentes
- Mencionar pelo menos 3 bairros da Zona Leste naturalmente
- Citar experiência da equipe: "nossas especialistas", "profissionais qualificadas"
- Incluir referência a procedimentos com segurança: "profissionais certificados"
${googleMaps ? `- Incluir link para Google Maps: ${googleMaps}` : ''}

### Regras de Conteúdo Específicas:
- SEMPRE mencionar bairros da Zona Leste (mínimo 3 bairros por artigo)
- Linguagem empática, encorajadora e feminina
- Focar em autoestima, empoderamento feminino e autocuidado
- Incluir faixas de preço quando relevante ("a partir de R$...")
- Evitar linguagem clínica/fria — preferir tom de conversa entre amigas
- Usar "você" sempre — nunca "a cliente" ou "a paciente"
- Resultados: NUNCA prometer resultados absolutos ("resultados podem variar")
- Incluir dicas de cuidados em casa quando aplicável
- Mencionar tempo de duração dos procedimentos
- Falar sobre manutenção e frequência ideal

### ⚠️ PROIBIÇÕES ABSOLUTAS — Elas Tracy:
- NUNCA usar linguagem jurídica: "avalie seu caso", "consulte um advogado", "sem custo legal"
- NUNCA usar termos como "processo", "tribunal", "lei", "OAB" (exceto se o artigo for sobre regulamentação de estética)
- NUNCA usar CTAs de escritório de advocacia
- NUNCA usar tom institucional/formal — manter sempre acolhedor
- NUNCA inventar URLs de redes sociais
- NUNCA usar markdown (**negrito**, [link](url)) — APENAS HTML

### Compliance Estético (ANVISA/Vigilância Sanitária):
- Resultados podem variar de pessoa para pessoa
- Procedimentos devem ser realizados por profissionais qualificados
- Disclaimer: "Este conteúdo é informativo e não substitui consulta com profissional habilitado."
- NUNCA prometer cura, resultados permanentes ou milagrosos
- Diferenciar procedimentos estéticos de procedimentos médicos

${buildSocialMediaSection(config)}

${buildCTASection(config, 'Elas Tracy')}

### Estrutura de CTA Ideal — Elas Tracy (HTML PURO):
\`\`\`html
<!-- CTA de Leads (primeiro terço) -->
<p><strong>${config?.cta_leads || 'Agende seu procedimento!'}</strong></p>

<!-- CTA de Autoridade (meio do artigo) -->
<p>A <strong>Elas Tracy</strong>, localizada no <strong>Tatuapé</strong>, é referência em beleza e estética na Zona Leste de São Paulo.</p>

<!-- CTA de Fechamento (conclusão) -->
<p><strong>${config?.cta_conclusao || 'Fale com uma de nossas especialistas!'}</strong></p>
${siteUrl ? `<p><a href="${siteUrl}" target="_blank" rel="noopener noreferrer">Conheça a Elas Tracy</a></p>` : ''}
${whatsapp ? `<p>WhatsApp: <a href="https://wa.me/${whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer">${whatsapp}</a></p>` : ''}
${googleMaps ? `<p>📍 <a href="${googleMaps}" target="_blank" rel="noopener noreferrer">Veja nossa localização no Google Maps</a></p>` : ''}
\`\`\``;
}

function buildGrupoSEOPrompt(config: ProjectConfig | undefined, year: number): string {
  const siteUrl = config?.wordpress_url || config?.social_linktree || 'gruposeomarketing.com.br';
  const whatsapp = config?.empresa_whatsapp || config?.empresa_telefone || '';

  return `
## 📊 IDENTIDADE DA MARCA: Grupo SEO Marketing

**Tom**: Técnico mas acessível, autoridade digital, orientado a resultados mensuráveis. Como um consultor que simplifica o complexo.
**Persona**: Especialista em marketing digital que traduz dados em ações práticas.
**Público-Alvo**: Advogados, médicos, dentistas, profissionais de beleza, PMEs que querem crescer no digital.
**Nicho**: SEO, Google Ads, Gestão de Redes Sociais, Criação de Sites, Branding Digital, Marketing de Conteúdo.
**Localização**: São Paulo, com atendimento nacional.
**Site**: ${siteUrl}

### Formato de Título Grupo SEO:
- "SEO para [Profissão]: Como Aparecer no Google em ${year}"
- "[Número] Estratégias de Marketing Digital para [Segmento] (${year})"
- "Google Ads para [Profissão]: [Resultado] em [Prazo]"
- "Marketing Digital para [Segmento]: Guia Completo (${year})"
- "Como [Resultado Desejado] com Marketing Digital — Grupo SEO"

### Âncoras de Autoridade E-E-A-T (mínimo 4 por artigo):
- Mencionar "Grupo SEO Marketing" ou "Grupo SEO" pelo menos 3x
- Incluir dados de ROI e métricas mensuráveis (ex: "aumento de 300% no tráfego")
- Citar ferramentas e metodologias utilizadas (Google Analytics, Search Console, etc.)
- Mencionar experiência: "atendemos mais de X clientes", "especialistas em..."
- Incluir cases de sucesso anonimizados quando possível
- Citar certificações: Google Partner, Meta Business Partner, etc.

### Regras de Conteúdo Específicas:
- Incluir dados de ROI e métricas em TODAS as recomendações
- Cases de sucesso (anonimizados se necessário) com números reais
- Comparativos de estratégias com prós e contras em tabelas HTML
- Linguagem orientada a resultados: "aumento de X%", "redução de Y%"
- Demonstrar expertise técnica SEM intimidar o leitor
- Explicar termos técnicos: "CTR (taxa de cliques)", "CPC (custo por clique)"
- Incluir checklists práticos que o leitor pode aplicar imediatamente
- Mostrar diferencial competitivo em cada estratégia apresentada

### ⚠️ PROIBIÇÕES ABSOLUTAS — Grupo SEO:
- NUNCA usar linguagem jurídica: "avalie seu caso", "consulte um advogado"
- NUNCA usar termos como "processo", "tribunal", "OAB", "compliance jurídico"
- NUNCA usar CTAs de escritório de advocacia
- NUNCA prometer posições exatas no Google ("garantimos 1º lugar")
- NUNCA inventar URLs de redes sociais
- NUNCA usar markdown (**negrito**, [link](url)) — APENAS HTML

### Compliance Marketing Digital:
- NUNCA garantir posições específicas no Google
- NUNCA prometer resultados em prazo exato sem ressalvas
- Incluir: "Resultados dependem de diversos fatores como concorrência, investimento e mercado"
- Diferenciar entre orgânico (SEO) e pago (Ads) quando relevante
- Transparência sobre prazos realistas: "SEO mostra resultados a partir de 3-6 meses"

${buildSocialMediaSection(config)}

${buildCTASection(config, 'Grupo SEO')}

### Estrutura de CTA Ideal — Grupo SEO (HTML PURO):
\`\`\`html
<!-- CTA de Leads (primeiro terço) -->
<p><strong>${config?.cta_leads || 'Solicite seu diagnóstico digital gratuito!'}</strong></p>

<!-- CTA de Autoridade (meio do artigo) -->
<p>O <strong>Grupo SEO Marketing</strong> é especialista em estratégias digitais que geram resultados mensuráveis para profissionais e empresas em todo o Brasil.</p>

<!-- CTA de Fechamento (conclusão) -->
<p><strong>${config?.cta_conclusao || 'Fale com nossos especialistas!'}</strong></p>
${siteUrl ? `<p><a href="https://${siteUrl.replace(/^https?:\/\//, '')}" target="_blank" rel="noopener noreferrer">Conheça o Grupo SEO Marketing</a></p>` : ''}
${whatsapp ? `<p>WhatsApp: <a href="https://wa.me/${whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer">${whatsapp}</a></p>` : ''}
\`\`\``;
}

function buildGenericBrandPrompt(brandName: string, config: ProjectConfig | undefined, year: number): string {
  const siteUrl = config?.social_linktree || config?.wordpress_url || '';

  return `
## 🏢 IDENTIDADE DA MARCA: ${brandName}

**Tom**: Profissional, acessível, orientado ao público-alvo.
${config?.empresa_endereco ? `**Localização**: ${config.empresa_endereco}` : ''}

### Formato de Título:
- "[Keyword Principal]: [Benefício] em [Localização] (${year})"

${buildSocialMediaSection(config)}

${buildCTASection(config, brandName)}

### CTA Final:
- WhatsApp + Site${siteUrl ? `: ${siteUrl}` : ''}

### ⚠️ PROIBIÇÕES:
- NUNCA usar linguagem jurídica se o nicho não for jurídico
- NUNCA inventar URLs de redes sociais
- NUNCA usar markdown — APENAS HTML semântico`;
}
