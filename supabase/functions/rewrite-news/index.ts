import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { BEHAVIORAL_DIRECTIVES, GEO_AEO_2026_RULES } from "../_shared/behavioral-directives.ts"
import { MAD1470_SYSTEM_PROMPT } from "../_shared/electoral-directives.ts"


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
    
    let prompt = "";
    if (unit === "MAD1470") {
      prompt = `
        ${MAD1470_SYSTEM_PROMPT}
        
        FONTE PARA REESCRITA: ${sourceUrl}
        DIRETRIZES GEO/AEO 2026: ${GEO_AEO_2026_RULES}
        
        REGRAS DE REESCRITA ELEITORAL:
        - Originalidade ≥ 40% (Corpo).
        - Originalidade ≥ 80% (Título).
        - Tag [VERIFICAR] obrigatória.
      `;
    } else {
      prompt = `
        ${BEHAVIORAL_DIRECTIVES}
        ${GEO_AEO_2026_RULES}
        
        UNIDADE DECLARADA: ${unit}
        FONTE: ${sourceUrl}
        
        REGRAS DE REESCRITA COMERCIAL:
        - Originalidade ≥ 40% (Corpo).
        - Originalidade ≥ 80% (Título).
        - Tag [VERIFICAR] obrigatória.
      `;
    }


    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Reescrita v5.0 (ADV) e Imagens v1.0 preparada.",
        article: { 
          title: unit === "MAD1470" ? "Título Eleitoral Reescrito [VERIFICAR]" : "Título Reescrito (80% Original) [VERIFICAR]", 
          content: unit === "MAD1470" 
            ? `[ROTULAGEM PENDENTE — conteúdo produzido com auxílio de IA. Verificar exigência de identificação vigente antes de publicar.]\n\nConteúdo eleitoral reescrito seguindo 40/60 rule e Frontloading. [VERIFICAR]\n\nDr. Madeira · 1470 · Deputado Federal · São Paulo · CNPJ 68.504.175/0001-70`
            : "Conteúdo reescrito seguindo 40/60 rule e Frontloading." 
        },
        image_metadata: {
          unidade: unit,
          imagem: {
            prompt: unit === "MAD1470"
              ? "Fotografia documental, estilo campanha eleitoral popular, Dr. Madeira em evento público em São Paulo, luz natural, fotorrealista 8k. Sem martelo, sem balança."
              : "Fotografia documental, fachada de tribunal em São Paulo sob luz natural, plano aberto, paleta bordô e concreto, fotorrealista 8k. Sem martelo, sem balança, sem logotipo, sem escudo.",
            alt: unit === "MAD1470" ? "Dr. Madeira em evento público." : "Fachada de prédio jurídico com colunas clássicas sob céu azul claro.",
            formatos: ["1:1 1080x1080", "1.91:1 1200x628", "9:16 1080x1920"]
          },
          copy: {
            legenda: unit === "MAD1470" 
              ? `Compromisso renovado com São Paulo. [VERIFICAR]`
              : "Atualização jurídica relevante. OAB/SP [VERIFICAR]",
            cta: unit === "MAD1470" ? "Leia a proposta completa." : "Consulte a íntegra da decisão."
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
