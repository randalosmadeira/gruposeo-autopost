import { describe, expect, it } from 'vitest';
import {
  buildProviderCall, composeQuery, coverageSummary, estimateTaskMicros, generateTasks, parseBrave, parseDfs, parseProviderResponse, parseSerper, planBatch, saturationOf, taskKey, parseDfsBacklinks, buildDfsBacklinksCall,
  type CoverageEntry, type DiscoveryTask, type FocusIn, type FocusPlaceIn,
} from '../../supabase/functions/_shared/radar-discovery-core';
import { buildPlaceIndex } from '../../supabase/functions/_shared/radar-geo-core';
import { DEFAULT_PRICE_BOOK } from '../../supabase/functions/_shared/spend-gate-core';
import {
  geoUniverse, DFS_MAPS, SERPER_PLACES_CRIMINALISTA, SERPER_SOCIAL_INSTAGRAM, SERPER_VIDEOS, SERPER_WEB_ESTETICA, SERPER_WEB_GUARULHOS, SERPER_WEB_ODONTO,
} from './helpers/radar-fixtures';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const u = geoUniverse(); const idx = buildPlaceIndex(u.places, u.members);
const place = (name: string, level = 'municipio') => u.places.find((p) => p.name === name && p.level === level)!;
const focus = (over: Partial<FocusIn> = {}): FocusIn => ({ id: 'f1', name: 'advogado criminalista', weight: 8, topics: ['advogado criminalista'], segmentLabel: null, nodeId: null, language: 'pt-BR', modalities: ['web', 'places', 'videos', 'social'], status: 'ativo', ...over });
const fp = (focusId: string, p: ReturnType<typeof place>, status = 'aprovado', weightMult = 1): FocusPlaceIn => ({ focusId, place: p, weightMult, status });
const units = DEFAULT_PRICE_BOOK.units;

describe('Radar: gerador automático de consultas (Foco x tema x território x motor x modalidade)', () => {
  it('compõe a consulta no idioma do Foco (conector local; idioma sem conector usa só a vizinhança)', () => {
    expect(composeQuery('advogado criminalista', 'Guarulhos', 'pt-BR')).toBe('advogado criminalista em Guarulhos');
    expect(composeQuery('dental implants', 'Miami', 'en')).toBe('dental implants in Miami');
    expect(composeQuery('estética facial', 'Madrid', 'es')).toBe('estética facial en Madrid');
    expect(composeQuery('implantes', 'Lisboa', 'xx')).toBe('implantes Lisboa');
  });

  it('gera consultas por modalidade, com `site:` para cada rede social, e ignora lugar rejeitado', () => {
    const r = generateTasks([focus()], [fp('f1', place('Guarulhos')), fp('f1', place('Osasco'), 'rejeitado')], idx, { engines: ['serper'], units });
    const mods = new Set(r.tasks.map((t) => t.modality));
    expect(mods).toEqual(new Set(['web', 'places', 'videos', 'social']));
    const social = r.tasks.filter((t) => t.modality === 'social').map((t) => t.platform).sort();
    expect(social).toEqual(['facebook', 'instagram', 'kwai', 'linkedin', 'pinterest', 'threads', 'tiktok', 'x']);
    expect(r.tasks.find((t) => t.platform === 'instagram')!.query).toBe('site:instagram.com advogado criminalista em Guarulhos');
    expect(r.tasks.some((t) => /Osasco/.test(t.query))).toBe(false);
    expect(r.tasks.every((t) => t.country === 'br' && t.language === 'pt-BR' && t.engine === 'serper')).toBe(true);
    expect(new Set(r.tasks.map((t) => t.key)).size).toBe(r.tasks.length); // chave estável e única
  });

  it('bairro entra como "Bairro, Município" e o Foco em inglês gera consultas em inglês (qualquer idioma)', () => {
    const r = generateTasks([focus({ id: 'f2', name: 'teeth whitening', language: 'en', topics: ['teeth whitening'], modalities: ['web'] })], [fp('f2', place('Tatuapé', 'distrito')), fp('f2', place('Miami'))], idx, { engines: ['serper'], units });
    expect(r.tasks.map((t) => t.query).sort()).toEqual(['teeth whitening in Miami', 'teeth whitening in Tatuapé, São Paulo']);
    expect(r.tasks.find((t) => /Miami/.test(t.query))!.country).toBe('us');
  });

  it('prioriza por peso do Foco, tamanho do lugar e modalidade', () => {
    const r = generateTasks([focus({ id: 'alto', weight: 9, modalities: ['web'] }), focus({ id: 'baixo', weight: 2, modalities: ['web'] })], [fp('alto', place('Osasco')), fp('baixo', place('São Paulo')), fp('alto', place('São Paulo'))], idx, { engines: ['serper'], units });
    const order = r.tasks.map((t) => `${t.focusId}:${t.query.split(' em ')[1] ?? ''}`.slice(0, 40));
    expect(r.tasks[0].focusId).toBe('alto');
    expect(r.tasks[0].priority).toBeGreaterThan(r.tasks[r.tasks.length - 1].priority);
    expect(order.indexOf('alto:São Paulo')).toBeLessThan(order.indexOf('alto:Osasco')); // cidade maior primeiro
    const mod = generateTasks([focus({ modalities: ['web', 'images'] })], [fp('f1', place('Guarulhos'))], idx, { engines: ['serper'], units }).tasks;
    expect(mod.find((t) => t.modality === 'web')!.priority).toBeGreaterThan(mod.find((t) => t.modality === 'images')!.priority);
  });

  it('cada modalidade vai ao motor que a atende; sem motor ligado não há tarefa; foco sem território é avisado', () => {
    const only = generateTasks([focus({ modalities: ['maps', 'web', 'videos'] })], [fp('f1', place('Guarulhos'))], idx, { engines: ['dfs_google', 'dfs_maps'], units });
    expect(only.tasks.find((t) => t.modality === 'maps')!.engine).toBe('dfs_maps');
    expect(only.tasks.find((t) => t.modality === 'web')!.engine).toBe('dfs_google');
    expect(only.tasks.some((t) => t.modality === 'videos')).toBe(false); // nenhum motor ligado atende vídeos
    expect(generateTasks([focus()], [fp('f1', place('Guarulhos'))], idx, { engines: [], units })).toMatchObject({ tasks: [], notes: ['sem_motor_ligado'] });
    expect(generateTasks([focus()], [], idx, { engines: ['serper'], units }).notes).toEqual(['foco_sem_territorio:advogado criminalista']);
    const multi = generateTasks([focus({ modalities: ['web'] })], [fp('f1', place('Guarulhos'))], idx, { engines: ['serper', 'brave', 'dfs_google'], units, multiWeb: true });
    expect(multi.tasks.map((t) => t.engine).sort()).toEqual(['brave', 'dfs_google', 'serper']);
  });

  it('a chave da tarefa não depende de maiúsculas e acentos, e muda com motor e idioma', () => {
    const a = taskKey({ engine: 'serper', modality: 'web', country: 'br', language: 'pt-BR', query: 'Advogado em São Paulo' });
    expect(taskKey({ engine: 'serper', modality: 'web', country: 'br', language: 'pt-BR', query: 'advogado em sao paulo' })).toBe(a);
    expect(taskKey({ engine: 'brave', modality: 'web', country: 'br', language: 'pt-BR', query: 'advogado em sao paulo' })).not.toBe(a);
  });
});

describe('Radar: lote dentro do orçamento, ledger de cobertura e saturação', () => {
  const tasks = generateTasks([focus({ modalities: ['web'] })], [fp('f1', place('São Paulo')), fp('f1', place('Guarulhos')), fp('f1', place('Osasco')), fp('f1', place('Santo André'))], idx, { engines: ['serper'], units }).tasks;
  it('estimativa por consulta vem da tabela de preços do teto diário e nunca é zero quando falta preço', () => {
    expect(estimateTaskMicros('serper', 'web', units).micros).toBe(2000);
    expect(estimateTaskMicros('dfs_maps', 'maps', units).micros).toBe(20_000); // 2x o preço da tarefa do provedor
    expect(estimateTaskMicros('serper', 'web', {}).micros).toBeGreaterThan(0);
  });
  it('para quando o próximo item estoura o orçamento', () => {
    const per = tasks[0].est_micros;
    const p = planBatch({ tasks, ledger: [], budgetMicros: per * 2 + 1, maxTasks: 100, nowMs: NOW, ttlDays: 7 });
    expect(p.selected).toHaveLength(2);
    expect(p.selected.map((t) => t.key)).toEqual(tasks.slice(0, 2).map((t) => t.key)); // os de maior prioridade
    expect(p.estimated_micros).toBeLessThanOrEqual(per * 2 + 1);
    expect(p.skipped_budget).toBe(tasks.length - 2);
    expect(planBatch({ tasks, ledger: [], budgetMicros: 0, maxTasks: 100, nowMs: NOW, ttlDays: 7 }).selected).toEqual([]);
    expect(planBatch({ tasks, ledger: [], budgetMicros: 1e9, maxTasks: 3, nowMs: NOW, ttlDays: 7 }).selected).toHaveLength(3);
  });
  it('pula o que já foi consultado dentro da validade e refaz o vencido', () => {
    const led: CoverageEntry[] = [
      { task_key: tasks[0].key, status: 'consultada', cost_micros: 2000, results: 8, new_entities: 3, queried_at: new Date(NOW - 2 * 86_400_000).toISOString() },
      { task_key: tasks[1].key, status: 'consultada', cost_micros: 2000, results: 8, new_entities: 0, queried_at: new Date(NOW - 10 * 86_400_000).toISOString() },
      { task_key: tasks[2].key, status: 'erro', cost_micros: 0, results: 0, new_entities: 0, queried_at: new Date(NOW).toISOString() },
    ];
    const p = planBatch({ tasks, ledger: led, budgetMicros: 1e9, maxTasks: 100, nowMs: NOW, ttlDays: 7 });
    expect(p.skipped_covered).toBe(1);
    expect(p.selected.map((t) => t.key)).toContain(tasks[1].key); // venceu (10 dias)
    expect(p.selected.map((t) => t.key)).toContain(tasks[2].key); // erro tenta de novo
    expect(p.selected.map((t) => t.key)).not.toContain(tasks[0].key);
    expect(planBatch({ tasks, ledger: led, budgetMicros: 1e9, maxTasks: 100, nowMs: NOW, ttlDays: 30 }).skipped_covered).toBe(2);
  });
  it('ledger mostra o que foi consultado, o que falta, custo e data (por Foco)', () => {
    const led: CoverageEntry[] = [{ task_key: tasks[0].key, status: 'consultada', cost_micros: 2000, results: 5, new_entities: 1, queried_at: '2026-11-19T10:00:00Z' }, { task_key: tasks[1].key, status: 'erro', cost_micros: 0, results: 0, new_entities: 0, queried_at: '2026-11-19T11:00:00Z' }];
    const s = coverageSummary(tasks, led);
    expect(s).toMatchObject({ planned_total: 4, done: 1, pending: 3, errors: 1, cost_micros: 2000, last_queried_at: '2026-11-19T11:00:00Z', pct_done: 25 });
    expect(s.by_focus).toEqual([{ focus_id: 'f1', total: 4, done: 1, pending: 3 }]);
  });
  it('saturação: concorrentes novos por rodada tendendo a zero (e nunca promete 100%)', () => {
    expect(saturationOf([]).message_key).toBe('sem_rodadas');
    expect(saturationOf([{ queries: 40, new_entities: 30, total_entities: 30 }]).message_key).toBe('poucas_rodadas');
    const rising = saturationOf([{ queries: 40, new_entities: 30, total_entities: 30 }, { queries: 40, new_entities: 12, total_entities: 42 }, { queries: 40, new_entities: 8, total_entities: 50 }]);
    expect(rising).toMatchObject({ saturated: false, trending_to_zero: true, message_key: 'tendendo_a_zero' });
    const done = saturationOf([{ queries: 40, new_entities: 30, total_entities: 30 }, { queries: 40, new_entities: 1, total_entities: 100 }, { queries: 40, new_entities: 1, total_entities: 101 }, { queries: 40, new_entities: 0, total_entities: 101 }]);
    expect(done).toMatchObject({ saturated: true, message_key: 'saturado' });
    expect(saturationOf([{ queries: 40, new_entities: 5, total_entities: 20 }, { queries: 40, new_entities: 9, total_entities: 29 }, { queries: 40, new_entities: 7, total_entities: 36 }]).message_key).toBe('ainda_descobrindo');
    expect(saturationOf([{ queries: 0, new_entities: 0, total_entities: 0 }]).message_key).toBe('sem_rodadas'); // rodada sem consulta não conta
  });
});

describe('Radar: chamadas aos provedores (segredo só no cabeçalho) e leitores de resposta gravada', () => {
  const t = (over: Partial<DiscoveryTask>): DiscoveryTask => ({ key: 'k1', focusId: 'f1', placeId: 'p1', nodeId: null, engine: 'serper', modality: 'web', query: 'advogado criminalista em Guarulhos', topic: 'x', country: 'br', language: 'pt-BR', city: null, platform: null, priority: 1, est_micros: 2000, ...over });
  const SECRET = 'segredo-de-teste-123456';
  it('Serper: POST com X-API-KEY e a modalidade certa; a chave nunca vai na URL nem no corpo', () => {
    for (const [mod, path] of [['web', 'search'], ['places', 'places'], ['maps', 'maps'], ['news', 'news'], ['images', 'images'], ['videos', 'videos'], ['social', 'search']] as const) {
      const c = buildProviderCall(t({ modality: mod }), SECRET)!;
      expect(c.url).toBe(`https://google.serper.dev/${path}`);
      expect((c.init.headers as Record<string, string>)['X-API-KEY']).toBe(SECRET);
      expect(c.url + String(c.init.body)).not.toContain(SECRET);
    }
    expect(JSON.parse(String(buildProviderCall(t({}), SECRET)!.init.body))).toMatchObject({ q: 'advogado criminalista em Guarulhos', gl: 'br', hl: 'pt' });
  });
  it('Brave e DataForSEO: cabeçalhos próprios; DataForSEO exige login:senha e país conhecido', () => {
    const b = buildProviderCall(t({ engine: 'brave', modality: 'videos' }), SECRET)!;
    expect(b.url).toContain('/res/v1/videos/search?');
    expect((b.init.headers as Record<string, string>)['X-Subscription-Token']).toBe(SECRET);
    expect(b.url).not.toContain(SECRET);
    const d = buildProviderCall(t({ engine: 'dfs_maps', modality: 'maps' }), 'login:senha123')!;
    expect(d.url).toBe('https://api.dataforseo.com/v3/serp/google/maps/live/advanced');
    expect((d.init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('login:senha123')}`);
    expect(String(d.init.body)).not.toContain('senha123');
    expect(JSON.parse(String(d.init.body))[0]).toMatchObject({ location_code: 2076, language_code: 'pt' });
    expect(buildProviderCall(t({ engine: 'dfs_google' }), 'sem-dois-pontos')).toBeNull();
    expect(buildProviderCall(t({ engine: 'dfs_google', country: 'zz' }), 'a:b')).toBeNull();
    expect(buildProviderCall(t({}), '')).toBeNull();
    expect(buildProviderCall(t({ engine: 'dfs_bing', modality: 'web' }), 'a:b')!.url).toContain('/serp/bing/organic/');
  });
  it('lê a SERP gravada da auditoria (web, lugares, vídeos, redes) sem perder resultado', () => {
    const web = parseSerper('web', SERPER_WEB_GUARULHOS);
    expect(web.hits).toHaveLength(8);
    expect(web.hits[0]).toMatchObject({ kind: 'organico', position: 1, url: 'https://evinistalon.com/advogado-criminalista-em-guarulhos/' });
    const places = parseSerper('places', SERPER_PLACES_CRIMINALISTA);
    expect(places.listings).toHaveLength(3);
    expect(places.listings[0]).toMatchObject({ name: 'Advocacia Rainov', rating: 4.9, reviews: 87, ref: '111', website: 'https://www.advocaciarainov.com.br/' });
    expect(places.listings[2].website).toBeNull();
    expect(parseSerper('videos', SERPER_VIDEOS).hits[0]).toMatchObject({ kind: 'video', source: 'Advocacia Rainov' });
    expect(parseSerper('social', SERPER_SOCIAL_INSTAGRAM).hits).toHaveLength(3);
    expect(parseSerper('web', null).hits).toEqual([]);
    expect(parseSerper('web', { organic: [{ link: 'javascript:alert(1)', title: 'x' }, { link: 'ftp://x', title: 'y' }] }).hits).toEqual([]); // só http(s)
  });
  it('DataForSEO mapas: avaliação, telefone, site e custo informado pelo provedor', () => {
    const r = parseDfs('dfs_maps', DFS_MAPS);
    expect(r.ok).toBe(true);
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0]).toMatchObject({ name: 'Clínica Sorriso SP', rating: 4.8, reviews: 210, ref: 'cid-9' });
    expect(r.cost_micros).toBe(4000);
    expect(parseDfs('dfs_maps', { status_code: 40000 })).toMatchObject({ ok: false, listings: [] });
    expect(parseProviderResponse({ engine: 'dfs_maps', modality: 'maps' }, DFS_MAPS).listings).toHaveLength(1);
  });
  it('Brave: web e notícias; backlinks pagos só com credencial válida', () => {
    expect(parseBrave('web', { web: { results: [{ url: 'https://a.example/', title: 'A', description: 'd' }] } }).hits[0]).toMatchObject({ kind: 'organico', position: 1 });
    expect(parseBrave('news', { results: [{ url: 'https://n.example/', title: 'N', age: '2 days ago' }] }).hits[0]).toMatchObject({ kind: 'noticia', date: '2 days ago' });
    expect(buildDfsBacklinksCall('https://www.exemplo.com/x', 'a:b')!.init.body).toContain('exemplo.com');
    expect(buildDfsBacklinksCall('exemplo', 'a:b')).toBeNull();
    expect(parseDfsBacklinks({ status_code: 20000, tasks: [{ status_code: 20000, cost: 0.02, result: [{ backlinks: 1200, referring_domains: 80, rank: 31, backlinks_spam_score: 4 }] }] })).toEqual({ backlinks: 1200, referring_domains: 80, rank: 31, spam_score: 4, cost_micros: 20000 });
  });
  it('as outras duas SERPs de segmento (estética e odontologia) também são lidas', () => {
    expect(parseSerper('web', SERPER_WEB_ESTETICA).hits).toHaveLength(3);
    expect(parseSerper('web', SERPER_WEB_ODONTO).hits.map((h) => h.position)).toEqual([1, 2, 3]);
  });
});
