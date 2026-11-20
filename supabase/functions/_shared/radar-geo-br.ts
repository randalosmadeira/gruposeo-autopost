/**
 * Pacote de território do Brasil (OPCIONAL; o núcleo do Radar não depende dele).
 *
 *  - leitores das respostas do IBGE (API pública de localidades, sem chave): distritos, regiões metropolitanas, regiões imediatas e intermediárias;
 *  - zonas informais de São Paulo capital (Zona Leste/Norte/Sul/Oeste/Centro) agrupando os 96 distritos oficiais. É INFERÊNCIA (o IBGE não define "zona"):
 *    sempre marcada como `inferred` e editável pela pessoa na tela;
 *  - conversão das linhas já guardadas em `ibge_municipios` (módulo de taxonomia) em lugares do Radar.
 * Bairros NÃO existem nas localidades do IBGE: vêm do OpenStreetMap (radar-geo-core: place=suburb/neighbourhood) com licença ODbL e atribuição.
 * Alternativas documentadas (não ligadas): BrasilAPI (CEP), Censo 2022 (setores/bairros) quando o arquivo estiver acessível.
 * NÃO verificado ao vivo nesta sessão: o formato exato de /localidades/regioes-metropolitanas (os leitores abaixo são tolerantes e os testes usam respostas gravadas).
 */
import { normName, type GeoPack, type MemberDraft, type PlaceDraft } from './radar-geo-core.ts';

export const BR_PACK: GeoPack = { id: 'br', country: 'br', label: 'Brasil (IBGE, zonas de São Paulo, OpenStreetMap)', description: 'Estados, municípios, distritos, regiões metropolitanas/imediatas do IBGE e zonas informais de São Paulo capital.' };
export const IBGE_LICENSE = 'Dados abertos do IBGE';
export const IBGE_ATTRIBUTION = 'IBGE, Serviço de Dados (API de localidades)';
export const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';
export const ibgeDistritosUrl = (municipioId: number) => `${IBGE_BASE}/municipios/${Math.round(municipioId)}/distritos`;
export const IBGE_METRO_URL = `${IBGE_BASE}/regioes-metropolitanas`;
export const IBGE_MUNICIPIOS_URL = `${IBGE_BASE}/municipios`;

export const BR_UF_CODE = (uf: string) => `br:uf:${uf.toUpperCase()}`;
export const BR_COUNTRY_CODE = 'br';

// ------------------------------------------------------------------------------------------------------------------ leitores do IBGE
export interface IbgeDistrito { id: number; nome: string; municipioId: number }
export function parseIbgeDistritos(json: unknown): IbgeDistrito[] {
  if (!Array.isArray(json)) return [];
  const out: IbgeDistrito[] = [];
  for (const d of json as Array<Record<string, unknown>>) {
    const id = Number(d?.id); const nome = typeof d?.nome === 'string' ? d.nome.trim() : '';
    const m = (d?.municipio && typeof d.municipio === 'object' ? d.municipio : {}) as Record<string, unknown>;
    const municipioId = Number(m.id);
    if (Number.isInteger(id) && id > 0 && nome && Number.isInteger(municipioId)) out.push({ id, nome: nome.slice(0, 160), municipioId });
  }
  return out;
}

export interface IbgeRegiao { id: string; nome: string; kind: 'metropolitana' | 'imediata' | 'intermediaria'; uf: string | null; municipioIds: number[] }
/** Regiões metropolitanas: tolera `municipios` como lista de objetos ({id}) ou de números; UF vem de `UF-id`/`UF`/`uf` quando existir. */
export function parseIbgeRegioesMetropolitanas(json: unknown): IbgeRegiao[] {
  if (!Array.isArray(json)) return [];
  const out: IbgeRegiao[] = [];
  for (const r of json as Array<Record<string, unknown>>) {
    const id = String(r?.id ?? '').trim(); const nome = typeof r?.nome === 'string' ? r.nome.trim() : '';
    if (!id || !nome) continue;
    const ms = Array.isArray(r.municipios) ? r.municipios as unknown[] : [];
    const municipioIds = ms.map((m) => Number(typeof m === 'object' && m ? (m as Record<string, unknown>).id : m)).filter((n) => Number.isInteger(n) && n > 0);
    const ufRaw = (r.UF ?? r.uf ?? (r['UF-id'] as unknown)) as unknown;
    const ufSigla = ufRaw && typeof ufRaw === 'object' ? (ufRaw as Record<string, unknown>).sigla : ufRaw;
    out.push({ id, nome: nome.slice(0, 160), kind: 'metropolitana', uf: typeof ufSigla === 'string' && /^[A-Za-z]{2}$/.test(ufSigla) ? ufSigla.toUpperCase() : null, municipioIds });
  }
  return out;
}

/** Filtra regiões pelo nome com acento normalizado ("sao paulo" acha "Região Metropolitana de São Paulo"). */
export function filterRegioesByName(list: IbgeRegiao[], wanted: string): IbgeRegiao[] {
  const w = normName(wanted);
  if (!w) return [];
  return list.filter((r) => normName(r.nome).split(' ').join(' ').includes(w));
}

/** Regiões imediata e intermediária a partir do mesmo JSON de /municipios (campo "regiao-imediata"). */
export function parseIbgeHierarquia(json: unknown): IbgeRegiao[] {
  if (!Array.isArray(json)) return [];
  const imediata = new Map<string, IbgeRegiao>(); const intermediaria = new Map<string, IbgeRegiao>();
  for (const m of json as Array<Record<string, unknown>>) {
    const mid = Number(m?.id);
    if (!Number.isInteger(mid)) continue;
    const ri = (m['regiao-imediata'] && typeof m['regiao-imediata'] === 'object' ? m['regiao-imediata'] : null) as Record<string, unknown> | null;
    if (!ri) continue;
    const uf = (((ri['regiao-intermediaria'] as Record<string, unknown> | undefined)?.UF as Record<string, unknown> | undefined)?.sigla) as unknown;
    const ufSigla = typeof uf === 'string' ? uf.toUpperCase() : null;
    const put = (map: Map<string, IbgeRegiao>, key: unknown, nome: unknown, kind: IbgeRegiao['kind']) => {
      const id = String(key ?? ''); if (!id || typeof nome !== 'string') return;
      const cur = map.get(id) ?? { id, nome: nome.trim().slice(0, 160), kind, uf: ufSigla, municipioIds: [] };
      cur.municipioIds.push(mid); map.set(id, cur);
    };
    put(imediata, ri.id, ri.nome, 'imediata');
    const rint = (ri['regiao-intermediaria'] && typeof ri['regiao-intermediaria'] === 'object' ? ri['regiao-intermediaria'] : null) as Record<string, unknown> | null;
    if (rint) put(intermediaria, rint.id, rint.nome, 'intermediaria');
  }
  return [...imediata.values(), ...intermediaria.values()];
}

// ------------------------------------------------------------------------------------------------------------------ zonas informais de São Paulo capital
export const SP_CAPITAL_IBGE_ID = 3550308;
export const ZONE_NOTE = 'Zona é um agrupamento informal (não existe no IBGE): montado a partir das subprefeituras e dos 96 distritos. Confira e edite.';
/** Subprefeitura -> distritos (96 no total) e a zona informal em que costuma ser classificada. */
export const SP_SUBPREFEITURAS: Array<{ nome: string; zona: 'Zona Leste' | 'Zona Norte' | 'Zona Sul' | 'Zona Oeste' | 'Centro'; distritos: string[] }> = [
  { nome: 'Aricanduva/Formosa/Carrão', zona: 'Zona Leste', distritos: ['Aricanduva', 'Carrão', 'Vila Formosa'] },
  { nome: 'Butantã', zona: 'Zona Oeste', distritos: ['Butantã', 'Morumbi', 'Raposo Tavares', 'Rio Pequeno', 'Vila Sônia'] },
  { nome: 'Campo Limpo', zona: 'Zona Sul', distritos: ['Campo Limpo', 'Capão Redondo', 'Vila Andrade'] },
  { nome: 'Capela do Socorro', zona: 'Zona Sul', distritos: ['Cidade Dutra', 'Grajaú', 'Socorro'] },
  { nome: 'Casa Verde', zona: 'Zona Norte', distritos: ['Casa Verde', 'Cachoeirinha', 'Limão'] },
  { nome: 'Cidade Ademar', zona: 'Zona Sul', distritos: ['Cidade Ademar', 'Pedreira'] },
  { nome: 'Cidade Tiradentes', zona: 'Zona Leste', distritos: ['Cidade Tiradentes'] },
  { nome: 'Ermelino Matarazzo', zona: 'Zona Leste', distritos: ['Ermelino Matarazzo', 'Ponte Rasa'] },
  { nome: 'Freguesia/Brasilândia', zona: 'Zona Norte', distritos: ['Freguesia do Ó', 'Brasilândia'] },
  { nome: 'Guaianases', zona: 'Zona Leste', distritos: ['Guaianases', 'Lajeado'] },
  { nome: 'Ipiranga', zona: 'Zona Sul', distritos: ['Ipiranga', 'Cursino', 'Sacomã'] },
  { nome: 'Itaim Paulista', zona: 'Zona Leste', distritos: ['Itaim Paulista', 'Vila Curuçá'] },
  { nome: 'Itaquera', zona: 'Zona Leste', distritos: ['Itaquera', 'Cidade Líder', 'José Bonifácio', 'Parque do Carmo'] },
  { nome: 'Jabaquara', zona: 'Zona Sul', distritos: ['Jabaquara'] },
  { nome: 'Jaçanã/Tremembé', zona: 'Zona Norte', distritos: ['Jaçanã', 'Tremembé'] },
  { nome: 'Lapa', zona: 'Zona Oeste', distritos: ['Lapa', 'Barra Funda', 'Jaguara', 'Jaguaré', 'Perdizes', 'Vila Leopoldina'] },
  { nome: "M'Boi Mirim", zona: 'Zona Sul', distritos: ['Jardim Ângela', 'Jardim São Luís'] },
  { nome: 'Mooca', zona: 'Zona Leste', distritos: ['Mooca', 'Água Rasa', 'Belém', 'Brás', 'Pari', 'Tatuapé'] },
  { nome: 'Parelheiros', zona: 'Zona Sul', distritos: ['Parelheiros', 'Marsilac'] },
  { nome: 'Penha', zona: 'Zona Leste', distritos: ['Penha', 'Artur Alvim', 'Cangaíba', 'Vila Matilde'] },
  { nome: 'Perus', zona: 'Zona Norte', distritos: ['Perus', 'Anhanguera'] },
  { nome: 'Pinheiros', zona: 'Zona Oeste', distritos: ['Pinheiros', 'Alto de Pinheiros', 'Itaim Bibi', 'Jardim Paulista'] },
  { nome: 'Pirituba/Jaraguá', zona: 'Zona Norte', distritos: ['Pirituba', 'Jaraguá', 'São Domingos'] },
  { nome: 'Santana/Tucuruvi', zona: 'Zona Norte', distritos: ['Santana', 'Mandaqui', 'Tucuruvi'] },
  { nome: 'Santo Amaro', zona: 'Zona Sul', distritos: ['Santo Amaro', 'Campo Belo', 'Campo Grande'] },
  { nome: 'São Mateus', zona: 'Zona Leste', distritos: ['São Mateus', 'São Rafael', 'Iguatemi'] },
  { nome: 'São Miguel', zona: 'Zona Leste', distritos: ['São Miguel', 'Jardim Helena', 'Vila Jacuí'] },
  { nome: 'Sapopemba', zona: 'Zona Leste', distritos: ['Sapopemba'] },
  { nome: 'Sé', zona: 'Centro', distritos: ['Sé', 'Bela Vista', 'Bom Retiro', 'Cambuci', 'Consolação', 'Liberdade', 'República', 'Santa Cecília'] },
  { nome: 'Vila Maria/Vila Guilherme', zona: 'Zona Norte', distritos: ['Vila Maria', 'Vila Guilherme', 'Vila Medeiros'] },
  { nome: 'Vila Mariana', zona: 'Zona Sul', distritos: ['Vila Mariana', 'Moema', 'Saúde'] },
  { nome: 'Vila Prudente', zona: 'Zona Leste', distritos: ['Vila Prudente', 'São Lucas'] },
];
export const SP_ZONES = ['Zona Leste', 'Zona Norte', 'Zona Sul', 'Zona Oeste', 'Centro'] as const;

export const spDistritoCode = (nome: string) => `br:sp-capital:distrito:${normName(nome).replace(/ /g, '-')}`;
export const spZonaCode = (zona: string) => `br:sp-capital:zona:${normName(zona).replace(/ /g, '-')}`;

/** Pacote "São Paulo capital": zonas (inferidas) e a pertinência dos distritos. Os distritos oficiais (IBGE) são ligados pelo NOME normalizado quando já existem no banco. */
export function spCapitalZonePack(): { places: PlaceDraft[]; members: MemberDraft[] } {
  const places: PlaceDraft[] = []; const members: MemberDraft[] = [];
  const cityRef = { level: 'municipio' as const, code: `ibge:${SP_CAPITAL_IBGE_ID}` };
  for (const z of SP_ZONES) places.push({ level: 'zona', code: spZonaCode(z), name: z === 'Centro' ? 'Centro' : z, country: 'br', parent: cityRef, source: 'pacote', license: 'Pacote do Zica (inferência editável)', inferred: true, meta: { note: ZONE_NOTE, city: 'São Paulo' } });
  for (const sub of SP_SUBPREFEITURAS) {
    for (const d of sub.distritos) {
      members.push({ group: { level: 'zona', code: spZonaCode(sub.zona) }, member: { level: 'distrito', code: spDistritoCode(d) }, relation: 'zona', inferred: true });
    }
  }
  return { places, members };
}
/** Distritos do pacote como lugares (usados quando o IBGE ainda não foi lido; o código oficial os substitui depois). */
export function spCapitalDistritoDrafts(): PlaceDraft[] {
  const out: PlaceDraft[] = [];
  for (const sub of SP_SUBPREFEITURAS) for (const d of sub.distritos) out.push({ level: 'distrito', code: spDistritoCode(d), name: d, country: 'br', parent: { level: 'municipio', code: `ibge:${SP_CAPITAL_IBGE_ID}` }, source: 'pacote', license: 'Pacote do Zica', inferred: false, meta: { subprefeitura: sub.nome } });
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ conversões
export interface IbgeMunicipioRow { ibge_code: number; nome: string; uf: string; regiao?: string | null; regiao_imediata?: string | null; populacao: number | null }
/** Estados e municípios (linhas de `ibge_municipios`) como lugares. O estado vira o pai do município. */
export function placesFromIbgeRows(rows: IbgeMunicipioRow[]): PlaceDraft[] {
  const out: PlaceDraft[] = [{ level: 'pais', code: BR_COUNTRY_CODE, name: 'Brasil', country: 'br', source: 'ibge', license: IBGE_LICENSE, attribution: IBGE_ATTRIBUTION }];
  const ufs = new Set<string>();
  for (const r of rows) {
    if (!r.uf || ufs.has(r.uf)) continue;
    ufs.add(r.uf);
    out.push({ level: 'uf', code: BR_UF_CODE(r.uf), name: r.uf, country: 'br', parent: { level: 'pais', code: BR_COUNTRY_CODE }, source: 'ibge', license: IBGE_LICENSE, attribution: IBGE_ATTRIBUTION, meta: { abbr: r.uf } });
  }
  for (const r of rows) out.push({ level: 'municipio', code: `ibge:${r.ibge_code}`, name: r.nome, country: 'br', parent: { level: 'uf', code: BR_UF_CODE(r.uf) }, population: r.populacao ?? null, source: 'ibge', license: IBGE_LICENSE, attribution: IBGE_ATTRIBUTION, meta: { uf: r.uf, ibge_code: r.ibge_code } });
  return out;
}
export function distritoDrafts(ds: IbgeDistrito[]): PlaceDraft[] {
  return ds.map((d) => ({ level: 'distrito' as const, code: `ibge:${d.id}`, name: d.nome, country: 'br', parent: { level: 'municipio' as const, code: `ibge:${d.municipioId}` }, source: 'ibge' as const, license: IBGE_LICENSE, attribution: IBGE_ATTRIBUTION }));
}
export function regiaoDrafts(rs: IbgeRegiao[]): { places: PlaceDraft[]; members: MemberDraft[] } {
  const places: PlaceDraft[] = []; const members: MemberDraft[] = [];
  const rel = { metropolitana: 'regiao_metropolitana', imediata: 'regiao_imediata', intermediaria: 'regiao_intermediaria' } as const;
  for (const r of rs) {
    const code = `ibge:${r.kind}:${r.id}`;
    places.push({ level: 'regiao', code, name: r.nome, country: 'br', parent: r.uf ? { level: 'uf', code: BR_UF_CODE(r.uf) } : null, source: 'ibge', license: IBGE_LICENSE, attribution: IBGE_ATTRIBUTION, meta: { kind: r.kind } });
    for (const mid of r.municipioIds) members.push({ group: { level: 'regiao', code }, member: { level: 'municipio', code: `ibge:${mid}` }, relation: rel[r.kind] });
  }
  return { places, members };
}
