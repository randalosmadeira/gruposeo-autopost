-- Monitoramento automático da Velocidade (agendamento + alertas) e módulo de Backlinks (F2), por projeto.
-- Aditiva e reversível (supabase/rollbacks/20261119200000_monitoramento_velocidade_backlinks_rollback.sql). Não altera nenhuma tabela existente.
-- Reaproveita profile_assert_project_org() do Perfil do Projeto. Acesso: RLS ligada e nenhum grant para anon/authenticated;
-- as portas são as funções de borda `site-speed`, `backlinks` (usuário logado, papel conferido) e `site-monitor` (cron, chave de automação própria).
-- Limites de uso, preços e cobrança ficam para a fase final (decisão de 16/11/2026); os limites daqui são só contra abuso.

-- 1) Agendamento das medições de velocidade: um por projeto.
create table if not exists public.project_speed_schedules (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  devices text not null default 'mobile' check (devices in ('mobile', 'desktop', 'both')),
  extra_urls text[] not null default '{}' check (cardinality(extra_urls) <= 2),
  include_competitors boolean not null default false,
  alert_drop_points smallint not null default 10 check (alert_drop_points between 3 and 50),
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  progress smallint not null default 0 check (progress >= 0),
  consecutive_failures smallint not null default 0 check (consecutive_failures >= 0),
  lock_until timestamptz not null default 'epoch',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_speed_schedules_due_idx on public.project_speed_schedules (next_run_at) where enabled;
create index if not exists project_speed_schedules_org_idx on public.project_speed_schedules (organization_id);
create index if not exists project_speed_schedules_created_by_idx on public.project_speed_schedules (created_by);

-- 2) Avisos do monitoramento (velocidade e backlinks) numa lista só. O aviso fica até alguém dispensar.
create table if not exists public.project_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null check (source in ('speed', 'backlinks')),
  kind text not null check (kind in ('score_drop', 'field_worse', 'measure_failed', 'links_lost')),
  title text not null check (char_length(title) between 3 and 200),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  ref_url text check (ref_url is null or char_length(ref_url) <= 500),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null
);
create index if not exists project_alerts_project_idx on public.project_alerts (project_id, created_at desc);
create index if not exists project_alerts_open_idx on public.project_alerts (project_id) where dismissed_at is null;
create index if not exists project_alerts_org_idx on public.project_alerts (organization_id);
create index if not exists project_alerts_dismissed_by_idx on public.project_alerts (dismissed_by);

-- 3) Backlinks: cada linha é UMA página que (diz que) aponta para o site-alvo, com a prova da última verificação.
-- `origin` registra de onde veio a lista (Search Console, Bing, Ahrefs...). O sistema não inventa links: só guarda o que foi importado e o que a verificação viu.
create table if not exists public.project_backlinks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  target_host text not null check (char_length(target_host) between 3 and 200),
  kind text not null default 'own' check (kind in ('own', 'competitor')),
  source_url text not null check (char_length(source_url) between 8 and 1000),
  source_host text not null check (char_length(source_host) between 3 and 200),
  source_domain text not null check (char_length(source_domain) between 3 and 200),
  target_url text check (target_url is null or char_length(target_url) <= 1000),
  anchor text check (anchor is null or char_length(anchor) <= 300),
  link_attr text check (link_attr is null or link_attr in ('follow', 'nofollow', 'sponsored', 'ugc')),
  origin text not null default 'manual' check (origin ~ '^[a-z][a-z0-9_]{1,30}$'),
  status text not null default 'unverified' check (status in ('unverified', 'live', 'lost', 'dead', 'blocked')),
  http_status smallint check (http_status is null or http_status between 100 and 599),
  source_noindex boolean,
  links_found smallint check (links_found is null or links_found >= 0),
  check_error text check (check_error is null or char_length(check_error) <= 80),
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  status_changed_at timestamptz,
  last_live_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  constraint project_backlinks_unique unique (project_id, target_host, source_url)
);
create index if not exists project_backlinks_status_idx on public.project_backlinks (project_id, target_host, status);
create index if not exists project_backlinks_check_idx on public.project_backlinks (project_id, last_checked_at nulls first);
create index if not exists project_backlinks_domain_idx on public.project_backlinks (project_id, source_domain);
create index if not exists project_backlinks_org_idx on public.project_backlinks (organization_id);
create index if not exists project_backlinks_created_by_idx on public.project_backlinks (created_by);

-- 4) Reverificação automática dos backlinks: um interruptor por projeto.
create table if not exists public.project_backlink_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  recheck_days smallint not null default 14 check (recheck_days between 7 and 90),
  last_run_at timestamptz,
  lock_until timestamptz not null default 'epoch',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists project_backlink_settings_org_idx on public.project_backlink_settings (organization_id);
create index if not exists project_backlink_settings_updated_by_idx on public.project_backlink_settings (updated_by);

do $$
declare t text;
begin
  foreach t in array array['project_speed_schedules', 'project_alerts', 'project_backlinks', 'project_backlink_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_org', t);
    execute format('create trigger %I before insert or update of project_id, organization_id on public.%I for each row execute function public.profile_assert_project_org()', t || '_org', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- 5) Chave de automação própria do monitor (rotacionável/desligável sem afetar os outros cron) e o cron a cada 10 minutos.
-- A chave é gerada aqui dentro, guardada no cofre (vault) e só o hash fica na tabela: nunca passa por quem aplica a migração.
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
  v_job record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'zica_site_monitor_key' limit 1;
  if coalesce(v_secret, '') = '' then
    v_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zica_site_monitor_key', 'Ingress secret for site-monitor cron');
  end if;
  insert into public.automation_ingress_keys(name, secret_hash, enabled, updated_at)
  values ('site-monitor', encode(digest(v_secret, 'sha256'), 'hex'), true, now())
  on conflict (name) do update set secret_hash = excluded.secret_hash, enabled = true, updated_at = now();

  for v_job in select jobid from cron.job where jobname = 'zica-site-monitor-10min' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'zica-site-monitor-10min',
    '3,13,23,33,43,53 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/site-monitor',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-zica-automation-key',(select decrypted_secret from vault.decrypted_secrets where name='zica_site_monitor_key' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
    $cmd$
  );
end $$;
