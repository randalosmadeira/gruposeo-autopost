import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TEMPLATE_ADVOCACIA_PF, TEMPLATE_GENERICO, configFromTemplate, validateConfig, type FunnelConfig, type FunnelEntries } from '../../supabase/functions/_shared/funnel-core';
import { COUNCIL } from '../../supabase/functions/_shared/profile-registry';

const api = vi.hoisted(() => ({ callFunnel: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Escritório Souza', domain: 'souza.adv.br' }], isLoading: false }) }));
vi.mock('@/lib/funnel-api', async (orig) => ({ ...(await orig<typeof import('@/lib/funnel-api')>()), callFunnel: api.callFunnel }));

import Funnel from '@/pages/Funnel';
import { FunnelError } from '@/lib/funnel-api';

const P = '00000000-0000-4000-8000-0000000000b1';
const council = COUNCIL.Advocacia[1];
const entries: FunnelEntries = {
  '2026-09': { contatos: 100, triagens: 40, pastas_completas: 30, analises: 24, contratos: 12, indicacoes: 6, contatos_nicho: 70, contatos_conteudo: 35, primeira_resposta_min: 90, dias_pasta_completa: 5, casos_por_pessoa: 18 },
  '2026-10': { contatos: 120, triagens: 42, pastas_completas: 21, analises: 18, contratos: 10, indicacoes: 8, contatos_nicho: 90, contatos_conteudo: 62, primeira_resposta_min: 130, dias_pasta_completa: 9, casos_por_pessoa: 21 },
};
const months = ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11', '2025-10'];
const payload = (over: Record<string, unknown> = {}) => ({
  project: { id: P, name: 'Escritório Souza' }, role: 'owner', can_write: true, segment: 'Advocacia', council,
  configured: true, version: 1, config: configFromTemplate('advocacia-pf', council), suggested: { template: 'advocacia-pf', config: configFromTemplate('advocacia-pf', council) },
  current_month: '2026-11', months, entries, ...over,
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Funnel /></MemoryRouter></QueryClientProvider>);

beforeEach(() => { localStorage.clear(); api.callFunnel.mockReset(); });

describe('funil: tela', () => {
  it('sem funil: oferece os modelos, marca o sugerido pelo segmento e cria o funil com o conselho do projeto', async () => {
    api.callFunnel.mockImplementation(async (action: string) => (action === 'get' ? payload({ configured: false, version: 0, config: null, entries: {} }) : { saved: true }));
    mount();
    await screen.findByText('Escolha o ponto de partida do funil');
    expect(screen.getByText('sugerido para este projeto')).toBeTruthy();
    const cards = screen.getAllByRole('listitem').filter((li) => within(li).queryByRole('button', { name: 'Usar este modelo' }));
    expect(cards).toHaveLength(2);
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Usar este modelo' })); // advocacia (ordem dos modelos)
    await waitFor(() => expect(api.callFunnel).toHaveBeenCalledWith('save_config', expect.objectContaining({ projectId: P, expectedVersion: 0 })));
    const body = api.callFunnel.mock.calls.find((c) => c[0] === 'save_config')?.[1] as { config: { template: string; stages: Array<{ key: string; compliance?: string }> } };
    expect(body.config.template).toBe('advocacia-pf');
    expect(body.config.stages.find((s) => s.key === 'analise')?.compliance).toBeTruthy();
  });

  it('mostra o funil do mês, onde vaza, as seis etapas com indicador e o lembrete do Provimento', async () => {
    api.callFunnel.mockResolvedValue(payload({ current_month: '2026-10', months: months.slice(1) }));
    mount();
    await screen.findByText('O funil do mês');
    expect(screen.getAllByText('Aqui o funil vaza').length).toBe(1);
    expect(screen.getByText(/Onde vaza:/).parentElement?.textContent).toMatch(/Triagens \(análises marcadas\)" para "Pastas completas"/);
    for (const label of ['1. Nicho', '2. Conteúdo informativo', '3. Atendimento imediato', '4. Coleta de documentos', '5. Análise sem promessa', '6. Escala e lembrança']) expect(screen.getByRole('heading', { name: label })).toBeTruthy();
    expect(screen.getAllByRole('note').some((n) => /promessa/i.test(n.textContent || ''))).toBe(true);
    expect(screen.getAllByText('2,2 h').length).toBeGreaterThan(0); // 130 min
    expect(screen.getByRole('region', { name: /Tabela mensal/ })).toBeTruthy();
  });

  it('mês sem números: diz que não há dados (nunca zero) e mostra "sem dados" nos indicadores', async () => {
    api.callFunnel.mockResolvedValue(payload());
    mount();
    await screen.findByText(/Ainda não há números em/);
    expect(screen.getAllByText('sem dados').length).toBeGreaterThan(3);
    expect(screen.queryByText('Aqui o funil vaza')).toBeNull();
  });

  it('lançar números: envia só o que mudou, vazio vira limpar, e confirma na tela', async () => {
    api.callFunnel.mockImplementation(async (action: string) => (action === 'get' ? payload({ current_month: '2026-10', months: months.slice(1) }) : { saved: true }));
    mount();
    const contatos = (await screen.findByLabelText('Contatos')) as HTMLInputElement;
    await waitFor(() => expect(contatos.value).toBe('120'));
    fireEvent.change(contatos, { target: { value: '125' } });
    fireEvent.change(screen.getByLabelText('Contatos do nicho'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar os números do mês' }));
    await waitFor(() => expect(api.callFunnel).toHaveBeenCalledWith('save_month', { projectId: P, month: '2026-10', values: { contatos: '125', contatos_nicho: null } }));
    expect(await screen.findByText('Números do mês salvos.')).toBeTruthy();
  });

  it('erro do servidor aparece em português e nada é dado como salvo', async () => {
    api.callFunnel.mockImplementation(async (action: string) => {
      if (action === 'get') return payload({ current_month: '2026-10', months: months.slice(1) });
      throw new FunnelError('month_values_invalid', 'count_must_be_integer', 'contatos');
    });
    mount();
    const contatos = await screen.findByLabelText('Contatos');
    await waitFor(() => expect((contatos as HTMLInputElement).value).toBe('120'));
    fireEvent.change(contatos, { target: { value: '12,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar os números do mês' }));
    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/números inteiros/);
    expect(screen.queryByText('Números do mês salvos.')).toBeNull();
  });

  it('quem só pode ler vê tudo, mas não edita', async () => {
    api.callFunnel.mockResolvedValue(payload({ can_write: false, role: 'viewer', current_month: '2026-10', months: months.slice(1) }));
    mount();
    const contatos = await screen.findByLabelText('Contatos');
    expect((contatos as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Salvar os números do mês' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ajustar nomes das etapas: salva com a versão atual e marca o modelo como personalizado', async () => {
    api.callFunnel.mockImplementation(async (action: string) => (action === 'get' ? payload({ version: 4 }) : { saved: true }));
    mount();
    const input = await screen.findByLabelText('Nome da etapa 1');
    fireEvent.change(input, { target: { value: '1. Público certo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar ajustes' }));
    await waitFor(() => expect(api.callFunnel).toHaveBeenCalledWith('save_config', expect.objectContaining({ expectedVersion: 4 })));
    const sent = api.callFunnel.mock.calls.find((c) => c[0] === 'save_config')?.[1] as { config: { template: string; stages: Array<{ label: string }> } };
    expect(sent.config.template).toBe('custom');
    expect(sent.config.stages[0].label).toBe('1. Público certo');
  });

  it('editor completo: adicionar coluna, indicador e etapa e salvar envia configuração válida', async () => {
    api.callFunnel.mockImplementation(async (action: string) => (action === 'get' ? payload({ version: 2 }) : { saved: true }));
    mount();
    fireEvent.change(await screen.findByLabelText('Nome da nova coluna'), { target: { value: 'Retornos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar coluna' }));
    fireEvent.change(screen.getByLabelText('Nome da nova etapa'), { target: { value: '7. Pós-venda' } });
    fireEvent.change(screen.getByLabelText('Objetivo da nova etapa'), { target: { value: 'Cliente que volta.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar etapa' }));
    // indicador na etapa nova (a última): razão retornos ÷ contratos
    const nomes = screen.getAllByLabelText(/Nome do novo indicador da etapa/);
    fireEvent.change(nomes[nomes.length - 1], { target: { value: 'Retornos ÷ contratos' } });
    const de = screen.getAllByLabelText('Parte de cima da razão'); const por = screen.getAllByLabelText('Parte de baixo da razão');
    fireEvent.change(de[de.length - 1], { target: { value: 'retornos' } });
    fireEvent.change(por[por.length - 1], { target: { value: 'contratos' } });
    const add = screen.getAllByRole('button', { name: 'Adicionar indicador' });
    fireEvent.click(add[add.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar ajustes' }));
    await waitFor(() => expect(api.callFunnel).toHaveBeenCalledWith('save_config', expect.objectContaining({ expectedVersion: 2 })));
    const { config } = api.callFunnel.mock.calls.find((c) => c[0] === 'save_config')?.[1] as { config: FunnelConfig };
    expect(config.template).toBe('custom');
    expect(config.counts.map((c) => c.key)).toContain('retornos');
    const etapa = config.stages.at(-1)!;
    expect(etapa.label).toBe('7. Pós-venda');
    expect(etapa.indicators[0]).toMatchObject({ kind: 'ratio', numerator: 'retornos', denominator: 'contratos' });
    expect(validateConfig(config).ok).toBe(true);
  });

  it('remover uma coluna avisa quais indicadores saem junto e só grava ao salvar', async () => {
    api.callFunnel.mockImplementation(async (action: string) => (action === 'get' ? payload({ version: 3 }) : { saved: true }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Remover a coluna Triagens/ }));
    const aviso = await screen.findByText(/foi removido, e com ele os indicadores/);
    expect(aviso.textContent).toMatch(/Análises marcadas ÷ contatos/);
    expect(api.callFunnel.mock.calls.some((c) => c[0] === 'save_config')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar ajustes' }));
    await waitFor(() => expect(api.callFunnel).toHaveBeenCalledWith('save_config', expect.anything()));
    const { config } = api.callFunnel.mock.calls.find((c) => c[0] === 'save_config')?.[1] as { config: FunnelConfig };
    expect(config.counts.map((c) => c.key)).not.toContain('triagens');
    expect(validateConfig(config).ok).toBe(true);
  });

  it('importar da planilha: prévia, depois grava mês a mês; recusas aparecem sem esconder o que entrou', async () => {
    api.callFunnel.mockImplementation(async (action: string, body: { month?: string }) => {
      if (action === 'get') return payload({ current_month: '2026-10', months: months.slice(1) });
      if (body.month === '2026-12') throw new FunnelError('month_in_future');
      return { saved: true };
    });
    mount();
    const area = await screen.findByLabelText('Tabela colada');
    fireEvent.change(area, { target: { value: 'Mês;Contatos;Triagens (análises marcadas);Outra coisa\n2026-08;80;30;1\n2026-09;90;;2\n2026-12;10;5;3' } });
    expect(screen.getByText(/Colunas reconhecidas:/).parentElement?.textContent).toMatch(/Contatos, Triagens/);
    expect(screen.getByText(/Ignoradas/).parentElement?.textContent).toMatch(/Outra coisa/);
    expect(screen.getByText(/3 mês\(es\), 5 número\(s\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Importar 3 mês/ }));
    await waitFor(() => expect(api.callFunnel.mock.calls.filter((c) => c[0] === 'save_month')).toHaveLength(3));
    expect(api.callFunnel).toHaveBeenCalledWith('save_month', { projectId: P, month: '2026-08', values: { contatos: '80', triagens: '30' } });
    expect(api.callFunnel).toHaveBeenCalledWith('save_month', { projectId: P, month: '2026-09', values: { contatos: '90' } }); // célula vazia não vira zero
    const alerta = await screen.findByText(/2 mês\(es\) importado\(s\)\. Não entraram/);
    expect(alerta.textContent).toMatch(/ainda não começou/);
  });

  it('importar: tabela sem colunas conhecidas mostra o erro e não habilita o botão', async () => {
    api.callFunnel.mockResolvedValue(payload({ current_month: '2026-10', months: months.slice(1) }));
    mount();
    fireEvent.change(await screen.findByLabelText('Tabela colada'), { target: { value: 'Mês;Foo\n2026-01;1' } });
    expect(screen.getAllByRole('alert').some((a) => /Nenhuma coluna/.test(a.textContent || ''))).toBe(true);
    expect((screen.getByRole('button', { name: /Importar/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('segmento sem modelo próprio recebe o genérico como sugestão', async () => {
    api.callFunnel.mockResolvedValue(payload({ configured: false, version: 0, config: null, entries: {}, segment: 'Estética e beleza', council: null, suggested: { template: 'generico', config: TEMPLATE_GENERICO } }));
    mount();
    await screen.findByText('Escolha o ponto de partida do funil');
    const sug = screen.getByText('sugerido para este projeto').closest('li') as HTMLElement;
    expect(within(sug).getByRole('heading').textContent).toMatch(/Genérico/);
    expect(TEMPLATE_ADVOCACIA_PF.stages).toHaveLength(6);
  });
});
