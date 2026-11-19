import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OverviewData } from '@/lib/overview-api';

const api = vi.hoisted(() => ({ callOverview: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Blog RDM', domain: 'rdmadvogados.com.br' }], isLoading: false }) }));
vi.mock('@/lib/overview-api', async (orig) => ({ ...(await orig<typeof import('@/lib/overview-api')>()), callOverview: api.callOverview }));

import Structure from '@/pages/Structure';
import { TrafficSummary } from '@/components/overview/TrafficSummary';
import { OverviewError } from '@/lib/overview-api';

const P = '00000000-0000-4000-8000-0000000000b1';
const d = (v: number | null, p: number | null = null, abs: number | null = null, pct: number | null = null) => ({ value: v, previous: p, abs, pct });
const data = (over: Partial<OverviewData> = {}): OverviewData => ({
  project: { id: P, name: 'Blog RDM', domain: 'rdmadvogados.com.br' }, can_refresh: true, days: 28,
  windows: { gsc: { cur_from: '2026-10-21', cur_to: '2026-11-17' }, ga4: { cur_from: '2026-10-22', cur_to: '2026-11-18' } },
  connections: { gsc: true, ga4: true, bing: true, tracking_key: true },
  kpis: {
    gsc: { clicks: d(78, 69, 9, 13), impressions: d(24122, 16519, 7603, 46), position: d(12.3, 16.8, -4.5, -26.8), ctr: d(0.32, 0.42, -0.1) },
    ga4: { sessions: d(54, 54, 0, 0), views: d(108, 105, 3, 2.9), users: d(51, 48, 3, 6.3), key_events: d(331, 348, -17, -4.9), ai_sessions: d(1, 0, 1, null) },
    cta: { total: 12, by_agent: { whatsapp: 9, phone: 3 } }, ai: { referrals: 2, bot_hits: 0 }, articles: { published: 2218, total: 2312, last_published_at: '2026-11-10T23:49:07.639+00:00' },
  },
  diagnostics: [{ key: 'ga4_abaixo_do_google', level: 'atencao', text: 'O GA4 contou 54 sessões e o Google informou 78 cliques no mesmo período.' }, { key: 'sem_llms', level: 'info', text: 'rdmadvogados.com.br não tem llms.txt.' }],
  channels: [], ga4_pages: [], top_pages: [{ page: 'https://rdmadvogados.com.br/blog/x/', clicks: 5, impressions: 300, position: 7.2 }], top_queries: [{ query: 'dmv', clicks: 0, impressions: 2795, position: 4.4 }],
  tree: [
    { host: 'rdmadvogados.com.br', primary: true, gsc: { pages: 571, clicks: 78, impressions: 21285, position: 13.2 }, map: { fetched_at: '2026-11-19T10:00:00.000Z', sitemap_found: true, sitemap_urls: 2344, files: 21, llms_found: true, robots_found: true, newest: '2026-11-11' },
      sections: [{ section: 'blog', gsc_pages: 560, clicks: 70, impressions: 20000, position: 14, sitemap_urls: 2300, flag: null }, { section: 'categoria-antiga', gsc_pages: 0, clicks: 0, impressions: 0, position: null, sitemap_urls: 40, flag: 'sem_busca' }] },
    { host: 'defesadecnh.rdmadvogados.com.br', primary: false, gsc: { pages: 1, clicks: 0, impressions: 2802, position: 4.5 }, map: null, sections: [{ section: '(raiz)', gsc_pages: 1, clicks: 0, impressions: 2802, position: 4.5, sitemap_urls: null, flag: null }] },
  ],
  map_updated_at: '2026-11-19T10:00:00.000Z', ...over,
});
const mount = (ui: JSX.Element) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
beforeEach(() => { localStorage.clear(); api.callOverview.mockReset(); });

describe('estrutura do negócio: tela', () => {
  it('mostra resultados com fonte e período, variação contra o anterior e posição que caiu como MELHORA', async () => {
    api.callOverview.mockResolvedValue(data());
    mount(<Structure />);
    await screen.findByText('No Google');
    expect(screen.getByText(/Search Console · 21\/10\/2026 a 17\/11\/2026/)).toBeTruthy();
    expect(screen.getByText(/Google Analytics \(GA4\) · 22\/10\/2026 a 18\/11\/2026/)).toBeTruthy();
    expect(screen.getAllByText(/melhorou \+9 \(\+13%\) vs\. o período anterior/).length).toBeGreaterThan(0);
    expect(screen.getByText(/melhorou -4,5 \(-26,8%\)/)).toBeTruthy(); // posição: menor é melhor
    expect(screen.getByText('Contatos medidos no site')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText(/nunca o número, o e-mail ou o que a pessoa digitou/)).toBeTruthy();
  });
  it('mostra os pontos de atenção em português', async () => {
    api.callOverview.mockResolvedValue(data());
    mount(<Structure />);
    expect(await screen.findByText(/O GA4 contou 54 sessões e o Google informou 78 cliques/)).toBeTruthy();
    expect(screen.getByText(/não tem llms\.txt/)).toBeTruthy();
  });
  it('árvore: site principal e subdomínio, seções com sitemap ao lado e observação; subdomínio sem mapa diz "mapa não lido"', async () => {
    api.callOverview.mockResolvedValue(data());
    mount(<Structure />);
    const main = await screen.findByRole('region', { name: /Endereço rdmadvogados\.com\.br/ });
    expect(main.textContent).toMatch(/site principal/);
    expect(main.textContent).toMatch(/sitemap com 2\.344 URL\(s\) em 21 arquivo\(s\)/);
    expect(main.textContent).toMatch(/Está no sitemap e não aparece no Google/);
    const sub = screen.getByRole('region', { name: /Endereço defesadecnh/ });
    expect(sub.textContent).toMatch(/subdomínio/);
    expect(sub.textContent).toMatch(/Mapa do domínio ainda não lido/);
    expect(sub.textContent).toMatch(/mapa não lido/);
  });
  it('sem dados: diz "sem dados" e nunca mostra zero inventado', async () => {
    api.callOverview.mockResolvedValue(data({ kpis: { gsc: null, ga4: null, cta: { total: 0, by_agent: {} }, ai: { referrals: 0, bot_hits: 0 }, articles: null }, top_pages: [], top_queries: [], tree: [], diagnostics: [] }));
    mount(<Structure />);
    expect(await screen.findByText(/Sem dados do Search Console para este projeto/)).toBeTruthy();
    expect(screen.getByText(/Sem dados do Google Analytics para este projeto/)).toBeTruthy();
    expect(screen.getByText(/Ainda não há cliques de contato medidos/)).toBeTruthy();
    expect(screen.getByText(/Nenhum ponto de atenção encontrado/)).toBeTruthy();
  });
  it('atualizar o mapa envia a ação, mostra o resultado e recarrega; trocar o período pede outro período', async () => {
    api.callOverview.mockImplementation(async (action: string) => (action === 'overview' ? data() : { refreshed: 2, hosts: [{ host: 'rdmadvogados.com.br', ok: true, sitemap_urls: 2344 }, { host: 'defesadecnh.rdmadvogados.com.br', ok: true, sitemap_urls: null }], fetched_at: '2026-11-20T10:00:00.000Z' }));
    mount(<Structure />);
    const botao = (await screen.findByRole('button', { name: /Atualizar mapa do domínio/ })) as HTMLButtonElement;
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
    await waitFor(() => expect(api.callOverview).toHaveBeenCalledWith('refresh_structure', { projectId: P }));
    expect((await screen.findByRole('status')).textContent).toMatch(/rdmadvogados\.com\.br: 2\.344 URLs; defesadecnh\.rdmadvogados\.com\.br: sem sitemap/);
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '90' } });
    await waitFor(() => expect(api.callOverview).toHaveBeenCalledWith('overview', { projectId: P, days: 90 }));
  });
  it('erro do servidor aparece em português', async () => {
    api.callOverview.mockImplementation(async (action: string) => { if (action === 'overview') return data(); throw new OverviewError('refresh_too_soon'); });
    mount(<Structure />);
    const botao = (await screen.findByRole('button', { name: /Atualizar mapa do domínio/ })) as HTMLButtonElement;
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/atualizado há pouco/);
  });
  it('quem só pode ver não atualiza o mapa', async () => {
    api.callOverview.mockResolvedValue(data({ can_refresh: false }));
    mount(<Structure />);
    await screen.findByText('No Google');
    expect((screen.getByRole('button', { name: /Atualizar mapa do domínio/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/permite ver, mas não atualizar o mapa/)).toBeTruthy();
  });
});

describe('visão geral: resumo no painel principal', () => {
  it('mostra cliques, posição, visitas e contatos e só os pontos de ATENÇÃO (até 3), com link para a estrutura', async () => {
    api.callOverview.mockResolvedValue(data());
    mount(<TrafficSummary />);
    await screen.findByText(/Resultados de Blog RDM \(28 dias\)/);
    expect(screen.getByLabelText('Resultados do projeto').textContent).toMatch(/Cliques no Google78/);
    expect(screen.getByLabelText('Resultados do projeto').textContent).toMatch(/Cliques de contato12/);
    expect(screen.getByText(/O GA4 contou 54 sessões/)).toBeTruthy();
    expect(screen.queryByText(/não tem llms\.txt/)).toBeNull(); // nível "info" não entra no resumo
    expect(screen.getByRole('link', { name: /Ver estrutura do domínio/ }).getAttribute('href')).toBe('/estrutura');
  });
  it('contatos ainda não medidos aparecem como "não medido", não como zero', async () => {
    api.callOverview.mockResolvedValue(data({ kpis: { ...data().kpis, cta: { total: 0, by_agent: {} } } }));
    mount(<TrafficSummary />);
    expect((await screen.findByLabelText('Resultados do projeto')).textContent).toMatch(/Cliques de contatonão medido/);
  });
});
