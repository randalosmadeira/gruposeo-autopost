import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildOverpassQuery, buildPlaceIndex, buildWikidataSubdivisionsQuery, expandNeighborhood, haversineKm, normalizeRules, parseGeoNamesChildren, parseOverpass, parseWikidataBindings, placeLabel, placeWeight, resolveMention,
  OSM_ATTRIBUTION, OSM_LICENSE, type Mention, type ResolvedPlace,
} from '../../supabase/functions/_shared/radar-geo-core';
import { BR_PACK, SP_SUBPREFEITURAS, filterRegioesByName, parseIbgeDistritos, parseIbgeHierarquia, parseIbgeRegioesMetropolitanas, placesFromIbgeRows, regiaoDrafts, spCapitalZonePack } from '../../supabase/functions/_shared/radar-geo-br';
import { applyContextFromText, extractJson, heuristicFocusParse, validateFocusDraft } from '../../supabase/functions/_shared/radar-focus-core';
import { geoUniverse, IBGE_DISTRITOS_GUARULHOS, IBGE_METRO, OVERPASS_TATUAPE } from './helpers/radar-fixtures';

const PHRASE = 'ênfase em criminal na Zona Leste, Norte, Sul, Guarulhos e região; embriaguez ao volante; empresarial: defesa de reclamadas, ações de ex-funcionários, acidentes com frotas em SP';

describe('Radar: pacote do Brasil (IBGE e zonas informais)', () => {
  it('lê os distritos do IBGE (Guarulhos tem 2) e ignora linhas quebradas', () => {
    const d = parseIbgeDistritos([...IBGE_DISTRITOS_GUARULHOS, { id: 'x' }, null]);
    expect(d.map((x) => x.nome)).toEqual(['Guarulhos', 'Pimentas']);
    expect(d[0].municipioId).toBe(3518800);
    expect(parseIbgeDistritos({ erro: true })).toEqual([]);
  });
  it('filtra regiões metropolitanas pelo NOME no código, ignorando acentos', () => {
    const rs = parseIbgeRegioesMetropolitanas(IBGE_METRO);
    expect(rs).toHaveLength(3);
    expect(filterRegioesByName(rs, 'sao paulo').map((r) => r.nome)).toEqual(['Região Metropolitana de São Paulo']);
    expect(filterRegioesByName(rs, 'SÃO PAULO')).toHaveLength(1);
    expect(filterRegioesByName(rs, 'nada')).toEqual([]);
    expect(rs[0].municipioIds).toEqual([3550308, 3518800, 3534401]);
  });
  it('lê regiões imediata e intermediária do JSON de municípios', () => {
    const h = parseIbgeHierarquia([{ id: 3518800, nome: 'Guarulhos', 'regiao-imediata': { id: '350001', nome: 'São Paulo', 'regiao-intermediaria': { id: '3501', nome: 'São Paulo', UF: { sigla: 'SP' } } } }]);
    expect(h.map((r) => r.kind).sort()).toEqual(['imediata', 'intermediaria']);
    expect(h[0].municipioIds).toEqual([3518800]);
  });
  it('o pacote de zonas de São Paulo cobre os 96 distritos oficiais, marcado como INFERÊNCIA editável', () => {
    const distritos = SP_SUBPREFEITURAS.flatMap((s) => s.distritos);
    expect(SP_SUBPREFEITURAS).toHaveLength(32);
    expect(distritos).toHaveLength(96);
    expect(new Set(distritos).size).toBe(96);
    const pack = spCapitalZonePack();
    expect(pack.places.every((p) => p.inferred === true && p.source === 'pacote')).toBe(true);
    expect(pack.members.every((m) => m.inferred === true && m.relation === 'zona')).toBe(true);
    expect(pack.places.map((p) => p.name)).toEqual(['Zona Leste', 'Zona Norte', 'Zona Sul', 'Zona Oeste', 'Centro']);
  });
  it('converte as linhas do cache de municípios em lugares com estado como pai', () => {
    const drafts = placesFromIbgeRows([{ ibge_code: 3518800, nome: 'Guarulhos', uf: 'SP', populacao: 1291784 }, { ibge_code: 3550308, nome: 'São Paulo', uf: 'SP', populacao: 11451999 }]);
    expect(drafts.filter((d) => d.level === 'uf')).toHaveLength(1);
    expect(drafts.find((d) => d.name === 'Guarulhos')?.parent).toEqual({ level: 'uf', code: 'br:uf:SP' });
    expect(regiaoDrafts(parseIbgeRegioesMetropolitanas(IBGE_METRO)).members.length).toBe(5);
    expect(BR_PACK.country).toBe('br');
  });
});

describe('Radar: resolução de menções e expansão automática com "por que entrou"', () => {
  const u = geoUniverse(); const idx = buildPlaceIndex(u.places, u.members);
  it('resolve zonas informais pelo contexto e marca como inferência', () => {
    const r = resolveMention({ text: 'Zona Leste', kind: 'zona', context: 'São Paulo' }, idx);
    expect(r.status).toBe('resolvido');
    expect(r.places[0].name).toBe('Zona Leste');
    expect(r.places[0].inferred).toBe(true);
    expect(resolveMention({ text: 'leste', kind: 'zona' }, idx).status).toBe('resolvido'); // sem o prefixo "zona"
  });
  it('sem o pacote de zonas a zona NÃO é inventada: nao_encontrado com o motivo', () => {
    const semZonas = buildPlaceIndex(u.places.filter((p) => p.level !== 'zona'), []);
    const r = resolveMention({ text: 'Zona Leste', kind: 'zona' }, semZonas);
    expect(r.status).toBe('nao_encontrado');
    expect(r.note).toBe('pacote_de_zonas_nao_carregado');
  });
  it('homônimos: usa o contexto, e sem contexto declara ambiguidade quando não há vencedor claro', () => {
    const extra = [...u.places, { ...u.places.find((p) => p.name === 'Osasco')!, id: 'osasco-2', code: 'x:osasco', parent_id: null, population: 700_000 }];
    const idx2 = buildPlaceIndex(extra, []);
    expect(resolveMention({ text: 'Osasco', kind: 'lugar' }, idx2).status).toBe('ambiguo');
    expect(resolveMention({ text: 'Osasco', kind: 'lugar', context: 'SP' }, idx2).places[0].id).not.toBe('osasco-2');
    expect(resolveMention({ text: 'Atlantida', kind: 'lugar' }, idx).status).toBe('nao_encontrado');
  });
  it('sigla do estado resolve pela abreviação', () => {
    expect(resolveMention({ text: 'SP', kind: 'lugar' }, idx).places[0].level).toBe('uf');
  });
  it('"Guarulhos e região" expande para a região metropolitana e cada lugar diz por que entrou', () => {
    const gru = resolveMention({ text: 'Guarulhos', kind: 'lugar' }, idx).places.find((p) => p.level === 'municipio')!;
    const seed: ResolvedPlace = { place: gru, origin: 'frase', inferred: false, why: [] };
    const ex = expandNeighborhood([seed], idx, normalizeRules({}), { regionFor: new Set([gru.id]) });
    const names = ex.added.map((a) => a.place.name).sort();
    expect(names).toEqual(['Osasco', 'Santo André', 'São Paulo']);
    expect(ex.added.every((a) => a.why[0].rule === 'mesma_regiao_metropolitana' && a.why[0].via === 'Guarulhos')).toBe(true);
    expect(ex.added[0].why[0].detail).toContain('Região Metropolitana de São Paulo');
  });
  it('sem "e região" e com a regra desligada nada é adicionado (regra configurável)', () => {
    const gru = idx.byNorm.get('guarulhos')!.find((p) => p.level === 'municipio')!;
    expect(expandNeighborhood([{ place: gru, origin: 'frase', inferred: false, why: [] }], idx, normalizeRules({})).added).toEqual([]);
    expect(expandNeighborhood([{ place: gru, origin: 'frase', inferred: false, why: [] }], idx, normalizeRules({ metro: true })).added.length).toBe(3);
  });
  it('zona expande para os distritos membros, com o aviso de agrupamento informal', () => {
    const z = resolveMention({ text: 'Zona Leste', kind: 'zona' }, idx).places[0];
    const ex = expandNeighborhood([{ place: z, origin: 'frase', inferred: true, why: [] }], idx, normalizeRules({}));
    expect(ex.added.length).toBeGreaterThan(30);
    expect(ex.added.map((a) => a.place.name)).toContain('Tatuapé');
    expect(ex.added[0].why[0].rule).toBe('zona_membro');
    expect(ex.added[0].why[0].detail).toContain('informal');
    expect(ex.added.every((a) => a.inferred)).toBe(true);
  });
  it('raio em km e maiores cidades do estado, com teto de adição', () => {
    const sao = idx.byNorm.get('sao paulo')!.find((p) => p.level === 'municipio')!;
    const r = expandNeighborhood([{ place: sao, origin: 'frase', inferred: false, why: [] }], idx, normalizeRules({ radius_km: 40, state_top: 2, max_added: 2 }));
    expect(r.added.length).toBe(2);
    expect(r.truncated).toBe(true);
    const wide = expandNeighborhood([{ place: sao, origin: 'frase', inferred: false, why: [] }], idx, normalizeRules({ radius_km: 40 }));
    expect(wide.added.every((a) => a.why[0].rule === 'raio_km')).toBe(true);
    expect(wide.added.map((a) => a.place.name)).toContain('Guarulhos');
    expect(wide.added.map((a) => a.place.name)).not.toContain('Campinas');
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.2, 0);
  });
  it('rótulo "Bairro, Município" e peso de lugar (cidade grande pesa mais)', () => {
    const dist = u.places.find((p) => p.name === 'Tatuapé')!;
    expect(placeLabel(dist, idx)).toBe('Tatuapé, São Paulo');
    const sao = u.places.find((p) => p.name === 'São Paulo' && p.level === 'municipio')!; const osa = u.places.find((p) => p.name === 'Osasco')!;
    expect(placeWeight(sao)).toBeGreaterThan(placeWeight(osa));
  });
  it('núcleo genérico: Portugal e Miami resolvem sem pacote nenhum', () => {
    expect(resolveMention({ text: 'Lisboa', kind: 'lugar' }, idx).places[0].country).toBe('pt');
    expect(resolveMention({ text: 'Miami', kind: 'lugar' }, idx).places[0].country).toBe('us');
  });
});

describe('Radar: fontes abertas (OpenStreetMap, Wikidata, GeoNames) com licença e limites', () => {
  it('Overpass: consulta por Wikidata ou nome, recusa entrada perigosa e lê bairros', () => {
    const q = buildOverpassQuery({ wikidata: 'Q174' })!;
    expect(q).toContain('area["wikidata"="Q174"]');
    expect(q).toContain('suburb|neighbourhood|quarter');
    expect(buildOverpassQuery({ wikidata: 'Q1; drop' })).toBeNull();
    expect(buildOverpassQuery({ name: 'X"]; out;' })).toContain('"name"="X]; out;"'.replace(']; out;', ']; out;'));
    expect(buildOverpassQuery({ name: '' })).toBeNull();
    const rows = parseOverpass(OVERPASS_TATUAPE);
    expect(rows.map((r) => r.name)).toEqual(['Tatuapé', 'Vila Carrão']); // duplicado e sem nome/estação ignorados
    expect(rows[0].wikidata).toBe('Q1234');
    expect(rows[1].lat).toBeCloseTo(-23.56);
    expect(OSM_LICENSE).toBe('ODbL-1.0');
    expect(OSM_ATTRIBUTION).toContain('OpenStreetMap');
  });
  it('Wikidata e GeoNames: consultas validadas e respostas lidas', () => {
    expect(buildWikidataSubdivisionsQuery('Q597', 'pt')).toContain('wd:Q597');
    expect(buildWikidataSubdivisionsQuery('597')).toBeNull();
    const rows = parseWikidataBindings({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q1' }, itemLabel: { value: 'Alfama' }, coord: { value: 'Point(-9.13 38.71)' }, pop: { value: '3000' } }, { item: { value: 'http://www.wikidata.org/entity/Q2' }, itemLabel: { value: 'Q2' } }] } });
    expect(rows).toEqual([{ qid: 'Q1', name: 'Alfama', lat: 38.71, lon: -9.13, population: 3000 }]);
    expect(parseGeoNamesChildren({ geonames: [{ geonameId: 7, name: 'Wynwood', lat: '25.8', lng: '-80.19', population: 0, fcode: 'PPLX' }] })[0]).toMatchObject({ code: 'gn:7', lat: 25.8, population: null });
  });
});

describe('Radar: Foco a partir de texto (parser, plano B e validação)', () => {
  it('validação recusa o que a IA devolver fora dos limites (peso, públicos, temas com URL, hosts)', () => {
    const v = validateFocusDraft({ focuses: [{ name: 'Criminal', segment: 'Criminal', weight: 99, audiences: ['urgencia', 'inventado', 'Alvo'], topics: ['embriaguez ao volante', 'https://x.com', '  '], target_hosts: ['https://www.Exemplo.com/pagina', 'não é host'], territory: [{ text: 'Zona Leste', kind: 'zona', context: 'São Paulo' }, { text: 'Guarulhos', expand_region: true }, { text: '' }] }, { name: '' }, 5] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const d = v.drafts[0];
    expect(d.weight).toBe(10);
    expect(d.audiences).toEqual(['urgencia', 'alvo']);
    expect(d.topics).toEqual(['embriaguez ao volante']);
    expect(d.target_hosts).toEqual(['exemplo.com']);
    expect(d.territory).toHaveLength(2);
    expect(d.territory[1]).toMatchObject({ kind: 'lugar', expand_region: true });
    expect(v.drafts).toHaveLength(1);
    expect(validateFocusDraft({ outra: 1 })).toEqual({ ok: false, error: 'resposta_invalida' });
    expect(validateFocusDraft({ focuses: [{ name: '' }] })).toEqual({ ok: false, error: 'nenhum_foco' });
  });
  it('extrai JSON de resposta com cerca de código e texto em volta', () => {
    expect(extractJson('claro:\n```json\n{"a":{"b":"}"}}\n```\nfim')).toEqual({ a: { b: '}' } });
    expect(extractJson('sem json')).toBeNull();
    expect(extractJson('{quebrado')).toBeNull();
  });
  it('plano B sem IA entende a frase do dono: 2 focos, zonas com prefixo herdado, "e região" e tema solto', () => {
    const r = heuristicFocusParse(PHRASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.drafts).toHaveLength(2);
    const [criminal, emp] = r.drafts;
    expect(criminal.name).toBe('criminal');
    expect(criminal.weight).toBe(8); // ênfase explícita
    expect(criminal.territory.map((t) => `${t.kind}:${t.text}`)).toEqual(['zona:Zona Leste', 'zona:Zona Norte', 'zona:Zona Sul', 'lugar:Guarulhos']);
    expect(criminal.territory[3].expand_region).toBe(true);
    expect(criminal.topics).toContain('embriaguez ao volante');
    expect(emp.name).toBe('empresarial');
    expect(emp.weight).toBe(5);
    expect(emp.topics).toEqual(['defesa de reclamadas', 'ações de ex-funcionários', 'acidentes com frotas']);
    expect(emp.territory).toEqual([{ text: 'SP', kind: 'lugar', context: null, expand_region: false }]);
    expect(criminal.needs_review && emp.needs_review).toBe(true);
  });
  it('contexto vindo do texto ("SP") ajuda a escolher a zona entre homônimos', () => {
    const r = heuristicFocusParse(PHRASE); if (!r.ok) throw new Error('x');
    const out = applyContextFromText(r.drafts, PHRASE, ['SP', 'Guarulhos']);
    expect(out[0].territory[0].context).toBe('SP');
    expect(out[0].territory[3].context).toBeNull(); // só zonas recebem contexto
  });
  it('mesma frase em inglês e em espanhol: o núcleo não depende de idioma', () => {
    const en = heuristicFocusParse('emphasis on dental implants in Miami and region; whitening: teeth whitening, veneers in Lisbon');
    expect(en.ok).toBe(true);
    if (!en.ok) return;
    expect(en.drafts[0].territory[0]).toMatchObject({ text: 'Miami', expand_region: true });
    const es = heuristicFocusParse('énfasis en estética facial en Madrid y región');
    expect(es.ok && es.drafts[0].weight).toBe(8);
  });
});

describe('Radar: o núcleo NÃO fala de advocacia nem de Brasil', () => {
  const dir = join(process.cwd(), 'supabase', 'functions', '_shared');
  const CORE = ['radar-geo-core', 'radar-focus-core', 'radar-discovery-core', 'radar-entity-core', 'radar-social-core', 'radar-enrich-core', 'radar-score-core', 'radar-store', 'radar-batch', 'radar-handler', 'radar-runner'];
  const FORBIDDEN = /advoca|advogad|\bOAB\b|jur[ií]dic|brasil|brazil|\bibge\b|criminal|trabalhist|\bsp\b|são paulo|sao paulo/i;
  for (const f of CORE) {
    it(`${f}.ts`, () => {
      const text = readFileSync(join(dir, `${f}.ts`), 'utf8');
      const hit = text.split('\n').map((l, i) => ({ l, i: i + 1 })).filter((x) => FORBIDDEN.test(x.l));
      expect(hit.map((x) => `${x.i}: ${x.l.trim().slice(0, 90)}`)).toEqual([]);
    });
  }
});
