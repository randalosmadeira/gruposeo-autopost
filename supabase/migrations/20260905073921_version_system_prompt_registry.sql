-- Registry canônico e versionado de prompts do Zica.ai.
-- Migração aditiva e compatível com os templates existentes.

alter table public.prompt_templates
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists version integer not null default 1,
  add column if not exists is_active boolean not null default true,
  add column if not exists agent_type text,
  add column if not exists context_rules jsonb not null default '{}'::jsonb,
  add column if not exists output_schema jsonb not null default '{}'::jsonb,
  add column if not exists source text not null default 'database';

alter table public.prompt_templates
  drop constraint if exists prompt_templates_version_positive,
  drop constraint if exists prompt_templates_context_rules_object,
  drop constraint if exists prompt_templates_output_schema_object;

alter table public.prompt_templates
  add constraint prompt_templates_version_positive check (version > 0),
  add constraint prompt_templates_context_rules_object check (jsonb_typeof(context_rules) = 'object'),
  add constraint prompt_templates_output_schema_object check (jsonb_typeof(output_schema) = 'object');

create unique index if not exists prompt_templates_global_name_unique
  on public.prompt_templates (user_id, name)
  where project_id is null;

create unique index if not exists prompt_templates_project_name_unique
  on public.prompt_templates (user_id, project_id, name)
  where project_id is not null;

create index if not exists prompt_templates_runtime_lookup
  on public.prompt_templates (user_id, project_id, target_function, is_active, updated_at desc);

create table if not exists public.prompt_template_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_template_id uuid not null references public.prompt_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  version integer not null,
  prompt text not null,
  agent_name text,
  agent_type text,
  target_function text,
  context_rules jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null,
  created_at timestamptz not null default now(),
  unique (prompt_template_id, version)
);

alter table public.prompt_template_versions enable row level security;

drop policy if exists "Users can create their own templates" on public.prompt_templates;
create policy "Users can create their own templates"
  on public.prompt_templates for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own templates" on public.prompt_templates;
create policy "Users can view their own templates"
  on public.prompt_templates for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own templates" on public.prompt_templates;
create policy "Users can update their own templates"
  on public.prompt_templates for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own templates" on public.prompt_templates;
create policy "Users can delete their own templates"
  on public.prompt_templates for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users view own prompt history" on public.prompt_template_versions;
create policy "Users view own prompt history"
  on public.prompt_template_versions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own prompt history" on public.prompt_template_versions;
create policy "Users insert own prompt history"
  on public.prompt_template_versions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.version_prompt_template()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_prompt_template()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.prompt_template_versions (
    prompt_template_id, user_id, project_id, name, version, prompt,
    agent_name, agent_type, target_function, context_rules, output_schema, is_active
  ) values (
    new.id, new.user_id, new.project_id, new.name, new.version, new.prompt,
    new.agent_name, new.agent_type, new.target_function, new.context_rules, new.output_schema, new.is_active
  )
  on conflict (prompt_template_id, version) do nothing;
  return new;
end;
$$;

drop trigger if exists prompt_templates_set_version on public.prompt_templates;
create trigger prompt_templates_set_version
before update of prompt, agent_name, agent_type, target_function, context_rules, output_schema, is_active
on public.prompt_templates
for each row execute function public.version_prompt_template();

drop trigger if exists prompt_templates_snapshot on public.prompt_templates;
create trigger prompt_templates_snapshot
after insert or update of prompt, agent_name, agent_type, target_function, context_rules, output_schema, is_active
on public.prompt_templates
for each row execute function public.snapshot_prompt_template();

insert into public.prompt_template_versions (
  prompt_template_id, user_id, project_id, name, version, prompt,
  agent_name, agent_type, target_function, context_rules, output_schema, is_active, created_at
)
select
  id, user_id, project_id, name, version, prompt,
  agent_name, agent_type, target_function, context_rules, output_schema, is_active, updated_at
from public.prompt_templates
on conflict (prompt_template_id, version) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wordpress_operations'
  ) then
    alter publication supabase_realtime add table public.wordpress_operations;
  end if;
end;
$$;
