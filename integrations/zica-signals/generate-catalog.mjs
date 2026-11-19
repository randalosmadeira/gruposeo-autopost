// Injeta signals-catalog.json nos blocos "BEGIN/END signals-catalog" dos arquivos que usam a lista.
// Uso: node integrations/zica-signals/generate-catalog.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const catalog = JSON.parse(fs.readFileSync(path.join(here, 'signals-catalog.json'), 'utf8'));
const check = process.argv.includes('--check');

const refs = {
  a: catalog.ai_referrers.map((r) => [r.agent, r.hosts]),
  c: catalog.ai_referrers_conditional.map((r) => [r.host, r.agent, r.query || null, r.path_prefixes || null]),
  u: catalog.utm_sources,
  s: catalog.search_referrers.map((r) => [r.agent, r.pattern]),
};
const sorted = [...catalog.ai_bots].sort((x, y) => y.length - x.length);
const full = { b: sorted, ...refs };

// String PHP entre aspas simples: so a barra invertida e a aspa simples precisam de escape.
const BS = String.fromCharCode(92);
const phpEscape = (s) => s.split(BS).join(BS + BS).split("'").join(BS + "'");

const targets = [
  { file: 'public/zica-signals.js', render: () => 'var C=' + JSON.stringify(refs) + ';' },
  { file: 'public/wordpress-plugin/zica-posts/assets/zica-signals.js', render: () => 'var C=' + JSON.stringify(refs) + ';' },
  { file: 'public/wordpress-plugin/zica-posts/includes/class-zica-posts-signals.php', render: () => "const CATALOG_JSON = '" + phpEscape(JSON.stringify(full)) + "';" },
  { file: 'integrations/zica-signals/cloudflare-worker/worker.js', render: () => 'const C = ' + JSON.stringify(full) + ';' },
  { file: 'integrations/zica-signals/node/zica-signals-middleware.js', render: () => 'var C = ' + JSON.stringify(full) + ';' },
  { file: 'integrations/zica-signals/log-shipper/zica_signals_shipper.py', render: () => "CATALOG = json.loads(r'''" + JSON.stringify(full) + "''')" },
];

const re = /(BEGIN signals-catalog[^\n]*\n)([\s\S]*?)(\n[^\n]*END signals-catalog)/;
let changed = 0;
for (const t of targets) {
  const abs = path.join(root, t.file);
  const src = fs.readFileSync(abs, 'utf8');
  if (!re.test(src)) throw new Error('marcador ausente em ' + t.file);
  const out = src.replace(re, (_m, a, _b, c) => a + t.render() + c);
  if (out !== src) {
    changed++;
    if (!check) fs.writeFileSync(abs, out);
    console.log((check ? 'DESATUALIZADO ' : 'atualizado ') + t.file);
  }
}
if (check && changed) process.exit(1);
console.log(changed ? 'ok (' + changed + ' arquivos)' : 'ja em dia');
