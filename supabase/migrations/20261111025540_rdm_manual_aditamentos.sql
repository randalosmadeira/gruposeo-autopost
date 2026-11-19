create table public.rdm_manual_aditamento_runs (
  post_id integer primary key,
  actor_id uuid not null references auth.users(id),
  reserved_micros integer generated always as (3500) stored,
  state text not null default 'reserved' check (state in ('reserved', 'completed', 'uncertain')),
  result text,
  actual_usd_micros integer,
  created_at timestamptz not null default now()
);
alter table public.rdm_manual_aditamento_runs enable row level security;
revoke all on public.rdm_manual_aditamento_runs from public, anon, authenticated;
grant select, insert, update on public.rdm_manual_aditamento_runs to service_role;

create function public.reserve_rdm_manual_aditamento(p_post integer, p_actor uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_post is null or p_post not in (
    5791,5789,5787,5785,5783,5781,5779,5777,5769,5767,5765,5761,5759,5757,5753,5751,
    5749,5743,5741,5739,5737,5735,5733,5731,5729,5727,5723,5721,5717,5713,5711,5709,
    5707,5705,5703,5701,5699,5697,5695,5693,5691,5689,5687,5685,5683,5679,5677,5675,
    5671,5669,5667,5665,5663,5661,5659,5657,5655,5653,5651,5647,5645,5643,5641,5639,
    5637,5635,5633,5631,5629,5627,5625,5623,5621,5619,5617,5615,5613,5014,2186,1420
  ) or not exists (
    select 1 from public.organizations
    where id = '04f16755-dedb-4f1b-a0a3-1a83054b36a0' and owner_user_id = p_actor
  ) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(153972026);
  if (select coalesce(sum(reserved_micros), 0) from public.rdm_manual_editorial_runs)
     + (select coalesce(sum(reserved_micros), 0) from public.rdm_manual_aditamento_runs)
     + 3500 > 880000 then
    return false;
  end if;

  insert into public.rdm_manual_aditamento_runs (post_id, actor_id)
  values (p_post, p_actor) on conflict (post_id) do nothing;
  return found;
end;
$$;
revoke all on function public.reserve_rdm_manual_aditamento(integer,uuid) from public, anon, authenticated;
grant execute on function public.reserve_rdm_manual_aditamento(integer,uuid) to service_role;
