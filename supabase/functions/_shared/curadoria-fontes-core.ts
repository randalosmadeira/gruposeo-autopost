/**
 * Núcleo puro do lote de FONTES da curadoria: dá à revisão editorial o que ela exige (texto de fonte verificável, >= 100 caracteres, com trechos literais).
 * Duas origens, ambas públicas e do próprio assunto do artigo:
 *  - a matéria original que o artigo reescreveu (config.source_url);
 *  - a legislação oficial (planalto.gov.br) quando o artigo é jurídico e não tem matéria de origem.
 * Sem rede e sem banco aqui. A função `curadoria-fontes` faz a busca (com proteção contra endereços privados) e grava em config.sourcesContext.
 */
import { significantTokens } from './curadoria-duvidas-core.ts';
export { isPlaceholderText } from './curadoria-core.ts';

export const MAX_SOURCE_CHARS = 8000; // a revisão só lê os 8000 primeiros caracteres da fonte
export const MIN_SOURCE_CHARS = 100;

const NAMED: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Atilde: 'Ã', Otilde: 'Õ', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', ndash: '–', mdash: '—', ordm: 'º', ordf: 'ª', sect: '§' };
const decodeEntities = (s: string): string => s
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
  .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED[n] ?? m);

/** HTML -> texto em parágrafos (uma linha por bloco). Prefere <article>/<main>; descarta script, estilo, menus e rodapé. */
export function htmlToParagraphs(html: string): string[] {
  let h = String(html || '');
  const pick = h.match(/<article[\s\S]*?<\/article>/i) || h.match(/<main[\s\S]*?<\/main>/i);
  if (pick) h = pick[0];
  h = h.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<\/(p|div|li|h[1-6]|tr|br|blockquote|section)>|<br\s*\/?>/gi, '\n');
  const text = decodeEntities(h.replace(/<[^>]*>/g, ' '));
  return text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length >= 25);
}

/** parágrafos mais ligados ao tema do artigo (palavras do título/palavra-chave), na ordem original, até o limite de caracteres */
export function pickRelevant(paragraphs: string[], topic: string, maxChars = MAX_SOURCE_CHARS - 300): string {
  const want = new Set(significantTokens(topic));
  const scored = paragraphs.map((p, i) => ({ p, i, s: want.size ? significantTokens(p).filter((t, k, a) => want.has(t) && a.indexOf(t) === k).length : 0 }));
  const best = scored.filter((x) => x.s >= (want.size >= 4 ? 2 : 1)).sort((a, b) => b.s - a.s || a.i - b.i);
  const take: typeof scored = []; let total = 0;
  for (const x of best) { if (total + x.p.length + 1 > maxChars) continue; take.push(x); total += x.p.length + 1; if (total >= maxChars) break; }
  // sem parágrafo ligado ao tema (ex.: matéria curta): usa o início do texto
  const chosen = take.length ? take.sort((a, b) => a.i - b.i).map((x) => x.p) : (() => { const o: string[] = []; let t = 0; for (const p of paragraphs) { if (t + p.length > maxChars) break; o.push(p); t += p.length + 1; } return o; })();
  return chosen.join('\n');
}

export function buildSourcesContext(input: { nome: string; url: string; textoFonte: string; consultadoEm: string }): string {
  const cab = `FONTE: ${input.nome}\nENDEREÇO: ${input.url}\nCONSULTADO EM: ${input.consultadoEm}\n\n`;
  return (cab + input.textoFonte).slice(0, MAX_SOURCE_CHARS);
}

export const temFonteSuficiente = (ctx: unknown): boolean => String(ctx ?? '').replace(/\s+/g, ' ').trim().length >= MIN_SOURCE_CHARS;

// --------------------------------------------------------------------------------------------------- legislação oficial (planalto.gov.br)
export interface LegalSource { id: string; nome: string; url: string; quando: RegExp }
export const LEGAL_SOURCES: LegalSource[] = [
  { id: 'cpp', nome: 'Código de Processo Penal (Decreto-Lei 3.689/1941)', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689compilado.htm', quando: /cust[óo]dia|flagrante|preventiv|tornozeleira|monitora[çc][ãa]o eletr|cautelar|apela[çc][ãa]o|recurso|senten[çc]a|inqu[ée]rito|j[úu]ri|pris[ãa]o/i },
  { id: 'cp', nome: 'Código Penal (Decreto-Lei 2.848/1940)', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm', quando: /viol[êe]ncia|crime|pena|homic[ií]dio|les[ãa]o|furto|roubo|tr[áa]fico|estelionato/i },
  { id: 'maria-da-penha', nome: 'Lei Maria da Penha (Lei 11.340/2006)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11340.htm', quando: /vic[áa]ria|maria da penha|viol[êe]ncia dom[ée]stica|medida protetiva/i },
  { id: 'crimes-tributarios', nome: 'Lei dos Crimes contra a Ordem Tributária (Lei 8.137/1990)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8137.htm', quando: /tribut[áa]ri|sonega[çc][ãa]o|fiscal|imposto/i },
  { id: 'cc', nome: 'Código Civil (Lei 10.406/2002)', url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm', quando: /holding|integraliza|capital social|sociedade limitada|im[óo]vel|cota/i },
  { id: 'cpc', nome: 'Código de Processo Civil (Lei 13.105/2015)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm', quando: /parcelamento|acordo|execu[çc][ãa]o|cumprimento de senten[çc]a|cobran[çc]a/i },
  { id: 'cdc', nome: 'Código de Defesa do Consumidor (Lei 8.078/1990)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm', quando: /consumidor|cobran[çc]a indevida|garantia|v[ií]cio/i },
  { id: 'clt', nome: 'Consolidação das Leis do Trabalho (Decreto-Lei 5.452/1943)', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm', quando: /trabalh|empregad|demiss|rescis|f[ée]rias|hora extra/i },
  { id: 'rastreabilidade-medicamentos', nome: 'Lei do Sistema Nacional de Controle de Medicamentos (Lei 11.903/2009)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l11903.htm', quando: /medicamento|rastre|lote|farm[áa]c/i },
];

/** as 2 leis mais prováveis para o artigo (mais palavras do tema batendo no gatilho) */
export function matchLegalSources(topic: string, max = 2): LegalSource[] {
  return LEGAL_SOURCES.map((l) => ({ l, n: (String(topic).match(new RegExp(l.quando.source, 'gi')) || []).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, max).map((x) => x.l);
}


/** endereço público e seguro para buscar: https, sem usuário/porta estranha, sem IP literal */
export function safeSourceUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname) || u.hostname.includes(':') || u.hostname === 'localhost' || !u.hostname.includes('.')) return null;
    return u;
  } catch { return null; }
}
