/**
 * Regras do Estúdio de Páginas: cada portão tem um NÍVEL ('exigir' | 'recomendar' | 'desligado') e, quando faz sentido, um valor.
 *
 * Mesmo princípio do perfil de regras dos artigos (optimization-rules.ts, que é REAPROVEITADO e não duplicado): tamanho e mínimos NÃO são fixos
 * no sistema. Os números abaixo são PADRÕES EDITÁVEIS (`source: 'padrao_editavel'`). Camadas, da mais fraca para a mais forte:
 *   1. padrão editável (este arquivo, por tipo de página)
 *   2. projeto       projects.editorial_identity.optimization_rules (as regras compartilhadas) e .studio_rules (as do Estúdio)
 *   3. prompt        bloco "[estudio] chave=valor" no texto do prompt/agente do projeto, e as frases já reconhecidas por parsePromptDirectives
 * Quem define tamanho, profundidade e rigor é o agente do projeto; nada aqui é lei do sistema.
 */
import { resolveRuleProfile, type RuleInputs, type RuleLevel, type RuleProfile, type RuleSource } from './optimization-rules.ts';
import type { PageType } from './studio-types.ts';

export const GATE_IDS = [
  'html_semantic', 'title_unique', 'meta_description', 'canonical', 'hreflang', 'open_graph', 'robots', 'schema_graph', 'breadcrumb', 'faq_schema',
  'sitemap_entry', 'internal_links', 'external_links', 'aeo_blocks', 'geo_entity', 'eeat_author', 'accessibility', 'perf_budget', 'cta_tracking',
  'nap_consistency', 'compliance', 'ai_patterns', 'unique_content', 'doorway', 'local_facts', 'no_invention', 'no_residue', 'images', 'words',
] as const;
export type GateId = (typeof GATE_IDS)[number];

export const GATE_LABELS: Record<GateId, string> = {
  html_semantic: 'HTML semântico (um H1, hierarquia, marcos, tabelas reais)', title_unique: 'Título único e do tamanho certo', meta_description: 'Meta descrição única',
  canonical: 'URL canônica', hreflang: 'hreflang e x-default', open_graph: 'Open Graph e cartão do X', robots: 'Indexável (robots)', schema_graph: 'Schema em um grafo único, sem duplicar plugin',
  breadcrumb: 'Trilha de navegação (breadcrumb)', faq_schema: 'FAQPage só com FAQ real (informativo)', sitemap_entry: 'Entrada no sitemap com data real', internal_links: 'Links internos (sem página órfã)',
  external_links: 'Fontes oficiais e páginas de referência verificadas', aeo_blocks: 'Resposta direta e perguntas reais (AEO)', geo_entity: 'Entidade clara e fatos citáveis (GEO e AIO)',
  eeat_author: 'Autor real com credenciais (E-E-A-T)', accessibility: 'Acessibilidade', perf_budget: 'Orçamento de desempenho', cta_tracking: 'Chamada para ação e rastreio',
  nap_consistency: 'Telefone, endereço e horário iguais ao Perfil', compliance: 'Conformidade do segmento (aviso)', ai_patterns: 'Sem "cara de IA"', unique_content: 'Texto próprio, diferente das páginas irmãs',
  doorway: 'Sem páginas de porta (texto repetido por bairro ou cidade)', local_facts: 'Fatos locais reais e aprovados', no_invention: 'Nada inventado (números, nomes e fontes têm origem)', no_residue: 'Sem resíduo de prompt, placeholder ou markdown cru',
  images: 'Imagens com alt, tamanho e formato moderno', words: 'Quantidade de palavras',
};

export interface StudioRule { level: RuleLevel; value?: number; max?: number; source: RuleSource }
const P: RuleSource = 'padrao_editavel';
const r = (level: RuleLevel, value?: number, max?: number): StudioRule => ({ level, ...(value !== undefined ? { value } : {}), ...(max !== undefined ? { max } : {}), source: P });

/** PADRÕES EDITÁVEIS (valem enquanto ninguém disser outra coisa). Cada número é um ponto de partida, não uma regra do sistema. */
export const DEFAULT_GATES: Record<GateId, StudioRule> = {
  html_semantic: r('exigir'), title_unique: r('exigir', 35, 70), meta_description: r('exigir', 110, 170), canonical: r('exigir'), hreflang: r('recomendar'), open_graph: r('recomendar'),
  robots: r('exigir'), schema_graph: r('exigir'), breadcrumb: r('exigir'), faq_schema: r('recomendar'), sitemap_entry: r('exigir'),
  internal_links: r('exigir', 3), external_links: r('recomendar', 1), aeo_blocks: r('recomendar'), geo_entity: r('recomendar'), eeat_author: r('recomendar'),
  accessibility: r('exigir'), perf_budget: r('recomendar', 120, 450), cta_tracking: r('recomendar'), nap_consistency: r('exigir'), compliance: r('recomendar'),
  // detector de "cara de IA": nota máxima aceita (0 = humano, 100 = cheio de tique de IA). Padrão editável.
  ai_patterns: r('exigir', 35),
  // texto próprio: % mínimo do texto que NÃO se repete em páginas irmãs do mesmo modelo (a auditoria da RDM achou 29% a 45% em cidades).
  unique_content: r('exigir', 60), doorway: r('exigir', 70), local_facts: r('exigir', 3), no_invention: r('exigir'), no_residue: r('exigir'), images: r('recomendar'), words: r('recomendar', 500),
};

/** Palavras mínimas por tipo (padrão editável; o prompt do agente do projeto substitui). */
export const DEFAULT_WORDS: Record<PageType, number> = { pagina: 400, landing: 350, hub: 450, servico: 600, local: 600, guia: 900, comparativo: 800 };

export interface StudioOptions {
  /** páginas novas por lote (trava contra páginas finas em massa) */
  batch_limit: number;
  /** publicações por dia */
  daily_publish_limit: number;
  require_distinct_approver: boolean;
  /** passos de IA por geração e tokens por passo (herdados do perfil dos artigos quando o projeto os define) */
  max_ai_steps: number;
  step_max_tokens: number;
  /** quantas páginas do topo entram no benchmark do Briefing de Superação */
  benchmark_top_n: number;
  /** passos de reescrita do detector de IA (cada um conta nos passos de IA) */
  rewrite_rounds: number;
}
export const DEFAULT_OPTIONS: StudioOptions = { batch_limit: 5, daily_publish_limit: 10, require_distinct_approver: false, max_ai_steps: 8, step_max_tokens: 1400, benchmark_top_n: 10, rewrite_rounds: 2 };
export const BATCH_LIMIT_HARD = 200;

export interface StudioRules {
  version: 1;
  type: PageType;
  /** perfil compartilhado dos artigos (SEO, GEO, AEO, AIO) já resolvido: palavras, links, FAQ, pacote de conformidade... */
  base: RuleProfile;
  gates: Record<GateId, StudioRule>;
  options: StudioOptions;
  layers: RuleSource[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | undefined => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : undefined; };
const asLevel = (v: unknown): RuleLevel | undefined => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (['exigir', 'exigido', 'obrigatorio', 'obrigatório'].includes(t)) return 'exigir';
  if (['recomendar', 'recomendado', 'sugerir'].includes(t)) return 'recomendar';
  if (['desligado', 'desligar', 'off', 'nenhum', 'ignorar'].includes(t)) return 'desligado';
  return undefined;
};
const GATE_ALIASES: Record<string, GateId> = {
  palavras: 'words', words: 'words', cara_de_ia: 'ai_patterns', ia: 'ai_patterns', ai: 'ai_patterns', texto_proprio: 'unique_content', unico: 'unique_content', portas: 'doorway', doorway: 'doorway',
  fatos_locais: 'local_facts', links_internos: 'internal_links', links_externos: 'external_links', fontes: 'external_links', desempenho: 'perf_budget', schema: 'schema_graph', trilha: 'breadcrumb',
  autor: 'eeat_author', imagens: 'images', conformidade: 'compliance', nap: 'nap_consistency', contato: 'nap_consistency', sitemap: 'sitemap_entry', robots: 'robots', canonical: 'canonical',
};
const OPTION_ALIASES: Record<string, keyof StudioOptions> = {
  lote: 'batch_limit', batch_limit: 'batch_limit', limite_do_lote: 'batch_limit', publicacoes_por_dia: 'daily_publish_limit', daily_publish_limit: 'daily_publish_limit',
  aprovador_distinto: 'require_distinct_approver', require_distinct_approver: 'require_distinct_approver', passos_ia: 'max_ai_steps', max_ai_steps: 'max_ai_steps',
  tokens_por_passo: 'step_max_tokens', step_max_tokens: 'step_max_tokens', benchmark: 'benchmark_top_n', benchmark_top_n: 'benchmark_top_n', reescritas: 'rewrite_rounds', rewrite_rounds: 'rewrite_rounds',
};
const norm = (k: string) => k.trim().toLowerCase().replace(/\s+/g, '_');
const gateId = (k: string): GateId | undefined => { const n = norm(k); return GATE_ALIASES[n] ?? ((GATE_IDS as readonly string[]).includes(n) ? (n as GateId) : undefined); };

function applyGate(rules: StudioRules, id: GateId, raw: unknown, source: RuleSource): boolean {
  const cur = rules.gates[id];
  let { level, value, max } = cur;
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'boolean') level = raw ? (cur.level === 'desligado' ? 'recomendar' : cur.level) : 'desligado';
  else if (typeof raw === 'number' || (typeof raw === 'string' && num(raw) !== undefined && !asLevel(raw))) { const v = num(raw); if (v === undefined) return false; value = v; if (level === 'desligado') level = 'recomendar'; }
  else if (typeof raw === 'string') { const l = asLevel(raw); if (!l) return false; level = l; }
  else if (isObj(raw)) { const l = asLevel(raw.level ?? raw.nivel); if (l) level = l; const v = num(raw.value ?? raw.valor ?? raw.min); if (v !== undefined) value = v; const m = num(raw.max); if (m !== undefined) max = m; }
  else return false;
  rules.gates[id] = { level, ...(value !== undefined ? { value } : {}), ...(max !== undefined ? { max } : {}), source };
  return true;
}
function applyOption(rules: StudioRules, key: string, raw: unknown): boolean {
  const k = OPTION_ALIASES[norm(key)];
  if (!k) return false;
  if (k === 'require_distinct_approver') {
    const t = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (t === true || t === 'sim' || t === 'true' || t === 'ligado') { rules.options[k] = true; return true; }
    if (t === false || t === 'nao' || t === 'não' || t === 'false' || t === 'desligado') { rules.options[k] = false; return true; }
    return false;
  }
  const n = num(raw);
  if (n === undefined) return false;
  const cap: Record<string, [number, number]> = { batch_limit: [1, BATCH_LIMIT_HARD], daily_publish_limit: [1, 500], max_ai_steps: [0, 24], step_max_tokens: [200, 4000], benchmark_top_n: [1, 30], rewrite_rounds: [0, 6] };
  const [lo, hi] = cap[k] || [0, 1000];
  (rules.options as unknown as Record<string, number>)[k] = Math.max(lo, Math.min(hi, Math.floor(n)));
  return true;
}

/** Lê o bloco "[estudio] chave=valor" (uma regra por linha) de um prompt. O que não for reconhecido é ignorado (nunca inventa regra). */
export function parseStudioDirectives(text: string): { gates: Partial<Record<GateId, unknown>>; options: Record<string, unknown>; matched: string[] } {
  const gates: Partial<Record<GateId, unknown>> = {}; const options: Record<string, unknown> = {}; const matched: string[] = [];
  const src = String(text || '').slice(0, 60_000);
  const at = src.search(/\[est[uú]dio\]/i);
  if (at < 0) return { gates, options, matched };
  for (const line of src.slice(at).split(/\r?\n/).slice(0, 60)) {
    const m = line.replace(/^\s*\[est[uú]dio\]\s*/i, '').match(/^\s*([a-zA-ZÀ-ÿ0-9_ ]{2,40}?)\s*[=:]\s*(.+?)\s*$/);
    if (!m) continue;
    const id = gateId(m[1]);
    if (id) { gates[id] = m[2]; matched.push(`${norm(m[1])}=${m[2]}`); } else if (OPTION_ALIASES[norm(m[1])]) { options[norm(m[1])] = m[2]; matched.push(`${norm(m[1])}=${m[2]}`); }
  }
  return { gates, options, matched };
}

export interface StudioRuleInputs extends RuleInputs { type?: PageType }

/** Monta o perfil final. Nunca lança: entrada ruim é ignorada e o padrão editável segue valendo. */
export function resolveStudioRules(input: StudioRuleInputs = {}): StudioRules {
  const type: PageType = input.type || 'pagina';
  const base = resolveRuleProfile(input);
  const rules: StudioRules = { version: 1, type, base, gates: JSON.parse(JSON.stringify(DEFAULT_GATES)), options: { ...DEFAULT_OPTIONS, max_ai_steps: Math.max(DEFAULT_OPTIONS.max_ai_steps, base.options.max_ai_steps), step_max_tokens: base.options.step_max_tokens }, layers: ['padrao_editavel'] };
  const mark = (s: RuleSource) => { if (!rules.layers.includes(s)) rules.layers.push(s); };
  rules.gates.words = r('recomendar', DEFAULT_WORDS[type]);
  // O perfil compartilhado manda onde o projeto/prompt falou (a fonte deixa de ser 'padrao_editavel'); senão valem os padrões de PÁGINA.
  const shared = base.rules;
  if (shared.words.source !== 'padrao_editavel') { rules.gates.words = { level: shared.words.level, ...(shared.words.value !== undefined ? { value: shared.words.value } : {}), ...(shared.words.max !== undefined ? { max: shared.words.max } : {}), source: shared.words.source }; mark(shared.words.source); }
  if (shared.internal_links.source !== 'padrao_editavel') { rules.gates.internal_links = { level: shared.internal_links.level, value: shared.internal_links.value, source: shared.internal_links.source }; mark(shared.internal_links.source); }
  if (shared.external_links.source !== 'padrao_editavel') { rules.gates.external_links = { level: shared.external_links.level, value: shared.external_links.value, source: shared.external_links.source }; mark(shared.external_links.source); }
  for (const [sid, gid] of [['canonical', 'canonical'], ['open_graph', 'open_graph'], ['breadcrumb', 'breadcrumb'], ['author_byline', 'eeat_author'], ['image_alt', 'images'], ['schema_faq', 'faq_schema']] as const) {
    if (shared[sid].source !== 'padrao_editavel') { rules.gates[gid] = { level: shared[sid].level, source: shared[sid].source }; mark(shared[sid].source); }
  }
  try {
    const identity = isObj(input.projectIdentity) ? input.projectIdentity : {};
    const layer = isObj(identity.studio_rules) ? identity.studio_rules : null;
    if (layer) {
      let n = 0;
      const g = isObj(layer.gates) ? layer.gates : layer;
      for (const [k, v] of Object.entries(g)) { const id = gateId(k); if (id && applyGate(rules, id, v, 'projeto')) n++; }
      const o = isObj(layer.options) ? layer.options : layer;
      for (const [k, v] of Object.entries(o)) if (applyOption(rules, k, v)) n++;
      if (n) mark('projeto');
    }
    const texts = [...(input.prompts || [])];
    const strat = input.projectStrategy || {};
    for (const k of ['constraints', 'voice', 'limits']) if (typeof strat[k] === 'string') texts.push(strat[k] as string);
    for (const t of texts) {
      if (!t) continue;
      const p = parseStudioDirectives(t);
      let n = 0;
      for (const [id, raw] of Object.entries(p.gates)) if (applyGate(rules, id as GateId, raw, 'prompt')) n++;
      for (const [k, raw] of Object.entries(p.options)) if (applyOption(rules, k, raw)) n++;
      if (n) mark('prompt');
    }
  } catch { /* entrada inesperada: o padrão editável continua valendo */ }
  return rules;
}

export const gateOn = (rules: StudioRules, id: GateId): boolean => rules.gates[id].level !== 'desligado';
export const gateRequired = (rules: StudioRules, id: GateId): boolean => rules.gates[id].level === 'exigir';
export const gateValue = (rules: StudioRules, id: GateId, fallback: number): number => rules.gates[id].value ?? fallback;
