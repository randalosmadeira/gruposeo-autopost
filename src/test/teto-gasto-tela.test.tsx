import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ callSpend: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useOrganizationConsole', () => ({ useOrganizationConsole: () => ({ data: { membership: { organization_id: '00000000-0000-4000-8000-0000000000a1' } }, isLoading: false }) }));
vi.mock('@/lib/spend-api', async (orig) => ({ ...(await orig<typeof import('@/lib/spend-api')>()), callSpend: api.callSpend }));

import { NexusGlobalStatus } from '@/components/NexusGlobalStatus';
import { SpendError, fmtBrl, fmtUsd, fmtUsdBare, spendErrorMessage } from '@/lib/spend-api';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const usd = (v: number) => Math.round(v * 1_000_000);
const status = (over: Record<string, unknown> = {}) => ({
  organization_id: ORG, role: 'owner', can_unlock: true, can_edit_policy: true, paid_blocked: false, cap_active: true, day: '2026-11-20', timezone: 'America/Sao_Paulo',
  spent_usd_micros: usd(3.2), reserved_usd_micros: 0, estimated_usd_micros: 0, used_usd_micros: usd(3.2), cap_usd_micros: usd(7), extra_usd_micros: usd(2.2), absolute_usd_micros: usd(9.2),
  extra_unlocked: false, remaining_to_cap_usd_micros: usd(3.8), remaining_absolute_usd_micros: usd(6), state: 'livre', alert_pct: 80, enabled: true, fx_brl_per_usd: null, brl: null,
  top_projects: [], top_modules: [], top_providers: [], estimate: { room_usd_micros: usd(3.8), basis: 'x', summary: { calls: 'sem dados', articles: 'sem dados', landing_pages: 'sem dados' } }, unverified_prices: 0, ...over,
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NexusGlobalStatus /></MemoryRouter></QueryClientProvider>);
const OLD = /Serviços pagos bloqueados globalmente/;

afterEach(() => { api.callSpend.mockClear(); });

describe('teto diário: painel', () => {
  it('enquanto o servidor não informa o teto ativo (carregando, erro, função não publicada) a faixa de bloqueio de hoje continua igual', async () => {
    api.callSpend.mockImplementation(async () => { throw new SpendError('request_failed'); });
    mount();
    expect(screen.getByText(OLD)).toBeTruthy(); // primeira pintura: igual a hoje
    await waitFor(() => expect(api.callSpend).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30)); // deixa a consulta falhar de vez
    expect(screen.getByText(OLD)).toBeTruthy();
    expect(screen.queryByLabelText('Teto diário de gasto com IA')).toBeNull();
  });

  it('constante true no servidor (paid_blocked:true, cap_active:false): continua a faixa de bloqueio', async () => {
    api.callSpend.mockResolvedValue(status({ paid_blocked: true, cap_active: false }));
    mount();
    await waitFor(() => expect(api.callSpend).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText(OLD)).toBeTruthy();
    expect(screen.queryByText(/Hoje: /)).toBeNull();
  });

  it('teto ativo: "Hoje: US$ 3,20 de 7,00 (+2,20 adicional)", barra com os valores e sem reais quando o câmbio não foi informado', async () => {
    api.callSpend.mockResolvedValue(status());
    mount();
    const region = await screen.findByRole('region', { name: 'Teto diário de gasto com IA' });
    expect(within(region).getByText('Hoje: US$ 3,20 de 7,00')).toBeTruthy();
    expect(within(region).getByText('(+2,20 adicional)')).toBeTruthy();
    expect(screen.queryByText(OLD)).toBeNull();
    expect(within(region).queryByText(/R\$/)).toBeNull();
    const bar = within(region).getByRole('progressbar', { name: 'Gasto de hoje' });
    expect(bar.getAttribute('aria-valuenow')).toBe('3.2');
    expect(bar.getAttribute('aria-valuemax')).toBe('9.2');
    expect(within(region).getByText('Dentro do teto.')).toBeTruthy();
    expect(api.callSpend).toHaveBeenCalledWith('status', { organizationId: ORG });
  });

  it('equivalente em reais só com o câmbio informado pelo dono', async () => {
    api.callSpend.mockResolvedValue(status({ fx_brl_per_usd: 5.5, brl: { fx_brl_per_usd: 5.5, spent: 17.6, cap: 38.5, absolute: 50.6 } }));
    mount();
    const region = await screen.findByRole('region', { name: 'Teto diário de gasto com IA' });
    expect(within(region).getByText(/≈ R\$ 17,60 \(câmbio informado: 5,50\)/)).toBeTruthy();
  });

  it('cor por estado: aviso (âmbar), teto atingido (vermelho), adicional liberado (laranja), esgotado (vermelho forte)', async () => {
    const cases: Array<[string, string, string]> = [
      ['aviso', 'border-amber-500/50', 'Atenção'], ['teto_atingido', 'border-red-500/50', 'Teto atingido'],
      ['adicional_liberado', 'border-orange-500/50', 'Crédito adicional liberado'], ['esgotado', 'border-red-600/60', 'Limite absoluto'],
    ];
    for (const [state, cls, text] of cases) {
      api.callSpend.mockResolvedValue(status({ state, used_usd_micros: usd(7), extra_unlocked: state === 'adicional_liberado' }));
      const { unmount } = mount();
      const region = await screen.findByRole('region', { name: 'Teto diário de gasto com IA' });
      expect(region.className).toContain(cls);
      expect(within(region).getByText(new RegExp(text))).toBeTruthy();
      unmount();
    }
  });

  it('botão "Usar crédito adicional (até US$ 2,20)" com confirmação simples: só chama o servidor depois de confirmar', async () => {
    api.callSpend.mockImplementation(async (action: string) => (action === 'unlock_extra' ? status({ state: 'adicional_liberado', extra_unlocked: true, used_usd_micros: usd(7) }) : status({ state: 'teto_atingido', used_usd_micros: usd(7) })));
    mount();
    const btn = await screen.findByRole('button', { name: 'Usar crédito adicional (até US$ 2,20)' });
    fireEvent.click(btn);
    expect(api.callSpend.mock.calls.some((c) => c[0] === 'unlock_extra')).toBe(false);
    const group = screen.getByRole('group', { name: 'Confirmar crédito adicional' });
    expect(within(group).getByText('Liberar até US$ 2,20 a mais, só por hoje?')).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'Cancelar' }));
    expect(api.callSpend.mock.calls.some((c) => c[0] === 'unlock_extra')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Usar crédito adicional (até US$ 2,20)' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirmar crédito adicional' })).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.callSpend).toHaveBeenCalledWith('unlock_extra', { organizationId: ORG }));
  });

  it('o botão não aparece para quem não pode liberar, nem antes do aviso, nem com o adicional já liberado', async () => {
    for (const over of [{ can_unlock: false, state: 'teto_atingido' }, { state: 'livre' }, { state: 'teto_atingido', extra_unlocked: true }]) {
      api.callSpend.mockResolvedValue(status(over));
      const { unmount } = mount();
      await screen.findByRole('region', { name: 'Teto diário de gasto com IA' });
      expect(screen.queryByRole('button', { name: /Usar crédito adicional/ })).toBeNull();
      unmount();
    }
  });

  it('erro ao liberar: mostra mensagem clara em português', async () => {
    api.callSpend.mockImplementation(async (action: string) => { if (action === 'unlock_extra') throw new SpendError('role_not_allowed'); return status({ state: 'aviso', used_usd_micros: usd(6) }); });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar crédito adicional (até US$ 2,20)' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirmar crédito adicional' })).getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Só o dono ou um administrador/);
  });

  it('cartão "Gasto com IA": histórico por dia, provedor, módulo e projeto, com o estimado marcado', async () => {
    api.callSpend.mockImplementation(async (action: string) => (action === 'history'
      ? { organization_id: ORG, timezone: 'America/Sao_Paulo', window_days: 30, project_names: { 'p-1': 'Escritório Souza' }, days: [{ day: '2026-11-19', total_usd_micros: usd(1.57), estimated_usd_micros: usd(0.25), by_provider: { openai: usd(1.32), serper: usd(0.25) }, by_module: { article_generation: usd(1.32) }, by_project: { 'p-1': usd(1) } }] }
      : status()));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Gasto com IA' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('19/11/2026')).toBeTruthy();
    expect(within(dialog).getByText('US$ 1,57')).toBeTruthy();
    expect(within(dialog).getByText(/Estimado \(sem medida do provedor\): US\$ 0,25/)).toBeTruthy();
    expect(within(dialog).getByText(/Projeto: Escritório Souza US\$ 1,00/)).toBeTruthy();
    expect(api.callSpend).toHaveBeenCalledWith('history', { organizationId: ORG, days: 30 });
  });

  it('celular (400 px): linhas que quebram, barra de largura total, sem larguras mínimas e texto que não estoura', async () => {
    api.callSpend.mockResolvedValue(status({ state: 'teto_atingido', used_usd_micros: usd(7), unverified_prices: 3 }));
    mount();
    const region = await screen.findByRole('region', { name: 'Teto diário de gasto com IA' });
    const row = region.firstElementChild as HTMLElement;
    expect(row.className).toMatch(/flex-wrap/);
    expect(within(region).getByRole('progressbar').className).toMatch(/w-full/);
    expect(region.innerHTML).not.toMatch(/min-w-\[|w-\[\d+px\]/);
    expect(region.querySelectorAll('.break-words').length).toBeGreaterThanOrEqual(2);
    expect(within(region).getByText(/ainda não foi conferida/)).toBeTruthy(); // aviso honesto de preço estimado
  });
});

describe('teto diário: formatação e erros do cliente', () => {
  it('dólar com vírgula e duas casas; quatro casas só abaixo de um centavo; reais separados', () => {
    expect(fmtUsd(7_000_000)).toBe('US$ 7,00');
    expect(fmtUsdBare(2_200_000)).toBe('2,20');
    expect(fmtUsd(3_400)).toBe('US$ 0,0034');
    expect(fmtBrl(17.6)).toBe('R$ 17,60');
  });
  it('mensagens de erro em português; desconhecido cai em texto genérico', () => {
    expect(spendErrorMessage(new SpendError('spend_status_unavailable'))).toMatch(/Por segurança/);
    expect(spendErrorMessage(new SpendError('organization_membership_required'))).toMatch(/não faz parte/);
    expect(spendErrorMessage(new Error('x'))).toMatch(/Tente de novo/);
  });
});
