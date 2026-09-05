-- Zica.IA Posts multi-tenant commercial foundation.
-- Progressive migration: legacy user_id columns remain available during rollout.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  status text not null default 'active' check (status in ('trialing','active','past_due','suspended','cancelled')),
  kind text not null default 'client' check (kind in ('internal','client')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','editor','viewer','campaign_manager')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_idx
on public.organization_members (user_id, status, organization_id);

create table if not exists public.commercial_plans (
  id text primary key,
  name text not null,
  project_limit integer check (project_limit is null or project_limit > 0),
  article_limit_monthly integer check (article_limit_monthly is null or article_limit_monthly > 0),
  brand_asset_limit integer not null default 6 check (brand_asset_limit between 1 and 6),
  byok_allowed boolean not null default false,
  copilot_allowed boolean not null default true,
  active boolean not null default true,
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.commercial_plans
  (id, name, project_limit, article_limit_monthly, brand_asset_limit, byok_allowed, features)
values
  ('internal', 'Painel Gestor Interno', null, null, 6, true, '{"manager_panel":true,"electoral":true}'::jsonb),
  ('commercial', 'Zica.IA Posts Comercial', 3, 300, 6, false, '{"wordpress":true,"bulk":true,"seo_geo":true}'::jsonb),
  ('byok', 'Zica.IA Posts BYOK', 3, 650, 6, true, '{"wordpress":true,"bulk":true,"seo_geo":true,"openai_byok":true}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  project_limit = excluded.project_limit,
  article_limit_monthly = excluded.article_limit_monthly,
  brand_asset_limit = excluded.brand_asset_limit,
  byok_allowed = excluded.byok_allowed,
  features = excluded.features,
  updated_at = now();

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text not null references public.commercial_plans(id) on update cascade,
  status text not null default 'trialing' check (status in ('trialing','active','past_due','suspended','cancelled')),
  current_period_start timestamptz not null default date_trunc('month', now()),
  current_period_end timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  gateway text,
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create index if not exists organization_subscriptions_status_idx
on public.organization_subscriptions (status, current_period_end);

create table if not exists public.usage_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null check (metric in ('article_generated','article_published','copilot_request','media_derivation')),
  amount integer not null default 1 check (amount > 0),
  period_start date not null,
  period_end date not null,
  idempotency_key text not null,
  status text not null default 'reserved' check (status in ('reserved','committed','released','expired')),
  reserved_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, metric, idempotency_key),
  check (period_end > period_start)
);

create index if not exists usage_quota_reservations_hot_idx
on public.usage_quota_reservations (organization_id, metric, period_start, status, expires_at);

create table if not exists public.organization_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  reservation_id uuid unique references public.usage_quota_reservations(id) on delete set null,
  metric text not null check (metric in ('article_generated','article_published','copilot_request','media_derivation','input_tokens','output_tokens','cost_usd_micros')),
  amount bigint not null check (amount >= 0),
  provider text,
  model text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists organization_usage_ledger_rollup_idx
on public.organization_usage_ledger (organization_id, metric, occurred_at desc);

create table if not exists public.organization_brand_kits (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  logo_storage_path text,
  alternate_logo_storage_path text,
  primary_color text not null default '#D4FF00',
  secondary_color text not null default '#00F0FF',
  watermark_text text,
  font_family text not null default 'Inter',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slot smallint not null check (slot between 1 and 6),
  original_storage_path text not null check (original_storage_path !~* '^data:'),
  master_storage_path text check (master_storage_path is null or master_storage_path !~* '^data:'),
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','rejected','archived')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slot)
);

create table if not exists public.organization_media_derivatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.organization_brand_assets(id) on delete cascade,
  template_key text not null,
  variant_key text not null,
  storage_path text not null check (storage_path !~* '^data:'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  format text not null default 'webp' check (format = 'webp'),
  byte_size bigint check (byte_size is null or byte_size > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, asset_id, template_key, variant_key)
);

create table if not exists public.organization_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('openai')),
  vault_secret_name text not null unique,
  secret_last_four text not null check (secret_last_four ~ '^[A-Za-z0-9_-]{4}$'),
  status text not null default 'stored_unverified' check (status in ('stored_unverified','active','paused','revoked','invalid')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.copilot_tool_registry (
  tool_key text primary key,
  label text not null,
  risk_level text not null check (risk_level in ('read','write','external','destructive')),
  requires_confirmation boolean not null default false,
  enabled boolean not null default true,
  admin_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.copilot_tool_registry (tool_key,label,risk_level,requires_confirmation,admin_only) values
('suggest_keywords','Sugerir palavras-chave','read',false,false),
('generate_outline','Gerar estrutura editorial','write',false,false),
('audit_project_seo','Auditar SEO do projeto','read',false,false),
('find_broken_links','Localizar links quebrados','read',false,false),
('retry_owned_job','Reprocessar tarefa elegível','write',true,false),
('publish_article','Publicar artigo','external',true,false),
('pause_organization','Pausar organização','external',true,true),
('manage_provider_secrets','Gerenciar segredos de provedores','destructive',true,true)
on conflict (tool_key) do update set label=excluded.label,risk_level=excluded.risk_level,
requires_confirmation=excluded.requires_confirmation,admin_only=excluded.admin_only,updated_at=now();

create table if not exists public.project_circuit_breakers (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  state text not null default 'closed' check (state in ('closed','open','half_open')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  opened_at timestamptz,
  retry_after timestamptz,
  last_status_code integer,
  last_error_code text,
  updated_at timestamptz not null default now()
);

-- Create one internal organization per legacy owner without changing existing ownership.
insert into public.organizations (owner_user_id, name, slug, kind, status)
select u.user_id,
       coalesce(nullif(trim(p.full_name),''), 'Organização Zica.IA'),
       'legacy-' || left(replace(u.user_id::text,'-',''), 24),
       'internal', 'active'
from (
  select user_id from public.profiles
  union select user_id from public.projects
  union select user_id from public.articles
) u
left join public.profiles p on p.user_id = u.user_id
where not exists (select 1 from public.organizations o where o.owner_user_id = u.user_id);

insert into public.organization_members (organization_id,user_id,role,status)
select id,owner_user_id,'owner','active' from public.organizations
on conflict (organization_id,user_id) do update set role='owner',status='active',updated_at=now();

insert into public.organization_subscriptions (organization_id,plan_id,status)
select id, case when kind='internal' then 'internal' else 'commercial' end, 'active'
from public.organizations
on conflict (organization_id) do nothing;

insert into public.organization_brand_kits (organization_id)
select id from public.organizations on conflict (organization_id) do nothing;

alter table public.projects add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.articles add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.zica_brain_jobs add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.zica_brain_jobs add column if not exists batch_id uuid;
alter table public.zica_brain_jobs add column if not exists lease_expires_at timestamptz;
alter table public.token_usage_logs add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.projects p set organization_id=o.id from public.organizations o
where p.organization_id is null and o.owner_user_id=p.user_id;
update public.articles a set organization_id=p.organization_id
from public.projects p where a.organization_id is null and p.id=a.project_id and p.organization_id is not null;
update public.articles a set organization_id=o.id
from public.organizations o where a.organization_id is null and o.owner_user_id=a.user_id;
update public.zica_brain_jobs j set organization_id=p.organization_id
from public.projects p where j.organization_id is null and p.id=j.project_id and p.organization_id is not null;
update public.zica_brain_jobs j set organization_id=o.id
from public.organizations o where j.organization_id is null and o.owner_user_id=j.user_id;
update public.token_usage_logs l set organization_id=a.organization_id
from public.articles a where l.organization_id is null and a.id=l.article_id and a.organization_id is not null;
update public.token_usage_logs l set organization_id=o.id
from public.organizations o where l.organization_id is null and o.owner_user_id=l.user_id;

create index if not exists projects_organization_idx on public.projects (organization_id, created_at desc);
create index if not exists articles_organization_status_idx on public.articles (organization_id, status, created_at desc);
create index if not exists zica_brain_jobs_org_due_idx on public.zica_brain_jobs (organization_id,status,next_attempt_at,priority desc) where status in ('queued','retry');
create unique index if not exists zica_brain_jobs_org_idempotency_idx on public.zica_brain_jobs (organization_id,idempotency_key) where organization_id is not null;
create index if not exists token_usage_logs_org_created_idx on public.token_usage_logs (organization_id,created_at desc);

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_ceo() or exists (
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.status='active'
  );
$$;

create or replace function public.has_organization_role(p_organization_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_ceo() or exists (
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
      and m.status='active' and m.role=any(p_roles)
  );
$$;

revoke all on function public.is_organization_member(uuid) from public,anon;
revoke all on function public.has_organization_role(uuid,text[]) from public,anon;
grant execute on function public.is_organization_member(uuid) to authenticated,service_role;
grant execute on function public.has_organization_role(uuid,text[]) to authenticated,service_role;

create or replace function public.default_organization_id()
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select m.organization_id from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=(select auth.uid()) and m.status='active' and o.status in ('trialing','active','past_due')
  order by (m.role='owner') desc,m.created_at limit 1;
$$;
revoke all on function public.default_organization_id() from public,anon;
grant execute on function public.default_organization_id() to authenticated,service_role;

create or replace function public.guard_project_plan_limit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_limit integer; v_count integer;
begin
  if new.organization_id is null then new.organization_id := public.default_organization_id(); end if;
  v_org := new.organization_id;
  if v_org is null then raise exception using errcode='23514',message='organization_required'; end if;
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and not public.has_organization_role(v_org,array['owner','admin','editor']) then
    raise exception using errcode='42501',message='organization_project_forbidden';
  end if;
  select p.project_limit into v_limit from public.organization_subscriptions s
  join public.commercial_plans p on p.id=s.plan_id
  where s.organization_id=v_org and s.status in ('trialing','active','past_due');
  if v_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_org::text,0));
    select count(*) into v_count from public.projects where organization_id=v_org and (tg_op='INSERT' or id<>new.id);
    if v_count >= v_limit then raise exception using errcode='23514',message='project_limit_reached'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_project_plan_limit() from public,anon,authenticated;
drop trigger if exists guard_project_plan_limit on public.projects;
create trigger guard_project_plan_limit before insert or update of organization_id on public.projects
for each row execute function public.guard_project_plan_limit();

create or replace function public.reserve_article_quota(p_organization_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit integer; v_used bigint; v_reserved bigint; v_id uuid; v_start date; v_end date;
begin
  if length(trim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'invalid_idempotency_key'; end if;
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and not public.has_organization_role(p_organization_id,array['owner','admin','editor']) then raise exception 'forbidden'; end if;
  v_start := date_trunc('month',now() at time zone 'UTC')::date;
  v_end := (date_trunc('month',now() at time zone 'UTC') + interval '1 month')::date;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':article',0));
  select r.id into v_id from public.usage_quota_reservations r
   where r.organization_id=p_organization_id and r.metric='article_generated' and r.idempotency_key=p_idempotency_key;
  if v_id is not null then return jsonb_build_object('ok',true,'reservation_id',v_id,'duplicate',true); end if;
  update public.usage_quota_reservations set status='expired',updated_at=now()
   where organization_id=p_organization_id and metric='article_generated' and status='reserved' and expires_at<=now();
  select p.article_limit_monthly into v_limit from public.organization_subscriptions s
   join public.commercial_plans p on p.id=s.plan_id where s.organization_id=p_organization_id
   and s.status in ('trialing','active','past_due');
  if not found then raise exception 'active_subscription_required'; end if;
  select coalesce(sum(amount),0) into v_used from public.organization_usage_ledger
   where organization_id=p_organization_id and metric='article_generated' and occurred_at>=v_start and occurred_at<v_end;
  select coalesce(sum(amount),0) into v_reserved from public.usage_quota_reservations
   where organization_id=p_organization_id and metric='article_generated' and period_start=v_start and status='reserved' and expires_at>now();
  if v_limit is not null and v_used+v_reserved+1>v_limit then raise exception using errcode='23514',message='monthly_article_quota_reached'; end if;
  insert into public.usage_quota_reservations(organization_id,metric,period_start,period_end,idempotency_key,reserved_by)
  values(p_organization_id,'article_generated',v_start,v_end,p_idempotency_key,auth.uid()) returning id into v_id;
  return jsonb_build_object('ok',true,'reservation_id',v_id,'limit',v_limit,'used',v_used,'reserved',v_reserved+1,'duplicate',false);
end; $$;

create or replace function public.commit_article_quota(p_reservation_id uuid,p_project_id uuid default null,p_article_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.usage_quota_reservations; v_existing uuid;
begin
  select * into r from public.usage_quota_reservations where id=p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and not public.has_organization_role(r.organization_id,array['owner','admin','editor']) then raise exception 'forbidden'; end if;
  select id into v_existing from public.organization_usage_ledger where reservation_id=r.id;
  if v_existing is not null then return jsonb_build_object('ok',true,'duplicate',true,'ledger_id',v_existing); end if;
  if r.status<>'reserved' or r.expires_at<=now() then raise exception 'reservation_not_active'; end if;
  update public.usage_quota_reservations set status='committed',updated_at=now() where id=r.id;
  insert into public.organization_usage_ledger(organization_id,user_id,project_id,article_id,reservation_id,metric,amount,metadata)
  values(r.organization_id,auth.uid(),p_project_id,p_article_id,r.id,'article_generated',r.amount,coalesce(p_metadata,'{}'::jsonb)) returning id into v_existing;
  return jsonb_build_object('ok',true,'duplicate',false,'ledger_id',v_existing);
end; $$;

revoke all on function public.reserve_article_quota(uuid,text) from public,anon;
revoke all on function public.commit_article_quota(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.reserve_article_quota(uuid,text) to authenticated,service_role;
grant execute on function public.commit_article_quota(uuid,uuid,uuid,jsonb) to authenticated,service_role;

-- BYOK secret mutation. No function ever returns the secret value.
create or replace function public.set_organization_openai_byok(p_organization_id uuid,p_secret text)
returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_name text; v_id uuid; v_allowed boolean;
begin
  if not public.has_organization_role(p_organization_id,array['owner','admin']) then raise exception 'forbidden'; end if;
  select p.byok_allowed into v_allowed from public.organization_subscriptions s join public.commercial_plans p on p.id=s.plan_id
   where s.organization_id=p_organization_id and s.status in ('trialing','active','past_due');
  if coalesce(v_allowed,false)=false then raise exception 'byok_not_available_for_plan'; end if;
  if length(trim(coalesce(p_secret,'')))<20 then raise exception 'invalid_openai_key'; end if;
  v_name := 'zica_org_' || replace(p_organization_id::text,'-','') || '_openai';
  select id into v_id from vault.secrets where name=v_name limit 1;
  if v_id is null then perform vault.create_secret(trim(p_secret),v_name,'Zica.IA Posts organization OpenAI BYOK');
  else perform vault.update_secret(v_id,trim(p_secret),v_name,'Zica.IA Posts organization OpenAI BYOK'); end if;
  insert into public.organization_provider_credentials(organization_id,provider,vault_secret_name,secret_last_four,status,created_by)
  values(p_organization_id,'openai',v_name,right(trim(p_secret),4),'stored_unverified',auth.uid())
  on conflict(organization_id,provider) do update set vault_secret_name=excluded.vault_secret_name,
    secret_last_four=excluded.secret_last_four,status='stored_unverified',updated_at=now();
  return jsonb_build_object('ok',true,'provider','openai','status','stored_unverified','last_four',right(trim(p_secret),4));
end; $$;

create or replace function public.delete_organization_openai_byok(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_name text;
begin
  if not public.has_organization_role(p_organization_id,array['owner','admin']) then raise exception 'forbidden'; end if;
  select vault_secret_name into v_name from public.organization_provider_credentials where organization_id=p_organization_id and provider='openai';
  if v_name is not null then delete from vault.secrets where name=v_name; end if;
  update public.organization_provider_credentials set status='revoked',updated_at=now() where organization_id=p_organization_id and provider='openai';
  return jsonb_build_object('ok',true,'provider','openai','status','revoked');
end; $$;

revoke all on function public.set_organization_openai_byok(uuid,text) from public,anon;
revoke all on function public.delete_organization_openai_byok(uuid) from public,anon;
grant execute on function public.set_organization_openai_byok(uuid,text) to authenticated;
grant execute on function public.delete_organization_openai_byok(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.commercial_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.usage_quota_reservations enable row level security;
alter table public.organization_usage_ledger enable row level security;
alter table public.organization_brand_kits enable row level security;
alter table public.organization_brand_assets enable row level security;
alter table public.organization_media_derivatives enable row level security;
alter table public.organization_provider_credentials enable row level security;
alter table public.copilot_tool_registry enable row level security;
alter table public.project_circuit_breakers enable row level security;

create policy organizations_member_select on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy organizations_admin_update on public.organizations for update to authenticated using (public.has_organization_role(id,array['owner','admin'])) with check (public.has_organization_role(id,array['owner','admin']));
create policy organization_members_member_select on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy organization_members_admin_insert on public.organization_members for insert to authenticated with check (public.has_organization_role(organization_id,array['owner','admin']));
create policy organization_members_admin_update on public.organization_members for update to authenticated using (public.has_organization_role(organization_id,array['owner','admin'])) with check (public.has_organization_role(organization_id,array['owner','admin']));
create policy organization_members_admin_delete on public.organization_members for delete to authenticated using (public.has_organization_role(organization_id,array['owner','admin']));
create policy commercial_plans_authenticated_select on public.commercial_plans for select to authenticated using (active or public.is_ceo());
create policy commercial_plans_ceo_insert on public.commercial_plans for insert to authenticated with check (public.is_ceo());
create policy commercial_plans_ceo_update on public.commercial_plans for update to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy commercial_plans_ceo_delete on public.commercial_plans for delete to authenticated using (public.is_ceo());
create policy subscriptions_member_select on public.organization_subscriptions for select to authenticated using (public.is_organization_member(organization_id));
create policy subscriptions_ceo_all on public.organization_subscriptions for all to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy quota_reservations_member_select on public.usage_quota_reservations for select to authenticated using (public.is_organization_member(organization_id));
create policy usage_ledger_member_select on public.organization_usage_ledger for select to authenticated using (public.is_organization_member(organization_id));
create policy brand_kits_member_select on public.organization_brand_kits for select to authenticated using (public.is_organization_member(organization_id));
create policy brand_kits_editor_insert on public.organization_brand_kits for insert to authenticated with check (public.has_organization_role(organization_id,array['owner','admin','editor']));
create policy brand_kits_editor_update on public.organization_brand_kits for update to authenticated using (public.has_organization_role(organization_id,array['owner','admin','editor'])) with check (public.has_organization_role(organization_id,array['owner','admin','editor']));
create policy brand_kits_editor_delete on public.organization_brand_kits for delete to authenticated using (public.has_organization_role(organization_id,array['owner','admin']));
create policy brand_assets_member_select on public.organization_brand_assets for select to authenticated using (public.is_organization_member(organization_id));
create policy brand_assets_editor_insert on public.organization_brand_assets for insert to authenticated with check (public.has_organization_role(organization_id,array['owner','admin','editor']));
create policy brand_assets_editor_update on public.organization_brand_assets for update to authenticated using (public.has_organization_role(organization_id,array['owner','admin','editor'])) with check (public.has_organization_role(organization_id,array['owner','admin','editor']));
create policy brand_assets_editor_delete on public.organization_brand_assets for delete to authenticated using (public.has_organization_role(organization_id,array['owner','admin']));
create policy media_derivatives_member_select on public.organization_media_derivatives for select to authenticated using (public.is_organization_member(organization_id));
create policy provider_credentials_member_select on public.organization_provider_credentials for select to authenticated using (public.is_organization_member(organization_id));
create policy copilot_tools_authenticated_select on public.copilot_tool_registry for select to authenticated using (enabled and (not admin_only or public.is_ceo()));
create policy copilot_tools_ceo_insert on public.copilot_tool_registry for insert to authenticated with check (public.is_ceo());
create policy copilot_tools_ceo_update on public.copilot_tool_registry for update to authenticated using (public.is_ceo()) with check (public.is_ceo());
create policy copilot_tools_ceo_delete on public.copilot_tool_registry for delete to authenticated using (public.is_ceo());
create policy circuit_breakers_member_select on public.project_circuit_breakers for select to authenticated using (public.is_organization_member(organization_id));

-- Client project access now follows organization membership. Limits are enforced by trigger.
drop policy if exists "Users can create their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can view their own projects" on public.projects;
create policy projects_org_select on public.projects for select to authenticated using (public.is_organization_member(organization_id));
create policy projects_org_insert on public.projects for insert to authenticated with check (user_id=(select auth.uid()) and public.has_organization_role(organization_id,array['owner','admin','editor']));
create policy projects_org_update on public.projects for update to authenticated using (public.has_organization_role(organization_id,array['owner','admin','editor'])) with check (public.has_organization_role(organization_id,array['owner','admin','editor']));
create policy projects_org_delete on public.projects for delete to authenticated using (public.has_organization_role(organization_id,array['owner','admin']));

comment on table public.organizations is 'Tenant boundary for Zica.IA Posts; never shared with ZicaCortex.';
comment on table public.organization_provider_credentials is 'BYOK metadata only. Secret values live exclusively in Supabase Vault.';
comment on function public.reserve_article_quota(uuid,text) is 'Atomically reserves one monthly article unit with an idempotency key.';
