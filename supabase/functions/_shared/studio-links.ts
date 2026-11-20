/**
 * Plano de links do Estúdio: INTERNOS (hub e páginas filhas, vindos de páginas fortes, âncoras variadas, nenhuma página órfã) e EXTERNOS (fontes oficiais e
 * páginas de referência verificadas por HEAD/200). Nada de rede automatizada de âncora exata: âncora externa descreve a fonte, nunca repete a palavra-chave
 * que se quer ranquear, e o plano só aponta para fontes oficiais ou páginas de referência verificadas.
 * Sem rede aqui, exceto `verifyLinks` (HEAD/GET injetados: os testes passam um `fetch` gravado).
 */
import type { PlannedLink, SourceRef } from './studio-types.ts';
import { slugifySegment } from './studio-url.ts';

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tok = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
const overlap = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.min(a.size, b.size); };

export interface SitePage { url: string; title: string; slugPath?: string | null; type?: string | null; keywords?: string[]; impressions?: number; inlinks?: number; studio?: boolean; published?: boolean; place?: string | null }
export interface LinkPlanInput {
  page: { url: string; slugPath: string; title: string; subject?: string | null; place?: string | null; keywords: string[]; type: string; language?: string };
  site: SitePage[];
  /** âncoras já usadas por destino (para variar) */
  usedAnchors?: Record<string, string[]>;
  minLinks: number;
  maxLinks?: number;
}
export interface InternalPlan { links: PlannedLink[]; inbound: Array<{ from: string; to: string; reason: string }>; missing: number }

/** Variantes de âncora para UM destino: título, assunto, assunto + lugar, forma de pergunta, descrição. Nunca repete uma âncora já usada naquele destino. */
export function anchorVariants(target: SitePage): string[] {
  const out: string[] = [];
  const title = target.title.replace(/\s+[|\-–—]\s+.*$/, '').trim();
  const subject = (target.keywords || [])[0];
  const place = target.place || '';
  if (title) out.push(title);
  if (subject && place) out.push(`${subject} em ${place}`);
  if (subject) out.push(subject);
  if (subject) out.push(`saiba mais sobre ${subject}`);
  if (place) out.push(`atendimento em ${place}`);
  out.push(title.length > 40 ? `${title.slice(0, 40).replace(/\s+\S*$/, '')}…` : `ver ${title.toLowerCase()}`);
  return Array.from(new Set(out.map((a) => a.trim()).filter((a) => a.length >= 4)));
}
const pickAnchor = (target: SitePage, used: string[]): string => {
  const usedN = new Set(used.map(norm));
  return anchorVariants(target).find((a) => !usedN.has(norm(a))) || target.title;
};

/** Hub e páginas filhas, páginas fortes do tema e irmãs. `inbound` sugere o link de VOLTA (o hub deve apontar para a nova página). */
export function planInternalLinks(input: LinkPlanInput): InternalPlan {
  const { page, site } = input;
  const used = input.usedAnchors || {};
  const max = input.maxLinks ?? Math.max(input.minLinks + 3, 6);
  const links: PlannedLink[] = [];
  const inbound: InternalPlan['inbound'] = [];
  const add = (t: SitePage, reason: string) => {
    if (t.url === page.url || links.some((l) => l.url === t.url) || links.length >= max) return;
    if (t.published === false) return; // só aponta para página que já existe no ar
    const anchor = pickAnchor(t, used[t.url] || []);
    used[t.url] = [...(used[t.url] || []), anchor];
    links.push({ url: t.url, anchor, kind: 'interno', reason });
  };
  const levels = page.slugPath.split('/').filter(Boolean);
  const parentPath = levels.slice(0, -1).join('/');
  const parent = parentPath ? site.find((s) => (s.slugPath || '').replace(/^\/+|\/+$/g, '') === parentPath) : null;
  if (parent) { add(parent, 'hub (página-mãe na hierarquia)'); inbound.push({ from: parent.url, to: page.url, reason: 'o hub deve apontar para a página filha (hub e páginas filhas)' }); }
  const mine = tok([page.title, page.subject || '', ...page.keywords].join(' '));
  const related = site.filter((s) => s.url !== page.url && s.published !== false).map((s) => ({ s, rel: overlap(mine, tok([s.title, ...(s.keywords || [])].join(' '))) })).filter((x) => x.rel > 0);
  for (const { s } of related.filter((x) => parentPath && (x.s.slugPath || '').startsWith(`${parentPath}/`)).sort((a, b) => b.rel - a.rel).slice(0, 2)) add(s, 'página irmã do mesmo hub');
  for (const { s } of [...related].sort((a, b) => (b.s.impressions || 0) - (a.s.impressions || 0) || b.rel - a.rel).slice(0, 3)) add(s, (s.impressions || 0) > 0 ? `página forte do tema (${s.impressions} impressões no Google)` : 'página relacionada do tema');
  // páginas órfãs do site que têm tema em comum: aproveita para dar um link de entrada (reduz órfãs)
  for (const { s } of related.filter((x) => (x.s.inlinks ?? 1) === 0).slice(0, 2)) add(s, 'ajuda uma página órfã (sem links de entrada) do mesmo tema');
  return { links, inbound, missing: Math.max(0, input.minLinks - links.length) };
}

/** Páginas sem nenhum link de entrada, dado o conjunto de links internos conhecidos (de → para). */
export function findOrphans(pages: Array<{ url: string }>, edges: Array<{ from: string; to: string }>, home?: string): string[] {
  const inbound = new Set(edges.filter((e) => e.from !== e.to).map((e) => e.to));
  return pages.map((p) => p.url).filter((u) => u !== home && !inbound.has(u));
}

/** Variedade de âncoras: nenhuma âncora pode concentrar mais que `maxShare` dos links para o mesmo destino, e destino com 3+ links precisa de 2+ âncoras diferentes. */
export function anchorVariety(links: Array<{ to: string; anchor: string }>, maxShare = 0.6): { ok: boolean; problems: string[] } {
  const by = new Map<string, string[]>();
  for (const l of links) by.set(l.to, [...(by.get(l.to) || []), norm(l.anchor)]);
  const problems: string[] = [];
  for (const [to, anchors] of by) {
    if (anchors.length < 3) continue;
    const freq = new Map<string, number>(); for (const a of anchors) freq.set(a, (freq.get(a) || 0) + 1);
    const [top, n] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n / anchors.length > maxShare) problems.push(`${to}: a âncora "${top}" aparece em ${n} de ${anchors.length} links`);
  }
  return { ok: problems.length === 0, problems };
}

// ------------------------------------------------------------------------------------------------------------ externos
const OFFICIAL_HOST = /(?:^|\.)(?:gov(?:\.[a-z]{2})?|jus\.br|leg\.br|mp\.br|def\.br|mil\.br|edu(?:\.[a-z]{2})?|gob\.[a-z]{2}|gouv\.[a-z]{2}|europa\.eu|who\.int|un\.org|oecd\.org|ibge\.gov\.br|oab\.org\.br|cfm\.org\.br|cnj\.jus\.br)$/i;
export const isOfficialHost = (host: string): boolean => OFFICIAL_HOST.test(String(host || '').toLowerCase());
const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

export interface ExternalPlan { links: PlannedLink[]; rejected: Array<{ url: string; why: string }>; missing: number }
/**
 * Escolhe as fontes externas: https, fonte oficial OU página de referência já verificada (200); âncora = nome da fonte (nunca a palavra-chave da página);
 * o mesmo destino não entra duas vezes; links de volta (rede combinada) não são planejados. `targetKeywords` serve só para recusar âncora de correspondência exata.
 */
export function planExternalLinks(input: { sources: SourceRef[]; targetKeywords: string[]; ownHost: string; min: number; max?: number }): ExternalPlan {
  const links: PlannedLink[] = []; const rejected: ExternalPlan['rejected'] = [];
  const kw = new Set(input.targetKeywords.map(norm).filter(Boolean));
  for (const s of input.sources) {
    const host = hostOf(s.url);
    if (!/^https:\/\//i.test(s.url) || !host) { rejected.push({ url: s.url, why: 'não é um endereço https válido' }); continue; }
    if (host === input.ownHost) { rejected.push({ url: s.url, why: 'é do próprio site (conta como interno)' }); continue; }
    if (links.some((l) => l.url === s.url)) { rejected.push({ url: s.url, why: 'repetido' }); continue; }
    if (s.verified === false) { rejected.push({ url: s.url, why: 'a verificação falhou (a página não respondeu 200)' }); continue; }
    const official = s.official === true || isOfficialHost(host);
    if (!official && s.verified !== true) { rejected.push({ url: s.url, why: 'não é fonte oficial e ainda não foi verificada (HEAD/200)' }); continue; }
    if (kw.has(norm(s.label))) { rejected.push({ url: s.url, why: 'âncora igual à palavra-chave da página (correspondência exata): use o nome da fonte' }); continue; }
    links.push({ url: s.url, anchor: s.label, kind: 'externo', reason: official ? 'fonte oficial' : 'página de referência verificada', verified: s.verified ?? null, rel: 'noopener' });
    if (links.length >= (input.max ?? 6)) break;
  }
  return { links, rejected, missing: Math.max(0, input.min - links.length) };
}

// ------------------------------------------------------------------------------------------------------------ verificação (HEAD/200)
/** AbortSignal.timeout quando existe; senão um AbortController com temporizador (ambientes de teste sem a função estática). */
export function timeoutSignal(ms: number): AbortSignal {
  const S = AbortSignal as unknown as { timeout?: (n: number) => AbortSignal };
  if (typeof S.timeout === 'function') return S.timeout(ms);
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); (t as unknown as { unref?: () => void }).unref?.(); return c.signal;
}
export const isPrivateIp = (ip: string): boolean => /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80)/i.test(ip);
export interface VerifyDeps { fetchFn: typeof fetch; lookupA: (host: string) => Promise<string[]> }
export interface VerifyResult { url: string; ok: boolean; status: number | null; reason: string | null }

/** HEAD (e GET se o servidor recusar HEAD) em cada endereço https público; não segue para rede interna. Até `max` endereços, 4 por vez. */
export async function verifyLinks(urls: string[], deps: VerifyDeps, opts: { max?: number; timeoutMs?: number } = {}): Promise<VerifyResult[]> {
  const list = Array.from(new Set(urls)).slice(0, opts.max ?? 20);
  const one = async (url: string): Promise<VerifyResult> => {
    let host = '';
    try { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password) return { url, ok: false, status: null, reason: 'só https público' }; host = u.hostname; } catch { return { url, ok: false, status: null, reason: 'endereço inválido' }; }
    try { const ips = await deps.lookupA(host); if (!ips.length || ips.some(isPrivateIp)) return { url, ok: false, status: null, reason: 'endereço não público' }; } catch { return { url, ok: false, status: null, reason: 'sem DNS' }; }
    for (const method of ['HEAD', 'GET'] as const) {
      try {
        const res = await deps.fetchFn(url, { method, redirect: 'follow', signal: timeoutSignal(opts.timeoutMs ?? 10_000), headers: { 'User-Agent': 'ZicaPostsLinkCheck/1.0' } });
        void res.body?.cancel?.().catch(() => undefined);
        if (res.status === 405 && method === 'HEAD') continue;
        return { url, ok: res.status >= 200 && res.status < 300, status: res.status, reason: res.status >= 200 && res.status < 300 ? null : `respondeu ${res.status}` };
      } catch { if (method === 'GET') return { url, ok: false, status: null, reason: 'sem resposta' }; }
    }
    return { url, ok: false, status: null, reason: 'sem resposta' };
  };
  const out: VerifyResult[] = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => { for (;;) { const i = next++; if (i >= list.length) return; out[i] = await one(list[i]); } }));
  return out;
}

// ------------------------------------------------------------------------------------------------------------ leitura do HTML
export function extractLinks(html: string, origin: string): { internal: Array<{ url: string; anchor: string }>; external: Array<{ url: string; anchor: string; rel: string }> } {
  const internal: Array<{ url: string; anchor: string }> = []; const external: Array<{ url: string; anchor: string; rel: string }> = [];
  const oh = hostOf(origin);
  for (const m of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1].match(/href\s*=\s*"([^"]*)"/i) || m[1].match(/href\s*=\s*'([^']*)'/i) || [])[1];
    if (!href || /^(?:#|mailto:|tel:|javascript:)/i.test(href) || /wa\.me|api\.whatsapp/i.test(href)) continue;
    const anchor = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const rel = (m[1].match(/rel\s*=\s*"([^"]*)"/i) || [])[1] || '';
    if (href.startsWith('/')) { internal.push({ url: `${origin.replace(/\/+$/, '')}${href}`, anchor }); continue; }
    const h = hostOf(href);
    if (h && h === oh) internal.push({ url: href, anchor }); else if (h) external.push({ url: href, anchor, rel });
  }
  return { internal, external };
}

const escA = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Bloco HTML dos links planejados (relacionadas e fontes). Rótulos no idioma da página. */
export function renderLinkBlocks(links: PlannedLink[], labels: { related: string; sources: string }): string {
  const inner = links.filter((l) => l.kind === 'interno');
  const ext = links.filter((l) => l.kind === 'externo');
  const a = (l: PlannedLink) => `<li><a href="${escA(l.url)}"${l.kind === 'externo' ? ' rel="noopener" target="_blank"' : ''}>${escA(l.anchor)}</a></li>`;
  const inside = `${inner.length ? `<nav aria-label="${escA(labels.related)}"><h2>${escA(labels.related)}</h2><ul>${inner.map(a).join('')}</ul></nav>` : ''}${ext.length ? `<section><h2>${escA(labels.sources)}</h2><ul>${ext.map(a).join('')}</ul></section>` : ''}`;
  return inside ? `<div data-zica-links>${inside}</div>` : '';
}
/** Troca (ou acrescenta) o bloco de links planejados no corpo, sem tocar no resto do texto. */
export function replaceLinkBlocks(html: string, blocks: string): string {
  const src = String(html || '');
  const at = src.lastIndexOf('<div data-zica-links>');
  const clean = (at >= 0 ? src.slice(0, at) : src).replace(/\s+$/, '');
  return blocks ? `${clean}\n${blocks}` : clean;
}
export const LINK_LABELS: Record<string, { related: string; sources: string }> = {
  pt: { related: 'Veja também', sources: 'Fontes' }, en: { related: 'See also', sources: 'Sources' }, es: { related: 'Véase también', sources: 'Fuentes' }, fr: { related: 'À lire aussi', sources: 'Sources' },
  it: { related: 'Vedi anche', sources: 'Fonti' }, de: { related: 'Siehe auch', sources: 'Quellen' }, nl: { related: 'Zie ook', sources: 'Bronnen' },
};
export const slugOfAnchor = (a: string) => slugifySegment(a);
