/**
 * Pipeline de geração do Estúdio de Páginas, em etapas: PESQUISA -> BRIEFING -> RASCUNHO -> EDIÇÃO HUMANA SIMULADA -> VERIFICAÇÃO.
 *
 *  - pesquisa/briefing: dados já reunidos (Perfil, fatos de campo aprovados, fontes, Radar, Observatório); aqui só se organiza o plano de seções;
 *  - rascunho: UMA chamada de IA por seção, pequena (tokens baixos), só com os FATOS fornecidos; sem IA (ou sem teto) cada seção vira [PENDENTE: ...] (nunca enchimento);
 *  - edição humana simulada: o detector de "cara de IA" aponta parágrafos; cada um é reescrito em passo pequeno com as mesmas proibições do guia de estilo;
 *  - verificação: portões técnicos (studio-gates.ts), feitos pelo chamador com o contexto do banco.
 * Toda saída de IA passa por guardas: sem número, telefone, endereço, link, depoimento ou fonte que não esteja nos dados; sem título/markdown/script; tamanho coerente.
 * Reprovou: o trecho vira pendência humana. Teto de gasto atingido: o pipeline PARA, guarda o estado e pode ser retomado (nada se perde).
 * Sem rede aqui: a IA entra por uma porta injetada (os testes usam respostas gravadas).
 */
import { guardInvention, buildFactBank, extractPendingMarkers, type FactBank } from './studio-facts.ts';
import { detectAiPatterns, htmlToText, paragraphsOf, type AiFinding } from './studio-ai-detector.ts';
import { styleInstructions } from './studio-style-guide.ts';
import { LANGUAGES } from './language-packs.ts';
import { renderLinkBlocks, LINK_LABELS } from './studio-links.ts';
import type { SuperiorityBrief } from './studio-brief.ts';
import type { StudioRules } from './studio-rules.ts';
import type { FieldFact, Pending, PlannedLink, ProfileFacts, SourceRef, StudioPageDoc } from './studio-types.ts';

export type StageId = 'pesquisa' | 'briefing' | 'rascunho' | 'edicao' | 'verificacao';
export const STAGES: StageId[] = ['pesquisa', 'briefing', 'rascunho', 'edicao', 'verificacao'];

export interface StudioAiRequest { stepId: string; task: 'conversion_content' | 'content_editing'; system: string; user: string; maxTokens: number; temperature: number }
export interface StudioAiReply { content: string; costMicros: number; model?: string; usage?: { inputTokens: number; outputTokens: number } }
/** A porta de IA reserva no teto diário ANTES de chamar e confirma depois; negado = lança um erro com name 'SpendDeniedError'. */
export interface StudioAiPort { call(req: StudioAiRequest): Promise<StudioAiReply> }

export interface SectionState { id: string; kind: 'resposta' | 'secao'; heading: string | null; purpose: string; from: string; html: string | null; status: 'pendente' | 'ok' | 'rejeitado' | 'teto' | 'sem_ia'; reason?: string }
export interface StepLog { id: string; status: 'aplicado' | 'rejeitado' | 'teto' | 'pulado' | 'sem_ia' | 'erro'; detail?: string; costMicros: number; tokens?: { in: number; out: number } }
export interface PipelineState {
  v: 1; stage: StageId; sections: SectionState[]; steps: StepLog[]; aiUsed: number; costMicros: number; startedAt: number;
  stopped: null | { reason: 'teto' | 'limite' | 'erro'; message: string };
  meta: { title: string | null; description: string | null; h1: string | null };
  editRounds: number; done: boolean;
}

export interface PipelineInput {
  brief: SuperiorityBrief; profile: ProfileFacts; fieldFacts: FieldFact[]; sources: SourceRef[]; rules: StudioRules; origin: string; slugPath: string; url: string;
  breadcrumbs: StudioPageDoc['breadcrumbs']; links: PlannedLink[]; ai: StudioAiPort | null; now: () => number; budgetMs?: number; nowYear: number;
  language: string;
}

// ------------------------------------------------------------------------------------------------------------ plano
const CTA_TEXT: Record<string, { heading: string; lead: string; phone: string; whatsapp: string; email: string }> = {
  pt: { heading: 'Como falar com a gente', lead: 'Canais de contato:', phone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail' },
  en: { heading: 'How to reach us', lead: 'Contact:', phone: 'Phone', whatsapp: 'WhatsApp', email: 'Email' },
  es: { heading: 'Cómo contactarnos', lead: 'Contacto:', phone: 'Teléfono', whatsapp: 'WhatsApp', email: 'Correo' },
  fr: { heading: 'Nous contacter', lead: 'Contact :', phone: 'Téléphone', whatsapp: 'WhatsApp', email: 'E-mail' },
  it: { heading: 'Come contattarci', lead: 'Contatti:', phone: 'Telefono', whatsapp: 'WhatsApp', email: 'E-mail' },
  de: { heading: 'So erreichen Sie uns', lead: 'Kontakt:', phone: 'Telefon', whatsapp: 'WhatsApp', email: 'E-Mail' },
  nl: { heading: 'Contact opnemen', lead: 'Contact:', phone: 'Telefoon', whatsapp: 'WhatsApp', email: 'E-mail' },
};
const ctaFor = (lang: string) => CTA_TEXT[lang.slice(0, 2).toLowerCase()] || CTA_TEXT.en;
const digits = (s: string) => s.replace(/\D/g, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Número para href: com "+" fica como está; sem "+", só assume o código do país quando o território do projeto é o Brasil (nunca chuta país). */
export function dial(raw: string, country: string): string {
  const d = digits(raw);
  if (raw.trim().startsWith('+')) return `+${d}`;
  if (country === 'br' && !d.startsWith('55')) return `+55${d}`;
  if (country === 'br') return `+${d}`;
  return d;
}
const sectionsFor = (words: number): number => Math.max(3, Math.min(8, Math.round(words / 150)));

export function newState(now: number): PipelineState {
  return { v: 1, stage: 'pesquisa', sections: [], steps: [], aiUsed: 0, costMicros: 0, startedAt: now, stopped: null, meta: { title: null, description: null, h1: null }, editRounds: 0, done: false };
}

/** Plano de seções a partir do briefing: resposta direta + lacunas dos concorrentes + perguntas que ninguém cobre + fatos de campo. O número de seções vem do tamanho do perfil de regras. */
export function planSections(brief: SuperiorityBrief, rules: StudioRules): SectionState[] {
  const target = rules.gates.words.level !== 'desligado' ? rules.gates.words.value ?? 500 : 500;
  const max = sectionsFor(target);
  const out: SectionState[] = [{ id: 'resposta', kind: 'resposta', heading: null, purpose: 'Direct answer, 30 to 60 words, naming the business and the key fact.', from: 'estrutura', html: null, status: 'pendente' }];
  const seen = new Set<string>();
  for (const o of brief.outline.slice(1)) {
    const k = o.heading.toLowerCase();
    if (seen.has(k) || out.length - 1 >= max) continue;
    seen.add(k); out.push({ id: `s${out.length}`, kind: 'secao', heading: o.heading, purpose: o.purpose, from: o.from, html: null, status: 'pendente' });
  }
  if (out.length < 3) out.push({ id: `s${out.length}`, kind: 'secao', heading: brief.query, purpose: 'Main topic, concrete and local', from: 'estrutura', html: null, status: 'pendente' });
  return out;
}

// ------------------------------------------------------------------------------------------------------------ guardas
export interface SectionGuard { ok: boolean; reasons: string[] }
export function guardSection(html: string, bank: FactBank, opts: { targetWords: number | null; nowYear: number; allowedUrls: string[]; ownOrigin: string }): SectionGuard {
  const reasons: string[] = [];
  const h = String(html || '').trim();
  if (!h) return { ok: false, reasons: ['resposta vazia'] };
  if (/<h[1-6]\b|<script\b|<style\b|<iframe\b|<img\b|<a\b/i.test(h)) reasons.push('a seção trouxe título, script, imagem ou link (o Estúdio monta isso)');
  if (/```|(?:^|\n)\s{0,3}#{1,6}\s|\*\*[^*]+\*\*|\|\s*:?-{3,}/.test(h)) reasons.push('markdown cru');
  if (/as an ai|como um modelo de linguagem|here is the|aqui est[aá]|claro!|certainly!/i.test(htmlToText(h).slice(0, 120))) reasons.push('resíduo de conversa com o modelo');
  const w = htmlToText(h).split(/\s+/).filter(Boolean).length;
  if (opts.targetWords && (w < opts.targetWords * 0.4 || w > opts.targetWords * 2.2)) reasons.push(`tamanho fora do esperado (${w} palavras para alvo ${opts.targetWords})`);
  const issues = guardInvention(h, bank, { nowYear: opts.nowYear, allowedUrls: opts.allowedUrls, ownOrigin: opts.ownOrigin });
  for (const i of issues.filter((x) => x.severity === 'bloqueia')) reasons.push(`${i.why} "${i.excerpt}"`);
  const names = issues.filter((x) => x.code === 'nome_proprio_novo');
  if (names.length >= 2) reasons.push(`nomes próprios que não constam dos dados: ${names.slice(0, 3).map((n) => n.excerpt).join(', ')}`);
  return { ok: reasons.length === 0, reasons };
}

const isSpend = (e: unknown): boolean => { const x = e as { name?: string; code?: string; message?: string }; return x?.name === 'SpendDeniedError' || /spend_denied|teto|cap_reached|spend_guard/i.test(`${x?.code || ''} ${x?.message || ''}`); };

// ------------------------------------------------------------------------------------------------------------ geração
function factList(facts: FieldFact[], profile: ProfileFacts, sources: SourceRef[]): string {
  const lines: string[] = [];
  if (profile.name) lines.push(`- BUSINESS: ${profile.name}${profile.offer ? ` — ${profile.offer}` : ''}`);
  if (profile.regions) lines.push(`- AREAS SERVED: ${profile.regions}`);
  if (profile.hours) lines.push(`- HOURS: ${profile.hours}`);
  for (const f of facts.filter((x) => x.approved && x.source_url)) lines.push(`- [${f.id}] (${f.kind}${f.place ? `, ${f.place}` : ''}) ${f.text} [source: ${f.source_label || f.source_url}]`);
  for (const s of sources.filter((x) => x.official || x.verified)) lines.push(`- SOURCE: ${s.label}`);
  return lines.join('\n') || '- (no facts supplied)';
}

/** Quais fatos de campo o texto usou (sobreposição de palavras). */
export function factsUsed(html: string, facts: FieldFact[]): string[] {
  const txt = ` ${htmlToText(html).toLowerCase()} `;
  return facts.filter((f) => f.approved).filter((f) => {
    const t = f.text.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter((w) => w.length > 3);
    return t.length > 0 && t.filter((w) => txt.includes(` ${w}`) || txt.includes(w)).length / t.length >= 0.6;
  }).map((f) => f.id);
}

async function aiStep(state: PipelineState, input: PipelineInput, req: StudioAiRequest): Promise<{ ok: true; content: string } | { ok: false; why: 'teto' | 'erro' | 'sem_ia' | 'limite'; message: string }> {
  if (!input.ai) return { ok: false, why: 'sem_ia', message: 'IA indisponível neste ambiente.' };
  if (state.aiUsed >= input.rules.options.max_ai_steps) return { ok: false, why: 'limite', message: `Limite de ${input.rules.options.max_ai_steps} passos de IA por geração atingido (perfil de regras).` };
  if (input.budgetMs && input.now() - state.startedAt > input.budgetMs) return { ok: false, why: 'limite', message: 'Tempo da rodada esgotado; continue na próxima chamada.' };
  try {
    const r = await input.ai.call(req);
    state.aiUsed++; state.costMicros += r.costMicros;
    state.steps.push({ id: req.stepId, status: 'aplicado', costMicros: r.costMicros, tokens: r.usage ? { in: r.usage.inputTokens, out: r.usage.outputTokens } : undefined });
    return { ok: true, content: r.content };
  } catch (e) {
    if (isSpend(e)) { state.steps.push({ id: req.stepId, status: 'teto', costMicros: 0 }); return { ok: false, why: 'teto', message: (e as Error).message || 'Teto diário de gasto atingido.' }; }
    state.steps.push({ id: req.stepId, status: 'erro', detail: 'falha ao chamar a IA', costMicros: 0 });
    return { ok: false, why: 'erro', message: 'A IA não respondeu.' };
  }
}

const stripFences = (s: string) => s.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();

function sectionPrompt(input: PipelineInput, sec: SectionState, targetWords: number, feedback?: string): StudioAiRequest {
  const lang = LANGUAGES[input.language.slice(0, 2).toLowerCase()]?.name || input.language;
  const p = input.profile;
  const gaps = input.brief.gaps.theyCoverWeDont.slice(0, 5).map((g) => g.topic).join('; ');
  const angles = input.brief.angles.filter((a) => a.status === 'pronto').slice(0, 5).map((a) => a.angle).join('\n- ');
  return {
    stepId: `rascunho:${sec.id}`, task: 'conversion_content', maxTokens: input.rules.options.step_max_tokens, temperature: 0.7,
    system: [`You write ONE section of a public web page, in ${lang}. Output ONLY HTML using <p>, <ul>, <ol>, <li>, <table>, <th>, <td>. No headings, no links, no images, no markdown.`, styleInstructions(input.language, { tones: p.tones, voice: p.voice, never: p.never }), 'Use ONLY the FACTS below. Never copy competitor wording: you only know TOPICS, not their text.'].join('\n'),
    user: [`PAGE QUERY: ${input.brief.query}`, `SECTION: ${sec.heading ?? '(direct answer at the top of the page)'} — ${sec.purpose}`, `TARGET: about ${targetWords} words.`, `FACTS:\n${factList(input.fieldFacts, input.profile, input.sources)}`, angles ? `ANGLES TO REFLECT (only if supported by facts):\n- ${angles}` : '', gaps ? `TOPICS COMPETITORS COVER (structure only, never wording): ${gaps}` : '', feedback ? `FIX THIS (previous attempt rejected): ${feedback}` : ''].filter(Boolean).join('\n\n'),
  };
}

const withAnswerClass = (html: string) => html.replace(/^\s*<p(?![^>]*class=)/i, '<p class="answer"');

/** Roda o RASCUNHO: uma chamada por seção. Sem IA: cada seção vira pendência (o fato de campo mais ligado à seção entra como texto REAL, não gerado). */
export async function draftSections(state: PipelineState, input: PipelineInput): Promise<PipelineState> {
  const bank = buildFactBank({ profile: input.profile, fieldFacts: input.fieldFacts, sources: input.sources, ownOrigin: input.origin, allowedUrls: input.links.map((l) => l.url), extra: [input.brief.query, ...input.brief.outline.map((o) => o.heading)] });
  const target = input.rules.gates.words.value ?? 500;
  const perSection = Math.max(40, Math.round(target / Math.max(1, state.sections.length)));
  for (const sec of state.sections) {
    if (sec.status === 'ok') continue;
    let feedback: string | undefined;
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const r = await aiStep(state, input, sectionPrompt(input, sec, sec.kind === 'resposta' ? 45 : perSection, feedback));
      if (r.ok === false) {
        sec.status = r.why === 'teto' ? 'teto' : r.why === 'sem_ia' ? 'sem_ia' : 'pendente'; sec.reason = r.message;
        if (r.why === 'teto' || r.why === 'limite') { state.stopped = { reason: r.why === 'teto' ? 'teto' : 'limite', message: r.message }; return state; }
        if (r.why === 'erro') { state.stopped = { reason: 'erro', message: r.message }; return state; }
        done = true; break;
      }
      const html = stripFences(r.content);
      const g = guardSection(html, bank, { targetWords: sec.kind === 'resposta' ? null : perSection, nowYear: input.nowYear, allowedUrls: input.links.map((l) => l.url), ownOrigin: input.origin });
      if (g.ok) { sec.html = sec.kind === 'resposta' ? withAnswerClass(html) : html; sec.status = 'ok'; sec.reason = undefined; done = true; } else { feedback = g.reasons.slice(0, 4).join('; '); sec.status = 'rejeitado'; sec.reason = feedback; state.steps[state.steps.length - 1].status = 'rejeitado'; state.steps[state.steps.length - 1].detail = feedback; }
    }
  }
  return state;
}

// ------------------------------------------------------------------------------------------------------------ montagem
export function assembleBody(state: PipelineState, input: PipelineInput): string {
  const c = ctaFor(input.language);
  // o marcador nunca repete o trecho recusado (poderia carregar o dado inventado para a página): só o motivo geral
  const why = (sec: SectionState) => (sec.status === 'rejeitado' ? ' (a IA trouxe dado sem origem nos dados fornecidos)' : sec.status === 'teto' ? ' (teto diário de gasto atingido)' : sec.status === 'sem_ia' ? ' (IA indisponível)' : '');
  const pend = (sec: SectionState) => `<p>[PENDENTE: ${esc(sec.heading ? `texto da seção "${sec.heading}"` : 'resposta direta do topo')}${why(sec)}]</p>`;
  const parts: string[] = [];
  for (const s of state.sections) {
    const body = s.html ?? pend(s);
    parts.push(s.heading ? `<h2>${esc(s.heading)}</h2>\n${body}` : body);
  }
  const p = input.profile; const cta: string[] = [];
  const country = (input.brief.territory?.country || '').toLowerCase();
  if (p.phones[0]) cta.push(`${esc(c.phone)}: <a href="tel:${dial(p.phones[0], country)}" data-zica-cta="phone">${esc(p.phones[0])}</a>`);
  if (p.whatsapp) cta.push(`${esc(c.whatsapp)}: <a href="https://wa.me/${dial(p.whatsapp, country).replace('+', '')}" data-zica-cta="whatsapp">${esc(p.whatsapp)}</a>`);
  if (p.email) cta.push(`${esc(c.email)}: <a href="mailto:${esc(p.email)}" data-zica-cta="email">${esc(p.email)}</a>`);
  if (cta.length) parts.push(`<h2>${esc(c.heading)}</h2>\n<p class="cta">${cta.join(' · ')}</p>`);
  else parts.push(`<h2>${esc(c.heading)}</h2>\n<p>[PENDENTE: cadastrar telefone, WhatsApp ou e-mail no Perfil do Projeto]</p>`);
  parts.push(renderLinkBlocks(input.links, LINK_LABELS[input.language.slice(0, 2).toLowerCase()] || LINK_LABELS.en));
  return parts.filter(Boolean).join('\n');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Título, meta e H1 SEM IA: a partir da consulta e da primeira frase REAL da resposta direta. */
export function deterministicMeta(state: PipelineState, input: PipelineInput): { title: string; description: string; h1: string } {
  const h1 = cap(input.brief.query.trim());
  const first = state.sections.find((s) => s.kind === 'resposta')?.html;
  const answer = first ? htmlToText(first) : '';
  let description = answer.slice(0, input.rules.gates.meta_description.max ?? 170);
  if (answer.length > description.length) description = description.replace(/\s+\S*$/, '');
  return { title: h1.length > (input.rules.gates.title_unique.max ?? 70) ? h1.slice(0, (input.rules.gates.title_unique.max ?? 70)).replace(/\s+\S*$/, '') : h1, description, h1 };
}

// ------------------------------------------------------------------------------------------------------------ edição humana simulada
export interface EditResult { rewritten: number; kept: number; before: number; after: number }
function rewritePrompt(input: PipelineInput, paragraph: string, findings: AiFinding[]): StudioAiRequest {
  const lang = LANGUAGES[input.language.slice(0, 2).toLowerCase()]?.name || input.language;
  return {
    stepId: 'edicao:paragrafo', task: 'content_editing', maxTokens: Math.min(input.rules.options.step_max_tokens, 700), temperature: 0.6,
    system: [`You edit ONE paragraph in ${lang}, like an experienced human editor. Output ONLY the rewritten paragraph as <p>…</p>.`, styleInstructions(input.language, { tones: input.profile.tones, voice: input.profile.voice, never: input.profile.never }), 'Keep every fact, number, name and meaning EXACTLY. Add nothing new. Do not add numbers, names, links or claims. Vary sentence length.'].join('\n'),
    user: `PARAGRAPH:\n${paragraph}\n\nPROBLEMS FOUND:\n${findings.map((f) => `- ${f.label}: "${f.excerpt}" -> ${f.fix}`).join('\n')}`,
  };
}

/** Reescreve em passos pequenos os parágrafos que mais pesam no detector. Só aceita se a nota do parágrafo cai e a guarda não acha nada novo. */
export async function humanEdit(state: PipelineState, input: PipelineInput): Promise<PipelineState> {
  const bank = buildFactBank({ profile: input.profile, fieldFacts: input.fieldFacts, sources: input.sources, ownOrigin: input.origin, allowedUrls: input.links.map((l) => l.url), extra: [input.brief.query, ...input.brief.outline.map((o) => o.heading)] });
  const max = input.rules.gates.ai_patterns.level === 'desligado' ? Infinity : input.rules.gates.ai_patterns.value ?? 35;
  for (let round = state.editRounds; round < input.rules.options.rewrite_rounds; round++) {
    const body = assembleBody(state, input);
    const rep = detectAiPatterns(body, input.language);
    if (rep.score <= max) { state.editRounds = round; return state; }
    let changed = 0;
    for (const idx of rep.worstParagraphs) {
      const paras = paragraphsOf(body);
      const para = paras[idx]; if (!para) continue;
      const sec = state.sections.find((s) => s.html && htmlToText(s.html).includes(para.slice(0, 60)));
      if (!sec || !sec.html) continue;
      const mine = rep.findings.filter((f) => f.paragraph === idx);
      if (!mine.length) continue;
      const r = await aiStep(state, input, rewritePrompt(input, para, mine));
      if (r.ok === false) { if (r.why === 'teto' || r.why === 'limite') state.stopped = { reason: r.why === 'teto' ? 'teto' : 'limite', message: r.message }; return state; }
      const html = stripFences(r.content);
      const newText = htmlToText(html);
      const g = guardSection(html, bank, { targetWords: null, nowYear: input.nowYear, allowedUrls: input.links.map((l) => l.url), ownOrigin: input.origin });
      const w0 = para.split(/\s+/).length; const w1 = newText.split(/\s+/).length;
      const after = detectAiPatterns(html, input.language).score; const beforeScore = detectAiPatterns(`<p>${para}</p>`, input.language).score;
      const last = state.steps[state.steps.length - 1];
      if (g.ok && w1 >= w0 * 0.5 && w1 <= w0 * 1.6 && after <= beforeScore) {
        const next = sec.html.replace(new RegExp(`<p[^>]*>\\s*${escRe(para.slice(0, 50))}[\\s\\S]*?</p>`), sec.kind === 'resposta' ? withAnswerClass(html) : html);
        if (next !== sec.html) { sec.html = next; changed++; } else { last.status = 'rejeitado'; last.detail = 'não encontrei o parágrafo para trocar'; }
      } else { last.status = 'rejeitado'; last.detail = g.ok ? 'a reescrita não melhorou o parágrafo' : g.reasons.slice(0, 2).join('; '); }
    }
    state.editRounds = round + 1;
    if (!changed) return state;
  }
  return state;
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Limpeza determinística (sem IA): mais de um travessão vira vírgula/ponto. */
export function deterministicEdit(html: string): string {
  let n = 0;
  return html.replace(/\s+—\s+/g, (m) => (++n > 1 ? ', ' : m));
}

// ------------------------------------------------------------------------------------------------------------ orquestração
export interface PipelineOutput { state: PipelineState; body: string; meta: { title: string; description: string; h1: string }; pendings: Pending[]; usedFactIds: string[] }

/** Roda (ou retoma) as etapas pesquisa -> briefing -> rascunho -> edição. A verificação (portões) é do chamador, que tem o contexto do banco. */
export async function runPipeline(input: PipelineInput, prior?: PipelineState | null): Promise<PipelineOutput> {
  const state: PipelineState = prior ? { ...prior, stopped: null, startedAt: input.now(), steps: prior.steps.slice(-40) } : newState(input.now());
  if (!state.sections.length) { state.stage = 'briefing'; state.sections = planSections(input.brief, input.rules); }
  state.stage = 'rascunho';
  await draftSections(state, input);
  if (!state.stopped) { state.stage = 'edicao'; if (input.ai) await humanEdit(state, input); }
  let body = deterministicEdit(assembleBody(state, input));
  const meta = state.meta.title ? { title: state.meta.title, description: state.meta.description || '', h1: state.meta.h1 || '' } : deterministicMeta(state, input);
  if (!state.stopped) { state.stage = 'verificacao'; state.done = true; }
  body = body.replace(/\n{3,}/g, '\n\n');
  const pendings: Pending[] = [];
  for (const s of state.sections.filter((x) => x.status !== 'ok')) pendings.push({ id: `secao:${s.id}`, kind: s.status === 'teto' ? 'teto' : s.status === 'rejeitado' ? 'rejeitado' : 'humano', label: s.heading ? `Seção "${s.heading}"` : 'Resposta direta do topo', reason: s.reason || (s.status === 'sem_ia' ? 'IA indisponível: escreva a seção ou tente de novo.' : 'Ainda não gerada.') });
  for (const m of extractPendingMarkers(body)) if (!pendings.some((p) => p.reason.includes(m))) pendings.push({ id: `marcador:${m.slice(0, 24)}`, kind: 'dado', label: 'Dado que falta no texto', reason: m });
  return { state, body, meta, pendings, usedFactIds: factsUsed(body, input.fieldFacts) };
}
