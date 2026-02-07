import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { buildAdvancedSEOPrompt, type PromptConfig } from "../_shared/seo-prompt-builder.ts";
import { callAIStream, resolveModel } from "../_shared/gemini.ts";

const FUNCTION_NAME = "generate-article";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ArticleConfig {
  keyword: string;
  title?: string;
  secondaryKeywords: string;
  wordCount: 'short' | 'medium' | 'long' | 'very-long';
  tone: string;
  pointOfView: string;
  language: string;
  type: 'blog' | 'sales';
  // Content type and segment (new advanced fields)
  contentType?: 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'opinion' | 'news';
  segment?: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  goal?: 'inform' | 'convert' | 'educate' | 'engage';
  intentType?: 'informational' | 'navigational' | 'transactional' | 'commercial';
  // Company data for sales pages
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  // Sales-specific
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  additionalInfo?: string;
  // Content elements
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  includeMetaDescription?: boolean;
  // SEO options
  seoOptimization: boolean;
  humanizeContent?: boolean;
  realtimeData?: boolean;
  // Custom instructions (legacy support)
  customInstructions?: string;
  // Internal links
  internalLinks?: Array<{ anchor: string; url: string }>;
  // Sources context
  sourcesContext?: string;
  // AI Model selection
  aiModel?: string;
}

const wordCountRanges = {
  short: { min: 600, max: 1000 },
  medium: { min: 1200, max: 1800 },
  long: { min: 2200, max: 2800 },
  'very-long': { min: 3500, max: 4500 },
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

serve(async (req) => {
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

    // Determine which prompt system to use
    let systemPrompt: string;
    let userPrompt: string;

    if (hasAdvancedConfig(config)) {
      // Use new advanced SEO prompt system
      const promptConfig = buildPromptConfig(config);
      const prompts = buildAdvancedSEOPrompt(promptConfig);
      systemPrompt = prompts.system;
      userPrompt = prompts.user;
      log.info("using_advanced_prompt", { segment: config.segment, contentType: config.contentType });
    } else {
      // Fallback to legacy prompt for backward compatibility
      systemPrompt = buildLegacySystemPrompt(config);
      userPrompt = `Escreva um artigo completo e otimizado para SEO sobre: "${config.keyword}"

Estrutura esperada:
1. Título principal atraente (H1)
2. Introdução engajadora que prenda o leitor
3. Seções organizadas com subtítulos (H2/H3)
4. Conteúdo detalhado e útil
${config.includeFaq ? `5. FAQ com ${config.faqCount} perguntas e respostas` : ''}
${config.includeConclusion ? '6. Conclusão com resumo e CTA' : ''}

Comece agora:`;
      log.info("using_legacy_prompt", { keyword: config.keyword });
    }

    // Resolve model based on config
    const modelAlias = config.aiModel || "flash";
    const model = resolveModel(modelAlias);

    log.info("stream_started", { 
      model, 
      keyword: config.keyword,
      segment: config.segment || 'general',
      useAdvanced: hasAdvancedConfig(config)
    });

    // Call OpenAI (primary) with streaming, Gemini fallback
    const streamResponse = await callAIStream(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 8000 }
    );

    // Return the streaming response with CORS headers
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
