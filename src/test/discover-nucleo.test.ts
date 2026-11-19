import { describe, expect, it } from 'vitest';
import type { Deps } from '../../supabase/functions/_shared/profile-analyze-core';
import { classifyHome, discoverMap, discoverPages, parsePage, sectionOf, classifySocial, PAGES_PER_CALL } from '../../supabase/functions/_shared/profile-discover-core';
import { changesFrom, synthesize } from '../../supabase/functions/_shared/profile-discover-synth';
import { FIELD_BY_KEY } from '../../supabase/functions/_shared/profile-registry';
import { buildPatch, emptyStores, validateValue } from '../../supabase/functions/_shared/profile-model';

const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);
const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'LegalService', name: 'Souza Advogados', description: 'Escritório de advocacia criminal e do consumidor.', telephone: '+55 11 4000-1234', address: { '@type': 'PostalAddress', streetAddress: 'Rua Tuiuti, 100', addressLocality: 'São Paulo', addressRegion: 'SP', postalCode: '03081-000' }, areaServed: ['Guarulhos', 'Osasco'], sameAs: ['https://www.linkedin.com/company/souza-adv'] },
  { '@type': 'WebSite', name: 'Souza Advogados' },
] });
const nav = '<nav><a href="/sobre">Sobre o escritório</a><a href="/direito-criminal">Direito Criminal</a><a href="/direito-do-consumidor">Direito do Consumidor</a><a href="/contato">Contato</a><a href="https://blog.souza.adv.br/">Blog</a></nav>';
const body = 'Advogado criminalista em São Paulo. Defesa criminal, habeas corpus e flagrante na Zona Leste, Tatuapé e Guarulhos. Direito do consumidor: golpe do Pix, negativação indevida e plano de saúde. Atendemos você e sua família com acolhimento. Mais de 15 anos de experiência. OAB/SP. '.repeat(6);
const page = (title: string, h1: string, extra = '', head = '') => `<!doctype html><html lang="pt-BR"><head><title>${title}</title><meta name="description" content="${h1} em São Paulo: atendimento humanizado com especialistas em direito, com mais de quinze anos de experiência."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://souza.adv.br/"><meta property="og:site_name" content="Souza Advogados">${head}</head><body>${nav}<h1>${h1}</h1><h2>Como podemos ajudar</h2><p>${body}</p>${extra}</body></html>`;
const HOME = page('Souza Advogados | Advocacia criminal e consumidor', 'Advocacia criminal e do consumidor', `<a href="https://wa.me/5511940001234">WhatsApp</a><a href="https://www.instagram.com/souzaadv/">Instagram</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">Compartilhar</a><footer>Souza Advogados LTDA - CNPJ 11.222.333/0001-81 - Rua Tuiuti, 100 - São Paulo - SP - CEP 03081-000</footer>`, `<script type="application/ld+json">${jsonLd}</script>`);
const sitemapIndex = '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://souza.adv.br/post-sitemap.xml</loc></sitemap><sitemap><loc>https://souza.adv.br/page-sitemap.xml</loc></sitemap><sitemap><loc>https://outro-dominio.com/x.xml</loc></sitemap></sitemapindex>';
const postSitemap = `<?xml version="1.0"?><urlset>${Array.from({ length: 30 }, (_, i) => `<url><loc>https://souza.adv.br/blog/artigo-${i}</loc><lastmod>2026-0${(i % 9) + 1}-10</lastmod></url>`).join('')}</urlset>`;
const pageSitemap = '<?xml version="1.0"?><urlset><url><loc>https://souza.adv.br/sobre</loc></url><url><loc>https://souza.adv.br/direito-criminal</loc></url><url><loc>https://souza.adv.br/direito-do-consumidor</loc></url><url><loc>https://souza.adv.br/contato</loc></url><url><loc>https://blog.souza.adv.br/dicas/pix</loc></url></urlset>';

function net(over: Record<string, Response | (() => Response)> = {}, resolve: (h: string) => string[] = () => ['93.184.216.34']) {
  const calls: string[] = [];
  const deps: Deps = {
    now: () => T0,
    lookupA: async (h) => resolve(h),
    fetchFn: (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const hit = Object.entries(over).find(([k]) => url.includes(k));
      if (hit) return typeof hit[1] === 'function' ? hit[1]() : hit[1].clone();
      const html = (t: string) => new Response(t, { status: 200, headers: { 'content-type': 'text/html' } });
      if (/robots\.txt/.test(url)) return new Response('User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://souza.adv.br/sitemap_index.xml', { status: 200, headers: { 'content-type': 'text/plain' } });
      if (/llms\.txt/.test(url)) return new Response('<html>nao</html>', { status: 404, headers: { 'content-type': 'text/html' } });
      if (/sitemap_index\.xml/.test(url)) return new Response(sitemapIndex, { status: 200, headers: { 'content-type': 'application/xml' } });
      if (/post-sitemap/.test(url)) return new Response(postSitemap, { status: 200, headers: { 'content-type': 'application/xml' } });
      if (/page-sitemap/.test(url)) return new Response(pageSitemap, { status: 200, headers: { 'content-type': 'application/xml' } });
      if (/sitemap/.test(url)) return new Response('nao', { status: 404 });
      if (/\/sobre/.test(url)) return html(page('Sobre | Souza Advogados', 'Sobre o escritório'));
      if (/direito-criminal/.test(url)) return html(page('Direito Criminal | Souza Advogados', 'Direito criminal'));
      if (/direito-do-consumidor/.test(url)) return html(page('Direito do Consumidor | Souza Advogados', 'Direito do consumidor'));
      if (/contato/.test(url)) return html(page('Contato | Souza Advogados', 'Contato'));
      return html(HOME);
    }) as typeof fetch,
  };
  return { deps, calls };
}
const SITE = { origin: 'https://souza.adv.br', host: 'souza.adv.br' };

describe('descoberta: leitura do site (núcleo)', () => {
  it('lê página inicial, robots, sitemaps em índice, estrutura e subdomínios, só do mesmo domínio', async () => {
    const { deps, calls } = net();
    const map = await discoverMap(deps, SITE);
    expect(map.homeKind).toBe('site');
    expect(map.home?.title).toContain('Souza Advogados');
    expect(map.robots.found).toBe(true);
    expect(map.robots.aiBots.GPTBot).toBe('bloqueado');
    expect(map.llms.found).toBe(false);
    expect(map.sitemap.found).toBe(true);
    expect(map.sitemap.urls).toBe(35);
    expect(map.sitemap.postUrls).toBe(30);
    expect(map.sitemap.sections[0]).toMatchObject({ section: 'blog', count: 30 });
    expect(map.subdomains).toEqual(['blog.souza.adv.br', 'souza.adv.br']);
    expect(calls.some((u) => u.includes('outro-dominio.com'))).toBe(false); // sitemap de outro domínio é ignorado
    expect(map.candidates.length).toBeGreaterThan(3);
    expect(map.candidates.every((u) => /souza\.adv\.br/.test(u))).toBe(true);
    expect(map.candidates.some((u) => /direito-criminal/.test(u))).toBe(true);
  });

  it('distingue site publicado de listagem do servidor, página padrão e página vazia', () => {
    const f = (html: string) => parsePage(html, 'https://x.com.br/', { status: 200, ttfbMs: 10, bytes: html.length });
    expect(classifyHome(f('<html><head><title>Index of /</title></head><body><h1>Index of /</h1></body></html>'))).toBe('listagem');
    expect(classifyHome(f('<html><head><title>Welcome to nginx!</title></head><body>ok</body></html>'))).toBe('padrao');
    expect(classifyHome(f('<html><head><title>Em breve</title></head><body></body></html>'))).toBe('padrao');
    expect(classifyHome(f('<html><head></head><body><div></div></body></html>'))).toBe('vazio');
    expect(classifyHome(f(HOME))).toBe('site');
  });

  it('endereço sem site vira resultado honesto: "não publicado", sem nome inventado', async () => {
    const { deps } = net({ 'souza.adv.br/': () => new Response('<html><head><title>Index of /</title></head><body><h1>Index of /</h1><table></table></body></html>', { status: 200, headers: { 'content-type': 'text/html' } }) });
    const map = await discoverMap(deps, SITE);
    expect(map.home).toBeNull();
    expect(map.homeKind).toBe('listagem');
    const d = synthesize(map, [], 0, T0);
    expect(d.siteState).toBe('nao_publicado');
    expect(d.inferences.map((i) => i.key)).toEqual(['sitestat']);
    expect(d.inferences[0].value).toBe('Em construção');
    expect(d.opportunities[0]).toMatchObject({ id: 'site_nao_publicado', severity: 'alta' });
    expect(d.gaps.map((g) => g.key)).toContain('businessName');
  });

  it('site fora do ar: tenta de novo uma vez e depois explica em português', async () => {
    let n = 0;
    const { deps } = net({ 'souza.adv.br/': () => { n++; throw new Error('boom'); } });
    const map = await discoverMap(deps, SITE);
    expect(map.home).toBeNull();
    expect(map.homeKind).toBe('fora_do_ar');
    expect(map.homeError).toMatch(/Não foi possível conectar/);
    expect(synthesize(map, [], 0, T0).siteState).toBe('fora_do_ar');
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it('segurança: endereço que resolve para rede privada nunca é visitado', async () => {
    const { deps, calls } = net({}, () => ['10.0.0.5']);
    const map = await discoverMap(deps, SITE);
    expect(map.home).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('lê páginas só do mesmo domínio, no máximo 4 por chamada, e recusa o resto', async () => {
    const { deps, calls } = net();
    const urls = ['https://souza.adv.br/sobre', 'https://souza.adv.br/contato', 'https://blog.souza.adv.br/dicas/pix', 'https://evil.com/x', 'https://souza.adv.br/direito-criminal', 'https://souza.adv.br/direito-do-consumidor'];
    const r = await discoverPages(deps, 'souza.adv.br', urls);
    expect(PAGES_PER_CALL).toBe(4);
    expect(r.pages.length + r.errors.length).toBeLessThanOrEqual(4);
    expect(calls.some((u) => u.includes('evil.com'))).toBe(false);
    const out = await discoverPages(deps, 'souza.adv.br', ['https://evil.com/x']);
    expect(out.errors[0].error).toBe('fora_do_site');
    expect(out.pages).toHaveLength(0);
  });

  it('extrai redes reais (e ignora links de compartilhar), WhatsApp, CNPJ válido, schema e menu', () => {
    const p = parsePage(HOME, 'https://souza.adv.br/', { status: 200, ttfbMs: 120, bytes: HOME.length });
    expect(p.socials).toEqual({ instagram: 'https://instagram.com/souzaadv' });
    expect(p.whatsapp[0]).toContain('wa.me/5511940001234');
    expect(p.cnpjs).toEqual(['11222333000181']);
    expect(p.jsonld[0]).toMatchObject({ types: ['LegalService'], name: 'Souza Advogados', areaServed: ['Guarulhos', 'Osasco'] });
    expect(p.nav.map((n) => n.text)).toContain('Direito Criminal');
    expect(p.ogSiteName).toBe('Souza Advogados');
    expect(classifySocial('https://www.facebook.com/sharer/sharer.php?u=x')).toBeNull();
    expect(classifySocial('https://twitter.com/intent/tweet?text=1')).toBeNull();
    expect(classifySocial('https://www.youtube.com/@canal')).toEqual({ key: 'youtube', url: 'https://youtube.com/@canal' });
    expect(sectionOf('https://x.com/2024/05/post')).toBe('(blog datado)');
    expect(sectionOf('https://x.com/')).toBe('(raiz)');
  });
});

describe('descoberta: síntese do perfil', () => {
  async function discovered() {
    const { deps } = net();
    const map = await discoverMap(deps, SITE);
    const pages = [] as Awaited<ReturnType<typeof discoverPages>>['pages'];
    for (let i = 0; i < map.candidates.length; i += PAGES_PER_CALL) pages.push(...(await discoverPages(deps, map.registrable, map.candidates.slice(i, i + PAGES_PER_CALL))).pages);
    return synthesize(map, pages, 0, T0);
  }
  const get = (d: Awaited<ReturnType<typeof discovered>>, k: string) => d.inferences.find((i) => i.key === k);

  it('descobre nome, segmento, subáreas, regiões, tipo de cliente e presença com evidência e confiança', async () => {
    const d = await discovered();
    expect(d.siteState).toBe('ok');
    expect(get(d, 'businessName')).toMatchObject({ value: 'Souza Advogados', confidence: 'alta' });
    expect(get(d, 'seg')).toMatchObject({ value: 'Advocacia', confidence: 'alta' });
    expect(String(get(d, 'sector')?.value)).toMatch(/Direito Criminal/);
    expect(String(get(d, 'sector')?.value)).toMatch(/Direito do Consumidor/);
    const regions = String(get(d, 'regions')?.value);
    expect(regions).toMatch(/São Paulo \(SP\)/);
    expect(regions).toMatch(/Guarulhos/);
    expect(regions).toMatch(/Zona Leste/);
    expect(regions.split('\n').filter((l) => /^São Paulo/.test(l))).toHaveLength(1); // sem duplicar a mesma cidade
    expect(get(d, 'tipo')?.value).toContain('B2C');
    expect(get(d, 'sitemap')?.value).toBe('yes');
    expect(get(d, 'pages')?.value).toBe('35 (sitemap)');
    expect(get(d, 'hasArticles')?.value).toBe('yes');
    expect(get(d, 'cnpj')).toMatchObject({ value: '11.222.333/0001-81', confidence: 'alta' });
    expect(get(d, 'instagram')?.value).toBe('https://instagram.com/souzaadv');
    expect(get(d, 'linkedin')?.value).toBe('https://linkedin.com/company/souza-adv');
    expect(String(get(d, 'sites')?.value)).toContain('https://blog.souza.adv.br');
    expect(d.inferences.every((i) => i.evidence.length > 0)).toBe(true);
    expect(d.structure.blog).toMatchObject({ found: true, articles: 31 }); // 30 em /blog + 1 em /dicas (subdomínio do blog)
  });

  it('só sugere valores que passam na validação oficial do Perfil e que o servidor aceitaria gravar', async () => {
    const d = await discovered();
    for (const i of d.inferences) expect(validateValue(FIELD_BY_KEY[i.key], i.value).ok, i.key).toBe(true);
    const res = buildPatch(changesFrom(d.inferences.map((i) => ({ key: i.key, value: i.value }))), false, emptyStores());
    expect(res.errors).toEqual({});
  });

  it('não inventa: o que o site não diz vira lacuna, e checagens/oportunidades vêm de medição real', async () => {
    const d = await discovered();
    expect(get(d, 'competitors')).toBeUndefined();
    expect(d.gaps.map((g) => g.key)).toEqual(expect.arrayContaining(['competitors', 'dor', 'conceito']));
    const status = Object.fromEntries(d.checks.map((c) => [c.key, c.status]));
    expect(status.sitemap).toBe('ok');
    expect(status.llms).toBe('warn');
    expect(status.robos_ia).toBe('warn');
    expect(d.opportunities.some((o) => o.id === 'ia_bloqueada')).toBe(true);
    expect(d.opportunities.some((o) => o.id === 'sem_llms')).toBe(true);
    expect(d.opportunities.some((o) => o.id === 'sem_sitemap')).toBe(false);
    const sev = d.opportunities.map((o) => o.severity);
    expect([...sev].sort((a, b) => ['alta', 'media', 'baixa', 'info'].indexOf(a) - ['alta', 'media', 'baixa', 'info'].indexOf(b))).toEqual(sev);
  });
});
