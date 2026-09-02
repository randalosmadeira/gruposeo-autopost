create table if not exists public.automation_ingress_keys (
  name text primary key,
  secret_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_ingress_keys enable row level security;

create unique index if not exists agent_news_article_id_unique
  on public.agent_news(article_id)
  where article_id is not null;

do $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'zica_news_automation_key'
  limit 1;

  if coalesce(v_secret, '') = '' then
    v_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zica_news_automation_key', 'Ingress secret for execute-news-agents cron');
  end if;

  insert into public.automation_ingress_keys(name, secret_hash, enabled, updated_at)
  values ('news-agents', encode(digest(v_secret, 'sha256'), 'hex'), true, now())
  on conflict (name) do update set
    secret_hash = excluded.secret_hash,
    enabled = true,
    updated_at = now();
end $$;

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'zica-news-agents-hourly' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'zica-news-agents-hourly',
  '5 * * * *',
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
