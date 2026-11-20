/**
 * Detector de padrões de IA (heurístico, por idioma, testável). NÃO prova autoria: mede tiques de texto automático e devolve trechos marcados.
 *
 * Nota 0 a 100 (0 = soa humano, 100 = cheio de tiques). Soma de:
 *   - tiques do guia de estilo do idioma (clichês, muletas, aberturas e fechos genéricos), com o trecho exato;
 *   - "não é apenas X, é Y", pergunta retórica, FAQ de molde;
 *   - listas de três adjetivos/substantivos curtos ("rápido, eficiente e seguro");
 *   - travessões em excesso;
 *   - ritmo uniforme (coeficiente de variação do tamanho das frases baixo) e simetria de parágrafos;
 *   - início de frases repetido;
 *   - falta de especificidade (poucos números, nomes próprios, datas, referências a norma).
 * Idioma sem guia completo: só as verificações estruturais (e o relatório diz `coverage`).
 * Nada aqui chama rede ou IA. A reescrita é feita em passos pequenos pelo pipeline (studio-pipeline.ts) usando estes achados.
 */
import { styleGuideFor, type Tic } from './studio-style-guide.ts';

export interface AiFinding { code: string; label: string; excerpt: string; paragraph: number; severity: 1 | 2 | 3; fix: string }
export interface AiReport {
  language: string;
  coverage: 'completa' | 'parcial' | 'estrutural';
  score: number;
  words: number;
  findings: AiFinding[];
  metrics: { sentences: number; sentenceCv: number | null; paragraphCv: number | null; emDashPer100: number; specificityPer100: number; repeatedStarters: number; triads: number };
  /** parágrafos (índices) que mais pesam: são os que o pipeline reescreve primeiro */
  worstParagraphs: number[];
}

const ENT: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘' };
export const htmlToText = (html: string): string => String(html || '').replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, (e) => ENT[e.toLowerCase()] ?? ' ').replace(/\s+/g, ' ').trim();

/** Parágrafos de prosa (p, li, td não entram: só <p>, <li> e <blockquote>), na ordem em que aparecem. Texto sem HTML vira parágrafos por linha em branco. */
export function paragraphsOf(html: string): string[] {
  const src = String(html || '');
  if (!/<[a-z][\s\S]*>/i.test(src)) return src.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: string[] = [];
  for (const m of src.matchAll(/<(p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) { const t = htmlToText(m[2]); if (t) out.push(t); }
  return out;
}
export function headingsOf(html: string): Array<{ level: number; text: string }> {
  return [...String(html || '').matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: htmlToText(m[2]) })).filter((h) => h.text);
}

const ABBR = /\b(?:art|arts|nº|n°|dr|dra|sr|sra|prof|av|rua|r|cap|inc|etc|ex|pág|págs|vs|no|nos|mr|mrs|ms|st|dept|u\.s)\.$/i;
export function sentencesOf(text: string): string[] {
  const raw = text.split(/(?<=[.!?…])\s+(?=[\p{Lu}¿¡"“(\d])/u);
  const out: string[] = [];
  for (const piece of raw) {
    const prev = out[out.length - 1];
    if (prev && ABBR.test(prev)) out[out.length - 1] = `${prev} ${piece}`; else out.push(piece);
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 1);
}
const wordsOf = (s: string): string[] => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
const cv = (nums: number[]): number | null => {
  if (nums.length < 2) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (!mean) return null;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
  return sd / mean;
};
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** três itens curtos ("rápido, eficiente e seguro"): cada item uma palavra (ou duas), ligados por vírgula e "e/and/y/et/und". */
const TRIAD = /(?<![\p{L}\p{N}])([\p{L}-]{3,16}),\s+([\p{L}-]{3,16})\s+(?:e|and|y|et|und|en|ou|or|o)\s+([\p{L}-]{3,16})(?![\p{L}\p{N}])/giu;
const PROPER = /(?<=[a-zà-ÿ,;:]\s)[\p{Lu}][\p{L}]{2,}(?:\s+[\p{Lu}][\p{L}]+)*/gu;
const LAW_REF = /\b(?:art(?:igo)?s?\.?\s*\d+|lei\s+(?:n[º°.]?\s*)?\d[\d./]*|§\s*\d+|resolu[cç][aã]o|provimento|portaria|c[oó]digo\s+(?:penal|civil|de processo)|CLT|CPC|CPP|CF\/\d+|section\s+\d+|article\s+\d+|art[ií]culo\s+\d+)/gi;

function pushTic(findings: AiFinding[], paragraphs: string[], tics: Tic[], mode: 'any' | 'start' | 'closer') {
  const lastStart = Math.max(0, paragraphs.length - 2);
  paragraphs.forEach((p, i) => {
    if (mode === 'closer' && i < lastStart) return;
    for (const tic of tics) {
      let re: RegExp;
      try { re = new RegExp(tic.re, mode === 'any' ? 'giu' : 'iu'); } catch { continue; }
      if (mode === 'any') { for (const m of p.matchAll(re)) findings.push({ code: tic.code, label: tic.label, excerpt: clip(m[0].trim()), paragraph: i, severity: tic.weight as 1 | 2 | 3, fix: tic.fix }); }
      else { const m = p.match(re); if (m) findings.push({ code: tic.code, label: tic.label, excerpt: clip(p.slice(0, Math.max(60, m[0].length + 30))), paragraph: i, severity: tic.weight as 1 | 2 | 3, fix: tic.fix }); }
    }
  });
}

/** Analisa um texto (HTML ou texto puro) no idioma informado. */
export function detectAiPatterns(input: string, language = 'pt'): AiReport {
  const lang = String(language || 'pt').slice(0, 2).toLowerCase();
  const guide = styleGuideFor(lang);
  const paragraphs = paragraphsOf(input);
  const heads = headingsOf(input);
  const text = paragraphs.join(' ');
  const words = wordsOf(text).length;
  const findings: AiFinding[] = [];
  const coverage: AiReport['coverage'] = guide ? guide.coverage : 'estrutural';

  if (guide) {
    pushTic(findings, paragraphs, guide.tics, 'any');
    pushTic(findings, paragraphs, guide.openers, 'start');
    pushTic(findings, paragraphs, guide.closers, 'closer');
    // FAQ de molde: 3 ou mais títulos/perguntas que são todos do molde
    const questions = heads.map((h) => h.text).filter((q) => /[?？]$/.test(q) || guide.genericFaq.some((g) => new RegExp(`^${g}`, 'iu').test(q)));
    const templated = questions.filter((q) => guide.genericFaq.some((g) => new RegExp(`^${g}`, 'iu').test(q)));
    if (templated.length >= 3 && templated.length >= questions.length * 0.6) findings.push({ code: 'faq_de_molde', label: 'FAQ de molde (perguntas genéricas em série)', excerpt: clip(templated.slice(0, 3).join(' | ')), paragraph: -1, severity: 3, fix: 'Troque por as perguntas que o público faz de verdade (Search Console, atendimento, "as pessoas também perguntam").' });
  }

  // travessões
  const dashes = (text.match(/—/g) || []).length;
  const emDashPer100 = words ? (dashes / words) * 100 : 0;
  if (dashes >= 3 && emDashPer100 > 0.45) {
    const at = paragraphs.findIndex((p) => p.includes('—'));
    findings.push({ code: 'travessao_excesso', label: 'Travessões em excesso', excerpt: `${dashes} travessões em ${words} palavras`, paragraph: at, severity: 2, fix: 'Use vírgula, ponto ou parênteses; no máximo um travessão na página.' });
  }
  // listas de três itens curtos
  let triads = 0;
  paragraphs.forEach((p, i) => { for (const m of p.matchAll(TRIAD)) { triads++; if (triads <= 6) findings.push({ code: 'lista_de_tres', label: 'Lista de três itens soltos ("rápido, eficiente e seguro")', excerpt: clip(m[0]), paragraph: i, severity: 2, fix: 'Escolha o que realmente vale e explique com um dado.' }); } });
  const triadExtra = Math.max(0, triads - 6);

  // ritmo e simetria
  const sentences = paragraphs.flatMap((p) => sentencesOf(p));
  const lens = sentences.map((s) => wordsOf(s).length).filter((n) => n > 0);
  const sentenceCv = lens.length >= 8 ? cv(lens) : null;
  if (sentenceCv !== null && sentenceCv < 0.32) findings.push({ code: 'ritmo_uniforme', label: 'Frases do mesmo tamanho (ritmo de máquina)', excerpt: `variação de tamanho das frases: ${sentenceCv.toFixed(2)} (humano costuma passar de 0,45)`, paragraph: -1, severity: 3, fix: 'Misture frases curtas (5 a 9 palavras) e longas (20 a 30).' });
  const pLens = paragraphs.map((p) => wordsOf(p).length);
  const paragraphCv = pLens.length >= 5 ? cv(pLens) : null;
  if (paragraphCv !== null && paragraphCv < 0.2) findings.push({ code: 'paragrafos_simetricos', label: 'Parágrafos de tamanho igual (simetria artificial)', excerpt: `variação de tamanho dos parágrafos: ${paragraphCv.toFixed(2)}`, paragraph: -1, severity: 2, fix: 'Deixe parágrafos de uma frase onde a ideia é curta e junte onde ela é longa.' });

  // início de frases repetido
  const starters = sentences.map((s) => (wordsOf(s)[0] || '').toLowerCase());
  let repeatedStarters = 0;
  for (let i = 2; i < starters.length; i++) if (starters[i] && starters[i] === starters[i - 1] && starters[i] === starters[i - 2]) repeatedStarters++;
  const freq = new Map<string, number>(); for (const s of starters) if (s.length > 2) freq.set(s, (freq.get(s) || 0) + 1);
  const topStarter = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  if (repeatedStarters >= 1 || (topStarter && sentences.length >= 10 && topStarter[1] / sentences.length > 0.3)) findings.push({ code: 'inicio_repetido', label: 'Frases começando sempre do mesmo jeito', excerpt: topStarter ? `"${topStarter[0]}" abre ${topStarter[1]} frases` : 'três frases seguidas com a mesma abertura', paragraph: -1, severity: 2, fix: 'Varie o sujeito e a ordem das frases.' });

  // especificidade
  const digits = (text.match(/\d+/g) || []).length;
  const proper = (text.match(PROPER) || []).length;
  const laws = (text.match(LAW_REF) || []).length;
  const specificityPer100 = words ? ((digits + proper + laws * 2) / words) * 100 : 0;
  if (words >= 150 && specificityPer100 < 1.2) findings.push({ code: 'sem_especificidade', label: 'Texto sem especificidade (poucos números, nomes, órgãos ou normas)', excerpt: `${digits} números, ${proper} nomes próprios, ${laws} referências em ${words} palavras`, paragraph: -1, severity: 3, fix: 'Acrescente órgãos, locais, prazos, documentos e números REAIS com fonte; o que faltar fica como pendência.' });

  // nota: soma dos pesos (severidade) com retorno decrescente e teto 100
  const weight = findings.reduce((a, f) => a + f.severity * (f.code === 'lista_de_tres' ? 2 : 3), 0) + triadExtra * 2;
  const score = Math.min(100, Math.round(100 * (1 - Math.exp(-weight / 38))));

  const perPara = new Map<number, number>();
  for (const f of findings) if (f.paragraph >= 0) perPara.set(f.paragraph, (perPara.get(f.paragraph) || 0) + f.severity);
  const worstParagraphs = [...perPara.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i]) => i);
  return { language: lang, coverage, score, words, findings, metrics: { sentences: sentences.length, sentenceCv, paragraphCv, emDashPer100: Math.round(emDashPer100 * 100) / 100, specificityPer100: Math.round(specificityPer100 * 100) / 100, repeatedStarters, triads }, worstParagraphs };
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Marca os trechos achados no HTML (<mark data-ai="codigo">) para a tela mostrar. Só marca trecho que aparece inteiro dentro de um texto sem tags. */
export function markFindings(html: string, findings: AiFinding[]): string {
  let out = String(html || '');
  for (const f of findings) {
    const raw = f.excerpt.replace(/…$/, '');
    if (!raw || raw.length < 4 || /^\d+ /.test(raw)) continue;
    const esc = escHtml(raw);
    const at = out.indexOf(esc) >= 0 ? out.indexOf(esc) : out.indexOf(raw);
    if (at < 0) continue;
    const piece = out.indexOf(esc) >= 0 ? esc : raw;
    const before = out.slice(0, at);
    if (before.lastIndexOf('<') > before.lastIndexOf('>')) continue; // dentro de uma tag
    out = `${before}<mark data-ai="${f.code}" title="${escHtml(f.label)}">${piece}</mark>${out.slice(at + piece.length)}`;
  }
  return out;
}
