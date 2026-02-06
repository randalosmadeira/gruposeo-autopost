import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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
}

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
  
  let systemPrompt = `Você é um copywriter especialista em landing pages de alta conversão. Você domina técnicas de persuasão, AIDA, PAS e storytelling para vendas.

REGRAS OBRIGATÓRIAS:
- Escreva em português brasileiro (${config.language})
- O conteúdo deve ter entre ${wordRange.min} e ${wordRange.max} palavras
- Use formatação Markdown com headers (H2, H3), listas e negrito
- Foque em copywriting persuasivo com gatilhos mentais
- Use CTAs claros e urgentes ao longo do texto
- A palavra-chave "${config.keyword}" deve aparecer naturalmente

TIPO DE OFERTA: ${config.offerType}
${config.location ? `LOCALIZAÇÃO: ${config.location}` : ''}

PÚBLICO-ALVO: ${config.targetAudience}
DOR PRINCIPAL: ${config.painPoint}
${config.differentials ? `DIFERENCIAIS: ${config.differentials}` : ''}
OBJETIVO DO CTA: ${config.ctaObjective}
${config.additionalInfo ? `INFORMAÇÕES ADICIONAIS: ${config.additionalInfo}` : ''}`;

  // Add company info
  if (config.companyName || config.companyPhone || config.companyAddress) {
    systemPrompt += `\n\nDADOS DA EMPRESA:`;
    if (config.companyName) systemPrompt += `\n- Nome: ${config.companyName}`;
    if (config.companyPhone) systemPrompt += `\n- Telefone/WhatsApp: ${config.companyPhone}`;
    if (config.companyAddress) systemPrompt += `\n- Endereço: ${config.companyAddress}`;
  }

  // Add template-specific instructions
  if (template) {
    systemPrompt += `\n\nESTRUTURA DA PÁGINA (TEMPLATE ${config.template?.toUpperCase()}):
${template.structure}

TOM DE VOZ: ${template.tone}

ELEMENTOS IMPORTANTES PARA ESTE NICHO: ${template.elements.join(', ')}`;
  }

  // Content structure options
  if (config.metaDescription) {
    systemPrompt += `\n\nInicie com uma META DESCRIÇÃO otimizada para SEO (150-160 caracteres) em um bloco separado.`;
  }

  if (config.lists) {
    systemPrompt += `\n- Use bullet points para benefícios e features`;
  }

  if (config.tables) {
    systemPrompt += `\n- Inclua uma tabela comparativa (você vs concorrência ou antes/depois)`;
  }

  if (config.faq) {
    systemPrompt += `\n- Adicione uma seção FAQ com 5-7 perguntas frequentes`;
  }

  if (config.conclusion) {
    systemPrompt += `\n- Finalize com uma seção de CTA forte com urgência e escassez`;
  }

  return systemPrompt;
}

function buildUserPrompt(config: LandingPageConfig): string {
  const template = config.template ? nicheTemplates[config.template] : null;
  
  return `Crie uma landing page de alta conversão para: "${config.title || config.keyword}"

${template ? `Use a estrutura do template ${config.template} para organizar as seções.` : ''}

Objetivo: ${config.ctaObjective}

Lembre-se:
- Cada seção deve ter um propósito claro
- Use headlines que geram curiosidade
- Inclua prova social quando possível
- Termine cada seção com micro-conversões ou preparação para o CTA principal

Comece agora com a landing page completa:`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Autorização necessária" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ========== END AUTHENTICATION ==========

    const { config } = await req.json() as { config: LandingPageConfig };
    
    const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!AI_API_KEY) {
      throw new Error("AI API key is not configured");
    }

    const systemPrompt = buildSystemPrompt(config);
    const userPrompt = buildUserPrompt(config);

    console.log("Generating landing page with template:", config.template || "custom");

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
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("generate-landing-page error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
