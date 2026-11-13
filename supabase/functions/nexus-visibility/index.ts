// NEXUS · Visibilidade (Zica Visibility Index), bloco V1 (13/11/2026). Só leitura de dados que já existem + cadastro de concorrentes.
// Nenhuma chamada a API externa e nenhum custo: tudo sai de nexus_operations / nexus_citations / nexus_competitor_mentions (e, quando houver,
// GSC e GA4). A regra de negócio e os envelopes estão em _shared/nexus-visibility.ts (testável) e a matemática em _shared/nexus-zvi.ts.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { RequestAuthError, resolveRequestActor } from '../_shared/request-auth.ts';
import { isUuid, loadViewer, makeManagementStore } from '../_shared/nexus-management.ts';
import {
  handleVisibilityAction, normalizeBundle, normalizeHistory, VISIBILITY_ACTIONS,
  type CompetitorRow, type Ga4Result, type GscResult, type UpsertInput, type UpsertResult, type VisibilityStore,
} from '../_shared/nexus-visibility.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

const PROJECT_COLS = 'id,name,domain,wordpress_url,organization_id,user_id';
const COMPETITOR_COLS = 'id,name,domains,kind,status,source,created_at,updated_at';

/** A migração 20261113120000 ainda não foi aplicada neste banco. */
class NotReadyError extends Error {}
type DbError = { code?: string; message?: string } | null;
const isNotReady = (e: DbError) => !!e && ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(String(e.code ?? ''));
const asNumber = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function makeStore(admin: SupabaseClient, project: { id: string; organization_id: string }): VisibilityStore {
  return {
    async observations(a) {
      const { data, error } = await admin.rpc('nexus_visibility_observations', { p_project: project.id, p_from: a.from, p_to: a.to, p_engines: a.engines, p_topic: a.topic, p_limit: a.limit });
      if (isNotReady(error)) throw new NotReadyError();
      if (error) throw error;
      return normalizeBundle(data);
    },
    async history(a) {
      const { data, error } = await admin.rpc('nexus_visibility_history', { p_project: project.id, p_query: a.query, p_engines: a.engines, p_limit: a.limit });
      if (isNotReady(error)) throw new NotReadyError();
      if (error) throw error;
      return normalizeHistory(data);
    },
    async competitors() {
      const { data, error } = await admin.from('nexus_competitors').select(COMPETITOR_COLS).eq('project_id', project.id).order('name', { ascending: true }).limit(200);
      if (isNotReady(error)) throw new NotReadyError();
      if (error) throw error;
      return (data ?? []) as CompetitorRow[];
    },
    async upsertCompetitor(input: UpsertInput, actorId: string): Promise<UpsertResult> {
      const fields = { name: input.name, domains: input.domains, kind: input.kind, status: input.status };
      const mapError = (error: NonNullable<DbError>): UpsertResult => {
        if (isNotReady(error)) throw new NotReadyError();
        const msg = String(error.message ?? '');
        if (error.code === '23505') return { ok: false, error: 'competitor_name_taken', status: 409 };
        if (msg.includes('too_many_competitors')) return { ok: false, error: 'too_many_competitors', status: 429 };
        if (error.code === '23514') return { ok: false, error: 'competitor_invalid', status: 400 };
        throw error;
      };
      let targetId = input.id;
      if (!targetId) {
        // O nome é a chave natural: "aprovar" uma sugestão já cadastrada atualiza a linha existente (idempotente).
        const { data: existing, error } = await admin.from('nexus_competitors').select('id,name').eq('project_id', project.id).limit(200);
        if (error) return mapError(error);
        targetId = (existing ?? []).find((c: { id: string; name: string }) => c.name.toLowerCase() === input.name.toLowerCase())?.id ?? null;
      }
      if (targetId) {
        const { data, error } = await admin.from('nexus_competitors').update(fields).eq('id', targetId).eq('project_id', project.id).select(COMPETITOR_COLS).maybeSingle();
        if (error) return mapError(error);
        return data ? { ok: true, competitor: data as CompetitorRow } : { ok: false, error: 'competitor_not_found', status: 404 };
      }
      const { data, error } = await admin.from('nexus_competitors').insert({ ...fields, organization_id: project.organization_id, project_id: project.id, source: 'manual', created_by: actorId }).select(COMPETITOR_COLS).single();
      if (error) return mapError(error);
      return { ok: true, competitor: data as CompetitorRow };
    },
    async removeCompetitor(id) {
      const { data, error } = await admin.from('nexus_competitors').delete().eq('id', id).eq('project_id', project.id).select('id');
      if (isNotReady(error)) throw new NotReadyError();
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async prompts() {
      const { data } = await admin.from('nexus_prompts').select('query').eq('project_id', project.id).eq('active', true).limit(1000);
      return ((data ?? []) as Array<{ query: string }>).filter((p) => typeof p.query === 'string');
    },
    // Resultado real (camada separada do índice): falha de leitura ou função ainda inexistente = sem dado (null), nunca erro.
    async gsc(from, to): Promise<GscResult | null> {
      const { data, error } = await admin.rpc('nexus_search_performance_summary', { p_project: project.id, p_from: from, p_to: to });
      if (error || !data?.totals) return null;
      const clicks = asNumber(data.totals.clicks), impressions = asNumber(data.totals.impressions);
      return clicks === 0 && impressions === 0 ? null : { clicks, impressions };
    },
    async ga4(from, to): Promise<Ga4Result | null> {
      const { data, error } = await admin.rpc('nexus_analytics_summary', { p_project: project.id, p_from: from, p_to: to });
      if (error || !data || !data.last_synced_at) return null;
      return { sessions: asNumber(data.totals?.sessions), ai_sessions: asNumber(data.ai_referrals?.totals?.sessions), key_events: asNumber(data.totals?.key_events) };
    },
  };
}

// A metodologia é texto fixo: não toca em dados, então não precisa de projeto nem de armazenamento.
const noStore = new Proxy({}, { get: () => () => Promise.reject(new Error('store_unavailable')) }) as unknown as VisibilityStore;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
  const admin = createClient(Deno.env.get('SUPABASE_URL') || '', key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    let parsed: unknown;
    try { parsed = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'invalid_json' }, 400);
    const body = parsed as Record<string, unknown>;
    const actor = await resolveRequestActor(req, typeof body.userId === 'string' ? body.userId : null);
    if (actor.mode !== 'user') return json({ error: 'interactive_owner_required' }, 403); // a visibilidade é sempre de uma pessoa logada
    const action = typeof body.action === 'string' ? body.action : '';
    if (!VISIBILITY_ACTIONS.includes(action)) return json({ error: 'unsupported_action' }, 400);
    const nowMs = Date.now();

    if (action === 'methodology') {
      const reply = await handleVisibilityAction(action, body, { store: noStore, viewer: { role: 'client', can_manage_technical: false }, nowMs, brandName: '', actorId: actor.userId });
      return json(reply.body, reply.status);
    }

    // Portão de projeto (o mesmo do restante do módulo): dono do projeto E membro ativo da organização; o gestor (CEO) entra em qualquer projeto.
    if (!isUuid(body.projectId)) return json({ error: 'project_required' }, 400);
    const mgmt = makeManagementStore(admin);
    let { data: project, error: projectError } = await admin.from('projects').select(PROJECT_COLS).eq('id', body.projectId).eq('user_id', actor.userId).maybeSingle();
    let foreignManager = false;
    if (!project && !projectError && (await mgmt.isManagerUser(actor.userId))) {
      const foreign = await admin.from('projects').select(PROJECT_COLS).eq('id', body.projectId).maybeSingle();
      project = foreign.data; projectError = foreign.error; foreignManager = !!foreign.data;
    }
    if (projectError || !project?.organization_id) return json({ error: 'project_forbidden' }, 403);
    const org = String(project.organization_id);
    if (!foreignManager) {
      const { data: membership, error: membershipError } = await admin.from('organization_members').select('organization_id').eq('organization_id', org).eq('user_id', actor.userId).eq('status', 'active').maybeSingle();
      if (membershipError || !membership) return json({ error: 'organization_membership_required' }, 403);
    }
    const { viewer } = await loadViewer(mgmt, org, actor.userId);
    const reply = await handleVisibilityAction(action, body, {
      store: makeStore(admin, { id: String(project.id), organization_id: org }), viewer, nowMs, brandName: String(project.name || '').trim(), actorId: actor.userId,
    });
    return json(reply.body, reply.status);
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ error: error.code }, error.status);
    if (error instanceof NotReadyError) return json({ error: 'visibility_not_ready' }, 503);
    console.error('nexus-visibility failed:', String((error as { message?: unknown } | null)?.message ?? 'unknown').slice(0, 200));
    return json({ error: 'operation_failed' }, 500);
  }
});
