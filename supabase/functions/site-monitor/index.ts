// Monitor do site (cron a cada 10 minutos): medições de velocidade agendadas com alerta de piora e reverificação de backlinks.
// Não tem login de usuário: só aceita a chave de automação própria `site-monitor` (hash em automation_ingress_keys, segredo no cofre).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { runMonitor } from '../_shared/monitor-runner.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const key = req.headers.get('x-zica-automation-key') || '';
    if (!key) return json({ error: 'automation_key_required' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const { data: row, error } = await admin.from('automation_ingress_keys').select('secret_hash,enabled').eq('name', 'site-monitor').maybeSingle();
    if (error) throw error;
    if (!row?.enabled || !row.secret_hash || !sameText(await sha256(key), String(row.secret_hash))) return json({ error: 'automation_key_invalid' }, 401);
    const report = await runMonitor(admin, { fetchFn: fetch, lookupA: (host: string) => Deno.resolveDns(host, 'A'), now: () => Date.now(), apiKey: Deno.env.get('GOOGLE_API_KEY_SPEED') || null });
    return json({ ok: true, ...report });
  } catch (_e) {
    console.error('[site-monitor] operation_failed');
    return json({ error: 'monitor_operation_failed' }, 500);
  }
});
