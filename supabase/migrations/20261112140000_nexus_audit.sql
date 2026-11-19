-- NEXUS · Saúde do sistema: auditoria contínua (bloco D).
-- Tabelas de execuções e achados, RPCs de apoio (somente leitura/SQL, sem rede) e agendamento a cada 15 minutos.
-- Nada aqui faz chamadas pagas. A função de borda `nexus-audit` só executa verificações gratuitas, leituras e SQL.
--
-- Retenção (nenhuma limpeza é automática; rode manualmente ou agende você mesmo):
--   select public.nexus_audit_cleanup();   -- apaga execuções > 90 dias e achados resolvidos > 180 dias
--
-- Como PAUSAR o agendamento (reversível):
--   update cron.job set active=false where jobname='nexus-audit-every-15-min';
-- Como RETOMAR:
--   update cron.job set active=true where jobname='nexus-audit-every-15-min';
-- Como REMOVER:
--   select cron.unschedule('nexus-audit-every-15-min');
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. nexus_audit_runs
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_audit_runs (
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 trigger text not null check(trigger in ('schedule','manual')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text check(status in ('ok','partial','error')),
 rules_evaluated int not null default 0,
 findings_opened int not null default 0,
 findings_resolved int not null default 0,
 detail jsonb not null default '{}'::jsonb
);
create index if not exists nexus_audit_runs_org_started_idx on public.nexus_audit_runs(organization_id,started_at desc);

-- ---------------------------------------------------------------------------
-- 2. nexus_audit_findings (fingerprint = rule_id|project_id|subject; única por organização)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_audit_findings (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 project_id uuid references public.projects(id) on delete cascade,
 rule_id text not null,
 subject text not null default '',
 fingerprint text not null,
 category text not null check(category in ('corrective','preventive','improvement')),
 severity text not null check(severity in ('critical','high','medium','low','info')),
 title text not null,
 detail text,
 suggested_action text,
 fix_action jsonb,
 evidence jsonb not null default '{}'::jsonb,
 status text not null default 'open' check(status in ('open','acknowledged','snoozed','resolved')),
 note text check(note is null or char_length(note)<=500),
 snoozed_until timestamptz,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 resolved_at timestamptz,
 occurrences int not null default 1,
 unique(organization_id,fingerprint)
);
create index if not exists nexus_audit_findings_org_status_idx on public.nexus_audit_findings(organization_id,status,last_seen_at desc);
create index if not exists nexus_audit_findings_org_rule_idx on public.nexus_audit_findings(organization_id,rule_id);
create index if not exists nexus_audit_findings_project_idx on public.nexus_audit_findings(project_id) where project_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS: leitura por membro; escrita só service_role
-- ---------------------------------------------------------------------------
alter table public.nexus_audit_runs enable row level security;
alter table public.nexus_audit_findings enable row level security;
revoke all on public.nexus_audit_runs,public.nexus_audit_findings from public,anon,authenticated;
grant select on public.nexus_audit_runs,public.nexus_audit_findings to authenticated;
grant all on public.nexus_audit_runs,public.nexus_audit_findings to service_role;
grant usage,select on sequence public.nexus_audit_runs_id_seq to service_role;
drop policy if exists nexus_audit_run_read on public.nexus_audit_runs;
create policy nexus_audit_run_read on public.nexus_audit_runs for select to authenticated using(public.is_organization_member(organization_id));
drop policy if exists nexus_audit_finding_read on public.nexus_audit_findings;
create policy nexus_audit_finding_read on public.nexus_audit_findings for select to authenticated using(public.is_organization_member(organization_id));

-- ---------------------------------------------------------------------------
-- 4. Realtime (com guarda: não falha se a publicação não existir ou a tabela já estiver nela)
-- ---------------------------------------------------------------------------
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nexus_audit_findings') then
   alter publication supabase_realtime add table public.nexus_audit_findings;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nexus_audit_runs') then
   alter publication supabase_realtime add table public.nexus_audit_runs;
  end if;
 end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. RPCs de apoio (security definer, search_path vazio, somente service_role)
-- ---------------------------------------------------------------------------
-- Tabelas de `public` onde `anon` tem escrita e tabelas sem RLS. Ignora objetos de extensões.
create or replace function private.nexus_security_grants_audit()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_anon int:=0; v_sample text[]:='{}'; v_rls int:=0; v_rls_sample text[]:='{}';
begin
 if exists(select 1 from pg_catalog.pg_roles where rolname='anon') then
  select count(*)::int,coalesce((array_agg(t.relname order by t.relname))[1:10],'{}') into v_anon,v_sample
  from (
   select c.relname::text as relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')
    and not exists(select 1 from pg_catalog.pg_depend d where d.objid=c.oid and d.deptype='e')
    and (pg_catalog.has_table_privilege('anon',c.oid,'INSERT') or pg_catalog.has_table_privilege('anon',c.oid,'UPDATE')
      or pg_catalog.has_table_privilege('anon',c.oid,'DELETE') or pg_catalog.has_table_privilege('anon',c.oid,'TRUNCATE'))
  ) t;
 end if;
 select count(*)::int,coalesce((array_agg(t.relname order by t.relname))[1:10],'{}') into v_rls,v_rls_sample
 from (
  select c.relname::text as relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
   and not exists(select 1 from pg_catalog.pg_depend d where d.objid=c.oid and d.deptype='e')
 ) t;
 return jsonb_build_object('anon_write_tables',v_anon,'sample',to_jsonb(v_sample),'rls_disabled_tables',v_rls,'rls_sample',to_jsonb(v_rls_sample));
end $$;

-- Saúde dos jobs do pg_cron nas últimas p_hours horas. Se `cron` não existir ou não for legível, devolve [] sem erro.
create or replace function private.nexus_cron_health(p_hours int default 24)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; v_hours int:=greatest(1,least(coalesce(p_hours,24),720));
begin
 if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('jobname',coalesce(j.jobname,''),'active',j.active,'runs',coalesce(s.runs,0),'failures',coalesce(s.failures,0),
   'last_status',s.last_status,'last_run',s.last_run) order by j.jobname),'[]'::jsonb) into r
 from cron.job j
 left join lateral (
  select count(*)::int as runs,(count(*) filter (where d.status='failed'))::int as failures,
   (array_agg(d.status order by d.start_time desc))[1] as last_status,max(d.start_time) as last_run
  from cron.job_run_details d where d.jobid=j.jobid and d.start_time>now()-make_interval(hours=>v_hours)
 ) s on true;
 return r;
exception when others then
 return '[]'::jsonb;
end $$;

-- Estatísticas por projeto da organização (somente SQL): conjuntos de prompts, última observação, chave de sinais e estado da busca.
-- `last_synced_at` = o maior entre nexus_programs.settings.audit_sync (gravado pelo executor quando uma sincronização agendada dá certo)
-- e max(synced_at) de nexus_search_performance (quando a coluna existe, criada pela migração 20261112130000).
create or replace function private.nexus_audit_project_stats(p_org uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r jsonb:='[]'::jsonb; p record; v_settings jsonb; v_search jsonb; v_src text; v_rows int; v_last date; v_synced timestamptz; v_mark jsonb; v_mark_at timestamptz;
 v_has_perf boolean:=to_regclass('public.nexus_search_performance') is not null;
begin
 select settings into v_settings from public.nexus_programs where organization_id=p_org;
 for p in select id from public.projects where organization_id=p_org order by created_at desc limit 100 loop
  v_search:='{}'::jsonb;
  foreach v_src in array array['gsc','bing'] loop
   v_rows:=0; v_last:=null; v_synced:=null;
   if v_has_perf then
    execute 'select max(day),max(synced_at),(select count(*)::int from (select 1 from public.nexus_search_performance where project_id=$1 and source=$2 limit 1000) c) from public.nexus_search_performance where project_id=$1 and source=$2'
     into v_last,v_synced,v_rows using p.id,v_src;
   end if;
   v_mark:=coalesce(v_settings #> array['audit_sync',p.id::text,v_src],'{}'::jsonb);
   v_mark_at:=public.nexus_safe_timestamptz(v_mark->>'last_sync_at');
   v_search:=v_search||jsonb_build_object(v_src,jsonb_build_object('rows',coalesce(v_rows,0),'last_day',v_last,
    'last_synced_at',greatest(v_mark_at,v_synced),'last_full_sync_at',v_mark->>'last_full_sync_at'));
  end loop;
  r:=r||jsonb_build_array(jsonb_build_object(
   'project_id',p.id,
   'prompt_sets',(select count(*)::int from public.nexus_prompt_sets s where s.project_id=p.id),
   'prompts',(select count(*)::int from public.nexus_prompts x where x.project_id=p.id and x.active),
   'last_observation_at',(select max(o.updated_at) from public.nexus_operations o where o.project_id=p.id and o.kind in ('serp','ai_observation') and o.status='succeeded'),
   'site_key',(select jsonb_build_object('site_id',k.site_id,'created_at',k.created_at,'last_batch_at',k.last_batch_at) from public.nexus_site_keys k where k.project_id=p.id),
   'search',v_search));
 end loop;
 return r;
end $$;

-- Marca (atomicamente, sem sobrescrever o resto de settings) que uma sincronização agendada de busca deu certo.
create or replace function private.nexus_audit_mark_sync(p_org uuid,p_project uuid,p_source text,p_full boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_now text:=to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 if p_source not in ('gsc','bing') then raise exception 'invalid_source'; end if;
 if not exists(select 1 from public.projects where id=p_project and organization_id=p_org) then raise exception 'project_forbidden'; end if;
 update public.nexus_programs set settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('audit_sync',
   coalesce(settings->'audit_sync','{}'::jsonb)||jsonb_build_object(p_project::text,
    coalesce(settings->'audit_sync'->(p_project::text),'{}'::jsonb)||jsonb_build_object(p_source,
     coalesce(settings->'audit_sync'->(p_project::text)->p_source,'{}'::jsonb)||jsonb_build_object('last_sync_at',v_now)
      ||case when p_full then jsonb_build_object('last_full_sync_at',v_now) else '{}'::jsonb end)))
 where organization_id=p_org;
end $$;

-- Limpeza manual de retenção (não agendada).
create or replace function private.nexus_audit_cleanup()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_runs int; v_findings int;
begin
 delete from public.nexus_audit_runs where started_at<now()-interval '90 days';
 get diagnostics v_runs=row_count;
 delete from public.nexus_audit_findings where status='resolved' and resolved_at<now()-interval '180 days';
 get diagnostics v_findings=row_count;
 return jsonb_build_object('runs_deleted',v_runs,'findings_deleted',v_findings);
end $$;

-- Invólucros públicos (security invoker) para o supabase-js com service_role.
create or replace function public.nexus_security_grants_audit() returns jsonb language sql security invoker set search_path='' as $$select private.nexus_security_grants_audit();$$;
create or replace function public.nexus_cron_health(p_hours int default 24) returns jsonb language sql security invoker set search_path='' as $$select private.nexus_cron_health(p_hours);$$;
create or replace function public.nexus_audit_project_stats(p_org uuid) returns jsonb language sql security invoker set search_path='' as $$select private.nexus_audit_project_stats(p_org);$$;
create or replace function public.nexus_audit_mark_sync(p_org uuid,p_project uuid,p_source text,p_full boolean default false) returns void language sql security invoker set search_path='' as $$select private.nexus_audit_mark_sync(p_org,p_project,p_source,p_full);$$;
create or replace function public.nexus_audit_cleanup() returns jsonb language sql security invoker set search_path='' as $$select private.nexus_audit_cleanup();$$;

revoke all on function private.nexus_security_grants_audit(),public.nexus_security_grants_audit(),
 private.nexus_cron_health(int),public.nexus_cron_health(int),
 private.nexus_audit_project_stats(uuid),public.nexus_audit_project_stats(uuid),
 private.nexus_audit_mark_sync(uuid,uuid,text,boolean),public.nexus_audit_mark_sync(uuid,uuid,text,boolean),
 private.nexus_audit_cleanup(),public.nexus_audit_cleanup() from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.nexus_security_grants_audit(),public.nexus_security_grants_audit(),
 private.nexus_cron_health(int),public.nexus_cron_health(int),
 private.nexus_audit_project_stats(uuid),public.nexus_audit_project_stats(uuid),
 private.nexus_audit_mark_sync(uuid,uuid,text,boolean),public.nexus_audit_mark_sync(uuid,uuid,text,boolean),
 private.nexus_audit_cleanup(),public.nexus_audit_cleanup() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Agendamento (pg_cron + pg_net), mesmo mecanismo dos jobs existentes (auto-process-rss / execute-news-agents):
--    cabeçalho `x-zica-automation-key` cujo valor está no Vault (`zica_nexus_audit_key`, gerado aqui, nunca escrito em arquivo)
--    e cujo hash sha256 fica em automation_ingress_keys (nome `nexus-audit`). Rotação/desligamento: automation_ingress_keys.enabled.
--    A URL base pode ser sobrescrita pelo segredo opcional `zica_functions_base_url` do Vault (útil em branches); padrão = produção.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_ingress_keys (
 name text primary key,
 secret_hash text not null,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.automation_ingress_keys enable row level security;

do $$
declare v_secret text;
begin
 if not exists(select 1 from pg_namespace where nspname='vault') then
  raise notice 'nexus_audit: schema vault ausente; chave do agendamento não criada.';
  return;
 end if;
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='zica_nexus_audit_key' limit 1;
 if coalesce(v_secret,'')='' then
  v_secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  perform vault.create_secret(v_secret,'zica_nexus_audit_key','Segredo de ingresso do cron nexus-audit');
 end if;
 insert into public.automation_ingress_keys(name,secret_hash,enabled,updated_at)
 values('nexus-audit',encode(sha256(convert_to(v_secret,'UTF8')),'hex'),true,now())
 on conflict(name) do update set secret_hash=excluded.secret_hash,enabled=true,updated_at=now();
end $$;

do $$
declare v_job record;
begin
 if not exists(select 1 from pg_namespace where nspname='cron') then
  raise notice 'nexus_audit: pg_cron ausente; agendamento não criado.';
  return;
 end if;
 for v_job in select jobid from cron.job where jobname='nexus-audit-every-15-min' loop
  perform cron.unschedule(v_job.jobid);
 end loop;
 perform cron.schedule(
  'nexus-audit-every-15-min',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url := coalesce((select decrypted_secret from vault.decrypted_secrets where name='zica_functions_base_url' limit 1),'https://ubahrbgaxrkjxklytobl.supabase.co')||'/functions/v1/nexus-audit',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-zica-automation-key',(select decrypted_secret from vault.decrypted_secrets where name='zica_nexus_audit_key' limit 1)
    ),
    body := '{"cron":true}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cmd$
 );
end $$;
