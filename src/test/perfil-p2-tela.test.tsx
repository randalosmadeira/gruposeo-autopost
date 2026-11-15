import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProfilePayload } from '@/lib/profile-api';

const api = vi.hoisted(() => ({ callProfile: vi.fn() }));
vi.mock('@/lib/profile-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/profile-api')>('@/lib/profile-api');
  return { ...actual, callProfile: api.callProfile };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import ProjectProfile from '@/pages/ProjectProfile';
import { ProfileError } from '@/lib/profile-api';

const PID = '11111111-1111-4111-8111-111111111111';

function payload(over: Partial<ProfilePayload> = {}): ProfilePayload {
  return {
    project: { id: PID, name: 'Blog Teste', domain: 'teste.com.br', organization_id: 'o1' },
    role: 'owner', can_write: true, can_private: true, can_modules: true,
    strategy: { data: { businessName: 'Blog Teste', offer: 'Oferta antiga', sector: 'Direito' }, version: 4, status: 'complete' },
    legacy_strategy: { instagram: 'https://instagram.com/teste' },
    extended: { version: 0, sections: {}, status: 'draft', completeness: 0, updated_at: null, confirmed_at: null },
    private: { version: 0, finance: {}, goals: {} },
    snapshots: [],
    modules: { catalog: [{ code: 'articles', name: 'Artigos', description: 'Criação de artigos', route: '/articles', core: false, default_enabled: true, sort: 100 }], decisions: [] },
    ...over,
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/projects/${PID}/perfil`]}>
        <Routes><Route path="/projects/:id/perfil" element={<ProjectProfile />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const goStep = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => { localStorage.clear(); api.callProfile.mockReset(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('tela do Perfil do projeto (P2)', () => {
  it('abre o perfil, mostra as 11 etapas e os dados que já existiam', async () => {
    api.callProfile.mockResolvedValue(payload());
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'Blog Teste' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: /etapas do perfil/i });
    expect(within(nav).getAllByRole('button')).toHaveLength(11);
    goStep(/2\. Negócio e documentos/);
    expect((screen.getByLabelText('O que a empresa faz, em uma frase') as HTMLTextAreaElement).value).toBe('Oferta antiga');
    expect((screen.getByLabelText('Nome da empresa ou do profissional') as HTMLInputElement).value).toBe('Blog Teste');
    expect(api.callProfile).toHaveBeenCalledWith('profile_load', { projectId: PID });
  });

  it('editar habilita "Salvar"; salvar envia só o que mudou com as versões esperadas e limpa o rascunho', async () => {
    api.callProfile.mockResolvedValueOnce(payload());
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/2\. Negócio e documentos/);
    const save = screen.getByRole('button', { name: 'Salvar perfil' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText('Tudo salvo')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('O que a empresa faz, em uma frase'), { target: { value: 'Oferta nova' } });
    expect(screen.getByText(/1 alteração\(ões\) não salva/)).toBeTruthy();
    expect(localStorage.getItem(`zica:perfil-rascunho:v1:${PID}`)).toContain('Oferta nova');

    api.callProfile.mockResolvedValueOnce(payload({ strategy: { data: { businessName: 'Blog Teste', offer: 'Oferta nova', sector: 'Direito' }, version: 5, status: 'complete' }, extended: { version: 1, sections: {}, status: 'draft', completeness: 3, updated_at: null, confirmed_at: null } }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }));
    await screen.findByText(/Perfil salvo/);
    expect(api.callProfile).toHaveBeenLastCalledWith('profile_save', { projectId: PID, changes: { offer: 'Oferta nova' }, expected: { strategy: 4, extended: 0, private: 0 } });
    expect(localStorage.getItem(`zica:perfil-rascunho:v1:${PID}`)).toBeNull();
    expect(screen.getByText('Tudo salvo')).toBeTruthy();
  });

  it('CNPJ inválido mostra o aviso e bloqueia o salvamento', async () => {
    api.callProfile.mockResolvedValue(payload());
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/2\. Negócio e documentos/);
    fireEvent.change(screen.getByLabelText('CNPJ (se tiver)'), { target: { value: '12.345.678/0001-00' } });
    expect(screen.getByRole('alert').textContent).toMatch(/não confere/i);
    expect((screen.getByRole('button', { name: 'Salvar perfil' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Não sei o que é" mostra a explicação fixa do termo', async () => {
    api.callProfile.mockResolvedValue(payload());
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/6\. Presença online/);
    expect(screen.queryByText(/ficha gratuita da empresa no Google/)).toBeNull();
    const group = screen.getByRole('group', { name: 'Google Meu Negócio' });
    fireEvent.click(within(group).getByRole('button', { name: 'Não sei o que é' }));
    expect(screen.getByText(/ficha gratuita da empresa no Google/)).toBeTruthy();
  });

  it('só dono e administrador veem os campos financeiros; editor vê aviso', async () => {
    api.callProfile.mockResolvedValue(payload({ role: 'editor', can_private: false, can_modules: false, private: null }));
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/2\. Negócio e documentos/);
    expect(screen.getByText('Estes números ficam só com dono e administrador da organização.')).toBeTruthy();
    expect(screen.queryByLabelText('Faturamento mensal médio (R$)')).toBeNull();
  });

  it('visualizador não edita nem salva', async () => {
    api.callProfile.mockResolvedValue(payload({ role: 'viewer', can_write: false, can_private: false, can_modules: false, private: null }));
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/2\. Negócio e documentos/);
    expect((screen.getByLabelText('O que a empresa faz, em uma frase') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Salvar perfil' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/seu papel não permite editar/i)).toBeTruthy();
  });

  it('recupera o rascunho guardado no navegador ao abrir', async () => {
    localStorage.setItem(`zica:perfil-rascunho:v1:${PID}`, JSON.stringify({ values: { offer: 'Texto que eu não salvei' }, base: { strategy: 4, extended: 0, private: 0 }, savedAt: new Date().toISOString() }));
    api.callProfile.mockResolvedValue(payload());
    mount();
    await screen.findByText(/Recuperei o que você digitou/);
    goStep(/2\. Negócio e documentos/);
    expect((screen.getByLabelText('O que a empresa faz, em uma frase') as HTMLTextAreaElement).value).toBe('Texto que eu não salvei');
    expect(screen.getByText(/1 alteração\(ões\) não salva/)).toBeTruthy();
  });

  it('conflito de versão: avisa, mantém o que foi digitado e o rascunho', async () => {
    api.callProfile.mockResolvedValueOnce(payload());
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/2\. Negócio e documentos/);
    fireEvent.change(screen.getByLabelText('O que a empresa faz, em uma frase'), { target: { value: 'Minha edição' } });
    api.callProfile.mockRejectedValueOnce(new ProfileError('profile_changed_reload', {}, ['strategy']));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }));
    await waitFor(() => expect(screen.getByText(/mudou em outra tela/)).toBeTruthy());
    expect((screen.getByLabelText('O que a empresa faz, em uma frase') as HTMLTextAreaElement).value).toBe('Minha edição');
    expect(localStorage.getItem(`zica:perfil-rascunho:v1:${PID}`)).toContain('Minha edição');
  });

  it('importar dados já cadastrados preenche só os campos vazios e não salva sozinho', async () => {
    api.callProfile.mockResolvedValue(payload());
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/2\. Negócio e documentos/);
    fireEvent.click(screen.getByRole('button', { name: /Importar dados já cadastrados/ }));
    expect(screen.getByText(/1 campo\(s\) vazio\(s\) preenchido\(s\)/)).toBeTruthy();
    expect(api.callProfile).toHaveBeenCalledTimes(1); // só a leitura inicial
  });

  it('módulos: decisão é enviada e a tela avisa que ainda não afeta o menu', async () => {
    api.callProfile.mockResolvedValueOnce(payload());
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/9\. Módulos/);
    expect(screen.getByText(/ainda não esconde o item do menu/)).toBeTruthy();
    api.callProfile.mockResolvedValueOnce(payload({ modules: { catalog: payload().modules.catalog, decisions: [{ module_code: 'articles', enabled: false, reason: null, recommendation: null, recommendation_reason: null, decided_at: '2026-11-15T21:00:00Z' }] } }));
    fireEvent.click(screen.getByRole('switch', { name: 'Artigos' }));
    await screen.findByText(/Decisão do módulo registrada: desligado/);
    expect(api.callProfile).toHaveBeenLastCalledWith('modules_set', { projectId: PID, moduleCode: 'articles', enabled: false, reason: '' });
  });

  it('caminho: sem respostas mostra "sem dados", nunca número inventado', async () => {
    api.callProfile.mockResolvedValue(payload());
    mount();
    await screen.findByRole('heading', { level: 1 });
    goStep(/11\. Caminho/);
    expect(screen.getAllByText('sem dados ainda').length).toBeGreaterThan(0);
  });

  it('erro de carregamento oferece tentar de novo', async () => {
    api.callProfile.mockRejectedValue(new ProfileError('project_not_found'));
    mount();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Projeto não encontrado.')).toBeTruthy();
  });
});
