import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import NexusVisibility from '@/pages/NexusVisibility';
import { emptyOverviewItem } from '@/lib/nexus-providers';

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const channelObj: Record<string, unknown> = {};
  channelObj.on = () => channelObj;
  channelObj.subscribe = () => channelObj;
  return { supabase: { functions: { invoke: h.invoke }, channel: () => channelObj, removeChannel: vi.fn() } };
});
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: 'proj-1', name: 'Projeto RDM', organization_id: 'org-1', domain: 'rdm.adv.br', wordpress_url: null }] }) }));
vi.mock('@/hooks/useOrganizationConsole', () => ({
  useOrganizationConsole: () => ({ data: { membership: { organization_id: 'org-1', role: 'owner', organizations: { id: 'org-1', name: 'Organização RDM', slug: 'rdm', status: 'active', kind: 'client' } } } }),
}));

beforeAll(() => {
  class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
});
beforeEach(() => { h.invoke.mockReset(); });
afterEach(() => { cleanup(); });

const OVERVIEW = {
  method: { version: 'zvi-1', label: 'Zica Visibility Index' }, period: { from: '2026-10-16', to: '2026-11-13' }, n_observations: 20,
  zvi: { value: 41.6, low: 30, high: 55, partial: true, missing: ['pm', 'rep'], confidence: 'baixa' },
  indicators: { vr: { value: 0.35, low: 0.18, high: 0.57, n: 20 }, cr: { value: 0.2, n: 20 }, sov: { value: 0.4, n: 20 }, est: { value: 0.8, n: 6 }, pm: null, rep: null },
  previous: null, by_engine: [{ engine: 'chatgpt', label: 'ChatGPT', vr: 0.3, cr: 0.1, n: 15 }], trend: [], changes: [], result: { ga4: null, gsc: null },
  generated_at: new Date().toISOString(),
};
const COMPETITORS = {
  tracked: [], own: { vr: 0.35, sov: 0.5, n: 20 }, ranking: [],
  suggested: [{ name: 'Beta Advocacia', domain: 'beta.adv.br', mentions: 6, engines: ['chatgpt'], reason: 'Citado em 6 respostas' }],
};

type Role = 'client' | 'manager';
function server(role: Role, over: Record<string, unknown> = {}) {
  const providers = {
    generated_at: new Date().toISOString(), organization_id: 'org-1',
    viewer: role === 'manager' ? { role: 'manager', can_manage_technical: true } : { role: 'client', can_manage_technical: false },
    program: { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [] },
    providers: [{ ...emptyOverviewItem('gsc') }],
  };
  h.invoke.mockImplementation(async (fn: string, opts: { body: Record<string, unknown> }) => {
    const b = opts.body;
    if (fn === 'nexus-intelligence') {
      if (b.action === 'providers_overview') return over.providers_error ? { data: null, error: new Error('falhou') } : { data: over.providers ?? providers, error: null };
      if (b.action === 'request_create') return { data: { request: { id: 'r1', organization_id: 'org-1', project_id: 'proj-1', requested_by: 'u', kind: b.kind, message: b.message, status: 'open', created_at: new Date().toISOString() } }, error: null };
      return { data: {}, error: null };
    }
    if (fn === 'nexus-visibility') {
      const key = String(b.action);
      if (key in over) { const v = over[key]; return typeof v === 'function' ? (v as (x: Record<string, unknown>) => unknown)(b) : { data: v, error: null }; }
      const defaults: Record<string, unknown> = {
        overview: OVERVIEW, competitors: COMPETITORS, competitor_upsert: { competitor: { id: 'c9', name: 'Beta Advocacia', domains: ['beta.adv.br'], kind: 'escritorio', status: 'tracked' } },
        sources: { sources: [], targets: [] }, questions: { total: 0, questions: [] }, keywords: { keywords: [] }, opportunities: { items: [] }, methodology: {},
      };
      return { data: defaults[key] ?? {}, error: null };
    }
    return { data: {}, error: null };
  });
}
const calls = (action: string) => h.invoke.mock.calls.filter((c) => c[0] === 'nexus-visibility' && (c[1] as { body: { action: string } }).body.action === action).map((c) => (c[1] as { body: Record<string, unknown> }).body);

function renderPage(url = '/nexus/visibilidade') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[url]}><NexusVisibility /></MemoryRouter></QueryClientProvider>);
}
const openTab = (name: RegExp | string) => { const t = screen.getByRole('tab', { name }); fireEvent.mouseDown(t); fireEvent.click(t); };

describe('página Visibilidade', () => {
  it('carrega o painel pelo envelope e envia o período padrão de 28 dias; mostra a visão cliente', async () => {
    server('client');
    renderPage();
    expect(await screen.findByTestId('zvi-value')).toHaveTextContent('42');
    expect(screen.getByTestId('vr-value')).toHaveTextContent('35%');
    expect(await screen.findByTestId('viewer-badge')).toHaveTextContent('Visão cliente');
    const [body] = calls('overview');
    expect(body.projectId).toBe('proj-1');
    expect(body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).not.toHaveProperty('engine');
    // nada técnico na visão do cliente
    expect(screen.queryByText(/chave|custo|orçamento|plugin/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /Conexões e coleta/ })).toBeNull();
  });

  it('as sete abas existem e o texto do índice é "Índice Zica de Visibilidade", sem sigla técnica no cliente', async () => {
    server('client');
    renderPage();
    await screen.findByTestId('zvi-value');
    for (const n of ['Painel', 'IAs e buscadores', 'Concorrentes', 'Fontes', 'Perguntas', 'Oportunidades', 'Como calculamos']) {
      expect(screen.getByRole('tab', { name: n })).toBeInTheDocument();
    }
    expect(screen.getAllByText('Índice Zica de Visibilidade').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\bZVI\b/)).toBeNull();
  });

  it('mudar o período para 7 dias refaz a consulta com a nova janela', async () => {
    server('client');
    renderPage();
    await screen.findByTestId('zvi-value');
    const first = calls('overview')[0];
    fireEvent.click(screen.getByRole('radio', { name: '7 dias' }));
    await waitFor(() => expect(calls('overview').length).toBeGreaterThan(1));
    const last = calls('overview').at(-1) as Record<string, string>;
    const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
    expect(days(first.from as string, first.to as string)).toBe(28);
    expect(days(last.from, last.to)).toBe(7);
    expect(screen.getByRole('radio', { name: '7 dias' })).toHaveAttribute('aria-checked', 'true');
  });

  it('com zero dados: estado vazio que orienta (sem número inventado)', async () => {
    server('client', { overview: { ...OVERVIEW, n_observations: 0, zvi: { value: null, partial: true, missing: ['pm', 'rep'], confidence: 'sem_dados' }, indicators: { vr: { value: null, n: 0 } } } });
    renderPage();
    expect(await screen.findByTestId('empty-state')).toHaveTextContent('Ainda sem observações');
    expect(screen.queryByTestId('zvi-value')).toBeNull();
  });

  it('CLIENTE em Concorrentes: não escreve; "Solicitar" usa request_create do plano de gerenciamento', async () => {
    server('client');
    renderPage('/nexus/visibilidade?aba=concorrentes');
    const card = await screen.findByTestId('suggestion');
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Solicitar' }));
    const send = await screen.findByRole('button', { name: /Enviar/ });
    fireEvent.click(send);
    await waitFor(() => expect(h.invoke.mock.calls.some((c) => c[0] === 'nexus-intelligence' && (c[1] as { body: { action: string } }).body.action === 'request_create')).toBe(true));
    expect(calls('competitor_upsert')).toHaveLength(0);
    expect(calls('competitor_remove')).toHaveLength(0);
  });

  it('sem resposta do servidor sobre o papel, trata como cliente (opção restritiva)', async () => {
    server('manager', { providers_error: true }); // quem consulta É gestor, mas o servidor não respondeu o papel
    renderPage('/nexus/visibilidade?aba=concorrentes');
    await screen.findByTestId('suggestion');
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
  });

  it('GESTOR em Concorrentes: aprova a sugestão com o envelope competitor_upsert', async () => {
    server('manager');
    renderPage('/nexus/visibilidade?aba=concorrentes');
    const approve = await screen.findByRole('button', { name: 'Aprovar' });
    expect(await screen.findByTestId('viewer-badge')).toHaveTextContent('Visão gestor');
    fireEvent.click(approve);
    await waitFor(() => expect(calls('competitor_upsert')).toHaveLength(1));
    expect(calls('competitor_upsert')[0]).toMatchObject({ projectId: 'proj-1', name: 'Beta Advocacia', domains: ['beta.adv.br'], kind: 'escritorio', status: 'tracked' });
    expect(screen.getByRole('link', { name: /Conexões e coleta/ })).toHaveAttribute('href', '/nexus/motores');
  });

  it('erro do servidor vira mensagem simples com "Tentar de novo"', async () => {
    server('client', { overview: async () => ({ data: null, error: Object.assign(new Error('x'), { context: undefined }) }) });
    renderPage();
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 }); // o hook tenta uma vez de novo antes de mostrar o erro
    expect(alert).toHaveTextContent('Não foi possível');
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
  });

  it('abas carregam sob demanda: fontes só chama `sources` quando abertas, com o limite do contrato', async () => {
    server('client');
    renderPage();
    await screen.findByTestId('zvi-value');
    expect(calls('sources')).toHaveLength(0);
    openTab('Fontes');
    await waitFor(() => expect(calls('sources')).toHaveLength(1));
    expect(calls('sources')[0].limit).toBeLessThanOrEqual(200);
    expect(await screen.findByTestId('empty-state')).toHaveTextContent('Ainda sem fontes citadas');
  });

  it('Como calculamos mostra o método padrão quando o servidor não responde a metodologia', async () => {
    server('client', { methodology: async () => ({ data: null, error: new Error('nao') }) });
    renderPage('/nexus/visibilidade?aba=metodo');
    expect(await screen.findByText('Método zvi-1', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByTestId('method-pm')).toHaveTextContent('n/d agora');
  });
});
