// Gera supabase/migrations/20261121100000_prompts_voz_humana.sql e o rollback a partir de supabase/functions/_shared/prompt-library.ts.
// Uso: node scripts/gerar-migracao-prompts-voz-humana.mjs   (Node 22+, lê TypeScript direto). NÃO aplica nada no banco.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROMPT_LIBRARY, LIBRARY_DB_NAMES } from '../supabase/functions/_shared/prompt-library.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const tag = '$zpv5$';
const items = PROMPT_LIBRARY.filter((p) => LIBRARY_DB_NAMES.includes(p.name));
for (const p of items) if (p.prompt.includes(tag)) throw new Error(`delimitador ${tag} aparece em ${p.name}`);

const up = `-- Prompts de geração v5 (voz humana e verificabilidade), 20/11/2026. NÃO APLICADA: depende de autorização do dono.
-- Auditoria: PROJETO-ZICA-ROTEIRO-MESTRE-2026-11-15/20-auditoria-engenharia-de-prompts-2026-11-20.md
-- Fonte do texto: supabase/functions/_shared/prompt-library.ts (este arquivo é gerado por scripts/gerar-migracao-prompts-voz-humana.mjs).
--
-- Como versiona: o gatilho prompt_templates_set_version (migração 20260905073921) soma 1 em "version" a cada UPDATE de prompt e o gatilho
-- prompt_templates_snapshot grava a nova versão em prompt_template_versions. A versão anterior (1) JÁ está em prompt_template_versions
-- (cópia feita pela migração 20260905073921), então nada se perde e o rollback devolve o texto da versão 1.
--
-- Salvaguarda: só atualiza modelo que ninguém editou (version = 1) e que pertence ao conjunto padrão pelo nome. Quem editou o seu prompt
-- à mão continua com o dele. Os modelos eleitorais (electoral_editorial_1470_v1) NÃO são tocados: o conteúdo eleitoral está aposentado
-- (ver relatório); para desativar depois, use a linha comentada no fim.

${items.map((p) => `update public.prompt_templates
   set prompt = ${tag}${p.prompt}${tag},
       description = ${q(p.description)}
 where name = ${q(p.name)}
   and version = 1;
`).join('\n')}
-- Opcional, só com autorização (aposentar conteúdo eleitoral sem apagar o histórico):
-- update public.prompt_templates set is_active = false where name = 'electoral_editorial_1470_v1';
`;

const names = items.map((p) => q(p.name)).join(', ');
const down = `-- Rollback de 20261121100000_prompts_voz_humana: devolve o texto da versão 1 (cópia guardada em prompt_template_versions).
-- O gatilho de versionamento grava o retorno como nova versão (histórico preservado). Só mexe nos modelos que a migração tocou (version >= 2).
update public.prompt_templates pt
   set prompt = v.prompt
  from public.prompt_template_versions v
 where v.prompt_template_id = pt.id
   and v.version = 1
   and pt.version >= 2
   and pt.name in (${names})
   and pt.prompt is distinct from v.prompt;
`;

writeFileSync(join(root, 'supabase/migrations/20261121100000_prompts_voz_humana.sql'), up);
writeFileSync(join(root, 'supabase/rollbacks/20261121100000_prompts_voz_humana_rollback.sql'), down);
console.log(`ok: ${items.length} modelos`);
