import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompetitorsReply, GeoOverview, PlanReport, TaxonomyOverview } from '@/lib/taxonomy-api';

const api = vi.hoisted(() => ({ callTaxonomy: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [{ id: '00000000-0000-4000-8000-0000000000b1', name: 'RDM Advogados', domain: 'rdmadvogados.com.br' }], isLoading: false }) }));
vi.mock('@/lib/taxonomy-api', async (orig) => ({ ...(await orig<typeof import('@/lib/taxonomy-api')>()), callTaxonomy: api.callTaxonomy }));

import Taxonomy from '@/pages/Taxonomy';
import { TaxonomyError } from '@/lib/taxonomy-api';

const P = '00000000-0000-4000-8000-0000000000b1';
const n = (i: number, over: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`, kind: 'matriz', parent_id: null, slug: `no-${i}`, label: `Nó ${i}`, keywords: [], source: 'site', status: 'sugerido', evidence: { total: 3 }, ...over });
const NODES = [
  n(1, { slug: 'criminal', label: 'Criminal', source: 'search_console', evidence: { total: 12, site: { count: 4, exemplos: ['https://rdm.com.br/criminal/'] }, search_console: { count: 8, weight: 3400, exemplos: ['advogado criminalista'] } } }),
  n(2, { slug: 'criminal/crimes-de-transito', label: 'Crimes de trânsito', kind: 'subarea', parent_id: n(1).id, status: 'aprovado', evidence: { total: 3, site: { count: 3, exemplos: [] } } }),
  n(3, { slug: 'criminal/crimes-de-transito/n/bafometro', label: 'bafometro', kind: 'nicho', parent_id: n(2).id, evidence: { total: 3, termo: 'bafometro', em: 'Crimes de trânsito' } }),
  n(4, { slug: 'transito-e-cnh', label: 'Trânsito e CNH', source: 'pacote', evidence: { total: 0, motivo: 'correlata de Criminal no pacote Advocacia' } }),
  n(5, { slug: 'criminal/c/tornozeleira-apitando-1a', label: 'tornozeleira apitando de madrugada', kind: 'cauda', parent_id: n(1).id, source: 'agente', evidence: { total: 1, gerado_por: 'agente', motivo: 'dúvida muito repetida', publico: 'família do preso', motores: ['google_serp', 'bing_serp'] } }),
] as TaxonomyOverview['nodes'];
const overview = (over: Partial<TaxonomyOverview> = {}): TaxonomyOverview => ({
  project: { id: P, name: 'RDM Advogados', domain: 'rdmadvogados.com.br' }, can_edit: true, paid_blocked: true,
  segments: [{ id: 'advocacia', label: 'Advocacia', status: 'validado', description: 'Escritórios de advocacia.', matrizes: 15, subareas: 34 }, { id: 'politica', label: 'Política e campanha (rascunho de exemplo)', status: 'rascunho', description: 'Exemplo.', matrizes: 1, subareas: 1 }],
  nodes: NODES, edges: [{ id: 'e1', from_id: NODES[0].id, to_id: NODES[3].id, relation: 'correlato', weight: 3, source: 'pacote', note: 'crimes de trânsito, embriaguez' }], geo_scope: [], campaigns: [], competitors_top: [],
  price_table: {
    serper: { label: 'Serper (Google)', price_per_1000_cents: 0, currency: 'USD', verified: false, note: 'Preço NÃO verificado', checked_at: null },
    manual: { label: 'Importação própria (você roda as buscas)', price_per_1000_cents: 0, currency: 'BRL', verified: true, note: '', checked_at: null },
  },
  phases: { '1': 'Fase 1: Brasil, capitais, 50 maiores cidades de SP', '2': 'Fase 2: 100 maiores cidades do Brasil', '3': 'Fase 3: estado de SP inteiro', '4': 'Fase 4: Brasil inteiro, camada básica' },
  ibge: { loaded: false, fetched_at: null, with_population: false }, limits: { max_persist_queries: 20000 }, ...over,
});
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Taxonomy /></MemoryRouter></QueryClientProvider>);
const respond = (map: Record<string, unknown | ((b: Record<string, unknown>) => unknown)>) => api.callTaxonomy.mockImplementation(async (action: string, body: Record<string, unknown>) => {
  const v = map[action];
  if (v === undefined) throw new Error(`ação não esperada: ${action}`);
  return typeof v === 'function' ? (v as (b: Record<string, unknown>) => unknown)(body) : v;
});
const calls = (action: string) => api.callTaxonomy.mock.calls.filter((c) => c[0] === action).map((c) => c[1] as Record<string, unknown>);
const openTab = async (name: string) => { fireEvent.mouseDown(await screen.findByRole('tab', { name }), { button: 0 }); fireEvent.click(screen.getByRole('tab', { name })); };
beforeEach(() => { localStorage.clear(); api.callTaxonomy.mockReset(); });

describe('taxonomia: tela, áreas', () => {
  it('mostra a árvore com status, evidências, origem, exemplos, a cauda do agente e os nichos correlatos', async () => {
    respond({ overview: overview() });
    mount();
    await screen.findByText('Criminal');
    const tree = screen.getByLabelText('Árvore de áreas');
    expect(tree.textContent).toMatch(/4 no site · 8 no Google \(3\.400 impressões\)/);
    expect(tree.textContent).toMatch(/origem: Google \(Search Console\)/);
    expect(tree.textContent).toMatch(/Nichos correlatos:\s*Trânsito e CNH \(crimes de trânsito, embriaguez\)/);
    expect(tree.textContent).toMatch(/Crimes de trânsito/);
    expect(tree.textContent).toMatch(/termo "bafometro" apareceu 3× em Crimes de trânsito/);
    expect(tree.textContent).toMatch(/correlata de Criminal no pacote Advocacia/);
    expect(tree.textContent).toMatch(/Busca específica \(cauda\)/);
    expect(tree.textContent).toMatch(/motivo do agente: dúvida muito repetida · público: família do preso · motores: google_serp, bing_serp · origem: Agente de IA/);
    expect(within(tree).getAllByText('Sugerido').length).toBeGreaterThan(0);
    expect(within(tree).getAllByText('Aprovado')).toHaveLength(1);
    fireEvent.click(within(tree).getAllByText(/Ver exemplos/)[0]);
    expect(tree.textContent).toMatch(/advogado criminalista/);
  });
  it('aprovar e rejeitar chamam a função com o nó e a decisão; renomear manda o nome novo; os avisos voltam na tela', async () => {
    respond({ overview: overview(), review: (b: Record<string, unknown>) => ({ updated: 1, decision: b.decision, warnings: b.decision === 'aprovado' ? ['A área "Trânsito" estava rejeitada e foi reaberta para caber o que está dentro dela.'] : [] }) });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar Criminal' }));
    await waitFor(() => expect(calls('review')).toEqual([{ projectId: P, nodeIds: [NODES[0].id], decision: 'aprovado' }]));
    expect((await screen.findByRole('status')).textContent).toMatch(/Atenção: A área "Trânsito" estava rejeitada e foi reaberta/);
    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar Trânsito e CNH' }));
    await waitFor(() => expect(calls('review')[1]).toEqual({ projectId: P, nodeIds: [NODES[3].id], decision: 'rejeitado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Criminal' }));
    fireEvent.change(screen.getByLabelText('Novo nome de Criminal'), { target: { value: 'Direito Penal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    await waitFor(() => expect(calls('review')[2]).toEqual({ projectId: P, nodeId: NODES[0].id, label: 'Direito Penal' }));
  });
  it('sugerir lê o site e o Google com o segmento escolhido e mostra o resumo em português; segmento em rascunho pode ser escolhido (modo aviso)', async () => {
    respond({ overview: overview(), suggest: { segment: 'advocacia', analyzed: { secoes: 2, paginas: 40, consultas: 120, dias: 90 }, classified: 130, unclassified: { count: 32, weight: 80, examples: [] }, nodes_new: 9, nodes_updated: 2, skipped_rejected: 1, edges_new: 4, edges_updated: 0, geo_new: 6, geo_updated: 0, warnings: ['Os municípios do IBGE ainda não foram carregados.'] } });
    mount();
    const seg = (await screen.findByLabelText('Tipo de negócio (segmento)')) as HTMLSelectElement;
    await waitFor(() => expect(seg.value).toBe('advocacia'));
    const draft = within(seg).getByText(/Política e campanha/) as HTMLOptionElement;
    expect(draft.disabled).toBe(false);
    expect(draft.textContent).toMatch(/rascunho \(aviso\)/);
    fireEvent.click(screen.getByRole('button', { name: /Sugerir a partir do site e do Google/ }));
    await waitFor(() => expect(calls('suggest')).toEqual([{ projectId: P, segment: 'advocacia' }]));
    const status = await screen.findByRole('status');
    expect(status.textContent).toMatch(/130 item\(ns\) classificado\(s\)/);
    expect(status.textContent).toMatch(/9 área\(s\) nova\(s\) sugerida\(s\)/);
    expect(status.textContent).toMatch(/32 item\(ns\) sem área identificada/);
    expect(status.textContent).toMatch(/Atenção: Os municípios do IBGE ainda não foram carregados/);
  });
  it('sem nada ainda: "Sem dados" e o caminho para começar', async () => {
    respond({ overview: overview({ nodes: [], edges: [] }) });
    mount();
    expect(await screen.findByText(/Sem dados\. Clique em "Sugerir a partir do site e do Google"/)).toBeTruthy();
  });
  it('papel só de leitura: vê tudo, não tem botão de aprovar e é avisado', async () => {
    respond({ overview: overview({ can_edit: false }) });
    mount();
    await screen.findByText('Criminal');
    expect(screen.queryByRole('button', { name: /Aprovar/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Sugerir a partir do site e do Google/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Seu papel permite ver, mas não alterar/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Trazer a cauda do agente' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('criar à mão manda tipo, pai e nome (inclui a busca específica)', async () => {
    respond({ overview: overview(), review: { created: 1, id: 'x', warnings: [] } });
    mount();
    await screen.findByText('Criminal');
    fireEvent.change(screen.getByLabelText('O que criar'), { target: { value: 'subarea' } });
    fireEvent.change(screen.getByLabelText('Dentro de'), { target: { value: NODES[0].id } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Execução penal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar e aprovar' }));
    await waitFor(() => expect(calls('review')).toEqual([{ projectId: P, create: { kind: 'subarea', parentId: NODES[0].id, label: 'Execução penal' } }]));
    fireEvent.change(screen.getByLabelText('O que criar'), { target: { value: 'cauda' } });
    expect(within(screen.getByLabelText('Dentro de')).getAllByRole('option').length).toBeGreaterThan(2);
  });
  it('erro da função aparece em português, sem código', async () => {
    respond({ overview: overview(), review: () => { throw new TaxonomyError('parent_kind_invalid'); } });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar Criminal' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Esse item não pode entrar dentro dessa área/);
  });
});

describe('taxonomia: tela, cauda do agente', () => {
  it('colar a lista do agente manda o texto e o segmento; mostra o resumo; pedir ao agente fica desligado com o motivo (bloqueio global)', async () => {
    respond({ overview: overview(), tail_import: { added: 3, already_there: 1, unattached: ['receita de bolo'], unattached_count: 1, invalid: 0, duplicates: 1, warnings: ['1 busca(s) ficaram sem área: diga a área de cada uma.'] } });
    mount();
    await screen.findByText('Criminal');
    expect(screen.getByText(/Quem escreve a cauda é o/).textContent).toMatch(/eu não imponho lista fixa, tamanho nem número de palavras/);
    const ask = screen.getByRole('button', { name: 'Pedir a cauda ao agente' }) as HTMLButtonElement;
    expect(ask.disabled).toBe(true);
    expect(screen.getByText(/Pedir ao agente é serviço pago e está bloqueado globalmente/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Lista do agente'), { target: { value: 'tornozeleira apitando\nprazo da tornozeleira' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trazer a cauda do agente' }));
    await waitFor(() => expect(calls('tail_import')).toEqual([{ projectId: P, text: 'tornozeleira apitando\nprazo da tornozeleira', segment: 'advocacia' }]));
    expect(calls('tail_generate')).toEqual([]);
    await waitFor(() => expect(screen.getAllByRole('status').some((e) => /3 busca\(s\) específica\(s\) sugerida\(s\); 1 já estavam; 1 repetida\(s\)/.test(e.textContent || ''))).toBe(true));
    expect(screen.getAllByRole('status').some((e) => /Sem área: receita de bolo/.test(e.textContent || ''))).toBe(true);
  });
});

describe('taxonomia: tela, onde atua', () => {
  const geo = (over: Partial<GeoOverview> = {}): GeoOverview => ({ loaded: true, total: 5571, by_uf: { SP: { municipios: 645, populacao: 46000000 }, SC: { municipios: 295, populacao: null } }, grandes_regioes: ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'], scope: [], ...over });
  const scope = (i: number, over: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${String(500 + i).padStart(12, '0')}`, country: 'br', language: 'pt-BR', uf: 'SP', ibge_code: 3534401, municipio: 'Osasco', bairro: null, regiao: null, role: 'atende', source: 'site', status: 'sugerido', evidence: { count: 4, weight: 300 }, ...over });

  it('sem município do IBGE carregado: diz "sem dados de cobertura" e oferece carregar (sem custo)', async () => {
    respond({ overview: overview(), geo_overview: geo({ loaded: false, total: 0, by_uf: {} }), geo_sync: { municipios: 5571, with_population: 5571, population_year: 2026, population_available: true } });
    mount();
    await openTab('Onde atua');
    expect(await screen.findByText(/municípios do IBGE ainda não carregados \(sem dados de cobertura\)/)).toBeTruthy();
    expect(screen.getByText(/base pública do IBGE \(sem chave e sem custo\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar municípios do IBGE' }));
    await waitFor(() => expect(calls('geo_sync')).toEqual([{ projectId: P }]));
    expect((await screen.findByRole('status')).textContent).toMatch(/5\.571 municípios carregados do IBGE \(com a população de 2026\)/);
  });
  it('Brasil > região > estado > município > bairro, mais países/mercados: cobertura, função, status e evidência; aprovar, rejeitar e remover', async () => {
    const rows = [
      scope(1), scope(2, { municipio: null, ibge_code: null, role: 'alvo', source: 'search_console', status: 'aprovado' }),
      scope(3, { bairro: 'Centro', source: 'ibge', evidence: {} }), scope(4, { country: 'pt', language: 'pt-BR', uf: null, ibge_code: null, municipio: 'Lisboa', role: 'alvo', status: 'aprovado', source: 'manual', evidence: {} }),
    ];
    respond({ overview: overview({ geo_scope: rows as never, ibge: { loaded: true, fetched_at: '2026-11-20T12:00:00.000Z', with_population: true } }), geo_overview: geo({ scope: rows as never }), scope_save: { added: 0, updated: 1, removed: 0 } });
    mount();
    await openTab('Onde atua');
    expect(await screen.findByText(/1 de 5\.571 municípios do IBGE \(0%\)/)).toBeTruthy();
    const sumario = (re: RegExp) => screen.getByText((_c, el) => el?.tagName === 'SUMMARY' && re.test(el.textContent || ''));
    expect(sumario(/São Paulo \(SP\)/).textContent).toMatch(/1 de 645 municípios · 3 lugar\(es\)/);
    expect(sumario(/Santa Catarina \(SC\)/).textContent).toMatch(/0 de 295 municípios/);
    expect(screen.getByText(/Estado inteiro: São Paulo/)).toBeTruthy();
    expect(screen.getByText('Centro (Osasco-SP)')).toBeTruthy();
    expect(screen.getByText(/Lisboa, Portugal \(pt:pt-BR\)/)).toBeTruthy();
    expect(screen.getByText(/Outros países e mercados/).textContent).toMatch(/1 lugar\(es\)/);
    expect(screen.getAllByText('Alvo (há demanda)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4 página\(s\)\/busca\(s\) · 300 impressões/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar lugar Osasco (SP) (Atende)' }));
    await waitFor(() => expect(calls('scope_save')[0]).toEqual({ projectId: P, decide: { ids: [rows[0].id], status: 'aprovado' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar lugar Osasco (SP) (Atende)' }));
    await waitFor(() => expect(calls('scope_save')[1]).toEqual({ projectId: P, decide: { ids: [rows[0].id], status: 'rejeitado' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover lugar Osasco (SP) (Atende)' }));
    await waitFor(() => expect(calls('scope_save')[2]).toEqual({ projectId: P, remove_ids: [rows[0].id] }));
  });
  it('sugerir bairros chama os distritos do IBGE e conta o que faltou', async () => {
    respond({ overview: overview(), geo_overview: geo(), geo_districts: { cities: 25, added: 120, existing: 0, failed: [], remaining: 5, warnings: [] } });
    mount();
    await openTab('Onde atua');
    fireEvent.click(await screen.findByRole('button', { name: 'Sugerir bairros (distritos do IBGE)' }));
    await waitFor(() => expect(calls('geo_districts')).toEqual([{ projectId: P }]));
    expect((await screen.findByRole('status')).textContent).toMatch(/120 bairro\(s\) sugerido\(s\) \(distritos do IBGE\) em 25 município\(s\) aprovado\(s\); faltam 5 município\(s\): clique de novo/);
  });
  it('adicionar lugar: função, estado, município, bairro e região; não deixa mandar município junto com região nem bairro sem município', async () => {
    respond({ overview: overview(), geo_overview: geo({ by_uf: {} }), scope_save: { added: 1, updated: 0, removed: 0, warnings: [] } });
    mount();
    await openTab('Onde atua');
    await screen.findByLabelText('Função do lugar');
    const add = screen.getByRole('button', { name: 'Adicionar lugar' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Função do lugar'), { target: { value: 'plantao' } });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'SP' } });
    fireEvent.change(screen.getByLabelText('Bairro (opcional)'), { target: { value: 'Tatuapé' } });
    expect(add.disabled).toBe(true); // bairro sem município
    fireEvent.change(screen.getByLabelText('Município (opcional)'), { target: { value: 'São Paulo' } });
    fireEvent.change(screen.getByLabelText('Região (opcional)'), { target: { value: 'ABC Paulista' } });
    expect(add.disabled).toBe(true); // município junto com região
    fireEvent.change(screen.getByLabelText('Região (opcional)'), { target: { value: '' } });
    fireEvent.click(add);
    await waitFor(() => expect(calls('scope_save')).toEqual([{ projectId: P, entries: [{ role: 'plantao', uf: 'SP', municipio: 'São Paulo', bairro: 'Tatuapé', regiao: null, country: 'br', language: 'pt-BR' }] }]));
  });
  it('adicionar um país/mercado (formato do NEXUS): sigla, língua e cidade; some o que é só do Brasil', async () => {
    respond({ overview: overview(), geo_overview: geo({ by_uf: {} }), scope_save: { added: 1, updated: 0, removed: 0, warnings: [] } });
    mount();
    await openTab('Onde atua');
    await screen.findByLabelText('Função do lugar');
    fireEvent.change(screen.getByLabelText('País (sigla)'), { target: { value: 'pt' } });
    expect(screen.queryByLabelText('Estado')).toBeNull();
    expect(screen.queryByLabelText('Bairro (opcional)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Cidade (opcional)'), { target: { value: 'Lisboa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar lugar' }));
    await waitFor(() => expect(calls('scope_save')).toEqual([{ projectId: P, entries: [{ role: 'atende', uf: null, municipio: 'Lisboa', bairro: null, regiao: null, country: 'pt', language: 'pt-BR' }] }]));
  });
});

describe('taxonomia: tela, planejador', () => {
  const planReply = (over: Partial<PlanReport['dry_run']> = {}, status = 'rascunho'): PlanReport => ({
    executed: false, campaign: { id: 'c1', name: 'Mercado SP', status, estimated_cost_cents: null, provider: 'auto', price_verified: false },
    dry_run: {
      per_phase: [{ phase: 1, label: 'Fase 1: Brasil, capitais, 50 maiores cidades de SP', queries: 1000, cost_cents: null }, { phase: 2, label: 'Fase 2: 100 maiores cidades do Brasil', queries: 400, cost_cents: null }], total_queries: 1400,
      cost: { provider: 'auto', paid: true, verified: false, pages_per_query: 1, currency: 'USD', by_provider: { serper: { queries: 1400, price_per_1000_cents: 0, currency: 'USD', verified: false, cents: null } } },
      engines: ['google_serp'], markets: ['br|pt-BR|', 'pt|pt-BR|Lisboa'], needs_agent: [],
      cap: { budget_cap_cents: 0, cost_known: false, fits_queries: null, fits_all: null, max_queries_by_cap: null }, persisted: 1400, truncated: false, warnings: ['O preço de serper NÃO foi verificado.'], central: [], in_budget_queries: null, sample: ['advogado criminalista', 'advogado criminalista em Guarulhos'], ...over,
    },
  });

  it('o plano é automático: não há escolha de fase, cidade nem motor; só "quem faz as buscas"', async () => {
    respond({ overview: overview({ geo_scope: [{ id: 'g1', status: 'aprovado' }] as never }) });
    mount();
    await openTab('Planejador de buscas');
    await screen.findByLabelText('Nome da campanha');
    expect(screen.getByText(/Eu cruzo sozinho o que você aprovou/).textContent).toMatch(/1 item\(ns\) na árvore, incluindo a cauda do agente, e 1 lugar\(es\) do escopo: bairros, cidades, regiões, estados e países/);
    expect(screen.getByText(/Você não escolhe fase, cidade nem motor/)).toBeTruthy();
    expect(screen.queryByText(/Fase 2: 100 maiores cidades do Brasil/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Fase/ })).toBeNull();
    expect(screen.getByLabelText(/Eu trago os resultados/)).toBeTruthy();
    expect(screen.getByLabelText(/O sistema busca/)).toBeTruthy();
  });
  it('custo zero (eu trago os resultados): manda provider manual e sem preço; a campanha já nasce aprovada', async () => {
    respond({ overview: overview(), campaign_plan: planReply({ cost: { provider: 'manual', paid: false, verified: true, pages_per_query: 1, currency: 'BRL', by_provider: {} }, warnings: [] }, 'aprovada') });
    mount();
    await openTab('Planejador de buscas');
    expect(screen.queryByLabelText(/Preço por 1\.000 consultas/)).toBeNull();
    expect(screen.queryByLabelText(/Teto de gasto/)).toBeNull();
    const go = await screen.findByRole('button', { name: 'Gerar o plano (não executa nada)' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome da campanha'), { target: { value: 'Grátis' } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(calls('campaign_plan')).toEqual([{ projectId: P, name: 'Grátis', provider: 'manual', segment: 'advocacia', budget_cap_cents: 0, pages_per_query: 1, price_table: undefined }]));
    const res = await screen.findByLabelText('Ensaio do plano (nada foi executado)');
    expect(res.textContent).toMatch(/Você traz os resultados: custo zero para o sistema, e a campanha já nasceu aprovada/);
    expect(screen.getAllByRole('status').some((e) => /Plano gerado e aprovado \(custo zero\)/.test(e.textContent || ''))).toBe(true);
  });
  it('o sistema busca (pago) sem preço conferido: o ensaio diz "custo desconhecido" e "nada foi executado nem cobrado"; o preço aparece como NÃO verificado', async () => {
    respond({ overview: overview(), campaign_plan: planReply() });
    mount();
    await openTab('Planejador de buscas');
    fireEvent.change(await screen.findByLabelText('Nome da campanha'), { target: { value: 'Mercado SP' } });
    fireEvent.click(screen.getByLabelText(/O sistema busca/));
    expect(screen.getByText(/Preço NÃO verificado: enquanto não for conferido, o custo aparece como desconhecido/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar o plano (não executa nada)' }));
    await waitFor(() => expect(calls('campaign_plan')).toEqual([{ projectId: P, name: 'Mercado SP', provider: 'auto', segment: 'advocacia', budget_cap_cents: 0, pages_per_query: 1, price_table: undefined }]));
    const res = await screen.findByLabelText('Ensaio do plano (nada foi executado)');
    expect(res.textContent).toMatch(/nada foi executado nem cobrado/);
    expect(res.textContent).toMatch(/motores google_serp e os mercados br:pt-BR, pt:pt-BR:Lisboa/);
    expect(res.textContent).toMatch(/Total: 1\.400 consultas · custo estimado desconhecido \(preço não verificado\)/);
    expect(res.textContent).toMatch(/Fase 2: 100 maiores cidades do Brasil.*400/);
    expect(res.textContent).toMatch(/serper: 1\.400 consultas · Preço NÃO verificado \(custo desconhecido\)/);
    expect(screen.getAllByRole('status').some((e) => /Nada foi executado nem cobrado/.test(e.textContent || ''))).toBe(true);
  });
  it('preço conferido e teto: manda centavos por 1.000 do provedor, a marca de verificado e o teto em centavos', async () => {
    respond({ overview: overview(), campaign_plan: planReply({ cost: { provider: 'auto', paid: true, verified: true, pages_per_query: 1, currency: 'USD', by_provider: { serper: { queries: 1400, price_per_1000_cents: 300, currency: 'USD', verified: true, cents: 420 } } }, cap: { budget_cap_cents: 500, cost_known: true, fits_queries: 1400, fits_all: true, max_queries_by_cap: 1400 } }) });
    mount();
    await openTab('Planejador de buscas');
    fireEvent.change(await screen.findByLabelText('Nome da campanha'), { target: { value: 'Com teto' } });
    fireEvent.click(screen.getByLabelText(/O sistema busca/));
    fireEvent.change(screen.getByLabelText(/Serper \(Google\): preço por 1\.000 consultas/), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText('Conferi o preço de Serper (Google) hoje'));
    fireEvent.change(screen.getByLabelText(/Teto de gasto/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar o plano (não executa nada)' }));
    await waitFor(() => expect(calls('campaign_plan')).toHaveLength(1));
    const b = calls('campaign_plan')[0] as { price_table: { serper: { price_per_1000_cents: number; verified: boolean; checked_at: string } }; budget_cap_cents: number; provider: string };
    expect(b).toMatchObject({ provider: 'auto', budget_cap_cents: 500 });
    expect(b.price_table.serper).toMatchObject({ price_per_1000_cents: 300, verified: true });
    expect(b.price_table.serper.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await screen.findByLabelText('Ensaio do plano (nada foi executado)')).textContent).toMatch(/cabem 1\.400 de 1\.400 consultas \(tudo cabe\)/);
  });
  it('campanhas: só a que custa dinheiro pede "Aprovar o custo"; a de custo zero já está aprovada; a execução paga aparece DESLIGADA com o motivo', async () => {
    const camp = (id: string, status: string, provider: string) => ({ id, name: `Camp ${id}`, status, phase: 4, budget_cap_cents: 500, estimated_cost_cents: 47, spent_cents: 0, provider, price_verified: true, config: { cost_known: true, price: { currency: 'USD' } }, created_at: '2026-11-20T10:00:00.000Z', queries: { total: 154, executada: 10, planejada: 144, erro: 0 } });
    respond({ overview: overview({ campaigns: [camp('a', 'aprovada', 'manual'), camp('b', 'aprovada', 'auto'), camp('c', 'rascunho', 'auto')] as never }), campaign_approve: { approved: true }, campaign_cancel: { cancelled: true } });
    mount();
    await openTab('Planejador de buscas');
    await screen.findByText('Camp a');
    expect(screen.queryByRole('button', { name: 'Aprovar o custo da campanha Camp a' })).toBeNull();
    expect(screen.getByText('Aguardando aprovação do custo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar o custo da campanha Camp c' }));
    await waitFor(() => expect(calls('campaign_approve')).toEqual([{ projectId: P, campaignId: 'c' }]));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar campanha Camp b' }));
    await waitFor(() => expect(calls('campaign_cancel')).toEqual([{ projectId: P, campaignId: 'b' }]));
    const exec = screen.getByRole('button', { name: 'Executar campanha Camp b' }) as HTMLButtonElement;
    expect(exec.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Executar campanha Camp a' })).toBeNull();
    expect(screen.getByText(/Execução bloqueada: os serviços pagos estão bloqueados globalmente/)).toBeTruthy();
    expect(calls('campaign_execute')).toEqual([]);
  });
  it('trazer resultados já obtidos: manda campanha, texto e a opção de criar consultas; mostra o resumo', async () => {
    const camp = { id: 'a', name: 'Camp a', status: 'aprovada', phase: 4, budget_cap_cents: 0, estimated_cost_cents: 0, spent_cents: 0, provider: 'manual', price_verified: true, config: {}, created_at: '2026-11-20T10:00:00.000Z', queries: { total: 2, executada: 0, planejada: 2, erro: 0 } };
    respond({ overview: overview({ campaigns: [camp] as never }), campaign_results_import: { results_added: 12, queries_with_results: 3, queries_created: 1, ignored_rows: 0, unknown_queries: 0, invalid: 2, duplicates: 0, truncated: false, competitors: 7, own_appearances: 1 }, competitors_list: { competitors: [], filtered: false, truncated: false } });
    mount();
    await openTab('Planejador de buscas');
    fireEvent.change(await screen.findByLabelText('Campanha'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Resultados'), { target: { value: 'consulta;posicao;url\nadvogado criminalista;1;https://a.com.br/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Importar resultados' }));
    await waitFor(() => expect(calls('campaign_results_import')).toEqual([{ projectId: P, campaignId: 'a', text: 'consulta;posicao;url\nadvogado criminalista;1;https://a.com.br/', create_missing: true, segment: 'advocacia' }]));
    expect((await screen.findByText(/12 resultado\(s\) guardado\(s\) em 3 consulta\(s\)/)).textContent).toMatch(/7 domínio\(s\) na lista de concorrentes\. 2 linha\(s\) inválida\(s\) ignorada\(s\)/);
  });
});

describe('taxonomia: tela, concorrentes', () => {
  const reply = (over: Partial<CompetitorsReply> = {}): CompetitorsReply => ({
    filtered: false, truncated: false,
    competitors: [
      { host: 'rival.com.br', kind: 'concorrente', appearances: 6, avg_position: 3, score: 42, areas: ['criminal'], locations: { brasil: 1, estados: { SP: 5 }, regioes: {}, municipios: { 'Guarulhos-SP': 3 }, bairros: { 'Tatuapé (São Paulo)': 2 }, paises: { pt: 2 } } },
      { host: 'jusbrasil.com.br', kind: 'diretorio', appearances: 2, avg_position: null, score: 9, areas: [], locations: { brasil: 0, estados: {}, regioes: {}, municipios: {} } },
    ] as never, ...over,
  });

  it('lista concorrentes com onde aparecem (país, estado, município, bairro) e marca diretórios/portais; posição sem dado aparece como "sem dados"', async () => {
    respond({ overview: overview(), competitors_list: reply() });
    mount();
    await openTab('Concorrentes');
    const table = await screen.findByRole('region', { name: 'Lista de concorrentes' });
    expect(table.textContent).toMatch(/rival\.com\.br/);
    expect(table.textContent).toMatch(/Criminal/);
    expect(table.textContent).toMatch(/Brasil 1× · pt 2× · SP 5× · Guarulhos-SP 3× · Tatuapé \(São Paulo\) 2×/);
    expect(within(table).getByText('Diretório/portal')).toBeTruthy();
    expect(within(table).getAllByText('sem dados').length).toBeGreaterThan(0);
    expect(calls('competitors_list')[0]).toEqual({ projectId: P, filter: {}, kind: 'concorrente', segment: 'advocacia' });
    expect(screen.getByText(/medida de presença, não de tráfego/)).toBeTruthy();
  });
  it('filtros: área, estado, município, bairro, país, região e alcance seguem para a função', async () => {
    respond({ overview: overview(), competitors_list: (b: Record<string, unknown>) => reply({ filtered: Object.keys(b.filter as object).length > 0, total: 1, results_used: 5, own_appearances: 1 }) });
    mount();
    await openTab('Concorrentes');
    await screen.findByLabelText('Área');
    fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'criminal' } });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'SP' } });
    fireEvent.change(screen.getByLabelText('Município'), { target: { value: ' Guarulhos ' } });
    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: ' Tatuapé ' } });
    fireEvent.change(screen.getByLabelText('País (sigla)'), { target: { value: 'PT' } });
    fireEvent.change(screen.getByLabelText('Região'), { target: { value: 'ABC Paulista' } });
    fireEvent.change(screen.getByLabelText('Alcance da busca'), { target: { value: 'municipio' } });
    fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: 'todos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => expect(calls('competitors_list')[1]).toEqual({ projectId: P, filter: { area: 'criminal', uf: 'SP', municipio: 'Guarulhos', bairro: 'Tatuapé', country: 'pt', regiao: 'ABC Paulista', scope: 'municipio' }, kind: 'todos', segment: 'advocacia' }));
    expect(await screen.findByText(/1 domínio\(s\) neste filtro · 5 resultado\(s\) usados · o seu site apareceu 1×/)).toBeTruthy();
  });
  it('sem resultado nenhum: "Sem dados"', async () => {
    respond({ overview: overview(), competitors_list: reply({ competitors: [] }) });
    mount();
    await openTab('Concorrentes');
    expect(await screen.findByText(/Sem dados para este filtro/)).toBeTruthy();
  });
});

describe('taxonomia: tela, celular (400px)', () => {
  it('sem rolagem horizontal da página: contêiner com margens e tabelas só dentro de caixas com rolagem própria', async () => {
    respond({ overview: overview(), competitors_list: { filtered: false, truncated: false, competitors: [{ host: 'a.com.br', kind: 'concorrente', appearances: 1, avg_position: 1, score: 10, areas: [], locations: { brasil: 1, estados: {}, regioes: {}, municipios: {} } }] } });
    const { container } = mount();
    await screen.findByText('Criminal');
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toMatch(/\bw-full\b/);
    expect(shell.className).toMatch(/\bpx-4\b/);
    expect(shell.className).not.toMatch(/min-w-/);
    await openTab('Concorrentes');
    await screen.findByRole('region', { name: 'Lista de concorrentes' });
    for (const t of Array.from(container.querySelectorAll('table'))) expect(t.closest('.overflow-x-auto'), 'tabela fora de caixa com rolagem').not.toBeNull();
    for (const el of Array.from(container.querySelectorAll('input[class*="w-"], select[class*="w-"]'))) expect((el as HTMLElement).className).toMatch(/max-w-full|w-full/);
    expect(screen.getByRole('tablist').className).toMatch(/flex-wrap/);
  });
});
