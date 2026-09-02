import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'downloads');

const packages = [
  {
    name: 'zica-posts',
    folderName: 'zica-posts',
    version: '3.10.2',
    outputName: 'zica-posts-3.10.2.zip',
    source: path.join(ROOT, 'public', 'wordpress-plugin', 'zica-posts-3.10.2'),
    entry: 'zica-posts.php',
    expected: ['Version: 3.10.2', "ZICA_POSTS_VERSION', '3.10.2"],
    required: [
      'zica-posts.php', 'readme.txt', 'version.json', 'assets/admin.css',
      'includes/class-zica-posts-auth.php', 'includes/class-zica-posts-discovery.php',
      'includes/class-zica-posts-outbox.php', 'includes/class-zica-posts-cards.php',
      'includes/class-zica-posts-rest.php', 'includes/class-zica-posts-admin.php',
    ],
  },
  {
    name: 'zica-electoral-analytics',
    folderName: 'zica-electoral-analytics',
    version: '1.2.1',
    outputName: 'zica-electoral-analytics-1.2.1.zip',
    source: path.join(ROOT, 'public', 'wordpress-electoral', 'zica-electoral-analytics'),
    entry: 'zica-electoral-analytics.php',
    expected: ['Version: 1.2.1', "VERSION = '1.2.1'"],
    required: [
      'zica-electoral-analytics.php', 'README.txt',
      'assets/zica-electoral-analytics.js', 'assets/zica-electoral-optin.js',
      'assets/zica-electoral-optin.css',
    ],
  },
  {
    name: 'zica-neural-theme',
    folderName: 'zica-neural',
    version: '1.0.0',
    outputName: 'zica-neural-theme-1.0.0.zip',
    source: path.join(ROOT, 'public', 'wordpress-theme', 'zica-neural'),
    entry: 'style.css',
    expected: [],
    required: ['style.css', 'functions.php', 'header.php', 'footer.php', 'index.php'],
  },
];

async function walk(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(abs, base));
    else files.push({ abs, rel: path.relative(base, abs).replaceAll(path.sep, '/') });
  }
  return files;
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
const manifest = { generatedAt: new Date().toISOString(), packages: [] };

for (const pkg of packages) {
  const entryText = await fs.readFile(path.join(pkg.source, pkg.entry), 'utf8');
  for (const marker of pkg.expected) {
    if (!entryText.includes(marker)) throw new Error(`${pkg.name}: versão esperada ausente: ${marker}`);
  }

  const files = await walk(pkg.source);
  const rels = new Set(files.map((file) => file.rel));
  for (const required of pkg.required) {
    if (!rels.has(required)) throw new Error(`${pkg.name}: arquivo obrigatório ausente: ${required}`);
  }

  const zip = new JSZip();
  const folder = zip.folder(pkg.folderName);
  if (!folder) throw new Error(`${pkg.name}: falha ao criar pasta raiz`);
  for (const file of files) folder.file(file.rel, await fs.readFile(file.abs));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  const target = path.join(OUT, pkg.outputName);
  await fs.writeFile(target, buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  manifest.packages.push({ name: pkg.name, version: pkg.version, filename: pkg.outputName, sha256, files: files.length, required: pkg.required });
  console.log(`${pkg.outputName}: ${files.length} arquivos, sha256=${sha256}`);
}

await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
