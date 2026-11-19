import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MENU_MODULE, hiddenModules, isMenuItemVisible } from '@/lib/module-visibility';

const hooks = vi.hoisted(() => ({ hidden: new Set<string>(), electoral: false, admin: false }));
vi.mock('@/hooks/useHiddenModules', () => ({ useHiddenModules: () => hooks.hidden, HIDDEN_MODULES_KEY: ['project-modules-disabled'] }));
vi.mock('@/hooks/useAdminAccess', () => ({ useAdminAccess: () => ({ isAdmin: hooks.admin }) }));
vi.mock('@/hooks/useElectoralAccess', () => ({ useElectoralAccess: () => ({ canManageElectoral: hooks.electoral }) }));
vi.mock('@/components/PrefetchLink', () => ({ PrefetchLink: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => <a href={to} className={className}>{children}</a> }));
vi.mock('@/components/brand/ZicaLogo', () => ({ ZicaLogo: () => <span>logo</span> }));

import { Sidebar } from '@/components/layout/Sidebar';
import { MobileDock } from '@/components/layout/MobileDock';

const A = 'p-a', B = 'p-b', C = 'p-c';
const off = (project_id: string, module_code: string) => ({ project_id, module_code, enabled: false });

describe('P5: regra de visibilidade dos módulos no menu', () => {
  it('sem projetos ou sem decisões, nada some', () => {
    expect(hiddenModules([], [off(A, 'news_agents')]).size).toBe(0);
    expect(hiddenModules([A, B], []).size).toBe(0);
  });
  it('só some quando TODOS os projetos acessíveis desligaram', () => {
    expect([...hiddenModules([A, B], [off(A, 'content_calendar')])]).toEqual([]);
    expect([...hiddenModules([A, B], [off(A, 'content_calendar'), off(B, 'content_calendar')])]).toEqual(['content_calendar']);
    expect([...hiddenModules([A], [off(A, 'content_calendar')])]).toEqual(['content_calendar']);
  });
  it('decisão de projeto que a pessoa não acessa não conta; "ligado" nunca esconde; módulos são independentes', () => {
    expect([...hiddenModules([A], [off(B, 'articles')])]).toEqual([]);
    expect([...hiddenModules([A], [{ project_id: A, module_code: 'articles', enabled: true }])]).toEqual([]);
    expect([...hiddenModules([A, B], [off(A, 'articles'), off(B, 'articles'), off(A, 'nexus_visibility')])]).toEqual(['articles']);
    expect([...hiddenModules([A, B, C], [off(A, 'articles'), off(B, 'articles')])]).toEqual([]);
  });
  it('itens nucleares e administrativos nunca somem', () => {
    const everything = new Set(Object.values(MENU_MODULE));
    for (const href of ['/dashboard', '/account', '/business-profile', '/integrations', '/admin/queues']) expect(isMenuItemVisible(href, everything), href).toBe(true);
    expect(isMenuItemVisible('/calendar', new Set(['content_calendar']))).toBe(false);
    expect(isMenuItemVisible('/calendar', new Set(['articles']))).toBe(true);
  });
});

describe('P5: menu lateral e dock do celular', () => {
  afterEach(() => { cleanup(); hooks.hidden = new Set(); hooks.electoral = false; hooks.admin = false; });
  const side = () => render(<MemoryRouter><Sidebar /></MemoryRouter>);
  const dock = () => render(<MemoryRouter><MobileDock /></MemoryRouter>);

  it('sem módulos desligados o menu está completo', () => {
    side();
    for (const label of ['Visão Geral', 'Conteúdo & Notícias', 'Publicar em massa', 'Calendário Editorial', 'NEXUS · Observatório', 'Visibilidade', 'Minha Conta']) expect(screen.getByText(label), label).toBeTruthy();
  });
  it('módulo desligado em todos os projetos some do menu; o resto fica', () => {
    hooks.hidden = new Set(['content_calendar', 'nexus_observatory']);
    side();
    expect(screen.queryByText('Calendário Editorial')).toBeNull();
    expect(screen.queryByText('NEXUS · Observatório')).toBeNull();
    for (const label of ['Visão Geral', 'Conteúdo & Notícias', 'NEXUS · Inteligência', 'Minha Conta', 'Negócios & Estratégia']) expect(screen.getByText(label), label).toBeTruthy();
  });
  it('eleitoral: o bloco inteiro some quando o módulo está desligado em todos; sem acesso eleitoral nunca aparece', () => {
    hooks.electoral = true;
    side();
    expect(screen.getByText('Campanha Eleitoral')).toBeTruthy();
    cleanup();
    hooks.hidden = new Set(['electoral_campaign']);
    side();
    expect(screen.queryByText('Campanha Eleitoral')).toBeNull();
    expect(screen.queryByText('Eleitoral 1470')).toBeNull();
    cleanup();
    hooks.hidden = new Set();
    hooks.electoral = false;
    side();
    expect(screen.queryByText('Campanha Eleitoral')).toBeNull();
  });
  it('dock do celular: calendário e eleitoral somem junto; o painel e a conta ficam', () => {
    hooks.electoral = true;
    hooks.hidden = new Set(['content_calendar', 'electoral_campaign']);
    dock();
    expect(screen.queryByText('Calendário')).toBeNull();
    expect(screen.queryByText('Eleitoral')).toBeNull();
    for (const label of ['Painel', 'Conteúdo', 'Blogs', 'Conta']) expect(screen.getByText(label), label).toBeTruthy();
  });
});
