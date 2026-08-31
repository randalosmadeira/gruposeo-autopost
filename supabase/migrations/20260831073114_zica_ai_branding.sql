create table if not exists public.app_config (
  id smallint primary key default 1 check (id = 1),
  app_name text not null default 'Zica.ai',
  app_tagline text not null default 'Motor Autônomo de Tráfego Orgânico, GEO e Semântica para LLMs',
  support_email text not null default 'contato@zica.ai',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

revoke insert, update, delete on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

drop policy if exists "Public can read Zica.ai app config" on public.app_config;
create policy "Public can read Zica.ai app config"
on public.app_config
for select
to anon, authenticated
using (true);

insert into public.app_config (id, app_name, app_tagline, support_email, metadata, updated_at)
values (
  1,
  'Zica.ai',
  'Motor Autônomo de Tráfego Orgânico, GEO e Semântica para LLMs',
  'contato@zica.ai',
  jsonb_build_object(
    'slogan', 'Seu tráfego tá na zica? Deszica com Zica.ai.',
    'concept', 'Cérebro Central de Tráfego Orgânico e Ondas Virais 24/7',
    'agent_payload_name', 'zica_ai_traffic_brain',
    'primary_color', '#D4FF00',
    'secondary_color', '#00F0FF',
    'background_color', '#0D1117'
  ),
  now()
)
on conflict (id) do update set
  app_name = excluded.app_name,
  app_tagline = excluded.app_tagline,
  support_email = excluded.support_email,
  metadata = public.app_config.metadata || excluded.metadata,
  updated_at = now();

update public.generation_logs
set metadata = replace(metadata::text, 'content_factory_agent', 'zica_ai_traffic_brain')::jsonb
where metadata::text like '%content_factory_agent%';

update public.token_usage_logs
set metadata = replace(metadata::text, 'content_factory_agent', 'zica_ai_traffic_brain')::jsonb
where metadata::text like '%content_factory_agent%';

update public.seo_agent_runs
set details = replace(details::text, 'content_factory_agent', 'zica_ai_traffic_brain')::jsonb
where details::text like '%content_factory_agent%';

-- cron.job was audited before this migration and contained zero rows.
-- Database webhook triggers were also audited and none were present.
-- Do not write directly to cron.job here: hosted Supabase owns that table's permissions.
