// CONFIGURAÇÃO DO SISTEMA DE REESCRITA JORNALÍSTICA v3.0
// Grupo SEO Marketing - Autopost AI

export const JOURNALISTIC_SYSTEM_PROMPT = `Você é um jornalista profissional sênior com 20+ anos de experiência em redação jornalística brasileira. Suas respostas devem ser profundas, analíticas e estratégicas.
   - Dados da fonte devem ter atribuição explícita

═══════════════════════════════════════
REGRAS ADICIONAIS
═══════════════════════════════════════

PIRÂMIDE INVERTIDA:
- Lide (1º parágrafo): Responda O QUÊ, QUEM, QUANDO, ONDE (máx 4 linhas)
- 2º parágrafo: COMO e POR QUÊ
- 3º+ parágrafos: Detalhes, contexto, análise

TITLE CASE BRASILEIRO:
- Capitalize primeira letra de cada palavra significativa
- Exceções (minúsculas): de, do, da, dos, das, em, no, na, nos, nas, com, por, para, e, ou, a, o, um, uma
- Primeira e última palavra SEMPRE capitalizada

MONETIZAÇÃO ADSENSE:
- Sugira 3-4 posições ideais para ad placement
- Nunca concentre mais de 3 parágrafos sem quebra visual
- Tempo de permanência alvo: 5-8 minutos

OTIMIZAÇÃO PARA IA (AIO):
- Estruture respostas citáveis por ChatGPT, Claude, Perplexity
- Parágrafos auto-contidos (cada um pode funcionar como resposta independente)
- FAQs otimizadas para citação por IA
- Linguagem natural e conversacional

═══════════════════════════════════════
CHECKLIST DE QUALIDADE SEO (TODOS DEVEM SER ✅)
═══════════════════════════════════════

- [ ] META-DESCRIPTION presente e com 145-180 caracteres, frase COMPLETA (INEGOCIÁVEL)
- [ ] TÍTULO: 55-80 chars, sem parênteses abertos, sem números truncados, sem emojis
- [ ] H1 único no início com palavra-chave
- [ ] 5-8 subtítulos H2 distribuídos
- [ ] Mínimo 2 listas (bullet ou numeradas)
- [ ] Mínimo 2 links externos autoritativos (INEGOCIÁVEL)
- [ ] MÍNIMO 4 e MÁXIMO 10 LINKS INTERNOS inseridos no conteúdo (INEGOCIÁVEL — ZERO TOLERÂNCIA)
- [ ] Seção FAQ com 3-8 perguntas
- [ ] CTAs sutis no meio e final
- [ ] Conclusão estruturada
- [ ] Fonte original creditada com link
- [ ] Alt text para imagem gerado
- [ ] Mínimo 2.400 palavras
- [ ] Formatação limpa (sem espaços duplos, sem pontuação duplicada)
- [ ] Flesch Reading Ease ≥ 60 (MÍNIMO OBRIGATÓRIO)
- [ ] Densidade palavra-chave: 1-2%
- [ ] Originalidade: ≥ 95%
- [ ] Schema markup preparado
`;

// Mandatory JSON output instructions v3.0 - MUST be appended to custom prompts
export const MANDATORY_JSON_OUTPUT_INSTRUCTIONS = `

---

# OUTPUT JSON ESTRUTURADO (OBRIGATÓRIO)

**REGRA CRÍTICA:** Retorne a resposta APENAS neste formato JSON. Nenhum texto antes ou depois.

\`\`\`json
{
  "content": {
    "html": "<article>...HTML completo do artigo com todas as tags semânticas...</article>",
    "plainText": "Texto limpo sem HTML para preview",
    "wordCount": 2800,
    "readingTime": "12 min",
    "fleschScore": 72,
    "paragraphCount": 35,
    "sentenceAvgWords": 18
  },
  "seo": {
    "metaTitle": "Título SEO completo com Keyword (55-80 chars, sem parênteses abertos, sem números truncados)",
    "metaDescription": "Meta-description 145-180 chars, frase COMPLETA com pontuação final, keyword nos primeiros 60 chars e CTA implícito",
    "slug": "keyword-principal-com-contexto-descritivo",
    "focusKeyword": "keyword principal exata",
    "keywords": ["keyword principal", "variação 1", "variação 2", "long tail 1", "long tail 2", "LSI keyword 1", "LSI keyword 2"],
    "keywordDensity": "1.4%",
    "headingStructure": {
      "h1": "Título do Artigo em Title Case",
      "h2": ["Seção 1", "Seção 2", "Seção 3", "Seção 4", "Seção 5", "FAQ"],
      "h3": ["Subseção 1.1", "Subseção 2.1", "Pergunta FAQ 1", "Pergunta FAQ 2"]
    },
    "schemaMarkup": {
      "article": { "@type": "NewsArticle", "headline": "...", "datePublished": "...", "author": "..." },
      "faqPage": { "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "...", "acceptedAnswer": { "@type": "Answer", "text": "..." } }] },
      "breadcrumb": { "@type": "BreadcrumbList", "itemListElement": [] }
    },
    "faqQuestions": ["Pergunta 1?", "Pergunta 2?", "Pergunta 3?"]
  },
  "emotionalTrigger": {
    "detected": "preocupação",
    "applied": "preocupação",
    "secondary": "sério",
    "confidence": 0.87,
    "forcedByUser": false
  },
  "analysisAngle": {
    "selected": "impacto_brasil",
    "autoDetected": true,
    "originalContentPercentage": 45,
    "addedWordCount": 1260
  },
  "niche": {
    "primary": "advocacia",
    "secondary": "geral",
    "toneApplied": "técnico-acessível",
    "specialRulesApplied": ["citação de artigo de lei", "disclaimer jurídico"]
  },
  "image": {
    "prompt": "Prompt detalhado para geração de imagem editorial: estilo jornalístico, [descrição da cena], [iluminação], [composição], [paleta de cores baseada no gatilho emocional], resolução 16:9, fotorrealista",
    "altText": "Descrição acessível da imagem com keyword (máx 125 chars)",
    "caption": "Legenda jornalística da imagem — Crédito: IA Editorial / Portal",
    "originalUrl": null,
    "suggestedImages": [
      {
        "description": "Imagem sugerida 1 para seção X",
        "altText": "Alt text da imagem 1",
        "placement": "após parágrafo 3",
        "searchQuery": "termos para busca em banco de imagens"
      },
      {
        "description": "Imagem sugerida 2 para seção Y",
        "altText": "Alt text da imagem 2",
        "placement": "antes da FAQ",
        "searchQuery": "termos para busca em banco de imagens"
      }
    ],
    "emotionalPalette": {
      "primaryColor": "#1a3a5c",
      "secondaryColor": "#e8b931",
      "mood": "sóbrio e autoritativo"
    }
  },
  "source": {
    "originalUrl": "https://fonte-original.com.br/materia",
    "originalTitle": "Título original da matéria",
    "sourceName": "Nome do Veículo",
    "credits": "Com informações de [Nome do Veículo]",
    "publishDate": "",
    "rewriteDate": ""
  },
  "links": {
    "external": [
      { "url": "https://fonte-autoritativa.gov.br/pagina", "anchorText": "texto âncora descritivo", "context": "motivo da inclusão", "rel": "noopener noreferrer" },
      { "url": "https://fonte-autoritativa-2.edu.br/estudo", "anchorText": "texto âncora descritivo", "context": "motivo da inclusão", "rel": "noopener noreferrer" }
    ],
    "internalSuggestions": [
      { "suggestedUrl": "/artigo-relacionado", "anchorText": "texto âncora sugerido", "reason": "relevância temática" }
    ]
  },
  "internal": {
    "category": "Categoria principal",
    "subcategory": "Subcategoria",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
    "qualityScore": 85,
    "seoScore": 90,
    "fleschScore": 72,
    "complianceCheck": {
      "originalityScore": 98,
      "citationCompliance": true,
      "seoOptimized": true,
      "readabilityScore": 85,
      "metaDescriptionLength": true,
      "fleschMinimum": true,
      "externalLinksMinimum": true,
      "internalLinksMinimum": true,
      "faqPresent": true,
      "faqCount": 5,
      "wordCountMinimum": true,
      "titleRewritten": true,
      "maxConsecutiveWords": 3,
      "originalContentPercentage": 45,
      "copyrightCompliant": true,
      "sourceCredit": true,
      "imagesAltText": true,
      "headingHierarchy": true,
      "noDoubleSpaces": true,
      "ctaPresent": true,
      "pyramidInverted": true,
      "titleCaseBrazilian": true,
      "schemaMarkupReady": true,
      "allChecksPassed": true,
      "hasH1": true,
      "hasMetaDescription": true,
      "hasFAQ": true,
      "hasLists": true,
      "hasExternalLinks": true,
      "hasCTA": true,
      "hasConclusion": true
    }
  },
  "monetization": {
    "adDensity": "balanced",
    "estimatedReadingTime": "12 min",
    "suggestedAdPlacements": [
      { "position": "after_paragraph_2", "type": "in-article", "reason": "após lide, leitor engajado" },
      { "position": "mid_article", "type": "in-article", "reason": "meio do corpo, ponto de maior atenção" },
      { "position": "before_faq", "type": "in-article", "reason": "transição natural, alta visibilidade" },
      { "position": "after_conclusion", "type": "multiplex", "reason": "fim do artigo, ads de conteúdo relacionado" }
    ]
  }
}
\`\`\`

VALIDAÇÕES AUTOMÁTICAS ANTES DA ENTREGA:
1. ✅ wordCount >= 2400
2. ✅ metaDescription length 145-180 chars, frase COMPLETA com pontuação final
3. ✅ metaTitle length 55-80 chars, COMPLETO, sem parênteses abertos, sem números truncados
4. ✅ fleschScore >= 60
5. ✅ external links >= 2
6. ✅ INTERNAL LINKS >= 4 e <= 10 (OBRIGATÓRIO — ZERO TOLERÂNCIA)
7. ✅ FAQ count 3-8
8. ✅ H1 count = 1
9. ✅ H2 count >= 5
10. ✅ No double spaces
11. ✅ Heading hierarchy valid
12. ✅ Source credited (no início, distribuído e no final)
13. ✅ Conteúdo citado/referenciado ~40% com atribuição explícita
13. ✅ Conteúdo autoral/analítico ~60%
14. ✅ Mínimo 4 citações diretas com aspas e crédito ao veículo
15. ✅ Title rewritten >= 90%
16. ✅ Max 5 consecutive words from source (sem aspas)
17. ✅ Images alt text present
18. ✅ CTAs present (min 2)
19. ✅ Schema markup ready

Se QUALQUER validação falhar, corrija ANTES de entregar o JSON final.
`;

// Niche-specific image prompt templates
export const NICHE_IMAGE_PROMPTS: Record<string, string> = {
  advocacia: "Fotografia profissional estilo editorial, close-up de martelo de juiz sobre mesa de madeira nobre, documentos jurídicos desfocados ao fundo, iluminação suave lateral, tons de marrom e dourado, atmosfera de autoridade e confiança, alta resolução, estilo corporativo, 16:9",
  saude: "Fotografia médica clean e moderna, médico(a) sorridente com estetoscópio em ambiente hospitalar iluminado, fundo desfocado em tons de azul e branco, atmosfera de confiança e cuidado, luz natural suave, alta definição, estilo editorial de saúde, 16:9",
  beleza: "Fotografia de beleza high-end, modelo feminina com pele radiante e maquiagem natural, close-up facial com iluminação suave e difusa, fundo em tons pastéis ou branco puro, atmosfera luxuosa e aspiracional, foco perfeito, estilo editorial de revista de moda, 16:9",
  tecnologia: "Imagem digital futurista, interface holográfica com códigos e dados flutuando, tons de azul neon e ciano, elementos de circuito e rede neural, composição dinâmica, atmosfera inovadora e tech, alta qualidade, estilo cyberpunk clean, 16:9",
  marketing: "Ilustração vetorial moderna e colorida, gráficos de crescimento ascendente, ícones de redes sociais e métricas, paleta vibrante com azul, laranja e verde, composição balanceada, atmosfera de sucesso e estratégia, estilo flat design profissional, 16:9",
  geral: "Fotografia editorial profissional, composição equilibrada com foco central, iluminação natural suave, cores neutras e elegantes, atmosfera informativa e confiável, alta resolução, estilo jornalístico moderno, 16:9",
};

// Article length configurations - Updated for v3.0 (minimum 2400 words)
export const ARTICLE_LENGTHS: Record<string, { min: number; max: number; label: string }> = {
  short: { min: 2400, max: 3600, label: "Padrão (2400-3600 palavras)" },
  medium: { min: 2400, max: 3600, label: "Padrão (2400-3600 palavras)" },
  long: { min: 3600, max: 5200, label: "Extenso (3600-5200 palavras)" },
  'extra-long': { min: 5200, max: 7000, label: "Completo (5200-7000 palavras)" },
};

// Niche labels for UI
export const NICHE_OPTIONS = [
  { id: 'geral', label: 'Geral', description: 'Notícias gerais e variedades' },
  { id: 'advocacia', label: 'Advocacia / Jurídico', description: 'Direito, leis e jurisprudência' },
  { id: 'saude', label: 'Saúde / Medicina', description: 'Saúde, tratamentos e bem-estar' },
  { id: 'beleza', label: 'Beleza / Estética', description: 'Estética, cuidados e tendências' },
  { id: 'tecnologia', label: 'Tecnologia', description: 'Tech, inovação e digital' },
  { id: 'marketing', label: 'Marketing', description: 'Estratégias, ROI e tendências' },
];

// Combined niche presets for multi-niche projects
export const COMBINED_NICHE_PRESETS = [
  { id: 'saude_beleza', label: 'Saúde + Beleza', niches: ['saude', 'beleza'], description: 'Bem-estar integral e estética' },
  { id: 'tecnologia_marketing', label: 'Tecnologia + Marketing', niches: ['tecnologia', 'marketing'], description: 'MarTech e inovação digital' },
  { id: 'advocacia_tecnologia', label: 'Advocacia + Tech', niches: ['advocacia', 'tecnologia'], description: 'Direito digital e regulamentação' },
  { id: 'advocacia_tecnologia_marketing', label: 'Advocacia + Tech + Marketing', niches: ['advocacia', 'tecnologia', 'marketing'], description: 'Negócios digitais completos' },
  { id: 'tecnologia_crimes', label: 'Tecnologia + Crimes Cibernéticos', niches: ['tecnologia', 'advocacia', 'geral'], description: 'Segurança digital e prevenção' },
];

export interface JournalisticRewriteRequest {
  sourceUrl: string;
  sourceContent: string;
  sourceName: string;
  analysisAngle: string;
  keyword?: string;
  niche?: string;
  niches?: string[];
  articleLength?: 'short' | 'medium' | 'long';
  language?: string;
  projectId?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
  adaptiveAngle?: boolean;
  emotionalTriggerOverride?: string;
}

export interface JournalisticRewriteResponse {
  content: {
    html: string;
    plainText: string;
    wordCount: number;
    readingTime: string;
    fleschScore?: number;
    paragraphCount?: number;
    sentenceAvgWords?: number;
  };
  seo: {
    metaTitle: string;
    metaDescription: string;
    slug: string;
    focusKeyword: string;
    keywords: string[];
    keywordDensity?: string;
    headingStructure?: any;
    schemaMarkup?: any;
    faqQuestions?: string[];
  };
  emotionalTrigger?: {
    detected: string;
    applied: string;
    secondary?: string;
    confidence: number;
    forcedByUser?: boolean;
  };
  analysisAngle?: {
    selected: string;
    autoDetected: boolean;
    originalContentPercentage: number;
    addedWordCount: number;
  };
  niche?: {
    primary: string;
    secondary?: string;
    toneApplied: string;
    specialRulesApplied?: string[];
  };
  image: {
    prompt: string;
    altText: string;
    caption?: string;
    originalUrl?: string;
    suggestedImages?: any[];
    emotionalPalette?: any;
  };
  source: {
    originalUrl: string;
    sourceName: string;
    credits: string;
    originalTitle?: string;
    publishDate?: string;
    rewriteDate?: string;
  };
  links?: {
    external?: Array<{ url: string; anchorText: string; context?: string; rel?: string }>;
    internalSuggestions?: Array<{ suggestedUrl: string; anchorText: string; reason?: string }>;
  };
  internal: {
    category: string;
    subcategory?: string;
    tags: string[];
    qualityScore: number;
    seoScore?: number;
    fleschScore?: number;
    complianceCheck: {
      originalityScore: number;
      citationCompliance: boolean;
      seoOptimized: boolean;
      readabilityScore: number;
      [key: string]: any;
    };
  };
  monetization: {
    adDensity: string;
    estimatedReadingTime?: string;
    suggestedAdPlacements: Array<{ position: string; type: string; reason?: string }>;
  };
}

export function buildUserPrompt(request: JournalisticRewriteRequest): string {
  const lengthConfig = ARTICLE_LENGTHS[request.articleLength || 'medium'];
  
  // Handle combined niches
  const niches = request.niches || [request.niche || 'geral'];
  const nichesDisplay = niches.length > 1 
    ? `Combinados: ${niches.map(n => NICHE_OPTIONS.find(o => o.id === n)?.label || n).join(' + ')}`
    : NICHE_OPTIONS.find(o => o.id === niches[0])?.label || niches[0];

  // Adaptive angle instruction
  const angleInstruction = request.adaptiveAngle
    ? `- Ângulo de Análise: DETERMINE O MELHOR ÂNGULO automaticamente baseado nos nichos combinados e no conteúdo da notícia. Considere: ${niches.join(', ')}`
    : `- Ângulo de Análise: ${request.analysisAngle}`;

  // Emotional trigger instruction
  const emotionalInstruction = request.emotionalTriggerOverride
    ? `GATILHO EMOCIONAL: ${request.emotionalTriggerOverride} (FORÇADO PELO USUÁRIO — IGNORAR detecção automática)`
    : `GATILHO EMOCIONAL: AUTO-DETECTAR (analisar vocabulário, fatos e reações esperadas do conteúdo)`;
  
  return `
IDIOMA: ${request.language || 'pt-BR'}
NICHO: ${nichesDisplay}
NICHOS DETECTADOS: ${niches.join(', ')}
TAMANHO: ${lengthConfig.label} (${lengthConfig.min}-${lengthConfig.max} palavras)
${emotionalInstruction}

═══ FONTE ORIGINAL ═══
Título/Veículo: ${request.sourceName}
URL: ${request.sourceUrl || 'Não informada'}
${angleInstruction}
${request.keyword ? `Palavra-chave SEO principal: ${request.keyword}` : 'Palavra-chave SEO principal: EXTRAIR automaticamente do título e conteúdo'}

${niches.length > 1 ? `
═══ INSTRUÇÕES PARA NICHOS COMBINADOS (${niches.join(' + ')}) ═══
1. Adaptar o tom para ambos os públicos
2. Cruzar informações relevantes entre os nichos
3. Sugerir conexões naturais entre os temas
` : ''}

${request.internalLinks && request.internalLinks.length > 0 ? `
═══ LINKS INTERNOS OBRIGATÓRIOS — ZERO TOLERÂNCIA ═══
VOCÊ DEVE inserir no MÍNIMO 4 e no MÁXIMO 10 dos links abaixo DENTRO do HTML do artigo.
Artigo SEM links internos <a href="..."> no HTML será REJEITADO.

${request.internalLinks.slice(0, 40).map((link, i) => `${i + 1}. "${link.anchor}" → ${link.url}`).join('\n')}

DISTRIBUIÇÃO OBRIGATÓRIA:
- 1-2 links nos primeiros 2 parágrafos (introdução)
- 4-6 links distribuídos nas seções H2 do corpo
- 1-2 links na conclusão
Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora descritivo</a>
NUNCA usar "clique aqui" como anchor text. VARIE os textos âncora.
Links EXTERNOS para fontes oficiais (.gov, .edu) e redes sociais do projeto também são INCENTIVADOS (máx. 3 externos).
` : `
═══ LINKS INTERNOS — REGRA INEGOCIÁVEL ═══
Nenhum link interno fornecido. OBRIGATÓRIO: Sugira 4-10 URLs internas baseadas no tema no campo "internalSuggestions" do JSON.
O artigo HTML DEVE conter links <a href="..."> para fontes oficiais e referências externas (mínimo 2).
Links EXTERNOS de fontes oficiais, canais oficiais e redes sociais do projeto são PERMITIDOS e INCENTIVADOS.
`}

═══ CONTEÚDO ORIGINAL DA NOTÍCIA ═══
${request.sourceContent.substring(0, 4000)}${request.sourceContent.length > 4000 ? '... (truncado)' : ''}

═══ INSTRUÇÕES DE EXECUÇÃO (REGRA 40/60) ═══
1. REESCREVA o artigo seguindo TODAS as regras do System Prompt
2. USE 40% do artigo para CITAR e REFERENCIAR a fonte original (com atribuição explícita: "Segundo o [Veículo]...", "Conforme apurou...", citações entre aspas)
3. USE 60% do artigo para ANÁLISE AUTORAL, original e otimizada (contexto, impactos, FAQ, dicas práticas)
4. APLIQUE o nicho "${niches[0]}" com tom e vocabulário específicos
5. DETECTE ou APLIQUE o gatilho emocional conforme instrução acima
6. USE o ângulo de análise para estruturar os 60% autorais
7. GERE o artigo com MÍNIMO ${lengthConfig.min} palavras
8. RETORNE o JSON completo conforme MANDATORY_JSON_OUTPUT_INSTRUCTIONS
9. VALIDE todos os 17 checkpoints antes de entregar

═══ REGRAS INEGOCIÁVEIS (REPETIÇÃO INTENCIONAL) ═══
- REGRA 40/60: 40% citado com atribuição + 60% autoral/analítico
- Meta-description: 145-160 caracteres, keyword nos primeiros 60 chars
- Flesch: mínimo 60, ideal 70-100
- Links INTERNOS: MÍNIMO 4, MÁXIMO 10 inseridos no HTML do artigo (OBRIGATÓRIO — artigo sem links internos é REJEITADO)
- Links externos: mínimo 2 fontes autoritativas (.gov, .edu, portais oficiais)
- Citações da fonte: mínimo 4, máximo 6 citações diretas com aspas e crédito
- Reescrita autoral: 60% análise própria, contexto, FAQ e conteúdo prático
- Título: reescrito em 90%, mantendo essência SEO
- Tamanho: ${lengthConfig.min} a ${lengthConfig.max} palavras OBRIGATÓRIO
- Crédito à fonte: OBRIGATÓRIO no início, distribuído pelo texto e no final
- Crédito: "Com informações de ${request.sourceName}${request.sourceUrl ? ` - ${request.sourceUrl}` : ''}"

⚠️ CHECKLIST FINAL ANTES DE ENTREGAR O JSON:
□ O campo "html" contém tags <a href="..."> de links internos? Se NÃO → ADICIONAR AGORA
□ Contagem de links internos ≥ 4? Se NÃO → ADICIONAR MAIS
□ Links externos para fontes oficiais presentes (mínimo 2)? Se NÃO → ADICIONAR
□ Meta-description presente e com 145-160 chars?
□ Título SEO com 55-80 chars, completo?
Se QUALQUER item faltar, CORRIJA antes de retornar o JSON.

Retorne o resultado APENAS em formato JSON conforme especificado no sistema.`;
}
