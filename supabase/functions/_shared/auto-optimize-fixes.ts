/**
 * Correções DETERMINÍSTICAS de HTML (sem IA, sem rede, sem custo). Cada função é pura e IDEMPOTENTE: rodar de novo sobre o resultado não muda nada.
 * Nenhuma inventa texto: só reorganiza o que já existe (quebra parágrafo longo, converte tabela em markdown cru, completa alt de imagem, reescreve
 * título de seção como pergunta quando a regra é segura, e insere links internos usando URLs REAIS recebidas).
 * Idioma: os padrões de pergunta e os rótulos seguem o idioma do artigo (language-packs.ts).
 */
import { LANGUAGES, STRUCTURAL_HEADING, isQuestionHeading, type LanguageProfile } from './language-packs.ts';

const stripTags = (v: string) => v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const wordsOf = (v: string) => stripTags(v).split(/\s+/).filter(Boolean).length;
const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- 1. parágrafos longos ----------

const tagsBalanced = (html: string): boolean => {
  const open = (html.match(/<(a|strong|em|b|i|u|mark|sup|sub|small|span)\b[^>]*>/gi) || []).length;
  const close = (html.match(/<\/(a|strong|em|b|i|u|mark|sup|sub|small|span)>/gi) || []).length;
  return open === close;
};

/** Divide parágrafos com mais de `maxWords` palavras em fronteiras de frase. Parágrafo de uma frase só, ou que quebraria um marcador, fica como está. */
export function splitLongParagraphs(html: string, maxWords: number): { html: string; changed: number } {
  let changed = 0;
  const out = String(html || '').replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (full, attrs: string, inner: string) => {
    if (wordsOf(inner) <= maxWords) return full;
    const sentences = inner.split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"“«(¿¡])/u);
    if (sentences.length < 2) return full;
    const chunks: string[] = []; let cur: string[] = []; let curWords = 0;
    for (const sentence of sentences) {
      const w = wordsOf(sentence);
      if (cur.length && curWords + w > maxWords) { chunks.push(cur.join(' ')); cur = []; curWords = 0; }
      cur.push(sentence); curWords += w;
    }
    if (cur.length) chunks.push(cur.join(' '));
    if (chunks.length < 2 || !chunks.every(tagsBalanced)) return full;
    changed++;
    return chunks.map((c, i) => (i === 0 ? `<p${attrs}>${c}</p>` : `<p>${c}</p>`)).join('\n');
  });
  return { html: out, changed };
}

// ---------- 2. tabelas em markdown cru ----------

const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function tableHtml(rows: string[]): string {
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const th = head.map((c) => `<th>${c}</th>`).join('');
  const tr = body.map((r) => `<tr>${head.map((_, i) => `<td>${r[i] ?? ''}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/** Converte blocos de tabela em markdown (linhas com barras e linha separadora) em <table>. Cobre o texto solto e o dentro de <p> com quebras. */
export function markdownTablesToHtml(html: string): { html: string; changed: number } {
  let changed = 0;
  const convertLines = (lines: string[]): string[] => {
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/\|/.test(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1]) && cells(lines[i]).length >= 2) {
        const rows = [lines[i], lines[i + 1]]; let j = i + 2;
        while (j < lines.length && /\|/.test(lines[j]) && lines[j].trim()) { rows.push(lines[j]); j++; }
        out.push(tableHtml(rows)); changed++; i = j - 1;
      } else out.push(lines[i]);
    }
    return out;
  };
  // (a) dentro de <p>: quebras <br> ou \n separam as linhas; o que sobra antes/depois da tabela continua parágrafo
  let result = String(html || '').replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (full, attrs: string, inner: string) => {
    if (!/\|/.test(inner)) return full;
    const lines = inner.split(/<br\s*\/?>|\n/i);
    if (!lines.some((l, i) => /\|/.test(l) && i + 1 < lines.length && isSep(lines[i + 1]))) return full;
    const before = changed;
    const conv = convertLines(lines);
    if (changed === before) return full;
    const parts: string[] = []; let para: string[] = [];
    const flush = () => { const t = para.join(' ').trim(); if (t) parts.push(`<p${parts.length === 0 ? attrs : ''}>${t}</p>`); para = []; };
    for (const piece of conv) { if (piece.startsWith('<table>')) { flush(); parts.push(piece); } else if (piece.trim()) para.push(piece.trim()); }
    flush();
    return parts.join('\n');
  });
  // (b) texto solto fora de tags de bloco
  const rest = result.split('\n');
  if (rest.some((l, i) => /^\s*\|/.test(l) && i + 1 < rest.length && isSep(rest[i + 1]))) result = convertLines(rest).join('\n');
  return { html: result, changed };
}

// ---------- 3. alt de imagens ----------

/** Completa alt vazio ou ausente a partir do contexto (title da imagem, título da seção anterior ou título do artigo). Nunca sobrescreve alt existente. */
export function ensureImgAlt(html: string, ctx: { title?: string; keyword?: string }): { html: string; changed: number } {
  let changed = 0;
  const source = String(html || '');
  const out = source.replace(/<img\b([^>]*?)(\/?)>/gi, (full, attrs: string, slash: string, offset: number) => {
    const alt = attrs.match(/\balt\s*=\s*(["'])(.*?)\1/i);
    if (alt && alt[2].trim()) return full;
    const titleAttr = attrs.match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
    const heads = [...source.slice(0, offset).matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
    const near = heads.length ? stripTags(heads[heads.length - 1][1]) : '';
    const text = (titleAttr || near || ctx.title || ctx.keyword || '').slice(0, 125).trim();
    if (!text) return full;
    changed++;
    const cleaned = attrs.replace(/\balt\s*=\s*(["'])\1/i, '').trimEnd();
    return `<img${cleaned ? ` ${cleaned.trimStart()}` : ''} alt="${escapeHtml(text)}"${slash ? ' /' : ''}>`;
  });
  return { html: out, changed };
}

// ---------- 4. H2 em forma de pergunta (só quando seguro) ----------

const NEVER = STRUCTURAL_HEADING;

interface Lex { re: RegExp; make: (m: RegExpMatchArray) => string }
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const NOUNS_PT: Record<string, ['m' | 'f', string]> = {
  prazo: ['m', 'prazos'], requisito: ['m', 'requisitos'], documento: ['m', 'documentos'], direito: ['m', 'direitos'], valor: ['m', 'valores'], custo: ['m', 'custos'],
  passo: ['m', 'passos'], procedimento: ['m', 'procedimentos'], etapa: ['f', 'etapas'], pena: ['f', 'penas'], 'consequência': ['f', 'consequências'], 'diferença': ['f', 'diferenças'],
  vantagem: ['f', 'vantagens'], desvantagem: ['f', 'desvantagens'], 'hipótese': ['f', 'hipóteses'], causa: ['f', 'causas'], 'condição': ['f', 'condições'], 'obrigação': ['f', 'obrigações'],
};
function lexPt(): Lex[] {
  const sing = Object.keys(NOUNS_PT); const plur = Object.values(NOUNS_PT).map((v) => v[1]);
  return [
    { re: new RegExp(`^(${sing.join('|')})(\\s+[^:;,()]{1,60})?$`, 'i'), make: (m) => { const [g] = NOUNS_PT[m[1].toLowerCase()]; return `Qual é ${g === 'm' ? 'o' : 'a'} ${lc(m[1])}${m[2] || ''}?`; } },
    { re: new RegExp(`^(${plur.join('|')})(\\s+[^:;,()]{1,60})?$`, 'i'), make: (m) => { const g = Object.values(NOUNS_PT).find((v) => v[1] === m[1].toLowerCase())![0]; return `Quais são ${g === 'm' ? 'os' : 'as'} ${lc(m[1])}${m[2] || ''}?`; } },
    { re: /^(?:Conceito|Defini[çc][ãa]o|Significado)\s+(de|do|da|dos|das)\s+([^:;,()]{2,60})$/i, make: (m) => `O que é ${({ de: '', do: 'o ', da: 'a ', dos: 'os ', das: 'as ' } as Record<string, string>)[m[1].toLowerCase()]}${m[2]}?` },
  ];
}
function lexEn(): Lex[] {
  const plural = 'requirements|steps|costs|benefits|risks|documents|deadlines|fees|options|types|differences|advantages|disadvantages|causes|symptoms|rights|penalties|conditions';
  return [
    { re: new RegExp(`^(${plural})(\\s+[^:;,()]{1,60})?$`, 'i'), make: (m) => `What are the ${m[1].toLowerCase()}${m[2] || ''}?` },
    { re: /^(?:Definition|Meaning)\s+of\s+([^:;,()]{2,60})$/i, make: (m) => `What is ${m[1]}?` },
  ];
}
function lexEs(): Lex[] {
  const masc = 'requisitos|pasos|costos|costes|beneficios|riesgos|documentos|plazos|derechos|tipos|síntomas|efectos';
  const fem = 'opciones|diferencias|ventajas|desventajas|causas|consecuencias|etapas|sanciones|multas|penas|condiciones|obligaciones';
  return [
    { re: new RegExp(`^(${masc})(\\s+[^:;,()]{1,60})?$`, 'i'), make: (m) => `¿Cuáles son los ${m[1].toLowerCase()}${m[2] || ''}?` },
    { re: new RegExp(`^(${fem})(\\s+[^:;,()]{1,60})?$`, 'i'), make: (m) => `¿Cuáles son las ${m[1].toLowerCase()}${m[2] || ''}?` },
    { re: /^(?:Definición|Concepto|Significado)\s+(?:de|del)\s+([^:;,()]{2,60})$/i, make: (m) => `¿Qué es ${m[1]}?` },
  ];
}
const LEX: Record<string, () => Lex[]> = { pt: lexPt, en: lexEn, es: lexEs };

/** Reescreve o texto de um H2 como pergunta SÓ quando a regra é segura. Devolve null quando não for. */
export function questionForHeading(text: string, lang: LanguageProfile | null): string | null {
  const t = text.trim().replace(/[.:;]+$/, '');
  if (!t || NEVER.test(t) || /[:;()]/.test(t) || t.split(/\s+/).length > 12) return null;
  if (isQuestionHeading(t, lang)) return /[?？]\s*$/.test(t) ? null : (lang?.code === 'es' && !t.startsWith('¿') ? `¿${t}?` : `${t}?`);
  const lex = lang && LEX[lang.code] ? LEX[lang.code]() : [];
  for (const l of lex) { const m = t.match(l.re); if (m) return l.make(m); }
  return null;
}

/** Transforma H2 em pergunta, só os de regra segura, até a porcentagem alvo. Mantém o resto do título intacto. */
export function questionifyHeadings(html: string, targetPct: number, lang: LanguageProfile | null): { html: string; changed: number; headings: Array<{ from: string; to: string }> } {
  const source = String(html || '');
  const all = [...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].filter((m) => !STRUCTURAL_HEADING.test(stripTags(m[1])));
  if (all.length === 0) return { html: source, changed: 0, headings: [] };
  const isQ = (inner: string) => isQuestionHeading(stripTags(inner), lang);
  let questions = all.filter((m) => isQ(m[1])).length;
  const headings: Array<{ from: string; to: string }> = [];
  const out = source.replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi, (full, attrs: string, inner: string) => {
    if ((questions * 100) / all.length >= targetPct) return full;
    if (/<[^>]+>/.test(inner)) return full;
    const text = stripTags(inner);
    const q = questionForHeading(text, lang);
    if (!q || q === text) return full;
    if (!isQuestionHeading(text, lang)) questions++;
    headings.push({ from: text, to: q });
    return `<h2${attrs}>${escapeHtml(q).replace(/&#39;/g, "'")}</h2>`;
  });
  return { html: out, changed: headings.length, headings };
}

// ---------- 5. links internos ----------

export interface LinkCandidate { title?: string; url: string; keyword?: string }
export interface AddedLink { url: string; anchor: string; mode: 'no_texto' | 'bloco' }

const norm = (u: string) => String(u || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
const hrefsOf = (html: string) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => norm(m[1]));

/**
 * Insere até `needed` links internos com URLs reais. Primeiro dentro do texto (primeira ocorrência da palavra-chave ou do título do alvo, fora de
 * títulos e de links existentes, no máximo um por parágrafo); o que faltar vai num bloco "Leia também" no fim (rótulo no idioma do artigo).
 * Nunca linka a própria página, nunca repete URL e nunca inventa URL.
 */
export function insertInternalLinks(html: string, candidates: LinkCandidate[], opts: { needed: number; selfUrl?: string; lang: LanguageProfile | null; maxBlock?: number }): { html: string; added: AddedLink[]; shortfall: number } {
  let needed = Math.max(0, Math.floor(opts.needed));
  const out = { html: String(html || ''), added: [] as AddedLink[], shortfall: 0 };
  if (needed === 0) return out;
  const used = new Set(hrefsOf(out.html)); const self = opts.selfUrl ? norm(opts.selfUrl) : '';
  const pool = candidates.filter((c) => c && c.url && /^https?:\/\//i.test(c.url) && !used.has(norm(c.url)) && norm(c.url) !== self);
  const seen = new Set<string>(); const unique = pool.filter((c) => (seen.has(norm(c.url)) ? false : (seen.add(norm(c.url)), true)));

  // (a) dentro do texto
  const blockRe = /<(p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const blocks = [...out.html.matchAll(blockRe)].map((m) => ({ full: m[0], tag: m[1], attrs: m[2], inner: m[3], used: /<a\b/i.test(m[3]) }));
  const replacements = new Map<string, string>();
  const tryLink = (cand: LinkCandidate): boolean => {
    const phrases = [cand.keyword, cand.title].filter((p): p is string => !!p && p.trim().length >= 6 && /\s/.test(p.trim())).map((p) => p.trim());
    for (const phrase of phrases) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(phrase)}(?![\\p{L}\\p{N}])`, 'iu');
      for (const b of blocks) {
        if (b.used) continue;
        const tokens = b.inner.split(/(<[^>]+>)/);
        let inAnchor = false; let done = false;
        const rebuilt = tokens.map((tok) => {
          if (/^<a\b/i.test(tok)) { inAnchor = true; return tok; }
          if (/^<\/a>/i.test(tok)) { inAnchor = false; return tok; }
          if (done || inAnchor || tok.startsWith('<')) return tok;
          const m = tok.match(re);
          if (!m) return tok;
          done = true;
          return tok.replace(re, (hit) => `<a href="${escapeHtml(cand.url)}">${hit}</a>`);
        }).join('');
        if (done) {
          b.used = true;
          replacements.set(b.full, `<${b.tag}${b.attrs}>${rebuilt}</${b.tag}>`);
          out.added.push({ url: cand.url, anchor: phrase, mode: 'no_texto' });
          return true;
        }
      }
    }
    return false;
  };
  const leftovers: LinkCandidate[] = [];
  for (const cand of unique) { if (needed <= 0) break; if (tryLink(cand)) needed--; else leftovers.push(cand); }
  for (const [from, to] of replacements) out.html = out.html.replace(from, to);

  // (b) o que faltar: bloco "Leia também" no fim, só com título real; um bloco só (idempotente)
  const label = opts.lang?.labels.relatedAlso ?? LANGUAGES.en.labels.relatedAlso;
  const hasBlock = new RegExp(`<p>\\s*<strong>\\s*${escapeRe(label)}\\s*:?\\s*</strong>`, 'i').test(out.html);
  const rest = leftovers.filter((c) => c.title && c.title.trim().length >= 6 && !hrefsOf(out.html).includes(norm(c.url)));
  const take = hasBlock ? [] : rest.slice(0, Math.min(needed, opts.maxBlock ?? 6));
  if (take.length) {
    const items = take.map((c) => `<li><a href="${escapeHtml(c.url)}">${escapeHtml(String(c.title).trim())}</a></li>`).join('');
    out.html = `${out.html.trimEnd()}\n<p><strong>${escapeHtml(label)}:</strong></p>\n<ul>${items}</ul>`;
    for (const c of take) out.added.push({ url: c.url, anchor: String(c.title).trim(), mode: 'bloco' });
    needed -= take.length;
  }
  out.shortfall = Math.max(0, needed);
  return out;
}
