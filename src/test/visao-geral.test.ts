import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { buildDiagnostics, buildKpis, buildTree, ctr, delta, type MapSummary, type RawOverview } from '../../supabase/functions/_shared/overview-core';
import { OVERVIEW_ACTIONS, REFRESH_MIN_INTERVAL_MS, handleOverviewAction } from '../../supabase/functions/_shared/overview-handler';
import type { Deps } from '../../supabase/functions/_shared/profile-analyze-core';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 20, 12);

const raw = (over: Partial<RawOverview> = {}): RawOverview => ({
  days: 28,
  gsc: {
    window: { cur_from: '2026-10-21', cur_to: '2026-11-17' },
    totals: { cur: { clicks: 78, impressions: 24122, position: 12.3 }, prev: { clicks: 69, impressions: 16519, position: 16.8 } },
    by_host: [
      { host: 'rdmadvogados.com.br', pages: 571, clicks: 78, impressions: 21285, position: 13.2 },
      { host: 'defesadecnh.rdmadvogados.com.br', pages: 1, clicks: 0, impressions: 2802, position: 4.5 },
    ],
    by_section: [
      { host: 'rdmadvogados.com.br', section: 'blog', pages: 560, clicks: 70, impressions: 20000, position: 14 },
      { host: 'rdmadvogados.com.br', section: 'advogado-criminalista', pages: 11, clicks: 8, impressions: 1285, position: 9 },
      { host: 'defesadecnh.rdmadvogados.com.br', section: '(raiz)', pages: 1, clicks: 0, impressions: 2802, position: 4.5 },
    ],
    top_pages: [], top_queries: [],
  },
  ga4: { window: { cur_from: '2026-10-22', cur_to: '2026-11-18' }, totals: { cur: { sessions: 54, views: 108, users: 51, key_events: 331, ai_sessions: 1 }, prev: { sessions: 54, views: 105, users: 48, key_events: 348, ai_sessions: 0 } }, channels: [], top_pages: [] },
  signals: [{ kind: 'ai_referral', agent: 'gemini.google.com', hits: 3 }, { kind: 'search_referral', agent: 'google', hits: 278 }],
  articles: { total: 2312, published: 2218, last_published_at: '2026-11-10T23:49:07.639+00:00' },
  ...over,
});
const conn = { gsc: true, ga4: true, bing: true, tracking_key: true };
const map = (host: string, over: Record<string, unknown> = {}): MapSummary => ({ host, fetched_at: '2026-11-19T10:00:00.000Z', is_primary: host === 'rdmadvogados.com.br', summary: { robots: { found: true }, llms: { found: true }, sitemap: { found: true, urls: 2344, files: [{ url: 'x', count: 2344 }], sections: [{ section: 'blog', count: 2300, latest: null }, { section: 'advogado-criminalista', count: 3, latest: null }, { section: 'categoria-antiga', count: 40, latest: null }], newest: '2026-11-11' }, ...over } as MapSummary['summary'] });

describe('visão geral: indicadores', () => {
  it('comparação com o período anterior, sem dividir por zero e sem inventar', () => {
    expect(delta(78, 69)).toEqual({ value: 78, previous: 69, abs: 9, pct: 13 });
    expect(delta(5, 0)).toMatchObject({ pct: null, abs: 5 });
    expect(delta(null, 3)).toMatchObject({ value: null, abs: null });
    expect(delta(4, undefined)).toMatchObject({ previous: null, abs: null });
    expect(ctr(78, 24122)).toBe(0.32);
    expect(ctr(1, 0)).toBeNull();
  });
  it('indicadores do Google e do GA4, cliques de contato por tipo e visitas de IA', () => {
    const k = buildKpis(raw({ signals: [{ kind: 'cta_click', agent: 'whatsapp', hits: 9 }, { kind: 'cta_click', agent: 'phone', hits: 3 }, { kind: 'ai_referral', agent: 'chatgpt.com', hits: 2 }, { kind: 'ai_bot_hit', agent: 'GPTBot', hits: 40 }] }));
    expect(k.gsc?.clicks).toMatchObject({ value: 78, abs: 9 });
    expect(k.gsc?.position).toMatchObject({ value: 12.3, abs: -4.5 }); // posição caiu de 16,8 para 12,3: melhorou
    expect(k.ga4?.sessions).toMatchObject({ value: 54, abs: 0 });
    expect(k.cta).toEqual({ total: 12, by_agent: { whatsapp: 9, phone: 3 } });
    expect(k.ai).toEqual({ referrals: 2, bot_hits: 40 });
  });
  it('sem dado: devolve null, não zero', () => {
    const k = buildKpis(raw({ gsc: { window: null, totals: {}, by_host: [], by_section: [], top_pages: [], top_queries: [] }, ga4: { window: null, totals: {}, channels: [], top_pages: [] }, signals: [], articles: null }));
    expect(k.gsc).toBeNull(); expect(k.ga4).toBeNull(); expect(k.articles).toBeNull(); expect(k.cta.total).toBe(0);
  });
});

describe('visão geral: diagnósticos', () => {
  const diag = (r: RawOverview, c = conn, maps: MapSummary[] = [], host: string | null = 'rdmadvogados.com.br') => buildDiagnostics(r, buildKpis(r), c, maps, host, NOW).map((d) => d.key);
  it('GA4 abaixo dos cliques do Google e eventos-chave demais viram aviso com os números', () => {
    const d = buildDiagnostics(raw(), buildKpis(raw()), conn, [map('rdmadvogados.com.br')], 'rdmadvogados.com.br', NOW);
    expect(d.find((x) => x.key === 'ga4_abaixo_do_google')?.text).toMatch(/54 sessões.*78 cliques/);
    expect(d.find((x) => x.key === 'eventos_chave_demais')?.text).toMatch(/331 eventos-chave para 54 sessões/);
  });
  it('sem cliques de contato: pede atualizar o plugin; sem chave de sinais: diz que o rastreio não está configurado', () => {
    expect(diag(raw())).toContain('sem_cliques_de_contato');
    expect(diag(raw(), { ...conn, tracking_key: false })).toContain('sem_rastreio_do_site');
    expect(diag(raw({ signals: [{ kind: 'cta_click', agent: 'whatsapp', hits: 4 }] }))).not.toContain('sem_cliques_de_contato');
  });
  it('Google não conectado, publicação parada, sem mapa', () => {
    const k = diag(raw(), { gsc: false, ga4: false, bing: false, tracking_key: true });
    expect(k).toEqual(expect.arrayContaining(['google_nao_conectado', 'ga4_nao_conectado']));
    const d = buildDiagnostics(raw(), buildKpis(raw()), conn, [], 'rdmadvogados.com.br', NOW);
    const late = buildDiagnostics(raw({ articles: { total: 10, published: 9, last_published_at: '2026-11-01T10:00:00.000Z' } }), buildKpis(raw()), conn, [], 'rdmadvogados.com.br', NOW);
    expect(late.find((x) => x.key === 'publicacao_parada')?.text).toMatch(/há 19 dias/);
    expect(d.map((x) => x.key)).not.toContain('publicacao_parada'); // 9 dias: ainda dentro do prazo
    expect(d.map((x) => x.key)).toContain('sem_mapa');
  });
  it('sitemap curto frente às páginas que o Google mostra, e sem sitemap', () => {
    const short = map('rdmadvogados.com.br', { sitemap: { found: true, urls: 2, files: [], sections: [] } });
    expect(buildDiagnostics(raw(), buildKpis(raw()), conn, [short], 'rdmadvogados.com.br', NOW).find((x) => x.key === 'sitemap_curto')?.text).toMatch(/lista 2 URLs.*571 páginas/);
    const none = map('rdmadvogados.com.br', { sitemap: { found: false, urls: 0, files: [], sections: [] } });
    expect(diag(raw(), conn, [none])).toContain('sem_sitemap');
  });
  it('subdomínio que aparece no Google sem mapa guardado é lembrado', () => {
    expect(diag(raw(), conn, [map('rdmadvogados.com.br')])).toContain('sem_mapa:defesadecnh.rdmadvogados.com.br');
  });
});

describe('visão geral: árvore do domínio', () => {
  it('junta Google e sitemap por seção e marca seções sem busca e fora do mapa', () => {
    const tree = buildTree(raw(), [map('rdmadvogados.com.br')], 'rdmadvogados.com.br');
    const main = tree[0];
    expect(main).toMatchObject({ host: 'rdmadvogados.com.br', primary: true });
    expect(main.map).toMatchObject({ sitemap_found: true, sitemap_urls: 2344, llms_found: true });
    const sec = Object.fromEntries(main.sections.map((s) => [s.section, s]));
    expect(sec.blog).toMatchObject({ gsc_pages: 560, impressions: 20000, sitemap_urls: 2300, flag: null });
    expect(sec['advogado-criminalista']).toMatchObject({ gsc_pages: 11, sitemap_urls: 3 });
    expect(sec['categoria-antiga']).toMatchObject({ impressions: 0, sitemap_urls: 40, flag: 'sem_busca' });
    expect(main.sections[0].section).toBe('blog'); // ordenado por impressões
  });
  it('seção que o Google mostra mas o sitemap não lista fica marcada; subdomínio sem mapa aparece sem inventar contagem', () => {
    const m = map('rdmadvogados.com.br', { sitemap: { found: true, urls: 10, files: [], sections: [{ section: 'blog', count: 10, latest: null }] } });
    const tree = buildTree(raw(), [m], 'rdmadvogados.com.br');
    expect(tree[0].sections.find((s) => s.section === 'advogado-criminalista')?.flag).toBe('fora_do_mapa');
    const cnh = tree.find((h) => h.host === 'defesadecnh.rdmadvogados.com.br');
    expect(cnh).toMatchObject({ primary: false, map: null });
    expect(cnh?.sections[0]).toMatchObject({ section: '(raiz)', sitemap_urls: null, flag: null });
  });
  it('usa só o mapa mais recente de cada host', () => {
    const old = { ...map('rdmadvogados.com.br'), fetched_at: '2026-10-01T00:00:00.000Z', summary: { sitemap: { found: false, urls: 0 } } } as MapSummary;
    const tree = buildTree(raw(), [map('rdmadvogados.com.br'), old], 'rdmadvogados.com.br');
    expect(tree[0].map?.sitemap_urls).toBe(2344);
  });
});

describe('visão geral: função de borda', () => {
  const project = { id: P, name: 'Blog RDM', domain: 'rdmadvogados.com.br', wordpress_url: 'https://rdmadvogados.com.br/blog', organization_id: ORG };
  const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({ projects: [project], nexus_oauth_connections: [{ project_id: P, provider: 'gsc' }, { project_id: P, provider: 'ga4' }], nexus_site_keys: [{ project_id: P, site_id: 'abc' }], project_site_maps: [], ...over });
  const deps = (pages: Record<string, string> = {}): Deps => ({
    now: () => NOW, lookupA: async () => ['93.184.216.34'],
    fetchFn: (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (pages[u] !== undefined) return new Response(pages[u], { status: 200, headers: { 'content-type': u.endsWith('.xml') ? 'application/xml' : u.endsWith('.txt') ? 'text/plain' : 'text/html' } });
      return new Response('', { status: 404 });
    }) as typeof fetch,
  });
  const run = (action: string, body: Record<string, unknown>, o: { role?: string | null; tables?: Record<string, Row[]>; d?: Deps } = {}) => {
    const tables = o.tables || seed();
    const { admin } = fakeAdmin(tables, { site_overview_data: () => ({ data: raw(), error: null }) });
    return handleOverviewAction(admin, { action, body: { projectId: P, ...body }, userId: USER, roleByOrg: new Map<string, string>(o.role === null ? [[OTHER, 'owner']] : [[ORG, o.role || 'owner']]), deps: o.d || deps() }).then((r) => ({ ...r, tables }));
  };

  it('ações existentes', () => { expect(OVERVIEW_ACTIONS).toEqual(['overview', 'refresh_structure']); });
  it('overview: junta banco, conexões, mapa e diagnósticos; membro só de leitura vê mas não atualiza', async () => {
    const r = await run('overview', {}, { role: 'viewer' });
    expect(r.status).toBe(200);
    const b = r.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(b.connections).toEqual({ gsc: true, ga4: true, bing: false, tracking_key: true });
    expect(b.can_refresh).toBe(false);
    expect(b.kpis.gsc.clicks.value).toBe(78);
    expect(b.diagnostics.map((d: { key: string }) => d.key)).toContain('sem_cliques_de_contato');
    expect(b.tree[0].host).toBe('rdmadvogados.com.br');
  });
  it('papéis e dados inválidos', async () => {
    expect((await run('overview', {}, { role: null })).body.error).toBe('organization_membership_required');
    expect((await run('overview', { projectId: 'x' })).body.error).toBe('project_id_required');
    expect((await run('refresh_structure', {}, { role: 'viewer' })).status).toBe(403);
    expect((await run('nada', {})).status).toBe(400);
  });
  it('janela de dias só aceita 7, 28 ou 90', async () => {
    const calls: unknown[] = [];
    const { admin } = fakeAdmin(seed(), { site_overview_data: (a) => { calls.push(a.p_days); return { data: raw(), error: null }; } });
    const ctx = (days: unknown) => ({ action: 'overview', body: { projectId: P, days }, userId: USER, roleByOrg: new Map([[ORG, 'owner']]), deps: deps() });
    await handleOverviewAction(admin, ctx(90)); await handleOverviewAction(admin, ctx(5)); await handleOverviewAction(admin, ctx('abc'));
    expect(calls).toEqual([90, 28, 28]);
  });
  it('atualizar o mapa: lê robots, sitemap e llms.txt do site e dos subdomínios do mesmo domínio e guarda um resumo', async () => {
    const pages = {
      'https://rdmadvogados.com.br/': '<html><head><title>RDM Advogados</title></head><body><h1>RDM</h1><p>texto do site com conteúdo suficiente para ser uma página de verdade.</p></body></html>',
      'https://rdmadvogados.com.br/robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://rdmadvogados.com.br/sitemap.xml\n',
      'https://rdmadvogados.com.br/llms.txt': '# RDM Advogados\n\n> Diretorio de paginas publicas do escritorio.\n',
      'https://rdmadvogados.com.br/sitemap.xml': '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://rdmadvogados.com.br/</loc></url><url><loc>https://rdmadvogados.com.br/advogado-criminalista/guarulhos/</loc></url><url><loc>https://rdmadvogados.com.br/advogado-criminalista/tatuape/</loc></url></urlset>',
    };
    const r = await run('refresh_structure', {}, { d: deps(pages) });
    expect(r.status).toBe(200);
    expect(r.body.refreshed).toBe(2); // site principal + defesadecnh (aparece no Google)
    const saved = r.tables.project_site_maps.find((m) => m.host === 'rdmadvogados.com.br') as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(saved).toMatchObject({ project_id: P, organization_id: ORG, is_primary: true, requested_by: USER });
    expect(saved.summary.sitemap).toMatchObject({ found: true, urls: 3 });
    expect(saved.summary.sitemap.sections).toEqual(expect.arrayContaining([expect.objectContaining({ section: 'advogado-criminalista', count: 2 })]));
    expect(saved.summary.llms.found).toBe(true);
  });
  it('não deixa atualizar o mapa de novo em menos de 10 minutos e exige site cadastrado', async () => {
    const recent = new Date(NOW - 60_000).toISOString();
    const r = await run('refresh_structure', {}, { tables: seed({ project_site_maps: [{ project_id: P, host: 'rdmadvogados.com.br', fetched_at: recent, summary: {} }] }) });
    expect(r).toMatchObject({ status: 429, body: { error: 'refresh_too_soon' } });
    expect(REFRESH_MIN_INTERVAL_MS).toBe(600_000);
    const t = seed(); t.projects = [{ ...project, domain: null, wordpress_url: null }];
    expect((await run('refresh_structure', {}, { tables: t })).body.error).toBe('project_domain_required');
  });
});
