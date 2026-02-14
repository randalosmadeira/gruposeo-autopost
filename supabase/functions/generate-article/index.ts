
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { buildAdvancedSEOPrompt, type PromptConfig } from "../_shared/seo-prompt-builder.ts";
import { callAIStream, resolveModel } from "../_shared/gemini.ts";
import { runAgentPipeline, type AgentPipelineConfig } from "../_shared/agents/agent-pipeline.ts";
import { mapSegmentToSector } from "../_shared/sector-config.ts";
import { orchestrate } from "../_shared/verniz-orchestrator.ts";
import { setEnvKeysForUser } from "../_shared/byok-resolver.ts";
import { detectBrand, buildBrandSEOGeoPrompt } from "../_shared/brand-seo-geo.ts";

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
  // NEW: Agent pipeline flag and sector selection
  useAgentPipeline?: boolean;
  sectorType?: string;
  // NEW: Prompt template selection
  promptTemplateId?: string;
  targetFunction?: string;
  // NEW: ZicaJuris project config
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
- Use formatação Markdown com headers (H2, H3), listas e negrito quando apropriado
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

    const { config } = await req.json() as { config: ArticleConfig };

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
    
    const brandSEOGeoSection = buildBrandSEOGeoPrompt(brandDetection, config.projectConfig ? {
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
    } : undefined);

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

    // ====== FETCH USER'S PROMPT TEMPLATE FROM DATABASE ======
    const userTemplate = await fetchUserTemplate(
      supabase,
      user.id,
      config.promptTemplateId,
      config.targetFunction,
    );

    // ====== STANDARD FLOW with Verniz DNA + Brand SEO+GEO injection ======
    let systemPrompt: string;
    let userPrompt: string;

    if (userTemplate) {
      // USE USER'S CUSTOM TEMPLATE with variable substitution
      systemPrompt = substituteTemplateVariables(userTemplate, config) 
        + '\n\n' + brandSEOGeoSection 
        + '\n\n' + orchestration.vernizSection;
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
      systemPrompt = prompts.system + '\n\n' + brandSEOGeoSection + '\n\n' + orchestration.vernizSection;
      userPrompt = prompts.user;
      log.info("using_advanced_prompt_with_brand_geo", { 
        brand: brandDetection.brand, 
        segment: config.segment, 
        contentType: config.contentType 
      });
    } else {
      systemPrompt = buildLegacySystemPrompt(config) + '\n\n' + brandSEOGeoSection + '\n\n' + orchestration.vernizSection;
      userPrompt = `Escreva um artigo completo e otimizado para SEO e GEO (IA Generativa) sobre: "${config.keyword}"

⚠️ OBRIGATÓRIO - NÃO ESQUECER:
1. PRIMEIRA LINHA: <!-- META_DESCRIPTION: [145-160 caracteres com keyword] -->
2. SEGUNDA LINHA: <!-- TITLE_SEO: [máximo 60 caracteres] -->
3. PARÁGRAFO 1: Resposta direta em 40-60 palavras (otimizado para extração por IAs)
4. H2s como PERGUNTAS NATURAIS (formato GEO)
5. Frases CURTAS: máximo 15 palavras cada (Flesch 70-100 OBRIGATÓRIO)
6. Parágrafos CURTOS: máximo 3 linhas
7. Linguagem SIMPLES: como se falasse com um amigo de 14 anos
8. MÍNIMO 10 links internos (se disponíveis) e MÁXIMO 3 links externos para fontes oficiais (.gov, .edu)
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

    // Add critical enforcement reminder at the end of user prompt
    const enforcedUserPrompt = userPrompt + `

⚠️ CHECKLIST FINAL ANTES DE RESPONDER:
□ <!-- META_DESCRIPTION: ... --> presente na PRIMEIRA linha? (OBRIGATÓRIO)
□ <!-- TITLE_SEO: ... --> presente na SEGUNDA linha? (OBRIGATÓRIO)
□ Frases com MÁXIMO 15 palavras cada? (Flesch 70-100)
□ Parágrafos com MÁXIMO 3 linhas?
□ Mínimo 10 links internos (se fornecidos) e MÁXIMO 3 links externos?
□ TODAS as redes sociais do projeto foram citadas?
□ Linguagem simples que qualquer pessoa entende?
Se algum item está faltando, CORRIJA antes de entregar.`;

    const streamResponse = await callAIStream(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: enforcedUserPrompt },
      ],
      { maxTokens: 8000, temperature: 0.5 }
    );

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
