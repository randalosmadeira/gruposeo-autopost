-- Supporter Avatar 1470 - private candidate auto-selection pipeline v2
-- Non-destructive migration: preserves all requests, jobs and outputs.

alter table public.supporter_avatar_requests
  add column if not exists pipeline_version text not null default 'auto-selector-v2',
  add column if not exists internal_selection jsonb not null default '{}'::jsonb;

alter table public.supporter_avatar_requests
  drop constraint if exists supporter_avatar_requests_status_check;

update public.supporter_avatar_requests
set status = case status
  when 'draft' then 'needs_input'
  when 'uploading' then 'needs_input'
  when 'queued' then 'retry'
  when 'processing' then 'retry'
  when 'qa' then 'needs_review'
  when 'blocked' then 'needs_review'
  when 'provider_not_configured' then 'needs_review'
  when 'expired' then 'needs_input'
  else status
end
where status not in ('uploaded','analyzing','candidate_selected','generating','qa','retry','regenerate','needs_input','needs_review','completed','failed');

alter table public.supporter_avatar_requests
  add constraint supporter_avatar_requests_status_check
  check (status = any (array[
    'uploaded'::text,
    'analyzing'::text,
    'candidate_selected'::text,
    'generating'::text,
    'qa'::text,
    'retry'::text,
    'regenerate'::text,
    'needs_input'::text,
    'needs_review'::text,
    'completed'::text,
    'failed'::text
  ]));

alter table public.supporter_avatar_jobs
  drop constraint if exists supporter_avatar_jobs_status_check;

update public.supporter_avatar_jobs
set status = case status
  when 'queued' then 'retry'
  when 'running' then 'retry'
  when 'blocked' then 'needs_review'
  when 'provider_not_configured' then 'needs_review'
  else status
end
where status not in ('queued','running','retry','regenerate','needs_review','completed','failed');

alter table public.supporter_avatar_jobs
  add constraint supporter_avatar_jobs_status_check
  check (status = any (array[
    'queued'::text,
    'running'::text,
    'retry'::text,
    'regenerate'::text,
    'needs_review'::text,
    'completed'::text,
    'failed'::text
  ]));

alter table public.supporter_avatar_outputs
  drop constraint if exists supporter_avatar_outputs_platform_check;

alter table public.supporter_avatar_outputs
  add constraint supporter_avatar_outputs_platform_check
  check (platform = any (array[
    'master'::text,
    'whatsapp'::text,
    'instagram'::text,
    'facebook'::text,
    'tiktok'::text,
    'square'::text,
    'portrait'::text,
    'landscape'::text
  ]));

create index if not exists idx_supporter_avatar_requests_pipeline_status
  on public.supporter_avatar_requests(status, updated_at desc);

create index if not exists idx_supporter_avatar_jobs_request_created
  on public.supporter_avatar_jobs(request_id, created_at desc);

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

  if not found then
    raise exception 'request_not_found';
  end if;

  if coalesce(v_request.source_count, 0) < 1 then
    raise exception 'upload_at_least_one_photo';
  end if;

  if not v_request.consent_image_use or not v_request.consent_terms then
    raise exception 'required_consents_missing';
  end if;

  select id into v_active
  from public.supporter_avatar_jobs
  where request_id = p_request_id
    and status in ('queued','running','retry','regenerate')
  order by created_at desc
  limit 1;

  if v_active is not null then
    raise exception 'active_generation_exists';
  end if;

  if coalesce(v_request.generation_count, 0) >= coalesce(v_request.max_generations, 3) then
    raise exception 'generation_limit_reached';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  update public.supporter_avatar_requests
  set status = 'analyzing',
      generation_count = generation_count + 1,
      supporter_approved_at = null,
      completed_at = null,
      pipeline_version = 'auto-selector-v2',
      updated_at = now()
  where id = p_request_id;

  insert into public.supporter_avatar_jobs(
    request_id,
    stage,
    provider,
    model,
    status,
    input_payload
  ) values (
    p_request_id,
    'auto-selector-v2',
    'openai',
    'gpt-image-2',
    'queued',
    jsonb_build_object(
      'pipeline_version', 'auto-selector-v2',
      'reason', left(coalesce(p_reason, 'submit'), 80),
      'dispatch_token_hash', v_token_hash,
      'candidate_selection', 'private-automatic',
      'social_outputs', jsonb_build_array('1080x1080','1080x1350','1200x630')
    )
  ) returning id into v_job_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'dispatch_token', v_token,
    'status', 'analyzing'
  );
end;
$$;

revoke all on function public.enqueue_supporter_avatar_generation(uuid, text) from public;
revoke all on function public.enqueue_supporter_avatar_generation(uuid, text) from anon;
revoke all on function public.enqueue_supporter_avatar_generation(uuid, text) from authenticated;
grant execute on function public.enqueue_supporter_avatar_generation(uuid, text) to service_role;
