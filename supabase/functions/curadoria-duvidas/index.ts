// Lote "Perguntas frequentes" (regra primordial do dono, 20/11/2026): todo conteúdo tira dúvidas.
// Para cada artigo NÃO publicado que ainda não tira dúvidas, a IA responde (em modo barato) só com o que o próprio texto afirma; cada resposta
// passa por checagem de apoio no texto e filtros de promessa; a seção "Perguntas frequentes" entra no fim do conteúdo. Artigo publicado nunca é tocado.
// Sem sessão de usuário: usa a mesma chave de automação do lote de imagens (`curadoria-imagens`, segredo no cofre). Todo gasto passa pela trava de gasto.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { scopedServe } from '../_shared/nexus-spend-lock.ts';
import { bindSpendIdentity } from '../_shared/spend-gate.ts';
import { getOrchestratorForUser } from '../_shared/byok-resolver.ts';
import { handleCuradoriaAction } from '../_shared/curadoria-handler.ts';
import { appendFaq, buildFaqMessages, jaTiraDuvidas, parseFaq, plainArticleText } from '../_shared/curadoria-duvidas-core.ts';
import { MIN_TEXT_CHARS } from '../_shared/curadoria-imagens-core.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-zica-automation-key', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function sha256(value: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function sameText(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

scopedServe(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const t0 = Date.now();
  try {
    const key = req.headers.get('x-zica-automation-key') || '';
    if (!key) return json({ error: 'automation_key_required' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const { data: keyRow, error: keyErr } = await admin.from('automation_ingress_keys').select('secret_hash,enabled').eq('name', 'curadoria-imagens').maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.enabled || !keyRow.secret_hash || !sameText(await sha256(key), String(keyRow.secret_hash))) return json({ error: 'automation_key_invalid' }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const organizationId = body.organizationId;
    if (!isUuid(organizationId)) return json({ error: 'organization_id_required' }, 422);
    const projectIds = Array.isArray(body.projectIds) ? (body.projectIds as unknown[]).filter(isUuid) : [];
    if (!projectIds.length) return json({ error: 'project_ids_required' }, 422);
    const onlyIds = Array.isArray(body.articleIds) ? (body.articleIds as unknown[]).filter(isUuid).slice(0, 300) : [];
    const maxArticles = num(body.maxArticles, 4, 1, 10);
    const dryRun = body.dryRun === true;

    // alvos: não publicados, com texto de verdade, que ainda não tiram dúvidas e ainda não foram tentados por este lote
    const ar = await admin.from('articles').select('id,user_id,project_id,organization_id,status,title,keyword,content,language,config,updated_at,created_at').in('project_id', projectIds).in('status', ['generating', 'draft', 'ready']).limit(5000);
    if (ar.error) throw ar.error;
    const picked = new Map(onlyIds.map((id, i) => [id, i]));
    const alvos = ((ar.data || []) as Array<Record<string, any>>)
      .filter((a) => !picked.size || picked.has(a.id))
      .filter((a) => String(a.content || '').length >= MIN_TEXT_CHARS && String(a.title || '').trim())
      .filter((a) => !jaTiraDuvidas(a.content) && Number(a.config?.duvidas?.tentativas || 0) < 2)
      .sort((x, y) => picked.size ? (picked.get(x.id) ?? 0) - (picked.get(y.id) ?? 0) : String(x.created_at).localeCompare(String(y.created_at)));
    if (dryRun) return json({ ok: true, dry_run: true, elegiveis: alvos.length, proximos: alvos.slice(0, 5).map((a) => ({ article_id: a.id, title: a.title })) });

    const feitos: Array<{ article_id: string; ok: boolean; itens?: number; motivo?: string; descartados?: number }> = [];
    const tocados = new Set<string>();
    let parada: string | null = null;
    for (const a of alvos) {
      if (feitos.length >= maxArticles) break;
      if (Date.now() - t0 > 100_000) { parada = 'tempo'; break; }
      const attempts = Number(a.config?.duvidas?.tentativas || 0) + 1;
      const marca = async (extra: Record<string, unknown>) => {
        await admin.from('articles').update({ config: { ...(a.config || {}), duvidas: { ...(a.config?.duvidas || {}), tentativas: attempts, at: new Date().toISOString(), ...extra } } }).eq('id', a.id).eq('updated_at', a.updated_at);
      };
      try {
        bindSpendIdentity({ orgId: organizationId, projectId: a.project_id, userId: a.user_id, articleId: a.id });
        const orchestrator = await getOrchestratorForUser(a.user_id);
        const text = plainArticleText(a.content);
        const raw = await orchestrator.call('seo_analysis', buildFaqMessages({ title: a.title, keyword: a.keyword, text, language: a.language }), { maxTokens: 1800, temperature: 0.3, prioritizeCost: true, articleId: a.id });
        const lang = String(a.language || 'pt').slice(0, 2).toLowerCase();
        const res = parseFaq(raw, text, lang);
        const novo = appendFaq(a.content, res.items);
        if (!novo) { await marca({ falha: 'itens_insuficientes', descartados: res.descartados.slice(0, 6) }); feitos.push({ article_id: a.id, ok: false, motivo: 'itens_insuficientes', descartados: res.descartados.length }); continue; }
        const up = await admin.from('articles').update({ content: novo, updated_at: new Date().toISOString(), config: { ...(a.config || {}), duvidas: { tentativas: attempts, at: new Date().toISOString(), itens: res.items.length, descartados: res.descartados.length, fonte: 'curadoria-duvidas', metodo: 'ia_resposta_so_com_o_texto_do_artigo' } } }).eq('id', a.id).eq('updated_at', a.updated_at).select('id');
        if (up.error || !up.data?.length) { feitos.push({ article_id: a.id, ok: false, motivo: 'artigo_mudou_durante_a_geracao' }); continue; }
        feitos.push({ article_id: a.id, ok: true, itens: res.items.length, descartados: res.descartados.length });
        tocados.add(a.project_id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'falha';
        const gasto = /daily_cap|spend|paid_services|423/i.test(msg);
        feitos.push({ article_id: a.id, ok: false, motivo: gasto ? 'teto_diario' : msg.slice(0, 120) });
        if (gasto) { parada = 'teto_diario'; break; }
        await marca({ falha: msg.slice(0, 120) }).catch(() => undefined);
      }
    }

    // reavalia a curadoria dos projetos afetados (custo zero): o item "tira dúvidas" passa a contar
    const reavaliado: Record<string, unknown> = {};
    for (const p of tocados) {
      const owner = alvos.find((x) => x.project_id === p)?.user_id || '';
      const r = await handleCuradoriaAction(admin, { action: 'rodar', body: { projectId: p, limit: 100, budgetMs: 30_000 }, userId: owner, roleByOrg: new Map([[organizationId, 'owner']]), deps: { now: () => Date.now(), budgetMs: 30_000 } });
      reavaliado[p] = { status: r.status, estados: (r.body as Record<string, unknown>).estados ?? null, restantes: (r.body as Record<string, unknown>).restantes ?? null };
    }
    return json({ ok: true, elegiveis: alvos.length, feitos, gerados: feitos.filter((f) => f.ok).length, falhas: feitos.filter((f) => !f.ok).length, parada, curadoria_reavaliada: reavaliado, decorrido_ms: Date.now() - t0 });
  } catch (_e) {
    console.error('[curadoria-duvidas] operation_failed');
    return json({ error: 'curadoria_duvidas_failed' }, 500);
  }
}, { module: 'curadoria-duvidas' });
