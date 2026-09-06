-- CORE-001: durable, tenant-scoped editorial planning. This migration creates
-- plans and queues only. It deliberately provides no publication transition.

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.editorial_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 3 and 160),
  portal text not null check (length(trim(portal)) between 2 and 160),
  category text not null check (length(trim(category)) between 2 and 120),
  audience text not null check (length(trim(audience)) between 2 and 240),
  city text not null check (length(trim(city)) between 2 and 120),
  frequency text not null check (frequency in ('once','daily','weekdays','weekly','monthly')),
  requested_quantity integer not null check (requested_quantity between 1 and 5000),
  status text not null default 'review' check (status in ('review','queued','processing','completed','partial','failed','cancelled')),
  publication_enabled boolean not null default false check (publication_enabled = false),
  estimated_input_tokens bigint not null default 0 check (estimated_input_tokens >= 0),
  estimated_output_tokens bigint not null default 0 check (estimated_output_tokens >= 0),
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  idempotency_key text not null check (length(idempotency_key) between 16 and 240),
  source_file_name text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table if not exists public.editorial_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  plan_id uuid not null references public.editorial_plans(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  keyword text not null check (length(trim(keyword)) between 2 and 500),
  normalized_keyword text not null check (length(trim(normalized_keyword)) between 2 and 500),
  keyword_sha256 text not null check (keyword_sha256 ~ '^[a-f0-9]{64}$'),
  category text,
  intent text,
  volume numeric,
  difficulty numeric,
  priority integer,
  duplicate boolean not null default false,
  duplicate_reason text check (duplicate_reason is null or duplicate_reason in ('within_import','existing_plan','existing_article')),
  status text not null default 'queued' check (status in ('duplicate','queued','processing','draft_ready','failed','cancelled')),
  current_step text not null default 'planning' check (current_step in ('planning','research','outline','draft','review','completed')),
  retry_count integer not null default 0 check (retry_count between 0 and 10),
  last_error_code text,
  last_error_message text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, sequence_no)
);

create table if not exists public.editorial_rss_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid references public.editorial_plans(id) on delete cascade,
  label text not null check (length(trim(label)) between 2 and 120),
  url text not null check (url ~* '^https?://[^[:space:]]+$' and length(url) <= 2048),
  status text not null default 'pending_validation' check (status in ('pending_validation','active','invalid','paused')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, project_id, url)
);

create table if not exists public.editorial_plan_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references public.editorial_plans(id) on delete cascade,
  storage_path text not null check (storage_path !~* '^data:'),
  original_name text not null check (length(trim(original_name)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size bigint not null check (byte_size between 1 and 15728640),
  status text not null default 'uploaded' check (status in ('uploaded','ready','rejected','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);

create table if not exists public.editorial_plan_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  plan_id uuid not null references public.editorial_plans(id) on delete cascade,
  item_id uuid references public.editorial_plan_items(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(trim(event_type)) between 3 and 80),
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists editorial_plans_org_status_idx on public.editorial_plans (organization_id, status, created_at desc);
create index if not exists editorial_plan_items_due_idx on public.editorial_plan_items (organization_id, status, next_attempt_at, sequence_no) where status in ('queued','failed');
create index if not exists editorial_plan_items_duplicate_idx on public.editorial_plan_items (organization_id, project_id, keyword_sha256, created_at desc);
create index if not exists editorial_rss_sources_project_idx on public.editorial_rss_sources (organization_id, project_id, status);
create index if not exists editorial_plan_audit_idx on public.editorial_plan_audit_events (organization_id, plan_id, occurred_at desc);

alter table public.editorial_plans enable row level security;
alter table public.editorial_plan_items enable row level security;
alter table public.editorial_rss_sources enable row level security;
alter table public.editorial_plan_assets enable row level security;
alter table public.editorial_plan_audit_events enable row level security;

create policy editorial_plans_member_select on public.editorial_plans for select to authenticated using (public.is_organization_member(organization_id));
create policy editorial_plan_items_member_select on public.editorial_plan_items for select to authenticated using (public.is_organization_member(organization_id));
create policy editorial_rss_sources_member_select on public.editorial_rss_sources for select to authenticated using (public.is_organization_member(organization_id));
create policy editorial_plan_assets_member_select on public.editorial_plan_assets for select to authenticated using (public.is_organization_member(organization_id));
create policy editorial_plan_audit_member_select on public.editorial_plan_audit_events for select to authenticated using (public.is_organization_member(organization_id));

create or replace function public.reject_editorial_audit_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'editorial_audit_is_append_only';
end;
$$;

drop trigger if exists editorial_audit_append_only on public.editorial_plan_audit_events;
create trigger editorial_audit_append_only before update or delete on public.editorial_plan_audit_events
for each row execute function public.reject_editorial_audit_mutation();

create or replace function public.create_editorial_plan(
  p_project_id uuid,
  p_name text,
  p_portal text,
  p_category text,
  p_audience text,
  p_city text,
  p_frequency text,
  p_requested_quantity integer,
  p_idempotency_key text,
  p_items jsonb,
  p_rss_sources jsonb default '[]'::jsonb,
  p_source_file_name text default null,
  p_estimated_input_tokens bigint default 0,
  p_estimated_output_tokens bigint default 0,
  p_estimated_credits integer default 0
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org uuid;
  v_plan public.editorial_plans;
  v_item jsonb;
  v_rss jsonb;
  v_normalized text;
  v_hash text;
  v_duplicate_reason text;
  v_sequence integer := 0;
  v_inserted integer := 0;
  v_duplicates integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select organization_id into v_org from public.projects where id = p_project_id;
  if v_org is null then raise exception 'project_not_found'; end if;
  if not public.has_organization_role(v_org, array['owner','admin','editor','campaign_manager']) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 5000 then raise exception 'invalid_items'; end if;
  if jsonb_typeof(p_rss_sources) <> 'array' or jsonb_array_length(p_rss_sources) > 100 then raise exception 'invalid_rss_sources'; end if;

  select * into v_plan from public.editorial_plans where organization_id = v_org and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('plan_id',v_plan.id,'status',v_plan.status,'idempotent_replay',true);
  end if;

  insert into public.editorial_plans (
    organization_id,project_id,created_by,name,portal,category,audience,city,frequency,
    requested_quantity,idempotency_key,source_file_name,estimated_input_tokens,
    estimated_output_tokens,estimated_credits,metadata
  ) values (
    v_org,p_project_id,auth.uid(),trim(p_name),trim(p_portal),trim(p_category),trim(p_audience),trim(p_city),p_frequency,
    p_requested_quantity,p_idempotency_key,nullif(trim(p_source_file_name),''),p_estimated_input_tokens,
    p_estimated_output_tokens,p_estimated_credits,jsonb_build_object('publication_locked',true,'schema_version',1)
  ) returning * into v_plan;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_sequence := v_sequence + 1;
    v_normalized := lower(regexp_replace(extensions.unaccent(trim(coalesce(v_item->>'keyword',''))), '[^a-zA-Z0-9]+', ' ', 'g'));
    v_normalized := regexp_replace(trim(v_normalized), '\s+', ' ', 'g');
    if length(v_normalized) < 2 then raise exception 'invalid_keyword_at_%', v_sequence; end if;
    v_hash := encode(digest(v_normalized, 'sha256'), 'hex');
    v_duplicate_reason := null;
    if exists(select 1 from public.editorial_plan_items i where i.organization_id=v_org and i.project_id=p_project_id and i.keyword_sha256=v_hash) then
      v_duplicate_reason := 'existing_plan';
    elsif exists(select 1 from public.articles a where a.organization_id=v_org and a.project_id=p_project_id and lower(regexp_replace(extensions.unaccent(trim(coalesce(a.keyword,''))), '[^a-zA-Z0-9]+', ' ', 'g'))=v_normalized) then
      v_duplicate_reason := 'existing_article';
    end if;
    if v_duplicate_reason is not null then v_duplicates := v_duplicates + 1; else v_inserted := v_inserted + 1; end if;
    insert into public.editorial_plan_items (
      organization_id,project_id,plan_id,sequence_no,keyword,normalized_keyword,keyword_sha256,
      category,intent,volume,difficulty,priority,duplicate,duplicate_reason,status
    ) values (
      v_org,p_project_id,v_plan.id,v_sequence,trim(v_item->>'keyword'),v_normalized,v_hash,
      nullif(trim(v_item->>'category'),''),nullif(trim(v_item->>'intent'),''),
      case when coalesce(v_item->>'volume','') ~ '^[0-9]+([.,][0-9]+)?$' then replace(v_item->>'volume',',','.')::numeric end,
      case when coalesce(v_item->>'difficulty','') ~ '^[0-9]+([.,][0-9]+)?$' then replace(v_item->>'difficulty',',','.')::numeric end,
      case when coalesce(v_item->>'priority','') ~ '^[0-9]+$' then (v_item->>'priority')::integer end,
      v_duplicate_reason is not null,v_duplicate_reason,case when v_duplicate_reason is null then 'queued' else 'duplicate' end
    );
  end loop;

  for v_rss in select value from jsonb_array_elements(p_rss_sources) loop
    if coalesce(v_rss->>'url','') !~* '^https?://[^[:space:]]+$' then raise exception 'invalid_rss_url'; end if;
    insert into public.editorial_rss_sources (organization_id,project_id,plan_id,label,url,created_by)
    values (v_org,p_project_id,v_plan.id,trim(coalesce(v_rss->>'label','Fonte RSS')),trim(v_rss->>'url'),auth.uid())
    on conflict (organization_id,project_id,url) do update set plan_id=excluded.plan_id,label=excluded.label,updated_at=now();
  end loop;

  insert into public.editorial_plan_audit_events (organization_id,project_id,plan_id,actor_user_id,event_type,to_status,details)
  values (v_org,p_project_id,v_plan.id,auth.uid(),'plan.created','review',jsonb_build_object('items',v_sequence,'ready',v_inserted,'duplicates',v_duplicates,'publication_locked',true));
  return jsonb_build_object('plan_id',v_plan.id,'status','review','items',v_sequence,'ready',v_inserted,'duplicates',v_duplicates,'idempotent_replay',false);
end;
$$;

create or replace function public.reprocess_editorial_plan_item(p_item_id uuid, p_expected_step text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.editorial_plan_items;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_item from public.editorial_plan_items where id=p_item_id for update;
  if not found then raise exception 'item_not_found'; end if;
  if not public.has_organization_role(v_item.organization_id,array['owner','admin','editor','campaign_manager']) then raise exception 'forbidden'; end if;
  if v_item.status <> 'failed' or v_item.current_step <> p_expected_step then raise exception 'item_not_reprocessable'; end if;
  update public.editorial_plan_items set status='queued',retry_count=retry_count+1,last_error_code=null,last_error_message=null,next_attempt_at=now(),updated_at=now() where id=p_item_id returning * into v_item;
  insert into public.editorial_plan_audit_events (organization_id,project_id,plan_id,item_id,actor_user_id,event_type,from_status,to_status,details)
  values(v_item.organization_id,v_item.project_id,v_item.plan_id,v_item.id,auth.uid(),'item.reprocess_requested','failed','queued',jsonb_build_object('resume_from_step',p_expected_step,'retry_count',v_item.retry_count));
  return jsonb_build_object('item_id',v_item.id,'status',v_item.status,'resume_from_step',v_item.current_step,'retry_count',v_item.retry_count);
end;
$$;

create or replace function public.register_editorial_plan_asset(
  p_plan_id uuid, p_storage_path text, p_original_name text, p_mime_type text, p_byte_size bigint
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan public.editorial_plans; v_asset_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_plan from public.editorial_plans where id=p_plan_id;
  if not found then raise exception 'plan_not_found'; end if;
  if not public.has_organization_role(v_plan.organization_id,array['owner','admin','editor','campaign_manager']) then raise exception 'forbidden'; end if;
  if split_part(p_storage_path,'/',1) <> v_plan.organization_id::text or split_part(p_storage_path,'/',2) <> v_plan.id::text then raise exception 'invalid_storage_path'; end if;
  insert into public.editorial_plan_assets (organization_id,project_id,plan_id,storage_path,original_name,mime_type,byte_size,created_by)
  values(v_plan.organization_id,v_plan.project_id,v_plan.id,p_storage_path,trim(p_original_name),p_mime_type,p_byte_size,auth.uid())
  on conflict (organization_id,storage_path) do update set original_name=excluded.original_name,mime_type=excluded.mime_type,byte_size=excluded.byte_size
  returning id into v_asset_id;
  insert into public.editorial_plan_audit_events (organization_id,project_id,plan_id,actor_user_id,event_type,details)
  values(v_plan.organization_id,v_plan.project_id,v_plan.id,auth.uid(),'asset.registered',jsonb_build_object('asset_id',v_asset_id,'mime_type',p_mime_type,'byte_size',p_byte_size));
  return v_asset_id;
end;
$$;

grant select on public.editorial_plans, public.editorial_plan_items, public.editorial_rss_sources, public.editorial_plan_assets, public.editorial_plan_audit_events to authenticated;
revoke all on function public.create_editorial_plan(uuid,text,text,text,text,text,text,integer,text,jsonb,jsonb,text,bigint,bigint,integer) from public, anon;
revoke all on function public.reprocess_editorial_plan_item(uuid,text) from public, anon;
revoke all on function public.register_editorial_plan_asset(uuid,text,text,text,bigint) from public, anon;
revoke all on function public.reject_editorial_audit_mutation() from public, anon, authenticated;
grant execute on function public.create_editorial_plan(uuid,text,text,text,text,text,text,integer,text,jsonb,jsonb,text,bigint,bigint,integer) to authenticated;
grant execute on function public.reprocess_editorial_plan_item(uuid,text) to authenticated;
grant execute on function public.register_editorial_plan_asset(uuid,text,text,text,bigint) to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('editorial-plan-assets','editorial-plan-assets',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy editorial_plan_assets_storage_select on storage.objects for select to authenticated using (
  bucket_id='editorial-plan-assets' and exists(select 1 from public.organization_members m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.status='active')
);
create policy editorial_plan_assets_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='editorial-plan-assets' and exists(select 1 from public.organization_members m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','editor','campaign_manager'))
);
create policy editorial_plan_assets_storage_update on storage.objects for update to authenticated using (
  bucket_id='editorial-plan-assets' and exists(select 1 from public.organization_members m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','editor','campaign_manager'))
) with check (
  bucket_id='editorial-plan-assets' and exists(select 1 from public.organization_members m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin','editor','campaign_manager'))
);

comment on table public.editorial_plans is 'Review-only editorial plans. Publication is structurally locked in CORE-001.';
comment on function public.create_editorial_plan is 'Idempotently creates a tenant-scoped review plan and durable queue without publishing.';
