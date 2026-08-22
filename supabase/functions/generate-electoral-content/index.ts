import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { keyword, template, config, notifyIndexNow } = await req.json();
    const today = new Date('2026-08-22');
    const startCampaign = new Date('2026-08-16');
    const endCampaign = new Date('2026-10-04');
    
    let phase = 'pre-campanha';
    if (today >= startCampaign && today <= endCampaign) phase = 'campanha';
    else if (today > endCampaign) phase = 'pos-pleito';

    const targetWords = config.articleType === 'pillar' ? 2200 : (config.articleType === 'satellite' ? 1400 : 900);

    return new Response(
      JSON.stringify({ 
        message: `Gerando conteúdo eleitoral (${phase}) para: ${keyword}`,
        target_words: targetWords,
        conformity: "Regra Ouro GEO 2026 ativa",
        content: `[ROTULAGEM PENDENTE — conteúdo produzido com auxílio de IA. Verificar exigência de identificação vigente antes de publicar.]\n\nArtigo sobre ${keyword} focado na persona Wanderson (${config.articleType}). [VERIFICAR]\n\nDr. Madeira 1470 · SP · CNPJ 68.504.175/0001-70`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
