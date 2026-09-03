-- Editorial autonomy for every RSS repost schedule.
alter table public.rss_schedules
  add column if not exists editorial_autonomy boolean not null default true,
  add column if not exists last_decision jsonb,
  add column if not exists last_error text;

comment on column public.rss_schedules.editorial_autonomy is
  'When true, niche, analysis angle, length, emotional trigger, keyword and tone are selected by the editorial AI agent for each item in the repost queue.';

comment on column public.rss_schedules.last_decision is
  'Most recent normalized editorial decision emitted by the AI policy agent.';

comment on column public.rss_schedules.last_error is
  'Last execution error for operational observability without deleting queue records.';

update public.rss_schedules
set editorial_autonomy = true,
    updated_at = now()
where editorial_autonomy is distinct from true;

create index if not exists idx_rss_schedules_due_active
  on public.rss_schedules (next_run_at, id)
  where is_active is true;

-- Replace an older job with the same name, while preserving every schedule row.
do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'zica-rss-reposts-every-15-minutes'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'zica-rss-reposts-every-15-minutes',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/auto-process-rss',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-zica-automation-key', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'zica_news_automation_key'
          limit 1
        )
      ),
      body := '{"force":false,"dryRun":false,"maxSchedules":25,"maxItemsPerSchedule":3}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
