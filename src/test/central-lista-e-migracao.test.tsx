import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_COLUMN_LIST, PROJECT_LIFECYCLE_COLUMNS } from '@/lib/project-columns';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

// ---------------------------------------------------------------- useProjects: arquivados escondidos por padrão
const h = vi.hoisted(() => {
  const state = { lifecycle: [] as Array<Record<string, unknown>> | 'erro', calls: [] as string[] };
  const rows = [{ id: 'p1', name: 'Ativo', domain: 'a.com.br' }, { id: 'p2', name: 'Arquivado', domain: 'b.com.br' }, { id: 'p3', name: 'Pausado', domain: 'c.com.br' }];
  const from = vi.fn(() => {
    let cols = '';
    const chain: Record<string, unknown> = {
      select(c: string) { cols = c; state.calls.push(c); return chain; },
      order() { return Promise.resolve({ data: rows, error: null }); },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        // leitura do ciclo de vida (sem .order): resposta controlada pelo teste
        const out = state.lifecycle === 'erro' ? { data: null, error: { code: '42703', message: 'column does not exist' } } : { data: state.lifecycle, error: null };
        return Promise.resolve(out).then(resolve, reject);
      },
    };
    void cols;
    return chain;
  });
  return { state, from };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from, functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useProjects } from '@/hooks/useProjects';
const wrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
};

describe('useProjects: ciclo de vida sem quebrar os seletores existentes', () => {
  beforeEach(() => { h.state.calls.length = 0; h.state.lifecycle = [{ id: 'p1', lifecycle_status: 'ativo', archived_at: null, paused_reason: null }, { id: 'p2', lifecycle_status: 'arquivado', archived_at: '2026-11-10T00:00:00Z', paused_reason: null }, { id: 'p3', lifecycle_status: 'pausado', archived_at: null, paused_reason: 'x' }]; });
  afterEach(() => cleanup());

  it('por padrão esconde os arquivados (pausados continuam visíveis, com o estado)', async () => {
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.projects.length).toBe(2));
    expect(result.current.projects.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(result.current.projects.find((p) => p.id === 'p3')?.lifecycle_status).toBe('pausado');
  });
  it('com includeArchived mostra todos, com archived_at', async () => {
    const { result } = renderHook(() => useProjects({ includeArchived: true }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.projects.length).toBe(3));
    expect(result.current.projects.find((p) => p.id === 'p2')).toMatchObject({ lifecycle_status: 'arquivado', archived_at: '2026-11-10T00:00:00Z' });
  });
  it('migração ainda não aplicada (a leitura do ciclo de vida falha): todos contam como ativos e nada quebra', async () => {
    h.state.lifecycle = 'erro';
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.projects.length).toBe(3));
    expect(result.current.projects.every((p) => p.lifecycle_status === 'ativo')).toBe(true);
  });
  it('a lista principal continua usando só PROJECT_COLUMNS e o ciclo de vida é lido à parte, só com colunas liberadas ao navegador', async () => {
    renderHook(() => useProjects(), { wrapper: wrapper() });
    await waitFor(() => expect(h.state.calls.length).toBeGreaterThanOrEqual(2));
    expect(h.state.calls[0]).toBe(PROJECT_COLUMN_LIST.join(','));
    expect(h.state.calls[1]).toBe(`id,${PROJECT_LIFECYCLE_COLUMNS.join(',')}`);
    expect(h.state.calls.join(' ')).not.toMatch(/paused_snapshot|archived_by/);
  });
  it('mantém a mesma referência da lista enquanto os dados não mudam (seletores usam `projects` em efeitos)', async () => {
    const { result, rerender } = renderHook(() => useProjects(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.projects.length).toBe(2));
    const first = result.current.projects;
    rerender();
    expect(result.current.projects).toBe(first);
  });
  it('não existe mais exclusão direta no hook: só archiveProject', () => {
    const src = read('src/hooks/useProjects.tsx');
    expect(src).not.toMatch(/deleteProject/);
    expect(src).not.toMatch(/\.delete\(\)/);
    expect(src).toMatch(/archiveProject/);
    expect(src).toMatch(/callLifecycle<[^>]*>\('archive'/);
  });
});

// ---------------------------------------------------------------- ProjectsList: nada de excluir direto
const list = vi.hoisted(() => ({ archive: vi.fn(), useProjects: vi.fn() }));
vi.mock('@/hooks/useWordPressStats', () => ({ useWordPressStats: () => ({ allStats: [] }) }));

describe('ProjectsList: sem exclusão direta', () => {
  it('o código não tem mais confirm() nem deleteProject nem ícone de lixeira, e aponta para a Central', () => {
    for (const f of ['src/pages/ProjectsList.tsx', 'src/components/settings/WordPressSitesCard.tsx']) {
      const src = read(f);
      expect(src, f).not.toMatch(/deleteProject/);
      expect(src, f).not.toMatch(/Trash2/);
      expect(src, f).toMatch(/archiveProject/);
    }
    const pl = read('src/pages/ProjectsList.tsx');
    expect(pl).not.toMatch(/confirm\(/);
    expect(pl).toMatch(/\/central-de-projetos/);
  });

  it('o botão da linha é "Arquivar" e chama archiveProject com o id; "Mostrar arquivados" pede a lista com arquivados', async () => {
    vi.resetModules();
    list.archive.mockReset();
    list.useProjects.mockReset();
    const projects = [{ id: 'p1', name: 'Blog RDM', domain: 'rdm.com.br', lifecycle_status: 'ativo' }, { id: 'p2', name: 'Velho', domain: 'velho.com.br', lifecycle_status: 'arquivado' }];
    list.useProjects.mockImplementation((o?: { includeArchived?: boolean }) => ({ projects: o?.includeArchived ? projects : projects.slice(0, 1), isLoading: false, createProject: { mutateAsync: vi.fn() }, updateProject: { mutateAsync: vi.fn() }, archiveProject: { mutate: list.archive } }));
    vi.doMock('@/hooks/useProjects', () => ({ useProjects: list.useProjects }));
    const { default: ProjectsList } = await import('@/pages/ProjectsList');
    render(<MemoryRouter><ProjectsList /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar Blog RDM' }));
    expect(list.archive).toHaveBeenCalledWith('p1');
    expect(screen.queryByText('Velho')).toBeNull();
    expect(screen.getByRole('link', { name: /Central de Projetos/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Mostrar arquivados/ }));
    expect(await screen.findByText('Velho')).toBeTruthy();
    expect(list.useProjects).toHaveBeenLastCalledWith({ includeArchived: true });
    expect(screen.queryByRole('button', { name: 'Arquivar Velho' })).toBeNull(); // arquivado: só "Central"
    vi.doUnmock('@/hooks/useProjects');
  });
});

// ---------------------------------------------------------------- migração (texto): o que ela promete
const allMigrations = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).map((f) => read(`supabase/migrations/${f}`)).join('\n');
const MIG = read('supabase/migrations/20261120300000_central_de_projetos.sql');
const ROLL = read('supabase/rollbacks/20261120300000_central_de_projetos_rollback.sql');

describe('migração 20261120300000: o que ela garante (conferência de texto; NÃO foi aplicada em banco)', () => {
  it('colunas de ciclo de vida com valor padrão "ativo" (nenhum projeto muda) e restrição de valores', () => {
    expect(MIG).toMatch(/add column if not exists lifecycle_status text not null default 'ativo'/);
    expect(MIG).toMatch(/check \(lifecycle_status in \('ativo', 'pausado', 'arquivado'\)\)/);
    for (const c of ['archived_at timestamptz', 'archived_by uuid', 'paused_reason text']) expect(MIG).toContain(c);
    expect(MIG).not.toMatch(/\bupdate public\.projects\b/);
    expect(MIG).not.toMatch(/\bdelete from public\.projects where id = p_project\b[\s\S]*\bdelete from public\.projects where id <>/);
  });
  it('o navegador lê exatamente as colunas liberadas em project-columns.ts e não as internas', () => {
    const m = MIG.match(/grant select \(([^)]*)\) on public\.projects to authenticated;/);
    expect(m).toBeTruthy();
    expect(m![1].split(',').map((c) => c.trim()).sort()).toEqual([...PROJECT_LIFECYCLE_COLUMNS].sort());
    expect(m![1]).not.toMatch(/paused_snapshot|archived_by/);
    for (const c of PROJECT_LIFECYCLE_COLUMNS) expect(PROJECT_COLUMN_LIST as readonly string[]).not.toContain(c);
  });
  it('gatilhos: navegador não muda o ciclo de vida nem exclui projeto; serviço e postgres passam', () => {
    expect(MIG).toMatch(/before delete on public\.projects for each row execute function public\.projects_lifecycle_guard\(\)/);
    expect(MIG).toMatch(/before update on public\.projects for each row execute function public\.projects_lifecycle_guard\(\)/);
    expect(MIG).toMatch(/current_user in \('authenticated', 'anon'\)/);
    expect(MIG).toMatch(/raise exception 'project_delete_via_central'/);
  });
  it('histórico sem chave estrangeira (não some com o projeto), RLS ligada e sem grant para anon/authenticated', () => {
    const t = MIG.match(/create table if not exists public\.project_lifecycle_events \(([\s\S]*?)\n\);/)![1];
    expect(t).not.toMatch(/references/i);
    expect(t).toMatch(/project_id uuid not null/);
    expect(t).toMatch(/project_name text not null/);
    for (const e of ['pausado', 'retomado', 'arquivado', 'restaurado', 'exportado', 'excluido']) expect(t).toContain(`'${e}'`);
    expect(MIG).toMatch(/alter table public\.project_lifecycle_events enable row level security;/);
    expect(MIG).toMatch(/revoke all on table public\.project_lifecycle_events from public, anon, authenticated;/);
    expect(MIG).toMatch(/grant all on table public\.project_lifecycle_events to service_role;/);
  });
  it('as funções são security definer com search_path vazio e só a chave de serviço executa', () => {
    for (const fn of ['project_health_inputs', 'project_delete_plan', 'project_purge', 'project_orphan_scan']) {
      expect(MIG, fn).toMatch(new RegExp(`create or replace function private\\.${fn}\\([^)]*\\)[\\s\\S]*?security definer set search_path = ''`));
      expect(MIG, fn).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
    }
    expect(MIG).toMatch(/revoke all on function private\.project_health_inputs\(uuid\)[^;]*from public, anon, authenticated;/);
    expect(MIG).toMatch(/grant execute on function private\.project_health_inputs\(uuid\)[^;]*to service_role;/);
    expect(MIG).not.toMatch(/grant execute[^;]*to (anon|authenticated)/);
  });
  it('a purga lê as FKs de pg_constraint, trata restrict/no action antes de set null e cascade, repete tabelas presas e grava o evento na mesma transação', () => {
    expect(MIG).toMatch(/confrelid = 'public\.projects'::regclass/);
    expect(MIG).toMatch(/when 'r' then 1 when 'a' then 1 when 'n' then 2/);
    expect(MIG).toMatch(/foreign_key_violation or restrict_violation/);
    expect(MIG).toMatch(/raise exception 'purge_blocked/);
    expect(MIG).toMatch(/insert into public\.project_lifecycle_events[\s\S]*'excluido'/);
    expect(MIG.indexOf("raise exception 'purge_blocked")).toBeLessThan(MIG.indexOf('delete from public.projects where id = p_project;'));
    // o dado com histórico é APAGADO junto (nada de órfão): não existe "update ... set project_id = null"
    expect(MIG).not.toMatch(/set project_id = null/i);
  });
  it('tabelas opcionais só são lidas se existirem (to_regclass), e toda tabela citada existe nas migrações ou nos tipos', () => {
    expect(MIG).toMatch(/to_regclass\(s\.tbl\) is not null/);
    const types = read('src/integrations/supabase/types.ts');
    const named = new Set([...MIG.matchAll(/\bfrom public\.([a-z_0-9]+)|\bjoin public\.([a-z_0-9]+)/g)].map((m) => m[1] || m[2]));
    for (const t of named) {
      if (['projects', 'organization_members', 'project_lifecycle_events'].includes(t)) continue;
      const exists = new RegExp(`create table (if not exists )?public\\.${t}\\b`, 'i').test(allMigrations) || new RegExp(`\\n {6}${t}: \\{`).test(types);
      expect(exists, `tabela ${t}`).toBe(true);
    }
  });
  it('colunas lidas em tabelas dos módulos existem na definição delas', () => {
    const block = (t: string) => allMigrations.match(new RegExp(`create table (?:if not exists )?public\\.${t} \\(([\\s\\S]*?)\\n ?\\);`, 'i'))?.[1] || '';
    const need: Record<string, string[]> = {
      project_site_maps: ['fetched_at', 'organization_id'], project_speed_schedules: ['enabled', 'frequency', 'consecutive_failures', 'last_run_at'],
      project_speed_runs: ['kind', 'performance_score', 'fetched_at'], project_alerts: ['source', 'dismissed_at'], project_backlinks: ['kind', 'status', 'last_checked_at'],
      project_funnels: ['organization_id'], project_funnel_entries: ['month'], project_taxonomy_nodes: ['status'], project_profile_extended: ['completeness', 'status'],
      nexus_site_keys: ['last_batch_at', 'site_id'], nexus_site_signals: ['kind', 'hits', 'day'], nexus_oauth_connections: ['provider', 'vault_secret_id'],
      nexus_search_performance: ['source', 'day'], nexus_analytics_daily: ['day'], nexus_citations: ['organization_id'], nexus_prompts: ['organization_id'],
    };
    for (const [t, cols] of Object.entries(need)) for (const c of cols) expect(block(t), `${t}.${c}`).toMatch(new RegExp(`\\b${c}\\b`));
  });
  it('rollback desfaz tudo (funções, gatilhos, tabela de histórico e colunas) e avisa o que se perde', () => {
    for (const s of ['drop function if exists public.project_purge', 'drop function if exists private.project_health_inputs', 'drop trigger if exists projects_lifecycle_guard_del', 'drop table if exists public.project_lifecycle_events', 'drop column if exists lifecycle_status']) expect(ROLL).toContain(s);
    expect(ROLL).toMatch(/ATENÇÕES/);
    expect(ROLL).toMatch(/arquivados ou pausados voltam a aparecer|ARQUIVADOS ou PAUSADOS voltam a aparecer/i);
  });
});

describe('segurança da Central', () => {
  it('a função de borda exige sessão de usuário, JWT e não usa chave de serviço fora do servidor; o navegador não referencia chave de serviço', () => {
    const fn = read('supabase/functions/project-lifecycle/index.ts');
    expect(fn).toMatch(/actor\.mode !== 'user'/);
    expect(fn).toMatch(/organization_members/);
    expect(read('supabase/config.toml')).toMatch(/\[functions\.project-lifecycle\]\s+verify_jwt = true/);
    for (const f of ['src/lib/project-center-api.ts', 'src/pages/ProjectCenter.tsx', ...readdirSync(join(ROOT, 'src/components/project-center')).map((x) => `src/components/project-center/${x}`)]) {
      expect(read(f), f).not.toMatch(/SERVICE_ROLE|SECRET_KEY|sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/);
    }
  });
  it('os arquivos novos não têm chave embutida', () => {
    const files = ['supabase/functions/_shared/project-health-core.ts', 'supabase/functions/_shared/project-integrity-core.ts', 'supabase/functions/_shared/module-registry.ts', 'supabase/functions/_shared/project-lifecycle-handler.ts', 'supabase/migrations/20261120300000_central_de_projetos.sql'];
    for (const f of files) expect(read(f), f).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}/);
  });
});
