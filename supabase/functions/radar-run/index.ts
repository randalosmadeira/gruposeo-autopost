// Radar de mercado (cron de hora em hora): roda as rotinas vencidas (diária, semanal, mensal) por foco, dentro do teto diário de gasto.
// Não tem login de usuário: só aceita a chave de automação própria `radar-run` (hash em automation_ingress_keys, segredo no cofre).
// Toda chamada paga sai pelo fetch guardado pelo teto diário (spend-gate); negação PARA a rodada. Nenhuma chave é devolvida.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { scopedServe } from '../_shared/nexus-spend-lock.ts';
import { providerFetch } from '../_shared/nexus-provider-fetch.ts';
import { bindSpendIdentity } from '../_shared/spend-gate.ts';
import { priceBookFromRows } from '../_shared/spend-gate-core.ts';
import { runRadar } from '../_shared/radar-runner.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-zica-automation-key', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });

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

scopedServe(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const key = req.headers.get('x-zica-automation-key') || '';
    if (!key) return json({ error: 'automation_key_required' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const { data: row, error } = await admin.from('automation_ingress_keys').select('secret_hash,enabled').eq('name', 'radar-run').maybeSingle();
    if (error) throw error;
    if (!row?.enabled || !row.secret_hash || !sameText(await sha256(key), String(row.secret_hash))) return json({ error: 'automation_key_invalid' }, 401);
    const readOrgSecret = async (org: string, provider: string): Promise<string | null> => {
      const { data, error: e } = await admin.rpc('nexus_provider_secret_read', { p_org: org, p_provider: provider });
      return e || typeof data !== 'string' || !data ? null : data;
    };
    const report = await runRadar(admin, {
      fetchFn: fetch, lookupA: (host: string) => Deno.resolveDns(host, 'A'), now: () => Date.now(), sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
      paidFetch: providerFetch, readSecret: readOrgSecret,
      youtubeKey: Deno.env.get('YOUTUBE_API_KEY') || Deno.env.get('GOOGLE_API_KEY_SPEED') || null, oprKey: Deno.env.get('OPEN_PAGERANK_API_KEY') || null, speedApiKey: Deno.env.get('GOOGLE_API_KEY_SPEED') || null,
      // o cron não tem usuário: o contexto de gasto é fixado na organização do projeto da rotina (conferida no banco)
      bindOrg: (orgId, projectId) => bindSpendIdentity({ orgId, projectId }),
      dayBudget: async (orgId) => {
        const { data, error: e } = await admin.rpc('spend_status', { p_org: orgId });
        if (e || !data || typeof data !== 'object') return null;
        const st = data as Record<string, unknown>;
        const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
        return { remaining_micros: Math.max(0, num(st.extra_unlocked === true ? st.remaining_absolute_usd_micros : st.remaining_to_cap_usd_micros)), used_micros: num(st.used_usd_micros), cap_micros: num(st.cap_usd_micros) };
      },
      unitPrices: async () => { const { data } = await admin.rpc('spend_price_table', {}); return priceBookFromRows(Array.isArray(data) ? data : []).units; },
    });
    return json({ ok: true, ...report });
  } catch (_e) {
    console.error('[radar-run] operation_failed');
    return json({ error: 'radar_operation_failed' }, 500);
  }
}, { module: 'radar-run' });
