/**
 * Radar de Mercado, entidades: o CONCORRENTE é uma entidade com várias IDENTIDADES (site, Google Business/Maps, Instagram, TikTok, Kwai, Facebook,
 * LinkedIn, X, YouTube, Pinterest, Threads...). Regras puras de resolução de entidade: o mesmo concorrente em vários domínios e perfis vira UMA linha.
 *
 * Como uma identidade encontra o dono (nesta ordem; cada passo grava a PROVA em `evidence`):
 *  1. link no site do concorrente, no schema (sameAs) ou no Maps  -> confiança 0,95 (`origem: site|schema|maps`);
 *  2. mesma chave de identidade já conhecida                       -> a mesma entidade;
 *  3. endereço do site com o mesmo "slug" do perfil (exemplo.com e @exemplo) -> 0,85;
 *  4. similaridade de nome (nome do perfil/listagem x nome da entidade) acima do limite -> 0,6 a 0,8;
 *  5. nada disso: a identidade fica ÓRFÃ (sem concorrente) e vai para o Livro de pontas soltas com os candidatos sugeridos.
 * Nada é fundido sem prova: a fusão por similaridade só acontece acima do limite e a pessoa pode desfazer.
 */
import { registrableDomain } from './profile-analyze-core.ts';
import { isNoiseHost } from './market-campaign-core.ts';
import { classifySocialUrl, type IdentityKind, type SocialPlatform } from './radar-social-core.ts';
import { normName } from './radar-geo-core.ts';
import type { Hit, Listing } from './radar-discovery-core.ts';

export type EntityKind = 'marca' | 'pessoa' | 'diretorio' | 'desconhecido';
export type IdentitySource = 'serp' | 'site' | 'schema' | 'maps' | 'youtube_api' | 'provedor' | 'manual';

export interface Entity { id: string; name: string; name_norm: string; kind: EntityKind; primary_host: string | null; is_own: boolean; merged_into?: string | null; phones: Set<string>; isNew: boolean; dirty: boolean }
export interface Identity {
  id: string; competitor_id: string | null; platform: SocialPlatform | string; handle: string | null; url: string; identity_key: string; kind: IdentityKind; source: IdentitySource;
  confidence: number; evidence: Record<string, unknown>; display: string | null; isNew: boolean; dirty: boolean;
}
export interface EntityBook {
  entities: Map<string, Entity>; identities: Map<string, Identity>; byHost: Map<string, string>; byIdentityKey: Map<string, string>;
  ownHosts: Set<string>; noise: string[]; seq: number; stats: { new_entities: number; new_identities: number; orphan_identities: number };
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'the', 'of', 'and', 'y', 'la', 'el', 'los', 'las', 'le', 'les', 'du', 'des', 'und', 'der', 'die', 'oficial', 'official', 'www', 'com', 'br']);
export const nameTokens = (s: string): string[] => normName(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
const compact = (s: string) => normName(s).replace(/ /g, '');
export const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D+/g, '');
/** "www.exemplo-silva.com.br" -> "exemplosilva" (para comparar com @exemplo.silva). */
export const slugOfHost = (host: string): string => compact(registrableDomain(host).split('.')[0] ?? '');

/** Similaridade de nomes (0 a 1): Jaccard nos termos, com bônus quando um nome compacto contém o outro (@exemplosilva x "Exemplo Silva"). */
export function similarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a)); const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  const jac = inter / (ta.size + tb.size - inter);
  const ca = compact(a); const cb = compact(b);
  const contain = ca.length >= 5 && cb.length >= 5 && (ca.includes(cb) || cb.includes(ca)) ? 0.85 : 0;
  return Math.max(jac, contain);
}

export interface BookInput {
  competitors: Array<{ id: string; name: string; kind: string; primary_host: string | null; is_own: boolean; merged_into?: string | null }>;
  identities: Array<{ id: string; competitor_id: string | null; platform: string; handle: string | null; url: string; identity_key: string; kind: string; source: string; confidence: number; evidence?: Record<string, unknown> }>;
  ownHosts: string[]; extraNoise?: string[];
}
export function createBook(i: BookInput): EntityBook {
  const book: EntityBook = { entities: new Map(), identities: new Map(), byHost: new Map(), byIdentityKey: new Map(), ownHosts: new Set(i.ownHosts.map((h) => registrableDomain(h))), noise: i.extraNoise ?? [], seq: 0, stats: { new_entities: 0, new_identities: 0, orphan_identities: 0 } };
  for (const c of i.competitors) {
    book.entities.set(c.id, { id: c.id, name: c.name, name_norm: normName(c.name), kind: (['marca', 'pessoa', 'diretorio'].includes(c.kind) ? c.kind : 'desconhecido') as EntityKind, primary_host: c.primary_host, is_own: c.is_own, merged_into: c.merged_into ?? null, phones: new Set(), isNew: false, dirty: false });
    if (c.primary_host && !c.merged_into) book.byHost.set(c.primary_host, c.id);
  }
  for (const x of i.identities) {
    book.identities.set(x.id, { id: x.id, competitor_id: x.competitor_id, platform: x.platform, handle: x.handle, url: x.url, identity_key: x.identity_key, kind: x.kind as IdentityKind, source: x.source as IdentitySource, confidence: x.confidence, evidence: x.evidence ?? {}, display: null, isNew: false, dirty: false });
    book.byIdentityKey.set(x.identity_key, x.id);
  }
  return book;
}

/** Id definitivo desde o nascimento (o banco aceita o id enviado): evita remapear referências na hora de gravar. */
const tmpId = (book: EntityBook, _p: string) => { book.seq++; return crypto.randomUUID(); };
/** Segue a cadeia de fusões até a entidade viva. */
export function liveEntity(book: EntityBook, id: string | null): Entity | null {
  let cur = id ? book.entities.get(id) ?? null : null; const seen = new Set<string>();
  while (cur?.merged_into && !seen.has(cur.id)) { seen.add(cur.id); cur = book.entities.get(cur.merged_into) ?? null; }
  return cur;
}

export type UrlClass = { type: 'perfil_social'; ref: NonNullable<ReturnType<typeof classifySocialUrl>> } | { type: 'site'; host: string; registrable: string; directory: boolean; own: boolean } | { type: 'invalida' };
export function classifyUrl(url: string, book: EntityBook): UrlClass {
  const ref = classifySocialUrl(url);
  if (ref) return { type: 'perfil_social', ref };
  let host: string;
  try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return { type: 'invalida' }; host = u.hostname.toLowerCase().replace(/^www\./, ''); } catch { return { type: 'invalida' }; }
  const reg = registrableDomain(host);
  return { type: 'site', host, registrable: reg, directory: isNoiseHost(reg, book.noise) || isNoiseHost(host, book.noise), own: book.ownHosts.has(reg) };
}

function ensureEntityForHost(book: EntityBook, reg: string, name: string | null, kind: EntityKind, own: boolean): Entity {
  const have = liveEntity(book, book.byHost.get(reg) ?? null);
  if (have) return have;
  const id = tmpId(book, 'e');
  const e: Entity = { id, name: (name || reg).slice(0, 200), name_norm: normName(name || reg).slice(0, 200), kind, primary_host: reg, is_own: own, phones: new Set(), isNew: true, dirty: true };
  book.entities.set(id, e); book.byHost.set(reg, id); book.stats.new_entities++;
  return e;
}
/** Nome de exibição do site: o título sem a parte depois de "|" ou " - " (costuma ser a marca), senão o domínio. */
export function nameFromTitle(title: string | null | undefined, host: string): string {
  const t = String(title ?? '').trim();
  const parts = t.split(/\s[|–—-]\s/).map((x) => x.trim()).filter(Boolean);
  const slug = slugOfHost(host);
  const brandy = parts.find((p) => compact(p) && (compact(p).includes(slug) || slug.includes(compact(p)))) ;
  return (brandy || parts[parts.length - 1] || host).slice(0, 200);
}

function addIdentity(book: EntityBook, x: Omit<Identity, 'id' | 'isNew' | 'dirty'>): Identity {
  const existingId = book.byIdentityKey.get(x.identity_key);
  const ex = existingId ? book.identities.get(existingId) : undefined;
  if (ex) {
    // a mesma identidade vista de novo: só a prova mais forte vence o dono (nunca troca um dono de maior confiança por um de menor)
    if (!ex.competitor_id && x.competitor_id) { ex.competitor_id = x.competitor_id; ex.confidence = x.confidence; ex.source = x.source; ex.evidence = x.evidence; ex.dirty = true; book.stats.orphan_identities = Math.max(0, book.stats.orphan_identities - 1); }
    else if (x.competitor_id && x.competitor_id !== ex.competitor_id && x.confidence > ex.confidence + 0.1) { ex.competitor_id = x.competitor_id; ex.confidence = x.confidence; ex.source = x.source; ex.evidence = x.evidence; ex.dirty = true; }
    if (x.display && !ex.display) ex.display = x.display;
    return ex;
  }
  const id = tmpId(book, 'i');
  const idn: Identity = { ...x, id, isNew: true, dirty: true };
  book.identities.set(id, idn); book.byIdentityKey.set(x.identity_key, id); book.stats.new_identities++;
  if (!x.competitor_id) book.stats.orphan_identities++;
  return idn;
}

export interface IngestCtx { engine: string; modality: string; focusId: string | null; placeId: string | null; nodeId: string | null; queryKey: string | null }
export interface IngestResult { entityId: string | null; identityKey: string | null; kind: 'site' | 'perfil' | 'diretorio' | 'ignorado'; pageUrl: string }

/** Melhor entidade para um perfil social: por slug do site e por similaridade de nome. Devolve também o motivo (a prova). */
export function matchEntityForProfile(book: EntityBook, handle: string | null, display: string | null, minSim = 0.6): { entity: Entity; confidence: number; reason: 'slug_igual' | 'nome_parecido'; score: number } | null {
  let best: { entity: Entity; confidence: number; reason: 'slug_igual' | 'nome_parecido'; score: number } | null = null;
  const hcompact = handle ? compact(handle) : '';
  for (const e of book.entities.values()) {
    if (e.merged_into || e.kind === 'diretorio') continue;
    if (hcompact.length >= 4 && e.primary_host && slugOfHost(e.primary_host) === hcompact) return { entity: e, confidence: 0.85, reason: 'slug_igual', score: 1 };
    const sim = Math.max(display ? similarity(display, e.name) : 0, handle ? similarity(handle.replace(/[._-]+/g, ' '), e.name) : 0, hcompact.length >= 5 && e.primary_host && (slugOfHost(e.primary_host).includes(hcompact) || hcompact.includes(slugOfHost(e.primary_host))) ? 0.8 : 0);
    if (sim >= minSim && (!best || sim > best.score)) best = { entity: e, confidence: Math.min(0.8, 0.45 + sim * 0.4), reason: 'nome_parecido', score: sim };
  }
  return best;
}

/** Resultado de busca (web, vídeo, notícia...) -> entidade/identidade. `from` = entidade de onde o link saiu (site do concorrente), prova forte. */
export function ingestHit(book: EntityBook, hit: Hit, ctx: IngestCtx, from?: { entityId: string; source: IdentitySource } | null): IngestResult {
  const cls = classifyUrl(hit.url, book);
  if (cls.type === 'invalida') return { entityId: null, identityKey: null, kind: 'ignorado', pageUrl: hit.url };
  if (cls.type === 'site') {
    if (cls.directory && !cls.own) {
      const e = ensureEntityForHost(book, cls.registrable, cls.registrable, 'diretorio', false);
      return { entityId: e.id, identityKey: `site:${cls.registrable}`, kind: 'diretorio', pageUrl: hit.url };
    }
    const e = ensureEntityForHost(book, cls.registrable, nameFromTitle(hit.title, cls.host), 'desconhecido', cls.own);
    if (cls.own && !e.is_own) { e.is_own = true; e.dirty = true; }
    addIdentity(book, { competitor_id: e.id, platform: 'site', handle: cls.registrable, url: `https://${cls.registrable}/`, identity_key: `site:${cls.registrable}`, kind: 'site', source: 'serp', confidence: 1, evidence: { origem: 'serp', engine: ctx.engine }, display: null });
    return { entityId: e.id, identityKey: `site:${cls.registrable}`, kind: 'site', pageUrl: hit.url };
  }
  // perfil/vídeo/post de rede social
  const ref = cls.ref;
  let owner: { id: string; confidence: number; evidence: Record<string, unknown>; source: IdentitySource } | null = null;
  if (from) owner = { id: from.entityId, confidence: 0.95, evidence: { origem: from.source }, source: from.source };
  else {
    const m = matchEntityForProfile(book, ref.handle, hit.title);
    if (m) owner = { id: m.entity.id, confidence: m.confidence, evidence: { origem: 'serp', motivo: m.reason, similaridade: Math.round(m.score * 100) / 100 }, source: 'serp' };
  }
  addIdentity(book, { competitor_id: owner?.id ?? null, platform: ref.platform, handle: ref.handle, url: ref.canonical, identity_key: ref.key, kind: ref.kind, source: owner?.source ?? 'serp', confidence: owner?.confidence ?? 0.3, evidence: { ...(owner?.evidence ?? { origem: 'serp' }), titulo: (hit.title ?? '').slice(0, 160), trecho: (hit.snippet ?? '').slice(0, 240) }, display: hit.title });
  return { entityId: owner?.id ?? null, identityKey: ref.key, kind: 'perfil', pageUrl: hit.url };
}

/** Listagem do Maps -> entidade (por site, telefone ou nome) + identidade `gbp`. */
export function ingestListing(book: EntityBook, l: Listing, _ctx: IngestCtx): { entityId: string; identityKey: string } {
  let entity: Entity | null = null;
  let reason: string = 'nome';
  if (l.website) {
    const c = classifyUrl(l.website, book);
    if (c.type === 'site' && !c.directory) { entity = ensureEntityForHost(book, c.registrable, l.name, 'desconhecido', c.own); reason = 'site_da_listagem'; }
    else if (c.type === 'perfil_social') { /* a listagem aponta para uma rede: a identidade social é ligada abaixo */ }
  }
  const ph = digits(l.phone);
  if (!entity && ph.length >= 8) for (const e of book.entities.values()) if (!e.merged_into && e.phones.has(ph)) { entity = e; reason = 'telefone'; break; }
  if (!entity) { let best = 0; for (const e of book.entities.values()) { if (e.merged_into || e.kind === 'diretorio') continue; const s = similarity(l.name, e.name); if (s >= 0.8 && s > best) { best = s; entity = e; reason = 'nome_parecido'; } } }
  if (!entity) {
    const id = tmpId(book, 'e');
    entity = { id, name: l.name.slice(0, 200), name_norm: normName(l.name).slice(0, 200), kind: 'desconhecido', primary_host: null, is_own: false, phones: new Set(), isNew: true, dirty: true };
    book.entities.set(id, entity); book.stats.new_entities++; reason = 'nova_listagem';
  }
  if (ph.length >= 8) entity.phones.add(ph);
  const key = `gbp:lugar:${l.ref.toLowerCase().replace(/[^a-z0-9:_|-]+/g, '').slice(0, 120)}`;
  addIdentity(book, { competitor_id: entity.id, platform: 'gbp', handle: l.ref, url: l.website ?? `https://www.google.com/maps/search/${encodeURIComponent(l.name)}`, identity_key: key, kind: 'lugar', source: 'maps', confidence: reason === 'nova_listagem' ? 1 : reason === 'nome_parecido' ? 0.7 : 0.9, evidence: { origem: 'maps', motivo: reason }, display: l.name });
  return { entityId: entity.id, identityKey: key };
}

/** Links de rede social achados no site/schema do concorrente: viram identidades dele com a prova forte. */
export function ingestSiteLinks(book: EntityBook, entityId: string, links: Array<{ url: string; source: 'site' | 'schema' }>): number {
  let n = 0;
  for (const l of links) {
    const ref = classifySocialUrl(l.url);
    if (!ref) continue;
    const before = book.byIdentityKey.get(ref.key);
    addIdentity(book, { competitor_id: entityId, platform: ref.platform, handle: ref.handle, url: ref.canonical, identity_key: ref.key, kind: ref.kind, source: l.source, confidence: 0.95, evidence: { origem: l.source }, display: null });
    if (!before) n++;
  }
  return n;
}

/** Depois de novas entidades: tenta ligar as identidades órfãs. Devolve quantas foram ligadas (e grava a prova). */
export function relinkOrphans(book: EntityBook, minSim = 0.7): number {
  let n = 0;
  for (const x of book.identities.values()) {
    if (x.competitor_id || x.platform === 'site' || x.platform === 'gbp') continue;
    const m = matchEntityForProfile(book, x.handle, x.display ?? String((x.evidence as { titulo?: string }).titulo ?? ''), minSim);
    if (!m) continue;
    x.competitor_id = m.entity.id; x.confidence = m.confidence; x.source = 'serp'; x.evidence = { ...x.evidence, origem: 'serp', motivo: m.reason, similaridade: Math.round(m.score * 100) / 100, relink: true }; x.dirty = true; n++;
    book.stats.orphan_identities = Math.max(0, book.stats.orphan_identities - 1);
  }
  return n;
}

/** Candidatos para uma identidade órfã (para o Livro de pontas soltas). */
export function candidatesFor(book: EntityBook, x: Identity, limit = 3): Array<{ competitor_id: string; name: string; score: number; reason: string }> {
  const out: Array<{ competitor_id: string; name: string; score: number; reason: string }> = [];
  const h = x.handle ? compact(x.handle) : '';
  for (const e of book.entities.values()) {
    if (e.merged_into || e.kind === 'diretorio') continue;
    const sim = Math.max(similarity(String(x.display ?? (x.evidence as { titulo?: string }).titulo ?? ''), e.name), x.handle ? similarity(x.handle.replace(/[._-]+/g, ' '), e.name) : 0, h.length >= 5 && e.primary_host && (slugOfHost(e.primary_host).includes(h) || h.includes(slugOfHost(e.primary_host))) ? 0.8 : 0);
    if (sim >= 0.3) out.push({ competitor_id: e.id, name: e.name, score: Math.round(sim * 100) / 100, reason: sim >= 0.8 ? 'slug_ou_nome' : 'nome_parecido' });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Fusão manual ou sugerida: `from` passa a apontar para `into`; as identidades de `from` mudam de dono. */
export function mergeEntities(book: EntityBook, fromId: string, intoId: string): boolean {
  const a = liveEntity(book, fromId); const b = liveEntity(book, intoId);
  if (!a || !b || a.id === b.id) return false;
  a.merged_into = b.id; a.dirty = true;
  if (a.primary_host && !b.primary_host) { b.primary_host = a.primary_host; b.dirty = true; }
  for (const x of book.identities.values()) if (x.competitor_id === a.id) { x.competitor_id = b.id; x.evidence = { ...x.evidence, fundido_de: a.id }; x.dirty = true; }
  for (const p of a.phones) b.phones.add(p);
  if (a.is_own) { b.is_own = true; }
  return true;
}

/** Garante a entidade do PRÓPRIO negócio (uma por projeto), para o placar comparar "nós" com os concorrentes. */
export function ensureOwn(book: EntityBook, host: string, name: string): Entity {
  const reg = registrableDomain(host.toLowerCase().replace(/^www\./, ''));
  book.ownHosts.add(reg);
  const e = ensureEntityForHost(book, reg, name || reg, 'marca', true);
  if (!e.is_own) { e.is_own = true; e.dirty = true; }
  addIdentity(book, { competitor_id: e.id, platform: 'site', handle: reg, url: `https://${reg}/`, identity_key: `site:${reg}`, kind: 'site', source: 'manual', confidence: 1, evidence: { origem: 'projeto' }, display: null });
  return e;
}
