// Teste de SQL da captação de leads, rodado num Postgres REAL embutido (PGlite), sem gastar com branch.
// Como rodar (fora do projeto): mkdir t && cd t && npm init -y && npm i @electric-sql/pglite@0.3.2 && copie este arquivo para t/ && node lead_capture_pglite_test.mjs
// Ajuste ROOT abaixo para a pasta supabase do repositório. Sai com código 1 se alguma verificação falhar.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const ROOT = 'C:/Users/randa/Documents/Downloads/kit-rdm-arquivos/zica-posts-gruposeo-autopost-2026-09-06/supabase';
const MIGRATION = readFileSync(`${ROOT}/migrations/20261116040000_captacao_leads.sql`, 'utf-8');
const ROLLBACK = readFileSync(`${ROOT}/rollbacks/20261116040000_captacao_leads_rollback.sql`, 'utf-8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  OK  ', name); } else { fail++; console.log('  FALHOU', name, extra); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const throws = async (sql, params) => { try { await db.query(sql, params); return null; } catch (e) { return String(e.message || e); } };
const H = (c) => c.repeat(64);

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create table auth.users (id uuid primary key);
  insert into auth.users values ('00000000-0000-4000-8000-0000000000e1');
`);
await db.exec(MIGRATION);
console.log('Migração aplicada num Postgres real (PGlite).');

const ins = (over = {}) => {
  const v = { name: 'Maria Souza', email: 'maria@x.com', email_norm: 'maria@x.com', phone: null, status: 'new', handoff_hash: null, ...over };
  return db.query(
    `insert into public.marketing_leads (name, email, email_norm, phone, status, handoff_hash, consent_at, consent_version) values ($1,$2,$3,$4,$5,$6, now(), 'leads-v1') returning id`,
    [v.name, v.email, v.email_norm, v.phone, v.status, v.handoff_hash],
  );
};

// ---------------------------------------------------------------- restrições
console.log('\nRestrições');
ok(!(await throws(`select 1`)), 'banco responde');
ok(!(await ins()).rows.length === false, 'lead válido entra');
ok(/marketing_leads_contact_required|check/i.test((await throws(`insert into public.marketing_leads (name, consent_at, consent_version) values ('Sem Contato', now(), 'v')`)) || ''), 'sem e-mail e sem telefone: recusado');
ok(/check/i.test((await throws(`insert into public.marketing_leads (name, email_norm, consent_at, consent_version) values ('A','a@b.c', now(), 'v')`)) || ''), 'nome de 1 letra: recusado');
ok(/check/i.test((await throws(`insert into public.marketing_leads (name, phone, consent_at, consent_version) values ('Joana','(11) 9999-9999', now(), 'v')`)) || ''), 'telefone fora do formato só-dígitos: recusado');
ok(!(await throws(`insert into public.marketing_leads (name, phone, consent_at, consent_version) values ('Joana','5511988887777', now(), 'v')`)), 'telefone só com dígitos (E.164 sem +): aceito');
ok(/null value|not-null/i.test((await throws(`insert into public.marketing_leads (name, email_norm, consent_version) values ('Joana','j@j.com','v')`)) || ''), 'sem data de consentimento: recusado');
ok(/null value|not-null/i.test((await throws(`insert into public.marketing_leads (name, email_norm, consent_at) values ('Joana','j2@j.com', now())`)) || ''), 'sem versão do consentimento: recusado');
ok(/check/i.test((await throws(`insert into public.marketing_leads (name, email_norm, status, consent_at, consent_version) values ('Joana','j3@j.com','qualquer', now(), 'v')`)) || ''), 'situação desconhecida: recusada');
ok(/check/i.test((await throws(`insert into public.marketing_leads (name, email_norm, ip_hash, consent_at, consent_version) values ('Joana','j4@j.com','1.2.3.4', now(), 'v')`)) || ''), 'IP puro no lugar do hash (≠ 64 caracteres): recusado');
ok(/check/i.test((await throws(`insert into public.marketing_leads (name, email_norm, source, consent_at, consent_version) values ('Joana','j5@j.com','[1]'::jsonb, now(), 'v')`)) || ''), 'origem que não é objeto: recusada');
ok(/check/i.test((await throws(`insert into public.marketing_leads (name, email_norm, message, consent_at, consent_version) values ('Joana','j6@j.com', repeat('x',501), now(), 'v')`)) || ''), 'mensagem acima de 500: recusada');

// ---------------------------------------------------------------- unicidade de contato aberto
console.log('\nUnicidade');
ok(/duplicate|unique/i.test((await throws(`insert into public.marketing_leads (name, email_norm, consent_at, consent_version) values ('Outra','maria@x.com', now(), 'v')`)) || ''), 'mesmo e-mail com lead aberto: recusado (23505)');
await db.exec(`update public.marketing_leads set status='contacted' where email_norm='maria@x.com'`);
ok(/duplicate|unique/i.test((await throws(`insert into public.marketing_leads (name, email_norm, consent_at, consent_version) values ('Outra','maria@x.com', now(), 'v')`)) || ''), 'lead "contatado" ainda é aberto: repetir recusa');
await db.exec(`update public.marketing_leads set status='signed_up' where email_norm='maria@x.com'`);
ok(!(await throws(`insert into public.marketing_leads (name, email_norm, consent_at, consent_version) values ('Maria de novo','maria@x.com', now(), 'v')`)), 'depois de "cadastrado", o mesmo e-mail pode voltar como novo lead');
await db.exec(`insert into public.marketing_leads (name, phone, consent_at, consent_version) values ('Tel Um','5511911112222', now(), 'v')`);
ok(/duplicate|unique/i.test((await throws(`insert into public.marketing_leads (name, phone, consent_at, consent_version) values ('Tel Dois','5511911112222', now(), 'v')`)) || ''), 'mesmo telefone aberto: recusado');
await db.exec(`update public.marketing_leads set status='discarded' where phone='5511911112222'`);
ok(!(await throws(`insert into public.marketing_leads (name, phone, consent_at, consent_version) values ('Tel Três','5511911112222', now(), 'v')`)), 'telefone de lead descartado pode ser reaproveitado');
await ins({ name: 'H1', email_norm: 'h1@x.com', email: 'h1@x.com', handoff_hash: H('a') });
ok(/duplicate|unique/i.test((await throws(`insert into public.marketing_leads (name, email_norm, handoff_hash, consent_at, consent_version) values ('H2','h2@x.com','${H('a')}', now(), 'v')`)) || ''), 'mesmo hash de passagem em dois leads: recusado');
ok(!(await throws(`insert into public.marketing_leads (name, email_norm, consent_at, consent_version) values ('H3','h3@x.com', now(), 'v')`)) && !(await throws(`insert into public.marketing_leads (name, email_norm, consent_at, consent_version) values ('H4','h4@x.com', now(), 'v')`)), 'vários leads sem hash de passagem convivem (índice parcial)');

// ---------------------------------------------------------------- gatilho de atualização e vínculo
console.log('\nGatilho e vínculo');
const t0 = (await q(`select updated_at from public.marketing_leads where email_norm='h1@x.com'`))[0].updated_at;
await new Promise((r) => setTimeout(r, 20));
await db.exec(`update public.marketing_leads set notes='ligar' where email_norm='h1@x.com'`);
const t1 = (await q(`select updated_at from public.marketing_leads where email_norm='h1@x.com'`))[0].updated_at;
ok(new Date(t1) > new Date(t0), 'updated_at avança numa atualização');
await db.exec(`update public.marketing_leads set claimed_by='00000000-0000-4000-8000-0000000000e1', claimed_at=now() where email_norm='h1@x.com'`);
ok((await q(`select claimed_by from public.marketing_leads where email_norm='h1@x.com'`))[0].claimed_by !== null, 'vínculo com o usuário criado');
await db.exec(`delete from auth.users where id='00000000-0000-4000-8000-0000000000e1'`);
ok((await q(`select claimed_by from public.marketing_leads where email_norm='h1@x.com'`))[0].claimed_by === null, 'apagar o usuário não apaga o lead (claimed_by vira nulo)');

// ---------------------------------------------------------------- tentativas
console.log('\nTentativas');
ok(!(await throws(`insert into public.lead_capture_attempts (ip_hash, outcome) values ('${H('b')}','ok')`)), 'tentativa válida entra');
ok(/check/i.test((await throws(`insert into public.lead_capture_attempts (ip_hash, outcome) values ('1.2.3.4','ok')`)) || ''), 'IP puro: recusado');
ok(/check/i.test((await throws(`insert into public.lead_capture_attempts (ip_hash, outcome) values ('${H('b')}','estranho')`)) || ''), 'resultado desconhecido: recusado');

// ---------------------------------------------------------------- privilégios (a única porta é a chave de serviço)
console.log('\nPrivilégios e RLS');
const rls = await q(`select relname, relrowsecurity from pg_class where relname in ('marketing_leads','lead_capture_attempts') order by relname`);
ok(rls.length === 2 && rls.every((r) => r.relrowsecurity), 'RLS ligada nas duas tabelas');
for (const role of ['anon', 'authenticated']) {
  for (const t of ['marketing_leads', 'lead_capture_attempts']) {
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const r = (await q(`select has_table_privilege('${role}', 'public.${t}', '${priv}') as p`))[0].p;
      if (r) ok(false, `${role} NÃO deve ter ${priv} em ${t}`);
    }
  }
}
ok(true, 'anon e authenticated sem nenhum privilégio de tabela nas duas tabelas');
ok((await q(`select has_table_privilege('service_role','public.marketing_leads','SELECT') a, has_table_privilege('service_role','public.marketing_leads','UPDATE') b`))[0].a, 'service_role lê e grava os leads');
ok((await q(`select has_sequence_privilege('service_role','public.lead_capture_attempts_id_seq','USAGE') u`))[0].u, 'service_role usa a sequência das tentativas');
ok(!(await q(`select has_table_privilege('public','public.marketing_leads','SELECT') p`))[0].p, 'PUBLIC também sem acesso');

// ---------------------------------------------------------------- reversão
console.log('\nReversão');
await db.exec(ROLLBACK);
ok((await q(`select count(*)::int n from pg_class where relname in ('marketing_leads','lead_capture_attempts')`))[0].n === 0, 'rollback remove as duas tabelas');
ok((await q(`select count(*)::int n from pg_proc where proname='marketing_leads_touch'`))[0].n === 0, 'rollback remove a função do gatilho');
await db.exec(MIGRATION);
ok((await q(`select count(*)::int n from pg_class where relname='marketing_leads'`))[0].n === 1, 'migração é reaplicável depois do rollback');
await db.exec(MIGRATION);
ok(true, 'migração idempotente (segunda aplicação seguida não falha)');

console.log(`\n${pass} ok, ${fail} falharam`);
process.exit(fail ? 1 : 0);
