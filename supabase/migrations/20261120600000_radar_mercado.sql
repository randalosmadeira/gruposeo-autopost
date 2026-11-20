-- Radar de Mercado: focos, território automático, concorrência (entidades com várias identidades), cobertura, placar e rotinas.
-- Aditiva e reversível (supabase/rollbacks/20261120600000_radar_mercado_rollback.sql). NÃO foi aplicada: o orquestrador revisa e publica.
--  1) geo_places / geo_place_members: lugares (país, estado, região, município, distrito, bairro, zona) com fonte, licença e atribuição; compartilhados entre projetos (dado público, sem cliente).
--  2) project_focuses / project_focus_places: o Foco (segmento + público + território + peso) e os lugares que entraram nele, com o "por que entrou".
--  3) radar_competitors / radar_identities / radar_identity_metrics / radar_pages / radar_map_listings / radar_site_scans: o concorrente é uma ENTIDADE com
--     várias IDENTIDADES (site, Google Business, Instagram, TikTok, Kwai, Facebook, LinkedIn, X, YouTube, Pinterest, Threads...).
--  4) radar_links: o vínculo da concorrência com a árvore (Foco, território, nó da taxonomia). radar_coverage: ledger do que foi consultado.
--  5) radar_runs / radar_scores / radar_schedules: rodadas, série semanal do placar (tendência) e rotinas diária/semanal/mensal.
--  6) project_radar_summary(): números por projeto para a saúde do projeto (Central de Projetos).
--  7) project_alerts passa a aceitar a origem 'radar' (alargamento do CHECK; o rollback remove as linhas do radar antes de restaurar o CHECK antigo).
--  8) chave de automação e cron próprios do radar (zica_radar_run_key, hash em automation_ingress_keys).
-- Reaproveita profile_assert_project_org() (a linha só pode apontar para projeto da própria organização).
-- Acesso: RLS ligada e nenhum grant para anon/authenticated; a única porta é a função de borda `engine` (chave de serviço, papel conferido no banco) e a `radar-run` (cron).
-- Custos: nenhuma tabela aqui gasta dinheiro; o gasto acontece só pelas funções, dentro do teto diário (spend-gate).

create schema if not exists private;

-- 1) Lugares ---------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.geo_places (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('pais', 'uf', 'regiao', 'municipio', 'distrito', 'bairro', 'zona')),
  parent_id uuid references public.geo_places(id) on delete set null,
  country char(2) not null check (country ~ '^[a-z]{2}$'),
  code text not null check (char_length(code) between 1 and 120),
  name text not null check (char_length(name) between 1 and 160),
  name_norm text not null check (char_length(name_norm) between 1 and 160),
  lat numeric(9, 6) check (lat is null or lat between -90 and 90),
  lon numeric(9, 6) check (lon is null or lon between -180 and 180),
  population integer check (population is null or population >= 0),
  source text not null check (source in ('ibge', 'osm', 'wikidata', 'geonames', 'pacote', 'manual')),
  license text check (license is null or char_length(license) <= 120),
  attribution text check (attribution is null or char_length(attribution) <= 300),
  inferred boolean not null default false,
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  updated_at timestamptz not null default now(),
  constraint geo_places_source_code_unique unique (source, level, code)
);
create index if not exists geo_places_norm_idx on public.geo_places (country, name_norm);
create index if not exists geo_places_parent_idx on public.geo_places (parent_id);
create index if not exists geo_places_level_idx on public.geo_places (country, level);

-- Pertinência: município -> região metropolitana/imediata/intermediária; distrito -> zona informal. A mesma pessoa pode estar em vários grupos.
create table if not exists public.geo_place_members (
  group_id uuid not null references public.geo_places(id) on delete cascade,
  member_id uuid not null references public.geo_places(id) on delete cascade,
  relation text not null check (relation in ('regiao_metropolitana', 'regiao_imediata', 'regiao_intermediaria', 'zona', 'vizinho')),
  inferred boolean not null default false,
  primary key (group_id, member_id, relation),
  constraint geo_place_members_self_check check (group_id <> member_id)
);
create index if not exists geo_place_members_member_idx on public.geo_place_members (member_id);

-- 2) Focos -----------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.project_focuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  segment_node_id uuid,
  segment_label text check (segment_label is null or char_length(segment_label) <= 200),
  topics text[] not null default '{}',
  audiences text[] not null default '{}' check (audiences <@ array['urgencia', 'alvo', 'interesse', 'engajamento', 'retencao']::text[]),
  weight smallint not null default 5 check (weight between 1 and 10),
  goals jsonb not null default '[]'::jsonb check (jsonb_typeof(goals) = 'array'),
  target_hosts text[] not null default '{}',
  target_pages text[] not null default '{}',
  modalities text[] not null default '{web,places,videos,social}'::text[],
  language text not null default 'en' check (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  compliance_mode text not null default 'aviso' check (compliance_mode in ('aviso', 'estrito', 'livre')),
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'arquivado')),
  source text not null default 'manual' check (source in ('frase', 'manual', 'agente')),
  source_text text check (source_text is null or char_length(source_text) <= 4000),
  needs_review boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_focuses_project_idx on public.project_focuses (project_id, status);
create index if not exists project_focuses_org_idx on public.project_focuses (organization_id);
create index if not exists project_focuses_created_by_idx on public.project_focuses (created_by);
create index if not exists project_focuses_node_idx on public.project_focuses (segment_node_id);

do $$
begin
  if to_regclass('public.project_taxonomy_nodes') is not null
     and not exists (select 1 from pg_constraint where conname = 'project_focuses_node_fk') then
    alter table public.project_focuses add constraint project_focuses_node_fk foreign key (segment_node_id) references public.project_taxonomy_nodes(id) on delete set null;
  end if;
end $$;

create table if not exists public.project_focus_places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  focus_id uuid not null references public.project_focuses(id) on delete cascade,
  place_id uuid not null references public.geo_places(id) on delete cascade,
  origin text not null check (origin in ('frase', 'vizinhanca', 'zona', 'manual')),
  -- "por que entrou": lista de { rule, via, detail } (regra estável + explicação). Editável pela pessoa (status/rejeitar).
  why jsonb not null default '[]'::jsonb check (jsonb_typeof(why) = 'array'),
  inferred boolean not null default false,
  status text not null default 'sugerido' check (status in ('sugerido', 'aprovado', 'rejeitado')),
  weight_mult numeric not null default 1 check (weight_mult > 0 and weight_mult <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_focus_places_unique unique (focus_id, place_id)
);
create index if not exists project_focus_places_project_idx on public.project_focus_places (project_id, status);
create index if not exists project_focus_places_place_idx on public.project_focus_places (place_id);
create index if not exists project_focus_places_org_idx on public.project_focus_places (organization_id);

-- 3) Concorrência: entidade + identidades ----------------------------------------------------------------------------------------------------
create table if not exists public.radar_competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  name_norm text not null check (char_length(name_norm) between 1 and 200),
  kind text not null default 'desconhecido' check (kind in ('marca', 'pessoa', 'diretorio', 'desconhecido')),
  primary_host text check (primary_host is null or char_length(primary_host) <= 200),
  is_own boolean not null default false,
  status text not null default 'sugerido' check (status in ('sugerido', 'acompanhado', 'ignorado')),
  merged_into uuid references public.radar_competitors(id) on delete set null,
  authority jsonb not null default '{}'::jsonb check (jsonb_typeof(authority) = 'object'),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint radar_competitors_self_check check (merged_into is distinct from id)
);
create unique index if not exists radar_competitors_host_unique on public.radar_competitors (project_id, primary_host) where primary_host is not null and merged_into is null;
create index if not exists radar_competitors_project_idx on public.radar_competitors (project_id, status);
create index if not exists radar_competitors_org_idx on public.radar_competitors (organization_id);
create index if not exists radar_competitors_merged_idx on public.radar_competitors (merged_into);

create table if not exists public.radar_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid references public.radar_competitors(id) on delete cascade,
  platform text not null check (platform ~ '^[a-z][a-z0-9_]{1,30}$'),
  handle text check (handle is null or char_length(handle) <= 200),
  url text not null check (char_length(url) between 8 and 1000),
  identity_key text not null check (char_length(identity_key) between 3 and 300),
  kind text not null default 'perfil' check (kind in ('site', 'perfil', 'canal', 'video', 'post', 'lugar')),
  source text not null check (source in ('serp', 'site', 'schema', 'maps', 'youtube_api', 'provedor', 'manual')),
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  -- de onde vieram os números: api_oficial | trecho_publico_do_buscador (estimado) | provedor_terceiro | indisponivel
  metrics_label text not null default 'indisponivel' check (metrics_label in ('api_oficial', 'trecho_publico_do_buscador', 'provedor_terceiro', 'indisponivel')),
  metrics_source text check (metrics_source is null or char_length(metrics_source) <= 300),
  metrics_at timestamptz,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint radar_identities_unique unique (project_id, identity_key)
);
create index if not exists radar_identities_competitor_idx on public.radar_identities (competitor_id, platform);
create index if not exists radar_identities_project_idx on public.radar_identities (project_id, platform);
create index if not exists radar_identities_org_idx on public.radar_identities (organization_id);

create table if not exists public.radar_identity_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  identity_id uuid not null references public.radar_identities(id) on delete cascade,
  observed_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  label text not null check (label in ('api_oficial', 'trecho_publico_do_buscador', 'provedor_terceiro')),
  source text check (source is null or char_length(source) <= 300)
);
create index if not exists radar_identity_metrics_idx on public.radar_identity_metrics (identity_id, observed_at desc);
create index if not exists radar_identity_metrics_project_idx on public.radar_identity_metrics (project_id);
create index if not exists radar_identity_metrics_org_idx on public.radar_identity_metrics (organization_id);

create table if not exists public.radar_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid references public.radar_competitors(id) on delete cascade,
  identity_id uuid references public.radar_identities(id) on delete set null,
  focus_id uuid references public.project_focuses(id) on delete set null,
  place_id uuid references public.geo_places(id) on delete set null,
  node_id uuid,
  url text not null check (char_length(url) between 8 and 1000),
  host text not null check (char_length(host) between 3 and 200),
  title text check (title is null or char_length(title) <= 300),
  snippet text check (snippet is null or char_length(snippet) <= 600),
  position smallint check (position is null or position between 1 and 200),
  modality text not null default 'web' check (modality in ('web', 'places', 'maps', 'news', 'images', 'videos', 'social')),
  engine text not null check (engine ~ '^[a-z][a-z0-9_]{1,40}$'),
  page_type text check (page_type is null or char_length(page_type) <= 40),
  query_key text check (query_key is null or char_length(query_key) <= 80),
  seen_at timestamptz not null default now(),
  constraint radar_pages_unique unique (project_id, url, engine, modality, query_key)
);
create index if not exists radar_pages_project_idx on public.radar_pages (project_id, host);
create index if not exists radar_pages_competitor_idx on public.radar_pages (competitor_id);
create index if not exists radar_pages_focus_place_idx on public.radar_pages (focus_id, place_id);
create index if not exists radar_pages_org_idx on public.radar_pages (organization_id);

create table if not exists public.radar_map_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid references public.radar_competitors(id) on delete cascade,
  focus_id uuid references public.project_focuses(id) on delete set null,
  place_id uuid references public.geo_places(id) on delete set null,
  listing_ref text not null check (char_length(listing_ref) between 1 and 200),
  name text not null check (char_length(name) between 1 and 200),
  address text check (address is null or char_length(address) <= 400),
  rating numeric check (rating is null or rating between 0 and 5),
  reviews integer check (reviews is null or reviews >= 0),
  categories text[] not null default '{}',
  phone text check (phone is null or char_length(phone) <= 60),
  website text check (website is null or char_length(website) <= 500),
  hours jsonb not null default '{}'::jsonb check (jsonb_typeof(hours) = 'object'),
  lat numeric(9, 6),
  lon numeric(9, 6),
  position smallint check (position is null or position between 1 and 200),
  engine text not null check (engine ~ '^[a-z][a-z0-9_]{1,40}$'),
  seen_at timestamptz not null default now(),
  constraint radar_map_listings_unique unique (project_id, listing_ref)
);
create index if not exists radar_map_listings_project_idx on public.radar_map_listings (project_id);
create index if not exists radar_map_listings_competitor_idx on public.radar_map_listings (competitor_id);
create index if not exists radar_map_listings_org_idx on public.radar_map_listings (organization_id);
create index if not exists radar_map_listings_place_idx on public.radar_map_listings (place_id);

create table if not exists public.radar_site_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid not null references public.radar_competitors(id) on delete cascade,
  host text not null check (char_length(host) between 3 and 200),
  scan jsonb not null default '{}'::jsonb check (jsonb_typeof(scan) = 'object'),
  status text not null default 'ok' check (status in ('ok', 'parcial', 'bloqueado_pelo_robots', 'erro')),
  error text check (error is null or char_length(error) <= 120),
  scanned_at timestamptz not null default now()
);
create index if not exists radar_site_scans_competitor_idx on public.radar_site_scans (competitor_id, scanned_at desc);
create index if not exists radar_site_scans_project_idx on public.radar_site_scans (project_id);
create index if not exists radar_site_scans_org_idx on public.radar_site_scans (organization_id);

-- 4) Vínculo com a árvore + ledger de cobertura ----------------------------------------------------------------------------------------------
create table if not exists public.radar_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  competitor_id uuid not null references public.radar_competitors(id) on delete cascade,
  focus_id uuid references public.project_focuses(id) on delete cascade,
  place_id uuid references public.geo_places(id) on delete cascade,
  node_id uuid,
  source text not null check (source in ('busca', 'varredura', 'sugestao_aceita', 'manual')),
  strength numeric not null default 1 check (strength >= 0),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  constraint radar_links_target_check check (focus_id is not null or place_id is not null or node_id is not null)
);
create unique index if not exists radar_links_unique on public.radar_links (project_id, competitor_id, coalesce(focus_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(place_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(node_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists radar_links_project_idx on public.radar_links (project_id);
create index if not exists radar_links_competitor_idx on public.radar_links (competitor_id);
create index if not exists radar_links_node_idx on public.radar_links (node_id);
create index if not exists radar_links_org_idx on public.radar_links (organization_id);

create table if not exists public.radar_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('manual', 'diaria', 'semanal', 'mensal')),
  status text not null default 'executando' check (status in ('executando', 'concluida', 'parada_no_teto', 'erro')),
  queries_planned integer not null default 0 check (queries_planned >= 0),
  queries_done integer not null default 0 check (queries_done >= 0),
  new_entities integer not null default 0 check (new_entities >= 0),
  total_entities integer not null default 0 check (total_entities >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  stop_reason text check (stop_reason is null or char_length(stop_reason) <= 200),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists radar_runs_project_idx on public.radar_runs (project_id, started_at desc);
create index if not exists radar_runs_org_idx on public.radar_runs (organization_id);
create index if not exists radar_runs_created_by_idx on public.radar_runs (created_by);

create table if not exists public.radar_coverage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.radar_runs(id) on delete set null,
  task_key text not null check (char_length(task_key) between 4 and 80),
  focus_id uuid references public.project_focuses(id) on delete cascade,
  place_id uuid references public.geo_places(id) on delete set null,
  node_id uuid,
  engine text not null check (engine ~ '^[a-z][a-z0-9_]{1,40}$'),
  modality text not null check (modality in ('web', 'places', 'maps', 'news', 'images', 'videos', 'social')),
  query text not null check (char_length(query) between 3 and 500),
  country char(2) not null check (country ~ '^[a-z]{2}$'),
  language text not null check (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  status text not null default 'planejada' check (status in ('planejada', 'consultada', 'erro', 'pulada_orcamento')),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  results integer not null default 0 check (results >= 0),
  new_entities integer not null default 0 check (new_entities >= 0),
  error text check (error is null or char_length(error) <= 120),
  queried_at timestamptz,
  created_at timestamptz not null default now(),
  constraint radar_coverage_unique unique (project_id, task_key)
);
create index if not exists radar_coverage_project_idx on public.radar_coverage (project_id, status);
create index if not exists radar_coverage_focus_idx on public.radar_coverage (focus_id, place_id);
create index if not exists radar_coverage_run_idx on public.radar_coverage (run_id);
create index if not exists radar_coverage_org_idx on public.radar_coverage (organization_id);

-- 5) Placar semanal (tendência) e rotinas ----------------------------------------------------------------------------------------------------
create table if not exists public.radar_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  week date not null,
  subject text not null check (subject in ('nos', 'concorrente')),
  competitor_id uuid references public.radar_competitors(id) on delete cascade,
  focus_id uuid references public.project_focuses(id) on delete cascade,
  place_id uuid references public.geo_places(id) on delete cascade,
  node_id uuid,
  score numeric check (score is null or score between 0 and 100),
  coverage numeric not null default 0 check (coverage between 0 and 1),
  components jsonb not null default '[]'::jsonb check (jsonb_typeof(components) = 'array'),
  label text not null default 'estimado' check (label = 'estimado'),
  created_at timestamptz not null default now()
);
create unique index if not exists radar_scores_unique on public.radar_scores (project_id, week, subject, coalesce(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(focus_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(place_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(node_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists radar_scores_project_idx on public.radar_scores (project_id, week desc);
create index if not exists radar_scores_competitor_idx on public.radar_scores (competitor_id);
create index if not exists radar_scores_org_idx on public.radar_scores (organization_id);

create table if not exists public.radar_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  focus_id uuid references public.project_focuses(id) on delete cascade,
  cadence text not null check (cadence in ('diaria', 'semanal', 'mensal')),
  enabled boolean not null default true,
  budget_micros bigint not null default 500000 check (budget_micros >= 0 and budget_micros <= 9200000),
  max_queries integer not null default 40 check (max_queries between 1 and 1000),
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  lock_until timestamptz not null default '1970-01-01T00:00:00Z',
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists radar_schedules_unique on public.radar_schedules (project_id, coalesce(focus_id, '00000000-0000-0000-0000-000000000000'::uuid), cadence);
create index if not exists radar_schedules_due_idx on public.radar_schedules (next_run_at) where enabled;
create index if not exists radar_schedules_org_idx on public.radar_schedules (organization_id);
create index if not exists radar_schedules_created_by_idx on public.radar_schedules (created_by);

-- Organização do projeto confere em toda linha com project_id; RLS ligada e nenhum grant para anon/authenticated (só a chave de serviço, pelas funções de borda).
do $$
declare t text;
begin
  foreach t in array array['project_focuses', 'project_focus_places', 'radar_competitors', 'radar_identities', 'radar_identity_metrics', 'radar_pages', 'radar_map_listings', 'radar_site_scans', 'radar_links', 'radar_runs', 'radar_coverage', 'radar_scores', 'radar_schedules'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_org', t);
    execute format('create trigger %I before insert or update of project_id, organization_id on public.%I for each row execute function public.profile_assert_project_org()', t || '_org', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['geo_places', 'geo_place_members'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- 6) Números do radar por projeto (alimenta o item "Radar de mercado" da saúde do projeto). Projeto sem foco simplesmente não aparece.
create or replace function private.project_radar_summary(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.project_id::text, x.data), '{}'::jsonb)
  from (
    select f.project_id,
      jsonb_build_object(
        'focuses', count(distinct f.id) filter (where f.status = 'ativo'),
        'competitors', (select count(*) from public.radar_competitors c where c.project_id = f.project_id and c.merged_into is null and not c.is_own and c.status <> 'ignorado'),
        'last_run_at', (select max(r.started_at) from public.radar_runs r where r.project_id = f.project_id),
        'coverage_done', (select count(*) from public.radar_coverage v where v.project_id = f.project_id and v.status = 'consultada'),
        'coverage_total', (select count(*) from public.radar_coverage v where v.project_id = f.project_id),
        'identities_orphan', (select count(*) from public.radar_identities i where i.project_id = f.project_id and i.competitor_id is null),
        'competitors_without_link', (select count(*) from public.radar_competitors c where c.project_id = f.project_id and c.merged_into is null and not c.is_own and c.status <> 'ignorado' and not exists (select 1 from public.radar_links l where l.competitor_id = c.id and (l.node_id is not null or l.focus_id is not null)))
      ) as data
    from public.project_focuses f
    where f.organization_id = p_org
    group by f.project_id
  ) x
$$;
create or replace function public.project_radar_summary(p_org uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.project_radar_summary(p_org); $$;
revoke all on function private.project_radar_summary(uuid), public.project_radar_summary(uuid) from public, anon, authenticated;
grant execute on function private.project_radar_summary(uuid), public.project_radar_summary(uuid) to service_role;

-- 7) project_alerts aceita a origem 'radar' (alargamento: valores antigos continuam valendo).
alter table public.project_alerts drop constraint if exists project_alerts_source_check;
alter table public.project_alerts add constraint project_alerts_source_check check (source in ('speed', 'backlinks', 'radar'));
alter table public.project_alerts drop constraint if exists project_alerts_kind_check;
alter table public.project_alerts add constraint project_alerts_kind_check check (kind in ('score_drop', 'field_worse', 'measure_failed', 'links_lost', 'radar_competitor_new', 'radar_competitor_rising', 'radar_budget_stop', 'radar_orphans'));

-- 8) Chave de automação própria do radar (rotacionável/desligável sem afetar os outros cron) e o cron de hora em hora.
-- A chave é gerada aqui dentro, guardada no cofre (vault) e só o hash fica na tabela. Cada rodada só trabalha nas rotinas vencidas e para no teto diário.
do $$
declare
  v_secret text;
  v_job record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'zica_radar_run_key' limit 1;
  if coalesce(v_secret, '') = '' then
    v_secret := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_secret, 'zica_radar_run_key', 'Ingress secret for radar-run cron');
  end if;
  insert into public.automation_ingress_keys(name, secret_hash, enabled, updated_at)
  values ('radar-run', encode(digest(v_secret, 'sha256'), 'hex'), true, now())
  on conflict (name) do update set secret_hash = excluded.secret_hash, enabled = true, updated_at = now();

  for v_job in select jobid from cron.job where jobname = 'zica-radar-run-hourly' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'zica-radar-run-hourly',
    '17 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://ubahrbgaxrkjxklytobl.supabase.co/functions/v1/radar-run',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-zica-automation-key',(select decrypted_secret from vault.decrypted_secrets where name='zica_radar_run_key' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
    $cmd$
  );
end $$;
