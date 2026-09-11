-- Restore the idempotent completion counter required by the V7 generator.

create or replace function public.record_supporter_avatar_generation_result(
  p_request_id uuid,
  p_job_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.supporter_avatar_jobs%rowtype;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  select * into v_job
  from public.supporter_avatar_jobs
  where id = p_job_id and request_id = p_request_id
  for update;

  if not found then raise exception 'job_not_found'; end if;

  if coalesce((v_job.input_payload ->> 'generation_counted')::boolean, false) then
    select generation_count into v_count
    from public.supporter_avatar_requests
    where id = p_request_id;
    return coalesce(v_count, 0);
  end if;

  update public.supporter_avatar_requests
  set generation_count = generation_count + 1,
      updated_at = now()
  where id = p_request_id
  returning generation_count into v_count;

  if v_count is null then raise exception 'request_not_found'; end if;

  update public.supporter_avatar_jobs
  set input_payload = coalesce(input_payload, '{}'::jsonb) || jsonb_build_object(
    'generation_counted', true,
    'generation_counted_at', now()
  )
  where id = p_job_id;

  return v_count;
end;
$$;

revoke all on function public.record_supporter_avatar_generation_result(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_supporter_avatar_generation_result(uuid, uuid) to service_role;

comment on function public.record_supporter_avatar_generation_result(uuid, uuid) is
  'Counts a completed supporter social pack once per generation job.';

