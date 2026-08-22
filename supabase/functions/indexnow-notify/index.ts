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

    const { urls } = await req.json()
    
    // Get IndexNow config
    const { data: config, error: configError } = await supabaseClient
      .from('indexnow_config')
      .select('*')
      .eq('active', true)
      .single()

    if (configError || !config) {
      throw new Error('IndexNow configuration not found or inactive')
    }

    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: config.host,
        key: config.api_key,
        keyLocation: config.key_location,
        urlList: urls
      })
    })

    const status = response.status
    const body = await response.text()

    // Log the notification
    const { data: userData } = await supabaseClient.auth.getUser()
    for (const url of urls) {
      await supabaseClient.from('indexnow_logs').insert({
        url,
        status_code: status,
        response_body: body,
        user_id: userData.user?.id
      })
    }

    return new Response(JSON.stringify({ success: status === 200 || status === 202, status, body }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
