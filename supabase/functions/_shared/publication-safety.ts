export type PublicationSafetyInput = {
  title?: string | null;
  content?: string | null;
  excerpt?: string | null;
};

export type PublicationResidue = {
  code: string;
  label: string;
  field: 'title' | 'content' | 'excerpt';
};

type ResidueRule = {
  code: string;
  label: string;
  pattern: RegExp;
};

const RESIDUE_RULES: ResidueRule[] = [
  { code: 'electoral_draft_banner', label: 'Rascunho eleitoral interno', pattern: /RASCUNHO\s+ELEITORAL/i },
  { code: 'human_review_banner', label: 'Aviso interno de revisão humana', pattern: /REVIS[AÃ]O\s+HUMANA\s+OBRIGAT[ÓO]RIA/i },
  { code: 'editorial_target_notice', label: 'Aviso interno de alvo editorial', pattern: /ALVO\s+EDITORIAL\s+CONFIGURADO/i },
  { code: 'scaffold_notice', label: 'Scaffold editorial interno', pattern: /(?:este\s+)?scaffold\s+n[aã]o\s+representa\s+conte[uú]do\s+final/i },
  { code: 'replace_before_publish', label: 'Instrução interna pré-publicação', pattern: /antes\s+da\s+publica[cç][aã]o[^.]{0,180}substitua\s+esta\s+estrutura/i },
  { code: 'pending_review_token', label: 'Marcador interno de revisão pendente', pattern: /\[?PENDENTE\s+(?:DE\s+)?REVIS[AÃ]O\]?/i },
  { code: 'verify_primary_source', label: 'Marcador interno de fonte primária', pattern: /\[VERIFICAR\s+FONTE\s+PRIM[ÁA]RIA\]/i },
  { code: 'requery_external_source', label: 'Marcador interno de fonte externa', pattern: /\[RECONSULTAR\s+FONTE\s+EXTERNA\]/i },
  { code: 'internal_error_token', label: 'Erro interno do sistema', pattern: /\b(?:internal_error|legacy_dispatch_gateway_blocked|provider_not_configured|stack\s*trace)\b/i },
  { code: 'system_prompt_residue', label: 'Resíduo de prompt do sistema', pattern: /(?:^|[\n\r])\s*(?:SYSTEM|ASSISTANT|DEVELOPER|PROMPT)\s*:/im },
  { code: 'code_fence_residue', label: 'Bloco técnico não editorial', pattern: /```(?:json|html|markdown|text|typescript|javascript|tsx|jsx|sql)?/i },
  { code: 'placeholder_token', label: 'Placeholder técnico', pattern: /\[(?:PLACEHOLDER|TODO|FIXME|INSERIR\s+(?:TEXTO|CONTE[ÚU]DO|FONTE))\]/i },
];

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

export function htmlToPlainText(value: string | null | undefined) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|#39|lt|gt);/gi, (entity) => ENTITIES[entity.toLowerCase()] || ' ')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function findPublicationResidues(input: PublicationSafetyInput): PublicationResidue[] {
  const fields: Array<['title' | 'content' | 'excerpt', string]> = [
    ['title', String(input.title || '')],
    ['content', String(input.content || '')],
    ['excerpt', String(input.excerpt || '')],
  ];
  const found: PublicationResidue[] = [];
  for (const [field, value] of fields) {
    if (!value) continue;
    for (const rule of RESIDUE_RULES) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(value)) found.push({ code: rule.code, label: rule.label, field });
    }
  }
  return found;
}

export function isPublicationSafe(input: PublicationSafetyInput) {
  return findPublicationResidues(input).length === 0;
}

function truncateAtWord(value: string, max = 158) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  const sliced = compact.slice(0, max + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const safe = (lastSpace >= Math.floor(max * 0.72) ? sliced.slice(0, lastSpace) : sliced.slice(0, max)).replace(/[\s,;:.-]+$/g, '');
  return `${safe}…`;
}

export function buildAutomaticMetaDescription(content: string | null | undefined, title?: string | null) {
  const text = htmlToPlainText(content);
  if (!text) return '';

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.map((item) => item.trim()).filter(Boolean) || [];
  let candidate = '';
  for (const sentence of sentences) {
    const next = candidate ? `${candidate} ${sentence}` : sentence;
    if (next.length > 165 && candidate.length >= 90) break;
    candidate = next;
    if (candidate.length >= 125) break;
  }
  if (candidate.length < 80) candidate = text;
  if (candidate.length < 60 && title) candidate = `${String(title).trim()}. ${candidate}`.trim();
  return truncateAtWord(candidate, 158);
}

export function resolveMetaDescription(input: PublicationSafetyInput) {
  const current = htmlToPlainText(input.excerpt);
  if (current.length >= 80 && current.length <= 170 && findPublicationResidues({ excerpt: current }).length === 0) {
    return truncateAtWord(current, 158);
  }
  const generated = buildAutomaticMetaDescription(input.content, input.title);
  if (!generated || generated.length < 60 || findPublicationResidues({ excerpt: generated }).length > 0) return '';
  return generated;
}
