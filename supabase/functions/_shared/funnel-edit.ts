/**
 * Edição completa da configuração do funil e importação de números da planilha (módulo M1).
 *
 * Funções puras: cada edição devolve uma NOVA configuração (nunca altera a recebida) e o servidor valida de novo ao gravar
 * (`validateConfig`), então nada aqui é a última palavra sobre o que é permitido.
 */
import { LIMITS, type FunnelConfig, type MetricKind } from './funnel-core.ts';

const clone = (c: FunnelConfig): FunnelConfig => JSON.parse(JSON.stringify(c)) as FunnelConfig;
const foldKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Código interno único a partir do nome ("Contatos do nicho" vira contatos_do_nicho; repetido vira _2, _3…). */
export function slugKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base = foldKey(label).slice(0, 34);
  if (!/^[a-z]/.test(base)) base = `n_${base}`;
  if (base.length < 2) base = `${base}x`;
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}_${i}`;
  return key;
}
const allKeys = (c: FunnelConfig) => [...c.counts, ...c.extras, ...c.stages, ...c.stages.flatMap((s) => s.indicators)].map((x) => x.key);

/** Indicadores (de qualquer etapa) que dependem de um número. */
export function indicatorsUsing(c: FunnelConfig, metricKey: string): Array<{ stage: string; indicator: string; label: string }> {
  const out: Array<{ stage: string; indicator: string; label: string }> = [];
  for (const s of c.stages) {
    for (const i of s.indicators) {
      const refs = i.kind === 'ratio' ? [i.numerator, i.denominator] : [i.metric];
      if (refs.includes(metricKey)) out.push({ stage: s.label, indicator: i.key, label: i.label });
    }
  }
  return out;
}

export function addCount(c: FunnelConfig, label: string, hint?: string): FunnelConfig {
  const n = clone(c);
  if (n.counts.length >= LIMITS.counts || label.trim().length < 2) return n;
  n.template = 'custom';
  n.counts.push({ key: slugKey(label, allKeys(n)), label: label.trim(), kind: 'count', ...(hint ? { hint } : {}) });
  return n;
}
export function addExtra(c: FunnelConfig, label: string, kind: MetricKind, hint?: string): FunnelConfig {
  const n = clone(c);
  if (n.extras.length >= LIMITS.extras || label.trim().length < 2) return n;
  n.template = 'custom';
  n.extras.push({ key: slugKey(label, allKeys(n)), label: label.trim(), kind, ...(hint ? { hint } : {}) });
  return n;
}
export function moveCount(c: FunnelConfig, index: number, dir: -1 | 1): FunnelConfig {
  const n = clone(c);
  const j = index + dir;
  if (index < 0 || j < 0 || j >= n.counts.length || index >= n.counts.length) return n;
  [n.counts[index], n.counts[j]] = [n.counts[j], n.counts[index]];
  n.template = 'custom';
  return n;
}
/** Remove uma coluna ou número de apoio e os indicadores que dependiam dele. O funil precisa manter ao menos 2 colunas. */
export function removeMetric(c: FunnelConfig, key: string): { config: FunnelConfig; removedIndicators: string[]; blocked?: string } {
  const isCount = c.counts.some((m) => m.key === key);
  if (isCount && c.counts.length <= 2) return { config: c, removedIndicators: [], blocked: 'O funil precisa de pelo menos 2 colunas.' };
  const n = clone(c);
  const removed = indicatorsUsing(n, key).map((x) => x.label);
  n.counts = n.counts.filter((m) => m.key !== key);
  n.extras = n.extras.filter((m) => m.key !== key);
  for (const s of n.stages) s.indicators = s.indicators.filter((i) => !(i.kind === 'ratio' ? [i.numerator, i.denominator] : [i.metric]).includes(key));
  n.template = 'custom';
  return { config: n, removedIndicators: removed };
}
export function addStage(c: FunnelConfig, label: string, goal: string): FunnelConfig {
  const n = clone(c);
  if (n.stages.length >= LIMITS.stages || label.trim().length < 2) return n;
  n.template = 'custom';
  n.stages.push({ key: slugKey(label, allKeys(n)), label: label.trim(), goal: goal.trim().length >= 2 ? goal.trim() : 'Objetivo desta etapa.', indicators: [] });
  return n;
}
export function removeStage(c: FunnelConfig, key: string): FunnelConfig {
  const n = clone(c);
  if (n.stages.length <= 1) return n;
  n.stages = n.stages.filter((s) => s.key !== key);
  n.template = 'custom';
  return n;
}
export type NewIndicator = { label: string } & ({ kind: 'ratio'; numerator: string; denominator: string } | { kind: 'per_week' | 'metric'; metric: string });
export function addIndicator(c: FunnelConfig, stageKey: string, ind: NewIndicator): FunnelConfig {
  const n = clone(c);
  const stage = n.stages.find((s) => s.key === stageKey);
  if (!stage || stage.indicators.length >= LIMITS.indicatorsPerStage || ind.label.trim().length < 2) return n;
  const key = slugKey(ind.label, allKeys(n));
  stage.indicators.push(ind.kind === 'ratio'
    ? { key, label: ind.label.trim(), kind: 'ratio', numerator: ind.numerator, denominator: ind.denominator }
    : { key, label: ind.label.trim(), kind: ind.kind, metric: ind.metric });
  n.template = 'custom';
  return n;
}
export function removeIndicator(c: FunnelConfig, stageKey: string, indicatorKey: string): FunnelConfig {
  const n = clone(c);
  const stage = n.stages.find((s) => s.key === stageKey);
  if (stage) stage.indicators = stage.indicators.filter((i) => i.key !== indicatorKey);
  n.template = 'custom';
  return n;
}

// ------------------------------------------------------------------------------------------------------------ importar da planilha
const MONTHS_PT: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "2026-10", "10/2026", "out/2026", "outubro de 2026", "set 26" viram "2026-10"; null se não entender. */
export function parseMonth(raw: string): string | null {
  const t = strip(raw).trim();
  let m = /^(20\d{2})[-/.](0?[1-9]|1[0-2])$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = /^(0?[1-9]|1[0-2])[-/.](20\d{2})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^([a-z]{3})[a-z]*[\s/.-]*(?:de\s*)?(20\d{2}|\d{2})$/.exec(t);
  if (m && MONTHS_PT[m[1]]) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(MONTHS_PT[m[1]]).padStart(2, '0')}`;
  return null;
}

export interface PasteResult { months: Record<string, Record<string, string>>; matchedColumns: string[]; unknownColumns: string[]; errors: string[] }
/**
 * Lê uma tabela colada da planilha (separada por TAB, ponto e vírgula ou vírgula). Primeira linha = nomes das colunas (iguais aos nomes do funil,
 * sem diferenciar maiúsculas e acentos); primeira coluna = mês. Valores vazios são ignorados (nada vira zero). Devolve só texto: quem grava valida de novo.
 */
export function parsePaste(config: FunnelConfig, input: string): PasteResult {
  const out: PasteResult = { months: {}, matchedColumns: [], unknownColumns: [], errors: [] };
  const lines = input.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) { out.errors.push('Cole a linha de títulos e pelo menos uma linha de mês.'); return out; }
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const cells = (l: string) => l.split(sep).map((c) => c.trim());
  const norm = (s: string) => strip(s).replace(/\s+/g, ' ').trim();
  const byLabel = new Map([...config.counts, ...config.extras].map((m) => [norm(m.label), m.key]));
  const head = cells(lines[0]);
  const cols: Array<string | null> = head.map((h, i) => (i === 0 ? null : byLabel.get(norm(h)) ?? null));
  head.forEach((h, i) => { if (i === 0) return; if (cols[i]) out.matchedColumns.push(h); else if (h) out.unknownColumns.push(h); });
  if (!out.matchedColumns.length) { out.errors.push('Nenhuma coluna tem o nome de um número do funil. Use os mesmos nomes da tabela "Lançar os números".'); return out; }
  for (const [n, line] of lines.slice(1).entries()) {
    const row = cells(line);
    const month = parseMonth(row[0] || '');
    if (!month) { out.errors.push(`Linha ${n + 2}: não entendi o mês "${row[0] || ''}". Use 2026-10, 10/2026 ou out/2026.`); continue; }
    for (const [i, key] of cols.entries()) {
      if (!key) continue;
      const v = (row[i] || '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '');
      if (v === '') continue;
      (out.months[month] ||= {})[key] = v;
    }
  }
  return out;
}
