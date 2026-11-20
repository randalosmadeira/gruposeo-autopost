import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row, type RpcHandler } from './helpers/fake-admin';
import { INDEXATION_ACTIONS, handleIndexationAction, type GoogleLink, type IndexationDeps } from '../../supabase/functions/_shared/indexation-handler';
import { GOOGLE_INSPECT_DAILY_LIMIT } from '../../supabase/functions/_shared/indexation-core';
import { HUB_HTML, TATUAPE_HTML, bin, certError, fakeWeb, gz, html, ok as page, rdmFallback, rdmRoutes, redirect, sitemapIndex, status, text, urlset, xml, type Route } from './helpers/indexation-fixtures';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const P_RDM = '00000000-0000-4000-8000-0000000000b1';
const P_EN = '00000000-0000-4000-8000-0000000000b2';
const P_ML = '00000000-0000-4000-8000-0000000000b3';
const P_OTHER = '00000000-0000-4000-8000-0000000000b9';
const P_NODOMAIN = '00000000-0000-4000-8000-0000000000b8';
const USER = '00000000-0000-4000-8000-0000000000c1';
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const H = 'https://rdmadvogados.com.br';
const EN = 'https://acme-tools.com';

const projects = (): Row[] => [
  { id: P_RDM, name: 'RDM Advogados', domain: 'rdmadvogados.com.br', wordpress_url: null, organization_id: ORG },
  { id: P_EN, name: 'Acme Tools (EN)', domain: 'acme-tools.com', wordpress_url: null, organization_id: ORG },
  { id: P_ML, name: 'Shop multilíngue', domain: 'shop.example.com', wordpress_url: null, organization_id: ORG },
  { id: P_NODOMAIN, name: 'Sem site', domain: null, wordpress_url: null, organization_id: ORG },
  { id: P_OTHER, name: 'De outra organização', domain: 'outra-org.com', wordpress_url: null, organization_id: OTHER },
];
const seed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: projects(), project_site_maps: [], articles: [], index_urls: [], index_status: [], index_submissions: [], index_hygiene: [], index_keys: [], indexnow_config: [], project_events: [],
  project_taxonomy_nodes: [], nexus_oauth_connections: [], ...over,
});
let seq = 0;
const urlRow = (project: string, url: string, over: Row = {}): Row => {
  const u = new URL(url);
  return {
    id: `00000000-0000-4000-8000-${String(700000 + ++seq).padStart(12, '0')}`, organization_id: project === P_OTHER ? OTHER : ORG, project_id: project, url, host: u.hostname, path: u.pathname + u.search, source: 'sitemap', lang: null,
    taxonomy_node_id: null, first_seen: '2026-11-01T00:00:00.000Z', last_seen: '2026-11-19T00:00:00.000Z', in_sitemap: true, in_search_console: false, gsc_impressions: 0, gsc_clicks: 0, article_id: null, lastmod: null,
    changed_at: '2026-11-01T00:00:00.000Z', http_status: null, canonical: null, robots_meta: null, x_robots: null, redirect_to: null, https_redirect: null, soft404_suspect: false, check_error: null, last_checked_at: null, ...over,
  };
};

interface Opts {
  role?: string | null; tables?: Record<string, Row[]>; routes?: Record<string, Route | string>; fallback?: (url: string, c?: never) => Route | string | undefined; project?: string; userId?: string;
  gsc?: Array<{ page: string; impressions: number; clicks: number }> | 'erro'; google?: GoogleLink | null | 'quebrada'; bingKey?: string | null; now?: number;
}
function setup(o: Opts = {}) {
  const tables = o.tables || seed();
  const web = fakeWeb(o.routes || {}, { fallback: o.fallback as never });
  const rpcs: Record<string, RpcHandler> = { indexation_gsc_pages: () => (o.gsc === 'erro' ? { data: null, error: { message: 'x' } } : { data: o.gsc ?? [], error: null }) };
  const fake = fakeAdmin(tables, rpcs);
  const roleByOrg = new Map<string, string>(o.role === null ? [[OTHER, 'owner']] : [[ORG, o.role || 'owner']]);
  const deps: IndexationDeps = {
    fetchFn: web.fetchFn, lookupA: web.deps.lookupA, now: () => o.now ?? NOW, sleep: web.deps.sleep,
    resolveGoogle: o.google === undefined ? undefined : async () => { if (o.google === 'quebrada') throw new Error('oauth_project_forbidden'); return o.google; },
    resolveBingKey: o.bingKey === undefined ? undefined : async () => o.bingKey ?? null,
  };
  const run = (action: string, body: Record<string, unknown> = {}) => handleIndexationAction(fake.admin, { action, body: { projectId: o.project || P_RDM, ...body }, userId: o.userId || USER, roleByOrg, deps });
  return { run, tables, web, deps };
}
const kinds = (t: Record<string, Row[]>) => t.project_events.map((e) => e.kind);

// ------------------------------------------------------------------------------------------------------------ inventário
describe('indexação: inventory_sync', () => {
  it('ações existentes', () => { expect(INDEXATION_ACTIONS).toEqual(['overview', 'list', 'plan', 'inventory_sync', 'check_urls', 'google_inspect', 'submit_indexnow', 'bing_submit', 'hygiene', 'indexnow_key_save']); });

  const rdmSitemaps = (): Record<string, Route | string> => ({
    ...rdmRoutes(),
    [`${H}/sitemap-index.xml`]: xml(sitemapIndex([`${H}/sitemap.xml`, `${H}/sitemap-pillar.xml`, `${H}/blog/post-sitemap1.xml.gz`, `${H}/blog/quebrado.xml`, 'https://sitedeterceiros.com/sitemap.xml'])),
    [`${H}/sitemap.xml`]: xml(urlset([[`${H}/`, '2026-02-01'], [`${H}/blog/`, '2026-02-01']])),
    [`${H}/sitemap-pillar.xml`]: xml(urlset([`${H}/advogado-criminalista/`, 'https://meudireitoinss.rdmadvogados.com.br/', 'https://sitedeterceiros.com/x/'])),
    [`${H}/blog/post-sitemap1.xml.gz`]: bin(gz(urlset([[`${H}/blog/post-a/`, '2026-11-11'], [`${H}/blog/post-b/`, '2026-11-11']]))),
    [`${H}/blog/quebrado.xml`]: status(500),
    [`${H}/blog/sitemap_index.xml`]: xml(sitemapIndex([`${H}/blog/post-sitemap1.xml.gz`])),
  });

  it('monta o inventário de sitemap índice + .gz + erro + Search Console + artigos + manual; normaliza; recusa terceiros e conta o que recusou', async () => {
    const tables = seed({ articles: [{ id: 'art-1', project_id: P_RDM, published_url: `${H}/blog/post-a/`, published_at: '2026-11-10T00:00:00Z', status: 'published' }, { id: 'art-2', project_id: P_RDM, published_url: null, status: 'draft' }] });
    const s = setup({
      tables, routes: rdmSitemaps(),
      gsc: [{ page: `${H}/links/?utm_source=ig&fbclid=x#topo`, impressions: 500, clicks: 12 }, { page: `${H}/advogado-criminalista/`, impressions: 2000, clicks: 50 }, { page: 'https://sitedeterceiros.com/x/', impressions: 9, clicks: 0 }],
    });
    const r = await s.run('inventory_sync', { urls: [`${H}/manual/`, 'ftp://nao-e-site/', 'https://sitedeterceiros.com/manual/'] });
    expect(r.status).toBe(200);
    const urls = tables.index_urls.map((x) => x.url as string).sort();
    expect(urls).toEqual([`${H}/`, `${H}/advogado-criminalista/`, `${H}/blog/`, `${H}/blog/post-a/`, `${H}/blog/post-b/`, `${H}/links/`, `${H}/manual/`, 'https://meudireitoinss.rdmadvogados.com.br/'].sort());
    expect(urls.some((u) => u.includes('sitedeterceiros') || u.includes('utm_') || u.includes('#'))).toBe(false);
    expect(r.body).toMatchObject({ urls_total: 8, new: 8, updated: 0 });
    expect(Number(r.body.rejected_foreign)).toBeGreaterThanOrEqual(4); // sitemap de terceiros, URL no pillar, GSC, manual
    expect(Number(r.body.rejected_invalid)).toBeGreaterThanOrEqual(1); // ftp://
    const byUrl = (u: string) => tables.index_urls.find((x) => x.url === u)!;
    expect(byUrl(`${H}/links/`)).toMatchObject({ in_sitemap: false, in_search_console: true, gsc_impressions: 500, gsc_clicks: 12, source: 'search_console', project_id: P_RDM, organization_id: ORG });
    expect(byUrl(`${H}/blog/post-a/`)).toMatchObject({ in_sitemap: true, lastmod: '2026-11-11', article_id: 'art-1' });
    expect(byUrl(`${H}/advogado-criminalista/`)).toMatchObject({ in_sitemap: true, in_search_console: true, gsc_impressions: 2000 });
    expect(byUrl(`${H}/manual/`)).toMatchObject({ source: 'manual', in_sitemap: false });
    expect(r.body.outside_sitemap).toBe(1); // só /links/ (aparece no Google e não está em sitemap); a URL manual não conta como "fora"
  });
  it('arquivo de sitemap com erro aparece no relatório e a leitura segue; um aviso diz que nenhum sitemap válido não foi o caso', async () => {
    const s = setup({ routes: rdmSitemaps() });
    const r = await s.run('inventory_sync');
    const files = r.body.sitemap_files as Array<{ url: string; kind: string; error: string | null }>;
    expect(files.find((f) => f.url.endsWith('/blog/quebrado.xml'))).toMatchObject({ kind: 'erro', error: 'http_500' });
    expect(files.find((f) => f.url.endsWith('post-sitemap1.xml.gz'))).toMatchObject({ kind: 'urls' });
    expect((r.body.warnings as string[]).join(' ')).not.toMatch(/Nenhum sitemap válido/);
  });
  it('visita educada: agente genérico sem e-mail, 1 requisição por segundo por host (espera registrada), robots.txt lido antes, nunca fora do projeto', async () => {
    const s = setup({ routes: rdmSitemaps() });
    await s.run('inventory_sync');
    expect(s.web.calls.length).toBeGreaterThan(5);
    for (const c of s.web.calls) { expect(c.ua).toBe('ZicaAI-Indexacao/1.0'); expect(c.ua).not.toContain('@'); expect(c.ua).not.toMatch(/http/i); }
    expect(s.web.calls.some((c) => c.url.includes('sitedeterceiros'))).toBe(false);
    expect(s.web.calls[0].url).toBe(`${H}/robots.txt`);
    expect(s.web.sleeps.length).toBeGreaterThan(3);
    expect(Math.min(...s.web.sleeps)).toBeGreaterThanOrEqual(1000);
  });
  it('grava eventos no barramento: inventário atualizado, URLs descobertas e problema "fora do sitemap"', async () => {
    const tables = seed();
    const s = setup({ tables, routes: rdmSitemaps(), gsc: [{ page: `${H}/links/`, impressions: 10, clicks: 1 }] });
    await s.run('inventory_sync');
    expect(kinds(tables)).toEqual(expect.arrayContaining(['indexacao.inventario_atualizado', 'indexacao.url_descoberta', 'indexacao.problema']));
    expect(tables.project_events.every((e) => e.module === 'indexacao' && e.project_id === P_RDM && e.organization_id === ORG)).toBe(true);
    expect(JSON.stringify(tables.project_events)).not.toMatch(/token|secret|apikey/i);
  });
  it('repetir não duplica, atualiza lastmod/changed_at e marca saída do sitemap só quando o host foi lido por inteiro', async () => {
    const tables = seed();
    const first = { [`${EN}/robots.txt`]: text('User-agent: *\nSitemap: https://acme-tools.com/sitemap.xml\n'), [`${EN}/sitemap.xml`]: xml(urlset([[`${EN}/a/`, '2026-11-01'], [`${EN}/b/`, '2026-11-01'], [`${EN}/c/`, '2026-11-01']])) };
    const a = setup({ tables, project: P_EN, routes: first });
    await a.run('inventory_sync');
    expect(tables.index_urls).toHaveLength(3);
    const changed0 = tables.index_urls.find((u) => u.url === `${EN}/a/`)!.changed_at;
    const second = { ...first, [`${EN}/sitemap.xml`]: xml(urlset([[`${EN}/a/`, '2026-11-15'], [`${EN}/b/`, '2026-11-01']])) };
    const b = setup({ tables, project: P_EN, routes: second, now: NOW + 86_400_000 });
    const r = await b.run('inventory_sync');
    expect(tables.index_urls).toHaveLength(3);
    expect(r.body).toMatchObject({ new: 0, removed_from_sitemap: 1 });
    expect(tables.index_urls.find((u) => u.url === `${EN}/c/`)).toMatchObject({ in_sitemap: false });
    const a2 = tables.index_urls.find((u) => u.url === `${EN}/a/`)!;
    expect(a2.lastmod).toBe('2026-11-15');
    expect(a2.changed_at).not.toBe(changed0);
    // se um arquivo do host falhar, NADA é marcado como removido (leitura incompleta)
    const broken = { ...first, [`${EN}/sitemap.xml`]: status(503) };
    const c = setup({ tables, project: P_EN, routes: broken, now: NOW + 2 * 86_400_000 });
    const rc = await c.run('inventory_sync');
    expect(rc.body.removed_from_sitemap).toBe(0);
    expect(tables.index_urls.find((u) => u.url === `${EN}/a/`)).toMatchObject({ in_sitemap: true });
  });
  it('site em inglês (.com) e multilíngue: idioma pela pasta e pelo subdomínio, sitemaps por pasta de idioma, sem supor .com.br', async () => {
    const tables = seed();
    const ML = 'https://shop.example.com';
    const routes = {
      [`${ML}/robots.txt`]: text('User-agent: *\nSitemap: https://shop.example.com/sitemap_index.xml\n'),
      [`${ML}/sitemap_index.xml`]: xml(sitemapIndex([`${ML}/en/sitemap.xml`, `${ML}/es/sitemap.xml`])),
      [`${ML}/en/sitemap.xml`]: xml(urlset([`${ML}/en/pricing/`, `${ML}/en/`])),
      [`${ML}/es/sitemap.xml`]: xml(urlset([`${ML}/es/precios/`, `${ML}/es/`])),
      'https://de.shop.example.com/robots.txt': text('User-agent: *\nSitemap: https://de.shop.example.com/sitemap.xml\n'),
      'https://de.shop.example.com/sitemap.xml': xml(urlset(['https://de.shop.example.com/preise/'])),
    };
    const s = setup({ tables, project: P_ML, routes, gsc: [{ page: 'https://de.shop.example.com/preise/', impressions: 5, clicks: 0 }] });
    const r = await s.run('inventory_sync');
    expect(r.status).toBe(200);
    const lang = (u: string) => tables.index_urls.find((x) => x.url === u)?.lang;
    expect(lang(`${ML}/en/pricing/`)).toBe('en');
    expect(lang(`${ML}/es/precios/`)).toBe('es');
    expect(lang('https://de.shop.example.com/preise/')).toBe('de');
    expect(tables.index_urls.every((u) => u.host === 'shop.example.com' || u.host === 'de.shop.example.com')).toBe(true);
    expect(r.body.hosts).toEqual(expect.arrayContaining(['shop.example.com', 'de.shop.example.com']));
  });
  it('site .co.jp: outro .co.jp é terceiro e é recusado (o sufixo nunca vale como domínio)', async () => {
    const tables = seed({ projects: [...projects(), { id: P_NODOMAIN.replace('b8', 'b7'), name: 'JP', domain: 'www.example.co.jp', wordpress_url: null, organization_id: ORG }] });
    const JP = 'https://www.example.co.jp';
    const s = setup({ tables, project: P_NODOMAIN.replace('b8', 'b7'), routes: { [`${JP}/robots.txt`]: text('Sitemap: https://www.example.co.jp/sitemap.xml'), [`${JP}/sitemap.xml`]: xml(urlset([`${JP}/ja/`, 'https://evil.co.jp/x/'])) } });
    const r = await s.run('inventory_sync');
    expect(r.status).toBe(200);
    expect(tables.index_urls.map((u) => u.url)).toEqual([`${JP}/ja/`]);
    expect(Number(r.body.rejected_foreign)).toBeGreaterThanOrEqual(1);
  });
  it('papéis: leitor não atualiza; editor atualiza; de outra organização é recusado; projeto sem domínio é recusado com mensagem', async () => {
    expect((await setup({ role: 'viewer' }).run('inventory_sync')).body.error).toBe('role_not_allowed');
    expect((await setup({ role: null }).run('inventory_sync')).body.error).toBe('organization_membership_required');
    const nd = await setup({ project: P_NODOMAIN }).run('inventory_sync');
    expect(nd.status).toBe(422);
    expect(nd.body).toMatchObject({ error: 'project_domain_required' });
    expect(String(nd.body.message)).toMatch(/domínio/);
    expect((await setup({ project: 'nao-e-uuid' }).run('inventory_sync')).status).toBe(422);
    expect((await setup({ role: 'editor', routes: rdmSitemaps() }).run('inventory_sync')).status).toBe(200);
  });
  it('isolamento entre organizações: projeto de outra organização não é alcançado e não vaza linhas', async () => {
    const tables = seed({ index_urls: [urlRow(P_OTHER, 'https://outra-org.com/segredo/'), urlRow(P_RDM, `${H}/a/`)] });
    const r = await setup({ tables, project: P_OTHER }).run('overview');
    expect(r.status).toBe(403);
    const mine = await setup({ tables }).run('list');
    expect((mine.body.rows as Array<{ url: string }>).map((x) => x.url)).toEqual([`${H}/a/`]);
  });
});

// ------------------------------------------------------------------------------------------------------------ verificação das URLs
describe('indexação: check_urls', () => {
  const rows = (): Row[] => [
    urlRow(P_RDM, `${H}/advogado-criminalista/`), urlRow(P_RDM, `${H}/advogado-criminalista/zona-norte/`), urlRow(P_RDM, `${H}/advogado-criminalista/tatuape/`), urlRow(P_RDM, `${H}/direito-criminal/xyz/`),
    urlRow(P_RDM, `${H}/links/`, { in_sitemap: false, in_search_console: true }), urlRow(P_RDM, `${H}/privado/x/`),
  ];
  it('soft-404 real da RDM: /advogado-criminalista/zona-norte (200 com o hub) é marcado; o hub, a página própria e o 404 de verdade não', async () => {
    const tables = seed({ index_urls: rows() });
    const s = setup({ tables, routes: rdmRoutes(), fallback: rdmFallback as never });
    const r = await s.run('check_urls', { limit: 10 });
    expect(r.status).toBe(200);
    const get = (u: string) => tables.index_urls.find((x) => x.url === u)!;
    expect(get(`${H}/advogado-criminalista/zona-norte/`)).toMatchObject({ http_status: 200, soft404_suspect: true });
    expect(get(`${H}/advogado-criminalista/`)).toMatchObject({ http_status: 200, soft404_suspect: false });
    expect(get(`${H}/advogado-criminalista/tatuape/`)).toMatchObject({ http_status: 200, soft404_suspect: false, canonical: `${H}/advogado-criminalista/tatuape/` });
    expect(get(`${H}/direito-criminal/xyz/`)).toMatchObject({ http_status: 404, soft404_suspect: false });
    expect(get(`${H}/links/`)).toMatchObject({ http_status: 200, last_checked_at: expect.any(String) });
    expect((r.body.problems as Record<string, { count: number }>).soft404.count).toBe(1);
    expect((r.body.problems as Record<string, { count: number }>).erro_http.count).toBe(1);
    expect(kinds(tables)).toEqual(expect.arrayContaining(['indexacao.verificadas', 'indexacao.problema']));
  });
  it('respeita o robots.txt: URL bloqueada não é visitada e fica com o motivo', async () => {
    const tables = seed({ index_urls: rows() });
    const s = setup({ tables, routes: rdmRoutes(), fallback: rdmFallback as never });
    await s.run('check_urls', { limit: 10 });
    expect(tables.index_urls.find((u) => u.url === `${H}/privado/x/`)).toMatchObject({ http_status: null, check_error: 'bloqueada_pelo_robots' });
    expect(s.web.calls.some((c) => c.url === `${H}/privado/x/`)).toBe(false);
  });
  it('não segue mais de 3 redirecionamentos e não visita terceiros: guarda o destino e o status da primeira resposta', async () => {
    const tables = seed({ index_urls: [urlRow(P_RDM, `${H}/r1/`), urlRow(P_RDM, `${H}/vai-para-fora/`), urlRow(P_RDM, `${H}/uma-volta/`)] });
    const routes = {
      ...rdmRoutes(),
      [`${H}/r1/`]: redirect(`${H}/r2/`), [`${H}/r2/`]: redirect(`${H}/r3/`), [`${H}/r3/`]: redirect(`${H}/r4/`), [`${H}/r4/`]: redirect(`${H}/r5/`), [`${H}/r5/`]: page(html({ title: 'fim' })),
      [`${H}/vai-para-fora/`]: redirect('https://externo.example.org/pagina/'), [`${H}/uma-volta/`]: redirect(`${H}/links/`),
    };
    const s = setup({ tables, routes });
    await s.run('check_urls', { limit: 10 });
    const get = (u: string) => tables.index_urls.find((x) => x.url === u)!;
    expect(get(`${H}/r1/`)).toMatchObject({ http_status: 301, redirect_to: `${H}/r5/` });
    expect(s.web.calls.filter((c) => /\/r[1-5]\/$/.test(c.url)).length).toBeLessThanOrEqual(4);
    expect(s.web.calls.some((c) => c.url.includes('externo.example.org'))).toBe(false);
    expect(get(`${H}/vai-para-fora/`)).toMatchObject({ http_status: 301, redirect_to: 'https://externo.example.org/pagina/' });
    expect(get(`${H}/uma-volta/`)).toMatchObject({ http_status: 301, redirect_to: `${H}/links/` });
  });
  it('noindex por meta e por cabeçalho, canonical divergente e http sem redirecionamento para https (probeHttp)', async () => {
    const tables = seed({ index_urls: [urlRow(P_RDM, `${H}/n1/`), urlRow(P_RDM, `${H}/n2/`), urlRow(P_RDM, `${H}/c1/`), urlRow(P_RDM, `${H}/advogado-criminalista/tatuape/`)] });
    const routes = {
      ...rdmRoutes(),
      [`${H}/n1/`]: page(html({ title: 'n1', canonical: `${H}/n1/`, robots: 'noindex, follow', body: 'um' })),
      [`${H}/n2/`]: page(html({ title: 'n2', canonical: `${H}/n2/`, body: 'dois' }), 'text/html', { 'x-robots-tag': 'noindex' }),
      [`${H}/c1/`]: page(html({ title: 'c1', canonical: `${H}/outra-pagina/`, body: 'tres' })),
      [`http://rdmadvogados.com.br/advogado-criminalista/tatuape/`]: page(TATUAPE_HTML),
      'http://rdmadvogados.com.br/n1/': redirect(`${H}/n1/`), 'http://rdmadvogados.com.br/n2/': redirect(`${H}/n2/`), 'http://rdmadvogados.com.br/c1/': redirect(`${H}/c1/`),
    };
    const s = setup({ tables, routes });
    const r = await s.run('check_urls', { limit: 10, probeHttp: true });
    const p = r.body.problems as Record<string, { count: number }>;
    expect(p.noindex.count).toBe(2);
    expect(p.canonical_diferente.count).toBe(1);
    expect(p.http_sem_redirecionamento.count).toBe(1);
    expect(tables.index_urls.find((u) => u.url === `${H}/advogado-criminalista/tatuape/`)!.https_redirect).toBe(false);
  });
  it('fatia: limite 100, ids inválidos recusados, inventário vazio explica; leitor não verifica', async () => {
    expect((await setup({ tables: seed() }).run('check_urls')).body.error).toBe('inventory_empty');
    expect((await setup({ tables: seed({ index_urls: rows() }) }).run('check_urls', { urlIds: ['x'] })).body.error).toBe('ids_invalid');
    expect((await setup({ tables: seed({ index_urls: rows() }), role: 'viewer' }).run('check_urls')).body.error).toBe('role_not_allowed');
  });
});

// ------------------------------------------------------------------------------------------------------------ Google (somente leitura)
describe('indexação: google_inspect', () => {
  const invRows = (): Row[] => [
    urlRow(P_EN, `${EN}/indexada/`, { gsc_impressions: 900 }), urlRow(P_EN, `${EN}/fora/`, { gsc_impressions: 100 }), urlRow(P_EN, 'https://blog.acme-tools.com/x/', { gsc_impressions: 50 }), urlRow(P_EN, `${EN}/en/nova/`, { gsc_impressions: 10 }),
  ];
  const inspectRoute = (c: { body?: string }): Response => {
    const u = JSON.parse(c.body || '{}').inspectionUrl as string;
    const idx = u.includes('indexada');
    return new Response(JSON.stringify({ inspectionResult: { indexStatusResult: { verdict: idx ? 'PASS' : 'NEUTRAL', coverageState: idx ? 'Submitted and indexed' : 'Crawled - currently not indexed', lastCrawlTime: '2026-11-15T10:00:00Z' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

  it('sem conexão com o Google: responde "sem conexão", não consulta nada e não finge', async () => {
    const s = setup({ tables: seed({ index_urls: invRows() }), project: P_EN, google: null });
    const r = await s.run('google_inspect');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ connected: false, checked: 0 });
    expect(String(r.body.message)).toMatch(/não está conectado/);
    expect(s.web.calls).toHaveLength(0);
    const none = await setup({ tables: seed({ index_urls: invRows() }), project: P_EN }).run('google_inspect');
    expect(none.body).toMatchObject({ connected: false });
  });
  it('conexão quebrada vira erro claro; propriedade não escolhida pede a escolha', async () => {
    expect((await setup({ tables: seed({ index_urls: invRows() }), project: P_EN, google: 'quebrada' }).run('google_inspect')).body.error).toBe('google_connection_unusable');
    expect((await setup({ tables: seed({ index_urls: invRows() }), project: P_EN, google: { secret: 'oauth-access:TESTE', property: null } }).run('google_inspect')).body.error).toBe('google_property_required');
  });
  it('consulta o estado por propriedade de domínio, em ordem de prioridade; guarda estado e detalhe; URL de fora da propriedade vira "fora_do_escopo" sem chamada; idioma das mensagens vai na chamada', async () => {
    const tables = seed({ index_urls: invRows() });
    const s = setup({ tables, project: P_EN, google: { secret: 'oauth-access:TESTE', property: 'https://acme-tools.com/en/' }, routes: { [INSPECT]: inspectRoute } });
    const r = await s.run('google_inspect', { languageCode: 'es-419' });
    expect(r.body).toMatchObject({ connected: true, property: 'https://acme-tools.com/en/', checked: 4, indexed: 0, not_indexed: 1, outside_scope: 3 });
    const st = (id: string) => tables.index_status.find((x) => x.url_id === id)!;
    const id = (u: string) => tables.index_urls.find((x) => x.url === u)!.id as string;
    expect(st(id(`${EN}/en/nova/`))).toMatchObject({ engine: 'google', state: 'nao_indexada', project_id: P_EN, detail: expect.objectContaining({ coverage_state: 'Crawled - currently not indexed' }) });
    expect(st(id(`${EN}/indexada/`)).state).toBe('fora_do_escopo');
    const calls = s.web.calls.filter((c) => c.url === INSPECT);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body!)).toMatchObject({ inspectionUrl: `${EN}/en/nova/`, siteUrl: 'https://acme-tools.com/en/', languageCode: 'es-419' });
    // a chave/token nunca vai a evento, resposta ou tabela de status
    expect(JSON.stringify([r.body, tables.project_events, tables.index_status, tables.index_submissions])).not.toContain('TESTE');
    expect(JSON.stringify(r.body)).toMatch(/Somente leitura/);
  });
  it('propriedade de domínio (sc-domain) cobre subdomínios; PASS = indexada; consulta registrada para a cota', async () => {
    const tables = seed({ index_urls: invRows() });
    const s = setup({ tables, project: P_EN, google: { secret: 'oauth-access:TESTE', property: 'sc-domain:acme-tools.com' }, routes: { [INSPECT]: inspectRoute } });
    const r = await s.run('google_inspect');
    expect(r.body).toMatchObject({ checked: 4, indexed: 1, not_indexed: 3, outside_scope: 0 });
    expect(tables.index_submissions).toHaveLength(1);
    expect(tables.index_submissions[0]).toMatchObject({ engine: 'google', urls_count: 4, status: 'aceita' });
    expect((r.body.quota as { used_24h: number; verified: boolean }).used_24h).toBe(4);
    expect((r.body.quota as { verified: boolean }).verified).toBe(false);
    expect(kinds(tables)).toContain('indexacao.google_consultado');
    // quem já foi consultado há menos de 7 dias não é consultado de novo pelo plano automático
    const again = await setup({ tables, project: P_EN, google: { secret: 'oauth-access:TESTE', property: 'sc-domain:acme-tools.com' }, routes: { [INSPECT]: inspectRoute } }).run('google_inspect');
    expect(again.body.checked).toBe(0);
  });
  it('cota diária: com 2.000 consultas nas últimas 24 h recusa (429) sem chamar o Google', async () => {
    const tables = seed({ index_urls: invRows(), index_submissions: [{ id: 's1', project_id: P_EN, organization_id: ORG, engine: 'google', urls_count: GOOGLE_INSPECT_DAILY_LIMIT, status: 'aceita', created_at: new Date(NOW - 3600_000).toISOString() }] });
    const s = setup({ tables, project: P_EN, google: { secret: 'oauth-access:TESTE', property: 'sc-domain:acme-tools.com' }, routes: { [INSPECT]: inspectRoute } });
    const r = await s.run('google_inspect');
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: 'google_quota_reached', limit: 2000 });
    expect(s.web.calls).toHaveLength(0);
  });
  it('credencial recusada pelo Google (403) para a execução e avisa para reconectar; 429 do Google avisa cota', async () => {
    const forbid = setup({ tables: seed({ index_urls: invRows() }), project: P_EN, google: { secret: 'oauth-access:TESTE', property: 'sc-domain:acme-tools.com' }, routes: { [INSPECT]: new Response('{"error":{"message":"no"}}', { status: 403 }) } });
    const r = await forbid.run('google_inspect');
    expect(r.body.stopped).toBe('gsc_forbidden');
    expect(String(r.body.message)).toMatch(/Reconecte/);
    const quota = setup({ tables: seed({ index_urls: invRows() }), project: P_EN, google: { secret: 'oauth-access:TESTE', property: 'sc-domain:acme-tools.com' }, routes: { [INSPECT]: new Response('{}', { status: 429 }) } });
    expect((await quota.run('google_inspect')).body.stopped).toBe('gsc_quota');
  });
  it('leitor não consulta; não existe ação para "pedir indexação ao Google"', async () => {
    expect((await setup({ role: 'viewer', project: P_EN, google: null }).run('google_inspect')).body.error).toBe('role_not_allowed');
    expect(INDEXATION_ACTIONS.some((a) => /request_indexing|solicitar|publish_url/i.test(a))).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------------------ IndexNow
describe('indexação: submit_indexnow', () => {
  const KEY = 'k3y-acme-0123456789';
  const NOWAPI = 'https://api.indexnow.org/indexnow';
  const keyRow = (): Row => ({ id: 'k1', organization_id: ORG, project_id: P_EN, host: 'acme-tools.com', key_value: KEY, key_location: null });
  const pages = (n: number, over: Row = {}): Row[] => Array.from({ length: n }, (_, i) => urlRow(P_EN, `${EN}/p/${i}/`, { http_status: 200, canonical: `${EN}/p/${i}/`, ...over }));
  const apiOk = new Response('', { status: 200 });

  it('sem chave cadastrada: não envia e explica como criar e publicar o arquivo da chave', async () => {
    const s = setup({ tables: seed({ index_urls: pages(3) }), project: P_EN, routes: { [NOWAPI]: apiOk } });
    const r = await s.run('submit_indexnow');
    expect(r.body.sent).toBe(0);
    expect((r.body.hosts as Array<Record<string, unknown>>)[0]).toMatchObject({ host: 'acme-tools.com', reason: 'sem_chave', pending: 3 });
    expect(String((r.body.hosts as Array<{ how_to: string }>)[0].how_to)).toMatch(/\/<chave>\.txt/);
    expect(s.web.calls.some((c) => c.url === NOWAPI)).toBe(false);
  });
  it('chave cadastrada mas arquivo ausente (404) ou que devolve HTML: NÃO envia e explica como publicar (WordPress e site estático)', async () => {
    for (const fileRoute of [undefined, page('<html><body>home qualquer</body></html>')]) {
      const routes: Record<string, Route | string> = { [NOWAPI]: apiOk };
      if (fileRoute) routes[`${EN}/${KEY}.txt`] = fileRoute;
      const s = setup({ tables: seed({ index_urls: pages(3), index_keys: [keyRow()] }), project: P_EN, routes });
      const r = await s.run('submit_indexnow');
      expect(r.body.sent).toBe(0);
      const h = (r.body.hosts as Array<Record<string, unknown>>)[0];
      expect(h).toMatchObject({ reason: 'arquivo_da_chave_ausente' });
      expect(String(h.how_to)).toMatch(/WordPress/);
      expect(s.web.calls.some((c) => c.url === NOWAPI)).toBe(false);
    }
  });
  it('arquivo no ar: envia { host, key, keyLocation, urlList }, registra o envio, marca "enviada" (não "indexada") e grava o evento', async () => {
    const tables = seed({ index_urls: [...pages(3), urlRow(P_EN, `${EN}/ruim/`, { http_status: 404 }), urlRow(P_EN, `${EN}/noindex/`, { http_status: 200, robots_meta: 'noindex' })], index_keys: [keyRow()] });
    const s = setup({ tables, project: P_EN, routes: { [`${EN}/${KEY}.txt`]: text(`${KEY}\n`), [NOWAPI]: apiOk } });
    const r = await s.run('submit_indexnow');
    expect(r.body).toMatchObject({ sent: 3, skipped_problem: 2 });
    const post = s.web.calls.filter((c) => c.url === NOWAPI);
    expect(post).toHaveLength(1);
    const body = JSON.parse(post[0].body!);
    expect(body).toMatchObject({ host: 'acme-tools.com', key: KEY, keyLocation: `${EN}/${KEY}.txt` });
    expect(body.urlList).toEqual([`${EN}/p/0/`, `${EN}/p/1/`, `${EN}/p/2/`]);
    expect(tables.index_submissions[0]).toMatchObject({ engine: 'indexnow', host: 'acme-tools.com', urls_count: 3, status: 'aceita' });
    expect(tables.index_status.filter((x) => x.engine === 'indexnow' && x.state === 'enviada')).toHaveLength(3);
    expect(tables.index_status.some((x) => x.state === 'indexada')).toBe(false);
    expect(kinds(tables)).toContain('indexacao.enviada');
    expect(JSON.stringify([r.body, tables.project_events])).not.toContain(KEY);
    expect(String(r.body.notice)).toMatch(/NÃO avisa o Google/);
  });
  it('lote: 10.001 URLs viram 2 envios (10.000 + 1)', async () => {
    const tables = seed({ index_urls: pages(10_001), index_keys: [keyRow()] });
    const s = setup({ tables, project: P_EN, routes: { [`${EN}/${KEY}.txt`]: text(KEY), [NOWAPI]: apiOk } });
    const r = await s.run('submit_indexnow');
    expect(r.body.sent).toBe(10_001);
    const sizes = s.web.calls.filter((c) => c.url === NOWAPI).map((c) => JSON.parse(c.body!).urlList.length);
    expect(sizes).toEqual([10_000, 1]);
    expect(tables.index_submissions.map((x) => x.urls_count)).toEqual([10_000, 1]);
  }, 60_000);
  it('não reenvia a mesma URL sem mudança; reenvia a que mudou depois do envio', async () => {
    const tables = seed({ index_urls: pages(3), index_keys: [keyRow()] });
    const routes = { [`${EN}/${KEY}.txt`]: text(KEY), [NOWAPI]: apiOk };
    await setup({ tables, project: P_EN, routes }).run('submit_indexnow');
    const again = setup({ tables, project: P_EN, routes });
    const r2 = await again.run('submit_indexnow');
    expect(r2.body).toMatchObject({ sent: 0, skipped_unchanged: 3 });
    expect(again.web.calls.some((c) => c.url === NOWAPI)).toBe(false);
    tables.index_urls[1].changed_at = new Date(NOW + 3600_000).toISOString();
    const third = setup({ tables, project: P_EN, routes, now: NOW + 7200_000 });
    const r3 = await third.run('submit_indexnow');
    expect(r3.body.sent).toBe(1);
    expect(JSON.parse(third.web.calls.find((c) => c.url === NOWAPI)!.body!).urlList).toEqual([`${EN}/p/1/`]);
  });
  it('IndexNow recusa (429): registra "recusada", não marca nada como enviado e devolve a mensagem', async () => {
    const tables = seed({ index_urls: pages(2), index_keys: [keyRow()] });
    const s = setup({ tables, project: P_EN, routes: { [`${EN}/${KEY}.txt`]: text(KEY), [NOWAPI]: new Response('', { status: 429 }) } });
    const r = await s.run('submit_indexnow');
    expect(r.body.sent).toBe(0);
    expect(tables.index_submissions[0]).toMatchObject({ status: 'recusada' });
    expect(tables.index_status).toHaveLength(0);
    expect(String((r.body.hosts as Array<{ message: string }>)[0].message)).toMatch(/ritmo/);
  });
  it('subdomínio precisa da própria chave; configuração antiga (indexnow_config) só vale para host do projeto', async () => {
    const SUB = 'https://blog.acme-tools.com';
    const tables = seed({
      index_urls: [...pages(2), urlRow(P_EN, `${SUB}/post/`, { http_status: 200, canonical: `${SUB}/post/` })], index_keys: [keyRow()],
      indexnow_config: [{ host: 'blog.acme-tools.com', api_key: 'legacy-key-0123456789', key_location: `${SUB}/legacy-key-0123456789.txt`, active: true }, { host: 'outro-dominio.com', api_key: 'alheia-key-0123456789', key_location: 'https://outro-dominio.com/alheia-key-0123456789.txt', active: true }],
    });
    const s = setup({ tables, project: P_EN, routes: { [`${EN}/${KEY}.txt`]: text(KEY), [`${SUB}/legacy-key-0123456789.txt`]: text('legacy-key-0123456789'), [NOWAPI]: apiOk } });
    const r = await s.run('submit_indexnow');
    const posts = s.web.calls.filter((c) => c.url === NOWAPI).map((c) => JSON.parse(c.body!));
    expect(posts.map((p) => p.host).sort()).toEqual(['acme-tools.com', 'blog.acme-tools.com']);
    expect(posts.find((p) => p.host === 'blog.acme-tools.com')).toMatchObject({ key: 'legacy-key-0123456789' });
    expect(r.body.sent).toBe(3);
  });
  it('cadastro da chave: só administrador; confere o arquivo no ar antes de guardar; "gerar" devolve a chave e o caminho sem guardar', async () => {
    const tables = seed({ index_urls: pages(1) });
    expect((await setup({ tables, project: P_EN, role: 'editor' }).run('indexnow_key_save', { host: 'acme-tools.com', key: KEY })).body.error).toBe('role_not_allowed');
    const gen = await setup({ tables, project: P_EN, role: 'admin' }).run('indexnow_key_save', { host: 'acme-tools.com', generate: true });
    expect(gen.body).toMatchObject({ saved: false, host: 'acme-tools.com' });
    expect(String(gen.body.key)).toMatch(/^[0-9a-f]{32}$/);
    expect(gen.body.file_url).toBe(`${EN}/${gen.body.key}.txt`);
    expect(tables.index_keys).toHaveLength(0);
    expect((await setup({ tables, project: P_EN, role: 'admin' }).run('indexnow_key_save', { host: 'terceiro.com', key: KEY })).body.error).toBe('host_not_in_project');
    expect((await setup({ tables, project: P_EN, role: 'admin' }).run('indexnow_key_save', { host: 'acme-tools.com', key: 'curta' })).body.error).toBe('key_invalid');
    expect((await setup({ tables, project: P_EN, role: 'admin' }).run('indexnow_key_save', { host: 'acme-tools.com', key: KEY })).body.error).toBe('key_file_not_found');
    const good = setup({ tables, project: P_EN, role: 'admin', routes: { [`${EN}/${KEY}.txt`]: text(KEY) } });
    expect((await good.run('indexnow_key_save', { host: 'acme-tools.com', key: KEY })).body).toMatchObject({ saved: true });
    expect(tables.index_keys[0]).toMatchObject({ host: 'acme-tools.com', key_value: KEY, project_id: P_EN, created_by: USER });
    expect(kinds(tables)).toContain('indexacao.chave_indexnow');
    expect(JSON.stringify(tables.project_events)).not.toContain(KEY);
  });
});

// ------------------------------------------------------------------------------------------------------------ Bing
describe('indexação: bing_submit', () => {
  const BKEY = 'BING-CHAVE-DE-TESTE';
  const bing = (daily: number | null, sites = [{ Url: `${EN}/`, IsVerified: true }]) => (url: string): Route | undefined => {
    if (url.includes('/GetUserSites')) return new Response(JSON.stringify({ d: sites }), { status: 200 });
    if (url.includes('/GetUrlSubmissionQuota')) return new Response(JSON.stringify({ d: daily === null ? {} : { DailyQuota: daily, MonthlyQuota: 1300 } }), { status: 200 });
    if (url.includes('/SubmitUrlBatch')) return new Response(JSON.stringify({ d: null }), { status: 200 });
    return undefined;
  };
  const pages = (n: number): Row[] => Array.from({ length: n }, (_, i) => urlRow(P_EN, `${EN}/b/${i}/`, { http_status: 200, canonical: `${EN}/b/${i}/` }));
  it('sem chave de API do Bing: responde "sem conexão" e não envia nada', async () => {
    const s = setup({ tables: seed({ index_urls: pages(3) }), project: P_EN, bingKey: null });
    const r = await s.run('bing_submit');
    expect(r.body).toMatchObject({ connected: false, sent: 0 });
    expect(String(r.body.message)).toMatch(/não está conectado/);
    expect(s.web.calls).toHaveLength(0);
    expect((await setup({ tables: seed({ index_urls: pages(3) }), project: P_EN }).run('bing_submit')).body.connected).toBe(false);
  });
  it('lê a cota pela API e envia só o que cabe (lotes de até 500); a chave nunca aparece na resposta, no histórico nem nos eventos', async () => {
    const tables = seed({ index_urls: pages(150) });
    const s = setup({ tables, project: P_EN, bingKey: BKEY, fallback: bing(100) as never });
    const r = await s.run('bing_submit');
    expect(r.body).toMatchObject({ connected: true, sent: 100 });
    const host = (r.body.hosts as Array<Record<string, unknown>>)[0];
    expect(host).toMatchObject({ sent: 100, pending: 50, quota: { daily: 100, monthly: 1300 }, quota_read: true });
    const submit = s.web.calls.filter((c) => c.url.includes('/SubmitUrlBatch'));
    expect(submit).toHaveLength(1);
    expect(JSON.parse(submit[0].body!)).toMatchObject({ siteUrl: `${EN}/` });
    expect(JSON.parse(submit[0].body!).urlList).toHaveLength(100);
    expect(tables.index_submissions[0]).toMatchObject({ engine: 'bing', urls_count: 100, status: 'aceita' });
    expect(tables.index_status.filter((x) => x.engine === 'bing')).toHaveLength(100);
    expect(JSON.stringify([r.body, tables.index_submissions, tables.project_events, tables.index_status])).not.toContain(BKEY);
    // depois de enviar, a mesma URL sem mudança não vai de novo
    const again = await setup({ tables, project: P_EN, bingKey: BKEY, fallback: bing(100) as never }).run('bing_submit');
    expect(again.body.sent).toBe(50);
  });
  it('cota diária zerada, site não verificado no Bing e cota ilegível (usa 1 lote de 500)', async () => {
    const zero = await setup({ tables: seed({ index_urls: pages(5) }), project: P_EN, bingKey: BKEY, fallback: bing(0) as never }).run('bing_submit');
    expect((zero.body.hosts as Array<{ reason: string }>)[0].reason).toBe('cota_diaria_zerada');
    const nov = await setup({ tables: seed({ index_urls: pages(5) }), project: P_EN, bingKey: BKEY, fallback: bing(100, [{ Url: `${EN}/`, IsVerified: false }]) as never }).run('bing_submit');
    expect((nov.body.hosts as Array<{ reason: string }>)[0].reason).toBe('bing_site_not_found');
    const unk = setup({ tables: seed({ index_urls: pages(600) }), project: P_EN, bingKey: BKEY, fallback: bing(null) as never });
    const ru = await unk.run('bing_submit');
    expect(ru.body.sent).toBe(500);
    expect((ru.body.hosts as Array<{ quota: unknown }>)[0].quota).toEqual({ daily: null, monthly: null });
  });
  it('leitor não envia', async () => { expect((await setup({ role: 'viewer', project: P_EN, bingKey: BKEY }).run('bing_submit')).body.error).toBe('role_not_allowed'); });
});

// ------------------------------------------------------------------------------------------------------------ higiene
describe('indexação: hygiene (rede gravada)', () => {
  const rdmWorld = (): Record<string, Route | string> => ({
    ...rdmRoutes(),
    [`${H}/sitemap-index.xml`]: xml(sitemapIndex([`${H}/sitemap.xml`, `${H}/blog/post-sitemap1.xml`, `${H}/blog/post-sitemap2.xml`])),
    [`${H}/blog/sitemap_index.xml`]: xml(sitemapIndex([`${H}/blog/post-sitemap1.xml`, `${H}/blog/post-sitemap2.xml`, `${H}/blog/post-sitemap3.xml`])),
    [`${H}/sitemap.xml`]: xml(urlset([[`${H}/`, '2026-02-01'], [`${H}/blog/`, '2026-02-01']])),
    [`${H}/blog/post-sitemap1.xml`]: xml(urlset([[`${H}/blog/a/`, '2026-11-11'], [`${H}/blog/b/`, '2026-11-11'], [`${H}/blog/c/`, '2026-11-11'], [`${H}/blog/d/`, '2026-11-11'], [`${H}/blog/e/`, '2026-11-11']])),
    [`${H}/blog/post-sitemap2.xml`]: xml(urlset([[`${H}/blog/f/`, '2026-11-12'], [`${H}/blog/g/`, '2026-11-12'], [`${H}/blog/h/`, '2026-11-12'], [`${H}/blog/i/`, '2026-11-12'], [`${H}/blog/j/`, '2026-11-12']])),
    [`${H}/blog/post-sitemap3.xml`]: xml(urlset([[`${H}/blog/a/`, '2026-11-13'], [`${H}/blog/b/`, '2026-11-13'], [`${H}/blog/c/`, '2026-11-13'], [`${H}/blog/n/`, '2026-11-14'], [`${H}/blog/o/`, '2026-11-14']])), // repete a, b, c do sitemap1 (duplicatas entre arquivos)
    [`http://rdmadvogados.com.br/`]: redirect(`${H}/`),
    [`http://rdmadvogados.com.br/advogado-criminalista/`]: page(HUB_HTML),
    'https://seumodelopeticao.rdmadvogados.com.br/robots.txt': certError(), 'https://seumodelopeticao.rdmadvogados.com.br/llms.txt': certError(), 'https://seumodelopeticao.rdmadvogados.com.br/': certError(),
  });
  const rdmInv = (): Row[] => [
    urlRow(P_RDM, `${H}/advogado-criminalista/`, { gsc_impressions: 100, http_status: 200 }), urlRow(P_RDM, `${H}/links/`, { in_sitemap: false, in_search_console: true, http_status: 200, canonical: `${H}/links/` }),
    urlRow(P_RDM, `${H}/advogado-criminalista/zona-norte/`, { soft404_suspect: true, http_status: 200, canonical: `${H}/advogado-criminalista/` }), urlRow(P_RDM, 'https://seumodelopeticao.rdmadvogados.com.br/', { http_status: null }),
    ...Array.from({ length: 60 }, (_, i) => urlRow(P_RDM, `${H}/blog/enchimento-${i}/`, { http_status: 200, canonical: `${H}/blog/enchimento-${i}/` })),
  ];
  it('reproduz os achados da RDM ao vivo (gravado): índice atrasado, http sem redirecionar em /advogado-criminalista/, certificado inválido, /links/ fora do sitemap, soft-404, sitemap curto, llms.txt ausente', async () => {
    const tables = seed({ index_urls: rdmInv() });
    const s = setup({ tables, routes: rdmWorld(), fallback: rdmFallback as never });
    const r = await s.run('hygiene');
    expect(r.status).toBe(200);
    const items = r.body.items as Array<{ key: string; ok: boolean; applicable: boolean; severity: string; detail: string; fix: string | null }>;
    const bad = items.filter((i) => !i.ok && i.applicable).map((i) => i.key);
    expect(bad).toEqual(expect.arrayContaining(['sitemap_indice_completo', 'https_forcado', 'https_certificado', 'fora_do_sitemap', 'soft404', 'sitemap_principal_curto', 'sitemap_lastmod_real', 'sitemap_sem_duplicidade']));
    expect(items.find((i) => i.key === 'sitemap_indice_completo')!.detail).toMatch(/post-sitemap3/);
    expect(items.find((i) => i.key === 'https_certificado')!.detail).toMatch(/seumodelopeticao/);
    expect(items.find((i) => i.key === 'https_forcado')!.detail).toMatch(/advogado-criminalista/);
    expect(items.find((i) => i.key === 'llms_txt')!.ok).toBe(false);
    expect(items.find((i) => i.key === 'llms_txt')!.severity).toBe('info');
    expect(items.find((i) => i.key === 'robots_declara_sitemap')!.ok).toBe(true);
    // ordenado: o que falhou primeiro, alta antes de média
    const firstOk = items.findIndex((i) => i.ok || !i.applicable);
    expect(items.slice(0, firstOk).every((i) => !i.ok)).toBe(true);
    expect(items[0].severity).toBe('alta');
    // persistido e com evento; segunda rodada não diz que algo é "novo"
    expect(tables.index_hygiene.length).toBe(items.length);
    expect(tables.index_hygiene.find((h) => h.check_key === 'https_certificado')).toMatchObject({ ok: false, severity: 'alta', project_id: P_RDM });
    expect(kinds(tables)).toEqual(expect.arrayContaining(['indexacao.higiene', 'indexacao.problema']));
    const again = await setup({ tables, routes: rdmWorld(), fallback: rdmFallback as never }).run('hygiene');
    expect(again.body.newly_failing).toBe(0);
    for (const c of s.web.calls) expect(c.ua).toBe('ZicaAI-Indexacao/1.0');
    expect(s.web.calls.some((c) => c.url.includes('/zica-nao-existe-'))).toBe(true); // a isca do soft-404 na raiz
  });
  it('site em inglês (.com) saudável: nenhum ponto a corrigir', async () => {
    const tables = seed({ index_urls: [urlRow(P_EN, `${EN}/`, { http_status: 200 }), urlRow(P_EN, `${EN}/pricing/`, { http_status: 200, canonical: `${EN}/pricing/` })] });
    const dates = ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-08', '2026-11-12'];
    const lm = (u: string, i: number) => [u, dates[i % 5]] as [string, string];
    const routes: Record<string, Route | string> = {
      [`${EN}/robots.txt`]: text('User-agent: *\nDisallow: /cart/\nSitemap: https://acme-tools.com/sitemap.xml\n'), [`${EN}/llms.txt`]: text('# Acme Tools\n> Hand tools and workshop gear sold worldwide, see the product pages.'),
      [`${EN}/`]: page(html({ lang: 'en', title: 'Acme Tools', canonical: `${EN}/`, body: 'Welcome to Acme Tools' })), 'http://acme-tools.com/': redirect(`${EN}/`), 'http://acme-tools.com/pricing/': redirect(`${EN}/pricing/`),
      [`${EN}/sitemap.xml`]: xml(urlset([lm(`${EN}/`, 0), lm(`${EN}/pricing/`, 1), lm(`${EN}/products/hammers/`, 2), lm(`${EN}/products/saws/`, 3), lm(`${EN}/about-us/company/`, 4), [`${EN}/contact/`, '2026-10-02']])),
    };
    const r = await setup({ tables, project: P_EN, routes }).run('hygiene');
    expect((r.body.items as Array<{ key: string; ok: boolean; applicable: boolean }>).filter((i) => !i.ok && i.applicable).map((i) => i.key)).toEqual([]);
    expect(r.body.failing).toBe(0);
  });
  it('multilíngue com hreflang: confere auto-referência, x-default, códigos e os links de retorno das versões (uma volta quebrada é achada)', async () => {
    const ML = 'https://shop.example.com';
    const alt: Array<[string, string]> = [['en', `${ML}/en/`], ['es', `${ML}/es/`], ['fr', `${ML}/fr/`], ['x-default', `${ML}/`], ['english', `${ML}/xx/`]];
    const tables = seed({ index_urls: [urlRow(P_ML, `${ML}/en/pricing/`, { http_status: 200, lang: 'en' }), urlRow(P_ML, `${ML}/es/precios/`, { http_status: 200, lang: 'es' })] });
    const routes: Record<string, Route | string> = {
      [`${ML}/robots.txt`]: text(`User-agent: *\nSitemap: ${ML}/sitemap.xml\n`), [`${ML}/sitemap.xml`]: xml(urlset([`${ML}/en/pricing/`, `${ML}/es/precios/`])),
      [`${ML}/`]: page(html({ lang: 'en', title: 'Shop', canonical: `${ML}/`, hreflang: alt })),
      [`${ML}/en/`]: page(html({ lang: 'en', title: 'EN', canonical: `${ML}/en/`, hreflang: [['en', `${ML}/en/`], ['es', `${ML}/es/`], ['fr', `${ML}/fr/`], ['x-default', `${ML}/`]] })),
      [`${ML}/es/`]: page(html({ lang: 'es', title: 'ES', canonical: `${ML}/es/`, hreflang: [['en', `${ML}/en/`], ['es', `${ML}/es/`], ['x-default', `${ML}/`]] })),
      [`${ML}/fr/`]: page(html({ lang: 'fr', title: 'FR', canonical: `${ML}/fr/`, hreflang: [['fr', `${ML}/fr/`]] })),
      'http://shop.example.com/': redirect(`${ML}/`),
    };
    const r = await setup({ tables, project: P_ML, routes }).run('hygiene');
    const items = r.body.items as Array<{ key: string; ok: boolean; applicable: boolean; detail: string }>;
    const bad = items.filter((i) => !i.ok && i.applicable).map((i) => i.key);
    expect(bad).toContain('hreflang_codigos_validos'); // "english"
    expect(bad).toContain('hreflang_autorreferencia'); // a home não lista a si mesma (só /en/, /es/, /fr/ e x-default)
    expect(bad).not.toContain('hreflang_x_default');
    expect(bad).not.toContain('hreflang_presente');
    expect(items.find((i) => i.key === 'hreflang_retorno')).toMatchObject({ ok: false });
    expect(items.find((i) => i.key === 'hreflang_retorno')!.detail).toMatch(/fr\//);
  });
  it('site em espanhol (.es) sem robots.txt: avisa e sugere como corrigir, sem supor nada do Brasil', async () => {
    const ES = 'https://tienda-verde.es';
    const tables = seed({ projects: [...projects(), { id: P_NODOMAIN.replace('b8', 'b6'), name: 'Tienda', domain: 'tienda-verde.es', wordpress_url: null, organization_id: ORG }], index_urls: [] });
    const routes: Record<string, Route | string> = { [`${ES}/`]: page(html({ lang: 'es', title: 'Tienda Verde', canonical: `${ES}/` })), 'http://tienda-verde.es/': redirect(`${ES}/`), [`${ES}/sitemap.xml`]: xml(urlset([[`${ES}/`, '2026-11-01'], [`${ES}/tienda/`, '2026-11-02'], [`${ES}/blog/`, '2026-11-03'], [`${ES}/contacto/`, '2026-11-04'], [`${ES}/envios/`, '2026-11-05']])) };
    const r = await setup({ tables, project: P_NODOMAIN.replace('b8', 'b6'), routes }).run('hygiene');
    const bad = (r.body.items as Array<{ key: string; ok: boolean; applicable: boolean; fix: string }>).filter((i) => !i.ok && i.applicable);
    expect(bad.map((i) => i.key)).toContain('robots_existe');
    expect(bad.find((i) => i.key === 'robots_existe')!.fix).toMatch(/robots\.txt/);
  });
  it('leitor não roda a higiene; projeto sem domínio é recusado', async () => {
    expect((await setup({ role: 'viewer' }).run('hygiene')).body.error).toBe('role_not_allowed');
    expect((await setup({ project: P_NODOMAIN }).run('hygiene')).body.error).toBe('project_domain_required');
  });
});

// ------------------------------------------------------------------------------------------------------------ plano, lista e visão geral
describe('indexação: plan, list e overview', () => {
  const world = () => {
    const a = urlRow(P_EN, `${EN}/alta/`, { gsc_impressions: 90_000, http_status: 200, canonical: `${EN}/alta/` });
    const b = urlRow(P_EN, `${EN}/baixa/`, { gsc_impressions: 5, http_status: 200, canonical: `${EN}/baixa/`, taxonomy_node_id: 'n1' });
    const idx = urlRow(P_EN, `${EN}/ja-indexada/`, { gsc_impressions: 999_999, http_status: 200, canonical: `${EN}/ja-indexada/` });
    const bad = urlRow(P_EN, `${EN}/quebrada/`, { gsc_impressions: 999_999, http_status: 500 });
    const es = urlRow(P_EN, `${EN}/es/hola/`, { lang: 'es', http_status: 200, canonical: `${EN}/es/hola/`, in_sitemap: false, in_search_console: true });
    const tables = seed({
      index_urls: [a, b, idx, bad, es], index_keys: [{ id: 'k', organization_id: ORG, project_id: P_EN, host: 'acme-tools.com', key_value: 'k3y-acme-0123456789', key_location: null }],
      index_status: [{ id: 's1', organization_id: ORG, project_id: P_EN, url_id: idx.id, engine: 'google', state: 'indexada', detail: {}, checked_at: '2026-11-18T00:00:00.000Z' }, { id: 's2', organization_id: ORG, project_id: P_EN, url_id: b.id, engine: 'google', state: 'nao_indexada', detail: { coverage_state: 'Discovered - currently not indexed' }, checked_at: '2026-11-18T00:00:00.000Z' }],
      index_submissions: [{ id: 'x1', organization_id: ORG, project_id: P_EN, engine: 'indexnow', host: 'acme-tools.com', urls_count: 4, status: 'aceita', response: { http_status: 200 }, created_at: '2026-11-17T00:00:00.000Z' }],
      index_hygiene: [{ id: 'h1', organization_id: ORG, project_id: P_EN, check_key: 'https_forcado', ok: false, severity: 'alta', detail: { label: 'HTTP redireciona para HTTPS', text: 'http abre sem redirecionar', fix: 'Force o 301', evidence: {}, applicable: true }, checked_at: '2026-11-19T00:00:00.000Z' }],
      nexus_oauth_connections: [{ project_id: P_EN, organization_id: ORG, provider: 'gsc', property_id: 'sc-domain:acme-tools.com' }],
    });
    return { tables, ids: { a: a.id, b: b.id, idx: idx.id, bad: bad.id, es: es.id } };
  };
  it('plan: fila por prioridade (impressões, área aprovada), exclui indexada e com problema, e sugere lotes por motor', async () => {
    const { tables, ids } = world();
    const r = await setup({ tables, project: P_EN }).run('plan');
    const q = r.body.queue as Array<{ url_id: string; score: number; reasons: string[] }>;
    expect(q.map((x) => x.url_id)).toEqual([ids.a, ids.b, ids.es].sort((x, y) => q.findIndex((z) => z.url_id === x) - q.findIndex((z) => z.url_id === y)));
    expect(q[0].url_id).toBe(ids.a);
    expect(q.some((x) => x.url_id === ids.idx || x.url_id === ids.bad)).toBe(false);
    expect(r.body.excluded).toEqual({ indexed: 1, blocked: 1 });
    const batches = r.body.batches as { google_inspect: { urls: number }; indexnow: Array<{ host: string; urls: number }>; bing: Array<{ urls: number }> };
    expect(batches.google_inspect.urls).toBe(2); // a e es (b já foi consultada: nao_indexada)
    expect(batches.indexnow).toEqual([expect.objectContaining({ host: 'acme-tools.com', urls: 3 })]);
    expect((r.body.blocking as Record<string, { count: number }>).erro_http.count).toBe(1);
    expect((await setup({ tables: seed(), project: P_EN }).run('plan')).body).toMatchObject({ empty: true, queue: [] });
  });
  it('list: filtros por site, estado, problema, texto e página; só do projeto', async () => {
    const { tables } = world();
    const all = await setup({ tables, project: P_EN }).run('list');
    expect(all.body.total).toBe(5);
    const idx = await setup({ tables, project: P_EN }).run('list', { state: 'indexada' });
    expect((idx.body.rows as Array<{ url: string }>).map((x) => x.url)).toEqual([`${EN}/ja-indexada/`]);
    const prob = await setup({ tables, project: P_EN }).run('list', { problem: 'erro_http' });
    expect((prob.body.rows as Array<{ url: string }>).map((x) => x.url)).toEqual([`${EN}/quebrada/`]);
    const q = await setup({ tables, project: P_EN }).run('list', { q: '/ES/HOLA', problem: 'fora_do_sitemap' });
    expect(q.body.total).toBe(1);
    expect((await setup({ tables, project: P_EN }).run('list', { state: 'nao_indexada' })).body.total).toBe(1);
    expect((await setup({ tables, project: P_EN }).run('list', { host: 'outro.com' })).body.total).toBe(0);
    expect((await setup({ tables, project: P_EN, role: 'viewer' }).run('list')).status).toBe(200);
  });
  it('overview: totais, cobertura por site/seção/idioma/nó, problemas, histórico, higiene, conexões, bloqueios e o catálogo honesto de buscadores; leitor vê mas não edita', async () => {
    const { tables } = world();
    tables.project_taxonomy_nodes.push({ id: 'n1', project_id: P_EN, organization_id: ORG, kind: 'matriz', slug: 'tools', label: 'Tools', keywords: [], status: 'aprovado' });
    const s = setup({ tables, project: P_EN, role: 'viewer', bingKey: null });
    const r = await s.run('overview');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ can_edit: false, can_admin: false, project: { domain: 'acme-tools.com' } });
    expect(r.body.totals).toMatchObject({ urls: 5, indexed: 1, not_indexed: 1, unknown: 3, with_problems: 2, in_sitemap: 4, outside_sitemap: 1, never_checked: 5 });
    const cov = r.body.coverage as { by_host: Array<{ key: string; urls: number }>; by_section: Array<{ label: string }>; by_lang: Array<{ key: string; urls: number }>; by_node: Array<{ label: string; urls: number }> };
    expect(cov.by_host).toEqual([expect.objectContaining({ key: 'acme-tools.com', urls: 5 })]);
    expect(cov.by_lang.map((b) => b.key).sort()).toEqual(['es', 'sem_idioma']);
    expect(cov.by_node.find((n) => n.label === 'Tools')).toMatchObject({ urls: 1 });
    expect((r.body.submissions as unknown[]).length).toBe(1);
    expect((r.body.hygiene as Array<{ key: string; ok: boolean; fix: string }>)[0]).toMatchObject({ key: 'https_forcado', ok: false, fix: 'Force o 301' });
    expect(r.body.connections).toMatchObject({ google: { connected: true, property: 'sc-domain:acme-tools.com' }, bing: { connected: false }, indexnow: { hosts: [{ host: 'acme-tools.com', key_ready: true }] } });
    expect(JSON.stringify(r.body)).not.toContain('k3y-acme');
    const blockers = (r.body.blockers as Array<{ key: string }>).map((b) => b.key);
    expect(blockers).toEqual(expect.arrayContaining(['higiene:https_forcado', 'fora_do_sitemap']));
    const eng = Object.fromEntries((r.body.engines as Array<{ key: string; support: string }>).map((e) => [e.key, e.support]));
    expect(eng).toMatchObject({ google: 'implementado', bing: 'implementado', indexnow: 'implementado', baidu: 'sem_api_gratuita_verificada', yandex: 'cobertura_indexnow', naver: 'cobertura_indexnow' });
    expect((r.body.quota as { google: { verified: boolean } }).google.verified).toBe(false);
    expect((await setup({ tables, project: P_EN, role: 'admin' }).run('overview')).body).toMatchObject({ can_edit: true, can_admin: true });
  });
  it('overview de projeto sem dado nenhum: tudo zerado e o bloqueio manda atualizar o inventário (sem inventar número)', async () => {
    const r = await setup({ tables: seed(), project: P_EN }).run('overview');
    expect(r.body.totals).toMatchObject({ urls: 0, indexed: 0 });
    expect((r.body.blockers as Array<{ key: string }>).map((b) => b.key)).toContain('sem_inventario');
    expect(r.body.hygiene).toEqual([]);
    expect(r.body.submissions).toEqual([]);
  });
  it('ação desconhecida é recusada', async () => { expect((await setup().run('apagar_tudo')).body.error).toBe('unknown_action'); });
});
