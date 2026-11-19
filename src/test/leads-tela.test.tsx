import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const api = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), updateUser: vi.fn(), user: { current: null as null | { id: string; user_metadata?: Record<string, unknown> } } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: api.invoke }, auth: { updateUser: api.updateUser } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: api.user.current }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: api.toast }) }));

import GetStarted from '@/pages/GetStarted';
import AdminLeads from '@/pages/AdminLeads';
import { LeadClaimer } from '@/hooks/useLeadClaim';
import { clearHandoff, isHandoffToken, readHandoff, storeHandoff } from '@/lib/lead-api';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const ok = (data: unknown) => Promise.resolve({ data, error: null });
const actionsCalled = () => api.invoke.mock.calls.map((c) => (c[1] as { body: { action: string } }).body.action);

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p>; }

beforeEach(() => { api.invoke.mockReset(); api.toast.mockReset(); api.updateUser.mockReset(); api.updateUser.mockResolvedValue({}); api.user.current = null; localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('token de passagem do lead', () => {
  it('só aceita 32 caracteres seguros, guarda e lê, e vence em 24 h', () => {
    expect(isHandoffToken(TOKEN)).toBe(true);
    expect(isHandoffToken('curto')).toBe(false);
    expect(isHandoffToken(TOKEN + '!')).toBe(false);
    storeHandoff('curto');
    expect(readHandoff()).toBeNull();
    const t0 = 1_000_000;
    storeHandoff(TOKEN, t0);
    expect(readHandoff(t0 + 23 * 3_600_000)).toBe(TOKEN);
    expect(readHandoff(t0 + 25 * 3_600_000)).toBeNull();
    expect(localStorage.getItem('zica:lead-handoff:v1')).toBeNull(); // vencido é apagado
    storeHandoff(TOKEN);
    clearHandoff();
    expect(readHandoff()).toBeNull();
  });
});

describe('página pública /comecar', () => {
  async function mount(url = '/comecar?utm_source=rdm.com.br&utm_medium=botao-site&ref=%2Fcontato') {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.invoke.mockImplementation((_n: string, o: { body: { action: string } }) => {
      if (o.body.action === 'challenge') return ok({ challenge: 'desafio', consent_version: 'leads-v1' });
      if (o.body.action === 'submit') return ok({ ok: true, redirect: `/auth?view=signup&lead=${TOKEN}` });
      return ok({});
    });
    render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/comecar" element={<GetStarted />} /><Route path="/auth" element={<Where />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(actionsCalled()).toContain('challenge'));
    return screen.getByRole('button', { name: /Preparando|Continuar/ });
  }
  const preencher = () => {
    fireEvent.change(screen.getByLabelText(/Seu nome/), { target: { value: 'Maria Souza' } });
    fireEvent.change(screen.getByLabelText(/WhatsApp/), { target: { value: '(11) 98888-7777' } });
  };

  it('o botão só libera depois de ~3,5 s (anti-robô) e começa dizendo "Preparando…"', async () => {
    const btn = await mount();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toMatch(/Preparando/);
    await act(async () => { await vi.advanceTimersByTimeAsync(3600); });
    expect((screen.getByRole('button', { name: /Continuar para o cadastro/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sem consentimento, sem nome ou sem contato: mostra o que falta e NÃO envia', async () => {
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3600); });
    fireEvent.click(screen.getByRole('button', { name: /Continuar para o cadastro/ }));
    expect(await screen.findByText('Informe seu nome.')).toBeTruthy();
    expect(screen.getByText(/Informe um e-mail ou um WhatsApp/)).toBeTruthy();
    expect(screen.getByText(/concordar com o uso dos seus dados/)).toBeTruthy();
    expect(actionsCalled()).not.toContain('submit');
    preencher(); // nome + contato, ainda sem consentimento
    fireEvent.click(screen.getByRole('button', { name: /Continuar para o cadastro/ }));
    await screen.findByText(/concordar com o uso dos seus dados/);
    expect(actionsCalled()).not.toContain('submit');
  });

  it('envio completo: manda campanha do endereço, guarda o token, avisa e leva ao cadastro', async () => {
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3600); });
    preencher();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Continuar para o cadastro/ }));
    await screen.findByText('Recebemos seus dados.');
    const sent = (api.invoke.mock.calls.find((c) => (c[1] as { body: { action: string } }).body.action === 'submit')![1] as { body: Record<string, unknown> }).body;
    expect(sent).toMatchObject({ name: 'Maria Souza', phone: '(11) 98888-7777', consent: true, challenge: 'desafio', consentVersion: 'leads-v1', website: '', ref: '/contato' });
    expect(sent.utm).toEqual({ utm_source: 'rdm.com.br', utm_medium: 'botao-site' });
    expect(readHandoff()).toBe(TOKEN);
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    expect((await screen.findByTestId('where')).textContent).toBe(`/auth?view=signup&lead=${TOKEN}`);
  });

  it('campo-isca preenchido é enviado ao servidor (que finge sucesso); a página não revela nada', async () => {
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3600); });
    preencher();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(document.getElementById('gs-website') as HTMLInputElement, { target: { value: 'http://spam.example' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar para o cadastro/ }));
    await waitFor(() => expect(actionsCalled()).toContain('submit'));
    const sent = (api.invoke.mock.calls.find((c) => (c[1] as { body: { action: string } }).body.action === 'submit')![1] as { body: { website: string } }).body;
    expect(sent.website).toBe('http://spam.example');
  });

  it('erro de limite do servidor vira mensagem em português e nada é guardado', async () => {
    await mount();
    api.invoke.mockImplementation((_n: string, o: { body: { action: string } }) => o.body.action === 'challenge'
      ? ok({ challenge: 'd', consent_version: 'leads-v1' })
      : Promise.resolve({ data: null, error: Object.assign(new Error('x'), { context: new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }) }) }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3600); });
    preencher();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Continuar para o cadastro/ }));
    expect(await screen.findByText(/Muitas tentativas/)).toBeTruthy();
    expect(readHandoff()).toBeNull();
  });
});

describe('vínculo do cadastro ao lead (LeadClaimer)', () => {
  it('sem login ou sem token: não chama nada', async () => {
    render(<LeadClaimer />);
    storeHandoff(TOKEN);
    await Promise.resolve();
    expect(api.invoke).not.toHaveBeenCalled();
    cleanup();
    clearHandoff();
    api.user.current = { id: 'u1' };
    render(<LeadClaimer />);
    await Promise.resolve();
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it('logado com token: liga uma vez e apaga o token (mesmo se o servidor recusar)', async () => {
    api.invoke.mockReturnValue(Promise.resolve({ data: null, error: new Error('falhou') }));
    storeHandoff(TOKEN);
    api.user.current = { id: 'u1' };
    const { rerender } = render(<LeadClaimer />);
    await waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(1));
    expect((api.invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body).toEqual({ action: 'claim', token: TOKEN });
    await waitFor(() => expect(readHandoff()).toBeNull());
    rerender(<LeadClaimer />);
    await Promise.resolve();
    expect(api.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('caixa de leads do gestor (/admin/leads)', () => {
  const lead = (over: Record<string, unknown> = {}) => ({ id: 'l1', created_at: '2026-11-16T12:00:00Z', name: 'Maria Souza', email: null, phone: '+5511988887777', segment: 'advocacia', message: 'Quero mais clientes', site_url: 'rdm.com.br', source: { utm_source: 'rdm.com.br' }, status: 'new', notes: null, consent_at: '2026-11-16T12:00:00Z', claimed_at: null, ...over });
  const counts = { new: 1, contacted: 0, signed_up: 0, discarded: 0 };

  it('lista os leads com WhatsApp clicável, conta por situação e marca como contatado', async () => {
    api.invoke.mockImplementation((_n: string, o: { body: { action: string } }) => o.body.action === 'update' ? ok({ id: 'l1' }) : ok({ leads: [lead()], counts }));
    render(<AdminLeads />);
    expect(await screen.findByText('Maria Souza')).toBeTruthy();
    expect(screen.getByText(/origem: rdm.com.br/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /WhatsApp \+5511988887777/ }).getAttribute('href')).toBe('https://wa.me/5511988887777');
    expect(screen.getByRole('button', { name: /Novos \(1\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como contatado' }));
    await waitFor(() => expect(actionsCalled()).toContain('update'));
    const upd = (api.invoke.mock.calls.find((c) => (c[1] as { body: { action: string } }).body.action === 'update')![1] as { body: Record<string, unknown> }).body;
    expect(upd).toMatchObject({ id: 'l1', status: 'contacted' });
  });

  it('lista vazia e filtro por situação', async () => {
    api.invoke.mockImplementation(() => ok({ leads: [], counts: { new: 0, contacted: 0, signed_up: 0, discarded: 0 } }));
    render(<AdminLeads />);
    expect(await screen.findByText(/Nenhum lead por enquanto/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Descartados/ }));
    await screen.findByText(/Nenhum lead nesta situação/);
    const last = (api.invoke.mock.calls[api.invoke.mock.calls.length - 1][1] as { body: Record<string, unknown> }).body;
    expect(last).toMatchObject({ action: 'list', status: 'discarded' });
  });

  it('quem não é gestor vê o aviso, sem dados', async () => {
    api.invoke.mockReturnValue(Promise.resolve({ data: null, error: Object.assign(new Error('x'), { context: new Response(JSON.stringify({ error: 'manager_only' }), { status: 403 }) }) }));
    render(<AdminLeads />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Só a gestão da plataforma/);
    expect(screen.queryByText('Maria Souza')).toBeNull();
  });

  it('salva a anotação sem mudar a situação', async () => {
    api.invoke.mockImplementation((_n: string, o: { body: { action: string } }) => o.body.action === 'update' ? ok({ id: 'l1' }) : ok({ leads: [lead()], counts }));
    render(<AdminLeads />);
    await screen.findByText('Maria Souza');
    fireEvent.change(screen.getByLabelText(/Anotações/), { target: { value: 'Ligar amanhã' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar anotação' }));
    await waitFor(() => expect(actionsCalled()).toContain('update'));
    const upd = (api.invoke.mock.calls.find((c) => (c[1] as { body: { action: string } }).body.action === 'update')![1] as { body: Record<string, unknown> }).body;
    expect(upd).toEqual({ action: 'update', id: 'l1', notes: 'Ligar amanhã' });
  });
});

describe('script do botão para os sites (public/zica-lead.js)', () => {
  const src = readFileSync(resolve(process.cwd(), 'public/zica-lead.js'), 'utf8');
  function run(attrs: Record<string, string> = {}, scriptSrc = 'https://app.zica.posts.zicajuris.com.br/zica-lead.js') {
    document.body.innerHTML = '';
    delete (window as unknown as { __zicaLeadLoaded?: boolean }).__zicaLeadLoaded;
    const s = document.createElement('script');
    s.setAttribute('src', scriptSrc);
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(`data-${k}`, v));
    document.body.appendChild(s);
    Object.defineProperty(document, 'currentScript', { value: s, configurable: true });
    new Function(src)();
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
    return document.querySelector('[data-zica-lead]') as HTMLElement | null;
  }
  const link = (host: HTMLElement | null) => (host?.shadowRoot?.querySelector('a') as HTMLAnchorElement | null);

  it('cria um link (não faz chamada de rede) para /comecar com origem e página, no endereço do próprio script', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const a = link(run());
    expect(a).toBeTruthy();
    const u = new URL(a!.href);
    expect(u.origin + u.pathname).toBe('https://app.zica.posts.zicajuris.com.br/comecar');
    expect(u.searchParams.get('utm_medium')).toBe('botao-site');
    expect(u.searchParams.get('utm_source')).toBeTruthy();
    expect(a!.textContent).toBe('Quero começar');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('aceita texto, origem e posição; descarta cor maliciosa; não carrega duas vezes', () => {
    const host = run({ label: 'Falar com a equipe', source: 'blog-x', position: 'bottom-left', color: 'red;background:url(//evil)' });
    const a = link(host)!;
    expect(a.textContent).toBe('Falar com a equipe');
    expect(new URL(a.href).searchParams.get('utm_source')).toBe('blog-x');
    expect(host!.style.left).toBe('16px');
    expect(a.style.cssText).not.toMatch(/evil/);
    expect(a.style.cssText).toMatch(/#D4FF00|rgb\(212, 255, 0\)/i);
    const again = document.createElement('script');
    Object.defineProperty(document, 'currentScript', { value: again, configurable: true });
    new Function(src)();
    expect(document.querySelectorAll('[data-zica-lead]').length).toBe(1);
  });
});

describe('espaço de teste: aviso ao novo usuário e liberação pela gestão', () => {
  it('LeadClaimer: espaço criado -> aviso "Seu espaço de teste está pronto"; já existente ou indisponível -> sem aviso', async () => {
    for (const [space, shown] of [['created', 1], ['existing', 0], ['unavailable', 0]] as const) {
      api.toast.mockReset();
      api.invoke.mockReset();
      api.invoke.mockReturnValue(ok({ claimed: true, space }));
      storeHandoff(TOKEN);
      api.user.current = { id: `u-${space}` };
      render(<LeadClaimer />);
      await waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(readHandoff()).toBeNull());
      await Promise.resolve();
      expect(api.toast).toHaveBeenCalledTimes(shown);
      if (shown) expect(api.toast.mock.calls[0][0].title).toMatch(/espaço de teste está pronto/);
      cleanup();
    }
  });

  const SPACE = { organization_id: '00000000-0000-4000-8000-0000000000b1', plan_id: 'trial', status: 'trialing' };
  const lead = (over: Record<string, unknown> = {}) => ({ id: 'l1', created_at: '2026-11-16T12:00:00Z', name: 'Maria Souza', email: 'm@x.com', phone: null, segment: null, message: null, site_url: null, source: {}, status: 'signed_up', notes: null, consent_at: '2026-11-16T12:00:00Z', claimed_at: '2026-11-16T13:00:00Z', space: SPACE, ...over });
  const counts = { new: 0, contacted: 0, signed_up: 1, discarded: 0 };
  const call = (action: string) => api.invoke.mock.calls.find((c) => (c[1] as { body: { action: string } }).body.action === action)?.[1] as { body: Record<string, unknown> } | undefined;

  it('mostra o espaço em teste e libera só depois de confirmar o plano (comercial por padrão)', async () => {
    api.invoke.mockImplementation((_n: string, o: { body: { action: string } }) => o.body.action === 'release' ? ok({ released: true }) : ok({ leads: [lead()], counts }));
    render(<AdminLeads />);
    const box = await screen.findByTestId('space-l1');
    expect(box.textContent).toMatch(/Espaço de teste/);
    expect(box.textContent).toMatch(/em teste/);
    fireEvent.click(screen.getByRole('button', { name: 'Liberar espaço' }));
    expect(call('release')).toBeUndefined(); // abrir a confirmação não libera nada
    expect(screen.getByText(/acesso à IA paga da plataforma/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar liberação' }));
    await waitFor(() => expect(call('release')).toBeTruthy());
    expect(call('release')!.body).toEqual({ action: 'release', organization_id: SPACE.organization_id, plan: 'commercial' });
  });

  it('dá para escolher o plano BYOK e cancelar a confirmação sem liberar', async () => {
    api.invoke.mockImplementation((_n: string, o: { body: { action: string } }) => o.body.action === 'release' ? ok({ released: true }) : ok({ leads: [lead()], counts }));
    render(<AdminLeads />);
    await screen.findByTestId('space-l1');
    fireEvent.click(screen.getByRole('button', { name: 'Liberar espaço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Confirmar liberação' })).toBeNull();
    expect(call('release')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Liberar espaço' }));
    fireEvent.change(screen.getByLabelText('Plano'), { target: { value: 'byok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar liberação' }));
    await waitFor(() => expect(call('release')?.body.plan).toBe('byok'));
  });

  it('espaço já liberado: mostra o plano e não oferece liberar de novo', async () => {
    api.invoke.mockImplementation(() => ok({ leads: [lead({ space: { ...SPACE, plan_id: 'commercial', status: 'active' } })], counts }));
    render(<AdminLeads />);
    const box = await screen.findByTestId('space-l1');
    expect(box.textContent).toMatch(/Comercial/);
    expect(box.textContent).toMatch(/ativo/);
    expect(screen.queryByRole('button', { name: 'Liberar espaço' })).toBeNull();
  });

  it('cadastrado sem espaço: explica; erro do servidor na liberação aparece em português', async () => {
    api.invoke.mockImplementation(() => ok({ leads: [lead({ space: null })], counts }));
    const first = render(<AdminLeads />);
    expect(await screen.findByText(/ainda sem espaço de teste/)).toBeTruthy();
    first.unmount();
    api.invoke.mockImplementation((_n: string, o: { body: { action: string } }) => o.body.action === 'release'
      ? Promise.resolve({ data: null, error: Object.assign(new Error('x'), { context: new Response(JSON.stringify({ error: 'not_a_trial_space' }), { status: 409 }) }) })
      : ok({ leads: [lead()], counts }));
    render(<AdminLeads />);
    await screen.findByTestId('space-l1');
    fireEvent.click(screen.getByRole('button', { name: 'Liberar espaço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar liberação' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/já não está em teste/);
  });
});

describe('LeadClaimer: pessoa que já está logada e acabou de preencher o formulário', () => {
  it('guardar um token novo com a sessão aberta dispara o vínculo na hora (sem precisar sair e entrar)', async () => {
    api.invoke.mockReset();
    api.invoke.mockReturnValue(ok({ claimed: true, space: 'existing' }));
    api.user.current = { id: 'u-ja-logado' };
    render(<LeadClaimer />);
    await Promise.resolve();
    expect(api.invoke).not.toHaveBeenCalled(); // sem token, nada acontece
    act(() => { storeHandoff(TOKEN); });
    await waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(1));
    expect((api.invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body).toEqual({ action: 'claim', token: TOKEN });
    await waitFor(() => expect(readHandoff()).toBeNull());
    // um segundo formulário na mesma sessão também é ligado
    act(() => { storeHandoff('zyxwvutsrqponmlkjihgfedcba987654'); });
    await waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(2));
  });
});

describe('LeadClaimer: confirmou o e-mail em OUTRO navegador (sem token guardado)', () => {
  it('usa o token que veio nos dados do cadastro, liga o lead e depois apaga o token dos dados do usuário', async () => {
    api.invoke.mockReturnValue(ok({ claimed: true, space: 'created' }));
    api.user.current = { id: 'u-outro-navegador', user_metadata: { lead_handoff: TOKEN, full_name: 'Maria' } };
    render(<LeadClaimer />);
    await waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(1));
    expect((api.invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body).toEqual({ action: 'claim', token: TOKEN });
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith({ data: { lead_handoff: null } }));
    await waitFor(() => expect(api.toast).toHaveBeenCalledTimes(1));
  });

  it('token inválido nos dados do usuário é ignorado (nada é chamado)', async () => {
    api.user.current = { id: 'u-x', user_metadata: { lead_handoff: 'curto' } };
    render(<LeadClaimer />);
    await Promise.resolve();
    expect(api.invoke).not.toHaveBeenCalled();
    expect(api.updateUser).not.toHaveBeenCalled();
  });

  it('quando o token veio do armazenamento local, os dados do usuário não são mexidos', async () => {
    api.invoke.mockReturnValue(ok({ claimed: true, space: 'existing' }));
    storeHandoff(TOKEN);
    api.user.current = { id: 'u-local', user_metadata: {} };
    render(<LeadClaimer />);
    await waitFor(() => expect(api.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readHandoff()).toBeNull());
    expect(api.updateUser).not.toHaveBeenCalled();
  });
});
