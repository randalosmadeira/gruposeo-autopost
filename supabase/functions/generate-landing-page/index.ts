import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "generate-landing-page";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LandingPageConfig {
  keyword: string;
  title: string;
  offerType: string;
  location: string;
  size: 'short' | 'medium' | 'long' | 'very-long';
  language: string;
  targetAudience: string;
  painPoint: string;
  differentials: string;
  ctaObjective: string;
  additionalInfo: string;
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  metaDescription: boolean;
  lists: boolean;
  tables: boolean;
  conclusion: boolean;
  faq: boolean;
  template?: string;
  // NEW fields
  audienceType?: 'b2b' | 'b2c' | 'both';
  secondaryKeywords?: string;
  segment?: 'general' | 'juridico' | 'saude' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'educacao';
  tone?: string;
  pointOfView?: string;
}

// Segment-specific compliance rules
const segmentCompliance: Record<string, { rules: string; disclaimers: string; tone: string }> = {
  general: {
    rules: '',
    disclaimers: '',
    tone: 'profissional e persuasivo',
  },
  juridico: {
    rules: `
COMPLIANCE OAB (Resolução 02/2015):
- PROIBIDO: termos como "o melhor advogado", "garantia de resultado", "preços mais baixos"
- PROIBIDO: captação de clientela, promessas de êxito, comparações com outros escritórios
- USE: linguagem informativa e educativa, foco em orientação jurídica
- INCLUA: disclaimers sobre análise de caso específico ser necessária`,
    disclaimers: 'Este artigo tem caráter informativo e não substitui a consulta a um advogado para análise do seu caso específico.',
    tone: 'formal, técnico mas acessível, educativo',
  },
  saude: {
    rules: `
COMPLIANCE ÁREA DA SAÚDE:
- INCLUA: credenciais profissionais quando mencionar recomendações
- PROIBIDO: promessas de cura, diagnósticos à distância, substituir consulta médica
- USE: linguagem empática, baseada em evidências científicas
- CITE: fontes médicas confiáveis quando possível`,
    disclaimers: 'As informações deste artigo não substituem a consulta com profissionais de saúde. Procure sempre orientação médica qualificada.',
    tone: 'empático, profissional, baseado em evidências',
  },
  fintech: {
    rules: `
DIRETRIZES FINTECH/FINANÇAS:
- INCLUA: dados de mercado atualizados, glossário de termos quando necessário
- USE: transparência sobre riscos de investimento
- MENCIONE: regulamentação aplicável (BACEN, CVM quando relevante)
- EVITE: promessas de retorno garantido`,
    disclaimers: 'Investimentos envolvem riscos. Rentabilidade passada não garante resultados futuros. Consulte um profissional antes de investir.',
    tone: 'confiável, técnico, orientado a dados',
  },
  ecommerce: {
    rules: `
DIRETRIZES E-COMMERCE:
- INCLUA: prova social (reviews, avaliações, números de vendas)
- USE: gatilhos de escassez e urgência quando genuínos
- DESTAQUE: políticas de devolução, garantias, segurança do pagamento
- FOQUE: benefícios e transformação do produto`,
    disclaimers: '',
    tone: 'persuasivo, urgente, focado em benefícios',
  },
  'b2b-saas': {
    rules: `
DIRETRIZES B2B SAAS:
- FOQUE: ROI, métricas de negócio, economia de tempo/custo
- INCLUA: cases de uso, comparativos com alternativas
- DEMONSTRE: integrações, segurança de dados, escalabilidade
- USE: linguagem que ressoa com decisores (CTOs, CEOs, gerentes)`,
    disclaimers: '',
    tone: 'profissional, estratégico, orientado a resultados',
  },
  educacao: {
    rules: `
DIRETRIZES EDUCAÇÃO:
- FOQUE: transformação do aluno, metodologia de ensino
- INCLUA: roadmaps de aprendizado, pré-requisitos, outcomes
- DEMONSTRE: credenciais do instrutor, certificações oferecidas
- USE: linguagem inspiradora e motivacional`,
    disclaimers: '',
    tone: 'inspirador, didático, encorajador',
  },
};

const wordCountRanges = {
  short: { min: 600, max: 1000 },
  medium: { min: 1200, max: 1800 },
  long: { min: 2200, max: 2800 },
  'very-long': { min: 3500, max: 4500 },
};

// Niche-specific templates with optimized structures
const nicheTemplates: Record<string, { structure: string; tone: string; elements: string[] }> = {
  saas: {
    structure: `
    1. Hero Section com headline poderosa + demo/trial CTA
    2. Barra de logos de empresas que usam
    3. Problema/Dor do mercado
    4. Solução: como o software resolve
    5. Features principais (3-5 funcionalidades)
    6. Comparativo com alternativas
    7. Pricing/Planos
    8. Depoimentos/Cases de sucesso
    9. FAQ técnico
    10. CTA final com urgência`,
    tone: "profissional, técnico mas acessível, focado em ROI e produtividade",
    elements: ["integrations", "api", "security", "scalability", "support"]
  },
  ecommerce: {
    structure: `
    1. Hero com produto + oferta irresistível
    2. Galeria/Vídeo do produto
    3. Benefícios principais (bullet points visuais)
    4. Especificações técnicas
    5. Avaliações e reviews reais
    6. Comparativo antes/depois
    7. FAQ sobre produto e entrega
    8. Garantia e políticas
    9. Cross-sell/Up-sell
    10. CTA de compra com urgência`,
    tone: "persuasivo, urgente, focado em benefícios e transformação",
    elements: ["shipping", "warranty", "payment", "reviews", "scarcity"]
  },
  services: {
    structure: `
    1. Hero com proposta de valor clara
    2. Problema que você resolve
    3. Sua metodologia/processo (3-5 etapas)
    4. Diferenciais vs concorrência
    5. Cases/Resultados de clientes
    6. Quem é você/equipe (credibilidade)
    7. Depoimentos em vídeo/texto
    8. Pacotes/Opções de serviço
    9. FAQ sobre contratação
    10. CTA para diagnóstico/orçamento gratuito`,
    tone: "consultivo, empático, demonstrando expertise e resultados",
    elements: ["process", "team", "results", "customization", "support"]
  },
  course: {
    structure: `
    1. Hero com transformação prometida
    2. Para quem é este curso
    3. O problema de aprender sozinho
    4. O método/curriculum
    5. Módulos e conteúdo detalhado
    6. Sobre o instrutor (autoridade)
    7. Bônus exclusivos
    8. Depoimentos de alunos
    9. Garantia de satisfação
    10. FAQ sobre acesso e suporte
    11. Oferta com urgência`,
    tone: "inspirador, educativo, focado em transformação e resultados",
    elements: ["curriculum", "instructor", "community", "lifetime-access", "certification"]
  },
  consultancy: {
    structure: `
    1. Hero focado em resultados mensuráveis
    2. Diagnóstico do problema do mercado
    3. Sua abordagem única
    4. Áreas de especialização
    5. Metodologia proprietária
    6. Cases com números reais
    7. Quem são os consultores
    8. Processo de trabalho
    9. FAQ sobre engajamento
    10. CTA para call de diagnóstico`,
    tone: "autoritário, estratégico, orientado a dados e resultados",
    elements: ["methodology", "expertise", "roi", "partnership", "strategy"]
  }
};

function buildSystemPrompt(config: LandingPageConfig): string {
  const wordRange = wordCountRanges[config.size];
  const template = config.template ? nicheTemplates[config.template] : null;
  const segment = config.segment || 'general';
  const compliance = segmentCompliance[segment] || segmentCompliance.general;
  const audienceType = config.audienceType || 'both';
  
  // Parse secondary keywords
  const secondaryKws = config.secondaryKeywords 
    ? config.secondaryKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
    : [];
  
  // Audience type description
  const audienceDesc = {
    'b2b': 'empresas e decisores de negócio (tom profissional, foco em ROI, métricas e eficiência)',
    'b2c': 'consumidores finais (tom mais emocional, foco em benefícios pessoais e transformação)',
    'both': 'tanto empresas (B2B) quanto consumidores finais (B2C), balanceando linguagem técnica com acessibilidade',
  }[audienceType];
  
  let systemPrompt = `Você é um Redator SEO Sênior e Especialista em Copywriting de Vendas. Você cria ARTIGOS PERSUASIVOS que:
1. Ranqueiam na primeira página do Google, Bing e buscadores
2. São indexados e reconhecidos como autoridade pelas IAs (ChatGPT, Claude, Gemini, Manus)
3. Convertem leitores em clientes através de técnicas avançadas de persuasão
4. Estabelecem autoridade, credibilidade e referência no nicho

=== TIPO DE PÚBLICO ===
PÚBLICO-ALVO: ${audienceDesc}
${audienceType === 'b2b' ? 'FOQUE em: ROI, economia de tempo/custo, casos de uso empresarial, métricas de sucesso' : ''}
${audienceType === 'b2c' ? 'FOQUE em: transformação pessoal, benefícios emocionais, facilidade de uso, satisfação' : ''}

=== DIRETRIZES DE SEO AVANÇADO ===

PALAVRA-CHAVE PRINCIPAL: "${config.keyword}"
${secondaryKws.length > 0 ? `PALAVRAS-CHAVE SECUNDÁRIAS (long-tail): ${secondaryKws.join(', ')}` : ''}

OTIMIZAÇÃO PARA BUSCADORES:
- Palavra-chave principal no H1, primeiro parágrafo e distribuída naturalmente (densidade 0.5-1.5%)
- Use variações semânticas, sinônimos e termos LSI (Latent Semantic Indexing)
${secondaryKws.length > 0 ? `- Distribua as palavras-chave secundárias naturalmente ao longo do texto` : ''}
- Aplique palavras-chave de cauda longa naturalmente no conteúdo
- Estrutura de headings semântica: H1 > H2 > H3 (apenas um H1)
- URLs, meta descriptions e alt texts otimizados
- Responda diretamente às perguntas do usuário nas primeiras 100 palavras (técnica BLUF)

OTIMIZAÇÃO PARA IAs (ChatGPT, Claude, Gemini, Manus):
- Estruture informações de forma clara e organizada para facilitar extração por IAs
- Inclua definições precisas, listas estruturadas e dados verificáveis
- Demonstre E-E-A-T: Experience (experiência prática), Expertise (conhecimento técnico), Authoritativeness (reconhecimento do mercado), Trust (transparência)
- Use linguagem técnica quando apropriado, mas mantenha acessibilidade
- Cite fontes, metodologias e fundamentos que validem as afirmações

=== TÉCNICAS DE COPYWRITING PERSUASIVO ===

GATILHOS NEURAIS E PERSUASIVOS:
- Prova Social: cases, depoimentos, números de clientes atendidos
- Autoridade: credenciais, experiência, reconhecimentos do mercado
- Escassez e Urgência: quando apropriado e genuíno
- Reciprocidade: valor entregue antes do pedido
- Compromisso e Consistência: pequenos passos antes da conversão
- Afinidade: linguagem alinhada com o público-alvo

FRAMEWORK PAS (Problem-Agitation-Solution):
1. PROBLEMA: Identifique claramente a dor do leitor
2. AGITAÇÃO: Amplifique as consequências de não resolver
3. SOLUÇÃO: Apresente sua oferta como a resposta ideal

FRAMEWORK AIDA:
1. ATENÇÃO: Headlines que geram curiosidade
2. INTERESSE: Conteúdo relevante e engajante
3. DESEJO: Benefícios e transformação
4. AÇÃO: CTAs claros e urgentes

${compliance.rules ? `=== COMPLIANCE DO SEGMENTO (${segment.toUpperCase()}) ===${compliance.rules}` : ''}

=== ESPECIFICAÇÕES DO CONTEÚDO ===

REGRAS OBRIGATÓRIAS:
- Escreva em português brasileiro (${config.language})
- O conteúdo deve ter entre ${wordRange.min} e ${wordRange.max} palavras
- Use formatação Markdown com headers (H2, H3), listas e negrito estratégico
- Parágrafos curtos (2-4 linhas) otimizados para mobile
- Variação no tamanho das frases para ritmo natural
- Negrito para palavras-chave e pontos importantes
- TOM DE VOZ: ${compliance.tone || config.tone || 'profissional e persuasivo'}

TIPO DE OFERTA: ${config.offerType}
${config.location ? `ALCANCE GEOGRÁFICO: ${config.location} (adapte linguagem regional quando aplicável)` : ''}

PÚBLICO-ALVO ESPECÍFICO: ${config.targetAudience}
DOR PRINCIPAL: ${config.painPoint}
${config.differentials ? `DIFERENCIAIS COMPETITIVOS: ${config.differentials}` : ''}
OBJETIVO DE CONVERSÃO: ${config.ctaObjective}
${config.additionalInfo ? `INFORMAÇÕES ADICIONAIS: ${config.additionalInfo}` : ''}
${compliance.disclaimers ? `\nDISCLAIMER OBRIGATÓRIO: Inclua ao final do artigo: "${compliance.disclaimers}"` : ''}`;

  // Add company info
  if (config.companyName || config.companyPhone || config.companyAddress) {
    systemPrompt += `\n\nDADOS DA EMPRESA (use para estabelecer credibilidade):`;
    if (config.companyName) systemPrompt += `\n- Nome: ${config.companyName}`;
    if (config.companyPhone) systemPrompt += `\n- Telefone/WhatsApp: ${config.companyPhone}`;
    if (config.companyAddress) systemPrompt += `\n- Endereço: ${config.companyAddress}`;
  }

  // Add template-specific instructions
  if (template) {
    systemPrompt += `\n\n=== ESTRUTURA DO ARTIGO (TEMPLATE ${config.template?.toUpperCase()}) ===
${template.structure}

TOM DE VOZ: ${template.tone}

ELEMENTOS CHAVE PARA ESTE NICHO: ${template.elements.join(', ')}`;
  }

  // Content structure options
  if (config.metaDescription) {
    systemPrompt += `\n\nMETA DESCRIÇÃO: Inicie com uma meta description otimizada para SEO (150-160 caracteres) que inclua a palavra-chave e um CTA implícito.`;
  }

  if (config.lists) {
    systemPrompt += `\n- Use bullet points estratégicos para benefícios, features e diferenciais (facilita escaneamento)`;
  }

  if (config.tables) {
    systemPrompt += `\n- Inclua uma tabela comparativa (você vs concorrência, antes/depois, ou especificações) - otimiza para featured snippets`;
  }

  if (config.faq) {
    systemPrompt += `\n- Adicione seção FAQ com 5-7 perguntas otimizadas para featured snippets e pesquisa por voz`;
  }

  if (config.conclusion) {
    systemPrompt += `\n- Finalize com seção de CTA forte: recapitule a transformação prometida, reforce urgência genuína e facilite a ação`;
  }

  systemPrompt += `\n\n=== CHECKLIST FINAL ===
Antes de entregar, verifique:
✓ Palavra-chave no H1 e primeiro parágrafo
✓ Resposta direta à intenção de busca nos primeiros 100 palavras
✓ H2s com variações semânticas da keyword
✓ Parágrafos ≤4 linhas
✓ Negrito estratégico em pontos-chave
✓ CTAs distribuídos ao longo do texto
✓ Tom adequado ao público B2B/B2C especificado
✓ Conteúdo que demonstra experiência real e autoridade`;

  return systemPrompt;
}

function buildUserPrompt(config: LandingPageConfig): string {
  const template = config.template ? nicheTemplates[config.template] : null;
  const segment = config.segment || 'general';
  const audienceType = config.audienceType || 'both';
  
  // Parse secondary keywords for user prompt
  const secondaryKws = config.secondaryKeywords 
    ? config.secondaryKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
    : [];
  
  return `Crie um ARTIGO DE VENDAS PERSUASIVO e otimizado para SEO sobre: "${config.title || config.keyword}"

${template ? `Use a estrutura do template ${config.template} como base, adaptando para formato de artigo de blog.` : ''}

OBJETIVO DE CONVERSÃO: ${config.ctaObjective}
PÚBLICO: ${audienceType === 'b2b' ? 'Empresas (B2B)' : audienceType === 'b2c' ? 'Consumidores (B2C)' : 'B2B e B2C'}
SEGMENTO: ${segment.toUpperCase()}
${secondaryKws.length > 0 ? `KEYWORDS SECUNDÁRIAS PARA INCLUIR: ${secondaryKws.slice(0, 5).join(', ')}` : ''}

INSTRUÇÕES DE EXECUÇÃO:
1. Comece com um HOOK emocional ou dado impactante nos primeiros 3 segundos de leitura
2. Responda à pergunta principal do leitor imediatamente (técnica BLUF)
3. Desenvolva cada seção com propósito claro de aproximar o leitor da conversão
4. Use headlines que geram curiosidade e incluem benefícios
5. Integre prova social, autoridade e credenciais naturalmente
6. Distribua CTAs sutis ao longo do texto (não apenas no final)
7. Termine com urgência genuína e caminho claro para ação
${segment !== 'general' ? `8. IMPORTANTE: Siga rigorosamente as regras de compliance do segmento ${segment.toUpperCase()}` : ''}

LEMBRE-SE:
- Este artigo será indexado pelo Google, Bing e lido por IAs como ChatGPT e Claude
- O conteúdo deve estabelecer a empresa/profissional como AUTORIDADE no assunto
- Equilibre técnica de vendas com valor real entregue ao leitor
- O leitor deve sentir que ganhou conhecimento mesmo que não compre
${secondaryKws.length > 0 ? `- Inclua as palavras-chave secundárias de forma natural e relevante` : ''}

Comece agora com o artigo completo:`;
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
        JSON.stringify({ error: "Autorização necessária", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      log.authFailure(authError?.message || "claims_not_found");
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const userId = claimsData.claims.sub as string;
    log.authSuccess(userId);
    // ========== END AUTHENTICATION ==========

    const { config } = await req.json() as { config: LandingPageConfig };
    
    const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!AI_API_KEY) {
      throw new Error("AI API key is not configured");
    }

    const systemPrompt = buildSystemPrompt(config);
    const userPrompt = buildUserPrompt(config);

    log.info("generation_started", { template: config.template || "custom", keyword: config.keyword });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        log.warn("rate_limit_exceeded");
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos.", request_id: requestId }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        log.warn("payment_required");
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes.", request_id: requestId }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      log.error("ai_gateway_error", { status: response.status, response: text });
      return new Response(JSON.stringify({ error: "Erro no gateway de IA", request_id: requestId }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info("stream_started", { model: "google/gemini-3-flash-preview" });

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    log.error("generation_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido", request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
