
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { callGemini } from "../_shared/gemini.ts";

const FUNCTION_NAME = "generate-secondary-keywords";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface KeywordRequest {
  keyword: string;
  segment?: string;
  audienceType?: 'b2b' | 'b2c' | 'both';
  language?: string;
  count?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ========== END AUTHENTICATION ==========

    const { keyword, segment = 'general', audienceType = 'both', language = 'pt-BR', count = 8 } = await req.json() as KeywordRequest;

    if (!keyword?.trim()) {
      return new Response(
        JSON.stringify({ error: "Palavra-chave é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build audience context
    const audienceContext = {
      'b2b': 'empresas, decisores de negócio, profissionais, corporativo',
      'b2c': 'consumidores finais, pessoas físicas, usuários',
      'both': 'empresas e consumidores finais',
    }[audienceType];

    // Build segment context
    const segmentContext: Record<string, string> = {
      'general': '',
      'juridico': 'área jurídica, advocacia, direito, lei',
      'saude': 'área da saúde, medicina, bem-estar, tratamentos',
      'fintech': 'finanças, investimentos, banking, pagamentos',
      'ecommerce': 'e-commerce, loja online, produtos, compras',
      'b2b-saas': 'software, SaaS, plataformas, tecnologia B2B',
      'educacao': 'educação, cursos, aprendizado, treinamento',
    };

    const systemPrompt = `Você é um especialista em SEO e pesquisa de palavras-chave. Sua tarefa é gerar palavras-chave secundárias (long-tail keywords) relevantes e de alta conversão.

REGRAS:
- Gere exatamente ${count} palavras-chave secundárias
- As keywords devem ser variações semânticas e complementares à palavra-chave principal
- Inclua:
  - Perguntas ("como", "o que é", "quanto custa", "qual o melhor")
  - Intenções de busca (informacional, transacional, comercial)
  - Variações com localização (quando aplicável)
  - Termos de cauda longa naturais
- Considere o público-alvo: ${audienceContext}
${segmentContext[segment] ? `- Contexto do segmento: ${segmentContext[segment]}` : ''}
- Idioma: ${language === 'pt-BR' ? 'Português brasileiro' : language}
- Retorne APENAS as keywords separadas por vírgula, sem numeração ou explicações`;

    const userPrompt = `Gere ${count} palavras-chave secundárias (long-tail) para: "${keyword}"`;

    const keywords = await callGemini(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "flash" }
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        keywords: keywords.trim(),
        count: keywords.split(',').filter((k: string) => k.trim()).length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating keywords:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    
    if (errorMessage.includes("Rate limit")) {
      return new Response(
        JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
