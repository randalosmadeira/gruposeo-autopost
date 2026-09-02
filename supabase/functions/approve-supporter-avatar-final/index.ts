import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const PLATFORMS = ['square', 'portrait', 'landscape'];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'service_not_configured' }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.requestId || '').trim();
    const token = String(body.token || '').trim();
    if (!requestId || !token) return json({ error: 'request_and_token_required' }, 422);

    const tokenHash = await sha256(token);
    const { data: request, error: requestError } = await admin.from('supporter_avatar_requests')
      .select('id,status,expires_at')
      .eq('id', requestId)
      .eq('public_token_hash', tokenHash)
      .maybeSingle();
    if (requestError || !request) return json({ error: 'request_not_found_or_expired' }, 404);
    if (new Date(request.expires_at).getTime() < Date.now()) return json({ error: 'request_not_found_or_expired' }, 404);
    if (request.status !== 'completed') return json({ error: 'final_not_ready_for_approval', status: request.status }, 409);

    const { data: rows, error: outputError } = await admin.from('supporter_avatar_outputs')
      .select('platform,storage_path,mime_type,width,height,qa_score,created_at')
      .eq('request_id', requestId)
      .in('platform', PLATFORMS)
      .order('created_at', { ascending: false });
    if (outputError) throw outputError;

    const latest = new Map<string, any>();
    for (const row of rows || []) if (!latest.has(row.platform)) latest.set(row.platform, row);
    if (PLATFORMS.some((platform) => !latest.has(platform))) return json({ error: 'social_pack_incomplete' }, 409);

    const approvedAt = new Date().toISOString();
    const { error: updateError } = await admin.from('supporter_avatar_requests')
      .update({ supporter_approved_at: approvedAt, delivery_mode: 'social-pack-3', updated_at: approvedAt })
      .eq('id', requestId);
    if (updateError) throw updateError;

    const outputs: Array<Record<string, unknown>> = [];
    for (const platform of PLATFORMS) {
      const output = latest.get(platform);
      const { data: signed, error: signedError } = await admin.storage.from('supporter-avatar-generated').createSignedUrl(output.storage_path, 900);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('signed_download_failed');
      outputs.push({ platform, url: signed.signedUrl, mimeType: output.mime_type, width: output.width, height: output.height, qaScore: output.qa_score });
    }

    return json({
      ok: true,
      requestId,
      approvedAt,
      outputs,
      socialPublishing: false,
      deliveryMode: 'social-pack-3',
      disclosure: 'Imagem gerada por IA - Campanha Oficial',
    });
  } catch (error) {
    console.error('approve-supporter-avatar-final:', error instanceof Error ? error.message : 'unknown_error');
    return json({ error: error instanceof Error ? error.message : 'unknown_error' }, 500);
  }
});
