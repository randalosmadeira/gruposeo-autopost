import { beforeEach, describe, expect, it } from 'vitest';
import { handleRadarAction, RADAR_ACTIONS, RADAR_MIN_ROLE, RADAR_PAID_ACTIONS, type RadarDeps } from '../../supabase/functions/_shared/radar-handler';
import { runRadar } from '../../supabase/functions/_shared/radar-runner';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import {
  DFS_MAPS, HTML_COMPETITOR_HOME, HTML_SERVICE_PAGE, IBGE_DISTRITOS_GUARULHOS, IBGE_METRO, OTHER_ORG, OTHER_PROJECT, ORG, OVERPASS_TATUAPE, PROJECT, SERPER_PLACES_CRIMINALISTA, SERPER_SOCIAL_INSTAGRAM,
  SERPER_VIDEOS, SERPER_WEB_GUARULHOS, SITEMAP_COMPETITOR, USER, YT_CHANNELS, YT_NOT_ENABLED, YT_SEARCH, geoUniverse,
} from './helpers/radar-fixtures';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const SECRET = 'segredo-serper-de-teste-0123456789';
const DENIED = () => Object.assign(new Error('spend'), { name: 'SpendDeniedError', info: { code: 'daily_cap_reached' } });

const AI_REPLY = '```json\n' + JSON.stringify({ focuses: [
  { name: 'Criminal', segment: 'Criminal', topics: ['embriaguez ao volante'], audiences: ['urgencia', 'alvo'], weight: 9, goals: [], target_hosts: [], language: 'pt-BR', territory: [
    { text: 'Zona Leste', kind: 'zona', context: 'São Paulo' }, { text: 'Zona Norte', kind: 'zona', context: 'São Paulo' }, { text: 'Zona Sul', kind: 'zona', context: 'São Paulo' }, { text: 'Guarulhos', kind: 'lugar', expand_region: true }] },
  { name: 'Empresarial', segment: 'Empresarial', topics: ['defesa de reclamadas', 'ações de ex-funcionários', 'acidentes com frotas'], audiences: ['alvo'], weight: 5, language: 'pt-BR', territory: [{ text: 'SP', kind: 'lugar' }] },
] }) + '\n```';
const PHRASE = 'ênfase em criminal na Zona Leste, Norte, Sul, Guarulhos e região; embriaguez ao volante; empresarial: defesa de reclamadas, ações de ex-funcionários, acidentes com frotas em SP';

type World = ReturnType<typeof world>;
function world(extra: Record<string, Row[]> = {}) {
  const u = geoUniverse();
  const tables: Record<string, Row[]> = {
    projects: [{ id: PROJECT, name: 'RDM', domain: 'rdmadvogados.com.br', wordpress_url: null, organization_id: ORG }, { id: OTHER_PROJECT, name: 'Outra', domain: 'outra.example', wordpress_url: null, organization_id: OTHER_ORG }],
    geo_places: u.places.map((p) => ({ ...p, name_norm: p.name.toLowerCase() })), geo_place_members: u.members.map((m) => ({ ...m })),
    project_taxonomy_nodes: [{ id: '00000000-0000-4000-8000-00000000f001', project_id: PROJECT, label: 'Criminal', slug: 'criminal', kind: 'matriz', parent_id: null, status: 'aprovado' }],
    ...extra,
  };
  return { ...fakeAdmin(tables), u };
}

interface Calls { paid: Array<{ url: string; body: string; headers: Record<string, string> }>; free: string[]; sleeps: number[] }
function mkDeps(over: Partial<RadarDeps> = {}, calls: Calls = { paid: [], free: [], sleeps: [] }, opts: { denyAfter?: number } = {}): { deps: RadarDeps; calls: Calls } {
  let n = 0;
  const serp = (url: string, body: string): unknown => {
    const q = (JSON.parse(body || '{}').q as string) || '';
    if (url.endsWith('/places') || url.endsWith('/maps')) return SERPER_PLACES_CRIMINALISTA;
    if (url.endsWith('/videos')) return SERPER_VIDEOS;
    if (/site:instagram/.test(q)) return SERPER_SOCIAL_INSTAGRAM;
    if (/site:/.test(q)) return { organic: [] };
    return SERPER_WEB_GUARULHOS;
  };
  const deps: RadarDeps = {
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.free.push(url);
      if (url.includes('/localidades/municipios/3518800/distritos')) return Response.json(IBGE_DISTRITOS_GUARULHOS);
      if (url.endsWith('/localidades/regioes-metropolitanas')) return Response.json(IBGE_METRO);
      if (url.includes('overpass')) return Response.json(OVERPASS_TATUAPE);
      if (url.includes('youtube/v3/search')) return Response.json(YT_SEARCH);
      if (url.includes('youtube/v3/channels')) return Response.json(YT_CHANNELS);
      if (url.includes('youtube/v3/videos')) return Response.json({ items: [{ id: 'abcdefghijk', snippet: { title: 'Prisão em flagrante', channelId: 'UCabcdefghijklmnopqrstuv', publishedAt: '2026-11-10T00:00:00Z' }, statistics: { viewCount: '900' } }] });
      if (url.includes('openpagerank')) return Response.json({ response: [{ status_code: 200, domain: 'advogadoscriminalistasemsp.com.br', page_rank_decimal: 3.2, rank: '55555' }] });
      void init;
      const host = new URL(url).hostname;
      if (host === 'advogadoscriminalistasemsp.com.br') {
        const path = new URL(url).pathname;
        if (path === '/robots.txt') return new Response('User-agent: *\nSitemap: https://advogadoscriminalistasemsp.com.br/sitemap.xml', { headers: { 'content-type': 'text/plain' } });
        if (path === '/sitemap.xml') return new Response(SITEMAP_COMPETITOR, { headers: { 'content-type': 'application/xml' } });
        if (path === '/') return new Response(HTML_COMPETITOR_HOME, { headers: { 'content-type': 'text/html' } });
        if (path === '/llms.txt') return new Response('x', { status: 404 });
        return new Response(HTML_SERVICE_PAGE, { headers: { 'content-type': 'text/html' } });
      }
      return new Response('nf', { status: 404 });
    }) as typeof fetch,
    lookupA: async () => ['93.184.216.34'], now: () => NOW, sleep: async (ms) => { calls.sleeps.push(ms); },
    paidFetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (opts.denyAfter !== undefined && n >= opts.denyAfter) throw DENIED();
      n++;
      const url = String(input); const body = String(init?.body ?? '');
      calls.paid.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.includes('dataforseo')) return Response.json(DFS_MAPS);
      return Response.json(serp(url, body));
    }) as typeof fetch,
    readSecret: async (_org, provider) => (provider === 'serper' ? SECRET : null), youtubeKey: null, oprKey: null, speedApiKey: null, ...over,
  };
  return { deps, calls };
}
const ctx = (action: string, body: Record<string, unknown>, deps: RadarDeps, role = 'editor', org = ORG) => ({ action, body: { projectId: PROJECT, ...body }, userId: USER, roleByOrg: new Map([[org, role]]), deps });
const call = (w: World, action: string, body: Record<string, unknown>, deps: RadarDeps, role = 'editor') => handleRadarAction(w.admin, ctx(action, body, deps, role));
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const rows = (w: World, t: string) => (w.tables[t] ?? []) as Body[];

describe('Radar: portão, papéis e isolamento entre organizações', () => {
  it('cada ação tem papel mínimo; leitura = membro, escrita = editor, território compartilhado = administrador; só rodada e backlinks são pagos', () => {
    expect(RADAR_ACTIONS.length).toBeGreaterThanOrEqual(26);
    for (const a of ['overview', 'territory', 'plan', 'coverage', 'competitors_list', 'competitor_detail', 'scoreboard', 'attack_list', 'landscape', 'tree_overlap', 'orphans']) expect(RADAR_MIN_ROLE[a]).toBe('member');
    for (const a of ['focus_from_text', 'focus_save', 'territory_resolve', 'run_batch', 'enrich_run', 'orphan_fix', 'schedule_save', 'competitor_merge']) expect(RADAR_MIN_ROLE[a]).toBe('editor');
    expect(RADAR_MIN_ROLE.territory_sync).toBe('admin');
    expect(RADAR_PAID_ACTIONS.sort()).toEqual(['backlinks_fetch', 'run_batch']);
  });
  it('leitor (membro) vê o painel mas não grava; sem papel na organização não vê nada; ação desconhecida é recusada', async () => {
    const w = world(); const { deps } = mkDeps();
    expect((await call(w, 'overview', {}, deps, 'member')).status).toBe(200);
    expect(await call(w, 'focus_save', { name: 'X' }, deps, 'member')).toMatchObject({ status: 403, body: { error: 'role_not_allowed' } });
    expect(await call(w, 'run_batch', {}, deps, 'member')).toMatchObject({ status: 403 });
    expect(await call(w, 'territory_sync', { sources: ['br_municipios'] }, deps, 'editor')).toMatchObject({ status: 403, body: { error: 'role_not_allowed' } });
    expect((await handleRadarAction(w.admin, { ...ctx('overview', {}, deps), roleByOrg: new Map([[OTHER_ORG, 'owner']]) })).body.error).toBe('organization_membership_required');
    expect((await handleRadarAction(w.admin, ctx('apagar_tudo', {}, deps))).status).toBe(400);
    expect((await handleRadarAction(w.admin, ctx('overview', { projectId: 'nao-uuid' }, deps))).body.error).toBe('project_id_required');
  });
  it('a organização vem do projeto no banco, nunca do corpo: organizationId forjado não muda nada', async () => {
    const w = world(); const { deps } = mkDeps();
    const r = await handleRadarAction(w.admin, { ...ctx('overview', { organizationId: OTHER_ORG }, deps), roleByOrg: new Map([[OTHER_ORG, 'owner']]) });
    expect(r.status).toBe(403);
    const mine = await call(w, 'focus_save', { name: 'Meu foco', organizationId: OTHER_ORG }, deps);
    expect(mine.status).toBe(200);
    expect(rows(w, 'project_focuses')[0]).toMatchObject({ organization_id: ORG, project_id: PROJECT });
  });
  it('dados de outro projeto nunca aparecem nem são alterados (foco, concorrente, ligação)', async () => {
    const OTHER_FOCUS = '00000000-0000-4000-8000-0000000000f9'; const OTHER_COMP = '00000000-0000-4000-8000-0000000000e9';
    const w = world({ project_focuses: [{ id: OTHER_FOCUS, project_id: OTHER_PROJECT, organization_id: OTHER_ORG, name: 'Segredo alheio', weight: 5, topics: [], status: 'ativo' }], radar_competitors: [{ id: OTHER_COMP, project_id: OTHER_PROJECT, organization_id: OTHER_ORG, name: 'Rival alheio', kind: 'marca', primary_host: 'alheio.example', is_own: false, status: 'sugerido', merged_into: null, authority: {} }] });
    const { deps } = mkDeps();
    const ov = (await call(w, 'overview', {}, deps)).body as Body;
    expect(JSON.stringify(ov)).not.toContain('Segredo alheio');
    expect(JSON.stringify(ov)).not.toContain('Rival alheio');
    expect((await call(w, 'focus_save', { focusId: OTHER_FOCUS, weight: 1 }, deps)).status).toBe(404);
    expect(rows(w, 'project_focuses')[0].weight).toBe(5);
    expect((await call(w, 'competitor_detail', { competitorId: OTHER_COMP }, deps)).status).toBe(404);
    expect((await call(w, 'competitor_save', { competitorId: OTHER_COMP, status: 'ignorado' }, deps)).status).toBe(404);
    expect(rows(w, 'radar_competitors')[0].status).toBe('sugerido');
    expect((await call(w, 'territory', { focusId: OTHER_FOCUS }, deps)).status).toBe(404);
  });
});

describe('Radar: Foco a partir de uma frase (IA barata + plano B) e território resolvido sozinho', () => {
  let w: World; beforeEach(() => { w = world(); });
  it('frase do dono vira 2 Focos estruturados; os territórios são resolvidos pelo banco, com "por que entrou" e inferências marcadas', async () => {
    const seen: string[] = [];
    const { deps } = mkDeps({ aiJson: async (a) => { seen.push(a.user); expect(a.system).not.toMatch(/advoca|OAB/i); return AI_REPLY; } });
    const r = await call(w, 'focus_from_text', { text: PHRASE }, deps);
    expect(r.status).toBe(200);
    const b = r.body as Body;
    expect(b).toMatchObject({ source: 'ia', saved: true, geo_loaded: true });
    expect(b.focuses.map((f: Body) => `${f.name}:${f.weight}`)).toEqual(['Criminal:9', 'Empresarial:5']);
    expect(seen[0]).toContain(PHRASE.slice(0, 40));
    expect(seen[0]).toContain('Criminal'); // as áreas da taxonomia vão no contexto da IA
    const crim = b.focuses[0];
    expect(crim.taxonomy_node).toMatchObject({ label: 'Criminal' }); // ligado ao nó da árvore pelo nome
    expect(crim.unresolved).toEqual([]);
    expect(crim.resolved.map((x: Body) => x.text)).toEqual(['Zona Leste', 'Zona Norte', 'Zona Sul', 'Guarulhos']);
    expect(crim.resolved[0].places[0]).toMatchObject({ name: 'Zona Leste', level: 'zona', inferred: true });
    expect(crim.expansion.added).toBeGreaterThan(40); // distritos das zonas + região metropolitana de Guarulhos
    const emp = b.focuses[1];
    expect(emp.resolved[0].places[0]).toMatchObject({ name: 'São Paulo', level: 'uf' });
    // gravação
    const fps = rows(w, 'project_focus_places').filter((p) => p.focus_id === crim.id);
    const placeById = new Map(rows(w, 'geo_places').map((p) => [p.id, p]));
    const name = (p: Body) => placeById.get(p.place_id)!.name;
    expect(fps.find((p) => name(p) === 'Guarulhos' && placeById.get(p.place_id)!.level === 'municipio')).toMatchObject({ status: 'aprovado', origin: 'frase', inferred: false });
    expect(fps.find((p) => name(p) === 'Zona Leste')).toMatchObject({ status: 'sugerido', inferred: true }); // agrupamento informal nasce como sugestão editável
    const osasco = fps.find((p) => name(p) === 'Osasco')!;
    expect(osasco).toMatchObject({ origin: 'vizinhanca', status: 'sugerido' });
    expect(osasco.why[0]).toMatchObject({ rule: 'mesma_regiao_metropolitana', via: 'Guarulhos' });
    expect(fps.find((p) => name(p) === 'Tatuapé')!.why[0].rule).toBe('zona_membro');
    expect(rows(w, 'project_focuses')[0]).toMatchObject({ project_id: PROJECT, organization_id: ORG, source: 'frase', status: 'ativo', source_text: PHRASE });
    expect(rows(w, 'project_events').some((e) => e.kind === 'radar.foco_criado')).toBe(true);
  });
  it('reexecutar a mesma frase atualiza (não duplica Foco nem lugar); pré-visualização não grava nada', async () => {
    const { deps } = mkDeps({ aiJson: async () => AI_REPLY });
    await call(w, 'focus_from_text', { text: PHRASE }, deps);
    const n1 = rows(w, 'project_focuses').length; const p1 = rows(w, 'project_focus_places').length;
    await call(w, 'focus_from_text', { text: PHRASE }, deps);
    expect(rows(w, 'project_focuses')).toHaveLength(n1);
    expect(rows(w, 'project_focus_places')).toHaveLength(p1);
    const w2 = world();
    const r = await call(w2, 'focus_from_text', { text: PHRASE, save: false }, mkDeps({ aiJson: async () => AI_REPLY }).deps);
    expect((r.body as Body).saved).toBe(false);
    expect(rows(w2, 'project_focuses')).toHaveLength(0);
  });
  it('teto atingido (ou IA fora do ar): plano B sem IA entende a frase e avisa que precisa de revisão', async () => {
    const { deps } = mkDeps({ aiJson: async () => { throw DENIED(); } });
    const b = (await call(w, 'focus_from_text', { text: PHRASE }, deps)).body as Body;
    expect(b).toMatchObject({ source: 'heuristica', ai_note: 'teto_diario' });
    expect(b.focuses.map((f: Body) => f.name)).toEqual(['criminal', 'empresarial']);
    expect(b.focuses[0].resolved.map((x: Body) => x.text)).toEqual(['Zona Leste', 'Zona Norte', 'Zona Sul', 'Guarulhos']);
    expect(rows(w, 'project_focuses').every((f) => f.needs_review === true)).toBe(true);
    const semIa = (await call(w, 'focus_from_text', { text: PHRASE }, mkDeps().deps)).body as Body;
    expect(semIa).toMatchObject({ source: 'heuristica', ai_note: 'ia_nao_ligada' });
    const lixo = await call(w, 'focus_from_text', { text: PHRASE }, mkDeps({ aiJson: async () => 'não sei' }).deps);
    expect((lixo.body as Body).source).toBe('heuristica'); // resposta que não é JSON válido nunca entra
  });
  it('banco de lugares vazio: nada é inventado, o Foco nasce e o sistema diz que falta carregar os territórios', async () => {
    const w3 = world({}); w3.tables.geo_places.length = 0; w3.tables.geo_place_members.length = 0;
    const b = (await call(w3, 'focus_from_text', { text: PHRASE }, mkDeps({ aiJson: async () => AI_REPLY }).deps)).body as Body;
    expect(b.geo_loaded).toBe(false);
    expect(b.geo_hint).toBe('territory_sync');
    expect(b.focuses[0].unresolved.length).toBe(4);
    expect(b.focuses[0].unresolved[0]).toMatchObject({ status: 'nao_encontrado' });
    expect(rows(w3, 'project_focus_places')).toHaveLength(0);
    expect(rows(w3, 'project_focuses')).toHaveLength(2);
    expect(rows(w3, 'project_focuses').every((f) => f.needs_review === true)).toBe(true);
  });
  it('a frase pode estar em outro idioma e em outro país: o mesmo caminho resolve Lisboa e Miami', async () => {
    const reply = JSON.stringify({ focuses: [{ name: 'Dental whitening', segment: 'Dentistry', topics: ['teeth whitening'], weight: 7, language: 'en', territory: [{ text: 'Miami', kind: 'lugar', expand_region: true }, { text: 'Lisboa', kind: 'lugar' }] }] });
    const b = (await call(w, 'focus_from_text', { text: 'focus on teeth whitening in Miami and Lisbon' }, mkDeps({ aiJson: async () => reply }).deps)).body as Body;
    expect(b.focuses[0].resolved.flatMap((r: Body) => r.places.map((p: Body) => p.name))).toEqual(['Miami', 'Lisboa']);
    expect(rows(w, 'project_focuses')[0].language).toBe('en');
  });
  it('focus_save edita peso (1 a 10), públicos e temas e recusa valor inválido; território: aprovar e rejeitar', async () => {
    const { deps } = mkDeps({ aiJson: async () => AI_REPLY });
    const crim = ((await call(w, 'focus_from_text', { text: PHRASE }, deps)).body as Body).focuses[0];
    expect((await call(w, 'focus_save', { focusId: crim.id, weight: 11 }, deps)).body.error).toBe('weight_invalid');
    expect((await call(w, 'focus_save', { focusId: crim.id, audiences: ['x'] }, deps)).body.error).toBe('audiences_invalid');
    expect((await call(w, 'focus_save', { focusId: crim.id, weight: 3, topics: ['a b', 'a b', 'c d'], audiences: ['urgencia'] }, deps)).status).toBe(200);
    expect(rows(w, 'project_focuses').find((f) => f.id === crim.id)).toMatchObject({ weight: 3, topics: ['a b', 'c d'], audiences: ['urgencia'], needs_review: false });
    const t = (await call(w, 'territory', { focusId: crim.id }, deps, 'member')).body as Body;
    expect(t.counts.sugerido).toBeGreaterThan(40);
    const osa = t.places.find((p: Body) => p.place.name === 'Osasco');
    expect(osa.why[0].detail).toContain('Região Metropolitana');
    await call(w, 'territory_decide', { focusId: crim.id, ids: [osa.id], status: 'rejeitado' }, deps);
    expect(rows(w, 'project_focus_places').find((p) => p.id === osa.id)!.status).toBe('rejeitado');
    expect((await call(w, 'territory_decide', { focusId: crim.id, ids: ['x'], status: 'aprovado' }, deps)).body.error).toBe('ids_invalid');
    expect((await call(w, 'territory_resolve', { focusId: crim.id, mentions: [{ text: 'Campinas', kind: 'lugar' }] }, deps)).body.resolved[0].places[0].name).toBe('Campinas');
  });
});

describe('Radar: território automático a partir de fontes abertas (administrador)', () => {
  it('lista as fontes com licença e limites; distritos do IBGE, região metropolitana filtrada por nome e zonas informais entram no banco', async () => {
    const w = world({ ibge_municipios: [{ ibge_code: 3550308, nome: 'São Paulo', uf: 'SP', populacao: 11451999 }, { ibge_code: 3518800, nome: 'Guarulhos', uf: 'SP', populacao: 1291784 }] });
    w.tables.geo_places.length = 0; w.tables.geo_place_members.length = 0;
    const { deps, calls } = mkDeps();
    const list = (await call(w, 'territory_sync', {}, deps, 'admin')).body as Body;
    expect(list.sources.map((s: Body) => s.id)).toEqual(expect.arrayContaining(['br_municipios', 'br_distritos', 'br_regioes', 'br_zonas_sp', 'osm_bairros', 'wikidata_subdivisoes', 'geonames_filhos']));
    expect(list.overpass_note).toMatch(/uso comercial/);
    expect(list.osm_attribution).toContain('OpenStreetMap');
    const r1 = (await call(w, 'territory_sync', { sources: ['br_municipios', 'br_regioes'], kinds: ['metropolitana'], name: 'SÃO PAULO' }, deps, 'admin')).body as Body;
    expect(r1.results[0]).toMatchObject({ source: 'br_municipios', ok: true });
    expect(r1.results[1]).toMatchObject({ source: 'br_regioes', ok: true, members: 2 }); // (Osasco não está no cache do teste) só a Região Metropolitana de São Paulo (nome sem acento casa)
    const places = rows(w, 'geo_places');
    expect(places.filter((p) => p.level === 'municipio').map((p) => p.name).sort()).toEqual(['Guarulhos', 'São Paulo']);
    expect(places.find((p) => p.name === 'Guarulhos')!.parent_id).toBe(places.find((p) => p.level === 'uf')!.id);
    expect(places.filter((p) => p.level === 'regiao').map((p) => p.name)).toEqual(['Região Metropolitana de São Paulo']);
    const r2 = (await call(w, 'territory_sync', { sources: ['br_distritos'], municipality_ids: [3518800] }, deps, 'admin')).body as Body;
    expect(r2.results[0]).toMatchObject({ ok: true, places: 2 });
    expect(places.filter((p) => p.level === 'distrito').map((p) => p.name).sort()).toEqual(['Guarulhos', 'Pimentas']);
    const r3 = (await call(w, 'territory_sync', { sources: ['br_zonas_sp'] }, deps, 'admin')).body as Body;
    expect(r3.results[0].ok).toBe(true);
    expect(places.filter((p) => p.level === 'zona').map((p) => p.name)).toEqual(['Zona Leste', 'Zona Norte', 'Zona Sul', 'Zona Oeste', 'Centro']);
    expect(places.filter((p) => p.level === 'zona').every((p) => p.inferred === true)).toBe(true);
    expect(rows(w, 'geo_place_members').filter((m) => m.relation === 'zona')).toHaveLength(96);
    // idempotente
    const before = rows(w, 'geo_places').length;
    await call(w, 'territory_sync', { sources: ['br_zonas_sp', 'br_municipios'] }, deps, 'admin');
    expect(rows(w, 'geo_places')).toHaveLength(before);
    expect(calls.free.every((u) => u.startsWith('https://servicodados.ibge.gov.br/'))).toBe(true);
    expect((await call(w, 'territory_sync', { sources: ['fonte_inventada'] }, deps, 'admin')).body.error).toBe('source_unknown');
  });
  it('bairros do OpenStreetMap: atribuição ODbL gravada, atraso entre consultas e cache de 90 dias', async () => {
    const w = world(); const { deps, calls } = mkDeps();
    const sao = rows(w, 'geo_places').find((p) => p.name === 'São Paulo' && p.level === 'municipio')!; const gru = rows(w, 'geo_places').find((p) => p.name === 'Guarulhos' && p.level === 'municipio')!;
    const r = (await call(w, 'territory_sync', { sources: ['osm_bairros'], place_ids: [sao.id, gru.id] }, deps, 'admin')).body as Body;
    expect(r.results[0].ok).toBe(true);
    const bairros = rows(w, 'geo_places').filter((p) => p.level === 'bairro');
    expect(bairros.map((b) => b.name).sort()).toEqual(['Tatuapé', 'Vila Carrão']); // o mesmo código do mapa não duplica
    expect(bairros.every((b) => b.license === 'ODbL-1.0' && String(b.attribution).includes('OpenStreetMap') && b.source === 'osm')).toBe(true);
    expect(calls.sleeps).toContain(10_000); // espera entre consultas ao Overpass
    expect(rows(w, 'geo_places').find((p) => p.id === sao.id)!.meta.osm_synced_at).toBe(new Date(NOW).toISOString());
    const nCalls = calls.free.filter((u) => u.includes('overpass')).length;
    const again = (await call(w, 'territory_sync', { sources: ['osm_bairros'], place_ids: [sao.id] }, deps, 'admin')).body as Body;
    expect(again.results[0].notes[0]).toBe('cache_valido:São Paulo');
    expect(calls.free.filter((u) => u.includes('overpass')).length).toBe(nCalls); // nada de rede dentro do cache
    expect((await call(w, 'territory_sync', { sources: ['geonames_filhos'], geoname_id: 1, level: 'bairro', parent_place_id: sao.id }, deps, 'admin')).body.results[0].notes).toEqual(['geonames_nao_configurado']);
  });
});

describe('Radar: plano, rodada de descoberta, teto diário e cobertura', () => {
  async function ready(over: Partial<RadarDeps> = {}, opts: { denyAfter?: number } = {}) {
    const w = world();
    const m = mkDeps({ aiJson: async () => AI_REPLY, ...over }, undefined, opts);
    await call(w, 'focus_from_text', { text: PHRASE }, m.deps);
    // um foco só, com 2 lugares e as modalidades que o teste usa (a rodada fica pequena e previsível)
    const f = rows(w, 'project_focuses')[0]; f.modalities = ['web', 'places', 'videos', 'social'];
    rows(w, 'project_focuses')[1].status = 'pausado';
    const keep = rows(w, 'project_focus_places').filter((p) => p.focus_id === f.id && p.status === 'aprovado' && rows(w, 'geo_places').find((g) => g.id === p.place_id)!.level === 'municipio');
    w.tables.project_focus_places = keep;
    return { w, ...m, focus: f };
  }
  it('plano: gera consultas, estima custo pela tabela do teto diário (não verificada), mostra motores ligados e cobertura', async () => {
    const { w, deps } = await ready();
    const p = (await call(w, 'plan', {}, deps, 'member')).body as Body;
    expect(p.providers).toMatchObject({ serper: true, dataforseo: false, brave: false, youtube: false });
    expect(p.engines).toEqual(['serper']);
    expect(p.tasks_total).toBeGreaterThan(5);
    expect(p.by_modality.web.tasks).toBeGreaterThan(0);
    expect(p.estimated_total_micros).toBeGreaterThan(0);
    expect(p.cost_basis).toMatch(/não verificados/);
    expect(p.coverage).toMatchObject({ done: 0, pending: p.tasks_total });
    expect(JSON.stringify(p)).not.toContain(SECRET);
    const sem = (await call(w, 'plan', {}, mkDeps({ readSecret: async () => null }).deps, 'member')).body as Body;
    expect(sem.blocked_reason).toBe('radar_no_provider_key');
  });
  it('rodada descobre concorrentes, identidades, páginas, mapas e vínculos com a árvore, e grava o ledger com custo e data', async () => {
    const { w, deps, calls, focus } = await ready();
    const r = await call(w, 'run_batch', { budgetMicros: 100_000, maxQueries: 6 }, deps);
    expect(r.status).toBe(200);
    const b = r.body as Body;
    expect(b).toMatchObject({ ok: true, queries_planned: 6, queries_done: 6, errors: 0, stopped: null, engines: ['serper'] });
    expect(b.cost_basis).toMatch(/estimado/);
    expect(b.new_entities).toBeGreaterThanOrEqual(6);
    // todas as chamadas pagas saíram pelo fetch guardado, só com a chave no cabeçalho
    expect(calls.paid).toHaveLength(6);
    expect(calls.paid.every((c) => c.url.startsWith('https://google.serper.dev/') && c.headers['X-API-KEY'] === SECRET && !c.url.includes(SECRET) && !c.body.includes(SECRET))).toBe(true);
    const comps = rows(w, 'radar_competitors');
    expect(comps.find((c) => c.primary_host === 'advogadoscriminalistasemsp.com.br')).toBeTruthy();
    expect(comps.find((c) => c.primary_host === 'jusbrasil.com.br')!.kind).toBe('diretorio');
    expect(comps.filter((c) => c.primary_host === 'advogadoscriminalistasemsp.com.br')).toHaveLength(1); // 2 páginas, 1 entidade
    expect(rows(w, 'radar_pages').length).toBeGreaterThan(8);
    expect(rows(w, 'radar_pages').every((p) => p.project_id === PROJECT && p.organization_id === ORG && p.query_key)).toBe(true);
    expect(rows(w, 'radar_map_listings').length).toBeGreaterThanOrEqual(3);
    const cov = rows(w, 'radar_coverage');
    expect(cov).toHaveLength(6);
    expect(cov.every((c) => c.status === 'consultada' && c.cost_micros > 0 && c.queried_at === new Date(NOW).toISOString() && c.project_id === PROJECT)).toBe(true);
    // vínculo obrigatório com a árvore: Foco, lugar e nó da taxonomia
    const links = rows(w, 'radar_links');
    expect(links.length).toBeGreaterThan(5);
    expect(links.every((l) => l.focus_id === focus.id && l.place_id && l.node_id === '00000000-0000-4000-8000-00000000f001')).toBe(true);
    expect(rows(w, 'radar_competitors').find((c) => c.is_own)!.primary_host).toBe('rdmadvogados.com.br'); // nós mesmos entram para o placar
    const run = rows(w, 'radar_runs')[0];
    expect(run).toMatchObject({ status: 'concluida', queries_done: 6, kind: 'manual', created_by: USER });
    expect(run.cost_micros).toBe(b.cost_micros);
    expect(rows(w, 'project_events').some((e) => e.kind === 'radar.rodada_concluida' && e.payload.queries === 6)).toBe(true);
    expect(JSON.stringify(b)).not.toContain(SECRET);
  });
  it('perfis encontrados pela busca de redes sociais viram identidades; contagem do trecho público vem rotulada como ESTIMADA', async () => {
    const { w, deps } = await ready();
    await call(w, 'run_batch', { budgetMicros: 1_000_000, maxQueries: 60 }, deps);
    const ig = rows(w, 'radar_identities').filter((i) => i.platform === 'instagram');
    expect(ig.map((i) => i.handle).sort()).toEqual(expect.arrayContaining(['advocaciarainov', 'perfilmisterioso']));
    const rainov = ig.find((i) => i.handle === 'advocaciarainov')!;
    expect(rainov).toMatchObject({ metrics_label: 'trecho_publico_do_buscador', metrics: { followers: 12500, posts: 340 } });
    expect(rainov.metrics_source).toContain('trecho público do buscador');
    expect(rainov.competitor_id).toBe(rows(w, 'radar_competitors').find((c) => c.primary_host === 'advocaciarainov.com.br')!.id);
    expect(ig.find((i) => i.handle === 'perfilmisterioso')!.competitor_id).toBeNull(); // órfão: vai ao Livro de pontas soltas
    expect(rows(w, 'radar_identity_metrics').length).toBeGreaterThan(0);
    const orphans = (await call(w, 'orphans', {}, deps, 'member')).body as Body;
    expect(orphans.counts.perfil_sem_concorrente).toBeGreaterThanOrEqual(1);
    expect(orphans.zero_orphans).toBe(false);
  });
  it('repetir a rodada não gasta de novo no que já foi consultado (validade) e a saturação aparece depois de 3 rodadas', async () => {
    const { w, deps, calls } = await ready();
    await call(w, 'run_batch', { budgetMicros: 100_000, maxQueries: 4 }, deps);
    const after1 = calls.paid.length;
    const r2 = (await call(w, 'run_batch', { budgetMicros: 100_000, maxQueries: 4 }, deps)).body as Body;
    expect(r2.queries_done).toBe(4); // as 4 SEGUINTES (as primeiras estão cobertas)
    expect(r2.skipped_covered).toBe(4);
    expect(calls.paid.length).toBe(after1 + 4);
    const keys = new Set(rows(w, 'radar_coverage').map((c) => c.task_key));
    expect(keys.size).toBe(8); // nenhuma consulta repetida
    const r3 = (await call(w, 'run_batch', { budgetMicros: 100_000, maxQueries: 4 }, deps)).body as Body;
    expect(r3.saturation.rounds).toBe(3);
    expect(r3.new_entities).toBe(0); // a SERP gravada é sempre a mesma: nenhum concorrente novo
    const cov = (await call(w, 'coverage', {}, deps, 'member')).body as Body;
    expect(cov.coverage.done).toBe(12);
    expect(cov.coverage.pct_done).toBeGreaterThan(0);
    expect(cov.saturation.message_key).not.toBe('sem_rodadas');
    expect(cov.honesty).toMatch(/não de tudo o que existe/);
    expect(cov.runs).toHaveLength(3);
  });
  it('TETO DIÁRIO: quando o gate nega, a rodada para na hora, não tenta mais nada e o ledger só guarda o que foi feito', async () => {
    const { w, deps, calls } = await ready({}, { denyAfter: 2 });
    const r = (await call(w, 'run_batch', { budgetMicros: 1_000_000, maxQueries: 12 }, deps)).body as Body;
    expect(r).toMatchObject({ ok: true, stopped: 'teto_diario', stop_reason: 'daily_cap_reached' });
    expect(r.queries_done).toBeLessThanOrEqual(3); // o lote de 3 em paralelo já estava em voo; nenhum lote depois da negação
    expect(calls.paid.length).toBeLessThanOrEqual(3);
    expect(rows(w, 'radar_coverage').every((c) => c.status === 'consultada')).toBe(true);
    expect(rows(w, 'radar_coverage').length).toBe(r.queries_done);
    expect(rows(w, 'radar_runs')[0].status).toBe('parada_no_teto');
    expect(rows(w, 'project_events').some((e) => e.kind === 'radar.parada_no_teto')).toBe(true);
  });
  it('orçamento do dia: usa no máximo metade do que resta e nada quando o que resta não paga uma consulta', async () => {
    const { w, deps, calls } = await ready({ dayBudget: async () => ({ remaining_micros: 5_000, used_micros: 6_995_000, cap_micros: 7_000_000 }) });
    const r = (await call(w, 'run_batch', { budgetMicros: 500_000 }, deps)).body as Body;
    expect(r.budget_micros).toBe(2_500);
    expect(r.queries_done).toBe(1); // 1 consulta estimada em 2.000 cabe em 2.500
    expect(r.day_remaining_micros).toBe(5_000);
    expect(calls.paid).toHaveLength(1);
    const none = await ready({ dayBudget: async () => ({ remaining_micros: 0, used_micros: 7_000_000, cap_micros: 7_000_000 }) });
    const r0 = (await call(none.w, 'run_batch', {}, none.deps)).body as Body;
    expect(r0).toMatchObject({ queries_done: 0, budget_micros: 0 });
    expect(none.calls.paid).toHaveLength(0);
  });
  it('sem chave de provedor, sem foco ativo ou com orçamento inválido: recusa clara e nenhuma chamada paga', async () => {
    const { w, deps, calls } = await ready({ readSecret: async () => null });
    expect((await call(w, 'run_batch', {}, deps)).body.error).toBe('radar_no_provider_key');
    const w2 = world(); const m = mkDeps();
    expect((await call(w2, 'run_batch', {}, m.deps)).body.error).toBe('radar_no_active_focus');
    expect((await call(w, 'run_batch', { budgetMicros: 99_000_000 }, mkDeps().deps)).body.error).toBe('budget_invalid');
    expect((await call(w, 'run_batch', { maxQueries: 0 }, mkDeps().deps)).body.error).toBe('max_queries_invalid');
    expect(calls.paid).toHaveLength(0); expect(m.calls.paid).toHaveLength(0);
  });
  it('sem fetch guardado configurado, o portão negaria toda chamada paga (falha fechada)', async () => {
    const { w, deps } = await ready();
    const closed = { ...deps, paidFetch: (async () => { throw DENIED(); }) as unknown as typeof fetch };
    const r = (await call(w, 'run_batch', { maxQueries: 3 }, closed)).body as Body;
    expect(r).toMatchObject({ queries_done: 0, stopped: 'teto_diario' });
    expect(rows(w, 'radar_coverage')).toHaveLength(0);
  });
  it('mais de um motor: DataForSEO atende os mapas e a rodada lê o custo informado pelo provedor', async () => {
    const { w, deps, calls } = await ready({ readSecret: async (_o, p) => (p === 'dataforseo' ? 'login:senha-dfs' : null) });
    const b = (await call(w, 'run_batch', { budgetMicros: 500_000, maxQueries: 30 }, deps)).body as Body;
    expect(b.engines).toEqual(['dfs_google', 'dfs_maps']);
    expect(calls.paid.every((c) => c.url.startsWith('https://api.dataforseo.com/v3/') && c.headers.Authorization === `Basic ${btoa('login:senha-dfs')}` && !c.body.includes('senha-dfs'))).toBe(true);
    expect(rows(w, 'radar_map_listings').some((l) => l.name === 'Clínica Sorriso SP')).toBe(true);
    expect(rows(w, 'radar_coverage').find((c) => c.engine === 'dfs_maps')!.cost_micros).toBe(4000);
  });
});

describe('Radar: enriquecimento educado, YouTube com/sem chave e leituras (placar, atacar, retrato, árvore, pontas soltas)', () => {
  async function discovered(over: Partial<RadarDeps> = {}) {
    const w = world(); const m = mkDeps({ aiJson: async () => AI_REPLY, ...over });
    await call(w, 'focus_from_text', { text: PHRASE }, m.deps);
    rows(w, 'project_focuses')[1].status = 'pausado';
    rows(w, 'project_focuses')[0].modalities = ['web', 'places', 'social'];
    await call(w, 'run_batch', { budgetMicros: 1_000_000, maxQueries: 40 }, m.deps);
    return { w, ...m };
  }
  it('varre o site do concorrente (robots, 1 req/s, agente genérico), liga perfis achados no site e guarda a autoridade estimada', async () => {
    const { w, deps, calls } = await discovered({ oprKey: 'opr-teste-123' });
    const r = (await call(w, 'enrich_run', { limit: 10 }, deps)).body as Body;
    expect(r.scanned).toBeGreaterThanOrEqual(1);
    const scans = rows(w, 'radar_site_scans');
    const s = scans.find((x) => x.host === 'advogadoscriminalistasemsp.com.br')!;
    expect(s.scan.schema).toMatchObject({ isLocal: true, hasFaq: true });
    expect(s.scan.sitemap.urls).toBe(5);
    expect(s.status).toBe('ok');
    // perfis achados no próprio site do concorrente = prova forte
    const tk = rows(w, 'radar_identities').find((i) => i.platform === 'tiktok' && i.handle === 'criminalistasemsp')!;
    expect(tk).toMatchObject({ source: 'site', confidence: 0.95 });
    expect(tk.competitor_id).toBe(rows(w, 'radar_competitors').find((c) => c.primary_host === 'advogadoscriminalistasemsp.com.br')!.id);
    expect(rows(w, 'radar_competitors').find((c) => c.primary_host === 'advogadoscriminalistasemsp.com.br')!.authority).toMatchObject({ opr: 3.2, label: 'estimado' });
    expect(calls.sleeps.filter((x) => x >= 1000).length).toBeGreaterThan(0);
    expect(((await call(w, 'competitor_detail', { competitorId: tk.competitor_id }, deps, 'member')).body as Body).scan.status).toBe('ok');
  });
  it('YouTube SEM chave: diz exatamente o que habilitar e não finge dado; COM chave mas API desabilitada: mesma instrução', async () => {
    const { w, deps } = await discovered();
    const sem = (await call(w, 'youtube_discover', {}, deps)).body as Body;
    expect(sem.status).toBe('sem_chave');
    expect(sem.message).toContain('Habilite a YouTube Data API v3 no projeto Google zica-posts-plataforma-apis');
    expect(rows(w, 'radar_identities').some((i) => i.platform === 'youtube' && i.metrics_label === 'api_oficial')).toBe(false);
    const off = mkDeps({ youtubeKey: 'yt-key', fetchFn: (async () => Response.json(YT_NOT_ENABLED, { status: 403 })) as typeof fetch });
    const r = (await call(w, 'youtube_discover', {}, off.deps)).body as Body;
    expect(r.status).toBe('nao_habilitada');
    expect(r.message).toContain('zica-posts-plataforma-apis');
    const ov = (await call(w, 'overview', {}, deps, 'member')).body as Body;
    expect(ov.youtube).toMatchObject({ available: false });
    expect(ov.youtube.message).toContain('zica-posts-plataforma-apis');
  });
  it('YouTube COM chave habilitada: canais e vídeos por Foco x território, contagens OFICIAIS e cadência', async () => {
    const { w, deps } = await discovered();
    const on = mkDeps({ youtubeKey: 'yt-key' }, undefined);
    const r = (await call(w, 'youtube_discover', { maxSearches: 2 }, { ...deps, fetchFn: on.deps.fetchFn, youtubeKey: 'yt-key' })).body as Body;
    expect(r).toMatchObject({ status: 'ok' });
    expect(r.channels).toBeGreaterThanOrEqual(1);
    const yt = rows(w, 'radar_identities').find((i) => i.platform === 'youtube' && i.handle === 'UCabcdefghijklmnopqrstuv')!;
    expect(yt).toMatchObject({ metrics_label: 'api_oficial', kind: 'canal' });
    expect(yt.metrics).toMatchObject({ subscribers: 4300, videos: 120, views: 250000, last_30d: 1 });
    expect(yt.metrics_source).toContain('YouTube Data API v3');
    expect(rows(w, 'radar_pages').some((p) => p.engine === 'youtube_api' && p.modality === 'videos')).toBe(true);
    expect(rows(w, 'radar_identity_metrics').some((m) => m.label === 'api_oficial')).toBe(true);
  });
  it('placar por Foco (estimado, com componentes), "onde atacar", retrato agregado e sobreposição na árvore', async () => {
    const { w, deps } = await discovered();
    await call(w, 'enrich_run', { limit: 10 }, deps);
    const f = rows(w, 'project_focuses')[0].id;
    const sb = (await call(w, 'scoreboard', { focusId: f }, deps, 'member')).body as Body;
    expect(sb.disclaimer).toMatch(/Não é a nota do Google/);
    expect(sb.rows.length).toBeGreaterThan(5);
    expect(sb.rows.every((r: Body) => r.label === 'estimado' && Array.isArray(r.components) && r.components.length === 8)).toBe(true);
    expect(sb.rows[0].score).not.toBeNull();
    const att = (await call(w, 'attack_list', {}, deps, 'member')).body as Body;
    expect(att.items.length).toBeGreaterThan(0);
    expect(att.items.every((i: Body) => i.title && i.why && i.what)).toBe(true);
    expect(att.items.some((i: Body) => i.kind === 'lacuna_serp' || i.kind === 'buraco_maps' || i.kind === 'correcao_barata')).toBe(true);
    const ls = (await call(w, 'landscape', { by: 'focus' }, deps, 'member')).body as Body;
    expect(ls.rows[0]).toMatchObject({ id: f, label: 'Criminal' });
    expect(ls.rows[0].competitors).toBeGreaterThanOrEqual(6);
    expect(ls.rows[0].with_instagram).toBeGreaterThanOrEqual(1);
    const tree = (await call(w, 'tree_overlap', {}, deps, 'member')).body as Body;
    expect(tree.nodes[0]).toMatchObject({ label: 'Criminal', empty: false });
    expect(tree.nodes[0].competitors.length).toBeGreaterThan(5);
    const list = (await call(w, 'competitors_list', { focusId: f, platform: 'instagram' }, deps, 'member')).body as Body;
    expect(list.competitors.length).toBeGreaterThanOrEqual(1);
    expect(list.competitors.every((c: Body) => c.identities.some((i: Body) => i.platform === 'instagram'))).toBe(true);
    expect(list.availability.instagram.text).toContain('Métricas indisponíveis sem API oficial/parceiro');
    expect(list.availability.youtube.status).toBe('indisponivel'); // sem chave
  });
  it('snapshot semanal guarda a série e a tendência aparece (subindo/caindo) nas semanas seguintes', async () => {
    const { w, deps } = await discovered();
    const s1 = (await call(w, 'scores_snapshot', {}, deps)).body as Body;
    expect(s1).toMatchObject({ week: '2026-11-16' });
    expect(s1.rows).toBeGreaterThan(5);
    const n = rows(w, 'radar_scores').length;
    await call(w, 'scores_snapshot', {}, deps); // mesma semana: substitui
    expect(rows(w, 'radar_scores')).toHaveLength(n);
    // semanas anteriores com nota menor para um concorrente: ele "sobe"
    const f = rows(w, 'project_focuses')[0].id;
    const top = rows(w, 'radar_scores').find((r) => r.subject === 'concorrente' && r.score !== null && r.focus_id === f && !r.place_id)!;
    rows(w, 'radar_scores').push({ ...top, id: 'old1', week: '2026-11-02', score: Math.max(0, top.score - 20) }, { ...top, id: 'old2', week: '2026-11-09', score: Math.max(0, top.score - 12) });
    const sb = (await call(w, 'scoreboard', { focusId: f }, deps, 'member')).body as Body;
    expect(sb.rows.find((r: Body) => r.competitor_id === top.competitor_id).trend).toMatchObject({ direction: 'subindo' });
  });
  it('Livro de pontas soltas: sugere ligações e "aplicar" liga perfil, nó e foco; o que não tem prova continua solto', async () => {
    const { w, deps } = await discovered();
    const before = (await call(w, 'orphans', {}, deps, 'member')).body as Body;
    expect(before.total).toBeGreaterThan(0);
    const fix = (await call(w, 'orphan_fix', {}, deps)).body as Body;
    expect(fix.applied).toBeGreaterThanOrEqual(0);
    expect(fix.remaining.total).toBeLessThanOrEqual(before.total);
    // ligação manual de um concorrente a um nó e a um foco
    const c = rows(w, 'radar_competitors').find((x) => x.primary_host === 'evinistalon.com')!;
    const f = rows(w, 'project_focuses')[0];
    expect((await call(w, 'competitor_link', { competitorId: c.id, nodeId: '00000000-0000-4000-8000-00000000f001' }, deps)).body.linked).toBeDefined();
    expect((await call(w, 'competitor_link', { competitorId: c.id }, deps)).body.error).toBe('target_required');
    expect((await call(w, 'competitor_link', { competitorId: c.id, focusId: f.id }, deps)).status).toBe(200);
    expect((await call(w, 'competitor_save', { competitorId: c.id, status: 'acompanhado' }, deps)).status).toBe(200);
    expect(rows(w, 'radar_competitors').find((x) => x.id === c.id)!.status).toBe('acompanhado');
    // fusão: duas entidades viram uma e as identidades vão junto
    const other = rows(w, 'radar_competitors').find((x) => x.primary_host === 'mateuscosta.adv.br')!;
    expect((await call(w, 'competitor_merge', { fromId: other.id, intoId: c.id }, deps)).body.merged).toBe(true);
    expect(rows(w, 'radar_competitors').find((x) => x.id === other.id)!.merged_into).toBe(c.id);
    expect(rows(w, 'radar_identities').filter((i) => i.competitor_id === other.id)).toHaveLength(0);
    expect((await call(w, 'competitor_merge', { fromId: c.id, intoId: c.id }, deps)).body.error).toBe('ids_invalid');
  });
});

describe('Radar: rotinas (cron) por Foco, com orçamento e parada no teto', () => {
  it('rotina vencida roda, respeita o orçamento, agenda a próxima e tranca para não rodar em dobro', async () => {
    const w = world(); const m = mkDeps({ aiJson: async () => AI_REPLY });
    await call(w, 'focus_from_text', { text: PHRASE }, m.deps);
    rows(w, 'project_focuses')[1].status = 'pausado';
    const f = rows(w, 'project_focuses')[0].id;
    expect((await call(w, 'schedule_save', { cadence: 'semanal', focusId: f, budgetMicros: 50_000, maxQueries: 5 }, m.deps)).body.created).toBe(true);
    expect((await call(w, 'schedule_save', { cadence: 'semanal', focusId: f, budgetMicros: 60_000, maxQueries: 5 }, m.deps)).body.updated).toBe(true); // mesma rotina: atualiza
    expect(rows(w, 'radar_schedules')).toHaveLength(1);
    expect((await call(w, 'schedule_save', { cadence: 'a cada minuto' }, m.deps)).body.error).toBe('cadence_invalid');
    expect((await call(w, 'schedule_save', { cadence: 'diaria', budgetMicros: -1 }, m.deps)).body.error).toBe('budget_invalid');
    const rep = await runRadar(w.admin, m.deps);
    expect(rep).toMatchObject({ schedules: 1, runs: 1, stopped_at_cap: false });
    expect(rep.queries).toBe(5);
    const sch = rows(w, 'radar_schedules')[0];
    expect(sch.next_run_at).toBe(new Date(NOW + 7 * 86_400_000).toISOString());
    expect(sch.last_run_at).toBe(new Date(NOW).toISOString());
    expect(sch.lock_until).toBe('1970-01-01T00:00:00.000Z');
    expect(rows(w, 'radar_runs')[0]).toMatchObject({ kind: 'semanal', status: 'concluida' });
    expect(rows(w, 'radar_scores').length).toBeGreaterThan(0); // a rotina semanal guarda a foto do placar
    expect(rows(w, 'project_alerts').some((a) => a.source === 'radar' && a.kind === 'radar_competitor_new')).toBe(true);
    expect(rows(w, 'project_events').some((e) => e.kind === 'radar.rotina_executada')).toBe(true);
    // ainda não venceu: nada roda
    const again = await runRadar(w.admin, m.deps);
    expect(again.schedules).toBe(0);
  });
  it('quando o teto nega, a rotina para, avisa (alerta e evento) e adia a próxima janela', async () => {
    const w = world(); const m = mkDeps({ aiJson: async () => AI_REPLY }, undefined, { denyAfter: 1 });
    await call(w, 'focus_from_text', { text: PHRASE }, m.deps);
    rows(w, 'project_focuses')[1].status = 'pausado';
    await call(w, 'schedule_save', { cadence: 'diaria', budgetMicros: 1_000_000, maxQueries: 20 }, m.deps);
    rows(w, 'radar_schedules').push({ ...rows(w, 'radar_schedules')[0], id: 'outra', focus_id: null, cadence: 'mensal' });
    const rep = await runRadar(w.admin, m.deps);
    expect(rep.stopped_at_cap).toBe(true);
    expect(rep.runs).toBe(1); // a segunda rotina (mesma organização) nem tenta
    expect(rows(w, 'project_alerts').some((a) => a.kind === 'radar_budget_stop' && a.source === 'radar')).toBe(true);
    expect(rows(w, 'radar_runs')[0].status).toBe('parada_no_teto');
    const sch = rows(w, 'radar_schedules')[0];
    expect(Date.parse(sch.next_run_at)).toBe(NOW + 6 * 3_600_000);
    expect(m.calls.paid.length).toBeLessThanOrEqual(4);
  });
  it('rotina de um projeto sem foco ou sem chave não derruba o cron e não conta como rodada', async () => {
    const w = world(); const m = mkDeps({ readSecret: async () => null });
    (w.tables.radar_schedules ||= []).push({ id: 's1', organization_id: ORG, project_id: PROJECT, focus_id: null, cadence: 'diaria', enabled: true, budget_micros: 500000, max_queries: 10, next_run_at: new Date(NOW - 1000).toISOString(), lock_until: '1970-01-01T00:00:00.000Z', consecutive_failures: 0 });
    const rep = await runRadar(w.admin, m.deps);
    expect(rep).toMatchObject({ schedules: 1, runs: 0 });
    expect(m.calls.paid).toHaveLength(0);
  });
});

