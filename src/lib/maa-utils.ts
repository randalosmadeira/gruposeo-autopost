/**
 * MAA (Meus Artigos Automáticos) - Utilities
 * Compliance OAB, SEO Scores, and Content Validation
 * 
 * Based on: Dr. Rândalos Madeira - RDM Advogados Associados
 * Compliance: OAB Resolução 02/2015, Lei 9.610/98
 */

// ==================== COMPLIANCE OAB ====================

interface ComplianceResult {
  isCompliant: boolean;
  score: number;
  problems: ComplianceProblem[];
  warnings: string[];
}

interface ComplianceProblem {
  type: 'error' | 'warning';
  term: string;
  message: string;
  suggestion?: string;
  article?: string;
}

// Termos proibidos pela OAB (Resolução 02/2015)
const TERMOS_PROIBIDOS_OAB = [
  { termo: 'garantido', sugestao: 'Remova ou use "buscamos os melhores resultados"' },
  { termo: 'garantia de resultado', sugestao: 'Use "compromisso com a defesa"' },
  { termo: '100% de sucesso', sugestao: 'Remova - viola Art. 5º' },
  { termo: 'certeza de ganhar', sugestao: 'Remova completamente' },
  { termo: 'melhor advogado', sugestao: 'Use "advogado especializado"' },
  { termo: 'advogado mais barato', sugestao: 'Remova - mercantilização' },
  { termo: 'promoção', sugestao: 'Remova - captação indevida' },
  { termo: 'desconto', sugestao: 'Remova - mercantilização' },
  { termo: 'preço mais baixo', sugestao: 'Remova completamente' },
  { termo: 'grátis', sugestao: 'Substitua por "consulta inicial"' },
  { termo: 'aproveite', sugestao: 'Use linguagem institucional' },
  { termo: 'compre agora', sugestao: 'Remova completamente' },
  { termo: 'oferta', sugestao: 'Remova - tom comercial' },
  { termo: 'resultado certo', sugestao: 'Remova - promessa proibida' },
  { termo: 'nunca perde', sugestao: 'Remova completamente' },
  { termo: 'sempre ganha', sugestao: 'Remova completamente' },
];

// Termos mercantilistas (acumulativos)
const TERMOS_MERCANTILISTAS = [
  'compre', 'adquira', 'aproveite', 'não perca', 'última chance',
  'imperdível', 'promoção', 'desconto', 'barato', 'preço'
];

// Fontes jurídicas válidas
const FONTES_JURIDICAS = [
  'cdc', 'código de defesa do consumidor', 'lei', 'artigo', 'art.',
  'código', 'jurisprudência', 'stj', 'stf', 'tribunal', 'súmula',
  'decreto', 'constituição', 'cf/88', 'clt', 'cc', 'cp', 'cpp', 'cpc'
];

export function validateComplianceOAB(text: string): ComplianceResult {
  const problems: ComplianceProblem[] = [];
  const warnings: string[] = [];
  const textLower = text.toLowerCase();
  
  // Verificar termos proibidos
  for (const { termo, sugestao } of TERMOS_PROIBIDOS_OAB) {
    if (textLower.includes(termo)) {
      problems.push({
        type: 'error',
        term: termo,
        message: `Termo proibido detectado: "${termo}"`,
        suggestion: sugestao,
        article: 'OAB Res. 02/2015, Art. 5º'
      });
    }
  }
  
  // Verificar tom mercantilista (acumulativo)
  const countMercantil = TERMOS_MERCANTILISTAS.filter(t => textLower.includes(t)).length;
  if (countMercantil > 2) {
    problems.push({
      type: 'warning',
      term: 'múltiplos termos comerciais',
      message: `Tom excessivamente mercantilista (${countMercantil} termos detectados)`,
      suggestion: 'Revise para linguagem institucional/educacional',
      article: 'OAB Res. 02/2015, Art. 5º'
    });
  }
  
  // Verificar presença de fontes jurídicas (recomendação)
  const temFonte = FONTES_JURIDICAS.some(f => textLower.includes(f));
  if (!temFonte && text.length > 500) {
    warnings.push('Recomendado: Cite fontes jurídicas para maior credibilidade (E-E-A-T)');
  }
  
  // Verificar CTA agressivo
  const ctaAgressivos = ['ligue agora', 'contrate já', 'não perca tempo'];
  for (const cta of ctaAgressivos) {
    if (textLower.includes(cta)) {
      problems.push({
        type: 'warning',
        term: cta,
        message: `CTA potencialmente agressivo: "${cta}"`,
        suggestion: 'Use: "Consulte um advogado especializado"'
      });
    }
  }
  
  // Calcular score (100 = perfeito)
  const errorCount = problems.filter(p => p.type === 'error').length;
  const warningCount = problems.filter(p => p.type === 'warning').length;
  const score = Math.max(0, 100 - (errorCount * 25) - (warningCount * 10));
  
  return {
    isCompliant: errorCount === 0,
    score,
    problems,
    warnings
  };
}

// ==================== SEO SCORES ====================

interface SEOScoreResult {
  total: number;
  level: 'excellent' | 'good' | 'needs_work' | 'poor';
  details: SEODetail[];
  suggestions: string[];
}

interface SEODetail {
  name: string;
  score: number;
  maxScore: number;
  status: 'pass' | 'warning' | 'fail';
  message?: string;
}

interface ArticleData {
  title?: string;
  metaDescription?: string;
  content?: string;
  keyword?: string;
  slug?: string;
}

export function calculateSEOScore(article: ArticleData): SEOScoreResult {
  const details: SEODetail[] = [];
  const suggestions: string[] = [];
  let total = 0;
  
  const keyword = (article.keyword || '').toLowerCase();
  const title = article.title || '';
  const meta = article.metaDescription || '';
  const content = article.content || '';
  const contentLower = content.toLowerCase();
  
  // 1. Título (15 pontos)
  let titleScore = 0;
  if (title.length >= 50 && title.length <= 70) {
    titleScore += 5;
  } else if (title.length > 0) {
    suggestions.push(`Título deve ter 50-70 caracteres (atual: ${title.length})`);
  }
  
  if (keyword && title.toLowerCase().includes(keyword)) {
    titleScore += 10;
  } else if (keyword) {
    suggestions.push('Inclua a palavra-chave principal no título');
  }
  
  details.push({
    name: 'Título',
    score: titleScore,
    maxScore: 15,
    status: titleScore >= 12 ? 'pass' : titleScore >= 7 ? 'warning' : 'fail'
  });
  total += titleScore;
  
  // 2. Meta Description (10 pontos)
  let metaScore = 0;
  if (meta.length >= 145 && meta.length <= 165) {
    metaScore += 5;
  } else if (meta.length > 0) {
    suggestions.push(`Meta description deve ter 145-165 caracteres (atual: ${meta.length})`);
  }
  
  if (keyword && meta.toLowerCase().includes(keyword)) {
    metaScore += 5;
  } else if (keyword && meta.length > 0) {
    suggestions.push('Inclua a palavra-chave na meta description');
  }
  
  details.push({
    name: 'Meta Description',
    score: metaScore,
    maxScore: 10,
    status: metaScore >= 8 ? 'pass' : metaScore >= 5 ? 'warning' : 'fail'
  });
  total += metaScore;
  
  // 3. H1 único (5 pontos)
  const h1Count = (content.match(/<h1[\s>]/gi) || []).length;
  const h1Score = h1Count === 1 ? 5 : 0;
  if (h1Count !== 1) {
    suggestions.push(h1Count === 0 ? 'Adicione um H1 ao conteúdo' : 'Deve haver apenas um H1');
  }
  
  details.push({
    name: 'H1 Único',
    score: h1Score,
    maxScore: 5,
    status: h1Score === 5 ? 'pass' : 'fail'
  });
  total += h1Score;
  
  // 4. H2 headings (15 pontos)
  const h2Count = (content.match(/<h2[\s>]/gi) || []).length;
  let h2Score = 0;
  if (h2Count >= 3 && h2Count <= 6) {
    h2Score = 15;
  } else if (h2Count > 0) {
    h2Score = 7;
    suggestions.push(`Ideal: 3-6 seções H2 (atual: ${h2Count})`);
  } else {
    suggestions.push('Adicione seções H2 para estruturar o conteúdo');
  }
  
  details.push({
    name: 'Estrutura H2',
    score: h2Score,
    maxScore: 15,
    status: h2Score >= 12 ? 'pass' : h2Score >= 7 ? 'warning' : 'fail'
  });
  total += h2Score;
  
  // 5. Parágrafos curtos (10 pontos)
  const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const shortParagraphs = paragraphs.filter(p => {
    const text = p.replace(/<[^>]+>/g, '');
    const lines = text.split('\n').filter(l => l.trim()).length;
    return lines <= 4;
  }).length;
  
  const paragraphRatio = paragraphs.length > 0 ? shortParagraphs / paragraphs.length : 0;
  const paragraphScore = paragraphRatio >= 0.8 ? 10 : paragraphRatio >= 0.5 ? 5 : 0;
  
  if (paragraphScore < 10) {
    suggestions.push('Parágrafos devem ter no máximo 4 linhas (mobile-first)');
  }
  
  details.push({
    name: 'Parágrafos Curtos',
    score: paragraphScore,
    maxScore: 10,
    status: paragraphScore >= 8 ? 'pass' : paragraphScore >= 5 ? 'warning' : 'fail'
  });
  total += paragraphScore;
  
  // 6. Imagens com alt (10 pontos)
  const imgCount = (content.match(/<img/gi) || []).length;
  const altCount = (content.match(/alt=["'][^"']+["']/gi) || []).length;
  const imgScore = imgCount > 0 && imgCount === altCount ? 10 : imgCount > 0 ? 5 : 0;
  
  if (imgCount === 0) {
    suggestions.push('Adicione imagens ao conteúdo');
  } else if (imgCount !== altCount) {
    suggestions.push('Todas as imagens devem ter atributo alt');
  }
  
  details.push({
    name: 'Imagens com Alt',
    score: imgScore,
    maxScore: 10,
    status: imgScore >= 8 ? 'pass' : imgScore >= 5 ? 'warning' : 'fail'
  });
  total += imgScore;
  
  // 7. Links internos (10 pontos)
  const internalLinks = (content.match(/href=["'][^"']*(?:rdm|internal)/gi) || []).length;
  const linkScore = internalLinks >= 2 ? 10 : internalLinks === 1 ? 5 : 0;
  
  if (internalLinks < 2) {
    suggestions.push('Adicione 2-3 links internos para artigos relacionados');
  }
  
  details.push({
    name: 'Links Internos',
    score: linkScore,
    maxScore: 10,
    status: linkScore >= 8 ? 'pass' : linkScore >= 5 ? 'warning' : 'fail'
  });
  total += linkScore;
  
  // 8. Links externos (10 pontos)
  const externalLinks = (content.match(/href=["']https?:\/\/(?!.*rdm)/gi) || []).length;
  const extLinkScore = externalLinks >= 1 ? 10 : 0;
  
  if (externalLinks === 0) {
    suggestions.push('Adicione 1-2 links externos para fontes autoritativas');
  }
  
  details.push({
    name: 'Links Externos',
    score: extLinkScore,
    maxScore: 10,
    status: extLinkScore >= 8 ? 'pass' : 'fail'
  });
  total += extLinkScore;
  
  // 9. FAQ presente (10 pontos)
  const hasFAQ = contentLower.includes('faq') || 
                 contentLower.includes('perguntas frequentes') ||
                 contentLower.includes('dúvidas comuns');
  const faqScore = hasFAQ ? 10 : 0;
  
  if (!hasFAQ) {
    suggestions.push('Adicione seção de FAQ para Featured Snippets');
  }
  
  details.push({
    name: 'FAQ',
    score: faqScore,
    maxScore: 10,
    status: faqScore === 10 ? 'pass' : 'fail'
  });
  total += faqScore;
  
  // Determinar nível
  let level: SEOScoreResult['level'];
  if (total >= 85) level = 'excellent';
  else if (total >= 70) level = 'good';
  else if (total >= 50) level = 'needs_work';
  else level = 'poor';
  
  return {
    total,
    level,
    details,
    suggestions: suggestions.slice(0, 5) // Top 5 suggestions
  };
}

// ==================== READABILITY (Flesch) ====================

interface ReadabilityResult {
  fleschScore: number;
  level: string;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  isEasyToRead: boolean;
}

export function calculateReadability(text: string): ReadabilityResult {
  // Remove HTML tags
  const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Count words
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Count sentences (approximate)
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);
  
  // Count syllables (Portuguese approximation)
  const syllableCount = words.reduce((total, word) => {
    return total + countSyllablesPortuguese(word);
  }, 0);
  
  // Flesch Reading Ease (adapted for Portuguese)
  // Formula: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / Math.max(wordCount, 1);
  
  const fleschScore = Math.round(
    206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord)
  );
  
  // Clamp between 0-100
  const normalizedScore = Math.max(0, Math.min(100, fleschScore));
  
  // Determine level
  let level: string;
  if (normalizedScore >= 80) level = 'Muito Fácil';
  else if (normalizedScore >= 70) level = 'Fácil';
  else if (normalizedScore >= 60) level = 'Médio';
  else if (normalizedScore >= 50) level = 'Difícil';
  else level = 'Muito Difícil';
  
  return {
    fleschScore: normalizedScore,
    level,
    wordCount,
    sentenceCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    isEasyToRead: normalizedScore >= 60
  };
}

function countSyllablesPortuguese(word: string): number {
  // Simplified syllable counting for Portuguese
  const vowels = 'aeiouáéíóúâêîôûãõàè';
  const wordLower = word.toLowerCase();
  
  let count = 0;
  let prevWasVowel = false;
  
  for (const char of wordLower) {
    const isVowel = vowels.includes(char);
    if (isVowel && !prevWasVowel) {
      count++;
    }
    prevWasVowel = isVowel;
  }
  
  return Math.max(count, 1);
}

// ==================== KEYWORD ANALYSIS ====================

interface KeywordAnalysis {
  density: number;
  count: number;
  positions: string[];
  lsiKeywords: string[];
  isOptimal: boolean;
}

export function analyzeKeyword(content: string, keyword: string): KeywordAnalysis {
  const cleanContent = content.replace(/<[^>]+>/g, ' ').toLowerCase();
  const keywordLower = keyword.toLowerCase();
  
  // Count occurrences
  const regex = new RegExp(keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = cleanContent.match(regex) || [];
  const count = matches.length;
  
  // Calculate density
  const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;
  const keywordWords = keywordLower.split(/\s+/).length;
  const density = Math.round((count * keywordWords / wordCount) * 100 * 10) / 10;
  
  // Find positions
  const positions: string[] = [];
  
  // Check title (H1)
  if (content.toLowerCase().match(/<h1[^>]*>.*?{keyword.toLowerCase()}.*?<\/h1>/i)) {
    positions.push('H1');
  }
  
  // Check first paragraph
  const firstP = content.match(/<p[^>]*>[\s\S]*?<\/p>/i);
  if (firstP && firstP[0].toLowerCase().includes(keywordLower)) {
    positions.push('Primeiro Parágrafo');
  }
  
  // Check H2s
  const h2s = content.match(/<h2[^>]*>[\s\S]*?<\/h2>/gi) || [];
  const h2WithKw = h2s.filter(h2 => h2.toLowerCase().includes(keywordLower));
  if (h2WithKw.length > 0) {
    positions.push(`H2 (${h2WithKw.length}x)`);
  }
  
  // Generate LSI keywords (basic)
  const lsiKeywords = generateLSIKeywords(keyword);
  
  // Optimal density is 1-2%
  const isOptimal = density >= 0.5 && density <= 2.5;
  
  return {
    density,
    count,
    positions,
    lsiKeywords,
    isOptimal
  };
}

function generateLSIKeywords(keyword: string): string[] {
  // Basic LSI generation - in production, use API
  const words = keyword.toLowerCase().split(/\s+/);
  const variations: string[] = [];
  
  // Add variations
  if (words.length >= 2) {
    variations.push(words.reverse().join(' ')); // Reverse order
    variations.push(words[0]); // First word alone
    variations.push(words[words.length - 1]); // Last word alone
  }
  
  // Add common suffixes
  variations.push(`${keyword} como funciona`);
  variations.push(`${keyword} o que é`);
  variations.push(`${keyword} guia`);
  variations.push(`como ${keyword}`);
  
  return variations.slice(0, 5);
}

// ==================== CONTENT QUALITY ====================

interface ContentQuality {
  score: number;
  level: 'excellent' | 'good' | 'needs_work' | 'poor';
  checks: QualityCheck[];
}

interface QualityCheck {
  name: string;
  passed: boolean;
  message: string;
}

export function assessContentQuality(content: string, minWords: number = 800): ContentQuality {
  const checks: QualityCheck[] = [];
  let score = 0;
  
  const cleanContent = content.replace(/<[^>]+>/g, ' ');
  const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;
  
  // 1. Word count (20 pontos)
  if (wordCount >= minWords) {
    checks.push({ name: 'Tamanho do Conteúdo', passed: true, message: `${wordCount} palavras (mín: ${minWords})` });
    score += 20;
  } else {
    checks.push({ name: 'Tamanho do Conteúdo', passed: false, message: `${wordCount}/${minWords} palavras` });
  }
  
  // 2. Structure (20 pontos)
  const hasH2 = /<h2/i.test(content);
  const hasH3 = /<h3/i.test(content);
  if (hasH2 && hasH3) {
    checks.push({ name: 'Estrutura Hierárquica', passed: true, message: 'H2 e H3 presentes' });
    score += 20;
  } else if (hasH2) {
    checks.push({ name: 'Estrutura Hierárquica', passed: true, message: 'H2 presente, considere adicionar H3' });
    score += 15;
  } else {
    checks.push({ name: 'Estrutura Hierárquica', passed: false, message: 'Adicione seções H2/H3' });
  }
  
  // 3. Lists (15 pontos)
  const hasLists = /<[ou]l/i.test(content);
  if (hasLists) {
    checks.push({ name: 'Listas', passed: true, message: 'Listas presentes' });
    score += 15;
  } else {
    checks.push({ name: 'Listas', passed: false, message: 'Considere adicionar listas para escaneabilidade' });
  }
  
  // 4. Conclusion (15 pontos)
  const hasConclusion = /conclus[ãa]o|considerações finais|resumo|em suma/i.test(cleanContent);
  if (hasConclusion) {
    checks.push({ name: 'Conclusão', passed: true, message: 'Conclusão presente' });
    score += 15;
  } else {
    checks.push({ name: 'Conclusão', passed: false, message: 'Adicione uma conclusão clara' });
  }
  
  // 5. CTA (15 pontos)
  const hasCTA = /consulte|entre em contato|saiba mais|fale conosco/i.test(cleanContent);
  if (hasCTA) {
    checks.push({ name: 'Call to Action', passed: true, message: 'CTA presente' });
    score += 15;
  } else {
    checks.push({ name: 'Call to Action', passed: false, message: 'Adicione um CTA suave' });
  }
  
  // 6. No spelling issues (15 pontos) - basic check
  const hasBasicIssues = /  {2,}|[.]{3,}|[!]{2,}|[?]{2,}/g.test(cleanContent);
  if (!hasBasicIssues) {
    checks.push({ name: 'Formatação', passed: true, message: 'Formatação OK' });
    score += 15;
  } else {
    checks.push({ name: 'Formatação', passed: false, message: 'Revise espaços e pontuação duplicados' });
  }
  
  // Determine level
  let level: ContentQuality['level'];
  if (score >= 85) level = 'excellent';
  else if (score >= 70) level = 'good';
  else if (score >= 50) level = 'needs_work';
  else level = 'poor';
  
  return { score, level, checks };
}

// ==================== EXPORT ALL ====================

export type {
  ComplianceResult,
  ComplianceProblem,
  SEOScoreResult,
  SEODetail,
  ReadabilityResult,
  KeywordAnalysis,
  ContentQuality,
  QualityCheck
};
