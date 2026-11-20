import { describe, expect, it, vi } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { fakeSpendDb, ORG_A, ORG_B, USER_1, usdm } from './helpers/fake-spend';
import { SPEND_POLICY_ACTIONS, handleSpendPolicyAction } from '../../supabase/functions/_shared/spend-policy-handler';

const NOW = Date.UTC(2026, 10, 20, 15, 0, 0);
const P1 = '00000000-0000-4000-8000-0000000000b1';
const P_OUTRA = '00000000-0000-4000-8000-0000000000b9';

function setup(role: string | null = 'owner', over: { spend?: Parameters<typeof fakeSpendDb>[0]; tables?: Record<string, Row[]>; paidBlocked?: boolean } = {}) {
  const spend = fakeSpendDb({ now: () => NOW, ...(over.spend || {}) });
  const tables = over.tables || { projects: [{ id: P1, name: 'Escritório Souza', organization_id: ORG_A }, { id: P_OUTRA, name: 'Projeto de outra organização', organization_id: ORG_B }], organization_spend_policy: [] };
  const fake = fakeAdmin(tables);
  const admin = { rpc: spend.rpc, from: fake.admin.from };
  const roleByOrg = new Map<string, string>(role ? [[ORG_A, role]] : [[ORG_B, 'owner']]);
  const run = (action: string, body: Record<string, unknown> = {}, r: Map<string, string> = roleByOrg) =>
    handleSpendPolicyAction(admin, { action, body: { organizationId: ORG_A, ...body }, userId: USER_1, roleByOrg: r, paidBlocked: over.paidBlocked ?? true });
  return { run, spend, tables, roleByOrg };
}

describe('teto diário: função de borda spend-policy', () => {
  it('ações existentes', () => { expect(SPEND_POLICY_ACTIONS).toEqual(['status', 'update_policy', 'unlock_extra', 'history']); });

  it('status: gasto de hoje, teto, adicional, restante e estado; com a constante true informa paid_blocked e cap_active:false', async () => {
    const t = setup('viewer', { spend: { ledger: [{ organization_id: ORG_A, amount: usdm(3.2), occurred_at: NOW - 1000, provider: 'openai', metadata: {} }] } });
    const r = await t.run('status');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      organization_id: ORG_A, role: 'viewer', can_unlock: false, can_edit_policy: false, paid_blocked: true, cap_active: false,
      spent_usd_micros: usdm(3.2), cap_usd_micros: usdm(7), extra_usd_micros: usdm(2.2), absolute_usd_micros: usdm(9.2), remaining_to_cap_usd_micros: usdm(3.8), state: 'livre', brl: null,
    });
  });

  it('status com o teto ligado (constante virada): cap_active true', async () => {
    const r = await setup('owner', { paidBlocked: false }).run('status');
    expect(r.body).toMatchObject({ paid_blocked: false, cap_active: true, can_unlock: true, can_edit_policy: true });
  });

  it('equivalente em reais SÓ se o dono informou o câmbio (sem valor inventado)', async () => {
    expect((await setup('owner').run('status')).body.brl).toBeNull();
    const t = setup('owner', { spend: { policies: { [ORG_A]: { fx: 5.5 } }, ledger: [{ organization_id: ORG_A, amount: usdm(2), occurred_at: NOW - 1000, metadata: {} }] } });
    const brl = (await t.run('status')).body.brl as { fx_brl_per_usd: number; spent: number; cap: number };
    expect(brl).toMatchObject({ fx_brl_per_usd: 5.5 });
    expect(brl.spent).toBeCloseTo(11, 5);
    expect(brl.cap).toBeCloseTo(38.5, 5);
  });

  it('estimativa "cabem ≈ N": sem dados no ledger diz "sem dados"; com dados usa o custo médio real', async () => {
    const semDados = await setup('owner').run('status');
    expect((semDados.body.estimate as { summary: Record<string, string> }).summary).toEqual({ calls: 'sem dados', articles: 'sem dados', landing_pages: 'sem dados' });
    const t = setup('owner', {
      spend: {
        ledger: [{ organization_id: ORG_A, amount: usdm(1), occurred_at: NOW - 1000, metadata: {} }],
        averages: { calls: { n: 3202, avg_usd_micros: 19_600 }, article: { n: 100, avg_usd_micros: 400_000 }, landing_page: { n: 0, avg_usd_micros: null } },
      },
    });
    const est = (await t.run('status')).body.estimate as { room_usd_micros: number; summary: Record<string, string>; calls: { fits: number }; articles: { fits: number } };
    expect(est.room_usd_micros).toBe(usdm(6)); // 7,00 - 1,00
    expect(est.calls.fits).toBe(Math.floor(usdm(6) / 19_600));
    expect(est.articles.fits).toBe(15);
    expect(est.summary.articles).toBe('≈ 15 artigos');
    expect(est.summary.landing_pages).toBe('sem dados');
  });

  it('status conta preços não verificados (nada é fato até o dono conferir)', async () => {
    const r = await setup('owner').run('status');
    expect(Number(r.body.unverified_prices)).toBeGreaterThan(10);
  });

  it('sem leitura confiável do gasto: 503, nunca um painel inventado', async () => {
    const t = setup('owner');
    t.spend.state.failRead = true;
    expect(await t.run('status')).toMatchObject({ status: 503, body: { error: 'spend_status_unavailable' } });
  });

  it('papéis: viewer e editor não liberam; admin libera; dono libera', async () => {
    for (const role of ['viewer', 'editor', 'campaign_manager']) {
      const t = setup(role);
      expect(await t.run('unlock_extra')).toMatchObject({ status: 403, body: { error: 'role_not_allowed' } });
      expect(t.spend.policies[ORG_A]?.unlockedOn).toBeUndefined();
    }
    for (const role of ['admin', 'owner']) {
      const t = setup(role);
      const r = await t.run('unlock_extra');
      expect(r).toMatchObject({ status: 200, body: { unlocked: true, extra_unlocked: true } });
      expect(t.spend.policies[ORG_A].unlockedOn).toBe('2026-11-20'); // só o dia corrente
    }
  });

  it('papéis: só o dono altera a política', async () => {
    for (const role of ['admin', 'editor', 'viewer']) {
      const t = setup(role);
      expect(await t.run('update_policy', { fxBrlPerUsd: 5.5 })).toMatchObject({ status: 403, body: { error: 'role_not_allowed' } });
      expect(t.tables.organization_spend_policy).toHaveLength(0);
    }
    const t = setup('owner');
    const r = await t.run('update_policy', { fxBrlPerUsd: 5.5, alertPct: 70, enabled: true });
    expect(r).toMatchObject({ status: 200, body: { saved: true } });
    expect(t.tables.organization_spend_policy[0]).toMatchObject({ organization_id: ORG_A, fx_brl_per_usd: 5.5, alert_pct: 70, enabled: true, updated_by: USER_1, timezone: 'America/Sao_Paulo' });
  });

  it('a política só pode DIMINUIR em relação à decisão do dono: teto > 7,00 e adicional > 2,20 são recusados', async () => {
    const t = setup('owner');
    expect(await t.run('update_policy', { dailyCapUsd: 7.01 })).toMatchObject({ status: 422, body: { error: 'cap_invalid' } });
    expect(await t.run('update_policy', { dailyCapUsd: 100 })).toMatchObject({ status: 422 });
    expect(await t.run('update_policy', { extraAllowanceUsd: 2.21 })).toMatchObject({ status: 422, body: { error: 'extra_invalid' } });
    expect(await t.run('update_policy', { dailyCapUsd: -1 })).toMatchObject({ status: 422 });
    expect(await t.run('update_policy', { dailyCapUsd: 5, extraAllowanceUsd: 1 })).toMatchObject({ status: 200 });
    expect(t.tables.organization_spend_policy[0]).toMatchObject({ daily_cap_usd_micros: 5_000_000, extra_allowance_usd_micros: 1_000_000 });
    expect(t.tables.organization_spend_policy).toHaveLength(1); // upsert por organização
  });

  it('valida câmbio, percentual de aviso, pausa e pedido vazio', async () => {
    const t = setup('owner');
    expect(await t.run('update_policy', { fxBrlPerUsd: 0 })).toMatchObject({ status: 422, body: { error: 'fx_invalid' } });
    expect(await t.run('update_policy', { fxBrlPerUsd: 'abc' })).toMatchObject({ status: 422 });
    expect(await t.run('update_policy', { alertPct: 0 })).toMatchObject({ status: 422, body: { error: 'alert_pct_invalid' } });
    expect(await t.run('update_policy', { alertPct: 80.5 })).toMatchObject({ status: 422 });
    expect(await t.run('update_policy', { enabled: 'sim' })).toMatchObject({ status: 422, body: { error: 'enabled_invalid' } });
    expect(await t.run('update_policy', {})).toMatchObject({ status: 422, body: { error: 'nothing_to_update' } });
    expect((await t.run('update_policy', { fxBrlPerUsd: null })).status).toBe(200); // o dono pode apagar o câmbio
    expect(t.tables.organization_spend_policy[0].fx_brl_per_usd).toBeNull();
  });

  it('isolamento: quem não é membro da organização não lê, não libera e não altera', async () => {
    const t = setup(null); // só é dono da B
    for (const action of ['status', 'history', 'unlock_extra', 'update_policy']) {
      expect(await t.run(action, { fxBrlPerUsd: 5 })).toMatchObject({ status: 403, body: { error: 'organization_membership_required' } });
    }
    expect(t.spend.calls).toHaveLength(0); // nem chegou ao banco de gasto
    expect(t.spend.policies[ORG_A]).toBeUndefined();
  });

  it('organização ausente: com um vínculo só usa-o; com vários exige escolher; id inválido é recusado', async () => {
    const t = setup('owner');
    const one = await handleSpendPolicyAction({ rpc: t.spend.rpc, from: () => undefined }, { action: 'status', body: {}, userId: USER_1, roleByOrg: new Map([[ORG_A, 'owner']]), paidBlocked: true });
    expect(one.status).toBe(200);
    const many = await handleSpendPolicyAction({ rpc: t.spend.rpc, from: () => undefined }, { action: 'status', body: {}, userId: USER_1, roleByOrg: new Map([[ORG_A, 'owner'], [ORG_B, 'owner']]), paidBlocked: true });
    expect(many).toMatchObject({ status: 422, body: { error: 'organization_required' } });
    expect(await t.run('status', { organizationId: 'lixo' })).toMatchObject({ status: 422, body: { error: 'organization_invalid' } });
    expect(await t.run('acao_que_nao_existe')).toMatchObject({ status: 400, body: { error: 'unknown_action' } });
  });

  it('history: por dia, e só nomeia projetos da própria organização', async () => {
    const history = { timezone: 'America/Sao_Paulo', window_days: 30, days: [{ day: '2026-11-19', total_usd_micros: usdm(1.57), estimated_usd_micros: 0, by_provider: { openai: usdm(1.57) }, by_module: { article_generation: usdm(1.57) }, by_project: { [P1]: usdm(1), [P_OUTRA]: usdm(0.57) } }] };
    const t = setup('viewer', { spend: { history } });
    const r = await t.run('history', { days: 500 });
    expect(r.status).toBe(200);
    expect(t.spend.calls.find((c) => c.name === 'spend_history')?.args).toMatchObject({ p_org: ORG_A, p_days: 90 }); // limitado a 90 dias
    expect(r.body.project_names).toEqual({ [P1]: 'Escritório Souza' }); // o projeto da outra organização não vaza o nome
    expect((r.body.days as unknown[]).length).toBe(1);
  });

  it('history sem leitura: 503', async () => {
    const t = setup('viewer');
    t.spend.state.failRead = 'malformed';
    expect(await t.run('history')).toMatchObject({ status: 503, body: { error: 'spend_history_unavailable' } });
  });

  it('erro inesperado vira 500 genérico, sem vazar detalhe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await handleSpendPolicyAction({ rpc: () => { throw new Error('segredo interno'); }, from: () => undefined }, { action: 'status', body: { organizationId: ORG_A }, userId: USER_1, roleByOrg: new Map([[ORG_A, 'owner']]), paidBlocked: true });
    expect(r).toMatchObject({ status: 500, body: { error: 'spend_policy_operation_failed' } });
    expect(JSON.stringify(r.body)).not.toMatch(/segredo/);
  });
});
