import { describe, expect, it, vi } from 'vitest';
import { handleAgentAction, AGENT_ACTIONS } from '../../supabase/functions/_shared/profile-agent-handler';
import { cleanStrategy } from '../../supabase/functions/_shared/nexus-business';
import { fakeAdmin, type Row, type RpcHandler } from './helpers/fake-admin';

const PID = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

const programa = (over: Record<string, unknown> = {}) => ({
  organization_id: ORG, execution_enabled: true, budget_usd_micros: 50_000_000, reserved_usd_micros: 0, consumed_usd_micros: 0,
  settings: { providers_enabled: ['anthropic'], pricing_verified_at: '2026-11-13T21:37:53Z', cost_ceilings_usd_micros: { profile_agent: 30000 }, ...over },
});
const reserve: RpcHandler = (args, t) => {
  const op = t.nexus_operations.find((o) => o.id === args.p_operation)!;
  const p = t.nexus_programs[0];
  p.reserved_usd_micros = Number(p.reserved_usd_micros) + 30000;
  op.status = 'reserved';
  return { data: { reserved: 30000 }, error: null };
};
const finish: RpcHandler = (args, t) => { const op = t.nexus_operations.find((o) => o.id === args.p_operation)!; op.status = 'succeeded'; op.output = args.p_output; return { data: null, error: null }; };

function mundo(over: Record<string, Row[]> = {}) {
  return fakeAdmin({
    projects: [{ id: PID, name: 'Loja', domain: 'loja.com.br', organization_id: ORG, user_id: USER, nexus_business_id: null, nexus_strategy: cleanStrategy({ offer: 'Roupas' }), nexus_strategy_version: 1, nexus_profile_status: 'draft', wordpress_url: null }],
    nexus_programs: [programa()], nexus_operations: [], nexus_businesses: [],
    project_profile_conversations: [], project_profile_messages: [], project_profile_facts: [],
    project_profile_extended: [], project_profile_private: [], project_profile_snapshots: [], module_catalog: [], project_modules: [],
    ...over,
  }, { nexus_provider_secret_read: () => ({ data: 'sk-ant-x', error: null }), nexus_reserve_operation: reserve, nexus_finish_operation: finish });
}
const roles = (r: string | null) => new Map<string, string>(r ? [[ORG, r]] : []);
const call = (w: ReturnType<typeof mundo>, action: string, body: Record<string, unknown>, o: { role?: string | null; user?: string; fetchFn?: typeof fetch } = {}) =>
  handleAgentAction(w.admin, { action, body: { projectId: PID, ...body }, userId: o.user ?? USER, roleByOrg: roles(o.role === undefined ? 'owner' : o.role), fetchFn: o.fetchFn ?? vi.fn(), now: () => NOW });
const modelOk = () => vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'registrar_turno', input: { reply: 'Entendi!', extracted: [] } }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 }));

describe('P6: consentimento de voz (ditado)', () => {
  it('a ação existe', () => expect(AGENT_ACTIONS).toContain('voice_consent'));

  it('registra o consentimento criando a conversa (quem, quando) mesmo com a execução paga pausada, sem nenhuma mensagem', async () => {
    const w = mundo({ nexus_programs: [{ ...programa(), execution_enabled: false }] });
    const r = await call(w, 'voice_consent', { granted: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ consent_audio: true, consent_at: new Date(NOW).toISOString() });
    expect(w.tables.project_profile_conversations).toHaveLength(1);
    expect(w.tables.project_profile_conversations[0]).toMatchObject({ organization_id: ORG, project_id: PID, started_by: USER, status: 'open', consent_audio: true, consent_at: new Date(NOW).toISOString() });
    expect(w.tables.project_profile_messages).toHaveLength(0);
    expect(w.tables.nexus_operations).toHaveLength(0); // não custa nada, não toca no provedor
  });

  it('concordar de novo atualiza a MESMA conversa; revogar desliga e não apaga a conversa', async () => {
    const w = mundo();
    await call(w, 'voice_consent', { granted: true });
    await call(w, 'voice_consent', { granted: true });
    expect(w.tables.project_profile_conversations).toHaveLength(1);
    const r = await call(w, 'voice_consent', { granted: false });
    expect(r.body).toMatchObject({ consent_audio: false });
    expect(w.tables.project_profile_conversations).toHaveLength(1);
    expect(w.tables.project_profile_conversations[0].consent_audio).toBe(false);
  });

  it('revogar sem conversa não cria nada', async () => {
    const w = mundo();
    expect((await call(w, 'voice_consent', { granted: false })).body).toEqual({ conversation_id: null, consent_audio: false });
    expect(w.tables.project_profile_conversations).toHaveLength(0);
  });

  it('o histórico informa se o consentimento está valendo', async () => {
    const w = mundo();
    expect((await call(w, 'history', {})).body.consent_audio).toBe(false);
    await call(w, 'voice_consent', { granted: true });
    expect((await call(w, 'history', {})).body.consent_audio).toBe(true);
    await call(w, 'voice_consent', { granted: false });
    expect((await call(w, 'history', {})).body.consent_audio).toBe(false);
  });

  it('papel, organização e formato são conferidos', async () => {
    const w = mundo();
    expect((await call(w, 'voice_consent', { granted: true }, { role: 'viewer' })).body.error).toBe('role_not_allowed');
    expect((await call(w, 'voice_consent', { granted: true }, { role: null })).body.error).toBe('organization_membership_required');
    expect((await call(w, 'voice_consent', { granted: 'sim' })).body.error).toBe('granted_required');
    expect((await call(w, 'voice_consent', {})).body.error).toBe('granted_required');
    expect(w.tables.project_profile_conversations).toHaveLength(0);
    for (const role of ['owner', 'admin', 'editor']) expect((await call(mundo(), 'voice_consent', { granted: true }, { role })).status, role).toBe(200);
  });
});

describe('P6: turno com texto ditado exige o consentimento', () => {
  it('sem consentimento: 422 consent_required, ANTES do portão de custo, sem operação e sem chamar o provedor', async () => {
    const f = modelOk();
    const w = mundo({ nexus_programs: [{ ...programa(), execution_enabled: false }] });
    const r = await call(w, 'turn', { message: 'oi, vendo roupas', viaVoice: true }, { fetchFn: f });
    expect(r).toMatchObject({ status: 422, body: { error: 'consent_required' } });
    expect(w.tables.nexus_operations).toHaveLength(0);
    expect(w.tables.project_profile_conversations).toHaveLength(0); // nem conversa nova foi criada
    expect(f).not.toHaveBeenCalled();
  });

  it('com consentimento registrado o turno segue o caminho normal (aqui: portão pausado → 402; liberado → 200)', async () => {
    const paused = mundo({ nexus_programs: [{ ...programa(), execution_enabled: false }] });
    await call(paused, 'voice_consent', { granted: true });
    expect(await call(paused, 'turn', { message: 'oi', viaVoice: true })).toMatchObject({ status: 402, body: { error: 'budget_paused' } });
    const open = mundo();
    await call(open, 'voice_consent', { granted: true });
    const f = modelOk();
    const r = await call(open, 'turn', { message: 'vendo roupas femininas', viaVoice: true }, { fetchFn: f });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    expect(open.tables.project_profile_conversations).toHaveLength(1); // usou a conversa do consentimento
  });

  it('consentimento revogado volta a bloquear o ditado, mas o texto digitado continua livre', async () => {
    const w = mundo();
    await call(w, 'voice_consent', { granted: true });
    await call(w, 'voice_consent', { granted: false });
    expect((await call(w, 'turn', { message: 'oi', viaVoice: true })).body.error).toBe('consent_required');
    expect((await call(w, 'turn', { message: 'oi, vendo roupas' }, { fetchFn: modelOk() })).status).toBe(200);
  });

  it('o consentimento é de QUEM concordou e daquela conversa: outro usuário e conversa nova não herdam', async () => {
    const w = mundo();
    await call(w, 'voice_consent', { granted: true });
    expect((await call(w, 'turn', { message: 'oi', viaVoice: true }, { user: OTHER })).body.error).toBe('consent_required');
    // apagar a conversa (LGPD) leva o consentimento junto
    const id = w.tables.project_profile_conversations[0].id as string;
    expect((await call(w, 'delete_conversation', { conversationId: id })).status).toBe(200);
    expect((await call(w, 'turn', { message: 'oi', viaVoice: true })).body.error).toBe('consent_required');
  });

  it('viaVoice só vale com o booleano true; qualquer outro valor é tratado como texto digitado', async () => {
    const w = mundo();
    for (const v of ['true', 1, null, undefined, 'sim']) expect((await call(w, 'turn', { message: 'oi, vendo roupas', viaVoice: v }, { fetchFn: modelOk() })).status, String(v)).toBe(200);
  });
});
