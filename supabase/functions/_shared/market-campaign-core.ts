/**
 * Planejador de Campanha de Mercado: regras puras (sem rede, sem banco, SEM gastar nada).
 *
 *  - Gera AUTOMATICAMENTE as consultas em português ("advogado criminalista em Guarulhos") cruzando as áreas APROVADAS (e as buscas específicas
 *    geradas por agente de IA) com o escopo geográfico aprovado (bairro, município, região, estado, país/mercado) e com os motores de busca, em 4 fases.
 *    Ninguém escolhe fases, cidades ou motores à mão: o plano sai do que já está aprovado. Só o que CUSTA dinheiro pede aprovação.
 *  - Estima o custo por provedor a partir de uma TABELA DE PREÇOS CONFIGURÁVEL. Nenhum preço é inventado: o padrão é 0 e "não verificado";
 *    enquanto o preço não for verificado, o custo é desconhecido e a tela diz isso (a campanha paga não pode ser aprovada).
 *  - Aplica o teto (budget_cap_cents) e devolve o "ensaio" (dry run): o que caberia.
 *  - Lê resultados de busca JÁ OBTIDOS (CSV/JSON colado pelo cliente: caminho de custo zero) e agrega os concorrentes por área, bairro, município,
 *    região, estado, país e Brasil. Portais, redes sociais e órgãos públicos viram "diretório" (marcados, não descartados).
 *
 * Sem teto fixo de áreas/galhos acompanhados. A quantidade de consultas só é limitada pelo teto de custo (e, ao gravar, por um limite TÉCNICO de linhas por pedido).
 * Nada aqui chama provedor de busca. Executar a campanha é outra etapa, bloqueada pelo bloqueio global de gasto.
 */
import { registrableDomain } from './profile-analyze-core.ts';
import { parseDelimited } from './backlinks-core.ts';
import { ENGINE_PROVIDER, engineKind, isExecutableEngine, isObservationEngine } from './nexus-intelligence.ts';
import { CAPITAIS, UF_LIST, UF_NOME, isUf, maioresMunicipios, norm, type Municipio, type Uf } from './taxonomy-geo.ts';
import type { SegmentPack } from './taxonomy-packs.ts';

// ------------------------------------------------------------------------------------------------------------------ motores
/** Motor padrão quando o projeto ainda não tem conjunto de prompts: o Google (via Serper), o mesmo que o módulo NEXUS usa como padrão. */
export const DEFAULT_ENGINES = ['google_serp'];
/** Mercado no mesmo formato dos conjuntos de prompts do módulo NEXUS: { country: 'pt', language: 'pt-BR', city: 'Lisboa' }. */
export interface Market { country: string; language: string; city?: string }
/**
 * Motores da campanha, derivados das regras dos motores do módulo NEXUS: os motores de BUSCA (SERP) executáveis que o projeto já usa nos
 * conjuntos de prompts. Motores de IA (ChatGPT, Gemini...) respondem em texto e não dão ranking de concorrentes: ficam com o agente e com o Observatório.
 */
export function deriveEngines(sets: Array<{ engines?: unknown }>): string[] {
  const out = new Set<string>();
  for (const s of sets) for (const e of Array.isArray(s.engines) ? s.engines : []) if (isExecutableEngine(e) && engineKind(e) === 'serp') out.add(e);
  return out.size ? [...out].sort() : [...DEFAULT_ENGINES];
}
export const providerOfEngine = (engine: string): string => ENGINE_PROVIDER[engine] || engine;

// ------------------------------------------------------------------------------------------------------------------ preços
export interface PriceEntry { label: string; /** centavos por 1.000 consultas */ price_per_1000_cents: number; currency: string; verified: boolean; note: string; checked_at: string | null }
export type PriceTable = Record<string, PriceEntry>;
export const MANUAL_PROVIDER = 'manual';
export const AUTO_PROVIDER = 'auto';
const NAO_VERIFICADO = 'Preço NÃO verificado: informe o valor da página de preços do provedor e a data da conferência.';
const unverified = (label: string): PriceEntry => ({ label, price_per_1000_cents: 0, currency: 'USD', verified: false, note: NAO_VERIFICADO, checked_at: null });

/** Padrão: tudo zero e não verificado, exceto "manual" (você roda as buscas por fora: o sistema não gasta nada). A chave é o PROVEDOR do motor. */
export const DEFAULT_PRICE_TABLE: PriceTable = {
  serper: unverified('Serper (Google)'), dataforseo: unverified('DataForSEO'), serpapi: unverified('SerpApi'), brave: unverified('Brave Search'),
  [MANUAL_PROVIDER]: { label: 'Importação própria (você roda as buscas)', price_per_1000_cents: 0, currency: 'BRL', verified: true, note: 'Custo zero para o sistema: você traz os resultados já obtidos.', checked_at: null },
};

/** Junta a tabela enviada pelo cliente com o padrão, validando tudo (provedor, inteiro, limites). Valor inválido é ignorado. */
export function normalizePriceTable(input: unknown): PriceTable {
  const out: PriceTable = JSON.parse(JSON.stringify(DEFAULT_PRICE_TABLE));
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(key) || key === MANUAL_PROVIDER || !raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const price = Number(r.price_per_1000_cents);
    if (!Number.isInteger(price) || price < 0 || price > 1_000_000) continue;
    const base = out[key] ?? unverified(key);
    out[key] = {
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 60) : base.label,
      price_per_1000_cents: price,
      currency: typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : base.currency,
      verified: r.verified === true && price > 0,
      note: typeof r.note === 'string' ? r.note.slice(0, 200) : base.note,
      checked_at: typeof r.checked_at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.checked_at) ? r.checked_at.slice(0, 10) : null,
    };
  }
  return out;
}

export interface ProviderCost { queries: number; price_per_1000_cents: number; currency: string; verified: boolean; cents: number | null }
export interface CostInfo {
  /** 'manual' = custo zero; 'auto' = preço do provedor de cada motor */ provider: string; paid: boolean; /** todos os provedores usados têm preço conferido */ verified: boolean;
  pages_per_query: number; currency: string; by_provider: Record<string, ProviderCost>;
}
const clampPages = (p: unknown) => Math.min(10, Math.max(1, Math.round(Number(p)) || 1));
const providerCents = (n: number, price: number, pages: number) => Math.ceil((n * pages * price) / 1000);

/** Custo de uma lista de consultas. `null` em `cents` = desconhecido (preço não verificado); NUNCA zero inventado. */
export function costOf(queries: Array<{ engine: string }>, provider: string, table: PriceTable, pagesPerQuery = 1): { total_cents: number | null; info: CostInfo } {
  const pages = clampPages(pagesPerQuery);
  if (provider === MANUAL_PROVIDER) return { total_cents: 0, info: { provider, paid: false, verified: true, pages_per_query: pages, currency: table[MANUAL_PROVIDER]?.currency ?? 'BRL', by_provider: {} } };
  const count = new Map<string, number>();
  for (const q of queries) { const p = providerOfEngine(q.engine); count.set(p, (count.get(p) ?? 0) + 1); }
  if (!count.size) count.set(providerOfEngine(DEFAULT_ENGINES[0]), 0);
  const by: Record<string, ProviderCost> = {};
  let total: number | null = 0;
  for (const [p, n] of count) {
    const e = table[p];
    const ok = !!e && e.verified && e.price_per_1000_cents > 0;
    by[p] = { queries: n, price_per_1000_cents: e?.price_per_1000_cents ?? 0, currency: e?.currency ?? 'USD', verified: ok, cents: ok ? providerCents(n, e.price_per_1000_cents, pages) : null };
    total = total === null || by[p].cents === null ? null : total + (by[p].cents as number);
  }
  const verified = Object.values(by).every((b) => b.verified);
  return { total_cents: total, info: { provider, paid: true, verified, pages_per_query: pages, currency: Object.values(by)[0]?.currency ?? 'USD', by_provider: by } };
}

// ------------------------------------------------------------------------------------------------------------------ plano
export type Scope = 'brasil' | 'pais' | 'estado' | 'regiao' | 'municipio' | 'bairro';
export type Phase = 1 | 2 | 3 | 4;
export const ALL_PHASES: Phase[] = [1, 2, 3, 4];
export const PHASE_LABEL: Record<Phase, string> = {
  1: 'Fase 1: Brasil, capitais, 50 maiores cidades de SP e todos os lugares do escopo aprovado (bairros, cidades, regiões, estados e países)',
  2: 'Fase 2: 100 maiores cidades do Brasil',
  3: 'Fase 3: estado de SP inteiro nas subáreas centrais',
  4: 'Fase 4: Brasil inteiro, camada básica (áreas matriz)',
};
/** Limite TÉCNICO de linhas gravadas por pedido (o pedido tem prazo). Não é regra de produto: o plano completo sempre é contado e mostrado. */
export const MAX_PERSIST_QUERIES = 20000;
export const MAX_QUERY_CHARS = 300;

export interface PlanNodeIn {
  id: string | null; slug: string; kind: 'matriz' | 'subarea' | 'nicho' | 'cauda'; label: string; parentSlug: string | null; evidenceTotal?: number;
  /** subárea marcada como central pelo dono (se nenhuma for marcada, todas as aprovadas entram na fase 3) */ central?: boolean;
  /** cauda do agente: motores e mercado próprios (o agente define; o sistema só respeita) */ engines?: string[]; country?: string; language?: string;
}
export interface GeoScopeIn { uf: string | null; ibge_code: number | null; municipio: string | null; bairro?: string | null; regiao: string | null; role: string; country?: string | null; language?: string | null }
export interface PlannedQuery {
  query: string; scope: Scope; engine: string; country: string; language: string; uf: Uf | null; ibge_code: number | null; municipio: string | null; bairro: string | null; regiao: string | null;
  phase: Phase; node_slug: string; node_id: string | null;
}
export interface PlanInput {
  nodes: PlanNodeIn[]; pack: SegmentPack | null;
  municipios: Array<Pick<Municipio, 'ibge_code' | 'nome' | 'uf' | 'populacao'>>;
  scope: GeoScopeIn[]; engines?: string[];
  phases?: Phase[]; centralSlugs?: string[]; /** padrão: todos os municípios do IBGE carregados */ phase4Municipios?: number;
  provider: string; priceTable?: PriceTable; pagesPerQuery?: number; budgetCapCents: number;
}
export interface PlanResult {
  queries: PlannedQuery[]; /** o que cabe no teto (ou tudo, quando o custo é zero); `null` quando o custo é desconhecido */ in_budget: PlannedQuery[] | null;
  per_phase: Array<{ phase: Phase; label: string; queries: number; cost_cents: number | null }>;
  total_queries: number; estimated_cost_cents: number | null; cost: CostInfo; engines: string[]; markets: string[];
  cap: { budget_cap_cents: number; cost_known: boolean; fits_queries: number | null; fits_all: boolean | null; max_queries_by_cap: number | null };
  central: string[]; needs_agent: string[]; warnings: string[];
}

const MASC = /^(ABC|Vale|Litoral|Interior|Sudeste|Sul|Norte|Nordeste|Centro-Oeste)\b/;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const isPt = (language: string | null | undefined) => !language || /^pt\b/i.test(language);
const countryName = (cc: string): string => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(cc.toUpperCase()) || cc.toUpperCase(); } catch { return cc.toUpperCase(); } };

/** Base da consulta de um nó: a frase do pacote; sem pacote (ou nó manual), o próprio nome em minúsculas. `null` = não vira consulta de mercado (área transversal). */
export function consultaDoNo(node: PlanNodeIn, pack: SegmentPack | null, byParent: Map<string, PlanNodeIn>): string | null {
  if (node.kind === 'cauda') return node.label; // a cauda já é a busca inteira
  if (node.kind === 'matriz') {
    const m = pack?.matrizes.find((x) => x.label === node.label);
    if (m?.transversal) return null;
    return m?.consulta ?? lc(node.label);
  }
  if (node.kind === 'subarea') {
    const parent = node.parentSlug ? byParent.get(node.parentSlug) : null;
    const rule = pack?.rules.find((r) => r.subarea === node.label && (!parent || r.matriz === parent.label));
    if (rule) return rule.consulta ?? null;
    const base = parent ? consultaDoNo(parent, pack, byParent) : null;
    return base ? `${base} ${lc(node.label)}` : lc(node.label);
  }
  const parent = node.parentSlug ? byParent.get(node.parentSlug) : null;
  const base = parent ? consultaDoNo(parent, pack, byParent) : null;
  return base ? `${base} ${node.label}` : node.label;
}

interface Place { scope: Scope; country: string; language: string; uf: Uf | null; ibge_code: number | null; municipio: string | null; bairro: string | null; regiao: string | null }
function queryText(base: string, p: Place, ambiguous: Set<string>): string {
  if (p.scope === 'brasil') return base;
  if (p.scope === 'pais') return p.municipio ? `${base} em ${p.municipio}` : `${base} em ${countryName(p.country)}`;
  if (p.scope === 'bairro') return `${base} em ${p.bairro}${p.municipio ? `, ${p.municipio}` : ''}`;
  if (p.scope === 'municipio') return `${base} em ${p.municipio}${p.municipio && ambiguous.has(norm(p.municipio)) && p.uf ? ` ${p.uf}` : ''}`;
  if (p.scope === 'estado') return p.uf === 'DF' ? `${base} no Distrito Federal` : `${base} no estado de ${UF_NOME[p.uf as Uf]}`;
  return `${base} ${MASC.test(p.regiao || '') ? 'no' : 'na'} ${p.regiao}`;
}

/**
 * Gera o plano completo. Pura: não chama nada, não grava nada. Tudo é derivado dos nós aprovados, do escopo geográfico aprovado, dos motores e
 * do cache do IBGE; as fases entram todas por padrão. Mercados que não são em português só entram por cauda gerada pelo agente (a tradução é dele).
 */
export function planCampaign(input: PlanInput): PlanResult {
  const warnings: string[] = [];
  const needsAgent: string[] = [];
  const phases = [...new Set(input.phases?.length ? input.phases : ALL_PHASES)].filter((p): p is Phase => ALL_PHASES.includes(p)).sort();
  const engines = [...new Set((input.engines ?? []).filter((e) => typeof e === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(e)))];
  if (!engines.length) engines.push(...DEFAULT_ENGINES);
  const bySlug = new Map(input.nodes.map((n) => [n.slug, n]));
  const matrizes = input.nodes.filter((n) => n.kind === 'matriz');
  const subareas = input.nodes.filter((n) => n.kind === 'subarea');
  const tails = input.nodes.filter((n) => n.kind === 'cauda');
  if (!matrizes.length && !tails.length) warnings.push('Nenhuma área matriz aprovada: aprove áreas na árvore antes de planejar.');
  // subáreas centrais: as marcadas pelo dono; sem marcação, todas as aprovadas (sem limite de quantidade)
  const marked = subareas.filter((s) => s.central);
  const central = input.centralSlugs?.length ? subareas.filter((s) => input.centralSlugs!.includes(s.slug)) : marked.length ? marked : subareas;
  if (phases.includes(3) && !central.length) warnings.push('Fase 3 sem subáreas aprovadas: nada a planejar nela.');

  const munis = input.municipios;
  const hasPop = munis.some((m) => m.populacao !== null);
  if (!munis.length) warnings.push('Os municípios do IBGE ainda não foram carregados: só Brasil, capitais, estados e lugares do escopo entram no plano. Use "Carregar municípios do IBGE".');
  else if (!hasPop) warnings.push('Os municípios estão carregados SEM população: "maiores cidades" não pode ser calculado. Recarregue os municípios do IBGE.');
  const ambiguous = new Set<string>();
  const seenName = new Set<string>();
  for (const m of munis) { const k = norm(m.nome); if (seenName.has(k)) ambiguous.add(k); seenName.add(k); }
  const BR = { country: 'br', language: 'pt-BR' };
  const muniPlace = (m: Pick<Municipio, 'ibge_code' | 'nome' | 'uf'>): Place => ({ scope: 'municipio', ...BR, uf: m.uf as Uf, ibge_code: m.ibge_code, municipio: m.nome, bairro: null, regiao: null });
  const brasil: Place = { scope: 'brasil', ...BR, uf: null, ibge_code: null, municipio: null, bairro: null, regiao: null };
  const estado = (uf: Uf): Place => ({ scope: 'estado', ...BR, uf, ibge_code: null, municipio: null, bairro: null, regiao: null });
  const byCode = new Map(munis.map((m) => [m.ibge_code, m]));

  // lugares do escopo aprovado: bairro, município, região, estado e país/mercado. Entram todos, sem escolha manual.
  const scopePlaces: Place[] = [];
  const marketKeys = new Set<string>(['br|pt-BR|']);
  for (const s of input.scope) {
    const country = (s.country || 'br').toLowerCase(); const language = s.language || 'pt-BR';
    const uf = isUf(s.uf) ? s.uf : null;
    if (country !== 'br') {
      marketKeys.add(`${country}|${language}|${s.municipio ?? ''}`);
      if (!isPt(language)) { needsAgent.push(`${country}:${language}${s.municipio ? `:${s.municipio}` : ''}`); continue; }
      scopePlaces.push({ scope: 'pais', country, language, uf: null, ibge_code: null, municipio: s.municipio, bairro: null, regiao: null });
    } else if (s.bairro && s.municipio) scopePlaces.push({ scope: 'bairro', ...BR, uf, ibge_code: s.ibge_code, municipio: s.municipio, bairro: s.bairro, regiao: null });
    else if (s.ibge_code && byCode.has(s.ibge_code)) scopePlaces.push(muniPlace(byCode.get(s.ibge_code)!));
    else if (s.municipio) scopePlaces.push({ scope: 'municipio', ...BR, uf, ibge_code: s.ibge_code, municipio: s.municipio, bairro: null, regiao: null });
    else if (s.regiao) scopePlaces.push({ scope: 'regiao', ...BR, uf, ibge_code: null, municipio: null, bairro: null, regiao: s.regiao });
    else if (uf) scopePlaces.push(estado(uf));
  }
  const capitais: Place[] = CAPITAIS.map((c) => muniPlace(byCode.get(c.ibge_code) ?? c));
  const top = (n: number, uf?: Uf) => (hasPop ? maioresMunicipios(munis, n, uf).map(muniPlace) : []);
  const spAll = munis.filter((m) => m.uf === 'SP').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(muniPlace);
  const phase4N = input.phase4Municipios === undefined ? munis.length : Math.max(0, Math.round(input.phase4Municipios));

  const placesOf: Record<Phase, Array<{ nodes: PlanNodeIn[]; places: Place[] }>> = {
    1: [{ nodes: matrizes, places: [brasil, ...capitais, ...top(50, 'SP'), ...scopePlaces] }, { nodes: tails, places: [brasil, ...scopePlaces] }],
    2: [{ nodes: matrizes, places: top(100) }],
    3: [{ nodes: central, places: [estado('SP'), ...spAll] }],
    4: [{ nodes: matrizes, places: [...UF_LIST.map(estado), ...top(phase4N)] }],
  };

  const queries: PlannedQuery[] = [];
  const seen = new Set<string>();
  const perPhaseCount: Record<number, number> = {};
  for (const ph of phases) {
    for (const group of placesOf[ph]) {
      for (const node of group.nodes) {
        const base = consultaDoNo(node, input.pack, bySlug);
        if (!base) continue;
        const nodeEngines = node.kind === 'cauda' && node.engines?.length ? node.engines.filter((e) => /^[a-z][a-z0-9_]{1,40}$/.test(e)) : engines;
        // cauda em outro mercado/língua: o agente já escreveu a busca inteira; ela vai só para o mercado dela
        const own: Place[] | null = node.kind === 'cauda' && node.country && (node.country !== 'br' || !isPt(node.language))
          ? [{ scope: 'pais', country: node.country, language: node.language || 'pt-BR', uf: null, ibge_code: null, municipio: null, bairro: null, regiao: null }] : null;
        for (const pl of own ?? group.places) {
          const text = (own ? base : queryText(base, pl, ambiguous)).replace(/\s+/g, ' ').trim();
          const k = norm(text);
          if (!k || text.length < 3 || text.length > MAX_QUERY_CHARS) continue; // 3 a 300 letras: limites do campo no banco, não regra de conteúdo
          for (const engine of nodeEngines) {
            const key = `${engine}|${pl.country}|${pl.language}|${k}`;
            if (seen.has(key)) continue;
            seen.add(key);
            queries.push({ query: text, scope: pl.scope, engine, country: pl.country, language: pl.language, uf: pl.uf, ibge_code: pl.ibge_code, municipio: pl.municipio, bairro: pl.bairro, regiao: pl.regiao, phase: ph, node_slug: node.slug, node_id: node.id });
            perPhaseCount[ph] = (perPhaseCount[ph] ?? 0) + 1;
          }
        }
      }
    }
  }
  if (needsAgent.length) warnings.push(`Mercados em outra língua (${[...new Set(needsAgent)].join(', ')}) precisam de buscas escritas na língua local pelo agente de IA (cauda): não geradas automaticamente.`);

  const table = input.priceTable ?? DEFAULT_PRICE_TABLE;
  const { total_cents, info } = costOf(queries, input.provider, table, input.pagesPerQuery);
  if (info.paid && !info.verified) warnings.push(`O preço de ${Object.entries(info.by_provider).filter(([, b]) => !b.verified).map(([p]) => p).join(', ')} NÃO foi verificado: o custo é desconhecido e a campanha não pode ser aprovada até você informar o preço.`);
  const cap = Math.max(0, Math.round(input.budgetCapCents || 0));
  let in_budget: PlannedQuery[] | null = null;
  let maxByCap: number | null = null;
  if (!info.paid) { in_budget = queries; }
  else if (info.verified) {
    // gulosa em ordem de fase: inclui a consulta enquanto o custo total (arredondado por provedor) couber no teto
    const counts = new Map<string, number>();
    const cents = () => { let t = 0; for (const [p, n] of counts) t += providerCents(n, table[p].price_per_1000_cents, info.pages_per_query); return t; };
    let used = 0;
    for (const q of queries) {
      const p = providerOfEngine(q.engine);
      counts.set(p, (counts.get(p) ?? 0) + 1);
      if (cents() > cap) break;
      used++;
    }
    in_budget = queries.slice(0, used);
    maxByCap = used;
    if (in_budget.length < queries.length) warnings.push(`O teto de ${cap} centavos cobre ${in_budget.length} de ${queries.length} consultas.`);
  }
  if (info.paid && cap === 0) warnings.push('O teto está em 0: nada está autorizado para gastar.');
  const per_phase = phases.map((ph) => ({ phase: ph, label: PHASE_LABEL[ph], queries: perPhaseCount[ph] ?? 0, cost_cents: costOf(queries.filter((q) => q.phase === ph), input.provider, table, input.pagesPerQuery).total_cents }));
  return {
    queries, in_budget, per_phase, total_queries: queries.length, estimated_cost_cents: total_cents, cost: info, engines, markets: [...marketKeys],
    cap: { budget_cap_cents: cap, cost_known: total_cents !== null, fits_queries: in_budget ? in_budget.length : null, fits_all: in_budget ? in_budget.length === queries.length : null, max_queries_by_cap: maxByCap },
    central: central.map((c) => c.slug), needs_agent: [...new Set(needsAgent)], warnings,
  };
}

// ------------------------------------------------------------------------------------------------------------------ concorrentes
/** Portais, redes sociais, enciclopédias e órgãos públicos: aparecem nas buscas, mas não são concorrentes. Marcados como "diretório" (lista configurável). */
export const DEFAULT_NOISE_HOSTS = [
  'facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'wikipedia.org', 'linkedin.com', 'tiktok.com', 'twitter.com', 'x.com', 'pinterest.com', 'reddit.com', 'quora.com',
  'medium.com', 'wordpress.com', 'blogspot.com', 'google.com', 'goo.gl', 'maps.google.com', 'tripadvisor.com.br', 'tripadvisor.com', 'yelp.com', 'apontador.com.br', 'guiamais.com.br',
  'telelistas.net', 'solutudo.com.br', 'reclameaqui.com.br', 'mercadolivre.com.br', 'olx.com.br', 'glassdoor.com.br', 'indeed.com', 'gov.br', 'jus.br', 'leg.br', 'mp.br', 'def.br',
  'jusbrasil.com.br', 'escavador.com',
];
const hostOnly = (url: string): string | null => {
  try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return null; return u.hostname.toLowerCase().replace(/^www\./, '') || null; } catch { return null; }
};
/** Endereço (sem www) de um resultado de busca; `null` se não for http/https. */
export const serpHost = hostOnly;
export const competitorHost = (url: string): string | null => { const h = hostOnly(url); return h ? registrableDomain(h) : null; };
/** `host` (registrável) cai na lista de ruído? Casa o domínio exato ou qualquer subdomínio/sufixo (ex.: tjsp.jus.br casa com "jus.br"). */
export function isNoiseHost(host: string, extra: string[] = []): boolean {
  const h = host.toLowerCase();
  return [...DEFAULT_NOISE_HOSTS, ...extra].some((n) => { const x = n.toLowerCase().replace(/^\./, ''); return h === x || h.endsWith(`.${x}`); });
}

export interface QueryMeta { id: string; query: string; node_slug: string | null; scope: Scope; uf: string | null; municipio: string | null; ibge_code: number | null; regiao: string | null; bairro?: string | null; country?: string | null; engine?: string | null }
export type ResultKind = 'organico' | 'mapa' | 'anuncio' | 'outro';
export interface ResultRow { query_id: string; position: number; url: string; host: string; kind: ResultKind }
export interface CompetitorFilter { area?: string; uf?: string; municipio?: string; regiao?: string; scope?: Scope; bairro?: string; country?: string; engine?: string }
export interface Competitor {
  host: string; kind: 'concorrente' | 'diretorio'; appearances: number; queries: number; avg_position: number | null; best_position: number | null; score: number;
  areas: string[]; kinds: Record<ResultKind, number>;
  locations: { brasil: number; estados: Record<string, number>; regioes: Record<string, number>; municipios: Record<string, number>; bairros?: Record<string, number>; paises?: Record<string, number> };
}
const inArea = (slug: string | null, area: string) => !!slug && (slug === area || slug.startsWith(`${area}/`));

export function passesFilter(q: QueryMeta, f: CompetitorFilter): boolean {
  if (f.scope && q.scope !== f.scope) return false;
  if (f.area && !inArea(q.node_slug, f.area)) return false;
  if (f.uf && q.uf !== f.uf) return false;
  if (f.regiao && q.regiao !== f.regiao) return false;
  if (f.municipio && norm(q.municipio) !== norm(f.municipio)) return false;
  if (f.bairro && norm(q.bairro) !== norm(f.bairro)) return false;
  if (f.country && (q.country || 'br') !== f.country) return false;
  if (f.engine && (q.engine || 'google_serp') !== f.engine) return false;
  return true;
}

/**
 * Resultados de busca -> concorrentes por domínio. Pontuação de presença (heurística nossa, SUPOSIÇÃO): cada aparição orgânica ou no mapa vale
 * 11 menos a posição (mínimo 0): posição 1 = 10 pontos; anúncio não pontua. A posição média considera só resultados orgânicos.
 * O site do próprio projeto não entra na lista (é contado à parte em `own_appearances`).
 */
export function aggregateCompetitors(results: ResultRow[], queries: Map<string, QueryMeta>, opts: { ownHost?: string | null; extraNoise?: string[]; filter?: CompetitorFilter } = {}): { competitors: Competitor[]; own_appearances: number; results_used: number } {
  const own = opts.ownHost ? registrableDomain(opts.ownHost) : null;
  const by = new Map<string, Competitor & { posSum: number; posN: number; qset: Set<string>; aset: Set<string> }>();
  let ownN = 0; let used = 0;
  for (const r of results) {
    const q = queries.get(r.query_id);
    if (!q || (opts.filter && !passesFilter(q, opts.filter))) continue;
    const host = registrableDomain(r.host);
    if (own && host === own) { ownN++; continue; }
    used++;
    const c = by.get(host) ?? { host, kind: isNoiseHost(host, opts.extraNoise) ? 'diretorio' as const : 'concorrente' as const, appearances: 0, queries: 0, avg_position: null, best_position: null, score: 0, areas: [], kinds: { organico: 0, mapa: 0, anuncio: 0, outro: 0 }, locations: { brasil: 0, estados: {}, regioes: {}, municipios: {} }, posSum: 0, posN: 0, qset: new Set<string>(), aset: new Set<string>() };
    c.appearances++; c.kinds[r.kind]++; c.qset.add(r.query_id);
    if (r.kind === 'organico') { c.posSum += r.position; c.posN++; }
    if (r.kind === 'organico' || r.kind === 'mapa') c.score += Math.max(0, 11 - r.position);
    c.best_position = c.best_position === null ? r.position : Math.min(c.best_position, r.position);
    if (q.node_slug) c.aset.add(q.node_slug);
    if (q.scope === 'brasil') c.locations.brasil++;
    if (q.uf) c.locations.estados[q.uf] = (c.locations.estados[q.uf] ?? 0) + 1;
    if (q.regiao) c.locations.regioes[q.regiao] = (c.locations.regioes[q.regiao] ?? 0) + 1;
    if (q.municipio) { const k = `${q.municipio}${q.uf ? `-${q.uf}` : ''}`; c.locations.municipios[k] = (c.locations.municipios[k] ?? 0) + 1; }
    if (q.bairro) { const bs = (c.locations.bairros ??= {}); const k = `${q.bairro}${q.municipio ? ` (${q.municipio})` : ''}`; bs[k] = (bs[k] ?? 0) + 1; }
    if (q.country && q.country !== 'br') { const ps = (c.locations.paises ??= {}); ps[q.country] = (ps[q.country] ?? 0) + 1; }
    by.set(host, c);
  }
  const competitors = [...by.values()].map(({ posSum, posN, qset, aset, ...c }) => ({ ...c, queries: qset.size, areas: [...aset].sort(), avg_position: posN ? Math.round((posSum / posN) * 10) / 10 : null, score: Math.round(c.score * 10) / 10 }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'concorrente' ? -1 : 1) || b.score - a.score || b.appearances - a.appearances || a.host.localeCompare(b.host));
  return { competitors, own_appearances: ownN, results_used: used };
}

// ------------------------------------------------------------------------------------------------------------------ importação dos resultados
export const MAX_SERP_IMPORT_CHARS = 2_000_000;
export const MAX_SERP_IMPORT_ROWS = 20_000;
export interface ImportRow { query: string; position: number; url: string; title: string | null; kind: ResultKind; /** motor de busca da linha (opcional): google_serp, bing_serp... */ engine?: string | null }

const KIND_WORDS: Record<string, ResultKind> = { organic: 'organico', organico: 'organico', natural: 'organico', maps: 'mapa', map: 'mapa', places: 'mapa', local: 'mapa', mapa: 'mapa', ads: 'anuncio', ad: 'anuncio', paid: 'anuncio', anuncio: 'anuncio', patrocinado: 'anuncio' };
const kindOf = (v: unknown, fallback: ResultKind = 'organico'): ResultKind => { const k = norm(v); return !k ? fallback : KIND_WORDS[k] ?? 'outro'; };
const intIn = (v: unknown, lo: number, hi: number): number | null => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const HEADERS: Record<string, string[]> = {
  query: ['consulta', 'query', 'q', 'busca', 'keyword', 'palavra chave', 'termo'],
  position: ['posicao', 'position', 'rank', 'pos', 'colocacao'],
  url: ['url', 'link', 'endereco', 'pagina', 'site'],
  title: ['titulo', 'title'],
  kind: ['tipo', 'type', 'kind', 'origem'],
  engine: ['motor', 'engine', 'buscador'],
};

function fromCsv(text: string): { rows: ImportRow[]; invalid: number } | { error: string } {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') ? '\t' : ',';
  const grid = parseDelimited(text, delim).filter((r) => r.some((c) => c.trim()));
  if (grid.length < 2) return { error: 'import_empty' };
  const head = grid[0].map((h) => norm(h));
  const col = Object.fromEntries(Object.entries(HEADERS).map(([k, names]) => [k, head.findIndex((h) => names.includes(h))])) as Record<string, number>;
  if (col.query < 0 || col.url < 0) return { error: 'import_header_required' };
  const rows: ImportRow[] = []; let invalid = 0;
  const counter = new Map<string, number>();
  for (const r of grid.slice(1)) {
    const query = str(r[col.query], MAX_QUERY_CHARS); const url = str(r[col.url], 1000);
    if (!query || !hostOnly(url)) { invalid++; continue; }
    const n = (counter.get(norm(query)) ?? 0) + 1; counter.set(norm(query), n);
    const position = col.position >= 0 ? intIn(r[col.position], 1, 200) : n;
    if (position === null) { invalid++; continue; }
    const engine = col.engine >= 0 ? str(r[col.engine], 40).toLowerCase() : '';
    rows.push({ query, position, url, title: col.title >= 0 ? str(r[col.title], 300) || null : null, kind: col.kind >= 0 ? kindOf(r[col.kind]) : 'organico', ...(isObservationEngine(engine) ? { engine } : {}) });
  }
  return { rows, invalid };
}

function fromJson(data: unknown): { rows: ImportRow[]; invalid: number } | { error: string } {
  const root = data && typeof data === 'object' && !Array.isArray(data) ? ((data as Record<string, unknown>).queries ?? (data as Record<string, unknown>).results ?? (data as Record<string, unknown>).resultados ?? [data]) : data;
  if (!Array.isArray(root)) return { error: 'import_format' };
  const rows: ImportRow[] = []; let invalid = 0;
  const pushList = (query: string, list: unknown, kind: ResultKind, eng: { engine?: string }) => {
    if (!Array.isArray(list)) return;
    list.forEach((it, i) => {
      const o = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
      const url = str(o.link ?? o.url ?? o.website ?? o.endereco, 1000);
      const position = intIn(o.position ?? o.posicao ?? o.rank, 1, 200) ?? (i + 1 <= 200 ? i + 1 : null);
      if (!url || !hostOnly(url) || position === null) { invalid++; return; }
      rows.push({ query, position, url, title: str(o.title ?? o.titulo, 300) || null, kind: o.type || o.tipo || o.kind ? kindOf(o.type ?? o.tipo ?? o.kind, kind) : kind, ...eng });
    });
  };
  for (const item of root) {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!o) { invalid++; continue; }
    const sp = o.searchParameters && typeof o.searchParameters === 'object' ? (o.searchParameters as Record<string, unknown>) : {};
    const query = str(o.query ?? o.consulta ?? o.q ?? sp.q, MAX_QUERY_CHARS);
    const engRaw = str(o.engine ?? o.motor ?? sp.engine, 40).toLowerCase();
    const eng = isObservationEngine(engRaw) ? { engine: engRaw } : {};
    const lists = ['organic', 'organico', 'results', 'resultados', 'items', 'places', 'maps', 'mapa', 'ads', 'anuncios'].filter((k) => Array.isArray(o[k]));
    if (lists.length) {
      if (!query) { invalid++; continue; }
      for (const k of lists) pushList(query, o[k], k === 'places' || k === 'maps' || k === 'mapa' ? 'mapa' : k === 'ads' || k === 'anuncios' ? 'anuncio' : 'organico', eng);
    } else {
      const url = str(o.link ?? o.url, 1000); const position = intIn(o.position ?? o.posicao ?? o.rank, 1, 200);
      if (!query || !hostOnly(url) || position === null) { invalid++; continue; }
      rows.push({ query, position, url, title: str(o.title ?? o.titulo, 300) || null, kind: kindOf(o.type ?? o.tipo ?? o.kind), ...eng });
    }
  }
  return { rows, invalid };
}

/** Texto colado/arquivo (JSON ou CSV/TSV com cabeçalho) -> linhas de resultado. Aceita o formato do Serper (organic/places/ads) e planilhas simples. */
export function parseSerpImport(text: unknown): { rows: ImportRow[]; invalid: number; truncated: boolean; duplicates: number } | { error: string } {
  if (typeof text !== 'string' || !text.trim()) return { error: 'import_empty' };
  if (text.length > MAX_SERP_IMPORT_CHARS) return { error: 'import_too_large' };
  const t = text.trim();
  let parsed: { rows: ImportRow[]; invalid: number } | { error: string };
  if (t.startsWith('[') || t.startsWith('{')) { try { parsed = fromJson(JSON.parse(t)); } catch { return { error: 'import_format' }; } }
  else parsed = fromCsv(t);
  if ('error' in parsed) return parsed;
  const seen = new Set<string>(); const rows: ImportRow[] = []; let duplicates = 0;
  for (const r of parsed.rows) {
    const k = `${r.engine ?? ''}|${norm(r.query)}|${r.kind}|${r.position}`;
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k); rows.push(r);
  }
  const truncated = rows.length > MAX_SERP_IMPORT_ROWS;
  return { rows: truncated ? rows.slice(0, MAX_SERP_IMPORT_ROWS) : rows, invalid: parsed.invalid, truncated, duplicates };
}

