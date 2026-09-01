import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const PRESET = 'madeira-1470-sp-2026';
const PORTAL_PROJECT_NAMES = ['Quem Votar Dr. Madeira 1470', 'VOTAR Deputado Dr. Madeira 1470'];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function portalId(url: string) {
  try {
    return new URL(url).hostname.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  } catch {
    return 'electoral-portal';
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'service_not_configured' }, 503);

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'unauthorized' }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: 'unauthorized' }, 401);
    if (user.app_metadata?.app_role !== 'ceo') return json({ error: 'forbidden' }, 403);

    const [{ data: settings, error: settingsError }, { data: projects, error: projectsError }] = await Promise.all([
      admin.from('electoral_portal_settings').select('*').eq('campaign_preset_id', PRESET).single(),
      admin.from('projects')
        .select('id,name,wordpress_url,wordpress_username,wordpress_app_password,is_connected')
        .in('name', PORTAL_PROJECT_NAMES),
    ]);
    if (settingsError || !settings) throw settingsError || new Error('electoral_settings_not_found');
    if (projectsError) throw projectsError;

    const results = [];
    for (const project of projects || []) {
      const baseUrl = String(project.wordpress_url || '').replace(/\/$/, '');
      const username = String(project.wordpress_username || '');
      const appPassword = String(project.wordpress_app_password || '');

      if (!project.is_connected) {
        results.push({ project: project.name, url: baseUrl, status: 'connection_disabled' });
        continue;
      }
      if (!baseUrl || !username || !appPassword) {
        results.push({ project: project.name, url: baseUrl, status: 'missing_credentials' });
        continue;
      }

      const endpoint = `${baseUrl}/wp-json/zica/v1/electoral-analytics/config`;
      const payload = {
        enabled: Boolean(settings.aggregate_analytics_enabled),
        portal_id: portalId(baseUrl),
        ga4_measurement_id: settings.ga4_measurement_id || '',
        gtm_web_container_id: settings.gtm_web_container_id || '',
        gtm_server_container_url: settings.gtm_server_container_url || '',
        disable_after: settings.analytics_disable_after || '2026-10-05T00:00:00-03:00',
        primary_portals: settings.primary_portals || [],
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        consent_mode_default: 'denied',
      };

      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${btoa(`${username}:${appPassword}`)}`,
            'User-Agent': 'Zica.ai Electoral Analytics Sync/1.0',
          },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => null);
        results.push({
          project: project.name,
          url: baseUrl,
          status: response.ok ? 'synced' : 'http_error',
          http_status: response.status,
          effective_enabled: response.ok ? Boolean(body?.effective_enabled) : null,
        });
      } catch (error) {
        results.push({
          project: project.name,
          url: baseUrl,
          status: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error',
        });
      }
    }

    const synced = results.filter((item) => item.status === 'synced').length;
    return json({
      ok: true,
      preset: PRESET,
      synced,
      total: results.length,
      complete: results.length > 0 && synced === results.length,
      results,
      privacy: {
        individual_voter_profiles: false,
        political_preference_inference: false,
        ad_personalization: false,
        google_signals: false,
      },
    });
  } catch (error) {
    console.error('sync-electoral-analytics-config:', error instanceof Error ? error.message : 'unknown_error');
    return json({ error: error instanceof Error ? error.message : 'unknown_error' }, 500);
  }
});
