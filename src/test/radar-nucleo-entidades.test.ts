import { describe, expect, it } from 'vitest';
import {
  candidatesFor, createBook, ensureOwn, ingestHit, ingestListing, ingestSiteLinks, liveEntity, mergeEntities, relinkOrphans, similarity, slugOfHost, type EntityBook, type IngestCtx,
} from '../../supabase/functions/_shared/radar-entity-core';
import { parseSerper } from '../../supabase/functions/_shared/radar-discovery-core';
import {
  THIRD_PARTY_ADAPTERS, THIRD_PARTY_WARNING, YT_ENABLE_MESSAGE, YT_KEY_MISSING_MESSAGE, buildYtChannelsUrl, buildYtSearchUrl, buildYtVideosUrl, classifySocialUrl, metricsAvailability, parseCountNumber,
  parseSnippetCounts, parseYtChannels, parseYtError, parseYtSearch, parseYtVideos, postingCadence,
} from '../../supabase/functions/_shared/radar-social-core';
import {
  SERPER_PLACES_CRIMINALISTA, SERPER_SOCIAL_INSTAGRAM, SERPER_WEB_ESTETICA, SERPER_WEB_GUARULHOS, SERPER_WEB_ODONTO, YT_CHANNELS, YT_NOT_ENABLED, YT_QUOTA, YT_SEARCH,
} from './helpers/radar-fixtures';

const ctx: IngestCtx = { engine: 'serper', modality: 'web', focusId: 'f1', placeId: 'p1', nodeId: null, queryKey: 'k1' };
const newBook = (own = 'rdmadvogados.com.br'): EntityBook => createBook({ competitors: [], identities: [], ownHosts: [own] });

describe('Radar: concorrente como ENTIDADE com várias identidades (resolução de entidade)', () => {
  it('o mesmo concorrente em vários endereços do mesmo domínio vira UMA entidade; diretório fica marcado', () => {
    const book = newBook();
    for (const h of parseSerper('web', SERPER_WEB_GUARULHOS).hits) ingestHit(book, h, ctx);
    const ents = [...book.entities.values()];
    const sites = ents.filter((e) => e.kind !== 'diretorio');
    expect(sites.map((e) => e.primary_host).sort()).toEqual(['advocaciarainov.com.br', 'advogadoscriminalistasemsp.com.br', 'evinistalon.com', 'jsantosadvocacia.com.br', 'leandrosousaadvcriminal.com.br', 'mateuscosta.adv.br']);
    expect(ents.find((e) => e.primary_host === 'jusbrasil.com.br')!.kind).toBe('diretorio');
    // as 2 páginas de advogadoscriminalistasemsp são a mesma entidade
    expect(sites.filter((e) => e.primary_host === 'advogadoscriminalistasemsp.com.br')).toHaveLength(1);
    expect(book.stats.new_entities).toBe(7);
  });

  it('o próprio negócio é reconhecido pelo domínio e não vira concorrente', () => {
    const book = newBook();
    ingestHit(book, { kind: 'organico', position: 2, url: 'https://www.rdmadvogados.com.br/advogado-criminalista/', title: 'Advogado Criminalista | RDM', snippet: null, date: null, source: null }, ctx);
    const e = [...book.entities.values()][0];
    expect(e.is_own).toBe(true);
    const own = ensureOwn(book, 'www.rdmadvogados.com.br', 'RDM Advogados');
    expect(own.id).toBe(e.id);
    expect(book.entities.size).toBe(1);
  });

  it('perfil de rede social liga ao concorrente pelo mesmo "slug" do site e guarda a PROVA', () => {
    const book = newBook();
    for (const h of parseSerper('web', SERPER_WEB_GUARULHOS).hits) ingestHit(book, h, ctx);
    for (const h of parseSerper('social', SERPER_SOCIAL_INSTAGRAM).hits) ingestHit(book, h, { ...ctx, modality: 'social' });
    const rainov = [...book.entities.values()].find((e) => e.primary_host === 'advocaciarainov.com.br')!;
    const ig = [...book.identities.values()].find((i) => i.platform === 'instagram' && i.handle === 'advocaciarainov')!;
    expect(ig.competitor_id).toBe(rainov.id);
    expect(ig.confidence).toBe(0.85);
    expect(ig.evidence).toMatchObject({ origem: 'serp', motivo: 'slug_igual' });
    // o perfil sem relação conhecida fica ÓRFÃO (vai para o Livro de pontas soltas), nunca é ligado por palpite
    const orf = [...book.identities.values()].find((i) => i.handle === 'perfilmisterioso')!;
    expect(orf.competitor_id).toBeNull();
    expect(book.stats.orphan_identities).toBeGreaterThanOrEqual(2); // misterioso e o post
  });

  it('link no site do concorrente (ou no schema) é prova forte e vence a similaridade', () => {
    const book = newBook();
    ingestHit(book, { kind: 'organico', position: 1, url: 'https://clinicasorrisosp.example/', title: 'Clínica Sorriso SP', snippet: null, date: null, source: null }, ctx);
    const ent = [...book.entities.values()][0];
    const n = ingestSiteLinks(book, ent.id, [{ url: 'https://www.instagram.com/outronome/', source: 'site' }, { url: 'https://www.tiktok.com/@qualquer', source: 'schema' }, { url: 'https://site.example/x', source: 'site' }]);
    expect(n).toBe(2);
    const ids = [...book.identities.values()].filter((i) => i.platform !== 'site');
    expect(ids.every((i) => i.competitor_id === ent.id && i.confidence === 0.95)).toBe(true);
    expect(ids.map((i) => i.evidence.origem).sort()).toEqual(['schema', 'site']);
    // reencontrar a mesma identidade por busca não troca o dono de maior confiança
    ingestHit(book, { kind: 'organico', position: 1, url: 'https://www.instagram.com/outronome/', title: 'Perfil', snippet: null, date: null, source: null }, ctx);
    expect([...book.identities.values()].filter((i) => i.platform === 'instagram')).toHaveLength(1);
  });

  it('listagem do Maps liga ao site (website), ao telefone ou ao nome; sem nada cria entidade nova', () => {
    const book = newBook();
    for (const h of parseSerper('web', SERPER_WEB_GUARULHOS).hits) ingestHit(book, h, ctx);
    const before = book.entities.size;
    const r = parseSerper('places', SERPER_PLACES_CRIMINALISTA).listings;
    const a = ingestListing(book, r[0], ctx); const b = ingestListing(book, r[1], ctx); const c = ingestListing(book, r[2], ctx);
    expect(liveEntity(book, a.entityId)!.primary_host).toBe('advocaciarainov.com.br');
    expect(liveEntity(book, b.entityId)!.primary_host).toBe('jsantosadvocacia.com.br');
    expect(liveEntity(book, c.entityId)!.name).toBe('Escritório Sem Site');
    expect(book.entities.size).toBe(before + 1);
    expect([...book.identities.values()].filter((i) => i.platform === 'gbp')).toHaveLength(3);
    // mesma listagem de novo = mesma identidade
    ingestListing(book, r[0], ctx);
    expect([...book.identities.values()].filter((i) => i.platform === 'gbp')).toHaveLength(3);
    // telefone igual liga a mesma entidade mesmo com outro nome
    const again = ingestListing(book, { ...r[2], ref: '999', name: 'Outro Nome Qualquer' }, ctx);
    expect(again.entityId).toBe(c.entityId);
  });

  it('similaridade, fusão manual e relink das órfãs depois que o concorrente aparece', () => {
    expect(similarity('Advocacia Rainov', 'advocaciarainov')).toBeGreaterThanOrEqual(0.85);
    expect(similarity('Clínica Sorriso', 'Studio Ana Bela')).toBe(0);
    expect(slugOfHost('www.advocaciarainov.com.br')).toBe('advocaciarainov');
    const book = newBook();
    for (const h of parseSerper('social', SERPER_SOCIAL_INSTAGRAM).hits) ingestHit(book, h, { ...ctx, modality: 'social' });
    const orphan = [...book.identities.values()].find((i) => i.handle === 'advocaciarainov')!;
    expect(orphan.competitor_id).toBeNull();
    ingestHit(book, { kind: 'organico', position: 1, url: 'https://www.advocaciarainov.com.br/', title: 'Rainov', snippet: null, date: null, source: null }, ctx);
    expect(relinkOrphans(book)).toBe(1);
    expect(orphan.competitor_id).not.toBeNull();
    expect(orphan.evidence).toMatchObject({ relink: true, motivo: 'slug_igual' });
    const o2 = [...book.identities.values()].find((i) => i.handle === 'perfilmisterioso')!;
    expect(candidatesFor(book, o2, 3)).toEqual([]);
    // fusão: as identidades mudam de dono e o antigo aponta para o novo
    const a = ingestListing(book, { ref: 'x1', name: 'Alfa Consultoria', address: null, rating: 4, reviews: 2, categories: [], phone: null, website: null, lat: null, lon: null, position: 1 }, ctx);
    const real = [...book.entities.values()].find((e) => e.primary_host === 'advocaciarainov.com.br')!;
    expect(mergeEntities(book, a.entityId, real.id)).toBe(true);
    expect(liveEntity(book, a.entityId)!.id).toBe(real.id);
    expect([...book.identities.values()].find((i) => i.platform === 'gbp')!.competitor_id).toBe(real.id);
    expect(mergeEntities(book, real.id, real.id)).toBe(false);
  });

  it('funciona para 3 segmentos e 4 plataformas: advocacia (Instagram), estética (TikTok), odontologia (Facebook e YouTube)', () => {
    const book = newBook('nossosite.example');
    for (const h of [...parseSerper('web', SERPER_WEB_GUARULHOS).hits.slice(0, 3), ...parseSerper('social', SERPER_SOCIAL_INSTAGRAM).hits, ...parseSerper('web', SERPER_WEB_ESTETICA).hits, ...parseSerper('web', SERPER_WEB_ODONTO).hits]) ingestHit(book, h, ctx);
    const plat = (p: string) => [...book.identities.values()].filter((i) => i.platform === p && i.competitor_id);
    expect(plat('instagram').length).toBeGreaterThanOrEqual(1);
    expect(plat('tiktok')[0].handle).toBe('studioanabela');
    expect(liveEntity(book, plat('tiktok')[0].competitor_id)!.primary_host).toBe('studioanabela.example'); // ligado pelo slug
    expect(plat('facebook')[0].handle).toBe('sorrisoperfeito');
    expect(plat('youtube')[0]).toMatchObject({ handle: 'sorrisoperfeito', kind: 'canal' });
    expect(liveEntity(book, plat('youtube')[0].competitor_id)!.primary_host).toBe('sorrisoperfeito.example');
  });
});

describe('Radar: redes sociais (só link e dado público) e contagens do trecho público', () => {
  it('reconhece perfil, vídeo e post nas 9 plataformas, sem confundir páginas do próprio site da rede', () => {
    const c = (u: string) => classifySocialUrl(u);
    expect(c('https://www.instagram.com/meu.perfil/')).toMatchObject({ platform: 'instagram', handle: 'meu.perfil', kind: 'perfil' });
    expect(c('https://instagram.com/p/ABC123/')).toMatchObject({ platform: 'instagram', kind: 'post' });
    expect(c('https://www.instagram.com/explore/')).toBeNull();
    expect(c('https://www.tiktok.com/@estudio')).toMatchObject({ platform: 'tiktok', handle: 'estudio', kind: 'perfil' });
    expect(c('https://www.tiktok.com/@estudio/video/123')).toMatchObject({ platform: 'tiktok', kind: 'video' });
    expect(c('https://www.kwai.com/@estudio')).toMatchObject({ platform: 'kwai', handle: 'estudio' });
    expect(c('https://www.facebook.com/clinica.exemplo')).toMatchObject({ platform: 'facebook', handle: 'clinica.exemplo' });
    expect(c('https://www.facebook.com/sharer/sharer.php?u=x')).toBeNull();
    expect(c('https://www.facebook.com/profile.php?id=1000')).toMatchObject({ platform: 'facebook', handle: '1000' });
    expect(c('https://br.linkedin.com/company/empresa-x')).toMatchObject({ platform: 'linkedin', handle: 'empresa-x' });
    expect(c('https://twitter.com/marca')).toMatchObject({ platform: 'x', handle: 'marca' });
    expect(c('https://x.com/marca/status/99')).toMatchObject({ platform: 'x', kind: 'post' });
    expect(c('https://www.pinterest.com/marca/')).toMatchObject({ platform: 'pinterest' });
    expect(c('https://www.threads.net/@marca')).toMatchObject({ platform: 'threads' });
    expect(c('https://www.youtube.com/@canal')).toMatchObject({ platform: 'youtube', kind: 'canal', handle: 'canal' });
    expect(c('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toMatchObject({ kind: 'canal' });
    expect(c('https://youtu.be/abcdefghijk')).toMatchObject({ kind: 'video', handle: 'abcdefghijk' });
    expect(c('https://www.youtube.com/shorts/abcdefghijk')).toMatchObject({ kind: 'video' });
    expect(c('https://maps.google.com/?cid=123456')).toMatchObject({ platform: 'gbp', kind: 'lugar' });
    expect(c('https://exemplo.com/instagram')).toBeNull();
    expect(c('não é url')).toBeNull();
    // a mesma identidade por endereços diferentes tem a mesma chave
    expect(c('https://instagram.com/MeuPerfil')!.key).toBe(c('https://www.instagram.com/meuperfil/')!.key);
  });

  it('extrai contagens do trecho público em pt, en e es, SEMPRE com o texto bruto', () => {
    const f = (t: string) => Object.fromEntries(parseSnippetCounts(t).map((x) => [x.metric, x.value]));
    expect(f('12,5 mil seguidores · 340 publicações')).toEqual({ followers: 12500, posts: 340 });
    expect(f('1.234 seguidores')).toEqual({ followers: 1234 });
    expect(f('8,3 mil Followers · 120 Likes')).toEqual({ followers: 8300, likes: 120 });
    expect(f('3.4K followers')).toEqual({ followers: 3400 });
    expect(f('1.2M Followers, 300 Posts')).toEqual({ followers: 1_200_000, posts: 300 });
    expect(f('1,2 mil inscritos')).toEqual({ subscribers: 1200 });
    expect(f('10 mil seguidores · 2 milhões de curtidas')).toMatchObject({ followers: 10000 });
    expect(f('sem número nenhum aqui')).toEqual({});
    expect(parseSnippetCounts('12,5 mil seguidores')[0].raw).toContain('seguidores');
    expect(parseCountNumber('1,234', undefined)).toBe(1234);
    expect(parseCountNumber('1,234,567', undefined)).toBe(1_234_567);
  });

  it('o rótulo do dado nunca finge ser oficial: trecho do buscador é estimado e sem API/parceiro fica "indisponível"', () => {
    expect(metricsAvailability('instagram', { youtubeKey: true }).status).toBe('indisponivel');
    expect(metricsAvailability('instagram', { youtubeKey: true }).text).toContain('Métricas indisponíveis sem API oficial/parceiro');
    for (const p of ['tiktok', 'kwai', 'facebook', 'linkedin', 'x', 'pinterest', 'threads'] as const) expect(metricsAvailability(p, { youtubeKey: true }).status).toBe('indisponivel');
    expect(metricsAvailability('youtube', { youtubeKey: true }).status).toBe('api_oficial');
    expect(metricsAvailability('youtube', { youtubeKey: false })).toMatchObject({ status: 'indisponivel', text: YT_KEY_MISSING_MESSAGE });
  });

  it('adaptador de provedor terceiro é pluggável, vem DESLIGADO e vazio, com aviso de custo e termos', () => {
    expect(THIRD_PARTY_ADAPTERS).toEqual([]);
    expect(THIRD_PARTY_WARNING).toMatch(/custo/i);
    expect(THIRD_PARTY_WARNING).toMatch(/termos/i);
    expect(THIRD_PARTY_WARNING).toMatch(/Desligado por padrão/);
    const ad = { id: 'x', label: 'Provedor X', platforms: ['instagram' as const], enabled: true, cost_note: 'US$ 0,01 por consulta.', terms_note: 'termos' };
    expect(metricsAvailability('instagram', { youtubeKey: false, adapters: [ad] }).status).toBe('provedor_terceiro');
    expect(metricsAvailability('instagram', { youtubeKey: false, adapters: [{ ...ad, enabled: false }] }).status).toBe('indisponivel');
  });
});

describe('Radar: YouTube Data API v3 (com e sem chave, sem fingir)', () => {
  it('sem chave devolve a instrução exata de habilitação, sem montar chamada nenhuma', () => {
    expect(buildYtSearchUrl({ q: 'advogado criminalista guarulhos', type: 'channel', key: '' })).toBeNull();
    expect(buildYtChannelsUrl(['UCabcdefghijklmnopqrstuv'], '')).toBeNull();
    expect(YT_KEY_MISSING_MESSAGE).toContain('Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis');
    expect(YT_ENABLE_MESSAGE).toContain('Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis');
  });
  it('monta as consultas com filtros de região e idioma e recusa entrada fora do formato', () => {
    const url = buildYtSearchUrl({ q: 'depilação a laser pinheiros', type: 'channel', key: 'K', regionCode: 'br', relevanceLanguage: 'pt-BR', maxResults: 99 })!;
    expect(url).toContain('type=channel');
    expect(url).toContain('regionCode=BR');
    expect(url).toContain('relevanceLanguage=pt');
    expect(url).toContain('maxResults=50');
    expect(buildYtSearchUrl({ q: 'a', type: 'video', key: 'K' })).toBeNull();
    expect(buildYtChannelsUrl(['xx', 'UCabcdefghijklmnopqrstuv'], 'K')).toContain('id=UCabcdefghijklmnopqrstuv');
    expect(buildYtChannelsUrl(['xx'], 'K')).toBeNull();
    expect(buildYtVideosUrl(['abcdefghijk', 'curto'], 'K')).toContain('id=abcdefghijk');
  });
  it('API não habilitada, cota e chave inválida viram mensagens diferentes (a primeira com a instrução exata)', () => {
    expect(parseYtError(403, YT_NOT_ENABLED)).toEqual({ code: 'not_enabled', message: YT_ENABLE_MESSAGE });
    expect(parseYtError(403, YT_QUOTA)?.code).toBe('quota');
    expect(parseYtError(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', errors: [{ reason: 'badRequest' }] } })?.code).toBe('key_invalid');
    expect(parseYtError(200, { items: [] })).toBeNull();
    expect(parseYtError(500, {})?.code).toBe('other');
  });
  it('lê canais (inscritos ocultos viram null, não zero), busca e vídeos; cadência de publicação', () => {
    const ch = parseYtChannels(YT_CHANNELS);
    expect(ch[0]).toMatchObject({ id: 'UCabcdefghijklmnopqrstuv', handle: 'advocaciarainov', subscribers: 4300, videos: 120, views: 250000 });
    expect(ch[1].subscribers).toBeNull();
    const s = parseYtSearch(YT_SEARCH);
    expect(s.map((x) => x.kind)).toEqual(['canal', 'video']);
    const v = parseYtVideos({ items: [{ id: 'abcdefghijk', snippet: { title: 'V', channelId: 'UC1', publishedAt: '2026-11-10T00:00:00Z' }, statistics: { viewCount: '900', likeCount: '12' } }] });
    expect(v[0]).toMatchObject({ views: 900, likes: 12 });
    const now = Date.parse('2026-11-20T00:00:00Z');
    expect(postingCadence(['2026-11-10T00:00:00Z', '2026-10-01T00:00:00Z', '2025-01-01T00:00:00Z', null], now)).toEqual({ last_30d: 1, last_90d: 2, days_since_last: 10 });
    expect(postingCadence([], now)).toEqual({ last_30d: 0, last_90d: 0, days_since_last: null });
  });
});
