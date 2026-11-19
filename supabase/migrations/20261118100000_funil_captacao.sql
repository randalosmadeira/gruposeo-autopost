-- Funil de captação com números (módulo M1), por projeto. Aditiva e reversível (supabase/rollbacks/20261118100000_funil_captacao_rollback.sql).
-- Não altera nenhuma tabela existente. Reaproveita profile_touch() e profile_assert_project_org() do Perfil do Projeto (P1).
-- Acesso: RLS ligada e nenhum grant para anon/authenticated; a única porta é a função de borda `funnel` (chave de serviço),
-- que confere participação na organização e papel (leitura: qualquer membro; escrita: dono, administrador e editor).
-- Limites, preços e cobrança ficam para a fase final (decisão de 16/11/2026).

-- Definição do funil: um por projeto. As etapas, colunas e indicadores ficam em `config` (validado pela função; modelo em funnel-core.ts).
create table if not exists public.project_funnels (
  project_id uuid primary key references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template text not null check (template ~ '^[a-z][a-z0-9-]{1,30}$'),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  version integer not null default 1 check (version >= 1),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_funnels_org_idx on public.project_funnels (organization_id);
create index if not exists project_funnels_updated_by_idx on public.project_funnels (updated_by);

-- Números mensais: uma linha por projeto, mês e indicador. `source` deixa o caminho aberto para conectores (CRM, GA4) sem mudar a tabela.
create table if not exists public.project_funnel_entries (
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  value numeric(14,2) not null check (value >= 0 and value <= 1000000000),
  source text not null default 'manual' check (source in ('manual', 'import', 'auto')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, month, metric_key)
);
create index if not exists project_funnel_entries_org_idx on public.project_funnel_entries (organization_id);
create index if not exists project_funnel_entries_updated_by_idx on public.project_funnel_entries (updated_by);
create index if not exists project_funnel_entries_month_idx on public.project_funnel_entries (project_id, month desc);

do $$
declare t text;
begin
  foreach t in array array['project_funnels', 'project_funnel_entries'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.profile_touch()', t || '_touch', t);
    execute format('drop trigger if exists %I on public.%I', t || '_org', t);
    execute format('create trigger %I before insert or update of project_id, organization_id on public.%I for each row execute function public.profile_assert_project_org()', t || '_org', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
