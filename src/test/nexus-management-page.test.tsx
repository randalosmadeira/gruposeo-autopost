import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import NexusProviders from '@/pages/NexusProviders';
import { fetchGa4Summary, listClientRequests, saveProjectIntegrations } from '@/lib/nexus-management-api';
import { emptyOverviewItem } from '@/lib/nexus-providers';
import type { NexusViewer, ProvidersOverview, RawProviderOverviewItem } from '@/types/nexus-providers';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => {
  const channelObj: Record<string, unknown> = {};
  channelObj.on = () => channelObj;
  channelObj.subscribe = () => channelObj;
  return { supabase: { functions: { invoke: h.invoke }, channel: () => channelObj, removeChannel: vi.fn() } };
});
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: 'proj-1', name: 'Projeto RDM', organization_id: 'org-1', domain: 'rdm.com.br', wordpress_url: null }] }) }));
// Mesmo que o papel local seja "owner", a tela só confia no `viewer` devolvido pelo servidor.
vi.mock('@/hooks/useOrganizationConsole', () => ({
  useOrganizationConsole: () => ({ data: { membership: { organization_id: 'org-1', role: 'owner', organizations: { id: 'org-1', name: 'Organização RDM', slug: 'rdm', status: 'active', kind: 'client' } } } }),
}));

beforeAll(() => {
  class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  // Radix usa estas APIs de ponteiro, ausentes no jsdom.
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
});
beforeEach(() => { h.invoke.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const stored = { stored: true, last_four: '9876', status: 'active', updated_at: '2026-11-13T10:00:00Z' };
const dirtyHealth = { last: { checked_at: new Date().toISOString(), ok: true, latency_ms: 77, http_status: 200, detail: 'DETALHE-TECNICO-INTERNO', quota: { label: 'cota-interna', remaining: 1, limit: 2 }, cost_micros: 0 }, checks_7d: 3, ok_7d: 3, avg_latency_ms_7d: 70 };

/** Resposta do servidor para o cliente (status simples) — de propósito com campos técnicos a mais, para provar a sanitização. */
function clientOverview(extra: Partial<ProvidersOverview> = {}): ProvidersOverview {
  const providers: RawProviderOverviewItem[] = [
    { ...emptyOverviewItem('gsc'), status: 'connected', credential: stored, health: dirtyHealth },
    { ...emptyOverviewItem('serper'), status: 'attention' },
    { ...emptyOverviewItem('ga4'), status: 'not_connected' },
  ];
  return {
    generated_at: '2026-11-13T12:00:00Z', organization_id: 'org-1', viewer: { role: 'client', can_manage_technical: false }, viewer_is_admin: false,
    program: { execution_enabled: true, budget_usd_micros: 5_000_000, reserved_usd_micros: 0, consumed_usd_micros: 1_000_000, providers_enabled: ['serper'] },
    providers, ...extra,
  };
}
function managerOverview(viewer: NexusViewer = { role: 'manager', can_manage_technical: true }): ProvidersOverview {
  return {
    generated_at: '2026-11-13T12:00:00Z', organization_id: 'org-1', viewer, viewer_is_admin: true,
    program: { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [] },
    summary: { total: 12, connected: 1, healthy: 1, degraded: 0, error: 0, not_configured: 10, manual: 1, overall: 'ok', score: 90 },
    providers: [{ ...emptyOverviewItem('gsc'), status: 'healthy', score: 90, credential: stored, health: dirtyHealth }],
  };
}

const EMPTY_AUDIT = { generated_at: '', last_run: null, counts: { open: { corrective: 0, preventive: 0, improvement: 0 }, by_severity: {}, resolved_7d: 0 }, findings: [], runs: [] };

const EMPTY_SEARCH = { totals: { clicks: 0, impressions: 0, ctr: null, position: null }, daily: [], top_queries: [], top_pages: [], by_country: [], by_device: [], last_synced_at: null };

function serve(overview: ProvidersOverview, extra: Record<string, unknown> = {}) {
  h.invoke.mockImplementation(async (fn: string, { body }: { body: { action: string } }) => {
    if (fn === 'nexus-audit') return { data: EMPTY_AUDIT, error: null };
    if (body.action === 'providers_overview') return { data: overview, error: null };
    if (body.action === 'requests_list') return { data: { requests: [] }, error: null };
    if (body.action === 'search_performance') return { data: EMPTY_SEARCH, error: null };
    if (body.action in extra) return { data: extra[body.action], error: null };
    return { data: {}, error: null };
  });
}

function page() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const W = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<MemoryRouter><W><NexusProviders /></W></MemoryRouter>);
}
const calls = () => h.invoke.mock.calls.map(([fn, { body }]) => ({ fn: fn as string, action: (body as { action: string }).action, body: body as Record<string, unknown> }));
const openTab = (name: string | RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

const TECHNICAL_ACTIONS = ['store_credential', 'provider_credential_remove', 'execution_settings_set', 'provider_health_check', 'search_performance_sync', 'ga4_sync', 'project_integrations_set', 'apply_fix', 'run'];

describe('Visão cliente × Visão gestor: a tela', () => {
  it('cliente: vê status simples e nenhum campo de chave, nenhum Conectar/Trocar/Remover, nenhum painel pago', async () => {
    serve(clientOverview());
    page();
    expect(await screen.findByTestId('client-strip-text')).toBeTruthy();
    expect(screen.getByTestId('viewer-badge').textContent).toContain('Visão cliente');
    expect(screen.getByRole('heading', { name: 'Motores e dados do seu site' })).toBeTruthy();

    // nada de gestão técnica
    expect(screen.queryByRole('heading', { name: 'Liberação de execução paga' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ativação guiada dos gratuitos' })).toBeNull();
    // painéis do Codex (OAuth gerenciado e planejamento do Serper): só o gestor
    expect(screen.queryByRole('heading', { name: 'Conexões gerenciadas pela agência' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Planejar coletas no Serper' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Autorizar conexão|Listar propriedades|Salvar plano de coleta/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Testar todas as conexões/ })).toBeNull();
    for (const name of [/Conectar/, /Trocar chave/, /Remover/, /Testar conexão/, /Documentação/, /Contratar/, /Corrigir|Aplicar correção/, /Auditar agora/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(document.querySelector('textarea, input[type="password"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid^="provider-"]')).toHaveLength(0);

    // status simples
    expect(document.querySelectorAll('[data-testid^="client-provider-"]')).toHaveLength(12);
    expect(within(screen.getByTestId('client-provider-gsc')).getByText('Conectado')).toBeTruthy();
    expect(within(screen.getByTestId('client-provider-serper')).getByText('Precisa de atenção')).toBeTruthy();
    expect(within(screen.getByTestId('client-provider-ga4')).getByText('Não conectado')).toBeTruthy();

    // últimos 4 dígitos, detalhe técnico e custos nunca chegam à tela, mesmo que o servidor mande
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('9876');
    expect(text).not.toContain('DETALHE-TECNICO-INTERNO');
    expect(text).not.toContain('cota-interna');
    expect(text).not.toMatch(/US\$/);

    // abas de cliente
    for (const name of ['Motores', 'Analytics', 'Desempenho por área', 'Tráfego de busca', /^Auditoria/, /^Solicitações/]) expect(screen.getByRole('tab', { name })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Verdade dos buscadores' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Saúde do sistema/ })).toBeNull();
  });

  it('cliente: nenhuma ação técnica é chamada, nem ao navegar por todas as abas', async () => {
    serve(clientOverview());
    page();
    await screen.findByTestId('client-strip-text');
    for (const name of ['Analytics', 'Desempenho por área', 'Tráfego de busca', /^Auditoria/, /^Solicitações/, 'Motores']) {
      openTab(name);
      await waitFor(() => expect(screen.getByRole('tab', { name, selected: true })).toBeTruthy());
    }
    const actions = calls().map((c) => c.action);
    for (const a of TECHNICAL_ACTIONS) expect(actions, a).not.toContain(a);
    expect(calls().filter((c) => c.fn === 'nexus-audit').map((c) => c.action).every((a) => a === 'overview')).toBe(true);
  });

  it('cliente sem `viewer` na resposta é tratado como cliente (opção restritiva), mesmo sendo owner local', async () => {
    const ov = clientOverview();
    delete ov.viewer; delete ov.viewer_is_admin;
    serve(ov);
    page();
    await screen.findByTestId('client-strip-text');
    expect(screen.queryByRole('heading', { name: 'Liberação de execução paga' })).toBeNull();
    expect(screen.getByTestId('viewer-badge').textContent).toContain('Visão cliente');
  });

  it('cliente: Solicitar abre o formulário e envia request_create com o tipo e a mensagem', async () => {
    serve(clientOverview(), { request_create: { request: { id: 'n1', organization_id: 'org-1', kind: 'connect_source', message: 'Quero conectar: Google Analytics 4 (Data API).', status: 'open', created_at: '2026-11-13T12:00:00Z' } } });
    page();
    await screen.findByTestId('client-strip-text');
    fireEvent.click(screen.getByRole('button', { name: /^Solicitar conexão: Google Analytics 4/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Solicitar ao gestor' })).toBeTruthy();
    expect((within(dialog).getByLabelText('Mensagem para o gestor') as HTMLTextAreaElement).value).toBe('Quero conectar: Google Analytics 4 (Data API).');
    expect((within(dialog).getByLabelText('O que você precisa?') as HTMLSelectElement).value).toBe('connect_source');
    fireEvent.click(within(dialog).getByRole('button', { name: /Enviar solicitação/ }));
    await waitFor(() => expect(calls().some((c) => c.action === 'request_create')).toBe(true));
    const sent = calls().find((c) => c.action === 'request_create');
    expect(sent).toMatchObject({ fn: 'nexus-intelligence', body: { projectId: 'proj-1', action: 'request_create', kind: 'connect_source', message: 'Quero conectar: Google Analytics 4 (Data API).' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cliente: aba Solicitações lista as próprias e cria nova; aba Analytics sem fonte pede ao gestor', async () => {
    h.invoke.mockImplementation(async (fn: string, { body }: { body: { action: string } }) => {
      if (fn === 'nexus-audit') return { data: EMPTY_AUDIT, error: null };
      if (body.action === 'providers_overview') return { data: clientOverview(), error: null };
      if (body.action === 'search_performance') return { data: EMPTY_SEARCH, error: null };
      if (body.action === 'requests_list') return { data: { requests: [{ id: 'q1', organization_id: 'org-1', kind: 'report', message: 'Relatório de outubro', status: 'in_progress', manager_note: 'Preparando.', created_at: '2026-11-12T12:00:00Z' }] }, error: null };
      return { data: {}, error: null };
    });
    page();
    await screen.findByTestId('client-strip-text');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Solicitações (1)' })).toBeTruthy());
    openTab(/^Solicitações/);
    expect(await screen.findByText('Relatório de outubro')).toBeTruthy();
    expect(screen.getByText('Preparando.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nova solicitação' })).toBeTruthy();
    expect(screen.queryByLabelText('Filtrar por situação')).toBeNull();

    openTab('Analytics');
    expect(await screen.findByText(/Ainda sem dados: peça ao gestor para conectar o Google Analytics/)).toBeTruthy();
    expect(screen.queryByLabelText('ID da propriedade GA4')).toBeNull();
    // sem fonte conectada o servidor nem é consultado pelo resumo
    expect(calls().some((c) => c.action === 'ga4_summary')).toBe(false);
  });

  it('gestor: vê tudo (cartões com Conectar/Trocar/Remover, execução paga, ativação guiada, últimos 4 dígitos)', async () => {
    serve(managerOverview());
    page();
    expect(await screen.findByTestId('health-strip-text')).toBeTruthy();
    expect(screen.getByTestId('viewer-badge').textContent).toContain('Visão gestor');
    expect(document.querySelectorAll('[data-testid^="provider-"]')).toHaveLength(12);
    expect(screen.getByRole('heading', { name: 'Liberação de execução paga' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ativação guiada dos gratuitos' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Google Analytics 4 (Data API)' }).length).toBeGreaterThanOrEqual(2); // cartão + ativação guiada
    expect(screen.getByText('guardada …9876')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Trocar chave: Google Search Console API/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Remover chave: Google Search Console API/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Conectar: Google Analytics 4/ }).length).toBeGreaterThanOrEqual(1);
    for (const name of ['Todos', 'Analytics', 'Desempenho por área', 'Tráfego orgânico (Google Search Console)', /^Saúde do sistema/, /^Solicitações/]) expect(screen.getByRole('tab', { name })).toBeTruthy();
    // gestor não vê o botão "Solicitar" dos cartões
    expect(screen.queryByRole('button', { name: /^Solicitar/ })).toBeNull();
  });

  it('gestor: Conectar o GA4 abre o diálogo com o campo do JSON (mascarado)', async () => {
    serve(managerOverview());
    page();
    await screen.findByTestId('health-strip-text');
    fireEvent.click(screen.getAllByRole('button', { name: /^Conectar: Google Analytics 4/ })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Conectar: Google Analytics 4 (Data API)' })).toBeTruthy();
    expect(within(dialog).getByLabelText('JSON da conta de serviço')).toBeTruthy();
    expect(within(dialog).getByText(/Informe o ID da propriedade GA4 do projeto/)).toBeTruthy();
  });

  it('gestor: aba Analytics traz o formulário de IDs por projeto e grava só o ID novo', async () => {
    serve(managerOverview(), {
      project_integrations_get: { integrations: { ga4_property_id: null, gsc_property: 'sc-domain:rdm.com.br' } },
      project_integrations_set: { integrations: { ga4_property_id: '123456789', gsc_property: 'sc-domain:rdm.com.br' } },
    });
    page();
    await screen.findByTestId('health-strip-text');
    openTab('Analytics');
    const input = await screen.findByLabelText('ID da propriedade GA4');
    await waitFor(() => expect((screen.getByLabelText('Propriedade do Search Console') as HTMLInputElement).value).toBe('sc-domain:rdm.com.br'));
    fireEvent.change(input, { target: { value: '123456789' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar identificação/ }));
    await waitFor(() => expect(calls().some((c) => c.action === 'project_integrations_set')).toBe(true));
    expect(calls().find((c) => c.action === 'project_integrations_set')?.body).toEqual({ projectId: 'proj-1', action: 'project_integrations_set', ga4PropertyId: '123456789' });
    expect(await screen.findByText('Identificação do projeto salva.')).toBeTruthy();
  });

  it('gestor da plataforma vê a caixa de entrada de solicitações; admin de org interna vê o formulário', async () => {
    serve(managerOverview());
    h.invoke.mockImplementation(async (fn: string, { body }: { body: { action: string } }) => {
      if (fn === 'nexus-audit') return { data: EMPTY_AUDIT, error: null };
      if (body.action === 'providers_overview') return { data: managerOverview(), error: null };
      if (body.action === 'requests_list') return { data: { requests: [{ id: 'q9', organization_id: 'org-cliente', organization_name: 'Cliente Teste', kind: 'plugin_update', message: 'Atualizar o plugin', status: 'open', created_at: '2026-11-13T11:00:00Z' }] }, error: null };
      return { data: {}, error: null };
    });
    page();
    await screen.findByTestId('health-strip-text');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Solicitações (1)' })).toBeTruthy());
    openTab(/^Solicitações/);
    expect(await screen.findByTestId('inbox-q9')).toBeTruthy();
    expect(screen.getByText('Organização: Cliente Teste')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por situação')).toBeTruthy();
    cleanup();

    h.invoke.mockReset();
    serve(managerOverview({ role: 'org_admin', can_manage_technical: true }));
    page();
    await screen.findByTestId('health-strip-text');
    expect(screen.getByRole('heading', { name: 'Liberação de execução paga' })).toBeTruthy(); // gerencia o técnico
    openTab(/^Solicitações/);
    expect(await screen.findByRole('heading', { name: 'Nova solicitação' })).toBeTruthy(); // mas não responde pedidos
    expect(screen.queryByLabelText('Filtrar por situação')).toBeNull();
  });
});

describe('camada de cliente das ações (seção G do contrato)', () => {
  it('usa exatamente os nomes de ação e campos do contrato', async () => {
    h.invoke.mockResolvedValue({ data: {}, error: null });
    await fetchGa4Summary('p1', '2026-10-16', '2026-11-13');
    await listClientRequests('p1', 'open');
    await saveProjectIntegrations('p1', { ga4PropertyId: '', gscProperty: 'sc-domain:x.com' });
    const sent = h.invoke.mock.calls.map(([, o]) => o.body);
    expect(sent[0]).toEqual({ projectId: 'p1', action: 'ga4_summary', from: '2026-10-16', to: '2026-11-13' });
    expect(sent[1]).toEqual({ projectId: 'p1', action: 'requests_list', status: 'open' });
    expect(sent[2]).toEqual({ projectId: 'p1', action: 'project_integrations_set', ga4PropertyId: '', gscProperty: 'sc-domain:x.com' });
  });

  it('403 manager_required chega como Error com o código do servidor', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: 'x', context: new Response(JSON.stringify({ error: 'manager_required' }), { status: 403 }) } });
    await expect(saveProjectIntegrations('p1', { ga4PropertyId: '123456' })).rejects.toThrow('manager_required');
  });
});
