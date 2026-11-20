/** Respostas gravadas e universo de lugares para os testes do Radar de Mercado (SEM rede). Os concorrentes de advocacia vêm da auditoria real da RDM (19/11/2026); os de estética e odontologia são fictícios (.example). */
import type { GeoMember, GeoPlace } from '../../../supabase/functions/_shared/radar-geo-core';
import { SP_SUBPREFEITURAS, spCapitalZonePack, spDistritoCode, SP_CAPITAL_IBGE_ID } from '../../../supabase/functions/_shared/radar-geo-br';

export const ORG = '00000000-0000-4000-8000-0000000000a1';
export const OTHER_ORG = '00000000-0000-4000-8000-0000000000a2';
export const PROJECT = '00000000-0000-4000-8000-0000000000b1';
export const OTHER_PROJECT = '00000000-0000-4000-8000-0000000000b2';
export const USER = '00000000-0000-4000-8000-0000000000c1';

let n = 0;
const pid = () => `00000000-0000-4000-8000-${String(100000 + ++n).padStart(12, '0')}`;
const base = (p: Partial<GeoPlace> & Pick<GeoPlace, 'level' | 'name' | 'code'>): GeoPlace => ({ id: pid(), parent_id: null, country: 'br', lat: null, lon: null, population: null, source: 'ibge', license: null, attribution: null, inferred: false, meta: {}, ...p });

/** Brasil > SP (estado) > municípios (SP, Guarulhos, Osasco, Santo André, Campinas) + distritos de São Paulo (do pacote de zonas) + zonas + região metropolitana. Também um segundo país (Portugal > Lisboa). */
export function geoUniverse(): { places: GeoPlace[]; members: GeoMember[]; byName: Map<string, GeoPlace> } {
  n = 0;
  const places: GeoPlace[] = []; const members: GeoMember[] = [];
  const add = (p: GeoPlace) => { places.push(p); return p; };
  const br = add(base({ level: 'pais', name: 'Brasil', code: 'br' }));
  const sp = add(base({ level: 'uf', name: 'São Paulo', code: 'br:uf:SP', parent_id: br.id, meta: { abbr: 'SP' } }));
  const city = (name: string, ibge: number, pop: number, lat: number, lon: number) => add(base({ level: 'municipio', name, code: `ibge:${ibge}`, parent_id: sp.id, population: pop, lat, lon, meta: { uf: 'SP', ibge_code: ibge } }));
  const sao = city('São Paulo', SP_CAPITAL_IBGE_ID, 11_451_999, -23.55, -46.63);
  const gru = city('Guarulhos', 3518800, 1_291_784, -23.46, -46.53);
  const osa = city('Osasco', 3534401, 728_615, -23.53, -46.79);
  const san = city('Santo André', 3547809, 748_919, -23.66, -46.53);
  const cam = city('Campinas', 3509502, 1_139_047, -22.9, -47.06);
  const rm = add(base({ level: 'regiao', name: 'Região Metropolitana de São Paulo', code: 'ibge:metropolitana:3501', parent_id: sp.id, meta: { kind: 'metropolitana' } }));
  for (const c of [sao, gru, osa, san]) members.push({ group_id: rm.id, member_id: c.id, relation: 'regiao_metropolitana' });
  // zonas informais (pacote) e distritos de São Paulo
  const pack = spCapitalZonePack();
  const zoneByCode = new Map<string, GeoPlace>();
  for (const z of pack.places) zoneByCode.set(z.code, add(base({ level: 'zona', name: z.name, code: z.code, parent_id: sao.id, source: 'pacote', inferred: true })));
  const distByCode = new Map<string, GeoPlace>();
  for (const sub of SP_SUBPREFEITURAS) for (const d of sub.distritos) distByCode.set(spDistritoCode(d), add(base({ level: 'distrito', name: d, code: spDistritoCode(d), parent_id: sao.id, source: 'pacote', meta: { subprefeitura: sub.nome } })));
  for (const m of pack.members) members.push({ group_id: zoneByCode.get(m.group.code)!.id, member_id: distByCode.get(m.member.code)!.id, relation: 'zona', inferred: true });
  add(base({ level: 'distrito', name: 'Pimentas', code: 'ibge:355030901', parent_id: gru.id }));
  add(base({ level: 'distrito', name: 'Guarulhos', code: 'ibge:351880001', parent_id: gru.id }));
  // outro país: Portugal > Lisboa (prova que o núcleo é genérico)
  const pt = add(base({ level: 'pais', name: 'Portugal', code: 'pt', country: 'pt', source: 'wikidata' }));
  add(base({ level: 'municipio', name: 'Lisboa', code: 'wd:Q597', parent_id: pt.id, country: 'pt', population: 545_796, lat: 38.72, lon: -9.14, source: 'wikidata' }));
  add(base({ level: 'municipio', name: 'Miami', code: 'gn:4164138', country: 'us', population: 442_241, lat: 25.76, lon: -80.19, source: 'geonames' }));
  return { places, members, byName: new Map(places.map((p) => [`${p.level}:${p.name}`, p])) };
}

// ------------------------------------------------------------------------------------------------------------------ respostas gravadas do IBGE
export const IBGE_DISTRITOS_GUARULHOS = [
  { id: 351880001, nome: 'Guarulhos', municipio: { id: 3518800, nome: 'Guarulhos' } },
  { id: 351880002, nome: 'Pimentas', municipio: { id: 3518800, nome: 'Guarulhos' } },
];
export const IBGE_METRO = [
  { id: '3501', nome: 'Região Metropolitana de São Paulo', municipios: [{ id: 3550308, nome: 'São Paulo' }, { id: 3518800, nome: 'Guarulhos' }, { id: 3534401, nome: 'Osasco' }] },
  { id: '3502', nome: 'Região Metropolitana da Baixada Santista', municipios: [{ id: 3548500, nome: 'Santos' }] },
  { id: '2601', nome: 'Região Metropolitana do Recife', municipios: [{ id: 2611606, nome: 'Recife' }] },
];
export const OVERPASS_TATUAPE = { elements: [
  { type: 'node', id: 1001, lat: -23.54, lon: -46.57, tags: { name: 'Tatuapé', place: 'suburb', wikidata: 'Q1234' } },
  { type: 'way', id: 1002, center: { lat: -23.56, lon: -46.6 }, tags: { name: 'Vila Carrão', place: 'neighbourhood' } },
  { type: 'node', id: 1003, lat: -23.5, lon: -46.5, tags: { name: 'Tatuapé', place: 'neighbourhood' } },
  { type: 'node', id: 1004, lat: 0, lon: 0, tags: { place: 'suburb' } },
  { type: 'node', id: 1005, lat: 0, lon: 0, tags: { name: 'Estação', place: 'station' } },
] };

// ------------------------------------------------------------------------------------------------------------------ SERP gravada (Serper): advocacia
const o = (position: number, link: string, title: string, snippet = '') => ({ position, link, title, snippet });
export const SERPER_WEB_GUARULHOS = { organic: [
  o(1, 'https://evinistalon.com/advogado-criminalista-em-guarulhos/', 'Advogado Criminalista em Guarulhos | Evinis Talon'),
  o(2, 'https://www.advocaciarainov.com.br/advogada-criminalista-guarulhos-sp/', 'Advogada Criminalista Guarulhos SP | Rainov Advocacia', 'Atendimento 24h'),
  o(3, 'https://mateuscosta.adv.br/advocacia-criminal-em-guarulhos/', 'Advocacia Criminal em Guarulhos | Mateus Costa'),
  o(4, 'https://advogadoscriminalistasemsp.com.br/advogado-criminalista-em-guarulhos-e-aeroporto/', 'Advogado Criminalista em Guarulhos e Aeroporto | Advogados Criminalistas em SP'),
  o(5, 'https://advogadoscriminalistasemsp.com.br/advogado-criminal-em-guarulhos-24hs/', 'Advogado Criminal em Guarulhos 24hs | Advogados Criminalistas em SP'),
  o(6, 'https://jsantosadvocacia.com.br/advogado-criminalista-guarulhos/', 'Advogado Criminalista Guarulhos | Santos Advocacia'),
  o(7, 'https://leandrosousaadvcriminal.com.br/', 'Leandro Sousa Advocacia Criminal'),
  o(8, 'https://www.jusbrasil.com.br/advogados/direito-criminal-guarulhos/', 'Advogados criminalistas em Guarulhos | Jusbrasil'),
] };
export const SERPER_WEB_ZONA_LESTE = { organic: [
  o(1, 'https://danielribeiroadvocacia.com.br/advogado-zona-leste/', 'Advogado Zona Leste SP | Daniel Ribeiro Advocacia'),
  o(2, 'https://rmartinez.com.br/advogado-zona-leste/', 'Advogado Zona Leste | Martinez'),
  o(3, 'https://advocaciaschettini.com.br/advogado-trabalhista-na-zona-leste/', 'Advogado Trabalhista na Zona Leste | Schettini'),
  o(4, 'https://marcosviveiroadvocacia.com/advogado-trabalhista-zona-leste/', 'Advogado Trabalhista Zona Leste | Marcos Viveiro'),
  o(5, 'https://advogadosgc.com.br/advogados-trabalhistas-da-zona-leste-sp/', 'Advogados Trabalhistas da Zona Leste SP | GC'),
] };
export const SERPER_PLACES_CRIMINALISTA = { places: [
  { position: 1, title: 'Advocacia Rainov', address: 'Av. Paulo Faccini, 100 - Guarulhos', rating: 4.9, ratingCount: 87, category: 'Escritório de advocacia', phoneNumber: '(11) 4000-1111', website: 'https://www.advocaciarainov.com.br/', cid: '111', latitude: -23.46, longitude: -46.53 },
  { position: 2, title: 'Santos Advocacia Criminal', address: 'Rua Dr. Ramos, 20 - Guarulhos', rating: 4.7, ratingCount: 41, category: 'Advogado criminalista', phoneNumber: '(11) 4000-2222', website: 'https://jsantosadvocacia.com.br/', cid: '222', latitude: -23.45, longitude: -46.52 },
  { position: 3, title: 'Escritório Sem Site', address: 'Rua A, 1 - Guarulhos', rating: 4.2, ratingCount: 9, category: 'Escritório de advocacia', phoneNumber: '(11) 4000-3333', cid: '333' },
] };
export const SERPER_SOCIAL_INSTAGRAM = { organic: [
  o(1, 'https://www.instagram.com/advocaciarainov/', 'Advocacia Rainov (@advocaciarainov) • Instagram', '12,5 mil seguidores · 340 publicações · Advogada criminalista em Guarulhos.'),
  o(2, 'https://www.instagram.com/p/Cabc123/', 'Post sobre prisão em flagrante', ''),
  o(3, 'https://www.instagram.com/perfilmisterioso/', 'Perfil Misterioso • Instagram', '1.234 seguidores'),
] };

// ------------------------------------------------------------------------------------------------------------------ estética e odontologia (fictícios)
export const SERPER_WEB_ESTETICA = { organic: [
  o(1, 'https://studioanabela.example/depilacao-a-laser-pinheiros/', 'Depilação a laser em Pinheiros | Studio Ana Bela'),
  o(2, 'https://clinicasorrisosp.example/', 'Clínica Sorriso SP'),
  o(3, 'https://www.tiktok.com/@studioanabela', 'Studio Ana Bela (@studioanabela) | TikTok', '8,3 mil Followers · 120 Likes'),
] };
export const SERPER_WEB_ODONTO = { organic: [
  o(1, 'https://sorrisoperfeito.example/clareamento-dental-lisboa/', 'Clareamento dental em Lisboa | Sorriso Perfeito'),
  o(2, 'https://www.facebook.com/sorrisoperfeito', 'Sorriso Perfeito - Home | Facebook', '3.4K followers'),
  o(3, 'https://www.youtube.com/@sorrisoperfeito', 'Sorriso Perfeito - YouTube', '1,2 mil inscritos'),
] };

export const SERPER_VIDEOS = { videos: [
  { position: 1, title: 'O que fazer em prisão em flagrante', link: 'https://www.youtube.com/watch?v=abcdefghijk', snippet: 'Canal do escritório', channel: 'Advocacia Rainov', date: '2 weeks ago' },
] };

export const DFS_MAPS = { status_code: 20000, cost: 0.004, tasks: [{ status_code: 20000, cost: 0.004, result: [{ items: [
  { type: 'maps_search', rank_group: 1, title: 'Clínica Sorriso SP', address: 'Rua B, 2 - São Paulo', rating: { value: 4.8, votes_count: 210 }, category: 'Dentista', phone: '+55 11 3000-1000', url: 'https://clinicasorrisosp.example/', cid: 'cid-9', latitude: -23.5, longitude: -46.6 },
  { type: 'paid', title: 'anúncio' },
] }] }] };

// ------------------------------------------------------------------------------------------------------------------ HTML gravado de um concorrente (estrutura da página do topo da auditoria: LegalService, FAQ, avaliação, endereço)
export const HTML_COMPETITOR_HOME = `<!doctype html><html lang="pt-BR"><head><title>Advogados Criminalistas em SP | Plantão 24h</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"LegalService","name":"Advogados Criminalistas em SP","telephone":"+55 11 99999-1234","address":{"@type":"PostalAddress","streetAddress":"Rua Exemplo, 100","addressLocality":"São Paulo","addressRegion":"SP","postalCode":"01000-000"},
  "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"134"},"openingHours":"Mo-Su 00:00-23:59","areaServed":["Guarulhos","São Paulo"],"geo":{"@type":"GeoCoordinates","latitude":-23.5,"longitude":-46.6},
  "sameAs":["https://www.instagram.com/advogadoscriminalistasemsp/","https://www.youtube.com/@criminalistasemsp","https://www.facebook.com/criminalistasemsp"]},
 {"@type":"FAQPage","mainEntity":[]}]}</script>
<meta name="generator" content="WordPress 6.5"></head>
<body><h1>Advogado criminalista 24 horas</h1><h2>Plantão</h2><h2>Como funciona</h2>
<p>${'Atendimento criminal com plantão em delegacias e fóruns da região. '.repeat(60)}</p>
<a href="/advogado-criminal-na-zona-sul/">Zona Sul</a><a href="/blog/prisao-em-flagrante/">Blog</a><a href="/contato/">Contato</a><a href="/sobre/">Sobre</a>
<a href="https://www.instagram.com/advogadoscriminalistasemsp/">Instagram</a><a href="https://www.tiktok.com/@criminalistasemsp">TikTok</a><a href="tel:+5511999991234">Ligar</a><a href="https://wa.me/5511999991234">WhatsApp</a>
<a href="https://outrosite.example/">externo</a></body></html>`;
export const SITEMAP_COMPETITOR = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://advogadoscriminalistasemsp.com.br/</loc><lastmod>2026-11-10</lastmod></url>
<url><loc>https://advogadoscriminalistasemsp.com.br/advogado-criminal-na-zona-sul/</loc><lastmod>2026-11-01</lastmod></url>
<url><loc>https://advogadoscriminalistasemsp.com.br/blog/prisao-em-flagrante/</loc><lastmod>2026-09-01</lastmod></url>
<url><loc>https://advogadoscriminalistasemsp.com.br/contato/</loc><lastmod>2025-01-01</lastmod></url>
<url><loc>https://advogadoscriminalistasemsp.com.br/sobre/</loc></url></urlset>`;
export const HTML_SERVICE_PAGE = `<html><head><title>Advogado criminal na Zona Sul</title></head><body><h1>Advogado criminal na Zona Sul</h1><p>${'Texto da página de serviço. '.repeat(120)}</p><a href="/">Início</a></body></html>`;

/** Resposta do YouTube Data API v3 (channels.list) gravada. */
export const YT_CHANNELS = { items: [
  { id: 'UCabcdefghijklmnopqrstuv', snippet: { title: 'Advocacia Rainov', customUrl: '@advocaciarainov', publishedAt: '2020-01-01T00:00:00Z', country: 'BR' }, statistics: { subscriberCount: '4300', videoCount: '120', viewCount: '250000' } },
  { id: 'UCzzzzzzzzzzzzzzzzzzzzzz', snippet: { title: 'Oculto' }, statistics: { hiddenSubscriberCount: true, videoCount: '5', viewCount: '100' } },
] };
export const YT_NOT_ENABLED = { error: { code: 403, message: 'YouTube Data API v3 has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/youtube.googleapis.com/overview', errors: [{ reason: 'accessNotConfigured' }] } };
export const YT_QUOTA = { error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } };
export const YT_SEARCH = { items: [
  { id: { kind: 'youtube#channel', channelId: 'UCabcdefghijklmnopqrstuv' }, snippet: { title: 'Advocacia Rainov', channelId: 'UCabcdefghijklmnopqrstuv' } },
  { id: { kind: 'youtube#video', videoId: 'abcdefghijk' }, snippet: { title: 'Prisão em flagrante', channelId: 'UCabcdefghijklmnopqrstuv', publishedAt: '2026-11-10T00:00:00Z' } },
] };
