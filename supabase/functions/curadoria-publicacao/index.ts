// Lote de VALIDAÇÃO E PUBLICAÇÃO da curadoria (ordem expressa do dono, 20/11/2026: "publicar tudo após validado").
// Sem sessão de usuário: mesma chave de automação do lote de imagens (`curadoria-imagens`, segredo no cofre). Etapas:
//  - reavaliar: roda a curadoria (custo zero, sem IA) em todos os artigos não publicados do projeto, até acabar.
//  - revisar:   revisão editorial autônoma (IA paga, teto do programa Nexus) pelo nexus-intelligence; só quem passa ganha o recibo assinado.
//  - publicar:  chama o publish-to-wordpress (que mantém TODOS os portões: curadoria, perfil completo, recibo da revisão, permissão da organização,
//               qualidade editorial e compliance). `confirmarPublicacao: true` é obrigatório; sem ele só simula. Nada aqui contorna portão.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { scopedServe } from '../_shared/nexus-spend-lock.ts';
import { handleCuradoriaAction } from '../_shared/curadoria-handler.ts';
import { CURADORIA_VERSION } from '../_shared/curadoria-core.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-zica-automation-key', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function sha256(value: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function sameText(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

const motivoReprovacao = (out: Record<string, any> | undefined, erro: unknown): string => {
  const rev = (out?.review || {}) as Record<string, any>;
  const falsas = Object.entries((rev.dimensions || {}) as Record<string, unknown>).filter(([, v]) => v !== true).map(([k]) => k);
  const partes = [falsas.length ? `dimensoes_falsas=${falsas.join(',')}` : '', Array.isArray(rev.issues) && rev.issues.length ? `problemas=${rev.issues.slice(0, 2).join(' | ')}` : '', Array.isArray(rev.unsupported_claims) && rev.unsupported_claims.length ? `sem_fonte=${rev.unsupported_claims.slice(0, 2).join(' | ')}` : '', !out?.review ? String(erro || 'sem_veredito') : '', out?.review && !falsas.length && !(rev.issues || []).length && !(rev.unsupported_claims || []).length ? 'fontes_ou_citacoes_insuficientes' : ''].filter(Boolean);
  return partes.join(' ; ').slice(0, 320);
};

scopedServe(async (req) => {
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
    const etapa = String(body.etapa || '');
    const organizationId = body.organizationId;
    if (!isUuid(organizationId)) return json({ error: 'organization_id_required' }, 422);
    const projectIds = Array.isArray(body.projectIds) ? (body.projectIds as unknown[]).filter(isUuid) : [];
    if (!projectIds.length) return json({ error: 'project_ids_required' }, 422);
    const onlyIds = Array.isArray(body.articleIds) ? (body.articleIds as unknown[]).filter(isUuid).slice(0, 300) : [];
    const max = num(body.max, 3, 1, 25);
    const roleByOrg = new Map([[organizationId, 'owner']]);
    const callFn = async (fn: string, payload: Record<string, unknown>, ms = 140_000) => {
      const res = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(ms) });
      const j = (await res.json().catch(() => null)) as Record<string, any> | null;
      return { status: res.status, body: j };
    };

    // ------------------------------------------------------------------ reavaliar (custo zero)
    if (etapa === 'reavaliar') {
      const out: Record<string, unknown> = {};
      for (const p of projectIds) {
        const { data: proj } = await admin.from('projects').select('user_id').eq('id', p).maybeSingle();
        const estados: Record<string, number> = { aprovado: 0, precisa_correcao: 0, bloqueado: 0 };
        let processados = 0; let restantes = -1;
        for (let i = 0; i < 12 && Date.now() - t0 < 100_000; i++) {
          const r = await handleCuradoriaAction(admin, { action: 'rodar', body: { projectId: p, limit: 100, budgetMs: 25_000 }, userId: String(proj?.user_id || ''), roleByOrg, deps: { now: () => Date.now(), budgetMs: 25_000 } });
          const b = r.body as Record<string, any>;
          processados += Number(b.processados || 0); for (const k of Object.keys(estados)) estados[k] += Number(b.estados?.[k] || 0); restantes = Number(b.restantes ?? 0);
          if (r.status !== 200 || restantes === 0 || !b.processados) break;
        }
        out[p] = { processados, restantes, estados };
      }
      return json({ ok: true, etapa, resultado: out, versao_das_regras: CURADORIA_VERSION, decorrido_ms: Date.now() - t0 });
    }

    // alvos das etapas revisar/publicar: curadoria APROVADA (versão atual), não publicados
    const cur = await admin.from('article_curation').select('article_id,project_id,estado,version').in('project_id', projectIds).eq('estado', 'aprovado').eq('version', CURADORIA_VERSION).in('article_status', ['draft', 'ready']).limit(5000);
    if (cur.error) throw cur.error;
    const ids = ((cur.data || []) as Array<{ article_id: string }>).map((r) => r.article_id).filter((id) => !onlyIds.length || onlyIds.includes(id));
    const arts: Array<Record<string, any>> = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await admin.from('articles').select('id,user_id,project_id,status,title,config,created_at,published_url').in('id', ids.slice(i, i + 100));
      if (r.error) throw r.error;
      arts.push(...((r.data || []) as Array<Record<string, any>>));
    }
    const comRecibo = (a: Record<string, any>) => a.config?.nexus_approval?.review_mode === 'autonomous' && a.config?.review_pass === true;
    const ordem = (a: Record<string, any>, b: Record<string, any>) => onlyIds.length ? onlyIds.indexOf(a.id) - onlyIds.indexOf(b.id) : String(b.created_at).localeCompare(String(a.created_at));

    // ------------------------------------------------------------------ revisar (IA paga, teto do programa Nexus)
    if (etapa === 'revisar') {
      // sem fonte registrada (>= 100 caracteres) a revisão NUNCA passa (ela exige trechos literais das fontes): não gasta com esses
      const naoRevisados = arts.filter((a) => a.status !== 'published' && !a.published_url && !comRecibo(a));
      const semFonte = naoRevisados.filter((a) => String(a.config?.sourcesContext || '').replace(/\s+/g, ' ').trim().length < 100);
      const alvos = naoRevisados.filter((a) => String(a.config?.sourcesContext || '').replace(/\s+/g, ' ').trim().length >= 100).sort(ordem);
      if (body.dryRun === true) return json({ ok: true, dry_run: true, etapa, elegiveis: alvos.length, sem_fonte_nao_revisaveis: semFonte.length, aprovados_na_curadoria: arts.length });
      const feitos: Array<Record<string, unknown>> = []; const pulados: Array<Record<string, unknown>> = []; let parada: string | null = null;
      for (const a of alvos) {
        if (feitos.length >= max) break;
        if (Date.now() - t0 > 90_000) { parada = 'tempo'; break; }
        const prep = await callFn('nexus-intelligence', { action: 'prepare', kind: 'editorial_review', projectId: a.project_id, articleId: a.id, userId: a.user_id });
        const opId = prep.body?.operation?.id;
        if (opId) {
          const st = await admin.from('nexus_operations').select('status').eq('id', opId).maybeSingle();
          // operação deste conteúdo já foi usada (incerta/falha): o sistema só prepara outra quando o artigo mudar; pula sem gastar
          if (st.data && st.data.status !== 'prepared') { pulados.push({ article_id: a.id, motivo: `operacao_ja_usada_${st.data.status}` }); continue; }
        }
        if (!opId) { feitos.push({ article_id: a.id, ok: false, etapa: 'preparar', erro: String(prep.body?.error || prep.status).slice(0, 120) }); continue; }
        const ex = await callFn('nexus-intelligence', { action: 'execute', operationId: opId, projectId: a.project_id, userId: a.user_id });
        const out = ex.body?.output as Record<string, any> | undefined;
        if (ex.status === 402 || /budget|credential|gate/i.test(String(ex.body?.error || ''))) { feitos.push({ article_id: a.id, ok: false, etapa: 'executar', erro: String(ex.body?.error).slice(0, 120) }); parada = 'orcamento_ou_credencial'; break; }
        feitos.push({ article_id: a.id, ok: ex.status === 200 && out?.pass === true, pass: out?.pass === true, ...(out?.pass === true ? {} : { motivo: motivoReprovacao(out, ex.body?.error) }) });
      }
      return json({ ok: true, etapa, elegiveis: alvos.length, sem_fonte_nao_revisaveis: semFonte.length, pulados: pulados.length, pulados_amostra: pulados.slice(0, 5), feitos, aprovados: feitos.filter((f) => f.ok).length, reprovados: feitos.filter((f) => !f.ok).length, parada, decorrido_ms: Date.now() - t0 });
    }

    // ------------------------------------------------------------------ publicar (todos os portões do publish-to-wordpress continuam valendo)
    if (etapa === 'publicar') {
      const alvos = arts.filter((a) => a.status !== 'published' && !a.published_url && comRecibo(a)).sort(ordem);
      if (body.confirmarPublicacao !== true) return json({ ok: true, dry_run: true, etapa, nota: 'Simulação: nada foi publicado. Envie confirmarPublicacao:true para publicar.', prontos_para_publicar: alvos.length, aprovados_na_curadoria: arts.length, sem_recibo: arts.filter((a) => !comRecibo(a)).length, proximos: alvos.slice(0, 5).map((a) => ({ article_id: a.id, title: a.title })) });
      const feitos: Array<Record<string, unknown>> = [];
      for (const a of alvos) {
        if (feitos.length >= max) break;
        if (Date.now() - t0 > 100_000) break;
        const r = await callFn('publish-to-wordpress', { articleId: a.id, projectId: a.project_id, userId: a.user_id, publishStatus: 'publish', requireFeaturedImage: true });
        const b = r.body || {};
        feitos.push({ article_id: a.id, title: String(a.title || '').slice(0, 80), ok: r.status === 200 && b.success === true, status: r.status, code: b.code ?? null, url: b.url ?? b.link ?? b.published_url ?? null, erro: b.success === true ? null : String(b.error || '').slice(0, 160) });
      }
      return json({ ok: true, etapa, elegiveis: alvos.length, feitos, publicados: feitos.filter((f) => f.ok).length, bloqueados: feitos.filter((f) => !f.ok).length, decorrido_ms: Date.now() - t0 });
    }
    return json({ error: 'etapa_invalida', etapas: ['reavaliar', 'revisar', 'publicar'] }, 422);
  } catch (_e) {
    console.error('[curadoria-publicacao] operation_failed');
    return json({ error: 'curadoria_publicacao_failed' }, 500);
  }
}, { module: 'curadoria-publicacao' });
