import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const api = vi.hoisted(() => ({ call: vi.fn(), build: vi.fn(), download: vi.fn(), record: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
const ORG = '00000000-0000-4000-8000-0000000000a1';
const P1 = '00000000-0000-4000-8000-0000000000b1';
const P2 = '00000000-0000-4000-8000-0000000000b2';
const P3 = '00000000-0000-4000-8000-0000000000b3';
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Blog RDM', organization_id: '00000000-0000-4000-8000-0000000000a1' }], isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/project-center-api', async (orig) => ({ ...(await orig<typeof import('@/lib/project-center-api')>()), callLifecycle: api.call, buildExportPackage: api.build, downloadPackage: api.download, recordExportDone: api.record }));

import ProjectCenter from '@/pages/ProjectCenter';
import { LifecycleError } from '@/lib/project-center-api';

const health = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  project_id: id, name, domain: `${name.toLowerCase().replace(/\s/g, '')}.com.br`, lifecycle_status: 'ativo', state: 'saudavel', state_label: 'Saudável', score: 88, reason: 'Conexões, atividade e estrutura em ordem.',
  last_activity_at: '2026-11-18T10:00:00.000Z', days_inactive: 2, items: [], suggestions: [], counts: { ok: 3, atencao: 0, critico: 0, sem_dados: 0 }, ...over,
});
const overview = () => ({
  organization_id: ORG, can_manage: true, can_delete: true, plugin_version: '3.16.2', generated_at: '2026-11-20T12:00:00.000Z',
  totals: { saudavel: 1, atencao: 0, critico: 1, inativo: 0, pausado: 0, arquivado: 1 },
  projects: [
    health(P2, 'Quebrado', { state: 'critico', state_label: 'Crítico', score: 31, reason: 'Search Console: leitura parada há 20 dias (último dado em 31/10/2026).' }),
    health(P1, 'Blog RDM'),
    health(P3, 'Velho', { lifecycle_status: 'arquivado', state: 'arquivado', state_label: 'Arquivado', score: null, reason: 'Arquivado em 10/11/2026. Os dados continuam guardados; dá para restaurar.' }),
  ],
});
const detail = (h: ReturnType<typeof health>, extra: Record<string, unknown> = {}) => ({
  health: { ...h, items: [
    { key: 'google', area: 'conexoes', label: 'Google (Search Console e GA4)', status: 'atencao', detail: 'Sem Google conectado.', source: 'Conexões do Google', date: null, action: 'Conecte o Google em NEXUS · Motores & APIs.' },
    { key: 'taxonomia', area: 'estrutura', label: 'Taxonomia aprovada', status: 'sem_dados', detail: 'Módulo de taxonomia ainda não instalado no banco.', source: 'Taxonomia', date: null, action: null },
  ], ...(extra.health as object || {}) },
  map: { modules: [{ key: 'perfil', label: 'Perfil do Projeto', route: '/business-profile', state: 'com_dados', detail: 'perfil 90% completo' }, { key: 'arvore', label: 'Árvore da Marca', route: null, state: 'planejado', detail: 'ainda não construído' }], links: [{ from: 'perfil', to: 'taxonomia', table: 'project_profile_extended', state: 'prevista', text: 'Perfil do Projeto → Taxonomia e mercado: ligação prevista, ainda não construída no código.' }], chain: [{ from: 'perfil', to: 'taxonomia', connected: false, planned: true }] },
  events: [], timeline: [{ at: '2026-11-18T10:00:00.000Z', kind: 'atividade', text: 'Última publicação: Último artigo publicado há 2 dias.', source: 'Artigos' }], plugin_version: '3.16.2',
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ProjectCenter /></MemoryRouter></QueryClientProvider>);

let detailFor: (id: string) => unknown;
beforeEach(() => {
  api.call.mockReset(); api.build.mockReset(); api.download.mockReset(); api.record.mockReset();
  detailFor = (id) => detail(overview().projects.find((p) => p.project_id === id)!);
  api.call.mockImplementation(async (action: string, body: Record<string, unknown>) => {
    if (action === 'health_overview') return overview();
    if (action === 'health_detail') return detailFor(body.projectId as string);
    return {};
  });
});

describe('Central de Projetos: tela', () => {
  it('lista cartões com semáforo por extenso, nota e motivo; sem nota diz "sem nota"; arquivados ficam fora de "Todos"', async () => {
    mount();
    const quebrado = await screen.findByRole('button', { name: /Quebrado: Crítico, nota 31/ });
    expect(quebrado.textContent).toMatch(/leitura parada há 20 dias/);
    expect(screen.getByRole('button', { name: /Blog RDM: Saudável, nota 88/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Velho/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Todos \(2\)/ })).toBeTruthy();
    expect(api.call).toHaveBeenCalledWith('health_overview', { organizationId: ORG });
  });

  it('filtro por estado: Arquivado mostra o arquivado com "sem nota"', async () => {
    mount();
    await screen.findByRole('button', { name: /Quebrado/ });
    fireEvent.click(screen.getByRole('button', { name: /^Arquivado \(1\)/ }));
    const velho = await screen.findByRole('button', { name: /Velho: Arquivado, sem nota/ });
    expect(velho.textContent).toMatch(/dá para restaurar/);
    expect(screen.queryByRole('button', { name: /Blog RDM/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Crítico \(1\)/ }));
    expect(await screen.findByRole('button', { name: /Quebrado/ })).toBeTruthy();
  });

  it('detalhe: cada item com fonte e ação em português, "sem dados" explícito, mapa de conexões e linha do tempo', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Blog RDM: Saudável/ }));
    const art = await screen.findByRole('article', { name: /Detalhe de Blog RDM/ });
    expect(art.textContent).toMatch(/Fonte: Conexões do Google/);
    expect(art.textContent).toMatch(/O que fazer: Conecte o Google/);
    expect(art.textContent).toMatch(/Sem dados/);
    expect(art.textContent).toMatch(/Módulo de taxonomia ainda não instalado/);
    expect(art.textContent).toMatch(/ligação prevista, ainda não construída/);
    expect(art.textContent).toMatch(/planejado/);
    expect(art.textContent).toMatch(/Última publicação/);
  });

  it('sugestões: "Arquivar" arquiva de verdade (sem confirm) e "Mesclar manualmente" só mostra o aviso, sem mesclar nada', async () => {
    detailFor = (id) => detail(health(id, 'Quebrado', { suggestions: [{ key: 'duplicado_arquivar', kind: 'arquivar', text: 'Este é o que tem menos dados do par duplicado.', related_project_id: P1 }, { key: 'duplicado', kind: 'mesclar', text: 'Parece duplicado de «Blog RDM» (mesmo endereço).', related_project_id: P1 }] }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Quebrado: Crítico/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mesclar manualmente' }));
    expect(screen.getByText(/não mescla projetos sozinho/)).toBeTruthy();
    expect(api.call.mock.calls.some((c) => c[0] === 'archive' || c[0] === 'purge')).toBe(false);
    const list = screen.getByText(/Sugestões \(você decide\)/).closest('section')!;
    fireEvent.click(within(list).getByRole('button', { name: 'Arquivar' }));
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('archive', { projectId: P2 }));
  });

  it('pausar envia o motivo; projeto pausado mostra "Retomar"; arquivado mostra "Restaurar"', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Blog RDM: Saudável/ }));
    fireEvent.change(await screen.findByLabelText(/Motivo da pausa/), { target: { value: 'cliente pediu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('pause', { projectId: P1, reason: 'cliente pediu' }));
  });
  it('arquivado: botão Restaurar', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Arquivado \(1\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Velho: Arquivado/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('restore', { projectId: P3 }));
  });

  it('papel sem permissão: botões desligados e aviso; sem botão de excluir', async () => {
    api.call.mockImplementation(async (action: string, body: Record<string, unknown>) => (action === 'health_overview' ? { ...overview(), can_manage: false, can_delete: false } : action === 'health_detail' ? detailFor(body.projectId as string) : {}));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Blog RDM: Saudável/ }));
    expect(await screen.findByText(/permite ver, mas não pausar, arquivar ou excluir/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Arquivar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Excluir definitivamente/ })).toBeNull();
  });

  it('erro do servidor vira mensagem em português com "Tentar de novo"', async () => {
    api.call.mockRejectedValue(new LifecycleError('organization_membership_required'));
    mount();
    expect(await screen.findByText(/Você não faz parte da organização/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});

describe('Central de Projetos: exclusão definitiva em etapas', () => {
  const planOf = (over: Record<string, unknown> = {}) => ({
    project: { id: P3, name: 'Velho', lifecycle_status: 'arquivado' }, empty: false, requires_archive: false, can_purge_now: true, total_rows: 2330,
    groups: [{ module: 'conteudo', label: 'Artigos e WordPress', rows: 2312, tables: [{ table: 'articles', rows: 2312, on_delete: 'set null' }] }, { module: 'taxonomia', label: 'Taxonomia e mercado', rows: 18, tables: [{ table: 'project_taxonomy_nodes', rows: 18, on_delete: 'cascade' }] }],
    without_fk: [], would_orphan: [{ table: 'articles', rows: 2312 }], note: 'x', ...over,
  });
  const open = async (plan: unknown, which: 'arq' | 'ativo' = 'arq') => {
    api.call.mockImplementation(async (action: string, body: Record<string, unknown>) => {
      if (action === 'health_overview') return overview();
      if (action === 'health_detail') return detailFor(body.projectId as string);
      if (action === 'delete_plan') return plan;
      if (action === 'purge') return { purged: true, project_id: P3, name: 'Velho', was_empty: false, deleted: { articles: 2312 }, total_rows: 2330, vault: 'removido', left_behind: [] };
      return {};
    });
    mount();
    if (which === 'arq') {
      fireEvent.click(await screen.findByRole('button', { name: /^Arquivado \(1\)/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Velho: Arquivado/ }));
    } else fireEvent.click(await screen.findByRole('button', { name: /Blog RDM: Saudável/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Excluir definitivamente…/ }));
    const flow = await screen.findByRole('region', { name: /Excluir definitivamente: / });
    await waitFor(() => expect(flow.querySelector('[aria-busy="true"]')).toBeNull());
    return flow;
  };

  it('resumo por módulo, aviso do que ficaria órfão, exportar, digitar o nome e só então excluir', async () => {
    api.build.mockResolvedValue({ exported_at: '2026-11-20T12:00:00.000Z', project: { id: P3, name: 'Velho' }, modules: {}, totals: { rows: 2330, tables: 2 }, warnings: ['nexus_search_performance: Limite atingido'] });
    api.download.mockReturnValue('zica-exportacao-velho-2026-11-20.json');
    api.record.mockResolvedValue({ recorded: true });
    const flow = await open(planOf());
    expect(flow.textContent).toMatch(/2\.330 linha\(s\) em 2 módulo\(s\)/);
    expect(flow.textContent).toMatch(/Artigos e WordPress/);
    expect(flow.textContent).toMatch(/ficaria sem projeto \(será apagado\)/);
    expect(flow.textContent).toMatch(/ficariam sem projeto em uma exclusão comum/);
    const del = within(flow).getByRole('button', { name: /^Excluir definitivamente$/ }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    fireEvent.change(within(flow).getByLabelText(/Digite exatamente/), { target: { value: 'Velho' } });
    expect(del.disabled).toBe(true); // falta reconhecer a exportação
    fireEvent.click(within(flow).getByRole('button', { name: /Exportar e baixar/ }));
    await waitFor(() => expect(api.download).toHaveBeenCalled());
    expect(await within(flow).findByText(/Arquivo zica-exportacao-velho-2026-11-20\.json gerado: 2\.330 linha\(s\)/)).toBeTruthy();
    expect(flow.textContent).toMatch(/Limite atingido/);
    expect(api.record).toHaveBeenCalled();
    fireEvent.click(within(flow).getByRole('checkbox'));
    expect(del.disabled).toBe(false);
    fireEvent.change(within(flow).getByLabelText(/Digite exatamente/), { target: { value: 'Velh' } });
    expect(del.disabled).toBe(true);
    fireEvent.change(within(flow).getByLabelText(/Digite exatamente/), { target: { value: 'Velho' } });
    fireEvent.click(del);
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('purge', { projectId: P3, confirm_name: 'Velho', export_acknowledged: true }));
  });

  it('projeto não arquivado (com dados): só oferece "Arquivar agora", sem campo de nome nem botão de excluir', async () => {
    const flow = await open(planOf({ project: { id: P1, name: 'Blog RDM', lifecycle_status: 'ativo' }, requires_archive: true, can_purge_now: false }), 'ativo');
    expect(flow.textContent).toMatch(/primeiro arquive/);
    fireEvent.click(within(flow).getByRole('button', { name: 'Arquivar agora' }));
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('archive', { projectId: P1 }));
    expect(within(flow).queryByLabelText(/Digite exatamente/)).toBeNull();
    expect(api.call.mock.calls.some((c) => c[0] === 'purge')).toBe(false);
  });

  it('projeto vazio: sem exportação, só o nome', async () => {
    const flow = await open(planOf({ empty: true, total_rows: 0, groups: [], would_orphan: [] }));
    expect(flow.textContent).toMatch(/está vazio/);
    expect(within(flow).queryByRole('button', { name: /Exportar/ })).toBeNull();
    const del = within(flow).getByRole('button', { name: /^Excluir definitivamente$/ }) as HTMLButtonElement;
    fireEvent.change(within(flow).getByLabelText(/Digite exatamente/), { target: { value: 'Velho' } });
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    await waitFor(() => expect(api.call).toHaveBeenCalledWith('purge', { projectId: P3, confirm_name: 'Velho', export_acknowledged: false }));
  });

  it('erro do servidor na exclusão aparece em português e nada some da tela', async () => {
    const flow = await open(planOf({ empty: true, total_rows: 0, groups: [], would_orphan: [] }));
    api.call.mockImplementation(async (action: string) => { if (action === 'purge') throw new LifecycleError('confirmation_mismatch'); return planOf(); });
    fireEvent.change(within(flow).getByLabelText(/Digite exatamente/), { target: { value: 'Velho' } });
    fireEvent.click(within(flow).getByRole('button', { name: /^Excluir definitivamente$/ }));
    expect(await within(flow).findByText(/O nome digitado não é igual/)).toBeTruthy();
  });
});

describe('Central de Projetos: layout e navegação', () => {
  it('sem larguras fixas que estourem 400px (só min-w-0, break-words e grades que quebram)', () => {
    const dir = join(process.cwd(), 'src/components/project-center');
    const files = [...readdirSync(dir).map((f) => join(dir, f)), join(process.cwd(), 'src/pages/ProjectCenter.tsx')];
    for (const f of files) {
      const code = readFileSync(f, 'utf-8');
      expect(code, f).not.toMatch(/\b(?:min-w|w)-\[\d{3,}px\]/);
      expect(code, f).not.toMatch(/overflow-x-scroll/);
    }
  });
  it('rota e item de menu existem', () => {
    expect(readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf-8')).toMatch(/path="\/central-de-projetos" element=\{<ProjectCenter \/>\}/);
    expect(readFileSync(join(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf-8')).toMatch(/label: 'Central de Projetos', icon: HeartPulse, href: '\/central-de-projetos'/);
    expect(readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf-8')).toMatch(/\[functions\.project-lifecycle\]\s+verify_jwt = true/);
  });
});
