import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Retired 2026-09-17 (remediation of the 2026-08-22 accidental wipe, see
// docs/audits/2026-09-16-token-and-agent-audit.md). Publication today runs
// through publish-to-wordpress plus the zica_brain_jobs queue
// (zica-brain-tick -> wordpress-operations), not this standalone endpoint,
// which has had zero callers since the wipe. Returns 410 instead of
// pretending to work.
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
      message: 'auto-publish-article foi descontinuada. Publicação roda via publish-to-wordpress e a fila zica_brain_jobs.',
      use_instead: 'publish-to-wordpress',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
