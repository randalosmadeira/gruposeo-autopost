import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComplianceMode } from '@/lib/compliance-mode';
import { runComplianceCheck } from '@/lib/compliance-mode';

const h = vi.hoisted(() => ({
  state: { mode: 'advisory' as 'off' | 'advisory' | 'strict', isLoading: false, canChange: true },
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useComplianceMode', () => ({
  useComplianceMode: () => ({
    mode: h.state.mode,
    isLoading: h.state.isLoading,
    canChange: h.state.canChange,
    organizationId: 'org-1',
    setMode: { mutateAsync: h.mutateAsync, isPending: false },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));

import { ComplianceChecker } from '@/components/articles/editor/ComplianceChecker';
import { ComplianceAdvisoryDialog } from '@/components/articles/ComplianceAdvisoryDialog';
import { ComplianceModeCard } from '@/components/settings/ComplianceModeCard';

const violating = '<p>Somos o melhor escritório de advocacia criminal. Garantimos a absolvição do seu caso e a consulta é gratuita. Entre em contato agora.</p>';

beforeAll(() => {
  class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});
afterEach(() => { cleanup(); h.mutateAsync.mockReset(); h.toastSuccess.mockReset(); h.toastError.mockReset(); h.state = { mode: 'advisory', isLoading: false, canChange: true }; });

describe('ComplianceChecker por modo', () => {
  it('desligado: não mostra verificação nenhuma', async () => {
    h.state.mode = 'off';
    render(<ComplianceChecker content={violating} title="Título qualquer de teste" />);
    expect(screen.getByText(/verificação de publicidade está desligada/i)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.queryByText(/pontos? para você revisar/i)).toBeNull();
    expect(screen.queryByText(/Garantimos/)).toBeNull();
  });

  it('aviso: lista os pontos com explicação, diz que pode publicar e não usa linguagem de reprovação', async () => {
    h.state.mode = 'advisory';
    render(<ComplianceChecker content={violating} title="Título qualquer de teste" />);
    await waitFor(() => expect(screen.getByText(/pontos para você revisar/i)).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByText(/você pode publicar/i)).toBeTruthy();
    expect(screen.getByText('Promessa ou garantia de resultado')).toBeTruthy();
    expect(screen.getAllByText(/Sugestão:/).length).toBeGreaterThan(0);
    expect(screen.getByText(/responsabilidade pela publicidade do escritório é do responsável pelo escritório/i)).toBeTruthy();
    expect(screen.queryByText(/violam/i)).toBeNull();
    expect(screen.queryByText(/Requer revisão/i)).toBeNull();
  });

  it('rígido: comportamento atual (cartão de compliance OAB baseado na Resolução 02/2015)', async () => {
    h.state.mode = 'strict';
    render(<ComplianceChecker content={violating} title="Título qualquer de teste" />);
    await waitFor(() => expect(screen.getByText(/Baseado na Resolução OAB 02\/2015/i)).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText(/pontos para você revisar/i)).toBeNull();
  });

  it('enquanto o modo carrega não decide nada', () => {
    h.state.isLoading = true;
    render(<ComplianceChecker content={violating} />);
    expect(screen.getByRole('status').textContent).toMatch(/Carregando/);
  });
});

describe('ComplianceAdvisoryDialog (publicar mesmo assim)', () => {
  const issues = runComplianceCheck('advisory' as ComplianceMode, { title: 'Defesa criminal em São Paulo', content: '<p>Garantimos a absolvição.</p>' }).warnings;

  it('mostra os avisos e oferece "Publicar mesmo assim (ciente)" e "Voltar e revisar"', () => {
    const onPublishAnyway = vi.fn();
    const onRevise = vi.fn();
    render(<ComplianceAdvisoryDialog issues={issues} onRevise={onRevise} onPublishAnyway={onPublishAnyway} />);
    expect(screen.getByText('Promessa ou garantia de resultado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar mesmo assim (ciente)' }));
    expect(onPublishAnyway).toHaveBeenCalledTimes(1);
  });

  it('"Voltar e revisar" não publica', () => {
    const onPublishAnyway = vi.fn();
    const onRevise = vi.fn();
    render(<ComplianceAdvisoryDialog issues={issues} onRevise={onRevise} onPublishAnyway={onPublishAnyway} />);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar e revisar' }));
    expect(onPublishAnyway).not.toHaveBeenCalled();
    expect(onRevise).toHaveBeenCalled();
  });

  it('sem avisos não abre', () => {
    render(<ComplianceAdvisoryDialog issues={[]} onRevise={vi.fn()} onPublishAnyway={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('ComplianceModeCard (configuração da organização)', () => {
  it('owner/admin vê as três opções em português e o aviso de responsabilidade', () => {
    render(<ComplianceModeCard />);
    expect(screen.getByText('Desligado')).toBeTruthy();
    expect(screen.getByText('Aviso (padrão)')).toBeTruthy();
    expect(screen.getByText('Rígido')).toBeTruthy();
    expect(screen.getByText(/responsabilidade pela publicidade do escritório é do responsável pelo escritório/i)).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Aviso \(padrão\)/ }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
  });

  it('quem não é owner/admin não vê o cartão', () => {
    h.state.canChange = false;
    const { container } = render(<ComplianceModeCard />);
    expect(container.textContent).toBe('');
  });

  it('salva o modo escolhido e só habilita "Salvar" quando muda', async () => {
    h.mutateAsync.mockResolvedValue('strict');
    render(<ComplianceModeCard />);
    const save = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Rígido/ }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith('strict'));
    await waitFor(() => expect(h.toastSuccess).toHaveBeenCalled());
  });

  it('mostra o erro quando o banco recusa (sem permissão)', async () => {
    h.mutateAsync.mockRejectedValue(new Error('Apenas o dono ou o administrador da organização pode alterar este modo.'));
    render(<ComplianceModeCard />);
    fireEvent.click(screen.getByRole('radio', { name: /Desligado/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Apenas o dono ou o administrador da organização pode alterar este modo.'));
  });
});
