-- Public supporter flow abuse controls without storing raw IP addresses.

create table if not exists public.supporter_avatar_abuse_events (
  id bigint generated always as identity primary key,
  action text not null check (action in ('create')),
  network_hash text,
  contact_hash text not null,
  created_at timestamptz not null default now(),
  check (network_hash is null or length(network_hash) = 64),
  check (length(contact_hash) = 64)
);

create index if not exists idx_supporter_abuse_network_created
  on public.supporter_avatar_abuse_events(network_hash, created_at desc)
  where network_hash is not null;
create index if not exists idx_supporter_abuse_contact_created
  on public.supporter_avatar_abuse_events(contact_hash, created_at desc);
create index if not exists idx_supporter_abuse_created
  on public.supporter_avatar_abuse_events(created_at desc);

alter table public.supporter_avatar_abuse_events enable row level security;
revoke all on table public.supporter_avatar_abuse_events from public, anon, authenticated;
grant all on table public.supporter_avatar_abuse_events to service_role;
grant usage, select on sequence public.supporter_avatar_abuse_events_id_seq to service_role;

create or replace function public.reserve_supporter_avatar_create(
  p_network_hash text,
  p_contact_hash text,
  p_network_daily_limit integer default 5,
  p_contact_weekly_limit integer default 3,
  p_global_hourly_limit integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_network_count integer := 0;
  v_contact_count integer := 0;
  v_global_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_contact_hash is null or p_contact_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_contact_hash';
  end if;
  if p_network_hash is not null and p_network_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_network_hash';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supporter-contact:' || p_contact_hash, 0));
  if p_network_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supporter-network:' || p_network_hash, 0));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('supporter-global-hour', 0));

  select count(*) into v_contact_count
  from public.supporter_avatar_abuse_events
  where contact_hash = p_contact_hash and created_at >= now() - interval '7 days';
  if v_contact_count >= greatest(1, least(p_contact_weekly_limit, 20)) then
    return jsonb_build_object('allowed', false, 'reason', 'contact_limit');
  end if;

  if p_network_hash is not null then
    select count(*) into v_network_count
    from public.supporter_avatar_abuse_events
    where network_hash = p_network_hash and created_at >= now() - interval '24 hours';
    if v_network_count >= greatest(1, least(p_network_daily_limit, 50)) then
      return jsonb_build_object('allowed', false, 'reason', 'network_limit');
    end if;
  end if;

  select count(*) into v_global_count
  from public.supporter_avatar_abuse_events
  where created_at >= now() - interval '1 hour';
  if v_global_count >= greatest(10, least(p_global_hourly_limit, 1000)) then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit');
  end if;

  insert into public.supporter_avatar_abuse_events(action, network_hash, contact_hash)
  values ('create', p_network_hash, p_contact_hash);

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.reserve_supporter_avatar_create(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_supporter_avatar_create(text, text, integer, integer, integer) to service_role;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'supporter-avatar-uploads';

comment on table public.supporter_avatar_abuse_events is
  'Minimal hashed rate-limit ledger for the public supporter request creation boundary.';

