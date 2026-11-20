/**
 * Banco de fatos e guarda contra invenção do Estúdio de Páginas.
 *
 * REGRA DE OURO: o sistema NUNCA inventa fato, endereço, telefone, depoimento, estatística, resultado ou fonte. Tudo o que um texto afirma tem de existir no
 * BANCO DE FATOS (Perfil do Projeto confirmado, fatos de campo aprovados com fonte, fontes informadas, dados do briefing). O que o texto afirma e o banco não tem:
 *   - número, telefone, endereço, link, depoimento/avaliação  -> BLOQUEIA (vira pendência humana);
 *   - nome próprio novo                                          -> REVISAR (pode ser legítimo; uma pessoa confere).
 * Marcador de falta: [PENDENTE: o que falta] (ou [PENDING: ...], [PENDIENTE: ...]). Esses marcadores viram pendências e IMPEDEM a aprovação.
 */
import type { FieldFact, ProfileFacts, SourceRef } from './studio-types.ts';

const stripTags = (v: string) => String(v || '').replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const fold = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digitsOnly = (s: string) => s.replace(/\D/g, '');

export interface FactBank {
  texts: string[];
  numbers: Set<string>;
  phones: string[];
  urls: Set<string>;
  names: Set<string>;
  /** só vira true quando uma pessoa cadastrou um depoimento real no Perfil (campo de provas autorizadas) */
  testimonialsAllowed: boolean;
}

const NUM = /\d[\d.,]*/g;
const normNum = (n: string) => n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.').replace(/\.$/, '');
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g;
const PROPER = /(?<=[\p{Ll},;:]\s)\p{Lu}[\p{L}'’-]{2,}(?:\s+(?:d[aeo]s?|de la|von|van)?\s*\p{Lu}[\p{L}'’-]+)*/gu;

export function buildFactBank(input: { profile: ProfileFacts; fieldFacts?: FieldFact[]; sources?: SourceRef[]; extra?: string[]; ownOrigin?: string | null; allowedUrls?: string[] }): FactBank {
  const p = input.profile;
  const texts: string[] = [p.name, p.offer, p.voice, p.proof, p.regions, p.hours, p.email, ...p.addresses, ...p.phones, p.whatsapp, ...p.authors.flatMap((a) => [a.name, a.credential]), ...(input.extra || [])].filter((x): x is string => !!x && String(x).trim() !== '');
  for (const f of input.fieldFacts || []) if (f.approved) texts.push(f.text, f.place || '', f.source_label || '');
  for (const s of input.sources || []) texts.push(s.label);
  const numbers = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(NUM)) numbers.add(normNum(m[0]));
  const phones = [p.whatsapp, ...p.phones].filter((x): x is string => !!x).map(digitsOnly).filter((d) => d.length >= 8);
  const urls = new Set<string>([...(input.sources || []).map((s) => s.url), ...p.sameAs, ...(input.allowedUrls || [])]);
  for (const f of input.fieldFacts || []) if (f.approved && f.source_url) urls.add(f.source_url);
  if (input.ownOrigin) urls.add(input.ownOrigin);
  const names = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\p{Lu}[\p{L}'’-]{2,}/gu)) names.add(fold(m[0]));
  const testimonialsAllowed = /depoiment|testimonial|testimonio|avalia[cç][aã]o autorizada/i.test(p.proof || '') && /["“”]/.test(p.proof || '');
  return { texts, numbers, phones, urls, names, testimonialsAllowed };
}

export interface InventionIssue { code: 'numero_sem_origem' | 'telefone_sem_origem' | 'url_sem_origem' | 'depoimento_sem_origem' | 'endereco_sem_origem' | 'nome_proprio_novo' | 'ano_sem_origem'; severity: 'bloqueia' | 'revisar'; excerpt: string; why: string }

const TESTIMONIAL = /depoimentos? (?:de|dos|do) (?:nossos |meus )?(?:clientes?|pacientes?|alunos?)|o que (?:nossos )?(?:clientes|pacientes) (?:dizem|falam)|testimonials?\b|testimonios?\b|avalia[cç][aã]o (?:de|dos) clientes|(?:cliente|paciente) (?:disse|afirma|conta|relata)|clients? (?:said|say)|[★⭐]{2,}|\b5[- ]star\b|(?:5|cinco) estrelas|5 estrellas|5 étoiles|“[^”]{15,200}”\s*[—–-]\s*\p{Lu}/giu;
const ADDRESS = /\b(?:rua|r\.|avenida|av\.|alameda|pra[cç]a|travessa|estrada|rodovia|street|st\.|avenue|ave\.|road|calle|avenida)\s+[\p{L}0-9 .'’-]{2,50},?\s*(?:n[º°o.]?\s*)?\d{1,5}\b/giu;
const MONTHS = new Set(['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'enero', 'febrero', 'mayo', 'junio', 'julio', 'septiembre', 'octubre', 'noviembre', 'diciembre', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

/** Confere o HTML contra o banco de fatos. `nowYear` = ano corrente (o ano atual pode aparecer sem origem). */
export function guardInvention(html: string, bank: FactBank, opts: { nowYear?: number; allowedUrls?: string[]; ownOrigin?: string | null; ignoreNames?: boolean } = {}): InventionIssue[] {
  const issues: InventionIssue[] = [];
  const text = stripTags(html);
  const nowYear = opts.nowYear ?? new Date().getFullYear();
  const allowedUrls = new Set<string>([...bank.urls, ...(opts.allowedUrls || [])]);
  const own = opts.ownOrigin ? opts.ownOrigin.replace(/\/+$/, '') : null;

  // telefones (antes dos números: o mesmo trecho não vira dois achados)
  const phoneSpans: Array<[number, number]> = [];
  for (const m of text.matchAll(PHONE)) {
    const d = digitsOnly(m[0]);
    if (d.length < 8) continue;
    phoneSpans.push([m.index!, m.index! + m[0].length]);
    const known = bank.phones.some((p) => p.endsWith(d.slice(-8)) || d.endsWith(p.slice(-8)));
    if (!known) issues.push({ code: 'telefone_sem_origem', severity: 'bloqueia', excerpt: m[0].trim(), why: 'Telefone que não está no Perfil do Projeto.' });
  }
  // endereços (antes dos números: o número da rua faz parte do endereço, que é um achado só)
  const addrSpans: Array<[number, number]> = [];
  for (const m of text.matchAll(ADDRESS)) {
    addrSpans.push([m.index!, m.index! + m[0].length]);
    const k = fold(m[0]).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!bank.texts.some((t) => fold(t).replace(/[^a-z0-9]+/g, ' ').includes(k))) issues.push({ code: 'endereco_sem_origem', severity: 'bloqueia', excerpt: m[0].trim(), why: 'Endereço que não está no Perfil nem nos fatos de campo aprovados.' });
  }
  // números (com %, moeda, decimais ou de 2+ dígitos); de 1 dígito só se vier com %
  for (const m of text.matchAll(NUM)) {
    const at = m.index!;
    if (phoneSpans.some(([a, b]) => at >= a && at < b) || addrSpans.some(([a, b]) => at >= a && at < b)) continue;
    const raw = m[0].replace(/[.,]+$/, '');
    const n = normNum(raw);
    const next = text.slice(at + m[0].length, at + m[0].length + 2);
    const prev = text.slice(Math.max(0, at - 6), at);
    const heavy = /%|\bpor ?cento|\bpercent|[$€£]|R\$|US\$/i.test(next + prev) || raw.length >= 2 || /[.,]\d/.test(raw);
    if (!heavy) continue;
    if (/^(?:19|20)\d{2}$/.test(n)) { if (Number(n) === nowYear || Number(n) === nowYear + 1 || bank.numbers.has(n)) continue; issues.push({ code: 'ano_sem_origem', severity: 'bloqueia', excerpt: text.slice(Math.max(0, at - 25), at + 20).trim(), why: 'Ano citado que não consta dos dados fornecidos.' }); continue; }
    if (bank.numbers.has(n)) continue;
    // número de endereço/CEP/artigo que veio do banco já passou; ordinais curtos de lista (10, 11, 12) sem unidade não afirmam fato
    if (/^\d{1,2}$/.test(n) && !/^\s*(?:%|por ?cento|anos?|dias?|horas?|meses|mil|milh|reais|years?|days?|hours?|months?)/i.test(next + ' ') ) continue;
    issues.push({ code: 'numero_sem_origem', severity: 'bloqueia', excerpt: text.slice(Math.max(0, at - 30), at + m[0].length + 20).trim(), why: 'Número que não consta do Perfil, dos fatos de campo aprovados nem das fontes informadas.' });
  }
  // links
  for (const m of String(html || '').matchAll(/(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/gi)) {
    const u = m[1];
    const wa = u.match(/^https?:\/\/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{8,15})/i);
    if (wa && phoneKnown(wa[1], bank)) continue; // WhatsApp do próprio Perfil
    const ok =[...allowedUrls].some((a) => u === a || u.startsWith(a.replace(/\/+$/, '') + '/') || u.replace(/\/+$/, '') === a.replace(/\/+$/, '')) || (own && (u === own || u.startsWith(`${own}/`)));
    if (!ok) issues.push({ code: 'url_sem_origem', severity: 'bloqueia', excerpt: u, why: 'Link que não vem de fonte informada, do plano de links nem do próprio site.' });
  }
  // depoimentos e avaliações
  if (!bank.testimonialsAllowed) for (const m of text.matchAll(TESTIMONIAL)) issues.push({ code: 'depoimento_sem_origem', severity: 'bloqueia', excerpt: m[0].slice(0, 80), why: 'Depoimento ou avaliação: só entra se uma pessoa cadastrou o depoimento real e autorizado no Perfil.' });
  // nomes próprios novos
  if (!opts.ignoreNames) {
    const seen = new Set<string>();
    for (const m of text.matchAll(PROPER)) {
      const first = fold(m[0].split(/\s+/)[0]);
      const all = fold(m[0]);
      if (MONTHS.has(first) || seen.has(all)) continue;
      const known = [...all.split(/\s+/)].every((w) => w.length < 3 || bank.names.has(w) || MONTHS.has(w) || ['de', 'da', 'do', 'das', 'dos', 'von', 'van'].includes(w));
      if (!known) { seen.add(all); issues.push({ code: 'nome_proprio_novo', severity: 'revisar', excerpt: m[0], why: 'Nome próprio que não consta dos dados fornecidos: confira se é real.' }); }
    }
  }
  return issues;
}

/** [PENDENTE: ...] / [PENDING: ...] / [PENDIENTE: ...] / [À COMPLÉTER: ...] / [OFFEN: ...] / [OPEN: ...] / [DA COMPLETARE: ...] no texto. */
export function extractPendingMarkers(html: string): string[] {
  return [...String(html || '').matchAll(/\[(?:PENDENTE|PENDING|PENDIENTE|À COMPLÉTER|A COMPLETER|DA COMPLETARE|OFFEN|OPEN)\s*:\s*([^\]]{1,200})\]/gi)].map((m) => m[1].trim());
}
export const hasPendingMarkers = (html: string): boolean => extractPendingMarkers(html).length > 0;

/** Telefones que aparecem no texto e nos href tel:/wa.me (só os dígitos). */
export function phonesInHtml(html: string): string[] {
  const out = new Set<string>();
  for (const m of stripTags(html).matchAll(PHONE)) { const d = digitsOnly(m[0]); if (d.length >= 8) out.add(d); }
  for (const m of String(html || '').matchAll(/href\s*=\s*"(?:tel:|https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=))\+?([\d()\s.-]{8,20})/gi)) { const d = digitsOnly(m[1]); if (d.length >= 8) out.add(d); }
  return [...out];
}
export const phoneKnown = (d: string, bank: FactBank): boolean => bank.phones.some((p) => p.endsWith(d.slice(-8)) || d.endsWith(p.slice(-8)));
