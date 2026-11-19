-- Isolated, opt-in operations. Pilot starts with zero budget and no external execution.
create schema if not exists private;
create table public.nexus_programs (
 organization_id uuid primary key references public.organizations(id),
 execution_enabled boolean not null default false,
 budget_usd_micros bigint not null default 0 check(budget_usd_micros>=0),
 reserved_usd_micros bigint not null default 0 check(reserved_usd_micros>=0),
 consumed_usd_micros bigint not null default 0 check(consumed_usd_micros>=0),
 review_mode text not null default 'autonomous' check(review_mode in ('autonomous','human')),
 settings jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table public.nexus_operations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('serp','ai_observation','editorial_review','pilot')),
 request_key text not null,
 status text not null default 'prepared' check(status in ('prepared','reserved','succeeded','failed','uncertain')),
 reserved_usd_micros bigint not null default 0 check(reserved_usd_micros>=0),
 input jsonb not null default '{}'::jsonb,
 output jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,request_key)
);
create index nexus_operations_project_idx on public.nexus_operations(project_id,created_at desc);
create table public.nexus_cluster_members (
 cluster_id uuid not null references public.topic_clusters(id), article_id uuid not null references public.articles(id),
 organization_id uuid not null references public.organizations(id),project_id uuid not null references public.projects(id),
 primary key(cluster_id,article_id)
);
alter table public.nexus_cluster_members enable row level security;
revoke all on public.nexus_cluster_members from anon,authenticated;
grant select on public.nexus_cluster_members to authenticated;
grant all on public.nexus_cluster_members to service_role;
create policy nexus_cluster_member_read on public.nexus_cluster_members for select to authenticated using(public.is_organization_member(organization_id));
alter table public.internal_link_suggestions add column destination_checked_at timestamptz,add column destination_status integer;
create unique index nexus_link_pair_unique on public.internal_link_suggestions(source_article_id,target_url);
create table public.nexus_conversion_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),article_id uuid references public.articles(id),
 event_key text not null,stage text not null check(stage in ('cta_click','contact_started','lead_qualified','appointment','contract_signed')),
 evidence_ref text not null,source text not null,occurred_at timestamptz not null,
 created_at timestamptz not null default now(),unique(organization_id,event_key)
);
alter table public.nexus_programs enable row level security;
alter table public.nexus_operations enable row level security;
alter table public.nexus_conversion_events enable row level security;
revoke all on public.nexus_programs,public.nexus_operations,public.nexus_conversion_events from anon,authenticated;
grant select on public.nexus_programs,public.nexus_operations,public.nexus_conversion_events to authenticated;
grant all on public.nexus_programs,public.nexus_operations,public.nexus_conversion_events to service_role;
create policy nexus_program_read on public.nexus_programs for select to authenticated using(public.is_organization_member(organization_id));
create policy nexus_operation_read on public.nexus_operations for select to authenticated using(public.is_organization_member(organization_id));
create policy nexus_event_read on public.nexus_conversion_events for select to authenticated using(public.is_organization_member(organization_id));

alter table public.organization_provider_credentials drop constraint organization_provider_credentials_provider_check;
alter table public.organization_provider_credentials add constraint organization_provider_credentials_provider_check check(provider in ('openai','anthropic','gemini','serper'));

-- Privileged bodies live in an unexposed schema; wrappers are invoker/service-only.
create function private.nexus_provider_secret(p_org uuid,p_actor uuid,p_provider text,p_secret text default null)
returns text language plpgsql security definer set search_path='' as $$
declare secret_name text; secret_id uuid; result text;
begin
 if p_provider not in ('openai','anthropic','gemini','serper') then raise exception 'unsupported_provider'; end if;
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and status='active' and role in ('owner','admin'))
 and not exists(select 1 from public.organizations where id=p_org and owner_user_id=p_actor) then raise exception 'forbidden'; end if;
 secret_name:='nexus_org_'||p_org||'_'||p_provider;
 if p_secret is not null then
   if length(p_secret)<12 or length(p_secret)>4096 then raise exception 'invalid_credential'; end if;
   select id into secret_id from vault.secrets where name=secret_name;
   if secret_id is null then perform vault.create_secret(p_secret,secret_name); else perform vault.update_secret(secret_id,p_secret,secret_name); end if;
   insert into public.organization_provider_credentials(organization_id,provider,vault_secret_name,secret_last_four,status,created_by)
   values(p_org,p_provider,secret_name,right(p_secret,4),'stored_unverified',p_actor)
   on conflict(organization_id,provider) do update set vault_secret_name=excluded.vault_secret_name,secret_last_four=excluded.secret_last_four,status='stored_unverified',updated_at=now();
   return 'stored_unverified';
 end if;
 select s.decrypted_secret into result from vault.decrypted_secrets s join public.organization_provider_credentials c on c.vault_secret_name=s.name
 where c.organization_id=p_org and c.provider=p_provider and c.status in ('active','stored_unverified');
 return result;
end $$;
create function public.nexus_provider_secret(p_org uuid,p_actor uuid,p_provider text,p_secret text default null)
returns text language sql security invoker set search_path='' as $$ select private.nexus_provider_secret(p_org,p_actor,p_provider,p_secret); $$;

create function private.nexus_reserve_operation(p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.nexus_operations; program public.nexus_programs; ceiling bigint;
begin
 select * into op from public.nexus_operations where id=p_operation;
 if op.id is null then raise exception 'operation_not_found'; end if;
 select * into program from public.nexus_programs where organization_id=op.organization_id for update;
 select * into op from public.nexus_operations where id=p_operation for update;
 if op.status<>'prepared' then raise exception 'operation_already_claimed'; end if;
 if program.organization_id is null or not program.execution_enabled or program.budget_usd_micros=0 then raise exception 'budget_paused'; end if;
 ceiling:=(program.settings->'cost_ceilings_usd_micros'->>op.kind)::bigint;
 if ceiling is null or ceiling<=0 or nullif(program.settings->>'pricing_verified_at','') is null then raise exception 'pricing_not_configured'; end if;
 if program.reserved_usd_micros+program.consumed_usd_micros+ceiling>program.budget_usd_micros then raise exception 'budget_exceeded'; end if;
 update public.nexus_programs set reserved_usd_micros=reserved_usd_micros+ceiling,updated_at=now() where organization_id=op.organization_id;
 update public.nexus_operations set status='reserved',reserved_usd_micros=ceiling,updated_at=now() where id=op.id;
 return jsonb_build_object('reserved',ceiling);
end $$;
create function public.nexus_reserve_operation(p_operation uuid) returns jsonb language sql security invoker set search_path='' as $$select private.nexus_reserve_operation(p_operation);$$;
revoke all on function private.nexus_provider_secret(uuid,uuid,text,text),public.nexus_provider_secret(uuid,uuid,text,text),private.nexus_reserve_operation(uuid),public.nexus_reserve_operation(uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.nexus_provider_secret(uuid,uuid,text,text),public.nexus_provider_secret(uuid,uuid,text,text),private.nexus_reserve_operation(uuid),public.nexus_reserve_operation(uuid) to service_role;

create function private.nexus_finish_operation(p_operation uuid,p_output jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare op public.nexus_operations;
begin
 select * into op from public.nexus_operations where id=p_operation;
 perform 1 from public.nexus_programs where organization_id=op.organization_id for update;
 select * into op from public.nexus_operations where id=p_operation for update;
 if op.status<>'reserved' then raise exception 'operation_not_reserved'; end if;
 update public.nexus_programs set reserved_usd_micros=reserved_usd_micros-op.reserved_usd_micros,
 consumed_usd_micros=consumed_usd_micros+op.reserved_usd_micros,updated_at=now() where organization_id=op.organization_id;
 update public.nexus_operations set status='succeeded',output=p_output,updated_at=now() where id=op.id;
end $$;
create function public.nexus_finish_operation(p_operation uuid,p_output jsonb) returns void language sql security invoker set search_path='' as $$select private.nexus_finish_operation(p_operation,p_output);$$;
revoke all on function private.nexus_finish_operation(uuid,jsonb),public.nexus_finish_operation(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.nexus_finish_operation(uuid,jsonb),public.nexus_finish_operation(uuid,jsonb) to service_role;
