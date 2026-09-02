import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const PRESET = 'madeira-1470-sp-2026';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: unknown) {
  return normalize(value).split(/\s+/).filter((item) => item.length >= 3);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: 'service_not_configured' }, 503);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const token = authHeader.slice(7);
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError || !user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || '').slice(0, 500);
    const requestedTopics = Array.isArray(body?.topics) ? body.topics.map((item: unknown) => String(item).slice(0, 80)).slice(0, 12) : [];
    const requestedTypes = Array.isArray(body?.unitTypes) ? body.unitTypes.map((item: unknown) => String(item).slice(0, 80)).slice(0, 12) : [];
    const limit = Math.max(1, Math.min(30, Number(body?.limit || 12)));

    let request = client
      .from('electoral_agent_content_context')
      .select('id,unit_key,unit_type,title,body,topic,tags,verification_status,usage_scope,risk_flags,priority,source_locator,metadata,source_slug,source_title,source_type,source_filename,authority_level,factual_use_status,source_sha256')
      .eq('campaign_preset_id', PRESET)
      .order('priority', { ascending: false })
      .limit(150);
    if (requestedTypes.length) request = request.in('unit_type', requestedTypes);
    const { data, error } = await request;
    if (error) throw error;

    const needle = new Set(tokens([query, ...requestedTopics].join(' ')));
    const ranked = (data || []).map((item: any) => {
      const haystack = [item.title, item.topic, ...(item.tags || []), item.body].join(' ');
      const hayTokens = tokens(haystack);
      const matches = hayTokens.reduce((sum, tokenValue) => sum + (needle.has(tokenValue) ? 1 : 0), 0);
      const topicMatches = requestedTopics.reduce((sum: number, topic: string) => sum + (normalize(haystack).includes(normalize(topic)) ? 3 : 0), 0);
      const sourceBoost = item.authority_level === 'official_campaign' ? 20 : 0;
      const verificationPenalty = item.verification_status === 'needs_primary_source' || item.verification_status === 'needs_external_verification' ? 8 : 0;
      return { ...item, relevance_score: Number(item.priority || 0) + matches * 12 + topicMatches * 10 + sourceBoost - verificationPenalty };
    }).sort((a: any, b: any) => b.relevance_score - a.relevance_score || String(a.title).localeCompare(String(b.title)));

    const selected = ranked.slice(0, limit).map((item: any) => ({
      ...item,
      agent_instruction: item.verification_status === 'campaign_official'
        ? 'Trate como proposta/posição oficial da campanha, nunca como resultado garantido.'
        : item.verification_status === 'needs_external_verification'
          ? 'Reconsulte a fonte externa antes de usar como fato.'
          : item.verification_status === 'needs_primary_source'
            ? 'Use apenas como pista editorial e mantenha [VERIFICAR FONTE PRIMÁRIA] até conferir o documento original.'
            : 'Use conforme o escopo editorial e a revisão humana.',
    }));

    return json({
      ok: true,
      preset_id: PRESET,
      query,
      count: selected.length,
      units: selected,
      directives: {
        neverRecommendVote: true,
        neverPersuade: true,
        neverMicrotarget: true,
        neverInferPoliticalPreference: true,
        neverTreatNeedsVerificationAsFact: true,
        proposalMustBeLabeledAsProposal: true,
        allegationsRequireAttribution: true,
        humanReviewRequired: true,
        blockedArchiveContentExcluded: true,
      },
    });
  } catch (error) {
    console.error('electoral-agent-context:', error instanceof Error ? error.message : 'unknown_error');
    return json({ error: 'context_unavailable' }, 500);
  }
});
