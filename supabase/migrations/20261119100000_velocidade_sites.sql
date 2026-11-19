-- Velocidade e Core Web Vitals (módulo F1), por projeto. Aditiva e reversível (supabase/rollbacks/20261119100000_velocidade_sites_rollback.sql).
-- Guarda cada medição (laboratório do Lighthouse + dados reais do CrUX quando existirem) para histórico e comparação.
-- Reaproveita profile_assert_project_org() do Perfil do Projeto. Acesso: RLS ligada e nenhum grant para anon/authenticated;
-- a única porta é a função de borda `site-speed` (chave de serviço), que confere participação na organização e papel.
-- A chave do Google fica só como segredo da função: nunca chega ao navegador nem a esta tabela.

create table if not exists public.project_speed_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null check (char_length(url) between 8 and 500),
  host text not null check (char_length(host) between 3 and 200),
  kind text not null default 'own' check (kind in ('own', 'competitor')),
  strategy text not null check (strategy in ('mobile', 'desktop')),
  performance_score smallint check (performance_score is null or performance_score between 0 and 100),
  lcp_ms integer check (lcp_ms is null or lcp_ms >= 0),
  cls numeric(7,3) check (cls is null or cls >= 0),
  tbt_ms integer check (tbt_ms is null or tbt_ms >= 0),
  fcp_ms integer check (fcp_ms is null or fcp_ms >= 0),
  ttfb_ms integer check (ttfb_ms is null or ttfb_ms >= 0),
  speed_index_ms integer check (speed_index_ms is null or speed_index_ms >= 0),
  field jsonb check (field is null or jsonb_typeof(field) = 'object'),
  lighthouse_version text check (lighthouse_version is null or char_length(lighthouse_version) <= 20),
  requested_by uuid references auth.users(id) on delete set null,
  fetched_at timestamptz not null default now()
);
create index if not exists project_speed_runs_project_idx on public.project_speed_runs (project_id, url, strategy, fetched_at desc);
create index if not exists project_speed_runs_org_idx on public.project_speed_runs (organization_id);
create index if not exists project_speed_runs_requested_by_idx on public.project_speed_runs (requested_by);

drop trigger if exists project_speed_runs_org on public.project_speed_runs;
create trigger project_speed_runs_org before insert or update of project_id, organization_id on public.project_speed_runs for each row execute function public.profile_assert_project_org();
alter table public.project_speed_runs enable row level security;
revoke all on table public.project_speed_runs from public, anon, authenticated;
grant all on table public.project_speed_runs to service_role;
