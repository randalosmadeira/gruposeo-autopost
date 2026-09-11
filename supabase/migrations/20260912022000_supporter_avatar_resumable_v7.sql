-- Supporter Avatar V7: reconcile the live enqueue contract and serialize Edge attempts.

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
    and status in ('queued', 'running', 'retry', 'regenerate')
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
      pipeline_version = 'supporter-avatar-resumable-v7',
      updated_at = now()
  where id = p_request_id;

  insert into public.supporter_avatar_jobs(
    request_id, stage, provider, model, status, input_payload
  ) values (
    p_request_id,
    'supporter-avatar-resumable-v7',
    'openai',
    'gpt-image-2',
    'queued',
    jsonb_build_object(
      'pipeline_version', 'supporter-avatar-resumable-v7',
      'reason', left(coalesce(p_reason, 'submit'), 80),
      'dispatch_token_hash', v_token_hash,
      'candidate_selection', 'private-automatic',
      'autonomous_recovery', true,
      'technical_retries_are_free', true,
      'generation_counted', false,
      'social_outputs', jsonb_build_array('1080x1080', '1080x1350', '1200x630')
    )
  ) returning id into v_job_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'dispatch_token', v_token,
    'status', 'analyzing',
    'pipeline_version', 'supporter-avatar-resumable-v7'
  );
end;
$$;

revoke all on function public.enqueue_supporter_avatar_generation(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_supporter_avatar_generation(uuid, text) to service_role;

create or replace function public.claim_supporter_avatar_generation_attempt(
  p_request_id uuid,
  p_job_id uuid,
  p_attempt integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.supporter_avatar_jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_attempt < 1 or p_attempt > 5 then return false; end if;

  select * into v_job
  from public.supporter_avatar_jobs
  where id = p_job_id and request_id = p_request_id
  for update;

  if not found then return false; end if;
  if v_job.status not in ('queued', 'running', 'retry', 'regenerate') then return false; end if;
  if coalesce(v_job.attempts, 0) >= p_attempt then return false; end if;

  update public.supporter_avatar_jobs
  set status = 'running',
      stage = 'supporter-avatar-resumable-v7',
      provider = 'openai',
      model = 'gpt-image-2',
      attempts = p_attempt,
      started_at = coalesce(started_at, now()),
      error_message = null
  where id = p_job_id;

  return true;
end;
$$;

revoke all on function public.claim_supporter_avatar_generation_attempt(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_supporter_avatar_generation_attempt(uuid, uuid, integer) to service_role;

create unique index if not exists uq_supporter_avatar_v7_job_platform
  on public.supporter_avatar_outputs ((qa_payload ->> 'generation_job_id'), platform)
  where qa_payload ->> 'pipeline_version' = 'supporter-avatar-resumable-v7'
    and nullif(qa_payload ->> 'generation_job_id', '') is not null;

comment on function public.claim_supporter_avatar_generation_attempt(uuid, uuid, integer) is
  'Atomically admits only a newer active Edge attempt for a supporter-avatar job.';

