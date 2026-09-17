import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Retired 2026-09-17 (remediation of the 2026-08-22 accidental wipe, see
// docs/audits/2026-09-16-token-and-agent-audit.md). The real news-monitoring
// feature runs through execute-news-agents (tables news_agents / rewrite-news),
// not this singular endpoint, which has had zero callers since the wipe.
// Returns 410 instead of pretending to work.
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
      message: 'news-agent foi descontinuada. O monitoramento de notícias roda em execute-news-agents.',
      use_instead: 'execute-news-agents',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
