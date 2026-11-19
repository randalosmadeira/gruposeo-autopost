import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row, type RpcHandler } from './helpers/fake-admin';
import { handleProfileAction, PROFILE_ACTIONS } from '../../supabase/functions/_shared/profile-handler';
import { cleanStrategy } from '../../supabase/functions/_shared/nexus-business';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const PID = '00000000-0000-4000-8000-0000000000b1';
const catalog: Row[] = [
  { code: 'dashboard', name: 'Painel', description: null, route: '/dashboard', core: true, default_enabled: true, sort: 10 },
  { code: 'news_agents', name: 'Agentes de notícias', description: null, route: '/news-agents', core: false, default_enabled: false, sort: 160 },
  { code: 'articles', name: 'Artigos', description: null, route: '/articles', core: false, default_enabled: true, sort: 100 },
];

function mundo(rpcs: Record<string, RpcHandler> = {}, over: Partial<Record<string, Row[]>> = {}) {
  return fakeAdmin({
    projects: [{ id: PID, name: 'Blog', domain: 'blog.com.br', organization_id: ORG, user_id: 'u-dono', nexus_business_id: null, nexus_strategy: cleanStrategy({}), nexus_strategy_version: 0, nexus_profile_status: 'draft', wordpress_url: null }],
    project_profile_extended: [], project_profile_private: [], project_profile_snapshots: [], module_catalog: catalog, project_modules: [],
    ...over,
  }, rpcs);
}
const roles = (r: string | null) => new Map<string, string>(r ? [[ORG, r]] : []);
const call = (w: ReturnType<typeof mundo>, action: string, body: Record<string, unknown>, role: string | null = 'owner') =>
  handleProfileAction(w.admin, { action, body: { projectId: PID, ...body }, userId: 'u-1', roleByOrg: roles(role) });

describe('P5: decisão de módulo com efeito', () => {
  it('a ação de prévia existe', () => expect(PROFILE_ACTIONS).toContain('modules_preview'));

  it('modules_set chama a função do banco com projeto, módulo, decisão, motivo e autor (uma única chamada) e devolve os efeitos', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const w = mundo({ apply_project_module: (args) => { seen.push(args); return { data: { enabled: false, effects: [{ table: 'news_agents', label: 'Agentes de notícias', paused: 2 }] }, error: null }; } });
    const r = await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: false, reason: '  sem uso  ' });
    expect(r.status).toBe(200);
    expect(seen).toEqual([{ p_project: PID, p_module: 'news_agents', p_enabled: false, p_reason: 'sem uso', p_actor: 'u-1' }]);
    expect((r.body as { effects: unknown[] }).effects).toEqual([{ table: 'news_agents', label: 'Agentes de notícias', paused: 2 }]);
    expect(w.log.filter((l) => l.startsWith('rpc:'))).toEqual(['rpc:apply_project_module']);
    // o tratador NÃO grava direto na tabela de módulos: quem grava é a função do banco, junto com o efeito
    expect(w.log.filter((l) => /(insert|update|upsert|delete):project_modules/.test(l))).toEqual([]);
  });

  it('a resposta traz só QUANTIDADES do que está pausado, nunca os ids', async () => {
    const w = mundo({ apply_project_module: () => ({ data: { enabled: false, effects: [] }, error: null }) }, {
      project_modules: [{ project_id: PID, module_code: 'news_agents', enabled: false, reason: null, recommendation: null, recommendation_reason: null, decided_at: '2026-11-16T01:00:00Z', paused_state: { news_agents: ['id-secreto-1', 'id-secreto-2'], rss_schedules: [] } }],
    });
    const r = await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: false });
    const decisions = (r.body as { modules: { decisions: Array<Record<string, unknown>> } }).modules.decisions;
    expect(decisions[0].paused).toEqual({ news_agents: 2 });
    expect(decisions[0]).not.toHaveProperty('paused_state');
    expect(JSON.stringify(r.body)).not.toMatch(/id-secreto/);
  });

  it('papel e módulo são conferidos ANTES de chamar o banco (editor, visualizador, nuclear, desconhecido)', async () => {
    const w = mundo({ apply_project_module: () => ({ data: { effects: [] }, error: null }) });
    expect((await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: false }, 'editor')).status).toBe(403);
    expect((await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: false }, 'viewer')).status).toBe(403);
    expect((await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: false }, null)).status).toBe(403);
    expect((await call(w, 'modules_set', { moduleCode: 'dashboard', enabled: false })).status).toBe(422);
    expect((await call(w, 'modules_set', { moduleCode: 'inexistente', enabled: false })).status).toBe(422);
    expect((await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: 'sim' })).status).toBe(422);
    expect(w.log.filter((l) => l.startsWith('rpc:'))).toEqual([]);
    for (const role of ['owner', 'admin']) expect((await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: true }, role)).status, role).toBe(200);
  });

  it('função do banco ainda não instalada: recusa com 503 claro (a decisão NÃO fica registrada sem efeito)', async () => {
    const w = mundo({ apply_project_module: () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) });
    const r = await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: false });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('module_effects_unavailable');
    expect(w.tables.project_modules).toEqual([]);
  });

  it('erro qualquer do banco vira erro genérico, sem vazar a mensagem', async () => {
    const w = mundo({ apply_project_module: () => ({ data: null, error: { code: 'XX000', message: 'detalhe interno: tabela x coluna y' } }) });
    const r = await call(w, 'modules_set', { moduleCode: 'news_agents', enabled: false });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/detalhe interno/);
  });
});

describe('P5: prévia do que seria pausado', () => {
  const preview = (): Record<string, RpcHandler> => ({ preview_project_module: (args) => ({ data: [{ table: 'news_agents', label: 'Agentes de notícias', active: args.p_module === 'news_agents' ? 3 : 0 }], error: null }) });

  it('dono e administrador veem a prévia; nada é gravado', async () => {
    for (const role of ['owner', 'admin']) {
      const w = mundo(preview());
      const r = await call(w, 'modules_preview', { moduleCode: 'news_agents' }, role);
      expect(r.status, role).toBe(200);
      expect(r.body).toEqual({ module: 'news_agents', effects: [{ table: 'news_agents', label: 'Agentes de notícias', active: 3 }] });
      expect(w.log).toEqual(['rpc:preview_project_module']);
    }
  });
  it('editor, visualizador e quem não é da organização não veem; módulo nuclear ou desconhecido é recusado', async () => {
    const w = mundo(preview());
    expect((await call(w, 'modules_preview', { moduleCode: 'news_agents' }, 'editor')).status).toBe(403);
    expect((await call(w, 'modules_preview', { moduleCode: 'news_agents' }, 'viewer')).status).toBe(403);
    expect((await call(w, 'modules_preview', { moduleCode: 'news_agents' }, null)).status).toBe(403);
    expect((await call(w, 'modules_preview', { moduleCode: 'dashboard' })).status).toBe(422);
    expect((await call(w, 'modules_preview', { moduleCode: 'nada' })).status).toBe(422);
    expect(w.log).toEqual([]);
  });
  it('módulo sem efeito devolve lista vazia; função ausente devolve 503', async () => {
    const empty = mundo({ preview_project_module: () => ({ data: [], error: null }) });
    expect((await call(empty, 'modules_preview', { moduleCode: 'articles' })).body).toEqual({ module: 'articles', effects: [] });
    const missing = mundo({ preview_project_module: () => ({ data: null, error: { code: '42883' } }) });
    expect((await call(missing, 'modules_preview', { moduleCode: 'articles' })).status).toBe(503);
  });
});
