import { describe, expect, it } from 'vitest';
import {
  RADAR_UA, buildOpenPageRankUrl, cadenceFromLastmods, classifyPageType, detectTech, extractHeadings, extractJsonLd, extractLinks, extractPhones, parseLlmsTxt, parseOpenPageRank, schemaSummary, scanSite, wordCount,
  type ScanDeps,
} from '../../supabase/functions/_shared/radar-enrich-core';
import { HTML_COMPETITOR_HOME, HTML_SERVICE_PAGE, SITEMAP_COMPETITOR } from './helpers/radar-fixtures';

const HOST = 'advogadoscriminalistasemsp.com.br';
const NOW = Date.parse('2026-11-20T12:00:00Z');

function fakeSite(over: Record<string, { status?: number; body?: string; type?: string; headers?: Record<string, string> } | undefined> = {}) {
  const calls: Array<{ url: string; ua: string }> = []; const sleeps: number[] = [];
  const pages: Record<string, { status?: number; body?: string; type?: string; headers?: Record<string, string> }> = {
    [`https://${HOST}/robots.txt`]: { body: `User-agent: *\nDisallow: /wp-admin/\nSitemap: https://${HOST}/sitemap.xml`, type: 'text/plain' },
    [`https://${HOST}/sitemap.xml`]: { body: SITEMAP_COMPETITOR, type: 'application/xml' },
    [`https://${HOST}/`]: { body: HTML_COMPETITOR_HOME, type: 'text/html', headers: { server: 'nginx' } },
    [`https://${HOST}/advogado-criminal-na-zona-sul/`]: { body: HTML_SERVICE_PAGE, type: 'text/html' },
    [`https://${HOST}/blog/prisao-em-flagrante/`]: { body: '<html><title>Prisão em flagrante</title><h1>Flagrante</h1><p>texto</p></html>', type: 'text/html' },
    [`https://${HOST}/contato/`]: { body: '<html><title>Contato</title></html>', type: 'text/html' },
    [`https://${HOST}/sobre/`]: { body: '<html><title>Sobre</title></html>', type: 'text/html' },
    [`https://${HOST}/llms.txt`]: { status: 404, body: 'não existe', type: 'text/plain' },
  };
  for (const [k, v] of Object.entries(over)) { if (v) pages[k] = v; else delete pages[k]; }
  const deps: ScanDeps = {
    now: () => NOW, sleep: async (ms) => { sleeps.push(ms); }, lookupA: async () => ['93.184.216.34'],
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, ua: String((init?.headers as Record<string, string>)?.['User-Agent'] ?? '') });
      const p = pages[url];
      if (!p) return new Response('nf', { status: 404 });
      return new Response(p.body ?? '', { status: p.status ?? 200, headers: { 'content-type': p.type ?? 'text/html', ...(p.headers ?? {}) } });
    }) as typeof fetch,
  };
  return { deps, calls, sleeps };
}

describe('Radar: leitura de HTML do concorrente (casos da auditoria)', () => {
  it('schema: tipos, sameAs, endereço, telefone, avaliação, horário, área atendida', () => {
    const s = schemaSummary(extractJsonLd(HTML_COMPETITOR_HOME));
    expect(s.types).toEqual(expect.arrayContaining(['LegalService', 'FAQPage']));
    expect(s.isLocal).toBe(true);
    expect(s.hasFaq).toBe(true);
    expect(s.rating).toEqual({ value: 4.9, count: 134 });
    expect(s.sameAs).toHaveLength(3);
    expect(s.telephone).toBe('+55 11 99999-1234');
    expect(s.address).toBe('Rua Exemplo, 100, São Paulo, SP, 01000-000');
    expect(s.openingHours).toBe(true);
    expect(s.areaServed).toEqual(['Guarulhos', 'São Paulo']);
    expect(s.geo).toBe(true);
    expect(extractJsonLd('<script type="application/ld+json">{quebrado</script>')).toEqual([]);
  });
  it('links de redes sociais da página viram perfis do concorrente; link externo comum não', () => {
    const l = extractLinks(HTML_COMPETITOR_HOME, `https://${HOST}/`);
    expect(l.social.map((x) => `${x.platform}:${x.handle}`).sort()).toEqual(['instagram:advogadoscriminalistasemsp', 'tiktok:criminalistasemsp']);
    expect(l.internal).toEqual(expect.arrayContaining([`https://${HOST}/contato/`, `https://${HOST}/sobre/`]));
    expect(l.external).toContain('outrosite.example');
    expect(l.external).not.toContain('www.instagram.com');
    expect(l.tel).toEqual(['5511999991234']);
  });
  it('tecnologias, títulos, H1, contagem de palavras, tipos de página e telefones (NAP)', () => {
    expect(detectTech(HTML_COMPETITOR_HOME)).toEqual(expect.arrayContaining(['wordpress', 'whatsapp_button']));
    expect(detectTech('<html></html>')).toEqual([]);
    const h = extractHeadings(HTML_COMPETITOR_HOME);
    expect(h).toMatchObject({ title: 'Advogados Criminalistas em SP | Plantão 24h', h1: ['Advogado criminalista 24 horas'], h2: 2 });
    expect(wordCount(HTML_SERVICE_PAGE)).toBeGreaterThan(300);
    expect(classifyPageType('https://x.com/')).toBe('home');
    expect(classifyPageType('https://x.com/blog/algo/')).toBe('artigo');
    expect(classifyPageType('https://x.com/contato/')).toBe('contato');
    expect(classifyPageType('https://x.com/sobre/')).toBe('sobre');
    expect(classifyPageType('https://x.com/servicos/depilacao/')).toBe('servico');
    expect(classifyPageType('https://x.com/advogado-criminal-na-zona-sul/')).toBe('local');
    expect(classifyPageType('https://x.com/produtos/a')).toBe('produto');
    expect(extractPhones('<p>Ligue (11) 99999-1234 ou 11 4000-1111</p>')).toEqual(['11999991234', '1140001111']);
  });
  it('cadência de atualização vem do lastmod; sitemap sem lastmod = sem dados (nunca "parado")', () => {
    const c = cadenceFromLastmods(['2026-11-10', '2026-11-01', '2026-09-01', '2025-01-01', null], NOW);
    expect(c).toMatchObject({ lastmod_count: 4, newest: '2026-11-10', newest_age_days: 10, updated_30d: 2, updated_90d: 3, updated_365d: 3 });
    expect(cadenceFromLastmods([null, null], NOW)).toMatchObject({ lastmod_count: 0, newest: null, newest_age_days: null });
  });
  it('llms.txt e autoridade estimada (Open PageRank) com a restrição de IP dita', () => {
    expect(parseLlmsTxt('# Empresa\n- a\n- b')).toEqual({ present: true, lines: 3 });
    expect(parseLlmsTxt('<html><body>404</body></html>')).toEqual({ present: false, lines: 0 });
    expect(parseLlmsTxt(null).present).toBe(false);
    expect(buildOpenPageRankUrl(['www.Exemplo.com', 'exemplo.com', 'não é domínio'])).toBe('https://openpagerank.com/api/v1.0/getPageRank?domains[]=exemplo.com');
    expect(buildOpenPageRankUrl([])).toBeNull();
    expect(parseOpenPageRank({ response: [{ status_code: 200, domain: 'exemplo.com', page_rank_decimal: 4.37, rank: '12345' }, { status_code: 404, domain: 'x.com' }] })).toEqual([{ domain: 'exemplo.com', rank: 4.37, global_rank: 12345 }]);
  });
});

describe('Radar: varredura educada do site do concorrente', () => {
  it('lê sitemap, tipos de página, schema, sameAs, NAP, tecnologias e perfis sociais, tudo com o agente genérico', async () => {
    const { deps, calls } = fakeSite();
    const scan = await scanSite(deps, HOST);
    expect(scan.status).toBe('ok');
    expect(scan.robots).toMatchObject({ state: 'ok', sitemaps: [`https://${HOST}/sitemap.xml`] });
    expect(scan.sitemap).toMatchObject({ urls: 5, declared: true });
    expect(scan.sitemap.types).toEqual({ home: 1, local: 1, artigo: 1, contato: 1, sobre: 1 });
    expect(scan.sitemap.cadence).toMatchObject({ newest: '2026-11-10', updated_30d: 2 });
    expect(scan.llms_txt.present).toBe(false);
    expect(scan.schema).toMatchObject({ isLocal: true, hasFaq: true, rating: { value: 4.9, count: 134 } });
    expect(new Set(scan.social.map((s) => s.platform))).toEqual(new Set(['instagram', 'tiktok', 'facebook', 'youtube']));
    expect(scan.tech).toEqual(expect.arrayContaining(['wordpress', 'whatsapp_button']));
    expect(scan.nap.phones).toContain('5511999991234');
    expect(scan.content.sampled).toBeGreaterThanOrEqual(4);
    expect(scan.content.words_avg).toBeGreaterThan(100);
    expect(scan.links.internal_distinct).toBeGreaterThan(0);
    // só o domínio do concorrente é visitado, com o agente genérico (sem e-mail nem endereço de pessoa)
    expect(calls.every((c) => new URL(c.url).hostname === HOST)).toBe(true);
    expect(calls.every((c) => c.ua === RADAR_UA)).toBe(true);
    expect(RADAR_UA).not.toMatch(/@|mailto|http/);
  });
  it('robots.txt proibindo tudo: não visita a página e devolve bloqueado_pelo_robots', async () => {
    const { deps, calls } = fakeSite({ [`https://${HOST}/robots.txt`]: { body: 'User-agent: *\nDisallow: /', type: 'text/plain' } });
    const scan = await scanSite(deps, HOST);
    expect(scan.status).toBe('bloqueado_pelo_robots');
    expect(scan.pages).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual([`https://${HOST}/robots.txt`]);
  });
  it('1 requisição por segundo por host: a espera entre chamadas é de 1 s', async () => {
    const { deps, sleeps } = fakeSite();
    await scanSite(deps, HOST);
    // o relógio é fixo: cada chamada seguinte ao mesmo host espera o intervalo mínimo (>= 1000 ms)
    expect(sleeps.length).toBeGreaterThan(3);
    expect(Math.min(...sleeps)).toBeGreaterThanOrEqual(1000);
  });
  it('endereço privado ou domínio que não resolve nunca é visitado', async () => {
    const { deps, calls } = fakeSite();
    const scan = await scanSite({ ...deps, lookupA: async () => ['10.0.0.5'] }, HOST);
    expect(scan.status).toBe('erro');
    expect(scan.error).toBe('robots_inacessivel'); // o robots.txt nem chega a ser lido: endereço privado é recusado antes de qualquer visita
    expect(calls).toEqual([]);
  });
  it('site sem sitemap e sem schema ainda devolve o que deu para ler (parcial, nada inventado)', async () => {
    const { deps } = fakeSite({ [`https://${HOST}/sitemap.xml`]: undefined, [`https://${HOST}/robots.txt`]: { status: 404, body: '', type: 'text/plain' }, [`https://${HOST}/`]: { body: '<html><title>Só a home</title><h1>Olá</h1><p>pouco texto</p></html>' } });
    const scan = await scanSite(deps, HOST);
    expect(scan.sitemap.urls).toBeNull();
    expect(scan.sitemap.cadence).toBeNull();
    expect(scan.schema).toBeNull();
    expect(scan.social).toEqual([]);
    expect(scan.nap.phones).toEqual([]);
    expect(scan.pages).toHaveLength(1);
  });
  it('velocidade só entra quando existe a função de medição (chave do Google); falha dela não derruba a varredura', async () => {
    const { deps } = fakeSite();
    expect((await scanSite({ ...deps, speedFn: async () => ({ score: 71, strategy: 'mobile' }) }, HOST)).speed).toEqual({ score: 71, strategy: 'mobile' });
    expect((await scanSite({ ...deps, speedFn: async () => { throw new Error('x'); } }, HOST)).speed).toBeNull();
    expect((await scanSite(deps, HOST)).speed).toBeNull();
  });
});
