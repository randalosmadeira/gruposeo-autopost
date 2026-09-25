// Gera páginas de compartilhamento por rota (Open Graph próprio) a partir do dist/index.html.
// WhatsApp, Instagram e Facebook não executam JavaScript: o HTML servido em /1470 precisa
// carregar as meta tags da campanha. O nginx (workflow de deploy) serve dist/1470/index.html
// nas rotas /1470, /apoiadores e /apoiadores/avatar; o bundle da SPA continua o mesmo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distIndex = resolve(root, 'dist/index.html');
if (!existsSync(distIndex)) throw new Error('dist/index.html não encontrado: rode o vite build antes.');

export const SHARE_PAGES = [
  {
    outDir: 'dist/1470',
    url: 'https://app.zica.posts.zicajuris.com.br/1470',
    title: 'Sua foto com Dr. Madeira 1470 | Madeira neles!',
    description: 'Madeira neles! Envie sua foto e receba em 1 minuto sua imagem de apoio ao Dr. Madeira, Deputado Federal 1470, pronta para WhatsApp, Instagram e story.',
    image: 'https://app.zica.posts.zicajuris.com.br/1470/og.png',
    imageAlt: 'Dr. Madeira 1470, Deputado Federal. Madeira neles! Sua foto com o candidato em 1 minuto.',
    siteName: 'Dr. Madeira 1470',
  },
];

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildSharePage(html, page) {
  const head = `
    <title>${escapeAttr(page.title)}</title>
    <meta name="description" content="${escapeAttr(page.description)}" />
    <meta property="og:site_name" content="${escapeAttr(page.siteName)}" />
    <meta property="og:title" content="${escapeAttr(page.title)}" />
    <meta property="og:description" content="${escapeAttr(page.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeAttr(page.url)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:image" content="${escapeAttr(page.image)}" />
    <meta property="og:image:secure_url" content="${escapeAttr(page.image)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeAttr(page.imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(page.title)}" />
    <meta name="twitter:description" content="${escapeAttr(page.description)}" />
    <meta name="twitter:image" content="${escapeAttr(page.image)}" />
    <link rel="icon" type="image/png" sizes="64x64" href="/1470/icon-64.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/1470/icon-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/1470/icon-180.png" />
    <link rel="canonical" href="${escapeAttr(page.url)}" />`;
  let out = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/\s*<meta name="description"[^>]*>/gi, '')
    .replace(/\s*<meta property="og:[^"]*"[^>]*>/gi, '')
    .replace(/\s*<meta name="twitter:[^"]*"[^>]*>/gi, '')
    .replace(/\s*<link rel="icon"[^>]*>/gi, '')
    .replace(/\s*<link rel="apple-touch-icon"[^>]*>/gi, '')
    .replace(/\s*<link rel="canonical"[^>]*>/gi, '');
  out = out.replace('</head>', `${head}\n  </head>`);
  if (!out.includes('id="root"')) throw new Error('share page sem #root');
  if (!out.includes('name="zica-supporter-flow"')) throw new Error('share page sem meta zica-supporter-flow');
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\') || process.argv[1]?.endsWith('build-share-pages.mjs');
if (isMain) {
  const html = readFileSync(distIndex, 'utf8');
  for (const page of SHARE_PAGES) {
    const dir = resolve(root, page.outDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'index.html'), buildSharePage(html, page));
    console.log(`share page: ${page.outDir}/index.html (${page.url})`);
  }
}
