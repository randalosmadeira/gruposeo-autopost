-- Exclusive ledger for the manually authorized RDM editorial batch.
create table public.rdm_manual_editorial_runs (
  topic smallint not null check (topic between 1 and 13),
  stage text not null check (stage in ('draft', 'review')),
  actor_id uuid not null references auth.users(id),
  reserved_micros integer generated always as (
    case stage when 'draft' then 12000 else 18000 end
  ) stored,
  state text not null default 'reserved' check (state in ('reserved', 'completed', 'uncertain')),
  result text,
  created_at timestamptz not null default now(),
  primary key (topic, stage)
);
alter table public.rdm_manual_editorial_runs enable row level security;
revoke all on public.rdm_manual_editorial_runs from public, anon, authenticated;
grant select, insert, update on public.rdm_manual_editorial_runs to service_role;

create function public.reserve_rdm_manual_editorial(
  p_topic smallint, p_stage text, p_actor uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  batch_org constant uuid := '04f16755-dedb-4f1b-a0a3-1a83054b36a0';
  batch_project constant uuid := 'fab1032d-56a4-4e59-b3d4-4a68d3d4bf0a';
  ceiling integer;
begin
  if p_topic is null or p_topic not between 1 and 13 or p_stage is null or p_stage not in ('draft', 'review') then
    return false;
  end if;
  if not exists (select 1 from public.projects where id = batch_project and organization_id = batch_org)
    or not exists (
      select 1 from public.organization_members
      where organization_id = batch_org and user_id = p_actor and status = 'active' and role in ('owner', 'admin')
      union all
      select 1 from public.organizations where id = batch_org and owner_user_id = p_actor
    ) then
    return false;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(153972026);
  if p_stage = 'review' and not exists (
    select 1 from public.rdm_manual_editorial_runs where topic = p_topic and stage = 'draft' and state = 'completed'
  ) then
    return false;
  end if;
  ceiling := case p_stage when 'draft' then 12000 else 18000 end;
  if (select coalesce(sum(reserved_micros), 0) from public.rdm_manual_editorial_runs) + ceiling > 500000 then
    return false;
  end if;
  insert into public.rdm_manual_editorial_runs(topic, stage, actor_id)
  values (p_topic, p_stage, p_actor)
  on conflict (topic, stage) do nothing;
  return found;
end;
$$;
revoke all on function public.reserve_rdm_manual_editorial(smallint,text,uuid) from public, anon, authenticated;
grant execute on function public.reserve_rdm_manual_editorial(smallint,text,uuid) to service_role;
