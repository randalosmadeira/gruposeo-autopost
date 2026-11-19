import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProfilePayload } from '@/lib/profile-api';

const api = vi.hoisted(() => ({ callAgent: vi.fn() }));
vi.mock('@/lib/profile-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/profile-api')>('@/lib/profile-api');
  return { ...actual, callAgent: api.callAgent };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { ProfileChat } from '@/components/profile/ProfileChat';
import { ProfileError } from '@/lib/profile-api';

const PID = '11111111-1111-4111-8111-111111111111';
const payload = (over: Partial<ProfilePayload> = {}): ProfilePayload => ({
  project: { id: PID, name: 'Loja', domain: null, organization_id: 'o1' }, role: 'owner', can_write: true, can_private: true, can_modules: true,
  strategy: { data: {}, version: 2, status: 'draft' }, legacy_strategy: {},
  extended: { version: 3, sections: {}, status: 'draft', completeness: 0, updated_at: null, confirmed_at: null },
  private: { version: 1, finance: {}, goals: {} }, snapshots: [], modules: { catalog: [], decisions: [] }, ...over,
});
const vazio = { conversation_id: null, messages: [], facts: [], turns_left: 40 };

function mount(over: { payload?: ProfilePayload; hasUnsaved?: boolean; onProfileUpdated?: (p: ProfilePayload) => void } = {}) {
  return render(<ProfileChat projectId={PID} payload={over.payload ?? payload()} hasUnsaved={over.hasUnsaved ?? false} onProfileUpdated={over.onProfileUpdated ?? vi.fn()} />);
}

beforeEach(() => api.callAgent.mockReset());
afterEach(cleanup);

describe('conversa com a Zica (tela)', () => {
  it('carrega o histórico, mostra as mensagens e os fatos a confirmar', async () => {
    api.callAgent.mockResolvedValueOnce({
      conversation_id: 'c1', turns_left: 38,
      messages: [{ role: 'user', content: 'Vendo roupas' }, { role: 'agent', content: 'Legal! Para quem?' }],
      facts: [{ fact_id: 'f1', key: 'offer', label: 'O que a empresa faz, em uma frase', value: 'Vendo roupas', quote: 'Vendo roupas' }],
    });
    mount();
    expect(await screen.findByText('Legal! Para quem?')).toBeTruthy();
    expect(screen.getByText(/Você disse: “Vendo roupas”/)).toBeTruthy();
    expect(screen.getByText(/38 mensagens restantes/)).toBeTruthy();
    expect(api.callAgent).toHaveBeenCalledWith('history', { projectId: PID });
  });

  it('envia a mensagem, mostra a resposta e os novos fatos; nada vai ao perfil sozinho', async () => {
    api.callAgent.mockResolvedValueOnce(vazio);
    const onUpdated = vi.fn();
    mount({ onProfileUpdated: onUpdated });
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.change(screen.getByLabelText('Mensagem para a Zica'), { target: { value: 'Tenho uma loja há dois anos' } });
    api.callAgent.mockResolvedValueOnce({ conversation_id: 'c1', reply: 'Que bom! Onde vende?', turns_left: 39, rejected: [], items: [{ fact_id: 'f9', key: 'anos', label: 'Anos de mercado', value: 2, quote: 'há dois anos', private: true }] });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para a Zica' }));
    expect(await screen.findByText('Que bom! Onde vende?')).toBeTruthy();
    expect(screen.getByText(/Anos de mercado:/)).toBeTruthy();
    expect(screen.getByText('privado')).toBeTruthy();
    expect(api.callAgent).toHaveBeenLastCalledWith('turn', { projectId: PID, conversationId: undefined, message: 'Tenho uma loja há dois anos' });
    expect((screen.getByLabelText('Mensagem para a Zica') as HTMLTextAreaElement).value).toBe('');
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('"Usar no perfil" confirma o fato com as versões atuais e devolve o perfil novo à tela', async () => {
    api.callAgent.mockResolvedValueOnce({ ...vazio, facts: [{ fact_id: 'f1', key: 'offer', label: 'O que a empresa faz, em uma frase', value: 'Vendo roupas', quote: 'Vendo roupas' }] });
    const onUpdated = vi.fn();
    mount({ onProfileUpdated: onUpdated });
    await screen.findByText(/O que a empresa faz, em uma frase:/);
    const novo = payload({ strategy: { data: { offer: 'Vendo roupas' }, version: 3, status: 'draft' } });
    api.callAgent.mockResolvedValueOnce({ ...novo, fact_id: 'f1' });
    fireEvent.click(screen.getByRole('button', { name: 'Usar no perfil' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ strategy: expect.objectContaining({ version: 3 }) })));
    expect(api.callAgent).toHaveBeenLastCalledWith('decide', { projectId: PID, factId: 'f1', decision: 'accept', expected: { strategy: 2, extended: 3, private: 1 } });
    expect(screen.queryByRole('button', { name: 'Usar no perfil' })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/foi para o perfil/);
  });

  it('"Ignorar" só descarta o fato; o perfil não é tocado', async () => {
    api.callAgent.mockResolvedValueOnce({ ...vazio, facts: [{ fact_id: 'f1', key: 'offer', label: 'Oferta', value: 'x' }] });
    const onUpdated = vi.fn();
    mount({ onProfileUpdated: onUpdated });
    await screen.findByText(/Oferta:/);
    api.callAgent.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Ignorar' }));
    await waitFor(() => expect(screen.queryByText(/Oferta:/)).toBeNull());
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('conflito de versão ao aceitar: avisa e mantém o fato', async () => {
    api.callAgent.mockResolvedValueOnce({ ...vazio, facts: [{ fact_id: 'f1', key: 'offer', label: 'Oferta', value: 'x' }] });
    mount();
    await screen.findByText(/Oferta:/);
    api.callAgent.mockRejectedValueOnce(new ProfileError('profile_changed_reload'));
    fireEvent.click(screen.getByRole('button', { name: 'Usar no perfil' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/mudou em outra tela/));
    expect(screen.getByText(/Oferta:/)).toBeTruthy();
  });

  it('com alterações não salvas nas etapas, "Usar no perfil" fica bloqueado com aviso', async () => {
    api.callAgent.mockResolvedValueOnce({ ...vazio, facts: [{ fact_id: 'f1', key: 'offer', label: 'Oferta', value: 'x' }] });
    mount({ hasUnsaved: true });
    await screen.findByText(/Oferta:/);
    expect((screen.getByRole('button', { name: 'Usar no perfil' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Salve antes de usar um fato/)).toBeTruthy();
  });

  it.each([
    ['budget_paused', /execução paga está pausada/],
    ['provider_not_enabled', /não foi liberada/],
    ['pricing_not_configured', /custo da conversa/],
    ['turn_limit_reached', /limite de mensagens/],
    ['agent_turn_failed', /continua na caixa/],
  ])('erro %s vira mensagem clara e a mensagem digitada NÃO se perde', async (code, re) => {
    api.callAgent.mockResolvedValueOnce(vazio);
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.change(screen.getByLabelText('Mensagem para a Zica'), { target: { value: 'meu texto importante' } });
    api.callAgent.mockRejectedValueOnce(new ProfileError(code));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para a Zica' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(re));
    expect((screen.getByLabelText('Mensagem para a Zica') as HTMLTextAreaElement).value).toBe('meu texto importante');
  });

  it('apagar a conversa pede confirmação na própria tela e limpa as mensagens', async () => {
    api.callAgent.mockResolvedValueOnce({ conversation_id: 'c1', turns_left: 30, messages: [{ role: 'user', content: 'oi' }], facts: [] });
    mount();
    await screen.findByText('oi');
    fireEvent.click(screen.getByRole('button', { name: 'Apagar conversa' }));
    expect(api.callAgent).toHaveBeenCalledTimes(1); // ainda não apagou
    api.callAgent.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Apagar de vez' }));
    await waitFor(() => expect(screen.queryByText('oi')).toBeNull());
    expect(api.callAgent).toHaveBeenLastCalledWith('delete_conversation', { projectId: PID, conversationId: 'c1' });
  });

  it('visualizador só lê: sem caixa de texto e sem botões de decisão', async () => {
    api.callAgent.mockResolvedValueOnce({ ...vazio, facts: [{ fact_id: 'f1', key: 'offer', label: 'Oferta', value: 'x' }] });
    mount({ payload: payload({ role: 'viewer', can_write: false, can_private: false }) });
    await screen.findByText(/Oferta:/);
    expect(screen.queryByLabelText('Mensagem para a Zica')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Usar no perfil' })).toBeNull();
    expect(screen.getByText(/permite ler, mas não conversar/)).toBeTruthy();
  });

  it('o texto da Zica é mostrado como texto, nunca como HTML', async () => {
    api.callAgent.mockResolvedValueOnce({ conversation_id: 'c1', turns_left: 30, messages: [{ role: 'agent', content: '<img src=x onerror=alert(1)><b>negrito</b>' }], facts: [] });
    const { container } = mount();
    await screen.findByText(/negrito/);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
