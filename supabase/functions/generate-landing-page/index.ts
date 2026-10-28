import '../_shared/nexus-runtime-bootstrap.ts';
import {paidLockedServe} from '../_shared/nexus-spend-lock.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

paidLockedServe(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Landing page regida por instrucoes.md.",
        content: "Landing page gerada seguindo instrucoes.md." 
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
