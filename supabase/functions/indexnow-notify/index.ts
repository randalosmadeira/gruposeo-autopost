import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const payload = await req.json()
    const urls = Array.isArray(payload?.urls) ? payload.urls.filter((url: unknown) => typeof url === 'string' && url.length > 0) : []
    if (!urls.length) throw new Error('At least one URL is required')

    const { data: userData, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !userData.user?.id) throw new Error('Authenticated user required')

    const { data: config, error: configError } = await supabaseClient
      .from('indexnow_config')
      .select('*')
      .eq('active', true)
      .single()

    if (configError || !config) throw new Error('IndexNow configuration not found or inactive')

    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: config.host,
        key: config.api_key,
        keyLocation: config.key_location,
        urlList: urls,
      }),
    })

    const status = response.status
    const body = await response.text()
    const accepted = status === 200 || status === 202
    const now = new Date().toISOString()

    for (const url of urls) {
      await supabaseClient.from('indexnow_logs').insert({
        url,
        status_code: status,
        response_body: body,
        user_id: userData.user.id,
      })
    }

    // Persist only what IndexNow actually told us. An accepted submission is
    // NOT treated as confirmed indexing. Confirmation remains a separate state.
    await supabaseClient
      .from('articles')
      .update({
        indexing_status: accepted ? 'submitted' : 'failed',
        indexing_provider: 'indexnow',
        indexing_submitted_at: accepted ? now : null,
      })
      .eq('user_id', userData.user.id)
      .in('published_url', urls)

    return new Response(JSON.stringify({
      success: accepted,
      status,
      body,
      lifecycle: accepted ? 'submitted' : 'failed',
      confirmed: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
