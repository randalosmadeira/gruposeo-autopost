create table if not exists public.ai_provider_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai', 'anthropic', 'serper')),
  configured boolean not null default false,
  status text not null default 'not_configured' check (status in ('operational', 'not_configured', 'invalid_key', 'insufficient_credit', 'rate_limited', 'unavailable', 'timeout', 'unverified')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  capabilities jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.ai_provider_health enable row level security;

drop policy if exists "Users read own provider health" on public.ai_provider_health;
create policy "Users read own provider health"
on public.ai_provider_health for select to authenticated
using (auth.uid() = user_id);

revoke all on public.ai_provider_health from anon;
revoke insert, update, delete on public.ai_provider_health from authenticated;
grant select on public.ai_provider_health to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_provider_health'
  ) then
    alter publication supabase_realtime add table public.ai_provider_health;
  end if;
end $$;

comment on table public.ai_provider_health is
  'Per-user provider telemetry. Never stores credentials or raw provider responses.';
