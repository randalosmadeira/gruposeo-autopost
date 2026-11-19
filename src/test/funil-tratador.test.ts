import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { FUNNEL_ACTIONS, handleFunnelAction } from '../../supabase/functions/_shared/funnel-handler';
import { TEMPLATE_ADVOCACIA_PF, TEMPLATE_GENERICO } from '../../supabase/functions/_shared/funnel-core';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const P2 = '00000000-0000-4000-8000-0000000000b2';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [
    { id: P, name: 'Escritório Souza', organization_id: ORG, nexus_strategy: {} },
    { id: P2, name: 'Estúdio', organization_id: ORG, nexus_strategy: {} },
  ],
  project_profile_extended: [{ project_id: P, sections: { negocio: { seg: 'Advocacia' } } }],
  project_funnels: [], project_funnel_entries: [], ...over,
});
const run = (action: string, body: Record<string, unknown>, role: string | null = 'owner', tables = seed()) => {
  const roleByOrg = new Map<string, string>(role ? [[ORG, role]] : [[OTHER, 'owner']]);
  const w = fakeAdmin(tables);
  return handleFunnelAction(w.admin, { action, body: { projectId: P, ...body }, userId: USER, roleByOrg, now: () => NOW }).then((r) => ({ ...r, w }));
};

describe('funil: função de borda', () => {
  it('ações existentes', () => { expect(FUNNEL_ACTIONS).toEqual(['get', 'save_config', 'save_month']); });

  it('get sem funil: oferece o modelo pelo segmento do Perfil (e o conselho), sem gravar nada', async () => {
    const tables = seed();
    const r = await run('get', {}, 'viewer', tables);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ configured: false, can_write: false, segment: 'Advocacia', version: 0, config: null, current_month: '2026-11' });
    expect((r.body.suggested as { template: string }).template).toBe('advocacia-pf');
    expect(String(r.body.council)).toMatch(/Provimento 205/);
    expect(tables.project_funnels).toHaveLength(0);
    // outro projeto, sem segmento no Perfil: modelo genérico
    const g = await run('get', { projectId: P2 });
    expect((g.body.suggested as { template: string }).template).toBe('generico');
  });

  it('save_config cria a versão 1, valida o contrato e recusa gravar por cima de versão mais nova', async () => {
    const tables = seed();
    const ok = await run('save_config', { config: TEMPLATE_ADVOCACIA_PF, expectedVersion: 0 }, 'editor', tables);
    expect(ok).toMatchObject({ status: 200, body: { saved: true, version: 1 } });
    expect(tables.project_funnels[0]).toMatchObject({ project_id: P, organization_id: ORG, template: 'advocacia-pf', version: 1, updated_by: USER });
    // segunda criação: conflito
    expect((await run('save_config', { config: TEMPLATE_ADVOCACIA_PF, expectedVersion: 0 }, 'owner', tables)).body.error).toBe('funnel_changed_reload');
    // atualização com a versão certa; com a versão velha recusa
    const cfg2 = { ...TEMPLATE_GENERICO, template: 'custom' };
    expect((await run('save_config', { config: cfg2, expectedVersion: 1 }, 'owner', tables)).body).toMatchObject({ saved: true, version: 2 });
    expect((await run('save_config', { config: cfg2, expectedVersion: 1 }, 'owner', tables)).status).toBe(409);
    // contrato inválido
    const bad = await run('save_config', { config: { ...TEMPLATE_GENERICO, counts: [] }, expectedVersion: 2 }, 'owner', tables);
    expect(bad).toMatchObject({ status: 422, body: { error: 'config_invalid', reason: 'counts_invalid' } });
    expect((await run('save_config', { config: TEMPLATE_GENERICO }, 'owner', tables)).body.error).toBe('expected_version_required');
  });

  it('save_month grava e limpa números; get devolve por mês; tudo validado contra a definição do projeto', async () => {
    const tables = seed();
    expect((await run('save_month', { month: '2026-10', values: { contatos: 5 } }, 'owner', tables)).body.error).toBe('funnel_not_configured');
    await run('save_config', { config: TEMPLATE_ADVOCACIA_PF, expectedVersion: 0 }, 'owner', tables);
    const w1 = await run('save_month', { month: '2026-10', values: { contatos: 120, triagens: '42', primeira_resposta_min: '12,5' } }, 'editor', tables);
    expect(w1).toMatchObject({ status: 200, body: { saved: true, month: '2026-10', set: 3, cleared: 0 } });
    expect(tables.project_funnel_entries.map((e) => `${e.month}|${e.metric_key}|${e.value}|${e.source}`).sort()).toEqual(['2026-10-01|contatos|120|manual', '2026-10-01|primeira_resposta_min|12.5|manual', '2026-10-01|triagens|42|manual']);
    await run('save_month', { month: '2026-10', values: { contatos: 130, triagens: null } }, 'owner', tables);
    expect(tables.project_funnel_entries.some((e) => e.metric_key === 'triagens')).toBe(false);
    expect(tables.project_funnel_entries.find((e) => e.metric_key === 'contatos')?.value).toBe(130);
    const g = await run('get', {}, 'viewer', tables);
    expect(g.body).toMatchObject({ configured: true, version: 1 });
    expect((g.body.entries as Record<string, Record<string, number>>)['2026-10']).toEqual({ contatos: 130, primeira_resposta_min: 12.5 });
    // recusas
    const bad = async (month: unknown, values: unknown) => (await run('save_month', { month, values }, 'owner', tables)).body;
    expect(await bad('2026-12', { contatos: 1 })).toMatchObject({ error: 'month_in_future' });
    expect(await bad('2026-13', { contatos: 1 })).toMatchObject({ error: 'month_values_invalid', reason: 'month_invalid' });
    expect(await bad('2026-10', { contatos: -4 })).toMatchObject({ error: 'month_values_invalid', reason: 'value_invalid', where: 'contatos' });
    expect(await bad('2026-10', { outra_coisa: 4 })).toMatchObject({ reason: 'metric_unknown' });
    expect(await bad('2026-10', { contatos: 1.5 })).toMatchObject({ reason: 'count_must_be_integer' });
  });

  it('isolamento: só membros da organização; escrita só com papel de escrita; dados de outro projeto não vazam', async () => {
    const tables = seed();
    await run('save_config', { config: TEMPLATE_ADVOCACIA_PF, expectedVersion: 0 }, 'owner', tables);
    await run('save_month', { month: '2026-10', values: { contatos: 99 } }, 'owner', tables);
    expect((await run('get', {}, null, tables)).body.error).toBe('organization_membership_required');
    for (const action of ['save_config', 'save_month']) expect((await run(action, { config: TEMPLATE_GENERICO, expectedVersion: 1, month: '2026-10', values: {} }, 'viewer', tables)).body.error).toBe('role_not_allowed');
    const other = await run('get', { projectId: P2 }, 'owner', tables);
    expect(other.body).toMatchObject({ configured: false, entries: {} }); // o funil do projeto P não aparece no P2
    expect((await run('get', { projectId: 'x' })).body.error).toBe('project_id_required');
    expect((await run('get', { projectId: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404);
    expect((await run('nada', {})).status).toBe(400);
  });

  it('configuração corrompida no banco não derruba a tela: volta como "não configurado" com o modelo sugerido', async () => {
    const tables = seed({ project_funnels: [{ project_id: P, organization_id: ORG, template: 'x', config: { version: 9 }, version: 3 }] });
    const g = await run('get', {}, 'owner', tables);
    expect(g.status).toBe(200);
    expect(g.body).toMatchObject({ configured: false, config: null });
  });
});
