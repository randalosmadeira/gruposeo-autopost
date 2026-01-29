import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ArticleConfig {
  keyword: string;
  secondaryKeywords: string;
  wordCount: 'short' | 'medium' | 'long' | 'very-long';
  tone: string;
  pointOfView: string;
  language: string;
  type: 'blog' | 'sales';
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  seoOptimization: boolean;
  customInstructions?: string;
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
};

function buildSystemPrompt(config: ArticleConfig): string {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { config } = await req.json() as { config: ArticleConfig };
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = buildSystemPrompt(config);
    const userPrompt = `Escreva um artigo completo e otimizado para SEO sobre: "${config.keyword}"

Estrutura esperada:
1. Título principal atraente (H1)
2. Introdução engajadora que prenda o leitor
3. Seções organizadas com subtítulos (H2/H3)
4. Conteúdo detalhado e útil
${config.includeFaq ? `5. FAQ com ${config.faqCount} perguntas e respostas` : ''}
${config.includeConclusion ? '6. Conclusão com resumo e CTA' : ''}

Comece agora:`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos à sua conta Lovable." }), {
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
    console.error("generate-article error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
