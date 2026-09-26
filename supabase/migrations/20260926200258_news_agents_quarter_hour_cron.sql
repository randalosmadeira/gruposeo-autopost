-- News-agent schedules support 00 and 30 minute slots. Run the dispatcher
-- every 15 minutes so the worker can execute the matching slot once.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job
    where jobname in ('zica-news-agents-hourly', 'zica-news-agents-15min')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'zica-news-agents-15min',
  '5,20,35,50 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/execute-news-agents',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-zica-automation-key',(select decrypted_secret from vault.decrypted_secrets where name='zica_news_automation_key' limit 1)
    ),
    body := '{"force":false,"dryRun":false}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);
