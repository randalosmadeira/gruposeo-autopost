/**
 * Renderizador de páginas do Estúdio: HTML limpo e semântico, sem JavaScript, sem requisição externa, com tudo que o buscador, a IA e o público precisam
 * dentro do próprio documento (title, meta description, canonical, hreflang, robots, Open Graph, cartão do X, JSON-LD, trilha, marcos, imagens com tamanho).
 *
 * Duas saídas:
 *  - `renderDocument`: documento completo (site estático, pré-visualização);
 *  - `renderBody`: só o miolo (o plugin do WordPress entrega o resto: tema, <head> e H1 do tema).
 * Sem estilo "de IA": o visual é um modelo neutro e minimalista, de leitura (a identidade da marca entra pelo tema do site ou pelo CSS do cliente).
 */
import type { Crumb, PageImage, StudioPageDoc } from './studio-types.ts';
import { jsonLdScript, type StudioGraph } from './studio-schema.ts';

export const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const CLEAN_CSS = `:root{--ink:#1c1c1e;--muted:#5a5a60;--line:#e3e3e6;--accent:#0b5cad;--bg:#fff}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;font:1.0625rem/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:#fff;padding:8px;z-index:9}main{max-width:46rem;margin:0 auto;padding:1.25rem 1rem 3rem}h1{font-size:clamp(1.6rem,4vw,2.25rem);line-height:1.2;margin:.5rem 0 1rem}h2{font-size:1.4rem;line-height:1.3;margin:2rem 0 .6rem}h3{font-size:1.15rem;margin:1.5rem 0 .4rem}p,li{max-width:68ch}a{color:var(--accent)}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:.5rem .6rem;text-align:left}nav.crumbs ol{display:flex;flex-wrap:wrap;gap:.25rem .5rem;list-style:none;padding:0;margin:0;font-size:.9rem;color:var(--muted)}nav.crumbs li+li::before{content:"/";margin-right:.5rem}.answer{border-left:3px solid var(--accent);padding:.1rem 0 .1rem 1rem;margin:1rem 0}.cta a{display:inline-block;padding:.7rem 1.1rem;border:1px solid var(--accent);border-radius:6px;text-decoration:none;font-weight:600}.meta{color:var(--muted);font-size:.9rem}footer{border-top:1px solid var(--line);margin-top:2rem;padding-top:1rem;color:var(--muted);font-size:.9rem}`;

export function renderCrumbs(crumbs: Crumb[], label: string): string {
  if (crumbs.length < 2) return '';
  const items = crumbs.map((c, i) => (i < crumbs.length - 1 ? `<li><a href="${esc(c.url)}">${esc(c.name)}</a></li>` : `<li aria-current="page">${esc(c.name)}</li>`)).join('');
  return `<nav class="crumbs" aria-label="${esc(label)}"><ol>${items}</ol></nav>`;
}

export function renderImage(img: PageImage, idx = 0): string {
  if (img.origin === 'pendente' || !img.url) return '';
  const loading = img.slot === 'hero' && idx === 0 ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
  return `<figure><img src="${esc(img.url)}" alt="${esc(img.alt)}" width="${img.width}" height="${img.height}" ${loading}>${img.credit ? `<figcaption class="meta">${esc(img.credit)}</figcaption>` : ''}</figure>`;
}

export function renderBody(doc: StudioPageDoc, labels: { breadcrumb: string; updated: string; by: string } = { breadcrumb: 'Breadcrumb', updated: 'Updated', by: 'By' }, opts: { withH1?: boolean } = {}): string {
  const hero = doc.images.find((i) => i.slot === 'hero');
  const byline = doc.author?.name ? `<p class="meta">${esc(labels.by)} ${doc.author.url ? `<a href="${esc(doc.author.url)}">${esc(doc.author.name)}</a>` : esc(doc.author.name)}${doc.author.credential ? `, ${esc(doc.author.credential)}` : ''}${doc.dateModified ? ` · ${esc(labels.updated)} <time datetime="${esc(doc.dateModified)}">${esc(doc.dateModified.slice(0, 10))}</time>` : ''}</p>` : doc.dateModified ? `<p class="meta">${esc(labels.updated)} <time datetime="${esc(doc.dateModified)}">${esc(doc.dateModified.slice(0, 10))}</time></p>` : '';
  const inline = doc.images.filter((i) => i.slot === 'inline').map((i, k) => renderImage(i, k + 1)).join('');
  return `${opts.withH1 === false ? '' : `<h1>${esc(doc.h1 || doc.title)}</h1>`}${byline}${hero ? renderImage(hero, 0) : ''}${doc.bodyHtml}${inline}`;
}

export function ogImageOf(doc: StudioPageDoc): PageImage | null {
  return doc.images.find((i) => i.slot === 'og' && i.origin !== 'pendente') || doc.images.find((i) => i.slot === 'hero' && i.origin !== 'pendente') || null;
}

export function renderHead(doc: StudioPageDoc, graph: StudioGraph | null, opts: { siteName?: string } = {}): string {
  const og = ogImageOf(doc);
  const lang = doc.language;
  const alternates = Object.entries(doc.hreflang || {}).map(([tag, url]) => `<link rel="alternate" hreflang="${esc(tag)}" href="${esc(url)}">`).join('');
  const robots = doc.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  return [
    '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(doc.title)}</title>`, `<meta name="description" content="${esc(doc.metaDescription)}">`, `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${esc(doc.url)}">`, alternates,
    `<meta property="og:type" content="${doc.type === 'guia' ? 'article' : 'website'}">`, `<meta property="og:title" content="${esc(doc.title)}">`, `<meta property="og:description" content="${esc(doc.metaDescription)}">`,
    `<meta property="og:url" content="${esc(doc.url)}">`, `<meta property="og:locale" content="${esc(lang.replace('-', '_'))}">`, opts.siteName ? `<meta property="og:site_name" content="${esc(opts.siteName)}">` : '',
    og ? `<meta property="og:image" content="${esc(og.url)}"><meta property="og:image:width" content="${og.width}"><meta property="og:image:height" content="${og.height}"><meta property="og:image:alt" content="${esc(og.alt)}">` : '',
    `<meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${esc(doc.title)}">`, `<meta name="twitter:description" content="${esc(doc.metaDescription)}">`, og ? `<meta name="twitter:image" content="${esc(og.url)}">` : '',
    jsonLdScript(graph),
  ].filter(Boolean).join('\n');
}

export interface RenderLabels { breadcrumb: string; updated: string; by: string; skip: string }
export const LABELS: Record<string, RenderLabels> = {
  pt: { breadcrumb: 'Trilha de navegação', updated: 'Atualizado em', by: 'Por', skip: 'Ir para o conteúdo' },
  en: { breadcrumb: 'Breadcrumb', updated: 'Updated', by: 'By', skip: 'Skip to content' },
  es: { breadcrumb: 'Ruta de navegación', updated: 'Actualizado el', by: 'Por', skip: 'Ir al contenido' },
  fr: { breadcrumb: 'Fil d’Ariane', updated: 'Mis à jour le', by: 'Par', skip: 'Aller au contenu' },
  it: { breadcrumb: 'Percorso', updated: 'Aggiornato il', by: 'Di', skip: 'Vai al contenuto' },
  de: { breadcrumb: 'Brotkrumen-Navigation', updated: 'Aktualisiert am', by: 'Von', skip: 'Zum Inhalt springen' },
  nl: { breadcrumb: 'Kruimelpad', updated: 'Bijgewerkt op', by: 'Door', skip: 'Naar de inhoud' },
};
export const labelsFor = (lang: string): RenderLabels => LABELS[lang.slice(0, 2).toLowerCase()] || LABELS.en;

/** Documento completo: <head> com tudo, <body> com marcos (header/nav/main/article/footer) e CSS inline mínimo (sem arquivo externo, sem JS). */
export function renderDocument(doc: StudioPageDoc, graph: StudioGraph | null, opts: { siteName?: string; footerHtml?: string; css?: string } = {}): string {
  const l = labelsFor(doc.language);
  const main = `<article>${renderBody(doc, l)}</article>`;
  return `<!doctype html>\n<html lang="${esc(doc.language)}">\n<head>\n${renderHead(doc, graph, { siteName: opts.siteName })}\n<style>${opts.css ?? CLEAN_CSS}</style>\n</head>\n<body>\n<a class="skip" href="#conteudo">${esc(l.skip)}</a>\n<header><nav class="crumbs-wrap">${renderCrumbs(doc.breadcrumbs, l.breadcrumb)}</nav></header>\n<main id="conteudo">${main}</main>\n<footer>${opts.footerHtml ?? (opts.siteName ? `<p>${esc(opts.siteName)}</p>` : '')}</footer>\n</body>\n</html>\n`;
}
