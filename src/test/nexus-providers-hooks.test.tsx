import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { invokeEdge, subscribeNexusRealtime, useNexusProviderActions, useNexusProviders, useNexusRealtime } from '@/hooks/useNexusProviders';
import { useNexusAudit } from '@/hooks/useNexusAudit';
import NexusProviders from '@/pages/NexusProviders';
import { emptyOverviewItem } from '@/lib/nexus-providers';
import { NexusBlockedError } from '@/types/nexus-observatory';
import type { ProvidersOverview } from '@/types/nexus-providers';

type Handler = (payload: unknown) => void;
const h = vi.hoisted(() => {
  const state = {
    ons: [] as Array<{ type: string; config: Record<string, string>; cb: (p: unknown) => void }>,
    statusCb: null as null | ((s: string) => void),
    channelName: '',
  };
  const channelObj = {
    on(type: string, config: Record<string, string>, cb: (p: unknown) => void) { state.ons.push({ type, config, cb }); return channelObj; },
    subscribe(cb: (s: string) => void) { state.statusCb = cb; return channelObj; },
  };
  return {
    state,
    invoke: vi.fn(),
    channel: vi.fn((name: string) => { state.channelName = name; state.ons.length = 0; return channelObj; }),
    removeChannel: vi.fn(),
  };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: h.invoke }, channel: h.channel, removeChannel: h.removeChannel } }));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: 'proj-1', name: 'Projeto RDM', organization_id: 'org-1', domain: 'rdm.com.br', wordpress_url: null }] }) }));
vi.mock('@/hooks/useAdminAccess', () => ({ useAdminAccess: () => ({ isAdmin: false, loading: false, error: null }) }));
vi.mock('@/hooks/useOrganizationConsole', () => ({
  useOrganizationConsole: () => ({ data: { membership: { organization_id: 'org-1', role: 'owner', organizations: { id: 'org-1', name: 'Organização RDM', slug: 'rdm', status: 'active', kind: 'x' } } } }),
}));

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const W = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, W };
}

beforeAll(() => {
  // Radix (Select/Checkbox) e recharts usam ResizeObserver, ausente no jsdom.
  class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});
beforeEach(() => { h.invoke.mockReset(); h.removeChannel.mockReset(); h.state.statusCb = null; });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('invokeEdge', () => {
  it('envia projectId + corpo para a função certa', async () => {
    h.invoke.mockResolvedValue({ data: { ok: 1 }, error: null });
    await expect(invokeEdge('nexus-audit', 'p1', { action: 'overview' })).resolves.toEqual({ ok: 1 });
    expect(h.invoke).toHaveBeenCalledWith('nexus-audit', { body: { projectId: 'p1', action: 'overview' } });
  });

  it('402/423 viram NexusBlockedError; outros erros viram Error(código do servidor)', async () => {
    const mk = (status: number, error: string) => ({ data: null, error: { message: 'non-2xx', context: new Response(JSON.stringify({ error }), { status }) } });
    h.invoke.mockResolvedValueOnce(mk(402, 'budget_paused'));
    const blocked = await invokeEdge('nexus-intelligence', 'p1', {}).catch((e) => e);
    expect(blocked).toBeInstanceOf(NexusBlockedError);
    expect((blocked as NexusBlockedError).reason).toBe('budget_paused');
    h.invoke.mockResolvedValueOnce(mk(400, 'secret_format_invalid:A chave começa com "sk-".'));
    expect((await invokeEdge('nexus-intelligence', 'p1', {}).catch((e: Error) => e) as Error).message).toBe('secret_format_invalid:A chave começa com "sk-".');
    h.invoke.mockResolvedValueOnce(mk(429, 'audit_rate_limited'));
    expect((await invokeEdge('nexus-audit', 'p1', {}).catch((e: Error) => e) as Error).message).toBe('audit_rate_limited');
  });
});

describe('useNexusProviders / ações', () => {
  it('providers_overview com a chave de consulta e polling de 60 s como reserva', async () => {
    const data = { organization_id: 'org-1', providers: [] };
    h.invoke.mockResolvedValue({ data, error: null });
    const { W, qc } = wrapper();
    const { result } = renderHook(() => useNexusProviders('p1'), { wrapper: W });
    await waitFor(() => expect(result.current.data).toEqual(data));
    expect(h.invoke).toHaveBeenCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'providers_overview' } });
    expect(qc.getQueryCache().find({ queryKey: ['nexus-providers', 'p1'] })).toBeTruthy();
    const opts = qc.getQueryCache().find({ queryKey: ['nexus-providers', 'p1'] })?.observers[0]?.options as { refetchInterval?: number };
    expect(opts.refetchInterval).toBe(60_000);
  });

  it('sem projeto não consulta', () => {
    const { W } = wrapper();
    renderHook(() => useNexusProviders(undefined), { wrapper: W });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('storeCredential envia a credencial só na chamada e não a retém no cache do React Query', async () => {
    const SECRET = 'sk-SEGREDO-DE-TESTE-0123456789';
    h.invoke.mockResolvedValue({ data: { success: true, status: 'active', last_four: '6789', health: null }, error: null });
    const { W, qc } = wrapper();
    const { result } = renderHook(() => useNexusProviderActions('p1'), { wrapper: W });
    const r = await result.current.storeCredential('openai', SECRET);
    expect(r.last_four).toBe('6789');
    expect(h.invoke).toHaveBeenCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'store_credential', provider: 'openai', secret: SECRET } });
    expect(JSON.stringify(qc.getMutationCache().getAll().map((m) => m.state))).not.toContain(SECRET);
    expect(JSON.stringify(qc.getQueryCache().getAll().map((q) => q.state))).not.toContain(SECRET);
  });

  it('testProvider só envia confirmCost quando verdadeiro e provider quando informado', async () => {
    h.invoke.mockResolvedValue({ data: { results: [] }, error: null });
    const { W } = wrapper();
    const { result } = renderHook(() => useNexusProviderActions('p1'), { wrapper: W });
    await act(async () => { await result.current.testProvider.mutateAsync({}); });
    expect(h.invoke).toHaveBeenLastCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'provider_health_check' } });
    await act(async () => { await result.current.testProvider.mutateAsync({ provider: 'serper', confirmCost: true }); });
    expect(h.invoke).toHaveBeenLastCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'provider_health_check', provider: 'serper', confirmCost: true } });
  });

  it('saveExecution e removeCredential usam as ações do contrato', async () => {
    h.invoke.mockResolvedValue({ data: {}, error: null });
    const { W } = wrapper();
    const { result } = renderHook(() => useNexusProviderActions('p1'), { wrapper: W });
    await act(async () => { await result.current.saveExecution.mutateAsync({ executionEnabled: true, budgetUsd: 5, providersEnabled: ['openai'], confirm: 'LIBERAR' }); });
    expect(h.invoke).toHaveBeenLastCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'execution_settings_set', executionEnabled: true, budgetUsd: 5, providersEnabled: ['openai'], confirm: 'LIBERAR' } });
    await act(async () => { await result.current.removeCredential.mutateAsync('openai'); });
    expect(h.invoke).toHaveBeenLastCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'provider_credential_remove', provider: 'openai' } });
    await act(async () => { await result.current.syncSearch.mutateAsync({ days: 28, source: 'all' }); });
    expect(h.invoke).toHaveBeenLastCalledWith('nexus-intelligence', { body: { projectId: 'p1', action: 'search_performance_sync', days: 28, source: 'all' } });
  });
});

describe('useNexusAudit', () => {
  it('overview, run, update_finding e apply_fix chamam nexus-audit', async () => {
    h.invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => ({ data: body.action === 'overview' ? { findings: [], runs: [], counts: {} } : { ok: true }, error: null }));
    const { W } = wrapper();
    const { result } = renderHook(() => useNexusAudit('p1'), { wrapper: W });
    await waitFor(() => expect(result.current.overview.data).toBeTruthy());
    expect(h.invoke).toHaveBeenCalledWith('nexus-audit', { body: { projectId: 'p1', action: 'overview' } });
    await act(async () => { await result.current.runNow.mutateAsync(); });
    expect(h.invoke).toHaveBeenCalledWith('nexus-audit', { body: { projectId: 'p1', action: 'run' } });
    await act(async () => { await result.current.updateFinding.mutateAsync({ id: 'f1', status: 'snoozed', snoozeHours: 24 }); });
    expect(h.invoke).toHaveBeenCalledWith('nexus-audit', { body: { projectId: 'p1', action: 'update_finding', id: 'f1', status: 'snoozed', snoozeHours: 24 } });
    await act(async () => { await result.current.applyFix.mutateAsync('f1'); });
    expect(h.invoke).toHaveBeenCalledWith('nexus-audit', { body: { projectId: 'p1', action: 'apply_fix', id: 'f1' } });
  });
});

describe('canal realtime (mockado)', () => {
  it('assina as 3 tabelas filtradas pela organização, com INSERT no health e * nas de auditoria', () => {
    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const off = subscribeNexusRealtime('org-1', onEvent, onStatus);
    expect(h.channel).toHaveBeenCalledWith('nexus-motores:org-1');
    expect(h.state.ons.map((o) => ({ type: o.type, ...o.config }))).toEqual([
      { type: 'postgres_changes', event: 'INSERT', schema: 'public', table: 'nexus_provider_health', filter: 'organization_id=eq.org-1' },
      { type: 'postgres_changes', event: '*', schema: 'public', table: 'nexus_audit_findings', filter: 'organization_id=eq.org-1' },
      { type: 'postgres_changes', event: '*', schema: 'public', table: 'nexus_audit_runs', filter: 'organization_id=eq.org-1' },
    ]);
    h.state.ons.forEach((o) => o.cb({}));
    expect(onEvent.mock.calls.map((c) => c[0])).toEqual(['nexus_provider_health', 'nexus_audit_findings', 'nexus_audit_runs']);
    h.state.statusCb?.('SUBSCRIBED');
    expect(onStatus).toHaveBeenLastCalledWith(true);
    h.state.statusCb?.('CHANNEL_ERROR');
    expect(onStatus).toHaveBeenLastCalledWith(false);
    h.state.statusCb?.('TIMED_OUT');
    expect(onStatus).toHaveBeenLastCalledWith(false);
    off();
    expect(h.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('o hook muda para "ao vivo", invalida as consultas com debounce e cancela ao desmontar', async () => {
    vi.useFakeTimers();
    const { W, qc } = wrapper();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result, unmount } = renderHook(() => useNexusRealtime('p1', 'org-1'), { wrapper: W });
    expect(result.current).toBe('connecting');
    act(() => { h.state.statusCb?.('SUBSCRIBED'); });
    expect(result.current).toBe('live');

    // três inserts de saúde em sequência = uma única invalidação
    act(() => { h.state.ons[0].cb({}); h.state.ons[0].cb({}); h.state.ons[0].cb({}); });
    expect(spy).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(450); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith({ queryKey: ['nexus-providers', 'p1'] });

    act(() => { h.state.ons[1].cb({}); });
    act(() => { vi.advanceTimersByTime(450); });
    expect(spy).toHaveBeenLastCalledWith({ queryKey: ['nexus-audit', 'p1'] });

    act(() => { h.state.statusCb?.('CLOSED'); });
    expect(result.current).toBe('polling');

    act(() => { h.state.ons[0].cb({}); });
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(spy).toHaveBeenCalledTimes(2); // o evento pendente foi descartado
    expect(h.removeChannel).toHaveBeenCalled();
  });

  it('sem organização não abre canal', () => {
    const { W } = wrapper();
    renderHook(() => useNexusRealtime('p1', undefined), { wrapper: W });
    expect(h.channel).not.toHaveBeenCalled();
  });
});

describe('página NexusProviders (fumaça)', () => {
  const overview: ProvidersOverview = {
    generated_at: '2026-11-12T12:00:00Z', organization_id: 'org-1', viewer: { role: 'manager', can_manage_technical: true }, viewer_is_admin: true,
    program: { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [] },
    summary: { total: 11, connected: 1, healthy: 1, degraded: 0, error: 0, not_configured: 9, manual: 1, overall: 'ok', score: 90 },
    providers: [{
      ...emptyOverviewItem('openai'), status: 'healthy', score: 90, credential: { stored: true, last_four: '4321', status: 'active', updated_at: '2026-11-12T10:00:00Z' },
      health: { last: { checked_at: new Date().toISOString(), ok: true, latency_ms: 250, http_status: 200, cost_micros: 0 }, checks_7d: 2, ok_7d: 2, avg_latency_ms_7d: 250 },
    }],
  };

  function page() {
    const { W } = wrapper();
    return render(<MemoryRouter><W><NexusProviders /></W></MemoryRouter>);
  }

  it('mostra projeto/organização, faixa de saúde, 12 cards, painel de liberação e o item de auditoria', async () => {
    h.invoke.mockImplementation(async (fn: string, { body }: { body: { action: string } }) => {
      if (fn === 'nexus-intelligence' && body.action === 'providers_overview') return { data: overview, error: null };
      if (fn === 'nexus-audit') return { data: { generated_at: '', last_run: null, counts: { open: { corrective: 2, preventive: 1, improvement: 0 }, by_severity: {}, resolved_7d: 0 }, findings: [], runs: [] }, error: null };
      return { data: {}, error: null };
    });
    page();
    expect(await screen.findByTestId('health-strip-text')).toBeTruthy();
    expect(screen.getByTestId('active-scope').textContent).toContain('Projeto RDM');
    expect(screen.getByTestId('active-scope').textContent).toContain('Organização RDM');
    expect(screen.getByRole('heading', { name: 'Conexões, saúde e custo dos motores' })).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="provider-"]')).toHaveLength(12);
    expect(screen.getByRole('heading', { name: 'Ativação guiada dos gratuitos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Liberação de execução paga' })).toBeTruthy();
    expect(screen.getByTestId('exec-state').textContent).toContain('DESLIGADA');
    await waitFor(() => expect(screen.getByRole('tab', { name: /Saúde do sistema \(3\)/ })).toBeTruthy());
    expect(screen.getByRole('tab', { name: 'Tráfego orgânico (Google Search Console)' })).toBeTruthy();
    // realtime assinado para a organização do projeto
    expect(h.channel).toHaveBeenCalledWith('nexus-motores:org-1');
  });

  it('clicar em Conectar abre o diálogo e em Documentação abre a gaveta', async () => {
    h.invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => ({ data: body.action === 'providers_overview' ? overview : { findings: [], runs: [], counts: { open: {}, by_severity: {}, resolved_7d: 0 } }, error: null }));
    page();
    await screen.findByTestId('health-strip-text');
    fireEvent.click(screen.getAllByRole('button', { name: /^Conectar: Serper/ })[0]);
    expect(await screen.findByRole('heading', { name: 'Conectar: Serper' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Conectar: Serper' })).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: /^Documentação: Serper/ })[0]);
    expect(await screen.findByText('Passo a passo')).toBeTruthy();
  });

  it('mensagem de erro do servidor ao carregar, com tentar de novo', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: 'x', context: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) } });
    page();
    // o hook tenta 1 vez de novo (retry) antes de mostrar o erro
    expect(await screen.findByText('Não foi possível carregar as conexões', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getAllByText(/proprietário ou administrador/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeTruthy();
  });

  it('402 mostra o aviso de execução bloqueada, sem tratar como erro', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: 'x', context: new Response(JSON.stringify({ error: 'budget_paused' }), { status: 402 }) } });
    page();
    expect(await screen.findByText('Execução bloqueada')).toBeTruthy();
    expect(screen.queryByText('Não foi possível carregar as conexões')).toBeNull();
  });
});
