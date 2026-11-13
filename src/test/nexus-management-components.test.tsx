import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnalyticsView } from '@/components/nexus-providers/AnalyticsTab';
import { AreaPerformanceView } from '@/components/nexus-providers/AreaPerformanceTab';
import { ClientProviderCard } from '@/components/nexus-providers/ClientProviderCard';
import { ClientStatusStrip } from '@/components/nexus-providers/ClientStatusStrip';
import { GuidedActivationCard } from '@/components/nexus-providers/GuidedActivationCard';
import { ProjectIntegrationsCard } from '@/components/nexus-providers/ProjectIntegrationsCard';
import { ManagerInboxView, MemberRequestsView } from '@/components/nexus-providers/RequestsTab';
import { emptyOverviewItem, normalizeOverviewItem } from '@/lib/nexus-providers';
import { normalizeContentPerformance, normalizeGa4Summary } from '@/lib/nexus-analytics';
import type { ClientRequest } from '@/types/nexus-requests';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }));

beforeAll(() => {
  class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const NOW = new Date('2026-11-13T12:00:00Z').getTime();

// ---------------------------------------------------------------------------
// Visão cliente de um motor
// ---------------------------------------------------------------------------
describe('ClientProviderCard (visão cliente)', () => {
  const connected = normalizeOverviewItem({
    id: 'gsc', category: 'search_truth', status: 'connected', score: null, enabled: false, updated_at: '2026-11-13T11:00:00Z',
    usage: { valid_30d: 12, failed_30d: 1, uncertain_30d: 0, last_success_at: null },
  });

  it('mostra status simples, última atualização e uso agregado, e só o botão Solicitar', () => {
    const onRequest = vi.fn();
    render(<ClientProviderCard item={connected} now={NOW} onRequest={onRequest} />);
    expect(screen.getByText('Conectado')).toBeTruthy();
    expect(screen.getByText('há 1 h')).toBeTruthy();
    expect(screen.getByText('12 válidas · 1 com falha')).toBeTruthy();
    // nada de ação técnica
    for (const name of [/Conectar/, /Trocar chave/, /Remover/, /Testar conexão/, /Documentação/, /Contratar/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
      expect(screen.queryByRole('link', { name })).toBeNull();
    }
    expect(screen.queryByText(/Custo de referência/)).toBeNull();
    expect(screen.queryByText(/Pontuação/)).toBeNull();
    expect(document.querySelector('input, textarea')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar ajuda: Google Search Console API' }));
    expect(onRequest).toHaveBeenCalledWith('gsc');
  });

  it('não conectado: texto simples e pedido de conexão; atenção: aviso em texto', () => {
    const onRequest = vi.fn();
    const { rerender } = render(<ClientProviderCard item={emptyOverviewItem('ga4')} now={NOW} onRequest={onRequest} />);
    expect(screen.getByText('Não conectado')).toBeTruthy();
    expect(screen.getByText('Ainda sem dados: peça ao gestor para conectar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Solicitar conexão: Google Analytics 4/ }));
    expect(onRequest).toHaveBeenCalledWith('ga4');
    rerender(<ClientProviderCard item={{ ...emptyOverviewItem('ga4'), status: 'degraded' }} now={NOW} onRequest={onRequest} />);
    expect(screen.getByText('Precisa de atenção')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/precisa de atenção/);
  });

  it('o Copilot (manual) é só informativo, sem botão', () => {
    render(<ClientProviderCard item={emptyOverviewItem('copilot')} now={NOW} onRequest={vi.fn()} />);
    expect(screen.getByText('Registro manual')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('faixa simples: sem custo, sem pontuação, sem botão de teste', () => {
    const items = [connected, { ...emptyOverviewItem('ga4'), status: 'degraded' as const }, emptyOverviewItem('serper')];
    render(<ClientStatusStrip items={items} now={NOW} />);
    expect(screen.getByTestId('client-strip-text').textContent).toContain('1 de 3 motores conectados · 1 com atenção · 1 não conectados');
    expect(screen.getByText('Há motores que precisam de atenção')).toBeTruthy();
    expect(screen.queryByText(/custo/i)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
describe('AnalyticsView', () => {
  const summary = normalizeGa4Summary({
    period: { from: '2026-10-16', to: '2026-11-13' },
    totals: { sessions: 1200, engaged_sessions: 900, page_views: 2500, users: 800, key_events: 31.5, avg_engagement_seconds: 125, engagement_rate: 0.75 },
    daily: [{ day: '2026-11-11', sessions: 40, engaged_sessions: 30, page_views: 90, users: 35, key_events: 1 }, { day: '2026-11-12', sessions: 50, engaged_sessions: 41, page_views: 99, users: 44, key_events: 2 }],
    top_pages: [{ page: '/direito-criminal/prisao-em-flagrante', sessions: 120, page_views: 150, engaged_sessions: 100, key_events: 5 }],
    by_channel: [{ channel: 'Organic Search', sessions: 600, engaged_sessions: 500, key_events: 10 }, { channel: 'Direct', sessions: 300, engaged_sessions: 200, key_events: 3 }],
    ai_referrals: { totals: { sessions: 24, engaged_sessions: 20, key_events: 3 }, by_source: [{ source: 'chatgpt.com', sessions: 15, engaged_sessions: 12, key_events: 2 }, { source: 'perplexity.ai', sessions: 9, engaged_sessions: 8, key_events: 1 }] },
    last_synced_at: '2026-11-13T11:30:00Z',
  });

  function view(over: Partial<Parameters<typeof AnalyticsView>[0]> = {}) {
    const props = {
      summary, loading: false, error: null, connected: true, now: NOW, days: 28, onDaysChange: vi.fn(), canManage: false, syncing: false, syncText: null,
      onSync: vi.fn(), onConnect: vi.fn(), onRequest: vi.fn(), onRetry: vi.fn(), ...over,
    };
    render(<AnalyticsView {...props} />);
    return props;
  }

  it('KPIs: sessões, engajamento, eventos-chave, usuários e tráfego de IA, em pt-BR', () => {
    view();
    expect(screen.getByTestId('ga4-sessions').textContent).toBe('1.200');
    expect(screen.getByTestId('ga4-engagement').textContent).toBe('75%');
    expect(screen.getByText('Tempo médio 2 min 5 s')).toBeTruthy();
    expect(screen.getByTestId('ga4-key_events').textContent).toBe('31,5');
    expect(screen.getByTestId('ga4-users').textContent).toBe('800');
    expect(screen.getByTestId('ga4-ai').textContent).toBe('24');
    expect(screen.getByTestId('analytics-last-synced').textContent).toContain('há 30 min');
  });

  it('canais com rótulo e % do total, fontes de IA e top páginas', () => {
    view();
    expect(screen.getByText('Busca orgânica')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy(); // 600/1200
    expect(screen.getByText('chatgpt.com')).toBeTruthy();
    expect(screen.getByText('perplexity.ai')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fontes de IA' })).toBeTruthy();
    expect(screen.getByText('/direito-criminal/prisao-em-flagrante')).toBeTruthy();
    // série diária com alternativa em tabela e legenda que não depende só de cor
    expect(screen.getByText(/Linha contínua azul: sessões\. Linha tracejada verde/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Sessões e sessões engajadas por dia, 2 dias/ })).toBeTruthy();
  });

  it('cliente vê os números mas não tem Sincronizar nem Conectar nem formulário de ID', () => {
    view({ managerSlot: <div>FORM DO GESTOR</div> });
    expect(screen.queryByRole('button', { name: /Sincronizar o Analytics/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Conectar/ })).toBeNull();
    expect(screen.queryByText('FORM DO GESTOR')).toBeNull();
  });

  it('gestor vê o formulário, sincroniza e acompanha o resultado', () => {
    const p = view({ canManage: true, managerSlot: <div>FORM DO GESTOR</div>, syncText: 'Google Analytics: 10 linha(s) gravada(s)' });
    expect(screen.getByText('FORM DO GESTOR')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar o Analytics/ }));
    expect(p.onSync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Google Analytics: 10 linha(s) gravada(s)')).toBeTruthy();
  });

  it('não conectado: cliente é orientado a pedir ao gestor; gestor vê Conectar', () => {
    const c = view({ connected: false, summary: undefined, canManage: false });
    expect(screen.getByText(/Ainda sem dados: peça ao gestor para conectar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Solicitar a conexão ao gestor/ }));
    expect(c.onRequest).toHaveBeenCalledTimes(1);
    cleanup();
    const m = view({ connected: false, summary: undefined, canManage: true });
    fireEvent.click(screen.getByRole('button', { name: /Conectar o Google Analytics/ }));
    expect(m.onConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Sincronizar o Analytics/ })).toHaveProperty('disabled', true);
  });

  it('propriedade não informada: mensagem diferente para gestor e cliente', () => {
    view({ summary: undefined, error: new Error('ga4_property_required'), canManage: false });
    expect(screen.getByText('Falta o ID da propriedade deste projeto')).toBeTruthy();
    expect(screen.getByText(/O gestor ainda precisa informar/)).toBeTruthy();
    cleanup();
    view({ summary: undefined, error: new Error('ga4_property_required'), canManage: true });
    expect(screen.getByText(/Informe o ID da propriedade GA4 no formulário acima/)).toBeTruthy();
  });

  it('sem dados no período e erro com tentar de novo', () => {
    const empty = normalizeGa4Summary({ totals: {}, daily: [] });
    view({ summary: empty });
    expect(screen.getByText(/Ainda sem dados neste período/)).toBeTruthy();
    cleanup();
    const p = view({ summary: undefined, error: new Error('ga4_unreachable') });
    expect(screen.getByText(/Não foi possível falar com o Google Analytics/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  it('carregando: esqueleto acessível; sem fontes de IA: estado vazio útil', () => {
    view({ loading: true, summary: undefined });
    expect(screen.getByLabelText('Carregando o Analytics')).toBeTruthy();
    cleanup();
    view({ summary: normalizeGa4Summary({ totals: { sessions: 5 }, daily: [{ day: '2026-11-12', sessions: 5 }] }) });
    expect(screen.getByText('Nenhuma visita vinda de assistentes de IA neste período.')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Desempenho por área
// ---------------------------------------------------------------------------
describe('AreaPerformanceView', () => {
  const perf = normalizeContentPerformance({
    areas: [
      { area: 'criminal', articles: 12, gsc: { clicks: 50, impressions: 900, ctr: 0.055, position: 7.4 }, ga4: { sessions: 300, engaged_sessions: 210, key_events: 9, ai_sessions: 4 },
        top_pages: [{ url: '/criminal/flagrante', title: 'Prisão em flagrante', gsc: { clicks: 20, impressions: 300, position: 5.2 }, ga4: { sessions: 100, key_events: 4 } }] },
      { area: 'consumidor', articles: 8, gsc: { clicks: 120, impressions: 2000, ctr: 0.06, position: 12.1 }, ga4: { sessions: 150, engaged_sessions: 90, key_events: 3, ai_sessions: 0 }, top_pages: [] },
      { area: 'nao-classificado', articles: 30, gsc: { clicks: 5, impressions: 100, ctr: 0.05, position: null }, ga4: { sessions: 20, engaged_sessions: 10, key_events: 0, ai_sessions: 1 }, top_pages: [] },
    ],
    unmatched: { gsc_pages: ['/antiga-1', '/antiga-2'], ga4_pages: 3 },
    notes: ['Janela de 28 dias.'],
    analysis_version: 1000,
  });

  function view(over: Partial<Parameters<typeof AreaPerformanceView>[0]> = {}) {
    const props = { performance: perf, loading: false, error: null, hasSources: true, days: 28, onDaysChange: vi.fn(), canManage: false, onRequest: vi.fn(), onRetry: vi.fn(), ...over };
    render(<AreaPerformanceView {...props} />);
    return props;
  }
  const order = () => Array.from(document.querySelectorAll('[data-testid^="area-"]')).filter((e) => !e.getAttribute('data-testid')?.startsWith('area-pages-')).map((e) => e.getAttribute('data-testid'));

  it('mostra uma linha por área com GSC e GA4, total e o aviso de classificação por palavras-chave', () => {
    view();
    expect(screen.getByTestId('heuristic-notice').textContent).toContain('Classificação por palavras-chave, não revisão jurídica');
    const row = screen.getByTestId('area-criminal');
    expect(within(row).getByText('Criminal')).toBeTruthy();
    expect(within(row).getByText('12')).toBeTruthy();
    expect(within(row).getByText('7,4')).toBeTruthy();
    expect(within(row).getByText('300')).toBeTruthy();
    expect(within(screen.getByTestId('area-nao-classificado')).getByText('—')).toBeTruthy(); // posição sem dado
    expect(screen.getByText('Total')).toBeTruthy();
  });

  it('ordena ao clicar no título da coluna e informa aria-sort', () => {
    view();
    // padrão: sessões decrescente
    expect(order()).toEqual(['area-criminal', 'area-consumidor', 'area-nao-classificado']);
    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Cliques/ }));
    expect(order()).toEqual(['area-consumidor', 'area-criminal', 'area-nao-classificado']);
    expect(screen.getByRole('columnheader', { name: /Cliques/ }).getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Cliques/ }));
    expect(order()).toEqual(['area-nao-classificado', 'area-criminal', 'area-consumidor']);
    expect(screen.getByRole('columnheader', { name: /Cliques/ }).getAttribute('aria-sort')).toBe('ascending');
    // posição: menor primeiro e sem dado no fim
    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Posição/ }));
    expect(order()).toEqual(['area-criminal', 'area-consumidor', 'area-nao-classificado']);
    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Área/ }));
    expect(order()).toEqual(['area-consumidor', 'area-criminal', 'area-nao-classificado']);
  });

  it('expande as melhores páginas da área e recolhe', () => {
    view();
    const btn = screen.getByRole('button', { name: 'Ver as melhores páginas: Criminal' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    const panel = screen.getByTestId('area-pages-criminal');
    expect(within(panel).getByText('Prisão em flagrante')).toBeTruthy();
    expect(within(panel).getByText('/criminal/flagrante')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ocultar as melhores páginas: Criminal' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar as melhores páginas: Criminal' }));
    expect(screen.queryByTestId('area-pages-criminal')).toBeNull();
    // área sem páginas
    fireEvent.click(screen.getByRole('button', { name: 'Ver as melhores páginas: Consumidor' }));
    expect(screen.getByText('Nenhuma página com dados nesta área no período.')).toBeTruthy();
  });

  it('lista o que ficou sem correspondência, sem descartar em silêncio', () => {
    view();
    const box = screen.getByTestId('unmatched');
    expect(box.textContent).toContain('(5)');
    expect(within(box).getByText('/antiga-1')).toBeTruthy();
    expect(box.textContent).toContain('Analytics: 3 página(s)');
    expect(screen.getByText('Janela de 28 dias.')).toBeTruthy();
  });

  it('sem versão heurística o aviso some; sem fonte, cliente é orientado e gestor é mandado conectar', () => {
    view({ performance: { ...perf, analysis_version: 2000 } });
    expect(screen.queryByTestId('heuristic-notice')).toBeNull();
    cleanup();
    const p = view({ performance: undefined, hasSources: false, canManage: false });
    expect(screen.getByText(/Ainda sem dados: peça ao gestor para conectar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Solicitar a conexão ao gestor/ }));
    expect(p.onRequest).toHaveBeenCalledTimes(1);
    cleanup();
    view({ performance: undefined, hasSources: false, canManage: true });
    expect(screen.queryByRole('button', { name: /Solicitar/ })).toBeNull();
    expect(screen.getByText(/Conecte o Google Search Console e o Google Analytics/)).toBeTruthy();
  });

  it('sem áreas: estado vazio útil; erro: tentar de novo', () => {
    view({ performance: normalizeContentPerformance({ areas: [] }) });
    expect(screen.getByText(/Sem áreas para mostrar/)).toBeTruthy();
    cleanup();
    const p = view({ performance: undefined, error: new Error('operation_failed') });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(p.onRetry).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Ativação guiada (gestor) e IDs por projeto
// ---------------------------------------------------------------------------
describe('GuidedActivationCard com GA4', () => {
  const stored = { stored: true, last_four: '1234', status: 'active', updated_at: '2026-11-13T10:00:00Z' };
  it('mostra o cartão do GA4 reaproveitando o JSON, o passo 4 e o atalho para informar o ID da propriedade', () => {
    const onSyncGa4 = vi.fn();
    const onOpenAnalytics = vi.fn();
    const ga4 = { ...emptyOverviewItem('ga4'), status: 'stored_unverified' as const, credential: stored };
    render(<GuidedActivationCard items={[emptyOverviewItem('gsc'), emptyOverviewItem('bing_webmaster'), ga4]} lastSyncedAt={null} now={NOW} canAdmin testingId={null} syncing={false} syncText={null}
      onConnect={vi.fn()} onTest={vi.fn()} onSync={vi.fn()} onSyncGa4={onSyncGa4} onOpenAnalytics={onOpenAnalytics} />);
    expect(screen.getByRole('heading', { name: 'Google Analytics 4 (Data API)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conectar: Google Search Console API' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Testar conexão: Google Analytics 4 (Data API)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrir a aba Analytics/ }));
    expect(onOpenAnalytics).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar o Analytics/ }));
    expect(onSyncGa4).toHaveBeenCalledTimes(1);
  });

  it('sem credencial do GA4 o Sincronizar o Analytics fica desabilitado', () => {
    render(<GuidedActivationCard items={[emptyOverviewItem('ga4')]} lastSyncedAt={null} now={NOW} canAdmin testingId={null} syncing={false} syncText={null}
      onConnect={vi.fn()} onTest={vi.fn()} onSync={vi.fn()} onSyncGa4={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Sincronizar o Analytics/ })).toHaveProperty('disabled', true);
  });
});

describe('ProjectIntegrationsCard (gestor)', () => {
  const mount = (onSave = vi.fn().mockResolvedValue(undefined), integrations = { ga4_property_id: '111222333', gsc_property: 'sc-domain:rdm.com.br' }) => {
    render(<ProjectIntegrationsCard projectName="Projeto RDM" integrations={integrations} loading={false} onSave={onSave} />);
    return onSave;
  };

  it('começa com os valores atuais e só envia o campo alterado', async () => {
    const onSave = mount();
    expect((screen.getByLabelText('ID da propriedade GA4') as HTMLInputElement).value).toBe('111222333');
    expect(screen.getByRole('button', { name: /Salvar identificação/ })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('ID da propriedade GA4'), { target: { value: '999888777' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar identificação/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ga4PropertyId: '999888777' }));
    expect(await screen.findByText('Identificação do projeto salva.')).toBeTruthy();
  });

  it('recusa ID inválido sem chamar o servidor e permite remover com campo vazio', async () => {
    const onSave = mount();
    fireEvent.change(screen.getByLabelText('ID da propriedade GA4'), { target: { value: 'G-ABC123' } });
    expect(screen.getByText(/só números/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Salvar identificação/ })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('ID da propriedade GA4'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar identificação/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ga4PropertyId: '' }));
  });

  it('mostra o erro do servidor quando a propriedade já é de outro projeto', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('ga4_property_already_used'));
    mount(onSave);
    fireEvent.change(screen.getByLabelText('Propriedade do Search Console'), { target: { value: 'sc-domain:outro.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar identificação/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Cada site precisa da sua própria propriedade/);
    expect(onSave).toHaveBeenCalledWith({ gscProperty: 'sc-domain:outro.com.br' });
  });
});

// ---------------------------------------------------------------------------
// Solicitações
// ---------------------------------------------------------------------------
function req(over: Partial<ClientRequest> = {}): ClientRequest {
  return {
    id: 'r1', organization_id: 'org-cliente-123456', project_id: 'proj-1', requested_by: 'u1', kind: 'connect_source', message: 'Quero conectar o Google Analytics.',
    status: 'open', manager_note: null, created_at: '2026-11-13T11:00:00Z', updated_at: null, resolved_at: null, ...over,
  };
}

describe('Solicitações: cliente cria e acompanha', () => {
  it('envia tipo + mensagem (cortando espaços) e confirma', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<MemberRequestsView requests={[]} loading={false} error={null} now={NOW} onCreate={onCreate} onRetry={vi.fn()} />);
    expect(screen.getByText('Você ainda não enviou nenhuma solicitação.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('O que você precisa?'), { target: { value: 'plugin_update' } });
    fireEvent.change(screen.getByLabelText('Mensagem para o gestor'), { target: { value: '  Atualizar o plugin no site novo  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitação/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ kind: 'plugin_update', message: 'Atualizar o plugin no site novo' }));
    expect(await screen.findByText(/Solicitação enviada/)).toBeTruthy();
    expect((screen.getByLabelText('Mensagem para o gestor') as HTMLTextAreaElement).value).toBe('');
  });

  it('mensagem curta demais não chega ao servidor; erro 429 é traduzido', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('too_many_open_requests'));
    render(<MemberRequestsView requests={[]} loading={false} error={null} now={NOW} onCreate={onCreate} onRetry={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Mensagem para o gestor'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitação/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ao menos 3/);
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Mensagem para o gestor'), { target: { value: 'Preciso de um relatório' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitação/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/limite de 20/));
  });

  it('lista as próprias solicitações com situação em texto e a resposta do gestor; sem controles de gestão', () => {
    render(<MemberRequestsView
      requests={[req({ id: 'a', status: 'done', manager_note: 'Conectado hoje.' }), req({ id: 'b', status: 'open', kind: 'report', message: 'Relatório mensal' })]}
      loading={false} error={null} now={NOW} onCreate={vi.fn()} onRetry={vi.fn()} />);
    const a = screen.getByTestId('request-a');
    expect(within(a).getByText('Concluída')).toBeTruthy();
    expect(within(a).getByText('Conectado hoje.')).toBeTruthy();
    expect(within(a).getByText('Resposta do gestor')).toBeTruthy();
    expect(within(screen.getByTestId('request-b')).getByText('Aberta')).toBeTruthy();
    // abertas primeiro
    const items = Array.from(document.querySelectorAll('[data-testid^="request-"]')).map((e) => e.getAttribute('data-testid'));
    expect(items).toEqual(['request-b', 'request-a']);
    expect(screen.queryByRole('button', { name: /Concluir|Recusar|Em andamento|Reabrir/ })).toBeNull();
  });

  it('carregando e erro', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<MemberRequestsView requests={undefined} loading error={null} now={NOW} onCreate={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByLabelText('Carregando solicitações')).toBeTruthy();
    rerender(<MemberRequestsView requests={undefined} loading={false} error={new Error('operation_failed')} now={NOW} onCreate={vi.fn()} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Solicitações: gestor gerencia', () => {
  const list = [
    req({ id: 'a', status: 'open', organization_name: 'Cliente Teste' }),
    req({ id: 'b', status: 'in_progress', kind: 'plugin_link', message: 'Vincular o plugin' }),
    req({ id: 'c', status: 'done', kind: 'report', message: 'Relatório', manager_note: 'Enviado' }),
  ];

  it('filtra por situação (abertas por padrão) e mostra a organização', () => {
    render(<ManagerInboxView requests={list} loading={false} error={null} now={NOW} onUpdate={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByTestId('inbox-a')).toBeTruthy();
    expect(screen.queryByTestId('inbox-b')).toBeNull();
    expect(screen.getByText('Organização: Cliente Teste')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrar por situação'), { target: { value: 'all' } });
    expect(screen.getByTestId('inbox-b')).toBeTruthy();
    expect(screen.getByTestId('inbox-c')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrar por situação'), { target: { value: 'done' } });
    expect(screen.queryByTestId('inbox-a')).toBeNull();
    expect(screen.getByTestId('inbox-c')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filtrar por situação'), { target: { value: 'rejected' } });
    expect(screen.getByText(/Nenhuma solicitação com a situação “Recusada”/)).toBeTruthy();
  });

  it('marca em andamento, conclui e recusa, enviando a resposta só quando ela mudou', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(<ManagerInboxView requests={list} loading={false} error={null} now={NOW} onUpdate={onUpdate} onRetry={vi.fn()} />);
    const card = screen.getByTestId('inbox-a');
    fireEvent.click(within(card).getByRole('button', { name: /Marcar em andamento/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith({ id: 'a', status: 'in_progress' }));
    fireEvent.change(within(card).getByLabelText('Resposta ao cliente (opcional)'), { target: { value: 'Já conectei.' } });
    fireEvent.click(within(card).getByRole('button', { name: /^Concluir/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith({ id: 'a', status: 'done', managerNote: 'Já conectei.' }));
    fireEvent.click(within(card).getByRole('button', { name: /^Recusar/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith({ id: 'a', status: 'rejected', managerNote: 'Já conectei.' }));
    fireEvent.click(within(card).getByRole('button', { name: /Salvar só a resposta/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith({ id: 'a', managerNote: 'Já conectei.' }));
  });

  it('concluídas podem ser reabertas; erro do servidor aparece no cartão', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('manager_required'));
    render(<ManagerInboxView requests={list} loading={false} error={null} now={NOW} onUpdate={onUpdate} onRetry={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Filtrar por situação'), { target: { value: 'done' } });
    const card = screen.getByTestId('inbox-c');
    expect(within(card).queryByRole('button', { name: /^Concluir/ })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /^Reabrir/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ id: 'c', status: 'open' }));
    expect((await within(card).findByRole('alert')).textContent).toMatch(/conta de gerenciamento/);
  });
});
