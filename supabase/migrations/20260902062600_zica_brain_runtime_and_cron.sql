create index if not exists zica_brain_jobs_due_idx on public.zica_brain_jobs (status, next_attempt_at, priority desc, created_at) where status in ('queued','retry');
create index if not exists zica_brain_jobs_article_idx on public.zica_brain_jobs (article_id, job_type) where article_id is not null;
create index if not exists zica_brain_jobs_project_idx on public.zica_brain_jobs (project_id, job_type) where project_id is not null;
create index if not exists articles_schedule_due_idx on public.articles (scheduled_at) where scheduled_at is not null and status = 'ready';
create index if not exists articles_llm_audit_idx on public.articles (last_llm_audit_at) where status in ('ready','published');

create or replace function public.claim_zica_brain_jobs(p_limit integer default 20, p_worker text default 'brain')
returns setof public.zica_brain_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  return query
  update public.zica_brain_jobs j
     set status='processing', locked_at=now(), locked_by=left(coalesce(p_worker,'brain'),120),
         started_at=coalesce(j.started_at,now()), attempts=j.attempts+1, updated_at=now()
   where j.id in (
     select q.id from public.zica_brain_jobs q
      where q.status in ('queued','retry') and q.next_attempt_at<=now()
      order by q.priority desc,q.next_attempt_at,q.created_at
      for update skip locked
      limit greatest(1,least(coalesce(p_limit,20),100))
   ) returning j.*;
end;
$$;
revoke all on function public.claim_zica_brain_jobs(integer,text) from public,anon,authenticated;
grant execute on function public.claim_zica_brain_jobs(integer,text) to service_role;

create or replace function public.finish_zica_brain_job(p_id uuid,p_ok boolean,p_result jsonb default null,p_error text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_attempts int; v_max int;
begin
  if auth.role()<>'service_role' then raise exception 'forbidden'; end if;
  select attempts,max_attempts into v_attempts,v_max from public.zica_brain_jobs where id=p_id for update;
  if not found then return; end if;
  if p_ok then
    update public.zica_brain_jobs set status='completed',result=coalesce(p_result,'{}'::jsonb),last_error=null,completed_at=now(),locked_at=null,locked_by=null,updated_at=now() where id=p_id;
  elsif v_attempts>=v_max then
    update public.zica_brain_jobs set status='dead_letter',last_error=left(coalesce(p_error,'unknown_error'),2000),result=p_result,completed_at=now(),locked_at=null,locked_by=null,updated_at=now() where id=p_id;
  else
    update public.zica_brain_jobs set status='retry',last_error=left(coalesce(p_error,'unknown_error'),2000),result=p_result,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,greatest(0,v_attempts-1))::int)),locked_at=null,locked_by=null,updated_at=now() where id=p_id;
  end if;
end;
$$;
revoke all on function public.finish_zica_brain_job(uuid,boolean,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_zica_brain_job(uuid,boolean,jsonb,text) to service_role;

do $$ begin
  begin alter publication supabase_realtime add table public.zica_brain_jobs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.zica_brain_state; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.news_agents; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.agent_news; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.wordpress_stats; exception when duplicate_object then null; end;
end $$;

do $$ declare v_secret text; v_id uuid; begin
  if not exists(select 1 from vault.secrets where name='zica_brain_automation_key') then
    v_secret:=encode(gen_random_bytes(32),'hex');
    v_id:=vault.create_secret(v_secret,'zica_brain_automation_key','Zica.ai continuous brain cron authentication');
    insert into public.automation_ingress_keys(name,secret_hash,enabled,created_at,updated_at)
    values('zica-brain',encode(digest(v_secret,'sha256'),'hex'),true,now(),now())
    on conflict(name) do update set secret_hash=excluded.secret_hash,enabled=true,updated_at=now();
  elsif not exists(select 1 from public.automation_ingress_keys where name='zica-brain') then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='zica_brain_automation_key' limit 1;
    insert into public.automation_ingress_keys(name,secret_hash,enabled,created_at,updated_at)
    values('zica-brain',encode(digest(v_secret,'sha256'),'hex'),true,now(),now());
  end if;
end $$;

do $$ declare existing_id bigint; begin
  select jobid into existing_id from cron.job where jobname='zica-brain-every-minute' limit 1;
  if existing_id is not null then perform cron.unschedule(existing_id); end if;
  perform cron.schedule('zica-brain-every-minute','* * * * *',$cron$
    select net.http_post(
      url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/zica-brain-tick',
      headers := jsonb_build_object('Content-Type','application/json','x-zica-automation-key',(select decrypted_secret from vault.decrypted_secrets where name='zica_brain_automation_key' limit 1)),
      body := '{"maxJobs":20}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$);
end $$;
