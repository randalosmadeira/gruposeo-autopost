-- Estúdio de Páginas: páginas e landing pages de conversão, com URL semântica, completas para buscadores, IAs e público (SEO, GEO, AEO, AIO).
-- Aditiva e reversível (supabase/rollbacks/20261120700000_estudio_de_paginas_rollback.sql). Não altera nenhuma tabela existente.
--  1) studio_pages: a página (tipo, idioma, território/foco/nó da taxonomia, endereço semântico, destino, adaptador, estado, versão atual, briefing de superação,
--     estado do pipeline, relatório de qualidade e de completude). Estados: rascunho, em_revisao, aprovada, publicada, despublicada.
--  2) studio_page_versions: versão IMUTÁVEL por edição (o que foi aprovado é o que foi publicado: conferido por hash).
--  3) studio_page_links: plano de links internos e externos (e os links de entrada sugeridos para o hub).
--  4) studio_page_assets: imagens da página (acervo ou geradas; origem e custo).
--  5) studio_publications: cada publicação (adaptador, resultado, URL final, IndexNow/Bing enviados).
--  6) project_studio_summary(): números por projeto para a saúde do projeto (Central de Projetos).
--  7) studio_optional_tables(): quais tabelas de OUTROS módulos existem (to_regclass), para o Estúdio consumir só o que existe (Radar de Mercado, Focos, locais).
-- Reaproveita profile_assert_project_org() do Perfil do Projeto (a linha só pode apontar para projeto da própria organização).
-- Acesso: RLS ligada e NENHUM grant para anon/authenticated; a única porta é a função de borda `engine` (chave de serviço), que confere participação e papel.
-- NADA aqui chama serviço pago. Sem dado pessoal (só dados da empresa).

-- 1) A página.
create table if not exists public.studio_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Foco do Radar de Mercado (outro módulo): sem chave estrangeira, o módulo pode nem existir.
  focus_id uuid,
  taxonomy_node_id uuid,
  geo_scope_id uuid,
  type text not null check (type in ('pagina', 'landing', 'hub', 'servico', 'local', 'guia', 'comparativo')),
  language text not null check (language ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  query text not null check (char_length(query) between 2 and 300),
  subject text check (subject is null or char_length(subject) <= 200),
  place text check (place is null or char_length(place) <= 200),
  -- endereço semântico: até 3 níveis, minúsculas, sem espaço, parâmetro nem fragmento (o núcleo studio-url.ts valida o resto)
  slug_path text not null check (slug_path = lower(slug_path) and slug_path ~ '^[^/[:space:]?#&=]{3,60}(/[^/[:space:]?#&=]{3,60}){0,2}$'),
  host text not null check (char_length(host) between 3 and 255),
  base_path text not null default '' check (base_path = '' or base_path ~ '^[a-z0-9/_-]{1,100}$'),
  adapter text not null default 'wordpress_plugin' check (adapter in ('wordpress_plugin', 'site_manifest', 'zica_hosted')),
  status text not null default 'rascunho' check (status in ('rascunho', 'em_revisao', 'aprovada', 'publicada', 'despublicada')),
  version integer not null default 1 check (version >= 1),
  published_version integer check (published_version is null or published_version >= 1),
  title text not null default '' check (char_length(title) <= 300),
  meta_description text not null default '' check (char_length(meta_description) <= 500),
  h1 text not null default '' check (char_length(h1) <= 300),
  body_html text not null default '' check (char_length(body_html) <= 400000),
  -- StudioPageDoc sem o corpo: faq, trilha, fontes, links, imagens, autor, hreflang, datas, área atendida
  doc jsonb not null default '{}'::jsonb check (jsonb_typeof(doc) = 'object'),
  brief jsonb not null default '{}'::jsonb check (jsonb_typeof(brief) = 'object'),
  pipeline jsonb not null default '{}'::jsonb check (jsonb_typeof(pipeline) = 'object'),
  quality jsonb not null default '{}'::jsonb check (jsonb_typeof(quality) = 'object'),
  quality_score smallint check (quality_score is null or quality_score between 0 and 100),
  ai_score smallint check (ai_score is null or ai_score between 0 and 100),
  pending_count integer not null default 0 check (pending_count >= 0),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  approved_hash text check (approved_hash is null or approved_hash ~ '^[0-9a-f]{64}$'),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  -- chave de idempotência junto ao destino (zica_ai_id do plugin): repetir a publicação nunca duplica a página
  external_id uuid not null default gen_random_uuid(),
  wp_post_id bigint,
  public_url text check (public_url is null or char_length(public_url) <= 2048),
  published_at timestamptz,
  unpublished_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_pages_slug_unique unique (project_id, slug_path),
  constraint studio_pages_external_unique unique (external_id),
  constraint studio_pages_approved_has_approver check (status not in ('aprovada', 'publicada') or approved_by is not null),
  constraint studio_pages_published_has_url check (status <> 'publicada' or public_url is not null)
);
create index if not exists studio_pages_project_status_idx on public.studio_pages (project_id, status);
create index if not exists studio_pages_project_created_idx on public.studio_pages (project_id, created_at desc);
create index if not exists studio_pages_org_idx on public.studio_pages (organization_id);
create index if not exists studio_pages_focus_idx on public.studio_pages (focus_id) where focus_id is not null;
create index if not exists studio_pages_node_idx on public.studio_pages (taxonomy_node_id) where taxonomy_node_id is not null;
create index if not exists studio_pages_approved_by_idx on public.studio_pages (approved_by);
create index if not exists studio_pages_created_by_idx on public.studio_pages (created_by);
create index if not exists studio_pages_updated_by_idx on public.studio_pages (updated_by);

-- A taxonomia e o território podem não estar instalados: a chave estrangeira só é criada se a tabela existir (apagar o nó apenas solta o vínculo).
do $$
begin
  if to_regclass('public.project_taxonomy_nodes') is not null and not exists (select 1 from pg_constraint where conname = 'studio_pages_taxonomy_node_fk') then
    alter table public.studio_pages add constraint studio_pages_taxonomy_node_fk foreign key (taxonomy_node_id) references public.project_taxonomy_nodes(id) on delete set null;
  end if;
  if to_regclass('public.project_geo_scope') is not null and not exists (select 1 from pg_constraint where conname = 'studio_pages_geo_scope_fk') then
    alter table public.studio_pages add constraint studio_pages_geo_scope_fk foreign key (geo_scope_id) references public.project_geo_scope(id) on delete set null;
  end if;
end $$;

-- 2) Versões imutáveis.
create table if not exists public.studio_page_versions (
  page_id uuid not null references public.studio_pages(id) on delete cascade,
  version integer not null check (version >= 1),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  meta_description text not null default '',
  h1 text not null default '',
  body_html text not null default '' check (char_length(body_html) <= 400000),
  doc jsonb not null default '{}'::jsonb check (jsonb_typeof(doc) = 'object'),
  quality jsonb not null default '{}'::jsonb check (jsonb_typeof(quality) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  reason text check (reason is null or char_length(reason) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (page_id, version)
);
create index if not exists studio_page_versions_org_idx on public.studio_page_versions (organization_id);
create index if not exists studio_page_versions_project_idx on public.studio_page_versions (project_id);
create index if not exists studio_page_versions_created_by_idx on public.studio_page_versions (created_by);

create or replace function public.studio_page_versions_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'studio_page_versions_immutable';
end $$;
revoke all on function public.studio_page_versions_immutable() from public, anon, authenticated;
drop trigger if exists studio_page_versions_no_update on public.studio_page_versions;
create trigger studio_page_versions_no_update before update on public.studio_page_versions for each row execute function public.studio_page_versions_immutable();

-- 3) Plano de links (saída = a página aponta; entrada = outra página deveria apontar para esta, ex.: o hub).
create table if not exists public.studio_page_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid not null references public.studio_pages(id) on delete cascade,
  direction text not null default 'saida' check (direction in ('saida', 'entrada')),
  kind text not null check (kind in ('interno', 'externo')),
  url text not null check (char_length(url) between 10 and 2048),
  anchor text not null default '' check (char_length(anchor) <= 300),
  reason text check (reason is null or char_length(reason) <= 300),
  verified boolean,
  verified_at timestamptz,
  http_status integer check (http_status is null or http_status between 0 and 999),
  created_at timestamptz not null default now(),
  constraint studio_page_links_unique unique (page_id, direction, kind, url, anchor)
);
create index if not exists studio_page_links_page_idx on public.studio_page_links (page_id);
create index if not exists studio_page_links_project_idx on public.studio_page_links (project_id, kind);
create index if not exists studio_page_links_org_idx on public.studio_page_links (organization_id);

-- 4) Imagens.
create table if not exists public.studio_page_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid not null references public.studio_pages(id) on delete cascade,
  slot text not null check (slot in ('hero', 'og', 'inline')),
  position smallint not null default 0 check (position >= 0),
  origin text not null check (origin in ('acervo', 'gerada', 'pendente')),
  asset_id uuid,
  url text not null default '' check (char_length(url) <= 2048),
  alt text not null default '' check (char_length(alt) <= 300),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  format text check (format is null or format in ('webp', 'avif', 'jpeg', 'png')),
  filename text check (filename is null or char_length(filename) <= 200),
  credit text check (credit is null or char_length(credit) <= 300),
  bytes integer check (bytes is null or bytes >= 0),
  cost_usd_micros bigint not null default 0 check (cost_usd_micros >= 0),
  created_at timestamptz not null default now(),
  constraint studio_page_assets_unique unique (page_id, slot, position)
);
create index if not exists studio_page_assets_page_idx on public.studio_page_assets (page_id);
create index if not exists studio_page_assets_org_idx on public.studio_page_assets (organization_id);
create index if not exists studio_page_assets_project_idx on public.studio_page_assets (project_id);

-- 5) Publicações.
create table if not exists public.studio_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid not null references public.studio_pages(id) on delete cascade,
  version integer not null check (version >= 1),
  adapter text not null check (adapter in ('wordpress_plugin', 'site_manifest', 'zica_hosted')),
  action text not null default 'publicar' check (action in ('publicar', 'despublicar')),
  status text not null check (status in ('ok', 'erro', 'pacote_gerado', 'recusada')),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  final_url text check (final_url is null or char_length(final_url) <= 2048),
  wp_post_id bigint,
  indexation jsonb not null default '{}'::jsonb check (jsonb_typeof(indexation) = 'object'),
  error text check (error is null or char_length(error) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists studio_publications_page_idx on public.studio_publications (page_id, created_at desc);
create index if not exists studio_publications_project_idx on public.studio_publications (project_id, created_at desc);
create index if not exists studio_publications_org_idx on public.studio_publications (organization_id);
create index if not exists studio_publications_created_by_idx on public.studio_publications (created_by);

-- Triggers de organização, RLS e permissões: só a chave de serviço.
do $$
declare t text;
begin
  foreach t in array array['studio_pages', 'studio_page_versions', 'studio_page_links', 'studio_page_assets', 'studio_publications'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_org', t);
    execute format('create trigger %I before insert or update of project_id, organization_id on public.%I for each row execute function public.profile_assert_project_org()', t || '_org', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- 6) Números do Estúdio por projeto (alimenta o item "Estúdio de Páginas" da saúde do projeto). Projeto sem páginas simplesmente não aparece.
create schema if not exists private;
create or replace function private.project_studio_summary(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.project_id::text, x.data), '{}'::jsonb)
  from (
    select p.project_id,
      jsonb_build_object(
        'pages', count(*),
        'drafts', count(*) filter (where p.status = 'rascunho'),
        'in_review', count(*) filter (where p.status = 'em_revisao'),
        'approved', count(*) filter (where p.status = 'aprovada'),
        'published', count(*) filter (where p.status = 'publicada'),
        'pending', coalesce(sum(p.pending_count), 0),
        'avg_quality', round(avg(p.quality_score))::int,
        'last_published_at', max(p.published_at)
      ) as data
    from public.studio_pages p
    where p.organization_id = p_org
    group by p.project_id
  ) x
$$;
create or replace function public.project_studio_summary(p_org uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.project_studio_summary(p_org); $$;

-- 7) Quais tabelas de outros módulos existem (o Estúdio só lê o que existe; nada quebra se o Radar ainda não estiver instalado).
create or replace function private.studio_optional_tables()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(t, to_regclass('public.' || t) is not null)
  from unnest(array[
    'project_focuses', 'radar_pages', 'radar_site_scans', 'radar_identities', 'radar_map_listings', 'radar_scores', 'radar_competitors', 'geo_places',
    'project_taxonomy_nodes', 'project_geo_scope', 'market_queries', 'market_serp_results', 'market_competitors',
    'nexus_citations', 'index_urls', 'index_keys', 'project_profile_extended', 'module_image_policies', 'module_image_assets', 'nexus_search_performance'
  ]) as t
$$;
create or replace function public.studio_optional_tables()
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.studio_optional_tables(); $$;

revoke all on function private.project_studio_summary(uuid), public.project_studio_summary(uuid), private.studio_optional_tables(), public.studio_optional_tables() from public, anon, authenticated;
grant execute on function private.project_studio_summary(uuid), public.project_studio_summary(uuid), private.studio_optional_tables(), public.studio_optional_tables() to service_role;
