/**
 * Idiomas do conteúdo: detecção e regras POR IDIOMA (legibilidade, perguntas nos H2, conectivos, tom conversacional, FAQ, conclusão, convite ao contato).
 *
 * O sistema é global (decisão do dono, 20/11/2026): nada aqui assume português, o Brasil, uma moeda ou uma lei. O idioma vem, nesta ordem, do que
 * está CONFIGURADO (idioma do artigo, depois do projeto) e, sem configuração, é DETECTADO pelo texto. Idioma sem pacote = "sem fórmula": nada de
 * nota de legibilidade (nunca devolve 0 de mentira) e as demais verificações que dependem de idioma ficam neutras.
 *
 * Fórmulas de legibilidade (cada uma marcada 'documentada' ou 'referencia'; 'referencia' = não consegui confirmar as constantes numa fonte
 * primária desta sessão, então use como indicativo e confira):
 *   en  Flesch Reading Ease                206,835 − 1,015·ASL − 84,6·ASW                                  (Flesch, 1948)       documentada
 *   pt  Flesch adaptado ao português       248,835 − 1,015·ASL − 84,6·ASW                                  (Martins et al., 1996) documentada
 *   es  Fernández-Huerta                   206,84 − 0,60·P − 1,02·F   (P = sílabas por 100 palavras; F = frases por 100 palavras)  (Fernández Huerta, 1959) documentada
 *   fr  Kandel-Moles                       207 − 1,015·ASL − 73,6·ASW                                      (Kandel e Moles, 1958) documentada
 *   it  Gulpease                           89 + (300·frases − 10·letras) / palavras                        (Lucisano e Piemontese, 1988) documentada; escala própria 0-100
 *   de  Flesch-Amstad                      180 − ASL − 58,5·ASW                                            (Amstad, 1978)       documentada
 *   nl  Flesch-Douma                       206,84 − 0,93·ASL − 77·ASW                                      (Douma, 1960)        referencia
 * ASL = palavras por frase; ASW = sílabas por palavra. A contagem de sílabas é uma APROXIMAÇÃO por idioma (grupos de vogais): a nota é indicativa.
 * Sem dependência de Deno (usado também pela tela e pelo vitest).
 */

export type FormulaStatus = 'documentada' | 'referencia';
export interface TextStats { words: number; sentences: number; syllables: number; letters: number }
export interface ReadabilityFormula {
  id: string;
  label: string;
  status: FormulaStatus;
  /** escala própria (Gulpease não é a escala do Flesch): os mínimos padrão abaixo valem para a escala da fórmula */
  defaultMin: number;
  defaultTarget: number;
  compute(s: TextStats): number;
}

export interface LanguageProfile {
  code: string;
  /** nome em inglês, usado nas instruções às IAs ("Write in Spanish") */
  name: string;
  readability: ReadabilityFormula | null;
  /** inícios de frase que fazem um H2 contar como pergunta (regex, sem ancoragem) */
  questionStarters: string;
  transitions: string[];
  /** marcadores de tom direto com o leitor (regex com \b) */
  conversational: string;
  /** "segundo X (2024)", "according to X (2024)"... */
  sourcePhrases: RegExp[];
  expertPatterns: RegExp[];
  faq: RegExp;
  conclusion: RegExp;
  cta: RegExp;
  filler: string[];
  passive: RegExp | null;
  definitionVerbs: string;
  /** rótulos neutros que o piloto escreve no idioma do artigo */
  labels: { home: string; relatedAlso: string; conclusionHeading: string; faqHeading: string };
  /** autores genéricos que NÃO contam como autor identificado */
  genericAuthors: string[];
}

const flesch = (id: string, label: string, status: FormulaStatus, a: number, asl: number, asw: number, min = 60, target = 70): ReadabilityFormula => ({
  id, label, status, defaultMin: min, defaultTarget: target,
  compute: (s) => { const aslV = s.words / Math.max(s.sentences, 1); const aswV = s.syllables / Math.max(s.words, 1); return clamp(a - asl * aslV - asw * aswV); },
});
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

const NUM_CURRENCY = /(?:US\$|R\$|\$|€|£|¥|CHF|USD|EUR|GBP|BRL)\s*[\d.,]+/g;
export const STAT_NUMERIC: RegExp[] = [/\d+[.,]?\d*\s*%/g, NUM_CURRENCY];

export const LANGUAGES: Record<string, LanguageProfile> = {
  pt: {
    code: 'pt', name: 'Portuguese',
    readability: flesch('flesch_pt', 'Flesch adaptado ao português (Martins et al., 1996)', 'documentada', 248.835, 1.015, 84.6),
    questionStarters: 'como|o que|qual|quais|quando|quanto|quantos|quantas|por que|porque|onde|quem|para que|posso|pode|devo|vale a pena',
    transitions: ['além disso', 'portanto', 'contudo', 'entretanto', 'porém', 'todavia', 'no entanto', 'assim', 'dessa forma', 'por isso', 'consequentemente', 'em primeiro lugar', 'em segundo lugar', 'finalmente', 'por exemplo', 'ou seja', 'isto é', 'em resumo', 'em conclusão', 'por outro lado', 'além do mais', 'sobretudo', 'principalmente', 'especialmente', 'de fato', 'na verdade', 'certamente', 'sem dúvida'],
    conversational: '\\b(?:você|vocês|sua|seu|suas|seus)\\b',
    sourcePhrases: [/segundo\s+[^,.(]+\s*\(\d{4}\)/gi, /de acordo com\s+[^,.(]+/gi, /dados d[aeo]\s+[^,.(]+\s*\(\d{4}\)/gi, /pesquisa\s+d[aeo]\s+[^,.(]+/gi, /estudo\s+d[aeo]\s+[^,.(]+/gi],
    expertPatterns: [/(?:Dr\.|Dra\.|Prof\.|Profª\.)\s+[A-ZÀ-Ü][a-zà-ü]+/g, /especialista\s+em\s+/gi, /segundo\s+(?:o|a)\s+(?:especialista|professor|professora|doutor|doutora|pesquisador|pesquisadora)/gi],
    faq: /faq|perguntas frequentes|dúvidas comuns|dúvidas frequentes/i,
    conclusion: /conclus[ãa]o|considerações finais|em suma/i,
    cta: /consulte|entre em contato|saiba mais|fale conosco|whatsapp|agende|solicite/i,
    filler: ['no mundo de hoje', 'em um mundo cada vez mais', 'neste artigo vamos', 'é importante ressaltar', 'vale mencionar que', 'vamos mergulhar', 'sem dúvida alguma', 'nos dias atuais', 'como já sabemos'],
    passive: /\b(?:foi|foram|é|são|era|eram|será|serão|sido|sendo)\s+\w+(?:ado|ada|ados|adas|ido|ida|idos|idas|to|ta|tos|tas)\b/gi,
    definitionVerbs: 'é|são|consiste|significa|refere-se',
    labels: { home: 'Início', relatedAlso: 'Leia também', conclusionHeading: 'Conclusão', faqHeading: 'Perguntas frequentes' },
    genericAuthors: ['redação', 'redacao', 'equipe editorial', 'equipe', 'redator'],
  },
  en: {
    code: 'en', name: 'English',
    readability: flesch('flesch_en', 'Flesch Reading Ease (Flesch, 1948)', 'documentada', 206.835, 1.015, 84.6),
    questionStarters: 'how|what|why|when|where|who|which|can|could|does|do|is|are|should|will|would|may',
    transitions: ['however', 'therefore', 'moreover', 'in addition', 'furthermore', 'for example', 'for instance', 'in summary', 'in conclusion', 'on the other hand', 'consequently', 'finally', 'in fact', 'thus', 'meanwhile', 'nevertheless', 'as a result', 'first of all', 'in other words', 'especially', 'above all', 'indeed'],
    conversational: '\\b(?:you|your|yours|we|our)\\b',
    sourcePhrases: [/according to\s+[^,.(]+\s*\(\d{4}\)/gi, /according to\s+[^,.(]+/gi, /data from\s+[^,.(]+/gi, /(?:study|survey|report) by\s+[^,.(]+/gi],
    expertPatterns: [/(?:Dr\.|Prof\.|Professor)\s+[A-Z][a-z]+/g, /expert\s+(?:in|on)\s+/gi, /according to\s+(?:a|the)\s+(?:doctor|professor|expert|specialist|researcher)/gi],
    faq: /faq|frequently asked|common questions/i,
    conclusion: /conclusion|in summary|final thoughts|to sum up|wrapping up/i,
    cta: /contact us|get in touch|learn more|book (?:a|your)|call us|schedule|request a|talk to/i,
    filler: ["in today's world", "in today's fast-paced", 'it is important to note', "let's dive", 'in this article we will', 'needless to say', 'as we all know'],
    passive: /\b(?:is|are|was|were|been|being|be)\s+\w+(?:ed|en)\b/gi,
    definitionVerbs: 'is|are|means|refers to|consists of',
    labels: { home: 'Home', relatedAlso: 'Read also', conclusionHeading: 'Conclusion', faqHeading: 'Frequently asked questions' },
    genericAuthors: ['staff', 'editorial team', 'editorial staff', 'team', 'admin', 'administrator', 'editor'],
  },
  es: {
    code: 'es', name: 'Spanish',
    readability: {
      id: 'fernandez_huerta', label: 'Fernández-Huerta (1959)', status: 'documentada', defaultMin: 60, defaultTarget: 70,
      compute: (s) => clamp(206.84 - 0.60 * ((s.syllables / Math.max(s.words, 1)) * 100) - 1.02 * ((s.sentences / Math.max(s.words, 1)) * 100)),
    },
    questionStarters: 'c[oó]mo|qu[eé]|cu[aá]l|cu[aá]les|cu[aá]ndo|cu[aá]nto|cu[aá]ntos|cu[aá]ntas|por qu[eé]|d[oó]nde|qui[eé]n|para qu[eé]|puedo|puede|debo',
    transitions: ['además', 'sin embargo', 'por lo tanto', 'por ejemplo', 'en resumen', 'por otro lado', 'finalmente', 'en consecuencia', 'de hecho', 'asimismo', 'no obstante', 'en conclusión', 'en primer lugar', 'es decir', 'sobre todo', 'por eso', 'así'],
    conversational: '\\b(?:usted|ustedes|tú|tu|tus|su|sus|puedes)\\b',
    sourcePhrases: [/seg[uú]n\s+[^,.(]+\s*\(\d{4}\)/gi, /de acuerdo con\s+[^,.(]+/gi, /datos de\s+[^,.(]+/gi, /(?:estudio|encuesta|informe) de\s+[^,.(]+/gi],
    expertPatterns: [/(?:Dr\.|Dra\.|Prof\.|Profa\.)\s+[A-ZÁÉÍÓÚ][a-záéíóú]+/g, /experto\s+en\s+/gi, /especialista\s+en\s+/gi],
    faq: /faq|preguntas frecuentes|dudas comunes/i,
    conclusion: /conclusi[oó]n|en resumen|consideraciones finales/i,
    cta: /cont[aá]ctenos|cont[aá]cte|contacta|solicite|consulte|agende|reserve|escr[ií]banos|ll[aá]menos/i,
    filler: ['en el mundo de hoy', 'en un mundo cada vez más', 'es importante destacar', 'en la actualidad', 'sin lugar a dudas', 'como ya sabemos'],
    passive: /\b(?:fue|fueron|es|son|ser|sido|será|serán)\s+\w+(?:ado|ada|ados|adas|ido|ida|idos|idas)\b/gi,
    definitionVerbs: 'es|son|significa|consiste|se refiere a',
    labels: { home: 'Inicio', relatedAlso: 'Lee también', conclusionHeading: 'Conclusión', faqHeading: 'Preguntas frecuentes' },
    genericAuthors: ['redacción', 'redaccion', 'equipo editorial', 'equipo', 'admin'],
  },
  fr: {
    code: 'fr', name: 'French',
    readability: flesch('kandel_moles', 'Kandel-Moles (1958)', 'documentada', 207, 1.015, 73.6),
    questionStarters: "comment|qu['’]est-ce|que|quel|quelle|quels|quelles|quand|combien|pourquoi|o[uù]|qui|peut-on|puis-je|faut-il",
    transitions: ['cependant', 'par conséquent', 'en outre', 'de plus', 'par exemple', 'en résumé', "d'autre part", 'enfin', 'en effet', 'ainsi', 'toutefois', 'pourtant', 'en conclusion', "tout d'abord", 'autrement dit', 'surtout', 'donc'],
    conversational: '\\b(?:vous|votre|vos|tu|ton|ta|tes)\\b',
    sourcePhrases: [/selon\s+[^,.(]+\s*\(\d{4}\)/gi, /d['’]après\s+[^,.(]+/gi, /(?:étude|enquête|rapport) de\s+[^,.(]+/gi],
    expertPatterns: [/(?:Dr|Pr|Prof\.)\s+[A-ZÉÈ][a-zéèêë]+/g, /expert\s+en\s+/gi, /spécialiste\s+(?:en|de)\s+/gi],
    faq: /faq|questions fréquentes|foire aux questions/i,
    conclusion: /conclusion|en résumé|pour conclure/i,
    cta: /contactez|prenez rendez-vous|en savoir plus|appelez|réservez|demandez/i,
    filler: ["dans le monde d'aujourd'hui", 'il est important de noter', 'de nos jours', 'comme nous le savons'],
    passive: null,
    definitionVerbs: 'est|sont|signifie|consiste',
    labels: { home: 'Accueil', relatedAlso: 'À lire aussi', conclusionHeading: 'Conclusion', faqHeading: 'Questions fréquentes' },
    genericAuthors: ['rédaction', 'redaction', 'équipe éditoriale', 'équipe', 'admin'],
  },
  it: {
    code: 'it', name: 'Italian',
    readability: {
      id: 'gulpease', label: 'Gulpease (Lucisano e Piemontese, 1988)', status: 'documentada', defaultMin: 60, defaultTarget: 70,
      compute: (s) => clamp(89 + (300 * s.sentences - 10 * s.letters) / Math.max(s.words, 1)),
    },
    questionStarters: "come|che cosa|cos['’]è|cosa|qual|quale|quali|quando|quanto|quanti|perch[eé]|dove|chi|posso|si pu[oò]",
    transitions: ['tuttavia', 'quindi', 'inoltre', 'per esempio', 'in sintesi', "d'altra parte", 'infine', 'di fatto', 'pertanto', 'perciò', 'in conclusione', 'in primo luogo', 'ovvero', 'soprattutto', 'dunque'],
    conversational: '\\b(?:tu|voi|tuo|tua|tuoi|tue|vostro|vostra|lei)\\b',
    sourcePhrases: [/secondo\s+[^,.(]+\s*\(\d{4}\)/gi, /stando a\s+[^,.(]+/gi, /(?:studio|indagine|rapporto) di\s+[^,.(]+/gi],
    expertPatterns: [/(?:Dott\.|Dott\.ssa|Prof\.|Prof\.ssa)\s+[A-ZÀ-Ù][a-zà-ù]+/g, /esperto\s+(?:in|di)\s+/gi],
    faq: /faq|domande frequenti|domande comuni/i,
    conclusion: /conclusione|in sintesi|in conclusione/i,
    cta: /contattaci|contattateci|scopri di più|prenota|chiama|richiedi/i,
    filler: ['nel mondo di oggi', 'è importante notare', 'al giorno d’oggi', 'come tutti sappiamo'],
    passive: null,
    definitionVerbs: 'è|sono|significa|consiste',
    labels: { home: 'Home', relatedAlso: 'Leggi anche', conclusionHeading: 'Conclusione', faqHeading: 'Domande frequenti' },
    genericAuthors: ['redazione', 'staff', 'team', 'admin'],
  },
  de: {
    code: 'de', name: 'German',
    readability: flesch('flesch_amstad', 'Flesch-Amstad (1978)', 'documentada', 180, 1, 58.5),
    questionStarters: 'wie|was|warum|wann|wo|wer|welche|welcher|welches|kann|k[oö]nnen|muss|darf|ist|sind',
    transitions: ['jedoch', 'daher', 'außerdem', 'zum beispiel', 'zusammenfassend', 'andererseits', 'schließlich', 'tatsächlich', 'deshalb', 'dennoch', 'darüber hinaus', 'folglich', 'insbesondere', 'das heißt'],
    conversational: '\\b(?:Sie|Ihr|Ihre|Ihnen|du|dein|deine)\\b',
    sourcePhrases: [/laut\s+[^,.(]+\s*\(\d{4}\)/gi, /nach Angaben von\s+[^,.(]+/gi, /(?:Studie|Umfrage|Bericht) von\s+[^,.(]+/gi],
    expertPatterns: [/(?:Dr\.|Prof\.)\s+[A-ZÄÖÜ][a-zäöüß]+/g, /Experte\s+für\s+/gi, /Expertin\s+für\s+/gi],
    faq: /faq|häufige fragen|häufig gestellte fragen/i,
    conclusion: /fazit|zusammenfassung|schlussfolgerung/i,
    cta: /kontaktieren sie|nehmen sie kontakt|jetzt anfragen|mehr erfahren|termin vereinbaren|rufen sie/i,
    filler: ['in der heutigen welt', 'es ist wichtig zu beachten', 'wie wir alle wissen'],
    passive: null,
    definitionVerbs: 'ist|sind|bedeutet|bezeichnet',
    labels: { home: 'Startseite', relatedAlso: 'Lesen Sie auch', conclusionHeading: 'Fazit', faqHeading: 'Häufige Fragen' },
    genericAuthors: ['redaktion', 'team', 'admin', 'redaktionsteam'],
  },
  nl: {
    code: 'nl', name: 'Dutch',
    readability: flesch('flesch_douma', 'Flesch-Douma (1960)', 'referencia', 206.84, 0.93, 77),
    questionStarters: 'hoe|wat|waarom|wanneer|waar|wie|welke|welk|kan|kunnen|moet|mag|is|zijn',
    transitions: ['echter', 'daarom', 'bovendien', 'bijvoorbeeld', 'kortom', 'anderzijds', 'ten slotte', 'inderdaad', 'dus', 'toch', 'bovendien', 'met andere woorden'],
    conversational: '\\b(?:je|jij|jouw|jullie|u|uw)\\b',
    sourcePhrases: [/volgens\s+[^,.(]+\s*\(\d{4}\)/gi, /(?:onderzoek|rapport) van\s+[^,.(]+/gi],
    expertPatterns: [/(?:Dr\.|Prof\.)\s+[A-Z][a-z]+/g, /expert\s+in\s+/gi],
    faq: /faq|veelgestelde vragen/i,
    conclusion: /conclusie|samenvattend|tot slot/i,
    cta: /neem contact|meer informatie|maak een afspraak|bel ons|vraag aan/i,
    filler: ['in de wereld van vandaag', 'het is belangrijk om op te merken'],
    passive: null,
    definitionVerbs: 'is|zijn|betekent|bestaat uit',
    labels: { home: 'Home', relatedAlso: 'Lees ook', conclusionHeading: 'Conclusie', faqHeading: 'Veelgestelde vragen' },
    genericAuthors: ['redactie', 'team', 'admin'],
  },
};

const NAMES: Record<string, string> = {
  portuguese: 'pt', português: 'pt', portugues: 'pt', english: 'en', inglês: 'en', ingles: 'en', spanish: 'es', español: 'es', espanol: 'es', espanhol: 'es',
  french: 'fr', français: 'fr', francês: 'fr', frances: 'fr', italian: 'it', italiano: 'it', german: 'de', deutsch: 'de', alemão: 'de', alemao: 'de',
  dutch: 'nl', nederlands: 'nl', holandês: 'nl', holandes: 'nl',
};

export interface ResolvedLanguage {
  /** etiqueta BCP 47 como veio (ex.: 'pt-BR', 'en-GB') ou só o código quando não há região */
  tag: string;
  code: string;
  region: string | null;
  source: 'configurado' | 'detectado' | 'desconhecido';
  profile: LanguageProfile | null;
  /** confiança da detecção (1 quando configurado) */
  confidence: number;
}

/** Normaliza 'pt_BR', 'PT-br', 'Portuguese'... para { code, region } (sem inventar região). */
export function parseLanguageTag(value: unknown): { code: string; region: string | null; tag: string } | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const named = NAMES[raw.toLowerCase()];
  if (named) return { code: named, region: null, tag: named };
  const m = raw.replace(/_/g, '-').match(/^([a-zA-Z]{2,3})(?:-([a-zA-Z]{2}|\d{3}))?(?:-.*)?$/);
  if (!m) return null;
  const code = m[1].toLowerCase();
  const region = m[2] ? m[2].toUpperCase() : null;
  return { code, region, tag: region ? `${code}-${region}` : code };
}

const STOPWORDS: Record<string, string> = {
  pt: 'de que o a e do da em um uma para com não os as no na por mais se é são dos das você como foi',
  es: 'de que el la y en los las un una para con no por es se del su al como más son lo está usted',
  en: 'the and of to in is that for it with as on are was this be by at or from you your not have',
  fr: 'de la le et les des en un une du que est pour dans qui pas sur au plus par ce vous sont avec',
  it: 'di che e il la un una per in è non con del della le si più sono come al dei gli lo',
  de: 'der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an',
  nl: 'de het een en van in is dat op te voor met zijn niet aan er ook als bij door maar om',
};
const STOPSETS: Record<string, Set<string>> = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v.split(' '))]));

/** Detecção por palavras funcionais muito comuns. Só decide quando há margem clara; senão devolve 'desconhecido' (sem chute). */
export function detectLanguage(text: string): { code: string | null; confidence: number } {
  const tokens = String(text || '').toLowerCase().replace(/<[^>]+>/g, ' ').match(/[\p{L}'’]+/gu) || [];
  if (tokens.length < 25) return { code: null, confidence: 0 };
  const sample = tokens.slice(0, 600);
  const scores = Object.entries(STOPSETS).map(([code, set]) => [code, sample.filter((t) => set.has(t)).length / sample.length] as const).sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  if (best[1] < 0.12 || best[1] < second[1] * 1.15) return { code: null, confidence: best[1] };
  return { code: best[0], confidence: Math.min(1, best[1] / 0.3) };
}

/**
 * Idioma efetivo. `configured` = lista em ordem de prioridade (idioma do artigo, do projeto...). O primeiro valor reconhecível vence; sem configuração,
 * detecta pelo texto. Um idioma configurado sem pacote mantém a etiqueta e fica com profile null ("sem fórmula").
 */
export function resolveLanguage(input: { configured?: unknown[]; text?: string }): ResolvedLanguage {
  for (const c of input.configured || []) {
    const p = parseLanguageTag(c);
    if (p) return { tag: p.tag, code: p.code, region: p.region, source: 'configurado', profile: LANGUAGES[p.code] || null, confidence: 1 };
  }
  const d = detectLanguage(input.text || '');
  if (d.code) return { tag: d.code, code: d.code, region: null, source: 'detectado', profile: LANGUAGES[d.code] || null, confidence: d.confidence };
  return { tag: 'und', code: 'und', region: null, source: 'desconhecido', profile: null, confidence: 0 };
}

// ---------- contagem de sílabas por idioma (aproximação) ----------

const VOWELS_ROMANCE = 'aeiouáéíóúâêîôûãõàèìòùüï';
const VOWELS_GERMANIC = 'aeiouyäöüéèëï';
export function countSyllables(word: string, code = 'pt'): number {
  const w = word.toLowerCase().replace(/[^\p{L}]/gu, '');
  if (!w) return 1;
  const vowels = code === 'en' ? 'aeiouy' : code === 'de' || code === 'nl' ? VOWELS_GERMANIC : VOWELS_ROMANCE;
  let count = 0; let prev = false;
  for (const ch of w) { const v = vowels.includes(ch); if (v && !prev) count++; prev = v; }
  if (code === 'en' && count > 1 && /[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w)) count--;
  if (code === 'en' && count > 1 && /[^aeiouy]es$|[^aeiouy]ed$/.test(w) && !/(?:[sxz]|ch|sh|[td])e[sd]$/.test(w)) count--;
  if (code === 'fr' && count > 1 && /[^aeiouyéèêàâîôûù]e$|[^aeiouyéèêàâîôûù]es$/.test(w)) count--;
  return Math.max(count, 1);
}

export function textStats(clean: string, code: string): TextStats & { sentenceTexts: string[] } {
  const wordsArr = clean.split(/\s+/).filter((w) => w.length > 0);
  const sentenceTexts = clean.split(/[.!?…]+/).filter((s) => s.trim().length > 0);
  return {
    words: wordsArr.length,
    sentences: Math.max(sentenceTexts.length, 1),
    syllables: wordsArr.reduce((t, w) => t + countSyllables(w, code), 0),
    letters: clean.replace(/[^\p{L}]/gu, '').length,
    sentenceTexts,
  };
}

/** Títulos estruturais (conclusão, FAQ, fontes, leia também...): nunca precisam ser pergunta e não entram na porcentagem de H2 em pergunta. */
export const STRUCTURAL_HEADING = /^(?:conclus|considera|refer[eê]nc|fontes?\b|sources?\b|references?\b|bibliograf|conclusion|conclusi[oó]n|conclusione|fazit|zusammenfassung|conclusie|faq\b|perguntas frequentes|frequently asked|preguntas frecuentes|questions fr|domande frequenti|h[aä]ufige|veelgestelde|leia tamb|read also|lee tamb|[àa] lire aussi|leggi anche|lesen sie auch|lees ook|quellen|fonti|bronnen)/i;

/** Início de H2 que conta como pergunta, no idioma (ou em qualquer idioma conhecido quando o idioma é desconhecido). */
export function isQuestionHeading(text: string, lang: LanguageProfile | null): boolean {
  const t = text.trim();
  if (/[?？]\s*$/.test(t) || t.startsWith('¿')) return true;
  const sources = lang ? [lang.questionStarters] : Object.values(LANGUAGES).map((l) => l.questionStarters);
  return sources.some((src) => new RegExp(`^(?:${src})(?![\\p{L}])`, 'iu').test(t));
}
