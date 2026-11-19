/**
 * Execução das ações do agente do Perfil (marco P3) na função de borda `profile-agent`.
 * Caminho governado, o mesmo do Observatório: portão de execução por organização, credencial da organização, reserva de teto por operação
 * (RPC `nexus_reserve_operation`, tipo `profile_agent`) e baixa (`nexus_finish_operation`). Sem teto configurado ou com a execução paga
 * pausada, NENHUMA chamada ao provedor acontece. O modelo nunca grava o perfil: só devolve fatos "a confirmar"; quem confirma é a pessoa.
 */
import { asObject, readValues, type SectionMap, type Stores } from './profile-model.ts';
import { cleanStrategy } from './nexus-business.ts';
import { FIELD_BY_KEY, isPrivateStore } from './profile-registry.ts';
import { PRIVATE_ROLES, WRITE_ROLES } from './profile-service.ts';
import { handleProfileAction } from './profile-handler.ts';
import {
  AGENT_PROVIDER, MAX_USER_TURNS_PER_CONVERSATION, MAX_USER_TURNS_PER_PROJECT_DAY, anthropicRequest, buildUserContent, cleanUserMessage,
  fieldCatalog, parseAgentResponse, pickModel, profileDigest, validateExtraction, type HistoryMessage,
} from './profile-agent-core.ts';

export const AGENT_ACTIONS = ['history', 'turn', 'decide', 'delete_conversation', 'voice_consent'];

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface AgentCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; fetchFn: typeof fetch; now?: () => number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_COLUMNS = 'id,name,domain,organization_id,user_id,nexus_business_id,nexus_strategy,nexus_strategy_version,nexus_profile_status,wordpress_url,nicho,social_instagram,social_linkedin,social_tiktok,social_youtube,social_links,editorial_identity,commercial_info,compliance_rules';
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });

export async function handleAgentAction(admin: Admin, ctx: AgentCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (ctx.action === 'history') return await history(admin, ctx, project, role);
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');
    if (ctx.action === 'turn') return await turn(admin, ctx, project, role);
    if (ctx.action === 'voice_consent') return await voiceConsent(admin, ctx, project, role);
    if (ctx.action === 'decide') return await decide(admin, ctx, project, role);
    if (ctx.action === 'delete_conversation') return await deleteConversation(admin, ctx, project, role);
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[profile-agent] operation_failed');
    return fail(500, 'agent_operation_failed');
  }
}

// ------------------------------------------------------------------------------------------------------------ utilidades
async function currentValues(admin: Admin, project: Record<string, unknown>, canPrivate: boolean) {
  const [ext, priv] = await Promise.all([
    admin.from('project_profile_extended').select('sections').eq('project_id', project.id).maybeSingle(),
    canPrivate ? admin.from('project_profile_private').select('finance,goals').eq('project_id', project.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (ext.error || priv.error) throw new Error('profile_read_failed');
  const stores: Stores = { strategy: cleanStrategy(project.nexus_strategy), sections: asObject(ext.data?.sections) as SectionMap, finance: asObject(priv.data?.finance), goals: asObject(priv.data?.goals) };
  return readValues(stores, canPrivate);
}

async function findConversation(admin: Admin, ctx: AgentCtx, project: Record<string, unknown>, role: string) {
  const id = ctx.body.conversationId;
  if (typeof id === 'string' && id) {
    if (!UUID.test(id)) return { error: fail(422, 'conversation_id_invalid') };
    const { data, error } = await admin.from('project_profile_conversations').select('id,started_by,status,created_at,consent_audio').eq('id', id).eq('project_id', project.id).maybeSingle();
    if (error) throw error;
    if (!data || data.status === 'deleted') return { error: fail(404, 'conversation_not_found') };
    if (data.started_by !== ctx.userId && !PRIVATE_ROLES.includes(role)) return { error: fail(403, 'conversation_not_yours') };
    return { conversation: data };
  }
  const { data, error } = await admin.from('project_profile_conversations').select('id,started_by,status,created_at,consent_audio').eq('project_id', project.id).eq('started_by', ctx.userId).eq('status', 'open').order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return { conversation: (data && data[0]) || null };
}

const labelOf = (key: string) => FIELD_BY_KEY[key]?.label || key;

// ------------------------------------------------------------------------------------------------------------ histórico
async function history(admin: Admin, ctx: AgentCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const found = await findConversation(admin, ctx, project, role);
  if (found.error) return found.error;
  const canPrivate = PRIVATE_ROLES.includes(role);
  let messages: unknown[] = [];
  const conversation = found.conversation;
  if (conversation) {
    const { data, error } = await admin.from('project_profile_messages').select('id,role,content,extracted,created_at').eq('conversation_id', conversation.id).order('created_at', { ascending: true }).limit(60);
    if (error) throw error;
    messages = data || [];
    // quem não vê financeiro e metas (papel rebaixado depois da conversa) não recebe os itens privados que o agente extraiu
    if (!canPrivate) {
      messages = (messages as Array<{ extracted?: { items?: Array<{ key: string }>; rejected?: unknown } }>).map((m) => {
        const items = m.extracted?.items;
        if (!Array.isArray(items)) return m;
        return { ...m, extracted: { ...m.extracted, items: items.filter((i) => !(FIELD_BY_KEY[i.key] && isPrivateStore(FIELD_BY_KEY[i.key].store))) } };
      });
    }
  }
  const { data: facts, error: factsError } = await admin.from('project_profile_facts').select('id,field_key,value,is_private,confidence,source,status,observed_at').eq('project_id', project.id).eq('status', 'suggested').order('observed_at', { ascending: false }).limit(40);
  if (factsError) throw factsError;
  const visible = (facts || []).filter((f: { is_private: boolean }) => canPrivate || !f.is_private).map((f: { id: string; field_key: string; value: unknown; is_private: boolean; confidence: number; observed_at: string }) => ({ fact_id: f.id, key: f.field_key, label: labelOf(f.field_key), value: f.value, private: f.is_private, confidence: f.confidence, observed_at: f.observed_at }));
  const used = (messages as Array<{ role: string }>).filter((m) => m.role === 'user').length;
  return { status: 200, body: { conversation_id: conversation?.id ?? null, messages, facts: visible, turns_used: used, turns_left: Math.max(0, MAX_USER_TURNS_PER_CONVERSATION - used), consent_audio: conversation?.consent_audio === true } };
}

// ------------------------------------------------------------------------------------------------------------ consentimento de voz
/**
 * Registra (ou revoga) o consentimento para DITAR por voz nesta conversa. O áudio NUNCA chega a esta função: o navegador o transforma em texto
 * (com o serviço de voz do próprio navegador) e a pessoa revisa o texto antes de enviar. Aqui só fica o registro de quem concordou e quando.
 */
async function voiceConsent(admin: Admin, ctx: AgentCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const granted = ctx.body.granted;
  if (typeof granted !== 'boolean') return fail(422, 'granted_required');
  const found = await findConversation(admin, ctx, project, role);
  if (found.error) return found.error;
  const conversation = found.conversation;
  const nowIso = new Date((ctx.now ?? Date.now)()).toISOString();
  if (!conversation) {
    if (!granted) return { status: 200, body: { conversation_id: null, consent_audio: false } };
    const { data, error } = await admin.from('project_profile_conversations').insert({ organization_id: project.organization_id, project_id: project.id, started_by: ctx.userId, channel: 'text', status: 'open', consent_audio: true, consent_at: nowIso }).select('id').single();
    if (error) throw error;
    return { status: 200, body: { conversation_id: data.id, consent_audio: true, consent_at: nowIso } };
  }
  const { error } = await admin.from('project_profile_conversations').update(granted ? { consent_audio: true, consent_at: nowIso } : { consent_audio: false }).eq('id', conversation.id);
  if (error) throw error;
  return { status: 200, body: { conversation_id: conversation.id, consent_audio: granted, ...(granted ? { consent_at: nowIso } : {}) } };
}

// ------------------------------------------------------------------------------------------------------------ um turno da conversa
async function turn(admin: Admin, ctx: AgentCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const message = cleanUserMessage(ctx.body.message);
  if (!message) return fail(422, 'message_invalid');
  const canPrivate = PRIVATE_ROLES.includes(role);
  const orgId = project.organization_id as string;
  const nowMs = (ctx.now ?? Date.now)();

  // 0) texto que veio de DITADO por voz só entra com o consentimento registrado na conversa (LGPD); sem ele, nada mais acontece
  if (ctx.body.viaVoice === true) {
    const consent = await findConversation(admin, ctx, project, role);
    if (consent.error) return consent.error;
    if (consent.conversation?.consent_audio !== true) return fail(422, 'consent_required');
  }

  // 1) portão de execução da organização (mesma regra do Observatório): sem isso, nada além daqui acontece
  const { data: program, error: programError } = await admin.from('nexus_programs').select('execution_enabled,budget_usd_micros,settings').eq('organization_id', orgId).maybeSingle();
  if (programError) throw programError;
  if (!program || program.execution_enabled !== true || !(Number(program.budget_usd_micros) > 0)) return fail(402, 'budget_paused', { executed: false });
  const settings = asObject(program.settings);
  const enabled = Array.isArray(settings.providers_enabled) ? (settings.providers_enabled as unknown[]) : [];
  if (!enabled.includes(AGENT_PROVIDER)) return fail(402, 'provider_not_enabled', { executed: false });
  const ceilings = asObject(settings.cost_ceilings_usd_micros);
  if (!(Number(ceilings.profile_agent) > 0) || typeof settings.pricing_verified_at !== 'string' || !settings.pricing_verified_at) return fail(402, 'pricing_not_configured', { executed: false });

  // 2) conversa e limites
  const found = await findConversation(admin, ctx, project, role);
  if (found.error) return found.error;
  let conversation = found.conversation;
  if (!conversation) {
    const { data, error } = await admin.from('project_profile_conversations').insert({ organization_id: orgId, project_id: project.id, started_by: ctx.userId, channel: 'text', status: 'open' }).select('id,started_by,status,created_at').single();
    if (error) throw error;
    conversation = data;
  }
  const { data: prior, error: priorError } = await admin.from('project_profile_messages').select('role,content,created_at').eq('conversation_id', conversation.id).order('created_at', { ascending: true }).limit(60);
  if (priorError) throw priorError;
  const history: HistoryMessage[] = (prior || []).map((m: { role: 'user' | 'agent' | 'system'; content: string }) => ({ role: m.role, content: m.content }));
  const userTurns = history.filter((m) => m.role === 'user').length;
  if (userTurns >= MAX_USER_TURNS_PER_CONVERSATION) return fail(429, 'turn_limit_reached', { turns_left: 0 });
  const since = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  const { data: dayOps, error: dayError } = await admin.from('nexus_operations').select('id').eq('project_id', project.id).eq('kind', 'profile_agent').gte('created_at', since);
  if (dayError) throw dayError;
  if ((dayOps || []).length >= MAX_USER_TURNS_PER_PROJECT_DAY) return fail(429, 'daily_limit_reached');

  // 3) credencial da organização (nunca sai da função; não entra em log)
  const { data: credential, error: credentialError } = await admin.rpc('nexus_provider_secret_read', { p_org: orgId, p_provider: AGENT_PROVIDER });
  if (credentialError || typeof credential !== 'string' || !credential) return fail(409, 'organization_credential_required', { executed: false });

  // 4) operação + reserva de teto
  const model = pickModel(settings.profile_agent_model);
  const { data: op, error: opError } = await admin.from('nexus_operations').insert({
    organization_id: orgId, project_id: project.id, user_id: ctx.userId, kind: 'profile_agent', status: 'prepared', reserved_usd_micros: 0,
    request_key: `profile_agent:${conversation.id}:${nowMs}:${Math.random().toString(36).slice(2, 10)}`,
    input: { conversation_id: conversation.id, model, message_chars: message.length }, output: {},
  }).select('id').single();
  if (opError) throw opError;
  const { data: reservation, error: reserveError } = await admin.rpc('nexus_reserve_operation', { p_operation: op.id });
  if (reserveError) {
    const text = String((reserveError as { message?: string }).message || '');
    const code = /pricing_not_configured/.test(text) ? 'pricing_not_configured' : /budget_exceeded/.test(text) ? 'budget_exceeded' : /budget_paused/.test(text) ? 'budget_paused' : 'budget_or_pricing_gate';
    await admin.from('nexus_operations').update({ status: 'failed', output: { error: code, executed: false } }).eq('id', op.id);
    return fail(402, code, { executed: false });
  }
  const reserved = Number((reservation as { reserved?: number } | null)?.reserved) || 0;

  // 5) chamada ao provedor. Falha depois da reserva: a operação fica `uncertain` e a reserva retida (mesma regra do Observatório).
  let parsed: ReturnType<typeof parseAgentResponse>;
  try {
    const values = await currentValues(admin, project, canPrivate);
    const content = buildUserContent({ message, history, digest: profileDigest(values), catalog: fieldCatalog(canPrivate) });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 45000);
    let response: Response;
    try {
      response = await ctx.fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': credential, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify(anthropicRequest({ model, content })),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error('provider_request_failed');
      parsed = parseAgentResponse(await response.json());
    } finally {
      clearTimeout(timer);
    }
    if (!parsed) throw new Error('provider_response_invalid');

    // 6) valida o que o modelo "entendeu" contra o registro e contra a mensagem do usuário
    const { accepted, rejected } = validateExtraction(parsed.items, message, canPrivate, values);

    // 7) grava: mensagens, fatos "a confirmar" e baixa da operação
    const { error: userMsgError } = await admin.from('project_profile_messages').insert({ conversation_id: conversation.id, organization_id: orgId, role: 'user', content: message });
    if (userMsgError) throw new Error('persist_failed');
    const { error: agentMsgError } = await admin.from('project_profile_messages').insert({
      conversation_id: conversation.id, organization_id: orgId, role: 'agent', content: parsed.reply, model, cost_usd_micros: reserved,
      extracted: { items: accepted.map((a) => ({ key: a.key, value: a.value, quote: a.quote, confidence: a.confidence })), rejected },
    });
    if (agentMsgError) throw new Error('persist_failed');
    let items: Array<Record<string, unknown>> = [];
    if (accepted.length) {
      const { data: facts, error: factsError } = await admin.from('project_profile_facts').insert(accepted.map((a) => ({
        organization_id: orgId, project_id: project.id, field_key: a.key, value: a.value, is_private: isPrivateStore(FIELD_BY_KEY[a.key].store),
        source: 'agent', confidence: a.confidence, status: 'suggested',
      }))).select('id,field_key');
      if (factsError) throw new Error('persist_failed');
      const idByKey = new Map<string, string>((facts || []).map((f: { id: string; field_key: string }) => [f.field_key, f.id]));
      items = accepted.map((a) => ({ fact_id: idByKey.get(a.key) ?? null, key: a.key, label: labelOf(a.key), value: a.value, quote: a.quote, confidence: a.confidence, private: isPrivateStore(FIELD_BY_KEY[a.key].store) }));
    }
    const { error: finishError } = await admin.rpc('nexus_finish_operation', {
      p_operation: op.id,
      p_output: { accounting: 'configured_ceiling_debit_not_provider_invoice', provider: AGENT_PROVIDER, model, usage: parsed.usage, items_accepted: accepted.length, items_rejected: rejected.length, conversation_id: conversation.id },
    });
    if (finishError) throw new Error('finish_failed');
    return { status: 200, body: { conversation_id: conversation.id, reply: parsed.reply, items, rejected, turns_used: userTurns + 1, turns_left: Math.max(0, MAX_USER_TURNS_PER_CONVERSATION - userTurns - 1) } };
  } catch (e) {
    await admin.from('nexus_operations').update({ status: 'uncertain', output: { error: 'execution_or_recording_failed', reservation_retained: true } }).eq('id', op.id);
    const why = e instanceof Error && /^[a-z0-9_]{3,60}$/.test(e.message) ? e.message : 'unexpected';
    console.error('[profile-agent] turn_failed');
    return fail(502, 'agent_turn_failed', { reason: why, reservation_retained: true });
  }
}

// ------------------------------------------------------------------------------------------------------------ confirmar ou recusar um fato
async function decide(admin: Admin, ctx: AgentCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const factId = ctx.body.factId;
  const decision = ctx.body.decision;
  if (typeof factId !== 'string' || !UUID.test(factId)) return fail(422, 'fact_id_required');
  if (decision !== 'accept' && decision !== 'reject') return fail(422, 'decision_invalid');
  const { data: fact, error } = await admin.from('project_profile_facts').select('id,field_key,value,is_private,status').eq('id', factId).eq('project_id', project.id).maybeSingle();
  if (error) throw error;
  if (!fact) return fail(404, 'fact_not_found');
  if (fact.status !== 'suggested') return fail(409, 'fact_already_decided');
  if (fact.is_private && !PRIVATE_ROLES.includes(role)) return fail(403, 'private_not_allowed');
  const now = new Date((ctx.now ?? Date.now)()).toISOString();
  if (decision === 'reject') {
    const { error: upError } = await admin.from('project_profile_facts').update({ status: 'rejected', decided_by: ctx.userId, decided_at: now }).eq('id', fact.id).eq('status', 'suggested');
    if (upError) throw upError;
    return { status: 200, body: { success: true, fact_id: fact.id, status: 'rejected' } };
  }
  // aceitar = gravar no perfil pelo caminho normal (mesma validação, mesmo papel, mesma versão otimista)
  const saved = await handleProfileAction(admin, {
    action: 'profile_save', userId: ctx.userId, roleByOrg: ctx.roleByOrg,
    body: { projectId: project.id, changes: { [fact.field_key]: fact.value }, expected: ctx.body.expected, reason: 'Confirmado da conversa com a Zica' },
  });
  if (saved.status !== 200) return { status: saved.status, body: { ...saved.body, fact_id: fact.id } };
  const { error: upError } = await admin.from('project_profile_facts').update({ status: 'confirmed', decided_by: ctx.userId, decided_at: now }).eq('id', fact.id).eq('status', 'suggested');
  if (upError) throw upError;
  return { status: 200, body: { ...saved.body, fact_id: fact.id, fact_status: 'confirmed' } };
}

// ------------------------------------------------------------------------------------------------------------ apagar uma conversa (LGPD)
async function deleteConversation(admin: Admin, ctx: AgentCtx, project: Record<string, unknown>, role: string): Promise<Reply> {
  const id = ctx.body.conversationId;
  if (typeof id !== 'string' || !UUID.test(id)) return fail(422, 'conversation_id_invalid');
  const { data: conv, error } = await admin.from('project_profile_conversations').select('id,started_by,status').eq('id', id).eq('project_id', project.id).maybeSingle();
  if (error) throw error;
  if (!conv || conv.status === 'deleted') return fail(404, 'conversation_not_found');
  if (conv.started_by !== ctx.userId && !PRIVATE_ROLES.includes(role)) return fail(403, 'conversation_not_yours');
  const { error: delError } = await admin.from('project_profile_messages').delete().eq('conversation_id', id);
  if (delError) throw delError;
  const { error: upError } = await admin.from('project_profile_conversations').update({ status: 'deleted', closed_at: new Date((ctx.now ?? Date.now)()).toISOString() }).eq('id', id);
  if (upError) throw upError;
  return { status: 200, body: { success: true, conversation_id: id, deleted: true } };
}
