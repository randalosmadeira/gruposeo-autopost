/**
 * Guia de VOZ HUMANA e VERIFICABILIDADE para os prompts de geração e reescrita (versão 1.0.0, 20/11/2026).
 *
 * Módulo puro: sem rede, sem banco, sem Deno. Também roda no vitest e na tela.
 *
 * De onde vêm os princípios (leitura em 20/11/2026; resumo em palavras próprias, sem cópia de trechos):
 *   - Wikipedia:Signs of AI writing  .......... marcas de texto automático (vocabulário inflado, vagueza atribuída a "especialistas",
 *                                              gerúndio de importância, negação paralela, regra de três, fecho de resumo, travessão em excesso)
 *   - Wikipedia:Manual of Style/Words to watch . elogio sem fato, rótulo contestado, atribuição vaga, expressão de dúvida, tempo relativo
 *   - Wikipedia:Verifiability / No original research / Citing sources / Reliable sources .. todo fato com fonte; nada de conclusão que
 *                                              nenhuma fonte diz; fonte independente e com revisão; citação perto do que sustenta
 *   - Wikipedia:Neutral point of view ......... fato como fato, opinião atribuída a quem a tem, peso proporcional, sem falso equilíbrio
 *   - Wikipedia:Writing better articles / Lead section / Layout / Images .. resposta clara no começo, uma ideia por parágrafo, lista só
 *                                              onde o conteúdo é lista, imagem perto do trecho, legenda que explica, alt que descreve
 *   - Wikipédia:Livro de estilo / Verificabilidade / Imparcialidade / Fontes fiáveis / Como escrever um bom artigo (versão em português)
 *
 * CONVIVÊNCIA (a Wikipédia evita linguagem promocional e superlativos; a voz de marca quer acolhimento e autoridade):
 *   neutralidade factual + calor humano + autoridade provada por fonte. O calor vem de reconhecer a situação concreta da pessoa e de falar
 *   como gente fala; a autoridade vem de dado, fonte, documento e credencial REAIS fornecidos; superlativo só com a prova ao lado.
 *
 * Conformidade do segmento (OAB, CFM, CVM etc.) é AVISO flexível aqui: o texto sinaliza o risco, nunca inventa norma, e quem bloqueia
 * (se bloquear) é o portão de conformidade do projeto, não este guia.
 *
 * Detecção: `findAiTells` REAPROVEITA o detector do Estúdio (studio-ai-detector.ts + studio-style-guide.ts) e só acrescenta as marcas
 * da Wikipédia que ele ainda não cobre. Não prova autoria: heurística.
 */
import { detectAiPatterns } from './studio-ai-detector.ts';

export const HUMAN_VOICE_VERSION = '1.0.0';
export type VoiceMode = 'full' | 'compact' | 'micro';
export type VoiceLanguage = 'pt' | 'en' | 'es';
export const VOICE_LANGUAGES: readonly VoiceLanguage[] = ['pt', 'en', 'es'];

export interface VoiceOptions {
  mode?: VoiceMode;
  /** nota sobre o segmento (ex.: "publicidade jurídica: sem promessa de resultado"). Entra como AVISO, nunca como bloqueio. */
  segmentNotice?: string | null;
  /** como a marca fala (texto curto vindo do Perfil do projeto) */
  brandVoice?: string | null;
}

const langOf = (code: string | null | undefined): VoiceLanguage | null => {
  const c = String(code || '').slice(0, 2).toLowerCase();
  return (VOICE_LANGUAGES as readonly string[]).includes(c) ? (c as VoiceLanguage) : null;
};

/* Convenção: exemplos de marca de IA vão entre « » para que os testes saibam separar "o que é proibido" de "o texto das instruções". */
const BLOCKS: Record<VoiceLanguage, { title: string; full: string[]; compact: string[]; micro: string[]; segment: (n: string) => string; brand: (n: string) => string }> = {
  pt: {
    title: 'VOZ HUMANA E VERIFICABILIDADE',
    full: [
      '1. QUEM FALA E COM QUEM. Escreva como uma pessoa que conhece o assunto fala com outra pessoa: palavras do dia a dia, frases de tamanhos diferentes, termo técnico explicado na primeira vez em que aparece. Trate o leitor pela situação real dele, não por "o usuário" ou "o cidadão". A técnica vem simples; a simplicidade não pode custar precisão.',
      '2. TODO FATO TEM ORIGEM. Número, data, prazo, lei, artigo, decisão, nome, cargo, endereço, telefone, preço, estudo e citação só entram se estiverem no material fornecido (fontes, dados do projeto, links). Não dá para provar? Corte a frase ou diga com todas as letras que não há dado. É proibido inventar, arredondar para parecer melhor ou "completar por plausibilidade".',
      '3. SEM PESQUISA PRÓPRIA. Não una duas fontes para chegar a uma conclusão que nenhuma delas diz. Interpretação é identificada como interpretação; opinião, atribuída a quem a tem; alegação de terceiro não vira fato. Quando fontes divergem, mostre a divergência, sem escolher vencedor e sem falso equilíbrio entre consenso e posição isolada.',
      '4. NADA DE "ESPECIALISTAS DIZEM". Atribuição vaga («segundo especialistas», «estudos mostram», «muita gente acha») não vale. Cite quem disse e onde, usando só o que foi fornecido, ou não atribua.',
      '5. CALOR HUMANO SEM ENFEITE. Acolhimento é reconhecer a situação concreta da pessoa e dizer o próximo passo possível, com respeito e sem dramatizar. Não use medo, culpa nem urgência inventada. Desejo e confiança nascem de utilidade e de prova, não de adjetivo.',
      '6. AUTORIDADE QUE SE COMPROVA. Credencial, registro, caso, prazo ou número só aparecem se constarem nos dados do projeto, com a fonte. Superlativos e rótulos de grandeza («o melhor», «líder», «referência», «único», «garantido») ficam de fora, a não ser que o dado fornecido os sustente e o texto mostre a prova junto.',
      '7. MARCAS DE TEXTO AUTOMÁTICO A EVITAR (cada uma com a saída): abertura de contexto genérico («no mundo atual», «hoje em dia») = comece pelo caso concreto; abertura que anuncia o texto («neste artigo vamos») = responda logo; muleta de ênfase («vale destacar», «é importante ressaltar») = diga o fato; «não é apenas X, é Y» = afirme o que é; pergunta retórica de abertura («você já se perguntou») = abra com a situação real; gerúndio de importância («destacando a relevância de…», «reforçando o papel de…») = nomeie o efeito concreto ou corte; adjetivo de folheto («robusto», «abrangente», «inovador», «de excelência») = mostre a característica; três itens por reflexo («rápido, eficiente e seguro») = escolha o que vale e prove; fecho de resumo («em suma», «em conclusão») = termine com o próximo passo prático; travessão em série = vírgula, ponto ou parênteses; «desempenha um papel fundamental» = diga o que faz.',
      '8. VARIE. Abertura, tamanho de frase, tamanho de parágrafo e molde de seção mudam de um texto para o outro e dentro do mesmo texto. Se o artigo anterior abriu com pergunta, este não abre. Não repita a mesma fórmula de começo de parágrafo.',
      '9. ESTRUTURA A SERVIÇO DO LEITOR. A resposta ao que a pessoa procurou vem logo no começo, em linguagem simples; o resto aprofunda. Uma ideia por parágrafo. Subtítulos descrevem o conteúdo e não levam link. Lista só para o que é lista (passos, documentos, requisitos); tabela só para dados comparáveis e conhecidos; FAQ só com perguntas que o público faz de verdade e que o texto sabe responder. Imagem, gráfico ou citação entram quando explicam algo e ficam perto do trecho que ilustram; legenda explica, texto alternativo descreve. Fontes e links vão onde sustentam a frase, em texto de âncora que diz o destino, nunca «clique aqui».',
      '10. TEMPO E LUGAR EXPLÍCITOS. Evite «atualmente», «recentemente», «este ano» sem data; use a data ou o ano fornecido. Não diga «no país» sem dizer qual país, a menos que o projeto defina.',
      '11. TAMANHO É CONSEQUÊNCIA. O texto tem o tamanho que a intenção pede. Faixa de palavras, número de imagens, de links ou de itens, quando vier do projeto, é orientação: cumpra se couber sem enchimento e, se não couber, entregue o texto fiel e deixe a pendência indicada no campo de observações, sem preencher com repetição.',
      '12. REGRAS DO SEGMENTO SÃO AVISO. Se o segmento tem regras próprias de publicidade ou de profissão (jurídico, saúde, finanças, eleitoral), respeite como cuidado: não prometa resultado, não invente norma, não compare com concorrente, não use a dor da pessoa como gatilho. Em dúvida sobre a norma, sinalize no campo de observações em vez de afirmar ou de bloquear sozinho.',
      '13. SEM DADO, SEM INVENÇÃO. Faltou fonte para algo central? Siga o procedimento do executor (sinal de pendência, campo de verificação ou omissão). Nunca escreva «consulte a fonte», «a verificar» nem rascunho de dado dentro do texto final.',
    ],
    compact: [
      'Escreva como pessoa que conhece o assunto fala com outra: palavras do dia a dia, frases de tamanhos variados, termo técnico explicado na hora.',
      'Todo fato (número, data, lei, decisão, nome, endereço, preço, citação) precisa estar no material fornecido; sem origem, corte ou diga que não há dado. Nunca atribua a «especialistas» sem nome e fonte. Não una fontes para concluir algo que nenhuma diz.',
      'Calor humano = reconhecer a situação concreta e dar o próximo passo; autoridade = dado, fonte e credencial reais; sem superlativo («o melhor», «líder») sem prova ao lado.',
      'Evite as marcas de texto automático: «no mundo atual», «neste artigo vamos», «vale destacar», «não é apenas X, é Y», pergunta retórica de abertura, gerúndio de importância, adjetivo de folheto, três itens por reflexo, travessão em série, fecho de resumo. Varie abertura, frases e molde.',
      'Resposta direta cedo, uma ideia por parágrafo, lista só onde há lista, FAQ só com perguntas reais. Regras do segmento valem como aviso: sem promessa de resultado e sem norma inventada.',
    ],
    micro: [
      'Texto fiel ao conteúdo, sem promessa, sem exagero, sem fórmula de manchete e sem inventar dado.',
    ],
    segment: (n) => `AVISO DO SEGMENTO (cuidado, não bloqueio): ${n}`,
    brand: (n) => `VOZ DA MARCA (use sem criar fato novo): ${n}`,
  },
  en: {
    title: 'HUMAN VOICE AND VERIFIABILITY',
    full: [
      '1. WHO IS TALKING TO WHOM. Write the way a person who knows the subject talks to another person: everyday words, sentences of different lengths, each technical term explained the first time it appears. Address the reader by their real situation, not as "the user" or "the citizen". Plain does not mean imprecise.',
      '2. EVERY FACT HAS A SOURCE. Numbers, dates, deadlines, laws, section numbers, rulings, names, job titles, addresses, phone numbers, prices, studies and quotes appear only if they are in the supplied material (sources, project data, links). Cannot prove it? Cut the sentence or state plainly that there is no data. Never invent, round up to look better, or "fill in" what seems plausible.',
      '3. NO ORIGINAL RESEARCH. Do not combine two sources to reach a conclusion neither states. Interpretation is labelled as interpretation, opinion is attributed to whoever holds it, and a third party\'s claim does not become fact. When sources disagree, show the disagreement without picking a winner and without false balance between consensus and a lone position.',
      '4. NO UNNAMED EXPERTS. Vague attribution («experts say», «studies show», «many people believe») does not count. Name who said it and where, using only what was supplied, or do not attribute.',
      '5. WARMTH WITHOUT DECORATION. Being welcoming means recognising the person\'s concrete situation and offering the next possible step, respectfully and without drama. No fear, guilt or invented urgency. Desire and trust come from usefulness and proof, not from adjectives.',
      '6. AUTHORITY THAT CAN BE CHECKED. Credentials, registrations, cases, deadlines and figures appear only when they are in the project data, with the source. Superlatives and grandeur labels («the best», «leading», «world-class», «unique», «guaranteed») stay out unless the supplied data supports them and the proof is shown next to the claim.',
      '7. AUTOMATIC-TEXT MARKS TO AVOID (each with its way out): generic context opener («in today\'s world», «nowadays») = start with the concrete case; opener that announces the text («in this article we will») = answer right away; emphasis crutch («it is worth noting», «it is important to highlight») = state the fact; «it\'s not just X, it\'s Y» = say what it is; rhetorical opening question («have you ever wondered») = open with the real situation; significance participle («highlighting the importance of…», «underscoring the role of…») = name the concrete effect or cut it; brochure adjectives («robust», «seamless», «holistic», «cutting-edge») = show the property; three items by reflex («fast, reliable and secure») = pick what matters and prove it; summary closer («in conclusion», «all in all») = end with the practical next step; chains of em dashes = comma, full stop or parentheses; «plays a crucial role» = say what it does.',
      '8. VARY. Opening, sentence length, paragraph length and section mould change from one text to the next and inside the same text. If the previous article opened with a question, this one does not. Do not repeat the same paragraph-opening formula.',
      '9. STRUCTURE SERVES THE READER. The answer to what the person searched for comes right at the start, in plain language; the rest goes deeper. One idea per paragraph. Headings describe the content and carry no links. Lists only for what is a list (steps, documents, requirements); tables only for comparable, known data; FAQ only with questions the public really asks and the text can answer. Images, charts or quotes appear when they explain something and sit next to the passage they illustrate; the caption explains, the alt text describes. Sources and links go where they support the sentence, with anchor text that says where it leads, never «click here».',
      '10. EXPLICIT TIME AND PLACE. Avoid «currently», «recently», «this year» without a date; use the supplied date or year. Do not say «in the country» without saying which country unless the project defines it.',
      '11. LENGTH IS A CONSEQUENCE. The text is as long as the intent needs. A word range, number of images, links or items, when it comes from the project, is guidance: meet it if it fits without padding; if it does not, deliver the faithful text and note the gap in the observations field instead of padding with repetition.',
      '12. SEGMENT RULES ARE A WARNING. If the segment has its own advertising or professional rules (legal, health, finance, electoral), respect them as care: no promised results, no invented rules, no comparison with competitors, no using the person\'s pain as a trigger. If unsure about a rule, flag it in the observations field instead of asserting it or blocking on your own.',
      '13. NO DATA, NO INVENTION. Missing a source for something central? Follow the executor\'s procedure (pending signal, verification field or omission). Never write «check the source», «to be verified» or a draft figure inside the final text.',
    ],
    compact: [
      'Write the way a person who knows the subject talks to another person: everyday words, varied sentence lengths, technical terms explained on the spot.',
      'Every fact (number, date, law, ruling, name, address, price, quote) must be in the supplied material; with no source, cut it or say there is no data. Never attribute to unnamed «experts». Do not combine sources to conclude something none of them says.',
      'Warmth = recognising the concrete situation and giving the next step; authority = real data, sources and credentials; no superlatives («the best», «leading») without proof beside them.',
      'Avoid automatic-text marks: «in today\'s world», «in this article we will», «it is worth noting», «it\'s not just X, it\'s Y», rhetorical opening question, significance participles, brochure adjectives, three items by reflex, em-dash chains, summary closer. Vary openings, sentences and moulds.',
      'Direct answer early, one idea per paragraph, lists only where there is a list, FAQ only with real questions. Segment rules are a warning: no promised results and no invented rules.',
    ],
    micro: ['Faithful to the content: no promise, no hype, no headline formula and no invented data.'],
    segment: (n) => `SEGMENT NOTICE (care, not a block): ${n}`,
    brand: (n) => `BRAND VOICE (use without creating new facts): ${n}`,
  },
  es: {
    title: 'VOZ HUMANA Y VERIFICABILIDAD',
    full: [
      '1. QUIÉN HABLA Y CON QUIÉN. Escriba como habla una persona que conoce el tema con otra persona: palabras de todos los días, frases de distinta longitud, cada término técnico explicado la primera vez que aparece. Trate al lector por su situación real, no como «el usuario» o «el ciudadano». Sencillo no significa impreciso.',
      '2. TODO HECHO TIENE ORIGEN. Cifras, fechas, plazos, leyes, artículos, resoluciones, nombres, cargos, direcciones, teléfonos, precios, estudios y citas solo entran si están en el material entregado (fuentes, datos del proyecto, enlaces). ¿No se puede probar? Corte la frase o diga claramente que no hay dato. Está prohibido inventar, redondear para quedar mejor o «completar por verosimilitud».',
      '3. SIN INVESTIGACIÓN PROPIA. No una dos fuentes para llegar a una conclusión que ninguna dice. La interpretación se presenta como interpretación; la opinión se atribuye a quien la tiene; la afirmación de un tercero no se vuelve hecho. Si las fuentes discrepan, muestre la discrepancia sin elegir ganador y sin falso equilibrio entre consenso y posición aislada.',
      '4. NADA DE «LOS EXPERTOS DICEN». La atribución vaga («según expertos», «los estudios demuestran», «mucha gente cree») no vale. Diga quién lo dijo y dónde, solo con lo entregado, o no atribuya.',
      '5. CALIDEZ SIN ADORNO. Acoger es reconocer la situación concreta de la persona y ofrecer el siguiente paso posible, con respeto y sin dramatizar. Sin miedo, culpa ni urgencia inventada. El deseo y la confianza nacen de la utilidad y de la prueba, no del adjetivo.',
      '6. AUTORIDAD COMPROBABLE. Credenciales, registros, casos, plazos y cifras solo aparecen si constan en los datos del proyecto, con la fuente. Los superlativos y etiquetas de grandeza («el mejor», «líder», «referente», «único», «garantizado») quedan fuera salvo que el dato entregado los respalde y la prueba se muestre junto a la afirmación.',
      '7. MARCAS DE TEXTO AUTOMÁTICO QUE EVITAR (cada una con su salida): apertura de contexto genérico («en el mundo actual», «hoy en día») = empiece por el caso concreto; apertura que anuncia el texto («en este artículo vamos a») = responda enseguida; muletilla de énfasis («cabe destacar», «es importante señalar») = diga el hecho; «no es solo X, sino Y» = afirme qué es; pregunta retórica de apertura («¿te has preguntado alguna vez…?») = abra con la situación real; gerundio de importancia («destacando la relevancia de…», «subrayando el papel de…») = nombre el efecto concreto o corte; adjetivo de folleto («robusto», «integral», «innovador», «de vanguardia») = muestre la característica; tres elementos por reflejo («rápido, eficiente y seguro») = elija lo que vale y pruébelo; cierre de resumen («en conclusión», «en definitiva») = termine con el siguiente paso práctico; rayas en serie = coma, punto o paréntesis; «juega un papel fundamental» = diga qué hace.',
      '8. VARÍE. Apertura, longitud de frase, longitud de párrafo y molde de sección cambian de un texto a otro y dentro del mismo texto. Si el artículo anterior abrió con una pregunta, este no. No repita la misma fórmula de inicio de párrafo.',
      '9. ESTRUCTURA AL SERVICIO DEL LECTOR. La respuesta a lo que la persona buscó va al principio, en lenguaje sencillo; el resto profundiza. Una idea por párrafo. Los subtítulos describen el contenido y no llevan enlace. Listas solo para lo que es lista (pasos, documentos, requisitos); tablas solo para datos comparables y conocidos; FAQ solo con preguntas que el público realmente hace y que el texto sabe responder. Imágenes, gráficos o citas entran cuando explican algo y van junto al pasaje que ilustran; el pie explica, el texto alternativo describe. Fuentes y enlaces van donde respaldan la frase, con un texto de ancla que dice adónde lleva, nunca «haga clic aquí».',
      '10. TIEMPO Y LUGAR EXPLÍCITOS. Evite «actualmente», «recientemente», «este año» sin fecha; use la fecha o el año entregado. No diga «en el país» sin decir cuál, salvo que el proyecto lo defina.',
      '11. LA EXTENSIÓN ES CONSECUENCIA. El texto tiene la longitud que pide la intención. Un rango de palabras, número de imágenes, enlaces o elementos, cuando viene del proyecto, es orientación: cúmplala si cabe sin relleno; si no cabe, entregue el texto fiel y anote la brecha en el campo de observaciones en lugar de rellenar con repetición.',
      '12. LAS REGLAS DEL SEGMENTO SON UN AVISO. Si el segmento tiene reglas propias de publicidad o de profesión (jurídico, salud, finanzas, electoral), respételas como cuidado: no prometa resultados, no invente normas, no compare con la competencia, no use el dolor de la persona como gatillo. Si duda de una norma, señálelo en el campo de observaciones en vez de afirmar o bloquear por su cuenta.',
      '13. SIN DATO, SIN INVENCIÓN. ¿Falta una fuente para algo central? Siga el procedimiento del ejecutor (señal de pendiente, campo de verificación u omisión). Nunca escriba «consulte la fuente», «por verificar» ni un dato borrador dentro del texto final.',
    ],
    compact: [
      'Escriba como habla una persona que conoce el tema con otra: palabras de todos los días, frases de distinta longitud, términos técnicos explicados al momento.',
      'Todo hecho (cifra, fecha, ley, resolución, nombre, dirección, precio, cita) debe estar en el material entregado; sin fuente, corte o diga que no hay dato. Nunca atribuya a «expertos» sin nombre. No una fuentes para concluir algo que ninguna dice.',
      'Calidez = reconocer la situación concreta y dar el siguiente paso; autoridad = datos, fuentes y credenciales reales; sin superlativos («el mejor», «líder») sin la prueba al lado.',
      'Evite las marcas de texto automático: «en el mundo actual», «en este artículo vamos a», «cabe destacar», «no es solo X, sino Y», pregunta retórica de apertura, gerundio de importancia, adjetivo de folleto, tres elementos por reflejo, rayas en serie, cierre de resumen. Varíe aperturas, frases y moldes.',
      'Respuesta directa al principio, una idea por párrafo, listas solo donde hay lista, FAQ solo con preguntas reales. Las reglas del segmento son un aviso: sin promesa de resultados ni normas inventadas.',
    ],
    micro: ['Fiel al contenido: sin promesa, sin exageración, sin fórmula de titular y sin inventar datos.'],
    segment: (n) => `AVISO DEL SEGMENTO (cuidado, no bloqueo): ${n}`,
    brand: (n) => `VOZ DE LA MARCA (úsela sin crear hechos nuevos): ${n}`,
  },
};

const OTHER_LANGUAGE_NOTE = 'Write the final text in the requested language. The marks and rules below are examples in English; apply their equivalents in that language (generic openers, emphasis crutches, "not just X but Y", rhetorical opening questions, brochure adjectives, summary closers).';

/**
 * Bloco de instruções "Voz humana e verificabilidade" para inserir nos prompts de geração/reescrita.
 * `language`: pt, en, es têm texto próprio; outro idioma recebe o bloco em inglês com a nota de equivalência.
 * `mode`: 'full' (artigos e páginas), 'compact' (reescritas e revisões), 'micro' (título, meta descrição, trechos curtos).
 */
export function humanVoiceBlock(language: string | null | undefined, opts: VoiceOptions = {}): string {
  const lang = langOf(language) ?? 'en';
  const b = BLOCKS[lang];
  const mode = opts.mode ?? 'full';
  const lines = mode === 'full' ? b.full : mode === 'compact' ? b.compact : b.micro;
  const out: string[] = [`${b.title} (v${HUMAN_VOICE_VERSION})`];
  if (!langOf(language) && mode !== 'micro') out.push(OTHER_LANGUAGE_NOTE);
  out.push(...lines);
  if (mode !== 'micro') {
    const seg = String(opts.segmentNotice || '').trim().slice(0, 600);
    if (seg) out.push(b.segment(seg));
    const brand = String(opts.brandVoice || '').trim().slice(0, 600);
    if (brand) out.push(b.brand(brand));
  }
  return out.join('\n');
}

/** Texto sem os exemplos entre « » (os exemplos listam o que é proibido; o resto são as instruções de fato). */
export const stripQuotedExamples = (s: string): string => String(s || '').replace(/«[^»]*»/g, ' ');

export interface AiTell { code: string; label: string; excerpt: string; fix: string; source: 'estudio' | 'wikipedia'; paragraph: number }

interface ExtraTic { code: string; label: string; re: string; fix: string }
/** Marcas da Wikipédia que o guia do Estúdio ainda não cobre (atribuição vaga, gerúndio de importância, puffery, tempo relativo). */
const EXTRA_TICS: Record<VoiceLanguage, ExtraTic[]> = {
  pt: [
    { code: 'atribuicao_vaga', label: 'Atribuição vaga ("especialistas dizem")', re: '(?:segundo|de acordo com|para) (?:especialistas|estudiosos|analistas|observadores|a maioria dos (?:especialistas|juristas|médicos))|(?:especialistas|estudos|pesquisas) (?:apontam|mostram|indicam|afirmam|comprovam)(?! (?:do|da|de|em) )|muitos (?:acreditam|dizem|acham)', fix: 'Diga quem afirmou e onde (fonte fornecida) ou não atribua.' },
    { code: 'gerundio_importancia', label: 'Gerúndio de importância ("destacando a relevância de")', re: ',\\s*(?:destacando|ressaltando|evidenciando|reforçando|sublinhando|reafirmando) (?:a |o |as |os )?(?:import[aâ]ncia|relev[aâ]ncia|papel|necessidade)', fix: 'Nomeie o efeito concreto ou corte o trecho.' },
    { code: 'elogio_sem_prova', label: 'Elogio sem prova ("líder", "referência", "o melhor")', re: '\\b(?:l[ií]der(?:es)? (?:de mercado|do setor|em)|refer[eê]ncia (?:nacional|no mercado|em)|o melhor|a melhor|[uú]nic[oa] (?:do|da|no|na) (?:mercado|pa[ií]s|regi[aã]o)|100% (?:seguro|garantido|eficaz))\\b', fix: 'Mostre o dado que sustenta (e a fonte) ou retire o elogio.' },
    { code: 'tempo_relativo', label: 'Tempo relativo sem data ("atualmente", "recentemente")', re: '\\b(?:atualmente|recentemente|nos [uú]ltimos anos|este ano)\\b', fix: 'Use a data ou o ano fornecido.' },
    { code: 'testemunho_de_importancia', label: 'Fórmula de importância ("é um testemunho", "marco")', re: '(?:[eé] um (?:verdadeiro )?(?:testemunho|marco)|marca (?:uma|um) (?:nova )?(?:era|virada|marco)|divisor de [aá]guas)', fix: 'Descreva o fato e deixe o leitor concluir.' },
  ],
  en: [
    { code: 'vague_attribution', label: 'Vague attribution ("experts say")', re: '(?:experts|analysts|observers|critics|researchers|studies|research) (?:say|argue|suggest|believe|show|indicate|agree)(?! that [A-Z])|according to (?:experts|analysts|observers)|many (?:believe|say|argue)', fix: 'Say who claimed it and where (supplied source) or do not attribute.' },
    { code: 'significance_participle', label: 'Significance participle ("highlighting the importance of")', re: ',\\s*(?:highlighting|underscoring|emphasi[sz]ing|reflecting|showcasing|reinforcing|demonstrating) (?:the |its |their )?(?:importance|significance|role|need|commitment)', fix: 'Name the concrete effect or cut it.' },
    { code: 'promotional_praise', label: 'Praise without proof ("leading", "renowned", "the best")', re: '\\b(?:leading|renowned|premier|the best|a testament to|stands as|boasts|vibrant|pivotal|tapestry|delve[sd]?|underscore[sd]?)\\b', fix: 'Show the data that supports it (and the source) or drop the praise.' },
    { code: 'relative_time', label: 'Relative time without a date ("currently", "recently")', re: '\\b(?:currently|recently|in recent years|this year)\\b', fix: 'Use the supplied date or year.' },
  ],
  es: [
    { code: 'atribucion_vaga', label: 'Atribución vaga ("los expertos dicen")', re: '(?:seg[uú]n|de acuerdo con) (?:expertos|especialistas|analistas|observadores)|(?:expertos|estudios|investigaciones) (?:afirman|demuestran|indican|se[ñn]alan|coinciden)|much[oa]s (?:creen|dicen|piensan)', fix: 'Diga quién lo afirmó y dónde (fuente entregada) o no atribuya.' },
    { code: 'gerundio_importancia', label: 'Gerundio de importancia ("destacando la relevancia de")', re: ',\\s*(?:destacando|resaltando|subrayando|evidenciando|reforzando|reafirmando) (?:la |el |las |los )?(?:importancia|relevancia|papel|necesidad)', fix: 'Nombre el efecto concreto o corte el pasaje.' },
    { code: 'elogio_sin_prueba', label: 'Elogio sin prueba ("líder", "referente", "el mejor")', re: '\\b(?:l[ií]der(?:es)? (?:del mercado|del sector|en)|referente (?:nacional|del mercado|en)|el mejor|la mejor|[uú]nic[oa] en (?:el )?(?:mercado|pa[ií]s|regi[oó]n)|100% (?:seguro|garantizado|eficaz))\\b', fix: 'Muestre el dato que lo respalda (y la fuente) o retire el elogio.' },
    { code: 'tiempo_relativo', label: 'Tiempo relativo sin fecha ("actualmente", "recientemente")', re: '\\b(?:actualmente|recientemente|en los [uú]ltimos a[ñn]os|este a[ñn]o)\\b', fix: 'Use la fecha o el año entregado.' },
  ],
};

/**
 * Procura marcas de texto automático. Devolve os achados do detector do Estúdio (tiques do idioma, aberturas, fechos, ritmo, repetição,
 * especificidade) MAIS as marcas da Wikipédia acima. Determinístico, sem rede.
 * Texto curto (menos de ~150 palavras) só dispara tiques de frase; as métricas estruturais exigem texto longo.
 */
export function findAiTells(text: string, language = 'pt'): AiTell[] {
  const out: AiTell[] = [];
  const report = detectAiPatterns(String(text || ''), language);
  for (const f of report.findings) out.push({ code: f.code, label: f.label, excerpt: f.excerpt, fix: f.fix, source: 'estudio', paragraph: f.paragraph });
  const lang = langOf(language);
  if (lang) {
    const plain = String(text || '').replace(/<[^>]+>/g, ' ');
    const paragraphs = plain.split(/\n{2,}|\s{2,}(?=[A-ZÁÉÍÓÚ¿¡])/).filter(Boolean);
    for (const tic of EXTRA_TICS[lang]) {
      let re: RegExp;
      try { re = new RegExp(tic.re, 'giu'); } catch { continue; }
      for (const m of plain.matchAll(re)) {
        const at = m.index ?? 0;
        const para = Math.max(0, paragraphs.findIndex((p) => p.includes(m[0])));
        out.push({ code: tic.code, label: tic.label, excerpt: plain.slice(Math.max(0, at - 10), at + m[0].length + 20).trim(), fix: tic.fix, source: 'wikipedia', paragraph: para });
      }
    }
  }
  return out;
}

/** Nota de 0 (soa humano) a 100 (cheio de marca), a mesma do Estúdio. */
export function aiTellScore(text: string, language = 'pt'): number {
  return detectAiPatterns(String(text || ''), language).score;
}

/** Verdadeiro se o texto já traz o bloco de voz humana (qualquer idioma), para não duplicar quando o modelo do banco já o inclui. */
export const hasHumanVoiceBlock = (text: string): boolean => /(?:VOZ HUMANA E VERIFICABILIDADE|HUMAN VOICE AND VERIFIABILITY|VOZ HUMANA Y VERIFICABILIDAD) \(v\d/.test(String(text || ''));
