/**
 * URL semântica do Estúdio de Páginas (global: qualquer idioma e alfabeto).
 *
 * Regras: minúsculas, sem acento nos alfabetos latinos (outros alfabetos mantêm as letras), hífen entre palavras, até 3 níveis (/serviço/lugar/assunto/),
 * cada nível de 3 a 60 caracteres e no máximo 6 palavras, sem data, sem ID, sem parâmetro; uma intenção por URL. Palavras de ligação saem (por idioma).
 * Nomes reservados do site (blog, wp-admin, feed...) são recusados. Colisão NÃO gera sufixo "-2": o sistema recusa e SUGERE alternativas.
 * O caminho da hierarquia é o mesmo do breadcrumb e do schema BreadcrumbList. Mudar o endereço de página publicada exige redirecionamento 301.
 */
export const MAX_LEVELS = 3;
export const MIN_LEVEL_CHARS = 3;
export const MAX_LEVEL_CHARS = 60;
export const MAX_LEVEL_WORDS = 6;

export const RESERVED = ['blog', 'wp-admin', 'wp-json', 'wp-content', 'wp-includes', 'feed', 'category', 'categoria', 'tag', 'author', 'autor', 'page', 'admin', 'login', 'cadastro', 'minha-conta', 'api', 'sitemap', 'robots', 'search', 'busca', 'cart', 'checkout'];

/** Palavras de ligação por idioma (saem do endereço). */
export const STOPWORDS: Record<string, string[]> = {
  pt: ['de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'ao', 'aos'],
  en: ['the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'with', 'at', 'by'],
  es: ['de', 'del', 'la', 'el', 'los', 'las', 'en', 'para', 'por', 'con', 'y', 'un', 'una', 'al'],
  fr: ['de', 'du', 'des', 'la', 'le', 'les', 'en', 'pour', 'par', 'avec', 'et', 'un', 'une', 'au', 'aux'],
  it: ['di', 'del', 'della', 'dei', 'delle', 'in', 'per', 'con', 'e', 'il', 'la', 'lo', 'un', 'una'],
  de: ['der', 'die', 'das', 'den', 'dem', 'des', 'von', 'in', 'für', 'mit', 'und', 'ein', 'eine'],
  nl: ['de', 'het', 'een', 'van', 'in', 'voor', 'met', 'en', 'op'],
};

const WORD = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

/** Texto livre -> trecho de endereço (um nível). Latim: sem acento; outros alfabetos: mantém as letras. */
export function slugifySegment(text: string, lang = 'pt', opts: { keepStopwords?: boolean } = {}): string {
  const base = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const fold = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const stop = new Set((STOPWORDS[lang.slice(0, 2).toLowerCase()] || []).map(fold));
  const kept = opts.keepStopwords ? words : words.filter((w) => !stop.has(w));
  const use = (kept.length ? kept : words).slice(0, MAX_LEVEL_WORDS);
  let out = use.join('-');
  if (out.length > MAX_LEVEL_CHARS) out = out.slice(0, MAX_LEVEL_CHARS).replace(/-[^-]*$/, '') || out.slice(0, MAX_LEVEL_CHARS);
  return out.replace(/^-+|-+$/g, '');
}

/** Várias partes de texto -> caminho com no máximo 3 níveis (partes vazias saem). */
export function buildSlugPath(parts: string[], lang = 'pt'): string {
  return parts.map((p) => slugifySegment(p, lang)).filter(Boolean).slice(0, MAX_LEVELS).join('/');
}

export interface SlugIssue { code: 'vazio' | 'niveis' | 'tamanho' | 'palavras' | 'caracteres' | 'reservado' | 'data_ou_id' | 'colisao' | 'pai_inexistente'; text: string }
export interface SlugCheck { ok: boolean; path: string; issues: SlugIssue[]; suggestions: string[] }

const DATE_OR_ID = /(?:^|-)(?:19|20)\d{2}(?:-\d{1,2}){0,2}(?:$|-)|^\d{4,}$|(?:^|-)p-?\d{3,}(?:$|-)|[?&=#]/;

/**
 * Valida um caminho proposto. `existing` = caminhos já usados no projeto (colisão); `parents` = caminhos de páginas existentes quando o caminho tem mais de um nível
 * (o pai precisa existir ou estar na lista de planejadas); `qualifiers` = palavras que podem diferenciar (lugar, intenção) para as sugestões.
 */
export function validateSlugPath(raw: string, opts: { existing?: string[]; parents?: string[]; qualifiers?: string[]; lang?: string; selfPath?: string | null } = {}): SlugCheck {
  const path = String(raw || '').trim().replace(/^\/+|\/+$/g, '');
  const issues: SlugIssue[] = [];
  if (!path) return { ok: false, path, issues: [{ code: 'vazio', text: 'Informe o endereço da página.' }], suggestions: [] };
  const levels = path.split('/');
  if (levels.length > MAX_LEVELS) issues.push({ code: 'niveis', text: `Use no máximo ${MAX_LEVELS} níveis (serviço/lugar/assunto).` });
  for (const lv of levels) {
    if (!WORD.test(lv)) { issues.push({ code: 'caracteres', text: `"${lv}" tem caracteres que não podem entrar no endereço (use letras, números e hífen).` }); continue; }
    if (lv !== lv.toLowerCase()) issues.push({ code: 'caracteres', text: `"${lv}" precisa estar em minúsculas.` });
    if (lv.length < MIN_LEVEL_CHARS || lv.length > MAX_LEVEL_CHARS) issues.push({ code: 'tamanho', text: `"${lv}" deve ter de ${MIN_LEVEL_CHARS} a ${MAX_LEVEL_CHARS} caracteres.` });
    if (lv.split('-').length > MAX_LEVEL_WORDS) issues.push({ code: 'palavras', text: `"${lv}" tem mais de ${MAX_LEVEL_WORDS} palavras.` });
    if (DATE_OR_ID.test(lv)) issues.push({ code: 'data_ou_id', text: `"${lv}" parece data ou número de identificação; o endereço deve descrever o assunto.` });
  }
  if (RESERVED.includes(levels[0])) issues.push({ code: 'reservado', text: `"${levels[0]}" é um nome reservado do site.` });
  const used = new Set((opts.existing || []).filter((p) => p !== opts.selfPath).map((p) => p.replace(/^\/+|\/+$/g, '')));
  let suggestions: string[] = [];
  if (used.has(path)) {
    issues.push({ code: 'colisao', text: 'Já existe uma página com esse endereço. Não crio "-2": escolha uma intenção ou um lugar diferente, ou edite a página existente.' });
    suggestions = suggestAlternatives(path, [...used], opts.qualifiers || [], opts.lang || 'pt');
  }
  if (levels.length > 1 && opts.parents) {
    const parent = levels.slice(0, -1).join('/');
    if (!opts.parents.map((p) => p.replace(/^\/+|\/+$/g, '')).includes(parent)) issues.push({ code: 'pai_inexistente', text: `A página-pai "${parent}" não existe. Crie o hub antes ou use um nível só.` });
  }
  return { ok: issues.length === 0, path, issues, suggestions };
}

/** Alternativas sem sufixo numérico: acrescenta palavras que mudam o sentido (lugar, intenção). */
export function suggestAlternatives(path: string, used: string[], qualifiers: string[], lang = 'pt'): string[] {
  const taken = new Set(used);
  const levels = path.split('/');
  const last = levels[levels.length - 1];
  const out: string[] = [];
  for (const q of qualifiers) {
    const qs = slugifySegment(q, lang);
    if (!qs) continue;
    const cand = [...levels.slice(0, -1), `${last}-${qs}`.split('-').slice(0, MAX_LEVEL_WORDS).join('-')].join('/');
    if (!taken.has(cand) && !out.includes(cand)) out.push(cand);
  }
  return out.slice(0, 5);
}

/** URL pública final: origem + prefixo (ex.: "/blog" quando o WordPress vive em subpasta) + caminho + barra final. */
export function publicUrl(origin: string, slugPath: string, basePath = ''): string {
  const o = String(origin || '').replace(/\/+$/, '');
  const b = String(basePath || '').replace(/^\/+|\/+$/g, '');
  const p = String(slugPath || '').replace(/^\/+|\/+$/g, '');
  return `${o}/${b ? `${b}/` : ''}${p}/`;
}

/** O endereço mudou numa página já publicada? Então o antigo precisa de 301 para o novo (senão a posição cai). */
export function redirectFor(oldPath: string | null, newPath: string, published: boolean): { from: string; to: string } | null {
  const a = String(oldPath || '').replace(/^\/+|\/+$/g, ''); const b = String(newPath || '').replace(/^\/+|\/+$/g, '');
  return published && a && a !== b ? { from: `/${a}/`, to: `/${b}/` } : null;
}

/** Trilha a partir da hierarquia do endereço: cada nível é um item; os rótulos vêm dos títulos das páginas-pai (ou do próprio nível, humanizado). */
export function breadcrumbsFor(opts: { origin: string; slugPath: string; homeLabel: string; labels?: Record<string, string>; title: string; basePath?: string }): Array<{ name: string; url: string }> {
  const levels = opts.slugPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const crumbs = [{ name: opts.homeLabel, url: `${opts.origin.replace(/\/+$/, '')}/` }];
  levels.forEach((_, i) => {
    const sub = levels.slice(0, i + 1).join('/');
    const last = i === levels.length - 1;
    const name = last ? opts.title : opts.labels?.[sub] || levels[i].replace(/-/g, ' ').replace(/^./u, (c) => c.toUpperCase());
    crumbs.push({ name, url: publicUrl(opts.origin, sub, opts.basePath) });
  });
  return crumbs;
}
