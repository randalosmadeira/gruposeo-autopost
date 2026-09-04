-- Store article images in Storage/CDN instead of inflating the articles table
-- with multi-megabyte data URLs. Service-role Edge Functions are the only writers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article-images', 'article-images', true, 15728640, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "article images public read" on storage.objects;
create policy "article images public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'article-images');

do $$
declare
  target_job_id bigint;
begin
  select jobid into target_job_id from cron.job where jobname = 'zica-brain-every-minute';
  if target_job_id is not null then
    perform cron.alter_job(
      job_id := target_job_id,
      command := $command$
        select net.http_post(
          url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/zica-brain-tick',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-zica-automation-key',(select decrypted_secret from vault.decrypted_secrets where name='zica_brain_automation_key' limit 1)
          ),
          body := '{"maxJobs":5}'::jsonb,
          timeout_milliseconds := 120000
        );
      $command$
    );
  end if;
end $$;
