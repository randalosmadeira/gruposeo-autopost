-- Manager-controlled commercial terms and publication authorization.
-- Prices are intentionally nullable until the CEO defines them in the panel.

alter table public.commercial_plans
  add column if not exists price_cents integer check (price_cents is null or price_cents >= 0),
  add column if not exists currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','quarterly','semiannual','annual')),
  add column if not exists overage_policy text not null default 'block' check (overage_policy in ('block','per_article','package')),
  add column if not exists overage_unit_cents integer check (overage_unit_cents is null or overage_unit_cents >= 0),
  add column if not exists overage_grace_articles integer not null default 0 check (overage_grace_articles between 0 and 10000);

create table if not exists public.organization_operating_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','quarterly','semiannual','annual')),
  project_limit_override integer check (project_limit_override is null or project_limit_override > 0),
  article_limit_monthly_override integer check (article_limit_monthly_override is null or article_limit_monthly_override > 0),
  overage_policy text not null default 'block' check (overage_policy in ('block','per_article','package')),
  overage_unit_cents integer check (overage_unit_cents is null or overage_unit_cents >= 0),
  overage_grace_articles integer not null default 0 check (overage_grace_articles between 0 and 10000),
  publication_approval_required boolean not null default true,
  publisher_roles text[] not null default array['owner','admin','editor']::text[],
  approver_roles text[] not null default array['owner','admin']::text[],
  allow_automated_publish boolean not null default false,
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(publisher_roles) > 0),
  check (cardinality(approver_roles) > 0),
  check (publisher_roles <@ array['owner','admin','editor','viewer','campaign_manager']::text[]),
  check (approver_roles <@ array['owner','admin','editor','viewer','campaign_manager']::text[]),
  check (approver_roles <@ publisher_roles),
  check (overage_policy = 'block' or overage_unit_cents is not null)
);

create table if not exists public.organization_policy_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (organization_id, version)
);

create table if not exists public.commercial_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.commercial_plans(id) on delete cascade on update cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (plan_id, version)
);

create index if not exists organization_policy_versions_changed_idx
on public.organization_policy_versions (organization_id, changed_at desc);
create index if not exists organization_policy_versions_changed_by_idx
on public.organization_policy_versions (changed_by) where changed_by is not null;
create index if not exists commercial_plan_versions_changed_idx
on public.commercial_plan_versions (plan_id, changed_at desc);
create index if not exists commercial_plan_versions_changed_by_idx
on public.commercial_plan_versions (changed_by) where changed_by is not null;

insert into public.organization_operating_policies (
  organization_id, price_cents, currency, billing_cycle, overage_policy,
  overage_unit_cents, overage_grace_articles, publication_approval_required,
  publisher_roles, approver_roles, allow_automated_publish
)
select o.id, p.price_cents, p.currency, p.billing_cycle, p.overage_policy,
       p.overage_unit_cents, p.overage_grace_articles,
       case when o.kind = 'internal' then false else true end,
       array['owner','admin','editor']::text[], array['owner','admin']::text[],
       (o.kind = 'internal')
from public.organizations o
join public.organization_subscriptions s on s.organization_id = o.id
join public.commercial_plans p on p.id = s.plan_id
on conflict (organization_id) do nothing;

alter table public.organization_operating_policies enable row level security;
alter table public.organization_policy_versions enable row level security;
alter table public.commercial_plan_versions enable row level security;

create policy operating_policies_member_select on public.organization_operating_policies
for select to authenticated using (public.is_organization_member(organization_id));
create policy operating_policies_ceo_insert on public.organization_operating_policies
for insert to authenticated with check (public.is_ceo());
create policy operating_policies_ceo_update on public.organization_operating_policies
for update to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy policy_versions_ceo_select on public.organization_policy_versions
for select to authenticated using (public.is_ceo());
create policy plan_versions_ceo_select on public.commercial_plan_versions
for select to authenticated using (public.is_ceo());

create or replace function public.update_commercial_plan_terms(
  p_plan_id text,
  p_price_cents integer,
  p_currency text,
  p_billing_cycle text,
  p_overage_policy text,
  p_overage_unit_cents integer,
  p_overage_grace_articles integer,
  p_changed_by uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plan public.commercial_plans%rowtype; v_version integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_billing_cycle not in ('monthly','quarterly','semiannual','annual')
     or p_overage_policy not in ('block','per_article','package')
     or p_price_cents is not null and p_price_cents < 0
     or p_overage_grace_articles not between 0 and 10000
     or p_overage_policy <> 'block' and p_overage_unit_cents is null then raise exception 'invalid_commercial_terms'; end if;
  update public.commercial_plans set
    price_cents=p_price_cents, currency=p_currency, billing_cycle=p_billing_cycle,
    overage_policy=p_overage_policy, overage_unit_cents=case when p_overage_policy='block' then null else p_overage_unit_cents end,
    overage_grace_articles=p_overage_grace_articles, updated_at=now()
  where id=p_plan_id returning * into v_plan;
  if not found then raise exception 'plan_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('plan:' || p_plan_id, 0));
  select coalesce(max(version),0)+1 into v_version from public.commercial_plan_versions where plan_id=p_plan_id;
  insert into public.commercial_plan_versions(plan_id,version,snapshot,changed_by)
  values (p_plan_id,v_version,to_jsonb(v_plan)-'created_at',p_changed_by);
  return jsonb_build_object('ok',true,'plan',to_jsonb(v_plan),'version',v_version);
end $$;

create or replace function public.update_organization_business_policy(
  p_organization_id uuid,
  p_plan_id text,
  p_subscription_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_price_cents integer,
  p_currency text,
  p_billing_cycle text,
  p_project_limit_override integer,
  p_article_limit_monthly_override integer,
  p_overage_policy text,
  p_overage_unit_cents integer,
  p_overage_grace_articles integer,
  p_publication_approval_required boolean,
  p_publisher_roles text[],
  p_approver_roles text[],
  p_allow_automated_publish boolean,
  p_changed_by uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_policy public.organization_operating_policies%rowtype; v_version integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'service_role_required'; end if;
  if not exists(select 1 from public.organizations where id=p_organization_id) then raise exception 'organization_not_found'; end if;
  if not exists(select 1 from public.commercial_plans where id=p_plan_id and active) then raise exception 'active_plan_required'; end if;
  if p_subscription_status not in ('trialing','active','past_due','suspended','cancelled') or p_period_end <= p_period_start then raise exception 'invalid_subscription_period'; end if;
  if p_currency !~ '^[A-Z]{3}$' or p_billing_cycle not in ('monthly','quarterly','semiannual','annual')
     or p_overage_policy not in ('block','per_article','package')
     or p_price_cents is not null and p_price_cents < 0
     or p_project_limit_override is not null and p_project_limit_override <= 0
     or p_article_limit_monthly_override is not null and p_article_limit_monthly_override <= 0
     or p_overage_grace_articles not between 0 and 10000
     or p_overage_policy <> 'block' and p_overage_unit_cents is null then raise exception 'invalid_business_policy'; end if;
  if cardinality(p_publisher_roles)=0 or cardinality(p_approver_roles)=0
     or not (p_publisher_roles <@ array['owner','admin','editor','viewer','campaign_manager']::text[])
     or not (p_approver_roles <@ p_publisher_roles) then raise exception 'invalid_publication_roles'; end if;
  perform pg_advisory_xact_lock(hashtextextended('organization-policy:' || p_organization_id::text, 0));
  update public.organization_subscriptions set plan_id=p_plan_id,status=p_subscription_status,
    current_period_start=p_period_start,current_period_end=p_period_end,updated_at=now()
  where organization_id=p_organization_id;
  if not found then
    insert into public.organization_subscriptions(organization_id,plan_id,status,current_period_start,current_period_end)
    values(p_organization_id,p_plan_id,p_subscription_status,p_period_start,p_period_end);
  end if;
  insert into public.organization_operating_policies(
    organization_id,price_cents,currency,billing_cycle,project_limit_override,
    article_limit_monthly_override,overage_policy,overage_unit_cents,overage_grace_articles,
    publication_approval_required,publisher_roles,approver_roles,allow_automated_publish,updated_by
  ) values (
    p_organization_id,p_price_cents,p_currency,p_billing_cycle,p_project_limit_override,
    p_article_limit_monthly_override,p_overage_policy,case when p_overage_policy='block' then null else p_overage_unit_cents end,p_overage_grace_articles,
    p_publication_approval_required,p_publisher_roles,p_approver_roles,p_allow_automated_publish,p_changed_by
  ) on conflict (organization_id) do update set
    price_cents=excluded.price_cents,currency=excluded.currency,billing_cycle=excluded.billing_cycle,
    project_limit_override=excluded.project_limit_override,article_limit_monthly_override=excluded.article_limit_monthly_override,
    overage_policy=excluded.overage_policy,overage_unit_cents=excluded.overage_unit_cents,overage_grace_articles=excluded.overage_grace_articles,
    publication_approval_required=excluded.publication_approval_required,publisher_roles=excluded.publisher_roles,
    approver_roles=excluded.approver_roles,allow_automated_publish=excluded.allow_automated_publish,
    version=public.organization_operating_policies.version+1,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_policy;
  v_version := v_policy.version;
  insert into public.organization_policy_versions(organization_id,version,snapshot,changed_by)
  values (p_organization_id,v_version,to_jsonb(v_policy)-'created_at',p_changed_by);
  return jsonb_build_object('ok',true,'policy',to_jsonb(v_policy),'version',v_version);
end $$;

create or replace function public.check_organization_publication_permission(
  p_organization_id uuid, p_user_id uuid, p_automated boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role text; v_policy public.organization_operating_policies%rowtype; v_allowed boolean;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'service_role_required'; end if;
  select role into v_role from public.organization_members
  where organization_id=p_organization_id and user_id=p_user_id and status='active';
  if v_role is null then return jsonb_build_object('allowed',false,'code','organization_membership_required'); end if;
  select * into v_policy from public.organization_operating_policies where organization_id=p_organization_id;
  if not found then return jsonb_build_object('allowed',false,'code','publication_policy_required'); end if;
  if p_automated and not v_policy.allow_automated_publish then
    return jsonb_build_object('allowed',false,'code','automated_publication_disabled','role',v_role);
  end if;
  v_allowed := case when v_policy.publication_approval_required
    then v_role=any(v_policy.approver_roles) else v_role=any(v_policy.publisher_roles) end;
  return jsonb_build_object('allowed',v_allowed,'code',case when v_allowed then 'allowed' else 'publication_approval_required' end,
    'role',v_role,'approval_required',v_policy.publication_approval_required,'automated',p_automated);
end $$;

revoke all on function public.update_commercial_plan_terms(text,integer,text,text,text,integer,integer,uuid) from public,anon,authenticated;
revoke all on function public.update_organization_business_policy(uuid,text,text,timestamptz,timestamptz,integer,text,text,integer,integer,text,integer,integer,boolean,text[],text[],boolean,uuid) from public,anon,authenticated;
revoke all on function public.check_organization_publication_permission(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.update_commercial_plan_terms(text,integer,text,text,text,integer,integer,uuid) to service_role;
grant execute on function public.update_organization_business_policy(uuid,text,text,timestamptz,timestamptz,integer,text,text,integer,integer,text,integer,integer,boolean,text[],text[],boolean,uuid) to service_role;
grant execute on function public.check_organization_publication_permission(uuid,uuid,boolean) to service_role;

create or replace function public.guard_project_plan_limit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_limit integer; v_count integer;
begin
  if new.organization_id is null then new.organization_id := public.default_organization_id(); end if;
  v_org := new.organization_id;
  if v_org is null then raise exception using errcode='23514',message='organization_required'; end if;
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and not public.has_organization_role(v_org,array['owner','admin','editor']) then raise exception using errcode='42501',message='organization_project_forbidden'; end if;
  select coalesce(op.project_limit_override,p.project_limit) into v_limit
  from public.organization_subscriptions s join public.commercial_plans p on p.id=s.plan_id
  left join public.organization_operating_policies op on op.organization_id=s.organization_id
  where s.organization_id=v_org and s.status in ('trialing','active','past_due');
  if v_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
    select count(*) into v_count from public.projects where organization_id=v_org and (tg_op='INSERT' or id<>new.id);
    if v_count >= v_limit then raise exception using errcode='23514',message='project_limit_reached'; end if;
  end if;
  return new;
end $$;

create or replace function public.reserve_article_quota(p_organization_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit integer; v_grace integer; v_overage text; v_used bigint; v_reserved bigint; v_id uuid; v_start date; v_end date;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'service_role_required'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'invalid_idempotency_key'; end if;
  v_start := date_trunc('month',now() at time zone 'UTC')::date;
  v_end := (date_trunc('month',now() at time zone 'UTC') + interval '1 month')::date;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':article',0));
  select r.id into v_id from public.usage_quota_reservations r where r.organization_id=p_organization_id and r.metric='article_generated' and r.idempotency_key=p_idempotency_key;
  if v_id is not null then return jsonb_build_object('ok',true,'reservation_id',v_id,'duplicate',true); end if;
  update public.usage_quota_reservations set status='expired',updated_at=now() where organization_id=p_organization_id and metric='article_generated' and status='reserved' and expires_at<=now();
  select coalesce(op.article_limit_monthly_override,p.article_limit_monthly),coalesce(op.overage_grace_articles,p.overage_grace_articles),coalesce(op.overage_policy,p.overage_policy)
  into v_limit,v_grace,v_overage from public.organization_subscriptions s join public.commercial_plans p on p.id=s.plan_id
  left join public.organization_operating_policies op on op.organization_id=s.organization_id
  where s.organization_id=p_organization_id and s.status in ('trialing','active','past_due');
  if not found then raise exception 'active_subscription_required'; end if;
  select coalesce(sum(amount),0) into v_used from public.organization_usage_ledger where organization_id=p_organization_id and metric='article_generated' and occurred_at>=v_start and occurred_at<v_end;
  select coalesce(sum(amount),0) into v_reserved from public.usage_quota_reservations where organization_id=p_organization_id and metric='article_generated' and period_start=v_start and status='reserved' and expires_at>now();
  if v_limit is not null and v_used+v_reserved >= v_limit + (case when v_overage='block' then 0 else v_grace end) then raise exception 'article_quota_exceeded'; end if;
  insert into public.usage_quota_reservations(organization_id,metric,period_start,period_end,idempotency_key,reserved_by)
  values(p_organization_id,'article_generated',v_start,v_end,p_idempotency_key,null) returning id into v_id;
  return jsonb_build_object('ok',true,'reservation_id',v_id,'duplicate',false,'used',v_used,'reserved',v_reserved,'limit',v_limit,'overage_policy',v_overage);
end $$;

comment on table public.organization_operating_policies is 'Effective commercial and publication policy controlled only by the Zica.IA Posts Manager Panel.';
comment on function public.check_organization_publication_permission(uuid,uuid,boolean) is 'Fail-closed backend authorization gate executed before WordPress publication.';
