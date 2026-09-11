-- Reconcile deterministic database drift without deleting files, rows, or credits.
create or replace function public.reconcile_stale_supporter_avatar_jobs(
  p_stale_after interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request_ids uuid[] := '{}'::uuid[];
  v_changed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  select coalesce(array_agg(distinct stale.request_id), '{}'::uuid[])
    into v_request_ids
  from (
    select j.request_id
    from public.supporter_avatar_jobs j
    where j.status in ('queued', 'running', 'retry', 'regenerate')
      and coalesce(j.started_at, j.created_at) < now() - greatest(p_stale_after, interval '10 minutes')
    for update skip locked
  ) stale;

  if cardinality(v_request_ids) = 0 then return 0; end if;

  update public.supporter_avatar_jobs j
     set status = 'needs_review',
         completed_at = coalesce(j.completed_at, now()),
         error_message = case
           when (select count(distinct o.platform) from public.supporter_avatar_outputs o
                 where o.request_id = j.request_id and o.platform in ('square','portrait','landscape')) = 0
             then 'stale_job_reconciled'
           when (select count(distinct o.platform) from public.supporter_avatar_outputs o
                 where o.request_id = j.request_id and o.platform in ('square','portrait','landscape')) < 3
             then 'stale_partial_pack_reconciled'
           else 'stale_complete_pack_review_required'
         end
   where j.request_id = any(v_request_ids)
     and j.status in ('queued', 'running', 'retry', 'regenerate');

  update public.supporter_avatar_requests r
     set source_count = (select count(*) from public.supporter_avatar_sources s where s.request_id = r.id),
         status = 'needs_review',
         updated_at = now()
   where r.id = any(v_request_ids)
     and r.status in ('analyzing', 'candidate_selected', 'generating', 'qa', 'retry', 'regenerate');
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.reconcile_stale_supporter_avatar_jobs(interval) from public, anon, authenticated;
grant execute on function public.reconcile_stale_supporter_avatar_jobs(interval) to service_role;

create or replace function public.audit_supporter_avatar_data_consistency()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  return jsonb_build_object(
    'sourceCountMismatch', (select count(*) from public.supporter_avatar_requests r
      where r.source_count <> (select count(*) from public.supporter_avatar_sources s where s.request_id = r.id)),
    'partialSocialPacks', (select count(*) from (
      select o.request_id from public.supporter_avatar_outputs o
      where o.platform in ('square','portrait','landscape')
      group by o.request_id having count(distinct o.platform) between 1 and 2
    ) partial),
    'activeJobsStale', (select count(*) from public.supporter_avatar_jobs j
      where j.status in ('queued','running','retry','regenerate')
        and coalesce(j.started_at,j.created_at) < now() - interval '30 minutes'),
    'activeJobDuplicates', (select count(*) from (
      select j.request_id from public.supporter_avatar_jobs j
      where j.status in ('queued','running','retry','regenerate')
      group by j.request_id having count(*) > 1
    ) duplicated),
    'checkedAt', now()
  );
end;
$$;

revoke all on function public.audit_supporter_avatar_data_consistency() from public, anon, authenticated;
grant execute on function public.audit_supporter_avatar_data_consistency() to service_role;

comment on function public.audit_supporter_avatar_data_consistency() is
  'Read-only, PII-free consistency counters. Reconciliation never deletes real data or changes generation credits.';
