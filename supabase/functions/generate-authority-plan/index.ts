import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Retired 2026-09-17 (remediation of the 2026-08-22 accidental wipe, see
// docs/audits/2026-09-16-token-and-agent-audit.md). The frontend
// (src/hooks/useAuthorityPlanGeneration.tsx) calls
// generate-authority-plan-stream, not this function — this one has had zero
// callers since the wipe. Returns 410 instead of pretending to work.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      error: 'endpoint_retired',
      retired_at: '2026-09-17',
      message: 'generate-authority-plan foi descontinuada. Use generate-authority-plan-stream, que é a versão em uso pelo app.',
      use_instead: 'generate-authority-plan-stream',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
