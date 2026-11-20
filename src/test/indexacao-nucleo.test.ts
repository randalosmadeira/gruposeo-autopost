import { describe, expect, it } from 'vitest';
import {
  BING_BATCH_MAX, ENGINE_CATALOG, INDEXNOW_MAX_URLS, belongsToProject, buildPlan, bytesToText, chunkList, coverageBy, evaluateHygiene, fingerprintOf, isSoft404Page, isSoft404Template, isValidHreflang, keyFileMatches,
  languageOfUrl, makeLimiter, matchTaxonomyNode, normalizeUrl, pageSignals, parentOf, parseInspection, parseRobotsRules, parseSitemap, projectHosts, propertyCovers, registrable, robotsAllows, scoreUrl, sectionOfPath,
  selectUnsent, sentinelUrlFor, sitemapSeriesGaps, textHash, urlProblems, type HostEvidence, type HygieneEvidence, type SitemapFileEvidence, type UrlRow,
} from '../../supabase/functions/_shared/indexation-core';
import { HUB_HTML, TATUAPE_HTML, gz, html, sitemapIndex, urlset } from './helpers/indexation-fixtures';

const headers = (h: Record<string, string> = {}) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });
const sig = (h: string, url: string, hh: Record<string, string> = {}) => pageSignals(h, headers(hh), url);

describe('indexação: URL, posse de host e idioma (nada supõe país)', () => {
  it('normaliza: https, host minúsculo, sem fragmento, sem utm/fbclid/gclid, porta padrão fora, barra final preservada mas ignorada na chave', () => {
    const a = normalizeUrl('http://RDMAdvogados.com.br:80/Blog/post/?utm_source=x&b=2&a=1&fbclid=abc#topo');
    expect(a).toMatchObject({ url: 'https://rdmadvogados.com.br/Blog/post/?a=1&b=2', host: 'rdmadvogados.com.br', key: 'rdmadvogados.com.br/Blog/post?a=1&b=2' });
    expect(normalizeUrl('https://exemplo.com/a')?.key).toBe(normalizeUrl('https://exemplo.com/a/')?.key);
    expect(normalizeUrl('https://exemplo.com/a')?.url).toBe('https://exemplo.com/a');
    expect(normalizeUrl('/x/', 'https://exemplo.com/blog/')?.url).toBe('https://exemplo.com/x/');
    expect(normalizeUrl('https://exemplo.com//a///b')?.url).toBe('https://exemplo.com/a/b');
  });
  it('recusa o que não é endereço público de site: ftp, usuário/senha, IP, localhost, porta estranha, vazio, gigante', () => {
    for (const bad of ['ftp://exemplo.com/a', 'https://user:senha@exemplo.com/', 'https://10.0.0.1/', 'https://localhost/', 'https://exemplo.com:8443/', '', '   ', `https://exemplo.com/${'a'.repeat(2100)}`, 'javascript:alert(1)', 42]) expect(normalizeUrl(bad as string)).toBeNull();
  });
  it('domínio registrável é global: co.uk, com.au, co.jp, com.mx, com.br, es e plataformas de blog onde cada subdomínio é de um dono', () => {
    expect(registrable('www.example.co.uk')).toBe('example.co.uk');
    expect(registrable('shop.example.com.au')).toBe('example.com.au');
    expect(registrable('www.example.co.jp')).toBe('example.co.jp');
    expect(registrable('tienda.example.com.mx')).toBe('example.com.mx');
    expect(registrable('defesadecnh.rdmadvogados.com.br')).toBe('rdmadvogados.com.br');
    expect(registrable('blog.example.es')).toBe('example.es');
    expect(registrable('example.com')).toBe('example.com');
    expect(registrable('meublog.github.io')).toBe('meublog.github.io');
    expect(registrable('outro.wordpress.com')).toBe('outro.wordpress.com');
  });
  it('recusa host de terceiros: parecidos, outro sufixo do mesmo país e plataforma compartilhada (casos em .com.br, .com, .co.jp, .es e github.io)', () => {
    const rdm = projectHosts({ domain: 'rdmadvogados.com.br', wordpress_url: 'https://rdmadvogados.com.br/blog' });
    for (const h of ['rdmadvogados.com.br', 'www.rdmadvogados.com.br', 'defesadecnh.rdmadvogados.com.br', 'direitonews.rdmadvogados.com.br']) expect(belongsToProject(h, rdm), h).toBe(true);
    for (const h of ['rdmadvogados.com.br.mal.com', 'outroescritorio.com.br', 'com.br', 'drmadeira1470.com.br', 'rdmadvogadosx.com.br']) expect(belongsToProject(h, rdm), h).toBe(false);
    const en = projectHosts({ domain: 'https://www.acme-tools.com/', wordpress_url: null });
    expect(belongsToProject('shop.acme-tools.com', en)).toBe(true);
    expect(belongsToProject('acme-tools.com.evil.net', en)).toBe(false);
    const jp = projectHosts({ domain: 'example.co.jp', wordpress_url: null });
    expect(belongsToProject('www.example.co.jp', jp)).toBe(true);
    expect(belongsToProject('evil.co.jp', jp)).toBe(false); // o sufixo "co.jp" nunca vale como domínio do projeto
    const es = projectHosts({ domain: 'tienda-verde.es', wordpress_url: null });
    expect(belongsToProject('blog.tienda-verde.es', es)).toBe(true);
    expect(belongsToProject('otra.es', es)).toBe(false);
    const gh = projectHosts({ domain: 'meublog.github.io', wordpress_url: null });
    expect(belongsToProject('meublog.github.io', gh)).toBe(true);
    expect(belongsToProject('alheio.github.io', gh)).toBe(false);
  });
  it('seção e idioma pelo endereço: pasta (/en/, /es-mx/), subdomínio (de.exemplo.com) e nada quando o endereço não diz', () => {
    expect(sectionOfPath('/blog/post/')).toBe('blog');
    expect(sectionOfPath('/')).toBe('(raiz)');
    expect(languageOfUrl('https://example.com/en/pricing/')).toBe('en');
    expect(languageOfUrl('https://example.com/es-MX/precios/')).toBe('es-mx');
    expect(languageOfUrl('https://de.example.com/preise/')).toBe('de');
    expect(languageOfUrl('https://example.com/zh-Hant/')).toBe('zh-hant');
    expect(languageOfUrl('https://example.com/pricing/')).toBeNull();
    expect(languageOfUrl('https://www.example.com/pricing/')).toBeNull();
    for (const ok of ['en', 'en-GB', 'es-419', 'pt-BR', 'zh-Hant', 'x-default', 'fr-CA']) expect(isValidHreflang(ok), ok).toBe(true);
    for (const bad of ['english', 'xx', 'en_US', 'en-', 'pt-br-x', '']) expect(isValidHreflang(bad), bad).toBe(false);
  });
  it('catálogo de buscadores é honesto: Baidu sem API gratuita verificada, Yandex e Naver só via IndexNow, Google só consulta', () => {
    const by = Object.fromEntries(ENGINE_CATALOG.map((e) => [e.key, e]));
    expect(by.baidu.support).toBe('sem_api_gratuita_verificada');
    expect(by.yandex.support).toBe('cobertura_indexnow');
    expect(by.naver.support).toBe('cobertura_indexnow');
    expect(by.indexnow.how).toMatch(/Não inclui o Google/);
    expect(by.google.how).toMatch(/somente leitura/);
  });
});

describe('indexação: sitemap (índice, gz, erro) e robots', () => {
  it('lê urlset com lastmod, CDATA e entidades; lê índice; texto que não é sitemap devolve null; conta hreflang de sitemap', () => {
    const p = parseSitemap(urlset([['https://example.com/a?x=1&amp;y=2', '2026-11-10T10:00:00+00:00'], 'https://example.com/b/'], '<xhtml:link rel="alternate" hreflang="es" href="https://example.com/es/a/"/>'));
    expect(p?.kind).toBe('urls');
    expect(p?.entries[0]).toEqual({ loc: 'https://example.com/a?x=1&y=2', lastmod: '2026-11-10' });
    expect(p?.entries[1].lastmod).toBeNull();
    expect(p?.hreflangLinks).toBe(2);
    expect(parseSitemap('<urlset><url><loc><![CDATA[https://example.com/c/]]></loc></url></urlset>')?.entries[0].loc).toBe('https://example.com/c/');
    const idx = parseSitemap(sitemapIndex([['https://example.com/post-sitemap1.xml', '2026-11-11'], 'https://example.com/post-sitemap2.xml']));
    expect(idx?.kind).toBe('index');
    expect(idx?.entries.map((e) => e.loc)).toEqual(['https://example.com/post-sitemap1.xml', 'https://example.com/post-sitemap2.xml']);
    expect(parseSitemap('<html><body>Erro 404</body></html>')).toBeNull();
    expect(parseSitemap('')).toBeNull();
  });
  it('descompacta .gz e respeita o limite de tamanho; texto simples passa direto', async () => {
    const xml = urlset(['https://example.com/a/', 'https://example.com/b/']);
    expect((await bytesToText(gz(xml), 1_000_000)).text).toBe(xml);
    expect((await bytesToText(gz(xml), 1_000_000)).gzip).toBe(true);
    const cut = await bytesToText(gz(xml), 40);
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(40);
    expect((await bytesToText(new TextEncoder().encode(xml), 1_000_000))).toMatchObject({ text: xml, gzip: false, truncated: false });
  });
  it('índice atrasado: um índice lista post-sitemap1..11 e o outro 1..12 (caso real da RDM)', () => {
    const a = { url: 'https://rdmadvogados.com.br/sitemap-index.xml', children: ['sitemap.xml', ...Array.from({ length: 11 }, (_, i) => `blog/post-sitemap${i + 1}.xml`)].map((p) => `https://rdmadvogados.com.br/${p}`) };
    const b = { url: 'https://rdmadvogados.com.br/blog/sitemap_index.xml', children: [...Array.from({ length: 12 }, (_, i) => `blog/post-sitemap${i + 1}.xml`), 'blog/category-sitemap.xml'].map((p) => `https://rdmadvogados.com.br/${p}`) };
    const gaps = sitemapSeriesGaps([a, b]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ index: a.url, series: 'post-sitemap' });
    expect(gaps[0].missing).toEqual(['https://rdmadvogados.com.br/blog/post-sitemap12.xml']);
    expect(sitemapSeriesGaps([a])).toEqual([]);
  });
  it('robots: grupo do agente vence "*", regra mais longa vence, $ e * funcionam, "Disallow:" vazio libera, Sitemap é lido', () => {
    const r = parseRobotsRules('User-agent: *\nDisallow: /privado/\nDisallow: /*.pdf$\nAllow: /privado/aberto/\nSitemap: https://example.com/sitemap.xml\n\nUser-agent: ZicaAI-Indexacao\nDisallow: /so-para-nos/\n');
    expect(r.sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(robotsAllows(r, '/so-para-nos/x')).toBe(false); // grupo do nosso agente
    expect(robotsAllows(r, '/privado/x')).toBe(true); // o grupo do agente substitui o "*"
    const star = parseRobotsRules('User-agent: *\nDisallow: /privado/\nDisallow: /*.pdf$\nAllow: /privado/aberto/\n');
    expect(robotsAllows(star, '/privado/x')).toBe(false);
    expect(robotsAllows(star, '/privado/aberto/y')).toBe(true);
    expect(robotsAllows(star, '/arquivo.pdf')).toBe(false);
    expect(robotsAllows(star, '/arquivo.pdf?x=1')).toBe(true);
    expect(robotsAllows(parseRobotsRules('User-agent: *\nDisallow:\n'), '/qualquer')).toBe(true);
    expect(parseRobotsRules('User-agent: *\nDisallow: /\n').disallowAllForStar).toBe(true);
    expect(robotsAllows(parseRobotsRules('User-agent: *\nDisallow: /wp-includes/\n'), '/wp-includes/js/jquery.js', 'googlebot')).toBe(false);
  });
  it('limite de taxa: 1 requisição por segundo por host, hosts diferentes não se atrapalham', async () => {
    let t = 1_000_000;
    const sleeps: number[] = [];
    const wait = makeLimiter({ now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } }, 1000);
    await wait('a.com'); await wait('a.com'); await wait('a.com'); await wait('b.com');
    expect(sleeps).toEqual([1000, 1000]);
    t += 5000; sleeps.length = 0;
    await wait('a.com');
    expect(sleeps).toEqual([]);
  });
});

describe('indexação: página, soft-404 (casos reais da RDM) e problemas', () => {
  const H = 'https://rdmadvogados.com.br';
  const fp = (h: string, url: string, status = 200) => fingerprintOf(status, sig(h, url));
  it('lê canonical, meta robots, X-Robots-Tag, hreflang e idioma do HTML', () => {
    const s = sig(html({ canonical: 'https://example.com/en/', robots: 'noindex, follow', lang: 'en', hreflang: [['en', 'https://example.com/en/'], ['x-default', 'https://example.com/']] }), 'https://example.com/en/', { 'x-robots-tag': 'NoSnippet' });
    expect(s).toMatchObject({ canonical: 'https://example.com/en/', robotsMeta: 'noindex,follow', xRobots: 'nosnippet', htmlLang: 'en', noindex: true });
    expect(s.hreflang).toEqual([{ lang: 'en', href: 'https://example.com/en/' }, { lang: 'x-default', href: 'https://example.com/' }]);
    expect(sig(html({ canonical: '/rel/' }), 'https://example.com/a/').canonical).toBe('https://example.com/rel/');
    expect(sig(html({}), 'https://example.com/', { 'x-robots-tag': 'noindex' }).noindex).toBe(true);
    expect(textHash('a')).not.toBe(textHash('b'));
    expect(textHash('igual')).toBe(textHash('igual'));
  });
  it('/advogado-criminalista/zona-norte (200 com o hub) é soft-404; /advogado-criminalista/tatuape (conteúdo próprio) NÃO é', () => {
    const hubUrl = `${H}/advogado-criminalista/`;
    const hub = fp(HUB_HTML, hubUrl);
    const sentinel = fp(HUB_HTML, sentinelUrlFor(hubUrl, 'abc')); // a isca devolve o hub com 200
    expect(isSoft404Template(sentinel, hub, hubUrl)).toMatchObject({ soft: true });
    const zn = fp(HUB_HTML, `${H}/advogado-criminalista/zona-norte/`);
    expect(isSoft404Page(zn, `${H}/advogado-criminalista/zona-norte/`, sentinel, hub, hubUrl)).toMatchObject({ soft: true });
    const tat = fp(TATUAPE_HTML, `${H}/advogado-criminalista/tatuape/`);
    expect(isSoft404Page(tat, `${H}/advogado-criminalista/tatuape/`, sentinel, hub, hubUrl)).toEqual({ soft: false, reason: null });
    // o próprio hub nunca é marcado
    expect(isSoft404Page(hub, hubUrl, sentinel, hub, hubUrl).soft).toBe(false);
  });
  it('/direito-criminal/<qualquer> responde 404 de verdade: o diretório NÃO é molde de soft-404', () => {
    const hubUrl = `${H}/direito-criminal/`;
    const hub = fp(html({ title: 'Direito Criminal | RDM', canonical: hubUrl }), hubUrl);
    const sentinel = fp(html({ title: '404' }), sentinelUrlFor(hubUrl, 'abc'), 404);
    expect(isSoft404Template(sentinel, hub, hubUrl).soft).toBe(false);
    expect(isSoft404Page(hub, `${H}/direito-criminal/x/`, sentinel, hub, hubUrl).soft).toBe(false);
  });
  it('detecta molde soft-404 também só pelo canonical apontando para a página-mãe, e por título e tamanho iguais', () => {
    const hubUrl = `${H}/hub/`;
    const hub = fp(html({ title: 'Hub', canonical: hubUrl, body: 'x'.repeat(500) }), hubUrl);
    const byCanonical = fp(html({ title: 'Outra', canonical: hubUrl, body: 'texto diferente' }), `${H}/hub/zzz/`);
    expect(isSoft404Template(byCanonical, hub, hubUrl).soft).toBe(true);
    const byTitle = fp(html({ title: 'Hub', canonical: `${H}/hub/zzz/`, body: 'y'.repeat(505) }), `${H}/hub/zzz/`);
    expect(isSoft404Template(byTitle, hub, hubUrl)).toMatchObject({ soft: true });
  });
  it('pai e isca: o pai de /a/b/c/ é /a/b/; a raiz não tem pai; a isca fica no mesmo diretório', () => {
    expect(parentOf('https://example.com/a/b/c/')).toBe('https://example.com/a/b/');
    expect(parentOf('https://example.com/a/')).toBe('https://example.com/');
    expect(parentOf('https://example.com/')).toBeNull();
    expect(sentinelUrlFor('https://example.com/a/', 'tok')).toBe('https://example.com/a/zica-nao-existe-tok/');
  });
  const row = (o: Partial<UrlRow> = {}): UrlRow => ({
    id: 'u1', url: 'https://example.com/a/', host: 'example.com', path: '/a/', source: 'sitemap', taxonomy_node_id: null, first_seen: '2026-11-01T00:00:00Z', last_seen: '2026-11-19T00:00:00Z', in_sitemap: true, in_search_console: false, gsc_impressions: 0, gsc_clicks: 0,
    article_id: null, lastmod: null, changed_at: '2026-11-01T00:00:00Z', http_status: 200, canonical: 'https://example.com/a/', robots_meta: null, x_robots: null, redirect_to: null, https_redirect: null, soft404_suspect: false, check_error: null, last_checked_at: '2026-11-19T00:00:00Z', ...o,
  });
  it('problemas de uma URL: noindex (meta e cabeçalho), soft-404, erro, redirecionamento, canonical diferente, fora do sitemap, robots, sem resposta, http sem https', () => {
    expect(urlProblems(row())).toEqual([]);
    expect(urlProblems(row({ robots_meta: 'noindex,follow' }))).toContain('noindex');
    expect(urlProblems(row({ x_robots: 'noindex' }))).toContain('noindex');
    expect(urlProblems(row({ soft404_suspect: true }))).toContain('soft404');
    expect(urlProblems(row({ http_status: 503 }))).toContain('erro_http');
    expect(urlProblems(row({ http_status: 301, redirect_to: 'https://example.com/b/' }))).toContain('redirecionada');
    expect(urlProblems(row({ canonical: 'https://example.com/outra/' }))).toContain('canonical_diferente');
    expect(urlProblems(row({ canonical: 'https://example.com/a' }))).toEqual([]); // barra final não conta
    expect(urlProblems(row({ in_sitemap: false, in_search_console: true }))).toContain('fora_do_sitemap');
    expect(urlProblems(row({ in_sitemap: false, source: 'sitemap' }))).toEqual([]);
    expect(urlProblems(row({ http_status: null, check_error: 'bloqueada_pelo_robots' }))).toContain('bloqueada_robots');
    expect(urlProblems(row({ http_status: null, check_error: 'tempo_esgotado' }))).toContain('sem_resposta');
    expect(urlProblems(row({ https_redirect: false }))).toContain('http_sem_redirecionamento');
  });
});

describe('indexação: plano, lotes, IndexNow e Google', () => {
  const r = (id: string, o: Partial<UrlRow> = {}): UrlRow => ({
    id, url: `https://example.com/${id}/`, host: 'example.com', path: `/${id}/`, source: 'sitemap', taxonomy_node_id: null, first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-11-19T00:00:00Z', in_sitemap: true, in_search_console: false, gsc_impressions: 0, gsc_clicks: 0,
    article_id: null, lastmod: null, changed_at: '2026-01-01T00:00:00Z', http_status: 200, canonical: `https://example.com/${id}/`, robots_meta: null, x_robots: null, redirect_to: null, https_redirect: null, soft404_suspect: false, check_error: null, last_checked_at: '2026-11-19T00:00:00Z', ...o,
  });
  const NOW = Date.UTC(2026, 10, 20, 12);
  const inp = (row: UrlRow, google: 'desconhecido' | 'indexada' | 'nao_indexada' = 'desconhecido', over: { node?: boolean; sent?: boolean } = {}) => ({ row, google, bingOrNowSent: !!over.sent, nodeApproved: !!over.node, nowMs: NOW });
  it('fila: impressões altas e área aprovada sobem; artigo novo entra; indexada e com problema ficam de fora, com contagem', () => {
    const plan = buildPlan([
      inp(r('baixa', { gsc_impressions: 10 })),
      inp(r('alta', { gsc_impressions: 100_000 })),
      inp(r('area', { gsc_impressions: 10 }), 'desconhecido', { node: true }),
      inp(r('artigo-novo', { source: 'artigo', first_seen: '2026-11-18T00:00:00Z', in_sitemap: false })),
      inp(r('ja-indexada', { gsc_impressions: 999_999 }), 'indexada'),
      inp(r('noindex', { gsc_impressions: 999_999, robots_meta: 'noindex' })),
      inp(r('erro', { gsc_impressions: 999_999, http_status: 404 })),
    ]);
    expect(plan.queue.map((q) => q.url_id)).toEqual(['alta', 'area', 'artigo-novo', 'baixa']);
    expect(plan.excluded).toEqual({ indexed: 1, blocked: 2 });
    expect(plan.queue[0].reasons.join(' ')).toMatch(/impressões no Google/);
    expect(scoreUrl(inp(r('x'), 'nao_indexada'))?.reasons.join(' ')).toMatch(/não está indexada/);
    expect(scoreUrl(inp(r('x', { gsc_impressions: 50 }), 'desconhecido', { sent: true }))!.score).toBeLessThan(scoreUrl(inp(r('x', { gsc_impressions: 50 })))!.score);
  });
  it('lotes do IndexNow: no máximo 10.000 URLs por envio; Bing em lotes de 500', () => {
    expect(INDEXNOW_MAX_URLS).toBe(10_000);
    expect(BING_BATCH_MAX).toBe(500);
    const parts = chunkList(Array.from({ length: 10_001 }, (_, i) => i), INDEXNOW_MAX_URLS);
    expect(parts.map((p) => p.length)).toEqual([10_000, 1]);
    expect(chunkList([], 10).length).toBe(0);
  });
  it('não reenvia a mesma URL sem mudança; reenvia quando muda; nunca envia URL com problema', () => {
    const rows = [
      { id: 'novo', url: 'https://example.com/novo/', host: 'example.com', changed_at: '2026-11-19T00:00:00Z', problems: [] },
      { id: 'igual', url: 'https://example.com/igual/', host: 'example.com', changed_at: '2026-11-10T00:00:00Z', problems: [] },
      { id: 'mudou', url: 'https://example.com/mudou/', host: 'example.com', changed_at: '2026-11-19T00:00:00Z', problems: [] },
      { id: 'quebrada', url: 'https://example.com/q/', host: 'example.com', changed_at: '2026-11-19T00:00:00Z', problems: ['erro_http' as const] },
    ];
    const sel = selectUnsent(rows, new Map([['igual', '2026-11-15T00:00:00Z'], ['mudou', '2026-11-12T00:00:00Z']]));
    expect(sel.send.map((s) => s.id)).toEqual(['novo', 'mudou']);
    expect(sel.skipped_unchanged).toBe(1);
    expect(sel.skipped_problem).toBe(1);
    expect(keyFileMatches('abc12345\n', 'abc12345')).toBe(true);
    expect(keyFileMatches('<html>404</html>', 'abc12345')).toBe(false);
  });
  it('URL Inspection: PASS e PARTIAL = indexada; NEUTRAL e FAIL = não indexada; resposta sem resultado = null', () => {
    const resp = (verdict: string, coverage: string) => ({ inspectionResult: { indexStatusResult: { verdict, coverageState: coverage, robotsTxtState: 'ALLOWED', lastCrawlTime: '2026-11-15T10:00:00Z', googleCanonical: 'https://example.com/a/' } } });
    expect(parseInspection(resp('PASS', 'Submitted and indexed'))).toMatchObject({ state: 'indexada', detail: { coverage_state: 'Submitted and indexed', google_canonical: 'https://example.com/a/' } });
    expect(parseInspection(resp('PARTIAL', 'Indexed with issues'))?.state).toBe('indexada');
    expect(parseInspection(resp('NEUTRAL', 'Crawled - currently not indexed'))?.state).toBe('nao_indexada');
    expect(parseInspection(resp('FAIL', 'URL is unknown to Google'))?.state).toBe('nao_indexada');
    expect(parseInspection({})).toBeNull();
    expect(parseInspection(null)).toBeNull();
  });
  it('propriedade do Search Console cobre a URL: domínio (qualquer subdomínio, qualquer país) ou prefixo exato', () => {
    expect(propertyCovers('sc-domain:example.com', 'https://shop.example.com/a/')).toBe(true);
    expect(propertyCovers('sc-domain:example.com', 'https://example.org/a/')).toBe(false);
    expect(propertyCovers('sc-domain:example.co.jp', 'https://www.example.co.jp/ja/')).toBe(true);
    expect(propertyCovers('https://example.com/en/', 'https://example.com/en/pricing/')).toBe(true);
    expect(propertyCovers('https://example.com/en/', 'https://example.com/es/precios/')).toBe(false);
    expect(propertyCovers('https://example.com/', 'https://blog.example.com/a/')).toBe(false);
  });
  it('cobertura por grupo soma indexadas, não indexadas, desconhecidas, enviadas e com problema', () => {
    const rows = [r('a'), r('b', { robots_meta: 'noindex' }), r('c', { path: '/en/c/', url: 'https://example.com/en/c/', canonical: 'https://example.com/en/c/' })];
    const g = new Map<string, 'indexada' | 'nao_indexada' | 'desconhecido'>([['a', 'indexada'], ['b', 'nao_indexada'], ['c', 'desconhecido']]);
    const cov = coverageBy(rows, g, new Set(['c']), (x) => ({ key: x.host, label: x.host }));
    expect(cov).toEqual([{ key: 'example.com', label: 'example.com', urls: 3, indexed: 1, not_indexed: 1, sent: 1, unknown: 1, problems: 1 }]);
  });
  it('taxonomia: o nó aprovado com mais palavras no caminho vence; nó sugerido ou rejeitado nunca é usado; sem acento e em qualquer idioma', () => {
    const nodes = [
      { id: 'm', kind: 'matriz', slug: 'criminal', label: 'Direito criminal', keywords: ['criminalista'], status: 'aprovado' },
      { id: 'n', kind: 'nicho', slug: 'criminal/drogas', label: 'Tráfico de drogas', keywords: ['trafico'], status: 'aprovado' },
      { id: 's', kind: 'nicho', slug: 'criminal/sugerido', label: 'Sugerido', keywords: ['trafico', 'drogas', 'sugerido'], status: 'sugerido' },
      { id: 'en', kind: 'matriz', slug: 'pricing', label: 'Pricing plans', keywords: ['plans'], status: 'aprovado' },
      { id: 'es', kind: 'matriz', slug: 'envios', label: 'Envíos internacionales', keywords: ['internacionales'], status: 'aprovado' },
    ];
    expect(matchTaxonomyNode('/advogado-criminalista/trafico-de-drogas/', nodes)).toBe('n');
    expect(matchTaxonomyNode('/advogado-criminalista/', nodes)).toBe('m');
    expect(matchTaxonomyNode('/blog/receitas/', nodes)).toBeNull();
    expect(matchTaxonomyNode('/en/pricing-plans/', nodes)).toBe('en');
    expect(matchTaxonomyNode('/es/envios-internacionales/', nodes)).toBe('es');
  });
});

// ------------------------------------------------------------------------------------------------------------ higiene
const file = (o: Partial<SitemapFileEvidence> & { url: string }): SitemapFileEvidence => ({ kind: 'urls', status: 200, urls: 100, withLastmod: 100, distinctLastmod: 30, newestLastmod: '2026-11-11', children: [], foreignEntries: 0, truncated: false, ...o });
const host = (h: string, o: Partial<HostEvidence> = {}): HostEvidence => ({
  host: h, primary: true, robots: { state: 'ok', rules: parseRobotsRules(`User-agent: *\nDisallow: /wp-admin/\nSitemap: https://${h}/sitemap.xml\n`) }, llms: true, https: { state: 'ok' },
  httpProbes: [{ url: `http://${h}/`, status: 301, location: `https://${h}/`, ok: true }], rootSoft404: { soft: false, reason: null }, hreflang: null, ...o,
});
const base = (o: Partial<HygieneEvidence> = {}): HygieneEvidence => ({
  hosts: [host('example.com')], sitemaps: { declared: ['https://example.com/sitemap.xml'], files: [file({ url: 'https://example.com/sitemap.xml' })], totalEntries: 100, uniqueEntries: 100 },
  inventory: { total: 100, checked: 100, outsideSitemap: [], soft404: [], noindex: [], canonicalDiverges: [], httpErrors: [], sitemapRedirects: [] }, ...o,
});
const failing = (items: ReturnType<typeof evaluateHygiene>) => items.filter((i) => !i.ok && i.applicable).map((i) => i.key);

describe('indexação: higiene (casos reais da RDM e sites em inglês, multilíngue e espanhol)', () => {
  it('site em inglês (.com) em ordem: nenhum ponto a corrigir', () => {
    expect(failing(evaluateHygiene(base()))).toEqual([]);
  });
  it('RDM: reproduz o que a auditoria achou (índice atrasado, sitemap com 2 URLs, lastmod uniforme, duplicatas, http sem https, /links/, soft-404, certificado inválido)', () => {
    const H = 'rdmadvogados.com.br';
    const idxA = file({ url: `https://${H}/sitemap-index.xml`, kind: 'index', urls: 0, children: ['sitemap.xml', ...Array.from({ length: 11 }, (_, i) => `blog/post-sitemap${i + 1}.xml`)].map((p) => `https://${H}/${p}`) });
    const idxB = file({ url: `https://${H}/blog/sitemap_index.xml`, kind: 'index', urls: 0, children: Array.from({ length: 12 }, (_, i) => `https://${H}/blog/post-sitemap${i + 1}.xml`) });
    const main = file({ url: `https://${H}/sitemap.xml`, urls: 2, withLastmod: 2, distinctLastmod: 1 });
    const pillar = file({ url: `https://${H}/sitemap-pillar.xml`, urls: 9, withLastmod: 9, distinctLastmod: 1, foreignEntries: 2 });
    const ev = base({
      hosts: [
        host(H, { httpProbes: [{ url: `http://${H}/`, status: 301, location: `https://${H}/`, ok: true }, { url: `http://${H}/advogado-criminalista/`, status: 200, location: null, ok: false }], rootSoft404: { soft: false, reason: null } }),
        host('seumodelopeticao.rdmadvogados.com.br', { primary: false, https: { state: 'certificado_invalido', error: 'certificado_invalido' }, httpProbes: [], rootSoft404: null }),
        host('revisionaljuroslei.rdmadvogados.com.br', { primary: false, robots: { state: 'ausente' } }),
      ],
      sitemaps: { declared: [idxA.url, idxB.url], files: [idxA, idxB, main, pillar], totalEntries: 4609, uniqueEntries: 2603 },
      inventory: { total: 2819, checked: 301, outsideSitemap: [`https://${H}/links/`], soft404: [`https://${H}/advogado-criminalista/zona-norte/`], noindex: [], canonicalDiverges: [], httpErrors: [], sitemapRedirects: [`https://${H}/advogado-criminalista`] },
    });
    const items = evaluateHygiene(ev);
    expect(failing(items)).toEqual(expect.arrayContaining(['robots_existe', 'sitemap_indice_completo', 'sitemap_principal_curto', 'sitemap_lastmod_real', 'sitemap_sem_duplicidade', 'sitemap_so_hosts_do_projeto', 'https_certificado', 'https_forcado', 'soft404', 'fora_do_sitemap', 'sitemap_sem_redirecionamentos']));
    const by = (k: string) => items.find((i) => i.key === k)!;
    expect(by('sitemap_indice_completo').severity).toBe('alta');
    expect(by('sitemap_indice_completo').detail).toMatch(/post-sitemap12/);
    expect(by('sitemap_sem_duplicidade').detail).toMatch(/2\.006/);
    expect(by('https_certificado').detail).toMatch(/seumodelopeticao/);
    expect(by('https_forcado').detail).toMatch(/advogado-criminalista/);
    expect(by('https_forcado').fix).toMatch(/301/);
    expect(by('fora_do_sitemap').detail).toMatch(/\/links\//);
    expect(by('soft404').fix).toMatch(/404 de verdade/);
    for (const i of items.filter((x) => !x.ok && x.applicable)) { expect(i.fix, i.key).toBeTruthy(); expect(i.detail.length, i.key).toBeGreaterThan(10); }
  });
  it('robots bloqueando tudo ou CSS/JS, sem Sitemap e sem sitemap algum', () => {
    const items = evaluateHygiene(base({
      hosts: [host('example.com', { robots: { state: 'ok', rules: parseRobotsRules('User-agent: *\nDisallow: /\n') } }), host('blog.example.com', { primary: false, robots: { state: 'ok', rules: parseRobotsRules('User-agent: *\nDisallow: /wp-includes/\nDisallow: /wp-content/\n') } })],
      sitemaps: { declared: [], files: [file({ url: 'https://example.com/sitemap.xml', kind: 'erro', status: 404, urls: 0, error: 'http_404' })], totalEntries: 0, uniqueEntries: 0 },
    }));
    expect(failing(items)).toEqual(expect.arrayContaining(['robots_nao_bloqueia_tudo', 'robots_nao_bloqueia_css_js', 'robots_declara_sitemap', 'sitemap_existe', 'sitemap_arquivos_ok']));
    expect(items.find((i) => i.key === 'robots_nao_bloqueia_tudo')!.severity).toBe('alta');
    expect(items.find((i) => i.key === 'sitemap_existe')!.severity).toBe('alta');
  });
  it('multilíngue com hreflang correto (en, es, fr, x-default, auto-referência e retorno): nada a corrigir; sitemap por idioma também vale', () => {
    const ok = host('shop.example.com', { hreflang: { present: true, selfRef: true, xDefault: true, languages: ['en', 'es', 'fr', 'x-default'], invalidCodes: [], duplicateLangs: [], missingReturn: [], foreignAlternates: [] } });
    expect(failing(evaluateHygiene(base({ hosts: [ok], inventory: { ...base().inventory, languages: ['en', 'es', 'fr'] } })))).toEqual([]);
    const bySitemap = base({ sitemaps: { declared: [], files: [file({ url: 'https://shop.example.com/sitemap.xml', hreflangLinks: 300 })], totalEntries: 100, uniqueEntries: 100 }, inventory: { ...base().inventory, languages: ['en', 'es'] } });
    expect(failing(evaluateHygiene(bySitemap))).not.toContain('hreflang_presente');
  });
  it('multilíngue com hreflang quebrado: sem auto-referência, sem x-default, código inválido, idioma repetido, sem retorno e alternativa em outro domínio', () => {
    const bad = host('shop.example.com', { hreflang: { present: true, selfRef: false, xDefault: false, languages: ['en', 'english', 'es'], invalidCodes: ['english'], duplicateLangs: ['es'], missingReturn: ['https://shop.example.com/es/'], foreignAlternates: ['https://example.fr/'] } });
    const items = evaluateHygiene(base({ hosts: [bad] }));
    expect(failing(items)).toEqual(expect.arrayContaining(['hreflang_autorreferencia', 'hreflang_x_default', 'hreflang_codigos_validos', 'hreflang_retorno']));
    expect(items.find((i) => i.key === 'hreflang_retorno')!.detail).toMatch(/es\//);
    expect(items.find((i) => i.key === 'hreflang_dominios')!.severity).toBe('info');
    expect(items.find((i) => i.key === 'hreflang_codigos_validos')!.detail).toMatch(/english/);
  });
  it('site em vários idiomas sem hreflang nenhum (nem HTML nem sitemap) é problema de severidade média; site em um idioma só não é', () => {
    const multi = evaluateHygiene(base({ inventory: { ...base().inventory, languages: ['en', 'es', 'fr'] } }));
    expect(failing(multi)).toContain('hreflang_presente');
    expect(multi.find((i) => i.key === 'hreflang_presente')!.severity).toBe('media');
    const single = evaluateHygiene(base({ inventory: { ...base().inventory, languages: ['en'] } }));
    expect(single.find((i) => i.key === 'hreflang_presente')).toMatchObject({ ok: true, applicable: false });
  });
  it('site em espanhol (.es) em ordem; links de retorno que não deu para conferir aparecem como desconhecidos, nunca como "tudo certo"', () => {
    expect(failing(evaluateHygiene(base({ hosts: [host('tienda-verde.es')] })))).toEqual([]);
    const unknown = host('tienda-verde.es', { hreflang: { present: true, selfRef: true, xDefault: true, languages: ['es', 'x-default'], invalidCodes: [], duplicateLangs: [], missingReturn: null, foreignAlternates: [] } });
    const it2 = evaluateHygiene(base({ hosts: [unknown] })).find((i) => i.key === 'hreflang_retorno')!;
    expect(it2.applicable).toBe(false);
    expect(it2.detail).toMatch(/Não foi possível conferir/);
  });
});
