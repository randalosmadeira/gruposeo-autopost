import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row, type RpcHandler } from './helpers/fake-admin';
import { GEO_SYNC_MIN_INTERVAL_MS, IBGE_MUNICIPIOS_URL, IBGE_POPULACAO_URL, TAXONOMY_ACTIONS, handleTaxonomyAction } from '../../supabase/functions/_shared/taxonomy-handler';
import { PAID_LOCK_MESSAGE } from '../../supabase/functions/_shared/market-handler';
import { PAID_SERVICES_BLOCKED } from '../../supabase/functions/_shared/nexus-spend-lock';
import { PACK_ADVOCACIA } from '../../supabase/functions/_shared/taxonomy-core';
import type { Deps } from '../../supabase/functions/_shared/profile-analyze-core';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const P_OTHER = '00000000-0000-4000-8000-0000000000b2';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const NOW_ISO = new Date(NOW).toISOString();

// o pacote traz setas nos dois sentidos (Criminal->Trânsito e Trânsito->Criminal): no banco é UMA correlação por par
const UNORDERED_PAIRS = new Set(PACK_ADVOCACIA.correl.map((c) => [c.from, c.to].sort().join('|'))).size;
const MUNIS: Row[] = [
  [3518800, 'Guarulhos', 'SP', 1351284], [3534401, 'Osasco', 'SP', 761441], [3550308, 'São Paulo', 'SP', 11911337], [3548500, 'Santos', 'SP', 429528], [3547809, 'Santo André', 'SP', 784290],
  [4212502, 'Penha', 'SC', 37775], [2605103, 'Custódia', 'PE', 39797], [3506003, 'Bauru', 'SP', 394028],
].map(([ibge_code, nome, uf, populacao]) => ({ ibge_code, nome, uf, regiao: 'Sudeste', populacao, fetched_at: NOW_ISO }));

// cópia nova a cada teste: o geo_sync grava no mesmo array que recebe
const munis = (): Row[] => MUNIS.map((m) => ({ ...m }));
const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [
    { id: P, name: 'RDM Advogados', domain: 'rdmadvogados.com.br', organization_id: ORG, wordpress_url: null },
    { id: P_OTHER, name: 'Outra empresa', domain: 'outra.com.br', organization_id: OTHER, wordpress_url: null },
  ],
  project_taxonomy_nodes: [], project_taxonomy_edges: [], project_geo_scope: [], ibge_municipios: [], nexus_prompt_sets: [], market_campaigns: [], market_queries: [], market_serp_results: [], market_competitors: [], project_site_maps: [], ...over,
});
const node = (slug: string, kind: 'matriz' | 'subarea' | 'nicho' | 'cauda', label: string, over: Row = {}): Row => ({
  id: `00000000-0000-4000-8000-${String(1000 + slug.length * 7 + label.length).padStart(12, '0')}`, organization_id: ORG, project_id: P, kind, parent_id: null, slug, label, keywords: [], source: 'site', status: 'aprovado', evidence: { total: 5 }, ...over,
});
const sampleRpc = (queries: Array<{ query: string; clicks?: number; impressions: number }> = [], pages: Array<{ page: string; clicks?: number; impressions: number }> = []): Record<string, RpcHandler> => ({
  taxonomy_search_sample: () => ({ data: { queries: queries.map((q) => ({ clicks: 0, ...q })), pages: pages.map((p) => ({ clicks: 0, ...p })) }, error: null }),
});

interface Opts { role?: string | null; tables?: Record<string, Row[]>; rpcs?: Record<string, RpcHandler>; fetchFn?: typeof fetch; now?: number; paidBlocked?: boolean; project?: string }
function setup(o: Opts = {}) {
  const tables = o.tables || seed();
  const fetched: string[] = [];
  const fetchFn = (o.fetchFn ?? (async () => { throw new Error('rede não deveria ser usada'); })) as typeof fetch;
  const deps: Deps = { now: () => o.now ?? NOW, lookupA: async () => ['93.184.216.34'], fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => { fetched.push(String(input)); return fetchFn(input, init); }) as typeof fetch };
  const fake = fakeAdmin(tables, o.rpcs || {});
  const roleByOrg = new Map<string, string>(o.role === null ? [[OTHER, 'owner']] : [[ORG, o.role || 'owner']]);
  const call = (action: string, body: Record<string, unknown> = {}, over: Partial<Opts> = {}) =>
    handleTaxonomyAction(fake.admin, { action, body: { projectId: over.project ?? o.project ?? P, ...body }, userId: USER, roleByOrg, deps, paidBlocked: over.paidBlocked ?? o.paidBlocked });
  return { call, tables, fetched, fake };
}
const one = async (action: string, body: Record<string, unknown> = {}, o: Opts = {}) => { const s = setup(o); const r = await s.call(action, body); return { ...r, tables: s.tables, fetched: s.fetched, log: s.fake.log }; };
const rows = (t: Record<string, Row[]>, name: string) => t[name] as Row[];
const last = (l: Row[]) => l[l.length - 1];

describe('taxonomia: função de borda, acesso e papéis', () => {
  it('ações existentes', () => {
    expect(TAXONOMY_ACTIONS).toEqual(['overview', 'suggest', 'pack_load', 'review', 'tail_import', 'tail_generate', 'geo_overview', 'geo_sync', 'geo_districts', 'scope_save', 'campaign_plan', 'campaign_approve', 'campaign_cancel', 'campaign_execute', 'campaign_results_import', 'competitors_list']);
  });
  it('projectId inválido, projeto inexistente e ação desconhecida', async () => {
    expect((await one('overview', { projectId: 'x' })).body.error).toBe('project_id_required');
    expect((await one('overview', { projectId: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404);
    expect(await one('inventada')).toMatchObject({ status: 400, body: { error: 'unknown_action' } });
  });
  it('quem não é da organização não vê nada; viewer só lê', async () => {
    for (const a of TAXONOMY_ACTIONS) expect((await one(a, {}, { role: null })).status, a).toBe(403);
    const writes = ['suggest', 'pack_load', 'review', 'tail_import', 'tail_generate', 'geo_sync', 'geo_districts', 'scope_save', 'campaign_plan', 'campaign_approve', 'campaign_cancel', 'campaign_execute', 'campaign_results_import'];
    for (const a of writes) expect(await one(a, { segment: 'advocacia' }, { role: 'viewer' }), a).toMatchObject({ status: 403, body: { error: 'role_not_allowed' } });
    for (const a of ['overview', 'geo_overview', 'competitors_list']) expect((await one(a, {}, { role: 'viewer' })).status, a).toBe(200);
    expect((await one('overview', {}, { role: 'viewer' })).body.can_edit).toBe(false);
    for (const role of ['owner', 'admin', 'editor']) expect((await one('overview', {}, { role })).body.can_edit, role).toBe(true);
  });
  it('isolamento: projeto de outra organização dá 403 mesmo para dono daqui; tenant e papel vêm do banco, não do corpo', async () => {
    expect((await one('overview', {}, { project: P_OTHER })).status).toBe(403);
    expect((await one('pack_load', { segment: 'advocacia', organization_id: OTHER, role: 'owner' }, { project: P_OTHER })).status).toBe(403);
    const r = await one('pack_load', { segment: 'advocacia', organization_id: OTHER, project_id: P_OTHER });
    expect(r.status).toBe(200);
    expect(rows(r.tables, 'project_taxonomy_nodes').every((n) => n.organization_id === ORG && n.project_id === P)).toBe(true);
  });
  it('visão geral: pacotes, tabela de preços NÃO verificada, bloqueio de gasto ligado e estado do IBGE', async () => {
    const r = await one('overview', {}, { tables: seed({ project_taxonomy_nodes: [node('criminal', 'matriz', 'Criminal')] }) });
    expect(r.body).toMatchObject({ project: { id: P, domain: 'rdmadvogados.com.br' }, can_edit: true, paid_blocked: PAID_SERVICES_BLOCKED, ibge: { loaded: false, with_population: false } });
    expect((r.body.segments as Array<{ id: string; status: string }>).map((s) => [s.id, s.status])).toEqual([['advocacia', 'validado'], ['saude_estetica', 'rascunho'], ['varejo_local', 'rascunho'], ['educacao', 'rascunho'], ['politica', 'rascunho']]);
    expect((r.body.nodes as Row[])).toHaveLength(1);
    expect((r.body.price_table as Record<string, { verified: boolean; price_per_1000_cents: number }>).serper).toMatchObject({ verified: false, price_per_1000_cents: 0 });
    const withIbge = await one('overview', {}, { tables: seed({ ibge_municipios: munis() }) });
    expect(withIbge.body.ibge).toMatchObject({ loaded: true, with_population: true, fetched_at: NOW_ISO });
  });
});

describe('taxonomia: pacote e sugestões', () => {
  it('pack_load grava o pacote inteiro como SUGERIDO, com pais ligados e correlações; repetir não duplica', async () => {
    const s = setup();
    const r = await s.call('pack_load', { segment: 'advocacia' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ segment: 'advocacia', nodes_new: 15 + 34 + 2, edges_new: UNORDERED_PAIRS, skipped_rejected: 0 });
    const nodes = rows(s.tables, 'project_taxonomy_nodes');
    expect(nodes).toHaveLength(51);
    expect(nodes.every((n) => n.status === 'sugerido' && n.source === 'pacote' && n.created_by === USER)).toBe(true);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) { if (n.kind === 'matriz') expect(n.parent_id).toBeNull(); else expect(byId.get(n.parent_id as string)).toBeTruthy(); }
    const again = await s.call('pack_load', { segment: 'advocacia' });
    expect(again.body).toMatchObject({ nodes_new: 0, edges_new: 0 });
    expect(rows(s.tables, 'project_taxonomy_nodes')).toHaveLength(51);
  });
  it('pacote em RASCUNHO funciona em modo aviso (não bloqueia, mas avisa); ausente ou desconhecido é recusado', async () => {
    const r = await one('pack_load', { segment: 'saude_estetica' });
    expect(r.status).toBe(200);
    expect((r.body.warnings as string[]).join(' ')).toMatch(/rascunho de exemplo e não foi validado/);
    expect(rows(r.tables, 'project_taxonomy_nodes').length).toBeGreaterThan(0);
    expect((await one('pack_load', {})).body.error).toBe('segment_required');
    expect((await one('suggest', { segment: 'nada' })).body.error).toBe('segment_unknown');
    const sug = await one('suggest', { segment: 'politica' }, { rpcs: sampleRpc([{ query: 'projeto de lei da câmara', impressions: 10 }]) });
    expect(sug.status).toBe(200);
    expect((sug.body.warnings as string[]).join(' ')).toMatch(/rascunho/);
  });

  const maps = [{ project_id: P, host: 'rdmadvogados.com.br', fetched_at: NOW_ISO, summary: { sitemap: { sections: [{ section: 'advogado-criminalista-em-osasco', count: 12 }, { section: 'blog', count: 900 }, { section: '(raiz)', count: 3 }] } } }];
  const pages = [
    { page: 'https://rdmadvogados.com.br/advogado-criminalista/guarulhos/', impressions: 500, clicks: 10 },
    ...['lei-seca-bafometro', 'bafometro-recusa', 'blitz-bafometro'].map((s) => ({ page: `https://rdmadvogados.com.br/blog/${s}/`, impressions: 100 })),
    { page: 'https://rdmadvogados.com.br/quem-somos/', impressions: 40 },
  ];
  const queries = [{ query: 'advogado criminalista cnh suspensa', impressions: 900, clicks: 4 }, { query: 'tornozeleira apitando', impressions: 300 }, { query: 'audiência de custódia', impressions: 80 }, { query: 'receita de bolo', impressions: 5 }];

  it('suggest classifica seções do mapa, páginas e consultas do Google e grava nós, correlações e lugares SUGERIDOS', async () => {
    const s = setup({ tables: seed({ project_site_maps: maps, ibge_municipios: munis() }), rpcs: sampleRpc(queries, pages) });
    const r = await s.call('suggest', { segment: 'advocacia' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ segment: 'advocacia', analyzed: { secoes: 2, paginas: 5, consultas: 4 }, warnings: [] });
    expect(r.body.unclassified).toMatchObject({ count: 3 }); // blog (seção), quem-somos e receita de bolo
    const nodes = rows(s.tables, 'project_taxonomy_nodes');
    const by = new Map(nodes.map((n) => [n.slug, n]));
    expect(by.get('criminal')).toMatchObject({ kind: 'matriz', status: 'sugerido', organization_id: ORG, project_id: P, created_by: USER });
    expect(by.get('criminal/crimes-de-transito')).toMatchObject({ kind: 'subarea', parent_id: by.get('criminal')!.id });
    expect(by.get('criminal/execucao-penal-e-progressao-de-regime')).toBeTruthy();
    expect(by.get('criminal/crimes-de-transito/n/bafometro')).toMatchObject({ kind: 'nicho', status: 'sugerido' });
    expect(nodes.every((n) => n.status === 'sugerido')).toBe(true);
    expect(rows(s.tables, 'project_taxonomy_edges').length).toBeGreaterThan(0);
    const geo = rows(s.tables, 'project_geo_scope');
    const g = (m: string) => geo.find((x) => x.municipio === m);
    expect(g('Osasco')).toMatchObject({ role: 'atende', source: 'site', status: 'sugerido', uf: 'SP', ibge_code: 3534401 });
    expect(g('Guarulhos')).toMatchObject({ role: 'alvo', source: 'search_console', status: 'sugerido' });
    expect(geo.find((x) => x.uf === 'SP' && !x.municipio && !x.regiao)).toBeTruthy();
    expect(geo.every((x) => x.status === 'sugerido' && x.organization_id === ORG)).toBe(true);
    expect(s.fetched).toEqual([]); // nada de rede: só dados do próprio projeto
  });
  it('rodar de novo atualiza a evidência sem duplicar, preserva o que o dono aprovou e NÃO ressuscita o rejeitado', async () => {
    const s = setup({ tables: seed({ project_site_maps: maps, ibge_municipios: munis() }), rpcs: sampleRpc(queries, pages) });
    await s.call('suggest', { segment: 'advocacia' });
    const nodes = rows(s.tables, 'project_taxonomy_nodes');
    const total = nodes.length; const geoTotal = rows(s.tables, 'project_geo_scope').length;
    nodes.find((n) => n.slug === 'criminal')!.status = 'aprovado';
    nodes.find((n) => n.slug === 'criminal/crimes-de-transito/n/bafometro')!.status = 'rejeitado';
    rows(s.tables, 'project_geo_scope').find((x) => x.municipio === 'Osasco')!.status = 'rejeitado';
    const r = await s.call('suggest', { segment: 'advocacia' });
    expect(r.body).toMatchObject({ nodes_new: 0, geo_new: 0, edges_new: 0 });
    expect(r.body.skipped_rejected).toBe(1);
    expect(rows(s.tables, 'project_taxonomy_nodes')).toHaveLength(total);
    expect(rows(s.tables, 'project_geo_scope')).toHaveLength(geoTotal);
    expect(nodes.find((n) => n.slug === 'criminal')!.status).toBe('aprovado');
    expect(nodes.find((n) => n.slug === 'criminal/crimes-de-transito/n/bafometro')!.status).toBe('rejeitado');
    expect(rows(s.tables, 'project_geo_scope').find((x) => x.municipio === 'Osasco')!.status).toBe('rejeitado');
  });
  it('sem IBGE carregado: sugere as áreas e avisa que os lugares não foram detectados; sem dados nenhum: avisa e não grava', async () => {
    const a = await one('suggest', { segment: 'advocacia' }, { tables: seed({ project_site_maps: maps }), rpcs: sampleRpc(queries, pages) });
    expect(a.body.geo_new).toBe(0);
    expect((a.body.warnings as string[]).join(' ')).toMatch(/municípios do IBGE ainda não foram carregados/);
    expect(rows(a.tables, 'project_taxonomy_nodes').length).toBeGreaterThan(0);
    const b = await one('suggest', { segment: 'advocacia' }, { rpcs: sampleRpc() });
    expect((b.body.warnings as string[]).join(' ')).toMatch(/Não há mapa do domínio nem dados do Search Console/);
    expect(rows(b.tables, 'project_taxonomy_nodes')).toHaveLength(0);
  });
});

describe('taxonomia: revisar nós', () => {
  const packed = async () => { const s = setup(); await s.call('pack_load', { segment: 'advocacia' }); const nodes = rows(s.tables, 'project_taxonomy_nodes'); const id = (slug: string) => nodes.find((n) => n.slug === slug)!.id as string; return { ...s, nodes, id }; };

  it('aprovar uma subárea aprova também as áreas de cima que ainda estavam sugeridas', async () => {
    const s = await packed();
    const r = await s.call('review', { nodeIds: [s.id('criminal/drogas-e-trafico')], decision: 'aprovado' });
    expect(r).toMatchObject({ status: 200, body: { updated: 2, decision: 'aprovado' } });
    expect(s.nodes.filter((n) => n.status === 'aprovado').map((n) => n.slug).sort()).toEqual(['criminal', 'criminal/drogas-e-trafico']);
  });
  it('rejeitar uma área rejeita tudo que está dentro; aprovar o filho de área rejeitada REABRE a área (modo aviso); voltar para sugerido reabre', async () => {
    const s = await packed();
    const r = await s.call('review', { nodeId: s.id('trabalhista'), decision: 'rejeitado' });
    expect(r.body.updated).toBe(2);
    expect(s.nodes.filter((n) => n.status === 'rejeitado').map((n) => n.slug).sort()).toEqual(['trabalhista', 'trabalhista/rescisao-verbas-e-vinculo']);
    const ap = await s.call('review', { nodeId: s.id('trabalhista/rescisao-verbas-e-vinculo'), decision: 'aprovado' });
    expect(ap.status).toBe(200);
    expect((ap.body.warnings as string[]).join(' ')).toMatch(/A área "Trabalhista" estava rejeitada e foi reaberta/);
    expect(s.nodes.filter((n) => n.status === 'aprovado').map((n) => n.slug).sort()).toEqual(['trabalhista', 'trabalhista/rescisao-verbas-e-vinculo']);
    expect((await s.call('review', { nodeId: s.id('trabalhista'), decision: 'sugerido' })).status).toBe(200);
    expect(s.nodes.find((n) => n.slug === 'trabalhista')!.status).toBe('sugerido');
  });
  it('sem teto de quantidade: aprovar 300 nós de uma vez e criar à mão dentro de área rejeitada (a área reabre com aviso)', async () => {
    const many = Array.from({ length: 300 }, (_, i) => node(`area-${i}`, 'matriz', `Área ${i}`, { id: `00000000-0000-4000-8000-${String(20000 + i).padStart(12, '0')}`, status: 'sugerido' }));
    const s = setup({ tables: seed({ project_taxonomy_nodes: many }) });
    const r = await s.call('review', { nodeIds: many.map((n) => n.id), decision: 'aprovado' });
    expect(r.body.updated).toBe(300);
    expect(many.every((n) => n.status === 'aprovado')).toBe(true);
    many[0].status = 'rejeitado';
    const c = await s.call('review', { create: { kind: 'subarea', parentId: many[0].id, label: 'Filha nova' } });
    expect(c.status).toBe(200);
    expect((c.body.warnings as string[]).join(' ')).toMatch(/reaberta/);
    expect(many[0].status).toBe('aprovado');
  });
  it('renomear muda o nome e mantém o endereço (slug); palavras-chave são limpas', async () => {
    const s = await packed();
    expect((await s.call('review', { nodeId: s.id('criminal'), label: '  Direito   Penal  ' })).status).toBe(200);
    expect(s.nodes.find((n) => n.slug === 'criminal')).toMatchObject({ label: 'Direito Penal', slug: 'criminal' });
    await s.call('review', { nodeId: s.id('criminal'), keywords: ['Penal', 'penal', ' x ', 'Habeas  corpus', 7] });
    expect(s.nodes.find((n) => n.slug === 'criminal')!.keywords).toEqual(['penal', 'habeas  corpus']);
    expect((await s.call('review', { nodeId: s.id('criminal'), label: 'a' })).body.error).toBe('label_invalid');
    expect((await s.call('review', { nodeId: s.id('criminal'), keywords: 'x' })).body.error).toBe('keywords_invalid');
  });
  it('validação: ids, decisão, nó de outro projeto (não vaza e não muda)', async () => {
    const s = await packed();
    expect((await s.call('review', { decision: 'aprovado' })).body.error).toBe('ids_invalid');
    expect((await s.call('review', { nodeIds: ['x'], decision: 'aprovado' })).body.error).toBe('ids_invalid');
    expect((await s.call('review', { nodeId: s.id('criminal'), decision: 'talvez' })).body.error).toBe('decision_invalid');
    const foreign = node('criminal', 'matriz', 'Criminal', { project_id: P_OTHER, organization_id: OTHER, id: '00000000-0000-4000-8000-00000000f001', status: 'sugerido' });
    s.tables.project_taxonomy_nodes.push(foreign);
    expect(await s.call('review', { nodeId: foreign.id, decision: 'aprovado' })).toMatchObject({ status: 404, body: { error: 'node_not_found' } });
    expect(foreign.status).toBe('sugerido');
  });
  it('criar à mão: área, subárea e nicho entram APROVADOS com origem "manual"; regras de pai e nome repetido', async () => {
    const s = setup();
    const m = await s.call('review', { create: { kind: 'matriz', label: 'Estética facial', keywords: ['botox'] } });
    expect(m.status).toBe(200);
    const mid = m.body.id as string;
    expect(rows(s.tables, 'project_taxonomy_nodes')[0]).toMatchObject({ slug: 'estetica-facial', status: 'aprovado', source: 'manual', keywords: ['botox'], organization_id: ORG, created_by: USER });
    const sub = await s.call('review', { create: { kind: 'subarea', parentId: mid, label: 'Harmonização' } });
    expect(rows(s.tables, 'project_taxonomy_nodes')[1]).toMatchObject({ slug: 'estetica-facial/harmonizacao', parent_id: mid });
    expect((await s.call('review', { create: { kind: 'nicho', parentId: sub.body.id, label: 'Lábios' } })).status).toBe(200);
    expect(rows(s.tables, 'project_taxonomy_nodes')[2].slug).toBe('estetica-facial/harmonizacao/n/labios');
    expect((await s.call('review', { create: { kind: 'matriz', label: 'estética facial' } })).status).toBe(409);
    expect((await s.call('review', { create: { kind: 'subarea', label: 'Sem pai' } })).body.error).toBe('parent_required');
    expect((await s.call('review', { create: { kind: 'subarea', parentId: sub.body.id, label: 'Filho de subárea' } })).body.error).toBe('parent_kind_invalid');
    expect((await s.call('review', { create: { kind: 'matriz', parentId: mid, label: 'Matriz com pai' } })).body.error).toBe('parent_kind_invalid');
    expect((await s.call('review', { create: { kind: 'x', label: 'abc' } })).body.error).toBe('kind_invalid');
    const cauda = await s.call('review', { create: { kind: 'cauda', parentId: mid, label: 'como funciona o botox para as rugas de expressão em pessoas com mais de 50 anos' } });
    expect(cauda.status).toBe(200);
    expect(last(rows(s.tables, 'project_taxonomy_nodes'))).toMatchObject({ kind: 'cauda', status: 'aprovado', source: 'manual' });
    expect(String(last(rows(s.tables, 'project_taxonomy_nodes'))!.slug)).toMatch(/^estetica-facial\/c\/como-funciona-o-botox/);
    expect((await s.call('review', { create: { kind: 'cauda', parentId: cauda.body.id, label: 'cauda de cauda' } })).body.error).toBe('parent_kind_invalid');
    expect((await s.call('review', { create: { kind: 'matriz', label: '!' } })).body.error).toBe('label_invalid');
  });
});

describe('taxonomia: IBGE e escopo geográfico', () => {
  const muniJson = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 1100000 + i * 100 + (i % 7), nome: `Cidade ${i}`, microrregiao: { nome: 'Micro', mesorregiao: { nome: 'Meso', UF: { sigla: i % 2 ? 'SP' : 'MG' } } } }));
  const popJson = (ids: number[]) => [{ resultados: [{ series: ids.map((id) => ({ localidade: { id: String(id) }, serie: { '2026': String(1000 + (id % 997)) } })) }] }];
  const ibgeFetch = (n = 5571, popStatus = 200): typeof fetch => (async (input: RequestInfo | URL) => {
    const u = String(input);
    const list = muniJson(n);
    if (u === IBGE_MUNICIPIOS_URL) return new Response(JSON.stringify(list), { status: 200 });
    if (u === IBGE_POPULACAO_URL) return popStatus === 200 ? new Response(JSON.stringify(popJson(list.map((m) => m.id))), { status: 200 }) : new Response('erro', { status: popStatus });
    return new Response('nope', { status: 404 });
  }) as typeof fetch;

  it('geo_sync traz municípios e população da API pública do IBGE (só os dois endereços fixos, sem chave) e guarda no cache', async () => {
    const r = await one('geo_sync', {}, { fetchFn: ibgeFetch() });
    expect(r).toMatchObject({ status: 200, body: { municipios: 5571, with_population: 5571, population_year: 2026, population_available: true } });
    expect(r.fetched).toEqual([IBGE_MUNICIPIOS_URL, IBGE_POPULACAO_URL]);
    expect(rows(r.tables, 'ibge_municipios')).toHaveLength(5571);
    expect(rows(r.tables, 'ibge_municipios')[0]).toMatchObject({ nome: 'Cidade 0', uf: 'MG', regiao: 'Sudeste', populacao: expect.any(Number), populacao_ano: 2026, fetched_at: NOW_ISO });
  });
  it('sem população (estimativa fora do ar) os municípios ainda entram e a resposta diz que não veio', async () => {
    const r = await one('geo_sync', {}, { fetchFn: ibgeFetch(5571, 500) });
    expect(r.body).toMatchObject({ municipios: 5571, with_population: 0, population_available: false });
  });
  it('resposta curta ou falha de rede = 502 e NADA gravado (resposta curta não é dado)', async () => {
    expect(await one('geo_sync', {}, { fetchFn: ibgeFetch(100) })).toMatchObject({ status: 502, body: { error: 'ibge_unavailable' } });
    const down = await one('geo_sync', {}, { fetchFn: (async () => { throw new Error('rede'); }) as typeof fetch });
    expect(down.status).toBe(502);
    expect(rows(down.tables, 'ibge_municipios')).toHaveLength(0);
  });
  it('limite de frequência: nova carga em menos de 10 minutos é recusada com o tempo de espera', async () => {
    const tables = seed({ ibge_municipios: munis() });
    const r = await one('geo_sync', {}, { tables, fetchFn: ibgeFetch(), now: NOW + 60_000 });
    expect(r).toMatchObject({ status: 429, body: { error: 'sync_too_soon', retry_after_seconds: Math.ceil((GEO_SYNC_MIN_INTERVAL_MS - 60_000) / 1000) } });
    expect(r.fetched).toEqual([]);
    expect((await one('geo_sync', {}, { tables, fetchFn: ibgeFetch(), now: NOW + GEO_SYNC_MIN_INTERVAL_MS + 1 })).status).toBe(200);
  });
  it('geo_overview: municípios do IBGE por estado e o escopo do projeto', async () => {
    const r = await one('geo_overview', {}, { tables: seed({ ibge_municipios: munis(), project_geo_scope: [{ id: '00000000-0000-4000-8000-000000000501', project_id: P, uf: 'SP', municipio: 'Osasco', role: 'atende', status: 'aprovado', source: 'manual', evidence: {} }] }) });
    expect(r.body).toMatchObject({ loaded: true, total: 8, by_uf: { SP: { municipios: 6 }, SC: { municipios: 1 }, PE: { municipios: 1 } } });
    expect(r.body.scope).toHaveLength(1);
    expect((await one('geo_overview')).body).toMatchObject({ loaded: false, total: 0 });
  });

  it('scope_save: município pelo código IBGE (nome e UF vêm do cache), estado, região, e atualizar o repetido', async () => {
    const s = setup({ tables: seed({ ibge_municipios: munis() }) });
    const r = await s.call('scope_save', { entries: [
      { role: 'sede', ibge_code: 3518800, uf: 'RJ', municipio: 'Falso' }, { role: 'atende', uf: 'SP' }, { role: 'plantao', regiao: 'Zona Leste de São Paulo', uf: 'SP' }, { role: 'alvo', uf: 'sc', municipio: 'Florianópolis' }, { role: 'atende', regiao: 'Sul' },
    ] });
    expect(r).toMatchObject({ status: 200, body: { added: 5, updated: 0, removed: 0 } });
    const g = rows(s.tables, 'project_geo_scope');
    expect(g[0]).toMatchObject({ role: 'sede', uf: 'SP', ibge_code: 3518800, municipio: 'Guarulhos', source: 'manual', status: 'aprovado', organization_id: ORG, created_by: USER });
    expect(g[3]).toMatchObject({ uf: 'SC', municipio: 'Florianópolis', ibge_code: null });
    expect(g[4]).toMatchObject({ uf: null, regiao: 'Sul' });
    const again = await s.call('scope_save', { entries: [{ role: 'atende', uf: 'SP' }] });
    expect(again.body).toMatchObject({ added: 0, updated: 1 });
    expect(g).toHaveLength(5);
  });
  it('scope_save: bairro (dentro do município) e país/mercado no formato do NEXUS (country, language, cidade); mercado em outra língua entra com aviso', async () => {
    const s = setup({ tables: seed({ ibge_municipios: munis() }) });
    const r = await s.call('scope_save', { entries: [
      { role: 'atende', ibge_code: 3534401, bairro: 'Centro' }, { role: 'alvo', country: 'pt', language: 'pt-BR', municipio: 'Lisboa' }, { role: 'alvo', country: 'PT', language: 'pt-BR' },
      { role: 'alvo', country: 'fr', language: 'fr', municipio: 'Paris' }, { role: 'atende', uf: 'SP', municipio: 'Mauá', bairro: 'Vila Noêmia' },
    ] });
    expect(r.body).toMatchObject({ added: 5 });
    expect((r.body.warnings as string[]).join(' ')).toMatch(/fr:fr:Paris é em outra língua/);
    const g = rows(s.tables, 'project_geo_scope');
    expect(g[0]).toMatchObject({ country: 'br', municipio: 'Osasco', uf: 'SP', ibge_code: 3534401, bairro: 'Centro' });
    expect(g[1]).toMatchObject({ country: 'pt', language: 'pt-BR', municipio: 'Lisboa', uf: null, status: 'aprovado' });
    expect(g[2]).toMatchObject({ country: 'pt', municipio: null });
    expect(g[4]).toMatchObject({ bairro: 'Vila Noêmia', municipio: 'Mauá', ibge_code: null });
    expect((await s.call('scope_save', { entries: [{ role: 'atende', ibge_code: 3534401, bairro: 'Centro' }] })).body).toMatchObject({ added: 0, updated: 1 });
  });
  it('scope_save: validações de país e bairro', async () => {
    const t = seed({ ibge_municipios: munis() });
    const e = (entry: Row) => one('scope_save', { entries: [entry] }, { tables: t });
    expect((await e({ role: 'atende', country: 'brasil' })).body.error).toBe('country_invalid');
    expect((await e({ role: 'atende', country: 'pt', language: 'xx-yy-zz-www' })).body.error).toBe('language_invalid');
    expect((await e({ role: 'atende', country: 'pt', uf: 'SP' })).body.error).toBe('place_ambiguous');
    expect((await e({ role: 'atende', uf: 'SP', bairro: 'Centro' })).body.error).toBe('bairro_needs_city');
    expect(rows(t, 'project_geo_scope')).toHaveLength(0);
  });
  it('scope_save: sem teto de quantidade (250 lugares de uma vez) e remover/decidir muitos ids', async () => {
    const s = setup();
    const entries = Array.from({ length: 250 }, (_, i) => ({ role: 'atende', uf: 'SP', municipio: `Cidade ${i}` }));
    expect((await s.call('scope_save', { entries })).body.added).toBe(250);
    const ids = rows(s.tables, 'project_geo_scope').map((g) => g.id);
    expect((await s.call('scope_save', { decide: { ids, status: 'rejeitado' } })).body.updated).toBe(250);
    expect((await s.call('scope_save', { remove_ids: ids })).body.removed).toBe(250);
    expect(rows(s.tables, 'project_geo_scope')).toHaveLength(0);
  });
  it('scope_save: validações', async () => {
    const t = seed({ ibge_municipios: munis() });
    const e = (entry: Row) => one('scope_save', { entries: [entry] }, { tables: t });
    expect((await e({ role: 'chefe', uf: 'SP' })).body.error).toBe('role_invalid');
    expect((await e({ role: 'sede', uf: 'XX' })).body.error).toBe('uf_invalid');
    expect((await e({ role: 'sede', ibge_code: 1234567 })).body.error).toBe('ibge_code_unknown');
    expect((await e({ role: 'sede', ibge_code: 'abc' })).body.error).toBe('ibge_code_invalid');
    expect((await e({ role: 'sede', municipio: 'Santos' })).body.error).toBe('uf_required');
    expect((await e({ role: 'sede', regiao: 'Marte' })).body.error).toBe('regiao_invalid');
    expect((await e({ role: 'sede', regiao: 'ABC Paulista', municipio: 'Santos', uf: 'SP' })).body.error).toBe('place_ambiguous');
    expect((await e({ role: 'sede' })).body.error).toBe('place_required');
    expect((await one('scope_save', { entries: [] })).body.error).toBe('entries_invalid');
    expect((await one('scope_save', {})).body.error).toBe('nothing_to_do');
    expect(rows(t, 'project_geo_scope')).toHaveLength(0);
  });
  it('scope_save: decidir e remover só alcança lugares DO PROJETO (id de outro projeto é ignorado)', async () => {
    const mine = { id: '00000000-0000-4000-8000-000000000601', project_id: P, organization_id: ORG, uf: 'SP', municipio: 'Osasco', ibge_code: 3534401, regiao: null, role: 'atende', source: 'site', status: 'sugerido', evidence: {} };
    const theirs = { ...mine, id: '00000000-0000-4000-8000-000000000602', project_id: P_OTHER, organization_id: OTHER };
    const s = setup({ tables: seed({ project_geo_scope: [mine, theirs] }) });
    expect((await s.call('scope_save', { decide: { ids: [mine.id, theirs.id], status: 'aprovado' } })).body.updated).toBe(1);
    expect(mine.status).toBe('aprovado'); expect(theirs.status).toBe('sugerido');
    expect((await s.call('scope_save', { decide: { ids: [mine.id], status: 'talvez' } })).body.error).toBe('decision_invalid');
    expect((await s.call('scope_save', { remove_ids: [theirs.id] })).body.removed).toBe(0);
    expect(rows(s.tables, 'project_geo_scope')).toHaveLength(2);
    expect((await s.call('scope_save', { remove_ids: [mine.id, theirs.id] })).body.removed).toBe(1);
    expect(rows(s.tables, 'project_geo_scope')).toEqual([theirs]);
  });
});

describe('planejador: campanha', () => {
  const approvedNodes = () => [node('criminal', 'matriz', 'Criminal', { id: '00000000-0000-4000-8000-000000000a01' }), node('trabalhista', 'matriz', 'Trabalhista', { id: '00000000-0000-4000-8000-000000000a02' }), node('pecas-e-modelos', 'matriz', 'Peças e modelos', { id: '00000000-0000-4000-8000-000000000a03' }), node('familia', 'matriz', 'Família e Sucessões', { id: '00000000-0000-4000-8000-000000000a04', status: 'sugerido' })];
  const base = () => seed({ project_taxonomy_nodes: approvedNodes(), ibge_municipios: munis() });
  // fase 1 só: contagem previsível com poucos municípios na base de teste (o padrão do planejador é gerar as 4 fases sozinho; testado abaixo)
  const ADV = { segment: 'advocacia', phases: [1] };
  const verifiedSerper = { serper: { price_per_1000_cents: 300, verified: true } };

  it('sem escolher nada: o plano sai SOZINHO, com as 4 fases e o motor padrão, e a campanha de custo zero já nasce APROVADA', async () => {
    const r = await one('campaign_plan', { name: 'Automático', segment: 'advocacia' }, { tables: base() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ executed: false, campaign: { status: 'aprovada', provider: 'manual', estimated_cost_cents: 0, price_verified: true } });
    const d = r.body.dry_run as { per_phase: Array<{ phase: number; queries: number }>; engines: string[]; markets: string[]; total_queries: number; persisted: number };
    expect(d.per_phase.map((p) => [p.phase, p.queries])).toEqual([[1, 66], [2, 4], [3, 0], [4, 54]]);
    expect(d.engines).toEqual(['google_serp']);
    expect(d.markets).toEqual(['br|pt-BR|']);
    expect(d.persisted).toBe(d.total_queries);
    expect(rows(r.tables, 'market_campaigns')[0].config).toMatchObject({ phases: [1, 2, 3, 4], engines: ['google_serp'] });
    expect(rows(r.tables, 'market_queries').every((q) => q.engine === 'google_serp' && q.country === 'br' && q.language === 'pt-BR')).toBe(true);
  });
  it('usa só o que está aprovado e NÃO executa nada (sem rede, sem custo, só grava campanha e consultas)', async () => {
    const r = await one('campaign_plan', { name: 'Mercado SP', ...ADV }, { tables: base() });
    const d = r.body.dry_run as { total_queries: number; persisted: number; sample: string[]; truncated: boolean };
    expect(d.total_queries).toBe(2 * (1 + 27 + 5)); // Criminal e Trabalhista aprovadas; Família sugerida e Peças (transversal) ficam de fora; 1 Brasil + 27 capitais + 5 cidades de SP além da capital
    expect(d.persisted).toBe(d.total_queries);
    expect(rows(r.tables, 'market_queries')).toHaveLength(d.total_queries);
    expect(d.sample[0]).toBe('advogado criminalista');
    const qs = rows(r.tables, 'market_queries');
    expect(qs.every((q) => q.status === 'planejada' && q.organization_id === ORG && q.project_id === P)).toBe(true);
    expect(qs.some((q) => /família|peças/i.test(String(q.query)))).toBe(false);
    expect(rows(r.tables, 'market_campaigns')[0]).toMatchObject({ status: 'aprovada', spent_cents: 0, created_by: USER, organization_id: ORG });
    expect(r.fetched).toEqual([]);
    expect(r.log.filter((l) => l.startsWith('insert:')).every((l) => ['insert:market_campaigns', 'insert:market_queries'].includes(l))).toBe(true);
  });
  it('campanha paga ("auto") com preço NÃO verificado: nasce em RASCUNHO, custo desconhecido, e só a aprovação do custo a libera', async () => {
    const s = setup({ tables: base() });
    const r = await s.call('campaign_plan', { name: 'Serper', provider: 'auto', budget_cap_cents: 5000, ...ADV });
    expect(r.body.campaign).toMatchObject({ status: 'rascunho', price_verified: false, estimated_cost_cents: null });
    const d = r.body.dry_run as { cap: { cost_known: boolean }; warnings: string[]; cost: { by_provider: Record<string, { verified: boolean }> } };
    expect(d.cap.cost_known).toBe(false);
    expect(d.cost.by_provider.serper.verified).toBe(false);
    expect(d.warnings.join(' ')).toMatch(/NÃO foi verificado/);
    const id = (r.body.campaign as { id: string }).id;
    expect((await s.call('campaign_approve', { campaignId: id })).body.error).toBe('price_not_verified');
    expect(rows(s.tables, 'market_campaigns')[0].status).toBe('rascunho');
  });
  it('preço verificado + teto: só as consultas que cabem no teto ficam no rascunho; aprovar exige custo dentro do teto', async () => {
    const s = setup({ tables: base() });
    const small = await s.call('campaign_plan', { name: 'Pequena', provider: 'auto', price_table: verifiedSerper, budget_cap_cents: 5, ...ADV });
    expect((small.body.dry_run as { cap: { fits_queries: number }; persisted: number }).cap.fits_queries).toBe(16); // floor(5*1000/300)
    expect((small.body.dry_run as { persisted: number }).persisted).toBe(16);
    expect(rows(s.tables, 'market_queries')).toHaveLength(16);
    expect((await s.call('campaign_approve', { campaignId: (small.body.campaign as { id: string }).id })).body.error).toBe('cost_over_cap');
  });
  it('aprovação do custo: teto zero recusado; dentro do teto aprova (e continua sem executar); só rascunho aprova; cancelar fecha', async () => {
    const s = setup({ tables: base() });
    const zero = await s.call('campaign_plan', { name: 'Sem teto', provider: 'auto', price_table: verifiedSerper, budget_cap_cents: 0, ...ADV });
    expect((await s.call('campaign_approve', { campaignId: (zero.body.campaign as { id: string }).id })).body.error).toBe('budget_cap_required');
    const ok = await s.call('campaign_plan', { name: 'Cabe', provider: 'auto', price_table: verifiedSerper, budget_cap_cents: 100, ...ADV });
    const id = (ok.body.campaign as { id: string }).id;
    expect(ok.body.campaign).toMatchObject({ status: 'rascunho', estimated_cost_cents: 20, price_verified: true }); // ceil(66 * 300 / 1000)
    expect(await s.call('campaign_approve', { campaignId: id })).toMatchObject({ status: 200, body: { approved: true, executed: false } });
    expect(rows(s.tables, 'market_campaigns').find((c) => c.id === id)!.status).toBe('aprovada');
    expect((await s.call('campaign_approve', { campaignId: id })).body.error).toBe('campaign_not_draft');
    expect((await s.call('campaign_cancel', { campaignId: id })).status).toBe(200);
    expect((await s.call('campaign_cancel', { campaignId: id })).body.error).toBe('campaign_closed');
    expect(s.fetched).toEqual([]);
  });
  it('motores e mercados dos conjuntos de prompts do NEXUS entram sozinhos (formato country, language, city); só os do próprio projeto', async () => {
    const sets = [
      { id: 's1', project_id: P, status: 'active', engines: ['google_serp', 'brave_search', 'chatgpt_api'], markets: [{ country: 'br', language: 'pt-BR' }, { country: 'pt', language: 'pt-BR', city: 'Lisboa' }, { country: 'fr', language: 'fr', city: 'Paris' }] },
      { id: 's2', project_id: P, status: 'paused', engines: ['serpapi_google'], markets: [{ country: 'us', language: 'en', city: 'Miami' }] },
      { id: 's3', project_id: P_OTHER, status: 'active', engines: ['dataforseo_google'], markets: [{ country: 'us', language: 'en', city: 'Miami' }] },
    ];
    const t = seed({ project_taxonomy_nodes: [approvedNodes()[0]], ibge_municipios: munis(), nexus_prompt_sets: sets });
    const r = await one('campaign_plan', { name: 'Com mercados', ...ADV }, { tables: t });
    const d = r.body.dry_run as { engines: string[]; markets: string[]; needs_agent: string[]; warnings: string[] };
    expect(d.engines).toEqual(['brave_search', 'google_serp']);
    expect(d.markets).toEqual(expect.arrayContaining(['br|pt-BR|', 'pt|pt-BR|Lisboa', 'fr|fr|Paris']));
    expect(d.needs_agent).toEqual(['fr:fr:Paris']);
    const qs = rows(r.tables, 'market_queries');
    const lisboa = qs.filter((q) => q.query === 'advogado criminalista em Lisboa');
    expect(lisboa.map((q) => q.engine).sort()).toEqual(['brave_search', 'google_serp']);
    expect(lisboa[0]).toMatchObject({ country: 'pt', language: 'pt-BR', scope: 'pais', municipio: 'Lisboa' });
    expect(qs.some((q) => /Paris|Miami/.test(String(q.query)))).toBe(false);
    expect(new Set(qs.map((q) => q.engine))).toEqual(new Set(['brave_search', 'google_serp']));
  });
  it('escopo aprovado entra no plano (município, região, bairro, país); sugerido e rejeitado não', async () => {
    const g = (id: number, over: Row): Row => ({ id: `00000000-0000-4000-8000-${String(8000 + id).padStart(12, '0')}`, project_id: P, organization_id: ORG, country: 'br', language: 'pt-BR', uf: 'SP', ibge_code: null, municipio: null, bairro: null, regiao: null, role: 'plantao', source: 'manual', status: 'aprovado', evidence: {}, ...over });
    const t = seed({ project_taxonomy_nodes: [approvedNodes()[0]], ibge_municipios: munis(), project_geo_scope: [
      g(1, { regiao: 'ABC Paulista' }), g(2, { municipio: 'Diadema', status: 'sugerido' }), g(3, { municipio: 'Mauá', status: 'rejeitado' }),
      g(4, { ibge_code: 3534401, municipio: 'Osasco', bairro: 'Centro' }), g(5, { uf: null, country: 'pt', municipio: 'Lisboa' }),
    ] });
    const r = await one('campaign_plan', { name: 'Escopo', ...ADV }, { tables: t });
    const qs = rows(r.tables, 'market_queries').map((q) => q.query);
    expect(qs).toEqual(expect.arrayContaining(['advogado criminalista no ABC Paulista', 'advogado criminalista em Centro, Osasco', 'advogado criminalista em Lisboa']));
    expect(qs.some((q) => /Diadema|Mauá/.test(String(q)))).toBe(false);
    expect(rows(r.tables, 'market_queries').find((q) => q.bairro === 'Centro')).toMatchObject({ scope: 'bairro', municipio: 'Osasco', uf: 'SP' });
  });
  it('cauda do agente APROVADA entra no plano com os motores que o agente indicou; a sugerida não', async () => {
    const parentId = '00000000-0000-4000-8000-000000000a01';
    const c = (i: number, label: string, status: string, evidence: Row): Row => node(`criminal/c/t${i}`, 'cauda', label, { id: `00000000-0000-4000-8000-${String(3000 + i).padStart(12, '0')}`, parent_id: parentId, source: 'agente', status, evidence });
    const t = seed({ project_taxonomy_nodes: [approvedNodes()[0], c(1, 'como tirar tornozeleira eletrônica', 'aprovado', { motores: ['google_serp', 'bing_serp'] }), c(2, 'tornozeleira apitando de madrugada', 'sugerido', {}), c(3, 'regras da tornozeleira nos EUA', 'aprovado', { pais: 'us', lingua: 'en', motores: ['google_serp'] })], ibge_municipios: munis() });
    const r = await one('campaign_plan', { name: 'Com cauda', ...ADV }, { tables: t });
    const qs = rows(r.tables, 'market_queries');
    expect(qs.filter((q) => q.query === 'como tirar tornozeleira eletrônica').map((q) => q.engine).sort()).toEqual(['bing_serp', 'google_serp']);
    expect(qs.find((q) => q.query === 'regras da tornozeleira nos EUA')).toMatchObject({ country: 'us', language: 'en', scope: 'pais', engine: 'google_serp' });
    expect(qs.some((q) => q.query === 'tornozeleira apitando de madrugada')).toBe(false);
    expect(qs.find((q) => q.query === 'como tirar tornozeleira eletrônica')!.node_id).toBe('00000000-0000-4000-8000-000000003001');
  });
  it('validações do plano', async () => {
    const t = base();
    const p = (b: Row) => one('campaign_plan', b, { tables: t });
    expect((await p({})).body.error).toBe('name_invalid');
    expect((await p({ name: 'xx', phases: [] })).body.error).toBe('phases_invalid');
    expect((await p({ name: 'xx', phases: [5] })).body.error).toBe('phases_invalid');
    expect((await p({ name: 'xx', provider: 'serper' })).body.error).toBe('provider_invalid');
    expect((await p({ name: 'xx', budget_cap_cents: -1 })).body.error).toBe('budget_invalid');
    expect((await p({ name: 'xx', budget_cap_cents: 1.5 })).body.error).toBe('budget_invalid');
    expect((await p({ name: 'xx', pages_per_query: 50 })).body.error).toBe('pages_invalid');
    expect((await p({ name: 'xx', segment: 'nada' })).body.error).toBe('segment_unknown');
    expect((await p({ name: 'xx', central_slugs: 'a' })).body.error).toBe('central_invalid');
    expect((await p({ name: 'xx', engines: ['motor_inventado'] })).body.error).toBe('engines_invalid');
    expect(rows(t, 'market_campaigns')).toHaveLength(0);
  });
  it('sem teto fixo de campanhas nem de nós acompanhados', async () => {
    const camp = (i: number): Row => ({ id: `00000000-0000-4000-8000-${String(7000 + i).padStart(12, '0')}`, project_id: P, organization_id: ORG, name: `c${i}`, status: 'rascunho', provider: 'manual', budget_cap_cents: 0, config: {} });
    const many = Array.from({ length: 400 }, (_, i) => node(`area-${i}`, 'matriz', `Área ${i}`, { id: `00000000-0000-4000-8000-${String(30000 + i).padStart(12, '0')}` }));
    const t = seed({ project_taxonomy_nodes: many, market_campaigns: Array.from({ length: 80 }, (_, i) => camp(i)) });
    const r = await one('campaign_plan', { name: 'Grande', phases: [1] }, { tables: t });
    expect(r.status).toBe(200);
    expect((r.body.dry_run as { total_queries: number }).total_queries).toBe(400 * 28); // 400 áreas x (Brasil + 27 capitais)
    expect(r.body.dry_run).toMatchObject({ warnings: [expect.stringContaining('municípios do IBGE ainda não foram carregados')] });
  });
});

describe('planejador: bloqueio global de gasto', () => {
  it('campaign_execute responde 423 enquanto o bloqueio estiver ligado, antes de ler qualquer dado, sem rede e sem gravar', async () => {
    const s = setup({ paidBlocked: true, tables: seed({ market_campaigns: [{ id: '00000000-0000-4000-8000-000000000901', project_id: P, organization_id: ORG, status: 'aprovada', provider: 'auto', budget_cap_cents: 100, config: {} }] }) });
    const r = await s.call('campaign_execute', { campaignId: '00000000-0000-4000-8000-000000000901' });
    expect(r).toMatchObject({ status: 423, body: { error: 'global_paid_services_blocked', executed: false, retryable: false, message: PAID_LOCK_MESSAGE } });
    expect(String(r.body.message)).toMatch(/Serviços pagos bloqueados globalmente/);
    expect(s.fetched).toEqual([]);
    expect(s.fake.log).toEqual([]);
    expect(rows(s.tables, 'market_campaigns')[0].status).toBe('aprovada');
  });
  it('mesmo com o bloqueio liberado, a execução NÃO existe ainda: 501 e nada executado (a trava não depende do código estar pronto)', async () => {
    const s = setup({ paidBlocked: false });
    const r = await s.call('campaign_execute', { campaignId: '00000000-0000-4000-8000-000000000901' });
    expect(r).toMatchObject({ status: 501, body: { error: 'execution_not_built', executed: false } });
    expect(s.fetched).toEqual([]); expect(s.fake.log).toEqual([]);
  });
  it('pedir a cauda ao agente de IA também é pago: 423 com o bloqueio ligado (antes de qualquer leitura); 501 se liberado, porque o agente ainda não está ligado', async () => {
    const s = setup({ paidBlocked: true });
    const r = await s.call('tail_generate', { segment: 'advocacia' });
    expect(r).toMatchObject({ status: 423, body: { error: 'global_paid_services_blocked', executed: false, message: PAID_LOCK_MESSAGE } });
    expect(s.fake.log).toEqual([]); expect(s.fetched).toEqual([]);
    const free = setup({ paidBlocked: false });
    expect(await free.call('tail_generate', {})).toMatchObject({ status: 501, body: { error: 'tail_agent_not_connected', executed: false } });
  });
  it('planejar e importar resultados continuam funcionando com o bloqueio ligado (são gratuitos), e a campanha de custo zero já está aprovada', async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [node('criminal', 'matriz', 'Criminal')], ibge_municipios: munis() }) });
    const p = await s.call('campaign_plan', { name: 'Gratuita', segment: 'advocacia', phases: [1] });
    expect(p.status).toBe(200);
    expect(p.body.campaign).toMatchObject({ status: 'aprovada' });
    expect((await s.call('campaign_approve', { campaignId: (p.body.campaign as { id: string }).id })).body.error).toBe('campaign_not_draft');
    const imp = await s.call('campaign_results_import', { campaignId: (p.body.campaign as { id: string }).id, text: 'consulta,posicao,url\nadvogado criminalista,1,https://a.com.br/' });
    expect(imp.status).toBe(200);
  });
});

describe('cauda gerada por agente de IA (source = agente)', () => {
  const crim = node('criminal', 'matriz', 'Criminal', { id: '00000000-0000-4000-8000-000000000a01' });
  const drog = node('criminal/drogas-e-trafico', 'subarea', 'Drogas e tráfico', { id: '00000000-0000-4000-8000-000000000a02', parent_id: crim.id });
  const items = [
    { label: 'tornozeleira apitando o que fazer', parent: 'criminal' },
    { label: 'Quanto tempo dura a tornozeleira', parent: 'Criminal', engines: ['google_serp', 'bing_serp', 'motor_x'], publico: 'família do preso', rationale: 'dúvida muito repetida', country: 'br', language: 'pt-BR', keywords: ['Tornozeleira', 'prazo'] },
    'preso em flagrante por tráfico de drogas, e agora?',
    { label: 'x' }, { label: 'TORNOZELEIRA apitando o que fazer', parent: 'criminal' }, 'receita de bolo de cenoura',
  ];

  it('tail_import guarda a lista do agente como nós "cauda" SUGERIDOS (source agente), com motivo, público e motores; ligando ao pai pelo slug, pelo nome ou pela classificação do pacote', async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [crim, drog] }) });
    const r = await s.call('tail_import', { items, segment: 'advocacia' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ added: 3, already_there: 0, invalid: 1, duplicates: 1, unattached_count: 1, unattached: ['receita de bolo de cenoura'] });
    expect((r.body.warnings as string[]).join(' ')).toMatch(/1 busca\(s\) ficaram sem área/);
    expect((r.body.warnings as string[]).join(' ')).toMatch(/1 nome\(s\) de motor não são conhecidos/);
    const tails = rows(s.tables, 'project_taxonomy_nodes').filter((n) => n.kind === 'cauda');
    expect(tails).toHaveLength(3);
    expect(tails.every((n) => n.source === 'agente' && n.status === 'sugerido' && n.organization_id === ORG && n.created_by === USER)).toBe(true);
    const by = new Map(tails.map((n) => [n.label, n]));
    expect(by.get('tornozeleira apitando o que fazer')).toMatchObject({ parent_id: crim.id });
    expect(by.get('Quanto tempo dura a tornozeleira')).toMatchObject({ parent_id: crim.id, keywords: ['tornozeleira', 'prazo'], evidence: { gerado_por: 'agente', publico: 'família do preso', motivo: 'dúvida muito repetida', motores: ['google_serp', 'bing_serp'], pais: 'br', lingua: 'pt-BR' } });
    expect(by.get('preso em flagrante por tráfico de drogas, e agora?')).toMatchObject({ parent_id: drog.id });
    expect(String(tails[0].slug)).toMatch(/^criminal\/c\/tornozeleira-apitando-o-que-fazer-[0-9a-z]+$/);
  });
  it('sem tamanho mínimo nem máximo de palavras: o agente decide (só descarta o que não cabe no campo)', async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [crim] }) });
    const longa = 'como funciona '.repeat(20).trim();
    const r = await s.call('tail_import', { items: [{ label: 'cnh', parent: 'criminal' }, { label: longa, parent: 'criminal' }, { label: 'a'.repeat(301), parent: 'criminal' }] });
    expect(r.body).toMatchObject({ added: 2, invalid: 1 });
  });
  it('reimportar não duplica; linhas de texto também servem; sem segmento e sem pai, a busca fica "sem área" e o sistema avisa', async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [crim, drog] }) });
    await s.call('tail_import', { items, segment: 'advocacia' });
    expect((await s.call('tail_import', { items, segment: 'advocacia' })).body).toMatchObject({ added: 0, already_there: 3 });
    const sem = await s.call('tail_import', { text: 'preso por tráfico em Osasco\nrecurso de multa por excesso de velocidade' });
    expect(sem.body).toMatchObject({ added: 0, unattached_count: 2 });
    expect(rows(s.tables, 'project_taxonomy_nodes').filter((n) => n.kind === 'cauda')).toHaveLength(3);
    const so = await s.call('tail_import', { text: 'dúvidas sobre tornozeleira\nprazo da tornozeleira', items: undefined, segment: 'advocacia' });
    expect(so.body.added).toBe(2);
  });
  it('erros: lista vazia, formato, segmento desconhecido', async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [crim] }) });
    expect((await s.call('tail_import', {})).body.error).toBe('tail_empty');
    expect((await s.call('tail_import', { items: [] })).body.error).toBe('tail_empty');
    expect((await s.call('tail_import', { text: '{quebrado' })).body.error).toBe('tail_format');
    expect((await s.call('tail_import', { items, segment: 'nada' })).body.error).toBe('segment_unknown');
  });
  it('a cauda é revisável como qualquer nó: aprovar, rejeitar e renomear; só a aprovada vira consulta', async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [crim], ibge_municipios: munis() }) });
    await s.call('tail_import', { items: [{ label: 'tornozeleira apitando', parent: 'criminal' }, { label: 'tornozeleira descarregou', parent: 'criminal' }] });
    const tails = rows(s.tables, 'project_taxonomy_nodes').filter((n) => n.kind === 'cauda');
    expect((await s.call('review', { nodeIds: [tails[0].id], decision: 'aprovado' })).status).toBe(200);
    expect((await s.call('review', { nodeId: tails[1].id, label: 'tornozeleira descarregou de madrugada' })).status).toBe(200);
    expect(tails[1].label).toBe('tornozeleira descarregou de madrugada');
    const p = await s.call('campaign_plan', { name: 'Só cauda aprovada', phases: [1] });
    const qs = rows(s.tables, 'market_queries').map((q) => q.query);
    expect(qs).toContain('tornozeleira apitando');
    expect(qs.some((q) => /descarregou/.test(String(q)))).toBe(false);
    expect(p.status).toBe(200);
  });
});

describe('bairros (distritos do IBGE)', () => {
  const approvedCity = (over: Row = {}): Row => ({ id: '00000000-0000-4000-8000-000000000701', project_id: P, organization_id: ORG, country: 'br', language: 'pt-BR', uf: 'SP', ibge_code: 3550308, municipio: 'São Paulo', bairro: null, regiao: null, role: 'atende', source: 'manual', status: 'aprovado', evidence: {}, ...over });
  const distritos = (code: number, nomes: string[]) => nomes.map((nome) => ({ id: code * 100, nome, municipio: { id: code, nome: 'São Paulo' } }));
  const fetchBy = (map: Record<string, unknown>) => (async (input: RequestInfo | URL) => {
    const u = String(input);
    return u in map ? new Response(JSON.stringify(map[u]), { status: 200 }) : new Response('nope', { status: 404 });
  }) as typeof fetch;

  it('sugere os distritos (bairros) dos municípios APROVADOS no escopo, como "sugerido", fonte IBGE, sem repetir e sem criar bairro igual ao nome da cidade', async () => {
    const url = `${IBGE_MUNICIPIOS_URL}/3550308/distritos`;
    const s = setup({ tables: seed({ project_geo_scope: [approvedCity(), approvedCity({ id: '00000000-0000-4000-8000-000000000702', ibge_code: 3534401, municipio: 'Osasco', status: 'sugerido' })] }), fetchFn: fetchBy({ [url]: distritos(3550308, ['Tatuapé', 'Mooca', 'Pinheiros']) }) });
    const r = await s.call('geo_districts', {});
    expect(r).toMatchObject({ status: 200, body: { cities: 1, added: 3, existing: 0, failed: [], remaining: 0 } });
    expect(s.fetched).toEqual([url]); // só o município aprovado; Osasco (sugerido) não
    const g = rows(s.tables, 'project_geo_scope').filter((x) => x.bairro);
    expect(g.map((x) => x.bairro).sort()).toEqual(['Mooca', 'Pinheiros', 'Tatuapé']);
    expect(g.every((x) => x.source === 'ibge' && x.status === 'sugerido' && x.municipio === 'São Paulo' && x.uf === 'SP' && x.ibge_code === 3550308 && x.organization_id === ORG)).toBe(true);
    expect((await s.call('geo_districts', {})).body).toMatchObject({ added: 0, existing: 3 });
    const unico = setup({ tables: seed({ project_geo_scope: [approvedCity({ ibge_code: 3534401, municipio: 'Osasco' })] }), fetchFn: fetchBy({ [`${IBGE_MUNICIPIOS_URL}/3534401/distritos`]: [{ id: 1, nome: 'Osasco' }] }) });
    expect((await unico.call('geo_districts', {})).body.added).toBe(0);
  });
  it('falha de leitura de uma cidade é dita, não escondida; sem município aprovado, avisa o que fazer', async () => {
    const s = setup({ tables: seed({ project_geo_scope: [approvedCity()] }), fetchFn: fetchBy({}) });
    const r = await s.call('geo_districts', {});
    expect(r.body).toMatchObject({ added: 0, failed: ['São Paulo'] });
    expect((r.body.warnings as string[]).join(' ')).toMatch(/Não consegui ler os distritos de: São Paulo/);
    const none = await one('geo_districts', {});
    expect((none.body.warnings as string[]).join(' ')).toMatch(/Aprove pelo menos um município/);
    expect(none.fetched).toEqual([]);
  });
  it('processa em lotes de 25 cidades por chamada e diz quantas faltam', async () => {
    const cities = Array.from({ length: 30 }, (_, i) => approvedCity({ id: `00000000-0000-4000-8000-${String(900 + i).padStart(12, '0')}`, ibge_code: 3500000 + i, municipio: `Cidade ${i}` }));
    const map = Object.fromEntries(cities.map((c) => [`${IBGE_MUNICIPIOS_URL}/${c.ibge_code}/distritos`, [{ nome: `Bairro ${c.ibge_code}` }, { nome: `Outro ${c.ibge_code}` }]]));
    const s = setup({ tables: seed({ project_geo_scope: cities }), fetchFn: fetchBy(map) });
    const a = await s.call('geo_districts', {});
    expect(a.body).toMatchObject({ cities: 25, added: 50, remaining: 5 });
    const b = await s.call('geo_districts', { offset: 25 });
    expect(b.body).toMatchObject({ cities: 5, added: 10, remaining: 0 });
  });
});

describe('concorrentes: importação e lista', () => {
  const crim = node('criminal', 'matriz', 'Criminal', { id: '00000000-0000-4000-8000-000000000a01' });
  const setupWith = async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [crim], ibge_municipios: munis() }) });
    const plan = await s.call('campaign_plan', { name: 'Mercado', segment: 'advocacia' });
    return { ...s, cid: (plan.body.campaign as { id: string }).id };
  };
  const csv = [
    'consulta;posicao;url;titulo;tipo',
    'advogado criminalista em Guarulhos;1;https://www.rival.com.br/a;Rival;organico',
    'advogado criminalista em Guarulhos;2;https://jusbrasil.com.br/x;JusBrasil;organico',
    'advogado criminalista em Guarulhos;3;https://www.rdmadvogados.com.br/;Nós;organico',
    'advogado criminalista em Guarulhos;1;https://rival.com.br/mapa;Rival mapa;mapa',
    'advogado criminalista;1;https://outro.adv.br/;Outro;organico',
    'advogado criminalista;2;https://rival.com.br/b;Rival;organico',
    'advogado criminalista cnh suspensa em Santos;1;https://novo.com.br/;Novo;organico',
  ].join('\n');

  it('importa resultados já obtidos: guarda, marca as consultas como executadas, cria as que faltam e calcula os concorrentes (sem gastar nada)', async () => {
    const s = await setupWith();
    const r = await s.call('campaign_results_import', { campaignId: s.cid, text: csv });
    expect(r).toMatchObject({ status: 200, body: { executed: false, results_added: 7, queries_with_results: 3, queries_created: 1, ignored_rows: 0, invalid: 0, competitors: 4, own_appearances: 1 } });
    expect(rows(s.tables, 'market_serp_results')).toHaveLength(7);
    const qs = rows(s.tables, 'market_queries');
    expect(qs.filter((q) => q.status === 'executada')).toHaveLength(3);
    expect(qs.find((q) => q.query === 'advogado criminalista cnh suspensa em Santos')).toMatchObject({ scope: 'municipio', municipio: 'Santos', uf: 'SP', node_id: crim.id, status: 'executada', campaign_id: s.cid });
    expect(rows(s.tables, 'market_serp_results').find((x) => String(x.url).includes('rival.com.br/mapa'))).toMatchObject({ host: 'rival.com.br', kind: 'mapa', organization_id: ORG });
    const comp = new Map(rows(s.tables, 'market_competitors').map((c) => [c.host, c]));
    expect(comp.get('rival.com.br')).toMatchObject({ kind: 'concorrente', appearances: 3 });
    expect(comp.get('jusbrasil.com.br')).toMatchObject({ kind: 'diretorio' });
    expect(comp.has('rdmadvogados.com.br')).toBe(false);
    expect(s.fetched).toEqual([]);
  });
  it('reimportar a mesma consulta SUBSTITUI os resultados dela (idempotente) e preserva a data da primeira aparição', async () => {
    const s = await setupWith();
    await s.call('campaign_results_import', { campaignId: s.cid, text: csv });
    const first = rows(s.tables, 'market_competitors').find((c) => c.host === 'rival.com.br')!.first_seen;
    const r = await s.call('campaign_results_import', { campaignId: s.cid, text: 'consulta,posicao,url\nadvogado criminalista,1,https://novo.com.br/' });
    expect(r.body).toMatchObject({ results_added: 1, queries_with_results: 1 });
    expect(rows(s.tables, 'market_serp_results')).toHaveLength(6);
    expect(rows(s.tables, 'market_serp_results').filter((x) => x.host === 'outro.adv.br')).toHaveLength(0);
    expect(rows(s.tables, 'market_competitors').find((c) => c.host === 'rival.com.br')!.first_seen).toBe(first);
  });
  it('arquivo com coluna de motor: cada linha vai para a consulta do motor dela (e cria a que falta); motor desconhecido é ignorado', async () => {
    const s = await setupWith();
    const text = ['consulta;posicao;url;motor', 'advogado criminalista;1;https://a.com.br/;google_serp', 'advogado criminalista;1;https://b.com.br/;brave_search', 'advogado criminalista;2;https://c.com.br/;motor_x'].join('\n');
    const r = await s.call('campaign_results_import', { campaignId: s.cid, text });
    expect(r.body).toMatchObject({ results_added: 3, queries_created: 1 });
    const qs = rows(s.tables, 'market_queries').filter((q) => q.query === 'advogado criminalista');
    expect(qs.map((q) => q.engine).sort()).toEqual(['brave_search', 'google_serp']);
    const byEngine = new Map(qs.map((q) => [q.engine, q.id]));
    const res = rows(s.tables, 'market_serp_results');
    expect(res.find((x) => String(x.url).includes('b.com.br'))!.query_id).toBe(byEngine.get('brave_search'));
    expect(res.find((x) => String(x.url).includes('a.com.br'))!.query_id).toBe(byEngine.get('google_serp'));
    expect(res.find((x) => String(x.url).includes('c.com.br'))!.query_id).toBe(byEngine.get('google_serp')); // motor desconhecido: cai no padrão
  });
  it('sem criar consultas novas: as que não estão no plano são ignoradas e contadas', async () => {
    const s = await setupWith();
    const r = await s.call('campaign_results_import', { campaignId: s.cid, text: csv, create_missing: false });
    expect(r.body).toMatchObject({ queries_created: 0, ignored_rows: 1, unknown_queries: 1, results_added: 6 });
  });
  it('erros: texto vazio, formato, cabeçalho, campanha de outro projeto/cancelada, id inválido', async () => {
    const s = await setupWith();
    const c = (b: Row) => s.call('campaign_results_import', { campaignId: s.cid, ...b });
    expect((await c({ text: '' })).body.error).toBe('import_empty');
    expect((await c({ text: '{x' })).body.error).toBe('import_format');
    expect((await c({ text: 'a,b\n1,2' })).body.error).toBe('import_header_required');
    expect((await s.call('campaign_results_import', { text: csv })).body.error).toBe('campaign_id_required');
    expect((await s.call('campaign_results_import', { campaignId: '00000000-0000-4000-8000-0000000000ee', text: csv })).status).toBe(404);
    await s.call('campaign_cancel', { campaignId: s.cid });
    expect((await c({ text: csv })).body.error).toBe('campaign_cancelled');
    const foreign = { id: '00000000-0000-4000-8000-000000000f02', project_id: P_OTHER, organization_id: OTHER, name: 'alheia', status: 'rascunho', provider: 'manual', config: {} };
    s.tables.market_campaigns.push(foreign);
    expect(await s.call('campaign_results_import', { campaignId: foreign.id, text: csv })).toMatchObject({ status: 404, body: { error: 'campaign_not_found' } });
    expect(await s.call('campaign_approve', { campaignId: foreign.id })).toMatchObject({ status: 404 });
    expect(await s.call('campaign_cancel', { campaignId: foreign.id })).toMatchObject({ status: 404 });
    expect(foreign.status).toBe('rascunho');
  });
  it('campanha aprovada cujas consultas todas receberam resultado termina sozinha', async () => {
    const s = setup({ tables: seed({ project_taxonomy_nodes: [crim], ibge_municipios: munis() }) });
    const t = s.tables;
    const camp = { id: '00000000-0000-4000-8000-000000000b01', project_id: P, organization_id: ORG, name: 'Mini', status: 'aprovada', provider: 'manual', budget_cap_cents: 0, config: {} };
    t.market_campaigns.push(camp);
    t.market_queries.push({ id: '00000000-0000-4000-8000-000000000b02', project_id: P, organization_id: ORG, campaign_id: camp.id, query: 'advogado criminalista', node_id: crim.id, scope: 'brasil', status: 'planejada' });
    await s.call('campaign_results_import', { campaignId: camp.id, text: 'consulta,posicao,url\nadvogado criminalista,1,https://a.com.br/', create_missing: false });
    expect(camp.status).toBe('concluida');
  });
  it('competitors_list sem filtro lê o resumo guardado; com filtro recalcula por área, estado, município e região; tipo e limite', async () => {
    const s = await setupWith();
    await s.call('campaign_results_import', { campaignId: s.cid, text: csv });
    const all = await s.call('competitors_list');
    expect(all.body.filtered).toBe(false);
    expect((all.body.competitors as Array<{ host: string }>).map((c) => c.host).sort()).toEqual(['jusbrasil.com.br', 'novo.com.br', 'outro.adv.br', 'rival.com.br']);
    expect((await s.call('competitors_list', { kind: 'diretorio' })).body.competitors).toEqual([expect.objectContaining({ host: 'jusbrasil.com.br', kind: 'diretorio' })]);
    expect(((await s.call('competitors_list', { kind: 'concorrente', limit: 1 })).body.competitors as Row[])).toHaveLength(1);
    const g = await s.call('competitors_list', { filter: { municipio: 'guarulhos' }, kind: 'concorrente' });
    expect(g.body).toMatchObject({ filtered: true, total: 1, own_appearances: 1 });
    expect((g.body.competitors as Array<{ host: string; appearances: number }>)[0]).toMatchObject({ host: 'rival.com.br', appearances: 2 });
    const area = await s.call('competitors_list', { filter: { area: 'criminal', uf: 'SP' }, kind: 'todos' });
    expect((area.body.competitors as Array<{ host: string }>).map((c) => c.host).sort()).toEqual(['jusbrasil.com.br', 'novo.com.br', 'rival.com.br']);
    expect((await s.call('competitors_list', { filter: { area: 'trabalhista' } })).body.competitors).toEqual([]);
    expect((await s.call('competitors_list', { filter: { uf: 'XX' } })).body.error).toBe('filter_invalid');
    expect((await s.call('competitors_list', { filter: { scope: 'planeta' } })).body.error).toBe('filter_invalid');
    expect((await s.call('competitors_list', { kind: 'x' })).body.error).toBe('kind_invalid');
  });
  it('isolamento: resultados e concorrentes de outro projeto nunca aparecem', async () => {
    const t = seed({ market_competitors: [{ id: '00000000-0000-4000-8000-000000000c01', project_id: P_OTHER, organization_id: OTHER, host: 'alheio.com.br', kind: 'concorrente', score: 99, appearances: 9, areas: [], locations: {} }] });
    const r = await one('competitors_list', {}, { tables: t });
    expect(r.body.competitors).toEqual([]);
    expect((await one('overview', {}, { tables: t })).body.competitors_top).toEqual([]);
  });
});
