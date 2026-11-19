/**
 * Backlinks (módulo F2): regras puras e o verificador de páginas.
 *
 * Princípio: o sistema NUNCA inventa um backlink. Ele guarda a lista que o cliente importa (Search Console, Bing, Ahrefs, Semrush, Moz, planilha própria)
 * e VERIFICA cada página ao vivo: a página responde? o link para o site-alvo está no HTML? com qual texto (âncora) e com qual atributo (follow, nofollow, sponsored, ugc)?
 * Cada linha guarda de onde veio (`origin`) e quando foi verificada pela última vez. Nenhum número vem de estimativa.
 *
 * Limite honesto: a verificação lê o HTML que o servidor entrega. Links inseridos por JavaScript depois do carregamento não aparecem ali;
 * nesses casos o resultado é "não encontrado no HTML", não "o link não existe". A tela diz isso.
 */
import { guardedFetch, parseSafeUrl, registrableDomain, type Deps } from './profile-analyze-core.ts';
import { decode } from './profile-discover-core.ts';

import { MAX_IMPORT_ROWS, VERIFY_BATCH, type AnchorKind, type LinkAttr, type LinkStatus } from './backlinks-labels.ts';
export { ANCHOR_LABEL, ATTR_LABEL, MAX_COMPETITOR_TARGETS, MAX_IMPORT_ROWS, MAX_LINKS_PER_PROJECT, ORIGINS, STATUS_LABEL, VERIFY_BATCH } from './backlinks-labels.ts';
export type { AnchorKind, LinkAttr, LinkStatus } from './backlinks-labels.ts';
export const MAX_IMPORT_CHARS = 600_000;
export const VERIFY_PAGE_BYTES = 1_500_000;

// ------------------------------------------------------------------------------------------------------------ importação
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Divide texto em linhas/colunas respeitando aspas (campos com vírgula ou quebra de linha dentro de aspas). */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows.map((r) => r.map((v) => v.trim()));
}

const SOURCE_HEADERS = new Set(['sourceurl', 'referringpageurl', 'referringpage', 'linkingpage', 'linkingpageurl', 'urldeorigem', 'paginadereferencia', 'paginadeorigem', 'urldapaginadeorigem', 'paginaquevincula', 'from', 'fromurl', 'url', 'sourcepage', 'paginareferente', 'pagereferente', 'urlreferente', 'urldereferencia', 'refpageurl']);
const TARGET_HEADERS = new Set(['targeturl', 'urldedestino', 'destino', 'linkurl', 'to', 'tourl', 'targetpage', 'paginadedestino', 'urlalvo', 'paginadestino', 'linkdestination']);
const ANCHOR_HEADERS = new Set(['anchor', 'anchortext', 'ancora', 'textoancora', 'textodaancora', 'textodoancora', 'texto', 'linkanchor', 'anchorandtargeturl']);
const ATTR_HEADERS = new Set(['nofollow', 'rel', 'type', 'tipo', 'linktype', 'dofollow', 'atributo', 'follow']);
const looksLikeUrl = (v: string) => /^https?:\/\//i.test(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(v);

export function parseAttr(raw: string): LinkAttr | null {
  const v = strip(raw);
  if (!v) return null;
  if (v.includes('sponsored')) return 'sponsored';
  if (v.includes('ugc')) return 'ugc';
  if (v === 'nofollow' || v === 'true' || v === 'sim' || v === 'yes' || v === '1' || v.includes('nofollow')) return 'nofollow';
  if (v === 'dofollow' || v === 'follow' || v === 'false' || v === 'nao' || v === 'no' || v === '0') return 'follow';
  return null;
}

export interface SourceRef { url: string; host: string; domain: string }
/** Endereço da página que contém o link: só http/https público; sem âncora (#); host em minúsculas. */
export function normalizeSource(raw: string): SourceRef | null {
  const text = raw.trim();
  if (!text || text.length > 1000) return null;
  const parsed = parseSafeUrl(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  if ('error' in parsed) return null;
  parsed.url.hash = '';
  const host = parsed.url.hostname.toLowerCase();
  return { url: parsed.url.href, host, domain: registrableDomain(host) };
}

export interface ImportRow { source_url: string; source_host: string; source_domain: string; target_url: string | null; anchor: string | null; link_attr: LinkAttr | null }
export interface ImportResult { rows: ImportRow[]; invalid: number; self_links: number; duplicates: number; truncated: boolean; header: boolean }

/** Lê uma lista colada ou exportada: uma URL por linha, ou CSV/TSV/ponto e vírgula com cabeçalho (Search Console, Bing, Ahrefs, Semrush, Moz). */
export function parseImport(raw: string, targetHost: string): ImportResult {
  const text = raw.replace(/^\uFEFF/, '');
  const result: ImportResult = { rows: [], invalid: 0, self_links: 0, duplicates: 0, truncated: false, header: false };
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = first.includes('\t') ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const table = parseDelimited(text, delim);
  if (!table.length) return result;
  const names = table[0].map(strip);
  const hasHeader = !table[0].some(looksLikeUrl) && names.some((n) => SOURCE_HEADERS.has(n) || TARGET_HEADERS.has(n) || ANCHOR_HEADERS.has(n));
  result.header = hasHeader;
  const idx = (set: Set<string>) => (hasHeader ? names.findIndex((n) => set.has(n)) : -1);
  const iSource = idx(SOURCE_HEADERS); const iTarget = idx(TARGET_HEADERS); const iAnchor = idx(ANCHOR_HEADERS); const iAttr = idx(ATTR_HEADERS);
  const body = hasHeader ? table.slice(1) : table;
  const targetReg = registrableDomain(targetHost);
  const seen = new Set<string>();
  for (const cells of body) {
    let source = iSource >= 0 ? cells[iSource] : cells.find(looksLikeUrl);
    if (iSource < 0 && !hasHeader && source === undefined) source = cells[0];
    const ref = source ? normalizeSource(source) : null;
    if (!ref) { result.invalid++; continue; }
    if (ref.domain === targetReg) { result.self_links++; continue; }
    if (seen.has(ref.url)) { result.duplicates++; continue; }
    if (result.rows.length >= MAX_IMPORT_ROWS) { result.truncated = true; break; }
    seen.add(ref.url);
    let target: string | null = null;
    if (iTarget >= 0 && cells[iTarget]) target = cells[iTarget].slice(0, 1000);
    else if (!hasHeader) { const urls = cells.filter(looksLikeUrl); if (urls.length > 1 && urls[1] !== source) target = urls[1].slice(0, 1000); }
    const anchor = iAnchor >= 0 && cells[iAnchor] ? cells[iAnchor].slice(0, 300) : null;
    const attr = iAttr >= 0 && cells[iAttr] ? parseAttr(cells[iAttr]) : null;
    result.rows.push({ source_url: ref.url, source_host: ref.host, source_domain: ref.domain, target_url: target, anchor, link_attr: attr });
  }
  return result;
}

// ------------------------------------------------------------------------------------------------------------ leitura do HTML
export interface FoundLink { href: string; anchor: string; attr: LinkAttr; imageOnly: boolean }
export interface PageLinks { links: FoundLink[]; noindex: boolean; pageNofollow: boolean }

const attrOf = (attrs: string, name: string): string | null => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : null;
};

/** Procura no HTML os links que apontam para o domínio-alvo (qualquer subdomínio) e lê âncora e atributo `rel`. */
export function extractLinks(html: string, pageUrl: string, targetReg: string, headerRobots: string | null = null): PageLinks {
  let noindex = /noindex/i.test(headerRobots || '');
  let pageNofollow = /nofollow/i.test(headerRobots || '');
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const name = (attrOf(m[1], 'name') || '').toLowerCase();
    if (name === 'robots' || name === 'googlebot') {
      const content = attrOf(m[1], 'content') || '';
      if (/noindex/i.test(content)) noindex = true;
      if (/nofollow/i.test(content)) pageNofollow = true;
    }
  }
  const links: FoundLink[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = attrOf(m[1], 'href');
    if (!href || /^(javascript|mailto|tel|data):/i.test(href.trim()) || href.trim().startsWith('#')) continue;
    let abs: URL;
    try { abs = new URL(href.trim(), pageUrl); } catch { continue; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (registrableDomain(abs.hostname) !== targetReg) continue;
    const inner = m[2];
    const text = decode(inner.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    const img = inner.match(/<img\b([^>]*)>/i);
    const alt = img ? (attrOf(img[1], 'alt') || '').trim() : '';
    const rel = (attrOf(m[1], 'rel') || '').toLowerCase().split(/\s+/);
    const attr: LinkAttr = rel.includes('sponsored') ? 'sponsored' : rel.includes('ugc') ? 'ugc' : rel.includes('nofollow') || pageNofollow ? 'nofollow' : 'follow';
    links.push({ href: abs.href.slice(0, 1000), anchor: (text || alt).slice(0, 300), attr, imageOnly: !text });
  }
  return { links, noindex, pageNofollow };
}

export interface Verdict {
  status: LinkStatus; http_status: number | null; source_noindex: boolean | null; links_found: number | null;
  anchor: string | null; link_attr: LinkAttr | null; target_url: string | null; check_error: string | null;
}
const blank = (status: LinkStatus, over: Partial<Verdict> = {}): Verdict => ({ status, http_status: null, source_noindex: null, links_found: null, anchor: null, link_attr: null, target_url: null, check_error: null, ...over });

/** Visita a página (com as proteções do leitor público) e diz se o link está lá. Timeout e erro 5xx NÃO viram "perdido": ficam "não verificado" para tentar de novo. */
export async function verifyLink(deps: Deps, sourceUrl: string, targetHost: string): Promise<Verdict> {
  const targetReg = registrableDomain(targetHost);
  let visit;
  try {
    visit = await guardedFetch(deps, sourceUrl, { maxBytes: VERIFY_PAGE_BYTES, maxHops: 4, timeoutMs: 10_000 });
  } catch (e) {
    const code = e instanceof Error ? e.message.slice(0, 60) : 'falha_desconhecida';
    return code === 'tempo_esgotado' || code === 'falha_de_rede' ? blank('unverified', { check_error: code }) : blank('dead', { check_error: code });
  }
  const st = visit.status;
  if (st === 401 || st === 403 || st === 429 || st === 451 || st === 999) return blank('blocked', { http_status: st, check_error: 'acesso_negado_ao_robo' });
  if (st >= 500) return blank('unverified', { http_status: st, check_error: 'erro_do_servidor_da_pagina' });
  if (st < 200 || st >= 300) return blank('dead', { http_status: st, check_error: st === 404 || st === 410 ? 'pagina_nao_existe' : 'resposta_inesperada' });
  const type = (visit.headers.get('content-type') || '').toLowerCase();
  if (type && !/html|xml|text\/plain/.test(type)) return blank('unverified', { http_status: st, check_error: 'conteudo_nao_html' });
  const page = extractLinks(visit.text, visit.finalUrl, targetReg, visit.headers.get('x-robots-tag'));
  if (!page.links.length) {
    return visit.truncated ? blank('unverified', { http_status: st, source_noindex: page.noindex, links_found: 0, check_error: 'pagina_grande_demais' }) : blank('lost', { http_status: st, source_noindex: page.noindex, links_found: 0, check_error: 'link_nao_encontrado_no_html' });
  }
  const primary = page.links.find((l) => l.attr === 'follow') || page.links[0];
  return { status: 'live', http_status: st, source_noindex: page.noindex, links_found: Math.min(page.links.length, 32000), anchor: primary.anchor || null, link_attr: primary.attr, target_url: primary.href, check_error: null };
}

// ------------------------------------------------------------------------------------------------------------ análise
const GENERIC = new Set(['clique aqui', 'aqui', 'saiba mais', 'leia mais', 'veja mais', 'ver mais', 'site', 'website', 'link', 'este site', 'esse site', 'acesse', 'visite', 'click here', 'here', 'read more', 'learn more', 'visit', 'website oficial', 'site oficial', 'fonte', 'source', 'mais informacoes', 'mais informações']);

export function classifyAnchor(anchor: string | null | undefined, brandTerms: string[], targetHost: string): AnchorKind {
  const raw = (anchor || '').trim();
  if (!raw) return 'imagem';
  const low = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reg = registrableDomain(targetHost);
  if (/^(https?:\/\/|www\.)/.test(low) || low.includes(reg) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(low)) return 'url';
  if (GENERIC.has(low)) return 'generico';
  const flat = strip(raw);
  if (brandTerms.some((t) => { const k = strip(t); return k.length >= 3 && flat.includes(k); })) return 'marca';
  return 'palavra_chave';
}

export interface LinkRow {
  id?: string; source_url: string; source_domain: string; anchor: string | null; link_attr: LinkAttr | null; origin: string; status: LinkStatus;
  http_status: number | null; last_checked_at: string | null; status_changed_at: string | null; first_seen_at: string;
  /** última vez que a verificação viu o link no ar; é o que separa "perdido" de "nunca esteve no ar" */
  last_live_at: string | null;
}
export interface Flag { key: string; text: string }
export interface Summary {
  total: number;
  by_status: Record<LinkStatus, number>;
  verified_pct: number | null;
  referring_domains: { all: number; live: number };
  attr: Record<LinkAttr | 'sem_dado', number>;
  anchors: Record<AnchorKind | 'sem_dado', number>;
  top_domains: Array<{ domain: string; live: number; total: number }>;
  by_origin: Record<string, number>;
  lost_recent: { days: number; count: number; items: Array<{ source_url: string; since: string | null }> };
  flags: Flag[];
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function summarize(rows: LinkRow[], brandTerms: string[], targetHost: string, nowMs: number): Summary {
  const by_status: Record<LinkStatus, number> = { unverified: 0, live: 0, lost: 0, dead: 0, blocked: 0 };
  const attr: Summary['attr'] = { follow: 0, nofollow: 0, sponsored: 0, ugc: 0, sem_dado: 0 };
  const anchors: Summary['anchors'] = { marca: 0, url: 0, generico: 0, imagem: 0, palavra_chave: 0, sem_dado: 0 };
  const by_origin: Record<string, number> = {};
  const dom = new Map<string, { live: number; total: number }>();
  const liveDomains = new Set<string>();
  const lostItems: Array<{ source_url: string; since: string | null }> = [];
  const since = nowMs - 30 * 86_400_000;
  let lostCount = 0;
  for (const r of rows) {
    by_status[r.status]++;
    by_origin[r.origin] = (by_origin[r.origin] || 0) + 1;
    const d = dom.get(r.source_domain) || { live: 0, total: 0 };
    d.total++;
    if (r.status === 'live') {
      d.live++;
      liveDomains.add(r.source_domain);
      if (r.link_attr) attr[r.link_attr]++; else attr.sem_dado++;
      if (r.anchor === null) anchors.sem_dado++; else anchors[classifyAnchor(r.anchor, brandTerms, targetHost)]++;
    }
    dom.set(r.source_domain, d);
    if ((r.status === 'lost' || r.status === 'dead') && r.last_live_at && r.status_changed_at && Date.parse(r.status_changed_at) >= since) {
      lostCount++;
      if (lostItems.length < 5) lostItems.push({ source_url: r.source_url, since: r.status_changed_at });
    }
  }
  const total = rows.length;
  const checked = total - by_status.unverified;
  const live = by_status.live;
  const known = attr.follow + attr.nofollow + attr.sponsored + attr.ugc;
  const top = [...dom.entries()].map(([domain, v]) => ({ domain, ...v })).sort((a, b) => b.live - a.live || b.total - a.total).slice(0, 10);
  const flags: Flag[] = [];
  if (total >= 10 && by_status.unverified / total > 0.5) flags.push({ key: 'sem_verificar', text: `${pct(by_status.unverified, total)}% dos links ainda não foram verificados. Verifique para saber quais estão no ar.` });
  if (live >= 10 && top[0] && top[0].live / live > 0.3) flags.push({ key: 'concentracao', text: `Um único site (${top[0].domain}) responde por ${pct(top[0].live, live)}% dos links ativos. Perfil muito concentrado.` });
  if (live >= 10 && known >= 10 && attr.follow / known < 0.5) flags.push({ key: 'poucos_follow', text: `Menos da metade dos links ativos (${pct(attr.follow, known)}%) passa autoridade (sem nofollow, sponsored ou ugc).` });
  const anchored = live - anchors.sem_dado;
  if (live >= 10 && anchored >= 10 && anchors.palavra_chave / anchored > 0.5) flags.push({ key: 'ancora_palavra_chave', text: `${pct(anchors.palavra_chave, anchored)}% das âncoras são palavras-chave. Um perfil natural costuma ter mais nome da marca, endereço do site e textos genéricos.` });
  if (lostCount > 0) flags.push({ key: 'perdidos', text: `${lostCount} link(s) deixou(aram) de aparecer nos últimos 30 dias.` });
  return {
    total, by_status, verified_pct: total ? pct(checked, total) : null,
    referring_domains: { all: dom.size, live: liveDomains.size }, attr, anchors, top_domains: top, by_origin,
    lost_recent: { days: 30, count: lostCount, items: lostItems }, flags,
  };
}
