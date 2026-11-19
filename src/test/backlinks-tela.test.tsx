import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BacklinkData, BacklinkRow } from '@/lib/backlinks-api';

const api = vi.hoisted(() => ({ callBacklinks: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Exemplo', domain: 'exemplo.com.br' }], isLoading: false }) }));
vi.mock('@/lib/backlinks-api', async (orig) => ({ ...(await orig<typeof import('@/lib/backlinks-api')>()), callBacklinks: api.callBacklinks }));

import Backlinks from '@/pages/Backlinks';
import { BacklinkError } from '@/lib/backlinks-api';

const P = '00000000-0000-4000-8000-0000000000b1';
const row = (i: number, over: Partial<BacklinkRow> = {}): BacklinkRow => ({
  id: `id-${i}`, target_host: 'exemplo.com.br', kind: 'own', source_url: `https://site${i}.com/pagina`, source_host: `site${i}.com`, source_domain: `site${i}.com`, target_url: null, anchor: 'Exemplo Advogados', link_attr: 'follow',
  origin: 'google_search_console', status: 'live', http_status: 200, source_noindex: false, links_found: 1, check_error: null, first_seen_at: '2026-11-10T10:00:00.000Z', last_checked_at: '2026-11-18T10:00:00.000Z', status_changed_at: null, last_live_at: '2026-11-18T10:00:00.000Z', ...over,
});
const summary = (over: Record<string, unknown> = {}) => ({
  total: 3, by_status: { unverified: 1, live: 1, lost: 1, dead: 0, blocked: 0 }, verified_pct: 67, referring_domains: { all: 3, live: 1 },
  attr: { follow: 1, nofollow: 0, sponsored: 0, ugc: 0, sem_dado: 0 }, anchors: { marca: 1, url: 0, generico: 0, imagem: 0, palavra_chave: 0, sem_dado: 0 },
  top_domains: [{ domain: 'site1.com', live: 1, total: 1 }], by_origin: { google_search_console: 3 }, lost_recent: { days: 30, count: 0, items: [] }, flags: [], ...over,
});
const data = (over: Partial<BacklinkData> = {}): BacklinkData => ({
  project: { id: P, name: 'Exemplo', domain: 'exemplo.com.br' }, can_edit: true, target: { host: 'exemplo.com.br', kind: 'own' }, targets: [{ host: 'exemplo.com.br', kind: 'own', count: 3 }],
  summary: summary() as never, links: [row(1), row(2, { status: 'lost', check_error: 'link_nao_encontrado_no_html', anchor: null, link_attr: null }), row(3, { status: 'unverified', last_checked_at: null })], page: 0, page_size: 50, filtered_total: 3,
  settings: null, alerts: [], limits: { max_links: 5000, total_links: 3, max_competitors: 5 }, ...over,
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Backlinks /></MemoryRouter></QueryClientProvider>);
beforeEach(() => { localStorage.clear(); api.callBacklinks.mockReset(); });

describe('backlinks: tela', () => {
  it('mostra o resumo real e a prova de cada link, sem inventar: situação, âncora, tipo, origem', async () => {
    api.callBacklinks.mockResolvedValue(data());
    mount();
    await screen.findByText(/O que a verificação mostra/);
    expect(screen.getByLabelText('Resumo dos backlinks').textContent).toMatch(/Links na lista3/);
    const tabela = screen.getByRole('region', { name: /Lista de backlinks/ });
    expect(tabela.textContent).toMatch(/site1\.com\/pagina/);
    expect(tabela.textContent).toMatch(/Exemplo Advogados/);
    expect(tabela.textContent).toMatch(/No ar/);
    expect(tabela.textContent).toMatch(/Link não encontrado/);
    expect(tabela.textContent).toMatch(/o link não está no HTML dela/); // explica o limite do robô
    expect(tabela.textContent).toMatch(/Google Search Console/);
    expect(tabela.textContent).toMatch(/nunca/); // ainda não verificado
  });

  it('lista vazia: convida a trazer a primeira lista', async () => {
    api.callBacklinks.mockResolvedValue(data({ summary: summary({ total: 0, by_status: { unverified: 0, live: 0, lost: 0, dead: 0, blocked: 0 }, verified_pct: null }) as never, links: [], filtered_total: 0 }));
    mount();
    expect(await screen.findByText(/Ainda não há backlinks guardados para exemplo\.com\.br/)).toBeTruthy();
  });

  it('importar: envia a lista, a origem e o alvo; mostra o que foi guardado e o que foi descartado', async () => {
    api.callBacklinks.mockImplementation(async (action: string) => (action === 'get' ? data() : { added: 2, already_there: 1, invalid: 1, self_links: 0, duplicates_in_file: 0, over_limit: 0, file_truncated: false }));
    mount();
    fireEvent.change(await screen.findByLabelText('Lista de páginas'), { target: { value: 'https://a.com/1\nhttps://b.com/2' } });
    fireEvent.change(screen.getByLabelText('De onde veio a lista'), { target: { value: 'ahrefs' } });
    const guardar = screen.getByRole('button', { name: /Guardar lista/ }) as HTMLButtonElement;
    await waitFor(() => expect(guardar.disabled).toBe(false));
    fireEvent.click(guardar);
    await waitFor(() => expect(api.callBacklinks).toHaveBeenCalledWith('import', { projectId: P, text: 'https://a.com/1\nhttps://b.com/2', origin: 'ahrefs', target: undefined }));
    const aviso = await screen.findByRole('status');
    expect(aviso.textContent).toMatch(/2 link\(s\) novo\(s\) guardado\(s\); 1 já estavam na lista; 1 linha\(s\) sem endereço de página válido/);
  });

  it('importar para um concorrente envia o endereço dele', async () => {
    api.callBacklinks.mockImplementation(async (action: string) => (action === 'get' ? data() : { added: 1, already_there: 0, invalid: 0, self_links: 0, duplicates_in_file: 0, over_limit: 0, file_truncated: false }));
    mount();
    fireEvent.change(await screen.findByLabelText('Lista de páginas'), { target: { value: 'https://a.com/1' } });
    fireEvent.change(screen.getByLabelText(/Site que recebe os links \(em branco/), { target: { value: 'rival.com.br' } });
    const guardar = screen.getByRole('button', { name: /Guardar lista/ }) as HTMLButtonElement;
    await waitFor(() => expect(guardar.disabled).toBe(false));
    fireEvent.click(guardar);
    await waitFor(() => expect(api.callBacklinks).toHaveBeenCalledWith('import', expect.objectContaining({ target: 'rival.com.br' })));
  });

  it('verificar: repete por lotes até acabar e mostra o resultado', async () => {
    let calls = 0;
    api.callBacklinks.mockImplementation(async (action: string) => {
      if (action === 'get') return data();
      calls++;
      return calls === 1 ? { checked: 12, failed: 0, changes: 4, remaining_pending: 5 } : { checked: 5, failed: 1, changes: 2, remaining_pending: 0 };
    });
    mount();
    const botao = await screen.findByRole('button', { name: /Verificar os 1 ainda não verificados/ });
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(botao);
    expect((await screen.findByText(/Verificação concluída: 17 página\(s\) verificada\(s\), 6 mudança\(s\) de situação, 1 não consegui ler/))).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('erro do servidor aparece em português', async () => {
    api.callBacklinks.mockImplementation(async (action: string) => { if (action === 'get') return data(); throw new BacklinkError('competitor_limit'); });
    mount();
    fireEvent.change(await screen.findByLabelText('Lista de páginas'), { target: { value: 'https://a.com/1' } });
    const guardar = screen.getByRole('button', { name: /Guardar lista/ }) as HTMLButtonElement;
    await waitFor(() => expect(guardar.disabled).toBe(false));
    fireEvent.click(guardar);
    expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/já acompanha 5 concorrentes/);
  });

  it('sinais de atenção, avisos de links perdidos e reverificação automática', async () => {
    api.callBacklinks.mockImplementation(async (action: string) => (action === 'get' ? data({
      summary: summary({ flags: [{ key: 'concentracao', text: 'Um único site (blog.com) responde por 60% dos links ativos. Perfil muito concentrado.' }] }) as never,
      alerts: [{ id: 'al1', source: 'backlinks', kind: 'links_lost', title: '2 backlink(s) que estava(m) no ar deixou(aram) de aparecer', detail: {}, ref_url: 'https://x.com/p', created_at: '2026-11-19T10:00:00.000Z' }],
      settings: { enabled: false, recheck_days: 14, last_run_at: null },
    }) : { settings: { enabled: true, recheck_days: 14 } }));
    mount();
    expect(await screen.findByText(/responde por 60% dos links ativos/)).toBeTruthy();
    expect(screen.getByText(/2 backlink\(s\) que estava\(m\) no ar/)).toBeTruthy();
    const caixa = screen.getByLabelText(/Reverificar sozinho/) as HTMLInputElement;
    await waitFor(() => expect(caixa.disabled).toBe(false));
    fireEvent.click(caixa);
    await waitFor(() => expect(api.callBacklinks).toHaveBeenCalledWith('settings_save', { projectId: P, enabled: true, recheck_days: 14 }));
  });

  it('visualizador vê tudo mas não altera nada', async () => {
    api.callBacklinks.mockResolvedValue(data({ can_edit: false }));
    mount();
    await screen.findByText(/O que a verificação mostra/);
    expect((screen.getByRole('button', { name: /Guardar lista/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Lista de páginas') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^Verificar https/i })).toBeNull(); // sem botões por linha
    expect((screen.getByRole('button', { name: /ainda não verificados/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/permite ver os backlinks, mas não alterar/)).toBeTruthy();
  });

  it('filtro por situação envia o filtro e volta para a primeira página', async () => {
    api.callBacklinks.mockResolvedValue(data());
    mount();
    fireEvent.change(await screen.findByLabelText('Situação'), { target: { value: 'lost' } });
    await waitFor(() => expect(api.callBacklinks).toHaveBeenCalledWith('get', expect.objectContaining({ status: 'lost', page: 0 })));
  });
});
