/**
 * Leitor do site para a "Descoberta do negócio" (substitui o formulário manual como primeiro contato).
 *
 * O cliente cola o endereço do site (domínio principal ou subdomínio) e o sistema LÊ o site sozinho: página inicial, robots.txt,
 * sitemaps (inclusive índices), llms.txt e uma amostra das páginas mais importantes. Só lê a internet pública, sem custo.
 *
 * Regras:
 *  - SÓ medição: tudo que sai daqui foi visto numa resposta real do site. Falhou? O campo não existe (nada é inventado).
 *  - Toda visita passa por `guardedFetch` (http/https, portas 80/443, sem IP literal, DNS público, redirecionamentos revalidados).
 *  - Só visita endereços do MESMO domínio registrável do projeto (www, blog., app. etc. contam como o mesmo site).
 *  - Texto de páginas é DADO não confiável: é só extraído e limitado; nada daqui vira instrução.
 * Tudo é injetável (`Deps`) para teste sem rede.
 */
import { errorText, guardedFetch, parseRobots, parseSafeUrl, registrableDomain, validCnpj, onlyDigits, type Deps, type Visit } from './profile-analyze-core.ts';

export const DISCOVER_VERSION = 'd1';
export const MAX_SITEMAP_FILES = 12;
export const MAX_SITEMAP_URLS = 6000;
export const MAX_CANDIDATES = 24;
export const PAGES_PER_CALL = 4;

export interface JsonLdDigest {
  types: string[];
  name?: string;
  description?: string;
  telephone?: string;
  email?: string;
  url?: string;
  logo?: string;
  priceRange?: string;
  address?: { street?: string; locality?: string; region?: string; postal?: string; country?: string };
  areaServed?: string[];
  sameAs?: string[];
  serviceType?: string[];
  knowsAbout?: string[];
  openingHours?: string[];
}

export interface PageFacts {
  url: string;
  status: number;
  title: string | null;
  description: string | null;
  ogSiteName: string | null;
  ogImage: string | null;
  themeColor: string | null;
  cssColors: string[];
  lang: string | null;
  canonical: string | null;
  noindex: boolean;
  viewport: boolean;
  h1: string[];
  h2: string[];
  hreflang: string[];
  jsonld: JsonLdDigest[];
  nav: Array<{ text: string; href: string }>;
  internalLinks: string[];
  socials: Record<string, string>;
  phones: string[];
  emails: string[];
  whatsapp: string[];
  maps: string[];
  cnpjs: string[];
  ceps: string[];
  generator: string | null;
  stack: string[];
  words: number;
  excerpt: string;
  ttfbMs: number;
  bytes: number;
}

export interface SitemapSection { section: string; count: number; latest: string | null; sample: string[] }
export type HomeKind = 'site' | 'listagem' | 'padrao' | 'vazio' | 'fora_do_ar';
export interface SiteMapResult {
  version: string;
  homeKind: HomeKind;
  origin: string;
  host: string;
  registrable: string;
  home: PageFacts | null;
  homeError: string | null;
  robots: { found: boolean; sitemaps: string[]; disallowAll: boolean; aiBots: Record<string, string> };
  llms: { found: boolean; url: string };
  sitemap: {
    found: boolean;
    files: Array<{ url: string; kind: string; count: number }>;
    urls: number;
    truncated: boolean;
    sections: SitemapSection[];
    hosts: Record<string, number>;
    newest: string | null;
    withLastmod: number;
    postUrls: number;
  };
  candidates: string[];
  subdomains: string[];
  elapsedMs: number;
}
export interface PageError { url: string; error: string }

// ------------------------------------------------------------------------------------------------------------ texto e HTML
const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—', '&hellip;': '…' };
export const decode = (s: string): string =>
  s.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|ndash|mdash|hellip);/g, (m) => ENT[m] || m)
    .replace(/&#(\d{2,5});/g, (_m, n) => { const c = Number(n); return c > 31 && c < 65536 ? String.fromCharCode(c) : ' '; })
    .replace(/&#x([0-9a-f]{2,4});/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)));
const squash = (s: string) => decode(s).replace(/\s+/g, ' ').trim();
const stripTags = (s: string) => squash(s.replace(/<[^>]*>/g, ' '));
const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const uniq = <T>(list: T[], max: number): T[] => [...new Set(list)].slice(0, max);

function visibleText(html: string): string {
  return squash(html
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|br)>/gi, '\n')
    .replace(/<[^>]*>/g, ' '));
}

const SOCIAL_HOSTS: Array<[string, string[]]> = [
  ['instagram', ['instagram.com']], ['facebook', ['facebook.com', 'fb.com']], ['linkedin', ['linkedin.com']], ['tiktok', ['tiktok.com']],
  ['youtube', ['youtube.com', 'youtu.be']], ['x', ['x.com', 'twitter.com']], ['kwai', ['kwai.com', 'kw.ai']],
];
const SOCIAL_NOISE = /(sharer|share\.php|intent\/|\/share|shareArticle|\/dialog\/|\/plugins\/|\/tr\?|login|\/hashtag\/|\/explore\/|\/watch\?|\/embed\/|\/p\/|\/reel\/|\/status\/|\/posts\/|\/videos\/|\/video\/)/i;
export function classifySocial(rawUrl: string): { key: string; url: string } | null {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|pt-br|br|web)\./, '');
  for (const [key, hosts] of SOCIAL_HOSTS) {
    if (!hosts.some((h) => host === h)) continue;
    if (SOCIAL_NOISE.test(u.pathname + u.search)) return null;
    const path = u.pathname.replace(/\/+$/, '');
    if (!path || path === '/') return null;
    if (key === 'youtube' && !/^\/(@|c\/|channel\/|user\/)/.test(path)) return null;
    if (key === 'linkedin' && !/^\/(company|in|school|showcase)\//.test(path)) return null;
    if (key === 'facebook' && /^\/(profile\.php)?$/.test(path) && !u.search.includes('id=')) return null;
    return { key, url: `https://${host === 'youtu.be' ? 'youtube.com' : host.replace(/^youtu\.be$/, 'youtube.com')}${path}${key === 'facebook' && path === '/profile.php' ? u.search : ''}`.slice(0, 300) };
  }
  return null;
}

const GENERIC_NAV = /^(home|início|inicio|menu|buscar|pesquisar|search|ver mais|leia mais|saiba mais|clique aqui|entrar|login|voltar|próximo|anterior|skip to content|ir para o conteúdo|fechar|abrir)$/i;

// ------------------------------------------------------------------------------------------------------------ JSON-LD
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v: unknown, max = 300): string | undefined => (typeof v === 'string' && v.trim() ? squash(v).slice(0, max) : undefined);
function nodeNames(v: unknown): string[] {
  return asArray(v).map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x ? str((x as Record<string, unknown>).name) : undefined)).filter((x): x is string => !!x).map((x) => x.slice(0, 120));
}
export function digestJsonLd(html: string): JsonLdDigest[] {
  const out: JsonLdDigest[] = [];
  for (const m of [...html.matchAll(/<script\b[^>]{0,300}type\s*=\s*["']?application\/ld\+json["']?[^>]{0,300}>([\s\S]*?)<\/script>/gi)].slice(0, 12)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const root = data as Record<string, unknown>;
    const nodes: unknown[] = Array.isArray(data) ? data : Array.isArray(root?.['@graph']) ? (root['@graph'] as unknown[]) : [data];
    for (const raw of nodes.slice(0, 40)) {
      if (!raw || typeof raw !== 'object') continue;
      const n = raw as Record<string, unknown>;
      const types = asArray(n['@type']).filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 40));
      if (!types.length) continue;
      const addr = (n.address && typeof n.address === 'object' ? (Array.isArray(n.address) ? n.address[0] : n.address) : null) as Record<string, unknown> | null;
      const logo = typeof n.logo === 'string' ? n.logo : typeof n.logo === 'object' && n.logo ? str((n.logo as Record<string, unknown>).url) : undefined;
      out.push({
        types,
        name: str(n.name, 160),
        description: str(n.description, 400),
        telephone: str(n.telephone, 40),
        email: str(n.email, 120),
        url: str(n.url, 300),
        logo: logo && /^https:\/\//i.test(logo) ? logo.slice(0, 400) : undefined,
        priceRange: str(n.priceRange, 40),
        address: addr ? { street: str(addr.streetAddress, 160), locality: str(addr.addressLocality, 80), region: str(addr.addressRegion, 40), postal: str(addr.postalCode, 20), country: str(typeof addr.addressCountry === 'object' ? (addr.addressCountry as Record<string, unknown>)?.name : addr.addressCountry, 40) } : undefined,
        areaServed: nodeNames(n.areaServed).slice(0, 20),
        sameAs: asArray(n.sameAs).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 300)).slice(0, 20),
        serviceType: [...nodeNames(n.serviceType), ...nodeNames(n.knowsAbout)].slice(0, 20),
        knowsAbout: nodeNames(n.knowsAbout).slice(0, 20),
        openingHours: asArray(n.openingHours).filter((x): x is string => typeof x === 'string').slice(0, 7),
      });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------ página
export function parsePage(html: string, finalUrl: string, meta: { status: number; ttfbMs: number; bytes: number }): PageFacts {
  const base = new URL(finalUrl);
  const reg = registrableDomain(base.hostname);
  const tags = html.match(/<meta\b[^>]{0,700}>/gi)?.slice(0, 100) || [];
  const meta1 = (key: string, by: 'name' | 'property' = 'name'): string | null => {
    for (const t of tags) if ((attr(t, by) || '').toLowerCase() === key) { const c = attr(t, 'content'); if (c) return squash(c); }
    return null;
  };
  const links = html.match(/<link\b[^>]{0,500}>/gi)?.slice(0, 120) || [];
  const canonical = links.find((t) => (attr(t, 'rel') || '').toLowerCase() === 'canonical');
  const hreflang = uniq(links.filter((t) => (attr(t, 'rel') || '').toLowerCase() === 'alternate' && attr(t, 'hreflang')).map((t) => (attr(t, 'hreflang') || '').toLowerCase()), 12);
  const title = /<title[^>]{0,200}>([\s\S]{0,400}?)<\/title>/i.exec(html)?.[1];
  const htmlTag = /<html\b[^>]{0,400}>/i.exec(html)?.[0] || '';
  const heads = (tag: 'h1' | 'h2', max: number) => uniq([...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map((m) => stripTags(m[1]).slice(0, 160)).filter(Boolean), max);

  // links
  const internal: string[] = [];
  const socials: Record<string, string> = {};
  const phones: string[] = [];
  const emails: string[] = [];
  const whatsapp: string[] = [];
  const maps: string[] = [];
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 1500);
  const hrefOf = new Map<string, string>();
  for (const a of anchors) {
    const href = attr(a[1], 'href');
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;
    if (/^tel:/i.test(href)) { phones.push(href.slice(4).replace(/[^\d+]/g, '').slice(0, 20)); continue; }
    if (/^mailto:/i.test(href)) { emails.push(href.slice(7).split('?')[0].toLowerCase().slice(0, 120)); continue; }
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    const h = u.hostname.toLowerCase();
    if (h === 'wa.me' || h === 'api.whatsapp.com' || h === 'web.whatsapp.com' || h.endsWith('whatsapp.com')) { whatsapp.push(`${u.origin}${u.pathname}`.slice(0, 120) + (u.searchParams.get('phone') ? `?phone=${u.searchParams.get('phone')}` : '')); continue; }
    if (h === 'maps.app.goo.gl' || h === 'g.page' || h === 'goo.gl' || (h.endsWith('google.com') && /^\/maps/.test(u.pathname)) || h === 'share.google') { maps.push(u.href.slice(0, 300)); continue; }
    const soc = classifySocial(u.href);
    if (soc) { if (!socials[soc.key]) socials[soc.key] = soc.url; continue; }
    if (registrableDomain(h) === reg) {
      u.hash = '';
      const clean = u.href.replace(/\?.*$/, '');
      if (!/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?|css|js|xml|ico)$/i.test(u.pathname) && !/\/(wp-admin|wp-login|wp-json|feed|xmlrpc|cart|checkout|minha-conta|my-account|login|cdn-cgi)\b/i.test(u.pathname)) {
        internal.push(clean.slice(0, 300));
        hrefOf.set(a[0], clean);
      }
    }
  }
  // menu: links dentro de <nav>/<header> com texto curto
  const nav: Array<{ text: string; href: string }> = [];
  const navBlocks = [...html.matchAll(/<(nav|header)\b[\s\S]*?<\/\1>/gi)].slice(0, 6);
  for (const block of navBlocks) {
    for (const a of [...block[0].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 80)) {
      const href = attr(a[1], 'href');
      const text = stripTags(a[2]).slice(0, 60);
      if (!href || !text || text.length < 3 || GENERIC_NAV.test(text) || /^(#|javascript:|tel:|mailto:)/i.test(href)) continue;
      let u: URL;
      try { u = new URL(href, base); } catch { continue; }
      if (registrableDomain(u.hostname) !== reg) continue;
      u.hash = '';
      if (!nav.some((n) => n.text.toLowerCase() === text.toLowerCase())) nav.push({ text, href: u.href.replace(/\?.*$/, '').slice(0, 300) });
      if (nav.length >= 40) break;
    }
  }

  const text = visibleText(html);
  const words = text ? text.split(' ').length : 0;
  const cnpjRaw = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || [];
  const cnpjs = uniq(cnpjRaw.map(onlyDigits).filter((c) => validCnpj(c)), 3);
  const ceps = uniq((text.match(/\b\d{5}-\d{3}\b/g) || []), 5);
  const phoneText = (text.match(/(?:\(\d{2}\)\s?|\b\d{2}\s)9?\d{4}[-\s]?\d{4}\b/g) || []).map((p) => p.replace(/[^\d]/g, ''));

  const generator = meta1('generator');
  const stack: string[] = [];
  const low = html.slice(0, 400_000).toLowerCase();
  if (/wp-content\/|wp-includes\/|wordpress/.test(low) || /wordpress/i.test(generator || '')) stack.push('WordPress');
  if (/elementor/.test(low)) stack.push('Elementor');
  if (/cdn\.shopify\.com|shopify/.test(low)) stack.push('Shopify');
  if (/wixstatic\.com|wix\.com/.test(low) || /wix/i.test(generator || '')) stack.push('Wix');
  if (/squarespace/.test(low)) stack.push('Squarespace');
  if (/__next_data__|_next\/static/.test(low)) stack.push('Next.js');
  if (/webflow/.test(low)) stack.push('Webflow');
  if (/rank math|rank-math/.test(low)) stack.push('Rank Math');
  if (/yoast/.test(low)) stack.push('Yoast SEO');
  if (/gtag\(|googletagmanager\.com\/gtm\.js|googletagmanager\.com\/gtag/.test(low)) stack.push('Google Tag/Analytics');
  if (/connect\.facebook\.net\/.*fbevents|fbq\(/.test(low)) stack.push('Pixel da Meta');

  // cores do tema (só as declaradas no próprio HTML; folhas de estilo externas não são baixadas)
  const cssColors: string[] = [];
  for (const m of html.slice(0, 300_000).matchAll(/--[\w-]*(?:primary|accent|brand|main|secondary)[\w-]*\s*:\s*(#[0-9a-f]{3,8})\b/gi)) {
    const hex = normalizeHex(m[1]);
    if (hex && !cssColors.includes(hex)) cssColors.push(hex);
    if (cssColors.length >= 4) break;
  }

  return {
    url: finalUrl,
    status: meta.status,
    title: title ? squash(title).slice(0, 200) : null,
    description: (() => { const d = meta1('description') || meta1('og:description', 'property'); return d ? d.slice(0, 400) : null; })(),
    ogSiteName: meta1('og:site_name', 'property')?.slice(0, 120) ?? null,
    ogImage: (() => { const i = meta1('og:image', 'property'); return i && /^https:\/\//i.test(i) ? i.slice(0, 400) : null; })(),
    themeColor: (() => { const c = meta1('theme-color'); return c ? normalizeHex(c) : null; })(),
    cssColors,
    lang: htmlTag ? (attr(htmlTag, 'lang') || null) : null,
    canonical: canonical ? (attr(canonical, 'href') || '').slice(0, 300) || null : null,
    noindex: /\bnoindex\b/.test((meta1('robots') || '').toLowerCase()),
    viewport: meta1('viewport') !== null,
    h1: heads('h1', 4),
    h2: heads('h2', 14),
    hreflang,
    jsonld: digestJsonLd(html),
    nav,
    internalLinks: uniq(internal, 120),
    socials,
    phones: uniq([...phones, ...phoneText].filter((p) => p.length >= 8), 6),
    emails: uniq(emails, 6),
    whatsapp: uniq(whatsapp, 4),
    maps: uniq(maps, 3),
    cnpjs,
    ceps,
    generator: generator ? generator.slice(0, 80) : null,
    stack,
    words,
    excerpt: text.slice(0, 2400),
    ttfbMs: meta.ttfbMs,
    bytes: meta.bytes,
  };
}

export function normalizeHex(raw: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.slice(0, 6)}`;
}

// ------------------------------------------------------------------------------------------------------------ sitemap
interface SitemapEntry { loc: string; lastmod: string | null }
function parseSitemapXml(xml: string): { kind: 'index' | 'urls'; entries: SitemapEntry[] } {
  const isIndex = /<sitemapindex\b/i.test(xml.slice(0, 6000));
  const entries: SitemapEntry[] = [];
  const re = isIndex ? /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi : /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  for (const m of xml.matchAll(re)) {
    const loc = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/i.exec(m[1])?.[1];
    if (!loc) continue;
    const lm = /<lastmod>\s*([^<\s]+)/i.exec(m[1])?.[1] || null;
    entries.push({ loc: decode(loc), lastmod: lm && /^\d{4}-\d{2}-\d{2}/.test(lm) ? lm.slice(0, 10) : null });
    if (entries.length >= MAX_SITEMAP_URLS) break;
  }
  return { kind: isIndex ? 'index' : 'urls', entries };
}
const fileKind = (url: string): string => {
  const f = url.toLowerCase();
  if (/post|article|artigo|blog|news|noticia/.test(f)) return 'posts';
  if (/page|pagina/.test(f)) return 'paginas';
  if (/categor|tag|taxonom/.test(f)) return 'categorias';
  if (/product|produto/.test(f)) return 'produtos';
  if (/author|autor/.test(f)) return 'autores';
  return 'outros';
};

/** primeira parte do caminho; "(raiz)" para a página inicial; ano/mês de blog datado vira "(blog datado)". */
export function sectionOf(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return '(outros)'; }
  const segs = u.pathname.split('/').filter(Boolean);
  if (!segs.length) return '(raiz)';
  if (/^(19|20)\d{2}$/.test(segs[0]) && segs[1] && /^\d{1,2}$/.test(segs[1])) return '(blog datado)';
  return decodeURIComponent(segs[0]).toLowerCase().slice(0, 40);
}

const PRIORITY_PATH = /(sobre|quem-somos|institucional|empresa|historia|about|servico|servicos|solucoes|atuacao|areas?-de|especialidade|tratamento|procedimento|contato|fale|equipe|time|profission|advogad|doutor|medic|planos?|precos?|valores|orcamento|faq|duvidas|depoimento|case|portfolio|projetos|unidades?|onde-estamos|localizacao|atendimento)/i;
const NOISE_PATH = /\/(tag|category|categoria|author|autor|page|feed|wp-json|politica|privacidade|termos|cookies|obrigado|thank|404|search|busca)(\/|$)/i;

function pickCandidates(origin: string, reg: string, home: PageFacts | null, sections: SitemapSection[], sitemapUrls: SitemapEntry[]): string[] {
  const scored = new Map<string, number>();
  const add = (url: string, score: number) => {
    let u: URL;
    try { u = new URL(url); } catch { return; }
    if (registrableDomain(u.hostname) !== reg) return;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|xml)$/i.test(u.pathname)) return;
    u.hash = ''; u.search = '';
    const key = u.href.replace(/\/$/, '');
    if (key === origin.replace(/\/$/, '') || key === `${origin.replace(/\/$/, '')}`) return;
    if (NOISE_PATH.test(u.pathname)) score -= 6;
    const depth = u.pathname.split('/').filter(Boolean).length;
    score -= Math.max(0, depth - 1);
    scored.set(key, Math.max(scored.get(key) ?? -99, score));
  };
  for (const n of home?.nav || []) add(n.href, 8 + (PRIORITY_PATH.test(n.href) ? 4 : 0));
  for (const l of home?.internalLinks || []) add(l, 3 + (PRIORITY_PATH.test(l) ? 5 : 0));
  for (const e of sitemapUrls) if (PRIORITY_PATH.test(e.loc)) add(e.loc, 6);
  // 1 a 2 páginas recentes de cada seção grande, para conhecer o conteúdo
  for (const s of sections.slice(0, 10)) for (const [i, u] of s.sample.slice(0, 2).entries()) add(u, 5 - i);
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, MAX_CANDIDATES);
}

// ------------------------------------------------------------------------------------------------------------ site não publicado
const DEFAULT_TITLES = [/^index of \//i, /welcome to nginx/i, /apache2? .{0,40}default page/i, /^it works!?$/i, /test page for the apache/i, /default web site page/i, /^iis windows server$/i, /^domain default page$/i, /^coming soon$/i, /^em breve$/i, /^site em construcao$/i, /^site em construção$/i, /^under construction$/i, /^parked domain$/i, /dominio registrado|domínio registrado|this domain is for sale|domain for sale|este dominio esta a venda/i, /^403 forbidden$/i, /^404 not found$/i, /^welcome to wordpress$/i];
/** Distingue um site de verdade de uma listagem de arquivos, página padrão do servidor, "em breve" ou página vazia. */
export function classifyHome(p: PageFacts): HomeKind {
  const t = (p.title || '').trim();
  if (/^index of \//i.test(t)) return 'listagem';
  if (DEFAULT_TITLES.some((re) => re.test(t))) return 'padrao';
  if (p.words < 25 && p.nav.length === 0 && p.internalLinks.length < 2 && !p.description) return 'vazio';
  return 'site';
}
export const HOME_KIND_TEXT: Record<HomeKind, string> = {
  site: 'Site publicado.',
  listagem: 'O endereço mostra só a listagem de arquivos do servidor: não há site publicado nele.',
  padrao: 'O endereço mostra a página padrão do servidor ou de "em breve": o site ainda não foi publicado.',
  vazio: 'A página inicial está praticamente vazia: o site ainda não tem conteúdo.',
  fora_do_ar: 'O site não respondeu.',
};

// ------------------------------------------------------------------------------------------------------------ leitura do mapa do site
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'falha');

/** A página inicial é a leitura mais importante: se o servidor demorar ou falhar uma vez, tenta de novo com mais paciência. */
async function fetchHome(deps: Deps, url: string): Promise<Visit> {
  try { return await guardedFetch(deps, url, { maxBytes: 600 * 1024, timeoutMs: 12_000 }); }
  catch (e) {
    if (!['tempo_esgotado', 'falha_de_rede'].includes(errMsg(e))) throw e;
    return await guardedFetch(deps, url, { maxBytes: 600 * 1024, timeoutMs: 20_000 });
  }
}

export async function discoverMap(deps: Deps, site: { origin: string; host: string }): Promise<SiteMapResult> {
  const started = deps.now();
  const reg = registrableDomain(site.host);
  const result: SiteMapResult = {
    version: DISCOVER_VERSION, homeKind: 'fora_do_ar', origin: site.origin, host: site.host, registrable: reg,
    home: null, homeError: null,
    robots: { found: false, sitemaps: [], disallowAll: false, aiBots: {} },
    llms: { found: false, url: `${site.origin}/llms.txt` },
    sitemap: { found: false, files: [], urls: 0, truncated: false, sections: [], hosts: {}, newest: null, withLastmod: 0, postUrls: 0 },
    candidates: [], subdomains: [], elapsedMs: 0,
  };

  const [homeR, robotsR, llmsR] = await Promise.allSettled([
    fetchHome(deps, `${site.origin}/`),
    guardedFetch(deps, `${site.origin}/robots.txt`, { maxBytes: 256 * 1024, timeoutMs: 8000, accept: 'text/plain,*/*;q=0.5' }),
    guardedFetch(deps, `${site.origin}/llms.txt`, { maxBytes: 128 * 1024, timeoutMs: 8000, accept: 'text/plain,text/markdown,*/*;q=0.5' }),
  ]);

  if (homeR.status === 'fulfilled') {
    const v = homeR.value;
    if (v.status >= 200 && v.status < 400 && /<html|<head|<body/i.test(v.text.slice(0, 5000))) {
      const facts = parsePage(v.text, v.finalUrl, { status: v.status, ttfbMs: v.ttfbMs, bytes: v.bytes });
      result.homeKind = classifyHome(facts);
      if (result.homeKind === 'site') result.home = facts;
      else result.homeError = HOME_KIND_TEXT[result.homeKind];
    } else result.homeError = `O site respondeu ${v.status}.`;
  } else result.homeError = `${errorText(errMsg(homeR.reason))} Se o site está no ar, tente de novo em instantes.`;

  if (robotsR.status === 'fulfilled') {
    const v = robotsR.value;
    if (v.status === 200 && !/html/i.test(v.headers.get('content-type') || '')) {
      const r = parseRobots(v.text);
      result.robots = { found: true, sitemaps: r.sitemaps, disallowAll: r.disallowAll, aiBots: r.aiBots };
    }
  }
  if (llmsR.status === 'fulfilled') {
    const v = llmsR.value;
    result.llms.found = v.status === 200 && !/html/i.test(v.headers.get('content-type') || '') && v.text.trim().length > 20;
  }

  // sitemaps: os declarados no robots + os endereços comuns
  const sameSite = (u: string) => { try { return registrableDomain(new URL(u).hostname) === reg; } catch { return false; } };
  const queue = uniq([...result.robots.sitemaps.filter(sameSite), `${site.origin}/sitemap.xml`, `${site.origin}/sitemap_index.xml`, `${site.origin}/wp-sitemap.xml`], 8);
  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];
  let reads = 0;
  while (queue.length && reads < MAX_SITEMAP_FILES && entries.length < MAX_SITEMAP_URLS) {
    const url = queue.shift() as string;
    if (seen.has(url)) continue;
    seen.add(url);
    reads++;
    try {
      const v = await guardedFetch(deps, url, { maxBytes: 3 * 1024 * 1024, timeoutMs: 12_000, accept: 'application/xml,text/xml,*/*;q=0.5' });
      if (v.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(v.text.slice(0, 6000))) continue;
      const parsed = parseSitemapXml(v.text);
      result.sitemap.found = true;
      if (v.truncated) result.sitemap.truncated = true;
      if (parsed.kind === 'index') {
        for (const e of parsed.entries) if (sameSite(e.loc) && !seen.has(e.loc)) queue.push(e.loc);
      } else {
        result.sitemap.files.push({ url, kind: fileKind(url), count: parsed.entries.length });
        entries.push(...parsed.entries.filter((e) => sameSite(e.loc)));
        if (fileKind(url) === 'posts') result.sitemap.postUrls += parsed.entries.length;
      }
    } catch (_e) { /* tenta o próximo */ }
  }
  if (entries.length >= MAX_SITEMAP_URLS || queue.length) result.sitemap.truncated = true;

  // estrutura
  const bySection = new Map<string, { count: number; latest: string | null; urls: Array<{ loc: string; lastmod: string | null }> }>();
  const hosts: Record<string, number> = {};
  let newest: string | null = null;
  let withLastmod = 0;
  for (const e of entries) {
    const s = sectionOf(e.loc);
    const g = bySection.get(s) || { count: 0, latest: null, urls: [] };
    g.count++;
    g.urls.push(e);
    if (e.lastmod) { withLastmod++; if (!g.latest || e.lastmod > g.latest) g.latest = e.lastmod; if (!newest || e.lastmod > newest) newest = e.lastmod; }
    bySection.set(s, g);
    try { const h = new URL(e.loc).hostname.toLowerCase(); hosts[h] = (hosts[h] || 0) + 1; } catch { /* ignora */ }
  }
  result.sitemap.urls = entries.length;
  result.sitemap.newest = newest;
  result.sitemap.withLastmod = withLastmod;
  result.sitemap.hosts = hosts;
  result.sitemap.sections = [...bySection.entries()].map(([section, g]) => ({
    section, count: g.count, latest: g.latest,
    sample: g.urls.slice().sort((a, b) => (b.lastmod || '').localeCompare(a.lastmod || '')).slice(0, 3).map((x) => x.loc),
  })).sort((a, b) => b.count - a.count).slice(0, 25);

  // subdomínios: do sitemap e dos links da página inicial
  const subs = new Set<string>(Object.keys(hosts));
  for (const l of result.home?.internalLinks || []) { try { subs.add(new URL(l).hostname.toLowerCase()); } catch { /* ignora */ } }
  subs.add(site.host);
  result.subdomains = [...subs].filter((h) => registrableDomain(h) === reg).sort();

  result.candidates = pickCandidates(site.origin, reg, result.home, result.sitemap.sections, entries);
  result.elapsedMs = deps.now() - started;
  return result;
}

// ------------------------------------------------------------------------------------------------------------ leitura de páginas
export async function discoverPages(deps: Deps, reg: string, urls: string[]): Promise<{ pages: PageFacts[]; errors: PageError[] }> {
  const pages: PageFacts[] = [];
  const errors: PageError[] = [];
  const wanted = uniq(urls, PAGES_PER_CALL);
  await Promise.all(wanted.map(async (raw) => {
    const parsed = parseSafeUrl(raw);
    if ('error' in parsed || registrableDomain(parsed.url.hostname) !== reg) { errors.push({ url: raw.slice(0, 300), error: 'fora_do_site' }); return; }
    try {
      const v = await guardedFetch(deps, parsed.url.href, { maxBytes: 500 * 1024, timeoutMs: 9000 });
      if (registrableDomain(new URL(v.finalUrl).hostname) !== reg) { errors.push({ url: raw.slice(0, 300), error: 'redirecionou_para_fora' }); return; }
      if (v.status < 200 || v.status >= 400) { errors.push({ url: raw.slice(0, 300), error: `http_${v.status}` }); return; }
      if (!/<html|<head|<body/i.test(v.text.slice(0, 5000))) { errors.push({ url: raw.slice(0, 300), error: 'nao_e_pagina' }); return; }
      pages.push(parsePage(v.text, v.finalUrl, { status: v.status, ttfbMs: v.ttfbMs, bytes: v.bytes }));
    } catch (e) {
      errors.push({ url: raw.slice(0, 300), error: errMsg(e).slice(0, 60) });
    }
  }));
  return { pages, errors };
}
