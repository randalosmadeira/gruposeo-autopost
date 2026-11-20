/**
 * Piloto Automático de Otimização: núcleo puro (sem rede, sem banco; a IA, o teto de gasto e o relógio entram por portas injetadas).
 *
 * Ordem: (1) analisa sem IA; (2) correções DETERMINÍSTICAS (tabela em markdown cru, parágrafo longo, alt de imagem, H2 em pergunta quando seguro,
 * links internos com URLs reais, bloco de fontes JÁ INFORMADAS, plano de schema); (3) só depois, correções por IA em passos PEQUENOS e separados
 * (conclusão, legibilidade por trecho, tom conversacional), cada um com teto de tokens baixo; no máximo `max_ai_steps` passos.
 *
 * Regras de ouro:
 *  - NUNCA inventa fato, número, citação, nome, lei, fonte ou link. Todo texto de IA passa por guardas (números e links iguais aos do original, nenhum
 *    nome próprio novo, tamanho parecido, nenhuma fonte nova). Reprovou na guarda: o trecho original fica e o item vira PENDÊNCIA HUMANA.
 *  - Sem fonte verificável informada, dado/fonte/citação/autor viram pendência (nunca preenchimento).
 *  - Cada chamada de IA passa pelo gate do teto diário (a porta de IA reserva e confirma). Teto atingido: o piloto PARA, não toca no artigo e devolve o
 *    relatório do que faltou.
 *  - Idempotente: rodar duas vezes sobre o resultado não duplica nada (testado). O resultado é um RASCUNHO (proposta); quem aplica é o handler.
 *  - Neutro de idioma e de segmento: o idioma vem do artigo; o pacote de conformidade (OAB, saúde, finanças...) é opcional e avisa por padrão.
 */
import { analyzeContent, calculateScore, evaluateFindings, type Analysis, type Finding } from './seo-analysis-core.ts';
import { isOn, type RuleId, type RuleProfile } from './optimization-rules.ts';
import { LANGUAGES, resolveLanguage, textStats, type LanguageProfile } from './language-packs.ts';
import { insertInternalLinks, markdownTablesToHtml, questionifyHeadings, splitLongParagraphs, ensureImgAlt, type AddedLink, type LinkCandidate } from './auto-optimize-fixes.ts';
import { buildSchemaPlan, type SchemaPlan } from './schema-completeness.ts';
import { resolvePack, runPack, type PackId, type PackResult } from './segment-packs.ts';
import { findPublicationResidues } from './publication-safety.ts';
import { mapSegmentToSector } from './sector-config.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const PILOT_VERSION = 1;

export interface PilotArticle { id: string; title: string; keyword: string; excerpt: string; content: string; slug?: string | null; language?: string | null; published_url?: string | null; published_at?: string | null; created_at?: string | null; updated_at?: string | null; featured_image_url?: string | null; config?: Record<string, unknown> | null }
export interface PilotSource { url: string; title?: string }
export interface PilotInput {
  article: PilotArticle;
  project: Record<string, unknown> | null;
  rules: RuleProfile;
  candidates: LinkCandidate[];
  /** fontes VERIFICADAS já informadas (config.primary_sources etc.). Só estas podem aparecer no texto. */
  sources: PilotSource[];
  /** texto do convite ao contato do projeto (cta_conclusao); vazio = convite genérico do idioma, sem dado de contato */
  cta?: string | null;
  segment?: unknown;
  brand?: string | null;
  /** impressões digitais de trechos que uma rodada anterior já reescreveu ou que a guarda já recusou: não gastam IA de novo */
  skipUnits?: string[];
}

export interface AiRequest { stepId: string; task: 'content_editing'; system: string; user: string; maxTokens: number; temperature: number }
export interface AiReply { content: string; costMicros: number; model?: string; usage?: { inputTokens: number; outputTokens: number } }
/** A porta de IA reserva no teto diário ANTES de chamar e confirma depois; negado = lança SpendDeniedError. */
export interface AiPort { call(req: AiRequest): Promise<AiReply> }
export interface PilotDeps {
  ai: AiPort;
  now?: () => number;
}

// ---------- tipos do trabalho e do relatório ----------

export type StepKind = 'deterministico' | 'ia';
export interface AppliedItem { id: string; kind: StepKind; label: string; detail?: string; count?: number; costMicros?: number }
export type PendingKind = 'humano' | 'teto' | 'rejeitado' | 'limite' | 'conformidade' | 'plugin';
export interface PendingItem { id: string; label: string; reason: string; kind: PendingKind }
export interface StepLog { id: string; kind: StepKind; status: 'aplicado' | 'rejeitado' | 'teto' | 'pulado' | 'erro'; detail?: string; costMicros: number; tokens?: { in: number; out: number } }
export interface Working { title: string; content: string; excerpt: string }

export interface PilotJob {
  v: 1;
  working: Working;
  originalHash: string;
  applied: AppliedItem[];
  pending: PendingItem[];
  steps: StepLog[];
  attempted: string[];
  /** trechos tocados nesta rodada (impressão digital): o handler grava para as próximas rodadas não repetirem o gasto */
  touchedUnits: string[];
  aiUsed: number;
  costMicros: number;
  deterministicDone: boolean;
  stopped: null | { reason: 'teto' | 'erro' | 'limite'; message: string };
  done: boolean;
  compliance: Array<{ code: string; label: string; sample?: string }>;
  schema: { types: string[]; notes: string[]; author: { name: string; identified: boolean }; datesCoherent: boolean; policy: SchemaPlan['policy']; language: SchemaPlan['language']; areaServed: string[] } | null;
}

export interface PilotReport {
  version: number;
  article_id: string;
  language: { tag: string; source: string; formula: string | null };
  base_hash: string;
  final_hash: string;
  unchanged: boolean;
  partial: boolean;
  before: { score: number; failing: RuleId[] };
  after: { score: number; failing: RuleId[] };
  applied: AppliedItem[];
  pending: PendingItem[];
  steps: StepLog[];
  cost_usd_micros: number;
  cost_is_estimate: true;
  stopped: PilotJob['stopped'];
  compliance: { pack: PackId | null; mode: string; warnings: PilotJob['compliance'] };
  schema: PilotJob['schema'];
  rules_layers: string[];
  generated_at: string;
}

// ---------- utilidades ----------

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const stripTags = (v: string) => v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
/** Impressão digital curta de um trecho (cyrb53 sobre o texto sem marcação): serve só para não repetir passo de IA. */
export function unitFingerprint(html: string): string {
  const s = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const asIso = (ms: number) => new Date(ms).toISOString();

export function langOf(input: PilotInput, text: string) {
  const cfg = (input.article.config || {}) as Any;
  return resolveLanguage({ configured: [input.article.language, cfg.language, (input.project as Any)?.nexus_strategy?.language, (input.project as Any)?.editorial_identity?.language], text });
}

/** Análise do estado atual do trabalho (mesmas contas da tela de análise). */
export function analyzeWorking(input: PilotInput, w: Working, schemaTypes?: string[]): { analysis: Analysis; findings: Finding[]; score: number } {
  const art = { ...input.article, title: w.title, excerpt: w.excerpt, content: w.content };
  const plan = schemaTypes ?? buildPlan(input, w).types;
  const seoPlugin = String((input.project as Any)?.seo_plugin || '').trim().toLowerCase() || null;
  const analysis = analyzeContent(w.content, stripTags(w.content), art, input.project, input.rules, { schemaTypes: plan, seoPlugin: seoPlugin === 'none' ? null : seoPlugin, ctaText: input.cta });
  return { analysis, findings: evaluateFindings(analysis, input.rules), score: Math.min(100, calculateScore(analysis, input.rules)) };
}

function buildPlan(input: PilotInput, w: Working): SchemaPlan {
  const cfg = (input.article.config || {}) as Any;
  const sector = mapSegmentToSector(String(cfg.segment || (input.project as Any)?.nicho || input.segment || 'general'));
  return buildSchemaPlan({ article: { ...input.article, title: w.title, excerpt: w.excerpt, content: w.content }, project: input.project || {}, sectorType: sector });
}

export function newJob(input: PilotInput, originalHash: string): PilotJob {
  const a = input.article;
  return { v: 1, working: { title: a.title || '', content: a.content || '', excerpt: a.excerpt || '' }, originalHash, applied: [], pending: [], steps: [], attempted: [], touchedUnits: [], aiUsed: 0, costMicros: 0, deterministicDone: false, stopped: null, done: false, compliance: [], schema: null };
}

// ---------- guardas contra invenção ----------

const NUM = /\d+(?:[.,]\d+)*/g;
const multiset = (items: string[]) => { const m = new Map<string, number>(); for (const i of items) m.set(i, (m.get(i) || 0) + 1); return m; };
const numerals = (text: string) => (text.match(NUM) || []).map((n) => n.replace(/[.,]+$/, ''));
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].trim().toLowerCase().replace(/\/+$/, ''));
const bareUrls = (text: string) => (text.match(/https?:\/\/[^\s<>"')]+/gi) || []).map((u) => u.toLowerCase().replace(/\/+$/, ''));
const capsTokens = (text: string): Set<string> => new Set((text.match(/\p{Lu}[\p{L}'’-]{2,}/gu) || []).map((t) => t.toLowerCase()));
const sameMultiset = (a: string[], b: string[]) => { const x = multiset(a); const y = multiset(b); if (x.size !== y.size) return false; for (const [k, v] of x) if (y.get(k) !== v) return false; return true; };

export interface GuardResult { ok: boolean; violations: string[] }

/**
 * Compara um trecho reescrito com o original. Regra: o texto novo pode ser mais curto, mais simples, mais direto; NÃO pode trazer número, link, nome
 * próprio, fonte ou citação que o original não tinha. `context` = texto de onde nomes próprios já podem vir (o artigo inteiro, o convite do projeto).
 */
export function guardRewrite(beforeHtml: string, afterHtml: string, lang: LanguageProfile | null, context = ''): GuardResult {
  const v: string[] = [];
  const before = stripTags(beforeHtml); const after = stripTags(afterHtml);
  if (!after) return { ok: false, violations: ['resposta vazia'] };
  if (/```|^\s*#{1,6}\s|\*\*[^*]+\*\*|<(?:script|style|iframe)/im.test(afterHtml)) v.push('markdown ou marcação indevida na resposta');
  if (!sameMultiset(numerals(before), numerals(after))) v.push('os números do trecho mudaram (o piloto não cria nem remove dado)');
  if (!sameMultiset(hrefs(beforeHtml), hrefs(afterHtml))) v.push('os links do trecho mudaram');
  if (!sameMultiset(bareUrls(before), bareUrls(after))) v.push('apareceu ou sumiu um endereço de internet');
  const known = capsTokens(`${before} ${context}`);
  const sentenceStarts = new Set((after.match(/(?:^|[.!?…]\s+)(\p{Lu}[\p{L}'’-]{2,})/gu) || []).map((s) => s.replace(/^[.!?…\s]+/, '').toLowerCase()));
  const novos = [...capsTokens(after)].filter((t) => !known.has(t) && !sentenceStarts.has(t));
  if (novos.length) v.push(`nome(s) novo(s) que o original não tinha: ${novos.slice(0, 4).join(', ')}`);
  if (lang) {
    const count = (t: string) => lang.sourcePhrases.reduce((n, re) => n + (t.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) || []).length, 0);
    if (count(after) > count(before)) v.push('apareceu uma atribuição de fonte nova ("segundo...", "according to...")');
  }
  const wb = before.split(/\s+/).filter(Boolean).length; const wa = after.split(/\s+/).filter(Boolean).length;
  if (wa < wb * 0.5 || wa > wb * 1.5) v.push(`tamanho fora do esperado (${wb} para ${wa} palavras)`);
  if (findPublicationResidues({ content: afterHtml }).length) v.push('resíduo de prompt ou placeholder na resposta');
  return { ok: v.length === 0, violations: v };
}

/** Guarda do texto de conclusão: sem número, link, e-mail, telefone nem nome que o artigo e o convite do projeto já não tenham. */
export function guardConclusion(afterHtml: string, articleText: string, cta: string, lang: LanguageProfile | null): GuardResult {
  const v: string[] = [];
  const after = stripTags(afterHtml);
  if (!after) return { ok: false, violations: ['resposta vazia'] };
  if (/```|<(?:script|style|iframe|h1|h2)/i.test(afterHtml)) v.push('marcação indevida (só parágrafos)');
  const allowedNums = new Set(numerals(`${articleText} ${cta}`));
  const novosNums = numerals(after).filter((n) => !allowedNums.has(n));
  if (novosNums.length) v.push(`número novo na conclusão: ${novosNums.slice(0, 3).join(', ')}`);
  if (/https?:\/\/|www\.|@[\p{L}\d]|\+?\d[\d\s().-]{7,}/iu.test(after) || /<a\b/i.test(afterHtml)) v.push('a conclusão não pode trazer link, e-mail ou telefone (o convite do projeto é inserido à parte)');
  const known = capsTokens(`${articleText} ${cta}`);
  const starts = new Set((after.match(/(?:^|[.!?…]\s+)(\p{Lu}[\p{L}'’-]{2,})/gu) || []).map((s) => s.replace(/^[.!?…\s]+/, '').toLowerCase()));
  const novos = [...capsTokens(after)].filter((t) => !known.has(t) && !starts.has(t));
  if (novos.length) v.push(`nome(s) novo(s) na conclusão: ${novos.slice(0, 4).join(', ')}`);
  if (/\b(?:garant|guarante|garantiz|100\s*%)/i.test(after)) v.push('promessa de resultado');
  if (after.split(/\s+/).length > 160) v.push('conclusão longa demais');
  if (lang) { /* sem verificação extra por idioma */ }
  return { ok: v.length === 0, violations: v };
}

// ---------- trechos de parágrafos ----------

export interface Unit { start: number; end: number; html: string; words: number; flesch: number | null; markers: number }

/** Grupos de <p> consecutivos (até `maxWords` palavras cada). Só parágrafos: listas, tabelas e títulos nunca são reescritos por IA. */
export function findParagraphUnits(html: string, lang: LanguageProfile | null, maxWords = 320): Unit[] {
  const ps = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map((m) => ({ s: m.index as number, e: (m.index as number) + m[0].length, t: m[0] }));
  const units: Unit[] = [];
  let cur: typeof ps = [];
  const flush = () => {
    if (!cur.length) return;
    const start = cur[0].s; const end = cur[cur.length - 1].e;
    const text = stripTags(html.slice(start, end));
    const words = text.split(/\s+/).filter(Boolean).length;
    const f = lang?.readability ? lang.readability.compute(textStats(text, lang.code)) : null;
    const markers = lang ? (text.match(new RegExp(lang.conversational, 'giu')) || []).length : 0;
    units.push({ start, end, html: html.slice(start, end), words, flesch: f, markers });
    cur = [];
  };
  let curWords = 0;
  for (const p of ps) {
    const between = cur.length ? html.slice(cur[cur.length - 1].e, p.s) : '';
    const w = stripTags(p.t).split(/\s+/).filter(Boolean).length;
    if (cur.length && (between.replace(/\s+/g, '') !== '' || curWords + w > maxWords)) { flush(); curWords = 0; }
    cur.push(p); curWords += w;
  }
  flush();
  return units;
}

// ---------- 1) correções determinísticas ----------

const label = (l: LanguageProfile | null, key: keyof LanguageProfile['labels']) => (l ?? LANGUAGES.en).labels[key];

export function runDeterministic(input: PilotInput, job: PilotJob): PilotJob {
  const out = clone(job);
  const r = input.rules;
  const w = out.working;
  const lang = langOf(input, stripTags(w.content));
  const lp = lang.profile;
  const add = (item: AppliedItem) => out.applied.push(item);

  if (isOn(r, 'no_markdown_tables')) {
    const t = markdownTablesToHtml(w.content);
    if (t.changed) { w.content = t.html; add({ id: 'no_markdown_tables', kind: 'deterministico', label: 'Tabelas em markdown cru viraram tabelas HTML', count: t.changed }); }
  }
  if (isOn(r, 'paragraph_words')) {
    const p = splitLongParagraphs(w.content, r.rules.paragraph_words.value ?? 60);
    if (p.changed) { w.content = p.html; add({ id: 'paragraph_words', kind: 'deterministico', label: 'Parágrafos longos divididos em fronteiras de frase', count: p.changed }); }
  }
  if (isOn(r, 'image_alt')) {
    const a = ensureImgAlt(w.content, { title: w.title, keyword: input.article.keyword });
    if (a.changed) { w.content = a.html; add({ id: 'image_alt', kind: 'deterministico', label: 'Imagens sem texto alternativo receberam um a partir do contexto', count: a.changed }); }
  }
  if (isOn(r, 'h2_question_pct')) {
    const q = questionifyHeadings(w.content, r.rules.h2_question_pct.value ?? 50, lp);
    if (q.changed) { w.content = q.html; add({ id: 'h2_question_pct', kind: 'deterministico', label: 'Títulos de seção reescritos como pergunta (só os de regra segura)', count: q.changed, detail: q.headings.map((h) => `"${h.from}" -> "${h.to}"`).join('; ') }); }
  }
  if (isOn(r, 'internal_links')) {
    const have = (analyzeWorking(input, w).analysis.structure.internalLinks);
    const needed = (r.rules.internal_links.value ?? 10) - have;
    if (needed > 0) {
      const il = insertInternalLinks(w.content, input.candidates, { needed, selfUrl: input.article.published_url || undefined, lang: lp });
      if (il.added.length) { w.content = il.html; add({ id: 'internal_links', kind: 'deterministico', label: 'Links internos inseridos com endereços reais do próprio site', count: il.added.length, detail: summarizeLinks(il.added) }); }
      if (il.shortfall > 0) out.pending.push({ id: 'internal_links', label: 'Links internos', kind: 'humano', reason: `Faltam ${il.shortfall} link(s) para o mínimo de ${r.rules.internal_links.value ?? 10}: não há mais artigos do mesmo site que combinem. O piloto não inventa endereço.` });
    }
  }
  // Conclusão que já existe mas sem convite: acrescenta o convite do PROJETO (texto dele, ou o convite genérico do idioma, sem dado de contato).
  if (isOn(r, 'conclusion_cta')) {
    const an = analyzeWorking(input, w).analysis;
    if (an.structure.hasConclusion && !an.structure.hasCTA) {
      const cta = (input.cta || '').trim() || (lp ? CTA_GENERIC[lp.code] : CTA_GENERIC.en) || CTA_GENERIC.en;
      w.content = `${w.content.trimEnd()}
<p>${cta.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
      add({ id: 'conclusion_cta', kind: 'deterministico', label: 'Convite ao contato acrescentado ao fim da conclusão existente' });
    }
  }
  // Fontes já informadas pelo projeto: bloco simples, idempotente. Nada de dado novo.
  if (isOn(r, 'external_links') && input.sources.length) {
    const present = new Set(hrefs(w.content));
    const fresh = input.sources.filter((s) => /^https?:\/\//i.test(s.url) && !present.has(s.url.toLowerCase().replace(/\/+$/, '')));
    const heading = lp ? (({ pt: 'Fontes', en: 'Sources', es: 'Fuentes', fr: 'Sources', it: 'Fonti', de: 'Quellen', nl: 'Bronnen' } as Record<string, string>)[lp.code] || 'Sources') : 'Sources';
    const already = new RegExp(`<p>\\s*<strong>\\s*${heading}\\s*:?\\s*</strong>`, 'i').test(w.content);
    if (fresh.length && !already) {
      const items = fresh.slice(0, 6).map((s) => `<li><a href="${s.url.replace(/"/g, '&quot;')}">${(s.title || s.url).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`).join('');
      w.content = `${w.content.trimEnd()}\n<p><strong>${heading}:</strong></p>\n<ul>${items}</ul>`;
      add({ id: 'external_links', kind: 'deterministico', label: 'Fontes informadas pelo projeto listadas no fim do artigo', count: Math.min(fresh.length, 6) });
    }
  }

  // Plano de schema (vai por post-meta na publicação; o corpo não carrega <script>)
  const plan = buildPlan(input, w);
  out.schema = { types: plan.types, notes: plan.notes, author: plan.author, datesCoherent: plan.datesCoherent, policy: plan.policy, language: plan.language, areaServed: plan.areaServed };
  if (isOn(r, 'schema_article') || isOn(r, 'breadcrumb')) add({ id: 'schema_article', kind: 'deterministico', label: `Schema preparado para a publicação: ${plan.types.join(', ') || 'nenhum'}`, detail: plan.notes.join(' ') || undefined });
  if (isOn(r, 'author_byline') && !plan.author.identified) out.pending.push({ id: 'author_byline', label: 'Autor identificado', kind: 'humano', reason: 'O autor é genérico ou igual à empresa. O sistema não inventa autor: cadastre a pessoa real no projeto.' });
  if (isOn(r, 'dates_coherent') && !plan.datesCoherent) add({ id: 'dates_coherent', kind: 'deterministico', label: 'Data de modificação ajustada para não ficar antes da publicação' });
  if (isOn(r, 'schema_faq')) { /* FAQPage: só informativo; o plano já o inclui quando há perguntas e respostas reais */ }

  out.deterministicDone = true;
  out.steps.push({ id: 'deterministico', kind: 'deterministico', status: out.applied.length ? 'aplicado' : 'pulado', detail: out.applied.length ? `${out.applied.length} correção(ões) sem IA` : 'nada a corrigir sem IA', costMicros: 0 });
  return out;
}

const summarizeLinks = (added: AddedLink[]) => added.map((a) => `${a.mode === 'bloco' ? '[bloco]' : '[texto]'} ${a.anchor}`).join('; ').slice(0, 400);

// ---------- 2) passos de IA (pequenos) ----------

export interface PlannedStep { id: string; key: string; label: string; ruleId: RuleId; unit?: Unit }

/** Quais passos de IA ainda valem a pena, em ordem. Cada passo é UMA chamada pequena. */
export function planAiSteps(input: PilotInput, job: PilotJob): PlannedStep[] {
  const r = input.rules;
  const { analysis: a } = analyzeWorking(input, job.working);
  const lang = langOf(input, stripTags(job.working.content));
  const lp = lang.profile;
  const steps: PlannedStep[] = [];
  const attempted = new Set(job.attempted);
  const skip = new Set([...(input.skipUnits || []), ...job.touchedUnits]);
  // Só escreve conclusão se o artigo ainda não tem uma. Conclusão existente sem convite recebe o convite do projeto (determinístico, sem IA).
  if (isOn(r, 'conclusion_cta') && !a.structure.hasConclusion && !attempted.has('conclusion')) {
    steps.push({ id: 'conclusion', key: 'conclusion', label: 'Conclusão com convite ao contato', ruleId: 'conclusion_cta' });
  }
  const units = findParagraphUnits(job.working.content, lp);
  if (isOn(r, 'flesch') && a.flesch.score !== null && !a.flesch.passed) {
    const worst = units.filter((u) => u.words >= 40 && u.flesch !== null).sort((x, y) => (x.flesch as number) - (y.flesch as number));
    for (const u of worst) { const key = `readability:${u.start}:${u.words}`; if (!attempted.has(key) && !skip.has(unitFingerprint(u.html)) && (u.flesch as number) < (a.flesch.min ?? 60)) steps.push({ id: 'readability', key, label: 'Legibilidade de um trecho', ruleId: 'flesch', unit: u }); }
  }
  if (isOn(r, 'conversational_tone') && lp && !a.geo.isConversational) {
    const cand = units.filter((u) => u.words >= 60 && u.markers === 0 && !skip.has(unitFingerprint(u.html)));
    for (const u of cand.slice(0, 2)) { const key = `conversational:${u.start}:${u.words}`; if (!attempted.has(key)) steps.push({ id: 'conversational', key, label: 'Tom conversacional de um trecho', ruleId: 'conversational_tone', unit: u }); }
  }
  return steps;
}

const sysRewrite = (lang: string, sentenceMax: number, goal: 'readability' | 'conversational') => `You are a careful copy editor. The text is in ${lang}; answer in the same language.
${goal === 'readability'
    ? `Goal: make the HTML easier to read. Use shorter sentences (at most ${sentenceMax} words each), plain words and the active voice.`
    : 'Goal: address the reader directly in a natural way (second person, with at most one rhetorical question) without changing the meaning.'}
HARD RULES: keep every fact, number, date, name, law or citation and every <a href> exactly as written. Do not add facts, numbers, names, sources, links, promises or opinions. Do not remove information. Keep the same kind of HTML (only <p>, <strong>, <em>, <a>). Output ONLY the rewritten HTML, nothing else.`;

const cleanHtmlReply = (s: string) => s.trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();

const isSpendDenied = (e: unknown): { message: string; code?: string } | null => {
  const err = e as Any;
  if (err && (err.name === 'SpendDeniedError' || err.info?.code)) return { message: String(err.info?.message || err.message || 'teto diário atingido'), code: err.info?.code };
  return null;
};

/** Executa UM passo de IA e devolve o trabalho atualizado. Nunca lança: falha vira registro no relatório. */
export async function runAiStep(input: PilotInput, job: PilotJob, step: PlannedStep, deps: PilotDeps): Promise<PilotJob> {
  const out = clone(job);
  out.attempted.push(step.key);
  const r = input.rules;
  const lang = langOf(input, stripTags(out.working.content));
  const lp = lang.profile;
  const langName = lp?.name ?? (lang.tag !== 'und' ? lang.tag : 'the same language as the text');
  const maxTokens = r.options.step_max_tokens;
  const log = (s: Omit<StepLog, 'id' | 'kind'>) => out.steps.push({ id: step.id, kind: 'ia', ...s });

  const segment = (input.article.config as Any)?.segment ?? (input.project as Any)?.nicho ?? input.segment;
  const pack = resolvePack(r.options.compliance_pack, segment, { code: lang.code, region: lang.region });
  const complianceOf = (html: string): PackResult => runPack(pack, r.options.compliance_mode, { content: html, brand: input.brand });
  const articleText = stripTags(out.working.content);

  let request: AiRequest;
  let apply: (reply: string) => { ok: true; content: string; detail: string } | { ok: false; violations: string[] };

  if (step.id === 'conclusion') {
    const cta = (input.cta || '').trim();
    const heads = [...out.working.content.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => stripTags(m[1])).slice(0, 12).join(' | ');
    const firstP = stripTags((out.working.content.match(/<p\b[^>]*>[\s\S]*?<\/p>/i) || [''])[0]).slice(0, 600);
    request = {
      stepId: step.key, task: 'content_editing', temperature: 0.2, maxTokens: Math.min(maxTokens, 700),
      system: `You write a short closing for an article. Language: ${langName}. Write ONE or TWO short <p> paragraphs that summarize ONLY what the article already says (use the section titles and intro below). HARD RULES: no new facts, numbers, names, links, emails, phone numbers, prices or promises of results; do not write a heading or a call to action (it is added separately). Output ONLY the <p> paragraphs.`,
      user: `Article title: ${out.working.title}\nSection titles: ${heads || '(none)'}\nIntro: ${firstP}`,
    };
    apply = (reply) => {
      const html = cleanHtmlReply(reply);
      const g = guardConclusion(html, articleText, cta, lp);
      if (!g.ok) return { ok: false, violations: g.violations };
      const c = complianceOf(html);
      if (c.blocking) return { ok: false, violations: c.warnings.map((x) => `conformidade (${x.label})`) };
      for (const x of c.warnings) out.compliance.push({ code: x.code, label: x.label, sample: x.sample });
      const ctaText = cta || (lp ? CTA_GENERIC[lp.code] : CTA_GENERIC.en) || CTA_GENERIC.en;
      const block = `\n<h2>${label(lp, 'conclusionHeading')}</h2>\n${html}\n<p>${ctaText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
      return { ok: true, content: `${out.working.content.trimEnd()}${block}`, detail: 'conclusão curta (resumo do que o artigo já diz) e convite ao contato' };
    };
  } else {
    const u = step.unit as Unit;
    const goal = step.id === 'readability' ? 'readability' : 'conversational';
    request = { stepId: step.key, task: 'content_editing', temperature: 0.2, maxTokens, system: sysRewrite(langName, r.rules.sentence_words.value ?? 25, goal), user: u.html };
    apply = (reply) => {
      const html = cleanHtmlReply(reply);
      const g = guardRewrite(u.html, html, lp, articleText);
      if (!g.ok) return { ok: false, violations: g.violations };
      if (!/^\s*(?:<p\b[^>]*>[\s\S]*?<\/p>\s*)+$/i.test(html)) return { ok: false, violations: ['a resposta não é só parágrafos'] };
      if (goal === 'readability' && lp?.readability) {
        const before = lp.readability.compute(textStats(stripTags(u.html), lp.code)); const after = lp.readability.compute(textStats(stripTags(html), lp.code));
        if (after <= before) return { ok: false, violations: [`a legibilidade não melhorou (${before} para ${after})`] };
      }
      if (goal === 'conversational' && lp && (stripTags(html).match(new RegExp(lp.conversational, 'giu')) || []).length === 0) return { ok: false, violations: ['o trecho continuou sem tratamento direto ao leitor'] };
      const before = complianceOf(u.html); const after = complianceOf(html);
      const novos = after.warnings.filter((x) => !before.warnings.some((y) => y.code === x.code));
      if (after.blocking && novos.length) return { ok: false, violations: novos.map((x) => `conformidade (${x.label})`) };
      for (const x of novos) out.compliance.push({ code: x.code, label: x.label, sample: x.sample });
      return { ok: true, content: out.working.content.slice(0, u.start) + html + out.working.content.slice(u.end), detail: goal === 'readability' ? 'trecho reescrito para ler melhor' : 'trecho reescrito com tratamento direto ao leitor' };
    };
  }

  let reply: AiReply;
  try {
    reply = await deps.ai.call(request);
  } catch (e) {
    const denied = isSpendDenied(e);
    if (denied) {
      out.stopped = { reason: 'teto', message: denied.message };
      log({ status: 'teto', detail: denied.message, costMicros: 0 });
      return out;
    }
    log({ status: 'erro', detail: 'a chamada de IA falhou; nada foi alterado neste passo', costMicros: 0 });
    out.pending.push({ id: step.ruleId, label: step.label, kind: 'rejeitado', reason: 'A chamada de IA falhou; tente de novo mais tarde.' });
    const erros = out.steps.filter((s) => s.status === 'erro').length;
    if (erros >= 2) out.stopped = { reason: 'erro', message: 'Duas chamadas de IA seguidas falharam; o piloto parou.' };
    return out;
  }
  out.aiUsed += 1;
  out.costMicros += reply.costMicros;
  const tokens = reply.usage ? { in: reply.usage.inputTokens, out: reply.usage.outputTokens } : undefined;
  const result = apply(reply.content);
  if (step.unit) out.touchedUnits.push(unitFingerprint(step.unit.html));
  if (result.ok) {
    if (step.unit) out.touchedUnits.push(unitFingerprint(cleanHtmlReply(reply.content)));
    out.working.content = result.content;
    out.applied.push({ id: step.ruleId, kind: 'ia', label: step.label, detail: result.detail, count: 1, costMicros: reply.costMicros });
    log({ status: 'aplicado', detail: result.detail, costMicros: reply.costMicros, tokens });
  } else {
    const violations = (result as { violations: string[] }).violations;
    log({ status: 'rejeitado', detail: `rejeitado pela guarda: ${violations.join('; ')}`, costMicros: reply.costMicros, tokens });
    out.pending.push({ id: step.ruleId, label: step.label, kind: 'rejeitado', reason: `A IA propôs uma versão que a guarda recusou (${violations.join('; ')}). O texto original foi mantido; precisa de revisão humana.` });
  }
  return out;
}

const CTA_GENERIC: Record<string, string> = {
  pt: 'Ficou com dúvidas? Entre em contato com a nossa equipe.', en: 'Have questions? Get in touch with our team.', es: '¿Tienes dudas? Contacta con nuestro equipo.',
  fr: 'Une question ? Contactez notre équipe.', it: 'Hai domande? Contattaci, il nostro team è a disposizione.', de: 'Fragen? Kontaktieren Sie unser Team.', nl: 'Vragen? Neem contact met ons op.',
};

// ---------- orquestração ----------

/**
 * Um passo do trabalho: o 1º é o bloco determinístico; os seguintes são passos de IA, um por vez. Devolve o trabalho atualizado.
 * `done` fica true quando não há mais o que fazer, quando o limite de passos foi atingido ou quando o teto de gasto parou o piloto.
 */
export async function runNext(input: PilotInput, job: PilotJob, deps: PilotDeps): Promise<PilotJob> {
  if (job.done) return job;
  if (!job.deterministicDone) return runDeterministic(input, job);
  const r = input.rules;
  if (job.stopped) return { ...clone(job), done: true };
  const planned = planAiSteps(input, job);
  if (!planned.length) return { ...clone(job), done: true };
  if (job.aiUsed >= r.options.max_ai_steps) {
    const out = clone(job);
    for (const s of planned) if (!out.pending.some((p) => p.id === s.ruleId && p.kind === 'limite')) out.pending.push({ id: s.ruleId, label: s.label, kind: 'limite', reason: `O limite de ${r.options.max_ai_steps} passos de IA por artigo foi atingido; o que sobrou fica para outra rodada.` });
    out.stopped = { reason: 'limite', message: `Limite de ${r.options.max_ai_steps} passos de IA atingido.` };
    out.done = true;
    return out;
  }
  const next = await runAiStep(input, job, planned[0], deps);
  if (next.stopped?.reason === 'teto') {
    // Teto: para, avisa e lista o que faltou. O artigo (articles.content) continua intacto; o que já foi feito sem IA fica só como rascunho.
    for (const s of planAiSteps(input, next)) if (!next.pending.some((p) => p.id === s.ruleId && p.kind === 'teto')) next.pending.push({ id: s.ruleId, label: s.label, kind: 'teto', reason: 'O teto diário de gasto com IA foi atingido antes deste passo.' });
    next.done = true;
  }
  if (next.stopped?.reason === 'erro') next.done = true;
  return next;
}

/** Roda tudo de uma vez (gatilho automático e testes). */
export async function runAll(input: PilotInput, deps: PilotDeps, originalHash: string): Promise<PilotJob> {
  let job = newJob(input, originalHash);
  for (let i = 0; i < 40 && !job.done; i++) job = await runNext(input, job, deps);
  return job;
}

// ---------- relatório ----------

const failing = (f: Finding[]): RuleId[] => f.filter((x) => !x.ok).map((x) => x.id);

export async function buildReport(input: PilotInput, job: PilotJob, deps: Pick<PilotDeps, 'now'> = {}): Promise<PilotReport> {
  const baseline = analyzeWorking(input, { title: input.article.title || '', content: input.article.content || '', excerpt: input.article.excerpt || '' }, []);
  const finalState = analyzeWorking(input, job.working);
  const lang = langOf(input, stripTags(job.working.content));
  const pending = job.pending.slice();
  const have = (id: string) => pending.some((p) => p.id === id);
  // O que ainda falha e o sistema não resolve vira pendência com a explicação; o que a IA/limite/teto já registrou não repete.
  for (const f of finalState.findings) {
    if (f.ok || have(f.id) || f.id === 'schema_article' || f.id === 'breadcrumb' || f.id === 'schema_faq') continue;
    if (f.id === 'words') { pending.push({ id: f.id, label: 'Quantidade de palavras', kind: 'humano', reason: f.message }); continue; }
    pending.push({ id: f.id, label: f.id, kind: f.fix === 'humano' ? 'humano' : 'rejeitado', reason: f.message });
  }
  if (job.compliance.length) pending.push({ id: 'compliance', label: 'Conformidade do segmento', kind: 'conformidade', reason: `O pacote do segmento apontou ${job.compliance.length} aviso(s) no texto gerado pela IA: ${job.compliance.map((c) => c.label).join('; ')}. Revise antes de aprovar.` });
  const finalHash = await sha256Hex(`${job.working.title}\n${job.working.excerpt}\n${job.working.content}`);
  const baseHash = job.originalHash;
  return {
    version: PILOT_VERSION, article_id: input.article.id,
    language: { tag: lang.tag, source: lang.source, formula: lang.profile?.readability?.id ?? null },
    base_hash: baseHash, final_hash: finalHash, unchanged: job.working.content === (input.article.content || '') && job.working.title === (input.article.title || '') && job.working.excerpt === (input.article.excerpt || ''),
    partial: !!job.stopped,
    before: { score: baseline.score, failing: failing(baseline.findings) }, after: { score: finalState.score, failing: failing(finalState.findings) },
    applied: job.applied, pending, steps: job.steps, cost_usd_micros: job.costMicros, cost_is_estimate: true, stopped: job.stopped,
    compliance: { pack: resolvePack(input.rules.options.compliance_pack, (input.article.config as Any)?.segment ?? (input.project as Any)?.nicho ?? input.segment, { code: lang.code, region: lang.region }), mode: input.rules.options.compliance_mode, warnings: job.compliance },
    schema: job.schema, rules_layers: input.rules.layers, generated_at: asIso((deps.now || Date.now)()),
  };
}

