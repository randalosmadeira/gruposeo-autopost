/**
 * Núcleo puro do gerador de "Perguntas frequentes" (regra primordial do dono, 20/11/2026: todo conteúdo tira dúvidas de quem pesquisa).
 * Sem rede e sem banco. A IA só RESPONDE com o que o próprio artigo já diz: cada resposta passa por uma checagem de apoio no texto
 * (palavras significativas da resposta têm de existir no artigo) e por filtros de promessa/propaganda. Resposta que não passa é descartada.
 */
import { countDuvidas, MIN_DUVIDAS } from './curadoria-core.ts';
import { findAiTells } from './human-voice-guide.ts';

export const MAX_FAQ = 6;
export const MIN_ANSWER_CHARS = 40;
export const MAX_ANSWER_CHARS = 650;
/** fração mínima das palavras significativas da resposta que precisa aparecer no texto do artigo */
export const MIN_SUPPORT = 0.55;
export const MAX_ARTICLE_CHARS = 14_000;

export interface FaqItem { q: string; a: string }
export interface FaqResult { items: FaqItem[]; descartados: Array<{ q: string; motivo: string }> }

const STOP = new Set(['para', 'com', 'que', 'uma', 'uns', 'umas', 'por', 'como', 'mais', 'mas', 'nos', 'nas', 'dos', 'das', 'sua', 'suas', 'seu', 'seus', 'ele', 'ela', 'eles', 'elas', 'isso', 'esse', 'essa', 'este', 'esta', 'pode', 'podem', 'quando', 'onde', 'qual', 'quais', 'sobre', 'entre', 'ainda', 'tambem', 'também', 'depois', 'antes', 'sem', 'ser', 'são', 'foi', 'tem', 'têm', 'está', 'esta', 'estão', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'can', 'los', 'las', 'del', 'por', 'una', 'con']);
/** promessa de resultado, superlativo e apelo comercial: nunca entram numa resposta (Provimento 205/2021 da OAB e boa prática editorial) */
const BANNED = /(garantimos|garantido|garantia de resultado|resultado garantido|100\s?%|melhor advogad|n[úu]mero\s*1|somos os melhores|sem risco|ganho certo|causa ganha|ligue j[áa]|fale conosco agora|aproveite|promo[çc][ãa]o|urgente)/i;

const norm = (s: string): string => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const significantTokens = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !STOP.has(t));

export const plainArticleText = (html: string | null | undefined, max = MAX_ARTICLE_CHARS): string =>
  String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, max);

/** o artigo já tira dúvidas o bastante? então não mexe */
export const jaTiraDuvidas = (html: string | null | undefined): boolean => countDuvidas(html).perguntas >= MIN_DUVIDAS;

export function buildFaqMessages(input: { title: string; keyword?: string | null; text: string; language?: string | null }): Array<{ role: 'system' | 'user'; content: string }> {
  const lang = String(input.language || 'pt-BR');
  const system = [
    'Você escreve a seção "Perguntas frequentes" de um artigo. Quem pesquisa na internet tem dúvidas reais; a seção precisa tirá-las.',
    'REGRAS INEGOCIÁVEIS:',
    '1) Responda SOMENTE com o que o texto do artigo já afirma. Não acrescente lei, número, prazo, valor, data, nome ou fato que não esteja no texto.',
    '2) Se o texto não responde uma pergunta, não a inclua. É melhor ter 3 boas perguntas do que 6 com chute.',
    '3) As perguntas são as que uma pessoa leiga digitaria no buscador sobre o tema (curtas, naturais, no idioma do artigo), cada uma terminando em "?".',
    '4) Cada resposta tem de 2 a 4 frases curtas, em linguagem simples e acolhedora, direta ao ponto. Comece pela resposta, sem rodeio.',
    '5) Nada de promessa de resultado, superlativo, comparação com concorrente, urgência comercial, chamada para contratar ou "entre em contato".',
    '6) Sem expressões de texto robótico ("é importante ressaltar", "vale destacar", "em suma", "no cenário atual"). Sem listas dentro da resposta. Sem HTML. Sem links.',
    `Idioma: ${lang}.`,
    `Entregue de 3 a ${MAX_FAQ} itens como JSON puro, sem comentários: {"faq":[{"q":"pergunta?","a":"resposta"}]}`,
  ].join('\n');
  const user = [`Título do artigo: ${input.title}`, input.keyword ? `Palavra-chave: ${input.keyword}` : '', '', 'TEXTO DO ARTIGO:', input.text].filter((x) => x !== undefined).join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

const extractJson = (raw: string): unknown => {
  const text = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
};

/** valida a resposta da IA: só entram itens bem formados, apoiados no texto do artigo e sem promessa */
export function parseFaq(raw: string, articleText: string, language = 'pt'): FaqResult {
  const out: FaqResult = { items: [], descartados: [] };
  const data = extractJson(raw) as { faq?: unknown } | null;
  const list = Array.isArray(data?.faq) ? (data!.faq as unknown[]) : [];
  const haystack = new Set(significantTokens(articleText));
  const seen = new Set<string>();
  for (const it of list) {
    const q = String((it as { q?: unknown })?.q ?? '').replace(/\s+/g, ' ').trim();
    const a = String((it as { a?: unknown })?.a ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const reject = (motivo: string) => { out.descartados.push({ q: q.slice(0, 120), motivo }); };
    if (!q.endsWith('?') || q.length < 12 || q.length > 160) { reject('pergunta_mal_formada'); continue; }
    if (seen.has(norm(q))) { reject('pergunta_repetida'); continue; }
    if (a.length < MIN_ANSWER_CHARS || a.length > MAX_ANSWER_CHARS) { reject('resposta_fora_do_tamanho'); continue; }
    if (/https?:\/\/|www\./i.test(a) || BANNED.test(a) || BANNED.test(q)) { reject('promessa_ou_link'); continue; }
    if (findAiTells(a, language).length >= 2) { reject('texto_robotico'); continue; }
    const toks = significantTokens(a);
    const apoio = toks.length ? toks.filter((t) => haystack.has(t)).length / toks.length : 0;
    if (apoio < MIN_SUPPORT) { reject(`sem_apoio_no_texto_${Math.round(apoio * 100)}`); continue; }
    seen.add(norm(q));
    out.items.push({ q, a });
    if (out.items.length >= MAX_FAQ) break;
  }
  return out;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const faqHtml = (items: FaqItem[]): string =>
  `<h2>Perguntas frequentes</h2>\n${items.map((i) => `<h3>${esc(i.q)}</h3>\n<p>${esc(i.a)}</p>`).join('\n')}\n`;

/** acrescenta a seção ao fim do conteúdo (não duplica se já houver seção de perguntas frequentes) */
export function appendFaq(content: string | null | undefined, items: FaqItem[]): string | null {
  const base = String(content ?? '');
  if (items.length < MIN_DUVIDAS) return null;
  if (countDuvidas(base).temSecaoFaq) return null;
  return `${base.replace(/\s+$/, '')}\n${faqHtml(items)}`;
}
