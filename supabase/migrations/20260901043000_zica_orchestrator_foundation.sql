-- Zica.ai Orchestrator foundation — additive, credential-reference only.
create table if not exists public.zica_orchestrator_targets (
  target_key text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  site_origin text not null unique,
  site_url text not null,
  delivery_mode text not null check (delivery_mode in ('wordpress_rest','static_sftp')),
  credential_ref text not null,
  hmac_secret_ref text not null,
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_zica_orchestrator_targets_owner_active on public.zica_orchestrator_targets(owner_user_id,active);
create table if not exists public.zica_orchestrator_events (
  event_id uuid primary key,
  target_key text not null references public.zica_orchestrator_targets(target_key) on delete cascade,
  correlation_id text not null,
  event_type text not null,
  content_hash text not null,
  status text not null default 'queued' check (status in ('queued','processing','retry','completed','dead_letter')),
  attempts integer not null default 0 check (attempts>=0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_zica_orchestrator_events_target_status_updated on public.zica_orchestrator_events(target_key,status,updated_at desc);
alter table public.zica_orchestrator_targets enable row level security;
alter table public.zica_orchestrator_events enable row level security;
drop policy if exists "zica orchestrator targets select own" on public.zica_orchestrator_targets;
create policy "zica orchestrator targets select own" on public.zica_orchestrator_targets for select to authenticated using (owner_user_id=(select auth.uid()));
drop policy if exists "zica orchestrator targets insert own" on public.zica_orchestrator_targets;
create policy "zica orchestrator targets insert own" on public.zica_orchestrator_targets for insert to authenticated with check (owner_user_id=(select auth.uid()));
drop policy if exists "zica orchestrator targets update own" on public.zica_orchestrator_targets;
create policy "zica orchestrator targets update own" on public.zica_orchestrator_targets for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
drop policy if exists "zica orchestrator targets delete own" on public.zica_orchestrator_targets;
create policy "zica orchestrator targets delete own" on public.zica_orchestrator_targets for delete to authenticated using (owner_user_id=(select auth.uid()));
drop policy if exists "zica orchestrator events select own target" on public.zica_orchestrator_events;
create policy "zica orchestrator events select own target" on public.zica_orchestrator_events for select to authenticated using (exists(select 1 from public.zica_orchestrator_targets t where t.target_key=zica_orchestrator_events.target_key and t.owner_user_id=(select auth.uid())));
comment on table public.zica_orchestrator_targets is 'Zica Orchestrator target registry. Stores credential references only; never raw API/SSH secrets.';
comment on table public.zica_orchestrator_events is 'Idempotent event ledger for Zica Orchestrator jobs. Worker writes use service_role.';
