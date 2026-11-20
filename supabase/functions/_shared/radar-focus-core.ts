/**
 * Radar de Mercado, Foco: regras puras. O Foco nasce de uma FRASE do dono do projeto ("ênfase em X no território Y; Z: A, B, C") e vira Focos estruturados.
 *
 *  - `buildFocusPrompt` + `validateFocusDraft`: a IA (modo barato, pelo orquestrador e pelo teto diário) devolve JSON; aqui ele é VALIDADO e normalizado
 *    (nada que a IA disser entra sem passar pelos limites: peso 1-10, públicos permitidos, textos curtos, sem URL em tema);
 *  - `heuristicFocusParse`: plano B determinístico, sem IA (quando o teto/chave impede a chamada). Sempre marca `needs_review`;
 *  - a resolução dos lugares citados fica em radar-geo-core.ts (`resolveMention`).
 * Genérico: qualquer segmento, idioma e país.
 */
import type { Mention } from './radar-geo-core.ts';
import { normName } from './radar-geo-core.ts';

export const AUDIENCES = ['urgencia', 'alvo', 'interesse', 'engajamento', 'retencao'] as const;
export type Audience = typeof AUDIENCES[number];
export const COMPLIANCE_MODES = ['aviso', 'estrito', 'livre'] as const;
export type ComplianceMode = typeof COMPLIANCE_MODES[number];
export const MODALITIES = ['web', 'places', 'maps', 'news', 'images', 'videos', 'social'] as const;
export type Modality = typeof MODALITIES[number];
export const DEFAULT_MODALITIES: Modality[] = ['web', 'places', 'videos', 'social'];

export const MAX_FOCUS_TEXT = 4000;
export const MAX_FOCUSES_PER_PHRASE = 12;

export interface FocusDraft {
  name: string; segment: string; topics: string[]; audiences: Audience[]; weight: number; goals: string[]; target_hosts: string[];
  territory: Mention[]; compliance_mode: ComplianceMode; language: string | null; needs_review: boolean; notes: string[];
}

/** Sistema da IA: neutro quanto a segmento e idioma. A resposta DEVE ser só JSON. */
export const FOCUS_SYSTEM_PROMPT = [
  'Você transforma uma frase do dono de um negócio em Focos estruturados de monitoramento de mercado.',
  'Responda SOMENTE com JSON no formato {"focuses":[{"name":string,"segment":string,"topics":string[],"audiences":string[],"weight":number,"goals":string[],"target_hosts":string[],"territory":[{"text":string,"kind":"lugar"|"zona","context":string|null,"expand_region":boolean}],"language":string|null}]}.',
  'Regras: um Foco por segmento ou frente citada; "topics" são temas e situações concretas (não invente temas que a frase não sugere); "audiences" só pode ter: urgencia, alvo, interesse, engajamento, retencao;',
  '"weight" vai de 1 a 10 (ênfase explícita = 8 a 10; citado sem ênfase = 5); "territory" lista cada lugar citado separadamente: kind "zona" para agrupamentos informais (zona leste, centro, litoral), "lugar" para cidade, bairro, estado ou país;',
  '"context" é o lugar maior que ajuda a identificar o citado (por exemplo a cidade de uma zona), ou null; "expand_region" é true quando a frase diz "e região" ou equivalente.',
  'Escreva os campos no idioma da frase. Não inclua explicações fora do JSON. Não invente lugares, números, endereços ou sites.',
].join(' ');

export function buildFocusPrompt(text: string, ctx: { segments?: string[]; projectName?: string; language?: string } = {}): string {
  const lines = [`Frase do dono:\n"""\n${text.slice(0, MAX_FOCUS_TEXT)}\n"""`];
  if (ctx.projectName) lines.push(`Projeto: ${ctx.projectName.slice(0, 120)}`);
  if (ctx.segments?.length) lines.push(`Áreas já cadastradas na taxonomia do projeto (use o nome exato quando a frase se referir a uma delas): ${ctx.segments.slice(0, 60).join(' | ')}`);
  if (ctx.language) lines.push(`Idioma preferido dos campos: ${ctx.language}`);
  return lines.join('\n');
}

/** Extrai o primeiro objeto JSON do texto da IA (aceita cerca de código e texto antes/depois). */
export function extractJson(text: unknown): unknown | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{'); if (start < 0) return null;
  let depth = 0; let inStr = false; let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const strList = (v: unknown, n: number, each: number): string[] => [...new Set((Array.isArray(v) ? v : []).map((x) => clip(x, each)).filter((x) => x.length >= 2))].slice(0, n);
const URL_LIKE = /^(https?:\/\/|www\.)/i;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export interface ValidatedFocuses { ok: true; drafts: FocusDraft[]; issues: string[] }
export function validateFocusDraft(raw: unknown): ValidatedFocuses | { ok: false; error: 'resposta_invalida' | 'nenhum_foco' } {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
  const list = root && Array.isArray(root.focuses) ? root.focuses as unknown[] : null;
  if (!list) return { ok: false, error: 'resposta_invalida' };
  const issues: string[] = [];
  const drafts: FocusDraft[] = [];
  for (const [i, item] of list.slice(0, MAX_FOCUSES_PER_PHRASE).entries()) {
    const f = item && typeof item === 'object' ? item as Record<string, unknown> : null;
    if (!f) { issues.push(`foco_${i + 1}_ignorado`); continue; }
    const name = clip(f.name, 160) || clip(f.segment, 160);
    if (name.length < 2) { issues.push(`foco_${i + 1}_sem_nome`); continue; }
    const w = Number(f.weight);
    const weight = Number.isFinite(w) ? Math.min(10, Math.max(1, Math.round(w))) : 5;
    if (!Number.isFinite(w)) issues.push(`foco_${i + 1}_peso_padrao`);
    const audiences = [...new Set((Array.isArray(f.audiences) ? f.audiences : []).map((a) => normName(a).replace(/ /g, '')).filter((a): a is Audience => (AUDIENCES as readonly string[]).includes(a)))];
    const topics = strList(f.topics, 40, 160).filter((t) => !URL_LIKE.test(t));
    const hosts = strList(f.target_hosts, 10, 200).map((h) => h.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter((h) => HOST.test(h));
    const territory: Mention[] = [];
    for (const t of (Array.isArray(f.territory) ? f.territory : []).slice(0, 60)) {
      const o = t && typeof t === 'object' ? t as Record<string, unknown> : null;
      const text = o ? clip(o.text, 120) : clip(t, 120);
      if (text.length < 2) continue;
      territory.push({ text, kind: o?.kind === 'zona' ? 'zona' : 'lugar', context: o && clip(o.context, 120) ? clip(o.context, 120) : null, expand_region: o?.expand_region === true });
    }
    if (!territory.length) issues.push(`foco_${i + 1}_sem_territorio`);
    const cm = normName(f.compliance_mode);
    drafts.push({
      name, segment: clip(f.segment, 200) || name, topics, audiences, weight, goals: strList(f.goals, 10, 200), target_hosts: hosts, territory,
      compliance_mode: (COMPLIANCE_MODES as readonly string[]).includes(cm) ? cm as ComplianceMode : 'aviso', language: clip(f.language, 12) || null, needs_review: false, notes: [],
    });
  }
  if (!drafts.length) return { ok: false, error: 'nenhum_foco' };
  return { ok: true, drafts, issues };
}

// ------------------------------------------------------------------------------------------------------------------ plano B sem IA
const EMPHASIS = /(?<![\p{L}])(ênfase|enfase|foco|prioridade|prioritário|principal|emphasis|focus|priority|énfasis|prioridad)(?![\p{L}])/iu;
const CARDINALS = new Set(['leste', 'oeste', 'norte', 'sul', 'centro', 'east', 'west', 'north', 'south', 'central', 'este', 'sur', 'noreste', 'noroeste', 'sudeste', 'sudoeste']);
const ZONE_WORD = /^(zona|zone|zonas|zones)\b/i;
const REGION_TAIL = /\s+(e|and|y)\s+(regi[aã]o|regi[oó]n|region|arredores|surroundings)\s*$/i;
const TERRITORY_MARK = /\b(?:na|no|nas|nos|em|in|at|en)\s+(.+)$/i;

/** Divide uma lista "A, B, C e D" respeitando o "e" final. */
function splitList(s: string): string[] {
  return s.split(/\s*(?:,|;|\be\b|\band\b|\by\b)\s*/i).map((x) => x.trim()).filter(Boolean);
}

/**
 * Plano B determinístico. Cobre o formato mais comum ("ênfase em X na Y, Z e região; outro segmento: tema1, tema2, tema3 em W").
 * Não substitui a IA: sempre devolve `needs_review: true` e uma nota dizendo isso.
 */
export function heuristicFocusParse(text: string): ValidatedFocuses | { ok: false; error: 'nenhum_foco' } {
  const clauses = text.slice(0, MAX_FOCUS_TEXT).split(/[;\n]+/).map((c) => c.trim()).filter((c) => c.length >= 3);
  const drafts: FocusDraft[] = [];
  for (const clause of clauses.slice(0, MAX_FOCUSES_PER_PHRASE)) {
    const emphatic = EMPHASIS.test(clause);
    const body = clause.replace(EMPHASIS, '').replace(/^\s*(?:em|in|en|:)\s+/i, '').trim();
    let segment = ''; let rest = body; let topicsPart = '';
    const colon = body.indexOf(':');
    if (colon > 0) { segment = body.slice(0, colon).trim(); rest = body.slice(colon + 1).trim(); }
    // território: o último "na/no/em ..." da cláusula; o que vem antes é segmento/temas
    const m = TERRITORY_MARK.exec(rest);
    let territoryPart = '';
    if (m && m.index !== undefined) { territoryPart = m[1]; topicsPart = rest.slice(0, m.index).trim(); }
    else topicsPart = rest;
    // cláusula solta (sem ":" nem território nem ênfase) = tema do Foco anterior ("...; embriaguez ao volante; ...")
    if (colon <= 0 && !m && !emphatic && drafts.length) {
      const prev = drafts[drafts.length - 1];
      prev.topics = [...new Set([...prev.topics, ...splitList(topicsPart).map((t) => clip(t, 160)).filter((t) => t.length >= 2)])].slice(0, 40);
      continue;
    }
    if (!segment) { const parts = splitList(topicsPart); segment = parts.shift() ?? ''; topicsPart = parts.join(', '); }
    const topics = colon > 0 ? splitList(topicsPart).map((t) => t.replace(/^(?:em|de|do|da)\s+/i, '')) : (topicsPart ? splitList(topicsPart) : []);
    // quando há ":", o território pode estar colado no último tema ("..., frotas em tal lugar"): já foi separado acima
    const mentions: Mention[] = [];
    let last: string[] | null = null;
    for (const [idx, itemRaw] of splitList(territoryPart.replace(REGION_TAIL, (_x) => '|REG|')).entries()) {
      let item = itemRaw; let region = false;
      if (item.includes('|REG|')) { item = item.replace('|REG|', '').trim(); region = true; }
      if (!item) continue;
      const words = item.split(/\s+/);
      // "Zona Leste, Norte, Sul": o prefixo "Zona" vale para os cardeais seguintes
      const kind: Mention['kind'] = ZONE_WORD.test(item) || (words.length === 1 && CARDINALS.has(normName(item)) && last !== null) ? 'zona' : 'lugar';
      if (kind === 'zona' && !ZONE_WORD.test(item) && last) item = `${last[0]} ${item}`;
      if (kind === 'zona' && ZONE_WORD.test(item)) last = [item.split(/\s+/)[0]];
      mentions.push({ text: item, kind, context: null, expand_region: region });
      void idx;
    }
    const name = clip(segment || clause, 160);
    if (name.length < 2) continue;
    drafts.push({
      name, segment: name, topics: [...new Set(topics.map((t) => clip(t, 160)).filter((t) => t.length >= 2))].slice(0, 40), audiences: [], weight: emphatic ? 8 : 5, goals: [], target_hosts: [],
      territory: mentions, compliance_mode: 'aviso', language: null, needs_review: true, notes: ['gerado_sem_ia'],
    });
  }
  if (!drafts.length) return { ok: false, error: 'nenhum_foco' };
  return { ok: true, drafts, issues: ['gerado_sem_ia_revise'] };
}

/** Um lugar citado na frase (sigla ou cidade) vira contexto das zonas, que ajuda a escolher a zona certa entre homônimos. */
export function applyContextFromText(drafts: FocusDraft[], text: string, hints: string[]): FocusDraft[] {
  const norm = ` ${normName(text)} `;
  const found = hints.find((h) => norm.includes(` ${normName(h)} `));
  if (!found) return drafts;
  return drafts.map((d) => ({ ...d, territory: d.territory.map((m) => (m.kind === 'zona' && !m.context ? { ...m, context: found } : m)) }));
}
