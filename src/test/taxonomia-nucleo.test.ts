import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseDelimited } from '../../supabase/functions/_shared/backlinks-core';
import {
  CAPITAIS, GRANDES_REGIOES, PACK_ADVOCACIA, SEGMENT_PACKS, SEM_AREA, UF_LIST, UF_NOME, UF_REGIAO, buildGeoIndex, classifyItems, classifyPage, classifyQuery, comPopulacao, compilePack, detectGeo,
  getPack, maioresMunicipios, matrizSlug, matrizesCasadas, nichoSlug, norm, packToSuggestions, parseIbgeMunicipios, parseIbgePopulacao, regiaoSpDoMunicipio, ruleKeywords, slugify, subareaSlug, suggestNodes, ufsDaRegiao,
  parseTailImport, tailSlug, type ClassifiedItem, type Municipio,
} from '../../supabase/functions/_shared/taxonomy-core';

// Códigos e nomes reais do IBGE (conferidos em 20/11/2026).
const M = (ibge_code: number, nome: string, uf: Municipio['uf'], populacao: number | null = null) => ({ ibge_code, nome, uf, populacao });
const MUNIS = [
  M(3518800, 'Guarulhos', 'SP', 1351284), M(3534401, 'Osasco', 'SP', 761441), M(3550308, 'São Paulo', 'SP', 11911337), M(3548500, 'Santos', 'SP', 429528), M(3547809, 'Santo André', 'SP', 784290),
  M(4212502, 'Penha', 'SC', 37775), M(2605103, 'Custódia', 'PE', 39797), M(3138500, 'Liberdade', 'MG', 4715), M(2929800, 'Saúde', 'BA', 10612), M(5218300, 'Posse', 'GO', 36517),
  M(3541000, 'Praia Grande', 'SP', 371190), M(4213807, 'Praia Grande', 'SC', 8788), M(3545209, 'Salto', 'SP', 141994), M(3542602, 'Registro', 'SP', 62101), M(3548708, 'São Bernardo do Campo', 'SP', 842558),
  M(3506003, 'Bauru', 'SP', 394028), M(2513851, 'Santo André', 'PB', 2714),
];
const IDX = buildGeoIndex(MUNIS);
const pk = PACK_ADVOCACIA;

describe('taxonomia: pacote de segmento ADVOCACIA', () => {
  it('estrutura: 13 áreas de atuação + 2 transversais, regras compilam e apontam para áreas que existem', () => {
    const subst = pk.matrizes.filter((m) => !m.transversal);
    expect(pk.matrizes).toHaveLength(15);
    expect(subst).toHaveLength(13);
    expect(pk.matrizes.filter((m) => m.transversal).map((m) => m.label)).toEqual(['Peças e modelos', 'Notícias e conteúdo jurídico']);
    expect(pk.rules).toHaveLength(34);
    expect(compilePack(pk)).toHaveLength(34);
    for (const r of pk.rules) expect(pk.matrizes.some((m) => m.label === r.matriz)).toBe(true);
    for (const c of pk.correl) { expect(pk.matrizes.some((m) => m.label === c.from)).toBe(true); expect(pk.matrizes.some((m) => m.label === c.to) || ['Transporte aéreo', 'Administrativo'].includes(c.to)).toBe(true); }
    // toda área de atuação tem uma frase de consulta
    for (const m of subst) expect(m.consulta, m.label).toBeTruthy();
  });
  it('a ordem das regras é a do analisar.py: a primeira que combinar vence', () => {
    expect(pk.rules[0].subarea).toBe('Eleitoral e candidaturas');
    expect(pk.rules.findIndex((r) => r.subarea === 'Defesa criminal geral')).toBeGreaterThan(pk.rules.findIndex((r) => r.subarea === 'Plantão, delegacia e inquérito'));
    expect(classifyQuery('lei maria da penha medida protetiva', pk)).toMatchObject({ matriz: 'Criminal', subarea: 'Violência doméstica e Maria da Penha' });
  });
  it('pacotes de outros segmentos existem como RASCUNHO e getPack acha pelo id', () => {
    expect(SEGMENT_PACKS.map((p) => p.id)).toEqual(['advocacia', 'saude_estetica', 'varejo_local', 'educacao', 'politica']);
    expect(getPack('advocacia')?.status).toBe('validado');
    for (const p of SEGMENT_PACKS.slice(1)) { expect(p.status).toBe('rascunho'); expect(compilePack(p).length).toBeGreaterThan(0); }
    expect(getPack('inexistente')).toBeNull();
    expect(classifyQuery('harmonização facial preço', SEGMENT_PACKS[1])).toMatchObject({ matriz: 'Estética facial' });
  });
  it('ruleKeywords tira metacaracteres e repetições', () => {
    expect(ruleKeywords(String.raw`consignado|emprestimo|bancos?\b|dp \d`)).toEqual(['consignado', 'emprestimo', 'bancos']);
  });
  it('slugs: área, subárea e nicho', () => {
    expect(matrizSlug('Previdenciário (INSS)')).toBe('previdenciario-inss');
    expect(subareaSlug('Criminal', 'Drogas e tráfico')).toBe('criminal/drogas-e-trafico');
    expect(nichoSlug('criminal/drogas-e-trafico', 'Maconha')).toBe('criminal/drogas-e-trafico/n/maconha');
    expect(norm('Ação  de  CNH!')).toBe('acao de cnh');
    expect(slugify('São Paulo')).toBe('sao-paulo');
  });
});

describe('taxonomia: classificador', () => {
  it('consultas reais do Search Console', () => {
    expect(classifyQuery('advogado criminalista guarulhos', pk)).toMatchObject({ matriz: 'Criminal', subarea: 'Defesa criminal geral' });
    expect(classifyQuery('revisional de financiamento de veículo', pk)).toMatchObject({ matriz: 'Bancário e Financiamentos', subarea: 'Revisional de financiamento e juros abusivos' });
    expect(classifyQuery('tornozeleira apitando', pk)).toMatchObject({ matriz: 'Criminal', subarea: 'Execução penal e progressão de regime' });
    expect(classifyQuery('CNH suspensa', pk)).toMatchObject({ matriz: 'Trânsito e CNH', subarea: 'Suspensão, cassação e processo administrativo' });
    expect(classifyQuery('plano de saúde negou cirurgia', pk)).toMatchObject({ matriz: 'Saúde e Planos' });
  });
  it('sem regra que combine: nulo, confiança zero e sem evidência (a tela mostra "Sem área identificada")', () => {
    expect(classifyQuery('receita de bolo de cenoura', pk)).toEqual({ matriz: null, subarea: null, confianca: 0, evidencia: null });
    expect(SEM_AREA).toBe('Sem área identificada');
  });
  it('página: usa URL, título e H1; confiança sobe com os campos que casam e cai nas regras amplas', () => {
    const forte = classifyPage({ url: 'https://rdm.com.br/trabalhista/rescisao-indireta/', title: 'Rescisão indireta: seus direitos', h1: 'Rescisão trabalhista' }, pk);
    expect(forte).toMatchObject({ matriz: 'Trabalhista' });
    expect(forte.evidencia?.campos).toEqual(['url', 'titulo', 'h1']);
    expect(forte.confianca).toBe(0.95);
    const so_url = classifyPage({ url: 'https://rdm.com.br/divorcio-litigioso/' }, pk);
    expect(so_url).toMatchObject({ matriz: 'Família e Sucessões', subarea: 'Divórcio, guarda e pensão alimentícia' });
    expect(so_url.confianca).toBe(0.55);
    const ampla = classifyPage({ url: 'https://rdm.com.br/advogado-criminalista/' }, pk);
    expect(ampla.evidencia?.generica).toBe(true);
    expect(ampla.confianca).toBeLessThan(so_url.confianca);
    expect(forte.evidencia?.termos).toEqual(expect.arrayContaining(['trabalhista']));
  });
  it('o host não entra na classificação (só o caminho): domínio com "criminal" no nome não cria área', () => {
    expect(classifyPage({ url: 'https://advogadocriminal.com.br/' }, pk).matriz).toBeNull();
  });
  it('matrizesCasadas devolve todas as áreas que o texto toca (base da co-ocorrência)', () => {
    expect(matrizesCasadas('advogado criminalista para cnh suspensa por embriaguez', pk).sort()).toEqual(['Criminal', 'Trânsito e CNH']);
  });
});

describe('taxonomia: agregador de sugestões', () => {
  const inputs = [
    ...['https://s.com/lei-seca-bafometro/', 'https://s.com/bafometro-recusa/', 'https://s.com/blitz-bafometro/'].map((u) => ({ source: 'site' as const, kind: 'pagina' as const, key: u, url: u })),
    { source: 'search_console' as const, kind: 'consulta' as const, key: 'advogado criminalista cnh suspensa', query: 'advogado criminalista cnh suspensa', weight: 900, clicks: 4 },
    { source: 'search_console' as const, kind: 'consulta' as const, key: 'criminalista cnh cassada', query: 'criminalista cnh cassada', weight: 300 },
    { source: 'search_console' as const, kind: 'consulta' as const, key: 'defesa criminal e cnh', query: 'defesa criminal e cnh', weight: 100 },
    { source: 'search_console' as const, kind: 'consulta' as const, key: 'receita de bolo', query: 'receita de bolo', weight: 50 },
  ];
  const items = classifyItems(inputs, pk);
  const r = suggestNodes(items, pk);
  const bySlug = new Map(r.nodes.map((n) => [n.slug, n]));

  it('gera matriz, subárea e nicho com evidência (contagem, peso, exemplos) e conta o que ficou sem área', () => {
    const crim = bySlug.get('criminal')!;
    expect(crim).toMatchObject({ kind: 'matriz', parentSlug: null });
    expect((crim.evidence as { total: number }).total).toBeGreaterThanOrEqual(6);
    const sub = bySlug.get(subareaSlug('Criminal', 'Crimes de trânsito'))!;
    expect(sub).toMatchObject({ kind: 'subarea', parentSlug: 'criminal', source: 'site' });
    expect((sub.evidence as { site: { count: number; exemplos: string[] } }).site.count).toBe(3);
    expect(sub.keywords).toEqual(expect.arrayContaining(['bafometro', 'lei seca']));
    const nicho = bySlug.get(nichoSlug(sub.slug, 'bafometro'))!;
    expect(nicho).toMatchObject({ kind: 'nicho', parentSlug: sub.slug, label: 'bafometro' });
    expect(r.unclassified).toEqual({ count: 1, weight: 50, examples: ['receita de bolo'] });
    expect(r.classified).toBe(items.length - 1);
  });
  it('a origem do nó é a fonte de maior peso; nada vem "aprovado": as sugestões ficam para a revisão', () => {
    expect(bySlug.get('criminal')!.source).toBe('search_console');
    for (const n of r.nodes) expect(['pacote', 'site', 'search_console']).toContain(n.source);
  });
  it('correlatos: aresta do pacote (destino entra como sugestão do pacote) + co-ocorrência confirmada pelos dados', () => {
    const pack = r.edges.find((e) => e.fromSlug === 'criminal' && e.toSlug === 'transito-e-cnh')!;
    expect(pack).toBeTruthy();
    expect(pack.source).toBe('pacote');
    expect(pack.weight).toBe(3); // 3 consultas tocam Criminal e Trânsito juntas: a aresta do pacote ganha o peso dos dados
    expect(pack.note).toMatch(/crimes de trânsito, embriaguez; aparecem juntas em 3 itens/);
    // Trânsito não foi classificado como área (a primeira regra que casa é a de Criminal), mas entra como sugestão do pacote, ligada por correlação
    expect(bySlug.get('transito-e-cnh')).toMatchObject({ kind: 'matriz', source: 'pacote', evidence: { total: 0 } });
  });
  it('co-ocorrência abaixo do mínimo não cria aresta; destino que não é área vira nicho da área de origem', () => {
    const two = suggestNodes(classifyItems(inputs.slice(3, 5), pk), pk);
    expect(two.edges.find((e) => e.fromSlug === 'criminal' && e.toSlug === 'transito-e-cnh')?.weight).toBe(1);
    const cons = suggestNodes(classifyItems([{ source: 'site', kind: 'pagina', key: 'https://s.com/consumidor/negativacao/', url: 'https://s.com/consumidor/negativacao/' }], pk), pk);
    const aereo = cons.nodes.find((n) => n.slug === 'consumidor/n/transporte-aereo')!;
    expect(aereo).toMatchObject({ kind: 'nicho', parentSlug: 'consumidor', source: 'pacote' });
    expect(cons.edges.some((e) => e.toSlug === aereo.slug)).toBe(true);
  });
  it('o pacote inteiro como sugestão: 15 áreas, 34 subáreas e os 2 nichos externos', () => {
    const all = packToSuggestions(pk);
    expect(all.nodes.filter((n) => n.kind === 'matriz')).toHaveLength(15);
    expect(all.nodes.filter((n) => n.kind === 'subarea')).toHaveLength(34);
    expect(all.nodes.filter((n) => n.kind === 'nicho').map((n) => n.label).sort()).toEqual(['Administrativo', 'Transporte aéreo']);
    expect(all.edges).toHaveLength(pk.correl.length);
    expect(new Set(all.nodes.map((n) => n.slug)).size).toBe(all.nodes.length);
    expect(all.nodes.every((n) => n.source === 'pacote')).toBe(true);
  });
  it('sem itens: nada a sugerir', () => {
    expect(suggestNodes([] as ClassifiedItem[], pk)).toMatchObject({ nodes: [], edges: [], classified: 0, unclassified: { count: 0 } });
  });
});

describe('taxonomia: geografia', () => {
  const nomes = (d: ReturnType<typeof detectGeo>) => d.municipios.map((m) => `${m.nome}-${m.uf}:${m.via}`);
  it('URL: município no segmento inteiro, depois de "em" e em n-gramas (lógica do analisar.py)', () => {
    expect(nomes(detectGeo({ url: 'https://rdm.com.br/advogado-criminalista/guarulhos/' }, IDX))).toEqual(['Guarulhos-SP:segmento']);
    expect(nomes(detectGeo({ url: 'https://rdm.com.br/advogado-criminalista-em-osasco/' }, IDX))).toEqual(['Osasco-SP:prefixo']);
    expect(nomes(detectGeo({ url: 'https://rdm.com.br/advogado-em-sao-bernardo-do-campo/' }, IDX))).toEqual(['São Bernardo do Campo-SP:ngrama']);
  });
  it('falsos positivos: custódia, liberdade, saúde, posse, penha, salto e registro NÃO são cidade sem contexto', () => {
    for (const url of ['/audiencia-de-custodia/', '/liberdade-provisoria/', '/colocado-em-liberdade/', '/plano-de-saude-negou/', '/posse-de-drogas/', '/lei-maria-da-penha/', '/salto-em-altura/', '/registro-de-marca/', '/advogado-de-saude/']) {
      expect(detectGeo({ url: `https://rdm.com.br${url}` }, IDX).municipios, url).toEqual([]);
    }
    for (const q of ['audiência de custódia', 'habeas corpus liberdade', 'posse de arma', 'lei maria da penha em casa', 'saúde mental']) expect(detectGeo({ query: q }, IDX).municipios, q).toEqual([]);
  });
  it('palavra jurídica só vira cidade com contexto forte: "cidade de X" ou a UF colada, e só a UF certa', () => {
    expect(nomes(detectGeo({ title: 'Advogado na cidade de Posse' }, IDX))).toEqual(['Posse-GO:cidade_de']);
    expect(nomes(detectGeo({ title: 'Advogado em Penha SC' }, IDX))).toEqual(['Penha-SC:contexto_uf']);
    expect(nomes(detectGeo({ title: 'Penha/SC: advogado' }, IDX))).toEqual(['Penha-SC:contexto_uf']);
    expect(nomes(detectGeo({ title: 'Advogado em Penha SP' }, IDX))).toEqual([]); // não existe Penha em SP
    expect(nomes(detectGeo({ query: 'custódia PE advogado' }, IDX))).toEqual(['Custódia-PE:contexto_uf']);
    expect(nomes(detectGeo({ query: 'saúde ba' }, IDX))).toEqual(['Saúde-BA:contexto_uf']);
  });
  it('consulta (texto livre): nome de 6+ letras solto conta, palavras comuns não', () => {
    expect(nomes(detectGeo({ query: 'advogado criminalista guarulhos' }, IDX))).toEqual(['Guarulhos-SP:texto']);
    expect(nomes(detectGeo({ query: 'advogado paulista' }, IDX))).toEqual([]);
    expect(nomes(detectGeo({ query: 'advogado criminalista em sao paulo' }, IDX))).toEqual(['São Paulo-SP:ngrama']);
  });
  it('nome repetido em dois estados devolve os dois (a tela/plano decide); Santo André existe em SP e na PB', () => {
    const d = detectGeo({ url: 'https://rdm.com.br/praia-grande/' }, IDX);
    expect(d.municipios.map((m) => m.uf).sort()).toEqual(['SC', 'SP']);
    expect(d.ufs).toEqual(['SC', 'SP']);
  });
  it('estados por nome (o mais longo primeiro) e a palavra "para" não é o estado do Pará', () => {
    expect(detectGeo({ query: 'advogado no estado de mato grosso do sul' }, IDX).ufs).toEqual(['MS']);
    expect(detectGeo({ query: 'advogado para empresas' }, IDX).ufs).toEqual([]);
    expect(detectGeo({ query: 'advogado em minas gerais e rio grande do norte' }, IDX).ufs).toEqual(['MG', 'RN']);
  });
  it('regiões de SP por frase e grandes regiões por UF', () => {
    const d = detectGeo({ url: 'https://rdm.com.br/advogado-zona-leste-sao-paulo/', title: 'Atendimento no ABC Paulista' }, IDX);
    expect(d.regioes_sp).toEqual(['zona-leste', 'abc-paulista']);
    expect(d.regioes_br).toEqual(['Sudeste']);
    expect(detectGeo({ query: 'advogado no nordeste' }, IDX).regioes_br).toContain('Nordeste');
    expect(UF_REGIAO.SP).toBe('Sudeste'); expect(UF_REGIAO.AM).toBe('Norte'); expect(UF_REGIAO.DF).toBe('Centro-Oeste');
    expect(UF_LIST).toHaveLength(27);
    expect(GRANDES_REGIOES.flatMap((g) => ufsDaRegiao(g)).sort()).toEqual([...UF_LIST].sort());
    expect(UF_NOME.SP).toBe('São Paulo');
    expect(regiaoSpDoMunicipio('Santo André')).toBe('abc-paulista');
    expect(regiaoSpDoMunicipio('Santos')).toBe('baixada-santista');
    expect(regiaoSpDoMunicipio('Bauru')).toBeNull();
  });
  it('as 27 capitais: uma por estado, com código IBGE de 7 dígitos', () => {
    expect(CAPITAIS).toHaveLength(27);
    expect(new Set(CAPITAIS.map((c) => c.uf)).size).toBe(27);
    expect(CAPITAIS.every((c) => String(c.ibge_code).length === 7)).toBe(true);
  });
});

describe('taxonomia: leitura da API do IBGE', () => {
  it('municípios: usa microrregião ou região imediata, descarta código inválido e UF desconhecida', () => {
    const json = [
      { id: 1100015, nome: "Alta Floresta D'Oeste", microrregiao: { nome: 'Cacoal', mesorregiao: { nome: 'Leste Rondoniense', UF: { sigla: 'RO' } } }, 'regiao-imediata': { nome: 'Cacoal', 'regiao-intermediaria': { nome: 'Ji-Paraná', UF: { sigla: 'RO' } } } },
      { id: 3518800, nome: 'Guarulhos', microrregiao: null, 'regiao-imediata': { nome: 'São Paulo', 'regiao-intermediaria': { nome: 'São Paulo', UF: { sigla: 'SP' } } } },
      { id: 12, nome: 'Curto demais', microrregiao: null }, { id: 3518801, nome: 'X', microrregiao: null }, { id: 3518802, nome: 'Sem UF' }, 'lixo', null,
      { id: 3518803, nome: 'UF fantasma', microrregiao: { mesorregiao: { UF: { sigla: 'ZZ' } } } },
    ];
    const r = parseIbgeMunicipios(json);
    expect(r.map((m) => [m.ibge_code, m.uf, m.regiao])).toEqual([[1100015, 'RO', 'Norte'], [3518800, 'SP', 'Sudeste']]);
    expect(r[0]).toMatchObject({ mesorregiao: 'Leste Rondoniense', regiao_imediata: 'Cacoal', populacao: null });
    expect(r[1]).toMatchObject({ mesorregiao: 'São Paulo', regiao_imediata: 'São Paulo' });
    expect(parseIbgeMunicipios({ erro: true })).toEqual([]);
  });
  it('população: pega o ano mais recente de cada série e ignora valor inválido', () => {
    const json = [{ resultados: [{ series: [
      { localidade: { id: '3518800' }, serie: { '2025': '1300000', '2026': '1351284' } }, { localidade: { id: '3534401' }, serie: { '2026': '761441' } },
      { localidade: { id: '1100015' }, serie: { '2026': '-' } }, { localidade: { id: 'x' }, serie: { '2026': '5' } },
    ] }] }];
    const p = parseIbgePopulacao(json);
    expect(p.ano).toBe(2026);
    expect([...p.byCode.entries()]).toEqual([[3518800, 1351284], [3534401, 761441]]);
    expect(parseIbgePopulacao([]).byCode.size).toBe(0);
    expect(parseIbgePopulacao(null).ano).toBeNull();
    const merged = comPopulacao(parseIbgeMunicipios([{ id: 3518800, nome: 'Guarulhos', microrregiao: { mesorregiao: { UF: { sigla: 'SP' } } } }, { id: 1100015, nome: 'Alta Floresta', microrregiao: { mesorregiao: { UF: { sigla: 'RO' } } } }]), p);
    expect(merged.map((m) => [m.populacao, m.populacao_ano])).toEqual([[1351284, 2026], [null, null]]);
  });
  it('maiores municípios: por população, sem população por último, filtro por estado', () => {
    const l = [M(3550308, 'São Paulo', 'SP', 11911337), M(3518800, 'Guarulhos', 'SP', 1351284), M(4212502, 'Penha', 'SC', 37775), M(3506003, 'Bauru', 'SP', null)];
    expect(maioresMunicipios(l, 2).map((m) => m.nome)).toEqual(['São Paulo', 'Guarulhos']);
    expect(maioresMunicipios(l, 10, 'SP').map((m) => m.nome)).toEqual(['São Paulo', 'Guarulhos', 'Bauru']);
  });
});

describe('taxonomia: cauda gerada por agente (sem regra de tamanho)', () => {
  it('aceita lista de textos, de objetos, { items } e um texto por linha; o agente define tamanho, público e motores', () => {
    const r = parseTailImport([
      'cnh', { label: 'como recorrer de uma multa de trânsito por excesso de velocidade em rodovia federal', parent: 'criminal', engines: ['google_serp', 'bing_serp', 'inventado'], publico: 'motorista profissional', rationale: 'intenção informacional', country: 'PT', language: 'pt-PT', keywords: ['Multa', 'multa', 'jari'] },
      { query: 'CNH', parent_slug: 'x' }, { label: '' }, 42,
    ]);
    expect(r).toMatchObject({ invalid: 2, duplicates: 1, engines_ignored: 1 });
    expect('items' in r && r.items).toHaveLength(2);
    if ('items' in r) {
      expect(r.items[0]).toMatchObject({ label: 'cnh', parentRef: null, engines: [], country: null });
      expect(r.items[1]).toMatchObject({ parentRef: 'criminal', engines: ['google_serp', 'bing_serp'], publico: 'motorista profissional', rationale: 'intenção informacional', country: 'pt', language: 'pt-PT', keywords: ['multa', 'jari'] });
    }
    expect('items' in (parseTailImport({ items: ['a b'] }) as object)).toBe(true);
    const linhas = parseTailImport(['primeira busca', '', 'segunda busca', 'terceira'].join('\n'));
    expect('items' in linhas && linhas.items.map((i) => i.label)).toEqual(['primeira busca', 'segunda busca', 'terceira']);
    expect('items' in (parseTailImport('[{"label":"em json"}]') as object)).toBe(true);
  });
  it('erros: vazio e JSON quebrado; só descarta o que não cabe no campo (vazio ou maior que 300 letras)', () => {
    expect(parseTailImport('   ')).toEqual({ error: 'tail_empty' });
    expect(parseTailImport([])).toEqual({ error: 'tail_empty' });
    expect(parseTailImport(null)).toEqual({ error: 'tail_empty' });
    expect(parseTailImport('{quebrado')).toEqual({ error: 'tail_format' });
    const r = parseTailImport(['a'.repeat(300), 'a'.repeat(301), 'x']);
    expect(r).toMatchObject({ invalid: 2 });
    expect('items' in r && r.items).toHaveLength(1);
  });
  it('slug da cauda: estável, único por texto e nunca estoura o limite do banco', () => {
    const a = tailSlug('criminal', 'Como tirar a tornozeleira?');
    expect(a).toBe(tailSlug('criminal', 'como tirar a tornozeleira'));
    expect(a).not.toBe(tailSlug('criminal', 'como tirar a tornozeleira agora'));
    expect(a).toMatch(/^criminal\/c\/como-tirar-a-tornozeleira-[0-9a-z]+$/);
    expect(tailSlug('criminal/drogas-e-trafico', 'x'.repeat(300)).length).toBeLessThan(150);
  });
  it('nichos do agregador não têm tamanho mínimo de termo (só a contagem de evidências)', () => {
    const pages = ['a', 'b', 'c'].map((x) => ({ source: 'site' as const, kind: 'pagina' as const, key: `https://s.com/lei-${x}/`, url: 'https://s.com/trafico-' + x + '/' }));
    const r = suggestNodes(classifyItems(pages, pk), pk);
    expect(r.nodes.some((n) => n.kind === 'nicho' && n.label === 'trafico')).toBe(true);
  });
});

// Prova contra a varredura real (20/11/2026): só roda onde os arquivos existem (máquina do dono).
const BASE = 'C:/Users/randa/Documents/Downloads/kit-rdm-arquivos/auditoria-tecnica-rdm-2026-11-20/';
describe.skipIf(!existsSync(`${BASE}dados/paginas.csv`) || !existsSync(`${BASE}resultado/taxonomia_paginas.csv`))('taxonomia: paridade com o analisar.py (2.819 páginas reais)', () => {
  it('a classificação é idêntica; as únicas diferenças são as páginas de tornozeleira/monitoramento eletrônico (termo acrescentado)', () => {
    const rows = parseDelimited(readFileSync(`${BASE}dados/paginas.csv`, 'utf-8'), ',');
    const ix = (n: string) => rows[0].indexOf(n);
    const ref = new Map(parseDelimited(readFileSync(`${BASE}resultado/taxonomia_paginas.csv`, 'utf-8'), ',').slice(1).map((r) => [r[2], [r[0], r[1]]]));
    let total = 0; const diffs: string[] = [];
    for (const r of rows.slice(1)) {
      if (r[ix('status')] !== '200' || !/html/i.test(r[ix('content_type')] || '')) continue;
      total++;
      const c = classifyPage({ url: r[ix('url')], title: r[ix('title')], h1: r[ix('h1')] }, pk);
      const got = [c.matriz ?? SEM_AREA, c.subarea ?? 'Institucional/outros'];
      const want = ref.get(r[ix('url')]);
      if (!want || want[0] !== got[0] || want[1] !== got[1]) diffs.push(`${r[ix('url')]} ${r[ix('title')]}`);
    }
    expect(total).toBe(2819);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.every((d) => /tornozeleira|monitoramento-eletronico/i.test(d))).toBe(true);
  });
  it('a cobertura de municípios por URL bate com o analisar.py (21 municípios) usando a mesma base do IBGE', () => {
    const ibge = `${BASE}dados/ibge_municipios.json`;
    if (!existsSync(ibge)) return;
    const idx = buildGeoIndex(parseIbgeMunicipios(JSON.parse(readFileSync(ibge, 'utf-8'))));
    const rows = parseDelimited(readFileSync(`${BASE}dados/paginas.csv`, 'utf-8'), ',');
    const cov = new Set<number>();
    for (const r of rows.slice(1)) for (const m of detectGeo({ url: r[rows[0].indexOf('url')] }, idx).municipios) cov.add(m.ibge_code);
    expect(cov.size).toBe(21);
  });
});
