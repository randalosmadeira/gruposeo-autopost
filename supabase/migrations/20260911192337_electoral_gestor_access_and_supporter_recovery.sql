-- Electoral campaign access is granted only to platform CEOs or to active
-- members of an organization whose active plan explicitly enables electoral.
-- This keeps the global Madeira 1470 campaign out of commercial tenants while
-- allowing the designated Gestor organization to operate the module.

create or replace function public.can_manage_electoral_campaign()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_ceo()
    or exists (
      select 1
      from public.organization_members m
      join public.organization_subscriptions s
        on s.organization_id = m.organization_id
       and s.status in ('trialing', 'active', 'past_due')
      join public.commercial_plans p
        on p.id = s.plan_id
      where m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.role in ('owner', 'admin', 'campaign_manager')
        and coalesce((p.features ->> 'electoral')::boolean, false)
    );
$$;

revoke all on function public.can_manage_electoral_campaign() from public, anon;
grant execute on function public.can_manage_electoral_campaign() to authenticated, service_role;

comment on function public.can_manage_electoral_campaign() is
  'Authorizes the internal electoral workspace from app_metadata CEO or an active electoral-plan organization role.';

drop policy if exists "electoral resources authenticated read" on public.electoral_portal_resources;
drop policy if exists "electoral resources ceo manage" on public.electoral_portal_resources;
create policy "electoral resources gestor read"
on public.electoral_portal_resources for select to authenticated
using (public.can_manage_electoral_campaign());
create policy "electoral resources gestor insert"
on public.electoral_portal_resources for insert to authenticated
with check (public.can_manage_electoral_campaign());
create policy "electoral resources gestor update"
on public.electoral_portal_resources for update to authenticated
using (public.can_manage_electoral_campaign())
with check (public.can_manage_electoral_campaign());
create policy "electoral resources gestor delete"
on public.electoral_portal_resources for delete to authenticated
using (public.can_manage_electoral_campaign());

drop policy if exists "electoral settings authenticated read" on public.electoral_portal_settings;
drop policy if exists "electoral settings ceo manage" on public.electoral_portal_settings;
create policy "electoral settings gestor read"
on public.electoral_portal_settings for select to authenticated
using (public.can_manage_electoral_campaign());
create policy "electoral settings gestor insert"
on public.electoral_portal_settings for insert to authenticated
with check (public.can_manage_electoral_campaign());
create policy "electoral settings gestor update"
on public.electoral_portal_settings for update to authenticated
using (public.can_manage_electoral_campaign())
with check (public.can_manage_electoral_campaign());
create policy "electoral settings gestor delete"
on public.electoral_portal_settings for delete to authenticated
using (public.can_manage_electoral_campaign());

drop policy if exists "CEO can read electoral optins" on public.electoral_campaign_optins;
drop policy if exists "CEO can update electoral optins" on public.electoral_campaign_optins;
drop policy if exists "CEO can delete electoral optins" on public.electoral_campaign_optins;
create policy "Gestor can read electoral optins"
on public.electoral_campaign_optins for select to authenticated
using (public.can_manage_electoral_campaign());
create policy "Gestor can update electoral optins"
on public.electoral_campaign_optins for update to authenticated
using (public.can_manage_electoral_campaign())
with check (public.can_manage_electoral_campaign());
create policy "Gestor can delete electoral optins"
on public.electoral_campaign_optins for delete to authenticated
using (public.can_manage_electoral_campaign());

-- Recovery is deliberately service-only. Public callers cannot move another
-- request. A request with no heartbeat for 30 minutes is preserved for review,
-- and no generation credit is consumed or refunded here.
create or replace function public.reconcile_stale_supporter_avatar_jobs(
  p_stale_after interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_ids uuid[] := '{}'::uuid[];
  v_changed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  select coalesce(array_agg(j.request_id), '{}'::uuid[])
    into v_request_ids
  from public.supporter_avatar_jobs j
  where j.status in ('queued', 'running', 'retry', 'regenerate')
    and coalesce(j.started_at, j.created_at) < now() - greatest(p_stale_after, interval '10 minutes')
    and not exists (
      select 1 from public.supporter_avatar_outputs o
      where o.request_id = j.request_id
    );

  if cardinality(v_request_ids) = 0 then return 0; end if;

  update public.supporter_avatar_jobs
     set status = 'needs_review',
         completed_at = coalesce(completed_at, now()),
         error_message = case
           when nullif(error_message, '') is null then 'stale_job_reconciled'
           else left(error_message || ' | stale_job_reconciled', 500)
         end
   where request_id = any(v_request_ids)
     and status in ('queued', 'running', 'retry', 'regenerate');

  update public.supporter_avatar_requests
     set status = 'needs_review', updated_at = now()
   where id = any(v_request_ids)
     and status in ('analyzing', 'candidate_selected', 'generating', 'qa', 'retry', 'regenerate');
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.reconcile_stale_supporter_avatar_jobs(interval) from public, anon, authenticated;
grant execute on function public.reconcile_stale_supporter_avatar_jobs(interval) to service_role;

comment on function public.reconcile_stale_supporter_avatar_jobs(interval) is
  'Moves stale supporter jobs without outputs to needs_review while preserving data and generation counters.';
