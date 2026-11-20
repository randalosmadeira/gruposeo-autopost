/**
 * Núcleo PURO da Indexação avançada (sem rede, sem banco): normalização de URL, posse de host, sitemap, robots, impressão digital de página,
 * soft-404, higiene, fila de prioridade, lotes de envio e cobertura. Tudo é testável com texto gravado.
 *
 * Regras do módulo:
 *  - só entram no inventário URLs de hosts do projeto (domínio do projeto e subdomínios dele); terceiros são recusados e contados;
 *  - nada é inventado: sem verificação, o estado é "desconhecido";
 *  - o Google NÃO tem API para "pedir indexação" de páginas comuns (a Indexing API é só para vagas e transmissões ao vivo);
 *    aqui o Google é somente consulta (URL Inspection). IndexNow vale para Bing, Yandex, Seznam, Naver e outros, e NÃO para o Google.
 */
import { parseSafeUrl } from './profile-analyze-core.ts';

export const INDEX_UA = 'ZicaAI-Indexacao/1.0';
export const ROBOTS_TOKEN = 'zicaai-indexacao';
export const MAX_REDIRECTS = 3;
export const HOST_MIN_INTERVAL_MS = 1000;
export const MAX_SITEMAP_ENTRIES = 50_000;
export const INDEXNOW_MAX_URLS = 10_000;
/** Cotas catalogadas em 20/11/2026 (documento 09). NÃO confirmadas por chamada real no Zica: o Google pode mudar. */
export const GOOGLE_INSPECT_DAILY_LIMIT = 2000;
export const GOOGLE_INSPECT_PER_MINUTE = 600;
export const BING_BATCH_MAX = 500;

export type UrlSource = 'sitemap' | 'search_console' | 'artigo' | 'manual' | 'varredura';
export type Engine = 'google' | 'bing' | 'indexnow';
export type IndexState = 'desconhecido' | 'indexada' | 'nao_indexada' | 'enviada' | 'erro' | 'fora_do_escopo';

// ------------------------------------------------------------------------------------------------------------ domínio registrável (global)
/**
 * Domínio registrável sem supor país: reconhece sufixos de segundo nível de vários países (co.uk, com.au, co.jp, com.mx, com.br...) e plataformas
 * onde cada subdomínio é de um dono diferente (github.io, wordpress.com, blogspot.com...). Heurística local, sem a lista pública completa:
 * por isso, na dúvida, o sufixo de 2 níveis conhecido vence e o resto cai no padrão "últimos 2 rótulos".
 * Importante para segurança: se o sufixo fosse tratado como domínio (ex.: "co.jp"), qualquer site daquele país passaria por "do projeto".
 */
const SECOND_LEVEL: Record<string, string[]> = {
  uk: ['co', 'org', 'ac', 'gov', 'me', 'ltd', 'plc', 'net', 'sch'], au: ['com', 'net', 'org', 'edu', 'gov', 'id', 'asn'], nz: ['co', 'org', 'govt', 'ac', 'net', 'geek'],
  jp: ['co', 'or', 'ne', 'ac', 'go', 'ad', 'ed', 'gr'], kr: ['co', 'or', 'go', 'ac', 'ne', 'pe', 're'], cn: ['com', 'net', 'org', 'gov', 'edu'], tw: ['com', 'org', 'gov', 'edu', 'net', 'idv'],
  hk: ['com', 'org', 'gov', 'edu', 'net'], sg: ['com', 'org', 'gov', 'edu', 'net'], in: ['co', 'net', 'org', 'gov', 'ac', 'res', 'firm', 'gen', 'ind'], id: ['co', 'or', 'go', 'ac', 'web', 'my', 'sch'],
  my: ['com', 'org', 'gov', 'edu', 'net'], th: ['co', 'or', 'go', 'ac', 'in'], vn: ['com', 'net', 'org', 'gov', 'edu'], ph: ['com', 'org', 'gov', 'edu', 'net'], tr: ['com', 'org', 'gov', 'edu', 'net', 'gen', 'web'],
  il: ['co', 'org', 'gov', 'ac', 'net'], za: ['co', 'org', 'gov', 'ac', 'net', 'web'], ng: ['com', 'org', 'gov', 'edu', 'net'], ke: ['co', 'or', 'go', 'ac', 'ne'], eg: ['com', 'org', 'gov', 'edu', 'net'],
  sa: ['com', 'org', 'gov', 'edu', 'net'], ae: ['co', 'gov', 'ac', 'net', 'org'], pk: ['com', 'org', 'gov', 'edu', 'net'], bd: ['com', 'org', 'gov', 'edu', 'net'], lk: ['com', 'org', 'gov', 'edu'],
  br: ['com', 'net', 'org', 'adv', 'edu', 'gov', 'eco', 'art', 'blog', 'med', 'psc', 'mil', 'jus'], ar: ['com', 'net', 'org', 'gov', 'edu', 'tur'], mx: ['com', 'org', 'gob', 'edu', 'net'],
  co: ['com', 'net', 'org', 'gov', 'edu'], pe: ['com', 'org', 'gob', 'edu', 'net'], ve: ['com', 'net', 'org', 'gob', 'co'], uy: ['com', 'org', 'gub', 'edu', 'net'], ec: ['com', 'org', 'gob', 'edu', 'net'],
  py: ['com', 'org', 'gov', 'edu', 'net'], bo: ['com', 'org', 'gob', 'edu', 'net'], cr: ['co', 'or', 'go', 'ac'], gt: ['com', 'org', 'gob', 'edu'], pa: ['com', 'org', 'gob', 'edu'], do: ['com', 'org', 'gob', 'edu'],
  pt: ['com', 'org', 'gov', 'edu'], ua: ['com', 'org', 'gov', 'edu', 'net'], ru: ['com', 'org', 'net'], pl: ['com', 'org', 'net', 'gov', 'edu'], gr: ['com', 'gov', 'edu', 'org', 'net'], es: ['com', 'org', 'gob', 'nom', 'edu'],
  fr: ['com', 'asso', 'gouv'], ro: ['com', 'org'], hu: ['co'], ir: ['co', 'ac', 'gov', 'org', 'net'],
};
const SECOND_LEVEL_SET = new Set(Object.entries(SECOND_LEVEL).flatMap(([cc, list]) => list.map((s) => `${s}.${cc}`)));
/** Plataformas em que cada subdomínio pertence a um dono diferente: o "domínio do projeto" é o subdomínio inteiro, nunca a plataforma. */
const SHARED_PLATFORMS = new Set(['github.io', 'gitlab.io', 'wordpress.com', 'blogspot.com', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'wixsite.com', 'squarespace.com', 'myshopify.com', 'webflow.io', 'carrd.co', 'substack.com', 'medium.com', 'tumblr.com', 'weebly.com', 'onrender.com', 'fly.dev', 'surge.sh', 'glitch.me', 'repl.co', 'amazonaws.com', 'cloudfront.net', 'appspot.com']);
export function registrable(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const last2 = labels.slice(-2).join('.');
  if (SECOND_LEVEL_SET.has(last2) || SHARED_PLATFORMS.has(last2)) return labels.slice(-3).join('.');
  return last2;
}

// ------------------------------------------------------------------------------------------------------------ mecanismos de busca (honestidade sobre o que existe)
export type EngineSupport = 'implementado' | 'cobertura_indexnow' | 'sem_api_gratuita_verificada';
export interface EngineInfo { key: string; label: string; support: EngineSupport; how: string }
/** O que o módulo realmente faz por mecanismo. Baidu, Yandex Webmaster e Naver Search Advisor: NÃO há API pública gratuita verificada pelo Zica (marcados assim, sem fingir suporte). */
export const ENGINE_CATALOG: EngineInfo[] = [
  { key: 'google', label: 'Google', support: 'implementado', how: 'Consulta de estado por propriedade do Search Console (URL Inspection, somente leitura). Não existe API para pedir indexação de páginas comuns.' },
  { key: 'bing', label: 'Bing', support: 'implementado', how: 'Envio de lote pela API do Bing Webmaster (chave de API) e leitura da cota diária; global.' },
  { key: 'indexnow', label: 'IndexNow (Bing, Yandex, Naver, Seznam, Yep)', support: 'implementado', how: 'Aviso de URL nova ou alterada, global; cobre os motores que participam do protocolo. Não inclui o Google.' },
  { key: 'yandex', label: 'Yandex Webmaster', support: 'cobertura_indexnow', how: 'Avisado pelo IndexNow. A API própria do Yandex Webmaster não foi verificada pelo Zica: sem API pública gratuita verificada.' },
  { key: 'naver', label: 'Naver Search Advisor', support: 'cobertura_indexnow', how: 'Avisado pelo IndexNow. API própria do Naver Search Advisor: sem API pública gratuita verificada.' },
  { key: 'baidu', label: 'Baidu', support: 'sem_api_gratuita_verificada', how: 'Sem API pública gratuita verificada pelo Zica. Use o Baidu Webmaster Tools manualmente.' },
];

// ------------------------------------------------------------------------------------------------------------ idioma da URL
const LANGS = new Set(['en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'sv', 'da', 'no', 'nb', 'nn', 'fi', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el', 'tr', 'ru', 'uk', 'ar', 'he', 'fa', 'hi', 'bn', 'ur', 'th', 'vi', 'id', 'ms', 'zh', 'ja', 'ko', 'ca', 'eu', 'gl', 'hr', 'sr', 'sl', 'lt', 'lv', 'et', 'is', 'ga', 'cy', 'af', 'sw', 'tl', 'fil', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ne', 'si', 'my', 'km', 'lo', 'ka', 'hy', 'az', 'kk', 'uz', 'mn', 'sq', 'mk', 'bs', 'be']);
const LANG_TAG = /^([a-z]{2,3})(?:[-_]([a-z]{4}|[a-z]{2}|[0-9]{3}))?$/i;
/** Idioma indicado pelo endereço: primeira pasta (/en/, /es-mx/, /pt-br/) ou primeiro rótulo do subdomínio (de.exemplo.com). null quando o endereço não diz. Heurística: o idioma real vem do <html lang>/hreflang. */
export function languageOfUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const fromTag = (seg: string | undefined): string | null => {
    const m = seg ? LANG_TAG.exec(seg) : null;
    return m && LANGS.has(m[1].toLowerCase()) ? `${m[1].toLowerCase()}${m[2] ? `-${m[2].toLowerCase()}` : ''}` : null;
  };
  return fromTag(u.pathname.split('/').filter(Boolean)[0]) || fromTag(u.hostname.split('.').length > 2 ? u.hostname.split('.')[0] : undefined);
}
/** Código hreflang válido: idioma (ISO 639) com região/escrita opcional, ou x-default. */
export const isValidHreflang = (code: string): boolean => code === 'x-default' || (/^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?$/i.test(code) && LANGS.has(code.slice(0, code.indexOf('-') > 0 ? code.indexOf('-') : undefined).toLowerCase()));

// ------------------------------------------------------------------------------------------------------------ URL
const TRACKING_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|_ga|_gl|igshid|yclid|ref_src)$/i;

export interface NormalizedUrl { url: string; host: string; path: string; key: string }

/**
 * Normaliza: esquema -> https, host em minúsculas, porta padrão e fragmento fora, parâmetros de campanha (utm_*, fbclid, gclid...) fora, demais parâmetros em ordem,
 * barulho de barras duplicadas fora. A barra final é PRESERVADA como veio (o site é quem decide), mas a chave de comparação (`key`) a ignora.
 * Devolve null para URL inválida, com usuário/senha, IP, porta estranha ou host sem ponto.
 */
export function normalizeUrl(raw: unknown, base?: string): NormalizedUrl | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 2048) return null;
  let u: URL;
  try { u = new URL(text, base); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.protocol = 'https:';
  const safe = parseSafeUrl(u.href);
  if ('error' in safe) return null;
  u = safe.url;
  if (u.port === '443' || u.port === '80') u.port = '';
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);
  let path = u.pathname.replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) path = `/${path}`;
  u.pathname = path;
  const url = u.href;
  if (url.length > 2048) return null;
  const keyPath = path.length > 1 ? path.replace(/\/$/, '') : '/';
  return { url, host: u.hostname, path: u.pathname + u.search, key: `${u.hostname}${keyPath}${u.search}` };
}

export interface ProjectHosts { registrables: Set<string>; primary: string | null }
/** Domínios registráveis que pertencem ao projeto (domínio cadastrado e o do WordPress). */
export function projectHosts(project: { domain?: unknown; wordpress_url?: unknown }): ProjectHosts {
  const regs = new Set<string>();
  let primary: string | null = null;
  for (const v of [project.domain, project.wordpress_url]) {
    const n = normalizeUrl(typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v : `https://${String(v ?? '').trim().split(/\s+/)[0]}`);
    if (!n) continue;
    regs.add(registrable(n.host));
    if (!primary) primary = n.host;
  }
  return { registrables: regs, primary };
}
/** O host é o domínio do projeto ou um subdomínio dele? (terceiros e domínios parecidos como "rdmadvogados.com.br.mal.com" são recusados). */
export const belongsToProject = (host: string, hosts: ProjectHosts): boolean => hosts.registrables.has(registrable(host.toLowerCase()));

/** Seção = primeiro segmento do caminho ("(raiz)" para a página inicial). */
export function sectionOfPath(path: string): string {
  const seg = path.split('?')[0].split('/').filter(Boolean)[0];
  if (!seg) return '(raiz)';
  try { return decodeURIComponent(seg).toLowerCase().slice(0, 40); } catch { return seg.toLowerCase().slice(0, 40); }
}

// ------------------------------------------------------------------------------------------------------------ sitemap
export interface SitemapEntry { loc: string; lastmod: string | null }
export interface ParsedSitemap { kind: 'index' | 'urls'; entries: SitemapEntry[]; hreflangLinks: number }
const XML_ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
const decodeXml = (s: string) => s.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => XML_ENT[m] || m);

/** Lê um sitemap (urlset ou índice). Devolve null se o texto não for sitemap (ex.: página HTML de erro). */
export function parseSitemap(xml: string): ParsedSitemap | null {
  const head = xml.slice(0, 6000);
  const isIndex = /<sitemapindex\b/i.test(head);
  if (!isIndex && !/<urlset\b/i.test(head)) return null;
  const entries: SitemapEntry[] = [];
  const re = isIndex ? /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi : /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  for (const m of xml.matchAll(re)) {
    const loc = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/i.exec(m[1])?.[1];
    if (!loc) continue;
    const lm = /<lastmod>\s*([^<\s]+)/i.exec(m[1])?.[1] || null;
    entries.push({ loc: decodeXml(loc), lastmod: lm && /^\d{4}-\d{2}-\d{2}/.test(lm) ? lm.slice(0, 10) : null });
    if (entries.length >= MAX_SITEMAP_ENTRIES) break;
  }
  return { kind: isIndex ? 'index' : 'urls', entries, hreflangLinks: (xml.match(/<xhtml:link\b[^>]*hreflang=/gi) || []).length };
}

/** Texto de um arquivo que pode estar compactado (.gz): reconhece pelo início (1f 8b), descompacta com limite de tamanho. */
export async function bytesToText(bytes: Uint8Array, maxBytes: number): Promise<{ text: string; truncated: boolean; gzip: boolean }> {
  const dec = new TextDecoder('utf-8', { fatal: false });
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('gzip_indisponivel');
    const body = new Response(bytes as BodyInit).body;
    if (!body) throw new Error('gzip_indisponivel');
    const reader = body.pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > maxBytes) { chunks.push(value.slice(0, maxBytes - total)); truncated = true; void reader.cancel().catch(() => undefined); break; }
      chunks.push(value); total += value.length;
    }
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    return { text: dec.decode(all), truncated, gzip: true };
  }
  return { text: dec.decode(bytes.length > maxBytes ? bytes.slice(0, maxBytes) : bytes), truncated: bytes.length > maxBytes, gzip: false };
}

/** Séries numeradas ("post-sitemap1..11"): em vários índices, quem lista menos que o maior de uma série está atrasado. */
export function sitemapSeriesGaps(indexes: Array<{ url: string; children: string[] }>): Array<{ index: string; series: string; missing: string[] }> {
  const seriesOf = (u: string) => { const m = /^(.*?)(\d+)(\.xml(?:\.gz)?)$/i.exec(u.split('?')[0]); return m ? { prefix: m[1].split('/').pop() || '', num: Number(m[2]), suffix: m[3], dir: m[1].slice(0, m[1].length - (m[1].split('/').pop() || '').length) } : null; };
  const bySeries = new Map<string, Map<number, string>>();
  const perIndex = new Map<string, Set<string>>();
  for (const ix of indexes) {
    for (const c of ix.children) {
      const s = seriesOf(c);
      if (!s) continue;
      const key = `${s.dir}${s.prefix}#${s.suffix}`;
      (bySeries.get(key) || bySeries.set(key, new Map()).get(key)!).set(s.num, c);
      (perIndex.get(ix.url) || perIndex.set(ix.url, new Set()).get(ix.url)!).add(`${key}:${s.num}`);
    }
  }
  const out: Array<{ index: string; series: string; missing: string[] }> = [];
  for (const ix of indexes) {
    for (const [key, nums] of bySeries) {
      const mine = [...nums.keys()].filter((n) => perIndex.get(ix.url)?.has(`${key}:${n}`));
      if (!mine.length) continue; // o índice não usa esta série
      const missing = [...nums.entries()].filter(([n]) => !perIndex.get(ix.url)?.has(`${key}:${n}`)).map(([, u]) => u);
      if (missing.length) out.push({ index: ix.url, series: key.split('#')[0].split('/').pop() || key, missing });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------ robots.txt
export interface RobotsGroup { agents: string[]; rules: Array<{ allow: boolean; pattern: string }> }
export interface RobotsRules { groups: RobotsGroup[]; sitemaps: string[]; disallowAllForStar: boolean }

export function parseRobotsRules(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let cur: RobotsGroup | null = null;
  let lastAgent = false;
  for (const raw of text.split(/\r?\n/).slice(0, 5000)) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*$/, '').trim());
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'sitemap') { if (/^https?:\/\//i.test(val) && sitemaps.length < 50) sitemaps.push(val.slice(0, 500)); continue; }
    if (key === 'user-agent') {
      if (!cur || !lastAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastAgent = true;
      continue;
    }
    lastAgent = false;
    if (!cur) continue;
    if (key === 'disallow') cur.rules.push({ allow: false, pattern: val });
    else if (key === 'allow') cur.rules.push({ allow: true, pattern: val });
  }
  const star = groups.filter((g) => g.agents.includes('*'));
  const disallowAllForStar = star.some((g) => g.rules.some((r) => !r.allow && r.pattern === '/') && !g.rules.some((r) => r.allow && r.pattern === '/'));
  return { groups, sitemaps, disallowAllForStar };
}

const patternToRegex = (p: string): RegExp => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
const matchLen = (pattern: string, path: string): number => (pattern && patternToRegex(pattern).test(path) ? pattern.replace(/\*/g, '').length : -1);

/** O agente pode acessar o caminho? Vale o grupo mais específico do agente (ou "*"); a regra mais longa vence e, em empate, "Allow". */
export function robotsAllows(rules: RobotsRules, path: string, agent: string = ROBOTS_TOKEN): boolean {
  const a = agent.toLowerCase();
  const own = rules.groups.filter((g) => g.agents.some((x) => x !== '*' && (a.includes(x) || x.includes(a))));
  const groups = own.length ? own : rules.groups.filter((g) => g.agents.includes('*'));
  let best = { len: -1, allow: true };
  for (const g of groups) for (const r of g.rules) {
    if (!r.pattern) continue; // "Disallow:" vazio libera tudo
    const len = matchLen(r.pattern, path);
    if (len > best.len || (len === best.len && r.allow && !best.allow)) best = { len, allow: r.allow };
  }
  return best.allow;
}

// ------------------------------------------------------------------------------------------------------------ limite de taxa (1 requisição por segundo por host)
export interface LimiterDeps { now: () => number; sleep: (ms: number) => Promise<void> }
/** Reserva "vagas" por host: chamadas simultâneas ao mesmo host saem com pelo menos `minMs` de distância; hosts diferentes não se atrapalham. */
export function makeLimiter(deps: LimiterDeps, minMs: number = HOST_MIN_INTERVAL_MS): (host: string) => Promise<void> {
  const next = new Map<string, number>();
  return async (host: string) => {
    const t = deps.now();
    const at = Math.max(t, next.get(host) ?? 0);
    next.set(host, at + minMs);
    if (at > t) await deps.sleep(at - t);
  };
}

// ------------------------------------------------------------------------------------------------------------ página: impressão digital e sinais de indexação
const decodeHtml = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' }[m] || m));
const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decodeHtml(m[2] ?? m[3] ?? m[4] ?? '') : null;
};

/** Hash FNV-1a de 32 bits em duas passadas (síncrono, sem depender de crypto): serve para comparar corpos, não para segurança. */
export function textHash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ (c + i), 0x85ebca6b) >>> 0; }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** Texto visível da página (sem scripts, estilos, comentários, tags e espaços repetidos): é o que se compara no soft-404. */
export function visibleText(html: string): string {
  return decodeHtml(html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export interface PageSignals {
  title: string | null; canonical: string | null; robotsMeta: string | null; xRobots: string | null;
  hreflang: Array<{ lang: string; href: string }>; htmlLang: string | null; textHash: string; textLength: number; noindex: boolean;
}
export function pageSignals(html: string, headers: { get(name: string): string | null }, finalUrl: string): PageSignals {
  const head = html.slice(0, 200_000);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.replace(/\s+/g, ' ').trim() || null;
  let canonical: string | null = null;
  const metas: string[] = [];
  const hreflang: Array<{ lang: string; href: string }> = [];
  for (const m of head.matchAll(/<(link|meta)\b[^>]*>/gi)) {
    const tag = m[0];
    if (m[1].toLowerCase() === 'link') {
      const rel = (attr(tag, 'rel') || '').toLowerCase();
      const href = attr(tag, 'href');
      if (rel.split(/\s+/).includes('canonical') && href && !canonical) { try { canonical = new URL(href, finalUrl).href; } catch { canonical = null; } }
      if (rel.split(/\s+/).includes('alternate') && href && attr(tag, 'hreflang')) { try { hreflang.push({ lang: String(attr(tag, 'hreflang')).toLowerCase(), href: new URL(href, finalUrl).href }); } catch { /* ignora */ } }
    } else {
      const name = (attr(tag, 'name') || '').toLowerCase();
      if (name === 'robots' || name === 'googlebot') { const c = attr(tag, 'content'); if (c) metas.push(c.toLowerCase().replace(/\s+/g, '')); }
    }
  }
  const text = visibleText(html);
  const htmlLang = /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z0-9_-]{2,12})/i.exec(head)?.[1]?.toLowerCase().replace('_', '-') || null;
  const robotsMeta = metas.length ? metas.join(',').slice(0, 300) : null;
  const xRobots = (headers.get('x-robots-tag') || '').toLowerCase().replace(/\s+/g, '').slice(0, 300) || null;
  return { title, canonical, robotsMeta, xRobots, hreflang, htmlLang, textHash: textHash(`${title || ''}|${text}`), textLength: text.length, noindex: /(^|,)noindex(,|$)|(^|,)none(,|$)/.test(`${robotsMeta || ''},${xRobots || ''}`) };
}

// ------------------------------------------------------------------------------------------------------------ soft-404
export interface Fingerprint { status: number; hash: string; title: string | null; canonical: string | null; length: number }
export const fingerprintOf = (status: number, s: PageSignals): Fingerprint => ({ status, hash: s.textHash, title: s.title, canonical: s.canonical, length: s.textLength });

const keyOf = (u: string | null): string | null => (u ? normalizeUrl(u)?.key ?? null : null);

/** Diretório-pai de uma URL (a página-mãe/hub): https://h/a/b/c/ -> https://h/a/b/ ; a raiz não tem pai. */
export function parentOf(url: string): string | null {
  const n = normalizeUrl(url);
  if (!n) return null;
  const u = new URL(n.url);
  const segs = u.pathname.split('/').filter(Boolean);
  if (!segs.length) return null;
  u.pathname = segs.length === 1 ? '/' : `/${segs.slice(0, -1).join('/')}/`;
  u.search = '';
  return u.href;
}
/** Caminho que NÃO deve existir, dentro do mesmo diretório da URL: serve de "isca" para ver se o site responde 200 para qualquer coisa. */
export function sentinelUrlFor(parent: string, token: string): string {
  const u = new URL(parent);
  u.pathname = `${u.pathname.replace(/\/?$/, '/')}zica-nao-existe-${token}/`;
  u.search = '';
  return u.href;
}

export interface Soft404Verdict { soft: boolean; reason: string | null }
/** O diretório inteiro responde 200 para caminhos inexistentes? (a isca devolve o mesmo corpo/título/canonical da página-mãe). */
export function isSoft404Template(sentinel: Fingerprint | null, hub: Fingerprint | null, hubUrl: string): Soft404Verdict {
  if (!sentinel || sentinel.status !== 200) return { soft: false, reason: null };
  if (hub && hub.status === 200 && sentinel.hash === hub.hash) return { soft: true, reason: 'a isca devolveu o mesmo conteúdo da página-mãe' };
  if (sentinel.canonical && keyOf(sentinel.canonical) === keyOf(hubUrl)) return { soft: true, reason: 'a isca aponta o canonical para a página-mãe' };
  if (hub && hub.status === 200 && sentinel.title && sentinel.title === hub.title && sentinel.length > 0 && Math.abs(sentinel.length - hub.length) / Math.max(sentinel.length, hub.length) < 0.02) return { soft: true, reason: 'a isca tem o mesmo título e tamanho da página-mãe' };
  return { soft: false, reason: null };
}
/** A página é um soft-404 (200 que na prática é "não encontrado")? Só quando o diretório dela é um molde soft-404 e ela é igual à isca ou à página-mãe. Página real (conteúdo próprio e canonical próprio) nunca é marcada. */
export function isSoft404Page(page: Fingerprint, pageUrl: string, sentinel: Fingerprint | null, hub: Fingerprint | null, hubUrl: string): Soft404Verdict {
  if (page.status !== 200) return { soft: false, reason: null };
  if (keyOf(pageUrl) === keyOf(hubUrl)) return { soft: false, reason: null };
  if (!isSoft404Template(sentinel, hub, hubUrl).soft) return { soft: false, reason: null };
  if (sentinel && page.hash === sentinel.hash) return { soft: true, reason: 'o conteúdo é idêntico ao de um endereço que não existe' };
  if (hub && page.hash === hub.hash) return { soft: true, reason: 'o conteúdo é idêntico ao da página-mãe' };
  if (page.canonical && keyOf(page.canonical) === keyOf(hubUrl) && keyOf(page.canonical) !== keyOf(pageUrl)) return { soft: true, reason: 'o canonical aponta para a página-mãe' };
  return { soft: false, reason: null };
}

// ------------------------------------------------------------------------------------------------------------ problemas de uma URL do inventário
export interface UrlRow {
  id: string; url: string; host: string; path: string; source: UrlSource; taxonomy_node_id: string | null; first_seen: string; last_seen: string;
  in_sitemap: boolean; in_search_console: boolean; gsc_impressions: number; gsc_clicks: number; article_id: string | null; lastmod: string | null; changed_at: string;
  http_status: number | null; canonical: string | null; robots_meta: string | null; x_robots: string | null; redirect_to: string | null; https_redirect: boolean | null;
  soft404_suspect: boolean; check_error: string | null; last_checked_at: string | null; lang?: string | null;
}
export type ProblemKey = 'http_sem_redirecionamento' | 'noindex' | 'soft404' | 'erro_http' | 'redirecionada' | 'canonical_diferente' | 'fora_do_sitemap' | 'bloqueada_robots' | 'sem_resposta';
export const PROBLEM_TEXT: Record<ProblemKey, string> = {
  noindex: 'A página pede para NÃO ser indexada (noindex).',
  soft404: 'Responde 200, mas o conteúdo é de "não encontrada" (soft-404).',
  erro_http: 'O site respondeu com erro (4xx/5xx).',
  redirecionada: 'A URL redireciona para outro endereço.',
  canonical_diferente: 'O canonical aponta para outra URL.',
  fora_do_sitemap: 'Aparece no Google ou nos artigos, mas não está em nenhum sitemap.',
  bloqueada_robots: 'O robots.txt do site bloqueia a verificação desta URL.',
  http_sem_redirecionamento: 'O endereço com http:// abre sem redirecionar para https://.',
  sem_resposta: 'O site não respondeu à verificação.',
};
export function urlProblems(r: Pick<UrlRow, 'url' | 'http_status' | 'canonical' | 'robots_meta' | 'x_robots' | 'redirect_to' | 'soft404_suspect' | 'check_error' | 'in_sitemap' | 'source' | 'in_search_console' | 'last_checked_at'> & { https_redirect?: boolean | null }): ProblemKey[] {
  const out: ProblemKey[] = [];
  if (/(^|,)noindex(,|$)|(^|,)none(,|$)/.test(`${r.robots_meta || ''},${r.x_robots || ''}`)) out.push('noindex');
  if (r.soft404_suspect) out.push('soft404');
  if (r.http_status !== null && r.http_status >= 400) out.push('erro_http');
  if (r.http_status !== null && r.http_status >= 300 && r.http_status < 400) out.push('redirecionada');
  if (r.canonical && keyOf(r.canonical) !== keyOf(r.url) && (r.http_status === 200 || r.http_status === null)) out.push('canonical_diferente');
  if (!r.in_sitemap && (r.in_search_console || r.source === 'artigo')) out.push('fora_do_sitemap');
  if (r.https_redirect === false) out.push('http_sem_redirecionamento');
  if (r.check_error === 'bloqueada_pelo_robots') out.push('bloqueada_robots');
  else if (r.check_error && r.last_checked_at) out.push('sem_resposta');
  return out;
}
/** URL que NÃO vale a pena enviar a buscador agora (a própria URL tem problema que o envio não resolve). */
export const blocksSubmission = (p: ProblemKey[]): boolean => p.some((k) => ['noindex', 'soft404', 'erro_http', 'redirecionada', 'canonical_diferente', 'sem_resposta'].includes(k));

// ------------------------------------------------------------------------------------------------------------ taxonomia: URL -> nó aprovado
export interface TaxNode { id: string; kind: string; slug: string; label: string; keywords: string[]; status: string }
const slugWords = (s: string): string[] => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
/** Heurística: o nó aprovado cujas palavras (slug, nome, palavras-chave) mais aparecem no caminho da URL; empate vai para o mais específico (nicho > subárea > matriz). */
export function matchTaxonomyNode(path: string, nodes: TaxNode[]): string | null {
  const words = new Set(slugWords(decodeURI(path.split('?')[0])));
  if (!words.size) return null;
  const depth: Record<string, number> = { matriz: 1, subarea: 2, nicho: 3, cauda: 4 };
  let best: { id: string; score: number; depth: number } | null = null;
  for (const n of nodes) {
    if (n.status !== 'aprovado') continue;
    const own = new Set([...slugWords(n.slug), ...slugWords(n.label), ...n.keywords.flatMap(slugWords)]);
    let score = 0;
    for (const w of own) if (words.has(w)) score++;
    if (!score) continue;
    const d = depth[n.kind] ?? 1;
    if (!best || score > best.score || (score === best.score && d > best.depth)) best = { id: n.id, score, depth: d };
  }
  return best?.id ?? null;
}

// ------------------------------------------------------------------------------------------------------------ Google: URL Inspection (somente leitura)
export interface InspectionState { state: IndexState; detail: Record<string, unknown> }
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 300) : null);
export function parseInspection(json: unknown): InspectionState | null {
  const r = (json as { inspectionResult?: { indexStatusResult?: Record<string, unknown> } } | null)?.inspectionResult?.indexStatusResult;
  if (!r || typeof r !== 'object') return null;
  const verdict = str(r.verdict);
  const detail: Record<string, unknown> = {
    verdict, coverage_state: str(r.coverageState), indexing_state: str(r.indexingState), robots_txt_state: str(r.robotsTxtState), page_fetch_state: str(r.pageFetchState),
    last_crawl_time: str(r.lastCrawlTime), google_canonical: str(r.googleCanonical), user_canonical: str(r.userCanonical), crawled_as: str(r.crawledAs),
  };
  // Mapeamento INFERIDO da referência da API (não confirmado por chamada real): PASS e PARTIAL = a URL está no índice; o resto = fora.
  const state: IndexState = verdict === 'PASS' || verdict === 'PARTIAL' ? 'indexada' : 'nao_indexada';
  if (verdict === 'PARTIAL') detail.partial = true;
  return { state, detail };
}
/** A propriedade do Search Console (domínio `sc-domain:x.com` ou prefixo `https://x.com/p/`) cobre a URL? */
export function propertyCovers(property: string, url: string): boolean {
  const n = normalizeUrl(url);
  if (!n) return false;
  if (property.startsWith('sc-domain:')) { const d = property.slice('sc-domain:'.length).toLowerCase(); return n.host === d || n.host.endsWith(`.${d}`); }
  const p = normalizeUrl(property);
  if (!p) return false;
  return n.host === p.host && new URL(n.url).pathname.startsWith(new URL(p.url).pathname);
}

// ------------------------------------------------------------------------------------------------------------ IndexNow
export const chunkList = <T,>(list: T[], size: number): T[][] => { const out: T[][] = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };
export const INDEXNOW_KEY_RE = /^[A-Za-z0-9-]{8,128}$/;
/** O arquivo da chave tem de conter exatamente a chave (espaços nas pontas não contam). */
export const keyFileMatches = (text: string, key: string): boolean => text.trim() === key;
export const defaultKeyLocation = (host: string, key: string): string => `https://${host}/${key}.txt`;

export interface SubmissionCandidate { id: string; url: string; host: string; changed_at: string; problems: ProblemKey[] }
/** URLs que podem ir ao IndexNow: sem problema bloqueante, e que nunca foram enviadas OU mudaram depois do último envio. A mesma URL sem mudança NÃO é reenviada. */
export function selectUnsent(rows: SubmissionCandidate[], sentAt: Map<string, string>, force = false): { send: SubmissionCandidate[]; skipped_unchanged: number; skipped_problem: number } {
  let skippedUnchanged = 0, skippedProblem = 0;
  const send: SubmissionCandidate[] = [];
  for (const r of rows) {
    if (blocksSubmission(r.problems)) { skippedProblem++; continue; }
    const at = sentAt.get(r.id);
    if (!force && at && Date.parse(r.changed_at) <= Date.parse(at)) { skippedUnchanged++; continue; }
    send.push(r);
  }
  return { send, skipped_unchanged: skippedUnchanged, skipped_problem: skippedProblem };
}

// ------------------------------------------------------------------------------------------------------------ fila de prioridade ("o que indexar primeiro")
export interface PlanInput { row: UrlRow; google: IndexState; bingOrNowSent: boolean; nodeApproved: boolean; nowMs: number }
export interface PlanItem { url_id: string; url: string; score: number; reasons: string[]; google: IndexState }

/** Pontuação: impressões do Search Console (log), nó aprovado da taxonomia, artigo novo, presença no sitemap; quem não está indexado sobe, quem já está sai. */
export function scoreUrl(i: PlanInput): { score: number; reasons: string[] } | null {
  const { row, google } = i;
  if (google === 'indexada') return null;
  const problems = urlProblems(row);
  if (blocksSubmission(problems)) return null;
  const reasons: string[] = [];
  let score = 0;
  if (row.gsc_impressions > 0) { score += Math.min(60, Math.round(Math.log10(row.gsc_impressions + 1) * 15)); reasons.push(`${row.gsc_impressions.toLocaleString('pt-BR')} impressões no Google`); }
  if (i.nodeApproved) { score += 20; reasons.push('pertence a uma área aprovada da taxonomia'); }
  const ageDays = (i.nowMs - Date.parse(row.first_seen)) / 86_400_000;
  if (row.source === 'artigo' && ageDays <= 14) { score += 25; reasons.push('artigo novo (menos de 14 dias)'); }
  else if (ageDays <= 14) { score += 10; reasons.push('URL nova no inventário'); }
  if (row.in_sitemap) { score += 5; reasons.push('está no sitemap'); }
  if (google === 'nao_indexada') { score += 15; reasons.push('o Google disse que não está indexada'); }
  else if (google === 'desconhecido') reasons.push('estado no Google ainda desconhecido');
  if (i.bingOrNowSent) score -= 10;
  return { score, reasons };
}
export function buildPlan(inputs: PlanInput[], limit = 500): { queue: PlanItem[]; excluded: { indexed: number; blocked: number } } {
  const queue: PlanItem[] = [];
  let indexed = 0, blocked = 0;
  for (const i of inputs) {
    if (i.google === 'indexada') { indexed++; continue; }
    const s = scoreUrl(i);
    if (!s) { blocked++; continue; }
    queue.push({ url_id: i.row.id, url: i.row.url, score: s.score, reasons: s.reasons, google: i.google });
  }
  queue.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
  return { queue: queue.slice(0, limit), excluded: { indexed, blocked } };
}

// ------------------------------------------------------------------------------------------------------------ cobertura
export interface CoverageBucket { key: string; label: string; urls: number; indexed: number; not_indexed: number; sent: number; unknown: number; problems: number }
export function coverageBy(rows: UrlRow[], google: Map<string, IndexState>, sent: Set<string>, keyOfRow: (r: UrlRow) => { key: string; label: string }): CoverageBucket[] {
  const map = new Map<string, CoverageBucket>();
  for (const r of rows) {
    const k = keyOfRow(r);
    const b = map.get(k.key) || { key: k.key, label: k.label, urls: 0, indexed: 0, not_indexed: 0, sent: 0, unknown: 0, problems: 0 };
    const st = google.get(r.id) ?? 'desconhecido';
    b.urls++;
    if (st === 'indexada') b.indexed++; else if (st === 'nao_indexada') b.not_indexed++; else b.unknown++;
    if (sent.has(r.id)) b.sent++;
    if (urlProblems(r).length) b.problems++;
    map.set(k.key, b);
  }
  return [...map.values()].sort((a, b) => b.urls - a.urls || a.label.localeCompare(b.label));
}

// ------------------------------------------------------------------------------------------------------------ higiene
export type Severity = 'alta' | 'media' | 'baixa' | 'info';
export interface HygieneItem { key: string; label: string; ok: boolean; applicable: boolean; severity: Severity; detail: string; evidence: Record<string, unknown>; fix: string | null }

export interface HostEvidence {
  host: string; primary: boolean;
  robots: { state: 'ok' | 'ausente' | 'erro'; rules?: RobotsRules; error?: string };
  llms: boolean | null;
  https: { state: 'ok' | 'certificado_invalido' | 'erro' | 'nao_testado'; error?: string };
  httpProbes: Array<{ url: string; status: number | null; location: string | null; ok: boolean }>;
  rootSoft404: Soft404Verdict | null;
  hreflang: HreflangEvidence | null;
}
/** O que a página inicial diz sobre idiomas/países (hreflang) e se as alternativas respondem de volta. */
export interface HreflangEvidence {
  present: boolean; selfRef: boolean; xDefault: boolean; languages: string[]; invalidCodes: string[]; duplicateLangs: string[];
  /** alternativas (do projeto) que NÃO apontam de volta para a página; null = não foi possível conferir */
  missingReturn: string[] | null; foreignAlternates: string[];
}
export interface SitemapFileEvidence { url: string; kind: 'index' | 'urls' | 'erro'; status: number | null; urls: number; hreflangLinks?: number; withLastmod: number; distinctLastmod: number; newestLastmod: string | null; children: string[]; foreignEntries: number; truncated: boolean; error?: string }
export interface HygieneEvidence {
  hosts: HostEvidence[];
  sitemaps: { declared: string[]; files: SitemapFileEvidence[]; totalEntries: number; uniqueEntries: number };
  inventory: { languages?: string[]; total: number; checked: number; outsideSitemap: string[]; soft404: string[]; noindex: string[]; canonicalDiverges: string[]; httpErrors: string[]; sitemapRedirects: string[] };
}
const sample = (l: string[], n = 8) => l.slice(0, n);
const plural = (n: number, a: string, b: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? a : b}`;

const CSS_JS_PROBES = ['/wp-content/themes/tema/style.css', '/wp-includes/js/jquery/jquery.min.js', '/assets/app.js', '/static/main.css', '/wp-content/plugins/x/script.js'];

export function evaluateHygiene(ev: HygieneEvidence): HygieneItem[] {
  const out: HygieneItem[] = [];
  const add = (key: string, label: string, ok: boolean, severity: Severity, detail: string, evidence: Record<string, unknown>, fix: string | null, applicable = true) =>
    out.push({ key, label, ok, applicable, severity: ok || !applicable ? 'info' : severity, detail, evidence, fix: ok || !applicable ? null : fix });
  const primary = ev.hosts.find((h) => h.primary) || ev.hosts[0];
  const files = ev.sitemaps.files;
  const goodFiles = files.filter((f) => f.kind !== 'erro');

  // robots.txt
  const noRobots = ev.hosts.filter((h) => h.robots.state !== 'ok').map((h) => h.host);
  add('robots_existe', 'robots.txt existe em cada site', noRobots.length === 0, 'media',
    noRobots.length ? `Sem robots.txt (ou com erro) em: ${noRobots.join(', ')}.` : 'Todos os sites verificados têm robots.txt.', { hosts: noRobots },
    'Publique um robots.txt na raiz de cada subdomínio, liberando o rastreio e apontando para o sitemap.');
  const withRobots = ev.hosts.filter((h) => h.robots.state === 'ok' && h.robots.rules);
  const noDecl = withRobots.filter((h) => !(h.robots.rules as RobotsRules).sitemaps.length).map((h) => h.host);
  add('robots_declara_sitemap', 'O robots.txt declara o sitemap', noDecl.length === 0 && withRobots.length > 0, 'media',
    withRobots.length === 0 ? 'Não há robots.txt para conferir.' : noDecl.length ? `O robots.txt não tem a linha "Sitemap:" em: ${noDecl.join(', ')}.` : 'Todos os robots.txt lidos declaram o sitemap.', { hosts: noDecl },
    'Acrescente "Sitemap: https://seusite/sitemap.xml" ao robots.txt.', withRobots.length > 0);
  const blockAll = withRobots.filter((h) => (h.robots.rules as RobotsRules).disallowAllForStar).map((h) => h.host);
  add('robots_nao_bloqueia_tudo', 'O robots.txt não bloqueia o site inteiro', blockAll.length === 0, 'alta',
    blockAll.length ? `"Disallow: /" para todos os robôs em: ${blockAll.join(', ')}. O site não será rastreado.` : 'Nenhum robots.txt bloqueia o site inteiro.', { hosts: blockAll },
    'Remova a regra "Disallow: /" do user-agent * (se for um ambiente de testes, mantenha só nele).', withRobots.length > 0);
  const blockedAssets = withRobots.flatMap((h) => CSS_JS_PROBES.filter((p) => !robotsAllows(h.robots.rules as RobotsRules, p, 'googlebot')).map((p) => `${h.host}${p}`));
  add('robots_nao_bloqueia_css_js', 'O robots.txt não bloqueia CSS e JavaScript', blockedAssets.length === 0, 'media',
    blockedAssets.length ? `Caminhos típicos de CSS/JS bloqueados para o Googlebot: ${sample(blockedAssets, 4).join(', ')}.` : 'Nenhum caminho típico de CSS/JS está bloqueado.', { exemplos: sample(blockedAssets) },
    'Libere /wp-content/, /wp-includes/ e as pastas de scripts e estilos: o Google precisa deles para renderizar a página.', withRobots.length > 0);

  // sitemaps
  add('sitemap_existe', 'Há sitemap válido', goodFiles.length > 0, 'alta', goodFiles.length ? `${plural(goodFiles.length, 'arquivo de sitemap lido', 'arquivos de sitemap lidos')}.` : 'Nenhum sitemap válido foi encontrado.', { declarados: ev.sitemaps.declared },
    'Gere o sitemap (Rank Math, Yoast ou o gerador do site) e declare no robots.txt.');
  const brokenFiles = files.filter((f) => f.kind === 'erro');
  add('sitemap_arquivos_ok', 'Todos os arquivos de sitemap respondem', brokenFiles.length === 0, 'media',
    brokenFiles.length ? `${plural(brokenFiles.length, 'arquivo falhou', 'arquivos falharam')}: ${sample(brokenFiles.map((f) => `${f.url} (${f.error || f.status})`), 3).join('; ')}.` : 'Nenhum arquivo de sitemap com erro.', { arquivos: sample(brokenFiles.map((f) => f.url)) },
    'Corrija ou remova do índice os sitemaps que dão erro.', files.length > 0);
  const indexes = goodFiles.filter((f) => f.kind === 'index').map((f) => ({ url: f.url, children: f.children }));
  const gaps = sitemapSeriesGaps(indexes);
  add('sitemap_indice_completo', 'O sitemap índice lista todos os sub-sitemaps', gaps.length === 0, 'alta',
    gaps.length ? `Um índice está atrasado: ${gaps.map((g) => `${g.index} não lista ${sample(g.missing.map((m) => m.split('/').pop() || m), 3).join(', ')}`).join('; ')}.` : 'Os índices listam as mesmas séries de sub-sitemaps.', { atrasados: gaps },
    'Faça o robots.txt apontar para UM índice só (o do plugin de SEO) ou atualize o índice estático para incluir os sub-sitemaps novos.', indexes.length > 1);
  const tiny = goodFiles.filter((f) => f.kind === 'urls' && f.urls <= 2 && /(^|\/)sitemap\.xml$/i.test(new URL(f.url).pathname));
  add('sitemap_principal_curto', 'O sitemap principal não está quase vazio', !(tiny.length && ev.inventory.total >= 50), 'media',
    tiny.length ? `${tiny.map((f) => `${f.url} tem só ${f.urls} URL(s)`).join('; ')}, e o inventário já conhece ${plural(ev.inventory.total, 'URL', 'URLs')}.` : 'O sitemap principal tem URLs suficientes.', { arquivos: tiny.map((f) => f.url) },
    'Inclua as páginas do site no sitemap principal ou remova esse arquivo do índice para não passar sinal de que o site tem 2 páginas.', tiny.length > 0);
  const stale = goodFiles.filter((f) => f.kind === 'urls' && f.urls >= 5 && (f.withLastmod === 0 || f.distinctLastmod === 1));
  add('sitemap_lastmod_real', 'O sitemap tem data de alteração (lastmod) real', stale.length === 0, 'baixa',
    stale.length ? `${plural(stale.length, 'arquivo tem', 'arquivos têm')} lastmod ausente ou igual para todas as URLs (provável data de geração): ${sample(stale.map((f) => f.url), 3).join(', ')}.` : 'Os arquivos têm datas de alteração variadas.', { arquivos: sample(stale.map((f) => f.url)) },
    'Use a data de edição real de cada página: lastmod igual para tudo faz o Google ignorar o campo.', goodFiles.some((f) => f.kind === 'urls'));
  const dupPct = ev.sitemaps.totalEntries ? Math.round(((ev.sitemaps.totalEntries - ev.sitemaps.uniqueEntries) / ev.sitemaps.totalEntries) * 100) : 0;
  add('sitemap_sem_duplicidade', 'Os sitemaps não repetem as mesmas URLs', dupPct < 10, 'media',
    dupPct >= 10 ? `${(ev.sitemaps.totalEntries - ev.sitemaps.uniqueEntries).toLocaleString('pt-BR')} URLs repetidas entre arquivos (${dupPct}% das entradas).` : 'Pouca ou nenhuma URL repetida entre os arquivos.', { total: ev.sitemaps.totalEntries, unicas: ev.sitemaps.uniqueEntries },
    'Deixe cada URL em um só sitemap (apague o arquivo que repete o blog inteiro).', ev.sitemaps.totalEntries > 0);
  const foreign = goodFiles.filter((f) => f.foreignEntries > 0);
  add('sitemap_so_hosts_do_projeto', 'Os sitemaps só listam endereços do próprio projeto', foreign.length === 0, 'baixa',
    foreign.length ? `${plural(foreign.reduce((n, f) => n + f.foreignEntries, 0), 'URL de outro domínio foi ignorada', 'URLs de outros domínios foram ignoradas')} (ex.: ${foreign[0].url}).` : 'Todas as URLs são de hosts do projeto.', { arquivos: sample(foreign.map((f) => f.url)) },
    'Cada site deve listar só as próprias URLs; endereços de terceiros não entram no inventário.', goodFiles.length > 0);
  const huge = goodFiles.filter((f) => f.urls >= MAX_SITEMAP_ENTRIES || f.truncated);
  add('sitemap_tamanho', 'Nenhum sitemap passa do limite (50.000 URLs / 50 MB)', huge.length === 0, 'media', huge.length ? `Arquivo(s) no limite: ${sample(huge.map((f) => f.url), 3).join(', ')}.` : 'Nenhum arquivo no limite.', { arquivos: sample(huge.map((f) => f.url)) },
    'Divida o sitemap em partes de até 50.000 URLs e liste todas no índice.', goodFiles.length > 0);

  // llms.txt
  const noLlms = ev.hosts.filter((h) => h.llms === false).map((h) => h.host);
  const llmsKnown = ev.hosts.some((h) => h.llms !== null);
  add('llms_txt', 'llms.txt presente (opcional)', noLlms.length === 0, 'info', noLlms.length ? `Sem llms.txt em: ${noLlms.join(', ')}. É opcional e o Google ignora; ajuda alguns assistentes de IA.` : 'llms.txt encontrado.', { hosts: noLlms },
    'Opcional: publique um /llms.txt resumindo o site para assistentes de IA.', llmsKnown);

  // HTTPS
  const badTls = ev.hosts.filter((h) => h.https.state === 'certificado_invalido').map((h) => h.host);
  const httpsFail = ev.hosts.filter((h) => h.https.state === 'erro').map((h) => h.host);
  add('https_certificado', 'Todos os hosts têm certificado HTTPS válido', badTls.length === 0 && httpsFail.length === 0, 'alta',
    badTls.length ? `Certificado inválido em: ${badTls.join(', ')}. Navegadores e o Google estranham o endereço.` : httpsFail.length ? `Não foi possível abrir por HTTPS: ${httpsFail.join(', ')}.` : 'Certificados válidos.', { invalidos: badTls, sem_resposta: httpsFail },
    'Emita/renove o certificado do subdomínio (Let\'s Encrypt ou o do painel da hospedagem) ou tire o subdomínio do ar.', ev.hosts.some((h) => h.https.state !== 'nao_testado'));
  const httpBad = ev.hosts.flatMap((h) => h.httpProbes.filter((p) => !p.ok).map((p) => ({ url: p.url, status: p.status })));
  add('https_forcado', 'HTTP redireciona para HTTPS em todas as seções', httpBad.length === 0, 'alta',
    httpBad.length ? `${plural(httpBad.length, 'endereço abre por HTTP sem redirecionar', 'endereços abrem por HTTP sem redirecionar')} para HTTPS (ex.: ${httpBad[0].url} respondeu ${httpBad[0].status ?? 'sem resposta'}).` : 'Todos os endereços testados por HTTP redirecionam para HTTPS.', { exemplos: sample(httpBad.map((p) => `${p.url} -> ${p.status ?? 'sem resposta'}`)) },
    'Force o redirecionamento 301 de http para https em TODO o domínio (regra no .htaccess/servidor, inclusive nas pastas que têm regra própria).', ev.hosts.some((h) => h.httpProbes.length > 0));

  // soft-404 e páginas do inventário
  const soft = ev.inventory.soft404;
  const softRoot = ev.hosts.filter((h) => h.rootSoft404?.soft).map((h) => h.host);
  add('soft404', 'Endereços inexistentes respondem 404 de verdade', soft.length === 0 && softRoot.length === 0, 'alta',
    soft.length || softRoot.length ? `${plural(soft.length, 'URL responde', 'URLs respondem')} 200 com conteúdo de "não encontrada"${softRoot.length ? `; e ${softRoot.join(', ')} responde 200 para qualquer caminho` : ''}. O Google trata como soft-404 e o rastreio pode se perder em endereços infinitos.` : 'Nenhum soft-404 encontrado nas URLs verificadas.', { exemplos: sample(soft) },
    'No servidor, remova o "fallback" que devolve a página-mãe para qualquer subcaminho (ex.: regra de reescrita no .htaccess da pasta) e devolva 404 de verdade.', ev.inventory.checked > 0 || ev.hosts.some((h) => h.rootSoft404 !== null));
  add('fora_do_sitemap', 'Páginas do Google e artigos estão no sitemap', ev.inventory.outsideSitemap.length === 0, 'media',
    ev.inventory.outsideSitemap.length ? `${plural(ev.inventory.outsideSitemap.length, 'página aparece no Google ou nos artigos mas não está em sitemap algum', 'páginas aparecem no Google ou nos artigos mas não estão em sitemap algum')} (ex.: ${ev.inventory.outsideSitemap[0]}).` : 'Todas as páginas conhecidas estão no sitemap.', { exemplos: sample(ev.inventory.outsideSitemap) },
    'Inclua essas páginas no sitemap; se alguma não deve ser indexada (ex.: página de links), marque noindex de propósito.', ev.inventory.total > 0);
  add('noindex', 'Nenhuma página importante com noindex', ev.inventory.noindex.length === 0, 'media', ev.inventory.noindex.length ? `${plural(ev.inventory.noindex.length, 'URL pede', 'URLs pedem')} para não ser indexada (ex.: ${ev.inventory.noindex[0]}).` : 'Nenhum noindex nas URLs verificadas.', { exemplos: sample(ev.inventory.noindex) },
    'Se a página deve aparecer no Google, tire o noindex (meta robots ou X-Robots-Tag).', ev.inventory.checked > 0);
  add('canonical', 'O canonical aponta para a própria página', ev.inventory.canonicalDiverges.length === 0, 'media', ev.inventory.canonicalDiverges.length ? `${plural(ev.inventory.canonicalDiverges.length, 'URL tem', 'URLs têm')} canonical apontando para outra página (ex.: ${ev.inventory.canonicalDiverges[0]}).` : 'Os canonicals verificados são autorreferentes.', { exemplos: sample(ev.inventory.canonicalDiverges) },
    'Ajuste o canonical de cada página para o próprio endereço (a menos que seja duplicata de propósito).', ev.inventory.checked > 0);
  add('erros_http', 'Nenhuma URL do inventário dá erro', ev.inventory.httpErrors.length === 0, 'alta', ev.inventory.httpErrors.length ? `${plural(ev.inventory.httpErrors.length, 'URL responde', 'URLs respondem')} erro 4xx/5xx (ex.: ${ev.inventory.httpErrors[0]}).` : 'Nenhum erro HTTP nas URLs verificadas.', { exemplos: sample(ev.inventory.httpErrors) },
    'Corrija a página ou tire a URL do sitemap e dos links internos.', ev.inventory.checked > 0);
  add('sitemap_sem_redirecionamentos', 'Os sitemaps só listam URLs finais (sem redirecionamento)', ev.inventory.sitemapRedirects.length === 0, 'media', ev.inventory.sitemapRedirects.length ? `${plural(ev.inventory.sitemapRedirects.length, 'URL do sitemap redireciona', 'URLs do sitemap redirecionam')} (ex.: ${ev.inventory.sitemapRedirects[0]}).` : 'Nenhuma URL de sitemap redireciona.', { exemplos: sample(ev.inventory.sitemapRedirects) },
    'Liste no sitemap o endereço final (o que responde 200).', ev.inventory.checked > 0);

  // idiomas e países: hreflang no HTML e nos sitemaps. Nada aqui supõe país, idioma ou TLD: vale para qualquer site.
  const hl = ev.hosts.filter((h) => h.hreflang?.present);
  const sitemapHreflang = files.reduce((n, f) => n + (f.hreflangLinks || 0), 0);
  const invLangs = ev.inventory.languages || [];
  const multi = new Set([...invLangs.map((l) => l.split('-')[0]), ...hl.flatMap((h) => h.hreflang!.languages.map((l) => l.split('-')[0]))].filter((l) => l !== 'x')).size > 1;
  add('hreflang_presente', 'Site em vários idiomas ou países declara hreflang', !(multi && hl.length === 0 && sitemapHreflang === 0), 'media',
    multi && hl.length === 0 && sitemapHreflang === 0 ? `O inventário tem URLs em ${invLangs.length ? invLangs.join(', ') : 'mais de um idioma'}, mas nem o HTML da página inicial nem os sitemaps declaram hreflang. O Google pode mostrar a versão errada para cada país.` : hl.length || sitemapHreflang ? `hreflang declarado${hl.length ? ` no HTML (${hl.map((h) => h.host).join(', ')})` : ''}${sitemapHreflang ? ` e em ${sitemapHreflang.toLocaleString('pt-BR')} link(s) de sitemap` : ''}.` : 'O site não usa hreflang (e o inventário não indica mais de um idioma).', { idiomas: invLangs, no_html: hl.map((h) => h.host), nos_sitemaps: sitemapHreflang },
    'Declare hreflang em cada página (ou no sitemap, com xhtml:link) listando todas as versões de idioma/país, inclusive a própria página.', multi || hl.length > 0 || sitemapHreflang > 0);
  const noSelf = hl.filter((h) => !h.hreflang!.selfRef);
  add('hreflang_autorreferencia', 'hreflang lista a própria página', noSelf.length === 0, 'media', noSelf.length ? `A lista de hreflang não inclui a própria página em: ${noSelf.map((h) => h.host).join(', ')}.` : 'hreflang com auto-referência.', { hosts: noSelf.map((h) => h.host) },
    'Cada página com hreflang precisa listar a si mesma além das outras versões.', hl.length > 0);
  const noDefault = hl.filter((h) => !h.hreflang!.xDefault);
  add('hreflang_x_default', 'hreflang tem uma versão padrão (x-default)', noDefault.length === 0, 'baixa', noDefault.length ? `Sem x-default em: ${noDefault.map((h) => h.host).join(', ')}. É recomendado para quem não casa com nenhum idioma/país listado.` : 'x-default presente.', { hosts: noDefault.map((h) => h.host) },
    'Acrescente <link rel="alternate" hreflang="x-default" href="..."> apontando para a versão padrão (seletor de idioma ou versão principal).', hl.length > 0);
  const badCodes = hl.flatMap((h) => h.hreflang!.invalidCodes.map((c) => `${h.host}: ${c}`));
  const dups = hl.flatMap((h) => h.hreflang!.duplicateLangs.map((c) => `${h.host}: ${c}`));
  add('hreflang_codigos_validos', 'Códigos de hreflang são válidos e únicos', badCodes.length === 0 && dups.length === 0, 'media',
    badCodes.length || dups.length ? `${badCodes.length ? `Códigos inválidos: ${sample(badCodes, 4).join('; ')}. ` : ''}${dups.length ? `Idiomas repetidos para endereços diferentes: ${sample(dups, 4).join('; ')}.` : ''}` : 'Códigos de idioma/país válidos.', { exemplos: [...sample(badCodes, 4), ...sample(dups, 4)] },
    'Use idioma ISO 639-1 com país ISO 3166-1 opcional (en, en-GB, es-419, pt-BR, zh-Hant) e um único endereço por idioma/país.', hl.length > 0);
  const noReturn = hl.flatMap((h) => (h.hreflang!.missingReturn || []).map((u) => u));
  const returnUnknown = hl.length > 0 && hl.every((h) => h.hreflang!.missingReturn === null);
  add('hreflang_retorno', 'As versões de idioma apontam de volta (links de retorno)', noReturn.length === 0, 'media',
    noReturn.length ? `${plural(noReturn.length, 'versão não aponta', 'versões não apontam')} de volta para a página inicial (ex.: ${noReturn[0]}). Sem retorno bilateral o Google ignora o hreflang.` : returnUnknown ? 'Não foi possível conferir os links de retorno agora.' : 'As versões conferidas apontam de volta.', { exemplos: sample(noReturn) },
    'Cada versão de idioma deve listar todas as outras, inclusive a página de origem.', hl.length > 0 && !returnUnknown);
  const foreignAlt = hl.flatMap((h) => h.hreflang!.foreignAlternates);
  add('hreflang_dominios', 'hreflang aponta só para domínios do projeto', foreignAlt.length === 0, 'info', foreignAlt.length ? `${plural(foreignAlt.length, 'alternativa está', 'alternativas estão')} em domínios fora do projeto (não verificadas): ${sample(foreignAlt, 3).join(', ')}. É normal se o outro país usa outro domínio e ele também é seu.` : 'Todas as alternativas são do projeto.', { exemplos: sample(foreignAlt) },
    'Se o domínio de outro país também é seu, cadastre-o como projeto para incluí-lo no inventário.', hl.length > 0);
  void primary;
  return out;
}

export const SEVERITY_ORDER: Record<Severity, number> = { alta: 0, media: 1, baixa: 2, info: 3 };
