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
  if (PREPOSITION_TAIL.test(title)) push('title_truncated', 'Título termina em preposição ou artigo (pauta truncada)');
  if (LEGAL_MISSPELLINGS.test(fold(title))) push('title_misspelling', 'Título com grafia errada de termo jurídico (palavra-chave crua)');
  if (title.split(' ').length < 3) push('title_keyword_only', 'Título com menos de três palavras');

  return { issues, normalizedTitle: sentenceCaseTitle(title) };
}

// Provimento 205/2021 CFOAB — regras que reprovam publicidade de advocacia.
const COMPLIANCE_RULES: Array<{ code: string; label: string; pattern: RegExp; skipInQuestion?: boolean }> = [
  {
    code: 'promessa_resultado',
    label: 'Promessa ou garantia de resultado',
    pattern: /(garantimos|garantia de (?:resultado|exito|sucesso|vitoria|absolvicao|liberdade|aprovacao)|resultado garantido|sucesso garantido|vitoria garantida|absolvicao garantida|liberdade garantida|ganhe (?:a|sua) causa|certeza de (?:absolvicao|vitoria|exito)|100% de (?:exito|sucesso|chance|aprovacao)|(?:exito|sucesso|vitoria) (?:e )?garantid[oa])/,
    skipInQuestion: true,
  },
  {
    code: 'superlativo',
    label: 'Superlativo ou autotitulação',
    pattern: /((?:o|a|os|as) (?:melhor(?:es)?|maior(?:es)?) (?:advogad|escritorio|banca|profission|equipe|especialist)|melhor advogad|melhor escritorio|lider (?:de mercado|em direito|no mercado)|n(?:o|umero) ?1 (?:em|do|da)|referencia nacional|o mais (?:renomado|experiente|qualificado|premiado)|advogad[oa] mais (?:renomad|experient|qualificad))/,
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

export function findComplianceViolations(input: { title?: string | null; content?: string | null; excerpt?: string | null }): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const fields: Array<['title' | 'content', string]> = [
    ['title', fold(String(input.title || ''))],
    ['content', fold(stripTags(String(input.content || '') + ' ' + String(input.excerpt || '')))],
  ];
  for (const [field, text] of fields) {
    if (!text) continue;
    for (const rule of COMPLIANCE_RULES) {
      const re = new RegExp(rule.pattern.source, 'g');
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) {
        const sentence = sentenceAround(text, match.index);
        if (rule.skipInQuestion && sentence.trim().endsWith('?')) continue;
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
