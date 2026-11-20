-- Motor de Taxonomia + Planejador de Campanha de Mercado, por projeto (qualquer negócio, não só advocacia).
-- Aditiva e reversível (supabase/rollbacks/20261120200000_taxonomia_mercado_rollback.sql). Não altera nenhuma tabela existente.
--  1) project_taxonomy_nodes / project_taxonomy_edges: árvore área matriz -> subárea -> nicho e as correlações entre elas.
--  2) project_geo_scope + ibge_municipios: onde o negócio atua / onde há demanda, e o cache das localidades do IBGE (API pública, sem chave).
--  3) market_campaigns / market_queries / market_serp_results / market_competitors: planejamento de uma campanha de buscas (SERP) e os
--     resultados que o cliente trouxer. NADA aqui executa busca paga: o planejador só gera consultas, estima custo e aplica o teto.
--  4) taxonomy_search_sample(): amostra agregada (consultas e páginas do Search Console) feita NO BANCO (a tabela tem dezenas de milhares de linhas).
-- Reaproveita profile_assert_project_org() do Perfil do Projeto. Acesso: RLS ligada e nenhum grant para anon/authenticated;
-- a única porta é a função de borda `taxonomy` (chave de serviço), que confere participação na organização e papel.
-- Preços e limites de uso ficam para a fase final (decisão de 16/11/2026): o teto daqui é uma trava do próprio planejador, não cobrança.

-- 1) Árvore de taxonomia. slug = caminho completo ("criminal", "criminal/drogas-e-trafico", "criminal/drogas-e-trafico/n/maconha").
--    kind "cauda" = busca específica (cauda longa) gerada por AGENTE de IA (source = 'agente'), sempre revisável; quem define as regras é o agente, não esta tabela.
--    Sem teto de quantidade de nós/galhos: nenhum limite fixo aqui.
create table if not exists public.project_taxonomy_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('matriz', 'subarea', 'nicho', 'cauda')),
  parent_id uuid references public.project_taxonomy_nodes(id) on delete cascade,
  slug text not null check (char_length(slug) between 2 and 200),
  label text not null check (char_length(label) between 2 and 300),
  keywords text[] not null default '{}',
  source text not null default 'manual' check (source in ('pacote', 'site', 'search_console', 'manual', 'agente')),
  status text not null default 'sugerido' check (status in ('sugerido', 'aprovado', 'rejeitado')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_taxonomy_nodes_slug_unique unique (project_id, slug),
  constraint project_taxonomy_nodes_parent_check check ((kind = 'matriz') = (parent_id is null)),
  constraint project_taxonomy_nodes_self_check check (parent_id is distinct from id)
);
create index if not exists project_taxonomy_nodes_project_idx on public.project_taxonomy_nodes (project_id, kind, status);
create index if not exists project_taxonomy_nodes_parent_idx on public.project_taxonomy_nodes (parent_id);
create index if not exists project_taxonomy_nodes_org_idx on public.project_taxonomy_nodes (organization_id);
create index if not exists project_taxonomy_nodes_created_by_idx on public.project_taxonomy_nodes (created_by);

create table if not exists public.project_taxonomy_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  from_id uuid not null references public.project_taxonomy_nodes(id) on delete cascade,
  to_id uuid not null references public.project_taxonomy_nodes(id) on delete cascade,
  relation text not null default 'correlato' check (relation in ('correlato')),
  weight numeric not null default 1 check (weight >= 0),
  source text not null default 'pacote' check (source in ('pacote', 'site', 'search_console', 'manual', 'agente')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint project_taxonomy_edges_unique unique (project_id, from_id, to_id, relation),
  constraint project_taxonomy_edges_self_check check (from_id <> to_id)
);
create index if not exists project_taxonomy_edges_from_idx on public.project_taxonomy_edges (from_id);
create index if not exists project_taxonomy_edges_to_idx on public.project_taxonomy_edges (to_id);
create index if not exists project_taxonomy_edges_org_idx on public.project_taxonomy_edges (organization_id);

-- 2) Cache das localidades do IBGE (compartilhado entre projetos; não tem dado de cliente, por isso não tem organization_id).
create table if not exists public.ibge_municipios (
  ibge_code integer primary key check (ibge_code between 1000000 and 5999999),
  nome text not null check (char_length(nome) between 2 and 120),
  uf char(2) not null check (uf ~ '^[A-Z]{2}$'),
  regiao text check (regiao is null or regiao in ('Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul')),
  mesorregiao text,
  regiao_imediata text,
  populacao integer check (populacao is null or populacao >= 0),
  populacao_ano smallint check (populacao_ano is null or populacao_ano between 1900 and 2100),
  fetched_at timestamptz not null default now()
);
create index if not exists ibge_municipios_uf_idx on public.ibge_municipios (uf, populacao desc nulls last);
create index if not exists ibge_municipios_pop_idx on public.ibge_municipios (populacao desc nulls last);

-- Onde o negócio atua e onde há demanda. Linha de ESTADO = uf sem município; linha de REGIÃO = regiao sem uf (ex.: "Zona Leste", "Sudeste");
-- BAIRRO = município + bairro (do IBGE: distritos); PAÍS/MERCADO = country diferente de 'br' (+ language e município/cidade), no mesmo formato dos
-- mercados dos conjuntos de prompts do módulo NEXUS (country, language, city). O cruzamento com as consultas é automático (planejador).
create table if not exists public.project_geo_scope (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  country char(2) not null default 'br' check (country ~ '^[a-z]{2}$'),
  language text not null default 'pt-BR' check (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  uf char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  ibge_code integer references public.ibge_municipios(ibge_code) on delete set null,
  municipio text check (municipio is null or char_length(municipio) <= 120),
  bairro text check (bairro is null or char_length(bairro) <= 120),
  regiao text check (regiao is null or char_length(regiao) <= 80),
  role text not null check (role in ('sede', 'atende', 'plantao', 'alvo')),
  source text not null default 'manual' check (source in ('site', 'search_console', 'ibge', 'pacote', 'manual', 'agente')),
  status text not null default 'sugerido' check (status in ('sugerido', 'aprovado', 'rejeitado')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_geo_scope_place_check check (uf is not null or regiao is not null or ibge_code is not null or country <> 'br')
);
create unique index if not exists project_geo_scope_unique on public.project_geo_scope (project_id, role, country, language, coalesce(uf, ''), coalesce(ibge_code, 0), coalesce(municipio, ''), coalesce(bairro, ''), coalesce(regiao, ''));
create index if not exists project_geo_scope_project_idx on public.project_geo_scope (project_id, status);
create index if not exists project_geo_scope_ibge_idx on public.project_geo_scope (ibge_code);
create index if not exists project_geo_scope_org_idx on public.project_geo_scope (organization_id);
create index if not exists project_geo_scope_created_by_idx on public.project_geo_scope (created_by);

-- 3) Campanha de buscas de mercado. O plano (consultas = áreas aprovadas x lugares x mercados x motores) é gerado AUTOMATICAMENTE; só o que custa dinheiro pede aprovação.
--    budget_cap_cents = 0 significa "nada autorizado para gastar". provider: 'manual' (você traz os resultados, custo zero) ou 'auto' (preço por motor, tabela em config.price_table).
create table if not exists public.market_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovada', 'executando', 'concluida', 'cancelada')),
  phase smallint not null default 1 check (phase between 1 and 4),
  budget_cap_cents integer not null default 0 check (budget_cap_cents >= 0),
  estimated_cost_cents integer not null default 0 check (estimated_cost_cents >= 0),
  spent_cents integer not null default 0 check (spent_cents >= 0),
  provider text check (provider is null or provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  price_verified boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_campaigns_project_idx on public.market_campaigns (project_id, created_at desc);
create index if not exists market_campaigns_org_idx on public.market_campaigns (organization_id);
create index if not exists market_campaigns_created_by_idx on public.market_campaigns (created_by);

create table if not exists public.market_queries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.market_campaigns(id) on delete cascade,
  query text not null check (char_length(query) between 3 and 300),
  node_id uuid references public.project_taxonomy_nodes(id) on delete set null,
  engine text not null default 'google_serp' check (engine ~ '^[a-z][a-z0-9_]{1,40}$'),
  country char(2) not null default 'br' check (country ~ '^[a-z]{2}$'),
  language text not null default 'pt-BR' check (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  uf char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  municipio text check (municipio is null or char_length(municipio) <= 120),
  bairro text check (bairro is null or char_length(bairro) <= 120),
  ibge_code integer,
  regiao text check (regiao is null or char_length(regiao) <= 80),
  scope text not null check (scope in ('brasil', 'pais', 'estado', 'regiao', 'municipio', 'bairro')),
  phase smallint not null default 1 check (phase between 1 and 4),
  status text not null default 'planejada' check (status in ('planejada', 'executada', 'erro')),
  executed_at timestamptz,
  constraint market_queries_unique unique (campaign_id, engine, country, language, query)
);
create index if not exists market_queries_campaign_idx on public.market_queries (campaign_id, status);
create index if not exists market_queries_project_idx on public.market_queries (project_id);
create index if not exists market_queries_node_idx on public.market_queries (node_id);
create index if not exists market_queries_org_idx on public.market_queries (organization_id);

create table if not exists public.market_serp_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  query_id uuid not null references public.market_queries(id) on delete cascade,
  position smallint not null check (position between 1 and 200),
  url text not null check (char_length(url) between 8 and 1000),
  host text not null check (char_length(host) between 3 and 200),
  title text check (title is null or char_length(title) <= 300),
  kind text not null default 'organico' check (kind in ('organico', 'mapa', 'anuncio', 'outro')),
  fetched_at timestamptz not null default now(),
  constraint market_serp_results_unique unique (query_id, kind, position)
);
create index if not exists market_serp_results_query_idx on public.market_serp_results (query_id);
create index if not exists market_serp_results_project_host_idx on public.market_serp_results (project_id, host);
create index if not exists market_serp_results_org_idx on public.market_serp_results (organization_id);

-- Rollup por domínio (recalculado a cada importação). `kind` = 'concorrente' ou 'diretorio' (portal/rede social/órgão público, que não é concorrente de verdade).
create table if not exists public.market_competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  host text not null check (char_length(host) between 3 and 200),
  kind text not null default 'concorrente' check (kind in ('concorrente', 'diretorio')),
  areas text[] not null default '{}',
  locations jsonb not null default '{}'::jsonb check (jsonb_typeof(locations) = 'object'),
  appearances integer not null default 0 check (appearances >= 0),
  avg_position numeric check (avg_position is null or avg_position >= 1),
  score numeric not null default 0 check (score >= 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint market_competitors_unique unique (project_id, host)
);
create index if not exists market_competitors_rank_idx on public.market_competitors (project_id, kind, score desc);
create index if not exists market_competitors_org_idx on public.market_competitors (organization_id);

do $$
declare t text;
begin
  foreach t in array array['project_taxonomy_nodes', 'project_taxonomy_edges', 'project_geo_scope', 'market_campaigns', 'market_queries', 'market_serp_results', 'market_competitors'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_org', t);
    execute format('create trigger %I before insert or update of project_id, organization_id on public.%I for each row execute function public.profile_assert_project_org()', t || '_org', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
alter table public.ibge_municipios enable row level security;
revoke all on table public.ibge_municipios from public, anon, authenticated;
grant all on table public.ibge_municipios to service_role;

-- 4) Amostra do Search Console para classificar: as consultas e as páginas com mais impressões na janela (padrão 90 dias, no máximo 180).
create or replace function private.taxonomy_search_sample(p_project uuid, p_days integer, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
with prm as (select greatest(1, least(coalesce(p_days, 90), 180)) as d, greatest(10, least(coalesce(p_limit, 400), 1000)) as n),
base as (select s.query, s.page, s.clicks, s.impressions from public.nexus_search_performance s where s.project_id = p_project and s.day >= current_date - (select d from prm)),
q as (select query, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions from base where query <> '' group by query order by sum(impressions) desc limit (select n from prm)),
p as (select page, sum(clicks)::bigint as clicks, sum(impressions)::bigint as impressions from base where page <> '' group by page order by sum(impressions) desc limit (select n from prm))
select jsonb_build_object(
  'days', (select d from prm),
  'queries', coalesce((select jsonb_agg(to_jsonb(q)) from q), '[]'::jsonb),
  'pages', coalesce((select jsonb_agg(to_jsonb(p)) from p), '[]'::jsonb)
);
$$;
create or replace function public.taxonomy_search_sample(p_project uuid, p_days integer, p_limit integer)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.taxonomy_search_sample(p_project, p_days, p_limit);$$;
revoke all on function private.taxonomy_search_sample(uuid, integer, integer), public.taxonomy_search_sample(uuid, integer, integer) from public, anon, authenticated;
grant execute on function private.taxonomy_search_sample(uuid, integer, integer), public.taxonomy_search_sample(uuid, integer, integer) to service_role;
