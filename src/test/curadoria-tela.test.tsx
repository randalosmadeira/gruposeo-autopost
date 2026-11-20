import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: async (_fn: string, o: { body: { module: string; action: string } & Record<string, unknown> }) => {
        const { module, action, ...rest } = o.body;
        try { return { data: await api.call(module, action, rest), error: null }; } catch (e) {
          const err = e as { code?: string; detail?: Record<string, unknown> };
          return { data: null, error: { context: new Response(JSON.stringify({ error: err.code || 'request_failed', ...(err.detail || {}) }), { status: 403 }) } };
        }
      },
    },
  },
}));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Blog RDM', organization_id: '00000000-0000-4000-8000-0000000000a1' }], isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Curadoria from '@/pages/Curadoria';

const P = '00000000-0000-4000-8000-0000000000b1';
const counts = (o: Record<string, number> = {}) => ({ total: 0, sem_curadoria: 0, desatualizada: 0, aprovado: 0, precisa_correcao: 0, bloqueado: 0, ...o });
const resumo = (over: Record<string, unknown> = {}) => ({
  project_id: P, name: 'Blog RDM', total_artigos: 1030, bloqueados_por_imagem: 12,
  por_status: {
    generating: counts({ total: 89, sem_curadoria: 89 }), draft: counts({ total: 712, sem_curadoria: 700, aprovado: 5, bloqueado: 7 }), ready: counts({ total: 223, sem_curadoria: 200, precisa_correcao: 3, desatualizada: 20 }), error: counts(),
  },
  totais: counts({ total: 1024 }), publicados: { total: 2266, observacao: 'Artigos já publicados não passam pela curadoria.' }, versao_das_regras: 1, ...over,
});
const lista = () => ({
  project_id: P, total: 1, page: 1, pageSize: 25,
  artigos: [{ article_id: 'a1', title: 'Prisão em flagrante: o que fazer', keyword: 'flagrante', status: 'draft', status_rotulo: 'Na fila', updated_at: null, estado: 'bloqueado', estado_gravado: 'bloqueado', nota: 40, image_state: 'repetida', image_uses: 703, curated_at: '2026-11-20T10:00:00Z' }],
});
const detalhe = () => ({
  article: { id: 'a1', title: 'Prisão em flagrante: o que fazer', keyword: 'flagrante', status: 'draft', featured_image_url: 'https://x/y.webp', updated_at: null }, estado_gravado: 'bloqueado', estado_atual: 'bloqueado', gravado: true, calculado_agora: false,
  curated_at: '2026-11-20T10:00:00Z', publicado: false,
  relatorio: {
    estado: 'bloqueado', nota: 40, avisos: 2, evaluated_at: '2026-11-20T10:00:00Z', bloqueios: ['Imagem repetida: a mesma imagem está em 703 artigos do projeto.'], faltando: [],
    itens: [
      { modulo: 'imagens', estado: 'pendencia', bloqueia: true, motivo_em_portugues: 'Imagem repetida: a mesma imagem está em 703 artigos do projeto.', fonte: 'Política de imagens' },
      { modulo: 'perfil', estado: 'sem_dados', motivo_em_portugues: 'O Perfil do Projeto ainda não tem segmento preenchido.', fonte: 'Perfil do Projeto' },
    ],
  },
});
const imagens = () => ({
  project_id: P, total_artigos: 3290, imagens_distintas: 46, artigos_sem_imagem: 4, grupos_repetidos: 20, regra: 'Imagem repetida ou ausente bloqueia.', normalizacao: 'Reconhece a mesma imagem.',
  por_status: { draft: { artigos: 712, com_imagem: 712, sem_imagem: 0, em_imagem_repetida: 712, imagens_distintas: 11 }, published: { artigos: 2266, com_imagem: 2266, sem_imagem: 0, em_imagem_repetida: 2266, imagens_distintas: 28 } },
  mais_repetidas: [{ chave: 'k', exemplo_url: 'https://x/mais-usada.webp', usos: 703, por_status: { published: 703 }, usada_em_publicado: true }],
  precisam_imagem_nova: { total: 2, offset: 0, limit: 50, artigos: [
    { prioridade: 1, article_id: 'g1', title: 'Em criação sem imagem', keyword: null, status: 'generating', status_rotulo: 'Em criação', motivo: 'ausente', usos: 0 },
    { prioridade: 2, article_id: 'd1', title: 'Na fila com imagem repetida', keyword: null, status: 'draft', status_rotulo: 'Na fila', motivo: 'repetida', usos: 703 },
  ] },
});
const prompts = (over: Record<string, unknown> = {}) => ({
  project_id: P, sem_dados: false, total_prompts: 4, resumo: { sem_artigo: 1, so_em_producao: 1, coberto: 2 }, heuristica: true, regra: 'Heurística: a pergunta conta como coberta quando 60% das palavras aparecem.',
  prompts: [{ id: 'q1', query: 'quanto custa advogado trabalhista em Campinas', topic: 'trabalhista', intent: 'transactional', conjunto: 'Trabalhista', estado: 'sem_artigo', cobertos_por: [] }], ...over,
});

let state: { resumo: unknown; rodar: Array<Record<string, unknown>>; prompts: unknown };
beforeEach(() => {
  api.call.mockReset();
  state = { resumo: resumo(), rodar: [], prompts: prompts() };
  try { localStorage.clear(); } catch { /* ok */ }
  api.call.mockImplementation(async (module: string, action: string) => {
    if (module !== 'curadoria') throw new Error(`módulo inesperado ${module}`);
    switch (action) {
      case 'resumo': return state.resumo;
      case 'listar': return lista();
      case 'detalhe': return detalhe();
      case 'imagens': return imagens();
      case 'prompts_abertos': return state.prompts;
      case 'rodar': { const next = state.rodar.shift(); if (!next) throw new Error('sem resposta'); return next; }
      default: throw new Error(`ação inesperada ${action}`);
    }
  });
});

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Curadoria /></MemoryRouter></QueryClientProvider>);
const calls = (action: string) => api.call.mock.calls.filter((c) => c[0] === 'curadoria' && c[1] === action).map((c) => c[2]);
const tab = async (name: RegExp) => fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0, ctrlKey: false });

describe('Curadoria: tela', () => {
  it('chama o portão com module="curadoria" e mostra os três blocos (Em criação, Na fila, Finalizado) com a contagem por estado', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Curadoria de conteúdo' })).toBeTruthy();
    await waitFor(() => expect(calls('resumo')[0]).toMatchObject({ projectId: P }));
    for (const t of ['Em criação', 'Na fila', 'Finalizado']) expect(await screen.findByRole('heading', { name: t })).toBeTruthy();
    const fila = screen.getByTestId('bloco-Na fila');
    expect(within(fila).getByText('712')).toBeTruthy();
    expect(within(fila).getByRole('button', { name: 'Na fila: Sem curadoria: 700' })).toBeTruthy();
    expect(within(fila).getByRole('button', { name: 'Na fila: Bloqueado: 7' })).toBeTruthy();
    expect(within(screen.getByTestId('bloco-Em criação')).getByRole('button', { name: 'Em criação: Sem curadoria: 89' })).toBeTruthy();
    expect(within(screen.getByTestId('bloco-Finalizado')).getByRole('button', { name: 'Finalizado: Desatualizada: 20' })).toBeTruthy();
    expect(screen.getByText(/12 artigo\(s\) bloqueado\(s\) por imagem repetida ou ausente/)).toBeTruthy();
    expect(screen.getByText(/2\.266 artigo\(s\) já publicado/)).toBeTruthy();
  });

  it('clicar numa contagem abre a lista filtrada, e o artigo mostra um item por módulo com o motivo em português e a fonte', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Na fila: Bloqueado: 7' }));
    await waitFor(() => expect(calls('listar').at(-1)).toMatchObject({ projectId: P, status: 'draft', estado: 'bloqueado' }));
    fireEvent.click(await screen.findByRole('button', { name: /Prisão em flagrante: o que fazer/ }));
    await waitFor(() => expect(calls('detalhe')[0]).toMatchObject({ articleId: 'a1' }));
    expect((await screen.findAllByText(/Imagem repetida: a mesma imagem está em 703 artigos/)).length).toBeGreaterThan(0);
    expect(await screen.findByText('Sem dados')).toBeTruthy();
    expect(screen.getByText(/Fonte: Perfil do Projeto/)).toBeTruthy();
  });

  it('"Rodar curadoria (sem custo de IA)" roda em lotes até concluir, mostra o progresso e recarrega o resumo', async () => {
    state.rodar = [
      { project_id: P, processados: 20, restantes: 5, concluido: false, estados: { aprovado: 5, precisa_correcao: 5, bloqueado: 10 }, artigos: [] },
      { project_id: P, processados: 5, restantes: 0, concluido: true, estados: { aprovado: 5, precisa_correcao: 0, bloqueado: 0 }, artigos: [] },
    ];
    mount();
    const btn = await screen.findByRole('button', { name: 'Rodar curadoria (sem custo de IA)' });
    fireEvent.click(btn);
    expect(await screen.findByText(/Curadoria concluída: 25 artigo\(s\) avaliado\(s\), sem IA e sem custo/)).toBeTruthy();
    const r = calls('rodar');
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ projectId: P, limit: 20 });
    expect(typeof (r[0] as { desde: string }).desde).toBe('string');
    expect((r[1] as { desde: string }).desde).toBe((r[0] as { desde: string }).desde);
    await waitFor(() => expect(calls('resumo').length).toBeGreaterThan(1));
    expect(screen.getByText('Aprovados: 10')).toBeTruthy();
    expect(screen.getByText('Bloqueados: 10')).toBeTruthy();
  });

  it('erro do servidor aparece em português e o botão volta a funcionar', async () => {
    api.call.mockImplementation(async (_m: string, action: string) => {
      if (action === 'resumo') return state.resumo;
      if (action === 'rodar') throw Object.assign(new Error('x'), { code: 'role_not_allowed', detail: { message: 'Seu papel nesta organização permite ver, mas não fazer isso.' } });
      return action === 'listar' ? lista() : {};
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Rodar curadoria (sem custo de IA)' }));
    expect(await screen.findByText('Seu papel nesta organização permite ver, mas não fazer isso.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Rodar curadoria (sem custo de IA)' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('aba Imagens: diagnóstico de repetição, imagens mais repetidas e a lista priorizada de quem precisa de imagem nova', async () => {
    mount();
    await tab(/^Imagens$/);
    expect(await screen.findByText(/usam apenas/)).toBeTruthy();
    expect(screen.getByText('46')).toBeTruthy();
    expect(screen.getByText('703 artigos')).toBeTruthy();
    expect(screen.getByText('já em artigo publicado')).toBeTruthy();
    expect(screen.getByText(/1\. Em criação sem imagem/)).toBeTruthy();
    expect(screen.getAllByText('Sem imagem').length).toBeGreaterThan(0);
    expect(screen.getByText('Repetida em 703')).toBeTruthy();
    expect(screen.getByText(/Em criação, depois Na fila, depois Finalizado/)).toBeTruthy();
  });

  it('aba Prompts abertos sem conteúdo: lista a pergunta sem artigo, rotula heurística e mostra "sem dados" quando não há prompts', async () => {
    mount();
    await tab(/Prompts abertos sem conteúdo/);
    expect(await screen.findByText('quanto custa advogado trabalhista em Campinas')).toBeTruthy();
    expect(screen.getByText('Sem artigo: 1')).toBeTruthy();
    expect(screen.getByText(/Heurística:/)).toBeTruthy();
  });

  it('sem prompts no Observatório: "Sem dados" explícito, nenhum número inventado', async () => {
    state.prompts = prompts({ sem_dados: true, motivo: 'O Observatório de IA ainda não tem perguntas ativas neste projeto.', total_prompts: 0, prompts: [] });
    mount();
    await tab(/Prompts abertos sem conteúdo/);
    expect(await screen.findByText(/Sem dados: O Observatório de IA ainda não tem perguntas ativas/)).toBeTruthy();
  });

  it('rota e menu: /curadoria registrada, item "Curadoria" no menu; a tela não chama IA, e o código não traz texto em inglês solto', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toContain('path="/curadoria"');
    expect(readFileSync(join(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf8')).toContain("href: '/curadoria'");
    const page = readFileSync(join(process.cwd(), 'src/pages/Curadoria.tsx'), 'utf8');
    expect(page).not.toMatch(/ai-chat|generate-|openai|anthropic/i);
    expect(readFileSync(join(process.cwd(), 'src/lib/curadoria-api.ts'), 'utf8')).toContain("callEngine<Resumo>('curadoria', 'resumo'");
  });
});
