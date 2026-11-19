import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const fn = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: fn.invoke } } }));
vi.mock('@/pages/ProjectProfile', () => ({ default: () => <p>tela do perfil</p> }));

import { PerfilApp, projectFromSearch } from '@/perfil-entry';

const ID = '4238b02e-4930-4e58-8e60-b19e19bf0576';
const mount = (search: string) => render(<QueryClientProvider client={new QueryClient()}><PerfilApp search={search} /></QueryClientProvider>);
afterEach(() => { cleanup(); fn.invoke.mockReset(); });

describe('entrada independente do Perfil do projeto', () => {
  it('só aceita um id de projeto no formato de UUID', () => {
    expect(projectFromSearch(`?project=${ID}`)).toBe(ID);
    for (const bad of ['', '?project=', '?project=abc', '?project=../../x', `?other=${ID}`, `?project=${ID}%27`]) expect(projectFromSearch(bad), bad).toBe('');
  });

  it('com projeto na URL abre a tela do perfil, sem listar projetos', () => {
    mount(`?project=${ID}`);
    expect(screen.getByText('tela do perfil')).toBeTruthy();
    expect(fn.invoke).not.toHaveBeenCalled();
  });

  it('sem projeto na URL lista os projetos do login, com link para cada um', async () => {
    fn.invoke.mockResolvedValue({ data: { projects: [{ id: ID, name: 'SEO Marketing', nexus_profile_status: 'draft' }] }, error: null });
    mount('');
    const link = await screen.findByRole('link', { name: /SEO Marketing/ });
    expect(link.getAttribute('href')).toBe(`?project=${ID}`);
    expect(fn.invoke).toHaveBeenCalledWith('nexus-business', { body: { action: 'bootstrap' } });
  });

  it('sem login (erro da função) manda entrar no painel', async () => {
    fn.invoke.mockResolvedValue({ data: null, error: new Error('401') });
    mount('');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Entre no painel/);
  });
});
