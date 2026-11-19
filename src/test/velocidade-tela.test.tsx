import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SpeedRunRow } from '../../supabase/functions/_shared/speed-core';

const api = vi.hoisted(() => ({ callSpeed: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Exemplo', domain: 'exemplo.com.br' }], isLoading: false }) }));
vi.mock('@/lib/speed-api', async (orig) => ({ ...(await orig<typeof import('@/lib/speed-api')>()), callSpeed: api.callSpeed }));

import Speed from '@/pages/Speed';
import { SpeedError } from '@/lib/speed-api';

const P = '00000000-0000-4000-8000-0000000000b1';
const run = (over: Partial<SpeedRunRow> = {}): SpeedRunRow => ({
  id: 'r1', url: 'https://exemplo.com.br/', host: 'exemplo.com.br', kind: 'own', strategy: 'mobile', fetched_at: '2026-11-19T04:11:00.000Z',
  performance_score: 92, lcp_ms: 2683, cls: 0.046, tbt_ms: 20, fcp_ms: 1513, ttfb_ms: 50, speed_index_ms: 4981, lighthouse_version: '13.6.0',
  field: { scope: 'origin', lcp: 2300, cls: 0.05, inp: 180, fcp: 1700, ttfb: 620, period: { first: '2026-10-20', last: '2026-11-16' } }, ...over,
});
const history = (runs: SpeedRunRow[] = [run()], canRun = true, extra: Record<string, unknown> = {}) => ({ project: { id: P, name: 'Exemplo', domain: 'exemplo.com.br' }, can_run: canRun, runs, competitors: [] as string[], schedule: null, alerts: [] as unknown[], ...extra });
const SCHEDULE = { enabled: true, frequency: 'weekly', devices: 'mobile', extra_urls: [] as string[], include_competitors: false, alert_drop_points: 10, next_run_at: '2099-01-01T10:00:00.000Z', last_run_at: '2026-11-18T10:00:00.000Z', consecutive_failures: 0 };
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Speed /></MemoryRouter></QueryClientProvider>);

beforeEach(() => { localStorage.clear(); api.callSpeed.mockReset(); });

describe('velocidade: tela', () => {
  it('mostra a última medição com laboratório e visitantes reais SEPARADOS e rotulados, e a origem de cada um', async () => {
    api.callSpeed.mockResolvedValue(history());
    mount();
    await screen.findByText('Teste simulado agora');
    expect(screen.getByText(/Laboratório · Lighthouse via PageSpeed Insights/)).toBeTruthy();
    expect(screen.getByText(/Campo · Chrome UX Report \(Google\), últimos 28 dias, percentil 75/)).toBeTruthy();
    expect(screen.getByLabelText('Nota de desempenho 92 de 100')).toBeTruthy();
    expect(screen.getAllByText('2,7 s').length).toBeGreaterThan(0); // LCP de laboratório
    expect(screen.getByText(/dados do site inteiro/)).toBeTruthy(); // campo veio da origem, não da página
    expect(screen.getAllByText('Bom').length).toBeGreaterThan(0);
  });

  it('sem dados de visitantes reais: explica que não é problema do site (e não inventa número)', async () => {
    api.callSpeed.mockResolvedValue(history([run({ field: null })]));
    mount();
    await screen.findByText('O que os visitantes reais sentiram');
    expect(screen.getByRole('note').textContent).toMatch(/Sem dados de visitantes reais/);
  });

  it('medir agora: envia a página inicial do projeto, o aparelho e mostra a comparação com a medição anterior', async () => {
    api.callSpeed.mockImplementation(async (action: string) => (action === 'history' ? history([run({ id: 'velho', performance_score: 80 })]) : { run: run({ id: 'novo', performance_score: 92 }), previous: run({ performance_score: 80 }), delta: { score: 12, lcp: -417 }, field_note: null, lab_fetched_at: null }));
    mount();
    const medir = (await screen.findByRole('button', { name: /Medir agora/ })) as HTMLButtonElement;
    await waitFor(() => expect(medir.disabled).toBe(false)); // só libera depois de saber a permissão
    fireEvent.click(medir);
    await waitFor(() => expect(api.callSpeed).toHaveBeenCalledWith('run', { projectId: P, url: 'https://exemplo.com.br/', strategy: 'mobile', kind: 'own' }));
    expect(await screen.findByText(/Medição concluída: nota 92/)).toBeTruthy();
    expect(screen.getAllByText(/melhorou/).length).toBeGreaterThan(0);
  });

  it('aparelho "Computador" muda o que é enviado', async () => {
    api.callSpeed.mockImplementation(async (action: string) => (action === 'history' ? history([]) : { run: run({ strategy: 'desktop' }), previous: null, delta: null, field_note: null, lab_fetched_at: null }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Computador' }));
    const medir = screen.getByRole('button', { name: /Medir agora/ }) as HTMLButtonElement;
    await waitFor(() => expect(medir.disabled).toBe(false));
    fireEvent.click(medir);
    await waitFor(() => expect(api.callSpeed).toHaveBeenCalledWith('run', expect.objectContaining({ strategy: 'desktop' })));
  });

  it('erros do Google/servidor aparecem em português e nada é dado como medido', async () => {
    api.callSpeed.mockImplementation(async (action: string) => { if (action === 'history') return history([]); throw new SpeedError('google_quota'); });
    mount();
    const medir = (await screen.findByRole('button', { name: /Medir agora/ })) as HTMLButtonElement;
    await waitFor(() => expect(medir.disabled).toBe(false)); // só libera depois de saber a permissão
    fireEvent.click(medir);
    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/Google limitou/);
    expect(screen.queryByText(/Medição concluída/)).toBeNull();
  });

  it('concorrente: envia como concorrente e entra no quadro lado a lado', async () => {
    let medido = false;
    api.callSpeed.mockImplementation(async (action: string) => {
      if (action === 'history') return history(medido ? [run({ id: 'rv', url: 'https://rival.com.br/', host: 'rival.com.br', kind: 'competitor', performance_score: 61 }), run()] : [run()]);
      medido = true;
      return { run: run({ url: 'https://rival.com.br/', host: 'rival.com.br', kind: 'competitor', performance_score: 61 }), previous: null, delta: null, field_note: null, lab_fetched_at: null };
    });
    mount();
    fireEvent.change(await screen.findByLabelText('Site do concorrente'), { target: { value: 'https://rival.com.br/' } });
    const rv = screen.getByRole('button', { name: 'Medir concorrente' }) as HTMLButtonElement;
    await waitFor(() => expect(rv.disabled).toBe(false));
    fireEvent.click(rv);
    await waitFor(() => expect(api.callSpeed).toHaveBeenCalledWith('run', { projectId: P, url: 'https://rival.com.br/', strategy: 'mobile', kind: 'competitor' }));
    const tabela = await screen.findByRole('region', { name: /Comparação de velocidade/ });
    await waitFor(() => expect(tabela.textContent).toMatch(/rival\.com\.br/));
    expect(tabela.textContent).toMatch(/concorrente/);
    expect(tabela.textContent).toMatch(/seu site/);
  });

  it('quem só pode ver não consegue medir', async () => {
    api.callSpeed.mockResolvedValue(history([run()], false));
    mount();
    await screen.findByText('Teste simulado agora');
    expect((screen.getByRole('button', { name: /Medir agora/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Medir concorrente' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('acompanhamento automático: liga com a frequência, o aparelho e o limiar escolhidos', async () => {
    api.callSpeed.mockImplementation(async (action: string) => (action === 'history' ? history([run()]) : { schedule: SCHEDULE }));
    mount();
    await screen.findByText('Acompanhamento automático');
    fireEvent.change(screen.getByLabelText('Frequência'), { target: { value: 'daily' } });
    fireEvent.change(screen.getByLabelText('Aparelhos medidos'), { target: { value: 'both' } });
    fireEvent.change(screen.getByLabelText('Página extra 1'), { target: { value: 'exemplo.com.br/contato' } });
    fireEvent.change(screen.getByLabelText(/Avisar quando a nota cair/), { target: { value: '15' } });
    const ligar = screen.getByRole('button', { name: /Ligar acompanhamento/ }) as HTMLButtonElement;
    await waitFor(() => expect(ligar.disabled).toBe(false));
    fireEvent.click(ligar);
    await waitFor(() => expect(api.callSpeed).toHaveBeenCalledWith('schedule_save', { projectId: P, schedule: { enabled: true, frequency: 'daily', devices: 'both', extra_urls: ['exemplo.com.br/contato'], include_competitors: false, alert_drop_points: 15 } }));
  });

  it('acompanhamento ligado mostra a próxima medição e permite desligar; erro do servidor aparece em português', async () => {
    api.callSpeed.mockImplementation(async (action: string, body: Record<string, unknown>) => {
      if (action === 'history') return history([run()], true, { schedule: SCHEDULE });
      if ((body.schedule as { enabled: boolean }).enabled === false) throw new SpeedError('schedule_url_outside_project_domain');
      return { schedule: SCHEDULE };
    });
    mount();
    await screen.findByText('Ligado');
    expect(screen.getByText(/Próxima medição: \d{2}\/\d{2}/)).toBeTruthy();
    const desligar = screen.getByRole('button', { name: 'Desligar' }) as HTMLButtonElement;
    await waitFor(() => expect(desligar.disabled).toBe(false));
    fireEvent.click(desligar);
    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/mesmo site do projeto/);
  });

  it('avisos de piora aparecem no topo e podem ser dispensados', async () => {
    const alerts = [{ id: 'a1', source: 'speed', kind: 'score_drop', title: 'A nota de velocidade de exemplo.com.br no celular caiu 20 pontos (de 90 para 70)', detail: {}, ref_url: 'https://exemplo.com.br/', created_at: '2026-11-19T10:00:00.000Z' }];
    api.callSpeed.mockImplementation(async (action: string) => (action === 'history' ? history([run()], true, { alerts }) : { dismissed: 1 }));
    mount();
    await screen.findByText(/caiu 20 pontos/);
    const botao = await screen.findByRole('button', { name: /Dispensar aviso/ });
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(botao);
    await waitFor(() => expect(api.callSpeed).toHaveBeenCalledWith('alerts_dismiss', { projectId: P, alertId: 'a1' }));
  });

  it('evolução da nota: precisa de 2 medições; com 2 ou mais desenha o gráfico com texto equivalente', async () => {
    api.callSpeed.mockResolvedValue(history([run()]));
    const first = mount();
    await screen.findByText(/a partir da segunda medição/);
    first.unmount();
    api.callSpeed.mockResolvedValue(history([run({ id: 'b', fetched_at: '2026-11-19T10:00:00.000Z', performance_score: 92 }), run({ id: 'a', fetched_at: '2026-11-12T10:00:00.000Z', performance_score: 80 })]));
    mount();
    expect(await screen.findByRole('img', { name: /de 80 em .* para 92 em .*2 medições/ })).toBeTruthy();
  });

  it('quem só pode ver não altera o acompanhamento', async () => {
    api.callSpeed.mockResolvedValue(history([run()], false, { schedule: SCHEDULE }));
    mount();
    await screen.findByText('Ligado');
    expect((screen.getByRole('button', { name: 'Salvar mudanças' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Frequência') as HTMLSelectElement).disabled).toBe(true);
  });
});
