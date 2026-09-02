import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EXPECTED_FOLDER = '1NB_yQBM_2bGA5UC6JyCEgC54sjCHSyO6';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800' },
  });
}

function mimeFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function fetchImage(url: string, timeoutMs: number) {
  return fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Zica.ai Supporter Studio/1.1' },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'service_not_configured' }, 503);

  const url = new URL(req.url);
  const slug = String(url.searchParams.get('slug') || '').trim();
  const preview = url.searchParams.get('preview') === '1';

  if (!slug) {
    const { data, error } = await admin
      .from('supporter_avatar_candidate_presets')
      .select('slug,label,wardrobe,prop,sort_order')
      .eq('is_active', true)
      .eq('drive_folder_id', EXPECTED_FOLDER)
      .order('sort_order', { ascending: true });
    if (error) return json({ error: 'preset_list_unavailable' }, 503);
    return json({
      ok: true,
      agent: {
        name: 'NEXUS PHOTO 1470',
        role: 'Agente de edição fotográfica e renderização humanizada',
      },
      presets: (data || []).map((item) => ({
        ...item,
        previewUrl: `${SUPABASE_URL}/functions/v1/supporter-avatar-candidate-assets?slug=${encodeURIComponent(item.slug)}&preview=1`,
      })),
    });
  }

  const { data: preset, error } = await admin
    .from('supporter_avatar_candidate_presets')
    .select('slug,drive_folder_id,drive_file_id,drive_file_name,drive_download_url,is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !preset || preset.drive_folder_id !== EXPECTED_FOLDER) return json({ error: 'preset_not_found' }, 404);

  let response: Response;
  if (preview && preset.drive_file_id) {
    const thumbnailUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(preset.drive_file_id)}&sz=w640`;
    response = await fetchImage(thumbnailUrl, 10000);
    if (!response.ok) response = await fetchImage(preset.drive_download_url, 20000);
  } else {
    response = await fetchImage(preset.drive_download_url, 20000);
  }

  if (!response.ok) return json({ error: 'asset_upstream_unavailable' }, 502);

  const bytes = new Uint8Array(await response.arrayBuffer());
  const maxBytes = preview ? 4 * 1024 * 1024 : 15 * 1024 * 1024;
  if (!bytes.length || bytes.length > maxBytes) return json({ error: 'asset_size_invalid' }, 502);

  const upstreamType = response.headers.get('content-type') || '';
  const contentType = upstreamType.startsWith('image/') ? upstreamType.split(';')[0] : mimeFor(preset.drive_file_name);

  return new Response(bytes, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${preset.drive_file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'Cache-Control': preview
        ? 'public, max-age=604800, stale-while-revalidate=2592000, immutable'
        : 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
