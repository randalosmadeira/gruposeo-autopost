import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { BEHAVIORAL_DIRECTIVES, GEO_AEO_2026_RULES } from "../_shared/behavioral-directives.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { keyword, unit = "ADV" } = await req.json();
    
    // Simulação de prompt seguindo v5.0
    const prompt = `
      ${BEHAVIORAL_DIRECTIVES}
      ${GEO_AEO_2026_RULES}
      
      UNIDADE DECLARADA: ${unit}
      ASSUNTO: ${keyword}
      
      Instruções Adicionais: Siga estritamente instrucoes.md e agentes-conteudo-v5-atualizados-2.md.
    `;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Geração regida por diretrizes v5.0 (ADV).",
        content: `Conteúdo para ${keyword} seguindo regras de Frontloading e OAB. [VERIFICAR]`,
        prompt_preview: prompt.substring(0, 200) + "..."
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
