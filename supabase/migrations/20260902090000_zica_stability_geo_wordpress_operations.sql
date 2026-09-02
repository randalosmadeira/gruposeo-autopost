-- Zica Posts stability, scheduling, fixed image policy and WordPress operations.
-- Additive migration. No destructive data changes.

create table if not exists public.wordpress_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,
  operation_type text not null default 'publish' check (operation_type in ('publish','draft','sync')),
  status text not null default 'pending' check (status in ('scheduled','pending','processing','retry','completed','failed','cancelled')),
  scheduled_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  last_error text,
  result jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_wordpress_operations_user_status_schedule
  on public.wordpress_operations(user_id,status,scheduled_at,created_at desc);
create index if not exists idx_wordpress_operations_project_status
  on public.wordpress_operations(project_id,status,created_at desc);
create index if not exists idx_wordpress_operations_article
  on public.wordpress_operations(article_id,created_at desc);
create unique index if not exists uq_wordpress_operations_active_article
  on public.wordpress_operations(article_id,operation_type)
  where article_id is not null and status in ('scheduled','pending','processing','retry');

alter table public.wordpress_operations enable row level security;
drop policy if exists "wordpress operations select own" on public.wordpress_operations;
create policy "wordpress operations select own"
  on public.wordpress_operations for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.wordpress_operations from anon, authenticated;
grant select on public.wordpress_operations to authenticated;
grant all on public.wordpress_operations to service_role;

create table if not exists public.module_image_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  project_id uuid references public.projects(id) on delete cascade,
  required_asset_count smallint not null default 6 check (required_asset_count = 6),
  allow_ai_generation boolean not null default false,
  auto_select boolean not null default true,
  hero_width integer not null default 1200,
  hero_height integer not null default 630,
  body_width integer not null default 800,
  preferred_format text not null default 'webp' check (preferred_format in ('webp','avif')),
  max_hero_kb integer not null default 200,
  max_body_kb integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_module_image_policy_global
  on public.module_image_policies(user_id,module_key)
  where project_id is null;
create unique index if not exists uq_module_image_policy_project
  on public.module_image_policies(user_id,module_key,project_id)
  where project_id is not null;

create table if not exists public.module_image_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  project_id uuid references public.projects(id) on delete cascade,
  slot smallint not null check (slot between 1 and 6),
  label text not null,
  source_type text not null check (source_type in ('storage','external_url')),
  bucket_name text,
  storage_path text,
  external_url text,
  alt_text text not null default '',
  semantic_filename text not null,
  caption text not null default '',
  semantic_tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type='storage' and bucket_name is not null and storage_path is not null)
    or (source_type='external_url' and external_url is not null)
  )
);
create unique index if not exists uq_module_image_asset_slot_global
  on public.module_image_assets(user_id,module_key,slot)
  where project_id is null;
create unique index if not exists uq_module_image_asset_slot_project
  on public.module_image_assets(user_id,module_key,project_id,slot)
  where project_id is not null;
create index if not exists idx_module_image_assets_select
  on public.module_image_assets(user_id,module_key,project_id,is_active,slot);

create table if not exists public.module_image_selection_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  project_id uuid references public.projects(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  asset_id uuid not null references public.module_image_assets(id) on delete restrict,
  selector_provider text,
  selector_model text,
  selection_reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_module_image_selection_logs_article
  on public.module_image_selection_logs(article_id,created_at desc);
create index if not exists idx_module_image_selection_logs_user_module
  on public.module_image_selection_logs(user_id,module_key,created_at desc);

alter table public.module_image_policies enable row level security;
alter table public.module_image_assets enable row level security;
alter table public.module_image_selection_logs enable row level security;

drop policy if exists "module image policies select own" on public.module_image_policies;
create policy "module image policies select own" on public.module_image_policies for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "module image assets select own" on public.module_image_assets;
create policy "module image assets select own" on public.module_image_assets for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "module image logs select own" on public.module_image_selection_logs;
create policy "module image logs select own" on public.module_image_selection_logs for select to authenticated using (user_id=(select auth.uid()));
revoke insert, update, delete on public.module_image_policies from anon, authenticated;
revoke insert, update, delete on public.module_image_assets from anon, authenticated;
revoke insert, update, delete on public.module_image_selection_logs from anon, authenticated;
grant select on public.module_image_policies, public.module_image_assets, public.module_image_selection_logs to authenticated;
grant all on public.module_image_policies, public.module_image_assets, public.module_image_selection_logs to service_role;

-- Default policy: fixed pool only. AI generation must be explicitly enabled later.
with modules(module_key) as (
  values ('article'),('landing_page'),('repost'),('news'),('electoral'),('electoral_network')
), owners as (
  select distinct user_id from public.electoral_visual_assets
  where asset_kind='reference' and status in ('ready','approved')
)
insert into public.module_image_policies(user_id,module_key,allow_ai_generation,auto_select)
select owners.user_id, modules.module_key, false, true
from owners cross join modules
on conflict do nothing;

-- Build exactly six authorized fixed slots per module when the account has at least
-- three approved electoral references and three active official candidate presets.
with modules(module_key) as (
  values ('article'),('landing_page'),('repost'),('news'),('electoral'),('electoral_network')
), ranked_refs as (
  select
    user_id,
    id,
    storage_path,
    coalesce(nullif(alt_text,''),'Foto oficial cadastrada no módulo Zica.ai') as alt_text,
    row_number() over (partition by user_id order by is_default desc, created_at asc, id) as rn
  from public.electoral_visual_assets
  where asset_kind='reference' and status in ('ready','approved')
), owners as (
  select distinct user_id from ranked_refs where rn <= 3
), ranked_presets as (
  select
    slug,label,drive_download_url,prompt_hint,
    row_number() over (order by sort_order asc, slug) as rn
  from public.supporter_avatar_candidate_presets
  where is_active=true
), selected_sources as (
  select
    r.user_id,
    r.rn::smallint as slot,
    ('Foto fixa ' || r.rn::text) as label,
    'storage'::text as source_type,
    'electoral-assets'::text as bucket_name,
    r.storage_path,
    null::text as external_url,
    r.alt_text,
    ('dr-madeira-foto-oficial-' || r.rn::text || '.webp') as semantic_filename,
    ('Foto oficial selecionada automaticamente pelo Zica.ai, opção ' || r.rn::text || '.') as caption,
    array['dr madeira','foto oficial','identidade visual','conteudo institucional']::text[] as semantic_tags
  from ranked_refs r
  where r.rn <= 3
  union all
  select
    o.user_id,
    (p.rn + 3)::smallint as slot,
    p.label,
    'external_url'::text,
    null::text,
    null::text,
    p.drive_download_url,
    ('Foto oficial de referência: ' || p.label),
    ('dr-madeira-foto-oficial-' || (p.rn+3)::text || '.webp'),
    p.prompt_hint,
    array['dr madeira','foto oficial','identidade visual','1470']::text[]
  from owners o
  cross join ranked_presets p
  where p.rn <= 3
)
insert into public.module_image_assets(
  user_id,module_key,project_id,slot,label,source_type,bucket_name,storage_path,external_url,
  alt_text,semantic_filename,caption,semantic_tags,is_active
)
select
  s.user_id,m.module_key,null,s.slot,s.label,s.source_type,s.bucket_name,s.storage_path,s.external_url,
  s.alt_text,s.semantic_filename,s.caption,s.semantic_tags,true
from selected_sources s
cross join modules m
where s.slot between 1 and 6
on conflict do nothing;

create or replace function public.get_zica_automation_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare v_secret text;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if p_name not in ('zica_brain_automation_key','zica_news_automation_key') then raise exception 'unsupported_secret'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name=p_name limit 1;
  if v_secret is null then raise exception 'secret_not_found'; end if;
  return v_secret;
end;
$$;
revoke all on function public.get_zica_automation_secret(text) from public, anon, authenticated;
grant execute on function public.get_zica_automation_secret(text) to service_role;

create or replace function public.dispatch_due_wordpress_operations()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='zica_brain_automation_key'
  limit 1;
  if v_secret is null then return null; end if;

  select net.http_post(
    url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/wordpress-operations',
    headers := jsonb_build_object('Content-Type','application/json','x-zica-automation-key',v_secret),
    body := jsonb_build_object('action','process_due','limit',20)
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.dispatch_due_wordpress_operations() from public, anon, authenticated;

-- Replace only our named cron job, without touching unrelated schedules.
do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='zica-wordpress-operations-every-minute' loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;
select cron.schedule(
  'zica-wordpress-operations-every-minute',
  '* * * * *',
  $job$select public.dispatch_due_wordpress_operations();$job$
);

comment on table public.wordpress_operations is 'Canonical Zica Posts queue for WordPress publication, scheduling and retries.';
comment on table public.module_image_assets is 'Six-slot authorized image pool per Zica.ai module. Fixed-media selection precedes any generative fallback.';
comment on table public.module_image_selection_logs is 'Audit log explaining which authorized fixed image was selected for each content item.';
