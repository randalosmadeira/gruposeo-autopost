create table if not exists public.zica_brain_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,
  job_type text not null check (job_type in ('scheduled_publish','wordpress_reconcile','news_agent_tick','provider_health','indexing_reconcile','llm_audit','semantic_audit','link_audit')),
  status text not null default 'queued' check (status in ('queued','processing','retry','completed','dead_letter','cancelled')),
  priority integer not null default 50 check (priority between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.zica_brain_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  subsystem text not null,
  status text not null default 'unknown' check (status in ('healthy','degraded','offline','unknown')),
  last_heartbeat_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, subsystem)
);

alter table public.zica_brain_jobs enable row level security;
alter table public.zica_brain_state enable row level security;

create policy "Users view own brain jobs" on public.zica_brain_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users cancel own brain jobs" on public.zica_brain_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "CEO full access brain jobs" on public.zica_brain_jobs for all to authenticated using (public.is_ceo()) with check (public.is_ceo());

create policy "Users view own brain state" on public.zica_brain_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "CEO full access brain state" on public.zica_brain_state for all to authenticated using (public.is_ceo()) with check (public.is_ceo());

comment on table public.zica_brain_jobs is 'Persistent idempotent work queue for Zica.ai continuous-wave orchestration.';
comment on table public.zica_brain_state is 'Heartbeat and subsystem health state surfaced to the Zica.ai operator.';
