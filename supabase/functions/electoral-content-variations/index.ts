import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MODEL = Deno.env.get('OPENAI_ELECTORAL_TEXT_MODEL') || 'gpt-5.4-mini';
const PRESET = 'madeira-1470-sp-2026';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokens(value: unknown) { return normalize(value).split(/\s+/).filter((item) => item.length >= 3); }
function extractOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  return (Array.isArray(payload?.output) ? payload.output : []).flatMap((item: any) => Array.isArray(item?.content) ? item.content : []).filter((item: any) => item?.type === 'output_text' && typeof item?.text === 'string').map((item: any) => item.text).join('\n').trim();
}
function extractJson(text: string) {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch { /* continue */ }
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(clean.slice(start, end + 1)); } catch { /* ignore */ } }
  return null;
}
async function readVaultOpenAI() {
  const { data, error } = await admin.rpc('get_zica_ai_provider_secret', { p_provider: 'openai' });
  if (error) throw new Error('openai_vault_unavailable');
  const key = String(data || '').trim();
  if (!key) throw new Error('openai_not_configured_in_zica_vault');
  return key;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const token = authHeader.slice(7);
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError || !user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || '').trim().slice(0, 500);
    if (query.length < 3) return json({ error: 'query_required' }, 422);
    const requestedFormats = Array.isArray(body?.formats) ? body.formats.map((item: unknown) => String(item)).slice(0, 8) : ['article','faq','video-outline','carousel-outline'];
    const variationCount = Math.max(1, Math.min(8, Number(body?.variationCount || 4)));
    const queryTokens = new Set(tokens(query));

    const { data: corpus, error: corpusError } = await client
      .from('electoral_agent_content_context')
      .select('unit_key,unit_type,title,body,topic,tags,verification_status,usage_scope,risk_flags,priority,source_locator,metadata,source_slug,source_title,authority_level')
      .eq('campaign_preset_id', PRESET)
      .order('priority', { ascending: false })
      .limit(150);
    if (corpusError) throw corpusError;

    const ranked = (corpus || []).map((item: any) => {
      const hay = [item.title, item.topic, ...(item.tags || []), item.body].join(' ');
      const matches = tokens(hay).reduce((sum, tokenValue) => sum + (queryTokens.has(tokenValue) ? 1 : 0), 0);
      const officialBoost = item.authority_level === 'official_campaign' ? 25 : 0;
      return { ...item, score: Number(item.priority || 0) + matches * 14 + officialBoost };
    }).sort((a: any, b: any) => b.score - a.score).slice(0, 16);

    if (!ranked.length) return json({ error: 'no_safe_corpus_context' }, 422);
    const context = ranked.map((item: any, index: number) => [
      `UNIDADE ${index + 1} [${item.unit_key}]`,
      `Fonte: ${item.source_title} (${item.source_slug})`,
      `Tipo: ${item.unit_type} | Status: ${item.verification_status} | Escopo: ${item.usage_scope}`,
      `Riscos: ${(item.risk_flags || []).join(', ') || 'nenhum'}`,
      `Localizador: ${JSON.stringify(item.source_locator || {})}`,
      `Conteúdo controlado: ${item.body}`,
    ].join('\n')).join('\n\n');

    const apiKey = await readVaultOpenAI();
    const instructions = `Você é um agente editorial eleitoral do Zica.ai. Produza somente VARIAÇÕES INFORMATIVAS E EDITORIAIS baseadas no corpus controlado fornecido.\n\nREGRAS INEGOCIÁVEIS:\n- Não recomende voto, candidato ou preferência política.\n- Não tente persuadir, mobilizar, convencer ou converter eleitores.\n- Não produza CTA eleitoral, pedido de compartilhamento para fins eleitorais, pedido de voto, linguagem de pressão ou técnicas de persuasão.\n- Não personalize por pessoa, cidade, bairro, idade, renda, religião, raça, opinião política ou qualquer atributo individual/sensível.\n- Não crie microtargeting nem segmentação comportamental.\n- Não invente fatos, dados, pesquisas, citações, leis, decisões, fontes ou causalidades.\n- Itens campaign_official representam PROPOSTAS/POSIÇÕES da campanha, nunca resultados garantidos.\n- Itens needs_primary_source devem manter [VERIFICAR FONTE PRIMÁRIA] junto à afirmação correspondente.\n- Itens needs_external_verification devem manter [RECONSULTAR FONTE EXTERNA].\n- Alegações sobre terceiros devem ser atribuídas como alegação/posição da defesa até confirmação documental.\n- Conteúdo bloqueado/archive_only não está presente no corpus e não deve ser reconstruído por inferência.\n- Preserve neutralidade factual e revisão humana obrigatória.\n- Responda em português do Brasil e APENAS em JSON válido.`;

    const prompt = `PAUTA SOLICITADA: ${query}\nFORMATOS PERMITIDOS: ${requestedFormats.join(', ')}\nQUANTIDADE: ${variationCount}\n\nCORPUS CONTROLADO:\n${context}\n\nRetorne exatamente este formato JSON:\n{\n  "variations": [\n    {\n      "title": "",\n      "format": "article|faq|video-outline|carousel-outline|press-release|social-caption-informative",\n      "editorial_angle": "",\n      "summary": "",\n      "outline": [""],\n      "source_units": ["unit_key"],\n      "verification_notes": [""],\n      "human_review_required": true\n    }\n  ]\n}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let payload: any;
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, store: false, reasoning: { effort: 'low' }, instructions, input: prompt, max_output_tokens: 6500 }),
      });
      payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`openai_variations_http_${response.status}`);
    } finally { clearTimeout(timeout); }

    const parsed = extractJson(extractOutputText(payload));
    if (!parsed || !Array.isArray(parsed.variations)) throw new Error('openai_variations_invalid_json');
    const variations = parsed.variations.slice(0, variationCount).map((item: any) => ({
      title: String(item?.title || '').slice(0, 180),
      format: String(item?.format || 'article').slice(0, 50),
      editorial_angle: String(item?.editorial_angle || '').slice(0, 500),
      summary: String(item?.summary || '').slice(0, 1800),
      outline: Array.isArray(item?.outline) ? item.outline.map((entry: unknown) => String(entry).slice(0, 500)).slice(0, 20) : [],
      source_units: Array.isArray(item?.source_units) ? item.source_units.map((entry: unknown) => String(entry)).filter((entry: string) => ranked.some((unit: any) => unit.unit_key === entry)).slice(0, 16) : [],
      verification_notes: Array.isArray(item?.verification_notes) ? item.verification_notes.map((entry: unknown) => String(entry).slice(0, 500)).slice(0, 20) : [],
      human_review_required: true,
    }));

    return json({
      ok: true,
      preset_id: PRESET,
      query,
      provider: 'openai', model: MODEL, keySource: 'zica-ai-vault',
      corpus_units_used: ranked.map((item: any) => ({ unit_key: item.unit_key, title: item.title, verification_status: item.verification_status, source_slug: item.source_slug })),
      variations,
      directives: { persuasive_output: false, vote_recommendation: false, microtargeting: false, human_review_required: true },
      usage: payload?.usage || null,
      response_id: payload?.id || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('electoral-content-variations:', message);
    return json({ error: message }, message.includes('not_configured') ? 503 : 400);
  }
});
