-- Real cron trigger for auto-process-rss.
--
-- Before this migration, nothing in the repo actually invoked
-- auto-process-rss on a schedule: no pg_cron entry, no caller from
-- zica-brain-tick, no GitHub Actions workflow. rss_schedules /
-- RSSScheduler.tsx let users configure a feed_url + frequency that was never
-- acted on. This mirrors the precedent in
-- 20260902051500_dual_ai_news_automation_ingress.sql (execute-news-agents)
-- for a second, independent cron job.
--
-- Auth-check note: auto-process-rss/index.ts's ingress-key check was
-- extended (see supabase/functions/auto-process-rss/index.ts) to accept
-- EITHER the pre-existing "news-agents" automation_ingress_keys row OR this
-- migration's new "rss-schedules" row, rather than reusing the "news-agents"
-- key outright. A dedicated row/secret lets this cron job be rotated or
-- disabled (via automation_ingress_keys.enabled) independently of
-- execute-news-agents, at the cost of one small, already-scoped code change
-- in that function (it was already being touched to add the SSRF fix in
-- this same changeset) — smaller and safer than teaching the auth check
-- about a whole new naming scheme, and safer than sharing one secret across
-- two unrelated cron jobs.

create table if not exists public.automation_ingress_keys (
  name text primary key,
  secret_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_ingress_keys enable row level security;

do $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'zica_rss_automation_key'
  limit 1;

  if coalesce(v_secret, '') = '' then
    v_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zica_rss_automation_key', 'Ingress secret for auto-process-rss cron');
  end if;

  insert into public.automation_ingress_keys(name, secret_hash, enabled, updated_at)
  values ('rss-schedules', encode(digest(v_secret, 'sha256'), 'hex'), true, now())
  on conflict (name) do update set
    secret_hash = excluded.secret_hash,
    enabled = true,
    updated_at = now();
end $$;

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'zica-auto-process-rss-15min' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'zica-auto-process-rss-15min',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/auto-process-rss',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-zica-automation-key',(select decrypted_secret from vault.decrypted_secrets where name='zica_rss_automation_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);
