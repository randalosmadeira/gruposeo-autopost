/**
 * BRIEFING DE SUPERAÇÃO do Estúdio de Páginas: o briefing nasce da inteligência de concorrentes (Radar de Mercado) para SUPERAR a concorrência, não só preencher modelo.
 *
 * Seis partes, por consulta/Foco/território/nó da árvore:
 *  1. intenção e formato que vencem hoje (página, guia, comparativo, local, vídeo, mapa);
 *  2. benchmark das N melhores páginas (palavras, títulos, entidades, schema, mídia, atualização, links) e das identidades sociais/vídeos dos concorrentes;
 *  3. LACUNAS: o que eles cobrem e nós não; o que ninguém cobre bem (oportunidade);
 *  4. o que dizer de DIFERENTE e melhor (especificidade local, dado com fonte, autor real, fato de campo, ângulo próprio, prova), cada ângulo com a PROVA que o sustenta;
 *  5. pacote de superfícies da mesma ideia: página + vídeo + post curto + resposta curta para IA + item do Google Meu Negócio + links;
 *  6. metas e métrica de acompanhamento (posição, citação em IA, indexação), ligadas ao placar do Radar.
 * Mais o MAPA DE FONTES CITADAS PELAS IAs (Observatório): onde precisamos aparecer.
 *
 * Regras: só TEMAS e ESTRUTURA dos concorrentes entram (nunca texto: `checkNoCopy` reprova cópia); nada é inventado; sem dado do Radar, as lacunas e o benchmark viram
 * PENDÊNCIA (o briefing segue só com os dados do projeto e diz isso). Contrato com o Radar (outro módulo, lido por to_regclass): ver `RadarInput`.
 * Puro (sem rede, sem banco, sem IA).
 */
import { shingles } from './studio-doorway.ts';
import type { FieldFact, PageType, Pending, ProfileFacts, SourceRef } from './studio-types.ts';
import { isOfficialHost } from './studio-links.ts';

// ------------------------------------------------------------------------------------------------------------ contrato com o Radar
export interface RadarPage {
  url: string; host: string; title: string; position?: number | null; kind?: string | null;
  headings?: string[]; entities?: string[]; facts?: string[]; questions?: string[];
  words?: number | null; schemaTypes?: string[]; images?: number | null; videos?: number | null; updatedAt?: string | null; internalLinks?: number | null; externalLinks?: number | null;
  /** trecho de texto do concorrente: só para o `checkNoCopy` (nunca entra no briefing nem no prompt) */
  textSample?: string | null;
}
export interface RadarSocial { host: string; platform: string; handle?: string | null; topics: string[]; formats: string[]; postsPerMonth?: number | null; lastPostAt?: string | null }
export interface RadarScoreboard { position?: number | null; aiCitations?: number | null; indexed?: boolean | null; focusId?: string | null; /** nota semanal estimada do Radar (0 a 100) */ score?: number | null }
export interface RadarInput {
  source: 'radar' | 'serp_local' | 'ausente';
  /** 'completa' = o Radar mediu o conteúdo das páginas; 'so_titulos' = só a posição e o título (SERP do planejador de mercado) */
  depth: 'completa' | 'so_titulos' | 'nenhuma';
  pages: RadarPage[]; social: RadarSocial[]; mapPack: Array<{ name: string; rating?: number | null; reviews?: number | null }>; scoreboard: RadarScoreboard | null; fetchedAt: string | null;
}
export const EMPTY_RADAR: RadarInput = { source: 'ausente', depth: 'nenhuma', pages: [], social: [], mapPack: [], scoreboard: null, fetchedAt: null };

/** Linha do Observatório (nexus_citations): o que cada IA citou para uma pergunta. */
export interface CitationRow { engine: string | null; query: string | null; topic: string | null; url: string; host: string; is_own: boolean; position: number | null; title: string | null }

// ------------------------------------------------------------------------------------------------------------ utilidades
const fold = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set('de da do das dos em no na nos nas para por com e o a os as um uma ao aos que se the of in on for to and with at by an is are como qual quais quando onde the a de la el los las un una y en con por para del le les des et du au aux di il lo della dei delle der die das und von mit het een van'.split(' '));
const tokens = (s: string): string[] => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w));
const topicKey = (s: string): string => tokens(s).slice(0, 5).sort().join(' ');
const median = (xs: number[]): number | null => { const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

const VIDEO_HOST = /(?:^|\.)(?:youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|dailymotion\.com|kwai\.com)$/i;
const SOCIAL_HOST = /(?:^|\.)(?:instagram\.com|facebook\.com|linkedin\.com|x\.com|twitter\.com|threads\.net|pinterest\.com|reddit\.com|quora\.com)$/i;
const NEWS_HINT = /(?:^|\.)(?:g1|uol|folha|estadao|globo|cnn|bbc|reuters|nytimes|bloomberg|terra|r7|metropoles|conjur|migalhas|jota)\b/i;
const DIRECTORY_HINT = /(?:^|\.)(?:jusbrasil|doctoralia|reclameaqui|google|yelp|tripadvisor|trustpilot|glassdoor|yellowpages|guiamais|apontador|cylex|wikipedia|wikidata|clutch|capterra)\b/i;

export type SourceKind = 'video' | 'oficial' | 'diretorio' | 'noticia' | 'social_forum' | 'proprio' | 'outro';
export function classifyHost(host: string, own = false): SourceKind {
  const h = String(host || '').toLowerCase();
  if (own) return 'proprio';
  if (VIDEO_HOST.test(h)) return 'video';
  if (isOfficialHost(h)) return 'oficial';
  if (SOCIAL_HOST.test(h)) return 'social_forum';
  if (DIRECTORY_HINT.test(h)) return 'diretorio';
  if (NEWS_HINT.test(h)) return 'noticia';
  return 'outro';
}

// ------------------------------------------------------------------------------------------------------------ 1. intenção e formato
export type WinningFormat = PageType | 'video' | 'mapa';
export interface IntentReport { recommendedType: PageType; dominant: WinningFormat | null; mix: Record<string, number>; evidence: string[]; rationale: string; extraSurfaces: WinningFormat[] }

const FORMAT_RULES: Array<[WinningFormat, RegExp]> = [
  ['comparativo', /\bvs\.?\b|versus|compar|melhores?\b|ranking|top\s?\d+|alternativas?|best\b|alternatives?/i],
  ['guia', /guia|passo a passo|como\s|o que [eé]|tutorial|quando\s|o que fazer|what is|how to|guide|c[oó]mo\s|qu[eé] es\b/i],
  ['hub', /\bcategoria|todos os|lista de|diret[oó]rio|índice|directory|all\s/i],
];

export function classifyIntent(radar: RadarInput, query: string, placeTokens: string[] = []): IntentReport {
  const counts: Record<string, number> = {};
  const evidence: string[] = [];
  const bump = (k: string, why?: string) => { counts[k] = (counts[k] || 0) + 1; if (why && evidence.length < 8) evidence.push(why); };
  const pages = [...radar.pages].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const place = placeTokens.map(fold).filter(Boolean);
  for (const p of pages) {
    const host = p.host.toLowerCase();
    const text = `${p.title} ${p.url}`;
    if (p.kind === 'video' || VIDEO_HOST.test(host)) { bump('video', `#${p.position ?? '?'} ${host}: vídeo`); continue; }
    if (p.kind === 'mapa') { bump('mapa'); continue; }
    const f = FORMAT_RULES.find(([, re]) => re.test(text));
    if (f) { bump(f[0], `#${p.position ?? '?'} ${host}: ${f[0]}`); continue; }
    if (place.some((t) => fold(text).includes(t))) { bump('local', `#${p.position ?? '?'} ${host}: página local`); continue; }
    bump('servico', `#${p.position ?? '?'} ${host}: página de serviço`);
  }
  if (radar.mapPack.length) { counts.mapa = (counts.mapa || 0) + radar.mapPack.length; evidence.push(`${radar.mapPack.length} resultado(s) no pacote de mapas`); }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const mix: Record<string, number> = {}; for (const [k, v] of Object.entries(counts)) mix[k] = pct(v, total);
  const order = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const pageFormats = order.filter(([k]) => !['video', 'mapa'].includes(k));
  const dominant = (order[0]?.[0] as WinningFormat | undefined) ?? null;
  const fallback: PageType = place.some((t) => fold(query).includes(t)) ? 'local' : /como|o que|guia|how|what|c[oó]mo|qu[eé]/i.test(query) ? 'guia' : 'servico';
  const recommendedType = (pageFormats[0]?.[0] as PageType | undefined) ?? fallback;
  const extra: WinningFormat[] = [];
  if ((counts.video || 0) >= Math.max(1, total * 0.2)) extra.push('video');
  if ((counts.mapa || 0) >= 1) extra.push('mapa');
  const rationale = total
    ? `${pct(counts[pageFormats[0]?.[0] || ''] || 0, total)}% dos resultados que vencem hoje são "${pageFormats[0]?.[0] || recommendedType}"${extra.length ? `; também aparecem ${extra.join(' e ')}` : ''}.`
    : `Sem resultados medidos: o formato "${recommendedType}" vem da forma da consulta e do tipo pedido, não da concorrência.`;
  return { recommendedType, dominant, mix, evidence, rationale, extraSurfaces: extra };
}

// ------------------------------------------------------------------------------------------------------------ 2. benchmark
export interface BenchmarkReport {
  n: number; depth: RadarInput['depth'];
  medianWords: number | null; p75Words: number | null; medianHeadings: number | null; schemaPrevalence: Record<string, number>; mediaShare: { images: number; videos: number };
  medianAgeDays: number | null; medianInternalLinks: number | null; medianExternalLinks: number | null;
  pages: Array<{ position: number | null; host: string; url: string; title: string; words: number | null; schema: string[] }>;
  topEntities: Array<{ entity: string; pages: number }>;
  social: Array<{ platform: string; host: string; handle: string | null; topics: string[]; formats: string[]; postsPerMonth: number | null; lastPostAt: string | null }>;
  socialSummary: { identities: number; topFormats: Array<{ format: string; identities: number }>; medianPostsPerMonth: number | null };
}

export function buildBenchmark(radar: RadarInput, topN: number, nowMs: number): BenchmarkReport {
  const pages = [...radar.pages].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).slice(0, Math.max(1, topN));
  const words = pages.map((p) => p.words).filter((w): w is number => typeof w === 'number' && w > 0);
  const sorted = [...words].sort((a, b) => a - b);
  const p75 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))] : null;
  const schema: Record<string, number> = {};
  for (const p of pages) for (const t of new Set(p.schemaTypes || [])) schema[t] = (schema[t] || 0) + 1;
  for (const k of Object.keys(schema)) schema[k] = pct(schema[k], pages.length);
  const ages = pages.map((p) => (p.updatedAt && Number.isFinite(Date.parse(p.updatedAt)) ? Math.max(0, Math.round((nowMs - Date.parse(p.updatedAt)) / 86_400_000)) : NaN)).filter(Number.isFinite);
  const ent = new Map<string, number>();
  for (const p of pages) for (const e of new Set((p.entities || []).map((x) => x.trim()).filter(Boolean))) ent.set(e, (ent.get(e) || 0) + 1);
  const formats = new Map<string, number>();
  for (const s of radar.social) for (const f of new Set(s.formats)) formats.set(f, (formats.get(f) || 0) + 1);
  return {
    n: pages.length, depth: radar.depth,
    medianWords: median(words), p75Words: p75, medianHeadings: median(pages.map((p) => (p.headings || []).length).filter((x) => x > 0)), schemaPrevalence: schema,
    mediaShare: { images: pct(pages.filter((p) => (p.images || 0) > 0).length, pages.length), videos: pct(pages.filter((p) => (p.videos || 0) > 0 || VIDEO_HOST.test(p.host)).length, pages.length) },
    medianAgeDays: median(ages), medianInternalLinks: median(pages.map((p) => p.internalLinks).filter((x): x is number => typeof x === 'number')), medianExternalLinks: median(pages.map((p) => p.externalLinks).filter((x): x is number => typeof x === 'number')),
    pages: pages.map((p) => ({ position: p.position ?? null, host: p.host, url: p.url, title: p.title, words: p.words ?? null, schema: p.schemaTypes || [] })),
    topEntities: [...ent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([entity, n]) => ({ entity, pages: n })),
    social: radar.social.map((s) => ({ platform: s.platform, host: s.host, handle: s.handle ?? null, topics: s.topics.slice(0, 8), formats: s.formats, postsPerMonth: s.postsPerMonth ?? null, lastPostAt: s.lastPostAt ?? null })),
    socialSummary: { identities: radar.social.length, topFormats: [...formats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([format, identities]) => ({ format, identities })), medianPostsPerMonth: median(radar.social.map((s) => s.postsPerMonth).filter((x): x is number => typeof x === 'number')) },
  };
}

// ------------------------------------------------------------------------------------------------------------ 3. lacunas
export interface Gap { topic: string; kind: 'topico' | 'pergunta' | 'entidade'; coveredBy: number; of: number }
export interface GapReport { theyCoverWeDont: Gap[]; nobodyCovers: Array<{ topic: string; kind: 'pergunta' | 'consulta'; source: string }>; weCoverTheyDont: string[]; basis: 'conteudo' | 'so_titulos' | 'sem_dados' }

export function findGaps(radar: RadarInput, ours: { text: string; topics: string[]; candidates: Array<{ text: string; source: string }> }, topN: number): GapReport {
  const pages = [...radar.pages].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).slice(0, Math.max(1, topN));
  if (!pages.length) return { theyCoverWeDont: [], nobodyCovers: [], weCoverTheyDont: [], basis: 'sem_dados' };
  const ourTokens = new Set([...tokens(ours.text), ...ours.topics.flatMap(tokens)]);
  const covered = (topic: string) => { const t = tokens(topic); return t.length > 0 && t.filter((w) => ourTokens.has(w)).length / t.length >= 0.6; };
  const theirs = new Map<string, { label: string; kind: Gap['kind']; pages: Set<number> }>();
  pages.forEach((p, i) => {
    const add = (label: string, kind: Gap['kind']) => { const k = topicKey(label); if (!k || k.split(' ').length < 1) return; const cur = theirs.get(k) || { label, kind, pages: new Set<number>() }; cur.pages.add(i); theirs.set(k, cur); };
    (p.headings || []).forEach((h) => add(h, /[?？]$/.test(h.trim()) ? 'pergunta' : 'topico'));
    (p.questions || []).forEach((q) => add(q, 'pergunta'));
    (p.entities || []).forEach((e) => add(e, 'entidade'));
    // com só título (sem conteúdo), o título e o endereço são a única evidência de tema
    if (radar.depth === 'so_titulos') add(p.title, 'topico');
  });
  const need = Math.max(2, Math.ceil(pages.length * 0.3));
  const theyCoverWeDont: Gap[] = [...theirs.values()].filter((t) => t.pages.size >= Math.min(need, pages.length) && !covered(t.label)).sort((a, b) => b.pages.size - a.pages.size).slice(0, 20).map((t) => ({ topic: t.label, kind: t.kind, coveredBy: t.pages.size, of: pages.length }));
  const theirTokens = new Set([...theirs.values()].flatMap((t) => tokens(t.label)));
  const weakly = (q: string) => { const t = tokens(q); return t.length > 0 && t.filter((w) => theirTokens.has(w)).length / t.length < 0.5; };
  const nobodyCovers = ours.candidates.filter((c) => weakly(c.text)).slice(0, 15).map((c) => ({ topic: c.text, kind: /[?？]$/.test(c.text.trim()) ? ('pergunta' as const) : ('consulta' as const), source: c.source }));
  const weCoverTheyDont = ours.topics.filter((t) => tokens(t).length && tokens(t).every((w) => !theirTokens.has(w))).slice(0, 10);
  return { theyCoverWeDont, nobodyCovers, weCoverTheyDont, basis: radar.depth === 'completa' ? 'conteudo' : 'so_titulos' };
}

// ------------------------------------------------------------------------------------------------------------ 4. diferenciais (com a prova)
export interface Angle { id: string; kind: 'fato_de_campo' | 'dado_com_fonte' | 'autor_real' | 'angulo_proprio' | 'especificidade_local' | 'prova' | 'caso_real'; angle: string; proof: string[]; status: 'pronto' | 'pendente'; missing: string | null; gapTopics: string[] }

export function buildAngles(input: { profile: ProfileFacts; fieldFacts: FieldFact[]; sources: SourceRef[]; place: string | null; gaps: Gap[] }): Angle[] {
  const out: Angle[] = [];
  const gapTopics = input.gaps.slice(0, 3).map((g) => g.topic);
  const approved = input.fieldFacts.filter((f) => f.approved && f.source_url);
  for (const f of approved.slice(0, 6)) out.push({ id: `fato:${f.id}`, kind: input.place ? 'especificidade_local' : 'fato_de_campo', angle: `Usar o fato de campo (${f.kind}): ${f.text}`, proof: [f.source_label ? `${f.source_label}: ${f.source_url}` : String(f.source_url)], status: 'pronto', missing: null, gapTopics });
  const unapproved = input.fieldFacts.filter((f) => !f.approved || !f.source_url);
  if (unapproved.length) out.push({ id: 'fato:pendentes', kind: 'fato_de_campo', angle: `${unapproved.length} fato(s) de campo ainda sem aprovação ou sem fonte`, proof: [], status: 'pendente', missing: 'Aprove cada fato e informe a fonte para poder usá-lo.', gapTopics: [] });
  if (!approved.length) out.push({ id: 'fato:nenhum', kind: 'especificidade_local', angle: input.place ? `Fatos reais de ${input.place} (órgãos, endereços, prazos)` : 'Fatos reais do assunto (órgãos, prazos, documentos)', proof: [], status: 'pendente', missing: 'Nenhum fato de campo aprovado com fonte. Sem eles a página fica genérica (o que os concorrentes já fazem).', gapTopics });
  for (const s of input.sources.filter((x) => x.official || x.verified).slice(0, 4)) out.push({ id: `fonte:${s.url}`, kind: 'dado_com_fonte', angle: `Citar a fonte oficial: ${s.label}`, proof: [s.url], status: 'pronto', missing: null, gapTopics: [] });
  if (!input.sources.length) out.push({ id: 'fonte:nenhuma', kind: 'dado_com_fonte', angle: 'Dado oficial com a fonte ao lado (lei, tribunal, ministério)', proof: [], status: 'pendente', missing: 'Nenhuma fonte oficial informada.', gapTopics: [] });
  const a = input.profile.authors.find((x) => x.name && x.credential);
  out.push(a ? { id: 'autor', kind: 'autor_real', angle: `Assinar com ${a.name} (${a.credential})`, proof: [a.url || a.name], status: 'pronto', missing: null, gapTopics: [] } : { id: 'autor', kind: 'autor_real', angle: 'Autor real com credencial verificável', proof: [], status: 'pendente', missing: 'Cadastre o autor e a credencial no Perfil (o sistema não inventa autor).', gapTopics: [] });
  if (input.profile.voice || input.profile.offer) out.push({ id: 'angulo', kind: 'angulo_proprio', angle: `Ângulo próprio do negócio: ${[input.profile.offer, input.profile.voice].filter(Boolean).join(' · ').slice(0, 220)}`, proof: ['Perfil do Projeto'], status: 'pronto', missing: null, gapTopics });
  else out.push({ id: 'angulo', kind: 'angulo_proprio', angle: 'Posicionamento e diferenciais do negócio', proof: [], status: 'pendente', missing: 'Descreva o diferencial e o tom no Perfil do Projeto.', gapTopics: [] });
  out.push({ id: 'caso', kind: 'caso_real', angle: 'Caso ou experiência real autorizada (sem identificar ninguém)', proof: [], status: 'pendente', missing: 'Uma pessoa do negócio precisa fornecer e autorizar; o sistema não escreve caso inventado.', gapTopics: [] });
  return out;
}

// ------------------------------------------------------------------------------------------------------------ 5. pacote de superfícies
export interface Surface { kind: 'pagina' | 'video' | 'post_curto' | 'resposta_ia' | 'google_business' | 'links'; title: string; status: 'planejado' | 'pendente' | 'pronto'; prerequisites: string[]; notes: string }
export function buildSurfaces(input: { profile: ProfileFacts; intent: IntentReport; query: string; language: string; linkCount: { internal: number; external: number }; gbpUrl?: string | null }): Surface[] {
  const videoWins = input.intent.extraSurfaces.includes('video');
  const hasSocial = input.profile.sameAs.length > 0;
  return [
    { kind: 'pagina', title: `Página (${input.intent.recommendedType}) para "${input.query}"`, status: 'planejado', prerequisites: ['Briefing aprovado', 'Fatos de campo aprovados', 'Autor cadastrado'], notes: input.intent.rationale },
    { kind: 'video', title: 'Vídeo curto com roteiro e transcrição incorporada na página', status: 'pendente', prerequisites: ['Uma pessoa real grava (o sistema não simula voz nem rosto)', 'Roteiro revisado', 'Transcrição publicada na página'], notes: videoWins ? 'Vídeo aparece entre os resultados que vencem: prioridade alta.' : 'Vídeo não domina a busca hoje: prioridade normal.' },
    { kind: 'post_curto', title: 'Post curto com a resposta direta e link para a página', status: hasSocial ? 'planejado' : 'pendente', prerequisites: hasSocial ? ['Texto revisado'] : ['Cadastrar as redes oficiais no Perfil (sameAs)'], notes: 'Mesma resposta da página, em 1 a 3 frases, com a fonte.' },
    { kind: 'resposta_ia', title: 'Resposta curta para IA (bloco de resposta direta no topo)', status: 'planejado', prerequisites: ['Fato verificável e fonte ao lado', 'Entidade nomeada no texto'], notes: '30 a 60 palavras que respondem à pergunta sem depender do resto da página.' },
    { kind: 'google_business', title: 'Item do Google Meu Negócio (atualização ou pergunta e resposta)', status: input.gbpUrl ? 'planejado' : 'pendente', prerequisites: input.gbpUrl ? ['Texto revisado'] : ['Informar o link do perfil do Google no Perfil do Projeto'], notes: 'Só com perfil verificado e dados iguais aos do site (telefone, horário, endereço).' },
    { kind: 'links', title: 'Links internos e externos', status: input.linkCount.internal + input.linkCount.external > 0 ? 'planejado' : 'pendente', prerequisites: ['Plano de links gerado', 'Fontes verificadas (HEAD/200)'], notes: `${input.linkCount.internal} interno(s) e ${input.linkCount.external} externo(s) planejados.` },
  ];
}

// ------------------------------------------------------------------------------------------------------------ 6. metas
export interface Goal { key: 'posicao' | 'citacao_ia' | 'indexacao' | 'placar_radar'; label: string; current: number | boolean | null; target: string; source: string; status: 'medido' | 'pendente' }
export function buildGoals(input: { scoreboard: RadarScoreboard | null; ownCitations: number | null }): { goals: Goal[]; linkedToRadar: boolean } {
  const sb = input.scoreboard;
  const pos = sb?.position ?? null;
  const target = pos === null ? 'entrar no top 10 e, depois, no top 3' : pos <= 3 ? 'manter no top 3' : pos <= 10 ? 'chegar ao top 3' : 'entrar no top 10';
  return {
    linkedToRadar: !!sb,
    goals: [
      { key: 'posicao', label: 'Posição na busca', current: pos, target, source: sb ? 'placar do Radar' : 'sem placar do Radar', status: pos === null ? 'pendente' : 'medido' },
      { key: 'citacao_ia', label: 'Citações em respostas de IA', current: sb?.aiCitations ?? input.ownCitations, target: 'ser citado como fonte em pelo menos 1 IA para a consulta (separar "citado" de "recomendado")', source: sb?.aiCitations != null ? 'placar do Radar' : input.ownCitations != null ? 'Observatório' : 'sem medição', status: (sb?.aiCitations ?? input.ownCitations) === null ? 'pendente' : 'medido' },
      { key: 'placar_radar', label: 'Placar do Radar (nota estimada)', current: sb?.score ?? null, target: 'subir a nota semana a semana, em relação aos concorrentes do Foco', source: sb?.score != null ? 'Radar de Mercado (estimado)' : 'sem placar do Radar', status: sb?.score == null ? 'pendente' : 'medido' },
      { key: 'indexacao', label: 'Indexação da página', current: sb?.indexed ?? null, target: 'página no sitemap, enviada ao IndexNow/Bing e consultada no Google em até 14 dias', source: 'módulo Indexação', status: sb?.indexed == null ? 'pendente' : 'medido' },
    ],
  };
}

// ------------------------------------------------------------------------------------------------------------ mapa de fontes citadas pelas IAs
export interface CitedHost { host: string; kind: SourceKind; count: number; share: number; engines: string[]; ownedByUs: boolean; sampleUrl: string }
export interface PresenceTarget { host: string; kind: SourceKind; why: string; action: string }
export interface CitedSourcesMap { total: number; matched: 'consulta' | 'todas' | 'nenhuma'; byHost: CitedHost[]; own: { count: number; share: number }; presenceTargets: PresenceTarget[]; notes: string[] }

const ACTION_BY_KIND: Record<SourceKind, string> = {
  video: 'Publicar um vídeo curto sobre o tema (gravado por pessoa real) e incorporar a transcrição na página.',
  oficial: 'Citar esta fonte oficial na página, com o link; não há o que "conquistar" aqui.',
  diretorio: 'Conferir o cadastro do negócio neste diretório (dados iguais aos do Perfil, sem pagar por link).',
  noticia: 'Oferecer conteúdo informativo e útil à redação (sem promessa nem autopromoção).',
  social_forum: 'Participar de forma genuína, com informação útil e sem spam (se couber à marca).',
  proprio: 'Já é do próprio site.',
  outro: 'Avaliar se o site é relevante para o público e se há uma forma legítima e informativa de aparecer.',
};

export function citedSourcesMap(rows: CitationRow[], query: string, ownHosts: string[]): CitedSourcesMap {
  const own = new Set(ownHosts.map((h) => h.toLowerCase().replace(/^www\./, '')));
  const q = new Set(tokens(query));
  const rel = rows.filter((r) => { const t = tokens(`${r.query || ''} ${r.topic || ''}`); return t.length > 0 && q.size > 0 && t.filter((w) => q.has(w)).length / Math.max(1, Math.min(t.length, q.size)) >= 0.5; });
  const use = rel.length ? rel : rows;
  const matched: CitedSourcesMap['matched'] = rel.length ? 'consulta' : rows.length ? 'todas' : 'nenhuma';
  const by = new Map<string, { count: number; engines: Set<string>; own: boolean; sample: string }>();
  for (const r of use) {
    const host = r.host.toLowerCase().replace(/^www\./, '');
    const cur = by.get(host) || { count: 0, engines: new Set<string>(), own: false, sample: r.url };
    cur.count++; if (r.engine) cur.engines.add(r.engine); if (r.is_own || own.has(host)) cur.own = true; by.set(host, cur);
  }
  const total = use.length;
  const byHost: CitedHost[] = [...by.entries()].sort((a, b) => b[1].count - a[1].count).map(([host, v]) => ({ host, kind: classifyHost(host, v.own), count: v.count, share: pct(v.count, total), engines: [...v.engines].sort(), ownedByUs: v.own, sampleUrl: v.sample }));
  const ownCount = byHost.filter((h) => h.ownedByUs).reduce((a, h) => a + h.count, 0);
  const targets: PresenceTarget[] = byHost.filter((h) => !h.ownedByUs && (h.count >= 2 || h.share >= 10)).slice(0, 10).map((h) => ({ host: h.host, kind: h.kind, why: `Citado ${h.count} vez(es) (${h.share}%) por ${h.engines.join(', ') || 'IAs'} para esta consulta.`, action: ACTION_BY_KIND[h.kind] }));
  const notes: string[] = [];
  if (!rows.length) notes.push('O Observatório ainda não tem citações de IA para este projeto: rode uma medição (com o teto de gasto) para saber onde aparecer.');
  else if (matched === 'todas') notes.push('Nenhuma citação do Observatório é desta consulta: o mapa mostra as fontes mais citadas do projeto como um todo.');
  return { total, matched, byHost, own: { count: ownCount, share: pct(ownCount, total) }, presenceTargets: targets, notes };
}

// ------------------------------------------------------------------------------------------------------------ montagem do briefing
export interface BriefInput {
  query: string; language: string; type?: PageType | null;
  focus?: { id?: string | null; label?: string | null } | null; node?: { id?: string | null; label?: string | null; keywords?: string[] } | null; territory?: { place?: string | null; region?: string | null; country?: string | null } | null;
  profile: ProfileFacts; fieldFacts: FieldFact[]; sources: SourceRef[];
  radar: RadarInput | null; citations: CitationRow[] | null;
  /** texto do que o site já diz sobre o tema (páginas existentes) e termos próprios (taxonomia, consultas do Search Console) */
  ownText?: string; ownTopics?: string[]; candidateQuestions?: Array<{ text: string; source: string }>;
  topN: number; nowMs: number; gbpUrl?: string | null; linkCount?: { internal: number; external: number };
}
export interface OutlineItem { level: 2 | 3; heading: string; purpose: string; from: 'lacuna' | 'concorrentes' | 'diferencial' | 'pergunta' | 'estrutura' }
export interface SuperiorityBrief {
  version: 1; query: string; language: string; type: PageType; generated_at: string;
  focus: BriefInput['focus']; node: BriefInput['node']; territory: BriefInput['territory'];
  intent: IntentReport; benchmark: BenchmarkReport; gaps: GapReport; angles: Angle[]; surfaces: Surface[]; goals: ReturnType<typeof buildGoals>; citedSources: CitedSourcesMap;
  outline: OutlineItem[]; pendings: Pending[]; radarSource: RadarInput['source']; notes: string[];
}

export function buildSuperiorityBrief(input: BriefInput): SuperiorityBrief {
  const radar = input.radar && input.radar.pages.length ? input.radar : (input.radar || EMPTY_RADAR);
  const place = input.territory?.place || null;
  const placeTokens = [place, input.territory?.region].filter((x): x is string => !!x);
  const intent = classifyIntent(radar, input.query, placeTokens);
  const type = input.type || intent.recommendedType;
  const benchmark = buildBenchmark(radar, input.topN, input.nowMs);
  const nodeTopics = [input.node?.label, ...(input.node?.keywords || [])].filter((x): x is string => !!x);
  const ownTopics = [...(input.ownTopics || []), ...nodeTopics, input.query];
  const gaps = findGaps(radar, { text: input.ownText || '', topics: ownTopics, candidates: input.candidateQuestions || [] }, input.topN);
  const angles = buildAngles({ profile: input.profile, fieldFacts: input.fieldFacts, sources: input.sources, place, gaps: gaps.theyCoverWeDont });
  const cited = citedSourcesMap(input.citations || [], input.query, [input.profile.origin ? input.profile.origin.replace(/^https?:\/\//, '') : ''].filter(Boolean));
  const ownCitations = input.citations ? input.citations.filter((c) => c.is_own).length : null;
  const goals = buildGoals({ scoreboard: radar.scoreboard, ownCitations });
  const surfaces = buildSurfaces({ profile: input.profile, intent, query: input.query, language: input.language, linkCount: input.linkCount || { internal: 0, external: 0 }, gbpUrl: input.gbpUrl });

  const pendings: Pending[] = [];
  if (radar.depth === 'nenhuma') pendings.push({ id: 'radar_sem_dados', kind: 'radar', label: 'Inteligência de concorrentes', reason: 'O Radar de Mercado ainda não trouxe páginas de concorrentes para esta consulta ou Foco. Benchmark e lacunas ficam pendentes; o briefing segue só com os dados do projeto.' });
  else if (radar.depth === 'so_titulos') pendings.push({ id: 'radar_so_titulos', kind: 'radar', label: 'Profundidade do benchmark', reason: 'Só há posição e título dos concorrentes (SERP do planejador de mercado). Palavras, títulos internos, schema e mídia dependem do Radar medir o conteúdo.' });
  if (!input.citations || !input.citations.length) pendings.push({ id: 'observatorio_sem_dados', kind: 'radar', label: 'Fontes citadas pelas IAs', reason: 'O Observatório ainda não tem citações de IA para este projeto: o mapa de fontes citadas fica vazio.' });
  for (const a of angles.filter((x) => x.status === 'pendente')) pendings.push({ id: `angulo:${a.id}`, kind: a.kind === 'autor_real' ? 'humano' : 'dado', label: a.angle, reason: a.missing || 'Falta informação.' });

  // esqueleto de seções: lacunas dos concorrentes e perguntas reais viram títulos; o resto é estrutura mínima
  const outline: OutlineItem[] = [{ level: 2, heading: input.query, purpose: 'Resposta direta de 30 a 60 palavras no topo', from: 'estrutura' }];
  for (const g of gaps.theyCoverWeDont.slice(0, 5)) outline.push({ level: 2, heading: g.topic, purpose: `${g.coveredBy} de ${g.of} concorrentes cobrem e nós não`, from: 'lacuna' });
  for (const n of gaps.nobodyCovers.slice(0, 3)) outline.push({ level: 2, heading: n.topic, purpose: 'Ninguém cobre bem: oportunidade', from: 'pergunta' });
  for (const a of angles.filter((x) => x.status === 'pronto' && ['especificidade_local', 'fato_de_campo'].includes(x.kind)).slice(0, 2)) outline.push({ level: 2, heading: a.angle.replace(/^Usar o fato de campo \([^)]*\):\s*/, '').slice(0, 90), purpose: 'Fato de campo com fonte (diferencial)', from: 'diferencial' });

  const notes: string[] = ['Só temas e estrutura dos concorrentes entram no briefing: o texto deles nunca é copiado (o sistema reprova cópia).'];
  if (cited.notes.length) notes.push(...cited.notes);
  return { version: 1, query: input.query, language: input.language, type, generated_at: new Date(input.nowMs).toISOString(), focus: input.focus ?? null, node: input.node ?? null, territory: input.territory ?? null, intent, benchmark, gaps, angles, surfaces, goals, citedSources: cited, outline, pendings, radarSource: radar.source, notes };
}

// ------------------------------------------------------------------------------------------------------------ nunca copiar
export interface CopyCheck { ok: boolean; worst: { url: string; overlapPct: number } | null; offenders: Array<{ url: string; overlapPct: number }> }
/** Reprova cópia: compara trechos de 6 palavras do HTML com o texto dos concorrentes (só quando o Radar mandou `textSample`). `maxPct` vem do perfil de regras. */
export function checkNoCopy(html: string, competitors: Array<{ url: string; text: string }>, maxPct = 8): CopyCheck {
  const mine = shingles(String(html || '').replace(/<[^>]+>/g, ' '), 6);
  if (!mine.size) return { ok: true, worst: null, offenders: [] };
  const offenders: CopyCheck['offenders'] = [];
  let worst: CopyCheck['worst'] = null;
  for (const c of competitors) {
    const theirs = shingles(c.text, 6); let hit = 0;
    for (const s of mine) if (theirs.has(s)) hit++;
    const p = Math.round((hit / mine.size) * 100);
    if (!worst || p > worst.overlapPct) worst = { url: c.url, overlapPct: p };
    if (p > maxPct) offenders.push({ url: c.url, overlapPct: p });
  }
  return { ok: offenders.length === 0, worst, offenders };
}
