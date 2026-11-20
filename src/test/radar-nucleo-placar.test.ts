import { describe, expect, it } from 'vitest';
import {
  AUTO_LINK_MIN, MIN_COVERAGE, SCORE_DISCLAIMER, SCORE_LABEL, WEIGHTS, attackList, auditOrphans, ctrAt, evidenceFor, landscape, overlapByNode, positionPoints, scoreBoard, scoreEvidence, trendOf, weekKey,
  type CompLite, type Evidence, type IdLite, type Snapshot,
} from '../../supabase/functions/_shared/radar-score-core';
import { createBook } from '../../supabase/functions/_shared/radar-entity-core';
import type { SiteScan } from '../../supabase/functions/_shared/radar-enrich-core';
import { geoUniverse } from './helpers/radar-fixtures';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const u = geoUniverse();
const gru = u.places.find((p) => p.name === 'Guarulhos' && p.level === 'municipio')!;
const osa = u.places.find((p) => p.name === 'Osasco')!;

const scan = (over: Partial<SiteScan> = {}, llms = true): SiteScan => ({
  host: 'x', status: 'ok', error: null, scanned_at: '2026-11-19T00:00:00Z', robots: { state: 'ok', sitemaps: [] }, sitemap: { urls: 120, files: 1, types: {}, cadence: null, declared: true }, llms_txt: { present: llms, lines: 3 },
  pages: [], content: { sampled: 5, words_avg: 1500, types_seen: ['home', 'servico', 'artigo', 'local', 'contato', 'sobre'] }, schema: { types: ['LegalService'], sameAs: ['a', 'b'], name: 'X', telephone: '1', address: 'a', rating: null, hasFaq: true, isLocal: true, areaServed: ['x'], openingHours: true, geo: true },
  nap: { names: ['X'], phones: ['1190000000'], address: 'a', consistent_phone: true }, tech: ['whatsapp_button'], links: { internal_avg: 30, internal_distinct: 40, external_domains: 3 }, social: [], speed: null, ...over,
});
const comp = (id: string, name: string, host: string | null, over: Partial<CompLite> = {}): CompLite => ({ id, name, kind: 'desconhecido', primary_host: host, is_own: false, status: 'sugerido', merged_into: null, authority: {}, ...over });
const ident = (id: string, cid: string | null, platform: string, metrics: Record<string, unknown> = {}, over: Partial<IdLite> = {}): IdLite => ({ id, competitor_id: cid, platform, kind: platform === 'youtube' ? 'canal' : 'perfil', metrics, metrics_label: 'trecho_publico_do_buscador', ...over });

function snap(over: Partial<Snapshot> = {}): Snapshot {
  const cov = (k: string, mod = 'web', place = gru.id) => ({ task_key: k, focus_id: 'f1', place_id: place, node_id: 'n2', modality: mod, status: 'consultada', query: `q ${k}` });
  return {
    now: NOW, focuses: [{ id: 'f1', name: 'Criminal', weight: 8, node_id: 'n1', status: 'ativo', topics: ['embriaguez ao volante'] }], places: new Map(u.places.map((p) => [p.id, p])),
    focusPlaces: [{ focus_id: 'f1', place_id: gru.id, status: 'aprovado' }, { focus_id: 'f1', place_id: osa.id, status: 'aprovado' }],
    nodes: [{ id: 'n1', label: 'Criminal', slug: 'criminal', kind: 'matriz', parent_id: null, status: 'aprovado' }, { id: 'n2', label: 'Embriaguez ao volante', slug: 'criminal/embriaguez', kind: 'subarea', parent_id: 'n1', status: 'aprovado' }, { id: 'n3', label: 'Tributário', slug: 'tributario', kind: 'matriz', parent_id: null, status: 'aprovado' }],
    competitors: [comp('own', 'Nós', 'nos.example', { is_own: true }), comp('A', 'Concorrente A', 'a.example', { authority: { opr: 5 } }), comp('B', 'Concorrente B', 'b.example'), comp('D', 'Diretório', 'dir.example', { kind: 'diretorio' })],
    identities: [], pages: [], listings: [], scans: new Map(), links: [], coverage: [cov('t1'), cov('t2'), cov('t3'), cov('t4'), cov('m1', 'places')], ai: [], aiPromptsTotal: 0, gsc: [], prompts: [], ...over,
  };
}
const page = (cid: string, key: string, position: number, over: Record<string, unknown> = {}) => ({ competitor_id: cid, focus_id: 'f1', place_id: gru.id, node_id: 'n2', position, modality: 'web', query_key: key, url: `https://${cid}.example/${key}`, ...over });

describe('Radar: score de força (transparente e SEMPRE "estimado")', () => {
  it('os pesos somam 100 e o rótulo/aviso dizem que não é nota do Google', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(SCORE_LABEL).toBe('estimado');
    expect(SCORE_DISCLAIMER).toMatch(/Não é a nota do Google/);
    expect(SCORE_DISCLAIMER).toMatch(/Domain Authority/);
    expect(positionPoints(1)).toBe(100);
    expect(positionPoints(4)).toBe(55);
    expect(positionPoints(15)).toBe(15);
    expect(positionPoints(50)).toBe(5);
  });
  it('fórmula da busca: 55% presença + 45% pontos de posição, e componente sem dado SAI da conta', () => {
    const e: Evidence = { serp: { tasks: 4, appearances: 2, best_positions: [1, 3] }, maps: null, scan: null, authority_opr: null, ai: null, reviews: null, social: null };
    const r = scoreEvidence(e);
    expect(r.components.find((c) => c.key === 'serp')!.value).toBe(66.2); // 100 x (0,55 x 0,5 + 0,45 x 0,86)
    expect(r.components.filter((c) => c.value === null)).toHaveLength(7);
    expect(r.coverage).toBe(0.22);
    expect(r.score).toBeNull(); // cobertura abaixo de 30%: não mostra nota
    expect(r.label).toBe('estimado');
    const r2 = scoreEvidence({ ...e, authority_opr: 5 }); // 22 + 9 = 31% de peso com dado
    expect(r2.coverage).toBe(0.31);
    expect(r2.score).toBe(Math.round(((66.2 * 22 + 50 * 9) / 31) * 10) / 10);
    expect(MIN_COVERAGE).toBe(0.3);
  });
  it('todos os componentes: conteúdo, sinais locais, autoridade, IA, avaliações e redes', () => {
    const e: Evidence = { serp: { tasks: 2, appearances: 2, best_positions: [1, 1] }, maps: { tasks: 1, appearances: 1, best_positions: [1] }, scan: scan(), authority_opr: 8, ai: { prompts_total: 10, prompts_cited: 5 }, reviews: { rating: 5, count: 100 }, social: { tasks: 3, platforms: ['instagram', 'tiktok', 'youtube', 'facebook'], active: true } };
    const r = scoreEvidence(e);
    expect(r.coverage).toBe(1);
    const v = (k: string) => r.components.find((c) => c.key === k)!.value;
    expect(v('serp')).toBe(100);
    expect(v('local')).toBe(100);
    expect(v('authority')).toBe(80);
    expect(v('ai')).toBe(50);
    expect(v('reviews')).toBe(100);
    expect(v('social')).toBe(100);
    expect(v('content')).toBeGreaterThan(90);
    expect(r.score).toBeGreaterThan(85);
    expect(r.components.find((c) => c.key === 'ai')!.facts).toEqual({ perguntas_com_citacao: 5, perguntas_observadas: 10 });
  });
  it('avaliações pesam pela quantidade (poucas avaliações valem menos que muitas com a mesma nota)', () => {
    const base: Evidence = { serp: null, maps: null, scan: null, authority_opr: null, ai: null, social: null, reviews: null };
    const few = scoreEvidence({ ...base, reviews: { rating: 5, count: 2 } }).components.find((c) => c.key === 'reviews')!.value!;
    const many = scoreEvidence({ ...base, reviews: { rating: 5, count: 500 } }).components.find((c) => c.key === 'reviews')!.value!;
    expect(many).toBe(100);
    expect(few).toBeLessThan(25);
  });
  it('monta a evidência do banco: busca, mapas, varredura, autoridade, IA e avaliação por Foco x território', () => {
    const s = snap({
      pages: [page('A', 't1', 1), page('A', 't2', 3), page('B', 't1', 5)], listings: [{ competitor_id: 'A', focus_id: 'f1', place_id: gru.id, rating: 4.9, reviews: 87, position: 1 }],
      scans: new Map([['A', scan()]]), ai: [{ host: 'a.example', query: 'p1', is_own: false, focus_id: 'f1' }, { host: 'z.example', query: 'p2', is_own: false, focus_id: 'f1' }], identities: [ident('i1', 'A', 'instagram', { followers: 100 })],
    });
    const board = scoreBoard(s, { focus_id: 'f1', place_id: gru.id });
    expect(board.map((b) => b.competitor.id)).toEqual(['A', 'B', 'own']); // diretório não entra; sem dado vai ao fim
    const a = board[0].result; const b = board[1].result;
    expect(a.components.find((c) => c.key === 'serp')!.facts).toMatchObject({ tarefas: 4, apareceu_em: 2 });
    expect(a.components.find((c) => c.key === 'maps')!.value).not.toBeNull();
    expect(a.components.find((c) => c.key === 'ai')!.facts).toMatchObject({ perguntas_com_citacao: 1, perguntas_observadas: 2 });
    expect(a.components.find((c) => c.key === 'authority')!.value).toBe(50);
    expect(a.score).toBeGreaterThan(b.score ?? -1);
    // evidência fora do escopo não conta
    expect(evidenceFor(s, s.competitors[1], { focus_id: 'f1', place_id: osa.id }).serp).toBeNull();
  });
});

describe('Radar: série semanal e tendência (subindo / caindo)', () => {
  const week = (n: number) => weekKey(NOW - (3 - n) * 7 * 86_400_000);
  it('chave da semana é a segunda-feira (UTC)', () => {
    expect(weekKey(Date.parse('2026-11-20T12:00:00Z'))).toBe('2026-11-16');
    expect(weekKey(Date.parse('2026-11-22T23:59:00Z'))).toBe('2026-11-16');
    expect(weekKey(Date.parse('2026-11-23T00:00:00Z'))).toBe('2026-11-23');
  });
  it('sobe, cai, fica estável e sem dados', () => {
    expect(trendOf([{ week: week(0), score: 40 }, { week: week(1), score: 42 }, { week: week(2), score: 50 }, { week: week(3), score: 55 }])).toMatchObject({ direction: 'subindo', delta: 11.5 });
    expect(trendOf([{ week: week(0), score: 60 }, { week: week(1), score: 50 }])).toMatchObject({ direction: 'caindo', delta: -10 });
    expect(trendOf([{ week: week(0), score: 60 }, { week: week(1), score: 61 }, { week: week(2), score: 60 }])).toMatchObject({ direction: 'estavel' });
    expect(trendOf([{ week: week(0), score: 60 }])).toEqual({ direction: 'sem_dados', delta: null, points: 1 });
    expect(trendOf([{ week: week(0), score: null }, { week: week(1), score: 5 }]).direction).toBe('sem_dados'); // semana sem nota não entra
    expect(trendOf([]).points).toBe(0);
  });
});

describe('Radar: "onde atacar" priorizado com por que e o que fazer', () => {
  const base = () => snap({
    pages: [page('A', 't1', 1), page('A', 't2', 2), page('B', 't1', 3), page('B', 't2', 4)],
    listings: [{ competitor_id: 'A', focus_id: 'f1', place_id: gru.id, rating: 4.9, reviews: 87, position: 1 }, { competitor_id: 'B', focus_id: 'f1', place_id: gru.id, rating: 4.1, reviews: 12, position: 2 }],
    scans: new Map([['A', scan()], ['B', scan()], ['own', scan({ llms_txt: { present: false, lines: 0 }, schema: null, tech: [] })]]),
    gsc: [{ query: 'embriaguez ao volante guarulhos', page: '/embriaguez/', position: 7.2, impressions: 1000, clicks: 20 }, { query: 'ja no topo', page: null, position: 2, impressions: 5000, clicks: 900 }, { query: 'muito fundo', page: null, position: 25, impressions: 5000, clicks: 0 }, { query: 'pouca demanda', page: null, position: 8, impressions: 10, clicks: 0 }],
  });
  it('posições 4 a 20 com impressões: ganho estimado por curva genérica, ligado ao Foco; fora da faixa não entra', () => {
    const items = attackList(base());
    const p = items.filter((i) => i.kind === 'posicao_4_20');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: 'embriaguez ao volante guarulhos', focus_id: 'f1', node_id: 'n1' });
    expect(p[0].why).toContain('posição 7,2');
    expect(p[0].why).toContain('curva genérica de cliques, estimada');
    expect(p[0].what).toContain('/embriaguez/');
    expect(p[0].priority).toBeGreaterThan(0);
    expect(ctrAt(3)).toBeGreaterThan(ctrAt(7));
    expect(attackList(snap({ gsc: [] })).some((i) => i.kind === 'posicao_4_20')).toBe(false);
  });
  it('lacuna na busca: concorrentes no topo e o seu site ausente', () => {
    const l = attackList(base()).filter((i) => i.kind === 'lacuna_serp');
    expect(l).toHaveLength(1);
    expect(l[0].why).toMatch(/2 concorrentes aparecem no topo em 2 busca\(s\)/);
    expect(l[0].place_id).toBe(gru.id);
    // se o seu site aparece, não há lacuna
    const withOwn = base(); withOwn.pages.push(page('own', 't1', 6), page('own', 't2', 9));
    expect(attackList(withOwn).some((i) => i.kind === 'lacuna_serp')).toBe(false);
  });
  it('buraco no Maps (>= 2 concorrentes com perfil e você sem) e correções baratas do próprio site', () => {
    const items = attackList(base());
    expect(items.find((i) => i.kind === 'buraco_maps')!.why).toBe('2 concorrentes têm perfil no Maps neste território e você não aparece.');
    const cheap = items.filter((i) => i.kind === 'correcao_barata').map((i) => i.id);
    expect(cheap).toEqual(expect.arrayContaining(['barata:llms_txt', 'barata:schema_local', 'barata:faq', 'barata:whatsapp']));
    expect(items.find((i) => i.id === 'barata:llms_txt')!.why).toBe('100% dos 2 concorrentes varridos têm arquivo llms.txt e o seu site não.');
    expect(items.find((i) => i.id === 'barata:llms_txt')!.what).toContain('llms.txt');
  });
  it('território fraco: o melhor concorrente tem score baixo', () => {
    const weak = snap({ pages: [page('B', 't1', 9)], coverage: snap().coverage.concat([]).slice(0, 5), scans: new Map([['B', scan({ content: { sampled: 1, words_avg: 100, types_seen: ['home'] }, schema: null, nap: { names: [], phones: [], address: null, consistent_phone: null }, tech: [] })]]), authority: undefined } as Partial<Snapshot>);
    const items = attackList(weak).filter((i) => i.kind === 'territorio_fraco');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].why).toMatch(/está fraco/);
  });
  it('ordenado por prioridade e respeita o limite', () => {
    const items = attackList(base(), { limit: 3 });
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.priority)).toEqual([...items.map((i) => i.priority)].sort((a, b) => b - a));
    expect(items.every((i) => i.title && i.why && i.what)).toBe(true);
  });
});

describe('Radar: retrato agregado por Foco x território x nó (quantos concorrem, com vídeo, canal, redes)', () => {
  it('"quantas profissionais com vídeo e canal concorrem aqui" (estética): contagens por plataforma, vídeos, avaliações', () => {
    const comps = ['P1', 'P2', 'P3', 'P4'].map((id) => comp(id, `Profissional ${id}`, `${id.toLowerCase()}.example`));
    const s = snap({
      competitors: [comp('own', 'Estúdio', 'estudio.example', { is_own: true }), ...comps], focuses: [{ id: 'f1', name: 'Depilação a laser', weight: 7, node_id: 'n1', status: 'ativo', topics: [] }],
      pages: comps.map((c, i) => page(c.id, `t${i + 1}`, i + 1)),
      links: comps.map((c) => ({ competitor_id: c.id, focus_id: 'f1', place_id: gru.id, node_id: 'n2' })),
      identities: [
        ident('y1', 'P1', 'youtube', { subscribers: 4300, videos: 120, last_30d: 3 }, { metrics_label: 'api_oficial' }), ident('y2', 'P2', 'youtube', { subscribers: 900, videos: 30, last_30d: 0 }, { metrics_label: 'api_oficial' }),
        ident('t1', 'P1', 'tiktok', { followers: 8300 }), ident('t2', 'P3', 'tiktok', { followers: 100 }), ident('i1', 'P1', 'instagram'), ident('i2', 'P2', 'instagram'), ident('i3', 'P4', 'instagram'), ident('k1', 'P4', 'kwai'),
        ident('s1', 'P1', 'site', {}, { kind: 'site' }), ident('g1', 'P2', 'gbp', {}, { kind: 'lugar' }),
      ],
      listings: [{ competitor_id: 'P2', focus_id: 'f1', place_id: gru.id, rating: 4.8, reviews: 200, position: 1 }, { competitor_id: 'P3', focus_id: 'f1', place_id: gru.id, rating: 4.0, reviews: 20, position: 2 }],
    });
    const [row] = landscape(s, 'focus');
    expect(row).toMatchObject({ id: 'f1', competitors: 4, with_youtube: 2, with_tiktok: 2, with_instagram: 3, with_kwai: 1, with_facebook: 0, with_site: 1, with_maps: 1, videos_total: 150, posts_30d: 3, reviews_total: 220, rating_avg: 4.4 });
    expect(row.strength_avg).not.toBeNull();
    const byPlace = landscape(s, 'place');
    expect(byPlace.find((r) => r.id === gru.id)!.competitors).toBe(4);
    expect(landscape(s, 'node').find((r) => r.id === 'n1')!.competitors).toBe(4); // o galho-pai soma os descendentes
  });
});

describe('Radar: sobreposição na árvore (galho, concorrentes que passam por ele, nossa posição, lacuna)', () => {
  it('cada nó lista os concorrentes que passam por ele ou por um descendente, com nosso score e a lacuna', () => {
    const s = snap({
      pages: [page('A', 't1', 1), page('A', 't2', 2), page('B', 't1', 4), page('own', 't3', 6)],
      links: [{ competitor_id: 'A', focus_id: 'f1', place_id: null, node_id: 'n2' }, { competitor_id: 'B', focus_id: 'f1', place_id: null, node_id: 'n2' }],
      scans: new Map([['A', scan()]]),
    });
    const att = attackList(s);
    const o = overlapByNode(s, att);
    const n1 = o.find((x) => x.node_id === 'n1')!; const n2 = o.find((x) => x.node_id === 'n2')!; const n3 = o.find((x) => x.node_id === 'n3')!;
    expect(n2.competitors.map((c) => c.id).sort()).toEqual(['A', 'B']);
    expect(n1.competitors.map((c) => c.id).sort()).toEqual(['A', 'B']); // pai herda
    expect(n3.empty).toBe(true);
    expect(n2.leader_score).not.toBeNull();
    expect(n2.own_score === null || typeof n2.own_score === 'number').toBe(true);
    expect(n1.depth).toBe(0);
    expect(n2.depth).toBe(1);
    expect(n2.attacks).toBeGreaterThanOrEqual(0);
  });
});

describe('Radar: Livro de pontas soltas (meta = zero órfãos)', () => {
  const bookWith = (identities: Array<{ id: string; competitor_id: string | null; platform: string; handle: string | null; display?: string }>) => createBook({
    competitors: [{ id: 'A', name: 'Advocacia Rainov', kind: 'desconhecido', primary_host: 'advocaciarainov.com.br', is_own: false }, { id: 'B', name: 'Concorrente B', kind: 'desconhecido', primary_host: 'b.example', is_own: false }],
    identities: identities.map((i) => ({ ...i, url: `https://x/${i.id}`, identity_key: `${i.platform}:perfil:${i.handle}`, kind: 'perfil', source: 'serp', confidence: 0.3, evidence: i.display ? { titulo: i.display } : {} })), ownHosts: [],
  });
  it('lista cada tipo de ponta solta com sugestão de ligação automática (e só automática quando a confiança é alta)', () => {
    const s = snap({
      competitors: [comp('A', 'Advocacia Rainov', 'advocaciarainov.com.br'), comp('B', 'Concorrente B', 'b.example'), comp('own', 'Nós', 'nos.example', { is_own: true })],
      pages: [page('A', 't1', 1), page('A', 't2', 2, { node_id: 'n2' }), page('B', 't1', 3, { node_id: null, focus_id: null })], links: [{ competitor_id: 'B', focus_id: 'f1', place_id: null, node_id: null }],
      focuses: [{ id: 'f1', name: 'Criminal', weight: 8, node_id: null, status: 'ativo', topics: ['embriaguez ao volante'] }, { id: 'f2', name: 'Tributário', weight: 5, node_id: null, status: 'ativo', topics: [] }],
      focusPlaces: [{ focus_id: 'f1', place_id: gru.id, status: 'aprovado' }],
      coverage: snap().coverage.map((c) => ({ ...c, focus_id: 'f1' })),
      prompts: [{ id: 'p1', query: 'quem defende embriaguez ao volante em guarulhos', topic: null }, { id: 'p2', query: 'melhor padaria da cidade', topic: null }],
    });
    const book = bookWith([{ id: 'i1', competitor_id: null, platform: 'instagram', handle: 'advocaciarainov' }, { id: 'i2', competitor_id: null, platform: 'tiktok', handle: 'ninguem_conhecido' }, { id: 'i3', competitor_id: 'A', platform: 'youtube', handle: 'canalx' }]);
    const r = auditOrphans(s, book);
    const by = (k: string) => r.items.filter((i) => i.kind === k);
    expect(by('perfil_sem_concorrente').map((i) => i.ref).sort()).toEqual(['i1', 'i2']);
    expect(by('perfil_sem_concorrente').find((i) => i.ref === 'i1')!.suggestion).toMatchObject({ action: 'ligar_identidade', target_id: 'A', auto: true });
    expect(by('perfil_sem_concorrente').find((i) => i.ref === 'i2')!.suggestion).toBeNull();
    expect(by('concorrente_sem_no').map((i) => i.ref).sort()).toEqual(['A', 'B']);
    expect(by('concorrente_sem_no').find((i) => i.ref === 'A')!.suggestion).toMatchObject({ action: 'ligar_no', target_id: 'n2', auto: true }); // A aparece em página do galho n2: a prova existe
    expect(by('concorrente_sem_no').find((i) => i.ref === 'B')!.suggestion).toBeNull(); // B não tem página ligada a nó: nada a sugerir por palpite
    expect(by('concorrente_sem_foco').map((i) => i.ref)).toEqual(['A']); // o vínculo é o que vale: A só tem páginas (sugere ligar ao foco f1); B já tem vínculo de foco
    expect(by('concorrente_sem_foco')[0].suggestion).toMatchObject({ action: 'ligar_foco', target_id: 'f1', auto: true });
    expect(by('no_sem_concorrente').map((i) => i.label)).toEqual(['Tributário']);
    expect(by('territorio_sem_varredura')).toHaveLength(0); // o território tem consulta feita
    expect(by('prompt_sem_foco').map((i) => i.ref)).toEqual(['p2']);
    expect(by('foco_sem_no').map((i) => i.label).sort()).toEqual(['Criminal', 'Tributário']);
    expect(by('foco_sem_no').find((i) => i.label === 'Criminal')!.suggestion).toMatchObject({ action: 'definir_no', target_id: 'n1', auto: true });
    expect(by('foco_sem_territorio').map((i) => i.label)).toEqual(['Tributário']);
    expect(r.total).toBe(r.items.length);
    expect(r.zero_orphans).toBe(false);
    expect(r.auto_fixable).toBeGreaterThanOrEqual(2);
    expect(AUTO_LINK_MIN).toBe(0.7);
  });
  it('quando tudo está ligado à árvore o relatório diz zero pontas soltas', () => {
    const s = snap({
      competitors: [comp('A', 'Advocacia Rainov', 'advocaciarainov.com.br')], pages: [page('A', 't1', 1)], links: [{ competitor_id: 'A', focus_id: 'f1', place_id: gru.id, node_id: 'n2' }],
      nodes: [{ id: 'n1', label: 'Criminal', slug: 'criminal', kind: 'matriz', parent_id: null, status: 'aprovado' }, { id: 'n2', label: 'Embriaguez', slug: 'criminal/e', kind: 'subarea', parent_id: 'n1', status: 'aprovado' }],
      focuses: [{ id: 'f1', name: 'Criminal', weight: 8, node_id: 'n1', status: 'ativo', topics: [] }], focusPlaces: [{ focus_id: 'f1', place_id: gru.id, status: 'aprovado' }], prompts: [{ id: 'p1', query: 'criminal em guarulhos', topic: null }],
    });
    const r = auditOrphans(s, bookWith([{ id: 'i1', competitor_id: 'A', platform: 'instagram', handle: 'advocaciarainov' }]));
    expect(r.items).toEqual([]);
    expect(r.zero_orphans).toBe(true);
    expect(r.total).toBe(0);
  });
});
