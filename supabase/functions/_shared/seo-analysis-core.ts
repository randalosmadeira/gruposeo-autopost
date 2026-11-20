/**
 * Análise de conteúdo v5 (SEO + GEO + AEO + E-E-A-T), SEM rede e SEM IA. Extraída de analyze-seo-advanced/index.ts em 20/11/2026 para que a função
 * de análise, o Piloto Automático e a tela usem exatamente as mesmas contas.
 *
 * Mudança de princípio: os limites (60/70 de Flesch, 25 palavras por frase, 10 links internos, 1500 palavras, etc.) deixaram de ser constantes
 * do código. Vêm do PERFIL DE REGRAS (optimization-rules.ts): padrão editável + o que o projeto/artigo/prompt do agente disser. Com o perfil
 * padrão, os números são os mesmos de antes (os 1500 palavras viraram só uma dica 'recomendar').
 *
 * Global: o idioma do artigo vem do que está configurado (artigo, projeto) ou é detectado pelo texto (language-packs.ts). A legibilidade usa a fórmula
 * DO IDIOMA (pt: Flesch adaptado 248,835; en: Flesch 206,835; es: Fernández-Huerta; fr: Kandel-Moles; it: Gulpease; de: Amstad; nl: Douma).
 * Idioma sem pacote = SEM FÓRMULA: a nota fica nula e não entra na pontuação (nunca devolve 0 de mentira).
 */
import { defaultProfile, isOn, ruleValue, wordBand, type RuleId, type RuleLevel, type RuleProfile } from './optimization-rules.ts';
import { findPublicationResidues } from './publication-safety.ts';
import { LANGUAGES, STAT_NUMERIC, STRUCTURAL_HEADING, countSyllables as countSyllablesLang, isQuestionHeading, resolveLanguage, textStats, type LanguageProfile } from './language-packs.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** O que o resto do sistema já sabe sobre o artigo e que não está no HTML do corpo (JSON-LD vai por post-meta, não pelo corpo). */
export interface AnalysisExtras {
  /** tipos de schema que a publicação vai emitir (ex.: ['Article','BreadcrumbList','FAQPage']) */
  schemaTypes?: string[];
  /** SEO plugin ativo no site ('rank_math' | 'yoast' | ...): ele já emite Article e trilha */
  seoPlugin?: string | null;
  /** autor real identificado (não o genérico "Redação") */
  authorIdentified?: boolean;
  /** datas do schema coerentes (modificado >= publicado) */
  datesCoherent?: boolean;
  /** texto do convite ao contato do projeto: se ele já está no texto, o artigo tem convite mesmo que as palavras não casem com o detector */
  ctaText?: string | null;
}

/** Contagem de sílabas (aproximação por idioma; padrão português). */
export const countSyllables = (word: string, code = 'pt'): number => countSyllablesLang(word, code);

/** Flesch adaptado ao português (mantido por compatibilidade e teste). */
export function fleschPt(avgWordsPerSentence: number, avgSyllablesPerWord: number): number {
  return Math.max(0, Math.min(100, Math.round(248.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)));
}

/** Quantidade de tabelas em markdown cru (linhas com barras e linha separadora |---|). */
export function countMarkdownTables(html: string): number {
  const text = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?p[^>]*>/gi, '\n');
  const lines = text.split(/\n/);
  let tables = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/\|/.test(lines[i]) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])) { tables++; i++; }
  }
  return tables;
}

const SCHEMA_ARTICLE_TYPES = ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'];

export function analyzeContent(content: string, cleanContent: string, article: Any, project?: Any, rules: RuleProfile = defaultProfile(), extras: AnalysisExtras = {}) {
  // Idioma: configurado (artigo, projeto) ou detectado pelo texto. Sem pacote do idioma = sem fórmula (nota nula).
  const lang = resolveLanguage({
    configured: [article?.language, article?.config?.language, project?.language, project?.nexus_strategy?.language, project?.editorial_identity?.language],
    text: cleanContent,
  });
  const lp: LanguageProfile | null = lang.profile;
  const st = textStats(cleanContent, lang.code);
  const words = cleanContent.split(/\s+/).filter((w: string) => w.length > 0);
  const wordCount = st.words;
  const sentences = st.sentenceTexts;
  const sentenceCount = st.sentences;
  const avgWordsPerSentence = wordCount / sentenceCount;
  const formula = lp?.readability ?? null;
  const fleschScore: number | null = formula && wordCount > 0 ? formula.compute(st) : null;
  // Mínimo/alvo: se ninguém definiu (padrão editável), valem os da escala da fórmula do idioma; se o projeto/prompt definiu, vale o definido.
  const fRule = rules.rules.flesch;
  const useFormulaDefaults = fRule.source === 'padrao_editavel' && !!formula;
  const fleschMin = useFormulaDefaults ? formula!.defaultMin : ruleValue(rules, 'flesch', 60);
  const fleschTarget = Math.max(fleschMin, useFormulaDefaults ? formula!.defaultTarget : (fRule.max ?? 70));
  const sentenceMax = ruleValue(rules, 'sentence_words', 25);
  const paragraphMax = ruleValue(rules, 'paragraph_words', 60);

  // Coleman-Liau e Gunning Fog são índices do INGLÊS: só aparecem para texto em inglês.
  const isEn = lang.code === 'en';
  const charCount = cleanContent.replace(/\s+/g, '').length;
  const L = (charCount / Math.max(wordCount, 1)) * 100;
  const S = (sentenceCount / Math.max(wordCount, 1)) * 100;
  const colemanLiau: number | null = isEn ? Math.max(0, Math.round((0.0588 * L - 0.296 * S - 15.8) * 10) / 10) : null;
  const complexWords = words.filter((w: string) => countSyllablesLang(w, lang.code) >= 3).length;
  const gunningFog: number | null = isEn ? Math.max(0, Math.round(0.4 * (avgWordsPerSentence + 100 * (complexWords / Math.max(wordCount, 1))) * 10) / 10) : null;

  const passiveMatches = lp?.passive ? (cleanContent.match(new RegExp(lp.passive.source, 'gi')) || []) : [];
  const passivePercentage = Math.round((passiveMatches.length / sentenceCount) * 100 * 10) / 10;

  const lowerContent = cleanContent.toLowerCase();
  let transitionCount = 0;
  for (const tw of lp?.transitions || []) {
    transitionCount += (lowerContent.match(new RegExp(tw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
  }
  const transitionPercentage: number | null = lp ? Math.round((transitionCount / sentenceCount) * 100 * 10) / 10 : null;

  const longSentences = sentences.filter((sx: string) => sx.trim().split(/\s+/).length > sentenceMax).length;
  const longSentencePct = Math.round((longSentences / sentenceCount) * 100 * 10) / 10;

  let trafficLight: 'green' | 'orange' | 'red' = 'green';
  const readabilityIssues: string[] = [];
  if (fleschScore !== null) {
    if (fleschScore < fleschMin) { trafficLight = 'red'; readabilityIssues.push(`Legibilidade < ${fleschMin}`); }
    else if (fleschScore < fleschTarget) { trafficLight = 'orange'; readabilityIssues.push(`Legibilidade ${fleschMin}-${fleschTarget}`); }
  }
  if (passivePercentage > 25) { trafficLight = 'red'; readabilityIssues.push(`Voz passiva ${passivePercentage}%`); }
  else if (passivePercentage > 15) { if (trafficLight !== 'red') trafficLight = 'orange'; }
  if (longSentencePct > 40) { trafficLight = 'red'; readabilityIssues.push(`Frases longas ${longSentencePct}%`); }

  const h1Count = (content.match(/<h1[\s>]/gi) || []).length;
  const h2Count = (content.match(/<h2[\s>]/gi) || []).length;
  const h3Count = (content.match(/<h3[\s>]/gi) || []).length;
  const imgCount = (content.match(/<img/gi) || []).length;
  const altCount = (content.match(/alt=["'][^"']+["']/gi) || []).length;
  const hasFAQ = (lp ? lp.faq : new RegExp(Object.values(LANGUAGES).map((l) => l.faq.source).join('|'), 'i')).test(cleanContent);
  const hasConclusion = (lp ? lp.conclusion : new RegExp(Object.values(LANGUAGES).map((l) => l.conclusion.source).join('|'), 'i')).test(cleanContent);
  const ctaPlain = String(extras.ctaText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const hasCTA = (lp ? lp.cta : new RegExp(Object.values(LANGUAGES).map((l) => l.cta.source).join('|'), 'i')).test(cleanContent) || /whatsapp|wa\.me/i.test(content) || (ctaPlain.length > 8 && cleanContent.includes(ctaPlain));
  const allLinks = content.match(/<a[^>]+href=["']https?:\/\/[^"']+["']/gi) || [];

  const projectDomain = project?.domain || '';
  const wpUrl = project?.wordpress_url || '';
  const domainPatterns: string[] = [];
  if (projectDomain) domainPatterns.push(String(projectDomain).replace(/^www\./, ''));
  if (wpUrl) {
    try { domainPatterns.push(new URL(wpUrl).hostname.replace(/^www\./, '')); } catch { /* url inválida */ }
  }
  const isInternalLink = (link: string): boolean => {
    if (domainPatterns.length === 0) return false;
    const lowerLink = link.toLowerCase();
    return domainPatterns.some((d) => lowerLink.includes(d.toLowerCase()));
  };
  const internalLinksArr = allLinks.filter(isInternalLink);
  const externalLinksArr = allLinks.filter((l: string) => !isInternalLink(l));
  const relativeLinks = content.match(/<a[^>]+href=["']\/[^"']*["']/gi) || [];
  const internalLinksCount = internalLinksArr.length + relativeLinks.length;
  const externalLinksCount = externalLinksArr.length;

  const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const longParagraphs = paragraphs.filter((p: string) => p.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length > paragraphMax);

  const keyword = (article.keyword || '').toLowerCase();
  const keywordWords = keyword.split(/[\s:,;]+/).filter((w: string) => w.length > 3);
  const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const exactKeywordCount = keyword ? (cleanContent.match(keywordRegex) || []).length : 0;
  let keywordCount = exactKeywordCount;
  if (keywordWords.length >= 3 && exactKeywordCount === 0) {
    const significantMatches = keywordWords.filter((w: string) => {
      const wRegex = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      return (cleanContent.match(wRegex) || []).length >= 2;
    });
    if (significantMatches.length >= keywordWords.length * 0.6) keywordCount = Math.max(1, significantMatches.length);
  }
  const keywordDensity = keyword && wordCount > 0 ? Math.round((keywordCount * Math.min(keywordWords.length, 3) / wordCount) * 100 * 10) / 10 : 0;

  const titleLen = (article.title || '').length;
  const excerptLen = (article.excerpt || '').length;
  const titleLower = (article.title || '').toLowerCase();
  const excerptLower = (article.excerpt || '').toLowerCase();
  let titleHasKeyword = keyword ? titleLower.includes(keyword) : false;
  let excerptHasKeyword = keyword ? excerptLower.includes(keyword) : false;
  if (!titleHasKeyword && keywordWords.length >= 3) titleHasKeyword = keywordWords.filter((w: string) => titleLower.includes(w)).length >= keywordWords.length * 0.5;
  if (!excerptHasKeyword && keywordWords.length >= 3) excerptHasKeyword = keywordWords.filter((w: string) => excerptLower.includes(w)).length >= keywordWords.length * 0.5;

  // Schema e trilha: o JSON-LD vai por post-meta na publicação (o corpo do artigo não carrega <script>), então a detecção olha o corpo E o que a publicação vai emitir.
  const schemaTypes = extras.schemaTypes || [];
  const seoPluginActive = !!extras.seoPlugin && extras.seoPlugin !== 'none';
  const hasBreadcrumb = /<[^>]*class=["'][^"']*breadcrumb/i.test(content) || /breadcrumbList/i.test(content) || schemaTypes.includes('BreadcrumbList') || seoPluginActive;
  const hasArticleSchema = /ArticleSchema|"@type"\s*:\s*"Article"/i.test(content) || schemaTypes.some((t) => SCHEMA_ARTICLE_TYPES.includes(t)) || seoPluginActive;
  const hasFAQSchema = /FAQPage|"@type"\s*:\s*"FAQPage"/i.test(content) || schemaTypes.includes('FAQPage');
  const hasHowToSchema = /HowTo|"@type"\s*:\s*"HowTo"/i.test(content);

  // ===== GEO =====
  const firstParagraph = paragraphs.length > 0 ? paragraphs[0].replace(/<[^>]+>/g, '').trim() : '';
  const firstParaWords = firstParagraph.split(/\s+/).length;
  const verbsSource = lp ? lp.definitionVerbs : Object.values(LANGUAGES).map((l) => l.definitionVerbs).join('|');
  const hasDirectAnswer = firstParaWords >= 30 && firstParaWords <= 80 && (
    new RegExp(`\\s(?:${verbsSource})\\s`, 'i').test(firstParagraph) || /^\p{L}.*[.!]$/u.test(firstParagraph.trim())
  );
  const h2Texts = (content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || []).map((h: string) => h.replace(/<[^>]+>/g, '').trim());
  // Títulos estruturais (conclusão, FAQ, fontes, leia também) não precisam ser pergunta e ficam fora da conta.
  const countableH2 = h2Texts.filter((h: string) => !STRUCTURAL_HEADING.test(h));
  const questionH2s = countableH2.filter((h: string) => isQuestionHeading(h, lp));
  const questionH2Pct = countableH2.length > 0 ? Math.round((questionH2s.length / countableH2.length) * 100) : 100;

  const statsPatterns: RegExp[] = [...(lp ? lp.sourcePhrases : Object.values(LANGUAGES).flatMap((l) => l.sourcePhrases)), ...STAT_NUMERIC];
  let statsCount = 0;
  for (const pattern of statsPatterns) statsCount += (cleanContent.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')) || []).length;
  const statsEvery200Words = wordCount > 0 ? Math.round((statsCount / (wordCount / 200)) * 10) / 10 : 0;

  const expertPatterns: RegExp[] = lp ? lp.expertPatterns : Object.values(LANGUAGES).flatMap((l) => l.expertPatterns);
  let expertMentions = 0;
  for (const p of expertPatterns) expertMentions += (cleanContent.match(new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g')) || []).length;

  // Tom conversacional: marcadores de tratamento direto do idioma + perguntas. Sem pacote de idioma, o critério não se aplica (neutro).
  let conversationalScore = 0;
  if (lp) {
    conversationalScore += Math.min((cleanContent.match(new RegExp(lp.conversational, 'giu')) || []).length, 30);
    conversationalScore += Math.min((cleanContent.match(/[?？]/g) || []).length, 20);
  }
  const isConversational = lp ? conversationalScore >= 10 : true;

  const genericPhrases: string[] = lp ? lp.filler : [];
  const genericCount = genericPhrases.filter((p) => lowerContent.includes(p)).length;

  const currentYear = new Date().getFullYear();
  const yearMentions = (cleanContent.match(new RegExp(`\\b${currentYear}\\b`, 'g')) || []).length;
  const hasFreshData = yearMentions >= 2;
  const definitionPatterns = (cleanContent.match(new RegExp(`\\b\\p{L}+\\s+(?:${verbsSource})\\s+`, 'giu')) || []).length;

  const band = wordBand(rules);
  // Profundidade: sem faixa configurada pelo prompt/agente, o critério não se aplica (não penaliza).
  const wordsOk = band.min === null ? true : wordCount >= band.min && (band.max === null || wordCount <= band.max * 1.25);

  let geoScore = 0;
  if (hasDirectAnswer) geoScore += 15;
  if (questionH2Pct >= 50) geoScore += 15; else if (questionH2Pct >= 25) geoScore += 8;
  if (statsEvery200Words >= 0.8) geoScore += 15; else if (statsEvery200Words >= 0.4) geoScore += 8;
  if (expertMentions >= 2) geoScore += 10; else if (expertMentions >= 1) geoScore += 5;
  if (isConversational) geoScore += 10;
  if (genericCount === 0) geoScore += 10; else if (genericCount <= 2) geoScore += 5;
  if (hasFreshData) geoScore += 10;
  if (definitionPatterns >= 3) geoScore += 5;
  if (hasFAQ) geoScore += 10;

  let aeoScore = 0;
  if (hasDirectAnswer) aeoScore += 25;
  if (questionH2Pct >= 50) aeoScore += 20; else if (questionH2Pct >= 25) aeoScore += 10;
  if (hasFAQ) aeoScore += 20;
  if (statsEvery200Words >= 0.8) aeoScore += 15; else if (statsEvery200Words >= 0.4) aeoScore += 8;
  if (isConversational) aeoScore += 10;
  if (definitionPatterns >= 3) aeoScore += 10;

  let eeatScore = 0;
  if (expertMentions >= 2) eeatScore += 25; else if (expertMentions >= 1) eeatScore += 15;
  if (externalLinksCount >= 2) eeatScore += 20; else if (externalLinksCount >= 1) eeatScore += 10;
  if (statsEvery200Words >= 0.8) eeatScore += 20; else if (statsEvery200Words >= 0.4) eeatScore += 10;
  if (hasFreshData) eeatScore += 15;
  if (hasArticleSchema || hasFAQSchema) eeatScore += 10;
  if (wordsOk) eeatScore += 10;

  const titleMin = ruleValue(rules, 'title_length', 55); const titleMax = rules.rules.title_length.max ?? 80;
  const metaMin = ruleValue(rules, 'meta_length', 145); const metaMax = rules.rules.meta_length.max ?? 180;
  const markdownTables = countMarkdownTables(content);
  const residues = findPublicationResidues({ title: article.title, content, excerpt: article.excerpt });

  return {
    language: {
      tag: lang.tag, code: lang.code, region: lang.region, source: lang.source, name: lp?.name ?? null, confidence: Math.round(lang.confidence * 100) / 100,
      formula: formula ? { id: formula.id, label: formula.label, status: formula.status, scored: true } : { id: null, label: 'Sem fórmula para este idioma', status: null, scored: false },
    },
    flesch: {
      score: fleschScore,
      level: fleschScore === null ? 'Sem fórmula' : fleschScore >= 90 ? 'Muito fácil' : fleschScore >= 80 ? 'Fácil' : fleschScore >= 70 ? 'Bastante fácil' : fleschScore >= fleschMin ? 'Padrão' : 'Abaixo do mínimo',
      // Sem fórmula não há reprovação: não pontuar não é reprovar.
      passed: fleschScore === null ? true : fleschScore >= fleschMin,
      scored: fleschScore !== null,
      min: fleschMin,
      target: fleschTarget,
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    },
    readability_v2: {
      coleman_liau: colemanLiau,
      gunning_fog: gunningFog,
      composite_score: fleschScore === null ? null : (colemanLiau !== null && gunningFog !== null
        ? Math.round((fleschScore * 0.5 + Math.max(0, 100 - gunningFog * 5) * 0.25 + Math.max(0, 100 - colemanLiau * 5) * 0.25) * 10) / 10
        : fleschScore),
      passive_voice_pct: passivePercentage,
      passive_count: passiveMatches.length,
      transition_words_pct: transitionPercentage,
      transition_count: transitionCount,
      long_sentences_pct: longSentencePct,
      long_sentences: longSentences,
      complex_words_pct: isEn ? Math.round((complexWords / Math.max(wordCount, 1)) * 100 * 10) / 10 : null,
      traffic_light: trafficLight,
      issues: readabilityIssues,
    },
    structure: {
      wordCount, h1Count, h2Count, h3Count, imgCount, imgsWithAlt: altCount,
      hasFAQ, hasConclusion, hasCTA, internalLinks: internalLinksCount, externalLinks: externalLinksCount,
      longParagraphs: longParagraphs.length, totalParagraphs: paragraphs.length,
      hasBreadcrumb, hasArticleSchema, hasFAQSchema, hasHowToSchema,
      markdownTables, residueCount: residues.length,
      wordsOk,
    },
    keyword: {
      keyword: article.keyword, density: keywordDensity, count: keywordCount,
      isOptimal: keywordDensity >= 0.5 && keywordDensity <= 2.5,
      titleHasKeyword, excerptHasKeyword,
    },
    meta: {
      titleLength: titleLen, titleOk: titleLen >= titleMin && titleLen <= titleMax,
      excerptLength: excerptLen, excerptOk: excerptLen >= metaMin && excerptLen <= metaMax,
    },
    geo: {
      score: geoScore,
      grade: geoScore >= 80 ? 'A' : geoScore >= 60 ? 'B' : geoScore >= 40 ? 'C' : 'D',
      hasDirectAnswer, questionH2Pct, statsEvery200Words, expertMentions, isConversational,
      genericPhraseCount: genericCount, hasFreshData, definitionPatterns,
    },
    aeo: { score: aeoScore, grade: aeoScore >= 80 ? 'A' : aeoScore >= 60 ? 'B' : aeoScore >= 40 ? 'C' : 'D' },
    eeat: { score: eeatScore, grade: eeatScore >= 80 ? 'A' : eeatScore >= 60 ? 'B' : eeatScore >= 40 ? 'C' : 'D' },
    extras: { authorIdentified: extras.authorIdentified ?? null, datesCoherent: extras.datesCoherent ?? null, seoPlugin: extras.seoPlugin ?? null },
  };
}

export type Analysis = ReturnType<typeof analyzeContent>;

export function calculateScore(analysis: Analysis, rules: RuleProfile = defaultProfile()): number {
  let score = 0;
  const { flesch, readability_v2, structure, keyword, meta, geo, aeo, eeat } = analysis;
  const fleschMin = flesch.min ?? 60;
  const fleschTarget = flesch.target ?? 70;
  const transitionMin = ruleValue(rules, 'transition_words', 30);
  const h2Min = ruleValue(rules, 'h2_count', 5);
  const h3Min = ruleValue(rules, 'h3_count', 3);
  const linksMin = ruleValue(rules, 'internal_links', 10);

  // Itens que o idioma não permite medir saem do total possível e a nota é reescalada (idioma sem fórmula não é punido nem premiado).
  let possible = 100;
  if (flesch.score === null) possible -= 15;
  else if (flesch.score >= fleschTarget) score += 15; else if (flesch.score >= fleschMin) score += 10; else if (flesch.score >= fleschMin - 10) score += 5;
  if (readability_v2) {
    if (readability_v2.passive_voice_pct <= 10) score += 5; else if (readability_v2.passive_voice_pct <= 15) score += 3;
    if (readability_v2.transition_words_pct === null) possible -= 5;
    else if (readability_v2.transition_words_pct >= transitionMin) score += 5; else if (readability_v2.transition_words_pct >= transitionMin * (20 / 30)) score += 3;
    if (readability_v2.long_sentences_pct <= 15) score += 5; else if (readability_v2.long_sentences_pct <= 25) score += 3;
  }
  if (structure.h2Count >= h2Min) score += 7; else if (structure.h2Count >= Math.min(3, h2Min)) score += 5; else if (structure.h2Count > 0) score += 2;
  if (structure.h3Count >= h3Min) score += 3; else if (structure.h3Count > 0) score += 1;
  if (structure.hasFAQ) score += 5;
  if (structure.hasConclusion) score += 3;
  if (structure.hasCTA) score += 5;
  if (structure.internalLinks >= linksMin) score += 10; else if (structure.internalLinks >= linksMin / 2) score += 7; else if (structure.internalLinks >= 1) score += 2;
  if (structure.externalLinks >= 1 && structure.externalLinks <= 3) score += 3;
  if (structure.longParagraphs === 0) score += 3;
  if (keyword.isOptimal) score += 5; else if (keyword.count > 0) score += 3;
  if (meta.titleOk) score += 3;
  if (meta.excerptOk) score += 3;
  if (keyword.titleHasKeyword) score += 4;
  if (geo) score += Math.round(geo.score * 0.10);
  if (aeo) score += Math.round(aeo.score * 0.08);
  if (eeat) score += Math.round(eeat.score * 0.07);
  if (structure.wordsOk) score += 3;
  return possible >= 100 ? score : Math.min(100, Math.round((score * 100) / Math.max(possible, 1)));
}

// ===================== constatações por regra (a base do Piloto Automático e da tela) =====================

export type FixKind = 'deterministico' | 'ia' | 'humano' | 'plugin';
export interface Finding {
  id: RuleId;
  label?: string;
  level: RuleLevel;
  ok: boolean;
  /** como o sistema pode resolver: sem gastar IA, com IA em passo pequeno, só uma pessoa, ou o plugin no WordPress */
  fix: FixKind;
  message: string;
}

/** Avalia só as regras LIGADAS que o texto permite medir. Regra 'desligado' nem aparece. */
export function evaluateFindings(a: Analysis, rules: RuleProfile): Finding[] {
  const out: Finding[] = [];
  const add = (id: RuleId, ok: boolean, fix: FixKind, message: string) => { if (isOn(rules, id)) out.push({ id, level: rules.rules[id].level, ok, fix, message }); };
  const r = rules.rules;
  const s = a.structure;
  const band = wordBand(rules);
  if (band.min !== null) add('words', a.structure.wordCount >= band.min && (band.max === null || s.wordCount <= band.max * 1.25), 'humano',
    `${s.wordCount} palavras; o prompt/agente pede ${band.min}${band.max ? `–${band.max}` : '+'}. O piloto não inventa conteúdo para completar tamanho: precisa de uma pessoa ou de nova geração.`);
  if (a.flesch.score !== null) add('flesch', a.flesch.score >= (a.flesch.min ?? 60), 'ia', `Legibilidade ${a.flesch.score} pela fórmula ${a.language.formula.label} (mínimo ${a.flesch.min}, alvo ${a.flesch.target}).`);
  add('sentence_words', a.readability_v2.long_sentences_pct <= 25, 'ia', `${a.readability_v2.long_sentences} frase(s) acima de ${r.sentence_words.value ?? 25} palavras.`);
  add('paragraph_words', s.longParagraphs === 0, 'deterministico', `${s.longParagraphs} parágrafo(s) acima de ${r.paragraph_words.value ?? 60} palavras.`);
  if (a.readability_v2.transition_words_pct !== null) add('transition_words', a.readability_v2.transition_words_pct >= (r.transition_words.value ?? 30), 'ia', `${a.readability_v2.transition_words_pct}% de frases com conectivo (alvo ${r.transition_words.value ?? 30}%).`);
  add('h2_count', s.h2Count >= (r.h2_count.value ?? 5), 'humano', `${s.h2Count} H2 (alvo ${r.h2_count.value ?? 5}).`);
  add('h3_count', s.h3Count >= (r.h3_count.value ?? 3), 'humano', `${s.h3Count} H3 (alvo ${r.h3_count.value ?? 3}).`);
  add('h2_question_pct', a.geo.questionH2Pct >= (r.h2_question_pct.value ?? 50), 'deterministico', `${a.geo.questionH2Pct}% dos H2 em forma de pergunta (alvo ${r.h2_question_pct.value ?? 50}%).`);
  add('faq', s.hasFAQ, 'humano', 'Sem seção de perguntas frequentes. O piloto não inventa perguntas e respostas: elas precisam de conteúdo real.');
  add('conclusion_cta', s.hasConclusion && s.hasCTA, 'ia', s.hasConclusion ? 'Conclusão sem convite ao contato.' : 'Sem conclusão com convite ao contato.');
  add('direct_answer', a.geo.hasDirectAnswer, 'humano', 'O primeiro parágrafo não responde direto ao tema (30 a 80 palavras).');
  add('title_length', a.meta.titleOk, 'humano', `Título com ${a.meta.titleLength} caracteres (faixa ${r.title_length.value ?? 55}–${r.title_length.max ?? 80}).`);
  add('meta_length', a.meta.excerptOk, 'humano', `Meta descrição com ${a.meta.excerptLength} caracteres (faixa ${r.meta_length.value ?? 145}–${r.meta_length.max ?? 180}).`);
  add('internal_links', s.internalLinks >= (r.internal_links.value ?? 10), 'deterministico', `${s.internalLinks} link(s) interno(s) (mínimo ${r.internal_links.value ?? 10}).`);
  add('external_links', s.externalLinks >= (r.external_links.value ?? 2), 'humano', `${s.externalLinks} link(s) para fonte externa (alvo ${r.external_links.value ?? 2}). Só entra fonte verificada.`);
  add('stats_with_source', a.geo.statsEvery200Words >= 0.5, 'humano', `${a.geo.statsEvery200Words} dado(s) com fonte a cada 200 palavras. O piloto só usa fonte já informada; não inventa dado.`);
  add('expert_quotes', a.geo.expertMentions >= (r.expert_quotes.value ?? 2), 'humano', `${a.geo.expertMentions} citação(ões) de especialista. O piloto não inventa citação: precisa de pessoa e credencial reais.`);
  if (a.language.name) add('conversational_tone', a.geo.isConversational, 'ia', 'Tom pouco conversacional (pouco tratamento direto ao leitor e poucas perguntas).');
  add('fresh_year', a.geo.hasFreshData, 'humano', 'O ano corrente não aparece no texto.');
  add('breadcrumb', s.hasBreadcrumb, 'deterministico', 'Sem trilha de navegação (BreadcrumbList).');
  add('schema_article', s.hasArticleSchema, 'deterministico', 'Sem schema Article/BlogPosting.');
  add('schema_faq', s.hasFAQSchema || !s.hasFAQ, 'deterministico', 'FAQ sem schema FAQPage (informativo: o Google aposentou o rich result de FAQ em 05/2026).');
  add('image_alt', s.imgCount === 0 || s.imgsWithAlt >= s.imgCount, 'deterministico', `${s.imgCount - s.imgsWithAlt} imagem(ns) sem texto alternativo.`);
  add('no_markdown_tables', s.markdownTables === 0, 'deterministico', `${s.markdownTables} tabela(s) em markdown cru.`);
  add('no_prompt_residue', s.residueCount === 0, 'humano', `${s.residueCount} resíduo(s) de prompt, placeholder ou aviso interno.`);
  if (a.extras.authorIdentified !== null) add('author_byline', a.extras.authorIdentified === true, 'humano', 'Autor genérico ("Redação") ou ausente. O sistema não inventa autor: cadastre a pessoa real no projeto.');
  if (a.extras.datesCoherent !== null) add('dates_coherent', a.extras.datesCoherent === true, 'deterministico', 'Data de modificação anterior à de publicação.');
  return out.map((f) => ({ ...f }));
}

// ===================== mensagens para a tela da análise (mesmo formato de antes) =====================

export function buildCriticalIssues(analysis: Analysis, rules: RuleProfile = defaultProfile()): string[] {
  const issues: string[] = [];
  for (const f of evaluateFindings(analysis, rules)) if (!f.ok && f.level === 'exigir') issues.push(f.message);
  const a = analysis;
  if (isOn(rules, 'internal_links') && a.structure.internalLinks < 2) issues.push(`PÁGINA ÓRFÃ: apenas ${a.structure.internalLinks} link(s) interno(s). Sem linkagem interna o Google rastreia pior. O piloto insere os links possíveis.`);
  if (a.geo && a.geo.score < 40) issues.push(`GEO ${a.geo.score}/100 (nota ${a.geo.grade}): conteúdo pouco extraível por IAs generativas.`);
  if (a.geo && a.geo.genericPhraseCount > 3) issues.push(`${a.geo.genericPhraseCount} frases genéricas detectadas.`);
  return Array.from(new Set(issues));
}

export interface Improvement { area: string; priority: string; suggestion: string; impact: string }

export function buildImprovements(analysis: Analysis, rules: RuleProfile = defaultProfile()): Improvement[] {
  const out: Improvement[] = [];
  const a = analysis;
  const pr = (id: RuleId) => (rules.rules[id].level === 'exigir' ? 'alta' : 'média');
  for (const f of evaluateFindings(a, rules)) {
    if (f.ok) continue;
    out.push({ area: f.id === 'flesch' ? 'Legibilidade' : f.id === 'internal_links' ? 'Links internos' : f.id.replace(/_/g, ' '), priority: pr(f.id), suggestion: f.message, impact: f.fix === 'deterministico' ? 'o piloto corrige sem gastar IA' : f.fix === 'ia' ? 'o piloto corrige com IA em passo pequeno' : f.fix === 'plugin' ? 'o plugin do WordPress preenche' : 'precisa de uma pessoa' });
  }
  if (!a.keyword.titleHasKeyword) out.push({ area: 'Palavra-chave no título', priority: 'alta', suggestion: `A palavra-chave "${a.keyword.keyword}" não está no título.`, impact: 'ranqueamento' });
  if (a.geo && a.geo.genericPhraseCount > 0) out.push({ area: 'Anti-duplicidade', priority: 'média', suggestion: `${a.geo.genericPhraseCount} frase(s) genérica(s) ("no mundo de hoje", etc.).`, impact: 'originalidade' });
  return out;
}

export function buildSEOTips(analysis: Analysis, rules: RuleProfile = defaultProfile()): string[] {
  const tips: string[] = [];
  if (!analysis.keyword.isOptimal) tips.push(`Densidade da palavra-chave: ${analysis.keyword.density}%. Faixa usual: 0,5% a 2,5%.`);
  if (!analysis.keyword.excerptHasKeyword) tips.push('Inclua a palavra-chave na meta descrição.');
  const band = wordBand(rules);
  if (band.min !== null && analysis.structure.wordCount < band.min) tips.push(`Artigo com ${analysis.structure.wordCount} palavras; o prompt/agente deste projeto pede ${band.min}${band.max ? `–${band.max}` : ' ou mais'}.`);
  return tips;
}

export function buildContentTips(analysis: Analysis, rules: RuleProfile = defaultProfile()): string[] {
  const tips: string[] = [];
  if (isOn(rules, 'conclusion_cta') && !analysis.structure.hasConclusion) tips.push('Adicione uma conclusão com convite ao contato.');
  if (isOn(rules, 'h3_count') && analysis.structure.h3Count < ruleValue(rules, 'h3_count', 3)) tips.push(`Apenas ${analysis.structure.h3Count} H3. Subtópicos ajudam a escanear o texto.`);
  if (analysis.readability_v2?.passive_voice_pct > 15) tips.push(`${analysis.readability_v2.passive_voice_pct}% de voz passiva. Prefira a voz ativa.`);
  if (isOn(rules, 'transition_words') && analysis.readability_v2?.transition_words_pct < ruleValue(rules, 'transition_words', 30)) tips.push(`${analysis.readability_v2.transition_words_pct}% de frases com conectivo (alvo ${ruleValue(rules, 'transition_words', 30)}%).`);
  return tips;
}

/** Dicas de Flesch para a resposta da análise (só quando abaixo do alvo do perfil). */
export function fleschTips(analysis: Analysis): string[] {
  const f = analysis.flesch;
  if (f.score === null || f.score >= (f.target ?? 70)) return [];
  return [
    `Legibilidade atual: ${f.score} (${analysis.language.formula.label}). Alvo: ${f.target}.`,
    `Média atual: ${f.avgWordsPerSentence} palavras por frase.`,
    'Quebre frases longas e prefira palavras mais curtas e a voz ativa.',
  ];
}
