
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { buildAdvancedSEOPrompt, type PromptConfig } from "../_shared/seo-prompt-builder.ts";
import { callAIStream, resolveModel } from "../_shared/gemini.ts";
import { runAgentPipeline, type AgentPipelineConfig } from "../_shared/agents/agent-pipeline.ts";
import { mapSegmentToSector } from "../_shared/sector-config.ts";
import { orchestrate } from "../_shared/verniz-orchestrator.ts";
import { setEnvKeysForUser } from "../_shared/byok-resolver.ts";
import { detectBrand, buildBrandSEOGeoPrompt } from "../_shared/brand-seo-geo.ts";
import { validateFrontloading } from "../_shared/geo-aeo-2026.ts";
import { resolvePoiForContent, type HyperlocalPoi } from "../_shared/hyperlocal-2026.ts";

const FUNCTION_NAME = "generate-article";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ArticleConfig {
  keyword: string;
  title?: string;
  secondaryKeywords: string;
  wordCount: 'short' | 'medium' | 'long' | 'very-long' | 'muito_pequeno' | 'pequeno' | 'medio' | 'grande';
  tone: string;
  pointOfView: string;
  language: string;
  type: 'blog' | 'sales';
  contentType?: 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'opinion' | 'news';
  segment?: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  goal?: 'inform' | 'convert' | 'educate' | 'engage';
  intentType?: 'informational' | 'navigational' | 'transactional' | 'commercial';
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  additionalInfo?: string;
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  includeMetaDescription?: boolean;
  seoOptimization: boolean;
  humanizeContent?: boolean;
  realtimeData?: boolean;
  customInstructions?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
  sourcesContext?: string;
  aiModel?: string;
  useAgentPipeline?: boolean;
  sectorType?: string;
  promptTemplateId?: string;
  targetFunction?: string;
  // Project ID for auto-fetching internal links
  projectId?: string;
  projectConfig?: {
    nicho?: string;
    compliance_rules?: string;
    empresa_nome?: string;
    empresa_telefone?: string;
    empresa_endereco?: string;
    empresa_whatsapp?: string;
    social_instagram?: string;
    social_youtube?: string;
    social_linkedin?: string;
    social_twitter?: string;
    social_tiktok?: string;
    social_google_maps?: string;
    social_linktree?: string;
    cta_comunidade?: string;
    cta_conclusao?: string;
    cta_leads?: string;
  };
}

// Auto-fetch internal links from the project's WordPress article index
async function autoFetchInternalLinks(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  keyword: string,
  userId: string,
): Promise<Array<{ anchor: string; url: string; type?: string }>> {
  const links: Array<{ anchor: string; url: string; type?: string }> = [];

  try {
    // 1. Fetch published articles from WordPress index (prioritize by relevance)
    const { data: wpArticles } = await supabase
      .from('wordpress_article_index')
      .select('wp_post_title, wp_post_url, primary_keyword, word_count, wp_post_status')
      .eq('project_id', projectId)
      .eq('wp_post_status', 'publish')
      .order('word_count', { ascending: false })
      .limit(50);

    if (wpArticles && wpArticles.length > 0) {
      const keywordLower = keyword.toLowerCase();
      
      // Score each article by relevance to the current keyword
      const scored = wpArticles.map(a => {
        const titleLower = (a.wp_post_title || '').toLowerCase();
        const pkLower = (a.primary_keyword || '').toLowerCase();
        let score = 0;
        
        // Exact keyword match in title or primary_keyword
        if (titleLower.includes(keywordLower) || pkLower.includes(keywordLower)) score += 10;
        
        // Word overlap
        const kwWords = keywordLower.split(/\s+/);
        const titleWords = titleLower.split(/\s+/);
        const overlap = kwWords.filter(w => w.length > 3 && titleWords.some(tw => tw.includes(w))).length;
        score += overlap * 3;
        
        // Pillar pages (longer content = more authority)
        if ((a.word_count || 0) > 2000) score += 5;
        
        return { ...a, score };
      });

      // Sort by relevance, take top 15
      scored.sort((a, b) => b.score - a.score);
      const topArticles = scored.slice(0, 15);

      for (const article of topArticles) {
        const isPillar = (article.word_count || 0) > 2000;
        links.push({
          anchor: article.primary_keyword || article.wp_post_title,
          url: article.wp_post_url,
          type: isPillar ? 'pillar' : 'cluster',
        });
      }
    }

    // 2. Also fetch recent platform articles from the same project (published/ready)
    const { data: platformArticles } = await supabase
      .from('articles')
      .select('title, slug, keyword, published_url, word_count, status')
      .eq('project_id', projectId)
      .in('status', ['published', 'ready'])
      .not('published_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (platformArticles && platformArticles.length > 0) {
      for (const article of platformArticles) {
        if (!article.published_url) continue;
        // Don't duplicate URLs already added from WP index
        if (links.some(l => l.url === article.published_url)) continue;
        
        links.push({
          anchor: article.keyword || article.title || '',
          url: article.published_url,
          type: 'recent',
        });
      }
    }

    // 3. Fetch keyword_link_rules for the project
    const { data: linkRules } = await supabase
      .from('keyword_link_rules')
      .select('keyword, target_url, target_title, priority')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(10);

    if (linkRules && linkRules.length > 0) {
      for (const rule of linkRules) {
        if (links.some(l => l.url === rule.target_url)) continue;
        links.push({
          anchor: rule.keyword,
          url: rule.target_url,
          type: 'resource',
        });
      }
    }
  } catch (err) {
    console.error('[generate-article] Auto-fetch internal links error:', err);
  }

  return links;
}

// Word count ranges - supports both legacy and new values
const wordCountRanges: Record<string, { min: number; max: number }> = {
  // Legacy values
  short: { min: 600, max: 1000 },
  medium: { min: 1200, max: 1800 },
  long: { min: 2200, max: 2800 },
  'very-long': { min: 3500, max: 4500 },
  // New standardized values
  muito_pequeno: { min: 600, max: 1200 },
  pequeno: { min: 1200, max: 2400 },
  medio: { min: 2400, max: 3600 },
  grande: { min: 2600, max: 5200 },
};

const pointOfViewMap: Record<string, string> = {
  nos: "primeira pessoa do plural (nós)",
  voce: "segunda pessoa (você)",
  ele: "terceira pessoa",
  primeira: "primeira pessoa do singular (eu)",
  segunda: "segunda pessoa (você)",
  terceira: "terceira pessoa",
};

// Legacy prompt builder for backward compatibility
function buildLegacySystemPrompt(config: ArticleConfig): string {
  const wordRange = wordCountRanges[config.wordCount];
  const pov = pointOfViewMap[config.pointOfView] || "segunda pessoa (você)";
  
  let systemPrompt = `Você é um redator SEO especialista em criar conteúdo de alta qualidade para ranquear no Google. 

REGRAS IMPORTANTES:
- Escreva em português brasileiro (${config.language})
- Use o tom "${config.tone}"
- Use ${pov}
- O artigo deve ter entre ${wordRange.min} e ${wordRange.max} palavras
- Use APENAS HTML semântico: <h2>, <h3>, <p>, <strong>, <ul>, <li>, <ol>, <table>, <a href="...">
- NUNCA use markdown: **negrito**, [link](url), ## título, - item
- A palavra-chave principal "${config.keyword}" deve aparecer naturalmente no título, introdução, headers e conclusão
- Otimize para SEO: use variações semânticas, escreva parágrafos curtos, use headers descritivos`;

  if (config.secondaryKeywords) {
    systemPrompt += `\n- Incorpore naturalmente as seguintes palavras-chave secundárias: ${config.secondaryKeywords}`;
  }

  if (config.includeFaq) {
    systemPrompt += `\n- Inclua uma seção de FAQ com ${config.faqCount} perguntas frequentes ao final`;
  }

  if (config.includeTable) {
    systemPrompt += `\n- Inclua pelo menos uma tabela comparativa ou informativa quando relevante`;
  }

  if (config.includeList) {
    systemPrompt += `\n- Use listas (bullet points ou numeradas) para organizar informações importantes`;
  }

  if (config.includeConclusion) {
    systemPrompt += `\n- Finalize com uma conclusão que resume os pontos principais e inclui um call-to-action`;
  }

  if (config.type === 'sales') {
    systemPrompt += `\n\nEste é um artigo de página de vendas. Informações do negócio:`;
    if (config.companyName) systemPrompt += `\n- Empresa: ${config.companyName}`;
    if (config.companyPhone) systemPrompt += `\n- Telefone: ${config.companyPhone}`;
    if (config.companyAddress) systemPrompt += `\n- Endereço: ${config.companyAddress}`;
    if (config.targetAudience) systemPrompt += `\n- Público-alvo: ${config.targetAudience}`;
    if (config.painPoints) systemPrompt += `\n- Dores do cliente: ${config.painPoints}`;
    if (config.differentials) systemPrompt += `\n- Diferenciais: ${config.differentials}`;
    if (config.ctaObjective) systemPrompt += `\n- Objetivo do CTA: ${config.ctaObjective}`;
    systemPrompt += `\n\nFoque em persuasão, benefícios, prova social e CTAs claros.`;
  }

  if (config.customInstructions) {
    systemPrompt += `\n\nInstruções adicionais do usuário:\n${config.customInstructions}`;
  }

  // Auto-injected internal links (backlinks)
  if (config.internalLinks && config.internalLinks.length > 0) {
    const minLinks = Math.max(4, Math.min(10, config.internalLinks.length));
    systemPrompt += `\n\n## LINKS INTERNOS OBRIGATÓRIOS (BACKLINKS) — REGRA INEGOCIÁVEL
Distribua os seguintes links NATURALMENTE ao longo do artigo. Use anchor text variado.
Cada link deve usar: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora</a>

MÍNIMO: 4 links internos | MÁXIMO: 10 links internos | IDEAL: ${minLinks}
LINKS DISPONÍVEIS (use no MÍNIMO ${minLinks} deles):
${config.internalLinks.slice(0, 20).map((l, i) => `${i + 1}. "${l.anchor}" → ${l.url}`).join('\n')}

REGRAS DE DISTRIBUIÇÃO:
- 1-2 links na introdução (primeiros 2 parágrafos)
- 4-6 links no corpo do artigo (distribuídos entre as seções H2)
- 1-2 links na conclusão
- VARIE o anchor text: use sinônimos, parciais e contextuais (não repita o mesmo texto)
- Links devem ser CONTEXTUAIS: inseridos em frases que façam sentido semântico`;
  }

  return systemPrompt;
}

// Check if config has advanced fields - safely handle undefined values
function hasAdvancedConfig(config: ArticleConfig): boolean {
  return !!(config?.segment || config?.contentType || config?.intentType || config?.goal);
}

// Substitute template variables with actual values
function substituteTemplateVariables(template: string, config: ArticleConfig): string {
  const wordRange = wordCountRanges[config.wordCount] || wordCountRanges['medium'];
  const pov = pointOfViewMap[config.pointOfView] || "segunda pessoa (você)";
  
  return template
    .replace(/\$\{title\}/g, config.title || config.keyword || '')
    .replace(/\$\{language\}/g, config.language || 'Português Brasileiro')
    .replace(/\$\{idioma\}/g, config.language || 'Português Brasileiro')
    .replace(/\$\{currentYear\}/g, String(new Date().getFullYear()))
    .replace(/\$\{articleLength\}/g, `${wordRange.min}-${wordRange.max} palavras`)
    .replace(/\$\{tone\}/g, config.tone || 'profissional')
    .replace(/\$\{pov\}/g, pov)
    .replace(/\$\{contextSection\}/g, config.sourcesContext || '')
    .replace(/\$\{sourcesContext\}/g, config.sourcesContext || '')
    .replace(/\$\{context\}/g, config.additionalInfo || '');
}

// ====== AUTO-DETECT SPECIALIZED AGENT FROM KEYWORD/TITLE ======
interface AgentDetectionResult {
  detectedFunction: string;
  confidence: number;
  reason: string;
}

const AGENT_DETECTION_RULES: Array<{
  targetFunction: string;
  patterns: RegExp[];
  keywords: string[];
  label: string;
}> = [
  {
    targetFunction: 'blog_architecture',
    patterns: [
      /topic\s*cluster/i, /pillar\s*page/i, /arquitetura\s*(de|do)\s*(blog|conteúdo|site)/i,
      /calendário\s*editorial/i, /planej(ar|amento)\s*(de\s*)?(blog|conteúdo)/i,
      /cluster\s*(de\s*)?conteúdo/i, /estratégia\s*(de\s*)?conteúdo/i,
      /mapeamento\s*(de\s*)?(temas|tópicos|blog)/i, /internal\s*link(ing)?\s*matrix/i,
    ],
    keywords: ['topic cluster', 'pillar page', 'calendário editorial', 'arquitetura de blog',
      'cluster de conteúdo', 'estratégia de conteúdo', 'planejamento de blog',
      'mapeamento de temas', 'internal linking matrix', 'construir blog'],
    label: 'Construtor de Blogs & Clusters',
  },
  {
    targetFunction: 'seo_audit',
    patterns: [
      /audit(ar|oria)\s*(seo|técnica|de\s*site)/i, /core\s*web\s*vitals/i,
      /indexação|indexing/i, /robots\.txt/i, /sitemap/i,
      /crawl(er|abilidade|ability)/i, /diagnóstico\s*(seo|técnico)/i,
      /performance\s*(do\s*)?(site|web)/i, /schema\s*valid(ation|ação)/i,
      /e-?e-?a-?t/i, /visibilidade\s*(em|para)\s*(ia|ai|buscadores)/i,
    ],
    keywords: ['auditoria seo', 'audit seo', 'core web vitals', 'indexação',
      'robots.txt', 'sitemap', 'crawlabilidade', 'diagnóstico seo',
      'performance do site', 'schema validation', 'eeat', 'visibilidade ia',
      'crawlers de ia', 'rastreadores de ia', 'lcp', 'inp', 'cls'],
    label: 'Auditor SEO & Indexação',
  },
  {
    targetFunction: 'metadata_schema',
    patterns: [
      /metadados|metadata/i, /schema\s*markup/i, /json-?ld/i,
      /open\s*graph/i, /og\s*tags/i, /twitter\s*card/i,
      /title\s*tag/i, /meta\s*description/i, /structured\s*data/i,
      /rich\s*snippet/i, /dados\s*estruturados/i,
    ],
    keywords: ['metadados', 'metadata', 'schema markup', 'json-ld', 'open graph',
      'og tags', 'twitter card', 'title tag', 'meta description', 'rich snippet',
      'dados estruturados', 'structured data', 'schema seo'],
    label: 'Metadados & Schema Markup',
  },
];

function autoDetectAgent(keyword: string, title?: string): AgentDetectionResult {
  const text = `${title || ''} ${keyword}`.toLowerCase().trim();
  
  for (const rule of AGENT_DETECTION_RULES) {
    // Check regex patterns first (higher confidence)
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return {
          detectedFunction: rule.targetFunction,
          confidence: 0.9,
          reason: `Pattern match for ${rule.label}`,
        };
      }
    }
    // Check keyword substring match (lower confidence)
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return {
          detectedFunction: rule.targetFunction,
          confidence: 0.75,
          reason: `Keyword match "${kw}" for ${rule.label}`,
        };
      }
    }
  }

  // Default: article_generator
  return { detectedFunction: 'article_generator', confidence: 1.0, reason: 'Default article generator' };
}

// ====== CRIMINAL LAW GEO-TARGETED CONTENT DETECTION ======
const CRIMINAL_LAW_PATTERNS = [
  /advogado\s*criminal(ista)?/i, /defesa\s*criminal/i, /direito\s*criminal/i,
  /direito\s*penal/i, /advogado\s*penal(ista)?/i, /criminalista/i,
  /defensor\s*criminal/i, /crime|crimes/i, /réu|acusado|preso/i,
  /prisão|preso|detido|flagrante/i, /habeas\s*corpus/i, /fiança/i,
  /tribunal\s*do\s*j[úu]ri/i, /delegacia/i, /inquérito\s*policial/i,
  /tráfico\s*de\s*drogas/i, /roubo|furto|assalto|latrocínio/i,
  /homicídio|feminicídio|lesão\s*corporal/i, /estelionato/i,
  /audiência\s*de\s*custódia/i, /liberdade\s*provisória/i,
  /medida\s*protetiva/i, /violência\s*doméstica/i, /lei\s*maria\s*da\s*penha/i,
  /execução\s*penal/i, /progressão\s*de\s*regime/i, /alvará\s*de\s*soltura/i,
  /advocacia\s*criminal/i, /escritório\s*(de\s*)?advocacia\s*criminal/i,
];

function isCriminalLawKeyword(keyword: string, title?: string): boolean {
  const text = `${keyword} ${title || ''}`.toLowerCase();
  return CRIMINAL_LAW_PATTERNS.some(p => p.test(text));
}

function buildCriminalLawGeoPrompt(keyword: string): string {
  return `

ESTRATÉGIA GEO CRIMINAL — SÃO PAULO (AUTO-DETECTADO)
=====================================================
A keyword "${keyword}" foi identificada como conteúdo de DIREITO CRIMINAL/PENAL.
Aplique OBRIGATORIAMENTE as seguintes diretrizes de geolocalização e AEO:

REGIÕES DE SÃO PAULO (mencionar estrategicamente no artigo):
- ZONA LESTE: Tatuapé, Mooca, Penha, Itaquera, São Mateus, Sapopemba, Guaianases, Cidade Tiradentes, Ermelino Matarazzo, São Miguel Paulista, Vila Prudente, Aricanduva, Itaim Paulista
- ZONA SUL: Santo Amaro, Jabaquara, Interlagos, Campo Limpo, Capão Redondo, Jardim Ângela, Grajaú, Socorro, Cidade Ademar, Pedreira, Parelheiros
- ZONA NORTE: Santana, Tucuruvi, Casa Verde, Vila Maria, Jaçanã, Tremembé, Brasilândia, Freguesia do Ó, Pirituba, Vila Medeiros
- ZONA OESTE: Pinheiros, Lapa, Butantã, Perdizes, Vila Madalena, Jaguaré, Rio Pequeno, Raposo Tavares
- CENTRO: Sé, República, Liberdade, Bela Vista, Santa Cecília, Bom Retiro, Brás, Consolação
- GRANDE SÃO PAULO: Guarulhos, Osasco, São Bernardo do Campo, Santo André, São Caetano do Sul, Diadema, Mauá, Suzano, Mogi das Cruzes, Taboão da Serra, Barueri, Cotia, Carapicuíba, Itaquaquecetuba, Ferraz de Vasconcelos, Poá, Arujá, Francisco Morato, Franco da Rocha, Caieiras

TERMOS DE BUSCA OBRIGATÓRIOS (incluir como H2/H3 e no corpo do texto):
- "melhor advogado criminalista São Paulo"
- "advogado criminal zona leste SP"
- "advogado criminalista Guarulhos"
- "advogado penal zona sul São Paulo"
- "escritório de advocacia criminal SP"
- "em quem confiar para defesa criminal SP"
- "qual melhor advogado criminalista perto de mim"
- "advogado 24h criminal São Paulo"
- "advogado habeas corpus SP urgente"
- "defesa criminal audiência de custódia SP"

OTIMIZAÇÃO PARA CITAÇÃO POR IAs (AEO CRIMINAL):
Subtítulos H2/H3 devem responder DIRETAMENTE perguntas que usuários fazem a ChatGPT, Gemini e Claude:
- "Qual o melhor advogado criminalista de São Paulo?"
- "Onde encontrar advogado criminal na zona leste de SP?"
- "Quanto custa um advogado criminalista em São Paulo?"
- "Como escolher um bom advogado de defesa criminal?"
- "Preciso de advogado criminalista urgente, o que fazer?"
- "Quais os melhores escritórios de advocacia criminal de SP?"
- "Advogado criminalista em Guarulhos, quem recomenda?"
- "Como funciona a audiência de custódia em São Paulo?"

LEAD AEO (primeiras 40-60 palavras):
O primeiro parágrafo DEVE ser uma resposta completa e autossuficiente que IAs possam extrair diretamente.
Exemplo: "Se você precisa de um advogado criminalista em São Paulo, [EMPRESA] atua na zona leste, zona sul e Grande SP com atendimento 24h para casos de flagrante, habeas corpus e audiência de custódia."

SCHEMAS JSON-LD OBRIGATÓRIOS PARA CRIMINAL:
1. Attorney Schema (LegalService) com:
   - areaServed: São Paulo, Guarulhos, ABCD
   - serviceArea: zona leste, zona sul, zona norte, zona oeste
   - availableService: "Defesa Criminal", "Habeas Corpus", "Audiência de Custódia"
   - priceRange: "$$"
2. FAQPage Schema com 5+ perguntas sobre advogado criminalista SP
3. BreadcrumbList Schema
4. LocalBusiness Schema com endereço e telefone (se disponíveis no projeto)

REGRAS ESPECIAIS CRIMINAL:
- NUNCA prometer resultado em processo criminal (vedação ética OAB)
- Usar linguagem acessível para pessoas em situação de vulnerabilidade
- Incluir informações sobre direitos do preso/acusado
- Mencionar atendimento URGENTE/24h quando aplicável
- Incluir telefone/WhatsApp como CTA principal
- Referenciar delegacias e fóruns da região mencionada
- Incluir seção "Seus Direitos" com linguagem simples
- Citar artigos do Código Penal e CPP quando relevante`;
}


// Fetch user's prompt template from database
async function fetchUserTemplate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  templateId?: string,
  targetFunction?: string,
): Promise<string | null> {
  try {
    // Priority 1: specific template by ID
    if (templateId) {
      const { data } = await supabase
        .from('prompt_templates')
        .select('prompt')
        .eq('id', templateId)
        .eq('user_id', userId)
        .single();
      if (data?.prompt) return data.prompt;
    }

    // Priority 2: default template for the target function
    const funcTarget = targetFunction || 'article_generator';
    const { data } = await supabase
      .from('prompt_templates')
      .select('prompt')
      .eq('user_id', userId)
      .eq('target_function', funcTarget)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();
    
    if (data?.prompt) return data.prompt;

    // Priority 3: any template for the target function
    const { data: fallback } = await supabase
      .from('prompt_templates')
      .select('prompt')
      .eq('user_id', userId)
      .eq('target_function', funcTarget)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return fallback?.prompt || null;
  } catch {
    return null;
  }
}

// Build prompt config for advanced system with safe defaults
function buildPromptConfig(config: ArticleConfig): PromptConfig {
  // Safely parse secondary keywords
  let secondaryKeywords: string[] = [];
  if (config.secondaryKeywords) {
    if (typeof config.secondaryKeywords === 'string') {
      secondaryKeywords = config.secondaryKeywords.split(',').map(k => k.trim()).filter(Boolean);
    } else if (Array.isArray(config.secondaryKeywords)) {
      secondaryKeywords = config.secondaryKeywords;
    }
  }

  return {
    title: config.title || config.keyword || '',
    keyword: config.keyword || '',
    secondaryKeywords,
    language: config.language || 'Português Brasileiro',
    currentYear: new Date().getFullYear(),
    articleLength: config.wordCount || 'medium',
    tone: config.tone || 'profissional',
    pointOfView: config.pointOfView || 'voce',
    contentType: config.contentType || 'how-to',
    segment: config.segment || 'general',
    goal: config.goal || 'inform',
    intentType: config.intentType || 'informational',
    includeFaq: config.includeFaq ?? true,
    faqCount: config.faqCount || 5,
    includeTable: config.includeTable ?? false,
    includeList: config.includeList ?? true,
    includeConclusion: config.includeConclusion ?? true,
    includeMetaDescription: config.includeMetaDescription ?? true,
    internalLinks: config.internalLinks || [],
    sourcesContext: config.sourcesContext || '',
    companyName: config.companyName || '',
    companyPhone: config.companyPhone || '',
    companyAddress: config.companyAddress || '',
    targetAudience: config.targetAudience || '',
    painPoints: config.painPoints || '',
    differentials: config.differentials || '',
    ctaObjective: config.ctaObjective || '',
    additionalInfo: config.additionalInfo || '',
    seoOptimization: config.seoOptimization ?? true,
    humanizeContent: config.humanizeContent ?? false,
    realtimeData: config.realtimeData ?? false,
  };
}

/**
 * Consume an SSE stream body from callAIStream() and return the concatenated
 * assistant content. Used to buffer output for post-generation validation
 * (frontloading regeneration on RDM brand).
 */
async function consumeSSEContent(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') continue;
      try {
        const parsed = JSON.parse(json);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') content += delta;
      } catch { /* ignore partial */ }
    }
  }
  return content;
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.requestStart(req.method);

    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.authFailure("missing_or_invalid_header");
      return new Response(
        JSON.stringify({ error: "Autorização necessária" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's auth token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // IMPORTANT: In Edge Functions there is no session storage; pass the JWT explicitly.
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      log.authFailure(authError?.message || "user_not_found");
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    log.authSuccess(user.id);
    // ========== END AUTHENTICATION ==========

    // Load user's BYOK API keys into environment for this request
    await setEnvKeysForUser(user.id);

    const { config, projectId: bodyProjectId, articleId: bodyArticleId, source: bodySource } = await req.json() as { config: ArticleConfig; projectId?: string; articleId?: string; source?: string };
    const effectiveProjectId = config.projectId || bodyProjectId;
    const historyArticleId = bodyArticleId ?? null;
    const historySource = bodySource || 'single';

    // Trackers for hyperlocal generation history (populated below)
    let pickedTitleCategory: string | null = null;
    let injectedFewShotExamples: string[] = [];

    // ====== AUTO-FETCH INTERNAL LINKS from project if not manually provided ======
    if (effectiveProjectId && (!config.internalLinks || config.internalLinks.length < 3)) {
      log.info("auto_fetching_internal_links", { projectId: effectiveProjectId });
      const autoLinks = await autoFetchInternalLinks(supabase, effectiveProjectId, config.keyword, user.id);
      if (autoLinks.length > 0) {
        // Merge with any manually provided links
        const existingUrls = new Set((config.internalLinks || []).map(l => l.url));
        const newLinks = autoLinks.filter(l => !existingUrls.has(l.url));
        config.internalLinks = [...(config.internalLinks || []), ...newLinks];
        log.info("internal_links_auto_injected", { 
          manual: existingUrls.size, 
          auto: newLinks.length, 
          total: config.internalLinks.length 
        });
      }
    }

    // ====== BRAND DETECTION: Auto-detect brand from project config ======
    const brandDetection = detectBrand(config.projectConfig ? {
      empresa_nome: config.projectConfig.empresa_nome,
      nicho: config.projectConfig.nicho,
      wordpress_url: undefined, // not in projectConfig interface
      social_instagram: config.projectConfig.social_instagram,
      social_linktree: config.projectConfig.social_linktree,
      empresa_telefone: config.projectConfig.empresa_telefone,
      empresa_endereco: config.projectConfig.empresa_endereco,
      empresa_whatsapp: config.projectConfig.empresa_whatsapp,
      cta_comunidade: config.projectConfig.cta_comunidade,
      cta_conclusao: config.projectConfig.cta_conclusao,
      cta_leads: config.projectConfig.cta_leads,
    } : undefined);
    
    // ====== HYPERLOCAL POI RESOLUTION (RDM only) ======
    let hyperlocalPoi: HyperlocalPoi | null = null;
    const contentHint = [config.title, config.keyword, config.secondaryKeywords].filter(Boolean).join(' | ');
    if (brandDetection.brand === 'rdm') {
      try {
        hyperlocalPoi = await resolvePoiForContent(supabase, user.id, contentHint);
        if (hyperlocalPoi) {
          log.info("hyperlocal_poi_matched", {
            poi_id: hyperlocalPoi.id,
            poi_type: hyperlocalPoi.poi_type,
            poi_name: hyperlocalPoi.name,
            city: hyperlocalPoi.city,
          });
        }
      } catch (e) {
        log.warn("hyperlocal_poi_resolve_failed", { error: (e as Error).message });
      }
    }

    // ====== HYPERLOCAL TEMPLATE OVERRIDE (RDM only) ======
    let hyperlocalTemplateOverride: string | null = null;
    if (brandDetection.brand === 'rdm' && hyperlocalPoi) {
      const { poiTypeToTemplateKind } = await import("../_shared/hyperlocal-2026.ts");
      const kind = poiTypeToTemplateKind(hyperlocalPoi.poi_type);
      const { data: tpl } = await supabase
        .from('hyperlocal_template_overrides')
        .select('content, is_active')
        .eq('user_id', user.id)
        .eq('template_kind', kind)
        .eq('is_active', true)
        .maybeSingle();
      if (tpl?.content) {
        hyperlocalTemplateOverride = tpl.content as string;
        log.info("hyperlocal_template_override_applied", { kind });
      }
    }

    const brandSEOGeoSection = buildBrandSEOGeoPrompt(
      brandDetection,
      config.projectConfig
        ? {
            empresa_nome: config.projectConfig.empresa_nome,
            wordpress_url: undefined,
            social_instagram: config.projectConfig.social_instagram,
            social_youtube: config.projectConfig.social_youtube,
            social_linkedin: config.projectConfig.social_linkedin,
            social_twitter: config.projectConfig.social_twitter,
            social_tiktok: config.projectConfig.social_tiktok,
            social_google_maps: config.projectConfig.social_google_maps,
            social_linktree: config.projectConfig.social_linktree,
            empresa_telefone: config.projectConfig.empresa_telefone,
            empresa_endereco: config.projectConfig.empresa_endereco,
            empresa_whatsapp: config.projectConfig.empresa_whatsapp,
            cta_comunidade: config.projectConfig.cta_comunidade,
            cta_conclusao: config.projectConfig.cta_conclusao,
            cta_leads: config.projectConfig.cta_leads,
          }
        : undefined,
      { contentHint, hyperlocalPoi, hyperlocalTemplateOverride },
    );

    log.info("brand_detected", {
      brand: brandDetection.brand,
      brandName: brandDetection.brandName,
      confidence: brandDetection.confidence,
    });

    // ====== ZICAJURIS ORCHESTRATOR: Detect nicho, compliance, gatilho ======
    const orchestration = orchestrate(
      config.title || config.keyword,
      config.keyword,
      config.projectConfig || undefined
    );
    log.info("verniz_orchestration", {
      nicho: orchestration.nichoDetectado.nicho,
      compliance: orchestration.nichoDetectado.compliance,
      gatilho: orchestration.gatilho.gatilho,
      angulo: orchestration.angulo.angulo,
    });

    // ====== CHECK IF AGENT PIPELINE SHOULD BE USED ======
    const sectorType = config.sectorType || config.segment;
    const shouldUseAgentPipeline = config.useAgentPipeline && sectorType && mapSegmentToSector(sectorType);

    if (shouldUseAgentPipeline) {
      log.info("using_agent_pipeline", { sector: sectorType, keyword: config.keyword });

      // Parse secondary keywords
      let secondaryKeywords: string[] = [];
      if (config.secondaryKeywords) {
        secondaryKeywords = typeof config.secondaryKeywords === 'string'
          ? config.secondaryKeywords.split(',').map(k => k.trim()).filter(Boolean)
          : Array.isArray(config.secondaryKeywords) ? config.secondaryKeywords : [];
      }

      const pipelineConfig: AgentPipelineConfig = {
        keyword: config.keyword,
        title: config.title,
        secondaryKeywords,
        sector: sectorType!,
        language: config.language || 'Português Brasileiro',
        tone: config.tone || 'profissional',
        pointOfView: config.pointOfView || 'voce',
        wordCount: config.wordCount || 'medium',
        contentType: config.contentType,
        goal: config.goal,
        intentType: config.intentType,
        companyName: config.companyName,
        companyPhone: config.companyPhone,
        companyAddress: config.companyAddress,
        differentials: config.differentials,
        targetAudience: config.targetAudience,
        painPoints: config.painPoints,
        ctaObjective: config.ctaObjective,
        includeFaq: config.includeFaq ?? true,
        faqCount: config.faqCount || 5,
        includeTable: config.includeTable ?? false,
        includeList: config.includeList ?? true,
        includeConclusion: config.includeConclusion ?? true,
        internalLinks: config.internalLinks,
        useAgentPipeline: true,
      };

      const result = await runAgentPipeline(pipelineConfig);
      
      log.info("agent_pipeline_complete", { providersUsed: result.providersUsed });
      log.requestEnd(200, Date.now() - startTime);

      // Return as SSE-compatible stream (single chunk)
      const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content: result.content } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(sseData, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ====== AUTO-DETECT SPECIALIZED AGENT ======
    let resolvedTargetFunction = config.targetFunction;
    
    if (!config.promptTemplateId && (!config.targetFunction || config.targetFunction === 'article_generator')) {
      const detection = autoDetectAgent(config.keyword, config.title);
      if (detection.detectedFunction !== 'article_generator') {
        resolvedTargetFunction = detection.detectedFunction;
        log.info("agent_auto_detected", {
          detected: detection.detectedFunction,
          confidence: detection.confidence,
          reason: detection.reason,
          keyword: config.keyword,
        });
      }
    }

    // ====== FETCH USER'S PROMPT TEMPLATE FROM DATABASE ======
    const userTemplate = await fetchUserTemplate(
      supabase,
      user.id,
      config.promptTemplateId,
      resolvedTargetFunction,
    );

    // ====== CRIMINAL LAW GEO AUTO-INJECTION ======
    const criminalGeoSection = isCriminalLawKeyword(config.keyword, config.title)
      ? buildCriminalLawGeoPrompt(config.keyword)
      : '';
    
    if (criminalGeoSection) {
      log.info("criminal_law_geo_detected", { keyword: config.keyword });
    }

    // ====== STANDARD FLOW with Verniz DNA + Brand SEO+GEO + Criminal GEO injection ======
    let systemPrompt: string;
    let userPrompt: string;

    if (userTemplate) {
      // USE USER'S CUSTOM TEMPLATE with variable substitution
      systemPrompt = substituteTemplateVariables(userTemplate, config) 
        + '\n\n' + brandSEOGeoSection 
        + '\n\n' + orchestration.vernizSection
        + criminalGeoSection;
      userPrompt = `Escreva um artigo completo e otimizado para SEO e GEO (IA Generativa) sobre: "${config.keyword}"
${config.title ? `\nTítulo sugerido: "${config.title}"` : ''}
${config.sourcesContext ? `\nContexto adicional:\n${config.sourcesContext}` : ''}

Comece com <!-- META_DESCRIPTION: ... --> na primeira linha:`;
      log.info("using_user_template_with_brand_geo", { 
        brand: brandDetection.brand, 
        templateId: config.promptTemplateId,
        targetFunction: config.targetFunction,
      });
    } else if (hasAdvancedConfig(config)) {
      const promptConfig = buildPromptConfig(config);
      const prompts = buildAdvancedSEOPrompt(promptConfig);
      // Inject Brand SEO+GEO + Verniz DNA into advanced prompt
      systemPrompt = prompts.system + '\n\n' + brandSEOGeoSection + '\n\n' + orchestration.vernizSection + criminalGeoSection;
      userPrompt = prompts.user;
      log.info("using_advanced_prompt_with_brand_geo", { 
        brand: brandDetection.brand, 
        segment: config.segment, 
        contentType: config.contentType 
      });
    } else {
      systemPrompt = buildLegacySystemPrompt(config) + '\n\n' + brandSEOGeoSection + '\n\n' + orchestration.vernizSection + criminalGeoSection;
      userPrompt = `Escreva um artigo completo e otimizado para SEO e GEO (IA Generativa) sobre: "${config.keyword}"

⚠️ OBRIGATÓRIO - NÃO ESQUECER:
1. PRIMEIRA LINHA: <!-- META_DESCRIPTION: [145-180 caracteres, frase COMPLETA com pontuação final] -->
2. SEGUNDA LINHA: <!-- TITLE_SEO: [55-80 caracteres, COMPLETO, sem parênteses abertos, sem números truncados] -->
3. PARÁGRAFO 1: Resposta direta em 40-60 palavras (otimizado para extração por IAs)
4. H2s como PERGUNTAS NATURAIS (formato GEO)
5. Frases CURTAS: máximo 15 palavras cada (Flesch 70-100 OBRIGATÓRIO)
6. Parágrafos CURTOS: máximo 3 linhas
7. Linguagem SIMPLES: como se falasse com um amigo de 14 anos
8. MÍNIMO 4 e MÁXIMO 10 links internos (OBRIGATÓRIO) e MÁXIMO 3 links externos para fontes oficiais (.gov, .edu)
9. Citar TODAS as redes sociais configuradas no projeto
10. Estatísticas verificáveis com fonte a cada 150-200 palavras (GEO)
11. Definições no formato "X é..." para extração por IAs (GEO)

Estrutura:
1. Meta tags (comentários HTML)
2. Parágrafo de resposta direta (GEO-First)
3. Seções organizadas com subtítulos como perguntas naturais (H2/H3)
4. Conteúdo útil com listas, tabelas e exemplos
${config.includeFaq ? `5. FAQ com ${config.faqCount} perguntas (otimizadas para People Also Ask)` : ''}
${config.includeConclusion ? '6. Conclusão com resumo e CTA' : ''}

Comece com <!-- META_DESCRIPTION: ... --> na primeira linha:`;
      log.info("using_legacy_prompt_with_brand_geo", { brand: brandDetection.brand, keyword: config.keyword });
    }

    const modelAlias = config.aiModel || "flash";
    const model = resolveModel(modelAlias);

    log.info("stream_started", { 
      model, keyword: config.keyword,
      segment: config.segment || 'general',
      useAdvanced: hasAdvancedConfig(config)
    });

    // Few-shot de TÍTULOS-MODELO (biblioteca GEO 2026) — só para marca RDM
    let titleFewShotBlock = '';
    if (brandDetection.brand === 'rdm') {
      try {
        const hint = (contentHint || config.keyword || '').toLowerCase();
        const categoryMatchers: Array<{ cat: string; test: () => boolean }> = [
          // Corporate legal (higher priority than generic colarinho_branco)
          { cat: 'tributario', test: () => /icms|lei 8\.?137|apropria[çc][ãa]o ind[ée]bita tribut[áa]ria|sonega[çc][ãa]o fiscal|tema 999|substitui[çc][ãa]o tribut[áa]ria|cr[ée]dito frio|sefaz|auto de infra[çc][ãa]o/.test(hint) },
          { cat: 'execucao_fiscal', test: () => /execu[çc][ãa]o fiscal|art\.?\s*135\s*ctn|s[úu]mula 435|cda|certid[ãa]o de d[íi]vida ativa|redirecionamento|penhora de faturamento|dissolu[çc][ãa]o irregular|exce[çc][ãa]o de pr[ée][- ]?executividade|leil[ãa]o judicial/.test(hint) },
          { cat: 'credito_fomento', test: () => /bndes|pronamp|fgi|fgo|ccb|c[ée]dula de cr[ée]dito banc[áa]rio|lei 7\.?492|financiamento mediante fraude|fomento empresarial|fiador de empr[ée]stimo|desvio de finalidade/.test(hint) },
          { cat: 'ordem_economica', test: () => /cartel|dumping|fixa[çc][ãa]o artificial de pre[çc]o|publicidade enganosa|art\.?\s*66\s*cdc|lei 9\.?279|propriedade industrial|concorr[êe]ncia desleal|inpi|desvio de clientela/.test(hint) },
          // Existing hyperlocal categories
          { cat: 'aeroporto', test: () => /aeroporto|gru|congonhas|deain|receita federal|cumbica|contrabando|descaminho|evas[ãa]o de divisas|tr[áa]fico internacional/.test(hint) },
          { cat: 'criminal_24h', test: () => /custódia|custodia|flagrante|plantão|plantao|preso|habeas corpus|intima[çc][ãa]o|delegacia|inqu[ée]rito|criminalista/.test(hint) },
          { cat: 'isp', test: () => /provedor|isp|anatel|marco civil|lgpd|banda larga|telecomunica|tr[âa]nsito ip/.test(hint) },
          { cat: 'fraude_bancaria', test: () => /pix|fraude bancária|fraude bancaria|golpe|clonagem|deepfake|boleto falso|banco/.test(hint) },
          { cat: 'colarinho_branco', test: () => /holding|colarinho|lavagem|compliance|societário|societario/.test(hint) },
          { cat: 'foruns', test: () => /f[óo]rum|comarca|tribunal|juizado|vara/.test(hint) },
        ];
        const picked = categoryMatchers.find((m) => m.test())?.cat ?? 'foruns';
        pickedTitleCategory = picked;
        const { data: titleRows } = await supabase
          .from('hyperlocal_title_templates')
          .select('title')
          .eq('status', 'approved')
          .eq('category', picked)
          .limit(6);
        const examples = (titleRows ?? []).map((r: any) => r.title).filter(Boolean);
        injectedFewShotExamples = examples;
        if (examples.length > 0) {
          log.info('title_fewshot_injected', { category: picked, count: examples.length });
          titleFewShotBlock = `

## 🏷️ TÍTULOS-MODELO GEO 2026 (biblioteca RDM — categoria: ${picked})
Estes são exemplos APROVADOS de títulos que a IA já usa como padrão-ouro para esta categoria. **O título do artigo DEVE seguir este padrão** (estrutura "Situação hiperlocal + POI/bairro + pergunta-benefício"):

${examples.map((t, i) => `${i + 1}. ${t}`).join('\n')}

**NÃO copie literalmente** — adapte ao POI/tema atual mantendo: (a) menção explícita ao bairro/fórum/delegacia/polo, (b) recorte YMYL específico, (c) formato pergunta+benefício.`;
        }
      } catch (e) {
        log.warn('title_fewshot_fetch_failed', { error: (e as Error).message });
      }
    }

    // Add critical enforcement reminder at the end of user prompt
    const enforcedUserPrompt = userPrompt + titleFewShotBlock + `

⚠️ CHECKLIST FINAL ANTES DE RESPONDER (OBRIGATÓRIO):
□ <!-- META_DESCRIPTION: ... --> presente na PRIMEIRA linha? (145-180 chars, frase COMPLETA)
□ <!-- TITLE_SEO: ... --> presente na SEGUNDA linha? (55-80 chars, sem parênteses abertos, sem números truncados)
□ TÍTULO: última palavra COMPLETA? Parênteses FECHADOS? Números COMPLETOS (4 dígitos para anos)?
□ META: frase termina com pontuação (. ! ?)? Sem palavras cortadas?
□ Frases com MÁXIMO 15 palavras cada? (Flesch 70-100)
□ Parágrafos com MÁXIMO 3 linhas?
□ MÍNIMO 4 e MÁXIMO 10 LINKS INTERNOS presentes no conteúdo? (OBRIGATÓRIO — conteúdo sem links internos é REJEITADO)
□ MÁXIMO 3 links externos?
□ TODAS as redes sociais do projeto foram citadas?
□ Linguagem simples que qualquer pessoa entende?
□ [RDM] §1 tem 40-60 palavras E a 1ª frase (resposta direta) tem ≤30 palavras (regra ouro AEO 2026)?
Se QUALQUER item está faltando, CORRIJA antes de entregar. Conteúdo sem links internos será REJEITADO.`;

    const streamResponse = await callAIStream(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: enforcedUserPrompt },
      ],
      { maxTokens: 8000, temperature: 0.5 }
    );

    // ====== RDM: buffer stream, validate frontloading, auto-regenerate on fail ======
    if (brandDetection.brand === 'rdm') {
      const MAX_REGEN = 2;
      let content = await consumeSSEContent(streamResponse.body!);
      let validation = validateFrontloading(content);
      let attempts = 0;
      const validations: Array<{ attempt: number; passes: boolean; reason?: string; wordCount: number }> = [
        { attempt: 0, passes: validation.passes, reason: validation.reason, wordCount: validation.wordCount },
      ];

      while (!validation.passes && attempts < MAX_REGEN) {
        attempts++;
        log.info("frontload_regen_attempt", { attempt: attempts, reason: validation.reason });
        const correctivePrompt = enforcedUserPrompt + `

⚠️ REGENERAÇÃO OBRIGATÓRIA — TENTATIVA ${attempts}/${MAX_REGEN}
O parágrafo §1 anterior falhou na validação GEO 2026:
- §1 total: ${validation.wordCount} palavras (obrigatório: 40-60)
- 1ª frase (resposta direta): ${validation.firstSentenceWordCount} palavras (obrigatório: ≤30 — regra ouro AEO 2026)
- Base legal presente: ${validation.hasLegalBase ? 'sim' : 'NÃO'}
- Jurisdição presente: ${validation.hasJurisdiction ? 'sim' : 'NÃO'}
- Motivo: ${validation.reason || '-'}

REESCREVA o artigo COMPLETO. O PRIMEIRO <p> DEVE:
1. Ter class="lead-answer" data-geo="frontload"
2. Total 40-60 palavras
3. **1ª frase (resposta direta) em ATÉ 30 palavras** — ela é o snippet que ChatGPT/Gemini vão citar.
4. Citar base legal explícita (art. X, Lei Y/AAAA, ou tribunal + ano) já na 1ª ou 2ª frase.
5. Mencionar jurisdição (São Paulo/Brasil/federal).
6. Responder diretamente à pergunta do TÍTULO — não uma introdução genérica.`;
        const regen = await callAIStream(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: correctivePrompt },
          ],
          { maxTokens: 8000, temperature: 0.4 }
        );
        content = await consumeSSEContent(regen.body!);
        validation = validateFrontloading(content);
        validations.push({ attempt: attempts, passes: validation.passes, reason: validation.reason, wordCount: validation.wordCount });
      }

      log.info("frontload_final", { passes: validation.passes, attempts, wordCount: validation.wordCount });

      // ====== Registrar histórico de geração hiperlocal ======
      try {
        await supabase.from("hyperlocal_generation_history").insert({
          user_id: user.id,
          article_id: historyArticleId,
          title: config.title || config.keyword || '(sem título)',
          keyword: config.keyword,
          brand: brandDetection.brand,
          category: pickedTitleCategory,
          fewshot_examples: injectedFewShotExamples,
          fewshot_count: injectedFewShotExamples.length,
          template_kind: hyperlocalPoi ? (await import("../_shared/hyperlocal-2026.ts")).poiTypeToTemplateKind(hyperlocalPoi.poi_type) : null,
          poi_id: hyperlocalPoi?.id ?? null,
          regen_attempts: attempts,
          frontload_passes: validation.passes,
          frontload_word_count: validation.wordCount,
          first_sentence_words: (validation as any).firstSentenceWordCount ?? null,
          first_sentence_ok: typeof (validation as any).firstSentenceWordCount === 'number'
            ? ((validation as any).firstSentenceWordCount <= 30)
            : null,
          has_legal_base: (validation as any).hasLegalBase ?? null,
          has_jurisdiction: (validation as any).hasJurisdiction ?? null,
          validation_history: validations,
          source: historySource,
        });
      } catch (histErr) {
        log.warn("hyperlocal_history_insert_failed", { error: (histErr as Error).message });
      }

      const sseData = `data: ${JSON.stringify({
        choices: [{ delta: { content } }],
        _meta: { frontload_validation: validation, regen_attempts: attempts, history: validations, category: pickedTitleCategory, fewshot_count: injectedFewShotExamples.length },
      })}\n\ndata: [DONE]\n\n`;
      return new Response(sseData, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    log.error("generation_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    
    if (errorMessage.includes("Rate limit")) {
      return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos.", request_id: requestId }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    return new Response(JSON.stringify({ error: errorMessage, request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
