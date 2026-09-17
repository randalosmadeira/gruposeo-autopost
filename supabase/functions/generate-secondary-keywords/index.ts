import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Retired 2026-09-17 (remediation of the 2026-08-22 accidental wipe, see
// docs/audits/2026-09-16-token-and-agent-audit.md). This endpoint has no active
// caller in the frontend, no cron trigger, and is not referenced in
// supabase/config.toml beyond its own entry — restoring the pre-wipe logic
// would revive dead code with no consumer. Returns 410 instead of pretending
// to work, so a client that still calls it fails loudly instead of silently.
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
      message: 'generate-secondary-keywords foi descontinuada por falta de uso ativo. Não há substituto direto hoje.',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
