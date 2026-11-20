// Teste do SQL da migração 20261120500000 (indexação + barramento de eventos) num Postgres REAL embutido (PGlite), em memória. Não toca em nenhum banco do projeto.
// Como rodar (fora do projeto): mkdir t && cd t && npm init -y && npm i @electric-sql/pglite@0.3.2 && copie este arquivo para t/ && node indexacao_pglite_test.mjs
// Sai com código 1 se alguma verificação falhar. Valida SQL, RLS, grants, triggers, funções e rollback; NÃO é o Supabase de verdade (extensões, vault e papéis reais não existem aqui).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const ROOT = 'C:/Users/randa/Documents/Downloads/kit-rdm-arquivos/zica-posts-gruposeo-autopost-2026-09-06/supabase';
const MIGRATION = readFileSync(`${ROOT}/migrations/20261120500000_indexacao_e_eventos.sql`, 'utf-8');
const ROLLBACK = readFileSync(`${ROOT}/rollbacks/20261120500000_indexacao_e_eventos_rollback.sql`, 'utf-8');

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  OK   ', name); } else { fail++; console.log('  FALHOU', name, extra); } };
const throws = async (db, sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return String(e.message || e); } };

const stubs = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create table public.organizations (id uuid primary key);
  create table public.projects (id uuid primary key, organization_id uuid not null references public.organizations(id));
  create table public.nexus_search_performance (id bigserial primary key, project_id uuid, source text, day date, page text, impressions int, clicks int);
  create or replace function public.profile_assert_project_org() returns trigger language plpgsql security definer set search_path = '' as $$
  begin
    if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then raise exception 'project_not_in_organization'; end if;
    return new;
  end $$;
  insert into public.organizations values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000a2');
  insert into public.projects values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b9', '00000000-0000-4000-8000-0000000000a2');
`;
const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000a2', P = '00000000-0000-4000-8000-0000000000b1', PB = '00000000-0000-4000-8000-0000000000b9';

for (const withTaxonomy of [false, true]) {
  console.log(`\n=== ${withTaxonomy ? 'COM' : 'SEM'} a tabela de taxonomia instalada ===`);
  const db = new PGlite();
  await db.exec(stubs);
  if (withTaxonomy) await db.exec(`create table public.project_taxonomy_nodes (id uuid primary key default gen_random_uuid(), organization_id uuid, project_id uuid);`);
  await db.exec(MIGRATION);
  ok(true, 'migração aplicada sem erro');
  await db.exec(MIGRATION);
  ok(true, 'migração é idempotente (aplicar de novo não falha)');

  const tables = ['project_events', 'index_urls', 'index_status', 'index_submissions', 'index_hygiene', 'index_keys'];
  const rls = (await db.query(`select relname, relrowsecurity from pg_class where relname = any($1) and relnamespace = 'public'::regnamespace`, [tables])).rows;
  ok(rls.length === 6 && rls.every((r) => r.relrowsecurity), 'RLS ligada nas 6 tabelas');
  const grants = (await db.query(`select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and table_name = any($1) and grantee in ('anon','authenticated','public')`, [tables])).rows;
  ok(grants.length === 0, 'nenhum grant a anon/authenticated/public nas tabelas', JSON.stringify(grants));
  const svc = (await db.query(`select count(distinct table_name)::int n from information_schema.role_table_grants where table_schema = 'public' and table_name = any($1) and grantee = 'service_role'`, [tables])).rows[0].n;
  ok(svc === 6, 'service_role tem acesso às 6 tabelas');
  const fk = (await db.query(`select count(*)::int n from pg_constraint where conname = 'index_urls_taxonomy_node_fk'`)).rows[0].n;
  ok(fk === (withTaxonomy ? 1 : 0), `chave estrangeira da taxonomia ${withTaxonomy ? 'criada' : 'omitida (módulo não instalado)'}`);

  // project_events
  await db.query(`insert into public.project_events (organization_id, project_id, module, kind, payload) values ($1, $2, 'indexacao', 'indexacao.enviada', '{"count":3}')`, [A, P]);
  ok(true, 'evento válido entra');
  ok((await throws(db, `insert into public.project_events (organization_id, project_id, module, kind) values ($1, $2, 'indexacao', 'IndexNow.Enviada')`, [A, P])) !== null, 'kind fora do formato modulo.fato é recusado');
  ok((await throws(db, `insert into public.project_events (organization_id, project_id, module, kind) values ($1, $2, 'indexacao', 'semponto')`, [A, P])) !== null, 'kind sem ponto é recusado');
  ok((await throws(db, `insert into public.project_events (organization_id, project_id, module, kind, payload) values ($1, $2, 'm', 'm.x', '[1]')`, [A, P])) !== null, 'payload que não é objeto é recusado');
  ok(/project_not_in_organization/.test((await throws(db, `insert into public.project_events (organization_id, project_id, module, kind) values ($1, $2, 'm', 'm.x')`, [B, P])) || ''), 'trigger recusa projeto de outra organização (project_events)');
  ok(/project_events_append_only/.test((await throws(db, `update public.project_events set module = 'x'`)) || ''), 'evento publicado não pode ser editado (só acrescenta)');
  await db.query(`delete from public.project_events where project_id = $1`, [P]);
  ok(true, 'apagar continua possível (exclusão do projeto)');

  // index_urls
  const ins = (url, extra = '') => db.query(`insert into public.index_urls (organization_id, project_id, url, host, path, source${extra ? ', ' + extra.split('|')[0] : ''}) values ($1, $2, $3, 'acme-tools.com', '/', 'sitemap'${extra ? ', ' + extra.split('|')[1] : ''}) returning id`, [A, P, url]);
  const u1 = (await ins('https://acme-tools.com/a/')).rows[0].id;
  ok(typeof u1 === 'string', 'URL entra');
  ok(/index_urls_project_url_unique|duplicate key/.test((await throws(db, `insert into public.index_urls (organization_id, project_id, url, host, source) values ($1, $2, 'https://acme-tools.com/a/', 'acme-tools.com', 'sitemap')`, [A, P])) || ''), 'unique(project_id, url) recusa duplicata');
  ok((await throws(db, `insert into public.index_urls (organization_id, project_id, url, host, source) values ($1, $2, 'https://acme-tools.com/b/', 'acme-tools.com', 'invalida')`, [A, P])) !== null, 'source fora da lista é recusado');
  ok(/project_not_in_organization/.test((await throws(db, `insert into public.index_urls (organization_id, project_id, url, host, source) values ($1, $2, 'https://x.com/a/', 'x.com', 'manual')`, [A, PB])) || ''), 'trigger recusa projeto de outra organização (index_urls)');
  await db.query(`insert into public.index_urls (organization_id, project_id, url, host, source, lang) values ($1, $2, 'https://acme-tools.com/en/pricing/', 'acme-tools.com', 'sitemap', 'en')`, [A, P]);
  ok((await throws(db, `insert into public.index_urls (organization_id, project_id, url, host, source, lang) values ($1, $2, 'https://acme-tools.com/c/', 'acme-tools.com', 'sitemap', $3)`, [A, P, 'x'.repeat(30)])) !== null, 'idioma maior que 20 caracteres é recusado');

  // index_status
  await db.query(`insert into public.index_status (organization_id, project_id, url_id, engine, state, detail) values ($1, $2, $3, 'google', 'indexada', '{"coverage_state":"Submitted and indexed"}')`, [A, P, u1]);
  ok(/unique|duplicate/.test((await throws(db, `insert into public.index_status (organization_id, project_id, url_id, engine, state) values ($1, $2, $3, 'google', 'nao_indexada')`, [A, P, u1])) || ''), 'unique(url_id, engine) recusa segundo estado do mesmo motor');
  await db.query(`insert into public.index_status (organization_id, project_id, url_id, engine, state) values ($1, $2, $3, 'indexnow', 'enviada')`, [A, P, u1]);
  ok((await throws(db, `insert into public.index_status (organization_id, project_id, url_id, engine, state) values ($1, $2, $3, 'baidu', 'enviada')`, [A, P, u1])) !== null, 'motor fora da lista é recusado');
  ok((await throws(db, `insert into public.index_status (organization_id, project_id, url_id, engine, state) values ($1, $2, $3, 'bing', 'talvez')`, [A, P, u1])) !== null, 'estado fora da lista é recusado');
  // upsert como o código faz
  await db.query(`insert into public.index_status (organization_id, project_id, url_id, engine, state) values ($1, $2, $3, 'google', 'nao_indexada') on conflict (url_id, engine) do update set state = excluded.state`, [A, P, u1]);
  ok((await db.query(`select state from public.index_status where url_id = $1 and engine = 'google'`, [u1])).rows[0].state === 'nao_indexada', 'upsert onConflict (url_id,engine) funciona');
  await db.query(`insert into public.index_urls (organization_id, project_id, url, host, path, source, in_sitemap) values ($1, $2, 'https://acme-tools.com/a/', 'acme-tools.com', '/a/', 'sitemap', true) on conflict (project_id, url) do update set in_sitemap = excluded.in_sitemap`, [A, P]);
  ok(true, 'upsert onConflict (project_id,url) funciona');

  // submissions, hygiene, keys
  await db.query(`insert into public.index_submissions (organization_id, project_id, engine, host, urls_count, status) values ($1, $2, 'indexnow', 'acme-tools.com', 10000, 'aceita')`, [A, P]);
  ok((await throws(db, `insert into public.index_submissions (organization_id, project_id, engine, urls_count, status) values ($1, $2, 'indexnow', -1, 'aceita')`, [A, P])) !== null, 'urls_count negativo é recusado');
  ok((await throws(db, `insert into public.index_submissions (organization_id, project_id, engine, urls_count, status) values ($1, $2, 'indexnow', 1, 'ok')`, [A, P])) !== null, 'status fora da lista é recusado');
  await db.query(`insert into public.index_hygiene (organization_id, project_id, check_key, ok, severity) values ($1, $2, 'https_forcado', false, 'alta')`, [A, P]);
  await db.query(`insert into public.index_hygiene (organization_id, project_id, check_key, ok, severity) values ($1, $2, 'https_forcado', true, 'info') on conflict (project_id, check_key) do update set ok = excluded.ok, severity = excluded.severity`, [A, P]);
  ok((await db.query(`select count(*)::int n from public.index_hygiene`)).rows[0].n === 1, 'higiene: upsert por (project_id, check_key) mantém 1 linha');
  await db.query(`insert into public.index_keys (organization_id, project_id, host, key_value) values ($1, $2, 'acme-tools.com', 'k3y-acme-0123456789')`, [A, P]);
  ok((await throws(db, `insert into public.index_keys (organization_id, project_id, host, key_value) values ($1, $2, 'x.com', 'curta')`, [A, P])) !== null, 'chave do IndexNow fora do formato (8 a 128) é recusada');

  // funções
  await db.query(`insert into public.nexus_search_performance (project_id, source, day, page, impressions, clicks) values ($1, 'gsc', current_date, 'https://acme-tools.com/a/', 100, 5), ($1, 'gsc', current_date - 1, 'https://acme-tools.com/a/', 50, 1), ($1, 'gsc', current_date, 'https://acme-tools.com/b/', 10, 0), ($1, 'bing', current_date, 'https://acme-tools.com/c/', 999, 9), ($1, 'gsc', current_date - 400, 'https://acme-tools.com/antiga/', 7, 0), ($1, 'gsc', current_date, '', 5, 0)`, [P]);
  const pages = (await db.query(`select public.indexation_gsc_pages($1, 90, 20000) as r`, [P])).rows[0].r;
  ok(pages.length === 2 && pages[0].page === 'https://acme-tools.com/a/' && Number(pages[0].impressions) === 150 && Number(pages[0].clicks) === 6, 'indexation_gsc_pages soma por página, só GSC, só 90 dias, sem página vazia, da maior para a menor', JSON.stringify(pages));
  ok((await db.query(`select jsonb_array_length(public.indexation_gsc_pages($1, 90, 1)) as n`, [P])).rows[0].n === 1, 'limite de páginas respeitado');
  ok((await db.query(`select public.indexation_gsc_pages('00000000-0000-4000-8000-0000000000ff', 90, 10) as r`)).rows[0].r.length === 0, 'projeto sem Search Console devolve lista vazia');
  const sum = (await db.query(`select public.project_indexation_summary($1) as r`, [A])).rows[0].r;
  ok(sum[P] && sum[P].urls === 2 && sum[P].indexed === 0 && sum[P].not_indexed === 1, 'project_indexation_summary conta URLs, indexadas e não indexadas por projeto', JSON.stringify(sum));
  await db.query(`update public.index_urls set soft404_suspect = true where url = 'https://acme-tools.com/a/'`);
  await db.query(`update public.index_urls set robots_meta = 'noindex,follow' where url like '%/en/pricing/'`);
  ok((await db.query(`select public.project_indexation_summary($1) as r`, [A])).rows[0].r[P].problems === 2, 'problemas contam soft-404 e noindex');
  ok(Object.keys((await db.query(`select public.project_indexation_summary($1) as r`, [B])).rows[0].r).length === 0, 'outra organização não enxerga nada (resumo vazio)');
  const fnGrants = (await db.query(`select routine_name, grantee from information_schema.routine_privileges where routine_schema in ('public','private') and routine_name in ('indexation_gsc_pages','project_indexation_summary') and grantee in ('anon','authenticated','public')`)).rows;
  ok(fnGrants.length === 0, 'funções sem execute para anon/authenticated/public', JSON.stringify(fnGrants));

  // exclusão em cascata do projeto
  await db.query(`insert into public.project_events (organization_id, project_id, module, kind) values ($1, $2, 'indexacao', 'indexacao.enviada')`, [A, P]);
  await db.query(`delete from public.projects where id = $1`, [P]);
  const left = (await db.query(`select (select count(*) from public.index_urls) + (select count(*) from public.index_status) + (select count(*) from public.project_events) + (select count(*) from public.index_submissions) + (select count(*) from public.index_hygiene) + (select count(*) from public.index_keys) as n`)).rows[0].n;
  ok(Number(left) === 0, 'excluir o projeto apaga tudo em cascata (compatível com private.project_purge)');

  // rollback
  await db.exec(ROLLBACK);
  const remaining = (await db.query(`select count(*)::int n from pg_class where relnamespace = 'public'::regnamespace and (relname like 'index\\_%' or relname = 'project_events')`)).rows[0].n;
  ok(remaining === 0, 'rollback remove as 6 tabelas');
  const fns = (await db.query(`select count(*)::int n from pg_proc where proname in ('indexation_gsc_pages','project_indexation_summary','project_events_append_only')`)).rows[0].n;
  ok(fns === 0, 'rollback remove as funções');
  await db.exec(ROLLBACK);
  ok(true, 'rollback é idempotente');
  await db.exec(MIGRATION);
  ok(true, 'migração reaplica depois do rollback');
}
console.log(`\n${pass} verificações OK, ${fail} falharam.`);
process.exit(fail ? 1 : 0);
