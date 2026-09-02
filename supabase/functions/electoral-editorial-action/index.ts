import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { formatSafeElectoralContext, loadSafeElectoralContext } from '../_shared/electoral-content-context.ts';

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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function stripTags(value = '') { return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function extractOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  return (Array.isArray(payload?.output) ? payload.output : [])
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((item: any) => item?.type === 'output_text' && typeof item?.text === 'string')
    .map((item: any) => item.text).join('\n').trim();
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
async function callOpenAI(apiKey: string, instructions: string, input: string, maxOutputTokens = 4500) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, store: false, reasoning: { effort: 'low' }, instructions, input, max_output_tokens: maxOutputTokens }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`openai_editorial_http_${response.status}`);
    const text = extractOutputText(payload);
    if (!text) throw new Error('openai_editorial_empty_output');
    return { text, usage: payload?.usage || null, responseId: payload?.id || null };
  } finally { clearTimeout(timeout); }
}

const baseInstructions = `Você atua como auditor/editor técnico do módulo eleitoral Zica.ai.\n\nREGRAS INEGOCIÁVEIS:\n- Trabalhe somente com qualidade editorial, factualidade, clareza, estrutura, fontes, acessibilidade, conformidade e erros técnicos.\n- Não recomende voto, não tente persuadir, mobilizar, converter ou pressionar eleitores.\n- Não personalize mensagem por cidade, bairro, perfil, opinião política ou qualquer atributo individual/sensível.\n- Não infira preferência política nem crie perfil individual de eleitor.\n- Não invente fatos, estatísticas, leis, julgados, fontes, URLs, depoimentos, motivações de terceiros ou experiências pessoais.\n- O CORPUS CONTROLADO é apoio editorial, não substitui fonte primária.\n- Itens campaign_official são propostas/posições da campanha e devem ser rotulados como proposta; nunca prometê-los como resultado.\n- Itens needs_primary_source exigem [VERIFICAR FONTE PRIMÁRIA] até conferência documental.\n- Itens needs_external_verification exigem [RECONSULTAR FONTE EXTERNA].\n- Alegações sobre terceiros exigem atribuição clara à defesa/documentos apresentados enquanto não verificadas.\n- Conteúdo archive_only/prohibited_as_fact é excluído do corpus e não pode ser reconstruído por inferência.\n- Preserve identificação eleitoral, avisos de revisão humana, rotulagem de IA quando aplicável e rodapé existente.\n- Não trate SEO como garantia de ranking ou indexação.\n- Não publique nada. Esta função somente analisa ou corrige um rascunho armazenado.\n- Responda em português do Brasil.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const token = authHeader.slice(7);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const articleId = String(body?.articleId || '').trim();
    const action = String(body?.action || '').trim();
    if (!articleId || !['reanalyze', 'correct'].includes(action)) return json({ error: 'invalid_request' }, 400);

    const { data: article, error: articleError } = await userClient
      .from('articles')
      .select('id,user_id,title,keyword,content,status,project_id,error_message,config,word_count,updated_at')
      .eq('id', articleId).maybeSingle();
    if (articleError) throw articleError;
    if (!article || article.user_id !== user.id) return json({ error: 'article_not_found' }, 404);
    if (article?.config?.electoral !== true) return json({ error: 'not_electoral_content' }, 422);

    const content = String(article.content || '').slice(0, 160000);
    if (!content.trim()) return json({ error: 'article_content_empty' }, 422);
    const presetId = String(article?.config?.campaignPresetId || PRESET);
    const corpusUnits = await loadSafeElectoralContext(userClient, presetId, `${article.title || ''} ${article.keyword || ''}`, 14);
    const corpusContext = formatSafeElectoralContext(corpusUnits);
    const corpusKeys = corpusUnits.map((item) => item.unit_key);
    const apiKey = await readVaultOpenAI();

    if (action === 'reanalyze') {
      const prompt = `Analise o rascunho abaixo sem reescrevê-lo. Compare-o também com a BASE EDITORIAL CONTROLADA e aponte quando o rascunho extrapolar, confundir proposta com fato ou usar alegação sem atribuição. Retorne APENAS JSON válido, sem markdown, no formato:\n{\n  "score": 0,\n  "ready_for_human_review": false,\n  "summary": "",\n  "factual_risks": [],\n  "missing_sources": [],\n  "compliance_risks": [],\n  "technical_errors": [],\n  "structure_issues": [],\n  "recommended_corrections": []\n}\n\nTítulo: ${article.title || ''}\nPauta: ${article.keyword || ''}\nErro técnico registrado: ${article.error_message || 'nenhum'}\n\nBASE EDITORIAL CONTROLADA:\n${corpusContext || '[nenhuma unidade recuperada]'}\n\nCONTEÚDO:\n${content}`;
      const result = await callOpenAI(apiKey, baseInstructions, prompt, 3800);
      const analysis = extractJson(result.text);
      if (!analysis) throw new Error('openai_editorial_invalid_json');
      const config = { ...(article.config || {}), electoralEditorialReview: { ...analysis, reviewedAt: new Date().toISOString(), provider: 'openai', model: MODEL, keySource: 'zica-ai-vault', corpusUnits: corpusKeys, usage: result.usage, responseId: result.responseId } };
      const { error: updateError } = await userClient.from('articles').update({ config }).eq('id', articleId);
      if (updateError) throw updateError;
      return json({ ok: true, action, articleId, analysis, corpusUnits: corpusKeys, provider: 'openai', model: MODEL, keySource: 'zica-ai-vault' });
    }

    const prompt = `Corrija o rascunho eleitoral abaixo. Entregue SOMENTE o HTML completo corrigido, sem bloco de código e sem comentário externo.\n\nOBJETIVO:\n- corrigir gramática, clareza, hierarquia H1/H2/H3, legibilidade, marcações quebradas e inconsistências internas;\n- usar a BASE EDITORIAL CONTROLADA somente nos limites dos status de verificação;\n- manter afirmações não comprovadas como [VERIFICAR FONTE PRIMÁRIA] ou [RECONSULTAR FONTE EXTERNA], jamais inventar fonte;\n- rotular propostas oficiais explicitamente como propostas;\n- atribuir alegações sobre terceiros quando ainda não comprovadas;\n- manter conteúdo factual e não persuasivo, sem CTA de voto/convencimento;\n- preservar links editoriais contextuais existentes quando pertinentes;\n- preservar avisos de revisão humana, identificação da candidatura, avisos de IA e footer;\n- se houver erro técnico registrado, corrija apenas o que puder ser corrigido no texto/HTML.\n\nTítulo: ${article.title || ''}\nPauta: ${article.keyword || ''}\nErro técnico registrado: ${article.error_message || 'nenhum'}\n\nBASE EDITORIAL CONTROLADA:\n${corpusContext || '[nenhuma unidade recuperada]'}\n\nHTML ATUAL:\n${content}`;
    const result = await callOpenAI(apiKey, baseInstructions, prompt, 9000);
    const corrected = result.text.trim();
    if (!corrected.startsWith('<') || corrected.length < 100) throw new Error('openai_editorial_invalid_html');
    const wordCount = stripTags(corrected).split(/\s+/).filter(Boolean).length;
    const config = { ...(article.config || {}), electoralAiCorrection: { correctedAt: new Date().toISOString(), provider: 'openai', model: MODEL, keySource: 'zica-ai-vault', corpusUnits: corpusKeys, usage: result.usage, responseId: result.responseId, previousStatus: article.status } };
    const { error: updateError } = await userClient.from('articles').update({ content: corrected, word_count: wordCount, status: article.status === 'published' ? 'draft' : article.status, error_message: null, config, updated_at: new Date().toISOString() }).eq('id', articleId);
    if (updateError) throw updateError;
    return json({ ok: true, action, articleId, wordCount, corpusUnits: corpusKeys, provider: 'openai', model: MODEL, keySource: 'zica-ai-vault', requiresHumanReview: true, autoPublished: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return json({ error: message }, message === 'openai_not_configured_in_zica_vault' ? 503 : 400);
  }
});
