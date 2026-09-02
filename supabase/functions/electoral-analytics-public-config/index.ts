import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PRESET = 'madeira-1470-sp-2026';
const ALLOWED_PORTALS = new Set([
  'quemvotar.drmadeira1470.com.br',
  'votardeputadofederal.drmadeira1470.com.br',
  'drmadeira1470.com.br',
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
      .select('primary_portals,aggregate_analytics_enabled,analytics_disable_after,geo_reporting_level,ga4_measurement_id,gtm_web_container_id,gtm_server_container_url,optin_popup_enabled,optin_scroll_trigger_percent,optin_exit_intent_enabled,optin_dismiss_hours,optin_success_suppress_days,optin_privacy_url,optin_instagram_enabled,optin_instagram_url,optin_instagram_label')
      .eq('campaign_preset_id', PRESET)
      .single();
    if (error || !settings) throw error || new Error('settings_not_found');

    const disableAfter = settings.analytics_disable_after ? new Date(settings.analytics_disable_after) : null;
    const withinWindow = !disableAfter || disableAfter.getTime() > Date.now();
    const analyticsEnabled = Boolean(settings.aggregate_analytics_enabled) && withinWindow;
    const optinEnabled = Boolean(settings.optin_popup_enabled) && withinWindow;

    return json({
      ok: true,
      portal_id: portalId(portal),
      enabled: analyticsEnabled || optinEnabled,
      analytics_enabled: analyticsEnabled,
      ga4_measurement_id: settings.ga4_measurement_id || '',
      gtm_web_container_id: settings.gtm_web_container_id || '',
      gtm_server_container_url: settings.gtm_server_container_url || '',
      disable_after: settings.analytics_disable_after || null,
      primary_portals: settings.primary_portals || [],
      geo_reporting_level: settings.geo_reporting_level === 'state' ? 'state' : 'city',
      consent_mode_default: 'denied',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      optin: {
        enabled: optinEnabled,
        api_url: `${SUPABASE_URL}/functions/v1/electoral-optin-public`,
        scroll_trigger_percent: Math.max(1, Math.min(90, Number(settings.optin_scroll_trigger_percent || 10))),
        exit_intent_enabled: Boolean(settings.optin_exit_intent_enabled),
        dismiss_hours: Math.max(1, Math.min(720, Number(settings.optin_dismiss_hours || 24))),
        success_suppress_days: Math.max(1, Math.min(365, Number(settings.optin_success_suppress_days || 90))),
        privacy_url: settings.optin_privacy_url || '',
        title: 'Quero ajudar na campanha',
        subtitle: 'Deixe seu contato e diga como quer ajudar.',
        button_label: '🪵 MADEIRAAA NELESS',
        instagram_enabled: Boolean(settings.optin_instagram_enabled),
        instagram_url: settings.optin_instagram_url || '',
        instagram_label: settings.optin_instagram_label || 'Seguir @rdmadvogados no Instagram',
      },
      privacy: {
        individual_voter_profiles: false,
        political_preference_inference: false,
        precise_location_collection: false,
        raw_ip_storage: false,
        ad_personalization: false,
        browsing_history_linked_to_contact: false,
        personalized_political_targeting: false,
      },
    });
  } catch (error) {
    console.error('electoral-analytics-public-config:', error instanceof Error ? error.message : 'unknown_error');
    return json({ error: 'config_unavailable' }, 503);
  }
});
