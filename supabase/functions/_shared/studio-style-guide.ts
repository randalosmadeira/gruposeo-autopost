/**
 * Guia de estilo anti-"IA" do Estúdio de Páginas, por idioma. É a fonte única de dois usos:
 *   1. o DETECTOR (studio-ai-detector.ts) procura estes tiques e reprova;
 *   2. o PROMPT de geração (studio-pipeline.ts) recebe as mesmas proibições e as exigências de especificidade.
 * Cobertura: pt, en e es completos; fr, it, de e nl só com os tiques mais comuns (o detector avisa que a cobertura é parcial); outro idioma = só as
 * verificações estruturais (ritmo, repetição, travessão). Padrões são heurísticos: orientam, não provam autoria.
 */
export interface Tic { code: string; label: string; re: string; fix: string; weight: number }
export interface StyleGuide {
  lang: string;
  coverage: 'completa' | 'parcial';
  /** tiques de frase (regex sem âncora, flags 'giu' aplicadas pelo detector) */
  tics: Tic[];
  /** aberturas genéricas de parágrafo (testadas no início do parágrafo) */
  openers: Tic[];
  /** fechos de resumo (testados no início dos últimos parágrafos) */
  closers: Tic[];
  /** títulos de FAQ de molde (a página inteira com só perguntas de molde = "FAQ padrão") */
  genericFaq: string[];
  /** frases do prompt: o que exigir no lugar */
  specificity: string;
  /** como o texto deve soar (voz humana de profissional da área) */
  voiceRules: string[];
}

const t = (code: string, label: string, re: string, fix: string, weight = 2): Tic => ({ code, label, re, fix, weight });

export const STYLE_GUIDES: Record<string, StyleGuide> = {
  pt: {
    lang: 'pt', coverage: 'completa',
    tics: [
      t('no_mundo_atual', 'Fórmula de contexto genérico ("no mundo atual")', 'no mundo (?:atual|de hoje|moderno)|nos dias (?:de hoje|atuais)|em um mundo cada vez mais|na era digital|no cen[aá]rio atual', 'Comece pelo fato concreto do caso, sem situar "o mundo".', 3),
      t('vale_destacar', 'Muleta de ênfase ("vale destacar")', 'vale (?:a pena )?(?:destacar|ressaltar|mencionar|lembrar|salientar)|[eé] (?:importante|fundamental|essencial|crucial) (?:destacar|ressaltar|salientar|lembrar|ter em mente)|cabe (?:destacar|ressaltar)', 'Diga o fato direto; se importa, o leitor percebe.', 3),
      t('nao_apenas', 'Estrutura "não é apenas X, é Y"', 'n[aã]o (?:[eé]|se trata de) (?:apenas|somente|s[oó]) [^.]{1,80}, (?:mas|[eé]|e sim)', 'Afirme direto o que é.', 3),
      t('mergulhar', 'Verbo de blog genérico ("mergulhar", "desvendar")', '(?:vamos|iremos|v[aá]) (?:mergulhar|desvendar|explorar|descobrir juntos)|desvend(?:ar|ando|e) (?:os )?segredos?|jornada (?:de|para)', 'Troque por o que o leitor vai encontrar, em palavras simples.', 2),
      t('adjetivo_vazio', 'Adjetivo de folheto (robusto, abrangente, inovador...)', '\\b(?:robust[oa]s?|abrangentes?|inovador(?:a|es|as)?|revolucion[aá]ri[oa]s?|hol[ií]stic[oa]s?|din[aâ]mic[oa]s?|impec[aá]ve(?:l|is)|de excel[eê]ncia|de ponta|sinergia|alavancar|potencializar)\\b', 'Mostre a característica (prazo, documento, número), não o elogio.', 2),
      t('conectivo_de_ia', 'Conectivo de redação automática', '(?:^|[.!?] )(?:ademais|outrossim|destarte|ainda assim, vale)\\b|\\bem [uú]ltima an[aá]lise\\b|\\bem suma\\b|\\bem s[ií]ntese\\b', 'Corte o conectivo ou use "e", "mas", "porque".', 1),
      t('pergunta_retorica', 'Pergunta retórica de abertura ("você já se perguntou")', 'voc[eê] j[aá] (?:se )?(?:perguntou|parou para pensar|imaginou)|ser[aá] que (?:voc[eê]|j[aá])|imagine (?:que )?voc[eê]', 'Abra com a situação real da pessoa, em afirmação.', 3),
      t('garantia_vazia', 'Promessa genérica ("solução completa", "tudo o que você precisa")', 'solu[cç][aã]o completa|tudo (?:o )?que voc[eê] precisa|o melhor (?:servi[cç]o|atendimento)|atendimento (?:personalizado|humanizado|diferenciado)|compromisso com a excel[eê]ncia', 'Diga o que se faz, em que prazo e com qual documento.', 2),
      t('enchimento', 'Enchimento ("diversos fatores", "uma série de")', 'diversos fatores|uma s[eé]rie de|in[uú]meros (?:aspectos|fatores)|uma vasta gama|desempenha um papel (?:fundamental|crucial|importante)', 'Liste os fatores reais pelo nome.', 2),
    ],
    openers: [
      t('abre_neste_artigo', 'Abertura "neste artigo/página vamos"', '^(?:neste|nesta|no presente) (?:artigo|texto|guia|p[aá]gina|conte[uú]do)[^.]{0,40}(?:vamos|veremos|iremos|abordar|falar)', 'Abra com a resposta ao que a pessoa procurou.', 3),
      t('abre_generico', 'Abertura genérica ("hoje em dia", "cada vez mais")', '^(?:hoje em dia|atualmente|cada vez mais|com o avan[cç]o|com a evolu[cç][aã]o|[eé] cada vez mais comum)', 'Abra com o caso, o órgão ou o prazo concretos.', 3),
    ],
    closers: [
      t('fecha_resumo', 'Fecho de resumo ("em resumo", "em conclusão")', '^(?:em resumo|em conclus[aã]o|concluindo|para concluir|em suma|por fim, (?:podemos|[eé] poss[ií]vel)|portanto, (?:podemos|conclui-se))', 'Termine com o próximo passo prático (o que fazer, com que documento, até quando).', 3),
    ],
    genericFaq: ['o que [eé]', 'como funciona', 'quanto custa', 'qual [eé] o prazo', 'quais s[aã]o os benef[ií]cios', 'por que (?:escolher|contratar)', 'vale a pena'],
    specificity: 'Cite órgãos, locais, prazos, documentos e números REAIS que constem dos dados fornecidos, com a fonte. Se o dado não foi fornecido, escreva [PENDENTE: o que falta] em vez de preencher.',
    voiceRules: ['Frases de tamanhos diferentes: misture curtas (5 a 9 palavras) e longas (20 a 30).', 'Parágrafos de tamanhos diferentes; sem simetria artificial.', 'Primeira pessoa do plural da equipe só quando o Perfil permitir.', 'No máximo um travessão por página.', 'Sem listas de três adjetivos.', 'Sem "Perguntas frequentes" de molde: só perguntas que o público faz de verdade.'],
  },
  en: {
    lang: 'en', coverage: 'completa',
    tics: [
      t('in_todays_world', 'Generic context formula ("in today\'s world")', "in (?:today['’]s|the modern|this digital) (?:[\\w-]+ ){0,2}(?:world|age|landscape|era)|in an (?:increasingly|ever-)\\w+ world|in the (?:ever-evolving|fast-paced) (?:world|landscape)", 'Start with the concrete fact of the case.', 3),
      t('worth_noting', 'Emphasis crutch ("it is worth noting")', "it(?:['’]s| is) (?:worth|important|crucial|essential) (?:noting|to note|to mention|to remember|to understand)|(?:worth|important to) (?:highlight|mention)|needless to say", 'State the fact directly.', 3),
      t('not_just', 'Pattern "it\'s not just X, it\'s Y"', "(?:it|this|that)(?:['’]s| is) not (?:just|only|merely) [^.]{1,80}, (?:it|but)", 'Say what it is, plainly.', 3),
      t('dive_in', 'Blog verb ("dive in", "unlock", "delve")', "let['’]s (?:dive|delve|explore|unpack)|(?:dive|delve) (?:deep|into)|unlock(?:ing)? the (?:power|secrets?|potential)|navigate the complexities|embark on", 'Say what the reader will find, in plain words.', 3),
      t('buzz_adjectives', 'Brochure adjectives (robust, seamless, holistic...)', '\\b(?:robust|seamless(?:ly)?|holistic|cutting-edge|state-of-the-art|game-chang(?:er|ing)|tailored|comprehensive|streamlin(?:e|ed|ing)|leverag(?:e|ing)|synerg(?:y|ies)|world-class)\\b', 'Show the property (deadline, document, number), not the praise.', 2),
      t('rhetorical_opener', 'Rhetorical opener ("have you ever wondered")', 'have you ever (?:wondered|thought|asked yourself)|imagine (?:this|a world|that you)', 'Open with the person\'s real situation.', 3),
      t('empty_promise', 'Empty promise ("one-stop solution", "everything you need")', 'one-stop (?:shop|solution)|everything you need|the best (?:service|solution)|commitment to excellence|personalized (?:service|approach)', 'Say what is done, how fast, with which document.', 2),
      t('filler', 'Filler ("a variety of factors", "plays a crucial role")', 'a (?:variety|number|range|host) of (?:factors|aspects)|plays a (?:crucial|vital|key|pivotal) role|myriad of|a wide range of', 'Name the actual factors.', 2),
    ],
    openers: [
      t('opens_this_article', 'Opener "in this article we will"', '^(?:in|throughout) this (?:article|guide|post|page)[^.]{0,40}(?:we will|we\'ll|you will|you\'ll|i will)', 'Open with the answer to what the person searched.', 3),
      t('opens_generic', 'Generic opener ("nowadays", "more and more")', '^(?:nowadays|these days|more and more|with the (?:rise|advent|growth) of)', 'Open with the concrete case, agency or deadline.', 3),
    ],
    closers: [t('closes_summary', 'Summary closer ("in conclusion")', '^(?:in (?:conclusion|summary)|to (?:sum up|conclude|summarize)|all in all|ultimately,)', 'End with the practical next step (what to do, which document, by when).', 3)],
    genericFaq: ['what is', 'how does', 'how much (?:does|is)', 'what are the benefits', 'why (?:choose|hire)', 'is it worth'],
    specificity: 'Cite real agencies, places, deadlines, documents and numbers that appear in the supplied data, with the source. If a fact was not supplied, write [PENDING: what is missing] instead of filling in.',
    voiceRules: ['Mix sentence lengths: short (5-9 words) and long (20-30).', 'Vary paragraph size; no artificial symmetry.', 'At most one em dash per page.', 'No lists of three adjectives.', 'No template FAQ: only questions people actually ask.'],
  },
  es: {
    lang: 'es', coverage: 'completa',
    tics: [
      t('en_el_mundo_actual', 'Fórmula de contexto genérico ("en el mundo actual")', 'en el mundo (?:actual|de hoy|moderno)|en la actualidad|hoy en d[ií]a|en la era digital|en un mundo cada vez m[aá]s', 'Empiece por el hecho concreto del caso.', 3),
      t('cabe_destacar', 'Muletilla de énfasis ("cabe destacar")', 'cabe (?:destacar|mencionar|se[ñn]alar|resaltar)|vale la pena (?:destacar|mencionar)|es (?:importante|fundamental|esencial|crucial) (?:destacar|se[ñn]alar|resaltar|recordar)', 'Diga el hecho directamente.', 3),
      t('no_solo', 'Estructura "no es solo X, sino Y"', 'no (?:es|se trata de) (?:solo|solamente|s[oó]lo|[uú]nicamente) [^.]{1,80}, (?:sino|es)', 'Afirme directamente qué es.', 3),
      t('sumergirse', 'Verbo de blog genérico ("sumergirse", "desvelar")', '(?:vamos a|v[aá]monos a) (?:sumergirnos|explorar|descubrir)|sum[eé]rgete|desvel(?:ar|ando) (?:los )?secretos', 'Diga qué encontrará la persona, en palabras simples.', 2),
      t('adjetivo_vacio', 'Adjetivo de folleto (robusto, integral, innovador...)', '\\b(?:robust[oa]s?|integral(?:es)?|innovador(?:a|es|as)?|revolucionari[oa]s?|hol[ií]stic[oa]s?|de vanguardia|de excelencia|sinergia|potenciar|apalancar)\\b', 'Muestre la característica (plazo, documento, cifra), no el elogio.', 2),
      t('pregunta_retorica', 'Pregunta retórica de apertura ("¿te has preguntado?")', '[¿]?(?:alguna vez )?(?:te|se) has? (?:preguntado|puesto a pensar)|imagina que', 'Abra con la situación real de la persona.', 3),
      t('promesa_vacia', 'Promesa genérica ("solución integral")', 'soluci[oó]n integral|todo lo que necesitas|el mejor (?:servicio|trato)|atenci[oó]n personalizada|compromiso con la excelencia', 'Diga qué se hace, en qué plazo y con qué documento.', 2),
      t('relleno', 'Relleno ("diversos factores", "una serie de")', 'diversos factores|una serie de|innumerables (?:aspectos|factores)|juega un papel (?:fundamental|crucial|importante)|una amplia gama', 'Nombre los factores reales.', 2),
    ],
    openers: [
      t('abre_en_este_articulo', 'Apertura "en este artículo vamos a"', '^(?:en|a lo largo de) (?:este|esta) (?:art[ií]culo|gu[ií]a|p[aá]gina|texto)[^.]{0,40}(?:vamos|veremos|abordaremos)', 'Abra con la respuesta a lo que la persona buscó.', 3),
      t('abre_generico', 'Apertura genérica ("cada vez más")', '^(?:cada vez m[aá]s|con el avance|con la evoluci[oó]n|actualmente)', 'Abra con el caso, el organismo o el plazo concretos.', 3),
    ],
    closers: [t('cierra_resumen', 'Cierre de resumen ("en conclusión")', '^(?:en (?:conclusi[oó]n|resumen|resumidas cuentas)|para concluir|concluyendo|en definitiva)', 'Termine con el siguiente paso práctico.', 3)],
    genericFaq: ['qu[eé] es', 'c[oó]mo funciona', 'cu[aá]nto cuesta', 'cu[aá]les son los beneficios', 'por qu[eé] (?:elegir|contratar)', 'vale la pena'],
    specificity: 'Cite organismos, lugares, plazos, documentos y cifras REALES que consten en los datos entregados, con la fuente. Si el dato no se entregó, escriba [PENDIENTE: qué falta] en lugar de rellenar.',
    voiceRules: ['Mezcle frases cortas (5 a 9 palabras) y largas (20 a 30).', 'Párrafos de tamaños distintos.', 'Como máximo una raya por página.', 'Sin listas de tres adjetivos.', 'Sin FAQ de molde.'],
  },
  fr: {
    lang: 'fr', coverage: 'parcial',
    tics: [
      t('dans_le_monde', 'Formule de contexte générique ("dans le monde d\'aujourd\'hui")', "dans le monde d['’]aujourd['’]hui|de nos jours|à l['’]ère du numérique|dans un monde de plus en plus", 'Commencez par le fait concret.', 3),
      t('il_est_important', 'Béquille d\'emphase', "il (?:est|convient) (?:important|essentiel|crucial) de (?:noter|souligner|rappeler)|force est de constater", 'Dites le fait directement.', 3),
      t('pas_seulement', 'Structure "ce n\'est pas seulement X, c\'est Y"', "ce n['’]est pas (?:seulement|simplement|uniquement) [^.]{1,80}, (?:c['’]est|mais)", 'Affirmez directement.', 3),
      t('adjectifs_brochure', 'Adjectifs de brochure', '\\b(?:robuste|holistique|innovant|révolutionnaire|sur mesure|d[\'’]exception)\\b', 'Montrez la propriété, pas l\'éloge.', 2),
    ],
    openers: [t('ouverture_generique', 'Ouverture générique', '^(?:de plus en plus|aujourd[\'’]hui|avec l[\'’]essor)', 'Ouvrez par le cas concret.', 3)],
    closers: [t('conclusion_resume', 'Clôture de résumé', '^(?:en (?:conclusion|résumé|somme)|pour conclure)', 'Terminez par l\'étape pratique suivante.', 3)],
    genericFaq: ["qu['’]est-ce que", 'comment fonctionne', 'combien coûte', 'quels sont les avantages'],
    specificity: 'Citez des organismes, lieux, délais, documents et chiffres RÉELS fournis, avec la source. Sinon écrivez [À COMPLÉTER : ce qui manque].',
    voiceRules: ['Alternez phrases courtes et longues.', 'Pas de liste de trois adjectifs.'],
  },
  it: {
    lang: 'it', coverage: 'parcial',
    tics: [
      t('nel_mondo', 'Formula di contesto generica', 'nel mondo (?:di oggi|attuale|moderno)|al giorno d[\'’]oggi|nell[\'’]era digitale|in un mondo sempre più', 'Parta dal fatto concreto.', 3),
      t('e_importante', 'Stampella di enfasi', 'è (?:importante|fondamentale|essenziale) (?:notare|sottolineare|ricordare)|vale la pena (?:notare|sottolineare)', 'Dica il fatto direttamente.', 3),
      t('non_solo', 'Struttura "non è solo X, è Y"', 'non è (?:solo|soltanto|solamente) [^.]{1,80}, (?:è|ma)', 'Affermi direttamente.', 3),
    ],
    openers: [t('apertura_generica', 'Apertura generica', '^(?:sempre più|oggi|con l[\'’]avvento)', 'Apra con il caso concreto.', 3)],
    closers: [t('chiusura_riassunto', 'Chiusura di riepilogo', '^(?:in (?:conclusione|sintesi|sostanza)|per concludere)', 'Chiuda con il passo pratico.', 3)],
    genericFaq: ['che cos[\'’]è', 'come funziona', 'quanto costa', 'quali sono i vantaggi'],
    specificity: 'Citi enti, luoghi, scadenze, documenti e cifre REALI forniti, con la fonte. Altrimenti scriva [DA COMPLETARE: cosa manca].',
    voiceRules: ['Alterni frasi brevi e lunghe.'],
  },
  de: {
    lang: 'de', coverage: 'parcial',
    tics: [
      t('in_der_heutigen', 'Generische Kontextformel', 'in der heutigen (?:welt|zeit)|heutzutage|im digitalen zeitalter|in einer zunehmend', 'Beginnen Sie mit dem konkreten Fall.', 3),
      t('es_ist_wichtig', 'Betonungskrücke', 'es ist (?:wichtig|entscheidend|wesentlich) zu (?:beachten|betonen|erwähnen)|erwähnenswert ist', 'Nennen Sie die Tatsache direkt.', 3),
      t('nicht_nur', 'Muster "nicht nur X, sondern Y"', 'nicht nur [^.]{1,80}, sondern (?:auch )?', 'Sagen Sie direkt, was es ist.', 2),
    ],
    openers: [t('einstieg_generisch', 'Generischer Einstieg', '^(?:heutzutage|immer mehr|mit dem aufkommen)', 'Beginnen Sie mit dem konkreten Fall.', 3)],
    closers: [t('fazit_zusammenfassung', 'Zusammenfassender Schluss', '^(?:zusammenfassend|abschließend|fazit)', 'Enden Sie mit dem nächsten praktischen Schritt.', 3)],
    genericFaq: ['was ist', 'wie funktioniert', 'was kostet', 'welche vorteile'],
    specificity: 'Nennen Sie echte Behörden, Orte, Fristen, Dokumente und Zahlen aus den gelieferten Daten, mit Quelle. Sonst [OFFEN: was fehlt].',
    voiceRules: ['Wechseln Sie kurze und lange Sätze.'],
  },
  nl: {
    lang: 'nl', coverage: 'parcial',
    tics: [
      t('in_de_wereld', 'Generieke contextformule', 'in de wereld van (?:vandaag|nu)|tegenwoordig|in het digitale tijdperk|in een steeds', 'Begin met het concrete geval.', 3),
      t('het_is_belangrijk', 'Nadrukkruk', 'het is (?:belangrijk|essentieel|cruciaal) om (?:op te merken|te benadrukken|te vermelden)|het is de moeite waard', 'Noem het feit direct.', 3),
      t('niet_alleen', 'Patroon "niet alleen X, maar Y"', 'niet (?:alleen|slechts) [^.]{1,80}, maar (?:ook )?', 'Zeg direct wat het is.', 2),
    ],
    openers: [t('opening_generiek', 'Generieke opening', '^(?:tegenwoordig|steeds meer|met de opkomst van)', 'Begin met het concrete geval.', 3)],
    closers: [t('slot_samenvatting', 'Samenvattende slotzin', '^(?:kortom|samenvattend|tot slot|concluderend)', 'Eindig met de volgende praktische stap.', 3)],
    genericFaq: ['wat is', 'hoe werkt', 'wat kost', 'wat zijn de voordelen'],
    specificity: 'Noem echte instanties, plaatsen, termijnen, documenten en cijfers uit de aangeleverde gegevens, met bron. Anders [OPEN: wat ontbreekt].',
    voiceRules: ['Wissel korte en lange zinnen af.'],
  },
};

/** Guia do idioma; sem pacote devolve null (o detector roda só as verificações estruturais). */
export const styleGuideFor = (code: string | null | undefined): StyleGuide | null => STYLE_GUIDES[String(code || '').slice(0, 2).toLowerCase()] || null;

/** Bloco de instruções para o prompt de geração: as mesmas proibições do detector, em frase. */
export function styleInstructions(code: string, voice?: { tones?: string[]; voice?: string | null; never?: string | null }): string {
  const g = styleGuideFor(code);
  const lines: string[] = [];
  if (g) {
    lines.push(`STYLE (${g.lang}): never use these patterns: ${[...g.tics, ...g.openers, ...g.closers].map((x) => x.label).join('; ')}.`);
    lines.push(g.specificity);
    lines.push(...g.voiceRules);
  } else lines.push('Write like a specialist who has handled the case: concrete, varied sentence length, no filler, no generic praise, no summary closer, at most one em dash.');
  if (voice?.tones?.length) lines.push(`Client voice: ${voice.tones.join(', ')}.`);
  if (voice?.voice) lines.push(`Client positioning notes: ${String(voice.voice).slice(0, 400)}`);
  if (voice?.never) lines.push(`NEVER say: ${String(voice.never).slice(0, 400)}`);
  lines.push('NEVER invent facts, addresses, phone numbers, testimonials, statistics, results or sources. Anything not in the supplied data becomes a [PENDING: ...] marker.');
  return lines.join('\n');
}
