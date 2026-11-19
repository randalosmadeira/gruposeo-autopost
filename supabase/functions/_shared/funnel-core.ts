/**
 * Funil de captação com números (módulo M1), por projeto.
 *
 * Função pura (sem rede, sem Deno, sem React): roda no navegador, na função de borda e nos testes.
 *
 * Ideia: o cliente do sistema define as ETAPAS do funil do negócio dele (colunas contadas + indicadores) e lança, mês a mês, os números.
 * O sistema calcula a conversão de cada passo, compara com o mês anterior DO PRÓPRIO PROJETO e mostra onde o funil vaza.
 *
 * Regras:
 *  - Sistema genérico e multi-segmento: os modelos (advocacia pessoa física, genérico) são só SUGESTÃO; etapas e indicadores são configuráveis.
 *  - Nada inventado: sem número lançado, o indicador fica "sem dados". Não há referência de mercado embutida: a comparação é com o histórico do projeto.
 *  - Regras de conselho de classe (ex.: Provimento 205 na advocacia) entram por projeto, como lembrete por etapa.
 *  - Limites, preços e cobrança ficam para a fase final (decisão de 16/11/2026).
 */

export type MetricKind = 'count' | 'minutes' | 'days' | 'number';
export interface FunnelMetric { key: string; label: string; kind: MetricKind; hint?: string }
export type FunnelIndicator =
  | { key: string; label: string; kind: 'ratio'; numerator: string; denominator: string; }
  | { key: string; label: string; kind: 'per_week'; metric: string }
  | { key: string; label: string; kind: 'metric'; metric: string };
export interface FunnelStage { key: string; label: string; goal: string; indicators: FunnelIndicator[]; compliance?: string }
export interface FunnelConfig {
  version: 1;
  template: string;
  /** colunas do funil, em ordem (todas contagens): cada passo é a conversão de uma para a seguinte */
  counts: FunnelMetric[];
  /** números de apoio (tempos, contatos de uma origem, casos por pessoa…) */
  extras: FunnelMetric[];
  stages: FunnelStage[];
}
export type MonthValues = Record<string, number>;
export type FunnelEntries = Record<string, MonthValues>;

export const KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;
export const MONTH_RE = /^(20\d{2})-(0[1-9]|1[0-2])$/;
export const LIMITS = { counts: 10, extras: 12, stages: 10, indicatorsPerStage: 4, label: 80, text: 280, maxValue: 1_000_000_000 };

// ------------------------------------------------------------------------------------------------------------ modelos
const count = (key: string, label: string, hint?: string): FunnelMetric => ({ key, label, kind: 'count', hint });
const extra = (key: string, label: string, kind: MetricKind, hint?: string): FunnelMetric => ({ key, label, kind, hint });

export const TEMPLATE_ADVOCACIA_PF: FunnelConfig = {
  version: 1,
  template: 'advocacia-pf',
  counts: [
    count('contatos', 'Contatos', 'Pessoas que entraram em contato no mês, por qualquer canal.'),
    count('triagens', 'Triagens (análises marcadas)', 'Contatos que passaram pela triagem e tiveram a análise marcada.'),
    count('pastas_completas', 'Pastas completas', 'Casos com todos os documentos recebidos.'),
    count('analises', 'Análises feitas', 'Análises jurídicas concluídas.'),
    count('contratos', 'Contratos', 'Casos que viraram contrato.'),
    count('indicacoes', 'Indicações', 'Contatos que chegaram por indicação de cliente.'),
  ],
  extras: [
    extra('contatos_nicho', 'Contatos do nicho', 'count', 'Contatos que são do tipo de caso em que o escritório quer atuar.'),
    extra('contatos_conteudo', 'Contatos vindos de conteúdo', 'count', 'Contatos que chegaram por artigo, site, vídeo ou rede social.'),
    extra('primeira_resposta_min', 'Tempo até a primeira resposta (média)', 'minutes'),
    extra('dias_pasta_completa', 'Dias até a pasta completa (média)', 'days'),
    extra('casos_por_pessoa', 'Casos ativos por pessoa da equipe', 'number'),
  ],
  stages: [
    { key: 'nicho', label: '1. Nicho', goal: 'Atrair o tipo de caso certo, não qualquer contato.', indicators: [{ key: 'pct_nicho', label: 'Contatos do nicho ÷ total de contatos', kind: 'ratio', numerator: 'contatos_nicho', denominator: 'contatos' }] },
    { key: 'conteudo', label: '2. Conteúdo informativo', goal: 'Informar para o contato chegar já orientado, sem prometer resultado.', indicators: [{ key: 'conteudo_semana', label: 'Contatos vindos de conteúdo por semana', kind: 'per_week', metric: 'contatos_conteudo' }], compliance: 'Conteúdo que informa e orienta. Sem promessa de resultado, sem preço como chamariz e sem captação ativa.' },
    { key: 'atendimento', label: '3. Atendimento imediato', goal: 'Responder rápido e marcar a análise.', indicators: [{ key: 'resposta', label: 'Tempo até a primeira resposta', kind: 'metric', metric: 'primeira_resposta_min' }, { key: 'triagem_rate', label: 'Análises marcadas ÷ contatos', kind: 'ratio', numerator: 'triagens', denominator: 'contatos' }] },
    { key: 'coleta', label: '4. Coleta de documentos', goal: 'Receber a pasta completa, com lembrete, sem deixar o caso parado.', indicators: [{ key: 'pasta_rate', label: 'Pastas completas ÷ análises marcadas', kind: 'ratio', numerator: 'pastas_completas', denominator: 'triagens' }, { key: 'dias_pasta', label: 'Dias até a pasta completa', kind: 'metric', metric: 'dias_pasta_completa' }] },
    { key: 'analise', label: '5. Análise sem promessa', goal: 'Analisar com clareza e fechar contrato quando houver causa.', indicators: [{ key: 'contrato_rate', label: 'Contratos ÷ análises', kind: 'ratio', numerator: 'contratos', denominator: 'analises' }], compliance: 'Análise técnica, sem garantia de resultado.' },
    { key: 'escala', label: '6. Escala e lembrança', goal: 'Dar conta do volume e ser lembrado para indicação.', indicators: [{ key: 'casos_pessoa', label: 'Casos por pessoa', kind: 'metric', metric: 'casos_por_pessoa' }, { key: 'indicacao_rate', label: 'Indicações ÷ contatos', kind: 'ratio', numerator: 'indicacoes', denominator: 'contatos' }] },
  ],
};

export const TEMPLATE_GENERICO: FunnelConfig = {
  version: 1,
  template: 'generico',
  counts: [
    count('contatos', 'Contatos', 'Pessoas ou empresas que entraram em contato no mês.'),
    count('qualificados', 'Qualificados', 'Contatos que se encaixam no que o negócio atende.'),
    count('propostas', 'Propostas ou orçamentos', 'Propostas enviadas ou atendimentos marcados.'),
    count('clientes', 'Clientes', 'Quem fechou.'),
    count('indicacoes', 'Indicações', 'Contatos que chegaram por indicação.'),
  ],
  extras: [
    extra('primeira_resposta_min', 'Tempo até a primeira resposta (média)', 'minutes'),
    extra('contatos_conteudo', 'Contatos vindos de conteúdo', 'count', 'Artigo, site, vídeo ou rede social.'),
  ],
  stages: [
    { key: 'atrair', label: '1. Atrair', goal: 'Gerar contatos do público certo.', indicators: [{ key: 'conteudo_semana', label: 'Contatos vindos de conteúdo por semana', kind: 'per_week', metric: 'contatos_conteudo' }] },
    { key: 'responder', label: '2. Responder', goal: 'Responder rápido e qualificar.', indicators: [{ key: 'resposta', label: 'Tempo até a primeira resposta', kind: 'metric', metric: 'primeira_resposta_min' }, { key: 'qualif_rate', label: 'Qualificados ÷ contatos', kind: 'ratio', numerator: 'qualificados', denominator: 'contatos' }] },
    { key: 'propor', label: '3. Propor', goal: 'Transformar o contato qualificado em proposta.', indicators: [{ key: 'proposta_rate', label: 'Propostas ÷ qualificados', kind: 'ratio', numerator: 'propostas', denominator: 'qualificados' }] },
    { key: 'fechar', label: '4. Fechar', goal: 'Converter propostas em clientes.', indicators: [{ key: 'fecha_rate', label: 'Clientes ÷ propostas', kind: 'ratio', numerator: 'clientes', denominator: 'propostas' }] },
    { key: 'lembrar', label: '5. Reter e ser lembrado', goal: 'Gerar indicação.', indicators: [{ key: 'indicacao_rate', label: 'Indicações ÷ contatos', kind: 'ratio', numerator: 'indicacoes', denominator: 'contatos' }] },
  ],
};

export const TEMPLATES: Record<string, FunnelConfig> = { 'advocacia-pf': TEMPLATE_ADVOCACIA_PF, generico: TEMPLATE_GENERICO };
export const TEMPLATE_LABEL: Record<string, string> = { 'advocacia-pf': 'Advocacia (pessoa física)', generico: 'Genérico (qualquer negócio)', custom: 'Personalizado' };

/** Modelo sugerido a partir do segmento do Perfil. É só sugestão: o cliente escolhe. */
export function suggestTemplate(segment: unknown): string {
  return segment === 'Advocacia' ? 'advocacia-pf' : 'generico';
}

/** Cópia profunda do modelo, com o lembrete do conselho de classe do segmento (vindo do Perfil) aplicado às etapas de conteúdo e análise quando o modelo não trouxer um. */
export function configFromTemplate(template: string, council?: string | null): FunnelConfig {
  const base = TEMPLATES[template] || TEMPLATE_GENERICO;
  const cfg = JSON.parse(JSON.stringify(base)) as FunnelConfig;
  if (council) for (const s of cfg.stages) if (!s.compliance && /conte|propor|anal|atrair|responder/i.test(s.key)) s.compliance = council;
  return cfg;
}

// ------------------------------------------------------------------------------------------------------------ validação
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; where?: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number, min = 1): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const KINDS: MetricKind[] = ['count', 'minutes', 'days', 'number'];

function readMetric(raw: unknown, forceCount: boolean): FunnelMetric | null {
  if (!isObj(raw)) return null;
  const key = typeof raw.key === 'string' && KEY_RE.test(raw.key) ? raw.key : null;
  const label = text(raw.label, LIMITS.label, 2);
  const kind = forceCount ? 'count' : (KINDS.includes(raw.kind as MetricKind) ? (raw.kind as MetricKind) : null);
  if (!key || !label || !kind) return null;
  const hint = raw.hint === undefined || raw.hint === null || raw.hint === '' ? undefined : text(raw.hint, LIMITS.text);
  if (raw.hint !== undefined && raw.hint !== null && raw.hint !== '' && !hint) return null;
  return { key, label, kind, ...(hint ? { hint } : {}) };
}

/** Valida e normaliza uma configuração vinda da tela. Qualquer campo fora do contrato recusa a configuração inteira (sem remendo silencioso). */
export function validateConfig(raw: unknown): Checked<FunnelConfig> {
  if (!isObj(raw)) return { ok: false, error: 'config_invalid' };
  if (raw.version !== 1) return { ok: false, error: 'config_version_unsupported' };
  const template = typeof raw.template === 'string' && /^[a-z][a-z0-9-]{1,30}$/.test(raw.template) ? raw.template : null;
  if (!template) return { ok: false, error: 'config_template_invalid' };
  if (!Array.isArray(raw.counts) || raw.counts.length < 2 || raw.counts.length > LIMITS.counts) return { ok: false, error: 'counts_invalid', where: 'counts' };
  if (!Array.isArray(raw.extras) || raw.extras.length > LIMITS.extras) return { ok: false, error: 'extras_invalid', where: 'extras' };
  if (!Array.isArray(raw.stages) || raw.stages.length < 1 || raw.stages.length > LIMITS.stages) return { ok: false, error: 'stages_invalid', where: 'stages' };
  const counts: FunnelMetric[] = [];
  for (const [i, c] of raw.counts.entries()) { const m = readMetric(c, true); if (!m) return { ok: false, error: 'count_invalid', where: `counts.${i}` }; counts.push(m); }
  const extras: FunnelMetric[] = [];
  for (const [i, c] of raw.extras.entries()) { const m = readMetric(c, false); if (!m) return { ok: false, error: 'extra_invalid', where: `extras.${i}` }; extras.push(m); }
  const keys = [...counts, ...extras].map((m) => m.key);
  if (new Set(keys).size !== keys.length) return { ok: false, error: 'metric_key_duplicated' };
  const known = new Map([...counts, ...extras].map((m) => [m.key, m]));
  const stages: FunnelStage[] = [];
  const stageKeys = new Set<string>();
  for (const [i, s] of raw.stages.entries()) {
    if (!isObj(s)) return { ok: false, error: 'stage_invalid', where: `stages.${i}` };
    const key = typeof s.key === 'string' && KEY_RE.test(s.key) ? s.key : null;
    const label = text(s.label, LIMITS.label, 2);
    const goal = text(s.goal, LIMITS.text, 2);
    if (!key || !label || !goal || stageKeys.has(key)) return { ok: false, error: 'stage_invalid', where: `stages.${i}` };
    stageKeys.add(key);
    if (!Array.isArray(s.indicators) || s.indicators.length > LIMITS.indicatorsPerStage) return { ok: false, error: 'indicators_invalid', where: `stages.${i}.indicators` };
    const compliance = s.compliance === undefined || s.compliance === null || s.compliance === '' ? undefined : text(s.compliance, LIMITS.text);
    if (s.compliance !== undefined && s.compliance !== null && s.compliance !== '' && !compliance) return { ok: false, error: 'stage_invalid', where: `stages.${i}.compliance` };
    const indicators: FunnelIndicator[] = [];
    for (const [j, ind] of s.indicators.entries()) {
      const where = `stages.${i}.indicators.${j}`;
      if (!isObj(ind)) return { ok: false, error: 'indicator_invalid', where };
      const ikey = typeof ind.key === 'string' && KEY_RE.test(ind.key) ? ind.key : null;
      const ilabel = text(ind.label, LIMITS.label, 2);
      if (!ikey || !ilabel) return { ok: false, error: 'indicator_invalid', where };
      if (ind.kind === 'ratio') {
        const n = typeof ind.numerator === 'string' ? known.get(ind.numerator) : undefined;
        const d = typeof ind.denominator === 'string' ? known.get(ind.denominator) : undefined;
        if (!n || !d || n.kind !== 'count' || d.kind !== 'count') return { ok: false, error: 'indicator_reference_invalid', where };
        indicators.push({ key: ikey, label: ilabel, kind: 'ratio', numerator: n.key, denominator: d.key });
      } else if (ind.kind === 'per_week' || ind.kind === 'metric') {
        const m = typeof ind.metric === 'string' ? known.get(ind.metric) : undefined;
        if (!m || (ind.kind === 'per_week' && m.kind !== 'count')) return { ok: false, error: 'indicator_reference_invalid', where };
        indicators.push({ key: ikey, label: ilabel, kind: ind.kind, metric: m.key });
      } else return { ok: false, error: 'indicator_invalid', where };
    }
    if (new Set(indicators.map((x) => x.key)).size !== indicators.length) return { ok: false, error: 'indicator_key_duplicated', where: `stages.${i}.indicators` };
    stages.push({ key, label, goal, indicators, ...(compliance ? { compliance } : {}) });
  }
  return { ok: true, value: { version: 1, template, counts, extras, stages } };
}

/** Valida os números de um mês. `null` limpa o número. Contagem precisa ser inteira; tempos e médias aceitam decimais. */
export function validateMonth(config: FunnelConfig, month: unknown, values: unknown): Checked<{ month: string; set: MonthValues; clear: string[] }> {
  if (typeof month !== 'string' || !MONTH_RE.test(month)) return { ok: false, error: 'month_invalid' };
  if (!isObj(values)) return { ok: false, error: 'values_invalid' };
  const metrics = new Map([...config.counts, ...config.extras].map((m) => [m.key, m]));
  const set: MonthValues = {};
  const clear: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const m = metrics.get(key);
    if (!m) return { ok: false, error: 'metric_unknown', where: key };
    if (raw === null || raw === '') { clear.push(key); continue; }
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > LIMITS.maxValue) return { ok: false, error: 'value_invalid', where: key };
    if (m.kind === 'count' && !Number.isInteger(n)) return { ok: false, error: 'count_must_be_integer', where: key };
    set[key] = m.kind === 'count' ? n : Math.round(n * 100) / 100;
  }
  return { ok: true, value: { month, set, clear } };
}

// ------------------------------------------------------------------------------------------------------------ cálculo
export const weeksIn = (month: string): number => {
  const m = MONTH_RE.exec(month);
  if (!m) return 4;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate() / 7;
};
export function previousMonth(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const monthsBack = (from: string, n: number): string[] => { const out: string[] = []; let cur = from; for (let i = 0; i < n; i++) { out.push(cur); cur = previousMonth(cur); } return out; };

const has = (v: MonthValues | undefined, k: string): v is MonthValues => !!v && typeof v[k] === 'number' && Number.isFinite(v[k]);
export const ratio = (a: number | undefined, b: number | undefined): number | null => (typeof a === 'number' && typeof b === 'number' && b > 0 ? a / b : null);

export interface StepResult {
  from: string; to: string; fromLabel: string; toLabel: string;
  fromValue: number | null; toValue: number | null;
  /** conversão do passo (0 a 1+) ou null se faltar número */
  rate: number | null; prevRate: number | null;
  /** variação em pontos percentuais sobre o mês anterior; null sem histórico */
  deltaPp: number | null;
  /** quantos ficaram pelo caminho neste passo (só quando downstream <= upstream) */
  lost: number | null;
  /** o número de baixo é maior que o de cima: provável erro de lançamento (ou origem diferente, como indicações) */
  inconsistent: boolean;
}
export interface IndicatorResult { key: string; label: string; kind: FunnelIndicator['kind']; unit: 'percent' | 'per_week' | MetricKind; value: number | null; prev: number | null; delta: number | null }
export interface StageResult { key: string; label: string; goal: string; compliance?: string; indicators: IndicatorResult[]; missing: string[] }
export interface Leak { stepIndex: number; reason: 'maior_queda' | 'mais_baixa'; text: string }
export interface FunnelAnalysis { month: string; previous: string; steps: StepResult[]; stages: StageResult[]; leak: Leak | null; filled: number; expected: number; warnings: string[] }

function indicatorValue(ind: FunnelIndicator, v: MonthValues | undefined, month: string): number | null {
  if (!v) return null;
  if (ind.kind === 'ratio') return has(v, ind.numerator) && has(v, ind.denominator) ? ratio(v[ind.numerator], v[ind.denominator]) : null;
  if (!has(v, ind.metric)) return null;
  return ind.kind === 'per_week' ? Math.round((v[ind.metric] / weeksIn(month)) * 10) / 10 : v[ind.metric];
}
const unitOf = (ind: FunnelIndicator, config: FunnelConfig): IndicatorResult['unit'] => {
  if (ind.kind === 'ratio') return 'percent';
  if (ind.kind === 'per_week') return 'per_week';
  return [...config.counts, ...config.extras].find((m) => m.key === ind.metric)?.kind || 'number';
};

export function analyze(config: FunnelConfig, entries: FunnelEntries, month: string): FunnelAnalysis {
  const prevMonth = previousMonth(month);
  const cur = entries[month];
  const prev = entries[prevMonth];
  const steps: StepResult[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < config.counts.length - 1; i++) {
    const a = config.counts[i]; const b = config.counts[i + 1];
    const fromValue = has(cur, a.key) ? cur[a.key] : null;
    const toValue = has(cur, b.key) ? cur[b.key] : null;
    const rate = ratio(toValue ?? undefined, fromValue ?? undefined);
    const prevRate = ratio(has(prev, b.key) ? prev[b.key] : undefined, has(prev, a.key) ? prev[a.key] : undefined);
    const inconsistent = fromValue !== null && toValue !== null && toValue > fromValue;
    if (inconsistent) warnings.push(`"${b.label}" (${toValue}) é maior que "${a.label}" (${fromValue}). Confira o lançamento ou, se a origem é outra (ex.: indicações), ignore.`);
    steps.push({
      from: a.key, to: b.key, fromLabel: a.label, toLabel: b.label, fromValue, toValue, rate, prevRate,
      deltaPp: rate !== null && prevRate !== null ? Math.round((rate - prevRate) * 1000) / 10 : null,
      lost: fromValue !== null && toValue !== null && !inconsistent ? fromValue - toValue : null,
      inconsistent,
    });
  }
  // onde o funil vaza: maior queda sobre o mês anterior do próprio projeto; sem histórico, o passo de menor conversão
  let leak: Leak | null = null;
  const withDelta = steps.map((s, i) => ({ s, i })).filter((x) => x.s.deltaPp !== null && !x.s.inconsistent);
  const worstDrop = withDelta.sort((x, y) => (x.s.deltaPp as number) - (y.s.deltaPp as number))[0];
  if (worstDrop && (worstDrop.s.deltaPp as number) < 0) {
    leak = { stepIndex: worstDrop.i, reason: 'maior_queda', text: `Maior queda sobre o mês anterior: de "${worstDrop.s.fromLabel}" para "${worstDrop.s.toLabel}" (${(worstDrop.s.deltaPp as number).toLocaleString('pt-BR')} pontos percentuais).` };
  } else {
    const lowest = steps.map((s, i) => ({ s, i })).filter((x) => x.s.rate !== null && !x.s.inconsistent).sort((x, y) => (x.s.rate as number) - (y.s.rate as number))[0];
    if (lowest && !withDelta.length) leak = { stepIndex: lowest.i, reason: 'mais_baixa', text: `Menor conversão do mês: de "${lowest.s.fromLabel}" para "${lowest.s.toLabel}" (${Math.round((lowest.s.rate as number) * 100)}%). Sem mês anterior para comparar.` };
  }
  const stages: StageResult[] = config.stages.map((s) => {
    const indicators = s.indicators.map((ind) => {
      const value = indicatorValue(ind, cur, month);
      const pv = indicatorValue(ind, prev, prevMonth);
      return { key: ind.key, label: ind.label, kind: ind.kind, unit: unitOf(ind, config), value, prev: pv, delta: value !== null && pv !== null ? Math.round((value - pv) * 1000) / 1000 : null };
    });
    return { key: s.key, label: s.label, goal: s.goal, ...(s.compliance ? { compliance: s.compliance } : {}), indicators, missing: indicators.filter((i) => i.value === null).map((i) => i.label) };
  });
  const expected = config.counts.length + config.extras.length;
  const filled = [...config.counts, ...config.extras].filter((m) => has(cur, m.key)).length;
  return { month, previous: prevMonth, steps, stages, leak, filled, expected, warnings };
}

/** Linhas da tabela mensal: do mês mais novo para o mais antigo, com as colunas do funil e a conversão de cada passo. */
export function monthlyTable(config: FunnelConfig, entries: FunnelEntries, months: string[]): Array<{ month: string; values: Array<number | null>; rates: Array<number | null> }> {
  return months.map((m) => {
    const v = entries[m];
    const values = config.counts.map((c) => (has(v, c.key) ? v[c.key] : null));
    const rates = values.slice(0, -1).map((a, i) => ratio(values[i + 1] ?? undefined, a ?? undefined));
    return { month: m, values, rates };
  });
}

export const formatValue = (value: number | null, unit: IndicatorResult['unit']): string => {
  if (value === null) return 'sem dados';
  if (unit === 'percent') return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (unit === 'per_week') return `${value.toLocaleString('pt-BR')} por semana`;
  if (unit === 'minutes') return value >= 120 ? `${(value / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : `${value.toLocaleString('pt-BR')} min`;
  if (unit === 'days') return `${value.toLocaleString('pt-BR')} dia(s)`;
  return value.toLocaleString('pt-BR');
};
