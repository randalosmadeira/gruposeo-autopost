import { describe, expect, it } from 'vitest';
import {
  ALL_PHASES, AUTO_PROVIDER, DEFAULT_ENGINES, DEFAULT_NOISE_HOSTS, DEFAULT_PRICE_TABLE, MANUAL_PROVIDER, MAX_SERP_IMPORT_CHARS, aggregateCompetitors, competitorHost, consultaDoNo, costOf, deriveEngines, isNoiseHost, normalizePriceTable, parseSerpImport, planCampaign,
  type CompetitorFilter, type PlanInput, type PlanNodeIn, type QueryMeta, type ResultRow,
} from '../../supabase/functions/_shared/market-campaign-core';
import { CAPITAIS, PACK_ADVOCACIA } from '../../supabase/functions/_shared/taxonomy-core';

// Municípios sintéticos (nomes inventados de propósito): 27 capitais, 100 cidades de SP e 150 de MG, todas com população decrescente.
const munis = [
  ...CAPITAIS.map((c, i) => ({ ibge_code: c.ibge_code, nome: c.nome, uf: c.uf, populacao: 3_000_000 - i * 10_000 })),
  ...Array.from({ length: 100 }, (_, i) => ({ ibge_code: 3500000 + i, nome: `Cidade SP ${String(i).padStart(3, '0')}`, uf: 'SP' as const, populacao: 2_000_000 - i * 5_000 })),
  ...Array.from({ length: 150 }, (_, i) => ({ ibge_code: 3100000 + i, nome: `Vila MG ${String(i).padStart(3, '0')}`, uf: 'MG' as const, populacao: 1_000_000 - i * 3_000 })),
];
const matriz = (slug: string, label: string, ev = 0): PlanNodeIn => ({ id: `id-${slug}`, slug, kind: 'matriz', label, parentSlug: null, evidenceTotal: ev });
const slg = (s: string) => s.normalize('NFD').replace(/[\u0080-\uffff]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sub = (parent: string, label: string, ev = 0): PlanNodeIn => ({ id: `id-${parent}-${slg(label)}`, slug: `${parent}/${slg(label)}`, kind: 'subarea', label, parentSlug: parent, evidenceTotal: ev });
const NODES = [matriz('criminal', 'Criminal', 100), matriz('trabalhista', 'Trabalhista', 50), matriz('pecas-e-modelos', 'Peças e modelos')];
// os testes de fase pedem a fase 1 de propósito; o padrão do planejador é gerar TODAS as fases sozinho (testado à parte)
const base = (over: Partial<PlanInput> = {}): PlanInput => ({ nodes: NODES, pack: PACK_ADVOCACIA, municipios: munis, scope: [], phases: [1], provider: MANUAL_PROVIDER, budgetCapCents: 0, ...over });
const verified = (cents: number) => normalizePriceTable({ serper: { price_per_1000_cents: cents, verified: true, checked_at: '2026-11-20' } });
const eq = (n: number, engine = 'google_serp') => Array.from({ length: n }, () => ({ engine }));

describe('planejador: tabela de preços', () => {
  it('o padrão não inventa preço: tudo zero e NÃO verificado, exceto a importação própria', () => {
    for (const k of ['serper', 'dataforseo', 'serpapi']) expect(DEFAULT_PRICE_TABLE[k]).toMatchObject({ price_per_1000_cents: 0, verified: false, checked_at: null });
    expect(DEFAULT_PRICE_TABLE.serper.note).toMatch(/NÃO verificado/);
    expect(DEFAULT_PRICE_TABLE.manual).toMatchObject({ price_per_1000_cents: 0, verified: true });
  });
  it('valida o que o cliente manda: provedor, inteiro, limites; "verificado" exige preço maior que zero; "manual" não muda', () => {
    const t = normalizePriceTable({
      serper: { price_per_1000_cents: 300, verified: true, checked_at: '2026-11-20', currency: 'USD', label: 'Serper X' },
      serpapi: { price_per_1000_cents: 0, verified: true }, dataforseo: { price_per_1000_cents: -5 }, 'Mau Nome!': { price_per_1000_cents: 1 }, outro: { price_per_1000_cents: 2.5 }, manual: { price_per_1000_cents: 999, verified: false },
      novo_provedor: { price_per_1000_cents: 70, checked_at: 'ontem', currency: 'dólar' },
    });
    expect(t.serper).toMatchObject({ price_per_1000_cents: 300, verified: true, checked_at: '2026-11-20', label: 'Serper X' });
    expect(t.serpapi.verified).toBe(false);
    expect(t.dataforseo.price_per_1000_cents).toBe(0);
    expect(t['Mau Nome!']).toBeUndefined(); expect(t.outro).toBeUndefined();
    expect(t.manual).toMatchObject({ price_per_1000_cents: 0, verified: true });
    expect(t.novo_provedor).toMatchObject({ price_per_1000_cents: 70, verified: false, checked_at: null, currency: 'USD' });
    expect(normalizePriceTable('lixo')).toEqual(DEFAULT_PRICE_TABLE);
  });
  it('custo: preço não verificado = desconhecido (null), não zero; manual = 0; páginas por consulta multiplicam; arredonda para cima', () => {
    expect(costOf(eq(1000), AUTO_PROVIDER, DEFAULT_PRICE_TABLE)).toMatchObject({ total_cents: null, info: { paid: true, verified: false } });
    expect(costOf(eq(1000), MANUAL_PROVIDER, DEFAULT_PRICE_TABLE)).toMatchObject({ total_cents: 0, info: { paid: false } });
    expect(costOf(eq(154), AUTO_PROVIDER, verified(300)).total_cents).toBe(47);
    expect(costOf(eq(154), AUTO_PROVIDER, verified(300), 2).total_cents).toBe(93);
    expect(costOf(eq(1), AUTO_PROVIDER, verified(300), 99).info.pages_per_query).toBe(10);
    expect(costOf([], AUTO_PROVIDER, DEFAULT_PRICE_TABLE).info.by_provider).toEqual({ serper: expect.objectContaining({ queries: 0, verified: false }) });
  });
  it('vários motores: cada um cobra pelo preço do SEU provedor; basta um sem preço conferido para o total ficar desconhecido', () => {
    const q = [...eq(10, 'google_serp'), ...eq(10, 'dataforseo_google')];
    const so = costOf(q, AUTO_PROVIDER, verified(300));
    expect(so.total_cents).toBeNull();
    expect(so.info.by_provider).toMatchObject({ serper: { queries: 10, cents: 3, verified: true }, dataforseo: { queries: 10, cents: null, verified: false } });
    const both = normalizePriceTable({ serper: { price_per_1000_cents: 300, verified: true }, dataforseo: { price_per_1000_cents: 600, verified: true } });
    expect(costOf(q, AUTO_PROVIDER, both).total_cents).toBe(3 + 6);
  });
  it('motores derivados dos conjuntos de prompts do NEXUS: só motores de BUSCA executáveis; sem conjunto, o Google', () => {
    expect(deriveEngines([])).toEqual(DEFAULT_ENGINES);
    expect(deriveEngines([{ engines: ['chatgpt_api', 'google_serp', 'gemini_web'] }, { engines: ['brave_search', 'google_serp', 'xyz'] }])).toEqual(['brave_search', 'google_serp']);
    expect(deriveEngines([{ engines: ['chatgpt_api'] }])).toEqual(DEFAULT_ENGINES);
  });
});

describe('planejador: consultas por fase', () => {
  it('fase 1: Brasil + 27 capitais + 50 maiores cidades de SP por área aprovada; área transversal não vira consulta', () => {
    const r = planCampaign(base());
    // por área: 1 (Brasil) + 27 capitais + 49 cidades de SP além da capital (São Paulo já é capital)
    expect(r.total_queries).toBe(2 * (1 + 27 + 49));
    const qs = r.queries.map((q) => q.query);
    expect(qs).toContain('advogado criminalista');
    expect(qs).toContain('advogado criminalista em Brasília');
    expect(qs).toContain('advogado trabalhista em São Paulo');
    expect(qs).toContain('advogado criminalista em Cidade SP 000');
    expect(qs).not.toContain('advogado criminalista em Cidade SP 050'); // só as 50 maiores de SP
    expect(qs.some((q) => /pe[cç]as/i.test(q))).toBe(false);
    expect(r.queries.every((q) => q.phase === 1)).toBe(true);
    expect(r.queries.find((q) => q.query === 'advogado criminalista')).toMatchObject({ scope: 'brasil', uf: null, municipio: null, node_slug: 'criminal', node_id: 'id-criminal' });
    expect(r.queries.find((q) => q.query === 'advogado criminalista em Guarulhos')).toBeUndefined();
    expect(r.per_phase).toEqual([expect.objectContaining({ phase: 1, queries: 154 })]);
  });
  it('fase 2: as 100 maiores cidades do Brasil; nada repete o que a fase 1 já planejou', () => {
    const so2 = planCampaign(base({ phases: [2] }));
    expect(so2.total_queries).toBe(2 * 100);
    const juntas = planCampaign(base({ phases: [1, 2] }));
    expect(juntas.total_queries).toBeLessThan(154 + 200);
    expect(new Set(juntas.queries.map((q) => q.query.toLowerCase())).size).toBe(juntas.total_queries);
    expect(juntas.queries.filter((q) => q.phase === 2).length).toBe(juntas.total_queries - 154);
  });
  it('fase 3: estado de SP inteiro nas subáreas centrais: todas as aprovadas, sem limite, ou só as que o dono marcou', () => {
    const nodes = [...NODES, sub('criminal', 'Drogas e tráfico', 40), sub('criminal', 'Plantão, delegacia e inquérito', 30), sub('trabalhista', 'Rescisão, verbas e vínculo', 10)];
    const r = planCampaign(base({ nodes, phases: [3] }));
    expect(r.central).toEqual(['criminal/drogas-e-trafico', 'criminal/plantao-delegacia-e-inquerito', 'trabalhista/rescisao-verbas-e-vinculo']);
    expect(r.total_queries).toBe(3 * (1 + 101)); // por subárea: o estado + as 101 cidades de SP da base (100 + a capital)
    expect(r.queries.map((q) => q.query)).toContain('advogado de tráfico de drogas no estado de São Paulo');
    expect(r.queries.map((q) => q.query)).toContain('advogado criminalista plantão 24 horas em Cidade SP 099');
    const marcadas = nodes.map((n) => (n.slug === 'trabalhista/rescisao-verbas-e-vinculo' ? { ...n, central: true } : n));
    expect(planCampaign(base({ nodes: marcadas, phases: [3] })).central).toEqual(['trabalhista/rescisao-verbas-e-vinculo']);
    expect(planCampaign(base({ nodes, phases: [3], centralSlugs: ['criminal/drogas-e-trafico'] })).total_queries).toBe(102);
    expect(planCampaign(base({ phases: [3] })).warnings.join(' ')).toMatch(/Fase 3 sem subáreas aprovadas/);
  });
  it('fase 4: Brasil inteiro, camada básica (áreas matriz): 27 estados + todos os municípios carregados (ou as N maiores, se pedido)', () => {
    expect(planCampaign(base({ phases: [4] })).total_queries).toBe(2 * (27 + munis.length));
    const r = planCampaign(base({ phases: [4], phase4Municipios: 10 }));
    expect(r.total_queries).toBe(2 * (27 + 10));
    expect(r.queries.map((q) => q.query)).toContain('advogado trabalhista no estado de Minas Gerais');
    expect(r.queries.map((q) => q.query)).toContain('advogado criminalista no Distrito Federal');
  });
  it('deduplica por texto normalizado (acento e caixa) e mantém a primeira ocorrência', () => {
    const nodes = [matriz('a', 'Criminal'), { ...matriz('b', 'criminal'), id: 'id-b' }];
    const r = planCampaign(base({ nodes, pack: null }));
    expect(r.total_queries).toBe(1 + 27 + 49);
    expect(r.queries.every((q) => q.node_slug === 'a')).toBe(true);
  });
  it('lugares do escopo aprovado entram na fase 1: município, estado e região, com preposição certa', () => {
    const r = planCampaign(base({
      nodes: [NODES[0]],
      scope: [
        { uf: 'MG', ibge_code: 3100005, municipio: 'Vila MG 005', regiao: null, role: 'atende' },
        { uf: 'MG', ibge_code: null, municipio: null, regiao: null, role: 'alvo' },
        { uf: 'SP', ibge_code: null, municipio: null, regiao: 'Zona Leste de São Paulo', role: 'plantao' },
        { uf: 'SP', ibge_code: null, municipio: null, regiao: 'ABC Paulista', role: 'atende' },
        { uf: 'SP', ibge_code: null, municipio: 'Guarulhos', regiao: null, role: 'plantao' },
      ],
    }));
    const qs = r.queries.map((q) => q.query);
    expect(qs).toEqual(expect.arrayContaining(['advogado criminalista em Vila MG 005', 'advogado criminalista no estado de Minas Gerais', 'advogado criminalista na Zona Leste de São Paulo', 'advogado criminalista no ABC Paulista', 'advogado criminalista em Guarulhos']));
    expect(r.queries.find((q) => q.query.endsWith('ABC Paulista'))).toMatchObject({ scope: 'regiao', regiao: 'ABC Paulista', uf: 'SP' });
    expect(r.queries.find((q) => q.query.endsWith('Guarulhos'))).toMatchObject({ scope: 'municipio', municipio: 'Guarulhos', uf: 'SP', ibge_code: null });
  });
  it('nome de município repetido em dois estados leva a UF no texto da consulta', () => {
    const extra = [...munis, { ibge_code: 4213807, nome: 'Praia Grande', uf: 'SC' as const, populacao: 8_788 }, { ibge_code: 3541000, nome: 'Praia Grande', uf: 'SP' as const, populacao: 1_900_000 }];
    const r = planCampaign(base({ nodes: [NODES[0]], municipios: extra }));
    expect(r.queries.map((q) => q.query)).toContain('advogado criminalista em Praia Grande SP');
  });
  it('sem municípios do IBGE: avisa, e só Brasil + capitais entram; sem população: avisa que "maiores cidades" não dá para calcular', () => {
    const sem = planCampaign(base({ municipios: [] }));
    expect(sem.warnings.join(' ')).toMatch(/IBGE ainda não foram carregados/);
    expect(sem.total_queries).toBe(2 * 28);
    const semPop = planCampaign(base({ municipios: munis.map((m) => ({ ...m, populacao: null })), phases: [2] }));
    expect(semPop.total_queries).toBe(0);
    expect(semPop.warnings.join(' ')).toMatch(/SEM população/);
  });
  it('nó manual (fora do pacote) e subárea sem frase própria usam o nome; sem área aprovada avisa', () => {
    const byParent = new Map<string, PlanNodeIn>([['x', matriz('x', 'Estética facial')]]);
    expect(consultaDoNo(matriz('x', 'Estética facial'), null, byParent)).toBe('estética facial');
    expect(consultaDoNo({ ...sub('x', 'Botox'), parentSlug: 'x' }, null, byParent)).toBe('estética facial botox');
    expect(consultaDoNo(sub('criminal', 'Defesa criminal geral'), PACK_ADVOCACIA, new Map([['criminal', matriz('criminal', 'Criminal')]]))).toBeNull();
    expect(planCampaign(base({ nodes: [] })).warnings.join(' ')).toMatch(/Nenhuma área matriz aprovada/);
  });
});

describe('planejador: cruzamento automático (fases, lugares, mercados, motores, cauda do agente)', () => {
  it('sem escolher nada, gera as 4 fases sozinho a partir do que está aprovado', () => {
    const r = planCampaign({ nodes: NODES, pack: PACK_ADVOCACIA, municipios: munis, scope: [], provider: MANUAL_PROVIDER, budgetCapCents: 0 });
    expect(r.per_phase.map((p) => p.phase)).toEqual(ALL_PHASES);
    expect(r.per_phase.every((p) => p.queries > 0 || p.phase === 3)).toBe(true); // a fase 3 só tem consulta quando há subárea aprovada
    expect(r.engines).toEqual(DEFAULT_ENGINES);
  });
  it('cruza bairro, município, região, estado e país/mercado do escopo aprovado, no formato de mercado do NEXUS (country, language, city)', () => {
    const r = planCampaign(base({
      nodes: [NODES[0]],
      scope: [
        { uf: 'SP', ibge_code: 3500005, municipio: 'Cidade SP 005', bairro: 'Tatuapé', regiao: null, role: 'atende' },
        { uf: 'SP', ibge_code: null, municipio: null, regiao: 'Zona Leste de São Paulo', role: 'plantao' },
        { uf: 'MG', ibge_code: null, municipio: null, regiao: null, role: 'alvo' },
        { uf: null, ibge_code: null, municipio: 'Lisboa', regiao: null, role: 'alvo', country: 'pt', language: 'pt-BR' },
        { uf: null, ibge_code: null, municipio: null, regiao: null, role: 'alvo', country: 'pt', language: 'pt-BR' },
        { uf: null, ibge_code: null, municipio: 'Paris', regiao: null, role: 'alvo', country: 'fr', language: 'fr' },
      ],
    }));
    const qs = r.queries;
    expect(qs.find((q) => q.scope === 'bairro')).toMatchObject({ query: 'advogado criminalista em Tatuapé, Cidade SP 005', bairro: 'Tatuapé', municipio: 'Cidade SP 005', uf: 'SP', country: 'br' });
    expect(qs.map((q) => q.query)).toEqual(expect.arrayContaining(['advogado criminalista na Zona Leste de São Paulo', 'advogado criminalista no estado de Minas Gerais', 'advogado criminalista em Lisboa', 'advogado criminalista em Portugal']));
    expect(qs.find((q) => q.query.endsWith('Lisboa'))).toMatchObject({ scope: 'pais', country: 'pt', language: 'pt-BR', municipio: 'Lisboa' });
    expect(qs.some((q) => /Paris/.test(q.query))).toBe(false); // outra língua: a busca em francês é do agente
    expect(r.needs_agent).toEqual(['fr:fr:Paris']);
    expect(r.warnings.join(' ')).toContain('Mercados em outra língua (fr:fr:Paris)');
    expect(r.markets).toEqual(expect.arrayContaining(['br|pt-BR|', 'pt|pt-BR|Lisboa', 'pt|pt-BR|', 'fr|fr|Paris']));
  });
  it('cruza com os motores: cada consulta vale uma vez por motor, e o custo segue o provedor de cada um', () => {
    const um = planCampaign(base({ nodes: [NODES[0]], engines: ['google_serp'] }));
    const dois = planCampaign(base({ nodes: [NODES[0]], engines: ['google_serp', 'brave_search'], provider: AUTO_PROVIDER, priceTable: normalizePriceTable({ serper: { price_per_1000_cents: 300, verified: true }, brave: { price_per_1000_cents: 500, verified: true } }), budgetCapCents: 1000 }));
    expect(dois.total_queries).toBe(2 * um.total_queries);
    expect(new Set(dois.queries.map((q) => q.engine))).toEqual(new Set(['google_serp', 'brave_search']));
    expect(dois.cost.by_provider).toMatchObject({ serper: { queries: um.total_queries }, brave: { queries: um.total_queries } });
    expect(dois.estimated_cost_cents).toBe(Math.ceil((um.total_queries * 300) / 1000) + Math.ceil((um.total_queries * 500) / 1000));
  });
  it('cauda do agente: aprovada entra como busca inteira (Brasil + lugares do escopo), com os motores e o mercado que o agente indicou', () => {
    const cauda = (slug: string, label: string, over: Partial<PlanNodeIn> = {}): PlanNodeIn => ({ id: `id-${slug}`, slug: `criminal/c/${slug}`, kind: 'cauda', label, parentSlug: 'criminal', ...over });
    const r = planCampaign(base({
      nodes: [NODES[0], cauda('a', 'como tirar tornozeleira eletrônica'), cauda('b', 'advocate for criminal defense', { country: 'us', language: 'en', engines: ['google_serp', 'bing_serp'] }), cauda('c', 'o que fazer com a CNH suspensa por pontos', { engines: ['brave_search'] })],
      scope: [{ uf: 'SP', ibge_code: null, municipio: 'Guarulhos', regiao: null, role: 'plantao' }],
    }));
    const by = (slug: string) => r.queries.filter((q) => q.node_slug === `criminal/c/${slug}`);
    expect(by('a').map((q) => q.query)).toEqual(['como tirar tornozeleira eletrônica', 'como tirar tornozeleira eletrônica em Guarulhos']);
    expect(by('b')).toEqual([expect.objectContaining({ query: 'advocate for criminal defense', engine: 'google_serp', country: 'us', language: 'en', scope: 'pais' }), expect.objectContaining({ engine: 'bing_serp', country: 'us' })]);
    expect(by('c').every((q) => q.engine === 'brave_search')).toBe(true);
    expect(by('a').every((q) => q.engine === 'google_serp' && q.phase === 1)).toBe(true);
  });
  it('sem teto fixo de nós: 150 áreas e 300 subáreas aprovadas entram no plano (todas centrais na fase 3)', () => {
    const nodes: PlanNodeIn[] = [];
    for (let i = 0; i < 150; i++) { nodes.push(matriz(`m${i}`, `Área ${i}`)); for (let j = 0; j < 2; j++) nodes.push(sub(`m${i}`, `Sub ${i} ${j}`, i)); }
    const r = planCampaign(base({ nodes, pack: null, phases: [3] }));
    expect(r.central).toHaveLength(300);
    expect(r.total_queries).toBe(300 * (1 + 101));
    expect(planCampaign(base({ nodes, pack: null })).queries.filter((q) => q.scope === 'brasil')).toHaveLength(150);
  });
});

describe('planejador: custo e teto', () => {
  it('provedor pago com preço NÃO verificado: custo desconhecido, não cabe/não cabe é desconhecido, aviso claro', () => {
    const r = planCampaign(base({ provider: AUTO_PROVIDER, budgetCapCents: 5000 }));
    expect(r.estimated_cost_cents).toBeNull();
    expect(r.in_budget).toBeNull();
    expect(r.cap).toMatchObject({ cost_known: false, fits_queries: null, fits_all: null, max_queries_by_cap: null });
    expect(r.per_phase[0].cost_cents).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/NÃO foi verificado/);
  });
  it('preço verificado: calcula o custo e o teto limita as consultas que cabem (em ordem de fase)', () => {
    const r = planCampaign(base({ provider: AUTO_PROVIDER, priceTable: verified(300), budgetCapCents: 20 }));
    expect(r.total_queries).toBe(154);
    expect(r.estimated_cost_cents).toBe(47);
    expect(r.cap).toMatchObject({ cost_known: true, max_queries_by_cap: 66, fits_queries: 66, fits_all: false });
    expect(r.in_budget).toHaveLength(66);
    expect(r.in_budget![0]).toBe(r.queries[0]);
    expect(r.warnings.join(' ')).toMatch(/cobre 66 de 154/);
    const tudo = planCampaign(base({ provider: AUTO_PROVIDER, priceTable: verified(300), budgetCapCents: 100 }));
    expect(tudo.cap).toMatchObject({ fits_all: true, fits_queries: 154 });
    const dobro = planCampaign(base({ provider: AUTO_PROVIDER, priceTable: verified(300), budgetCapCents: 100, pagesPerQuery: 2 }));
    expect(dobro.estimated_cost_cents).toBe(93);
    expect(dobro.cap).toMatchObject({ fits_all: true, max_queries_by_cap: 154 });
  });
  it('teto zero com provedor pago: nada autorizado; provedor manual: custo zero e tudo cabe', () => {
    const z = planCampaign(base({ provider: AUTO_PROVIDER, priceTable: verified(300), budgetCapCents: 0 }));
    expect(z.in_budget).toHaveLength(0);
    expect(z.warnings.join(' ')).toMatch(/teto está em 0/);
    const m = planCampaign(base());
    expect(m.estimated_cost_cents).toBe(0);
    expect(m.cost.paid).toBe(false);
    expect(m.in_budget).toHaveLength(m.total_queries);
  });
});

describe('concorrentes: agregação', () => {
  const Q = (id: string, node_slug: string | null, scope: QueryMeta['scope'], uf: string | null, municipio: string | null, regiao: string | null = null): QueryMeta => ({ id, query: id, node_slug, scope, uf, municipio, ibge_code: null, regiao });
  const queries = new Map<string, QueryMeta>([
    ['q1', Q('q1', 'criminal', 'municipio', 'SP', 'Guarulhos')], ['q2', Q('q2', 'criminal/drogas-e-trafico', 'municipio', 'SP', 'Osasco')], ['q3', Q('q3', 'trabalhista', 'brasil', null, null)],
    ['q4', Q('q4', 'criminal', 'regiao', 'SP', null, 'Zona Leste de São Paulo')], ['q5', Q('q5', 'criminal', 'estado', 'MG', null)],
  ]);
  const R = (query_id: string, position: number, url: string, kind: ResultRow['kind'] = 'organico'): ResultRow => ({ query_id, position, url, host: new URL(url).hostname, kind });
  const results = [
    R('q1', 1, 'https://www.rival.com.br/a'), R('q1', 2, 'https://blog.outro.adv.br/x'), R('q1', 3, 'https://jusbrasil.com.br/p'), R('q1', 4, 'https://www.cliente.com.br/'), R('q1', 1, 'https://rival.com.br/mapa', 'mapa'), R('q1', 1, 'https://rival.com.br/ad', 'anuncio'),
    R('q2', 3, 'https://rival.com.br/b'), R('q2', 5, 'https://tjsp.jus.br/x'), R('q3', 2, 'https://rival.com.br/t'), R('q3', 1, 'https://outro.adv.br/z'), R('q4', 6, 'https://rival.com.br/zl'), R('q5', 9, 'https://novo.com.br/'),
  ];
  const agg = aggregateCompetitors(results, queries, { ownHost: 'www.cliente.com.br' });
  const by = new Map(agg.competitors.map((c) => [c.host, c]));

  it('conta aparições por domínio (subdomínios juntos), posição média só nos orgânicos, melhor posição e pontuação de presença', () => {
    const r = by.get('rival.com.br')!;
    expect(r).toMatchObject({ kind: 'concorrente', appearances: 6, queries: 4, best_position: 1 });
    expect(r.kinds).toEqual({ organico: 4, mapa: 1, anuncio: 1, outro: 0 });
    expect(r.avg_position).toBe(3); // (1 + 3 + 2 + 6) / 4
    expect(r.score).toBe(10 + 8 + 9 + 5 + 10); // orgânicos nas posições 1, 3, 2 e 6, mais o mapa em 1; o anúncio não pontua
    expect(by.get('outro.adv.br')).toMatchObject({ appearances: 2, avg_position: 1.5 });
  });
  it('o site do próprio projeto não é concorrente (é contado à parte); diretórios e portais ficam MARCADOS e depois dos concorrentes', () => {
    expect(by.has('cliente.com.br')).toBe(false);
    expect(agg.own_appearances).toBe(1);
    expect(by.get('jusbrasil.com.br')?.kind).toBe('diretorio');
    expect(by.get('jus.br')?.kind).toBe('diretorio'); // .jus.br (tribunais) agrupa no sufixo: a lista de sufixos do projeto não conhece "jus.br"
    const kinds = agg.competitors.map((c) => c.kind);
    expect(kinds.lastIndexOf('concorrente')).toBeLessThan(kinds.indexOf('diretorio'));
  });
  it('mostra onde cada concorrente aparece: Brasil, estado, região e município; e em quais áreas', () => {
    const r = by.get('rival.com.br')!;
    expect(r.locations).toEqual({ brasil: 1, estados: { SP: 5 }, regioes: { 'Zona Leste de São Paulo': 1 }, municipios: { 'Guarulhos-SP': 3, 'Osasco-SP': 1 } });
    expect(r.areas).toEqual(['criminal', 'criminal/drogas-e-trafico', 'trabalhista']);
  });
  it('filtros: área (inclui as subáreas), estado, município sem acento, região e alcance', () => {
    const f = (filter: CompetitorFilter) => aggregateCompetitors(results, queries, { ownHost: 'cliente.com.br', filter }).competitors.map((c) => c.host).sort();
    expect(f({ area: 'trabalhista' })).toEqual(['outro.adv.br', 'rival.com.br']);
    expect(f({ area: 'criminal/drogas-e-trafico' })).toEqual(['jus.br', 'rival.com.br']);
    expect(f({ area: 'criminal' })).toContain('novo.com.br');
    expect(f({ uf: 'MG' })).toEqual(['novo.com.br']);
    expect(f({ municipio: 'GUARULHOS' })).toEqual(['jusbrasil.com.br', 'outro.adv.br', 'rival.com.br']);
    expect(f({ regiao: 'Zona Leste de São Paulo' })).toEqual(['rival.com.br']);
    expect(f({ scope: 'brasil' })).toEqual(['outro.adv.br', 'rival.com.br']);
    expect(f({ area: 'tributario' })).toEqual([]);
  });
  it('lista de ruído: domínio exato ou subdomínio/sufixo, configurável; nada de casar por pedaço do nome', () => {
    expect(isNoiseHost('facebook.com')).toBe(true);
    expect(isNoiseHost('pt.wikipedia.org')).toBe(true);
    expect(isNoiseHost('tjsp.jus.br')).toBe(true);
    expect(isNoiseHost('prefeitura.sp.gov.br')).toBe(true);
    expect(isNoiseHost('meujusbrasil.com.br')).toBe(false);
    expect(isNoiseHost('escritorio.com.br')).toBe(false);
    expect(isNoiseHost('portal.exemplo.com.br', ['exemplo.com.br'])).toBe(true);
    expect(DEFAULT_NOISE_HOSTS).toEqual(expect.arrayContaining(['jusbrasil.com.br', 'escavador.com', 'facebook.com', 'instagram.com', 'youtube.com', 'wikipedia.org', 'gov.br']));
    expect(competitorHost('https://www.blog.rival.com.br/x')).toBe('rival.com.br');
    expect(competitorHost('ftp://x.com')).toBeNull();
    expect(competitorHost('lixo')).toBeNull();
  });
});

describe('importação dos resultados de busca (custo zero)', () => {
  it('CSV com ponto e vírgula e cabeçalho em português; posição inferida quando não há coluna', () => {
    const r = parseSerpImport('consulta;posição;url;título;tipo\nadvogado criminalista em Guarulhos;1;https://a.com.br/;A Advogados;organico\nadvogado criminalista em Guarulhos;2;https://b.com.br/;;mapa\n;3;https://c.com;;\nx;99999;https://d.com;;');
    expect(r).toMatchObject({ invalid: 2, truncated: false, duplicates: 0 });
    expect('rows' in r && r.rows).toEqual([
      { query: 'advogado criminalista em Guarulhos', position: 1, url: 'https://a.com.br/', title: 'A Advogados', kind: 'organico' },
      { query: 'advogado criminalista em Guarulhos', position: 2, url: 'https://b.com.br/', title: null, kind: 'mapa' },
    ]);
    const sem = parseSerpImport('query,url\nfoo bar,https://a.com\nfoo bar,https://b.com\nbaz,https://c.com');
    expect('rows' in sem && sem.rows.map((x) => [x.query, x.position])).toEqual([['foo bar', 1], ['foo bar', 2], ['baz', 1]]);
  });
  it('JSON no formato do Serper (organic, places, ads) e JSON plano; aceita lista de consultas ou uma só', () => {
    const serper = { searchParameters: { q: 'advogado trabalhista em Osasco' }, organic: [{ title: 'T1', link: 'https://a.com.br/', position: 1 }, { title: 'T2', link: 'https://b.com.br/' }], places: [{ title: 'P', website: 'https://c.com.br' }], ads: [{ link: 'https://d.com.br/' }, { link: 'não é url' }] };
    const r = parseSerpImport(JSON.stringify([serper]));
    expect('rows' in r && r.rows.map((x) => `${x.kind}:${x.position}:${new URL(x.url).hostname}`)).toEqual(['organico:1:a.com.br', 'organico:2:b.com.br', 'mapa:1:c.com.br', 'anuncio:1:d.com.br']);
    expect(r).toMatchObject({ invalid: 1 });
    const one = parseSerpImport(JSON.stringify(serper));
    expect('rows' in one && one.rows).toHaveLength(4);
    const flat = parseSerpImport(JSON.stringify([{ query: 'q um', position: 3, url: 'https://x.com', tipo: 'ads' }, { consulta: 'q dois', posicao: 1, link: 'https://y.com' }]));
    expect('rows' in flat && flat.rows.map((x) => [x.query, x.kind])).toEqual([['q um', 'anuncio'], ['q dois', 'organico']]);
  });
  it('repetições (mesma consulta, tipo e posição) contam como duplicadas; tipo desconhecido vira "outro"', () => {
    const r = parseSerpImport('consulta,posicao,url,tipo\nq,1,https://a.com,organico\nq,1,https://a.com,organico\nq,2,https://b.com,video');
    expect(r).toMatchObject({ duplicates: 1 });
    expect('rows' in r && r.rows.map((x) => x.kind)).toEqual(['organico', 'outro']);
  });
  it('erros claros: vazio, formato, cabeçalho sem as colunas obrigatórias, tamanho', () => {
    expect(parseSerpImport('   ')).toEqual({ error: 'import_empty' });
    expect(parseSerpImport(undefined)).toEqual({ error: 'import_empty' });
    expect(parseSerpImport('{quebrado')).toEqual({ error: 'import_format' });
    expect(parseSerpImport('"texto"')).toEqual({ error: 'import_empty' });
    expect(parseSerpImport('a,b\n1,2')).toEqual({ error: 'import_header_required' });
    expect(parseSerpImport('x'.repeat(MAX_SERP_IMPORT_CHARS + 1))).toEqual({ error: 'import_too_large' });
  });
});
