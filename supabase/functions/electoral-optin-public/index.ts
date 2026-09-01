import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PRESET = 'madeira-1470-sp-2026';
const DAILY_LIMIT = 5;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedHosts = new Set([
  'quemvotar.drmadeira1470.com.br',
  'votardeputadofederal.drmadeira1470.com.br',
  'drmadeira1470.com.br',
  'www.drmadeira1470.com.br',
  'app.zica.posts.zicajuris.com.br',
]);

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  let allowedOrigin = '';
  try {
    const url = new URL(origin);
    if (allowedHosts.has(url.hostname.toLowerCase())) allowedOrigin = origin;
  } catch { /* sem origin valido */ }

  return {
    'Access-Control-Allow-Origin': allowedOrigin || 'https://drmadeira1470.com.br',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function normalize(value: unknown, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeEmail(value: unknown) {
  const email = normalize(value, 180).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizePhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 15);
  return digits.length >= 10 ? digits : '';
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

function fingerprint(req: Request) {
  const ip = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const ua = req.headers.get('user-agent') || 'unknown';
  return `${ip}|${ua}`;
}

function portalFromRequest(req: Request, supplied: unknown) {
  const source = normalize(supplied, 180);
  try {
    const suppliedUrl = new URL(source.startsWith('http') ? source : `https://${source}`);
    if (allowedHosts.has(suppliedUrl.hostname.toLowerCase())) return suppliedUrl.hostname.toLowerCase();
  } catch { /* usar origin */ }
  try {
    const origin = new URL(req.headers.get('origin') || '');
    if (allowedHosts.has(origin.hostname.toLowerCase())) return origin.hostname.toLowerCase();
  } catch { /* ignorar */ }
  return 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(req, { error: 'service_not_configured' }, 503);

  try {
    const body = await req.json();
    if (normalize(body.website, 120)) return json(req, { ok: true }, 200); // honeypot silencioso

    const fullName = normalize(body.fullName, 120);
    const email = normalizeEmail(body.email);
    const whatsapp = normalizePhone(body.whatsapp);
    const city = normalize(body.city, 100);
    const state = normalize(body.state, 2).toUpperCase();
    const emailUpdates = body.emailUpdates === true;
    const whatsappUpdates = body.whatsappUpdates === true;
    const volunteer = body.volunteer === true;
    const consentContact = body.consentContact === true;
    const sourcePortal = portalFromRequest(req, body.sourcePortal);

    if (fullName.length < 2) return json(req, { error: 'full_name_required' }, 422);
    if (!email && !whatsapp) return json(req, { error: 'contact_required' }, 422);
    if (state && !/^[A-Z]{2}$/.test(state)) return json(req, { error: 'invalid_state' }, 422);
    if (!consentContact) return json(req, { error: 'consent_required' }, 422);
    if (!emailUpdates && !whatsappUpdates && !volunteer) return json(req, { error: 'purpose_required' }, 422);
    if (emailUpdates && !email) return json(req, { error: 'email_required_for_email_updates' }, 422);
    if (whatsappUpdates && !whatsapp) return json(req, { error: 'whatsapp_required_for_whatsapp_updates' }, 422);
    if (sourcePortal === 'unknown') return json(req, { error: 'source_not_allowed' }, 403);

    const fingerprintHash = await sha256(fingerprint(req));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('electoral_campaign_optins')
      .select('id', { count: 'exact', head: true })
      .eq('fingerprint_hash', fingerprintHash)
      .gte('created_at', since);
    if ((count || 0) >= DAILY_LIMIT) return json(req, { error: 'daily_limit_reached' }, 429);

    const contactHash = await sha256(`${email}|${whatsapp}`);
    const now = new Date().toISOString();
    const { error } = await admin.from('electoral_campaign_optins').upsert({
      campaign_preset_id: PRESET,
      full_name: fullName,
      email: email || null,
      whatsapp: whatsapp || null,
      city: city || null,
      state: state || null,
      email_updates: emailUpdates,
      whatsapp_updates: whatsappUpdates,
      volunteer,
      consent_contact: true,
      consent_at: now,
      privacy_notice_version: '2026-09-01',
      source_portal: sourcePortal,
      contact_hash: contactHash,
      fingerprint_hash: fingerprintHash,
      status: 'active',
      purpose: 'campaign_contact_and_volunteer_management',
      updated_at: now,
      withdrawn_at: null,
    }, { onConflict: 'campaign_preset_id,contact_hash' });

    if (error) throw error;

    return json(req, {
      ok: true,
      registered: true,
      purpose: 'campaign_contact_and_volunteer_management',
      personalizedPoliticalTargeting: false,
      browsingHistoryLinked: false,
    }, 201);
  } catch (error) {
    console.error('electoral-optin-public:', error instanceof Error ? error.message : 'unknown_error');
    return json(req, { error: 'registration_failed' }, 500);
  }
});
