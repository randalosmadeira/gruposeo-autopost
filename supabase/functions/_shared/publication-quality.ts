// Portões de qualidade editorial aplicados antes de qualquer publicação no WordPress.
// Fail-closed: cada função devolve a lista de problemas encontrados; lista vazia = aprovado.
// Origem das regras: limpeza do blog RDM em 2026-09-12 (54 duplicatas por slug, 9 títulos que eram a
// palavra-chave digitada errado, CTAs com link do Google Maps no lugar do WhatsApp) e o portão
// Provimento 205/2021 CFOAB usado na fase 16 do NEXUX.

export type QualityIssue = {
  code: string;
  label: string;
  field: 'title' | 'content' | 'slug';
  sample?: string;
};

export type TitleQualityResult = {
  issues: QualityIssue[];
  normalizedTitle: string;
};

const PREPOSITION_TAIL = /\b(?:de|da|do|das|dos|e|em|para|com|a|o|os|as|que|por|ao|na|no|nas|nos|um|uma|se|sem|sob|sobre)$/i;
const MARKUP_ARTIFACT = /^(?:#|\s*(?:title|t[ií]tulo|h1)\s*[:=])|[{}[\]]|\bexemplo de t[ií]tulo\b/i;
// Grafias erradas de termos jurídicos que chegaram ao ar como título (palavra-chave crua).
const LEGAL_MISSPELLINGS = /\b(?:habias|habes|abeas|aveas|hab[ei]as\s+cop[uo]s|habeas\s+corpos|habeas\s+copus|custoza|custodi|tornoseleira|tornozeleria|advogodo|liberdade\s+provisoria\s+fian[cç]a\s+reu)\b/i;

function stripTags(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
}

function fold(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function sentenceCaseTitle(title: string) {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (!clean) return clean;
  if (/\p{Lu}/u.test(clean)) return clean;
  return clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1);
}

/** Correções ortográficas seguras observadas na fila histórica do Blog RDM. */
export function repairCommonTitleTypos(rawTitle: string | null | undefined) {
  return sentenceCaseTitle(String(rawTitle || "")
    .replace(/\btornozelera\b/gi, "tornozeleira")
    .replace(/\btornoseleira\b/gi, "tornozeleira")
    .replace(/\beletronica\b/gi, "eletrônica")
    .replace(/^omo\s+saber\b/i, "Como saber")
    .replace(/\bta\s+preso\b/gi, "está preso")
    .replace(/\s+/g, " ")
    .trim());
}

export function evaluateTitleQuality(rawTitle: string | null | undefined): TitleQualityResult {
  const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
  const issues: QualityIssue[] = [];
  const push = (code: string, label: string) => issues.push({ code, label, field: 'title', sample: title.slice(0, 120) });

  if (!title) {
    push('title_missing', 'Título ausente');
    return { issues, normalizedTitle: title };
  }
  if (title.length < 18) push('title_too_short', 'Título curto demais para uma pauta editorial');
  if (MARKUP_ARTIFACT.test(title)) push('title_artifact_markup', 'Título contém marcação técnica ou molde de prompt');
  // O teste roda no título sem acentos: em JavaScript \b trata "ã", "ç" e "ú" como fim de palavra, e
  // "infiltração", "receptação" ou "saúde" eram lidos como terminados no artigo "o" ou na preposição "de".
  if (PREPOSITION_TAIL.test(fold(title))) push('title_truncated', 'Título termina em preposição ou artigo (pauta truncada)');
  if (LEGAL_MISSPELLINGS.test(fold(title))) push('title_misspelling', 'Título com grafia errada de termo jurídico (palavra-chave crua)');
  if (title.split(' ').length < 3 && title.length < 18) push('title_keyword_only', 'Título curto demais e com menos de três palavras');

  return { issues, normalizedTitle: sentenceCaseTitle(title) };
}

// Provimento 205/2021 CFOAB — regras que reprovam publicidade de advocacia.
const COMPLIANCE_RULES: Array<{ code: string; label: string; pattern: RegExp; skipInQuestion?: boolean; skipWhenNegated?: boolean; needsLegalContext?: boolean }> = [
  {
    code: 'promessa_resultado',
    label: 'Promessa ou garantia de resultado',
    pattern: /(garantimos|garantia de (?:resultado|exito|sucesso|vitoria|absolvicao|liberdade|aprovacao)|resultado garantido|sucesso garantido|vitoria garantida|absolvicao garantida|liberdade garantida|ganhe (?:a|sua) causa|certeza de (?:absolvicao|vitoria|exito)|100% de (?:exito|sucesso|chance|aprovacao)|(?:exito|sucesso|vitoria) (?:e )?garantid[oa])/,
    skipInQuestion: true,
    skipWhenNegated: true,
  },
  {
    code: 'superlativo',
    label: 'Superlativo ou autotitulação',
    pattern: /((?:o|a|os|as) (?:melhor(?:es)?|maior(?:es)?) (?:advogad|escritorio|banca)|melhor advogad|melhor escritorio|advogad[oa] mais (?:renomad|experient|qualificad))/,
  },
  {
    // Expressões que também aparecem em notícia comum ("as maiores equipes do campeonato", "Bolsa
    // Família, referência nacional em assistência social"). Só reprovam quando a mesma oração fala de
    // advocacia, do escritório ou em primeira pessoa.
    code: 'superlativo',
    label: 'Superlativo ou autotitulação',
    pattern: /((?:o|a|os|as) (?:melhor(?:es)?|maior(?:es)?) (?:profission|equipe|especialist)|lider (?:de mercado|em direito|no mercado)|n(?:o|umero) ?1 (?:em|do|da)|referencia nacional|o mais (?:renomado|experiente|qualificado|premiado))/,
    needsLegalContext: true,
  },
  {
    code: 'comparacao',
    label: 'Comparação com outros escritórios',
    pattern: /(diferente d(?:os|as) (?:outros|demais) (?:advogados|escritorios)|melhor que (?:outros|os demais|a concorrencia)|ao contrario de outros (?:advogados|escritorios)|(?:outros|demais) escritorios nao)/,
  },
  {
    code: 'urgencia_comercial',
    label: 'Urgência comercial ou gratuidade como isca',
    pattern: /(nao perca (?:tempo|essa chance|esta oportunidade|mais tempo)|ultima chance|oferta (?:especial|imperdivel)|vagas limitadas|(?:consulta|atendimento|avaliacao|analise) (?:inicial )?(?:gratuit[oa]|gratis|sem custo)|primeira consulta (?:gratuita|gratis)|orcamento gratis|promocao de honorarios|desconto nos honorarios)/,
  },
  {
    code: 'apelo_desespero',
    label: 'Apelo ao desespero como gatilho de contato',
    pattern: /(esta desesperad[oa]|em desespero|em panico|desesperad[oa] com)[^.]{0,80}(fale|entre em contato|whatsapp|ligue|chame|conte com)/,
  },
  {
    code: 'captacao_direta',
    label: 'Captação direta de clientela',
    pattern: /(ligue agora|chame (?:agora )?no whatsapp|clique aqui e fale|fale agora com|contrate (?:agora|ja)|entre em contato agora|mande (?:um )?whatsapp)/,
  },
];

function sentenceAround(text: string, index: number) {
  const start = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('?', index), text.lastIndexOf('!', index)) + 1;
  const ends = [text.indexOf('.', index), text.indexOf('?', index), text.indexOf('!', index)].filter((v) => v >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end);
}

// O texto que NEGA a promessa ("não há garantia de resultado", "nem de sucesso garantido") ou que trata
// a promessa como objeto de análise ("anúncios que possam sugerir garantia de resultado", "cláusula de
// garantia de resultado") é o aviso correto, não a infração. A negação precisa estar na mesma oração,
// nos 45 caracteres anteriores, sem dois-pontos, ponto e vírgula ou travessão no meio.
const NEGATION_LEAD = /(?:\bnao\b|\bnem\b|\bsem\b|\bnunca\b|\bjamais\b|\binexiste\b|\bnenhuma?\b|\bveda(?:m|d[oa]s?|cao)?\b|\bproib(?:e|em|id[oa]s?|icao)\b|\bsuger(?:ir|e|em)\b|\bclausula de\b)/;

// A oração que classifica a promessa como infração ("a oferta de garantia de resultado é considerada
// infração ética") também é o aviso correto.
const CONDEMNATION_TAIL = /^[^.!?]{0,60}(?:(?:e|sao) considerad[oa]s? (?:infracao|ilegal|irregular|abusiv|enganos|crime)|configura(?:m)? (?:infracao|publicidade enganosa|crime)|(?:e|sao) (?:vedad|proibid)[oa]s?|nao (?:e|sao) permitid[oa]s?)/;

function isNegatedPromise(text: string, index: number, matchLength: number) {
  const sentenceStart = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('?', index - 1), text.lastIndexOf('!', index - 1)) + 1;
  const lead = text.slice(Math.max(sentenceStart, index - 45), index).split(/[:;—–]/).pop() || '';
  if (NEGATION_LEAD.test(lead)) return true;
  return CONDEMNATION_TAIL.test(text.slice(index + matchLength, index + matchLength + 130));
}

const LEGAL_CONTEXT = /(?:advogad|advocacia|escritorio|\bbanca\b|juridic|\bdireito\b|\bnoss[oa]s?\b|\bsomos\b)/;

// Primeira palavra distintiva do nome do escritório/empresa ("RDM Advogados Associados" -> "rdm").
function brandToken(brand: string | null | undefined) {
  const generic = new Set(['advogados', 'advogado', 'advocacia', 'associados', 'escritorio', 'sociedade', 'grupo', 'blog', 'portal']);
  return fold(String(brand || '')).split(' ').find((word) => word.length >= 3 && !generic.has(word)) || '';
}

export function findComplianceViolations(input: { title?: string | null; content?: string | null; excerpt?: string | null; brand?: string | null }): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const brand = brandToken(input.brand);
  const fields: Array<['title' | 'content', string]> = [
    ['title', fold(String(input.title || ''))],
    ['content', fold(stripTags(String(input.content || '') + ' ' + String(input.excerpt || '')))],
  ];
  for (const [field, text] of fields) {
    if (!text) continue;
    for (const rule of COMPLIANCE_RULES) {
      if (issues.some((issue) => issue.code === rule.code && issue.field === field)) continue;
      const re = new RegExp(rule.pattern.source, 'g');
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const sentence = sentenceAround(text, match.index);
        if (rule.skipInQuestion && sentence.trim().endsWith('?')) continue;
        if (rule.skipWhenNegated && isNegatedPromise(text, match.index, match[0].length)) continue;
        if (rule.needsLegalContext && !LEGAL_CONTEXT.test(sentence) && !(brand && sentence.split(/[^a-z0-9]+/).includes(brand))) continue;
        issues.push({ code: rule.code, label: rule.label, field, sample: sentence.trim().slice(0, 160) });
        break;
      }
    }
  }
  return issues;
}

// CTAs quebradas: "WhatsApp [aqui](https://www.google.com/maps...)", "[](...)", "WhatsApp ()", "WhatsApp para ."
const BROKEN_CTA_RULES: Array<{ code: string; label: string; pattern: RegExp }> = [
  { code: 'cta_maps_as_contact', label: 'Link de contato apontando para o Google Maps', pattern: /(?:whatsapp|telefone|contato|fale|ligue)[^\n\]]{0,80}\[[^\]]*\]\((?:https?:\/\/)?(?:www\.)?google\.[a-z.]+\/maps[^)]*\)/i },
  { code: 'cta_maps_href', label: 'Âncora de contato com href do Google Maps', pattern: /<a[^>]+href="(?:https?:\/\/)?(?:www\.)?google\.[a-z.]+\/maps[^"]*"[^>]*>[^<]*(?:whatsapp|clique aqui|fale conosco|contato)[^<]*<\/a>/i },
  { code: 'cta_empty_link_text', label: 'Link markdown sem texto', pattern: /\[\s*\]\((?:https?:\/\/|mailto:|tel:)[^)]*\)/i },
  { code: 'cta_empty_whatsapp', label: 'Menção a WhatsApp sem número ou link', pattern: /whatsapp\s*(?:\(\s*\)|para\s*\.|:\s*\.|de plant[aã]o:\s*(?:\.|<|$)|de atendimento[^.:]{0,40}:\s*\.)/i },
];

export function findBrokenContactCtas(content: string | null | undefined): QualityIssue[] {
  const text = String(content || '');
  const issues: QualityIssue[] = [];
  for (const rule of BROKEN_CTA_RULES) {
    const match = rule.pattern.exec(text);
    if (match) issues.push({ code: rule.code, label: rule.label, field: 'content', sample: match[0].slice(0, 160) });
  }
  return issues;
}

export function repairBrokenContactCtas(content: string | null | undefined, whatsappNumber: string | null | undefined) {
  const original = String(content || '');
  const digits = String(whatsappNumber || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return { content: original, repaired: false };

  const whatsappUrl = `https://wa.me/${digits}`;
  let repaired = original.replace(
    /((?:whatsapp|telefone|contato|fale|ligue)[^\n\]]{0,80}\[[^\]]*\]\()(?:https?:\/\/)?(?:www\.)?google\.[a-z.]+\/maps[^)]*(\))/gi,
    `$1${whatsappUrl}$2`,
  );
  repaired = repaired.replace(
    /(<a[^>]+href=")(?:https?:\/\/)?(?:www\.)?google\.[a-z.]+\/maps[^"]*("[^>]*>[^<]*(?:whatsapp|clique aqui|fale conosco|contato)[^<]*<\/a>)/gi,
    `$1${whatsappUrl}$2`,
  );
  repaired = repaired
    .replace(/whatsapp\s*\(\s*\)/gi, `<a href="${whatsappUrl}">WhatsApp</a>`)
    .replace(/whatsapp\s+para\s*\./gi, `WhatsApp: <a href="${whatsappUrl}">iniciar conversa</a>.`);
  return { content: repaired, repaired: repaired !== original };
}

// Captação direta escrita pelo próprio redator ("Fale agora com um especialista e não fique no
// prejuízo"). O reparo troca a ORAÇÃO inteira da chamada por um convite sóbrio e mantém o link de
// contato, de modo que o resto da frase (urgência, medo, "sem compromisso") sai junto. Quando a oração
// não pode ser delimitada com segurança, troca só o gatilho. O portão roda depois: o que sobrar, bloqueia.
const SOLICITATION_TRIGGER_SOURCE = '(?:fale\\s+agora\\s+com|ligue\\s+agora|chame\\s+(?:agora\\s+)?no\\s+whatsapp|clique\\s+aqui\\s+e\\s+fale|contrate\\s+(?:agora|j[aá])|entre\\s+em\\s+contato\\s+agora|mande\\s+(?:um\\s+)?whatsapp)';
const INLINE_TAGS = new Set(['a', 'strong', 'em', 'b', 'i', 'u', 'span', 'mark', 'small']);
const MARKDOWN_BLOCK_LINE = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>)/;
const SEGMENT_BACK_LIMIT = 320;
const SEGMENT_FORWARD_LIMIT = 420;
const MAX_SOLICITATION_REPAIRS = 12;

function tagNameAt(html: string, open: number) {
  const match = /^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(open, open + 40));
  return match ? match[1].toLowerCase() : '';
}

function lineBefore(html: string, newlineIndex: number) {
  return html.slice(html.lastIndexOf('\n', newlineIndex - 1) + 1, newlineIndex);
}

function lineAfter(html: string, newlineIndex: number) {
  const next = html.indexOf('\n', newlineIndex + 1);
  return html.slice(newlineIndex + 1, next < 0 ? html.length : next);
}

function isBlockBreak(html: string, newlineIndex: number) {
  const before = lineBefore(html, newlineIndex);
  const after = lineAfter(html, newlineIndex);
  return !before.trim() || !after.trim() || MARKDOWN_BLOCK_LINE.test(before) || MARKDOWN_BLOCK_LINE.test(after);
}

// Devolve -1 quando o início da oração não aparece dentro do limite (o chamador troca só o gatilho).
function solicitationSegmentStart(html: string, index: number) {
  let i = index - 1;
  while (i >= 0) {
    if (index - i > SEGMENT_BACK_LIMIT) return -1;
    const ch = html[i];
    if (ch === '>') {
      const open = html.lastIndexOf('<', i);
      if (open < 0 || !INLINE_TAGS.has(tagNameAt(html, open))) return i + 1;
      i = open - 1;
      continue;
    }
    if (ch === '\n' && isBlockBreak(html, i)) return i + 1;
    if ((ch === '.' || ch === '!' || ch === '?') && /[\s<]/.test(html[i + 1] || '')) return i + 1;
    i -= 1;
  }
  return 0;
}

// Devolve -1 quando o fim da oração não aparece dentro do limite.
function solicitationSegmentEnd(html: string, index: number) {
  let i = index;
  while (i < html.length) {
    if (i - index > SEGMENT_FORWARD_LIMIT) return -1;
    const ch = html[i];
    if (ch === '<') {
      const close = html.indexOf('>', i);
      if (close < 0 || !INLINE_TAGS.has(tagNameAt(html, i))) return i;
      i = close + 1;
      continue;
    }
    if (ch === ']' && html[i + 1] === '(') {
      const close = html.indexOf(')', i);
      if (close < 0) return i;
      i = close + 1;
      continue;
    }
    if (ch === '\n' && isBlockBreak(html, i)) return i;
    if ((ch === '.' || ch === '!' || ch === '?') && (i + 1 >= html.length || /[\s<]/.test(html[i + 1]))) {
      let end = i + 1;
      for (;;) {
        const closer = /^\s*<\/(?:a|strong|em|b|i|u|span|mark|small)\s*>/i.exec(html.slice(end, end + 40));
        if (!closer) break;
        end += closer[0].length;
      }
      return end;
    }
    i += 1;
  }
  return html.length;
}

// Marcações inline que o trecho abre sem fechar (ou fecha sem ter aberto) precisam continuar no HTML.
function unmatchedInlineTags(segment: string) {
  const closers: string[] = [];
  const stack: Array<{ name: string; raw: string }> = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(segment))) {
    const name = match[2].toLowerCase();
    if (!INLINE_TAGS.has(name)) continue;
    if (!match[1]) stack.push({ name, raw: match[0] });
    else if (stack.length && stack[stack.length - 1].name === name) stack.pop();
    else closers.push(match[0]);
  }
  return { closers: closers.join(''), openers: stack.map((tag) => tag.raw).join('') };
}

const CONTACT_HREF = /^(?:https?:\/\/(?:wa\.me|(?:api|web)\.whatsapp\.com)\/|tel:|mailto:)/i;

// Link do convite: o canal de contato que já estava na chamada; na falta dele, o WhatsApp do projeto
// (o redator às vezes aponta a chamada para a própria página ou para o Google Maps); por último, o
// primeiro link do trecho.
function soberCta(segment: string, whatsappUrl: string) {
  const htmlHrefs = [...segment.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)].map((match) => match[1]);
  const markdownHrefs = [...segment.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
  const usable = [...htmlHrefs, ...markdownHrefs].filter((href) => !/google\.[a-z.]+\/maps/i.test(href));
  const href = usable.find((candidate) => CONTACT_HREF.test(candidate)) || whatsappUrl || usable[0] || '';
  const label = /wa\.me|whatsapp/i.test(href) ? 'Converse com a nossa equipe pelo WhatsApp' : 'Converse com a nossa equipe';
  const period = /[.!?]\s*$/.test(segment.replace(/<[^>]+>/g, '')) ? '.' : '';
  if (!href) return `${label} para tirar dúvidas sobre a sua situação${period}`;
  if (!htmlHrefs.length && markdownHrefs.length) return `[${label}](${href})${period}`;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>${period}`;
}

function softenTrigger(trigger: string) {
  const folded = fold(trigger);
  const soft = folded.startsWith('fale agora com') ? 'Converse com'
    : folded.startsWith('ligue agora') ? 'Ligue'
    : folded.startsWith('chame') ? 'Converse pelo WhatsApp'
    : folded.startsWith('clique aqui e fale') ? 'Fale'
    : folded.startsWith('contrate') ? 'Conheça'
    : folded.startsWith('entre em contato agora') ? 'Entre em contato'
    : 'Envie uma mensagem pelo WhatsApp';
  const first = trigger.trim()[0] || '';
  return first && first === first.toLowerCase() ? soft[0].toLowerCase() + soft.slice(1) : soft;
}

export function repairSolicitationCtas(content: string | null | undefined, whatsappNumber?: string | null) {
  const digits = String(whatsappNumber || '').replace(/\D/g, '');
  const whatsappUrl = digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : '';
  let html = String(content || '');
  let repairs = 0;
  let from = 0;
  for (let guard = 0; guard < 60 && repairs < MAX_SOLICITATION_REPAIRS; guard += 1) {
    const re = new RegExp(SOLICITATION_TRIGGER_SOURCE, 'gi');
    re.lastIndex = from;
    const match = re.exec(html);
    if (!match) break;
    const triggerEnd = match.index + match[0].length;
    // Gatilho dentro de um atributo (title="…", alt="…") não é texto publicado: segue adiante.
    if (html.lastIndexOf('<', match.index) > html.lastIndexOf('>', match.index)) {
      from = triggerEnd;
      continue;
    }
    const end = solicitationSegmentEnd(html, triggerEnd);
    let start = solicitationSegmentStart(html, match.index);
    let replacement: string;
    let cutStart: number;
    let cutEnd: number;
    if (end < 0) {
      cutStart = match.index;
      cutEnd = triggerEnd;
      replacement = softenTrigger(match[0]);
    } else {
      if (start < 0) start = match.index;
      while (start < match.index && /\s/.test(html[start])) start += 1;
      // Outro link antes da chamada, na mesma oração ("Veja o <a>guia</a> e <a>fale agora…</a>"), é
      // conteúdo do artigo: o corte começa na âncora da chamada e o começo da oração fica.
      let midSentence = false;
      if (/<\/a\s*>/i.test(html.slice(start, match.index))) {
        const anchorOpen = html.lastIndexOf('<a', match.index);
        const anchorClose = html.toLowerCase().lastIndexOf('</a', match.index);
        start = anchorOpen > anchorClose && anchorOpen >= start ? anchorOpen : match.index;
        midSentence = true;
      }
      const segment = html.slice(start, end);
      const tags = unmatchedInlineTags(segment);
      const cta = soberCta(segment, whatsappUrl);
      cutStart = start;
      cutEnd = end;
      replacement = tags.closers + (midSentence ? cta.replace('Converse com', 'converse com') : cta) + tags.openers;
    }
    html = html.slice(0, cutStart) + replacement + html.slice(cutEnd);
    from = cutStart + replacement.length;
    repairs += 1;
  }
  return { content: html, repaired: repairs > 0, repairs };
}

export function normalizeSlugForLookup(slug: string | null | undefined, title?: string | null) {
  const base = String(slug || '').trim() || String(title || '').trim();
  return fold(base)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

export type DuplicateLookup = { exists: boolean; link?: string; id?: number; skipped?: boolean; reason?: string };

// Consulta pública do WordPress: existe post publicado com este slug? Usada para impedir a criação de
// "slug-2" quando o mesmo assunto já está no ar. Em erro de rede a checagem é ignorada (não bloqueia).
export async function lookupPublishedSlug(baseUrl: string, slug: string, timeoutMs = 8000): Promise<DuplicateLookup> {
  if (!slug) return { exists: false, skipped: true, reason: 'empty_slug' };
  const clean = String(baseUrl || '').replace(/\/$/, '');
  const urls = [
    `${clean}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&status=publish&_fields=id,link,slug`,
    `${clean}/?rest_route=/wp/v2/posts&slug=${encodeURIComponent(slug)}&status=publish&_fields=id,link,slug`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) continue;
      const data = await response.json();
      if (!Array.isArray(data)) continue;
      const hit = data.find((row) => row && typeof row === 'object' && String((row as Record<string, unknown>).slug || '') === slug);
      if (hit) return { exists: true, link: String((hit as Record<string, unknown>).link || ''), id: Number((hit as Record<string, unknown>).id || 0) };
      return { exists: false };
    } catch {
      continue;
    }
  }
  return { exists: false, skipped: true, reason: 'lookup_unavailable' };
}
