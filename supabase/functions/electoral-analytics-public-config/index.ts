import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PRESET = 'madeira-1470-sp-2026';
const ALLOWED_PORTALS = new Set([
  'quemvotar.drmadeira1470.com.br',
  'votardeputadofederal.drmadeira1470.com.br',
]);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=60, stale-while-revalidate=240',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function portalId(host: string) {
  return host.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'service_not_configured' }, 503);

  try {
    const url = new URL(req.url);
    const portal = String(url.searchParams.get('portal') || '').trim().toLowerCase().replace(/^www\./, '');
    if (!ALLOWED_PORTALS.has(portal)) return json({ error: 'portal_not_allowed' }, 404);

    const { data: settings, error } = await admin
      .from('electoral_portal_settings')
      .select('primary_portals,aggregate_analytics_enabled,analytics_disable_after,geo_reporting_level,ga4_measurement_id,gtm_web_container_id,gtm_server_container_url')
      .eq('campaign_preset_id', PRESET)
      .single();
    if (error || !settings) throw error || new Error('settings_not_found');

    const disableAfter = settings.analytics_disable_after ? new Date(settings.analytics_disable_after) : null;
    const withinWindow = !disableAfter || disableAfter.getTime() > Date.now();
    const enabled = Boolean(settings.aggregate_analytics_enabled) && withinWindow;

    return json({
      ok: true,
      portal_id: portalId(portal),
      enabled,
      ga4_measurement_id: settings.ga4_measurement_id || '',
      gtm_web_container_id: settings.gtm_web_container_id || '',
      gtm_server_container_url: settings.gtm_server_container_url || '',
      disable_after: settings.analytics_disable_after || null,
      primary_portals: settings.primary_portals || [],
      geo_reporting_level: settings.geo_reporting_level === 'state' ? 'state' : 'city',
      consent_mode_default: 'denied',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      privacy: {
        individual_voter_profiles: false,
        political_preference_inference: false,
        precise_location_collection: false,
        raw_ip_storage: false,
        ad_personalization: false,
      },
    });
  } catch (error) {
    console.error('electoral-analytics-public-config:', error instanceof Error ? error.message : 'unknown_error');
    return json({ error: 'config_unavailable' }, 503);
  }
});
