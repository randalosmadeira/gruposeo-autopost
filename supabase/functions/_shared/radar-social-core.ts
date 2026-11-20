/**
 * Radar de Mercado, redes sociais e vídeo: regras puras. Redes existem aqui para ser VINCULADAS AOS CONCORRENTES (identidades da mesma entidade).
 *
 * LIMITES HONESTOS (valem para o código e para a tela):
 *  - NÃO raspamos redes sociais e NÃO usamos login. Só: (a) o endereço público do perfil (vindo de busca, do site do concorrente, do schema ou do Maps),
 *    (b) contagens que aparecem no TRECHO PÚBLICO do resultado de busca ("12 mil seguidores"), sempre com fonte, data e o rótulo
 *    `trecho_publico_do_buscador` (estimado), e (c) a YouTube Data API v3 (cota gratuita; oficial).
 *  - Métricas profundas de Instagram, TikTok, Kwai, Facebook, LinkedIn, X, Pinterest e Threads só por fonte oficial ou por provedor de dados terceiro AUTORIZADO:
 *    há um adaptador pluggável (THIRD_PARTY_ADAPTERS), DESLIGADO por padrão, com aviso de custo e de termos. Sem ele: "métricas indisponíveis sem API oficial/parceiro".
 */
export type SocialPlatform = 'site' | 'gbp' | 'instagram' | 'tiktok' | 'kwai' | 'facebook' | 'linkedin' | 'x' | 'youtube' | 'pinterest' | 'threads';
export type IdentityKind = 'site' | 'perfil' | 'canal' | 'video' | 'post' | 'lugar';
export type MetricsLabel = 'api_oficial' | 'trecho_publico_do_buscador' | 'provedor_terceiro' | 'indisponivel';

export interface PlatformInfo { id: SocialPlatform; label: string; hosts: string[]; searchSite: string | null; metrics: 'api_oficial' | 'trecho_publico' | 'indisponivel_sem_api' }
export const PLATFORMS: PlatformInfo[] = [
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'm.youtube.com'], searchSite: 'youtube.com', metrics: 'api_oficial' },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'], searchSite: 'instagram.com', metrics: 'trecho_publico' },
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'], searchSite: 'tiktok.com', metrics: 'trecho_publico' },
  { id: 'kwai', label: 'Kwai', hosts: ['kwai.com', 'kwai-video.com', 'k.kwai.com'], searchSite: 'kwai.com', metrics: 'trecho_publico' },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com', 'm.facebook.com'], searchSite: 'facebook.com', metrics: 'trecho_publico' },
  { id: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com'], searchSite: 'linkedin.com', metrics: 'trecho_publico' },
  { id: 'x', label: 'X', hosts: ['x.com', 'twitter.com'], searchSite: 'x.com', metrics: 'trecho_publico' },
  { id: 'pinterest', label: 'Pinterest', hosts: ['pinterest.com'], searchSite: 'pinterest.com', metrics: 'trecho_publico' },
  { id: 'threads', label: 'Threads', hosts: ['threads.net', 'threads.com'], searchSite: 'threads.net', metrics: 'trecho_publico' },
];
export const platformInfo = (id: string): PlatformInfo | undefined => PLATFORMS.find((p) => p.id === id);
export const SOCIAL_PLATFORM_IDS: SocialPlatform[] = PLATFORMS.map((p) => p.id);

export interface SocialRef { platform: SocialPlatform; handle: string | null; kind: IdentityKind; canonical: string; key: string }

const RESERVED: Record<string, Set<string>> = {
  instagram: new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'directory', 'about', 'legal', 'developer', 'web']),
  facebook: new Set(['sharer', 'sharer.php', 'share', 'dialog', 'plugins', 'tr', 'login', 'watch', 'groups', 'events', 'marketplace', 'policies', 'help', 'privacy', 'reel', 'photo', 'photos', 'hashtag', 'gaming', 'business', 'public']),
  linkedin: new Set(['feed', 'jobs', 'learning', 'pulse', 'posts', 'shareArticle', 'sharing', 'login', 'signup', 'help', 'legal']),
  x: new Set(['home', 'explore', 'share', 'intent', 'i', 'search', 'hashtag', 'login', 'tos', 'privacy', 'settings', 'notifications', 'messages', 'compose']),
  pinterest: new Set(['pin', 'ideas', 'search', 'login', 'today', 'business', 'topics']),
};
const cleanHandle = (h: string) => decodeURIComponent(h).replace(/^@/, '').replace(/[/?#].*$/, '').trim();

/** Endereço -> plataforma, identificador, tipo (perfil, canal, vídeo, post) e chave canônica (para saber se duas URLs são a mesma identidade). */
export function classifySocialUrl(raw: string): SocialRef | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|pt-br|br|es|en)\./, '');
  const p = PLATFORMS.find((x) => x.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  const segs = u.pathname.split('/').filter(Boolean);
  const mk = (platform: SocialPlatform, handle: string | null, kind: IdentityKind, canonicalPath: string): SocialRef => {
    const hh = handle ? handle.toLowerCase() : null;
    return { platform, handle: handle ?? null, kind, canonical: `https://${platform === 'x' ? 'x.com' : `${platform === 'youtube' ? 'www.youtube.com' : `www.${PLATFORMS.find((q) => q.id === platform)?.hosts[0] ?? host}`}`}${canonicalPath}`, key: `${platform}:${kind}:${hh ?? canonicalPath.toLowerCase()}` };
  };
  if (/(^|\.)(google\.[a-z.]+|g\.page|goo\.gl)$/.test(host) || host === 'maps.app.goo.gl') {
    if (host === 'g.page' || host === 'maps.app.goo.gl' || /\/maps\b/.test(u.pathname) || u.searchParams.has('cid')) {
      const cid = u.searchParams.get('cid') || (segs[0] === 'maps' && segs[1] === 'place' ? segs[2] : null) || (host === 'g.page' ? segs[0] : null);
      return cid ? { platform: 'gbp', handle: cid, kind: 'lugar', canonical: u.href, key: `gbp:lugar:${normKeyPart(cid)}` } : null;
    }
    return null;
  }
  if (!p) return null;
  switch (p.id) {
    case 'youtube': {
      if (host === 'youtu.be' && segs[0]) return mk('youtube', segs[0], 'video', `/watch?v=${segs[0]}`);
      if (segs[0] === 'watch' && u.searchParams.get('v')) return mk('youtube', u.searchParams.get('v'), 'video', `/watch?v=${u.searchParams.get('v')}`);
      if (segs[0] === 'shorts' && segs[1]) return mk('youtube', segs[1], 'video', `/shorts/${segs[1]}`);
      if (segs[0]?.startsWith('@')) return mk('youtube', cleanHandle(segs[0]), 'canal', `/@${cleanHandle(segs[0])}`);
      if (segs[0] === 'channel' && segs[1]) return mk('youtube', segs[1], 'canal', `/channel/${segs[1]}`);
      if ((segs[0] === 'c' || segs[0] === 'user') && segs[1]) return mk('youtube', segs[1], 'canal', `/${segs[0]}/${segs[1]}`);
      return null;
    }
    case 'instagram': {
      if (!segs[0]) return null;
      if ((segs[0] === 'p' || segs[0] === 'reel' || segs[0] === 'tv') && segs[1]) return mk('instagram', segs[1], 'post', `/${segs[0]}/${segs[1]}/`);
      if (RESERVED.instagram.has(segs[0].toLowerCase())) return null;
      return mk('instagram', cleanHandle(segs[0]), 'perfil', `/${cleanHandle(segs[0])}/`);
    }
    case 'tiktok': {
      const h = segs.find((s) => s.startsWith('@'));
      if (!h) return null;
      const vid = segs[segs.indexOf(h) + 1] === 'video' ? segs[segs.indexOf(h) + 2] : null;
      return vid ? mk('tiktok', vid, 'video', `/${h}/video/${vid}`) : mk('tiktok', cleanHandle(h), 'perfil', `/@${cleanHandle(h)}`);
    }
    case 'kwai': {
      const h = segs.find((s) => s.startsWith('@'));
      if (h) return mk('kwai', cleanHandle(h), 'perfil', `/@${cleanHandle(h)}`);
      if (segs[0] === 'profile' && segs[1]) return mk('kwai', segs[1], 'perfil', `/profile/${segs[1]}`);
      if ((segs[0] === 'video' || segs[0] === 's') && segs[1]) return mk('kwai', segs[1], 'video', `/${segs[0]}/${segs[1]}`);
      return null;
    }
    case 'facebook': {
      if (!segs[0]) return null;
      if (segs[0] === 'profile.php' && u.searchParams.get('id')) return mk('facebook', u.searchParams.get('id'), 'perfil', `/profile.php?id=${u.searchParams.get('id')}`);
      if (segs[0] === 'pages' && segs[2]) return mk('facebook', segs[2], 'perfil', `/pages/${segs[1]}/${segs[2]}`);
      if (segs[0] === 'people' && segs[2]) return mk('facebook', segs[2], 'perfil', `/people/${segs[1]}/${segs[2]}`);
      if (RESERVED.facebook.has(segs[0].toLowerCase())) return null;
      return mk('facebook', cleanHandle(segs[0]), 'perfil', `/${cleanHandle(segs[0])}`);
    }
    case 'linkedin': {
      if ((segs[0] === 'in' || segs[0] === 'company' || segs[0] === 'school') && segs[1]) return mk('linkedin', cleanHandle(segs[1]), 'perfil', `/${segs[0]}/${cleanHandle(segs[1])}/`);
      return null;
    }
    case 'x': {
      if (!segs[0] || RESERVED.x.has(segs[0].toLowerCase())) return null;
      if (segs[1] === 'status' && segs[2]) return mk('x', segs[2], 'post', `/${cleanHandle(segs[0])}/status/${segs[2]}`);
      return mk('x', cleanHandle(segs[0]), 'perfil', `/${cleanHandle(segs[0])}`);
    }
    case 'pinterest': {
      if (!segs[0] || RESERVED.pinterest.has(segs[0].toLowerCase())) return null;
      return mk('pinterest', cleanHandle(segs[0]), 'perfil', `/${cleanHandle(segs[0])}/`);
    }
    case 'threads': {
      const h = segs.find((s) => s.startsWith('@'));
      return h ? mk('threads', cleanHandle(h), 'perfil', `/@${cleanHandle(h)}`) : null;
    }
    default: return null;
  }
}
const normKeyPart = (s: string) => s.toLowerCase().replace(/[^a-z0-9:_-]+/g, '');

// ------------------------------------------------------------------------------------------------------------------ contagens no trecho público
export const SNIPPET_LABEL: MetricsLabel = 'trecho_publico_do_buscador';
export type SnippetMetric = 'followers' | 'following' | 'posts' | 'videos' | 'likes' | 'subscribers';
export interface SnippetCount { metric: SnippetMetric; value: number; raw: string }

const MULT: Record<string, number> = { k: 1e3, mil: 1e3, thousand: 1e3, m: 1e6, mi: 1e6, mm: 1e6, million: 1e6, milhao: 1e6, milhoes: 1e6, millon: 1e6, millones: 1e6, b: 1e9, bi: 1e9, billion: 1e9 };
const METRIC_WORDS: Array<[SnippetMetric, string]> = [
  ['followers', 'seguidores|seguidor|followers|follower|seguidores|abonn[eé]s|follower|suiveurs|seguaci|folgt|abonnenten'],
  ['subscribers', 'inscritos|inscrito|subscribers|subscriber|suscriptores|abonn[eé]s de la cha[iî]ne'],
  ['following', 'seguindo|following|siguiendo'],
  ['posts', 'posts|post|publica[cç][oõ]es|publica[cç][aã]o|publicaciones|publications|beitr[aä]ge'],
  ['videos', 'v[ií]deos|v[ií]deo|videos|video|vid[eé]os'],
  ['likes', 'curtidas|curtida|likes|like|me gusta|j\'aime'],
];
const NUM = '(\\d{1,3}(?:[.,\\s]\\d{3})+|\\d+(?:[.,]\\d+)?)';
const UNIT = '(?:\\s*(mil|milh[oõ]es|milh[aã]o|k|mm|mi|m|b|bi|thousand|million|billion|millones|mill[oó]n))?';

/** Número com separadores de milhar OU decimal (pt: "1.234", "12,5 mil"; en: "1,234", "1.2M"). Sem unidade, separador seguido de 3 dígitos = milhar. */
export function parseCountNumber(numText: string, unit: string | undefined): number | null {
  const u = unit ? unit.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
  let n: number;
  if (u) {
    const mult = MULT[u] ?? MULT[u.replace(/s$/, '')];
    if (!mult) return null;
    const t = numText.replace(/\s/g, '');
    // com unidade o separador é decimal ("12,5 mil", "1.2M"); com vários separadores, só o último é decimal
    const seps = t.match(/[.,]/g) || [];
    const dec = seps.length > 1 ? t.replace(/[.,](?=.*[.,])/g, '') : t;
    n = parseFloat(dec.replace(',', '.')) * mult;
  } else {
    const t = numText.replace(/\s/g, '');
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) n = parseInt(t.replace(/[.,]/g, ''), 10);
    else if (/^\d+$/.test(t)) n = parseInt(t, 10);
    else n = Math.round(parseFloat(t.replace(',', '.')));
  }
  return Number.isFinite(n) && n >= 0 && n < 1e11 ? Math.round(n) : null;
}

/** Contagens públicas num trecho de busca ("12,5 mil seguidores · 340 publicações"). Cada valor leva o texto bruto (para auditoria). */
export function parseSnippetCounts(text: string): SnippetCount[] {
  const out: SnippetCount[] = []; const seen = new Set<SnippetMetric>();
  const t = String(text ?? '').slice(0, 2000);
  for (const [metric, words] of METRIC_WORDS) {
    // número antes da palavra ("12 mil seguidores") ou depois com dois pontos ("Seguidores: 12 mil")
    const before = new RegExp(`${NUM}${UNIT}\\s*(?:${words})\\b`, 'i').exec(t);
    const after = before ? null : new RegExp(`\\b(?:${words})\\s*[:\\-]?\\s*${NUM}${UNIT}`, 'i').exec(t);
    const m = before ?? after;
    if (!m || seen.has(metric)) continue;
    const v = parseCountNumber(m[1], m[2]);
    if (v !== null) { out.push({ metric, value: v, raw: m[0].trim().slice(0, 80) }); seen.add(metric); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ YouTube Data API v3
export const YT_ENABLE_MESSAGE = 'Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis (Console do Google Cloud, APIs e serviços, Biblioteca) e use a chave desse projeto.';
export const YT_KEY_MISSING_MESSAGE = 'Falta a chave do Google para o YouTube. Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis e guarde a chave (segredo YOUTUBE_API_KEY ou a mesma chave do projeto, GOOGLE_API_KEY_SPEED, depois de habilitar a API nela).';
export const YT_QUOTA_NOTE = 'Cota gratuita padrão: 10.000 unidades por dia. O custo de search.list em unidades NÃO foi confirmado nesta sessão (fontes divergem): conferir no console do Google antes de depender.';
const YT = 'https://www.googleapis.com/youtube/v3';

export function buildYtSearchUrl(o: { q: string; type: 'channel' | 'video'; key: string; regionCode?: string; relevanceLanguage?: string; maxResults?: number; publishedAfter?: string }): string | null {
  const q = String(o.q ?? '').trim();
  if (q.length < 2 || q.length > 200 || !o.key) return null;
  const p = new URLSearchParams({ part: 'snippet', type: o.type, q, maxResults: String(Math.max(1, Math.min(50, Math.round(o.maxResults ?? 10)))), key: o.key });
  if (o.regionCode && /^[A-Za-z]{2}$/.test(o.regionCode)) p.set('regionCode', o.regionCode.toUpperCase());
  if (o.relevanceLanguage && /^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$/.test(o.relevanceLanguage)) p.set('relevanceLanguage', o.relevanceLanguage.split('-')[0].toLowerCase());
  if (o.publishedAfter && !Number.isNaN(Date.parse(o.publishedAfter))) p.set('publishedAfter', new Date(o.publishedAfter).toISOString());
  return `${YT}/search?${p.toString()}`;
}
export function buildYtChannelsUrl(ids: string[], key: string): string | null {
  const clean = [...new Set(ids.filter((i) => /^UC[\w-]{20,24}$/.test(i)))].slice(0, 50);
  if (!clean.length || !key) return null;
  return `${YT}/channels?${new URLSearchParams({ part: 'snippet,statistics', id: clean.join(','), maxResults: '50', key }).toString()}`;
}
export function buildYtChannelByHandleUrl(handle: string, key: string): string | null {
  const h = handle.replace(/^@/, '').trim();
  if (!/^[\w.-]{3,60}$/.test(h) || !key) return null;
  return `${YT}/channels?${new URLSearchParams({ part: 'snippet,statistics', forHandle: `@${h}`, key }).toString()}`;
}
export function buildYtVideosUrl(ids: string[], key: string): string | null {
  const clean = [...new Set(ids.filter((i) => /^[\w-]{11}$/.test(i)))].slice(0, 50);
  if (!clean.length || !key) return null;
  return `${YT}/videos?${new URLSearchParams({ part: 'snippet,statistics', id: clean.join(','), key }).toString()}`;
}

export type YtFailure = { code: 'not_enabled' | 'quota' | 'key_invalid' | 'other'; message: string };
/** Traduz o erro do Google. `not_enabled` devolve a instrução exata de habilitação (nunca finge que funcionou). */
export function parseYtError(status: number, json: unknown): YtFailure | null {
  const e = (json as { error?: { code?: number; message?: string; errors?: Array<{ reason?: string }>; status?: string } })?.error;
  if (!e && status < 400) return null;
  const reason = e?.errors?.[0]?.reason ?? '';
  const msg = String(e?.message ?? '');
  if (reason === 'accessNotConfigured' || /has not been used in project|is disabled|accessNotConfigured/i.test(msg)) return { code: 'not_enabled', message: YT_ENABLE_MESSAGE };
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded') return { code: 'quota', message: 'A cota diária da YouTube Data API acabou. Volta a valer no próximo dia (fuso do Google) ou peça aumento de cota ao Google.' };
  if (reason === 'keyInvalid' || /API key not valid|API_KEY_INVALID/i.test(msg) || e?.status === 'INVALID_ARGUMENT') return { code: 'key_invalid', message: 'A chave do Google não vale para o YouTube. Confira se é a chave do projeto zica-posts-plataforma-apis e se a YouTube Data API v3 está habilitada nela.' };
  return { code: 'other', message: 'A YouTube Data API recusou o pedido.' };
}

export interface YtChannel { id: string; title: string; handle: string | null; subscribers: number | null; videos: number | null; views: number | null; published_at: string | null; country: string | null }
export function parseYtChannels(json: unknown): YtChannel[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };
  const out: YtChannel[] = [];
  for (const it of items as Array<Record<string, unknown>>) {
    const id = typeof it.id === 'string' ? it.id : ''; const sn = (it.snippet ?? {}) as Record<string, unknown>; const st = (it.statistics ?? {}) as Record<string, unknown>;
    if (!id) continue;
    out.push({
      id, title: String(sn.title ?? '').slice(0, 200), handle: typeof sn.customUrl === 'string' ? sn.customUrl.replace(/^@/, '') : null,
      subscribers: st.hiddenSubscriberCount === true ? null : num(st.subscriberCount), videos: num(st.videoCount), views: num(st.viewCount),
      published_at: typeof sn.publishedAt === 'string' ? sn.publishedAt : null, country: typeof sn.country === 'string' ? sn.country : null,
    });
  }
  return out;
}
/** Resultado de search.list (canais): só id/título/descrição; as contagens vêm de /channels. */
export function parseYtSearch(json: unknown): Array<{ kind: 'canal' | 'video'; id: string; title: string; channelId: string | null; published_at: string | null }> {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: Array<{ kind: 'canal' | 'video'; id: string; title: string; channelId: string | null; published_at: string | null }> = [];
  for (const it of items as Array<Record<string, unknown>>) {
    const idObj = (it.id ?? {}) as Record<string, unknown>; const sn = (it.snippet ?? {}) as Record<string, unknown>;
    const channelId = typeof idObj.channelId === 'string' ? idObj.channelId : typeof sn.channelId === 'string' ? sn.channelId : null;
    if (typeof idObj.videoId === 'string') out.push({ kind: 'video', id: idObj.videoId, title: String(sn.title ?? '').slice(0, 200), channelId, published_at: typeof sn.publishedAt === 'string' ? sn.publishedAt : null });
    else if (channelId && idObj.kind === 'youtube#channel') out.push({ kind: 'canal', id: channelId, title: String(sn.title ?? '').slice(0, 200), channelId, published_at: typeof sn.publishedAt === 'string' ? sn.publishedAt : null });
  }
  return out;
}
export interface YtVideo { id: string; title: string; channelId: string | null; published_at: string | null; views: number | null; likes: number | null }
export function parseYtVideos(json: unknown): YtVideo[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };
  return (items as Array<Record<string, unknown>>).filter((i) => typeof i.id === 'string').map((it) => {
    const sn = (it.snippet ?? {}) as Record<string, unknown>; const st = (it.statistics ?? {}) as Record<string, unknown>;
    return { id: String(it.id), title: String(sn.title ?? '').slice(0, 200), channelId: typeof sn.channelId === 'string' ? sn.channelId : null, published_at: typeof sn.publishedAt === 'string' ? sn.publishedAt : null, views: num(st.viewCount), likes: num(st.likeCount) };
  });
}

/** Cadência de publicação: vídeos nos últimos 30 e 90 dias e há quantos dias saiu o último. */
export function postingCadence(dates: Array<string | null>, nowMs: number): { last_30d: number; last_90d: number; days_since_last: number | null } {
  const ts = dates.map((d) => (d ? Date.parse(d) : NaN)).filter((t) => Number.isFinite(t) && t <= nowMs + 86_400_000);
  const day = 86_400_000;
  return { last_30d: ts.filter((t) => nowMs - t <= 30 * day).length, last_90d: ts.filter((t) => nowMs - t <= 90 * day).length, days_since_last: ts.length ? Math.max(0, Math.floor((nowMs - Math.max(...ts)) / day)) : null };
}

// ------------------------------------------------------------------------------------------------------------------ provedores terceiros (desligados por padrão)
export interface ThirdPartyAdapter {
  id: string; label: string; platforms: SocialPlatform[]; enabled: boolean; cost_note: string; terms_note: string;
}
/** Registro de adaptadores. Vem VAZIO de fábrica: nenhum provedor de terceiros está ligado nem escolhido. Registrar exige decisão do dono (custo e termos). */
export const THIRD_PARTY_ADAPTERS: ThirdPartyAdapter[] = [];
export const THIRD_PARTY_WARNING = 'Métricas profundas de Instagram, TikTok, Kwai, Facebook, LinkedIn, X, Pinterest e Threads só por provedor de dados terceiro autorizado ou parceria oficial. Isso tem custo por consulta (dentro do teto diário) e termos de uso próprios: leia antes de ligar. Desligado por padrão.';

export interface Availability { status: 'api_oficial' | 'trecho_publico' | 'provedor_terceiro' | 'indisponivel'; text: string }
/** O que dá para saber de cada plataforma AGORA (alimenta a tela: nunca um número sem origem). */
export function metricsAvailability(platform: SocialPlatform, o: { youtubeKey: boolean; adapters?: ThirdPartyAdapter[] }): Availability {
  if (platform === 'youtube') return o.youtubeKey ? { status: 'api_oficial', text: 'YouTube Data API v3 (oficial): inscritos, vídeos e visualizações públicas.' } : { status: 'indisponivel', text: YT_KEY_MISSING_MESSAGE };
  const ad = (o.adapters ?? THIRD_PARTY_ADAPTERS).find((a) => a.enabled && a.platforms.includes(platform));
  if (ad) return { status: 'provedor_terceiro', text: `Provedor terceiro autorizado: ${ad.label}. ${ad.cost_note}` };
  if (platform === 'site' || platform === 'gbp') return { status: 'trecho_publico', text: 'Nota e avaliações do Maps vêm do resultado de busca/mapas.' };
  return { status: 'indisponivel', text: 'Métricas indisponíveis sem API oficial/parceiro. Só o endereço do perfil e contagens que aparecem no trecho público do buscador (estimado).' };
}
