import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  refreshSession: vi.fn(),
  invokeEdge: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke }, auth: { refreshSession: mocks.refreshSession } } }));
vi.mock('@/hooks/useNexusProviders', () => ({ invokeEdge: mocks.invokeEdge }));

import { ManagedOAuthPanel } from '@/components/nexus/ManagedOAuthPanel';
import { fetchOverview } from '@/lib/nexus-visibility-api';
import bingUrls from '@/data/rdm-bing-audit-urls.json';

/**
 * D13: ajustes que o Codex publicou só nos arquivos compilados do painel (13/11/2026) e que agora vivem no código-fonte.
 * Se algum destes testes quebrar, uma recompilação do painel voltaria a perder o comportamento que está no ar.
 */
beforeEach(() => { mocks.invoke.mockReset(); mocks.refreshSession.mockReset(); mocks.invokeEdge.mockReset(); });
afterEach(cleanup);

describe('Visibility renova a sessão vencida (401) uma vez', () => {
  const filtro = { from: '2026-11-01', to: '2026-11-15' };

  it('401: renova o login e repete a chamada com o novo token', async () => {
    mocks.invokeEdge.mockRejectedValueOnce(new Error('401'));
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo-token' } }, error: null });
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    await fetchOverview('p1', filtro).catch(() => undefined);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [fn, opts] = mocks.invoke.mock.calls[0];
    expect(fn).toBe('nexus-visibility');
    expect(opts.headers).toEqual({ Authorization: 'Bearer novo-token' });
    expect(opts.body).toMatchObject({ projectId: 'p1', action: 'overview' });
  });

  it('sem conseguir renovar, devolve o erro original e não repete a chamada', async () => {
    mocks.invokeEdge.mockRejectedValue(new Error('session_invalid'));
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('x') });
    await expect(fetchOverview('p1', filtro)).rejects.toThrow('session_invalid');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('outros erros (por exemplo, papel sem permissão) passam direto, sem renovar o login', async () => {
    mocks.invokeEdge.mockRejectedValue(new Error('manager_required'));
    await expect(fetchOverview('p1', filtro)).rejects.toThrow('manager_required');
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });
});

describe('painel de conexões gerenciadas (GA4 e Bing)', () => {
  const choose = (value: string) => fireEvent.change(screen.getByLabelText(/Provedor/), { target: { value } });

  it('o botão de teste do GA4 só aparece com o GA4; o do Bing, só com o Bing', () => {
    render(<ManagedOAuthPanel projectId="p1" />);
    expect(screen.queryByRole('button', { name: 'Testar métricas GA4' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Testar métricas e 93 URLs' })).toBeNull();
    choose('ga4');
    expect(screen.getByRole('button', { name: 'Testar métricas GA4' })).toBeTruthy();
    choose('bing');
    expect(screen.getByRole('button', { name: 'Testar métricas e 93 URLs' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Testar métricas GA4' })).toBeNull();
  });

  it('teste do GA4 mostra as sessões, ou a causa quando falha', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true, sessions: 321 }, error: null });
    render(<ManagedOAuthPanel projectId="p1" />);
    choose('ga4');
    fireEvent.click(screen.getByRole('button', { name: 'Testar métricas GA4' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Sessões nos últimos sete dias: 321/));
    mocks.invoke.mockResolvedValueOnce({ data: { ok: false, stage: 'report', reason: 'SERVICE_DISABLED' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Testar métricas GA4' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Data API está desativada/));
  });

  it('auditoria do Bing: 93 URLs únicas, em lotes de 8, métricas só no primeiro lote, total no aviso', async () => {
    expect(bingUrls).toHaveLength(93);
    expect(new Set(bingUrls).size).toBe(93);
    mocks.invoke.mockImplementation(async (_fn: string, opts: { body: { urls: string[] } }) => ({ data: { results: opts.body.urls.map(() => ({ ok: true })), saved: opts.body.urls.length }, error: null }));
    render(<ManagedOAuthPanel projectId="p1" />);
    choose('bing');
    fireEvent.click(screen.getByRole('button', { name: 'Testar métricas e 93 URLs' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Bing OAuth: 93/93 consultas registradas com sucesso.'));
    expect(mocks.invoke).toHaveBeenCalledTimes(12);
    const bodies = mocks.invoke.mock.calls.map((c) => c[1].body);
    expect(bodies.every((b: { action: string; provider: string }) => b.action === 'oauth_bing_audit' && b.provider === 'bing')).toBe(true);
    expect(bodies.map((b: { metrics: boolean }) => b.metrics)).toEqual([true, ...Array(11).fill(false)]);
    expect(bodies.flatMap((b: { urls: string[] }) => b.urls)).toEqual(bingUrls);
  });

  it('auditoria do Bing: resposta inválida mostra a falha', async () => {
    mocks.invoke.mockResolvedValue({ data: { error: 'bing_audit_request_failed' }, error: null });
    render(<ManagedOAuthPanel projectId="p1" />);
    choose('bing');
    fireEvent.click(screen.getByRole('button', { name: 'Testar métricas e 93 URLs' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Falha Bing OAuth/));
  });
});
