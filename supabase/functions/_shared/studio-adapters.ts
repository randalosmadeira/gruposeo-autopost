/**
 * Adaptadores de publicação do Estúdio de Páginas.
 *
 *  (a) wordpress_plugin  -> POST /pages do plugin Zica Posts 3.18.0: página (page) com endereço semântico EXATO e hierarquia, template limpo, schema/OG/canonical,
 *                           e o pedido de completude (portão 3.17.0, reaproveitado de plugin-completeness.ts). Sempre RASCUNHO por padrão.
 *  (b) site_manifest     -> PACOTE para sites estáticos (React/Vite em Apache/cPanel, como o da RDM): HTML pré-renderizado (sem JavaScript no navegador para o conteúdo),
 *                           sitemap com data real, redirecionamentos 301, 404 de verdade (noindex), instruções e somas de verificação. O dono ou um deploy publica.
 *  (c) zica_hosted       -> só o CONTRATO (abaixo). NÃO construído.
 * Nada aqui publica por conta própria: o handler só chama um adaptador para página APROVADA, e a aprovação é humana.
 */
import { buildCompletenessRequest, type CompletenessRequest } from './plugin-completeness.ts';
import { renderBody, renderDocument, labelsFor, esc } from './studio-render.ts';
import { jsonLdScript, type StudioGraph } from './studio-schema.ts';
import { redirectFor } from './studio-url.ts';
import type { AdapterKind, StudioPageDoc } from './studio-types.ts';
import type { StudioRules } from './studio-rules.ts';

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------------------------------------------------ (a) plugin do WordPress
export interface PluginPagePayload {
  zica_ai_id: string; post_type: 'page'; status: 'draft' | 'publish'; title: string; seo_title: string; slug: string; parent_path: string; full_path: string;
  content: string; excerpt: string; meta_description: string; canonical: string; language: string; noindex: boolean; template: 'clean';
  schema: StudioGraph | null; schema_policy: { seo_plugin: string | null; drop_types: string[] };
  og: { title: string; description: string; image: string | null; image_alt: string | null; width: number | null; height: number | null };
  hreflang: Record<string, string>; breadcrumbs: Array<{ name: string; url: string }>; date_modified: string | null;
  author: { name: string; credential: string | null; url: string | null } | null; featured_image: { url: string; alt: string; width: number; height: number } | null;
  content_hash: string; completeness: CompletenessRequest;
}

export async function buildPluginPagePayload(args: {
  externalId: string; doc: StudioPageDoc; graph: StudioGraph | null; rules: StudioRules; status?: 'draft' | 'publish'; hasTranslations?: boolean; dropTypes?: string[];
}): Promise<PluginPagePayload> {
  const { doc } = args;
  const labels = labelsFor(doc.language);
  // o tema imprime o título da página como H1: o conteúdo vai SEM <h1> (um só H1 na página)
  const content = renderBody(doc, labels, { withH1: false });
  const hash = await sha256Hex(content);
  const levels = doc.slugPath.split('/').filter(Boolean);
  const hero = doc.images.find((i) => i.slot === 'hero' && i.origin !== 'pendente') || null;
  const og = doc.images.find((i) => i.slot === 'og' && i.origin !== 'pendente') || hero;
  const completeness = buildCompletenessRequest({ rules: args.rules.base, approvedHash: hash, language: doc.language, hasFaq: doc.faq.length >= 2, hasTranslations: !!args.hasTranslations, authorIdentified: doc.author ? true : null, schemaPolicy: { seo_plugin: doc.seoPlugin, drop_types: args.dropTypes || [] } });
  // o portão 3.17.0 foi pensado para ARTIGOS: numa página não há Article nem imagem destacada obrigatória (o grafo da página vem do Estúdio) e o autor só vale no guia
  delete completeness.levels.schema; delete completeness.levels.schema_duplicates; delete completeness.levels.featured_image;
  if (doc.type !== 'guia') delete completeness.levels.author;
  return {
    zica_ai_id: args.externalId, post_type: 'page', status: args.status || 'draft', title: doc.h1 || doc.title, seo_title: doc.title, slug: levels[levels.length - 1] || '', parent_path: levels.slice(0, -1).join('/'), full_path: levels.join('/'),
    content, excerpt: doc.metaDescription, meta_description: doc.metaDescription, canonical: doc.url, language: doc.language, noindex: doc.noindex, template: 'clean',
    schema: args.graph, schema_policy: { seo_plugin: doc.seoPlugin, drop_types: args.dropTypes || [] },
    og: { title: doc.title, description: doc.metaDescription, image: og?.url ?? null, image_alt: og?.alt ?? null, width: og?.width ?? null, height: og?.height ?? null },
    hreflang: doc.hreflang, breadcrumbs: doc.breadcrumbs, date_modified: doc.dateModified, author: doc.author, featured_image: hero ? { url: hero.url, alt: hero.alt, width: hero.width, height: hero.height } : null, content_hash: hash,
    completeness,
  };
}

export interface PluginPageReply { ok: boolean; id: number | null; url: string | null; path: string | null; status: string | null; idempotent: boolean; created: boolean; slugChanged: boolean; completeness: unknown; error: string | null }
/** Lê a resposta do plugin sem confiar nela como instrução. O caminho devolvido TEM de ser o pedido (o plugin devolve 409 e desfaz se o WordPress mudar o slug). */
export function parsePluginPageReply(raw: unknown, wantedPath: string): PluginPageReply {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const path = typeof o.path === 'string' ? o.path.replace(/^\/+|\/+$/g, '') : typeof o.url === 'string' ? (() => { try { return new URL(o.url as string).pathname.replace(/^\/+|\/+$/g, ''); } catch { return null; } })() : null;
  const want = wantedPath.replace(/^\/+|\/+$/g, '');
  const ok = o.success === true && Number.isFinite(Number(o.id)) && Number(o.id) > 0;
  const slugChanged = ok && !!path && !path.endsWith(want);
  return {
    ok: ok && !slugChanged, id: ok ? Number(o.id) : null, url: typeof o.url === 'string' && /^https:\/\//i.test(o.url) ? o.url : null, path, status: typeof o.status === 'string' ? o.status.slice(0, 20) : null,
    idempotent: o.idempotent === true, created: o.created === true, slugChanged, completeness: o.completeness ?? null,
    error: slugChanged ? 'O WordPress alterou o endereço da página (provável sufixo "-2"). A publicação foi recusada: apague ou renomeie a página conflitante no site.' : ok ? null : typeof o.message === 'string' ? o.message.slice(0, 200) : 'O plugin não confirmou a publicação.',
  };
}

// ------------------------------------------------------------------------------------------------------------ (b) pacote para site estático
export interface StaticFile { path: string; content: string; sha256: string; bytes: number }
export interface StaticPackage { adapter: 'site_manifest'; files: StaticFile[]; manifest: Record<string, unknown>; warnings: string[]; instructions: string }
export interface StaticPageInput { externalId: string; version: number; doc: StudioPageDoc; graph: StudioGraph | null; approvedHash: string; previousPath?: string | null; wasPublished?: boolean }

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lastmodOf = (d: StudioPageDoc) => (d.dateModified && Number.isFinite(Date.parse(d.dateModified)) ? d.dateModified.slice(0, 10) : null);

export function buildSitemapXml(docs: StudioPageDoc[]): string {
  const rows = docs.filter((d) => !d.noindex).map((d) => {
    const lm = lastmodOf(d);
    const alts = Object.entries(d.hreflang || {}).map(([tag, url]) => `<xhtml:link rel="alternate" hreflang="${xml(tag)}" href="${xml(url)}"/>`).join('');
    return `<url><loc>${xml(d.url)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}${alts}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join('\n')}\n</urlset>\n`;
}

export function buildRedirectsHtaccess(pairs: Array<{ from: string; to: string }>): string {
  const lines = pairs.map((p) => `Redirect 301 ${p.from} ${p.to}`);
  return ['# Redirecionamentos 301 do Estúdio de Páginas (mude o endereço de página publicada SEMPRE com 301).', '# Cole ESTE bloco no TOPO do .htaccess da raiz, antes da regra que devolve index.html para tudo.', ...(lines.length ? lines : ['# (nenhum redirecionamento nesta remessa)'])].join('\n') + '\n';
}

export const HTACCESS_REAL_404 = [
  '# Soft-404: o Apache NÃO deve devolver index.html (status 200) para endereço que não existe.',
  '# Antes da regra de "fallback" do aplicativo (React/Vite) deixe passar arquivos e pastas que EXISTEM e devolva 404 de verdade para o resto das pastas do Estúdio.',
  'ErrorDocument 404 /404.html',
  'RewriteEngine On',
  'RewriteCond %{REQUEST_FILENAME} -f [OR]',
  'RewriteCond %{REQUEST_FILENAME} -d',
  'RewriteRule ^ - [L]',
].join('\n') + '\n';

export const page404 = (lang: string, siteName: string): string => `<!doctype html>\n<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>404</title></head><body><main><h1>404</h1><p>${esc(siteName)}</p><p><a href="/">${esc(labelsFor(lang).breadcrumb === 'Breadcrumb' ? 'Home' : 'Início')}</a></p></main></body></html>\n`;

export async function buildStaticPackage(input: { pages: StaticPageInput[]; siteName: string; language: string; llmsTxt?: boolean; now: () => number }): Promise<StaticPackage> {
  const warnings: string[] = [];
  const files: StaticFile[] = [];
  const add = async (path: string, content: string) => { files.push({ path, content, sha256: await sha256Hex(content), bytes: new TextEncoder().encode(content).length }); };
  const redirects: Array<{ from: string; to: string }> = [];
  for (const p of input.pages) {
    if (p.doc.noindex) warnings.push(`${p.doc.url} está noindex: a página sai no pacote, mas fica fora do sitemap.`);
    await add(`${p.doc.slugPath}/index.html`, renderDocument(p.doc, p.graph, { siteName: input.siteName }));
    const r = redirectFor(p.previousPath ?? null, p.doc.slugPath, !!p.wasPublished);
    if (r) redirects.push(r);
  }
  await add('sitemap-estudio.xml', buildSitemapXml(input.pages.map((p) => p.doc)));
  await add('redirects-estudio.htaccess', buildRedirectsHtaccess(redirects));
  await add('htaccess-404-real.txt', HTACCESS_REAL_404);
  await add('404.html', page404(input.language, input.siteName));
  if (input.llmsTxt) await add('llms-estudio.txt', `# ${input.siteName}\n\n${input.pages.filter((p) => !p.doc.noindex).map((p) => `- [${p.doc.title}](${p.doc.url}): ${p.doc.metaDescription}`).join('\n')}\n`);
  const manifest = {
    generator: 'zica-posts-estudio-de-paginas', adapter: 'site_manifest', generated_at: new Date(input.now()).toISOString(),
    pages: input.pages.map((p) => ({ external_id: p.externalId, version: p.version, path: `${p.doc.slugPath}/index.html`, url: p.doc.url, approved_hash: p.approvedHash })),
    files: files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
  };
  const instructions = [
    '# Como publicar este pacote (site estático em Apache/cPanel)', '',
    '1. Faça um BACKUP da pasta pública do site (public_html) antes de qualquer coisa.',
    '2. Envie cada pasta deste pacote para a raiz do site, mantendo os caminhos (ex.: `advogado-criminalista/guarulhos/index.html`).',
    '3. Acrescente `sitemap-estudio.xml` ao índice de sitemaps (ou ao `robots.txt`: `Sitemap: https://seu-site/sitemap-estudio.xml`).',
    '4. Se o pacote trouxe redirecionamentos (`redirects-estudio.htaccess`), cole o bloco no TOPO do `.htaccess` da raiz.',
    '5. Confira `htaccess-404-real.txt`: o site não pode devolver a página inicial com status 200 para endereço que não existe (soft-404).',
    '6. Teste cada URL: `curl -I https://seu-site/<caminho>/` deve dar 200; um caminho inventado deve dar 404.',
    '7. Volte ao Zica e marque a página como publicada (o Estúdio então avisa Bing/IndexNow e põe a URL na fila de indexação).', '',
    '**Reverter:** apague as pastas enviadas (a lista está em `manifest.json`), retire o bloco do `.htaccess` e a linha do sitemap, ou restaure o backup do passo 1.', '',
    'As somas SHA-256 do `manifest.json` permitem conferir que nada mudou no caminho do pacote até o servidor.',
  ].join('\n');
  await add('INSTRUCOES.md', instructions);
  return { adapter: 'site_manifest', files, manifest, warnings, instructions };
}

// ------------------------------------------------------------------------------------------------------------ (c) zica_hosted: só o contrato
export const ZICA_HOSTED_CONTRACT = {
  status: 'nao_construido',
  description: 'Páginas servidas pela infraestrutura da Zica num subdomínio do cliente (CNAME), para sites em que não dá para mexer na pilha.',
  contract: {
    input: 'A mesma StudioPageDoc aprovada e o grafo de schema do Estúdio (nada muda no núcleo).',
    host: 'Subdomínio do cliente (ex.: paginas.cliente.com.br) com CNAME para a Zica; certificado emitido na hospedagem da Zica.',
    routes: ['GET /<slugPath>/ -> HTML pré-renderizado (renderDocument)', 'GET /sitemap.xml -> buildSitemapXml', 'GET /robots.txt', 'GET qualquer outro caminho -> 404 real com noindex'],
    publish: 'Grava a versão aprovada (hash) no armazenamento da Zica e devolve a URL; idempotente por external_id.',
    unpublish: 'Remove a página e devolve 410 (ou 301 se houver destino).',
    tradeoffs: ['Divide autoridade entre subdomínio e domínio principal.', 'Exige DNS do cliente.'],
  },
} as const;

export const ADAPTER_LABELS: Record<AdapterKind, string> = { wordpress_plugin: 'Plugin do WordPress (Zica Posts 3.18.0)', site_manifest: 'Pacote para site estático', zica_hosted: 'Hospedado pela Zica (só contrato; não construído)' };
export { jsonLdScript };
