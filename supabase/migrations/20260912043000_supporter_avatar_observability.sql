-- Aggregated, PII-free operational telemetry for the supporter pipeline.
create or replace function public.get_supporter_avatar_operational_metrics(
  p_hours integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 168)));
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  select jsonb_build_object(
    'windowHours', greatest(1, least(coalesce(p_hours, 24), 168)),
    'requests', jsonb_build_object(
      'created', count(*) filter (where r.created_at >= v_since),
      'completed', count(*) filter (where r.completed_at >= v_since),
      'needsReview', count(*) filter (where r.status = 'needs_review'),
      'needsInput', count(*) filter (where r.status = 'needs_input'),
      'failed', count(*) filter (where r.status = 'failed'),
      'activeStale', count(*) filter (
        where r.status in ('analyzing','candidate_selected','generating','qa','retry','regenerate')
          and r.updated_at < now() - interval '30 minutes'
      )
    ),
    'generation', jsonb_build_object(
      'packsCompleted', count(*) filter (where r.completed_at >= v_since),
      'averageSeconds', coalesce(round(avg(extract(epoch from (r.completed_at - r.created_at)))
        filter (where r.completed_at >= v_since))::numeric, 0)
    ),
    'abuse', jsonb_build_object(
      'reservations', (select count(*) from public.supporter_avatar_abuse_events a where a.created_at >= v_since)
    ),
    'generatedAt', now()
  ) into v_result
  from public.supporter_avatar_requests r;

  return v_result;
end;
$$;

revoke all on function public.get_supporter_avatar_operational_metrics(integer) from public, anon, authenticated;
grant execute on function public.get_supporter_avatar_operational_metrics(integer) to service_role;

comment on function public.get_supporter_avatar_operational_metrics(integer) is
  'Service-only, aggregate supporter pipeline telemetry. It never returns contact, token, network hash, or storage path.';
