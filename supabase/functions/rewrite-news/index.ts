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
    const { sourceUrl, unit = "ADV" } = await req.json();
    
    const prompt = `
      ${BEHAVIORAL_DIRECTIVES}
      ${GEO_AEO_2026_RULES}
      
      UNIDADE DECLARADA: ${unit}
      FONTE: ${sourceUrl}
      
      REGRAS DE REESCRITA:
      - Originalidade ≥ 40% (Corpo).
      - Originalidade ≥ 80% (Título).
      - Tag [VERIFICAR] obrigatória para incertezas.
      - Siga agente-imagens-e-conteudos-v1.md para prompts de imagem.
    `;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Reescrita v5.0 (ADV) e Imagens v1.0 preparada.",
        article: { 
          title: "Título Reescrito (80% Original) [VERIFICAR]", 
          content: "Conteúdo reescrito seguindo 40/60 rule e Frontloading." 
        },
        image_metadata: {
          unidade: unit,
          imagem: {
            prompt: "Fotografia documental, fachada de tribunal em São Paulo sob luz natural, plano aberto, paleta bordô e concreto, fotorrealista 8k. Sem martelo, sem balança, sem logotipo.",
            alt: "Fachada de prédio jurídico com colunas clássicas sob céu azul claro.",
            formatos: ["1:1 1080x1080", "1.91:1 1200x628", "9:16 1080x1920"]
          }
        },
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
