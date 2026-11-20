-- Indexação avançada + barramento de eventos do projeto (núcleo único de módulos).
-- Aditiva e reversível (supabase/rollbacks/20261120500000_indexacao_e_eventos_rollback.sql). Não altera nenhuma tabela existente.
--  1) project_events: linha do tempo do projeto. Módulos PUBLICAM fatos (módulo, tipo, assunto, dados); outros módulos e a tela LEEM. Só acrescenta (sem update).
--  2) index_urls / index_status / index_submissions / index_hygiene / index_keys: inventário de URLs do projeto, estado de indexação por motor,
--     histórico de envios, checklist de higiene e chaves do IndexNow (arquivo público /<chave>.txt do próprio site).
--  3) indexation_gsc_pages(): soma de impressões/cliques por página do Search Console feita NO BANCO (a tabela tem dezenas de milhares de linhas).
--  4) project_indexation_summary(): números de indexação por projeto para a saúde do projeto (Central de Projetos).
-- Reaproveita profile_assert_project_org() do Perfil do Projeto (a linha só pode apontar para projeto da própria organização).
-- Acesso: RLS ligada e nenhum grant para anon/authenticated; a única porta é a função de borda `engine` (chave de serviço), que confere participação e papel.
-- NADA aqui chama serviço pago: IndexNow, Bing Webmaster e Search Console (URL Inspection) são gratuitos.

create schema if not exists private;

-- 1) Barramento de eventos. `kind` no formato modulo.fato (minúsculas e sublinhado). Dados sem segredos: quem grava limpa o conteúdo.
create table if not exists public.project_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  module text not null check (char_length(module) between 2 and 40),
  kind text not null check (char_length(kind) between 3 and 80 and kind ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  subject jsonb not null default '{}'::jsonb check (jsonb_typeof(subject) = 'object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists project_events_project_idx on public.project_events (project_id, created_at desc);
create index if not exists project_events_module_idx on public.project_events (project_id, module, created_at desc);
create index if not exists project_events_org_idx on public.project_events (organization_id);

-- Só acrescenta: editar um fato publicado falsificaria a linha do tempo. (Apagar continua possível: exclusão do projeto, cascata.)
create or replace function public.project_events_append_only() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'project_events_append_only';
end $$;
revoke all on function public.project_events_append_only() from public, anon, authenticated;
drop trigger if exists project_events_no_update on public.project_events;
create trigger project_events_no_update before update on public.project_events for each row execute function public.project_events_append_only();

-- 2) Inventário de URLs do projeto (uma linha por URL normalizada: https, sem fragmento e sem parâmetros de campanha).
create table if not exists public.index_urls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null check (char_length(url) between 10 and 2048),
  host text not null check (char_length(host) between 3 and 255),
  path text not null default '/' check (char_length(path) <= 2048),
  source text not null check (source in ('sitemap', 'search_console', 'artigo', 'manual', 'varredura')),
  taxonomy_node_id uuid,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  in_sitemap boolean not null default false,
  in_search_console boolean not null default false,
  gsc_impressions integer not null default 0 check (gsc_impressions >= 0),
  gsc_clicks integer not null default 0 check (gsc_clicks >= 0),
  article_id uuid,
  -- idioma/país detectado (pasta /en/, subdomínio de.exemplo.com ou <html lang>); null = o endereço não diz. Nada supõe idioma ou país.
  lang text check (lang is null or char_length(lang) <= 20),
  lastmod date,
  changed_at timestamptz not null default now(),
  http_status integer check (http_status is null or http_status between 0 and 999),
  canonical text check (canonical is null or char_length(canonical) <= 2048),
  robots_meta text check (robots_meta is null or char_length(robots_meta) <= 300),
  x_robots text check (x_robots is null or char_length(x_robots) <= 300),
  redirect_to text check (redirect_to is null or char_length(redirect_to) <= 2048),
  https_redirect boolean,
  soft404_suspect boolean not null default false,
  check_error text check (check_error is null or char_length(check_error) <= 120),
  last_checked_at timestamptz,
  constraint index_urls_project_url_unique unique (project_id, url)
);
create index if not exists index_urls_project_host_idx on public.index_urls (project_id, host);
create index if not exists index_urls_project_checked_idx on public.index_urls (project_id, last_checked_at nulls first);
create index if not exists index_urls_org_idx on public.index_urls (organization_id);
create index if not exists index_urls_node_idx on public.index_urls (taxonomy_node_id);

-- A taxonomia pode não estar instalada ainda: a chave estrangeira só é criada se a tabela existir (apagar o nó apenas solta o vínculo).
do $$
begin
  if to_regclass('public.project_taxonomy_nodes') is not null
     and not exists (select 1 from pg_constraint where conname = 'index_urls_taxonomy_node_fk') then
    alter table public.index_urls add constraint index_urls_taxonomy_node_fk foreign key (taxonomy_node_id) references public.project_taxonomy_nodes(id) on delete set null;
  end if;
end $$;

-- Estado de indexação por URL e motor (o último conhecido; o histórico de envios fica em index_submissions e em project_events).
create table if not exists public.index_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  url_id uuid not null references public.index_urls(id) on delete cascade,
  engine text not null check (engine in ('google', 'bing', 'indexnow')),
  state text not null default 'desconhecido' check (state in ('desconhecido', 'indexada', 'nao_indexada', 'enviada', 'erro', 'fora_do_escopo')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  checked_at timestamptz not null default now(),
  constraint index_status_url_engine_unique unique (url_id, engine)
);
create index if not exists index_status_project_idx on public.index_status (project_id, engine, state);
create index if not exists index_status_org_idx on public.index_status (organization_id);

create table if not exists public.index_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  engine text not null check (engine in ('google', 'bing', 'indexnow')),
  host text check (host is null or char_length(host) <= 255),
  urls_count integer not null default 0 check (urls_count >= 0),
  status text not null check (status in ('aceita', 'recusada', 'erro', 'bloqueada')),
  response jsonb not null default '{}'::jsonb check (jsonb_typeof(response) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists index_submissions_project_idx on public.index_submissions (project_id, created_at desc);
create index if not exists index_submissions_org_idx on public.index_submissions (organization_id);
create index if not exists index_submissions_created_by_idx on public.index_submissions (created_by);

-- Checklist de higiene: o último resultado de cada verificação do projeto.
create table if not exists public.index_hygiene (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  check_key text not null check (char_length(check_key) between 2 and 80),
  ok boolean not null,
  severity text not null default 'info' check (severity in ('alta', 'media', 'baixa', 'info')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  checked_at timestamptz not null default now(),
  constraint index_hygiene_project_key_unique unique (project_id, check_key)
);
create index if not exists index_hygiene_org_idx on public.index_hygiene (organization_id);

-- Chave do IndexNow por host (a chave é pública por definição do protocolo: o arquivo /<chave>.txt fica aberto no site; ainda assim não é devolvida pela tela).
create table if not exists public.index_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  host text not null check (char_length(host) between 3 and 255),
  key_value text not null check (key_value ~ '^[A-Za-z0-9-]{8,128}$'),
  key_location text check (key_location is null or char_length(key_location) <= 500),
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint index_keys_project_host_unique unique (project_id, host)
);
create index if not exists index_keys_org_idx on public.index_keys (organization_id);
create index if not exists index_keys_created_by_idx on public.index_keys (created_by);

-- Triggers: a linha só pode apontar para projeto da própria organização. Acesso: só a chave de serviço.
do $$
declare t text;
begin
  foreach t in array array['project_events', 'index_urls', 'index_status', 'index_submissions', 'index_hygiene', 'index_keys'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_org', t);
    execute format('create trigger %I before insert or update of project_id, organization_id on public.%I for each row execute function public.profile_assert_project_org()', t || '_org', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- 3) Páginas do Search Console somadas no banco (impressões e cliques dos últimos N dias), da maior para a menor.
create or replace function private.indexation_gsc_pages(p_project uuid, p_days integer, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('page', t.page, 'impressions', t.imp, 'clicks', t.clk) order by t.imp desc), '[]'::jsonb)
  from (
    select page, sum(impressions)::bigint as imp, sum(clicks)::bigint as clk
    from public.nexus_search_performance
    where project_id = p_project and source = 'gsc' and page <> '' and day >= current_date - greatest(least(coalesce(p_days, 90), 480), 1)
    group by page
    order by sum(impressions) desc
    limit least(greatest(coalesce(p_limit, 20000), 1), 50000)
  ) t
$$;
create or replace function public.indexation_gsc_pages(p_project uuid, p_days integer, p_limit integer)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.indexation_gsc_pages(p_project, p_days, p_limit); $$;

-- 4) Números de indexação por projeto (alimenta o item "Indexação" da saúde do projeto). Projeto sem inventário simplesmente não aparece.
create or replace function private.project_indexation_summary(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.project_id::text, x.data), '{}'::jsonb)
  from (
    select u.project_id,
      jsonb_build_object(
        'urls', count(*),
        'indexed', count(*) filter (where g.state = 'indexada'),
        'not_indexed', count(*) filter (where g.state = 'nao_indexada'),
        'problems', count(*) filter (where u.soft404_suspect or coalesce(u.http_status, 200) >= 400 or lower(coalesce(u.robots_meta, '') || ' ' || coalesce(u.x_robots, '')) like '%noindex%'),
        'last_checked_at', max(u.last_checked_at),
        'last_synced_at', max(u.last_seen)
      ) as data
    from public.index_urls u
    left join public.index_status g on g.url_id = u.id and g.engine = 'google'
    where u.organization_id = p_org
    group by u.project_id
  ) x
$$;
create or replace function public.project_indexation_summary(p_org uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.project_indexation_summary(p_org); $$;

revoke all on function private.indexation_gsc_pages(uuid, integer, integer), public.indexation_gsc_pages(uuid, integer, integer),
  private.project_indexation_summary(uuid), public.project_indexation_summary(uuid) from public, anon, authenticated;
grant execute on function private.indexation_gsc_pages(uuid, integer, integer), public.indexation_gsc_pages(uuid, integer, integer),
  private.project_indexation_summary(uuid), public.project_indexation_summary(uuid) to service_role;
