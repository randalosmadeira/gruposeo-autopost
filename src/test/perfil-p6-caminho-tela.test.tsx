import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnalysisReport } from '@/lib/profile-api';

const api = vi.hoisted(() => ({ callAnalyze: vi.fn(), createClientRequest: vi.fn() }));
vi.mock('@/lib/profile-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/profile-api')>('@/lib/profile-api');
  return { ...actual, callAnalyze: api.callAnalyze };
});
vi.mock('@/lib/nexus-management-api', () => ({ createClientRequest: api.createClientRequest }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/components/profile/ProfileAnalysis', () => ({ ProfileAnalysis: () => null }));

import { PathStep } from '@/components/profile/ProfileExtras';
import type { Values } from '../../supabase/functions/_shared/profile-model';

const PID = '11111111-1111-4111-8111-111111111111';
const run = { id: 'r1', status: 'done' as const, created_at: '2026-11-16T12:00:00Z', started_at: null, finished_at: '2026-11-16T12:00:20Z', summary: {}, error: null };
const chk = (check_key: string, status: 'ok' | 'warn' | 'fail' | 'error' | 'skipped') => ({ check_key, source: 'x', status, measured: {}, evidence_url: null, duration_ms: 0, error: null });
const fnd = (id: string, check_key: string, severity: 'alta' | 'media' | 'baixa' | 'info', title: string) => ({ id, check_key, severity, title, detail: 'detalhe', evidence: {}, suggested_action: 'faça', state: 'open' as const });

const report: AnalysisReport = {
  run,
  checks: [chk('dns', 'ok'), chk('dominio_rdap', 'error'), chk('site_resposta', 'fail'), chk('robots_txt', 'warn'), chk('cnpj_formato', 'skipped')],
  findings: [fnd('f1', 'site_resposta', 'alta', 'O site não termina em HTTPS'), fnd('f2', 'sitemap', 'media', 'Nenhum sitemap encontrado'), fnd('f3', 'llms_txt', 'info', 'O site não tem llms.txt')],
};
const empty: AnalysisReport = { run: null, checks: [], findings: [] };

function mount(values: Values = {}, over: { canWrite?: boolean } = {}) {
  return render(<PathStep values={values} projectId={PID} projectName="Loja Exemplo" canWrite={over.canWrite ?? true} />);
}
beforeEach(() => { api.callAnalyze.mockReset(); api.createClientRequest.mockReset(); localStorage.clear(); });
afterEach(cleanup);

describe('Caminho (P6)', () => {
  it('sem medição: declarado "sem dados ainda" e convite a rodar o pente fino; nenhum número medido', async () => {
    api.callAnalyze.mockResolvedValue(empty);
    mount();
    expect(await screen.findByText(/Ainda não há medição/)).toBeTruthy();
    expect(screen.getAllByText('sem dados ainda').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Medido em/)).toBeNull();
  });

  it('falha ao ler a medição não quebra a tela: só mostra o declarado', async () => {
    api.callAnalyze.mockRejectedValue(new Error('x'));
    mount();
    expect(await screen.findByText(/Ainda não há medição/)).toBeTruthy();
    expect(screen.getByText('Maturidade da marca')).toBeTruthy();
  });

  it('com medição: mostra a nota medida só de quem respondeu, "sem medição" onde nada respondeu, a data e o aviso das pagas', async () => {
    api.callAnalyze.mockResolvedValue(report);
    mount();
    expect(await screen.findByText(/Medido em 16\/11\/2026/)).toBeTruthy();
    const dominio = screen.getByText('Domínio e e-mail').closest('li') as HTMLElement;
    expect(within(dominio).getByRole('img').getAttribute('aria-label')).toBe('Domínio e e-mail (medido): 100 de 100');
    expect(within(dominio).getByText(/1 medida\(s\), 1 sem resposta/)).toBeTruthy();
    const empresa = screen.getByText('Empresa e documentos').closest('li') as HTMLElement;
    expect(within(empresa).getByText('sem medição')).toBeTruthy();
    expect(screen.getByText(/Verificação sem resposta não conta, nem como zero/)).toBeTruthy();
    expect(screen.getByText(/são pagos e ainda não foram medidos/)).toBeTruthy();
  });

  it('medição em que nenhuma fonte respondeu: não mostra nota nenhuma', async () => {
    api.callAnalyze.mockResolvedValue({ run, checks: [chk('dns', 'error'), chk('site_resposta', 'error')], findings: [] });
    mount();
    expect(await screen.findByText(/não obteve resposta das fontes/)).toBeTruthy();
    expect(screen.queryByText(/Medido em/)).toBeNull();
  });

  it('lacunas juntam respostas e medição, cada uma com a origem e a sugestão de quem faz; baixa e informação ficam de fora', async () => {
    api.callAnalyze.mockResolvedValue(report);
    mount({ cnpjstat: 'Ainda não tenho CNPJ' });
    await screen.findByText('O site não termina em HTTPS');
    const row = (t: string) => screen.getByText(t).closest('tr') as HTMLElement;
    expect(within(row('Abrir a empresa (CNPJ)')).getByText('suas respostas')).toBeTruthy();
    expect(within(row('O site não termina em HTTPS')).getByText('medido no pente fino')).toBeTruthy();
    expect(within(row('O site não termina em HTTPS')).getByText('Vale delegar')).toBeTruthy();
    expect(within(row('Nenhum sitemap encontrado')).getByText('Dá para fazer sozinho, com ajuda')).toBeTruthy();
    expect(screen.queryByText('O site não tem llms.txt')).toBeNull();
    expect(screen.getByText(/sugestão fixa por tipo de item/)).toBeTruthy();
  });

  it('fase 2: mostra o texto exato antes de enviar; cancelar não envia nada', async () => {
    api.callAnalyze.mockResolvedValue(report);
    mount({ cnpjstat: 'Ainda não tenho CNPJ' });
    await screen.findByText('O site não termina em HTTPS');
    fireEvent.click(screen.getByRole('button', { name: 'Pedir orçamento do que vale delegar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revisar pedido de orçamento' });
    expect(dialog.textContent).toMatch(/"Loja Exemplo"/);
    expect(dialog.textContent).toMatch(/O que vale delegar: .*Abrir a empresa \(CNPJ\)/);
    expect(dialog.textContent).toMatch(/O site não termina em HTTPS/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.createClientRequest).not.toHaveBeenCalled();
  });

  it('fase 2: confirmar manda para a caixa do gestor (tipo "outro") com o MESMO texto mostrado, guarda a data e avisa onde ver a resposta', async () => {
    api.callAnalyze.mockResolvedValue(report);
    api.createClientRequest.mockResolvedValue(null);
    mount();
    await screen.findByText('O site não termina em HTTPS');
    fireEvent.click(screen.getByRole('button', { name: 'Pedir orçamento do que vale delegar' }));
    const dialog = await screen.findByRole('dialog');
    const shown = (dialog.querySelector('p.whitespace-pre-wrap') as HTMLElement).textContent;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(api.createClientRequest).toHaveBeenCalledTimes(1));
    expect(api.createClientRequest).toHaveBeenCalledWith(PID, { kind: 'other', message: shown });
    expect(shown!.length).toBeLessThanOrEqual(1000);
    expect(await screen.findByText(/Pedido enviado ao gestor/)).toBeTruthy();
    expect(localStorage.getItem(`zica:perfil-fase2:v1:${PID}`)).toBeTruthy();
    expect(screen.getByText(/Você já enviou um pedido em/)).toBeTruthy();
  });

  it('fase 2: erro do servidor aparece em português e o pedido pode ser tentado de novo', async () => {
    api.callAnalyze.mockResolvedValue(report);
    api.createClientRequest.mockRejectedValueOnce(new Error('too_many_open_requests'));
    mount();
    await screen.findByText('O site não termina em HTTPS');
    fireEvent.click(screen.getByRole('button', { name: 'Pedir orçamento do que vale delegar' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText(/muitas solicitações abertas/)).toBeTruthy();
    expect(localStorage.getItem(`zica:perfil-fase2:v1:${PID}`)).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy(); // continua aberto para tentar de novo
  });

  it('fase 2: sem itens o botão vira "ajuda geral"; visualizador só vê o caminho', async () => {
    api.callAnalyze.mockResolvedValue(empty);
    mount();
    expect(await screen.findByRole('button', { name: 'Pedir ajuda geral' })).toBeTruthy();
    cleanup();
    api.callAnalyze.mockResolvedValue(report);
    mount({}, { canWrite: false });
    await screen.findByText('O site não termina em HTTPS');
    expect(screen.queryByRole('button', { name: /Pedir/ })).toBeNull();
    expect(screen.getByText(/permite ver o caminho, mas não enviar/)).toBeTruthy();
  });

  it('fase 2 deixa claro que nada é contratado e que não vai dado financeiro', async () => {
    api.callAnalyze.mockResolvedValue(empty);
    mount();
    const box = (await screen.findByText(/Fase 2: quer ajuda com o que vale delegar/)).parentElement as HTMLElement;
    expect(box.textContent).toMatch(/sem dados financeiros, metas ou campos privados/);
    expect(box.textContent).toMatch(/Nada é contratado por esse envio/);
  });
});
