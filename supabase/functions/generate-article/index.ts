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
    
    const prompt = `
      ${BEHAVIORAL_DIRECTIVES}
      ${GEO_AEO_2026_RULES}
      
      UNIDADE DECLARADA: ${unit}
      ASSUNTO: ${keyword}
      
      Instruções Adicionais: Siga estritamente instrucoes.md, agentes-conteudo-v5-atualizados-2.md e agente-imagens-e-conteudos-v1.md.
    `;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Geração regida por diretrizes v5.0 (ADV) e Imagens v1.0.",
        content: `Conteúdo para ${keyword} seguindo regras de Frontloading e OAB. [VERIFICAR]`,
        image_metadata: {
          unidade: unit,
          camada_intencao: 4,
          peca: "hero",
          imagem: {
            prompt: "Fotografia documental, mesa de trabalho de escritório jurídico sóbrio com documentos e luz natural de fim de tarde, plano médio, paleta bordô e preto, fotorrealista 8k. Sem martelo, sem balança, sem algemas, sem escudo.",
            alt: "Mesa de madeira escura com documentos jurídicos e caneta sob luz suave de fim de tarde.",
            formatos: ["1:1 1080x1080", "1.91:1 1200x628", "9:16 1080x1920"],
            rotulagem_ia: "[IMAGEM GERADA POR IA — verificar exigência de identificação antes de publicar]"
          },
          copy: {
            legenda: "Análise técnica sobre " + keyword + ". OAB/SP [VERIFICAR]",
            cta: "Saiba mais sobre seus direitos."
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
