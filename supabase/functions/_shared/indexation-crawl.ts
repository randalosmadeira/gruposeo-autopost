/**
 * Rede educada da Indexação: visita SOMENTE endereços de hosts do projeto, com as proteções do resto do sistema
 * (http/https, sem IP literal, DNS público, redirecionamentos revalidados a cada salto) e as regras deste módulo:
 *  - agente genérico "ZicaAI-Indexacao/1.0" (sem e-mail, sem endereço de pessoa);
 *  - 1 requisição por segundo por host; robots.txt respeitado; no máximo 3 redirecionamentos;
 *  - tempo e tamanho limitados por resposta. Tudo injetável (`CrawlDeps`) para teste sem rede.
 */
import { isPublicIPv4, parseSafeUrl, type Deps } from './profile-analyze-core.ts';
import {
  INDEX_UA, MAX_REDIRECTS, MAX_SITEMAP_ENTRIES, belongsToProject, bytesToText, fingerprintOf, isSoft404Page, isSoft404Template, makeLimiter, normalizeUrl, pageSignals, parentOf, parseRobotsRules,
  parseSitemap, robotsAllows, sentinelUrlFor, type Fingerprint, type ProjectHosts, type RobotsRules, type SitemapEntry, type SitemapFileEvidence, type Soft404Verdict,
} from './indexation-core.ts';

export interface CrawlDeps extends Deps { sleep: (ms: number) => Promise<void> }
export interface Crawler { deps: CrawlDeps; hosts: ProjectHosts; limit: (host: string) => Promise<void>; robots: Map<string, Promise<RobotsOutcome>>; /** agente próprio para TODAS as visitas deste visitante (inclui robots.txt e sitemaps) */ ua?: string }
export type RobotsOutcome = { state: 'ok'; rules: RobotsRules; text: string } | { state: 'ausente' } | { state: 'erro'; error: string };

export const makeCrawler = (deps: CrawlDeps, hosts: ProjectHosts, ua?: string): Crawler => ({ deps, hosts, limit: makeLimiter(deps), robots: new Map(), ...(ua ? { ua } : {}) });

export type FetchErrorCode = 'certificado_invalido' | 'tempo_esgotado' | 'host_nao_permitido' | 'endereco_privado_ou_nao_resolvido' | 'url_invalida' | 'falha_de_rede';
/** Traduz a falha do fetch em um código curto (sem a mensagem original, que pode trazer nomes internos). */
export function classifyFetchError(e: unknown): FetchErrorCode {
  const m = `${e instanceof Error ? `${e.name} ${e.message} ${String((e as { cause?: unknown }).cause ?? '')}` : String(e)}`;
  if (/certificate|cert_|ssl|tls|unknownissuer|self[- ]signed|handshake/i.test(m)) return 'certificado_invalido';
  if (/abort|timeout|timed out/i.test(m)) return 'tempo_esgotado';
  return 'falha_de_rede';
}

export interface GetOptions { method?: 'GET' | 'HEAD'; maxBytes?: number; timeoutMs?: number; accept?: string; binary?: boolean; checkRobots?: boolean; allowOffProject?: boolean; /** agente próprio (sem e-mail nem endereço de pessoa); o padrão é o da Indexação */ ua?: string }
export interface Hop { url: string; status: number; location: string | null }
export type GetResult =
  | { ok: true; status: number; finalUrl: string; hops: Hop[]; headers: Headers; text: string; bytes: Uint8Array | null; truncated: boolean; redirectTo: string | null; tooManyRedirects: boolean; leftProject: boolean }
  | { ok: false; error: FetchErrorCode | 'bloqueada_pelo_robots' | 'robots_inacessivel'; hops: Hop[] };

async function readBody(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = res.body?.getReader?.();
  if (!reader) { const b = new Uint8Array(await res.arrayBuffer()); return b.length > maxBytes ? { bytes: b.slice(0, maxBytes), truncated: true } : { bytes: b, truncated: false }; }
  const chunks: Uint8Array[] = [];
  let total = 0, truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > maxBytes) { chunks.push(value.slice(0, maxBytes - total)); total = maxBytes; truncated = true; void reader.cancel().catch(() => undefined); break; }
    chunks.push(value); total += value.length;
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  return { bytes: all, truncated };
}

/** GET (ou HEAD) educado. Nunca lança: devolve `ok:false` com um código curto. */
export async function politeGet(c: Crawler, rawUrl: string, opts: GetOptions = {}): Promise<GetResult> {
  const maxBytes = opts.maxBytes ?? 400 * 1024;
  const hops: Hop[] = [];
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = parseSafeUrl(current);
    if ('error' in parsed) return { ok: false, error: 'url_invalida', hops };
    const host = parsed.url.hostname.toLowerCase();
    if (!opts.allowOffProject && !belongsToProject(host, c.hosts)) {
      // redirecionou para fora do projeto: não visitamos terceiros; o salto anterior já tem o destino em `redirectTo`
      const prev = hops[hops.length - 1];
      if (prev) return { ok: true, status: prev.status, finalUrl: prev.url, hops, headers: new Headers(), text: '', bytes: null, truncated: false, redirectTo: current, tooManyRedirects: false, leftProject: true };
      return { ok: false, error: 'host_nao_permitido', hops };
    }
    if (opts.checkRobots !== false && hop === 0 && !/\/robots\.txt$/i.test(parsed.url.pathname)) {
      const rb = await robotsFor(c, host);
      if (rb.state === 'erro') return { ok: false, error: 'robots_inacessivel', hops };
      if (rb.state === 'ok' && !robotsAllows(rb.rules, parsed.url.pathname + parsed.url.search)) return { ok: false, error: 'bloqueada_pelo_robots', hops };
    }
    let addresses: string[] = [];
    try { addresses = await c.deps.lookupA(host); } catch { addresses = []; }
    if (!addresses.length || addresses.some((ip) => !isPublicIPv4(ip))) return { ok: false, error: 'endereco_privado_ou_nao_resolvido', hops };
    await c.limit(host);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 12_000);
    let res: Response;
    try {
      res = await c.deps.fetchFn(parsed.url.href, { method: opts.method ?? 'GET', redirect: 'manual', headers: { 'User-Agent': opts.ua || c.ua || INDEX_UA, Accept: opts.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5' }, signal: ctl.signal });
    } catch (e) { clearTimeout(timer); return { ok: false, error: ctl.signal.aborted ? 'tempo_esgotado' : classifyFetchError(e), hops }; }
    clearTimeout(timer);
    const location = res.headers.get('location');
    hops.push({ url: parsed.url.href, status: res.status, location });
    if (res.status >= 300 && res.status < 400 && location) {
      let next: string;
      try { next = new URL(location, parsed.url).href; } catch { return { ok: false, error: 'url_invalida', hops }; }
      void res.body?.cancel?.().catch(() => undefined);
      if (hop === MAX_REDIRECTS) return { ok: true, status: res.status, finalUrl: parsed.url.href, hops, headers: res.headers, text: '', bytes: null, truncated: false, redirectTo: next, tooManyRedirects: true, leftProject: false };
      current = next;
      continue;
    }
    let bytes: Uint8Array | null = null, truncated = false, text = '';
    if (opts.method !== 'HEAD') {
      try {
        const b = await readBody(res, maxBytes);
        truncated = b.truncated;
        if (opts.binary) bytes = b.bytes; else text = new TextDecoder('utf-8', { fatal: false }).decode(b.bytes);
      } catch { return { ok: false, error: 'tempo_esgotado', hops }; }
    }
    return { ok: true, status: res.status, finalUrl: parsed.url.href, hops, headers: res.headers, text, bytes, truncated, redirectTo: hops.length > 1 ? parsed.url.href : null, tooManyRedirects: false, leftProject: false };
  }
  return { ok: false, error: 'falha_de_rede', hops };
}

/** robots.txt do host, lido uma vez por execução. 404/410 = tudo liberado; 5xx ou falha de rede = não verificamos (respeito por padrão). */
export function robotsFor(c: Crawler, host: string): Promise<RobotsOutcome> {
  let p = c.robots.get(host);
  if (!p) {
    p = (async (): Promise<RobotsOutcome> => {
      const r = await politeGet(c, `https://${host}/robots.txt`, { maxBytes: 256 * 1024, timeoutMs: 8000, accept: 'text/plain,*/*;q=0.5', checkRobots: false });
      if (r.ok === false) return { state: 'erro', error: r.error };
      if (r.status >= 500) return { state: 'erro', error: `http_${r.status}` };
      if (r.status !== 200 || /html/i.test(r.headers.get('content-type') || '')) return { state: 'ausente' };
      return { state: 'ok', rules: parseRobotsRules(r.text), text: r.text };
    })();
    c.robots.set(host, p);
  }
  return p;
}

// ------------------------------------------------------------------------------------------------------------ sitemaps
export interface WalkedEntry { url: string; host: string; path: string; key: string; lastmod: string | null; file: string }
export interface WalkResult {
  entries: WalkedEntry[]; files: SitemapFileEvidence[]; declared: string[]; rejectedForeign: number; rejectedInvalid: number; httpNormalized: number;
  truncated: boolean; remaining: number; completeHosts: Set<string>; totalEntries: number;
}
/** `optional` = endereços só PALPITADOS (caminhos comuns): se não existirem ou falharem, não viram "sitemap quebrado" no relatório. */
export interface WalkOptions { startUrls: string[]; optional?: Set<string>; maxFiles?: number; budgetMs?: number; startedAt?: number }

/** Lê sitemaps (urlset, índice, .gz), tolerando erro de arquivo. Entradas de hosts de terceiros são recusadas e contadas. */
export async function walkSitemaps(c: Crawler, o: WalkOptions): Promise<WalkResult> {
  const maxFiles = o.maxFiles ?? 40;
  const started = o.startedAt ?? c.deps.now();
  const queue = [...new Set(o.startUrls)];
  const seen = new Set<string>();
  const res: WalkResult = { entries: [], files: [], declared: [...o.startUrls].filter((u) => !o.optional?.has(normalizeUrl(u)?.key ?? '')), rejectedForeign: 0, rejectedInvalid: 0, httpNormalized: 0, truncated: false, remaining: 0, completeHosts: new Set(), totalEntries: 0 };
  const failedHosts = new Set<string>();
  const seenHosts = new Set<string>();
  const byKey = new Set<string>();
  while (queue.length) {
    if (seen.size >= maxFiles || (o.budgetMs && c.deps.now() - started > o.budgetMs)) { res.truncated = true; res.remaining = queue.length; break; }
    const fileUrl = queue.shift() as string;
    const nf = normalizeUrl(fileUrl);
    if (!nf || seen.has(nf.key)) continue;
    seen.add(nf.key);
    if (!belongsToProject(nf.host, c.hosts)) { res.rejectedForeign++; continue; }
    seenHosts.add(nf.host);
    const speculative = !!o.optional?.has(nf.key);
    const g = await politeGet(c, nf.url, { maxBytes: 8 * 1024 * 1024, timeoutMs: 20_000, accept: 'application/xml,text/xml,application/gzip,*/*;q=0.5', binary: true, checkRobots: false });
    const ev: SitemapFileEvidence = { url: nf.url, kind: 'erro', status: g.ok ? g.status : null, urls: 0, withLastmod: 0, distinctLastmod: 0, newestLastmod: null, children: [], foreignEntries: 0, truncated: false };
    if (g.ok === false) { ev.error = g.error; failedHosts.add(nf.host); if (!speculative) res.files.push(ev); continue; }
    if (g.status !== 200 || !g.bytes) { ev.error = `http_${g.status}`; if (g.status >= 500) failedHosts.add(nf.host); if (!speculative || g.status >= 500) res.files.push(ev); continue; }
    let parsed;
    try {
      const t = await bytesToText(g.bytes, 50 * 1024 * 1024);
      ev.truncated = t.truncated || g.truncated;
      parsed = parseSitemap(t.text);
    } catch { parsed = null; }
    if (!parsed) { ev.error = 'nao_e_sitemap'; if (!speculative) res.files.push(ev); continue; }
    if (ev.truncated) failedHosts.add(nf.host);
    if (parsed.kind === 'index') {
      ev.kind = 'index';
      for (const e of parsed.entries) {
        const child = normalizeUrl(e.loc, nf.url);
        if (!child) { res.rejectedInvalid++; continue; }
        ev.children.push(child.url);
        if (belongsToProject(child.host, c.hosts)) { if (!seen.has(child.key)) queue.push(child.url); } else res.rejectedForeign++;
      }
      res.files.push(ev);
      continue;
    }
    ev.kind = 'urls';
    ev.hreflangLinks = parsed.hreflangLinks;
    const lms = new Set<string>();
    for (const e of parsed.entries as SitemapEntry[]) {
      const raw = String(e.loc);
      if (/^http:\/\//i.test(raw)) res.httpNormalized++;
      const n = normalizeUrl(raw, nf.url);
      if (!n) { res.rejectedInvalid++; continue; }
      res.totalEntries++;
      ev.urls++;
      if (e.lastmod) { ev.withLastmod++; lms.add(e.lastmod); if (!ev.newestLastmod || e.lastmod > ev.newestLastmod) ev.newestLastmod = e.lastmod; }
      if (!belongsToProject(n.host, c.hosts)) { ev.foreignEntries++; res.rejectedForeign++; continue; }
      if (res.entries.length >= MAX_SITEMAP_ENTRIES * 2) { res.truncated = true; continue; }
      if (byKey.has(`${n.key}|${nf.key}`)) continue;
      byKey.add(`${n.key}|${nf.key}`);
      res.entries.push({ url: n.url, host: n.host, path: n.path, key: n.key, lastmod: e.lastmod, file: nf.url });
    }
    ev.distinctLastmod = lms.size;
    res.files.push(ev);
  }
  // um host só é "completo" quando todos os seus arquivos foram lidos sem erro e a leitura não foi cortada
  for (const h of seenHosts) if (!failedHosts.has(h) && !res.truncated) res.completeHosts.add(h);
  return res;
}

// ------------------------------------------------------------------------------------------------------------ verificação de uma URL
export interface CheckOutcome {
  status: number | null; canonical: string | null; robotsMeta: string | null; xRobots: string | null; redirectTo: string | null; error: string | null;
  fingerprint: Fingerprint | null; final: string | null; htmlLang: string | null; hreflang: Array<{ lang: string; href: string }>;
}
/** Visita a URL (GET limitado) e extrai o que importa para indexação. */
export async function checkUrl(c: Crawler, url: string): Promise<CheckOutcome> {
  const g = await politeGet(c, url, { maxBytes: 400 * 1024 });
  if (g.ok === false) return { status: null, canonical: null, robotsMeta: null, xRobots: null, redirectTo: null, error: g.error, fingerprint: null, final: null, htmlLang: null, hreflang: [] };
  const isHtml = /html|xml/i.test(g.headers.get('content-type') || '') || /<html|<head|<body/i.test(g.text.slice(0, 2000));
  const sig = isHtml && g.text ? pageSignals(g.text, g.headers, g.finalUrl) : null;
  // o estado da URL é o da PRIMEIRA resposta (um 301 continua sendo 301); o conteúdo lido é o do destino final
  return {
    status: g.hops[0]?.status ?? g.status, canonical: sig?.canonical ?? null, robotsMeta: sig?.robotsMeta ?? null, xRobots: (g.headers.get('x-robots-tag') || '').toLowerCase().replace(/\s+/g, '').slice(0, 300) || null,
    redirectTo: g.redirectTo, error: null, fingerprint: sig && g.hops.length === 1 ? fingerprintOf(g.status, sig) : null, final: g.finalUrl, htmlLang: sig?.htmlLang ?? null, hreflang: sig?.hreflang ?? [],
  };
}

export interface SoftProbe { hubUrl: string; hub: Fingerprint | null; sentinel: Fingerprint | null; template: Soft404Verdict }
/** Para um diretório: lê a página-mãe e uma "isca" inexistente do mesmo diretório. (2 requisições por diretório, guardadas em cache pelo chamador.) */
export async function probeSoft404(c: Crawler, parent: string, token: string): Promise<SoftProbe> {
  const hubR = await checkUrl(c, parent);
  const senR = await checkUrl(c, sentinelUrlFor(parent, token));
  const template = isSoft404Template(senR.fingerprint, hubR.fingerprint, parent);
  return { hubUrl: parent, hub: hubR.fingerprint, sentinel: senR.fingerprint, template };
}
export function softVerdictFor(url: string, out: CheckOutcome, probe: SoftProbe | null): Soft404Verdict {
  if (!out.fingerprint || !probe) return { soft: false, reason: null };
  return isSoft404Page(out.fingerprint, url, probe.sentinel, probe.hub, probe.hubUrl);
}
export const softParentOf = (url: string) => parentOf(url);
