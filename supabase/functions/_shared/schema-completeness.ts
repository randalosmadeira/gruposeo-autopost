/**
 * Plano de schema completo e coerente de um artigo (JSON-LD), sem rede e sem IA.
 *
 * Reaproveita buildArticleJsonLd (schema-builder.ts) e corrige o que a auditoria da RDM (20/11/2026) achou nos posts reais:
 *  - dois blocos Article conflitantes (um do Rank Math, outro do Zica Posts): aqui há UM só bloco Article, e quando o site tem SEO plugin
 *    (Rank Math, Yoast...) o Article fica com ele e o Zica NÃO emite o seu;
 *  - sem BreadcrumbList: acrescenta Início > (categoria) > artigo, só com URLs reais;
 *  - dateModified anterior a datePublished: a modificação nunca fica antes da publicação;
 *  - autor genérico "Redação": é só sinalizado como pendência humana. O sistema NUNCA inventa autor.
 * Global: inLanguage vem do idioma do artigo (configurado ou detectado); o rótulo "Início" da trilha segue o idioma; areaServed vem do que o projeto
 * declara (um ou vários países) ou da região do idioma configurado (pt-BR, en-GB...), nunca de um país assumido pelo sistema; hreflang/x-default é validado.
 * FAQPage só existe se o artigo tem perguntas e respostas reais (o extrator do schema-builder exige 2 ou mais). O Google aposentou o rich
 * result de FAQ em 05/2026: o bloco é informativo, nunca obrigatório.
 */
import { buildArticleJsonLd } from './schema-builder.ts';
import { LANGUAGES, parseLanguageTag, resolveLanguage } from './language-packs.ts';

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Schema = Record<string, unknown>;

export const SEO_PLUGINS = ['rank_math', 'yoast', 'aioseo', 'seopress'] as const;
export const ARTICLE_TYPES = ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'] as const;
const GENERIC_AUTHORS = new Set<string>(['admin', 'administrator', 'administrador', ...Object.values(LANGUAGES).flatMap((l) => l.genericAuthors)]);

export const isGenericAuthor = (name: unknown): boolean => {
  const n = String(name ?? '').trim().toLowerCase();
  return !n || GENERIC_AUTHORS.has(n);
};

export const seoPluginOf = (project: Any): string | null => {
  const v = String(project?.seo_plugin || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (SEO_PLUGINS as readonly string[]).includes(v) ? v : null;
};

const typesOfSchema = (s: Schema): string[] => {
  const t = s['@type'];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
};
export const schemaTypesOf = (schemas: Schema[]): string[] => Array.from(new Set(schemas.flatMap(typesOfSchema)));

/** Tipos de JSON-LD que já estão no HTML (blocos <script type="application/ld+json">): serve para detectar duplicidade com outros plugins. */
export function extractJsonLdTypes(html: string): string[] {
  const out: string[] = [];
  for (const m of String(html || '').matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes: Schema[] = Array.isArray(data) ? data : Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      for (const n of nodes) if (n && typeof n === 'object') out.push(...typesOfSchema(n as Schema));
    } catch { /* bloco inválido: ignorado */ }
  }
  return out;
}

/** Quantos blocos de Article (qualquer subtipo) existem: mais de um é conflito. */
export const countArticleBlocks = (types: string[]): number => types.filter((t) => (ARTICLE_TYPES as readonly string[]).includes(t)).length;

/** Mantém um bloco por tipo único (Article-ish, BreadcrumbList, FAQPage, LegalService, Attorney); preserva a ordem. */
export function dedupeSchemas(schemas: Schema[]): Schema[] {
  const seen = new Set<string>();
  const out: Schema[] = [];
  for (const s of schemas) {
    const ts = typesOfSchema(s);
    const key = ts.some((t) => (ARTICLE_TYPES as readonly string[]).includes(t)) ? 'article' : ts.join('+');
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(s);
  }
  return out;
}

const cleanUrl = (u: string) => String(u || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
const toMs = (v: unknown): number | null => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : null; };

/** Países atendidos: o que o projeto declara (lista ISO 3166-1) ou, na falta, a região do idioma configurado. Sem nada disso: vazio (não assume país). */
export function resolveAreaServed(project: Any, article: Any, region: string | null): string[] {
  const cfg = article?.config && typeof article.config === 'object' ? article.config : {};
  const raw = [cfg.areas_served, project?.commercial_info?.areas_served, project?.commercial_info?.country, project?.country].find((v) => (Array.isArray(v) ? v.length : !!v));
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((v: unknown) => String(v).trim().toUpperCase()).filter((v: string) => /^[A-Z]{2}$/.test(v));
  if (list.length) return Array.from(new Set(list));
  return region && /^[A-Z]{2}$/.test(region) ? [region] : [];
}

const TAG_RE = /^(?:x-default|[a-z]{2,3}(?:-[A-Za-z]{2,4})?(?:-[A-Z]{2})?)$/;
/** Valida e completa o mapa hreflang: etiquetas válidas, própria página presente e x-default (só se o idioma padrão for conhecido; nunca chuta). */
export function completeHreflang(map: Record<string, string>, opts: { selfTag?: string; selfUrl?: string; defaultTag?: string } = {}): { map: Record<string, string>; invalid: string[]; hasSelf: boolean; hasDefault: boolean } {
  const out: Record<string, string> = {}; const invalid: string[] = [];
  for (const [k, v] of Object.entries(map || {})) {
    const tag = k === 'x-default' ? k : (parseLanguageTag(k)?.tag ?? k);
    if (!TAG_RE.test(tag) || !/^https?:\/\//i.test(String(v))) invalid.push(k); else out[tag] = String(v);
  }
  if (opts.selfTag && opts.selfUrl && !out[opts.selfTag]) out[opts.selfTag] = opts.selfUrl;
  if (!out['x-default'] && opts.defaultTag && out[opts.defaultTag]) out['x-default'] = out[opts.defaultTag];
  const hasSelf = !!opts.selfTag && out[opts.selfTag] === opts.selfUrl;
  return { map: out, invalid, hasSelf, hasDefault: !!out['x-default'] };
}

export interface SchemaPlan {
  schemas: Schema[];
  types: string[];
  /** instruções ao plugin (ele também detecta SEO plugin sozinho): tipos que não deve imprimir porque o SEO plugin já imprime */
  policy: { seo_plugin: string | null; drop_types: string[] };
  author: { name: string; identified: boolean };
  datesCoherent: boolean;
  language: { tag: string; source: string };
  areaServed: string[];
  notes: string[];
}

export function buildSchemaPlan(params: { article: Any; project: Any; sectorType: Any; now?: () => number }): SchemaPlan {
  const { article, project, sectorType } = params;
  const nowMs = (params.now || Date.now)();
  const notes: string[] = [];
  const seoPlugin = seoPluginOf(project);
  const cfg = article?.config && typeof article.config === 'object' ? article.config : {};
  const lang = resolveLanguage({
    configured: [article?.language, cfg.language, project?.nexus_strategy?.language, project?.editorial_identity?.language],
    text: String(article?.content || '').replace(/<[^>]+>/g, ' ').slice(0, 6000),
  });

  // Datas: publicação = a real; sem ela, a criação; sem as duas, agora. Modificação nunca antes da publicação (nem no futuro).
  const pubMs = toMs(article?.published_at) ?? toMs(article?.created_at) ?? nowMs;
  const updMs = toMs(article?.updated_at);
  const modMs = Math.min(Math.max(updMs ?? pubMs, pubMs), Math.max(nowMs, pubMs));
  const datesCoherent = updMs === null || updMs >= pubMs;
  if (!datesCoherent) notes.push('A data de modificação estava antes da de publicação; o schema usa a de publicação como modificação.');

  const base = buildArticleJsonLd({ article: { ...article, published_at: new Date(pubMs).toISOString(), updated_at: new Date(modMs).toISOString() }, project, sectorType });
  let schemas: Schema[] = base.map((s) => ({ ...s }));

  const articleNode = schemas.find((s) => typesOfSchema(s).some((t) => (ARTICLE_TYPES as readonly string[]).includes(t)));
  const authorName = String((articleNode?.author as Any)?.name || '');
  const identified = !isGenericAuthor(authorName) && authorName.trim().toLowerCase() !== String((articleNode?.publisher as Any)?.name || '').trim().toLowerCase();
  if (!identified) notes.push('Autor genérico ou igual à empresa. O sistema não inventa autor: cadastre a pessoa real (e a OAB, se for o caso) no projeto.');

  const url = String(articleNode?.url || '').trim();
  if (articleNode) {
    if (url && !articleNode.mainEntityOfPage) articleNode.mainEntityOfPage = { '@type': 'WebPage', '@id': url };
    if (!articleNode.inLanguage && lang.tag !== 'und') articleNode.inLanguage = lang.tag;
  }

  // Trilha de navegação: só com URLs reais (nada de URL inventada).
  const origin = (() => { const o = String((articleNode?.publisher as Any)?.url || ''); return o ? cleanUrl(o) : ''; })();
  const headline = String(articleNode?.headline || article?.title || '').trim();
  if (origin && url && headline) {
    const crumbs: Array<{ name: string; item: string }> = [{ name: lang.profile?.labels.home ?? 'Home', item: `${origin}/` }];
    const cat = String(cfg.wordpress_category_name || '').trim();
    const catUrl = String(cfg.wordpress_category_url || '').trim();
    if (cat && /^https?:\/\//i.test(catUrl)) crumbs.push({ name: cat, item: catUrl });
    crumbs.push({ name: headline, item: url });
    schemas.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
    });
  } else notes.push('Trilha (BreadcrumbList) não gerada: faltam o endereço do site ou o do artigo.');

  // Área atendida: o que o projeto declara (um ou vários países) ou a região do idioma configurado; sem nenhum dos dois, nada é afirmado.
  const areaServed = resolveAreaServed(project, article, lang.source === 'configurado' ? lang.region : null);
  for (const node of schemas) {
    if (!('areaServed' in node)) continue;
    if (areaServed.length) node.areaServed = areaServed.length === 1 ? areaServed[0] : areaServed;
    else delete node.areaServed;
  }

  schemas = dedupeSchemas(schemas);
  const dropTypes: string[] = [];
  if (seoPlugin) {
    // O SEO plugin já emite o Article: ficar com um bloco só (o dele). O Zica não duplica.
    dropTypes.push(...ARTICLE_TYPES);
    schemas = schemas.filter((s) => !typesOfSchema(s).some((t) => (ARTICLE_TYPES as readonly string[]).includes(t)));
    notes.push(`O site usa ${seoPlugin}: o bloco Article fica com ele e o Zica não emite o seu (evita dois Article conflitantes).`);
  }
  return { schemas, types: schemaTypesOf(schemas), policy: { seo_plugin: seoPlugin, drop_types: dropTypes }, author: { name: authorName, identified }, datesCoherent, language: { tag: lang.tag, source: lang.source }, areaServed, notes };
}

/** Marcação de trilha visível (para tema ou plugin usarem; NÃO é injetada no corpo do artigo, que o publicador sanitiza). */
export function buildBreadcrumbHtml(crumbs: Array<{ name: string; url?: string }>): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const items = crumbs.map((c, i) => (i < crumbs.length - 1 && c.url ? `<li><a href="${esc(c.url)}">${esc(c.name)}</a></li>` : `<li aria-current="page">${esc(c.name)}</li>`)).join('');
  return `<nav class="zica-breadcrumb" aria-label="Trilha de navegação"><ol>${items}</ol></nav>`;
}
