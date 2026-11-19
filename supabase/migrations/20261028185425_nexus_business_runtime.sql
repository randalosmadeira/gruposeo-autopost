create table public.nexus_businesses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 organization_id uuid not null references public.organizations(id), name text not null check(length(name) between 1 and 200),
 entity_type text not null default 'company' check(entity_type in ('company','brand','product','portal','site','campaign')),
 created_at timestamptz not null default now()
);
alter table public.nexus_businesses enable row level security;
revoke all on public.nexus_businesses from anon,authenticated;
grant select on public.nexus_businesses to authenticated;
grant all on public.nexus_businesses to service_role;
create policy nexus_business_owner_read on public.nexus_businesses for select to authenticated using(user_id=(select auth.uid()));
alter table public.projects add column nexus_business_id uuid references public.nexus_businesses(id),
 add column nexus_strategy jsonb not null default '{}'::jsonb,
 add column nexus_strategy_version integer not null default 0,
 add column nexus_profile_status text not null default 'pending' check(nexus_profile_status in ('pending','draft','complete'));
create table public.nexus_strategy_history (
 project_id uuid not null references public.projects(id),version integer not null,
 user_id uuid not null references auth.users(id),strategy jsonb not null,
 created_at timestamptz not null default now(),primary key(project_id,version)
);
alter table public.nexus_strategy_history enable row level security;
revoke all on public.nexus_strategy_history from anon,authenticated;
grant select on public.nexus_strategy_history to authenticated;
grant all on public.nexus_strategy_history to service_role;
create policy nexus_history_owner_read on public.nexus_strategy_history for select to authenticated using(user_id=(select auth.uid()));
create function private.nexus_strategy_versioning() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.nexus_business_id is not null and not exists(select 1 from public.nexus_businesses b where b.id=new.nexus_business_id and b.user_id=new.user_id and b.organization_id=new.organization_id) then raise exception 'business_boundary'; end if;
 if new.nexus_strategy is distinct from old.nexus_strategy then
  new.nexus_strategy_version:=old.nexus_strategy_version+1;
  new.nexus_profile_status:=case when length(coalesce(new.nexus_strategy->>'sector',''))>0 and length(coalesce(new.nexus_strategy->>'offer',''))>0 and length(coalesce(new.nexus_strategy->>'audience',''))>0 and length(coalesce(new.nexus_strategy->>'regions',''))>0 and length(coalesce(new.nexus_strategy->>'primaryGoal',''))>0 and new.nexus_strategy->>'primaryGoal'<>'unknown' then 'complete' else 'draft' end;
  insert into public.nexus_strategy_history(project_id,version,user_id,strategy) values(new.id,new.nexus_strategy_version,new.user_id,new.nexus_strategy);
 else new.nexus_strategy_version:=old.nexus_strategy_version;new.nexus_profile_status:=old.nexus_profile_status; end if;
 return new;
end $$;
revoke all on function private.nexus_strategy_versioning() from public,anon,authenticated;
create trigger nexus_strategy_version before update on public.projects for each row execute function private.nexus_strategy_versioning();
create function private.nexus_article_context() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.projects;
begin
 if new.project_id is null then
  new.config:=coalesce(new.config,'{}'::jsonb)||jsonb_build_object('nexus_approval_required',true,'nexus_review_mode','autonomous','nexus_approval',null);return new;
 end if;
 select * into p from public.projects where id=new.project_id;
 if p.id is null or p.user_id<>new.user_id then raise exception 'article_project_boundary';end if;
 if tg_op='INSERT' or new.project_id is distinct from old.project_id or new.title is distinct from old.title or new.content is distinct from old.content or new.excerpt is distinct from old.excerpt or new.featured_image_url is distinct from old.featured_image_url then
  new.config:=coalesce(new.config,'{}'::jsonb)||jsonb_build_object('nexus_approval',null);
 elsif coalesce(auth.role(),'')<>'service_role' and (new.config->'nexus_approval') is distinct from (old.config->'nexus_approval') then
  new.config:=coalesce(new.config,'{}'::jsonb)||jsonb_build_object('nexus_approval',null);
 end if;
 new.config:=coalesce(new.config,'{}'::jsonb)||jsonb_build_object('nexus_approval_required',true,'nexus_review_mode','autonomous','nexus_strategy_version',p.nexus_strategy_version,'nexus_strategy_snapshot',p.nexus_strategy);
 return new;
end $$;
revoke all on function private.nexus_article_context() from public,anon,authenticated;
create trigger nexus_article_context before insert or update on public.articles for each row execute function private.nexus_article_context();
-- Pause active billable work without deleting tasks or consuming retries.
update public.zica_brain_jobs set status='paused',locked_at=null,locked_by=null,lease_expires_at=null,
 result=coalesce(result,'{}'::jsonb)||'{"nexus_pause_reason":"global_paid_services_blocked","previous_work_preserved":true}'::jsonb
 where status in ('queued','retry','processing') and job_type in ('article_generate','image_generate','provider_health','news_agent_tick','scheduled_publish');
create function private.nexus_pause_billable_job() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('queued','retry','processing') and new.job_type in ('article_generate','image_generate','provider_health','news_agent_tick','scheduled_publish') then
  new.status:='paused';new.locked_at:=null;new.locked_by:=null;new.lease_expires_at:=null;
  if tg_op='UPDATE' then new.attempts:=old.attempts;end if;
  new.result:=coalesce(new.result,'{}'::jsonb)||'{"nexus_pause_reason":"global_paid_services_blocked"}'::jsonb;
 end if;return new;
end $$;
revoke all on function private.nexus_pause_billable_job() from public,anon,authenticated;
create trigger nexus_pause_billable_job before insert or update on public.zica_brain_jobs for each row execute function private.nexus_pause_billable_job();
create table public.nexus_content_plans (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),
 user_id uuid not null references auth.users(id),strategy_version integer not null,plan jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.nexus_content_plans enable row level security;
revoke all on public.nexus_content_plans from anon,authenticated;
grant select on public.nexus_content_plans to authenticated;grant all on public.nexus_content_plans to service_role;
create policy nexus_plan_owner_read on public.nexus_content_plans for select to authenticated using(user_id=(select auth.uid()));
-- Administrative lock also overrides organization budgets at the reservation boundary.
create or replace function private.nexus_reserve_operation(p_operation uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
begin raise exception 'global_paid_services_blocked';end $$;
revoke all on function private.nexus_reserve_operation(uuid) from public,anon,authenticated;
grant execute on function private.nexus_reserve_operation(uuid) to service_role;
