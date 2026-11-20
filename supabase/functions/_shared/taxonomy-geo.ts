/**
 * Geografia da taxonomia: regras puras (sem rede, sem banco).
 *
 *  - Estados, grandes regiões do Brasil (por UF) e regiões de São Paulo.
 *  - Leitura das respostas da API pública do IBGE (localidades e estimativa de população).
 *  - Detecção de município/estado/região em URL, título e consulta, reaproveitando a lógica LEGAL/AMBIG validada no `analisar.py`:
 *    palavras que também são termos jurídicos ou comuns (custódia, liberdade, saúde, posse, penha...) NÃO são cidade sem contexto.
 *
 * Limite honesto: o município é achado pelo NOME. Nomes comuns de uma palavra ficam de fora para não gerar falso positivo, então a
 * cobertura real pode ser um pouco maior do que a detectada. Cada achado diz POR QUE foi aceito (`via`).
 */

export const norm = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[\u0080-\uffff]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const slugify = (s: unknown): string => norm(s).replace(/ /g, '-');

export const UF_LIST = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;
export type Uf = (typeof UF_LIST)[number];
export const isUf = (v: unknown): v is Uf => typeof v === 'string' && (UF_LIST as readonly string[]).includes(v);

export const UF_NOME: Record<Uf, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
/** nome normalizado do estado -> UF (do analisar.py). "Pará" fica de fora de propósito: normalizado vira "para", a preposição. */
export const UF_POR_NOME: Record<string, Uf> = Object.fromEntries((Object.entries(UF_NOME) as Array<[Uf, string]>).filter(([uf]) => uf !== 'PA').map(([uf, nome]) => [norm(nome), uf]));

export type GrandeRegiao = 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
export const GRANDES_REGIOES: GrandeRegiao[] = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
export const UF_REGIAO: Record<Uf, GrandeRegiao> = {
  AC: 'Norte', AM: 'Norte', AP: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MS: 'Centro-Oeste', MT: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
};
export const ufsDaRegiao = (r: GrandeRegiao): Uf[] => UF_LIST.filter((u) => UF_REGIAO[u] === r);

/** Regiões de SP citadas em texto (frases do analisar.py). `label` é como a região aparece nas telas e nas consultas. */
export const SP_REGIOES: Array<{ slug: string; label: string; frase: string }> = [
  { slug: 'zona-leste', label: 'Zona Leste de São Paulo', frase: 'zona leste' },
  { slug: 'zona-norte', label: 'Zona Norte de São Paulo', frase: 'zona norte' },
  { slug: 'zona-sul', label: 'Zona Sul de São Paulo', frase: 'zona sul' },
  { slug: 'zona-oeste', label: 'Zona Oeste de São Paulo', frase: 'zona oeste' },
  { slug: 'grande-sao-paulo', label: 'Grande São Paulo', frase: 'grande sao paulo' },
  { slug: 'abc-paulista', label: 'ABC Paulista', frase: 'abc paulista' },
  { slug: 'baixada-santista', label: 'Baixada Santista', frase: 'baixada santista' },
  { slug: 'vale-do-paraiba', label: 'Vale do Paraíba', frase: 'vale do paraiba' },
  { slug: 'regiao-metropolitana', label: 'Região Metropolitana de São Paulo', frase: 'regiao metropolitana' },
  { slug: 'litoral-norte', label: 'Litoral Norte', frase: 'litoral norte' },
  { slug: 'interior-de-sao-paulo', label: 'Interior de São Paulo', frase: 'interior de sao paulo' },
];
/** Municípios de duas regiões de SP bem conhecidas (lista curta, conferida de memória: SUPOSIÇÃO a revisar; não é a divisão oficial do IBGE). */
export const SP_REGIAO_MUNICIPIOS: Record<string, string[]> = {
  'abc-paulista': ['Santo André', 'São Bernardo do Campo', 'São Caetano do Sul', 'Diadema', 'Mauá', 'Ribeirão Pires', 'Rio Grande da Serra'],
  'baixada-santista': ['Santos', 'São Vicente', 'Guarujá', 'Cubatão', 'Praia Grande', 'Bertioga', 'Mongaguá', 'Itanhaém', 'Peruíbe'],
};
export function regiaoSpDoMunicipio(nome: string): string | null {
  const n = norm(nome);
  for (const [slug, lista] of Object.entries(SP_REGIAO_MUNICIPIOS)) if (lista.some((m) => norm(m) === n)) return slug;
  return null;
}

/** As 27 capitais, por nome e UF (códigos IBGE conferidos contra a lista oficial em 20/11/2026). */
export const CAPITAIS: Array<{ nome: string; uf: Uf; ibge_code: number }> = [
  { nome: 'Rio Branco', uf: 'AC', ibge_code: 1200401 }, { nome: 'Maceió', uf: 'AL', ibge_code: 2704302 }, { nome: 'Macapá', uf: 'AP', ibge_code: 1600303 },
  { nome: 'Manaus', uf: 'AM', ibge_code: 1302603 }, { nome: 'Salvador', uf: 'BA', ibge_code: 2927408 }, { nome: 'Fortaleza', uf: 'CE', ibge_code: 2304400 },
  { nome: 'Brasília', uf: 'DF', ibge_code: 5300108 }, { nome: 'Vitória', uf: 'ES', ibge_code: 3205309 }, { nome: 'Goiânia', uf: 'GO', ibge_code: 5208707 },
  { nome: 'São Luís', uf: 'MA', ibge_code: 2111300 }, { nome: 'Cuiabá', uf: 'MT', ibge_code: 5103403 }, { nome: 'Campo Grande', uf: 'MS', ibge_code: 5002704 },
  { nome: 'Belo Horizonte', uf: 'MG', ibge_code: 3106200 }, { nome: 'Belém', uf: 'PA', ibge_code: 1501402 }, { nome: 'João Pessoa', uf: 'PB', ibge_code: 2507507 },
  { nome: 'Curitiba', uf: 'PR', ibge_code: 4106902 }, { nome: 'Recife', uf: 'PE', ibge_code: 2611606 }, { nome: 'Teresina', uf: 'PI', ibge_code: 2211001 },
  { nome: 'Rio de Janeiro', uf: 'RJ', ibge_code: 3304557 }, { nome: 'Natal', uf: 'RN', ibge_code: 2408102 }, { nome: 'Porto Alegre', uf: 'RS', ibge_code: 4314902 },
  { nome: 'Porto Velho', uf: 'RO', ibge_code: 1100205 }, { nome: 'Boa Vista', uf: 'RR', ibge_code: 1400100 }, { nome: 'Florianópolis', uf: 'SC', ibge_code: 4205407 },
  { nome: 'São Paulo', uf: 'SP', ibge_code: 3550308 }, { nome: 'Aracaju', uf: 'SE', ibge_code: 2800308 }, { nome: 'Palmas', uf: 'TO', ibge_code: 1721000 },
];

// ------------------------------------------------------------------------------------------------------------------ IBGE
export interface Municipio { ibge_code: number; nome: string; uf: Uf; regiao: GrandeRegiao; mesorregiao: string | null; regiao_imediata: string | null; populacao: number | null; populacao_ano: number | null }
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Resposta de https://servicodados.ibge.gov.br/api/v1/localidades/municipios -> lista enxuta. Descarta item sem código de 7 dígitos ou com UF desconhecida. */
export function parseIbgeMunicipios(json: unknown): Municipio[] {
  if (!Array.isArray(json)) return [];
  const out: Municipio[] = [];
  for (const raw of json) {
    const m = rec(raw);
    const id = Number(m.id);
    const nome = typeof m.nome === 'string' ? m.nome.trim() : '';
    if (!Number.isInteger(id) || id < 1000000 || id > 5999999 || nome.length < 2) continue;
    const micro = rec(m.microrregiao); const meso = rec(micro.mesorregiao);
    const imediata = rec(m['regiao-imediata']); const inter = rec(imediata['regiao-intermediaria']);
    const ufRec = rec(meso.UF ?? inter.UF);
    const uf = ufRec.sigla;
    if (!isUf(uf)) continue;
    const mesoNome = typeof meso.nome === 'string' ? meso.nome : typeof inter.nome === 'string' ? inter.nome : null;
    const imediataNome = typeof imediata.nome === 'string' ? imediata.nome : typeof micro.nome === 'string' ? micro.nome : null;
    out.push({ ibge_code: id, nome, uf, regiao: UF_REGIAO[uf], mesorregiao: mesoNome, regiao_imediata: imediataNome, populacao: null, populacao_ano: null });
  }
  return out;
}

/** Resposta de .../api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[all] (estimativa de população) -> código -> habitantes. */
export function parseIbgePopulacao(json: unknown): { byCode: Map<number, number>; ano: number | null } {
  const byCode = new Map<number, number>();
  let ano: number | null = null;
  const first = rec(Array.isArray(json) ? json[0] : null);
  const result = rec(Array.isArray(first.resultados) ? first.resultados[0] : null);
  const series = result.series;
  if (!Array.isArray(series)) return { byCode, ano };
  for (const s of series) {
    const sr = rec(s);
    const code = Number(rec(sr.localidade).id);
    const serie = rec(sr.serie);
    const years = Object.keys(serie).map(Number).filter(Number.isInteger).sort((a, b) => b - a);
    if (!years.length || !Number.isInteger(code)) continue;
    const v = Number(serie[String(years[0])]);
    if (!Number.isFinite(v) || v < 0) continue;
    byCode.set(code, Math.round(v));
    if (ano === null || years[0] > ano) ano = years[0];
  }
  return { byCode, ano };
}

export function comPopulacao(lista: Municipio[], pop: { byCode: Map<number, number>; ano: number | null }): Municipio[] {
  return lista.map((m) => (pop.byCode.has(m.ibge_code) ? { ...m, populacao: pop.byCode.get(m.ibge_code)!, populacao_ano: pop.ano } : m));
}

/** Maiores municípios por população (os sem população entram por último, em ordem alfabética). */
export function maioresMunicipios(lista: Array<Pick<Municipio, 'ibge_code' | 'nome' | 'uf' | 'populacao'>>, n: number, uf?: Uf): typeof lista {
  return lista.filter((m) => !uf || m.uf === uf).slice().sort((a, b) => (b.populacao ?? -1) - (a.populacao ?? -1) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, n);
}

// ------------------------------------------------------------------------------------------------------------------ detecção
// Listas LEGAL/AMBIG do analisar.py (validadas) + palavras comuns acrescentadas aqui (COMUNS: SUPOSIÇÃO, não exaustiva).
const LEGAL_EXTRA = 'custodia liberdade saude posse marco penha livramento central para uniao cristal planalto garantia progresso esperanca paz cruzeiro sorriso patrimonio justica lei democracia anchieta vitoria';
const AMBIG = 'registro salto sorriso centro alto bom guarda cruz paz pedra terra barra serra vila mar sao jose maria santo santa paraiso planalto progresso uniao esperanca bela boa novo nova rio ouro campo lagoa ilha porto pilar piracaia crime itu';
const COMUNS = 'paulista paulistano carioca mineiros guarani colorado capital estrela soledade palmeiras brasil sousa lima prado areia brejo tabua';
export const LEGAL: ReadonlySet<string> = new Set(`${AMBIG} ${LEGAL_EXTRA}`.split(' '));
export const COMUNS_SET: ReadonlySet<string> = new Set(COMUNS.split(' '));

export interface GeoIndex { byName: Map<string, Array<Pick<Municipio, 'ibge_code' | 'nome' | 'uf'>>>; size: number }
export function buildGeoIndex(lista: Array<Pick<Municipio, 'ibge_code' | 'nome' | 'uf'>>): GeoIndex {
  const byName = new Map<string, Array<Pick<Municipio, 'ibge_code' | 'nome' | 'uf'>>>();
  for (const m of lista) {
    const k = norm(m.nome);
    if (!k) continue;
    const a = byName.get(k); if (a) a.push(m); else byName.set(k, [m]);
  }
  return { byName, size: lista.length };
}

export type GeoVia = 'segmento' | 'ngrama' | 'prefixo' | 'cidade_de' | 'contexto_uf' | 'texto';
export interface GeoHit { ibge_code: number; nome: string; uf: Uf; via: GeoVia }
export interface GeoDetection { municipios: GeoHit[]; ufs: Uf[]; regioes_sp: string[]; regioes_br: GrandeRegiao[] }
export interface GeoInput { url?: string; title?: string; h1?: string; query?: string }

const UF_SIGLAS_NORM = new Set(UF_LIST.map((u) => u.toLowerCase()));
const PREFIXOS = new Set(['em', 'de', 'do', 'da']);

function ufDeToken(tok: string | undefined, tok2?: string): Uf | null {
  if (!tok) return null;
  if (UF_SIGLAS_NORM.has(tok)) return tok.toUpperCase() as Uf;
  const nome1 = UF_POR_NOME[tok];
  if (nome1) return nome1;
  if (tok2 && UF_POR_NOME[`${tok} ${tok2}`]) return UF_POR_NOME[`${tok} ${tok2}`];
  return null;
}

/** Acha municípios em UM trecho de texto já normalizado (um segmento de URL, um título ou uma consulta). */
function scanSegment(seg: string, idx: GeoIndex, free: boolean, push: (e: Pick<Municipio, 'ibge_code' | 'nome' | 'uf'>, via: GeoVia) => void) {
  if (!seg) return;
  if (idx.byName.has(seg) && !LEGAL.has(seg)) for (const e of idx.byName.get(seg)!) push(e, 'segmento');
  const toks = seg.split(' ');
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + n <= toks.length; i++) {
      const g = toks.slice(i, i + n).join(' ');
      if (idx.byName.has(g) && !LEGAL.has(g)) for (const e of idx.byName.get(g)!) push(e, 'ngrama');
    }
  }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const entries = idx.byName.get(t);
    if (!entries) continue;
    if (!LEGAL.has(t)) {
      if (i >= 1 && PREFIXOS.has(toks[i - 1]) && t.length >= 5) for (const e of entries) push(e, 'prefixo');
      else if (free && t.length >= 6 && !COMUNS_SET.has(t)) for (const e of entries) push(e, 'texto');
      continue;
    }
    // Palavra jurídica/comum: só vira cidade com contexto forte. "cidade de X", "município de X" ou a UF colada depois ("penha sc", "custodia pe").
    const antes2 = toks.slice(Math.max(0, i - 2), i).join(' ');
    if (/^(cidade|municipio) (de|do|da)$/.test(antes2) || (i >= 1 && toks[i - 1] === 'municipio') || (i >= 1 && toks[i - 1] === 'cidade')) { for (const e of entries) push(e, 'cidade_de'); continue; }
    const uf = ufDeToken(toks[i + 1], toks[i + 2]);
    if (uf) for (const e of entries) if (e.uf === uf) push(e, 'contexto_uf');
  }
}

/**
 * Detecta onde o texto fala. URL: segue o analisar.py (nome do município no segmento, em n-gramas de 2 a 4 palavras ou depois de em/de/do/da).
 * Título, H1 e consulta (texto livre): além disso aceita nome de município de 6+ letras solto no texto (via "texto"), exceto palavras comuns.
 */
export function detectGeo(input: GeoInput, idx: GeoIndex): GeoDetection {
  const found = new Map<string, GeoHit>();
  const push = (e: Pick<Municipio, 'ibge_code' | 'nome' | 'uf'>, via: GeoVia) => { if (!found.has(String(e.ibge_code))) found.set(String(e.ibge_code), { ibge_code: e.ibge_code, nome: e.nome, uf: e.uf, via }); };
  let pathNorm = '';
  if (input.url) {
    const path = input.url.replace(/^https?:\/\/[^/]+/i, '');
    pathNorm = norm(path.replace(/-/g, ' ').replace(/\//g, ' '));
    for (const s of path.split('/')) { const seg = norm(s.replace(/-/g, ' ')); if (seg) scanSegment(seg, idx, false, push); }
  }
  const textos = [input.title, input.h1, input.query].map((t) => norm(t)).filter(Boolean);
  for (const t of textos) scanSegment(t, idx, true, push);
  const all = [pathNorm, ...textos].join(' | ');
  const ufs = new Set<Uf>();
  let restante = all; // do nome mais longo ao mais curto, apagando o que já casou: "mato grosso do sul" não conta também como "mato grosso"
  for (const [nome, uf] of Object.entries(UF_POR_NOME).sort((a, b) => b[0].length - a[0].length)) {
    const rx = new RegExp(`\\b${nome}\\b`, 'g');
    if (rx.test(restante)) { ufs.add(uf); restante = restante.replace(rx, ' '); }
  }
  for (const h of found.values()) ufs.add(h.uf);
  const regioes_sp = SP_REGIOES.filter((r) => all.includes(r.frase)).map((r) => r.slug);
  const regioes_br = [...new Set([...ufs].map((u) => UF_REGIAO[u]))];
  for (const r of ['centro oeste', 'nordeste', 'sudeste']) if (new RegExp(`\\b${r}\\b`).test(all)) { const g = r === 'centro oeste' ? 'Centro-Oeste' : r === 'nordeste' ? 'Nordeste' : 'Sudeste'; if (!regioes_br.includes(g)) regioes_br.push(g); }
  return { municipios: [...found.values()], ufs: [...ufs].sort(), regioes_sp, regioes_br };
}
