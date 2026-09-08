import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const allowedModels = new Set([
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
]);
const textFile = /(?:^|\/)(?:[^/]+\.(?:c?js|mjs|ts|tsx|json|ya?ml|md)|\.env(?:\.example)?)$/;
const modelId = /claude-(?:sonnet|haiku|opus|fable)-[a-z0-9-]+/g;
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && textFile.test(file) && !file.endsWith('package-lock.json'))
  .filter((file) =>
    file === '.env.example'
    || file === '.claude/settings.json'
    || file.startsWith('.github/workflows/')
    || file.startsWith('services/')
    || file.startsWith('supabase/functions/'));

const violations = [];
for (const file of files) {
  const contents = readFileSync(file, 'utf8');
  for (const match of contents.matchAll(modelId)) {
    if (!allowedModels.has(match[0])) violations.push(`${file}: ${match[0]}`);
  }
}

if (violations.length) {
  console.error('Modelos Claude fora da política Sonnet 4.5 ou inferior:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Política Claude validada em ${files.length} arquivos.`);
