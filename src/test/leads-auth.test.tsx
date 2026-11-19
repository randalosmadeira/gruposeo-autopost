import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ invoke: vi.fn(), signUp: vi.fn(), signIn: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: api.invoke }, auth: { signInWithOAuth: vi.fn() } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false, signIn: api.signIn, signUp: api.signUp }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: api.toast }) }));
vi.mock('@/hooks/useBackendHealth', () => ({ useBackendHealth: () => ({ status: 'online', latency: 10, recheck: vi.fn() }) }));
vi.mock('@/components/brand/CentralCortex', () => ({ CentralCortex: () => null }));

import Auth from '@/pages/Auth';
import { readHandoff } from '@/lib/lead-api';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const mount = (url: string) => render(<MemoryRouter initialEntries={[url]}><Auth /></MemoryRouter>);

beforeEach(() => { api.invoke.mockReset(); api.signUp.mockReset(); api.signIn.mockReset(); api.toast.mockReset(); localStorage.clear(); });
afterEach(() => cleanup());

describe('Auth com o atalho de captação (?view=signup&lead=…)', () => {
  it('abre direto no cadastro, guarda o token e pré-preenche nome e e-mail do lead', async () => {
    api.invoke.mockResolvedValue({ data: { valid: true, name: 'Maria Souza', email: 'maria@empresa.com.br' }, error: null });
    mount(`/auth?view=signup&lead=${TOKEN}`);
    expect(screen.getByLabelText('Crie sua senha')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Maria Souza'));
    expect((screen.getByLabelText('Email de acesso') as HTMLInputElement).value).toBe('maria@empresa.com.br');
    expect(screen.getByRole('status').textContent).toMatch(/Crie a sua senha e você já entra/);
    expect(readHandoff()).toBe(TOKEN);
    expect((api.invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({ action: 'peek', token: TOKEN });
  });

  it('token vencido ou já usado: cadastro normal, sem aviso e sem preencher nada', async () => {
    api.invoke.mockResolvedValue({ data: { valid: false }, error: null });
    mount(`/auth?view=signup&lead=${TOKEN}`);
    await waitFor(() => expect(api.invoke).toHaveBeenCalled());
    await Promise.resolve();
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('token com formato inválido: nem consulta o servidor nem guarda', () => {
    mount('/auth?view=signup&lead=<script>');
    expect(api.invoke).not.toHaveBeenCalled();
    expect(readHandoff()).toBeNull();
  });

  it('sem os parâmetros: abre no login como antes e não consulta nada', () => {
    mount('/auth');
    expect(screen.getByLabelText('Senha')).toBeTruthy();
    expect(screen.queryByLabelText('Crie sua senha')).toBeNull();
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it('falha de rede no peek não derruba a tela de cadastro', async () => {
    api.invoke.mockRejectedValue(new Error('rede'));
    mount(`/auth?view=signup&lead=${TOKEN}`);
    await waitFor(() => expect(api.invoke).toHaveBeenCalled());
    expect(screen.getByLabelText('Crie sua senha')).toBeTruthy();
  });
});

describe('Auth: cadastro com confirmação de e-mail', () => {
  const preencherEEnviar = async () => {
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Maria Souza' } });
    fireEvent.change(screen.getByLabelText('Email de acesso'), { target: { value: 'maria@empresa.com.br' } });
    fireEvent.change(screen.getByLabelText('Crie sua senha'), { target: { value: 'senha-segura-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Ativar conta Zica.ai/ }));
  };

  it('conta criada mas ainda sem sessão: mostra "Confirme o seu e-mail" com o endereço, e "Já confirmei" leva ao login com o e-mail preenchido', async () => {
    api.signUp.mockResolvedValue({ needsEmailConfirmation: true });
    mount('/auth?view=signup');
    await preencherEEnviar();
    expect(await screen.findByText('Confirme o seu e-mail')).toBeTruthy();
    expect(screen.getByText('maria@empresa.com.br')).toBeTruthy();
    expect(screen.queryByLabelText('Crie sua senha')).toBeNull(); // o formulário some: não dá para enviar de novo sem querer
    fireEvent.click(screen.getByRole('button', { name: 'Já confirmei, quero entrar' }));
    expect((screen.getByLabelText('Email de acesso') as HTMLInputElement).value).toBe('maria@empresa.com.br');
    expect(screen.getByLabelText('Senha')).toBeTruthy();
  });

  it('conta já com sessão (confirmação desligada): não mostra o aviso de confirmação', async () => {
    api.signUp.mockResolvedValue({ needsEmailConfirmation: false });
    mount('/auth?view=signup');
    await preencherEEnviar();
    await waitFor(() => expect(api.signUp).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByText('Confirme o seu e-mail')).toBeNull();
  });

  const peekOk = { data: { valid: true, name: 'Maria Souza', email: 'maria@empresa.com.br' }, error: null };
  const abrirComLead = async () => {
    mount(`/auth?view=signup&lead=${TOKEN}`);
    await waitFor(() => expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Maria Souza'));
    fireEvent.change(screen.getByLabelText('Crie sua senha'), { target: { value: 'senha-segura-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Ativar conta Zica.ai/ }));
  };

  it('veio do lead: o cadastro é DIRETO (sem e-mail de confirmação): ativa no servidor com token + senha e já entra com o e-mail do lead', async () => {
    api.invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) => (o.body.action === 'peek' ? peekOk : { data: { activated: true, email: 'maria@empresa.com.br', space: 'created' }, error: null }));
    api.signIn.mockResolvedValue(undefined);
    await abrirComLead();
    await waitFor(() => expect(api.signIn).toHaveBeenCalledWith('maria@empresa.com.br', 'senha-segura-1'));
    const act = api.invoke.mock.calls.map((c) => (c[1] as { body: Record<string, unknown> }).body).find((b) => b.action === 'activate');
    expect(act).toEqual({ action: 'activate', token: TOKEN, password: 'senha-segura-1' });
    expect(api.signUp).not.toHaveBeenCalled(); // nenhum e-mail de confirmação do Supabase
    expect(readHandoff()).toBeNull(); // token usado
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Seu espaço de teste está pronto' })));
    expect(screen.queryByText('Confirme o seu e-mail')).toBeNull();
  });

  it('com o lead, o e-mail do cadastro fica travado (a conta é sempre a do lead)', async () => {
    api.invoke.mockResolvedValue(peekOk);
    mount(`/auth?view=signup&lead=${TOKEN}`);
    await waitFor(() => expect((screen.getByLabelText('Email de acesso') as HTMLInputElement).value).toBe('maria@empresa.com.br'));
    expect((screen.getByLabelText('Email de acesso') as HTMLInputElement).readOnly).toBe(true);
  });

  it('lead cujo e-mail já tem conta: avisa em português e leva ao login com o e-mail preenchido', async () => {
    const err = Object.assign(new Error('x'), { context: new Response(JSON.stringify({ error: 'account_exists' }), { status: 409 }) });
    api.invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) => (o.body.action === 'peek' ? peekOk : { data: null, error: err }));
    await abrirComLead();
    await waitFor(() => expect(api.toast).toHaveBeenCalled());
    expect(api.toast.mock.calls[0][0].description).toBe('Este e-mail já tem conta. Entre com a sua senha.');
    expect(api.signIn).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Email de acesso') as HTMLInputElement).value).toBe('maria@empresa.com.br');
    expect(screen.getByLabelText('Senha')).toBeTruthy();
  });

  it('sem lead, o cadastro comum segue pelo Supabase e, se o e-mail já tem conta, a tela diz isso em vez de "enviamos um link"', async () => {
    api.signUp.mockRejectedValue(new Error('User already registered'));
    mount('/auth?view=signup');
    await preencherEEnviar();
    await waitFor(() => expect(api.toast).toHaveBeenCalled());
    expect(api.toast.mock.calls[0][0].description).toMatch(/já tem conta/);
    expect(screen.queryByText('Confirme o seu e-mail')).toBeNull();
  });

  it('sem lead: o cadastro não leva dado extra', async () => {
    api.signUp.mockResolvedValue({ needsEmailConfirmation: true });
    mount('/auth?view=signup');
    await preencherEEnviar();
    await waitFor(() => expect(api.signUp).toHaveBeenCalled());
    expect(api.signUp.mock.calls[0][3]).toBeUndefined();
  });

  it('erros do Supabase aparecem em português', async () => {
    api.signUp.mockRejectedValue(new Error('For security purposes, you can only request this after 36 seconds.'));
    mount('/auth?view=signup');
    await preencherEEnviar();
    await waitFor(() => expect(api.toast).toHaveBeenCalled());
    expect(api.toast.mock.calls[0][0].description).toBe('Aguarde 36 segundos antes de tentar de novo.');
  });
});
