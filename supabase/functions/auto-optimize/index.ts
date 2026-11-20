// Piloto Automático de Otimização (SEO, GEO, AEO, AIO): correções sem IA primeiro, IA em passos pequenos dentro do teto diário de gasto.
import '../_shared/nexus-runtime-bootstrap.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { paidLockedServe } from '../_shared/nexus-spend-lock.ts';
import { bindSpendIdentity } from '../_shared/spend-gate.ts';
import { RequestAuthError, resolveRequestActor } from '../_shared/request-auth.ts';
import { getOrchestratorForUser } from '../_shared/byok-resolver.ts';
import { AUTO_OPTIMIZE_ACTIONS, handleAutoOptimizeAction, orchestratorPort } from '../_shared/auto-optimize-handler.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });

paidLockedServe(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    // Sessão de usuário, ou chamada interna (ex.: publish-to-wordpress) com userId informado: o papel vem SEMPRE do banco.
    const actor = await resolveRequestActor(req, typeof body?.userId === 'string' ? body.userId : null);
    if (!AUTO_OPTIMIZE_ACTIONS.includes(body?.action)) return json({ error: 'unknown_action' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const { data: members, error: memberError } = await admin.from('organization_members').select('organization_id,role').eq('user_id', actor.userId).eq('status', 'active');
    if (memberError) throw memberError;
    const roleByOrg = new Map<string, string>((members || []).map((m: { organization_id: string; role: string | null }) => [m.organization_id, String(m.role || '')]));
    const result = await handleAutoOptimizeAction(admin, {
      action: body.action, body, userId: actor.userId, roleByOrg, now: () => Date.now(),
      bindSpend: (ids) => bindSpendIdentity(ids),
      makeAi: async (article) => orchestratorPort(await getOrchestratorForUser(actor.userId), String(article.id), `auto-optimize-${crypto.randomUUID()}`),
    });
    return json(result.body, result.status);
  } catch (e) {
    if (e instanceof RequestAuthError) return json({ error: e.code }, e.status);
    console.error('[auto-optimize] operation_failed');
    return json({ error: 'auto_optimize_failed' }, 500);
  }
});
