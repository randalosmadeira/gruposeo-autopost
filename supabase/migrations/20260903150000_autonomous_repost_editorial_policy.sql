begin;

alter table public.articles
  add column if not exists source_type text,
  add column if not exists source_url text,
  add column if not exists source_name text,
  add column if not exists source_published_at timestamptz,
  add column if not exists source_context jsonb not null default '{}'::jsonb,
  add column if not exists source_fingerprint text,
  add column if not exists policy_mode text,
  add column if not exists editorial_decision jsonb not null default '{}'::jsonb,
  add column if not exists editorial_decision_version text,
  add column if not exists editorial_decision_at timestamptz,
  add column if not exists rss_feed_url text,
  add column if not exists rss_status text,
  add column if not exists rss_verified_at timestamptz,
  add column if not exists rss_verification_error text,
  add column if not exists rss_verification_attempts integer not null default 0;

update public.articles
set
  source_url = coalesce(source_url, nullif(config->>'source_url', '')),
  source_name = coalesce(source_name, nullif(config->>'source_name', '')),
  source_context = case
    when source_context = '{}'::jsonb then coalesce(config->'source_context', '{}'::jsonb)
    else source_context
  end,
  source_type = coalesce(
    source_type,
    case
      when config ? 'schedule_id' then 'rss_schedule'
      when config ? 'portal_id' then 'monitored_portal'
      when config ? 'agent_id' and coalesce(config->>'discovery_source', '') = 'google_news_rss' then 'google_news_rss'
      when config ? 'agent_id' then 'news_agent_rss'
      when config ? 'bulk_job_id' or coalesce(config->>'generation_source', '') = 'bulk' then 'bulk_generator'
      when nullif(config->>'source_url', '') is not null then 'manual_url'
      when nullif(content, '') is not null then 'manual_text'
      else 'other'
    end
  ),
  policy_mode = coalesce(policy_mode, 'legacy'),
  rss_status = coalesce(
    rss_status,
    case when status = 'published' and published_url is not null then 'rss_pending' else 'rss_not_applicable' end
  );

alter table public.articles
  alter column source_type set default 'other',
  alter column source_type set not null,
  alter column policy_mode set default 'ai_autonomous',
  alter column policy_mode set not null,
  alter column rss_status set default 'rss_not_applicable',
  alter column rss_status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'articles_source_type_format_check') then
    alter table public.articles
      add constraint articles_source_type_format_check
      check (source_type ~ '^[a-z][a-z0-9_]{1,63}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'articles_policy_mode_check') then
    alter table public.articles
      add constraint articles_policy_mode_check
      check (policy_mode in ('ai_autonomous', 'manual_override', 'legacy'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'articles_rss_status_check') then
    alter table public.articles
      add constraint articles_rss_status_check
      check (rss_status in ('rss_pending', 'rss_confirmed', 'rss_delayed', 'rss_missing', 'rss_not_applicable'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'articles_rss_verification_attempts_check') then
    alter table public.articles
      add constraint articles_rss_verification_attempts_check
      check (rss_verification_attempts >= 0);
  end if;
end $$;

create index if not exists articles_source_type_created_idx
  on public.articles (source_type, created_at desc);

create index if not exists articles_source_url_idx
  on public.articles (user_id, project_id, source_url)
  where source_url is not null;

create unique index if not exists articles_source_fingerprint_unique_idx
  on public.articles (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), source_fingerprint)
  where source_fingerprint is not null;

create index if not exists articles_rss_reconcile_idx
  on public.articles (rss_status, rss_verified_at, published_at)
  where status = 'published' and rss_status in ('rss_pending', 'rss_delayed');

alter table public.rss_schedules
  add column if not exists policy_mode text not null default 'ai_autonomous',
  add column if not exists policy_overrides jsonb not null default '{}'::jsonb;

alter table public.news_agents
  add column if not exists policy_mode text not null default 'ai_autonomous',
  add column if not exists policy_overrides jsonb not null default '{}'::jsonb;

alter table public.monitored_portals
  add column if not exists policy_mode text not null default 'ai_autonomous',
  add column if not exists policy_overrides jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rss_schedules_policy_mode_check') then
    alter table public.rss_schedules add constraint rss_schedules_policy_mode_check
      check (policy_mode in ('ai_autonomous', 'manual_override'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'news_agents_policy_mode_check') then
    alter table public.news_agents add constraint news_agents_policy_mode_check
      check (policy_mode in ('ai_autonomous', 'manual_override'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'monitored_portals_policy_mode_check') then
    alter table public.monitored_portals add constraint monitored_portals_policy_mode_check
      check (policy_mode in ('ai_autonomous', 'manual_override'));
  end if;
end $$;

alter table public.module_image_assets
  add column if not exists failure_count integer not null default 0,
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_failure_code text,
  add column if not exists cooldown_until timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'module_image_assets_failure_count_check') then
    alter table public.module_image_assets add constraint module_image_assets_failure_count_check
      check (failure_count >= 0);
  end if;
end $$;

create table if not exists public.editorial_policy_decisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  source_type text not null,
  source_url text,
  policy_mode text not null,
  prompt_version text not null,
  planner_provider text,
  planner_model text,
  reviewer_provider text,
  reviewer_model text,
  overall_confidence numeric(5,2),
  requires_human_review boolean not null default false,
  publish_action text not null default 'hold',
  risk_level text not null default 'medium',
  decision jsonb not null,
  overrides jsonb not null default '{}'::jsonb,
  rules_applied text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index if not exists editorial_policy_decisions_article_idx
  on public.editorial_policy_decisions (article_id, created_at desc);
create index if not exists editorial_policy_decisions_project_idx
  on public.editorial_policy_decisions (user_id, project_id, created_at desc);

alter table public.editorial_policy_decisions enable row level security;
drop policy if exists editorial_policy_decisions_select_own on public.editorial_policy_decisions;
create policy editorial_policy_decisions_select_own
  on public.editorial_policy_decisions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists editorial_policy_decisions_insert_own on public.editorial_policy_decisions;
create policy editorial_policy_decisions_insert_own
  on public.editorial_policy_decisions for insert
  to authenticated
  with check (auth.uid() = user_id);

create table if not exists public.rss_publication_verifications (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  wordpress_post_id bigint,
  wordpress_post_url text not null,
  rss_feed_url text,
  status text not null,
  attempt integer not null default 1,
  http_status integer,
  response_hash text,
  error_message text,
  checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rss_publication_verifications_status_check') then
    alter table public.rss_publication_verifications
      add constraint rss_publication_verifications_status_check
      check (status in ('rss_pending', 'rss_confirmed', 'rss_delayed', 'rss_missing', 'rss_not_applicable'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rss_publication_verifications_attempt_check') then
    alter table public.rss_publication_verifications
      add constraint rss_publication_verifications_attempt_check
      check (attempt >= 1);
  end if;
end $$;

create index if not exists rss_publication_verifications_article_idx
  on public.rss_publication_verifications (article_id, checked_at desc);
create index if not exists rss_publication_verifications_status_idx
  on public.rss_publication_verifications (status, checked_at);

alter table public.rss_publication_verifications enable row level security;
drop policy if exists rss_publication_verifications_select_own on public.rss_publication_verifications;
create policy rss_publication_verifications_select_own
  on public.rss_publication_verifications for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists rss_publication_verifications_insert_own on public.rss_publication_verifications;
create policy rss_publication_verifications_insert_own
  on public.rss_publication_verifications for insert
  to authenticated
  with check (auth.uid() = user_id);

create table if not exists public.image_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  module_key text not null,
  asset_id uuid references public.module_image_assets(id) on delete set null,
  attempt_number integer not null default 1,
  outcome text not null,
  error_code text,
  retryable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'image_generation_attempts_outcome_check') then
    alter table public.image_generation_attempts
      add constraint image_generation_attempts_outcome_check
      check (outcome in ('selected', 'fallback_selected', 'background_edited', 'synthetic', 'failed', 'skipped_cooldown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'image_generation_attempts_number_check') then
    alter table public.image_generation_attempts
      add constraint image_generation_attempts_number_check
      check (attempt_number >= 1 and attempt_number <= 12);
  end if;
end $$;

create index if not exists image_generation_attempts_article_idx
  on public.image_generation_attempts (article_id, created_at desc);
create index if not exists image_generation_attempts_asset_idx
  on public.image_generation_attempts (asset_id, created_at desc);

alter table public.image_generation_attempts enable row level security;
drop policy if exists image_generation_attempts_select_own on public.image_generation_attempts;
create policy image_generation_attempts_select_own
  on public.image_generation_attempts for select
  to authenticated
  using (auth.uid() = user_id);

comment on column public.articles.source_type is 'Normalized ingestion origin such as manual_url, manual_text, rss_schedule, news_agent_rss, google_news_rss, monitored_portal or bulk_generator.';
comment on column public.articles.editorial_decision is 'Structured autonomous editorial policy decision with confidence, reasons, guardrails and overrides.';
comment on column public.articles.rss_status is 'Independent distribution confirmation lifecycle. Publishing is not equivalent to RSS confirmation.';
comment on table public.editorial_policy_decisions is 'Immutable audit trail for autonomous and overridden editorial decisions.';
comment on table public.rss_publication_verifications is 'Per-attempt evidence that a WordPress publication is present in an RSS or Atom feed.';
comment on table public.image_generation_attempts is 'Bounded image selection and generation audit used to prevent retry storms.';

commit;
