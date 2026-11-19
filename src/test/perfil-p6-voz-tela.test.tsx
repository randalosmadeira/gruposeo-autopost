import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** Reconhecimento de voz falso: guarda as instâncias para o teste "falar" e "dar erro". */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = ''; continuous = false; interimResults = false;
  onresult: ((e: unknown) => void) | null = null; onerror: ((e: { error?: string }) => void) | null = null; onend: (() => void) | null = null;
  started = false; stopped = false; aborted = false;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; }
  say(parts: Array<{ text: string; final: boolean }>) {
    const results = parts.map((p) => Object.assign([{ transcript: p.text }], { isFinal: p.final }));
    this.onresult?.({ resultIndex: 0, results });
  }
}
const latest = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

function mount(over: { payload?: ProfilePayload } = {}) {
  return render(<ProfileChat projectId={PID} payload={over.payload ?? payload()} hasUnsaved={false} onProfileUpdated={vi.fn()} />);
}
const box = () => screen.getByLabelText('Mensagem para a Zica') as HTMLTextAreaElement;
const historyOnce = (over: Record<string, unknown> = {}) => api.callAgent.mockResolvedValueOnce({ ...vazio, ...over });

beforeEach(() => { api.callAgent.mockReset(); FakeRecognition.instances = []; (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition; });
afterEach(() => { cleanup(); delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition; });

async function concordar() {
  fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('checkbox'));
  api.callAgent.mockResolvedValueOnce({ conversation_id: 'c1', consent_audio: true });
  fireEvent.click(screen.getByRole('button', { name: 'Concordar e começar a ditar' }));
  await waitFor(() => expect(latest()?.started).toBe(true));
  return dialog;
}

describe('ditado por voz (P6)', () => {
  it('navegador sem reconhecimento de voz: nenhum botão de ditar e aviso de que dá para digitar', async () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    expect(screen.queryByRole('button', { name: 'Ditar por voz' })).toBeNull();
    expect(screen.getByText(/não oferece ditado por voz/)).toBeTruthy();
  });

  it('primeiro uso: mostra o aviso (voz vai ao serviço do navegador, a Zica não guarda áudio) e NÃO começa a ouvir sem o aceite', async () => {
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/Google ou da Microsoft/);
    expect(dialog.textContent).toMatch(/A Zica não recebe nem guarda o áudio/);
    expect(dialog.textContent).toMatch(/Você pode revogar/);
    expect((screen.getByRole('button', { name: 'Concordar e começar a ditar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(latest()).toBeUndefined();
    expect(api.callAgent.mock.calls.some((c) => c[0] === 'voice_consent')).toBe(false);
  });

  it('"Agora não" fecha o aviso sem registrar nada e sem ouvir', async () => {
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(latest()).toBeUndefined();
    expect(api.callAgent.mock.calls.some((c) => c[0] === 'voice_consent')).toBe(false);
  });

  it('aceitar registra o consentimento no servidor e só então começa a ouvir em português', async () => {
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    await concordar();
    expect(api.callAgent).toHaveBeenCalledWith('voice_consent', { projectId: PID, granted: true });
    expect(latest()).toMatchObject({ started: true, lang: 'pt-BR', continuous: true, interimResults: true });
    expect(screen.getByRole('button', { name: 'Parar de ditar' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('o que é falado vai para a caixa (nunca é enviado sozinho); o parcial aparece só como aviso', async () => {
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    await concordar();
    act(() => latest().say([{ text: 'tenho uma loja', final: true }, { text: 'de roupas', final: false }]));
    expect(box().value).toBe('tenho uma loja');
    expect(screen.getByText(/de roupas/)).toBeTruthy();
    act(() => latest().say([{ text: 'há dois anos', final: true }]));
    expect(box().value).toBe('tenho uma loja há dois anos');
    expect(api.callAgent.mock.calls.some((c) => c[0] === 'turn')).toBe(false);
  });

  it('enviar texto ditado manda viaVoice; texto só digitado não manda', async () => {
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    await concordar();
    act(() => latest().say([{ text: 'vendo roupas femininas', final: true }]));
    api.callAgent.mockResolvedValueOnce({ conversation_id: 'c1', reply: 'Que legal!', turns_left: 39, rejected: [], items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para a Zica' }));
    await screen.findByText('Que legal!');
    expect(api.callAgent).toHaveBeenLastCalledWith('turn', { projectId: PID, conversationId: 'c1', message: 'vendo roupas femininas', viaVoice: true });
    expect(latest().stopped).toBe(true); // parou de ouvir ao enviar
    fireEvent.change(box(), { target: { value: 'agora digitei' } });
    api.callAgent.mockResolvedValueOnce({ conversation_id: 'c1', reply: 'Ok', turns_left: 38, rejected: [], items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para a Zica' }));
    await screen.findByText('Ok');
    expect(api.callAgent).toHaveBeenLastCalledWith('turn', { projectId: PID, conversationId: 'c1', message: 'agora digitei' });
  });

  it('com o consentimento já registrado (vindo do histórico) começa a ouvir direto, sem novo aviso', async () => {
    historyOnce({ conversation_id: 'c9', consent_audio: true });
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    expect(latest()?.started).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Revogar consentimento de voz' })).toBeTruthy();
  });

  it('revogar para de ouvir, avisa o servidor e volta a pedir o aceite', async () => {
    historyOnce({ conversation_id: 'c9', consent_audio: true });
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    api.callAgent.mockResolvedValueOnce({ conversation_id: 'c9', consent_audio: false });
    fireEvent.click(screen.getByRole('button', { name: 'Revogar consentimento de voz' }));
    await waitFor(() => expect(api.callAgent).toHaveBeenLastCalledWith('voice_consent', { projectId: PID, granted: false }));
    expect(latest().stopped).toBe(true);
    expect(await screen.findByText(/Consentimento de voz revogado/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revogar consentimento de voz' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('parar de ditar interrompe o reconhecimento e mantém o texto', async () => {
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    await concordar();
    act(() => latest().say([{ text: 'meu texto', final: true }]));
    fireEvent.click(screen.getByRole('button', { name: 'Parar de ditar' }));
    expect(latest().stopped).toBe(true);
    expect(box().value).toBe('meu texto');
    expect(screen.getByRole('button', { name: 'Ditar por voz' })).toBeTruthy();
  });

  it.each([
    ['not-allowed', /não liberou o microfone/],
    ['no-speech', /Não ouvi nada/],
    ['audio-capture', /não encontrei um microfone/i],
    ['network', /serviço de voz do navegador está indisponível/],
    ['qualquer-outro', /parou por um erro do navegador/],
  ])('erro de voz %s vira mensagem clara e o texto já ditado não se perde', async (code, re) => {
    historyOnce({ conversation_id: 'c9', consent_audio: true });
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    act(() => latest().say([{ text: 'texto já ditado', final: true }]));
    act(() => latest().onerror?.({ error: code }));
    expect(screen.getByText(re)).toBeTruthy();
    expect(box().value).toBe('texto já ditado');
  });

  it('falha ao registrar o consentimento: não começa a ouvir e mostra o motivo', async () => {
    historyOnce();
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('checkbox'));
    api.callAgent.mockRejectedValueOnce(new ProfileError('role_not_allowed'));
    fireEvent.click(screen.getByRole('button', { name: 'Concordar e começar a ditar' }));
    expect(await screen.findByText(/não permite conversar com a Zica/)).toBeTruthy();
    expect(latest()).toBeUndefined();
  });

  it('servidor diz que falta o consentimento: a tela volta a exigir o aceite e mantém o texto', async () => {
    historyOnce({ conversation_id: 'c9', consent_audio: true });
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    act(() => latest().say([{ text: 'oi', final: true }]));
    api.callAgent.mockRejectedValueOnce(new ProfileError('consent_required'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para a Zica' }));
    expect(await screen.findByText(/concorde antes com o aviso de voz/)).toBeTruthy();
    expect(box().value).toBe('oi');
    expect(screen.queryByRole('button', { name: 'Revogar consentimento de voz' })).toBeNull();
  });

  it('apagar a conversa também desliga o consentimento (ele é da conversa)', async () => {
    historyOnce({ conversation_id: 'c9', consent_audio: true, messages: [{ role: 'user', content: 'oi' }] });
    mount();
    await screen.findByText('oi');
    expect(screen.getByRole('button', { name: 'Revogar consentimento de voz' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar conversa' }));
    api.callAgent.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Apagar de vez' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Revogar consentimento de voz' })).toBeNull());
  });

  it('o texto ditado respeita o limite de 2.000 caracteres', async () => {
    historyOnce({ conversation_id: 'c9', consent_audio: true });
    mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    act(() => latest().say([{ text: 'a'.repeat(1900), final: true }]));
    act(() => latest().say([{ text: 'b'.repeat(500), final: true }]));
    expect(box().value.length).toBe(2000);
  });

  it('sair da tela aborta o reconhecimento (o microfone não fica aberto)', async () => {
    historyOnce({ conversation_id: 'c9', consent_audio: true });
    const { unmount } = mount();
    await screen.findByText(/Ainda não conversamos/);
    fireEvent.click(screen.getByRole('button', { name: 'Ditar por voz' }));
    const rec = latest();
    unmount();
    expect(rec.aborted).toBe(true);
  });

  it('visualizador não vê o ditado', async () => {
    historyOnce();
    mount({ payload: payload({ role: 'viewer', can_write: false, can_private: false }) });
    await screen.findByText(/permite ler, mas não conversar/);
    expect(screen.queryByRole('button', { name: 'Ditar por voz' })).toBeNull();
  });
});
