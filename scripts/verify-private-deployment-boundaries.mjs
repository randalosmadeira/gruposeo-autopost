import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'public', 'supabase', 'services', '.github/workflows'];
const files = ['package.json', 'vite.config.ts'];
const blocked = [
  /lovable/i,
  /lovable\.app/i,
  /lovable\.dev/i,
  /lovable-tagger/i,
  /gpt[-_ ]?engineer/i,
  /deploy-pages@/i,
  /configure-pages@/i,
  /upload-pages-artifact@/i,
  /ZICA_AI_DEPLOY_WEBHOOK_URL/i,
  /ZICA_AI_DEPLOY_TOKEN/i,
];

const findings = [];
const ignored = new Set([path.normalize('scripts/verify-private-deployment-boundaries.mjs')]);

function inspectFile(file) {
  const normalized = path.normalize(file);
  if (ignored.has(normalized) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of blocked) {
    rule.lastIndex = 0;
    if (rule.test(content)) findings.push(`${normalized}: ${rule}`);
  }
}

function walk(root) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) inspectFile(full);
  }
}

roots.forEach(walk);
files.forEach(inspectFile);

if (findings.length) {
  console.error('External builder/public deployment boundary violation detected:');
  findings.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Private deployment boundary OK: no Lovable/GitHub Pages/generic deploy webhook references found.');
