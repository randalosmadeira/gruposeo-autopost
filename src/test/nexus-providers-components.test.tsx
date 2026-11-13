import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConnectDialog } from '@/components/nexus-providers/ConnectDialog';
import { DocsSheet } from '@/components/nexus-providers/DocsSheet';
import { ExecutionPanel } from '@/components/nexus-providers/ExecutionPanel';
import { GuidedActivationCard } from '@/components/nexus-providers/GuidedActivationCard';
import { HealthStrip, LiveIndicator } from '@/components/nexus-providers/HealthStrip';
import { ProviderCard } from '@/components/nexus-providers/ProviderCard';
import { SearchTrafficView } from '@/components/nexus-providers/SearchTrafficTab';
import { emptyOverviewItem } from '@/lib/nexus-providers';
import type {
  ProviderId, ProviderOverviewItem, ProviderProgram, ProvidersOverview, SearchPerformanceSummary, StoreCredentialResult,
} from '@/types/nexus-providers';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }));

beforeAll(() => {
  // recharts (ResponsiveContainer) precisa de ResizeObserver, ausente no jsdom.
  class RO { observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const NOW = new Date('2026-11-12T12:00:00Z').getTime();
function item(id: ProviderId, over: Partial<ProviderOverviewItem> = {}): ProviderOverviewItem {
  return { ...emptyOverviewItem(id), ...over };
}
const stored = { stored: true, last_four: '1234', status: 'active', updated_at: '2026-11-12T10:00:00Z' };
const healthy = (id: ProviderId): ProviderOverviewItem => item(id, {
  status: 'healthy', score: 92, credential: stored,
  health: { last: { checked_at: '2026-11-12T11:59:00Z', ok: true, latency_ms: 320, http_status: 200, detail: null, quota: { label: 'créditos', remaining: 900, limit: 1000 }, cost_micros: 0 }, checks_7d: 7, ok_7d: 7, avg_latency_ms_7d: 300 },
  usage: { valid_30d: 12, failed_30d: 1, uncertain_30d: 0, last_success_at: '2026-11-12T11:00:00Z' },
});

function renderCard(it: ProviderOverviewItem, over: Partial<Parameters<typeof ProviderCard>[0]> = {}) {
  const props = {
    item: it, now: NOW, canAdmin: true,
    onConnect: vi.fn(), onTest: vi.fn(), onDocs: vi.fn(), onRemove: vi.fn(), onOpenObservatory: vi.fn(), ...over,
  };
  render(<ProviderCard {...props} />);
  return props;
}

describe('ProviderCard: estados', () => {
  it('sem credencial: Conectar habilitado, Testar desabilitado, sem remover', () => {
    renderCard(item('openai'));
    expect(screen.getByText('Não configurado')).toBeTruthy();
    expect(screen.getByText('sem credencial')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Conectar:/ })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: /^Testar conexão:/ })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: /^Remover chave:/ })).toBeNull();
    expect(screen.getByText('Pontuação de qualidade').nextElementSibling?.textContent).toBe('—');
  });

  it('guardada sem teste: mostra …last_four e orienta a testar', () => {
    renderCard(item('openai', { status: 'stored_unverified', credential: stored }));
    expect(screen.getByText('Guardada, sem teste')).toBeTruthy();
    expect(screen.getByText('guardada …1234')).toBeTruthy();
    expect(screen.getByText(/ainda sem teste/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Trocar chave:/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Testar conexão:/ })).toHaveProperty('disabled', false);
  });

  it('saudável: pontuação, latência, taxa de sucesso, quota e uso', () => {
    renderCard(healthy('openai'));
    expect(screen.getByText('Saudável')).toBeTruthy();
    expect(screen.getByText('92/100')).toBeTruthy();
    expect(screen.getByText('320 ms')).toBeTruthy();
    expect(screen.getByText('100% (7/7)')).toBeTruthy();
    expect(screen.getByText('créditos: 900 de 1.000 restantes')).toBeTruthy();
    expect(screen.getByText('há 1 min')).toBeTruthy();
    expect(screen.getByText('12 válidas · 1 falhas · 0 incertas')).toBeTruthy();
    expect(screen.getByText(/Custo de referência:/).parentElement?.textContent).toContain('Valores de referência — confirmar no site do provedor.');
  });

  it('com atenção: explica que o último teste passou mas há sinais de atenção', () => {
    renderCard({ ...healthy('gemini'), status: 'degraded', score: 61 });
    expect(screen.getByText('Com atenção')).toBeTruthy();
    expect(screen.getByText(/sinais de atenção/)).toBeTruthy();
  });

  it('com erro: mostra a mensagem do 401 e não só a cor', () => {
    renderCard(item('anthropic', {
      status: 'error', score: 20, credential: { ...stored, status: 'invalid' },
      health: { last: { checked_at: '2026-11-12T11:59:00Z', ok: false, latency_ms: 90, http_status: 401, detail: 'unauthorized', cost_micros: 0 }, checks_7d: 3, ok_7d: 0, avg_latency_ms_7d: 90 },
    }));
    expect(screen.getByText('Com erro')).toBeTruthy();
    expect(screen.getByRole('status', { name: '' }).textContent).toMatch(/recusou a credencial \(HTTP 401\)/);
    expect(screen.getByText('0% (0/3)')).toBeTruthy();
  });

  it('manual (Copilot): sem Conectar/Testar e com atalho para o Observatório', () => {
    const p = renderCard(item('copilot'));
    expect(screen.getAllByText('Manual').length).toBeGreaterThanOrEqual(2); // categoria e selo de status
    expect(screen.queryByRole('button', { name: /Conectar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Testar conexão/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Abrir o Observatório/ }));
    expect(p.onOpenObservatory).toHaveBeenCalledTimes(1);
  });

  it('Contratar abre em nova aba com rel seguro', () => {
    renderCard(item('openai'));
    const link = screen.getByRole('link', { name: /Contratar/ });
    expect(link.getAttribute('href')).toBe('https://platform.openai.com/api-keys');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('Brave ressalta que o plano gratuito acabou e a cobrança é por crédito', () => {
    renderCard(item('brave'));
    expect(screen.getByText(/plano gratuito fixo da Brave acabou/)).toBeTruthy();
    expect(screen.getByText(/cobrança agora é por crédito/)).toBeTruthy();
  });

  it('botões Conectar e Documentação chamam os callbacks', () => {
    const p = renderCard(item('openai'));
    fireEvent.click(screen.getByRole('button', { name: /^Conectar:/ }));
    expect(p.onConnect).toHaveBeenCalledWith('openai');
    fireEvent.click(screen.getByRole('button', { name: /^Documentação:/ }));
    expect(p.onDocs).toHaveBeenCalledWith('openai');
  });

  it('indicador de teste em andamento', () => {
    renderCard(healthy('openai'), { testing: true });
    expect(screen.getByRole('button', { name: /^Testar conexão:/ })).toHaveProperty('disabled', true);
    expect(screen.getByText('Testando…')).toBeTruthy();
  });

  it('habilitado para execução paga aparece como selo', () => {
    renderCard({ ...healthy('openai'), enabled: true });
    expect(screen.getByText('Habilitado para execução paga')).toBeTruthy();
  });
});

describe('ProviderCard: teste gratuito, teste com custo e remoção', () => {
  it('provedor gratuito testa direto, sem diálogo', () => {
    const p = renderCard(healthy('openai'));
    fireEvent.click(screen.getByRole('button', { name: /^Testar conexão:/ }));
    expect(p.onTest).toHaveBeenCalledWith('openai', { confirmCost: false });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it.each([['serper', '0,001'], ['brave', '0,005'], ['perplexity', '0,005']] as const)('%s pede confirmação de custo e só testa depois', async (id, price) => {
    const p = renderCard(healthy(id));
    fireEvent.click(screen.getByRole('button', { name: /^Testar conexão:/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain(`Este teste consome 1 consulta (~US$ ${price}). Continuar?`);
    expect(dialog.textContent).toContain('Valores de referência — confirmar no site do provedor.');
    expect(p.onTest).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar e testar' }));
    expect(p.onTest).toHaveBeenCalledWith(id, { confirmCost: true });
  });

  it('cancelar o diálogo de custo não testa', async () => {
    const p = renderCard(healthy('serper'));
    fireEvent.click(screen.getByRole('button', { name: /^Testar conexão:/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(p.onTest).not.toHaveBeenCalled();
  });

  it('remover pede confirmação; só depois chama onRemove', async () => {
    const p = renderCard(healthy('openai'));
    fireEvent.click(screen.getByRole('button', { name: /^Remover chave:/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/apagada do cofre/);
    expect(p.onRemove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover chave' }));
    expect(p.onRemove).toHaveBeenCalledWith('openai');
  });

  it('remover fica desabilitado para quem não é dono/admin', () => {
    renderCard(healthy('openai'), { canAdmin: false });
    expect(screen.getByRole('button', { name: /^Remover chave:/ })).toHaveProperty('disabled', true);
  });
});

describe('DocsSheet', () => {
  it('abre com passo a passo, formato, endpoints, custo e erros comuns', () => {
    render(<DocsSheet providerId="serper" onClose={() => undefined} />);
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText('Serper')).toBeTruthy();
    expect(within(dlg).getByText('Passo a passo')).toBeTruthy();
    expect(within(dlg).getByText('Formato da credencial')).toBeTruthy();
    expect(within(dlg).getByText(/POST https:\/\/google\.serper\.dev\/search/)).toBeTruthy();
    expect(within(dlg).getByText('Erros comuns')).toBeTruthy();
    expect(within(dlg).getByText(/Valores de referência — confirmar no site do provedor\./)).toBeTruthy();
    const links = within(dlg).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('https://serper.dev');
    within(dlg).getAllByRole('link').forEach((a) => expect(a.getAttribute('rel')).toBe('noopener noreferrer'));
  });

  it('Brave: aviso de que o plano gratuito acabou na gaveta', () => {
    render(<DocsSheet providerId="brave" onClose={() => undefined} />);
    expect(screen.getAllByText(/plano gratuito fixo da Brave acabou/).length).toBeGreaterThan(0);
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://api-dashboard.search.brave.com/documentation/guides/rate-limiting');
  });

  it('fechada quando não há provedor', () => {
    render(<DocsSheet providerId={null} onClose={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ConnectDialog', () => {
  const OK: StoreCredentialResult = { success: true, status: 'active', last_four: 'wxyz', health: { provider: 'openai', ok: true, latency_ms: 300, http_status: 200, cost_micros: 0 } };
  const SECRET = 'sk-TESTE-0123456789abcdefwxyz';

  function open(id: ProviderId = 'openai', over: Partial<Parameters<typeof ConnectDialog>[0]> = {}) {
    const props = { providerId: id, onClose: vi.fn(), onSubmit: vi.fn().mockResolvedValue(OK), ...over };
    render(<ConnectDialog {...props} />);
    return props;
  }
  const field = () => screen.getByLabelText('Chave de API') as HTMLInputElement;

  it('campo é type=password, sem autocomplete de senha salva, com dica e link da chave', () => {
    open();
    expect(field().type).toBe('password');
    expect(field().getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByText('A chave da OpenAI começa com "sk-".')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Onde encontro minha chave\?/ });
    expect(link.getAttribute('href')).toBe('https://platform.openai.com/api-keys');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByRole('button', { name: 'Guardar e testar' })).toHaveProperty('disabled', true);
  });

  it('valida o formato no cliente e NÃO chama o servidor', async () => {
    const p = open();
    fireEvent.change(field(), { target: { value: 'chave-errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A chave da OpenAI começa com "sk-".');
    expect(p.onSubmit).not.toHaveBeenCalled();
  });

  it('envia o segredo, limpa o campo e mostra o resultado do teste sem exibir o segredo', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug')];
    const p = open();
    fireEvent.change(field(), { target: { value: `  ${SECRET}  ` } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    await screen.findByText(/Credencial guardada/);
    expect(p.onSubmit).toHaveBeenCalledWith('openai', `  ${SECRET}  `); // o servidor normaliza; o cliente só repassa
    expect(screen.getByText(/termina em …wxyz/)).toBeTruthy();
    expect(screen.getByText('Teste gratuito: ok')).toBeTruthy();
    expect(screen.getByText('Conexão confirmada.')).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
    logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('teste gratuito que falha com 401 mostra a orientação', async () => {
    open('openai', { onSubmit: vi.fn().mockResolvedValue({ success: true, status: 'invalid', last_four: 'wxyz', health: { provider: 'openai', ok: false, http_status: 401 } }) });
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    expect(await screen.findByText('Teste gratuito: falhou')).toBeTruthy();
    expect(screen.getByText(/recusou a credencial \(HTTP 401\)/)).toBeTruthy();
    expect(screen.getByText('Situação da credencial: recusada pelo provedor')).toBeTruthy();
  });

  it('erro secret_format_invalid do servidor vira mensagem com a dica e o campo é limpo', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('secret_format_invalid:Comece com sk-.'));
    open('openai', { onSubmit });
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A credencial não está no formato esperado. Comece com sk-.');
    expect(field().value).toBe('');
  });

  it('mostra "validando" enquanto o servidor responde e bloqueia duplo envio', async () => {
    let resolve: (v: StoreCredentialResult) => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<StoreCredentialResult>((r) => { resolve = r; }));
    open('openai', { onSubmit });
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    expect(await screen.findByText('Validando e guardando…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Guardar e testar/ })).toHaveProperty('disabled', true);
    resolve(OK);
    await screen.findByText(/Credencial guardada/);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('provedor só com teste pago explica que o teste é separado e pede confirmação', async () => {
    open('serper', { onSubmit: vi.fn().mockResolvedValue({ success: true, status: 'stored_unverified', last_four: 'abcd', health: null }) });
    fireEvent.change(screen.getByLabelText('Chave de API'), { target: { value: 'a'.repeat(20) } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    expect(await screen.findByText(/só tem teste com custo/)).toBeTruthy();
  });

  it('troca de chave mostra apenas …last_four atual', () => {
    open('openai', { currentLastFour: '9876' });
    expect(screen.getByText(/Chave atual: …9876/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Trocar chave: OpenAI/ })).toBeTruthy();
  });

  it('GSC: textarea do JSON mascarado, passo a passo e Sincronizar agora após salvar', async () => {
    const onSyncNow = vi.fn().mockResolvedValue('Google Search Console: 10 linha(s) gravada(s)');
    const sa = JSON.stringify({ type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nSEGREDO\n-----END PRIVATE KEY-----\n' });
    const onSubmit = vi.fn().mockResolvedValue({ success: true, status: 'active', last_four: 'e.co', health: { provider: 'gsc', ok: true } });
    open('gsc', { onSubmit, onSyncNow, canSync: true });
    const area = screen.getByLabelText('JSON da conta de serviço') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.style.getPropertyValue('-webkit-text-security') || (area.style as unknown as Record<string, string>).WebkitTextSecurity).toBeTruthy();
    expect(screen.getByText(/adicione o e-mail da conta de serviço/)).toBeTruthy();
    fireEvent.change(area, { target: { value: sa } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    await screen.findByText(/Credencial guardada/);
    expect(document.body.innerHTML).not.toContain('SEGREDO');
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar agora/ }));
    expect(await screen.findByText('Google Search Console: 10 linha(s) gravada(s)')).toBeTruthy();
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  it('GSC com JSON inválido é recusado antes de enviar', async () => {
    const p = open('gsc');
    fireEvent.change(screen.getByLabelText('JSON da conta de serviço'), { target: { value: '{ nao json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar e testar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/JSON completo da conta de serviço/);
    expect(p.onSubmit).not.toHaveBeenCalled();
  });

  it('cancelar descarta o que foi digitado', () => {
    const p = open();
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(p.onClose).toHaveBeenCalled();
  });

  it('Brave: aviso de custo dentro do diálogo', () => {
    open('brave');
    expect(screen.getByText(/plano gratuito fixo da Brave acabou/)).toBeTruthy();
  });
});

describe('ExecutionPanel', () => {
  const off: ProviderProgram = { execution_enabled: false, budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0, providers_enabled: [] };
  function mount(over: Partial<Parameters<typeof ExecutionPanel>[0]> = {}) {
    const props = { program: off, connected: ['openai', 'serper'] as ProviderId[], canAdmin: true, onSave: vi.fn().mockResolvedValue(undefined), onDisableAll: vi.fn().mockResolvedValue(undefined), ...over };
    render(<ExecutionPanel {...props} />);
    return props;
  }
  const release = () => screen.getByRole('button', { name: /Liberar execução paga|Salvar e manter ligada/ });

  it('começa DESLIGADA, em destaque, com o texto do portão e "Desligar tudo" visível', () => {
    mount();
    expect(screen.getByTestId('exec-state').textContent).toContain('Execução paga DESLIGADA');
    expect(screen.getByText('Nenhuma chamada paga acontece sem este painel ligado, sem orçamento e sem o provedor habilitado.')).toBeTruthy();
    expect(release()).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Desligar tudo' })).toHaveProperty('disabled', false);
  });

  it('só habilita com orçamento > 0, ao menos um provedor e LIBERAR exato', () => {
    const p = mount();
    const budget = screen.getByLabelText(/Orçamento mensal/);
    const confirm = screen.getByLabelText(/Para liberar, digite LIBERAR/);
    fireEvent.change(budget, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /OpenAI/ }));
    fireEvent.change(confirm, { target: { value: 'LIBERAR' } });
    expect(release()).toHaveProperty('disabled', true); // orçamento zero
    expect(screen.getByText('O orçamento precisa ser maior que zero.')).toBeTruthy();
    fireEvent.change(budget, { target: { value: '5' } });
    expect(release()).toHaveProperty('disabled', false);
    fireEvent.change(confirm, { target: { value: 'liberar' } });
    expect(release()).toHaveProperty('disabled', true); // minúsculas não valem
    fireEvent.change(confirm, { target: { value: 'LIBERAR' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /OpenAI/ })); // desmarca
    expect(release()).toHaveProperty('disabled', true); // sem provedor
    expect(screen.getByText('Habilite ao menos um provedor conectado.')).toBeTruthy();
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('orçamento acima de US$ 200 é recusado', () => {
    mount();
    fireEvent.change(screen.getByLabelText(/Orçamento mensal/), { target: { value: '201' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /OpenAI/ }));
    fireEvent.change(screen.getByLabelText(/Para liberar/), { target: { value: 'LIBERAR' } });
    expect(release()).toHaveProperty('disabled', true);
  });

  it('libera enviando orçamento, provedores e a palavra de confirmação', async () => {
    const p = mount();
    fireEvent.change(screen.getByLabelText(/Orçamento mensal/), { target: { value: '5,5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /OpenAI/ }));
    fireEvent.change(screen.getByLabelText(/Para liberar/), { target: { value: 'LIBERAR' } });
    fireEvent.click(release());
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith({ executionEnabled: true, budgetUsd: 5.5, providersEnabled: ['openai'], confirm: 'LIBERAR' }));
    expect(await screen.findByText('Execução paga liberada com o orçamento e os provedores acima.')).toBeTruthy();
  });

  it('erro do servidor aparece em pt-BR', async () => {
    mount({ onSave: vi.fn().mockRejectedValue(new Error('forbidden')) });
    fireEvent.change(screen.getByLabelText(/Orçamento mensal/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /OpenAI/ }));
    fireEvent.change(screen.getByLabelText(/Para liberar/), { target: { value: 'LIBERAR' } });
    fireEvent.click(release());
    expect((await screen.findByRole('alert')).textContent).toMatch(/proprietário ou administrador/);
  });

  it('ligada: mostra gasto, reservado, orçamento e % comprometido; Desligar tudo chama onDisableAll', async () => {
    const on: ProviderProgram = { execution_enabled: true, budget_usd_micros: 10_000_000, reserved_usd_micros: 1_000_000, consumed_usd_micros: 2_000_000, providers_enabled: ['openai'] };
    const p = mount({ program: on });
    expect(screen.getByTestId('exec-state').textContent).toContain('Execução paga LIGADA');
    expect(screen.getByText('US$ 2,00')).toBeTruthy();
    expect(screen.getByText('US$ 1,00')).toBeTruthy();
    expect(screen.getByText('US$ 10,00')).toBeTruthy();
    expect(screen.getByText(/30% do orçamento comprometido/)).toBeTruthy();
    expect((screen.getByLabelText(/Orçamento mensal/) as HTMLInputElement).value).toBe('10');
    expect(screen.getByRole('checkbox', { name: /OpenAI/ }).getAttribute('data-state')).toBe('checked');
    fireEvent.click(screen.getByRole('button', { name: 'Desligar tudo' }));
    await waitFor(() => expect(p.onDisableAll).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Execução paga desligada/)).toBeTruthy();
  });

  it('modo leitura para quem não é dono/admin', () => {
    mount({ canAdmin: false });
    expect(screen.getByText(/Somente proprietário ou administrador da organização pode alterar/)).toBeTruthy();
    expect(screen.getByLabelText(/Orçamento mensal/)).toHaveProperty('disabled', true);
    expect(screen.getByLabelText(/Para liberar/)).toHaveProperty('disabled', true);
    expect(release()).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Desligar tudo' })).toHaveProperty('disabled', true);
  });

  it('sem provedores conectados não há o que habilitar', () => {
    mount({ connected: [] });
    expect(screen.getByText(/Nenhum provedor conectado ainda/)).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('HealthStrip, LiveIndicator e ativação guiada', () => {
  const overview: ProvidersOverview = {
    generated_at: '2026-11-12T12:00:00Z', organization_id: 'org-1',
    program: { execution_enabled: false, budget_usd_micros: 5_000_000, reserved_usd_micros: 0, consumed_usd_micros: 1_230_000, providers_enabled: [] },
    summary: { total: 11, connected: 2, healthy: 1, degraded: 0, error: 1, not_configured: 8, manual: 1, overall: 'attention', score: 71.4 },
    providers: [],
  };

  it('faixa de saúde geral com semáforo em texto, contagens, custo, última verificação e botão', () => {
    const onTestAll = vi.fn();
    const items = [healthy('openai')];
    render(<HealthStrip overview={overview} items={items} now={NOW} updatedAt={NOW - 8000} realtime="live" testingAll={false} onTestAll={onTestAll} />);
    expect(screen.getByText('Saúde geral: Atenção')).toBeTruthy();
    expect(screen.getByText('Pontuação média 71/100')).toBeTruthy();
    expect(screen.getByTestId('health-strip-text').textContent).toBe(
      '2 de 11 conectados · 1 saudável · 0 com atenção · 1 com erro · custo do mês US$ 1,23 de US$ 5,00 · última verificação há 1 min',
    );
    expect(screen.getByText('Atualizado há 8 s')).toBeTruthy();
    expect(screen.getByTestId('live-indicator').textContent).toBe('ao vivo');
    fireEvent.click(screen.getByRole('button', { name: 'Testar todas as conexões (gratuitas)' }));
    expect(onTestAll).toHaveBeenCalledTimes(1);
  });

  it('indicador: verde "ao vivo" conectado, âmbar com polling', () => {
    const { rerender } = render(<LiveIndicator state="live" />);
    expect(screen.getByTestId('live-indicator').getAttribute('data-state')).toBe('live');
    rerender(<LiveIndicator state="polling" />);
    expect(screen.getByTestId('live-indicator').textContent).toBe('atualiza a cada 60 s');
    expect(screen.getByTestId('live-indicator').className).toMatch(/amber/);
    rerender(<LiveIndicator state="connecting" />);
    expect(screen.getByTestId('live-indicator').textContent).toMatch(/conectando/);
  });

  it('botão de testar todas fica desabilitado sem conexões', () => {
    render(<HealthStrip overview={{ ...overview, summary: { ...overview.summary, connected: 0 } }} items={[]} now={NOW} updatedAt={0} realtime="polling" testingAll={false} onTestAll={() => undefined} />);
    expect(screen.getByRole('button', { name: /Testar todas/ })).toHaveProperty('disabled', true);
  });

  it('ativação guiada: passos pendentes, Conectar e sincronização desabilitada sem credencial', () => {
    const onConnect = vi.fn();
    render(<GuidedActivationCard items={[item('gsc'), item('bing_webmaster')]} lastSyncedAt={null} now={NOW} canAdmin testingId={null} syncing={false} syncText={null}
      onConnect={onConnect} onTest={vi.fn()} onSync={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Ativação guiada dos gratuitos' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar: Google Search Console API' }));
    expect(onConnect).toHaveBeenCalledWith('gsc');
    fireEvent.click(screen.getByRole('button', { name: 'Conectar: Bing Webmaster Tools API' }));
    expect(onConnect).toHaveBeenCalledWith('bing_webmaster');
    expect(screen.getByRole('button', { name: /Sincronizar agora/ })).toHaveProperty('disabled', true);
    expect(screen.getAllByText(/Pendente:/).length).toBeGreaterThanOrEqual(5);
  });

  it('ativação guiada: credencial guardada permite testar e sincronizar; mostra resultado do teste', () => {
    const onTest = vi.fn();
    const onSync = vi.fn();
    const gsc = item('gsc', { status: 'error', credential: stored, health: { last: { checked_at: '2026-11-12T11:59:00Z', ok: false, http_status: 403, cost_micros: 0 }, checks_7d: 1, ok_7d: 0, avg_latency_ms_7d: 50 } });
    render(<GuidedActivationCard items={[gsc, item('bing_webmaster')]} lastSyncedAt="2026-11-12T11:00:00Z" now={NOW} canAdmin testingId={null} syncing={false} syncText="Google Search Console: 10 linha(s) gravada(s)"
      onConnect={vi.fn()} onTest={onTest} onSync={onSync} />);
    expect(screen.getByText(/recusou a credencial \(HTTP 403\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Testar conexão: Google Search Console API' }));
    expect(onTest).toHaveBeenCalledWith('gsc');
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar agora/ }));
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/concluída há 1 h/)).toBeTruthy();
    expect(screen.getByText('Google Search Console: 10 linha(s) gravada(s)')).toBeTruthy();
  });
});

describe('SearchTrafficView', () => {
  const summary: SearchPerformanceSummary = {
    totals: { clicks: 1234, impressions: 56789, ctr: 0.0217, position: 8.34 },
    daily: [{ day: '2026-11-10', clicks: 10, impressions: 400, position: 9.1 }, { day: '2026-11-11', clicks: 12, impressions: 420, position: 8.8 }],
    top_queries: [{ query: 'advogado criminalista sp', clicks: 50, impressions: 900, ctr: 0.0555, position: 4.2 }],
    top_pages: [{ page: 'https://exemplo.com.br/defesa', clicks: 30, impressions: 700, ctr: 0.04, position: 5.5 }],
    by_country: [{ country: 'bra', clicks: 1200, impressions: 55000 }],
    by_device: [{ device: 'MOBILE', clicks: 900, impressions: 40000 }, { device: 'DESKTOP', clicks: 334, impressions: 16789 }],
    last_synced_at: '2026-11-12T11:00:00Z',
  };
  function view(over: Partial<Parameters<typeof SearchTrafficView>[0]> = {}) {
    const props = {
      summary, loading: false, error: null, hasCredentials: true, now: NOW, days: 28, onDaysChange: vi.fn(), canAdmin: true, syncing: false, syncText: null,
      onSync: vi.fn(), onConnectGsc: vi.fn(), onRetry: vi.fn(), ...over,
    };
    render(<SearchTrafficView {...props} />);
    return props;
  }

  it('KPIs, tabelas, última sincronização e botão Sincronizar agora', () => {
    const p = view();
    expect(screen.getByTestId('kpi-clicks').textContent).toBe('1.234');
    expect(screen.getByTestId('kpi-impressions').textContent).toBe('56.789');
    expect(screen.getByTestId('kpi-ctr').textContent).toBe('2,2%');
    expect(screen.getByTestId('kpi-position').textContent).toBe('8,3');
    expect(screen.getByTestId('last-synced').textContent).toBe('Última sincronização: há 1 h');
    expect(screen.getByText('advogado criminalista sp')).toBeTruthy();
    expect(screen.getByText('https://exemplo.com.br/defesa')).toBeTruthy();
    expect(screen.getByText('BRA')).toBeTruthy();
    expect(screen.getByText('Celular')).toBeTruthy();
    expect(screen.getByText('Computador')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Cliques e impressões por dia, 2 dias/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar agora/ }));
    expect(p.onSync).toHaveBeenCalledTimes(1);
  });

  it('sem conta conectada mostra o passo a passo e o botão de conectar', () => {
    const p = view({ hasCredentials: false, summary: undefined });
    expect(screen.getByText(/Conecte uma conta de serviço do Google/)).toBeTruthy();
    expect(screen.getByText(/adicione o e-mail da conta de serviço/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Conectar o Google Search Console/ }));
    expect(p.onConnectGsc).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Sincronizar agora/ })).toHaveProperty('disabled', true);
  });

  it('gsc_not_configured do servidor também mostra o passo a passo', () => {
    view({ error: new Error('gsc_not_configured'), summary: undefined });
    expect(screen.getByText(/Conecte uma conta de serviço do Google/)).toBeTruthy();
  });

  it('sem dados: estado vazio explicativo', () => {
    view({ summary: { ...summary, totals: { clicks: 0, impressions: 0, ctr: null, position: null }, daily: [], top_queries: [], top_pages: [], by_country: [], by_device: [], last_synced_at: null } });
    expect(screen.getByText(/Sem dados no período/)).toBeTruthy();
    expect(screen.getByTestId('kpi-ctr').textContent).toBe('—');
    expect(screen.getByTestId('last-synced').textContent).toBe('Última sincronização: nunca');
  });

  it('erro mostra mensagem em pt-BR e tenta de novo', () => {
    const p = view({ error: new Error('gsc_forbidden'), summary: undefined });
    expect(screen.getByRole('alert').textContent).toMatch(/conta de serviço não tem acesso à propriedade/);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(p.onRetry).toHaveBeenCalled();
  });

  it('não-admin não sincroniza', () => {
    view({ canAdmin: false });
    expect(screen.getByRole('button', { name: /Sincronizar agora/ })).toHaveProperty('disabled', true);
  });

  it('carregando mostra esqueleto acessível', () => {
    view({ loading: true, summary: undefined });
    expect(screen.getByLabelText('Carregando tráfego orgânico')).toBeTruthy();
  });
});
