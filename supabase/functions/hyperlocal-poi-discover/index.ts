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
  keyword?: string; // ex: "audiência de custódia", "provedor de internet"
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

/**
 * Usa Gemini (BYOK do usuário) para expandir uma keyword + poi_type + cidade
 * em 3-5 queries Places específicas. Retorna array de strings.
 */
async function expandQueriesWithAI(
  geminiKey: string,
  keyword: string,
  poiType: string,
  city: string,
  state: string,
): Promise<string[]> {
  const prompt = `Você é um especialista em SEO local no Brasil. A partir da keyword do usuário e do tipo de POI, gere 3 a 5 consultas curtas (uma por linha, sem numeração, sem aspas) para o Google Places que ajudem a encontrar os POIs mais relevantes na cidade indicada. Foque em termos que um cliente jurídico usaria. Retorne SOMENTE as consultas, uma por linha.

Keyword: ${keyword}
Tipo de POI: ${poiType}
Cidade: ${city}/${state}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Gemini expand failed [${res.status}]: ${body}`);
    return [];
  }
  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text
    .split('\n')
    .map((s: string) => s.replace(/^[\s\-\*\d\.\)]+/, '').trim())
    .filter((s: string) => s.length > 2)
    .slice(0, 5);
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

    // Monta lista de queries: manual > AI-expandida (se keyword+gemini) > default
    let queries: string[] = [];
    if (payload.query) {
      queries = [`${payload.query} ${payload.city} ${payload.state_uf}`];
    } else if (payload.keyword && keys.gemini) {
      const aiQueries = await expandQueriesWithAI(
        keys.gemini,
        payload.keyword,
        payload.poi_type,
        payload.city,
        payload.state_uf,
      );
      queries = aiQueries.length > 0
        ? aiQueries.map((q) => `${q} ${payload.city} ${payload.state_uf}`)
        : [`${payload.keyword} ${DEFAULT_QUERIES[payload.poi_type]} ${payload.city} ${payload.state_uf}`];
    } else {
      queries = [
        [payload.keyword, DEFAULT_QUERIES[payload.poi_type], payload.city, payload.state_uf]
          .filter(Boolean)
          .join(' '),
      ];
    }

    // Executa Places por query, deduplica por endereço/nome
    const seen = new Set<string>();
    const places: any[] = [];
    for (const q of queries) {
      try {
        const found = await serperPlaces(keys.serper, q);
        for (const p of found) {
          const key = `${(p.title || '').toLowerCase()}|${(p.address || '').toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          places.push(p);
        }
      } catch (err) {
        console.warn(`serper query failed: ${q}`, err);
      }
    }

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
