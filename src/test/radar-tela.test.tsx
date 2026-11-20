import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync } from 'node:fs';
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
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'Acme Studio', organization_id: '00000000-0000-4000-8000-0000000000a1' }], isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Radar from '@/pages/Radar';
import { PT, EN, ES } from '@/lib/i18n/radar-dict';

const P = '00000000-0000-4000-8000-0000000000b1';
const NO_YT = 'Falta a chave do Google para o YouTube. Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis e guarde a chave.';
const focus = (over: Record<string, unknown> = {}) => ({ id: 'f1', name: 'Depilação a laser', weight: 7, topics: ['depilação a laser', 'laser facial'], audiences: ['alvo'], segment_node_id: null, segment_label: null, modalities: ['web'], language: 'pt-BR', status: 'ativo', needs_review: true, compliance_mode: 'aviso', source: 'frase', places: { total: 12, aprovado: 2, sugerido: 10 }, ...over });
const overview = (over: Record<string, unknown> = {}) => ({
  project: { id: P, name: 'Acme Studio', domain: 'acme.example' }, can_edit: true, can_admin: true, focuses: [focus()],
  totals: { competitors: 14, identities: 30, pages: 90, listings: 20, scanned_sites: 5, links: 40 }, providers: { serper: true, dataforseo: false, brave: false, youtube: false, open_pagerank: false, third_party: false },
  youtube: { available: false, message: NO_YT }, cost: { radar_today_micros: 120_000, day: { remaining_micros: 6_500_000, used_micros: 500_000, cap_micros: 7_000_000 }, basis: 'x' },
  saturation: { rounds: 3, recent_new_rate: 0.04, trending_to_zero: true, saturated: false, message_key: 'tendendo_a_zero' }, runs: [], schedules: [], orphans: { total: 0, counts: {}, zero: true },
  limits: { social: 'x', score: 'x', authority: [], overpass: null, osm_attribution: null, platforms: [] }, ...over,
});
const comp = (over: Record<string, unknown> = {}) => ({
  id: 'c1', name: 'Studio Ana Bela', kind: 'desconhecido', primary_host: 'studioanabela.example', is_own: false, status: 'sugerido',
  identities: [
    { id: 'i1', platform: 'site', kind: 'site', handle: 'studioanabela.example', metrics: {}, metrics_label: 'indisponivel' },
    { id: 'i2', platform: 'tiktok', kind: 'perfil', handle: 'studioanabela', metrics: { followers: 8300 }, metrics_label: 'trecho_publico_do_buscador' },
    { id: 'i3', platform: 'youtube', kind: 'canal', handle: 'UCabcdefghijklmnopqrstuv', metrics: { subscribers: 4300, videos: 120 }, metrics_label: 'api_oficial' },
    { id: 'i4', platform: 'instagram', kind: 'perfil', handle: 'perfil_com_um_nome_de_usuario_muito_muito_longo_para_o_celular', metrics: {}, metrics_label: 'indisponivel' },
  ],
  maps: { listings: 1, rating: 4.8, reviews: 200 }, pages: 5, links: 3, score: { value: 63.4, coverage: 0.8, label: 'estimado' }, trend: { direction: 'subindo', delta: 9, points: 4 }, authority: {}, ...over,
});
const terr = () => ({
  focus: { id: 'f1', name: 'Depilação a laser' }, attributions: ['© OpenStreetMap contributors (ODbL)'], counts: { total: 2, aprovado: 1, sugerido: 1, rejeitado: 0, inferido: 1 },
  places: [
    { id: 'fp1', place: { id: 'g1', name: 'Guarulhos', level: 'municipio', label: 'Guarulhos', parents: ['São Paulo'], population: 1291784, source: 'ibge', license: null, attribution: null }, origin: 'frase', why: [{ rule: 'citado_na_frase', via: null, detail: 'Citado na frase: "Guarulhos"' }], inferred: false, status: 'aprovado', weight_mult: 1 },
    { id: 'fp2', place: { id: 'g2', name: 'Tatuapé', level: 'bairro', label: 'Tatuapé, São Paulo', parents: ['São Paulo'], population: null, source: 'osm', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors (ODbL)' }, origin: 'zona', why: [{ rule: 'zona_membro', via: 'Zona Leste', detail: 'Tatuapé faz parte de Zona Leste (agrupamento informal, inferido: confira)' }], inferred: true, status: 'sugerido', weight_mult: 1 },
  ],
});
const plan = (over: Record<string, unknown> = {}) => ({
  providers: overview().providers, engines: ['serper'], tasks_total: 120, truncated: false, notes: [], by_modality: { web: { tasks: 60, est_micros: 120000 } }, estimated_total_micros: 240_000, cost_basis: 'estimativa',
  coverage: { planned_total: 120, done: 30, pending: 90, errors: 0, skipped_budget: 0, cost_micros: 60_000, last_queried_at: '2026-11-19T10:00:00.000Z', pct_done: 25, by_focus: [{ focus_id: 'f1', name: 'Depilação a laser', total: 120, done: 30, pending: 90 }] }, day: null, sample: [], blocked_reason: null, ...over,
});

let state: { ov: unknown; plan: unknown; comps: unknown; orphans: unknown; role?: string };
beforeEach(() => {
  api.call.mockReset();
  state = { ov: overview(), plan: plan(), comps: { competitors: [comp()], total: 1, disclaimer: 'Score ESTIMADO pelo Zica. Não é a nota do Google, nem DR, nem Domain Authority.', availability: {} }, orphans: { items: [], counts: {}, total: 0, zero_orphans: true, auto_fixable: 0, goal: 'zero pontas soltas' } };
  try { localStorage.removeItem('zica-locale'); } catch { /* ok */ }
  api.call.mockImplementation(async (module: string, action: string, body: Record<string, unknown>) => {
    if (module === 'eventos') return { events: [] };
    if (module !== 'radar') throw new Error(`módulo inesperado ${module}`);
    switch (action) {
      case 'overview': return state.ov;
      case 'plan': return state.plan;
      case 'coverage': return { coverage: (state.plan as { coverage: unknown }).coverage, saturation: overview().saturation, runs: [{ id: 'r1', kind: 'semanal', status: 'parada_no_teto', queries_planned: 10, queries_done: 4, new_entities: 2, total_entities: 14, cost_micros: 8000, stop_reason: 'daily_cap_reached', started_at: '2026-11-19T10:00:00.000Z', finished_at: null }], honesty: 'x' };
      case 'territory': return terr();
      case 'competitors_list': return state.comps;
      case 'focus_save': return { id: body.focusId, updated: true };
      case 'focus_from_text': return { source: 'heuristica', ai_note: 'teto_diario', saved: true, geo_loaded: false, geo_hint: 'territory_sync', issues: [], focuses: [{ id: 'f9', name: 'criminal', weight: 8, topics: ['embriaguez ao volante'], places_saved: 0, taxonomy_node: null, resolved: [], unresolved: [{ mention: { text: 'Zona Leste' }, status: 'nao_encontrado', note: 'pacote_de_zonas_nao_carregado' }], expansion: { added: 0, truncated: false, sample: [] } }] };
      case 'territory_decide': return { updated: 1 };
      case 'run_batch': return { run_id: 'r2', ok: true, queries_planned: 40, queries_done: 12, errors: 0, cost_micros: 24_000, cost_basis: 'estimado', new_entities: 3, total_entities: 17, stopped: 'teto_diario', stop_reason: 'daily_cap_reached', budget_micros: 500000, day_remaining_micros: 0, saturation: overview().saturation, engines: ['serper'] };
      case 'youtube_discover': return { status: 'sem_chave', message: NO_YT, searches: 0, channels: 0, videos: 0 };
      case 'orphans': return state.orphans;
      case 'orphan_fix': return { applied: 2, skipped: [], remaining: { ...(state.orphans as object), total: 0, zero_orphans: true } };
      case 'scoreboard': return { own: null, rows: [{ competitor_id: 'c1', name: 'Studio Ana Bela', is_own: false, status: 'sugerido', score: 63.4, coverage: 0.8, label: 'estimado', components: [{ key: 'serp', weight: 22, value: 70, facts: {} }, { key: 'ai', weight: 14, value: null, facts: {} }], trend: { direction: 'caindo', delta: -6, points: 3 } }], leader: null, gap: null, disclaimer: 'Score ESTIMADO pelo Zica. Não é a nota do Google, nem DR, nem Domain Authority.', weights: {} };
      case 'attack_list': return { items: [{ id: 'a1', kind: 'posicao_4_20', priority: 80, title: 'depilação a laser guarulhos', why: 'Está na posição 7,2 com 1.000 impressões.', what: 'Reforce a página.', facts: {}, focus_name: 'Depilação a laser', place_name: null, node_label: null }], has_search_console: false, ctr_note: 'curva genérica' };
      case 'landscape': return { by: body.by, rows: [{ id: 'f1', label: 'Depilação a laser', competitors: 4, with_site: 1, with_maps: 1, with_instagram: 3, with_tiktok: 2, with_kwai: 1, with_youtube: 2, with_facebook: 0, with_linkedin: 0, videos_total: 150, posts_30d: 3, reviews_total: 220, rating_avg: 4.4, strength_avg: 51.2, strength_top: 63 }], disclaimer: 'x' };
      case 'tree_overlap': return { nodes: [{ node_id: 'n1', label: 'Estética', kind: 'matriz', depth: 0, competitors: [{ id: 'c1', name: 'Studio Ana Bela', score: 63 }], own_score: null, leader_score: 63, gap: null, attacks: 1, empty: false }, { node_id: 'n2', label: 'Odontologia', kind: 'matriz', depth: 0, competitors: [], own_score: null, leader_score: null, gap: null, attacks: 0, empty: true }], disclaimer: 'x' };
      default: throw new Error(`ação inesperada ${action}`);
    }
  });
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Radar /></MemoryRouter></QueryClientProvider>);
const calls = (action: string) => api.call.mock.calls.filter((c) => c[0] === 'radar' && c[1] === action).map((c) => c[2]);
const tab = async (name: RegExp) => fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0, ctrlKey: false });

describe('Radar: tela', () => {
  it('chama o portão engine com module="radar", mostra os avisos honestos e o custo do dia', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: /Quem disputa o seu mercado/ })).toBeTruthy();
    expect(api.call).toHaveBeenCalledWith('radar', 'overview', { projectId: P });
    const aside = await screen.findByRole('complementary', { name: 'Avisos honestos' });
    await waitFor(() => expect(aside.textContent).toMatch(/Habilite a YouTube Data API v3/));
    expect(aside.textContent).toMatch(/ESTIMADO pelo Zica/);
    expect(aside.textContent).toMatch(/Não é a nota do Google/);
    expect(aside.textContent).toMatch(/Não raspamos redes sociais nem usamos login/);
    expect(aside.textContent).toMatch(/não de tudo o que existe/);
    expect(aside.textContent).toMatch(/Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis/); // diz exatamente o que habilitar
    const cost = await screen.findByLabelText('Custo do dia');
    expect(cost.textContent).toMatch(/Radar hoje: US\$ 0,12/);
    expect(cost.textContent).toMatch(/Resta no teto do dia: US\$ 6,50/);
    expect(cost.textContent).toMatch(/zero pontas soltas/);
  });
  it('Foco: peso editável de 1 a 10 grava pelo portão; leitor não edita', async () => {
    mount();
    const sel = (await screen.findByLabelText('Peso (1 a 10)')) as HTMLSelectElement;
    expect(sel.value).toBe('7');
    expect(sel.options).toHaveLength(10);
    fireEvent.change(sel, { target: { value: '10' } });
    await waitFor(() => expect(calls('focus_save')).toEqual([{ projectId: P, focusId: 'f1', weight: 10 }]));
    expect(await screen.findByText('Salvo.')).toBeTruthy();
    expect(screen.getByText('revisar')).toBeTruthy();
    expect(screen.getByText('sem nó da árvore')).toBeTruthy();
  });
  it('leitor (sem permissão de escrita) vê o Foco mas os controles ficam desligados', async () => {
    state.ov = overview({ can_edit: false, can_admin: false });
    mount();
    expect(((await screen.findByLabelText('Peso (1 a 10)')) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Criar Foco(s)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Seu papel permite ver, mas não alterar.')).toBeTruthy();
    expect(screen.queryByText(/Carregar territórios das fontes abertas/)).toBeNull(); // só administrador
  });
  it('frase do dono: cria Focos, avisa "SEM IA" e que o banco de lugares está vazio (nada inventado)', async () => {
    mount();
    const box = await screen.findByPlaceholderText(/Descreva o foco/);
    fireEvent.change(box, { target: { value: 'ênfase em criminal na Zona Leste, Norte, Sul, Guarulhos e região' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar Foco(s)' }));
    await waitFor(() => expect(calls('focus_from_text')).toHaveLength(1));
    expect(calls('focus_from_text')[0]).toMatchObject({ projectId: P, save: true });
    expect(await screen.findByText(/criado\(s\) SEM IA/)).toBeTruthy();
    expect(screen.getByText(/O banco de lugares ainda está vazio: nenhum território foi inventado/)).toBeTruthy();
    expect(screen.getByText(/O teto diário de gasto negou a IA/)).toBeTruthy();
    expect(screen.getByText(/Zona Leste \(pacote_de_zonas_nao_carregado\)/)).toBeTruthy();
  });
  it('território: mostra "por que entrou", marca o inferido, a atribuição do OpenStreetMap e decide por lugar', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver território' }));
    expect(await screen.findByText('Tatuapé, São Paulo')).toBeTruthy();
    const region = screen.getByLabelText('Território do Foco');
    expect(region.textContent).toMatch(/Por que entrou: faz parte da zona \(Zona Leste\)/);
    expect(region.textContent).toMatch(/agrupamento informal, inferido: confira/);
    expect(region.textContent).toMatch(/inferido/);
    expect(region.textContent).toMatch(/© OpenStreetMap contributors \(ODbL\)/);
    expect(region.textContent).toMatch(/2 lugares: 1 aprovados, 1 sugeridos, 1 inferidos/);
    fireEvent.click(within(region).getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(calls('territory_decide')).toEqual([{ projectId: P, focusId: 'f1', ids: ['fp2'], status: 'aprovado' }]));
  });
  it('rodada: pede confirmação com o valor, para no teto diário e diz isso; sem chave de busca o botão fica desligado', async () => {
    mount();
    await tab(/Cobertura e rodadas/);
    expect(await screen.findByText(/30 de 120 consultas feitas \(25%\)/)).toBeTruthy();
    expect(screen.getByText(/tendendo a zero/)).toBeTruthy();
    expect(screen.getByText(/Cobertura do espaço definido/)).toBeTruthy();
    expect(screen.getByText(/parada no teto/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rodar agora…' }));
    expect(calls('run_batch')).toHaveLength(0); // primeiro clique só pede confirmação
    fireEvent.click(screen.getByRole('button', { name: /Confirmar: gastar até US\$ 0,50 \(estimado\)/ }));
    await waitFor(() => expect(calls('run_batch')).toEqual([{ projectId: P, budgetMicros: 500_000, maxQueries: 40 }]));
    expect(await screen.findByText(/A rodada PAROU: o teto diário de gasto negou a próxima chamada/)).toBeTruthy();
    expect(screen.getByText(/Motivo registrado: daily_cap_reached/)).toBeTruthy();
  });
  it('sem chave de busca: avisa e desliga a rodada; YouTube sem chave mostra a instrução exata', async () => {
    state.plan = plan({ blocked_reason: 'radar_no_provider_key', providers: { ...overview().providers, serper: false } });
    state.ov = overview({ providers: { ...overview().providers, serper: false } });
    mount();
    await tab(/Cobertura e rodadas/);
    expect(await screen.findByText(/Nenhuma chave de busca guardada/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Rodar agora…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar canais e vídeos no YouTube' }));
    expect(await screen.findByText(/Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis/, { selector: 'p[role="status"]' })).toBeTruthy();
  });
  it('concorrentes: score ESTIMADO, tendência com texto, redes com a ORIGEM de cada número e "indisponível" onde não há API', async () => {
    mount();
    await tab(/Concorrentes/);
    const card = (await screen.findByText('Studio Ana Bela')).closest('li')!;
    expect(card.textContent).toMatch(/63,4\/100 · estimado/);
    expect(card.textContent).toMatch(/subindo \(\+9\)/);
    expect(card.textContent).toMatch(/Maps: nota 4.8 \(200 avaliações\)/);
    expect(card.textContent).toMatch(/TikTok studioanabela · seguidores: 8\.300/);
    expect(card.textContent).toMatch(/estimado: trecho público do buscador/);
    expect(card.textContent).toMatch(/YouTube.*inscritos: 4\.300.*API oficial/);
    expect(card.textContent).toMatch(/métricas indisponíveis sem API oficial\/parceiro/);
    expect(screen.getByText(/Score ESTIMADO pelo Zica. Não é a nota do Google/)).toBeTruthy();
    expect(calls('competitors_list')[0]).toEqual({ projectId: P });
    fireEvent.change(screen.getByLabelText('Plataforma'), { target: { value: 'tiktok' } });
    await waitFor(() => expect(calls('competitors_list').some((c) => (c as { platform?: string }).platform === 'tiktok')).toBe(true));
  });
  it('placar, onde atacar, retrato e árvore: por que, o que fazer, contagens e galho sem concorrente', async () => {
    mount();
    await tab(/Placar/);
    expect(await screen.findByText(/caindo \(-6\)/)).toBeTruthy();
    expect(screen.getAllByText(/estimado/).length).toBeGreaterThan(0);
    await tab(/Onde atacar/);
    expect(await screen.findByText('depilação a laser guarulhos')).toBeTruthy();
    expect(screen.getByText(/Está na posição 7,2/)).toBeTruthy();
    expect(screen.getByText('Reforce a página.')).toBeTruthy();
    expect(screen.getByText(/O Search Console não está conectado/)).toBeTruthy();
    await tab(/Retrato e árvore/);
    const h = await screen.findByRole('heading', { name: 'Depilação a laser' });
    const li = h.closest('li')!;
    expect(li.textContent).toMatch(/Concorrentes4/);
    expect(li.textContent).toMatch(/Instagram3/);
    expect(li.textContent).toMatch(/TikTok2/);
    expect(li.textContent).toMatch(/Kwai1/);
    expect(li.textContent).toMatch(/YouTube2/);
    expect(li.textContent).toMatch(/Vídeos no YouTube: 150/);
    expect(await screen.findByText('sem concorrente mapeado')).toBeTruthy();
  });
  it('pontas soltas: zero mostra a meta cumprida; com itens lista a sugestão e liga com um clique', async () => {
    mount();
    await tab(/Pontas soltas/);
    expect(await screen.findByText('Zero pontas soltas: tudo está ligado à árvore.')).toBeTruthy();
  });
  it('pontas soltas com itens: lista a sugestão com a confiança e liga com um clique', async () => {
    state.orphans = { items: [{ kind: 'perfil_sem_concorrente', ref: 'i9', label: 'instagram:advocaciarainov', suggestion: { action: 'ligar_identidade', target_id: 'c1', target_label: 'Advocacia Rainov', confidence: 0.85, auto: true } }, { kind: 'foco_sem_territorio', ref: 'f2', label: 'Tributário', suggestion: { action: 'definir_territorio', target_id: null, target_label: null, confidence: 1, auto: false } }], counts: { perfil_sem_concorrente: 1, foco_sem_territorio: 1 }, total: 2, zero_orphans: false, auto_fixable: 1, goal: 'zero pontas soltas' };
    state.ov = overview({ orphans: { total: 2, counts: {}, zero: false } });
    mount();
    expect(await screen.findByText('2 pontas soltas')).toBeTruthy(); // aparece no cabeçalho (saúde da árvore)
    await tab(/Pontas soltas/);
    expect(await screen.findByText(/Sugestão: ligar o perfil ao concorrente → Advocacia Rainov \(confiança 85%\)/)).toBeTruthy();
    expect(screen.getByText(/Sugestão: definir o território/)).toBeTruthy(); // sem alvo automático: o botão Ligar só existe para o que tem alvo
    expect(screen.getAllByText(/perfil sem concorrente/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(calls('orphan_fix')).toEqual([{ projectId: P, refs: ['i9'] }]));
    expect(await screen.findByText('2 ligações feitas; sobram 0 pontas soltas.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ligar 1 sugestões automáticas' }));
    await waitFor(() => expect(calls('orphan_fix')).toHaveLength(2));
  });
  it('idioma: a tela troca para inglês e espanhol e cai no português só onde falta tradução', async () => {
    mount();
    await screen.findByRole('heading', { name: /Quem disputa/ });
    fireEvent.change(screen.getByLabelText('Idioma da tela'), { target: { value: 'en' } });
    expect(await screen.findByRole('heading', { name: /Who competes for your market/ })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Honest notices' }).textContent).toMatch(/not Google's score/);
    expect(screen.getByRole('tab', { name: 'Where to attack' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Screen language'), { target: { value: 'es' } });
    expect(await screen.findByRole('heading', { name: /¿Quién disputa su mercado/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Cabos sueltos' })).toBeTruthy();
  });
  it('celular: nada de tabela larga nem largura fixa; texto longo quebra linha', async () => {
    const { container } = mount();
    await screen.findByRole('heading', { name: /Quem disputa/ });
    await tab(/Concorrentes/);
    await screen.findByText('Studio Ana Bela');
    expect(container.querySelectorAll('table').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/overflow-x-(scroll|auto)/);
    expect(container.innerHTML).not.toMatch(/min-w-\[(?:[5-9]\d\d|\d{4,})px\]/);
    expect(container.querySelector('li.space-y-2')!.innerHTML).toMatch(/break-words/);
  });
});

describe('Radar: dicionários', () => {
  const dir = join(process.cwd(), 'src');
  const files = [...readdirSync(join(dir, 'components', 'radar')).map((f) => join(dir, 'components', 'radar', f)), join(dir, 'pages', 'Radar.tsx')];
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const staticKeys = [...src.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
  it('toda chave usada na tela existe no pt-BR e en/es cobrem as mesmas chaves (nunca aparece chave crua)', () => {
    expect(staticKeys.length).toBeGreaterThan(150);
    for (const k of new Set(staticKeys)) expect(PT[k], `pt-BR sem ${k}`).toBeTruthy();
    const missingEn = Object.keys(PT).filter((k) => !EN[k]); const missingEs = Object.keys(PT).filter((k) => !ES[k]);
    expect(missingEn).toEqual([]);
    expect(missingEs).toEqual([]);
  });
  it('famílias dinâmicas de rótulo estão completas (plataformas, níveis, motivos, tipos de ataque e de ponta solta)', () => {
    const fam: Record<string, string[]> = {
      plat: ['site', 'gbp', 'instagram', 'tiktok', 'kwai', 'facebook', 'linkedin', 'x', 'youtube', 'pinterest', 'threads'], level: ['pais', 'uf', 'regiao', 'municipio', 'distrito', 'bairro', 'zona'],
      why: ['citado_na_frase', 'zona_membro', 'mesma_regiao_metropolitana', 'mesma_regiao_imediata', 'raio_km', 'maior_cidade_do_estado', 'filho_do_lugar', 'manual'], atk: ['posicao_4_20', 'territorio_fraco', 'lacuna_serp', 'buraco_maps', 'correcao_barata'],
      orphan: ['perfil_sem_concorrente', 'concorrente_sem_no', 'concorrente_sem_foco', 'no_sem_concorrente', 'territorio_sem_varredura', 'prompt_sem_foco', 'foco_sem_no', 'foco_sem_territorio'],
      scomp: ['serp', 'maps', 'content', 'local', 'authority', 'ai', 'reviews', 'social'], label: ['api_oficial', 'trecho_publico_do_buscador', 'provedor_terceiro', 'indisponivel'], trend: ['subindo', 'caindo', 'estavel', 'sem_dados'],
      sat: ['sem_rodadas', 'poucas_rodadas', 'ainda_descobrindo', 'tendendo_a_zero', 'saturado'], oact: ['ligar_identidade', 'ligar_no', 'ligar_foco', 'rodar_descoberta', 'criar_foco', 'definir_no', 'definir_territorio'],
      rstatus: ['executando', 'concluida', 'parada_no_teto', 'erro'], metric: ['followers', 'following', 'posts', 'videos', 'likes', 'subscribers', 'views', 'last_30d', 'last_90d', 'days_since_last'],
    };
    for (const [f, list] of Object.entries(fam)) for (const k of list) { expect(PT[`${f}.${k}`], `${f}.${k}`).toBeTruthy(); expect(EN[`${f}.${k}`], `en ${f}.${k}`).toBeTruthy(); expect(ES[`${f}.${k}`], `es ${f}.${k}`).toBeTruthy(); }
  });
});
