// Lote de imagens da curadoria: gera imagem ORIGINAL e única para artigos barrados por imagem repetida/ausente, sem sessão de usuário.
// Só aceita a chave de automação própria `curadoria-imagens` (hash em automation_ingress_keys, segredo no cofre). Sem cron: roda quando chamado.
// Chama o generate-image em modo interno (a chave de serviço do próprio ambiente + userId do dono do artigo): o teto diário e a trava global continuam valendo lá dentro.
// Teto próprio: curadoria_image_budget (autorização do dono) x soma de curadoria_image_jobs. Nunca começa uma imagem que, pela estimativa, estouraria o teto.
// Não altera texto de artigo; só troca a imagem de destaque. Ao fim, reavalia a curadoria dos artigos afetados (custo zero). Nenhuma chave é devolvida.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleCuradoriaAction } from '../_shared/curadoria-handler.ts';
import {
  STATUS_ORDER, buildImageRequest, canAffordOne, estimateMicros, orderTargets, recordedCost, remainingMicros, stopReasonFor,
  type JobLite, type StopReason, type TargetArticle,
} from '../_shared/curadoria-imagens-core.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-zica-automation-key', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const t0 = Date.now();
  try {
    const key = req.headers.get('x-zica-automation-key') || '';
    if (!key) return json({ error: 'automation_key_required' }, 401);
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: keyRow, error: keyErr } = await admin.from('automation_ingress_keys').select('secret_hash,enabled').eq('name', 'curadoria-imagens').maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow?.enabled || !keyRow.secret_hash || !sameText(await sha256(key), String(keyRow.secret_hash))) return json({ error: 'automation_key_invalid' }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const organizationId = body.organizationId;
    if (!isUuid(organizationId)) return json({ error: 'organization_id_required' }, 422);
    const projectOrder = Array.isArray(body.projectIds) ? (body.projectIds as unknown[]).filter(isUuid) : [];
    if (!projectOrder.length) return json({ error: 'project_ids_required' }, 422);
    const maxImages = num(body.maxImages, 2, 1, 10);
    const timeBudgetMs = num(body.timeBudgetMs, 90_000, 10_000, 120_000);
    const quality = body.quality === 'low' || body.quality === 'high' ? body.quality : 'medium';
    const dryRun = body.dryRun === true;
    // estilo visual único do lote (ex.: ilustração minimalista) e lista fixa de artigos escolhidos pelo dono (na ordem dada)
    const style = typeof body.style === 'string' ? body.style.trim().slice(0, 700) : '';
    const onlyIds = Array.isArray(body.articleIds) ? (body.articleIds as unknown[]).filter(isUuid).slice(0, 300) : [];

    // 1) teto autorizado pelo dono e o que o lote já gastou
    const budget = await admin.from('curadoria_image_budget').select('cap_micros,enabled').eq('organization_id', organizationId).maybeSingle();
    if (budget.error) throw budget.error;
    if (!budget.data?.enabled) return json({ error: 'lote_nao_autorizado', message: 'O dono ainda não liberou o teto de imagens desta organização.' }, 403);
    const capMicros = Number(budget.data.cap_micros);
    const jobsRes = await admin.from('curadoria_image_jobs').select('article_id,status,cost_micros,created_at').eq('organization_id', organizationId).limit(20000);
    if (jobsRes.error) throw jobsRes.error;
    const jobs = (jobsRes.data || []) as Array<JobLite & { cost_micros: number }>;
    let spent = jobs.reduce((s, j) => s + Number(j.cost_micros || 0), 0);
    const estimate = estimateMicros(jobs.filter((j) => j.status === 'ok').map((j) => Number(j.cost_micros)));

    // 2) artigos elegíveis: curadoria diz imagem repetida/ausente, ainda não publicados, com texto de verdade
    const cur = await admin.from('article_curation').select('article_id,project_id,image_state').in('project_id', projectOrder).in('image_state', ['repetida', 'ausente']).in('article_status', [...STATUS_ORDER]).limit(5000);
    if (cur.error) throw cur.error;
    const ids = ((cur.data || []) as Array<{ article_id: string }>).map((r) => r.article_id);
    const articles: TargetArticle[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await admin.from('articles').select('id,user_id,project_id,status,title,keyword,content,created_at').in('id', ids.slice(i, i + 100));
      if (r.error) throw r.error;
      articles.push(...((r.data || []) as TargetArticle[]));
    }
    const targets = orderTargets(articles, jobs, projectOrder, onlyIds);
    const base = { organization_id: organizationId, teto_micros: capMicros, gasto_micros: spent, restante_micros: remainingMicros(capMicros, spent), estimativa_por_imagem_micros: estimate, elegiveis: targets.length };
    if (dryRun) return json({ ok: true, dry_run: true, ...base, proximos: targets.slice(0, 5).map((t) => ({ article_id: t.id, status: t.status, title: t.title })) });

    // 3) gera uma a uma (sequencial: o custo medido por imagem fica limpo)
    const spentNow = async (): Promise<number | null> => {
      const { data, error } = await admin.rpc('spend_status', { p_org: organizationId });
      if (error || !data || typeof data !== 'object') return null;
      const n = Number((data as Record<string, unknown>).spent_usd_micros);
      return Number.isFinite(n) ? n : null;
    };
    const feitos: Array<{ article_id: string; status: string; cost_micros: number; ok: boolean; erro?: string }> = [];
    const projetosTocados = new Set<string>();
    let parada: StopReason | 'teto_do_lote' | 'tempo' | 'fim_da_fila' | null = null;
    for (const t of targets) {
      if (feitos.length >= maxImages) { parada = null; break; }
      if (Date.now() - t0 > timeBudgetMs - 45_000) { parada = 'tempo'; break; }
      if (!canAffordOne(remainingMicros(capMicros, spent), estimate)) { parada = 'teto_do_lote'; break; }
      const before = await spentNow();
      let ok = false; let image: string | null = null; let erro: string | undefined; let status = 0; let resBody: Record<string, unknown> | null = null;
      try {
        const res = await fetch(`${url}/functions/v1/generate-image`, {
          method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildImageRequest(t, quality, style)), signal: AbortSignal.timeout(140_000),
        });
        status = res.status;
        resBody = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        ok = res.ok && resBody?.success === true && typeof resBody.image === 'string';
        image = ok ? String(resBody!.image) : null;
        if (!ok) erro = String(resBody?.error ?? resBody?.code ?? `http_${status}`).slice(0, 300);
      } catch (e) { erro = (e instanceof Error ? e.message : 'falha_de_rede').slice(0, 300); }
      const after = await spentNow();
      const measured = before !== null && after !== null ? after - before : 0;
      const { cost, source } = recordedCost(measured, estimate, ok);
      spent += cost;
      const ins = await admin.from('curadoria_image_jobs').insert({
        organization_id: organizationId, project_id: t.project_id, article_id: t.id, article_status: t.status, status: ok ? 'ok' : 'erro',
        cost_micros: cost, cost_source: source, image_url: image, error: erro ?? null,
      });
      if (ins.error) { parada = 'servico_indisponivel'; feitos.push({ article_id: t.id, status: t.status, cost_micros: cost, ok, erro: 'registro_falhou' }); break; }
      feitos.push({ article_id: t.id, status: t.status, cost_micros: cost, ok, ...(erro ? { erro } : {}) });
      if (ok) projetosTocados.add(t.project_id);
      const stop = ok ? null : stopReasonFor(status, resBody);
      if (stop) { parada = stop; break; }
    }
    if (!parada && feitos.length < maxImages && feitos.length === targets.length) parada = 'fim_da_fila';

    // 4) reavalia a curadoria dos projetos afetados (custo zero): a imagem nova passa a contar como única
    const reavaliado: Record<string, unknown> = {};
    for (const p of projetosTocados) {
      const owner = targets.find((t) => t.project_id === p)?.user_id || '';
      const r = await handleCuradoriaAction(admin, {
        action: 'rodar', body: { projectId: p, limit: 100, budgetMs: 30_000 }, userId: owner, roleByOrg: new Map([[organizationId, 'owner']]),
        deps: { now: () => Date.now(), budgetMs: 30_000 },
      });
      reavaliado[p] = { status: r.status, estados: (r.body as Record<string, unknown>).estados ?? null, restantes: (r.body as Record<string, unknown>).restantes ?? null };
    }
    return json({
      ok: true, ...base, gasto_micros: spent, restante_micros: remainingMicros(capMicros, spent), gerados: feitos.filter((f) => f.ok).length, falhas: feitos.filter((f) => !f.ok).length,
      parada, feitos, curadoria_reavaliada: reavaliado, decorrido_ms: Date.now() - t0,
    });
  } catch (_e) {
    console.error('[curadoria-imagens] operation_failed');
    return json({ error: 'curadoria_imagens_failed' }, 500);
  }
});
