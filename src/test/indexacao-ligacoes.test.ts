import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { assessProject, buildItems, normalizeFacts, scoreItems, type ProjectFacts } from '../../supabase/functions/_shared/project-health-core';
import { buildConnectionMap, verifyIntegrity, verifyManifest } from '../../supabase/functions/_shared/project-integrity-core';
import { EXPORT_TABLES, FLOW_CHAIN, MODULES, moduleByKey, moduleEdges } from '../../supabase/functions/_shared/module-registry';
import { handleLifecycleAction } from '../../supabase/functions/_shared/project-lifecycle-handler';
import { PLUGIN_VERSION } from '../../supabase/functions/_shared/plugin-version';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const ORG = '00000000-0000-4000-8000-0000000000a1';
const P = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000c1';

const base = (over: Partial<ProjectFacts> = {}): ProjectFacts => ({
  id: P, name: 'Blog RDM', domain: 'rdmadvogados.com.br', wordpress_url: 'https://rdmadvogados.com.br', created_at: daysAgo(200), lifecycle_status: 'ativo', archived_at: null, paused_reason: null,
  wordpress: { connected: true, plugin_version: PLUGIN_VERSION, mode: 'zica_posts', connected_at: daysAgo(100), last_verified_at: daysAgo(2) }, profile: { status: 'confirmed', completeness: 92, confirmed: true },
  articles: { total: 10, published: 8, last_published_at: daysAgo(10) }, gsc: { rows: 500, last_day: daysAgo(2).slice(0, 10) }, ga4: { rows: 50, last_day: daysAgo(2).slice(0, 10) }, providers: ['gsc', 'ga4'],
  signals: { tracking_key: true, last_batch_at: daysAgo(1), last_day: daysAgo(1).slice(0, 10), cta_28d: 3 }, automation: { news_agents_active: 0, rss_active: 0 }, taxonomy: { nodes: 5, approved: 3 }, site_map: { reads: 1, last_at: daysAgo(3) },
  speed: { scheduled: true, enabled: true, frequency: 'weekly', consecutive_failures: 0, runs: 3, last_run_at: daysAgo(3), last_score: 70 }, alerts: { open_speed: 0, open_backlinks: 0 }, backlinks: { total: 4, live: 3, last_checked_at: daysAgo(3) },
  funnel: { configured: true, entries: 2, last_month: '2026-10-01' }, observatory: { prompts: 1, citations: 1 }, ...over,
});
const ix = (over: Partial<NonNullable<ProjectFacts['indexation']>> = {}): NonNullable<ProjectFacts['indexation']> => ({ urls: 2819, indexed: 0, not_indexed: 0, problems: 0, last_checked_at: null, last_synced_at: daysAgo(1), ...over });
const item = (f: ProjectFacts) => buildItems(f, NOW).find((i) => i.key === 'indexacao')!;

describe('indexação na saúde do projeto', () => {
  it('módulo não instalado ou sem inventário: "sem dados", com fonte, e FORA da nota (a nota não muda)', () => {
    const none = base();
    const a = item(none);
    expect(a).toMatchObject({ status: 'sem_dados', source: 'Indexação', area: 'estrutura' });
    expect(a.detail).toMatch(/não instalado/);
    expect(item(base({ indexation: null })).status).toBe('sem_dados');
    const empty = item(base({ indexation: ix({ urls: 0 }) }));
    expect(empty.status).toBe('sem_dados');
    expect(empty.detail).toMatch(/Ainda não há inventário/);
    const score = (f: ProjectFacts) => scoreItems(buildItems(f, NOW));
    expect(score(base())).toBe(score(base({ indexation: ix({ urls: 0 }) })));
    expect(score(base({ indexation: ix() }))).toBe(score(base())); // inventário sem consulta ao Google = informativo, também fora da nota
  });
  it('com consulta ao Google: ok quando a maioria está indexada e sem problema; atenção com problema ou menos da metade; traz data e ação', () => {
    const okItem = item(base({ indexation: ix({ indexed: 90, not_indexed: 10, last_checked_at: daysAgo(2) }) }));
    expect(okItem).toMatchObject({ status: 'ok', date: daysAgo(2) });
    expect(okItem.detail).toMatch(/90 URLs indexadas de 100 consultadas no Google \(90%\)/);
    const withProblems = item(base({ indexation: ix({ indexed: 90, not_indexed: 10, problems: 4, last_checked_at: daysAgo(2) }) }));
    expect(withProblems.status).toBe('atencao');
    expect(withProblems.detail).toMatch(/4 URLs com problema/);
    expect(withProblems.action).toMatch(/Indexação/);
    expect(item(base({ indexation: ix({ indexed: 10, not_indexed: 90, last_checked_at: daysAgo(1) }) })).status).toBe('atencao');
    expect(item(base({ indexation: ix({ problems: 3 }) }))).toMatchObject({ status: 'info' });
    expect(item(base({ indexation: ix({ problems: 3 }) })).detail).toMatch(/ainda não foi consultado/);
    // entra na nota quando há consulta
    const h = assessProject(base({ indexation: ix({ indexed: 10, not_indexed: 90, last_checked_at: daysAgo(1) }) }), [], NOW);
    expect(h.items.find((i) => i.key === 'indexacao')!.status).toBe('atencao');
  });
  it('normalizeFacts lê o bloco do banco; valor ausente ou inválido vira null', () => {
    expect(normalizeFacts({ id: P, name: 'x', indexation: { urls: '12', indexed: 5, not_indexed: 1, problems: 2, last_checked_at: '2026-11-01T00:00:00Z', last_synced_at: null } }).indexation).toEqual({ urls: 12, indexed: 5, not_indexed: 1, problems: 2, last_checked_at: '2026-11-01T00:00:00Z', last_synced_at: null });
    expect(normalizeFacts({ id: P, name: 'x' }).indexation).toBeNull();
    expect(normalizeFacts({ id: P, name: 'x', indexation: 'lixo' }).indexation).toBeNull();
  });
  it('Central de Projetos: health_detail junta project_indexation_summary quando a função existe; sem a função, "sem dados" (nunca zero inventado)', async () => {
    const raw = { id: P, name: 'Blog RDM', domain: 'rdmadvogados.com.br', wordpress: {}, articles: {}, gsc: {}, ga4: {}, signals: {}, automation: {}, providers: [] };
    const tables = (): Record<string, Row[]> => ({ projects: [{ id: P, name: 'Blog RDM', organization_id: ORG, lifecycle_status: 'ativo', paused_snapshot: null }], project_lifecycle_events: [] });
    const run = (rpcs: Record<string, () => { data: unknown; error: unknown }>) => handleLifecycleAction(fakeAdmin(tables(), { project_health_inputs: () => ({ data: [raw], error: null }), ...rpcs }).admin, { action: 'health_detail', body: { projectId: P }, userId: USER, roleByOrg: new Map([[ORG, 'owner']]), deps: { now: () => NOW } });
    const withIx = await run({ project_indexation_summary: () => ({ data: { [P]: { urls: 120, indexed: 100, not_indexed: 20, problems: 0, last_checked_at: daysAgo(1), last_synced_at: daysAgo(1) } }, error: null }) });
    const itemIx = (withIx.body.health as { items: Array<{ key: string; status: string; detail: string }> }).items.find((i) => i.key === 'indexacao')!;
    expect(itemIx.status).toBe('ok');
    expect(itemIx.detail).toMatch(/100 URLs indexadas de 120/);
    const noFn = await run({});
    expect((noFn.body.health as { items: Array<{ key: string; status: string }> }).items.find((i) => i.key === 'indexacao')).toMatchObject({ status: 'sem_dados' });
    const empty = await run({ project_indexation_summary: () => ({ data: {}, error: null }) });
    expect((empty.body.health as { items: Array<{ key: string; detail: string }> }).items.find((i) => i.key === 'indexacao')!.detail).toMatch(/Ainda não há inventário/);
  });
});

describe('indexação no manifesto e no mapa de conexões', () => {
  it('o módulo está registrado e ativo, produz as tabelas novas e declara o que consome; o manifesto continua consistente e a cadeia combinada intacta', () => {
    const m = moduleByKey('indexacao')!;
    expect(m).toMatchObject({ status: 'ativo', route: '/indexacao', label: 'Indexação' });
    expect(m.produces).toEqual(expect.arrayContaining(['index_urls', 'index_status', 'index_submissions', 'index_hygiene', 'project_events']));
    expect(m.optionalConsumes).toEqual(['project_taxonomy_nodes', 'nexus_search_performance', 'articles', 'project_site_maps']);
    expect(verifyManifest().problems).toEqual([]);
    expect(FLOW_CHAIN).toEqual(['perfil', 'taxonomia', 'estudio_paginas', 'funil', 'monitor', 'alertas', 'arvore']);
    expect(new Set(MODULES.map((x) => x.key)).size).toBe(MODULES.length);
    const edges = moduleEdges().filter((e) => e.to === 'indexacao');
    expect(edges.map((e) => `${e.from}:${e.table}`).sort()).toEqual(['conteudo:articles', 'google:nexus_search_performance', 'taxonomia:project_taxonomy_nodes', 'visao_geral:project_site_maps']);
    expect(edges.every((e) => e.optional && !e.planned)).toBe(true);
  });
  it('exportação do projeto inclui o inventário, o estado, os envios, a higiene e a linha do tempo, e NÃO a chave do IndexNow', () => {
    const names = EXPORT_TABLES.map((t) => t.table);
    expect(names).toEqual(expect.arrayContaining(['index_urls', 'index_status', 'index_submissions', 'index_hygiene', 'project_events']));
    expect(names).not.toContain('index_keys');
    expect(EXPORT_TABLES.find((t) => t.table === 'index_status')?.reobtainable).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
  it('mapa: Indexação aparece "não instalado" sem o bloco, "sem dados" com urls 0 e "com dados" com inventário; as ligações são REAIS e opcionais', () => {
    const st = (f: ProjectFacts) => buildConnectionMap(f).modules.find((m) => m.key === 'indexacao')!;
    expect(st(base()).state).toBe('nao_instalado');
    expect(st(base({ indexation: ix({ urls: 0 }) })).state).toBe('sem_dados');
    const withData = st(base({ indexation: ix({ indexed: 3 }) }));
    expect(withData.state).toBe('com_dados');
    expect(withData.detail).toMatch(/2\.819 URLs, 3 indexadas/);
    const links = buildConnectionMap(base({ indexation: ix() })).links.filter((l) => l.to === 'indexacao');
    expect(links).toHaveLength(4);
    expect(links.every((l) => l.state === 'ok' && /ligação opcional/.test(l.text))).toBe(true);
  });
  it('ligação opcional nunca vira "vínculo quebrado": Indexação com dado e Taxonomia sem dado é normal (funciona só com sitemaps); sem consumo é só informativo', () => {
    const r = verifyIntegrity(base({ taxonomy: { nodes: 0, approved: 0 }, indexation: ix() }), NOW);
    expect(r.issues.filter((i) => i.kind === 'vinculo_quebrado' && /indexacao/.test(i.key))).toEqual([]);
    const links = buildConnectionMap(base({ taxonomy: { nodes: 0, approved: 0 }, indexation: ix() })).links.find((l) => l.from === 'taxonomia' && l.to === 'indexacao')!;
    expect(links.state).toBe('vazio');
    const idle = verifyIntegrity(base({ indexation: ix({ urls: 0 }) }), NOW);
    expect(idle.issues.filter((i) => /indexacao/.test(i.key)).every((i) => i.level === 'info')).toBe(true);
    expect(idle.intact).toBe(true);
  });
});
