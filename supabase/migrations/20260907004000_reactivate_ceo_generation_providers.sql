-- Reversible reactivation requested by the CEO for unrestricted internal generation.
-- Secret values remain in Vault and are never copied to application tables.
do $reactivate$
declare
  v_secret record;
  v_active_name text;
  v_existing uuid;
begin
  for v_secret in
    select id,name,decrypted_secret
    from vault.decrypted_secrets
    where name in ('paused_zica_ai_openai_api_key','paused_zica_ai_anthropic_api_key')
  loop
    v_active_name := replace(v_secret.name,'paused_','');
    select id into v_existing from vault.secrets where name=v_active_name limit 1;
    if v_existing is not null then delete from vault.secrets where id=v_existing; end if;
    perform vault.update_secret(
      v_secret.id,
      v_secret.decrypted_secret,
      v_active_name,
      'Reactivated for CEO unrestricted generation on 2026-09-07'
    );
  end loop;

  update public.app_config
  set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'ai_provider_pause',jsonb_build_object(
      'openai',false,
      'anthropic',false,
      'reactivated_at',now(),
      'requested_by','CEO',
      'mode','active_vault_credentials'
    )
  ),updated_at=now()
  where id=1;
end
$reactivate$;

-- The deployed constraint predated article_generate even though the Edge
-- Function already enqueues that job type. This rejected every bulk item.
alter table public.zica_brain_jobs drop constraint if exists zica_brain_jobs_job_type_check;
alter table public.zica_brain_jobs add constraint zica_brain_jobs_job_type_check check (
  job_type in (
    'article_generate','scheduled_publish','wordpress_reconcile','news_agent_tick',
    'provider_health','indexing_reconcile','llm_audit','semantic_audit',
    'link_audit','image_generate'
  )
);

alter table public.zica_brain_jobs drop constraint if exists zica_brain_jobs_status_check;
alter table public.zica_brain_jobs add constraint zica_brain_jobs_status_check check (
  status in ('queued','processing','retry','paused','completed','dead_letter','cancelled')
);

create or replace function public.control_zica_brain_batch(p_batch_id uuid,p_action text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_changed integer := 0;
begin
  if v_user is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if p_action='pause' then
    update public.zica_brain_jobs set status='paused',locked_at=null,locked_by=null,updated_at=now()
    where batch_id=p_batch_id and user_id=v_user and status in ('queued','retry');
  elsif p_action='resume' then
    update public.zica_brain_jobs set status='queued',next_attempt_at=now(),last_error=null,updated_at=now()
    where batch_id=p_batch_id and user_id=v_user and status='paused';
  elsif p_action='reprocess' then
    update public.zica_brain_jobs
    set status='queued',attempts=0,next_attempt_at=now(),last_error=null,result=null,
        completed_at=null,locked_at=null,locked_by=null,updated_at=now()
    where batch_id=p_batch_id and user_id=v_user and status in ('dead_letter','cancelled');
  else
    raise exception using errcode='22023',message='unsupported_batch_action';
  end if;
  get diagnostics v_changed=row_count;
  return jsonb_build_object('ok',true,'action',p_action,'batch_id',p_batch_id,'changed',v_changed);
end;
$$;

revoke all on function public.control_zica_brain_batch(uuid,text) from public,anon;
grant execute on function public.control_zica_brain_batch(uuid,text) to authenticated,service_role;
