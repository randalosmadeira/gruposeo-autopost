/**
 * Perfil de regras de otimização de um artigo (SEO, GEO, AEO, AIO).
 *
 * PRINCÍPIO (decisão do dono, 20/11/2026): tamanho, legibilidade e demais mínimos NÃO são regras fixas do sistema. Quem define são os
 * PROMPTS/AGENTES de IA do projeto. Os valores abaixo são só PADRÕES SENSATOS e EDITÁVEIS (`source: 'padrao_editavel'`): valem enquanto
 * ninguém disser outra coisa, e qualquer camada acima os substitui.
 *
 * Camadas, da mais fraca para a mais forte (a última que falar vence, regra por regra):
 *   1. padrão editável (este arquivo)
 *   2. projeto            project.editorial_identity.optimization_rules (jsonb que já existe; sem migração)
 *   3. artigo             article.config.optimization_rules e article.config.geo_word_band {min,max}
 *   4. prompt do agente   texto do prompt do projeto/artigo: bloco "[otimizacao] chave=valor" ou frases como "mínimo de 1500 palavras"
 *
 * Cada regra tem um NÍVEL: 'exigir' (pendência crítica; o piloto tenta corrigir e o plugin pode segurar como rascunho se o projeto
 * pedir), 'recomendar' (aparece como dica; nunca bloqueia) ou 'desligado' (a regra nem é avaliada). Nada aqui bloqueia por si só.
 *
 * Sem dependência de Deno: também é usado pela tela e pelo vitest.
 */

import { PACK_IDS, type PackChoice, type PackMode } from './segment-packs.ts';

export type RuleLevel = 'exigir' | 'recomendar' | 'desligado';
export type RuleSource = 'padrao_editavel' | 'projeto' | 'artigo' | 'prompt';
export const RULE_LEVELS: readonly RuleLevel[] = ['exigir', 'recomendar', 'desligado'];

export interface Rule { level: RuleLevel; value?: number; max?: number; source: RuleSource }

/** Identificadores de regra (estáveis: aparecem em relatórios, eventos e na tela). */
export const RULE_IDS = [
  // tamanho e legibilidade
  'words', 'flesch', 'sentence_words', 'paragraph_words', 'transition_words',
  // estrutura
  'h2_count', 'h3_count', 'h2_question_pct', 'faq', 'conclusion_cta', 'direct_answer', 'title_length', 'meta_length',
  // links
  'internal_links', 'external_links',
  // E-E-A-T, GEO, AEO
  'stats_with_source', 'expert_quotes', 'conversational_tone', 'fresh_year',
  // técnica / portão do plugin
  'breadcrumb', 'schema_article', 'schema_faq', 'canonical', 'open_graph', 'featured_image', 'image_alt', 'author_byline',
  'dates_coherent', 'no_markdown_tables', 'no_prompt_residue', 'content_hash_match',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Rótulos em português (a tela e o relatório usam). */
export const RULE_LABELS: Record<RuleId, string> = {
  words: 'Quantidade de palavras', flesch: 'Legibilidade (fórmula do idioma do artigo)', sentence_words: 'Tamanho máximo da frase',
  paragraph_words: 'Tamanho máximo do parágrafo', transition_words: 'Palavras de transição', h2_count: 'Quantidade de H2',
  h3_count: 'Quantidade de H3', h2_question_pct: 'H2 em forma de pergunta', faq: 'FAQ (perguntas frequentes)',
  conclusion_cta: 'Conclusão com convite ao contato', direct_answer: 'Resposta direta no começo', title_length: 'Tamanho do título',
  meta_length: 'Tamanho da meta descrição', internal_links: 'Links internos', external_links: 'Links para fontes externas',
  stats_with_source: 'Dados com fonte', expert_quotes: 'Citações de especialista', conversational_tone: 'Tom conversacional',
  fresh_year: 'Frescor (ano corrente citado)', breadcrumb: 'Trilha de navegação (breadcrumb)', schema_article: 'Schema Article/BlogPosting',
  schema_faq: 'Schema FAQPage (informativo)', canonical: 'URL canônica', open_graph: 'Open Graph (pré-visualização social)',
  featured_image: 'Imagem destacada', image_alt: 'Texto alternativo das imagens', author_byline: 'Autor identificado',
  dates_coherent: 'Datas coerentes', no_markdown_tables: 'Tabelas sem markdown cru', no_prompt_residue: 'Sem resíduo de prompt ou placeholder',
  content_hash_match: 'Conteúdo igual ao aprovado',
};

const P: RuleSource = 'padrao_editavel';
const r = (level: RuleLevel, value?: number, max?: number): Rule => ({ level, ...(value !== undefined ? { value } : {}), ...(max !== undefined ? { max } : {}), source: P });

/**
 * PADRÕES EDITÁVEIS. Cada linha diz de onde veio o número, para ninguém achar que é lei do sistema.
 * Os números de legibilidade/links repetem o que o analisador usava fixo antes de 20/11/2026 (mesmo comportamento por padrão).
 */
export const DEFAULT_RULE_TABLE: Record<RuleId, Rule> = {
  // Palavras: o analisador antigo recomendava >= 1500 fixo. Agora é só uma DICA (recomendar) e o prompt do agente substitui.
  words: r('recomendar', 1500),
  flesch: r('exigir', 60, 70), // value = mínimo, max = alvo (Flesch adaptado ao português; mínimo 60, alvo 70 como antes)
  sentence_words: r('recomendar', 25),
  paragraph_words: r('recomendar', 60),
  transition_words: r('recomendar', 30), // % de frases com conectivo (antes: >= 30%)
  h2_count: r('recomendar', 5),
  h3_count: r('recomendar', 3),
  h2_question_pct: r('recomendar', 50),
  faq: r('recomendar'),
  conclusion_cta: r('recomendar'),
  direct_answer: r('recomendar'),
  title_length: r('recomendar', 55, 80),
  meta_length: r('recomendar', 145, 180),
  internal_links: r('exigir', 10), // antes: mínimo 10 (alerta de órfão abaixo de 2)
  external_links: r('recomendar', 2),
  stats_with_source: r('recomendar', 200), // 1 dado com fonte a cada N palavras
  expert_quotes: r('recomendar', 2),
  conversational_tone: r('recomendar'),
  fresh_year: r('recomendar'),
  breadcrumb: r('exigir'),
  schema_article: r('exigir'),
  // O Google aposentou o rich result de FAQ em 05/2026: o schema FAQPage continua útil para outros leitores, mas NUNCA é obrigatório.
  schema_faq: r('recomendar'),
  canonical: r('exigir'),
  open_graph: r('recomendar'),
  featured_image: r('recomendar'),
  image_alt: r('recomendar'),
  author_byline: r('recomendar'),
  dates_coherent: r('exigir'),
  no_markdown_tables: r('exigir'),
  no_prompt_residue: r('exigir'),
  content_hash_match: r('recomendar'),
};

export type GatePolicy = 'avisar' | 'exigir';

export interface RunOptions {
  /** piloto roda sozinho ao salvar como pronto e antes de publicar */
  auto: boolean;
  /** aplicar direto no artigo, sem rascunho de revisão (desligado por padrão: texto gerado passa pela revisão do dono) */
  apply_without_review: boolean;
  /** rodadas máximas de correção por IA (cada passo de IA conta uma) */
  max_ai_steps: number;
  /** teto de tokens de saída por chamada de IA (pequeno de propósito: nada de chamada única de 16.000 tokens) */
  step_max_tokens: number;
  /** pacote de conformidade por segmento (ver segment-packs.ts): 'auto' (pelo segmento do projeto), um pacote pelo nome ou 'nenhum' */
  compliance_pack: PackChoice;
  /** 'aviso' (padrão) avisa e registra; 'rigido' rejeita o trecho gerado; 'desligado' não verifica */
  compliance_mode: PackMode;
  /** plugin do WordPress: 'avisar' publica com aviso; 'exigir' segura como rascunho se faltar item 'exigir' que o plugin não preenche */
  plugin_gate: GatePolicy;
}
export const DEFAULT_RUN_OPTIONS: RunOptions = {
  auto: false, apply_without_review: false, max_ai_steps: 6, step_max_tokens: 1800, compliance_pack: 'auto', compliance_mode: 'aviso', plugin_gate: 'avisar',
};
export const STEP_MAX_TOKENS_HARD = 4000;
export const MAX_AI_STEPS_HARD = 12;

export interface RuleProfile {
  version: 1;
  rules: Record<RuleId, Rule>;
  options: RunOptions;
  /** quais camadas contribuíram (para a tela explicar de onde vem cada número) */
  layers: RuleSource[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : undefined;
};
const asLevel = (v: unknown): RuleLevel | undefined => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (t === 'exigir' || t === 'exigido' || t === 'obrigatorio' || t === 'obrigatório') return 'exigir';
  if (t === 'recomendar' || t === 'recomendado' || t === 'sugerir') return 'recomendar';
  if (t === 'desligado' || t === 'desligar' || t === 'off' || t === 'nenhum' || t === 'ignorar') return 'desligado';
  return undefined;
};

export function defaultProfile(): RuleProfile {
  return { version: 1, rules: clone(DEFAULT_RULE_TABLE), options: { ...DEFAULT_RUN_OPTIONS }, layers: ['padrao_editavel'] };
}

/** Aplica UMA regra de uma camada. Aceita: número (vira o valor, nível mantido ou 'recomendar'), nível em texto, ou {level,value,max}. */
function applyRule(profile: RuleProfile, id: RuleId, raw: unknown, source: RuleSource): boolean {
  const cur = profile.rules[id];
  if (raw === undefined || raw === null) return false;
  let level = cur.level; let value = cur.value; let max = cur.max;
  if (typeof raw === 'boolean') level = raw ? (cur.level === 'desligado' ? 'recomendar' : cur.level) : 'desligado';
  else if (typeof raw === 'number' || (typeof raw === 'string' && num(raw) !== undefined && !asLevel(raw))) { const v = num(raw); if (v === undefined) return false; value = v; if (level === 'desligado') level = 'recomendar'; }
  else if (typeof raw === 'string') { const l = asLevel(raw); if (!l) return false; level = l; }
  else if (isObj(raw)) {
    const l = asLevel(raw.level ?? raw.nivel); if (l) level = l;
    const v = num(raw.value ?? raw.valor ?? raw.min); if (v !== undefined) value = v;
    const m = num(raw.max ?? raw.alvo); if (m !== undefined) max = m;
  } else return false;
  profile.rules[id] = { level, ...(value !== undefined ? { value } : {}), ...(max !== undefined ? { max } : {}), source };
  return true;
}

const OPTION_KEYS: Record<string, keyof RunOptions> = {
  auto: 'auto', automatico: 'auto', automático: 'auto', apply_without_review: 'apply_without_review', aplicar_sem_revisao: 'apply_without_review',
  'aplicar_sem_revisão': 'apply_without_review', max_ai_steps: 'max_ai_steps', max_passos_ia: 'max_ai_steps', step_max_tokens: 'step_max_tokens',
  tokens_por_passo: 'step_max_tokens', compliance_mode: 'compliance_mode', modo_conformidade: 'compliance_mode', compliance_pack: 'compliance_pack', pacote_conformidade: 'compliance_pack', plugin_gate: 'plugin_gate', portao_plugin: 'plugin_gate', 'portão_plugin': 'plugin_gate',
};
function applyOption(profile: RuleProfile, key: string, raw: unknown): boolean {
  const k = OPTION_KEYS[key];
  if (!k) return false;
  const o = profile.options;
  if (k === 'auto' || k === 'apply_without_review') {
    const t = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (t === true || t === 'true' || t === 'sim' || t === 'ligado' || t === 'on' || t === '1' || t === 1) { o[k] = true; return true; }
    if (t === false || t === 'false' || t === 'nao' || t === 'não' || t === 'desligado' || t === 'off' || t === '0' || t === 0) { o[k] = false; return true; }
    return false;
  }
  if (k === 'max_ai_steps') { const n = num(raw); if (n === undefined) return false; o.max_ai_steps = Math.max(0, Math.min(MAX_AI_STEPS_HARD, Math.floor(n))); return true; }
  if (k === 'step_max_tokens') { const n = num(raw); if (n === undefined) return false; o.step_max_tokens = Math.max(200, Math.min(STEP_MAX_TOKENS_HARD, Math.floor(n))); return true; }
  if (k === 'compliance_mode') {
    const t = String(raw).trim().toLowerCase();
    if (t === 'aviso' || t === 'advisory') o.compliance_mode = 'aviso';
    else if (t === 'rigido' || t === 'rígido' || t === 'strict') o.compliance_mode = 'rigido';
    else if (t === 'desligado' || t === 'off') o.compliance_mode = 'desligado';
    else return false;
    return true;
  }
  if (k === 'compliance_pack') {
    const t = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (t === 'auto' || t === 'nenhum' || (PACK_IDS as readonly string[]).includes(t)) { o.compliance_pack = t as PackChoice; return true; }
    return false;
  }
  if (k === 'plugin_gate') {
    const t = String(raw).trim().toLowerCase();
    if (t === 'exigir' || t === 'segurar' || t === 'rigido' || t === 'rígido') o.plugin_gate = 'exigir';
    else if (t === 'avisar' || t === 'aviso' || t === 'publicar') o.plugin_gate = 'avisar';
    else return false;
    return true;
  }
  return false;
}

/** Nomes aceitos nos blocos de texto e no JSON (português e inglês). */
const RULE_ALIASES: Record<string, RuleId> = {
  palavras: 'words', words: 'words', flesch: 'flesch', frase: 'sentence_words', frases: 'sentence_words', sentence_words: 'sentence_words',
  paragrafo: 'paragraph_words', parágrafo: 'paragraph_words', paragraph_words: 'paragraph_words', transicao: 'transition_words', transição: 'transition_words',
  transition_words: 'transition_words', h2: 'h2_count', h2_count: 'h2_count', h3: 'h3_count', h3_count: 'h3_count', h2_pergunta: 'h2_question_pct',
  h2_question_pct: 'h2_question_pct', faq: 'faq', conclusao: 'conclusion_cta', conclusão: 'conclusion_cta', conclusion_cta: 'conclusion_cta',
  resposta_direta: 'direct_answer', direct_answer: 'direct_answer', titulo: 'title_length', título: 'title_length', title_length: 'title_length',
  meta: 'meta_length', meta_length: 'meta_length', links_internos: 'internal_links', internal_links: 'internal_links', links_externos: 'external_links',
  external_links: 'external_links', dados_com_fonte: 'stats_with_source', stats_with_source: 'stats_with_source', especialista: 'expert_quotes',
  expert_quotes: 'expert_quotes', tom_conversacional: 'conversational_tone', conversational_tone: 'conversational_tone', frescor: 'fresh_year',
  fresh_year: 'fresh_year', breadcrumb: 'breadcrumb', schema_article: 'schema_article', schema_artigo: 'schema_article', schema_faq: 'schema_faq',
  canonical: 'canonical', open_graph: 'open_graph', imagem_destacada: 'featured_image', featured_image: 'featured_image', alt: 'image_alt',
  image_alt: 'image_alt', autor: 'author_byline', author_byline: 'author_byline', datas: 'dates_coherent', dates_coherent: 'dates_coherent',
  tabelas: 'no_markdown_tables', no_markdown_tables: 'no_markdown_tables', residuo: 'no_prompt_residue', resíduo: 'no_prompt_residue',
  no_prompt_residue: 'no_prompt_residue', hash: 'content_hash_match', content_hash_match: 'content_hash_match',
};
const norm = (k: string) => k.trim().toLowerCase().replace(/\s+/g, '_');

/** Camada em objeto (projeto/artigo): { rules: {...}, options: {...} } ou as chaves soltas. */
export function applyLayerObject(profile: RuleProfile, layer: unknown, source: RuleSource): number {
  if (!isObj(layer)) return 0;
  let n = 0;
  const rules = isObj(layer.rules) ? layer.rules : layer;
  for (const [key, raw] of Object.entries(rules)) {
    const id = RULE_ALIASES[norm(key)] ?? ((RULE_IDS as readonly string[]).includes(norm(key)) ? (norm(key) as RuleId) : undefined);
    if (id && applyRule(profile, id, raw, source)) n++;
  }
  const options = isObj(layer.options) ? layer.options : layer;
  for (const [key, raw] of Object.entries(options)) if (applyOption(profile, norm(key), raw)) n++;
  return n;
}

/**
 * Lê as instruções de otimização do TEXTO de um prompt/agente. Dois formatos:
 *  (a) estruturado, uma linha por regra:   [otimizacao] palavras=1500  /  flesch=60..70  /  links_internos=8  /  faq=exigir  /  breadcrumb=desligado
 *  (b) frases comuns: "mínimo de 1500 palavras", "entre 1200 e 1800 palavras", "Flesch mínimo 55", "pelo menos 8 links internos",
 *      "frases de até 22 palavras", "parágrafos de até 50 palavras".
 * É heurístico de propósito: o que não for reconhecido é ignorado (nunca inventa regra).
 */
export function parsePromptDirectives(text: string): { rules: Partial<Record<RuleId, unknown>>; options: Record<string, unknown>; matched: string[] } {
  const rules: Partial<Record<RuleId, unknown>> = {};
  const options: Record<string, unknown> = {};
  const matched: string[] = [];
  const src = String(text || '').slice(0, 60_000);
  const body = /\[otimiza[cç][aã]o\]/i.test(src) ? src.slice(src.search(/\[otimiza[cç][aã]o\]/i)) : '';
  if (body) {
    for (const line of body.split(/\r?\n/).slice(0, 60)) {
      const m = line.replace(/^\s*\[otimiza[cç][aã]o\]\s*/i, '').match(/^\s*([a-zA-ZÀ-ÿ0-9_ ]{2,40}?)\s*[=:]\s*(.+?)\s*$/);
      if (!m) continue;
      const key = norm(m[1]);
      const value = m[2].trim();
      const range = value.match(/^(\d[\d.,]*)\s*(?:\.\.|-|a|até)\s*(\d[\d.,]*)$/i);
      const id = RULE_ALIASES[key];
      if (id) {
        if (range) rules[id] = { value: num(range[1]), max: num(range[2]) };
        else rules[id] = value;
        matched.push(`${key}=${value}`);
      } else if (OPTION_KEYS[key]) { options[key] = value; matched.push(`${key}=${value}`); }
    }
  }
  const plain = src.replace(/<[^>]+>/g, ' ');
  const natural: Array<[RegExp, (m: RegExpMatchArray) => void]> = [
    [/entre\s+(\d[\d.]*)\s+e\s+(\d[\d.]*)\s+palavras/i, (m) => { rules.words = { level: 'exigir', value: num(m[1]), max: num(m[2]) }; }],
    [/m[ií]nimo\s+(?:de\s+)?(\d[\d.]*)\s+palavras/i, (m) => { rules.words = { level: 'exigir', value: num(m[1]) }; }],
    [/(?:pelo menos|no m[ií]nimo)\s+(\d[\d.]*)\s+palavras/i, (m) => { rules.words = { level: 'exigir', value: num(m[1]) }; }],
    [/flesch\s+m[ií]nimo\s+(?:de\s+)?(\d{1,3})/i, (m) => { rules.flesch = { value: num(m[1]) }; }],
    [/(?:pelo menos|no m[ií]nimo|m[ií]nimo de)\s+(\d{1,3})\s+links?\s+internos?/i, (m) => { rules.internal_links = { value: num(m[1]) }; }],
    [/frases?\s+(?:de\s+)?at[eé]\s+(\d{1,3})\s+palavras/i, (m) => { rules.sentence_words = { value: num(m[1]) }; }],
    [/par[aá]grafos?\s+(?:de\s+)?at[eé]\s+(\d{1,3})\s+palavras/i, (m) => { rules.paragraph_words = { value: num(m[1]) }; }],
  ];
  for (const [re, fn] of natural) {
    const m = plain.match(re);
    if (m) { fn(m); matched.push(m[0].trim().slice(0, 80)); }
  }
  return { rules, options, matched };
}

export interface RuleInputs {
  /** projects.editorial_identity (lê .optimization_rules) */
  projectIdentity?: unknown;
  /** projects.nexus_strategy (campos de texto livre também são lidos como prompt) */
  projectStrategy?: Record<string, unknown> | null;
  /** articles.config */
  articleConfig?: Record<string, unknown> | null;
  /** textos de prompts/agentes (template de prompt do projeto, instruções do agente) */
  prompts?: Array<string | null | undefined>;
}

/** Monta o perfil final. Nunca lança: entrada ruim é ignorada e o padrão editável segue valendo. */
export function resolveRuleProfile(input: RuleInputs = {}): RuleProfile {
  const profile = defaultProfile();
  const mark = (src: RuleSource) => { if (!profile.layers.includes(src)) profile.layers.push(src); };
  try {
    const identity = isObj(input.projectIdentity) ? input.projectIdentity : {};
    if (applyLayerObject(profile, identity.optimization_rules, 'projeto')) mark('projeto');
    const strat = input.projectStrategy || {};
    if (isObj(strat.optimization_rules) && applyLayerObject(profile, strat.optimization_rules, 'projeto')) mark('projeto');
    const cfg = input.articleConfig || {};
    const band = isObj(cfg.geo_word_band) ? cfg.geo_word_band : null;
    if (band) {
      const min = num(band.min); const max = num(band.max);
      if (min !== undefined && min > 0) { profile.rules.words = { level: 'exigir', value: min, ...(max !== undefined && max > 0 ? { max } : {}), source: 'artigo' }; mark('artigo'); }
    }
    if (applyLayerObject(profile, cfg.optimization_rules, 'artigo')) mark('artigo');
    const texts = [...(input.prompts || [])];
    for (const key of ['constraints', 'voice', 'limits']) if (typeof strat[key] === 'string') texts.push(strat[key] as string);
    if (typeof cfg.agent_prompt === 'string') texts.push(cfg.agent_prompt);
    if (typeof cfg.prompt_instructions === 'string') texts.push(cfg.prompt_instructions);
    for (const t of texts) {
      if (!t) continue;
      const parsed = parsePromptDirectives(t);
      let any = 0;
      for (const [id, raw] of Object.entries(parsed.rules)) if (applyRule(profile, id as RuleId, raw, 'prompt')) any++;
      for (const [k, raw] of Object.entries(parsed.options)) if (applyOption(profile, k, raw)) any++;
      if (any) mark('prompt');
    }
  } catch { /* entrada inesperada: o padrão editável continua valendo */ }
  return profile;
}

// ---------- consultas úteis (evitam "if level" espalhado) ----------

export const isOn = (p: RuleProfile, id: RuleId): boolean => p.rules[id].level !== 'desligado';
export const isRequired = (p: RuleProfile, id: RuleId): boolean => p.rules[id].level === 'exigir';
export const ruleValue = (p: RuleProfile, id: RuleId, fallback: number): number => p.rules[id].value ?? fallback;

/** Faixa de palavras ativa (só quando a regra está ligada e tem valor). Sem valor/desligado: sem piso. */
export function wordBand(p: RuleProfile): { min: number | null; max: number | null } {
  const w = p.rules.words;
  if (w.level === 'desligado') return { min: null, max: null };
  return { min: w.value && w.value > 0 ? w.value : null, max: w.max && w.max > 0 ? w.max : null };
}

/** Texto curto, em português, de onde veio cada regra ligada (a tela mostra no cartão de regras). */
export function describeRule(p: RuleProfile, id: RuleId): string {
  const rule = p.rules[id];
  const origem = rule.source === 'padrao_editavel' ? 'padrão editável' : rule.source === 'projeto' ? 'definido no projeto' : rule.source === 'artigo' ? 'definido no artigo' : 'definido no prompt do agente';
  const val = rule.value !== undefined ? ` ${rule.value}${rule.max !== undefined ? `–${rule.max}` : ''}` : '';
  return `${RULE_LABELS[id]}: ${rule.level}${val} (${origem})`;
}

/** Frases prontas para os PROMPTS de IA (o texto do prompt acompanha o perfil; nada de número fixo escrito à mão no prompt). */
export function promptLimits(p: RuleProfile): { readability: string; internalLinks: string; structure: string; words: string } {
  const fl = p.rules.flesch;
  const parts: string[] = [];
  if (fl.level !== 'desligado') parts.push(`Flesch (adaptado ao português) de pelo menos ${fl.max ?? fl.value ?? 70}`);
  if (p.rules.sentence_words.level !== 'desligado') parts.push(`frases de até ${p.rules.sentence_words.value ?? 25} palavras`);
  if (p.rules.paragraph_words.level !== 'desligado') parts.push(`parágrafos de até ${p.rules.paragraph_words.value ?? 60} palavras`);
  parts.push('voz ativa');
  const il = p.rules.internal_links;
  const band = wordBand(p);
  return {
    readability: `${parts.join(', ')}.`,
    internalLinks: il.level === 'desligado' ? 'use links internos quando fizer sentido' : `no mínimo ${il.value ?? 10}`,
    structure: `H2 (alvo ${p.rules.h2_count.value ?? 5}) e H3 (alvo ${p.rules.h3_count.value ?? 3})`,
    words: band.min === null ? 'TAMANHO: o necessário para responder bem ao tema (sem enchimento)' : `TAMANHO: ${band.min}${band.max ? ` a ${band.max}` : ' ou mais'} palavras (definido pelo agente deste projeto)`,
  };
}
