// Taxonomia e mercado: áreas matriz > subáreas > nichos, onde o negócio atua, e o planejador de campanha de buscas (SERP) com teto de custo.
// Nada executa busca paga: planejar e importar resultados já obtidos são gratuitos; executar responde 423 enquanto o bloqueio global de gasto estiver ligado.
// Leitura: qualquer membro; escrita: dono, administrador e editor. Papel e organização vêm do banco.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveRequestActor, RequestAuthError } from '../_shared/request-auth.ts';
import { TAXONOMY_ACTIONS, handleTaxonomyAction } from '../_shared/taxonomy-handler.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const actor = await resolveRequestActor(req);
    if (actor.mode !== 'user') return json({ error: 'user_session_required' }, 403);
    const body = await req.json();
    if (!TAXONOMY_ACTIONS.includes(body?.action)) return json({ error: 'unknown_action' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const { data: members, error: memberError } = await admin.from('organization_members').select('organization_id,role').eq('user_id', actor.userId).eq('status', 'active');
    if (memberError) throw memberError;
    const roleByOrg = new Map<string, string>((members || []).map((m: { organization_id: string; role: string | null }) => [m.organization_id, String(m.role || '')]));
    const result = await handleTaxonomyAction(admin, {
      action: body.action, body, userId: actor.userId, roleByOrg,
      deps: { fetchFn: fetch, lookupA: (host: string) => Deno.resolveDns(host, 'A'), now: () => Date.now() },
    });
    return json(result.body, result.status);
  } catch (e) {
    if (e instanceof RequestAuthError) return json({ error: e.code }, e.status);
    console.error('[taxonomy] operation_failed');
    return json({ error: 'taxonomy_operation_failed' }, 500);
  }
});
