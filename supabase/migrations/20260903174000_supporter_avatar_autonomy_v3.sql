-- Supporter Avatar V3: autonomous retries must not consume user generations before an output exists.

create or replace function public.enqueue_supporter_avatar_generation(
  p_request_id uuid,
  p_reason text default 'submit'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_request public.supporter_avatar_requests%rowtype;
  v_job_id uuid;
  v_token text;
  v_token_hash text;
  v_active uuid;
begin
  select * into v_request
  from public.supporter_avatar_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if coalesce(v_request.source_count, 0) < 1 then raise exception 'upload_at_least_one_photo'; end if;
  if not v_request.consent_image_use or not v_request.consent_terms then raise exception 'required_consents_missing'; end if;

  select id into v_active
  from public.supporter_avatar_jobs
  where request_id = p_request_id
    and status in ('queued','running','retry','regenerate')
  order by created_at desc
  limit 1;

  if v_active is not null then raise exception 'active_generation_exists'; end if;
  if coalesce(v_request.generation_count, 0) >= coalesce(v_request.max_generations, 3) then
    raise exception 'generation_limit_reached';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  update public.supporter_avatar_requests
  set status = 'analyzing',
      supporter_approved_at = null,
      completed_at = null,
      pipeline_version = 'auto-selector-v3',
      updated_at = now()
  where id = p_request_id;

  insert into public.supporter_avatar_jobs(
    request_id, stage, provider, model, status, input_payload
  ) values (
    p_request_id,
    'auto-selector-v3',
    'openai',
    'gpt-image-2',
    'queued',
    jsonb_build_object(
      'pipeline_version', 'auto-selector-v3',
      'reason', left(coalesce(p_reason, 'submit'), 80),
      'dispatch_token_hash', v_token_hash,
      'candidate_selection', 'private-automatic',
      'autonomous_recovery', true,
      'technical_retries_are_free', true,
      'social_outputs', jsonb_build_array('1080x1080','1080x1350','1200x630')
    )
  ) returning id into v_job_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'dispatch_token', v_token,
    'status', 'analyzing',
    'pipeline_version', 'auto-selector-v3'
  );
end;
$$;

create or replace function public.record_supporter_avatar_generation_result(
  p_request_id uuid,
  p_job_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.supporter_avatar_jobs%rowtype;
  v_count integer;
begin
  select * into v_job
  from public.supporter_avatar_jobs
  where id = p_job_id and request_id = p_request_id
  for update;

  if not found then raise exception 'job_not_found'; end if;

  if coalesce((v_job.input_payload->>'generation_counted')::boolean, false) then
    select generation_count into v_count from public.supporter_avatar_requests where id = p_request_id;
    return coalesce(v_count, 0);
  end if;

  update public.supporter_avatar_requests
  set generation_count = generation_count + 1,
      updated_at = now()
  where id = p_request_id
  returning generation_count into v_count;

  update public.supporter_avatar_jobs
  set input_payload = coalesce(input_payload, '{}'::jsonb) || jsonb_build_object(
    'generation_counted', true,
    'generation_counted_at', now()
  )
  where id = p_job_id;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.record_supporter_avatar_generation_result(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_supporter_avatar_generation_result(uuid, uuid) to service_role;

-- Refund only historical attempts that were consumed by known infrastructure/provider failures
-- and produced no output. Genuine QA/user-input failures are preserved unchanged.
update public.supporter_avatar_requests r
set generation_count = 0,
    status = case when coalesce(r.source_count, 0) > 0 then 'uploaded' else 'needs_input' end,
    pipeline_version = 'auto-selector-v3',
    updated_at = now()
where coalesce(r.generation_count, 0) > 0
  and not exists (
    select 1 from public.supporter_avatar_outputs o where o.request_id = r.id
  )
  and exists (
    select 1 from public.supporter_avatar_jobs j
    where j.request_id = r.id
      and coalesce(j.error_message, '') ~* '(legacy_dispatch_gateway_blocked|anthropic_vision_error|openai_vision_unparseable_json|edge_runtime_546|vision_provider_failure|dispatch_http_5|provider_|openai_image_error|openai_image_download_error|timeout|rate.?limit|http_429|http_5[0-9][0-9])'
  );
