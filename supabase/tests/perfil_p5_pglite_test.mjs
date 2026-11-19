// Teste de SQL do P5 (decisao de modulo com efeito), rodado num Postgres REAL embutido (PGlite), sem gastar com branch.
// Como rodar (fora do projeto):  mkdir t && cd t && npm init -y && npm i @electric-sql/pglite@0.3.2 && copie este arquivo para t/ && node teste-p5.mjs
// Ajuste ROOT abaixo para a pasta supabase do repositorio. 48 verificacoes; sai com codigo 1 se alguma falhar.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const ROOT = 'C:/Users/randa/Documents/Downloads/kit-rdm-arquivos/zica-posts-gruposeo-autopost-2026-09-06/supabase';
const MIGRATION = readFileSync(`${ROOT}/migrations/20261116020000_perfil_p5_modulos_efeitos.sql`, 'utf-8');
const ROLLBACK = readFileSync(`${ROOT}/rollbacks/20261116020000_perfil_p5_modulos_efeitos_rollback.sql`, 'utf-8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  OK  ', name); } else { fail++; console.log('  FALHOU', name, extra); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const throws = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return String(e.message || e); } };

const P1 = '00000000-0000-4000-8000-0000000000a1', P2 = '00000000-0000-4000-8000-0000000000a2', ORG = '00000000-0000-4000-8000-0000000000f1', USER = '00000000-0000-4000-8000-0000000000e1';

// ---------------------------------------------------------------- mundo mínimo (mesmas tabelas e colunas que a produção usa aqui)
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create table public.projects (id uuid primary key, organization_id uuid not null);
  create table public.module_catalog (code text primary key, name text, core boolean not null default false, default_enabled boolean not null default true, sort int default 0);
  create table public.project_modules (project_id uuid not null references public.projects(id), organization_id uuid not null, module_code text not null references public.module_catalog(code),
    enabled boolean not null, reason text, recommendation text, recommendation_reason text, decided_by uuid, decided_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    primary key (project_id, module_code));
  create table public.news_agents (id uuid primary key default gen_random_uuid(), project_id uuid not null, name text, is_active boolean not null default true);
  create table public.rss_schedules (id uuid primary key default gen_random_uuid(), project_id uuid not null, is_active boolean not null default true, next_run_at timestamptz);
  create table public.monitored_portals (id uuid primary key default gen_random_uuid(), project_id uuid not null, is_active boolean not null default true);
  create table public.keyword_link_rules (id uuid primary key default gen_random_uuid(), project_id uuid not null, is_active boolean not null default true);
  create table public.nexus_prompts (id uuid primary key default gen_random_uuid(), project_id uuid not null, active boolean not null default true);
  create table public.electoral_portal_resources (id uuid primary key default gen_random_uuid(), project_id uuid not null, active boolean not null default true);
  insert into public.projects values ('${P1}', '${ORG}'), ('${P2}', '${ORG}');
  insert into public.module_catalog (code, name, core, default_enabled) values
    ('dashboard','Painel',true,true),('articles','Artigos',false,true),('news_agents','Agentes',false,false),('news_rewriter','Reescritor',false,false),
    ('internal_linking','Links',false,true),('nexus_observatory','Observatório',false,true),('electoral_campaign','Eleitoral',false,false);
`);

await db.exec(MIGRATION);
console.log('Migração aplicada num Postgres real (PGlite).');

const reset = async () => {
  await db.exec(`delete from public.project_modules; delete from public.news_agents; delete from public.rss_schedules; delete from public.monitored_portals; delete from public.keyword_link_rules; delete from public.nexus_prompts; delete from public.electoral_portal_resources;`);
  await db.exec(`
    insert into public.news_agents (id, project_id, is_active, name) values
      ('10000000-0000-4000-8000-000000000001','${P1}',true,'a1'),('10000000-0000-4000-8000-000000000002','${P1}',true,'a2'),
      ('10000000-0000-4000-8000-000000000003','${P1}',false,'a3-ja-desligado-na-mao'),('10000000-0000-4000-8000-000000000004','${P2}',true,'b1');
    insert into public.rss_schedules (id, project_id, is_active) values ('20000000-0000-4000-8000-000000000001','${P1}',true),('20000000-0000-4000-8000-000000000002','${P1}',true),('20000000-0000-4000-8000-000000000003','${P2}',true);
    insert into public.monitored_portals (id, project_id, is_active) values ('30000000-0000-4000-8000-000000000001','${P1}',true),('30000000-0000-4000-8000-000000000002','${P2}',true);
    insert into public.keyword_link_rules (project_id, is_active) values ('${P1}',true),('${P1}',true);
    insert into public.nexus_prompts (project_id, active) values ('${P1}',true),('${P2}',true);
    insert into public.electoral_portal_resources (project_id, active) values ('${P1}',true),('${P2}',true);
  `);
};
const apply = (project, module, enabled, reason = null) => one('select public.apply_project_module($1,$2,$3,$4,$5) as r', [project, module, enabled, reason, USER]);
const active = async (table, flag, project) => Number((await one(`select count(*) n from public.${table} where project_id=$1 and ${flag}=true`, [project])).n);
const pm = async (project, module) => one('select * from public.project_modules where project_id=$1 and module_code=$2', [project, module]);

console.log('\n1. Prévia (só leitura)');
await reset();
let prev = (await one('select public.preview_project_module($1,$2) as r', [P1, 'news_agents'])).r;
ok(prev.length === 1 && prev[0].active === 2 && prev[0].table === 'news_agents', 'conta só os ATIVOS do projeto (2 de 3; o já desligado e o de outro projeto não entram)', JSON.stringify(prev));
ok((await q('select * from public.project_modules')).length === 0, 'a prévia não grava nada');
prev = (await one('select public.preview_project_module($1,$2) as r', [P1, 'articles'])).r;
ok(Array.isArray(prev) && prev.length === 0, 'módulo sem efeito devolve lista vazia');

console.log('\n2. Desligar pausa só o que estava ativo, só neste projeto');
await reset();
let r = (await apply(P1, 'news_agents', false, 'sem uso')).r;
ok(r.enabled === false && r.effects[0].paused === 2, 'devolve quantos foram pausados (2)', JSON.stringify(r));
ok(await active('news_agents', 'is_active', P1) === 0, 'agentes do projeto ficaram pausados');
ok(await active('news_agents', 'is_active', P2) === 1, 'agente de OUTRO projeto continua ativo');
let row = await pm(P1, 'news_agents');
ok(row.enabled === false && row.reason === 'sem uso' && row.decided_by === USER && row.organization_id === ORG, 'decisão gravada com motivo, autor e organização');
ok(row.paused_state.news_agents.length === 2 && !row.paused_state.news_agents.includes('10000000-0000-4000-8000-000000000003'), 'guardou só os 2 ids pausados por esta decisão (o desligado na mão NÃO entra)');
ok((await one(`select count(*) n from public.news_agents`)).n == 4, 'NADA foi apagado');

console.log('\n3. Desligar de novo é idempotente');
r = (await apply(P1, 'news_agents', false)).r;
row = await pm(P1, 'news_agents');
ok(r.effects[0].paused === 0 && row.paused_state.news_agents.length === 2, 'segunda vez não pausa nada novo e mantém os ids guardados');

console.log('\n4. Alguém religa um agente na mão e o módulo é desligado de novo');
await db.query(`update public.news_agents set is_active=true where id='10000000-0000-4000-8000-000000000001'`);
await apply(P1, 'news_agents', false);
row = await pm(P1, 'news_agents');
ok(await active('news_agents', 'is_active', P1) === 0 && row.paused_state.news_agents.length === 2, 'volta a pausar e não duplica o id');

console.log('\n5. Religar restaura EXATAMENTE o que foi pausado');
r = (await apply(P1, 'news_agents', true)).r;
row = await pm(P1, 'news_agents');
ok(r.effects[0].restored === 2, 'restaurou 2', JSON.stringify(r));
ok(await active('news_agents', 'is_active', P1) === 2, 'os 2 voltaram a ficar ativos');
ok((await one(`select is_active from public.news_agents where id='10000000-0000-4000-8000-000000000003'`)).is_active === false, 'o agente que já estava desligado na mão CONTINUA desligado');
ok(await active('news_agents', 'is_active', P2) === 1, 'outro projeto intocado');
ok(row.enabled === true && Object.keys(row.paused_state).length === 0, 'decisão "ligado" e nada mais pausado');
r = (await apply(P1, 'news_agents', true)).r;
ok(r.effects[0].restored === 0, 'religar de novo não muda nada');

console.log('\n6. Módulo nunca desligado: religar não toca em nada');
await reset();
r = (await apply(P1, 'news_rewriter', true)).r;
ok(await active('rss_schedules', 'is_active', P1) === 2 && await active('monitored_portals', 'is_active', P1) === 1, 'rotinas intactas');
ok((await pm(P1, 'news_rewriter')).enabled === true, 'a decisão é registrada');

console.log('\n7. Módulo com duas tabelas (reescritor de notícias)');
await apply(P1, 'news_rewriter', false);
ok(await active('rss_schedules', 'is_active', P1) === 0 && await active('monitored_portals', 'is_active', P1) === 0, 'pausou RSS e portais monitorados');
ok(await active('rss_schedules', 'is_active', P2) === 1 && await active('monitored_portals', 'is_active', P2) === 1, 'outro projeto intocado');
await apply(P1, 'news_rewriter', true);
ok(await active('rss_schedules', 'is_active', P1) === 2 && await active('monitored_portals', 'is_active', P1) === 1, 'religar restaurou as duas tabelas');

console.log('\n8. Os outros módulos com efeito');
for (const [mod, table, flag, n] of [['internal_linking', 'keyword_link_rules', 'is_active', 2], ['nexus_observatory', 'nexus_prompts', 'active', 1], ['electoral_campaign', 'electoral_portal_resources', 'active', 1]]) {
  await reset();
  await apply(P1, mod, false);
  ok(await active(table, flag, P1) === 0 && await active(table, flag, P2) === (table === 'keyword_link_rules' ? 0 : 1), `${mod}: pausa ${table} do projeto`);
  await apply(P1, mod, true);
  ok(await active(table, flag, P1) === n, `${mod}: religar restaura ${n}`);
}

console.log('\n9. Linha apagada enquanto pausada não quebra o religar');
await reset();
await apply(P1, 'news_agents', false);
await db.query(`delete from public.news_agents where id='10000000-0000-4000-8000-000000000001'`);
r = (await apply(P1, 'news_agents', true)).r;
ok(r.effects[0].restored === 1, 'restaura só a que ainda existe');

console.log('\n10. Estado adulterado não alcança outro projeto');
await reset();
await apply(P1, 'news_agents', false);
await db.query(`update public.news_agents set is_active=false where id='10000000-0000-4000-8000-000000000004'`); // agente do P2, desligado
await db.query(`update public.project_modules set paused_state = jsonb_set(paused_state, '{news_agents}', paused_state->'news_agents' || '["10000000-0000-4000-8000-000000000004"]'::jsonb) where project_id=$1`, [P1]);
await apply(P1, 'news_agents', true);
ok((await one(`select is_active from public.news_agents where id='10000000-0000-4000-8000-000000000004'`)).is_active === false, 'um id de outro projeto dentro do estado NÃO é religado (guarda por project_id)');

console.log('\n11. Recusas');
await reset();
let e = await throws('select public.apply_project_module($1,$2,$3,$4,$5)', [P1, 'dashboard', false, null, USER]);
ok(e && /core_module_cannot_be_disabled/.test(e), 'módulo nuclear não desliga', e);
e = await throws('select public.apply_project_module($1,$2,$3,$4,$5)', [P1, 'nao_existe', false, null, USER]);
ok(e && /module_unknown/.test(e), 'módulo desconhecido', e);
e = await throws('select public.apply_project_module($1,$2,$3,$4,$5)', ['00000000-0000-4000-8000-0000000000ff', 'news_agents', false, null, USER]);
ok(e && /project_not_found/.test(e), 'projeto inexistente', e);
ok((await q('select * from public.project_modules')).length === 0 && await active('news_agents', 'is_active', P1) === 2, 'nenhuma recusa deixou rastro');

console.log('\n12. Atomicidade: se uma rotina falha no meio, NADA fica pela metade');
await reset();
await db.exec(`create function public.boom() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$; create trigger boom before update on public.rss_schedules for each row execute function public.boom();`);
e = await throws('select public.apply_project_module($1,$2,$3,$4,$5)', [P1, 'news_rewriter', false, null, USER]);
ok(e && /falha simulada/.test(e), 'a falha chega ao chamador', e);
ok(await active('monitored_portals', 'is_active', P1) === 1, 'os portais (atualizados ANTES da falha) voltaram ao estado original');
ok((await q('select * from public.project_modules')).length === 0, 'nenhuma decisão foi gravada');
await db.exec(`drop trigger boom on public.rss_schedules; drop function public.boom();`);

console.log('\n13. Permissões e lista fechada');
await db.exec(`grant usage on schema public to anon, authenticated, service_role;`);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  e = await throws('select public.apply_project_module($1,$2,$3,$4,$5)', [P1, 'news_agents', false, null, USER]);
  const e2 = await throws('select public.preview_project_module($1,$2)', [P1, 'news_agents']);
  const e3 = await throws('select * from public.module_effects');
  await db.exec('reset role');
  ok(e && /permission denied/.test(e) && e2 && /permission denied/.test(e2) && e3 && /permission denied/.test(e3), `${role} NÃO executa as funções nem lê module_effects`, `${e}|${e2}|${e3}`);
}
await db.exec('set role service_role');
e = await throws('select public.preview_project_module($1,$2)', [P1, 'news_agents']);
await db.exec('reset role');
ok(e === null, 'service_role executa');
e = await throws(`insert into public.module_effects (module_code, table_name, flag_column, label) values ('articles','auth.users','is_active','x')`);
ok(e && /module_effects_table_allowed|violates check/.test(e), 'tabela fora da lista fechada é recusada', e);
e = await throws(`insert into public.module_effects (module_code, table_name, flag_column, label) values ('articles','news_agents','id; drop table x','x')`);
ok(e && /module_effects_flag_allowed|violates check/.test(e), 'coluna fora da lista fechada é recusada', e);
e = await throws(`update public.project_modules set paused_state = '[]'::jsonb`);
ok(e === null, 'sem linhas não há erro (checagem do tipo roda nas linhas)');

console.log('\n14. Migração repetida (idempotente)');
await db.exec(MIGRATION);
ok((await one('select count(*) n from public.module_effects')).n == 6, 'reaplicar não duplica os 6 efeitos');

console.log('\n15. Reversão: restaura o que estiver pausado e remove tudo');
await reset();
await apply(P1, 'news_agents', false);
await apply(P1, 'news_rewriter', false);
ok(await active('news_agents', 'is_active', P1) === 0 && await active('rss_schedules', 'is_active', P1) === 0, 'antes da reversão: pausado');
await db.exec(ROLLBACK);
ok(await active('news_agents', 'is_active', P1) === 2 && await active('rss_schedules', 'is_active', P1) === 2 && await active('monitored_portals', 'is_active', P1) === 1, 'a reversão religou tudo que estava pausado');
const gone = await one(`select (select count(*) from pg_proc where proname in ('apply_project_module','preview_project_module')) f, (select count(*) from information_schema.tables where table_name='module_effects') t, (select count(*) from information_schema.columns where table_name='project_modules' and column_name='paused_state') c`);
ok(Number(gone.f) === 0 && Number(gone.t) === 0 && Number(gone.c) === 0, 'funções, tabela e coluna removidas');
ok((await q('select * from public.project_modules')).length >= 0 && await one(`select count(*) n from public.news_agents`).then((x) => Number(x.n)) === 4, 'nada foi apagado pela reversão');

console.log(`\nRESULTADO: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
