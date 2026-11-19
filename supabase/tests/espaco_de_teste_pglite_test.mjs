// Teste de SQL do espaço de teste e da porteira da IA, num Postgres REAL embutido (PGlite).
// Como rodar (fora do projeto): mkdir t && cd t && npm init -y && npm i @electric-sql/pglite@0.3.2 && copie este arquivo para t/ && node espaco_de_teste_pglite_test.mjs
// Ajuste ROOT para a pasta supabase do repositório. Sai com código 1 se alguma verificação falhar.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const ROOT = 'C:/Users/randa/Documents/Downloads/kit-rdm-arquivos/zica-posts-gruposeo-autopost-2026-09-06/supabase';
const MIGRATION = readFileSync(`${ROOT}/migrations/20261116060000_espaco_de_teste_e_ia_da_plataforma.sql`, 'utf-8');
const ROLLBACK = readFileSync(`${ROOT}/rollbacks/20261116060000_espaco_de_teste_e_ia_da_plataforma_rollback.sql`, 'utf-8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  OK  ', name); } else { fail++; console.log('  FALHOU', name, extra); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const throws = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return String(e.message || e); } };
const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

// ---------------------------------------------------------------- mundo mínimo (mesmas colunas e restrições da produção nestas tabelas)
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, raw_app_meta_data jsonb not null default '{}'::jsonb);
  create table public.organizations (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete restrict,
    name text not null check (length(trim(name)) between 2 and 160), slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
    status text not null default 'active' check (status in ('trialing','active','past_due','suspended','cancelled')), kind text not null default 'client' check (kind in ('internal','client')),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table public.organization_members (organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'viewer' check (role in ('owner','admin','editor','viewer','campaign_manager')), status text not null default 'active' check (status in ('invited','active','suspended')),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (organization_id, user_id));
  create table public.commercial_plans (id text primary key, name text not null, project_limit integer check (project_limit is null or project_limit > 0),
    article_limit_monthly integer constraint commercial_plans_article_limit_monthly_check check (article_limit_monthly is null or article_limit_monthly > 0),
    brand_asset_limit integer not null default 6 check (brand_asset_limit between 1 and 6), byok_allowed boolean not null default false, copilot_allowed boolean not null default true,
    active boolean not null default true, features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table public.organization_subscriptions (id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations(id) on delete cascade,
    plan_id text not null references public.commercial_plans(id) on update cascade, status text not null default 'trialing' check (status in ('trialing','active','past_due','suspended','cancelled')),
    current_period_start timestamptz not null default date_trunc('month', now()), current_period_end timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (current_period_end > current_period_start));
  create table public.organization_operating_policies (organization_id uuid primary key references public.organizations(id) on delete cascade, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  insert into public.commercial_plans (id, name, project_limit, article_limit_monthly, byok_allowed, features) values
    ('internal','Painel Gestor Interno',null,null,true,'{"manager_panel":true}'), ('commercial','Zica.IA Posts Comercial',3,300,false,'{"wordpress":true}'), ('byok','Zica.IA Posts BYOK',3,650,true,'{"openai_byok":true}');
  insert into auth.users (id, raw_app_meta_data) values ('${U(1)}','{"app_role":"ceo"}'), ('${U(2)}','{}'), ('${U(3)}','{}'), ('${U(4)}','{}'), ('${U(5)}','{}'), ('${U(6)}','{}');
`);
// organização "cliente" já existente (plano comercial, ativa) com o usuário 2 como dono; usuário 3 sem espaço nenhum
await db.exec(`
  insert into public.organizations (id, owner_user_id, name, slug, status) values ('00000000-0000-4000-8000-0000000000a1','${U(2)}','Cliente Pago','cliente-pago','active');
  insert into public.organization_members (organization_id, user_id, role) values ('00000000-0000-4000-8000-0000000000a1','${U(2)}','owner');
  insert into public.organization_subscriptions (organization_id, plan_id, status) values ('00000000-0000-4000-8000-0000000000a1','commercial','active');
`);
await db.exec(MIGRATION);
console.log('Migração aplicada num Postgres real (PGlite).');

const allowed = async (u) => (await q('select public.platform_ai_allowed($1) a', [u]))[0].a;
const svc = async (sql, params) => { await db.exec('set role service_role'); try { return await q(sql, params); } finally { await db.exec('reset role'); } };

// ---------------------------------------------------------------- plano e restrição
console.log('\nPlano de teste');
const trial = (await q(`select * from public.commercial_plans where id='trial'`))[0];
ok(trial && trial.project_limit === 1 && trial.article_limit_monthly === 0 && trial.byok_allowed === false && trial.copilot_allowed === false, 'plano trial: 1 projeto, 0 artigos, sem BYOK e sem copiloto');
ok(trial.features.trial === true && trial.features.platform_ai === false, 'plano trial marcado como teste e sem IA da plataforma');
ok(!!(await throws(`insert into public.commercial_plans (id, name, article_limit_monthly) values ('neg','Negativo',-1)`)), 'limite de artigos negativo continua recusado');
ok(!(await throws(`insert into public.commercial_plans (id, name, article_limit_monthly) values ('zero','Zero',0)`)), 'limite 0 agora é aceito');
ok(!!(await throws(`insert into public.commercial_plans (id, name, project_limit) values ('p0','P0',0)`)), 'limite de projetos 0 continua recusado');

// ---------------------------------------------------------------- porteira
console.log('\nPorteira da IA da plataforma (antes de qualquer espaço de teste)');
ok(await allowed(U(1)) === true, 'gestor (ceo) pode');
ok(await allowed(U(2)) === true, 'membro de organização ativa com plano comercial pode (não quebra o que já funciona)');
ok(await allowed(U(3)) === false, 'usuário sem organização NÃO pode');
ok(await allowed('00000000-0000-4000-8000-00000000ffff') === false, 'usuário inexistente NÃO pode');
ok(await allowed(null) === false, 'identificador nulo NÃO pode');

// ---------------------------------------------------------------- criação do espaço
console.log('\nCriação do espaço de teste');
const row = (await svc(`select public.provision_trial_space($1, $2) r`, [U(5), 'Ana']))[0].r;
ok(row.created === true && !!row.organization_id, 'cria espaço novo');
const org = (await q(`select * from public.organizations where id=$1`, [row.organization_id]))[0];
ok(org.status === 'trialing' && org.kind === 'client' && org.owner_user_id === U(5) && org.name === 'Espaço de Ana', 'organização em teste, tipo cliente, dono certo');
ok(/^teste-ana-[0-9a-f]{8}$/.test(org.slug), 'slug seguro e único', org.slug);
ok((await q(`select role, status from public.organization_members where organization_id=$1 and user_id=$2`, [row.organization_id, U(5)]))[0]?.role === 'owner', 'o usuário vira dono');
const sub = (await q(`select plan_id, status, current_period_end > now() + interval '29 days' as long from public.organization_subscriptions where organization_id=$1`, [row.organization_id]))[0];
ok(sub.plan_id === 'trial' && sub.status === 'trialing' && sub.long === true, 'assinatura trial por ~30 dias');
ok((await q(`select count(*)::int n from public.organization_operating_policies where organization_id=$1`, [row.organization_id]))[0].n === 1, 'política operacional criada');
const again = (await svc(`select public.provision_trial_space($1, $2) r`, [U(5), 'Outro Nome']))[0].r;
ok(again.created === false && again.organization_id === row.organization_id, 'idempotente: segunda chamada não cria outro espaço');
ok((await q(`select count(*)::int n from public.organizations where owner_user_id=$1`, [U(5)]))[0].n === 1, 'continua com um espaço só');
const existing = (await svc(`select public.provision_trial_space($1, $2) r`, [U(2), 'Cliente'])) [0].r;
ok(existing.created === false && existing.organization_id === '00000000-0000-4000-8000-0000000000a1', 'quem já tem organização não ganha espaço de teste');
const weird = (await svc(`select public.provision_trial_space($1, $2) r`, [U(6), '###'])) [0].r;
ok(weird.created === true && /^teste-novo-[0-9a-f]{8}$/.test((await q(`select slug from public.organizations where id=$1`, [weird.organization_id]))[0].slug), 'nome só com símbolos vira slug "novo"');
ok(/user_not_found/.test((await throws(`select public.provision_trial_space('00000000-0000-4000-8000-00000000ffff','X')`)) || ''), 'usuário inexistente é recusado');

console.log('\nPorteira com espaço de teste');
ok(await allowed(U(5)) === false, 'dono de espaço de teste NÃO pode usar a IA da plataforma');
ok(await allowed(U(2)) === true, 'cliente pago continua podendo');

// ---------------------------------------------------------------- limite diário
console.log('\nTeto diário de espaços de teste');
for (let i = 0; i < 40; i++) {
  const id = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  await db.exec(`insert into auth.users (id) values ('${id}')`);
}
let created = 0, blocked = 0;
for (let i = 0; i < 40; i++) {
  const id = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const e = await throws(`select public.provision_trial_space('${id}', 'Lote ${i}')`);
  if (!e) created++; else if (/trial_capacity_reached/.test(e)) blocked++;
}
// já havia 2 espaços de teste hoje (usuários 5 e 6)
ok(created + 2 === 30 && blocked === 40 - created, `teto de 30 por dia respeitado (criou ${created}, barrou ${blocked})`);

// ---------------------------------------------------------------- liberação
console.log('\nLiberação pela gestão');
ok(/plan_not_releasable/.test((await throws(`select public.release_trial_space($1,'internal',$2)`, [row.organization_id, U(1)])) || ''), 'não libera para o plano interno');
ok(/plan_not_releasable/.test((await throws(`select public.release_trial_space($1,'trial',$2)`, [row.organization_id, U(1)])) || ''), 'não "libera" para o próprio plano de teste');
ok(/plan_not_releasable/.test((await throws(`select public.release_trial_space($1,'inexistente',$2)`, [row.organization_id, U(1)])) || ''), 'plano inexistente recusado');
ok(/not_a_trial_space/.test((await throws(`select public.release_trial_space('00000000-0000-4000-8000-0000000000a1','byok',$1)`, [U(1)])) || ''), 'organização que não é de teste não é mexida por aqui');
ok(/subscription_not_found/.test((await throws(`select public.release_trial_space('00000000-0000-4000-8000-0000000000ff','commercial',$1)`, [U(1)])) || ''), 'organização inexistente recusada');
const rel = (await svc(`select public.release_trial_space($1,'commercial',$2) r`, [row.organization_id, U(1)]))[0].r;
ok(rel.released === true && rel.plan_id === 'commercial', 'libera para o plano comercial');
const after = (await q(`select s.plan_id, s.status ss, o.status os, (select updated_by from public.organization_operating_policies where organization_id=o.id) ub from public.organizations o join public.organization_subscriptions s on s.organization_id=o.id where o.id=$1`, [row.organization_id]))[0];
ok(after.plan_id === 'commercial' && after.ss === 'active' && after.os === 'active' && after.ub === U(1), 'plano, assinatura e organização ativos; quem liberou fica registrado');
ok(await allowed(U(5)) === true, 'depois de liberado, a IA da plataforma passa a valer');
ok(/not_a_trial_space/.test((await throws(`select public.release_trial_space($1,'byok',$2)`, [row.organization_id, U(1)])) || ''), 'não dá para liberar duas vezes');

// ---------------------------------------------------------------- suspensão e info para a caixa de leads
console.log('\nSuspensão e informação para a gestão');
await db.exec(`update public.organizations set status='suspended' where id='${row.organization_id}'`);
ok(await allowed(U(5)) === false, 'organização suspensa perde a IA da plataforma');
await db.exec(`update public.organizations set status='active' where id='${row.organization_id}'; update public.organization_subscriptions set status='cancelled' where organization_id='${row.organization_id}'`);
ok(await allowed(U(5)) === false, 'assinatura cancelada perde a IA da plataforma');
await db.exec(`update public.organization_subscriptions set status='active' where organization_id='${row.organization_id}'; update public.organization_members set status='suspended' where user_id='${U(5)}'`);
ok(await allowed(U(5)) === false, 'membro suspenso perde a IA da plataforma');
await db.exec(`update public.organization_members set status='active' where user_id='${U(5)}'`);
const info = await svc(`select * from public.lead_trial_info(array['${U(5)}','${U(2)}','${U(3)}']::uuid[])`);
ok(info.length === 2 && info.find((i) => i.user_id === U(5))?.plan_id === 'commercial' && !info.find((i) => i.user_id === U(3)), 'lead_trial_info devolve uma linha por pessoa que tem espaço');

// ---------------------------------------------------------------- privilégios
console.log('\nPrivilégios');
for (const fn of ['platform_ai_allowed(uuid)', 'provision_trial_space(uuid,text)', 'release_trial_space(uuid,text,uuid)', 'lead_trial_info(uuid[])']) {
  for (const role of ['anon', 'authenticated', 'public']) {
    const r = (await q(`select has_function_privilege('${role}', 'public.${fn}', 'EXECUTE') p`))[0].p;
    ok(!r, `${role} NÃO executa ${fn}`);
  }
  ok((await q(`select has_function_privilege('service_role', 'public.${fn}', 'EXECUTE') p`))[0].p, `service_role executa ${fn}`);
}

// ---------------------------------------------------------------- reversão
console.log('\nReversão');
await db.exec(`delete from public.organization_subscriptions where plan_id='trial'; delete from public.commercial_plans where id='zero'`);
await db.exec(ROLLBACK);
ok((await q(`select count(*)::int n from pg_proc where proname in ('platform_ai_allowed','provision_trial_space','release_trial_space','lead_trial_info')`))[0].n === 0, 'rollback remove as quatro funções');
ok((await q(`select count(*)::int n from public.commercial_plans where id='trial'`))[0].n === 0, 'rollback remove o plano de teste (sem assinaturas dele)');
ok(!!(await throws(`insert into public.commercial_plans (id, name, article_limit_monthly) values ('z2','Z2',0)`)), 'rollback restaura a restrição antiga (limite > 0)');
await db.exec(MIGRATION);
ok((await q(`select count(*)::int n from public.commercial_plans where id='trial'`))[0].n === 1, 'migração reaplicável depois do rollback');
await db.exec(MIGRATION);
ok(true, 'migração idempotente (duas aplicações seguidas)');

console.log(`\n${pass} ok, ${fail} falharam`);
process.exit(fail ? 1 : 0);
