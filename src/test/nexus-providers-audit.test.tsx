import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AuditView } from '@/components/nexus-providers/AuditTab';
import {
  fixResultMessage, fixRoute, groupFindings, isApplicableFix, minutesToNextAudit, severityLabel, severityTone, snoozeHoursLabel,
} from '@/lib/nexus-audit';
import type { AuditApplyFixResult, AuditFinding, AuditOverview, AuditRun } from '@/types/nexus-providers';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const NOW = new Date('2026-11-12T12:00:00Z').getTime();

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: 'f1', rule_id: 'provider.check_failed', project_id: 'p1', category: 'corrective', severity: 'high',
    title: 'O último teste de OpenAI falhou', detail: 'HTTP 401 no último teste.', suggested_action: 'Reconferir a chave e as permissões.',
    fix_action: { type: 'provider_health_check', params: { provider: 'openai' } }, status: 'open',
    first_seen_at: '2026-11-12T10:00:00Z', last_seen_at: '2026-11-12T11:45:00Z', occurrences: 4, snoozed_until: null, evidence: {}, ...over,
  };
}
const run = (id: number, trigger: AuditRun['trigger'], startedAt: string, over: Partial<AuditRun> = {}): AuditRun => ({
  id, trigger, started_at: startedAt, finished_at: startedAt, status: 'ok', rules_evaluated: 22, findings_opened: 1, findings_resolved: 0, ...over,
});

function overview(findings: AuditFinding[], over: Partial<AuditOverview> = {}): AuditOverview {
  const open = { corrective: 0, preventive: 0, improvement: 0 };
  const sev = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.filter((f) => f.status !== 'resolved').forEach((f) => { open[f.category]++; sev[f.severity]++; });
  const runs = [run(2, 'schedule', '2026-11-12T11:55:00Z'), run(1, 'manual', '2026-11-12T11:40:00Z', { status: 'partial' })];
  return {
    generated_at: '2026-11-12T12:00:00Z', last_run: runs[0], counts: { open, by_severity: sev, resolved_7d: findings.filter((f) => f.status === 'resolved').length },
    findings, runs, ...over,
  };
}

function mount(ov: AuditOverview | undefined, over: Partial<Parameters<typeof AuditView>[0]> = {}) {
  const props = {
    overview: ov, loading: false, error: null, now: NOW, canAdmin: true, running: false,
    onRun: vi.fn().mockResolvedValue(undefined), onUpdate: vi.fn().mockResolvedValue(undefined),
    onApplyFix: vi.fn<(f: AuditFinding) => Promise<AuditApplyFixResult>>().mockResolvedValue({ ok: true, result: { message: '1 teste executado.' }, finding: { ...finding(), status: 'resolved' } }),
    onOpenRoute: vi.fn(), onRetry: vi.fn(), ...over,
  };
  render(<AuditView {...props} />);
  return props;
}

describe('funções puras da auditoria', () => {
  it('severityLabel e severityTone (cor sempre acompanhada de texto)', () => {
    expect(severityLabel('critical')).toBe('Crítica');
    expect(severityLabel('info')).toBe('Informativa');
    expect(severityTone('critical')).toBe('danger');
    expect(severityTone('high')).toBe('danger');
    expect(severityTone('medium')).toBe('warning');
    expect(severityTone('low')).toBe('info');
    expect(severityTone('info')).toBe('neutral');
  });

  it('groupFindings separa por categoria, abertos antes, severidade, depois mais recente; resolvidos à parte', () => {
    const list = [
      finding({ id: 'a', severity: 'low', last_seen_at: '2026-11-12T11:00:00Z' }),
      finding({ id: 'b', severity: 'critical' }),
      finding({ id: 'c', severity: 'critical', status: 'acknowledged' }),
      finding({ id: 'd', severity: 'high', last_seen_at: '2026-11-12T11:50:00Z' }),
      finding({ id: 'e', severity: 'high', last_seen_at: '2026-11-12T11:55:00Z' }),
      finding({ id: 'p', category: 'preventive' }),
      finding({ id: 'r', status: 'resolved' }),
    ];
    const { active, resolved } = groupFindings(list);
    expect(active.corrective.map((f) => f.id)).toEqual(['b', 'e', 'd', 'a', 'c']);
    expect(active.preventive.map((f) => f.id)).toEqual(['p']);
    expect(active.improvement).toEqual([]);
    expect(resolved.map((f) => f.id)).toEqual(['r']);
  });

  it('isApplicableFix aceita só os quatro tipos', () => {
    expect(isApplicableFix({ type: 'provider_health_check' })).toBe(true);
    expect(isApplicableFix({ type: 'search_performance_sync' })).toBe(true);
    expect(isApplicableFix({ type: 'plugin_discovery_refresh' })).toBe(true);
    expect(isApplicableFix({ type: 'open_route' })).toBe(true);
    expect(isApplicableFix({ type: 'drop_table' } as never)).toBe(false);
    expect(isApplicableFix(null)).toBe(false);
  });

  it('fixRoute só devolve rotas internas seguras', () => {
    expect(fixRoute({ type: 'open_route', params: { route: '/nexus/motores', tab: 'traffic' } })).toEqual({ route: '/nexus/motores', tab: 'traffic' });
    expect(fixRoute({ type: 'open_route', params: { path: '/nexus/motores#ativacao-guiada' } })).toEqual({ route: '/nexus/motores#ativacao-guiada' });
    expect(fixRoute({ type: 'open_route', params: { route: 'https://evil.com' } })).toBeNull();
    expect(fixRoute({ type: 'open_route', params: { route: '//evil.com' } })).toBeNull();
    expect(fixRoute({ type: 'open_route' })).toBeNull();
    expect(fixRoute({ type: 'provider_health_check', params: { route: '/x' } })).toBeNull();
  });

  it('minutesToNextAudit: a cada 15 min a partir da última execução agendada', () => {
    const runs = [run(3, 'manual', '2026-11-12T11:59:00Z'), run(2, 'schedule', '2026-11-12T11:55:00Z'), run(1, 'schedule', '2026-11-12T11:40:00Z')];
    expect(minutesToNextAudit(runs, runs[0], NOW)).toBe(10);
    expect(minutesToNextAudit([run(1, 'schedule', '2026-11-12T11:00:00Z')], null, NOW)).toBe(0); // atrasada
    expect(minutesToNextAudit([run(1, 'manual', '2026-11-12T11:59:00Z')], null, NOW)).toBeNull();
    expect(minutesToNextAudit([], run(9, 'schedule', '2026-11-12T11:50:00Z'), NOW)).toBe(5);
    expect(minutesToNextAudit([], null, NOW)).toBeNull();
  });

  it('snoozeHoursLabel e fixResultMessage', () => {
    expect(snoozeHoursLabel(1)).toBe('1 hora');
    expect(snoozeHoursLabel(24)).toBe('24 horas');
    expect(snoozeHoursLabel(168)).toBe('7 dias');
    expect(fixResultMessage({ ok: true, finding: { status: 'resolved' } })).toBe('Correção aplicada e o achado foi resolvido.');
    expect(fixResultMessage({ ok: true, finding: { status: 'open' }, result: { message: '2 testes.' } })).toBe('Correção aplicada; a regra foi reavaliada e o achado segue aberto. 2 testes.');
    expect(fixResultMessage({ ok: false, result: { error: 'gsc_forbidden' } })).toMatch(/não pôde ser concluída.*conta de serviço/);
  });
});

describe('AuditView', () => {
  it('faixa com a última auditoria, próxima execução e contagens por categoria e severidade', () => {
    mount(overview([finding(), finding({ id: 'p', category: 'preventive', severity: 'medium', title: 'Cota baixa' })]));
    expect(screen.getByTestId('audit-strip').textContent).toBe('Última auditoria há 5 min (Concluída) · próxima em ≈ 10 min');
    const cats = screen.getByRole('list', { name: 'Achados abertos por categoria' });
    expect(cats.textContent).toContain('Corretivas: 1');
    expect(cats.textContent).toContain('Preventivas: 1');
    expect(cats.textContent).toContain('Melhorias: 0');
    expect(cats.textContent).toContain('Resolvidos em 7 dias: 0');
    const sev = screen.getByRole('list', { name: 'Achados abertos por severidade' });
    expect(sev.textContent).toContain('Alta: 1');
    expect(sev.textContent).toContain('Média: 1');
  });

  it('lista os achados por categoria com severidade em texto, detalhe, ação sugerida e ocorrências', () => {
    mount(overview([finding(), finding({ id: 'p', category: 'preventive', severity: 'medium', title: 'Cota baixa', fix_action: null })]));
    expect(screen.getByRole('heading', { name: 'Corretivas (1)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Preventivas (1)' })).toBeTruthy();
    const card = screen.getByTestId('finding-f1');
    expect(within(card).getByText('Severidade: Alta')).toBeTruthy();
    expect(within(card).getByText('O último teste de OpenAI falhou')).toBeTruthy();
    expect(within(card).getByText('HTTP 401 no último teste.')).toBeTruthy();
    expect(within(card).getByText(/Reconferir a chave e as permissões/)).toBeTruthy();
    expect(within(card).getByText(/4 ocorrência\(s\)/)).toBeTruthy();
    // sem fix_action: não há botão de correção
    const prev = screen.getByTestId('finding-p');
    expect(within(prev).queryByRole('button', { name: /Aplicar correção/ })).toBeNull();
    expect(within(prev).getByRole('button', { name: /Reconhecer/ })).toBeTruthy();
  });

  it('aplicar correção: confirma antes, chama onApplyFix e mostra o resultado', async () => {
    const f = finding();
    const p = mount(overview([f]));
    fireEvent.click(screen.getByRole('button', { name: `Aplicar correção: ${f.title}` }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Testar as conexões gratuitas agora');
    expect(dialog.textContent).toContain('não faz chamadas pagas');
    expect(p.onApplyFix).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar correção' }));
    await waitFor(() => expect(p.onApplyFix).toHaveBeenCalledWith(f));
    expect((await screen.findByText(/Correção aplicada e o achado foi resolvido\. 1 teste executado\./))).toBeTruthy();
  });

  it('cancelar a confirmação não aplica', async () => {
    const p = mount(overview([finding()]));
    fireEvent.click(screen.getByRole('button', { name: /Aplicar correção:/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(p.onApplyFix).not.toHaveBeenCalled();
  });

  it('falha ao aplicar mostra mensagem em pt-BR no próprio achado', async () => {
    const p = mount(overview([finding()]), { onApplyFix: vi.fn().mockRejectedValue(new Error('forbidden')) });
    fireEvent.click(screen.getByRole('button', { name: /Aplicar correção:/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aplicar correção' }));
    expect((await screen.findByText(/não pôde ser concluída.*proprietário ou administrador/))).toBeTruthy();
    expect(p.onApplyFix).toHaveBeenCalledTimes(1);
  });

  it('visão cliente: sem Aplicar correção, sem Auditar agora e sem histórico de execuções', () => {
    mount(overview([finding()]), { canAdmin: false });
    expect(screen.queryByRole('button', { name: /Aplicar correção:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auditar agora' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Histórico de execuções' })).toBeNull();
    // reconhecer e adiar continuam disponíveis para membros
    expect(screen.getByRole('button', { name: /Reconhecer:/ })).toHaveProperty('disabled', false);
  });

  it('open_route navega no app, sem confirmação e sem chamar o servidor', () => {
    const f = finding({ id: 'r1', rule_id: 'provider.free_not_connected', title: 'Conecte o Google Search Console', fix_action: { type: 'open_route', params: { route: '/nexus/motores', tab: 'all' } } });
    const p = mount(overview([f]), { canAdmin: true });
    fireEvent.click(screen.getByRole('button', { name: `Abrir tela: ${f.title}` }));
    expect(p.onOpenRoute).toHaveBeenCalledWith('/nexus/motores', 'all');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(p.onApplyFix).not.toHaveBeenCalled();
  });

  it('visão cliente: nem a navegação open_route aparece como botão', () => {
    const f = finding({ id: 'r2', title: 'Conecte o Search Console', fix_action: { type: 'open_route', params: { route: '/nexus/motores', tab: 'all' } } });
    mount(overview([f]), { canAdmin: false });
    expect(screen.queryByRole('button', { name: /Abrir tela/ })).toBeNull();
  });

  it('reconhecer e reabrir chamam onUpdate com o status certo', async () => {
    const f = finding();
    const p = mount(overview([f, finding({ id: 'ack', title: 'Outro', status: 'acknowledged', severity: 'low' })]));
    fireEvent.click(screen.getByRole('button', { name: `Reconhecer: ${f.title}` }));
    await waitFor(() => expect(p.onUpdate).toHaveBeenCalledWith('f1', { status: 'acknowledged' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir: Outro' }));
    await waitFor(() => expect(p.onUpdate).toHaveBeenCalledWith('ack', { status: 'open' }));
    expect(within(screen.getByTestId('finding-ack')).getByText('Reconhecido')).toBeTruthy();
  });

  it('adiar por 1 h, 24 h e 7 d envia snoozeHours 1, 24 e 168', async () => {
    const f = finding();
    const p = mount(overview([f]));
    for (const [label, n] of [['1 hora', 1], ['24 horas', 2], ['7 dias', 3]] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Adiar por ${label}: ${f.title}` }));
      await waitFor(() => expect(p.onUpdate).toHaveBeenCalledTimes(n));
      await waitFor(() => expect(screen.getByRole('button', { name: `Adiar por ${label}: ${f.title}` })).toHaveProperty('disabled', false));
    }
    expect(p.onUpdate).toHaveBeenNthCalledWith(1, 'f1', { status: 'snoozed', snoozeHours: 1 });
    expect(p.onUpdate).toHaveBeenNthCalledWith(2, 'f1', { status: 'snoozed', snoozeHours: 24 });
    expect(p.onUpdate).toHaveBeenNthCalledWith(3, 'f1', { status: 'snoozed', snoozeHours: 168 });
  });

  it('achado adiado mostra até quando', () => {
    mount(overview([finding({ status: 'snoozed', snoozed_until: '2026-11-13T12:00:00Z' })]));
    expect(screen.getByText('Adiado')).toBeTruthy();
    expect(screen.getByText(/adiado até/)).toBeTruthy();
  });

  it('Auditar agora chama onRun; 429 vira mensagem em pt-BR', async () => {
    const p = mount(overview([finding()]), { onRun: vi.fn().mockRejectedValue(new Error('audit_rate_limited')) });
    fireEvent.click(screen.getByRole('button', { name: 'Auditar agora' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Aguarde um minuto/);
    expect(p.onRun).toHaveBeenCalledTimes(1);
  });

  it('estado vazio positivo quando não há achados abertos', () => {
    mount(overview([]));
    expect(screen.getByText('Nenhum achado aberto.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Corretivas/ })).toBeNull();
  });

  it('resolvidos dos últimos 7 dias ficam recolhidos e não contam como abertos', () => {
    mount(overview([finding({ id: 'r', status: 'resolved', title: 'Já resolvido' })]));
    expect(screen.getByText('Nenhum achado aberto.')).toBeTruthy();
    expect(screen.getByText('Resolvidos nos últimos 7 dias (1)')).toBeTruthy();
    expect(screen.getByText(/Já resolvido/)).toBeTruthy();
  });

  it('histórico de execuções com origem e resultado em texto', () => {
    mount(overview([]));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Agendada')).toBeTruthy();
    expect(within(table).getByText('Manual')).toBeTruthy();
    expect(within(table).getByText('Concluída')).toBeTruthy();
    expect(within(table).getByText('Parcial')).toBeTruthy();
  });

  it('sem nenhuma execução ainda', () => {
    mount(overview([], { last_run: null, runs: [] }));
    expect(screen.getByTestId('audit-strip').textContent).toBe('Nenhuma auditoria executada ainda.');
    expect(screen.getByText('Nenhuma execução registrada.')).toBeTruthy();
  });

  it('carregando e erro', () => {
    const { unmount } = render(<AuditView overview={undefined} loading error={null} now={NOW} canAdmin running={false} onRun={vi.fn()} onUpdate={vi.fn()} onApplyFix={vi.fn()} onOpenRoute={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByLabelText('Carregando a auditoria')).toBeTruthy();
    unmount();
    const onRetry = vi.fn();
    render(<AuditView overview={undefined} loading={false} error={new Error('operation_failed')} now={NOW} canAdmin running={false} onRun={vi.fn()} onUpdate={vi.fn()} onApplyFix={vi.fn()} onOpenRoute={vi.fn()} onRetry={onRetry} />);
    expect(screen.getByText(/Falha inesperada no servidor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
