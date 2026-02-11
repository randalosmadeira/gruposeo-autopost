
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { buildAdvancedSEOPrompt, type PromptConfig } from "../_shared/seo-prompt-builder.ts";
import { callAIStream, resolveModel } from "../_shared/gemini.ts";
import { runAgentPipeline, type AgentPipelineConfig } from "../_shared/agents/agent-pipeline.ts";
import { mapSegmentToSector } from "../_shared/sector-config.ts";
import { orchestrate } from "../_shared/verniz-orchestrator.ts";

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

    const { config } = await req.json() as { config: ArticleConfig };

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

    // ====== STANDARD FLOW with Verniz DNA injection ======
    let systemPrompt: string;
    let userPrompt: string;

    if (hasAdvancedConfig(config)) {
      const promptConfig = buildPromptConfig(config);
      const prompts = buildAdvancedSEOPrompt(promptConfig);
      // Inject Verniz DNA into advanced prompt
      systemPrompt = prompts.system + '\n\n' + orchestration.vernizSection;
      userPrompt = prompts.user;
      log.info("using_advanced_prompt_with_verniz", { segment: config.segment, contentType: config.contentType });
    } else {
      systemPrompt = buildLegacySystemPrompt(config) + '\n\n' + orchestration.vernizSection;
      userPrompt = `Escreva um artigo completo e otimizado para SEO sobre: "${config.keyword}"

⚠️ OBRIGATÓRIO - NÃO ESQUECER:
1. PRIMEIRA LINHA: <!-- META_DESCRIPTION: [145-160 caracteres com keyword] -->
2. SEGUNDA LINHA: <!-- TITLE_SEO: [máximo 60 caracteres] -->
3. Frases CURTAS: máximo 15 palavras cada (Flesch 70-100 OBRIGATÓRIO)
4. Parágrafos CURTOS: máximo 3 linhas
5. Linguagem SIMPLES: como se falasse com um amigo de 14 anos
6. MÍNIMO 2 links externos para fontes oficiais (.gov, .edu)

Estrutura:
1. Meta tags (comentários HTML)
2. Introdução engajadora (2 parágrafos curtos)
3. Seções organizadas com subtítulos (H2/H3)
4. Conteúdo útil com listas e exemplos
${config.includeFaq ? `5. FAQ com ${config.faqCount} perguntas e respostas` : ''}
${config.includeConclusion ? '6. Conclusão com resumo e CTA' : ''}

Comece com <!-- META_DESCRIPTION: ... --> na primeira linha:`;
      log.info("using_legacy_prompt_with_verniz", { keyword: config.keyword });
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
□ Pelo menos 2 links externos para fontes oficiais?
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
