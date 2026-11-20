// Lote de FONTES da curadoria (autorização do dono, 20/11/2026): a revisão editorial só aprova com fonte verificável e trechos literais.
// Para cada artigo não publicado e sem fonte suficiente, busca (1) a matéria original (config.source_url) ou, se não houver, (2) a legislação oficial
// do assunto (planalto.gov.br), extrai só os parágrafos ligados ao tema e grava em config.sourcesContext. Não altera título, texto nem imagem.
// Leitura educada de página pública: 1 pedido por vez, https, endereço público conferido por DNS, até 3 redirecionamentos, 3 MB, identificado no User-Agent.
// Sem sessão de usuário: mesma chave de automação do lote de imagens (`curadoria-imagens`). Custo zero (nenhuma IA).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isPublicAddress } from '../_shared/nexus-intelligence.ts';
import { MIN_TEXT_CHARS } from '../_shared/curadoria-imagens-core.ts';
import { CURADORIA_VERSION } from '../_shared/curadoria-core.ts';
import { isPlaceholderText } from '../_shared/curadoria-core.ts';
import { buildSourcesContext, htmlToParagraphs, matchLegalSources, pickRelevant, safeSourceUrl, temFonteSuficiente } from '../_shared/curadoria-fontes-core.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-zica-automation-key', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function sha256(value: string) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function sameText(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const UA = 'ZicaPostsBot/1.0 (leitura de fonte publica para revisao editorial; contato: gruposeomkt.com.br)';
/** busca uma página pública com as proteções acima; devolve o HTML decodificado ou o motivo da falha */
async function fetchPublicPage(raw: string): Promise<{ ok: true; html: string; url: string } | { ok: false; motivo: string }> {
  let u = safeSourceUrl(raw);
  if (!u) return { ok: false, motivo: 'endereco_invalido' };
  for (let hop = 0; hop < 4; hop++) {
    let addrs: string[] = [];
    try { addrs = await Deno.resolveDns(u.hostname, 'A'); } catch { return { ok: false, motivo: 'dns_falhou' }; }
    if (!addrs.length || addrs.some((ip) => !isPublicAddress(ip))) return { ok: false, motivo: 'endereco_privado' };
    let res: Response;
    try { res = await fetch(u.href, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(20_000) }); } catch (e) { return { ok: false, motivo: `rede:${(e instanceof Error ? e.message : 'erro').slice(0, 90)}` }; }
    if (res.status >= 300 && res.status < 400) {
      const next = safeSourceUrl(new URL(res.headers.get('location') || '', u.href).href);
      if (!next) return { ok: false, motivo: 'redirecionamento_invalido' };
      u = next; continue;
    }
    if (!res.ok) return { ok: false, motivo: `http_${res.status}` };
    const ct = res.headers.get('content-type') || '';
    if (!/html|text\/plain|xml/i.test(ct)) return { ok: false, motivo: 'tipo_nao_suportado' };
    const reader = res.body?.getReader(); if (!reader) return { ok: false, motivo: 'sem_corpo' };
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 3_000_000) { await reader.cancel(); break; } chunks.push(value); }
    const bytes = new Uint8Array(total > 3_000_000 ? 3_000_000 : total); let off = 0; for (const c of chunks) { bytes.set(c.subarray(0, Math.min(c.length, bytes.length - off)), off); off += c.length; if (off >= bytes.length) break; }
    const charset = (ct.match(/charset=([\w-]+)/i)?.[1] || '').toLowerCase();
    let html = new TextDecoder(charset && charset !== 'utf-8' ? charset : 'utf-8', { fatal: false }).decode(bytes);
    if (!charset && html.includes('�')) html = new TextDecoder('windows-1252').decode(bytes);
    if (/planalto\.gov\.br$/i.test(u.hostname) && !charset) html = new TextDecoder('windows-1252').decode(bytes);
    return { ok: true, html, url: u.href };
  }
  return { ok: false, motivo: 'redirecionamentos_demais' };
}

Deno.serve(async (req) => {
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
    const projectIds = Array.isArray(body.projectIds) ? (body.projectIds as unknown[]).filter(isUuid) : [];
    if (!projectIds.length) return json({ error: 'project_ids_required' }, 422);
    const onlyIds = Array.isArray(body.articleIds) ? (body.articleIds as unknown[]).filter(isUuid).slice(0, 300) : [];
    const max = num(body.max, 5, 1, 15);

    // alvos: aprovados na curadoria (versão atual), não publicados, com texto, sem fonte suficiente, que não sejam marcador interno
    const cur = await admin.from('article_curation').select('article_id').in('project_id', projectIds).eq('estado', 'aprovado').eq('version', CURADORIA_VERSION).in('article_status', ['draft', 'ready']).limit(5000);
    if (cur.error) throw cur.error;
    const ids = ((cur.data || []) as Array<{ article_id: string }>).map((r) => r.article_id).filter((id) => !onlyIds.length || onlyIds.includes(id));
    const arts: Array<Record<string, any>> = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await admin.from('articles').select('id,project_id,user_id,status,title,keyword,content,config,updated_at,created_at').in('id', ids.slice(i, i + 100));
      if (r.error) throw r.error;
      arts.push(...((r.data || []) as Array<Record<string, any>>));
    }
    const alvos = arts
      .filter((a) => a.status !== 'published' && String(a.content || '').length >= MIN_TEXT_CHARS && !isPlaceholderText(a.title, a.content))
      .filter((a) => !temFonteSuficiente(a.config?.sourcesContext) && Number(a.config?.fontes?.tentativas || 0) < 2)
      .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
    if (body.dryRun === true) return json({ ok: true, dry_run: true, elegiveis: alvos.length, com_url_de_origem: alvos.filter((a) => a.config?.source_url).length, juridicos_sem_origem: alvos.filter((a) => !a.config?.source_url).length });

    const cache = new Map<string, string[]>();
    const lerPagina = async (url: string): Promise<{ ok: true; paragrafos: string[]; url: string } | { ok: false; motivo: string }> => {
      if (cache.has(url)) return { ok: true, paragrafos: cache.get(url)!, url };
      await sleep(500);
      const r = await fetchPublicPage(url);
      if (!r.ok) return r;
      const p = htmlToParagraphs(r.html); cache.set(url, p);
      return { ok: true, paragrafos: p, url: r.url };
    };
    const feitos: Array<Record<string, unknown>> = [];
    for (const a of alvos) {
      if (feitos.length >= max) break;
      if (Date.now() - t0 > 100_000) break;
      const tentativas = Number(a.config?.fontes?.tentativas || 0) + 1;
      const topico = `${a.title} ${a.keyword || ''}`;
      const consultadoEm = new Date().toISOString().slice(0, 10);
      const partes: string[] = []; const origem: string[] = []; let motivo = '';
      const srcUrl = String(a.config?.source_url || '');
      if (srcUrl && !/news\.google\.com/i.test(srcUrl)) {
        const p = await lerPagina(srcUrl);
        if (p.ok) { const todos = p.paragrafos.join('\n'); const t = todos.length <= 7600 ? todos : pickRelevant(p.paragrafos, topico, 7600); if (t.length >= 100) { partes.push(buildSourcesContext({ nome: String(a.config?.source_name || 'Matéria original'), url: p.url, textoFonte: t, consultadoEm })); origem.push(p.url); } else motivo = 'pagina_sem_texto_util'; }
        else motivo = p.motivo;
      }
      if (!partes.length) {
        for (const lei of matchLegalSources(`${topico} ${String(a.content || '').slice(0, 800)}`, 2)) {
          const p = await lerPagina(lei.url);
          if (!p.ok) { motivo = p.motivo; continue; }
          const t = pickRelevant(p.paragrafos, topico, 3500);
          if (t.length >= 100) { partes.push(`FONTE: ${lei.nome}\nENDEREÇO: ${p.url}\nCONSULTADO EM: ${consultadoEm}\n\n${t}`); origem.push(p.url); }
        }
      }
      const ctx = partes.join('\n\n---\n\n').slice(0, 12_000);
      const cfg = { ...(a.config || {}) } as Record<string, any>;
      if (ctx.length >= 100) {
        cfg.sourcesContext = ctx; cfg.fontes = { tentativas, em: new Date().toISOString(), origem, metodo: 'curadoria-fontes', ia: false };
      } else cfg.fontes = { ...(cfg.fontes || {}), tentativas, em: new Date().toISOString(), falha: motivo || 'sem_fonte_encontrada' };
      const up = await admin.from('articles').update({ config: cfg }).eq('id', a.id).eq('updated_at', a.updated_at).select('id');
      feitos.push({ article_id: a.id, ok: ctx.length >= 100 && !!up.data?.length, origem, chars: ctx.length, ...(ctx.length >= 100 ? {} : { motivo: motivo || 'sem_fonte_encontrada' }), ...(up.error || !up.data?.length ? { gravacao: 'artigo_mudou_ou_erro' } : {}) });
    }
    return json({ ok: true, elegiveis: alvos.length, feitos, com_fonte: feitos.filter((f) => f.ok).length, sem_fonte: feitos.filter((f) => !f.ok).length, decorrido_ms: Date.now() - t0 });
  } catch (_e) {
    console.error('[curadoria-fontes] operation_failed');
    return json({ error: 'curadoria_fontes_failed' }, 500);
  }
});
