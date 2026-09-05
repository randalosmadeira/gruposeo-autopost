-- Harden the multi-tenant foundation after database advisor review.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce(current_setting('request.jwt.claim.role',true),'')='service_role'
    or public.is_ceo()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.status='active'
    );
$$;

create or replace function private.has_organization_role(p_organization_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select coalesce(current_setting('request.jwt.claim.role',true),'')='service_role'
    or public.is_ceo()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
        and m.status='active' and m.role=any(p_roles)
    );
$$;

create or replace function private.default_organization_id()
returns uuid language sql stable security definer set search_path=public,private,pg_temp as $$
  select m.organization_id from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=(select auth.uid()) and m.status='active' and o.status in ('trialing','active','past_due')
  order by (m.role='owner') desc,m.created_at limit 1;
$$;

revoke all on function private.is_organization_member(uuid) from public,anon;
revoke all on function private.has_organization_role(uuid,text[]) from public,anon;
revoke all on function private.default_organization_id() from public,anon;
grant execute on function private.is_organization_member(uuid) to authenticated,service_role;
grant execute on function private.has_organization_role(uuid,text[]) to authenticated,service_role;
grant execute on function private.default_organization_id() to authenticated,service_role;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security invoker set search_path=public,private,pg_temp as $$
  select private.is_organization_member(p_organization_id);
$$;
create or replace function public.has_organization_role(p_organization_id uuid,p_roles text[])
returns boolean language sql stable security invoker set search_path=public,private,pg_temp as $$
  select private.has_organization_role(p_organization_id,p_roles);
$$;
create or replace function public.default_organization_id()
returns uuid language sql stable security invoker set search_path=public,private,pg_temp as $$
  select private.default_organization_id();
$$;

revoke all on function public.reserve_article_quota(uuid,text) from authenticated;
revoke all on function public.commit_article_quota(uuid,uuid,uuid,jsonb) from authenticated;
revoke all on function public.set_organization_openai_byok(uuid,text) from authenticated;
revoke all on function public.delete_organization_openai_byok(uuid) from authenticated;
grant execute on function public.reserve_article_quota(uuid,text) to service_role;
grant execute on function public.commit_article_quota(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.set_organization_openai_byok(uuid,text) to service_role;
grant execute on function public.delete_organization_openai_byok(uuid) to service_role;

drop policy if exists subscriptions_ceo_all on public.organization_subscriptions;
create policy subscriptions_ceo_insert on public.organization_subscriptions for insert to authenticated with check (public.is_ceo());
create policy subscriptions_ceo_update on public.organization_subscriptions for update to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy subscriptions_ceo_delete on public.organization_subscriptions for delete to authenticated using (public.is_ceo());

create index if not exists organizations_owner_user_idx on public.organizations(owner_user_id);
create index if not exists organization_subscriptions_plan_idx on public.organization_subscriptions(plan_id);
create index if not exists quota_reservations_reserved_by_idx on public.usage_quota_reservations(reserved_by) where reserved_by is not null;
create index if not exists usage_ledger_user_idx on public.organization_usage_ledger(user_id) where user_id is not null;
create index if not exists usage_ledger_project_idx on public.organization_usage_ledger(project_id) where project_id is not null;
create index if not exists usage_ledger_article_idx on public.organization_usage_ledger(article_id) where article_id is not null;
create index if not exists brand_assets_created_by_idx on public.organization_brand_assets(created_by) where created_by is not null;
create index if not exists media_derivatives_asset_idx on public.organization_media_derivatives(asset_id);
create index if not exists provider_credentials_created_by_idx on public.organization_provider_credentials(created_by) where created_by is not null;
create index if not exists circuit_breakers_organization_idx on public.project_circuit_breakers(organization_id);

comment on schema private is 'Non-exposed authorization helpers for Zica.IA Posts multi-tenancy.';
