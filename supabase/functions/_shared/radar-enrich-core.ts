/**
 * Radar de Mercado, enriquecimento do concorrente: varredura LEVE e EDUCADA do site (nada de login, nada de formulário, nada de e-mail pessoal).
 *
 *  - rede pela mesma camada educada da Indexação (indexation-crawl): http/https, sem IP literal, DNS público, redirecionamentos revalidados,
 *    robots.txt respeitado, 1 requisição por segundo por host, agente genérico `ZicaAI-Radar/1.0` (sem e-mail e sem endereço de pessoa);
 *  - SÓ o domínio do concorrente achado na busca é visitado (host autorizado = o próprio domínio registrável dele);
 *  - lê: sitemap e tamanho, tipos de página, título/H1, schema (tipos, sameAs, nota/avaliações, endereço, telefone), tecnologias, llms.txt, cadência de
 *    atualização (lastmod), profundidade de conteúdo, estrutura de links internos e links de redes sociais (perfis do concorrente);
 *  - autoridade estimada: Open PageRank (gratuito, com a restrição de IP do plano) e Common Crawl (tabela pré-carregada; não consultamos o grafo ao vivo).
 * Tudo que é pura leitura de HTML é testado com respostas gravadas.
 */
import { makeCrawler, politeGet, robotsFor, walkSitemaps, type CrawlDeps } from './indexation-crawl.ts';
import { projectHosts, visibleText } from './indexation-core.ts';
import { classifySocialUrl, type SocialRef } from './radar-social-core.ts';
import { digits } from './radar-entity-core.ts';

export const RADAR_UA = 'ZicaAI-Radar/1.0';
export const SCAN_MAX_SAMPLE = 6;
export const SCAN_SITEMAP_FILES = 6;

// ------------------------------------------------------------------------------------------------------------------ leitura de HTML
export function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let v: unknown;
    try { v = JSON.parse(m[1].trim()); } catch { continue; }
    const push = (x: unknown) => { if (x && typeof x === 'object' && !Array.isArray(x)) { const o = x as Record<string, unknown>; if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(push); else out.push(o); } else if (Array.isArray(x)) x.forEach(push); };
    push(v);
    if (out.length > 80) break;
  }
  return out;
}

export interface SchemaSummary {
  types: string[]; sameAs: string[]; name: string | null; telephone: string | null; address: string | null; rating: { value: number; count: number } | null;
  hasFaq: boolean; isLocal: boolean; areaServed: string[]; openingHours: boolean; geo: boolean;
}
const toArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const LOCAL_TYPES = /(LocalBusiness|Store|Restaurant|Dentist|Physician|MedicalBusiness|MedicalClinic|BeautySalon|HealthAndBeautyBusiness|HairSalon|LegalService|Attorney|ProfessionalService|AutoRepair|RealEstateAgent|Hotel|Gym|Pharmacy|HomeAndConstructionBusiness|FinancialService|AccountingService)/;
export function schemaSummary(nodes: Array<Record<string, unknown>>): SchemaSummary {
  const types = new Set<string>(); const same = new Set<string>(); const area = new Set<string>();
  let name: string | null = null; let tel: string | null = null; let addr: string | null = null; let rating: SchemaSummary['rating'] = null; let faq = false; let hours = false; let geo = false;
  for (const n of nodes) {
    const ts = toArr(n['@type']).map(String); ts.forEach((t) => types.add(t));
    if (ts.includes('FAQPage')) faq = true;
    const isOrg = ts.some((t) => LOCAL_TYPES.test(t) || /Organization|Person|Corporation|NGO/.test(t));
    if (isOrg) {
      name = name ?? str(n.name); tel = tel ?? str(n.telephone);
      for (const s of toArr(n.sameAs)) { const u = str(s); if (u) same.add(u); }
      const a = n.address; if (a && typeof a === 'object') { const o = a as Record<string, unknown>; addr = addr ?? ([str(o.streetAddress), str(o.addressLocality), str(o.addressRegion), str(o.postalCode)].filter(Boolean).join(', ') || null); } else addr = addr ?? str(a);
      if (n.openingHours || n.openingHoursSpecification) hours = true;
      if (n.geo) geo = true;
      for (const s of toArr(n.areaServed)) { const nm = typeof s === 'string' ? s : str((s as Record<string, unknown>)?.name); if (nm) area.add(nm); }
      const ar = n.aggregateRating as Record<string, unknown> | undefined;
      if (ar && typeof ar === 'object') { const v = Number(ar.ratingValue); const c = Number(ar.reviewCount ?? ar.ratingCount); if (Number.isFinite(v) && Number.isFinite(c)) rating = { value: v, count: Math.round(c) }; }
    }
  }
  return { types: [...types].slice(0, 30), sameAs: [...same].slice(0, 40), name, telephone: tel, address: addr, rating, hasFaq: faq, isLocal: [...types].some((t) => LOCAL_TYPES.test(t)), areaServed: [...area].slice(0, 20), openingHours: hours, geo };
}

export function extractHeadings(html: string): { title: string | null; h1: string[]; h2: number } {
  const clean = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html.slice(0, 200_000))?.[1];
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => clean(m[1]).slice(0, 200)).filter(Boolean).slice(0, 5);
  return { title: title ? clean(title).slice(0, 300) : null, h1, h2: (html.match(/<h2\b/gi) || []).length };
}

export function extractLinks(html: string, base: string): { internal: string[]; external: string[]; social: SocialRef[]; tel: string[] } {
  let origin: string; try { origin = new URL(base).hostname.replace(/^www\./, ''); } catch { return { internal: [], external: [], social: [], tel: [] }; }
  const internal = new Set<string>(); const external = new Set<string>(); const social = new Map<string, SocialRef>(); const tel = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const raw = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!raw || raw.startsWith('#') || /^(javascript|mailto|sms|whatsapp):/i.test(raw)) { continue; }
    if (/^tel:/i.test(raw)) { const d = digits(raw); if (d.length >= 8) tel.add(d); continue; }
    let u: URL; try { u = new URL(raw, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const ref = classifySocialUrl(u.href);
    if (ref) { social.set(ref.key, ref); continue; }
    if (u.hostname.replace(/^www\./, '') === origin) { u.hash = ''; internal.add(u.href); } else external.add(u.hostname.replace(/^www\./, ''));
  }
  return { internal: [...internal].slice(0, 400), external: [...external].slice(0, 100), social: [...social.values()].slice(0, 30), tel: [...tel].slice(0, 5) };
}

const TECH: Array<[string, RegExp]> = [
  ['wordpress', /wp-content|wp-includes|<meta[^>]+generator[^>]+wordpress/i], ['elementor', /elementor/i], ['wix', /wixstatic\.com|wix\.com\/|X-Wix/i], ['shopify', /cdn\.shopify\.com|shopify/i],
  ['squarespace', /squarespace/i], ['webflow', /webflow/i], ['nextjs', /__NEXT_DATA__|_next\/static/i], ['gtm', /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i], ['ga4', /gtag\/js\?id=G-|G-[A-Z0-9]{6,}/i],
  ['meta_pixel', /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i], ['whatsapp_button', /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i], ['rd_station', /rdstation/i], ['hotjar', /hotjar/i],
];
export function detectTech(html: string, headers: { get(n: string): string | null } = { get: () => null }): string[] {
  const hay = `${html.slice(0, 300_000)}\n${headers.get('x-powered-by') || ''}\n${headers.get('server') || ''}\n${headers.get('x-wix-request-id') ? 'X-Wix' : ''}`;
  return TECH.filter(([, rx]) => rx.test(hay)).map(([k]) => k);
}

const PAGE_TYPE_RULES: Array<[string, RegExp]> = [
  ['contato', /(^|\/)(contato|contact|contacto|fale-conosco|agende|agendamento|book|booking)(\/|$|-)/i], ['sobre', /(^|\/)(sobre|quem-somos|about|nosotros|a-equipe|equipe|team|our-story)(\/|$|-)/i],
  ['artigo', /(^|\/)(blog|artigos?|noticias?|news|posts?|articles?|dicas|tips|conteudo|insights)(\/|$)|\/20\d{2}\/\d{2}\//i], ['local', /(^|[/-])(zona|zone|bairro|regiao|cidade|city|locais|unidades|onde)-|(^|\/)(em|in|en)-|-(em|in|en)-[a-z0-9-]+\/?$/i],
  ['servico', /(^|\/)(servicos?|services?|areas?-de-atuacao|atuacao|especialidades|tratamentos?|procedimentos?|treatments?|practice-areas)(\/|$)/i], ['produto', /(^|\/)(produtos?|products?|loja|shop|store|colecao|collections?)(\/|$)/i],
  ['faq', /(^|\/)(faq|perguntas|duvidas|questions)(\/|$)/i], ['preco', /(^|\/)(precos?|valores|pricing|planos|plans)(\/|$)/i],
];
export function classifyPageType(url: string, title: string | null = null): string {
  let path = ''; try { path = new URL(url).pathname; } catch { path = url; }
  if (path === '/' || path === '') return 'home';
  const p = path.toLowerCase();
  for (const [t, rx] of PAGE_TYPE_RULES) if (rx.test(p)) return t;
  if (title && /(^|\s)(em|in|en)\s+[A-ZÀ-Ú]/.test(title)) return 'local';
  return 'outro';
}

export function wordCount(html: string): number { const t = visibleText(html); return t ? t.split(/\s+/).length : 0; }

/** Telefones visíveis (8 a 14 dígitos com separadores comuns): só os números, sem e-mail. Usado para NAP e para ligar listagens do Maps. */
export function extractPhones(html: string): string[] {
  const text = visibleText(html).slice(0, 200_000);
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{4,5}[\s.-]?\d{4}\b/g)) { const d = digits(m[0]); if (d.length >= 8 && d.length <= 14) out.add(d); if (out.size >= 6) break; }
  return [...out];
}

export interface Cadence { lastmod_count: number; newest: string | null; newest_age_days: number | null; updated_30d: number; updated_90d: number; updated_365d: number }
/** Cadência de atualização a partir dos `lastmod` do sitemap. Sitemap sem lastmod = sem dados (nunca "parado"). */
export function cadenceFromLastmods(dates: Array<string | null>, nowMs: number): Cadence {
  const ts = dates.filter((d): d is string => !!d).map((d) => Date.parse(d)).filter((t) => Number.isFinite(t));
  const day = 86_400_000;
  const newest = ts.length ? Math.max(...ts) : null;
  return { lastmod_count: ts.length, newest: newest ? new Date(newest).toISOString().slice(0, 10) : null, newest_age_days: newest ? Math.max(0, Math.floor((nowMs - newest) / day)) : null, updated_30d: ts.filter((t) => nowMs - t <= 30 * day).length, updated_90d: ts.filter((t) => nowMs - t <= 90 * day).length, updated_365d: ts.filter((t) => nowMs - t <= 365 * day).length };
}

export function parseLlmsTxt(text: string | null): { present: boolean; lines: number } {
  if (!text || /<html/i.test(text.slice(0, 500))) return { present: false, lines: 0 };
  const lines = text.split('\n').filter((l) => l.trim()).length;
  return { present: lines > 0, lines };
}

// ------------------------------------------------------------------------------------------------------------------ autoridade estimada
export const OPR_NOTE = 'Open PageRank (gratuito): a chave do plano gratuito fica presa a um endereço IPv4 e, no servidor em nuvem, pode ser recusada (403) se o endereço mudar. Estimativa a partir do Common Crawl: não é DR/Domain Authority.';
export const CC_NOTE = 'Common Crawl (grafo de links): licença limitada, uso comercial pede análise própria. O Radar só lê uma tabela de ranks pré-carregada; não consulta o grafo ao vivo.';
export function buildOpenPageRankUrl(domains: string[]): string | null {
  const clean = [...new Set(domains.map((d) => d.toLowerCase().replace(/^www\./, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 100);
  if (!clean.length) return null;
  return `https://openpagerank.com/api/v1.0/getPageRank?${clean.map((d) => `domains[]=${encodeURIComponent(d)}`).join('&')}`;
}
export interface OprRow { domain: string; rank: number | null; global_rank: number | null }
export function parseOpenPageRank(json: unknown): OprRow[] {
  const list = (json as { response?: unknown })?.response;
  if (!Array.isArray(list)) return [];
  return (list as Array<Record<string, unknown>>).filter((r) => typeof r?.domain === 'string' && Number(r.status_code) === 200).map((r) => {
    const d = Number(r.page_rank_decimal); const g = Number(r.rank);
    return { domain: String(r.domain), rank: Number.isFinite(d) ? Math.round(d * 100) / 100 : null, global_rank: Number.isFinite(g) && g > 0 ? g : null };
  });
}

// ------------------------------------------------------------------------------------------------------------------ varredura
export interface SiteScan {
  host: string; status: 'ok' | 'parcial' | 'bloqueado_pelo_robots' | 'erro'; error: string | null; scanned_at: string;
  robots: { state: 'ok' | 'ausente' | 'erro'; sitemaps: string[] };
  sitemap: { urls: number | null; files: number; types: Record<string, number>; cadence: Cadence | null; declared: boolean };
  llms_txt: { present: boolean; lines: number };
  pages: Array<{ url: string; type: string; status: number; title: string | null; h1: string[]; h2: number; words: number }>;
  content: { sampled: number; words_avg: number | null; types_seen: string[] };
  schema: SchemaSummary | null;
  nap: { names: string[]; phones: string[]; address: string | null; consistent_phone: boolean | null };
  tech: string[];
  links: { internal_avg: number | null; internal_distinct: number; external_domains: number };
  social: Array<{ url: string; platform: string; handle: string | null; source: 'site' | 'schema' }>;
  speed: { score: number | null; strategy: string } | null;
}
export interface ScanDeps extends CrawlDeps { speedFn?: (url: string) => Promise<{ score: number | null; strategy: string } | null> }
export interface ScanOptions { maxSample?: number; budgetMs?: number }

const EMPTY = (host: string, now: number, status: SiteScan['status'], error: string | null): SiteScan => ({
  host, status, error, scanned_at: new Date(now).toISOString(), robots: { state: 'erro', sitemaps: [] }, sitemap: { urls: null, files: 0, types: {}, cadence: null, declared: false }, llms_txt: { present: false, lines: 0 },
  pages: [], content: { sampled: 0, words_avg: null, types_seen: [] }, schema: null, nap: { names: [], phones: [], address: null, consistent_phone: null }, tech: [], links: { internal_avg: null, internal_distinct: 0, external_domains: 0 }, social: [], speed: null,
});

/** Visita UM concorrente: só o domínio registrável dele, com robots e 1 req/s. Nunca lança. */
export async function scanSite(deps: ScanDeps, registrable: string, o: ScanOptions = {}): Promise<SiteScan> {
  const now = deps.now();
  const host = registrable.toLowerCase();
  const c = makeCrawler(deps, projectHosts({ domain: host }), RADAR_UA);
  const get = (url: string, opts: Parameters<typeof politeGet>[2] = {}) => politeGet(c, url, { ua: RADAR_UA, ...opts });
  const home = await get(`https://${host}/`, { maxBytes: 600 * 1024 });
  if (home.ok === false) return EMPTY(host, now, home.error === 'bloqueada_pelo_robots' ? 'bloqueado_pelo_robots' : 'erro', home.error);
  const scan = EMPTY(host, now, 'ok', null);
  const rb = await robotsFor(c, host);
  const declared = rb.state === 'ok' ? [...rb.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]).slice(0, 5) : [];
  scan.robots = { state: rb.state, sitemaps: declared };

  const base = home.ok ? home.finalUrl : `https://${host}/`;
  const pages: Array<{ url: string; html: string; status: number }> = [];
  if (home.ok && home.status === 200) pages.push({ url: base, html: home.text, status: 200 });
  else scan.status = 'parcial';

  // sitemap (declarado no robots; senão os caminhos comuns, tratados como palpite)
  const guesses = [`https://${host}/sitemap.xml`, `https://${host}/sitemap_index.xml`];
  const walk = await walkSitemaps(c, { startUrls: declared.length ? declared : guesses, optional: declared.length ? undefined : new Set(guesses.map((g) => g.toLowerCase())), maxFiles: SCAN_SITEMAP_FILES, budgetMs: o.budgetMs ?? 25_000, startedAt: now });
  const types: Record<string, number> = {};
  for (const e of walk.entries) { const t = classifyPageType(e.url); types[t] = (types[t] ?? 0) + 1; }
  scan.sitemap = { urls: walk.totalEntries || null, files: walk.files.length, types, cadence: walk.entries.some((e) => e.lastmod) ? cadenceFromLastmods(walk.entries.map((e) => e.lastmod), now) : null, declared: declared.length > 0 };

  const llms = await get(`https://${host}/llms.txt`, { maxBytes: 100 * 1024, accept: 'text/plain,*/*;q=0.5' });
  scan.llms_txt = llms.ok && llms.status === 200 ? parseLlmsTxt(llms.text) : { present: false, lines: 0 };

  // amostra: uma página de cada tipo (as mais recentes primeiro) até o limite; a página inicial já está lida
  const max = o.maxSample ?? SCAN_MAX_SAMPLE;
  const byType = new Map<string, string>();
  for (const e of [...walk.entries].sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''))) { const t = classifyPageType(e.url); if (t !== 'home' && !byType.has(t)) byType.set(t, e.url); }
  const homeLinks = home.ok && home.status === 200 ? extractLinks(home.text, base) : { internal: [] as string[] };
  if (!byType.size) for (const u of homeLinks.internal) { const t = classifyPageType(u); if (t !== 'home' && !byType.has(t)) byType.set(t, u); }
  for (const url of [...byType.values()].slice(0, Math.max(0, max - 1))) {
    const r = await get(url, { maxBytes: 500 * 1024 });
    if (r.ok && r.status === 200 && !r.leftProject) pages.push({ url: r.finalUrl, html: r.text, status: 200 });
  }

  const social = new Map<string, SiteScan['social'][number]>();
  const ext = new Set<string>(); const internalCounts: number[] = []; const internalAll = new Set<string>();
  const phones = new Map<string, number>(); const names = new Set<string>(); const techs = new Set<string>();
  const schemaNodes: Array<Record<string, unknown>> = [];
  let words = 0;
  for (const p of pages) {
    const h = extractHeadings(p.html); const w = wordCount(p.html); words += w;
    scan.pages.push({ url: p.url, type: classifyPageType(p.url, h.title), status: p.status, title: h.title, h1: h.h1, h2: h.h2, words: w });
    const links = extractLinks(p.html, p.url);
    internalCounts.push(links.internal.length); links.internal.forEach((u) => internalAll.add(u)); links.external.forEach((d) => ext.add(d));
    for (const s of links.social) social.set(s.key, { url: s.canonical, platform: s.platform, handle: s.handle, source: 'site' });
    for (const ph of [...extractPhones(p.html), ...links.tel]) phones.set(ph, (phones.get(ph) ?? 0) + 1);
    detectTech(p.html, home.ok ? home.headers : undefined).forEach((t) => techs.add(t));
    schemaNodes.push(...extractJsonLd(p.html));
  }
  const sch = schemaNodes.length ? schemaSummary(schemaNodes) : null;
  scan.schema = sch;
  if (sch) { if (sch.name) names.add(sch.name); for (const u of sch.sameAs) { const ref = classifySocialUrl(u); if (ref) social.set(ref.key, { url: ref.canonical, platform: ref.platform, handle: ref.handle, source: 'schema' }); } }
  scan.social = [...social.values()];
  scan.tech = [...techs];
  scan.content = { sampled: pages.length, words_avg: pages.length ? Math.round(words / pages.length) : null, types_seen: [...new Set(scan.pages.map((p) => p.type))] };
  scan.links = { internal_avg: internalCounts.length ? Math.round(internalCounts.reduce((a, b) => a + b, 0) / internalCounts.length) : null, internal_distinct: internalAll.size, external_domains: ext.size };
  const phoneList = [...phones.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 4);
  scan.nap = { names: [...names].slice(0, 3), phones: phoneList, address: sch?.address ?? null, consistent_phone: phones.size ? phones.size === 1 : null };
  if (deps.speedFn && pages.length) { try { scan.speed = await deps.speedFn(pages[0].url); } catch { scan.speed = null; } }
  if (!pages.length) scan.status = 'parcial';
  return scan;
}
