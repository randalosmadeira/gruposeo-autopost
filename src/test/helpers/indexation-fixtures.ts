/**
 * Respostas GRAVADAS (sintéticas, copiadas do formato real) para os testes da Indexação. NENHUMA chamada de rede real nos testes.
 * Casos reais da auditoria da RDM (20/11/2026) + um site em inglês (.com), um multilíngue com hreflang e um em espanhol, para provar que nada supõe Brasil.
 */
import { gzipSync } from 'node:zlib';

// O jsdom não tem AbortSignal.timeout (o Deno das funções e o Node têm). Polyfill só para os testes: o código de produção não muda.
if (typeof AbortSignal.timeout !== 'function') {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (ms: number) => { const c = new AbortController(); setTimeout(() => c.abort(), ms).unref?.(); return c.signal; };
}

export const html = (o: { title?: string; canonical?: string | null; robots?: string; lang?: string; body?: string; hreflang?: Array<[string, string]> } = {}): string =>
  `<!doctype html><html lang="${o.lang ?? 'pt-BR'}"><head><meta charset="utf-8"><title>${o.title ?? 'Página'}</title>${o.canonical === null ? '' : `<link rel="canonical" href="${o.canonical ?? ''}">`}${o.robots ? `<meta name="robots" content="${o.robots}">` : ''}${(o.hreflang || []).map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${h}">`).join('')}<script>window.x=1</script></head><body><main>${o.body ?? 'Conteúdo da página com texto suficiente para comparar.'}</main></body></html>`;

export const urlset = (items: Array<string | [string, string | null]>, extra = ''): string =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${items.map((i) => { const [loc, lm] = Array.isArray(i) ? i : [i, null]; return `<url><loc>${loc}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}${extra}</url>`; }).join('')}</urlset>`;
export const sitemapIndex = (children: Array<string | [string, string]>): string =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children.map((c) => { const [loc, lm] = Array.isArray(c) ? c : [c, null]; return `<sitemap><loc>${loc}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</sitemap>`; }).join('')}</sitemapindex>`;
export const gz = (xml: string): Uint8Array => new Uint8Array(gzipSync(Buffer.from(xml, 'utf-8')));

export type Route = Response | ((c: Call) => Response | Promise<Response>) | Error;
export interface Call { url: string; method: string; ua: string; body?: string }

/** Internet de mentira: URL exata -> resposta. O que não está na tabela é 404. Erro na tabela vira falha de rede (ex.: certificado inválido). */
export function fakeWeb(routes: Record<string, Route | string>, opts: { dns?: (host: string) => string[]; fallback?: (url: string, call?: Call) => Route | string | undefined } = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers as HeadersInit);
    const call: Call = { url, method: init?.method || 'GET', ua: headers.get('user-agent') || '', body: typeof init?.body === 'string' ? init.body : undefined };
    calls.push(call);
    const r = routes[url] ?? opts.fallback?.(url, call);
    if (r === undefined) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    if (r instanceof Error) throw r;
    if (typeof r === 'string') return new Response(r, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    const res = typeof r === 'function' ? await r(call) : r;
    // cópia nova a cada chamada (um corpo é lido uma vez só; clonar deixaria o stream "tee" esperando o outro ramo)
    const buf = await res.clone().arrayBuffer();
    return new Response(buf.byteLength ? buf : null, { status: res.status, headers: res.headers });
  }) as typeof fetch;
  return {
    calls, sleeps, fetchFn,
    deps: { now: () => Date.UTC(2026, 10, 20, 12, 0, 0), lookupA: async (h: string) => (opts.dns ? opts.dns(h) : ['93.184.216.34']), sleep: async (ms: number) => { sleeps.push(ms); } },
  };
}
export const ok = (body: string, type = 'text/html; charset=utf-8', extra: Record<string, string> = {}) => new Response(body, { status: 200, headers: { 'content-type': type, ...extra } });
export const xml = (body: string) => ok(body, 'application/xml');
export const text = (body: string) => ok(body, 'text/plain');
export const bin = (b: Uint8Array) => new Response(b as BodyInit, { status: 200, headers: { 'content-type': 'application/gzip' } });
export const redirect = (to: string, status = 301) => new Response(null, { status, headers: { location: to } });
export const status = (code: number) => new Response('x', { status: code });
export const certError = () => Object.assign(new TypeError('fetch failed'), { cause: new Error('invalid peer certificate: UnknownIssuer') });

// ------------------------------------------------------------------------------------------------------------ RDM (casos reais da auditoria)
const H = 'https://rdmadvogados.com.br';
export const HUB_HTML = html({ title: 'Advogado Criminalista em São Paulo | RDM', canonical: `${H}/advogado-criminalista/`, body: 'Atuação criminal em todas as regiões. Hub das áreas e regiões atendidas pela RDM Advogados, com texto institucional longo.' });
export const TATUAPE_HTML = html({ title: 'Advogado Criminalista no Tatuapé | RDM', canonical: `${H}/advogado-criminalista/tatuape/`, body: 'Página própria do Tatuapé: delegacias, fóruns, plantão e atendimento local com conteúdo exclusivo desta região.' });
export const NOTFOUND_HTML = html({ title: 'Página não encontrada | RDM', canonical: `${H}/direito-criminal/`, robots: 'noindex', body: 'Erro 404: a página não foi encontrada.' });

/** Rotas da RDM: /advogado-criminalista/<qualquer> responde 200 com o hub (soft-404); /direito-criminal/<qualquer> responde 404 de verdade. */
export function rdmRoutes(): Record<string, Route | string> {
  const r: Record<string, Route | string> = {
    [`${H}/robots.txt`]: text('User-agent: *\nDisallow: /wp-admin/\nDisallow: /privado/\nSitemap: https://rdmadvogados.com.br/sitemap-index.xml\nSitemap: https://rdmadvogados.com.br/blog/sitemap_index.xml\n'),
    [`${H}/`]: ok(html({ title: 'RDM Advogados', canonical: `${H}/`, body: 'Home da RDM Advogados com bastante conteúdo institucional.' })),
    [`${H}/advogado-criminalista/`]: ok(HUB_HTML),
    [`${H}/advogado-criminalista/tatuape/`]: ok(TATUAPE_HTML),
    [`${H}/direito-criminal/`]: ok(html({ title: 'Direito Criminal | RDM', canonical: `${H}/direito-criminal/`, body: 'Hub de direito criminal.' })),
    [`${H}/links/`]: ok(html({ title: 'Links | RDM', canonical: `${H}/links/`, body: 'Página de links (bio).' })),
  };
  return r;
}
/** Qualquer subcaminho de /advogado-criminalista/ devolve o hub com status 200 (a falha real encontrada na auditoria: soft-404). */
export const rdmFallback = (url: string): Route | undefined => (url.startsWith(`${H}/advogado-criminalista/`) && !url.includes('/tatuape/') ? ok(HUB_HTML) : undefined);
