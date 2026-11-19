import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnalysisReport } from '@/lib/profile-api';

const api = vi.hoisted(() => ({ callAnalyze: vi.fn() }));
vi.mock('@/lib/profile-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/profile-api')>('@/lib/profile-api');
  return { ...actual, callAnalyze: api.callAnalyze };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { ProfileAnalysis } from '@/components/profile/ProfileAnalysis';
import { ProfileError } from '@/lib/profile-api';

const PID = '11111111-1111-4111-8111-111111111111';
const report: AnalysisReport = {
  run: { id: 'r1', status: 'partial', created_at: '2026-11-15T12:00:00Z', started_at: '2026-11-15T12:00:00Z', finished_at: '2026-11-15T12:00:20Z', summary: {}, error: null },
  checks: [
    { check_key: 'cnpj_receita', source: 'brasilapi', status: 'ok', measured: { situacao: 'ATIVA', socios_quantidade: 2, encontrado: true }, evidence_url: 'https://brasilapi.com.br/api/cnpj/v1/11222333000181', duration_ms: 320, error: null },
    { check_key: 'dns', source: 'cloudflare-doh', status: 'error', measured: {}, evidence_url: null, duration_ms: 6000, error: 'O serviço de DNS não respondeu. Nada foi preenchido.' },
    { check_key: 'maps_google_meu_negocio', source: 'serper-maps', status: 'skipped', measured: {}, evidence_url: null, duration_ms: 0, error: 'Consulta paga não executada.' },
  ],
  findings: [
    { id: 'f1', check_key: 'site_resposta', severity: 'alta', title: 'O site não termina em HTTPS', detail: 'Sem HTTPS o navegador avisa "não seguro".', evidence: {}, suggested_action: 'Instale o certificado.', state: 'open' },
    { id: 'f2', check_key: 'sitemap', severity: 'media', title: 'Nenhum sitemap encontrado', detail: null, evidence: {}, suggested_action: null, state: 'open' },
    { id: 'f3', check_key: 'llms_txt', severity: 'info', title: 'O site não tem llms.txt', detail: null, evidence: {}, suggested_action: null, state: 'ignored' },
  ],
};
const history = { runs: [{ id: 'r1', status: 'partial', created_at: '2026-11-15T12:00:00Z', finished_at: '2026-11-15T12:00:20Z' }] };
const empty: AnalysisReport = { run: null, checks: [], findings: [] };

function mockLoad(r: AnalysisReport = report, h: unknown = history) {
  api.callAnalyze.mockImplementation(async (action: string) => (action === 'get' ? r : action === 'history' ? h : { success: true }));
}
function mount(over: { canWrite?: boolean; hasUnsaved?: boolean } = {}) {
  return render(<ProfileAnalysis projectId={PID} canWrite={over.canWrite ?? true} hasUnsaved={over.hasUnsaved ?? false} />);
}

beforeEach(() => api.callAnalyze.mockReset());
afterEach(cleanup);

describe('pente fino (tela)', () => {
  it('carrega o último relatório: achados em aberto primeiro, verificações com estado e aviso das pagas', async () => {
    mockLoad();
    mount();
    expect(await screen.findByText('O site não termina em HTTPS')).toBeTruthy();
    expect(screen.getByText('Nenhum sitemap encontrado')).toBeTruthy();
    expect(screen.getByText(/2 achado\(s\) em aberto/)).toBeTruthy();
    expect(screen.getByText('CNPJ na Receita Federal')).toBeTruthy();
    expect(screen.getByText('Sem resposta')).toBeTruthy();
    expect(screen.getByText('Não executada')).toBeTruthy();
    expect(screen.getByText(/Verificações pagas não rodam aqui/)).toBeTruthy();
    expect(screen.getByText(/O serviço de DNS não respondeu\. Nada foi preenchido\./)).toBeTruthy();
    expect(api.callAnalyze).toHaveBeenCalledWith('get', { projectId: PID });
    expect(api.callAnalyze).toHaveBeenCalledWith('history', { projectId: PID });
  });

  it('o que foi medido aparece; verificação sem resposta não mostra nenhum número', async () => {
    mockLoad();
    mount();
    await screen.findByText('CNPJ na Receita Federal');
    const cnpj = screen.getByText('CNPJ na Receita Federal').closest('li') as HTMLElement;
    expect(within(cnpj).getByText('situacao')).toBeTruthy();
    expect(within(cnpj).getByText('ATIVA')).toBeTruthy();
    expect(within(cnpj).getByText('socios quantidade')).toBeTruthy();
    expect(within(cnpj).getByRole('link', { name: 'Fonte da medição' }).getAttribute('href')).toMatch(/^https:\/\/brasilapi\.com\.br/);
    const dns = screen.getByText('DNS e e-mail do domínio').closest('li') as HTMLElement;
    expect(within(dns).queryByText('Ver o que foi medido')).toBeNull();
  });

  it('achados já ignorados ficam recolhidos', async () => {
    mockLoad();
    mount();
    expect(await screen.findByText(/Já resolvidos ou ignorados \(1\)/)).toBeTruthy();
  });

  it('sem execução anterior mostra o convite', async () => {
    mockLoad(empty, { runs: [] });
    mount();
    expect(await screen.findByText(/Nenhum pente fino foi rodado/)).toBeTruthy();
  });

  it('"Rodar o pente fino" manda o projeto e uma chave de pedido nova, mostra o andamento e o resultado', async () => {
    mockLoad(empty, { runs: [] });
    mount();
    await screen.findByText(/Nenhum pente fino foi rodado/);
    let release: (r: AnalysisReport) => void = () => undefined;
    api.callAnalyze.mockImplementation((action: string) => (action === 'start' ? new Promise((res) => { release = res as typeof release; }) : Promise.resolve(action === 'history' ? history : empty)));
    fireEvent.click(screen.getByRole('button', { name: 'Rodar o pente fino' }));
    expect(await screen.findByRole('button', { name: /Verificando/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: /Verificando/ }) as HTMLButtonElement).disabled).toBe(true);
    const startCall = api.callAnalyze.mock.calls.find((c) => c[0] === 'start');
    expect(startCall?.[1].projectId).toBe(PID);
    expect(String(startCall?.[1].requestKey).length).toBeGreaterThanOrEqual(8);
    release(report);
    expect(await screen.findByText('O site não termina em HTTPS')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rodar o pente fino' })).toBeTruthy();
  });

  it('dois cliques seguidos geram UMA chamada (botão trava)', async () => {
    mockLoad(empty, { runs: [] });
    mount();
    await screen.findByText(/Nenhum pente fino foi rodado/);
    api.callAnalyze.mockImplementation((action: string) => (action === 'start' ? new Promise(() => undefined) : Promise.resolve(history)));
    const button = screen.getByRole('button', { name: 'Rodar o pente fino' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.callAnalyze.mock.calls.filter((c) => c[0] === 'start')).toHaveLength(1);
  });

  it.each([
    ['already_running', /já existe um pente fino em andamento/i],
    ['daily_limit', /limite diário/i],
    ['analyze_run_failed', /não conseguiu terminar/i],
    ['role_not_allowed', /permite ver o relatório/i],
  ])('erro %s vira mensagem clara', async (code, re) => {
    mockLoad(empty, { runs: [] });
    mount();
    await screen.findByText(/Nenhum pente fino foi rodado/);
    api.callAnalyze.mockImplementation((action: string) => (action === 'start' ? Promise.reject(new ProfileError(code)) : Promise.resolve(empty)));
    fireEvent.click(screen.getByRole('button', { name: 'Rodar o pente fino' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(re));
    expect((screen.getByRole('button', { name: 'Rodar o pente fino' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('marcar como resolvido chama o servidor e move o achado; reabrir volta', async () => {
    mockLoad();
    mount();
    await screen.findByText('Nenhum sitemap encontrado');
    const card = screen.getByText('Nenhum sitemap encontrado').closest('li') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Marcar como resolvido' }));
    await waitFor(() => expect(api.callAnalyze).toHaveBeenCalledWith('decide_finding', { projectId: PID, findingId: 'f2', state: 'applied' }));
    await waitFor(() => expect(screen.getByText(/1 achado\(s\) em aberto/)).toBeTruthy());
    expect(screen.getByText(/Já resolvidos ou ignorados \(2\)/)).toBeTruthy();
  });

  it('visualizador só lê: sem botão de rodar nem de decidir', async () => {
    mockLoad();
    mount({ canWrite: false });
    await screen.findByText('O site não termina em HTTPS');
    expect(screen.queryByRole('button', { name: 'Rodar o pente fino' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar como resolvido' })).toBeNull();
    expect(screen.getByText(/permite ver o relatório, mas não rodar/)).toBeTruthy();
  });

  it('alterações não salvas geram aviso', async () => {
    mockLoad(empty, { runs: [] });
    mount({ hasUnsaved: true });
    expect(await screen.findByText(/salve antes, porque o pente fino usa o que já está salvo/)).toBeTruthy();
  });

  it('o texto vindo do servidor é mostrado como texto, nunca como HTML', async () => {
    mockLoad({ ...report, findings: [{ ...report.findings[0], title: '<img src=x onerror=alert(1)>Título', detail: '<b>negrito</b>' }] });
    const { container } = mount();
    await screen.findByText(/Título/);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('endereço de evidência que não é http(s) não vira link', async () => {
    mockLoad({ ...report, checks: [{ ...report.checks[0], evidence_url: 'javascript:alert(1)' }] });
    mount();
    await screen.findByText('CNPJ na Receita Federal');
    expect(screen.queryByRole('link', { name: 'Fonte da medição' })).toBeNull();
  });
});
