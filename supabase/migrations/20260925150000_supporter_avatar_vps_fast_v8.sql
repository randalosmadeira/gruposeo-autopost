-- Gerador de apoiadores 1470: pipeline VPS v8 ("rápido").
-- Uma geração de imagem por pedido no orquestrador da VPS, identidade visual em vetor,
-- três formatos entregues: whatsapp 1080x1080, instagram 1080x1350, story 1080x1920.
-- Sem selo "gerada por IA" dentro da imagem (a informação fica na página).

alter table public.supporter_avatar_outputs drop constraint if exists supporter_avatar_outputs_platform_check;
alter table public.supporter_avatar_outputs add constraint supporter_avatar_outputs_platform_check
  check (platform = any (array['master'::text, 'whatsapp'::text, 'instagram'::text, 'facebook'::text, 'tiktok'::text, 'story'::text, 'square'::text, 'portrait'::text, 'landscape'::text]));

create unique index if not exists uq_supporter_avatar_v8_job_platform
  on public.supporter_avatar_outputs ((qa_payload ->> 'generation_job_id'), platform)
  where qa_payload ->> 'pipeline_version' = 'supporter-avatar-vps-v8'
    and nullif(qa_payload ->> 'generation_job_id', '') is not null;

create or replace function public.enqueue_supporter_avatar_generation(p_request_id uuid, p_reason text default 'submit'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_request public.supporter_avatar_requests%rowtype;
  v_job_id uuid;
  v_token text;
  v_token_hash text;
  v_active uuid;
begin
  select * into v_request from public.supporter_avatar_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if coalesce(v_request.source_count, 0) < 1 then raise exception 'upload_at_least_one_photo'; end if;
  if not v_request.consent_image_use or not v_request.consent_terms then raise exception 'required_consents_missing'; end if;
  select id into v_active from public.supporter_avatar_jobs
    where request_id = p_request_id and status in ('queued', 'running', 'retry', 'regenerate')
    order by created_at desc limit 1;
  if v_active is not null then raise exception 'active_generation_exists'; end if;
  if coalesce(v_request.generation_count, 0) >= coalesce(v_request.max_generations, 3) then raise exception 'generation_limit_reached'; end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  update public.supporter_avatar_requests
    set status = 'analyzing', supporter_approved_at = null, completed_at = null,
        pipeline_version = 'supporter-avatar-vps-v8', updated_at = now()
    where id = p_request_id;

  insert into public.supporter_avatar_jobs (request_id, stage, provider, model, status, input_payload)
  values (
    p_request_id, 'supporter-avatar-vps-v8', 'openai', 'gpt-image-2', 'queued',
    jsonb_build_object(
      'pipeline_version', 'supporter-avatar-vps-v8',
      'runtime', 'vps',
      'reason', left(coalesce(p_reason, 'submit'), 80),
      'dispatch_token_hash', v_token_hash,
      'candidate_selection', 'private-automatic',
      'autonomous_recovery', true,
      'technical_retries_are_free', true,
      'generation_counted', false,
      'social_outputs', jsonb_build_array('1080x1080', '1080x1350', '1080x1920')
    )
  ) returning id into v_job_id;

  return jsonb_build_object('job_id', v_job_id, 'dispatch_token', v_token, 'status', 'analyzing', 'pipeline_version', 'supporter-avatar-vps-v8');
end;
$function$;

create or replace function public.claim_supporter_avatar_generation_attempt(p_request_id uuid, p_job_id uuid, p_attempt integer)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_job public.supporter_avatar_jobs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_attempt < 1 or p_attempt > 5 then return false; end if;
  select * into v_job from public.supporter_avatar_jobs where id = p_job_id and request_id = p_request_id for update;
  if not found then return false; end if;
  if v_job.status not in ('queued', 'running', 'retry', 'regenerate') then return false; end if;
  if coalesce(v_job.attempts, 0) >= p_attempt then return false; end if;
  update public.supporter_avatar_jobs
    set status = 'running', stage = 'supporter-avatar-vps-v8', provider = 'openai', model = 'gpt-image-2',
        attempts = p_attempt, started_at = coalesce(started_at, now()), error_message = null
    where id = p_job_id;
  return true;
end;
$function$;

-- v8 é rápido: um job parado há mais de 12 minutos já é anomalia.
create or replace function public.reconcile_stale_supporter_avatar_jobs(p_stale_after interval default '00:12:00'::interval)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_request_ids uuid[] := '{}'::uuid[];
  v_changed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  select coalesce(array_agg(distinct stale.request_id), '{}'::uuid[]) into v_request_ids
  from (
    select j.request_id from public.supporter_avatar_jobs j
    where j.status in ('queued', 'running', 'retry', 'regenerate')
      and coalesce(j.started_at, j.created_at) < now() - greatest(p_stale_after, interval '10 minutes')
    for update skip locked
  ) stale;
  if cardinality(v_request_ids) = 0 then return 0; end if;

  update public.supporter_avatar_jobs j
    set status = 'needs_review',
        completed_at = coalesce(j.completed_at, now()),
        error_message = case
          when (select count(distinct o.platform) from public.supporter_avatar_outputs o where o.request_id = j.request_id and o.platform in ('whatsapp', 'instagram', 'story')) = 0 then 'stale_job_reconciled'
          when (select count(distinct o.platform) from public.supporter_avatar_outputs o where o.request_id = j.request_id and o.platform in ('whatsapp', 'instagram', 'story')) < 3 then 'stale_partial_pack_reconciled'
          else 'stale_complete_pack_review_required'
        end
    where j.request_id = any(v_request_ids) and j.status in ('queued', 'running', 'retry', 'regenerate');

  update public.supporter_avatar_requests r
    set source_count = (select count(*) from public.supporter_avatar_sources s where s.request_id = r.id),
        status = 'needs_review', updated_at = now()
    where r.id = any(v_request_ids) and r.status in ('analyzing', 'candidate_selected', 'generating', 'qa', 'retry', 'regenerate');
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$function$;

comment on function public.enqueue_supporter_avatar_generation(uuid, text) is
  'Cria o job do apoiador 1470 para o pipeline VPS v8 (uma geração, três formatos, sem selo de IA na imagem).';
