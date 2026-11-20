// `fetch` original do runtime: primeiro import (mesma regra do nexus-observe). Esta função NÃO instala o bloqueio global de gastos:
// quem gasta é só o turno do agente, que passa pelo portão de execução da organização e pela reserva de teto (tipo `profile_agent`).
import { providerFetch } from '../_shared/nexus-provider-fetch.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveRequestActor, RequestAuthError } from '../_shared/request-auth.ts';
import { scopedServe } from '../_shared/nexus-spend-lock.ts';
import { AGENT_ACTIONS, handleAgentAction } from '../_shared/profile-agent-handler.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });

scopedServe(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const actor = await resolveRequestActor(req);
    if (actor.mode !== 'user') return json({ error: 'user_session_required' }, 403);
    const body = await req.json();
    if (!AGENT_ACTIONS.includes(body?.action)) return json({ error: 'unknown_action' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const { data: members, error: memberError } = await admin.from('organization_members').select('organization_id,role').eq('user_id', actor.userId).eq('status', 'active');
    if (memberError) throw memberError;
    const roleByOrg = new Map<string, string>((members || []).map((m: { organization_id: string; role: string | null }) => [m.organization_id, String(m.role || '')]));
    const result = await handleAgentAction(admin, { action: body.action, body, userId: actor.userId, roleByOrg, fetchFn: providerFetch });
    return json(result.body, result.status);
  } catch (e) {
    if (e instanceof RequestAuthError) return json({ error: e.code }, e.status);
    console.error('[profile-agent] operation_failed');
    return json({ error: 'agent_operation_failed' }, 500);
  }
});
