-- Perfil do Projeto, marco P1 (dados).
-- APLICADA EM PRODUÇÃO em 15/11/2026 (~21:11 UTC) com o "pode" do dono, via apply_migration; versão registrada: 20261115211110 (nome perfil_projeto_p1).
-- Testada antes no branch Supabase "perfil-p1-2026-11-15" (apagado). Não reaplicar. Reversão: supabase/rollbacks/20261115211110_perfil_projeto_p1_down.sql.
--
-- Estritamente ADITIVA: nenhuma coluna, tabela ou política existente é alterada ou removida. As únicas mudanças em objetos que já
-- existem são (1) ampliar a lista de tipos aceitos em nexus_operations.kind e (2) ampliar a lista de tipos aceitos em
-- private.nexus_reserve_operation. As duas listas passam a incluir TAMBÉM os tipos do futuro Radar de Prospecção, para uma migração
-- futura não desfazer esta (o teto de custo de cada tipo NÃO é definido aqui: sem teto, a reserva responde pricing_not_configured).
--
-- Regras de acesso: toda ESCRITA passa pelas funções de borda (service_role). O cliente (authenticated) só LÊ, e só o que a sua
-- organização pode ver. Dados financeiros e de metas ficam em tabela própria, legível só por dono e administrador.
-- Upload: bucket privado, pasta <organization_id>/<project_id>/<arquivo>.

begin;

-- ------------------------------------------------------------------------------------------------------------------ utilidades
create or replace function public.profile_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- o projeto precisa pertencer à mesma organização da linha
create or replace function public.profile_assert_project_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'project_not_in_organization';
  end if;
  return new;
end $$;
revoke all on function public.profile_assert_project_org() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------------ perfil estendido (seções novas, não sensíveis)
create table public.project_profile_extended (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schema_version integer not null default 2 check (schema_version >= 1),
  version integer not null default 1 check (version >= 1),
  sections jsonb not null default '{}'::jsonb check (jsonb_typeof(sections) = 'object'),
  completeness smallint not null default 0 check (completeness between 0 and 100),
  status text not null default 'draft' check (status in ('draft','confirmed')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.project_profile_extended (organization_id);

-- ------------------------------------------------------------------------------------------------------------------ dados privados (financeiro e metas): só dono e administrador
create table public.project_profile_private (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  finance jsonb not null default '{}'::jsonb check (jsonb_typeof(finance) = 'object'),
  goals jsonb not null default '{}'::jsonb check (jsonb_typeof(goals) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.project_profile_private (organization_id);

-- ------------------------------------------------------------------------------------------------------------------ fatos: cada dado com origem, confiança e confirmação
create table public.project_profile_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  field_key text not null check (length(field_key) between 2 and 80),
  value jsonb not null,
  is_private boolean not null default false,
  source text not null check (source in ('user','agent','site','cnpj','cep','dns','rdap','maps','import','system')),
  confidence numeric(3,2) not null default 0.50 check (confidence between 0 and 1),
  evidence_url text check (evidence_url is null or length(evidence_url) <= 500),
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  run_id uuid,
  observed_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz
);
create index on public.project_profile_facts (project_id, field_key, observed_at desc);
create index on public.project_profile_facts (organization_id);
create index on public.project_profile_facts (project_id) where status = 'suggested';

-- ------------------------------------------------------------------------------------------------------------------ conversa com a Zica
create table public.project_profile_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  started_by uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'text' check (channel in ('text','voice')),
  consent_audio boolean not null default false,
  consent_at timestamptz,
  status text not null default 'open' check (status in ('open','closed','deleted')),
  -- retenção padrão conservadora (180 dias) até a decisão D3 do dono; null = guardar até pedido de exclusão
  retention_until timestamptz default (now() + interval '180 days'),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint profile_conv_consent check (not consent_audio or consent_at is not null)
);
create index on public.project_profile_conversations (project_id, created_at desc);
create index on public.project_profile_conversations (organization_id);
create index on public.project_profile_conversations (retention_until) where status <> 'deleted';

create table public.project_profile_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.project_profile_conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('user','agent','system')),
  content text not null check (length(content) between 1 and 8000),
  extracted jsonb not null default '{}'::jsonb check (jsonb_typeof(extracted) = 'object'),
  model text,
  cost_usd_micros bigint not null default 0 check (cost_usd_micros >= 0),
  created_at timestamptz not null default now()
);
create index on public.project_profile_messages (conversation_id, created_at);
create index on public.project_profile_messages (organization_id);

-- ------------------------------------------------------------------------------------------------------------------ ativos enviados (manual da marca, logo, prints)
create table public.project_profile_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('brand_manual','logo','screenshot','document','other')),
  storage_bucket text not null default 'project-profile-uploads',
  storage_path text not null check (length(storage_path) between 10 and 400),
  original_name text check (original_name is null or length(original_name) <= 200),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg','image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','rejected')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);
create index on public.project_profile_assets (project_id, kind);
create index on public.project_profile_assets (organization_id);

-- ------------------------------------------------------------------------------------------------------------------ versões (sem o financeiro)
create table public.project_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  reason text check (reason is null or length(reason) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);
create index on public.project_profile_snapshots (organization_id);

-- ------------------------------------------------------------------------------------------------------------------ módulos
create table public.module_catalog (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  description text,
  route text,
  core boolean not null default false,
  default_enabled boolean not null default true,
  sort integer not null default 0
);

create table public.project_modules (
  project_id uuid not null references public.projects(id) on delete cascade,
  module_code text not null references public.module_catalog(code) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enabled boolean not null,
  recommendation text check (recommendation is null or recommendation in ('manter','ativar','revisar','desativar','opcional')),
  recommendation_reason text check (recommendation_reason is null or length(recommendation_reason) <= 500),
  reason text check (reason is null or length(reason) <= 500),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, module_code)
);
create index on public.project_modules (organization_id);

insert into public.module_catalog (code, name, description, route, core, default_enabled, sort) values
  ('dashboard',          'Painel',                                'Visão geral do projeto',                         '/dashboard',            true,  true, 10),
  ('projects',           'Projetos e Perfil',                     'Cadastro do projeto e perfil da marca',          '/projects',             true,  true, 20),
  ('settings',           'Configurações',                         'Conta, integrações e preferências',              '/settings',             true,  true, 30),
  ('articles',           'Artigos',                               'Criação, edição e publicação de artigos',        '/articles',             false, true, 100),
  ('bulk_generator',     'Geração em massa',                      'Produção de muitos artigos de uma vez',          '/articles/bulk',        false, true, 110),
  ('content_calendar',   'Calendário editorial',                  'Planejamento e agenda de publicações',           '/calendar',             false, true, 120),
  ('authority_planner',  'Planejador de autoridade',              'Temas em que a marca quer ser referência',       '/authority-planner',    false, true, 130),
  ('internal_linking',   'Links internos',                        'Ligações entre conteúdos do próprio site',       '/internal-linking',     false, true, 140),
  ('topical_maps',       'Mapas de tópicos',                      'Cobertura temática do site',                     '/topical-maps',         false, true, 150),
  ('news_agents',        'Agentes de notícias',                   'Captação e curadoria de notícias',               '/news-agents',          false, false, 160),
  ('news_rewriter',      'Reescritor de notícias',                'Reescrita de notícias captadas',                 '/news-rewriter',        false, false, 170),
  ('ai_chat',            'Chat com IA',                           'Apoio de redação e análise',                     '/ai-chat',              false, true, 180),
  ('nexus_visibility',   'Nexus: visibilidade',                   'Presença da marca em buscadores e IAs',          '/nexus/visibilidade',   false, true, 200),
  ('nexus_observatory',  'Nexus: observatório',                   'Coletas e perguntas às IAs e à busca',           '/nexus/observatorio',   false, true, 210),
  ('nexus_intelligence', 'Nexus: inteligência',                   'Estratégia, concorrentes e prompts',             '/nexus-intelligence',   false, true, 220),
  ('nexus_providers',    'Nexus: motores',                        'Chaves, saúde e custo dos provedores',           '/nexus/motores',        false, true, 230),
  ('wordpress_plugin',   'Plugin WordPress',                      'Conexão e plugin do WordPress',                  '/wordpress-plugin',     false, false, 300),
  ('wordpress_monitor',  'Monitor do WordPress',                  'Saúde e estatísticas do site WordPress',         '/wordpress-monitor',    false, false, 310),
  ('local_seo',          'Google Meu Negócio e hiperlocal',       'Perfil local, avaliações e SEO hiperlocal',      '/auditoria-gbp',        false, false, 320),
  ('electoral_campaign', 'Campanha eleitoral e apoiadores',       'Portal de campanha, rede de portais e apoiadores','/electoral-campaign',   false, false, 400),
  ('academy',            'Academia',                              'Treinamento e ajuda',                            '/academia',             false, true, 900)
on conflict (code) do nothing;

-- ------------------------------------------------------------------------------------------------------------------ pente fino (análise completa)
create table public.project_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  request_key text not null check (length(request_key) between 8 and 120),
  level text not null default 'basico' check (level in ('basico','completo')),
  status text not null default 'queued' check (status in ('queued','running','done','partial','failed','cancelled')),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  cost_usd_micros bigint not null default 0 check (cost_usd_micros >= 0),
  error text check (error is null or length(error) <= 500),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, request_key)
);
create index on public.project_analysis_runs (project_id, created_at desc);
create index on public.project_analysis_runs (organization_id);

create table public.project_analysis_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.project_analysis_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  check_key text not null check (length(check_key) between 2 and 60),
  source text not null check (length(source) between 2 and 60),
  status text not null check (status in ('ok','warn','fail','skipped','error')),
  measured jsonb not null default '{}'::jsonb check (jsonb_typeof(measured) = 'object'),
  evidence_url text check (evidence_url is null or length(evidence_url) <= 500),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error text check (error is null or length(error) <= 500),
  created_at timestamptz not null default now()
);
create index on public.project_analysis_checks (run_id);
create index on public.project_analysis_checks (organization_id);

create table public.project_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.project_analysis_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  check_key text not null check (length(check_key) between 2 and 60),
  severity text not null check (severity in ('alta','media','baixa','info')),
  title text not null check (length(title) between 3 and 200),
  detail text check (detail is null or length(detail) <= 1500),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  suggested_action text check (suggested_action is null or length(suggested_action) <= 500),
  state text not null default 'open' check (state in ('open','applied','ignored')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.project_findings (run_id);
create index on public.project_findings (project_id, state);
create index on public.project_findings (organization_id);

-- ------------------------------------------------------------------------------------------------------------------ índices das chaves estrangeiras que faltavam (achado do verificador de desempenho no branch)
create index on public.project_analysis_checks (project_id);
create index on public.project_analysis_runs (requested_by);
create index on public.project_findings (decided_by);
create index on public.project_modules (decided_by);
create index on public.project_modules (module_code);
create index on public.project_profile_assets (created_by);
create index on public.project_profile_conversations (started_by);
create index on public.project_profile_extended (confirmed_by);
create index on public.project_profile_extended (updated_by);
create index on public.project_profile_facts (decided_by);
create index on public.project_profile_private (updated_by);
create index on public.project_profile_snapshots (created_by);

-- ------------------------------------------------------------------------------------------------------------------ gatilhos
do $$
declare t text;
begin
  foreach t in array array['project_profile_extended','project_profile_private','project_modules'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.profile_touch()', t || '_touch', t);
  end loop;
  foreach t in array array['project_profile_extended','project_profile_private','project_profile_facts','project_profile_conversations','project_profile_assets','project_profile_snapshots','project_modules','project_analysis_runs','project_analysis_checks','project_findings'] loop
    execute format('create trigger %I before insert or update of project_id, organization_id on public.%I for each row execute function public.profile_assert_project_org()', t || '_org', t);
  end loop;
end $$;

-- ------------------------------------------------------------------------------------------------------------------ acesso (RLS): o cliente só LÊ; toda escrita é pela função de borda
do $$
declare t text;
begin
  foreach t in array array['project_profile_extended','project_profile_private','project_profile_facts','project_profile_conversations','project_profile_messages','project_profile_assets','project_profile_snapshots','module_catalog','project_modules','project_analysis_runs','project_analysis_checks','project_findings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

create policy module_catalog_read on public.module_catalog for select to authenticated using (true);
create policy project_profile_extended_read on public.project_profile_extended for select to authenticated using (public.is_organization_member(organization_id));
create policy project_profile_private_read on public.project_profile_private for select to authenticated using (public.has_organization_role(organization_id, array['owner','admin']));
create policy project_profile_facts_read on public.project_profile_facts for select to authenticated
  using (public.is_organization_member(organization_id) and (not is_private or public.has_organization_role(organization_id, array['owner','admin'])));
-- conversa: quem a abriu, dono e administrador
create policy project_profile_conversations_read on public.project_profile_conversations for select to authenticated
  using (started_by = (select auth.uid()) or public.has_organization_role(organization_id, array['owner','admin']));
create policy project_profile_messages_read on public.project_profile_messages for select to authenticated
  using (exists (select 1 from public.project_profile_conversations c
                  where c.id = conversation_id and (c.started_by = (select auth.uid()) or public.has_organization_role(c.organization_id, array['owner','admin']))));
create policy project_profile_assets_read on public.project_profile_assets for select to authenticated using (public.is_organization_member(organization_id));
create policy project_profile_snapshots_read on public.project_profile_snapshots for select to authenticated using (public.is_organization_member(organization_id));
create policy project_modules_read on public.project_modules for select to authenticated using (public.is_organization_member(organization_id));
create policy project_analysis_runs_read on public.project_analysis_runs for select to authenticated using (public.is_organization_member(organization_id));
create policy project_analysis_checks_read on public.project_analysis_checks for select to authenticated using (public.is_organization_member(organization_id));
create policy project_findings_read on public.project_findings for select to authenticated using (public.is_organization_member(organization_id));

grant select on public.module_catalog, public.project_profile_extended, public.project_profile_private, public.project_profile_facts,
  public.project_profile_conversations, public.project_profile_messages, public.project_profile_assets, public.project_profile_snapshots,
  public.project_modules, public.project_analysis_runs, public.project_analysis_checks, public.project_findings to authenticated;

-- ------------------------------------------------------------------------------------------------------------------ armazenamento (bucket privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-profile-uploads', 'project-profile-uploads', false, 26214400,
        array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- A pasta de topo do arquivo é o id da organização. A checagem usa as funções seguras is_organization_member e has_organization_role
-- (o papel authenticated NÃO precisa de acesso direto a organization_members; achado no teste do branch: consultar a tabela direto
-- negava tudo no branch e só funcionaria em produção por causa de uma concessão que não está no Git).
create or replace function public.profile_storage_org(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare v text := (string_to_array(coalesce(p_name, ''), '/'))[1];
begin
  if v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return v::uuid; end if;
  return null;
end $$;

drop policy if exists project_profile_uploads_member_select on storage.objects;
create policy project_profile_uploads_member_select on storage.objects for select to authenticated
using (bucket_id = 'project-profile-uploads' and public.profile_storage_org(name) is not null
       and public.is_organization_member(public.profile_storage_org(name)));

-- enviar: dono, administrador e editor (visualizador só lê)
drop policy if exists project_profile_uploads_member_insert on storage.objects;
create policy project_profile_uploads_member_insert on storage.objects for insert to authenticated
with check (bucket_id = 'project-profile-uploads' and public.profile_storage_org(name) is not null
            and public.has_organization_role(public.profile_storage_org(name), array['owner','admin','editor']));

drop policy if exists project_profile_uploads_admin_delete on storage.objects;
create policy project_profile_uploads_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'project-profile-uploads' and public.profile_storage_org(name) is not null
       and public.has_organization_role(public.profile_storage_org(name), array['owner','admin']));

-- ------------------------------------------------------------------------------------------------------------------ custo: ampliar as listas existentes (fusão Perfil + Radar)
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.nexus_operations'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%ai_observation%';
  if c is not null then execute format('alter table public.nexus_operations drop constraint %I', c); end if;
  alter table public.nexus_operations add constraint nexus_operations_kind_check
    check (kind in ('serp','ai_observation','editorial_review','pilot','prospect_search','prospect_enrich','profile_agent','profile_analyze'));
end $$;

create or replace function private.nexus_reserve_operation(p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare op public.nexus_operations; program public.nexus_programs; ceiling bigint;
begin
  select * into op from public.nexus_operations where id = p_operation;
  if op.id is null then raise exception 'operation_not_found'; end if;
  if op.kind not in ('serp','ai_observation','prospect_search','prospect_enrich','profile_agent','profile_analyze') then raise exception 'global_paid_services_blocked'; end if;
  select * into program from public.nexus_programs where organization_id = op.organization_id for update;
  select * into op from public.nexus_operations where id = p_operation for update;
  if op.status <> 'prepared' then raise exception 'operation_already_claimed'; end if;
  if program.organization_id is null or not program.execution_enabled or program.budget_usd_micros = 0 then raise exception 'budget_paused'; end if;
  ceiling := (program.settings -> 'cost_ceilings_usd_micros' ->> op.kind)::bigint;
  if ceiling is null or ceiling <= 0 or nullif(program.settings ->> 'pricing_verified_at', '') is null then raise exception 'pricing_not_configured'; end if;
  if program.reserved_usd_micros + program.consumed_usd_micros + ceiling > program.budget_usd_micros then raise exception 'budget_exceeded'; end if;
  update public.nexus_programs set reserved_usd_micros = reserved_usd_micros + ceiling, updated_at = now() where organization_id = op.organization_id;
  update public.nexus_operations set status = 'reserved', reserved_usd_micros = ceiling, updated_at = now() where id = op.id;
  return jsonb_build_object('reserved', ceiling);
end $$;

commit;
