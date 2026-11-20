// Teto Diário de Gasto: situação do dia, crédito adicional, política e histórico por organização. Só números agregados, nenhum dado pessoal.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveRequestActor, RequestAuthError } from '../_shared/request-auth.ts';
import { PAID_SERVICES_BLOCKED } from '../_shared/nexus-spend-lock.ts';
import { SPEND_POLICY_ACTIONS, handleSpendPolicyAction } from '../_shared/spend-policy-handler.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const actor = await resolveRequestActor(req);
    if (actor.mode !== 'user') return json({ error: 'user_session_required' }, 403);
    const body = await req.json();
    if (!SPEND_POLICY_ACTIONS.includes(body?.action)) return json({ error: 'unknown_action' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const { data: members, error: memberError } = await admin.from('organization_members').select('organization_id,role').eq('user_id', actor.userId).eq('status', 'active');
    if (memberError) throw memberError;
    const roleByOrg = new Map<string, string>((members || []).map((m: { organization_id: string; role: string | null }) => [m.organization_id, String(m.role || '')]));
    // dono da organização pela própria tabela de organizações (vale mesmo sem linha em organization_members)
    const { data: owned, error: ownedError } = await admin.from('organizations').select('id').eq('owner_user_id', actor.userId);
    if (ownedError) throw ownedError;
    for (const o of (owned || []) as Array<{ id: string }>) roleByOrg.set(o.id, 'owner');
    const result = await handleSpendPolicyAction(admin, { action: body.action, body, userId: actor.userId, roleByOrg, paidBlocked: PAID_SERVICES_BLOCKED });
    return json(result.body, result.status);
  } catch (e) {
    if (e instanceof RequestAuthError) return json({ error: e.code }, e.status);
    console.error('[spend-policy] operation_failed');
    return json({ error: 'spend_policy_operation_failed' }, 500);
  }
});
