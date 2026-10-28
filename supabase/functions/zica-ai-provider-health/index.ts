import '../_shared/nexus-runtime-bootstrap.ts';
import {paidLockedServe} from '../_shared/nexus-spend-lock.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPENAI_IMAGE_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') || 'gpt-image-2';
const ENV_OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const ENV_ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const CACHE_MS = 5 * 60 * 1000;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, s-maxage=60',
    'Access-Control-Allow-Origin': '*',
  },
});

async function vaultKey(provider: 'openai' | 'anthropic') {
  const { data, error } = await admin.rpc('get_zica_ai_provider_secret', { p_provider: provider });
  if (error) return '';
  return String(data || '').trim();
}

async function cachedOpenAI() {
  const { data } = await admin
    .from('zica_ai_provider_health_cache')
    .select('checked_at,payload')
    .eq('provider', 'openai')
    .maybeSingle();
  if (data?.checked_at && Date.now() - new Date(data.checked_at).getTime() < CACHE_MS && data?.payload?.openai) {
    return { ...data.payload, cached: true };
  }

  const vaultOpenAI = ENV_OPENAI_API_KEY ? '' : await vaultKey('openai');
  const openaiKey = ENV_OPENAI_API_KEY || vaultOpenAI;
  const vaultAnthropic = ENV_ANTHROPIC_API_KEY ? '' : await vaultKey('anthropic');
  const anthropicKey = ENV_ANTHROPIC_API_KEY || vaultAnthropic;

  if (!openaiKey) {
    const payload = {
      ok: false,
      openai: { configured: false, reachable: false, modelRequested: OPENAI_IMAGE_MODEL, keySource: 'missing' },
      anthropic: { configured: Boolean(anthropicKey), keySource: anthropicKey ? 'zica-ai-vault' : 'missing' },
    };
    await admin.from('zica_ai_provider_health_cache').upsert({ provider: 'openai', checked_at: new Date().toISOString(), payload });
    return payload;
  }

  let response: Response;
  let remote: any = {};
  try {
    response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(OPENAI_IMAGE_MODEL)}`, {
      headers: { Authorization: `Bearer ${openaiKey}` },
    });
    remote = await response.json().catch(() => ({}));
  } catch {
    const payload = {
      ok: false,
      openai: {
        configured: true,
        reachable: false,
        httpStatus: null,
        modelRequested: OPENAI_IMAGE_MODEL,
        modelResolved: null,
        keySource: ENV_OPENAI_API_KEY ? 'edge-secret' : 'zica-ai-vault',
        errorType: 'network_error',
        errorCode: null,
      },
      anthropic: { configured: Boolean(anthropicKey), keySource: ENV_ANTHROPIC_API_KEY ? 'edge-secret' : anthropicKey ? 'zica-ai-vault' : 'missing' },
    };
    await admin.from('zica_ai_provider_health_cache').upsert({ provider: 'openai', checked_at: new Date().toISOString(), payload });
    return payload;
  }

  const payload = {
    ok: response.ok,
    openai: {
      configured: true,
      reachable: response.ok,
      httpStatus: response.status,
      modelRequested: OPENAI_IMAGE_MODEL,
      modelResolved: remote?.id || null,
      keySource: ENV_OPENAI_API_KEY ? 'edge-secret' : 'zica-ai-vault',
      errorType: remote?.error?.type || null,
      errorCode: remote?.error?.code || null,
    },
    anthropic: {
      configured: Boolean(anthropicKey),
      keySource: ENV_ANTHROPIC_API_KEY ? 'edge-secret' : anthropicKey ? 'zica-ai-vault' : 'missing',
    },
  };
  await admin.from('zica_ai_provider_health_cache').upsert({ provider: 'openai', checked_at: new Date().toISOString(), payload });
  return payload;
}

paidLockedServe(async (req) => {
  if (!['GET', 'POST', 'OPTIONS'].includes(req.method)) return json({ error: 'method_not_allowed' }, 405);
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
  const result = await cachedOpenAI();
  return json(result, 200);
});
