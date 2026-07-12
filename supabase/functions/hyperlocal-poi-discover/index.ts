/**
 * hyperlocal-poi-discover — Descoberta semiautomática de POIs (fóruns, delegacias, polos)
 * usando Serper.dev (BYOK em user_settings.serper_api_key).
 *
 * Fluxo:
 *   POST { city, state_uf, poi_type, query?, limit? }
 *   → chama Serper Places + Search
 *   → normaliza (nome, endereço, bairro, lat/lng, url oficial)
 *   → grava em `poi_hyperlocal` com status='draft' e discovery_source='serper'
 *   → retorna a lista para o usuário aprovar no painel.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { fetchUserKeys } from '../_shared/byok-resolver.ts';

interface DiscoverPayload {
  city: string;
  state_uf: string;
  poi_type: 'forum' | 'delegacia' | 'polo' | 'tribunal' | 'cartorio' | 'outro';
  query?: string;
  limit?: number;
}

const DEFAULT_QUERIES: Record<DiscoverPayload['poi_type'], string> = {
  forum: 'fórum regional tribunal de justiça',
  delegacia: 'delegacia de polícia distrito policial',
  polo: 'polo tecnológico distrito industrial',
  tribunal: 'tribunal de justiça',
  cartorio: 'cartório de registro',
  outro: '',
};

async function serperPlaces(apiKey: string, q: string, gl = 'br', hl = 'pt-br'): Promise<any[]> {
  const res = await fetch('https://google.serper.dev/places', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl, hl, num: 20 }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Serper places failed [${res.status}]: ${body}`);
  }
  const data = await res.json();
  return Array.isArray(data.places) ? data.places : [];
}

function extractNeighborhood(address?: string): string | null {
  if (!address) return null;
  // Heurística leve: "Rua X, 100 - Bairro, Cidade - UF"
  const parts = address.split(' - ').map((s) => s.trim());
  if (parts.length >= 3) {
    const middle = parts[1];
    if (middle && !/\d/.test(middle) && middle.length < 50) return middle;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = (await req.json()) as DiscoverPayload;
    if (!payload.city || !payload.state_uf || !payload.poi_type) {
      return new Response(
        JSON.stringify({ error: 'city, state_uf e poi_type são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const keys = await fetchUserKeys(user.id);
    if (!keys.serper) {
      return new Response(
        JSON.stringify({
          error: 'Serper API key não configurada. Adicione em Configurações → BYOK → serper_api_key.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const q = [
      payload.query || DEFAULT_QUERIES[payload.poi_type],
      payload.city,
      payload.state_uf,
    ]
      .filter(Boolean)
      .join(' ');

    const places = await serperPlaces(keys.serper, q);
    const limit = Math.min(payload.limit ?? 15, 30);

    // Normaliza + insere como draft com service role
    const admin = createClient(supabaseUrl, serviceKey);
    const rows = places.slice(0, limit).map((p: any) => ({
      user_id: user.id,
      poi_type: payload.poi_type,
      name: p.title || p.name || 'Sem nome',
      full_address: p.address || null,
      neighborhood: extractNeighborhood(p.address),
      city: payload.city,
      state_uf: payload.state_uf,
      latitude: typeof p.latitude === 'number' ? p.latitude : null,
      longitude: typeof p.longitude === 'number' ? p.longitude : null,
      official_url: p.website || null,
      opening_hours: p.openingHours || null,
      is_24_7: /24 ?h|24\/7/i.test(p.openingHours || ''),
      discovery_source: 'serper',
      status: 'draft',
      raw_payload: p,
    }));

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, inserted: 0, message: 'Nenhum resultado encontrado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from('poi_hyperlocal')
      .insert(rows)
      .select();

    if (insertError) {
      console.error('poi_hyperlocal insert failed', insertError);
      return new Response(
        JSON.stringify({ error: 'Insert failed', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, inserted: inserted?.length ?? 0, pois: inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('hyperlocal-poi-discover error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
